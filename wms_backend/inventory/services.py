from datetime import timedelta
from django.utils import timezone
import random
from django.db import transaction
from django.db.models import F, Sum
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import io
from .models import RMA, CycleCountSession, CycleCountTask, Inventory, Item, LocationConfiguration, PickBatch, ReplenishmentTask, TransactionLog, Order, OrderLine, RMALine, PurchaseOrder, Location
from .models import SerialNumber
class InventoryService:
    

    @staticmethod
    def broadcast_update(type_name, data=None):
        """Helper to send real-time updates to the dashboard"""
        layer = get_channel_layer()
        async_to_sync(layer.group_send)(
            "dashboard",
            {
                "type": "dashboard_update",
                "message": {"type": type_name, "data": data}
            }
        )

    @staticmethod
    def receive_item(sku, location, quantity, lot_number=None, expiry_date=None, status='AVAILABLE', serials=None, user=None):
        with transaction.atomic():
            try:
                item = Item.objects.get(sku=sku)
            except Item.DoesNotExist:
                return {"error": "SKU not found in catalog"}

            if not Location.objects.filter(location_code=location).exists():
                return {"error": f"Invalid Location: {location}. Create it in Layout first."}
            
            if item.is_serialized:
                if not serials or len(serials) != quantity:
                    return {"error": f"Item is serialized. Expected {quantity} serial numbers, got {len(serials) if serials else 0}."}
                
                # Check duplicates
                existing = SerialNumber.objects.filter(serial__in=serials).values_list('serial', flat=True)
                if existing:
                    return {"error": f"Duplicate serials found: {list(existing)}"}

            clean_lot = lot_number.strip() if lot_number and lot_number.strip() else None

            # --- UPDATED: Include status in get_or_create ---
            inventory, created = Inventory.objects.select_for_update().get_or_create(
                item=item,
                location_code=location,
                lot_number=clean_lot,
                status=status, # Separate inventory record for different statuses
                defaults={
                    'quantity': 0, 
                    'version': 0,
                    'expiry_date': expiry_date
                }
            )

            inventory.quantity += quantity
            inventory.version += 1
            inventory.save()


            # --- CREATE SERIALS ---
            if item.is_serialized and serials:
                loc_obj = Location.objects.get(location_code=location)
                for sn in serials:
                    SerialNumber.objects.create(
                        serial=sn, item=item, location=loc_obj, inventory=inventory, status='IN_STOCK'
                    )

            TransactionLog.objects.create(
                action='RECEIVE',
                sku_snapshot=sku,
                location_snapshot=location,
                quantity_change=quantity,
                lot_snapshot=clean_lot,
                user=user # [NEW]
            )
            return {"success": True, "new_qty": inventory.quantity, "id": inventory.id}

            return {"success": True, "new_qty": inventory.quantity, "id": inventory.id}

    @staticmethod
    def receive_po_item(po_id, sku, location, qty, lot_number=None, expiry_date=None):
        with transaction.atomic():
            try:
                po = PurchaseOrder.objects.select_for_update().get(id=po_id)
            except PurchaseOrder.DoesNotExist:
                return {"error": "PO not found"}

            new_lines = list(po.lines) 
            target_line_index = -1
            
            for idx, line in enumerate(new_lines):
                if line['sku'] == sku:
                    target_line_index = idx
                    break
            
            if target_line_index == -1:
                return {"error": "Item not in this PO"}

            target_line = new_lines[target_line_index]
            received_so_far = target_line.get('received', 0)

            # Defaults to AVAILABLE for PO receiving
            inv_res = InventoryService.receive_item(
                sku=sku, 
                location=location, 
                quantity=qty, 
                lot_number=lot_number, 
                expiry_date=expiry_date,
                status='AVAILABLE'
            )
            
            if "error" in inv_res:
                return inv_res

            target_line['received'] = received_so_far + qty
            new_lines[target_line_index] = target_line 
            po.lines = new_lines 

            total_ordered = sum(l['qty'] for l in new_lines)
            total_received = sum(l.get('received', 0) for l in new_lines)

            if total_received >= total_ordered:
                po.status = 'RECEIVED'
            elif total_received > 0:
                po.status = 'ORDERED'
            
            po.save()

            return {
                "success": True, 
                "po_status": po.status, 
                "line_progress": f"{target_line['received']}/{target_line['qty']}"
            }

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

                # --- UPDATED: Filter by status='AVAILABLE' ---
                candidates = Inventory.objects.filter(
                    item=line.item,
                    quantity__gt=F('reserved_quantity'),
                    status='AVAILABLE' # <--- CRITICAL: Only allocate good stock
                ).order_by('expiry_date', 'id') # FEFO priority

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
    def pick_order_item(order_id, item_sku, location_code, qty=1, lot_number=None, serial_picked=None):
        with transaction.atomic():
            try:
                order = Order.objects.get(id=order_id)
                item = Item.objects.get(sku=item_sku)
            except (Order.DoesNotExist, Item.DoesNotExist):
                return {"error": "Invalid Order or SKU"}

            line = order.lines.filter(item=item).first()
            if not line:
                return {"error": "Item not in this order"}
            
            # --- SERIAL PICKING LOGIC ---
            if item.is_serialized:
                if not serial_picked:
                    return {"error": "Serial number scan required for this item."}
                
                try:
                    sn_obj = SerialNumber.objects.get(serial=serial_picked, item=item, status='IN_STOCK')
                    if sn_obj.location.location_code != location_code:
                        return {"error": f"Serial {serial_picked} is at {sn_obj.location.location_code}, not {location_code}"}
                except SerialNumber.DoesNotExist:
                    return {"error": f"Serial {serial_picked} invalid or unavailable."}

                # Link serial to order line
                sn_obj.status = 'PACKED' # Reserved for this order
                sn_obj.allocated_to = line
                sn_obj.save()
            
            if line.qty_picked + qty > line.qty_allocated:
                return {"error": "Cannot pick more than allocated"}

            try:
                qs = Inventory.objects.select_for_update().filter(
                    item=item, location_code=location_code, quantity__gt=0, status='AVAILABLE'
                )
                if lot_number:
                    qs = qs.filter(lot_number=lot_number)
                
                inv = qs.order_by('expiry_date', 'version').first()

            except Inventory.DoesNotExist:
                return {"error": "Bin/Lot not found"}

            if not inv or inv.quantity < qty:
                return {"error": f"Not enough physical stock in this lot/bin. Available: {inv.quantity if inv else 0}"}

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
                quantity_change=-qty,
                lot_snapshot=inv.lot_number
            )

            return {"success": True, "status": order.status}

    @staticmethod
    def pack_order(order_id):
        with transaction.atomic():
            try:
                order = Order.objects.get(id=order_id)
            except Order.DoesNotExist:
                return {"error": "Order not found"}
            
            if order.status != 'PICKED':
                return {"error": f"Order is {order.status}, must be PICKED to pack."}

            order.status = 'PACKED'
            order.save()

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
        with transaction.atomic():
            order = Order.objects.get(id=order_id)
            if order.status not in ['PICKED', 'PACKED']: return {"error": "Not ready"}
            
            order.status = 'SHIPPED'
            order.save()

            # Update Serials
            for line in order.lines.all():
                # Bulk update serials attached to this line
                line.assigned_serials.update(status='SHIPPED')
                
                TransactionLog.objects.create(
                    action='SHIP', sku_snapshot=line.item.sku, location_snapshot='OUTBOUND', quantity_change=0
                )
            
            InventoryService.broadcast_update("ORDER_SHIPPED")
            return {"success": True, "status": "SHIPPED"}
        
    @staticmethod
    def process_return_receipt(rma_id, location_code='RETURNS-DOCK'):
        with transaction.atomic():
            try:
                rma = RMA.objects.get(id=rma_id)
            except RMA.DoesNotExist:
                return {"error": "RMA not found"}

            if rma.status == 'RECEIVED':
                return {"error": "RMA already processed"}

            for line in rma.lines.all():
                # --- UPDATED: Returns default to QUARANTINE usually, but sticking to AVAILABLE for now or QUARANTINE if you prefer ---
                # Let's set to QUARANTINE for safety since it's a return
                inventory, _ = Inventory.objects.select_for_update().get_or_create(
                    item=line.item,
                    location_code=location_code,
                    status='QUARANTINE', # <--- New Default for Returns
                    defaults={'quantity': 0, 'version': 0}
                )
                
                inventory.quantity += line.qty_to_return
                inventory.version += 1
                inventory.save()

                line.qty_received = line.qty_to_return
                line.save()

                TransactionLog.objects.create(
                    action='RECEIVE',
                    sku_snapshot=line.item.sku,
                    location_snapshot=location_code,
                    quantity_change=line.qty_to_return
                )

            rma.status = 'RECEIVED'
            rma.save()

            return {"success": True, "status": "RECEIVED"}
        
    @staticmethod
    def create_cycle_count(aisle_prefix=None, limit=10):
        with transaction.atomic():
            queryset = Inventory.objects.filter(quantity__gt=0)
            if aisle_prefix:
                queryset = queryset.filter(location_code__startswith=aisle_prefix)
            
            all_ids = list(queryset.values_list('id', flat=True))
            if not all_ids:
                return {"error": "No inventory found to count"}
            
            selected_ids = random.sample(all_ids, min(len(all_ids), limit))
            
            ref = f"CC-{random.randint(10000,99999)}"
            session = CycleCountSession.objects.create(reference=ref)
            
            tasks = []
            for inv_id in selected_ids:
                inv = Inventory.objects.get(id=inv_id)
                tasks.append(CycleCountTask(
                    session=session,
                    inventory=inv,
                    expected_qty=inv.quantity
                ))
            
            CycleCountTask.objects.bulk_create(tasks)
            return {"success": True, "session_id": session.id, "reference": ref}

    @staticmethod
    def create_location_count(location_code):
        with transaction.atomic():
            inventory_items = Inventory.objects.filter(location_code=location_code, quantity__gt=0)
            
            if not inventory_items.exists():
                return {"error": "System thinks this bin is empty. Perform a blind count if needed."}

            ref = f"CC-LOC-{location_code}-{random.randint(1000,9999)}"
            session = CycleCountSession.objects.create(
                reference=ref, 
                status='IN_PROGRESS',
                device_id='MANUAL_TRIGGER'
            )
            
            tasks = []
            for inv in inventory_items:
                tasks.append(CycleCountTask(
                    session=session,
                    inventory=inv,
                    expected_qty=inv.quantity,
                    status='PENDING'
                ))
            
            CycleCountTask.objects.bulk_create(tasks)
            return {"success": True, "message": f"Cycle Count {ref} created for {location_code}"}

    @staticmethod
    def submit_count(task_id, counted_qty):
        with transaction.atomic():
            try:
                task = CycleCountTask.objects.select_for_update().get(id=task_id)
            except CycleCountTask.DoesNotExist:
                return {"error": "Task not found"}
            
            if task.status == 'COUNTED':
                return {"error": "Task already completed"}

            inventory = Inventory.objects.select_for_update().get(id=task.inventory.id)
            
            current_system_qty = inventory.quantity
            variance = counted_qty - current_system_qty
            
            task.counted_qty = counted_qty
            task.variance = variance
            task.status = 'COUNTED'
            task.save()
            
            if variance != 0:
                inventory.quantity = counted_qty
                inventory.save()
                
                TransactionLog.objects.create(
                    action='ADJUST',
                    sku_snapshot=inventory.item.sku,
                    location_snapshot=inventory.location_code,
                    quantity_change=variance 
                )
            
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
        existing_locs = Inventory.objects.filter(item__sku=sku, quantity__gt=0)\
                                         .order_by('-quantity')
        
        if existing_locs.exists():
            best_loc = existing_locs.first().location_code
            return {"suggested_location": best_loc, "reason": "Consolidate with existing stock"}

        aisle_char = chr(65 + (sum(ord(c) for c in sku) % 5)) 
        return {"suggested_location": f"ZONE-{aisle_char}-01", "reason": f"Empty slot in Zone {aisle_char}"}

    @staticmethod
    def generate_wave_plan(order_ids):
        # Filter: Must be ALLOCATED and NOT ON HOLD
        # Order By: Priority (Descending), then Date
        orders = Order.objects.filter(
            id__in=order_ids, 
            status='ALLOCATED', 
            is_on_hold=False
        ).order_by('-priority', 'created_at')
        
        if not orders.exists():
            return {"error": "No ALLOCATED orders found for these IDs"}

        pick_summary = {}
        
        for order in orders:
            for line in order.lines.all():
                sku = line.item.sku
                if sku not in pick_summary:
                    pick_summary[sku] = {
                        "sku": sku, 
                        "total_qty": 0, 
                        "orders": [],
                        "order_ids": [],
                        "location": "Unknown",
                        "x": 0, 
                        "y": 0
                    }
                
                pick_summary[sku]["total_qty"] += line.qty_allocated
                pick_summary[sku]["orders"].append(order.order_number)
                pick_summary[sku]["order_ids"].append(order.id)
                
                # --- UPDATED: Prefer picking from AVAILABLE stock only ---
                first_inv = Inventory.objects.filter(item__sku=sku, quantity__gt=0, status='AVAILABLE').first()
                if first_inv:
                    pick_summary[sku]["location"] = first_inv.location_code
                    # Fetch Coordinates
                    loc = Location.objects.filter(location_code=first_inv.location_code).first()
                    if loc:
                        pick_summary[sku]["x"] = loc.x
                        pick_summary[sku]["y"] = loc.y

        sorted_pick_list = sorted(list(pick_summary.values()), key=lambda x: (x['x'], x['y']))

        return {
            "success": True,
            "wave_id": f"WAVE-{random.randint(1000,9999)}",
            "pick_list": sorted_pick_list,
            "order_count": orders.count()
        }

    @staticmethod
    def complete_wave(order_ids):
        with transaction.atomic():
            results = []
            for oid in order_ids:
                try:
                    order = Order.objects.get(id=oid)
                    for line in order.lines.all():
                        inv = Inventory.objects.filter(item=line.item, quantity__gt=0, status='AVAILABLE').first()
                        if inv:
                            InventoryService.pick_order_item(oid, line.item.sku, inv.location_code, line.qty_allocated)
                    
                    results.append(f"Picked {order.order_number}")
                except Exception as e:
                    results.append(f"Error picking {oid}: {str(e)}")
            
            return {"success": True, "results": results}
        
    @staticmethod
    def move_item(sku, source_loc, dest_loc, qty, user=None):
        with transaction.atomic():
            try:
                source_inv = Inventory.objects.select_for_update().filter(
                    item__sku=sku, location_code=source_loc
                ).first()
            except Inventory.DoesNotExist:
                return {"error": "Source inventory not found"}

            if not source_inv or source_inv.quantity < qty:
                return {"error": f"Not enough stock. Available: {source_inv.quantity if source_inv else 0}"}

            if not Location.objects.filter(location_code=dest_loc).exists():
                return {"error": f"Invalid Destination: {dest_loc}"}

            dest_inv, created = Inventory.objects.select_for_update().get_or_create(
                item=source_inv.item,
                location_code=dest_loc,
                lot_number=source_inv.lot_number,
                status=source_inv.status, # --- MOVE preserves status ---
                defaults={
                    'quantity': 0, 
                    'version': 0,
                    'expiry_date': source_inv.expiry_date
                }
            )

            source_inv.quantity -= qty
            source_inv.save()
            
            dest_inv.quantity += qty
            dest_inv.save()

            TransactionLog.objects.create(
                action='MOVE',
                sku_snapshot=sku,
                location_snapshot=f"{source_loc} > {dest_loc}",
                quantity_change=qty,
                user=user # [NEW]
            )

            return {"success": True, "message": f"Moved {qty} of {sku} from {source_loc} to {dest_loc}"}
        
    @staticmethod
    def generate_replenishment_tasks():
        configs = LocationConfiguration.objects.filter(is_pick_face=True, item__isnull=False)
        tasks_created = 0

        for config in configs:
            current_inv = Inventory.objects.filter(location_code=config.location_code, item=config.item, status='AVAILABLE').aggregate(total=Sum('quantity'))['total'] or 0
            
            if current_inv < config.min_qty:
                qty_needed = config.max_qty - current_inv
                
                reserve_stock = Inventory.objects.filter(item=config.item, quantity__gt=0, status='AVAILABLE')\
                                                 .exclude(location_code=config.location_code)\
                                                 .order_by('-quantity').first()
                
                if reserve_stock:
                    if ReplenishmentTask.objects.filter(status='PENDING', dest_location=config.location_code, item=config.item).exists():
                        continue

                    to_move = min(qty_needed, reserve_stock.quantity)
                    
                    ReplenishmentTask.objects.create(
                        item=config.item,
                        source_location=reserve_stock.location_code,
                        dest_location=config.location_code,
                        qty_to_move=to_move
                    )
                    tasks_created += 1
        
        return {"success": True, "tasks_created": tasks_created}

    @staticmethod
    def complete_replenishment(task_id):
        with transaction.atomic():
            try:
                task = ReplenishmentTask.objects.select_for_update().get(id=task_id)
            except ReplenishmentTask.DoesNotExist:
                return {"error": "Task not found"}
            
            if task.status == 'COMPLETED':
                return {"error": "Already completed"}

            move_res = InventoryService.move_item(task.item.sku, task.source_location, task.dest_location, task.qty_to_move)
            
            if "error" in move_res:
                return move_res

            task.status = 'COMPLETED'
            task.save()
            return {"success": True}
        
    @staticmethod
    def create_cluster_batch(order_ids, user=None):
        with transaction.atomic():
            # 1. Validate Orders
            orders = Order.objects.filter(id__in=order_ids, status='ALLOCATED', batch__isnull=True)
            if len(orders) != len(order_ids):
                return {"error": "Some orders are not ALLOCATED or already in a batch."}

            # 2. Create Batch
            batch_num = f"BATCH-{random.randint(10000,99999)}"
            batch = PickBatch.objects.create(batch_number=batch_num, picker=user)
            
            # 3. Link Orders
            orders.update(batch=batch)

            return {"success": True, "batch_id": batch.id, "batch_number": batch_num}

    @staticmethod
    def get_cluster_tasks(batch_id):
        """
        Aggregates items from all orders in the batch to minimize walking.
        Returns a list of locations to visit, and what to put in each tote (Order).
        """
        try:
            batch = PickBatch.objects.get(id=batch_id)
        except PickBatch.DoesNotExist:
            return {"error": "Batch not found"}

        # 1. Calculate Total Demand per SKU
        sku_demand = {} # { 'SKU_A': { 'total': 5, 'allocations': [{'order': 'ORD-1', 'qty': 2}, ...] } }
        
        for order in batch.orders.all():
            for line in order.lines.all():
                remaining = line.qty_allocated - line.qty_picked
                if remaining > 0:
                    if line.item.sku not in sku_demand:
                        sku_demand[line.item.sku] = {'total': 0, 'allocations': []}
                    
                    sku_demand[line.item.sku]['total'] += remaining
                    sku_demand[line.item.sku]['allocations'].append({
                        'order_number': order.order_number,
                        'qty': remaining,
                        'line_id': line.id
                    })

        # 2. Find Locations for aggregated demand (FEFO)
        tasks = []
        
        for sku, requirements in sku_demand.items():
            qty_needed = requirements['total']
            
            # Find best bins
            inventory = Inventory.objects.filter(item__sku=sku, quantity__gt=0, status='AVAILABLE').order_by('expiry_date', 'quantity')
            
            for inv in inventory:
                if qty_needed <= 0: break
                
                take = min(inv.quantity, qty_needed)
                
                # Distribute this 'take' quantity among the waiting orders
                current_bin_allocations = []
                take_distributed = take
                
                for alloc in requirements['allocations']:
                    if take_distributed <= 0: break
                    if alloc['qty'] > 0:
                        amount_for_this_order = min(alloc['qty'], take_distributed)
                        current_bin_allocations.append({
                            'order_number': alloc['order_number'],
                            'qty': amount_for_this_order,
                            'line_id': alloc['line_id'] # Needed to update pick status later
                        })
                        alloc['qty'] -= amount_for_this_order
                        take_distributed -= amount_for_this_order

                tasks.append({
                    'location': inv.location_code,
                    'sku': sku,
                    'image_url': "placeholder.png", # Add real image field to Item model if needed
                    'total_qty_to_pick': take,
                    'distribute_to': current_bin_allocations
                })
                
                qty_needed -= take

        # 3. Sort tasks by location (Optimized Walk Path)
        # Simple alpha-sort for now. In production, use Location.x/y or Z-order curve
        tasks.sort(key=lambda x: x['location'])
        
        return tasks
    
    @staticmethod
    def record_short_pick(order_id, sku, location_code, qty_missing, user=None):
        with transaction.atomic():
            try:
                order = Order.objects.select_for_update().get(id=order_id)
                item = Item.objects.get(sku=sku)
                line = order.lines.get(item=item)
            except (Order.DoesNotExist, Item.DoesNotExist, OrderLine.DoesNotExist):
                return {"error": "Invalid Order, Item, or Line"}

            actual_shortage = min(line.qty_allocated, int(qty_missing))
            
            if actual_shortage > 0:
                line.qty_allocated -= actual_shortage
                line.save()
                
                inv = Inventory.objects.select_for_update().filter(
                    item=item, location_code=location_code, status='AVAILABLE'
                ).first()
                
                if inv:
                    inv.reserved_quantity = max(0, inv.reserved_quantity - actual_shortage)
                    inv.save()

            TransactionLog.objects.create(
                action='ADJUST', 
                sku_snapshot=sku,
                location_snapshot=location_code,
                quantity_change=0, 
            )

            system_ref = f"SYS-ERR-{random.randint(1000,9999)}"
            session, _ = CycleCountSession.objects.get_or_create(
                reference=system_ref,
                defaults={'status': 'IN_PROGRESS', 'device_id': 'SYSTEM_AUTO'}
            )
            
            if inv:
                if not CycleCountTask.objects.filter(session=session, inventory=inv).exists():
                    CycleCountTask.objects.create(
                        session=session,
                        inventory=inv,
                        expected_qty=inv.quantity,
                        status='PENDING'
                    )

            if any(l.qty_allocated < l.qty_ordered for l in order.lines.all()):
                order.status = 'PENDING'
                order.save()

            return {
                "success": True, 
                "message": f"Short pick recorded. Cycle Count {system_ref} generated.",
                "new_order_status": order.status
            }
        
    @staticmethod
    def generate_packing_slip_pdf(order_id):
        try:
            order = Order.objects.get(id=order_id)
        except Order.DoesNotExist:
            return None

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # --- Header ---
        p.setFont("Helvetica-Bold", 24)
        p.drawString(50, height - 50, "PACKING SLIP")
        
        p.setFont("Helvetica", 12)
        p.drawString(50, height - 80, f"Order #: {order.order_number}")
        p.drawString(50, height - 100, f"Date: {order.created_at.strftime('%Y-%m-%d')}")

        # --- Company Info (Right Aligned) ---
        p.drawRightString(width - 50, height - 50, "NexWMS Inc.")
        p.drawRightString(width - 50, height - 65, "100 Warehouse Dr.")
        p.drawRightString(width - 50, height - 80, "New York, NY 10001")

        # --- Ship To ---
        p.setFont("Helvetica-Bold", 14)
        p.drawString(50, height - 140, "Ship To:")
        p.setFont("Helvetica", 12)
        p.drawString(50, height - 160, order.customer_name)
        p.drawString(50, height - 175, order.customer_address)
        p.drawString(50, height - 190, f"{order.customer_city}, {order.customer_state} {order.customer_zip}")

        # --- Line Items Table Header ---
        y = height - 230
        p.setFillColor(colors.lightgrey)
        p.rect(40, y-5, width-80, 20, fill=1, stroke=0)
        p.setFillColor(colors.black)
        p.setFont("Helvetica-Bold", 10)
        p.drawString(50, y, "SKU")
        p.drawString(200, y, "ITEM NAME")
        p.drawString(400, y, "ORDERED")
        p.drawString(480, y, "SHIPPED")

        # --- Line Items ---
        y -= 25
        p.setFont("Helvetica", 10)
        
        for line in order.lines.all():
            item_name = line.item.name[:35] + "..." if len(line.item.name) > 35 else line.item.name
            p.drawString(50, y, line.item.sku)
            p.drawString(200, y, item_name)
            p.drawString(400, y, str(line.qty_ordered))
            
            # Bold the shipped quantity for visibility
            p.setFont("Helvetica-Bold", 10)
            p.drawString(480, y, str(line.qty_picked))
            p.setFont("Helvetica", 10)
            
            y -= 20
            if y < 50: # New page if full
                p.showPage()
                y = height - 50

        # --- Footer ---
        p.line(50, 100, width-50, 100)
        p.setFont("Helvetica-Oblique", 10)
        p.drawString(50, 80, "Thank you for your business!")
        p.drawString(50, 65, "For returns, please contact support@nexwms.com")

        p.showPage()
        p.save()
        
        buffer.seek(0)
        return buffer
    
    @staticmethod
    def generate_po_pdf(po_id):
        try:
            po = PurchaseOrder.objects.get(id=po_id)
        except PurchaseOrder.DoesNotExist:
            return None

        buffer = io.BytesIO()
        p = canvas.Canvas(buffer, pagesize=letter)
        width, height = letter

        # Header
        p.setFont("Helvetica-Bold", 20)
        p.drawString(50, height - 50, f"PURCHASE ORDER: {po.po_number}")
        p.setFont("Helvetica", 12)
        p.drawString(50, height - 80, f"Vendor: {po.supplier.name}")
        p.drawString(50, height - 100, f"Date: {po.created_at.strftime('%Y-%m-%d')}")
        p.drawString(50, height - 120, f"Status: {po.status}")

        # Table Header
        y = height - 180
        p.setFillColor(colors.black)
        p.setFont("Helvetica-Bold", 10)
        p.drawString(50, y, "SKU")
        p.drawString(250, y, "QUANTITY ORDERED")
        p.drawString(400, y, "RECEIVED")
        p.line(50, y-5, width-50, y-5)

        # Rows
        y -= 25
        p.setFont("Helvetica", 10)
        for line in po.lines: # 'lines' is a JSON list
            p.drawString(50, y, line.get('sku', ''))
            p.drawString(250, y, str(line.get('qty', 0)))
            p.drawString(400, y, str(line.get('received', 0)))
            y -= 20

        p.showPage()
        p.save()
        buffer.seek(0)
        return buffer
    
    @staticmethod
    def perform_abc_analysis(days=30):
        """
        Analyzes TransactionLogs for the last 30 days to classify items.
        A-Items: Top 20% of movers
        B-Items: Next 30%
        C-Items: Bottom 50%
        """
        cutoff = timezone.now() - timedelta(days=days)
        
        # 1. Aggregate velocity (Total Quantity Moved in PICK/PACK/SHIP actions)
        # We focus on Outbound velocity for slotting optimization
        velocity = TransactionLog.objects.filter(
            timestamp__gte=cutoff, 
            action__in=['PICK', 'PACK', 'SHIP']
        ).values('sku_snapshot').annotate(total_moved=Sum(F('quantity_change') * -1)).order_by('-total_moved')

        # Map SKU to velocity
        sku_velocity = {v['sku_snapshot']: v['total_moved'] for v in velocity}
        
        all_items = list(Item.objects.all())
        # Attach velocity to item objects (default 0 if no moves)
        for item in all_items:
            item._velocity = sku_velocity.get(item.sku, 0)

        # Sort by velocity descending
        all_items.sort(key=lambda x: x._velocity, reverse=True)

        total_count = len(all_items)
        a_limit = int(total_count * 0.2) # Top 20%
        b_limit = int(total_count * 0.5) # Next 30% (up to 50%)

        updates = []
        stats = {'A': 0, 'B': 0, 'C': 0}

        for i, item in enumerate(all_items):
            new_class = 'C'
            if i < a_limit: new_class = 'A'
            elif i < b_limit: new_class = 'B'
            
            if item.abc_class != new_class:
                item.abc_class = new_class
                updates.append(item)
            
            stats[new_class] += 1

        # Bulk update for performance
        Item.objects.bulk_update(updates, ['abc_class'])

        return {"success": True, "updated": len(updates), "stats": stats}