from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Property
from .serializers import PropertySerializer
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from maintenance.models import MaintenanceRequest
from maintenance.serializers import MaintenanceRequestSerializer

class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.all()
    serializer_class = PropertySerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options']

    def get_queryset(self):
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true':
            return Property.objects.all().order_by('-id')
        return Property.objects.filter(is_deleted=False).order_by('-id')

class OwnerPortfolioView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        if getattr(user, 'role', '') == 'Owner':
            properties = Property.objects.filter(owner=user, is_deleted=False)
        else:
            properties = Property.objects.filter(is_deleted=False)

        property_ids = properties.values_list('id', flat=True)
        contracts = Contract.objects.filter(property_id__in=property_ids, is_deleted=False)
        maintenance = MaintenanceRequest.objects.filter(property_id__in=property_ids, is_deleted=False)

        return Response({
            "properties": PropertySerializer(properties, many=True).data,
            "contracts": ContractSerializer(contracts, many=True).data,
            "maintenanceRequests": MaintenanceRequestSerializer(maintenance, many=True).data
        })