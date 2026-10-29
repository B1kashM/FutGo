from rest_framework import serializers

from .models import Draft, Team


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = [
            "id",
            "name",
            "short_name",
            "logo_url",
            "primary_color",
            "secondary_color",
            "is_active",
        ]
        read_only_fields = ["id"]


class CreateDraftSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=["LOCAL", "ONLINE"])

    category = serializers.ChoiceField(
        choices=Draft.CATEGORY_CHOICES,
        default="LEGENDS",
    )

    player1_name = serializers.CharField(
        max_length=50,
        trim_whitespace=True,
    )

    player2_name = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )

    player1_team_id = serializers.PrimaryKeyRelatedField(
        source="player1_team",
        queryset=Team.objects.filter(is_active=True),
        required=True,
        error_messages={
            "required": "Select a football club for Player 1.",
            "does_not_exist": "The selected club does not exist or is unavailable.",
            "incorrect_type": "Provide a valid club ID for Player 1.",
        },
    )

    player2_team_id = serializers.PrimaryKeyRelatedField(
        source="player2_team",
        queryset=Team.objects.filter(is_active=True),
        required=False,
        allow_null=True,
        error_messages={
            "does_not_exist": "The selected club does not exist or is unavailable.",
            "incorrect_type": "Provide a valid club ID for Player 2.",
        },
    )

    def validate(self, attrs):
        mode = attrs["mode"]
        player1_name = attrs["player1_name"].strip()
        player2_name = attrs.get("player2_name", "").strip()

        player1_team = attrs["player1_team"]
        player2_team = attrs.get("player2_team")

        if not player1_name:
            raise serializers.ValidationError({
                "player1_name": "Enter Player 1's name."
            })

        if mode == "LOCAL" and not player2_name:
            raise serializers.ValidationError({
                "player2_name": "Enter Player 2's name for Local Play."
            })

        if (
            mode == "LOCAL"
            and player1_name.casefold() == player2_name.casefold()
        ):
            raise serializers.ValidationError({
                "player2_name": "Player names must be different."
            })

        if mode == "ONLINE" and player2_name:
            raise serializers.ValidationError({
                "player2_name": (
                    "Player 2 joins separately using the room code."
                )
            })

        if mode == "LOCAL":
            if player2_team is None:
                raise serializers.ValidationError({
                    "player2_team_id": (
                        "Select a different football club for Player 2."
                    )
                })

            if player1_team.pk == player2_team.pk:
                raise serializers.ValidationError({
                    "player2_team_id": (
                        "Each player must choose a different football club."
                    )
                })
        elif player2_team is not None:
            raise serializers.ValidationError({
                "player2_team_id": (
                    "Player 2 selects their club after joining the online draft."
                )
            })

        attrs["player1_name"] = player1_name
        attrs["player2_name"] = player2_name

        return attrs
