from django.test import SimpleTestCase

from contracts.models import Contract
from contracts.serializers import ContractSerializer


class ContractSerializerQuerySetTests(SimpleTestCase):
    def test_serializes_empty_queryset_with_many(self):
        queryset = Contract.objects.none()

        serializer = ContractSerializer(queryset, many=True)

        self.assertIs(serializer.instance, queryset)
        self.assertIsInstance(serializer.child, ContractSerializer)
        self.assertEqual(serializer.data, [])
