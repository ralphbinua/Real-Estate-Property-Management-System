import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0002_payment_ledger'),
    ]

    operations = [
        migrations.AlterField(
            model_name='payment',
            name='invoice',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='payments',
                to='billing.invoice',
            ),
        ),
    ]
