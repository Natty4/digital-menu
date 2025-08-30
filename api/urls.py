from django.urls import path, include
from rest_framework.routers import DefaultRouter
from api.views import (
    CategoryViewSet, MenuItemViewSet, OrderViewSet, 
    QRCodeViewSet, menu_list, menu_by_uuid, CustomAuthToken,
    manager_logout,

)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'menu_items', MenuItemViewSet)
router.register(r'orders', OrderViewSet)
router.register(r'qr_codes', QRCodeViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('menu/', menu_list, name='menu-list'),
    path('menu/<uuid:uuid>/', menu_by_uuid, name='menu-by-uuid'),
    path('manager/login/', CustomAuthToken.as_view(), name='manager-login'),
    path('manager/logout/', manager_logout, name='manager-logout'),
    
]