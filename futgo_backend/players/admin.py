from django.contrib import admin
from .models import Player


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "club",
        "position",
        "ovr_rating",
        "category",
    )

    list_filter = (
        "position",
        "category",
        "club",
    )

    search_fields = (
        "name",
        "club",
        "country",
    )

    ordering = ("name",)

    list_editable = ("ovr_rating",)