from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from notifications.models import Notification
from properties.models import Property, Unit
from .models import MaintenanceRequest


User = get_user_model()


class MaintenanceWorkOrderTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='work-owner', email='work-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='work-other-owner', email='work-other-owner@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='work-manager', email='work-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='work-tenant', email='work-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(title='Work order home', address='1 Test Road', property_type='Apartment', owner=cls.owner, manager=cls.manager)
        cls.unit = Unit.objects.create(property=cls.property, unit_number='1A', monthly_rate=1000, tenant=cls.tenant)

    def make_request(self):
        self.client.force_authenticate(self.tenant)
        response = self.client.post('/api/maintenance/', {
            'property': self.property.pk, 'unit': self.unit.pk,
            'issueDescription': 'Water leak', 'priority': 'Urgent',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        return response.data['_id']

    def test_estimate_approval_and_cost_history_are_scoped(self):
        request_id = self.make_request()
        url = f'/api/maintenance/{request_id}/'
        self.client.force_authenticate(self.manager)
        updated = self.client.patch(url, {
            'vendorName': 'Acme Plumbing', 'vendorContact': '555-0100',
            'estimateAmount': '1500.00',
        }, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['priority'], 'Urgent')
        requested = self.client.post(f'{url}request-approval/')
        self.assertEqual(requested.status_code, 200, requested.data)
        self.assertEqual(requested.data['approvalStatus'], 'Pending')
        self.assertEqual(self.client.patch(url, {'status': 'In Progress'}, format='json').status_code, 400)
        self.assertTrue(Notification.objects.filter(recipient=self.owner, title='Repair approval requested').exists())

        self.client.force_authenticate(self.other_owner)
        self.assertEqual(self.client.post(f'{url}decide-approval/', {'approved': True}, format='json').status_code, 404)
        self.client.force_authenticate(self.owner)
        approved = self.client.post(f'{url}decide-approval/', {'approved': True, 'note': 'Proceed'}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data['approvalStatus'], 'Approved')

        self.client.force_authenticate(self.manager)
        finished = self.client.patch(url, {'status': 'Resolved', 'actualCost': '1450.00'}, format='json')
        self.assertEqual(finished.status_code, 200, finished.data)
        self.assertEqual(finished.data['actualCost'], '1450.00')
        self.assertGreaterEqual(len(finished.data['activity']), 4)

        self.client.force_authenticate(self.tenant)
        tenant_view = self.client.get(url)
        self.assertEqual(tenant_view.status_code, 200)
        self.assertNotIn('actualCost', tenant_view.data)
        self.assertNotIn('vendorContact', tenant_view.data)
        self.assertEqual(tenant_view.data['status'], 'Resolved')
        self.assertEqual(tenant_view.data['activity'][-1]['summary'], 'Status changed to Resolved.')

    def test_rejected_estimate_requires_revision_before_rerequest(self):
        request_id = self.make_request()
        url = f'/api/maintenance/{request_id}/'
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'{url}request-approval/').status_code, 400)
        self.assertEqual(self.client.patch(url, {'estimateAmount': '100.00'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{url}request-approval/').status_code, 200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'{url}decide-approval/', {'approved': False, 'note': 'Too high'}, format='json').status_code, 200)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'{url}request-approval/').status_code, 400)
        self.assertEqual(self.client.patch(url, {'estimateAmount': '80.00'}, format='json').status_code, 200)
        self.assertEqual(self.client.post(f'{url}request-approval/').status_code, 200)

    def test_tenant_cannot_set_staff_fields_and_unassigned_manager_cannot_request_approval(self):
        other_manager = User.objects.create_user(username='work-other-manager', email='other-manager@example.test', role='Property Manager')
        self.client.force_authenticate(self.tenant)
        response = self.client.post('/api/maintenance/', {
            'property': self.property.pk, 'unit': self.unit.pk, 'issueDescription': 'Broken lock',
            'status': 'Resolved', 'assignedTo': self.manager.pk, 'estimateAmount': '100.00',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        work = MaintenanceRequest.objects.get(pk=response.data['_id'])
        self.assertEqual(work.status, 'Open')
        self.assertIsNone(work.assigned_to)
        self.assertIsNone(work.estimate_amount)
        self.client.force_authenticate(other_manager)
        self.assertEqual(self.client.post(f'/api/maintenance/{work.pk}/request-approval/').status_code, 404)

    def test_assigned_manager_can_resolve_existing_work_after_tenant_moves_out(self):
        request_id = self.make_request()
        Unit.objects.filter(pk=self.unit.pk).update(tenant=None, status='Available')
        self.client.force_authenticate(self.manager)

        response = self.client.patch(f'/api/maintenance/{request_id}/', {'status': 'Resolved'}, format='json')

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['status'], 'Resolved')
