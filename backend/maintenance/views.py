from rest_framework import viewsets, permissions
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer
from users.audit import record_activity

class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRequest.objects.filter(is_deleted=False).order_by('-id')
    serializer_class = MaintenanceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.filter(is_deleted=False).order_by('-id')
        if user.role == 'Admin':
            return qs
        if user.role == 'Tenant':
            return qs.filter(tenant=user)
        if user.role == 'Property Manager':
            return qs.filter(property__manager=user)
        if user.role == 'Owner':
            return qs.filter(property__owner=user)
        if user.role == 'Agent':
            return qs.filter(property__assigned_agents=user)
        return qs.none()

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminOrManager()]
        if self.action == 'create':
            return [IsAdminOrTenant()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        request_obj = serializer.save(tenant=self.request.user) if self.request.user.role == 'Tenant' else serializer.save()
        record_activity(self.request.user, 'CREATE', 'Maintenance request', request_obj.pk, f'Submitted maintenance request {request_obj.pk}.')

    def perform_update(self, serializer):
        request_obj = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Maintenance request', request_obj.pk, f'Updated maintenance request {request_obj.pk} to {request_obj.status}.')

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        record_activity(self.request.user, 'ARCHIVE', 'Maintenance request', instance.pk, f'Archived maintenance request {instance.pk}.')


class IsAdminOrManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted
                    and user.role in ('Admin', 'Property Manager'))


class IsAdminOrTenant(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted
                    and user.role in ('Admin', 'Tenant'))
