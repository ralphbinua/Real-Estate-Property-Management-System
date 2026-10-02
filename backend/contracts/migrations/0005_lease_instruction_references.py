from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0004_lease_activation_and_termination_audit'),
    ]

    operations = [
        migrations.AddField(
            model_name='contract',
            name='activation_instruction_reference',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
        migrations.AddField(
            model_name='contract',
            name='termination_instruction_reference',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
    ]
