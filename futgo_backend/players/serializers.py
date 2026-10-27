from rest_framework import serializers
from .models import Player


class BulkPlayerCreateListSerializer(serializers.ListSerializer):
    def create(self, validated_data):
        players = [Player(**item) for item in validated_data]
        return Player.objects.bulk_create(players)


class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = "__all__"
        list_serializer_class = BulkPlayerCreateListSerializer