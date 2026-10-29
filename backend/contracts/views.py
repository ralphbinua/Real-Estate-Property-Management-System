from rest_framework import viewsets, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Case, IntegerField, Prefetch, Q, Value, When
from django.db.models.functions import Lower
from django.utils import timezone
import os
from secrets import compare_digest
from .models import Contract, LeaseRenewal, LeaseInspection, DepositSettlement
from decimal import Decimal, InvalidOperation
from .serializers import ContractSerializer, LeaseTerminationSerializer
from .renewals import RenewalProposalInput, renewal_data, propose_renewal, decide_renewal, prepare_renewal
from .reminders import send_lease_expiry_reminders
from properties.models import (
    LeaseSigningAuthorization, LeaseTerminationAuthorization, Property, Unit,
    RentalApplication, RentalApplicationDecision,
)
from properties.querysets import property_serializer_queryset
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from core.csv_exports import csv_response
from core.cron_monitoring import report_cron_result
from notifications.models import Notification
from notifications.services import create_for_recipients


class IsAdminOrPropertyManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager')
        )


class IsTenant(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted and user.role == 'Tenant')


class IsOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted and user.role == 'Owner')


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def scheduled_lease_reminders(request):
    secret = os.environ.get('CRON_SECRET', '')
    if not secret or not compare_digest(request.headers.get('Authorization', ''), f'Bearer {secret}'):
        return Response({'detail': 'Unauthorized.'}, status=401)
    try:
        count = send_lease_expiry_reminders()
    except Exception:
        report_cron_result('lease_reminders', succeeded=False)
        raise
    report_cron_result('lease_reminders', succeeded=True)
    return Response({'sentCount': count})


class IsAuthorizedContractReader(permissions.BasePermission):
    message = 'You may only view lease records for your role and assigned scope.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner', 'Tenant')
        )


class IsAuthorizedContractActivator(permissions.BasePermission):
    message = 'Only an Admin, the property Owner, or the assigned Property Manager may activate a lease.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner')
        )


