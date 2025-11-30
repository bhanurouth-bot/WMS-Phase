from datetime import timedelta
from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django.http import HttpResponse, FileResponse
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, F
from django.db.models.functions import TruncHour
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth.models import User, Group

import csv
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter

# Services & Tasks
from .services import InventoryService
from .carrier import CarrierService
from .tasks import generate_wave_plan_task

# Models
from .models import (
    RMA, CycleCountSession, Item, Inventory, Location, LocationConfiguration, 
    PickBatch, PurchaseOrder, ReplenishmentTask, Supplier, TransactionLog, Order
)

# Serializers
from .serializers import (
    CycleCountSessionSerializer, GroupSerializer, ItemSerializer, InventorySerializer, 
    LocationConfigurationSerializer, LocationSerializer, PickBatchSerializer, 
    PurchaseOrderSerializer, RMASerializer, ReplenishmentTaskSerializer, 
    SupplierSerializer, TransactionLogSerializer, OrderSerializer, UserSerializer
)

class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 1000

# --- NEW VIEWSETS FOR USER MANAGEMENT ---
class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('id')
    serializer_class = UserSerializer
    permission_classes = [IsAdminUser] # Security: Only admins can edit users

class GroupViewSet(viewsets.ModelViewSet):
    queryset = Group.objects.all().order_by('name')
    serializer_class = GroupSerializer
    permission_classes = [IsAdminUser]
# ----------------------------------------

class ItemViewSet(viewsets.ModelViewSet):
    queryset = Item.objects.all()
    serializer_class = ItemSerializer

class LocationViewSet(viewsets.ModelViewSet):
    queryset = Location.objects.all().order_by('location_code')
    serializer_class = LocationSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['location_code', 'zone']

    # --- ADD THIS ACTION ---
    @action(detail=True, methods=['get'])
    def bin_label(self, request, pk=None):
        try:
            location = self.get_object()
            # Simple ZPL for a Bin Label (Barcode + Human Readable)
            zpl_code = f"""
            ^XA
            ^CF0,50
            ^FO50,50^FDLOC: {location.zone}^FS
            ^CF0,100
            ^FO50,110^FD{location.location_code}^FS
            ^BY3,2,150
            ^FO50,250^BC^FD{location.location_code}^FS
            ^CF0,30
            ^FO50,450^FDType: {location.location_type}^FS
            ^XZ
            """
            return HttpResponse(zpl_code.strip(), content_type="text/plain")
        except Exception as e:
            return Response({'error': str(e)}, status=500)

