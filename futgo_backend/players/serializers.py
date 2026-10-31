from rest_framework import serializers
from .models import Player


class BulkPlayerCreateListSerializer(serializers.ListSerializer):
    def create(self, validated_data):
        players = [Player(**item) for item in validated_data]
        return Player.objects.bulk_create(players)


class PlayerSerializer(serializers.ModelSerializer):
    ovr_rating = serializers.IntegerField(
        min_value=0,
        max_value=99,
        default=0
    )

    class Meta:
        model = Player
        fields = "__all__"
        list_serializer_class = BulkPlayerCreateListSerializer