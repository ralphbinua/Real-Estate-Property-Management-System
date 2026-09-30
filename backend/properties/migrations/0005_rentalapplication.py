import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0004_propertyinquiry'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='RentalApplication',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('applicant_email', models.EmailField(max_length=254)),
                ('employment', models.CharField(blank=True, default='', max_length=255)),
                ('monthly_income', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('move_in_date', models.DateField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('Submitted', 'Submitted'), ('Under Review', 'Under Review'), ('Approved', 'Approved'), ('Rejected', 'Rejected'), ('Converted', 'Converted')], default='Submitted', max_length=20)),
                ('review_notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('reviewed_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_rental_applications', to=settings.AUTH_USER_MODEL)),
                ('inquiry', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='rental_application', to='properties.propertyinquiry')),
                ('reviewed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reviewed_rental_applications', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
