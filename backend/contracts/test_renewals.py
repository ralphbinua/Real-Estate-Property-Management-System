from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from notifications.models import Notification
from properties.models import Property, Unit
from .models import Contract, LeaseExpiryReminder, LeaseRenewal
from .reminders import send_lease_expiry_reminders


User = get_user_model()


class LeaseRenewalTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='renew-owner', email='renew-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='renew-other', email='renew-other@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='renew-manager', email='renew-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='renew-tenant', email='renew-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(title='Renewal home', address='1 Test Lane', property_type='Apartment', owner=cls.owner, manager=cls.manager)
        cls.unit = Unit.objects.create(property=cls.property, unit_number='1', monthly_rate=1000, status='Occupied', tenant=cls.tenant)
        cls.contract = Contract.objects.create(
            property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active',
            start_date=timezone.localdate() - timedelta(days=300),
            end_date=timezone.localdate() + timedelta(days=30), rent_amount=1000, deposit_amount=500,
        )

    def propose(self, actor):
        self.client.force_authenticate(actor)
        return self.client.post(f'/api/contracts/{self.contract.pk}/renewal/', {
            'endDate': (self.contract.end_date + timedelta(days=366)).isoformat(), 'rentAmount': '1100.00',
        }, format='json')

    def test_manager_proposal_requires_owner_decision_and_stays_in_scope(self):
        self.assertEqual(self.propose(self.other_owner).status_code, 404)
        created = self.propose(self.manager)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['status'], 'Proposed')
        self.assertEqual(created.data['startDate'], (self.contract.end_date + timedelta(days=1)).isoformat())
        self.assertEqual(self.propose(self.manager).status_code, 400)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.get(f'/api/contracts/{self.contract.pk}/').data['renewal']['status'], 'Proposed')
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/renewal-decision/', {'approve': True}, format='json').status_code, 400)
        self.client.force_authenticate(self.owner)
        decided = self.client.post(f'/api/contracts/{self.contract.pk}/renewal-decision/', {'approve': True}, format='json')
        self.assertEqual(decided.status_code, 200, decided.data)
        self.assertEqual(decided.data['status'], 'Approved')

    def test_owner_proposal_is_approved_and_successor_waits_until_old_term_ends(self):
        created = self.propose(self.owner)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data['status'], 'Approved')
        url = f'/api/contracts/{self.contract.pk}/prepare-renewal/'
        self.assertEqual(self.client.post(url).status_code, 400)
        with patch('contracts.renewals.timezone.localdate', return_value=self.contract.end_date + timedelta(days=1)):
            prepared = self.client.post(url)
        self.assertEqual(prepared.status_code, 200, prepared.data)
        self.contract.refresh_from_db()
        self.unit.refresh_from_db()
        self.assertEqual(self.contract.status, 'Expired')
        self.assertEqual(self.unit.status, 'Reserved')
        successor = Contract.objects.get(pk=prepared.data['successorId'])
        self.assertEqual(successor.status, 'Pending')
        self.assertEqual(successor.tenant_id, self.tenant.pk)
        self.assertEqual(successor.rent_amount, 1100)
        early = self.client.post(f'/api/contracts/{successor.pk}/activate/', {
            'signaturesComplete': True, 'signedCopyReference': 'signed-renewal.pdf',
        }, format='json')
        self.assertEqual(early.status_code, 400)
        self.assertEqual(self.client.post(url).status_code, 400)
        activation_payload = {'signaturesComplete': True, 'signedCopyReference': 'signed-renewal.pdf'}
        with patch('contracts.views.timezone.localdate', return_value=successor.start_date):
            self.client.force_authenticate(self.manager)
            manager_activation = self.client.post(f'/api/contracts/{successor.pk}/activate/', activation_payload, format='json')
            self.assertEqual(manager_activation.status_code, 400, manager_activation.data)
            self.client.force_authenticate(self.owner)
            owner_activation = self.client.post(f'/api/contracts/{successor.pk}/activate/', activation_payload, format='json')
        self.assertEqual(owner_activation.status_code, 200, owner_activation.data)
        successor.refresh_from_db()
        self.assertEqual(successor.status, 'Active')

    def test_declined_proposal_cannot_prepare_and_tenant_cannot_change_it(self):
        self.assertEqual(self.propose(self.manager).status_code, 201)
        url = f'/api/contracts/{self.contract.pk}/prepare-renewal/'
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.post(url).status_code, 403)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/renewal/', {}, format='json').status_code, 403)
        self.client.force_authenticate(self.owner)
        declined = self.client.post(f'/api/contracts/{self.contract.pk}/renewal-decision/', {'approve': False}, format='json')
        self.assertEqual(declined.status_code, 200, declined.data)
        self.assertEqual(declined.data['status'], 'Declined')
        with patch('contracts.renewals.timezone.localdate', return_value=self.contract.end_date + timedelta(days=1)):
            self.assertEqual(self.client.post(url).status_code, 400)
        self.assertEqual(Contract.objects.count(), 1)

    def test_owner_can_consider_a_replacement_after_declining_and_history_is_preserved(self):
        first = self.propose(self.manager)
        self.client.force_authenticate(self.owner)
        declined = self.client.post(
            f'/api/contracts/{self.contract.pk}/renewal-decision/',
            {'approve': False, 'note': 'Revise the proposed rent.'}, format='json',
        )
        self.assertEqual(declined.status_code, 200, declined.data)

        self.client.force_authenticate(self.manager)
        replacement = self.client.post(f'/api/contracts/{self.contract.pk}/renewal/', {
            'endDate': (self.contract.end_date + timedelta(days=731)).isoformat(),
            'rentAmount': '1050.00',
        }, format='json')
        self.assertEqual(replacement.status_code, 201, replacement.data)
        self.assertNotEqual(replacement.data['id'], first.data['id'])
        self.assertEqual(replacement.data['status'], 'Proposed')
        self.assertEqual(replacement.data['version'], 2)
        self.assertEqual(replacement.data['rentAmount'], '1050.00')

        self.client.force_authenticate(self.owner)
        approved = self.client.post(
            f'/api/contracts/{self.contract.pk}/renewal-decision/',
            {'approve': True}, format='json',
        )
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(approved.data['id'], replacement.data['id'])
        self.assertEqual(LeaseRenewal.objects.filter(contract=self.contract).count(), 2)
        self.assertEqual(LeaseRenewal.objects.get(pk=first.data['id']).status, LeaseRenewal.Status.DECLINED)
        self.assertEqual(self.client.get(f'/api/contracts/{self.contract.pk}/').data['renewal']['id'], replacement.data['id'])
        self.assertEqual([item['id'] for item in self.client.get(f'/api/contracts/{self.contract.pk}/').data['renewalHistory']], [first.data['id'], replacement.data['id']])

    def test_inspection_versions_are_immutable_and_access_is_role_scoped(self):
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/move-out/', {
            'reason': 'Tenant moved out', 'effectiveDate': timezone.localdate().isoformat(),
        }, format='json').status_code, 200)
        path = f'/api/contracts/{self.contract.pk}/inspection/'
        self.client.force_authenticate(self.manager)
        original = self.client.post(path, {
            'kind': 'Move Out', 'inspectedOn': timezone.localdate().isoformat(),
            'checklist': {'walls': 'Good'}, 'notes': 'Initial inspection',
        }, format='json')
        self.assertEqual(original.status_code, 201, original.data)
        updated = self.client.post(path, {
            'kind': 'Move Out', 'inspectedOn': timezone.localdate().isoformat(),
            'checklist': {'walls': 'Fair'}, 'notes': 'Revised inspection',
        }, format='json')
        self.assertEqual(updated.data['version'], 2)
        self.assertEqual(self.client.get(path).data[1]['checklist'], {'walls': 'Good'})
        self.client.force_authenticate(self.other_owner)
        self.assertEqual(self.client.get(path).status_code, 404)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/inspection-acknowledge/', {
            'inspectionId': original.data['id'],
        }, format='json').status_code, 200)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/deposit-settlement/', {
            'deductions': '500.01', 'reason': 'Over deposit cap',
        }, format='json').status_code, 400)
        self.assertEqual(self.client.post(f'/api/contracts/{self.contract.pk}/deposit-settlement/', {
            'deductions': '500.00', 'reason': 'Within deposit cap',
        }, format='json').status_code, 200)

    def test_invalid_renewal_term_does_not_create_record(self):
        self.client.force_authenticate(self.owner)
        response = self.client.post(f'/api/contracts/{self.contract.pk}/renewal/', {
            'endDate': (self.contract.end_date + timedelta(days=1)).isoformat(), 'rentAmount': '1100.00',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(LeaseRenewal.objects.exists())

    def test_reminders_are_idempotent_and_scoped_to_participants(self):
        day = self.contract.end_date - timedelta(days=60)
        self.assertEqual(send_lease_expiry_reminders(today=day), 1)
        self.assertEqual(send_lease_expiry_reminders(today=day), 0)
        self.assertEqual(send_lease_expiry_reminders(today=self.contract.end_date - timedelta(days=30)), 1)
        self.assertEqual(send_lease_expiry_reminders(today=self.contract.end_date - timedelta(days=7)), 1)
        self.assertEqual(LeaseExpiryReminder.objects.filter(contract=self.contract).count(), 3)
        self.assertEqual(Notification.objects.filter(title='Lease ending soon').count(), 9)

    @patch.dict('os.environ', {'CRON_SECRET': 'renewal-test-secret'})
    def test_reminder_endpoint_requires_secret(self):
        url = '/api/contracts/scheduled-reminders/'
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.get(url, HTTP_AUTHORIZATION='Bearer wrong').status_code, 401)
        response = self.client.get(url, HTTP_AUTHORIZATION='Bearer renewal-test-secret')
        self.assertEqual(response.status_code, 200, response.data)

    @patch.dict('os.environ', {'CRON_SECRET': 'renewal-test-secret'})
    def test_reminder_endpoint_reports_success_and_failure_to_monitor(self):
        url = '/api/contracts/scheduled-reminders/'
        with patch('contracts.views.report_cron_result') as report:
            response = self.client.get(url, HTTP_AUTHORIZATION='Bearer renewal-test-secret')
        self.assertEqual(response.status_code, 200, response.data)
        report.assert_called_once_with('lease_reminders', succeeded=True)

        with patch('contracts.views.send_lease_expiry_reminders', side_effect=RuntimeError('expected reminder failure')):
            with patch('contracts.views.report_cron_result') as report:
                with self.assertRaises(RuntimeError):
                    self.client.get(url, HTTP_AUTHORIZATION='Bearer renewal-test-secret')
        report.assert_called_once_with('lease_reminders', succeeded=False)
