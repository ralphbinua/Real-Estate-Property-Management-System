from rest_framework import serializers
from .models import Contract
from properties.models import Property, Unit
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class ContractSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    startDate = serializers.DateField(source='start_date')
    endDate = serializers.DateField(source='end_date')
    rentAmount = serializers.DecimalField(source='rent_amount', max_digits=10, decimal_places=2)
    depositAmount = serializers.DecimalField(source='deposit_amount', max_digits=10, decimal_places=2, required=False, default=0.00)
    
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.all())
    tenant = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), required=False, allow_null=True, default=None)

    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = Contract
        fields = [
            '_id', 'property', 'unit', 'tenant', 'startDate', 'endDate', 
            'rentAmount', 'depositAmount', 'status', 'propertyDetails', 'tenantDetails'
        ]

    def create(self, validated_data):
        contract = Contract.objects.create(**validated_data)
        # Automatically update property status to Occupied
        prop = contract.property
        prop.status = 'Occupied'
        prop.save()
        return contract