from decimal import Decimal

from django.db.models import Case, CharField, DecimalField, F, OuterRef, Prefetch, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce
from django.utils import timezone

from contracts.models import Contract
from properties.models import Property
from properties.querysets import property_serializer_queryset
from .models import Payment


def with_effective_invoice_status(queryset, today=None):
    """Mirror the serialized ledger/date status in SQL for filters and counts."""
    money_field = DecimalField(max_digits=14, decimal_places=2)
    verified = Payment.objects.filter(
        invoice_id=OuterRef('pk'), status=Payment.Status.VERIFIED,
    ).order_by().values('invoice_id').annotate(total=Sum('amount')).values('total')[:1]
    return queryset.annotate(
        _verified_payment_total=Coalesce(
            Subquery(verified, output_field=money_field), Value(Decimal('0.00')), output_field=money_field,
        ),
    ).annotate(
        _effective_invoice_status=Case(
            When(status='Cancelled', then=Value('Cancelled')),
            When(total_due__lte=F('_verified_payment_total'), then=Value('Paid')),
            When(due_date__lt=today or timezone.localdate(), then=Value('Overdue')),
            When(_verified_payment_total__gt=0, then=Value('Partially Paid')),
            default=Value('Pending'), output_field=CharField(max_length=20),
        ),
    )


def invoice_serializer_queryset(queryset):
    """Load the ledger and nested property/lease data used by InvoiceSerializer."""
    contract_queryset = Contract.objects.select_related(
        'tenant', 'unit', 'unit__tenant', 'activated_by', 'terminated_by',
    ).prefetch_related(
        Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
    )
    return queryset.select_related('tenant').prefetch_related(
        'payments',
        Prefetch('property', queryset=property_serializer_queryset(Property.objects.all())),
        Prefetch('contract', queryset=contract_queryset),
    )
