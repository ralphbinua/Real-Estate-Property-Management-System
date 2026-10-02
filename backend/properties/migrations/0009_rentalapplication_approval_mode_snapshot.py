from django.db import migrations, models


def backfill_approval_mode(apps, schema_editor):
    RentalApplication = apps.get_model('properties', 'RentalApplication')
    for application in RentalApplication.objects.select_related('inquiry__property').iterator():
        application.approval_mode = application.inquiry.property.application_approval_mode
        application.save(update_fields=['approval_mode'])


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0008_lease_authority_controls'),
    ]

    operations = [
        migrations.AddField(
            model_name='rentalapplication',
            name='approval_mode',
            field=models.CharField(
                blank=True,
                choices=[('Manager', 'Property Manager decides'), ('Owner', 'Owner approval required')],
                default='',
                help_text='Approval rule in effect when this application was submitted.',
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_approval_mode, migrations.RunPython.noop),
    ]
