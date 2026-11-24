from django.urls import path

from . import views

urlpatterns = [
    path("pools/", views.pools),
    path("games/", views.create_game),
    path("games/<str:room_code>/join/", views.join_game),
    path("games/<str:room_code>/", views.game_state),
    path("games/<str:room_code>/pick/", views.pick),
    path("games/<str:room_code>/shoot/", views.shoot),
    path("games/<str:room_code>/dive/", views.dive),
    path("games/<str:room_code>/concede/", views.concede),
]