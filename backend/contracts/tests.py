from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
import json
from threading import Barrier
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import SimpleTestCase, TransactionTestCase, skipUnlessDBFeature
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient, APITestCase, APIRequestFactory

from billing.models import Invoice
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from contracts.views import ContractViewSet
from properties.models import Property, PropertyInquiry, RentalApplication, Unit


User = get_user_model()


class ContractSerializerQuerySetTests(SimpleTestCase):
    def test_serializes_empty_queryset_with_many(self):
        queryset = Contract.objects.none()

        serializer = ContractSerializer(queryset, many=True)

        self.assertIs(serializer.instance, queryset)
        self.assertIsInstance(serializer.child, ContractSerializer)
        self.assertEqual(serializer.data, [])


class ContractPrivacyApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.old_tenant = User.objects.create_user(
            username='previous-tenant', email='previous@example.test', role=User.Role.TENANT,
        )
        cls.new_tenant = User.objects.create_user(
            username='current-tenant', email='current@example.test', role=User.Role.TENANT,
        )
        cls.owner = User.objects.create_user(username='owner', email='owner@example.test', role=User.Role.OWNER)
        cls.manager = User.objects.create_user(
            username='manager', email='manager@example.test', role=User.Role.PROPERTY_MANAGER,
        )
        cls.admin = User.objects.create_user(username='admin', email='admin@example.test', role=User.Role.ADMIN)
        cls.property = Property.objects.create(
            title='Tenant turnover', address='1 Test Lane', property_type='Apartment',
            owner=cls.owner, manager=cls.manager,
        )
        cls.unit = Unit.objects.create(
            property=cls.property, unit_number='101', monthly_rate=Decimal('1200.00'),
            status='Occupied', tenant=cls.new_tenant,
        )
        cls.old_lease = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.old_tenant,
            start_date=date(2025, 1, 1), end_date=date(2025, 12, 31),
            rent_amount=Decimal('1000.00'), status='Terminated',
        )
        cls.new_lease = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.new_tenant,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
            rent_amount=Decimal('1200.00'), status='Active',
        )
        cls.invoice = Invoice.objects.create(
            contract=cls.old_lease, property=cls.property, tenant=cls.old_tenant,
            amount=Decimal('1000.00'), total_due=Decimal('1000.00'), due_date=date(2025, 12, 1),
        )

    def test_former_tenant_cannot_see_current_occupant_in_lease(self):
        self.client.force_authenticate(self.old_tenant)
        response = self.client.get(f'/api/contracts/{self.old_lease.pk}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['unitDetails']['unitNumber'], '101')
        self.assertNotIn('tenantId', response.data['unitDetails'])
        self.assertNotIn('tenantDetails', response.data['unitDetails'])
        self.assertNotIn('current@example.test', json.dumps(response.data, default=str))

    def test_former_tenant_cannot_see_current_occupant_in_invoice(self):
        self.client.force_authenticate(self.old_tenant)
        response = self.client.get(f'/api/invoices/{self.invoice.pk}/')

        self.assertEqual(response.status_code, 200, response.data)
        unit_details = response.data['contractDetails']['unitDetails']
        self.assertNotIn('tenantId', unit_details)
        self.assertNotIn('tenantDetails', unit_details)
        self.assertNotIn('current@example.test', json.dumps(response.data, default=str))

    def test_property_staff_retain_authorized_unit_details(self):
        for actor in (self.owner, self.manager, self.admin):
            with self.subTest(role=actor.role):
                self.client.force_authenticate(actor)
                response = self.client.get(f'/api/contracts/{self.old_lease.pk}/')

                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['unitDetails']['tenantId'], self.new_tenant.pk)
                self.assertEqual(response.data['unitDetails']['tenantDetails']['email'], 'current@example.test')

    def test_current_tenant_can_see_their_own_unit_details(self):
        self.client.force_authenticate(self.new_tenant)
        response = self.client.get(f'/api/contracts/{self.new_lease.pk}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['unitDetails']['tenantId'], self.new_tenant.pk)
        self.assertEqual(response.data['unitDetails']['tenantDetails']['email'], 'current@example.test')

    def test_lease_without_unit_returns_null_unit_details(self):
        lease = Contract.objects.create(
            property=self.property, tenant=self.old_tenant,
            start_date=date(2024, 1, 1), end_date=date(2024, 12, 31),
            rent_amount=Decimal('1000.00'), status='Terminated',
        )
        self.client.force_authenticate(self.old_tenant)
        response = self.client.get(f'/api/contracts/{lease.pk}/')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data['unitDetails'])


class ContractFinancialInputApiTests(APITestCase):
    def test_new_lease_rejects_nonpositive_rent_and_negative_deposit(self):
        admin = User.objects.create_user(username='money-admin', email='money-admin@example.test', role=User.Role.ADMIN)
        tenant = User.objects.create_user(username='money-tenant', email='money-tenant@example.test', role=User.Role.TENANT)
        self.client.force_authenticate(admin)
        for field, value in (('rentAmount', '0.00'), ('rentAmount', '-0.01'), ('depositAmount', '-0.01')):
            with self.subTest(field=field, value=value):
                property_obj = Property.objects.create(
                    title='Money validation', address='1 Test Lane', property_type='Commercial', price=1000,
                )
                response = self.client.post('/api/contracts/', {
                    'property': property_obj.pk, 'tenant': tenant.pk,
                    'startDate': '2026-01-01', 'endDate': '2026-12-31', 'rentAmount': '1000.00',
                    'depositAmount': '0.00', 'manualLeaseReference': 'Offline lease', field: value,
                }, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)


