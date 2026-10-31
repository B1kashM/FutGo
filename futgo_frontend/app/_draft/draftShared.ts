import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

/* ------------------------------------------------------------------ */
/* Playback speed (all values in milliseconds)                         */
/* ------------------------------------------------------------------ */

// How long one simulated match minute lasts on screen.
// Was 500 (a 90 minute match took ~45 seconds).
// 1000 doubles it: a 90 minute match now takes ~90 seconds,
// and 120 minutes (extra time) takes ~2 minutes.
export const MATCH_TICK_MS = 1000;

// Pause between pressing "Start Penalties" and the first shootout event.
export const PENALTY_FIRST_REVEAL_DELAY_MS = 900;

// Delay after a "steps up to take the penalty" event before the result
// (goal / save / miss) is revealed. This is the suspense moment.
export const PENALTY_RESULT_DELAY_MS = 2600;

// Delay after any other shootout event before the next one is revealed.
export const PENALTY_STEP_DELAY_MS = 1800;

export const DRAFT_CATEGORIES = [
  {
    value: "LEGENDS",
    label: "All-Time Legends",
    description: "Football's greatest icons",
    icon: "👑",
  },
  {
    value: "PREMIER_LEAGUE",
    label: "Premier League",
    description: "English football stars",
    icon: "🏴",
  },
  {
    value: "LA_LIGA",
    label: "La Liga",
    description: "Spanish football stars",
    icon: "🇪🇸",
  },
  {
    value: "YOUNG_TALENTS",
    label: "Young Talents",
    description: "The next generation",
    icon: "⚡",
  },
  {
    value: "TOP_5_LEAGUES",
    label: "Top 5 Leagues",
    description: "All stars",
    icon: "★",
  },
  {
    value: "ISL",
    label: "ISL",
    description: "Indian Super league",
    icon: "🇮🇳",
  },
] as const;

export type CategoryValue = (typeof DRAFT_CATEGORIES)[number]["value"];

export function getCategoryLabel(value?: string | null): string {
  return (
    DRAFT_CATEGORIES.find((category) => category.value === value)?.label ||
    "Selected category"
  );
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Team = {
  id: number;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  is_active?: boolean;
};

export type Player = {
  id: number;
  player_id?: number;
  name: string;
  club?: string | null;
  country?: string | null;
  position: string;
  category?: string;
  image_url?: string | null;
  ovr_rating?: number | null;
};

export type DraftEvent = {
  id?: number;
  event_number: number;
  active_player_number: number;
  required_position?: string;
  offered_players: Player[];
};

export type SquadItem = Player | { player: Player };

export type DraftState = {
  draft_id: number;
  mode: string;
  status: string;
  room_code?: string | null;
  player1_name: string;
  player2_name: string;
  player1_team?: Team | null;
  player2_team?: Team | null;
  teams_selected?: boolean;
  active_player_number: number;
  squad_size: number;
  category?: string;
  squads: {
    player1: SquadItem[];
    player2: SquadItem[];
  };
  current_event: DraftEvent | null;
};

export type MatchEvent = {
  event_number: number;
  minute: number;
  team_number: number;
  event_type: string;
  commentary: string;
  player?: Player | null;
  secondary_player?: Player | null;

  // Penalty shootout events include PENALTY_KICK (setup) and outcome events.
  // The setup event stores the shooter in player and goalkeeper in secondary_player.
  // Penalty shootout metadata
  penalty_round?: number | null;

  // 1-based kick number for the kicking team (1 = first penalty of that team).
  // Sent by the backend on PENALTY_KICK and PENALTY_GOAL/SAVE/MISS events.
  penalty_kick_number?: number | null;

  is_sudden_death?: boolean;

  // Optional score snapshot returned by the backend
  score_after?: {
    player1?: number;
    player2?: number;
    penalties?: {
      player1?: number;
      player2?: number;
    };
  } | null;
};

export type PenaltyAttempt = {
  round: number;
  team_number: number;
  kick_number?: number | null;
  shooter: Player | null;
  goalkeeper: Player | null;
  outcome: "GOAL" | "SAVE" | "MISS" | string;
  score: {
    1: number;
    2: number;
  };
  sudden_death: boolean;
};

export type PenaltyShootout = {
  team1_score: number;
  team2_score: number;
  winner_number: number;
  total_rounds: number;
  sudden_death: boolean;
  attempts: PenaltyAttempt[];
};

export type TeamStatistics = {
  team_number: number;
  possession: number;
  shots: number;
  shots_on_target: number;
  goals: number;
  fouls: number;
  corners: number;
  yellow_cards: number;
  red_cards: number;
  penalty_goals?: number;
  penalty_misses?: number;
};

export type PlayerRating = {
  player: Player;
  team_number: number;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  shots_on_target: number;
  saves: number;
  tackles: number;
  interceptions: number;
  yellow_cards: number;
  red_cards: number;
  penalty_goals?: number;
  penalty_misses?: number;
};

export type MatchResult = {
  match_id: number;
  id?: number;
  draft_id: number;
  status: string;
  duration_minutes: number;
  player1_name: string;
  player2_name: string;
  player1_score: number;
  player2_score: number;
  winner_number: number | null;
  winner_name?: string | null;
  is_draw: boolean;

  // Penalty shootout result
  penalties_played?: boolean;
  player1_penalty_score?: number | null;
  player2_penalty_score?: number | null;
  extra_time_played?: boolean;
  penalty_shootout?: PenaltyShootout | null;

  player1_team?: Team | null;
  player2_team?: Team | null;
  events: MatchEvent[];
  team_statistics?: TeamStatistics[];
  player_ratings?: PlayerRating[];
  man_of_the_match?: Player | null;
  created_at?: string;
};

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0,
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.detail ||
      data.error ||
      data.message ||
      Object.values(data).flat().join(" ") ||
      `Request failed (${response.status})`;

    throw new ApiError(String(message), response.status);
  }

  return data as T;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export function squadPlayers(items: SquadItem[] | undefined): Player[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    const raw =
      item && typeof item === "object" && "player" in item && item.player
        ? item.player
        : (item as Player);

    if ((raw.id === undefined || raw.id === null) && raw.player_id != null) {
      return { ...raw, id: raw.player_id };
    }

    return raw;
  });
}

