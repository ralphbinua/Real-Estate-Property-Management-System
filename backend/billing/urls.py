from django.urls import path
from .views import InvoiceListStubView

urlpatterns = [
    path('', InvoiceListStubView.as_view(), name='invoice-list'),
]