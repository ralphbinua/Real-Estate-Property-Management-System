from rest_framework import serializers
from .models import User, SystemSettings

class UserSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    isDeleted = serializers.BooleanField(source='is_deleted', required=False, default=False)
    isActive = serializers.BooleanField(source='is_active', read_only=True)
    createdAt = serializers.DateTimeField(source='date_joined', read_only=True) 
    name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['_id', 'username', 'email', 'first_name', 'last_name', 'name', 'role', 'isActive', 'isDeleted', 'createdAt']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        full_name = f"{instance.first_name} {instance.last_name}".strip()
        ret['name'] = full_name if full_name else instance.email
        return ret

    def validate(self, attrs):
        if not self.instance:
            return attrs
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        new_role = attrs.get('role', self.instance.role)
        deleting = attrs.get('is_deleted', self.instance.is_deleted)
        disabling_admin = self.instance.role == User.Role.ADMIN and (new_role != User.Role.ADMIN or deleting)
        if user and self.instance.pk == user.pk and disabling_admin:
            raise serializers.ValidationError('You cannot deactivate or change the role of your own administrator account.')
        if disabling_admin and User.objects.filter(role=User.Role.ADMIN, is_active=True, is_deleted=False).count() <= 1:
            raise serializers.ValidationError('The last active administrator account cannot be deactivated or demoted.')
        return attrs

    def update(self, instance, validated_data):
        name = validated_data.pop('name', None)
        if name is not None:
            parts = name.strip().split(' ', 1)
            instance.first_name = parts[0]
            instance.last_name = parts[1] if len(parts) > 1 else ''
        
        email = validated_data.get('email', None)
        if email:
            if User.objects.exclude(pk=instance.pk).filter(username=email).exists():
                raise serializers.ValidationError({'email': 'This email conflicts with another account username.'})
            instance.email = email
            instance.username = email

        role = validated_data.get('role', None)
        if role:
            instance.role = role

        for attr, value in validated_data.items():
            if attr not in ['email', 'role']:
                setattr(instance, attr, value)

        request = self.context.get('request')
        if request and 'password' in request.data and request.data['password']:
            instance.set_password(request.data['password'])

        instance.save()
        return instance

class UserCreateSerializer(serializers.ModelSerializer):
    name = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['email', 'password', 'first_name', 'last_name', 'name', 'role']
        extra_kwargs = {
            'password': {'write_only': True, 'required': True},
            'role': {'required': False}
        }

    def create(self, validated_data):
        name = validated_data.pop('name', '')
        first_name = validated_data.get('first_name', '')
        last_name = validated_data.get('last_name', '')

        # If a single "name" string was supplied from the React form
        if name and not (first_name or last_name):
            parts = name.strip().split(' ', 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else ''

        email = validated_data['email']
        user = User.objects.create_user(
            username=email,
            email=email,
            password=validated_data['password'],
            first_name=first_name,
            last_name=last_name,
            role=validated_data.get('role', 'Tenant')
        )
        return user


class CurrentUserProfileSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['_id', 'name', 'first_name', 'last_name', 'email', 'role']
        read_only_fields = ['_id', 'role']

    def get_name(self, instance):
        return f'{instance.first_name} {instance.last_name}'.strip() or instance.email

    def validate_email(self, value):
        if User.objects.exclude(pk=self.instance.pk).filter(username=value).exists():
            raise serializers.ValidationError('This email conflicts with another account username.')
        return value

    def update(self, instance, validated_data):
        email = validated_data.get('email')
        if email:
            instance.username = email
        return super().update(instance, validated_data)


class SystemSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemSettings
        fields = ['system_name', 'support_email', 'default_lease_term_months', 'updated_at']
        read_only_fields = ['updated_at']

    def validate_default_lease_term_months(self, value):
        if not 1 <= value <= 60:
            raise serializers.ValidationError('Lease term must be between 1 and 60 months.')
        return value
