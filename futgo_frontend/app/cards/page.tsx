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
  "w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

const PRIMARY_BTN =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";

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
  const side = (info: SideInfo, align: "left" | "right") => (
    <div className={`min-w-0 flex-1 ${align === "right" ? "text-right" : ""}`}>
      <p className="truncate text-sm font-black">{info.name}</p>
      <p className="text-xs text-muted">
        <span className="text-xl font-black text-foreground">
          {info.cards_left}
        </span>{" "}
        cards
        {info.seat === challengerSeat && (
          <span className="ml-1.5 font-bold text-accent-text">· challenging</span>
        )}
      </p>
    </div>
  );

  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      {side(left, "left")}
      <div className="shrink-0 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
          Round {round}
        </p>
        {pot > 0 && (
          <p className="mt-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-300">
            Pot: {pot}
          </p>
        )}
      </div>
      {side(right, "right")}
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
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text">
          <Layers size={14} /> Card battle
        </div>
        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">PLAY CARDS</h1>
        <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
          Each manager gets a hidden deck. Lock your best stat, make your rival
          reveal their card, and the higher stat takes both. Last one with cards wins.
        </p>
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
            className={`flex items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-bold transition sm:text-sm ${
              tab === item.key
                ? "border-accent bg-accent/15 text-accent-text"
                : "border-border text-muted hover:border-accent/50"
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </div>

      <form
        onSubmit={submitLobby}
        className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl shadow-black/10 dark:shadow-black/20"
      >
        <div className="grid gap-4 p-5 sm:p-7">
          {tab === "JOIN" ? (
            <>
              <label className="block">
                <span className="mb-2 block text-xs font-semibold text-muted">Room code</span>
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
                <span className="mb-2 block text-xs font-semibold text-muted">Your display name</span>
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
                  <span className="mb-2 block text-xs font-semibold text-muted">
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
                    <span className="mb-2 block text-xs font-semibold text-muted">Player 2</span>
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
                <span className="mb-2 block text-xs font-semibold text-muted">Card pool</span>
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
                          className={`rounded-full border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                            poolKey === pool.key
                              ? "border-accent bg-accent/15 text-accent-text"
                              : "border-border text-muted hover:border-accent/50"
                          }`}
                        >
                          {pool.label} <span className="opacity-60">· {pool.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <span className="mb-2 block text-xs font-semibold text-muted">Cards each</span>
                <div className="flex flex-wrap gap-2">
                  {DECK_OPTIONS.map((n) => {
                    const disabled = !deckChoices.includes(n);
                    return (
                      <button
                        key={n}
                        type="button"
                        disabled={disabled || busy}
                        onClick={() => setDeckSize(n)}
                        className={`min-w-14 rounded-full border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          deckSize === n && !disabled
                            ? "border-accent bg-accent/15 text-accent-text"
                            : "border-border text-muted hover:border-accent/50"
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

        <div className="border-t border-border bg-foreground/[0.03] p-5 sm:px-7">
          <button type="submit" disabled={busy || poolsLoading} className={PRIMARY_BTN}>
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
          <div className="rounded-[24px] border border-border bg-surface p-6 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Room code</p>
            <p className="mt-3 select-all text-5xl font-black tracking-[0.3em] text-accent-text">
              {game.room_code}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => void copyText(game.room_code, "code")}
                className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-ink transition hover:brightness-110"
              >
                {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
                {copied === "code" ? "Copied" : "Copy code"}
              </button>
              <button
                type="button"
                onClick={() => void copyText(link, "link")}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground/75 transition hover:bg-foreground/5"
              >
                {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
                {copied === "link" ? "Copied" : "Copy invite link"}
              </button>
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted">
              <LoaderCircle size={16} className="animate-spin" />
              Waiting for your opponent to join...
            </p>
          </div>
          <button
            type="button"
            onClick={leaveGame}
            className="mt-4 w-full rounded-xl border border-border px-6 py-3 text-sm font-semibold text-muted transition hover:bg-foreground/5"
          >
            Cancel room
          </button>
        </StageWrap>
      );
    } else if (game.status === "FINISHED") {
      const winnerName = game.winner_seat ? nameOf(game.winner_seat) : "";
      const loserName = game.winner_seat ? nameOf(otherSeat(game.winner_seat)) : "";

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
          <div className="card-pop rounded-[24px] border border-accent/40 bg-accent/10 p-8 text-center">
            <Trophy size={44} className="mx-auto text-amber-500 dark:text-amber-300" />
            <h2 className="mt-4 text-3xl font-black">{headline}</h2>
            <p className="mt-2 text-sm text-muted">{reason}</p>
            <p className="mt-5 text-sm font-bold">
              {left.name} {left.cards_left} <span className="text-muted">:</span>{" "}
              {right.cards_left} {right.name}
            </p>
          </div>
          <button type="button" onClick={leaveGame} className={`${PRIMARY_BTN} mt-4`}>
            <RotateCcw size={18} /> Play again
          </button>
          <Link
            href="/"
            className="mt-3 block rounded-xl border border-border px-6 py-3 text-center text-sm font-semibold text-muted transition hover:bg-foreground/5"
          >
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
          ? "text-amber-600 dark:text-amber-300"
          : !isLocal && lr.winner === "opponent"
            ? "text-red-600 dark:text-red-300"
            : "text-emerald-600 dark:text-emerald-400";

      stage = (
        <div className="mx-auto w-full max-w-3xl">
          <div className="card-pop mb-5 rounded-2xl border border-border bg-surface p-5 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
              Round {lr.number} · {STAT_META[lr.stat].label}
            </p>
            <p className="mt-2 flex items-center justify-center gap-4 text-4xl font-black">
              <span>{challengerValue}</span>
              <span className="text-base font-bold text-muted">vs</span>
              <span>{responderValue}</span>
            </p>
            <p className={`mt-2 text-lg font-black ${bannerColor}`}>{bannerText}</p>
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
            className={`${PRIMARY_BTN} mx-auto mt-6 max-w-sm`}
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
              className={`${PRIMARY_BTN} mt-4`}
            >
              <Eye size={18} /> I&apos;m {challengerName}: show my card
            </button>
          </StageWrap>
        );
      } else if (game.you_are_challenger && game.my_card) {
        stage = (
          <StageWrap>
            <p className="mb-3 text-center text-sm font-bold text-muted">
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
              className={`${PRIMARY_BTN} mt-4`}
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
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
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
            <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                {challengerName} locked
              </p>
              <p className="mt-1 text-2xl font-black text-accent-text">{lockedLabel}</p>
            </div>
            <CardBack
              title={`${responderName.toUpperCase()}'S CARD`}
              subtitle="Face down"
            />
            <button
              type="button"
              onClick={revealCard}
              disabled={busy}
              className={`${PRIMARY_BTN} mt-4`}
            >
              {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Eye size={18} />}
              {isLocal ? `${responderName}: reveal my card` : "Reveal my card"}
            </button>
          </StageWrap>
        );
      } else {
        stage = (
          <StageWrap>
            <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/10 px-4 py-3 text-center">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                You locked
              </p>
              <p className="mt-1 text-2xl font-black text-accent-text">{lockedLabel}</p>
            </div>
            {game.my_card && <PlayerCard player={game.my_card} lockedStat={game.locked_stat} />}
            <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
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
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={concede}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted transition hover:border-red-400/40 hover:text-red-600 disabled:opacity-50 dark:hover:text-red-300"
            >
              <Flag size={13} /> Concede
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