import random
import secrets
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from cards.services import (
    ROOM_CODE_ALPHABET,
    VALID_CATEGORIES,
    eligible_players,
    pool_summary,
)
from drafts.simulation import POSITIONS

from .models import (
    DraftOffer,
    PenaltyGame,
    PenaltyKick,
    PenaltyMatch,
    PenaltySeat,
    SquadSlot,
)

POSITION_ORDER = list(POSITIONS.keys())  # GK, RB, RCB, LCB, LB, DMF, CMF, AMF, RWF, ST, LWF
ALLOWED_PLAYER_COUNTS = (2, 3, 4, 5, 6)
SQUAD_MODES = ("RANDOM", "DRAFT")
REGULATION_KICKS = 5

# Online games only: the goalkeeper has DIVE_SECONDS to swipe (the browser shows this timer
# and dives at random when it hits zero). The server waits a little longer (DIVE_GRACE_SECONDS)
# and then dives for the keeper, so a closed tab or lost connection can never freeze a match.
DIVE_SECONDS = 5
DIVE_GRACE_SECONDS = 4

# ------------------------------------------------------------------ tuning
# Only three zones: LEFT, CENTER, RIGHT.
# miss   = base chance the shot misses the target (post / bar / wide / over)
# misses = what kind of miss it is (name, weight)
ZONES = {
    "LEFT": {
        "label": "Left", "side": "LEFT",
        "miss": 0.10, "misses": (("WIDE", 40), ("POST", 35), ("OVER", 25)),
    },
    "CENTER": {
        "label": "Center", "side": "CENTER",
        "miss": 0.06, "misses": (("OVER", 50), ("BAR", 50)),
    },
    "RIGHT": {
        "label": "Right", "side": "RIGHT",
        "miss": 0.10, "misses": (("WIDE", 40), ("POST", 35), ("OVER", 25)),
    },
}
ZONE_LIST = [
    {"key": key, "label": z["label"], "side": z["side"]} for key, z in ZONES.items()
]


PHRASES = {
    "GOAL": [
        "GOAL! {p} sends {gk} the wrong way!",
        "{p} makes no mistake from the spot!",
        "Cool as ice! {p} buries it!",
        "{p} sweeps it home and the crowd erupts!",
        "Clinical from {p}. {gk} had no chance!",
    ],
    "SAVED": [
        "SAVED! {gk} guesses right and keeps out {p}'s penalty!",
        "What a stop! {gk} denies {p}!",
        "{gk} is the hero, pushing {p}'s effort away!",
        "{gk} dives the right way and smothers it!",
    ],
    "POST": [
        "Off the post! {p} cannot believe it!",
        "{p} hits the upright! So close!",
        "The post saves {gk}! {p} is devastated!",
    ],
    "BAR": [
        "It smashes off the crossbar! {p} is gutted!",
        "{p} hits the bar! Inches away!",
    ],
    "WIDE": [
        "{p} drags it wide of the post!",
        "Wide! {p} pulls the penalty past the upright.",
    ],
    "OVER": [
        "{p} blazes it over the bar!",
        "Over the top! {p} has skied it!",
    ],
}


class PenaltyError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


# ------------------------------------------------------------------ helpers

def _generate_room_code():
    while True:
        code = "".join(secrets.choice(ROOM_CODE_ALPHABET) for _ in range(6))
        if not PenaltyGame.objects.filter(room_code=code).exists():
            return code


def _clean_name(value, fallback):
    return str(value or "").strip()[:50] or fallback


def _unique_name(game, name):
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


def _add_seat(game, seat, name):
    token = secrets.token_urlsafe(24)
    PenaltySeat.objects.create(game=game, seat=seat, name=name, token=token)
    return token


def get_token(game, seat):
    row = game.seats.filter(seat=seat).first()
    return row.token if row else ""


def pools():
    return pool_summary()


# ------------------------------------------------------------------ squads

