"""Small, bounded CSV exports for the same scoped querysets used by list APIs."""

import csv
from django.http import StreamingHttpResponse
from django.utils import timezone


class _Writer:
    def write(self, value):
        return value


def _safe(value):
    if value is None:
        return ''
    text = str(value)
    if text.lstrip().startswith(('=', '+', '-', '@', '\t', '\r')):
        return "'" + text
    return text


def csv_response(name, columns, queryset):
    """Export at most 10,000 rows, retaining the list endpoint's role and filters."""
    writer = csv.writer(_Writer())

    def rows():
        yield '\ufeff' + writer.writerow([label for label, _ in columns])
        for obj in queryset[:10000].iterator(chunk_size=500):
            yield writer.writerow([_safe(getter(obj)) for _, getter in columns])

    response = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
    response['Content-Disposition'] = f'attachment; filename="{name}-{timezone.localdate():%Y-%m-%d}.csv"'
    response['X-Export-Limit'] = '10000'
    response['X-Export-Truncated'] = 'true' if queryset.count() > 10000 else 'false'
    return response
