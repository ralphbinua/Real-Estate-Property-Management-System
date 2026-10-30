from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import permissions, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from core.csv_exports import csv_response
from core.pagination import OptInPageNumberPagination
from properties.models import Property
from users.audit import record_activity
from .models import Payment, PropertyExpense, PropertyExpenseEvent


class ExpenseSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))
    propertyId = serializers.PrimaryKeyRelatedField(source='property', queryset=Property.objects.filter(is_deleted=False))
    propertyTitle = serializers.CharField(source='property.title', read_only=True)
    incurredOn = serializers.DateField(source='incurred_on')
    createdBy = serializers.IntegerField(source='created_by_id', read_only=True)
    decidedBy = serializers.IntegerField(source='decided_by_id', read_only=True)
    decidedAt = serializers.DateTimeField(source='decided_at', read_only=True)
    decisionNote = serializers.CharField(source='decision_note', read_only=True)
    maintenanceRequestId = serializers.IntegerField(source='maintenance_request_id', read_only=True)
    history = serializers.SerializerMethodField()

    class Meta:
        model = PropertyExpense
        fields = ['id', 'propertyId', 'propertyTitle', 'category', 'amount', 'incurredOn', 'payee', 'reference', 'description', 'status', 'createdBy', 'decidedBy', 'decidedAt', 'decisionNote', 'maintenanceRequestId', 'history']
        read_only_fields = ['status']

    def get_history(self, item):
        return [{'action': event.action, 'summary': event.summary, 'at': event.created_at.isoformat()} for event in item.events.all()]

    def validate(self, attrs):
        user = self.context['request'].user
        prop = attrs.get('property', self.instance.property if self.instance else None)
        if user.role == 'Property Manager' and prop.manager_id != user.pk:
            raise serializers.ValidationError({'propertyId': 'You may enter expenses only for assigned properties.'})
        if not prop.owner_id:
            raise serializers.ValidationError({'propertyId': 'This property needs an Owner to approve expenses.'})
        if self.instance and self.instance.status in ('Approved', 'Reversed'):
            raise serializers.ValidationError({'status': 'Decided expenses are immutable. Record a new entry.'})
        if self.instance and prop.pk != self.instance.property_id:
            raise serializers.ValidationError({'propertyId': 'An expense cannot move to another property.'})
        return attrs


class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    pagination_class = OptInPageNumberPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def _active_user(self):
        user = self.request.user
        if not user.is_active or user.is_deleted or user.role not in ('Admin', 'Property Manager', 'Owner'):
            raise PermissionDenied('Your role cannot access property expenses.')
        return user

    def get_queryset(self):
        user = self._active_user()
        expenses = PropertyExpense.objects.select_related('property', 'created_by', 'decided_by').prefetch_related('events')
        if user.role == 'Property Manager':
            expenses = expenses.filter(property__manager=user)
        elif user.role == 'Owner':
            expenses = expenses.filter(property__owner=user).exclude(status='Draft')
        property_id = self.request.query_params.get('propertyId')
        if property_id:
            if not property_id.isdigit():
                raise ValidationError({'propertyId': 'Choose a valid property.'})
            expenses = expenses.filter(property_id=property_id)
        expense_status = self.request.query_params.get('status')
        if expense_status:
            expenses = expenses.filter(status=expense_status)
        return expenses.order_by('-incurred_on', '-id')

    def create(self, request, *args, **kwargs):
        if self._active_user().role not in ('Admin', 'Property Manager'):
            raise PermissionDenied('Only staff may enter expenses.')
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def perform_create(self, serializer):
        item = serializer.save(created_by=self.request.user)
        PropertyExpenseEvent.objects.create(expense=item, actor=self.request.user, action='Created', summary='Expense submitted for Owner approval.')
        record_activity(self.request.user, 'CREATE', 'Property expense', item.pk, f'Created expense for property {item.property_id}.')

    def partial_update(self, request, *args, **kwargs):
        if self._active_user().role not in ('Admin', 'Property Manager'):
            raise PermissionDenied('Only staff may revise expenses.')
        visible = self.get_object()
        with transaction.atomic():
            item = PropertyExpense.objects.select_for_update().get(pk=visible.pk)
            serializer = self.get_serializer(item, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)

    def update(self, request, *args, **kwargs):
        if not kwargs.get('partial'):
            raise PermissionDenied('Use a partial update for a pending or rejected expense.')
        return super().update(request, *args, **kwargs)

    @transaction.atomic
    def perform_update(self, serializer):
        current_status = serializer.instance.status
        item = serializer.save(status='Draft' if current_status == 'Draft' else 'Pending', decided_by=None, decided_at=None, decision_note='')
        action_label = 'Draft saved' if current_status == 'Draft' else 'Revised'
        summary = 'Expense draft saved for staff review.' if current_status == 'Draft' else 'Expense revised and resubmitted for Owner approval.'
        PropertyExpenseEvent.objects.create(expense=item, actor=self.request.user, action=action_label, summary=summary)
        record_activity(self.request.user, 'UPDATE', 'Property expense', item.pk, f'{summary} Expense {item.pk}.')

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def submit(self, request, pk=None):
        user = self._active_user()
        if user.role not in ('Admin', 'Property Manager'):
            raise PermissionDenied('Only staff may submit expense drafts.')
        visible = self.get_object()
        item = PropertyExpense.objects.select_for_update().get(pk=visible.pk)
        if item.status != 'Draft':
            raise ValidationError({'status': 'Only an expense draft can be submitted.'})
        if not item.property.owner_id:
            raise ValidationError({'propertyId': 'This property needs an Owner to approve expenses.'})
        item.status = 'Pending'
        item.save(update_fields=['status'])
        PropertyExpenseEvent.objects.create(expense=item, actor=user, action='Submitted', summary='Expense draft submitted for Owner approval.')
        record_activity(user, 'UPDATE', 'Property expense', item.pk, f'Submitted expense draft {item.pk} for Owner approval.')
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def decide(self, request, pk=None):
        user = self._active_user()
        if user.role != 'Owner':
            raise PermissionDenied('Only the property Owner may decide expenses.')
        visible = self.get_object()
        item = PropertyExpense.objects.select_for_update().get(pk=visible.pk)
        if item.status != 'Pending':
            raise ValidationError({'status': 'This expense is not pending.'})
        approved = request.data.get('approved')
        if not isinstance(approved, bool):
            raise ValidationError({'approved': 'Provide true or false.'})
        item.status = 'Approved' if approved else 'Rejected'
        item.decided_by = user
        item.decided_at = timezone.now()
        item.decision_note = str(request.data.get('note', ''))[:1000]
        item.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_note'])
        PropertyExpenseEvent.objects.create(expense=item, actor=user, action=item.status, summary=f'Owner {item.status.lower()} the expense.')
        record_activity(user, 'UPDATE', 'Property expense', item.pk, f'{item.status} expense {item.pk}.')
        return Response(self.get_serializer(item).data)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reverse(self, request, pk=None):
        user = self._active_user()
        if user.role != 'Owner':
            raise PermissionDenied('Only the property Owner may reverse an approved expense.')
        visible = self.get_object()
        item = PropertyExpense.objects.select_for_update().get(pk=visible.pk)
        if item.status != 'Approved':
            raise ValidationError({'status': 'Only an approved expense can be reversed.'})
        reason = request.data.get('reason', '')
        if not isinstance(reason, str) or not reason.strip() or len(reason) > 1000:
            raise ValidationError({'reason': 'Explain the reversal in at most 1000 characters.'})
        item.status = 'Reversed'
        item.decided_by = user
        item.decided_at = timezone.now()
        item.decision_note = reason.strip()
        item.save(update_fields=['status', 'decided_by', 'decided_at', 'decision_note'])
        PropertyExpenseEvent.objects.create(expense=item, actor=user, action='Reversed', summary=f'Owner reversed the expense: {reason.strip()[:440]}')
        record_activity(user, 'UPDATE', 'Property expense', item.pk, f'Reversed expense {item.pk}.')
        return Response(self.get_serializer(item).data)

    @action(detail=False, methods=['get'])
    def export(self, request):
        return csv_response('expenses', [
            ('ID', lambda item: item.pk), ('Property', lambda item: item.property.title),
            ('Incurred date', lambda item: item.incurred_on), ('Category', lambda item: item.category),
            ('Amount', lambda item: item.amount), ('Payee', lambda item: item.payee),
            ('Reference', lambda item: item.reference), ('Description', lambda item: item.description),
            ('Status', lambda item: item.status), ('Decided by', lambda item: item.decided_by_id),
            ('Decided at', lambda item: item.decided_at.isoformat() if item.decided_at else ''),
            ('Decision note', lambda item: item.decision_note),
        ], self.get_queryset())

    @action(detail=False, methods=['get'])
    def statement(self, request):
        user = self._active_user()
        property_id = request.query_params.get('propertyId')
        if not property_id or not property_id.isdigit():
            raise ValidationError({'propertyId': 'Choose a property.'})
        properties = Property.objects.filter(pk=property_id, is_deleted=False)
        if user.role == 'Owner':
            properties = properties.filter(owner=user)
        elif user.role == 'Property Manager':
            properties = properties.filter(manager=user)
        prop = properties.first()
        if not prop:
            raise PermissionDenied('This property is outside your scope.')
        month = request.query_params.get('month', timezone.localdate().strftime('%Y-%m'))
        try:
            year, month_number = map(int, month.split('-'))
            start = date(year, month_number, 1)
            end = date(year, month_number, monthrange(year, month_number)[1])
        except (ValueError, TypeError):
            raise ValidationError({'month': 'Use YYYY-MM.'})
        income = Payment.objects.filter(invoice__property=prop, status=Payment.Status.VERIFIED, payment_date__range=(start, end)).order_by('payment_date', 'id')
        expenses = PropertyExpense.objects.filter(property=prop, status='Approved', incurred_on__range=(start, end)).order_by('incurred_on', 'id')
        collected = income.aggregate(value=Sum('amount'))['value'] or Decimal('0.00')
        spent = expenses.aggregate(value=Sum('amount'))['value'] or Decimal('0.00')
        return Response({
            'propertyId': prop.pk, 'propertyTitle': prop.title, 'month': start.strftime('%Y-%m'),
            'periodStart': start.isoformat(), 'periodEnd': end.isoformat(),
            'verifiedRentCollected': str(collected), 'approvedExpenses': str(spent),
            'netCash': str(collected - spent),
            'incomeItems': [{'paymentId': item.pk, 'invoiceId': item.invoice_id, 'date': item.payment_date.isoformat(), 'amount': str(item.amount)} for item in income],
            'expenseItems': [{'expenseId': item.pk, 'date': item.incurred_on.isoformat(), 'category': item.category, 'amount': str(item.amount)} for item in expenses],
        })
