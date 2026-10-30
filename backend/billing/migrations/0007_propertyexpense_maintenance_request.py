from django.db import migrations, models
import django.db.models.deletion


def link_existing_maintenance_expenses(apps, schema_editor):
    MaintenanceRequest = apps.get_model('maintenance', 'MaintenanceRequest')
    PropertyExpense = apps.get_model('billing', 'PropertyExpense')
    db_alias = schema_editor.connection.alias
    for work in MaintenanceRequest.objects.using(db_alias).all().iterator():
        reference = f'Maintenance #{work.pk}'
        expense = PropertyExpense.objects.using(db_alias).filter(
            property_id=work.property_id, reference=reference,
            maintenance_request__isnull=True,
        ).order_by('id').first()
        if expense:
            expense.maintenance_request_id = work.pk
            expense.save(update_fields=['maintenance_request'])


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0006_alter_propertyexpense_status'),
        ('maintenance', '0003_maintenancerequest_actual_cost_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='propertyexpense',
            name='maintenance_request',
            field=models.OneToOneField(
                blank=True, null=True, on_delete=django.db.models.deletion.PROTECT,
                related_name='property_expense', to='maintenance.maintenancerequest',
            ),
        ),
        migrations.AlterField(
            model_name='propertyexpense',
            name='status',
            field=models.CharField(choices=[('Draft', 'Draft'), ('Pending', 'Pending'), ('Approved', 'Approved'), ('Rejected', 'Rejected'), ('Reversed', 'Reversed')], default='Pending', max_length=12),
        ),
        migrations.RunPython(link_existing_maintenance_expenses, migrations.RunPython.noop),
    ]
