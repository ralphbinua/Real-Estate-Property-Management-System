from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    isDeleted = serializers.BooleanField(source='is_deleted', required=False, default=False)
    createdAt = serializers.DateTimeField(source='date_joined', read_only=True) 
    name = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ['_id', 'username', 'email', 'first_name', 'last_name', 'name', 'role', 'isDeleted', 'createdAt']

    def to_representation(self, instance):
        ret = super().to_representation(instance)
        full_name = f"{instance.first_name} {instance.last_name}".strip()
        ret['name'] = full_name if full_name else instance.email
        return ret

    def update(self, instance, validated_data):
        name = validated_data.pop('name', None)
        if name is not None:
            parts = name.strip().split(' ', 1)
            instance.first_name = parts[0]
            instance.last_name = parts[1] if len(parts) > 1 else ''
        
        email = validated_data.get('email', None)
        if email:
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