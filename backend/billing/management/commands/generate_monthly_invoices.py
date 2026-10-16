from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from users.audit import record_activity
from billing.services import run_monthly_billing


class Command(BaseCommand):
    help = 'Generate monthly rent invoices for active leases.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--month',
            help='Billing month in YYYY-MM format. Defaults to the current month.',
        )

    def handle(self, *args, **options):
        month = options['month']
        if month:
            try:
                period = datetime.strptime(month, '%Y-%m').date().replace(day=1)
            except ValueError as error:
                raise CommandError('--month must use YYYY-MM format, such as 2026-10.') from error
        else:
            period = timezone.localdate().replace(day=1)

        run = run_monthly_billing(period=period, trigger='Scheduled')
        generated_count = run.created_count
        record_activity(
            None,
            'GENERATE',
            'Invoices',
            '',
            f'Generated {generated_count} monthly rent invoices for {period:%Y-%m}.',
        )
        self.stdout.write(self.style.SUCCESS(
            f'Generated {generated_count} monthly rent invoices for {period:%Y-%m}.'
        ))
