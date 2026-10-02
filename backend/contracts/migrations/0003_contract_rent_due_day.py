from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0002_lease_signing_authority'),
    ]

    operations = [
        migrations.AddField(
            model_name='contract',
            name='rent_due_day',
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text='Day of each month rent is due (1–28).',
                validators=[MinValueValidator(1), MaxValueValidator(28)],
            ),
        ),
    ]
