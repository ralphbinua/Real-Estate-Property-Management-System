from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from properties.models import Property, Unit
from .models import Contract, DepositSettlement, LeaseInspection


User = get_user_model()


class MoveOutWorkflowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = User.objects.create_user(username='turn-owner', email='turn-owner@example.test', role='Owner')
        cls.other_owner = User.objects.create_user(username='turn-other-owner', email='turn-other-owner@example.test', role='Owner')
        cls.manager = User.objects.create_user(username='turn-manager', email='turn-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='turn-tenant', email='turn-tenant@example.test', role='Tenant')
        cls.property = Property.objects.create(title='Turnover property', address='2 Road', property_type='Apartment', status='Occupied', owner=cls.owner, manager=cls.manager)
        cls.unit = Unit.objects.create(property=cls.property, unit_number='2A', monthly_rate=1000, status='Occupied', tenant=cls.tenant)
        cls.contract = Contract.objects.create(property=cls.property, unit=cls.unit, tenant=cls.tenant, status='Active', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=Decimal('1000.00'), deposit_amount=Decimal('500.00'))

    def path(self, suffix):
        return f'/api/contracts/{self.contract.pk}/{suffix}/'

    def start_and_inspect(self):
        self.client.force_authenticate(self.owner)
        moved = self.client.post(self.path('move-out'), {'reason': 'Tenant moved', 'effectiveDate': '2026-10-16'}, format='json')
        self.assertEqual(moved.status_code, 200, moved.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Maintenance')
        self.client.force_authenticate(self.manager)
        inspection = self.client.post(self.path('inspection'), {'kind': 'Move Out', 'inspectedOn': '2026-10-16', 'checklist': {'walls': 'Good', 'floor': 'Damaged'}, 'notes': 'Floor repair needed'}, format='json')
        self.assertEqual(inspection.status_code, 201, inspection.data)
        return inspection.data['id']

    def test_move_out_inspection_settlement_and_turnover(self):
        inspection_id = self.start_and_inspect()
        self.assertEqual(self.client.post(self.path('deposit-settlement'), {'deductions': '600.00', 'reason': 'Floor repair'}, format='json').status_code, 400)
        requested = self.client.post(self.path('deposit-settlement'), {'deductions': '100.00', 'reason': 'Floor repair'}, format='json')
        self.assertEqual(requested.status_code, 200, requested.data)
        self.assertEqual(requested.data['returnAmount'], '400.00')
        self.assertEqual(self.client.post(self.path('complete-turnover')).status_code, 400)
        self.client.force_authenticate(self.other_owner)
        self.assertEqual(self.client.post(self.path('deposit-decision'), {'approved': True}, format='json').status_code, 404)
        self.client.force_authenticate(self.tenant)
        acknowledged = self.client.post(self.path('inspection-acknowledge'), {'inspectionId': inspection_id}, format='json')
        self.assertEqual(acknowledged.status_code, 200, acknowledged.data)
        self.assertIsNotNone(acknowledged.data['tenantAcknowledgedAt'])
        self.assertEqual(self.client.post(self.path('deposit-decision'), {'approved': True}, format='json').status_code, 403)
        self.client.force_authenticate(self.owner)
        approved = self.client.post(self.path('deposit-decision'), {'approved': True}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        self.client.force_authenticate(self.manager)
        completed = self.client.post(self.path('complete-turnover'))
        self.assertEqual(completed.status_code, 200, completed.data)
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, 'Available')
        self.assertEqual(LeaseInspection.objects.filter(contract=self.contract, kind='Move Out').count(), 1)
        self.assertEqual(DepositSettlement.objects.get(contract=self.contract).status, 'Approved')

    def test_inspection_versions_are_immutable(self):
        self.start_and_inspect()
        revised = self.client.post(self.path('inspection'), {'kind': 'Move Out', 'inspectedOn': '2026-10-17', 'checklist': {'walls': 'Fair'}}, format='json')
        self.assertEqual(revised.status_code, 201, revised.data)
        self.assertEqual(revised.data['version'], 2)
        self.assertEqual(LeaseInspection.objects.get(contract=self.contract, kind='Move Out', version=1).checklist['walls'], 'Good')

    def test_unitless_property_stays_unavailable_until_turnover(self):
        prop = Property.objects.create(title='Single home', address='3 Road', property_type='Commercial', status='Occupied', owner=self.owner, manager=self.manager)
        lease = Contract.objects.create(property=prop, tenant=self.tenant, status='Active', start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=Decimal('1000.00'), deposit_amount=Decimal('0.00'))
        base = f'/api/contracts/{lease.pk}/'
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'{base}move-out/', {'reason': 'Moved', 'effectiveDate': '2026-10-16'}, format='json').status_code, 200)
        prop.refresh_from_db()
        self.assertEqual(prop.status, 'Under Maintenance')
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'{base}inspection/', {'kind': 'Move Out', 'inspectedOn': '2026-10-16', 'checklist': {'walls': 'Good'}}, format='json').status_code, 201)
        self.assertEqual(self.client.post(f'{base}deposit-settlement/', {'deductions': '0.00'}, format='json').status_code, 200)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.post(f'{base}deposit-decision/', {'approved': True}, format='json').status_code, 200)
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f'{base}complete-turnover/').status_code, 200)
        prop.refresh_from_db()
        self.assertEqual(prop.status, 'Available')
