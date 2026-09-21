from rest_framework.routers import DefaultRouter
from .views import PropertyViewSet, UnitViewSet

router = DefaultRouter()
router.register('properties', PropertyViewSet)
router.register('units', UnitViewSet)

urlpatterns = router.urls