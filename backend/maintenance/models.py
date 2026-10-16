from django.db import models
from django.conf import settings
from properties.models import Property, Unit

class MaintenanceRequest(models.Model):
    STATUS_CHOICES = [
        ('Open', 'Open'),
        ('In Progress', 'In Progress'),
        ('Resolved', 'Resolved'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='maintenance_requests')
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='maintenance_requests')
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='maintenance_requests')
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='assigned_maintenance_requests',
    )
    issue_description = models.TextField()
    priority = models.CharField(max_length=10, choices=[('Normal', 'Normal'), ('Urgent', 'Urgent')], default='Normal')
    vendor_name = models.CharField(max_length=160, blank=True, default='')
    vendor_contact = models.CharField(max_length=160, blank=True, default='')
    estimate_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    approval_status = models.CharField(max_length=20, choices=[
        ('Not Requested', 'Not Requested'), ('Pending', 'Pending'),
        ('Approved', 'Approved'), ('Rejected', 'Rejected'),
    ], default='Not Requested')
    approval_estimate_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    approval_requested_at = models.DateTimeField(null=True, blank=True)
    approval_decided_at = models.DateTimeField(null=True, blank=True)
    approval_decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='decided_maintenance_approvals',
    )
    approval_note = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Open')
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Maintenance #{self.id} - {self.property.title} ({self.status})"


class MaintenanceEvent(models.Model):
    request = models.ForeignKey(MaintenanceRequest, on_delete=models.CASCADE, related_name='events')
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    event_type = models.CharField(max_length=32)
    summary = models.CharField(max_length=500)
    tenant_visible = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']
