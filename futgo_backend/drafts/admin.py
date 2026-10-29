from django.contrib import admin

from .models import (
    Draft,
    DraftEvent,
    DraftParticipant,
    DraftPick,
    MatchResult,
    MatchEvent,
    Team,
    TeamMatchStatistics,
    PlayerMatchRating,
)


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "short_name",
        "is_active",
        "created_at",
    )
    list_filter = ("is_active",)
    search_fields = ("name", "short_name")
    ordering = ("name",)


@admin.register(Draft)
class DraftAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "player1_name",
        "player2_name",
        "player1_team",
        "player2_team",
        "mode",
        "category",
        "status",
        "created_at",
    )
    list_filter = ("mode", "category", "status")
    search_fields = (
        "player1_name",
        "player2_name",
        "room_code",
        "player1_team__name",
        "player2_team__name",
    )
    readonly_fields = ("created_at", "completed_at")


@admin.register(DraftEvent)
class DraftEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "draft",
        "event_number",
        "active_player_number",
        "offered_player1",
        "offered_player2",
    )
    list_filter = ("active_player_number",)
    search_fields = (
        "draft__player1_name",
        "draft__player2_name",
        "offered_player1__name",
        "offered_player2__name",
    )
    ordering = ("draft", "event_number")


@admin.register(DraftParticipant)
class DraftParticipantAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "draft",
        "seat_number",
        "display_name",
    )
    list_filter = ("seat_number",)
    search_fields = ("display_name", "draft__room_code")


@admin.register(DraftPick)
class DraftPickAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "draft",
        "event",
        "player",
        "assigned_to_number",
        "was_selected",
    )
    list_filter = ("assigned_to_number", "was_selected")
    search_fields = ("player__name", "draft__player1_name", "draft__player2_name")
    ordering = ("draft", "event__event_number")


@admin.register(MatchResult)
class MatchResultAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "draft",
        "player1_score",
        "player2_score",
        "winner_number",
        "duration_minutes",
        "created_at",
    )
    list_filter = ("winner_number", "duration_minutes")
    search_fields = ("draft__player1_name", "draft__player2_name")
    readonly_fields = ("created_at",)


@admin.register(MatchEvent)
class MatchEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "match",
        "event_number",
        "minute",
        "team_number",
        "event_type",
        "player",
    )
    list_filter = ("event_type", "team_number")
    search_fields = ("commentary", "player__name", "secondary_player__name")
    ordering = ("match", "minute", "event_number")


@admin.register(TeamMatchStatistics)
class TeamMatchStatisticsAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "match",
        "team_number",
        "possession",
        "shots",
        "shots_on_target",
        "goals",
    )
    list_filter = ("team_number",)


@admin.register(PlayerMatchRating)
class PlayerMatchRatingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "match",
        "player",
        "team_number",
        "rating",
        "goals",
        "assists",
    )
    list_filter = ("team_number",)
    search_fields = ("player__name",)
