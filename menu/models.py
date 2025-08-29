import os
import uuid
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
    image = CloudinaryField('image', null=True, blank=True, folder='menu_items') if not settings.DEBUG else models.ImageField(upload_to='menu_items', null=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='menu_items')
    is_available = models.BooleanField(default=True)

    def __str__(self):
        return self.name

    @property
    def image_url(self):
        """
        Returns the Cloudinary URL in production (DEBUG=False) or local URL in debug mode (DEBUG=True).
        """
        if self.image:
            if settings.DEBUG:
                return f"{settings.MEDIA_URL}{self.image}" if self.image else None
            return self.image.url
        return None

    @property
    def image_path(self):
        """
        Returns the local file path in debug mode or Cloudinary URL in production.
        """
        if self.image:
            if settings.DEBUG:
                return os.path.join(settings.MEDIA_ROOT, str(self.image)) if self.image else None
            return self.image.url
        return None


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
    image = CloudinaryField('image', null=True, blank=True, folder='qr_codes') if not settings.DEBUG else models.ImageField(upload_to='qr_codes', null=True, blank=True)
    logo_image = CloudinaryField('logo_image', null=True, blank=True, folder='qr_logos') if not settings.DEBUG else models.ImageField(upload_to='qr_logos', null=True, blank=True)
    qr_color = models.CharField(max_length=7, default='#000000')
    created_at = models.DateTimeField(auto_now_add=True)

    @staticmethod
    def make_uuid():
        """Static method to generate UUID"""
        return uuid.uuid4()

    def __str__(self):
        return f"QR Code for Table {self.table_number}"

    @property
    def image_url(self):
        """
        Returns the Cloudinary URL in production (DEBUG=False) or local URL in debug mode (DEBUG=True).
        """
        if self.image:
            if settings.DEBUG:
                return f"{settings.MEDIA_URL}{self.image}" if self.image else None
            return self.image.url
        return None

    @property
    def logo_image_url(self):
        """
        Returns the Cloudinary URL for logo_image in production or local URL in debug mode.
        """
        if self.logo_image:
            if settings.DEBUG:
                return f"{settings.MEDIA_URL}{self.logo_image}" if self.logo_image else None
            return self.logo_image.url
        return None

    @property
    def image_path(self):
        """
        Returns the local file path in debug mode or Cloudinary URL in production.
        """
        if self.image:
            if settings.DEBUG:
                return os.path.join(settings.MEDIA_ROOT, str(self.image)) if self.image else None
            return self.image.url
        return None

    @property
    def logo_image_path(self):
        """
        Returns the local file path for logo_image in debug mode or Cloudinary URL in production.
        """
        if self.logo_image:
            if settings.DEBUG:
                return os.path.join(settings.MEDIA_ROOT, str(self.logo_image)) if self.logo_image else None
            return self.logo_image.url
        return None