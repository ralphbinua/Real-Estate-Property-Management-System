from django.db.models import Prefetch

from .models import PropertyApprovalPolicyChange, Unit


def property_serializer_queryset(queryset):
    """Load the related records read by PropertySerializer in batches."""
    return queryset.select_related(
        'owner',
        'manager',
        'lease_signing_authorization',
        'lease_termination_authorization',
        'unit_pricing_authorization',
    ).prefetch_related(
        'assigned_agents',
        Prefetch('units', queryset=Unit.objects.select_related('tenant')),
        Prefetch(
            'approval_policy_changes',
            queryset=PropertyApprovalPolicyChange.objects.select_related('changed_by'),
            to_attr='prefetched_approval_policy_changes',
        ),
    )
