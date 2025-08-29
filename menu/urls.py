
from django.urls import path
from .views import index_view, manager_view

app_name = 'menu'

urlpatterns = [
    path('', index_view, name='index'),
    path('manager/', manager_view, name='manager'),
]