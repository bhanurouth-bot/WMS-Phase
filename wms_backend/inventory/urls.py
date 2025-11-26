from django.urls import path, include
from rest_framework.routers import DefaultRouter
# Import views from the current directory (.)
from .views import (
    CycleCountViewSet, ItemViewSet, InventoryViewSet, LocationViewSet, RMAViewSet, TransactionLogViewSet, 
    OrderViewSet, SupplierViewSet, PurchaseOrderViewSet,
    LocationConfigurationViewSet, ReplenishmentTaskViewSet, # Explicit imports
    dashboard_stats, current_user
)

router = DefaultRouter()
router.register(r'items', ItemViewSet)
router.register(r'inventory', InventoryViewSet)
router.register(r'history', TransactionLogViewSet)
router.register(r'orders', OrderViewSet)
router.register(r'suppliers', SupplierViewSet)
router.register(r'purchase-orders', PurchaseOrderViewSet)
router.register(r'rmas', RMAViewSet)
router.register(r'cycle-counts', CycleCountViewSet)
router.register(r'replenishment-rules', LocationConfigurationViewSet)
router.register(r'replenishment-tasks', ReplenishmentTaskViewSet)
router.register(r'locations', LocationViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/stats/', dashboard_stats),
    path('me/', current_user)
]