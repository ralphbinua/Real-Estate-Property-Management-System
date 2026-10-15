"""
URL configuration for core project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from users.views import CsrfView, SessionLoginView, SessionLogoutView, PasswordChangeView, EmailChangeView, SystemSettingsView
from properties.views import OwnerPortfolioView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/csrf/', CsrfView.as_view(), name='csrf_cookie'),
    path('api/auth/login/', SessionLoginView.as_view(), name='session_login'),
    path('api/auth/logout/', SessionLogoutView.as_view(), name='session_logout'),
    path('api/auth/password/change/', PasswordChangeView.as_view(), name='password_change'),
    path('api/auth/email/change/', EmailChangeView.as_view(), name='email_change'),
    path('api/settings/', SystemSettingsView.as_view(), name='system_settings'),
    path('api/users/', include('users.urls')),
    path('api/properties/', include('properties.urls')),
    path('api/contracts/', include('contracts.urls')),
    path('api/invoices/', include('billing.urls')),
    path('api/payments/', include('billing.payment_urls')),
    path('api/maintenance/', include('maintenance.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/owner/portfolio/', OwnerPortfolioView.as_view(), name='owner_portfolio'),
]