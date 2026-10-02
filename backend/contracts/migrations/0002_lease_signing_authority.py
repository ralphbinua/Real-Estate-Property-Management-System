import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0001_initial'),
        ('properties', '0007_lease_signing_authorization'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='contract',
            name='status',
            field=models.CharField(
                choices=[('Active', 'Active'), ('Pending', 'Pending'), ('Terminated', 'Terminated'), ('Expired', 'Expired')],
                default='Pending',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='contract',
            name='source_application',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lease_contracts', to='properties.rentalapplication'),
        ),
        migrations.AddField(
            model_name='contract',
            name='activated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='activated_lease_contracts', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='contract',
            name='activated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='contract',
            name='activation_basis',
            field=models.CharField(blank=True, choices=[('Owner', 'Owner'), ('Manager Delegation', 'Manager Delegation'), ('Admin Override', 'Admin Override')], default='', max_length=30),
        ),
        migrations.AddField(
            model_name='contract',
            name='activation_note',
            field=models.TextField(blank=True, default=''),
        ),
    ]
