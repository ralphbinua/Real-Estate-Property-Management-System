from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from .models import (
    Property, Unit, PropertyInquiry, RentalApplication, RentalApplicationDecision,
    LeaseSigningAuthorization, LeaseTerminationAuthorization, PropertyAuthorityEvent,
    PropertyApprovalPolicyChange,
)
from .serializers import PropertySerializer, UnitManagementSerializer, PropertyInquirySerializer, RentalApplicationSerializer
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from maintenance.models import MaintenanceRequest
from maintenance.serializers import MaintenanceRequestSerializer
from users.audit import record_activity
from users.models import AuditEvent

User = get_user_model()


class IsAdminOrPropertyManager(permissions.BasePermission):
    message = 'Only administrators and property managers may change property records.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Property Manager')
        )


class IsApplicationReviewer(permissions.BasePermission):
    message = 'Only administrators, property managers, and property owners may review applications.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner')
        )


class IsAdminOrOwner(permissions.BasePermission):
    message = 'Only administrators and property owners may perform this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Owner')
        )


class IsOwner(permissions.BasePermission):
    message = 'Only the property owner may grant or revoke this authority.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role == 'Owner'
        )


class IsOwnerOrAdmin(permissions.BasePermission):
    message = 'Only the property Owner or an Admin recording the Owner\'s instruction may change this approval rule.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Owner', 'Admin')
        )

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true' and user.role == 'Admin':
            properties = Property.objects.all()
        else:
            properties = Property.objects.filter(is_deleted=False)

        if user.role == 'Admin':
            return properties.order_by('-id')
        if user.role == 'Owner':
            return properties.filter(owner=user).order_by('-id')
        if user.role == 'Property Manager':
            return properties.filter(manager=user).order_by('-id')
        if user.role == 'Agent':
            return properties.filter(assigned_agents=user).order_by('-id')
        if user.role == 'Tenant':
            return properties.filter(
                Q(units__tenant=user)
                | Q(contracts__tenant=user, contracts__is_deleted=False, contracts__status='Active')
            ).distinct().order_by('-id')
        return properties.none()

    def get_permissions(self):
        if self.action == 'lease_signing_authority':
            return [IsOwner()]
        if self.action == 'lease_termination_authority':
            return [IsOwner()]
        if self.action == 'approval_policy':
            return [IsOwnerOrAdmin()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if self.request.user.role == 'Owner':
            instance = serializer.save(owner=self.request.user)
        else:
            instance = serializer.save()
        detail = f'Created property {instance.title}.'
        instruction_note, instruction_reference = getattr(instance, '_creation_instruction', ('', ''))
        if instruction_note:
            detail += f' Owner instruction for delegated Manager application approval: {instruction_note} Reference: {instruction_reference}.'
        record_activity(self.request.user, 'CREATE', 'Property', instance.pk, detail)

    @transaction.atomic
    def perform_update(self, serializer):
        locked_property = Property.objects.select_for_update().get(pk=serializer.instance.pk)
        previous_owner_id = locked_property.owner_id
        previous_manager_id = locked_property.manager_id
        has_approved_standalone_application = RentalApplication.objects.filter(
            inquiry__property=locked_property, inquiry__unit__isnull=True, status='Approved'
        ).exists()
        requested_status = serializer.validated_data.get('status', locked_property.status)
        if has_approved_standalone_application and requested_status != 'Pending':
            raise ValidationError({'status': 'This property is reserved for an approved rental application. Convert or reject that application before releasing it.'})
        serializer.instance = locked_property
        if self.request.user.role == 'Property Manager':
            instance = serializer.save(manager=self.request.user)
        else:
            instance = serializer.save()
        if (instance.owner_id != previous_owner_id or instance.manager_id != previous_manager_id):
            authorization = getattr(instance, 'lease_signing_authorization', None)
            if authorization and authorization.is_active:
                authorization.is_active = False
                authorization.revoked_by = self.request.user
                authorization.revoked_at = timezone.now()
                authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
                PropertyAuthorityEvent.objects.create(
                    property=instance,
                    authority='Lease signing',
                    action='Revoked',
                    manager_id=authorization.manager_id or previous_manager_id,
                    recorded_by=self.request.user,
                    agreement_reference=authorization.agreement_reference,
                )
                record_activity(
                    self.request.user,
                    'REVOKE LEASE SIGNING AUTHORITY',
                    'Property',
                    instance.pk,
                    'Lease signing authority was revoked because the property owner or assigned manager changed.',
                )
            termination_authorization = getattr(instance, 'lease_termination_authorization', None)
            if termination_authorization and termination_authorization.is_active:
                termination_authorization.is_active = False
                termination_authorization.revoked_by = self.request.user
                termination_authorization.revoked_at = timezone.now()
                termination_authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
                PropertyAuthorityEvent.objects.create(
                    property=instance,
                    authority='Lease termination',
                    action='Revoked',
                    manager_id=termination_authorization.manager_id or previous_manager_id,
                    recorded_by=self.request.user,
                    agreement_reference=termination_authorization.agreement_reference,
                )
                record_activity(
                    self.request.user,
                    'REVOKE LEASE TERMINATION AUTHORITY',
                    'Property',
                    instance.pk,
                    'Lease termination authority was revoked because the property owner or assigned manager changed.',
                )
        record_activity(self.request.user, 'UPDATE', 'Property', instance.pk, f'Updated property {instance.title}.')

    @action(detail=True, methods=['patch'], url_path='lease-signing-authority')
    @transaction.atomic
    def lease_signing_authority(self, request, pk=None):
        property_obj = self.get_object()
        property_obj = Property.objects.select_for_update().get(pk=property_obj.pk)
        if property_obj.owner_id != request.user.pk:
            raise ValidationError({'detail': 'You may change signing authority only for a property you own.'})

        authorized = request.data.get('authorized')
        if not isinstance(authorized, bool):
            raise ValidationError({'authorized': 'Choose whether to grant or revoke manager signing authority.'})

        authorization = (
            LeaseSigningAuthorization.objects.select_for_update()
            .filter(property=property_obj)
            .first()
        )
        if authorized:
            manager = property_obj.manager
            if not manager or manager.role != 'Property Manager' or not manager.is_active or manager.is_deleted:
                raise ValidationError({'detail': 'Assign an active Property Manager before granting signing authority.'})
            if request.data.get('confirmWrittenAuthority') is not True:
                raise ValidationError({'confirmWrittenAuthority': 'Confirm that the written management agreement grants this authority and applicable rules allow it.'})
            agreement_reference = str(request.data.get('agreementReference') or '').strip()
            if not agreement_reference:
                raise ValidationError({'agreementReference': 'Enter a reference to the written management agreement.'})

            values = {
                'manager': manager,
                'agreement_reference': agreement_reference[:500],
                'granted_by': request.user,
                'granted_at': timezone.now(),
                'is_active': True,
                'revoked_by': None,
                'revoked_at': None,
            }
            if authorization:
                for field, value in values.items():
                    setattr(authorization, field, value)
                authorization.save(update_fields=list(values.keys()))
            else:
                authorization = LeaseSigningAuthorization.objects.create(property=property_obj, **values)
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Lease signing',
                action='Granted',
                manager=manager,
                recorded_by=request.user,
                agreement_reference=agreement_reference[:500],
            )
            record_activity(
                request.user,
                'GRANT LEASE SIGNING AUTHORITY',
                'Property',
                property_obj.pk,
                f'Granted lease signing authority to {manager.get_full_name() or manager.email}. Agreement reference: {agreement_reference}.',
            )
        elif authorization and authorization.is_active:
            authorization.is_active = False
            authorization.revoked_by = request.user
            authorization.revoked_at = timezone.now()
            authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Lease signing',
                action='Revoked',
                manager=authorization.manager,
                recorded_by=request.user,
                agreement_reference=authorization.agreement_reference,
            )
            record_activity(
                request.user,
                'REVOKE LEASE SIGNING AUTHORITY',
                'Property',
                property_obj.pk,
                f'Revoked lease signing authority for {property_obj.title}.',
            )

        property_obj.refresh_from_db()
        return Response(PropertySerializer(property_obj, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path='termination-authority')
    @transaction.atomic
    def lease_termination_authority(self, request, pk=None):
        property_obj = self.get_object()
        property_obj = Property.objects.select_for_update().get(pk=property_obj.pk)
        if property_obj.owner_id != request.user.pk:
            raise ValidationError({'detail': 'You may change termination authority only for a property you own.'})

        authorized = request.data.get('authorized')
        if not isinstance(authorized, bool):
            raise ValidationError({'authorized': 'Choose whether to grant or revoke manager lease-termination authority.'})

        authorization = LeaseTerminationAuthorization.objects.select_for_update().filter(property=property_obj).first()
        if authorized:
            manager = property_obj.manager
            if not manager or manager.role != 'Property Manager' or not manager.is_active or manager.is_deleted:
                raise ValidationError({'detail': 'Assign an active Property Manager before granting termination authority.'})
            if request.data.get('confirmWrittenAuthority') is not True:
                raise ValidationError({'confirmWrittenAuthority': 'Confirm that the written management agreement grants this authority.'})
            agreement_reference = str(request.data.get('agreementReference') or '').strip()
            if not agreement_reference:
                raise ValidationError({'agreementReference': 'Enter a reference to the written management agreement.'})
            values = {
                'manager': manager,
                'agreement_reference': agreement_reference[:500],
                'granted_by': request.user,
                'granted_at': timezone.now(),
                'is_active': True,
                'revoked_by': None,
                'revoked_at': None,
            }
            if authorization:
                for field, value in values.items():
                    setattr(authorization, field, value)
                authorization.save(update_fields=list(values.keys()))
            else:
                authorization = LeaseTerminationAuthorization.objects.create(property=property_obj, **values)
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Lease termination',
                action='Granted',
                manager=manager,
                recorded_by=request.user,
                agreement_reference=agreement_reference[:500],
            )
            record_activity(
                request.user,
                'GRANT LEASE TERMINATION AUTHORITY',
                'Property',
                property_obj.pk,
                f'Granted lease termination authority to {manager.get_full_name() or manager.email}. Agreement reference: {agreement_reference}.',
            )
        elif authorization and authorization.is_active:
            authorization.is_active = False
            authorization.revoked_by = request.user
            authorization.revoked_at = timezone.now()
            authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Lease termination',
                action='Revoked',
                manager=authorization.manager,
                recorded_by=request.user,
                agreement_reference=authorization.agreement_reference,
            )
            record_activity(
                request.user,
                'REVOKE LEASE TERMINATION AUTHORITY',
                'Property',
                property_obj.pk,
                f'Revoked lease termination authority for {property_obj.title}.',
            )

        property_obj.refresh_from_db()
        return Response(PropertySerializer(property_obj, context={'request': request}).data)

    @action(detail=True, methods=['patch'], url_path='approval-policy')
    @transaction.atomic
    def approval_policy(self, request, pk=None):
        property_obj = self.get_object()
        property_obj = Property.objects.select_for_update().get(pk=property_obj.pk)
        if request.user.role == 'Owner' and property_obj.owner_id != request.user.pk:
            raise ValidationError({'detail': 'You may change the application-approval rule only for a property you own.'})

        mode = request.data.get('applicationApprovalMode')
        valid_modes = {value for value, _label in Property.APPLICATION_APPROVAL_MODES}
        if mode not in valid_modes:
            raise ValidationError({'applicationApprovalMode': 'Choose Owner approval or delegated Property Manager approval.'})
        if not property_obj.owner_id:
            raise ValidationError({'detail': 'Assign a property Owner before changing its application-approval rule.'})
        if mode == 'Manager' and not property_obj.manager_id:
            raise ValidationError({'detail': 'Assign a Property Manager before delegating application decisions.'})
        if mode == property_obj.application_approval_mode:
            return Response(PropertySerializer(property_obj, context={'request': request}).data)

        instruction_note = ''
        instruction_reference = ''
        if request.user.role == 'Admin':
            instruction_note = str(request.data.get('instructionNote') or '').strip()
            instruction_reference = str(request.data.get('instructionReference') or '').strip()
            if not instruction_note:
                raise ValidationError({'instructionNote': 'Enter the Owner instruction authorizing this rule change.'})
            if not instruction_reference:
                raise ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
            if len(instruction_note) > 2000:
                raise ValidationError({'instructionNote': 'The Owner instruction cannot exceed 2,000 characters.'})
            if len(instruction_reference) > 500:
                raise ValidationError({'instructionReference': 'The instruction reference cannot exceed 500 characters.'})

        previous_mode = property_obj.application_approval_mode
        property_obj.application_approval_mode = mode
        property_obj.save(update_fields=['application_approval_mode', 'updated_at'])
        PropertyApprovalPolicyChange.objects.create(
            property=property_obj,
            previous_mode=previous_mode,
            new_mode=mode,
            changed_by=request.user,
            instruction_note=instruction_note,
            instruction_reference=instruction_reference,
        )
        record_activity(
            request.user,
            'CHANGE APPLICATION APPROVAL RULE',
            'Property',
            property_obj.pk,
            f'Changed application approval from {previous_mode} to {mode}.'
            + (f' Owner instruction: {instruction_note} Reference: {instruction_reference}.' if instruction_note else ''),
        )
        property_obj.refresh_from_db()
        return Response(PropertySerializer(property_obj, context={'request': request}).data)

    @transaction.atomic
    def perform_destroy(self, instance):
        instance = Property.objects.select_for_update().get(pk=instance.pk)
        if instance.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'End or reassign active lease contracts before archiving this property.'})
        if RentalApplication.objects.filter(inquiry__property=instance, status='Approved').exists():
            raise ValidationError({'detail': 'Reject or convert approved rental applications before archiving this property.'})
        # Archive properties without cascading deletion into leases and financial records.
        instance.is_deleted = True
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'deleted_at'])
        record_activity(self.request.user, 'ARCHIVE', 'Property', instance.pk, f'Archived property {instance.title}.')


