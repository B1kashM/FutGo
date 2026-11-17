"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Eye,
  Flag,
  Gamepad2,
  Globe2,
  Layers,
  LoaderCircle,
  Lock,
  LogIn,
  RotateCcw,
  Swords,
  Trophy,
} from "lucide-react";

import { BackButton, DraftPageShell, ErrorMessage } from "../_draft/DraftUI";
import {
  ApiError,
  DECK_OPTIONS,
  STAT_META,
  cardsApi,
  clearSession,
  errorText,
  fetchFull,
  isUnchanged,
  loadSession,
  otherSeat,
  saveSession,
  toTokens,
  viewSeatFor,
} from "../_cards/cardsShared";
import type {
  CardsSession,
  GameState,
  Pool,
  Seat,
  SideInfo,
  StatKey,
} from "../_cards/cardsShared";
import { CardBack, PlayerCard } from "../_cards/CardsUI";

type View = "restoring" | "lobby" | "game";
type LobbyTab = "LOCAL" | "CREATE" | "JOIN";

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 8000;

/* ------------------------------------------------------------------ */
/* Design tokens (all colours come from the selected club theme)       */
/* ------------------------------------------------------------------ */

const INPUT_CLASS =
  "w-full rounded-2xl border-2 border-border bg-background px-4 py-3.5 text-sm font-bold text-foreground outline-none transition placeholder:font-semibold placeholder:text-foreground/35 hover:border-accent/50 focus:border-accent focus:ring-4 focus:ring-accent/20 disabled:opacity-60";

const BTN_BASE =
  "flex w-full items-center justify-center gap-2 font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-50";