export function getPlayerName(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }

  return "";
}

export function formatEventType(value: string): string {
  return (value || "MATCH EVENT")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatRating(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : null;
}

export function makeIdempotencyKey(): string {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `futgo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";

  const name = value.trim();
  const lower = name.toLowerCase();

  return name && lower !== "undefined" && lower !== "null" ? name : "";
}

/**
 * Prefer the backend's winner_number because regular-time scores can be
 * tied while a penalty shootout determines the actual winner.
 */
export function getWinnerName(match: MatchResult): string {
  const winner =
    match.winner_number !== null && match.winner_number !== undefined
      ? safeNumber(match.winner_number)
      : safeNumber(match.player1_score) > safeNumber(match.player2_score)
        ? 1
        : safeNumber(match.player2_score) > safeNumber(match.player1_score)
          ? 2
          : 0;

  if (winner === 1) {
    return (
      cleanName(match.player1_name) ||
      cleanName(match.winner_name) ||
      "Player 1"
    );
  }

  if (winner === 2) {
    return (
      cleanName(match.player2_name) ||
      cleanName(match.winner_name) ||
      "Player 2"
    );
  }

  return cleanName(match.winner_name);
}

export function getTeamName(team?: Team | null): string {
  return cleanName(team?.name);
}

export function hasPenaltyShootout(
  match: MatchResult | null | undefined,
): boolean {
  if (!match) return false;

  return (
    match.penalties_played === true ||
    (match.player1_penalty_score !== null &&
      match.player1_penalty_score !== undefined &&
      match.player2_penalty_score !== null &&
      match.player2_penalty_score !== undefined) ||
    !!match.penalty_shootout
  );
}

export function getPenaltyScore(
  match: MatchResult,
  teamNumber: 1 | 2,
): number {
  const directScore =
    teamNumber === 1
      ? match.player1_penalty_score
      : match.player2_penalty_score;

  if (directScore !== null && directScore !== undefined) {
    return safeNumber(directScore);
  }

  return safeNumber(
    teamNumber === 1
      ? match.penalty_shootout?.team1_score
      : match.penalty_shootout?.team2_score,
  );
}

export function getPenaltyAttempts(
  match: MatchResult | null | undefined,
): PenaltyAttempt[] {
  if (!match) return [];

  if (Array.isArray(match.penalty_shootout?.attempts)) {
    return match.penalty_shootout.attempts;
  }

  return [];
}

/* ------------------------------------------------------------------ */
/* Match duration helpers                                              */
/* ------------------------------------------------------------------ */

export const REGULAR_TIME_END = 90;
export const EXTRA_TIME_END = 120;

export function eventTypeKey(event: MatchEvent): string {
  return (event.event_type || "").toUpperCase();
}

export function isExtraTimeStartType(type: string): boolean {
  return type.includes("EXTRA_TIME_START") || type.includes("EXTRATIMESTART");
}

export function isExtraTimeBreakType(type: string): boolean {
  return type.includes("EXTRA_TIME_HALF") || type.includes("EXTRATIMEHALF");
}

export function isHalfTimeType(type: string): boolean {
  return (
    !isExtraTimeBreakType(type) &&
    (type.includes("HALF_TIME") || type.includes("HALFTIME"))
  );
}

export function isFullTimeType(type: string): boolean {
  return type.includes("FULL_TIME") || type.includes("FULLTIME");
}

export function isPenaltyEventType(type: string): boolean {
  return type.startsWith("PENALTY_");
}

export function isPenaltyKickType(type: string): boolean {
  return type === "PENALTY_KICK";
}

export function isPenaltyGoalType(type: string): boolean {
  return type === "PENALTY_GOAL";
}

export function isPenaltySaveType(type: string): boolean {
  return type === "PENALTY_SAVE";
}

export function isPenaltyMissType(type: string): boolean {
  return type === "PENALTY_MISS";
}

/** True for the event that carries the result of one kick. */
export function isPenaltyResultType(type: string): boolean {
  return (
    isPenaltyGoalType(type) ||
    isPenaltySaveType(type) ||
    isPenaltyMissType(type)
  );
}

export function isPenaltyShootoutStartType(type: string): boolean {
  return type === "PENALTY_SHOOTOUT_START";
}

export function isPenaltyShootoutEndType(type: string): boolean {
  return type === "PENALTY_SHOOTOUT_END";
}

export function getMatchEndMinute(
  match: MatchResult | null | undefined,
): number {
  if (!match || !Array.isArray(match.events)) return REGULAR_TIME_END;

  return match.events.some((event) =>
    isExtraTimeStartType(eventTypeKey(event)),
  )
    ? EXTRA_TIME_END
    : REGULAR_TIME_END;
}

/**
 * "none"     - no shootout, or not relevant right now
 * "awaiting" - extra time is over, waiting for the user to press Start Penalties
 * "live"     - the shootout is being revealed
 */
export type PenaltyStage = "none" | "awaiting" | "live";

export function getMatchStatusLabel(
  minute: number,
  finished: boolean,
  extraTime: boolean,
  penaltyStage: PenaltyStage = "none",
): string {
  if (finished) return "Full time";
  if (penaltyStage === "awaiting") return "Level after extra time";
  if (penaltyStage === "live") return "Penalty shootout";
  if (minute < 45) return `${minute}' · First half`;
  if (minute === 45) return "Half-time";

  if (!extraTime || minute < REGULAR_TIME_END) {
    return `${minute}' · Second half`;
  }

  if (minute === REGULAR_TIME_END) return "Extra time begins";
  if (minute < 105) return `${minute}' · Extra time`;
  if (minute === 105) return "Extra-time break";

  return `${minute}' · Extra time`;
}

/* ------------------------------------------------------------------ */
/* Penalty tracker                                                     */
/* ------------------------------------------------------------------ */

export type PenaltySlotState =
  | "empty" // kick not taken yet
  | "pending" // shooter is stepping up, result not revealed
  | "goal"
  | "save"
  | "miss";

export type PenaltyTrackerData = {
  slotCount: number;
  team1: PenaltySlotState[];
  team2: PenaltySlotState[];
  // Team whose kick is currently waiting for a result (or null).
  activeTeam: 1 | 2 | null;
};

/**
 * Builds the two rows of penalty circles from the shootout events that
 * have been revealed so far.
 *
 * Every team starts with `minSlots` (5) empty circles. Each revealed kick
 * fills its circle: green for a goal, red for a save or miss. If the
 * shootout goes to sudden death, extra circles are added to both rows.
 */
export function buildPenaltyTracker(
  revealedEvents: MatchEvent[],
  minSlots = 5,
): PenaltyTrackerData {
  const rows: Record<1 | 2, PenaltySlotState[]> = { 1: [], 2: [] };
  const setupCount: Record<1 | 2, number> = { 1: 0, 2: 0 };
  const resultCount: Record<1 | 2, number> = { 1: 0, 2: 0 };

  let lastPenaltyType = "";
  let lastPenaltyTeam: 1 | 2 | null = null;

  const setSlot = (team: 1 | 2, index: number, state: PenaltySlotState) => {
    const row = rows[team];
    while (row.length <= index) row.push("empty");
    row[index] = state;
  };

  revealedEvents.forEach((event) => {
    const type = eventTypeKey(event);
    const team = safeNumber(event.team_number);

    if (team !== 1 && team !== 2) return;

    if (isPenaltyKickType(type)) {
      const index =
        event.penalty_kick_number != null
          ? safeNumber(event.penalty_kick_number) - 1
          : setupCount[team];

      setupCount[team] += 1;
      setSlot(team, Math.max(0, index), "pending");
      lastPenaltyType = type;
      lastPenaltyTeam = team;
      return;
    }

    if (isPenaltyResultType(type)) {
      const index =
        event.penalty_kick_number != null
          ? safeNumber(event.penalty_kick_number) - 1
          : resultCount[team];

      resultCount[team] += 1;

      setSlot(
        team,
        Math.max(0, index),
        isPenaltyGoalType(type)
          ? "goal"
          : isPenaltySaveType(type)
            ? "save"
            : "miss",
      );

      lastPenaltyType = type;
      lastPenaltyTeam = team;
    }
  });

  const slotCount = Math.max(minSlots, rows[1].length, rows[2].length);

  const pad = (row: PenaltySlotState[]) => {
    const padded = [...row];
    while (padded.length < slotCount) padded.push("empty");
    return padded;
  };

  return {
    slotCount,
    team1: pad(rows[1]),
    team2: pad(rows[2]),
    activeTeam: isPenaltyKickType(lastPenaltyType) ? lastPenaltyTeam : null,
  };
}

/* ------------------------------------------------------------------ */
/* Match normalization                                                 */
/* ------------------------------------------------------------------ */

type TeamFallback = {
  player1_team?: Team | null;
  player2_team?: Team | null;
};

export function normalizeMatch(
  result: MatchResult,
  fallback?: TeamFallback,
): MatchResult {
  return {
    ...result,
    match_id: result.match_id ?? result.id ?? 0,
    player1_team: result.player1_team || fallback?.player1_team || null,
    player2_team: result.player2_team || fallback?.player2_team || null,
    events: Array.isArray(result.events)
      ? [...result.events].sort(
          (a, b) =>
            safeNumber(a.minute) - safeNumber(b.minute) ||
            safeNumber(a.event_number) - safeNumber(b.event_number),
        )
      : [],
    team_statistics: Array.isArray(result.team_statistics)
      ? result.team_statistics
      : [],
    player_ratings: Array.isArray(result.player_ratings)
      ? result.player_ratings
      : [],
    penalty_shootout: result.penalty_shootout
      ? {
          ...result.penalty_shootout,
          attempts: Array.isArray(result.penalty_shootout.attempts)
            ? result.penalty_shootout.attempts
            : [],
        }
      : null,
  };
}

/* ------------------------------------------------------------------ */
/* Match playback hook                                                 */
/* ------------------------------------------------------------------ */

export function useMatchPlayback() {
  const [matchData, setMatchData] = useState<MatchResult | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [matchMinute, setMatchMinute] = useState(0);
  const [matchFinished, setMatchFinished] = useState(false);

  const matchEndMinute = useMemo(
    () => getMatchEndMinute(matchData),
    [matchData],
  );

  const pushHistory = (match: MatchResult) => {
    setMatchHistory((history) => [
      match,
      ...history.filter((item) => item.match_id !== match.match_id),
    ]);
  };

  const playMatch = useCallback(
    (result: MatchResult, fallback?: TeamFallback): MatchResult => {
      const normalized = normalizeMatch(result, fallback);
      setMatchData(normalized);
      pushHistory(normalized);
      setMatchMinute(0);
      setMatchFinished(false);
      return normalized;
    },
    [],
  );

  const loadFinishedMatch = useCallback(
    (result: MatchResult, fallback?: TeamFallback): MatchResult => {
      const normalized = normalizeMatch(result, fallback);
      setMatchData(normalized);
      pushHistory(normalized);
      setMatchMinute(getMatchEndMinute(normalized));
      setMatchFinished(true);
      return normalized;
    },
    [],
  );

  const watchAgain = useCallback(() => {
    setMatchMinute(0);
    setMatchFinished(false);
  }, []);

  const showPreviousMatch = useCallback((match: MatchResult) => {
    setMatchData(match);
    setMatchMinute(getMatchEndMinute(match));
    setMatchFinished(true);
  }, []);

  const clearMatches = useCallback(() => {
    setMatchData(null);
    setMatchHistory([]);
    setMatchMinute(0);
    setMatchFinished(false);
  }, []);

  useEffect(() => {
    if (!matchData || matchFinished) return undefined;

    // One match minute per MATCH_TICK_MS (slowed down from 500ms).
    const timer = window.setInterval(() => {
      setMatchMinute((minute) => Math.min(minute + 1, matchEndMinute));
    }, MATCH_TICK_MS);

    return () => window.clearInterval(timer);
  }, [matchData, matchFinished, matchEndMinute]);

  useEffect(() => {
    if (matchData && !matchFinished && matchMinute >= matchEndMinute) {
      setMatchFinished(true);
    }
  }, [matchData, matchFinished, matchMinute, matchEndMinute]);

  return {
    matchData,
    matchHistory,
    matchMinute,
    matchFinished,
    playMatch,
    loadFinishedMatch,
    watchAgain,
    showPreviousMatch,
    clearMatches,
  };
}

/* ------------------------------------------------------------------ */
/* Pitch formation                                                     */
/* ------------------------------------------------------------------ */

export type SlotCode =
  | "GK"
  | "LB"
  | "LCB"
  | "RCB"
  | "RB"
  | "CMF"
  | "DMF"
  | "AMF"
  | "LWF"
  | "ST"
  | "RWF";

export type Slot = { code: SlotCode; x: string; y: string };

export const FORMATION: Slot[] = [
  { code: "GK", x: "50%", y: "91%" },
  { code: "LB", x: "17%", y: "71%" },
  { code: "LCB", x: "39%", y: "71%" },
  { code: "RCB", x: "61%", y: "71%" },
  { code: "RB", x: "83%", y: "71%" },
  { code: "CMF", x: "25%", y: "51%" },
  { code: "DMF", x: "50%", y: "51%" },
  { code: "AMF", x: "75%", y: "51%" },
  { code: "LWF", x: "20%", y: "28%" },
  { code: "ST", x: "50%", y: "21%" },
  { code: "RWF", x: "80%", y: "28%" },
];

const GROUPS: Record<string, SlotCode[]> = {
  GK: ["GK"],
  DEF: ["LB", "LCB", "RCB", "RB"],
  MID: ["DMF", "CMF", "AMF"],
  FWD: ["LWF", "ST", "RWF"],
};

const ALIASES: Record<string, string> = {
  GK: "GK",
  GOALKEEPER: "GK",
  LB: "LB",
  LCB: "LCB",
  RCB: "RCB",
  RB: "RB",
  CB: "DEF",
  DEF: "DEF",
  DEFENDER: "DEF",
  DMF: "DMF",
  CMF: "CMF",
  AMF: "AMF",
  MID: "MID",
  MIDFIELDER: "MID",
  LWF: "LWF",
  RWF: "RWF",
  ST: "ST",
  CF: "ST",
  SS: "ST",
  STRIKER: "ST",
  FWD: "FWD",
  FORWARD: "FWD",
};

export function normalizePosition(position: string): string {
  const key = (position ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return ALIASES[key] ?? "";
}

function groupOf(code: string): string {
  for (const [group, codes] of Object.entries(GROUPS)) {
    if (group === code || (codes as string[]).includes(code)) return group;
  }

  return code;
}

export function assignToFormation(players: Player[]): (Player | null)[] {
  const slots: (Player | null)[] = Array(FORMATION.length).fill(null);
  const placed = new Set<number>();

  const place = (matches: (slot: Slot, playerCode: string) => boolean) => {
    players.forEach((player, playerIndex) => {
      if (placed.has(playerIndex)) return;

      const code = normalizePosition(player.position);
      const slotIndex = FORMATION.findIndex(
        (slot, index) => slots[index] === null && matches(slot, code),
      );

      if (slotIndex >= 0) {
        slots[slotIndex] = player;
        placed.add(playerIndex);
      }
    });
  };

  place((slot, code) => !!code && slot.code === code);
  place((slot, code) => !!code && groupOf(slot.code) === groupOf(code));
  place(() => true);

  return slots;
}