from django.contrib import admin
from .models import Category, MenuItem, Order, OrderItem, QRCode, VisitorLog, ActivityLog, DailyRevenue


# Site header (top of the page)
admin.site.site_header = "TK-Brown Admin"

# Site title (HTML <title>)
admin.site.site_title = "TK-Brown Admin Portal V.1.0"

# Iindex title (dashboard welcome text)
admin.site.index_title = "Welcome to TK-Brown Administration"


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']

@admin.register(MenuItem)
class MenuItemAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'category', 'is_available']
    list_filter = ['category', 'is_available']
    search_fields = ['name', 'description']

class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'table_number', 'status', 'total_price', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['table_number']
    inlines = [OrderItemInline]

@admin.register(QRCode)
class QRCodeAdmin(admin.ModelAdmin):
    list_display = ['table_number', 'uuid', 'created_at']
    search_fields = ['table_number']
    

@admin.register(VisitorLog)
class VisitorLogAdmin(admin.ModelAdmin):
    list_display = ['visitor_type', 'user_agent', 'page_visited', 'timestamp']
    search_fields = ['visitor_type']
    list_per_page = 30
@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ['activity_type', 'user', 'timestamp']
    search_fields = ['details']
    
@admin.register(DailyRevenue)
class DailyRevenueAdmin(admin.ModelAdmin):
    list_display = ['id', 'total_revenue', 'total_orders', 'date']
    search_fields = ['date']
    