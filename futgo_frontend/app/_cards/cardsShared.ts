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

export type Seat = 1 | 2 | 3 | 4 | 5 | 6;
export const SEATS: Seat[] = [1, 2, 3, 4, 5, 6];
export type CardStats = Record<StatKey, number>;

/** Whole-card tier (Gold / Silver / Bronze), set by the backend. */
export type CardTier = "GOLD" | "SILVER" | "BRONZE";

export type CardPlayer = {
  player_id: number;
  name: string;
  club: string;
  country: string;
  position: string;
  ovr_rating: number;
  category: string;
  image_url: string;
  tier?: CardTier;
  stats: CardStats;
};

/**
 * A card shown face up on the round 1 deal screen: image, name and tier only.
 * It never carries stats.
 */
export type PreviewCard = {
  id: number;
  name: string;
  image?: string | null;
  tier: CardTier;
};

export type SideInfo = { seat: Seat; name: string; cards_left: number };

/** One seat in the room (online rooms hold 2 to 6 of these). */
export type PlayerInfo = SideInfo & {
  is_you: boolean;
  is_challenger: boolean;
  eliminated: boolean;
  /** Only filled while a stat is locked: has this seat shown its card yet? */
  has_revealed: boolean | null;
};

export type YouInfo = SideInfo & { eliminated?: boolean };

/** One card shown on the table in a clash (visible to everyone after the flip). */
export type TablePlay = {
  seat: Seat;
  name: string;
  player: string;
  value: number;
  card: CardPlayer;
};

/** One clash of a round. Clash 1 is the normal reveal, clash 2+ are tie-breaks. */
export type TableClash = {
  clash: number;
  outcome: "tie" | "winner";
  winner_seat: Seat | null;
  plays: TablePlay[]; // highest value first
};

export type LastRoundResult = {
  seat: Seat;
  name: string;
  player: string;
  value: number;
};

export type LastRound = {
  number: number;
  clash: number;
  stat: StatKey;
  your_value: number | null;
  /** Highest value among the other players. */
  opponent_value: number | null;
  your_player: string | null;
  opponent_player: string | null;
  winner: "you" | "opponent" | "tie";
  winner_seat: Seat | null;
  winner_name: string | null;
  tied_seats: Seat[];
  results: LastRoundResult[];
};

export type AvailableAction =
  | "wait_for_opponent"
  | "lock_stat"
  | "wait_for_challenger"
  | "wait_for_reveal"
  | "reveal"
  | "continue"
  | "eliminated"
  | null;

export type GameState = {
  room_code: string;
  mode: "LOCAL" | "ONLINE";
  status: "WAITING" | "ACTIVE" | "FINISHED";
  phase: "CHOOSING" | "LOCKED" | "REVEALED";
  version: number;
  round_number: number;
  /** 1 = normal reveal, 2+ = tie-break for the same locked stat. */
  clash_number: number;
  category: string;
  deck_size: number;
  max_players: number;
  seats_filled: number;
  players: PlayerInfo[];
  you: YouInfo;
  /** Only set in 2-player rooms (kept for the old screens). */
  opponent: SideInfo | null;
  pot_count: number;
  challenger_seat: Seat;
  you_are_challenger: boolean;
  /** Round 1 only: who the Kickoff Draw picked to lock first. */
  first_locker?: { seat: Seat; name: string } | null;
  locked_stat: StatKey | null;
  required_seats?: Seat[];
  tie_seats?: Seat[];
  /** Names of players who still have to reveal. */
  waiting_on?: string[];
  available_action: AvailableAction;
  my_card: CardPlayer | null;
  opponent_card: CardPlayer | null;
  /** After the flip: every clash of this round with all cards. */
  table?: TableClash[] | null;
  /** Face-down card ids by tier (challenger choosing, or responder picking). */
  hand?: Partial<Record<CardTier, number[]>> | null;
  /** Round 1 deal screen only: your own deck face up (image, name, tier). */
  hand_preview?: PreviewCard[] | null;
  /** Responder, while locked: tier of the challenger's card. */
  opponent_card_tier?: CardTier | null;
  /** Challenger, while choosing: id of the card currently shown to them. */
  current_card_id?: number | null;
  /** Challenger already swapped their card this round. */
  card_swapped?: boolean;
  /** Tiers this seat has already used its one manual pick on. */
  used_tiers?: CardTier[] | null;
  last_round: LastRound | null;
  game_over: boolean;
  winner_seat: Seat | null;
  winner_name?: string | null;
  you_won: boolean | null;
  end_reason: "NO_CARDS" | "CONCEDED" | null;
};

type UnchangedState = { changed: false; version: number };

export type Pool = { key: string; label: string; count: number };

type CreateResponse = {
  room_code: string;
  mode: "LOCAL" | "ONLINE";
  max_players?: number;
  /** Set by the join endpoint: the seat you were given. */
  seat?: Seat;
  tokens: Record<string, string>;
  state: GameState;
};

/** Cards per player. Must match ALLOWED_DECK_SIZES in the backend. */
export const DECK_OPTIONS = [10, 15, 20];

/** Players per online room. Must match ALLOWED_PLAYER_COUNTS in the backend. */
export const PLAYER_OPTIONS = [2, 3, 4, 5, 6];

/* ------------------------------------------------------------------ */
/* Session (kept in localStorage so a refresh does not lose the game)  */
/* ------------------------------------------------------------------ */

export type CardsSession = {
  roomCode: string;
  mode: "LOCAL" | "ONLINE";
  seat: Seat; // online: your seat. local: always 1 (one device holds both tokens)
  tokens: Partial<Record<Seat, string>>;
};

// v2: seats can now go up to 6, so old v1 sessions are ignored.
const SESSION_KEY = "futgo_cards_session_v2";

function isSeat(value: unknown): value is Seat {
  return (
    typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 6
  );
}

export function loadSession(): CardsSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<CardsSession>;
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
  for (const seat of SEATS) {
    const value = raw[String(seat)];
    if (value) tokens[seat] = value;
  }
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
  pools: () =>
    apiRequest<{
      pools: Pool[];
      player_counts?: number[];
      deck_sizes?: number[];
    }>("/api/cards/pools/"),

  create: (body: {
    mode: "LOCAL" | "ONLINE";
    player1_name: string;
    player2_name?: string;
    category: string;
    deck_size: number;
    max_players?: number;
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

  /** Challenger: swap the current card for a face-down card from the hand. */
  choose: (roomCode: string, token: string, cardId: number) =>
    post<GameState>(`/api/cards/${roomCode}/choose/`, token, { card_id: cardId }),

  /** Without cardId the top card is played; with it, a card from the hand. */
  reveal: (roomCode: string, token: string, cardId?: number) =>
    post<GameState>(
      `/api/cards/${roomCode}/reveal/`,
      token,
      cardId === undefined ? undefined : { card_id: cardId },
    ),

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

/** The other seat in a 2-player game (local play). */
export function otherSeat(seat: Seat): Seat {
  return seat === 1 ? 2 : 1;
}

/** Display name of a seat, from the players list. */
export function nameFor(state: GameState, seat: Seat): string {
  return state.players.find((p) => p.seat === seat)?.name ?? "";
}

/**
 * Whose view should the screen show? Online: always your own seat.
 * Local (one shared device, always 2 players): the challenger while choosing,
 * the opponent while they reveal, so a hidden card is never fetched for the
 * wrong seat.
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