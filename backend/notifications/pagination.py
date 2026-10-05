from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from .models import Notification


class NotificationPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    page_query_param = 'page'
    max_page_size = 100

    def get_paginated_response(self, data):
        unread_count = Notification.objects.filter(
            recipient=self.request.user,
            read_at__isnull=True,
        ).count()
        return Response({
            'count': self.page.paginator.count,
            'unread_count': unread_count,
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })
