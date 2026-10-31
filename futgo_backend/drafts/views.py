import hashlib
import secrets
import string

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from players.models import Player

from .models import (
    Draft,
    DraftEvent,
    DraftParticipant,
    DraftPick,
    MatchResult,
    MatchEvent,
    Team,
    TeamMatchStatistics,
    PlayerMatchRating,
)
from .serializers import CreateDraftSerializer, TeamSerializer
from .simulation import simulate_match


# ============================================================
# CONSTANTS
# ============================================================

SQUAD_SIZE = 11

POSITION_SEQUENCE = [
    "GK", "RB", "RCB", "LCB", "LB",
    "DMF", "CMF", "AMF", "RWF", "ST", "LWF",
]

MAX_NAME_LENGTH = 50

# Events that carry the RESULT of a single shootout kick.
PENALTY_EVENT_TYPES = {
    "PENALTY_GOAL",
    "PENALTY_SAVE",
    "PENALTY_MISS",
}

# Event shown just before the result ("<player> steps up...").
PENALTY_KICK_SETUP_TYPE = "PENALTY_KICK"


# ============================================================
# AUTHENTICATION AND ROOM HELPERS
# ============================================================

def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_room_code():
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


def create_unique_room_code():
    for _ in range(20):
        code = generate_room_code()
        if not Draft.objects.filter(room_code=code).exists():
            return code

    raise RuntimeError("Unable to generate a unique room code.")


def create_secret_token():
    return secrets.token_urlsafe(32)


def serialize_team(team):
    if team is None:
        return None

    return {
        "id": team.id,
        "name": team.name,
        "short_name": team.short_name,
        "logo_url": team.logo_url,
        "primary_color": team.primary_color,
        "secondary_color": team.secondary_color,
        "is_active": team.is_active,
    }


def serialize_draft_teams(draft):
    return {
        "player1_team": serialize_team(draft.player1_team),
        "player2_team": serialize_team(draft.player2_team),
        "teams_selected": (
            draft.player1_team_id is not None
            and draft.player2_team_id is not None
        ),
    }


def participant_response(draft, participant, token=None):
    data = {
        "draft_id": draft.id,
        "room_code": draft.room_code,
        "mode": draft.mode,
        "status": draft.status,
        "participant": {
            "seat_number": participant.seat_number,
            "display_name": participant.display_name,
        },
        **serialize_draft_teams(draft),
    }

    if token is not None:
        data["participant_token"] = token

    return data


def get_token_participant(request, draft):
    token = request.headers.get("X-Participant-Token", "").strip()

    if not token:
        return None

    return DraftParticipant.objects.filter(
        draft=draft,
        token_hash=hash_token(token),
    ).first()


def team_selection_error(draft, team, seat_number):
    if not team.is_active:
        return "This football club is not available for selection."

    other_team_id = (
        draft.player2_team_id
        if seat_number == 1
        else draft.player1_team_id
    )

    if other_team_id == team.id:
        return "Each player must choose a different football club."

    return None


# ============================================================
# TEAM CATALOG
# ============================================================

class TeamListAPIView(APIView):
    def get(self, request):
        teams = Team.objects.filter(is_active=True).order_by("name")

        return Response(
            TeamSerializer(teams, many=True).data,
            status=status.HTTP_200_OK,
        )


class CreateTeamAPIView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        is_bulk = isinstance(request.data, list)

        serializer = TeamSerializer(
            data=request.data,
            many=is_bulk,
        )

        if serializer.is_valid():
            teams = serializer.save()

            if is_bulk:
                return Response(
                    TeamSerializer(teams, many=True).data,
                    status=status.HTTP_201_CREATED,
                )

            return Response(
                TeamSerializer(teams).data,
                status=status.HTTP_201_CREATED,
            )

        return Response(
            serializer.errors,
            status=status.HTTP_400_BAD_REQUEST,
        )


# ============================================================
# DRAFT EVENT HELPERS
# ============================================================

def create_next_event(draft, event_number):
    if not 1 <= event_number <= SQUAD_SIZE:
        raise ValueError("Invalid draft event number.")

    required_position = POSITION_SEQUENCE[event_number - 1]

    available_players = (
        Player.objects
        .filter(
            position=required_position,
            category=draft.category,
        )
        .exclude(draft_picks__draft=draft)
        .order_by("?")
    )

    offered_players = list(available_players[:2])

    if len(offered_players) < 2:
        raise ValueError(
            f"Not enough available players for position "
            f"{required_position}. Two players are required."
        )

    return DraftEvent.objects.create(
        draft=draft,
        event_number=event_number,
        active_player_number=draft.active_player_number,
        offered_player1=offered_players[0],
        offered_player2=offered_players[1],
    )


