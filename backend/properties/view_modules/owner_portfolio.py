from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Exists, Prefetch, Q
from django.contrib.auth import get_user_model
from ..models import Property, Unit, UnitPriceChangeRequest
from ..serializers import PropertySerializer, UnitPriceChangeRequestSerializer
from ..querysets import property_serializer_queryset
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from maintenance.models import MaintenanceRequest
from maintenance.serializers import MaintenanceRequestSerializer
from users.models import AuditEvent
from core.pagination import OptInPageNumberPagination

User = get_user_model()


from .permissions import IsAdminOrOwner

class OwnerPortfolioView(APIView):
    permission_classes = [IsAdminOrOwner]

    def _section_response(self, request, response_key, queryset, serializer_class, context=None):
        paginator = OptInPageNumberPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        records = page if page is not None else queryset
        serializer_context = {'request': request} if context is None else context
        data = serializer_class(records, many=True, context=serializer_context).data
        if page is not None:
            data = paginator.get_paginated_response(data).data
        return Response({response_key: data})

    @staticmethod
    def _invoice_queryset(financial_property_ids):
        from billing.querysets import invoice_serializer_queryset
        from billing.models import Invoice, Payment
        from django.db.models import OuterRef
        has_payment = Payment.objects.filter(invoice_id=OuterRef('pk'))
        invoices = Invoice.objects.filter(
            property_id__in=financial_property_ids,
        ).annotate(_has_payment=Exists(has_payment)).filter(
            Q(is_deleted=False) | Q(_has_payment=True),
        ).order_by('-id')
        return invoice_serializer_queryset(invoices)

    @staticmethod
    def _summary(properties, property_ids, financial_property_ids):
        from decimal import Decimal
        from django.db.models import (
            Case, Count, DecimalField, Exists, F, IntegerField, OuterRef, Q, Subquery,
            Sum, Value, When,
        )
        from django.db.models.functions import Coalesce, Greatest
        from billing.models import Invoice, Payment

        money_field = DecimalField(max_digits=14, decimal_places=2)
        unit_totals = Unit.objects.filter(property_id__in=property_ids).aggregate(
            total=Count('id'),
            occupied=Count('id', filter=Q(status='Occupied')),
        )
        occupied_property_status = Q(status__iexact='occupied') | Q(status__iexact='rented')
        no_unit_properties = properties.annotate(unit_count=Count('units')).filter(unit_count=0)
        legacy_totals = no_unit_properties.aggregate(
            count=Count('id'),
            occupied=Count('id', filter=occupied_property_status),
        )

        active_contracts = Contract.objects.filter(
            property_id__in=property_ids,
            status__iexact='active',
            is_deleted=False,
        )
        active_contract_totals = active_contracts.aggregate(
            count=Count('id'),
            rent=Coalesce(
                Sum('rent_amount'),
                Value(Decimal('0.00')),
                output_field=money_field,
            ),
        )
        total_units = unit_totals['total'] + legacy_totals['count']
        occupied_units = unit_totals['occupied'] + legacy_totals['occupied']
        monthly_income = active_contract_totals['rent']

        verified_totals = Payment.objects.filter(
            invoice_id=OuterRef('pk'), status=Payment.Status.VERIFIED,
        ).order_by().values('invoice_id').annotate(total=Sum('amount')).values('total')[:1]
        pending_counts = Payment.objects.filter(
            invoice_id=OuterRef('pk'), status=Payment.Status.PENDING_VERIFICATION,
        ).order_by().values('invoice_id').annotate(total=Count('id')).values('total')[:1]
        has_payment = Payment.objects.filter(invoice_id=OuterRef('pk'))
        invoices = Invoice.objects.filter(
            property_id__in=financial_property_ids,
        ).annotate(_has_payment=Exists(has_payment)).filter(
            Q(is_deleted=False) | Q(_has_payment=True),
        ).annotate(
            verified_amount=Coalesce(
                Subquery(verified_totals, output_field=money_field),
                Value(Decimal('0.00')),
                output_field=money_field,
            ),
            pending_count=Coalesce(
                Subquery(pending_counts, output_field=IntegerField()),
                Value(0),
                output_field=IntegerField(),
            ),
        )
        from billing.querysets import with_effective_invoice_status
        invoices = with_effective_invoice_status(invoices)
        zero = Value(Decimal('0.00'), output_field=money_field)
        invoice_totals = invoices.aggregate(
            pendingInvoices=Count('id', filter=Q(_effective_invoice_status__in=['Pending', 'Partially Paid', 'Overdue'])),
            invoiced=Coalesce(
                Sum(Case(
                    When(status='Cancelled', then=zero),
                    default=F('total_due'),
                    output_field=money_field,
                )),
                zero,
                output_field=money_field,
            ),
            collected=Coalesce(Sum('verified_amount'), zero, output_field=money_field),
            outstanding=Coalesce(
                Sum(Case(
                    When(status='Cancelled', then=zero),
                    default=Greatest(F('total_due') - F('verified_amount'), zero),
                    output_field=money_field,
                )),
                zero,
                output_field=money_field,
            ),
            pending=Coalesce(Sum('pending_count'), Value(0), output_field=IntegerField()),
        )
        return {
            'totalOwned': properties.count(),
            'totalUnits': total_units,
            'occupiedUnits': occupied_units,
            'occupancyRate': round(occupied_units / total_units * 100) if total_units else 0,
            'totalMonthlyIncome': monthly_income,
            'activeLeasesCount': active_contract_totals['count'],
            'activeLeasesRent': active_contract_totals['rent'],
            'rentInvoiced': invoice_totals['invoiced'],
            'rentCollected': invoice_totals['collected'],
            'outstandingBalance': invoice_totals['outstanding'],
            'paymentsAwaitingReview': invoice_totals['pending'],
            'pendingInvoices': invoice_totals['pendingInvoices'],
        }

    def get(self, request):
        user = request.user
        if user.role == 'Owner':
            properties = Property.objects.filter(owner=user, is_deleted=False)
        else:
            properties = Property.objects.filter(is_deleted=False)

        property_ids = properties.values_list('id', flat=True)
        if user.role == 'Owner':
            financial_property_ids = Property.objects.filter(owner=user).values_list('id', flat=True)
        else:
            financial_property_ids = Property.objects.values_list('id', flat=True)
        section = request.query_params.get('section')
        sections = {'overview', 'properties', 'pricing', 'contracts', 'history', 'maintenance', 'payments'}
        if section and section not in sections:
            return Response({'detail': 'Unknown Owner portfolio section.'}, status=status.HTTP_400_BAD_REQUEST)
        if section == 'overview':
            return Response({'summary': self._summary(properties, property_ids, financial_property_ids)})
        if section == 'properties':
            return self._section_response(
                request, 'properties', property_serializer_queryset(properties.order_by('-id')),
                PropertySerializer,
            )
        if section == 'contracts':
            rows = Contract.objects.filter(property_id__in=property_ids, is_deleted=False).select_related(
                'tenant', 'unit', 'unit__tenant', 'activated_by', 'terminated_by',
            ).prefetch_related(
                Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
            ).order_by('-id')
            return self._section_response(request, 'contracts', rows, ContractSerializer)
        if section == 'maintenance':
            rows = MaintenanceRequest.objects.filter(
                property_id__in=property_ids, is_deleted=False,
            ).select_related('unit', 'tenant').prefetch_related(
                Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
            ).order_by('-id')
            return self._section_response(request, 'maintenanceRequests', rows, MaintenanceRequestSerializer)
        if section == 'payments':
            from billing.serializers import InvoiceSerializer
            return self._section_response(
                request, 'invoices', self._invoice_queryset(financial_property_ids), InvoiceSerializer,
                context={},
            )
        if section == 'pricing':
            rows = UnitPriceChangeRequest.objects.select_related(
                'property', 'unit', 'proposed_by', 'decided_by',
            ).filter(property_id__in=property_ids).order_by('-created_at', '-id')
            return self._section_response(request, 'rentChangeRequests', rows, UnitPriceChangeRequestSerializer)
        if section == 'history':
            contract_ids = Contract.objects.filter(
                property_id__in=property_ids, is_deleted=False,
            ).values_list('id', flat=True)
            property_id_strings = [str(property_id) for property_id in property_ids]
            contract_id_strings = [str(contract_id) for contract_id in contract_ids]
            history_actions = {
                'approval': ['CHANGE APPLICATION APPROVAL RULE'],
                'pricing': [
                    'PROPOSE RENT CHANGE', 'APPROVED RENT CHANGE', 'REJECTED RENT CHANGE',
                    'CANCEL STALE RENT CHANGE',
                ],
                'authority': [
                    'GRANT LEASE SIGNING AUTHORITY', 'REVOKE LEASE SIGNING AUTHORITY',
                    'GRANT LEASE TERMINATION AUTHORITY', 'REVOKE LEASE TERMINATION AUTHORITY',
                    'GRANT RENT PRICING AUTHORITY', 'REVOKE RENT PRICING AUTHORITY',
                ],
                'lease': ['ACTIVATE', 'TERMINATE'],
            }
            requested_category = request.query_params.get('category')
            if requested_category and requested_category not in history_actions:
                return Response({'detail': 'Unknown portfolio history category.'}, status=status.HTTP_400_BAD_REQUEST)
            events = AuditEvent.objects.select_related('actor').filter(
                action__in=history_actions[requested_category] if requested_category else [
                    'GRANT LEASE SIGNING AUTHORITY', 'REVOKE LEASE SIGNING AUTHORITY',
                    'GRANT LEASE TERMINATION AUTHORITY', 'REVOKE LEASE TERMINATION AUTHORITY',
                    'GRANT RENT PRICING AUTHORITY', 'REVOKE RENT PRICING AUTHORITY',
                    'PROPOSE RENT CHANGE', 'APPROVED RENT CHANGE', 'REJECTED RENT CHANGE',
                    'CANCEL STALE RENT CHANGE', 'CHANGE APPLICATION APPROVAL RULE',
                    'ACTIVATE', 'TERMINATE',
                ],
            ).filter(
                Q(entity_type='Property', entity_id__in=property_id_strings)
                | Q(entity_type='Contract', entity_id__in=contract_id_strings)
            ).order_by('-created_at', '-id')[:100]
            history = [{
                'id': event.pk,
                'action': event.action,
                'entityType': event.entity_type,
                'entityId': event.entity_id,
                'summary': event.summary,
                'actor': event.actor.get_full_name() or event.actor.email if event.actor else 'System',
                'createdAt': event.created_at,
            } for event in events]
            paginator = OptInPageNumberPagination()
            page = paginator.paginate_queryset(history, request, view=self)
            return Response({
                'leaseSigningHistory': paginator.get_paginated_response(page).data if page is not None else history,
            })

        if section in (None, 'properties'):
            property_rows = property_serializer_queryset(properties.order_by('-id'))
            property_data = PropertySerializer(property_rows, many=True, context={'request': request}).data
        if section in (None, 'contracts'):
            contract_rows = Contract.objects.filter(property_id__in=property_ids, is_deleted=False).select_related(
                'tenant', 'unit', 'unit__tenant', 'activated_by', 'terminated_by',
            ).prefetch_related(
                Prefetch(
                    'property', queryset=property_serializer_queryset(Property.objects.all()),
                ),
            ).order_by('-id')
            contract_data = ContractSerializer(contract_rows, many=True, context={'request': request}).data
        if section in (None, 'maintenance'):
            maintenance_rows = MaintenanceRequest.objects.filter(
                property_id__in=property_ids, is_deleted=False,
            ).select_related('unit', 'tenant').prefetch_related(
                Prefetch(
                    'property', queryset=property_serializer_queryset(Property.objects.all()),
                ),
            ).order_by('-id')
            maintenance_data = MaintenanceRequestSerializer(
                maintenance_rows, many=True, context={'request': request},
            ).data
        if section in (None, 'payments'):
            from billing.serializers import InvoiceSerializer
            invoice_data = InvoiceSerializer(self._invoice_queryset(financial_property_ids), many=True).data
        if section in (None, 'pricing'):
            rent_change_rows = UnitPriceChangeRequest.objects.select_related(
                'property', 'unit', 'proposed_by', 'decided_by',
            ).filter(property_id__in=property_ids).order_by('-created_at')
            rent_change_data = UnitPriceChangeRequestSerializer(
                rent_change_rows, many=True, context={'request': request},
            ).data

        if section in (None, 'history'):
            contract_ids = Contract.objects.filter(
                property_id__in=property_ids, is_deleted=False,
            ).values_list('id', flat=True)
            property_id_strings = [str(property_id) for property_id in property_ids]
            contract_id_strings = [str(contract_id) for contract_id in contract_ids]
            signing_events = AuditEvent.objects.select_related('actor').filter(
                action__in=[
                    'GRANT LEASE SIGNING AUTHORITY',
                    'REVOKE LEASE SIGNING AUTHORITY',
                    'GRANT LEASE TERMINATION AUTHORITY',
                    'REVOKE LEASE TERMINATION AUTHORITY',
                    'GRANT RENT PRICING AUTHORITY',
                    'REVOKE RENT PRICING AUTHORITY',
                    'PROPOSE RENT CHANGE',
                    'APPROVED RENT CHANGE',
                    'REJECTED RENT CHANGE',
                    'CANCEL STALE RENT CHANGE',
                    'CHANGE APPLICATION APPROVAL RULE',
                    'ACTIVATE',
                    'TERMINATE',
                ],
            ).filter(
                Q(entity_type='Property', entity_id__in=property_id_strings)
                | Q(entity_type='Contract', entity_id__in=contract_id_strings)
            ).order_by('-created_at')[:100]
            history_data = [{
                'id': event.pk,
                'action': event.action,
                'entityType': event.entity_type,
                'entityId': event.entity_id,
                'summary': event.summary,
                'actor': (
                    event.actor.get_full_name() or event.actor.email
                    if event.actor else 'System'
                ),
                'createdAt': event.created_at,
            } for event in signing_events]

        if section == 'properties':
            return Response({'properties': property_data})
        if section == 'contracts':
            return Response({'contracts': contract_data})
        if section == 'history':
            return Response({'leaseSigningHistory': history_data})
        if section == 'maintenance':
            return Response({'maintenanceRequests': maintenance_data})
        if section == 'pricing':
            return Response({'rentChangeRequests': rent_change_data})
        if section == 'payments':
            return Response({'invoices': invoice_data})
        return Response({
            'properties': property_data,
            'contracts': contract_data,
            'maintenanceRequests': maintenance_data,
            'invoices': invoice_data,
            'rentChangeRequests': rent_change_data,
            'leaseSigningHistory': history_data,
        })
