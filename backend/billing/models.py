from django.db import models
from django.conf import settings
from django.db.models import Q
from properties.models import Property
from contracts.models import Contract

class Invoice(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Pending Verification', 'Pending Verification'),
        ('Paid', 'Paid'),
        ('Partially Paid', 'Partially Paid'),
        ('Overdue', 'Overdue'),
        ('Cancelled', 'Cancelled'),
    ]

    PAYMENT_METHODS = [
        ('Cash', 'Cash'),
        ('Bank Transfer', 'Bank Transfer'),
        ('GCash', 'GCash'),
        ('Check', 'Check'),
        ('N/A', 'N/A'),
    ]

    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name='invoices')
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='invoices')
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='invoices')

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    late_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0.00)
    total_due = models.DecimalField(max_digits=12, decimal_places=2)
    due_date = models.DateField()

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='Pending')
    paid_at = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=30, choices=PAYMENT_METHODS, default='N/A')
    receipt_url = models.CharField(max_length=500, blank=True, default='')
    remarks = models.TextField(blank=True, default='')

    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Invoice #{self.id} - {self.tenant.email} (₱{self.total_due})"


class Payment(models.Model):
    class Status(models.TextChoices):
        PENDING_VERIFICATION = 'Pending Verification', 'Pending Verification'
        VERIFIED = 'Verified', 'Verified'
        REJECTED = 'Rejected', 'Rejected'
        REVERSED = 'Reversed', 'Reversed'

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='payments')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_method = models.CharField(max_length=30, choices=Invoice.PAYMENT_METHODS, default='N/A')
    payment_date = models.DateField(null=True, blank=True)
    reference_number = models.CharField(max_length=120, blank=True, default='')
    receipt_url = models.CharField(max_length=500, blank=True, default='')
    remarks = models.TextField(blank=True, default='')
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING_VERIFICATION)
    legacy_import = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='created_rent_payments',
    )
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='verified_rent_payments',
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='rejected_rent_payments',
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default='')
    reversed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='reversed_rent_payments',
    )
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at', '-id']
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0),
                name='billing_payment_amount_gt_zero',
            ),
        ]
        indexes = [
            models.Index(fields=['invoice', 'status'], name='billing_payment_inv_status_idx'),
        ]

    def __str__(self):
        return f"Payment #{self.pk} - Invoice #{self.invoice_id} ({self.status})"
