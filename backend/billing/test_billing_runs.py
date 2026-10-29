from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from rest_framework.test import APITestCase

from .models import BillingRun
from notifications.models import Notification


User = get_user_model()


class BillingRunTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='billing-admin', email='billing-admin@example.test', role='Admin')
        cls.manager = User.objects.create_user(username='billing-manager', email='billing-manager@example.test', role='Property Manager')
        cls.tenant = User.objects.create_user(username='billing-tenant', email='billing-tenant@example.test', role='Tenant')

    @patch.dict('os.environ', {'CRON_SECRET': 'billing-test-secret'})
    def test_scheduled_endpoint_requires_secret_and_records_reruns(self):
        url = '/api/invoices/scheduled-monthly-billing/'
        self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.get(url, HTTP_AUTHORIZATION='Bearer wrong').status_code, 401)
        for _ in range(2):
            response = self.client.get(url, HTTP_AUTHORIZATION='Bearer billing-test-secret')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertEqual(response.data['generatedCount'], 0)
        self.assertEqual(BillingRun.objects.filter(trigger='Scheduled', status='Succeeded').count(), 2)

    @patch.dict('os.environ', {'CRON_SECRET': 'billing-test-secret'})
    def test_scheduled_endpoint_reports_success_and_failure_to_monitor(self):
        url = '/api/invoices/scheduled-monthly-billing/'
        with patch('billing.views.report_cron_result') as report:
            response = self.client.get(url, HTTP_AUTHORIZATION='Bearer billing-test-secret')
        self.assertEqual(response.status_code, 200, response.data)
        report.assert_called_once_with('billing', succeeded=True)

        with patch('billing.views.run_monthly_billing', side_effect=RuntimeError('expected billing failure')):
            with patch('billing.views.report_cron_result') as report:
                with self.assertRaises(RuntimeError):
                    self.client.get(url, HTTP_AUTHORIZATION='Bearer billing-test-secret')
        report.assert_called_once_with('billing', succeeded=False)

    def test_run_history_is_staff_only_and_manager_sees_only_own_manual_runs(self):
        BillingRun.objects.create(month=date(2026, 10, 1), trigger='Scheduled', status='Succeeded')
        BillingRun.objects.create(month=date(2026, 10, 1), trigger='Manual', actor=self.admin, status='Succeeded')
        BillingRun.objects.create(month=date(2026, 10, 1), trigger='Manual', actor=self.manager, status='Failed')
        url = '/api/invoices/billing-runs/'
        self.client.force_authenticate(self.admin)
        self.assertEqual(len(self.client.get(url).data), 3)
        self.client.force_authenticate(self.manager)
        self.assertEqual(len(self.client.get(url).data), 1)
        self.client.force_authenticate(self.tenant)
        self.assertEqual(self.client.get(url).status_code, 403)

    @patch('billing.services.generate_monthly_invoices', side_effect=RuntimeError('billing failed'))
    def test_failed_command_keeps_failure_record(self, _generate):
        with self.assertRaises(RuntimeError):
            call_command('generate_monthly_invoices', month='2026-10')
        run = BillingRun.objects.get()
        self.assertEqual(run.month, date(2026, 10, 1))
        self.assertEqual(run.status, 'Failed')
        self.assertEqual(run.error_summary, 'billing failed')
        self.assertIsNotNone(run.finished_at)
        self.assertTrue(Notification.objects.filter(recipient=self.admin, title='Monthly billing failed').exists())
