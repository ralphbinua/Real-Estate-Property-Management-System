from rest_framework import serializers
from .models import MaintenanceRequest
from properties.models import Property, Unit
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    issueDescription = serializers.CharField(source='issue_description')
    
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.filter(is_deleted=False))
    tenant = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.TENANT, is_active=True, is_deleted=False),
        required=False,
    )
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), required=False, allow_null=True, default=None)

    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = MaintenanceRequest
        fields = [
            '_id', 'property', 'unit', 'tenant', 'issueDescription', 
            'status', 'propertyDetails', 'tenantDetails', 'created_at'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.role != User.Role.ADMIN:
            self.fields['tenant'].read_only = True
        elif request and self.instance is None:
            self.fields['tenant'].required = True

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))

        if unit and property_obj and unit.property_id != property_obj.id:
            raise serializers.ValidationError({'unit': 'The selected unit must belong to the selected property.'})

        if user and user.role == User.Role.TENANT:
            if property_obj and not (
                property_obj.units.filter(tenant=user).exists()
                or property_obj.contracts.filter(tenant=user, status='Active', is_deleted=False).exists()
            ):
                raise serializers.ValidationError({'property': 'You can only report issues for a property you currently rent.'})
            if unit and unit.tenant_id != user.id:
                raise serializers.ValidationError({'unit': 'You can only report issues for your assigned unit.'})

        if user and user.role == User.Role.PROPERTY_MANAGER:
            if property_obj and property_obj.manager_id != user.id:
                raise serializers.ValidationError({'property': 'You can only manage maintenance for assigned properties.'})

        tenant = attrs.get('tenant', getattr(self.instance, 'tenant', user if user and user.role == User.Role.TENANT else None))
        if tenant and property_obj and not (
            property_obj.units.filter(tenant=tenant).exists()
            or property_obj.contracts.filter(tenant=tenant, status='Active', is_deleted=False).exists()
        ):
            raise serializers.ValidationError({'tenant': 'The selected tenant must currently rent this property.'})

        if user and user.role == User.Role.AGENT:
            if property_obj and not property_obj.assigned_agents.filter(pk=user.pk).exists():
                raise serializers.ValidationError({'property': 'You can only view maintenance for properties assigned to you.'})
        return attrs

    def create(self, validated_data):
        request_obj = self.context.get('request')
        if 'tenant' not in validated_data and request_obj and request_obj.user.is_authenticated:
            validated_data['tenant'] = request_obj.user
        return super().create(validated_data)
