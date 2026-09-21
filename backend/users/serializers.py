from rest_framework import serializers
from .models import User

class UserSerializer(serializers.ModelSerializer):
    _id = serializers.IntegerField(source='id', read_only=True)
    isDeleted = serializers.BooleanField(source='is_deleted', required=False, default=False)
    createdAt = serializers.DateTimeField(source='date_joined', read_only=True) 
    name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['_id', 'username', 'email', 'first_name', 'last_name', 'name', 'role', 'isDeleted', 'createdAt']

    def get_name(self, obj):
        full_name = f"{obj.first_name} {obj.last_name}".strip()
        return full_name if full_name else obj.email

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