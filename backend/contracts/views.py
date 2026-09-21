from rest_framework import viewsets, permissions
# pyrefly: ignore [missing-import]
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