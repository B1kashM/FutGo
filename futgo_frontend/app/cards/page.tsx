"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
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
  Trophy,
} from "lucide-react";

import { DraftPageShell, ErrorMessage } from "../_draft/DraftUI";
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

const INPUT_CLASS =
  "w-full rounded-xl border-2 border-accent/30 bg-surface-2 px-4 py-3 text-sm font-semibold text-foreground outline-none transition placeholder:text-foreground/35 focus:border-accent focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function Spinner({ text }: { text: string }) {
  return (
    <section className="mx-auto max-w-md py-24 text-center">
      <div className="flex flex-col items-center gap-4 text-muted">
        <LoaderCircle size={30} className="animate-spin text-accent-text" />
        <p className="text-sm">{text}</p>
      </div>
    </section>
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
  const side = (info: SideInfo, align: "left" | "right") => {
    const pill =
      align === "left"
        ? "bg-accent text-accent-ink"
        : "bg-accent-2 text-accent-2-ink";

    return (
      <div
        className={`flex min-w-0 flex-1 items-center gap-3 ${
          align === "right" ? "flex-row-reverse text-right" : ""
        }`}
      >
        <span
          className={`flex h-12 min-w-12 shrink-0 items-center justify-center rounded-xl px-2 text-2xl font-black shadow-md ${pill}`}
        >
          {info.cards_left}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{info.name}</p>
          <p className="text-[11px] font-semibold text-muted">
            cards
            {info.seat === challengerSeat && (
              <span className="ml-1.5 font-black text-accent-text">· challenging</span>
            )}
          </p>
        </div>
      </div>
    );
  };

  return (
    <div className="cards-panel mb-5 overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-3">
        {side(left, "left")}
        <div className="shrink-0 text-center">
          <p className="rounded-full bg-foreground px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-background">
            Round {round}
          </p>
          {pot > 0 && (
            <p className="mt-1.5 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-slate-900">
              Pot: {pot}
            </p>
          )}
        </div>
        {side(right, "right")}
      </div>
    </div>
  );
}

