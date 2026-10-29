from datetime import date, datetime, timezone as datetime_timezone
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from contracts.models import Contract
from properties.models import Property, Unit
from .models import Invoice
from .services import generate_monthly_invoices


User = get_user_model()


class BillingTimezoneBoundaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        owner = User.objects.create_user(
            username='timezone-owner', email='timezone-owner@example.test', role='Owner',
        )
        tenant = User.objects.create_user(
            username='timezone-tenant', email='timezone-tenant@example.test', role='Tenant',
        )
        property_obj = Property.objects.create(
            title='Timezone boundary home',
            address='1 Boundary Lane',
            property_type='Apartment',
            owner=owner,
        )
        unit = Unit.objects.create(
            property=property_obj,
            unit_number='TZ-1',
            monthly_rate=Decimal('1000.00'),
        )
        cls.contract = Contract.objects.create(
            property=property_obj,
            unit=unit,
            tenant=tenant,
            start_date=date(2026, 1, 1),
            end_date=date(2027, 12, 31),
            rent_amount=Decimal('1000.00'),
            rent_due_day=1,
            status='Active',
        )

    def test_before_manila_midnight_uses_local_current_month(self):
        before_midnight_utc = datetime(2026, 10, 31, 15, 59, tzinfo=datetime_timezone.utc)
        with timezone.override('Asia/Manila'), patch('billing.services.timezone.now', return_value=before_midnight_utc):
            created = generate_monthly_invoices()

        self.assertEqual(created, 1)
        invoice = Invoice.objects.get(contract=self.contract)
        self.assertEqual(invoice.due_date, date(2026, 10, 1))
        self.assertEqual(invoice.status, 'Overdue')

    def test_at_manila_midnight_uses_next_local_month(self):
        manila_midnight_utc = datetime(2026, 10, 31, 16, 0, tzinfo=datetime_timezone.utc)
        with timezone.override('Asia/Manila'), patch('billing.services.timezone.now', return_value=manila_midnight_utc):
            created = generate_monthly_invoices()

        self.assertEqual(created, 1)
        invoice = Invoice.objects.get(contract=self.contract)
        self.assertEqual(invoice.due_date, date(2026, 11, 1))
        self.assertEqual(invoice.status, 'Pending')
