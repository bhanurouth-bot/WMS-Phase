from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CycleCountViewSet, ItemViewSet, InventoryViewSet, LocationViewSet, 
    PickBatchViewSet, RMAViewSet, TransactionLogViewSet, 
    OrderViewSet, SupplierViewSet, PurchaseOrderViewSet,
    LocationConfigurationViewSet, ReplenishmentTaskViewSet,
    UserViewSet, GroupViewSet, # <--- Added
    dashboard_stats, current_user, user_performance_stats # <--- Added
)

router = DefaultRouter()
router.register(r'users', UserViewSet)   # <--- New Route
router.register(r'groups', GroupViewSet) # <--- New Route
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
router.register(r'batches', PickBatchViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('dashboard/stats/', dashboard_stats),
    path('dashboard/users/', user_performance_stats), # <--- New Route
    path('me/', current_user)
]