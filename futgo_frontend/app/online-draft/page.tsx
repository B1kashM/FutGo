"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Crown,
  Link2,
  LoaderCircle,
  LogIn,
  LogOut,
  Play,
  Plus,
  Shield,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

import {
  ApiError,
  apiRequest,
  cleanName,
  getCategoryLabel,
  makeIdempotencyKey,
  useMatchPlayback,
} from "../_draft/draftShared";
import type {
  CategoryValue,
  DraftState,
  MatchResult,
  Player,
  Team,
} from "../_draft/draftShared";
import {
  CategoryGrid,
  DraftCompleteView,
  DraftPageShell,
  DraftingView,
  ErrorMessage,
  MatchCentreView,
  TeamBadge,
  TeamDropdown,
} from "../_draft/DraftUI";

/* ------------------------------------------------------------------ */
/* Types and constants                                                 */
/* ------------------------------------------------------------------ */

type Seat = 1 | 2;

type Session = {
  draftId: number;
  token: string;
  seat: Seat;
  roomCode: string;
};

type View =
  | "restoring"
  | "landing"
  | "create"
  | "join"
  | "room";

type ConnectionStatus = "connected" | "reconnecting" | "offline";

type ParticipantResponse = {
  draft_id: number;
  room_code: string;
  mode: string;
  status: string;
  participant: { seat_number: number; display_name: string };
  participant_token?: string;
};

type ReconnectResponse = ParticipantResponse & { draft_state: DraftState };

const SESSION_KEY = "futgo_online_session_v1";
const POLL_MS = 2000;
const MAX_BACKOFF_MS = 8000;

function loadSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Session>;
    if (
      typeof parsed.token === "string" &&
      parsed.token &&
      typeof parsed.draftId === "number" &&
      (parsed.seat === 1 || parsed.seat === 2)
    ) {
      return {
        draftId: parsed.draftId,
        token: parsed.token,
        seat: parsed.seat,
        roomCode: parsed.roomCode || "",
      };
    }
  } catch {
    /* ignore unreadable storage */
  }

  return null;
}

function saveSession(session: Session) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function authHeaders(token: string): Record<string, string> {
  return { "X-Participant-Token": token };
}