def _position_groups(pool, n):
    """For every position, n different players (fills gaps from the rest of the pool)."""
    needed = len(POSITION_ORDER) * n
    if len(pool) < needed:
        raise PenaltyError(
            f"Only {len(pool)} cards are available in this pool but {needed} are needed. "
            "Pick a bigger pool or fewer players."
        )

    by_position = {}
    for p in pool:
        by_position.setdefault(p.position, []).append(p)

    used, groups = set(), []
    for pos in POSITION_ORDER:
        candidates = [p for p in by_position.get(pos, []) if p.id not in used]
        picks = random.sample(candidates, min(n, len(candidates)))
        used.update(p.id for p in picks)
        groups.append(picks)

    spare = [p for p in pool if p.id not in used]
    random.shuffle(spare)
    for picks in groups:
        while len(picks) < n:
            picks.append(spare.pop())
    return groups


def _deal_random_squads(game):
    """Cards-style deal: snake order per position so squads have a similar rating."""
    n = game.max_players
    groups = _position_groups(eligible_players(game.category), n)

    seat_order = list(range(1, n + 1))
    random.shuffle(seat_order)

    rows = []
    for i, (pos, picks) in enumerate(zip(POSITION_ORDER, groups)):
        picks = sorted(picks, key=lambda p: p.ovr_rating, reverse=True)
        order = seat_order if i % 2 == 0 else seat_order[::-1]
        for seat, player in zip(order, picks):
            rows.append(SquadSlot(game=game, seat=seat, position=pos, player=player))
    SquadSlot.objects.bulk_create(rows)


def _prepare_draft(game):
    groups = _position_groups(eligible_players(game.category), game.max_players)
    rows = []
    for step, picks in enumerate(groups):
        random.shuffle(picks)
        for order, player in enumerate(picks):
            rows.append(DraftOffer(game=game, step=step, player=player, order=order))
    DraftOffer.objects.bulk_create(rows)


def _draft_order(game, step):
    """Who picks first rotates every position, so nobody always gets first choice."""
    n = game.max_players
    return [((i + step) % n) + 1 for i in range(n)]


def _draft_open_offers(game):
    step = game.draft_step
    position = POSITION_ORDER[step]
    taken = set(game.squad.filter(position=position).values_list("player_id", flat=True))
    offers = [
        o
        for o in game.offers.filter(step=step).select_related("player").order_by("order")
        if o.player_id not in taken
    ]
    return position, offers


def _current_picker(game):
    order = _draft_order(game, game.draft_step)
    taken = game.squad.filter(position=POSITION_ORDER[game.draft_step]).count()
    return order[taken] if taken < len(order) else None


def draft_pick(game, seat, player_id):
    """The picker takes one candidate. The last leftover goes to the last seat."""
    if game.status != "SQUAD":
        raise PenaltyError("There is no squad draft going on.", 409)
    if seat != _current_picker(game):
        raise PenaltyError("It is not your turn to pick.", 403)
    try:
        player_id = int(player_id)
    except (TypeError, ValueError):
        raise PenaltyError("player_id must be a number.")

    position, offers = _draft_open_offers(game)
    chosen = next((o for o in offers if o.player_id == player_id), None)
    if chosen is None:
        raise PenaltyError("That player is not on offer.")

    SquadSlot.objects.create(game=game, seat=seat, position=position, player=chosen.player)
    leftovers = [o for o in offers if o.id != chosen.id]
    picked = game.max_players - len(leftovers)

    if len(leftovers) == 1:
        last_seat = _draft_order(game, game.draft_step)[-1]
        SquadSlot.objects.create(
            game=game, seat=last_seat, position=position, player=leftovers[0].player
        )
        picked += 1

    if picked >= game.max_players:
        game.draft_step += 1
        if game.draft_step >= len(POSITION_ORDER):
            _start_tournament(game)
    _touch(game)


def _shooters(game, seat):
    """Kick order: best outfield players first, goalkeeper last."""
    slots = list(game.squad.filter(seat=seat).select_related("player"))
    outfield = sorted(
        (s for s in slots if s.position != "GK"), key=lambda s: -s.player.ovr_rating
    )
    keepers = [s for s in slots if s.position == "GK"]
    return outfield + keepers


