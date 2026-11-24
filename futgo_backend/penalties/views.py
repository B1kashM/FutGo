from django.db import transaction
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import services
from .services import PenaltyError

TOKEN_HEADER = "X-Participant-Token"


def _token(request):
    return request.headers.get(TOKEN_HEADER, "")


def _error(e):
    return Response({"error": e.message}, status=e.status)


def _act(request, room_code, action, *args):
    """Lock the game, run one action, then return the fresh state for that seat."""
    try:
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            action(game, seat, *args)
    except PenaltyError as e:
        return _error(e)
    return Response(services.build_state(game, seat))


@api_view(["GET"])
def pools(request):
    return Response(
        {
            "pools": services.pools(),
            "squad_modes": [
                {"key": "RANDOM", "label": "Random squad"},
                {"key": "DRAFT", "label": "Build your squad"},
            ],
            "player_counts": list(services.ALLOWED_PLAYER_COUNTS),
        }
    )


@api_view(["POST"])
def create_game(request):
    d = request.data
    try:
        with transaction.atomic():
            game = services.create_game(
                mode=d.get("mode"),
                squad_mode=d.get("squad_mode"),
                player1_name=d.get("player1_name"),
                player2_name=d.get("player2_name"),
                category=d.get("category"),
                max_players=d.get("max_players"),
            )
    except PenaltyError as e:
        return _error(e)

    if game.mode == "LOCAL":
        # One phone controls both seats, so both tokens are returned.
        return Response(
            {
                "room_code": game.room_code,
                "tokens": {
                    "1": services.get_token(game, 1),
                    "2": services.get_token(game, 2),
                },
                "state": services.build_state(game, 1),
            },
            status=201,
        )
    return Response(
        {
            "room_code": game.room_code,
            "seat": 1,
            "token": services.get_token(game, 1),
            "state": services.build_state(game, 1),
        },
        status=201,
    )


@api_view(["POST"])
def join_game(request, room_code):
    try:
        with transaction.atomic():
            game, seat, token = services.join_game(room_code, request.data.get("player_name"))
    except PenaltyError as e:
        return _error(e)
    return Response(
        {
            "room_code": game.room_code,
            "seat": seat,
            "token": token,
            "state": services.build_state(game, seat),
        },
        status=201,
    )


@api_view(["GET"])
def game_state(request, room_code):
    """Polling endpoint. Pass ?since=<version> to get a tiny reply when nothing changed."""
    try:
        game, seat = services.load_game(room_code, _token(request))
    except PenaltyError as e:
        return _error(e)

    since = request.query_params.get("since")
    if since is not None and since.isdigit() and int(since) == game.version:
        return Response({"changed": False, "version": game.version})
    return Response(services.build_state(game, seat))


@api_view(["POST"])
def pick(request, room_code):
    return _act(request, room_code, services.draft_pick, request.data.get("player_id"))


@api_view(["POST"])
def shoot(request, room_code):
    return _act(request, room_code, services.shoot, request.data.get("zone"))


@api_view(["POST"])
def dive(request, room_code):
    return _act(request, room_code, services.dive, request.data.get("zone"))


@api_view(["POST"])
def concede(request, room_code):
    return _act(request, room_code, services.concede)