class InventoryViewSet(viewsets.ModelViewSet):
    queryset = Inventory.objects.all().select_related('item').order_by('location_code')
    serializer_class = InventorySerializer
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['item__sku', 'item__name', 'location_code']
    filterset_fields = ['location_code', 'item__sku']
    pagination_class = StandardResultsSetPagination

    @action(detail=False, methods=['post'])
    def receive(self, request):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('quantity', 1))
        lot_number = request.data.get('lot_number')
        expiry_date = request.data.get('expiry_date')
        inv_status = request.data.get('status', 'AVAILABLE') 

        if not all([sku, location]):
            return Response({'error': 'SKU and Location required'}, status=400)

        result = InventoryService.receive_item(sku, location, qty, lot_number, expiry_date, inv_status, serials=None, user=request.user)
        return Response(result)

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
            zpl_code = f"^XA^FO50,50^ADN,36,20^FD{inv.item.name[:25]}^FS^FO50,100^ADN,18,10^FDSKU: {inv.item.sku}^FS^FO50,130^ADN,18,10^FDLOC: {inv.location_code}^FS^FO50,180^BY2,2,100^BCN,100,Y,N,N^FD{inv.item.sku}^FS^XZ"
            return HttpResponse(zpl_code, content_type="text/plain")
        except Exception as e:
            return Response({'error': str(e)}, status=500)
        
    @action(detail=False, methods=['get'])
    def suggest_location(self, request):
        sku = request.query_params.get('sku')
        if not sku: return Response({'error': 'SKU parameter required'}, status=400)
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

        result = InventoryService.move_item(sku, source_loc, dest_loc, qty, user=request.user)
        return Response(result)
    
    @action(detail=False, methods=['post'])
    def run_abc_analysis(self, request):
        result = InventoryService.perform_abc_analysis()
        return Response(result)
    
    @action(detail=False, methods=['get'])
    def export(self, request):
        # Define the variable 'export_type'
        export_type = request.query_params.get('export_format', 'csv')
        queryset = self.filter_queryset(self.get_queryset())

        # Check 'export_type' for CSV
        if export_type == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = 'attachment; filename="inventory.csv"'
            writer = csv.writer(response)
            writer.writerow(['SKU', 'Name', 'Location', 'Qty', 'Status', 'Lot', 'Expiry'])
            for inv in queryset:
                writer.writerow([
                    inv.item.sku, inv.item.name, inv.location_code, 
                    inv.quantity, inv.status, inv.lot_number, inv.expiry_date
                ])
            return response

        # Check 'export_type' for PDF (Fix: ensure this matches the variable defined above)
        elif export_type == 'pdf':
            response = HttpResponse(content_type='application/pdf')
            response['Content-Disposition'] = 'attachment; filename="inventory.pdf"'
            
            doc = SimpleDocTemplate(response, pagesize=letter)
            elements = []
            styles = getSampleStyleSheet()
            
            elements.append(Paragraph("Inventory Report", styles['Title']))
            
            data = [['SKU', 'Location', 'Qty', 'Status', 'Lot']]
            for inv in queryset:
                data.append([
                    inv.item.sku, inv.location_code, str(inv.quantity), 
                    inv.status, inv.lot_number or '-'
                ])
            
            table = Table(data)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('GRID', (0, 0), (-1, -1), 1, colors.black)
            ]))
            elements.append(table)
            
            try:
                doc.build(elements)
            except Exception as e:
                return Response({'error': f"PDF Generation Error: {str(e)}"}, status=500)
                
            return response
            
        return Response({'error': 'Invalid format'}, status=400)
    
    @staticmethod
    def update_lot(inventory_id, new_lot_number, new_expiry_date=None, user=None):
        with transaction.atomic():
            try:
                inv = Inventory.objects.select_for_update().get(id=inventory_id)
            except Inventory.DoesNotExist:
                return {"error": "Inventory not found"}

            old_lot = inv.lot_number
            clean_new_lot = new_lot_number.strip() if new_lot_number else None
            
            # If nothing changed, just update expiry
            if old_lot == clean_new_lot:
                 if inv.expiry_date != new_expiry_date:
                     inv.expiry_date = new_expiry_date
                     inv.save()
                     return {"success": True, "message": "Expiry updated"}
                 return {"success": True, "message": "No changes"}

            # Check if target lot already exists in this location
            target_inv = Inventory.objects.filter(
                item=inv.item,
                location_code=inv.location_code,
                status=inv.status,
                lot_number=clean_new_lot
            ).exclude(id=inv.id).first()

            if target_inv:
                # MERGE LOGIC: Add qty to target, delete old record
                target_inv.quantity += inv.quantity
                target_inv.version += 1
                if new_expiry_date:
                    target_inv.expiry_date = new_expiry_date
                target_inv.save()
                
                # Log the merge
                TransactionLog.objects.create(
                    action='ADJUST',
                    sku_snapshot=inv.item.sku,
                    location_snapshot=inv.location_code,
                    quantity_change=inv.quantity,
                    lot_snapshot=f"Merged {old_lot or 'N/A'} into {clean_new_lot}",
                    user=user
                )
                inv.delete()
            else:
                # UPDATE IN PLACE
                inv.lot_number = clean_new_lot
                inv.expiry_date = new_expiry_date
                inv.version += 1
                inv.save()

                TransactionLog.objects.create(
                    action='ADJUST',
                    sku_snapshot=inv.item.sku,
                    location_snapshot=inv.location_code,
                    quantity_change=0, 
                    lot_snapshot=f"Changed {old_lot or 'N/A'} to {clean_new_lot}",
                    user=user
                )

            return {"success": True}
        
    @action(detail=True, methods=['post'])
    def assign_lot(self, request, pk=None):
        new_lot = request.data.get('lot_number')
        new_expiry = request.data.get('expiry_date')
        result = InventoryService.update_lot(pk, new_lot, new_expiry, request.user)
        if "error" in result: return Response(result, status=400)
        return Response(result)
    
    

class TransactionLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = TransactionLog.objects.all().order_by('-timestamp')
    serializer_class = TransactionLogSerializer

