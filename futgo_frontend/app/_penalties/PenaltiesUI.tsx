"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleAlert,
  Copy,
  Crown,
  Footprints,
  LoaderCircle,
  RotateCcw,
  Shield,
  Smartphone,
  SlidersHorizontal,
  Target,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";

import ModeScreen from "../components/ModeScreen";
import {
  OUTCOME_META,
  PLAYER_OPTIONS,
  SLOT_ORDER,
  ZONE_KEYS,
  ZONE_LAYOUT,
  bracketHint,
  buildTracker,
} from "./penaltiesShared";
import type {
  BracketRound,
  CreateBody,
  GameState,
  Kick,
  MatchBrief,
  MatchDetail,
  Outcome,
  Pool,
  Seat,
  SquadPlayer,
  TrackerSlot,
  ZoneKey,
} from "./penaltiesShared";

/* ================================================================== */
/* Shell and small pieces                                              */
/* ================================================================== */

export function PenaltyShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="brand-bar h-1.5 w-full" />
      <div className="relative mx-auto max-w-5xl px-4 pb-12 pt-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          aria-label="Back home"
          className="absolute right-4 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-foreground/25 bg-surface text-foreground/80 transition hover:border-accent-text/60 hover:text-foreground sm:right-6 lg:right-8"
        >
          <ArrowLeft size={18} />
        </Link>
        {children}
      </div>
    </main>
  );
}