def _goalkeeper(game, seat):
    slot = game.squad.filter(seat=seat, position="GK").select_related("player").first()
    if slot is None:
        raise PenaltyError("This squad has no goalkeeper.", 500)
    return slot.player


# ------------------------------------------------------------------ tournament

def _bracket_size(game):
    return 1 << (game.max_players - 1).bit_length()


def _round_name(slots):
    return {2: "Final", 4: "Semi-final", 8: "Quarter-final"}.get(slots, f"Round of {slots}")


def _pair_up(byes, winners):
    """Bye players meet winners first, then whoever is left meets each other."""
    pairs = []
    k = min(len(byes), len(winners))
    for i in range(k):
        pairs.append((byes[i], winners[i]))
    rest = byes[k:] + winners[k:]
    for i in range(0, len(rest), 2):
        pairs.append((rest[i], rest[i + 1]))
    return pairs


def _create_round(game, pairs):
    game.round_number += 1
    slots = _bracket_size(game) >> (game.round_number - 1)
    name = _round_name(slots)
    for number, (a, b) in enumerate(pairs, start=1):
        PenaltyMatch.objects.create(
            game=game,
            round_number=game.round_number,
            round_name=name,
            match_number=number,
            seat_a=a,
            seat_b=b,
            first_seat=secrets.choice([a, b]),  # coin toss
        )


def _start_tournament(game):
    seats = list(game.seats.values_list("seat", flat=True))
    random.shuffle(seats)
    byes = _bracket_size(game) - len(seats)
    bye_seats, playing = seats[:byes], seats[byes:]

    game.bye_seats = ",".join(str(s) for s in bye_seats)
    game.status = "ACTIVE"
    game.round_number = 0
    _create_round(game, [(playing[i], playing[i + 1]) for i in range(0, len(playing), 2)])


def _begin_squads(game):
    if game.squad_mode == "RANDOM":
        _deal_random_squads(game)
        _start_tournament(game)
    else:
        _prepare_draft(game)
        game.status = "SQUAD"
        game.draft_step = 0
    _touch(game)


def _bye_list(game):
    if game.round_number != 1:
        return []
    return [int(x) for x in game.bye_seats.split(",") if x.strip().isdigit()]


def _maybe_next_round(game):
    matches = list(game.matches.filter(round_number=game.round_number))
    if any(m.status != "FINISHED" for m in matches):
        return
    winners = [m.winner_seat for m in matches]
    byes = _bye_list(game)

    if len(byes) + len(winners) == 1:
        game.status = "FINISHED"
        game.champion_seat = winners[0]
        game.end_reason = "CHAMPION"
        return
    _create_round(game, _pair_up(byes, winners))


def _other(match, seat):
    return match.seat_b if seat == match.seat_a else match.seat_a


def _finish_match(game, match, winner, reason="SCORE"):
    match.status = "FINISHED"
    match.phase = "DONE"
    match.pending_shot = ""
    match.dive_deadline = None
    match.winner_seat = winner
    match.end_reason = reason
    match.save()
    game.seats.filter(seat=_other(match, winner)).update(eliminated=True)
    _maybe_next_round(game)


# ------------------------------------------------------------------ game setup

