from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from django.db import transaction
from django.db.models import Prefetch, Q
from django.utils import timezone
from django.contrib.auth import get_user_model
from ..models import Property, Unit, RentalApplication, RentalApplicationDecision
from ..serializers import RentalApplicationSerializer
from ..querysets import property_serializer_queryset
from contracts.models import Contract
from contracts.serializers import ContractSerializer
from users.audit import record_activity
from core.pagination import OptInPageNumberPagination
from notifications.models import Notification
from notifications.services import create_for_recipients

User = get_user_model()


from .permissions import IsAdminOrPropertyManager, IsApplicationReviewer, IsAdminOrPropertyManagerOrAgent

class RentalApplicationViewSet(viewsets.ModelViewSet):
    serializer_class = RentalApplicationSerializer
    pagination_class = OptInPageNumberPagination
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        applications = RentalApplication.objects.select_related(
            'inquiry', 'inquiry__unit', 'inquiry__unit__tenant', 'inquiry__agent', 'created_by',
            'reviewed_by', 'owner_reviewed_by'
        ).prefetch_related(
            Prefetch(
                'inquiry__property',
                queryset=property_serializer_queryset(Property.objects.all()),
            ),
            'decisions__actor',
        )
        if user.role == 'Admin':
            scoped_applications = applications
        elif user.role == 'Property Manager':
            scoped_applications = applications.filter(inquiry__property__manager=user)
        elif user.role == 'Owner':
            scoped_applications = applications.filter(inquiry__property__owner=user)
        elif user.role == 'Agent':
            scoped_applications = applications.filter(
                inquiry__agent=user,
                created_by=user,
                inquiry__property__assigned_agents=user,
            )
        else:
            return applications.none()
        application_status = self.request.query_params.get('status')
        search = self.request.query_params.get('search', '').strip()
        if application_status:
            scoped_applications = scoped_applications.filter(status=application_status)
        if search:
            scoped_applications = scoped_applications.filter(
                Q(applicant_email__icontains=search)
                | Q(inquiry__prospect_name__icontains=search)
                | Q(inquiry__property__title__icontains=search)
            )
        return scoped_applications.order_by('-created_at', '-id')

    def get_permissions(self):
        if self.action == 'create':
            return [IsAdminOrPropertyManagerOrAgent()]
        if self.action in ('partial_update', 'update'):
            return [IsApplicationReviewer()]
        if self.action == 'create_lease':
            return [IsAdminOrPropertyManager()]
        return [permissions.IsAuthenticated()]

    @transaction.atomic
    def perform_create(self, serializer):
        inquiry = serializer.validated_data['inquiry']
        application = serializer.save(
            created_by=self.request.user,
            status='Submitted',
            approval_mode=inquiry.property.application_approval_mode,
        )
        RentalApplicationDecision.objects.create(
            application=application,
            from_status='',
            to_status='Submitted',
            authority=self.request.user.role,
            actor=self.request.user,
        )
        inquiry = application.inquiry
        inquiry.status = 'Application In Progress'
        inquiry.prospect_email = application.applicant_email
        inquiry.save(update_fields=['status', 'prospect_email'])
        record_activity(self.request.user, 'CREATE', 'Rental application', application.pk, f'Submitted an application for {inquiry.prospect_name} at {inquiry.property.title}.')
        self._notify_application_participants(application, actor=self.request.user, created=True)

    def _notify_application_participants(self, application, *, actor, created=False, owner_review_needed=False):
        inquiry = application.inquiry
        property_obj = inquiry.property
        if property_obj.manager_id:
            create_for_recipients(
                recipients=[property_obj.manager],
                actor=actor,
                event_type=Notification.EventType.APPLICATION,
                title='New rental application' if created else 'Application status updated',
                message='A rental application is ready for review.' if created else 'A rental application status changed.',
                destination=Notification.Destination.MANAGER_APPLICATIONS,
            )
        if inquiry.agent_id and property_obj.assigned_agents.filter(pk=inquiry.agent_id, role='Agent').exists():
            create_for_recipients(
                recipients=[inquiry.agent],
                actor=actor,
                event_type=Notification.EventType.APPLICATION,
                title='Application status updated',
                message='The status of a prospect application you represent changed.',
                destination=Notification.Destination.AGENT_APPLICATIONS,
            )
        if owner_review_needed and property_obj.owner_id:
            create_for_recipients(
                recipients=[property_obj.owner],
                actor=actor,
                event_type=Notification.EventType.APPLICATION,
                title='Application needs your review',
                message='A rental application is waiting for your decision.',
                destination=Notification.Destination.OWNER_APPROVALS,
            )
        matching_tenant = User.objects.filter(
            role=User.Role.TENANT,
            is_active=True,
            is_deleted=False,
            email__iexact=application.applicant_email.strip(),
        ).first()
        if matching_tenant:
            create_for_recipients(
                recipients=[matching_tenant],
                actor=actor,
                event_type=Notification.EventType.APPLICATION,
                title='Application status updated',
                message='Your rental application status changed.',
                destination=Notification.Destination.TENANT_OVERVIEW,
            )

    @transaction.atomic
    def perform_update(self, serializer):
        locked_application = RentalApplication.objects.select_for_update().get(pk=serializer.instance.pk)
        serializer.instance = locked_application
        previous_status = serializer.instance.status
        new_status = serializer.validated_data.get('status', previous_status)
        instruction_note = str(serializer.validated_data.pop('decision_instruction_note', '') or '').strip()
        instruction_reference = str(serializer.validated_data.pop('decision_instruction_reference', '') or '').strip()
        allowed_transitions = {
            'Submitted': {'Under Review', 'Approved', 'Rejected'},
            'Under Review': {'Pending Owner Approval', 'Approved', 'Rejected'},
            'Pending Owner Approval': {'Approved', 'Rejected'},
            'Approved': {'Rejected'},
            'Rejected': set(),
            'Converted': set(),
        }
        if new_status != previous_status and new_status not in allowed_transitions.get(previous_status, set()):
            raise ValidationError({'status': f'An application in {previous_status} cannot move to {new_status}.'})
        inquiry = serializer.instance.inquiry
        user_role = self.request.user.role
        approval_mode = serializer.instance.approval_mode or inquiry.property.application_approval_mode
        if user_role == 'Owner' and previous_status != 'Pending Owner Approval':
            raise ValidationError({'status': 'Past decisions are read-only. You may act only on applications awaiting your decision.'})
        if user_role == 'Owner' and approval_mode != 'Owner':
            raise ValidationError({'status': 'The Owner delegated application decisions to the Property Manager for this property.'})
        if user_role == 'Property Manager' and approval_mode == 'Owner' and new_status in ('Approved', 'Rejected'):
            raise ValidationError({'status': 'This property requires the Owner to approve or decline the application.'})
        if user_role == 'Admin' and new_status != previous_status:
            if not instruction_note:
                raise ValidationError({'instructionNote': 'Enter the Owner instruction authorizing this application decision.'})
            if not instruction_reference:
                raise ValidationError({'instructionReference': 'Enter a reference to the Owner instruction.'})
        elif instruction_note or instruction_reference:
            raise ValidationError({'detail': 'Owner instruction details can only be recorded by an Admin.'})
        if previous_status == 'Approved' and new_status == 'Rejected' and Contract.objects.filter(
            source_application=serializer.instance,
            status__in=['Pending', 'Active'],
            is_deleted=False,
        ).exists():
            raise ValidationError({'status': 'A lease has already been prepared for this approved application. End the pending lease before rejecting the application.'})

        if new_status == 'Approved' and previous_status != 'Approved':
            if inquiry.unit_id:
                unit = Unit.objects.select_for_update().get(pk=inquiry.unit_id)
                if unit.status != 'Available':
                    raise ValidationError({'status': 'This unit is no longer available. Refresh applications and choose another unit.'})
                unit.status = 'Reserved'
                unit.save(update_fields=['status'])
            else:
                property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
                if property_obj.status != 'Available':
                    raise ValidationError({'status': 'This property is no longer available.'})
                property_obj.status = 'Pending'
                property_obj.save(update_fields=['status'])

        if user_role == 'Owner':
            application = serializer.save(owner_reviewed_by=self.request.user, owner_reviewed_at=timezone.now())
        else:
            application = serializer.save(reviewed_by=self.request.user, reviewed_at=timezone.now())
        if new_status != previous_status:
            if user_role == 'Owner':
                authority = 'Owner'
                decision_note = application.owner_review_notes
            elif user_role == 'Admin':
                authority = 'Admin Override'
                decision_note = instruction_note
            elif approval_mode == 'Manager':
                authority = 'Manager Delegation'
                decision_note = application.review_notes
            else:
                authority = 'Manager Review'
                decision_note = application.review_notes
            RentalApplicationDecision.objects.create(
                application=application,
                from_status=previous_status,
                to_status=new_status,
                authority=authority,
                note=decision_note,
                instruction_reference=instruction_reference,
                actor=self.request.user,
            )
        if new_status == 'Rejected' and inquiry.status != 'Closed':
            inquiry.status = 'Closed'
            inquiry.save(update_fields=['status'])

        if previous_status == 'Approved' and new_status == 'Rejected':
            if inquiry.unit_id:
                unit = Unit.objects.select_for_update().get(pk=inquiry.unit_id)
                has_lease = unit.contracts.filter(status__in=['Active', 'Pending'], is_deleted=False).exists()
                has_other_approval = RentalApplication.objects.filter(
                    inquiry__unit=unit, status='Approved'
                ).exclude(pk=application.pk).exists()
                if unit.status == 'Reserved' and not has_lease and not has_other_approval:
                    unit.status = 'Available'
                    unit.save(update_fields=['status'])
            else:
                property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
                has_active_lease = Contract.objects.filter(
                    property=property_obj, status__in=['Active', 'Pending'], is_deleted=False
                ).exists()
                has_other_approval = RentalApplication.objects.filter(
                    inquiry__property=property_obj, status='Approved'
                ).exclude(pk=application.pk).exists()
                if property_obj.status == 'Pending' and not has_active_lease and not has_other_approval:
                    property_obj.status = 'Available'
                    property_obj.save(update_fields=['status'])

        record_activity(self.request.user, 'REVIEW', 'Rental application', application.pk, f'Changed application status to {application.status}.')
        if new_status != previous_status:
            self._notify_application_participants(
                application,
                actor=self.request.user,
                owner_review_needed=new_status == 'Pending Owner Approval',
            )

    @action(detail=True, methods=['post'], url_path='create-lease')
    @transaction.atomic
    def create_lease(self, request, pk=None):
        application = self.get_object()
        # Lock only the application row. Joining the nullable inquiry unit via
        # select_related makes PostgreSQL reject FOR UPDATE on the outer join.
        application = RentalApplication.objects.select_for_update().get(pk=application.pk)
        if application.status != 'Approved':
            raise ValidationError({'status': 'Only approved applications can be converted into a lease.'})
        if Contract.objects.filter(
            source_application=application,
            status__in=['Pending', 'Active'],
            is_deleted=False,
        ).exists():
            raise ValidationError({'application': 'A pending or active lease already exists for this application.'})

        inquiry = application.inquiry
        applicant_email = application.applicant_email.strip().casefold()
        matching_tenant = User.objects.filter(
            role=User.Role.TENANT,
            is_active=True,
            is_deleted=False,
            email__iexact=applicant_email,
        ).first()
        if not matching_tenant:
            raise ValidationError({
                'tenant': 'No tenant account exists for this applicant yet. Ask an Admin to create the tenant account, then prepare the lease.'
            })
        try:
            selected_tenant_id = int(request.data.get('tenant'))
        except (TypeError, ValueError):
            selected_tenant_id = None
        if selected_tenant_id != matching_tenant.pk:
            raise ValidationError({'tenant': 'Select the existing tenant account whose email matches the applicant.'})
        unit = inquiry.unit
        if unit:
            unit = Unit.objects.select_for_update().get(pk=unit.pk)
            if unit.status != 'Reserved':
                raise ValidationError({'unit': 'The approved application no longer holds this unit. Review its availability before creating a lease.'})
        else:
            property_obj = Property.objects.select_for_update().get(pk=inquiry.property_id)
            if property_obj.status != 'Pending':
                raise ValidationError({'property': 'The approved application no longer holds this property.'})
        rent_amount = unit.monthly_rate if unit else inquiry.property.price
        lease_payload = {
            'property': inquiry.property_id,
            'unit': unit.pk if unit else None,
            'tenant': request.data.get('tenant'),
            'startDate': request.data.get('startDate') or application.move_in_date,
            'endDate': request.data.get('endDate'),
            'rentAmount': rent_amount,
            'rentDueDay': request.data.get('rentDueDay', 1),
            'depositAmount': request.data.get('depositAmount', 0),
        }
        lease_serializer = ContractSerializer(
            data=lease_payload,
            context={'request': request, 'approved_application': application},
        )
        lease_serializer.is_valid(raise_exception=True)
        tenant = lease_serializer.validated_data['tenant']
        if tenant.email.strip().casefold() != application.applicant_email.strip().casefold():
            raise ValidationError({'tenant': 'Select or create a tenant account using the applicant email address.'})
        contract = lease_serializer.save(source_application=application)
        record_activity(request.user, 'CREATE', 'Contract', contract.pk, f'Prepared a pending lease from approved application {application.pk}.')
        record_activity(request.user, 'PREPARE', 'Rental application', application.pk, f'Prepared lease {contract.pk}; application remains approved until lease activation.')
        property_obj = contract.property
        create_for_recipients(
            recipients=[property_obj.owner] if property_obj.owner_id else [],
            actor=request.user,
            event_type=Notification.EventType.LEASE,
            title='Lease prepared',
            message='A lease is ready for review and signing.',
            destination=Notification.Destination.OWNER_CONTRACTS,
        )
        create_for_recipients(
            recipients=[property_obj.manager] if property_obj.manager_id else [],
            actor=request.user,
            event_type=Notification.EventType.LEASE,
            title='Lease prepared',
            message='A lease is ready for review and signing.',
            destination=Notification.Destination.MANAGER_CONTRACTS,
        )
        create_for_recipients(
            recipients=[contract.tenant],
            actor=request.user,
            event_type=Notification.EventType.LEASE,
            title='Lease prepared',
            message='Your lease is ready for review and signing.',
            destination=Notification.Destination.TENANT_LEASE,
        )

        return Response({
            'application': RentalApplicationSerializer(application, context={'request': request}).data,
            'contract': ContractSerializer(contract, context={'request': request}).data,
        }, status=status.HTTP_201_CREATED)