class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by('-created_at')
    serializer_class = OrderSerializer
    pagination_class = StandardResultsSetPagination

    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        result = InventoryService.allocate_order(pk)
        if "error" in result: return Response(result, status=400)
        return Response(result)
    
    @action(detail=True, methods=['post'])
    def pick_item(self, request, pk=None):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('qty', 1))
        lot_number = request.data.get('lot_number') 
        result = InventoryService.pick_order_item(pk, sku, location, qty, lot_number)
        if "error" in result: return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def pack(self, request, pk=None):
        result = InventoryService.pack_order(pk)
        if "error" in result: return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def ship(self, request, pk=None):
        result = InventoryService.ship_order(pk)
        if "error" in result: return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['get'])
    def shipping_label(self, request, pk=None):
        order = self.get_object()
        zpl_code = CarrierService.generate_label(order)
        return HttpResponse(zpl_code.strip(), content_type="text/plain")
        
    @action(detail=False, methods=['post'])
    def wave_plan(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids: return Response({'error': 'No order IDs provided'}, status=400)
        
        # Execute synchronously to avoid Celery connection errors locally
        result = InventoryService.generate_wave_plan(order_ids)
        
        if result.get('success'):
            return Response(result, status=200)
        else:
            return Response(result, status=400)

    @action(detail=False, methods=['post'])
    def wave_complete(self, request):
        order_ids = request.data.get('order_ids', [])
        if not order_ids: return Response({'error': 'No order IDs provided'}, status=400)
        result = InventoryService.complete_wave(order_ids)
        return Response(result)
    
    @action(detail=True, methods=['post'])
    def short_pick(self, request, pk=None):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('qty', 1))
        result = InventoryService.record_short_pick(pk, sku, location, qty)
        if "error" in result: return Response(result, status=400)
        return Response(result)
    
    @action(detail=True, methods=['get'])
    def packing_slip(self, request, pk=None):
        pdf_buffer = InventoryService.generate_packing_slip_pdf(pk)
        if not pdf_buffer: return Response({'error': 'Order not found'}, status=404)
        return FileResponse(pdf_buffer, as_attachment=True, filename=f"packing_slip_{pk}.pdf")
    
class PickBatchViewSet(viewsets.ModelViewSet):
    queryset = PickBatch.objects.all()
    serializer_class = PickBatchSerializer

    @action(detail=False, methods=['post'])
    def create_cluster(self, request):
        order_ids = request.data.get('order_ids', [])
        res = InventoryService.create_cluster_batch(order_ids, request.user)
        if "error" in res: return Response(res, status=400)
        return Response(res)

    @action(detail=True, methods=['get'])
    def tasks(self, request, pk=None):
        res = InventoryService.get_cluster_tasks(pk)
        if "error" in res: return Response(res, status=400)
        return Response(res)

class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all()
    serializer_class = SupplierSerializer

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.all().order_by('-created_at')
    serializer_class = PurchaseOrderSerializer
    pagination_class = StandardResultsSetPagination

    @action(detail=False, methods=['post'])
    def auto_replenish(self, request):
        low_stock_items = Inventory.objects.filter(quantity__lt=10)
        if not low_stock_items.exists():
            return Response({"message": "No low stock items found."}, status=200)

        supplier, _ = Supplier.objects.get_or_create(name="Global Supplies Inc.", defaults={"contact_email": "orders@globalsupplies.com"})
        lines = [{"sku": inv.item.sku, "qty": 50 - inv.quantity, "received": 0} for inv in low_stock_items]
        
        next_id = PurchaseOrder.objects.count() + 1
        po_number = f"PO-{next_id:05d}"
        while PurchaseOrder.objects.filter(po_number=po_number).exists():
            next_id += 1
            po_number = f"PO-{next_id:05d}"

        po = PurchaseOrder.objects.create(supplier=supplier, po_number=po_number, status='DRAFT', lines=lines)
        return Response({"message": f"Created PO {po.po_number}", "po_id": po.id})

    @action(detail=True, methods=['post'])
    def receive_item(self, request, pk=None):
        sku = request.data.get('sku')
        location = request.data.get('location')
        qty = int(request.data.get('qty', 1))
        lot_number = request.data.get('lot_number')
        expiry_date = request.data.get('expiry_date')
        if not location or not sku: return Response({'error': 'Location and SKU required'}, status=400)
        result = InventoryService.receive_po_item(pk, sku, location, qty, lot_number, expiry_date)
        if "error" in result: return Response(result, status=400)
        return Response(result)
    
    @action(detail=True, methods=['get'])
    def download_pdf(self, request, pk=None):
        pdf_buffer = InventoryService.generate_po_pdf(pk)
        if not pdf_buffer:
            return Response({'error': 'PO not found'}, status=404)
        return FileResponse(pdf_buffer, as_attachment=True, filename=f"po_{pk}.pdf")

