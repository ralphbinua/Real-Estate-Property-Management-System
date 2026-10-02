import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def backfill_legacy_payments(apps, schema_editor):
    Invoice = apps.get_model('billing', 'Invoice')
    Payment = apps.get_model('billing', 'Payment')
    database = schema_editor.connection.alias

    for invoice in Invoice.objects.using(database).filter(
        status__in=['Paid', 'Pending Verification'],
    ).iterator():
        is_paid = invoice.status == 'Paid'
        payment = Payment.objects.using(database).create(
            invoice_id=invoice.pk,
            amount=invoice.total_due,
            payment_method=invoice.payment_method or 'N/A',
            payment_date=invoice.paid_at.date() if is_paid and invoice.paid_at else None,
            receipt_url=invoice.receipt_url,
            remarks=invoice.remarks,
            status='Verified' if is_paid else 'Pending Verification',
            legacy_import=True,
            created_by_id=None,
            verified_by_id=None,
            verified_at=invoice.paid_at if is_paid else None,
        )
        # The legacy invoice did not retain when its payment was submitted or recorded.
        Payment.objects.using(database).filter(pk=payment.pk).update(created_at=None)


def remove_legacy_payments(apps, schema_editor):
    Payment = apps.get_model('billing', 'Payment')
    Payment.objects.using(schema_editor.connection.alias).filter(legacy_import=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ('billing', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Payment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, max_digits=12)),
                ('payment_method', models.CharField(choices=[('Cash', 'Cash'), ('Bank Transfer', 'Bank Transfer'), ('GCash', 'GCash'), ('Check', 'Check'), ('N/A', 'N/A')], default='N/A', max_length=30)),
                ('payment_date', models.DateField(blank=True, null=True)),
                ('reference_number', models.CharField(blank=True, default='', max_length=120)),
                ('receipt_url', models.CharField(blank=True, default='', max_length=500)),
                ('remarks', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('Pending Verification', 'Pending Verification'), ('Verified', 'Verified'), ('Rejected', 'Rejected'), ('Reversed', 'Reversed')], default='Pending Verification', max_length=30)),
                ('legacy_import', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, blank=True, null=True)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('rejected_at', models.DateTimeField(blank=True, null=True)),
                ('rejection_reason', models.TextField(blank=True, default='')),
                ('reversed_at', models.DateTimeField(blank=True, null=True)),
                ('reversal_reason', models.TextField(blank=True, default='')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_rent_payments', to=settings.AUTH_USER_MODEL)),
                ('invoice', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='payments', to='billing.invoice')),
                ('rejected_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rejected_rent_payments', to=settings.AUTH_USER_MODEL)),
                ('reversed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reversed_rent_payments', to=settings.AUTH_USER_MODEL)),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='verified_rent_payments', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at', '-id'],
                'indexes': [models.Index(fields=['invoice', 'status'], name='billing_payment_inv_status_idx')],
                'constraints': [models.CheckConstraint(condition=models.Q(('amount__gt', 0)), name='billing_payment_amount_gt_zero')],
            },
        ),
        migrations.RunPython(backfill_legacy_payments, remove_legacy_payments),
        migrations.AlterField(
            model_name='invoice',
            name='status',
            field=models.CharField(choices=[('Pending', 'Pending'), ('Pending Verification', 'Pending Verification'), ('Paid', 'Paid'), ('Partially Paid', 'Partially Paid'), ('Overdue', 'Overdue'), ('Cancelled', 'Cancelled')], default='Pending', max_length=30),
        ),
    ]