/** Monotonic progress score: stops a slow, older poll from overwriting newer state. */
function draftProgress(draft: DraftState): number {
  const rank = draft.status === "COMPLETED" ? 2 : draft.status === "ACTIVE" ? 1 : 0;
  return (
    rank * 100 +
    (draft.squads?.player1?.length ?? 0) +
    (draft.squads?.player2?.length ?? 0)
  );
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function OnlineDraftPage() {
  const [view, setView] = useState<View>("restoring");
  const [restoreError, setRestoreError] = useState("");

  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);

  const [hostName, setHostName] = useState("");
  const [category, setCategory] = useState<CategoryValue | "">("");
  const [hostTeamId, setHostTeamId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<ConnectionStatus>("connected");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const {
    matchData,
    matchHistory,
    matchMinute,
    matchFinished,
    playMatch,
    loadFinishedMatch,
    watchAgain,
    showPreviousMatch,
    clearMatches,
  } = useMatchPlayback();

  const sessionRef = useRef<Session | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const busyRef = useRef(false);
  const epochRef = useRef(0);
  const pickingRef = useRef(false);
  const failuresRef = useRef(0);
  const knownMatchIds = useRef<Set<number>>(new Set());
  const firstMatchSyncRef = useRef(false);

  /* ----------------------------- state helpers ---------------------- */

  const applyDraft = useCallback((next: DraftState) => {
    const previous = draftRef.current;

    if (
      previous &&
      previous.draft_id === next.draft_id &&
      draftProgress(next) < draftProgress(previous)
    ) {
      return;
    }

    draftRef.current = next;
    setDraft(next);
  }, []);

  const noteSuccess = useCallback(() => {
    failuresRef.current = 0;
    setConnection("connected");
  }, []);

  const noteFailure = useCallback(() => {
    failuresRef.current += 1;
    setConnection(failuresRef.current >= 3 ? "offline" : "reconnecting");
  }, []);

  const beginMutation = () => {
    busyRef.current = true;
    epochRef.current += 1;
  };

  const endMutation = () => {
    busyRef.current = false;
    epochRef.current += 1;
  };

  const leaveRoom = useCallback(
    (message = "") => {
      clearSession();
      sessionRef.current = null;
      draftRef.current = null;
      knownMatchIds.current.clear();
      failuresRef.current = 0;
      setSession(null);
      setDraft(null);
      clearMatches();
      setConnection("connected");
      setError(message);
      setRestoreError("");
      setView("landing");
    },
    [clearMatches],
  );

  /* ----------------------------- syncing ---------------------------- */

  const syncState = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;

    const epoch = epochRef.current;

    try {
      const state = await apiRequest<DraftState>(
        `/api/drafts/${current.draftId}/state/`,
        { headers: authHeaders(current.token) },
      );

      if (sessionRef.current?.draftId !== current.draftId) return;

      noteSuccess();

      // A pick/club change happened while this request was in flight.
      if (epoch !== epochRef.current) return;

      applyDraft(state);
    } catch (err) {
      if (sessionRef.current?.draftId !== current.draftId) return;

      if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
        leaveRoom("This room is no longer available.");
        return;
      }

      noteFailure();
    }
  }, [applyDraft, leaveRoom, noteFailure, noteSuccess]);

  const syncMatch = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;

    const isFirstSync = firstMatchSyncRef.current;

    try {
      const match = await apiRequest<MatchResult>(
        `/api/drafts/${current.draftId}/match/`,
        { headers: authHeaders(current.token) },
      );

      firstMatchSyncRef.current = false;
      if (sessionRef.current?.draftId !== current.draftId) return;

      noteSuccess();

      const id = match.match_id ?? match.id ?? 0;
      if (knownMatchIds.current.has(id)) return;
      knownMatchIds.current.add(id);

      const fallback = {
        player1_team: draftRef.current?.player1_team,
        player2_team: draftRef.current?.player2_team,
      };

      // After a refresh show the existing result at full time;
      // a match that appears live is played from kick-off.
      if (isFirstSync) loadFinishedMatch(match, fallback);
      else playMatch(match, fallback);
    } catch (err) {
      firstMatchSyncRef.current = false;

      // 404 simply means the host has not started a match yet.
      if (err instanceof ApiError && err.status === 404) return;
      if (sessionRef.current?.draftId !== current.draftId) return;

      if (err instanceof ApiError && err.status === 401) {
        leaveRoom("This room is no longer available.");
        return;
      }

      noteFailure();
    }
  }, [leaveRoom, loadFinishedMatch, noteFailure, noteSuccess, playMatch]);

  /* ----------------------------- polling loop ----------------------- */

  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;
    let running = false;
    let timer: number | undefined;

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(tick, delay);
    };

    async function tick() {
      if (cancelled || running) return;
      running = true;

      if (!document.hidden && !busyRef.current) {
        await syncState();

        if (!cancelled && draftRef.current?.status === "COMPLETED") {
          await syncMatch();
        }
      }

      if (cancelled) return;

      const failures = failuresRef.current;
      schedule(
        failures > 0
          ? Math.min(POLL_MS * 2 ** Math.min(failures, 2), MAX_BACKOFF_MS)
          : POLL_MS,
      );
      running = false;
    }

    const wake = () => {
      if (!document.hidden) schedule(50);
    };

    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener("focus", wake);

    schedule(0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
    };
  }, [session?.draftId, session?.token, syncState, syncMatch]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------- startup ---------------------------- */

  useEffect(() => {
    let cancelled = false;

    const loadTeams = async () => {
      setTeamsLoading(true);

      try {
        const response = await apiRequest<Team[] | { teams?: Team[] }>(
          "/api/drafts/teams/",
        );

        const items = Array.isArray(response)
          ? response
          : Array.isArray(response.teams)
            ? response.teams
            : [];

        if (!cancelled) {
          setTeams(items.filter((team) => team.is_active !== false));
        }
      } catch (err) {
        if (!cancelled) {
          setError(`Unable to load football clubs: ${errorText(err, "")}`.trim());
        }
      } finally {
        if (!cancelled) setTeamsLoading(false);
      }
    };

    void loadTeams();

    return () => {
      cancelled = true;
    };
  }, []);

  const restoreSession = useCallback(async () => {
    const stored = loadSession();

    if (!stored) {
      const room = new URLSearchParams(window.location.search).get("room");

      if (room) {
        setJoinCode(room.trim().toUpperCase().slice(0, 8));
        setView("join");
      } else {
        setView("landing");
      }

      return;
    }

    setRestoreError("");
    setView("restoring");

    try {
      const response = await apiRequest<ReconnectResponse>(
        "/api/drafts/reconnect/",
        {
          method: "POST",
          body: JSON.stringify({ participant_token: stored.token }),
        },
      );

      const restored: Session = {
        draftId: response.draft_id,
        token: stored.token,
        seat: response.participant.seat_number === 2 ? 2 : 1,
        roomCode: response.room_code || stored.roomCode,
      };

      saveSession(restored);
      sessionRef.current = restored;
      draftRef.current = response.draft_state;
      knownMatchIds.current.clear();
      firstMatchSyncRef.current = response.draft_state.status === "COMPLETED";
      failuresRef.current = 0;

      setSession(restored);
      setDraft(response.draft_state);
      setConnection("connected");
      setView("room");
    } catch (err) {
      // 400/401 = the token is no longer valid. Anything else (offline,
      // server error) keeps the token so the player can retry.
      if (err instanceof ApiError && (err.status === 400 || err.status === 401)) {
        clearSession();
        setView("landing");
        return;
      }

      setRestoreError(errorText(err, "Unable to reconnect to your room."));
    }
  }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  /* ----------------------------- room actions ----------------------- */

  const beginSession = useCallback(
    async (next: Session) => {
      saveSession(next);
      sessionRef.current = next;
      draftRef.current = null;
      knownMatchIds.current.clear();
      firstMatchSyncRef.current = false;
      failuresRef.current = 0;

      clearMatches();
      setSession(next);
      setDraft(null);
      setConnection("connected");
      setView("room");

      try {
        const state = await apiRequest<DraftState>(
          `/api/drafts/${next.draftId}/state/`,
          { headers: authHeaders(next.token) },
        );
        applyDraft(state);
      } catch {
        /* the polling loop retries */
      }
    },
    [applyDraft, clearMatches],
  );

  const createRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const name = hostName.trim();

    if (!category) {
      setError("Please select a player category.");
      return;
    }

    if (!name) {
      setError("Enter your name to create a room.");
      return;
    }

    if (!hostTeamId) {
      setError("Choose your football club.");
      return;
    }

    setLoading(true);

    try {
      const created = await apiRequest<ParticipantResponse>(
        "/api/drafts/create/",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "ONLINE",
            player1_name: name,
            category,
            player1_team_id: Number(hostTeamId),
          }),
        },
      );

      if (!created.participant_token) {
        throw new Error("The server did not return a participant token.");
      }

      await beginSession({
        draftId: created.draft_id,
        token: created.participant_token,
        seat: 1,
        roomCode: created.room_code,
      });
    } catch (err) {
      setError(errorText(err, "Unable to create the room. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const joinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const code = joinCode.trim().toUpperCase();
    const name = joinName.trim();

    if (code.length < 4) {
      setError("Enter the room code you were given.");
      return;
    }

    if (!name) {
      setError("Enter your display name to join.");
      return;
    }

    setLoading(true);

    try {
      const joined = await apiRequest<ParticipantResponse>(
        "/api/drafts/join/",
        {
          method: "POST",
          body: JSON.stringify({ room_code: code, display_name: name }),
        },
      );

      if (!joined.participant_token) {
        throw new Error("The server did not return a participant token.");
      }

      await beginSession({
        draftId: joined.draft_id,
        token: joined.participant_token,
        seat: 2,
        roomCode: joined.room_code || code,
      });
    } catch (err) {
      setError(errorText(err, "Unable to join the room. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const selectClub = async (teamId: string) => {
    const current = sessionRef.current;
    if (!current || !teamId) return;

    setError("");
    setLoading(true);
    beginMutation();

    try {
      await apiRequest(`/api/drafts/${current.draftId}/select-team/`, {
        method: "POST",
        headers: authHeaders(current.token),
        body: JSON.stringify({ team_id: Number(teamId) }),
      });

      const state = await apiRequest<DraftState>(
        `/api/drafts/${current.draftId}/state/`,
        { headers: authHeaders(current.token) },
      );

      applyDraft(state);
    } catch (err) {
      setError(errorText(err, "Unable to select that club."));
    } finally {
      endMutation();
      setLoading(false);
    }
  };

  const startDraft = async () => {
    const current = sessionRef.current;
    if (!current || current.seat !== 1 || loading) return;

    setError("");
    setLoading(true);
    beginMutation();

    try {
      const state = await apiRequest<DraftState>(
        `/api/drafts/${current.draftId}/start/`,
        { method: "POST", headers: authHeaders(current.token) },
      );

      applyDraft(state);
    } catch (err) {
      setError(errorText(err, "Unable to start the draft."));
    } finally {
      endMutation();
      setLoading(false);
    }
  };

  const resyncAfterError = async (current: Session) => {
    try {
      const state = await apiRequest<DraftState>(
        `/api/drafts/${current.draftId}/state/`,
        { headers: authHeaders(current.token) },
      );
      applyDraft(state);
    } catch {
      /* the polling loop will retry */
    }
  };

  const choosePlayer = async (player: Player) => {
    const current = sessionRef.current;
    const latest = draftRef.current;

    if (!current || !latest?.current_event || pickingRef.current) return;

    // Only the active manager can pick.
    if (latest.current_event.active_player_number !== current.seat) return;

    pickingRef.current = true;
    setError("");
    setLoading(true);
    beginMutation();

    try {
      const updated = await apiRequest<DraftState>(
        `/api/drafts/${current.draftId}/pick/`,
        {
          method: "POST",
          headers: authHeaders(current.token),
          body: JSON.stringify({ selected_player_id: player.id }),
        },
      );

      applyDraft(updated);
    } catch (err) {
      setError(errorText(err, "Unable to save your pick. Please try again."));
      // The turn may have changed or the request may have succeeded
      // without a response: re-read the authoritative state.
      await resyncAfterError(current);
    } finally {
      pickingRef.current = false;
      endMutation();
      setLoading(false);
    }
  };

  const refreshDraft = async () => {
    const current = sessionRef.current;
    if (!current) return;

    setError("");
    setLoading(true);

    try {
      await resyncAfterError(current);
    } finally {
      setLoading(false);
    }
  };

  const startMatch = async () => {
    const current = sessionRef.current;
    const latest = draftRef.current;

    if (!current || !latest || current.seat !== 1 || loading) return;

    setError("");
    setLoading(true);
    beginMutation();

    try {
      const result = await apiRequest<MatchResult>(
        `/api/drafts/${current.draftId}/match/`,
        {
          method: "POST",
          headers: {
            ...authHeaders(current.token),
            "Idempotency-Key": makeIdempotencyKey(),
          },
        },
      );

      const id = result.match_id ?? result.id ?? 0;

      if (!knownMatchIds.current.has(id)) {
        knownMatchIds.current.add(id);
        playMatch(result, {
          player1_team: latest.player1_team,
          player2_team: latest.player2_team,
        });
      }
    } catch (err) {
      setError(errorText(err, "Unable to start the match. Please try again."));
    } finally {
      endMutation();
      setLoading(false);
    }
  };

  const handleLeave = () => {
    if (
      draft?.status === "ACTIVE" &&
      !window.confirm(
        "Leave this room? The draft is in progress and you will not be able to rejoin.",
      )
    ) {
      return;
    }

    leaveRoom();
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
    window.setTimeout(() => setCopied((value) => (value === kind ? null : value)), 1800);
  };

  /* ----------------------------- derived ---------------------------- */

  const seat = session?.seat ?? null;
  const isHost = seat === 1;
  const hostDisplay = draft?.player1_name || "the host";
  const categoryLabel = getCategoryLabel(draft?.category);

  const activeNumber = draft?.current_event?.active_player_number;
  const isMyTurn = draft?.status === "ACTIVE" && activeNumber === seat;
  const currentName =
    activeNumber === 1 ? draft?.player1_name : draft?.player2_name;

  const selectedHostTeam = useMemo(
    () => teams.find((team) => String(team.id) === hostTeamId) ?? null,
    [teams, hostTeamId],
  );

  const roomCode = draft?.room_code || session?.roomCode || "";

  /* ----------------------------- render ----------------------------- */

  let content: ReactNode;

  if (view === "restoring") {
    content = (
      <section className="mx-auto max-w-md py-24 text-center">
        {restoreError ? (
          <div className="space-y-5">
            <ErrorMessage message={restoreError} />
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={() => void restoreSession()}
                className="rounded-xl bg-accent px-6 py-3 font-black text-accent-ink transition hover:brightness-110"
              >
                Try again
              </button>
              <button
                onClick={() => leaveRoom()}
                className="rounded-xl border border-border px-6 py-3 font-semibold text-foreground/75 transition hover:bg-foreground/5"
              >
                Leave room
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-muted">
            <LoaderCircle size={30} className="animate-spin text-accent-text" />
            <p className="text-sm">Reconnecting to your room...</p>
          </div>
        )}
      </section>
    );
  } else if (view === "landing") {
    content = (
      <section className="mx-auto max-w-5xl py-8 sm:py-12">
        <div className="mb-8">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text">
            <Users size={14} /> Online multiplayer
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">PLAY ONLINE</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base hidden sm:block">
            Create a private room and share the code, or join a friend&apos;s room.
            Same draft, two screens.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              setError("");
              setView("create");
            }}
            className="group rounded-[28px] border border-border bg-surface p-6 text-left transition hover:-translate-y-1 hover:border-accent/60 sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
              <Plus size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-black">Create room</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Pick the player pool and your club, then invite a friend with a room code.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-muted transition group-hover:text-accent-text">
              Host a draft <ArrowRight size={16} />
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setError("");
              setView("join");
            }}
            className="group rounded-[28px] border border-border bg-surface p-6 text-left transition hover:-translate-y-1 hover:border-sky-400/60 sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-600 dark:text-sky-300">
              <LogIn size={28} />
            </div>
            <h2 className="mt-6 text-2xl font-black">Join room</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              Enter the room code from your friend and pick your club in the lobby.
            </p>
            <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-muted transition group-hover:text-sky-600 dark:group-hover:text-sky-300">
              Enter a code <ArrowRight size={16} />
            </span>
          </button>
        </div>

        {error && (
          <div className="mt-6">
            <ErrorMessage message={error} />
          </div>
        )}
      </section>
    );
  } else if (view === "create") {
    content = (
      <section className="mx-auto max-w-4xl py-8 sm:py-12">
        <BackButton onClick={() => { setError(""); setView("landing"); }} />

        <div className="mb-7">
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">CREATE A ROOM</h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
            Choose the player pool and your club. Your opponent picks their club after joining.
          </p>
        </div>

        <form
          onSubmit={createRoom}
          className="overflow-visible rounded-[28px] border border-border bg-surface shadow-2xl shadow-black/10 dark:shadow-black/20"
        >
          <div className="border-b border-border px-5 py-5 sm:px-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Step 1</p>
            <h2 className="mb-4 mt-1 text-lg font-black sm:text-xl">Choose your player pool</h2>
            <CategoryGrid
              value={category}
              disabled={loading}
              onChange={(value) => {
                setCategory(value);
                setError("");
              }}
            />
          </div>

          <div className="p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-text">Step 2</p>
            <h2 className="mb-5 mt-1 text-lg font-black sm:text-xl">You are the host</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold text-muted">Your name</span>
                <input
                  value={hostName}
                  onChange={(event) => setHostName(event.target.value)}
                  placeholder="Enter your name"
                  maxLength={40}
                  required
                  disabled={loading}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground outline-none transition placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
                />
              </label>
              <label className="block min-w-0">
                <span className="mb-2 block text-xs font-semibold text-muted">Football club</span>
                <TeamDropdown
                  teams={teams}
                  value={hostTeamId}
                  placeholder={teamsLoading ? "Loading clubs..." : "Select a team"}
                  disabled={teamsLoading || loading}
                  onChange={(value) => {
                    setHostTeamId(value);
                    setError("");
                  }}
                />
              </label>
            </div>

            <div className="mt-4 min-h-[72px]">
              {selectedHostTeam ? (
                <TeamBadge team={selectedHostTeam} />
              ) : (
                <div className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm text-muted">
                  <Shield size={20} /> Your selected club will appear here
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-b-[28px] border-t border-border bg-foreground/[0.03] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs leading-5 text-muted">
              You&apos;ll get a room code to share as soon as the room is created.
            </p>
            <button
              type="submit"
              disabled={loading || teamsLoading || !category || !hostName.trim() || !hostTeamId}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-56"
            >
              {loading ? (
                <>
                  <LoaderCircle size={19} className="animate-spin" /> Creating room...
                </>
              ) : (
                <>
                  Create room <ArrowRight size={19} />
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-5 sm:px-7">
              <ErrorMessage message={error} />
            </div>
          )}
        </form>
      </section>
    );
  } else if (view === "join") {
    content = (
      <section className="mx-auto max-w-2xl py-8 sm:py-12">
        <BackButton onClick={() => { setError(""); setView("landing"); }} />

        <div className="mb-7">
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">JOIN A ROOM</h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
            Enter the room code your friend shared with you.
          </p>
        </div>

        <form
          onSubmit={joinRoom}
          className="overflow-visible rounded-[28px] border border-border bg-surface shadow-2xl shadow-black/10 dark:shadow-black/20"
        >
          <div className="grid gap-5 p-5 sm:p-7">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-muted">Room code</span>
              <input
                value={joinCode}
                onChange={(event) =>
                  setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))
                }
                placeholder="e.g. 7K2QX9AB"
                maxLength={8}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                required
                disabled={loading}
                className="w-full rounded-xl border border-border bg-background px-4 py-4 text-center text-2xl font-black uppercase tracking-[0.3em] text-foreground outline-none transition placeholder:text-base placeholder:font-semibold placeholder:tracking-normal placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold text-muted">Your display name</span>
              <input
                value={joinName}
                onChange={(event) => setJoinName(event.target.value)}
                placeholder="Enter your name"
                maxLength={40}
                required
                disabled={loading}
                className="w-full rounded-xl border border-border bg-background px-4 py-3.5 text-sm text-foreground outline-none transition placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
              />
            </label>
          </div>

          <div className="flex flex-col gap-4 rounded-b-[28px] border-t border-border bg-foreground/[0.03] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
            <p className="text-xs leading-5 text-muted">
              You&apos;ll choose your football club in the lobby.
            </p>
            <button
              type="submit"
              disabled={loading || joinCode.length < 4 || !joinName.trim()}
              className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-48"
            >
              {loading ? (
                <>
                  <LoaderCircle size={19} className="animate-spin" /> Joining...
                </>
              ) : (
                <>
                  Join room <ArrowRight size={19} />
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="p-5 sm:px-7">
              <ErrorMessage message={error} />
            </div>
          )}
        </form>
      </section>
    );
  } else {
    // view === "room"
    let stage: ReactNode;

    if (!draft || !session) {
      stage = (
        <section className="mx-auto max-w-md py-24 text-center">
          <div className="flex flex-col items-center gap-4 text-muted">
            <LoaderCircle size={30} className="animate-spin text-accent-text" />
            <p className="text-sm">Connecting to the room...</p>
          </div>
        </section>
      );
    } else if (draft.status === "WAITING") {
      stage = (
        <Lobby
          draft={draft}
          seat={session.seat}
          teams={teams}
          loading={loading}
          error={error}
          connection={connection}
          copied={copied}
          categoryLabel={categoryLabel}
          roomCode={roomCode}
          onCopyCode={() => void copyText(roomCode, "code")}
          onCopyLink={() =>
            void copyText(
              `${window.location.origin}${window.location.pathname}?room=${roomCode}`,
              "link",
            )
          }
          onSelectClub={(id) => void selectClub(id)}
          onStart={() => void startDraft()}
        />
      );
    } else if (draft.status === "ACTIVE" && draft.current_event) {
      stage = (
        <DraftingView
          draft={draft}
          modeLabel="Online draft"
          categoryLabel={categoryLabel}
          loading={loading}
          error={error}
          canPick={isMyTurn}
          mySeat={seat}
          headline={isMyTurn ? "MAKE YOUR PICK." : "OPPONENT'S TURN."}
          subline={
            isMyTurn
              ? "Choose one player. The other joins your rival's squad."
              : `${currentName || "Your opponent"} is choosing. You'll see their pick the moment it lands.`
          }
          promptLabel={
            isMyTurn
              ? `${currentName}, choose your footballer`
              : `Waiting for ${currentName || "your opponent"} to choose`
          }
          footerNote="Synced live with your opponent"
          onPick={(player) => void choosePlayer(player)}
          onRefresh={() => void refreshDraft()}
        />
      );
    } else if (matchData) {
      stage = (
        <MatchCentreView
          matchData={matchData}
          draft={draft}
          matchMinute={matchMinute}
          matchFinished={matchFinished}
          matchHistory={matchHistory}
          loading={loading}
          error={error}
          mySeat={seat}
          canControl={isHost}
          controlNote={`Only ${hostDisplay} can start a rematch.`}
          resetLabel="Leave room"
          onWatchAgain={watchAgain}
          onRematch={() => void startMatch()}
          onReset={() => leaveRoom()}
          onShowPrevious={(match) => {
            showPreviousMatch(match);
            setError("");
          }}
        />
      );
    } else {
      stage = (
        <DraftCompleteView
          draft={draft}
          categoryLabel={categoryLabel}
          loading={loading}
          error={error}
          mySeat={seat}
          canStartMatch={isHost}
          waitingText={`Waiting for ${hostDisplay} to start the match...`}
          resetLabel="Leave room"
          onStartMatch={() => void startMatch()}
          onReset={() => leaveRoom()}
        />
      );
    }

    content = (
      <>
        <RoomBar
          roomCode={roomCode}
          connection={connection}
          name={seat === 1 ? draft?.player1_name : draft?.player2_name}
          isHost={isHost}
          onLeave={handleLeave}
        />
        {stage}
      </>
    );
  }

  return <DraftPageShell>{content}</DraftPageShell>;
}