class IsAuthorizedContractTerminator(permissions.BasePermission):
    message = 'Only the property Owner, an authorized Manager, or an Admin with the Owner\'s instruction may end a lease.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner')
        )


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    pagination_class = OptInPageNumberPagination
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true' and user.role == 'Admin':
            contracts = Contract.objects.all()
        else:
            contracts = Contract.objects.filter(is_deleted=False)

        if user.role == 'Admin':
            scoped_contracts = contracts
        elif user.role == 'Property Manager':
            scoped_contracts = contracts.filter(property__manager=user)
        elif user.role == 'Owner':
            scoped_contracts = contracts.filter(property__owner=user)
        elif user.role == 'Tenant':
            scoped_contracts = contracts.filter(tenant=user)
        else:
            scoped_contracts = contracts.none()
        contract_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if contract_status:
            if contract_status == 'History':
                scoped_contracts = scoped_contracts.filter(status__in=['Terminated', 'Expired'])
            else:
                scoped_contracts = scoped_contracts.filter(status=contract_status)
        if search:
            for term in search.split():
                scoped_contracts = scoped_contracts.filter(
                    Q(property__title__icontains=term)
                    | Q(tenant__email__icontains=term)
                    | Q(tenant__first_name__icontains=term)
                    | Q(tenant__last_name__icontains=term)
                    | Q(unit__unit_number__icontains=term)
                )
        contracts = scoped_contracts.select_related(
            'tenant', 'unit', 'unit__tenant', 'activated_by', 'terminated_by',
        ).prefetch_related(
            Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
        )
        ordering = self.request.query_params.get('ordering', 'newest')
        ordering_fields = {
            'newest': ('-id',),
            'active_first': (
                Case(
                    When(status='Active', then=Value(0)),
                    When(status='Pending', then=Value(1)),
                    default=Value(2),
                    output_field=IntegerField(),
                ),
                'end_date', '-id',
            ),
            'end_date': ('end_date', 'id'),
            'end_date_desc': ('-end_date', '-id'),
            'property': (Lower('property__title'), '-id'),
            'tenant': (Lower('tenant__last_name'), Lower('tenant__first_name'), '-id'),
        }
        return contracts.order_by(*ordering_fields.get(ordering, ordering_fields['active_first']))

    def get_permissions(self):
        if self.action == 'activate':
            return [IsAuthorizedContractActivator()]
        if self.action in ('destroy', 'terminate', 'move_out'):
            return [IsAuthorizedContractTerminator()]
        if self.action in ('create', 'update', 'partial_update'):
            return [IsAdminOrPropertyManager()]
        if self.action in ('renewal', 'renewal_decision', 'prepare_renewal_lease'):
            return [IsAuthorizedContractActivator()]
        if self.action in ('inspection', 'deposit_settlement') and self.request.method == 'POST':
            return [IsAdminOrPropertyManager()]
        if self.action == 'complete_turnover':
            return [IsAdminOrPropertyManager()]
        if self.action == 'inspection_acknowledge':
            return [IsTenant()]
        if self.action == 'deposit_decision':
            return [IsOwner()]
        if self.action in ('list', 'retrieve', 'export'):
            return [IsAuthorizedContractReader()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='move-out')
    @transaction.atomic
    def move_out(self, request, pk=None):
        contract = self._end_contract(request, self.get_object())
        contract.turnover_pending = True
        contract.save(update_fields=['turnover_pending'])
        if contract.unit_id and contract.unit.status == 'Available':
            contract.unit.status = 'Maintenance'
            contract.unit.save(update_fields=['status'])
            if contract.property.units.count() == 1:
                contract.property.status = 'Under Maintenance'
                contract.property.save(update_fields=['status'])
        elif not contract.unit_id and not contract.property.units.exists() and contract.property.status == 'Available':
            contract.property.status = 'Under Maintenance'
            contract.property.save(update_fields=['status'])
        return Response(self.get_serializer(contract).data)

    @action(detail=True, methods=['get', 'post'])
    @transaction.atomic
    def inspection(self, request, pk=None):
        contract = self.get_object()
        if request.method == 'GET':
            return Response([self._inspection_data(item) for item in contract.inspections.all()])
        contract = Contract.objects.select_for_update().get(pk=contract.pk)
        if contract.status not in ('Active', 'Terminated'):
            raise ValidationError({'status': 'Inspections require an active or ended lease.'})
        kind = request.data.get('kind')
        if kind not in ('Move In', 'Move Out'):
            raise ValidationError({'kind': 'Choose Move In or Move Out.'})
        if kind == 'Move Out' and not contract.turnover_pending:
            raise ValidationError({'kind': 'Start move-out before recording a move-out inspection.'})
        inspected_on = request.data.get('inspectedOn')
        from django.utils.dateparse import parse_date
        inspected_date = parse_date(inspected_on) if isinstance(inspected_on, str) else None
        if not inspected_date:
            raise ValidationError({'inspectedOn': 'Enter an inspection date in YYYY-MM-DD format.'})
        checklist = request.data.get('checklist')
        if not isinstance(checklist, dict) or not checklist:
            raise ValidationError({'checklist': 'Record at least one condition item.'})
        if len(str(checklist)) > 10000:
            raise ValidationError({'checklist': 'The checklist is too long.'})
        notes = request.data.get('notes', '')
        evidence = request.data.get('evidenceReference', '')
        if not isinstance(notes, str) or not isinstance(evidence, str) or len(evidence) > 500:
            raise ValidationError({'detail': 'Invalid notes or evidence reference.'})
        latest = contract.inspections.filter(kind=kind).order_by('-version').first()
        item = LeaseInspection.objects.create(contract=contract, kind=kind, version=(latest.version + 1 if latest else 1), inspected_on=inspected_date, checklist=checklist, notes=notes, evidence_reference=evidence, recorded_by=request.user)
        record_activity(request.user, 'CREATE', 'Lease inspection', item.pk, f'Recorded {kind.lower()} inspection for lease {contract.pk}.')
        return Response(self._inspection_data(item), status=201)

    def _inspection_data(self, item):
        return {'id': item.pk, 'kind': item.kind, 'version': item.version, 'inspectedOn': item.inspected_on.isoformat(), 'checklist': item.checklist, 'notes': item.notes, 'evidenceReference': item.evidence_reference, 'recordedBy': item.recorded_by_id, 'createdAt': item.created_at.isoformat(), 'tenantAcknowledgedAt': item.tenant_acknowledged_at.isoformat() if item.tenant_acknowledged_at else None}

    @action(detail=True, methods=['post'], url_path='inspection-acknowledge')
    @transaction.atomic
    def inspection_acknowledge(self, request, pk=None):
        contract = self.get_object()
        if contract.tenant_id != request.user.pk:
            raise ValidationError({'detail': 'Only the lease Tenant may acknowledge this inspection.'})
        item = contract.inspections.filter(pk=request.data.get('inspectionId')).first()
        if not item:
            raise ValidationError({'inspectionId': 'Inspection not found for this lease.'})
        if not item.tenant_acknowledged_at:
            item.tenant_acknowledged_at = timezone.now()
            item.save(update_fields=['tenant_acknowledged_at'])
        return Response(self._inspection_data(item))

    def _settlement_data(self, item):
        return {'id': item.pk, 'status': item.status, 'deductions': str(item.deductions), 'returnAmount': str(item.return_amount), 'reason': item.reason, 'evidenceReference': item.evidence_reference, 'requestedAt': item.requested_at.isoformat(), 'decidedAt': item.decided_at.isoformat() if item.decided_at else None, 'decisionNote': item.decision_note}

    @action(detail=True, methods=['get', 'post'], url_path='deposit-settlement')
    @transaction.atomic
    def deposit_settlement(self, request, pk=None):
        contract = self.get_object()
        if request.method == 'GET':
            item = DepositSettlement.objects.filter(contract=contract).first()
            return Response(self._settlement_data(item) if item else None)
        contract = Contract.objects.select_for_update().get(pk=contract.pk)
        if not contract.turnover_pending or not contract.inspections.filter(kind='Move Out').exists():
            raise ValidationError({'detail': 'Record a move-out inspection before requesting deposit settlement.'})
        try:
            deductions = Decimal(str(request.data.get('deductions')))
        except (InvalidOperation, TypeError):
            raise ValidationError({'deductions': 'Enter a valid amount.'})
        if not deductions.is_finite() or deductions < 0 or deductions > contract.deposit_amount or deductions.as_tuple().exponent < -2:
            raise ValidationError({'deductions': 'Deductions must be between zero and the deposit, with two decimal places.'})
        reason = request.data.get('reason', '')
        evidence = request.data.get('evidenceReference', '')
        if deductions > 0 and not str(reason).strip():
            raise ValidationError({'reason': 'Explain each deduction.'})
        if not isinstance(reason, str) or not isinstance(evidence, str) or len(evidence) > 500:
            raise ValidationError({'detail': 'Invalid settlement details.'})
        item = DepositSettlement.objects.filter(contract=contract).first()
        if item and item.status != 'Rejected':
            raise ValidationError({'status': 'This settlement is already pending or approved.'})
        if item:
            item.deductions = deductions
            item.reason = reason
            item.evidence_reference = evidence
            item.status = 'Pending'
            item.requested_by = request.user
            item.requested_at = timezone.now()
            item.decided_by = None
            item.decided_at = None
            item.decision_note = ''
            item.save()
        else:
            item = DepositSettlement.objects.create(contract=contract, deductions=deductions, reason=reason, evidence_reference=evidence, requested_by=request.user)
        record_activity(request.user, 'CREATE', 'Deposit settlement', item.pk, f'Requested deposit settlement approval for lease {contract.pk}.')
        create_for_recipients(recipients=[contract.property.owner] if contract.property.owner_id else [], actor=request.user, event_type=Notification.EventType.LEASE, title='Deposit settlement approval requested', message=f'Lease #{contract.pk} deposit settlement needs your decision.', destination=Notification.Destination.OWNER_CONTRACTS)
        return Response(self._settlement_data(item))

    @action(detail=True, methods=['post'], url_path='deposit-decision')
    @transaction.atomic
    def deposit_decision(self, request, pk=None):
        contract = self.get_object()
        if contract.property.owner_id != request.user.pk:
            raise ValidationError({'detail': 'Only this property Owner may decide.'})
        item = DepositSettlement.objects.select_for_update().filter(contract=contract).first()
        if not item or item.status != 'Pending':
            raise ValidationError({'status': 'No settlement is awaiting approval.'})
        approved = request.data.get('approved')
        if not isinstance(approved, bool):
            raise ValidationError({'approved': 'Provide true or false.'})
        item.status = 'Approved' if approved else 'Rejected'
        item.decided_by = request.user
        item.decided_at = timezone.now()
        item.decision_note = str(request.data.get('note', ''))[:1000]
        item.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_note'])
        record_activity(request.user, 'UPDATE', 'Deposit settlement', item.pk, f'{item.status} deposit settlement for lease {contract.pk}.')
        for recipient, destination in ((contract.tenant, Notification.Destination.TENANT_LEASE), (contract.property.manager, Notification.Destination.MANAGER_CONTRACTS)):
            if recipient:
                create_for_recipients(recipients=[recipient], actor=request.user, event_type=Notification.EventType.LEASE, title=f'Deposit settlement {item.status.lower()}', message=f'The deposit settlement for lease #{contract.pk} was {item.status.lower()}.', destination=destination)
        return Response(self._settlement_data(item))

    @action(detail=True, methods=['post'], url_path='complete-turnover')
    @transaction.atomic
    def complete_turnover(self, request, pk=None):
        contract = self.get_object()
        contract = Contract.objects.select_for_update().get(pk=contract.pk)
        if not contract.turnover_pending or not contract.inspections.filter(kind='Move Out').exists():
            raise ValidationError({'detail': 'A move-out inspection is required.'})
        settlement = DepositSettlement.objects.filter(contract=contract, status='Approved').first()
        if not settlement:
            raise ValidationError({'detail': 'Owner approval of the deposit settlement is required.'})
        if contract.unit_id and contract.unit.maintenance_requests.filter(is_deleted=False).exclude(status='Resolved').exists():
            raise ValidationError({'detail': 'Resolve open maintenance work before turnover.'})
        contract.turnover_pending = False
        contract.turnover_completed_at = timezone.now()
        contract.save(update_fields=['turnover_pending', 'turnover_completed_at'])
        record_activity(request.user, 'UPDATE', 'Contract', contract.pk, f'Completed turnover for lease {contract.pk}.')
        if contract.unit_id and contract.unit.status == 'Maintenance':
            if not contract.unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
                contract.unit.status = 'Available'
                contract.unit.save(update_fields=['status'])
                if contract.property.status == 'Under Maintenance':
                    contract.property.status = 'Available'
                    contract.property.save(update_fields=['status'])
        elif not contract.unit_id and not contract.property.units.exists() and contract.property.status == 'Under Maintenance':
            if not contract.property.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
                contract.property.status = 'Available'
                contract.property.save(update_fields=['status'])
        return Response(self.get_serializer(contract).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        return csv_response('leases', [
            ('ID', lambda item: item.pk), ('Property', lambda item: item.property.title),
            ('Unit', lambda item: item.unit.unit_number if item.unit else ''),
            ('Tenant', lambda item: item.tenant.email), ('Start date', lambda item: item.start_date),
            ('End date', lambda item: item.end_date), ('Rent', lambda item: item.rent_amount),
            ('Deposit', lambda item: item.deposit_amount), ('Status', lambda item: item.status),
        ], self.get_queryset())

    @transaction.atomic
    def _end_contract(self, request, contract):
        locked_contract = Contract.objects.select_for_update().select_related('property').get(pk=contract.pk)
        if locked_contract.status not in ('Active', 'Pending') or locked_contract.is_deleted:
            raise ValidationError({'status': 'Only an active or pending lease can be ended.'})

        details = LeaseTerminationSerializer(data=request.data)
        details.is_valid(raise_exception=True)
        reason = details.validated_data['reason']
        effective_date = details.validated_data['effectiveDate']
        actor = request.user
        property_obj = Property.objects.select_for_update().get(pk=locked_contract.property_id)
        note = ''
        instruction_reference = ''
        if actor.role == 'Owner':
            if property_obj.owner_id != actor.pk:
                raise ValidationError({'detail': 'You may end leases only for properties you own.'})
            authority = 'Owner'
        elif actor.role == 'Property Manager':
            if property_obj.manager_id != actor.pk:
                raise ValidationError({'detail': 'You may end leases only for properties assigned to you.'})
            authorization = LeaseTerminationAuthorization.objects.select_for_update().filter(
                property=property_obj,
                manager=actor,
                is_active=True,
            ).first()
            owner = property_obj.owner
            if (
                not authorization
                or not owner
                or authorization.granted_by_id != owner.pk
                or owner.role != 'Owner'
                or not owner.is_active
                or owner.is_deleted
            ):
                raise ValidationError({'detail': 'The Owner has not recorded lease-termination authority for you on this property.'})
            authority = 'Manager Delegation'
            note = authorization.agreement_reference
        elif actor.role == 'Admin':
            instruction_note = details.validated_data.get('instructionNote', '').strip()
            instruction_reference = details.validated_data.get('instructionReference', '').strip()
            if not instruction_note:
                raise ValidationError({'instructionNote': 'Enter the Owner instruction authorizing this lease termination.'})
            if not instruction_reference:
                raise ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
            authority = 'Admin Override'
            note = f'{instruction_note}\nOwner instruction reference: {instruction_reference}'
        else:
            raise ValidationError({'detail': 'Your role cannot end leases.'})

        self._release_occupancy(locked_contract)
        locked_contract.status = 'Terminated'
        locked_contract.terminated_by = actor
        locked_contract.terminated_at = timezone.now()
        locked_contract.termination_effective_date = effective_date
        locked_contract.termination_reason = reason
        locked_contract.termination_basis = authority
        locked_contract.termination_note = note
        locked_contract.termination_instruction_reference = instruction_reference
        locked_contract.save(update_fields=[
            'status', 'terminated_by', 'terminated_at', 'termination_effective_date',
            'termination_reason', 'termination_basis', 'termination_note', 'termination_instruction_reference',
        ])
        record_activity(
            actor,
            'TERMINATE',
            'Contract',
            locked_contract.pk,
            f'Ended lease for {property_obj.title} effective {effective_date} under {authority} authority. Reason: {reason}.'
            + (f' Owner instruction: {note}' if note else ''),
        )
        self._notify_lease_participants(
            locked_contract,
            actor=actor,
            title='Lease ended',
            message='A lease for this property was ended.',
        )
        return locked_contract

    @transaction.atomic
    def destroy(self, request, *args, **kwargs):
        contract = self.get_object()
        self._end_contract(request, contract)
        return Response({'message': 'Lease ended. The record and its history were preserved.'})

    @transaction.atomic
    def _release_occupancy(self, contract):
        application_still_holds_unit = bool(
            contract.source_application_id
            and contract.source_application.status == 'Approved'
        )
        if contract.unit_id and not contract.unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=contract.pk).exists():
            contract.unit.status = 'Reserved' if application_still_holds_unit else 'Available'
            contract.unit.tenant = None
            contract.unit.save(update_fields=['status', 'tenant'])
        prop = contract.property
        if prop.units.exists():
            prop.status = 'Available' if prop.units.exclude(status='Occupied').exists() else 'Occupied'
        elif application_still_holds_unit:
            prop.status = 'Pending'
        elif not prop.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=contract.pk).exists():
            prop.status = 'Available'
        prop.save(update_fields=['status'])

    @transaction.atomic
    def perform_create(self, serializer):
        contract = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Contract', contract.pk, f'Created lease contract {contract.pk}.')
        self._notify_lease_participants(
            contract,
            actor=self.request.user,
            title='Lease prepared',
            message='A lease is ready for review and signing.',
        )

    def _notify_lease_participants(self, contract, *, actor, title, message):
        property_obj = contract.property
        create_for_recipients(
            recipients=[property_obj.owner] if property_obj.owner_id else [],
            actor=actor,
            event_type=Notification.EventType.LEASE,
            title=title,
            message=message,
            destination=Notification.Destination.OWNER_CONTRACTS,
        )
        create_for_recipients(
            recipients=[property_obj.manager] if property_obj.manager_id else [],
            actor=actor,
            event_type=Notification.EventType.LEASE,
            title=title,
            message=message,
            destination=Notification.Destination.MANAGER_CONTRACTS,
        )
        create_for_recipients(
            recipients=[contract.tenant],
            actor=actor,
            event_type=Notification.EventType.LEASE,
            title=title,
            message=message,
            destination=Notification.Destination.TENANT_LEASE,
        )

    def perform_update(self, serializer):
        contract = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Contract', contract.pk, f'Updated lease contract {contract.pk}.')

    @action(detail=True, methods=['post'], url_path='terminate')
    @transaction.atomic
    def terminate(self, request, pk=None):
        contract = self.get_object()
        self._end_contract(request, contract)
        return Response({'message': 'Lease ended. The record and its history were preserved.'})

    @action(detail=True, methods=['post'], url_path='renewal')
    def renewal(self, request, pk=None):
        contract = self.get_object()
        details = RenewalProposalInput(data=request.data)
        details.is_valid(raise_exception=True)
        result = propose_renewal(
            contract, request.user, end_date=details.validated_data['endDate'],
            rent_amount=details.validated_data['rentAmount'],
        )
        return Response(renewal_data(result), status=201)

    @action(detail=True, methods=['post'], url_path='renewal-decision')
    def renewal_decision(self, request, pk=None):
        contract = self.get_object()
        if not isinstance(request.data.get('approve'), bool):
            raise ValidationError({'approve': 'Provide true or false.'})
        result = decide_renewal(
            contract, request.user, approve=request.data['approve'],
            note=str(request.data.get('note') or '').strip(),
        )
        return Response(renewal_data(result))

    @action(detail=True, methods=['post'], url_path='prepare-renewal')
    def prepare_renewal_lease(self, request, pk=None):
        contract = self.get_object()
        result = prepare_renewal(contract, request.user)
        return Response(renewal_data(result))

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def activate(self, request, pk=None):
        existing = self.get_object()
        # Conversion and application review lock the application before its
        # property. Use the same order when activation changes that application.
        if existing.source_application_id:
            RentalApplication.objects.select_for_update().get(pk=existing.source_application_id)
        contract = Contract.objects.select_for_update().select_related('property').get(pk=existing.pk)
        if contract.status != 'Pending':
            raise ValidationError({'status': 'Only a pending lease can be activated.'})
        if LeaseRenewal.objects.filter(successor=contract).exists() and timezone.localdate() < contract.start_date:
            raise ValidationError({'startDate': 'A renewal cannot be activated before its new term begins.'})
        if request.data.get('signaturesComplete') is not True:
            raise ValidationError({'signaturesComplete': 'Confirm that all required parties have signed the lease.'})
        signed_copy_reference = str(request.data.get('signedCopyReference') or '').strip()
        if not signed_copy_reference:
            raise ValidationError({'signedCopyReference': 'Enter a reference to the signed lease copy.'})
        if len(signed_copy_reference) > 500:
            raise ValidationError({'signedCopyReference': 'The signed-copy reference cannot exceed 500 characters.'})

        actor = request.user
        property_obj = Property.objects.select_for_update().get(pk=contract.property_id)
        application = contract.source_application
        note = ''
        instruction_reference = ''
        manual_reason = str(request.data.get('manualLeaseReason') or contract.manual_lease_reason or '').strip()
        manual_reference = str(request.data.get('manualLeaseReference') or contract.manual_lease_reference or '').strip()
        if application:
            if application.status != 'Approved':
                raise ValidationError({'application': 'The source application is not approved; review it before activating this lease.'})
            inquiry = application.inquiry
            if inquiry.property_id != contract.property_id or inquiry.unit_id != contract.unit_id:
                raise ValidationError({'application': 'The source application does not match this property and unit.'})
            if contract.tenant.email.strip().casefold() != application.applicant_email.strip().casefold():
                raise ValidationError({'tenant': 'The lease tenant account must match the approved applicant email.'})
        elif not manual_reason and not manual_reference:
            raise ValidationError({
                'manualLeaseReason': 'For an existing or offline tenancy, enter a reason or a reference to the existing lease record.'
            })

        if actor.role == 'Owner':
            if property_obj.owner_id != actor.pk:
                raise ValidationError({'detail': 'You may activate leases only for properties you own.'})
            activation_basis = 'Owner'
        elif actor.role == 'Property Manager':
            if not application:
                raise ValidationError({'detail': 'A Manager may prepare a manual/offline lease but only the Owner or an Admin with the Owner\'s instruction may activate it.'})
            if property_obj.manager_id != actor.pk:
                raise ValidationError({'detail': 'You may activate leases only for properties assigned to you.'})
            authorization = LeaseSigningAuthorization.objects.select_for_update().filter(
                property=property_obj,
                manager=actor,
                is_active=True,
            ).first()
            owner = property_obj.owner
            if (
                not authorization
                or not owner
                or authorization.granted_by_id != owner.pk
                or owner.role != 'Owner'
                or not owner.is_active
                or owner.is_deleted
            ):
                raise ValidationError({'detail': 'The Owner has not recorded signing authority for you on this property.'})
            activation_basis = 'Manager Delegation'
            note = authorization.agreement_reference
        elif actor.role == 'Admin':
            instruction_note = str(request.data.get('instructionNote') or '').strip()
            instruction_reference = str(request.data.get('instructionReference') or '').strip()
            if not instruction_note:
                raise ValidationError({'instructionNote': 'Enter the Owner instruction that authorizes recording this activation.'})
            if not instruction_reference:
                raise ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
            if len(instruction_note) > 2000:
                raise ValidationError({'instructionNote': 'The Owner instruction cannot exceed 2,000 characters.'})
            if len(instruction_reference) > 500:
                raise ValidationError({'instructionReference': 'The instruction reference cannot exceed 500 characters.'})
            activation_basis = 'Admin Override'
            note = f'{instruction_note}\nOwner instruction reference: {instruction_reference}'
        else:
            raise ValidationError({'detail': 'Your role cannot activate leases.'})

        if contract.unit_id:
            unit = Unit.objects.select_for_update().get(pk=contract.unit_id)
            if unit.status != 'Reserved':
                raise ValidationError({'unit': 'This lease no longer holds its unit reservation.'})
            unit.status = 'Occupied'
            unit.tenant_id = contract.tenant_id
            unit.save(update_fields=['status', 'tenant'])
            property_obj.status = (
                'Available' if property_obj.units.exclude(status='Occupied').exists() else 'Occupied'
            )
        else:
            if Property.objects.filter(pk=property_obj.pk, units__isnull=False).exists():
                raise ValidationError({'unit': 'Select a unit before activating this property lease.'})
            if Contract.objects.filter(
                property=property_obj,
                unit__isnull=True,
                status__in=['Active', 'Pending'],
                is_deleted=False,
            ).exclude(pk=contract.pk).exists():
                raise ValidationError({'property': 'Another active or pending lease already uses this property.'})
            if property_obj.status not in ('Available', 'Pending'):
                raise ValidationError({'property': 'This property is not available for lease activation.'})
            property_obj.status = 'Occupied'
        property_obj.save(update_fields=['status'])

        contract.status = 'Active'
        contract.activated_by = actor
        contract.activated_at = timezone.now()
        contract.activation_basis = activation_basis
        contract.activation_note = note
        contract.activation_instruction_reference = instruction_reference
        contract.signed_copy_reference = signed_copy_reference
        contract.manual_lease_reason = manual_reason
        contract.manual_lease_reference = manual_reference
        contract.save(update_fields=[
            'status', 'activated_by', 'activated_at', 'activation_basis', 'activation_note',
            'activation_instruction_reference', 'signed_copy_reference', 'manual_lease_reason', 'manual_lease_reference',
        ])

        if application:
            RentalApplicationDecision.objects.create(
                application=application,
                from_status=application.status,
                to_status='Converted',
                authority=activation_basis,
                note='Lease activated.',
                actor=actor,
            )
            application.status = 'Converted'
            application.save(update_fields=['status'])
            inquiry = application.inquiry
            inquiry.status = 'Converted'
            inquiry.save(update_fields=['status'])

        record_activity(
            actor,
            'ACTIVATE',
            'Contract',
            contract.pk,
            f'Activated lease for {property_obj.title} under {activation_basis} authority.',
        )
        self._notify_lease_participants(
            contract,
            actor=actor,
            title='Lease activated',
            message='A lease for this property is now active.',
        )
        if application and application.inquiry.agent_id:
            assigned_agent = application.inquiry.agent
            if property_obj.assigned_agents.filter(pk=assigned_agent.pk, role='Agent').exists():
                create_for_recipients(
                    recipients=[assigned_agent],
                    actor=actor,
                    event_type=Notification.EventType.APPLICATION,
                    title='Application status updated',
                    message='The prospect application you represented has converted to a lease.',
                    destination=Notification.Destination.AGENT_APPLICATIONS,
                )
        return Response(self.get_serializer(contract).data)
