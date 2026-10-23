from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from properties.models import Property, Unit
from .models import Contract


User = get_user_model()


class ContractSearchApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='lease-search-admin', email='lease-search-admin@example.test', role=User.Role.ADMIN,
        )
        cls.owner = User.objects.create_user(
            username='lease-search-owner', email='lease-search-owner@example.test', role=User.Role.OWNER,
        )
        cls.other_owner = User.objects.create_user(
            username='lease-search-other-owner', email='lease-search-other-owner@example.test', role=User.Role.OWNER,
        )
        cls.tenant = User.objects.create_user(
            username='lease-search-tenant', email='amy.able@example.test', first_name='Amy', last_name='Able', role=User.Role.TENANT,
        )
        cls.other_tenant = User.objects.create_user(
            username='lease-search-other-tenant', email='other.tenant@example.test', first_name='Other', last_name='Tenant', role=User.Role.TENANT,
        )
        cls.property = Property.objects.create(
            title='Alpha Homes', address='1 Alpha Lane', property_type='Apartment', owner=cls.owner,
        )
        cls.unit = Unit.objects.create(property=cls.property, unit_number='A-101', monthly_rate=1200)
        cls.contract = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=1200, status='Active',
        )
        cls.pending_contract = Contract.objects.create(
            property=cls.property, tenant=cls.tenant,
            start_date=date(2027, 1, 1), end_date=date(2027, 12, 31), rent_amount=1200, status='Pending',
        )
        cls.terminated_contract = Contract.objects.create(
            property=cls.property, tenant=cls.tenant,
            start_date=date(2024, 1, 1), end_date=date(2024, 12, 31), rent_amount=1200, status='Terminated',
        )
        cls.expired_contract = Contract.objects.create(
            property=cls.property, tenant=cls.tenant,
            start_date=date(2023, 1, 1), end_date=date(2023, 12, 31), rent_amount=1200, status='Expired',
        )
        other_property = Property.objects.create(
            title='Beta Homes', address='2 Beta Lane', property_type='Apartment', owner=cls.other_owner,
        )
        Contract.objects.create(
            property=other_property, tenant=cls.other_tenant,
            start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=1300, status='Active',
        )

    def search(self, term, actor=None):
        self.client.force_authenticate(actor or self.admin)
        response = self.client.get('/api/contracts/', {'search': term})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_search_matches_tenant_name_email_property_and_unit(self):
        matching_tenant_contracts = {
            self.contract.pk, self.pending_contract.pk, self.terminated_contract.pk, self.expired_contract.pk,
        }
        for term, expected in (
            ('Amy', matching_tenant_contracts),
            ('Able', matching_tenant_contracts),
            ('amy.able@example.test', matching_tenant_contracts),
            ('Alpha Homes', matching_tenant_contracts),
            ('A-101', {self.contract.pk}),
        ):
            with self.subTest(term=term):
                self.assertEqual(
                    {record['_id'] for record in self.search(term)},
                    expected,
                )

    def test_search_matches_full_name_across_name_fields_case_insensitively(self):
        records = self.search('aMY aBLE')

        self.assertEqual(
            {record['_id'] for record in records},
            {self.contract.pk, self.pending_contract.pk, self.terminated_contract.pk, self.expired_contract.pk},
        )

    def test_search_does_not_escape_owner_contract_scope(self):
        records = self.search('other.tenant@example.test', actor=self.owner)

        self.assertEqual(records, [])

    def test_status_filter_can_show_active_pending_history_or_all_owner_leases(self):
        self.client.force_authenticate(self.owner)

        for status, expected in (
            ('Active', [self.contract.pk]),
            ('Pending', [self.pending_contract.pk]),
            ('History', [self.terminated_contract.pk, self.expired_contract.pk]),
            (None, [self.contract.pk, self.pending_contract.pk, self.terminated_contract.pk, self.expired_contract.pk]),
        ):
            with self.subTest(status=status):
                params = {'status': status} if status else {}
                response = self.client.get('/api/contracts/', params)
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(
                    {record['_id'] for record in response.data},
                    set(expected),
                )
