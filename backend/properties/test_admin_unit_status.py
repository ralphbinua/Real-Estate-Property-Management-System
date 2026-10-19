from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import Property, Unit


User = get_user_model()


class AdminUnitAvailabilityApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            username='availability-admin', email='availability-admin@example.test', role=User.Role.ADMIN,
        )
        cls.property = Property.objects.create(
            title='Availability test', address='1 Test Lane', property_type='Apartment', owner=None,
        )
        cls.unit = Unit.objects.create(property=cls.property, unit_number='101', monthly_rate=1200)

    def test_direct_occupied_or_reserved_changes_explain_the_required_rental_workflow(self):
        self.client.force_authenticate(self.admin)

        for status, expected_message in (
            ('Occupied', 'Occupied status follows an active lease or recorded move-in.'),
            ('Reserved', 'Reserved status follows an approved application or pending lease.'),
        ):
            with self.subTest(status=status):
                response = self.client.patch(
                    f'/api/properties/units/{self.unit.pk}/', {'status': status}, format='json',
                )

                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(response.data['status'][0], expected_message)

    def test_admin_can_mark_available_unit_for_maintenance_and_return_it(self):
        self.client.force_authenticate(self.admin)

        for status in ('Maintenance', 'Available'):
            with self.subTest(status=status):
                response = self.client.patch(
                    f'/api/properties/units/{self.unit.pk}/', {'status': status}, format='json',
                )
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data['status'], status)
