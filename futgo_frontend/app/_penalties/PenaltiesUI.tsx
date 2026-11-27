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
  LogOut,
  Maximize2,
  Minimize2,
  Pause,
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
/* Stage (full screen) store                                           */
/* ================================================================== */
/*
 * The whole penalty match can be played in "stage" mode: the browser goes
 * full screen (document root, so the kick result popup still shows on top)
 * and the match panel turns into a stadium view with a broadcast scoreboard.
 * iPhone Safari has no Fullscreen API, so the stage layer itself is also
 * `position: fixed; inset: 0` and works as a fallback.
 * The flag lives outside React so it survives the hand-off screens in local play.
 */

let stageOn = false;
let nativeStage = false;
const stageListeners = new Set<() => void>();

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type LockableOrientation = { lock?: (o: string) => Promise<void>; unlock?: () => void };

function setStageFlag(value: boolean) {
  if (stageOn === value) return;
  stageOn = value;
  stageListeners.forEach((listener) => listener());
}

export function enterStage() {
  setStageFlag(true);
  if (typeof document === "undefined") return;
  const doc = document as FsDoc;
  const el = document.documentElement as FsEl;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) return;
  try {
    const request = el.requestFullscreen
      ? el.requestFullscreen({ navigationUI: "hide" })
      : el.webkitRequestFullscreen?.();
    Promise.resolve(request)
      .then(() => {
        nativeStage = true;
        try {
          const orientation = screen.orientation as unknown as LockableOrientation;
          orientation.lock?.("landscape")?.catch(() => {});
        } catch {
          // Orientation lock is optional.
        }
      })
      .catch(() => {
        // Browser refused native full screen: the fixed layer still fills the screen.
      });
  } catch {
    // Same fallback as above.
  }
}

export function leaveStage() {
  setStageFlag(false);
  nativeStage = false;
  if (typeof document === "undefined") return;
  const doc = document as FsDoc;
  if (doc.fullscreenElement || doc.webkitFullscreenElement) {
    try {
      const exit = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
      Promise.resolve(exit).catch(() => {});
    } catch {
      // Nothing to do.
    }
  }
  try {
    (screen.orientation as unknown as LockableOrientation).unlock?.();
  } catch {
    // Nothing to do.
  }
}

function useStage() {
  const [on, setOn] = useState(stageOn);

  useEffect(() => {
    const sync = () => setOn(stageOn);
    stageListeners.add(sync);
    sync();

    const onChange = () => {
      const doc = document as FsDoc;
      const active = !!(doc.fullscreenElement || doc.webkitFullscreenElement);
      if (active) {
        nativeStage = true;
      } else if (nativeStage) {
        // The player left native full screen with the browser's own Esc / swipe.
        nativeStage = false;
        setStageFlag(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stageOn && !nativeStage) leaveStage();
    };

    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      stageListeners.delete(sync);
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return on;
}

function StageToggle({
  fs,
  className = "",
  style,
}: {
  fs: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={() => (fs ? leaveStage() : enterStage())}
      aria-label={fs ? "Exit full screen" : "Switch to full screen"}
      style={style}
      className={`absolute z-30 flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/65 px-3.5 text-[11px] font-black uppercase tracking-wider text-white shadow-lg backdrop-blur transition hover:bg-black/85 ${className}`}
    >
      {fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      {fs ? "Exit" : "Full screen"}
    </button>
  );
}

/* ================================================================== */
/* Shell and small pieces                                              */
/* ================================================================== */

export function PenaltyShell({ children }: { children: ReactNode }) {
  // Stop iOS Safari from zooming when an input is focused or the phone is rotated.
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    const created = !meta;
    const previous = meta?.getAttribute("content") ?? null;
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "viewport");
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
    );
    return () => {
      if (created) meta?.remove();
      else if (previous !== null) meta?.setAttribute("content", previous);
    };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <style>{`html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; } input, select, textarea { font-size: 16px; }`}</style>
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
  "w-full rounded-xl border-2 border-border bg-surface-2 px-4 py-3 text-base font-semibold text-foreground outline-none transition placeholder:text-foreground/50 focus:border-accent focus:ring-2 focus:ring-accent/25";

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

  // Create Game / Join Room only exists online. Local play always shows the create form.
  const activeTab = mode === "ONLINE" ? tab : "create";

  const players = mode === "LOCAL" ? 2 : maxPlayers;
  const needed = players * 11;
  const pool = pools.find((item) => item.key === category);
  const poolTooSmall = pool ? pool.count < needed : false;

  // A new game always starts outside the full screen stage.
  useEffect(() => {
    leaveStage();
  }, []);

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

      {/* Create Game / Join Room (online only) */}
      {mode === "ONLINE" && (
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-1.5">
          {(["create", "join"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`rounded-xl px-4 py-2.5 text-sm font-black transition ${
                activeTab === item
                  ? "bg-accent text-accent-ink shadow-md shadow-accent/25"
                  : "bg-surface-2 text-foreground/80 hover:text-foreground"
              }`}
            >
              {item === "create" ? "Create Game" : "Join Room"}
            </button>
          ))}
        </div>
      )}

      {activeTab === "create" ? (
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

  useEffect(() => {
    leaveStage();
  }, []);

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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
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

/* ---- Stadium backdrop (full screen only) ---- */

const CROWD = (() => {
  let seed = 11;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const colors = ["#1e293b", "#334155", "#475569", "#7f1d1d", "#1e3a8a", "#64748b", "#facc15"];
  return Array.from({ length: 560 }, () => ({
    x: -420 + rand() * 1240,
    y: -330 + rand() * (LINE_Y - 16 + 330 - 8),
    r: 1.4 + rand() * 1.9,
    c: colors[Math.floor(rand() * colors.length)],
  }));
})();

// Grass bands that grow towards the camera, for a bit of perspective.
const BANDS = (() => {
  const out: { y: number; h: number; i: number }[] = [];
  let y = LINE_Y;
  let h = 10;
  let i = 0;
  while (y < VH + 500) {
    out.push({ y, h, i });
    y += h;
    h *= 1.18;
    i += 1;
  }
  return out;
})();

const AD_COLORS = ["#1d4ed8", "#be123c", "#047857", "#a16207", "#6d28d9", "#0e7490"];

function Stadium() {
  return (
    <g>
      {/* Stands */}
      <rect x="-800" y="-800" width="2000" height={LINE_Y + 800} fill="url(#pg-stand)" />
      {CROWD.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill={dot.c} opacity={dot.c === "#facc15" ? 0.9 : 0.75} />
      ))}
      {/* Floodlights */}
      <circle cx="-110" cy="-120" r="260" fill="url(#pg-flood)" />
      <circle cx="510" cy="-120" r="260" fill="url(#pg-flood)" />
      {/* Advertising boards */}
      <rect x="-800" y={LINE_Y - 15} width="2000" height="15" fill="#0b1220" />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i}>
          <rect x={-420 + i * 90} y={LINE_Y - 14} width="86" height="13" fill={AD_COLORS[i % AD_COLORS.length]} opacity="0.9" />
          <text
            x={-420 + i * 90 + 43}
            y={LINE_Y - 4.5}
            textAnchor="middle"
            fontSize="8"
            fontWeight="900"
            letterSpacing="2"
            fill="white"
            opacity="0.92"
          >
            FUTGO
          </text>
        </g>
      ))}
      {/* Grass in front of the goal line */}
      <rect x="-800" y={LINE_Y} width="2000" height="1000" fill="url(#pg-grass2)" />
      {BANDS.filter((band) => band.i % 2 === 1).map((band) => (
        <rect key={band.i} x="-800" y={band.y} width="2000" height={band.h} fill="white" opacity="0.05" />
      ))}
      <rect x="-800" y="-800" width="2000" height="1800" fill="url(#pg-light)" />
    </g>
  );
}

