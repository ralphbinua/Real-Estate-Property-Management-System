from django.urls import path
from .views import MaintenanceListStubView

urlpatterns = [
    path('', MaintenanceListStubView.as_view(), name='maintenance-list'),
]