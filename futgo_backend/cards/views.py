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
        return Response({"pools": services.pool_summary()})


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
            )
        tokens = {"1": game.player1_token}
        if game.mode == "LOCAL":
            tokens["2"] = game.player2_token  # one device holds both seats
        return Response(
            {
                "room_code": game.room_code,
                "mode": game.mode,
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
        return Response(
            {
                "room_code": game.room_code,
                "mode": game.mode,
                "tokens": {"2": game.player2_token},
                "state": services.build_state(game, 2),
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


class RevealAPIView(CardGameView):
    def post(self, request, room_code):
        with transaction.atomic():
            game, seat = services.load_game(room_code, _token(request), lock=True)
            services.reveal(game, seat)
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