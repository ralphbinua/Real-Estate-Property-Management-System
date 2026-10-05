from rest_framework import viewsets, permissions
from django.db import transaction
from django.db.models import Prefetch, Q
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer
from properties.models import Property
from properties.querysets import property_serializer_queryset
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients


class IsAuthorizedMaintenanceReader(permissions.BasePermission):
    message = 'You may only view maintenance records for your role and assigned scope.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner', 'Tenant')
        )


class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRequest.objects.filter(is_deleted=False).order_by('-id')
    serializer_class = MaintenanceRequestSerializer
    pagination_class = OptInPageNumberPagination
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.filter(is_deleted=False).select_related(
            'unit', 'tenant',
        ).prefetch_related(
            Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
        ).order_by('-id')
        if user.role == 'Admin':
            scoped_requests = qs
        elif user.role == 'Tenant':
            scoped_requests = qs.filter(tenant=user)
        elif user.role == 'Property Manager':
            scoped_requests = qs.filter(property__manager=user)
        elif user.role == 'Owner':
            scoped_requests = qs.filter(property__owner=user)
        else:
            return qs.none()
        request_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if request_status:
            scoped_requests = scoped_requests.filter(status=request_status)
        if search:
            scoped_requests = scoped_requests.filter(
                Q(issue_description__icontains=search)
                | Q(property__title__icontains=search)
                | Q(tenant__email__icontains=search)
            )
        return scoped_requests

    def get_permissions(self):
        if self.action in ('update', 'partial_update', 'destroy'):
            return [IsAdminOrManager()]
        if self.action == 'create':
            return [IsAdminOrTenant()]
        if self.action in ('list', 'retrieve'):
            return [IsAuthorizedMaintenanceReader()]
        return [permissions.IsAuthenticated()]

    @transaction.atomic
    def perform_create(self, serializer):
        request_obj = serializer.save(tenant=self.request.user) if self.request.user.role == 'Tenant' else serializer.save()
        record_activity(self.request.user, 'CREATE', 'Maintenance request', request_obj.pk, f'Submitted maintenance request {request_obj.pk}.')
        property_obj = request_obj.property
        create_for_recipients(
            recipients=[property_obj.owner] if property_obj.owner_id else [],
            actor=self.request.user,
            event_type=Notification.EventType.MAINTENANCE,
            title='New maintenance request',
            message='A new maintenance request was submitted for your property.',
            destination=Notification.Destination.OWNER_MAINTENANCE,
        )
        create_for_recipients(
            recipients=[property_obj.manager] if property_obj.manager_id else [],
            actor=self.request.user,
            event_type=Notification.EventType.MAINTENANCE,
            title='New maintenance request',
            message='A new maintenance request was submitted for a property you manage.',
            destination=Notification.Destination.MANAGER_MAINTENANCE,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        request_obj = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Maintenance request', request_obj.pk, f'Updated maintenance request {request_obj.pk} to {request_obj.status}.')
        if request_obj.status == previous_status:
            return

        property_obj = request_obj.property
        create_for_recipients(
            recipients=[property_obj.manager] if property_obj.manager_id else [],
            actor=self.request.user,
            event_type=Notification.EventType.MAINTENANCE,
            title='Maintenance request updated',
            message=f'A maintenance request status changed to {request_obj.status.lower()}.',
            destination=Notification.Destination.MANAGER_MAINTENANCE,
        )
        create_for_recipients(
            recipients=[request_obj.tenant],
            actor=self.request.user,
            event_type=Notification.EventType.MAINTENANCE,
            title='Maintenance request updated',
            message=f'Your maintenance request is now {request_obj.status.lower()}.',
            destination=Notification.Destination.TENANT_MAINTENANCE,
        )
        if request_obj.status == 'Resolved':
            create_for_recipients(
                recipients=[property_obj.owner] if property_obj.owner_id else [],
                actor=self.request.user,
                event_type=Notification.EventType.MAINTENANCE,
                title='Maintenance request resolved',
                message='A maintenance request for your property was marked resolved.',
                destination=Notification.Destination.OWNER_MAINTENANCE,
            )

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
