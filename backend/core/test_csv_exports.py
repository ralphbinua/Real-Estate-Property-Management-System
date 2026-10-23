import csv
import io
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from billing.models import Invoice, Payment, PropertyExpense
from contracts.models import Contract
from maintenance.models import MaintenanceRequest
from properties.models import Property, Unit


User = get_user_model()


class ScopedCsvExportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='export-owner', email='export-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='export-other-owner', email='export-other-owner@example.test', role='Owner')
        cls.admin = User.objects.create_user(username='export-admin', email='export-admin@example.test', role='Admin')
        cls.manager = User.objects.create_user(username='export-manager', email='export-manager@example.test', role='Property Manager')
        cls.other_manager = User.objects.create_user(username='export-other-manager', email='export-other-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='export-tenant', email='export-tenant@example.test', role='Tenant')
        cls.other_tenant = User.objects.create_user(username='export-other-tenant', email='export-other-tenant@example.test', role='Tenant')
        cls.properties = {}
        for suffix, owner, manager, tenant in [('A', cls.owner, cls.manager, cls.tenant), ('B', cls.other_owner, cls.other_manager, cls.other_tenant)]:
            prop = Property.objects.create(title=f'Export {suffix}', address=f'{suffix} Road', property_type='Apartment', owner=owner, manager=manager)
            cls.properties[suffix] = prop
            unit = Unit.objects.create(property=prop, unit_number=suffix, monthly_rate=1000, tenant=tenant)
            lease = Contract.objects.create(property=prop, unit=unit, tenant=tenant, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=Decimal('1000.00'))
            invoice = Invoice.objects.create(contract=lease, property=prop, tenant=tenant, amount=Decimal('1000.00'), total_due=Decimal('1000.00'), due_date=date(2026, 10, 1))
            Payment.objects.create(invoice=invoice, amount=Decimal('100.00'), payment_method='Cash', status='Verified', reference_number='=unsafe' if suffix == 'A' else 'safe')
            MaintenanceRequest.objects.create(property=prop, unit=unit, tenant=tenant, issue_description='Fix sink', estimate_amount=Decimal('200.00'))

    def rows(self, path):
        response = self.response(path)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        return list(csv.reader(io.StringIO(b''.join(response.streaming_content).decode('utf-8-sig'))))

    def response(self, path):
        return self.client.get(path)

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

    def make_expense(self, *, prop=None, status='Pending', payee='Painter', reference='receipt-1', description='Wall repair', decision_note='', decided_by=None):
        return PropertyExpense.objects.create(
            property=prop or self.properties['A'], category='Repairs', amount=Decimal('125.00'),
            incurred_on=date(2026, 10, 6), payee=payee, reference=reference, description=description,
            status=status, created_by=self.manager, decided_by=decided_by, decision_note=decision_note,
        )

    def test_expense_exports_are_scoped_for_admin_manager_and_owner(self):
        visible = self.make_expense()
        other = self.make_expense(prop=self.properties['B'], payee='Other painter')
        self.client.force_authenticate(self.admin)
        admin_rows = self.rows('/api/expenses/export/')
        self.assertEqual(len(admin_rows), 3)
        self.assertEqual({row[0] for row in admin_rows[1:]}, {str(visible.pk), str(other.pk)})

        self.client.force_authenticate(self.manager)
        manager_rows = self.rows('/api/expenses/export/')
        self.assertEqual(len(manager_rows), 2)
        self.assertIn(str(visible.pk), manager_rows[1])
        self.assertNotIn(str(other.pk), manager_rows[1])
        self.assertEqual(len(self.rows(f'/api/expenses/export/?propertyId={self.properties["B"].pk}')), 1)

        self.client.force_authenticate(self.owner)
        owner_rows = self.rows('/api/expenses/export/')
        self.assertEqual(len(owner_rows), 2)
        self.assertIn(str(visible.pk), owner_rows[1])
        self.assertNotIn(str(other.pk), owner_rows[1])
        self.assertEqual(len(self.rows(f'/api/expenses/export/?propertyId={self.properties["B"].pk}')), 1)

    def test_expense_export_uses_status_and_property_filters_and_expected_columns(self):
        approved = self.make_expense(status='Approved', decided_by=self.owner, decision_note='Reviewed')
        self.make_expense(status='Rejected', decided_by=self.owner, decision_note='Not supported')
        self.client.force_authenticate(self.owner)
        rows = self.rows(f'/api/expenses/export/?propertyId={self.properties["A"].pk}&status=Approved')
        self.assertEqual(rows[0], ['ID', 'Property', 'Incurred date', 'Category', 'Amount', 'Payee', 'Reference', 'Description', 'Status', 'Decided by', 'Decided at', 'Decision note'])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1], [str(approved.pk), 'Export A', '2026-10-06', 'Repairs', '125.00', 'Painter', 'receipt-1', 'Wall repair', 'Approved', str(self.owner.pk), '', 'Reviewed'])
        self.assertEqual(len(self.rows(f'/api/expenses/export/?status=Rejected')), 2)

    def test_expense_export_neutralizes_formula_like_user_text(self):
        self.make_expense(payee='=2+2', reference='+SUM(A1:A2)', description='-1+2', status='Rejected', decided_by=self.owner, decision_note='@cmd')
        self.client.force_authenticate(self.owner)
        rows = self.rows('/api/expenses/export/')
        self.assertEqual(rows[1][5:8], ["'=2+2", "'+SUM(A1:A2)", "'-1+2"])
        self.assertEqual(rows[1][11], "'@cmd")

    def test_expense_export_caps_at_ten_thousand_rows_and_reports_truncation(self):
        PropertyExpense.objects.bulk_create([
            PropertyExpense(
                property=self.properties['A'], category='Repairs', amount=Decimal('1.00'),
                incurred_on=date(2026, 10, 6), payee='Vendor', created_by=self.manager,
            ) for _ in range(10001)
        ])
        self.client.force_authenticate(self.owner)
        response = self.response('/api/expenses/export/')
        self.assertEqual(response.status_code, 200)
        rows = list(csv.reader(io.StringIO(b''.join(response.streaming_content).decode('utf-8-sig'))))
        self.assertEqual(len(rows), 10001)
        self.assertEqual(response['X-Export-Limit'], '10000')
        self.assertEqual(response['X-Export-Truncated'], 'true')

        PropertyExpense.objects.filter(property=self.properties['A']).delete()
        self.make_expense()
        small = self.response('/api/expenses/export/')
        small_rows = list(csv.reader(io.StringIO(b''.join(small.streaming_content).decode('utf-8-sig'))))
        self.assertEqual(len(small_rows), 2)
        self.assertEqual(small['X-Export-Truncated'], 'false')
