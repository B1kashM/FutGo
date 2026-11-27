import random
import secrets

from django.db.models import Count, Max

from players.models import STAT_FIELDS, Player

from .models import CardGame, CardPlay, CardPlayer, GameCard

ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
ALLOWED_PLAYER_COUNTS = (2, 3, 4, 5, 6)
ALLOWED_DECK_SIZES = (10, 15, 20)  # cards PER PLAYER, same for everyone
DEFAULT_DECK_SIZE = 15
VALID_CATEGORIES = {key for key, _ in Player.CATEGORY_CHOICES}

# Tiers are worked out from the average of a card's stats.
# Tune these two numbers to change how many cards land in each tier.
TIER_GOLD_MIN = 85
TIER_SILVER_MIN = 72
TIERS = ("GOLD", "SILVER", "BRONZE")


class CardGameError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# ---------------------------------------------------------------- helpers

def _generate_room_code():
    while True:
        code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(6))
        if not CardGame.objects.filter(room_code=code).exists():
            return code


def _new_token():
    return secrets.token_urlsafe(24)


def _clean_name(value, fallback):
    return str(value or "").strip()[:50] or fallback


def _unique_name(game, name):
    """Two players in one room never share the same display name."""
    taken = {n.lower() for n in game.seats.values_list("name", flat=True)}
    candidate, i = name, 2
    while candidate.lower() in taken:
        suffix = f" {i}"
        candidate = name[: 50 - len(suffix)] + suffix
        i += 1
    return candidate


def _touch(game):
    game.version += 1
    game.save()


def _counts(game):
    """Cards per owner. Key 0 is the pot, keys 1..max_players are the seats."""
    counts = {seat: 0 for seat in range(0, game.max_players + 1)}
    rows = game.cards.values("owner").annotate(n=Count("id")).order_by()
    for row in rows:
        counts[row["owner"]] = row["n"]
    return counts


def _top_card(game, seat):
    return (
        game.cards.filter(owner=seat)
        .select_related("player", "player__card_stats")
        .order_by("order")
        .first()
    )


def _move_to_bottom(game, cards, owner):
    if not cards:
        return
    highest = game.cards.filter(owner=owner).aggregate(m=Max("order"))["m"]
    base = 0 if highest is None else highest + 1
    for i, gc in enumerate(cards):
        gc.owner = owner
        gc.order = base + i
    GameCard.objects.bulk_update(cards, ["owner", "order"])


def _active_seats(game):
    """Seats still in the game (not knocked out, not conceded), in seat order."""
    return list(game.seats.filter(eliminated=False).values_list("seat", flat=True))


def _tie_seats(game):
    return [int(x) for x in (game.tie_seats or "").split(",") if x.strip().isdigit()]


def _required_seats(game):
    """Seats that must show a card in the current clash.

    Clash 1: every player still in the game.
    Clash 2+ (a tie-break): only the players who tied.
    """
    if game.clash_number > 1:
        return _tie_seats(game)
    return _active_seats(game)


def _plays(game, clash=None):
    """Cards shown so far in the current clash."""
    return list(
        game.plays.filter(
            round_number=game.round_number, clash=clash or game.clash_number
        )
        .select_related("card__player__card_stats")
        .order_by("seat")
    )


def _played_seats(game):
    return set(
        game.plays.filter(
            round_number=game.round_number, clash=game.clash_number
        ).values_list("seat", flat=True)
    )


def _play(game, seat, card, stat=None):
    """Record that a seat played a card for the locked stat in this clash."""
    stat = stat or game.locked_stat
    value = getattr(card.player.card_stats, stat)
    return CardPlay.objects.create(
        game=game,
        round_number=game.round_number,
        clash=game.clash_number,
        seat=seat,
        card=card,
        value=value,
    )


def get_token(game, seat):
    """Token for a seat. Used by the views when they hand tokens to players."""
    row = game.seats.filter(seat=seat).first()
    return row.token if row else ""


def _add_seat(game, seat, name):
    token = _new_token()
    CardPlayer.objects.create(game=game, seat=seat, name=name, token=token)
    # Keep the old 2-player columns filled so older code that reads them still works.
    if seat == 1:
        game.player1_name, game.player1_token = name, token
    elif seat == 2:
        game.player2_name, game.player2_token = name, token
    return token


