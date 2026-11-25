"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  actingSeatOf,
  clearSession,
  errorText,
  fetchFull,
  isUnchanged,
  loadSession,
  nameFor,
  penaltiesApi,
  saveSession,
  sessionFromResponse,
} from "../_penalties/penaltiesShared";
import type {
  CreateBody,
  GameState,
  Kick,
  PenaltySession,
  Pool,
  Seat,
  SquadPlayer,
  ZoneKey,
} from "../_penalties/penaltiesShared";
import {
  BracketView,
  ChampionScreen,
  DraftScreen,
  ErrorMessage,
  HandoffScreen,
  KickResultOverlay,
  LobbyScreen,
  MatchPanel,
  PenaltyShell,
  SetupScreen,
  SquadDrawer,
  WaitingPanel,
} from "../_penalties/PenaltiesUI";

// How often an online player asks the server for news (milliseconds).
const POLL_MS = 1500;
// How long the kick result popup stays open in online games.
const RESULT_AUTO_CLOSE_MS = 5000;

type SquadSet = { name: string; players: SquadPlayer[] };

export default function PenaltiesPage() {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<PenaltySession | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [initialCode, setInitialCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Local play: which seat is holding the phone right now.
  const [holder, setHolder] = useState<Seat | null>(null);

  const [overlay, setOverlay] = useState<{ kick: Kick; matchId: number } | null>(null);
  const [squadSets, setSquadSets] = useState<SquadSet[] | null>(null);

  const versionRef = useRef(0);
  const seenKickRef = useRef("");
  const initializedRef = useRef(false);

  /* ----------------------------- state intake ---------------------------- */

  const applyState = useCallback((next: GameState) => {
    versionRef.current = next.version;

    const match = next.match;
    const kick = match?.last_kick ?? null;
    const key = match && kick ? `${match.id}-${kick.number}` : "";

    if (!initializedRef.current) {
      // First state after load or refresh: do not replay an old kick.
      initializedRef.current = true;
      seenKickRef.current = key;
    } else if (match && kick && key !== seenKickRef.current) {
      seenKickRef.current = key;
      setOverlay({ kick, matchId: match.id });
    }

    setState(next);
  }, []);

  const resetGame = useCallback(() => {
    clearSession();
    setSession(null);
    setState(null);
    setOverlay(null);
    setHolder(null);
    setError("");
    versionRef.current = 0;
    seenKickRef.current = "";
    initializedRef.current = false;
  }, []);

  /* ------------------------------- startup ------------------------------- */

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setInitialCode((params.get("room") || "").toUpperCase());

    penaltiesApi
      .pools()
      .then((result) => setPools(result.pools))
      .catch(() => undefined);

    const saved = loadSession();
    if (!saved) {
      setReady(true);
      return;
    }

    fetchFull(saved, saved.seat)
      .then((next) => {
        setSession(saved);
        applyState(next);
      })
      .catch(() => clearSession())
      .finally(() => setReady(true));
  }, [applyState]);

  /* ------------------------------- polling ------------------------------- */

  const online = session?.mode === "ONLINE";
  const gameOver = state?.game_over ?? false;

  useEffect(() => {
    if (!session || session.mode !== "ONLINE" || gameOver) return undefined;
    const token = session.tokens[session.seat];
    if (!token) return undefined;

    let cancelled = false;
    let busy = false;

    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await penaltiesApi.state(session.roomCode, token, versionRef.current);
        if (!cancelled && !isUnchanged(result)) applyState(result);
      } catch (err) {
        if (err instanceof ApiError && (err.status === 404 || err.status === 403)) {
          if (!cancelled) {
            resetGame();
            setError("This room is no longer available.");
          }
        }
      } finally {
        busy = false;
      }
    };

    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session, gameOver, applyState, resetGame, online]);

  /* ------------------------------- actions ------------------------------- */

  const startSession = (next: PenaltySession, first: GameState) => {
    saveSession(next);
    initializedRef.current = false;
    setSession(next);
    setHolder(null);
    applyState(first);
  };

  const handleCreate = async (body: CreateBody) => {
    setLoading(true);
    setError("");
    try {
      const result = await penaltiesApi.create(body);
      startSession(sessionFromResponse(result, body.mode), result.state);
    } catch (err) {
      setError(errorText(err, "Could not create the game."));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (code: string, name: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await penaltiesApi.join(code, name);
      startSession(sessionFromResponse(result, "ONLINE"), result.state);
    } catch (err) {
      setError(errorText(err, "Could not join the room."));
    } finally {
      setLoading(false);
    }
  };

  const act = async (
    seat: Seat,
    call: (roomCode: string, token: string) => Promise<GameState>,
  ) => {
    if (!session) return;
    const token = session.tokens[seat];
    if (!token) {
      setError("Missing seat token for this game.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const next = await call(session.roomCode, token);
      applyState(next);
    } catch (err) {
      setError(errorText(err, "Something went wrong. Try again."));
    } finally {
      setLoading(false);
    }
  };

  const openSquads = async () => {
    if (!session || !state) return;
    setSquadSets([]);
    if (session.mode === "ONLINE") {
      setSquadSets([{ name: state.you.name, players: state.squad }]);
      return;
    }
    try {
      const [a, b] = await Promise.all([fetchFull(session, 1), fetchFull(session, 2)]);
      setSquadSets([
        { name: a.you.name, players: a.squad },
        { name: b.you.name, players: b.squad },
      ]);
    } catch (err) {
      setSquadSets(null);
      setError(errorText(err, "Could not load the squads."));
    }
  };

  /* ------------------------------- screens ------------------------------- */

  if (!ready) {
    return (
      <PenaltyShell>
        <div className="flex items-center justify-center py-32 text-sm text-foreground/70">
          Loading...
        </div>
      </PenaltyShell>
    );
  }

  if (!session || !state) {
    return (
      <PenaltyShell>
        <SetupScreen
          pools={pools}
          loading={loading}
          error={error}
          initialCode={initialCode}
          onCreate={handleCreate}
          onJoin={handleJoin}
        />
      </PenaltyShell>
    );
  }

  const isLocal = session.mode === "LOCAL";
  const mySeat: Seat | null = isLocal ? null : session.seat;
  const actingSeat: Seat | null = isLocal ? actingSeatOf(state) : session.seat;

  const closeOverlay = () => setOverlay(null);

  let body: React.ReactNode = null;

  if (state.status === "WAITING") {
    body = <LobbyScreen state={state} onLeave={resetGame} />;
  } else if (state.status === "SQUAD" && state.draft) {
    const canAct = isLocal ? true : state.draft.you_are_picker;
    body = (
      <DraftScreen
        state={state}
        canAct={canAct}
        loading={loading}
        error={error}
        mySeat={mySeat}
        onPick={(player) => {
          if (actingSeat) {
            act(actingSeat, (code, token) => penaltiesApi.pick(code, token, player.player_id));
          }
        }}
      />
    );
  } else if (state.status === "FINISHED") {
    body = <ChampionScreen state={state} onNewGame={resetGame} />;
  } else {
    // ACTIVE: the tournament is running
    const match = state.match;
    const live = !!match && match.status === "ACTIVE" && !!match.current;

    if (live && match && match.current) {
      const current = match.current;

      let role: "shoot" | "dive" | "wait" = "wait";
      if (isLocal) {
        role = match.phase === "SHOOT" ? "shoot" : "dive";
      } else if (state.available_action === "shoot") {
        role = "shoot";
      } else if (state.available_action === "dive") {
        role = "dive";
      }

      const waitText =
        state.available_action === "wait_for_keeper"
          ? `Shot locked. ${current.keeper_name} is diving...`
          : `${current.attacker_name} is shooting...`;

      const needsHandoff = isLocal && !overlay && actingSeat !== null && holder !== actingSeat;

      // Called by the pitch when a player swipes (or when the dive timer runs out).
      const commit = (zone: ZoneKey) => {
        if (!actingSeat) return;
        if (role === "shoot") {
          act(actingSeat, (code, token) => penaltiesApi.shoot(code, token, zone));
        } else if (role === "dive") {
          act(actingSeat, (code, token) => penaltiesApi.dive(code, token, zone));
        }
      };

      if (needsHandoff && actingSeat) {
        body = (
          <HandoffScreen
            name={nameFor(state, actingSeat)}
            role={match.phase === "SHOOT" ? "shoot" : "dive"}
            onReady={() => setHolder(actingSeat)}
          />
        );
      } else {
        body = (
          <>
            <MatchPanel
              match={match}
              mySeat={mySeat}
              role={role}
              waitText={waitText}
              loading={loading}
              error={error}
              onCommit={commit}
              onConcede={() => {
                if (!actingSeat) return;
                if (window.confirm("Leave this match? Your opponent will win it.")) {
                  act(actingSeat, (code, token) => penaltiesApi.concede(code, token));
                }
              }}
            />

            <div className="mx-auto mt-8 max-w-xl">
              <p className="mb-3 text-xs font-black uppercase tracking-[0.18em] text-accent-text">
                Tournament
              </p>
              <div className="rounded-3xl border border-border bg-surface p-4">
                <BracketView rounds={state.bracket ?? []} mySeat={mySeat} />
              </div>
            </div>
          </>
        );
      }
    } else {
      const message =
        state.available_action === "eliminated"
          ? "You are out of the tournament. Keep watching the rest of the matches."
          : state.bye_seats.includes(state.you.seat) && state.round_number === 1
            ? "You have a bye straight into the next round. Waiting for the other matches."
            : "You are through. Waiting for the other matches to finish.";
      body = <WaitingPanel state={state} message={message} />;
    }
  }

  const showTopBar = state.status === "ACTIVE" || state.status === "SQUAD";

  return (
    <PenaltyShell>
      {showTopBar && (
        <div className="flex flex-wrap items-center gap-2 pt-4">
          <span className="rounded-full border border-foreground/20 bg-surface px-3 py-1.5 text-[11px] font-bold text-foreground/80">
            Room {state.room_code}
          </span>
          <button
            type="button"
            onClick={openSquads}
            disabled={state.status === "SQUAD"}
            className="rounded-full border border-foreground/20 bg-surface px-3 py-1.5 text-[11px] font-bold text-foreground/80 transition hover:border-accent-text/60 disabled:opacity-40"
          >
            View squads
          </button>
        </div>
      )}

      {error && !showTopBar && state.status !== "WAITING" && (
        <div className="mt-4">
          <ErrorMessage message={error} />
        </div>
      )}

      {body}

      {overlay && state.match && (
        <KickResultOverlay
          key={`${overlay.matchId}-${overlay.kick.number}`}
          kick={overlay.kick}
          match={state.match}
          autoCloseMs={isLocal ? undefined : RESULT_AUTO_CLOSE_MS}
          onClose={closeOverlay}
        />
      )}

      {squadSets && <SquadDrawer sets={squadSets} onClose={() => setSquadSets(null)} />}
    </PenaltyShell>
  );
}