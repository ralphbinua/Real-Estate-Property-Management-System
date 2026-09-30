from rest_framework import viewsets, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from django.db.models import Q
from django.utils import timezone
from .models import Property, Unit, PropertyInquiry
from .serializers import PropertySerializer, UnitManagementSerializer, PropertyInquirySerializer
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from maintenance.models import MaintenanceRequest
from maintenance.serializers import MaintenanceRequestSerializer
from users.audit import record_activity


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


class IsAdminOrOwner(permissions.BasePermission):
    message = 'Only administrators and property owners may view this portfolio.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Owner')
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
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if self.request.user.role == 'Property Manager':
            instance = serializer.save(manager=self.request.user)
        else:
            instance = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Property', instance.pk, f'Created property {instance.title}.')

    def perform_update(self, serializer):
        if self.request.user.role == 'Property Manager':
            instance = serializer.save(manager=self.request.user)
        else:
            instance = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Property', instance.pk, f'Updated property {instance.title}.')

    def perform_destroy(self, instance):
        if instance.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'End or reassign active lease contracts before archiving this property.'})
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

    def perform_update(self, serializer):
        unit = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Unit', unit.pk, f'Updated unit {unit.unit_number}.')

    def perform_destroy(self, instance):
        if instance.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'A unit with an active or pending lease cannot be removed.'})
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

class OwnerPortfolioView(APIView):
    permission_classes = [IsAdminOrOwner]

    def get(self, request):
        user = request.user
        if user.role == 'Owner':
            properties = Property.objects.filter(owner=user, is_deleted=False)
        else:
            properties = Property.objects.filter(is_deleted=False)

        property_ids = properties.values_list('id', flat=True)
        contracts = Contract.objects.filter(property_id__in=property_ids, is_deleted=False)
        maintenance = MaintenanceRequest.objects.filter(property_id__in=property_ids, is_deleted=False)
        from billing.models import Invoice
        from billing.serializers import InvoiceSerializer
        invoices = Invoice.objects.filter(property_id__in=property_ids, is_deleted=False).order_by('-id')

        return Response({
            "properties": PropertySerializer(properties, many=True).data,
            "contracts": ContractSerializer(contracts, many=True).data,
            "maintenanceRequests": MaintenanceRequestSerializer(maintenance, many=True).data,
            "invoices": InvoiceSerializer(invoices, many=True).data,
        })