import random
import secrets

from django.db.models import Count, Max

from players.models import STAT_FIELDS, Player

from .models import CardGame, CardRound, GameCard

ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I
MIN_DECK_SIZE = 5
MAX_DECK_SIZE = 30
DEFAULT_DECK_SIZE = 20
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


def _touch(game):
    game.version += 1
    game.save()


def _counts(game):
    counts = {0: 0, 1: 0, 2: 0}
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
    highest = game.cards.filter(owner=owner).aggregate(m=Max("order"))["m"]
    base = 0 if highest is None else highest + 1
    for i, gc in enumerate(cards):
        gc.owner = owner
        gc.order = base + i
    GameCard.objects.bulk_update(cards, ["owner", "order"])


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
    raw = game.player1_used_tiers if seat == 1 else game.player2_used_tiers
    return [t for t in (raw or "").split(",") if t in TIERS]


def _mark_tier_used(game, seat, tier):
    used = _used_tiers(game, seat)
    if tier not in used:
        used.append(tier)
    value = ",".join(used)
    if seat == 1:
        game.player1_used_tiers = value
    else:
        game.player2_used_tiers = value


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
    pool = eligible_players(game.category)
    needed = game.deck_size * 2
    if len(pool) < needed:
        raise CardGameError(
            f"Only {len(pool)} cards are available in this pool but {needed} are needed. "
            "Pick a bigger pool or a smaller deck size."
        )

    chosen = random.sample(pool, needed)
    chosen.sort(key=lambda p: p.ovr_rating, reverse=True)  # stable: ties stay random

    # Snake deal (1-2-2-1) so both decks have a similar total rating.
    pattern = random.choice([(1, 2, 2, 1), (2, 1, 1, 2)])
    piles = {1: [], 2: []}
    for i, player in enumerate(chosen):
        piles[pattern[i % 4]].append(player)

    cards = []
    for seat, players in piles.items():
        random.shuffle(players)
        for order, player in enumerate(players):
            cards.append(GameCard(game=game, player=player, owner=seat, order=order))
    GameCard.objects.bulk_create(cards)


def _start_game(game):
    _deal_cards(game)
    game.status = "ACTIVE"
    game.phase = "CHOOSING"
    game.challenger_seat = 1
    game.round_number = 1
    game.locked_stat = ""
    game.player1_used_tiers = ""
    game.player2_used_tiers = ""
    game.card_swapped = False
    _touch(game)


# ---------------------------------------------------------------- game setup

def create_game(mode, player1_name, player2_name, category, deck_size):
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
    if not MIN_DECK_SIZE <= deck_size <= MAX_DECK_SIZE:
        raise CardGameError(f"deck_size must be between {MIN_DECK_SIZE} and {MAX_DECK_SIZE}.")

    game = CardGame.objects.create(
        room_code=_generate_room_code(),
        mode=mode,
        status="WAITING",
        player1_name=p1,
        player2_name=p2,
        player1_token=_new_token(),
        player2_token=_new_token() if mode == "LOCAL" else "",
        category=category,
        deck_size=deck_size,
    )
    if mode == "LOCAL":
        _start_game(game)
    return game


def join_game(room_code, player_name):
    try:
        game = CardGame.objects.select_for_update().get(room_code=str(room_code).upper())
    except CardGame.DoesNotExist:
        raise CardGameError("Game not found.", 404)

    if game.mode != "ONLINE" or game.status != "WAITING":
        raise CardGameError("This game is not open for joining.", 409)

    name = _clean_name(player_name, "")
    if not name:
        raise CardGameError("Your name is required.")

    game.player2_name = name
    game.player2_token = _new_token()
    _start_game(game)
    return game


def load_game(room_code, token, lock=False):
    """Find the game and work out which seat (1 or 2) the token belongs to."""
    qs = CardGame.objects.select_for_update() if lock else CardGame.objects
    try:
        game = qs.get(room_code=str(room_code).upper())
    except CardGame.DoesNotExist:
        raise CardGameError("Game not found.", 404)

    seat = None
    given = str(token or "").encode()
    if given:
        if game.player1_token and secrets.compare_digest(given, game.player1_token.encode()):
            seat = 1
        elif game.player2_token and secrets.compare_digest(given, game.player2_token.encode()):
            seat = 2
    if seat is None:
        raise CardGameError("Invalid or missing seat token.", 403)
    return game, seat


