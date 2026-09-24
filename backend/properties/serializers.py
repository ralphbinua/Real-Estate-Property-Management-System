from rest_framework import serializers
from .models import Property, Unit
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class UnitSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    unitNumber = serializers.CharField(source='unit_number')
    monthlyRate = serializers.DecimalField(source='monthly_rate', max_digits=10, decimal_places=2)

    class Meta:
        model = Unit
        fields = ['_id', 'unitNumber', 'monthlyRate', 'status']

class PropertySerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    propertyType = serializers.CharField(source='property_type')
    monthlyRate = serializers.DecimalField(source='price', max_digits=10, decimal_places=2, required=False)
    units = UnitSerializer(many=True, required=False, read_only=True)

    owner = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)
    manager = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False, allow_null=True)

    ownerDetails = UserSerializer(source='owner', read_only=True)
    managerDetails = UserSerializer(source='manager', read_only=True)

    class Meta:
        model = Property
        fields = [
            '_id', 'title', 'description', 'address', 'propertyType', 'price', 
            'monthlyRate', 'status', 'units', 'owner', 'manager', 
            'ownerDetails', 'managerDetails'
        ]

    def create(self, validated_data):
        units_data = validated_data.pop('units', [])
        property_obj = Property.objects.create(**validated_data)
        for unit_data in units_data:
            Unit.objects.create(property=property_obj, **unit_data)
        return property_obj