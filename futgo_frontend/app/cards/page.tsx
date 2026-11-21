"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Check,
  Copy,
  Crown,
  Eye,
  Flag,
  Gamepad2,
  Globe2,
  Layers,
  LoaderCircle,
  Lock,
  LogIn,
  Medal,
  RotateCcw,
  Swords,
  Trophy,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { BackButton, DraftPageShell, ErrorMessage } from "../_draft/DraftUI";
import {
  ApiError,
  DECK_OPTIONS,
  PLAYER_OPTIONS,
  STAT_META,
  cardsApi,
  clearSession,
  errorText,
  fetchFull,
  isUnchanged,
  loadSession,
  nameFor,
  otherSeat,
  saveSession,
  toTokens,
  viewSeatFor,
} from "../_cards/cardsShared";
import type {
  CardsSession,
  GameState,
  PlayerInfo,
  Pool,
  PreviewCard,
  Seat,
  SideInfo,
  StatKey,
  TableClash,
  TablePlay,
} from "../_cards/cardsShared";
import { CardBack, MiniCard, PlayerCard } from "../_cards/CardsUI";

type View = "restoring" | "lobby" | "game";
type LobbyTab = "LOCAL" | "CREATE" | "JOIN";

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 8000;

/* ------------------------------------------------------------------ */
/* Tiers (fixed colours, they do not follow the club theme)            */
/* ------------------------------------------------------------------ */

type Tier = "GOLD" | "SILVER" | "BRONZE";

const TIERS: Tier[] = ["GOLD", "SILVER", "BRONZE"];

const TIER_META: Record<
  Tier,
  { label: string; icon: LucideIcon; grad: string; ink: string }
> = {
  GOLD: {
    label: "Gold",
    icon: Crown,
    grad: "from-[#fff1a8] via-[#f5c518] to-[#b8860b]",
    ink: "text-[#3b2a00]",
  },
  SILVER: {
    label: "Silver",
    icon: Medal,
    grad: "from-[#f4f6f8] via-[#c0c7d0] to-[#7d8793]",
    ink: "text-[#1f2933]",
  },
  BRONZE: {
    label: "Bronze",
    icon: Award,
    grad: "from-[#f0c08a] via-[#cd7f32] to-[#7a4316]",
    ink: "text-[#2b1404]",
  },
};

/** "swap" = challenger changes their card, "play" = responder picks a card. */
type AlbumKind = "swap" | "play";

type AlbumData = {
  hand: Partial<Record<Tier, number[]>>;
  used: Tier[];
  /** Card already shown to the challenger (hidden from the swap album). */
  exclude: number | null;
};

/* ------------------------------------------------------------------ */
/* Design tokens (all colours come from the selected club theme)       */
/* ------------------------------------------------------------------ */

const INPUT_CLASS =
  "w-full rounded-2xl border-2 border-border bg-background px-4 py-3.5 text-sm font-bold text-foreground outline-none transition placeholder:font-semibold placeholder:text-foreground/35 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:opacity-60";

const BTN_BASE =
  "flex w-full items-center justify-center gap-2 font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50";

/** Chunky "game" buttons with a pressed-down effect. */
function btn(
  variant: "primary" | "alt" | "ghost",
  small = false,
  compact = false,
) {
  const size = small
    ? "rounded-xl px-4 py-2.5 text-xs"
    : compact
      ? "rounded-2xl px-4 py-2.5 text-xs sm:px-6 sm:py-4 sm:text-base"
      : "rounded-2xl px-6 py-4 text-sm sm:text-base";

  const press =
    "shadow-[0_5px_0_0_rgba(0,0,0,0.3)] hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)] disabled:shadow-none";

  const tone =
    variant === "primary"
      ? `bg-accent text-accent-ink ${press}`
      : variant === "alt"
        ? `bg-accent-2 text-accent-2-ink ${press}`
        : "border-2 border-border bg-surface text-foreground/80 hover:border-accent/60 hover:text-foreground";

  return `${BTN_BASE} ${size} ${tone}`;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** win / lose / tie for one card, judged against the other cards in its clash. */
function resultOf(plays: TablePlay[], play: TablePlay): "win" | "lose" | "tie" {
  const best = Math.max(...plays.map((p) => p.value));
  if (play.value !== best) return "lose";
  return plays.filter((p) => p.value === best).length > 1 ? "tie" : "win";
}

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Spinner({ text }: { text?: string }) {
  return (
    <section className="mx-auto max-w-md py-24 text-center">
      <div className="flex flex-col items-center gap-3 text-muted">
        <LoaderCircle size={30} className="animate-spin text-accent-text" />
        {text && <p className="text-sm">{text}</p>}
      </div>
    </section>
  );
}

function StageWrap({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-sm">{children}</div>;
}

/** Diagonal club-colour bands and glows behind a screen. */
function Backdrop() {
  return (
    <div className="pointer-events-none absolute inset-x-[-2rem] -top-6 bottom-0 overflow-hidden">
      <div className="absolute -left-10 top-6 h-40 w-[140%] -rotate-6 bg-accent/10" />
      <div className="absolute -left-10 top-52 h-24 w-[140%] -rotate-6 bg-accent-2/10" />
      <div className="absolute -left-10 top-4 h-56 w-56 rounded-full bg-accent/25 blur-3xl" />
      <div className="absolute -right-10 top-40 h-52 w-52 rounded-full bg-accent-2/25 blur-3xl" />
    </div>
  );
}

// A quiet one-line status ("Waiting...")
function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-5 flex w-fit max-w-full items-center justify-center gap-2 rounded-full border-2 border-accent/30 bg-accent/10 px-4 py-2 text-sm font-black text-accent-text">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-2.5 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-muted">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </span>
  );
}

/** Text input with a coloured player badge on the left. */
function NameField({
  badge,
  tone,
  ...props
}: {
  badge: string;
  tone: "a" | "b";
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span
        className={`absolute left-2.5 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-[11px] font-black ${
          tone === "a"
            ? "bg-accent text-accent-ink"
            : "bg-accent-2 text-accent-2-ink"
        }`}
      >
        {badge}
      </span>
      <input {...props} className={`${INPUT_CLASS} pl-14`} />
    </div>
  );
}

