import time
from django.utils import timezone
from .models import VisitorLog, QRCode
from django.utils.deprecation import MiddlewareMixin
from rest_framework.authtoken.models import Token
from django.http import QueryDict

class VisitorTrackingMiddleware(MiddlewareMixin):
    def process_request(self, request):
        # Start timer for visit duration
        request._visit_start_time = time.time()
        
        # Don't track admin pages
        if request.path.startswith('/admin/'):
            return None
            
        return None

    def process_response(self, request, response):
        # Calculate visit duration
        duration = 0
        if hasattr(request, '_visit_start_time'):
            duration = int(time.time() - request._visit_start_time)
        
        # Don't track admin pages or API calls (except for analytics)
        if (request.path.startswith('/admin/') or 
            request.path.startswith('/static/') or
            request.path.startswith('/media/')):
            return response
        
        # Don't track API calls except for specific endpoints we want to monitor
        if (request.path.startswith('/api/') and 
            not any(path in request.path for path in ['/api/menu/', '/api/orders/'])):
            return response
        
        # Determine visitor type and get user info
        visitor_type = 'anonymous'  # Default to anonymous
        user = None
        session_id = None
        table_number = None
        qr_code = None
        
        # Check if this is a manager (token authentication)
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Token '):
            token_key = auth_header[6:]  # Remove 'Token ' prefix
            try:
                token = Token.objects.get(key=token_key)
                visitor_type = 'manager'
                user = token.user
                # For managers, we'll use a combination of user ID and token for tracking
                session_id = f"manager_{user.id}_{token_key[:8]}"
            except Token.DoesNotExist:
                pass  # Not a valid token, will be treated as anonymous
        
        # Check if this is a customer with table_uuid query parameter
        if visitor_type == 'anonymous':
            # Parse query parameters
            if request.method == 'GET':
                query_dict = request.GET
            elif request.method == 'POST':
                # For POST requests, try to get from POST data or query string
                if hasattr(request, 'POST') and isinstance(request.POST, QueryDict):
                    query_dict = request.POST
                else:
                    query_dict = QueryDict(request.META.get('QUERY_STRING', ''))
            else:
                query_dict = QueryDict('')
            
            table_uuid = query_dict.get('table_uuid')
            
            if table_uuid:
                try:
                    qr_code = QRCode.objects.get(uuid=table_uuid)
                    visitor_type = 'customer'
                    table_number = qr_code.table_number
                    
                    # Create or get session for customer tracking
                    if hasattr(request, 'session') and not request.session.session_key:
                        try:
                            request.session.save()
                            session_id = request.session.session_key
                        except:
                            session_id = f"customer_{table_uuid[:8]}"
                    elif hasattr(request, 'session'):
                        session_id = request.session.session_key
                    else:
                        session_id = f"customer_{table_uuid[:8]}"
                        
                except (QRCode.DoesNotExist, ValueError):
                    # Invalid UUID format or QR code not found
                    visitor_type = 'anonymous'
                    table_number = None
                    qr_code = None
        
        # Create visitor log with robust error handling
        try:
            VisitorLog.objects.create(
                visitor_type=visitor_type,
                session_id=session_id,  # Can be None for anonymous visitors
                ip_address=self.get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                referrer=request.META.get('HTTP_REFERER', ''),
                page_visited=request.path,
                table_number=table_number,
                qr_code=qr_code,
                duration=duration
            )
        except Exception as e:
            # Don't break the site if tracking fails
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Visitor tracking failed: {e}")
        
        return response

    def get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip