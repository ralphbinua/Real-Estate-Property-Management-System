from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model
from ..models import Property, Unit, UnitPriceChangeRequest
from ..serializers import UnitPriceChangeRequestSerializer, manager_has_unit_pricing_authority
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


from .permissions import IsPropertyManager, IsOwner

class UnitPriceChangeRequestViewSet(viewsets.ModelViewSet):
    serializer_class = UnitPriceChangeRequestSerializer
    pagination_class = OptInPageNumberPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        requests = UnitPriceChangeRequest.objects.select_related(
            'property', 'unit', 'proposed_by', 'decided_by',
        ).filter(property__is_deleted=False)
        if user.role == 'Admin':
            scoped_requests = requests
        elif user.role == 'Owner':
            scoped_requests = requests.filter(property__owner=user)
        elif user.role == 'Property Manager':
            scoped_requests = requests.filter(property__manager=user, proposed_by=user)
        else:
            scoped_requests = requests.none()
        request_status = self.request.query_params.get('status')
        property_id = self.request.query_params.get('propertyId')
        if request_status:
            scoped_requests = scoped_requests.filter(status=request_status)
        if property_id:
            scoped_requests = scoped_requests.filter(property_id=property_id)
        return scoped_requests.order_by('-created_at', '-id')

    def get_permissions(self):
        if self.action == 'create':
            return [IsPropertyManager()]
        if self.action == 'decision':
            return [IsOwner()]
        return [permissions.IsAuthenticated()]

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed(request.method)

    def partial_update(self, request, *args, **kwargs):
        # PATCH is reserved for the explicit owner decision action. This keeps
        # the submitted amount and target immutable while a request is pending.
        raise MethodNotAllowed(request.method)

    @transaction.atomic
    def perform_create(self, serializer):
        property_obj = Property.objects.select_for_update().get(
            pk=serializer.validated_data['property'].pk,
            is_deleted=False,
        )
        manager = self.request.user
        if property_obj.manager_id != manager.pk:
            raise ValidationError({'propertyId': 'You may request rent changes only for properties assigned to you.'})
        if not property_obj.owner_id:
            raise ValidationError({'propertyId': 'An Owner must be assigned before a rent change can be submitted.'})
        if manager_has_unit_pricing_authority(property_obj, manager):
            raise ValidationError({'detail': 'You already have Owner-authorized pricing access for this property. Update the rate directly.'})

        target_kind = serializer.validated_data['target_kind']
        unit = serializer.validated_data.get('unit')
        if target_kind == 'Unit':
            if not unit or unit.property_id != property_obj.pk:
                raise ValidationError({'unitId': 'Choose a unit on the selected property.'})
            unit = Unit.objects.select_for_update().get(pk=unit.pk, property_id=property_obj.pk)
            current_rate = unit.monthly_rate
            target_label = f'Unit {unit.unit_number}'
        else:
            if unit:
                raise ValidationError({'unitId': 'A property base-rate request cannot target a unit.'})
            current_rate = property_obj.price
            target_label = 'Property base rate'

        if serializer.validated_data['proposed_rate'] == current_rate:
            raise ValidationError({'proposedRate': 'The current rate has changed. Refresh the property and submit a new proposal.'})
        if UnitPriceChangeRequest.objects.filter(
            property=property_obj,
            target_kind=target_kind,
            unit=unit if target_kind == 'Unit' else None,
            status='Pending',
        ).exists():
            raise ValidationError({'detail': 'There is already a pending rent-change request for this rate.'})

        change_request = serializer.save(
            property=property_obj,
            unit=unit if target_kind == 'Unit' else None,
            current_rate=current_rate,
            target_label=target_label,
            proposed_by=manager,
        )
        record_activity(
            manager,
            'PROPOSE RENT CHANGE',
            'Property',
            property_obj.pk,
            f'{manager.get_full_name() or manager.email} proposed changing {target_label} at {property_obj.title} from ₱{current_rate} to ₱{change_request.proposed_rate}.',
        )
        create_for_recipients(
            recipients=[property_obj.owner],
            actor=manager,
            event_type=Notification.EventType.RENT_CHANGE,
            title='Rent proposal needs your review',
            message=f'A rent change was proposed for {property_obj.title}.',
            destination=Notification.Destination.OWNER_PRICING,
        )

    @action(detail=True, methods=['patch'], url_path='decision')
    @transaction.atomic
    def decision(self, request, pk=None):
        change_request = self.get_object()
        change_request = UnitPriceChangeRequest.objects.select_for_update().get(pk=change_request.pk)
        property_obj = Property.objects.select_for_update().get(pk=change_request.property_id)
        if property_obj.owner_id != request.user.pk:
            raise ValidationError({'detail': 'Only this property’s Owner may decide this rent-change request.'})
        if change_request.status != 'Pending':
            raise ValidationError({'detail': 'This rent-change request has already been decided.'})

        decision = request.data.get('status')
        if decision not in ('Approved', 'Rejected'):
            raise ValidationError({'status': 'Choose Approved or Rejected.'})
        decision_note = str(request.data.get('decisionNote') or '').strip()
        if len(decision_note) > 2000:
            raise ValidationError({'decisionNote': 'The decision note cannot exceed 2,000 characters.'})

        def cancel_stale_request(message):
            change_request.status = 'Cancelled'
            change_request.decision_note = message
            change_request.decided_by = None
            change_request.decided_at = timezone.now()
            change_request.save(update_fields=['status', 'decision_note', 'decided_by', 'decided_at'])
            record_activity(
                request.user,
                'CANCEL STALE RENT CHANGE',
                'Property',
                property_obj.pk,
                f'Closed rent-change proposal for {change_request.target_label} at {property_obj.title}: {message}',
            )
            create_for_recipients(
                recipients=[change_request.proposed_by],
                actor=request.user,
                event_type=Notification.EventType.RENT_CHANGE,
                title='Rent proposal closed',
                message=f'The rent proposal for {property_obj.title} closed because its current rate changed.',
                destination=Notification.Destination.MANAGER_PRICING,
            )
            return Response({
                'detail': message,
                'rentChangeRequest': UnitPriceChangeRequestSerializer(change_request, context={'request': request}).data,
            }, status=status.HTTP_409_CONFLICT)

        if decision == 'Approved':
            if change_request.target_kind == 'Unit':
                if not change_request.unit_id:
                    return cancel_stale_request('The requested unit no longer exists. Ask the Manager to submit a new proposal for a current unit.')
                unit = Unit.objects.select_for_update().filter(
                    pk=change_request.unit_id, property=property_obj,
                ).first()
                if not unit:
                    return cancel_stale_request('The requested unit no longer exists. Ask the Manager to submit a new proposal for a current unit.')
                current_rate = unit.monthly_rate
                if current_rate != change_request.current_rate:
                    return cancel_stale_request('The current unit rent changed since this request was submitted. Ask the Manager to submit a new proposal using the current rate.')
                unit.monthly_rate = change_request.proposed_rate
                unit.save(update_fields=['monthly_rate'])
            else:
                current_rate = property_obj.price
                if current_rate != change_request.current_rate:
                    return cancel_stale_request('The current property rate changed since this request was submitted. Ask the Manager to submit a new proposal using the current rate.')
                property_obj.price = change_request.proposed_rate
                property_obj.save(update_fields=['price', 'updated_at'])

        change_request.status = decision
        change_request.decision_note = decision_note
        change_request.decided_by = request.user
        change_request.decided_at = timezone.now()
        change_request.save(update_fields=['status', 'decision_note', 'decided_by', 'decided_at'])
        record_activity(
            request.user,
            f'{decision.upper()} RENT CHANGE',
            'Property',
            property_obj.pk,
            f'{decision} rent change for {change_request.target_label} at {property_obj.title}: ₱{change_request.current_rate} to ₱{change_request.proposed_rate}.'
            + (f' Owner note: {decision_note}' if decision_note else ''),
        )
        create_for_recipients(
            recipients=[change_request.proposed_by],
            actor=request.user,
            event_type=Notification.EventType.RENT_CHANGE,
            title=f'Rent proposal {decision.lower()}',
            message=f'Your rent proposal for {property_obj.title} was {decision.lower()}.',
            destination=Notification.Destination.MANAGER_PRICING,
        )
        return Response(UnitPriceChangeRequestSerializer(change_request, context={'request': request}).data)