class UnitViewSet(viewsets.ModelViewSet):
    queryset = Unit.objects.select_related('property', 'tenant').all()
    serializer_class = UnitManagementSerializer
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        units = Unit.objects.select_related('property', 'tenant').filter(property__is_deleted=False)
        if user.role == 'Admin':
            return units.order_by('property_id', 'id')
        if user.role == 'Property Manager':
            return units.filter(property__manager=user).order_by('property_id', 'id')
        if user.role == 'Owner':
            return units.filter(property__owner=user).order_by('property_id', 'id')
        if user.role == 'Agent':
            return units.filter(property__assigned_agents=user).order_by('property_id', 'id')
        if user.role == 'Tenant':
            return units.filter(
                Q(tenant=user)
                | Q(contracts__tenant=user, contracts__status='Active', contracts__is_deleted=False)
            ).distinct().order_by('property_id', 'id')
        return units.none()

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        unit = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Unit', unit.pk, f'Added unit {unit.unit_number} to {unit.property.title}.')

    @transaction.atomic
    def perform_update(self, serializer):
        locked_unit = Unit.objects.select_for_update().get(pk=serializer.instance.pk)
        has_approved_application = RentalApplication.objects.filter(inquiry__unit=locked_unit, status='Approved').exists()
        requested_status = serializer.validated_data.get('status', locked_unit.status)
        if has_approved_application and requested_status != 'Reserved':
            raise ValidationError({'status': 'This unit is reserved for an approved rental application. Convert or reject that application before releasing the unit.'})
        serializer.instance = locked_unit
        unit = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Unit', unit.pk, f'Updated unit {unit.unit_number}.')

    @transaction.atomic
    def perform_destroy(self, instance):
        instance = Unit.objects.select_for_update().get(pk=instance.pk)
        if instance.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'A unit with an active or pending lease cannot be removed.'})
        if RentalApplication.objects.filter(inquiry__unit=instance, status='Approved').exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'Reject or convert the approved rental application before removing this reserved unit.'})
        unit_label = instance.unit_number
        unit_id = instance.pk
        instance.delete()
        record_activity(self.request.user, 'DELETE', 'Unit', unit_id, f'Removed unit {unit_label}.')


