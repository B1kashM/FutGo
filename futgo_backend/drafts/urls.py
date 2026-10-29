from django.urls import path
from .views import CreateTeamAPIView

from .views import (
    CreateDraftAPIView,
    JoinDraftAPIView,
    ReconnectDraftAPIView,
    TeamListAPIView,
    SelectDraftTeamAPIView,
    StartDraftAPIView,
    DraftStateAPIView,
    SubmitDraftPickAPIView,
    SimulateMatchAPIView,
)

urlpatterns = [
    path("teams/", TeamListAPIView.as_view(), name="draft-teams"),
    path("create/", CreateDraftAPIView.as_view(), name="draft-create"),
    path("join/", JoinDraftAPIView.as_view(), name="draft-join"),
    path("reconnect/", ReconnectDraftAPIView.as_view(), name="draft-reconnect"),

    path(
        "<int:draft_id>/select-team/",
        SelectDraftTeamAPIView.as_view(),
        name="draft-select-team",
    ),
    path(
        "<int:draft_id>/start/",
        StartDraftAPIView.as_view(),
        name="draft-start",
    ),
    path(
        "<int:draft_id>/state/",
        DraftStateAPIView.as_view(),
        name="draft-state",
    ),
    path(
        "<int:draft_id>/pick/",
        SubmitDraftPickAPIView.as_view(),
        name="draft-pick",
    ),
    path(
        "<int:draft_id>/match/",
        SimulateMatchAPIView.as_view(),
        name="draft-match",
    ),
    path(
    "teams/create/",
    CreateTeamAPIView.as_view(),
    name="draft-team-create",
    ),
]

