from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


User = get_user_model()


class UserListingTests(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username='admin@example.test',
            email='admin@example.test',
            password='StrongPass-12345',
            role=User.Role.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_user_directory_accepts_lowercase_role_filters(self):
        staff_roles = [User.Role.PROPERTY_MANAGER, User.Role.AGENT, User.Role.OWNER]
        for index, role in enumerate(staff_roles):
            User.objects.create_user(
                username=f'{role.replace(" ", "-").lower()}-{index}@example.test',
                email=f'{role.replace(" ", "-").lower()}-{index}@example.test',
                password='StrongPass-12345',
                role=role,
            )
        User.objects.create_user(
            username='tenant@example.test',
            email='tenant@example.test',
            password='StrongPass-12345',
            role=User.Role.TENANT,
        )

        staff = self.client.get('/api/users/', {
            'roles': 'admin,property manager,agent,owner',
            'page': 1,
            'page_size': 50,
        })
        tenants = self.client.get('/api/users/', {
            'roles': 'tenant',
            'page': 1,
            'page_size': 50,
        })

        self.assertEqual(staff.status_code, 200)
        self.assertEqual(staff.data['count'], 4)
        self.assertEqual(tenants.status_code, 200)
        self.assertEqual(tenants.data['count'], 1)