/* ================================================================== */
/* Online-only components                                              */
/* ================================================================== */

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-6 flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-muted transition hover:border-accent-text/50 hover:text-foreground"
    >
      <ArrowLeft size={16} /> Back
    </button>
  );
}

function ConnectionChip({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: {
      label: "Connected",
      className: "border-accent/25 bg-accent/[0.07] text-accent-text",
      icon: <Wifi size={13} />,
    },
    reconnecting: {
      label: "Reconnecting...",
      className:
        "border-amber-500/30 bg-amber-400/[0.08] text-amber-600 dark:text-amber-300",
      icon: <LoaderCircle size={13} className="animate-spin" />,
    },
    offline: {
      label: "Connection lost · retrying",
      className:
        "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
      icon: <WifiOff size={13} />,
    },
  }[status];

  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold ${config.className}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function RoomBar({
  roomCode,
  connection,
  name,
  isHost,
  onLeave,
}: {
  roomCode: string;
  connection: ConnectionStatus;
  name?: string;
  isHost: boolean;
  onLeave: () => void;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <span className="rounded-lg bg-foreground/[0.06] px-3 py-1.5 text-xs font-black tracking-[0.2em] text-foreground/80">
          ROOM {roomCode || "—"}
        </span>
        {name && (
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
            {isHost && <Crown size={13} className="shrink-0 text-accent-text" />}
            <span className="truncate">
              Playing as <strong className="text-foreground">{name}</strong>
            </span>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ConnectionChip status={connection} />
        <button
          type="button"
          onClick={onLeave}
          className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-red-400/40 hover:text-red-600 dark:hover:text-red-300"
        >
          <LogOut size={13} /> Leave
        </button>
      </div>
    </div>
  );
}

function SeatCard({
  title,
  isHost,
  name,
  joined,
  team,
  isMe,
  canEditTeam,
  teams,
  otherTeamId,
  loading,
  onSelectClub,
}: {
  title: string;
  isHost: boolean;
  name: string;
  joined: boolean;
  team?: Team | null;
  isMe: boolean;
  canEditTeam: boolean;
  teams: Team[];
  otherTeamId: string;
  loading: boolean;
  onSelectClub: (id: string) => void;
}) {
  return (
    <div
      className={`rounded-[24px] border p-5 sm:p-6 ${
        isMe ? "border-accent/40 bg-accent/[0.04]" : "border-border bg-surface"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isHost
                ? "bg-accent/10 text-accent-text"
                : "bg-sky-400/10 text-sky-600 dark:text-sky-300"
            }`}
          >
            {isHost ? <Crown size={20} /> : <Users size={20} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{title}</p>
            {joined ? (
              <h3 className="truncate text-lg font-black">
                {name}
                {isMe && <span className="ml-2 text-xs font-bold text-accent-text">You</span>}
              </h3>
            ) : (
              <h3 className="text-lg font-black text-muted">Waiting for player...</h3>
            )}
          </div>
        </div>

        {joined ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-accent-text">
            <span className="h-2 w-2 rounded-full bg-accent-text" /> Joined
          </span>
        ) : (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-muted" /> Not joined
          </span>
        )}
      </div>

      {!joined ? (
        <div className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm text-muted">
          <Link2 size={18} /> Share the room code to invite a player
        </div>
      ) : canEditTeam ? (
        <div className="space-y-3">
          <TeamDropdown
            teams={teams}
            value={team ? String(team.id) : ""}
            placeholder="Select your club"
            disabled={loading}
            excludedId={otherTeamId}
            onChange={onSelectClub}
          />
          {!team && (
            <p className="text-xs text-amber-600 dark:text-amber-300">Choose a club so the draft can start.</p>
          )}
        </div>
      ) : team ? (
        <TeamBadge team={team} />
      ) : (
        <div className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm text-muted">
          <Shield size={18} /> Choosing a club...
        </div>
      )}
    </div>
  );
}

function Lobby({
  draft,
  seat,
  teams,
  loading,
  error,
  connection,
  copied,
  categoryLabel,
  roomCode,
  onCopyCode,
  onCopyLink,
  onSelectClub,
  onStart,
}: {
  draft: DraftState;
  seat: Seat;
  teams: Team[];
  loading: boolean;
  error: string;
  connection: ConnectionStatus;
  copied: "code" | "link" | null;
  categoryLabel: string;
  roomCode: string;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onSelectClub: (id: string) => void;
  onStart: () => void;
}) {
  const isHost = seat === 1;
  const guestJoined = !!cleanName(draft.player2_name);
  const bothTeams = !!draft.player1_team && !!draft.player2_team;
  const canStart = isHost && guestJoined && bothTeams && connection !== "offline";

  let hint = "";

  if (isHost) {
    if (!guestJoined) hint = "Waiting for a second player to join...";
    else if (!draft.player2_team) hint = `Waiting for ${draft.player2_name} to choose a club...`;
    else if (!draft.player1_team) hint = "Choose your club to continue.";
    else hint = "Both managers are ready. Start when you are.";
  } else if (!draft.player2_team) {
    hint = "Choose your football club below.";
  } else {
    hint = `Waiting for ${draft.player1_name} to start the draft...`;
  }

  return (
    <section className="mx-auto max-w-5xl py-8 sm:py-12">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text">
            <Users size={14} /> Waiting lobby
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
            {guestJoined ? "READY TO DRAFT." : "WAITING FOR PLAYER."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">{hint}</p>
        </div>
        <span className="rounded-full border border-border bg-foreground/[0.03] px-3 py-2 text-xs text-muted">
          {categoryLabel}
        </span>
      </div>

      <div className="mb-5 rounded-[24px] border border-border bg-surface p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Room code</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
          <span className="select-all text-4xl font-black tracking-[0.3em] text-accent-text sm:text-5xl">
            {roomCode || "········"}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onCopyCode}
              className="flex items-center gap-2 rounded-xl bg-accent px-4 py-3 text-sm font-black text-accent-ink transition hover:brightness-110"
            >
              {copied === "code" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "code" ? "Copied" : "Copy code"}
            </button>
            <button
              type="button"
              onClick={onCopyLink}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-semibold text-foreground/75 transition hover:bg-foreground/5"
            >
              {copied === "link" ? <Check size={16} /> : <Link2 size={16} />}
              {copied === "link" ? "Copied" : "Copy invite link"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <SeatCard
          title="Host"
          isHost
          name={draft.player1_name}
          joined
          team={draft.player1_team}
          isMe={seat === 1}
          canEditTeam={seat === 1}
          teams={teams}
          otherTeamId={draft.player2_team ? String(draft.player2_team.id) : ""}
          loading={loading}
          onSelectClub={onSelectClub}
        />
        <SeatCard
          title="Guest"
          isHost={false}
          name={draft.player2_name}
          joined={guestJoined}
          team={draft.player2_team}
          isMe={seat === 2}
          canEditTeam={seat === 2}
          teams={teams}
          otherTeamId={draft.player1_team ? String(draft.player1_team.id) : ""}
          loading={loading}
          onSelectClub={onSelectClub}
        />
      </div>

      <div className="mt-6 flex flex-col gap-4 rounded-[24px] border border-border bg-foreground/[0.03] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <ConnectionChip status={connection} />
          <span className="text-xs text-muted">{hint}</span>
        </div>

        {isHost ? (
          <button
            type="button"
            onClick={onStart}
            disabled={!canStart || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-7 py-4 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-56"
          >
            {loading ? (
              <>
                <LoaderCircle size={19} className="animate-spin" /> Working...
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" /> Start draft
              </>
            )}
          </button>
        ) : (
          <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-accent/25 bg-accent/[0.06] px-6 py-4 text-sm font-bold text-accent-text sm:w-auto">
            <LoaderCircle size={17} className="animate-spin" />
            Waiting for the host to start
          </div>
        )}
      </div>

      {error && (
        <div className="mt-5">
          <ErrorMessage message={error} />
        </div>
      )}
    </section>
  );
}