from html import escape
from io import BytesIO

from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .serializers import invoice_payment_summary


def build_payment_acknowledgment(payment, system_name):
    """Render a verified payment with the invoice balance at download time."""
    invoice = payment.invoice
    summary = invoice_payment_summary(invoice)
    generated_at = timezone.localtime(timezone.now())
    ink = colors.HexColor('#14243D')
    green = colors.HexColor('#2D7063')
    muted = colors.HexColor('#637083')
    body = ParagraphStyle('body', fontName='Helvetica', fontSize=10, leading=15, textColor=ink, splitLongWords=True)
    label = ParagraphStyle('label', parent=body, fontSize=9, textColor=muted)
    title = ParagraphStyle('title', parent=body, fontSize=22, leading=28)
    amount = ParagraphStyle('amount', parent=body, fontName='Helvetica-Bold', fontSize=24, leading=32, textColor=green)
    right = ParagraphStyle('right', parent=body, alignment=TA_RIGHT)

    def paragraph(value, style=body):
        return Paragraph(escape(str(value or 'Not recorded')).replace('\n', '<br/>'), style)

    def money(value):
        return f'PHP {value:,.2f}'

    def date(value):
        return value.strftime('%d %b %Y') if value else 'Not recorded'

    def timestamp(value):
        return timezone.localtime(value).strftime('%d %b %Y, %H:%M %Z') if value else 'Not recorded'

    buffer = BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=46, bottomMargin=55,
        title=f'Payment acknowledgment PAY-{payment.pk}', author=system_name,
        pageCompression=0,
    )
    width = A4[0] - 96
    story = [paragraph(system_name, title), Spacer(1, 8), paragraph('RENT PAYMENT ACKNOWLEDGMENT', label), Spacer(1, 20)]
    heading = Table([[paragraph(f'Payment PAY-{payment.pk}'), paragraph(f'Invoice INV-{invoice.pk}', right)]], colWidths=[width / 2] * 2)
    heading.setStyle(TableStyle([('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0)]))
    story.extend([heading, Spacer(1, 15)])
    received = Table([[paragraph('AMOUNT RECEIVED', label)], [paragraph(money(payment.amount), amount)]], colWidths=[width])
    received.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#EAF3F0')),
        ('LEFTPADDING', (0, 0), (-1, -1), 16), ('TOPPADDING', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, -1), (-1, -1), 14),
    ]))
    story.extend([received, Spacer(1, 22)])
    tenant = invoice.tenant
    unit = invoice.contract.unit
    verified_by = payment.verified_by
    rows = [
        ('Tenant', f'{tenant.get_full_name() or tenant.email}\n{tenant.email}'),
        ('Property', f'{invoice.property.title}\n{invoice.property.address}'),
        ('Unit', unit.unit_number if unit else 'Standalone property'),
        ('Rental invoice month', invoice.due_date.strftime('%B %Y')),
        ('Invoice due date', date(invoice.due_date)),
        ('Payment date', date(payment.payment_date)),
        ('Payment method', payment.payment_method),
        ('Transaction reference', payment.reference_number),
        ('Payment status', payment.status),
        ('Verified by', (verified_by.get_full_name() or verified_by.email) if verified_by else 'Historical record'),
        ('Verified at', timestamp(payment.verified_at)),
    ]
    details = Table([[paragraph(key, label), paragraph(value)] for key, value in rows], colWidths=[145, width - 145], hAlign='LEFT')
    details.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LINEBELOW', (0, 0), (-1, -1), 0.4, colors.HexColor('#E5E9ED')),
    ]))
    story.extend([details, Spacer(1, 20), paragraph(f'Balance as of {timestamp(generated_at)}', label)])
    totals = Table([
        [paragraph('Invoice total', label), paragraph(money(invoice.total_due), right)],
        [paragraph('Total verified payments', label), paragraph(money(summary['amount_paid']), right)],
        [paragraph('Remaining invoice balance', label), paragraph(money(summary['balance_due']), right)],
    ], colWidths=[width * 0.6, width * 0.4])
    totals.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.extend([totals, Spacer(1, 14), paragraph('This acknowledgment reflects the payment status and invoice balance at generation time. Pending submissions are excluded from verified payments.', label)])

    def footer(canvas, _document):
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(muted)
        canvas.drawString(48, 30, f'PAY-{payment.pk} | INV-{invoice.pk}')
        canvas.drawRightString(A4[0] - 48, 30, f'Page {canvas.getPageNumber()}')

    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
