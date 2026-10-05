from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from billing.models import Invoice, Payment
from contracts.models import Contract
from maintenance.models import MaintenanceRequest
from .models import Property, PropertyInquiry, RentalApplication, Unit


User = get_user_model()


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
