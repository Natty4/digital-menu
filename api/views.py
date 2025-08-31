import qrcode
import logging
import requests
import cloudinary.uploader
from io import BytesIO
from PIL import Image
from django.conf import settings
from django.db.models import Case, When, IntegerField
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login
from django.db.models import Count, Sum, F
from django.db.models.functions import TruncHour
from django.utils import timezone
from datetime import timedelta
from menu.models import (
    Category, MenuItem, Order, OrderItem, QRCode,
    VisitorLog, ActivityLog, DailyRevenue, Order, MenuItem
    )
from api.serializers import (
    CategorySerializer, MenuItemSerializer, OrderSerializer, 
    OrderCreateSerializer, QRCodeSerializer, QRCodeCreateSerializer,
    AnalyticsSummarySerializer, VisitorLogSerializer, ActivityLogSerializer
)

logger = logging.getLogger(__name__)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [IsAuthenticated]


class MenuItemViewSet(viewsets.ModelViewSet):
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def create(self, request, *args, **kwargs):   
           
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer)
            headers = self.get_success_headers(serializer.data)
            return Response({
                'data': serializer.data,
                'message': 'Menu item created successfully'
            }, status=status.HTTP_201_CREATED, headers=headers)
        except Exception as e:
            print("CREATE VIEW ERROR:", str(e), serializer.errors)
            return Response({
                'error': str(e),
                'details': serializer.errors or 'Invalid data provided'
            }, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        
        partial = kwargs.pop('partial', True)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        
        try:
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response({
                'data': serializer.data,
                'message': 'Menu item updated successfully'
            })
        except Exception as e:
            print("UPDATE VIEW ERROR:", str(e), serializer.errors)
            return Response({
                'error': str(e),
                'details': serializer.errors or 'Invalid data provided'
            }, status=status.HTTP_400_BAD_REQUEST)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().prefetch_related('items')
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action == 'create':
            return OrderCreateSerializer
        return OrderSerializer
    
    def get_permissions(self):
        if self.action == 'create':
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def list(self, request):
        # Custom ordering for status field
        status_order = Case(
            When(status='new', then=1),
            When(status='in_progress', then=2),
            When(status='pending', then=3),
            When(status='cancelled', then=4),
            When(status='completed', then=5),
            default=6,
            output_field=IntegerField()
        )
        
        # Filter out 'archived' orders and order by status and created_at
        orders = Order.objects.exclude(status='archived')\
            .annotate(status_priority=status_order)\
            .order_by('status_priority', '-created_at')  # First by status priority, then by date
        
        # Use the serializer to convert queryset to JSON
        serializer = self.get_serializer(orders, many=True)
        return Response(serializer.data)


class QRCodeViewSet(viewsets.ModelViewSet):
    queryset = QRCode.objects.all()
    serializer_class = QRCodeSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return QRCodeCreateSerializer
        return QRCodeSerializer

    def list(self, request):
        qr_codes = QRCode.objects.all().order_by('-created_at')
        serializer = QRCodeSerializer(qr_codes, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def generate(self, request):
        serializer = QRCodeCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response({"detail": serializer.errors}, status=status.HTTP_400_BAD_REQUEST)

        table_number = serializer.validated_data['table_number']
        qr_color = serializer.validated_data.get('qr_color', '#000000')
        logo = serializer.validated_data.get('logo')  # Optional logo file

        try:
            # Generate UUID and URL
            qr_uuid = QRCode.make_uuid()
            frontend_url = f"{settings.FRONTEND_URL}?table_uuid={qr_uuid}"

            # Create the QR code instance
            qr_code = QRCode.objects.create(
                uuid=qr_uuid,
                table_number=table_number,
                qr_color=qr_color
            )

            # Handle logo upload to Cloudinary if provided
            if logo:
                try:
                    # Validate file type
                    valid_formats = ['image/png', 'image/jpeg', 'image/jpg']
                    if logo.content_type not in valid_formats:
                        return Response(
                            {"detail": "Logo must be a PNG or JPEG image."},
                            status=status.HTTP_400_BAD_REQUEST
                        )

                    # Upload logo to Cloudinary
                    upload_result = cloudinary.uploader.upload(
                        logo,
                        folder='qr_logos',
                        resource_type='image'
                    )
                    # Save the Cloudinary public ID to logo_image field
                    qr_code.logo_image = upload_result['public_id']
                    qr_code.save()
                except Exception as e:
                    logger.error(f"Error uploading logo to Cloudinary: {str(e)}")
                    return Response(
                        {"detail": f"Failed to upload logo: {str(e)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Generate the QR code image
            qr = qrcode.QRCode(
                version=1,
                error_correction=qrcode.constants.ERROR_CORRECT_H,
                box_size=10,
                border=4,
            )
            qr.add_data(frontend_url)
            qr.make(fit=True)

            # Create QR code image
            qr_img = qr.make_image(fill_color=qr_color, back_color="white").convert('RGB')

            # Add the logo if available
            if qr_code.logo_image:
                try:
                    # Fetch the logo image from Cloudinary
                    logo_url = cloudinary.utils.cloudinary_url(qr_code.logo_image)[0]
                    logo_response = requests.get(logo_url)
                    logo_img = Image.open(BytesIO(logo_response.content))
                    logo_size = min(qr_img.size) // 4
                    logo_img = logo_img.resize((logo_size, logo_size), Image.LANCZOS)
                    pos = ((qr_img.size[0] - logo_size) // 2, (qr_img.size[1] - logo_size) // 2)
                    qr_img.paste(logo_img, pos)
                except Exception as e:
                    logger.error(f"Error processing logo image: {str(e)}")
                    return Response(
                        {"detail": f"Failed to process logo: {str(e)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

            # Save QR code image to Cloudinary
            try:
                buffer = BytesIO()
                qr_img.save(buffer, format='PNG')
                buffer.seek(0)
                upload_result = cloudinary.uploader.upload(
                    buffer,
                    folder='qr_codes',
                    resource_type='image'
                )
                qr_code.image = upload_result['public_id']
                qr_code.save()
            except Exception as e:
                logger.error(f"Error uploading QR code to Cloudinary: {str(e)}")
                return Response(
                    {"detail": f"Failed to save QR code image: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

            # Serialize the response
            response_serializer = QRCodeSerializer(qr_code, context={'request': request})
            return Response(response_serializer.data, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Unexpected error in generate QR code: {str(e)}")
            return Response(
                {"detail": f"An unexpected error occurred: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            

@api_view(['GET'])
@permission_classes([AllowAny])
def menu_by_uuid(request, uuid):
    try:
        qr_code = QRCode.objects.get(uuid=uuid)
        categories = Category.objects.all()
        menu_items = MenuItem.objects.filter(is_available=True)
        
        category_serializer = CategorySerializer(categories, many=True)
        menu_serializer = MenuItemSerializer(
            menu_items, many=True, context={'request': request}
        )
        
        return Response({
            'table_number': qr_code.table_number,
            'categories': category_serializer.data,
            'menu_items': menu_serializer.data
        })
    
    except QRCode.DoesNotExist:
        return Response(
            {'error': 'Invalid QR code'}, 
            status=status.HTTP_404_NOT_FOUND
        )


@api_view(['GET'])
@permission_classes([AllowAny])
def menu_list(request):
    categories = Category.objects.all()
    menu_items = MenuItem.objects.filter(is_available=True)
    
    category_serializer = CategorySerializer(categories, many=True)
    menu_serializer = MenuItemSerializer(
        menu_items, many=True, context={'request': request}
    )
    
    return Response({
        'categories': category_serializer.data,
        'menu_items': menu_serializer.data
    })


class CustomAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data,
                                           context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user_id': user.pk,
            'username': user.username
        })
   

from django.dispatch import Signal

# Create custom signals for token-based authentication
manager_logged_in = Signal()
manager_logged_out = Signal()
     
@api_view(['POST'])
@permission_classes([AllowAny])
def manager_login(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'detail': 'Username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user = authenticate(username=username, password=password)
    if not user:
        return Response(
            {'detail': 'Invalid credentials.'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    # Create or get token
    token, created = Token.objects.get_or_create(user=user)
    
    # # Optional: Create a session for tracking purposes
    # if not request.session.session_key:
    #     request.session.create()
    
    # # Store manager info in session for tracking
    # request.session['manager_id'] = user.id
    # request.session['manager_token_prefix'] = token.key[:8]  # Store first 8 chars for reference
    # Trigger the custom login signal
    manager_logged_in.send(
        sender=user.__class__,
        request=request,
        user=user
    )
    
    return Response({
        'token': token.key,
        'message': 'Login successful.'
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manager_logout(request):
    try:
        if request.auth:
            request.auth.delete()
            
            manager_logged_out.send(
                sender=request.user.__class__,
                request=request,
                user=request.user
            )
            return Response({'detail': 'Successfully logged out.'}, status=status.HTTP_200_OK)
        return Response({'detail': 'No token found.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



# views.py
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def analytics_summary(request):
    # Date range - last 30 days
    end_date = timezone.now()
    start_date = end_date - timedelta(days=30)
    
    # Visitor statistics
    visitors = VisitorLog.objects.filter(timestamp__range=(start_date, end_date))
    total_visitors = visitors.count()
    total_anonymous = visitors.filter(visitor_type='anonymous').count()
    total_customers = visitors.filter(visitor_type='customer').filter(page_visited__in=['/', '/api/menu/']).count()
    total_managers = visitors.filter(visitor_type='manager').count()
    
    # Order statistics - only completed orders
    orders = Order.objects.filter(
        created_at__range=(start_date, end_date), 
        status='completed'
    )
    total_orders = orders.count()
    total_revenue = orders.aggregate(total=Sum('total_price'))['total'] or 0
    
    # Popular items (aggregated by menu item with sums)
    popular_items = MenuItem.objects.filter(
        orderitem__order__in=orders
    ).annotate(
        order_count=Count('orderitem__id', distinct=True),  # Count distinct orders
        total_quantity=Sum('orderitem__quantity'),
        total_revenue=Sum(F('orderitem__price_at_order') * F('orderitem__quantity'))
    ).order_by('-total_quantity')[:10].values(
        'id', 'name', 'order_count', 'total_quantity', 'total_revenue'
    )
    
    # Popular categories (aggregated by category with sums)
    popular_categories = Category.objects.filter(
        menu_items__orderitem__order__in=orders
    ).annotate(
        order_count=Count('menu_items__orderitem__id', distinct=True),  # Count distinct orders
        total_quantity=Sum('menu_items__orderitem__quantity'),
        total_revenue=Sum(F('menu_items__orderitem__price_at_order') * F('menu_items__orderitem__quantity'))
    ).order_by('-total_revenue')[:10].values(
        'id', 'name', 'order_count', 'total_quantity', 'total_revenue'
    )
    
    # Hourly order distribution (aggregate by hour)
    hourly_orders_data = orders.annotate(
        hour=TruncHour('created_at')
    ).values('hour').annotate(
        order_count=Count('id')
    ).order_by('hour')
    
    # Convert to simpler format for chart
    hourly_orders = []
    for hour_data in hourly_orders_data:
        hour = hour_data['hour'].hour
        hourly_orders.append({
            'hour': f"{hour:02d}:00",
            'order_count': hour_data['order_count']
        })
    
    # Fill in missing hours with zero values
    hourly_orders_complete = []
    for hour in range(24):
        hour_str = f"{hour:02d}:00"
        existing_hour = next((h for h in hourly_orders if h['hour'] == hour_str), None)
        if existing_hour:
            hourly_orders_complete.append(existing_hour)
        else:
            hourly_orders_complete.append({
                'hour': hour_str,
                'order_count': 0
            })
    
    # Category revenue distribution (already aggregated above)
    category_revenue = []
    for category in popular_categories:
        category_revenue.append({
            'category': category['name'],
            'revenue': float(category['total_revenue'] or 0),
            'quantity': category['total_quantity'] or 0,
        })
    
    # Revenue data for chart (daily aggregated)
    revenue_data = []
    for i in range(30):
        date = start_date + timedelta(days=i)
        daily_data = orders.filter(created_at__date=date).aggregate(
            revenue=Sum('total_price'),
            order_count=Count('id')
        )
        revenue_data.append({
            'date': date.strftime('%Y-%m-%d'),
            'revenue': float(daily_data['revenue'] or 0),
            'order_count': daily_data['order_count'] or 0
        })
    
    # Visitor data for chart
    visitor_data = []
    for i in range(30):
        date = start_date + timedelta(days=i)
        daily_visitors = visitors.filter(timestamp__date=date).count()
        visitor_data.append({
            'date': date.strftime('%Y-%m-%d'),
            'visitors': daily_visitors
        })
    
    data = {
        'total_visitors': total_visitors,
        'total_anonymous': total_anonymous,
        'total_customers': total_customers,
        'total_managers': total_managers,
        'total_orders': total_orders,
        'total_revenue': float(total_revenue),
        'popular_items': list(popular_items),
        'popular_categories': list(popular_categories),
        'hourly_orders': hourly_orders_complete,
        'category_revenue': category_revenue,
        'revenue_data': revenue_data,
        'visitor_data': visitor_data,
    }
    
    serializer = AnalyticsSummarySerializer(data)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def visitor_logs(request):
    page = int(request.GET.get('page', 1))
    per_page = int(request.GET.get('per_page', 20))
    
    visitors = VisitorLog.objects.filter(page_visited__in=['/', '/api/menu/']).order_by('-timestamp')
    total = visitors.count()
    visitors = visitors[(page-1)*per_page:page*per_page]
    
    data = {
        'data': VisitorLogSerializer(visitors, many=True).data,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    }
    
    return Response(data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def activity_logs(request):
    page = int(request.GET.get('page', 1))
    per_page = int(request.GET.get('per_page', 20))
    
    activities = ActivityLog.objects.all().order_by('-timestamp')
    total = activities.count()
    activities = activities[(page-1)*per_page:page*per_page]
    
    data = {
        'data': ActivityLogSerializer(activities, many=True).data,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    }
    
    return Response(data)