from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions

class MaintenanceListStubView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response([])