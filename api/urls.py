from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    CategoryViewSet, MenuItemViewSet, OrderViewSet, 
    QRCodeViewSet, 
    menu_list, menu_by_uuid, manager_login,
    manager_logout,
    analytics_summary, visitor_logs, activity_logs

)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'menu_items', MenuItemViewSet)
router.register(r'orders', OrderViewSet)
router.register(r'qr_codes', QRCodeViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('menu/', menu_list, name='menu-list'),
    path('menu/<str:uuid>/', menu_by_uuid, name='menu-by-uuid'),
   
    # Auth
    path('manager/login/', manager_login, name='manager-login'),
    path('manager/logout/', manager_logout, name='manager-logout'),
    
    # Analytics
    path('analytics/summary/', analytics_summary, name='analytics-summary'),
    path('analytics/visitors/', visitor_logs, name='visitor-logs'),
    path('analytics/activities/', activity_logs, name='activity-logs'),
    
]