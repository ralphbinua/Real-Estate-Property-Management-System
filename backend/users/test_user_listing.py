from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from properties.models import Property, PropertyInquiry, RentalApplication


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

    def test_user_directory_search_matches_role_names(self):
        admin = User.objects.create_user(
            username='site-admin@example.test',
            email='site-admin@example.test',
            password='StrongPass-12345',
            first_name='Site',
            last_name='Administrator',
            role=User.Role.ADMIN,
        )
        manager = User.objects.create_user(
            username='staff@example.test',
            email='staff@example.test',
            password='StrongPass-12345',
            first_name='Casey',
            last_name='Staff',
            role=User.Role.PROPERTY_MANAGER,
        )
        User.objects.create_user(
            username='agent@example.test',
            email='agent@example.test',
            password='StrongPass-12345',
            role=User.Role.AGENT,
        )

        response = self.client.get('/api/users/', {
            'roles': 'admin,property manager,agent,owner',
            'search': 'admin',
            'page': 1,
            'page_size': 50,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual({row['_id'] for row in response.data['results']}, {admin.id, self.admin.id})

        manager_response = self.client.get('/api/users/', {
            'roles': 'admin,property manager,agent,owner',
            'search': 'property manager',
            'page': 1,
            'page_size': 50,
        })
        self.assertEqual(manager_response.status_code, 200)
        self.assertEqual(manager_response.data['count'], 1)
        self.assertEqual(manager_response.data['results'][0]['_id'], manager.id)


class ManagerTenantDirectoryScopeTests(TestCase):
    def setUp(self):
        self.manager = User.objects.create_user(
            username='manager@example.test',
            email='manager@example.test',
            password='StrongPass-12345',
            role=User.Role.PROPERTY_MANAGER,
        )
        self.owner = User.objects.create_user(
            username='owner@example.test',
            email='owner@example.test',
            password='StrongPass-12345',
            role=User.Role.OWNER,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.manager)

    def test_manager_sees_only_tenants_connected_to_assigned_properties(self):
        approved_tenant = User.objects.create_user(
            username='approved@example.test',
            email='approved@example.test',
            password='StrongPass-12345',
            role=User.Role.TENANT,
            first_name='Approved',
        )
        unrelated_tenant = User.objects.create_user(
            username='unrelated@example.test',
            email='unrelated@example.test',
            password='StrongPass-12345',
            role=User.Role.TENANT,
            first_name='Unrelated',
        )
        prop = Property.objects.create(
            title='Assigned property',
            address='1 Main Street',
            property_type='Apartment',
            owner=self.owner,
            manager=self.manager,
        )
        inquiry = PropertyInquiry.objects.create(
            property=prop,
            prospect_name='Approved applicant',
            prospect_email=approved_tenant.email,
        )
        RentalApplication.objects.create(
            inquiry=inquiry,
            applicant_email=approved_tenant.email.upper(),
            status='Approved',
        )

        response = self.client.get('/api/users/tenants/')

        self.assertEqual(response.status_code, 200)
        returned_ids = {tenant['_id'] for tenant in response.data}
        self.assertIn(approved_tenant.id, returned_ids)
        self.assertNotIn(unrelated_tenant.id, returned_ids)
