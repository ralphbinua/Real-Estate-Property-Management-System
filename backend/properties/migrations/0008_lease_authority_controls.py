import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0007_lease_signing_authorization'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='property',
            name='application_approval_mode',
            field=models.CharField(
                choices=[('Manager', 'Property Manager decides'), ('Owner', 'Owner approval required')],
                default='Owner',
                max_length=20,
            ),
        ),
        migrations.CreateModel(
            name='LeaseTerminationAuthorization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('agreement_reference', models.CharField(max_length=500)),
                ('granted_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('is_active', models.BooleanField(default=True)),
                ('revoked_at', models.DateTimeField(blank=True, null=True)),
                ('granted_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='granted_lease_termination_authorizations', to=settings.AUTH_USER_MODEL)),
                ('manager', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='lease_termination_authorizations', to=settings.AUTH_USER_MODEL)),
                ('property', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='lease_termination_authorization', to='properties.property')),
                ('revoked_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='revoked_lease_termination_authorizations', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='PropertyAuthorityEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('authority', models.CharField(choices=[('Lease signing', 'Lease signing'), ('Lease termination', 'Lease termination')], max_length=30)),
                ('action', models.CharField(choices=[('Granted', 'Granted'), ('Revoked', 'Revoked')], max_length=10)),
                ('agreement_reference', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('manager', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='received_property_authority_events', to=settings.AUTH_USER_MODEL)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='authority_events', to='properties.property')),
                ('recorded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='recorded_property_authority_events', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='PropertyApprovalPolicyChange',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('previous_mode', models.CharField(choices=[('Manager', 'Property Manager decides'), ('Owner', 'Owner approval required')], max_length=20)),
                ('new_mode', models.CharField(choices=[('Manager', 'Property Manager decides'), ('Owner', 'Owner approval required')], max_length=20)),
                ('instruction_note', models.TextField(blank=True, default='')),
                ('instruction_reference', models.CharField(blank=True, default='', max_length=500)),
                ('changed_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('changed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='property_approval_policy_changes', to=settings.AUTH_USER_MODEL)),
                ('property', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='approval_policy_changes', to='properties.property')),
            ],
            options={'ordering': ['-changed_at', '-id']},
        ),
        migrations.CreateModel(
            name='RentalApplicationDecision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_status', models.CharField(blank=True, default='', max_length=30)),
                ('to_status', models.CharField(max_length=30)),
                ('authority', models.CharField(blank=True, default='', max_length=30)),
                ('note', models.TextField(blank=True, default='')),
                ('instruction_reference', models.CharField(blank=True, default='', max_length=500)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rental_application_decisions', to=settings.AUTH_USER_MODEL)),
                ('application', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='decisions', to='properties.rentalapplication')),
            ],
            options={'ordering': ['created_at', 'id']},
        ),
    ]
