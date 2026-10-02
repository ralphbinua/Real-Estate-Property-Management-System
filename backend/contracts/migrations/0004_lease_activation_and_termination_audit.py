import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0003_contract_rent_due_day'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='contract',
            name='manual_lease_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='contract',
            name='manual_lease_reference',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='contract',
            name='signed_copy_reference',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='contract',
            name='terminated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='terminated_lease_contracts', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='contract',
            name='terminated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='contract',
            name='termination_effective_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='contract',
            name='termination_reason',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='contract',
            name='termination_basis',
            field=models.CharField(blank=True, choices=[('Owner', 'Owner'), ('Manager Delegation', 'Manager Delegation'), ('Admin Override', 'Admin Override')], default='', max_length=30),
        ),
        migrations.AddField(
            model_name='contract',
            name='termination_note',
            field=models.TextField(blank=True, default=''),
        ),
    ]