# ---------------------------------------------------------------- tiers

def tier_of(player):
    """GOLD / SILVER / BRONZE from the average of the card stats."""
    values = [
        v for v in player.card_stats.as_dict().values()
        if isinstance(v, (int, float)) and not isinstance(v, bool)
    ]
    average = sum(values) / len(values) if values else 0
    if average >= TIER_GOLD_MIN:
        return "GOLD"
    if average >= TIER_SILVER_MIN:
        return "SILVER"
    return "BRONZE"


def _used_tiers(game, seat):
    row = game.seats.filter(seat=seat).first()
    raw = row.used_tiers if row else ""
    return [t for t in (raw or "").split(",") if t in TIERS]


def _mark_tier_used(game, seat, tier):
    row = game.seats.get(seat=seat)
    used = [t for t in (row.used_tiers or "").split(",") if t in TIERS]
    if tier not in used:
        used.append(tier)
    row.used_tiers = ",".join(used)
    row.save(update_fields=["used_tiers"])


def _hand_payload(game, seat):
    """Card ids in a seat's hand, grouped by tier. No player details."""
    hand = {tier: [] for tier in TIERS}
    cards = game.cards.filter(owner=seat).select_related("player", "player__card_stats")
    for gc in cards:
        hand[tier_of(gc.player)].append(gc.id)
    # Stable pseudo-shuffle so the id order does not reveal the deck order.
    for ids in hand.values():
        ids.sort(key=lambda i: (i * 2654435761) % 1000003)
    return hand


def _hand_preview(game, seat):
    """Deal preview: image, name and tier for each card in a seat's hand.

    No stats. Only used for the round 1 deal screen, so the identity of
    the face-down album cards is not sent on every poll.
    """
    cards = game.cards.filter(owner=seat).select_related("player", "player__card_stats")
    previews = [
        {
            "id": gc.id,
            "name": gc.player.name,
            "image": gc.player.image_url or None,
            "tier": tier_of(gc.player),
        }
        for gc in cards
    ]
    order = {tier: i for i, tier in enumerate(TIERS)}
    previews.sort(key=lambda c: (order[c["tier"]], c["name"]))
    return previews


# ---------------------------------------------------------------- card pool

def eligible_players(category=""):
    """Players that have stats and an image, one per unique name."""
    qs = Player.objects.filter(card_stats__isnull=False).exclude(image_url="")
    if category:
        qs = qs.filter(category=category)
    unique = {}
    for p in qs.order_by("id").select_related("card_stats"):
        unique.setdefault(p.name.strip().lower(), p)
    return list(unique.values())


def pool_summary():
    rows = (
        Player.objects.filter(card_stats__isnull=False)
        .exclude(image_url="")
        .values_list("name", "category")
    )
    all_names = set()
    per_category = {key: set() for key, _ in Player.CATEGORY_CHOICES}
    for name, category in rows:
        key = name.strip().lower()
        all_names.add(key)
        per_category.setdefault(category, set()).add(key)

    pools = [{"key": "ALL", "label": "All players", "count": len(all_names)}]
    for key, label in Player.CATEGORY_CHOICES:
        pools.append({"key": key, "label": label, "count": len(per_category.get(key, ()))})
    return pools


# ---------------------------------------------------------------- dealing

def _deal_cards(game):
    """Deal deck_size cards to every seat, with similar total rating per seat."""
    n = game.max_players
    pool = eligible_players(game.category)
    needed = game.deck_size * n
    if len(pool) < needed:
        raise CardGameError(
            f"Only {len(pool)} cards are available in this pool but {needed} are needed. "
            "Pick a bigger pool or a smaller deck size."
        )

    chosen = random.sample(pool, needed)
    chosen.sort(key=lambda p: p.ovr_rating, reverse=True)  # stable: ties stay random

    # Snake deal (1-2-3-4-4-3-2-1 ...) so every deck has a similar total rating.
    # The seat order is shuffled first so no seat always gets the best card.
    seat_order = list(range(1, n + 1))
    random.shuffle(seat_order)
    piles = {seat: [] for seat in seat_order}
    for i, player in enumerate(chosen):
        lap, pos = divmod(i, n)
        index = pos if lap % 2 == 0 else n - 1 - pos
        piles[seat_order[index]].append(player)

    cards = []
    for seat, players in piles.items():
        random.shuffle(players)
        for order, player in enumerate(players):
            cards.append(GameCard(game=game, player=player, owner=seat, order=order))
    GameCard.objects.bulk_create(cards)


