from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from .models import Contract
from .serializers import ContractSerializer
from users.audit import record_activity


class IsAdminOrPropertyManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager')
        )


class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true' and user.role == 'Admin':
            contracts = Contract.objects.all()
        else:
            contracts = Contract.objects.filter(is_deleted=False)

        if user.role == 'Admin':
            return contracts.order_by('-id')
        if user.role == 'Property Manager':
            return contracts.filter(property__manager=user).order_by('-id')
        if user.role == 'Owner':
            return contracts.filter(property__owner=user).order_by('-id')
        if user.role == 'Tenant':
            return contracts.filter(tenant=user).order_by('-id')
        if user.role == 'Agent':
            return contracts.filter(property__assigned_agents=user).order_by('-id')
        return contracts.none()

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'terminate'):
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    def perform_destroy(self, instance):
        self._release_occupancy(instance)
        instance.is_deleted = True
        instance.status = 'Terminated'
        instance.save(update_fields=['is_deleted', 'status'])
        record_activity(self.request.user, 'ARCHIVE', 'Contract', instance.pk, f'Archived lease contract {instance.pk}.')

    @transaction.atomic
    def _release_occupancy(self, contract):
        if contract.unit_id and not contract.unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exclude(pk=contract.pk).exists():
            contract.unit.status = 'Available'
            contract.unit.tenant = None
            contract.unit.save(update_fields=['status', 'tenant'])
        prop = contract.property
        if prop.units.exists():
            prop.status = 'Available' if prop.units.exclude(status='Occupied').exists() else 'Occupied'
        elif not prop.contracts.filter(status='Active', is_deleted=False).exclude(pk=contract.pk).exists():
            prop.status = 'Available'
        prop.save(update_fields=['status'])

    def perform_create(self, serializer):
        contract = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Contract', contract.pk, f'Created lease contract {contract.pk}.')

    def perform_update(self, serializer):
        contract = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Contract', contract.pk, f'Updated lease contract {contract.pk}.')

    @action(detail=True, methods=['patch', 'put'])
    def terminate(self, request, pk=None):
        contract = self.get_object()
        contract.status = 'Terminated'
        self._release_occupancy(contract)
        contract.save(update_fields=['status'])
        record_activity(request.user, 'TERMINATE', 'Contract', contract.pk, f'Terminated lease contract {contract.pk}.')

        return Response({"message": "Lease contract terminated successfully."})
