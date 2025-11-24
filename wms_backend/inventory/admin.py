from django.contrib import admin
from .models import Item, Inventory, TransactionLog

@admin.register(Item)
class ItemAdmin(admin.ModelAdmin):
    list_display = ('sku', 'name', 'attributes')
    search_fields = ('sku', 'name')

@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ('location_code', 'get_sku', 'quantity', 'version')
    list_filter = ('location_code',)
    search_fields = ('location_code', 'item__sku')
    
    def get_sku(self, obj):
        return obj.item.sku
    get_sku.short_description = 'SKU'

@admin.register(TransactionLog)
class TransactionLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'action', 'sku_snapshot', 'quantity_change')
    list_filter = ('action', 'timestamp')
    readonly_fields = ('timestamp', 'action', 'sku_snapshot', 'location_snapshot', 'quantity_change')