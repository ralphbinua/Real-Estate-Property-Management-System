from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class ProfileSecurityTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username='admin@example.test', email='admin@example.test',
            password='StrongPass-12345', first_name='Original', role=User.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_all_roles_can_edit_names_but_not_email_or_role(self):
        for role in User.Role.values:
            with self.subTest(role=role):
                self.user.role = role
                self.user.save(update_fields=['role'])
                response = self.client.patch('/api/users/me/', {
                    'first_name': 'Updated', 'last_name': 'Person',
                }, format='json')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['name'], 'Updated Person')
                rejected = self.client.patch('/api/users/me/', {
                    'email': 'direct-change@example.test', 'role': User.Role.ADMIN,
                }, format='json')
                self.assertEqual(rejected.status_code, 400)
                self.user.refresh_from_db()
                self.assertEqual(self.user.email, 'admin@example.test')
                self.assertEqual(self.user.role, role)

    def test_all_roles_can_save_optional_basic_information(self):
        for role in User.Role.values:
            with self.subTest(role=role):
                self.user.role = role
                self.user.save(update_fields=['role'])
                response = self.client.patch('/api/users/me/', {
                    'first_name': 'Alex',
                    'middle_name': 'Marie',
                    'last_name': 'Rivera',
                    'phone_number': '+63 917 123 4567',
                }, format='json')
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['name'], 'Alex Marie Rivera')
                self.assertEqual(response.data['middle_name'], 'Marie')
                self.assertEqual(response.data['phone_number'], '+63 917 123 4567')
                self.user.refresh_from_db()
                self.assertEqual(self.user.middle_name, 'Marie')
                self.assertEqual(self.user.phone_number, '+63 917 123 4567')

    def test_admin_can_create_and_update_optional_basic_information(self):
        created = self.client.post('/api/users/', {
            'email': 'tenant@example.test', 'password': 'AnotherStrongPass-12345',
            'first_name': 'Sam', 'middle_name': 'Lee', 'last_name': 'Cruz',
            'phone_number': '+63 917 765 4321', 'role': User.Role.TENANT,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        account = User.objects.get(email='tenant@example.test')
        self.assertEqual(account.middle_name, 'Lee')
        self.assertEqual(account.phone_number, '+63 917 765 4321')
        updated = self.client.patch(f'/api/users/{account.pk}/', {
            'middle_name': '', 'phone_number': '',
        }, format='json')
        self.assertEqual(updated.status_code, 200)
        account.refresh_from_db()
        self.assertEqual(account.middle_name, '')
        self.assertEqual(account.phone_number, '')

    def test_password_change_checks_current_password_and_rules_and_keeps_session(self):
        client = APIClient()
        client.force_login(self.user)
        url = '/api/auth/password/change/'
        self.assertEqual(client.post(url, {
            'current_password': 'incorrect',
            'new_password': 'DifferentStrongPass-12345',
            'confirm_password': 'DifferentStrongPass-12345',
        }, format='json').status_code, 400)
        self.assertEqual(client.post(url, {
            'current_password': 'StrongPass-12345',
            'new_password': 'short', 'confirm_password': 'short',
        }, format='json').status_code, 400)
        self.assertEqual(client.post(url, {
            'current_password': 'StrongPass-12345',
            'new_password': 'DifferentStrongPass-12345',
            'confirm_password': 'mismatch',
        }, format='json').status_code, 400)
        response = client.post(url, {
            'current_password': 'StrongPass-12345',
            'new_password': 'DifferentStrongPass-12345',
            'confirm_password': 'DifferentStrongPass-12345',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password('DifferentStrongPass-12345'))
        self.assertFalse(self.user.check_password('StrongPass-12345'))
        self.assertEqual(client.get('/api/users/me/').status_code, 200)

    def test_email_change_requires_password_and_updates_immediately(self):
        url = '/api/auth/email/change/'
        bad = self.client.post(url, {
            'new_email': 'updated@example.test', 'current_password': 'wrong',
        }, format='json')
        self.assertEqual(bad.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'admin@example.test')

        response = self.client.post(url, {
            'new_email': 'updated@example.test', 'current_password': 'StrongPass-12345',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'updated@example.test')
        self.assertEqual(self.user.username, 'updated@example.test')
        self.assertEqual(response.data['profile']['email'], 'updated@example.test')
        self.assertEqual(APIClient().post(url, {
            'new_email': 'another@example.test', 'current_password': 'StrongPass-12345',
        }, format='json').status_code, 403)
        self.assertEqual(self.client.get('/api/users/me/').data['email'], 'updated@example.test')

    def test_email_change_rejects_invalid_or_duplicate_addresses(self):
        User.objects.create_user(
            username='taken@example.test', email='taken@example.test', password='AnotherStrongPass-12345',
        )
        duplicate = self.client.post('/api/auth/email/change/', {
            'new_email': 'TAKEN@example.test', 'current_password': 'StrongPass-12345',
        }, format='json')
        self.assertEqual(duplicate.status_code, 400)
        invalid = self.client.post('/api/auth/email/change/', {
            'new_email': 'not an email', 'current_password': 'StrongPass-12345',
        }, format='json')
        self.assertEqual(invalid.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.email, 'admin@example.test')

    def test_direct_email_change_keeps_session_and_uses_new_login_address(self):
        client = APIClient()
        client.force_login(self.user)
        response = client.post('/api/auth/email/change/', {
            'new_email': 'next@example.test', 'current_password': 'StrongPass-12345',
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.get('/api/users/me/').data['email'], 'next@example.test')
        client.post('/api/auth/logout/', format='json')
        self.assertEqual(client.post('/api/auth/login/', {
            'email': 'next@example.test', 'password': 'StrongPass-12345',
        }, format='json').status_code, 200)
