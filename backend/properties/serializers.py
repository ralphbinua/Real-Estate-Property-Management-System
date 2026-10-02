from rest_framework import serializers
from django.utils import timezone
from .models import Property, Unit, PropertyInquiry, RentalApplication
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class UnitSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    propertyId = serializers.IntegerField(source='property_id', read_only=True)
    unitNumber = serializers.CharField(source='unit_number')
    monthlyRate = serializers.DecimalField(source='monthly_rate', max_digits=10, decimal_places=2, min_value=0.01)
    tenantId = serializers.IntegerField(source='tenant_id', read_only=True, allow_null=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = Unit
        fields = ['_id', 'propertyId', 'unitNumber', 'monthlyRate', 'status', 'tenantId', 'tenantDetails']

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role == User.Role.AGENT:
            data.pop('tenantId', None)
            data.pop('tenantDetails', None)
        elif user and user.role == User.Role.TENANT and instance.tenant_id != user.pk:
            data.pop('tenantId', None)
            data.pop('tenantDetails', None)
        return data


class UnitManagementSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.filter(is_deleted=False))
    unitNumber = serializers.CharField(source='unit_number')
    monthlyRate = serializers.DecimalField(source='monthly_rate', max_digits=12, decimal_places=2)

    class Meta:
        model = Unit
        fields = ['_id', 'property', 'unitNumber', 'monthlyRate', 'status']

    def validate(self, attrs):
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        unit_number = attrs.get('unit_number', getattr(self.instance, 'unit_number', None))
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and getattr(user, 'role', None) == User.Role.PROPERTY_MANAGER:
            if property_obj and property_obj.manager_id != user.id:
                raise serializers.ValidationError({'property': 'You can only manage units on properties assigned to you.'})
        if property_obj and unit_number and Unit.objects.filter(property=property_obj, unit_number=unit_number).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({'unitNumber': 'This unit number is already used on the selected property.'})
        requested_status = attrs.get('status', getattr(self.instance, 'status', 'Available'))
        has_approved_application = bool(self.instance and RentalApplication.objects.filter(
            inquiry__unit=self.instance, status='Approved'
        ).exists())
        if has_approved_application and requested_status != 'Reserved':
            raise serializers.ValidationError({'status': 'This unit is reserved for an approved rental application. Convert or reject that application before releasing the unit.'})
        if requested_status in ('Occupied', 'Reserved'):
            related_contracts = self.instance.contracts.filter(is_deleted=False) if self.instance else Unit.objects.none()
            expected = (
                'Occupied' if related_contracts.filter(status='Active').exists()
                else 'Reserved' if related_contracts.filter(status='Pending').exists() or has_approved_application
                else None
            )
            if requested_status != expected:
                raise serializers.ValidationError({'status': 'Units become occupied or reserved through a lease contract.'})
        if self.instance and self.instance.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
            expected_status = 'Occupied' if self.instance.contracts.filter(status='Active', is_deleted=False).exists() else 'Reserved'
            if property_obj and property_obj.pk != self.instance.property_id:
                raise serializers.ValidationError({'property': 'A unit with an active or pending lease cannot be moved to another property.'})
            requested_status = attrs.get('status', expected_status)
            if requested_status != expected_status:
                raise serializers.ValidationError({'status': f'A unit with an active or pending lease must remain {expected_status.lower()}.'})
        return attrs

class PropertySerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    propertyType = serializers.CharField(source='property_type')
    applicationApprovalMode = serializers.ChoiceField(
        source='application_approval_mode', choices=Property.APPLICATION_APPROVAL_MODES, required=False
    )
    monthlyRate = serializers.DecimalField(source='price', max_digits=10, decimal_places=2, required=False)
    units = UnitSerializer(many=True, required=False)
    managerLeaseSigningAuthorized = serializers.SerializerMethodField()
    leaseSigningAgreementReference = serializers.SerializerMethodField()
    leaseSigningAuthorizedAt = serializers.SerializerMethodField()
    managerLeaseTerminationAuthorized = serializers.SerializerMethodField()
    leaseTerminationAgreementReference = serializers.SerializerMethodField()
    leaseTerminationAuthorizedAt = serializers.SerializerMethodField()
    approvalPolicyHistory = serializers.SerializerMethodField()
    instructionNote = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=True)
    instructionReference = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=500, trim_whitespace=True)

    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.OWNER, is_active=True, is_deleted=False), required=False, allow_null=True
    )
    manager = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.PROPERTY_MANAGER, is_active=True, is_deleted=False), required=False, allow_null=True
    )
    assignedAgents = serializers.PrimaryKeyRelatedField(
        source='assigned_agents',
        queryset=User.objects.filter(role=User.Role.AGENT, is_active=True, is_deleted=False),
        many=True,
        required=False,
    )

    ownerDetails = UserSerializer(source='owner', read_only=True)
    managerDetails = UserSerializer(source='manager', read_only=True)

    class Meta:
        model = Property
        fields = [
            '_id', 'title', 'description', 'address', 'propertyType', 'price', 
            'monthlyRate', 'status', 'applicationApprovalMode', 'units', 'owner', 'manager', 'assignedAgents',
            'ownerDetails', 'managerDetails', 'managerLeaseSigningAuthorized',
            'leaseSigningAgreementReference', 'leaseSigningAuthorizedAt',
            'managerLeaseTerminationAuthorized', 'leaseTerminationAgreementReference',
            'leaseTerminationAuthorizedAt', 'approvalPolicyHistory',
            'instructionNote', 'instructionReference',
        ]

    def get_managerLeaseSigningAuthorized(self, instance):
        authorization = getattr(instance, 'lease_signing_authorization', None)
        return bool(
            authorization
            and authorization.is_active
            and authorization.manager_id
            and authorization.manager_id == instance.manager_id
            and authorization.granted_by_id == instance.owner_id
        )

    def get_leaseSigningAgreementReference(self, instance):
        authorization = getattr(instance, 'lease_signing_authorization', None)
        if not authorization or not authorization.is_active or authorization.manager_id != instance.manager_id or authorization.granted_by_id != instance.owner_id:
            return ''
        return authorization.agreement_reference

    def get_leaseSigningAuthorizedAt(self, instance):
        authorization = getattr(instance, 'lease_signing_authorization', None)
        if not authorization or not authorization.is_active or authorization.manager_id != instance.manager_id or authorization.granted_by_id != instance.owner_id:
            return None
        return authorization.granted_at

    def _active_termination_authorization(self, instance):
        authorization = getattr(instance, 'lease_termination_authorization', None)
        if (
            not authorization
            or not authorization.is_active
            or authorization.manager_id != instance.manager_id
            or authorization.granted_by_id != instance.owner_id
        ):
            return None
        return authorization

    def get_managerLeaseTerminationAuthorized(self, instance):
        return self._active_termination_authorization(instance) is not None

    def get_leaseTerminationAgreementReference(self, instance):
        authorization = self._active_termination_authorization(instance)
        return authorization.agreement_reference if authorization else ''

    def get_leaseTerminationAuthorizedAt(self, instance):
        authorization = self._active_termination_authorization(instance)
        return authorization.granted_at if authorization else None

    def get_approvalPolicyHistory(self, instance):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or user.role not in (User.Role.ADMIN, User.Role.OWNER):
            return []
        changes = instance.approval_policy_changes.select_related('changed_by')[:20]
        return [{
            'previousMode': change.previous_mode,
            'newMode': change.new_mode,
            'changedBy': (
                change.changed_by.get_full_name() or change.changed_by.email
                if change.changed_by else 'System'
            ),
            'changedAt': change.changed_at,
            'instructionNote': change.instruction_note,
            'instructionReference': change.instruction_reference,
        } for change in changes]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        role = getattr(getattr(request, 'user', None), 'role', None)
        if request and role != User.Role.ADMIN:
            for field_name in ('owner', 'manager', 'assignedAgents'):
                self.fields[field_name].read_only = True
        if self.instance is not None or role not in (User.Role.ADMIN, User.Role.OWNER):
            self.fields['applicationApprovalMode'].read_only = True
        if self.instance is not None:
            self.fields['units'].read_only = True

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role in (User.Role.AGENT, User.Role.TENANT):
            data.pop('owner', None)
            data.pop('ownerDetails', None)
            data.pop('managerLeaseSigningAuthorized', None)
            data.pop('leaseSigningAgreementReference', None)
            data.pop('leaseSigningAuthorizedAt', None)
            data.pop('managerLeaseTerminationAuthorized', None)
            data.pop('leaseTerminationAgreementReference', None)
            data.pop('leaseTerminationAuthorizedAt', None)
            data.pop('approvalPolicyHistory', None)
        elif user and user.role == User.Role.PROPERTY_MANAGER:
            data.pop('leaseSigningAgreementReference', None)
            data.pop('leaseSigningAuthorizedAt', None)
            data.pop('leaseTerminationAgreementReference', None)
            data.pop('leaseTerminationAuthorizedAt', None)
        elif user and user.role == User.Role.OWNER and instance.owner_id != user.pk:
            data.pop('leaseSigningAgreementReference', None)
            data.pop('leaseSigningAuthorizedAt', None)
        return data

    def validate_units(self, units):
        unit_numbers = [str(unit.get('unit_number', '')).strip().casefold() for unit in units]
        if any(not number for number in unit_numbers):
            raise serializers.ValidationError('Every unit must have a unit number.')
        if len(unit_numbers) != len(set(unit_numbers)):
            raise serializers.ValidationError('Unit numbers must be unique within the property.')
        return units

    def validate(self, attrs):
        request = self.context.get('request')
        actor = getattr(request, 'user', None)
        requested_mode = attrs.get(
            'application_approval_mode',
            getattr(self.instance, 'application_approval_mode', 'Owner'),
        )
        requested_owner = attrs.get('owner', getattr(self.instance, 'owner', None))
        requested_manager = attrs.get('manager', getattr(self.instance, 'manager', None))
        if actor and actor.role == User.Role.OWNER and not self.instance:
            requested_owner = actor
        if actor and actor.role in (User.Role.ADMIN, User.Role.OWNER) and not self.instance and not requested_owner:
            raise serializers.ValidationError({
                'owner': 'Assign a property owner before saving its application-approval rule.'
            })
        if actor and actor.role in (User.Role.ADMIN, User.Role.OWNER) and not self.instance and requested_mode == 'Manager' and not requested_manager:
            raise serializers.ValidationError({'manager': 'Assign a Property Manager before delegating application decisions.'})
        if actor and actor.role == User.Role.ADMIN and not self.instance and requested_mode == 'Manager':
            if not attrs.get('instruction_note', '').strip():
                raise serializers.ValidationError({'instructionNote': 'Enter the Owner instruction authorizing delegated Manager approval.'})
            if not attrs.get('instruction_reference', '').strip():
                raise serializers.ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
        if self.instance and self.instance.status == 'Pending':
            requested_status = attrs.get('status', self.instance.status)
            has_approved_application = RentalApplication.objects.filter(
                inquiry__property=self.instance,
                inquiry__unit__isnull=True,
                status='Approved',
            ).exists()
            if has_approved_application and requested_status != 'Pending':
                raise serializers.ValidationError({'status': 'This property is reserved for an approved rental application. Convert or reject that application before releasing it.'})
        return super().validate(attrs)

    def create(self, validated_data):
        units_data = validated_data.pop('units', [])
        assigned_agents = validated_data.pop('assigned_agents', [])
        instruction_note = validated_data.pop('instruction_note', '')
        instruction_reference = validated_data.pop('instruction_reference', '')
        property_obj = Property.objects.create(**validated_data)
        property_obj._creation_instruction = (instruction_note, instruction_reference)
        property_obj.assigned_agents.set(assigned_agents)
        # Property.save creates a default house unit; replace it when the form supplied units.
        if units_data:
            property_obj.units.all().delete()
        for unit_data in units_data:
            Unit.objects.create(property=property_obj, **unit_data)
        return property_obj


