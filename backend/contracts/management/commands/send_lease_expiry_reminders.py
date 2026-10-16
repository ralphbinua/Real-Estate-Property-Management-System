from django.core.management.base import BaseCommand

from contracts.reminders import send_lease_expiry_reminders


class Command(BaseCommand):
    help = 'Send idempotent lease expiry reminders at 60, 30, and 7 days.'

    def handle(self, *args, **options):
        count = send_lease_expiry_reminders()
        self.stdout.write(self.style.SUCCESS(f'Sent {count} lease expiry reminder milestone(s).'))
