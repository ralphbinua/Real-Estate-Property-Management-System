from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from .models import Invoice
from .serializers import InvoiceSerializer
from contracts.models import Contract
from users.audit import record_activity


class IsAdminOrPropertyManager(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted
                    and user.role in ('Admin', 'Property Manager'))

class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.filter(is_deleted=False).order_by('-id')
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = Invoice.objects.filter(is_deleted=False)
        if user.role == 'Admin':
            pass
        elif user.role == 'Property Manager':
            qs = qs.filter(property__manager=user)
        elif user.role == 'Owner':
            qs = qs.filter(property__owner=user)
        elif user.role == 'Tenant':
            qs = qs.filter(tenant=user)
        else:
            return qs.none()

        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id and user.role in ('Admin', 'Property Manager'):
            qs = qs.filter(tenant_id=tenant_id)
        return qs.order_by('-id')

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy'):
            return [IsAdmin()]
        if self.action in ('generate', 'record_payment'):
            return [IsAdminOrPropertyManager()]
        if self.action == 'submit_payment':
            return [IsTenant()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'])
    def tenant(self, request):
        if request.user.role == 'Tenant':
            tenant_id = request.user.id
        elif request.user.role in ('Admin', 'Property Manager'):
            tenant_id = request.query_params.get('tenantId')
            if not tenant_id:
                return Response({'detail': 'tenantId is required.'}, status=400)
        else:
            return Response({'detail': 'You may not view tenant invoices.'}, status=403)
        invoices = Invoice.objects.filter(tenant_id=tenant_id, is_deleted=False).order_by('-id')
        if request.user.role == 'Property Manager':
            invoices = invoices.filter(property__manager=request.user)
        serializer = self.get_serializer(invoices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='run-monthly-billing')
    def generate(self, request):
        active_contracts = Contract.objects.filter(status='Active', is_deleted=False)
        if request.user.role == 'Property Manager':
            active_contracts = active_contracts.filter(property__manager=request.user)
        created_count = 0
        today = timezone.now().date()
        due_date = today + timedelta(days=30)

        for contract in active_contracts:
            # Avoid duplicate pending invoices for the same contract in the current month
            existing = Invoice.objects.filter(
                contract=contract, 
                due_date__year=due_date.year,
                due_date__month=due_date.month,
                is_deleted=False
            ).exists()
            if not existing:
                Invoice.objects.create(
                    contract=contract,
                    tenant=contract.tenant,
                    property=contract.property,
                    amount=contract.rent_amount,
                    total_due=contract.rent_amount,
                    due_date=due_date,
                    status='Pending'
                )
                created_count += 1

        record_activity(request.user, 'GENERATE', 'Invoices', '', f'Generated {created_count} monthly rent invoices.')
        return Response({
            "message": f"Generated {created_count} new monthly rent invoices.",
            "generatedCount": created_count
        })

    @action(detail=True, methods=['put', 'patch'], url_path='record-payment')
    def record_payment(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status in ('Paid', 'Cancelled'):
            return Response({'detail': 'This invoice can no longer accept a payment record.'}, status=400)
        payment_method = request.data.get('paymentMethod') or request.data.get('payment_method', 'Cash')
        remarks = request.data.get('remarks', '')
        receipt_url = request.data.get('receiptUrl') or request.data.get('receipt_url', '')

        invoice.status = 'Paid'
        invoice.paid_at = timezone.now()
        if payment_method:
            invoice.payment_method = payment_method
        if remarks:
            invoice.remarks = remarks
        if receipt_url:
            invoice.receipt_url = receipt_url
        invoice.save()
        record_activity(request.user, 'RECORD PAYMENT', 'Invoice', invoice.pk, f'Recorded payment for invoice {invoice.pk}.')

        serializer = self.get_serializer(invoice)
        return Response(serializer.data)

    @action(detail=True, methods=['put', 'patch'], url_path='submit-payment')
    def submit_payment(self, request, pk=None):
        invoice = self.get_object()
        if invoice.tenant_id != request.user.id:
            return Response({'detail': 'You may only submit payment for your own invoice.'}, status=403)
        if invoice.status in ('Paid', 'Cancelled'):
            return Response({'detail': 'This invoice can no longer accept a payment submission.'}, status=400)
        payment_method = request.data.get('paymentMethod') or request.data.get('payment_method', 'Bank Transfer')
        remarks = request.data.get('remarks', '')
        receipt_url = request.data.get('receiptUrl') or request.data.get('receipt_url', '')

        invoice.status = 'Pending Verification'
        invoice.payment_method = payment_method
        invoice.remarks = remarks
        if receipt_url:
            invoice.receipt_url = receipt_url
        invoice.save()
        record_activity(request.user, 'SUBMIT PAYMENT', 'Invoice', invoice.pk, f'Tenant submitted payment details for invoice {invoice.pk}.')

        return Response({"message": "Payment details submitted for verification."})

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()

        new_status = request.data.get('status')
        if new_status == 'Paid' and instance.status != 'Paid':
            instance.paid_at = timezone.now()

        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def perform_destroy(self, instance):
        instance.is_deleted = True
        instance.save(update_fields=['is_deleted'])
        record_activity(self.request.user, 'ARCHIVE', 'Invoice', instance.pk, f'Archived invoice {instance.pk}.')

    def perform_create(self, serializer):
        invoice = serializer.save()
        record_activity(self.request.user, 'CREATE', 'Invoice', invoice.pk, f'Created invoice {invoice.pk}.')

    def perform_update(self, serializer):
        invoice = serializer.save()
        record_activity(self.request.user, 'UPDATE', 'Invoice', invoice.pk, f'Updated invoice {invoice.pk}.')


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted and user.role == 'Admin')


class IsTenant(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_active and not user.is_deleted and user.role == 'Tenant')
