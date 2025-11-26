from django.db import models

class Item(models.Model):
    sku = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    attributes = models.JSONField(default=dict, blank=True)
    is_serialized = models.BooleanField(default=False) # Track if this item needs serials

    def __str__(self):
        return f"{self.sku} - {self.name}"

class Location(models.Model):
    LOCATION_TYPES = [
        ('PICK', 'Pick Face'),
        ('RESERVE', 'Reserve Storage'),
        ('DOCK', 'Dock Door'),
        ('STAGING', 'Staging Area'),
    ]
    
    location_code = models.CharField(max_length=20, unique=True) 
    location_type = models.CharField(max_length=20, choices=LOCATION_TYPES, default='RESERVE')
    zone = models.CharField(max_length=10, blank=True) 
    
    x = models.IntegerField(default=0)
    y = models.IntegerField(default=0)
    
    def __str__(self):
        return f"{self.location_code} ({self.location_type})"

class Inventory(models.Model):
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('QUARANTINE', 'Quarantine'),
        ('DAMAGED', 'Damaged'),
    ]

    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    location_code = models.CharField(max_length=20)
    quantity = models.IntegerField(default=0) 
    reserved_quantity = models.IntegerField(default=0) 
    version = models.IntegerField(default=0)
    lot_number = models.CharField(max_length=50, blank=True, null=True)
    expiry_date = models.DateField(blank=True, null=True)
    
    # --- NEW FIELD ---
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')

    class Meta:
        # Update unique_together to include status
        unique_together = ('item', 'location_code', 'lot_number', 'status')
    
    @property
    def available_quantity(self):
        return self.quantity - self.reserved_quantity

    def __str__(self):
        return f"{self.item.sku} @ {self.location_code} ({self.status})"

class TransactionLog(models.Model):
    ACTION_CHOICES = [
        ('RECEIVE', 'Inbound Receive'),
        ('PICK', 'Outbound Pick'),
        ('ADJUST', 'Inventory Adjustment'),
        ('PACK', 'Order Packed'),
        ('SHIP', 'Order Shipped'),
        ('MOVE', 'Internal Move'),
    ]

    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    sku_snapshot = models.CharField(max_length=50)
    location_snapshot = models.CharField(max_length=50)
    quantity_change = models.IntegerField() 
    lot_snapshot = models.CharField(max_length=50, blank=True, null=True)

    def __str__(self):
        return f"[{self.timestamp}] {self.action}: {self.sku_snapshot} ({self.quantity_change})"

class SerialNumber(models.Model):
    STATUS_CHOICES = [
        ('IN_STOCK', 'In Stock'),
        ('PACKED', 'Packed'),
        ('SHIPPED', 'Shipped'),
        ('RETURNED', 'Returned'),
    ]
    
    serial = models.CharField(max_length=100, unique=True)
    item = models.ForeignKey(Item, on_delete=models.CASCADE, related_name='serials')
    location = models.ForeignKey('Location', on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IN_STOCK')
    
    # Link to specific inventory batch (optional but helpful)
    inventory = models.ForeignKey('Inventory', on_delete=models.SET_NULL, null=True, blank=True)
    
    # Link to outbound order line when allocated/shipped
    allocated_to = models.ForeignKey('OrderLine', on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_serials')
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"SN: {self.serial} ({self.item.sku})"

class Supplier(models.Model):
    name = models.CharField(max_length=200)
    contact_email = models.EmailField()
    
    def __str__(self):
        return self.name

class PurchaseOrder(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('ORDERED', 'Ordered'),
        ('RECEIVED', 'Received'),
    ]
    supplier = models.ForeignKey(Supplier, on_delete=models.CASCADE)
    po_number = models.CharField(max_length=50, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    lines = models.JSONField(default=list) 

    def __str__(self):
        return f"{self.po_number} - {self.supplier.name}"

class Order(models.Model):
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('ALLOCATED', 'Allocated'),
        ('PICKED', 'Picked'),
        ('PACKED', 'Packed'),
        ('SHIPPED', 'Shipped'),
    ]
    
    order_number = models.CharField(max_length=50, unique=True)
    customer_name = models.CharField(max_length=100)
    
    customer_email = models.EmailField(blank=True, null=True)
    customer_address = models.CharField(max_length=255, blank=True)
    customer_city = models.CharField(max_length=100, blank=True)
    customer_state = models.CharField(max_length=100, blank=True)
    customer_zip = models.CharField(max_length=20, blank=True)
    customer_country = models.CharField(max_length=50, default="USA")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order {self.order_number} ({self.status})"

class OrderLine(models.Model):
    order = models.ForeignKey(Order, related_name='lines', on_delete=models.CASCADE)
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    qty_ordered = models.IntegerField()
    qty_allocated = models.IntegerField(default=0)
    qty_picked = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.item.sku}: {self.qty_picked}/{self.qty_ordered}"
    
class RMA(models.Model):
    STATUS_CHOICES = [
        ('REQUESTED', 'Requested'),
        ('APPROVED', 'Approved'),
        ('RECEIVED', 'Received (Restocked)'),
        ('REJECTED', 'Rejected'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE)
    rma_number = models.CharField(max_length=50, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='REQUESTED')
    reason = models.TextField(blank=True)

    def __str__(self):
        return f"{self.rma_number} (Order {self.order.order_number})"

class RMALine(models.Model):
    rma = models.ForeignKey(RMA, related_name='lines', on_delete=models.CASCADE)
    item = models.ForeignKey(Item, on_delete=models.PROTECT)
    qty_to_return = models.IntegerField()
    qty_received = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.item.sku}: {self.qty_to_return}"
    
class CycleCountSession(models.Model):
    STATUS_CHOICES = [('IN_PROGRESS', 'In Progress'), ('COMPLETED', 'Completed')]
    
    reference = models.CharField(max_length=50, unique=True) 
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IN_PROGRESS')
    device_id = models.CharField(max_length=50, blank=True, null=True) 

    def __str__(self):
        return f"{self.reference} ({self.status})"

class CycleCountTask(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('COUNTED', 'Counted')]
    
    session = models.ForeignKey(CycleCountSession, related_name='tasks', on_delete=models.CASCADE)
    inventory = models.ForeignKey(Inventory, on_delete=models.CASCADE)
    
    expected_qty = models.IntegerField() 
    counted_qty = models.IntegerField(null=True, blank=True)
    variance = models.IntegerField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    def __str__(self):
        return f"Count {self.inventory.item.sku} @ {self.inventory.location_code}"
    
class LocationConfiguration(models.Model):
    location_code = models.CharField(max_length=20, unique=True)
    is_pick_face = models.BooleanField(default=False) 
    item = models.ForeignKey(Item, on_delete=models.CASCADE, null=True, blank=True) 
    min_qty = models.IntegerField(default=10) 
    max_qty = models.IntegerField(default=100) 

    def __str__(self):
        return f"Config {self.location_code} ({self.item.sku if self.item else 'Any'})"

class ReplenishmentTask(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('COMPLETED', 'Completed')]
    
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    source_location = models.CharField(max_length=20) 
    dest_location = models.CharField(max_length=20)   
    qty_to_move = models.IntegerField()
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Replenish {self.item.sku}: {self.source_location} -> {self.dest_location} ({self.qty_to_move})"