def _start_game(game):
    _deal_cards(game)
    seats = list(game.seats.values_list("seat", flat=True))
    game.status = "ACTIVE"
    game.phase = "CHOOSING"
    # KICKOFF DRAW: the server picks the first stat locker at random.
    # Every seat has the same chance and nobody (host included) can change it.
    game.challenger_seat = secrets.choice(seats)
    game.round_number = 1
    game.clash_number = 1
    game.tie_seats = ""
    game.clash_winner_seat = None
    game.winner_seat = None
    game.locked_stat = ""
    game.card_swapped = False
    game.seats.update(used_tiers="", eliminated=False)
    _touch(game)


# ---------------------------------------------------------------- game setup

def create_game(mode, player1_name, player2_name, category, deck_size, max_players=2):
    mode = str(mode or "LOCAL").upper()
    if mode not in ("LOCAL", "ONLINE"):
        raise CardGameError("mode must be LOCAL or ONLINE.")

    p1 = _clean_name(player1_name, "")
    if not p1:
        raise CardGameError("Player 1 name is required.")
    p2 = _clean_name(player2_name, "Player 2") if mode == "LOCAL" else ""

    category = str(category or "").upper()
    if category in ("", "ALL"):
        category = ""
    elif category not in VALID_CATEGORIES:
        raise CardGameError("Unknown category.")

    try:
        deck_size = int(deck_size or DEFAULT_DECK_SIZE)
    except (TypeError, ValueError):
        raise CardGameError("deck_size must be a number.")
    if deck_size not in ALLOWED_DECK_SIZES:
        options = ", ".join(str(d) for d in ALLOWED_DECK_SIZES)
        raise CardGameError(f"deck_size must be one of: {options}.")

    if mode == "LOCAL":
        max_players = 2
    else:
        try:
            max_players = int(max_players or 2)
        except (TypeError, ValueError):
            raise CardGameError("max_players must be a number.")
        if max_players not in ALLOWED_PLAYER_COUNTS:
            options = ", ".join(str(c) for c in ALLOWED_PLAYER_COUNTS)
            raise CardGameError(f"max_players must be one of: {options}.")

    game = CardGame.objects.create(
        room_code=_generate_room_code(),
        mode=mode,
        status="WAITING",
        category=category,
        deck_size=deck_size,
        max_players=max_players,
    )
    _add_seat(game, 1, p1)
    if mode == "LOCAL":
        _add_seat(game, 2, _unique_name(game, p2))
        _start_game(game)
    else:
        game.save()
    return game


def join_game(room_code, player_name):
    """Add the next free seat. The game starts when the last seat is taken.

    The new player's seat and token are put on the returned game object as
    game.joined_seat and game.joined_token.
    """
    try:
        game = CardGame.objects.select_for_update().get(room_code=str(room_code).upper())
    except CardGame.DoesNotExist:
        raise CardGameError("Game not found.", 404)

    if game.mode != "ONLINE" or game.status != "WAITING":
        raise CardGameError("This game is not open for joining.", 409)

    name = _clean_name(player_name, "")
    if not name:
        raise CardGameError("Your name is required.")

    taken = game.seats.count()
    if taken >= game.max_players:
        raise CardGameError("This room is full.", 409)

    seat = taken + 1
    token = _add_seat(game, seat, _unique_name(game, name))
    game.joined_seat = seat
    game.joined_token = token

    if seat == game.max_players:
        _start_game(game)
    else:
        _touch(game)
    return game


def load_game(room_code, token, lock=False):
    """Find the game and work out which seat the token belongs to."""
    qs = CardGame.objects.select_for_update() if lock else CardGame.objects
    try:
        game = qs.get(room_code=str(room_code).upper())
    except CardGame.DoesNotExist:
        raise CardGameError("Game not found.", 404)

    seat = None
    given = str(token or "").encode()
    if given:
        for row in game.seats.all():
            if row.token and secrets.compare_digest(given, row.token.encode()):
                seat = row.seat
    if seat is None:
        raise CardGameError("Invalid or missing seat token.", 403)
    return game, seat


