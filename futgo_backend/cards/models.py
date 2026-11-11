from django.db import models

from players.models import Player


class CardGame(models.Model):
    MODE_CHOICES = [
        ("LOCAL", "Local (one device)"),
        ("ONLINE", "Online (two devices)"),
    ]
    STATUS_CHOICES = [
        ("WAITING", "Waiting for opponent"),
        ("ACTIVE", "In progress"),
        ("FINISHED", "Finished"),
    ]
    PHASE_CHOICES = [
        ("CHOOSING", "Challenger is choosing a stat"),
        ("LOCKED", "Stat locked, waiting for reveal"),
        ("REVEALED", "Round revealed"),
    ]
    END_REASON_CHOICES = [
        ("NO_CARDS", "Ran out of cards"),
        ("CONCEDED", "Conceded"),
    ]

    room_code = models.CharField(max_length=6, unique=True)
    mode = models.CharField(max_length=6, choices=MODE_CHOICES, default="LOCAL")
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default="WAITING")
    phase = models.CharField(max_length=8, choices=PHASE_CHOICES, default="CHOOSING")

    player1_name = models.CharField(max_length=50)
    player2_name = models.CharField(max_length=50, blank=True)
    player1_token = models.CharField(max_length=64)
    player2_token = models.CharField(max_length=64, blank=True)

    category = models.CharField(max_length=30, blank=True)  # "" = all players
    deck_size = models.PositiveSmallIntegerField(default=20)

    challenger_seat = models.PositiveSmallIntegerField(default=1)
    locked_stat = models.CharField(max_length=20, blank=True)
    round_number = models.PositiveIntegerField(default=1)

    winner_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    end_reason = models.CharField(max_length=10, choices=END_REASON_CHOICES, blank=True)

    version = models.PositiveIntegerField(default=0)  # bumps on every change (for polling)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.room_code} ({self.mode}, {self.status})"


class GameCard(models.Model):
    """One card in a game. owner: 1 or 2 = that player's pile, 0 = tie pot."""

    game = models.ForeignKey(CardGame, on_delete=models.CASCADE, related_name="cards")
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="+")
    owner = models.PositiveSmallIntegerField()
    order = models.PositiveIntegerField()  # lowest order = top of the pile

    class Meta:
        ordering = ["owner", "order"]
        indexes = [models.Index(fields=["game", "owner", "order"])]
        constraints = [
            models.UniqueConstraint(fields=["game", "player"], name="unique_player_per_game"),
        ]

    def __str__(self):
        return f"{self.game.room_code}: {self.player.name} -> {self.owner}"


class CardRound(models.Model):
    game = models.ForeignKey(CardGame, on_delete=models.CASCADE, related_name="rounds")
    number = models.PositiveIntegerField()
    challenger_seat = models.PositiveSmallIntegerField()
    stat = models.CharField(max_length=20)
    p1_player = models.ForeignKey(Player, null=True, on_delete=models.SET_NULL, related_name="+")
    p2_player = models.ForeignKey(Player, null=True, on_delete=models.SET_NULL, related_name="+")
    p1_value = models.PositiveSmallIntegerField()
    p2_value = models.PositiveSmallIntegerField()
    winner_seat = models.PositiveSmallIntegerField()  # 0 = tie
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["game", "number"], name="unique_round_number"),
        ]