def create_game(mode, squad_mode, player1_name, player2_name, category, max_players=2):
    mode = str(mode or "LOCAL").upper()
    if mode not in ("LOCAL", "ONLINE"):
        raise PenaltyError("mode must be LOCAL or ONLINE.")

    squad_mode = str(squad_mode or "RANDOM").upper()
    if squad_mode not in SQUAD_MODES:
        raise PenaltyError("squad_mode must be RANDOM or DRAFT.")

    p1 = _clean_name(player1_name, "")
    if not p1:
        raise PenaltyError("Player 1 name is required.")
    p2 = _clean_name(player2_name, "Player 2") if mode == "LOCAL" else ""

    category = str(category or "").upper()
    if category in ("", "ALL"):
        category = ""
    elif category not in VALID_CATEGORIES:
        raise PenaltyError("Unknown category.")

    if mode == "LOCAL":
        max_players = 2
    else:
        try:
            max_players = int(max_players or 2)
        except (TypeError, ValueError):
            raise PenaltyError("max_players must be a number.")
        if max_players not in ALLOWED_PLAYER_COUNTS:
            options = ", ".join(str(c) for c in ALLOWED_PLAYER_COUNTS)
            raise PenaltyError(f"max_players must be one of: {options}.")

    game = PenaltyGame.objects.create(
        room_code=_generate_room_code(),
        mode=mode,
        squad_mode=squad_mode,
        status="WAITING",
        category=category,
        max_players=max_players,
    )
    _add_seat(game, 1, p1)
    if mode == "LOCAL":
        _add_seat(game, 2, _unique_name(game, p2))
        _begin_squads(game)
    else:
        game.save()
    return game


def join_game(room_code, player_name):
    """Takes the next free seat. The squad phase starts when the last seat is taken."""
    try:
        game = PenaltyGame.objects.select_for_update().get(
            room_code=str(room_code).upper()
        )
    except PenaltyGame.DoesNotExist:
        raise PenaltyError("Game not found.", 404)

    if game.mode != "ONLINE" or game.status != "WAITING":
        raise PenaltyError("This game is not open for joining.", 409)

    name = _clean_name(player_name, "")
    if not name:
        raise PenaltyError("Your name is required.")

    taken = game.seats.count()
    if taken >= game.max_players:
        raise PenaltyError("This room is full.", 409)

    seat = taken + 1
    token = _add_seat(game, seat, _unique_name(game, name))
    if seat == game.max_players:
        _begin_squads(game)
    else:
        _touch(game)
    return game, seat, token


def load_game(room_code, token, lock=False):
    qs = PenaltyGame.objects.select_for_update() if lock else PenaltyGame.objects
    try:
        game = qs.get(room_code=str(room_code).upper())
    except PenaltyGame.DoesNotExist:
        raise PenaltyError("Game not found.", 404)

    seat = None
    given = str(token or "").encode()
    if given:
        for row in game.seats.all():
            if row.token and secrets.compare_digest(given, row.token.encode()):
                seat = row.seat
    if seat is None:
        raise PenaltyError("Invalid or missing seat token.", 403)

    # Every request (polls included) first dives for any keeper whose time ran out.
    game = settle_expired(game)
    return game, seat


# ------------------------------------------------------------------ the kick

def _kicks_of(match, seat):
    return match.kicks_a if seat == match.seat_a else match.kicks_b


def _attacker_seat(match):
    """Kicks strictly alternate, starting with the coin-toss winner."""
    total = match.kicks_a + match.kicks_b
    return match.first_seat if total % 2 == 0 else _other(match, match.first_seat)


def _decided(match):
    """Winner seat if the shootout is over, otherwise None (same rules as simulation.py)."""
    ka, kb, sa, sb = match.kicks_a, match.kicks_b, match.score_a, match.score_b
    if ka <= REGULATION_KICKS and kb <= REGULATION_KICKS:
        if sa > sb + max(0, REGULATION_KICKS - kb):
            return match.seat_a
        if sb > sa + max(0, REGULATION_KICKS - ka):
            return match.seat_b
        return None
    if ka == kb and sa != sb:  # sudden death: decided after an equal number of kicks
        return match.seat_a if sa > sb else match.seat_b
    return None


def _save_chance(shot, dive, keeper, shooter):
    # The keeper only has a real chance when he picks the same third as the shot.
    chance = 0.60 if shot == dive else 0.03
    chance += (keeper.ovr_rating - 80) / 400
    chance -= (shooter.ovr_rating - 80) / 500
    return min(max(chance, 0.02), 0.85)


