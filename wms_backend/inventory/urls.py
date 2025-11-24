from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CycleCountViewSet, ItemViewSet, InventoryViewSet, RMAViewSet, TransactionLogViewSet, 
    OrderViewSet, SupplierViewSet, PurchaseOrderViewSet, # <-- Import new views
    dashboard_stats, current_user
)

router = DefaultRouter()
router.register(r'items', ItemViewSet)
router.register(r'inventory', InventoryViewSet)
router.register(r'history', TransactionLogViewSet)
router.register(r'orders', OrderViewSet)
router.register(r'suppliers', SupplierViewSet)       # <-- New
router.register(r'purchase-orders', PurchaseOrderViewSet) # <-- New
router.register(r'rmas', RMAViewSet)
router.register(r'cycle-counts', CycleCountViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/stats/', dashboard_stats),
    path('me/', current_user)
]