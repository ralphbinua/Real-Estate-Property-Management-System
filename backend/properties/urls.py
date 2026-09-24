from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PropertyViewSet, OwnerPortfolioView

router = DefaultRouter()
router.register(r'', PropertyViewSet, basename='property')

urlpatterns = [
    path('owner/portfolio/', OwnerPortfolioView.as_view(), name='owner-portfolio'),
    path('', include(router.urls)),
]