from django.contrib import admin

from .models import (
    DraftOffer,
    PenaltyGame,
    PenaltyKick,
    PenaltyMatch,
    PenaltySeat,
    SquadSlot,
)


@admin.register(PenaltyGame)
class PenaltyGameAdmin(admin.ModelAdmin):
    list_display = ("room_code", "mode", "squad_mode", "status", "max_players", "round_number", "created_at")
    list_filter = ("mode", "status", "squad_mode")
    search_fields = ("room_code",)


@admin.register(PenaltySeat)
class PenaltySeatAdmin(admin.ModelAdmin):
    list_display = ("game", "seat", "name", "eliminated")


@admin.register(PenaltyMatch)
class PenaltyMatchAdmin(admin.ModelAdmin):
    list_display = ("game", "round_name", "match_number", "seat_a", "seat_b", "score_a", "score_b", "status", "winner_seat")
    list_filter = ("status", "round_name")


@admin.register(PenaltyKick)
class PenaltyKickAdmin(admin.ModelAdmin):
    list_display = ("match", "number", "seat", "shooter", "shot_zone", "dive_zone", "outcome")
    list_filter = ("outcome",)


admin.site.register(SquadSlot)
admin.site.register(DraftOffer)