function StageWrap({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-sm">{children}</div>;
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
        if (!cancelled) setError("Unable to load card pools. Is the server running?");
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
        setError("Enter the room code you were given.");
        return;
      }

      if (!name) {
        setError("Enter your display name.");
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
        setError(errorText(err, "Unable to join that room."));
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
        setError("Please enter two different names.");
        return;
      }
    }

    if (deckChoices.length === 0) {
      setError("This pool is too small. Pick a bigger one.");
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
      setError(errorText(err, "Unable to create the game."));
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
      setError(errorText(err, "Something went wrong. Please try again."));
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

  const handleRevealCard = () => {
    if (busy || isCardFlipping) return;
    setIsCardFlipping(true);
    // Start the reveal as the card turns edge-on, so the new card face
    // replaces the card back naturally rather than appearing abruptly.
    window.setTimeout(revealCard, 220);
    window.setTimeout(() => setIsCardFlipping(false), 700);
  };

  const revealCard = () => {
    const sess = sessionRef.current;
    const current = gameRef.current;
    if (!sess || !current) return;

    const seat: Seat =
      sess.mode === "ONLINE" ? sess.seat : otherSeat(current.challenger_seat);
    const token = sess.tokens[seat];
    if (!token) return;

    void run(async () => {
      const next = await cardsApi.reveal(sess.roomCode, token);
      if (sess.mode === "LOCAL") setHolderSeat(seat); // the device is now with the responder
      return next;
    });
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

    if (!window.confirm(`${who}: concede this game? Your opponent wins.`)) return;

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

  const tabs: { key: LobbyTab; label: string; icon: ReactNode }[] = [
    { key: "LOCAL", label: "Same device", icon: <Gamepad2 size={16} /> },
    { key: "CREATE", label: "Online: create", icon: <Globe2 size={16} /> },
    { key: "JOIN", label: "Online: join", icon: <LogIn size={16} /> },
  ];

  const lobby = (
    <section className="mx-auto max-w-3xl py-6 sm:py-12">
      <div className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-accent-ink shadow-md">
          <Layers size={14} /> Card battle
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">PLAY CARDS</h1>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setTab(item.key);
              setError("");
            }}
            className={`cards-chip flex items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-black sm:text-sm ${
              tab === item.key ? "cards-chip-active" : ""
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>

      <form onSubmit={submitLobby} className="cards-panel overflow-hidden rounded-[24px]">
        <div className="brand-bar h-1.5 w-full" />

        <div className="grid gap-5 p-5 sm:p-7">
          {tab === "JOIN" ? (
            <>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                  Room code
                </span>
                <input
                  value={joinCode}
                  onChange={(e) =>
                    setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))
                  }
                  placeholder="e.g. K7Q2XA"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  className={`${INPUT_CLASS} text-center text-2xl font-black uppercase tracking-[0.3em]`}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                  Your display name
                </span>
                <input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  disabled={busy}
                  className={INPUT_CLASS}
                />
              </label>
            </>
          ) : (
            <>
              <div className={`grid gap-4 ${tab === "LOCAL" ? "sm:grid-cols-2" : ""}`}>
                <label className="block">
                  <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                    {tab === "LOCAL" ? "Player 1" : "Your name"}
                  </span>
                  <input
                    value={name1}
                    onChange={(e) => setName1(e.target.value)}
                    placeholder="Enter name"
                    maxLength={40}
                    disabled={busy}
                    className={INPUT_CLASS}
                  />
                </label>
                {tab === "LOCAL" && (
                  <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                      Player 2
                    </span>
                    <input
                      value={name2}
                      onChange={(e) => setName2(e.target.value)}
                      placeholder="Enter name"
                      maxLength={40}
                      disabled={busy}
                      className={INPUT_CLASS}
                    />
                  </label>
                )}
              </div>

              <div>
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                  Card pool
                </span>
                {poolsLoading ? (
                  <p className="text-sm text-muted">Loading pools...</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {pools.map((pool) => {
                      const tooSmall = pool.count < DECK_OPTIONS[0] * 2;
                      return (
                        <button
                          key={pool.key}
                          type="button"
                          disabled={tooSmall || busy}
                          onClick={() => setPoolKey(pool.key)}
                          className={`cards-chip rounded-full px-3 py-2 text-xs font-black disabled:cursor-not-allowed disabled:opacity-40 ${
                            poolKey === pool.key ? "cards-chip-active" : ""
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
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-foreground/70">
                  Cards each
                </span>
                <div className="flex flex-wrap gap-2">
                  {DECK_OPTIONS.map((n) => {
                    const disabled = !deckChoices.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={disabled || busy}
                        onClick={() => setDeckSize(n)}
                        className={`cards-chip min-w-14 rounded-full px-4 py-2 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${
                          deckSize === n && !disabled ? "cards-chip-active" : ""
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
        </div>

        <div className="p-5 sm:px-7">
          <button type="submit" disabled={busy || poolsLoading} className="cards-btn">
            {busy ? (
              <>
                <LoaderCircle size={19} className="animate-spin" /> Working...
              </>
            ) : tab === "JOIN" ? (
              <>
                Join room <ArrowRight size={19} />
              </>
            ) : tab === "CREATE" ? (
              <>
                Create room <ArrowRight size={19} />
              </>
            ) : (
              <>
                Deal the cards <ArrowRight size={19} />
              </>
            )}
          </button>
          {error && (
            <div className="mt-4">
              <ErrorMessage message={error} />
            </div>
          )}
        </div>
      </form>
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
          <div className="cards-panel overflow-hidden rounded-[24px] text-center">
            <div className="brand-bar h-1.5 w-full" />
            <div className="p-6">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-foreground/70">
                Room code
              </p>
              <p className="mt-3 select-all rounded-2xl bg-accent px-4 py-3 text-5xl font-black tracking-[0.3em] text-accent-ink shadow-lg">
                {game.room_code}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void copyText(game.room_code, "code")}
                  className="cards-btn cards-btn-sm"
                >
                  {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "code" ? "Copied" : "Copy code"}
                </button>
                <button
                  type="button"
                  onClick={() => void copyText(link, "link")}
                  className="cards-btn cards-btn-alt cards-btn-sm"
                >
                  {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
                  {copied === "link" ? "Copied" : "Copy invite link"}
                </button>
              </div>
              <p className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-foreground/75">
                <LoaderCircle size={16} className="animate-spin" />
                Waiting for your opponent to join...
              </p>
            </div>
          </div>
          <button type="button" onClick={leaveGame} className="cards-btn cards-btn-ghost mt-5">
            Cancel room
          </button>
        </StageWrap>
      );
    } else if (game.status === "FINISHED") {
      const winnerName = game.winner_seat ? nameOf(game.winner_seat) : "";
      const loserName = game.winner_seat ? nameOf(otherSeat(game.winner_seat)) : "";

      const outcome = !game.winner_seat
        ? "draw"
        : isLocal || game.you_won
          ? "win"
          : "lose";

      const panelColor =
        outcome === "win"
          ? "border-emerald-300 bg-emerald-600 text-white"
          : outcome === "lose"
            ? "border-red-300 bg-red-600 text-white"
            : "border-amber-200 bg-amber-400 text-slate-900";

      const headline = !game.winner_seat
        ? "It's a draw!"
        : isLocal
          ? `${winnerName} wins!`
          : game.you_won
            ? "You win!"
            : `${winnerName} wins`;

      const reason =
        game.end_reason === "CONCEDED"
          ? `${loserName} conceded the game.`
          : "One side ran out of cards.";

      stage = (
        <StageWrap>
          <div
            className={`card-pop rounded-[24px] border-2 p-8 text-center shadow-xl ${panelColor}`}
          >
            <Trophy size={48} className="mx-auto" />
            <h2 className="mt-4 text-3xl font-black">{headline}</h2>
            <p className="mt-2 text-sm font-semibold opacity-85">{reason}</p>
            <p className="mt-5 rounded-xl bg-black/25 px-4 py-2 text-sm font-black">
              {left.name} {left.cards_left} <span className="opacity-70">:</span>{" "}
              {right.cards_left} {right.name}
            </p>
          </div>
          <button type="button" onClick={leaveGame} className="cards-btn mt-5">
            <RotateCcw size={18} /> Play again
          </button>
          <Link href="/" className="cards-btn cards-btn-ghost mt-4">
            Back to home
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
          ? "It's a tie! Both cards go to the pot."
          : !isLocal && lr.winner === "you"
            ? "You win this round! +2 cards"
            : `${winnerName} wins this round`;

      const bannerColor =
        lr.winner === "tie"
          ? "bg-amber-400 text-slate-900"
          : !isLocal && lr.winner === "opponent"
            ? "bg-red-600 text-white"
            : "bg-emerald-600 text-white";

      stage = (
        <div className="mx-auto w-full max-w-3xl">
          <div className={`card-pop mb-5 rounded-2xl p-5 text-center shadow-lg ${bannerColor}`}>
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">
              Round {lr.number} · {STAT_META[lr.stat].label}
            </p>
            <p className="mt-2 flex items-center justify-center gap-4 text-4xl font-black">
              <span>{challengerValue}</span>
              <span className="text-base font-bold opacity-70">vs</span>
              <span>{responderValue}</span>
            </p>
            <p className="mt-2 text-lg font-black">{bannerText}</p>
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
            className="cards-btn mx-auto mt-6 max-w-sm"
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
            <CardBack title="HAND OVER" subtitle={`${challengerName} is up`} />
            <button
              type="button"
              onClick={() => setHolderSeat(challengerSeat)}
              className="cards-btn mt-5"
            >
              <Eye size={18} /> I&apos;m {challengerName}: show my card
            </button>
          </StageWrap>
        );
      } else if (game.you_are_challenger && game.my_card) {
        stage = (
          <StageWrap>
            <p className="mb-3 text-center text-sm font-black text-foreground/80">
              {isLocal ? `${challengerName}, ` : ""}pick your strongest stat
            </p>
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
              className="cards-btn mt-5"
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Lock size={18} />}
              {selectedStat ? `Lock ${STAT_META[selectedStat].label}` : "Select a stat to lock"}
            </button>
          </StageWrap>
        );
      } else {
        stage = (
          <StageWrap>
            <CardBack
              title={`${challengerName.toUpperCase()}'S CARD`}
              subtitle="Choosing a stat..."
            />
            <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-foreground/75">
              <LoaderCircle size={16} className="animate-spin" />
              Waiting for {challengerName} to lock a stat
            </p>
          </StageWrap>
        );
      }
    } else if (game.phase === "LOCKED") {
      const canReveal = isLocal || !game.you_are_challenger;

      if (canReveal) {
        stage = (
          <StageWrap>
            <div className="mb-4 rounded-2xl bg-accent px-4 py-3 text-center text-accent-ink shadow-lg">
              <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">
                {challengerName} locked
              </p>
              <p className="mt-1 text-2xl font-black">{lockedLabel}</p>
            </div>
            <button
              type="button"
              onClick={handleRevealCard}
              disabled={busy || isCardFlipping}
              aria-label={isLocal ? `${responderName}: reveal card` : "Reveal card"}
              className="block w-full rounded-3xl text-left outline-none ring-4 ring-lime-400/80 shadow-[0_0_26px_8px_rgba(163,230,53,0.4)] transition-shadow duration-300 hover:shadow-[0_0_32px_10px_rgba(163,230,53,0.48)] focus-visible:ring-lime-300 disabled:cursor-wait"
              style={{
                transform: isCardFlipping ? "perspective(1000px) rotateY(90deg) scale(0.97)" : "perspective(1000px) rotateY(0deg) scale(1)",
                transformStyle: "preserve-3d",
                transition: "transform 420ms cubic-bezier(0.2, 0.75, 0.25, 1), box-shadow 300ms ease",
              }}
            >
              <div className="pointer-events-none overflow-hidden rounded-3xl">
                <CardBack
                  title="REVEAL CARD"
                  subtitle={busy || isCardFlipping ? "Revealing..." : ""}
                />
              </div>
            </button>
          </StageWrap>
        );
      } else {
        stage = (
          <StageWrap>
            <div className="mb-4 rounded-2xl bg-accent px-4 py-3 text-center text-accent-ink shadow-lg">
              <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">
                You locked
              </p>
              <p className="mt-1 text-2xl font-black">{lockedLabel}</p>
            </div>
            {game.my_card && <PlayerCard player={game.my_card} lockedStat={game.locked_stat} />}
            <p className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-foreground/75">
              <LoaderCircle size={16} className="animate-spin" />
              Waiting for {responderName} to reveal their card
            </p>
          </StageWrap>
        );
      }
    } else {
      stage = <Spinner text="Syncing the game..." />;
    }

    const showScore = game.status === "ACTIVE";
    const showConcede = game.status === "ACTIVE" && game.phase !== "REVEALED";

    gameView = (
      <section className="mx-auto max-w-4xl py-4 sm:py-8">
        {showScore && (
          <ScoreBar
            left={left}
            right={right}
            round={game.round_number}
            pot={game.pot_count}
            challengerSeat={challengerSeat}
          />
        )}

        {stage}

        {error && (
          <div className="mx-auto mt-4 max-w-sm">
            <ErrorMessage message={error} />
          </div>
        )}

        {showConcede && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={concede}
              disabled={busy}
              className="cards-btn cards-btn-ghost cards-btn-sm"
            >
              <Flag size={14} /> Concede
            </button>
          </div>
        )}
      </section>
    );
  }

  /* ----------------------------- final render ----------------------- */

  let content: ReactNode;

  if (view === "restoring") content = <Spinner text="Loading..." />;
  else if (view === "lobby") content = lobby;
  else content = gameView ?? <Spinner text="Loading the game..." />;

  return <DraftPageShell>{content}</DraftPageShell>;
}