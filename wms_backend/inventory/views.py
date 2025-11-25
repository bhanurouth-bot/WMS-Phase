from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import HttpResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, F
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated

from .serializers import CycleCountSessionSerializer, ItemSerializer, InventorySerializer, PurchaseOrderSerializer, RMASerializer, SupplierSerializer, TransactionLogSerializer, OrderSerializer
from .models import RMA, CycleCountSession, Item, Inventory, PurchaseOrder, Supplier, TransactionLog, Order
from .services import InventoryService

class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer

class InventoryViewSet(viewsets.ModelViewSet):
    queryset = Inventory.objects.all().select_related('item').order_by('location_code')
    serializer_class = InventorySerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['item__sku', 'item__name', 'location_code']
    filterset_fields = ['location_code', 'item__sku']

    @action(detail=False, methods=['post'])
    def receive(self, request):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('quantity', 1))

        if not all([sku, location]):
            return Response({'error': 'SKU and Location required'}, status=400)

        result = InventoryService.receive_item(sku, location, qty)
        if "error" in result:
            return Response(result, status=400)
        return Response(result, status=200)

    @action(detail=True, methods=['post'])
    def pick(self, request, pk=None):
        qty = int(request.data.get('quantity', 1))
        result = InventoryService.pick_item(pk, qty)
        if "error" in result:
            status_code = 409 if "Race" in result['error'] else 400
            return Response(result, status=status_code)
        return Response(result, status=200)

    @action(detail=True, methods=['get'])
    def zpl_label(self, request, pk=None):
        try:
            inv = self.get_object()
            zpl_code = f"""
            ^XA
            ^FO50,50^ADN,36,20^FD{inv.item.name[:25]}^FS
            ^FO50,100^ADN,18,10^FDSKU: {inv.item.sku}^FS
            ^FO50,130^ADN,18,10^FDLOC: {inv.location_code}^FS
            ^FO50,180^BY2,2,100^BCN,100,Y,N,N^FD{inv.item.sku}^FS
            ^XZ
            """
            return HttpResponse(zpl_code.strip(), content_type="text/plain")
        except Exception as e:
            return Response({'error': str(e)}, status=500)
        
    @action(detail=False, methods=['get'])
    def suggest_location(self, request):
        sku = request.query_params.get('sku')
        if not sku:
            return Response({'error': 'SKU parameter required'}, status=400)
        
        result = InventoryService.suggest_putaway_location(sku)
        return Response(result)
    
    @action(detail=False, methods=['post'])
    def move(self, request):
        sku = request.data.get('sku')
        source_loc = request.data.get('source_location')
        dest_loc = request.data.get('dest_location')
        qty = int(request.data.get('quantity', 1))

        if not all([sku, source_loc, dest_loc]):
            return Response({'error': 'Source, Dest, and SKU required'}, status=400)

        result = InventoryService.move_item(sku, source_loc, dest_loc, qty)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

class TransactionLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TransactionLog.objects.all().order_by('-timestamp')
    serializer_class = TransactionLogSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer

    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        result = InventoryService.allocate_order(pk)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)
    
    @action(detail=True, methods=['post'])
    def pick_item(self, request, pk=None):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('qty', 1))
        result = InventoryService.pick_order_item(pk, sku, location, qty)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def pack(self, request, pk=None):
        result = InventoryService.pack_order(pk)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        result = InventoryService.ship_order(pk)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['get'])
    def shipping_label(self, request, pk=None):
        try:
            order = self.get_object()
            if order.status not in ['SHIPPED', 'PACKED']:
                 return Response({'error': 'Order must be PACKED or SHIPPED to generate label'}, status=400)

            addr = order.customer_address or "No Address Provided"
            city = order.customer_city or "Unknown City"
            state = order.customer_state or "XX"
            zip_code = order.customer_zip or "00000"

            zpl_code = f"""
            ^XA
            ^FX Top section
            ^CF0,60
            ^FO50,50^GB100,100,100^FS
            ^FO75,75^FR^GB100,100,100^FS
            ^FO93,93^GB40,40,40^FS
            ^FO220,50^FDIntershipping, Inc.^FS
            ^CF0,30
            ^FO220,115^FD1000 Shipping Lane^FS
            ^FO220,155^FDShelbyville TN 38102^FS
            ^FO220,195^FDUnited States (USA)^FS
            ^FO50,250^GB700,3,3^FS

            ^FX Recipient
            ^CF0,30
            ^FO50,300^FD{order.customer_name}^FS
            ^FO50,340^FD{addr}^FS
            ^FO50,380^FD{city}, {state} {zip_code}^FS
            ^CFA,30
            ^FO50,430^FDOrder #: {order.order_number}^FS
            ^FO50,470^FDSKU Count: {order.lines.count()}^FS
            ^FO50,530^GB700,3,3^FS

            ^FX Barcode
            ^BY5,2,270
            ^FO100,580^BC^FD{order.order_number}^FS
            ^XZ
            """
            return HttpResponse(zpl_code.strip(), content_type="text/plain")
        except Exception as e:
            return Response({'error': str(e)}, status=500)
        
    @action(detail=False, methods=['post'])
    def wave_plan(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
             return Response({'error': 'No order IDs provided'}, status=400)
             
        result = InventoryService.generate_wave_plan(order_ids)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

    @action(detail=False, methods=['post'])
    def wave_complete(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids:
             return Response({'error': 'No order IDs provided'}, status=400)

        result = InventoryService.complete_wave(order_ids)
        return Response(result)

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.all().order_by('-created_at')
    serializer_class = PurchaseOrderSerializer

    @action(detail=False, methods=['post'])
    def auto_replenish(self, request):
        """
        Finds items with < 10 quantity and creates a Draft PO.
        NOW USES SEQUENTIAL SERIAL NUMBERS (e.g. PO-00001).
        """
        low_stock_items = Inventory.objects.filter(quantity__lt=10)
        if not low_stock_items.exists():
            return Response({"message": "No low stock items found."}, status=200)

        supplier, _ = Supplier.objects.get_or_create(
            name="Global Supplies Inc.", 
            defaults={"contact_email": "orders@globalsupplies.com"}
        )

        lines = []
        for inv in low_stock_items:
            # Simple logic: Order enough to get to 50
            qty_needed = 50 - inv.quantity
            lines.append({"sku": inv.item.sku, "qty": qty_needed, "received": 0})

        # --- FIXED: SEQUENTIAL PO GENERATION ---
        # Get the count of existing POs to determine the next number
        next_id = PurchaseOrder.objects.count() + 1
        po_number = f"PO-{next_id:05d}" # e.g. PO-00001

        # Loop to handle potential collisions with deleted records or existing random ones
        while PurchaseOrder.objects.filter(po_number=po_number).exists():
            next_id += 1
            po_number = f"PO-{next_id:05d}"

        po = PurchaseOrder.objects.create(
            supplier=supplier,
            po_number=po_number,
            status='DRAFT',
            lines=lines
        )

        return Response({"message": f"Created PO {po.po_number}", "po_id": po.id})

    @action(detail=True, methods=['post'])
    def receive_item(self, request, pk=None):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('qty', 1))
        
        result = InventoryService.receive_po_item(pk, sku, location, qty)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

class RMAViewSet(viewsets.ModelViewSet):
    queryset = RMA.objects.all().order_by('-created_at')
    serializer_class = RMASerializer

    @action(detail=True, methods=['post'])
    def process_receipt(self, request, pk=None):
        # Allow overriding the return location (e.g., QA-01)
        location = request.data.get('location', 'RETURNS-DOCK')
        result = InventoryService.process_return_receipt(pk, location)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

class CycleCountViewSet(viewsets.ModelViewSet):
    queryset = CycleCountSession.objects.all().order_by('-created_at')
    serializer_class = CycleCountSessionSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        limit = int(request.data.get('limit', 5))
        aisle = request.data.get('aisle', None)
        result = InventoryService.create_cycle_count(aisle, limit)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def submit_task(self, request, pk=None):
        # pk here refers to the SESSION id, but we need TASK id from body
        task_id = request.data.get('task_id')
        qty = int(request.data.get('qty', 0))
        
        result = InventoryService.submit_count(task_id, qty)
        if "error" in result:
            return Response(result, status=400)
        return Response(result)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    """
    Return the currently logged-in user's details.
    """
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_staff': user.is_staff,
        'initials': f"{user.first_name[:1]}{user.last_name[:1]}".upper() if user.first_name else user.username[:2].upper()
    })

@api_view(['GET'])
def dashboard_stats(request):
    total_stock = Inventory.objects.aggregate(sum=Sum('quantity'))['sum'] or 0
    total_locations = Inventory.objects.count()
    low_stock = Inventory.objects.filter(quantity__lt=10).count()
    recent_moves = TransactionLog.objects.count()

    return Response({
        "total_stock": total_stock,
        "total_locations": total_locations,
        "low_stock": low_stock,
        "recent_moves": recent_moves
    })