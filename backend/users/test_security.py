from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .serializers import UserCreateSerializer, UserSerializer


User = get_user_model()


class AccountSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='admin@example.com', email='admin@example.com',
            password='StrongPass-12345', role=User.Role.ADMIN,
        )

    def test_weak_password_rejected_on_create_and_update(self):
        create = UserCreateSerializer(data={
            'email': 'new@example.com', 'password': 'password', 'role': 'Tenant',
        })
        self.assertFalse(create.is_valid())
        self.assertIn('password', create.errors)

        update = UserSerializer(self.user, data={'password': 'password'}, partial=True)
        self.assertFalse(update.is_valid())
        self.assertIn('password', update.errors)

    def test_login_uses_session_and_requires_csrf(self):
        client = APIClient(enforce_csrf_checks=True)
        self.assertEqual(client.post('/api/auth/login/', {
            'email': self.user.email, 'password': 'StrongPass-12345',
        }, format='json').status_code, 403)
        client.get('/api/auth/csrf/')
        csrf = client.cookies['csrftoken'].value
        response = client.post('/api/auth/login/', {
            'email': self.user.email, 'password': 'StrongPass-12345',
        }, format='json', HTTP_X_CSRFTOKEN=csrf)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn('token', response.data)
        self.assertNotIn('refresh', response.data)
        self.assertIn('sessionid', client.cookies)
        self.assertEqual(client.get('/api/users/me/').status_code, 200)
        self.assertEqual(client.post('/api/auth/logout/').status_code, 403)
        csrf = client.cookies['csrftoken'].value
        self.assertEqual(client.post('/api/auth/logout/', HTTP_X_CSRFTOKEN=csrf).status_code, 200)
        self.assertEqual(client.get('/api/users/me/').status_code, 403)

    def test_deactivated_account_loses_session_access(self):
        client = APIClient()
        self.assertEqual(client.post('/api/auth/login/', {
            'email': self.user.email, 'password': 'StrongPass-12345',
        }, format='json').status_code, 200)
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertEqual(client.get('/api/users/me/').status_code, 403)

    @override_settings(CACHES={'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}})
    def test_login_is_throttled(self):
        client = APIClient()
        for _ in range(5):
            self.assertEqual(client.post('/api/auth/login/', {
                'email': 'missing@example.com', 'password': 'wrong',
            }, format='json').status_code, 401)
        self.assertEqual(client.post('/api/auth/login/', {
            'email': 'missing@example.com', 'password': 'wrong',
        }, format='json').status_code, 429)

    def test_login_is_throttled_by_account_across_ips(self):
        client = APIClient()
        for number in range(10):
            self.assertEqual(client.post('/api/auth/login/', {
                'email': 'missing@example.com', 'password': 'wrong',
            }, format='json', HTTP_X_FORWARDED_FOR=f'192.0.2.{number + 1}').status_code, 401)
        self.assertEqual(client.post('/api/auth/login/', {
            'email': 'missing@example.com', 'password': 'wrong',
        }, format='json', HTTP_X_FORWARDED_FOR='192.0.2.20').status_code, 429)