# ---------------------------------------------------------------- actions

def lock_stat(game, seat, stat):
    """The challenger locks a stat. Their own top card is played automatically."""
    if game.status != "ACTIVE" or game.phase != "CHOOSING":
        raise CardGameError("You can't lock a stat right now.", 409)
    if seat != game.challenger_seat:
        raise CardGameError("Only the challenger can lock a stat.", 403)
    if stat not in STAT_FIELDS:
        raise CardGameError("Unknown stat.")

    top = _top_card(game, seat)
    if top is None:
        raise CardGameError("You have no cards left.", 409)

    game.locked_stat = stat
    _play(game, seat, top, stat)
    game.phase = "LOCKED"
    _touch(game)


def choose_card(game, seat, card_id):
    """Challenger swaps their current card for a face-down card from their hand.

    Allowed once per round, and each tier can be used once per game. The
    chosen card becomes the challenger's top card, so it is shown to them
    and they then lock a stat as usual.
    """
    if game.status != "ACTIVE" or game.phase != "CHOOSING":
        raise CardGameError("You can't change your card right now.", 409)
    if seat != game.challenger_seat:
        raise CardGameError("Only the challenger can change their card.", 403)
    if game.card_swapped:
        raise CardGameError("You already changed your card this round.", 409)

    try:
        card_id = int(card_id)
    except (TypeError, ValueError):
        raise CardGameError("card_id must be a number.")

    chosen = (
        game.cards.filter(id=card_id, owner=seat)
        .select_related("player", "player__card_stats")
        .first()
    )
    if chosen is None:
        raise CardGameError("That card is not in your hand.")

    top = _top_card(game, seat)
    if top is None:
        raise CardGameError("You have no cards left.", 409)
    if chosen.id == top.id:
        raise CardGameError("That is already your current card.")

    tier = tier_of(chosen.player)
    if tier in _used_tiers(game, seat):
        raise CardGameError(f"You already used your {tier.title()} pick this game.", 409)
    _mark_tier_used(game, seat, tier)

    top.order, chosen.order = chosen.order, top.order
    GameCard.objects.bulk_update([top, chosen], ["order"])
    game.card_swapped = True
    _touch(game)


def _resolve_if_ready(game):
    """When every required seat has shown a card, work out the clash result."""
    required = set(_required_seats(game))
    plays = _plays(game)
    if not required.issubset({p.seat for p in plays}):
        return False

    best = max(p.value for p in plays)
    leaders = sorted(p.seat for p in plays if p.value == best)
    if len(leaders) == 1:
        game.clash_winner_seat = leaders[0]
        game.tie_seats = ""
    else:
        game.clash_winner_seat = 0  # tie
        game.tie_seats = ",".join(str(s) for s in leaders)
    game.phase = "REVEALED"
    return True


def reveal(game, seat, card_id=None):
    """A responder shows a card for the locked stat.

    Without card_id the top card is played. With card_id the responder plays
    that card from their hand, which uses up that tier's pick for the game
    (unless it happens to be the top card anyway).

    Cards stay hidden from everyone until every required player has revealed,
    then they all flip at once.
    """
    if game.status != "ACTIVE" or game.phase != "LOCKED":
        raise CardGameError("There is nothing to reveal right now.", 409)
    if seat == game.challenger_seat:
        raise CardGameError("Your card is played automatically.", 403)
    if seat not in _required_seats(game):
        raise CardGameError("You are not part of this clash.", 403)
    if seat in _played_seats(game):
        raise CardGameError("You already revealed your card.", 409)

    top = _top_card(game, seat)
    if top is None:
        raise CardGameError("You have no cards left.", 409)

    card = top
    if card_id is not None:
        try:
            card_id = int(card_id)
        except (TypeError, ValueError):
            raise CardGameError("card_id must be a number.")

        chosen = (
            game.cards.filter(id=card_id, owner=seat)
            .select_related("player", "player__card_stats")
            .first()
        )
        if chosen is None:
            raise CardGameError("That card is not in your hand.")

        if chosen.id != top.id:
            tier = tier_of(chosen.player)
            if tier in _used_tiers(game, seat):
                raise CardGameError(
                    f"You already used your {tier.title()} pick this game.", 409
                )
            _mark_tier_used(game, seat, tier)
            card = chosen

    _play(game, seat, card)
    _resolve_if_ready(game)
    _touch(game)


