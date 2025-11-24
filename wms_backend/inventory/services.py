import random
from django.db import transaction
from django.db.models import F
from .models import RMA, CycleCountSession, CycleCountTask, Inventory, Item, TransactionLog, Order, OrderLine, RMALine

class InventoryService:
    
    @staticmethod
    def receive_item(sku, location, quantity, attributes=None):
        with transaction.atomic():
            try:
                item = Item.objects.get(sku=sku)
            except Item.DoesNotExist:
                return {"error": "SKU not found in catalog"}

            inventory, created = Inventory.objects.select_for_update().get_or_create(
                item=item,
                location_code=location,
                defaults={'quantity': 0, 'version': 0}
            )

            inventory.quantity += quantity
            inventory.version += 1
            inventory.save()

            TransactionLog.objects.create(
                action='RECEIVE',
                sku_snapshot=sku,
                location_snapshot=location,
                quantity_change=quantity
            )

            return {"success": True, "new_qty": inventory.quantity, "id": inventory.id}

    @staticmethod
    def pick_item(inventory_id, qty_to_pick):
        try:
            with transaction.atomic():
                inv = Inventory.objects.get(id=inventory_id)
                
                if inv.quantity < qty_to_pick:
                    return {"error": "Not enough stock"}

                updated = Inventory.objects.filter(
                    id=inventory_id,
                    version=inv.version
                ).update(
                    quantity=inv.quantity - qty_to_pick,
                    version=inv.version + 1
                )

                if updated == 0:
                    return {"error": "Race Condition: Data changed. Retry."}

                TransactionLog.objects.create(
                    action='PICK',
                    sku_snapshot=inv.item.sku,
                    location_snapshot=inv.location_code,
                    quantity_change=-qty_to_pick
                )
                
                return {"success": True}

        except Inventory.DoesNotExist:
            return {"error": "Inventory record not found"}
        
    @staticmethod
    def allocate_order(order_id):
        with transaction.atomic():
            order = Order.objects.select_for_update().get(id=order_id)
            
            if order.status != 'PENDING':
                return {"error": f"Order is {order.status}, cannot allocate"}

            for line in order.lines.all().select_related('item'):
                qty_needed = line.qty_ordered - line.qty_allocated
                
                if qty_needed <= 0:
                    continue

                candidates = Inventory.objects.filter(
                    item=line.item,
                    quantity__gt=F('reserved_quantity')
                ).order_by('id')

                for bin in candidates:
                    if qty_needed <= 0:
                        break

                    available = bin.quantity - bin.reserved_quantity
                    to_take = min(available, qty_needed)

                    bin.reserved_quantity += to_take
                    bin.save()

                    line.qty_allocated += to_take
                    qty_needed -= to_take
                
                line.save()

            is_fully_allocated = all(l.qty_ordered == l.qty_allocated for l in order.lines.all())
            
            if is_fully_allocated:
                order.status = 'ALLOCATED'
            else:
                order.status = 'PENDING' 
            
            order.save()
            
            return {
                "success": True, 
                "status": order.status,
                "lines": [
                    {"sku": l.item.sku, "ordered": l.qty_ordered, "allocated": l.qty_allocated}
                    for l in order.lines.all()
                ]
            }
        
    @staticmethod
    def pick_order_item(order_id, item_sku, location_code, qty=1):
        with transaction.atomic():
            try:
                order = Order.objects.get(id=order_id)
                item = Item.objects.get(sku=item_sku)
            except (Order.DoesNotExist, Item.DoesNotExist):
                return {"error": "Invalid Order or SKU"}

            line = order.lines.filter(item=item).first()
            if not line:
                return {"error": "Item not in this order"}
            
            if line.qty_picked + qty > line.qty_allocated:
                return {"error": "Cannot pick more than allocated"}

            try:
                inv = Inventory.objects.select_for_update().get(
                    item=item, location_code=location_code
                )
            except Inventory.DoesNotExist:
                return {"error": "Bin not found"}

            if inv.quantity < qty:
                return {"error": "Not enough physical stock"}

            inv.quantity -= qty
            inv.reserved_quantity -= qty 
            inv.save()

            line.qty_picked += qty
            line.save()

            all_picked = all(l.qty_picked >= l.qty_ordered for l in order.lines.all())
            if all_picked:
                order.status = 'PICKED'
                order.save()
            
            TransactionLog.objects.create(
                action='PICK',
                sku_snapshot=item.sku,
                location_snapshot=location_code,
                quantity_change=-qty
            )

            return {"success": True, "status": order.status}

    @staticmethod
    def pack_order(order_id):
        """
        Phase 2 Step: Packing.
        Verifies items are ready to ship. Logs PACK event.
        """
        with transaction.atomic():
            try:
                order = Order.objects.get(id=order_id)
            except Order.DoesNotExist:
                return {"error": "Order not found"}
            
            if order.status != 'PICKED':
                return {"error": f"Order is {order.status}, must be PICKED to pack."}

            order.status = 'PACKED'
            order.save()

            # Log Pack Event for history visibility
            for line in order.lines.all():
                TransactionLog.objects.create(
                    action='PACK',
                    sku_snapshot=line.item.sku,
                    location_snapshot='PACKING_BENCH',
                    quantity_change=0 
                )

            return {"success": True, "status": "PACKED"}

    @staticmethod
    def ship_order(order_id):
        """
        Phase 2 Final Step: Shipping.
        Finalizes the order. Logs SHIP event.
        """
        with transaction.atomic():
            try:
                order = Order.objects.get(id=order_id)
            except Order.DoesNotExist:
                return {"error": "Order not found"}
            
            if order.status not in ['PICKED', 'PACKED']:
                return {"error": f"Order is {order.status}, must be PICKED or PACKED to ship."}

            order.status = 'SHIPPED'
            order.save()
            
            # Log Ship Event for history visibility
            for line in order.lines.all():
                TransactionLog.objects.create(
                    action='SHIP',
                    sku_snapshot=line.item.sku,
                    location_snapshot='OUTBOUND_DOCK',
                    quantity_change=0
                )
            
            return {"success": True, "status": "SHIPPED"}
        
    @staticmethod
    def process_return_receipt(rma_id, location_code='RETURNS-DOCK'):
        """
        Phase 4: Receive RMA
        1. Validates RMA status.
        2. Adds stock back to inventory (defaulting to a Returns Dock).
        3. Updates RMA status to RECEIVED.
        """
        with transaction.atomic():
            try:
                rma = RMA.objects.get(id=rma_id)
            except RMA.DoesNotExist:
                return {"error": "RMA not found"}

            if rma.status == 'RECEIVED':
                return {"error": "RMA already processed"}

            # Loop through lines and restock
            for line in rma.lines.all():
                # Get or Create inventory record for the returns location
                inventory, _ = Inventory.objects.select_for_update().get_or_create(
                    item=line.item,
                    location_code=location_code,
                    defaults={'quantity': 0, 'version': 0}
                )
                
                inventory.quantity += line.qty_to_return
                inventory.version += 1
                inventory.save()

                # Update Line
                line.qty_received = line.qty_to_return
                line.save()

                # Log It
                TransactionLog.objects.create(
                    action='RECEIVE', # Or create a specific 'RETURN' action type
                    sku_snapshot=line.item.sku,
                    location_snapshot=location_code,
                    quantity_change=line.qty_to_return
                )

            rma.status = 'RECEIVED'
            rma.save()

            return {"success": True, "status": "RECEIVED"}
        
    @staticmethod
    def create_cycle_count(aisle_prefix=None, limit=10):
        """
        Generates a list of bins to count.
        If aisle_prefix is set (e.g. 'A'), only selects bins in Aisle A.
        Otherwise, selects random locations.
        """
        with transaction.atomic():
            queryset = Inventory.objects.filter(quantity__gt=0)
            if aisle_prefix:
                queryset = queryset.filter(location_code__startswith=aisle_prefix)
            
            # Randomly sample inventory IDs
            all_ids = list(queryset.values_list('id', flat=True))
            if not all_ids:
                return {"error": "No inventory found to count"}
            
            selected_ids = random.sample(all_ids, min(len(all_ids), limit))
            
            # Create Session
            ref = f"CC-{random.randint(10000,99999)}"
            session = CycleCountSession.objects.create(reference=ref)
            
            # Create Tasks
            tasks = []
            for inv_id in selected_ids:
                inv = Inventory.objects.get(id=inv_id)
                tasks.append(CycleCountTask(
                    session=session,
                    inventory=inv,
                    expected_qty=inv.quantity # Snapshot current qty
                ))
            
            CycleCountTask.objects.bulk_create(tasks)
            return {"success": True, "session_id": session.id, "reference": ref}

    @staticmethod
    def submit_count(task_id, counted_qty):
        """
        User submits their count. 
        If Variance != 0, we automatically adjust inventory and log it.
        """
        with transaction.atomic():
            try:
                task = CycleCountTask.objects.select_for_update().get(id=task_id)
            except CycleCountTask.DoesNotExist:
                return {"error": "Task not found"}
            
            if task.status == 'COUNTED':
                return {"error": "Task already completed"}

            inventory = Inventory.objects.select_for_update().get(id=task.inventory.id)
            
            # Calculate Variance
            # Note: We compare against the LIVE inventory quantity, not just the snapshot, 
            # to account for movements that happened while counting.
            # However, for a simple WMS, comparing to snapshot (expected_qty) is standard practice 
            # if you lock operations. Here we assume live operations continue.
            
            current_system_qty = inventory.quantity
            variance = counted_qty - current_system_qty
            
            task.counted_qty = counted_qty
            task.variance = variance
            task.status = 'COUNTED'
            task.save()
            
            # Auto-Adjust if needed
            if variance != 0:
                inventory.quantity = counted_qty
                inventory.save()
                
                TransactionLog.objects.create(
                    action='ADJUST',
                    sku_snapshot=inventory.item.sku,
                    location_snapshot=inventory.location_code,
                    quantity_change=variance # +5 found, or -2 lost
                )
            
            # Check if session is complete
            session = task.session
            if not session.tasks.filter(status='PENDING').exists():
                session.status = 'COMPLETED'
                session.save()

            return {
                "success": True, 
                "variance": variance, 
                "message": "Match" if variance == 0 else f"Variance of {variance} recorded."
            }
        
    @staticmethod
    def suggest_putaway_location(sku):
        """
        Part 1: Directed Putaway Logic.
        1. Check if item exists in any bin (Consolidation).
        2. If not, suggest a default receiving zone or empty bin.
        """
        # 1. Try to consolidate (find bins where this SKU already exists)
        existing_locs = Inventory.objects.filter(item__sku=sku, quantity__gt=0)\
                                         .order_by('-quantity')
        
        if existing_locs.exists():
            # Suggest the bin with the most stock to consolidate
            best_loc = existing_locs.first().location_code
            return {"suggested_location": best_loc, "reason": "Consolidate with existing stock"}

        # 2. If new item, suggest a default zone (In a real app, this would find empty bins)
        # We'll simulate a "smart" suggestion by hashing the SKU to a random aisle
        random_aisle = sum(ord(c) for c in sku) % 5 + 1 # Aisle 1-5
        return {"suggested_location": f"A-0{random_aisle}-01", "reason": "Empty slot in Zone A"}
    
    @staticmethod
    def generate_wave_plan(order_ids):
        """
        Part 2: Batch Picking (Wave Lite).
        Aggregates items from multiple orders into a single pick path.
        """
        orders = Order.objects.filter(id__in=order_ids, status='ALLOCATED')
        if not orders.exists():
            return {"error": "No ALLOCATED orders found for these IDs"}

        # Aggregate totals by SKU
        pick_summary = {}
        
        for order in orders:
            for line in order.lines.all():
                sku = line.item.sku
                if sku not in pick_summary:
                    pick_summary[sku] = {
                        "sku": sku, 
                        "total_qty": 0, 
                        "orders": [],
                        "location": "Unknown" # In a real app, calculate optimal bin here
                    }
                
                pick_summary[sku]["total_qty"] += line.qty_allocated
                pick_summary[sku]["orders"].append(order.order_number)
                
                # Simple logic: grab the first location we find stock in
                # Real WMS would do pathfinding here
                first_inv = Inventory.objects.filter(item__sku=sku, quantity__gt=0).first()
                if first_inv:
                    pick_summary[sku]["location"] = first_inv.location_code

        return {
            "success": True,
            "wave_id": f"WAVE-{random.randint(1000,9999)}",
            "pick_list": list(pick_summary.values()),
            "order_count": orders.count()
        }

    @staticmethod
    def complete_wave(order_ids):
        """
        Executes picks for all provided orders automatically.
        (Assumes user picked everything perfectly).
        """
        with transaction.atomic():
            results = []
            for oid in order_ids:
                # Reuse existing single-order pick logic
                order = Order.objects.get(id=oid)
                # Auto-pick every line
                for line in order.lines.all():
                    # Find where stock is reserved (simplified)
                    inv = Inventory.objects.filter(item=line.item, quantity__gt=0).first()
                    if inv:
                        InventoryService.pick_order_item(oid, line.item.sku, inv.location_code, line.qty_allocated)
                
                results.append(f"Picked {order.order_number}")
            
            return {"success": True, "results": results}
        
    @staticmethod
    def suggest_putaway_location(sku):
        """
        Part 1: Directed Putaway Logic.
        1. Check if item exists in any bin (Consolidation).
        2. If not, suggest a default receiving zone or empty bin.
        """
        # 1. Try to consolidate (find bins where this SKU already exists)
        existing_locs = Inventory.objects.filter(item__sku=sku, quantity__gt=0)\
                                         .order_by('-quantity')
        
        if existing_locs.exists():
            # Suggest the bin with the most stock to consolidate
            best_loc = existing_locs.first().location_code
            return {"suggested_location": best_loc, "reason": "Consolidate with existing stock"}

        # 2. If new item, suggest a default zone 
        # (Simulation: Hash SKU to suggest a random aisle A-E)
        # In a real app, you would query a 'Bin' model for is_empty=True
        aisle_char = chr(65 + (sum(ord(c) for c in sku) % 5)) # A, B, C, D, E
        return {"suggested_location": f"ZONE-{aisle_char}-01", "reason": f"Empty slot in Zone {aisle_char}"}

    @staticmethod
    def generate_wave_plan(order_ids):
        """
        Part 2: Batch Picking (Wave Lite).
        Aggregates items from multiple orders into a single pick path.
        """
        orders = Order.objects.filter(id__in=order_ids, status='ALLOCATED')
        if not orders.exists():
            return {"error": "No ALLOCATED orders found for these IDs"}

        # Aggregate totals by SKU
        pick_summary = {}
        
        for order in orders:
            for line in order.lines.all():
                sku = line.item.sku
                if sku not in pick_summary:
                    pick_summary[sku] = {
                        "sku": sku, 
                        "total_qty": 0, 
                        "orders": [],     # Order Numbers (for display)
                        "order_ids": [],  # Order IDs (for API calls) <-- ADDED THIS
                        "location": "Unknown" 
                    }
                
                pick_summary[sku]["total_qty"] += line.qty_allocated
                pick_summary[sku]["orders"].append(order.order_number)
                pick_summary[sku]["order_ids"].append(order.id) # <-- ADDED THIS
                
                # Simple logic: grab the first location we find stock in
                first_inv = Inventory.objects.filter(item__sku=sku, quantity__gt=0).first()
                if first_inv:
                    pick_summary[sku]["location"] = first_inv.location_code

        # Sort pick list by location to optimize walking path
        sorted_pick_list = sorted(list(pick_summary.values()), key=lambda x: x['location'])

        return {
            "success": True,
            "wave_id": f"WAVE-{random.randint(1000,9999)}",
            "pick_list": sorted_pick_list,
            "order_count": orders.count()
        }

    @staticmethod
    def complete_wave(order_ids):
        """
        Executes picks for all provided orders automatically.
        (Assumes user picked everything perfectly).
        """
        with transaction.atomic():
            results = []
            for oid in order_ids:
                try:
                    order = Order.objects.get(id=oid)
                    # Auto-pick every line
                    for line in order.lines.all():
                        # Find where stock is reserved 
                        # (In a real app, we would track exactly which bin was allocated)
                        inv = Inventory.objects.filter(item=line.item, quantity__gt=0).first()
                        if inv:
                            InventoryService.pick_order_item(oid, line.item.sku, inv.location_code, line.qty_allocated)
                    
                    results.append(f"Picked {order.order_number}")
                except Exception as e:
                    results.append(f"Error picking {oid}: {str(e)}")
            
            return {"success": True, "results": results}