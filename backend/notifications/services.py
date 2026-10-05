from collections.abc import Iterable

from .models import Notification


def create_for_recipients(
    *,
    recipients: Iterable,
    actor=None,
    event_type: str,
    title: str,
    message: str,
    destination: str,
) -> int:
    """Create one notification per active, distinct recipient other than the actor.

    Call this from inside the transaction that commits the related business event.
    Recipient selection belongs to the caller, which has the record relationships
    needed to enforce the role and assignment rules.
    """
    valid_event_types = {value for value, _ in Notification.EventType.choices}
    valid_destinations = {value for value, _ in Notification.Destination.choices}
    if event_type not in valid_event_types:
        raise ValueError(f'Unsupported notification event type: {event_type}')
    if destination not in valid_destinations:
        raise ValueError(f'Unsupported notification destination: {destination}')

    actor_id = getattr(actor, 'pk', None)
    notifications = []
    seen_recipient_ids = set()

    for recipient in recipients:
        recipient_id = getattr(recipient, 'pk', None)
        if (
            recipient_id is None
            or recipient_id in seen_recipient_ids
            or recipient_id == actor_id
            or not recipient.is_active
            or recipient.is_deleted
        ):
            continue

        seen_recipient_ids.add(recipient_id)
        notifications.append(Notification(
            recipient=recipient,
            event_type=event_type,
            title=title.strip()[:160],
            message=message.strip()[:280],
            destination=destination,
        ))

    if not notifications:
        return 0

    Notification.objects.bulk_create(notifications)
    return len(notifications)
