from django.db import models

class Item(models.Model):
    sku = models.CharField(max_length=50, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    attributes = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.sku} - {self.name}"

class Inventory(models.Model):
    item = models.ForeignKey(Item, on_delete=models.CASCADE)
    location_code = models.CharField(max_length=20)
    quantity = models.IntegerField(default=0) 
    reserved_quantity = models.IntegerField(default=0) 
    version = models.IntegerField(default=0)

    class Meta:
        unique_together = ('item', 'location_code')
    
    @property
    def available_quantity(self):
        return self.quantity - self.reserved_quantity

    def __str__(self):
        return f"{self.item.sku} @ {self.location_code}"

class TransactionLog(models.Model):
    ACTION_CHOICES = [
        ('RECEIVE', 'Inbound Receive'),
        ('PICK', 'Outbound Pick'),
        ('ADJUST', 'Inventory Adjustment'),
        ('PACK', 'Order Packed'),
        ('SHIP', 'Order Shipped'),
        ('MOVE', 'Internal Move'), # <--- ADDED THIS
    ]

    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    sku_snapshot = models.CharField(max_length=50)
    location_snapshot = models.CharField(max_length=50) # Increased length to hold "A > B"
    quantity_change = models.IntegerField() 

    def __str__(self):
        return f"[{self.timestamp}] {self.action}: {self.sku_snapshot} ({self.quantity_change})"

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
    
    # --- NEW CUSTOMER FIELDS ---
    customer_email = models.EmailField(blank=True, null=True)
    customer_address = models.CharField(max_length=255, blank=True)
    customer_city = models.CharField(max_length=100, blank=True)
    customer_state = models.CharField(max_length=100, blank=True)
    customer_zip = models.CharField(max_length=20, blank=True)
    customer_country = models.CharField(max_length=50, default="USA")
    # ---------------------------

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
    
    reference = models.CharField(max_length=50, unique=True) # e.g. CC-2025-10-01
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='IN_PROGRESS')
    device_id = models.CharField(max_length=50, blank=True, null=True) # Who created it

    def __str__(self):
        return f"{self.reference} ({self.status})"

class CycleCountTask(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('COUNTED', 'Counted')]
    
    session = models.ForeignKey(CycleCountSession, related_name='tasks', on_delete=models.CASCADE)
    inventory = models.ForeignKey(Inventory, on_delete=models.CASCADE)
    
    expected_qty = models.IntegerField() # Snapshot of system qty at creation
    counted_qty = models.IntegerField(null=True, blank=True)
    variance = models.IntegerField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    
    def __str__(self):
        return f"Count {self.inventory.item.sku} @ {self.inventory.location_code}"