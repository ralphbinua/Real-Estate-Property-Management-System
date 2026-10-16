from django.db import IntegrityError, transaction
from django.utils import timezone

from notifications.models import Notification
from notifications.services import create_for_recipients
from .models import Contract, LeaseExpiryReminder


MILESTONES = (60, 30, 7)


def send_lease_expiry_reminders(*, today=None):
    today = today or timezone.localdate()
    sent = 0
    contracts = Contract.objects.filter(status='Active', is_deleted=False, property__is_deleted=False).select_related(
        'property__owner', 'property__manager', 'tenant',
    )
    for contract in contracts:
        remaining = (contract.end_date - today).days
        milestones = [days for days in MILESTONES if 0 <= remaining <= days]
        if not milestones:
            continue
        days_before = min(milestones)
        try:
            with transaction.atomic():
                _, created = LeaseExpiryReminder.objects.get_or_create(contract=contract, days_before=days_before)
                if not created:
                    continue
                for recipient, destination in (
                    (contract.property.owner, Notification.Destination.OWNER_CONTRACTS),
                    (contract.property.manager, Notification.Destination.MANAGER_CONTRACTS),
                    (contract.tenant, Notification.Destination.TENANT_LEASE),
                ):
                    if recipient:
                        create_for_recipients(
                            recipients=[recipient], actor=None, event_type=Notification.EventType.LEASE,
                            title='Lease ending soon',
                            message=f'The lease ends on {contract.end_date:%Y-%m-%d}. Review its renewal or move-out plan.',
                            destination=destination,
                        )
                sent += 1
        except IntegrityError:
            continue  # Another invocation already sent this milestone.
    return sent
