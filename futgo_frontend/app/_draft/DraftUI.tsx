"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Check, ChevronDown,
  ChevronRight, CircleAlert, Clock3, Crown, Flag, Footprints, Goal,
  LoaderCircle, Medal, Play, RefreshCw, RotateCcw, Shield, Sparkles,
  Target, Timer, Trophy, Users, X, Zap,
} from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";
import {
  DRAFT_CATEGORIES,
  EXTRA_TIME_END,
  FORMATION,
  PENALTY_FIRST_REVEAL_DELAY_MS,
  PENALTY_RESULT_DELAY_MS,
  PENALTY_STEP_DELAY_MS,
  REGULAR_TIME_END,
  assignToFormation,
  buildPenaltyTracker,
  formatEventType,
  formatRating,
  getMatchEndMinute,
  getMatchStatusLabel,
  getPlayerName,
  getTeamName,
  getWinnerName,
  hasPenaltyShootout,
  getPenaltyScore,
  isExtraTimeBreakType,
  isExtraTimeStartType,
  isFullTimeType,
  isHalfTimeType,
  isPenaltyKickType,
  isPenaltyResultType,
  safeNumber,
  squadPlayers,
} from "./draftShared";
import type {
  CategoryValue,
  DraftState,
  MatchEvent,
  MatchResult,
  PenaltyStage,
  PenaltyTrackerData,
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-black text-accent-ink">F</div>
            <div>
              <div className="text-lg font-black tracking-[0.16em]">FUTGO</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Build your legacy</div>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link href="/" className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent-text/50 hover:text-foreground">
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
  value, onChange, disabled = false,
}: {
  value: CategoryValue | "";
  onChange: (value: CategoryValue) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {DRAFT_CATEGORIES.map((category) => {
        const selected = value === category.value;
        return (
          <button key={category.value} type="button" aria-pressed={selected}
            disabled={disabled} onClick={() => onChange(category.value)}
            className={`relative flex min-h-[82px] items-center gap-3 rounded-2xl border p-3 text-left transition sm:p-4 ${
              selected ? "border-accent-text/80 bg-accent/[0.09] shadow-[0_0_22px_rgba(185,243,107,0.06)]" : "border-border bg-background/70 hover:border-foreground/25 hover:bg-foreground/[0.03]"
            } disabled:opacity-60`}>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-2xl">{category.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm font-bold leading-tight ${selected ? "text-accent-text" : "text-foreground/85"}`}>{category.label}</span>
              <span className="mt-1 hidden text-[10px] leading-4 text-muted sm:block sm:text-xs">{category.description}</span>
            </span>
            {selected && <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-ink"><Check size={12} strokeWidth={3} /></span>}
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Drafting view                                                       */
/* ================================================================== */

export function DraftingView({
  draft, modeLabel, categoryLabel, loading, error, onPick, onRefresh,
  canPick = true, headline = "MAKE YOUR PICK.",
  subline = "Choose one player. The other joins your rival's squad.",
  promptLabel, footerNote = "Picks saved to your draft", mySeat = null,
}: {
  draft: DraftState; modeLabel: string; categoryLabel: string;
  loading: boolean; error: string; onPick: (player: Player) => void;
  onRefresh: () => void; canPick?: boolean; headline?: string;
  subline?: string; promptLabel?: string; footerNote?: string;
  mySeat?: number | null;
}) {
  const player1Squad = useMemo(() => squadPlayers(draft.squads?.player1), [draft]);
  const player2Squad = useMemo(() => squadPlayers(draft.squads?.player2), [draft]);
  const activePlayer = draft.current_event?.active_player_number ?? 1;
  const currentName = activePlayer === 1 ? draft.player1_name : draft.player2_name;
  const round = draft.current_event?.event_number ?? 11;
  const offered = draft.current_event?.offered_players ?? [];
  const seatName = (seat: number, name: string) => mySeat === seat ? `${name} (You)` : name;

  return (
    <section className="py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text"><Zap size={15} />{modeLabel} · Round {round} of 11</div>
          <h1 className="text-3xl font-black sm:text-5xl">{headline}</h1>
          <p className="mt-3 text-sm text-muted sm:text-base">{subline}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-foreground/[0.03] px-3 py-1.5 text-xs text-muted"><Trophy size={13} className="text-accent-text" />{categoryLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-foreground/10 sm:block"><div className="h-full rounded-full bg-accent-text transition-all duration-500" style={{ width: `${(round / 11) * 100}%` }} /></div>
          <div className="rounded-xl border border-accent/30 bg-accent/[0.06] px-4 py-3">
            <div className="text-xs text-muted">Current manager</div>
            <div className="mt-1 font-bold text-accent-text">{currentName}</div>
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted"><Sparkles size={14} className="text-accent-text" />{promptLabel ?? `${currentName}, choose your footballer`}</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-5">
        {offered.map((player, index) => (
          <button key={player.id} type="button" disabled={loading || !canPick}
            onClick={() => onPick(player)}
            className={`group relative overflow-hidden rounded-2xl border border-border bg-surface p-3 text-left transition sm:rounded-3xl sm:p-7 ${
              canPick ? "hover:-translate-y-1 hover:border-accent-text/60 hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60" : "cursor-not-allowed opacity-70"
            }`}>
            <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-accent/[0.04] blur-3xl transition group-hover:bg-accent/10" />
            <div className="relative flex items-start justify-between gap-2 sm:gap-4">
              <span className="rounded-full border border-border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-muted sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.16em]"><span className="hidden sm:inline">Option </span>{index + 1}</span>
              <div className="flex items-center gap-2">
                <span className="rounded-lg border border-[#b9f36b]/40 bg-[#b9f36b]/15 px-2.5 py-1 text-xs font-black text-[#b9f36b] sm:px-3 sm:py-1.5 sm:text-sm">{player.ovr_rating ?? 0} OVR</span>
                <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent-text sm:px-3 sm:py-1.5 sm:text-xs">{player.position}</span>
              </div>
            </div>
            <div className="relative mt-4 flex flex-col items-start gap-3 sm:mt-7 sm:min-h-28 sm:flex-row sm:items-center sm:gap-5">
              <PlayerAvatar player={player} className="h-16 w-16 rounded-xl text-xl sm:h-24 sm:w-24 sm:rounded-2xl sm:text-3xl" />
              <div className="min-w-0">
                <h2 className="break-words text-base font-black leading-tight sm:text-3xl">{player.name}</h2>
                <p className="mt-1 text-[11px] leading-4 text-muted sm:mt-2 sm:text-sm">{[player.club, player.country].filter(Boolean).join(" · ") || "Football star"}</p>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between border-t border-border pt-3 sm:mt-7 sm:pt-4">
              {canPick ? <><span className="text-xs font-bold text-muted transition group-hover:text-accent-text sm:text-sm">Draft<span className="hidden sm:inline"> this player</span></span>{loading ? <LoaderCircle size={19} className="animate-spin text-accent-text" /> : <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground/5 transition group-hover:bg-accent group-hover:text-accent-ink sm:h-9 sm:w-9"><ChevronRight size={17} /></span>}</> : <><span className="truncate text-xs font-bold text-muted sm:text-sm">Waiting for {currentName}</span><span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-text" /></>}
            </div>
          </button>
        ))}
      </div>

      {offered.length === 0 && <div className="rounded-2xl border border-border bg-surface p-8 text-center"><p className="text-muted">No player options were returned for this round.</p><button onClick={onRefresh} disabled={loading} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-60">Refresh draft</button></div>}
      {error && <div className="mt-5"><ErrorMessage message={error} /></div>}

      <div className="mb-5 mt-10 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Squads</span><div className="h-px flex-1 bg-border" /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch name={seatName(1, draft.player1_name)} team={draft.player1_team} number={1} players={player1Squad} active={activePlayer === 1} />
        <SquadPitch name={seatName(2, draft.player2_name)} team={draft.player2_team} number={2} players={player2Squad} active={activePlayer === 2} />
      </div>
      <div className="mt-8 flex items-center justify-between border-t border-border pt-5 text-xs text-muted"><span>{player1Squad.length + player2Squad.length} / 22 players drafted</span><span className="flex items-center gap-2"><Check size={14} className="text-accent-text" />{footerNote}</span></div>
    </section>
  );
}

/* ================================================================== */
/* Draft complete view                                                 */
/* ================================================================== */

export function DraftCompleteView({
  draft, categoryLabel, loading, error, onStartMatch, onReset,
  resetLabel = "Play another draft", canStartMatch = true,
  waitingText, mySeat = null,
}: {
  draft: DraftState; categoryLabel: string; loading: boolean; error: string;
  onStartMatch: () => void; onReset: () => void; resetLabel?: string;
  canStartMatch?: boolean; waitingText?: string; mySeat?: number | null;
}) {
  const player1Squad = useMemo(() => squadPlayers(draft.squads?.player1), [draft]);
  const player2Squad = useMemo(() => squadPlayers(draft.squads?.player2), [draft]);
  const seatName = (seat: number, name: string) => mySeat === seat ? `${name} (You)` : name;

  return (
    <section className="mx-auto max-w-6xl py-12 sm:py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent-text"><Crown size={32} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-text">Draft complete</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">SQUADS LOCKED.</h1>
        <p className="mt-4 text-muted">{draft.player1_name} and {draft.player2_name} have drafted their teams. Ready to see who wins on the pitch?</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.06] px-4 py-2 text-sm font-semibold text-accent-text"><Trophy size={15} />{categoryLabel}</div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch name={seatName(1, draft.player1_name)} team={draft.player1_team} number={1} players={player1Squad} complete />
        <SquadPitch name={seatName(2, draft.player2_name)} team={draft.player2_team} number={2} players={player2Squad} complete />
      </div>
      {error && <div className="mx-auto mt-6 max-w-2xl"><ErrorMessage message={error} /></div>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {canStartMatch ? <button onClick={onStartMatch} disabled={loading || player1Squad.length !== 11 || player2Squad.length !== 11} className="flex min-w-48 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><LoaderCircle size={19} className="animate-spin" />Preparing match...</> : <><Play size={18} fill="currentColor" />Start Match<ArrowRight size={18} /></>}</button> : <div className="flex min-w-48 items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-6 py-4 text-sm font-bold text-accent-text"><LoaderCircle size={17} className="animate-spin" />{waitingText || "Waiting for the host to start the match..."}</div>}
        <button onClick={onReset} disabled={loading} className="flex items-center gap-2 rounded-xl border border-border px-6 py-3 font-semibold text-foreground/75 transition hover:bg-foreground/5 disabled:opacity-50"><RotateCcw size={17} />{resetLabel}</button>
        <Link href="/" className="rounded-xl border border-border px-6 py-3 font-semibold text-foreground/75 transition hover:bg-foreground/5">Back home</Link>
      </div>
      {(player1Squad.length !== 11 || player2Squad.length !== 11) && <p className="mt-4 text-center text-xs text-amber-600 dark:text-amber-300">Both squads must have 11 players before the match can start.</p>}
    </section>
  );
}

/* ================================================================== */
/* Match centre                                                        */
/* ================================================================== */

export function MatchCentreView({
  matchData, draft, matchMinute, matchFinished, matchHistory, loading,
  error, onWatchAgain, onRematch, onReset, onShowPrevious,
  resetLabel = "Draft new teams", canControl = true, controlNote, mySeat = null,
}: {
  matchData: MatchResult; draft: DraftState; matchMinute: number;
  matchFinished: boolean; matchHistory: MatchResult[]; loading: boolean;
  error: string; onWatchAgain: () => void; onRematch: () => void;
  onReset: () => void; onShowPrevious: (match: MatchResult) => void;
  resetLabel?: string; canControl?: boolean; controlNote?: string;
  mySeat?: number | null;
}) {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const stickToEndRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  const player1Squad = useMemo(() => squadPlayers(draft.squads?.player1), [draft]);
  const player2Squad = useMemo(() => squadPlayers(draft.squads?.player2), [draft]);
  const matchEvents = matchData.events ?? [];
  const matchEndMinute = useMemo(() => getMatchEndMinute(matchData), [matchData]);
  const extraTimePlayed = matchEndMinute > REGULAR_TIME_END;
  const penaltiesPlayed = hasPenaltyShootout(matchData);
  const penaltyTimelineEvents = useMemo(
    () => matchEvents
      .filter((event) => (event.event_type || "").toUpperCase().startsWith("PENALTY_"))
      .sort((a, b) => safeNumber(a.event_number) - safeNumber(b.event_number)),
    [matchEvents],
  );

  // The interactive shootout needs the penalty events from the backend.
  // If a match has penalty scores but no penalty events (very old data),
  // we skip the "Start Penalties" step and just show the final result.
  const shootoutPlayable = penaltiesPlayed && penaltyTimelineEvents.length > 0;

  // shootoutStarted becomes true when the user presses "Start Penalties".
  const [shootoutStarted, setShootoutStarted] = useState(false);
  const [penaltyRevealCount, setPenaltyRevealCount] = useState(0);

  // Remembers which matches already had their shootout fully revealed, so
  // switching back to them in "Match history" shows the result straight away.
  const finishedShootoutsRef = useRef<Set<number>>(new Set());

  // New match or switched match: wait for the button, unless this
  // shootout was already watched in this page session.
  useEffect(() => {
    if (shootoutPlayable && finishedShootoutsRef.current.has(matchData.match_id)) {
      setShootoutStarted(true);
      setPenaltyRevealCount(penaltyTimelineEvents.length);
    } else {
      setShootoutStarted(false);
      setPenaltyRevealCount(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchData.match_id]);

  // "Watch again" / a new match restarts the clock at 0: reset the shootout.
  useEffect(() => {
    if (matchMinute === 0) {
      finishedShootoutsRef.current.delete(matchData.match_id);
      setShootoutStarted(false);
      setPenaltyRevealCount(0);
    }
  }, [matchMinute, matchData.match_id]);

  // Reveal the shootout one event at a time after the button is pressed.
  useEffect(() => {
    if (
      !matchFinished ||
      !shootoutPlayable ||
      !shootoutStarted ||
      penaltyRevealCount >= penaltyTimelineEvents.length
    ) return undefined;

    const previousType = (
      penaltyTimelineEvents[penaltyRevealCount - 1]?.event_type || ""
    ).toUpperCase();

    // Longer pause after "steps up to take the penalty" so the result
    // has a moment of suspense.
    const delay = penaltyRevealCount === 0
      ? PENALTY_FIRST_REVEAL_DELAY_MS
      : isPenaltyKickType(previousType)
        ? PENALTY_RESULT_DELAY_MS
        : PENALTY_STEP_DELAY_MS;

    const timer = window.setTimeout(() => {
      setPenaltyRevealCount((count) => Math.min(count + 1, penaltyTimelineEvents.length));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [
    matchFinished,
    shootoutPlayable,
    shootoutStarted,
    penaltyRevealCount,
    penaltyTimelineEvents,
    matchData.match_id,
  ]);

  const shootoutRevealed =
    shootoutPlayable &&
    shootoutStarted &&
    penaltyRevealCount >= penaltyTimelineEvents.length;

  useEffect(() => {
    if (shootoutRevealed) finishedShootoutsRef.current.add(matchData.match_id);
  }, [shootoutRevealed, matchData.match_id]);

  // Extra time is over, the match is still level, and we are waiting
  // for the user to press "Start Penalties".
  const awaitingPenalties = matchFinished && shootoutPlayable && !shootoutStarted;

  const playbackFinished = matchFinished && (!shootoutPlayable || shootoutRevealed);

  const penaltyStage: PenaltyStage = awaitingPenalties
    ? "awaiting"
    : shootoutPlayable && shootoutStarted && !playbackFinished
      ? "live"
      : "none";

  const progressEndMinute = playbackFinished
    ? matchEndMinute
    : extraTimePlayed && matchMinute >= REGULAR_TIME_END
      ? EXTRA_TIME_END : REGULAR_TIME_END;

  const visibleEvents = useMemo(() => {
    const ordered = [...matchEvents].sort(
      (a, b) => safeNumber(a.minute) - safeNumber(b.minute) || safeNumber(a.event_number) - safeNumber(b.event_number),
    );
    let revealedPenaltyEvents = 0;

    return ordered.filter((event) => {
      if (safeNumber(event.minute) > matchMinute) return false;

      const type = (event.event_type || "").toUpperCase();
      if (type.startsWith("PENALTY_")) {
        const shouldReveal = !shootoutPlayable || revealedPenaltyEvents < penaltyRevealCount;
        revealedPenaltyEvents += 1;
        return shouldReveal;
      }

      return true;
    });
  }, [matchEvents, matchMinute, shootoutPlayable, penaltyRevealCount]);

  const liveBoard = useMemo(() => {
    let score1 = 0;
    let score2 = 0;
    let penalties1 = 0;
    let penalties2 = 0;
    const scoreAfter: string[] = [];
    const scorers1: { name: string; minute: number }[] = [];
    const scorers2: { name: string; minute: number }[] = [];

    visibleEvents.forEach((event) => {
      const type = (event.event_type || "").toUpperCase();
      const team = safeNumber(event.team_number);

      if (type === "GOAL") {
        const scorer = { name: getPlayerName(event.player) || "Goal", minute: safeNumber(event.minute) };
        if (team === 1) { score1++; scorers1.push(scorer); }
        if (team === 2) { score2++; scorers2.push(scorer); }
      }

      if (type === "PENALTY_GOAL") {
        if (team === 1) penalties1++;
        if (team === 2) penalties2++;
      }

      scoreAfter.push(
        type.startsWith("PENALTY_")
          ? `${score1}–${score2} · P ${penalties1}–${penalties2}`
          : `${score1}–${score2}`,
      );
    });

    return { score1, score2, penalties1, penalties2, scoreAfter, scorers1, scorers2 };
  }, [visibleEvents]);

  const penaltyTracker = useMemo(
    () => buildPenaltyTracker(visibleEvents),
    [visibleEvents],
  );

  const penaltyVisibleEvents = visibleEvents.filter((event) =>
    (event.event_type || "").toUpperCase().startsWith("PENALTY_"),
  );
  const lastPenaltyEvent = penaltyVisibleEvents[penaltyVisibleEvents.length - 1] ?? null;
  const currentKick =
    lastPenaltyEvent && isPenaltyKickType((lastPenaltyEvent.event_type || "").toUpperCase())
      ? lastPenaltyEvent
      : null;
  const lastPenaltyResult =
    [...penaltyVisibleEvents]
      .reverse()
      .find((event) => isPenaltyResultType((event.event_type || "").toUpperCase())) ?? null;

  const liveScore1 = playbackFinished ? safeNumber(matchData.player1_score) : liveBoard.score1;
  const liveScore2 = playbackFinished ? safeNumber(matchData.player2_score) : liveBoard.score2;
  const finalPenalty1 = getPenaltyScore(matchData, 1);
  const finalPenalty2 = getPenaltyScore(matchData, 2);
  const livePenalty1 = playbackFinished ? finalPenalty1 : liveBoard.penalties1;
  const livePenalty2 = playbackFinished ? finalPenalty2 : liveBoard.penalties2;

  // "PEN 0 – 0" must not appear during the match. It only shows once
  // the shootout has started (or, for old matches without penalty
  // events, once the match is complete).
  const showPenaltyScore = shootoutPlayable
    ? shootoutStarted
    : penaltiesPlayed && playbackFinished;

  const team1Stats = useMemo(() => matchData.team_statistics?.find((item) => item.team_number === 1), [matchData]);
  const team2Stats = useMemo(() => matchData.team_statistics?.find((item) => item.team_number === 2), [matchData]);
  const ratings = useMemo(() => [...(matchData.player_ratings ?? [])].sort((a, b) => safeNumber(b.rating) - safeNumber(a.rating)), [matchData]);
  const team1Ratings = ratings.filter((item) => item.team_number === 1);
  const team2Ratings = ratings.filter((item) => item.team_number === 2);
  const motm = matchData.man_of_the_match ?? null;
  const motmName = getPlayerName(motm);

  const handleTimelineScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    const el = timelineRef.current;
    if (!el) return;
    stickToEndRef.current = el.scrollWidth - el.clientWidth - el.scrollLeft < 48;
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
    const timeout = window.setTimeout(() => { programmaticScrollRef.current = false; }, 600);
    return () => window.clearTimeout(timeout);
  }, [visibleEvents.length, matchData.match_id]);

  const team1 = matchData.player1_team || draft.player1_team;
  const team2 = matchData.player2_team || draft.player2_team;
  const winnerName = getWinnerName(matchData);
  const isDraw = matchData.winner_number === 0 || (!penaltiesPlayed && matchData.is_draw);

  // Winner celebration: plays once when a match finishes while you are
  // watching it. It does not replay when you open an old match from history.
  const winnerNumber =
    matchData.winner_number !== null && matchData.winner_number !== undefined
      ? safeNumber(matchData.winner_number)
      : safeNumber(matchData.player1_score) > safeNumber(matchData.player2_score)
        ? 1
        : safeNumber(matchData.player2_score) > safeNumber(matchData.player1_score)
          ? 2
          : 0;
  const [celebrate, setCelebrate] = useState(false);
  const watchedMatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playbackFinished) {
      watchedMatchIdRef.current = matchData.match_id;
      setCelebrate(false);
      return;
    }
    if (watchedMatchIdRef.current === matchData.match_id) {
      watchedMatchIdRef.current = null;
      if (winnerNumber === 1 || winnerNumber === 2) setCelebrate(true);
    }
  }, [playbackFinished, matchData.match_id, winnerNumber]);

  // Match history: the match currently being played stays hidden until it
  // has finished. Only completed matches are listed.
  const historyVisibleCount = matchHistory.filter(
    (item) => playbackFinished || item.match_id !== matchData.match_id,
  ).length;

  return (
    <section className="mx-auto max-w-7xl py-8 sm:py-12">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-accent-text"><Activity size={15} />FutGo match centre</div>
          <h1 className="text-3xl font-black sm:text-5xl">{playbackFinished ? "FULL TIME." : awaitingPenalties ? "PENALTIES NEXT." : penaltyStage === "live" ? "SHOOTOUT." : "THE SHOWDOWN."}</h1>
          <p className="mt-3 text-sm text-muted">{playbackFinished ? "The final whistle has blown. Explore the match report below." : awaitingPenalties ? "Still level after extra time. Press Start Penalties when you are ready." : penaltyStage === "live" ? "Every kick decides it. Watch the shootout unfold." : "Follow every major moment as your drafted teams battle it out."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onWatchAgain} disabled={loading || !playbackFinished} className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground/70 transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={16} />Watch again</button>
          {canControl && <button onClick={onRematch} disabled={loading || !playbackFinished} className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{loading ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={16} />}Rematch</button>}
        </div>
      </div>

      {error && <div className="mb-6"><ErrorMessage message={error} /></div>}

      {celebrate && (winnerNumber === 1 || winnerNumber === 2) && (
        <WinnerCelebration
          winnerName={winnerName || "Winner"}
          team={winnerNumber === 1 ? team1 : team2}
          youWon={mySeat === winnerNumber}
          scoreLine={`${matchData.player1_name} ${matchData.player1_score} – ${matchData.player2_score} ${matchData.player2_name}`}
          penaltyLine={penaltiesPlayed ? `Won ${finalPenalty1}–${finalPenalty2} on penalties` : null}
          onClose={() => setCelebrate(false)}
        />
      )}

      {/* Main scoreboard */}
      <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface p-5 sm:p-10">
        <div className="absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-accent/[0.07] blur-3xl" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
          <div className="min-w-0 text-center">
            <TeamBadge team={team1} compact />
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">{matchData.player1_name || draft.player1_name || "Player 1"}{mySeat === 1 && <span className="text-muted"> (You)</span>}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted sm:text-xs">{getTeamName(team1) || "Home team"}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-5">
              <span className="text-4xl font-black tabular-nums sm:text-7xl">{liveScore1}</span>
              <span className="text-xl font-bold text-muted sm:text-4xl">–</span>
              <span className="text-4xl font-black tabular-nums sm:text-7xl">{liveScore2}</span>
            </div>
            {showPenaltyScore && (
              <div className="mt-2 text-xs font-black tracking-wide text-accent-text">
                PEN {livePenalty1} – {livePenalty2}
              </div>
            )}
            <div className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${playbackFinished ? "bg-accent/10 text-accent-text" : "bg-foreground/[0.06] text-muted"}`}>
              {!playbackFinished && !awaitingPenalties && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />}
              {getMatchStatusLabel(matchMinute, playbackFinished, extraTimePlayed, penaltyStage)}
            </div>
          </div>
          <div className="min-w-0 text-center">
            <TeamBadge team={team2} compact />
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">{matchData.player2_name || draft.player2_name || "Player 2"}{mySeat === 2 && <span className="text-muted"> (You)</span>}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted sm:text-xs">{getTeamName(team2) || "Away team"}</p>
          </div>
        </div>

        {(liveBoard.scorers1.length > 0 || liveBoard.scorers2.length > 0) && (
          <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-border pt-4 sm:gap-8">
            <ul className="space-y-1 text-right">{liveBoard.scorers1.map((goal, index) => <li key={`home-goal-${index}`} className="text-xs text-foreground/70 sm:text-sm"><span className="font-bold text-foreground/85">{goal.name}</span>{" "}<span className="font-black tabular-nums text-accent-text">{goal.minute}&apos;</span></li>)}</ul>
            <Goal size={16} className="mt-0.5 text-accent-text" />
            <ul className="space-y-1 text-left">{liveBoard.scorers2.map((goal, index) => <li key={`away-goal-${index}`} className="text-xs text-foreground/70 sm:text-sm"><span className="font-black tabular-nums text-accent-text">{goal.minute}&apos;</span>{" "}<span className="font-bold text-foreground/85">{goal.name}</span></li>)}</ul>
          </div>
        )}

        <div className="relative mt-8">
          <div className="mb-2 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-2"><Clock3 size={14} />{playbackFinished ? "Match completed" : awaitingPenalties ? "Extra time over" : penaltyStage === "live" ? "Penalty shootout" : "Match clock"}</span>
            <span className="font-bold tabular-nums text-accent-text">{playbackFinished ? `${matchMinute}' / ${matchEndMinute}'` : `${matchMinute}'`}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-full bg-accent-text transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, (matchMinute / progressEndMinute) * 100))}%` }} /></div>
          {!playbackFinished ? null : extraTimePlayed ? (
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-muted"><span>Kick-off</span><span>45&apos; HT</span><span>90&apos; ET starts</span><span>105&apos; ET break</span><span>120&apos; FT</span></div>
          ) : <div className="mt-2 flex justify-between text-[10px] text-muted"><span>Kick-off</span><span>45&apos; HT</span><span>90&apos; FT</span></div>}
        </div>
      </div>

      {/* Dedicated penalty shootout view (replaces penalty items in the timeline) */}
      {matchFinished && shootoutPlayable && (
        <PenaltyShootoutView
          tracker={penaltyTracker}
          team1Name={matchData.player1_name || draft.player1_name || "Player 1"}
          team2Name={matchData.player2_name || draft.player2_name || "Player 2"}
          team1={team1}
          team2={team2}
          score1={livePenalty1}
          score2={livePenalty2}
          mySeat={mySeat}
          started={shootoutStarted}
          finished={shootoutRevealed}
          onStart={() => setShootoutStarted(true)}
          currentKick={currentKick}
          lastResult={lastPenaltyResult}
          regularScore={`${safeNumber(matchData.player1_score)} – ${safeNumber(matchData.player2_score)}`}
        />
      )}

      {/* Final result and shootout */}
      {playbackFinished && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent-text"><Trophy size={22} /></div>
              <div>
                <p className="text-xs text-muted">Final result</p>
                <p className="mt-1 font-black">{isDraw ? "It's a draw" : `${winnerName || "Winner"} wins${penaltiesPlayed ? " on penalties" : ""}`}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted">{matchData.player1_name} {matchData.player1_score} – {matchData.player2_score} {matchData.player2_name}</p>
            {penaltiesPlayed && <p className="mt-2 text-sm font-bold text-accent-text">Penalties: {finalPenalty1} – {finalPenalty2}</p>}
            {!isDraw && <button onClick={() => setCelebrate(true)} className="mt-3 flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-bold text-foreground/70 transition hover:bg-foreground/5"><Sparkles size={13} className="text-accent-text" />Replay celebration</button>}
          </div>

          <div className="rounded-2xl border border-accent/20 bg-accent/[0.05] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent-text"><Medal size={22} /></div>
              <div><p className="text-xs text-muted">Man of the Match</p><p className="mt-1 font-black">{motmName || "Not provided"}</p></div>
            </div>
            {motm && typeof motm === "object" && "rating" in motm && <p className="mt-3 text-sm text-accent-text">Rating: {safeNumber((motm as Player & { rating?: number }).rating).toFixed(1)}/10</p>}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-foreground/5 text-foreground/70"><Activity size={22} /></div>
              <div><p className="text-xs text-muted">Match events</p><p className="mt-1 font-black">{matchEvents.filter((event) => event.event_type === "GOAL").length} goals</p></div>
            </div>
            <p className="mt-4 text-sm text-muted">{matchEvents.length} recorded events in the match report.</p>
          </div>
        </div>
      )}

      {playbackFinished && penaltiesPlayed && (
        <div className="mt-5 rounded-[24px] border border-accent/25 bg-accent/[0.04] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Penalty shootout</p>
              <h2 className="mt-2 text-xl font-black">The decisive kicks</h2>
              <p className="mt-1 text-sm text-muted">
                {matchData.penalty_shootout?.sudden_death ? "Decided in sudden death." : "Decided after the penalty rounds."}
              </p>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-surface px-5 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Shootout score</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-accent-text">{finalPenalty1} – {finalPenalty2}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">{matchData.player1_name}</p>
              <p className="mt-1 text-sm font-bold">{finalPenalty1} penalties scored</p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="text-xs text-muted">{matchData.player2_name}</p>
              <p className="mt-1 text-sm font-bold">{finalPenalty2} penalties scored</p>
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="mt-6 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Live commentary</p><h2 className="mt-2 text-xl font-black">Match timeline</h2></div>
          <Goal className="text-accent-text" size={22} />
        </div>
        <div ref={timelineRef} onScroll={handleTimelineScroll} className="flex h-44 items-stretch gap-3 overflow-x-auto overflow-y-hidden rounded-xl pb-2 sm:h-48">
          {visibleEvents.length === 0 && <div className="flex h-full w-full items-center justify-center rounded-xl border border-border bg-foreground/[0.02] p-4 text-sm text-muted">Waiting for match events...</div>}
          {visibleEvents.map((event, eventIndex) => {
            const type = (event.event_type || "").toUpperCase();
            const isGoal = type === "GOAL";
            const isPenaltyGoal = type === "PENALTY_GOAL";
            const isPenaltySave = type === "PENALTY_SAVE";
            const isPenaltyMiss = type === "PENALTY_MISS";
            const isPenaltyKick = type === "PENALTY_KICK";
            const isPenalty = type.startsWith("PENALTY_");
            const isPenaltyStart = type === "PENALTY_SHOOTOUT_START";
            const isPenaltyEnd = type === "PENALTY_SHOOTOUT_END";
            const isCard = type.includes("CARD") || type.includes("BOOKING");
            const isExtraTimeStart = isExtraTimeStartType(type);
            const isExtraTimeBreak = isExtraTimeBreakType(type);
            const isHalfTime = isHalfTimeType(type);
            const isFullTime = isFullTimeType(type);
            // Penalty kicks are shown in the shootout panel, not here.
            if (isPenalty) return null;
            const playerName = getPlayerName(event.player);
            const secondaryName = getPlayerName(event.secondary_player);

            const title = isGoal ? "GOAL!"
              : isPenaltyGoal ? "Penalty scored!"
              : isPenaltySave ? "Penalty saved!"
              : isPenaltyMiss ? "Penalty missed"
              : isPenaltyKick ? "Penalty taker steps up"
              : isPenaltyStart ? "Penalty shootout"
              : isPenaltyEnd ? "Shootout complete"
              : isExtraTimeStart ? "Extra time begins"
              : isExtraTimeBreak ? "Extra-time break"
              : isHalfTime ? "Half-time"
              : isFullTime ? "Full-time"
              : formatEventType(type);

            const teamName = event.team_number === 1
              ? `${matchData.player1_name}${getTeamName(team1) ? ` · ${getTeamName(team1)}` : ""}`
              : event.team_number === 2
                ? `${matchData.player2_name}${getTeamName(team2) ? ` · ${getTeamName(team2)}` : ""}`
                : "";

            const roundLabel = isPenalty && !isPenaltyStart && !isPenaltyEnd
              ? `Round ${event.penalty_round ?? "—"}${event.is_sudden_death ? " · Sudden death" : ""}`
              : undefined;

            return (
              <TimelineItem
                key={`${matchData.match_id}-${event.event_number}`}
                minute={event.minute}
                eventType={type}
                title={title}
                description={event.commentary || title}
                highlight={isGoal || isPenaltyGoal || isPenaltyKick || isPenaltyEnd || isFullTime || isExtraTimeStart || isExtraTimeBreak}
                warning={isCard || isPenaltyMiss}
                teamName={teamName}
                playerName={playerName}
                secondaryName={secondaryName}
                secondaryLabel={isPenaltyKick ? "Goalkeeper" : "Assist"}
                score={liveBoard.scoreAfter[eventIndex] ?? ""}
                subtitle={roundLabel}
              />
            );
          })}
        </div>
        {!playbackFinished && <div className="mt-4 flex items-center gap-2 text-xs text-muted"><span className="h-2 w-2 animate-pulse rounded-full bg-accent-text" />{awaitingPenalties ? "Extra time is over. Press Start Penalties to begin the shootout." : penaltyStage === "live" ? "Penalty kicks are being revealed one at a time." : "Commentary is revealed as the match clock advances."}</div>}
      </div>

      {/* Statistics */}
      {playbackFinished && (
        <div className="mt-5 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Match statistics</p><h2 className="mt-2 text-xl font-black">Team comparison</h2></div>
            <BarChart3 size={22} className="text-accent-text" />
          </div>
          <div className="mb-5 grid grid-cols-3 items-center gap-2 rounded-xl bg-foreground/[0.03] p-3 text-center">
            <div><p className="text-[10px] text-muted">HOME</p><p className="mt-1 truncate text-sm font-bold">{getTeamName(team1) || matchData.player1_name}</p></div>
            <div className="text-xs font-bold text-muted">VS</div>
            <div><p className="text-[10px] text-muted">AWAY</p><p className="mt-1 truncate text-sm font-bold">{getTeamName(team2) || matchData.player2_name}</p></div>
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
              {penaltiesPlayed && <>
                <StatRow label="Penalty goals" left={safeNumber(team1Stats.penalty_goals)} right={safeNumber(team2Stats.penalty_goals)} />
                <StatRow label="Penalty misses" left={safeNumber(team1Stats.penalty_misses)} right={safeNumber(team2Stats.penalty_misses)} />
              </>}
            </div>
          ) : <EmptyData message="Team statistics were not returned by the backend. Check the match API response." />}
          <p className="mt-5 text-[11px] leading-5 text-muted">Statistics are the saved match totals returned by the simulator. Penalty shootout goals are displayed separately from match goals.</p>
        </div>
      )}

      {/* Squads */}
      <div className="mt-8">
        <SectionHeading eyebrow="Starting elevens" title="Team lineups" icon={<Users size={21} />} description="Your original drafted squads remain unchanged for every rematch. Player ratings appear on each card at full time." />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <SquadPitch name={matchData.player1_name} team={team1} number={1} players={player1Squad} complete ratings={team1Ratings} showRatings={playbackFinished} />
          <SquadPitch name={matchData.player2_name} team={team2} number={2} players={player2Squad} complete ratings={team2Ratings} showRatings={playbackFinished} />
        </div>
      </div>

      {/* Match history: completed matches only. The current match appears here once it has finished. */}
      {matchHistory.length > 1 && historyVisibleCount > 0 && (
        <div className="mt-8 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
          <SectionHeading eyebrow="This draft" title="Match history" icon={<Clock3 size={21} />} description="Completed matches from this page session. The current match is added once it finishes." />
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matchHistory.map((item, index) => {
              const isCurrent = item.match_id === matchData.match_id;
              // Hide the match that is still being played.
              if (isCurrent && !playbackFinished) return null;
              const itemHasPenalties = hasPenaltyShootout(item);
              const itemDraw = item.winner_number === 0 || (!itemHasPenalties && item.is_draw);
              return (
                <button key={item.match_id} onClick={() => onShowPrevious(item)} className={`rounded-2xl border p-4 text-left transition ${isCurrent ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-foreground/[0.02] hover:border-foreground/20"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">Match {matchHistory.length - index}</span>
                    {isCurrent && <span className="rounded-full bg-accent/10 px-2 py-1 text-[10px] font-bold text-accent-text">Viewing</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-bold">{item.player1_name}</span>
                    <span className="shrink-0 text-xl font-black tabular-nums">{item.player1_score} – {item.player2_score}</span>
                    <span className="min-w-0 truncate text-right text-sm font-bold">{item.player2_name}</span>
                  </div>
                  {itemHasPenalties && <p className="mt-2 text-xs font-bold text-accent-text">PEN {getPenaltyScore(item, 1)} – {getPenaltyScore(item, 2)}</p>}
                  <p className="mt-3 text-xs text-muted">{itemDraw ? "Draw" : `${getWinnerName(item)} won${itemHasPenalties ? " on penalties" : ""}`}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {playbackFinished && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {canControl ? <button onClick={onRematch} disabled={loading} className="flex items-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:opacity-50">{loading ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={17} />}Play rematch · Same squads</button> : controlNote && <div className="flex items-center gap-2 rounded-xl border border-border px-6 py-4 text-sm text-muted"><Clock3 size={16} className="text-accent-text" />{controlNote}</div>}
          <button onClick={onReset} disabled={loading} className="flex items-center gap-2 rounded-xl border border-border px-6 py-4 font-semibold text-foreground/75 transition hover:bg-foreground/5 disabled:opacity-50"><RotateCcw size={17} />{resetLabel}</button>
          <Link href="/" className="rounded-xl border border-border px-6 py-4 font-semibold text-foreground/75 transition hover:bg-foreground/5">Back home</Link>
        </div>
      )}
      {!playbackFinished && <p className="mt-6 text-center text-xs text-muted">{awaitingPenalties ? "Press Start Penalties above to begin the shootout." : penaltyStage === "live" ? "Penalty shootout in progress. Watch each kick unfold." : "Simulation in progress. Keep this page open to watch the full match."}</p>}
    </section>
  );
}

/* ================================================================== */
/* Penalty tracker                                                     */
/* ================================================================== */

function PenaltyCircle({
  state, number, suddenDeath,
}: {
  state: PenaltyTrackerData["team1"][number];
  number: number;
  suddenDeath: boolean;
}) {
  const base = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition-all duration-500 sm:h-11 sm:w-11 sm:text-sm";
  const ring = suddenDeath ? " ring-2 ring-accent/40 ring-offset-1 ring-offset-transparent" : "";

  if (state === "goal") {
    return <span title={`Kick ${number}: scored`} aria-label={`Kick ${number}: scored`} className={`${base}${ring} scale-100 border-emerald-400 bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.45)]`}><Check size={18} strokeWidth={3} /></span>;
  }

  if (state === "save" || state === "miss") {
    return <span title={`Kick ${number}: ${state === "save" ? "saved" : "missed"}`} aria-label={`Kick ${number}: ${state === "save" ? "saved" : "missed"}`} className={`${base}${ring} border-red-400 bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.4)]`}>{state === "save" ? <Shield size={16} strokeWidth={2.5} /> : <X size={18} strokeWidth={3} />}</span>;
  }

  if (state === "pending") {
    return <span title={`Kick ${number}: shooter is stepping up`} aria-label={`Kick ${number}: waiting for the result`} className={`${base}${ring} animate-pulse border-amber-400 bg-amber-400/20 text-amber-500 dark:text-amber-300`}>{number}</span>;
  }

  return <span title={`Kick ${number}: not taken yet`} aria-label={`Kick ${number}: not taken yet`} className={`${base}${ring} border-border bg-foreground/[0.04] text-muted`}>{number}</span>;
}

export function PenaltyShootoutView({
  tracker, team1Name, team2Name, team1, team2, score1, score2, mySeat = null,
  started, finished, onStart, currentKick, lastResult, regularScore,
}: {
  tracker: PenaltyTrackerData;
  team1Name: string;
  team2Name: string;
  team1?: Team | null;
  team2?: Team | null;
  score1: number;
  score2: number;
  mySeat?: number | null;
  started: boolean;
  finished: boolean;
  onStart: () => void;
  currentKick: MatchEvent | null;
  lastResult: MatchEvent | null;
  regularScore: string;
}) {
  const inSuddenDeath = tracker.slotCount > 5;

  const rows = [
    { number: 1 as const, name: team1Name, club: getTeamName(team1), slots: tracker.team1, score: score1 },
    { number: 2 as const, name: team2Name, club: getTeamName(team2), slots: tracker.team2, score: score2 },
  ];

  const resultType = (lastResult?.event_type || "").toUpperCase();
  const resultGood = resultType === "PENALTY_GOAL";

  return (
    <div className="mt-6 rounded-[24px] border border-accent/30 bg-surface p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Penalty shootout</p>
          <h2 className="mt-2 text-xl font-black">{finished ? "Shootout complete" : started ? "Every kick counts" : `Level at ${regularScore} after extra time`}</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" />Scored</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" />Missed / saved</span>
          {inSuddenDeath && <span className="rounded-full bg-accent/10 px-2 py-0.5 font-bold text-accent-text">Sudden death</span>}
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.number} className={`flex flex-col gap-3 rounded-2xl border p-3 transition sm:flex-row sm:items-center sm:gap-5 sm:p-4 ${tracker.activeTeam === row.number ? "border-accent/40 bg-accent/[0.05]" : "border-border bg-foreground/[0.02]"}`}>
            <div className="min-w-0 sm:w-44">
              <p className="truncate text-sm font-black">{row.name}{mySeat === row.number && <span className="text-muted"> (You)</span>}</p>
              {row.club && <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-muted">{row.club}</p>}
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2 sm:gap-3">
              {row.slots.map((state, index) => (
                <PenaltyCircle key={`${row.number}-${index}`} state={state} number={index + 1} suddenDeath={index >= 5} />
              ))}
            </div>
            <div className="text-right sm:w-14">
              <span className="text-3xl font-black tabular-nums text-accent-text">{row.score}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5">
        {!started && (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent/25 bg-accent/[0.06] p-5 text-center">
            <p className="text-sm text-muted">Five kicks each. Green for a goal, red for a miss or a save.</p>
            <button onClick={onStart} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-4 font-black text-accent-ink transition hover:brightness-110">
              <Play size={18} fill="currentColor" />Start Penalties<ArrowRight size={18} />
            </button>
          </div>
        )}

        {started && currentKick && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-400/[0.07] p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600 dark:text-amber-300">{currentKick.penalty_round ? `Round ${currentKick.penalty_round}` : "Shootout"}{currentKick.is_sudden_death ? " · Sudden death" : ""}</p>
            <p className="mt-1 text-lg font-black">{getPlayerName(currentKick.player) || "Penalty taker"} steps up</p>
            <p className="mt-1 text-sm text-muted">{getPlayerName(currentKick.secondary_player) || "The goalkeeper"} is ready in goal...</p>
          </div>
        )}

        {started && !currentKick && lastResult && (
          <div className={`rounded-2xl border p-4 text-center ${resultGood ? "border-emerald-400/40 bg-emerald-500/10" : "border-red-400/40 bg-red-500/10"}`}>
            <p className={`text-lg font-black ${resultGood ? "text-emerald-600 dark:text-emerald-300" : "text-red-600 dark:text-red-300"}`}>{resultGood ? "Scored!" : resultType === "PENALTY_SAVE" ? "Saved!" : "Missed!"}</p>
            <p className="mt-1 text-sm text-muted">{lastResult.commentary}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Winner celebration                                                  */
/* ================================================================== */

const GOLD = "#d4af37";
const GOLD_LIGHT = "#f1dc8f";

export function WinnerCelebration({
  winnerName, team, youWon, scoreLine, penaltyLine, onClose,
}: {
  winnerName: string;
  team?: Team | null;
  youWon: boolean;
  scoreLine: string;
  penaltyLine: string | null;
  onClose: () => void;
}) {
  // Restrained palette: gold, white and the winning club's own colours.
  const palette = useMemo(
    () => [GOLD, GOLD_LIGHT, "#ffffff", team?.primary_color, team?.secondary_color].filter(Boolean) as string[],
    [team],
  );

  // Thin streamers that drift down slowly, like a trophy-lift celebration.
  const streamers = useMemo(
    () => Array.from({ length: 64 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 6 + Math.random() * 5,
      width: 4 + Math.random() * 4,
      height: 14 + Math.random() * 14,
      drift: (Math.random() - 0.5) * 140,
      spin: 240 + Math.random() * 480,
      color: palette[Math.floor(Math.random() * palette.length)],
    })),
    [palette],
  );

  useEffect(() => {
    const timer = window.setTimeout(onClose, 14000);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-label={`${winnerName} wins`}
      onClick={onClose}
      className="fut-win-backdrop fixed inset-0 z-[200] flex cursor-pointer items-center justify-center overflow-hidden p-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(30,34,44,0.92) 0%, rgba(6,8,12,0.97) 65%)" }}
    >
      <style>{`
        @keyframes fut-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fut-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0); opacity: 0 } 8% { opacity: .95 } 100% { transform: translate3d(var(--dx),110vh,0) rotate(var(--spin)); opacity: .85 } }
        @keyframes fut-rise { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fut-line { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes fut-glow { 0%,100% { opacity: .55 } 50% { opacity: .85 } }
        @keyframes fut-sweep { 0% { transform: translateX(-120%) } 100% { transform: translateX(220%) } }
        .fut-win-backdrop { animation: fut-fade .4s ease-out both }
        .fut-streamer { position: absolute; top: 0; animation: fut-fall var(--dur) ease-in-out var(--delay) infinite; will-change: transform }
        .fut-beam { animation: fut-glow 4s ease-in-out infinite }
        .fut-line { transform-origin: center; animation: fut-line .9s cubic-bezier(.2,.8,.2,1) .5s both }
        .fut-sweep { animation: fut-sweep 3.4s ease-in-out 1.4s infinite }
        .fut-r1 { animation: fut-rise .7s ease-out .15s both }
        .fut-r2 { animation: fut-rise .7s ease-out .35s both }
        .fut-r3 { animation: fut-rise .7s ease-out .65s both }
        .fut-r4 { animation: fut-rise .7s ease-out .9s both }
        .fut-r5 { animation: fut-rise .7s ease-out 1.15s both }
        @media (prefers-reduced-motion: reduce) {
          .fut-streamer, .fut-beam, .fut-sweep { animation: none !important }
          .fut-streamer, .fut-sweep { display: none }
        }
      `}</style>

      {/* Stadium floodlight beams */}
      <div className="fut-beam pointer-events-none absolute -top-10 left-[12%] h-[70vh] w-40 origin-top -rotate-[18deg] sm:w-56" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.16), transparent 85%)", filter: "blur(18px)" }} />
      <div className="fut-beam pointer-events-none absolute -top-10 right-[12%] h-[70vh] w-40 origin-top rotate-[18deg] sm:w-56" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.16), transparent 85%)", filter: "blur(18px)", animationDelay: "1.2s" }} />

      {/* Streamers */}
      {streamers.map((piece) => (
        <span key={piece.id} className="fut-streamer pointer-events-none"
          style={{
            left: `${piece.left}%`, width: piece.width, height: piece.height,
            backgroundColor: piece.color, borderRadius: 1,
            ["--dx" as string]: `${piece.drift}px`, ["--spin" as string]: `${piece.spin}deg`,
            ["--dur" as string]: `${piece.duration}s`, ["--delay" as string]: `${piece.delay}s`,
          } as CSSProperties} />
      ))}

      {/* Main card */}
      <div className="relative z-10 w-full max-w-xl text-center" onClick={(event) => event.stopPropagation()}>
        <p className="fut-r1 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/60">Full time</p>

        <div className="fut-r1 mx-auto mt-6 flex h-20 w-20 items-center justify-center rounded-full" style={{ border: `1px solid ${GOLD}`, background: "rgba(212,175,55,0.08)", boxShadow: "0 0 40px rgba(212,175,55,0.25)" }}>
          <Trophy size={36} strokeWidth={1.5} style={{ color: GOLD }} />
        </div>

        <h2 className="fut-r2 mt-6 text-4xl font-black uppercase tracking-[0.18em] text-white sm:text-6xl">
          {youWon ? "Victory" : "Champions"}
        </h2>

        <div className="fut-line mx-auto mt-4 h-px w-40 sm:w-56" style={{ background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }} />

        <div className="fut-r3 mt-8 flex flex-col items-center gap-3">
          {team && <TeamBadge team={team} compact />}
          <p className="break-words text-2xl font-bold uppercase tracking-[0.12em] text-white sm:text-3xl">{winnerName}</p>
          {team && <p className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: GOLD_LIGHT }}>{team.name}</p>}
        </div>

        {/* Broadcast-style score strip */}
        <div className="fut-r4 relative mx-auto mt-8 max-w-md overflow-hidden rounded-md border border-white/10 bg-white/[0.04] px-5 py-4 backdrop-blur-sm">
          <span className="fut-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3" style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)" }} />
          <p className="relative text-sm font-semibold tracking-wide text-white/90 sm:text-base">{scoreLine}</p>
          {penaltyLine && <p className="relative mt-1 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: GOLD_LIGHT }}>{penaltyLine}</p>}
        </div>

        <button onClick={onClose} className="fut-r5 mx-auto mt-8 flex items-center gap-2 rounded-md px-8 py-3.5 text-sm font-bold uppercase tracking-[0.18em] text-black transition hover:brightness-110" style={{ background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})` }}>
          View match report<ArrowRight size={16} />
        </button>
        <p className="fut-r5 mt-3 text-[11px] text-white/40">Click anywhere or press Esc to continue</p>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Shared small components                                             */
/* ================================================================== */

export function TeamDropdown({
  teams, value, placeholder, onChange, disabled = false, excludedId = "",
}: {
  teams: Team[]; value: string; placeholder: string;
  onChange: (value: string) => void; disabled?: boolean; excludedId?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = teams.find((team) => String(team.id) === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative z-30 w-full">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[50px] w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm outline-none transition focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-60 ${open ? "border-accent-text/60 bg-surface-2" : "border-border bg-background hover:border-foreground/25"}`}>
        {selected ? <>{selected.logo_url ? <img src={selected.logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-black" style={{ backgroundColor: selected.primary_color || "#b9f36b" }}>{(selected.short_name || selected.name).slice(0, 3).toUpperCase()}</span>}<span className="min-w-0 flex-1 truncate font-semibold text-foreground">{selected.name}</span></> : <span className="min-w-0 flex-1 truncate text-muted">{placeholder}</span>}
        <ChevronDown size={17} className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && !disabled && <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100] overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl shadow-black/30">
        <div className="border-b border-border px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{excludedId ? "Choose a different club" : "Available clubs"}</div>
        <div role="listbox" className="max-h-64 overflow-y-auto p-1.5">
          {teams.length === 0 ? <p className="px-3 py-4 text-sm text-muted">No clubs available. Add teams in the backend first.</p> : teams.map((team) => {
            const id = String(team.id);
            const excluded = id === excludedId;
            const isSelected = id === value;
            return <button key={team.id} type="button" role="option" aria-selected={isSelected} disabled={excluded} onClick={() => { onChange(id); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-35 ${isSelected ? "bg-accent/10" : "hover:bg-foreground/[0.06]"}`}>
              {team.logo_url ? <img src={team.logo_url} alt="" className="h-8 w-8 shrink-0 object-contain" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-black" style={{ backgroundColor: team.primary_color || "#b9f36b" }}>{(team.short_name || team.name).slice(0, 3).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-bold ${isSelected ? "text-accent-text" : "text-foreground/85"}`}>{team.name}</span>{excluded && <span className="block text-[10px] text-muted">Already selected by the other manager</span>}</span>
              {isSelected && <Check size={16} className="shrink-0 text-accent-text" />}
            </button>;
          })}
        </div>
      </div>}
    </div>
  );
}

export function TeamBadge({ team, compact = false }: { team?: Team | null; compact?: boolean }) {
  if (!team) return null;
  const primary = team.primary_color || "#b9f36b";
  const secondary = team.secondary_color || "#080b10";
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border border-border bg-foreground/[0.03] ${compact ? "mx-auto w-fit max-w-full flex-col justify-center border-0 bg-transparent p-0" : "p-3"}`}>
      {team.logo_url ? <img src={team.logo_url} alt={`${team.name} logo`} className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} shrink-0 object-contain`} /> : <div className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-xl text-xs font-black`} style={{ backgroundColor: primary, color: secondary }}>{(team.short_name || team.name).slice(0, 3).toUpperCase()}</div>}
      {!compact && <div className="min-w-0"><p className="truncate text-sm font-bold">{team.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">Selected club</p></div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, icon, description }: { eyebrow: string; title: string; icon: ReactNode; description?: string }) {
  return <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent-text">{icon}</div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">{eyebrow}</p><h2 className="mt-1 text-2xl font-black">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-muted">{description}</p>}</div></div>;
}

export function EmptyData({ message }: { message: string }) {
  return <div className="rounded-xl border border-border bg-foreground/[0.02] p-4 text-sm leading-6 text-muted">{message}</div>;
}

export function ErrorMessage({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-300"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>{message}</span></div>;
}

function EventIcon({ type }: { type: string }) {
  const size = 14;
  if (type === "GOAL" || type === "PENALTY_GOAL") return <Goal size={size} />;
  if (type === "PENALTY_SAVE") return <Shield size={size} />;
  if (type === "PENALTY_MISS") return <Target size={size} />;
  if (type === "PENALTY_KICK") return <Footprints size={size} />;
  if (type.includes("RED_CARD")) return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-red-500" />;
  if (type.includes("CARD") || type.includes("BOOKING")) return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-amber-400" />;
  if (type.includes("KICKOFF")) return <Play size={size} />;
  if (type.includes("CORNER") || type.includes("OFFSIDE")) return <Flag size={size} />;
  if (type.includes("TACKLE") || type.includes("INTERCEPTION")) return <Zap size={size} />;
  if (type.includes("SAVE")) return <Shield size={size} />;
  if (type.includes("SHOT")) return <Target size={size} />;
  if (type.includes("FOUL")) return <Footprints size={size} />;
  if (type.includes("EXTRA_TIME") || type.includes("HALF_TIME") || type.includes("FULL_TIME") || type.includes("HALFTIME") || type.includes("FULLTIME") || type.includes("PENALTY_SHOOTOUT")) return <Timer size={size} />;
  return <Activity size={size} />;
}

function TimelineItem({
  minute, eventType, title, description, highlight = false, warning = false,
  teamName, playerName, secondaryName, secondaryLabel = "Assist", score, subtitle,
}: {
  minute: number; eventType: string; title: string; description: string;
  highlight?: boolean; warning?: boolean; teamName?: string;
  playerName?: string; secondaryName?: string; secondaryLabel?: string;
  score?: string; subtitle?: string;
}) {
  return (
    <div className={`flex h-full w-60 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border p-3 sm:w-72 ${highlight ? "border-accent/20 bg-accent/[0.05]" : warning ? "border-amber-400/20 bg-amber-400/[0.04]" : "border-border bg-foreground/[0.02]"}`} title={description}>
      <div className="flex items-center gap-2">
        <div className={`flex h-8 min-w-11 items-center justify-center rounded-lg text-xs font-black tabular-nums ${highlight ? "bg-accent/10 text-accent-text" : warning ? "bg-amber-400/10 text-amber-600 dark:text-amber-300" : "bg-foreground/[0.05] text-muted"}`}>{minute}&apos;</div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${highlight ? "bg-accent/10 text-accent-text" : warning ? "bg-amber-400/10 text-amber-600 dark:text-amber-300" : "bg-foreground/[0.05] text-muted"}`}><EventIcon type={eventType} /></span>
        <p className={`min-w-0 flex-1 truncate text-sm font-black ${highlight ? "text-accent-text" : warning ? "text-amber-700 dark:text-amber-200" : "text-foreground/85"}`}>{title}</p>
        {score && <span className="shrink-0 rounded-md bg-foreground/[0.06] px-2 py-1 text-[10px] font-black tabular-nums text-foreground/70">{score}</span>}
      </div>
      {subtitle && <span className="w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-text">{subtitle}</span>}
      {teamName && <span className="w-fit max-w-full truncate rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] text-muted">{teamName}</span>}
      {playerName && <p className="truncate text-xs font-bold text-foreground/75">{playerName}{secondaryName && <span className="font-medium text-muted"> · {secondaryLabel}: {secondaryName}</span>}</p>}
      <p className="line-clamp-3 text-xs leading-5 text-muted">{description}</p>
    </div>
  );
}

function StatRow({ label, left, right, suffix = "" }: { label: string; left: number; right: number; suffix?: string }) {
  const total = left + right;
  const leftWidth = total === 0 ? 50 : (left / total) * 100;
  const rightWidth = total === 0 ? 50 : (right / total) * 100;
  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className="font-bold tabular-nums text-foreground/80">{left}{suffix}</span>
        <span className="text-center text-xs text-muted">{label}</span>
        <span className="text-right font-bold tabular-nums text-foreground/80">{right}{suffix}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-l-full bg-accent-text transition-all duration-300" style={{ width: `${leftWidth}%` }} /><div className="h-full rounded-r-full bg-foreground/25" style={{ width: `${rightWidth}%` }} /></div>
    </div>
  );
}

export function PlayerAvatar({ player, className = "" }: { player: Player; className?: string }) {
  if (player.image_url) return <img src={player.image_url} alt={player.name} className={`shrink-0 border border-border bg-background object-cover ${className}`} />;
  return <div className={`flex shrink-0 items-center justify-center border border-border bg-background font-black text-accent-text ${className}`}>{player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>;
}

export function SquadPitch({
  name, team, number, players, active = false, complete = false,
  ratings = [], showRatings = false,
}: {
  name: string; team?: Team | null; number: number; players: Player[];
  active?: boolean; complete?: boolean; ratings?: PlayerRating[];
  showRatings?: boolean;
}) {
  const slots = useMemo(() => assignToFormation(players), [players]);
  const { ratingById, ratingByName } = useMemo(() => {
    const byId = new Map<string, PlayerRating>();
    const byName = new Map<string, PlayerRating>();
    ratings.forEach((item) => {
      const id = item.player?.id;
      if (id !== null && id !== undefined) byId.set(String(id), item);
      const key = (item.player?.name ?? "").trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, item);
    });
    return { ratingById: byId, ratingByName: byName };
  }, [ratings]);

  const findRating = (player: Player) => ratingById.get(String(player.id)) ?? ratingByName.get((player.name ?? "").trim().toLowerCase());

  return (
    <div className={`rounded-[28px] border p-4 transition sm:p-6 ${active ? "border-accent/50 bg-accent/[0.05]" : "border-border bg-surface"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${active ? "bg-accent text-accent-ink" : "bg-foreground/5 text-muted"}`}>{number}</div>
          <div className="min-w-0">
            <h3 className="truncate font-bold">{name}</h3>
            <p className="mt-0.5 text-xs text-muted">{players.length} / 11 players · 4–3–3</p>
            {team && <p className="mt-1 truncate text-xs font-semibold text-accent-text">{team.name}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {team?.logo_url && <img src={team.logo_url} alt={`${team.name} logo`} className="h-8 w-8 object-contain" />}
          {complete ? <span className="flex items-center gap-1 text-xs font-bold text-accent-text"><Check size={14} />Complete</span> : active ? <span className="rounded-full bg-accent/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-text">Picking</span> : <span className="text-xs text-muted">Waiting</span>}
        </div>
      </div>

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
            <div key={`${slot.code}-${index}`} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: slot.x, top: slot.y }} title={player ? `${player.name} (${player.position})` : slot.code}>
              {player ? <>
                <div className="relative">
                  <PlayerAvatar player={player} className="h-9 w-9 rounded-full border-[#b9f36b]/80! text-[11px] shadow-[0_0_16px_rgba(185,243,107,0.25)] sm:h-12 sm:w-12 sm:text-sm" />
                  {showRatings && <span className={`absolute -right-4 -top-2 z-20 min-w-[26px] rounded-md border border-black/40 px-1.5 py-0.5 text-center text-[10px] font-black leading-none tabular-nums shadow-lg sm:text-xs ${ratingText ? "bg-[#b9f36b] text-black" : "bg-white/25 text-white/80"}`} aria-label={ratingText ? `Match rating ${ratingText}` : "No match rating"}>{ratingText ?? "—"}</span>}
                </div>
                <span className="max-w-[68px] truncate rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white sm:max-w-[84px] sm:text-[10px]">{player.name.split(" ").slice(-1)[0]}</span>
              </> : <>
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/30 bg-black/20 text-[10px] font-black text-white/40 sm:h-12 sm:w-12 sm:text-xs">{slot.code}</div>
                <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/40 sm:text-[10px]">{slot.code}</span>
              </>}
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08110b]/20" />
      </div>

      {showRatings && ratings.length > 0 && <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
        <span>Average rating: <strong className="text-accent-text">{(ratings.reduce((sum, item) => sum + safeNumber(item.rating), 0) / ratings.length).toFixed(1)}</strong></span>
        <span>Goals: <strong className="text-foreground">{ratings.reduce((sum, item) => sum + safeNumber(item.goals), 0)}</strong></span>
        <span>Assists: <strong className="text-foreground">{ratings.reduce((sum, item) => sum + safeNumber(item.assists), 0)}</strong></span>
      </div>}
    </div>
  );
}