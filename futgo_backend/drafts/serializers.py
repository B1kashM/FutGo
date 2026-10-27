
from rest_framework import serializers
from .models import Draft


class CreateDraftSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["LOCAL", "ONLINE"])
    player1_name = serializers.CharField(max_length=50, trim_whitespace=True)

    player2_name = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )

    def validate(self, attrs):
        mode = attrs["mode"]
        player1_name = attrs["player1_name"].strip()
        player2_name = attrs.get("player2_name", "").strip()

        if not player1_name:
            raise serializers.ValidationError({
                "player1_name": "Enter Player 1's name."
            })

        if mode == "LOCAL" and not player2_name:
            raise serializers.ValidationError({
                "player2_name": "Enter Player 2's name for Local Play."
            })

        if mode == "LOCAL" and player1_name.casefold() == player2_name.casefold():
            raise serializers.ValidationError({
                "player2_name": "Player names must be different."
            })

        if mode == "ONLINE" and player2_name:
            raise serializers.ValidationError({
                "player2_name": "Player 2 joins separately using the room code."
            })

        attrs["player1_name"] = player1_name
        attrs["player2_name"] = player2_name
        return attrs
