from rest_framework import viewsets, permissions
from .models import MaintenanceRequest
from .serializers import MaintenanceRequestSerializer

class MaintenanceRequestViewSet(viewsets.ModelViewSet):
    queryset = MaintenanceRequest.objects.filter(is_deleted=False).order_by('-id')
    serializer_class = MaintenanceRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = MaintenanceRequest.objects.filter(is_deleted=False).order_by('-id')
        if user.is_authenticated and user.role == 'Tenant':
            qs = qs.filter(tenant=user)
        return qs