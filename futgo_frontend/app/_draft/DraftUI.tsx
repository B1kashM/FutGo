"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Check, ChevronDown,
  ChevronRight, CircleAlert, Clock3, Crown, Flag, Footprints, Goal,
  LoaderCircle, Medal, Play, RefreshCw, RotateCcw, Shield, Sparkles,
  Target, Timer, Trophy, Users, X, Zap,
} from "lucide-react";

import ThemeToggle from "../components/ThemeToggle";
import ClubPicker from "../components/ClubPicker";
import { useClub } from "../_theme/useClub";
import { useLockBodyScroll } from "./useLockBodyScroll";
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
/* Helpers                                                             */
/* ================================================================== */

function scrollPageToTop() {
  if (typeof window === "undefined") return;
  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

// While a full-screen popup is open, flag <body> so the page header, club picker
// and team dropdowns (see the CSS in each popup) are hidden and can never show
// through or over the popup.
const POPUP_HIDE_CSS = "body[data-fut-popup] .fut-team-dropdown, body[data-fut-popup] .fut-page-header { visibility: hidden !important }";

function usePopupFlag(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    document.body.setAttribute("data-fut-popup", "open");
    return () => document.body.removeAttribute("data-fut-popup");
  }, [active]);
}

/* ================================================================== */
/* Page shell                                                          */
/* ================================================================== */