/** Two-player scoreboard (local play and 2-player rooms). */
function ScoreBar({
  left,
  right,
  round,
  pot,
  challengerSeat,
  tieBreak,
}: {
  left: SideInfo;
  right: SideInfo;
  round: number;
  pot: number;
  challengerSeat: Seat;
  tieBreak: boolean;
}) {
  const side = (info: SideInfo, align: "left" | "right") => (
    <div
      className={`flex min-w-0 flex-col justify-center px-4 py-3 ${
        align === "left"
          ? "items-start bg-accent text-accent-ink"
          : "items-end bg-accent-2 text-accent-2-ink"
      }`}
    >
      <span
        className={`flex max-w-full items-center gap-1 text-[11px] font-black uppercase tracking-wider opacity-85 ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
      >
        <span className="truncate">{info.name}</span>
        {info.seat === challengerSeat && (
          <Swords size={12} className="shrink-0" />
        )}
      </span>
      <span className="text-4xl font-black leading-none tabular-nums">
        {info.cards_left}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-70">
        cards
      </span>
    </div>
  );

  return (
    <div className="relative mb-3 overflow-hidden rounded-3xl border-2 sm:mb-5 border-border bg-surface shadow-xl shadow-black/10">
      <div className="grid grid-cols-[1fr_auto_1fr]">
        {side(left, "left")}
        <div className="flex min-w-[76px] flex-col items-center justify-center gap-1 bg-surface px-2 py-3">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">
            Round
          </span>
          <span className="text-3xl font-black leading-none">{round}</span>
          {tieBreak && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black text-slate-900">
              Tie-break
            </span>
          )}
          {pot > 0 && (
            <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-black text-background">
              Pot {pot}
            </span>
          )}
        </div>
        {side(right, "right")}
      </div>
    </div>
  );
}

/** Scoreboard for 3 to 6 players: one chip per player. */
function PlayersBar({
  players,
  round,
  pot,
  clash,
  showRevealed,
}: {
  players: PlayerInfo[];
  round: number;
  pot: number;
  clash: number;
  showRevealed: boolean;
}) {
  return (
    <div className="relative mb-3 overflow-hidden rounded-3xl border-2 border-border bg-surface p-3 shadow-xl shadow-black/10 sm:mb-5">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        {pot > 0 && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-black text-background">
            Pot {pot}
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-3">
        {players.map((p, i) => (
          <div
            key={p.seat}
            className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2 ${
              i % 2 === 0
                ? "bg-accent text-accent-ink"
                : "bg-accent-2 text-accent-2-ink"
            } ${p.is_you ? "ring-2 ring-foreground" : ""} ${
              p.eliminated ? "opacity-40 grayscale" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-1 text-[11px] font-black uppercase tracking-wide">
              <span className="truncate">{p.name}</span>
            </span>
            <span className="text-2xl font-black leading-none tabular-nums">
              {p.cards_left}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Kickoff Draw: names flick past, then the server's pick is declared. */
function KickoffDraw({ names, winner }: { names: string[]; winner: string }) {
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState(names.length < 2);

  useEffect(() => {
    if (names.length < 2) return undefined;

    const spin = window.setInterval(() => setIndex((i) => i + 1), 110);
    const stop = window.setTimeout(() => {
      window.clearInterval(spin);
      setDone(true);
    }, 1900);

    return () => {
      window.clearInterval(spin);
      window.clearTimeout(stop);
    };
  }, [names.length]);

  const label = done || names.length === 0 ? winner : names[index % names.length];

  return (
    <div className="mb-5 overflow-hidden rounded-3xl border-2 border-border bg-surface p-4 text-center shadow-xl shadow-black/10">
      <p className="text-[11px] font-black uppercase tracking-[0.3em] text-muted">
        Kickoff draw
      </p>
      <div
        className={`mx-auto mt-3 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xl font-black uppercase transition-all duration-300 ${
          done
            ? "scale-105 bg-accent text-accent-ink shadow-lg shadow-accent/40"
            : "bg-foreground/10 text-foreground/70"
        }`}
      >
        <Swords size={20} className="shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-muted">
        {done ? "locks the first stat." : "Picking who locks first..."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tier pieces                                                         */
/* ------------------------------------------------------------------ */

const BACK_SIZE = {
  xs: "h-14 w-10 rounded-lg",
  sm: "h-24 w-16 rounded-xl",
  md: "h-32 w-24 rounded-2xl",
  lg: "h-52 w-36 rounded-2xl",
} as const;

const BACK_ICON = { xs: 14, sm: 20, md: 28, lg: 46 } as const;

/** A face-down card in tier colours. The player is never shown. */
function TierBack({
  tier,
  size = "sm",
  selected = false,
  onClick,
  disabled,
}: {
  tier: Tier;
  size?: keyof typeof BACK_SIZE;
  selected?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;

  const face = (
    <span
      className={`relative flex ${BACK_SIZE[size]} items-center justify-center overflow-hidden border-2 border-white/80 bg-gradient-to-br ${meta.grad} ${meta.ink} shadow-lg transition ${
        selected ? "-translate-y-1 scale-105 ring-4 ring-foreground" : ""
      }`}
    >
      <span className="pointer-events-none absolute inset-1 rounded-[inherit] border border-black/15" />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/35 via-transparent to-black/15" />
      <Icon size={BACK_ICON[size]} className="relative opacity-80" />
    </span>
  );

  if (!onClick) return face;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${meta.label} card, face down`}
      className="rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-accent/60 disabled:opacity-50"
    >
      {face}
    </button>
  );
}

