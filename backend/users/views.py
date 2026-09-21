from rest_framework import viewsets, permissions
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model
from .serializers import UserSerializer, UserCreateSerializer

User = get_user_model()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        email_or_username = attrs.get("username") or attrs.get("email")
        if email_or_username:
            try:
                user_obj = User.objects.get(email__iexact=email_or_username)
                attrs["username"] = user_obj.username
            except User.DoesNotExist:
                pass

        data = super().validate(attrs)
        data['token'] = data.pop('access')
        data['_id'] = self.user.id
        name_str = f"{self.user.first_name} {self.user.last_name}".strip()
        data['name'] = name_str if name_str else self.user.email
        data['email'] = self.user.email
        data['role'] = getattr(self.user, 'role', 'Admin')
        return data

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_queryset(self):
        include_deleted = self.request.query_params.get('includeDeleted')
        if include_deleted == 'true':
            return User.objects.all().order_by('-id')
        return User.objects.filter(is_deleted=False).order_by('-id')