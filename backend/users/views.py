from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from .serializers import UserSerializer, UserCreateSerializer, CurrentUserProfileSerializer, SystemSettingsSerializer
from .audit import record_activity
from .models import AuditEvent, SystemSettings
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


class IsSystemAdmin(permissions.BasePermission):
    """Allow account administration only to active Admin-role users."""

    message = 'Only system administrators may manage user accounts.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role == User.Role.ADMIN
        )

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        email_or_username = attrs.get("username") or attrs.get("email")
        if email_or_username:
            try:
                user_obj = User.objects.get(email__iexact=email_or_username)
                attrs["username"] = user_obj.username
            except User.DoesNotExist:
                pass

        data = super().validate(attrs)
        data['token'] = data.pop('access')
        data['_id'] = self.user.id
        name_str = f"{self.user.first_name} {self.user.last_name}".strip()
        data['name'] = name_str if name_str else self.user.email
        data['email'] = self.user.email
        data['role'] = getattr(self.user, 'role', 'Admin')
        return data

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsSystemAdmin]
    pagination_class = OptInPageNumberPagination

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true':
            users = User.objects.all()
        else:
            users = User.objects.filter(is_deleted=False)
        role = self.request.query_params.get('role')
        roles = [value.strip() for value in self.request.query_params.get('roles', '').split(',') if value.strip()]
        search = self.request.query_params.get('search', '').strip()
        if role:
            users = users.filter(role=role)
        elif roles:
            users = users.filter(role__in=roles)
        if search:
            users = users.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
            )
        return users.order_by('-id')

    @action(detail=False, methods=['get', 'patch'], permission_classes=[permissions.IsAuthenticated])
    def me(self, request):
        if request.method == 'PATCH':
            serializer = CurrentUserProfileSerializer(request.user, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            record_activity(request.user, 'UPDATE', 'User profile', request.user.pk, 'Updated personal profile information.')
            return Response(serializer.data)
        return Response(CurrentUserProfileSerializer(request.user).data)

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def tenants(self, request):
        user = request.user
        if user.role == User.Role.ADMIN:
            tenants = User.objects.filter(role=User.Role.TENANT, is_active=True, is_deleted=False)
        elif user.role == User.Role.PROPERTY_MANAGER:
            from django.db.models import Exists, OuterRef, Q
            from contracts.models import Contract
            active_leases = Contract.objects.filter(
                tenant_id=OuterRef('pk'),
                status__in=['Active', 'Pending'],
                is_deleted=False,
            )
            tenants = User.objects.annotate(has_active_lease=Exists(active_leases)).filter(
                role=User.Role.TENANT,
                is_active=True,
                is_deleted=False,
            ).filter(
                Q(rented_units__property__manager=user)
                | Q(tenant_contracts__property__manager=user, tenant_contracts__is_deleted=False)
                | (Q(rented_units__isnull=True) & Q(has_active_lease=False))
            ).distinct()
        else:
            return Response({'detail': 'Only administrators and property managers may browse tenant accounts.'}, status=403)
        return Response(UserSerializer(tenants.order_by('last_name', 'first_name'), many=True).data)

    @action(detail=False, methods=['get'], permission_classes=[IsSystemAdmin])
    def activity(self, request):
        events = AuditEvent.objects.select_related('actor').all().order_by('-created_at', '-id')
        action_name = request.query_params.get('action')
        search = request.query_params.get('search', '').strip()
        if action_name:
            events = events.filter(action=action_name)
        if search:
            events = events.filter(
                Q(action__icontains=search)
                | Q(entity_type__icontains=search)
                | Q(summary__icontains=search)
                | Q(actor__email__icontains=search)
            )
        paginator = OptInPageNumberPagination()
        page = paginator.paginate_queryset(events, request, view=self)
        rows = page if page is not None else events[:200]
        data = [
            {
                'id': event.id,
                'actor': event.actor.email if event.actor else 'System',
                'action': event.action,
                'entityType': event.entity_type,
                'entityId': event.entity_id,
                'summary': event.summary,
                'createdAt': event.created_at,
            }
            for event in rows
        ]
        if page is not None:
            return paginator.get_paginated_response(data)
        return Response(data)

    @transaction.atomic
    def perform_create(self, serializer):
        user = serializer.save()
        record_activity(self.request.user, 'CREATE', 'User', user.pk, f'Created account {user.email} with role {user.role}.')

        destination = {
            User.Role.ADMIN: Notification.Destination.ADMIN_OVERVIEW,
            User.Role.OWNER: Notification.Destination.OWNER_OVERVIEW,
            User.Role.PROPERTY_MANAGER: Notification.Destination.MANAGER_OVERVIEW,
            User.Role.AGENT: Notification.Destination.AGENT_OVERVIEW,
            User.Role.TENANT: Notification.Destination.TENANT_OVERVIEW,
        }.get(user.role)
        if destination:
            create_for_recipients(
                recipients=[user],
                actor=self.request.user,
                event_type=Notification.EventType.ACCOUNT,
                title='Your account was created',
                message='Your account is ready in the property management workspace.',
                destination=destination,
            )
        create_for_recipients(
            recipients=User.objects.filter(
                role=User.Role.ADMIN,
                is_active=True,
                is_deleted=False,
            ).exclude(pk=user.pk),
            actor=self.request.user,
            event_type=Notification.EventType.ACCOUNT,
            title='User account created',
            message='A new user account was created.',
            destination=Notification.Destination.ADMIN_USERS,
        )

    @transaction.atomic
    def perform_update(self, serializer):
        previous_role = serializer.instance.role
        previous_deleted = serializer.instance.is_deleted
        user = serializer.save()
        user.is_active = not user.is_deleted
        user.deleted_at = timezone.now() if user.is_deleted else None
        user.save(update_fields=['is_active', 'deleted_at'])
        record_activity(self.request.user, 'UPDATE', 'User', user.pk, f'Updated account {user.email}.')

        role_changed = user.role != previous_role
        newly_deactivated = user.is_deleted and not previous_deleted
        if not role_changed and not newly_deactivated:
            return

        if user.is_active and not user.is_deleted:
            destination = {
                User.Role.ADMIN: Notification.Destination.ADMIN_OVERVIEW,
                User.Role.OWNER: Notification.Destination.OWNER_OVERVIEW,
                User.Role.PROPERTY_MANAGER: Notification.Destination.MANAGER_OVERVIEW,
                User.Role.AGENT: Notification.Destination.AGENT_OVERVIEW,
                User.Role.TENANT: Notification.Destination.TENANT_OVERVIEW,
            }.get(user.role)
            if destination:
                create_for_recipients(
                    recipients=[user],
                    actor=self.request.user,
                    event_type=Notification.EventType.ACCOUNT,
                    title='Your account was updated',
                    message='Your account access or role has changed.',
                    destination=destination,
                )

        create_for_recipients(
            recipients=User.objects.filter(
                role=User.Role.ADMIN,
                is_active=True,
                is_deleted=False,
            ).exclude(pk=user.pk),
            actor=self.request.user,
            event_type=Notification.EventType.ACCOUNT,
            title='User account updated',
            message='A user account role or access status changed.',
            destination=Notification.Destination.ADMIN_USERS,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'You cannot deactivate your own administrator account.'})
        if instance.role == User.Role.ADMIN and User.objects.filter(
            role=User.Role.ADMIN, is_active=True, is_deleted=False
        ).count() <= 1:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'The last active administrator account cannot be deactivated.'})
        instance.is_deleted = True
        instance.is_active = False
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'is_active', 'deleted_at'])
        record_activity(self.request.user, 'DEACTIVATE', 'User', instance.pk, f'Deactivated account {instance.email}.')
        create_for_recipients(
            recipients=User.objects.filter(
                role=User.Role.ADMIN,
                is_active=True,
                is_deleted=False,
            ).exclude(pk=instance.pk),
            actor=self.request.user,
            event_type=Notification.EventType.ACCOUNT,
            title='User account deactivated',
            message='A user account was deactivated.',
            destination=Notification.Destination.ADMIN_USERS,
        )


class SystemSettingsView(APIView):
    def get_permissions(self):
        if self.request.method == 'PATCH':
            return [IsSystemAdmin()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        settings_obj, _ = SystemSettings.objects.get_or_create(pk=1)
        return Response(SystemSettingsSerializer(settings_obj).data)
    def patch(self, request):
        settings_obj, _ = SystemSettings.objects.get_or_create(pk=1)
        serializer = SystemSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        settings_obj = serializer.save(updated_by=request.user)
        record_activity(request.user, 'UPDATE', 'System settings', settings_obj.pk, 'Updated system settings.')
        return Response(SystemSettingsSerializer(settings_obj).data)
