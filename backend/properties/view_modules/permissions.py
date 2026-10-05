from rest_framework import permissions
from django.contrib.auth import get_user_model

User = get_user_model()

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

class IsPropertyManager(permissions.BasePermission):
    message = 'Only the assigned Property Manager may submit a rent-change proposal.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role == 'Property Manager'
        )

class IsApplicationReviewer(permissions.BasePermission):
    message = 'Only administrators, property managers, and property owners may review applications.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Property Manager', 'Owner')
        )

class IsAdminOrOwner(permissions.BasePermission):
    message = 'Only administrators and property owners may perform this action.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_active
            and not user.is_deleted
            and user.role in ('Admin', 'Owner')
        )

class IsOwner(permissions.BasePermission):
    message = 'Only the property owner may grant or revoke this authority.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role == 'Owner'
        )

class IsOwnerOrAdmin(permissions.BasePermission):
    message = 'Only the property Owner or an Admin recording the Owner\'s instruction may change this approval rule.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and user.is_active and not user.is_deleted
            and user.role in ('Owner', 'Admin')
        )

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
