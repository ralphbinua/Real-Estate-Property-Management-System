from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from contracts.models import Contract
from maintenance.models import MaintenanceRequest
from properties.models import Property, Unit
from .models import Invoice, Payment, PropertyExpense


User = get_user_model()


class ExpenseStatementTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='expense-owner', email='expense-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='expense-other-owner', email='expense-other-owner@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='expense-manager', email='expense-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='expense-tenant', email='expense-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(title='Statement home', address='1 Lane', property_type='Apartment', owner=cls.owner, manager=cls.manager)
        cls.other_property = Property.objects.create(title='Other home', address='2 Lane', property_type='Apartment', owner=cls.other_owner)
        unit = Unit.objects.create(property=cls.property, unit_number='1A', monthly_rate=1000, tenant=cls.tenant)
        lease = Contract.objects.create(property=cls.property, unit=unit, tenant=cls.tenant, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=Decimal('1000.00'))
        invoice = Invoice.objects.create(contract=lease, property=cls.property, tenant=cls.tenant, amount=Decimal('1000.00'), total_due=Decimal('1000.00'), due_date=date(2026, 10, 1))
        Payment.objects.create(invoice=invoice, amount=Decimal('700.00'), status='Verified', payment_date=date(2026, 10, 5))
        Payment.objects.create(invoice=invoice, amount=Decimal('100.00'), status='Reversed', payment_date=date(2026, 10, 5))
        Payment.objects.create(invoice=invoice, amount=Decimal('50.00'), status='Pending Verification', payment_date=date(2026, 10, 5))

    def test_approved_expense_reduces_statement_and_other_statuses_do_not(self):
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/expenses/', {'propertyId': self.property.pk, 'category': 'Repairs', 'amount': '125.00', 'incurredOn': '2026-10-06', 'payee': 'Plumber', 'reference': 'receipt-1'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        expense_id = response.data['id']
        self.assertEqual(self.client.post(f'/api/expenses/{expense_id}/decide/', {'approved': True}, format='json').status_code, 403)
        self.client.force_authenticate(self.owner)
        before = self.client.get(f'/api/expenses/statement/?propertyId={self.property.pk}&month=2026-10')
        self.assertEqual(before.data['netCash'], '700.00')
        approved = self.client.post(f'/api/expenses/{expense_id}/decide/', {'approved': True}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        after = self.client.get(f'/api/expenses/statement/?propertyId={self.property.pk}&month=2026-10')
        self.assertEqual(after.data['verifiedRentCollected'], '700')
        self.assertEqual(after.data['approvedExpenses'], '125')
        self.assertEqual(after.data['netCash'], '575')
        self.assertEqual(after.data['expenseItems'][0]['expenseId'], expense_id)
        self.assertEqual(self.client.patch(f'/api/expenses/{expense_id}/', {'amount': '200.00'}, format='json').status_code, 403)
        self.client.force_authenticate(self.manager)
        attempt = self.client.patch(f'/api/expenses/{expense_id}/', {'amount': '200.00'}, format='json')
        self.assertEqual(attempt.status_code, 400, attempt.data)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'/api/expenses/{expense_id}/reverse/', {}, format='json').status_code, 400)
        reversed_expense = self.client.post(f'/api/expenses/{expense_id}/reverse/', {'reason': 'Duplicate receipt'}, format='json')
        self.assertEqual(reversed_expense.status_code, 200, reversed_expense.data)
        corrected = self.client.get(f'/api/expenses/statement/?propertyId={self.property.pk}&month=2026-10')
        self.assertEqual(corrected.data['approvedExpenses'], '0.00')
        self.assertEqual(corrected.data['netCash'], '700.00')
        self.assertEqual(self.client.post(f'/api/expenses/{expense_id}/reverse/', {'reason': 'Second reversal'}, format='json').status_code, 400)
        self.assertEqual(self.client.get(f'/api/expenses/{expense_id}/').data['status'], 'Reversed')
        self.assertEqual(self.client.get(f'/api/expenses/{expense_id}/').data['decisionNote'], 'Duplicate receipt')

    def test_cross_property_and_tenant_access_denied(self):
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post('/api/expenses/', {'propertyId': self.other_property.pk, 'category': 'Repairs', 'amount': '10.00', 'incurredOn': '2026-10-06', 'payee': 'Vendor'}, format='json').status_code, 400)
        self.client.force_authenticate(self.other_owner)
        self.assertEqual(self.client.get(f'/api/expenses/statement/?propertyId={self.property.pk}&month=2026-10').status_code, 403)
        self.assertEqual(self.client.get('/api/expenses/').data, [])
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.get('/api/expenses/').status_code, 403)

    def test_maintenance_cost_is_recorded_separately_and_enters_statement_once(self):
        work = MaintenanceRequest.objects.create(
            property=self.property, tenant=self.tenant, issue_description='Replace leaking valve',
            status='Resolved', actual_cost=Decimal('250.00'),
        )
        self.client.force_authenticate(self.manager)
        created = self.client.post('/api/expenses/', {
            'propertyId': self.property.pk, 'category': 'Repairs', 'amount': '250.00',
            'incurredOn': '2026-10-06', 'payee': 'Plumber',
            'reference': f'Maintenance #{work.pk}', 'description': 'Replace leaking valve',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        self.client.force_authenticate(self.owner)
        approved = self.client.post(f'/api/expenses/{created.data["id"]}/decide/', {'approved': True}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)

        statement = self.client.get(f'/api/expenses/statement/?propertyId={self.property.pk}&month=2026-10')
        self.assertEqual(statement.data['approvedExpenses'], '250')
        self.assertEqual(statement.data['netCash'], '450')
        self.assertEqual(len(statement.data['expenseItems']), 1)
        self.assertEqual(statement.data['expenseItems'][0]['expenseId'], created.data['id'])
        self.assertEqual(PropertyExpense.objects.filter(property=self.property, reference=f'Maintenance #{work.pk}').count(), 1)
