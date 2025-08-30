from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.contrib.auth.signals import user_logged_in, user_logged_out
from .models import ActivityLog, MenuItem, Category, Order, QRCode
from django.contrib.auth.models import User
from api.views import manager_logged_in, manager_logged_out

@receiver(post_save, sender=MenuItem)
def log_menu_item_activity(sender, instance, created, **kwargs):
    activity_type = 'item_created' if created else 'item_updated'
    ActivityLog.objects.create(
        activity_type=activity_type,
        user=instance._current_user if hasattr(instance, '_current_user') else None,
        details={
            'item_id': instance.id,
            'item_name': instance.name,
            'action': 'created' if created else 'updated'
        }
    )

@receiver(post_delete, sender=MenuItem)
def log_menu_item_delete(sender, instance, **kwargs):
    ActivityLog.objects.create(
        activity_type='item_deleted',
        user=instance._current_user if hasattr(instance, '_current_user') else None,
        details={
            'item_id': instance.id,
            'item_name': instance.name,
            'action': 'deleted'
        }
    )

@receiver(post_save, sender=Order)
def log_order_activity(sender, instance, created, **kwargs):
    if created:
        ActivityLog.objects.create(
            activity_type='order_placed',
            user=None,  # Customers aren't users
            details={
                'order_id': instance.id,
                'table_number': instance.table_number,
                'total_amount': float(instance.total_price)
            }
        )

@receiver(post_save, sender=QRCode)
def log_qr_activity(sender, instance, created, **kwargs):
    if created:
        ActivityLog.objects.create(
            activity_type='qr_generated',
            user=instance._current_user if hasattr(instance, '_current_user') else None,
            details={
                'qr_id': instance.id,
                'table_number': instance.table_number
            }
        )

@receiver(user_logged_in)
def log_user_login(sender, request, user, **kwargs):
    ActivityLog.objects.create(
        activity_type='login',
        user=user,
        details={'ip_address': get_client_ip(request)}
    )

@receiver(user_logged_out)
def log_user_logout(sender, request, user, **kwargs):
    ActivityLog.objects.create(
        activity_type='logout',
        user=user,
        details={'ip_address': get_client_ip(request)}
    )
    
# Add new signals for token-based authentication
@receiver(manager_logged_in)
def log_manager_login(sender, request, user, **kwargs):
    ActivityLog.objects.create(
        activity_type='login',
        user=user,
        details={'ip_address': get_client_ip(request), 'auth_type': 'token'}
    )

@receiver(manager_logged_out)
def log_manager_logout(sender, request, user, **kwargs):
    ActivityLog.objects.create(
        activity_type='logout',
        user=user,
        details={'ip_address': get_client_ip(request), 'auth_type': 'token'}
    )

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip