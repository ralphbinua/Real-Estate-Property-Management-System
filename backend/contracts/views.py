from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Contract
from .serializers import ContractSerializer

class ContractViewSet(viewsets.ModelViewSet):
    queryset = Contract.objects.all()
    serializer_class = ContractSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true':
            return Contract.objects.all().order_by('-id')
        return Contract.objects.filter(is_deleted=False).order_by('-id')

    @action(detail=True, methods=['patch', 'put'])
    def terminate(self, request, pk=None):
        contract = self.get_object()
        contract.status = 'Terminated'
        contract.save()
        
        # Free up linked property
        prop = contract.property
        prop.status = 'Available'
        prop.save()

        return Response({"message": "Lease contract terminated successfully."})