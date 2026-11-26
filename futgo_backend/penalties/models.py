from django.db import models


class PenaltyGame(models.Model):
    MODE_CHOICES = [("LOCAL", "Local"), ("ONLINE", "Online")]
    STATUS_CHOICES = [
        ("WAITING", "Waiting for players"),
        ("SQUAD", "Building squads"),
        ("ACTIVE", "Shootout in progress"),
        ("FINISHED", "Finished"),
    ]
    SQUAD_CHOICES = [("RANDOM", "Random squad"), ("DRAFT", "Build your squad")]

    room_code = models.CharField(max_length=8, unique=True)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default="LOCAL")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="WAITING")
    squad_mode = models.CharField(max_length=10, choices=SQUAD_CHOICES, default="RANDOM")
    category = models.CharField(max_length=30, blank=True, default="")
    max_players = models.PositiveSmallIntegerField(default=2)

    draft_step = models.PositiveSmallIntegerField(default=0)
    round_number = models.PositiveSmallIntegerField(default=0)
    bye_seats = models.CharField(max_length=20, blank=True, default="")
    champion_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    end_reason = models.CharField(max_length=20, blank=True, default="")

    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.room_code} ({self.mode}, {self.status})"


class PenaltySeat(models.Model):
    game = models.ForeignKey(PenaltyGame, related_name="seats", on_delete=models.CASCADE)
    seat = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=50)
    token = models.CharField(max_length=64)
    eliminated = models.BooleanField(default=False)

    class Meta:
        unique_together = ("game", "seat")
        ordering = ["seat"]

    def __str__(self):
        return f"{self.game.room_code} seat {self.seat}: {self.name}"


class SquadSlot(models.Model):
    """One player in one seat's squad. `position` is the squad slot (GK, RB ...)."""

    game = models.ForeignKey(PenaltyGame, related_name="squad", on_delete=models.CASCADE)
    seat = models.PositiveSmallIntegerField()
    position = models.CharField(max_length=4)
    player = models.ForeignKey("players.Player", related_name="+", on_delete=models.CASCADE)

    class Meta:
        unique_together = ("game", "seat", "position")
        ordering = ["seat", "id"]


class DraftOffer(models.Model):
    """Candidates shown for one draft step (one position)."""

    game = models.ForeignKey(PenaltyGame, related_name="offers", on_delete=models.CASCADE)
    step = models.PositiveSmallIntegerField()
    player = models.ForeignKey("players.Player", related_name="+", on_delete=models.CASCADE)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["step", "order"]


class PenaltyMatch(models.Model):
    STATUS_CHOICES = [("ACTIVE", "Active"), ("FINISHED", "Finished")]

    game = models.ForeignKey(PenaltyGame, related_name="matches", on_delete=models.CASCADE)
    round_number = models.PositiveSmallIntegerField()
    round_name = models.CharField(max_length=30)
    match_number = models.PositiveSmallIntegerField()

    seat_a = models.PositiveSmallIntegerField()
    seat_b = models.PositiveSmallIntegerField()
    first_seat = models.PositiveSmallIntegerField()

    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="ACTIVE")
    phase = models.CharField(max_length=10, default="SHOOT")  # SHOOT / DIVE / DONE
    pending_shot = models.CharField(max_length=20, blank=True, default="")
    dive_deadline = models.DateTimeField(null=True, blank=True)
    pending_dive = models.CharField(max_length=10, blank=True, default="")

    score_a = models.PositiveSmallIntegerField(default=0)
    score_b = models.PositiveSmallIntegerField(default=0)
    kicks_a = models.PositiveSmallIntegerField(default=0)
    kicks_b = models.PositiveSmallIntegerField(default=0)

    winner_seat = models.PositiveSmallIntegerField(null=True, blank=True)
    end_reason = models.CharField(max_length=20, blank=True, default="")

    class Meta:
        ordering = ["round_number", "match_number"]

    def __str__(self):
        return f"{self.game.room_code} {self.round_name} #{self.match_number}"


class PenaltyKick(models.Model):
    match = models.ForeignKey(PenaltyMatch, related_name="kicks", on_delete=models.CASCADE)
    number = models.PositiveSmallIntegerField()
    round_number = models.PositiveSmallIntegerField()  # kick round inside the shootout
    sudden_death = models.BooleanField(default=False)

    seat = models.PositiveSmallIntegerField()  # shooter's seat
    keeper_seat = models.PositiveSmallIntegerField()
    shooter = models.ForeignKey("players.Player", related_name="+", on_delete=models.CASCADE)
    keeper = models.ForeignKey("players.Player", related_name="+", on_delete=models.CASCADE)

    shot_zone = models.CharField(max_length=20)
    dive_zone = models.CharField(max_length=20)
    outcome = models.CharField(max_length=10)  # GOAL SAVED POST BAR WIDE OVER
    commentary = models.CharField(max_length=255, blank=True, default="")

    score_a = models.PositiveSmallIntegerField(default=0)
    score_b = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["number"]
        unique_together = ("match", "number")