from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from django.db import transaction
from django.db.models import Exists, Prefetch, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from ..models import (
    Property, Unit, PropertyInquiry, RentalApplication, RentalApplicationDecision,
    LeaseSigningAuthorization, LeaseTerminationAuthorization, PropertyAuthorityEvent,
    PropertyApprovalPolicyChange, UnitPricingAuthorization, UnitPriceChangeRequest,
)
from ..serializers import (
    PropertySerializer, UnitManagementSerializer, PropertyInquirySerializer,
    RentalApplicationSerializer, UnitPriceChangeRequestSerializer,
    manager_has_unit_pricing_authority,
)
from ..querysets import property_serializer_queryset
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from maintenance.models import MaintenanceRequest
from maintenance.serializers import MaintenanceRequestSerializer
from users.audit import record_activity
from users.models import AuditEvent
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


from .permissions import IsAdminOrPropertyManager, IsPropertyManager, IsApplicationReviewer, IsAdminOrOwner, IsOwner, IsOwnerOrAdmin, IsAdminOrPropertyManagerOrAgent, IsAdminOrPropertyManagerOrAssignedAgent

class PropertyInquiryViewSet(viewsets.ModelViewSet):
    queryset = PropertyInquiry.objects.select_related('property', 'agent').all()
    serializer_class = PropertyInquirySerializer
    pagination_class = OptInPageNumberPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        inquiries = PropertyInquiry.objects.select_related('property', 'agent')
        if user.role == 'Admin':
            scoped_inquiries = inquiries
        elif user.role == 'Property Manager':
            scoped_inquiries = inquiries.filter(property__manager=user)
        elif user.role == 'Agent':
            scoped_inquiries = inquiries.filter(
                agent=user,
                property__assigned_agents=user,
            )
        else:
            scoped_inquiries = inquiries.none()
        inquiry_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if inquiry_status:
            scoped_inquiries = scoped_inquiries.filter(status=inquiry_status)
        if search:
            scoped_inquiries = scoped_inquiries.filter(
                Q(prospect_name__icontains=search)
                | Q(prospect_email__icontains=search)
                | Q(property__title__icontains=search)
            )
        return scoped_inquiries.order_by('-created_at', '-id')

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrPropertyManagerOrAgent()]
        if self.action in ('partial_update', 'update'):
            return [IsAdminOrPropertyManagerOrAssignedAgent()]
        return [permissions.IsAuthenticated()]

    @transaction.atomic
    def perform_create(self, serializer):
        status = 'Viewing Scheduled' if serializer.validated_data.get('viewing_at') else 'New'
        if self.request.user.role == 'Agent':
            inquiry = serializer.save(agent=self.request.user, status=status)
        else:
            inquiry = serializer.save(status=status)
        record_activity(self.request.user, 'CREATE', 'Prospect inquiry', inquiry.pk, f'Logged prospect {inquiry.prospect_name} for {inquiry.property.title}.')
        create_for_recipients(
            recipients=[inquiry.property.manager] if inquiry.property.manager_id else [],
            actor=self.request.user,
            event_type=Notification.EventType.INQUIRY,
            title='New prospect inquiry',
            message='A new inquiry was submitted for a property you manage.',
            destination=Notification.Destination.MANAGER_INQUIRIES,
        )
        if inquiry.agent_id and inquiry.property.assigned_agents.filter(pk=inquiry.agent_id, role='Agent').exists():
            create_for_recipients(
                recipients=[inquiry.agent],
                actor=self.request.user,
                event_type=Notification.EventType.INQUIRY,
                title='New prospect inquiry',
                message='A new inquiry was assigned to you.',
                destination=Notification.Destination.AGENT_INQUIRIES,
            )

    @transaction.atomic
    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        previous_viewing_at = serializer.instance.viewing_at
        previous_agent_id = serializer.instance.agent_id
        inquiry = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Prospect inquiry', inquiry.pk, f'Updated inquiry status to {inquiry.status}.')
        changed = (
            inquiry.status != previous_status
            or inquiry.viewing_at != previous_viewing_at
            or inquiry.agent_id != previous_agent_id
        )
        if not changed:
            return

        create_for_recipients(
            recipients=[inquiry.property.manager] if inquiry.property.manager_id else [],
            actor=self.request.user,
            event_type=Notification.EventType.INQUIRY,
            title='Inquiry updated',
            message='An inquiry status or viewing schedule changed.',
            destination=Notification.Destination.MANAGER_INQUIRIES,
        )
        if inquiry.agent_id and inquiry.property.assigned_agents.filter(pk=inquiry.agent_id, role='Agent').exists():
            create_for_recipients(
                recipients=[inquiry.agent],
                actor=self.request.user,
                event_type=Notification.EventType.INQUIRY,
                title='Inquiry updated',
                message='A prospect inquiry or viewing schedule changed.',
                destination=Notification.Destination.AGENT_INQUIRIES,
            )
