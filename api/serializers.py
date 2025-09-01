import cloudinary.uploader
from rest_framework import serializers
from menu.models import Category, MenuItem, Order, OrderItem, QRCode
from menu.models import VisitorLog, ActivityLog, DailyRevenue



class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class MenuItemSerializer(serializers.ModelSerializer):
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    category_details = CategorySerializer(source='category', read_only=True)
    image_url = serializers.SerializerMethodField()
    image = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'description', 'price', 'image', 'image_url', 'category', 'category_details', 'is_available']

    def get_image_url(self, obj):
        if obj.image:
            request = self.context.get('request')
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return None

    def create(self, validated_data):        
        # Let Django handle the image storage (temporary fallback)
        try:
            menu_item = MenuItem.objects.create(**validated_data)
            return menu_item
        except Exception as e:
            print("CREATE ERROR:", str(e))
            raise serializers.ValidationError(f"Error creating menu item: {str(e)}")

    def update(self, instance, validated_data):
        
        # Let Django handle the image storage (temporary fallback)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        try:
            instance.save()
            return instance
        except Exception as e:
            print("UPDATE ERROR:", str(e))
            raise serializers.ValidationError(f"Error updating menu item: {str(e)}")

class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    
    class Meta:
        model = OrderItem
        fields = ['id', 'menu_item', 'menu_item_name', 'quantity', 'price_at_order']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Order
        fields = ['id', 'table_number', 'status', 'total_price', 'created_at', 'updated_at', 'items']


class OrderCreateSerializer(serializers.ModelSerializer):
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True
    )
    
    class Meta:
        model = Order
        fields = ['id','table_number', 'items']
    
    def create(self, validated_data):
        items_data = validated_data.pop('items')
        order = Order.objects.create(**validated_data)
        total_price = 0
        
        for item_data in items_data:
            try:
                menu_item = MenuItem.objects.get(id=item_data['menu_item_id'], is_available=True)
                quantity = item_data.get('quantity', 1)
                price_at_order = menu_item.price
                
                OrderItem.objects.create(
                    order=order,
                    menu_item=menu_item,
                    quantity=quantity,
                    price_at_order=price_at_order
                )
                
                total_price += price_at_order * quantity
            except MenuItem.DoesNotExist:
                continue
        
        order.total_price = total_price
        order.save()
        return order
    
    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Items list cannot be empty.")
        
        for item in value:
            if 'menu_item_id' not in item:
                raise serializers.ValidationError("Each item must have a menu_item_id.")
            
            if not isinstance(item.get('quantity', 1), int) or item.get('quantity', 1) < 1:
                raise serializers.ValidationError("Quantity must be a positive integer.")
        
        return value


class QRCodeSerializer(serializers.ModelSerializer):
    qr_code_url = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()

    class Meta:
        model = QRCode
        fields = ['id', 'uuid', 'table_number', 'qr_code_url', 'logo_url', 'qr_color', 'created_at']

    def get_qr_code_url(self, obj):
        request = self.context.get('request')
        if obj.image and hasattr(obj.image, 'url'):
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return None

    def get_logo_url(self, obj):
        request = self.context.get('request')
        if obj.logo_image and hasattr(obj.logo_image, 'url'):
            return request.build_absolute_uri(obj.logo_image.url) if request else obj.logo_image.url
        return None


class QRCodeCreateSerializer(serializers.ModelSerializer):
    logo = serializers.ImageField(write_only=True, required=False)

    def validate_logo(self, value):
        if value:
            # Validate file size (e.g., max 1MB)
            if value.size > 1_000_000:
                raise serializers.ValidationError("Logo file size must be less than 1MB.")
        return value

    class Meta:
        model = QRCode
        fields = ['table_number', 'qr_color', 'logo']
        

class VisitorLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = VisitorLog
        fields = '__all__'

class ActivityLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True, allow_null=True)
    
    class Meta:
        model = ActivityLog
        fields = '__all__'

class DailyRevenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyRevenue
        fields = '__all__'

class AnalyticsSummarySerializer(serializers.Serializer):
    total_visitors = serializers.IntegerField()
    total_anonymous = serializers.IntegerField()
    total_customers = serializers.IntegerField()
    total_managers = serializers.IntegerField()
    total_orders = serializers.IntegerField()
    total_revenue = serializers.DecimalField(max_digits=12, decimal_places=2)
    popular_items = serializers.ListField()
    popular_categories = serializers.ListField()
    hourly_orders = serializers.ListField()
    category_revenue = serializers.ListField()
    revenue_data = serializers.ListField()
    visitor_data = serializers.ListField()