from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from contracts.models import Contract
from properties.models import Property, Unit

from .models import Invoice, Payment


User = get_user_model()


class PaymentWorkflowApiTests(APITestCase):
    """Exercise the payment lifecycle through real login and payment endpoints."""

    @classmethod
    def setUpTestData(cls):
        cls.password = 'payment-workflow-test-password'
        for name, role in (
            ('tenant', User.Role.TENANT), ('other_tenant', User.Role.TENANT),
            ('admin', User.Role.ADMIN), ('manager', User.Role.PROPERTY_MANAGER),
            ('other_manager', User.Role.PROPERTY_MANAGER),
        ):
            setattr(cls, name, User.objects.create_user(
                username=f'workflow-{name}', email=f'workflow-{name}@example.test',
                password=cls.password, role=role,
            ))
        cls.property = Property.objects.create(
            title='Workflow Apartment', address='42 Workflow Lane',
            property_type='Apartment', manager=cls.manager,
        )
        cls.unit = Unit.objects.create(property=cls.property, unit_number='202', monthly_rate=32000)
        cls.contract = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active',
            start_date=timezone.localdate(), end_date=timezone.localdate() + timedelta(days=365),
            rent_amount=32000,
        )
        cls.invoice = Invoice.objects.create(
            property=cls.property, contract=cls.contract, tenant=cls.tenant,
            amount=32000, total_due=32000, due_date=timezone.localdate() + timedelta(days=10),
        )

    def login(self, actor):
        self.client.credentials()
        response = self.client.post('/api/auth/login/', {
            'email': actor.email, 'password': self.password,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], actor.role)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['token']}")

    def submit_payment(self, amount='12000.00', reference='WORKFLOW-001'):
        response = self.client.post('/api/payments/', {
            'invoice': self.invoice.pk, 'amount': amount,
            'paymentDate': timezone.localdate().isoformat(),
            'paymentMethod': 'Bank Transfer', 'referenceNumber': reference,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], Payment.Status.PENDING_VERIFICATION)
        self.assertEqual(response.data['createdBy']['id'], self.tenant.pk)
        return response.data['id']

    def assert_invoice(self, paid, balance, status):
        response = self.client.get(f'/api/invoices/{self.invoice.pk}/')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Decimal(str(response.data['amountPaid'])), Decimal(paid))
        self.assertEqual(Decimal(str(response.data['balanceDue'])), Decimal(balance))
        self.assertEqual(response.data['status'], status)

    def assert_verified_workflow(self, verifier):
        self.login(self.tenant)
        payment_id = self.submit_payment()
        self.assert_invoice('0.00', '32000.00', 'Pending')
        acknowledgment_url = f'/api/payments/{payment_id}/acknowledgment/'
        self.assertEqual(self.client.get(acknowledgment_url).status_code, 400)

        self.login(verifier)
        response = self.client.post(f'/api/payments/{payment_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], Payment.Status.VERIFIED)
        self.assertEqual(response.data['verifiedBy']['id'], verifier.pk)
        payment = Payment.objects.get(pk=payment_id)
        self.assertEqual(payment.verified_by_id, verifier.pk)
        self.assertIsNotNone(payment.verified_at)

        self.login(self.tenant)
        self.assert_invoice('12000.00', '20000.00', 'Partially Paid')
        response = self.client.get(acknowledgment_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/pdf')
        self.assertIn(f'payment-acknowledgment-{payment_id}.pdf', response['Content-Disposition'])
        self.assertIn('no-store', response['Cache-Control'])
        self.assertTrue(response.content.startswith(b'%PDF-'))
        for value in (
            b'WORKFLOW-001', b'Workflow Apartment', b'42 Workflow Lane', b'(202)',
            b'workflow-tenant@example.test', verifier.email.encode(),
            b'Bank Transfer', b'Verified', b'PHP 12,000.00', b'PHP 32,000.00',
            b'PHP 20,000.00', b'Balance as of',
        ):
            self.assertIn(value, response.content)

        final_payment_id = self.submit_payment('20000.00', 'WORKFLOW-002')
        self.assert_invoice('12000.00', '20000.00', 'Partially Paid')
        self.login(verifier)
        response = self.client.post(f'/api/payments/{final_payment_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.login(self.tenant)
        self.assert_invoice('32000.00', '0.00', 'Paid')
        updated_pdf = self.client.get(acknowledgment_url)
        self.assertEqual(updated_pdf.status_code, 200)
        self.assertIn(b'PHP 12,000.00', updated_pdf.content)
        self.assertIn(b'PHP 0.00', updated_pdf.content)
        self.assertNotIn(b'PHP 20,000.00', updated_pdf.content)

    def test_tenant_submission_manager_verification_and_acknowledgment(self):
        self.assert_verified_workflow(self.manager)

    def test_tenant_submission_admin_verification_and_acknowledgment(self):
        self.assert_verified_workflow(self.admin)

    def test_another_tenant_cannot_read_or_submit_against_the_payment_invoice(self):
        self.login(self.tenant)
        payment_id = self.submit_payment()
        self.login(self.manager)
        response = self.client.post(f'/api/payments/{payment_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)

        self.login(self.other_tenant)
        for path in (
            f'/api/invoices/{self.invoice.pk}/', f'/api/payments/{payment_id}/',
            f'/api/payments/{payment_id}/acknowledgment/',
        ):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)
        response = self.client.get('/api/payments/', {'invoiceId': self.invoice.pk})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, [])
        response = self.client.post('/api/payments/', {
            'invoice': self.invoice.pk, 'amount': '100.00',
            'paymentDate': timezone.localdate().isoformat(),
            'paymentMethod': 'Bank Transfer', 'referenceNumber': 'UNAUTHORIZED',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Payment.objects.filter(invoice=self.invoice).count(), 1)

    def test_tenant_and_unassigned_manager_cannot_verify_payment(self):
        self.login(self.tenant)
        payment_id = self.submit_payment()
        response = self.client.post(f'/api/payments/{payment_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        self.login(self.other_manager)
        response = self.client.post(f'/api/payments/{payment_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        self.assertEqual(Payment.objects.get(pk=payment_id).status, Payment.Status.PENDING_VERIFICATION)

    def test_verification_rechecks_balance_after_another_pending_payment_is_verified(self):
        self.login(self.tenant)
        first_id = self.submit_payment('20000.00', 'PENDING-001')
        second_id = self.submit_payment('20000.00', 'PENDING-002')
        self.assert_invoice('0.00', '32000.00', 'Pending')
        self.login(self.manager)
        response = self.client.post(f'/api/payments/{first_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(f'/api/payments/{second_id}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Payment.objects.get(pk=second_id).status, Payment.Status.PENDING_VERIFICATION)
        self.assert_invoice('20000.00', '12000.00', 'Partially Paid')