def serialize_event(event):
    def serialize_player(player):
        return {
            "id": player.id,
            "name": player.name,
            "club": getattr(player, "club", None),
            "country": getattr(player, "country", None),
            "position": getattr(player, "position", None),
            "category": getattr(player, "category", None),
            "image_url": getattr(player, "image_url", None),
            "ovr_rating": getattr(player, "ovr_rating", None),
        }

    return {
        "id": event.id,
        "event_number": event.event_number,
        "active_player_number": event.active_player_number,
        "required_position": POSITION_SEQUENCE[event.event_number - 1],
        "offered_players": [
            serialize_player(event.offered_player1),
            serialize_player(event.offered_player2),
        ],
    }


def serialize_draft_state(draft):
    draft_events = list(
        DraftEvent.objects
        .filter(draft=draft)
        .select_related("offered_player1", "offered_player2")
        .order_by("event_number")
    )

    picks = list(
        DraftPick.objects
        .filter(draft=draft)
        .select_related("player", "event")
        .order_by("event__event_number", "id")
    )

    completed_event_ids = {pick.event_id for pick in picks}

    pending_event = next(
        (
            event for event in draft_events
            if event.id not in completed_event_ids
        ),
        None,
    )

    squads = {1: [], 2: []}

    for pick in picks:
        player = pick.player

        player_data = {
            "player_id": player.id,
            "name": player.name,
            "club": getattr(player, "club", None),
            "country": getattr(player, "country", None),
            "position": getattr(player, "position", None),
            "category": getattr(player, "category", None),
            "image_url": getattr(player, "image_url", None),
            "was_selected": pick.was_selected,
            "event_number": pick.event.event_number,
        }

        squads[pick.assigned_to_number].append(player_data)

    return {
        "draft_id": draft.id,
        "mode": draft.mode,
        "category": draft.category,
        "room_code": draft.room_code,
        "status": draft.status,
        "player1_name": draft.player1_name,
        "player2_name": draft.player2_name,
        **serialize_draft_teams(draft),
        "active_player_number": draft.active_player_number,
        "squad_size": SQUAD_SIZE,
        "position_sequence": POSITION_SEQUENCE,
        "squads": {
            "player1": squads[1],
            "player2": squads[2],
        },
        "current_event": (
            serialize_event(pending_event)
            if pending_event is not None
            else None
        ),
        "completed_at": getattr(draft, "completed_at", None),
    }


# ============================================================
# CREATE DRAFT
# ============================================================

