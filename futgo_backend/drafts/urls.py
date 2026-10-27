
from django.urls import path

from .views import (
    CreateDraftAPIView,
    JoinDraftAPIView,
    ReconnectDraftAPIView,
    StartDraftAPIView,
    DraftStateAPIView,
    SubmitDraftPickAPIView,
)

urlpatterns = [
    path("create/", CreateDraftAPIView.as_view(), name="draft-create"),
    path("join/", JoinDraftAPIView.as_view(), name="draft-join"),
    path("reconnect/", ReconnectDraftAPIView.as_view(), name="draft-reconnect"),

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
]