"""Backward-compatible public exports for property API views."""

from .view_modules.applications import RentalApplicationViewSet
from .view_modules.inquiries import PropertyInquiryViewSet
from .view_modules.owner_portfolio import OwnerPortfolioView
from .view_modules.properties import PropertyViewSet, UnitViewSet
from .view_modules.rent_changes import UnitPriceChangeRequestViewSet
from .view_modules.permissions import (
    IsAdminOrOwner, IsAdminOrPropertyManager, IsAdminOrPropertyManagerOrAgent,
    IsAdminOrPropertyManagerOrAssignedAgent, IsApplicationReviewer, IsOwner,
    IsOwnerOrAdmin, IsPropertyManager,
)
