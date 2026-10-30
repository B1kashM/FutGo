"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crown,
  Flag,
  Footprints,
  Goal,
  LoaderCircle,
  Medal,
  Play,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  Timer,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";
import {
  DRAFT_CATEGORIES,
  EXTRA_TIME_END,
  FORMATION,
  REGULAR_TIME_END,
  assignToFormation,
  formatEventType,
  formatRating,
  getMatchEndMinute,
  getMatchStatusLabel,
  getPlayerName,
  getTeamName,
  getWinnerName,
  isExtraTimeBreakType,
  isExtraTimeStartType,
  isFullTimeType,
  isHalfTimeType,
  safeNumber,
  squadPlayers,
} from "./draftShared";
import type {
  CategoryValue,
  DraftState,
  MatchResult,
  Player,
  PlayerRating,
  Team,
} from "./draftShared";

/* ================================================================== */
/* Page shell                                                          */
/* ================================================================== */

export function DraftPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between border-b border-border pb-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-black text-accent-ink">
              F
            </div>

            <div>
              <div className="text-lg font-black tracking-[0.16em]">FUTGO</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">
                Build your legacy
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/"
              className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent-text/50 hover:text-foreground"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Back home</span>
              <span className="sm:hidden">Home</span>
            </Link>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}

/* ================================================================== */
/* Category picker                                                     */
/* ================================================================== */

