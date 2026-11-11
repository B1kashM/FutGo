from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Player(models.Model):
    POSITION_CHOICES = [
        ("GK", "Goalkeeper"),
        ("RB", "Right Back"),
        ("RCB", "Right Centre Back"),
        ("LCB", "Left Centre Back"),
        ("LB", "Left Back"),
        ("DMF", "Defensive Midfielder"),
        ("CMF", "Central Midfielder"),
        ("AMF", "Attacking Midfielder"),
        ("RWF", "Right Wing Forward"),
        ("ST", "Striker"),
        ("LWF", "Left Wing Forward"),
    ]

    CATEGORY_CHOICES = [
        ("LEGENDS", "All-Time Legends"),
        ("PREMIER_LEAGUE", "Premier League"),
        ("LA_LIGA", "La Liga"),
        ("YOUNG_TALENTS", "Young Talents"),
        ('TOP_5_LEAGUES', 'Top 5 Leagues'),
        ('ISL', 'ISL'),
    ]

    name = models.CharField(max_length=150)
    club = models.CharField(max_length=150, blank=True)
    country = models.CharField(max_length=100, blank=True)
    position = models.CharField(
        max_length=3,
        choices=POSITION_CHOICES,
    )
    ovr_rating = models.PositiveSmallIntegerField(default=0)
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
    )
    image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


# The 10 stats used on every card (same for all players, goalkeepers included).
STAT_FIELDS = [
    "finishing",
    "dribbling",
    "ball_control",
    "passing",
    "speed",
    "stamina",
    "physical",
    "defending",
    "heading",
    "goalkeeping",
]


def _stat(help_text):
    return models.PositiveSmallIntegerField(
        default=50,
        validators=[MinValueValidator(1), MaxValueValidator(99)],
        help_text=help_text,
    )


class PlayerStats(models.Model):
    """Card-battle stats for one player (1-99 each)."""

    player = models.OneToOneField(
        Player,
        on_delete=models.CASCADE,
        related_name="card_stats",
    )

    finishing = _stat("Composure and accuracy in front of goal")
    dribbling = _stat("Close control while running at defenders")
    ball_control = _stat("First touch and ball handling")
    passing = _stat("Average of low and lofted passing")
    speed = _stat("Top speed and acceleration")
    stamina = _stat("Work rate over a full match")
    physical = _stat("Strength, balance and physical contact")
    defending = _stat("Defensive awareness and tackling")
    heading = _stat("Aerial ability")
    goalkeeping = _stat("Average of the goalkeeper stats")

    is_custom = models.BooleanField(
        default=False,
        help_text="Tick if hand-tuned. The generator will never overwrite it.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Player stats"

    def as_dict(self):
        return {field: getattr(self, field) for field in STAT_FIELDS}

    def __str__(self):
        return f"Stats for {self.player.name}"