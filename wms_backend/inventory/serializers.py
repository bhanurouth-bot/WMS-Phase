from rest_framework import serializers
from .models import RMA, CycleCountSession, CycleCountTask, Item, Inventory, Location, LocationConfiguration, PickBatch, RMALine, ReplenishmentTask, TransactionLog, Order, OrderLine, Supplier, PurchaseOrder
from django.contrib.auth.models import User, Group

class ItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = Item
        fields = ['id', 'sku', 'name', 'attributes', 'is_serialized', 'abc_class']

class LocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Location
        fields = ['id', 'location_code', 'location_type', 'zone', 'x', 'y']

class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ['id', 'name']

class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)
    groups = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.all(), required=False)
    group_names = serializers.StringRelatedField(many=True, source='groups', read_only=True)

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'is_staff', 'is_active', 'password', 'groups', 'group_names']

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        groups = validated_data.pop('groups', [])
        user = User.objects.create(**validated_data)
        if password:
            user.set_password(password)
            user.save()
        if groups:
            user.groups.set(groups)
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        groups = validated_data.pop('groups', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        if password:
            instance.set_password(password)
            
        if groups is not None:
            instance.groups.set(groups)
            
        instance.save()
        return instance
    
class InventorySerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    item_name = serializers.CharField(source='item.name', read_only=True)
    item_attr = serializers.JSONField(source='item.attributes', read_only=True)

    class Meta:
        model = Inventory
        # --- ADDED 'status' HERE ---
        fields = [
            'id', 'item_id', 'item_sku', 'item_name', 'item_attr', 
            'location_code', 'quantity', 'version', 'reserved_quantity', 
            'available_quantity', 'lot_number', 'expiry_date', 'status'
        ]

class TransactionLogSerializer(serializers.ModelSerializer):
    timestamp = serializers.DateTimeField(format="%Y-%m-%d %H:%M:%S")
    class Meta:
        model = TransactionLog
        fields = '__all__'



class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = '__all__'

class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    class Meta:
        model = PurchaseOrder
        fields = ['id', 'po_number', 'supplier', 'supplier_name', 'status', 'created_at', 'lines']

class OrderLineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    class Meta:
        model = OrderLine
        fields = ['id', 'item', 'item_sku', 'qty_ordered', 'qty_allocated', 'qty_picked']

class OrderSerializer(serializers.ModelSerializer):
    lines = OrderLineSerializer(many=True)

    class Meta:
        model = Order
        fields = [
            'id', 'order_number', 'customer_name', 
            'customer_email', 'customer_address', 'customer_city', 'customer_state', 'customer_zip', 'customer_country',
            'status', 'created_at', 'lines',
            'is_on_hold', 'priority' # <--- Add these
        ]

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        order = Order.objects.create(**validated_data)
        for line_data in lines_data:
            OrderLine.objects.create(order=order, **line_data)
        return order
    

class RMALineSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    class Meta:
        model = RMALine
        fields = ['id', 'item', 'item_sku', 'qty_to_return', 'qty_received']

class RMASerializer(serializers.ModelSerializer):
    lines = RMALineSerializer(many=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer = serializers.CharField(source='order.customer_name', read_only=True)

    class Meta:
        model = RMA
        fields = ['id', 'rma_number', 'order', 'order_number', 'customer', 'status', 'reason', 'created_at', 'lines']

    def create(self, validated_data):
        lines_data = validated_data.pop('lines')
        rma = RMA.objects.create(**validated_data)
        for line_data in lines_data:
            RMALine.objects.create(rma=rma, **line_data)
        return rma
    
class CycleCountTaskSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='inventory.item.sku', read_only=True)
    location = serializers.CharField(source='inventory.location_code', read_only=True)
    
    class Meta:
        model = CycleCountTask
        fields = ['id', 'inventory', 'item_sku', 'location', 'expected_qty', 'counted_qty', 'variance', 'status']

class CycleCountSessionSerializer(serializers.ModelSerializer):
    tasks = CycleCountTaskSerializer(many=True, read_only=True)
    
    class Meta:
        model = CycleCountSession
        fields = ['id', 'reference', 'created_at', 'status', 'tasks']

class LocationConfigurationSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    class Meta:
        model = LocationConfiguration
        fields = ['id', 'location_code', 'is_pick_face', 'item', 'item_sku', 'min_qty', 'max_qty']

class ReplenishmentTaskSerializer(serializers.ModelSerializer):
    item_sku = serializers.CharField(source='item.sku', read_only=True)
    class Meta:
        model = ReplenishmentTask
        fields = ['id', 'item', 'item_sku', 'source_location', 'dest_location', 'qty_to_move', 'status', 'created_at']


class PickBatchSerializer(serializers.ModelSerializer):
    orders = OrderSerializer(many=True, read_only=True)
    
    class Meta:
        model = PickBatch
        fields = ['id', 'batch_number', 'picker', 'status', 'created_at', 'orders']