def _award_pot(game, seat):
    """The round winner takes every card on the table and locks next."""
    pot = list(game.cards.filter(owner=0).order_by("order"))
    _move_to_bottom(game, pot, seat)
    game.challenger_seat = seat
    game.clash_winner_seat = seat


def _return_round_cards(game):
    """Cards on the table go back to the players who played them."""
    pot_ids = set(game.cards.filter(owner=0).values_list("id", flat=True))
    if not pot_ids:
        return
    by_seat = {}
    plays = game.plays.filter(round_number=game.round_number).select_related("card")
    for p in plays:
        if p.card_id in pot_ids:
            by_seat.setdefault(p.seat, []).append(p.card)
    for seat, cards in by_seat.items():
        _move_to_bottom(game, cards, seat)


def _advance(game):
    """Knock out empty-handed players, then finish the game or start the next round."""
    counts = _counts(game)
    seats = list(game.seats.values_list("seat", flat=True))
    alive = [s for s in seats if counts.get(s, 0) > 0]
    game.seats.exclude(seat__in=alive).update(eliminated=True)

    if len(alive) <= 1:
        game.status = "FINISHED"
        game.end_reason = "NO_CARDS"
        game.winner_seat = alive[0] if alive else None
    else:
        if game.challenger_seat not in alive:
            game.challenger_seat = alive[0]
        game.phase = "CHOOSING"
        game.locked_stat = ""
        game.card_swapped = False
        game.clash_number = 1
        game.tie_seats = ""
        game.clash_winner_seat = None
        game.round_number += 1
    _touch(game)


def continue_round(game):
    """Move the cards and start the next clash or round. Safe to call twice."""
    if game.status != "ACTIVE" or game.phase != "REVEALED":
        return

    # Every card shown in this clash goes to the table (the pot).
    plays = _plays(game)
    _move_to_bottom(game, [p.card for p in plays], 0)

    winner = game.clash_winner_seat
    if winner:  # one clear winner takes the whole pot
        _award_pot(game, winner)
        _advance(game)
        return

    # Tie: only the tied players who still have a card play on for the same stat.
    counts = _counts(game)
    contenders = [s for s in _tie_seats(game) if counts.get(s, 0) > 0]

    if len(contenders) >= 2:
        game.tie_seats = ",".join(str(s) for s in contenders)
        game.clash_number += 1
        game.clash_winner_seat = None
        game.phase = "LOCKED"
        # The challenger has nothing to choose, so their next card is played for them.
        if game.challenger_seat in contenders:
            _play(game, game.challenger_seat, _top_card(game, game.challenger_seat))
        _touch(game)
        return

    if len(contenders) == 1:  # everyone else in the tie ran out of cards
        _award_pot(game, contenders[0])
    else:  # nobody can play on: everyone gets their own cards back
        _return_round_cards(game)
    _advance(game)


def concede(game, seat):
    """A player leaves the game.

    With two players left the other player wins. With more, the leaver's cards
    are shared out between the rest, the table cards go back to their owners
    and the current round restarts.
    """
    if game.status != "ACTIVE":
        raise CardGameError("The game is not in progress.", 409)
    row = game.seats.filter(seat=seat).first()
    if row is None or row.eliminated:
        raise CardGameError("You are already out of this game.", 409)

    _return_round_cards(game)
    game.plays.filter(round_number=game.round_number).delete()

    row.eliminated = True
    row.save(update_fields=["eliminated"])
    remaining = _active_seats(game)

    if remaining:
        cards = list(game.cards.filter(owner=seat).order_by("order"))
        groups = {s: [] for s in remaining}
        for i, gc in enumerate(cards):
            groups[remaining[i % len(remaining)]].append(gc)
        for s, group in groups.items():
            _move_to_bottom(game, group, s)

    game.clash_winner_seat = None
    if len(remaining) <= 1:
        game.status = "FINISHED"
        game.end_reason = "CONCEDED"
        game.winner_seat = remaining[0] if remaining else None
    else:
        if game.challenger_seat == seat:
            game.challenger_seat = next((s for s in remaining if s > seat), remaining[0])
        game.phase = "CHOOSING"
        game.locked_stat = ""
        game.card_swapped = False
        game.clash_number = 1
        game.tie_seats = ""
    _touch(game)


