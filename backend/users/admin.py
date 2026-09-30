from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, AuditEvent, SystemSettings

@admin.register(User)
class CustomUserAdmin(UserAdmin):
    model = User
    list_display = ['email', 'username', 'role', 'is_staff', 'is_deleted']
    fieldsets = UserAdmin.fieldsets + (
        ('Custom Fields', {'fields': ('role', 'is_deleted', 'deleted_at')}),
    )


@admin.register(AuditEvent)
class AuditEventAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'actor', 'action', 'entity_type', 'entity_id', 'summary']
    list_filter = ['action', 'entity_type', 'created_at']
    search_fields = ['summary', 'entity_id', 'actor__email']
    readonly_fields = ['actor', 'action', 'entity_type', 'entity_id', 'summary', 'created_at']


@admin.register(SystemSettings)
class SystemSettingsAdmin(admin.ModelAdmin):
    list_display = ['system_name', 'support_email', 'default_lease_term_months', 'updated_at']
    readonly_fields = ['updated_at', 'updated_by']