/** Chunky "game" buttons with a pressed-down effect. */
function btn(variant: "primary" | "alt" | "ghost", small = false) {
  const size = small
    ? "rounded-xl px-4 py-2.5 text-xs"
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

/** Three fanned mini cards used as the lobby emblem. */
function CardFan() {
  return (
    <div className="relative h-14 w-28 shrink-0" aria-hidden="true">
      <div className="absolute left-0 top-4 h-20 w-14 -rotate-[14deg] rounded-xl border-2 border-white/80 bg-accent-2 shadow-lg" />
      <div className="absolute right-0 top-4 h-20 w-14 rotate-[14deg] rounded-xl border-2 border-white/80 bg-accent shadow-lg" />
      <div className="absolute left-1/2 top-0 flex h-20 w-14 -translate-x-1/2 items-center justify-center rounded-xl border-2 border-white/90 bg-gradient-to-br from-accent to-accent-2 text-accent-ink shadow-xl">
        <Layers size={22} />
      </div>
    </div>
  );
}

// A quiet one-line status ("Waiting...")
function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="mx-auto mt-5 flex w-fit items-center justify-center gap-2 rounded-full border-2 border-accent/30 bg-accent/10 px-4 py-2 text-sm font-black text-accent-text">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-70" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
      </span>
      {children}
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

function ScoreBar({
  left,
  right,
  round,
  pot,
  challengerSeat,
}: {
  left: SideInfo;
  right: SideInfo;
  round: number;
  pot: number;
  challengerSeat: Seat;
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
    <div className="relative mb-5 overflow-hidden rounded-3xl border-2 border-border bg-surface shadow-xl shadow-black/10">
      <div className="grid grid-cols-[1fr_auto_1fr]">
        {side(left, "left")}
        <div className="flex min-w-[76px] flex-col items-center justify-center gap-1 bg-surface px-2 py-3">
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted">
            Round
          </span>
          <span className="text-3xl font-black leading-none">{round}</span>
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

  const [session, setSession] = useState<CardsSession | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [selectedStat, setSelectedStat] = useState<StatKey | null>(null);
  // Local mode: which seat currently holds the shared device.
  const [holderSeat, setHolderSeat] = useState<Seat | null>(null);

  const [busy, setBusy] = useState(false);
  const [isCardFlipping, setIsCardFlipping] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const sessionRef = useRef<CardsSession | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const busyRef = useRef(false);

  /* ----------------------------- state helpers ---------------------- */

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
      setError("");
      setView("game");
    },
    [applyGame],
  );

  const leaveGame = useCallback(() => {
    clearSession();
    sessionRef.current = null;
    gameRef.current = null;
    setSession(null);
    setGame(null);
    setSelectedStat(null);
    setHolderSeat(null);
    setError("");
    setView("lobby");
  }, []);

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

  const selectedPool = pools.find((pool) => pool.key === poolKey);
  const poolCount = selectedPool?.count ?? 0;

  const deckChoices = useMemo(
    () => DECK_OPTIONS.filter((n) => n <= Math.floor(poolCount / 2)),
    [poolCount],
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
            seat: 2,
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
      setError("This pool is too small. Pick another.");
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
      // The game may have moved on (e.g. the opponent acted first).
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

  const handleRevealCard = async () => {
    if (busyRef.current || isCardFlipping) return;

    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current) return;

    const seat: Seat =
      sess.mode === "ONLINE" ? sess.seat : otherSeat(current.challenger_seat);
    const token = sess.tokens[seat];
    if (!token) return;

    // Finish the server reveal first. Do not flip the back away while the
    // request is still loading, otherwise the card face appears late.
    busyRef.current = true;
    setBusy(true);
    setError("");

    try {
      const next = await cardsApi.reveal(sess.roomCode, token);
      if (sess.mode === "LOCAL") setHolderSeat(seat);

      // Begin the flip only when the revealed card data is ready, then swap
      // faces at the edge of the turn so the player card appears immediately.
      setIsCardFlipping(true);
      window.setTimeout(() => {
        applyGame(next);
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

    const who = current.you.seat === seat ? current.you.name : current.opponent.name;

    if (!window.confirm(`${who}, concede this game?`)) return;

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
    { key: "CREATE", label: "Create", sub: "Host room", icon: <Globe2 size={22} /> },
    { key: "JOIN", label: "Join", sub: "Use code", icon: <LogIn size={22} /> },
  ];

  const submitLabel =
    tab === "JOIN" ? "Join game" : tab === "CREATE" ? "Create room" : "Kick off";

  const lobby = (
    <section className="relative mx-auto w-full max-w-md pb-8 pt-1 sm:pt-3">
      <Backdrop />

      <div className="relative">
        <div className="mb-5 mt-2 flex justify-end">
          <BackButton />
        </div>

        <form
          onSubmit={submitLobby}
          className="overflow-hidden rounded-[28px] border-2 border-border bg-surface shadow-2xl shadow-accent/15"
        >
          <div className="brand-bar h-2 w-full" />

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

                <div>
                  <FieldLabel>Pool</FieldLabel>
                  {poolsLoading ? (
                    <div className="flex justify-center py-2">
                      <LoaderCircle size={18} className="animate-spin text-muted" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {pools.map((pool) => {
                        const tooSmall = pool.count < DECK_OPTIONS[0] * 2;
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
                            {/* <span className="ml-1.5 opacity-60">{pool.count}</span> */}
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
    const nameOf = (seat: Seat) =>
      game.you.seat === seat ? game.you.name : game.opponent.name;

    const challengerSeat = game.challenger_seat;
    const responderSeat = otherSeat(challengerSeat);
    const challengerName = nameOf(challengerSeat);
    const responderName = nameOf(responderSeat);
    const lockedLabel = game.locked_stat ? STAT_META[game.locked_stat].label : "";

    const left = game.you.seat === 1 ? game.you : game.opponent;
    const right = game.you.seat === 1 ? game.opponent : game.you;

    let stage: ReactNode;

    if (game.status === "WAITING") {
      const link = `${window.location.origin}${window.location.pathname}?room=${game.room_code}`;

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
              <Hint>Waiting for opponent</Hint>
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

      // Club colours only: win = main colour, draw = second colour,
      // loss = neutral.
      const panelColor =
        outcome === "win"
          ? "bg-accent text-accent-ink shadow-accent/50"
          : outcome === "lose"
            ? "bg-foreground text-background shadow-black/30"
            : "bg-accent-2 text-accent-2-ink shadow-accent-2/50";

      const headline = !game.winner_seat
        ? "Draw"
        : isLocal
          ? `${winnerName} wins`
          : game.you_won
            ? "You win"
            : `${winnerName} wins`;

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

              <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl bg-black/25 px-4 py-3">
                <div className="min-w-0 text-left">
                  <p className="truncate text-[11px] font-bold uppercase opacity-80">
                    {left.name}
                  </p>
                  <p className="text-3xl font-black tabular-nums">{left.cards_left}</p>
                </div>
                <span className="text-lg font-black opacity-60">:</span>
                <div className="min-w-0 text-right">
                  <p className="truncate text-[11px] font-bold uppercase opacity-80">
                    {right.name}
                  </p>
                  <p className="text-3xl font-black tabular-nums">{right.cards_left}</p>
                </div>
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
    } else if (game.phase === "REVEALED" && game.last_round) {
      const lr = game.last_round;
      const iAmChallenger = game.you_are_challenger;
      const challengerCard = iAmChallenger ? game.my_card : game.opponent_card;
      const responderCard = iAmChallenger ? game.opponent_card : game.my_card;
      const challengerValue = iAmChallenger ? lr.your_value : lr.opponent_value;
      const responderValue = iAmChallenger ? lr.opponent_value : lr.your_value;

      const cardResult = (mine: boolean): "win" | "lose" | "tie" =>
        lr.winner === "tie"
          ? "tie"
          : (lr.winner === "you") === mine
            ? "win"
            : "lose";

      const winnerName =
        lr.winner === "you" ? game.you.name : lr.winner === "opponent" ? game.opponent.name : "";

      const bannerText =
        lr.winner === "tie"
          ? "Tie"
          : !isLocal && lr.winner === "you"
            ? "You win"
            : `${winnerName} wins`;

      // Club colours only. "You" is the first colour and the opponent the
      // second; a tie is neutral.
      const bannerColor =
        lr.winner === "tie"
          ? "bg-foreground text-background shadow-black/25"
          : lr.winner === "you"
            ? "bg-accent text-accent-ink shadow-accent/40"
            : "bg-accent-2 text-accent-2-ink shadow-accent-2/40";

      stage = (
        <div className="mx-auto w-full max-w-3xl">
          <div
            className={`card-pop relative mb-5 overflow-hidden rounded-3xl p-4 text-center shadow-xl ${bannerColor}`}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/20" />
            <div className="relative">
              <p className="mx-auto w-fit rounded-full bg-black/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em]">
                {STAT_META[lr.stat].label}
              </p>
              <p className="mt-2 flex items-center justify-center gap-5 text-5xl font-black tabular-nums">
                <span>{challengerValue}</span>
                <span className="text-sm font-black uppercase opacity-60">vs</span>
                <span>{responderValue}</span>
              </p>
              <p className="mt-1 text-lg font-black uppercase italic tracking-wide">
                {bannerText}
              </p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            {challengerCard && (
              <PlayerCard
                key={`c-${lr.number}`}
                player={challengerCard}
                lockedStat={lr.stat}
                result={cardResult(iAmChallenger)}
                owner={challengerName}
              />
            )}
            {responderCard && (
              <PlayerCard
                key={`r-${lr.number}`}
                player={responderCard}
                lockedStat={lr.stat}
                result={cardResult(!iAmChallenger)}
                owner={responderName}
                flip
              />
            )}
          </div>

          <button
            type="button"
            onClick={continueGame}
            disabled={busy}
            className={`${btn("primary")} mx-auto mt-7 max-w-sm`}
          >
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowRight size={18} />}
            Next round
          </button>
        </div>
      );
    } else if (game.phase === "CHOOSING") {
      if (isLocal && holderSeat !== challengerSeat) {
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
      } else if (game.you_are_challenger && game.my_card) {
        stage = (
          <StageWrap>
            <PlayerCard
              key={`mine-${game.round_number}`}
              player={game.my_card}
              selectedStat={selectedStat}
              onSelectStat={setSelectedStat}
              flip
            />
            <button
              type="button"
              onClick={lockStat}
              disabled={!selectedStat || busy}
              className={`${btn("primary")} mt-6`}
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Lock size={18} />}
              {selectedStat ? `Lock ${STAT_META[selectedStat].label}` : "Pick a stat"}
            </button>
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
      const canReveal = isLocal || !game.you_are_challenger;

      if (canReveal) {
        stage = (
          <StageWrap>
            <button
              type="button"
              onClick={handleRevealCard}
              disabled={busy || isCardFlipping}
              aria-label={isLocal ? `${responderName}: reveal card` : "Reveal card"}
              className="block w-full rounded-3xl text-left shadow-2xl shadow-accent/50 outline-none ring-4 ring-accent/80 transition-shadow duration-300 hover:shadow-accent/70 focus-visible:ring-accent-2 disabled:cursor-wait"
              style={{
                transform: isCardFlipping ? "perspective(1000px) rotateY(90deg) scale(0.97)" : "perspective(1000px) rotateY(0deg) scale(1)",
                transformStyle: "preserve-3d",
                transition: "transform 420ms cubic-bezier(0.2, 0.75, 0.25, 1), box-shadow 300ms ease",
              }}
            >
              <div className="pointer-events-none overflow-hidden rounded-3xl">
                <CardBack
                  title={isLocal ? responderName.toUpperCase() : "REVEAL"}
                  subtitle={busy || isCardFlipping ? "Revealing..." : "Tap to reveal"}
                />
              </div>
            </button>
          </StageWrap>
        );
      } else {
        stage = (
          <StageWrap>
            {game.my_card && <PlayerCard player={game.my_card} lockedStat={game.locked_stat} />}
            <Hint>Waiting for {responderName}</Hint>
          </StageWrap>
        );
      }
    } else {
      stage = <Spinner />;
    }

    const showScore = game.status === "ACTIVE";
    const showConcede = game.status === "ACTIVE" && game.phase !== "REVEALED";

    gameView = (
      <section className="relative mx-auto mt-10 max-w-4xl pb-4 pt-1 sm:mt-10 sm:pb-8 sm:pt-2">
        <Backdrop />

        <div className="relative">
          {showScore &&
            (game.phase === "LOCKED" ? (
              <div className="relative mx-auto mb-5 flex max-w-sm items-center justify-center gap-3 overflow-hidden rounded-3xl bg-accent px-4 py-3.5 text-accent-ink shadow-xl shadow-accent/40">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/25 via-transparent to-black/20" />
                <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-black/20">
                  <Lock size={18} />
                </span>
                <div className="relative text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] opacity-75">
                    Locked
                  </p>
                  <p className="text-2xl font-black uppercase leading-6">{lockedLabel}</p>
                </div>
              </div>
            ) : (
              <ScoreBar
                left={left}
                right={right}
                round={game.round_number}
                pot={game.pot_count}
                challengerSeat={challengerSeat}
              />
            ))}

          {stage}

          {error && (
            <div className="mx-auto mt-4 max-w-sm">
              <ErrorMessage message={error} />
            </div>
          )}

          {showConcede && (
            <div className="mx-auto mt-8 max-w-[11rem]">
              <button
                type="button"
                onClick={concede}
                disabled={busy}
                className={btn("ghost", true)}
              >
                <Flag size={14} /> Concede
              </button>
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ----------------------------- final render ----------------------- */

  let content: ReactNode;

  if (view === "restoring") content = <Spinner />;
  else if (view === "lobby") content = lobby;
  else content = gameView ?? <Spinner />;

  return <DraftPageShell hideBack>{content}</DraftPageShell>;
}