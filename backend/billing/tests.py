from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from contracts.models import Contract
from properties.models import Property, Unit
from .models import Invoice, Payment


User = get_user_model()


class InvoiceFinancialValidationApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='finance-admin', email='finance-admin@example.test', role='Admin')
        cls.tenant = User.objects.create_user(username='finance-tenant', email='finance-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(title='Finance tests', address='1 Test Lane', property_type='Apartment')
        cls.unit = Unit.objects.create(property=cls.property, unit_number='101', monthly_rate=1000)
        cls.contract = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active',
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=365), rent_amount=1000,
        )
        cls.invoice = Invoice.objects.create(
            property=cls.property, contract=cls.contract, tenant=cls.tenant,
            amount=1000, late_fee=50, total_due=1050, due_date=timezone.localdate() + timedelta(days=10),
        )

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def payload(self, **changes):
        return {
            'property': self.property.pk, 'tenant': self.tenant.pk, 'contract': self.contract.pk,
            'amount': '1000.00', 'lateFee': '50.00',
            'dueDate': (timezone.localdate() + timedelta(days=10)).isoformat(), **changes,
        }

    def test_invoice_rejects_invalid_financial_inputs_on_create(self):
        for field, value in (('amount', '0.00'), ('amount', '-1.00'), ('lateFee', '-0.01'), ('totalDue', '-1.00')):
            with self.subTest(field=field, value=value):
                response = self.client.post('/api/invoices/', self.payload(**{field: value}), format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)

    def test_invoice_rejects_invalid_financial_inputs_on_update(self):
        for field, value in (('amount', '0.00'), ('amount', '-1.00'), ('lateFee', '-0.01')):
            with self.subTest(field=field, value=value):
                response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {field: value}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)

    def test_creation_derives_total_with_cent_precision(self):
        response = self.client.post('/api/invoices/', self.payload(amount='99.99', lateFee='0.01'), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['totalDue'], '100.00')
        self.assertEqual(response.data['balanceDue'], Decimal('100.00'))

    def test_explicit_total_must_equal_rent_plus_fee(self):
        response = self.client.post('/api/invoices/', self.payload(totalDue='1.00'), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('totalDue', response.data)

    def test_amount_edit_recalculates_total_response_and_storage(self):
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'amount': '1200.00'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totalDue'], '1250.00')
        self.assertEqual(response.data['balanceDue'], Decimal('1250.00'))
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.total_due, Decimal('1250.00'))

    def test_fee_edit_recalculates_total_using_existing_amount(self):
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'lateFee': '60.00'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totalDue'], '1060.00')

    def test_mismatched_total_edit_is_rejected(self):
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'totalDue': '1.00'}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('totalDue', response.data)

    def test_effective_status_echo_does_not_cache_previous_balance(self):
        Invoice.objects.filter(pk=self.invoice.pk).update(due_date=timezone.localdate() - timedelta(days=1))
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {
            'amount': '1200.00', 'status': 'Overdue',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'Overdue')
        self.assertEqual(response.data['balanceDue'], Decimal('1250.00'))

    def test_verified_and_reversed_payment_history_prevents_repricing(self):
        for payment_status in (Payment.Status.VERIFIED, Payment.Status.REVERSED):
            with self.subTest(payment_status=payment_status):
                payment = Payment.objects.create(invoice=self.invoice, amount=100, status=payment_status)
                response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'amount': '1200.00'}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.invoice.refresh_from_db()
                self.assertEqual(self.invoice.total_due, Decimal('1050.00'))
                payment.delete()

    def test_pending_payment_does_not_reduce_recomputed_balance(self):
        Payment.objects.create(invoice=self.invoice, amount=100, status=Payment.Status.PENDING_VERIFICATION)
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'amount': '1100.00'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['balanceDue'], Decimal('1150.00'))
        self.assertEqual(response.data['amountPaid'], Decimal('0.00'))
        self.assertEqual(response.data['pendingPaymentCount'], 1)

    def test_notes_edit_does_not_rewrite_legacy_financial_history(self):
        Invoice.objects.filter(pk=self.invoice.pk).update(total_due=999)
        Payment.objects.create(invoice=self.invoice, amount=100, status=Payment.Status.VERIFIED)
        response = self.client.patch(f'/api/invoices/{self.invoice.pk}/', {'remarks': 'Reviewed'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['totalDue'], '999.00')

    def test_combined_total_overflow_is_a_validation_error(self):
        self.client.raise_request_exception = False
        response = self.client.post('/api/invoices/', self.payload(amount='9999999999.99', lateFee='0.01'), format='json')
        self.assertEqual(response.status_code, 400, getattr(response, 'data', response.status_code))
        self.assertIn('totalDue', response.data)


class InvoiceEffectiveStatusApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='status-admin', email='status-admin@example.test', role='Admin')
        cls.owner = User.objects.create_user(username='status-owner', email='status-owner@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='status-manager', email='status-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='status-tenant', email='status-tenant@example.test', role='Tenant')
        cls.other_tenant = User.objects.create_user(username='other-status-tenant', email='other-status-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(
            title='Status filtering', address='1 Test Lane', property_type='Commercial', owner=cls.owner, manager=cls.manager,
        )
        cls.contract = Contract.objects.create(
            property=cls.property, tenant=cls.tenant, status='Active', rent_amount=1000,
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=365),
        )
        future = timezone.localdate() + timedelta(days=10)
        cls.rows = {}
        for name, stored_status, due_date, payment_status, paid, archived in (
            ('paid', 'Pending', future, Payment.Status.VERIFIED, 1200, False),
            ('partial', 'Pending', future, Payment.Status.VERIFIED, 250, False),
            ('overdue', 'Pending', timezone.localdate() - timedelta(days=1), Payment.Status.VERIFIED, 100, False),
            ('due_today', 'Overdue', timezone.localdate(), None, 0, False),
            ('pending', 'Paid', future, None, 0, False),
            ('review', 'Pending Verification', future, Payment.Status.PENDING_VERIFICATION, 1000, False),
            ('rejected', 'Pending', future, Payment.Status.REJECTED, 1000, False),
            ('reversed', 'Paid', future, Payment.Status.REVERSED, 1000, False),
            ('cancelled', 'Cancelled', future, Payment.Status.VERIFIED, 1000, False),
            ('archived_history', 'Pending', future, Payment.Status.VERIFIED, 1000, True),
            ('archived_empty', 'Paid', future, None, 0, True),
        ):
            invoice = Invoice.objects.create(
                property=cls.property, tenant=cls.tenant, contract=cls.contract,
                amount=1000, total_due=1000, due_date=due_date, status=stored_status, is_deleted=archived,
            )
            cls.rows[name] = invoice.pk
            if payment_status:
                Payment.objects.create(invoice=invoice, amount=paid, status=payment_status)
        other_property = Property.objects.create(title='Outside scope', address='2 Test Lane', property_type='Commercial')
        other_contract = Contract.objects.create(
            property=other_property, tenant=cls.other_tenant, rent_amount=1000, status='Active',
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=365),
        )
        cls.outside = Invoice.objects.create(
            property=other_property, tenant=cls.other_tenant, contract=other_contract,
            amount=1000, total_due=1000, due_date=future,
        )
        Payment.objects.create(invoice=cls.outside, amount=1000, status=Payment.Status.VERIFIED)

    def test_status_filters_match_visible_effective_statuses(self):
        for actor in (self.admin, self.owner, self.manager, self.tenant):
            for status, names in (
                ('Paid', ['paid', 'archived_history']),
                ('Partially Paid', ['partial']), ('Overdue', ['overdue']),
                ('Pending', ['due_today', 'pending', 'review', 'rejected', 'reversed']),
                ('Cancelled', ['cancelled']),
            ):
                with self.subTest(role=actor.role, status=status):
                    self.client.force_authenticate(actor)
                    response = self.client.get('/api/invoices/', {'status': status})
                    self.assertEqual(response.status_code, 200, response.data)
                    expected = {self.rows[name] for name in names}
                    if actor == self.admin and status == 'Paid':
                        expected.add(self.outside.pk)
                    self.assertEqual({row['_id'] for row in response.data}, expected)
                    self.assertTrue(all(row['status'] == status for row in response.data))

    def test_status_filter_applies_before_pagination(self):
        self.client.force_authenticate(self.tenant)
        response = self.client.get('/api/invoices/', {'status': 'Paid', 'page': 1, 'page_size': 1})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual(len(response.data['results']), 1)
        self.assertIsNotNone(response.data['next'])
        second = self.client.get('/api/invoices/', {'status': 'Paid', 'page': 2, 'page_size': 1})
        self.assertEqual(second.status_code, 200, second.data)
        self.assertEqual(
            {response.data['results'][0]['_id'], second.data['results'][0]['_id']},
            {self.rows['paid'], self.rows['archived_history']},
        )

    def test_tenant_endpoint_filters_without_exposing_requested_other_tenant(self):
        self.client.force_authenticate(self.tenant)
        response = self.client.get('/api/invoices/tenant/', {'tenantId': self.other_tenant.pk, 'status': 'paid'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({row['_id'] for row in response.data}, {self.rows['paid'], self.rows['archived_history']})

    def test_owner_pending_count_matches_actual_invoice_balances(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/owner/portfolio/', {'section': 'overview'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['summary']['pendingInvoices'], 7)


class PaymentAcknowledgmentApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        for role, name in (
            ('Admin', 'admin'), ('Owner', 'owner'), ('Property Manager', 'manager'),
            ('Tenant', 'tenant'), ('Owner', 'other_owner'),
            ('Property Manager', 'other_manager'), ('Tenant', 'other_tenant'),
            ('Agent', 'agent'),
        ):
            setattr(cls, name, User.objects.create(
                username=name, email=f'{name}@example.test', role=role,
            ))
        cls.property = Property.objects.create(
            title='Acknowledgment Apartment', address='12 Test Lane',
            owner=cls.owner, manager=cls.manager, property_type='Apartment',
        )
        cls.unit = Unit.objects.create(property=cls.property, unit_number='101', monthly_rate=32000)
        cls.contract = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant,
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=365),
            rent_amount=32000, status='Active',
        )
        cls.invoice = Invoice.objects.create(
            property=cls.property, contract=cls.contract, tenant=cls.tenant,
            amount=32000, total_due=32000, due_date=timezone.localdate(),
        )
        cls.payment = Payment.objects.create(
            invoice=cls.invoice, amount=12000, payment_date=timezone.localdate(),
            payment_method='Bank Transfer', reference_number='ACK-TEST-001',
            status=Payment.Status.VERIFIED, verified_by=cls.manager,
            verified_at=timezone.now(), created_by=cls.tenant,
        )

    def acknowledgment_url(self):
        return f'/api/payments/{self.payment.pk}/acknowledgment/'

    def test_verified_payment_download_contains_payment_and_current_invoice_balance(self):
        self.client.force_authenticate(self.tenant)
        response = self.client.get(self.acknowledgment_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertTrue(response.content.startswith(b'%PDF-'))
        self.assertIn('attachment;', response['Content-Disposition'])
        self.assertIn('no-store', response['Cache-Control'])
        for value in (b'ACK-TEST-001', b'PHP 12,000.00', b'PHP 20,000.00', b'Acknowledgment Apartment', b'tenant@example.test'):
            self.assertIn(value, response.content)
        self.assertEqual(Payment.objects.get(pk=self.payment.pk).status, Payment.Status.VERIFIED)

    def test_property_staff_and_owner_can_download_their_verified_payment(self):
        for actor in (self.admin, self.owner, self.manager):
            with self.subTest(role=actor.role):
                self.client.force_authenticate(actor)
                response = self.client.get(self.acknowledgment_url())
                self.assertEqual(response.status_code, 200)

    def test_outside_scope_users_cannot_download_payment_details(self):
        for actor in (self.other_owner, self.other_manager, self.other_tenant, self.agent):
            with self.subTest(actor=actor.username):
                self.client.force_authenticate(actor)
                response = self.client.get(self.acknowledgment_url())
                self.assertEqual(response.status_code, 404)

    def test_pending_rejected_and_reversed_payments_have_no_acknowledgment(self):
        self.client.force_authenticate(self.tenant)
        for payment_status in (Payment.Status.PENDING_VERIFICATION, Payment.Status.REJECTED, Payment.Status.REVERSED):
            with self.subTest(status=payment_status):
                Payment.objects.filter(pk=self.payment.pk).update(status=payment_status)
                response = self.client.get(self.acknowledgment_url())
                self.assertEqual(response.status_code, 400)

    def test_later_verified_payments_update_the_labeled_current_balance(self):
        Payment.objects.create(
            invoice=self.invoice, amount=Decimal('20000.00'),
            payment_date=timezone.localdate(), status=Payment.Status.VERIFIED,
        )
        self.client.force_authenticate(self.tenant)
        response = self.client.get(self.acknowledgment_url())
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'PHP 0.00', response.content)
        self.assertIn(b'PHP 12,000.00', response.content)
        self.assertIn(b'Balance as of', response.content)

    def test_anonymous_download_requires_authentication(self):
        response = self.client.get(self.acknowledgment_url())
        self.assertEqual(response.status_code, 401)
