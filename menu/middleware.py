import re
import time
from django.utils import timezone
from .models import VisitorLog, QRCode
from django.utils.deprecation import MiddlewareMixin
from rest_framework.authtoken.models import Token
from django.http import QueryDict
from menu.utils import get_client_ip

class VisitorTrackingMiddleware(MiddlewareMixin):
    def process_request(self, request):
        request._visit_start_time = time.time()
        return None

    def process_response(self, request, response):

        skip_exact_paths = ['/favicon.ico', '/apple-touch-icon.png']
        skip_prefixes = ['/admin/', '/static/', '/media/', '/api/']

        if (
            request.path in skip_exact_paths or
            any(request.path.startswith(p) for p in skip_prefixes)
        ):
            return response


        duration = round(time.time() - request._visit_start_time, 3) if hasattr(request, '_visit_start_time') else 0
        

        visitor_type = 'anonymous'
        user = None
        session_id = None
        table_number = None
        qr_code = None


        token_key = None
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Token '):
            token_key = auth_header[6:]
        elif 'manager_token' in request.COOKIES:
            token_key = request.COOKIES.get('manager_token')

        if token_key:
            try:
                token = Token.objects.get(key=token_key)
                visitor_type = 'manager'
                user = token.user
                session_id = f"manager_{user.id}_{token_key[:8]}"
            except Token.DoesNotExist:
                pass


        if request.path.startswith('/manager/') and visitor_type == 'manager':
            return response


        if visitor_type == 'anonymous':
            if request.method == 'GET':
                query_dict = request.GET
            elif request.method == 'POST':
                query_dict = request.POST if hasattr(request, 'POST') else QueryDict(request.META.get('QUERY_STRING', ''))
            else:
                query_dict = QueryDict('')

            table_uuid = query_dict.get('table_uuid')
            if table_uuid:
                try:
                    qr_code = QRCode.objects.get(uuid=table_uuid)
                    visitor_type = 'customer'
                    table_number = qr_code.table_number

                    if hasattr(request, 'session') and not request.session.session_key:
                        request.session.save()
                        session_id = request.session.session_key
                    elif hasattr(request, 'session'):
                        session_id = request.session.session_key
                    else:
                        session_id = f"customer_{table_uuid[:8]}"
                except (QRCode.DoesNotExist, ValueError):
                    pass  # Invalid or missing QR code


        if request.path.startswith('/manager/'):
            page_visited = '/manager/ - Manager page'
        elif request.path == '/':
            page_visited = '/ - Menu page'
        else:
            page_visited = request.path


        try:
            VisitorLog.objects.create(
                visitor_type=visitor_type,
                session_id=session_id,
                ip_address=get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', ''),
                referrer=request.META.get('HTTP_REFERER', ''),
                page_visited=page_visited,
                table_number=table_number,
                qr_code=qr_code,
                duration=duration
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Visitor tracking failed: {e}")

        return response

