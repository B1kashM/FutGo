import hashlib
import secrets

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from players.models import Player
from .models import Draft, DraftEvent, DraftParticipant, DraftPick
from .serializers import CreateDraftSerializer


# ============================================================
# CONSTANTS
# ============================================================

SQUAD_SIZE = 11

# The exact position required in each drafting round.
POSITION_SEQUENCE = [
    "GK",
    "RB",
    "RCB",
    "LCB",
    "LB",
    "DMF",
    "CMF",
    "AMF",
    "RWF",
    "ST",
    "LWF",
]


# ============================================================
# TOKEN AND ROOM HELPERS
# ============================================================

def hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_room_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def create_unique_room_code():
    while True:
        code = generate_room_code()
        if not Draft.objects.filter(room_code=code).exists():
            return code


def create_secret_token():
    return secrets.token_urlsafe(32)


def participant_response(draft, participant, raw_token):
    return {
        "message": "Connected successfully.",
        "draft_id": draft.id,
        "mode": draft.mode,
        "room_code": draft.room_code,
        "status": draft.status,
        "seat_number": participant.seat_number,
        "display_name": participant.display_name,
        "participant_token": raw_token,
    }


def get_token_participant(request, draft):
    """Authenticate an online participant using their secret token."""
    raw_token = request.headers.get(
        "X-Participant-Token", ""
    ).strip()

    if not raw_token:
        return None

    return DraftParticipant.objects.filter(
        draft=draft,
        token_hash=hash_token(raw_token),
    ).first()


# ============================================================
# CREATE DRAFT
# ============================================================

class CreateDraftAPIView(APIView):
    def post(self, request):
        serializer = CreateDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        mode = data["mode"]

        with transaction.atomic():
            if mode == "LOCAL":
                draft = Draft.objects.create(
                    mode="LOCAL",
                    room_code=None,
                    player1_name=data["player1_name"],
                    player2_name=data["player2_name"],
                    active_player_number=1,
                    status="WAITING",
                )

                return Response(
                    {
                        "message": "Local draft created.",
                        "draft_id": draft.id,
                        "mode": draft.mode,
                        "status": draft.status,
                        "player1_name": draft.player1_name,
                        "player2_name": draft.player2_name,
                        "active_player_number": (
                            draft.active_player_number
                        ),
                    },
                    status=status.HTTP_201_CREATED,
                )

            room_code = create_unique_room_code()
            raw_token = create_secret_token()

            draft = Draft.objects.create(
                mode="ONLINE",
                room_code=room_code,
                player1_name=data["player1_name"],
                player2_name="",
                active_player_number=1,
                status="WAITING",
            )

            participant = DraftParticipant.objects.create(
                draft=draft,
                seat_number=1,
                display_name=data["player1_name"],
                token_hash=hash_token(raw_token),
            )

        response_data = participant_response(
            draft, participant, raw_token
        )
        response_data["message"] = (
            "Online room created. Share the room code with your friend."
        )

        return Response(
            response_data,
            status=status.HTTP_201_CREATED,
        )


# ============================================================
# JOIN ONLINE DRAFT
# ============================================================

class JoinDraftAPIView(APIView):
    def post(self, request):
        room_code = str(
            request.data.get("room_code", "")
        ).strip().upper()

        display_name = str(
            request.data.get("display_name", "")
        ).strip()

        if not room_code or not display_name:
            return Response(
                {
                    "error": (
                        "Room code and display name are required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(display_name) > 50:
            return Response(
                {
                    "error": (
                        "Display name must be 50 characters or fewer."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(),
                room_code=room_code,
            )

            if draft.mode != "ONLINE" or draft.status != "WAITING":
                return Response(
                    {
                        "error": (
                            "This room is no longer accepting players."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if DraftParticipant.objects.filter(
                draft=draft,
                seat_number=2,
            ).exists():
                return Response(
                    {"error": "This room is already full."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if display_name.casefold() == draft.player1_name.casefold():
                return Response(
                    {
                        "error": (
                            "Choose a different name from Player 1."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            raw_token = create_secret_token()

            participant = DraftParticipant.objects.create(
                draft=draft,
                seat_number=2,
                display_name=display_name,
                token_hash=hash_token(raw_token),
            )

            draft.player2_name = display_name
            draft.save(update_fields=["player2_name"])

        return Response(
            participant_response(draft, participant, raw_token),
            status=status.HTTP_201_CREATED,
        )


# ============================================================
# RECONNECT TO ONLINE DRAFT
# ============================================================

class ReconnectDraftAPIView(APIView):
    def post(self, request):
        raw_token = str(
            request.data.get("participant_token", "")
        ).strip()

        if not raw_token:
            return Response(
                {"error": "Participant token is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant = get_object_or_404(
            DraftParticipant.objects.select_related("draft"),
            token_hash=hash_token(raw_token),
        )

        draft = participant.draft

        return Response(
            {
                "message": "Reconnected successfully.",
                "draft_id": draft.id,
                "mode": draft.mode,
                "room_code": draft.room_code,
                "status": draft.status,
                "seat_number": participant.seat_number,
                "display_name": participant.display_name,
                "player1_name": draft.player1_name,
                "player2_name": draft.player2_name,
                "active_player_number": draft.active_player_number,
            },
            status=status.HTTP_200_OK,
        )


# ============================================================
# POSITION-BASED EVENT CREATION
# ============================================================

def create_next_event(draft, event_number):
    """
    Create a round offering two unused players of the exact
    position assigned to this round.
    """
    if not 1 <= event_number <= SQUAD_SIZE:
        return None

    required_position = POSITION_SEQUENCE[event_number - 1]

    available_players = list(
        Player.objects
        .filter(position=required_position)
        .exclude(draft_picks__draft=draft)
        .distinct()
        .order_by("?")[:2]
    )

    # Both participants must receive a player for this position.
    if len(available_players) != 2:
        return None

    return DraftEvent.objects.create(
        draft=draft,
        event_number=event_number,
        active_player_number=draft.active_player_number,
        offered_player1=available_players[0],
        offered_player2=available_players[1],
    )


# ============================================================
# SERIALIZATION HELPERS
# ============================================================

def serialize_event(event):
    if event is None:
        return None

    def serialize_player(player):
        return {
            "id": player.id,
            "name": player.name,
            "club": player.club,
            "country": player.country,
            "position": player.position,
            "category": player.category,
            "image_url": player.image_url,
        }

    return {
        "event_number": event.event_number,
        "active_player_number": event.active_player_number,
        "required_position": POSITION_SEQUENCE[
            event.event_number - 1
        ],
        "offered_players": [
            serialize_player(event.offered_player1),
            serialize_player(event.offered_player2),
        ],
    }


def serialize_draft_state(draft):
    current_event = (
        DraftEvent.objects
        .filter(
            draft=draft,
            selected_player__isnull=True,
        )
        .order_by("-event_number")
        .first()
    )

    picks = (
        DraftPick.objects
        .filter(draft=draft)
        .select_related("player", "event")
        .order_by("event__event_number")
    )

    squads = {
        1: [],
        2: [],
    }

    for pick in picks:
        squads[pick.assigned_to_number].append({
            "player_id": pick.player_id,
            "name": pick.player.name,
            "club": pick.player.club,
            "country": pick.player.country,
            "position": pick.player.position,
            "category": pick.player.category,
            "image_url": pick.player.image_url,
            "was_selected": pick.was_selected,
            "event_number": pick.event.event_number,
        })

    return {
        "draft_id": draft.id,
        "mode": draft.mode,
        "room_code": draft.room_code,
        "status": draft.status,
        "player1_name": draft.player1_name,
        "player2_name": draft.player2_name,
        "active_player_number": draft.active_player_number,
        "squad_size": SQUAD_SIZE,
        "position_sequence": POSITION_SEQUENCE,
        "squads": {
            "player1": squads[1],
            "player2": squads[2],
        },
        "current_event": serialize_event(current_event),
        "completed_at": draft.completed_at,
    }


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
                    {
                        "error": (
                            "This draft has already been started "
                            "or completed."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Only the host can start an online draft.
            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if (
                    participant is None
                    or participant.seat_number != 1
                ):
                    return Response(
                        {
                            "error": (
                                "Only the host can start this draft."
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                if not DraftParticipant.objects.filter(
                    draft=draft,
                    seat_number=2,
                ).exists():
                    return Response(
                        {
                            "error": (
                                "Your friend must join before "
                                "the draft starts."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            # Validate that at least two unused players exist
            # for every position required by the starting XI.
            position_counts = {}

            for position in POSITION_SEQUENCE:
                position_counts[position] = (
                    Player.objects
                    .filter(position=position)
                    .exclude(draft_picks__draft=draft)
                    .distinct()
                    .count()
                )

            missing_positions = [
                position
                for position, count in position_counts.items()
                if count < 2
            ]

            if missing_positions:
                return Response(
                    {
                        "error": (
                            "At least two available footballers are "
                            "required for every starting position."
                        ),
                        "positions_needing_players": missing_positions,
                        "available_players_by_position": position_counts,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Create the first event before activating the draft.
            draft.active_player_number = 1

            first_event = create_next_event(
                draft,
                event_number=1,
            )

            if first_event is None:
                return Response(
                    {
                        "error": (
                            "Could not create the first round. "
                            "Please verify the available player data."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            draft.status = "ACTIVE"
            draft.save(update_fields=[
                "active_player_number",
                "status",
            ])

        return Response(
            serialize_draft_state(draft),
            status=status.HTTP_200_OK,
        )


# ============================================================
# GET DRAFT STATE
# ============================================================

class DraftStateAPIView(APIView):
    def get(self, request, draft_id):
        draft = get_object_or_404(Draft, pk=draft_id)

        if draft.mode == "ONLINE":
            participant = get_token_participant(request, draft)

            if participant is None:
                return Response(
                    {
                        "error": (
                            "A valid participant token is required."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

        return Response(
            serialize_draft_state(draft),
            status=status.HTTP_200_OK,
        )


# ============================================================
# SUBMIT A DRAFT PICK
# ============================================================

class SubmitDraftPickAPIView(APIView):
    def post(self, request, draft_id):
        selected_player_id = request.data.get("selected_player_id")

        if selected_player_id is None:
            return Response(
                {"error": "selected_player_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            selected_player_id = int(selected_player_id)
        except (TypeError, ValueError):
            return Response(
                {
                    "error": (
                        "selected_player_id must be a valid integer."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            draft = get_object_or_404(
                Draft.objects.select_for_update(),
                pk=draft_id,
            )

            if draft.status != "ACTIVE":
                return Response(
                    {"error": "This draft is not active."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            event = (
                DraftEvent.objects
                .select_for_update()
                .filter(
                    draft=draft,
                    selected_player__isnull=True,
                )
                .order_by("-event_number")
                .first()
            )

            if event is None:
                return Response(
                    {"error": "There is no pending selection."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Authenticate the participant or determine the local seat.
            if draft.mode == "ONLINE":
                participant = get_token_participant(request, draft)

                if participant is None:
                    return Response(
                        {
                            "error": (
                                "A valid participant token is required."
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

                submitted_seat = participant.seat_number

            else:
                try:
                    submitted_seat = int(
                        request.data.get("player_number")
                    )
                except (TypeError, ValueError):
                    return Response(
                        {
                            "error": (
                                "player_number must be 1 or 2 "
                                "for Local Play."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                if submitted_seat not in (1, 2):
                    return Response(
                        {"error": "player_number must be 1 or 2."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            if submitted_seat != event.active_player_number:
                return Response(
                    {"error": "It is not your turn."},
                    status=status.HTTP_403_FORBIDDEN,
                )

            offered_ids = {
                event.offered_player1_id,
                event.offered_player2_id,
            }

            if selected_player_id not in offered_ids:
                return Response(
                    {
                        "error": (
                            "Choose one of the two offered footballers."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            selected_player = (
                event.offered_player1
                if selected_player_id == event.offered_player1_id
                else event.offered_player2
            )

            unselected_player = (
                event.offered_player2
                if selected_player_id == event.offered_player1_id
                else event.offered_player1
            )

            # The other participant receives the unselected player.
            opponent_seat = 2 if submitted_seat == 1 else 1

            # Store the selection.
            event.selected_player = selected_player
            event.save(update_fields=["selected_player"])

            # Selected player goes to the active participant.
            DraftPick.objects.create(
                draft=draft,
                event=event,
                player=selected_player,
                assigned_to_number=submitted_seat,
                was_selected=True,
            )

            # Unselected player goes to the opponent.
            DraftPick.objects.create(
                draft=draft,
                event=event,
                player=unselected_player,
                assigned_to_number=opponent_seat,
                was_selected=False,
            )

            if event.event_number >= SQUAD_SIZE:
                draft.status = "COMPLETED"
                draft.completed_at = timezone.now()
                draft.save(update_fields=[
                    "status",
                    "completed_at",
                ])

            else:
                # Alternate turns and create the next position round.
                next_event_number = event.event_number + 1
                draft.active_player_number = opponent_seat

                next_event = create_next_event(
                    draft,
                    event_number=next_event_number,
                )

                # Roll back this pick if a later round cannot be created.
                if next_event is None:
                    return Response(
                        {
                            "error": (
                                "Could not create the next round. "
                                "Please verify player positions and "
                                "available players."
                            )
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                draft.save(update_fields=["active_player_number"])

        return Response(
            serialize_draft_state(draft),
            status=status.HTTP_200_OK,
        )