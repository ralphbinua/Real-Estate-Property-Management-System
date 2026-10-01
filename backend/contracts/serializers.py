from rest_framework import serializers
from .models import Contract
from properties.models import Property, Unit
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()

class ContractSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    startDate = serializers.DateField(source='start_date')
    endDate = serializers.DateField(source='end_date')
    rentAmount = serializers.DecimalField(source='rent_amount', max_digits=10, decimal_places=2)
    depositAmount = serializers.DecimalField(source='deposit_amount', max_digits=10, decimal_places=2, required=False, default=0.00)
    
    # FK IDs for writing payloads
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.filter(is_deleted=False))
    tenant = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role=User.Role.TENANT, is_active=True, is_deleted=False))
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.filter(property__is_deleted=False), required=False, allow_null=True, default=None)

    # Nested object details for reading/displaying names in React
    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)
    unitDetails = serializers.SerializerMethodField()

    class Meta:
        model = Contract
        fields = [
            '_id', 'property', 'unit', 'tenant', 'startDate', 'endDate', 
            'rentAmount', 'depositAmount', 'status', 'propertyDetails', 'tenantDetails', 'unitDetails'
        ]

    def get_unitDetails(self, instance):
        if not instance.unit_id:
            return None
        from properties.serializers import UnitSerializer
        return UnitSerializer(instance.unit).data

    def validate(self, attrs):
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        if property_obj and unit and unit.property_id != property_obj.id:
            raise serializers.ValidationError({'unit': 'The selected unit must belong to the selected property.'})

        if property_obj and not unit and property_obj.units.count() == 1:
            unit = property_obj.units.first()
            attrs['unit'] = unit
        if property_obj and property_obj.units.exists() and not unit:
            raise serializers.ValidationError({'unit': 'Select an available unit for this property.'})
        requested_status = attrs.get('status', getattr(self.instance, 'status', 'Active'))
        if requested_status in ('Active', 'Pending') and unit and unit.status != 'Available':
            is_current_reservation = bool(
                self.instance
                and unit.pk == self.instance.unit_id
                and unit.contracts.filter(pk=self.instance.pk).exists()
            )
            approved_application = self.context.get('approved_application')
            is_application_reservation = bool(
                approved_application
                and approved_application.status == 'Approved'
                and approved_application.inquiry.unit_id == unit.pk
                and unit.status == 'Reserved'
            )
            if not is_current_reservation and not is_application_reservation:
                raise serializers.ValidationError({'unit': 'The selected unit is not available.'})
        if requested_status in ('Active', 'Pending') and unit and unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=getattr(self.instance, 'pk', None)).exists():
            raise serializers.ValidationError({'unit': 'The selected unit already has an active or pending lease.'})

        if user and getattr(user, 'role', None) == User.Role.PROPERTY_MANAGER:
            if property_obj and property_obj.manager_id != user.id:
                raise serializers.ValidationError({'property': 'You can only create leases for properties assigned to you.'})

        tenant = attrs.get('tenant', getattr(self.instance, 'tenant', None))
        if tenant and tenant.role != User.Role.TENANT:
            raise serializers.ValidationError({'tenant': 'The lease must be assigned to a tenant account.'})
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date <= start_date:
            raise serializers.ValidationError({'endDate': 'The lease end date must be after its start date.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        contract = Contract.objects.create(**validated_data)
        if contract.status in ('Active', 'Pending') and contract.unit_id:
            contract.unit.status = 'Occupied' if contract.status == 'Active' else 'Reserved'
            contract.unit.tenant = contract.tenant if contract.status == 'Active' else None
            contract.unit.save(update_fields=['status', 'tenant'])
        prop = contract.property
        if contract.status == 'Active' and (not prop.units.exists() or not prop.units.exclude(status='Occupied').exists()):
            prop.status = 'Occupied'
            prop.save(update_fields=['status'])
        return contract

    @transaction.atomic
    def update(self, instance, validated_data):
        old_property = instance.property
        old_unit = instance.unit
        contract = super().update(instance, validated_data)
        if old_unit and old_unit.pk != contract.unit_id and not old_unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=contract.pk).exists():
            old_unit.status = 'Available'
            old_unit.tenant = None
            old_unit.save(update_fields=['status', 'tenant'])
        if contract.unit_id:
            if contract.status in ('Active', 'Pending'):
                contract.unit.status = 'Occupied' if contract.status == 'Active' else 'Reserved'
                contract.unit.tenant = contract.tenant if contract.status == 'Active' else None
            elif contract.status in ('Terminated', 'Expired') and not contract.unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=contract.pk).exists():
                contract.unit.status = 'Available'
                contract.unit.tenant = None
            contract.unit.save(update_fields=['status', 'tenant'])
        for prop in {old_property, contract.property}:
            if prop.units.exists():
                prop.status = 'Available' if prop.units.exclude(status='Occupied').exists() else 'Occupied'
            elif not prop.contracts.filter(status='Active', is_deleted=False).exists():
                prop.status = 'Available'
            prop.save(update_fields=['status'])
        return contract
