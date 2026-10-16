from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import InvoiceViewSet, scheduled_monthly_billing

router = DefaultRouter()
router.register(r'', InvoiceViewSet, basename='invoice')

urlpatterns = [
    path('scheduled-monthly-billing/', scheduled_monthly_billing),
    path('', include(router.urls)),
]