# ---------------------------------------------------------------- actions

def lock_stat(game, seat, stat):
    if game.status != "ACTIVE" or game.phase != "CHOOSING":
        raise CardGameError("You can't lock a stat right now.", 409)
    if seat != game.challenger_seat:
        raise CardGameError("Only the challenger can lock a stat.", 403)
    if stat not in STAT_FIELDS:
        raise CardGameError("Unknown stat.")

    game.locked_stat = stat
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


def reveal(game, seat, card_id=None):
    """The responder reveals a card.

    Without card_id the top card is played. With card_id the responder plays
    that card from their hand, which uses up that tier's pick for the game
    (unless it happens to be the top card anyway).
    """
    if game.status != "ACTIVE" or game.phase != "LOCKED":
        raise CardGameError("There is nothing to reveal right now.", 409)
    if seat == game.challenger_seat:
        raise CardGameError("The opponent reveals their card.", 403)

    c1, c2 = _top_card(game, 1), _top_card(game, 2)
    if not c1 or not c2:
        raise CardGameError("A player has no cards left.", 409)

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

        top = c1 if seat == 1 else c2
        if chosen.id != top.id:
            tier = tier_of(chosen.player)
            if tier in _used_tiers(game, seat):
                raise CardGameError(
                    f"You already used your {tier.title()} pick this game.", 409
                )
            _mark_tier_used(game, seat, tier)

        if seat == 1:
            c1 = chosen
        else:
            c2 = chosen

    stat = game.locked_stat
    v1 = getattr(c1.player.card_stats, stat)
    v2 = getattr(c2.player.card_stats, stat)
    winner = 1 if v1 > v2 else 2 if v2 > v1 else 0

    CardRound.objects.create(
        game=game,
        number=game.round_number,
        challenger_seat=game.challenger_seat,
        stat=stat,
        p1_player=c1.player,
        p2_player=c2.player,
        p1_value=v1,
        p2_value=v2,
        winner_seat=winner,
    )
    game.phase = "REVEALED"
    _touch(game)


def _round_card(game, rnd, seat):
    """The card a seat actually played in a round (not always the top card)."""
    player_id = rnd.p1_player_id if seat == 1 else rnd.p2_player_id
    card = None
    if player_id:
        card = (
            game.cards.filter(owner=seat, player_id=player_id)
            .select_related("player", "player__card_stats")
            .first()
        )
    return card or _top_card(game, seat)


def continue_round(game):
    """Move the cards and start the next round. Safe to call twice."""
    if game.status != "ACTIVE" or game.phase != "REVEALED":
        return

    rnd = game.rounds.get(number=game.round_number)
    c1, c2 = _round_card(game, rnd, 1), _round_card(game, rnd, 2)

    if rnd.winner_seat in (1, 2):
        pot = list(game.cards.filter(owner=0).order_by("order"))
        _move_to_bottom(game, [c1, c2] + pot, rnd.winner_seat)
        game.challenger_seat = rnd.winner_seat
    else:  # tie: both cards go to the pot, same challenger goes again
        _move_to_bottom(game, [c1, c2], 0)

    counts = _counts(game)
    if counts[1] == 0 or counts[2] == 0:
        game.status = "FINISHED"
        game.end_reason = "NO_CARDS"
        if counts[1] == 0 and counts[2] == 0:
            game.winner_seat = None
        else:
            game.winner_seat = 1 if counts[2] == 0 else 2
    else:
        game.phase = "CHOOSING"
        game.locked_stat = ""
        game.card_swapped = False
        game.round_number += 1
    _touch(game)


def concede(game, seat):
    if game.status != "ACTIVE":
        raise CardGameError("The game is not in progress.", 409)
    game.status = "FINISHED"
    game.end_reason = "CONCEDED"
    game.winner_seat = 2 if seat == 1 else 1
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


