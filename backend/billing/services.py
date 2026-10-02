from calendar import monthrange
from datetime import date

from django.db import transaction
from django.utils import timezone

from contracts.models import Contract
from .models import Invoice


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
            created_count += 1

    return created_count