class PropertyInquirySerializer(serializers.ModelSerializer):
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.filter(is_deleted=False))
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.filter(property__is_deleted=False), required=False, allow_null=True)
    agentDetails = UserSerializer(source='agent', read_only=True)

    class Meta:
        model = PropertyInquiry
        fields = ['id', 'property', 'unit', 'agent', 'agentDetails', 'prospect_name', 'prospect_email', 'viewing_at', 'notes', 'status', 'created_at']
        read_only_fields = ['id', 'agent', 'created_at']

    def validate_property(self, property_obj):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role == User.Role.AGENT and not property_obj.assigned_agents.filter(pk=user.pk).exists():
            raise serializers.ValidationError('You may only create inquiries for properties assigned to you.')
        if user and user.role == User.Role.PROPERTY_MANAGER and property_obj.manager_id != user.id:
            raise serializers.ValidationError('You may only create inquiries for properties assigned to you.')
        return property_obj

    def validate(self, attrs):
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))
        if unit and property_obj and unit.property_id != property_obj.id:
            raise serializers.ValidationError({'unit': 'The selected unit must belong to the selected property.'})
        if unit and unit.status != 'Available' and (not self.instance or unit.pk != self.instance.unit_id):
            raise serializers.ValidationError({'unit': 'Viewings can only be scheduled for available units.'})
        if property_obj and property_obj.units.exists() and not unit:
            raise serializers.ValidationError({'unit': 'Choose an available unit for this property.'})
        if property_obj and not property_obj.units.exists() and property_obj.status != 'Available':
            raise serializers.ValidationError({'property': 'Viewings can only be scheduled for available properties.'})
        requested_status = attrs.get('status')
        if requested_status == 'Application In Progress' and self.instance and not RentalApplication.objects.filter(inquiry=self.instance).exists():
            raise serializers.ValidationError({'status': 'Start a rental application before changing this inquiry to application in progress.'})
        if requested_status == 'Converted' and self.instance:
            application = RentalApplication.objects.filter(inquiry=self.instance).first()
            if not application or application.status != 'Converted':
                raise serializers.ValidationError({'status': 'Convert this inquiry by creating a lease from its approved application.'})
        if 'status' in attrs and attrs['status'] == 'Viewing Scheduled' and not attrs.get('viewing_at', getattr(self.instance, 'viewing_at', None)):
            raise serializers.ValidationError({'viewing_at': 'Set a viewing date and time before marking this inquiry as scheduled.'})
        viewing_at = attrs.get('viewing_at', getattr(self.instance, 'viewing_at', None))
        if viewing_at and ('viewing_at' in attrs or requested_status == 'Viewing Scheduled') and viewing_at <= timezone.now():
            raise serializers.ValidationError({'viewing_at': 'Choose a future date and time for the viewing.'})
        return attrs


