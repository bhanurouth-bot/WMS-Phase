import random
from django.db import transaction
from django.db.models import F, Sum
from .models import RMA, CycleCountSession, CycleCountTask, Inventory, Item, ReplenishmentTask, TransactionLog, Order, OrderLine, RMALine, PurchaseOrder, Location

class InventoryService:
    
    @staticmethod
    def receive_item(sku, location, quantity, lot_number=None, expiry_date=None, attributes=None):
        with transaction.atomic():
            try:
                item = Item.objects.get(sku=sku)
            except Item.DoesNotExist:
                return {"error": "SKU not found in catalog"}

            if not Location.objects.filter(location_code=location).exists():
                return {"error": f"Invalid Location: {location}. Create it in Layout first."}

            clean_lot = lot_number.strip() if lot_number and lot_number.strip() else None

            inventory, created = Inventory.objects.select_for_update().get_or_create(
                item=item,
                location_code=location,
                lot_number=clean_lot,
                defaults={
                    'quantity': 0, 
                    'version': 0,
                    'expiry_date': expiry_date
                }
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

            inv_res = InventoryService.receive_item(
                sku=sku, 
                location=location, 
                quantity=qty, 
                lot_number=lot_number, 
                expiry_date=expiry_date
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
    def pick_order_item(order_id, item_sku, location_code, qty=1, lot_number=None):
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

            # --- UPDATED LOGIC: Filter by Lot Number if provided ---
            try:
                qs = Inventory.objects.select_for_update().filter(
                    item=item, location_code=location_code, quantity__gt=0
                )
                if lot_number:
                    qs = qs.filter(lot_number=lot_number)
                
                # Default to FEFO (First Expiry) if no specific lot targeted, or as fallback
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
                lot_snapshot=inv.lot_number # Record the specific lot picked
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
            try:
                order = Order.objects.get(id=order_id)
            except Order.DoesNotExist:
                return {"error": "Order not found"}
            
            if order.status not in ['PICKED', 'PACKED']:
                return {"error": f"Order is {order.status}, must be PICKED or PACKED to ship."}

            order.status = 'SHIPPED'
            order.save()
            
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
        with transaction.atomic():
            try:
                rma = RMA.objects.get(id=rma_id)
            except RMA.DoesNotExist:
                return {"error": "RMA not found"}

            if rma.status == 'RECEIVED':
                return {"error": "RMA already processed"}

            for line in rma.lines.all():
                inventory, _ = Inventory.objects.select_for_update().get_or_create(
                    item=line.item,
                    location_code=location_code,
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
        orders = Order.objects.filter(id__in=order_ids, status='ALLOCATED')
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
                
                first_inv = Inventory.objects.filter(item__sku=sku, quantity__gt=0).first()
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
                        inv = Inventory.objects.filter(item=line.item, quantity__gt=0).first()
                        if inv:
                            InventoryService.pick_order_item(oid, line.item.sku, inv.location_code, line.qty_allocated)
                    
                    results.append(f"Picked {order.order_number}")
                except Exception as e:
                    results.append(f"Error picking {oid}: {str(e)}")
            
            return {"success": True, "results": results}
        
    @staticmethod
    def move_item(sku, source_loc, dest_loc, qty):
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
                quantity_change=qty
            )

            return {"success": True, "message": f"Moved {qty} of {sku} from {source_loc} to {dest_loc}"}
        
    @staticmethod
    def generate_replenishment_tasks():
        configs = LocationConfiguration.objects.filter(is_pick_face=True, item__isnull=False)
        tasks_created = 0

        for config in configs:
            current_inv = Inventory.objects.filter(location_code=config.location_code, item=config.item).aggregate(total=Sum('quantity'))['total'] or 0
            
            if current_inv < config.min_qty:
                qty_needed = config.max_qty - current_inv
                
                reserve_stock = Inventory.objects.filter(item=config.item, quantity__gt=0)\
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
                    item=item, location_code=location_code
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