
import secrets
import string

from django.db import models


def generate_room_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


class Draft(models.Model):
    MODE_CHOICES = [
        ("LOCAL", "Local Play"),
        ("ONLINE", "Online Play"),
    ]

    STATUS_CHOICES = [
        ("WAITING", "Waiting for player"),
        ("ACTIVE", "Active"),
        ("COMPLETED", "Completed"),
    ]

    mode = models.CharField(
        max_length=10,
        choices=MODE_CHOICES,
    )

    room_code = models.CharField(
        max_length=8,
        unique=True,
        null=True,
        blank=True,
        default=None,
    )

    player1_name = models.CharField(max_length=50)
    player2_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
    )

    active_player_number = models.PositiveSmallIntegerField(default=1)

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="WAITING",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Draft {self.id} ({self.mode}) - {self.status}"


class DraftEvent(models.Model):
    draft = models.ForeignKey(
        Draft,
        on_delete=models.CASCADE,
        related_name="events",
    )

    event_number = models.PositiveIntegerField()

    active_player_number = models.PositiveSmallIntegerField()

    offered_player1 = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="offered_as_option_one",
    )

    offered_player2 = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="offered_as_option_two",
    )

    selected_player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="selected_draft_events",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["event_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["draft", "event_number"],
                name="unique_event_number_per_draft",
            ),
        ]

    def __str__(self):
        return f"Draft {self.draft_id} - Event {self.event_number}"


class DraftPick(models.Model):
    draft = models.ForeignKey(
        Draft,
        on_delete=models.CASCADE,
        related_name="picks",
    )

    event = models.ForeignKey(
        DraftEvent,
        on_delete=models.CASCADE,
        related_name="picks",
    )

    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="draft_picks",
    )

    assigned_to_number = models.PositiveSmallIntegerField()

    was_selected = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["draft", "player"],
                name="unique_player_per_draft",
            ),
        ]

    def __str__(self):
        return (
            f"{self.player.name} assigned to Player "
            f"{self.assigned_to_number} in Draft {self.draft_id}"
        )


class DraftParticipant(models.Model):
    draft = models.ForeignKey(
        Draft,
        on_delete=models.CASCADE,
        related_name="participants",
    )

    seat_number = models.PositiveSmallIntegerField()

    display_name = models.CharField(max_length=50)

    # Store only the SHA-256 hash of the secret token.
    token_hash = models.CharField(max_length=64, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["draft", "seat_number"],
                name="unique_participant_seat_per_draft",
            ),
        ]

    def __str__(self):
        return f"{self.display_name} - Draft {self.draft_id}"
