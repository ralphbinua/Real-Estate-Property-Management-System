from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ContractViewSet, scheduled_lease_reminders

router = DefaultRouter()
router.register(r'', ContractViewSet, basename='contract')

urlpatterns = [
    path('scheduled-reminders/', scheduled_lease_reminders),
    path('', include(router.urls)),
]