class PropertyInquiryViewSet(viewsets.ModelViewSet):
    queryset = PropertyInquiry.objects.select_related('property', 'agent').all()
    serializer_class = PropertyInquirySerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        inquiries = PropertyInquiry.objects.select_related('property', 'agent')
        if user.role == 'Admin':
            return inquiries.order_by('-created_at')
        if user.role == 'Property Manager':
            return inquiries.filter(property__manager=user).order_by('-created_at')
        if user.role == 'Agent':
            return inquiries.filter(agent=user).order_by('-created_at')
        return inquiries.none()

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrPropertyManagerOrAgent()]
        if self.action in ('partial_update', 'update'):
            return [IsAdminOrPropertyManagerOrAssignedAgent()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        status = 'Viewing Scheduled' if serializer.validated_data.get('viewing_at') else 'New'
        if self.request.user.role == 'Agent':
            inquiry = serializer.save(agent=self.request.user, status=status)
        else:
            inquiry = serializer.save(status=status)
        record_activity(self.request.user, 'CREATE', 'Prospect inquiry', inquiry.pk, f'Logged prospect {inquiry.prospect_name} for {inquiry.property.title}.')

    def perform_update(self, serializer):
        inquiry = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Prospect inquiry', inquiry.pk, f'Updated inquiry status to {inquiry.status}.')


class IsAdminOrPropertyManagerOrAgent(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted
                    and user.role in ('Admin', 'Property Manager', 'Agent'))


class IsAdminOrPropertyManagerOrAssignedAgent(IsAdminOrPropertyManagerOrAgent):
    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role in ('Admin', 'Property Manager'):
            return True
        return obj.agent_id == user.id and obj.property.assigned_agents.filter(pk=user.pk).exists()


class RentalApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = RentalApplicationSerializer
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        applications = RentalApplication.objects.select_related(
            'inquiry', 'inquiry__property', 'inquiry__unit', 'inquiry__agent', 'created_by',
            'reviewed_by', 'owner_reviewed_by'
        ).prefetch_related('inquiry__property__assigned_agents', 'decisions__actor')
        if user.role == 'Admin':
            return applications.order_by('-created_at')
        if user.role == 'Property Manager':
            return applications.filter(inquiry__property__manager=user).order_by('-created_at')
        if user.role == 'Owner':
            return applications.filter(inquiry__property__owner=user).order_by('-created_at')
        if user.role == 'Agent':
            return applications.filter(inquiry__agent=user, created_by=user).order_by('-created_at')
        return applications.none()

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrPropertyManagerOrAgent()]
        if self.action in ('partial_update', 'update'):
            return [IsApplicationReviewer()]
        if self.action == 'create_lease':
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        inquiry = serializer.validated_data['inquiry']
        application = serializer.save(
            created_by=self.request.user,
            status='Submitted',
            approval_mode=inquiry.property.application_approval_mode,
        )
        RentalApplicationDecision.objects.create(
            application=application,
            from_status='',
            to_status='Submitted',
            authority=self.request.user.role,
            actor=self.request.user,
        )
        inquiry = application.inquiry
        inquiry.status = 'Application In Progress'
        inquiry.prospect_email = application.applicant_email
        inquiry.save(update_fields=['status', 'prospect_email'])
        record_activity(self.request.user, 'CREATE', 'Rental application', application.pk, f'Submitted an application for {inquiry.prospect_name} at {inquiry.property.title}.')

    @transaction.atomic
    def perform_update(self, serializer):
        locked_application = RentalApplication.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = locked_application
        previous_status = serializer.instance.status
        new_status = serializer.validated_data.get('status', previous_status)
        instruction_note = str(serializer.validated_data.pop('decision_instruction_note', '') or '').strip()
        instruction_reference = str(serializer.validated_data.pop('decision_instruction_reference', '') or '').strip()
        allowed_transitions = {
            'Submitted': {'Under Review', 'Approved', 'Rejected'},
            'Under Review': {'Pending Owner Approval', 'Approved', 'Rejected'},
            'Pending Owner Approval': {'Approved', 'Rejected'},
            'Approved': {'Rejected'},
            'Rejected': set(),
            'Converted': set(),
        }
        if new_status != previous_status and new_status not in allowed_transitions.get(previous_status, set()):
            raise ValidationError({'status': f'An application in {previous_status} cannot move to {new_status}.'})
        inquiry = serializer.instance.inquiry
        user_role = self.request.user.role
        approval_mode = serializer.instance.approval_mode or inquiry.property.application_approval_mode
        if user_role == 'Owner' and previous_status != 'Pending Owner Approval':
            raise ValidationError({'status': 'Past decisions are read-only. You may act only on applications awaiting your decision.'})
        if user_role == 'Owner' and approval_mode != 'Owner':
            raise ValidationError({'status': 'The Owner delegated application decisions to the Property Manager for this property.'})
        if user_role == 'Property Manager' and approval_mode == 'Owner' and new_status in ('Approved', 'Rejected'):
            raise ValidationError({'status': 'This property requires the Owner to approve or decline the application.'})
        if user_role == 'Admin' and new_status != previous_status:
            if not instruction_note:
                raise ValidationError({'instructionNote': 'Enter the Owner instruction authorizing this application decision.'})
            if not instruction_reference:
                raise ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
        elif instruction_note or instruction_reference:
            raise ValidationError({'detail': 'Owner instruction details can only be recorded by an Admin.'})
        if previous_status == 'Approved' and new_status == 'Rejected' and Contract.objects.filter(
            source_application=serializer.instance,
            status__in=['Pending', 'Active'],
            is_deleted=False,
        ).exists():
            raise ValidationError({'status': 'A lease has already been prepared for this approved application. End the pending lease before rejecting the application.'})

        if new_status == 'Approved' and previous_status != 'Approved':
            if inquiry.unit_id:
                unit = Unit.objects.select_for_update().get(pk=inquiry.unit_id)
                if unit.status != 'Available':
                    raise ValidationError({'status': 'This unit is no longer available. Refresh applications and choose another unit.'})
                unit.status = 'Reserved'
                unit.save(update_fields=['status'])
            else:
                property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
                if property_obj.status != 'Available':
                    raise ValidationError({'status': 'This property is no longer available.'})
                property_obj.status = 'Pending'
                property_obj.save(update_fields=['status'])

        if user_role == 'Owner':
            application = serializer.save(owner_reviewed_by=self.request.user, owner_reviewed_at=timezone.now())
        else:
            application = serializer.save(reviewed_by=self.request.user, reviewed_at=timezone.now())
        if new_status != previous_status:
            if user_role == 'Owner':
                authority = 'Owner'
                decision_note = application.owner_review_notes
            elif user_role == 'Admin':
                authority = 'Admin Override'
                decision_note = instruction_note
            elif approval_mode == 'Manager':
                authority = 'Manager Delegation'
                decision_note = application.review_notes
            else:
                authority = 'Manager Review'
                decision_note = application.review_notes
            RentalApplicationDecision.objects.create(
                application=application,
                from_status=previous_status,
                to_status=new_status,
                authority=authority,
                note=decision_note,
                instruction_reference=instruction_reference,
                actor=self.request.user,
            )
        if new_status == 'Rejected' and inquiry.status != 'Closed':
            inquiry.status = 'Closed'
            inquiry.save(update_fields=['status'])

        if previous_status == 'Approved' and new_status == 'Rejected':
            if inquiry.unit_id:
                unit = Unit.objects.select_for_update().get(pk=inquiry.unit_id)
                has_lease = unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists()
                has_other_approval = RentalApplication.objects.filter(
                    inquiry__unit=unit, status='Approved'
                ).exclude(pk=application.pk).exists()
                if unit.status == 'Reserved' and not has_lease and not has_other_approval:
                    unit.status = 'Available'
                    unit.save(update_fields=['status'])
            else:
                property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
                has_active_lease = Contract.objects.filter(
                    property=property_obj, status__in=['Active', 'Pending'], is_deleted=False
                ).exists()
                has_other_approval = RentalApplication.objects.filter(
                    inquiry__property=property_obj, status='Approved'
                ).exclude(pk=application.pk).exists()
                if property_obj.status == 'Pending' and not has_active_lease and not has_other_approval:
                    property_obj.status = 'Available'
                    property_obj.save(update_fields=['status'])

        record_activity(self.request.user, 'REVIEW', 'Rental application', application.pk, f'Changed application status to {application.status}.')

    @action(detail=True, methods=['post'], url_path='create-lease')
    @transaction.atomic
    def create_lease(self, request, pk=None):
        application = self.get_object()
        application = RentalApplication.objects.select_for_update().select_related(
            'inquiry', 'inquiry__property', 'inquiry__unit'
        ).get(pk=application.pk)
        if application.status != 'Approved':
            raise ValidationError({'status': 'Only approved applications can be converted into a lease.'})
        if Contract.objects.filter(
            source_application=application,
            status__in=['Pending', 'Active'],
            is_deleted=False,
        ).exists():
            raise ValidationError({'application': 'A pending or active lease already exists for this application.'})

        inquiry = application.inquiry
        applicant_email = application.applicant_email.strip().casefold()
        matching_tenant = User.objects.filter(
            role=User.Role.TENANT,
            is_active=True,
            is_deleted=False,
            email__iexact=applicant_email,
        ).first()
        if not matching_tenant:
            raise ValidationError({
                'tenant': 'No tenant account exists for this applicant yet. Ask an Admin to create the tenant account, then prepare the lease.'
            })
        try:
            selected_tenant_id = int(request.data.get('tenant'))
        except (TypeError, ValueError):
            selected_tenant_id = None
        if selected_tenant_id != matching_tenant.pk:
            raise ValidationError({'tenant': 'Select the existing tenant account whose email matches the applicant.'})
        unit = inquiry.unit
        if unit:
            unit = Unit.objects.select_for_update().get(pk=unit.pk)
            if unit.status != 'Reserved':
                raise ValidationError({'unit': 'The approved application no longer holds this unit. Review its availability before creating a lease.'})
        else:
            property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
            if property_obj.status != 'Pending':
                raise ValidationError({'property': 'The approved application no longer holds this property.'})
        rent_amount = unit.monthly_rate if unit else inquiry.property.price
        lease_payload = {
            'property': inquiry.property_id,
            'unit': unit.pk if unit else None,
            'tenant': request.data.get('tenant'),
            'startDate': request.data.get('startDate') or application.move_in_date,
            'endDate': request.data.get('endDate'),
            'rentAmount': rent_amount,
            'rentDueDay': request.data.get('rentDueDay', 1),
            'depositAmount': request.data.get('depositAmount', 0),
        }
        lease_serializer = ContractSerializer(
            data=lease_payload,
            context={'request': request, 'approved_application': application},
        )
        lease_serializer.is_valid(raise_exception=True)
        tenant = lease_serializer.validated_data['tenant']
        if tenant.email.strip().casefold() != application.applicant_email.strip().casefold():
            raise ValidationError({'tenant': 'Select or create a tenant account using the applicant email address.'})
        contract = lease_serializer.save(source_application=application)
        record_activity(request.user, 'CREATE', 'Contract', contract.pk, f'Prepared a pending lease from approved application {application.pk}.')
        record_activity(request.user, 'PREPARE', 'Rental application', application.pk, f'Prepared lease {contract.pk}; application remains approved until lease activation.')

        return Response({
            'application': RentalApplicationSerializer(application, context={'request': request}).data,
            'contract': ContractSerializer(contract, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)

class OwnerPortfolioView(APIView):
    permission_classes = [IsAdminOrOwner]

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
        contracts = Contract.objects.filter(property_id__in=property_ids, is_deleted=False)
        maintenance = MaintenanceRequest.objects.filter(property_id__in=property_ids, is_deleted=False)
        from billing.models import Invoice
        from billing.serializers import InvoiceSerializer
        invoices = Invoice.objects.filter(
            property_id__in=financial_property_ids,
        ).filter(
            Q(is_deleted=False) | Q(payments__isnull=False),
        ).distinct().prefetch_related('payments').order_by('-id')
        property_id_strings = [str(property_id) for property_id in property_ids]
        contract_id_strings = [str(contract_id) for contract_id in contracts.values_list('id', flat=True)]
        signing_events = AuditEvent.objects.select_related('actor').filter(
            action__in=[
                'GRANT LEASE SIGNING AUTHORITY',
                'REVOKE LEASE SIGNING AUTHORITY',
                'GRANT LEASE TERMINATION AUTHORITY',
                'REVOKE LEASE TERMINATION AUTHORITY',
                'CHANGE APPLICATION APPROVAL RULE',
                'ACTIVATE',
                'TERMINATE',
            ],
        ).filter(
            Q(entity_type='Property', entity_id__in=property_id_strings)
            | Q(entity_type='Contract', entity_id__in=contract_id_strings)
        ).order_by('-created_at')[:100]

        return Response({
            "properties": PropertySerializer(properties, many=True, context={'request': request}).data,
            "contracts": ContractSerializer(contracts, many=True, context={'request': request}).data,
            "maintenanceRequests": MaintenanceRequestSerializer(maintenance, many=True, context={'request': request}).data,
            "invoices": InvoiceSerializer(invoices, many=True).data,
            "leaseSigningHistory": [{
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
            } for event in signing_events],
        })
