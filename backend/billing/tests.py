from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from contracts.models import Contract
from properties.models import Property, Unit
from .models import Invoice, Payment


User = get_user_model()


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
