import secrets
import string
from decimal import Decimal

import django
from django.db import models
from django.db.models import F, Q


def generate_room_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _check_constraint(condition, name):
    """
    Django 5.1 renamed CheckConstraint(check=...) to
    CheckConstraint(condition=...). This helper works on both,
    so it does not matter which Django version is installed.
    """
    if django.VERSION >= (5, 1):
        return models.CheckConstraint(condition=condition, name=name)
    return models.CheckConstraint(check=condition, name=name)


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

    CATEGORY_CHOICES = [
        ("LEGENDS", "All-Time Legends"),
        ("PREMIER_LEAGUE", "Premier League"),
        ("LA_LIGA", "La Liga"),
        ("YOUNG_TALENTS", "Young Talents"),
    ]

    mode = models.CharField(
        max_length=10,
        choices=MODE_CHOICES,
    )

    category = models.CharField(
        max_length=20,
        choices=CATEGORY_CHOICES,
        default="LEGENDS",
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

    completed_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    def __str__(self):
        return (
            f"Draft {self.id} "
            f"({self.mode}, {self.category}) - {self.status}"
        )


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

    seat_number = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
    )

    display_name = models.CharField(
        max_length=50,
        blank=True,
        default="",
    )

    token_hash = models.CharField(
        max_length=64,
        unique=True,
        blank=True,
        default=None,
        null=True,
    )

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


# ============================================================
# MATCHES
# ============================================================

class MatchResult(models.Model):
    """
    One simulated match. A single completed Draft can have many
    MatchResult rows (the original match plus any rematches), and
    every match uses the same DraftPick squads.
    """

    # CHANGED: was OneToOneField(related_name="match_result").
    draft = models.ForeignKey(
        Draft,
        on_delete=models.CASCADE,
        related_name="matches",
    )

    player1_score = models.PositiveSmallIntegerField(default=0)

    player2_score = models.PositiveSmallIntegerField(default=0)

    # 1 = Player 1 wins, 2 = Player 2 wins, 0 = draw.
    winner_number = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
    )

    duration_minutes = models.PositiveSmallIntegerField(default=90)

    # NEW: chosen from this match's simulated performances.
    # Null for matches played before this upgrade.
    man_of_the_match = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="man_of_the_match_awards",
    )

    # NEW: sent by the frontend (Idempotency-Key header) so a retry
    # or double-click returns the same match instead of creating a
    # duplicate. Null for matches created without a key.
    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        default=None,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # "-id" is a tie-breaker so "latest match" is never ambiguous.
        ordering = ["-created_at", "-id"]
        constraints = [
            # NULL keys are treated as distinct by PostgreSQL and
            # SQLite, so matches without a key never conflict.
            models.UniqueConstraint(
                fields=["draft", "idempotency_key"],
                name="unique_match_idempotency_key_per_draft",
            ),
            _check_constraint(
                Q(winner_number__isnull=True)
                | Q(winner_number__in=[0, 1, 2]),
                "match_winner_number_valid",
            ),
        ]

    def __str__(self):
        return (
            f"Match {self.id} (Draft {self.draft_id}): "
            f"{self.player1_score}-{self.player2_score}"
        )


class MatchEvent(models.Model):
    match = models.ForeignKey(
        MatchResult,
        on_delete=models.CASCADE,
        related_name="events",
    )

    event_number = models.PositiveSmallIntegerField()

    minute = models.PositiveSmallIntegerField()

    # 1 or 2 for a team. 0 means a neutral event
    # (kick-off, half-time, full-time).
    team_number = models.PositiveSmallIntegerField()

    # CHANGED: now nullable, for team-level events such as corners.
    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="match_events",
    )

    # NEW: the second player involved, e.g. the assist provider on
    # a goal or the fouled player on a foul.
    secondary_player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="secondary_match_events",
    )

    event_type = models.CharField(
        max_length=20,
        default="GOAL",
    )

    commentary = models.CharField(max_length=255)

    class Meta:
        ordering = ["minute", "event_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["match", "event_number"],
                name="unique_match_event_number",
            ),
            _check_constraint(
                Q(team_number__in=[0, 1, 2]),
                "match_event_team_number_valid",
            ),
        ]

    def __str__(self):
        who = self.player.name if self.player_id else "Team"
        return (
            f"{self.minute}' - {self.event_type} - {who} "
            f"(Team {self.team_number})"
        )


class TeamMatchStatistics(models.Model):
    """Two rows per new match: one for Team 1 and one for Team 2."""

    match = models.ForeignKey(
        MatchResult,
        on_delete=models.CASCADE,
        related_name="team_statistics",
    )

    team_number = models.PositiveSmallIntegerField()

    # Both teams' possession values must add up to 100. A single-row
    # database constraint cannot check that, so the simulation
    # guarantees it when it builds the statistics.
    possession = models.PositiveSmallIntegerField(default=50)

    shots = models.PositiveSmallIntegerField(default=0)

    shots_on_target = models.PositiveSmallIntegerField(default=0)

    goals = models.PositiveSmallIntegerField(default=0)

    fouls = models.PositiveSmallIntegerField(default=0)

    corners = models.PositiveSmallIntegerField(default=0)

    yellow_cards = models.PositiveSmallIntegerField(default=0)

    red_cards = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["team_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["match", "team_number"],
                name="unique_team_statistics_per_match",
            ),
            _check_constraint(
                Q(team_number__in=[1, 2]),
                "team_stats_team_number_valid",
            ),
            _check_constraint(
                Q(possession__gte=0) & Q(possession__lte=100),
                "team_stats_possession_range",
            ),
            _check_constraint(
                Q(shots_on_target__lte=F("shots")),
                "team_stats_sot_lte_shots",
            ),
            _check_constraint(
                Q(goals__lte=F("shots_on_target")),
                "team_stats_goals_lte_sot",
            ),
        ]

    def __str__(self):
        return f"Match {self.match_id} - Team {self.team_number} stats"


class PlayerMatchRating(models.Model):
    """
    One row per player per match (22 rows for each new match).
    These are match-specific, so nothing is stored on players.Player.
    """

    match = models.ForeignKey(
        MatchResult,
        on_delete=models.CASCADE,
        related_name="player_ratings",
    )

    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        related_name="match_ratings",
    )

    team_number = models.PositiveSmallIntegerField()

    # 1.0 to 10.0, one decimal place.
    rating = models.DecimalField(max_digits=3, decimal_places=1)

    goals = models.PositiveSmallIntegerField(default=0)

    assists = models.PositiveSmallIntegerField(default=0)

    shots = models.PositiveSmallIntegerField(default=0)

    shots_on_target = models.PositiveSmallIntegerField(default=0)

    saves = models.PositiveSmallIntegerField(default=0)

    tackles = models.PositiveSmallIntegerField(default=0)

    interceptions = models.PositiveSmallIntegerField(default=0)

    yellow_cards = models.PositiveSmallIntegerField(default=0)

    red_cards = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["team_number", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["match", "player"],
                name="unique_player_rating_per_match",
            ),
            _check_constraint(
                Q(team_number__in=[1, 2]),
                "player_rating_team_number_valid",
            ),
            _check_constraint(
                Q(rating__gte=Decimal("1.0"))
                & Q(rating__lte=Decimal("10.0")),
                "player_rating_range",
            ),
            _check_constraint(
                Q(shots_on_target__lte=F("shots")),
                "player_rating_sot_lte_shots",
            ),
        ]

    def __str__(self):
        return (
            f"Match {self.match_id} - {self.player.name}: "
            f"{self.rating}"
        )