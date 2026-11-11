import random

from django.core.management.base import BaseCommand

from players.models import STAT_FIELDS, Player, PlayerStats

# How far each stat sits above/below the player's OVR, by position.
# (goalkeeping is handled separately below)
OFFSETS = {
    "ST":  {"finishing": 4,   "dribbling": 0,   "ball_control": 1,  "passing": -8,  "speed": 0,   "stamina": -6, "physical": 0,   "defending": -35, "heading": 0},
    "LWF": {"finishing": 0,   "dribbling": 4,   "ball_control": 2,  "passing": -3,  "speed": 4,   "stamina": -3, "physical": -8,  "defending": -32, "heading": -14},
    "RWF": {"finishing": 0,   "dribbling": 4,   "ball_control": 2,  "passing": -3,  "speed": 4,   "stamina": -3, "physical": -8,  "defending": -32, "heading": -14},
    "AMF": {"finishing": -3,  "dribbling": 3,   "ball_control": 3,  "passing": 4,   "speed": -4,  "stamina": -5, "physical": -12, "defending": -25, "heading": -16},
    "CMF": {"finishing": -10, "dribbling": -2,  "ball_control": 2,  "passing": 4,   "speed": -8,  "stamina": 3,  "physical": -4,  "defending": -8,  "heading": -10},
    "DMF": {"finishing": -22, "dribbling": -10, "ball_control": -3, "passing": 1,   "speed": -10, "stamina": 4,  "physical": 2,   "defending": 4,   "heading": -2},
    "RB":  {"finishing": -28, "dribbling": -8,  "ball_control": -6, "passing": -4,  "speed": 0,   "stamina": 3,  "physical": -2,  "defending": 3,   "heading": -8},
    "LB":  {"finishing": -28, "dribbling": -8,  "ball_control": -6, "passing": -4,  "speed": 0,   "stamina": 3,  "physical": -2,  "defending": 3,   "heading": -8},
    "RCB": {"finishing": -38, "dribbling": -22, "ball_control": -14, "passing": -10, "speed": -12, "stamina": -4, "physical": 4,   "defending": 6,   "heading": 6},
    "LCB": {"finishing": -38, "dribbling": -22, "ball_control": -14, "passing": -10, "speed": -12, "stamina": -4, "physical": 4,   "defending": 6,   "heading": 6},
}


def clamp(value, low=15, high=99):
    return max(low, min(high, int(round(value))))


def build_stats(player):
    """Same player always gets the same numbers (seeded by id + name)."""
    rng = random.Random(f"futgo-card-stats-{player.pk}-{player.name}")
    ovr = player.ovr_rating or 60

    if player.position == "GK":
        return {
            "finishing": rng.randint(15, 30),
            "dribbling": rng.randint(30, 45),
            "ball_control": rng.randint(40, 55),
            "passing": rng.randint(45, 65),
            "speed": rng.randint(40, 55),
            "stamina": rng.randint(55, 70),
            "physical": clamp(ovr - 20 + rng.randint(-3, 3)),
            "defending": rng.randint(25, 40),
            "heading": rng.randint(30, 45),
            "goalkeeping": clamp(ovr + rng.randint(-2, 3)),
        }

    offsets = OFFSETS.get(player.position, OFFSETS["CMF"])
    stats = {}
    for field in STAT_FIELDS:
        if field == "goalkeeping":
            stats[field] = rng.randint(12, 30)
        else:
            stats[field] = clamp(ovr + offsets[field] + rng.randint(-3, 3))
    return stats


class Command(BaseCommand):
    help = "Create card stats for every player that does not have them yet."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Also regenerate players that already have stats (hand-tuned ones are never touched).",
        )

    def handle(self, *args, **options):
        force = options["force"]
        existing = {s.player_id: s for s in PlayerStats.objects.all()}

        to_create, to_update = [], []
        for player in Player.objects.all().iterator():
            stats = build_stats(player)
            current = existing.get(player.pk)
            if current is None:
                to_create.append(PlayerStats(player=player, **stats))
            elif force and not current.is_custom:
                for field, value in stats.items():
                    setattr(current, field, value)
                to_update.append(current)

        if to_create:
            PlayerStats.objects.bulk_create(to_create, batch_size=200)
        if to_update:
            PlayerStats.objects.bulk_update(to_update, STAT_FIELDS, batch_size=200)

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(to_create)} stat rows, updated {len(to_update)}."
            )
        )