# ---------------------------------------------------------------- state for the client

def _card_payload(gc):
    p = gc.player
    return {
        "player_id": p.id,
        "name": p.name,
        "club": p.club,
        "country": p.country,
        "position": p.position,
        "ovr_rating": p.ovr_rating,
        "category": p.category,
        "image_url": p.image_url,
        "tier": tier_of(p),
        "stats": p.card_stats.as_dict(),
    }


def _available_action(game, seat, required, played, out):
    if game.status == "WAITING":
        return "wait_for_opponent"
    if game.status == "FINISHED":
        return None
    if seat in out:
        return "eliminated"
    is_challenger = seat == game.challenger_seat
    if game.phase == "CHOOSING":
        return "lock_stat" if is_challenger else "wait_for_challenger"
    if game.phase == "LOCKED":
        if is_challenger or seat not in required or seat in played:
            return "wait_for_reveal"
        return "reveal"
    return "continue"


def _table_payload(game, names):
    """Everything shown on the table this round, clash by clash (after the flip)."""
    rows = (
        game.plays.filter(round_number=game.round_number)
        .select_related("card__player__card_stats")
        .order_by("clash", "seat")
    )
    clashes = {}
    for p in rows:
        clashes.setdefault(p.clash, []).append(
            {
                "seat": p.seat,
                "name": names.get(p.seat, ""),
                "player": p.card.player.name,
                "value": p.value,
                "card": _card_payload(p.card),
            }
        )
    table = []
    for number in sorted(clashes):
        is_current = number == game.clash_number
        tied = (not is_current) or game.clash_winner_seat == 0
        table.append(
            {
                "clash": number,
                "outcome": "tie" if tied else "winner",
                "winner_seat": game.clash_winner_seat if (is_current and not tied) else None,
                "plays": sorted(clashes[number], key=lambda e: -e["value"]),
            }
        )
    return table


