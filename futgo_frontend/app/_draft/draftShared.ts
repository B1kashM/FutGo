import { useCallback, useEffect, useMemo, useState } from "react";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

export const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

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
  /** Squad items from the backend use player_id instead of id. */
  player_id?: number;
  name: string;
  club?: string | null;
  country?: string | null;
  position: string;
  category?: string;
  image_url?: string | null;
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
};

export type MatchResult = {
  /** The backend sends both `id` and `match_id`; normalizeMatch fills gaps. */
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
    // status 0 = the request never reached the server
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

export function getWinnerName(match: MatchResult): string {
  const score1 = safeNumber(match.player1_score);
  const score2 = safeNumber(match.player2_score);
  const winner =
    score1 > score2 ? 1 : score2 > score1 ? 2 : safeNumber(match.winner_number);

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

export function getMatchStatusLabel(
  minute: number,
  finished: boolean,
  extraTime: boolean,
): string {
  if (finished) return "Full time";
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
  };
}

/* ------------------------------------------------------------------ */
/* Match playback hook (clock, history, replay)                        */
/* ------------------------------------------------------------------ */

export function useMatchPlayback() {
  const [matchData, setMatchData] = useState<MatchResult | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [matchMinute, setMatchMinute] = useState(0);
  const [matchFinished, setMatchFinished] = useState(false);

  const matchEndMinute = useMemo(() => getMatchEndMinute(matchData), [matchData]);

  const pushHistory = (match: MatchResult) => {
    setMatchHistory((history) => [
      match,
      ...history.filter((item) => item.match_id !== match.match_id),
    ]);
  };

  /** Show a new match and animate it from minute 0. */
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

  /** Show an existing match straight at full time (e.g. after a refresh). */
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

    const timer = window.setInterval(() => {
      setMatchMinute((minute) => Math.min(minute + 1, matchEndMinute));
    }, 500);

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