import random
from django.db import transaction
from django.db.models import F
# IMPORTANT: Added PurchaseOrder to imports
from .models import RMA, CycleCountSession, CycleCountTask, Inventory, Item, TransactionLog, Order, OrderLine, RMALine, PurchaseOrder

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

    # --- FIXED PO RECEIVING LOGIC ---
    @staticmethod
    def receive_po_item(po_id, sku, location, qty):
        with transaction.atomic():
            try:
                # Use select_for_update to lock the PO row
                po = PurchaseOrder.objects.select_for_update().get(id=po_id)
            except PurchaseOrder.DoesNotExist:
                return {"error": "PO not found"}

            # 1. Find the line item
            # We must clone the lines list to ensure Django detects the change
            new_lines = list(po.lines) 
            target_line_index = -1
            
            for idx, line in enumerate(new_lines):
                if line['sku'] == sku:
                    target_line_index = idx
                    break
            
            if target_line_index == -1:
                return {"error": "Item not in this PO"}

            target_line = new_lines[target_line_index]

            # 2. Update Receive Count
            received_so_far = target_line.get('received', 0)
            if received_so_far + qty > target_line['qty']:
                return {"error": f"Over-receiving! Ordered: {target_line['qty']}, Received: {received_so_far}"}

            # 3. Increment Physical Inventory
            inv_res = InventoryService.receive_item(sku, location, qty)
            if "error" in inv_res:
                return inv_res

            # 4. Update the Line Data
            target_line['received'] = received_so_far + qty
            new_lines[target_line_index] = target_line # Update list
            po.lines = new_lines # Reassign to trigger dirty flag

            # 5. Update Status
            total_ordered = sum(l['qty'] for l in new_lines)
            total_received = sum(l.get('received', 0) for l in new_lines)

            if total_received >= total_ordered:
                po.status = 'RECEIVED'
            elif total_received > 0:
                po.status = 'ORDERED'
            
            # Force save specific fields
            po.save(update_fields=['lines', 'status'])

            return {"success": True, "po_status": po.status, "line_progress": f"{target_line['received']}/{target_line['qty']}"}

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
                        "location": "Unknown" 
                    }
                
                pick_summary[sku]["total_qty"] += line.qty_allocated
                pick_summary[sku]["orders"].append(order.order_number)
                pick_summary[sku]["order_ids"].append(order.id)
                
                first_inv = Inventory.objects.filter(item__sku=sku, quantity__gt=0).first()
                if first_inv:
                    pick_summary[sku]["location"] = first_inv.location_code

        sorted_pick_list = sorted(list(pick_summary.values()), key=lambda x: x['location'])

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
            # 1. Lock & Validate Source
            try:
                source_inv = Inventory.objects.select_for_update().get(
                    item__sku=sku, location_code=source_loc
                )
            except Inventory.DoesNotExist:
                return {"error": "Source inventory not found"}

            if source_inv.quantity < qty:
                return {"error": f"Not enough stock. Available: {source_inv.quantity}"}

            # 2. Get or Create Destination
            # We use the item object from the source to ensure validity
            dest_inv, created = Inventory.objects.select_for_update().get_or_create(
                item=source_inv.item,
                location_code=dest_loc,
                defaults={'quantity': 0, 'version': 0}
            )

            # 3. Execute Move
            source_inv.quantity -= qty
            source_inv.save()
            
            dest_inv.quantity += qty
            dest_inv.save()

            # 4. Log It
            TransactionLog.objects.create(
                action='MOVE',
                sku_snapshot=sku,
                location_snapshot=f"{source_loc} > {dest_loc}",
                quantity_change=qty
            )

            return {"success": True, "message": f"Moved {qty} of {sku} from {source_loc} to {dest_loc}"}