def build_state(game, seat):
    rows = list(game.seats.all())
    names = {r.seat: r.name for r in rows}
    out = {r.seat for r in rows if r.eliminated}
    counts = _counts(game)
    active = game.status == "ACTIVE"
    is_challenger = active and seat == game.challenger_seat
    required = _required_seats(game) if active else []
    plays = _plays(game) if game.status in ("ACTIVE", "FINISHED") else []
    played = {p.seat: p for p in plays}
    opp = 2 if seat == 1 else 1
    locked_phase = active and game.phase == "LOCKED"

    players = [
        {
            "seat": r.seat,
            "name": r.name,
            "cards_left": counts.get(r.seat, 0),
            "is_you": r.seat == seat,
            "is_challenger": active and r.seat == game.challenger_seat,
            "eliminated": r.eliminated,
            "has_revealed": (r.seat in played) if locked_phase else None,
        }
        for r in rows
    ]

    state = {
        "room_code": game.room_code,
        "mode": game.mode,
        "status": game.status,
        "phase": game.phase,
        "version": game.version,
        "round_number": game.round_number,
        "clash_number": game.clash_number,
        "category": game.category or "ALL",
        "deck_size": game.deck_size,
        "max_players": game.max_players,
        "seats_filled": len(rows),
        "players": players,
        "you": {
            "seat": seat,
            "name": names.get(seat, ""),
            "cards_left": counts.get(seat, 0),
            "eliminated": seat in out,
        },
        # Kept for the 2-player screen. Empty for 4 and 6 player rooms.
        "opponent": (
            {"seat": opp, "name": names.get(opp, ""), "cards_left": counts.get(opp, 0)}
            if game.max_players == 2
            else None
        ),
        "pot_count": counts.get(0, 0),
        "challenger_seat": game.challenger_seat,
        "you_are_challenger": is_challenger,
        "first_locker": (
            {"seat": game.challenger_seat, "name": names.get(game.challenger_seat, "")}
            if active and game.round_number == 1 and game.phase == "CHOOSING"
            else None
        ),
        "locked_stat": game.locked_stat or None,
        "required_seats": required if locked_phase else [],
        "tie_seats": _tie_seats(game) if active and game.clash_number > 1 else [],
        "waiting_on": (
            [names.get(s, "") for s in required if s not in played] if locked_phase else []
        ),
        "available_action": _available_action(game, seat, required, played, out),
        "my_card": None,
        "opponent_card": None,
        "table": None,
        "hand": None,
        "hand_preview": None,
        "current_card_id": None,
        "opponent_card_tier": None,
        "card_swapped": game.card_swapped,
        "used_tiers": _used_tiers(game, seat),
        "last_round": None,
        "game_over": game.status == "FINISHED",
        "winner_seat": game.winner_seat,
        "winner_name": names.get(game.winner_seat) if game.winner_seat else None,
        "you_won": (game.winner_seat == seat) if game.winner_seat else None,
        "end_reason": game.end_reason or None,
    }

    if active and seat not in out:
        # Hidden-information rule: nobody sees a card before it is allowed.
        if game.phase in ("CHOOSING", "LOCKED"):
            in_clash = game.phase == "CHOOSING" or seat in required
            if is_challenger and in_clash:
                gc = _top_card(game, seat)
                state["my_card"] = _card_payload(gc) if gc else None
                state["current_card_id"] = gc.id if gc else None
            elif seat in played:
                # A responder who already revealed sees the card they chose.
                state["my_card"] = _card_payload(played[seat].card)
                state["current_card_id"] = played[seat].card_id

            # Your own hand, face down and grouped by tier. Used for the deal
            # preview, the challenger's card swap and the responder's pick.
            # It only holds ids and tiers, never who the players are.
            if game.phase == "CHOOSING" or (
                not is_challenger and seat in required and seat not in played
            ):
                state["hand"] = _hand_payload(game, seat)

            # Round 1 deal screen only: show your own deck face up.
            if game.phase == "CHOOSING" and game.round_number == 1:
                state["hand_preview"] = _hand_preview(game, seat)

            # Responders only, after a stat is locked: the challenger card's tier
            # (colours the Locked banner), never any card details.
            if game.phase == "LOCKED" and not is_challenger:
                theirs = played.get(game.challenger_seat)
                state["opponent_card_tier"] = (
                    tier_of(theirs.card.player) if theirs else None
                )
        elif game.phase == "REVEALED":
            mine = played.get(seat)
            state["my_card"] = _card_payload(mine.card) if mine else None
            if game.max_players == 2:
                theirs = played.get(opp)
                state["opponent_card"] = _card_payload(theirs.card) if theirs else None

    # After the flip, everyone (even knocked-out players) sees the whole table.
    if active and game.phase == "REVEALED":
        state["table"] = _table_payload(game, names)

    show_result = game.clash_winner_seat is not None and (
        (active and game.phase == "REVEALED")
        or (game.status == "FINISHED" and game.end_reason != "CONCEDED")
    )
    if show_result and plays:
        mine = played.get(seat)
        others = [p for p in plays if p.seat != seat]
        best_other = max(others, key=lambda p: p.value) if others else None
        winner_seat = game.clash_winner_seat
        state["last_round"] = {
            "number": game.round_number,
            "clash": game.clash_number,
            "stat": game.locked_stat,
            "your_value": mine.value if mine else None,
            "opponent_value": best_other.value if best_other else None,
            "your_player": mine.card.player.name if mine else None,
            "opponent_player": best_other.card.player.name if best_other else None,
            "winner": (
                "tie" if winner_seat == 0
                else "you" if winner_seat == seat
                else "opponent"
            ),
            "winner_seat": winner_seat or None,
            "winner_name": names.get(winner_seat) if winner_seat else None,
            "tied_seats": _tie_seats(game) if winner_seat == 0 else [],
            "results": [
                {
                    "seat": p.seat,
                    "name": names.get(p.seat, ""),
                    "player": p.card.player.name,
                    "value": p.value,
                }
                for p in sorted(plays, key=lambda p: -p.value)
            ],
        }
    return state