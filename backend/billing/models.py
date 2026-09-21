from django.db import models
from django.conf import settings
from properties.models import Property
from contracts.models import Contract

class Invoice(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pending'),
        ('Pending Verification', 'Pending Verification'),
        ('Paid', 'Paid'),
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
