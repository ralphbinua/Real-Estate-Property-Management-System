from rest_framework import viewsets, permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from ..models import Property, Unit, RentalApplication, LeaseSigningAuthorization, LeaseTerminationAuthorization, PropertyAuthorityEvent, PropertyApprovalPolicyChange, UnitPricingAuthorization
from ..serializers import PropertySerializer, UnitManagementSerializer
from ..querysets import property_serializer_queryset
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


from .permissions import IsAdminOrPropertyManager, IsAdminOrOwner, IsOwner, IsOwnerOrAdmin

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer
    pagination_class = OptInPageNumberPagination
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
            scoped_properties = properties
        elif user.role == 'Owner':
            scoped_properties = properties.filter(owner=user)
        elif user.role == 'Property Manager':
            scoped_properties = properties.filter(manager=user)
        elif user.role == 'Agent':
            scoped_properties = properties.filter(assigned_agents=user)
        elif user.role == 'Tenant':
            scoped_properties = properties.filter(
                Q(units__tenant=user)
                | Q(contracts__tenant=user, contracts__is_deleted=False, contracts__status='Active')
            ).distinct()
        else:
            scoped_properties = properties.none()
        property_type = self.request.query_params.get('propertyType')
        property_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if property_type:
            scoped_properties = scoped_properties.filter(property_type=property_type)
        if property_status:
            scoped_properties = scoped_properties.filter(status__iexact=property_status)
        if search:
            scoped_properties = scoped_properties.filter(Q(title__icontains=search) | Q(address__icontains=search))
        return property_serializer_queryset(scoped_properties.order_by('-id'))

    def get_permissions(self):
        if self.action == 'lease_signing_authority':
            return [IsOwner()]
        if self.action == 'lease_termination_authority':
            return [IsOwner()]
        if self.action == 'rent_pricing_authority':
            return [IsOwner()]
        if self.action == 'approval_policy':
            return [IsOwnerOrAdmin()]
        if self.action == 'create':
            return [IsAdminOrOwner()]
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    @transaction.atomic
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
        if instance.manager_id and instance.manager.role == 'Property Manager':
            create_for_recipients(
                recipients=[instance.manager],
                actor=self.request.user,
                event_type=Notification.EventType.PROPERTY,
                title='Property assigned',
                message=f'{instance.title} has been assigned to you.',
                destination=Notification.Destination.MANAGER_PROPERTIES,
            )
        create_for_recipients(
            recipients=instance.assigned_agents.filter(role='Agent'),
            actor=self.request.user,
            event_type=Notification.EventType.PROPERTY,
            title='Property assigned',
            message=f'{instance.title} has been assigned to you.',
            destination=Notification.Destination.AGENT_LISTINGS,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        locked_property = Property.objects.select_for_update().get(pk=serializer.instance.pk)
        previous_owner_id = locked_property.owner_id
        previous_manager_id = locked_property.manager_id
        previous_agent_ids = set(locked_property.assigned_agents.values_list('pk', flat=True))
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
            pricing_authorization = getattr(instance, 'unit_pricing_authorization', None)
            if pricing_authorization and pricing_authorization.is_active:
                pricing_authorization.is_active = False
                pricing_authorization.revoked_by = self.request.user
                pricing_authorization.revoked_at = timezone.now()
                pricing_authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
                PropertyAuthorityEvent.objects.create(
                    property=instance,
                    authority='Rent pricing',
                    action='Revoked',
                    manager_id=pricing_authorization.manager_id or previous_manager_id,
                    recorded_by=self.request.user,
                    agreement_reference=pricing_authorization.agreement_reference,
                )
                record_activity(
                    self.request.user,
                    'REVOKE RENT PRICING AUTHORITY',
                    'Property',
                    instance.pk,
                    'Rent pricing authority was revoked because the property owner or assigned manager changed.',
                )
        record_activity(self.request.user, 'UPDATE', 'Property', instance.pk, f'Updated property {instance.title}.')
        if instance.manager_id and instance.manager_id != previous_manager_id and instance.manager.role == 'Property Manager':
            create_for_recipients(
                recipients=[instance.manager],
                actor=self.request.user,
                event_type=Notification.EventType.PROPERTY,
                title='Property assigned',
                message=f'{instance.title} has been assigned to you.',
                destination=Notification.Destination.MANAGER_PROPERTIES,
            )
        newly_assigned_agents = instance.assigned_agents.filter(role='Agent').exclude(pk__in=previous_agent_ids)
        create_for_recipients(
            recipients=newly_assigned_agents,
            actor=self.request.user,
            event_type=Notification.EventType.PROPERTY,
            title='Property assigned',
            message=f'{instance.title} has been assigned to you.',
            destination=Notification.Destination.AGENT_LISTINGS,
        )

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

    @action(detail=True, methods=['patch'], url_path='rent-pricing-authority')
    @transaction.atomic
    def rent_pricing_authority(self, request, pk=None):
        property_obj = self.get_object()
        property_obj = Property.objects.select_for_update().get(pk=property_obj.pk)
        if property_obj.owner_id != request.user.pk:
            raise ValidationError({'detail': 'You may change pricing authority only for a property you own.'})

        authorized = request.data.get('authorized')
        if not isinstance(authorized, bool):
            raise ValidationError({'authorized': 'Choose whether to grant or revoke manager pricing authority.'})
        authorization = UnitPricingAuthorization.objects.select_for_update().filter(property=property_obj).first()
        if authorized:
            manager = property_obj.manager
            if not manager or manager.role != 'Property Manager' or not manager.is_active or manager.is_deleted:
                raise ValidationError({'detail': 'Assign an active Property Manager before granting pricing authority.'})
            if request.data.get('confirmWrittenAuthority') is not True:
                raise ValidationError({'confirmWrittenAuthority': 'Confirm that the written management agreement grants the manager pricing authority.'})
            agreement_reference = str(request.data.get('agreementReference') or '').strip()
            if not agreement_reference:
                raise ValidationError({'agreementReference': 'Enter a reference to the written management agreement.'})
            if len(agreement_reference) > 500:
                raise ValidationError({'agreementReference': 'The agreement reference cannot exceed 500 characters.'})
            values = {
                'manager': manager,
                'agreement_reference': agreement_reference,
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
                authorization = UnitPricingAuthorization.objects.create(property=property_obj, **values)
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Rent pricing',
                action='Granted',
                manager=manager,
                recorded_by=request.user,
                agreement_reference=agreement_reference,
            )
            record_activity(
                request.user,
                'GRANT RENT PRICING AUTHORITY',
                'Property',
                property_obj.pk,
                f'Granted rent pricing authority to {manager.get_full_name() or manager.email}. Agreement reference: {agreement_reference}.',
            )
        elif authorization and authorization.is_active:
            authorization.is_active = False
            authorization.revoked_by = request.user
            authorization.revoked_at = timezone.now()
            authorization.save(update_fields=['is_active', 'revoked_by', 'revoked_at'])
            PropertyAuthorityEvent.objects.create(
                property=property_obj,
                authority='Rent pricing',
                action='Revoked',
                manager=authorization.manager,
                recorded_by=request.user,
                agreement_reference=authorization.agreement_reference,
            )
            record_activity(
                request.user,
                'REVOKE RENT PRICING AUTHORITY',
                'Property',
                property_obj.pk,
                f'Revoked rent pricing authority for {property_obj.title}.',
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
