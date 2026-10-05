from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'Admin', 'Admin'
        PROPERTY_MANAGER = 'Property Manager', 'Property Manager'
        AGENT = 'Agent', 'Agent'
        OWNER = 'Owner', 'Owner'
        TENANT = 'Tenant', 'Tenant'

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.TENANT)
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name', 'last_name']

    def __str__(self):
        return f"{self.email} ({self.role})"


class AuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='audit_events')
    action = models.CharField(max_length=64)
    entity_type = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=64, blank=True, default='')
    summary = models.CharField(max_length=500)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.action} {self.entity_type} {self.entity_id}'


class SystemSettings(models.Model):
    system_name = models.CharField(max_length=120, default='PropManage')
    support_email = models.EmailField(blank=True, default='')
    default_lease_term_months = models.PositiveSmallIntegerField(default=12)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='updated_system_settings')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.system_name
