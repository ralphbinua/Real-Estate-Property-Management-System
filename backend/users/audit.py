from .models import AuditEvent


def record_activity(actor, action, entity_type, entity_id, summary):
    AuditEvent.objects.create(
        actor=actor if getattr(actor, 'is_authenticated', False) else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id or ''),
        summary=summary[:500],
    )
