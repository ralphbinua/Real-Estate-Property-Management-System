from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import mixins, permissions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from contracts.models import Contract
from users.audit import record_activity

from .models import Invoice, Payment
from .serializers import InvoiceSerializer, PaymentSerializer
from .services import generate_monthly_invoices


class IsAdminOrPropertyManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager')
        )


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role == 'Admin'
        )


class IsTenant(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role == 'Tenant'
        )


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        invoices = Invoice.objects.filter(
            Q(is_deleted=False) | Q(payments__isnull=False),
        ).distinct().prefetch_related('payments')
        if user.role == 'Admin':
            pass
        elif user.role == 'Property Manager':
            invoices = invoices.filter(property__manager=user)
        elif user.role == 'Owner':
            invoices = invoices.filter(property__owner=user)
        elif user.role == 'Tenant':
            invoices = invoices.filter(tenant=user)
        else:
            return invoices.none()

        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id and user.role in ('Admin', 'Property Manager'):
            invoices = invoices.filter(tenant_id=tenant_id)
        return invoices.order_by('-id')

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdmin()]
        if self.action == 'generate':
            return [IsAdminOrPropertyManager()]
        if self.action == 'tenant':
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def tenant(self, request):
        if request.user.role == 'Tenant':
            tenant_id = request.user.id
        elif request.user.role in ('Admin', 'Property Manager'):
            tenant_id = request.query_params.get('tenantId')
            if not tenant_id:
                return Response({'detail': 'tenantId is required.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({'detail': 'You may not view tenant invoices.'}, status=status.HTTP_403_FORBIDDEN)

        invoices = Invoice.objects.filter(
            tenant_id=tenant_id,
        ).prefetch_related('payments').order_by('-id')
        invoices = invoices.filter(Q(is_deleted=False) | Q(payments__isnull=False)).distinct()
        if request.user.role == 'Property Manager':
            invoices = invoices.filter(property__manager=request.user)
        serializer = self.get_serializer(invoices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='run-monthly-billing')
    def generate(self, request):
        active_contracts = Contract.objects.filter(status='Active', is_deleted=False)
        if request.user.role == 'Property Manager':
            active_contracts = active_contracts.filter(property__manager=request.user)
        created_count = generate_monthly_invoices(contract_queryset=active_contracts)

        record_activity(request.user, 'GENERATE', 'Invoices', '', f'Generated {created_count} monthly rent invoices.')
        return Response({
            'message': f'Generated {created_count} new monthly rent invoices.',
            'generatedCount': created_count,
        })

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        visible_invoice = self.get_object()
        with transaction.atomic():
            invoice = Invoice.objects.select_for_update().get(pk=visible_invoice.pk)
            if invoice.is_deleted:
                raise serializers.ValidationError({
                    'detail': 'Archived invoices are read-only.'
                })
            serializer = self.get_serializer(invoice, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)

    def perform_destroy(self, instance):
        with transaction.atomic():
            invoice = Invoice.objects.select_for_update().get(pk=instance.pk)
            if invoice.payments.exists():
                raise serializers.ValidationError({
                    'detail': 'Invoices with payment history cannot be archived. Keep this invoice in the financial ledger.'
                })
            invoice.is_deleted = True
            invoice.save(update_fields=['is_deleted'])
            record_activity(self.request.user, 'ARCHIVE', 'Invoice', invoice.pk, f'Archived invoice {invoice.pk}.')

    def perform_create(self, serializer):
        invoice = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Invoice', invoice.pk, f'Created invoice {invoice.pk}.')

    def perform_update(self, serializer):
        invoice = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Invoice', invoice.pk, f'Updated invoice {invoice.pk}.')


class PaymentViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = PaymentSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        payments = Payment.objects.select_related(
            'created_by', 'verified_by', 'rejected_by', 'reversed_by',
            'invoice', 'invoice__tenant', 'invoice__property',
        ).prefetch_related('invoice__payments')
        if user.role == 'Admin':
            pass
        elif user.role == 'Property Manager':
            payments = payments.filter(invoice__property__manager=user)
        elif user.role == 'Owner':
            payments = payments.filter(invoice__property__owner=user)
        elif user.role == 'Tenant':
            payments = payments.filter(invoice__tenant=user)
        else:
            return payments.none()

        invoice_id = self.request.query_params.get('invoiceId')
        if invoice_id:
            payments = payments.filter(invoice_id=invoice_id)
        payment_status = self.request.query_params.get('status')
        if payment_status:
            payments = payments.filter(status=payment_status)
        return payments.order_by('-created_at', '-id')

    def get_permissions(self):
        if self.action == 'create':
            return [IsTenant()]
        if self.action in ('record', 'verify', 'reject', 'reverse'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        return self._create_payment(request, direct_record=False)

    @action(detail=False, methods=['post'], url_path='record')
    def record(self, request):
        return self._create_payment(request, direct_record=True)

    def _create_payment(self, request, direct_record):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        invoice_id = data['invoice'].pk

        with transaction.atomic():
            invoice = Invoice.objects.select_for_update().select_related(
                'tenant', 'property',
            ).filter(pk=invoice_id, is_deleted=False).first()
            if invoice is None:
                return Response({'detail': 'Invoice not found.'}, status=status.HTTP_404_NOT_FOUND)
            self._assert_mutation_scope(request.user, invoice)
            if invoice.status == 'Cancelled':
                raise serializers.ValidationError({'invoice': 'A cancelled invoice cannot receive payments.'})

            balance_due = self._balance_due(invoice)
            amount = data['amount']
            if balance_due <= 0:
                raise serializers.ValidationError({'invoice': 'This invoice has no remaining balance.'})
            if amount > balance_due:
                raise serializers.ValidationError({
                    'amount': f'Amount cannot exceed the remaining balance of ₱{balance_due:.2f}.'
                })

            payment_values = {
                'invoice': invoice,
                'amount': amount,
                'payment_method': data['payment_method'],
                'payment_date': data['payment_date'],
                'reference_number': data.get('reference_number', ''),
                'receipt_url': data.get('receipt_url', ''),
                'remarks': data.get('remarks', ''),
                'created_by': request.user,
            }
            if direct_record:
                payment_values.update({
                    'status': Payment.Status.VERIFIED,
                    'verified_by': request.user,
                    'verified_at': timezone.now(),
                })
            payment = Payment.objects.create(**payment_values)
            record_activity(
                request.user,
                'RECORD PAYMENT' if direct_record else 'SUBMIT PAYMENT',
                'Payment',
                payment.pk,
                f"{'Recorded' if direct_record else 'Submitted'} ₱{payment.amount:.2f} for invoice {invoice.pk}.",
            )

        return Response(self.get_serializer(payment).data, status=status.HTTP_201_CREATED)

    def _balance_due(self, invoice):
        paid_total = Payment.objects.filter(
            invoice=invoice,
            status=Payment.Status.VERIFIED,
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        return max(invoice.total_due - paid_total, Decimal('0.00'))

    def _assert_mutation_scope(self, user, invoice):
        if user.role == 'Admin':
            return
        if user.role == 'Tenant' and invoice.tenant_id == user.pk:
            return
        if user.role == 'Property Manager' and invoice.property.manager_id == user.pk:
            return
        raise PermissionDenied('You may not change payments for this invoice.')

    def _locked_payment(self, pk):
        visible_payment = self.get_object()
        invoice = Invoice.objects.select_for_update().select_related('property').get(pk=visible_payment.invoice_id)
        payment = Payment.objects.select_for_update().get(pk=visible_payment.pk)
        self._assert_mutation_scope(self.request.user, invoice)
        return invoice, payment

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        with transaction.atomic():
            invoice, payment = self._locked_payment(pk)
            if payment.status != Payment.Status.PENDING_VERIFICATION:
                raise serializers.ValidationError({'detail': 'Only payments awaiting verification can be verified.'})
            if invoice.is_deleted:
                raise serializers.ValidationError({
                    'detail': 'This invoice is archived and cannot accept payment verification. Ask an administrator to correct its archive status.'
                })
            if invoice.status == 'Cancelled':
                raise serializers.ValidationError({'detail': 'A cancelled invoice cannot receive a verified payment.'})
            balance_due = self._balance_due(invoice)
            if payment.amount > balance_due:
                raise serializers.ValidationError({
                    'detail': f'This payment exceeds the current balance of ₱{balance_due:.2f}. Reject it or review the invoice.'
                })
            payment.status = Payment.Status.VERIFIED
            payment.verified_by = request.user
            payment.verified_at = timezone.now()
            payment.save(update_fields=['status', 'verified_by', 'verified_at'])
            record_activity(request.user, 'VERIFY PAYMENT', 'Payment', payment.pk, f'Verified payment for invoice {invoice.pk}.')
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        reason = str(request.data.get('reason', '')).strip()
        if not reason:
            raise serializers.ValidationError({'reason': 'Provide a reason for rejecting this payment.'})
        with transaction.atomic():
            invoice, payment = self._locked_payment(pk)
            if payment.status != Payment.Status.PENDING_VERIFICATION:
                raise serializers.ValidationError({'detail': 'Only payments awaiting verification can be rejected.'})
            payment.status = Payment.Status.REJECTED
            payment.rejected_by = request.user
            payment.rejected_at = timezone.now()
            payment.rejection_reason = reason
            payment.save(update_fields=['status', 'rejected_by', 'rejected_at', 'rejection_reason'])
            record_activity(request.user, 'REJECT PAYMENT', 'Payment', payment.pk, f'Rejected payment for invoice {invoice.pk}.')
        return Response(self.get_serializer(payment).data)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        reason = str(request.data.get('reason', '')).strip()
        if not reason:
            raise serializers.ValidationError({'reason': 'Provide a reason for reversing this payment.'})
        with transaction.atomic():
            invoice, payment = self._locked_payment(pk)
            if payment.status != Payment.Status.VERIFIED:
                raise serializers.ValidationError({'detail': 'Only verified payments can be reversed.'})
            payment.status = Payment.Status.REVERSED
            payment.reversed_by = request.user
            payment.reversed_at = timezone.now()
            payment.reversal_reason = reason
            payment.save(update_fields=['status', 'reversed_by', 'reversed_at', 'reversal_reason'])
            record_activity(request.user, 'REVERSE PAYMENT', 'Payment', payment.pk, f'Reversed payment for invoice {invoice.pk}.')
        return Response(self.get_serializer(payment).data)
