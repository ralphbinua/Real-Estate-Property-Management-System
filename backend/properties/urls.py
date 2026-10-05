from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PropertyViewSet, UnitViewSet, OwnerPortfolioView, PropertyInquiryViewSet,
    RentalApplicationViewSet, UnitPriceChangeRequestViewSet,
)

router = DefaultRouter()
router.register(r'', PropertyViewSet, basename='property')
unit_router = DefaultRouter()
unit_router.register(r'', UnitViewSet, basename='unit')
inquiry_router = DefaultRouter()
inquiry_router.register(r'', PropertyInquiryViewSet, basename='property-inquiry')
application_router = DefaultRouter()
application_router.register(r'', RentalApplicationViewSet, basename='rental-application')
rent_change_router = DefaultRouter()
rent_change_router.register(r'', UnitPriceChangeRequestViewSet, basename='rent-change-request')

urlpatterns = [
    path('owner/portfolio/', OwnerPortfolioView.as_view(), name='owner-portfolio'),
    path('units/', include(unit_router.urls)),
    path('inquiries/', include(inquiry_router.urls)),
    path('applications/', include(application_router.urls)),
    path('rent-change-requests/', include(rent_change_router.urls)),
    path('', include(router.urls)),
]