class RMAViewSet(viewsets.ModelViewSet):
    queryset = RMA.objects.all().order_by('-created_at')
    serializer_class = RMASerializer

    @action(detail=True, methods=['post'])
    def process_receipt(self, request, pk=None):
        location = request.data.get('location', 'RETURNS-DOCK')
        result = InventoryService.process_return_receipt(pk, location)
        if "error" in result: return Response(result, status=400)
        return Response(result)

class CycleCountViewSet(viewsets.ModelViewSet):
    queryset = CycleCountSession.objects.all().order_by('-created_at')
    serializer_class = CycleCountSessionSerializer
    pagination_class = StandardResultsSetPagination

    @action(detail=False, methods=['post'])
    def generate(self, request):
        limit = int(request.data.get('limit', 5))
        aisle = request.data.get('aisle', None)
        result = InventoryService.create_cycle_count(aisle, limit)
        if "error" in result: return Response(result, status=400)
        return Response(result)

    @action(detail=True, methods=['post'])
    def submit_task(self, request, pk=None):
        task_id = request.data.get('task_id')
        qty = int(request.data.get('qty', 0))
        result = InventoryService.submit_count(task_id, qty)
        if "error" in result: return Response(result, status=400)
        return Response(result)
    
    @action(detail=False, methods=['post'])
    def create_for_location(self, request):
        location_code = request.data.get('location')
        if not location_code: return Response({'error': 'Location required'}, status=400)
        result = InventoryService.create_location_count(location_code)
        if "error" in result: return Response(result, status=400)
        return Response(result)

class LocationConfigurationViewSet(viewsets.ModelViewSet):
    queryset = LocationConfiguration.objects.all()
    serializer_class = LocationConfigurationSerializer

class ReplenishmentTaskViewSet(viewsets.ModelViewSet):
    queryset = ReplenishmentTask.objects.all().order_by('-created_at')
    serializer_class = ReplenishmentTaskSerializer

    @action(detail=False, methods=['post'])
    def generate(self, request):
        res = InventoryService.generate_replenishment_tasks()
        return Response(res)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        res = InventoryService.complete_replenishment(pk)
        if "error" in res: return Response(res, status=400)
        return Response(res)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user(request):
    user = request.user
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'is_staff': user.is_staff,
        'is_active': user.is_active,
        'groups': list(user.groups.values_list('id', flat=True)),
        'initials': f"{user.first_name[:1]}{user.last_name[:1]}".upper() if user.first_name else user.username[:2].upper()
    })

@api_view(['GET'])
def dashboard_stats(request):
    total_stock = Inventory.objects.aggregate(sum=Sum('quantity'))['sum'] or 0
    total_locations = Inventory.objects.count()
    low_stock = Inventory.objects.filter(quantity__lt=10).count()
    recent_moves = TransactionLog.objects.count()
    heatmap = TransactionLog.objects.values('location_snapshot').annotate(activity=Count('id')).order_by('-activity')[:10]

    return Response({
        "total_stock": total_stock,
        "total_locations": total_locations,
        "low_stock": low_stock,
        "recent_moves": recent_moves,
        "heatmap": list(heatmap)
    })

# --- NEW VIEW FOR REPORTS ---
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def user_performance_stats(request):
    user_stats = TransactionLog.objects.values('user__username').annotate(total_actions=Count('id')).order_by('-total_actions')
    
    last_24h = timezone.now() - timedelta(hours=24)
    picks_per_hour = TransactionLog.objects.filter(timestamp__gte=last_24h, action='PICK')\
        .annotate(hour=TruncHour('timestamp'))\
        .values('hour', 'user__username')\
        .annotate(count=Count('id'))\
        .order_by('hour')

    return Response({
        "leaderboard": list(user_stats),
        "hourly_picks": list(picks_per_hour)
    })
# ----------------------------