"""Isolated, non-debug settings for the local browser smoke test."""

import os

from django.core.exceptions import ImproperlyConfigured

from .local_settings import *  # noqa: F403


database_path = os.getenv('BROWSER_TEST_DB')
if not database_path:
    raise ImproperlyConfigured('BROWSER_TEST_DB is required for browser tests.')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': database_path,
    },
}

CSRF_TRUSTED_ORIGINS = [*CSRF_TRUSTED_ORIGINS, 'http://127.0.0.1:15173']  # noqa: F405
