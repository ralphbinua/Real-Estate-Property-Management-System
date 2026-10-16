from calendar import monthrange
from datetime import date

from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone

from contracts.models import Contract
from notifications.models import Notification
from notifications.services import create_for_recipients
from .models import BillingRun, Invoice


def generate_monthly_invoices(period=None, contract_queryset=None):
    """Create one rent invoice per eligible active lease for the given month.

    ``period`` is any date in the billing month. A lease is invoiced only when
    its configured rent due date falls inside the lease term. Locking each
    lease and checking again inside the transaction makes repeated and
    concurrent runs safe on the production database.
    """
    period = period or timezone.localdate()
    billing_month = date(period.year, period.month, 1)
    today = timezone.localdate()
    contracts = contract_queryset if contract_queryset is not None else Contract.objects.all()
    eligible_contracts = contracts.filter(
        status='Active',
        is_deleted=False,
        property__is_deleted=False,
    )
    contract_ids = list(eligible_contracts.values_list('pk', flat=True).distinct())

    created_count = 0
    for contract_id in contract_ids:
        with transaction.atomic():
            contract = eligible_contracts.select_for_update().select_related(
                'property', 'tenant'
            ).filter(
                pk=contract_id,
            ).first()
            if contract is None:
                continue

            due_date = date(
                billing_month.year,
                billing_month.month,
                max(1, min(
                    contract.rent_due_day,
                    monthrange(billing_month.year, billing_month.month)[1],
                )),
            )
            if not contract.start_date <= due_date <= contract.end_date:
                continue

            already_generated = Invoice.objects.filter(
                contract_id=contract.pk,
                due_date__year=billing_month.year,
                due_date__month=billing_month.month,
                is_deleted=False,
            ).exists()
            if already_generated:
                continue

            Invoice.objects.create(
                contract=contract,
                tenant=contract.tenant,
                property=contract.property,
                amount=contract.rent_amount,
                total_due=contract.rent_amount,
                due_date=due_date,
                status='Overdue' if due_date < today else 'Pending',
            )
            create_for_recipients(
                recipients=[contract.tenant],
                actor=None,
                event_type=Notification.EventType.INVOICE,
                title='New rent invoice',
                message='A new rent invoice is available in your payments.',
                destination=Notification.Destination.TENANT_PAYMENTS,
            )
            created_count += 1

    return created_count


def run_monthly_billing(*, period=None, trigger, actor=None, contract_queryset=None):
    """Persist the outcome of a manual or scheduled billing attempt."""
    period = period or timezone.localdate()
    month = date(period.year, period.month, 1)
    run = BillingRun.objects.create(month=month, trigger=trigger, actor=actor)
    try:
        run.created_count = generate_monthly_invoices(period=month, contract_queryset=contract_queryset)
    except Exception as error:
        run.status = 'Failed'
        run.error_summary = str(error)[:500]
        run.finished_at = timezone.now()
        run.save(update_fields=['status', 'error_summary', 'finished_at'])
        try:
            admins = get_user_model().objects.filter(role='Admin', is_active=True, is_deleted=False)
            create_for_recipients(
                recipients=admins,
                actor=None,
                event_type=Notification.EventType.INVOICE,
                title='Monthly billing failed',
                message=f'The {month:%Y-%m} billing run failed. Review billing run history.',
                destination=Notification.Destination.ADMIN_OVERVIEW,
            )
        except Exception:
            pass  # Preserve the billing failure even when notification delivery also fails.
        raise
    run.status = 'Succeeded'
    run.finished_at = timezone.now()
    run.save(update_fields=['status', 'created_count', 'finished_at'])
    return run
