import os
from unittest.mock import patch
from urllib.request import Request

from django.test import SimpleTestCase

from core.cron_monitoring import report_cron_result


class CronMonitoringTests(SimpleTestCase):
    @patch.dict(os.environ, {'BILLING_HEALTHCHECK_URL': 'https://hc-ping.com/ping-key/billing'})
    @patch('core.cron_monitoring.urlopen')
    def test_successful_billing_sends_healthcheck_ping(self, urlopen):
        urlopen.return_value.status = 200

        self.assertTrue(report_cron_result('billing', succeeded=True))

        request = urlopen.call_args.args[0]
        self.assertIsInstance(request, Request)
        self.assertEqual(request.full_url, 'https://hc-ping.com/ping-key/billing')
        self.assertEqual(urlopen.call_args.kwargs['timeout'], 2)

    @patch.dict(os.environ, {'LEASE_REMINDERS_HEALTHCHECK_URL': 'https://hc-ping.com/reminder-key/lease-reminders/'})
    @patch('core.cron_monitoring.urlopen')
    def test_failed_reminders_send_failure_signal(self, urlopen):
        urlopen.return_value.status = 200

        self.assertTrue(report_cron_result('lease_reminders', succeeded=False))

        self.assertEqual(
            urlopen.call_args.args[0].full_url,
            'https://hc-ping.com/reminder-key/lease-reminders/fail',
        )

    @patch.dict(os.environ, {}, clear=True)
    @patch('core.cron_monitoring.urlopen')
    def test_unconfigured_monitor_does_not_break_scheduled_work(self, urlopen):
        self.assertFalse(report_cron_result('billing', succeeded=True))
        urlopen.assert_not_called()

    @patch.dict(os.environ, {'BILLING_HEALTHCHECK_URL': 'http://hc-ping.com/private-check'})
    @patch('core.cron_monitoring.urlopen')
    def test_invalid_monitor_url_is_rejected(self, urlopen):
        with self.assertLogs('core.cron_monitoring', level='WARNING') as captured:
            self.assertFalse(report_cron_result('billing', succeeded=True))

        self.assertIn('invalid', captured.output[0])
        self.assertNotIn('private-check', captured.output[0])
        urlopen.assert_not_called()

    @patch.dict(os.environ, {'BILLING_HEALTHCHECK_URL': 'https://[broken'})
    @patch('core.cron_monitoring.urlopen')
    def test_malformed_monitor_url_does_not_break_scheduled_work(self, urlopen):
        with self.assertLogs('core.cron_monitoring', level='WARNING') as captured:
            self.assertFalse(report_cron_result('billing', succeeded=False))

        self.assertIn('invalid', captured.output[0])
        urlopen.assert_not_called()

    @patch.dict(os.environ, {'BILLING_HEALTHCHECK_URL': 'https://hc-ping.com/private-check'})
    @patch('core.cron_monitoring.urlopen', side_effect=TimeoutError('private network detail'))
    def test_monitor_failure_is_logged_without_exposing_ping_url(self, urlopen):
        with self.assertLogs('core.cron_monitoring', level='WARNING') as captured:
            self.assertFalse(report_cron_result('billing', succeeded=True))

        self.assertIn('billing', captured.output[0])
        self.assertNotIn('private-check', captured.output[0])

