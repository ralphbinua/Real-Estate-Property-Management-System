from django.conf import settings
from django.db import models


class Notification(models.Model):
    class EventType(models.TextChoices):
        ACCOUNT = 'account', 'Account update'
        PROPERTY = 'property', 'Property assignment'
        INQUIRY = 'inquiry', 'Inquiry update'
        APPLICATION = 'application', 'Application update'
        RENT_CHANGE = 'rent_change', 'Rent change'
        MAINTENANCE = 'maintenance', 'Maintenance update'
        INVOICE = 'invoice', 'Rent invoice'
        PAYMENT = 'payment', 'Payment update'
        LEASE = 'lease', 'Lease update'

    class Destination(models.TextChoices):
        ADMIN_OVERVIEW = 'admin.overview', 'Admin overview'
        ADMIN_USERS = 'admin.users', 'Admin user accounts'
        OWNER_OVERVIEW = 'owner.overview', 'Owner overview'
        OWNER_APPROVALS = 'owner.approvals', 'Owner application approvals'
        OWNER_PRICING = 'owner.pricing', 'Owner rent changes'
        OWNER_MAINTENANCE = 'owner.maintenance', 'Owner maintenance'
        OWNER_BILLING = 'owner.billing', 'Owner payments'
        OWNER_CONTRACTS = 'owner.contracts', 'Owner leases'
        MANAGER_OVERVIEW = 'manager.overview', 'Manager overview'
        MANAGER_PROPERTIES = 'manager.properties', 'Manager properties'
        MANAGER_INQUIRIES = 'manager.inquiries', 'Manager inquiries'
        MANAGER_APPLICATIONS = 'manager.applications', 'Manager applications'
        MANAGER_PRICING = 'manager.pricing', 'Manager rent changes'
        MANAGER_MAINTENANCE = 'manager.maintenance', 'Manager maintenance'
        MANAGER_BILLING = 'manager.billing', 'Manager rent ledger'
        MANAGER_CONTRACTS = 'manager.contracts', 'Manager leases'
        AGENT_OVERVIEW = 'agent.overview', 'Agent overview'
        AGENT_LISTINGS = 'agent.listings', 'Agent listings'
        AGENT_INQUIRIES = 'agent.inquiries', 'Agent inquiries'
        AGENT_APPLICATIONS = 'agent.applications', 'Agent applications'
        TENANT_OVERVIEW = 'tenant.overview', 'Tenant overview'
        TENANT_PAYMENTS = 'tenant.payments', 'Tenant payments'
        TENANT_LEASE = 'tenant.lease', 'Tenant lease'
        TENANT_MAINTENANCE = 'tenant.maintenance', 'Tenant maintenance'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    event_type = models.CharField(max_length=24, choices=EventType.choices)
    title = models.CharField(max_length=160)
    message = models.CharField(max_length=280)
    destination = models.CharField(max_length=32, choices=Destination.choices)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(
                fields=['recipient', 'read_at', '-created_at'],
                name='notif_user_read_date_idx',
            ),
            models.Index(
                fields=['recipient', '-created_at'],
                name='notif_user_date_idx',
            ),
        ]

    @property
    def is_read(self):
        return self.read_at is not None

    def __str__(self):
        return f'{self.title} for {self.recipient_id}'
