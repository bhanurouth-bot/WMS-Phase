from django.core.management.base import BaseCommand
from inventory.models import (
    Item, Location, Inventory, TransactionLog, 
    Order, OrderLine, RMA, RMALine, 
    Supplier, PurchaseOrder, 
    CycleCountSession, CycleCountTask, 
    LocationConfiguration, ReplenishmentTask
)

class Command(BaseCommand):
    help = 'Wipes all business data (Inventory, Orders, Items) but KEEPS Users.'

    def handle(self, *args, **kwargs):
        self.stdout.write(self.style.WARNING('Starting Data Wipe...'))

        # 1. Delete Transaction History & Logs
        TransactionLog.objects.all().delete()
        self.stdout.write('Deleted Transaction Logs')

        # 2. Delete Tasks (Cycle Counts, Replenishment)
        CycleCountTask.objects.all().delete()
        CycleCountSession.objects.all().delete()
        ReplenishmentTask.objects.all().delete()
        self.stdout.write('Deleted Tasks')

        # 3. Delete Return Merchandise Authorizations (RMAs)
        RMALine.objects.all().delete()
        RMA.objects.all().delete()
        self.stdout.write('Deleted RMAs')

        # 4. Delete Orders (Lines first because of PROTECT constraint on Item)
        OrderLine.objects.all().delete()
        Order.objects.all().delete()
        self.stdout.write('Deleted Orders')

        # 5. Delete Purchase Orders
        PurchaseOrder.objects.all().delete()
        self.stdout.write('Deleted POs')

        # 6. Delete Inventory & Configurations
        Inventory.objects.all().delete()
        LocationConfiguration.objects.all().delete()
        self.stdout.write('Deleted Inventory & Configs')

        # 7. Delete Master Data (Items, Locations, Suppliers)
        # Note: These must be deleted LAST because other tables reference them
        Item.objects.all().delete()
        Location.objects.all().delete()
        Supplier.objects.all().delete()
        self.stdout.write('Deleted Master Data (Items, Locations, Suppliers)')

        self.stdout.write(self.style.SUCCESS('Successfully wiped WMS data. Users are intact.'))