from rest_framework import serializers
from .models import MaintenanceRequest
from properties.models import Property, Unit
from properties.serializers import PropertySerializer
from users.serializers import UserSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class MaintenanceRequestSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    issueDescription = serializers.CharField(source='issue_description')
    
    property = serializers.PrimaryKeyRelatedField(queryset=Property.objects.all())
    tenant = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), required=False)
    unit = serializers.PrimaryKeyRelatedField(queryset=Unit.objects.all(), required=False, allow_null=True, default=None)

    propertyDetails = PropertySerializer(source='property', read_only=True)
    tenantDetails = UserSerializer(source='tenant', read_only=True)

    class Meta:
        model = MaintenanceRequest
        fields = [
            '_id', 'property', 'unit', 'tenant', 'issueDescription', 
            'status', 'propertyDetails', 'tenantDetails', 'created_at'
        ]

    def create(self, validated_data):
        request_obj = self.context.get('request')
        if 'tenant' not in validated_data and request_obj and request_obj.user.is_authenticated:
            validated_data['tenant'] = request_obj.user
        return super().create(validated_data)