export function DraftPageShell({ children }: { children: ReactNode }) {
  const { club } = useClub();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="brand-bar h-1.5 w-full" />
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 lg:px-10">
        {/* relative + z-40 keeps the club picker's own layers inside the header,
            so full-screen popups (rendered in a portal) always sit above it. */}
        <header className="fut-page-header relative z-40 flex flex-wrap items-center justify-between gap-x-3 gap-y-3 border-b border-border pb-4 sm:pb-5">
          <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="shirt flex h-9 w-9 items-center justify-center rounded-xl border-2 sm:h-10 sm:w-10">
              <Goal size={20} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-base font-black tracking-[0.16em] sm:text-lg">
                FUT<span className="text-accent-text">GO</span>
              </div>
              <div className="hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-muted min-[400px]:block">{club.brandTag}</div>
            </div>
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-3">
            {/* Scaled down on small screens so the picker never overflows the header */}
            <div className="min-w-0 max-w-full [zoom:0.8] sm:[zoom:0.9] lg:[zoom:1]">
              <ClubPicker />
            </div>
            <div className="shrink-0 [zoom:0.85] sm:[zoom:0.95] lg:[zoom:1]">
              <ThemeToggle />
            </div>
            <Link href="/" aria-label="Back home" className="flex shrink-0 items-center gap-2 rounded-full border border-foreground/25 bg-surface px-3 py-2 text-sm text-foreground/80 transition hover:border-accent-text/60 hover:text-foreground sm:px-4">
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">Back home</span>
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
            className={`relative flex min-h-[82px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition sm:p-4 ${
              selected
                ? "border-accent-text bg-accent/15 shadow-lg shadow-accent/15"
                : "border-foreground/15 bg-surface hover:border-foreground/35 hover:bg-surface-2"
            } disabled:opacity-60`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${selected ? "bg-accent/25" : "bg-foreground/10"}`}>{category.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black leading-tight text-foreground">{category.label}</span>
              <span className="mt-1 hidden text-[10px] leading-4 text-foreground/70 sm:block sm:text-xs">{category.description}</span>
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

  // The popup is rendered in a portal on document.body so nothing in the page
  // header (club picker, theme toggle) can ever show above it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // The two offered players appear in a popup. A new round (new offered
  // players) re-opens it; choosing a player closes it so the squads show.
  const offerKey = `${draft.current_event?.event_number ?? 0}-${activePlayer}-${offered.map((player) => player.id).join(",")}`;
  const [popupOpen, setPopupOpen] = useState(true);
  useEffect(() => { setPopupOpen(true); }, [offerKey]);

  const showPopup = popupOpen && offered.length > 0;

  // Freeze the page behind the popup (works on iOS and Android too).
  useLockBodyScroll(showPopup);
  usePopupFlag(showPopup && mounted);

  useEffect(() => {
    if (!showPopup) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !loading) setPopupOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showPopup, loading]);

  const handlePick = (player: Player) => {
    // Both managers can preview the offered cards, but only the active
    // manager is allowed to submit a pick.
    if (!canPick || loading) return;
    setPopupOpen(false);
    onPick(player);
  };

  const popup = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${currentName}, choose your footballer`}
      style={{ zIndex: 2147483000 }}
      className="fut-pick-backdrop fixed inset-0 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 backdrop-blur-md lg:p-8"
    >
      <style>{`
        ${POPUP_HIDE_CSS}
        @keyframes fut-pick-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fut-pick-pop { 0% { opacity: 0; transform: translateY(24px) scale(.92) } 100% { opacity: 1; transform: translateY(0) scale(1) } }
        .fut-pick-backdrop { animation: fut-pick-fade .25s ease-out both }
        .fut-pick-card-1 { animation: fut-pick-pop .45s cubic-bezier(.2,.9,.25,1.1) .05s both }
        .fut-pick-card-2 { animation: fut-pick-pop .45s cubic-bezier(.2,.9,.25,1.1) .2s both }
        @media (prefers-reduced-motion: reduce) {
          .fut-pick-backdrop, .fut-pick-card-1, .fut-pick-card-2 { animation: none !important }
        }
      `}</style>

      <div className="relative my-auto w-full max-w-4xl lg:max-w-5xl">
        <div className="mb-5 flex items-start justify-between gap-4 text-white lg:mb-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/70"><Zap size={14} />Round {round} of 11</div>
            <h2 className="mt-2 text-2xl font-black sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
              {promptLabel ?? (canPick ? `${currentName}, choose your footballer` : `${currentName} is choosing their footballer`)}
            </h2>
          </div>
          <button type="button" onClick={() => setPopupOpen(false)} disabled={loading} aria-label="Close and view squads" title="Close and view squads"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/30 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:gap-8">
          {offered.map((player, index) => (
            <button key={player.id} type="button" disabled={!canPick || loading}
              onClick={() => handlePick(player)}
              aria-label={canPick ? `Draft ${player.name}` : `Preview ${player.name}; waiting for opponent`}
              className={`${index === 0 ? "fut-pick-card-1" : "fut-pick-card-2"} group relative overflow-hidden rounded-3xl border-2 border-foreground/25 bg-surface p-5 text-left text-foreground shadow-xl shadow-black/40 transition duration-200 ${canPick ? "hover:-translate-y-1.5 hover:border-accent-text hover:shadow-accent/25" : "cursor-default"} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent/40 disabled:opacity-100 sm:p-7 lg:p-9`}>
              <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-accent/15 blur-3xl transition group-hover:bg-accent/30" />
              <div className="relative flex items-start justify-between gap-3">
                <span className="rounded-full border border-foreground/25 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/70 lg:text-xs">Option {index + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-accent px-3 py-1.5 text-sm font-black text-accent-ink lg:text-lg">{player.ovr_rating ?? 0} OVR</span>
                  <span className="rounded-full bg-foreground/10 px-3 py-1.5 text-xs font-bold text-foreground lg:text-base">{player.position}</span>
                </div>
              </div>
              <div className="relative mt-6 flex items-center gap-4 sm:gap-5 lg:mt-8 lg:gap-6">
                <PlayerAvatar player={player} className="h-20 w-20 rounded-2xl text-2xl sm:h-24 sm:w-24 sm:text-3xl lg:h-28 lg:w-28 lg:text-4xl" />
                <div className="min-w-0">
                  <h3 className="break-words text-xl font-black leading-tight sm:text-3xl lg:text-[2.1rem]">{player.name}</h3>
                  <p className="mt-2 text-xs leading-4 text-foreground/70 sm:text-sm lg:text-base">{[player.club, player.country].filter(Boolean).join(" · ") || "Football star"}</p>
                </div>
              </div>
              <div className="relative mt-6 flex items-center justify-between border-t border-foreground/15 pt-4 lg:mt-8">
                <span className={`text-sm font-bold lg:text-lg ${canPick ? "text-foreground/75 transition group-hover:text-accent-text" : "text-foreground/60"}`}>
                  {canPick ? "Draft this player" : "Opponent's option"}
                </span>
                {canPick && loading
                  ? <LoaderCircle size={19} className="animate-spin text-accent-text" />
                  : <span className={`flex h-9 w-9 items-center justify-center rounded-full bg-foreground/10 lg:h-11 lg:w-11 ${canPick ? "transition group-hover:bg-accent group-hover:text-accent-ink" : "text-foreground/60"}`}>
                      {canPick ? <ChevronRight size={17} /> : <Users size={16} />}
                    </span>}
              </div>
            </button>
          ))}
        </div>

        {error && <div className="mt-5"><ErrorMessage message={error} /></div>}
        <p className="mt-5 text-center text-xs text-white/60">
          {canPick ? "Pick one player to continue. Press Esc to close and view the squads." : "Previewing the two options. Only the active manager can make the pick."}
        </p>
      </div>
    </div>
  );

  return (
    <section className="py-8 sm:py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text"><Zap size={15} />{modeLabel} · Round {round} of 11</div>
          <h1 className="text-3xl font-black sm:text-5xl">{headline}</h1>
          <p className="mt-3 text-sm text-foreground/70 sm:text-base">{subline}</p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-surface px-3 py-1.5 text-xs font-semibold text-foreground/80"><Trophy size={13} className="text-accent-text" />{categoryLabel}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-foreground/15 sm:block"><div className="h-full rounded-full bg-accent-text transition-all duration-500" style={{ width: `${(round / 11) * 100}%` }} /></div>
          <div className="rounded-xl border-2 border-accent-text/40 bg-surface px-4 py-3">
            <div className="text-xs text-foreground/65">Current manager</div>
            <div className="mt-1 font-black text-foreground">{currentName}</div>
          </div>
        </div>
      </div>

      {/* Pick status bar (the cards themselves live in the popup) */}
      {offered.length > 0 && (
        canPick ? (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent-text/40 bg-surface p-4">
            <div className="flex items-center gap-3 text-sm font-bold text-foreground">
              <span className="text-accent-text">{loading ? <LoaderCircle size={18} className="animate-spin" /> : <Sparkles size={18} />}</span>
              {loading ? "Locking in your pick..." : (promptLabel ?? `${currentName}, choose your footballer`)}
            </div>
            {!loading && !showPopup && (
              <button type="button" onClick={() => setPopupOpen(true)} className="flex items-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-black text-accent-ink transition hover:brightness-110">
                <Users size={16} />Open player picks
              </button>
            )}
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border-2 border-foreground/15 bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-bold text-foreground/80"><span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent-text" />Waiting for {currentName} to choose...</span>
              {!showPopup && (
                <button
                  type="button"
                  onClick={() => setPopupOpen(true)}
                  className="flex items-center gap-2 rounded-xl border border-accent-text/50 px-4 py-2 text-xs font-bold text-foreground transition hover:bg-accent/10"
                >
                  <Users size={15} className="text-accent-text" />View player options
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {offered.map((player) => (
                <span key={player.id} className="flex items-center gap-2 rounded-full border border-foreground/20 bg-surface-2 px-3 py-1.5 text-xs font-semibold text-foreground">
                  <span className="font-black text-accent-text">{player.ovr_rating ?? 0}</span>{player.name}<span className="text-foreground/60">{player.position}</span>
                </span>
              ))}
            </div>
          </div>
        )
      )}

      {offered.length === 0 && <div className="rounded-2xl border border-foreground/20 bg-surface p-8 text-center"><p className="text-foreground/70">No player options were returned for this round.</p><button onClick={onRefresh} disabled={loading} className="mt-4 rounded-xl border border-foreground/25 px-4 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:opacity-60">Refresh draft</button></div>}
      {error && <div className="mt-5"><ErrorMessage message={error} /></div>}

      <div className="mb-5 mt-10 flex items-center gap-3"><div className="h-px flex-1 bg-foreground/20" /><span className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/70">Squads</span><div className="h-px flex-1 bg-foreground/20" /></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch name={seatName(1, draft.player1_name)} team={draft.player1_team} number={1} players={player1Squad} active={activePlayer === 1} />
        <SquadPitch name={seatName(2, draft.player2_name)} team={draft.player2_team} number={2} players={player2Squad} active={activePlayer === 2} />
      </div>
      <div className="mt-8 flex items-center justify-between border-t border-foreground/15 pt-5 text-xs text-foreground/70"><span>{player1Squad.length + player2Squad.length} / 22 players drafted</span><span className="flex items-center gap-2"><Check size={14} className="text-accent-text" />{footerNote}</span></div>

      {/* Player picks popup (portal → always above the header and club picker) */}
      {showPopup && mounted && createPortal(popup, document.body)}
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

  // Jump to the top straight away so the match timeline and goals are in view
  // the moment the match screen appears.
  const handleStartMatch = () => {
    scrollPageToTop();
    onStartMatch();
  };

  return (
    <section className="mx-auto max-w-6xl py-12 sm:py-16">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-ink"><Crown size={32} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-text">Draft complete</p>
        <h1 className="mt-3 text-4xl font-black sm:text-6xl">SQUADS LOCKED.</h1>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border-2 border-accent-text/40 bg-surface px-4 py-2 text-sm font-bold text-foreground"><Trophy size={15} className="text-accent-text" />{categoryLabel}</div>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <SquadPitch name={seatName(1, draft.player1_name)} team={draft.player1_team} number={1} players={player1Squad} complete />
        <SquadPitch name={seatName(2, draft.player2_name)} team={draft.player2_team} number={2} players={player2Squad} complete />
      </div>
      {error && <div className="mx-auto mt-6 max-w-2xl"><ErrorMessage message={error} /></div>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        {canStartMatch ? <button onClick={handleStartMatch} disabled={loading || player1Squad.length !== 11 || player2Squad.length !== 11} className="flex min-w-48 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><LoaderCircle size={19} className="animate-spin" />Preparing match...</> : <><Play size={18} fill="currentColor" />Start Match<ArrowRight size={18} /></>}</button> : <div className="flex min-w-48 items-center justify-center gap-2 rounded-xl border-2 border-accent-text/40 bg-surface px-6 py-4 text-sm font-bold text-foreground"><LoaderCircle size={17} className="animate-spin text-accent-text" />{waitingText || "Waiting for the host to start the match..."}</div>}
        <button onClick={onReset} disabled={loading} className="flex items-center gap-2 rounded-xl border border-foreground/25 bg-surface px-6 py-3 font-semibold text-foreground/80 transition hover:bg-foreground/5 disabled:opacity-50"><RotateCcw size={17} />{resetLabel}</button>
        <Link href="/" className="rounded-xl border border-foreground/25 bg-surface px-6 py-3 font-semibold text-foreground/80 transition hover:bg-foreground/5">Back home</Link>
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

  // Opening the match centre (Start Match, Rematch) always lands at the top,
  // where the scoreboard, goals and timeline are.
  useEffect(() => {
    scrollPageToTop();
  }, [matchData.match_id]);

  const handleWatchAgain = () => {
    scrollPageToTop();
    onWatchAgain();
  };

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

  // Yellow / red cards per player, built from the events revealed so far, so a
  // card appears on the player's lineup icon as soon as it is shown in the timeline.
  const cardsByPlayer = useMemo(() => {
    const map: Record<string, PlayerCards> = {};
    visibleEvents.forEach((event) => {
      const type = (event.event_type || "").toUpperCase();
      if (!(type.includes("CARD") || type.includes("BOOKING"))) return;
      const isRed = type.includes("SECOND_YELLOW") || type.includes("RED");
      const rawPlayer = event.player as unknown;
      const id = rawPlayer && typeof rawPlayer === "object" ? (rawPlayer as { id?: unknown }).id : undefined;
      const name = (getPlayerName(event.player) || "").trim().toLowerCase();
      const keys = [
        id !== undefined && id !== null ? `id:${String(id)}` : "",
        name ? `name:${name}` : "",
      ].filter(Boolean);
      keys.forEach((key) => {
        const entry = map[key] ?? { yellow: 0, red: 0 };
        if (isRed) entry.red += 1; else entry.yellow += 1;
        map[key] = entry;
      });
    });
    return map;
  }, [visibleEvents]);

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

  // Man of the Match: image, rating and contribution (from player_ratings).
  const motmObj = motm && typeof motm === "object" ? (motm as Player & { rating?: number }) : null;
  const motmRating = motmObj
    ? ratings.find((item) => item.player?.id !== null && item.player?.id !== undefined && String(item.player.id) === String(motmObj.id))
      ?? ratings.find((item) => (item.player?.name ?? "").trim().toLowerCase() === (motmObj.name ?? "").trim().toLowerCase())
    : undefined;
  const motmSquadMatch = motmObj
    ? [...player1Squad, ...player2Squad].find((item) => String(item.id) === String(motmObj.id))
    : undefined;
  const motmRatingPlayer = motmRating?.player as Player | undefined;
  const motmPlayer: Player | null = motmObj
    ? ({
        ...motmSquadMatch,
        ...motmRatingPlayer,
        ...motmObj,
        image_url: motmObj.image_url || motmRatingPlayer?.image_url || motmSquadMatch?.image_url,
      } as Player)
    : null;
  const motmStat = (key: string) =>
    Number(((motmRating as unknown as Record<string, unknown> | undefined)?.[key]) ?? 0) || 0;
  const motmRatingValue = motmRating
    ? safeNumber(motmRating.rating)
    : motmObj && motmObj.rating !== undefined && motmObj.rating !== null
      ? safeNumber(motmObj.rating)
      : null;
  const motmRatingText = motmRatingValue ? motmRatingValue.toFixed(1) : null;
  const motmTeamNumber = motmRating?.team_number ?? null;
  const motmTeamName = motmTeamNumber === 1
    ? getTeamName(team1) || matchData.player1_name
    : motmTeamNumber === 2
      ? getTeamName(team2) || matchData.player2_name
      : "";
  const motmExtraStats = [
    { label: "Shots", value: motmStat("shots") },
    { label: "On target", value: motmStat("shots_on_target") },
    { label: "Saves", value: motmStat("saves") },
    { label: "Tackles", value: motmStat("tackles") },
    { label: "Interceptions", value: motmStat("interceptions") },
    { label: "Pen. goals", value: motmStat("penalty_goals") },
  ].filter((item) => item.value > 0);

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
  const resultWinnerTeam = winnerNumber === 1 ? team1 : winnerNumber === 2 ? team2 : null;
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
          <p className="mt-3 text-sm text-foreground/70">{playbackFinished ? "The final whistle has blown. Explore the match report below." : awaitingPenalties ? "Still level after extra time. Press Start Penalties when you are ready." : penaltyStage === "live" ? "Every kick decides it. Watch the shootout unfold." : " "}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={handleWatchAgain} disabled={loading || !playbackFinished} className="flex items-center gap-2 rounded-xl border border-foreground/25 bg-surface px-4 py-3 text-sm font-semibold text-foreground/80 transition hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40"><RotateCcw size={16} />Watch again</button>
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
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">{matchData.player1_name || draft.player1_name || "Player 1"}{mySeat === 1 && <span className="text-foreground/60"> (You)</span>}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-foreground/65 sm:text-xs">{getTeamName(team1) || "Home team"}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 sm:gap-5">
              <span className="text-4xl font-black tabular-nums sm:text-7xl">{liveScore1}</span>
              <span className="text-xl font-bold text-foreground/50 sm:text-4xl">–</span>
              <span className="text-4xl font-black tabular-nums sm:text-7xl">{liveScore2}</span>
            </div>
            {showPenaltyScore && (
              <div className="mt-2 text-xs font-black tracking-wide text-accent-text">
                PEN {livePenalty1} – {livePenalty2}
              </div>
            )}
            <div className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${playbackFinished ? "bg-accent text-accent-ink" : "bg-foreground/10 text-foreground/80"}`}>
              {!playbackFinished && !awaitingPenalties && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />}
              {getMatchStatusLabel(matchMinute, playbackFinished, extraTimePlayed, penaltyStage)}
            </div>
          </div>
          <div className="min-w-0 text-center">
            <TeamBadge team={team2} compact />
            <h2 className="mt-3 break-words text-sm font-black sm:text-2xl">{matchData.player2_name || draft.player2_name || "Player 2"}{mySeat === 2 && <span className="text-foreground/60"> (You)</span>}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-foreground/65 sm:text-xs">{getTeamName(team2) || "Away team"}</p>
          </div>
        </div>

        {(liveBoard.scorers1.length > 0 || liveBoard.scorers2.length > 0) && (
          <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-foreground/15 pt-4 sm:gap-8">
            <ul className="space-y-1 text-right">{liveBoard.scorers1.map((goal, index) => <li key={`home-goal-${index}`} className="text-xs text-foreground/75 sm:text-sm"><span className="font-bold text-foreground">{goal.name}</span>{" "}<span className="font-black tabular-nums text-accent-text">{goal.minute}&apos;</span></li>)}</ul>
            <Goal size={16} className="mt-0.5 text-accent-text" />
            <ul className="space-y-1 text-left">{liveBoard.scorers2.map((goal, index) => <li key={`away-goal-${index}`} className="text-xs text-foreground/75 sm:text-sm"><span className="font-black tabular-nums text-accent-text">{goal.minute}&apos;</span>{" "}<span className="font-bold text-foreground">{goal.name}</span></li>)}</ul>
          </div>
        )}

        <div className="relative mt-8">
          <div className="mb-2 flex items-center justify-between text-xs text-foreground/70">
            <span className="flex items-center gap-2"><Clock3 size={14} />{playbackFinished ? "Match completed" : awaitingPenalties ? "Extra time over" : penaltyStage === "live" ? "Penalty shootout" : "Match clock"}</span>
            <span className="font-bold tabular-nums text-accent-text">{playbackFinished ? `${matchMinute}' / ${matchEndMinute}'` : `${matchMinute}'`}</span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-foreground/15"><div className="h-full rounded-full bg-accent-text transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, (matchMinute / progressEndMinute) * 100))}%` }} /></div>
          {!playbackFinished ? null : extraTimePlayed ? (
            <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-foreground/65"><span>Kick-off</span><span>45&apos; HT</span><span>90&apos; ET starts</span><span>105&apos; ET break</span><span>120&apos; FT</span></div>
          ) : <div className="mt-2 flex justify-between text-[10px] text-foreground/65"><span>Kick-off</span><span>45&apos; HT</span><span>90&apos; FT</span></div>}
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

      {/* Final result and Man of the Match */}
      {playbackFinished && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="relative overflow-hidden rounded-2xl border-2 p-5" style={{ borderColor: isDraw ? undefined : "rgba(212,175,55,0.65)" }}>
            <div className="absolute inset-0 bg-surface" />
            {!isDraw && <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.22), transparent 70%)" }} />}
            <div className="relative">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-foreground/70"><Flag size={14} />Final result</div>
              {isDraw ? (
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-foreground/10 text-foreground/70"><Trophy size={30} strokeWidth={1.6} /></div>
                  <div className="min-w-0">
                    <p className="text-xl font-black">It&apos;s a draw</p>
                    <p className="mt-1 text-sm text-foreground/75">No winner this time.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #f1dc8f, #d4af37)", boxShadow: "0 0 28px rgba(212,175,55,0.4)" }}>
                    <Trophy size={32} strokeWidth={1.8} style={{ color: "#3a2c04" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-yellow-700 dark:text-yellow-300">Winner{penaltiesPlayed ? " · on penalties" : ""}</p>
                    <p className="mt-1 break-words text-xl font-black leading-tight sm:text-2xl">{winnerName || "Winner"}</p>
                    {getTeamName(resultWinnerTeam) && <p className="mt-0.5 truncate text-xs font-semibold text-foreground/70">{getTeamName(resultWinnerTeam)}</p>}
                  </div>
                </div>
              )}
              <div className="mt-5 rounded-xl border border-foreground/15 bg-surface-2 px-4 py-3">
                <p className="text-sm font-bold text-foreground">{matchData.player1_name} {matchData.player1_score} – {matchData.player2_score} {matchData.player2_name}</p>
                {penaltiesPlayed && <p className="mt-1 text-sm font-bold text-accent-text">Penalties: {finalPenalty1} – {finalPenalty2}</p>}
              </div>
              {!isDraw && <button onClick={() => setCelebrate(true)} className="mt-3 flex items-center gap-2 rounded-lg border border-foreground/25 px-3 py-1.5 text-xs font-bold text-foreground/80 transition hover:bg-foreground/5"><Sparkles size={13} className="text-accent-text" />Replay celebration</button>}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl border-2 border-accent-text/40 bg-surface p-5">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-accent/20 blur-3xl" />
            <div className="relative flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text"><Medal size={15} />Man of the Match</div>
            {motmPlayer ? (
              <>
                <div className="relative mt-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <PlayerAvatar player={motmPlayer} className="h-20 w-20 rounded-2xl text-2xl sm:h-24 sm:w-24 sm:text-3xl" />
                    {motmRatingText && <span className="absolute -bottom-2 -right-2 rounded-lg border border-black/30 bg-accent px-2 py-1 text-sm font-black tabular-nums text-accent-ink shadow-lg">{motmRatingText}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-lg font-black leading-tight sm:text-xl">{motmName || motmPlayer.name}</p>
                    <p className="mt-1 text-xs text-foreground/70">{[motmPlayer.position, motmTeamName].filter(Boolean).join(" · ")}</p>
                    {motmRatingText && <p className="mt-1 text-sm font-bold text-accent-text">Rating {motmRatingText} / 10</p>}
                  </div>
                </div>
                <div className="relative mt-5 grid grid-cols-2 gap-2">
                  <MotmStatTile label="Goals" value={motmStat("goals")} highlight={motmStat("goals") > 0} />
                  <MotmStatTile label="Assists" value={motmStat("assists")} highlight={motmStat("assists") > 0} />
                </div>
                {motmExtraStats.length > 0 && (
                  <div className="relative mt-3 flex flex-wrap gap-2">
                    {motmExtraStats.map((item) => (
                      <span key={item.label} className="rounded-full border border-foreground/20 bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-foreground/75">
                        {item.label} <strong className="text-foreground">{item.value}</strong>
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="relative mt-3 font-black">Not provided</p>
            )}
          </div>
        </div>
      )}

      {playbackFinished && penaltiesPlayed && (
        <div className="mt-5 rounded-[24px] border border-accent-text/30 bg-surface p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Penalty shootout</p>
              <h2 className="mt-2 text-xl font-black">The decisive kicks</h2>
              <p className="mt-1 text-sm text-foreground/70">
                {matchData.penalty_shootout?.sudden_death ? "Decided in sudden death." : "Decided after the penalty rounds."}
              </p>
            </div>
            <div className="rounded-2xl border border-accent-text/30 bg-surface-2 px-5 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wider text-foreground/65">Shootout score</p>
              <p className="mt-1 text-3xl font-black tabular-nums text-accent-text">{finalPenalty1} – {finalPenalty2}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-foreground/65">{matchData.player1_name}</p>
              <p className="mt-1 text-sm font-bold">{finalPenalty1} penalties scored</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="text-xs text-foreground/65">{matchData.player2_name}</p>
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
          {visibleEvents.length === 0 && <div className="flex h-full w-full items-center justify-center rounded-xl border border-foreground/15 bg-surface-2 p-4 text-sm text-foreground/70">Waiting for match events...</div>}
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

            const tone = getTimelineTone(type);

            return (
              <TimelineItem
                key={`${matchData.match_id}-${event.event_number}`}
                minute={event.minute}
                eventType={type}
                title={title}
                description={event.commentary || title}
                tone={tone}
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
        {!playbackFinished && <div className="mt-4 flex items-center gap-2 text-xs text-foreground/70"><span className="h-2 w-2 animate-pulse rounded-full bg-accent-text" />{awaitingPenalties ? "Extra time is over. Press Start Penalties to begin the shootout." : penaltyStage === "live" ? "Penalty kicks are being revealed one at a time." : "Commentary is revealed as the match clock advances."}</div>}
      </div>

      {/* Statistics */}
      {playbackFinished && (
        <div className="mt-5 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/65">Match statistics</p><h2 className="mt-2 text-xl font-black">Team comparison</h2></div>
            <BarChart3 size={22} className="text-accent-text" />
          </div>
          <div className="mb-5 grid grid-cols-3 items-center gap-2 rounded-xl bg-surface-2 p-3 text-center">
            <div><p className="text-[10px] text-foreground/65">HOME</p><p className="mt-1 truncate text-sm font-bold">{getTeamName(team1) || matchData.player1_name}</p></div>
            <div className="text-xs font-bold text-foreground/65">VS</div>
            <div><p className="text-[10px] text-foreground/65">AWAY</p><p className="mt-1 truncate text-sm font-bold">{getTeamName(team2) || matchData.player2_name}</p></div>
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
          <p className="mt-5 text-[11px] leading-5 text-foreground/65">Statistics are the saved match totals returned by the simulator. Penalty shootout goals are displayed separately from match goals.</p>
        </div>
      )}

      {/* Squads */}
      <div className="mt-8">
        <SectionHeading eyebrow="Starting elevens" title="Team lineups" icon={<Users size={21} />} description=" " />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <SquadPitch name={matchData.player1_name} team={team1} number={1} players={player1Squad} complete ratings={team1Ratings} showRatings={playbackFinished} cards={cardsByPlayer} />
          <SquadPitch name={matchData.player2_name} team={team2} number={2} players={player2Squad} complete ratings={team2Ratings} showRatings={playbackFinished} cards={cardsByPlayer} />
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
                <button key={item.match_id} onClick={() => onShowPrevious(item)} className={`rounded-2xl border p-4 text-left transition ${isCurrent ? "border-accent-text/60 bg-accent/10" : "border-foreground/15 bg-surface-2 hover:border-foreground/30"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-foreground/65">Match {matchHistory.length - index}</span>
                    {isCurrent && <span className="rounded-full bg-accent px-2 py-1 text-[10px] font-bold text-accent-ink">Viewing</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-bold">{item.player1_name}</span>
                    <span className="shrink-0 text-xl font-black tabular-nums">{item.player1_score} – {item.player2_score}</span>
                    <span className="min-w-0 truncate text-right text-sm font-bold">{item.player2_name}</span>
                  </div>
                  {itemHasPenalties && <p className="mt-2 text-xs font-bold text-accent-text">PEN {getPenaltyScore(item, 1)} – {getPenaltyScore(item, 2)}</p>}
                  <p className="mt-3 text-xs text-foreground/70">{itemDraw ? "Draw" : `${getWinnerName(item)} won${itemHasPenalties ? " on penalties" : ""}`}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {playbackFinished && (
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {canControl ? <button onClick={onRematch} disabled={loading} className="flex items-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:opacity-50">{loading ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={17} />}Play rematch · Same squads</button> : controlNote && <div className="flex items-center gap-2 rounded-xl border border-foreground/20 bg-surface px-6 py-4 text-sm text-foreground/75"><Clock3 size={16} className="text-accent-text" />{controlNote}</div>}
          <button onClick={onReset} disabled={loading} className="flex items-center gap-2 rounded-xl border border-foreground/25 bg-surface px-6 py-4 font-semibold text-foreground/80 transition hover:bg-foreground/5 disabled:opacity-50"><RotateCcw size={17} />{resetLabel}</button>
          <Link href="/" className="rounded-xl border border-foreground/25 bg-surface px-6 py-4 font-semibold text-foreground/80 transition hover:bg-foreground/5">Back home</Link>
        </div>
      )}
      {!playbackFinished && <p className="mt-6 text-center text-xs text-foreground/65">{awaitingPenalties ? "Press Start Penalties above to begin the shootout." : penaltyStage === "live" ? "Penalty shootout in progress. Watch each kick unfold." : "Simulation in progress. Keep this page open to watch the full match."}</p>}
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
    return <span title={`Kick ${number}: shooter is stepping up`} aria-label={`Kick ${number}: waiting for the result`} className={`${base}${ring} animate-pulse border-amber-400 bg-amber-400/20 text-amber-600 dark:text-amber-300`}>{number}</span>;
  }

  return <span title={`Kick ${number}: not taken yet`} aria-label={`Kick ${number}: not taken yet`} className={`${base}${ring} border-foreground/25 bg-foreground/[0.06] text-foreground/60`}>{number}</span>;
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
    <div className="mt-6 rounded-[24px] border border-accent-text/30 bg-surface p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Penalty shootout</p>
          <h2 className="mt-2 text-xl font-black">{finished ? "Shootout complete" : started ? "Every kick counts" : `Level at ${regularScore} after extra time`}</h2>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-foreground/70">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" />Scored</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-red-500" />Missed / saved</span>
          {inSuddenDeath && <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-accent-ink">Sudden death</span>}
        </div>
      </div>

      <div className="space-y-4">
        {rows.map((row) => (
          <div key={row.number} className={`flex flex-col gap-3 rounded-2xl border p-3 transition sm:flex-row sm:items-center sm:gap-5 sm:p-4 ${tracker.activeTeam === row.number ? "border-accent-text/50 bg-accent/10" : "border-foreground/15 bg-surface-2"}`}>
            <div className="min-w-0 sm:w-44">
              <p className="truncate text-sm font-black">{row.name}{mySeat === row.number && <span className="text-foreground/60"> (You)</span>}</p>
              {row.club && <p className="mt-0.5 truncate text-[10px] uppercase tracking-wider text-foreground/65">{row.club}</p>}
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
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-accent-text/30 bg-surface-2 p-5 text-center">
            <p className="text-sm text-foreground/75">Five kicks each. Green for a goal, red for a miss or a save.</p>
            <button onClick={onStart} className="flex items-center justify-center gap-2 rounded-xl bg-accent px-8 py-4 font-black text-accent-ink transition hover:brightness-110">
              <Play size={18} fill="currentColor" />Start Penalties<ArrowRight size={18} />
            </button>
          </div>
        )}

        {started && currentKick && (
          <div className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-4 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-700 dark:text-amber-300">{currentKick.penalty_round ? `Round ${currentKick.penalty_round}` : "Shootout"}{currentKick.is_sudden_death ? " · Sudden death" : ""}</p>
            <p className="mt-1 text-lg font-black">{getPlayerName(currentKick.player) || "Penalty taker"} steps up</p>
            <p className="mt-1 text-sm text-foreground/75">{getPlayerName(currentKick.secondary_player) || "The goalkeeper"} is ready in goal...</p>
          </div>
        )}

        {started && !currentKick && lastResult && (
          <div className={`rounded-2xl border p-4 text-center ${resultGood ? "border-emerald-400/50 bg-emerald-500/10" : "border-red-400/50 bg-red-500/10"}`}>
            <p className={`text-lg font-black ${resultGood ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{resultGood ? "Scored!" : resultType === "PENALTY_SAVE" ? "Saved!" : "Missed!"}</p>
            <p className="mt-1 text-sm text-foreground/75">{lastResult.commentary}</p>
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
const CELEBRATION_MS = 14000;

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
  // Freeze the page behind the celebration overlay.
  useLockBodyScroll(true);
  usePopupFlag(true);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Club colour tints the whole stage; gold stays as the trophy accent.
  const clubColor = team?.primary_color || GOLD;

  // Restrained palette: gold, white and the winning club's own colours.
  const palette = useMemo(
    () => [GOLD, GOLD_LIGHT, "#ffffff", team?.primary_color, team?.secondary_color].filter(Boolean) as string[],
    [team],
  );

  // Ribbons and dots that drift down slowly, like a trophy-lift celebration.
  const pieces = useMemo(
    () => Array.from({ length: 72 }, (_, i) => {
      const round = i % 5 === 0;
      return {
        id: i,
        round,
        left: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 6 + Math.random() * 5,
        width: round ? 6 + Math.random() * 4 : 4 + Math.random() * 4,
        height: round ? 6 + Math.random() * 4 : 14 + Math.random() * 14,
        drift: (Math.random() - 0.5) * 160,
        spin: 240 + Math.random() * 480,
        color: palette[Math.floor(Math.random() * palette.length)],
      };
    }),
    [palette],
  );

  useEffect(() => {
    const timer = window.setTimeout(onClose, CELEBRATION_MS);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${winnerName} wins`}
      onClick={onClose}
      style={{
        zIndex: 2147483000,
        background: `radial-gradient(ellipse at 50% -10%, color-mix(in srgb, ${clubColor} 45%, #0a0d14) 0%, #05070b 72%)`,
      }}
      className="fut-win-backdrop fixed inset-0 flex cursor-pointer items-center justify-center overflow-y-auto overflow-x-hidden p-4"
    >
      <style>{`
        ${POPUP_HIDE_CSS}
        @keyframes fut-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fut-fall { 0% { transform: translate3d(0,-10vh,0) rotate(0); opacity: 0 } 8% { opacity: .95 } 100% { transform: translate3d(var(--dx),110vh,0) rotate(var(--spin)); opacity: .85 } }
        @keyframes fut-rise { from { transform: translateY(18px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes fut-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.08); opacity: 1 } 100% { transform: scale(1) } }
        @keyframes fut-line { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes fut-glow { 0%,100% { opacity: .5 } 50% { opacity: .9 } }
        @keyframes fut-sweep { 0% { transform: translateX(-120%) } 100% { transform: translateX(320%) } }
        @keyframes fut-spin { to { transform: rotate(360deg) } }
        @keyframes fut-pulse { 0%,100% { transform: scale(1); opacity: .5 } 50% { transform: scale(1.18); opacity: 0 } }
        @keyframes fut-bar { from { transform: scaleX(1) } to { transform: scaleX(0) } }
        .fut-win-backdrop { animation: fut-fade .4s ease-out both }
        .fut-piece { position: absolute; top: 0; animation: fut-fall var(--dur) ease-in-out var(--delay) infinite; will-change: transform }
        .fut-beam { animation: fut-glow 4s ease-in-out infinite }
        .fut-line { transform-origin: center; animation: fut-line .9s cubic-bezier(.2,.8,.2,1) .5s both }
        .fut-sweep { animation: fut-sweep 3.4s ease-in-out 1.4s infinite }
        .fut-ring { animation: fut-spin 6s linear infinite }
        .fut-halo { animation: fut-pulse 2.6s ease-out infinite }
        .fut-bar { transform-origin: left; animation: fut-bar ${CELEBRATION_MS}ms linear both }
        .fut-trophy { animation: fut-pop .8s cubic-bezier(.2,.9,.25,1.1) .15s both }
        .fut-r1 { animation: fut-rise .7s ease-out .15s both }
        .fut-r2 { animation: fut-rise .7s ease-out .35s both }
        .fut-r3 { animation: fut-rise .7s ease-out .65s both }
        .fut-r4 { animation: fut-rise .7s ease-out .9s both }
        .fut-r5 { animation: fut-rise .7s ease-out 1.15s both }
        @media (prefers-reduced-motion: reduce) {
          .fut-piece, .fut-beam, .fut-sweep, .fut-ring, .fut-halo, .fut-bar { animation: none !important }
          .fut-piece, .fut-sweep, .fut-halo { display: none }
        }
      `}</style>

      {/* Stadium floodlight beams */}
      <div className="fut-beam pointer-events-none absolute -top-10 left-[10%] h-[75vh] w-40 origin-top -rotate-[18deg] sm:w-56" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent 85%)", filter: "blur(18px)" }} />
      <div className="fut-beam pointer-events-none absolute -top-10 right-[10%] h-[75vh] w-40 origin-top rotate-[18deg] sm:w-56" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.18), transparent 85%)", filter: "blur(18px)", animationDelay: "1.2s" }} />

      {/* Confetti */}
      {pieces.map((piece) => (
        <span key={piece.id} className="fut-piece pointer-events-none"
          style={{
            left: `${piece.left}%`, width: piece.width, height: piece.height,
            backgroundColor: piece.color, borderRadius: piece.round ? "9999px" : 1,
            ["--dx" as string]: `${piece.drift}px`, ["--spin" as string]: `${piece.spin}deg`,
            ["--dur" as string]: `${piece.duration}s`, ["--delay" as string]: `${piece.delay}s`,
          } as CSSProperties} />
      ))}

      {/* Main card */}
      <div
        className="relative z-10 my-auto w-full max-w-xl cursor-default overflow-hidden rounded-3xl border border-white/15 bg-black/40 px-5 pb-6 pt-8 text-center shadow-2xl shadow-black/60 backdrop-blur-xl sm:px-10 sm:pb-8 sm:pt-10"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Gold top edge + auto-close timer */}
        <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }} />
        <div className="absolute inset-x-0 bottom-0 h-1 bg-white/10"><div className="fut-bar h-full" style={{ background: `linear-gradient(to right, ${GOLD}, ${GOLD_LIGHT})` }} /></div>

        <button type="button" onClick={onClose} aria-label="Close celebration"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:bg-white/10 hover:text-white">
          <X size={16} />
        </button>

        <p className="fut-r1 text-[11px] font-semibold uppercase tracking-[0.42em] text-white/70">Full time</p>

        {/* Trophy with spinning gold ring */}
        <div className="fut-trophy relative mx-auto mt-6 h-28 w-28">
          <span className="fut-halo absolute inset-0 rounded-full" style={{ border: `2px solid ${GOLD}` }} />
          <span className="fut-ring absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, ${GOLD}, transparent 35%, ${GOLD_LIGHT} 60%, transparent 85%, ${GOLD})`, padding: 3, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" } as CSSProperties} />
          <span className="absolute inset-[10px] flex items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 50% 30%, rgba(212,175,55,0.28), rgba(10,13,20,0.9))", boxShadow: "0 0 50px rgba(212,175,55,0.35)" }}>
            <Trophy size={44} strokeWidth={1.5} style={{ color: GOLD_LIGHT }} />
          </span>
        </div>

        <h2 className="fut-r2 mt-6 bg-clip-text text-4xl font-black uppercase tracking-[0.16em] text-transparent sm:text-6xl" style={{ backgroundImage: `linear-gradient(180deg, #ffffff 10%, ${GOLD_LIGHT} 55%, ${GOLD} 100%)` }}>
          {youWon ? "Victory" : "Champions"}
        </h2>
        <p className="fut-r2 mt-2 text-sm font-medium text-white/75">
          {youWon ? "You won the match. Well played!" : `${winnerName} takes the win.`}
        </p>

        <div className="fut-line mx-auto mt-4 h-px w-40 sm:w-56" style={{ background: `linear-gradient(to right, transparent, ${GOLD}, transparent)` }} />

        {/* Winning club */}
        <div className="fut-r3 mt-7 flex flex-col items-center gap-3">
          {team && (
            <div className="flex h-24 w-24 items-center justify-center rounded-full border border-white/20 bg-white/10 p-3 shadow-lg" style={{ boxShadow: `0 0 36px color-mix(in srgb, ${clubColor} 55%, transparent)` }}>
              <TeamBadge team={team} compact />
            </div>
          )}
          <p className="flex items-center gap-2 break-words text-2xl font-black uppercase tracking-[0.1em] text-white sm:text-3xl">
            <Crown size={22} style={{ color: GOLD }} className="shrink-0" />{winnerName}
          </p>
          {team && <p className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: GOLD_LIGHT }}>{team.name}</p>}
        </div>

        {/* Broadcast-style score strip */}
        <div className="fut-r4 relative mx-auto mt-7 max-w-md overflow-hidden rounded-xl border border-white/15 bg-white/[0.07] px-5 py-4">
          <span className="fut-sweep pointer-events-none absolute inset-y-0 left-0 w-1/4" style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)" }} />
          <p className="relative text-sm font-bold tracking-wide text-white sm:text-lg">{scoreLine}</p>
          {penaltyLine && <p className="relative mt-2 inline-block rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#1a1405", background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})` }}>{penaltyLine}</p>}
        </div>

        <button onClick={onClose} className="fut-r5 mx-auto mt-7 flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-black uppercase tracking-[0.16em] text-black shadow-lg transition hover:brightness-110" style={{ background: `linear-gradient(135deg, ${GOLD_LIGHT}, ${GOLD})` }}>
          View match report<ArrowRight size={16} />
        </button>
        <p className="fut-r5 mt-3 text-[11px] text-white/55">Click outside or press Esc to continue</p>
      </div>
    </div>
  );

  // Portal keeps the overlay above the page header and club picker.
  return mounted ? createPortal(overlay, document.body) : null;
}

/* ================================================================== */
/* Shared small components                                             */
/* ================================================================== */

// Real club colours from the backend win; otherwise fall back to the active theme
function teamChipStyle(team: Team): CSSProperties {
  return team.primary_color
    ? { backgroundColor: team.primary_color, color: "#000" }
    : { backgroundColor: "var(--accent)", color: "var(--accent-ink)" };
}

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
    <div ref={rootRef} className={`fut-team-dropdown relative w-full ${open ? "z-[60]" : "z-30"}`}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={() => setOpen((current) => !current)}
        className={`flex min-h-[50px] w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3 text-left text-sm outline-none transition focus:border-accent-text focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-60 ${open ? "border-accent-text bg-surface-2" : "border-foreground/25 bg-surface hover:border-foreground/45"}`}>
        {selected ? <>{selected.logo_url ? <img src={selected.logo_url} alt="" className="h-7 w-7 shrink-0 object-contain" /> : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[9px] font-black" style={teamChipStyle(selected)}>{(selected.short_name || selected.name).slice(0, 3).toUpperCase()}</span>}<span className="min-w-0 flex-1 truncate font-bold text-foreground">{selected.name}</span></> : <span className="min-w-0 flex-1 truncate text-foreground/65">{placeholder}</span>}
        <ChevronDown size={17} className={`shrink-0 text-foreground/70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && !disabled && <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[100] overflow-hidden rounded-2xl border-2 border-foreground/25 bg-surface shadow-2xl shadow-black/40">
        <div className="border-b border-foreground/15 bg-surface-2 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-[0.16em] text-foreground/70">{excludedId ? "Choose a different club" : "Available clubs"}</div>
        <div role="listbox" className="max-h-64 overflow-y-auto bg-surface p-1.5">
          {teams.length === 0 ? <p className="px-3 py-4 text-sm text-foreground/70">No clubs available. Add teams in the backend first.</p> : teams.map((team) => {
            const id = String(team.id);
            const excluded = id === excludedId;
            const isSelected = id === value;
            return <button key={team.id} type="button" role="option" aria-selected={isSelected} disabled={excluded} onClick={() => { onChange(id); setOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${isSelected ? "bg-accent/15" : "hover:bg-foreground/10"}`}>
              {team.logo_url ? <img src={team.logo_url} alt="" className="h-8 w-8 shrink-0 object-contain" /> : <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black" style={teamChipStyle(team)}>{(team.short_name || team.name).slice(0, 3).toUpperCase()}</span>}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{team.name}</span>{excluded && <span className="block text-[10px] text-foreground/65">Already selected by the other manager</span>}</span>
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
  const primary = team.primary_color || "var(--accent)";
  const secondary = team.secondary_color || "var(--accent-ink)";
  return (
    <div className={`flex min-w-0 items-center gap-3 rounded-xl border border-foreground/15 bg-surface-2 ${compact ? "mx-auto w-fit max-w-full flex-col justify-center border-0 bg-transparent p-0" : "p-3"}`}>
      {team.logo_url ? <img src={team.logo_url} alt={`${team.name} logo`} className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} shrink-0 object-contain`} /> : <div className={`${compact ? "h-12 w-12 sm:h-16 sm:w-16" : "h-10 w-10"} flex shrink-0 items-center justify-center rounded-xl text-xs font-black`} style={{ backgroundColor: primary, color: secondary }}>{(team.short_name || team.name).slice(0, 3).toUpperCase()}</div>}
      {!compact && <div className="min-w-0"><p className="truncate text-sm font-bold">{team.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-foreground/65">Selected club</p></div>}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, icon, description }: { eyebrow: string; title: string; icon: ReactNode; description?: string }) {
  return <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-ink">{icon}</div><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">{eyebrow}</p><h2 className="mt-1 text-2xl font-black">{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-foreground/70">{description}</p>}</div></div>;
}

export function EmptyData({ message }: { message: string }) {
  return <div className="rounded-xl border border-foreground/15 bg-surface-2 p-4 text-sm leading-6 text-foreground/70">{message}</div>;
}

export function ErrorMessage({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"><CircleAlert size={18} className="mt-0.5 shrink-0" /><span>{message}</span></div>;
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

/* Timeline cards use fixed semantic colours (green goal, amber card, accent for
   match phases) on solid surfaces, so they stay readable in every club theme. */
type TimelineTone =
  | "goal" | "red" | "yellow" | "shot" | "save" | "foul"
  | "setpiece" | "defense" | "sub" | "period" | "neutral";

type ToneStyle = { card: string; minute: string; icon: string; title: string };

const TIMELINE_TONES: Record<TimelineTone, ToneStyle> = {
  goal: {
    card: "border-emerald-500/70 bg-emerald-500/10",
    minute: "bg-emerald-500 text-white",
    icon: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    title: "text-emerald-700 dark:text-emerald-300",
  },
  red: {
    card: "border-red-500/70 bg-red-500/10",
    minute: "bg-red-600 text-white",
    icon: "bg-red-500/20 text-red-700 dark:text-red-300",
    title: "text-red-700 dark:text-red-300",
  },
  yellow: {
    card: "border-yellow-500/80 bg-yellow-400/15",
    minute: "bg-yellow-400 text-black",
    icon: "bg-yellow-400/25 text-yellow-700 dark:text-yellow-300",
    title: "text-yellow-700 dark:text-yellow-300",
  },
  shot: {
    card: "border-sky-500/60 bg-sky-500/10",
    minute: "bg-sky-500 text-white",
    icon: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
    title: "text-sky-700 dark:text-sky-300",
  },
  save: {
    card: "border-violet-500/60 bg-violet-500/10",
    minute: "bg-violet-500 text-white",
    icon: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    title: "text-violet-700 dark:text-violet-300",
  },
  foul: {
    card: "border-orange-500/60 bg-orange-500/10",
    minute: "bg-orange-500 text-white",
    icon: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
    title: "text-orange-700 dark:text-orange-300",
  },
  setpiece: {
    card: "border-teal-500/60 bg-teal-500/10",
    minute: "bg-teal-500 text-white",
    icon: "bg-teal-500/20 text-teal-700 dark:text-teal-300",
    title: "text-teal-700 dark:text-teal-300",
  },
  defense: {
    card: "border-indigo-500/60 bg-indigo-500/10",
    minute: "bg-indigo-500 text-white",
    icon: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
    title: "text-indigo-700 dark:text-indigo-300",
  },
  sub: {
    card: "border-pink-500/60 bg-pink-500/10",
    minute: "bg-pink-500 text-white",
    icon: "bg-pink-500/20 text-pink-700 dark:text-pink-300",
    title: "text-pink-700 dark:text-pink-300",
  },
  period: {
    card: "border-accent-text/60 bg-surface-2",
    minute: "bg-accent text-accent-ink",
    icon: "bg-accent/20 text-accent-text",
    title: "text-foreground",
  },
  neutral: {
    card: "border-foreground/20 bg-surface-2",
    minute: "bg-foreground/15 text-foreground",
    icon: "bg-foreground/10 text-foreground/75",
    title: "text-foreground",
  },
};

function getTimelineTone(type: string): TimelineTone {
  if (type === "GOAL") return "goal";
  if (type.includes("SECOND_YELLOW") || (type.includes("RED") && (type.includes("CARD") || type.includes("BOOKING")))) return "red";
  if (type.includes("CARD") || type.includes("BOOKING")) return "yellow";
  if (type.includes("SAVE")) return "save";
  if (type.includes("SHOT")) return "shot";
  if (type.includes("FOUL")) return "foul";
  if (type.includes("CORNER") || type.includes("OFFSIDE") || type.includes("FREE_KICK")) return "setpiece";
  if (type.includes("TACKLE") || type.includes("INTERCEPTION")) return "defense";
  if (type.includes("SUBSTITUTION") || type.includes("SUB_")) return "sub";
  if (isFullTimeType(type) || isHalfTimeType(type) || isExtraTimeStartType(type) || isExtraTimeBreakType(type) || type.includes("KICKOFF") || type === "PENALTY_SHOOTOUT_END") return "period";
  return "neutral";
}

function TimelineItem({
  minute, eventType, title, description, tone = "neutral",
  teamName, playerName, secondaryName, secondaryLabel = "Assist", score, subtitle,
}: {
  minute: number; eventType: string; title: string; description: string;
  tone?: TimelineTone; teamName?: string;
  playerName?: string; secondaryName?: string; secondaryLabel?: string;
  score?: string; subtitle?: string;
}) {
  const styles = TIMELINE_TONES[tone];
  return (
    <div className={`flex h-full w-60 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border-2 p-3 sm:w-72 ${styles.card}`} title={description}>
      <div className="flex items-center gap-2">
        <div className={`flex h-8 min-w-11 items-center justify-center rounded-lg px-1 text-xs font-black tabular-nums ${styles.minute}`}>{minute}&apos;</div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.icon}`}><EventIcon type={eventType} /></span>
        <p className={`min-w-0 flex-1 truncate text-sm font-black ${styles.title}`}>{title}</p>
        {score && <span className="shrink-0 rounded-md bg-foreground/10 px-2 py-1 text-[10px] font-black tabular-nums text-foreground">{score}</span>}
      </div>
      {subtitle && <span className="w-fit rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-ink">{subtitle}</span>}
      {teamName && <span className="w-fit max-w-full truncate rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold text-foreground/80">{teamName}</span>}
      {playerName && <p className="truncate text-xs font-bold text-foreground">{playerName}{secondaryName && <span className="font-medium text-foreground/70"> · {secondaryLabel}: {secondaryName}</span>}</p>}
      <p className="line-clamp-3 text-xs leading-5 text-foreground/75">{description}</p>
    </div>
  );
}

function MotmStatTile({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 text-center ${highlight ? "border-accent-text/50 bg-accent/15" : "border-foreground/15 bg-surface-2"}`}>
      <p className={`text-2xl font-black tabular-nums ${highlight ? "text-accent-text" : "text-foreground/80"}`}>{value}</p>
      <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground/65">{label}</p>
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
        <span className="font-bold tabular-nums text-foreground">{left}{suffix}</span>
        <span className="text-center text-xs text-foreground/70">{label}</span>
        <span className="text-right font-bold tabular-nums text-foreground">{right}{suffix}</span>
      </div>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/10"><div className="h-full rounded-l-full bg-accent-text transition-all duration-300" style={{ width: `${leftWidth}%` }} /><div className="h-full rounded-r-full bg-foreground/35" style={{ width: `${rightWidth}%` }} /></div>
    </div>
  );
}

export function PlayerAvatar({ player, className = "" }: { player: Player; className?: string }) {
  if (player.image_url) return <img src={player.image_url} alt={player.name} className={`shrink-0 border border-border bg-background object-cover ${className}`} />;
  return <div className={`flex shrink-0 items-center justify-center border border-border bg-background font-black text-accent-text ${className}`}>{player.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>;
}

type PlayerCards = { yellow: number; red: number };

export function SquadPitch({
  name, team, number, players, active = false, complete = false,
  ratings = [], showRatings = false, cards = {},
}: {
  name: string; team?: Team | null; number: number; players: Player[];
  active?: boolean; complete?: boolean; ratings?: PlayerRating[];
  showRatings?: boolean; cards?: Record<string, PlayerCards>;
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

  const findCards = (player: Player): PlayerCards | undefined =>
    cards[`id:${String(player.id)}`] ?? cards[`name:${(player.name ?? "").trim().toLowerCase()}`];

  const findRating = (player: Player) => ratingById.get(String(player.id)) ?? ratingByName.get((player.name ?? "").trim().toLowerCase());

  return (
    <div className={`rounded-[28px] border-2 p-4 transition sm:p-6 ${active ? "border-accent-text/60 bg-surface shadow-lg shadow-accent/10" : "border-border bg-surface"}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${active ? "bg-accent text-accent-ink" : "bg-foreground/10 text-foreground/75"}`}>{number}</div>
          <div className="min-w-0">
            <h3 className="truncate font-bold">{name}</h3>
            {team && <p className="mt-1 truncate text-xs font-semibold text-foreground/70">{team.name}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {team?.logo_url && <img src={team.logo_url} alt={`${team.name} logo`} className="h-8 w-8 object-contain" />}
          {complete ? <span> </span> : active ? <span className="rounded-full bg-accent px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-ink">Picking</span> : <span className="text-xs text-foreground/60">Waiting</span>}
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
          const playerCards = player ? findCards(player) : undefined;
          return (
            <div key={`${slot.code}-${index}`} className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1" style={{ left: slot.x, top: slot.y }} title={player ? `${player.name} (${player.position})` : slot.code}>
              {player ? <>
                <div className="relative">
                  <PlayerAvatar player={player} className="h-9 w-9 rounded-full border-trim! text-[11px] shadow-lg sm:h-12 sm:w-12 sm:text-sm" />
                  {playerCards && (playerCards.red > 0 || playerCards.yellow > 0) && (
                    <span className="absolute -left-2 -top-2 z-20 flex items-center gap-0.5" aria-label={`${playerCards.yellow} yellow, ${playerCards.red} red card${playerCards.red + playerCards.yellow === 1 ? "" : "s"}`}>
                      {Array.from({ length: Math.min(playerCards.yellow, 2) }).map((_, i) => <span key={`y-${i}`} title="Yellow card" className="inline-block h-4 w-3 rounded-[2px] border border-black/50 bg-yellow-400 shadow-md sm:h-[18px] sm:w-3.5" />)}
                      {playerCards.red > 0 && <span title="Red card" className="inline-block h-4 w-3 rounded-[2px] border border-black/50 bg-red-600 shadow-md sm:h-[18px] sm:w-3.5" />}
                    </span>
                  )}
                  {showRatings && <span className={`absolute -right-4 -top-2 z-20 min-w-[26px] rounded-md border border-black/40 px-1.5 py-0.5 text-center text-[10px] font-black leading-none tabular-nums shadow-lg sm:text-xs ${ratingText ? "bg-accent text-accent-ink" : "bg-white/25 text-white/80"}`} aria-label={ratingText ? `Match rating ${ratingText}` : "No match rating"}>{ratingText ?? "—"}</span>}
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

      {showRatings && ratings.length > 0 && <div className="mt-4 flex flex-wrap gap-3 text-xs text-foreground/70">
        <span>Average rating: <strong className="text-accent-text">{(ratings.reduce((sum, item) => sum + safeNumber(item.rating), 0) / ratings.length).toFixed(1)}</strong></span>
      </div>}
    </div>
  );
}