from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIRequestFactory

from billing.models import Invoice, Payment
from contracts.models import Contract
from maintenance.models import MaintenanceRequest
from notifications.models import Notification
from .models import Property, PropertyInquiry, RentalApplication, Unit, UnitPriceChangeRequest
from .serializers import PropertyInquirySerializer, RentalApplicationSerializer
from .view_modules.applications import RentalApplicationViewSet


User = get_user_model()


class RentChangeTargetLabelApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='label-owner', email='label-owner@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='label-manager', email='label-manager@example.test', role='Property Manager')
        cls.property = Property.objects.create(
            title='Labels', address='1 Test Lane', property_type='Apartment', owner=cls.owner, manager=cls.manager, price=1000,
        )
        cls.unit = Unit.objects.create(property=cls.property, unit_number='101', monthly_rate=1000)
        cls.requests = [
            UnitPriceChangeRequest.objects.create(
                property=cls.property, unit=unit, target_kind=kind, target_label=label,
                current_rate=1000, proposed_rate=1200, reason='Market review', proposed_by=cls.manager,
            ) for unit, kind, label in ((cls.unit, 'Unit', 'Unit 101'), (None, 'Property', 'Property base rate'))
        ]

    def test_unit_and_property_labels_are_visible_in_details(self):
        for actor in (self.owner, self.manager):
            for request_obj, label in zip(self.requests, ('Unit 101', 'Property base rate')):
                with self.subTest(role=actor.role, label=label):
                    self.client.force_authenticate(actor)
                    response = self.client.get(f'/api/properties/rent-change-requests/{request_obj.pk}/')
                    self.assertEqual(response.status_code, 200, response.data)
                    self.assertEqual(response.data.get('targetLabel'), label)

    def test_owner_pricing_section_preserves_target_labels(self):
        self.client.force_authenticate(self.owner)
        response = self.client.get('/api/owner/portfolio/', {'section': 'pricing'})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual({row.get('targetLabel') for row in response.data['rentChangeRequests']}, {'Unit 101', 'Property base rate'})


class OwnerContractIncomeApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='income-owner', email='income-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='other-income-owner', email='other-income-owner@example.test', role='Owner')
        cls.admin = User.objects.create_user(username='income-admin', email='income-admin@example.test', role='Admin')
        cls.tenant = User.objects.create_user(username='income-tenant', email='income-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(
            title='Signed rent property', address='1 Test Lane', property_type='Apartment', owner=cls.owner,
        )
        cls.unit = Unit.objects.create(
            property=cls.property, unit_number='101', monthly_rate=2000, status='Occupied', tenant=cls.tenant,
        )
        start, end = date(2026, 1, 1), date(2026, 12, 31)
        Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active',
            start_date=start, end_date=end, rent_amount=1200,
        )
        whole_property = Property.objects.create(
            title='Whole property', address='2 Test Lane', property_type='Commercial',
            owner=cls.owner, status='Occupied', price=700,
        )
        Contract.objects.create(
            property=whole_property, tenant=cls.tenant, status='Active', start_date=start, end_date=end, rent_amount=300,
        )
        Unit.objects.create(property=cls.property, unit_number='Legacy occupied', monthly_rate=600, status='Occupied')
        pending_unit = Unit.objects.create(property=cls.property, unit_number='Pending', monthly_rate=5000, status='Reserved')
        Contract.objects.create(
            property=cls.property, unit=pending_unit, tenant=cls.tenant, status='Pending',
            start_date=start, end_date=end, rent_amount=5000,
        )
        Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active', is_deleted=True,
            start_date=start, end_date=end, rent_amount=5000,
        )
        archived_property = Property.objects.create(
            title='Archived property', address='3 Test Lane', property_type='Commercial', owner=cls.owner, is_deleted=True,
        )
        Contract.objects.create(
            property=archived_property, tenant=cls.tenant, status='Active', start_date=start, end_date=end, rent_amount=4000,
        )
        other_property = Property.objects.create(
            title='Other Owner', address='4 Test Lane', property_type='Commercial', owner=cls.other_owner, status='Occupied', price=9999,
        )
        Contract.objects.create(
            property=other_property, tenant=cls.tenant, status='Active', start_date=start, end_date=end, rent_amount=9000,
        )

    def overview(self, actor):
        self.client.force_authenticate(actor)
        response = self.client.get('/api/owner/portfolio/', {'section': 'overview'})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['summary']

    def test_owner_income_uses_active_signed_leases(self):
        summary = self.overview(self.owner)
        self.assertEqual(summary['totalMonthlyIncome'], Decimal('1500.00'))
        self.assertEqual(summary['activeLeasesCount'], 2)

    def test_listing_rate_change_does_not_change_contractual_income(self):
        before = self.overview(self.owner)['totalMonthlyIncome']
        Unit.objects.filter(pk=self.unit.pk).update(monthly_rate=3333)
        after = self.overview(self.owner)['totalMonthlyIncome']
        self.assertEqual(before, Decimal('1500.00'))
        self.assertEqual(after, Decimal('1500.00'))

    def test_occupied_inventory_without_active_leases_has_zero_income(self):
        Contract.objects.filter(property__owner=self.owner, status='Active').update(status='Terminated')
        self.assertEqual(self.overview(self.owner)['totalMonthlyIncome'], Decimal('0.00'))

    def test_admin_income_uses_all_visible_signed_leases(self):
        summary = self.overview(self.admin)
        self.assertEqual(summary['totalMonthlyIncome'], Decimal('10500.00'))
        self.assertEqual(summary['activeLeasesCount'], 3)


class InquiryApplicationIntegrityApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(
            username='integrity-owner', email='integrity-owner@example.test', role=User.Role.OWNER,
        )
        cls.manager = User.objects.create_user(
            username='integrity-manager', email='integrity-manager@example.test', role=User.Role.PROPERTY_MANAGER,
        )
        cls.agent = User.objects.create_user(
            username='integrity-agent', email='integrity-agent@example.test', role=User.Role.AGENT,
        )
        cls.tenant = User.objects.create_user(
            username='integrity-tenant', email='integrity-tenant@example.test', role=User.Role.TENANT,
        )
        cls.property = Property.objects.create(
            title='Owner approval property', address='1 Test Lane', property_type='Apartment',
            owner=cls.owner, manager=cls.manager, application_approval_mode='Owner',
        )
        cls.target_property = Property.objects.create(
            title='Delegated property', address='2 Test Lane', property_type='Apartment',
            owner=cls.owner, manager=cls.manager, application_approval_mode='Manager',
        )
        for property_obj in (cls.property, cls.target_property):
            property_obj.assigned_agents.add(cls.agent)
        cls.target_unit = Unit.objects.create(
            property=cls.target_property, unit_number='Destination', monthly_rate=Decimal('1500.00'),
        )

    def application_target(self, status):
        number = PropertyInquiry.objects.count() + 1
        unit = Unit.objects.create(
            property=self.property, unit_number=f'Source-{number}', monthly_rate=Decimal('1200.00'),
            status={'Approved': 'Reserved', 'Converted': 'Occupied'}.get(status, 'Available'),
            tenant=self.tenant if status == 'Converted' else None,
        )
        inquiry = PropertyInquiry.objects.create(
            property=self.property, unit=unit, agent=self.agent, prospect_name='Applicant',
            prospect_email=self.tenant.email,
            status='Converted' if status == 'Converted' else 'Application In Progress',
        )
        application = RentalApplication.objects.create(
            inquiry=inquiry, applicant_email=self.tenant.email, status=status,
            approval_mode='Owner', created_by=self.agent,
        )
        if status == 'Converted':
            Contract.objects.create(
                property=self.property, unit=unit, tenant=self.tenant, source_application=application,
                start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
                rent_amount=Decimal('1200.00'), status='Active',
            )
        return inquiry, application, unit

    def test_linked_application_blocks_unit_reassignment(self):
        for actor in (self.agent, self.manager):
            for status in ('Submitted', 'Approved', 'Converted'):
                with self.subTest(role=actor.role, status=status):
                    inquiry, application, unit = self.application_target(status)
                    original_status = unit.status
                    other_unit = Unit.objects.create(
                        property=self.property, unit_number=f'Other-{inquiry.pk}', monthly_rate=Decimal('1200.00'),
                    )
                    self.client.force_authenticate(actor)
                    response = self.client.patch(f'/api/properties/inquiries/{inquiry.pk}/', {
                        'unit': other_unit.pk,
                    }, format='json')

                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn('unit', response.data)
                    inquiry.refresh_from_db()
                    application.refresh_from_db()
                    unit.refresh_from_db()
                    self.assertEqual(inquiry.unit_id, unit.pk)
                    self.assertEqual(application.approval_mode, 'Owner')
                    self.assertEqual(unit.status, original_status)

    def test_linked_application_blocks_property_reassignment(self):
        for actor in (self.agent, self.manager):
            for status in ('Submitted', 'Approved', 'Converted'):
                with self.subTest(role=actor.role, status=status):
                    inquiry, application, unit = self.application_target(status)
                    original_status = unit.status
                    self.client.force_authenticate(actor)
                    response = self.client.patch(f'/api/properties/inquiries/{inquiry.pk}/', {
                        'property': self.target_property.pk, 'unit': self.target_unit.pk,
                    }, format='json')

                    self.assertEqual(response.status_code, 400, response.data)
                    self.assertIn('property', response.data)
                    inquiry.refresh_from_db()
                    application.refresh_from_db()
                    unit.refresh_from_db()
                    self.assertEqual(inquiry.property_id, self.property.pk)
                    self.assertEqual(inquiry.unit_id, unit.pk)
                    self.assertEqual(application.approval_mode, 'Owner')
                    self.assertEqual(unit.status, original_status)

    def test_unchanged_target_and_unrelated_edit_remain_allowed(self):
        for actor in (self.agent, self.manager):
            for status in ('Submitted', 'Approved', 'Converted'):
                with self.subTest(role=actor.role, status=status):
                    inquiry, application, unit = self.application_target(status)
                    self.client.force_authenticate(actor)
                    response = self.client.patch(f'/api/properties/inquiries/{inquiry.pk}/', {
                        'property': self.property.pk, 'unit': unit.pk, 'notes': 'Updated viewing notes',
                    }, format='json')

                    self.assertEqual(response.status_code, 200, response.data)
                    inquiry.refresh_from_db()
                    self.assertEqual(inquiry.notes, 'Updated viewing notes')
                    self.assertEqual(inquiry.unit_id, unit.pk)

    def test_unitless_application_target_allows_notes_and_unchanged_echo(self):
        for actor in (self.agent, self.manager):
            for status, property_status in (('Approved', 'Pending'), ('Converted', 'Occupied')):
                with self.subTest(role=actor.role, status=status):
                    property_obj = Property.objects.create(
                        title='Whole property', address='3 Test Lane', property_type='Commercial',
                        owner=self.owner, manager=self.manager, status=property_status,
                    )
                    property_obj.assigned_agents.add(self.agent)
                    inquiry = PropertyInquiry.objects.create(
                        property=property_obj, agent=self.agent, prospect_name='Whole property applicant',
                        prospect_email=self.tenant.email,
                    )
                    RentalApplication.objects.create(
                        inquiry=inquiry, applicant_email=self.tenant.email, status=status, approval_mode='Owner',
                    )
                    if status == 'Converted':
                        Contract.objects.create(
                            property=property_obj, tenant=self.tenant, status='Active',
                            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
                            rent_amount=Decimal('1200.00'),
                        )
                    self.client.force_authenticate(actor)
                    url = f'/api/properties/inquiries/{inquiry.pk}/'
                    for payload in (
                        {'notes': 'Updated whole-property notes'},
                        {'property': property_obj.pk, 'unit': None, 'notes': 'Echoed whole-property target'},
                    ):
                        response = self.client.patch(url, payload, format='json')
                        self.assertEqual(response.status_code, 200, response.data)
                    property_obj.refresh_from_db()
                    inquiry.refresh_from_db()
                    self.assertEqual(property_obj.status, property_status)
                    self.assertEqual(inquiry.property_id, property_obj.pk)
                    self.assertIsNone(inquiry.unit_id)

    def test_inquiry_without_application_can_change_available_target(self):
        unit = Unit.objects.create(
            property=self.property, unit_number='No application', monthly_rate=Decimal('1200.00'),
        )
        for actor in (self.agent, self.manager):
            with self.subTest(role=actor.role):
                inquiry = PropertyInquiry.objects.create(
                    property=self.property, unit=unit, agent=self.agent, prospect_name='New prospect',
                    prospect_email='prospect@example.test',
                )
                self.client.force_authenticate(actor)
                response = self.client.patch(f'/api/properties/inquiries/{inquiry.pk}/', {
                    'property': self.target_property.pk, 'unit': self.target_unit.pk,
                }, format='json')

                self.assertEqual(response.status_code, 200, response.data)
                inquiry.refresh_from_db()
                self.assertEqual(inquiry.property_id, self.target_property.pk)
                self.assertEqual(inquiry.unit_id, self.target_unit.pk)

    def test_application_submitted_after_validation_blocks_reassignment(self):
        unit = Unit.objects.create(
            property=self.property, unit_number='Late submission', monthly_rate=Decimal('1200.00'),
        )
        inquiry = PropertyInquiry.objects.create(
            property=self.property, unit=unit, agent=self.agent, prospect_name='Prospect',
            prospect_email=self.tenant.email,
        )
        request = APIRequestFactory().patch('/api/properties/inquiries/')
        request.user = self.manager
        serializer = PropertyInquirySerializer(
            inquiry, data={'property': self.target_property.pk, 'unit': self.target_unit.pk},
            partial=True, context={'request': request},
        )
        serializer.is_valid(raise_exception=True)
        RentalApplication.objects.create(
            inquiry=inquiry, applicant_email=self.tenant.email, approval_mode='Owner', status='Submitted',
        )

        with self.assertRaises(ValidationError) as raised:
            serializer.save()

        self.assertIn('property', raised.exception.detail)
        inquiry.refresh_from_db()
        self.assertEqual(inquiry.property_id, self.property.pk)
        self.assertEqual(inquiry.unit_id, unit.pk)

    def test_application_submission_uses_target_current_at_save(self):
        unit = Unit.objects.create(
            property=self.property, unit_number='Before move', monthly_rate=Decimal('1200.00'),
        )
        inquiry = PropertyInquiry.objects.create(
            property=self.property, unit=unit, agent=self.agent, prospect_name='Prospect',
            prospect_email=self.tenant.email,
        )
        request = APIRequestFactory().post('/api/properties/applications/')
        request.user = self.manager
        serializer = RentalApplicationSerializer(data={
            'inquiry': inquiry.pk, 'applicantEmail': self.tenant.email,
            'employment': 'Tester', 'monthlyIncome': '4000.00', 'moveInDate': '2026-01-01',
        }, context={'request': request})
        serializer.is_valid(raise_exception=True)
        # Another valid inquiry edit wins before the application save begins.
        inquiry.property = self.target_property
        inquiry.unit = self.target_unit
        inquiry.save(update_fields=['property', 'unit'])
        view = RentalApplicationViewSet()
        view.request = request
        view.perform_create(serializer)

        application = RentalApplication.objects.get(pk=serializer.instance.pk)
        self.assertEqual(application.inquiry.property_id, self.target_property.pk)
        self.assertEqual(application.approval_mode, 'Manager')


