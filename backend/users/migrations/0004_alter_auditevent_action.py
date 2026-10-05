from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_systemsettings'),
    ]

    operations = [
        migrations.AlterField(
            model_name='auditevent',
            name='action',
            field=models.CharField(max_length=64),
        ),
    ]
