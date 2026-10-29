from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from notifications.models import Notification
from notifications.services import create_for_recipients
from properties.models import Property, Unit
from users.audit import record_activity
from .models import Contract, LeaseRenewal


class RenewalProposalInput(serializers.Serializer):
    endDate = serializers.DateField()
    rentAmount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal('0.01'))


def renewal_data(renewal):
    if renewal is None:
        return None
    return {
        'id': renewal.pk,
        'version': renewal.version,
        'status': renewal.status,
        'startDate': renewal.proposed_start_date.isoformat(),
        'endDate': renewal.proposed_end_date.isoformat(),
        'rentAmount': str(renewal.proposed_rent),
        'initiatedAt': renewal.initiated_at.isoformat(),
        'decidedAt': renewal.decided_at.isoformat() if renewal.decided_at else None,
        'decisionNote': renewal.decision_note,
        'successorId': renewal.successor_id,
    }


def notify_renewal(renewal, *, title, message):
    contract = renewal.contract
    property_obj = contract.property
    for recipient, destination in (
        (property_obj.owner, Notification.Destination.OWNER_CONTRACTS),
        (property_obj.manager, Notification.Destination.MANAGER_CONTRACTS),
        (contract.tenant, Notification.Destination.TENANT_LEASE),
    ):
        if recipient:
            create_for_recipients(
                recipients=[recipient], actor=None, event_type=Notification.EventType.LEASE,
                title=title, message=message, destination=destination,
            )


@transaction.atomic
def propose_renewal(contract, actor, *, end_date, rent_amount):
    contract = Contract.objects.select_for_update().select_related('property').get(pk=contract.pk)
    if contract.status != 'Active' or contract.is_deleted or contract.end_date < timezone.localdate():
        raise ValidationError({'detail': 'Only an active, unexpired lease can be renewed.'})
    if actor.role == 'Owner':
        allowed = contract.property.owner_id == actor.pk
    elif actor.role == 'Property Manager':
        allowed = contract.property.manager_id == actor.pk
    else:
        allowed = False
    if not allowed:
        raise ValidationError({'detail': 'Only this property Owner or assigned Manager may propose a renewal.'})
    start_date = contract.end_date + timedelta(days=1)
    if end_date <= start_date:
        raise ValidationError({'endDate': 'The new lease must end after its start date.'})
    previous = LeaseRenewal.objects.select_for_update().filter(contract=contract).order_by('-version', '-pk').first()
    if previous and previous.status != LeaseRenewal.Status.DECLINED:
        raise ValidationError({'detail': 'A renewal proposal is already active or has been prepared.'})
    renewal = LeaseRenewal.objects.create(
        contract=contract, version=(previous.version + 1 if previous else 1),
        initiated_by=actor, proposed_start_date=start_date,
        proposed_end_date=end_date, proposed_rent=rent_amount,
        status=LeaseRenewal.Status.APPROVED if actor.role == 'Owner' else LeaseRenewal.Status.PROPOSED,
        decided_by=actor if actor.role == 'Owner' else None,
        decided_at=timezone.now() if actor.role == 'Owner' else None,
    )
    record_activity(actor, 'CREATE', 'Lease renewal', renewal.pk, f'Proposed renewal for lease {contract.pk}.')
    notify_renewal(renewal, title='Lease renewal proposed', message='Review the proposed next lease term.')
    return renewal


@transaction.atomic
def decide_renewal(contract, actor, *, approve, note=''):
    renewal = LeaseRenewal.objects.select_for_update().select_related('contract__property', 'contract__tenant').filter(contract=contract).order_by('-version', '-pk').first()
    if renewal is None:
        raise ValidationError({'detail': 'This lease has no renewal proposal.'})
    if actor.role != 'Owner' or renewal.contract.property.owner_id != actor.pk:
        raise ValidationError({'detail': 'Only the property Owner may decide this renewal proposal.'})
    if renewal.status != LeaseRenewal.Status.PROPOSED:
        raise ValidationError({'detail': 'Only a proposed renewal can be decided.'})
    renewal.status = LeaseRenewal.Status.APPROVED if approve else LeaseRenewal.Status.DECLINED
    renewal.decided_by = actor
    renewal.decided_at = timezone.now()
    renewal.decision_note = note[:2000]
    renewal.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_note'])
    record_activity(actor, 'UPDATE', 'Lease renewal', renewal.pk, f'{renewal.status} renewal for lease {contract.pk}.')
    notify_renewal(renewal, title=f'Lease renewal {renewal.status.lower()}', message='A decision was recorded on the proposed lease term.')
    return renewal


@transaction.atomic
def prepare_renewal(contract, actor):
    renewal = LeaseRenewal.objects.select_for_update().select_related('contract__property', 'contract__tenant').filter(contract=contract).order_by('-version', '-pk').first()
    if renewal is None:
        raise ValidationError({'detail': 'This lease has no renewal proposal.'})
    old = Contract.objects.select_for_update().get(pk=contract.pk)
    if renewal.status != LeaseRenewal.Status.APPROVED:
        raise ValidationError({'detail': 'The Owner must approve the renewal first.'})
    if actor.role == 'Owner':
        allowed = old.property.owner_id == actor.pk
    elif actor.role == 'Property Manager':
        allowed = old.property.manager_id == actor.pk
    else:
        allowed = False
    if not allowed:
        raise ValidationError({'detail': 'Only this property Owner or assigned Manager may prepare the next lease.'})
    if timezone.localdate() <= old.end_date:
        raise ValidationError({'detail': 'Prepare the successor after the current lease ends.'})
    if old.status != 'Active' or old.is_deleted:
        raise ValidationError({'detail': 'The original lease must still be active.'})
    property_obj = Property.objects.select_for_update().get(pk=old.property_id)
    unit = Unit.objects.select_for_update().get(pk=old.unit_id) if old.unit_id else None
    competing = Contract.objects.filter(
        property=property_obj, unit=unit, status__in=['Active', 'Pending'], is_deleted=False,
    ).exclude(pk=old.pk).exists()
    if competing:
        raise ValidationError({'detail': 'Another lease already holds this home.'})
    old.status = 'Expired'
    old.save(update_fields=['status'])
    successor = Contract.objects.create(
        property=property_obj, unit=unit, tenant=old.tenant,
        start_date=renewal.proposed_start_date, end_date=renewal.proposed_end_date,
        rent_amount=renewal.proposed_rent, rent_due_day=old.rent_due_day,
        deposit_amount=old.deposit_amount, status='Pending',
        manual_lease_reason=f'Renewal of lease #{old.pk}',
        manual_lease_reference=f'Lease renewal #{renewal.pk}',
    )
    if unit:
        unit.status = 'Reserved'
        unit.tenant = None
        unit.save(update_fields=['status', 'tenant'])
    else:
        property_obj.status = 'Pending'
        property_obj.save(update_fields=['status'])
    renewal.status = LeaseRenewal.Status.PREPARED
    renewal.successor = successor
    renewal.save(update_fields=['status', 'successor'])
    record_activity(actor, 'CREATE', 'Contract', successor.pk, f'Prepared successor for lease {old.pk}.')
    notify_renewal(renewal, title='Renewal lease prepared', message='The next lease is ready for signing outside the system.')
    return renewal