class CreateDraftAPIView(APIView):
    def post(self, request):
        serializer = CreateDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        mode = data.get("mode", "LOCAL")

        player1_name = data["player1_name"]
        player2_name = data.get("player2_name", "")

        player1_team = data["player1_team"]
        player2_team = data.get("player2_team")

        draft_data = {
            "mode": mode,
            "category": data["category"],
            "player1_name": player1_name,
            "player2_name": player2_name if mode == "LOCAL" else "",
            "player1_team": player1_team,
            "player2_team": player2_team if mode == "LOCAL" else None,
            "active_player_number": 1,
            "status": "WAITING",
        }

        if mode == "ONLINE":
            draft_data["room_code"] = create_unique_room_code()

        with transaction.atomic():
            draft = Draft.objects.create(**draft_data)

            if mode == "ONLINE":
                token = create_secret_token()

                participant = DraftParticipant.objects.create(
                    draft=draft,
                    seat_number=1,
                    display_name=player1_name,
                    token_hash=hash_token(token),
                )

                response_data = participant_response(
                    draft,
                    participant,
                    token=token,
                )
            else:
                response_data = {
                    "draft_id": draft.id,
                    "mode": draft.mode,
                    "status": draft.status,
                    "player1_name": draft.player1_name,
                    "player2_name": draft.player2_name,
                    **serialize_draft_teams(draft),
                }

        return Response(
            response_data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================
# SELECT TEAM
# ============================================================

class SelectDraftTeamAPIView(APIView):
    def post(self, request, draft_id):
        team_id = request.data.get("team_id")

        if team_id is None:
            return Response(
                {"detail": "team_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            team_id = int(team_id)
        except (TypeError, ValueError):
            return Response(
                {"detail": "team_id must be a valid integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(),
                pk=draft_id,
            )

            if draft.status != "WAITING":
                return Response(
                    {
                        "detail": (
                            "Club selection is locked after the draft starts."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            participant = None

            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if participant is None:
                    return Response(
                        {"detail": "A valid participant token is required."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

                seat_number = participant.seat_number

            else:
                try:
                    seat_number = int(request.data.get("player_number"))
                except (TypeError, ValueError):
                    return Response(
                        {
                            "detail": (
                                "player_number must be 1 or 2 for local play."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if seat_number not in (1, 2):
                    return Response(
                        {"detail": "player_number must be 1 or 2."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            team = Team.objects.filter(
                pk=team_id,
                is_active=True,
            ).first()

            if team is None:
                return Response(
                    {"detail": "The selected club does not exist or is unavailable."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            error = team_selection_error(draft, team, seat_number)

            if error:
                return Response(
                    {"detail": error},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if seat_number == 1:
                draft.player1_team = team
                update_fields = ["player1_team"]
            else:
                if draft.mode == "ONLINE" and not DraftParticipant.objects.filter(
                    draft=draft,
                    seat_number=1,
                ).exists():
                    return Response(
                        {"detail": "The host has not joined this draft."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                draft.player2_team = team
                update_fields = ["player2_team"]

            draft.save(update_fields=update_fields)
            draft.refresh_from_db()

            response_data = {
                "draft_id": draft.id,
                **serialize_draft_teams(draft),
            }

            if participant is not None:
                response_data["participant"] = {
                    "seat_number": participant.seat_number,
                    "display_name": participant.display_name,
                }

        return Response(response_data, status=status.HTTP_200_OK)


# ============================================================
# JOIN ONLINE DRAFT
# ============================================================

class JoinDraftAPIView(APIView):
    def post(self, request):
        room_code = str(
            request.data.get("room_code", "") or ""
        ).strip().upper()

        display_name = str(
            request.data.get("display_name", "") or ""
        ).strip()

        if not room_code or not display_name:
            return Response(
                {
                    "detail": (
                        "Both room_code and display_name are required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(display_name) > MAX_NAME_LENGTH:
            return Response(
                {
                    "detail": (
                        f"Display name cannot exceed {MAX_NAME_LENGTH} "
                        "characters."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = (
                Draft.objects
                .select_for_update()
                .filter(room_code=room_code)
                .first()
            )

            if draft is None:
                return Response(
                    {"detail": "Draft room not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if draft.mode != "ONLINE":
                return Response(
                    {"detail": "This is not an online draft room."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if draft.status != "WAITING":
                return Response(
                    {"detail": "This draft is no longer accepting players."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if DraftParticipant.objects.filter(
                draft=draft,
                seat_number=2,
            ).exists():
                return Response(
                    {"detail": "This draft room is already full."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if display_name.casefold() == draft.player1_name.casefold():
                return Response(
                    {
                        "detail": (
                            "Choose a display name different from "
                            "the host's name."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            token = create_secret_token()

            participant = DraftParticipant.objects.create(
                draft=draft,
                seat_number=2,
                display_name=display_name,
                token_hash=hash_token(token),
            )

            draft.player2_name = display_name
            draft.save(update_fields=["player2_name"])

            response_data = participant_response(
                draft,
                participant,
                token=token,
            )

        return Response(
            response_data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================
# RECONNECT TO ONLINE DRAFT
# ============================================================

class ReconnectDraftAPIView(APIView):
    def post(self, request):
        token = str(
            request.data.get("participant_token", "") or ""
        ).strip()

        if not token:
            return Response(
                {"detail": "participant_token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant = (
            DraftParticipant.objects
            .select_related(
                "draft",
                "draft__player1_team",
                "draft__player2_team",
            )
            .filter(token_hash=hash_token(token))
            .first()
        )

        if participant is None:
            return Response(
                {"detail": "Invalid participant token."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        draft = participant.draft

        return Response({
            **participant_response(draft, participant),
            "draft_state": serialize_draft_state(draft),
        })


# ============================================================
# START DRAFT
# ============================================================

class StartDraftAPIView(APIView):
    def post(self, request, draft_id):
        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(),
                pk=draft_id,
            )

            if draft.status != "WAITING":
                return Response(
                    {"detail": "This draft cannot be started."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if participant is None:
                    return Response(
                        {"detail": "A valid participant token is required."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

                if participant.seat_number != 1:
                    return Response(
                        {"detail": "Only the host can start the draft."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if not DraftParticipant.objects.filter(
                    draft=draft,
                    seat_number=2,
                ).exists():
                    return Response(
                        {"detail": "Waiting for the second player to join."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if draft.player1_team_id is None or draft.player2_team_id is None:
                return Response(
                    {
                        "detail": (
                            "Both players must select a football club "
                            "before the draft can start."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if draft.player1_team_id == draft.player2_team_id:
                return Response(
                    {
                        "detail": (
                            "Each player must choose a different football club."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if (
                not draft.player1_team.is_active
                or not draft.player2_team.is_active
            ):
                return Response(
                    {"detail": "Both selected clubs must be available."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            for position in POSITION_SEQUENCE:
                available_count = Player.objects.filter(
                    position=position,
                    category=draft.category,
                ).count()

                if available_count < 2:
                    return Response(
                        {
                            "detail": (
                                f"At least two players are required "
                                f"for position {position} in this category."
                            ),
                            "position": position,
                            "available_count": available_count,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            draft.active_player_number = 1

            try:
                create_next_event(draft, 1)
            except ValueError as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            draft.status = "ACTIVE"
            draft.save(
                update_fields=["active_player_number", "status"]
            )

            response_data = serialize_draft_state(draft)

        return Response(response_data, status=status.HTTP_200_OK)


# ============================================================
# GET DRAFT STATE
# ============================================================

class DraftStateAPIView(APIView):
    def get(self, request, draft_id):
        draft = get_object_or_404(
            Draft.objects.select_related(
                "player1_team",
                "player2_team",
            ),
            pk=draft_id,
        )

        if draft.mode == "ONLINE":
            participant = get_token_participant(request, draft)

            if participant is None:
                return Response(
                    {"detail": "A valid participant token is required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        return Response(
            serialize_draft_state(draft),
            status=status.HTTP_200_OK,
        )


# ============================================================
# SUBMIT DRAFT PICK
# ============================================================

class SubmitDraftPickAPIView(APIView):
    def post(self, request, draft_id):
        selected_player_id = request.data.get("selected_player_id")

        if selected_player_id is None:
            return Response(
                {"detail": "selected_player_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(),
                pk=draft_id,
            )

            if draft.status != "ACTIVE":
                return Response(
                    {"detail": "This draft is not active."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if participant is None:
                    return Response(
                        {"detail": "A valid participant token is required."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

                player_number = participant.seat_number
            else:
                try:
                    player_number = int(request.data.get("player_number"))
                except (TypeError, ValueError):
                    return Response(
                        {
                            "detail": (
                                "player_number must be 1 or 2 "
                                "for local play."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if player_number not in (1, 2):
                    return Response(
                        {"detail": "player_number must be 1 or 2."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            event = (
                DraftEvent.objects
                .select_for_update()
                .filter(draft=draft)
                .order_by("-event_number")
                .first()
            )

            if event is None:
                return Response(
                    {"detail": "No pending draft event was found."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if DraftPick.objects.filter(
                draft=draft,
                event=event,
            ).exists():
                return Response(
                    {"detail": "This draft event has already been completed."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if event.active_player_number != player_number:
                return Response(
                    {"detail": "It is not your turn to pick."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            try:
                selected_player_id = int(selected_player_id)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "Invalid selected_player_id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            offered_ids = {
                event.offered_player1_id,
                event.offered_player2_id,
            }

            if selected_player_id not in offered_ids:
                return Response(
                    {
                        "detail": (
                            "The selected player must be one of "
                            "the two offered players."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            selected_player = (
                event.offered_player1
                if event.offered_player1_id == selected_player_id
                else event.offered_player2
            )

            unselected_player = (
                event.offered_player2
                if event.offered_player1_id == selected_player_id
                else event.offered_player1
            )

            other_player_number = 2 if player_number == 1 else 1

            DraftPick.objects.create(
                draft=draft,
                event=event,
                player=selected_player,
                assigned_to_number=player_number,
                was_selected=True,
            )

            DraftPick.objects.create(
                draft=draft,
                event=event,
                player=unselected_player,
                assigned_to_number=other_player_number,
                was_selected=False,
            )

            if event.event_number == SQUAD_SIZE:
                draft.status = "COMPLETED"
                update_fields = ["status"]

                draft.completed_at = timezone.now()
                update_fields.append("completed_at")

                draft.save(update_fields=update_fields)

            else:
                draft.active_player_number = other_player_number

                try:
                    create_next_event(draft, event.event_number + 1)
                except ValueError as exc:
                    transaction.set_rollback(True)
                    return Response(
                        {"detail": str(exc)},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                draft.save(update_fields=["active_player_number"])

            response_data = serialize_draft_state(draft)

        return Response(response_data, status=status.HTTP_200_OK)


# ============================================================
# MATCH SERIALIZATION
# ============================================================

def _serialize_match_player(player):
    if player is None:
        return None

    return {
        "id": player.id,
        "name": player.name,
        "club": getattr(player, "club", None),
        "country": getattr(player, "country", None),
        "position": getattr(player, "position", None),
        "category": getattr(player, "category", None),
        "image_url": getattr(player, "image_url", None),
    }


def _match_payload(match):
    draft = match.draft

    events = (
        match.events
        .select_related("player", "secondary_player")
        .order_by("minute", "event_number")
    )

    regular_score = {1: 0, 2: 0}
    penalty_score = {1: 0, 2: 0}

    # Per-team kick counters used by the penalty tracker on the
    # frontend. "setup" counts PENALTY_KICK events (shooter steps up),
    # "result" counts PENALTY_GOAL / PENALTY_SAVE / PENALTY_MISS.
    setup_counter = {1: 0, 2: 0}
    result_counter = {1: 0, 2: 0}

    serialized_events = []
    penalty_attempts = []

    for event in events:
        team_number = event.team_number

        if event.event_type == "GOAL" and team_number in (1, 2):
            regular_score[team_number] += 1

        if (
            event.event_type == "PENALTY_GOAL"
            and team_number in (1, 2)
        ):
            penalty_score[team_number] += 1

        is_penalty_attempt = event.event_type in PENALTY_EVENT_TYPES

        # 1-based number of this kick for the kicking team.
        kick_number = None

        if team_number in (1, 2):
            if event.event_type == PENALTY_KICK_SETUP_TYPE:
                setup_counter[team_number] += 1
                kick_number = setup_counter[team_number]

            elif is_penalty_attempt:
                result_counter[team_number] += 1
                kick_number = result_counter[team_number]

        if is_penalty_attempt:
            outcome = event.event_type.replace("PENALTY_", "")

            penalty_attempts.append({
                "round": event.penalty_round,
                "team_number": team_number,
                "kick_number": kick_number,
                "shooter": _serialize_match_player(event.player),
                "goalkeeper": _serialize_match_player(
                    event.secondary_player
                ),
                "outcome": outcome,
                "score": {
                    "1": penalty_score[1],
                    "2": penalty_score[2],
                },
                "sudden_death": event.is_sudden_death,
            })

        serialized_events.append({
            "id": event.id,
            "event_number": event.event_number,
            "minute": event.minute,
            "team_number": team_number,
            "event_type": event.event_type,
            "commentary": event.commentary,
            "player": _serialize_match_player(event.player),
            "secondary_player": _serialize_match_player(
                event.secondary_player
            ),
            "penalty_round": event.penalty_round,
            "penalty_kick_number": kick_number,
            "is_sudden_death": event.is_sudden_death,
            "score_after": {
                "player1": regular_score[1],
                "player2": regular_score[2],
                "penalties": {
                    "player1": penalty_score[1],
                    "player2": penalty_score[2],
                },
            },
        })

    penalty_shootout = None

    if match.penalties_played:
        rounds = [
            attempt["round"]
            for attempt in penalty_attempts
            if attempt["round"] is not None
        ]

        penalty_shootout = {
            "team1_score": match.player1_penalty_score,
            "team2_score": match.player2_penalty_score,
            "winner_number": match.winner_number,
            "total_rounds": max(rounds, default=0),
            "sudden_death": any(
                attempt["sudden_death"]
                for attempt in penalty_attempts
            ),
            "attempts": penalty_attempts,
        }

    team_statistics = list(
        match.team_statistics
        .order_by("team_number")
        .values(
            "team_number",
            "possession",
            "shots",
            "shots_on_target",
            "goals",
            "fouls",
            "corners",
            "yellow_cards",
            "red_cards",
            "penalty_goals",
            "penalty_misses",
        )
    )

    player_ratings = []

    for rating in (
        match.player_ratings
        .select_related("player")
        .order_by("team_number", "player__name")
    ):
        player_ratings.append({
            "player": _serialize_match_player(rating.player),
            "team_number": rating.team_number,
            "rating": float(rating.rating),
            "goals": rating.goals,
            "assists": rating.assists,
            "shots": rating.shots,
            "shots_on_target": rating.shots_on_target,
            "saves": rating.saves,
            "tackles": rating.tackles,
            "interceptions": rating.interceptions,
            "yellow_cards": rating.yellow_cards,
            "red_cards": rating.red_cards,
            "penalty_goals": rating.penalty_goals,
            "penalty_misses": rating.penalty_misses,
        })

    if match.winner_number == 1:
        winner_name = draft.player1_name
    elif match.winner_number == 2:
        winner_name = draft.player2_name
    else:
        winner_name = None

    return {
        "id": match.id,
        "match_id": match.id,
        "draft_id": match.draft_id,
        "status": "COMPLETED",
        "player1_name": draft.player1_name,
        "player2_name": draft.player2_name,
        **serialize_draft_teams(draft),

        # Regular-time plus extra-time score.
        "player1_score": match.player1_score,
        "player2_score": match.player2_score,

        # Penalty score is separate from the match score.
        "player1_penalty_score": match.player1_penalty_score,
        "player2_penalty_score": match.player2_penalty_score,
        "penalty_shootout": penalty_shootout,

        "winner_number": match.winner_number,
        "winner_name": winner_name,
        "is_draw": match.winner_number == 0,

        "duration_minutes": match.duration_minutes,
        "extra_time_played": match.extra_time_played,
        "penalties_played": match.penalties_played,

        "man_of_the_match": _serialize_match_player(
            match.man_of_the_match
        ),
        "created_at": match.created_at,
        "events": serialized_events,
        "team_statistics": team_statistics,
        "player_ratings": player_ratings,
    }


# ============================================================
# SIMULATE AND RETRIEVE MATCH
# ============================================================

class SimulateMatchAPIView(APIView):

    def get(self, request, draft_id):
        draft = get_object_or_404(
            Draft.objects.select_related(
                "player1_team",
                "player2_team",
            ),
            pk=draft_id,
        )

        if draft.mode == "ONLINE":
            participant = get_token_participant(request, draft)

            if participant is None:
                return Response(
                    {"detail": "A valid participant token is required."},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        match = (
            MatchResult.objects
            .filter(draft=draft)
            .select_related(
                "man_of_the_match",
                "draft",
                "draft__player1_team",
                "draft__player2_team",
            )
            .order_by("-created_at", "-id")
            .first()
        )

        if match is None:
            return Response(
                {"detail": "No match has been simulated for this draft."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            _match_payload(match),
            status=status.HTTP_200_OK,
        )

    def post(self, request, draft_id):
        idempotency_key = request.headers.get(
            "Idempotency-Key", ""
        ).strip()

        if len(idempotency_key) > 64:
            return Response(
                {"detail": "Idempotency-Key cannot exceed 64 characters."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(of=("self",)).select_related(
                    "player1_team",
                    "player2_team",
                ),
                pk=draft_id,
            )

            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if participant is None:
                    return Response(
                        {"detail": "A valid participant token is required."},
                        status=status.HTTP_401_UNAUTHORIZED,
                    )

                if participant.seat_number != 1:
                    return Response(
                        {"detail": "Only the host can start the match."},
                        status=status.HTTP_403_FORBIDDEN,
                    )

            if draft.status != "COMPLETED":
                return Response(
                    {
                        "detail": (
                            "Complete the draft before simulating a match."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if (
                draft.player1_team_id is None
                or draft.player2_team_id is None
                or draft.player1_team_id == draft.player2_team_id
            ):
                return Response(
                    {
                        "detail": (
                            "This draft must have two different selected "
                            "clubs before a match can be simulated."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if idempotency_key:
                existing_match = (
                    MatchResult.objects
                    .filter(
                        draft=draft,
                        idempotency_key=idempotency_key,
                    )
                    .select_related(
                        "man_of_the_match",
                        "draft",
                        "draft__player1_team",
                        "draft__player2_team",
                    )
                    .first()
                )

                if existing_match is not None:
                    return Response(
                        _match_payload(existing_match),
                        status=status.HTTP_200_OK,
                    )

            else:
                existing_match = (
                    MatchResult.objects
                    .filter(draft=draft)
                    .select_related(
                        "man_of_the_match",
                        "draft",
                        "draft__player1_team",
                        "draft__player2_team",
                    )
                    .order_by("-created_at", "-id")
                    .first()
                )

                if existing_match is not None:
                    return Response(
                        _match_payload(existing_match),
                        status=status.HTTP_200_OK,
                    )

            picks = (
                DraftPick.objects
                .filter(draft=draft)
                .select_related("player", "event")
                .order_by("event__event_number")
            )

            team1 = [
                pick.player for pick in picks
                if pick.assigned_to_number == 1
            ]

            team2 = [
                pick.player for pick in picks
                if pick.assigned_to_number == 2
            ]

            if len(team1) != SQUAD_SIZE or len(team2) != SQUAD_SIZE:
                return Response(
                    {
                        "detail": (
                            "Both teams must have exactly 11 players "
                            "before a match can be simulated."
                        ),
                        "team1_count": len(team1),
                        "team2_count": len(team2),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                result = simulate_match(team1, team2)
            except ValueError as exc:
                return Response(
                    {"detail": str(exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            penalty_shootout = result.get("penalty_shootout")

            extra_time_played = any(
                event["event_type"] == "EXTRA_TIME_START"
                for event in result["events"]
            )

            match = MatchResult.objects.create(
                draft=draft,
                player1_score=result["player1_score"],
                player2_score=result["player2_score"],
                player1_penalty_score=(
                    penalty_shootout["team1_score"]
                    if penalty_shootout
                    else None
                ),
                player2_penalty_score=(
                    penalty_shootout["team2_score"]
                    if penalty_shootout
                    else None
                ),
                winner_number=result["winner_number"],
                duration_minutes=120 if extra_time_played else 90,
                man_of_the_match=result["man_of_the_match"],
                idempotency_key=idempotency_key or None,
            )

            MatchEvent.objects.bulk_create([
                MatchEvent(
                    match=match,
                    event_number=event["event_number"],
                    minute=event["minute"],
                    team_number=event["team_number"],
                    player=event.get("player"),
                    secondary_player=event.get("secondary_player"),
                    event_type=event["event_type"],
                    commentary=event["commentary"],
                    penalty_round=event.get("penalty_round"),
                    is_sudden_death=event.get("is_sudden_death", False),
                )
                for event in result["events"]
            ])

            TeamMatchStatistics.objects.bulk_create([
                TeamMatchStatistics(
                    match=match,
                    team_number=stats["team_number"],
                    possession=stats["possession"],
                    shots=stats["shots"],
                    shots_on_target=stats["shots_on_target"],
                    goals=stats["goals"],
                    fouls=stats["fouls"],
                    corners=stats["corners"],
                    yellow_cards=stats["yellow_cards"],
                    red_cards=stats["red_cards"],
                    penalty_goals=stats.get("penalty_goals", 0),
                    penalty_misses=stats.get("penalty_misses", 0),
                )
                for stats in result["team_statistics"]
            ])

            PlayerMatchRating.objects.bulk_create([
                PlayerMatchRating(
                    match=match,
                    player=stats["player"],
                    team_number=stats["team_number"],
                    rating=stats["rating"],
                    goals=stats["goals"],
                    assists=stats["assists"],
                    shots=stats["shots"],
                    shots_on_target=stats["shots_on_target"],
                    saves=stats["saves"],
                    tackles=stats["tackles"],
                    interceptions=stats["interceptions"],
                    yellow_cards=stats["yellow_cards"],
                    red_cards=stats["red_cards"],
                    penalty_goals=stats.get("penalty_goals", 0),
                    penalty_misses=stats.get("penalty_misses", 0),
                )
                for stats in result["player_ratings"]
            ])

            match = (
                MatchResult.objects
                .select_related(
                    "man_of_the_match",
                    "draft",
                    "draft__player1_team",
                    "draft__player2_team",
                )
                .get(pk=match.pk)
            )

            response_data = _match_payload(match)

        return Response(
            response_data,
            status=status.HTTP_201_CREATED,
        )