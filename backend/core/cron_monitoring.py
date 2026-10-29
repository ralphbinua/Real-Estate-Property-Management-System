"""Optional Healthchecks.io check-ins for scheduled application jobs."""

import logging
import os
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen


logger = logging.getLogger(__name__)
_MONITOR_URLS = {
    'billing': 'BILLING_HEALTHCHECK_URL',
    'lease_reminders': 'LEASE_REMINDERS_HEALTHCHECK_URL',
}


def report_cron_result(job, *, succeeded):
    """Send a bounded success/failure check-in without exposing the ping URL.

    Healthchecks.io is optional in local environments. Once configured, a
    failed or unavailable monitor is logged but does not change the result of
    the scheduled business operation.
    """
    try:
        env_name = _MONITOR_URLS[job]
    except KeyError as error:
        raise ValueError(f'Unknown scheduled job: {job}') from error

    ping_url = os.environ.get(env_name, '').strip()
    if not ping_url:
        logger.warning('Healthchecks.io URL for scheduled job %s is not configured.', job)
        return False

    try:
        parsed = urlsplit(ping_url)
    except ValueError:
        logger.warning('Healthchecks.io URL for scheduled job %s is invalid.', job)
        return False
    if (
        parsed.scheme != 'https'
        or parsed.hostname != 'hc-ping.com'
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        logger.warning('Healthchecks.io URL for scheduled job %s is invalid.', job)
        return False

    path = parsed.path.rstrip('/')
    if not succeeded and not path.endswith('/fail'):
        path = f'{path}/fail'
    target = urlunsplit((parsed.scheme, parsed.netloc, path, '', ''))

    try:
        response = urlopen(Request(target, method='GET'), timeout=2)
        try:
            status_code = getattr(response, 'status', 200)
        finally:
            response.close()
        if not 200 <= status_code < 300:
            raise ValueError(f'Healthchecks.io returned HTTP {status_code}.')
    except Exception:
        logger.warning('Healthchecks.io check-in failed for scheduled job %s.', job)
        return False
    return True

