"""Settings for local HTTP development with DJANGO_DEBUG left disabled.

Use only with ``python manage.py runserver --settings=core.local_settings``.
"""

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403


if DEBUG:  # noqa: F405
    raise ImproperlyConfigured('Use core.settings for debug-mode development.')

if set(ALLOWED_HOSTS) - {'localhost', '127.0.0.1', '[::1]'}:  # noqa: F405
    raise ImproperlyConfigured('Local settings may only allow loopback hosts.')

ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']
CSRF_TRUSTED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173']
SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
DATABASES['default']['OPTIONS']['sslmode'] = 'prefer'  # noqa: F405
