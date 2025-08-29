from django.conf import settings
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.db import transaction
from django.core.exceptions import ObjectDoesNotExist
from menu.models import Category, MenuItem


class Command(BaseCommand):
    help = 'Setup initial menu data and admin user'

    def handle(self, *args, **options):
        # Run in a transaction to ensure atomicity
        with transaction.atomic():
            # Create admin user if not exists
            password = getattr(settings, 'SUPERUSER_PASSWORD', None)
            if not password:
                self.stdout.write(self.style.ERROR('SUPERUSER_PASSWORD not set in settings'))
                return

            if not User.objects.filter(username='admin').exists():
                try:
                    User.objects.create_superuser('admin', 'admin@sonictechs.com', password)
                    self.stdout.write(self.style.SUCCESS('Admin user created'))
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'Failed to create admin user: {str(e)}'))
                    return

            # Create categories if they don't exist
            categories_data = [
                {'name': 'Starters', 'icon': '🥗'},
                {'name': 'Main Dishes', 'icon': '🥩'},
                {'name': 'Desserts', 'icon': '🍰'},
                {'name': 'Drinks', 'icon': '🍷'},
                {'name': 'Sides', 'icon': '🍮'},
            ]

            for cat_data in categories_data:
                category, created = Category.objects.get_or_create(
                    name__iexact=cat_data['name'],  # Case-insensitive lookup
                    defaults={'name': cat_data['name']}
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"Category '{cat_data['name']}' created"))
                else:
                    self.stdout.write(self.style.SUCCESS(f"Category '{cat_data['name']}' already exists"))

            # Create sample menu items if they don't exist
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
                    'category': 'Main Dishes',
                    'is_available': True,
                },
                {
                    'name': 'Kitfo',
                    'description': 'Minced raw beef seasoned with spices, served with injera or bread',
                    'price': 18.00,
                    'category': 'Main Dishes',
                    'is_available': True,
                },
                {
                    'name': 'Tibs',
                    'description': 'Sautéed meat (beef, lamb, or chicken) with onions, garlic, and spices',
                    'price': 20.00,
                    'category': 'Main Dishes',
                    'is_available': True,
                },
                {
                    'name': 'Shiro',
                    'description': 'Ground chickpea stew spiced with berbere, usually served with injera',
                    'price': 12.00,
                    'category': 'Main Dishes',
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
                    'name': 'Buna (Ethiopian Coffee)',
                    'description': 'Traditional Ethiopian coffee brewed and served with spices',
                    'price': 5.00,
                    'category': 'Drinks',
                    'is_available': True,
                },
            ]

            for item_data in menu_items_data:
                try:
                    category = Category.objects.get(name__iexact=item_data['category'])
                except ObjectDoesNotExist:
                    self.stdout.write(self.style.ERROR(f"Category '{item_data['category']}' not found for menu item '{item_data['name']}'"))
                    continue

                menu_item, created = MenuItem.objects.get_or_create(
                    name__iexact=item_data['name'], 
                    defaults={
                        'name': item_data['name'],
                        'description': item_data['description'],
                        'price': item_data['price'],
                        'category': category,
                        'is_available': item_data['is_available'],
                    }
                )
                if created:
                    self.stdout.write(self.style.SUCCESS(f"Menu item '{item_data['name']}' created"))
                else:
                    self.stdout.write(self.style.SUCCESS(f"Menu item '{item_data['name']}' already exists"))

        self.stdout.write(self.style.SUCCESS('Menu setup completed'))