def _available_action(game, seat):
    if game.status == "WAITING":
        return "wait_for_opponent"
    if game.status == "FINISHED":
        return None
    is_challenger = seat == game.challenger_seat
    if game.phase == "CHOOSING":
        return "lock_stat" if is_challenger else "wait_for_challenger"
    if game.phase == "LOCKED":
        return "wait_for_reveal" if is_challenger else "reveal"
    return "continue"


def build_state(game, seat):
    opp = 2 if seat == 1 else 1
    names = {1: game.player1_name, 2: game.player2_name}
    counts = _counts(game)
    is_challenger = seat == game.challenger_seat

    state = {
        "room_code": game.room_code,
        "mode": game.mode,
        "status": game.status,
        "phase": game.phase,
        "version": game.version,
        "round_number": game.round_number,
        "category": game.category or "ALL",
        "deck_size": game.deck_size,
        "you": {"seat": seat, "name": names[seat], "cards_left": counts[seat]},
        "opponent": {"seat": opp, "name": names[opp], "cards_left": counts[opp]},
        "pot_count": counts[0],
        "challenger_seat": game.challenger_seat,
        "you_are_challenger": is_challenger,
        "locked_stat": game.locked_stat or None,
        "available_action": _available_action(game, seat),
        "my_card": None,
        "opponent_card": None,
        "hand": None,
        "hand_preview": None,
        "current_card_id": None,
        "opponent_card_tier": None,
        "card_swapped": game.card_swapped,
        "used_tiers": _used_tiers(game, seat),
        "last_round": None,
        "game_over": game.status == "FINISHED",
        "winner_seat": game.winner_seat,
        "you_won": (game.winner_seat == seat) if game.winner_seat else None,
        "end_reason": game.end_reason or None,
    }

    rnd = game.rounds.order_by("-number").first()

    if game.status == "ACTIVE":
        # Hidden-information rule: nobody sees a card before it is allowed.
        if game.phase in ("CHOOSING", "LOCKED"):
            if is_challenger:
                gc = _top_card(game, seat)
                state["my_card"] = _card_payload(gc) if gc else None
                state["current_card_id"] = gc.id if gc else None
            # Your own hand, face down and grouped by tier. Used for the deal
            # preview, the challenger's card swap and the responder's pick.
            # It only holds ids and tiers, never who the players are.
            if not (is_challenger and game.phase == "LOCKED"):
                state["hand"] = _hand_payload(game, seat)
            if not (is_challenger and game.phase == "LOCKED"):
                state["hand"] = _hand_payload(game, seat)
                # Round 1 deal screen only: show your own deck face up.
            if game.phase == "CHOOSING" and game.round_number == 1:
                state["hand_preview"] = _hand_preview(game, seat)
            # Responder only, after a stat is locked: the challenger card's tier
            # (colours the Locked banner), never any card details.
            if game.phase == "LOCKED" and not is_challenger:
                theirs_top = _top_card(game, opp)
                state["opponent_card_tier"] = (
                    tier_of(theirs_top.player) if theirs_top else None
                )
        elif rnd:  # REVEALED: show the cards that were actually played
            mine, theirs = _round_card(game, rnd, seat), _round_card(game, rnd, opp)
            state["my_card"] = _card_payload(mine) if mine else None
            state["opponent_card"] = _card_payload(theirs) if theirs else None

    if rnd and (game.phase == "REVEALED" or game.status == "FINISHED"):
        p1 = rnd.p1_player.name if rnd.p1_player else None
        p2 = rnd.p2_player.name if rnd.p2_player else None
        state["last_round"] = {
            "number": rnd.number,
            "stat": rnd.stat,
            "your_value": rnd.p1_value if seat == 1 else rnd.p2_value,
            "opponent_value": rnd.p2_value if seat == 1 else rnd.p1_value,
            "your_player": p1 if seat == 1 else p2,
            "opponent_player": p2 if seat == 1 else p1,
            "winner": (
                "tie" if rnd.winner_seat == 0
                else "you" if rnd.winner_seat == seat
                else "opponent"
            ),
        }
    return state