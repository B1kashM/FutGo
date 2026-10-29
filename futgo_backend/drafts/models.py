import secrets
import string
from decimal import Decimal

import django
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q


def generate_room_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def _check_constraint(condition, name):
    """
    Django 5.1 renamed CheckConstraint(check=...) to
    CheckConstraint(condition=...). Support both versions.
    """
    if django.VERSION >= (5, 1):
        return models.CheckConstraint(condition=condition, name=name)
    return models.CheckConstraint(check=condition, name=name)


class Team(models.Model):
    """A selectable football club representing a draft squad."""

    name = models.CharField(max_length=100, unique=True)
    short_name = models.CharField(max_length=10, unique=True)
    logo_url = models.URLField(max_length=500, blank=True, default="")
    primary_color = models.CharField(max_length=7, default="#1F6CFF")
    secondary_color = models.CharField(max_length=7, default="#FFFFFF")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


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

    mode = models.CharField(max_length=10, choices=MODE_CHOICES)

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

    player2_name = models.CharField(max_length=50, blank=True, default="")

    player1_team = models.ForeignKey(
        Team,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="player1_drafts",
    )

    player2_team = models.ForeignKey(
        Team,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="player2_drafts",
    )

    active_player_number = models.PositiveSmallIntegerField(default=1)

    status = models.CharField(
        max_length=10,
        choices=STATUS_CHOICES,
        default="WAITING",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            _check_constraint(
                Q(player1_team__isnull=True)
                | Q(player2_team__isnull=True)
                | ~Q(player1_team=F("player2_team")),
                "draft_teams_must_be_different",
            ),
        ]

    def clean(self):
        super().clean()

        if (
            self.player1_team_id is not None
            and self.player1_team_id == self.player2_team_id
        ):
            raise ValidationError({
                "player2_team": (
                    "Each player must choose a different football club."
                )
            })

    def save(self, *args, **kwargs):
        if (
            self.player1_team_id is not None
            and self.player1_team_id == self.player2_team_id
        ):
            raise ValidationError(
                "Each player must choose a different football club."
            )

        return super().save(*args, **kwargs)

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

    seat_number = models.PositiveSmallIntegerField(null=True, blank=True)

    display_name = models.CharField(max_length=50, blank=True, default="")

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
    A simulated match. Rematches reuse the squads and club identities
    belonging to the related Draft.
    """

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

    man_of_the_match = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="man_of_the_match_awards",
    )

    idempotency_key = models.CharField(
        max_length=64,
        null=True,
        blank=True,
        default=None,
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        constraints = [
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

    @property
    def player1_team(self):
        return self.draft.player1_team

    @property
    def player2_team(self):
        return self.draft.player2_team

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

    # 1 or 2 for a team. 0 means a neutral event.
    team_number = models.PositiveSmallIntegerField()

    player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="match_events",
    )

    secondary_player = models.ForeignKey(
        "players.Player",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="secondary_match_events",
    )

    event_type = models.CharField(max_length=20, default="GOAL")
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
    """Two rows per match: one for each team."""

    match = models.ForeignKey(
        MatchResult,
        on_delete=models.CASCADE,
        related_name="team_statistics",
    )

    team_number = models.PositiveSmallIntegerField()
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
    One row per player per match. Ratings remain match-specific and are
    not written to the players.Player model.
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