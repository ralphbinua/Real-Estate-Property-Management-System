import hashlib
from django.core.exceptions import ValidationError
from django.core.validators import validate_email

from rest_framework import viewsets, permissions
from rest_framework.authentication import SessionAuthentication
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle, UserRateThrottle
from rest_framework import status
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
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

class LoginThrottle(AnonRateThrottle):
    rate = '5/min'


class AccountLoginThrottle(SimpleRateThrottle):
    scope = 'login_account'
    rate = '10/min'

    def get_cache_key(self, request, view):
        email = str(request.data.get('email', '')).strip().casefold()
        if not email:
            return None
        digest = hashlib.sha256(email.encode('utf-8')).hexdigest()
        return self.cache_format % {'scope': self.scope, 'ident': digest}


class PasswordChangeThrottle(UserRateThrottle):
    rate = '5/min'
    scope = 'password_change'


class EmailChangeThrottle(UserRateThrottle):
    rate = '3/hour'
    scope = 'email_change'


class CsrfView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({'detail': 'CSRF cookie set.'})


@method_decorator(csrf_protect, name='dispatch')
class SessionLoginView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginThrottle, AccountLoginThrottle]

    def post(self, request):
        email = str(request.data.get('email', '')).strip()
        password = request.data.get('password', '')
        user = User.objects.filter(email__iexact=email).first()
        authenticated = authenticate(request, email=user.email if user else email, password=password)
        if not authenticated or authenticated.is_deleted or not authenticated.is_active:
            return Response({'detail': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)
        login(request, authenticated)
        return Response(CurrentUserProfileSerializer(authenticated).data)


class SessionLogoutView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response({'detail': 'Signed out.'})


class PasswordChangeView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [PasswordChangeThrottle]

    def post(self, request):
        form = PasswordChangeForm(request.user, {
            'old_password': request.data.get('current_password', ''),
            'new_password1': request.data.get('new_password', ''),
            'new_password2': request.data.get('confirm_password', ''),
        })
        if not form.is_valid():
            field_names = {
                'old_password': 'current_password',
                'new_password1': 'new_password',
                'new_password2': 'confirm_password',
            }
            errors = {field_names.get(key, key): list(values) for key, values in form.errors.items()}
            return Response(errors, status=status.HTTP_400_BAD_REQUEST)
        user = form.save()
        update_session_auth_hash(request._request, user)
        record_activity(user, 'UPDATE', 'Account password', user.pk, 'Changed account password.')
        return Response({'detail': 'Your password was changed.'})


def email_in_use(email, excluding_user):
    return User.objects.exclude(pk=excluding_user.pk).filter(
        Q(email__iexact=email) | Q(username__iexact=email)
    ).exists()


class EmailChangeView(APIView):
    authentication_classes = [SessionAuthentication]
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [EmailChangeThrottle]

    def post(self, request):
        user = request.user
        new_email = str(request.data.get('new_email', '')).strip()
        if not user.check_password(str(request.data.get('current_password', ''))):
            return Response({'current_password': ['Incorrect password.']}, status=400)
        try:
            validate_email(new_email)
        except ValidationError:
            return Response({'new_email': ['Enter a valid email address.']}, status=400)
        if new_email.casefold() == user.email.casefold() or email_in_use(new_email, user):
            return Response({'new_email': ['This email address cannot be used.']}, status=400)
        try:
            with transaction.atomic():
                user.email = new_email
                user.username = new_email
                user.save(update_fields=['email', 'username'])
        except IntegrityError:
            return Response({'new_email': ['This email address cannot be used.']}, status=400)
        record_activity(user, 'UPDATE', 'Account email', user.pk, 'Changed account email.')
        return Response({'detail': 'Your email address was updated.', 'profile': CurrentUserProfileSerializer(user).data})

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
        status_filter = self.request.query_params.get('status', '').strip().casefold()
        users = User.objects.filter(is_deleted=False)
        if status_filter == 'inactive':
            users = User.objects.filter(is_active=False, is_deleted=False)
        elif status_filter == 'active':
            users = users.filter(is_active=True, is_deleted=False)
        elif status_filter not in ('', 'inactive', 'all'):
            users = users.none()
        role = self.request.query_params.get('role')
        roles = [value.strip() for value in self.request.query_params.get('roles', '').split(',') if value.strip()]
        search = self.request.query_params.get('search', '').strip()
        role_values = {value.casefold(): value for value in User.Role.values}
        if role:
            users = users.filter(role=role_values.get(role.casefold(), role))
        elif roles:
            normalized_roles = [role_values.get(value.casefold(), value) for value in roles]
            users = users.filter(role__in=normalized_roles)
        if search:
            matching_roles = [
                role_value
                for role_value, role_label in User.Role.choices
                if search.casefold() in role_label.casefold()
            ]
            users = users.filter(
                Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(middle_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(phone_number__icontains=search)
                | Q(role__in=matching_roles)
            )
        property_id = self.request.query_params.get('property_id', '').strip()
        if property_id:
            if not property_id.isdecimal():
                users = users.none()
            else:
                users = users.filter(
                    Q(owned_properties__id=property_id)
                    | Q(managed_properties__id=property_id)
                    | Q(assigned_properties__id=property_id)
                ).distinct()
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
            from properties.models import RentalApplication
            approved_applications = RentalApplication.objects.filter(
                inquiry__property__manager=user,
                inquiry__property__is_deleted=False,
                status='Approved',
                applicant_email__iexact=OuterRef('email'),
            )
            tenants = User.objects.annotate(
                has_approved_application=Exists(approved_applications),
            ).filter(
                role=User.Role.TENANT,
                is_active=True,
                is_deleted=False,
            ).filter(
                Q(rented_units__property__manager=user)
                | Q(tenant_contracts__property__manager=user, tenant_contracts__is_deleted=False)
                | Q(has_approved_application=True)
            ).distinct()
        else:
            return Response({'detail': 'Only administrators and property managers may browse tenant accounts.'}, status=403)
        return Response(UserSerializer(tenants.order_by('last_name', 'first_name'), many=True).data)

    @action(detail=False, methods=['get'], permission_classes=[IsSystemAdmin])
    def activity(self, request):
        events = AuditEvent.objects.select_related('actor').all().order_by('-created_at', '-id')
        action_name = request.query_params.get('action')
        search = request.query_params.get('search', '').strip()
        entity_type = request.query_params.get('entityType', request.query_params.get('entity_type', '')).strip()
        entity_id = request.query_params.get('entityId', request.query_params.get('entity_id', '')).strip()
        if action_name:
            events = events.filter(action=action_name)
        if entity_type:
            events = events.filter(entity_type__iexact=entity_type)
        if entity_id:
            events = events.filter(entity_id=entity_id)
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
        previous_active = serializer.instance.is_active and not previous_deleted
        user = serializer.save()
        if user.is_deleted:
            user.is_active = False
        user.deleted_at = timezone.now() if user.is_deleted else None
        user.save(update_fields=['is_active', 'deleted_at'])

        role_changed = user.role != previous_role
        deactivated = previous_active and not user.is_active and not user.is_deleted
        soft_deleted = user.is_deleted and not previous_deleted
        restored = previous_deleted and not user.is_deleted
        reactivated = user.is_active and not previous_active and not user.is_deleted
        if soft_deleted:
            action = 'SOFT DELETE'
        elif deactivated:
            action = 'DEACTIVATE'
        elif restored:
            action = 'RESTORE'
        elif reactivated:
            action = 'REACTIVATE'
        else:
            action = 'UPDATE'
        record_activity(self.request.user, action, 'User', user.pk, f'{action.title()} account {user.email}.')

        status_changed = deactivated or soft_deleted or restored or reactivated
        if not role_changed and not status_changed:
            return

        status_message = {
            'DEACTIVATE': 'deactivated',
            'SOFT DELETE': 'soft-deleted',
            'RESTORE': 'restored',
            'REACTIVATE': 'reactivated',
        }.get(action, 'updated')

        if reactivated or (role_changed and user.is_active and not user.is_deleted):
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
                    title='Your account was reactivated' if reactivated else 'Your account was updated',
                    message='Your account is active again and you can sign in.' if reactivated else 'Your account access or role has changed.',
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
            message=f'An account was {status_message}.',
            destination=Notification.Destination.ADMIN_USERS,
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'You cannot soft-delete your own administrator account.'})
        if instance.role == User.Role.ADMIN and instance.is_active and User.objects.filter(
            role=User.Role.ADMIN, is_active=True, is_deleted=False
        ).count() <= 1:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail': 'The last active administrator account cannot be soft-deleted.'})
        instance.is_deleted = True
        instance.is_active = False
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_deleted', 'is_active', 'deleted_at'])
        record_activity(self.request.user, 'SOFT DELETE', 'User', instance.pk, f'Soft-deleted account {instance.email}.')
        create_for_recipients(
            recipients=User.objects.filter(
                role=User.Role.ADMIN,
                is_active=True,
                is_deleted=False,
            ).exclude(pk=instance.pk),
            actor=self.request.user,
            event_type=Notification.EventType.ACCOUNT,
            title='User account deleted',
            message='A user account was soft-deleted and retained in the database.',
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
