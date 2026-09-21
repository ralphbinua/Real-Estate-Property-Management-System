from rest_framework import serializers
from .models import Contract
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer

class ContractSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    startDate = serializers.DateField(source='start_date')
    endDate = serializers.DateField(source='end_date')
    rentAmount = serializers.DecimalField(source='rent_amount', max_digits=10, decimal_places=2)
    depositAmount = serializers.DecimalField(source='deposit_amount', max_digits=10, decimal_places=2)
    
    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = Contract
        fields = [
            '_id', 'property', 'unit', 'tenant', 'startDate', 'endDate', 
            'rentAmount', 'depositAmount', 'status', 'propertyDetails', 'tenantDetails'
        ]