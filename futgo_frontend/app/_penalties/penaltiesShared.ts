import { apiRequest } from "../_draft/draftShared";

export { ApiError } from "../_draft/draftShared";

/* ------------------------------------------------------------------ */
/* Zones (the six places a penalty can go)                             */
/* ------------------------------------------------------------------ */

export type ZoneKey = "LEFT" | "CENTER" | "RIGHT";

export const ZONE_KEYS: ZoneKey[] = ["LEFT", "CENTER", "RIGHT"];

export const ZONE_LAYOUT: Record<
  ZoneKey,
  { col: number; row: number; label: string; short: string }
> = {
  LEFT: { col: 0, row: 0, label: "Left", short: "L" },
  CENTER: { col: 1, row: 0, label: "Center", short: "C" },
  RIGHT: { col: 2, row: 0, label: "Right", short: "R" },
};

export type Outcome = "GOAL" | "SAVED" | "POST" | "BAR" | "WIDE" | "OVER";

export const OUTCOME_META: Record<Outcome, { title: string; short: string; scored: boolean }> = {
  GOAL: { title: "GOAL!", short: "Scored", scored: true },
  SAVED: { title: "SAVED!", short: "Saved", scored: false },
  POST: { title: "OFF THE POST!", short: "Hit the post", scored: false },
  BAR: { title: "OFF THE BAR!", short: "Hit the bar", scored: false },
  WIDE: { title: "WIDE!", short: "Missed wide", scored: false },
  OVER: { title: "OVER THE BAR!", short: "Missed over", scored: false },
};

/** Squad slots in draft order (same as the Draft game). */
export const SLOT_ORDER = [
  "GK", "RB", "RCB", "LCB", "LB", "DMF", "CMF", "AMF", "RWF", "ST", "LWF",
] as const;

/* ------------------------------------------------------------------ */
/* Types (these mirror the backend state)                              */
/* ------------------------------------------------------------------ */

export type Seat = 1 | 2 | 3 | 4 | 5 | 6;
export const SEATS: Seat[] = [1, 2, 3, 4, 5, 6];

export const PLAYER_OPTIONS = [2, 3, 4, 5, 6];

export type SquadPlayer = {
  player_id: number;
  name: string;
  club: string;
  country: string;
  slot: string;
  natural_position: string;
  ovr_rating: number;
  category: string;
  image_url: string | null;
};

export type KickPerson = { player_id: number; name: string; image_url: string | null };

export type Kick = {
  number: number;
  round: number;
  sudden_death: boolean;
  seat: Seat;
  team_name: string;
  shooter: KickPerson;
  keeper: KickPerson;
  shot_zone: ZoneKey;
  dive_zone: ZoneKey;
  outcome: Outcome;
  scored: boolean;
  commentary: string;
  score_a: number;
  score_b: number;
};

export type KickMark = {
  number: number;
  round: number;
  seat: Seat;
  outcome: Outcome;
  sudden_death: boolean;
};

export type CurrentKick = {
  attacker_seat: Seat;
  attacker_name: string;
  keeper_seat: Seat;
  keeper_name: string;
  shooter: SquadPlayer;
  keeper: SquadPlayer;
  kick_number: number;
  shootout_round: number;
  sudden_death: boolean;
  /** Only "has the shooter chosen?" is sent, never the zone itself. */
  shot_locked: boolean;
};

export type MatchBrief = {
  id: number;
  round_number: number;
  round_name: string;
  match_number: number;
  seat_a: Seat;
  seat_b: Seat;
  name_a: string;
  name_b: string;
  score_a: number;
  score_b: number;
  kicks_a: number;
  kicks_b: number;
  status: "ACTIVE" | "FINISHED";
  winner_seat: Seat | null;
  winner_name: string | null;
  end_reason: string | null;
};

export type MatchDetail = MatchBrief & {
  phase: "SHOOT" | "DIVE" | "DONE";
  first_seat: Seat;
  opponent_seat: Seat | null;
  opponent_name: string | null;
  kicks: KickMark[];
  last_kick: Kick | null;
  current: CurrentKick | null;
};

