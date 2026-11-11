from django.urls import path

from . import views

urlpatterns = [
    path("pools/", views.PoolsAPIView.as_view(), name="cards-pools"),
    path("create/", views.CreateGameAPIView.as_view(), name="cards-create"),
    path("join/", views.JoinGameAPIView.as_view(), name="cards-join"),
    path("<str:room_code>/state/", views.GameStateAPIView.as_view(), name="cards-state"),
    path("<str:room_code>/lock/", views.LockStatAPIView.as_view(), name="cards-lock"),
    path("<str:room_code>/reveal/", views.RevealAPIView.as_view(), name="cards-reveal"),
    path("<str:room_code>/continue/", views.ContinueAPIView.as_view(), name="cards-continue"),
    path("<str:room_code>/concede/", views.ConcedeAPIView.as_view(), name="cards-concede"),
]