/** Small plain label (no box, no border): just a surname with a soft dark outline for contrast. */
function NameTag({ text, color, size = 8 }: { text: string; color: string; size?: number }) {
  return (
    <text
      textAnchor="middle"
      fontSize={size}
      fontWeight={800}
      fill={color}
      stroke="rgba(0,0,0,0.7)"
      strokeWidth={2.2}
      strokeLinejoin="round"
      paintOrder="stroke"
      style={{ letterSpacing: 0.4 }}
    >
      {text}
    </text>
  );
}

/** Goalkeeper swipe hints: long, straight, semi-transparent arrows to the left, right and up. */
function KeeperArrows() {
  // Points to the right, starting at (0, 0); moved and rotated into place.
  const arrow = "M0 -4 H29 V-10 L44 0 L29 10 V4 H0 Z";
  return (
    <g className="animate-pulse" pointerEvents="none" fill="white" fillOpacity="0.45">
      <path d={arrow} transform="translate(-26 -1) rotate(180)" />
      <path d={arrow} transform="translate(26 -1)" />
      <path d={arrow} transform="translate(0 -35) rotate(-90)" />
    </g>
  );
}

// Curves from the ball into the three zones: start, bend (control point) and end.
const SHOT_HINTS = [
  { from: [190, 212], bend: [170, 150], to: [102, 112] }, // left
  { from: [200, 209], bend: [216, 145], to: [200, 74] }, // center
  { from: [210, 212], bend: [230, 150], to: [298, 112] }, // right
];

/** Shooter swipe hints: faint, slightly curved arrows pointing into the net. */
function ShotArrows() {
  return (
    <g className="animate-pulse" pointerEvents="none">
      {SHOT_HINTS.map(({ from, bend, to }) => {
        // The arrow head follows the direction in which the curve ends.
        const angle = (Math.atan2(to[1] - bend[1], to[0] - bend[0]) * 180) / Math.PI;
        return (
          // Group opacity keeps the line and its head one even shade where they overlap.
          <g key={to.join("-")} opacity="0.32">
            <path
              d={`M${from.join(" ")} Q${bend.join(" ")} ${to.join(" ")}`}
              fill="none"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path d="M-2 -10 L14 0 L-2 10 Z" fill="white" transform={`translate(${to.join(" ")}) rotate(${angle})`} />
          </g>
        );
      })}
    </g>
  );
}

export type GoalResult = { shot: ZoneKey; dive: ZoneKey; outcome: Outcome };

type Drag = { x1: number; y1: number; x2: number; y2: number };

