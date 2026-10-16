import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('billing', '0003_protect_payment_invoice_history'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [migrations.CreateModel(name='BillingRun', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('month', models.DateField()),
        ('trigger', models.CharField(choices=[('Manual', 'Manual'), ('Scheduled', 'Scheduled')], max_length=20)),
        ('status', models.CharField(choices=[('Running', 'Running'), ('Succeeded', 'Succeeded'), ('Failed', 'Failed')], default='Running', max_length=20)),
        ('started_at', models.DateTimeField(auto_now_add=True)),
        ('finished_at', models.DateTimeField(blank=True, null=True)),
        ('created_count', models.PositiveIntegerField(default=0)),
        ('error_summary', models.CharField(blank=True, default='', max_length=500)),
        ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
    ], options={'ordering': ['-started_at', '-id']})]