def _roll_outcome(shooter, keeper, shot, dive):
    zone = ZONES[shot]
    miss = zone["miss"] - (shooter.ovr_rating - 80) / 250
    miss = min(max(miss, 0.02), 0.30)
    if random.random() < miss:
        names, weights = zip(*zone["misses"])
        return random.choices(names, weights=weights, k=1)[0]
    if random.random() < _save_chance(shot, dive, keeper, shooter):
        return "SAVED"
    return "GOAL"


def _my_active_match(game, seat):
    if game.status != "ACTIVE":
        raise PenaltyError("The shootout is not in progress.", 409)
    match = (
        game.matches.filter(status="ACTIVE")
        .filter(Q(seat_a=seat) | Q(seat_b=seat))
        .first()
    )
    if match is None:
        raise PenaltyError("You are not playing a match right now.", 409)
    return match


def _check_zone(zone):
    zone = str(zone or "").upper()
    if zone not in ZONES:
        raise PenaltyError("Unknown shot zone.")
    return zone


def shoot(game, seat, zone):
    match = _my_active_match(game, seat)
    if match.phase != "SHOOT":
        raise PenaltyError("The shot is already locked in.", 409)
    if seat != _attacker_seat(match):
        raise PenaltyError("It is not your turn to shoot.", 403)
    match.pending_shot = _check_zone(zone)
    match.phase = "DIVE"
    # Local games share one phone (there is a hand-over screen), so only online games get a deadline.
    if game.mode == "ONLINE":
        match.dive_deadline = timezone.now() + timedelta(
            seconds=DIVE_SECONDS + DIVE_GRACE_SECONDS
        )
    else:
        match.dive_deadline = None
    match.save()
    _touch(game)


def dive(game, seat, zone):
    match = _my_active_match(game, seat)
    if match.phase != "DIVE":
        raise PenaltyError("The shooter has not picked a shot yet.", 409)
    attacker = _attacker_seat(match)
    if seat == attacker:
        raise PenaltyError("You are the shooter this kick.", 403)
    _resolve_kick(game, match, attacker, match.pending_shot, _check_zone(zone))
    _touch(game)


def _resolve_kick(game, match, attacker, shot, dive_zone):
    keeper_seat = _other(match, attacker)
    taken = _kicks_of(match, attacker)
    shooters = _shooters(game, attacker)
    shooter = shooters[taken % len(shooters)].player
    keeper = _goalkeeper(game, keeper_seat)

    outcome = _roll_outcome(shooter, keeper, shot, dive_zone)

    if attacker == match.seat_a:
        match.kicks_a += 1
        if outcome == "GOAL":
            match.score_a += 1
    else:
        match.kicks_b += 1
        if outcome == "GOAL":
            match.score_b += 1

    PenaltyKick.objects.create(
        match=match,
        number=match.kicks_a + match.kicks_b,
        round_number=taken + 1,
        sudden_death=taken >= REGULATION_KICKS,
        seat=attacker,
        keeper_seat=keeper_seat,
        shooter=shooter,
        keeper=keeper,
        shot_zone=shot,
        dive_zone=dive_zone,
        outcome=outcome,
        commentary=random.choice(PHRASES[outcome]).format(p=shooter.name, gk=keeper.name)[:255],
        score_a=match.score_a,
        score_b=match.score_b,
    )

    match.pending_shot = ""
    match.dive_deadline = None
    winner = _decided(match)
    if winner:
        _finish_match(game, match, winner)
    else:
        match.phase = "SHOOT"
        match.save()


