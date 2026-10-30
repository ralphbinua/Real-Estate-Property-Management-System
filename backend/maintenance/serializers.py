from rest_framework import serializers
from decimal import Decimal
from .models import MaintenanceRequest
from properties.models import Property, Unit
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    issueDescription = serializers.CharField(source='issue_description')
    vendorName = serializers.CharField(source='vendor_name', required=False, allow_blank=True, max_length=160)
    vendorContact = serializers.CharField(source='vendor_contact', required=False, allow_blank=True, max_length=160)
    estimateAmount = serializers.DecimalField(source='estimate_amount', max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=False, allow_null=True)
    actualCost = serializers.DecimalField(source='actual_cost', max_digits=12, decimal_places=2, min_value=Decimal('0.00'), required=False, allow_null=True)
    approvalStatus = serializers.CharField(source='approval_status', read_only=True)
    approvalRequestedAt = serializers.DateTimeField(source='approval_requested_at', read_only=True)
    approvalDecidedAt = serializers.DateTimeField(source='approval_decided_at', read_only=True)
    approvalNote = serializers.CharField(source='approval_note', read_only=True)
    linkedExpenseId = serializers.SerializerMethodField()
    linkedExpenseStatus = serializers.SerializerMethodField()
    activity = serializers.SerializerMethodField()
    assignedTo = serializers.PrimaryKeyRelatedField(
        source='assigned_to', queryset=User.objects.filter(is_active=True, is_deleted=False),
        required=False, allow_null=True,
    )
    
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.filter(is_deleted=False))
    tenant = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(role=User.Role.TENANT, is_active=True, is_deleted=False),
        required=False,
    )
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), required=False, allow_null=True, default=None)

    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)
    assignedToDetails = serializers.SerializerMethodField()

    class Meta:
        model = MaintenanceRequest
        fields = [
            '_id', 'property', 'unit', 'tenant', 'issueDescription', 
            'status', 'priority', 'vendorName', 'vendorContact', 'estimateAmount', 'actualCost',
            'approvalStatus', 'approvalRequestedAt', 'approvalDecidedAt', 'approvalNote', 'activity',
            'linkedExpenseId', 'linkedExpenseStatus',
            'assignedTo', 'assignedToDetails', 'propertyDetails',
            'tenantDetails', 'created_at', 'updated_at'
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and request.user.role != User.Role.ADMIN:
            self.fields['tenant'].read_only = True
        elif request and self.instance is None:
            self.fields['tenant'].required = True
        if request and request.user.role == User.Role.TENANT:
            self.fields['status'].read_only = True
            self.fields['assignedTo'].read_only = True
            for field_name in ('vendorName', 'vendorContact', 'estimateAmount', 'actualCost',
                               'approvalStatus', 'approvalRequestedAt', 'approvalDecidedAt', 'approvalNote'):
                self.fields.pop(field_name)

    def get_activity(self, instance):
        request = self.context.get('request')
        tenant = request and request.user.role == User.Role.TENANT
        events = instance.events.all()
        if tenant:
            events = [event for event in events if event.tenant_visible]
        return [{
            'type': event.event_type,
            'summary': event.summary,
            'at': event.created_at.isoformat(),
        } for event in events]

    def get_linkedExpenseId(self, instance):
        expense = getattr(instance, 'property_expense', None)
        return expense.pk if expense else None

    def get_linkedExpenseStatus(self, instance):
        expense = getattr(instance, 'property_expense', None)
        return expense.status if expense else None

    def get_assignedToDetails(self, instance):
        assignee = instance.assigned_to
        if not assignee:
            return None
        return {
            '_id': assignee.pk,
            'name': assignee.get_full_name() or assignee.email,
            'role': assignee.role,
        }

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        unit = attrs.get('unit', getattr(self.instance, 'unit', None))

        if self.instance:
            approval = self.instance.approval_status
            proposed_status = attrs.get('status', self.instance.status)
            if proposed_status in ('In Progress', 'Resolved') and approval in ('Pending', 'Rejected'):
                raise serializers.ValidationError({'status': 'The Owner must approve the requested work before it proceeds.'})
            if 'estimate_amount' in attrs and attrs['estimate_amount'] != self.instance.estimate_amount and approval in ('Pending', 'Approved'):
                raise serializers.ValidationError({'estimateAmount': 'A pending or approved estimate cannot be edited. Record a new request instead.'})
            if 'actual_cost' in attrs and attrs['actual_cost'] is not None and approval in ('Pending', 'Rejected'):
                raise serializers.ValidationError({'actualCost': 'Record the final cost after Owner approval.'})

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

        if 'assigned_to' in attrs:
            if not user or user.role not in (User.Role.ADMIN, User.Role.PROPERTY_MANAGER):
                raise serializers.ValidationError({'assignedTo': 'Only an administrator or property manager may assign a request.'})
            assignee = attrs['assigned_to']
            if assignee and not (
                assignee.role == User.Role.ADMIN
                or (assignee.role == User.Role.PROPERTY_MANAGER and property_obj and property_obj.manager_id == assignee.pk)
            ):
                raise serializers.ValidationError({'assignedTo': 'Assign an active administrator or this property’s manager.'})

        tenant = attrs.get('tenant', getattr(self.instance, 'tenant', user if user and user.role == User.Role.TENANT else None))
        historical_tenant_unchanged = bool(
            self.instance
            and tenant
            and tenant.pk == self.instance.tenant_id
            and property_obj
            and property_obj.pk == self.instance.property_id
        )
        if tenant and property_obj and not historical_tenant_unchanged and not (
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
