from rest_framework.pagination import PageNumberPagination


class OptInPageNumberPagination(PageNumberPagination):
    """Use page-number envelopes only when a caller explicitly asks for a page."""

    page_size = 50
    page_size_query_param = 'page_size'
    page_query_param = 'page'
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        params = request.query_params
        if self.page_query_param not in params and self.page_size_query_param not in params:
            return None
        return super().paginate_queryset(queryset, request, view=view)
