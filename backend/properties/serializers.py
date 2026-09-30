from rest_framework import serializers
from .models import Property, Unit, PropertyInquiry
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class UnitSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    propertyId = serializers.IntegerField(source='property_id', read_only=True)
    unitNumber = serializers.CharField(source='unit_number')
    monthlyRate = serializers.DecimalField(source='monthly_rate', max_digits=10, decimal_places=2)
    tenantId = serializers.IntegerField(source='tenant_id', read_only=True, allow_null=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = Unit
        fields = ['_id', 'propertyId', 'unitNumber', 'monthlyRate', 'status', 'tenantId', 'tenantDetails']


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
        if requested_status in ('Occupied', 'Reserved'):
            related_contracts = self.instance.contracts.filter(is_deleted=False) if self.instance else Unit.objects.none()
            expected = 'Occupied' if related_contracts.filter(status='Active').exists() else 'Reserved' if related_contracts.filter(status='Pending').exists() else None
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
    monthlyRate = serializers.DecimalField(source='price', max_digits=10, decimal_places=2, required=False)
    units = UnitSerializer(many=True, required=False)

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
            'monthlyRate', 'status', 'units', 'owner', 'manager', 'assignedAgents',
            'ownerDetails', 'managerDetails'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and getattr(request.user, 'role', None) != User.Role.ADMIN:
            for field_name in ('owner', 'manager', 'assignedAgents'):
                self.fields[field_name].read_only = True
        if self.instance is not None:
            self.fields['units'].read_only = True

    def create(self, validated_data):
        units_data = validated_data.pop('units', [])
        assigned_agents = validated_data.pop('assigned_agents', [])
        property_obj = Property.objects.create(**validated_data)
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
        if 'status' in attrs and attrs['status'] == 'Viewing Scheduled' and not attrs.get('viewing_at', getattr(self.instance, 'viewing_at', None)):
            raise serializers.ValidationError({'viewing_at': 'Set a viewing date and time before marking this inquiry as scheduled.'})
        return attrs
