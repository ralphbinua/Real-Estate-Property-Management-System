from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from .models import Contract
from .serializers import ContractSerializer, LeaseTerminationSerializer
from properties.models import (
    LeaseSigningAuthorization, LeaseTerminationAuthorization, Property, Unit,
    RentalApplicationDecision,
)
from properties.querysets import property_serializer_queryset
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients


class IsAdminOrPropertyManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager')
        )


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
            scoped_contracts = scoped_contracts.filter(status=contract_status)
        if search:
            scoped_contracts = scoped_contracts.filter(
                Q(property__title__icontains=search)
                | Q(tenant__email__icontains=search)
                | Q(tenant__first_name__icontains=search)
                | Q(tenant__last_name__icontains=search)
                | Q(unit__unit_number__icontains=search)
            )
        return scoped_contracts.select_related(
            'tenant', 'unit', 'unit__tenant', 'activated_by', 'terminated_by',
        ).prefetch_related(
            Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
        ).order_by('-id')

    def get_permissions(self):
        if self.action == 'activate':
            return [IsAuthorizedContractActivator()]
        if self.action in ('destroy', 'terminate'):
            return [IsAuthorizedContractTerminator()]
        if self.action in ('create', 'update', 'partial_update'):
            return [IsAdminOrPropertyManager()]
        if self.action in ('list', 'retrieve'):
            return [IsAuthorizedContractReader()]
        return [permissions.IsAuthenticated()]

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

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def activate(self, request, pk=None):
        existing = self.get_object()
        contract = Contract.objects.select_for_update().select_related('property').get(pk=existing.pk)
        if contract.status != 'Pending':
            raise ValidationError({'status': 'Only a pending lease can be activated.'})
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
