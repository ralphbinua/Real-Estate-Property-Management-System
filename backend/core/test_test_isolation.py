"""Keep the default test command complete and independent of shared caches."""

import os
from pathlib import Path
import subprocess
import sys

from django.test import SimpleTestCase
from django.test.runner import DiscoverRunner


class TestInfrastructureTests(SimpleTestCase):
    def test_default_discovery_includes_contract_workflows(self):
        backend_dir = Path(__file__).resolve().parent.parent
        suite = DiscoverRunner(verbosity=0).build_suite([str(backend_dir)])

        def test_ids(tests):
            for test in tests:
                if hasattr(test, 'id'):
                    yield test.id()
                else:
                    yield from test_ids(test)

        discovered = list(test_ids(suite))
        for module in ('contracts.tests.', 'contracts.test_renewals.', 'contracts.test_move_out.'):
            with self.subTest(module=module):
                self.assertTrue(any(test_id.startswith(module) for test_id in discovered), module)

    def test_test_settings_ignore_shared_redis_configuration(self):
        env = {
            **os.environ,
            'REDIS_URL': 'redis://127.0.0.1:1/15',
            'DJANGO_DEBUG': 'false',
            'DJANGO_SECRET_KEY': 'isolated-settings-test-key',
            'DJANGO_ALLOWED_HOSTS': 'localhost,127.0.0.1',
            'BROWSER_TEST_DB': ':memory:',
        }
        env.pop('VERCEL_URL', None)
        env.pop('VERCEL', None)
        for module in ('core.test_settings', 'core.browser_test_settings'):
            with self.subTest(settings=module):
                # Inspect configuration only; never connect to the supplied Redis.
                result = subprocess.run(
                    [sys.executable, '-c',
                     f'from {module} import CACHES; print(CACHES["default"]["BACKEND"])'],
                    cwd=Path(__file__).resolve().parent.parent,
                    env=env, capture_output=True, text=True, check=True, timeout=30,
                )
                self.assertEqual(
                    result.stdout.strip(), 'django.core.cache.backends.locmem.LocMemCache',
                )
