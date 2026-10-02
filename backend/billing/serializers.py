from decimal import Decimal
from urllib.parse import urlparse

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import serializers

from contracts.models import Contract
from contracts.serializers import ContractSerializer
from properties.models import Property
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer

from .models import Invoice, Payment


User = get_user_model()


def invoice_payment_summary(invoice):
    cached = getattr(invoice, '_payment_ledger_summary', None)
    if cached is not None:
        return cached

    records = list(invoice.payments.all())
    amount_paid = sum(
        (payment.amount for payment in records if payment.status == Payment.Status.VERIFIED),
        Decimal('0.00'),
    )
    balance_due = max(invoice.total_due - amount_paid, Decimal('0.00'))
    pending_count = sum(payment.status == Payment.Status.PENDING_VERIFICATION for payment in records)

    if invoice.status == 'Cancelled':
        effective_status = 'Cancelled'
    elif balance_due == 0:
        effective_status = 'Paid'
    elif invoice.due_date < timezone.localdate():
        effective_status = 'Overdue'
    elif amount_paid > 0:
        effective_status = 'Partially Paid'
    else:
        effective_status = 'Pending'

    summary = {
        'amount_paid': amount_paid,
        'balance_due': balance_due,
        'pending_count': pending_count,
        'status': effective_status,
    }
    invoice._payment_ledger_summary = summary
    return summary


class InvoiceSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    rentAmount = serializers.DecimalField(source='amount', max_digits=12, decimal_places=2, read_only=True)
    lateFee = serializers.DecimalField(source='late_fee', max_digits=12, decimal_places=2, required=False, default=0.00)
    totalDue = serializers.DecimalField(source='total_due', max_digits=12, decimal_places=2, required=False)
    dueDate = serializers.DateField(source='due_date')
    status = serializers.ChoiceField(choices=Invoice.STATUS_CHOICES, required=False)
    amountPaid = serializers.SerializerMethodField()
    balanceDue = serializers.SerializerMethodField()
    pendingPaymentCount = serializers.SerializerMethodField()
    isArchived = serializers.BooleanField(source='is_deleted', read_only=True)
    paidAt = serializers.DateTimeField(source='paid_at', required=False, allow_null=True, read_only=True)
    paymentMethod = serializers.CharField(source='payment_method', required=False, allow_blank=True, read_only=True)
    receiptUrl = serializers.CharField(source='receipt_url', required=False, allow_blank=True, read_only=True)

    tenant = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.all(), required=False, allow_null=True)
    contract = serializers.PrimaryKeyRelatedField(queryset=Contract.objects.all(), required=False, allow_null=True)

    tenantDetails = UserSerializer(source='tenant', read_only=True)
    propertyDetails = PropertySerializer(source='property', read_only=True)
    contractDetails = ContractSerializer(source='contract', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            '_id', 'contract', 'tenant', 'property', 'amount', 'rentAmount',
            'lateFee', 'totalDue', 'dueDate', 'status', 'amountPaid', 'balanceDue',
            'pendingPaymentCount', 'isArchived', 'paid_at', 'paidAt', 'paymentMethod', 'receiptUrl',
            'remarks', 'tenantDetails', 'propertyDetails', 'contractDetails',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        if request and getattr(request.user, 'role', None) != User.Role.ADMIN:
            for field_name in ('tenant', 'property', 'contract'):
                self.fields[field_name].read_only = True

    def get_amountPaid(self, obj):
        return invoice_payment_summary(obj)['amount_paid']

    def get_balanceDue(self, obj):
        return invoice_payment_summary(obj)['balance_due']

    def get_pendingPaymentCount(self, obj):
        return invoice_payment_summary(obj)['pending_count']

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        representation['status'] = invoice_payment_summary(instance)['status']
        return representation

    def validate(self, attrs):
        request_data = getattr(self.initial_data, 'keys', lambda: [])()
        payment_evidence_fields = {
            'paid_at', 'paidAt', 'payment_method', 'paymentMethod', 'receipt_url', 'receiptUrl',
        }
        attempted_evidence = payment_evidence_fields.intersection(request_data)
        if attempted_evidence:
            raise serializers.ValidationError({
                field: 'Payment details must be submitted through the payment ledger.'
                for field in attempted_evidence
            })

        status_value = attrs.get('status')
        current_status = getattr(self.instance, 'status', None)
        allowed_initial_statuses = ('Pending', 'Overdue')
        if status_value is not None:
            if self.instance is None:
                if status_value not in allowed_initial_statuses:
                    raise serializers.ValidationError({
                        'status': 'New invoices must start as Pending or Overdue.'
                    })
            elif status_value not in ('Cancelled', current_status):
                # The API exposes an effective status derived from the ledger.
                # Allow a client to echo that value while editing other fields,
                # but do not persist it as a manual payment-status change.
                effective_status = invoice_payment_summary(self.instance)['status']
                if status_value != effective_status:
                    raise serializers.ValidationError({
                        'status': 'Use the payment ledger to change payment status. Only invoice cancellation is allowed here.'
                    })
                attrs.pop('status', None)

        if self.instance and self.instance.payments.exists():
            invoice_links = ('contract', 'tenant', 'property')
            changed_links = [
                field for field in invoice_links
                if field in attrs and attrs[field] != getattr(self.instance, field)
            ]
            if changed_links:
                raise serializers.ValidationError({
                    field: 'Invoice ownership and lease links cannot be changed after a payment record exists.'
                    for field in changed_links
                })

        if self.instance and self.instance.payments.filter(
            status__in=(Payment.Status.VERIFIED, Payment.Status.REVERSED),
        ).exists():
            financial_fields = ('amount', 'late_fee', 'total_due')
            changed_fields = [
                field for field in financial_fields
                if field in attrs and attrs[field] != getattr(self.instance, field)
            ]
            if changed_fields:
                raise serializers.ValidationError({
                    field: 'Invoice amounts cannot be changed after a payment record exists.'
                    for field in changed_fields
                })

        contract = attrs.get('contract', getattr(self.instance, 'contract', None))
        tenant = attrs.get('tenant', getattr(self.instance, 'tenant', None))
        property_obj = attrs.get('property', getattr(self.instance, 'property', None))
        if contract and tenant and contract.tenant_id != tenant.id:
            raise serializers.ValidationError({'tenant': 'Invoice tenant must match its lease contract.'})
        if contract and property_obj and contract.property_id != property_obj.id:
            raise serializers.ValidationError({'property': 'Invoice property must match its lease contract.'})
        return attrs

    def create(self, validated_data):
        if 'total_due' not in validated_data:
            amount = validated_data.get('amount', 0)
            late_fee = validated_data.get('late_fee', 0)
            validated_data['total_due'] = amount + late_fee
        return super().create(validated_data)


class PaymentSerializer(serializers.ModelSerializer):
    invoice = serializers.PrimaryKeyRelatedField(queryset=Invoice.objects.filter(is_deleted=False))
    invoiceDetails = serializers.SerializerMethodField()
    paymentDate = serializers.DateField(source='payment_date', required=True, allow_null=True)
    paymentMethod = serializers.ChoiceField(source='payment_method', choices=Invoice.PAYMENT_METHODS)
    referenceNumber = serializers.CharField(source='reference_number', max_length=120, required=False, allow_blank=True)
    receiptUrl = serializers.CharField(source='receipt_url', max_length=500, required=False, allow_blank=True)
    createdBy = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    verifiedBy = serializers.SerializerMethodField()
    verifiedAt = serializers.DateTimeField(source='verified_at', read_only=True)
    rejectedBy = serializers.SerializerMethodField()
    rejectedAt = serializers.DateTimeField(source='rejected_at', read_only=True)
    rejectionReason = serializers.CharField(source='rejection_reason', read_only=True)
    reversedBy = serializers.SerializerMethodField()
    reversedAt = serializers.DateTimeField(source='reversed_at', read_only=True)
    reversalReason = serializers.CharField(source='reversal_reason', read_only=True)
    legacyImport = serializers.BooleanField(source='legacy_import', read_only=True)

    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))

    class Meta:
        model = Payment
        fields = [
            'id', 'invoice', 'invoiceDetails', 'amount', 'paymentDate', 'paymentMethod',
            'referenceNumber', 'receiptUrl', 'remarks', 'status', 'legacyImport',
            'createdBy', 'createdAt', 'verifiedBy', 'verifiedAt', 'rejectedBy',
            'rejectedAt', 'rejectionReason', 'reversedBy', 'reversedAt', 'reversalReason',
        ]
        read_only_fields = ['status']

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            invoices = Invoice.objects.filter(is_deleted=False)
            if user.role == User.Role.PROPERTY_MANAGER:
                invoices = invoices.filter(property__manager=user)
            elif user.role == User.Role.OWNER:
                invoices = invoices.filter(property__owner=user)
            elif user.role == User.Role.TENANT:
                invoices = invoices.filter(tenant=user)
            self.fields['invoice'].queryset = invoices

    def validate(self, attrs):
        request = self.context.get('request')
        if attrs.get('payment_date') is None:
            raise serializers.ValidationError({'paymentDate': 'Enter the date the payment was made.'})
        reference = attrs.get('reference_number', '').strip()
        attrs['reference_number'] = reference
        receipt_url = attrs.get('receipt_url', '').strip()
        if receipt_url:
            parsed_receipt_url = urlparse(receipt_url)
            if parsed_receipt_url.scheme not in ('http', 'https') or not parsed_receipt_url.netloc:
                raise serializers.ValidationError({'receiptUrl': 'Enter a valid http or https receipt link.'})
            attrs['receipt_url'] = receipt_url
        if request and request.user.role == User.Role.TENANT and not reference:
            raise serializers.ValidationError({'referenceNumber': 'Enter the transaction reference number.'})
        return attrs

    def get_invoiceDetails(self, obj):
        invoice = obj.invoice
        summary = invoice_payment_summary(invoice)
        return {
            'id': invoice.pk,
            'property': invoice.property.title,
            'tenant': invoice.tenant.get_full_name() or invoice.tenant.email,
            'tenantEmail': invoice.tenant.email,
            'dueDate': invoice.due_date,
            'totalDue': invoice.total_due,
            'amountPaid': summary['amount_paid'],
            'balanceDue': summary['balance_due'],
            'status': summary['status'],
            'isArchived': invoice.is_deleted,
        }

    def _actor(self, actor):
        if not actor:
            return None
        return {
            'id': actor.pk,
            'name': actor.get_full_name() or actor.email,
            'email': actor.email,
        }

    def get_createdBy(self, obj):
        return self._actor(obj.created_by)

    def get_verifiedBy(self, obj):
        return self._actor(obj.verified_by)

    def get_rejectedBy(self, obj):
        return self._actor(obj.rejected_by)

    def get_reversedBy(self, obj):
        return self._actor(obj.reversed_by)
