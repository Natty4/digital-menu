import os
import uuid
import cloudinary.uploader
from django.db import models
from django.conf import settings
from cloudinary.models import CloudinaryField
from django.utils import timezone
from urllib.parse import urlparse
from user_agents import parse
from django.contrib.auth.models import User



class ActiveManager(models.Manager):
	def get_queryset(self):
		return super(ActiveManager, self).get_queryset() .filter(is_active=True)

class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    def __str__(self):
        return self.name
    objects = ActiveManager()  # the custom manager
    all = models.Manager()
    
    class Meta:
        ordering = ['name']


class MenuItem(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = CloudinaryField('image', null=True, blank=True, folder='menu_items')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='menu_items')
    is_available = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    
    @property
    def image_url(self):
        if self.image:
            image_url = self.image.url
            # Force HTTPS if the URL is served over HTTP
            parsed_url = urlparse(image_url)
            if parsed_url.scheme != 'https':
                image_url = image_url.replace('http://', 'https://')
            return image_url
        return None
    
    def __str__(self):
        return self.name
    
    def delete(self, *args, **kwargs):
        # Delete image from Cloudinary when menu item is deleted
        if self.image:
            try:
                cloudinary.uploader.destroy(self.image.public_id)
            except:
                pass  # Ignore errors if image doesn't exist on Cloudinary
        super().delete(*args, **kwargs)
    
    class Meta:
        ordering = ['category']

    objects = ActiveManager()  # the custom manager
    all = models.Manager()

class Order(models.Model):
    STATUS_CHOICES = [
        ('new', 'New'),
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('archived', 'Archived'),
    ]

    table_number = models.CharField(max_length=50)
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default='new')
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Order #{self.id} - Table {self.table_number}"

    def update_total(self):
        self.total_price = sum(item.price_at_order * item.quantity for item in self.items.all())
        self.save()

    objects = ActiveManager()  # the custom manager
    all = models.Manager()
class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    quantity = models.IntegerField(default=1)
    price_at_order = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.quantity}x {self.menu_item.name} for Order #{self.order.id}"

class QRCode(models.Model):
    uuid = models.UUIDField(unique=True, default=uuid.uuid4)
    table_number = models.CharField(max_length=50, unique=True)

    image = CloudinaryField('image', null=True, blank=True, folder='qr_codes')
    logo_image = CloudinaryField('logo_image', null=True, blank=True, folder='qr_logos')
    
    qr_color = models.CharField(max_length=7, default='#000000')
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def make_uuid():
        """Static method to generate UUID"""
        return uuid.uuid4()

    def __str__(self):
        return f"QR Code for Table {self.table_number}"

    objects = ActiveManager()  # the custom manager
    all = models.Manager()

class VisitorLog(models.Model):
    VISITOR_TYPES = [
        ('anonymous', 'Anonymous Visitor'),
        ('customer', 'Customer'),
        ('manager', 'Manager'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    visitor_type = models.CharField(max_length=10, choices=VISITOR_TYPES, default='anonymous')
    session_id = models.CharField(max_length=100, blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    browser = models.CharField(max_length=100, blank=True)
    os = models.CharField(max_length=100, blank=True)
    device = models.CharField(max_length=100, blank=True)
    referrer = models.URLField(blank=True)
    page_visited = models.CharField(max_length=200)
    table_number = models.CharField(max_length=50, blank=True, null=True)
    qr_code = models.ForeignKey('QRCode', on_delete=models.SET_NULL, null=True, blank=True)
    timestamp = models.DateTimeField(default=timezone.now)
    duration = models.IntegerField(default=0)  # in seconds
    
    class Meta:
        ordering = ['-timestamp']
    
    def save(self, *args, **kwargs):
        # Parse user agent string
        if self.user_agent:
            try:
                ua = parse(self.user_agent)
                self.browser = f"{ua.browser.family} {ua.browser.version_string}"
                self.os = f"{ua.os.family} {ua.os.version_string}"
                self.device = ua.device.family
            except:
                # If user agent parsing fails, still save the record
                self.browser = 'Unknown'
                self.os = 'Unknown'
                self.device = 'Unknown'
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.visitor_type} - {self.page_visited} - {self.timestamp}"
        
class ActivityLog(models.Model):
    ACTIVITY_TYPES = [
        ('menu_view', 'Menu View'),
        ('category_view', 'Category View'),
        ('item_view', 'Item View'),
        ('order_placed', 'Order Placed'),
        ('qr_generated', 'QR Code Generated'),
        ('item_created', 'Menu Item Created'),
        ('item_updated', 'Menu Item Updated'),
        ('item_deleted', 'Menu Item Deleted'),
        ('login', 'Manager Login'),
        ('logout', 'Manager Logout'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    activity_type = models.CharField(max_length=20, choices=ACTIVITY_TYPES)
    user = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    details = models.JSONField(default=dict)  # Store additional data
    timestamp = models.DateTimeField(default=timezone.now)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    
    class Meta:
        ordering = ['-timestamp']
    
    def __str__(self):
        return f"{self.activity_type} - {self.timestamp}"

class DailyRevenue(models.Model):
    date = models.DateField(unique=True)
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_orders = models.IntegerField(default=0)
    average_order_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    
    class Meta:
        ordering = ['-date']
    
    def __str__(self):
        return f"{self.date} - ETB{self.total_revenue}"