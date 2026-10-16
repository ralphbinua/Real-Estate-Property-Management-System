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
    turnover_pending = models.BooleanField(default=False)
    turnover_completed_at = models.DateTimeField(null=True, blank=True)
    is_deleted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Lease #{self.id} - {self.property.title}"


class LeaseRenewal(models.Model):
    class Status(models.TextChoices):
        PROPOSED = 'Proposed', 'Proposed'
        APPROVED = 'Approved', 'Approved'
        DECLINED = 'Declined', 'Declined'
        PREPARED = 'Prepared', 'Prepared'

    contract = models.OneToOneField(Contract, on_delete=models.PROTECT, related_name='renewal')
    proposed_start_date = models.DateField()
    proposed_end_date = models.DateField()
    proposed_rent = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PROPOSED)
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='initiated_renewals')
    initiated_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name='decided_renewals')
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True, default='')
    successor = models.OneToOneField(Contract, on_delete=models.PROTECT, null=True, blank=True, related_name='renewed_from')

    def __str__(self):
        return f'Renewal for lease #{self.contract_id} ({self.status})'


class LeaseExpiryReminder(models.Model):
    contract = models.ForeignKey(Contract, on_delete=models.CASCADE, related_name='expiry_reminders')
    days_before = models.PositiveSmallIntegerField()
    sent_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['contract', 'days_before'], name='unique_lease_expiry_reminder')]


class LeaseInspection(models.Model):
    contract = models.ForeignKey(Contract, on_delete=models.PROTECT, related_name='inspections')
    kind = models.CharField(max_length=12, choices=[('Move In', 'Move In'), ('Move Out', 'Move Out')])
    version = models.PositiveIntegerField()
    inspected_on = models.DateField()
    checklist = models.JSONField(default=dict)
    notes = models.TextField(blank=True, default='')
    evidence_reference = models.CharField(max_length=500, blank=True, default='')
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='recorded_lease_inspections')
    created_at = models.DateTimeField(auto_now_add=True)
    tenant_acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['contract', 'kind', 'version'], name='unique_lease_inspection_version')]
        ordering = ['kind', '-version']


class DepositSettlement(models.Model):
    contract = models.OneToOneField(Contract, on_delete=models.PROTECT, related_name='deposit_settlement')
    deductions = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField(blank=True, default='')
    evidence_reference = models.CharField(max_length=500, blank=True, default='')
    status = models.CharField(max_length=12, choices=[('Pending', 'Pending'), ('Approved', 'Approved'), ('Rejected', 'Rejected')], default='Pending')
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='requested_deposit_settlements')
    requested_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='decided_deposit_settlements', null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True, default='')

    @property
    def return_amount(self):
        return self.contract.deposit_amount - self.deductions
