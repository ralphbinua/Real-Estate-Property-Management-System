import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0005_rentalapplication'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='property',
            name='application_approval_mode',
            field=models.CharField(
                choices=[('Manager', 'Property Manager decides'), ('Owner', 'Owner approval required')],
                default='Manager',
                max_length=20,
            ),
        ),
        migrations.AlterField(
            model_name='rentalapplication',
            name='status',
            field=models.CharField(
                choices=[
                    ('Submitted', 'Submitted'),
                    ('Under Review', 'Under Review'),
                    ('Pending Owner Approval', 'Pending Owner Approval'),
                    ('Approved', 'Approved'),
                    ('Rejected', 'Rejected'),
                    ('Converted', 'Converted'),
                ],
                default='Submitted',
                max_length=30,
            ),
        ),
        migrations.AddField(
            model_name='rentalapplication',
            name='owner_review_notes',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='rentalapplication',
            name='owner_reviewed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='rentalapplication',
            name='owner_reviewed_by',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='owner_reviewed_rental_applications',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
