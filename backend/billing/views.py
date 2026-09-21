from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from datetime import timedelta
from .models import Invoice
from .serializers import InvoiceSerializer
from contracts.models import Contract

class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.filter(is_deleted=False).order_by('-id')
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = Invoice.objects.filter(is_deleted=False).order_by('-id')
        tenant_id = self.request.query_params.get('tenantId')
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)
        return qs

    @action(detail=False, methods=['get'])
    def tenant(self, request):
        tenant_id = request.query_params.get('tenantId')
        if not tenant_id and hasattr(request.user, 'id'):
            tenant_id = request.user.id
        invoices = Invoice.objects.filter(tenant_id=tenant_id, is_deleted=False).order_by('-id')
        serializer = self.get_serializer(invoices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        active_contracts = Contract.objects.filter(status='Active', is_deleted=False)
        created_count = 0
        today = timezone.now().date()
        due_date = today + timedelta(days=30)

        for contract in active_contracts:
            # Avoid duplicate pending invoices for the same contract in the current month
            existing = Invoice.objects.filter(
                contract=contract, 
                status__in=['Pending', 'Pending Verification'], 
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

        return Response({
            "message": f"Generated {created_count} new monthly rent invoices.",
            "generatedCount": created_count
        })

    @action(detail=True, methods=['put', 'patch'], url_path='submit-payment')
    def submit_payment(self, request, pk=None):
        invoice = self.get_object()
        payment_method = request.data.get('paymentMethod', 'Bank Transfer')
        remarks = request.data.get('remarks', '')
        receipt_url = request.data.get('receiptUrl', '')

        invoice.status = 'Pending Verification'
        invoice.payment_method = payment_method
        invoice.remarks = remarks
        if receipt_url:
            invoice.receipt_url = receipt_url
        invoice.save()

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