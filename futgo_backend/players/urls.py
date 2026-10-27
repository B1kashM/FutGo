from django.urls import path
from .views import PlayerListCreateAPIView, PlayerDetailAPIView

urlpatterns = [
    path("", PlayerListCreateAPIView.as_view(), name="player-list-create"),
    path("<int:pk>/", PlayerDetailAPIView.as_view(), name="player-detail"),
]