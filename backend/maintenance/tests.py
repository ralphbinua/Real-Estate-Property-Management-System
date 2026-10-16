from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from notifications.models import Notification
from properties.models import Property, Unit

from maintenance.models import MaintenanceRequest


User = get_user_model()


class MaintenanceAssignmentTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='maintenance-admin', email='admin-maintenance@example.test', role=User.Role.ADMIN)
        cls.manager = User.objects.create_user(username='maintenance-manager', email='manager-maintenance@example.test', role=User.Role.PROPERTY_MANAGER)
        cls.other_manager = User.objects.create_user(username='other-maintenance-manager', email='other-manager@example.test', role=User.Role.PROPERTY_MANAGER)
        cls.tenant = User.objects.create_user(username='maintenance-tenant', email='tenant-maintenance@example.test', role=User.Role.TENANT)
        cls.property = Property.objects.create(
            title='Maintenance Test Building', address='1 Test Street', property_type='Apartment',
            manager=cls.manager,
        )
        Unit.objects.create(property=cls.property, unit_number='1A', monthly_rate=1000, tenant=cls.tenant)

    def test_tenant_submits_and_tracks_assignment_and_status(self):
        self.client.force_authenticate(self.tenant)
        created = self.client.post('/api/maintenance/', {
            'property': self.property.pk,
            'issueDescription': 'Leaking tap',
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        request_id = created.data['_id']
        self.assertEqual(created.data['status'], 'Open')
        self.assertIsNone(created.data['assignedTo'])

        self.client.force_authenticate(self.admin)
        updated = self.client.patch(f'/api/maintenance/{request_id}/', {
            'assignedTo': self.manager.pk, 'status': 'In Progress',
        }, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['assignedToDetails']['name'], self.manager.email)
        self.assertTrue(updated.data['updated_at'])

        self.client.force_authenticate(self.tenant)
        listed = self.client.get('/api/maintenance/')
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data[0]['status'], 'In Progress')
        self.assertEqual(listed.data[0]['assignedTo'], self.manager.pk)
        self.assertTrue(Notification.objects.filter(recipient=self.tenant, destination=Notification.Destination.TENANT_MAINTENANCE).exists())
        self.assertTrue(Notification.objects.filter(recipient=self.manager, title='Maintenance request assigned').exists())

    def test_assignment_is_limited_to_authorized_staff(self):
        request_obj = MaintenanceRequest.objects.create(
            property=self.property, tenant=self.tenant, issue_description='Broken lock',
        )
        url = f'/api/maintenance/{request_obj.pk}/'
        self.client.force_authenticate(self.admin)
        invalid = self.client.patch(url, {'assignedTo': self.other_manager.pk}, format='json')
        self.assertEqual(invalid.status_code, 400)
        self.assertIn('assignedTo', invalid.data)

        self.client.force_authenticate(self.manager)
        assigned = self.client.patch(url, {'assignedTo': self.manager.pk}, format='json')
        self.assertEqual(assigned.status_code, 200, assigned.data)

        self.client.force_authenticate(self.tenant)
        forbidden = self.client.patch(url, {'assignedTo': self.admin.pk}, format='json')
        self.assertEqual(forbidden.status_code, 403)
        request_obj.refresh_from_db()
        self.assertEqual(request_obj.assigned_to_id, self.manager.pk)

    def test_reassignment_and_unassignment_notify_tenant(self):
        request_obj = MaintenanceRequest.objects.create(
            property=self.property, tenant=self.tenant, issue_description='Window latch',
            assigned_to=self.manager,
        )
        self.client.force_authenticate(self.admin)
        url = f'/api/maintenance/{request_obj.pk}/'
        response = self.client.patch(url, {'assignedTo': None}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIsNone(response.data['assignedTo'])
        self.assertTrue(Notification.objects.filter(
            recipient=self.tenant, message__icontains='person handling',
        ).exists())
