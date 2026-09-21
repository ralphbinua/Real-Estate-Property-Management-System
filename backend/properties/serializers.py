from rest_framework import serializers
from .models import Property, Unit

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
    units = UnitSerializer(many=True, required=False)

    class Meta:
        model = Property
        fields = ['_id', 'title', 'address', 'propertyType', 'price', 'monthlyRate', 'status', 'units']

    def create(self, validated_data):
        units_data = validated_data.pop('units', [])
        property_obj = Property.objects.create(**validated_data)
        for unit_data in units_data:
            Unit.objects.create(property=property_obj, **unit_data)
        return property_obj