def settle_expired(game):
    """Dive at random for any keeper whose time ran out (online games).

    Returns the game to keep using: the same object if nothing changed, or a freshly
    locked copy if a kick was settled. Safe to call on every request.
    """
    if game.status != "ACTIVE" or game.mode != "ONLINE":
        return game

    now = timezone.now()
    if not game.matches.filter(
        status="ACTIVE", phase="DIVE", dive_deadline__lt=now
    ).exists():
        return game

    with transaction.atomic():
        locked = PenaltyGame.objects.select_for_update().get(pk=game.pk)
        expired = list(
            locked.matches.select_for_update().filter(
                status="ACTIVE", phase="DIVE", dive_deadline__lt=now
            )
        )
        for match in expired:
            _resolve_kick(
                locked,
                match,
                _attacker_seat(match),
                match.pending_shot,
                random.choice(list(ZONES)),
            )
        if expired:
            _touch(locked)
    return locked


def concede(game, seat):
    """Leaving a match gives it to the opponent."""
    match = _my_active_match(game, seat)
    _finish_match(game, match, _other(match, seat), "CONCEDED")
    _touch(game)


# ------------------------------------------------------------------ state for the client

def _player_payload(p, slot=None):
    return {
        "player_id": p.id,
        "name": p.name,
        "club": p.club,
        "country": p.country,
        "slot": slot or p.position,
        "natural_position": p.position,
        "ovr_rating": p.ovr_rating,
        "category": p.category,
        "image_url": p.image_url,
    }


def _squad_payload(game, seat):
    slots = {s.position: s for s in game.squad.filter(seat=seat).select_related("player")}
    return [
        _player_payload(slots[pos].player, pos) for pos in POSITION_ORDER if pos in slots
    ]


def _kick_payload(k, names):
    return {
        "number": k.number,
        "round": k.round_number,
        "sudden_death": k.sudden_death,
        "seat": k.seat,
        "team_name": names.get(k.seat, ""),
        "shooter": {"player_id": k.shooter_id, "name": k.shooter.name, "image_url": k.shooter.image_url},
        "keeper": {"player_id": k.keeper_id, "name": k.keeper.name, "image_url": k.keeper.image_url},
        "shot_zone": k.shot_zone,
        "dive_zone": k.dive_zone,
        "outcome": k.outcome,
        "scored": k.outcome == "GOAL",
        "commentary": k.commentary,
        "score_a": k.score_a,
        "score_b": k.score_b,
    }


def _match_brief(m, names):
    return {
        "id": m.id,
        "round_number": m.round_number,
        "round_name": m.round_name,
        "match_number": m.match_number,
        "seat_a": m.seat_a,
        "seat_b": m.seat_b,
        "name_a": names.get(m.seat_a, ""),
        "name_b": names.get(m.seat_b, ""),
        "score_a": m.score_a,
        "score_b": m.score_b,
        "kicks_a": m.kicks_a,
        "kicks_b": m.kicks_b,
        "status": m.status,
        "winner_seat": m.winner_seat,
        "winner_name": names.get(m.winner_seat, "") if m.winner_seat else None,
        "end_reason": m.end_reason or None,
    }


def _current_payload(game, match, names):
    attacker = _attacker_seat(match)
    keeper_seat = _other(match, attacker)
    taken = _kicks_of(match, attacker)
    shooters = _shooters(game, attacker)
    slot = shooters[taken % len(shooters)]
    return {
        "attacker_seat": attacker,
        "attacker_name": names.get(attacker, ""),
        "keeper_seat": keeper_seat,
        "keeper_name": names.get(keeper_seat, ""),
        "shooter": _player_payload(slot.player, slot.position),
        "keeper": _player_payload(_goalkeeper(game, keeper_seat), "GK"),
        "kick_number": match.kicks_a + match.kicks_b + 1,
        "shootout_round": taken + 1,
        "sudden_death": taken >= REGULATION_KICKS,
        # Only "has the shooter chosen?" is sent. The zone stays secret until the kick is taken.
        "shot_locked": match.phase == "DIVE",
    }


