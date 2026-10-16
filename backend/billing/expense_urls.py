from django.urls import include, path
from rest_framework.routers import DefaultRouter
from .expense_views import ExpenseViewSet

router = DefaultRouter()
router.register(r'', ExpenseViewSet, basename='expense')
urlpatterns = [path('', include(router.urls))]
