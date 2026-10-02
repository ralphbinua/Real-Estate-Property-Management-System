from django.db import models
from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from properties.models import Property, Unit

class Contract(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Pending', 'Pending'),
        ('Terminated', 'Terminated'),
        ('Expired', 'Expired'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='contracts')
    unit = models.ForeignKey(Unit, on_delete=models.SET_NULL, null=True, blank=True, related_name='contracts')
    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tenant_contracts')
    start_date = models.DateField()
    end_date = models.DateField()
    rent_amount = models.DecimalField(max_digits=10, decimal_places=2)
    rent_due_day = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(28)],
        help_text='Day of each month rent is due (1–28).',
    )
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    ACTIVATION_BASIS_CHOICES = [
        ('Owner', 'Owner'),
        ('Manager Delegation', 'Manager Delegation'),
        ('Admin Override', 'Admin Override'),
    ]
    TERMINATION_BASIS_CHOICES = [
        ('Owner', 'Owner'),
        ('Manager Delegation', 'Manager Delegation'),
        ('Admin Override', 'Admin Override'),
    ]

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    manual_lease_reason = models.TextField(blank=True, default='')
    manual_lease_reference = models.CharField(max_length=500, blank=True, default='')
    source_application = models.ForeignKey(
        'properties.RentalApplication',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='lease_contracts',
    )
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='activated_lease_contracts',
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    activation_basis = models.CharField(max_length=30, choices=ACTIVATION_BASIS_CHOICES, blank=True, default='')
    activation_note = models.TextField(blank=True, default='')
    activation_instruction_reference = models.CharField(max_length=500, blank=True, default='')
    signed_copy_reference = models.CharField(max_length=500, blank=True, default='')
    terminated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='terminated_lease_contracts',
    )
    terminated_at = models.DateTimeField(null=True, blank=True)
    termination_effective_date = models.DateField(null=True, blank=True)
    termination_reason = models.TextField(blank=True, default='')
    termination_basis = models.CharField(max_length=30, choices=TERMINATION_BASIS_CHOICES, blank=True, default='')
    termination_note = models.TextField(blank=True, default='')
    termination_instruction_reference = models.CharField(max_length=500, blank=True, default='')
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Lease #{self.id} - {self.property.title}"
