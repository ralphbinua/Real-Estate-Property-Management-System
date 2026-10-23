from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from properties.models import Property
from .models import Contract


User = get_user_model()


class AdminContractOrderingApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='contract-order-admin', email='contract-order-admin@example.test', role=User.Role.ADMIN,
        )
        cls.tenant_a = User.objects.create_user(
            username='contract-tenant-a', email='contract-tenant-a@example.test', first_name='Amy', last_name='Able', role=User.Role.TENANT,
        )
        cls.tenant_z = User.objects.create_user(
            username='contract-tenant-z', email='contract-tenant-z@example.test', first_name='Zed', last_name='Zulu', role=User.Role.TENANT,
        )
        cls.property_a = Property.objects.create(title='Alpha Homes', address='1 Alpha Lane', property_type='Apartment')
        cls.property_z = Property.objects.create(title='Zulu Homes', address='9 Zulu Lane', property_type='Apartment')
        cls.contracts = [
            Contract.objects.create(
                property=cls.property_z, tenant=cls.tenant_a, start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31), rent_amount=1000, status='Active',
            ),
            Contract.objects.create(
                property=cls.property_a, tenant=cls.tenant_z, start_date=date(2026, 2, 1),
                end_date=date(2026, 6, 30), rent_amount=1000, status='Pending',
            ),
        ]

    def list_contracts(self, ordering):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/contracts/', {'page': 1, 'ordering': ordering})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data['results']

    def test_active_first_ordering_puts_active_contracts_before_pending(self):
        contracts = self.list_contracts('active_first')

        self.assertEqual([contract['status'] for contract in contracts], ['Active', 'Pending'])

    def test_callers_without_an_ordering_parameter_keep_newest_first(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/contracts/', {'page': 1})

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['results'][0]['_id'], self.contracts[1].pk)

    def test_end_date_ordering_places_earliest_expiry_first(self):
        contracts = self.list_contracts('end_date')

        self.assertEqual(contracts[0]['_id'], self.contracts[1].pk)

        latest_first = self.list_contracts('end_date_desc')
        self.assertEqual(latest_first[0]['_id'], self.contracts[0].pk)

    def test_property_and_tenant_ordering_are_supported(self):
        by_property = self.list_contracts('property')
        by_tenant = self.list_contracts('tenant')

        self.assertEqual(by_property[0]['_id'], self.contracts[1].pk)
        self.assertEqual(by_tenant[0]['_id'], self.contracts[0].pk)
