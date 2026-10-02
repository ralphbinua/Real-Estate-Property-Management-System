from django.db import models
from django.conf import settings
from django.utils import timezone


class Property(models.Model):
    PROPERTY_TYPES = [
        ('Condo', 'Condo'),
        ('Apartment', 'Apartment'),
        ('House', 'House'),
        ('Commercial', 'Commercial'),
    ]
    STATUS_CHOICES = [
        ('Available', 'Available'),
        ('Occupied', 'Occupied'),
        ('Pending', 'Pending'),
        ('Under Maintenance', 'Under Maintenance'),
    ]
    APPLICATION_APPROVAL_MODES = [
        ('Manager', 'Property Manager decides'),
        ('Owner', 'Owner approval required'),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    address = models.CharField(max_length=500)
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPES)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # single-unit rate (e.g. House)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Available')
    application_approval_mode = models.CharField(
        max_length=20, choices=APPLICATION_APPROVAL_MODES, default='Owner'
    )

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_properties')
    manager = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='managed_properties')
    assigned_agents = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name='assigned_properties',
        limit_choices_to={'role': 'Agent'},
    )

    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        is_new = self._state.adding
        super().save(*args, **kwargs)

        # Mirrors the Mongoose pre('save') hook: House properties
        # always get one auto-created "Main House" unit.
        if is_new and self.property_type == 'House' and not self.units.exists():
            Unit.objects.create(
                property=self,
                unit_number='Main House',
                monthly_rate=self.price or 0,
                status=self.status or 'Available',
            )

    def __str__(self):
        return self.title


class Unit(models.Model):
    STATUS_CHOICES = [
        ('Available', 'Available'),
        ('Occupied', 'Occupied'),
        ('Maintenance', 'Maintenance'),
        ('Reserved', 'Reserved'),
    ]

    property = models.ForeignKey(Property, related_name='units', on_delete=models.CASCADE)
    unit_number = models.CharField(max_length=100, default='Main Unit')
    monthly_rate = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Available')

    tenant = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='rented_units')

    def __str__(self):
        return f"{self.property.title} — {self.unit_number}"


class PropertyInquiry(models.Model):
    STATUS_CHOICES = [
        ('New', 'New'),
        ('Viewing Scheduled', 'Viewing Scheduled'),
        ('Application In Progress', 'Application In Progress'),
        ('Converted', 'Converted'),
        ('Closed', 'Closed'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='inquiries')
    unit = models.ForeignKey(Unit, null=True, blank=True, on_delete=models.SET_NULL, related_name='inquiries')
    agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='property_inquiries',
    )
    prospect_name = models.CharField(max_length=255)
    prospect_email = models.EmailField(blank=True, default='')
    viewing_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='New')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.prospect_name} — {self.property.title} ({self.status})"


class RentalApplication(models.Model):
    STATUS_CHOICES = [
        ('Submitted', 'Submitted'),
        ('Under Review', 'Under Review'),
        ('Pending Owner Approval', 'Pending Owner Approval'),
        ('Approved', 'Approved'),
        ('Rejected', 'Rejected'),
        ('Converted', 'Converted'),
    ]

    inquiry = models.OneToOneField(PropertyInquiry, on_delete=models.CASCADE, related_name='rental_application')
    approval_mode = models.CharField(
        max_length=20,
        choices=Property.APPLICATION_APPROVAL_MODES,
        blank=True,
        default='',
        help_text='Approval rule in effect when this application was submitted.',
    )
    applicant_email = models.EmailField(max_length=254)
    employment = models.CharField(max_length=255, blank=True, default='')
    monthly_income = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    move_in_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default='Submitted')
    review_notes = models.TextField(blank=True, default='')
    owner_review_notes = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='created_rental_applications')
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_rental_applications')
    owner_reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='owner_reviewed_rental_applications')
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    owner_reviewed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Application — {self.inquiry.prospect_name} ({self.status})"


class RentalApplicationDecision(models.Model):
    application = models.ForeignKey(
        RentalApplication,
        on_delete=models.CASCADE,
        related_name='decisions',
    )
    from_status = models.CharField(max_length=30, blank=True, default='')
    to_status = models.CharField(max_length=30)
    authority = models.CharField(max_length=30, blank=True, default='')
    note = models.TextField(blank=True, default='')
    instruction_reference = models.CharField(max_length=500, blank=True, default='')
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='rental_application_decisions',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at', 'id']

    def __str__(self):
        return f"Application {self.application_id}: {self.from_status} → {self.to_status}"


class PropertyApprovalPolicyChange(models.Model):
    property = models.ForeignKey(
        Property,
        on_delete=models.CASCADE,
        related_name='approval_policy_changes',
    )
    previous_mode = models.CharField(max_length=20, choices=Property.APPLICATION_APPROVAL_MODES)
    new_mode = models.CharField(max_length=20, choices=Property.APPLICATION_APPROVAL_MODES)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='property_approval_policy_changes',
    )
    instruction_note = models.TextField(blank=True, default='')
    instruction_reference = models.CharField(max_length=500, blank=True, default='')
    changed_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-changed_at', '-id']

    def __str__(self):
        return f"{self.property.title}: {self.previous_mode} → {self.new_mode}"


class LeaseSigningAuthorization(models.Model):
    property = models.OneToOneField(
        Property,
        on_delete=models.CASCADE,
        related_name='lease_signing_authorization',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='lease_signing_authorizations',
    )
    agreement_reference = models.CharField(max_length=500)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='granted_lease_signing_authorizations',
    )
    granted_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='revoked_lease_signing_authorizations',
    )
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        state = 'active' if self.is_active else 'revoked'
        return f"Lease signing authority for {self.property.title} ({state})"


class LeaseTerminationAuthorization(models.Model):
    property = models.OneToOneField(
        Property,
        on_delete=models.CASCADE,
        related_name='lease_termination_authorization',
    )
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='lease_termination_authorizations',
    )
    agreement_reference = models.CharField(max_length=500)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='granted_lease_termination_authorizations',
    )
    granted_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)
    revoked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='revoked_lease_termination_authorizations',
    )
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        state = 'active' if self.is_active else 'revoked'
        return f"Lease termination authority for {self.property.title} ({state})"


class PropertyAuthorityEvent(models.Model):
    AUTHORITY_CHOICES = [
        ('Lease signing', 'Lease signing'),
        ('Lease termination', 'Lease termination'),
    ]
    ACTION_CHOICES = [
        ('Granted', 'Granted'),
        ('Revoked', 'Revoked'),
    ]

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='authority_events')
    authority = models.CharField(max_length=30, choices=AUTHORITY_CHOICES)
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    manager = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='received_property_authority_events',
    )
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name='recorded_property_authority_events',
    )
    agreement_reference = models.CharField(max_length=500, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f"{self.action} {self.authority} for {self.property.title}"
