from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('contracts', '0007_contract_turnover_completed_at_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='leaserenewal',
            name='contract',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='renewal_proposals',
                to='contracts.contract',
            ),
        ),
        migrations.AddField(
            model_name='leaserenewal',
            name='version',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddConstraint(
            model_name='leaserenewal',
            constraint=models.UniqueConstraint(fields=('contract', 'version'), name='unique_lease_renewal_version'),
        ),
        migrations.AlterModelOptions(
            name='leaserenewal',
            options={'ordering': ['-version', '-id']},
        ),
    ]
