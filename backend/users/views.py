from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from django.utils import timezone
from .serializers import UserSerializer, UserCreateSerializer, CurrentUserProfileSerializer, SystemSettingsSerializer
from .audit import record_activity
from .models import AuditEvent, SystemSettings

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

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true':
            return User.objects.all().order_by('-id')
        return User.objects.filter(is_deleted=False).order_by('-id')

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
        events = AuditEvent.objects.select_related('actor').all()[:200]
        return Response([
            {
                'id': event.id,
                'actor': event.actor.email if event.actor else 'System',
                'action': event.action,
                'entityType': event.entity_type,
                'entityId': event.entity_id,
                'summary': event.summary,
                'createdAt': event.created_at,
            }
            for event in events
        ])

    def perform_create(self, serializer):
        user = serializer.save()
        record_activity(self.request.user, 'CREATE', 'User', user.pk, f'Created account {user.email} with role {user.role}.')

    def perform_update(self, serializer):
        user = serializer.save()
        user.is_active = not user.is_deleted
        user.deleted_at = timezone.now() if user.is_deleted else None
        user.save(update_fields=['is_active', 'deleted_at'])
        record_activity(self.request.user, 'UPDATE', 'User', user.pk, f'Updated account {user.email}.')

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