def _match_payload(game, match, names, seat):
    kicks = list(match.kicks.select_related("shooter", "keeper").order_by("number"))
    payload = _match_brief(match, names)
    opponent = _other(match, seat) if seat in (match.seat_a, match.seat_b) else None
    payload.update(
        {
            "phase": match.phase,
            "first_seat": match.first_seat,
            "opponent_seat": opponent,
            "opponent_name": names.get(opponent, "") if opponent else None,
            "kicks": [
                {
                    "number": k.number,
                    "round": k.round_number,
                    "seat": k.seat,
                    "outcome": k.outcome,
                    "sudden_death": k.sudden_death,
                }
                for k in kicks
            ],
            "last_kick": _kick_payload(kicks[-1], names) if kicks else None,
            "current": _current_payload(game, match, names) if match.status == "ACTIVE" else None,
        }
    )
    return payload


def _find_my_match(game, seat):
    if game.status not in ("ACTIVE", "FINISHED"):
        return None
    mine = game.matches.filter(Q(seat_a=seat) | Q(seat_b=seat))
    return mine.filter(status="ACTIVE").first() or mine.order_by("-round_number").first()


def _bracket_payload(game, names):
    rounds = {}
    for m in game.matches.all():
        entry = rounds.setdefault(
            m.round_number,
            {"round_number": m.round_number, "round_name": m.round_name, "matches": []},
        )
        entry["matches"].append(_match_brief(m, names))
    return list(rounds.values())


def _draft_payload(game, seat, names):
    position, offers = _draft_open_offers(game)
    order = _draft_order(game, game.draft_step)
    picker = order[game.max_players - len(offers)]
    return {
        "step": game.draft_step + 1,
        "total_steps": len(POSITION_ORDER),
        "position": position,
        "order": order,
        "picker_seat": picker,
        "picker_name": names.get(picker, ""),
        "you_are_picker": picker == seat,
        "offers": [_player_payload(o.player, position) for o in offers],
    }


def _available_action(game, seat, match, out):
    if game.status == "WAITING":
        return "wait_for_players"
    if game.status == "FINISHED":
        return None
    if game.status == "SQUAD":
        return "pick_player" if _current_picker(game) == seat else "wait_for_pick"
    if match is not None and match.status == "ACTIVE":
        attacker = _attacker_seat(match)
        if match.phase == "SHOOT":
            return "shoot" if seat == attacker else "wait_for_shot"
        return "wait_for_keeper" if seat == attacker else "dive"
    if seat in out:
        return "eliminated"
    return "wait_for_next_round"  # bye, or already won this round


def build_state(game, seat):
    rows = list(game.seats.all())
    names = {r.seat: r.name for r in rows}
    out = {r.seat for r in rows if r.eliminated}
    match = _find_my_match(game, seat)
    bracket = _bracket_payload(game, names) if game.status in ("ACTIVE", "FINISHED") else None

    state = {
        "room_code": game.room_code,
        "mode": game.mode,
        "status": game.status,
        "squad_mode": game.squad_mode,
        "category": game.category or "ALL",
        "max_players": game.max_players,
        "seats_filled": len(rows),
        "version": game.version,
        "players": [
            {"seat": r.seat, "name": r.name, "is_you": r.seat == seat, "eliminated": r.eliminated}
            for r in rows
        ],
        "you": {"seat": seat, "name": names.get(seat, ""), "eliminated": seat in out},
        "zones": ZONE_LIST,
        "available_action": _available_action(game, seat, match, out),
        "round_number": game.round_number,
        "round_name": bracket[-1]["round_name"] if bracket else None,
        "bye_seats": _bye_list(game) if game.round_number == 1 else [],
        "champion_seat": game.champion_seat,
        "champion_name": names.get(game.champion_seat) if game.champion_seat else None,
        "you_are_champion": (game.champion_seat == seat) if game.champion_seat else None,
        "game_over": game.status == "FINISHED",
        "end_reason": game.end_reason or None,
        "squad": _squad_payload(game, seat),
        "squads": None,
        "draft": None,
        "bracket": bracket,
        "match": _match_payload(game, match, names, seat) if match else None,
    }

    if game.status == "SQUAD":
        state["draft"] = _draft_payload(game, seat, names)
        state["squads"] = {r.seat: _squad_payload(game, r.seat) for r in rows}
    return state