/** Face-up preview card: tier frame, player image and name only (no stats). */
function DealCard({ card, delay }: { card: PreviewCard; delay: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const meta = TIER_META[card.tier];
  const Icon = meta.icon;

  return (
    <div
      className={`card-pop relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-white/80 bg-gradient-to-br ${meta.grad} ${meta.ink} shadow-lg`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {card.image && !imgFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.image}
          alt={card.name}
          loading="lazy"
          draggable={false}
          onError={() => setImgFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <Icon size={32} className="absolute inset-0 m-auto opacity-50" />
      )}

      {/* tier badge */}
      <span
        className={`absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br ${meta.grad} ${meta.ink} shadow ring-1 ring-black/20`}
      >
        <Icon size={11} />
      </span>

      {/* name strip */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/60 to-transparent px-1.5 pb-1.5 pt-6">
        <p className="line-clamp-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide text-white">
          {card.name}
        </p>
      </div>
    </div>
  );
}

/** Deal preview. Online: only your own deck, face up (image + name), no stats. */
function DealPreview({
  isLocal,
  players,
  you,
  hand,
  preview,
  isChallenger,
  firstLocker,
  onStart,
}: {
  isLocal: boolean;
  players: PlayerInfo[];
  you: SideInfo;
  hand: Partial<Record<Tier, number[]>> | null;
  preview: PreviewCard[] | null;
  isChallenger: boolean;
  firstLocker: string;
  onStart: () => void;
}) {
  const others = players.filter((p) => p.seat !== you.seat);

  const startButton = (
    <button type="button" onClick={onStart} className={`${btn("primary")} mt-6`}>
      {isLocal || isChallenger ? "Start round 1" : "Ready"} <ArrowRight size={18} />
    </button>
  );

  // Plain club-coloured decks: local play (one shared screen) or no tier data.
  const plainPanel = (info: SideInfo, tone: "a" | "b", offset: number) => (
    <div
      key={info.seat}
      className="rounded-3xl border-2 border-border bg-surface p-4 shadow-xl shadow-black/10"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span
          className={`truncate rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider ${
            tone === "a"
              ? "bg-accent text-accent-ink"
              : "bg-accent-2 text-accent-2-ink"
          }`}
        >
          {info.name}
        </span>
        <span className="text-3xl font-black leading-none tabular-nums">
          {info.cards_left}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5" aria-label={`${info.cards_left} cards face down`}>
        {Array.from({ length: info.cards_left }).map((_, i) => (
          <span
            key={i}
            className={`card-pop relative flex h-14 w-10 items-center justify-center rounded-lg border-2 border-white/80 shadow-md ${
              tone === "a"
                ? "bg-accent text-accent-ink"
                : "bg-accent-2 text-accent-2-ink"
            }`}
            style={{ animationDelay: `${(offset + i) * 40}ms`, animationFillMode: "both" }}
          >
            <span className="pointer-events-none absolute inset-0.5 rounded-md border border-white/30" />
            <Layers size={14} className="opacity-70" />
          </span>
        ))}
      </div>
    </div>
  );

  // Local play is handled by LocalDealFlow; this is the plain fallback.
  if (isLocal || !hand) {
    let offset = 0;
    return (
      <div className="mx-auto w-full max-w-md pb-24">
        <p className="mb-4 text-center text-[11px] font-black uppercase tracking-[0.3em] text-muted">
          Cards dealt
        </p>
        <KickoffDraw names={players.map((p) => p.name)} winner={firstLocker} />
        <div className="grid gap-4">
          {players.map((p, i) => {
            const panel = plainPanel(p, i % 2 === 0 ? "a" : "b", offset);
            offset += p.cards_left;
            return panel;
          })}
        </div>
        {startButton}
      </div>
    );
  }

  // Sort face-up cards Gold -> Silver -> Bronze.
  const cards: PreviewCard[] | null =
    preview && preview.length > 0
      ? [...preview].sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
      : null;

  const groups = TIERS.map((tier) => ({ tier, ids: hand[tier] ?? [] })).filter(
    (g) => g.ids.length > 0,
  );
  let index = 0;

  return (
    <div className="mx-auto w-full max-w-2xl pb-24">
      <KickoffDraw names={players.map((p) => p.name)} winner={firstLocker} />

      <p className="mb-4 text-center text-[11px] font-black uppercase tracking-[0.3em] text-muted">
        Your deck
      </p>

      <div className="rounded-3xl border-2 border-border bg-surface p-4 shadow-xl shadow-black/10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="truncate rounded-lg bg-accent px-3 py-1 text-xs font-black uppercase tracking-wider text-accent-ink">
            {you.name}
          </span>
          <span className="text-3xl font-black leading-none tabular-nums">
            {you.cards_left}
          </span>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {groups.map(({ tier, ids }) => {
            const meta = TIER_META[tier];
            const Icon = meta.icon;
            return (
              <span
                key={tier}
                className={`flex items-center gap-1 rounded-full bg-gradient-to-br ${meta.grad} ${meta.ink} px-3 py-1 text-[11px] font-black shadow`}
              >
                <Icon size={12} />
                {ids.length} {meta.label}
              </span>
            );
          })}
        </div>

        {cards ? (
          <div
            className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5"
            aria-label={`${cards.length} cards in your deck`}
          >
            {cards.map((card, i) => (
              <DealCard key={card.id} card={card} delay={i * 40} />
            ))}
          </div>
        ) : (
          // Fallback: server did not send a preview, keep the face-down view.
          <div className="flex flex-wrap gap-1.5" aria-label={`${you.cards_left} cards face down`}>
            {groups.flatMap(({ tier, ids }) =>
              ids.map((id) => {
                const delay = index++ * 40;
                return (
                  <span
                    key={id}
                    className="card-pop"
                    style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
                  >
                    <TierBack tier={tier} size="xs" />
                  </span>
                );
              }),
            )}
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs font-semibold text-muted">
        {others.length === 1
          ? `${others[0].name} holds ${others[0].cards_left} cards too.`
          : `${others.length} opponents hold ${you.cards_left} cards each.`}{" "}
        Only you can see your deck.
      </p>

      {startButton}
    </div>
  );
}

/** One player's deck, face up: tier counts plus a grid of image + name cards. */
function DeckPanel({
  name,
  cards,
  tone,
}: {
  name: string;
  cards: PreviewCard[];
  tone: "a" | "b";
}) {
  const sorted = [...cards].sort(
    (a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier),
  );

  return (
    <div className="rounded-3xl border-2 border-border bg-surface p-4 shadow-xl shadow-black/10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span
          className={`truncate rounded-lg px-3 py-1 text-xs font-black uppercase tracking-wider ${
            tone === "a"
              ? "bg-accent text-accent-ink"
              : "bg-accent-2 text-accent-2-ink"
          }`}
        >
          {name}
        </span>
        <span className="text-3xl font-black leading-none tabular-nums">
          {sorted.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TIERS.map((tier) => {
          const count = sorted.filter((c) => c.tier === tier).length;
          if (count === 0) return null;
          const meta = TIER_META[tier];
          const Icon = meta.icon;
          return (
            <span
              key={tier}
              className={`flex items-center gap-1 rounded-full bg-gradient-to-br ${meta.grad} ${meta.ink} px-3 py-1 text-[11px] font-black shadow`}
            >
              <Icon size={12} />
              {count} {meta.label}
            </span>
          );
        })}
      </div>

      <div
        className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5"
        aria-label={`${sorted.length} cards in ${name}'s deck`}
      >
        {sorted.map((card, i) => (
          <DealCard key={card.id} card={card} delay={i * 40} />
        ))}
      </div>
    </div>
  );
}

/**
 * Local (one shared device) deal preview. Each player sees only their own
 * deck face up, one after the other, with a pass-the-device screen between.
 * Last step: the Kickoff Draw says who locks first.
 */
function LocalDealFlow({
  session,
  names,
  firstLocker,
  onStart,
}: {
  session: CardsSession;
  names: Record<1 | 2, string>;
  firstLocker: string;
  onStart: () => void;
}) {
  const [decks, setDecks] = useState<Partial<Record<Seat, PreviewCard[]>>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<
    "pass1" | "deck1" | "pass2" | "deck2" | "kickoff"
  >("pass1");

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchFull(session, 1), fetchFull(session, 2)])
      .then(([a, b]) => {
        if (cancelled) return;
        setDecks({ 1: a.hand_preview ?? [], 2: b.hand_preview ?? [] });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  if (loading) return <Spinner />;

  if (failed || !decks[1]?.length || !decks[2]?.length) {
    return (
      <StageWrap>
        <ErrorMessage message="Can't load the deck preview." />
        <button type="button" onClick={onStart} className={`${btn("primary")} mt-6`}>
          Start round 1 <ArrowRight size={18} />
        </button>
      </StageWrap>
    );
  }

  const pass = (seat: 1 | 2, next: "deck1" | "deck2") => (
    <StageWrap>
      <CardBack title="PASS THE DEVICE" subtitle={names[seat]} />
      <button
        type="button"
        onClick={() => setStep(next)}
        className={`${btn("primary")} mt-6`}
      >
        <Eye size={18} /> I&apos;m {names[seat]}
      </button>
    </StageWrap>
  );

  if (step === "pass1") return pass(1, "deck1");
  if (step === "pass2") return pass(2, "deck2");

  if (step === "kickoff") {
    return (
      <StageWrap>
        <KickoffDraw names={[names[1], names[2]]} winner={firstLocker} />
        <button type="button" onClick={onStart} className={`${btn("primary")} mt-6`}>
          Start round 1 <ArrowRight size={18} />
        </button>
      </StageWrap>
    );
  }

  const seat: 1 | 2 = step === "deck1" ? 1 : 2;

  return (
    <div className="mx-auto w-full max-w-2xl pb-24">
      <p className="mb-4 text-center text-[11px] font-black uppercase tracking-[0.3em] text-muted">
        Your deck
      </p>

      <DeckPanel
        key={seat}
        name={names[seat]}
        cards={decks[seat] ?? []}
        tone={seat === 1 ? "a" : "b"}
      />

      <p className="mt-4 text-center text-xs font-semibold text-muted">
        Only {names[seat]} should look. Hide the screen before passing it on.
      </p>

      {seat === 1 ? (
        <button
          type="button"
          onClick={() => setStep("pass2")}
          className={`${btn("primary")} mt-6`}
        >
          Hide and pass to {names[2]} <ArrowRight size={18} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setStep("kickoff")}
          className={`${btn("primary")} mt-6`}
        >
          Hide and continue <ArrowRight size={18} />
        </button>
      )}
    </div>
  );
}

/** Tier album: pick a tier, then a face-down card from it. */
function Album({
  data,
  tier,
  picked,
  busy,
  flipping,
  onSelectTier,
  onPick,
  onBack,
  onPlay,
  actionLabel,
  skipLabel,
}: {
  data: AlbumData;
  tier: Tier | null;
  picked: number | null;
  busy: boolean;
  flipping: boolean;
  onSelectTier: (tier: Tier) => void;
  onPick: (id: number) => void;
  onBack: () => void;
  onPlay: () => void;
  actionLabel: string;
  skipLabel: string;
}) {
  const idsOf = (t: Tier) =>
    (data.hand[t] ?? []).filter((id) => id !== data.exclude);
  const ids = tier ? idsOf(tier) : [];

  return (
    <div className="mx-auto w-full max-w-md pb-24">
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          aria-label="Back"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-border bg-surface text-foreground/80 transition hover:border-accent/60 disabled:opacity-50"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-lg font-black leading-tight">
            {tier ? `${TIER_META[tier].label} album` : "Your cards"}
          </p>
          <p className="text-xs font-semibold text-muted">
            {tier
              ? "Pick one face-down card."
              : "One pick per tier each game. Cards stay hidden."}
          </p>
        </div>
      </div>

      {!tier ? (
        <div className="grid gap-3">
          {TIERS.map((t) => {
            const meta = TIER_META[t];
            const count = idsOf(t).length;
            const used = data.used.includes(t);
            const disabled = used || count === 0;

            return (
              <button
                key={t}
                type="button"
                disabled={disabled}
                onClick={() => onSelectTier(t)}
                className="flex items-center gap-4 rounded-2xl border-2 border-border bg-surface p-3 text-left transition enabled:hover:border-accent/60 disabled:opacity-45"
              >
                <TierBack tier={t} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">{meta.label}</span>
                  <span className="block text-xs font-semibold text-muted">
                    {count} {count === 1 ? "card" : "cards"}
                  </span>
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    disabled
                      ? "bg-foreground/10 text-muted"
                      : "bg-accent text-accent-ink"
                  }`}
                >
                  {used ? "Used" : count === 0 ? "Empty" : "Ready"}
                </span>
              </button>
            );
          })}

          <button type="button" onClick={onBack} className={`${btn("ghost", true)} mt-1`}>
            {skipLabel}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col items-center rounded-3xl border-2 border-dashed border-border bg-surface/60 p-4">
            {picked !== null ? (
              <div
                style={{
                  transform: flipping
                    ? "perspective(1000px) rotateY(90deg) scale(0.97)"
                    : "perspective(1000px) rotateY(0deg) scale(1)",
                  transition: "transform 420ms cubic-bezier(0.2, 0.75, 0.25, 1)",
                }}
              >
                <TierBack tier={tier} size="lg" />
              </div>
            ) : (
              <div className="flex h-52 w-36 items-center justify-center rounded-2xl border-2 border-dashed border-border text-center text-xs font-bold text-muted">
                Pick a card below
              </div>
            )}
            <button
              type="button"
              onClick={onPlay}
              disabled={picked === null || busy}
              className={`${btn("primary")} mt-4`}
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Eye size={18} />}
              {actionLabel}
            </button>
          </div>

          <div className="grid grid-cols-4 justify-items-center gap-x-2 gap-y-4">
            {ids.map((id) => (
              <TierBack
                key={id}
                tier={tier}
                size="sm"
                selected={picked === id}
                onClick={() => onPick(id)}
                disabled={busy}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function CardsPage() {
  const [view, setView] = useState<View>("restoring");
  const [tab, setTab] = useState<LobbyTab>("LOCAL");

  const [pools, setPools] = useState<Pool[]>([]);
  const [poolsLoading, setPoolsLoading] = useState(true);
  const [name1, setName1] = useState("");
  const [name2, setName2] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [poolKey, setPoolKey] = useState("ALL");
  const [deckSize, setDeckSize] = useState(20);
  const [maxPlayers, setMaxPlayers] = useState(2);

  const [session, setSession] = useState<CardsSession | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  // Local mode: which seat currently holds the shared device.
  const [holderSeat, setHolderSeat] = useState<Seat | null>(null);

  // Deal preview (round 1) and tier album (responder, after a stat is locked).
  const [dealSeen, setDealSeen] = useState(false);
  const [albumKind, setAlbumKind] = useState<AlbumKind | null>(null);
  // Local play only: tier hints for the responder (the screen holds the
  // challenger's view, so the responder's view is fetched separately).
  const [localHint, setLocalHint] = useState<Tier | null>(null);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [album, setAlbum] = useState<AlbumData | null>(null);
  const [albumTier, setAlbumTier] = useState<Tier | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [isCardFlipping, setIsCardFlipping] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const sessionRef = useRef<CardsSession | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const busyRef = useRef(false);

  const showDeal =
    view === "game" &&
    !!game &&
    game.status === "ACTIVE" &&
    game.phase === "CHOOSING" &&
    game.round_number === 1 &&
    !dealSeen;

  /* ----------------------------- state helpers ---------------------- */

  const closeAlbum = useCallback(() => {
    setAlbumKind(null);
    setAlbumTier(null);
    setPickedId(null);
    setAlbum(null);
  }, []);

  const applyGame = useCallback((next: GameState) => {
    const previous = gameRef.current;
    // Never let an older response overwrite a newer one.
    if (previous && next.version < previous.version) return;
    gameRef.current = next;
    setGame(next);
  }, []);

  const beginGame = useCallback(
    (sess: CardsSession, state: GameState) => {
      saveSession(sess);
      sessionRef.current = sess;
      gameRef.current = null; // new game: reset the version guard
      setSession(sess);
      applyGame(state);
      setSelectedStat(null);
      setHolderSeat(null);
      setDealSeen(false);
      closeAlbum();
      setError("");
      setView("game");
    },
    [applyGame, closeAlbum],
  );

  const leaveGame = useCallback(() => {
    clearSession();
    sessionRef.current = null;
    gameRef.current = null;
    setSession(null);
    setGame(null);
    setSelectedStat(null);
    setHolderSeat(null);
    setDealSeen(false);
    closeAlbum();
    setError("");
    setView("lobby");
  }, [closeAlbum]);

  // The album only makes sense while a stat is locked.
  const phase = game?.phase;
  useEffect(() => {
    if (
      (albumKind === "swap" && phase !== "CHOOSING") ||
      (albumKind === "play" && phase !== "LOCKED")
    ) {
      closeAlbum();
    }
  }, [phase, albumKind, closeAlbum]);

  const lockedNow = game?.phase === "LOCKED";
  const challengerNow = game?.challenger_seat;
  useEffect(() => {
    const sess = sessionRef.current;
    if (!lockedNow || !sess || sess.mode !== "LOCAL" || !challengerNow) {
      setLocalHint(null);
      return undefined;
    }

    let cancelled = false;
    fetchFull(sess, otherSeat(challengerNow))
      .then((s) => {
        if (cancelled) return;
        setLocalHint(s.opponent_card_tier ?? null);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [lockedNow, challengerNow]);

  /* ----------------------------- startup ---------------------------- */

  useEffect(() => {
    let cancelled = false;

    cardsApi
      .pools()
      .then((res) => {
        if (!cancelled) setPools(res.pools);
      })
      .catch(() => {
        if (!cancelled) setError("Can't load card pools. Is the server running?");
      })
      .finally(() => {
        if (!cancelled) setPoolsLoading(false);
      });

    const stored = loadSession();
    const roomParam = new URLSearchParams(window.location.search).get("room");

    const restore = async () => {
      if (!stored) {
        if (roomParam) {
          setJoinCode(roomParam.trim().toUpperCase().slice(0, 6));
          setTab("JOIN");
        }
        setView("lobby");
        return;
      }

      try {
        const firstSeat: Seat = stored.mode === "ONLINE" ? stored.seat : 1;
        let state = await fetchFull(stored, firstSeat);

        if (stored.mode === "LOCAL" && state.status === "ACTIVE") {
          const seat = viewSeatFor(state, stored);
          if (seat !== state.you.seat) state = await fetchFull(stored, seat);
        }

        if (cancelled) return;
        beginGame(stored, state);
      } catch {
        clearSession();
        if (!cancelled) setView("lobby");
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [beginGame]);

  /* ----------------------------- online polling --------------------- */

  useEffect(() => {
    if (view !== "game" || !session || session.mode !== "ONLINE") {
      return undefined;
    }

    const token = session.tokens[session.seat];
    let cancelled = false;
    let failures = 0;
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return;

      const current = gameRef.current;

      if (
        token &&
        current &&
        current.status !== "FINISHED" &&
        !busyRef.current &&
        !document.hidden
      ) {
        try {
          const result = await cardsApi.state(
            session.roomCode,
            token,
            current.version,
          );

          if (cancelled) return;
          failures = 0;

          if (!isUnchanged(result) && !busyRef.current) applyGame(result);
        } catch (err) {
          if (cancelled) return;

          if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
            leaveGame();
            return;
          }

          failures += 1;
        }
      }

      if (!cancelled) {
        timer = window.setTimeout(
          tick,
          failures > 0
            ? Math.min(POLL_MS * 2 ** Math.min(failures, 2), MAX_BACKOFF_MS)
            : POLL_MS,
        );
      }
    };

    timer = window.setTimeout(tick, 1000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [view, session, applyGame, leaveGame]);

  /* ----------------------------- lobby ------------------------------ */

  // Local games always have 2 players; only "Create" lets you pick 2 to 6.
  const needPlayers = tab === "CREATE" ? maxPlayers : 2;

  const selectedPool = pools.find((pool) => pool.key === poolKey);
  const poolCount = selectedPool?.count ?? 0;

  // Every player gets the same number of cards, so the pool must hold
  // deck size x players unique cards.
  const deckChoices = useMemo(
    () => DECK_OPTIONS.filter((n) => n * needPlayers <= poolCount),
    [poolCount, needPlayers],
  );

  useEffect(() => {
    if (deckChoices.length > 0 && !deckChoices.includes(deckSize)) {
      setDeckSize(deckChoices[deckChoices.length - 1]);
    }
  }, [deckChoices, deckSize]);

  const submitLobby = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (tab === "JOIN") {
      const code = joinCode.trim().toUpperCase();
      const name = joinName.trim();

      if (code.length < 4) {
        setError("Enter the room code.");
        return;
      }

      if (!name) {
        setError("Enter your name.");
        return;
      }

      setBusy(true);

      try {
        const res = await cardsApi.join(code, name);
        beginGame(
          {
            roomCode: res.room_code,
            mode: "ONLINE",
            seat: res.seat ?? 2,
            tokens: toTokens(res.tokens),
          },
          res.state,
        );
      } catch (err) {
        setError(errorText(err, "Can't join that room."));
      } finally {
        setBusy(false);
      }

      return;
    }

    const p1 = name1.trim();
    const p2 = name2.trim();
    const mode = tab === "LOCAL" ? "LOCAL" : "ONLINE";

    if (!p1) {
      setError(mode === "LOCAL" ? "Enter Player 1's name." : "Enter your name.");
      return;
    }

    if (mode === "LOCAL") {
      if (!p2) {
        setError("Enter Player 2's name.");
        return;
      }

      if (p1.toLowerCase() === p2.toLowerCase()) {
        setError("Use two different names.");
        return;
      }
    }

    if (deckChoices.length === 0) {
      setError("This pool is too small for that many players. Pick another.");
      return;
    }

    setBusy(true);

    try {
      const res = await cardsApi.create({
        mode,
        player1_name: p1,
        player2_name: mode === "LOCAL" ? p2 : undefined,
        category: poolKey,
        deck_size: deckSize,
        max_players: mode === "ONLINE" ? maxPlayers : 2,
      });

      beginGame(
        {
          roomCode: res.room_code,
          mode,
          seat: 1,
          tokens: toTokens(res.tokens),
        },
        res.state,
      );
    } catch (err) {
      setError(errorText(err, "Can't create the game."));
    } finally {
      setBusy(false);
    }
  };

  /* ----------------------------- game actions ----------------------- */

  const resync = async () => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current) return;

    const seat = viewSeatFor(current, sess);
    applyGame(await fetchFull(sess, seat));
  };

  const run = async (action: () => Promise<GameState>) => {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      applyGame(await action());
    } catch (err) {
      setError(errorText(err, "Something went wrong. Try again."));
      // The game may have moved on (e.g. another player acted first).
      await resync().catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const lockStat = () => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current || !selectedStat) return;

    const seat: Seat =
      sess.mode === "ONLINE" ? sess.seat : current.challenger_seat;
    const token = sess.tokens[seat];
    if (!token) return;

    void run(async () => {
      const next = await cardsApi.lock(sess.roomCode, token, selectedStat);
      setSelectedStat(null);
      return next;
    });
  };

  /** Responder seat: online = me, local = the player who is not challenging. */
  const responderSeatFor = (sess: CardsSession, current: GameState): Seat =>
    sess.mode === "ONLINE" ? sess.seat : otherSeat(current.challenger_seat);

  /** Open the tier album: "swap" for the challenger, "play" for a responder. */
  const openAlbum = async (kind: AlbumKind) => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current || busyRef.current) return;

    const seat: Seat =
      kind === "swap"
        ? sess.mode === "ONLINE"
          ? sess.seat
          : current.challenger_seat
        : responderSeatFor(sess, current);

    setAlbumLoading(true);
    setError("");

    try {
      const full = await fetchFull(sess, seat);

      setAlbum({
        hand: full.hand ?? {},
        used: full.used_tiers ?? [],
        exclude: kind === "swap" ? (full.current_card_id ?? null) : null,
      });
      setAlbumTier(null);
      setPickedId(null);
      setAlbumKind(kind);
    } catch (err) {
      setError(errorText(err, "Can't load your cards. Try again."));
    } finally {
      setAlbumLoading(false);
    }
  };

  const handleAlbumBack = () => {
    if (albumTier) {
      setAlbumTier(null);
      setPickedId(null);
    } else {
      closeAlbum();
    }
  };

  /** Challenger: swap the current card for a face-down card from a tier. */
  const handleChooseCard = () => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current || pickedId === null) return;

    const seat: Seat =
      sess.mode === "ONLINE" ? sess.seat : current.challenger_seat;
    const token = sess.tokens[seat];
    if (!token) return;

    const cardId = pickedId;

    void run(async () => {
      const next = await cardsApi.choose(sess.roomCode, token, cardId);
      closeAlbum();
      setSelectedStat(null);
      return next;
    });
  };

  /** Reveal the responder card. Without a cardId the top card is played. */
  const handleRevealCard = async (cardId?: number) => {
    if (busyRef.current || isCardFlipping) return;

    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current) return;

    const seat = responderSeatFor(sess, current);
    const token = sess.tokens[seat];
    if (!token) return;

    // Finish the server reveal first. Do not flip the back away while the
    // request is still loading, otherwise the card face appears late.
    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      const next = await cardsApi.reveal(sess.roomCode, token, cardId);
      if (sess.mode === "LOCAL") setHolderSeat(seat);

      // Begin the flip only when the revealed card data is ready, then swap
      // faces at the edge of the turn so the player card appears immediately.
      setIsCardFlipping(true);
      window.setTimeout(() => {
        applyGame(next);
        // With 3+ players the table may still be waiting for others, so the
        // album has to close here and not only when the phase changes.
        closeAlbum();
        window.setTimeout(() => setIsCardFlipping(false), 220);
      }, 210);
    } catch (err) {
      setError(errorText(err, "Can't reveal the card. Try again."));
      await resync().catch(() => undefined);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const continueGame = () => {
    const sess = sessionRef.current;
    if (!sess) return;

    const seat: Seat = sess.mode === "ONLINE" ? sess.seat : 1;
    const token = sess.tokens[seat];
    if (!token) return;

    void run(async () => {
      let next = await cardsApi.next(sess.roomCode, token);

      if (sess.mode === "LOCAL" && next.status === "ACTIVE") {
        const viewSeat = viewSeatFor(next, sess);
        if (viewSeat !== next.you.seat) next = await fetchFull(sess, viewSeat);
      }

      setSelectedStat(null);
      return next;
    });
  };

  const concede = () => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current) return;

    const seat: Seat = sess.mode === "ONLINE" ? sess.seat : viewSeatFor(current, sess);
    const token = sess.tokens[seat];
    if (!token) return;

    const who = nameFor(current, seat);
    const message =
      current.max_players > 2
        ? `${who}, leave this game? Your cards are shared with the other players.`
        : `${who}, concede this game?`;

    if (!window.confirm(message)) return;

    void run(() => cardsApi.concede(sess.roomCode, token));
  };

  const copyText = async (text: string, kind: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();

      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }

      document.body.removeChild(area);
    }

    setCopied(kind);
    window.setTimeout(() => setCopied((v) => (v === kind ? null : v)), 1800);
  };

  /* ----------------------------- render: lobby ---------------------- */

  const tabs: { key: LobbyTab; label: string; sub: string; icon: ReactNode }[] = [
    { key: "LOCAL", label: "Local", sub: "1 device", icon: <Gamepad2 size={22} /> },
    { key: "CREATE", label: "Create", sub: "2-6 players", icon: <Globe2 size={22} /> },
    { key: "JOIN", label: "Join", sub: "Use code", icon: <LogIn size={22} /> },
  ];

  const submitLabel =
    tab === "JOIN" ? "Join game" : tab === "CREATE" ? "Create room" : "Kick off";

  const lobby = (
    <section className="relative mx-auto w-full max-w-md pb-8 pt-1 sm:pt-3">
      <Backdrop />

      <div className="relative">
        <div className="hidden md:flex mb-5 mt-2 flex justify-end">
          <BackButton />
        </div>

        <form
          onSubmit={submitLobby}
          className="overflow-hidden mt-10 rounded-[28px] border-2 border-border bg-surface shadow-2xl shadow-accent/15"
        >

          <div className="grid gap-5 p-5 sm:p-6">
            {/* Mode tiles */}
            <div className="grid grid-cols-3 gap-2">
              {tabs.map((item) => {
                const active = tab === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setTab(item.key);
                      setError("");
                    }}
                    className={`flex flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 transition ${
                      active
                        ? "-translate-y-0.5 border-accent bg-accent text-accent-ink shadow-lg shadow-accent/40"
                        : "border-border bg-background text-muted hover:border-accent/50 hover:text-foreground"
                    }`}
                  >
                    {item.icon}
                    <span className="text-sm font-black">{item.label}</span>
                    <span
                      className={`text-[10px] font-bold ${
                        active ? "opacity-75" : "opacity-60"
                      }`}
                    >
                      {item.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            {tab === "JOIN" ? (
              <>
                <input
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(
                      e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 6),
                    )
                  }
                  placeholder="CODE"
                  aria-label="Room code"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className={`${INPUT_CLASS} border-accent/40 bg-accent/[0.06] py-4 text-center text-3xl font-black uppercase tracking-[0.35em]`}
                />
                <NameField
                  badge="YOU"
                  tone="b"
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Your name"
                  aria-label="Your name"
                  maxLength={40}
                  disabled={busy}
                />
              </>
            ) : (
              <>
                <div className="grid gap-3">
                  <NameField
                    badge={tab === "LOCAL" ? "P1" : "YOU"}
                    tone="a"
                    value={name1}
                    onChange={(e) => setName1(e.target.value)}
                    placeholder={tab === "LOCAL" ? "Player 1" : "Your name"}
                    aria-label={tab === "LOCAL" ? "Player 1" : "Your name"}
                    maxLength={40}
                    disabled={busy}
                  />
                  {tab === "LOCAL" && (
                    <NameField
                      badge="P2"
                      tone="b"
                      value={name2}
                      onChange={(e) => setName2(e.target.value)}
                      placeholder="Player 2"
                      aria-label="Player 2"
                      maxLength={40}
                      disabled={busy}
                    />
                  )}
                </div>

                {tab === "CREATE" && (
                  <div>
                    <FieldLabel>Players</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {PLAYER_OPTIONS.map((n) => {
                        const active = maxPlayers === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            disabled={busy}
                            onClick={() => setMaxPlayers(n)}
                            className={`min-w-12 flex-1 rounded-xl border-2 px-3 py-2.5 text-lg font-black tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              active
                                ? "border-accent bg-accent text-accent-ink shadow-md shadow-accent/30"
                                : "border-border bg-background text-foreground/80 hover:border-accent/60"
                            }`}
                          >
                            {n}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <FieldLabel>Pool</FieldLabel>
                  {poolsLoading ? (
                    <div className="flex justify-center py-2">
                      <LoaderCircle size={18} className="animate-spin text-muted" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pools.map((pool) => {
                        const tooSmall = pool.count < DECK_OPTIONS[0] * needPlayers;
                        const active = poolKey === pool.key;
                        return (
                          <button
                            key={pool.key}
                            type="button"
                            disabled={tooSmall || busy}
                            onClick={() => setPoolKey(pool.key)}
                            className={`rounded-xl border-2 px-3.5 py-2 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                              active
                                ? "border-accent bg-accent text-accent-ink shadow-md shadow-accent/30"
                                : "border-border bg-background text-foreground/80 hover:border-accent/60"
                            }`}
                          >
                            {pool.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <FieldLabel>Cards each</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {DECK_OPTIONS.map((n) => {
                      const disabled = !deckChoices.includes(n);
                      const active = deckSize === n && !disabled;
                      return (
                        <button
                          key={n}
                          type="button"
                          disabled={disabled || busy}
                          onClick={() => setDeckSize(n)}
                          className={`min-w-16 flex-1 rounded-xl border-2 px-4 py-2.5 text-lg font-black tabular-nums transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            active
                              ? "border-accent-2 bg-accent-2 text-accent-2-ink shadow-md shadow-accent-2/30"
                              : "border-border bg-background text-foreground/80 hover:border-accent-2/60"
                          }`}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div>
              <button
                type="submit"
                disabled={busy || poolsLoading}
                className={btn("primary")}
              >
                {busy ? (
                  <LoaderCircle size={20} className="animate-spin" />
                ) : (
                  <>
                    {submitLabel} <ArrowRight size={20} />
                  </>
                )}
              </button>
              {error && (
                <div className="mt-4">
                  <ErrorMessage message={error} />
                </div>
              )}
            </div>
          </div>
        </form>
      </div>
    </section>
  );

  /* ----------------------------- render: game ----------------------- */

  let gameView: ReactNode = null;

  if (view === "game" && game && session) {
    const isLocal = session.mode === "LOCAL";
    const isMulti = game.max_players > 2;
    const seatInfo = (seat: Seat): SideInfo =>
      game.players.find((p) => p.seat === seat) ?? { seat, name: "", cards_left: 0 };
    const nameOf = (seat: Seat) => seatInfo(seat).name;

    const challengerSeat = game.challenger_seat;
    const challengerName = nameOf(challengerSeat);
    // Local / 2-player only: the one player who is not challenging.
    const responderName = nameOf(otherSeat(challengerSeat));
    const lockedLabel = game.locked_stat ? STAT_META[game.locked_stat].label : "";
    const tieBreak = game.clash_number > 1;
    const spectating = !!game.you.eliminated;
    const waitingOn = game.waiting_on ?? [];
    // The Locked banner takes the tier colour of the challenger's card, so the
    // responders get a hint without any text. Challenger sees the club colour.
    const lockedTier: Tier | null = game.opponent_card_tier ?? localHint ?? null;
    const lockedTone = lockedTier
      ? `bg-gradient-to-br ${TIER_META[lockedTier].grad} ${TIER_META[lockedTier].ink} shadow-black/30`
      : "bg-accent text-accent-ink shadow-accent/40";

    const left = seatInfo(1);
    const right = seatInfo(2);
    const firstLockerName = game.first_locker?.name ?? challengerName;

    let stage: ReactNode;

    if (game.status === "WAITING") {
      const link = `${window.location.origin}${window.location.pathname}?room=${game.room_code}`;
      const slots = Array.from({ length: game.max_players }, (_, i) =>
        game.players.find((p) => p.seat === i + 1) ?? null,
      );

      stage = (
        <StageWrap>
          <div className="overflow-hidden rounded-[28px] border-2 border-border bg-surface text-center shadow-2xl shadow-accent/15">
            <div className="brand-bar h-2 w-full" />
            <div className="p-6">
              <p className="mb-3 text-[11px] font-black uppercase tracking-[0.3em] text-muted">
                Room code
              </p>
              <div
                className="flex select-all justify-center gap-1.5"
                aria-label={`Room code ${game.room_code}`}
              >
                {game.room_code.split("").map((ch, i) => (
                  <span
                    key={`${ch}-${i}`}
                    className={`flex h-16 w-11 items-center justify-center rounded-xl text-3xl font-black shadow-[0_4px_0_0_rgba(0,0,0,0.28)] ${
                      i % 2 === 0
                        ? "bg-accent text-accent-ink"
                        : "bg-accent-2 text-accent-2-ink"
                    }`}
                  >
                    {ch}
                  </span>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => void copyText(game.room_code, "code")}
                  className={btn("primary", true)}
                >
                  {copied === "code" ? <Check size={15} /> : <Copy size={15} />}
                  Code
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(link, "link")}
                  className={btn("alt", true)}
                >
                  {copied === "link" ? <Check size={15} /> : <Copy size={15} />}
                  Link
                </button>
              </div>

              <div className="mt-6 grid gap-2 text-left">
                {slots.map((p, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-sm font-black ${
                      p
                        ? "border-accent/40 bg-accent/10 text-foreground"
                        : "border-dashed border-border text-muted"
                    }`}
                  >
                    <span className="truncate">{p ? p.name : "Open seat"}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wider opacity-70">
                      {p ? (p.is_you ? "You" : "Joined") : `Seat ${i + 1}`}
                    </span>
                  </div>
                ))}
              </div>

              <Hint>
                Waiting for players ({game.players.length}/{game.max_players})
              </Hint>
            </div>
          </div>
          <button type="button" onClick={leaveGame} className={`${btn("ghost", true)} mt-4`}>
            Cancel
          </button>
        </StageWrap>
      );
    } else if (game.status === "FINISHED") {
      const winnerName = game.winner_seat ? nameOf(game.winner_seat) : "";

      const outcome = !game.winner_seat
        ? "draw"
        : isLocal || game.you_won
          ? "win"
          : "lose";

      // Fixed colours: green = win, red = loss, club colour = draw.
      const panelColor =
        outcome === "win"
          ? "bg-green-600 text-white shadow-green-600/50"
          : outcome === "lose"
            ? "bg-red-600 text-white shadow-red-600/50"
            : "bg-accent-2 text-accent-2-ink shadow-accent-2/50";

      const headline = !game.winner_seat
        ? "Draw"
        : isLocal
          ? `${winnerName} wins`
          : game.you_won
            ? "You win"
            : `${winnerName} wins`;

      const standings = [...game.players].sort(
        (a, b) => b.cards_left - a.cards_left,
      );

      stage = (
        <StageWrap>
          <div
            className={`card-pop relative overflow-hidden rounded-[28px] p-8 text-center shadow-2xl ${panelColor}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/25" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
            <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-black/10" />

            <div className="relative">
              <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-black/20 ring-4 ring-white/30">
                <Trophy size={46} />
              </span>
              <p className="mt-5 text-[11px] font-black uppercase tracking-[0.3em] opacity-75">
                Full time
              </p>
              <h2 className="mt-1 text-4xl font-black italic uppercase leading-none tracking-tight">
                {headline}
              </h2>
              {game.end_reason === "CONCEDED" && (
                <p className="mt-2 text-xs font-bold uppercase tracking-wider opacity-80">
                  Conceded
                </p>
              )}

              <div className="mt-6 grid gap-2 rounded-2xl bg-black/25 px-4 py-3">
                {standings.map((p) => (
                  <div
                    key={p.seat}
                    className="flex items-center justify-between gap-3 text-left"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 text-[12px] font-bold uppercase">
                      {p.seat === game.winner_seat && (
                        <Trophy size={12} className="shrink-0" />
                      )}
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="text-2xl font-black tabular-nums">
                      {p.cards_left}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <button type="button" onClick={leaveGame} className={`${btn("primary")} mt-6`}>
            <RotateCcw size={18} /> Play again
          </button>
          <Link href="/" className={`${btn("ghost")} mt-3`}>
            <ArrowLeft size={16} /> Home
          </Link>
        </StageWrap>
      );
    } else if (game.phase === "REVEALED" && game.last_round && game.table?.length) {
      const lr = game.last_round;
      const clashes = game.table;
      const current = clashes[clashes.length - 1];
      const earlier = clashes.slice(0, -1);
      const topPlay = current.plays[0];
      const leaders = current.plays.filter((p) => p.value === topPlay.value);
      const isTie = lr.winner === "tie";
      const winnerName = lr.winner_name ?? "";
      const challengerPlay = current.plays.find((p) => p.seat === challengerSeat);
      const otherPlay = current.plays.find((p) => p.seat !== challengerSeat);

      const bannerText = isTie
        ? "Tie"
        : !isLocal && lr.winner === "you"
          ? "You win"
          : `${winnerName} wins`;

      // Fixed colours: green = win, red = loss, neutral = tie. In local
      // (pass-the-device) mode there is no single "you", so the round
      // winner is always shown green.
      const bannerColor = isTie
        ? "bg-foreground text-background shadow-black/25"
        : isLocal || lr.winner === "you"
          ? "bg-green-600 text-white shadow-green-600/40"
          : "bg-red-600 text-white shadow-red-600/40";

      const renderClash = (clash: TableClash, big: boolean) => {
        const ordered = big
          ? [...clash.plays].sort(
              (a, b) =>
                Number(b.seat === challengerSeat) - Number(a.seat === challengerSeat),
            )
          : clash.plays;

        return (
          <div
            className={
              big
                ? "grid gap-5 sm:grid-cols-2"
                : "grid grid-cols-2 gap-3 sm:grid-cols-3"
            }
          >
            {ordered.map((play) => {
              const result = resultOf(clash.plays, play);
              return big ? (
                <PlayerCard
                  key={`${lr.number}-${clash.clash}-${play.seat}`}
                  player={play.card}
                  lockedStat={lr.stat}
                  result={result}
                  owner={play.name}
                  flip={play.seat !== challengerSeat}
                />
              ) : (
                <MiniCard
                  key={`${lr.number}-${clash.clash}-${play.seat}`}
                  player={play.card}
                  owner={play.name}
                  stat={lr.stat}
                  value={play.value}
                  result={result}
                />
              );
            })}
          </div>
        );
      };

      stage = (
        <div className="mx-auto w-full max-w-3xl pb-24">
          <div
            className={`card-pop relative mb-5 overflow-hidden rounded-3xl p-4 text-center shadow-xl ${bannerColor}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/20" />
            <div className="relative">
              <p className="mx-auto w-fit rounded-full bg-black/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]">
                {STAT_META[lr.stat].label}
                {tieBreak ? " · Tie-break" : ""}
              </p>
              {!isMulti && challengerPlay && otherPlay ? (
                <p className="mt-2 flex items-center justify-center gap-5 text-5xl font-black tabular-nums">
                  <span>{challengerPlay.value}</span>
                  <span className="text-sm font-black uppercase opacity-60">vs</span>
                  <span>{otherPlay.value}</span>
                </p>
              ) : (
                <p className="mt-2 text-5xl font-black tabular-nums">{topPlay.value}</p>
              )}
              <p className="mt-1 text-lg font-black uppercase italic tracking-wide">
                {bannerText}
              </p>
              {isTie && (
                <p className="mt-1 text-xs font-bold uppercase tracking-wider opacity-80">
                  {leaders.map((p) => p.name).join(" & ")} play on for the same stat
                </p>
              )}
            </div>
          </div>

          {earlier.map((clash) => (
            <div key={clash.clash} className="mb-6 opacity-80">
              <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.25em] text-muted">
                {clash.clash === 1 ? "First reveal (tied)" : `Tie-break ${clash.clash - 1} (tied)`}
              </p>
              {renderClash(clash, false)}
            </div>
          ))}

          {earlier.length > 0 && (
            <p className="mb-2 text-center text-[11px] font-black uppercase tracking-[0.25em] text-muted">
              {tieBreak ? `Tie-break ${current.clash - 1}` : "Result"}
            </p>
          )}
          {renderClash(current, current.plays.length <= 2)}

          <button
            type="button"
            onClick={continueGame}
            disabled={busy}
            className={`${btn("primary")} mx-auto mt-7 max-w-sm`}
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            {isTie ? "Tie-break" : "Next round"}
          </button>
        </div>
      );
    } else if (game.phase === "CHOOSING") {
      if (showDeal) {
        stage = isLocal ? (
          <LocalDealFlow
            session={session}
            names={{ 1: nameOf(1), 2: nameOf(2) }}
            firstLocker={firstLockerName}
            onStart={() => setDealSeen(true)}
          />
        ) : (
          <DealPreview
            isLocal={isLocal}
            players={game.players}
            you={game.you}
            hand={game.hand ?? null}
            preview={game.hand_preview ?? null}
            isChallenger={game.you_are_challenger}
            firstLocker={firstLockerName}
            onStart={() => setDealSeen(true)}
          />
        );
      } else if (isLocal && holderSeat !== challengerSeat) {
        // Pass-the-device screen: the card stays hidden until the right person taps.
        stage = (
          <StageWrap>
            <CardBack title="PASS THE DEVICE" subtitle={challengerName} />
            <button
              type="button"
              onClick={() => setHolderSeat(challengerSeat)}
              className={`${btn("primary")} mt-6`}
            >
              <Eye size={18} /> I&apos;m {challengerName}
            </button>
          </StageWrap>
        );
      } else if (game.you_are_challenger && albumKind === "swap" && album) {
        stage = (
          <Album
            data={album}
            tier={albumTier}
            picked={pickedId}
            busy={busy}
            flipping={false}
            onSelectTier={(t) => {
              setAlbumTier(t);
              setPickedId(null);
            }}
            onPick={setPickedId}
            onBack={handleAlbumBack}
            onPlay={handleChooseCard}
            actionLabel="Use this card"
            skipLabel="Keep my card"
          />
        );
      } else if (game.you_are_challenger && game.my_card) {
        stage = (
          <StageWrap>
            <PlayerCard
              key={`mine-${game.round_number}-${game.my_card.player_id}`}
              player={game.my_card}
              selectedStat={selectedStat}
              onSelectStat={setSelectedStat}
              flip
            />
            <button
              type="button"
              onClick={lockStat}
              disabled={!selectedStat || busy}
              className={`${btn("primary", false, true)} mt-4 sm:mt-6`}
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Lock size={18} />}
              {selectedStat ? `Lock ${STAT_META[selectedStat].label}` : "Pick a stat"}
            </button>
            <button
              type="button"
              onClick={() => void openAlbum("swap")}
              disabled={busy || albumLoading || !!game.card_swapped}
              className={`${btn("alt", false, true)} mt-2 sm:mt-3`}
            >
              {albumLoading ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Layers size={18} />
              )}
              {game.card_swapped ? "Card changed" : "Choose a card"}
            </button>
            <p className="mt-3 hidden text-center text-xs font-semibold text-muted sm:block">
              {game.card_swapped
                ? "You can change your card once per round."
                : "Not happy with this card? Swap it for a face-down one from a tier."}
            </p>
          </StageWrap>
        );
      } else {
        stage = (
          <StageWrap>
            <CardBack title={challengerName.toUpperCase()} subtitle="Choosing..." />
          </StageWrap>
        );
      }
    } else if (game.phase === "LOCKED") {
      const canReveal = isLocal || game.available_action === "reveal";

      if (canReveal && albumKind === "play" && album) {
        stage = (
          <Album
            data={album}
            tier={albumTier}
            picked={pickedId}
            busy={busy || isCardFlipping}
            flipping={isCardFlipping}
            onSelectTier={(t) => {
              setAlbumTier(t);
              setPickedId(null);
            }}
            onPick={setPickedId}
            onBack={handleAlbumBack}
            onPlay={() => {
              if (pickedId !== null) void handleRevealCard(pickedId);
            }}
            actionLabel="Play and reveal"
            skipLabel="Play top card instead"
          />
        );
      } else if (canReveal) {
        stage = (
          <StageWrap>
            <button
              type="button"
              onClick={() => void handleRevealCard()}
              disabled={busy || isCardFlipping}
              aria-label={isLocal ? `${responderName}: reveal top card` : "Reveal top card"}
              className="block w-full rounded-3xl text-left shadow-2xl shadow-accent/50 outline-none ring-4 ring-accent/80 transition-shadow duration-300 hover:shadow-accent/70 focus-visible:ring-accent-2 disabled:cursor-wait"
              style={{
                transform: isCardFlipping ? "perspective(1000px) rotateY(90deg) scale(0.97)" : "perspective(1000px) rotateY(0deg) scale(1)",
                transformStyle: "preserve-3d",
                transition: "transform 420ms cubic-bezier(0.2, 0.75, 0.25, 1), box-shadow 300ms ease",
              }}
            >
              <div className="pointer-events-none overflow-hidden rounded-3xl">
                <CardBack
                  title={isLocal ? responderName.toUpperCase() : "TOP CARD"}
                  subtitle={busy || isCardFlipping ? "Revealing..." : "Tap to reveal"}
                />
              </div>
            </button>

            <button
              type="button"
              onClick={() => void openAlbum("play")}
              disabled={busy || isCardFlipping || albumLoading}
              className={`${btn("alt", false, true)} mt-4 sm:mt-6`}
            >
              {albumLoading ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Layers size={18} />
              )}
              Choose a card
            </button>
          </StageWrap>
        );
      } else {
        // Challenger, a responder who already revealed, a seat that is not in
        // this tie-break, or a knocked-out player: wait until everyone has shown.
        const waitText =
          waitingOn.length > 0
            ? `Waiting for ${waitingOn.join(", ")}`
            : "Flipping the cards...";

        stage = (
          <StageWrap>
            {game.my_card ? (
              <PlayerCard player={game.my_card} lockedStat={game.locked_stat} />
            ) : (
              <CardBack
                title="CARDS IN PLAY"
                subtitle={
                  tieBreak && !spectating
                    ? "You are not in this tie-break"
                    : "Watching"
                }
              />
            )}
            <Hint>{waitText}</Hint>
          </StageWrap>
        );
      }
    } else {
      stage = <Spinner />;
    }

    const showScore = game.status === "ACTIVE" && !showDeal;
    const showConcede =
      game.status === "ACTIVE" &&
      game.phase !== "REVEALED" &&
      !showDeal &&
      !spectating;

    gameView = (
      <section className="relative mx-auto mt-4 max-w-4xl pb-[calc(2rem+env(safe-area-inset-bottom))] pt-1 sm:mt-10 sm:pb-8 sm:pt-2">
        <Backdrop />

        <div className="relative">
          {showScore && game.phase === "LOCKED" && (
            <div
              className={`relative mx-auto mb-5 flex max-w-sm items-center justify-center gap-3 overflow-hidden rounded-3xl px-4 py-3.5 shadow-xl ${lockedTone}`}
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/20" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-black/20">
                <Lock size={18} />
              </span>
              <div className="relative text-left">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-75">
                  {tieBreak ? "Tie-break · Locked" : "Locked"}
                </p>
                <p className="text-2xl font-black uppercase leading-6">{lockedLabel}</p>
              </div>
            </div>
          )}

          {showScore && isMulti && (
            <PlayersBar
              players={game.players}
              round={game.round_number}
              pot={game.pot_count}
              clash={game.clash_number}
              showRevealed={game.phase === "LOCKED"}
            />
          )}

          {showScore && !isMulti && game.phase !== "LOCKED" && (
            <ScoreBar
              left={left}
              right={right}
              round={game.round_number}
              pot={game.pot_count}
              challengerSeat={challengerSeat}
              tieBreak={tieBreak}
            />
          )}

          {stage}

          {spectating && game.status === "ACTIVE" && (
            <Hint>You are out of cards. Watching the rest</Hint>
          )}

          {error && (
            <div className="mx-auto mt-4 max-w-sm">
              <ErrorMessage message={error} />
            </div>
          )}

          {showConcede && (
            <div className="mx-auto mt-3 max-w-[11rem] sm:mt-5">
              <button
                type="button"
                onClick={concede}
                disabled={busy}
                className={btn("ghost", true)}
              >
                <Flag size={14} /> {isMulti ? "Leave" : "Concede"}
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  // The page is fixed (no scrolling or rubber-banding), except on screens
  // that need room: the deal preview, the tier album and the reveal screen.
  const allowScroll =
    view === "game" &&
    game?.status === "ACTIVE" &&
    (game.phase === "REVEALED" || albumKind !== null || showDeal);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = "hidden";
    html.style.height = "100%";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overscrollBehavior = "none";

    // The body itself becomes the scroll container on those screens.
    body.style.overflowY = allowScroll ? "auto" : "hidden";
    body.style.overflowX = "hidden";
    (body.style as unknown as Record<string, string>).webkitOverflowScrolling =
      "touch";

    if (!allowScroll) body.scrollTop = 0;

    return () => {
      html.style.overflow = "";
      html.style.height = "";
      html.style.overscrollBehavior = "";
      body.style.position = "";
      body.style.inset = "";
      body.style.width = "";
      body.style.height = "";
      body.style.overflow = "";
      body.style.overflowX = "";
      body.style.overflowY = "";
      body.style.overscrollBehavior = "";
      (body.style as unknown as Record<string, string>).webkitOverflowScrolling =
        "";
    };
  }, [allowScroll]);

  /* ----------------------------- final render ----------------------- */

  let content: ReactNode;

  if (view === "restoring") content = <Spinner />;
  else if (view === "lobby") content = lobby;
  else content = gameView ?? <Spinner />;

  return <DraftPageShell hideBack>{content}</DraftPageShell>;
}