import { apiRequest } from "../_draft/draftShared";

export { ApiError } from "../_draft/draftShared";

/* ------------------------------------------------------------------ */
/* Stats                                                               */
/* ------------------------------------------------------------------ */

export const STAT_KEYS = [
  "finishing",
  "dribbling",
  "ball_control",
  "passing",
  "speed",
  "stamina",
  "physical",
  "defending",
  "heading",
  "goalkeeping",
] as const;

export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_META: Record<StatKey, { label: string }> = {
  finishing: { label: "Finishing" },
  dribbling: { label: "Dribbling" },
  ball_control: { label: "Ball Control" },
  passing: { label: "Passing" },
  speed: { label: "Speed" },
  stamina: { label: "Stamina" },
  physical: { label: "Physical" },
  defending: { label: "Defending" },
  heading: { label: "Heading" },
  goalkeeping: { label: "Goalkeeping" },
};

export type StatTier = "elite" | "great" | "good" | "low";

export function statTier(value: number): StatTier {
  if (value >= 90) return "elite";
  if (value >= 80) return "great";
  if (value >= 70) return "good";
  return "low";
}

/** The player's strongest stats (used for the star markers on a card). */
export function topStatKeys(stats: CardStats, count = 3): StatKey[] {
  return [...STAT_KEYS].sort((a, b) => stats[b] - stats[a]).slice(0, count);
}

/* ------------------------------------------------------------------ */
/* Types (these mirror the backend state)                              */
/* ------------------------------------------------------------------ */

export type Seat = 1 | 2;
export type CardStats = Record<StatKey, number>;

export type CardPlayer = {
  player_id: number;
  name: string;
  club: string;
  country: string;
  position: string;
  ovr_rating: number;
  category: string;
  image_url: string;
  stats: CardStats;
};

export type SideInfo = { seat: Seat; name: string; cards_left: number };

export type LastRound = {
  number: number;
  stat: StatKey;
  your_value: number;
  opponent_value: number;
  your_player: string | null;
  opponent_player: string | null;
  winner: "you" | "opponent" | "tie";
};

export type AvailableAction =
  | "wait_for_opponent"
  | "lock_stat"
  | "wait_for_challenger"
  | "wait_for_reveal"
  | "reveal"
  | "continue"
  | null;

export type GameState = {
  room_code: string;
  mode: "LOCAL" | "ONLINE";
  status: "WAITING" | "ACTIVE" | "FINISHED";
  phase: "CHOOSING" | "LOCKED" | "REVEALED";
  version: number;
  round_number: number;
  category: string;
  deck_size: number;
  you: SideInfo;
  opponent: SideInfo;
  pot_count: number;
  challenger_seat: Seat;
  you_are_challenger: boolean;
  locked_stat: StatKey | null;
  available_action: AvailableAction;
  my_card: CardPlayer | null;
  opponent_card: CardPlayer | null;
  last_round: LastRound | null;
  game_over: boolean;
  winner_seat: Seat | null;
  you_won: boolean | null;
  end_reason: "NO_CARDS" | "CONCEDED" | null;
};

type UnchangedState = { changed: false; version: number };

export type Pool = { key: string; label: string; count: number };

type CreateResponse = {
  room_code: string;
  mode: "LOCAL" | "ONLINE";
  tokens: Record<string, string>;
  state: GameState;
};

export const DECK_OPTIONS = [10, 15, 20, 25];

/* ------------------------------------------------------------------ */
/* Session (kept in localStorage so a refresh does not lose the game)  */
/* ------------------------------------------------------------------ */

export type CardsSession = {
  roomCode: string;
  mode: "LOCAL" | "ONLINE";
  seat: Seat; // online: your seat. local: always 1 (one device holds both tokens)
  tokens: Partial<Record<Seat, string>>;
};

const SESSION_KEY = "futgo_cards_session_v1";

export function loadSession(): CardsSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CardsSession>;
    if (
      typeof parsed.roomCode === "string" &&
      parsed.roomCode &&
      (parsed.mode === "LOCAL" || parsed.mode === "ONLINE") &&
      (parsed.seat === 1 || parsed.seat === 2) &&
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

export function saveSession(session: CardsSession) {
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

export function toTokens(
  raw: Record<string, string>,
): Partial<Record<Seat, string>> {
  const tokens: Partial<Record<Seat, string>> = {};
  if (raw["1"]) tokens[1] = raw["1"];
  if (raw["2"]) tokens[2] = raw["2"];
  return tokens;
}

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

const seatHeader = (token: string): Record<string, string> => ({
  "X-Seat-Token": token,
});

function post<T>(path: string, token: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: "POST",
    headers: seatHeader(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export const cardsApi = {
  pools: () => apiRequest<{ pools: Pool[] }>("/api/cards/pools/"),

  create: (body: {
    mode: "LOCAL" | "ONLINE";
    player1_name: string;
    player2_name?: string;
    category: string;
    deck_size: number;
  }) =>
    apiRequest<CreateResponse>("/api/cards/create/", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  join: (roomCode: string, playerName: string) =>
    apiRequest<CreateResponse>("/api/cards/join/", {
      method: "POST",
      body: JSON.stringify({ room_code: roomCode, player_name: playerName }),
    }),

  state: (roomCode: string, token: string, since?: number) =>
    apiRequest<GameState | UnchangedState>(
      `/api/cards/${roomCode}/state/${since !== undefined ? `?since=${since}` : ""}`,
      { headers: seatHeader(token) },
    ),

  lock: (roomCode: string, token: string, stat: StatKey) =>
    post<GameState>(`/api/cards/${roomCode}/lock/`, token, { stat }),

  reveal: (roomCode: string, token: string) =>
    post<GameState>(`/api/cards/${roomCode}/reveal/`, token),

  next: (roomCode: string, token: string) =>
    post<GameState>(`/api/cards/${roomCode}/continue/`, token),

  concede: (roomCode: string, token: string) =>
    post<GameState>(`/api/cards/${roomCode}/concede/`, token),
};

export function isUnchanged(
  result: GameState | UnchangedState,
): result is UnchangedState {
  return "changed" in result && result.changed === false;
}

/** Fetch the full state as a given seat (never returns the "unchanged" shortcut). */
export async function fetchFull(
  session: CardsSession,
  seat: Seat,
): Promise<GameState> {
  const token = session.tokens[seat];
  if (!token) throw new Error("Missing seat token for this game.");

  const result = await cardsApi.state(session.roomCode, token);
  if (isUnchanged(result)) throw new Error("Unexpected server response.");
  return result;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

/**
 * Whose view should the screen show? Online: always your own seat.
 * Local (one shared device): the challenger while choosing, the opponent
 * while they reveal, so a hidden card is never fetched for the wrong seat.
 */
export function viewSeatFor(state: GameState, session: CardsSession): Seat {
  if (session.mode === "ONLINE") return session.seat;
  return state.phase === "LOCKED"
    ? otherSeat(state.challenger_seat)
    : state.challenger_seat;
}

export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}