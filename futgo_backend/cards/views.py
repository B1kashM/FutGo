from django.db import transaction
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .services import CardGameError


def _token(request):
    return request.headers.get("X-Seat-Token", "")


class CardGameView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def handle_exception(self, exc):
        if isinstance(exc, CardGameError):
            return Response({"detail": exc.message}, status=exc.status)
        return super().handle_exception(exc)


class PoolsAPIView(CardGameView):
    def get(self, request):
        return Response(
            {
                "pools": services.pool_summary(),
                "player_counts": list(services.ALLOWED_PLAYER_COUNTS),
                "deck_sizes": list(services.ALLOWED_DECK_SIZES),
            }
        )


class CreateGameAPIView(CardGameView):
    def post(self, request):
        data = request.data
        with transaction.atomic():
            game = services.create_game(
                mode=data.get("mode"),
                player1_name=data.get("player1_name"),
                player2_name=data.get("player2_name"),
                category=data.get("category"),
                deck_size=data.get("deck_size"),
                max_players=data.get("max_players"),  # 2 to 6, online only
            )
        tokens = {"1": services.get_token(game, 1)}
        if game.mode == "LOCAL":
            tokens["2"] = services.get_token(game, 2)  # one device holds both seats
        return Response(
            {
                "room_code": game.room_code,
                "mode": game.mode,
                "max_players": game.max_players,
                "tokens": tokens,
                "state": services.build_state(game, 1),
            },
            status=201,
        )


class JoinGameAPIView(CardGameView):
    def post(self, request):
        with transaction.atomic():
            game = services.join_game(
                request.data.get("room_code", ""),
                request.data.get("player_name"),
            )
        seat = game.joined_seat
        return Response(
            {
                "room_code": game.room_code,
                "mode": game.mode,
                "max_players": game.max_players,
                "seat": seat,
                "tokens": {str(seat): game.joined_token},
                "state": services.build_state(game, seat),
            }
        )


class GameStateAPIView(CardGameView):
    def get(self, request, room_code):
        game, seat = services.load_game(room_code, _token(request))
        since = request.query_params.get("since")
        if since is not None and str(since) == str(game.version):
            return Response({"changed": False, "version": game.version})
        return Response(services.build_state(game, seat))


class LockStatAPIView(CardGameView):
    def post(self, request, room_code):
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.lock_stat(game, seat, request.data.get("stat"))
        return Response(services.build_state(game, seat))


class ChooseCardAPIView(CardGameView):
    """Challenger swaps their card for a face-down one from a tier."""

    def post(self, request, room_code):
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.choose_card(game, seat, request.data.get("card_id"))
        return Response(services.build_state(game, seat))


class RevealAPIView(CardGameView):
    def post(self, request, room_code):
        # Optional card_id: the responder plays a chosen card from their tier
        # album. Without it the top card is played, as before.
        card_id = request.data.get("card_id")
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.reveal(game, seat, card_id)
        return Response(services.build_state(game, seat))


class ContinueAPIView(CardGameView):
    def post(self, request, room_code):
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.continue_round(game)
        return Response(services.build_state(game, seat))


class ConcedeAPIView(CardGameView):
    def post(self, request, room_code):
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.concede(game, seat)
        return Response(services.build_state(game, seat))