class PendingWholePropertyLeaseApiTests(APITestCase):
    def setUp(self):
        self.manager = User.objects.create_user(username='whole-manager', email='whole-manager@example.test', role='Property Manager')
        self.tenant = User.objects.create_user(username='whole-tenant', email='whole-tenant@example.test', role='Tenant')
        self.property = Property.objects.create(
            title='Whole property lease', address='1 Test Lane', property_type='Commercial', manager=self.manager, price=1000,
        )
        self.client.force_authenticate(self.manager)
        response = self.client.post('/api/contracts/', {
            'property': self.property.pk, 'tenant': self.tenant.pk,
            'startDate': '2026-01-01', 'endDate': '2026-12-31', 'rentAmount': '1000.00',
            'manualLeaseReference': 'Original offline record',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.lease_id = response.data['_id']

    def test_pending_whole_property_edit_keeps_reservation(self):
        response = self.client.patch(f'/api/contracts/{self.lease_id}/', {
            'manualLeaseReference': 'Updated offline record',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.property.refresh_from_db()
        self.assertEqual(self.property.status, 'Pending')

    def test_legacy_available_property_is_restored_to_pending(self):
        Property.objects.filter(pk=self.property.pk).update(status='Available')
        response = self.client.patch(f'/api/contracts/{self.lease_id}/', {
            'manualLeaseReference': 'Corrected reference',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.property.refresh_from_db()
        self.assertEqual(self.property.status, 'Pending')

    def test_moving_draft_releases_old_property_and_reserves_new(self):
        target = Property.objects.create(
            title='New whole property', address='2 Test Lane', property_type='Commercial', manager=self.manager, price=1000,
        )
        response = self.client.patch(f'/api/contracts/{self.lease_id}/', {
            'property': target.pk, 'unit': None,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.property.refresh_from_db()
        target.refresh_from_db()
        self.assertEqual(self.property.status, 'Available')
        self.assertEqual(target.status, 'Pending')

    def test_pending_rent_edit_accepts_positive_rent_and_zero_deposit(self):
        response = self.client.patch(f'/api/contracts/{self.lease_id}/', {
            'rentAmount': '1200.00', 'depositAmount': '0.00',
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['rentAmount'], '1200.00')
        self.assertEqual(response.data['depositAmount'], '0.00')


class ContractReservationConcurrencyTests(TransactionTestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username='owner', email='owner@example.test', role=User.Role.OWNER,
        )
        self.manager = User.objects.create_user(
            username='manager', email='manager@example.test', role=User.Role.PROPERTY_MANAGER,
        )
        self.tenants = [
            User.objects.create_user(
                username=f'tenant-{number}', email=f'tenant-{number}@example.test', role=User.Role.TENANT,
            ) for number in range(2)
        ]
        self.property = Property.objects.create(
            title='Unit reservations', address='1 Test Lane', property_type='Apartment',
            owner=self.owner, manager=self.manager,
        )
        self.unit = Unit.objects.create(
            property=self.property, unit_number='101', monthly_rate=Decimal('1200.00'),
        )
        self.unitless_property = Property.objects.create(
            title='Whole building', address='2 Test Lane', property_type='Commercial',
            owner=self.owner, manager=self.manager, price=Decimal('1200.00'),
        )

    def lease_payload(self, property_obj, unit, tenant):
        return {
            'property': property_obj.pk, 'unit': unit.pk if unit else None, 'tenant': tenant.pk,
            'startDate': '2026-01-01', 'endDate': '2026-12-31', 'rentAmount': '1200.00',
            'manualLeaseReference': 'Offline lease test record',
        }

    def race_requests(self, requests):
        validated = Barrier(2, timeout=10)

        class SynchronizedContractSerializer(ContractSerializer):
            def validate(self, attrs):
                result = super().validate(attrs)
                if not getattr(self, '_synchronized', False):
                    self._synchronized = True
                    validated.wait()
                return result

        def submit(request):
            try:
                with connections['default'].cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                client = APIClient(raise_request_exception=False)
                client.force_authenticate(self.manager)
                method, url, payload = request
                return getattr(client, method)(url, payload, format='json')
            finally:
                connections.close_all()

        # Synchronize real API validations, then exercise real transactional saves.
        with patch.object(ContractViewSet, 'serializer_class', SynchronizedContractSerializer):
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = [executor.submit(submit, request) for request in requests]
                responses = [future.result(timeout=20) for future in futures]
        return responses

    def race_lease_requests(self, property_obj, unit):
        responses = self.race_requests([
            ('post', '/api/contracts/', self.lease_payload(property_obj, unit, tenant))
            for tenant in self.tenants
        ])
        self.assertEqual(sorted(response.status_code for response in responses), [201, 400])
        rejected = next(response for response in responses if response.status_code == 400)
        self.assertIn('unit' if unit else 'property', rejected.data)
        self.assertEqual(
            Contract.objects.filter(
                property=property_obj, unit=unit, status__in=['Pending', 'Active'], is_deleted=False,
            ).count(),
            1,
        )

    @skipUnlessDBFeature('has_select_for_update')
    def test_competing_unit_reservations_allow_one_lease(self):
        self.race_lease_requests(self.property, self.unit)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Reserved')
        self.assertIsNone(self.unit.tenant_id)

    @skipUnlessDBFeature('has_select_for_update')
    def test_competing_unitless_property_reservations_allow_one_lease(self):
        self.race_lease_requests(self.unitless_property, None)
        self.unitless_property.refresh_from_db()
        self.assertEqual(self.unitless_property.status, 'Pending')

    def test_single_manual_reservation_succeeds(self):
        client = APIClient()
        client.force_authenticate(self.manager)
        response = client.post(
            '/api/contracts/', self.lease_payload(self.property, self.unit, self.tenants[0]), format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['status'], 'Pending')
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Reserved')

    def test_approved_application_reservation_can_prepare_lease(self):
        self.unit.status = 'Reserved'
        self.unit.save(update_fields=['status'])
        inquiry = PropertyInquiry.objects.create(
            property=self.property, unit=self.unit, prospect_name='Applicant',
            prospect_email=self.tenants[0].email,
        )
        application = RentalApplication.objects.create(
            inquiry=inquiry, applicant_email=self.tenants[0].email, status='Approved',
            approval_mode='Owner', move_in_date=date(2026, 1, 1),
        )
        client = APIClient()
        client.force_authenticate(self.manager)
        response = client.post(f'/api/properties/applications/{application.pk}/create-lease/', {
            'tenant': self.tenants[0].pk, 'endDate': '2026-12-31',
        }, format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['contract']['sourceApplication'], application.pk)
        self.assertEqual(response.data['contract']['status'], 'Pending')
        application.refresh_from_db()
        self.assertEqual(application.status, 'Approved')

    def pending_lease(self, unit, tenant):
        unit.status = 'Reserved'
        unit.save(update_fields=['status'])
        return Contract.objects.create(
            property=unit.property, unit=unit, tenant=tenant, status='Pending',
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31),
            rent_amount=Decimal('1200.00'), manual_lease_reference='Offline lease test record',
        )

    @skipUnlessDBFeature('has_select_for_update')
    def test_pending_edit_and_new_lease_cannot_reserve_same_unit(self):
        source = Unit.objects.create(
            property=self.property, unit_number='Source', monthly_rate=Decimal('1200.00'),
        )
        lease = self.pending_lease(source, self.tenants[0])
        responses = self.race_requests([
            ('patch', f'/api/contracts/{lease.pk}/', {'unit': self.unit.pk}),
            ('post', '/api/contracts/', self.lease_payload(self.property, self.unit, self.tenants[1])),
        ])

        self.assertIn(tuple(response.status_code for response in responses), ((200, 400), (400, 201)))
        self.assertEqual(Contract.objects.filter(unit=self.unit, status='Pending', is_deleted=False).count(), 1)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Reserved')

    @skipUnlessDBFeature('has_select_for_update')
    def test_competing_pending_edits_allow_one_target_reservation(self):
        sources = [
            Unit.objects.create(
                property=self.property, unit_number=f'Source-{number}', monthly_rate=Decimal('1200.00'),
            ) for number in range(2)
        ]
        leases = [self.pending_lease(unit, tenant) for unit, tenant in zip(sources, self.tenants)]
        responses = self.race_requests([
            ('patch', f'/api/contracts/{lease.pk}/', {'unit': self.unit.pk}) for lease in leases
        ])

        self.assertEqual(sorted(response.status_code for response in responses), [200, 400])
        self.assertEqual(Contract.objects.filter(unit=self.unit, status='Pending', is_deleted=False).count(), 1)
        self.assertEqual(Contract.objects.filter(unit__in=sources, status='Pending', is_deleted=False).count(), 1)

    def test_edit_validated_before_activation_cannot_change_active_lease(self):
        source = Unit.objects.create(
            property=self.property, unit_number='Signed lease source', monthly_rate=Decimal('1200.00'),
        )
        lease = self.pending_lease(source, self.tenants[0])
        client_request = APIRequestFactory().patch('/api/contracts/')
        client_request.user = self.manager
        serializer = ContractSerializer(
            lease, data={'unit': self.unit.pk}, partial=True, context={'request': client_request},
        )
        serializer.is_valid(raise_exception=True)
        Contract.objects.filter(pk=lease.pk).update(status='Active')
        Unit.objects.filter(pk=source.pk).update(status='Occupied', tenant=self.tenants[0])

        with self.assertRaises(ValidationError):
            serializer.save()

        lease.refresh_from_db()
        self.assertEqual(lease.status, 'Active')
        self.assertEqual(lease.unit_id, source.pk)
