import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0009_rentalapplication_approval_mode_snapshot'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='UnitPricingAuthorization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('agreement_reference', models.CharField(max_length=500)),
                ('granted_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('is_active', models.BooleanField(default=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('granted_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_unit_pricing_authorizations', to=settings.AUTH_USER_MODEL)),
                ('manager', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='unit_pricing_authorizations', to=settings.AUTH_USER_MODEL)),
                ('property', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='unit_pricing_authorization', to='properties.property')),
                ('revoked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='revoked_unit_pricing_authorizations', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='UnitPriceChangeRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('target_kind', models.CharField(choices=[('Property', 'Property base rate'), ('Unit', 'Unit')], default='Unit', max_length=20)),
                ('target_label', models.CharField(max_length=120)),
                ('current_rate', models.DecimalField(decimal_places=2, max_digits=12)),
                ('proposed_rate', models.DecimalField(decimal_places=2, max_digits=12)),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('Pending', 'Pending Owner review'), ('Approved', 'Approved'), ('Rejected', 'Rejected'), ('Cancelled', 'Cancelled — rate or unit changed')], default='Pending', max_length=20)),
                ('decision_note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('decided_at', models.DateTimeField(blank=True, null=True)),
                ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decided_unit_price_changes', to=settings.AUTH_USER_MODEL)),
                ('proposed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='proposed_unit_price_changes', to=settings.AUTH_USER_MODEL)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rent_change_requests', to='properties.property')),
                ('unit', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rent_change_requests', to='properties.unit')),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.AlterField(
            model_name='propertyauthorityevent',
            name='authority',
            field=models.CharField(choices=[('Lease signing', 'Lease signing'), ('Lease termination', 'Lease termination'), ('Rent pricing', 'Rent pricing')], max_length=30),
        ),
    ]
