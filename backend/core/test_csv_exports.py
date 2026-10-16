import csv
import io
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from billing.models import Invoice, Payment
from contracts.models import Contract
from maintenance.models import MaintenanceRequest
from properties.models import Property, Unit


User = get_user_model()


class ScopedCsvExportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='export-owner', email='export-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='export-other-owner', email='export-other-owner@example.test', role='Owner')
        cls.tenant = User.objects.create_user(username='export-tenant', email='export-tenant@example.test', role='Tenant')
        cls.other_tenant = User.objects.create_user(username='export-other-tenant', email='export-other-tenant@example.test', role='Tenant')
        for suffix, owner, tenant in [('A', cls.owner, cls.tenant), ('B', cls.other_owner, cls.other_tenant)]:
            prop = Property.objects.create(title=f'Export {suffix}', address=f'{suffix} Road', property_type='Apartment', owner=owner)
            unit = Unit.objects.create(property=prop, unit_number=suffix, monthly_rate=1000, tenant=tenant)
            lease = Contract.objects.create(property=prop, unit=unit, tenant=tenant, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=Decimal('1000.00'))
            invoice = Invoice.objects.create(contract=lease, property=prop, tenant=tenant, amount=Decimal('1000.00'), total_due=Decimal('1000.00'), due_date=date(2026, 10, 1))
            Payment.objects.create(invoice=invoice, amount=Decimal('100.00'), payment_method='Cash', status='Verified', reference_number='=unsafe' if suffix == 'A' else 'safe')
            MaintenanceRequest.objects.create(property=prop, unit=unit, tenant=tenant, issue_description='Fix sink', estimate_amount=Decimal('200.00'))

    def rows(self, path):
        response = self.client.get(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        return list(csv.reader(io.StringIO(b''.join(response.streaming_content).decode('utf-8-sig'))))

    def test_owner_exports_match_owned_property_and_existing_filters(self):
        self.client.force_authenticate(self.owner)
        for path in ('/api/invoices/export/', '/api/payments/export/', '/api/contracts/export/', '/api/maintenance/export/'):
            rows = self.rows(path)
            self.assertEqual(len(rows), 2, path)
            self.assertIn('Export A', rows[1], path)
            self.assertNotIn('Export B', rows[1], path)
        self.assertEqual(len(self.rows('/api/maintenance/export/?status=Resolved')), 1)
        self.assertEqual(len(self.rows('/api/contracts/export/?status=Active')), 1)
        payment_rows = self.rows('/api/payments/export/')
        self.assertIn("'=unsafe", payment_rows[1])

    def test_tenant_maintenance_export_hides_financial_columns(self):
        self.client.force_authenticate(self.tenant)
        rows = self.rows('/api/maintenance/export/')
        self.assertEqual(len(rows), 2)
        self.assertNotIn('Estimate', rows[0])
        self.assertNotIn('Actual cost', rows[0])
        self.assertNotIn('200.00', rows[1])

    def test_unauthenticated_export_is_denied(self):
        self.assertIn(self.client.get('/api/invoices/export/').status_code, (401, 403))
