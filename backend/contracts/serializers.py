from decimal import Decimal

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
    rentAmount = serializers.DecimalField(source='rent_amount', max_digits=10, decimal_places=2, min_value=Decimal('0.01'))
    rentDueDay = serializers.IntegerField(source='rent_due_day', min_value=1, max_value=28, required=False, default=1)
    depositAmount = serializers.DecimalField(source='deposit_amount', max_digits=10, decimal_places=2, required=False, default=Decimal('0.00'), min_value=Decimal('0.00'))
    status = serializers.CharField(read_only=True)
    sourceApplication = serializers.IntegerField(source='source_application_id', read_only=True, allow_null=True)
    manualLeaseReason = serializers.CharField(source='manual_lease_reason', required=False, allow_blank=True, trim_whitespace=True)
    manualLeaseReference = serializers.CharField(source='manual_lease_reference', required=False, allow_blank=True, max_length=500, trim_whitespace=True)
    activatedBy = UserSerializer(source='activated_by', read_only=True)
    activatedAt = serializers.DateTimeField(source='activated_at', read_only=True, allow_null=True)
    activationBasis = serializers.CharField(source='activation_basis', read_only=True)
    activationNote = serializers.CharField(source='activation_note', read_only=True)
    activationInstructionReference = serializers.CharField(source='activation_instruction_reference', read_only=True)
    signedCopyReference = serializers.CharField(source='signed_copy_reference', read_only=True)
    terminatedBy = UserSerializer(source='terminated_by', read_only=True, allow_null=True)
    terminatedAt = serializers.DateTimeField(source='terminated_at', read_only=True, allow_null=True)
    terminationEffectiveDate = serializers.DateField(source='termination_effective_date', read_only=True, allow_null=True)
    terminationReason = serializers.CharField(source='termination_reason', read_only=True)
    terminationBasis = serializers.CharField(source='termination_basis', read_only=True)
    terminationNote = serializers.CharField(source='termination_note', read_only=True)
    terminationInstructionReference = serializers.CharField(source='termination_instruction_reference', read_only=True)
    
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
            'rentAmount', 'rentDueDay', 'depositAmount', 'status', 'sourceApplication', 'manualLeaseReason',
            'manualLeaseReference', 'activatedBy', 'activatedAt', 'activationBasis', 'activationNote',
            'activationInstructionReference',
            'signedCopyReference', 'terminatedBy', 'terminatedAt', 'terminationEffectiveDate',
            'terminationReason', 'terminationBasis', 'terminationNote', 'terminationInstructionReference',
            'propertyDetails', 'tenantDetails', 'unitDetails'
        ]

    def get_unitDetails(self, instance):
        if not instance.unit_id:
            return None
        from properties.serializers import UnitSerializer
        return UnitSerializer(instance.unit, context=self.context).data

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if isinstance(self.instance, Contract) and self.instance.status != 'Pending':
            for field_name in (
                'property', 'unit', 'tenant', 'startDate', 'endDate', 'rentAmount',
                'rentDueDay', 'depositAmount', 'manualLeaseReason', 'manualLeaseReference',
            ):
                self.fields[field_name].read_only = True

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.role in (User.Role.TENANT, User.Role.AGENT, User.Role.PROPERTY_MANAGER):
            data.pop('activationNote', None)
            data.pop('activationInstructionReference', None)
            data.pop('terminationNote', None)
            data.pop('terminationInstructionReference', None)
            data.pop('signedCopyReference', None)
            if user.role == User.Role.PROPERTY_MANAGER:
                data['propertyDetails'].pop('leaseSigningAgreementReference', None)
                data['propertyDetails'].pop('leaseSigningAuthorizedAt', None)
                data['propertyDetails'].pop('leaseTerminationAgreementReference', None)
                data['propertyDetails'].pop('leaseTerminationAuthorizedAt', None)
        return data

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
        requested_status = attrs.get('status', getattr(self.instance, 'status', 'Pending'))
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

        if requested_status in ('Active', 'Pending') and property_obj and not unit and not property_obj.units.exists():
            existing_leases = Contract.objects.filter(
                property=property_obj,
                unit__isnull=True,
                status__in=['Active', 'Pending'],
                is_deleted=False,
            ).exclude(pk=getattr(self.instance, 'pk', None))
            if existing_leases.exists():
                raise serializers.ValidationError({'property': 'The selected property already has an active or pending lease.'})
            approved_application = self.context.get('approved_application')
            application_holds_property = bool(
                approved_application
                and approved_application.status == 'Approved'
                and approved_application.inquiry.property_id == property_obj.pk
                and approved_application.inquiry.unit_id is None
                and property_obj.status == 'Pending'
            )
            is_current_property_reservation = bool(
                self.instance and not self.instance.is_deleted
                and self.instance.property_id == property_obj.pk and self.instance.unit_id is None
            )
            if property_obj.status != 'Available' and not application_holds_property and not is_current_property_reservation:
                raise serializers.ValidationError({'property': 'The selected property is not available.'})

        if user and getattr(user, 'role', None) == User.Role.PROPERTY_MANAGER:
            if property_obj and property_obj.manager_id != user.id:
                raise serializers.ValidationError({'property': 'You can only create leases for properties assigned to you.'})

        source_application = (
            self.context.get('approved_application')
            or (getattr(self.instance, 'source_application', None) if self.instance else None)
        )
        if source_application:
            if source_application.status != 'Approved':
                raise serializers.ValidationError({'sourceApplication': 'Only an approved application can be used to prepare a lease.'})
            inquiry = source_application.inquiry
            if property_obj and property_obj.pk != inquiry.property_id:
                raise serializers.ValidationError({'property': 'A lease prepared from an application must stay with the property on that application.'})
            expected_unit_id = inquiry.unit_id
            if expected_unit_id is None and property_obj and property_obj.units.count() == 1:
                expected_unit_id = property_obj.units.first().pk
            if (unit.pk if unit else None) != expected_unit_id:
                raise serializers.ValidationError({'unit': 'A lease prepared from an application must stay with the unit on that application.'})

        tenant = attrs.get('tenant', getattr(self.instance, 'tenant', None))
        if tenant and tenant.role != User.Role.TENANT:
            raise serializers.ValidationError({'tenant': 'The lease must be assigned to a tenant account.'})
        if source_application and tenant and tenant.email.strip().casefold() != source_application.applicant_email.strip().casefold():
            raise serializers.ValidationError({'tenant': 'A lease prepared from an application must use the applicant email address.'})
        start_date = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end_date = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start_date and end_date and end_date <= start_date:
            raise serializers.ValidationError({'endDate': 'The lease end date must be after its start date.'})
        if not self.instance and not source_application:
            manual_reason = str(attrs.get('manual_lease_reason') or '').strip()
            manual_reference = str(attrs.get('manual_lease_reference') or '').strip()
            if not manual_reason and not manual_reference:
                raise serializers.ValidationError({
                    'manualLeaseReason': 'For an existing or offline tenancy, enter a reason or a reference to its existing lease record.'
                })
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # Validation happens before the save transaction. Serialize competing
        # reservations on their property, then recheck the freshly locked target.
        property_obj = Property.objects.select_for_update().filter(
            pk=validated_data['property'].pk, is_deleted=False,
        ).first()
        if not property_obj:
            raise serializers.ValidationError({'property': 'The selected property is no longer available.'})
        unit = validated_data.get('unit')
        if unit:
            unit = Unit.objects.select_for_update().filter(pk=unit.pk, property=property_obj).first()
            if not unit:
                raise serializers.ValidationError({'unit': 'The selected unit no longer belongs to this property.'})
        elif property_obj.units.count() == 1:
            unit = property_obj.units.select_for_update().first()
        validated_data['property'] = property_obj
        validated_data['unit'] = unit
        validated_data = self.validate(validated_data)

        contract = Contract.objects.create(**validated_data)
        if contract.status in ('Active', 'Pending') and contract.unit_id:
            contract.unit.status = 'Occupied' if contract.status == 'Active' else 'Reserved'
            contract.unit.tenant = contract.tenant if contract.status == 'Active' else None
            contract.unit.save(update_fields=['status', 'tenant'])
        prop = contract.property
        if contract.status == 'Active' and (not prop.units.exists() or not prop.units.exclude(status='Occupied').exists()):
            prop.status = 'Occupied'
            prop.save(update_fields=['status'])
        elif contract.status == 'Pending' and not contract.unit_id and not prop.units.exists():
            prop.status = 'Pending'
            prop.save(update_fields=['status'])
        return contract

    @transaction.atomic
    def update(self, instance, validated_data):
        instance = Contract.objects.select_for_update().get(pk=instance.pk)
        if instance.status != 'Pending' and validated_data:
            raise serializers.ValidationError({'detail': 'Only pending lease terms can be edited.'})
        property_id = getattr(validated_data.get('property'), 'pk', instance.property_id)
        # A retarget can affect two properties/units. Lock each set in ID order,
        # always properties before units, to serialize edits with new leases.
        properties = {
            prop.pk: prop for prop in Property.objects.select_for_update().filter(
                pk__in={instance.property_id, property_id},
            ).order_by('pk')
        }
        property_obj = properties.get(property_id)
        if not property_obj or property_obj.is_deleted:
            raise serializers.ValidationError({'property': 'The selected property is no longer available.'})
        unit_id = getattr(validated_data.get('unit', instance.unit), 'pk', None)
        if unit_id is None and property_obj.units.count() == 1:
            unit_id = property_obj.units.values_list('pk', flat=True).first()
        unit_ids = {pk for pk in (instance.unit_id, unit_id) if pk is not None}
        units = {
            unit.pk: unit for unit in Unit.objects.select_for_update().filter(pk__in=unit_ids).order_by('pk')
        }
        if unit_id is not None and unit_id not in units:
            raise serializers.ValidationError({'unit': 'The selected unit is no longer available.'})
        old_property = properties[instance.property_id]
        old_unit = units.get(instance.unit_id)
        instance.property = old_property
        instance.unit = old_unit
        self.instance = instance
        validated_data['property'] = property_obj
        validated_data['unit'] = units.get(unit_id)
        validated_data = self.validate(validated_data)
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
            else:
                leases = prop.contracts.filter(is_deleted=False)
                if leases.filter(status='Active').exists():
                    prop.status = 'Occupied'
                elif leases.filter(status='Pending').exists() or prop.inquiries.filter(
                    unit__isnull=True, rental_application__status='Approved',
                ).exists():
                    prop.status = 'Pending'
                else:
                    prop.status = 'Available'
            prop.save(update_fields=['status'])
        return contract


class LeaseTerminationSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)
    effectiveDate = serializers.DateField()
    instructionNote = serializers.CharField(max_length=2000, required=False, allow_blank=True, trim_whitespace=True)
    instructionReference = serializers.CharField(max_length=500, required=False, allow_blank=True, trim_whitespace=True)
