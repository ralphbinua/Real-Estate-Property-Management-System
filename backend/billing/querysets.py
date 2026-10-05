from django.db.models import Prefetch

from contracts.models import Contract
from properties.models import Property
from properties.querysets import property_serializer_queryset


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
