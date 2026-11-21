from django.db import models

from players.models import Player


class CardGame(models.Model):
    MODE_CHOICES = [
        ("LOCAL", "Local (one device)"),
        ("ONLINE", "Online (2 to 6 devices)"),
    ]
    STATUS_CHOICES = [
        ("WAITING", "Waiting for players"),
        ("ACTIVE", "In progress"),
        ("FINISHED", "Finished"),
    ]
    PHASE_CHOICES = [
        ("CHOOSING", "Challenger is choosing a stat"),
        ("LOCKED", "Stat locked, waiting for reveals"),
        ("REVEALED", "Clash revealed"),
    ]
    END_REASON_CHOICES = [
        ("NO_CARDS", "Ran out of cards"),
        ("CONCEDED", "Conceded"),
    ]

    room_code = models.CharField(max_length=6, unique=True)
    mode = models.CharField(max_length=6, choices=MODE_CHOICES, default="LOCAL")
    status = models.CharField(max_length=8, choices=STATUS_CHOICES, default="WAITING")
    phase = models.CharField(max_length=8, choices=PHASE_CHOICES, default="CHOOSING")

    # Legacy 2-player columns. Seats 1 and 2 are still copied here; the real
    # list of players now lives in CardPlayer.
    player1_name = models.CharField(max_length=50)
    player2_name = models.CharField(max_length=50, blank=True)
    player1_token = models.CharField(max_length=64)
    player2_token = models.CharField(max_length=64, blank=True)

    category = models.CharField(max_length=30, blank=True)  # "" = all players
    deck_size = models.PositiveSmallIntegerField(default=20)  # cards per player
    max_players = models.PositiveSmallIntegerField(default=2)  # 2 to 6

    challenger_seat = models.PositiveSmallIntegerField(default=1)
    locked_stat = models.CharField(max_length=20, blank=True)
    round_number = models.PositiveIntegerField(default=1)

    # Tie-break handling inside one round.
    clash_number = models.PositiveSmallIntegerField(default=1)
    tie_seats = models.CharField(max_length=20, blank=True, default="")  # e.g. "2,4"
    clash_winner_seat = models.PositiveSmallIntegerField(null=True, blank=True)  # None = undecided, 0 = tie

    winner_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    end_reason = models.CharField(max_length=10, choices=END_REASON_CHOICES, blank=True)

    version = models.PositiveIntegerField(default=0)  # bumps on every change (for polling)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Legacy tier columns (tiers are now stored per seat in CardPlayer).
    player1_used_tiers = models.CharField(max_length=40, blank=True, default="")
    player2_used_tiers = models.CharField(max_length=40, blank=True, default="")
    card_swapped = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.room_code} ({self.mode}, {self.status}, {self.max_players}p)"


class CardPlayer(models.Model):
    """One seat in a game: name, secret token, tier picks used, knocked-out flag."""

    game = models.ForeignKey(CardGame, on_delete=models.CASCADE, related_name="seats")
    seat = models.PositiveSmallIntegerField()  # 1..max_players
    name = models.CharField(max_length=50)
    token = models.CharField(max_length=64, blank=True)
    used_tiers = models.CharField(max_length=40, blank=True, default="")
    eliminated = models.BooleanField(default=False)

    class Meta:
        ordering = ["seat"]
        constraints = [
            models.UniqueConstraint(fields=["game", "seat"], name="unique_seat_per_game"),
        ]

    def __str__(self):
        return f"{self.game.room_code}: seat {self.seat} {self.name}"


class GameCard(models.Model):
    """One card in a game. owner: 1..6 = that seat's pile, 0 = the table pot."""

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


class CardPlay(models.Model):
    """A card a seat showed in one clash of one round."""

    game = models.ForeignKey(CardGame, on_delete=models.CASCADE, related_name="plays")
    round_number = models.PositiveIntegerField()
    clash = models.PositiveSmallIntegerField(default=1)  # 2+ = tie-break clash
    seat = models.PositiveSmallIntegerField()
    card = models.ForeignKey(GameCard, on_delete=models.CASCADE, related_name="plays")
    value = models.IntegerField()  # the card's value for the locked stat

    class Meta:
        ordering = ["round_number", "clash", "seat"]
        constraints = [
            models.UniqueConstraint(
                fields=["game", "round_number", "clash", "seat"],
                name="unique_play_per_seat_clash",
            ),
        ]

    def __str__(self):
        return f"{self.game.room_code} r{self.round_number}.{self.clash} seat {self.seat}: {self.value}"


class CardRound(models.Model):
    """Old 2-player round log. No longer written by services.py; kept so existing
    migrations and data stay valid."""

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