from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.db.models import F, Q
from django.contrib.auth import get_user_model
from django.utils import timezone
from ..models import PropertyInquiry
from ..serializers import PropertyInquirySerializer, ProspectActivitySerializer
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


from .permissions import IsAdminOrPropertyManagerOrAgent, IsAdminOrPropertyManagerOrAssignedAgent

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
        follow_up = self.request.query_params.get('follow_up')
        now = timezone.now()
        if inquiry_status:
            scoped_inquiries = scoped_inquiries.filter(status=inquiry_status)
        if follow_up in ('due', 'upcoming'):
            scoped_inquiries = scoped_inquiries.exclude(status__in=['Closed', 'Converted'])
        if follow_up == 'due':
            scoped_inquiries = scoped_inquiries.filter(next_follow_up_at__lte=now)
        elif follow_up == 'upcoming':
            scoped_inquiries = scoped_inquiries.filter(next_follow_up_at__gt=now)
        elif follow_up == 'unscheduled':
            scoped_inquiries = scoped_inquiries.filter(next_follow_up_at__isnull=True)
        if search:
            scoped_inquiries = scoped_inquiries.filter(
                Q(prospect_name__icontains=search)
                | Q(prospect_email__icontains=search)
                | Q(property__title__icontains=search)
            )
        return scoped_inquiries.order_by(F('next_follow_up_at').asc(nulls_last=True), '-created_at', '-id')

    def get_permissions(self):
        if self.action == 'activities':
            return [IsAdminOrPropertyManagerOrAssignedAgent()]
        if self.action == 'create':
            return [IsAdminOrPropertyManagerOrAgent()]
        if self.action in ('partial_update', 'update'):
            return [IsAdminOrPropertyManagerOrAssignedAgent()]
        return [permissions.IsAuthenticated()]

    @action(detail=True, methods=['get', 'post'], url_path='activities')
    def activities(self, request, pk=None):
        inquiry = self.get_object()
        if request.method == 'GET':
            activities = inquiry.activities.select_related('actor').all()
            return Response(ProspectActivitySerializer(activities, many=True).data)

        serializer = ProspectActivitySerializer(data=request.data, context=self.get_serializer_context())
        serializer.is_valid(raise_exception=True)
        follow_up_changed = 'next_follow_up_at' in serializer.validated_data
        with transaction.atomic():
            inquiry = PropertyInquiry.objects.select_for_update().get(pk=inquiry.pk)
            activity = serializer.save(
                inquiry=inquiry,
                actor=request.user,
                follow_up_changed=follow_up_changed,
            )
            if follow_up_changed:
                inquiry.next_follow_up_at = activity.next_follow_up_at
                inquiry.save(update_fields=['next_follow_up_at'])
            record_activity(
                request.user,
                'CREATE',
                'Prospect activity',
                activity.pk,
                f'Logged {activity.activity_type.lower()} activity for {inquiry.prospect_name}.',
            )
        return Response(ProspectActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

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
