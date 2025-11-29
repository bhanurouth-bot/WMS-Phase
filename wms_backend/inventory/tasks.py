from celery import shared_task
from .services import InventoryService
from .models import Order
from django.db.models import Sum
from .models import Inventory, DailyInventorySnapshot
from django.core.mail import send_mail

@shared_task
def generate_wave_plan_task(order_ids):
    # This runs in the background worker
    result = InventoryService.generate_wave_plan(order_ids)
    
    # Broadcast completion via WebSockets
    if result.get('success'):
        InventoryService.broadcast_update("WAVE_GENERATED", result)
    
    return result

@shared_task
def generate_packing_slip_task(order_id):
    # Example of generating PDF async
    # Note: You'd need to save the PDF to a FileField or S3 and return the URL
    # because you can't return a binary file stream through Celery easily.
    pass

@shared_task
def take_inventory_snapshot():
    total_qty = Inventory.objects.aggregate(s=Sum('quantity'))['s'] or 0
    # Assuming you might add a 'cost' field to Item later, for now we just count items
    total_locs = Inventory.objects.filter(quantity__gt=0).count()
    
    DailyInventorySnapshot.objects.create(
        total_items=total_qty,
        total_locations_used=total_locs,
        total_value=0.00 # Placeholder until Cost is added to Item model
    )
    return f"Snapshot taken: {total_qty} items"

@shared_task
def check_low_stock_and_alert():
    low_stock_items = Inventory.objects.filter(quantity__lt=10).select_related('item')
    
    if not low_stock_items.exists():
        return "No low stock items."

    # Build Email Content
    message = "The following items are running low:\n\n"
    for inv in low_stock_items:
        message += f"- {inv.item.sku}: {inv.quantity} remaining in {inv.location_code}\n"
    
    message += "\nPlease login to NexWMS to reorder."

    send_mail(
        subject='[NexWMS] Low Stock Alert',
        message=message,
        from_email='system@nexwms.com',
        recipient_list=['admin@yourcompany.com'], # Replace with real admin email
        fail_silently=False,
    )
    return f"Sent alert for {len(low_stock_items)} items."