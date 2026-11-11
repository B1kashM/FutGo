from django.contrib import admin

from players.models import STAT_FIELDS, PlayerStats


@admin.register(PlayerStats)
class PlayerStatsAdmin(admin.ModelAdmin):
    list_display = ("player", "position", "ovr", *STAT_FIELDS, "is_custom")
    list_filter = ("player__category", "player__position", "is_custom")
    search_fields = ("player__name",)
    list_select_related = ("player",)

    @admin.display(description="Pos", ordering="player__position")
    def position(self, obj):
        return obj.player.position

    @admin.display(description="OVR", ordering="player__ovr_rating")
    def ovr(self, obj):
        return obj.player.ovr_rating

    def save_model(self, request, obj, form, change):
        edited_stat = any(f in form.changed_data for f in STAT_FIELDS)
        if change and edited_stat and "is_custom" not in form.changed_data:
            obj.is_custom = True
        super().save_model(request, obj, form, change)