import os
import qrcode
import logging
import requests
import cloudinary.uploader
from io import BytesIO
from PIL import Image
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.db.models import Case, When, IntegerField
from django.core.files.base import ContentFile
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login
from menu.models import Category, MenuItem, Order, OrderItem, QRCode
from api.serializers import (
    CategorySerializer, MenuItemSerializer, OrderSerializer, 
    OrderCreateSerializer, QRCodeSerializer, QRCodeCreateSerializer
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
    
    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [AllowAny()]
        return [IsAuthenticated()]
    
    def create(self, request, *args, **kwargs):
        print("Request Data:", request.data)  # Log incoming data
        return super().create(request, *args, **kwargs)


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