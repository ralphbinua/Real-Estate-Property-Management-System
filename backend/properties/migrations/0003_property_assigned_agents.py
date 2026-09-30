from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0002_remove_property_manager_id_remove_property_owner_id_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='property',
            name='assigned_agents',
            field=models.ManyToManyField(
                blank=True,
                limit_choices_to={'role': 'Agent'},
                related_name='assigned_properties',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