export function PageTitle({
  eyebrow,
  title,
  text,
}: {
  eyebrow: string;
  title: string;
  text?: string;
}) {
  return (
    <div className="mb-6 pr-12 pt-6 sm:pt-8">
      <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
        <Target size={15} />
        {eyebrow}
      </div>
      <h1 className="text-3xl font-black sm:text-5xl">{title}</h1>
      {text && <p className="mt-3 text-sm text-foreground/70 sm:text-base">{text}</p>}
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300"
    >
      <CircleAlert size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-border bg-surface p-4 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

function Avatar({
  name,
  src,
  className = "",
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className={`shrink-0 border border-border bg-background object-cover object-top ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border bg-background font-black text-accent-text ${className}`}
    >
      {name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    </div>
  );
}

/** Option button: filled with the club colour when selected, solid surface otherwise. */
function Choice({
  selected,
  onClick,
  title,
  text,
  icon,
  disabled = false,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  text?: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex min-h-[64px] items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${
        selected
          ? "border-accent bg-accent text-accent-ink shadow-lg shadow-accent/25"
          : "border-border bg-surface-2 text-foreground hover:border-accent/60"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {icon && (
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            selected ? "bg-accent-ink/15 text-accent-ink" : "bg-accent/15 text-accent-text"
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black leading-tight">{title}</span>
        {text && (
          <span
            className={`mt-0.5 block text-[11px] font-semibold ${
              selected ? "text-accent-ink/75" : "text-foreground/60"
            }`}
          >
            {text}
          </span>
        )}
      </span>
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-accent-ink text-accent">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

const inputClass =
  "w-full rounded-xl border-2 border-border bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground outline-none transition placeholder:text-foreground/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

function Label({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-black uppercase tracking-[0.16em] text-foreground/70">
      {children}
    </p>
  );
}

const primaryButton =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

const rulesButton =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-accent-2 px-6 py-3 text-sm font-black text-accent-2-ink transition hover:brightness-110";

/* ================================================================== */
/* Setup (create or join)                                              */
/* ================================================================== */

export function SetupScreen({
  pools,
  loading,
  error,
  initialCode,
  onCreate,
  onJoin,
}: {
  pools: Pool[];
  loading: boolean;
  error: string;
  initialCode: string;
  onCreate: (body: CreateBody) => void;
  onJoin: (code: string, name: string) => void;
}) {
  const [tab, setTab] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [mode, setMode] = useState<"LOCAL" | "ONLINE">(initialCode ? "ONLINE" : "LOCAL");
  // Step 1: pick Local / Online. Step 2: names, rules and start.
  const [step, setStep] = useState<"mode" | "form">(initialCode ? "form" : "mode");
  const [squadMode, setSquadMode] = useState<"RANDOM" | "DRAFT">("RANDOM");
  const [category, setCategory] = useState("ALL");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [code, setCode] = useState(initialCode);
  const [joinName, setJoinName] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);

  const players = mode === "LOCAL" ? 2 : maxPlayers;
  const needed = players * 11;
  const pool = pools.find((item) => item.key === category);
  const poolTooSmall = pool ? pool.count < needed : false;

  // The setup page does not scroll (released as soon as the game starts).
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const before = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
    };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = before.htmlOverflow;
      body.style.overflow = before.bodyOverflow;
      html.style.overscrollBehavior = before.htmlOverscroll;
      body.style.overscrollBehavior = before.bodyOverscroll;
    };
  }, []);

  // Close the rules popup with Escape.
  useEffect(() => {
    if (!rulesOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRulesOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rulesOpen]);

  const submit = () =>
    onCreate({
      mode,
      squad_mode: squadMode,
      player1_name: p1.trim(),
      player2_name: mode === "LOCAL" ? p2.trim() || "Player 2" : undefined,
      category,
      max_players: mode === "ONLINE" ? maxPlayers : 2,
    });

  const rulesSummary = `${squadMode === "RANDOM" ? "Random squad" : "Build own squad"} · ${
    pool?.label ?? "All players"
  }`;

  if (step === "mode") {
    return (
      <ModeScreen
        title="Play Penalties"
        modes={[
          { id: "local", title: "Local", tag: "Same device", icon: "local", variant: "a" },
          { id: "online", title: "Online", tag: "Room code", icon: "online", variant: "b" },
        ]}
        onSelect={(id) => {
          setMode(id === "local" ? "LOCAL" : "ONLINE");
          setTab("create");
          setStep("form");
        }}
      />
    );
  }

  return (
    <section className="mx-auto flex max-h-[calc(100dvh-4rem)] max-w-xl flex-col overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mb-4 pr-12 pt-4 sm:pt-6">
        <div className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-text">
          <Target size={15} />
          FutGo shootout
        </div>
        <h1 className="text-3xl font-black sm:text-4xl">PENALTY SHOOTOUT.</h1>
      </div>

      {/* Create Game / Join Room */}
      <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5">
        {(["create", "join"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
              tab === item
                ? "bg-accent text-accent-ink shadow-md shadow-accent/25"
                : "bg-surface-2 text-foreground/80 hover:text-foreground"
            }`}
          >
            {item === "create" ? "Create Game" : "Join Room"}
          </button>
        ))}
      </div>

      {tab === "create" ? (
        <Panel className="space-y-4">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-ink">
                {mode === "LOCAL" ? <Smartphone size={20} /> : <Users size={20} />}
              </span>
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-foreground/70">
                  Mode
                </p>
                <p className="text-sm font-black">
                  {mode === "LOCAL" ? "Local" : "Online"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep("mode")}
              className="rounded-lg bg-accent-2 px-3 py-1.5 text-xs font-black text-accent-2-ink transition hover:brightness-110"
            >
              Change
            </button>
          </div>

          {mode === "ONLINE" && (
            <div>
              <Label>No. of players</Label>
              <div className="grid grid-cols-5 gap-2">
                {PLAYER_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={maxPlayers === count}
                    onClick={() => setMaxPlayers(count)}
                    className={`rounded-xl border-2 py-2.5 text-lg font-black transition ${
                      maxPlayers === count
                        ? "border-accent bg-accent text-accent-ink shadow-md shadow-accent/25"
                        : "border-border bg-surface-2 text-foreground hover:border-accent/60"
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-foreground/65">{bracketHint(maxPlayers)}</p>
            </div>
          )}

          <div className={`grid gap-3 ${mode === "LOCAL" ? "sm:grid-cols-2" : ""}`}>
            <div>
              <Label>{mode === "LOCAL" ? "Player 1" : "Your name"}</Label>
              <input
                className={inputClass}
                value={p1}
                maxLength={50}
                onChange={(event) => setP1(event.target.value)}
                placeholder="Enter your name"
              />
            </div>
            {mode === "LOCAL" && (
              <div>
                <Label>Player 2</Label>
                <input
                  className={inputClass}
                  value={p2}
                  maxLength={50}
                  onChange={(event) => setP2(event.target.value)}
                  placeholder="Player 2"
                />
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => setRulesOpen(true)} className={rulesButton}>
              <SlidersHorizontal size={17} />
              Change game rules
            </button>
            <p className="mt-2 text-center text-xs text-foreground/65">{rulesSummary}</p>
            {poolTooSmall && (
              <p className="mt-1 text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
                This pool needs at least {needed} players. Change it in the game rules.
              </p>
            )}
          </div>

          {error && <ErrorMessage message={error} />}

          <button
            type="button"
            onClick={submit}
            disabled={loading || !p1.trim() || poolTooSmall}
            className={primaryButton}
          >
            {loading ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Creating...
              </>
            ) : (
              <>
                {mode === "LOCAL" ? "Start shootout" : "Create room"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </Panel>
      ) : (
        <Panel className="space-y-4">
          <div>
            <Label>Room code</Label>
            <input
              className={`${inputClass} text-center text-2xl font-black uppercase tracking-[0.4em]`}
              value={code}
              maxLength={8}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
            />
          </div>
          <div>
            <Label>Your name</Label>
            <input
              className={inputClass}
              value={joinName}
              maxLength={50}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="Enter your name"
            />
          </div>

          {error && <ErrorMessage message={error} />}

          <button
            type="button"
            onClick={() => onJoin(code.trim(), joinName.trim())}
            disabled={loading || code.trim().length < 4 || !joinName.trim()}
            className={primaryButton}
          >
            {loading ? (
              <>
                <LoaderCircle size={18} className="animate-spin" />
                Joining...
              </>
            ) : (
              <>
                Join room
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </Panel>
      )}

      {/* Game rules popup: Build your squad + Players pool */}
      {rulesOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Game rules"
          style={{ zIndex: 2147483000 }}
          onClick={() => setRulesOpen(false)}
          className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="relative flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-3xl border border-border bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border p-5 sm:px-7">
              <h2 className="text-xl font-black sm:text-2xl">Game rules</h2>
              <button
                type="button"
                onClick={() => setRulesOpen(false)}
                aria-label="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-foreground/80 transition hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:px-7">
              <div>
                <Label>Build your squad</Label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Choice
                    selected={squadMode === "RANDOM"}
                    onClick={() => setSquadMode("RANDOM")}
                    title="Random squad"
                    icon={<Zap size={20} />}
                  />
                  <Choice
                    selected={squadMode === "DRAFT"}
                    onClick={() => setSquadMode("DRAFT")}
                    title="Build own squad"
                    icon={<Crown size={20} />}
                  />
                </div>
              </div>

              <div>
                <Label>Players pool</Label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {pools.length === 0 && (
                    <p className="col-span-full text-sm text-foreground/70">Loading pools...</p>
                  )}
                  {pools.map((item) => (
                    <Choice
                      key={item.key}
                      selected={category === item.key}
                      onClick={() => setCategory(item.key)}
                      title={item.label}
                      text={`${item.count} players`}
                      disabled={item.count < needed}
                    />
                  ))}
                </div>
                {poolTooSmall && (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                    This pool needs at least {needed} players for {players} players.
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-border p-5 sm:px-7">
              <button type="button" onClick={() => setRulesOpen(false)} className={primaryButton}>
                Done
                <Check size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/* Lobby (online, waiting for players)                                 */
/* ================================================================== */

export function LobbyScreen({ state, onLeave }: { state: GameState; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      const link = `${window.location.origin}/penalties?room=${state.room_code}`;
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {

    }
  };

  const slots = Array.from({ length: state.max_players }, (_, index) => index + 1);

  return (
    <section className="mx-auto max-w-xl">
      <PageTitle
        eyebrow="Waiting room"
        title="WAITING FOR PLAYERS."
        text={`The shootout starts when all ${state.max_players} seats are filled.`}
      />

      <Panel className="text-center">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-foreground/70">
          Room code
        </p>
        <p className="mt-2 text-5xl font-black tracking-[0.3em] text-accent-text">
          {state.room_code}
        </p>
        <button
          type="button"
          onClick={copy}
          className="mx-auto mt-4 flex items-center gap-2 rounded-xl border border-foreground/25 px-4 py-2 text-xs font-bold text-foreground/80 transition hover:bg-foreground/5"
        >
          {copied ? <Check size={14} className="text-accent-text" /> : <Copy size={14} />}
          {copied ? "Invite link copied" : "Copy invite link"}
        </button>

        <div className="mt-6 space-y-2 text-left">
          {slots.map((seat) => {
            const player = state.players.find((item) => item.seat === seat);
            return (
              <div
                key={seat}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  player ? "border-accent-text/40 bg-accent/10" : "border-dashed border-foreground/25"
                }`}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black ${
                    player ? "bg-accent text-accent-ink" : "bg-foreground/10 text-foreground/60"
                  }`}
                >
                  {seat}
                </span>
                {player ? (
                  <span className="text-sm font-bold">
                    {player.name}
                    {player.is_you && <span className="text-foreground/60"> (You)</span>}
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-sm text-foreground/65">
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent-text" />
                    Waiting for a player...
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      <button
        type="button"
        onClick={onLeave}
        className="mx-auto mt-5 flex items-center gap-2 rounded-xl border border-foreground/25 bg-surface px-5 py-3 text-sm font-semibold text-foreground/80 transition hover:bg-foreground/5"
      >
        <X size={16} />
        Leave room
      </button>
    </section>
  );
}

/* ================================================================== */
/* Squad draft                                                         */
/* ================================================================== */

function SquadStrip({
  name,
  players,
  active,
  isYou,
}: {
  name: string;
  players: SquadPlayer[];
  active: boolean;
  isYou: boolean;
}) {
  const bySlot = new Map(players.map((player) => [player.slot, player]));
  return (
    <div
      className={`rounded-2xl border-2 p-3 transition ${
        active ? "border-accent-text/60 bg-surface shadow-lg shadow-accent/10" : "border-border bg-surface"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="truncate text-sm font-black">
          {name}
          {isYou && <span className="text-foreground/60"> (You)</span>}
        </p>
        <span className="text-[11px] font-bold text-foreground/65">{players.length}/11</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {SLOT_ORDER.map((slot) => {
          const player = bySlot.get(slot);
          return (
            <span
              key={slot}
              title={player ? `${player.name} (${player.ovr_rating})` : slot}
              className={`rounded-md px-2 py-1 text-[10px] font-bold ${
                player ? "bg-accent/20 text-foreground" : "border border-dashed border-foreground/25 text-foreground/50"
              }`}
            >
              {player ? `${slot} ${player.name.split(" ").slice(-1)[0]}` : slot}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function DraftScreen({
  state,
  canAct,
  loading,
  error,
  mySeat,
  onPick,
}: {
  state: GameState;
  canAct: boolean;
  loading: boolean;
  error: string;
  mySeat: Seat | null;
  onPick: (player: SquadPlayer) => void;
}) {
  const draft = state.draft;
  if (!draft) return null;

  const order = draft.order
    .map((seat) => state.players.find((p) => p.seat === seat)?.name ?? "")
    .join(" → ");

  return (
    <section>
      <PageTitle
        eyebrow={`Round ${draft.step} of ${draft.total_steps} · ${draft.position}`}
        title={canAct ? "MAKE YOUR PICK." : "SQUAD DRAFT."}
        text={
          canAct
            ? `${draft.picker_name}, choose your ${draft.position}. The others go to your rivals.`
            : `Waiting for ${draft.picker_name} to choose...`
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-foreground/15">
          <div
            className="h-full rounded-full bg-accent-text transition-all duration-500"
            style={{ width: `${(draft.step / draft.total_steps) * 100}%` }}
          />
        </div>
        <span className="text-xs text-foreground/70">Pick order: {order}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {draft.offers.map((player) => (
          <button
            key={player.player_id}
            type="button"
            disabled={!canAct || loading}
            onClick={() => onPick(player)}
            className={`group relative overflow-hidden rounded-3xl border-2 border-foreground/20 bg-surface p-4 text-left transition ${
              canAct ? "enabled:hover:-translate-y-1 enabled:hover:border-accent-text" : "cursor-default"
            }`}
          >
            <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-accent/15 blur-3xl" />
            <div className="relative flex items-center justify-between">
              <span className="rounded-lg bg-accent px-2.5 py-1 text-sm font-black text-accent-ink">
                {player.ovr_rating}
              </span>
              <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-bold">
                {player.natural_position}
              </span>
            </div>
            <div className="relative mt-4 flex flex-col items-center text-center">
              <Avatar name={player.name} src={player.image_url} className="h-20 w-20 rounded-2xl text-2xl sm:h-24 sm:w-24" />
              <h3 className="mt-3 break-words text-base font-black leading-tight sm:text-lg">
                {player.name}
              </h3>
              <p className="mt-1 text-[11px] text-foreground/70">
                {[player.club, player.country].filter(Boolean).join(" · ")}
              </p>
            </div>
            {canAct && (
              <div className="relative mt-3 flex items-center justify-center gap-1 text-xs font-bold text-foreground/75 transition group-hover:text-accent-text">
                {loading ? <LoaderCircle size={14} className="animate-spin" /> : "Draft this player"}
              </div>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <ErrorMessage message={error} />
        </div>
      )}

      <div className="mb-4 mt-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-foreground/20" />
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-foreground/70">Squads</span>
        <div className="h-px flex-1 bg-foreground/20" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {state.players.map((player) => (
          <SquadStrip
            key={player.seat}
            name={player.name}
            players={state.squads?.[String(player.seat)] ?? []}
            active={player.seat === draft.picker_seat}
            isYou={mySeat === player.seat}
          />
        ))}
      </div>
    </section>
  );
}

/* ================================================================== */
/* The goal (swipe to shoot / dive, and replay of a kick)              */
/* ================================================================== */

const VW = 400;
const VH = 260;
const GX = 30;
const GY = 24;
const GW = 340;
const GH = 150;
const CW = GW / 3;
const LINE_Y = GY + GH;
const SPOT = { x: 200, y: 224 };
// The ball and the keeper use the same duration and no delay, so they move at the same moment.
const MOVE = "0.6s cubic-bezier(.2,.8,.2,1)";

// Three zones: Left, Center, Right. Each one is a full-height third of the goal.
function zoneRect(zone: ZoneKey) {
  const { col } = ZONE_LAYOUT[zone];
  return { x: GX + col * CW, y: GY, cx: GX + (col + 0.5) * CW, cy: GY + GH / 2 };
}

function zoneAt(x: number): ZoneKey | null {
  const col = Math.min(2, Math.max(0, Math.floor((x - GX) / CW)));
  return ZONE_KEYS.find((k) => ZONE_LAYOUT[k].col === col) ?? null;
}

function ballTarget(zone: ZoneKey, outcome: Outcome) {
  const { cx, cy } = zoneRect(zone);
  const { col } = ZONE_LAYOUT[zone];
  switch (outcome) {
    case "WIDE":
      return { x: col === 0 ? 8 : col === 2 ? 392 : cx, y: cy };
    case "OVER":
      return { x: cx, y: 8 };
    case "POST":
      return { x: col === 0 ? GX : col === 2 ? GX + GW : cx, y: cy };
    case "BAR":
      return { x: cx, y: GY };
    default:
      return { x: cx, y: cy };
  }
}

function keeperPose(zone: ZoneKey | null) {
  if (!zone) return { x: 200, y: LINE_Y - 22, rot: 0 };
  const { cx } = zoneRect(zone);
  const { col } = ZONE_LAYOUT[zone];
  if (col === 1) return { x: cx, y: LINE_Y - 34, rot: 0 };
  return { x: cx, y: LINE_Y - 40, rot: col === 0 ? -60 : 60 };
}

export type GoalResult = { shot: ZoneKey; dive: ZoneKey; outcome: Outcome };

type Drag = { x1: number; y1: number; x2: number; y2: number };

export function GoalScene({
  result = null,
  role = null,
  locked = null,
  disabled = false,
  onSwipe,
}: {
  /** Replay mode: the ball and the keeper move together to their final places. */
  result?: GoalResult | null;
  /** Swipe mode: who is playing. Leave null for a view-only goal. */
  role?: "shoot" | "dive" | null;
  /** Zone already chosen (marks the zone, nothing moves until the kick is played). */
  locked?: ZoneKey | null;
  disabled?: boolean;
  onSwipe?: (zone: ZoneKey) => void;
}) {
  const [go, setGo] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const resultKey = result ? `${result.shot}|${result.dive}|${result.outcome}` : "";
  const interactive = !!role && !disabled && !locked && !result;

  useEffect(() => {
    if (!result) {
      setGo(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGo(true), 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultKey]);

  const toSvg = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * VW,
      y: ((e.clientY - rect.top) / rect.height) * VH,
    };
  };

  const onDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    setDrag({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toSvg(e);
    setDrag({ ...drag, x2: p.x, y2: p.y });
  };
  const onUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const p = toSvg(e);
    const dist = Math.hypot(p.x - drag.x1, p.y - drag.y1);
    setDrag(null);
    if (dist < 18) return; // too short, not a swipe
    const zone = zoneAt(p.x);
    if (zone) onSwipe?.(zone);
  };

  // The ball and the keeper only move in the replay, both at once.
  const aim = result && go ? ballTarget(result.shot, result.outcome) : null;
  const ball = aim ? { x: aim.x, y: aim.y, s: 0.7 } : { x: SPOT.x, y: SPOT.y, s: 1 };
  const keeper = keeperPose(result && go ? result.dive : null);

  const scored = result?.outcome === "GOAL" && go;
  const live = drag ? zoneAt(drag.x2) : null;
  const active = locked ?? live;
  const accent = role === "dive" ? "#38bdf8" : "#fbbf24";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-border shadow-lg">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className={`block h-auto w-full select-none ${interactive ? "cursor-grab" : ""}`}
        style={{ touchAction: "none" }}
        role="img"
        aria-label="Goal"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <linearGradient id="pg-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#166534" />
            <stop offset="1" stopColor="#22a04d" />
          </linearGradient>
          <radialGradient id="pg-light" cx="50%" cy="0%" r="80%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <pattern id="pg-net" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 0L10 10M10 0L0 10" stroke="white" strokeOpacity="0.28" strokeWidth="0.8" />
          </pattern>
          <radialGradient id="pg-ball" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cbd5e1" />
          </radialGradient>
        </defs>

        {/* Grass with mowing stripes */}
        <rect width={VW} height={VH} fill="url(#pg-grass)" />
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x="0" y={i * 32} width={VW} height="16" fill="white" opacity="0.045" />
        ))}
        <rect width={VW} height={VH} fill="url(#pg-light)" />

        {/* Pitch markings */}
        <g stroke="white" strokeOpacity="0.75" strokeWidth="2" fill="none">
          <line x1="0" y1={LINE_Y} x2={VW} y2={LINE_Y} />
          <rect x="70" y={LINE_Y} width="260" height="34" />
          <rect x="8" y={LINE_Y} width="384" height="80" />
          <path d="M160 254 A44 44 0 0 1 240 254" />
        </g>
        <circle cx={SPOT.x} cy={SPOT.y + 3} r="2.6" fill="white" opacity="0.85" />

        {/* Net */}
        <rect x={GX} y={GY} width={GW} height={GH} fill="rgba(0,0,0,0.28)" />
        <rect x={GX} y={GY} width={GW} height={GH} fill="url(#pg-net)" />

        {/* Posts */}
        <rect
          x={GX}
          y={GY + 4}
          width={GW}
          height={GH}
          fill="none"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <rect
          x={GX}
          y={GY}
          width={GW}
          height={GH}
          fill="none"
          stroke="white"
          strokeWidth="6"
          strokeLinejoin="round"
        />

        {/* Faint zone lines while it is your turn */}
        {interactive && (
          <g stroke="white" strokeOpacity="0.35" strokeDasharray="4 5">
            <line x1={GX + CW} y1={GY} x2={GX + CW} y2={LINE_Y} />
            <line x1={GX + 2 * CW} y1={GY} x2={GX + 2 * CW} y2={LINE_Y} />
          </g>
        )}

        {/* Replay markers: shot zone and dive zone */}
        {result && (
          <>
            <rect
              x={zoneRect(result.dive).x}
              y={GY}
              width={CW}
              height={GH}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
            <rect
              x={zoneRect(result.shot).x}
              y={GY}
              width={CW}
              height={GH}
              fill={scored ? "#10b981" : "#fbbf24"}
              stroke="#fbbf24"
              strokeWidth="3"
              style={{ opacity: go ? 0.4 : 0, transition: "opacity .4s ease .6s" }}
            />
          </>
        )}

        {/* Zone under the finger / locked zone */}
        {!result && active && (
          <rect
            x={zoneRect(active).x}
            y={GY}
            width={CW}
            height={GH}
            fill={accent}
            fillOpacity={locked ? 0.45 : 0.3}
            stroke={accent}
            strokeWidth="3"
          />
        )}

        {/* Keeper */}
        <g
          style={{
            transform: `translate(${keeper.x}px, ${keeper.y}px) rotate(${keeper.rot}deg)`,
            transition: `transform ${MOVE}`,
          }}
        >
          <rect x="-7" y="10" width="5" height="15" rx="2" fill="#1e293b" />
          <rect x="2" y="10" width="5" height="15" rx="2" fill="#1e293b" />
          <rect x="-9" y="-6" width="18" height="20" rx="7" fill="#f97316" />
          <circle cx="0" cy="-13" r="6" fill="#e8b98f" />
          <line x1="-9" y1="-2" x2="-21" y2="-12" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
          <line x1="9" y1="-2" x2="21" y2="-12" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
          <circle cx="-22" cy="-13" r="4.5" fill="#fde047" />
          <circle cx="22" cy="-13" r="4.5" fill="#fde047" />
        </g>

        {/* Swipe cue for the shooter: left, up or right */}
        {interactive && role === "shoot" && !drag && (
          <g
            className="animate-pulse"
            stroke="white"
            strokeOpacity="0.6"
            strokeWidth="3"
            strokeDasharray="4 6"
            strokeLinecap="round"
            fill="none"
          >
            <path d="M200 204 L128 150" />
            <path d="M200 204 L200 150" />
            <path d="M200 204 L272 150" />
          </g>
        )}

        {/* Swipe trail */}
        {drag && (
          <g>
            <line
              x1={drag.x1}
              y1={drag.y1}
              x2={drag.x2}
              y2={drag.y2}
              stroke="white"
              strokeWidth="3"
              strokeDasharray="2 6"
              strokeLinecap="round"
              opacity="0.9"
            />
            <circle cx={drag.x2} cy={drag.y2} r="7" fill={accent} stroke="white" strokeWidth="2" />
          </g>
        )}

        {/* Ball */}
        <ellipse cx={ball.x} cy={ball.y + 9} rx="8" ry="2.5" fill="black" opacity={aim ? 0 : 0.3} />
        <g
          style={{
            transform: `translate(${ball.x}px, ${ball.y}px) scale(${ball.s})`,
            transition: `transform ${MOVE}`,
          }}
        >
          <circle r="9" fill="url(#pg-ball)" stroke="#1f2937" strokeWidth="1.5" />
          <polygon points="0,-4 3.8,-1.2 2.4,3.2 -2.4,3.2 -3.8,-1.2" fill="#1f2937" />
        </g>
      </svg>
    </div>
  );
}

/* ================================================================== */
/* Shootout tracker and scoreboard                                     */
/* ================================================================== */

function TrackerCircle({
  state,
  number,
  sudden,
}: {
  state: TrackerSlot;
  number: number;
  sudden: boolean;
}) {
  const base = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-black transition-all duration-500 sm:h-10 sm:w-10 ${
    sudden ? "ring-2 ring-accent/40" : ""
  }`;

  if (state === "goal") {
    return (
      <span className={`${base} border-emerald-400 bg-emerald-500 text-white shadow-[0_0_14px_rgba(16,185,129,0.45)]`}>
        <Check size={17} strokeWidth={3} />
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className={`${base} border-red-400 bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.4)]`}>
        <Shield size={16} strokeWidth={2.5} />
      </span>
    );
  }
  if (state === "miss") {
    return (
      <span className={`${base} border-red-400 bg-red-500 text-white shadow-[0_0_14px_rgba(239,68,68,0.4)]`}>
        <X size={17} strokeWidth={3} />
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span className={`${base} animate-pulse border-amber-400 bg-amber-400/20 text-amber-600 dark:text-amber-300`}>
        {number}
      </span>
    );
  }
  return (
    <span className={`${base} border-foreground/25 bg-foreground/[0.06] text-foreground/60`}>
      {number}
    </span>
  );
}

export function ShootoutTracker({
  match,
  mySeat,
}: {
  match: MatchDetail;
  mySeat: Seat | null;
}) {
  const tracker = buildTracker(match);
  const attacker = match.status === "ACTIVE" ? match.current?.attacker_seat : null;

  const rows = [
    { seat: match.seat_a, name: match.name_a, slots: tracker.a, score: match.score_a },
    { seat: match.seat_b, name: match.name_b, slots: tracker.b, score: match.score_b },
  ];

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div
          key={row.seat}
          className={`flex flex-col gap-3 rounded-2xl border p-3 transition sm:flex-row sm:items-center sm:gap-5 sm:p-4 ${
            attacker === row.seat ? "border-accent-text/50 bg-accent/10" : "border-foreground/15 bg-surface-2"
          }`}
        >
          <div className="min-w-0 sm:w-40">
            <p className="truncate text-sm font-black">
              {row.name}
              {mySeat === row.seat && <span className="text-foreground/60"> (You)</span>}
            </p>
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {row.slots.map((slot, index) => (
              <TrackerCircle key={index} state={slot} number={index + 1} sudden={index >= 5} />
            ))}
          </div>
          <span className="text-3xl font-black tabular-nums text-accent-text sm:w-12 sm:text-right">
            {row.score}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ================================================================== */
/* The match panel (swipe to shoot / dive)                             */
/* ================================================================== */

const DIVE_SECONDS = 5;

function Countdown({ left }: { left: number }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const urgent = left <= 2;
  return (
    <div className="absolute right-3 top-3 flex h-12 w-12 items-center justify-center">
      <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90">
        <circle cx="22" cy="22" r={R} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r={R}
          fill="none"
          stroke={urgent ? "#ef4444" : "#fbbf24"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - left / DIVE_SECONDS)}
        />
      </svg>
      <span className="relative text-base font-black tabular-nums text-white">{Math.ceil(left)}</span>
    </div>
  );
}

function SwipeArena({
  role,
  waitText,
  loading,
  error,
  onCommit,
}: {
  role: "shoot" | "dive" | "wait";
  waitText: string;
  loading: boolean;
  error: string;
  onCommit: (zone: ZoneKey) => void;
}) {
  const [locked, setLocked] = useState<ZoneKey | null>(null);
  const [left, setLeft] = useState(DIVE_SECONDS);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  });

  // If the server rejects the move, let the player swipe again.
  useEffect(() => {
    if (error) setLocked(null);
  }, [error]);

  // 5 second timer for the goalkeeper. When it ends, a random dive is sent.
  useEffect(() => {
    if (role !== "dive" || locked) return undefined;
    setLeft(DIVE_SECONDS);
    const end = Date.now() + DIVE_SECONDS * 1000;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      setLeft(remaining / 1000);
      if (remaining === 0) {
        window.clearInterval(id);
        const zone = ZONE_KEYS[Math.floor(Math.random() * ZONE_KEYS.length)];
        setLocked(zone);
        commitRef.current(zone);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [role, locked]);

  const swipe = (zone: ZoneKey) => {
    if (locked) return;
    setLocked(zone);
    onCommit(zone);
  };

  const pill =
    role === "wait"
      ? waitText
      : locked
        ? role === "shoot"
          ? "Shot locked"
          : "Dive locked"
        : role === "shoot"
          ? "Swipe to shoot"
          : "Swipe to dive";

  return (
    <div className="relative">
      <GoalScene role={role === "wait" ? null : role} locked={locked} onSwipe={swipe} />

      <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white backdrop-blur">
        {role === "wait" && <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />}
        {pill}
      </span>

      {role === "dive" && !locked && <Countdown left={left} />}

      {loading && (
        <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white">
          <LoaderCircle size={18} className="animate-spin" />
        </span>
      )}
    </div>
  );
}

export function MatchPanel({
  match,
  mySeat,
  role,
  waitText,
  onCommit,
  loading,
  error,
  onConcede,
}: {
  match: MatchDetail;
  mySeat: Seat | null;
  role: "shoot" | "dive" | "wait";
  waitText: string;
  /** Called once when the player swipes (or when the dive timer runs out). */
  onCommit: (zone: ZoneKey) => void;
  loading: boolean;
  error: string;
  onConcede: () => void;
}) {
  const current = match.current;
  if (!current) return null;

  return (
    <section className="mx-auto max-w-xl space-y-3 pt-12">
      {/* Scoreboard */}
      <div className="rounded-2xl border border-border bg-surface px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <p className="truncate text-center text-sm font-black sm:text-lg">
            {match.name_a}
            {mySeat === match.seat_a && <span className="text-foreground/60"> (You)</span>}
          </p>
          <div className="flex items-center gap-3 text-4xl font-black tabular-nums sm:text-5xl">
            <span>{match.score_a}</span>
            <span className="text-foreground/50">–</span>
            <span>{match.score_b}</span>
          </div>
          <p className="truncate text-center text-sm font-black sm:text-lg">
            {match.name_b}
            {mySeat === match.seat_b && <span className="text-foreground/60"> (You)</span>}
          </p>
        </div>
        <p className="mt-1 text-center text-[11px] font-bold uppercase tracking-wider text-foreground/65">
          {match.round_name} · Kick {current.kick_number}
          {current.sudden_death && " · Sudden death"}
        </p>
      </div>

      {/* Swipe pitch (resets itself on every new kick / role) */}
      <SwipeArena
        key={`${match.id}-${current.kick_number}-${role}`}
        role={role}
        waitText={waitText}
        loading={loading}
        error={error}
        onCommit={onCommit}
      />

      {error && <ErrorMessage message={error} />}

      {/* Shooter vs keeper */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "s", player: current.shooter, icon: <Footprints size={13} /> },
          { key: "k", player: current.keeper, icon: <Shield size={13} /> },
        ].map((item) => (
          <div key={item.key} className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2">
            <Avatar name={item.player.name} src={item.player.image_url} className="h-10 w-10 rounded-lg text-sm" />
            <div className="min-w-0">
              <p className="flex items-center gap-1 truncate text-xs font-black">
                <span className="text-accent-text">{item.icon}</span>
                {item.player.name}
              </p>
              <p className="text-[11px] text-foreground/65">{item.player.ovr_rating} OVR</p>
            </div>
          </div>
        ))}
      </div>

      <ShootoutTracker match={match} mySeat={mySeat} />

      <button
        type="button"
        onClick={onConcede}
        className="mx-auto flex items-center gap-2 text-xs font-semibold text-foreground/60 transition hover:text-red-600 dark:hover:text-red-300"
      >
        Leave this match
      </button>
    </section>
  );
}

/* ================================================================== */
/* Kick result popup                                                   */
/* ================================================================== */

export function KickResultOverlay({
  kick,
  match,
  autoCloseMs,
  onClose,
}: {
  kick: Kick;
  match: MatchBrief;
  autoCloseMs?: number;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!autoCloseMs) return undefined;
    const timer = window.setTimeout(onClose, autoCloseMs);
    return () => window.clearTimeout(timer);
  }, [autoCloseMs, onClose, kick.number, match.id]);

  const meta = OUTCOME_META[kick.outcome];
  const keeperTeam = kick.seat === match.seat_a ? match.name_b : match.name_a;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={meta.title}
      style={{ zIndex: 2147483000 }}
      className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
    >
      <style>{`
        @keyframes pen-pop { 0% { opacity: 0; transform: scale(.85) } 100% { opacity: 1; transform: scale(1) } }
        @keyframes pen-bar { from { transform: scaleX(1) } to { transform: scaleX(0) } }
        .pen-pop { animation: pen-pop .35s cubic-bezier(.2,.9,.25,1.1) both }
        .pen-bar { transform-origin: left; animation: pen-bar ${autoCloseMs ?? 0}ms linear both }
      `}</style>

      <div className="pen-pop relative my-auto w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-surface p-4 shadow-2xl sm:p-6">
        {autoCloseMs && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-foreground/10">
            <div className="pen-bar h-full bg-accent-text" />
          </div>
        )}

        <div
          className={`mb-4 rounded-2xl px-4 py-3 text-center ${
            meta.scored
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/15 text-red-700 dark:text-red-300"
          }`}
        >
          <p className="text-3xl font-black tracking-wide sm:text-4xl">{meta.title}</p>
        </div>

        <GoalScene
          key={`${match.id}-${kick.number}`}
          result={{ shot: kick.shot_zone, dive: kick.dive_zone, outcome: kick.outcome }}
        />

        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-300">
              Shot
            </p>
            <p className="mt-1 text-sm font-black">{ZONE_LAYOUT[kick.shot_zone].label}</p>
            <p className="mt-1 truncate text-[11px] text-foreground/70">
              {kick.shooter.name} · {kick.team_name}
            </p>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-600 dark:text-sky-300">
              Dive
            </p>
            <p className="mt-1 text-sm font-black">{ZONE_LAYOUT[kick.dive_zone].label}</p>
            <p className="mt-1 truncate text-[11px] text-foreground/70">
              {kick.keeper.name} · {keeperTeam}
            </p>
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-foreground/80">{kick.commentary}</p>
        <p className="mt-2 text-center text-2xl font-black tabular-nums">
          {match.name_a} {kick.score_a} – {kick.score_b} {match.name_b}
        </p>

        <button type="button" onClick={onClose} className={`${primaryButton} mt-4`}>
          Continue
          <ArrowRight size={18} />
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Pass the phone (local play)                                         */
/* ================================================================== */

export function HandoffScreen({
  name,
  role,
  onReady,
}: {
  name: string;
  role: "shoot" | "dive";
  onReady: () => void;
}) {
  return (
    <section className="mx-auto max-w-md pt-10 text-center">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-accent text-accent-ink">
        <Smartphone size={38} />
      </div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent-text">Pass the phone</p>
      <h1 className="mt-2 text-4xl font-black">{name}</h1>
      <p className="mt-4 text-sm leading-6 text-foreground/75">
        {role === "shoot"
          ? `${name} takes the penalty. The goalkeeper must look away.`
          : `${name} is in goal. The shot is locked in. Guess where it is going.`}
      </p>
      <button type="button" onClick={onReady} className={`${primaryButton} mt-8`}>
        I&apos;m {name}, ready
        <ArrowRight size={18} />
      </button>
    </section>
  );
}

/* ================================================================== */
/* Tournament bracket and waiting views                                */
/* ================================================================== */

function BracketMatch({ match, mySeat }: { match: MatchBrief; mySeat: Seat | null }) {
  const sides = [
    { seat: match.seat_a, name: match.name_a, score: match.score_a },
    { seat: match.seat_b, name: match.name_b, score: match.score_b },
  ];
  return (
    <div
      className={`rounded-xl border p-3 ${
        match.status === "ACTIVE" ? "border-accent-text/50 bg-accent/10" : "border-foreground/15 bg-surface-2"
      }`}
    >
      {sides.map((side) => {
        const won = match.winner_seat === side.seat;
        return (
          <div key={side.seat} className="flex items-center justify-between gap-2 py-0.5">
            <span className={`flex min-w-0 items-center gap-1.5 truncate text-sm ${won ? "font-black" : "font-semibold text-foreground/80"}`}>
              {won && <Check size={13} className="shrink-0 text-accent-text" />}
              <span className="truncate">
                {side.name}
                {mySeat === side.seat && <span className="text-foreground/60"> (You)</span>}
              </span>
            </span>
            <span className="text-base font-black tabular-nums">{side.score}</span>
          </div>
        );
      })}
      {match.status === "ACTIVE" && (
        <p className="mt-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-text">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-text" />
          Live
        </p>
      )}
    </div>
  );
}

export function BracketView({
  rounds,
  mySeat,
}: {
  rounds: BracketRound[];
  mySeat: Seat | null;
}) {
  if (rounds.length === 0) return null;
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {rounds.map((round) => (
        <div key={round.round_number} className="min-w-[220px] flex-1">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-accent-text">
            {round.round_name}
          </p>
          <div className="space-y-2">
            {round.matches.map((match) => (
              <BracketMatch key={match.id} match={match} mySeat={mySeat} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function WaitingPanel({ state, message }: { state: GameState; message: string }) {
  return (
    <section>
      <PageTitle eyebrow={state.round_name ?? "Shootout"} title="TOURNAMENT." text={message} />
      <Panel>
        <BracketView rounds={state.bracket ?? []} mySeat={state.you.seat} />
        <p className="mt-3 text-xs text-foreground/65">
          The next round appears here as soon as every match in this round has finished.
        </p>
      </Panel>
    </section>
  );
}

/* ================================================================== */
/* Squad viewer                                                        */
/* ================================================================== */

export function SquadDrawer({
  sets,
  onClose,
}: {
  sets: { name: string; players: SquadPlayer[] }[];
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Squads"
      style={{ zIndex: 2147483000 }}
      onClick={onClose}
      className="fixed inset-0 flex items-start justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="relative my-6 w-full max-w-3xl rounded-3xl border border-border bg-surface p-5 shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-foreground/25 text-foreground/75 transition hover:bg-foreground/5"
        >
          <X size={16} />
        </button>
        <h2 className="pr-10 text-2xl font-black">Squads</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {sets.length === 0 && <p className="text-sm text-foreground/70">Loading squads...</p>}
          {sets.map((set) => (
            <div key={set.name}>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-accent-text">
                {set.name}
              </p>
              <div className="space-y-1.5">
                {set.players.map((player) => (
                  <div key={`${player.slot}-${player.player_id}`} className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
                    <span className="w-9 text-[10px] font-black text-foreground/65">{player.slot}</span>
                    <Avatar name={player.name} src={player.image_url} className="h-8 w-8 rounded-full text-[10px]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{player.name}</span>
                    <span className="rounded-md bg-accent px-2 py-0.5 text-xs font-black text-accent-ink">
                      {player.ovr_rating}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Champion                                                            */
/* ================================================================== */

const GOLD = "#d4af37";
const GOLD_LIGHT = "#f1dc8f";

export function ChampionScreen({
  state,
  onNewGame,
}: {
  state: GameState;
  onNewGame: () => void;
}) {
  const youWon = state.you_are_champion === true && state.mode === "ONLINE";

  return (
    <section className="mx-auto max-w-3xl pt-6">
      <style>{`
        @keyframes pen-halo { 0%,100% { transform: scale(1); opacity: .55 } 50% { transform: scale(1.18); opacity: 0 } }
        @keyframes pen-rise { from { transform: translateY(16px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        .pen-halo { animation: pen-halo 2.6s ease-out infinite }
        .pen-rise { animation: pen-rise .7s ease-out both }
      `}</style>

      <div className="relative overflow-hidden rounded-[28px] border-2 border-border bg-surface p-6 text-center sm:p-10" style={{ borderColor: "rgba(212,175,55,0.6)" }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.22), transparent 70%)" }} />

        <div className="relative">
          <p className="pen-rise text-[11px] font-semibold uppercase tracking-[0.4em] text-foreground/70">
            Tournament complete
          </p>

          <div className="relative mx-auto mt-6 h-28 w-28">
            <span className="pen-halo absolute inset-0 rounded-full" style={{ border: `2px solid ${GOLD}` }} />
            <span
              className="absolute inset-[8px] flex items-center justify-center rounded-full"
              style={{ background: "linear-gradient(135deg, #f1dc8f, #d4af37)", boxShadow: "0 0 40px rgba(212,175,55,0.45)" }}
            >
              <Trophy size={46} strokeWidth={1.8} style={{ color: "#3a2c04" }} />
            </span>
          </div>

          <h1
            className="pen-rise mt-6 bg-clip-text text-4xl font-black uppercase tracking-[0.14em] text-transparent sm:text-6xl"
            style={{ backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD})` }}
          >
            {youWon ? "Victory" : "Champion"}
          </h1>
          <p className="pen-rise mt-3 flex items-center justify-center gap-2 break-words text-2xl font-black sm:text-3xl">
            <Crown size={24} style={{ color: GOLD }} className="shrink-0" />
            {state.champion_name ?? "Winner"}
          </p>
          <p className="pen-rise mt-2 text-sm text-foreground/70">
            {youWon
              ? "You won the shootout tournament. Well played!"
              : "Won the penalty shootout tournament."}
          </p>
        </div>
      </div>

      {state.bracket && state.bracket.length > 0 && (
        <Panel className="mt-5">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-accent-text">
            Final bracket
          </p>
          <BracketView rounds={state.bracket} mySeat={state.mode === "ONLINE" ? state.you.seat : null} />
        </Panel>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={onNewGame} className="flex items-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110">
          <RotateCcw size={17} />
          New shootout
        </button>
        <Link href="/" className="rounded-xl border border-foreground/25 bg-surface px-6 py-4 font-semibold text-foreground/80 transition hover:bg-foreground/5">
          Back home
        </Link>
      </div>
    </section>
  );
}