export type BracketRound = {
  round_number: number;
  round_name: string;
  matches: MatchBrief[];
};

export type DraftInfo = {
  step: number;
  total_steps: number;
  position: string;
  order: Seat[];
  picker_seat: Seat;
  picker_name: string;
  you_are_picker: boolean;
  offers: SquadPlayer[];
};

export type AvailableAction =
  | "wait_for_players"
  | "pick_player"
  | "wait_for_pick"
  | "shoot"
  | "wait_for_shot"
  | "dive"
  | "wait_for_keeper"
  | "eliminated"
  | "wait_for_next_round"
  | null;

export type RoomPlayer = { seat: Seat; name: string; is_you: boolean; eliminated: boolean };

export type GameState = {
  room_code: string;
  mode: "LOCAL" | "ONLINE";
  status: "WAITING" | "SQUAD" | "ACTIVE" | "FINISHED";
  squad_mode: "RANDOM" | "DRAFT";
  category: string;
  max_players: number;
  seats_filled: number;
  version: number;
  players: RoomPlayer[];
  you: { seat: Seat; name: string; eliminated: boolean };
  available_action: AvailableAction;
  round_number: number;
  round_name: string | null;
  bye_seats: Seat[];
  champion_seat: Seat | null;
  champion_name: string | null;
  you_are_champion: boolean | null;
  game_over: boolean;
  end_reason: string | null;
  squad: SquadPlayer[];
  squads: Record<string, SquadPlayer[]> | null;
  draft: DraftInfo | null;
  bracket: BracketRound[] | null;
  match: MatchDetail | null;
};

type UnchangedState = { changed: false; version: number };

export type Pool = { key: string; label: string; count: number };

export type PoolsResponse = {
  pools: Pool[];
  squad_modes: { key: string; label: string }[];
  player_counts: number[];
};

export type CreateBody = {
  mode: "LOCAL" | "ONLINE";
  squad_mode: "RANDOM" | "DRAFT";
  player1_name: string;
  player2_name?: string;
  category: string;
  max_players: number;
};

export type CreateResponse = {
  room_code: string;
  tokens?: Record<string, string>; // local games
  seat?: Seat; // online games
  token?: string; // online games
  state: GameState;
};

/* ------------------------------------------------------------------ */
/* Session (kept in localStorage so a refresh does not lose the game)  */
/* ------------------------------------------------------------------ */

export type PenaltySession = {
  roomCode: string;
  mode: "LOCAL" | "ONLINE";
  seat: Seat; // online: your seat. local: always 1 (one phone holds both tokens)
  tokens: Partial<Record<Seat, string>>;
};

const SESSION_KEY = "futgo_penalties_session_v1";

function isSeat(value: unknown): value is Seat {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function loadSession(): PenaltySession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PenaltySession>;
    if (
      typeof parsed.roomCode === "string" &&
      parsed.roomCode &&
      (parsed.mode === "LOCAL" || parsed.mode === "ONLINE") &&
      isSeat(parsed.seat) &&
      parsed.tokens &&
      typeof parsed.tokens === "object"
    ) {
      return {
        roomCode: parsed.roomCode,
        mode: parsed.mode,
        seat: parsed.seat,
        tokens: parsed.tokens,
      };
    }
  } catch {
    /* ignore unreadable storage */
  }
  return null;
}

