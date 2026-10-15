from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('users', '0004_alter_auditevent_action'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='middle_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='user',
            name='phone_number',
            field=models.CharField(blank=True, default='', max_length=30),
        ),
    ]
