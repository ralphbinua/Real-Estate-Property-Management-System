from django.db import models


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

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    address = models.CharField(max_length=500)
    property_type = models.CharField(max_length=20, choices=PROPERTY_TYPES)
    price = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # single-unit rate (e.g. House)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Available')

    # Placeholder FKs until the Users app exists — swap to real ForeignKey(User) later
    owner_id = models.IntegerField(null=True, blank=True)
    manager_id = models.IntegerField(null=True, blank=True)

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

    # Placeholder until the Users app exists
    tenant_id = models.IntegerField(null=True, blank=True)

    def __str__(self):
        return f"{self.property.title} — {self.unit_number}"