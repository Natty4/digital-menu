import os
import uuid
import cloudinary.uploader
from django.db import models
from django.conf import settings
from cloudinary.models import CloudinaryField


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name


class MenuItem(models.Model):
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = CloudinaryField('image', null=True, blank=True, folder='menu_items')
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='menu_items')
    is_available = models.BooleanField(default=True)
    
    @property
    def image_url(self):
        if self.image:
            # CloudinaryField automatically provides url property
            return self.image.url
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
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order #{self.id} - Table {self.table_number}"

    def update_total(self):
        self.total_price = sum(item.price_at_order * item.quantity for item in self.items.all())
        self.save()


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
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def make_uuid():
        """Static method to generate UUID"""
        return uuid.uuid4()

    def __str__(self):
        return f"QR Code for Table {self.table_number}"