class RentalLifecycleApiTests(APITestCase):
    def setUp(self):
        self.admin = self.create_user('admin', User.Role.ADMIN)
        self.owner = self.create_user('owner', User.Role.OWNER)
        self.manager = self.create_user('manager', User.Role.PROPERTY_MANAGER)
        self.agent = self.create_user('agent', User.Role.AGENT)
        self.tenant = self.create_user('tenant', User.Role.TENANT, email='applicant@example.test')

        self.property = Property.objects.create(
            title='Lifecycle Test Apartment',
            address='1 Test Lane',
            property_type='Apartment',
            owner=self.owner,
            manager=self.manager,
            application_approval_mode='Owner',
        )
        self.unit = Unit.objects.create(
            property=self.property,
            unit_number='101',
            monthly_rate=Decimal('32000.00'),
        )
        self.property.assigned_agents.add(self.agent)

    def create_user(self, username, role, email=None):
        return User.objects.create_user(
            username=username,
            email=email or f'{username}@example.test',
            password='test-only-password',
            role=role,
        )

    def act_as(self, user):
        self.client.force_authenticate(user=user)

    def test_rental_lifecycle_through_payment_and_lease_termination(self):
        # Agent schedules a viewing and opens an application for the prospect.
        self.act_as(self.agent)
        inquiry_response = self.client.post('/api/properties/inquiries/', {
            'property': self.property.pk,
            'unit': self.unit.pk,
            'prospect_name': 'Test Applicant',
            'prospect_email': self.tenant.email,
            'viewing_at': (timezone.now() + timedelta(days=2)).isoformat(),
            'notes': 'Integration test viewing',
        }, format='json')
        self.assertEqual(inquiry_response.status_code, 201, inquiry_response.data)
        inquiry = PropertyInquiry.objects.get(pk=inquiry_response.data['id'])
        self.assertEqual(inquiry.status, 'Viewing Scheduled')

        application_response = self.client.post('/api/properties/applications/', {
            'inquiry': inquiry.pk,
            'applicantEmail': self.tenant.email,
            'employment': 'Test occupation',
            'monthlyIncome': '85000.00',
            'moveInDate': date.today().isoformat(),
            'notes': 'Integration test application',
        }, format='json')
        self.assertEqual(application_response.status_code, 201, application_response.data)
        application = RentalApplication.objects.get(pk=application_response.data['id'])
        inquiry.refresh_from_db()
        self.assertEqual(application.status, 'Submitted')
        self.assertEqual(inquiry.status, 'Application In Progress')

        # Manager reviews the application but cannot make the Owner's decision.
        self.act_as(self.manager)
        application_url = f'/api/properties/applications/{application.pk}/'
        response = self.client.patch(application_url, {
            'status': 'Under Review', 'reviewNotes': 'Application details checked.',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.patch(application_url, {
            'status': 'Approved',
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(application.status, 'Submitted')

        response = self.client.patch(application_url, {
            'status': 'Pending Owner Approval',
            'reviewNotes': 'Ready for the Owner to decide.',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        application.refresh_from_db()
        self.assertEqual(application.status, 'Pending Owner Approval')

        # Owner approves; the unit is held while the Manager prepares the lease.
        self.act_as(self.owner)
        response = self.client.patch(application_url, {
            'status': 'Approved',
            'ownerReviewNotes': 'Approved for lease preparation.',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Reserved')

        self.act_as(self.manager)
        start_date = date(timezone.localdate().year, timezone.localdate().month, 1)
        end_date = start_date + timedelta(days=365)
        response = self.client.post(
            f'/api/properties/applications/{application.pk}/create-lease/',
            {
                'tenant': self.tenant.pk,
                'startDate': start_date.isoformat(),
                'endDate': end_date.isoformat(),
                'rentDueDay': 1,
                'depositAmount': '32000.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201, response.data)
        contract = Contract.objects.get(pk=response.data['contract']['_id'])
        self.assertEqual(contract.status, 'Pending')
        self.assertEqual(contract.rent_amount, Decimal('32000.00'))

        activation_url = f'/api/contracts/{contract.pk}/activate/'
        activation_data = {
            'signaturesComplete': True,
            'signedCopyReference': 'test-only/signed-lease.pdf',
        }
        response = self.client.post(activation_url, activation_data, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        contract.refresh_from_db()
        self.assertEqual(contract.status, 'Pending')

        self.act_as(self.owner)
        response = self.client.post(activation_url, activation_data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        contract.refresh_from_db()
        application.refresh_from_db()
        inquiry.refresh_from_db()
        self.unit.refresh_from_db()
        self.assertEqual(contract.status, 'Active')
        self.assertEqual(application.status, 'Converted')
        self.assertEqual(inquiry.status, 'Converted')
        self.assertEqual(self.unit.status, 'Occupied')
        self.assertEqual(self.unit.tenant_id, self.tenant.pk)

        # Manager generates rent; Tenant submits it; Manager verifies it.
        self.act_as(self.manager)
        response = self.client.post('/api/invoices/run-monthly-billing/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['generatedCount'], 1)
        invoice = Invoice.objects.get(contract=contract)
        self.assertEqual(invoice.total_due, Decimal('32000.00'))

        self.act_as(self.tenant)
        response = self.client.post('/api/payments/', {
            'invoice': invoice.pk,
            'amount': '32000.00',
            'paymentDate': timezone.localdate().isoformat(),
            'paymentMethod': 'Bank Transfer',
            'referenceNumber': 'TEST-TXN-001',
            'remarks': 'Integration test payment',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        payment = Payment.objects.get(pk=response.data['id'])
        self.assertEqual(payment.status, Payment.Status.PENDING_VERIFICATION)

        self.act_as(self.owner)
        response = self.client.post(f'/api/payments/{payment.pk}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 403, response.data)

        self.act_as(self.manager)
        response = self.client.post(f'/api/payments/{payment.pk}/verify/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.VERIFIED)
        self.assertEqual(payment.verified_by_id, self.manager.pk)

        termination_url = f'/api/contracts/{contract.pk}/terminate/'
        termination_data = {
            'reason': 'Integration test completed.',
            'effectiveDate': timezone.localdate().isoformat(),
        }
        response = self.client.post(termination_url, termination_data, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        contract.refresh_from_db()
        self.assertEqual(contract.status, 'Active')

        self.act_as(self.owner)
        response = self.client.post(termination_url, termination_data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        contract.refresh_from_db()
        self.unit.refresh_from_db()
        self.assertEqual(contract.status, 'Terminated')
        self.assertEqual(self.unit.status, 'Available')
        self.assertIsNone(self.unit.tenant_id)
        self.assertTrue(Payment.objects.filter(pk=payment.pk).exists())


    def test_new_applicant_account_through_delegated_activation_and_rent_collection(self):
        # No Tenant account exists when the prospect submits an application.
        applicant_email = 'new-applicant@example.test'
        self.act_as(self.agent)
        response = self.client.post('/api/properties/inquiries/', {
            'property': self.property.pk,
            'unit': self.unit.pk,
            'prospect_name': 'New Applicant',
            'prospect_email': applicant_email,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        inquiry_id = response.data['id']
        response = self.client.post('/api/properties/applications/', {
            'inquiry': inquiry_id,
            'applicantEmail': applicant_email,
            'employment': 'Test occupation',
            'monthlyIncome': '85000.00',
            'moveInDate': timezone.localdate().isoformat(),
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        application_id = response.data['id']
        application_url = f'/api/properties/applications/{application_id}/'

        self.act_as(self.manager)
        response = self.client.patch(application_url, {'status': 'Under Review'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.patch(application_url, {
            'status': 'Pending Owner Approval',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.act_as(self.owner)
        response = self.client.patch(application_url, {'status': 'Approved'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Reserved')

        # Account creation belongs to Admin, and the email must match the applicant.
        account_data = {
            'email': applicant_email,
            'name': 'New Applicant',
            'password': 'test-only-password',
            'role': 'Tenant',
        }
        self.act_as(self.manager)
        response = self.client.post('/api/users/', account_data, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        self.assertFalse(User.objects.filter(email=applicant_email).exists())
        self.act_as(self.admin)
        response = self.client.post('/api/users/', account_data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        tenant = User.objects.get(email=applicant_email)
        self.assertEqual(tenant.role, User.Role.TENANT)
        response = self.client.post('/api/auth/login/', {
            'email': applicant_email, 'password': 'test-only-password',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['_id'], tenant.pk)
        self.assertEqual(response.data['role'], 'Tenant')

        self.act_as(self.manager)
        start_date = timezone.localdate().replace(day=1)
        lease_data = {
            'tenant': self.tenant.pk,
            'startDate': start_date.isoformat(),
            'endDate': (start_date + timedelta(days=365)).isoformat(),
            'rentDueDay': 1,
        }
        lease_url = application_url + 'create-lease/'
        response = self.client.post(lease_url, lease_data, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Contract.objects.exists())
        lease_data['tenant'] = tenant.pk
        response = self.client.post(lease_url, lease_data, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        contract_id = response.data['contract']['_id']
        activation_url = f'/api/contracts/{contract_id}/activate/'
        activation_data = {
            'signaturesComplete': True,
            'signedCopyReference': 'test-only/signed-lease.pdf',
        }
        response = self.client.post(activation_url, activation_data, format='json')
        self.assertEqual(response.status_code, 400, response.data)

        self.act_as(self.owner)
        response = self.client.patch(
            f'/api/properties/{self.property.pk}/lease-signing-authority/',
            {
                'authorized': True,
                'confirmWrittenAuthority': True,
                'agreementReference': 'test-only/management-agreement.pdf',
            }, format='json',
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.act_as(self.manager)
        response = self.client.post(activation_url, {
            **activation_data, 'signaturesComplete': False,
        }, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        response = self.client.post(activation_url, activation_data, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        contract = Contract.objects.get(pk=contract_id)
        self.assertEqual(contract.status, 'Active')
        self.assertEqual(contract.activation_basis, 'Manager Delegation')
        self.assertEqual(contract.activated_by_id, self.manager.pk)
        self.assertEqual(RentalApplication.objects.get(pk=application_id).status, 'Converted')
        self.assertEqual(PropertyInquiry.objects.get(pk=inquiry_id).status, 'Converted')
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.tenant_id, tenant.pk)
        self.assertEqual(self.unit.status, 'Occupied')
        response = self.client.post(activation_url, activation_data, format='json')
        self.assertEqual(response.status_code, 400, response.data)

        # Billing is repeatable; pending submissions do not count as collected rent.
        for expected_count in (1, 0):
            response = self.client.post('/api/invoices/run-monthly-billing/', {}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['generatedCount'], expected_count)
        invoice = Invoice.objects.get(contract=contract)
        invoice_url = f'/api/invoices/{invoice.pk}/'
        for amount, paid, balance in (('12000.00', '12000.00', '20000.00'), ('20000.00', '32000.00', '0.00')):
            self.act_as(tenant)
            response = self.client.post('/api/payments/', {
                'invoice': invoice.pk,
                'amount': amount,
                'paymentDate': timezone.localdate().isoformat(),
                'paymentMethod': 'Bank Transfer',
                'referenceNumber': f'TEST-PARTIAL-{amount}',
            }, format='json')
            self.assertEqual(response.status_code, 201, response.data)
            payment_id = response.data['id']
            response = self.client.get(invoice_url)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(Decimal(str(response.data['balanceDue'])), Decimal('32000.00') if amount == '12000.00' else Decimal('20000.00'))
            self.assertEqual(response.data['pendingPaymentCount'], 1)
            verify_url = f'/api/payments/{payment_id}/verify/'
            response = self.client.post(verify_url, {}, format='json')
            self.assertEqual(response.status_code, 403, response.data)
            self.act_as(self.manager)
            response = self.client.post(verify_url, {}, format='json')
            self.assertEqual(response.status_code, 200, response.data)
            response = self.client.post(verify_url, {}, format='json')
            self.assertEqual(response.status_code, 400, response.data)
            response = self.client.get(invoice_url)
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(Decimal(str(response.data['amountPaid'])), Decimal(paid))
            self.assertEqual(Decimal(str(response.data['balanceDue'])), Decimal(balance))
            self.assertEqual(response.data['pendingPaymentCount'], 0)
        self.assertEqual(response.data['status'], 'Paid')
        self.assertEqual(Payment.objects.filter(invoice=invoice).count(), 2)

        self.act_as(tenant)
        response = self.client.post('/api/maintenance/', {
            'property': self.property.pk,
            'unit': self.unit.pk,
            'issueDescription': 'Test-only leaking tap',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        maintenance_id = response.data['_id']
        self.act_as(self.manager)
        response = self.client.patch(f'/api/maintenance/{maintenance_id}/', {
            'status': 'Resolved',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(MaintenanceRequest.objects.get(pk=maintenance_id).status, 'Resolved')
        for event_type, destination in (
            ('lease', 'tenant.lease'),
            ('payment', 'tenant.payments'),
            ('maintenance', 'tenant.maintenance'),
        ):
            self.assertTrue(Notification.objects.filter(
                recipient=tenant, event_type=event_type, destination=destination,
            ).exists(), destination)


class RoleDataIsolationApiTests(APITestCase):
    def setUp(self):
        self.admin = self.create_user('scope_admin', User.Role.ADMIN)
        self.owner_a = self.create_user('scope_owner_a', User.Role.OWNER)
        self.owner_b = self.create_user('scope_owner_b', User.Role.OWNER)
        self.manager_a = self.create_user('scope_manager_a', User.Role.PROPERTY_MANAGER)
        self.manager_b = self.create_user('scope_manager_b', User.Role.PROPERTY_MANAGER)
        self.agent_a = self.create_user('scope_agent_a', User.Role.AGENT)
        self.agent_b = self.create_user('scope_agent_b', User.Role.AGENT)
        self.tenant_a = self.create_user('scope_tenant_a', User.Role.TENANT)
        self.tenant_b = self.create_user('scope_tenant_b', User.Role.TENANT)
        self.world_a = self.create_property_records(
            'A', self.owner_a, self.manager_a, self.agent_a, self.tenant_a,
        )
        self.world_b = self.create_property_records(
            'B', self.owner_b, self.manager_b, self.agent_b, self.tenant_b,
        )

    def create_user(self, username, role):
        return User.objects.create_user(
            username=username,
            email=f'{username}@example.test',
            password='test-only-password',
            role=role,
        )

    def create_property_records(self, suffix, owner, manager, agent, tenant):
        property_obj = Property.objects.create(
            title=f'Property {suffix}',
            address=f'{suffix} Test Lane',
            property_type='Apartment',
            owner=owner,
            manager=manager,
        )
        property_obj.assigned_agents.add(agent)
        unit = Unit.objects.create(
            property=property_obj,
            unit_number=f'{suffix}-101',
            monthly_rate=Decimal('25000.00'),
            status='Occupied',
            tenant=tenant,
        )
        contract = Contract.objects.create(
            property=property_obj,
            unit=unit,
            tenant=tenant,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=365),
            rent_amount=Decimal('25000.00'),
            status='Active',
        )
        invoice = Invoice.objects.create(
            contract=contract,
            tenant=tenant,
            property=property_obj,
            amount=Decimal('25000.00'),
            total_due=Decimal('25000.00'),
            due_date=date.today(),
        )
        payment = Payment.objects.create(
            invoice=invoice,
            amount=Decimal('25000.00'),
            payment_method='Bank Transfer',
            payment_date=date.today(),
            reference_number=f'TXN-{suffix}',
            created_by=tenant,
        )
        maintenance = MaintenanceRequest.objects.create(
            property=property_obj,
            unit=unit,
            tenant=tenant,
            issue_description=f'Maintenance issue {suffix}',
        )
        inquiry = PropertyInquiry.objects.create(
            property=property_obj,
            unit=unit,
            agent=agent,
            prospect_name=f'Prospect {suffix}',
            prospect_email=tenant.email,
            viewing_at=timezone.now() + timedelta(days=2),
        )
        application = RentalApplication.objects.create(
            inquiry=inquiry,
            applicant_email=tenant.email,
            employment='Test occupation',
            monthly_income=Decimal('70000.00'),
            move_in_date=date.today(),
            created_by=agent,
        )
        return {
            'property': property_obj,
            'unit': unit,
            'contract': contract,
            'invoice': invoice,
            'payment': payment,
            'maintenance': maintenance,
            'inquiry': inquiry,
            'application': application,
        }

    def assert_scoped_list(self, endpoint, user, expected_ids, id_field='_id'):
        self.client.force_authenticate(user=user)
        response = self.client.get(endpoint)
        self.assertEqual(response.status_code, 200, response.data)
        records = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual({record[id_field] for record in records}, set(expected_ids), endpoint)

    def test_role_lists_only_include_records_in_their_authorized_scope(self):
        scoped_users = [
            (self.admin, None),
            (self.owner_a, self.world_a),
            (self.owner_b, self.world_b),
            (self.manager_a, self.world_a),
            (self.manager_b, self.world_b),
            (self.agent_a, self.world_a),
            (self.agent_b, self.world_b),
            (self.tenant_a, self.world_a),
            (self.tenant_b, self.world_b),
        ]
        for endpoint, field, world_key in (
            ('/api/properties/', '_id', 'property'),
            ('/api/properties/units/', '_id', 'unit'),
        ):
            for user, world in scoped_users:
                expected = (
                    [self.world_a[world_key].pk, self.world_b[world_key].pk]
                    if world is None else [world[world_key].pk]
                )
                self.assert_scoped_list(endpoint, user, expected, field)

        financial_and_lease_matrix = [
            ('/api/contracts/', 'contract', 'Admin', 200),
            ('/api/invoices/', 'invoice', 'Admin', 200),
            ('/api/payments/', 'payment', 'Admin', 200),
            ('/api/maintenance/', 'maintenance', 'Admin', 200),
        ]
        financial_users = [
            (self.admin, None),
            (self.owner_a, self.world_a),
            (self.owner_b, self.world_b),
            (self.manager_a, self.world_a),
            (self.manager_b, self.world_b),
            (self.tenant_a, self.world_a),
            (self.tenant_b, self.world_b),
        ]
        for endpoint, world_key, _, _ in financial_and_lease_matrix:
            for user, world in financial_users:
                if world is None:
                    expected = [
                        self.world_a[world_key].pk,
                        self.world_b[world_key].pk,
                    ]
                else:
                    expected = [world[world_key].pk]
                self.assert_scoped_list(endpoint, user, expected, '_id' if endpoint != '/api/payments/' else 'id')

        for agent in (self.agent_a, self.agent_b):
            self.client.force_authenticate(user=agent)
            for endpoint in ('/api/contracts/', '/api/maintenance/'):
                response = self.client.get(endpoint)
                self.assertEqual(response.status_code, 403, response.data)
            for endpoint in ('/api/invoices/', '/api/payments/'):
                response = self.client.get(endpoint)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data, [], endpoint)

        for endpoint, record_key in (
            ('/api/properties/inquiries/', 'inquiry'),
            ('/api/properties/applications/', 'application'),
        ):
            self.assert_scoped_list(endpoint, self.admin, [
                self.world_a[record_key].pk, self.world_b[record_key].pk,
            ], 'id')
            for user, world in (
                (self.manager_a, self.world_a),
                (self.manager_b, self.world_b),
                (self.agent_a, self.world_a),
                (self.agent_b, self.world_b),
            ):
                self.assert_scoped_list(endpoint, user, [world[record_key].pk], 'id')
            for user in (self.owner_a, self.owner_b, self.tenant_a, self.tenant_b):
                expected = []
                if endpoint == '/api/properties/applications/' and user.role == User.Role.OWNER:
                    world = self.world_a if user == self.owner_a else self.world_b
                    expected = [world[record_key].pk]
                self.assert_scoped_list(endpoint, user, expected, 'id')

        foreign_record_checks = [
            (self.owner_a, f"/api/contracts/{self.world_b['contract'].pk}/"),
            (self.manager_a, f"/api/invoices/{self.world_b['invoice'].pk}/"),
            (self.tenant_a, f"/api/payments/{self.world_b['payment'].pk}/"),
            (self.owner_a, f"/api/maintenance/{self.world_b['maintenance'].pk}/"),
            (self.agent_a, f"/api/properties/applications/{self.world_b['application'].pk}/"),
        ]
        for user, endpoint in foreign_record_checks:
            self.client.force_authenticate(user=user)
            response = self.client.get(endpoint)
            self.assertEqual(response.status_code, 404, response.data)

    def test_unassigned_agent_cannot_read_old_prospect_records_or_add_properties(self):
        self.world_a['property'].assigned_agents.remove(self.agent_a)
        self.client.force_authenticate(user=self.agent_a)

        self.assert_scoped_list('/api/properties/', self.agent_a, [])
        self.assert_scoped_list('/api/properties/inquiries/', self.agent_a, [], 'id')
        self.assert_scoped_list('/api/properties/applications/', self.agent_a, [], 'id')
        for endpoint, record_key in (
            ('/api/properties/inquiries/', 'inquiry'),
            ('/api/properties/applications/', 'application'),
        ):
            response = self.client.get(f"{endpoint}{self.world_a[record_key].pk}/")
            self.assertEqual(response.status_code, 404, response.data)

        response = self.client.post('/api/properties/', {
            'title': 'Unauthorized Agent Property',
            'address': 'No Access Lane',
            'propertyType': 'Apartment',
        }, format='json')
        self.assertEqual(response.status_code, 403, response.data)

        self.client.force_authenticate(user=self.manager_a)
        response = self.client.post('/api/properties/', {
            'title': 'Unauthorized Manager Property',
            'address': 'No Access Lane',
            'propertyType': 'Apartment',
        }, format='json')
        self.assertEqual(response.status_code, 403, response.data)

    def test_owner_property_creation_is_bound_to_the_authenticated_owner(self):
        self.client.force_authenticate(user=self.owner_a)
        response = self.client.post('/api/properties/', {
            'title': 'Owner A Property',
            'address': 'Owner A Lane',
            'propertyType': 'Apartment',
            'price': '40000.00',
            'owner': self.owner_b.pk,
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        created = Property.objects.get(pk=response.data['_id'])
        self.assertEqual(created.owner_id, self.owner_a.pk)

    def test_owner_portfolio_serializes_existing_contracts(self):
        self.client.force_authenticate(user=self.owner_a)

        response = self.client.get('/api/owner/portfolio/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            [contract['_id'] for contract in response.data['contracts']],
            [self.world_a['contract'].pk],
        )
