from rest_framework import serializers
from menu.models import Category, MenuItem, Order, OrderItem, QRCode


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name']


class MenuItemSerializer(serializers.ModelSerializer):
    # For POST/PUT, the category will be just an ID (PrimaryKey)
    category = serializers.PrimaryKeyRelatedField(queryset=Category.objects.all())
    
    # For GET requests, we use the CategorySerializer to include full category details
    category_details = CategorySerializer(source='category', read_only=True)
    
    image_url = serializers.SerializerMethodField()
    image = serializers.ImageField(required=False, allow_null=True)
    
    class Meta:
        model = MenuItem
        fields = ['id', 'name', 'description', 'price', 'image', 'image_url', 'category', 'category_details', 'is_available']
    
    def get_image_url(self, obj):
        request = self.context.get('request')
        if obj.image:
            return request.build_absolute_uri(obj.image.url) if request else obj.image.url
        return None


class OrderItemSerializer(serializers.ModelSerializer):
    menu_item_name = serializers.CharField(source='menu_item.name', read_only=True)
    
    class Meta:
        model = OrderItem
        fields = ['id', 'menu_item', 'menu_item_name', 'quantity', 'price_at_order']


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Order
        fields = ['id', 'table_number', 'status', 'total_price', 'created_at', 'items']


class OrderCreateSerializer(serializers.ModelSerializer):
    items = serializers.ListField(
        child=serializers.DictField(),
        write_only=True
    )
    
    class Meta:
        model = Order
        fields = ['table_number', 'items']
    
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
    
    class Meta:
        model = QRCode
        fields = ['table_number', 'qr_color', 'logo']