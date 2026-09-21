from rest_framework import serializers
from .models import Invoice
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from contracts.serializers import ContractSerializer
from properties.models import Property
from contracts.models import Contract
from django.contrib.auth import get_user_model

User = get_user_model()

class InvoiceSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    lateFee = serializers.DecimalField(source='late_fee', max_digits=12, decimal_places=2, required=False, default=0.00)
    totalDue = serializers.DecimalField(source='total_due', max_digits=12, decimal_places=2, required=False)
    dueDate = serializers.DateField(source='due_date')
    paymentMethod = serializers.CharField(source='payment_method', required=False, default='N/A')
    receiptUrl = serializers.CharField(source='receipt_url', required=False, allow_blank=True, default='')

    tenant = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.all(), required=False)
    contract = serializers.PrimaryKeyRelatedField(queryset=Contract.objects.all(), required=False)

    tenantDetails = UserSerializer(source='tenant', read_only=True)
    propertyDetails = PropertySerializer(source='property', read_only=True)
    contractDetails = ContractSerializer(source='contract', read_only=True)

    class Meta:
        model = Invoice
        fields = [
            '_id', 'contract', 'tenant', 'property', 'amount', 'lateFee', 
            'totalDue', 'dueDate', 'status', 'paid_at', 'paymentMethod', 
            'receiptUrl', 'remarks', 'tenantDetails', 'propertyDetails', 'contractDetails'
        ]

    def create(self, validated_data):
        if 'total_due' not in validated_data:
            amount = validated_data.get('amount', 0)
            late_fee = validated_data.get('late_fee', 0)
            validated_data['total_due'] = amount + late_fee
        return super().create(validated_data)
