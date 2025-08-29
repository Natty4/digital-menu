from django.conf import settings
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from menu.models import Category, MenuItem


class Command(BaseCommand):
    help = 'Setup initial menu data and admin user'

    def handle(self, *args, **options):
        password = settings.SUPERUSER_PASSWORD
        # Create admin user if not exists
        if not User.objects.filter(username='admin').exists():
            
            User.objects.create_superuser('admin', 'admin@sonictechs.com', password)
            self.stdout.write(self.style.SUCCESS('Admin user created'))
        
        # Create categories
        categories_data = [
            {'name': 'Starters', 'icon': '🥗'},
            {'name': 'Mains', 'icon': '🥩'},
            {'name': 'Desserts', 'icon': '🍰'},
            {'name': 'Drinks', 'icon': '🍷'},
            {'name': 'Sides', 'icon': '🍮'},
        ]
        
        for cat_data in categories_data:
            Category.objects.get_or_create(name=cat_data['name'])
        
        self.stdout.write(self.style.SUCCESS('Categories created'))
        
        # Create sample menu items
        menu_items_data = [
            {
                'name': 'Injera',
                'description': 'Traditional Ethiopian sourdough flatbread, served with stews and salads',
                'price': 5.00,
                'category': 'Sides',
                'is_available': True,
            },
            {
                'name': 'Doro Wat',
                'description': 'Spicy chicken stew with hard-boiled eggs, served with injera',
                'price': 15.00,
                'category': 'Mains',
                'is_available': True,
            },
            {
                'name': 'Kitfo',
                'description': 'Minced raw beef seasoned with spices, served with injera or bread',
                'price': 18.00,
                'category': 'Mains',
                'is_available': True,
            },
            {
                'name': 'Tibs',
                'description': 'Sautéed meat (beef, lamb, or chicken) with onions, garlic, and spices',
                'price': 20.00,
                'category': 'Mains',
                'is_available': True,
            },
            {
                'name': 'Shiro',
                'description': 'Ground chickpea stew spiced with berbere, usually served with injera',
                'price': 12.00,
                'category': 'Mains',
                'is_available': True,
            },
            {
                'name': 'Tej',
                'description': 'Ethiopian honey wine, served chilled',
                'price': 8.00,
                'category': 'Drinks',
                'is_available': True,
            },
            {
                'name': 'Atayef',
                'description': 'Sweet stuffed pastry with spiced nuts and honey, perfect for dessert',
                'price': 10.00,
                'category': 'Drinks',
                'is_available': True,
            },
            {
                'name': 'Buna (Ethiopian Coffee)',
                'description': 'Traditional Ethiopian coffee brewed and served with spices',
                'price': 5.00,
                'category': 'Drinks',
                'is_available': True,
            },
        ]
        
        for item_data in menu_items_data:
            category = Category.objects.get(name=item_data['category'])
            MenuItem.objects.get_or_create(
                name=item_data['name'],
                defaults={
                    'description': item_data['description'],
                    'price': item_data['price'],
                    'category': category,
                    'is_available': item_data['is_available'],
                }
            )
        
        self.stdout.write(self.style.SUCCESS('Menu items created'))