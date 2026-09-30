from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PropertyViewSet, UnitViewSet, OwnerPortfolioView, PropertyInquiryViewSet

router = DefaultRouter()
router.register(r'', PropertyViewSet, basename='property')
unit_router = DefaultRouter()
unit_router.register(r'', UnitViewSet, basename='unit')
inquiry_router = DefaultRouter()
inquiry_router.register(r'', PropertyInquiryViewSet, basename='property-inquiry')

urlpatterns = [
    path('owner/portfolio/', OwnerPortfolioView.as_view(), name='owner-portfolio'),
    path('units/', include(unit_router.urls)),
    path('inquiries/', include(inquiry_router.urls)),
    path('', include(router.urls)),
]
