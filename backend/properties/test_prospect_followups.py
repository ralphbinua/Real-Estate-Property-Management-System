from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from .models import Property, PropertyInquiry


User = get_user_model()


@override_settings(SECURE_SSL_REDIRECT=False)
class ProspectFollowUpApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.agent = User.objects.create_user(
            username='followup-agent', email='followup-agent@example.test', role=User.Role.AGENT,
        )
        cls.other_agent = User.objects.create_user(
            username='other-followup-agent', email='other-followup-agent@example.test', role=User.Role.AGENT,
        )
        cls.property = Property.objects.create(
            title='Follow-up Home', address='1 Test Lane', property_type='Apartment', status='Available',
        )
        cls.property.assigned_agents.add(cls.agent)

    def make_inquiry(self, name, follow_up=None):
        return PropertyInquiry.objects.create(
            property=self.property,
            agent=self.agent,
            prospect_name=name,
            next_follow_up_at=follow_up,
        )

    def setUp(self):
        self.client.force_authenticate(self.agent)

    def test_agent_can_log_activity_and_schedule_a_follow_up(self):
        inquiry = self.make_inquiry('Prospect One')
        follow_up = timezone.now() + timedelta(days=1)

        response = self.client.post(
            f'/api/properties/inquiries/{inquiry.pk}/activities/',
            {
                'activity_type': 'Call',
                'summary': 'Discussed the available unit and left the brochure.',
                'next_follow_up_at': follow_up.isoformat(),
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, getattr(response, 'data', response.content))
        inquiry.refresh_from_db()
        self.assertAlmostEqual(inquiry.next_follow_up_at.timestamp(), follow_up.timestamp(), delta=1)
        self.assertEqual(response.data['activity_type'], 'Call')
        self.assertEqual(response.data['summary'], 'Discussed the available unit and left the brochure.')
        self.assertEqual(response.data['actor_name'], self.agent.get_full_name() or self.agent.email)
        history = self.client.get(f'/api/properties/inquiries/{inquiry.pk}/activities/')
        self.assertEqual(history.status_code, 200)
        self.assertEqual(len(history.data), 1)
        self.assertEqual(history.data[0]['activity_type'], 'Call')

    def test_logging_without_a_follow_up_change_keeps_existing_schedule(self):
        existing_follow_up = timezone.now() + timedelta(days=2)
        inquiry = self.make_inquiry('Prospect Two', existing_follow_up)

        response = self.client.post(
            f'/api/properties/inquiries/{inquiry.pk}/activities/',
            {'activity_type': 'Email', 'summary': 'Sent the requested floor plan.'},
            format='json',
        )

        self.assertEqual(response.status_code, 201, getattr(response, 'data', response.content))
        inquiry.refresh_from_db()
        self.assertEqual(inquiry.next_follow_up_at, existing_follow_up)

    def test_agent_can_clear_a_follow_up_explicitly(self):
        inquiry = self.make_inquiry('Prospect Three', timezone.now() + timedelta(days=1))

        response = self.client.post(
            f'/api/properties/inquiries/{inquiry.pk}/activities/',
            {
                'activity_type': 'Follow-up',
                'summary': 'No further follow-up is needed.',
                'next_follow_up_at': None,
            },
            format='json',
        )

        self.assertEqual(response.status_code, 201, getattr(response, 'data', response.content))
        inquiry.refresh_from_db()
        self.assertIsNone(inquiry.next_follow_up_at)

    def test_follow_up_filters_return_only_matching_inquiries(self):
        now = timezone.now()
        overdue = self.make_inquiry('Overdue prospect', now - timedelta(minutes=1))
        upcoming = self.make_inquiry('Upcoming prospect', now + timedelta(days=1))
        unscheduled = self.make_inquiry('Unscheduled prospect')

        expected_by_filter = {
            'due': {overdue.pk},
            'upcoming': {upcoming.pk},
            'unscheduled': {unscheduled.pk},
        }
        for follow_up_filter, expected_ids in expected_by_filter.items():
            with self.subTest(follow_up_filter=follow_up_filter):
                response = self.client.get('/api/properties/inquiries/', {'follow_up': follow_up_filter})
                self.assertEqual(response.status_code, 200)
                self.assertEqual({row['id'] for row in response.data}, expected_ids)

    def test_due_queue_omits_closed_and_converted_prospects(self):
        now = timezone.now()
        active = self.make_inquiry('Active overdue prospect', now - timedelta(minutes=1))
        closed = self.make_inquiry('Closed prospect', now - timedelta(minutes=2))
        converted = self.make_inquiry('Converted prospect', now - timedelta(minutes=3))
        closed.status = 'Closed'
        closed.save(update_fields=['status'])
        converted.status = 'Converted'
        converted.save(update_fields=['status'])

        response = self.client.get('/api/properties/inquiries/', {'follow_up': 'due'})

        self.assertEqual(response.status_code, 200)
        self.assertEqual({row['id'] for row in response.data}, {active.pk})

    def test_agent_cannot_read_or_log_activity_for_another_agents_prospect(self):
        inquiry = self.make_inquiry('Private prospect')
        self.client.force_authenticate(self.other_agent)

        read_response = self.client.get(f'/api/properties/inquiries/{inquiry.pk}/activities/')
        write_response = self.client.post(
            f'/api/properties/inquiries/{inquiry.pk}/activities/',
            {'activity_type': 'Call', 'summary': 'Unauthorized contact log.'},
            format='json',
        )

        self.assertEqual(read_response.status_code, 404)
        self.assertEqual(write_response.status_code, 404)