export function GoalScene({
  result = null,
  role = null,
  locked = null,
  disabled = false,
  onSwipe,
  fullscreen = false,
  shooterName,
  keeperName,
}: {
  /** Replay mode: the ball and the keeper move together to their final places. */
  result?: GoalResult | null;
  /** Swipe mode: who is playing. Leave null for a view-only goal. */
  role?: "shoot" | "dive" | null;
  /** Zone already chosen (marks the zone, nothing moves until the kick is played). */
  locked?: ZoneKey | null;
  disabled?: boolean;
  onSwipe?: (zone: ZoneKey) => void;
  /** Stadium view that fills its parent (used by the full screen stage). */
  fullscreen?: boolean;
  /** Shown above the player standing at the ball. */
  shooterName?: string;
  /** Shown above the goalkeeper's head. */
  keeperName?: string;
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

  // Pointer position in goal coordinates (works with letterboxing in full screen).
  const toSvg = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = Math.min(rect.width / VW, rect.height / VH);
    const offX = (rect.width - VW * scale) / 2;
    const offY = (rect.height - VH * scale) / 2;
    return {
      x: (e.clientX - rect.left - offX) / scale,
      y: (e.clientY - rect.top - offY) / scale,
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

  // The taker stands next to the ball and takes a small step in on the replay.
  const taker = { x: SPOT.x - 24, y: SPOT.y - 2 };
  const takerMove = result && go ? { x: taker.x + 14, y: taker.y - 12 } : taker;
  const tagSize = fullscreen ? 9 : 8;

  return (
    <div
      className={
        fullscreen
          ? "relative h-full w-full"
          : "relative overflow-hidden rounded-3xl border border-border shadow-lg"
      }
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        className={`block select-none ${fullscreen ? "h-full w-full" : "h-auto w-full"} ${
          interactive ? "cursor-grab" : ""
        }`}
        style={{ touchAction: "none", overflow: fullscreen ? "visible" : undefined }}
        role="img"
        aria-label="Goal"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => setDrag(null)}
      >
        <style>{`
          @keyframes pg-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
          .pg-bob { animation: pg-bob 0.9s ease-in-out infinite }
          @media (prefers-reduced-motion: reduce) { .pg-bob { animation: none } }
        `}</style>
        <defs>
          <linearGradient id="pg-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#166534" />
            <stop offset="1" stopColor="#22a04d" />
          </linearGradient>
          <linearGradient id="pg-grass2" gradientUnits="userSpaceOnUse" x1="0" y1={LINE_Y} x2="0" y2={VH + 120}>
            <stop offset="0" stopColor="#14532d" />
            <stop offset="1" stopColor="#22a04d" />
          </linearGradient>
          <linearGradient id="pg-stand" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#020617" />
            <stop offset="1" stopColor="#111827" />
          </linearGradient>
          <radialGradient id="pg-flood" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#fef9c3" stopOpacity="0.5" />
            <stop offset="1" stopColor="#fef9c3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="pg-light" cx="50%" cy="0%" r="80%">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <pattern id="pg-net" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M0 0L10 10M10 0L0 10" stroke="white" strokeOpacity="0.28" strokeWidth="0.8" />
          </pattern>
          {/* Soft light around the outline of the player you control */}
          {[
            { id: "pg-glow-shoot", color: "#fde68a" },
            { id: "pg-glow-dive", color: "#7dd3fc" },
          ].map((glow) => (
            <filter key={glow.id} id={glow.id} x="-50%" y="-50%" width="200%" height="200%">
              <feMorphology in="SourceAlpha" operator="dilate" radius="1.2" result="spread" />
              <feGaussianBlur in="spread" stdDeviation="2" result="blur" />
              <feFlood floodColor={glow.color} floodOpacity="0.85" result="color" />
              <feComposite in="color" in2="blur" operator="in" result="halo" />
              <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
          <radialGradient id="pg-ball" cx="35%" cy="30%" r="75%">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#cbd5e1" />
          </radialGradient>
        </defs>

        {fullscreen ? (
          <Stadium />
        ) : (
          <>
            {/* Grass with mowing stripes */}
            <rect width={VW} height={VH} fill="url(#pg-grass)" />
            {Array.from({ length: 9 }, (_, i) => (
              <rect key={i} x="0" y={i * 32} width={VW} height="16" fill="white" opacity="0.045" />
            ))}
            <rect width={VW} height={VH} fill="url(#pg-light)" />
          </>
        )}

        {/* Pitch markings */}
        <g stroke="white" strokeOpacity="0.75" strokeWidth="2" fill="none">
          <line x1={fullscreen ? -800 : 0} y1={LINE_Y} x2={fullscreen ? 1200 : VW} y2={LINE_Y} />
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
              strokeOpacity="0.75"
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

        {/* Swipe hints from the ball into the net (only for the player who is shooting) */}
        {interactive && role === "shoot" && !drag && <ShotArrows />}

        {/* Keeper */}
        <g
          style={{
            transform: `translate(${keeper.x}px, ${keeper.y}px) rotate(${keeper.rot}deg)`,
            transition: `transform ${MOVE}`,
          }}
        >
          <g filter={role === "dive" && !result ? "url(#pg-glow-dive)" : undefined}>
            <rect x="-7" y="10" width="5" height="15" rx="2" fill="#1e293b" />
            <rect x="2" y="10" width="5" height="15" rx="2" fill="#1e293b" />
            <rect x="-9" y="-6" width="18" height="20" rx="7" fill="#f97316" />
            <circle cx="0" cy="-13" r="6" fill="#e8b98f" />
            <line x1="-9" y1="-2" x2="-21" y2="-12" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
            <line x1="9" y1="-2" x2="21" y2="-12" stroke="#f97316" strokeWidth="4" strokeLinecap="round" />
            <circle cx="-22" cy="-13" r="4.5" fill="#fde047" />
            <circle cx="22" cy="-13" r="4.5" fill="#fde047" />
          </g>
        </g>

        {/* Goalkeeper surname: small plain text that follows the keeper above his head */}
        {keeperName && (
          <g
            style={{
              transform: `translate(${keeper.x}px, ${keeper.y - 24}px)`,
              transition: `transform ${MOVE}`,
            }}
          >
            <NameTag text={lastName(keeperName)} color="#e0f2fe" size={tagSize} />
          </g>
        )}

        {/* Swipe hints around the keeper (only for the player who is diving) */}
        {interactive && role === "dive" && !drag && (
          <g pointerEvents="none" style={{ transform: `translate(${keeper.x}px, ${keeper.y}px)` }}>
            <KeeperArrows />
          </g>
        )}

        {/* Penalty taker standing at the ball, surname above his head */}
        {shooterName && (
          <g
            style={{
              transform: `translate(${takerMove.x}px, ${takerMove.y}px)`,
              transition: `transform ${MOVE}`,
            }}
          >
            <ellipse cx="0" cy="26" rx="12" ry="3" fill="black" opacity="0.28" />
            <g filter={role === "shoot" && !result ? "url(#pg-glow-shoot)" : undefined}>
              <rect x="-6" y="12" width="5" height="14" rx="2" fill="#f8fafc" />
              <rect x="1" y="12" width="5" height="14" rx="2" fill="#f8fafc" />
              <rect x="-9" y="-8" width="18" height="22" rx="7" fill="#2563eb" />
              <circle cx="0" cy="-15" r="6" fill="#e8b98f" />
              <line x1="-9" y1="-3" x2="-15" y2="7" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
              <line x1="9" y1="-3" x2="15" y2="7" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="translate(0 -25)">
              <NameTag text={lastName(shooterName)} color="#fef3c7" size={tagSize} />
            </g>
          </g>
        )}

        {/* Swipe effect: a translucent glowing streak that follows the finger */}
        {drag && (
          <g pointerEvents="none">
            <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} stroke="white" strokeOpacity="0.14" strokeWidth="26" strokeLinecap="round" />
            <line x1={drag.x1} y1={drag.y1} x2={drag.x2} y2={drag.y2} stroke={accent} strokeOpacity="0.3" strokeWidth="11" strokeLinecap="round" />
            <circle cx={drag.x2} cy={drag.y2} r="17" fill={accent} fillOpacity="0.28" />
            <circle cx={drag.x2} cy={drag.y2} r="6" fill="white" fillOpacity="0.55" />
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
/* Line-up pitch shown before every penalty                            */
/* ================================================================== */

type PenPlayer = {
  name: string;
  ovr_rating: number;
  image_url?: string | null;
  player_id?: number;
};

// Positions on a pitch that attacks upwards (x and y in % of the pitch).
const FORMATION: Record<string, { x: number; y: number }> = {
  ST: { x: 50, y: 31 },
  LWF: { x: 17, y: 39 },
  RWF: { x: 83, y: 39 },
  AMF: { x: 50, y: 47 },
  CMF: { x: 30, y: 59 },
  DMF: { x: 70, y: 59 },
  LB: { x: 12, y: 75 },
  LCB: { x: 37, y: 79 },
  RCB: { x: 63, y: 79 },
  RB: { x: 88, y: 75 },
  GK: { x: 50, y: 92 },
};

const INTRO_MS = 4500;

const INTRO_CSS = `
  @keyframes pen-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
  @keyframes pen-ping { 0% { transform: scale(.9); opacity: .9 } 100% { transform: scale(1.7); opacity: 0 } }
  @keyframes pen-prog { from { transform: scaleX(1) } to { transform: scaleX(0) } }
  .pen-bob { animation: pen-bob .9s ease-in-out infinite }
  .pen-ping { animation: pen-ping 1.3s ease-out infinite }
  .pen-prog { transform-origin: left; animation: pen-prog ${INTRO_MS}ms linear both }
  @media (prefers-reduced-motion: reduce) { .pen-bob, .pen-ping { animation: none } }
`;

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

function PitchCard({
  player,
  x,
  y,
  shooter = false,
  keeper = false,
}: {
  player: { name: string; ovr_rating: number; image_url?: string | null };
  x: number;
  y: number;
  shooter?: boolean;
  keeper?: boolean;
}) {
  const ring = shooter
    ? "ring-[3px] ring-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.85)]"
    : keeper
      ? "ring-[3px] ring-sky-300 shadow-[0_0_16px_rgba(56,189,248,0.7)]"
      : "ring-2 ring-white/70";

  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
      style={{ left: `${x}%`, top: `${y}%`, zIndex: shooter ? 20 : keeper ? 15 : 1 }}
    >
      <div className="relative" style={{ width: "12cqw", height: "12cqw" }}>
        {shooter && (
          <span
            className="pen-ping absolute rounded-full border-2 border-amber-300"
            style={{ inset: "-1.2cqw" }}
          />
        )}
        <div className={`h-full w-full overflow-hidden rounded-full bg-background ${ring}`}>
          <Avatar name={player.name} src={player.image_url} className="h-full w-full border-0" />
        </div>
        <span
          className="absolute rounded bg-accent px-[0.9cqw] font-black leading-tight text-accent-ink shadow"
          style={{ left: "-1.6cqw", top: "-1.2cqw", fontSize: "2.8cqw" }}
        >
          {player.ovr_rating}
        </span>
        {shooter && (
          <span className="pen-bob absolute leading-none" style={{ right: "-2.6cqw", top: "-3cqw", fontSize: "5.4cqw" }}>
            ⚽
          </span>
        )}
        {keeper && (
          <span
            className="absolute flex items-center justify-center rounded-full bg-sky-400 text-sky-950"
            style={{ right: "-1.4cqw", top: "-1.4cqw", width: "4.6cqw", height: "4.6cqw" }}
          >
            <Shield style={{ width: "2.8cqw", height: "2.8cqw" }} strokeWidth={3} />
          </span>
        )}
      </div>
      <span
        className="mt-[0.6cqw] max-w-[22cqw] truncate rounded bg-black/75 px-[1.2cqw] py-[0.2cqw] font-black text-white"
        style={{ fontSize: "2.9cqw" }}
      >
        {lastName(player.name)}
      </span>
      {shooter && (
        <span
          className="mt-[0.4cqw] rounded bg-amber-400 px-[1.1cqw] py-[0.1cqw] font-black uppercase tracking-wider text-black"
          style={{ fontSize: "2.2cqw" }}
        >
          Penalty taker
        </span>
      )}
      {keeper && (
        <span
          className="mt-[0.4cqw] rounded bg-sky-400 px-[1.1cqw] py-[0.1cqw] font-black uppercase tracking-wider text-sky-950"
          style={{ fontSize: "2.2cqw" }}
        >
          Goalkeeper
        </span>
      )}
    </div>
  );
}

/** Line-up preview pitch. No longer shown before a kick; kept for reuse. */
export function LineupIntro({
  fs,
  shooter,
  keeper,
  squad,
  teamName,
  keeperTeam,
  kickLabel,
  role,
  onDone,
}: {
  fs: boolean;
  shooter: PenPlayer;
  keeper: PenPlayer;
  squad: SquadPlayer[];
  teamName: string;
  keeperTeam: string;
  kickLabel: string;
  role: "shoot" | "dive" | "wait";
  onDone: () => void;
}) {
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });
  useEffect(() => {
    const timer = window.setTimeout(() => doneRef.current(), INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const isShooter = (player: { name: string; player_id?: number }) =>
    shooter.player_id != null && player.player_id != null
      ? player.player_id === shooter.player_id
      : player.name === shooter.name;

  const cards = squad.map((player, index) => {
    const spot = FORMATION[player.slot] ?? { x: 20 + (index % 5) * 15, y: 55 + Math.floor(index / 5) * 10 };
    return { key: `${player.slot}-${player.player_id}`, player, x: spot.x, y: spot.y, shooter: isShooter(player) };
  });
  const found = cards.find((card) => card.shooter);
  // No squad data: still show the taker on the pitch.
  const takerSpot = found ? { x: found.x, y: found.y } : { x: 50, y: 64 };

  const buttonText =
    role === "shoot" ? "Take the penalty" : role === "dive" ? "Get in goal" : "Skip";

  const panelTone = fs
    ? "border-white/15 bg-black/55 text-white backdrop-blur"
    : "border-border bg-surface text-foreground";

  const pitch = (
    <div
      className={`relative aspect-[4/5] overflow-hidden rounded-2xl border-2 border-white/80 shadow-2xl ${
        fs ? "h-[56%] landscape:h-[88%]" : "w-full"
      }`}
      style={{
        containerType: "inline-size",
        background: "repeating-linear-gradient(180deg,#15803d 0 12.5%,#16a34a 12.5% 25%)",
      }}
    >
      {/* Markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[20%] top-0 h-[27%] w-[60%] border-2 border-t-0 border-white/55" />
        <div className="absolute left-[36%] top-0 h-[11%] w-[28%] border-2 border-t-0 border-white/55" />
        <div className="absolute left-1/2 top-[27%] h-[9%] w-[24%] -translate-x-1/2 rounded-b-full border-2 border-t-0 border-white/55" />
        <div className="absolute left-1/2 top-[19%] h-[1.4cqw] w-[1.4cqw] -translate-x-1/2 rounded-full bg-white/85" />
        <div className="absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-black/30 to-transparent" />
        {/* Goal with net */}
        <div
          className="absolute left-[34%] top-0 h-[8%] w-[32%] border-2 border-t-0 border-white"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,rgba(255,255,255,.28) 0 1px,transparent 1px 6px),repeating-linear-gradient(-45deg,rgba(255,255,255,.28) 0 1px,transparent 1px 6px)",
            backgroundColor: "rgba(0,0,0,.25)",
          }}
        />
      </div>

      {/* Run-up line from the taker to the goal */}
      <svg
        viewBox="0 0 100 125"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <line
          x1={takerSpot.x}
          y1={takerSpot.y * 1.25 - 8}
          x2={50}
          y2={22}
          stroke="#fbbf24"
          strokeWidth="0.7"
          strokeDasharray="2 2"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>

      {/* Goalkeeper of the other team, in goal */}
      <PitchCard player={keeper} x={50} y={11} keeper />

      {/* Line-up */}
      {cards.map((card) => (
        <PitchCard key={card.key} player={card.player} x={card.x} y={card.y} shooter={card.shooter} />
      ))}
      {!found && <PitchCard player={shooter} x={takerSpot.x} y={takerSpot.y} shooter />}

      {/* Team label */}
      <span
        className="absolute bottom-[2%] left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-[3cqw] py-[0.8cqw] font-black uppercase tracking-wider text-white"
        style={{ fontSize: "2.8cqw" }}
      >
        {teamName}
      </span>
    </div>
  );

  const info = (
    <div className={`space-y-3 rounded-2xl border p-3 sm:p-4 ${panelTone} ${fs ? "w-full max-w-xs landscape:w-64" : ""}`}>
      <p className="text-center text-[11px] font-black uppercase tracking-[0.16em] opacity-70">
        Penalty kick · {kickLabel}
      </p>
      <div className="space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-amber-400/15 p-2">
          <Avatar name={shooter.name} src={shooter.image_url} className="h-11 w-11 rounded-full" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-black">
              <Footprints size={13} className="shrink-0 text-amber-400" />
              {shooter.name}
            </p>
            <p className="truncate text-[11px] opacity-70">
              {shooter.ovr_rating} OVR · {teamName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-sky-400/15 p-2">
          <Avatar name={keeper.name} src={keeper.image_url} className="h-11 w-11 rounded-full" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-black">
              <Shield size={13} className="shrink-0 text-sky-400" />
              {keeper.name}
            </p>
            <p className="truncate text-[11px] opacity-70">
              {keeper.ovr_rating} OVR · {keeperTeam}
            </p>
          </div>
        </div>
      </div>
      <button type="button" onClick={onDone} className={primaryButton}>
        {buttonText}
        <ArrowRight size={18} />
      </button>
      <div className="h-1 overflow-hidden rounded-full bg-foreground/15">
        <div className="pen-prog h-full bg-accent" />
      </div>
    </div>
  );

  return (
    <>
      <style>{INTRO_CSS}</style>
      {fs ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 pb-4 pt-28 landscape:flex-row landscape:gap-8 landscape:pt-4">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(34,160,77,.28), #03060c 70%)" }}
          />
          <div className="relative z-10 flex h-full max-h-full items-center justify-center landscape:h-[92%]">{pitch}</div>
          <div className="relative z-10 flex w-full justify-center landscape:w-auto">{info}</div>
          <StageToggle fs style={{ right: "max(.75rem, env(safe-area-inset-right))", top: "max(.75rem, env(safe-area-inset-top))" }} />
        </div>
      ) : (
        <div className="relative space-y-3">
          {pitch}
          {info}
          <StageToggle fs={false} className="right-3 top-3" />
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/* The match panel (swipe to shoot / dive)                             */
/* ================================================================== */

const DIVE_SECONDS = 10;
// How long the shot / dive replay plays inside the stage before the next kick.
const REVEAL_MS = 3400;

function Countdown({ left, className = "right-3 top-3" }: { left: number; className?: string }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const urgent = left <= 2;
  return (
    <div className={`absolute flex h-12 w-12 items-center justify-center ${className}`}>
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

/**
 * The pitch where a player swipes. Online, shooter and keeper both pick at the same time and
 * both get 5 seconds; at zero a random zone is sent for anyone who has not chosen.
 * Local play shares one phone, so only the keeper is timed there.
 */
function SwipeArena({
  role,
  online,
  loading,
  error,
  onCommit,
  onTimerEnd,
  fs,
  shooterName,
  keeperName,
}: {
  role: "shoot" | "dive" | "wait";
  online: boolean;
  loading: boolean;
  error: string;
  onCommit: (zone: ZoneKey) => void;
  onTimerEnd: () => void;
  fs: boolean;
  shooterName: string;
  keeperName: string;
}) {
  const timed = role !== "wait" && (online || role === "dive");
  const [locked, setLocked] = useState<ZoneKey | null>(null);
  const [ended, setEnded] = useState(false);
  const [left, setLeft] = useState(DIVE_SECONDS);
  const lockedRef = useRef<ZoneKey | null>(null);
  const commitRef = useRef(onCommit);
  const endRef = useRef(onTimerEnd);

  useEffect(() => {
    commitRef.current = onCommit;
    endRef.current = onTimerEnd;
    lockedRef.current = locked;
  });

  // If the server rejects the move, let the player swipe again.
  useEffect(() => {
    if (error) setLocked(null);
  }, [error]);

  useEffect(() => {
    if (!timed) return undefined;
    setLeft(DIVE_SECONDS);
    const end = Date.now() + DIVE_SECONDS * 1000;
    const id = window.setInterval(() => {
      const remaining = Math.max(0, end - Date.now());
      setLeft(remaining / 1000);
      if (remaining === 0) {
        window.clearInterval(id);
        if (!lockedRef.current) {
          const zone = ZONE_KEYS[Math.floor(Math.random() * ZONE_KEYS.length)];
          lockedRef.current = zone;
          setLocked(zone);
          commitRef.current(zone);
        }
        setEnded(true);
        endRef.current();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [timed]);

  const swipe = (zone: ZoneKey) => {
    if (locked || ended) return;
    setLocked(zone);
    onCommit(zone);
  };

  return (
    <div className={fs ? "relative h-full w-full" : "relative"}>
      <GoalScene
        role={role === "wait" ? null : role}
        locked={locked}
        disabled={ended}
        onSwipe={swipe}
        fullscreen={fs}
        shooterName={shooterName}
        keeperName={keeperName}
      />

      {timed && !ended && <Countdown left={left} className={fs ? "right-3 top-16" : "right-3 top-3"} />}

      {loading && (
        <span
          className={`absolute flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white ${
            fs ? "left-1/2 top-3 -translate-x-1/2" : "bottom-3 left-3"
          }`}
        >
          <LoaderCircle size={16} className="animate-spin" />
        </span>
      )}
    </div>
  );
}

/** GOAL! / SAVED! banner shown on top of the replay. */
function ResultBanner({ kick, fs }: { kick: Kick; fs: boolean }) {
  const meta = OUTCOME_META[kick.outcome];
  return (
    <div
      className="pointer-events-none absolute inset-x-0 flex justify-center"
      style={{ bottom: fs ? "15%" : "8%" }}
    >
      <style>{`
        @keyframes pen-banner { from { opacity: 0; transform: scale(.8) } to { opacity: 1; transform: scale(1) } }
        .pen-banner { animation: pen-banner .35s cubic-bezier(.2,.9,.25,1.1) both }
      `}</style>
      <span
        className={`pen-banner rounded-full px-6 py-2 text-2xl font-black uppercase tracking-widest text-white shadow-2xl backdrop-blur sm:text-4xl ${
          meta.scored ? "bg-emerald-500/80" : "bg-red-500/80"
        }`}
        style={{ animationDelay: "0.8s" }}
      >
        {meta.title}
      </span>
    </div>
  );
}

/** Compact broadcast scoreboard (top left) and player chips for the full screen stage. */
function StageHud({
  match,
  mySeat,
  shooter,
  keeper,
  error,
}: {
  match: MatchDetail | null;
  mySeat: Seat | null;
  shooter: PenPlayer | null;
  keeper: PenPlayer | null;
  error: string;
}) {
  const current = match?.current ?? null;
  const tracker = match ? buildTracker(match) : null;
  const attacker = match && match.status === "ACTIVE" ? current?.attacker_seat : null;

  const rows = match && tracker
    ? [
        { seat: match.seat_a, name: match.name_a, slots: tracker.a, score: match.score_a },
        { seat: match.seat_b, name: match.name_b, slots: tracker.b, score: match.score_b },
      ]
    : [];

  const dot = (slot: TrackerSlot) => {
    if (slot === "goal") return "bg-emerald-400";
    if (slot === "saved" || slot === "miss") return "bg-red-500";
    if (slot === "pending") return "animate-pulse bg-amber-300";
    return "bg-white/25";
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <style>{`
        .pen-board { width: min(10rem, 42vw); }
        .pen-board .pb-name { font-size: 9px; }
        .pen-board .pb-score { width: 1.35rem; height: 1.35rem; font-size: .9rem; }
        .pen-board .pb-dot { width: 5px; height: 5px; }
        .pen-board .pb-foot { font-size: 8px; padding: 2px 6px; }
        @media (min-width: 768px) and (min-height: 560px) {
          .pen-board { width: 17rem; }
          .pen-board .pb-name { font-size: 11px; }
          .pen-board .pb-score { width: 2rem; height: 2rem; font-size: 1.25rem; }
          .pen-board .pb-dot { width: 8px; height: 8px; }
          .pen-board .pb-foot { font-size: 10px; padding: 4px 10px; }
        }
      `}</style>

      {/* Vignette */}
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.6) 100%)" }}
      />

      {match && (
        <div
          className="pen-board absolute overflow-hidden rounded border border-white/15 shadow-xl"
          style={{ left: "max(.5rem, env(safe-area-inset-left))", top: "max(.5rem, env(safe-area-inset-top))" }}
        >
          <div className="bg-black/70 backdrop-blur">
            {rows.map((row) => (
              <div
                key={row.seat}
                className={`flex items-center gap-1.5 border-b border-white/10 py-1 pl-1.5 pr-1 ${
                  attacker === row.seat ? "bg-amber-400/15" : ""
                }`}
              >
                <span className={`h-4 w-0.5 shrink-0 rounded-full ${attacker === row.seat ? "bg-amber-300" : "bg-white/20"}`} />
                <div className="min-w-0 flex-1">
                  <p className="pb-name truncate font-black uppercase leading-tight tracking-wide text-white">
                    {row.name}
                    {mySeat === row.seat && <span className="text-white/55"> (You)</span>}
                  </p>
                  <div className="mt-0.5 flex flex-wrap gap-[3px]">
                    {row.slots.map((slot, index) => (
                      <span key={index} className={`pb-dot rounded-full ${dot(slot)}`} />
                    ))}
                  </div>
                </div>
                <span className="pb-score flex shrink-0 items-center justify-center rounded bg-white font-black tabular-nums text-black">
                  {row.score}
                </span>
              </div>
            ))}
          </div>
          <div className="pb-foot flex items-center justify-between gap-2 bg-accent font-black uppercase tracking-wider text-accent-ink">
            <span className="truncate">{match.round_name}</span>
            {current && <span className="shrink-0">Kick {current.kick_number}</span>}
          </div>
        </div>
      )}

      {/* Taker and keeper */}
      {shooter && keeper && (
        <>
          <div
            className="absolute flex items-center gap-1.5 rounded-lg bg-black/60 p-1 pr-2 backdrop-blur"
            style={{ left: "max(.5rem, env(safe-area-inset-left))", bottom: "max(.5rem, env(safe-area-inset-bottom))" }}
          >
            <Avatar name={shooter.name} src={shooter.image_url} className="h-8 w-8 rounded-md text-xs" />
            <p className="max-w-[26vw] truncate text-[11px] font-black text-amber-200 sm:max-w-[10rem]">{shooter.name}</p>
          </div>
          <div
            className="absolute flex items-center gap-1.5 rounded-lg bg-black/60 p-1 pl-2 backdrop-blur"
            style={{ right: "max(.5rem, env(safe-area-inset-right))", bottom: "max(.5rem, env(safe-area-inset-bottom))" }}
          >
            <p className="max-w-[26vw] truncate text-[11px] font-black text-sky-200 sm:max-w-[10rem]">{keeper.name}</p>
            <Avatar name={keeper.name} src={keeper.image_url} className="h-8 w-8 rounded-md text-xs" />
          </div>
        </>
      )}

      {error && (
        <div className="pointer-events-auto absolute bottom-14 left-1/2 w-[min(28rem,90vw)] -translate-x-1/2">
          <ErrorMessage message={error} />
        </div>
      )}
    </div>
  );
}

type ArenaSnap = {
  key: string;
  role: "shoot" | "dive" | "wait";
  matchId: number;
  kickNumber: number;
  shooter: PenPlayer;
  keeper: PenPlayer;
  squad: SquadPlayer[];
  teamName: string;
  keeperTeam: string;
  kickLabel: string;
};

/** The score and tracker as they were before the kick that is about to be replayed. */
function rewind(match: MatchDetail, kick: Kick): MatchDetail {
  const goal = kick.outcome === "GOAL" ? 1 : 0;
  const isA = kick.seat === match.seat_a;
  return {
    ...match,
    score_a: match.score_a - (isA ? goal : 0),
    score_b: match.score_b - (isA ? 0 : goal),
    kicks_a: match.kicks_a - (isA ? 1 : 0),
    kicks_b: match.kicks_b - (isA ? 0 : 1),
    kicks: match.kicks.filter((item) => item.number < kick.number),
  };
}

// Local play: matches whose Start button was already pressed on this phone.
const startedMatches = new Set<number>();

function ReadyPanel({
  online,
  count,
  youReady,
  onStart,
}: {
  online: boolean;
  count: number;
  youReady: boolean;
  onStart: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-black/75 p-4 text-center shadow-2xl backdrop-blur">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">
          Penalty shootout
        </p>
        <button type="button" onClick={onStart} disabled={youReady} className={`${primaryButton} mt-3`}>
          {youReady ? (
            <>
              <Check size={18} />
              Ready
            </>
          ) : (
            <>
              Start
              <ArrowRight size={18} />
            </>
          )}
        </button>
        {online && (
          <>
            <p className="mt-3 text-sm font-black tabular-nums text-white">{count}/2 ready</p>
            {youReady && <p className="mt-1 text-xs text-white/60">Waiting for your opponent...</p>}
          </>
        )}
      </div>
    </div>
  );
}

const stageButton =
  "pointer-events-auto flex h-10 items-center gap-2 rounded-full border border-white/20 bg-black/65 px-3.5 text-[11px] font-black uppercase tracking-wider text-white shadow-lg backdrop-blur transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40";

const stageSecondaryButton =
  "w-full rounded-xl border border-white/25 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/10";

function StageDialog({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/65 px-4"
    >
      <div className="w-full max-w-xs rounded-2xl border border-white/15 bg-black/80 p-4 text-center shadow-2xl backdrop-blur">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-amber-300">{title}</p>
        {children}
      </div>
    </div>
  );
}

/** Shown while the match is paused. It resumes when both players are ready. */
function PausePanel({
  count,
  players,
}: {
  count: number;
  /** Online: one button (you). Local: one button for each player on the shared phone. */
  players: { key: number; label: string; ready: boolean; onReady: () => void }[];
}) {
  return (
    <StageDialog title="Match paused">
      <p className="mt-3 text-2xl font-black tabular-nums text-white">{count}/2 ready</p>
      <div className="mt-3 space-y-2">
        {players.map((player) => (
          <button
            key={player.key}
            type="button"
            onClick={player.onReady}
            disabled={player.ready}
            className={primaryButton}
          >
            {player.ready ? <Check size={18} /> : <ArrowRight size={18} />}
            <span className="truncate">{player.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-white/60">The match resumes when both players are ready.</p>
    </StageDialog>
  );
}

/** Confirmation before leaving: the player who leaves loses the match. */
function LeavePanel({
  choices,
  onCancel,
}: {
  choices: { key: number; label: string; onLeave: () => void }[];
  onCancel: () => void;
}) {
  return (
    <StageDialog title="Leave match?">
      <p className="mt-2 text-sm text-white/75">The player who leaves forfeits this match.</p>
      <div className="mt-3 space-y-2">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            onClick={choice.onLeave}
            className="w-full truncate rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-500"
          >
            {choice.label}
          </button>
        ))}
        <button type="button" onClick={onCancel} className={stageSecondaryButton}>
          Keep playing
        </button>
      </div>
    </StageDialog>
  );
}

/** The match is only playable in full screen. */
function FullscreenGate() {
  return (
    <section className="mx-auto max-w-sm pt-20 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accent-ink">
        <Maximize2 size={30} />
      </div>
      <h2 className="text-2xl font-black">Full screen required</h2>
      <p className="mt-2 text-sm text-foreground/70">The penalty shootout is played in full screen.</p>
      <button type="button" onClick={enterStage} className={`${primaryButton} mt-6`}>
        Enter full screen
        <ArrowRight size={18} />
      </button>
    </section>
  );
}

/**
 * One continuous full screen stage:  Start (both ready)  ->  pick (both players, 10 s)  ->
 * replay of the kick  ->  next kick. No popups, no Continue buttons.
 */
export function MatchPanel({
  match,
  mySeat,
  role,
  online,
  onCommit,
  onReady,
  loading,
  error,
  reveal = null,
  revealMatchId = null,
  onRevealDone,
}: {
  match: MatchDetail;
  mySeat: Seat | null;
  role: "shoot" | "dive" | "wait";
  /** Online games: both players pick at the same time. */
  online: boolean;
  /**
   * Called once when the player swipes (or when the timer runs out). Pause, resume and
   * leave are sent through the same call ("PAUSE", "RESUME", "LEAVE"), so the value must
   * reach the shoot / dive request unchanged.
   */
  onCommit: (zone: ZoneKey) => void;
  /** Online: the player pressed Start. */
  onReady: () => void;
  loading: boolean;
  error: string;
  /** The kick that was just played and still has to be replayed on the stage. */
  reveal?: Kick | null;
  revealMatchId?: number | null;
  onRevealDone?: () => void;
}) {
  const fs = useStage();
  const current = match.current;

  const [arena, setArena] = useState<ArenaSnap | null>(null);
  const [timerDone, setTimerDone] = useState(false);
  const [scoreShown, setScoreShown] = useState(false);
  const [, setStartTick] = useState(0);
  // Local play: the pause lives on this phone. Holds the seats that are ready again.
  const [localPause, setLocalPause] = useState<{ matchId: number; ready: number[] } | null>(null);
  const [askLeave, setAskLeave] = useState(false);
  const doneRef = useRef(onRevealDone);
  useEffect(() => {
    doneRef.current = onRevealDone;
  });

  let live: ArenaSnap | null = null;
  if (current) {
    const attackerIsA = current.attacker_seat === match.seat_a;
    live = {
      key: `${match.id}-${current.kick_number}-${role}`,
      role,
      matchId: match.id,
      kickNumber: current.kick_number,
      shooter: current.shooter as unknown as PenPlayer,
      keeper: current.keeper as unknown as PenPlayer,
      squad: [],
      teamName: attackerIsA ? match.name_a : match.name_b,
      keeperTeam: attackerIsA ? match.name_b : match.name_a,
      kickLabel: `Kick ${current.kick_number}${current.sudden_death ? " · Sudden death" : ""}`,
    };
  }
  const liveKey = live?.key ?? "";
  const revealing = !!reveal;
  const revealKey = reveal ? `${revealMatchId}-${reveal.number}` : "";

  // Remember the kick being played, so its pitch stays on screen while the result comes in.
  useEffect(() => {
    if (reveal) return;
    if (live && arena?.key !== live.key) {
      setArena(live);
      setTimerDone(false);
    } else if (!live && arena) {
      setArena(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal, liveKey]);

  // Online: the replay starts only after both players' timers are over.
  const canReveal = revealing && (!online || timerDone || !arena);

  useEffect(() => {
    setScoreShown(false);
    if (!reveal || !canReveal) return undefined;
    const scoreTimer = window.setTimeout(() => setScoreShown(true), 900);
    const doneTimer = window.setTimeout(() => doneRef.current?.(), REVEAL_MS);
    return () => {
      window.clearTimeout(scoreTimer);
      window.clearTimeout(doneTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, canReveal]);

  const pauseInfo = current as unknown as {
    paused?: boolean;
    resume_count?: number;
    you_resume_ready?: boolean;
  } | null;
  const paused = online ? !!pauseInfo?.paused : localPause?.matchId === match.id;

  // After a pause the kick starts over, with a fresh countdown.
  useEffect(() => {
    if (paused && !revealing) setTimerDone(false);
  }, [paused, revealing]);

  // Lock page scrolling while the stage is open.
  useEffect(() => {
    if (!fs) return undefined;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [fs]);

  if (!current && !revealing) return null;
  // Full screen is mandatory.
  if (!fs) return <FullscreenGate />;

  const info = current as unknown as { ready_count?: number; you_ready?: boolean; started?: boolean } | null;
  const firstKick = !!current && current.kick_number === 1;
  const started = !current
    ? true
    : online
      ? (info?.started ?? true)
      : !firstKick || startedMatches.has(match.id);

  const shown = revealing ? arena : live;
  const sameMatch = revealMatchId === match.id;
  const hideBoard = revealing && !sameMatch;
  // Hold back the new score until the ball has reached the net.
  const hudMatch: MatchDetail | null = hideBoard
    ? null
    : revealing && reveal && !scoreShown
      ? rewind(match, reveal)
      : match;

  const pressStart = () => {
    if (online) {
      onReady();
    } else {
      startedMatches.add(match.id);
      setStartTick((tick) => tick + 1);
    }
  };

  // Commands travel the same way as a shot or dive zone.
  const send = (command: string) => onCommit(command as ZoneKey);

  const pauseMatch = () => {
    if (online) send("PAUSE");
    else setLocalPause({ matchId: match.id, ready: [] });
  };

  const readyLocal = (seat: number) => {
    if (!localPause) return;
    const ready = [...localPause.ready.filter((item) => item !== seat), seat];
    setLocalPause(ready.length >= 2 ? null : { ...localPause, ready });
  };

  const leaveMatch = (command: string) => {
    setAskLeave(false);
    setLocalPause(null);
    send(command);
  };

  const sides = [
    { seat: match.seat_a, name: match.name_a },
    { seat: match.seat_b, name: match.name_b },
  ];

  let stage: ReactNode = null;
  if (canReveal && reveal) {
    stage = (
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <GoalScene
            key={revealKey}
            result={{ shot: reveal.shot_zone, dive: reveal.dive_zone, outcome: reveal.outcome }}
            fullscreen
            shooterName={reveal.shooter.name}
            keeperName={reveal.keeper.name}
          />
          <ResultBanner kick={reveal} fs />
        </div>
      </div>
    );
  } else if (!revealing && live && !started) {
    stage = (
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <GoalScene
            role={live.role === "wait" ? null : live.role}
            disabled
            fullscreen
            shooterName={live.shooter.name}
            keeperName={live.keeper.name}
          />
          <ReadyPanel
            online={online}
            count={info?.ready_count ?? 0}
            youReady={!!info?.you_ready}
            onStart={pressStart}
          />
        </div>
      </div>
    );
  } else if (!revealing && live && paused) {
    stage = (
      <div className="absolute inset-0">
        <div className="relative h-full w-full">
          <GoalScene
            fullscreen
            shooterName={live.shooter.name}
            keeperName={live.keeper.name}
          />
          <PausePanel
            count={online ? (pauseInfo?.resume_count ?? 0) : (localPause?.ready.length ?? 0)}
            players={
              online
                ? [
                    {
                      key: 0,
                      label: pauseInfo?.you_resume_ready ? "Waiting for opponent" : "Ready",
                      ready: !!pauseInfo?.you_resume_ready,
                      onReady: () => send("RESUME"),
                    },
                  ]
                : sides.map((side) => {
                    const ready = !!localPause?.ready.includes(side.seat);
                    return {
                      key: side.seat,
                      label: `${side.name} ${ready ? "is ready" : "ready"}`,
                      ready,
                      onReady: () => readyLocal(side.seat),
                    };
                  })
            }
          />
        </div>
      </div>
    );
  } else if (shown) {
    stage = (
      <div className="absolute inset-0">
        <SwipeArena
          key={shown.key}
          role={shown.role}
          online={online}
          loading={loading}
          error={error}
          onCommit={onCommit}
          onTimerEnd={() => setTimerDone(true)}
          fs
          shooterName={shown.shooter.name}
          keeperName={shown.keeper.name}
        />
      </div>
    );
  }

  return (
    <section
      className="fixed inset-0 overflow-hidden bg-[#03060c] text-white"
      style={{ zIndex: 2147482000 }}
    >
      {stage}
      <StageHud
        match={hudMatch}
        mySeat={mySeat}
        shooter={shown?.shooter ?? null}
        keeper={shown?.keeper ?? null}
        error={error}
      />

      {/* Pause and leave */}
      {current && (
        <div
          className="pointer-events-none absolute z-40 flex gap-2"
          style={{ right: "max(.75rem, env(safe-area-inset-right))", top: "max(.75rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={pauseMatch}
            disabled={paused || revealing || !started}
            aria-label="Pause match"
            className={stageButton}
          >
            <Pause size={16} />
            <span className="hidden sm:inline">Pause</span>
          </button>
          <button
            type="button"
            onClick={() => setAskLeave(true)}
            disabled={revealing}
            aria-label="Leave match"
            className={stageButton}
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      )}

      {askLeave && current && !revealing && (
        <div className="absolute inset-0 z-30">
          <LeavePanel
            onCancel={() => setAskLeave(false)}
            choices={
              online
                ? [{ key: 0, label: "Leave match", onLeave: () => leaveMatch("LEAVE") }]
                : sides.map((side) => ({
                    key: side.seat,
                    label: `${side.name} leaves`,
                    onLeave: () => leaveMatch(`LEAVE${side.seat}`),
                  }))
            }
          />
        </div>
      )}
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
          shooterName={kick.shooter.name}
          keeperName={kick.keeper.name}
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
/* Squad reveal (shown to every player before the penalties start)     */
/* ================================================================== */

function MiniPitch({ squad }: { squad: SquadPlayer[] }) {
  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl border-2 border-white/70 shadow-xl"
      style={{
        containerType: "inline-size",
        background: "repeating-linear-gradient(180deg,#15803d 0 12.5%,#16a34a 12.5% 25%)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-[20%] bottom-0 h-[18%] border-2 border-b-0 border-white/45" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-black/25 to-transparent" />
      {squad.map((player, index) => {
        const spot = FORMATION[player.slot] ?? { x: 20 + (index % 5) * 15, y: 55 };
        const y = 11 + ((spot.y - 31) * 78) / 61;
        return <PitchCard key={`${player.slot}-${player.player_id}`} player={player} x={spot.x} y={y} />;
      })}
    </div>
  );
}

export function SquadRevealScreen({
  players,
  squads,
  mySeat,
  onContinue,
}: {
  players: { seat: number; name: string }[];
  squads: Record<string, SquadPlayer[]>;
  mySeat: Seat | null;
  onContinue: () => void;
}) {
  const teams = players
    .filter((player) => (squads[String(player.seat)] ?? []).length > 0)
    .sort((a, b) => Number(b.seat === mySeat) - Number(a.seat === mySeat));

  return (
    <section className="mx-auto max-w-4xl pb-24">
      <PageTitle eyebrow="Squads are set" title="YOUR LINE-UPS." text="Take a look, then head to the penalty spot." />
      <div className={`grid gap-5 ${teams.length > 1 ? "sm:grid-cols-2" : "mx-auto max-w-sm"} ${teams.length > 2 ? "lg:grid-cols-3" : ""}`}>
        {teams.map((team) => (
          <div key={team.seat}>
            <p className="mb-2 flex items-center justify-between text-sm font-black">
              <span className="truncate">
                {team.name}
                {mySeat === team.seat && <span className="text-foreground/60"> (You)</span>}
              </span>
              <span className="text-xs text-foreground/60">
                {Math.round(
                  (squads[String(team.seat)] ?? []).reduce((sum, p) => sum + p.ovr_rating, 0) /
                    Math.max(1, (squads[String(team.seat)] ?? []).length),
                )}{" "}
                avg
              </span>
            </p>
            <MiniPitch squad={squads[String(team.seat)] ?? []} />
          </div>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 p-3 backdrop-blur">
        <div className="mx-auto max-w-sm">
          <button type="button" onClick={onContinue} className={primaryButton}>
            Continue
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Champion                                                            */
/* ================================================================== */

const GOLD = "#d4af37";
const GOLD_LIGHT = "#f1dc8f";

export function ChampionScreen({
  state,
  loading = false,
  onRematch,
  onLeave,
}: {
  state: GameState;
  loading?: boolean;
  onRematch: () => void;
  onLeave: () => void;
}) {
  const youWon = state.you_are_champion === true && state.mode === "ONLINE";

  // Leave the full screen stage when the tournament is over.
  useEffect(() => {
    leaveStage();
  }, []);

  return (
    <section className="mx-auto max-w-sm pt-10">
      <div
        className="relative overflow-hidden rounded-2xl border-2 bg-surface p-4 text-center"
        style={{ borderColor: "rgba(212,175,55,0.6)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.2), transparent 70%)" }}
        />
        <div className="relative">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, #f1dc8f, #d4af37)", boxShadow: "0 0 24px rgba(212,175,55,0.4)" }}
          >
            <Trophy size={24} strokeWidth={1.8} style={{ color: "#3a2c04" }} />
          </div>
          <p
            className="mt-2 bg-clip-text text-xl font-black uppercase tracking-[0.2em] text-transparent"
            style={{ backgroundImage: `linear-gradient(180deg, ${GOLD_LIGHT}, ${GOLD})` }}
          >
            {youWon ? "Victory" : "Champion"}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 break-words text-lg font-black">
            <Crown size={16} style={{ color: GOLD }} className="shrink-0" />
            {state.champion_name ?? "Winner"}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onRematch}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-ink transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? <LoaderCircle size={15} className="animate-spin" /> : <RotateCcw size={15} />}
              Rematch
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="rounded-xl border border-foreground/25 bg-surface-2 px-4 py-3 text-sm font-bold text-foreground/80 transition hover:bg-foreground/5"
            >
              Leave
            </button>
          </div>
        </div>
      </div>

      {state.bracket && state.bracket.length > 1 && (
        <Panel className="mt-4 p-3 sm:p-4">
          <BracketView rounds={state.bracket} mySeat={state.mode === "ONLINE" ? state.you.seat : null} />
        </Panel>
      )}
    </section>
  );
}