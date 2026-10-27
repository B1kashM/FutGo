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
        ("TOP_5_LEAGUES", "Top 5 Leagues"),
    ]

    name = models.CharField(max_length=150)
    club = models.CharField(max_length=150, blank=True)
    country = models.CharField(max_length=100, blank=True)
    position = models.CharField(
        max_length=3,
        choices=POSITION_CHOICES,
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
    )
    image_url = models.URLField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name