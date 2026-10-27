from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/players/", include("players.urls")),
    path("api/drafts/", include("drafts.urls")),
]