export function CategoryGrid({
  value,
  onChange,
  disabled = false,
}: {
  value: CategoryValue | "";
  onChange: (value: CategoryValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {DRAFT_CATEGORIES.map((category) => {
        const isSelected = value === category.value;
        return (
          <button
            key={category.value}
            type="button"
            aria-pressed={isSelected}
            disabled={disabled}
            onClick={() => onChange(category.value)}
            className={`relative flex min-h-[82px] items-center gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
              isSelected
                ? "border-accent-text/80 bg-accent/[0.09] shadow-[0_0_22px_rgba(185,243,107,0.06)]"
                : "border-border bg-background/70 hover:border-foreground/25 hover:bg-foreground/[0.03]"
            } disabled:opacity-60`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-2xl">
              {category.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span
                className={`block text-sm font-bold leading-tight ${isSelected ? "text-accent-text" : "text-foreground/85"}`}
              >
                {category.label}
              </span>
              <span className="mt-1 block text-[10px] leading-4 text-muted sm:text-xs hidden sm:block">
                {category.description}
              </span>
            </span>
            {isSelected && (
              <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Drafting view (shared by Local and Online)                          */
/* ================================================================== */

export function DraftingView({
  draft,
  modeLabel,
  categoryLabel,
  loading,
  error,
  onPick,
  onRefresh,
  canPick = true,
  headline = "MAKE YOUR PICK.",
  subline = "Choose one player. The other joins your rival's squad.",
  promptLabel,
  footerNote = "Picks saved to your draft",
  mySeat = null,
}: {
  draft: DraftState;
  modeLabel: string;
  categoryLabel: string;
  loading: boolean;
  error: string;
  onPick: (player: Player) => void;
  onRefresh: () => void;
  canPick?: boolean;
  headline?: string;
  subline?: string;
  promptLabel?: string;
  footerNote?: string;
  mySeat?: number | null;
}) {
  const player1Squad = useMemo(
    () => squadPlayers(draft.squads?.player1),
    [draft],
  );
  const player2Squad = useMemo(
    () => squadPlayers(draft.squads?.player2),
    [draft],
  );

  const activePlayer = draft.current_event?.active_player_number ?? 1;
  const currentName =
    activePlayer === 1 ? draft.player1_name : draft.player2_name;
  const round = draft.current_event?.event_number ?? 11;
  const offered = draft.current_event?.offered_players ?? [];

  const seatName = (seat: number, name: string) =>
    mySeat === seat ? `${name} (You)` : name;

  return (
    <section className="py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
            <Zap size={15} />
            {modeLabel} · Round {round} of 11
          </div>
          <h1 className="text-3xl font-black sm:text-5xl">{headline}</h1>
          <p className="mt-3 text-sm text-muted sm:text-base">{subline}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-foreground/[0.03] px-3 py-1.5 text-xs text-muted">
            <Trophy size={13} className="text-accent-text" />
            {categoryLabel}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-foreground/10 sm:block">
            <div
              className="h-full rounded-full bg-accent-text transition-all duration-500"
              style={{ width: `${(round / 11) * 100}%` }}
            />
          </div>
          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3">
            <div className="text-xs text-muted">Current manager</div>
            <div className="mt-1 font-bold text-accent-text">{currentName}</div>
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted">
          <Sparkles size={14} className="text-accent-text" />
          {promptLabel ?? `${currentName}, choose your footballer`}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {offered.map((player, index) => (
          <button
            key={player.id}
            type="button"
            disabled={loading || !canPick}
            onClick={() => onPick(player)}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-surface p-3 text-left transition sm:rounded-3xl sm:p-7 ${
              canPick
                ? "hover:-translate-y-1 hover:border-accent-text/60 hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
                : "cursor-not-allowed opacity-70"
            }`}
          >
            <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-accent/[0.04] blur-3xl transition group-hover:bg-accent/10" />
            <div className="relative flex items-start justify-between gap-2 sm:gap-4">
              <span className="rounded-full border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.16em]">
                <span className="hidden sm:inline">Option </span>
                {index + 1}
              </span>
              <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent-text sm:px-3 sm:py-1.5 sm:text-xs">
                {player.position}
              </span>
            </div>
            <div className="relative mt-4 flex flex-col items-start gap-3 sm:mt-7 sm:min-h-28 sm:flex-row sm:items-center sm:gap-5">
              <PlayerAvatar
                player={player}
                className="h-16 w-16 rounded-xl text-xl sm:h-24 sm:w-24 sm:rounded-2xl sm:text-3xl"
              />
              <div className="min-w-0">
                <h2 className="break-words text-base font-black leading-tight sm:text-3xl">
                  {player.name}
                </h2>
                <p className="mt-1 text-[11px] leading-4 text-muted sm:mt-2 sm:text-sm">
                  {[player.club, player.country].filter(Boolean).join(" · ") ||
                    "Football star"}
                </p>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between border-t border-border pt-3 sm:mt-7 sm:pt-4">
              {canPick ? (
                <>
                  <span className="text-xs font-bold text-muted transition group-hover:text-accent-text sm:text-sm">
                    Draft<span className="hidden sm:inline"> this player</span>
                  </span>
                  {loading ? (
                    <LoaderCircle size={19} className="animate-spin text-accent-text" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/5 transition group-hover:bg-accent group-hover:text-accent-ink sm:h-9 sm:w-9">
                      <ChevronRight size={17} />
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="truncate text-xs font-bold text-muted sm:text-sm">
                    Waiting for {currentName}
                  </span>
                  <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-text" />
                </>
              )}
            </div>
          </button>
        ))}
      </div>

      {offered.length === 0 && (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-muted">No player options were returned for this round.</p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-60"
          >
            Refresh draft
          </button>
        </div>
      )}

      {error && (
        <div className="mt-5">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="mb-5 mt-10 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
          Squads
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch
          name={seatName(1, draft.player1_name)}
          team={draft.player1_team}
          number={1}
          players={player1Squad}
          active={activePlayer === 1}
        />
        <SquadPitch
          name={seatName(2, draft.player2_name)}
          team={draft.player2_team}
          number={2}
          players={player2Squad}
          active={activePlayer === 2}
        />
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-border pt-5 text-xs text-muted">
        <span>{player1Squad.length + player2Squad.length} / 22 players drafted</span>
        <span className="flex items-center gap-2">
          <Check size={14} className="text-accent-text" />
          {footerNote}
        </span>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Draft complete view                                                 */
/* ================================================================== */

export function DraftCompleteView({
  draft,
  categoryLabel,
  loading,
  error,
  onStartMatch,
  onReset,
  resetLabel = "Play another draft",
  canStartMatch = true,
  waitingText,
  mySeat = null,
}: {
  draft: DraftState;
  categoryLabel: string;
  loading: boolean;
  error: string;
  onStartMatch: () => void;
  onReset: () => void;
  resetLabel?: string;
  canStartMatch?: boolean;
  waitingText?: string;
  mySeat?: number | null;
}) {
  const player1Squad = useMemo(
    () => squadPlayers(draft.squads?.player1),
    [draft],
  );
  const player2Squad = useMemo(
    () => squadPlayers(draft.squads?.player2),
    [draft],
  );

  const seatName = (seat: number, name: string) =>
    mySeat === seat ? `${name} (You)` : name;

  return (
    <section className="mx-auto max-w-6xl py-12 sm:py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
          <Crown size={32} />
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-text">
          Draft complete
        </p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">SQUADS LOCKED.</h1>
        <p className="mt-4 text-muted">
          {draft.player1_name} and {draft.player2_name} have drafted their teams.
          Ready to see who wins on the pitch?
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.06] px-4 py-2 text-sm font-semibold text-accent-text">
          <Trophy size={15} />
          {categoryLabel}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch
          name={seatName(1, draft.player1_name)}
          team={draft.player1_team}
          number={1}
          players={player1Squad}
          complete
        />
        <SquadPitch
          name={seatName(2, draft.player2_name)}
          team={draft.player2_team}
          number={2}
          players={player2Squad}
          complete
        />
      </div>

      {error && (
        <div className="mx-auto mt-6 max-w-2xl">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {canStartMatch ? (
          <button
            onClick={onStartMatch}
            disabled={loading || player1Squad.length !== 11 || player2Squad.length !== 11}
            className="flex min-w-48 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <LoaderCircle size={19} className="animate-spin" />
                Preparing match...
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" />
                Start Match
                <ArrowRight size={18} />
              </>
            )}
          </button>
        ) : (
          <div className="flex min-w-48 items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-6 py-4 text-sm font-bold text-accent-text">
            <LoaderCircle size={17} className="animate-spin" />
            {waitingText || "Waiting for the host to start the match..."}
          </div>
        )}
        <button
          onClick={onReset}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-border px-6 py-3 font-semibold text-foreground/75 transition hover:bg-foreground/5 disabled:opacity-50"
        >
          <RotateCcw size={17} />
          {resetLabel}
        </button>
        <Link
          href="/"
          className="rounded-xl border border-border px-6 py-3 font-semibold text-foreground/75 transition hover:bg-foreground/5"
        >
          Back home
        </Link>
      </div>

      {(player1Squad.length !== 11 || player2Squad.length !== 11) && (
        <p className="mt-4 text-center text-xs text-amber-600 dark:text-amber-300">
          Both squads must have 11 players before the match can start.
        </p>
      )}
    </section>
  );
}

/* ================================================================== */
/* Match centre view                                                   */
/* ================================================================== */

export function MatchCentreView({
  matchData,
  draft,
  matchMinute,
  matchFinished,
  matchHistory,
  loading,
  error,
  onWatchAgain,
  onRematch,
  onReset,
  onShowPrevious,
  resetLabel = "Draft new teams",
  canControl = true,
  controlNote,
  mySeat = null,
}: {
  matchData: MatchResult;
  draft: DraftState;
  matchMinute: number;
  matchFinished: boolean;
  matchHistory: MatchResult[];
  loading: boolean;
  error: string;
  onWatchAgain: () => void;
  onRematch: () => void;
  onReset: () => void;
  onShowPrevious: (match: MatchResult) => void;
  resetLabel?: string;
  canControl?: boolean;
  controlNote?: string;
  mySeat?: number | null;
}) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const stickToEndRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  const player1Squad = useMemo(
    () => squadPlayers(draft.squads?.player1),
    [draft],
  );
  const player2Squad = useMemo(
    () => squadPlayers(draft.squads?.player2),
    [draft],
  );

  const matchEvents = matchData.events ?? [];

  const matchEndMinute = useMemo(() => getMatchEndMinute(matchData), [matchData]);
  const extraTimePlayed = matchEndMinute > REGULAR_TIME_END;

  const progressEndMinute = matchFinished
    ? matchEndMinute
    : extraTimePlayed && matchMinute >= REGULAR_TIME_END
      ? EXTRA_TIME_END
      : REGULAR_TIME_END;

  const visibleEvents = useMemo(
    () =>
      matchEvents
        .filter(
          (event) => matchFinished || safeNumber(event.minute) <= matchMinute,
        )
        .sort(
          (a, b) =>
            safeNumber(a.minute) - safeNumber(b.minute) ||
            safeNumber(a.event_number) - safeNumber(b.event_number),
        ),
    [matchEvents, matchMinute, matchFinished],
  );

  const liveBoard = useMemo(() => {
    let score1 = 0;
    let score2 = 0;
    const scoreAfter: string[] = [];
    const scorers1: { name: string; minute: number }[] = [];
    const scorers2: { name: string; minute: number }[] = [];

    visibleEvents.forEach((event) => {
      if ((event.event_type || "").toUpperCase() === "GOAL") {
        const team = safeNumber(event.team_number);
        const scorer = {
          name: getPlayerName(event.player) || "Goal",
          minute: safeNumber(event.minute),
        };

        if (team === 1) {
          score1 += 1;
          scorers1.push(scorer);
        } else if (team === 2) {
          score2 += 1;
          scorers2.push(scorer);
        }
      }

      scoreAfter.push(`${score1}–${score2}`);
    });

    return { score1, score2, scoreAfter, scorers1, scorers2 };
  }, [visibleEvents]);

  const liveScore1 = matchFinished
    ? safeNumber(matchData.player1_score)
    : liveBoard.score1;

  const liveScore2 = matchFinished
    ? safeNumber(matchData.player2_score)
    : liveBoard.score2;

  const team1Stats = useMemo(
    () => matchData.team_statistics?.find((item) => item.team_number === 1),
    [matchData],
  );

  const team2Stats = useMemo(
    () => matchData.team_statistics?.find((item) => item.team_number === 2),
    [matchData],
  );

  const ratings = useMemo(
    () =>
      [...(matchData.player_ratings ?? [])].sort(
        (a, b) => safeNumber(b.rating) - safeNumber(a.rating),
      ),
    [matchData],
  );

  const team1Ratings = ratings.filter((item) => item.team_number === 1);
  const team2Ratings = ratings.filter((item) => item.team_number === 2);

  const motm = matchData.man_of_the_match ?? null;
  const motmName = getPlayerName(motm);

  const handleTimelineScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;

    const el = timelineRef.current;
    if (!el) return;

    const distanceFromEnd = el.scrollWidth - el.clientWidth - el.scrollLeft;
    stickToEndRef.current = distanceFromEnd < 48;
  }, []);

  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return undefined;

    if (visibleEvents.length === 0) {
      stickToEndRef.current = true;
      programmaticScrollRef.current = false;
      el.scrollLeft = 0;
      return undefined;
    }

    if (!stickToEndRef.current) {
      programmaticScrollRef.current = false;
      return undefined;
    }

    programmaticScrollRef.current = true;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });

    const timeout = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [visibleEvents.length, matchData.match_id]);

  const team1 = matchData.player1_team || draft.player1_team;
  const team2 = matchData.player2_team || draft.player2_team;

  return (
    <section className="mx-auto max-w-7xl py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-text">
            <Activity size={15} />
            FutGo match centre
          </div>
          <h1 className="text-3xl font-black sm:text-5xl">
            {matchFinished ? "FULL TIME." : "THE SHOWDOWN."}
          </h1>
          <p className="mt-3 text-sm text-muted">
            {matchFinished
              ? "The final whistle has blown. Explore the match report below."
              : "Follow every major moment as your drafted teams battle it out."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={onWatchAgain}
            disabled={loading || !matchFinished}
            className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground/70 transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw size={16} />
            Watch again
          </button>
          {canControl && (
            <button
              onClick={onRematch}
              disabled={loading || !matchFinished}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? (
                <LoaderCircle size={17} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Rematch
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-6">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-5 sm:p-10">
        <div className="absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <div className="min-w-0 text-center">
            <TeamBadge team={team1} compact />
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">
              {matchData.player1_name || draft.player1_name || "Player 1"}
              {mySeat === 1 && <span className="text-muted"> (You)</span>}
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted sm:text-xs">
              {getTeamName(team1) || "Home team"}
            </p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-5">
              <span className="text-4xl font-black tabular-nums sm:text-7xl">
                {liveScore1}
              </span>
              <span className="text-xl font-bold text-muted sm:text-4xl">–</span>
              <span className="text-4xl font-black tabular-nums sm:text-7xl">
                {liveScore2}
              </span>
            </div>
            <div
              className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${
                matchFinished
                  ? "bg-accent/10 text-accent-text"
                  : "bg-foreground/[0.06] text-muted"
              }`}
            >
              {!matchFinished && (
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
              )}
              {getMatchStatusLabel(matchMinute, matchFinished, extraTimePlayed)}
            </div>
          </div>

          <div className="min-w-0 text-center">
            <TeamBadge team={team2} compact />
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">
              {matchData.player2_name || draft.player2_name || "Player 2"}
              {mySeat === 2 && <span className="text-muted"> (You)</span>}
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted sm:text-xs">
              {getTeamName(team2) || "Away team"}
            </p>
          </div>
        </div>

        {(liveBoard.scorers1.length > 0 || liveBoard.scorers2.length > 0) && (
          <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-border pt-4 sm:gap-8">
            <ul className="space-y-1 text-right">
              {liveBoard.scorers1.map((goal, index) => (
                <li key={`home-goal-${index}`} className="text-xs text-foreground/70 sm:text-sm">
                  <span className="font-bold text-foreground/85">{goal.name}</span>{" "}
                  <span className="font-black tabular-nums text-accent-text">
                    {goal.minute}&apos;
                  </span>
                </li>
              ))}
            </ul>
            <Goal size={16} className="mt-0.5 text-accent-text" />
            <ul className="space-y-1 text-left">
              {liveBoard.scorers2.map((goal, index) => (
                <li key={`away-goal-${index}`} className="text-xs text-foreground/70 sm:text-sm">
                  <span className="font-black tabular-nums text-accent-text">
                    {goal.minute}&apos;
                  </span>{" "}
                  <span className="font-bold text-foreground/85">{goal.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="relative mt-8">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-2">
              <Clock3 size={14} />
              {matchFinished ? "Match completed" : "Match clock"}
            </span>
            <span className="font-bold tabular-nums text-accent-text">
              {matchFinished ? `${matchMinute}' / ${matchEndMinute}'` : `${matchMinute}'`}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-accent-text transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, (matchMinute / progressEndMinute) * 100))}%`,
              }}
            />
          </div>
          {!matchFinished ? null : extraTimePlayed ? (
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-muted">
              <span>Kick-off</span>
              <span>45&apos; HT</span>
              <span>90&apos; ET starts</span>
              <span>105&apos; ET break</span>
              <span>120&apos; FT</span>
            </div>
          ) : (
            <div className="mt-2 flex justify-between text-[10px] text-muted">
              <span>Kick-off</span>
              <span>45&apos; HT</span>
              <span>90&apos; FT</span>
            </div>
          )}
        </div>
      </div>

      {matchFinished && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent-text">
                <Trophy size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">Final result</p>
                <p className="mt-1 font-black">
                  {matchData.is_draw || matchData.player1_score === matchData.player2_score
                    ? "It's a draw"
                    : `${getWinnerName(matchData)} wins`}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              {matchData.player1_name} {matchData.player1_score} – {matchData.player2_score}{" "}
              {matchData.player2_name}
            </p>
          </div>

          <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent-text">
                <Medal size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">Man of the Match</p>
                <p className="mt-1 font-black">{motmName || "Not provided"}</p>
              </div>
            </div>
            {motm && typeof motm === "object" && "rating" in motm && (
              <p className="mt-3 text-sm text-accent-text">
                Rating: {safeNumber((motm as Player & { rating?: number }).rating).toFixed(1)}/10
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-foreground/70">
                <Activity size={22} />
              </div>
              <div>
                <p className="text-xs text-muted">Match events</p>
                <p className="mt-1 font-black">
                  {matchEvents.filter((event) => event.event_type === "GOAL").length} goals
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">
              {matchEvents.length} recorded events in the match report.
            </p>
          </div>
        </div>
      )}

      <div className="mt-6 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
              Live commentary
            </p>
            <h2 className="mt-2 text-xl font-black">Match timeline</h2>
          </div>
          <Goal className="text-accent-text" size={22} />
        </div>

        <div
          ref={timelineRef}
          onScroll={handleTimelineScroll}
          className="flex h-44 items-stretch gap-3 overflow-x-auto overflow-y-hidden rounded-xl pb-2 sm:h-48"
        >
          {visibleEvents.length === 0 && (
            <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-foreground/[0.02] p-4 text-sm text-muted">
              Waiting for match events...
            </div>
          )}

          {visibleEvents.map((event, eventIndex) => {
            const type = (event.event_type || "").toUpperCase();
            const isGoal = type === "GOAL";
            const isCard = type.includes("CARD") || type.includes("BOOKING");
            const isExtraTimeStart = isExtraTimeStartType(type);
            const isExtraTimeBreak = isExtraTimeBreakType(type);
            const isHalfTime = isHalfTimeType(type);
            const isFullTime = isFullTimeType(type);
            const playerName = getPlayerName(event.player);
            const secondaryName = getPlayerName(event.secondary_player);
            const title = isGoal
              ? "GOAL!"
              : isExtraTimeStart
                ? "Extra time begins"
                : isExtraTimeBreak
                  ? "Extra-time break"
                  : isHalfTime
                    ? "Half-time"
                    : isFullTime
                      ? "Full-time"
                      : formatEventType(type);

            const teamName =
              event.team_number === 1
                ? `${matchData.player1_name}${getTeamName(team1) ? ` · ${getTeamName(team1)}` : ""}`
                : event.team_number === 2
                  ? `${matchData.player2_name}${getTeamName(team2) ? ` · ${getTeamName(team2)}` : ""}`
                  : "";

            return (
              <TimelineItem
                key={`${matchData.match_id}-${event.event_number}`}
                minute={event.minute}
                eventType={type}
                title={title}
                description={event.commentary || title}
                highlight={isGoal || isFullTime || isExtraTimeStart || isExtraTimeBreak}
                warning={isCard}
                teamName={teamName}
                playerName={playerName}
                secondaryName={secondaryName}
                score={liveBoard.scoreAfter[eventIndex] ?? ""}
              />
            );
          })}
        </div>

        {!matchFinished && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent-text" />
            Commentary is revealed as the match clock advances.
          </div>
        )}
      </div>

      {matchFinished && (
        <div className="mt-5 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                Match statistics
              </p>
              <h2 className="mt-2 text-xl font-black">Team comparison</h2>
            </div>
            <BarChart3 size={22} className="text-accent-text" />
          </div>

          <div className="mb-5 grid grid-cols-3 items-center gap-2 rounded-xl bg-foreground/[0.03] p-3 text-center">
            <div>
              <p className="text-[10px] text-muted">HOME</p>
              <p className="mt-1 truncate text-sm font-bold">
                {getTeamName(team1) || matchData.player1_name}
              </p>
            </div>
            <div className="text-xs font-bold text-muted">VS</div>
            <div>
              <p className="text-[10px] text-muted">AWAY</p>
              <p className="mt-1 truncate text-sm font-bold">
                {getTeamName(team2) || matchData.player2_name}
              </p>
            </div>
          </div>

          {team1Stats && team2Stats ? (
            <div className="grid grid-cols-1 gap-x-12 gap-y-5">
              <StatRow label="Possession" left={safeNumber(team1Stats.possession)} right={safeNumber(team2Stats.possession)} suffix="%" />
              <StatRow label="Shots" left={safeNumber(team1Stats.shots)} right={safeNumber(team2Stats.shots)} />
              <StatRow label="Shots on target" left={safeNumber(team1Stats.shots_on_target)} right={safeNumber(team2Stats.shots_on_target)} />
              <StatRow label="Goals" left={safeNumber(team1Stats.goals)} right={safeNumber(team2Stats.goals)} />
              <StatRow label="Fouls" left={safeNumber(team1Stats.fouls)} right={safeNumber(team2Stats.fouls)} />
              <StatRow label="Corners" left={safeNumber(team1Stats.corners)} right={safeNumber(team2Stats.corners)} />
              <StatRow label="Yellow cards" left={safeNumber(team1Stats.yellow_cards)} right={safeNumber(team2Stats.yellow_cards)} />
              <StatRow label="Red cards" left={safeNumber(team1Stats.red_cards)} right={safeNumber(team2Stats.red_cards)} />
            </div>
          ) : (
            <EmptyData message="Team statistics were not returned by the backend. Check the match API response." />
          )}

          <p className="mt-5 text-[11px] leading-5 text-muted">
            Statistics are the saved match totals returned by the simulator.
          </p>
        </div>
      )}

      <div className="mt-8">
        <SectionHeading
          eyebrow="Starting elevens"
          title="Team lineups"
          icon={<Users size={21} />}
          description="Your original drafted squads remain unchanged for every rematch. Player ratings appear on each card at full time."
        />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <SquadPitch
            name={matchData.player1_name}
            team={team1}
            number={1}
            players={player1Squad}
            complete
            ratings={team1Ratings}
            showRatings={matchFinished}
          />
          <SquadPitch
            name={matchData.player2_name}
            team={team2}
            number={2}
            players={player2Squad}
            complete
            ratings={team2Ratings}
            showRatings={matchFinished}
          />
        </div>
      </div>

      {matchHistory.length > 1 && (
        <div className="mt-8 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
          <SectionHeading
            eyebrow="This draft"
            title="Match history"
            icon={<Clock3 size={21} />}
            description="Switch between results from this page session."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matchHistory.map((item, index) => (
              <button
                key={item.match_id}
                onClick={() => onShowPrevious(item)}
                className={`rounded-2xl border p-4 text-left transition ${
                  item.match_id === matchData.match_id
                    ? "border-accent/40 bg-accent/[0.06]"
                    : "border-border bg-foreground/[0.02] hover:border-foreground/20"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted">
                    Match {matchHistory.length - index}
                  </span>
                  {item.match_id === matchData.match_id && (
                    <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent-text">
                      Viewing
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-bold">{item.player1_name}</span>
                  <span className="shrink-0 text-xl font-black tabular-nums">
                    {item.player1_score} – {item.player2_score}
                  </span>
                  <span className="min-w-0 truncate text-right text-sm font-bold">
                    {item.player2_name}
                  </span>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {item.is_draw || item.player1_score === item.player2_score
                    ? "Draw"
                    : `${getWinnerName(item)} won`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {matchFinished && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {canControl ? (
            <button
              onClick={onRematch}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <RefreshCw size={17} />
              )}
              Play rematch · Same squads
            </button>
          ) : (
            controlNote && (
              <div className="flex items-center gap-2 rounded-xl border border-border px-6 py-4 text-sm text-muted">
                <Clock3 size={16} className="text-accent-text" />
                {controlNote}
              </div>
            )
          )}
          <button
            onClick={onReset}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-border px-6 py-4 font-semibold text-foreground/75 transition hover:bg-foreground/5 disabled:opacity-50"
          >
            <RotateCcw size={17} />
            {resetLabel}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-border px-6 py-4 font-semibold text-foreground/75 transition hover:bg-foreground/5"
          >
            Back home
          </Link>
        </div>
      )}

      {!matchFinished && (
        <p className="mt-6 text-center text-xs text-muted">
          Simulation in progress. Keep this page open to watch the full match.
        </p>
      )}
    </section>
  );
}

/* ================================================================== */
/* Shared small components                                             */
/* ================================================================== */

export function TeamDropdown({
  teams,
  value,
  placeholder,
  onChange,
  disabled = false,
  excludedId = "",
}: {
  teams: Team[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  excludedId?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = teams.find((team) => String(team.id) === value) ?? null;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-30 w-full">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[50px] w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm outline-none transition focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 ${open ? "border-accent-text/60 bg-surface-2" : "border-border bg-background hover:border-foreground/25"}`}
      >
        {selected ? (
          <>
            {selected.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" />
            ) : (
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-black"
                style={{ backgroundColor: selected.primary_color || "#b9f36b" }}
              >
                {(selected.short_name || selected.name).slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold text-foreground">{selected.name}</span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted">{placeholder}</span>
        )}
        <ChevronDown
          size={17}
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100] overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/30">
          <div className="border-b border-border px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            {excludedId ? "Choose a different club" : "Available clubs"}
          </div>
          <div role="listbox" className="max-h-64 overflow-y-auto p-1.5">
            {teams.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted">
                No clubs available. Add teams in the backend first.
              </p>
            ) : (
              teams.map((team) => {
                const id = String(team.id);
                const excluded = id === excludedId;
                const isSelected = id === value;
                return (
                  <button
                    key={team.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={excluded}
                    onClick={() => {
                      onChange(id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${isSelected ? "bg-accent/10" : "hover:bg-foreground/[0.06]"}`}
                  >
                    {team.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={team.logo_url} alt="" className="h-8 w-8 shrink-0 object-contain" />
                    ) : (
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-black"
                        style={{ backgroundColor: team.primary_color || "#b9f36b" }}
                      >
                        {(team.short_name || team.name).slice(0, 3).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-sm font-bold ${isSelected ? "text-accent-text" : "text-foreground/85"}`}
                      >
                        {team.name}
                      </span>
                      {excluded && (
                        <span className="block text-[10px] text-muted">
                          Already selected by the other manager
                        </span>
                      )}
                    </span>
                    {isSelected && <Check size={16} className="shrink-0 text-accent-text" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamBadge({
  team,
  compact = false,
}: {
  team?: Team | null;
  compact?: boolean;
}) {
  if (!team) return null;

  const primary = team.primary_color || "#b9f36b";
  const secondary = team.secondary_color || "#080b10";

  return (
    <div
      className={`flex min-w-0 items-center gap-3 rounded-xl border border-border bg-foreground/[0.03] ${
        compact ? "mx-auto w-fit max-w-full flex-col justify-center border-0 bg-transparent p-0" : "p-3"
      }`}
    >
      {team.logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.logo_url}
          alt={`${team.name} logo`}
          className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} shrink-0 object-contain`}
        />
      ) : (
        <div
          className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-xl text-xs font-black`}
          style={{ backgroundColor: primary, color: secondary }}
        >
          {(team.short_name || team.name).slice(0, 3).toUpperCase()}
        </div>
      )}
      {!compact && (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{team.name}</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Selected club</p>
        </div>
      )}
    </div>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  icon,
  description,
}: {
  eyebrow: string;
  title: string;
  icon: ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
        {description && <p className="mt-2 text-sm leading-6 text-muted">{description}</p>}
      </div>
    </div>
  );
}

export function EmptyData({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-border bg-foreground/[0.02] p-4 text-sm leading-6 text-muted">
      {message}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300"
    >
      <CircleAlert size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const size = 14;

  if (type === "GOAL") return <Goal size={size} />;
  if (type.includes("RED_CARD")) return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-red-500" />;
  if (type.includes("CARD") || type.includes("BOOKING")) return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-amber-400" />;
  if (type.includes("KICKOFF")) return <Play size={size} />;
  if (type.includes("CORNER") || type.includes("OFFSIDE")) return <Flag size={size} />;
  if (type.includes("TACKLE") || type.includes("INTERCEPTION")) return <Zap size={size} />;
  if (type.includes("SAVE")) return <Shield size={size} />;
  if (type.includes("SHOT")) return <Target size={size} />;
  if (type.includes("FOUL")) return <Footprints size={size} />;
  if (
    type.includes("EXTRA_TIME") ||
    type.includes("HALF_TIME") ||
    type.includes("FULL_TIME") ||
    type.includes("HALFTIME") ||
    type.includes("FULLTIME")
  ) {
    return <Timer size={size} />;
  }

  return <Activity size={size} />;
}

function TimelineItem({
  minute,
  eventType,
  title,
  description,
  highlight = false,
  warning = false,
  teamName,
  playerName,
  secondaryName,
  score,
}: {
  minute: number;
  eventType: string;
  title: string;
  description: string;
  highlight?: boolean;
  warning?: boolean;
  teamName?: string;
  playerName?: string;
  secondaryName?: string;
  score?: string;
}) {
  return (
    <div
      className={`flex h-full w-60 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border p-3 sm:w-72 ${
        highlight
          ? "border-accent/20 bg-accent/[0.05]"
          : warning
            ? "border-amber-400/20 bg-amber-400/[0.04]"
            : "border-border bg-foreground/[0.02]"
      }`}
      title={description}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 min-w-11 items-center justify-center rounded-lg text-xs font-black tabular-nums ${
            highlight
              ? "bg-accent/10 text-accent-text"
              : warning
                ? "bg-amber-400/10 text-amber-600 dark:text-amber-300"
                : "bg-foreground/[0.05] text-muted"
          }`}
        >
          {minute}&apos;
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            highlight
              ? "bg-accent/10 text-accent-text"
              : warning
                ? "bg-amber-400/10 text-amber-600 dark:text-amber-300"
                : "bg-foreground/[0.05] text-muted"
          }`}
        >
          <EventIcon type={eventType} />
        </span>
        <p
          className={`min-w-0 flex-1 truncate text-sm font-black ${
            highlight
              ? "text-accent-text"
              : warning
                ? "text-amber-700 dark:text-amber-200"
                : "text-foreground/85"
          }`}
        >
          {title}
        </p>
        {score && (
          <span className="shrink-0 rounded-md bg-foreground/[0.06] px-2 py-1 text-[10px] font-black tabular-nums text-foreground/70">
            {score}
          </span>
        )}
      </div>
      {teamName && (
        <span className="w-fit max-w-full truncate rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted">
          {teamName}
        </span>
      )}
      {playerName && (
        <p className="truncate text-xs font-bold text-foreground/75">
          {playerName}
          {secondaryName && (
            <span className="font-medium text-muted"> · Assist: {secondaryName}</span>
          )}
        </p>
      )}
      <p className="line-clamp-3 text-xs leading-5 text-muted">{description}</p>
    </div>
  );
}

function StatRow({
  label,
  left,
  right,
  suffix = "",
}: {
  label: string;
  left: number;
  right: number;
  suffix?: string;
}) {
  const total = left + right;
  const leftWidth = total === 0 ? 50 : (left / total) * 100;
  const rightWidth = total === 0 ? 50 : (right / total) * 100;

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className="font-bold tabular-nums text-foreground/80">
          {left}
          {suffix}
        </span>
        <span className="text-center text-xs text-muted">{label}</span>
        <span className="text-right font-bold tabular-nums text-foreground/80">
          {right}
          {suffix}
        </span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-l-full bg-accent-text transition-all duration-300" style={{ width: `${leftWidth}%` }} />
        <div className="h-full rounded-r-full bg-foreground/25" style={{ width: `${rightWidth}%` }} />
      </div>
    </div>
  );
}

export function PlayerAvatar({
  player,
  className = "",
}: {
  player: Player;
  className?: string;
}) {
  if (player.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.image_url}
        alt={player.name}
        className={`shrink-0 border border-border bg-background object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border bg-background font-black text-accent-text ${className}`}
    >
      {player.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    </div>
  );
}

export function SquadPitch({
  name,
  team,
  number,
  players,
  active = false,
  complete = false,
  ratings = [],
  showRatings = false,
}: {
  name: string;
  team?: Team | null;
  number: number;
  players: Player[];
  active?: boolean;
  complete?: boolean;
  ratings?: PlayerRating[];
  showRatings?: boolean;
}) {
  const slots = useMemo(() => assignToFormation(players), [players]);

  const { ratingById, ratingByName } = useMemo(() => {
    const byId = new Map<string, PlayerRating>();
    const byName = new Map<string, PlayerRating>();

    ratings.forEach((item) => {
      const id = item.player?.id;
      if (id !== null && id !== undefined) byId.set(String(id), item);

      const nameKey = (item.player?.name ?? "").trim().toLowerCase();
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
    });

    return { ratingById: byId, ratingByName: byName };
  }, [ratings]);

  const findRating = (player: Player): PlayerRating | undefined =>
    ratingById.get(String(player.id)) ??
    ratingByName.get((player.name ?? "").trim().toLowerCase());

  return (
    <div
      className={`rounded-[28px] border p-4 transition sm:p-6 ${
        active ? "border-accent/50 bg-accent/[0.05]" : "border-border bg-surface"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${
              active ? "bg-accent text-accent-ink" : "bg-foreground/5 text-muted"
            }`}
          >
            {number}
          </div>
          <div className="min-w-0">
            <h3 className="truncate font-bold">{name}</h3>
            <p className="mt-0.5 text-xs text-muted">{players.length} / 11 players · 4–3–3</p>
            {team && <p className="mt-1 truncate text-xs font-semibold text-accent-text">{team.name}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {team?.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt={`${team.name} logo`} className="h-8 w-8 object-contain" />
          )}
          {complete ? (
            <span className="flex items-center gap-1 text-xs font-bold text-accent-text">
              <Check size={14} /> Complete
            </span>
          ) : active ? (
            <span className="rounded-full bg-accent/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-text">
              Picking
            </span>
          ) : (
            <span className="text-xs text-muted">Waiting</span>
          )}
        </div>
      </div>

      {/* The pitch is green in both themes, so its inner colours stay fixed */}
      <div className="pitch relative overflow-hidden rounded-2xl border border-border">
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 sm:h-28 sm:w-28" />
        <div className="absolute left-1/2 top-0 h-9 w-28 -translate-x-1/2 rounded-b-xl border-x border-b border-white/20 sm:h-12 sm:w-36" />
        <div className="absolute bottom-0 left-1/2 h-9 w-28 -translate-x-1/2 rounded-t-xl border-x border-t border-white/20 sm:h-12 sm:w-36" />

        {FORMATION.map((slot, index) => {
          const player = slots[index];
          const rating = player ? findRating(player) : undefined;
          const ratingText = formatRating(rating?.rating);

          return (
            <div
              key={`${slot.code}-${index}`}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: slot.x, top: slot.y }}
              title={player ? `${player.name} (${player.position})` : slot.code}
            >
              {player ? (
                <>
                  <div className="relative">
                    <PlayerAvatar
                      player={player}
                      className="h-9 w-9 rounded-full border-[#b9f36b]/80! text-[11px] shadow-[0_0_16px_rgba(185,243,107,0.25)] sm:h-12 sm:w-12 sm:text-sm"
                    />
                    {showRatings && (
                      <span
                        className={`absolute -right-4 -top-2 z-20 min-w-[26px] rounded-md border border-black/40 px-1.5 py-0.5 text-center text-[10px] font-black leading-none tabular-nums shadow-lg sm:text-xs ${
                          ratingText ? "bg-[#b9f36b] text-black" : "bg-white/25 text-white/80"
                        }`}
                        aria-label={ratingText ? `Match rating ${ratingText}` : "No match rating"}
                      >
                        {ratingText ?? "—"}
                      </span>
                    )}
                  </div>
                  <span className="max-w-[68px] truncate rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white sm:max-w-[84px] sm:text-[10px]">
                    {player.name.split(" ").slice(-1)[0]}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/30 bg-black/20 text-[10px] font-black text-white/40 sm:h-12 sm:w-12 sm:text-xs">
                    {slot.code}
                  </div>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/40 sm:text-[10px]">
                    {slot.code}
                  </span>
                </>
              )}
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08110b]/20" />
      </div>

      {showRatings && ratings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
          <span>
            Average rating:{" "}
            <strong className="text-accent-text">
              {(ratings.reduce((sum, item) => sum + safeNumber(item.rating), 0) / ratings.length).toFixed(1)}
            </strong>
          </span>
          <span>
            Goals:{" "}
            <strong className="text-foreground">
              {ratings.reduce((sum, item) => sum + safeNumber(item.goals), 0)}
            </strong>
          </span>
          <span>
            Assists:{" "}
            <strong className="text-foreground">
              {ratings.reduce((sum, item) => sum + safeNumber(item.assists), 0)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}