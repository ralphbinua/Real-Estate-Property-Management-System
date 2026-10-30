from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from .models import MaintenanceRequest, MaintenanceEvent
from .serializers import MaintenanceRequestSerializer
from properties.models import Property
from properties.querysets import property_serializer_queryset
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from core.csv_exports import csv_response
from notifications.models import Notification
from notifications.services import create_for_recipients
from billing.models import PropertyExpense, PropertyExpenseEvent


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

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        visible = self.get_object()
        locked = MaintenanceRequest.objects.select_for_update().get(pk=visible.pk)
        serializer = self.get_serializer(locked, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.filter(is_deleted=False).select_related(
            'unit', 'tenant', 'assigned_to', 'property_expense',
        ).prefetch_related(
            Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
            'events',
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
        if self.action in ('update', 'partial_update', 'destroy', 'request_approval', 'create_expense'):
            return [IsAdminOrManager()]
        if self.action == 'decide_approval':
            return [IsOwner()]
        if self.action == 'create':
            return [IsAdminOrTenant()]
        if self.action in ('list', 'retrieve', 'export'):
            return [IsAuthorizedMaintenanceReader()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['post'], url_path='create-expense')
    @transaction.atomic
    def create_expense(self, request, pk=None):
        work = MaintenanceRequest.objects.select_for_update().get(pk=self.get_object().pk)
        if work.status != 'Resolved':
            raise ValidationError({'status': 'Resolve the maintenance request before recording its final expense.'})
        if work.actual_cost is None or work.actual_cost <= 0:
            raise ValidationError({'actualCost': 'Enter a final cost greater than zero before creating an expense.'})
        if work.approval_status != 'Approved':
            raise ValidationError({'approvalStatus': 'Owner approval of the repair estimate is required before recording its expense.'})
        if not work.property.owner_id:
            raise ValidationError({'property': 'This property needs an Owner to approve expenses.'})

        reference = f'Maintenance #{work.pk}'
        existing = PropertyExpense.objects.select_for_update().filter(
            maintenance_request=work,
        ).first()
        if not existing:
            # Adopt a prior manual expense for this work order instead of duplicating it.
            existing = PropertyExpense.objects.select_for_update().filter(
                property=work.property, reference=reference,
            ).order_by('id').first()
            if existing:
                if existing.maintenance_request_id:
                    raise ValidationError({'expense': 'A different maintenance request already uses this expense.'})
                existing.maintenance_request = work
                existing.save(update_fields=['maintenance_request'])
                PropertyExpenseEvent.objects.create(
                    expense=existing, actor=request.user, action='Linked',
                    summary=f'Linked to maintenance request #{work.pk}.',
                )
                MaintenanceEvent.objects.create(
                    request=work, actor=request.user, event_type='Expense linked',
                    summary=f'Existing expense #{existing.pk} linked to this maintenance request.',
                    tenant_visible=False,
                )
                record_activity(request.user, 'UPDATE', 'Maintenance request', work.pk, f'Linked existing expense {existing.pk} to maintenance request {work.pk}.')
                return Response(MaintenanceRequestSerializer(work, context={'request': request}).data, status=status.HTTP_200_OK)
            expense = PropertyExpense.objects.create(
                property=work.property,
                maintenance_request=work,
                category='Repairs',
                amount=work.actual_cost,
                incurred_on=timezone.localtime(work.updated_at).date(),
                payee=work.vendor_name.strip() or 'Maintenance vendor (confirm)',
                reference=reference,
                description=work.issue_description,
                created_by=request.user,
                status='Draft',
            )
            PropertyExpenseEvent.objects.create(
                expense=expense, actor=request.user, action='Created',
                summary='Draft created from a resolved maintenance request for staff review.',
            )
            MaintenanceEvent.objects.create(
                request=work, actor=request.user, event_type='Expense draft created',
                summary=f'Expense draft #{expense.pk} created from this maintenance request.',
                tenant_visible=False,
            )
            record_activity(request.user, 'CREATE', 'Property expense', expense.pk, f'Created expense draft from maintenance request {work.pk}.')
            return Response(MaintenanceRequestSerializer(work, context={'request': request}).data, status=status.HTTP_201_CREATED)

        raise ValidationError({'expense': 'This maintenance request already has an expense linked.'})

    @action(detail=False, methods=['get'])
    def export(self, request):
        columns = [
            ('ID', lambda item: item.pk), ('Property', lambda item: item.property.title),
            ('Unit', lambda item: item.unit.unit_number if item.unit else ''),
            ('Issue', lambda item: item.issue_description), ('Priority', lambda item: item.priority),
            ('Status', lambda item: item.status), ('Submitted', lambda item: item.created_at.isoformat()),
        ]
        if request.user.role != 'Tenant':
            columns += [
                ('Estimate', lambda item: item.estimate_amount),
                ('Approval', lambda item: item.approval_status),
                ('Actual cost', lambda item: item.actual_cost),
            ]
        return csv_response('maintenance', columns, self.get_queryset())

    @transaction.atomic
    def perform_create(self, serializer):
        request_obj = serializer.save(tenant=self.request.user) if self.request.user.role == 'Tenant' else serializer.save()
        MaintenanceEvent.objects.create(request=request_obj, actor=self.request.user, event_type='Submitted', summary='Maintenance request submitted.', tenant_visible=True)
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
        if request_obj.assigned_to_id:
            create_for_recipients(
                recipients=[request_obj.assigned_to], actor=self.request.user,
                event_type=Notification.EventType.MAINTENANCE,
                title='Maintenance request assigned',
                message=f'Maintenance request #{request_obj.pk} was assigned to you.',
                destination=(Notification.Destination.MANAGER_MAINTENANCE if request_obj.assigned_to.role == 'Property Manager'
                             else Notification.Destination.ADMIN_OVERVIEW),
            )

    @transaction.atomic
    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        previous_assignee_id = serializer.instance.assigned_to_id
        request_obj = serializer.save()
        changed = set(serializer.validated_data)
        visible = bool(changed & {'status', 'assigned_to', 'priority'})
        if request_obj.status != previous_status:
            summary = f'Status changed to {request_obj.status}.'
        elif request_obj.assigned_to_id != previous_assignee_id:
            summary = 'Maintenance assignment updated.'
        elif 'priority' in changed:
            summary = f'Priority changed to {request_obj.priority}.'
        else:
            summary = 'Work order details updated.'
        MaintenanceEvent.objects.create(request=request_obj, actor=self.request.user, event_type='Updated', summary=summary, tenant_visible=visible)
        record_activity(self.request.user, 'UPDATE', 'Maintenance request', request_obj.pk, f'Updated maintenance request {request_obj.pk} to {request_obj.status}.')
        status_changed = request_obj.status != previous_status
        assignee_changed = request_obj.assigned_to_id != previous_assignee_id
        if not status_changed and not assignee_changed:
            return

        property_obj = request_obj.property
        if status_changed:
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
            message=(f'Your maintenance request is now {request_obj.status.lower()}.' if status_changed
                     else 'The person handling your maintenance request has changed.'),
            destination=Notification.Destination.TENANT_MAINTENANCE,
        )
        if assignee_changed and request_obj.assigned_to_id:
            create_for_recipients(
                recipients=[request_obj.assigned_to], actor=self.request.user,
                event_type=Notification.EventType.MAINTENANCE,
                title='Maintenance request assigned',
                message=f'Maintenance request #{request_obj.pk} was assigned to you.',
                destination=(Notification.Destination.MANAGER_MAINTENANCE if request_obj.assigned_to.role == 'Property Manager'
                             else Notification.Destination.ADMIN_OVERVIEW),
            )
        if status_changed and request_obj.status == 'Resolved':
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

    @action(detail=True, methods=['post'], url_path='request-approval')
    @transaction.atomic
    def request_approval(self, request, pk=None):
        work = self.get_object()
        work = MaintenanceRequest.objects.select_for_update().get(pk=work.pk)
        if work.status != 'Open':
            raise ValidationError({'status': 'Request approval before work begins.'})
        if work.estimate_amount is None:
            raise ValidationError({'estimateAmount': 'Enter an estimate before requesting approval.'})
        if not work.property.owner_id:
            raise ValidationError({'property': 'This property has no Owner to approve the work.'})
        if work.approval_status in ('Pending', 'Approved'):
            raise ValidationError({'approvalStatus': 'This estimate is already pending or approved.'})
        if work.approval_status == 'Rejected' and work.estimate_amount == work.approval_estimate_amount:
            raise ValidationError({'estimateAmount': 'Revise the rejected estimate before requesting approval again.'})
        work.approval_status = 'Pending'
        work.approval_estimate_amount = work.estimate_amount
        work.approval_requested_at = timezone.now()
        work.approval_decided_at = None
        work.approval_decided_by = None
        work.approval_note = ''
        work.save(update_fields=['approval_status', 'approval_estimate_amount', 'approval_requested_at', 'approval_decided_at', 'approval_decided_by', 'approval_note', 'updated_at'])
        MaintenanceEvent.objects.create(request=work, actor=request.user, event_type='Approval requested', summary='Owner approval requested for the repair estimate.', tenant_visible=False)
        record_activity(request.user, 'UPDATE', 'Maintenance request', work.pk, f'Requested Owner approval for maintenance request {work.pk}.')
        create_for_recipients(recipients=[work.property.owner], actor=request.user, event_type=Notification.EventType.MAINTENANCE, title='Repair approval requested', message=f'Maintenance request #{work.pk} has an estimate awaiting your approval.', destination=Notification.Destination.OWNER_MAINTENANCE)
        return Response(self.get_serializer(work).data)

    @action(detail=True, methods=['post'], url_path='decide-approval')
    @transaction.atomic
    def decide_approval(self, request, pk=None):
        work = self.get_object()
        work = MaintenanceRequest.objects.select_for_update().get(pk=work.pk)
        approved = request.data.get('approved')
        if not isinstance(approved, bool):
            raise ValidationError({'approved': 'Provide true to approve or false to reject.'})
        if work.approval_status != 'Pending':
            raise ValidationError({'approvalStatus': 'There is no pending approval request.'})
        note = request.data.get('note', '')
        if not isinstance(note, str) or len(note) > 1000:
            raise ValidationError({'note': 'Provide a note of at most 1000 characters.'})
        work.approval_status = 'Approved' if approved else 'Rejected'
        work.approval_decided_by = request.user
        work.approval_decided_at = timezone.now()
        work.approval_note = note
        work.save(update_fields=['approval_status', 'approval_decided_by', 'approval_decided_at', 'approval_note', 'updated_at'])
        MaintenanceEvent.objects.create(request=work, actor=request.user, event_type=work.approval_status, summary=f'Owner {work.approval_status.lower()} the repair estimate.', tenant_visible=False)
        record_activity(request.user, 'UPDATE', 'Maintenance request', work.pk, f'{work.approval_status} maintenance estimate for request {work.pk}.')
        recipient = work.assigned_to or work.property.manager
        if recipient:
            create_for_recipients(recipients=[recipient], actor=request.user, event_type=Notification.EventType.MAINTENANCE, title=f'Repair estimate {work.approval_status.lower()}', message=f'Maintenance request #{work.pk} estimate was {work.approval_status.lower()}.', destination=(Notification.Destination.MANAGER_MAINTENANCE if recipient.role == 'Property Manager' else Notification.Destination.ADMIN_OVERVIEW))
        return Response(self.get_serializer(work).data, status=status.HTTP_200_OK)


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


class IsOwner(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted and user.role == 'Owner')