export function saveSession(session: PenaltySession) {
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function toTokens(raw: Record<string, string>): Partial<Record<Seat, string>> {
  const tokens: Partial<Record<Seat, string>> = {};
  for (const seat of SEATS) {
    const value = raw[String(seat)];
    if (value) tokens[seat] = value;
  }
  return tokens;
}

export function sessionFromResponse(
  res: CreateResponse,
  mode: "LOCAL" | "ONLINE",
): PenaltySession {
  if (mode === "LOCAL") {
    return { roomCode: res.room_code, mode, seat: 1, tokens: toTokens(res.tokens ?? {}) };
  }
  const seat: Seat = res.seat ?? 1;
  const tokens: Partial<Record<Seat, string>> = {};
  if (res.token) tokens[seat] = res.token;
  return { roomCode: res.room_code, mode, seat, tokens };
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const tokenHeader = (token: string): Record<string, string> => ({
  "X-Participant-Token": token,
});

function post<T>(path: string, token: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: tokenHeader(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const base = (roomCode: string) => `/api/penalties/games/${roomCode.toUpperCase()}`;

export const penaltiesApi = {
  pools: () => apiRequest<PoolsResponse>("/api/penalties/pools/"),

  create: (body: CreateBody) =>
    apiRequest<CreateResponse>("/api/penalties/games/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  join: (roomCode: string, playerName: string) =>
    apiRequest<CreateResponse>(`${base(roomCode)}/join/`, {
      method: "POST",
      body: JSON.stringify({ player_name: playerName }),
    }),

  state: (roomCode: string, token: string, since?: number) =>
    apiRequest<GameState | UnchangedState>(
      `${base(roomCode)}/${since !== undefined ? `?since=${since}` : ""}`,
      { headers: tokenHeader(token) },
    ),

  pick: (roomCode: string, token: string, playerId: number) =>
    post<GameState>(`${base(roomCode)}/pick/`, token, { player_id: playerId }),

  shoot: (roomCode: string, token: string, zone: ZoneKey) =>
    post<GameState>(`${base(roomCode)}/shoot/`, token, { zone }),

  dive: (roomCode: string, token: string, zone: ZoneKey) =>
    post<GameState>(`${base(roomCode)}/dive/`, token, { zone }),

  concede: (roomCode: string, token: string) =>
    post<GameState>(`${base(roomCode)}/concede/`, token),
};

export function isUnchanged(result: GameState | UnchangedState): result is UnchangedState {
  return "changed" in result && result.changed === false;
}

/** Fetch the full state as a given seat (never returns the "unchanged" shortcut). */
export async function fetchFull(session: PenaltySession, seat: Seat): Promise<GameState> {
  const token = session.tokens[seat];
  if (!token) throw new Error("Missing seat token for this game.");
  const result = await penaltiesApi.state(session.roomCode, token);
  if (isUnchanged(result)) throw new Error("Unexpected server response.");
  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function nameFor(state: GameState, seat: Seat): string {
  return state.players.find((p) => p.seat === seat)?.name ?? "";
}

/**
 * Local play (one shared phone): whose turn is it right now?
 * The draft picker, then the shooter, then the keeper.
 */
export function actingSeatOf(state: GameState): Seat | null {
  if (state.status === "SQUAD" && state.draft) return state.draft.picker_seat;
  const match = state.match;
  if (state.status === "ACTIVE" && match && match.status === "ACTIVE" && match.current) {
    return match.phase === "SHOOT" ? match.current.attacker_seat : match.current.keeper_seat;
  }
  return null;
}

export function bracketHint(players: number): string {
  switch (players) {
    case 2:
      return "One final";
    case 3:
      return "Semi-final + final (one player gets a bye)";
    case 4:
      return "2 semi-finals + final";
    case 5:
      return "Quarter-final, 2 semi-finals, final (3 byes)";
    default:
      return "2 quarter-finals, 2 semi-finals, final (2 byes)";
  }
}

export type TrackerSlot = "empty" | "pending" | "goal" | "saved" | "miss";

/** Rows of circles for the two sides (five each, more in sudden death). */
export function buildTracker(match: MatchDetail) {
  const row = (seat: Seat): TrackerSlot[] =>
    match.kicks
      .filter((k) => k.seat === seat)
      .sort((x, y) => x.number - y.number)
      .map((k) => (k.outcome === "GOAL" ? "goal" : k.outcome === "SAVED" ? "saved" : "miss"));

  const a = row(match.seat_a);
  const b = row(match.seat_b);

  const attacker = match.status === "ACTIVE" ? match.current?.attacker_seat : undefined;
  if (attacker === match.seat_a) a.push("pending");
  else if (attacker === match.seat_b) b.push("pending");

  const slotCount = Math.max(5, a.length, b.length);
  const pad = (r: TrackerSlot[]) => {
    const copy = [...r];
    while (copy.length < slotCount) copy.push("empty");
    return copy;
  };

  return { slotCount, a: pad(a), b: pad(b) };
}