class RentalApplicationSerializer(serializers.ModelSerializer):
    inquiryDetails = PropertyInquirySerializer(source='inquiry', read_only=True)
    applicantName = serializers.CharField(source='inquiry.prospect_name', read_only=True)
    applicantEmail = serializers.EmailField(source='applicant_email', required=True, allow_blank=False)
    applicationApprovalMode = serializers.SerializerMethodField()
    employment = serializers.CharField(required=True, allow_blank=False, trim_whitespace=True)
    propertyDetails = PropertySerializer(source='inquiry.property', read_only=True)
    unitDetails = UnitSerializer(source='inquiry.unit', read_only=True, allow_null=True)
    monthlyIncome = serializers.DecimalField(source='monthly_income', max_digits=12, decimal_places=2, min_value=0, required=True)
    moveInDate = serializers.DateField(source='move_in_date', required=True)
    reviewNotes = serializers.CharField(source='review_notes', required=False, allow_blank=True)
    ownerReviewNotes = serializers.CharField(source='owner_review_notes', required=False, allow_blank=True)
    createdBy = UserSerializer(source='created_by', read_only=True)
    reviewedBy = UserSerializer(source='reviewed_by', read_only=True)
    ownerReviewedBy = UserSerializer(source='owner_reviewed_by', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    reviewedAt = serializers.DateTimeField(source='reviewed_at', read_only=True, allow_null=True)
    ownerReviewedAt = serializers.DateTimeField(source='owner_reviewed_at', read_only=True, allow_null=True)
    decisionHistory = serializers.SerializerMethodField()
    instructionNote = serializers.CharField(source='decision_instruction_note', required=False, allow_blank=True, write_only=True, trim_whitespace=True)
    instructionReference = serializers.CharField(source='decision_instruction_reference', required=False, allow_blank=True, write_only=True, max_length=500, trim_whitespace=True)

    class Meta:
        model = RentalApplication
        fields = [
            'id', 'inquiry', 'inquiryDetails', 'applicantName', 'applicantEmail', 'applicationApprovalMode',
            'propertyDetails', 'unitDetails', 'employment', 'monthlyIncome',
            'moveInDate', 'notes', 'status', 'reviewNotes', 'ownerReviewNotes', 'createdBy',
            'reviewedBy', 'ownerReviewedBy', 'createdAt', 'reviewedAt', 'ownerReviewedAt',
            'decisionHistory', 'instructionNote', 'instructionReference',
        ]
        read_only_fields = [
            'id', 'createdBy', 'reviewedBy', 'ownerReviewedBy', 'createdAt', 'reviewedAt',
            'ownerReviewedAt', 'applicationApprovalMode',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role not in (User.Role.ADMIN, User.Role.PROPERTY_MANAGER):
            self.fields['reviewNotes'].read_only = True
        if user and user.role not in (User.Role.ADMIN, User.Role.OWNER):
            self.fields['ownerReviewNotes'].read_only = True
        if self.instance is not None:
            for field_name in ('inquiry', 'applicantEmail', 'employment', 'monthlyIncome', 'moveInDate', 'notes'):
                self.fields[field_name].read_only = True

    def get_decisionHistory(self, instance):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        can_view_admin_reference = bool(user and user.role in (User.Role.ADMIN, User.Role.OWNER))
        history = []
        for decision in instance.decisions.select_related('actor').all():
            item = {
                'fromStatus': decision.from_status,
                'toStatus': decision.to_status,
                'authority': decision.authority,
                'note': decision.note,
                'actor': (
                    decision.actor.get_full_name() or decision.actor.email
                    if decision.actor else 'System'
                ),
                'createdAt': decision.created_at,
            }
            if can_view_admin_reference:
                item['instructionReference'] = decision.instruction_reference
            history.append(item)
        return history

    def get_applicationApprovalMode(self, instance):
        return instance.approval_mode or instance.inquiry.property.application_approval_mode

    def validate_inquiry(self, inquiry):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role == User.Role.AGENT:
            if inquiry.agent_id != user.pk or not inquiry.property.assigned_agents.filter(pk=user.pk).exists():
                raise serializers.ValidationError('You may only apply for an inquiry assigned to you.')
        elif user and user.role == User.Role.PROPERTY_MANAGER and inquiry.property.manager_id != user.pk:
            raise serializers.ValidationError('You may only apply for inquiries on properties you manage.')
        if RentalApplication.objects.filter(inquiry=inquiry).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError('An application already exists for this inquiry.')
        if inquiry.unit_id and inquiry.unit.status != 'Available':
            raise serializers.ValidationError({'inquiry': 'This unit is no longer available for applications.'})
        if not inquiry.unit_id and inquiry.property.status != 'Available':
            raise serializers.ValidationError({'inquiry': 'This property is no longer available for applications.'})
        return inquiry

    def validate_status(self, status):
        if self.instance is None:
            raise serializers.ValidationError('New applications must be submitted through the application workflow.')
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        role = getattr(user, 'role', None)
        current = self.instance.status
        approval_mode = self.instance.approval_mode or self.instance.inquiry.property.application_approval_mode

        if status == 'Pending Owner Approval' and approval_mode != 'Owner':
            raise serializers.ValidationError('Owner approval is not enabled for this property.')

        if role == User.Role.OWNER:
            if approval_mode != 'Owner':
                raise serializers.ValidationError('The Owner delegated application decisions to the Property Manager for this property.')
            if current != 'Pending Owner Approval' or status not in ('Approved', 'Rejected'):
                raise serializers.ValidationError('Owners may decide only applications awaiting their approval.')
            return status

        if role == User.Role.PROPERTY_MANAGER and approval_mode == 'Owner':
            manager_transitions = {
                'Submitted': {'Under Review'},
                'Under Review': {'Pending Owner Approval'},
            }
            if status not in manager_transitions.get(current, set()):
                raise serializers.ValidationError('This property requires Owner approval before an application can be approved or rejected.')
            return status

        transitions = {
            'Submitted': {'Under Review', 'Approved', 'Rejected'},
            'Under Review': {'Pending Owner Approval', 'Approved', 'Rejected'},
            'Pending Owner Approval': set(),
            'Approved': {'Rejected'},
            'Rejected': set(),
            'Converted': set(),
        }
        if status not in transitions.get(self.instance.status, set()):
            raise serializers.ValidationError(f'An application in {self.instance.status} cannot move to {status}.')
        return status
