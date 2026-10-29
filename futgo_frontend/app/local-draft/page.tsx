"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Crown,
  LoaderCircle,
  RotateCcw,
  Shield,
  Sparkles,
  Users,
  Zap,
  Trophy,
  Clock3,
  Goal,
  Flag,
  Play,
  Activity,
  Target,
  Footprints,
  ChartNoAxesCombined,
  RefreshCw,
  Medal,
  Timer,
  BarChart3,
} from "lucide-react";

const API_BASE = (
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const LIME = "#b9f36b";

const DRAFT_CATEGORIES = [
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
] as const;

type CategoryValue = (typeof DRAFT_CATEGORIES)[number]["value"];

type Player = {
  id: number;
  name: string;
  club?: string | null;
  country?: string | null;
  position: string;
  category?: string;
  image_url?: string | null;
};

type DraftEvent = {
  event_number: number;
  active_player_number: number;
  offered_players: Player[];
};

type SquadItem = Player | { player: Player };

type DraftState = {
  draft_id: number;
  mode: string;
  status: string;
  player1_name: string;
  player2_name: string;
  active_player_number: number;
  squad_size: number;
  category?: string;
  squads: {
    player1: SquadItem[];
    player2: SquadItem[];
  };
  current_event: DraftEvent | null;
};

type MatchEvent = {
  event_number: number;
  minute: number;
  team_number: number;
  event_type: string;
  commentary: string;
  player?: Player | null;
  secondary_player?: Player | null;
  score1_after?: number;
  score2_after?: number;
};

type TeamStatistics = {
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

type PlayerRating = {
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

type MatchResult = {
  match_id: number;
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
  events: MatchEvent[];
  team_statistics?: TeamStatistics[];
  player_ratings?: PlayerRating[];
  man_of_the_match?: Player | null;
  created_at?: string;
};

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.detail ||
      data.error ||
      data.message ||
      Object.values(data).flat().join(" ") ||
      `Request failed (${response.status})`;

    throw new Error(String(message));
  }

  return data as T;
}

function squadPlayers(items: SquadItem[] | undefined): Player[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => {
    if (item && typeof item === "object" && "player" in item && item.player) {
      return item.player;
    }

    return item as Player;
  });
}

function getPlayerName(value: unknown): string {
  if (typeof value === "string") return value;

  if (value && typeof value === "object" && "name" in value) {
    const name = (value as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }

  return "";
}

function formatEventType(value: string): string {
  return (value || "MATCH EVENT")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Returns a formatted rating, or null when the value is missing / invalid.
function formatRating(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : null;
}

function makeIdempotencyKey(): string {
  if (
    typeof window !== "undefined" &&
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return `futgo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cleanName(value: unknown): string {
  if (typeof value !== "string") return "";

  const name = value.trim();
  const lower = name.toLowerCase();

  return name && lower !== "undefined" && lower !== "null" ? name : "";
}

// Winner is decided by the saved scores, so a missing or odd winner_name /
// winner_number from the API can never produce "undefined".
function getWinnerName(match: MatchResult): string {
  const score1 = safeNumber(match.player1_score);
  const score2 = safeNumber(match.player2_score);
  const winner =
    score1 > score2 ? 1 : score2 > score1 ? 2 : safeNumber(match.winner_number);

  if (winner === 1) {
    return cleanName(match.player1_name) || cleanName(match.winner_name) || "Player 1";
  }

  if (winner === 2) {
    return cleanName(match.player2_name) || cleanName(match.winner_name) || "Player 2";
  }

  return cleanName(match.winner_name);
}

/* ------------------------------------------------------------------ */
/* Match duration helpers (90 minutes, or 120 with extra time)         */
/* ------------------------------------------------------------------ */

const REGULAR_TIME_END = 90;
const EXTRA_TIME_END = 120;

function eventTypeKey(event: MatchEvent): string {
  return (event.event_type || "").toUpperCase();
}

function isExtraTimeStartType(type: string): boolean {
  return type.includes("EXTRA_TIME_START") || type.includes("EXTRATIMESTART");
}

// EXTRA_TIME_HALFTIME contains "HALFTIME", so it must be checked first.
function isExtraTimeBreakType(type: string): boolean {
  return type.includes("EXTRA_TIME_HALF") || type.includes("EXTRATIMEHALF");
}

function isHalfTimeType(type: string): boolean {
  return (
    !isExtraTimeBreakType(type) &&
    (type.includes("HALF_TIME") || type.includes("HALFTIME"))
  );
}

function isFullTimeType(type: string): boolean {
  return type.includes("FULL_TIME") || type.includes("FULLTIME");
}

// Extra time is detected from the saved events, not from duration_minutes.
function getMatchEndMinute(match: MatchResult | null | undefined): number {
  if (!match || !Array.isArray(match.events)) return REGULAR_TIME_END;

  return match.events.some((event) =>
    isExtraTimeStartType(eventTypeKey(event)),
  )
    ? EXTRA_TIME_END
    : REGULAR_TIME_END;
}

function getMatchStatusLabel(
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

/* ------------------------------------------------------------------ */
/* Pitch formation                                                     */
/* ------------------------------------------------------------------ */

type SlotCode =
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

type Slot = { code: SlotCode; x: string; y: string };

const FORMATION: Slot[] = [
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

function normalizePosition(position: string): string {
  const key = (position ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return ALIASES[key] ?? "";
}

function groupOf(code: string): string {
  for (const [group, codes] of Object.entries(GROUPS)) {
    if (group === code || (codes as string[]).includes(code)) return group;
  }

  return code;
}

function assignToFormation(players: Player[]): (Player | null)[] {
  const slots: (Player | null)[] = Array(FORMATION.length).fill(null);
  const placed = new Set<number>();

  const place = (
    matches: (slot: Slot, playerCode: string) => boolean,
  ) => {
    players.forEach((player, playerIndex) => {
      if (placed.has(playerIndex)) return;

      const code = normalizePosition(player.position);
      const slotIndex = FORMATION.findIndex(
        (slot, index) =>
          slots[index] === null && matches(slot, code),
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

/* ------------------------------------------------------------------ */
/* Main page                                                           */
/* ------------------------------------------------------------------ */

export default function LocalDraftPage() {
  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryValue | "">("");
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [matchData, setMatchData] = useState<MatchResult | null>(null);
  const [matchHistory, setMatchHistory] = useState<MatchResult[]>([]);
  const [matchMinute, setMatchMinute] = useState(0);
  const [matchFinished, setMatchFinished] = useState(false);

  // Horizontal timeline auto-scroll helpers (frontend only).
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const stickToEndRef = useRef(true);
  const programmaticScrollRef = useRef(false);

  const player1Squad = useMemo(
    () => squadPlayers(draft?.squads?.player1),
    [draft],
  );

  const player2Squad = useMemo(
    () => squadPlayers(draft?.squads?.player2),
    [draft],
  );

  const activePlayer = draft?.current_event?.active_player_number ?? 1;
  const currentName =
    activePlayer === 1 ? draft?.player1_name : draft?.player2_name;
  const round = draft?.current_event?.event_number ?? 11;

  const completed =
    draft?.status === "COMPLETED" || (!draft?.current_event && !!draft);

  const categoryLabel =
    DRAFT_CATEGORIES.find(
      (category) => category.value === (draft?.category || selectedCategory),
    )?.label || "Selected category";

  const matchEvents = matchData?.events ?? [];

  const matchEndMinute = useMemo(() => getMatchEndMinute(matchData), [matchData]);
  const extraTimePlayed = matchEndMinute > REGULAR_TIME_END;

  // While the match is in progress the viewer must not learn whether extra
  // time is coming: the bar scale stays at 90 until the clock reaches 90 and
  // only then widens to 120 (when extra time actually begins).
  const progressEndMinute = matchFinished
    ? matchEndMinute
    : extraTimePlayed && matchMinute >= REGULAR_TIME_END
      ? EXTRA_TIME_END
      : REGULAR_TIME_END;

  const visibleEvents = useMemo(
    () =>
      matchEvents
        .filter(
          (event) => matchFinished || safeNumber(event.minute) <= matchMinute,
        )
        .sort(
          (a, b) =>
            safeNumber(a.minute) - safeNumber(b.minute) ||
            safeNumber(a.event_number) - safeNumber(b.event_number),
        ),
    [matchEvents, matchMinute, matchFinished],
  );

  // The simulator does not send running scores on each event, so the live
  // score, per-event score and goal scorers are derived from the GOAL events
  // that the match clock has already revealed.
  const liveBoard = useMemo(() => {
    let score1 = 0;
    let score2 = 0;
    const scoreAfter: string[] = [];
    const scorers1: { name: string; minute: number }[] = [];
    const scorers2: { name: string; minute: number }[] = [];

    visibleEvents.forEach((event) => {
      if ((event.event_type || "").toUpperCase() === "GOAL") {
        const team = safeNumber(event.team_number);
        const scorer = {
          name: getPlayerName(event.player) || "Goal",
          minute: safeNumber(event.minute),
        };

        if (team === 1) {
          score1 += 1;
          scorers1.push(scorer);
        } else if (team === 2) {
          score2 += 1;
          scorers2.push(scorer);
        }
      }

      scoreAfter.push(`${score1}–${score2}`);
    });

    return { score1, score2, scoreAfter, scorers1, scorers2 };
  }, [visibleEvents]);

  const liveScore1 = matchFinished
    ? safeNumber(matchData?.player1_score)
    : liveBoard.score1;

  const liveScore2 = matchFinished
    ? safeNumber(matchData?.player2_score)
    : liveBoard.score2;

  const team1Stats = useMemo(
    () =>
      matchData?.team_statistics?.find((item) => item.team_number === 1),
    [matchData],
  );

  const team2Stats = useMemo(
    () =>
      matchData?.team_statistics?.find((item) => item.team_number === 2),
    [matchData],
  );

  const ratings = useMemo(
    () =>
      [...(matchData?.player_ratings ?? [])].sort(
        (a, b) => safeNumber(b.rating) - safeNumber(a.rating),
      ),
    [matchData],
  );

  const team1Ratings = ratings.filter((item) => item.team_number === 1);
  const team2Ratings = ratings.filter((item) => item.team_number === 2);

  const motm = matchData?.man_of_the_match ?? null;
  const motmName = getPlayerName(motm);

  const startDraft = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    const name1 = player1Name.trim();
    const name2 = player2Name.trim();

    if (!selectedCategory) {
      setError("Please select a player category before starting.");
      return;
    }

    if (!name1 || !name2) {
      setError("Enter both players' names to continue.");
      return;
    }

    if (name1.toLowerCase() === name2.toLowerCase()) {
      setError("Please enter two different names.");
      return;
    }

    setLoading(true);

    try {
      const created = await apiRequest<{ draft_id: number }>(
        "/api/drafts/create/",
        {
          method: "POST",
          body: JSON.stringify({
            mode: "LOCAL",
            player1_name: name1,
            player2_name: name2,
            category: selectedCategory,
          }),
        },
      );

      await apiRequest(`/api/drafts/${created.draft_id}/start/`, {
        method: "POST",
      });

      const state = await apiRequest<DraftState>(
        `/api/drafts/${created.draft_id}/state/`,
      );

      setPlayer1Name(name1);
      setPlayer2Name(name2);
      setDraft({
        ...state,
        category: state.category || selectedCategory,
      });
      setMatchData(null);
      setMatchHistory([]);
      setMatchMinute(0);
      setMatchFinished(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start the draft. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const choosePlayer = async (player: Player) => {
    if (!draft || !draft.current_event || loading) return;

    setError("");
    setLoading(true);

    try {
      await apiRequest(`/api/drafts/${draft.draft_id}/pick/`, {
        method: "POST",
        body: JSON.stringify({
          selected_player_id: player.id,
          player_number: draft.current_event.active_player_number,
        }),
      });

      const updated = await apiRequest<DraftState>(
        `/api/drafts/${draft.draft_id}/state/`,
      );

      setDraft({
        ...updated,
        category: updated.category || draft.category,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to save your pick. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshDraft = async () => {
    if (!draft) return;

    setLoading(true);
    setError("");

    try {
      const updated = await apiRequest<DraftState>(
        `/api/drafts/${draft.draft_id}/state/`,
      );

      setDraft({
        ...updated,
        category: updated.category || draft.category,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  const startMatch = async () => {
    if (
      !draft ||
      loading ||
      player1Squad.length !== 11 ||
      player2Squad.length !== 11
    ) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      // A new key requests a new saved match using the same completed draft.
      const result = await apiRequest<MatchResult>(
        `/api/drafts/${draft.draft_id}/match/`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": makeIdempotencyKey(),
          },
        },
      );

      const normalized: MatchResult = {
        ...result,
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

      setMatchData(normalized);
      setMatchHistory((history) => {
        const withoutDuplicate = history.filter(
          (item) => item.match_id !== normalized.match_id,
        );

        return [normalized, ...withoutDuplicate];
      });
      setMatchMinute(0);
      setMatchFinished(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to start the match. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const showPreviousMatch = (match: MatchResult) => {
    setMatchData(match);
    setMatchMinute(getMatchEndMinute(match));
    setMatchFinished(true);
    setError("");
  };

  const resetDraft = () => {
    setDraft(null);
    setPlayer1Name("");
    setPlayer2Name("");
    setSelectedCategory("");
    setMatchData(null);
    setMatchHistory([]);
    setMatchMinute(0);
    setMatchFinished(false);
    setError("");
  };

  // Advance the presentation clock to the match end (90, or 120 when the
  // saved events contain extra time). One interval at a time; it is cleared
  // whenever the match, its end minute or its finished state changes.
  useEffect(() => {
    if (!matchData || matchFinished) return undefined;

    const timer = window.setInterval(() => {
      setMatchMinute((minute) => Math.min(minute + 1, matchEndMinute));
    }, 500);

    return () => window.clearInterval(timer);
  }, [matchData, matchFinished, matchEndMinute]);

  // Finish the match once the clock reaches the end minute.
  useEffect(() => {
    if (matchData && !matchFinished && matchMinute >= matchEndMinute) {
      setMatchFinished(true);
    }
  }, [matchData, matchFinished, matchMinute, matchEndMinute]);

  // Track whether the user is reading near the newest event. If they have
  // scrolled back to older events, new events will not pull them away.
  const handleTimelineScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;

    const el = timelineRef.current;
    if (!el) return;

    const distanceFromEnd = el.scrollWidth - el.clientWidth - el.scrollLeft;
    stickToEndRef.current = distanceFromEnd < 48;
  }, []);

  // Auto-scroll the horizontal timeline only when events are added.
  useEffect(() => {
    const el = timelineRef.current;
    if (!el) return undefined;

    if (visibleEvents.length === 0) {
      // New match / watch again: start from the beginning.
      stickToEndRef.current = true;
      programmaticScrollRef.current = false;
      el.scrollLeft = 0;
      return undefined;
    }

    if (!stickToEndRef.current) {
      programmaticScrollRef.current = false;
      return undefined;
    }

    programmaticScrollRef.current = true;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });

    const timeout = window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [visibleEvents.length, matchData?.match_id]);

  const offered = draft?.current_event?.offered_players ?? [];

  return (
    <main className="min-h-screen bg-[#080b10] text-white">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-7 lg:px-10">
        <header className="flex items-center justify-between border-b border-white/10 pb-5">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#b9f36b] text-lg font-black text-black">
              F
            </div>

            <div>
              <div className="text-lg font-black tracking-[0.16em]">
                FUTGO
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">
                Build your legacy
              </div>
            </div>
          </Link>

          <Link
            href="/"
            className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm text-white/65 transition hover:border-[#b9f36b]/50 hover:text-white"
          >
            <ArrowLeft size={16} />
            <span className="hidden sm:inline">Back home</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </header>

        {!draft ? (
          <section className="mx-auto grid min-h-[78vh] max-w-5xl items-center gap-12 py-12 lg:grid-cols-[1fr_0.9fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#b9f36b]/20 bg-[#b9f36b]/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#b9f36b]">
                <Users size={14} />
                Local multiplayer
              </div>

              <h1 className="max-w-xl text-5xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-7xl">
                TWO FRIENDS.
                <br />
                <span className="text-[#b9f36b]">ONE PITCH.</span>
                <br />
                YOUR LEGACY.
              </h1>

              <p className="mt-6 max-w-lg text-base leading-7 text-white/55 sm:text-lg">
                Choose your football universe, take turns drafting football
                stars, outsmart your rival, and build a squad worthy of the
                throne.
              </p>

              <div className="mt-9 grid max-w-lg grid-cols-3 gap-3">
                {[
                  { value: "2", label: "Players" },
                  { value: "11", label: "Rounds" },
                  { value: "22", label: "Footballers" },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="text-2xl font-black text-[#b9f36b]">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-xs text-white/45">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-7 flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                <Trophy size={20} className="mt-0.5 shrink-0 text-[#b9f36b]" />
                <div>
                  <p className="text-sm font-bold">One category. One battle.</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    Both managers draft from the same selected player pool.
                    Choose your category before the first round.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-[#10151d] p-6 shadow-2xl shadow-black/30 sm:p-8">
              <div className="mb-7 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#b9f36b]">
                    Set up your match
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    Who&apos;s playing?
                  </h2>
                </div>

                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#b9f36b]/10 text-[#b9f36b]">
                  <Shield size={24} />
                </div>
              </div>

              <form onSubmit={startDraft} className="space-y-5">
                <fieldset>
                  <legend className="mb-3 block text-sm font-semibold text-white/75">
                    Choose player category
                    <span className="ml-1 text-[#b9f36b]">*</span>
                  </legend>

                  <div className="grid grid-cols-2 gap-3">
                    {DRAFT_CATEGORIES.map((category) => {
                      const isSelected = selectedCategory === category.value;

                      return (
                        <button
                          key={category.value}
                          type="button"
                          aria-pressed={isSelected}
                          disabled={loading}
                          onClick={() => {
                            setSelectedCategory(category.value);
                            setError("");
                          }}
                          className={`relative min-h-[112px] rounded-2xl border p-3 text-left transition duration-200 sm:p-4 ${
                            isSelected
                              ? "border-[#b9f36b] bg-[#b9f36b]/[0.09] shadow-[0_0_22px_rgba(185,243,107,0.07)]"
                              : "border-white/10 bg-[#080b10] hover:border-white/25 hover:bg-white/[0.03]"
                          } disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {isSelected && (
                            <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#b9f36b] text-black">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}

                          <span className="mb-3 block text-2xl">
                            {category.icon}
                          </span>

                          <span
                            className={`block pr-4 text-sm font-bold leading-tight ${
                              isSelected ? "text-[#b9f36b]" : "text-white/85"
                            }`}
                          >
                            {category.label}
                          </span>

                          <span className="mt-1 block text-[10px] leading-4 text-white/40 sm:text-xs">
                            {category.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {!selectedCategory && (
                    <p className="mt-2 text-xs text-white/35">
                      Select one category to continue.
                    </p>
                  )}
                </fieldset>

                <div className="h-px bg-white/10" />

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/75">
                    Player 1
                  </span>
                  <input
                    value={player1Name}
                    onChange={(event) => setPlayer1Name(event.target.value)}
                    placeholder="Enter first player's name"
                    maxLength={40}
                    required
                    className="w-full rounded-xl border border-white/10 bg-[#080b10] px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-[#b9f36b]/70 focus:ring-2 focus:ring-[#b9f36b]/10"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/75">
                    Player 2
                  </span>
                  <input
                    value={player2Name}
                    onChange={(event) => setPlayer2Name(event.target.value)}
                    placeholder="Enter second player's name"
                    maxLength={40}
                    required
                    className="w-full rounded-xl border border-white/10 bg-[#080b10] px-4 py-4 text-white outline-none transition placeholder:text-white/25 focus:border-[#b9f36b]/70 focus:ring-2 focus:ring-[#b9f36b]/10"
                  />
                </label>

                {selectedCategory && (
                  <div className="flex items-center gap-3 rounded-xl border border-[#b9f36b]/20 bg-[#b9f36b]/[0.05] px-4 py-3">
                    <Sparkles size={17} className="shrink-0 text-[#b9f36b]" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/40">
                        Selected player pool
                      </p>
                      <p className="mt-0.5 truncate text-sm font-bold text-[#b9f36b]">
                        {
                          DRAFT_CATEGORIES.find(
                            (category) => category.value === selectedCategory,
                          )?.label
                        }
                      </p>
                    </div>
                  </div>
                )}

                {error && <ErrorMessage message={error} />}

                <button
                  type="submit"
                  disabled={loading || !selectedCategory}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#b9f36b] px-5 py-4 font-black text-[#080b10] transition hover:bg-[#c9ff83] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={19} className="animate-spin" />
                      Setting up draft...
                    </>
                  ) : (
                    <>
                      Start drafting
                      <ArrowRight size={19} />
                    </>
                  )}
                </button>
              </form>

              <p className="mt-5 text-center text-xs leading-5 text-white/35">
                One device, two managers. Hand the screen over when it&apos;s
                your opponent&apos;s turn.
              </p>
            </div>
          </section>
        ) : matchData ? (
          /* ---------------------------------------------------------- */
          /* MATCH CENTRE                                               */
          /* ---------------------------------------------------------- */
          <section className="mx-auto max-w-7xl py-8 sm:py-12">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#b9f36b]">
                  <Activity size={15} />
                  FutGo match centre
                </div>

                <h1 className="text-3xl font-black sm:text-5xl">
                  {matchFinished ? "FULL TIME." : "THE SHOWDOWN."}
                </h1>

                <p className="mt-3 text-sm text-white/45">
                  {matchFinished
                    ? "The final whistle has blown. Explore the match report below."
                    : "Follow every major moment as your drafted teams battle it out."}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setMatchMinute(0);
                    setMatchFinished(false);
                  }}
                  disabled={loading || !matchFinished}
                  className="flex items-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-semibold text-white/70 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RotateCcw size={16} />
                  Watch again
                </button>

                <button
                  onClick={startMatch}
                  disabled={loading || !matchFinished}
                  className="flex items-center gap-2 rounded-xl bg-[#b9f36b] px-4 py-3 text-sm font-black text-black transition hover:bg-[#c9ff83] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <LoaderCircle size={17} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                  Rematch
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-6">
                <ErrorMessage message={error} />
              </div>
            )}

            {/* Scoreboard */}
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#10151d] p-5 sm:p-10">
              <div className="absolute left-1/2 top-0 h-40 w-72 -translate-x-1/2 rounded-full bg-[#b9f36b]/[0.07] blur-3xl" />

              <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
                <div className="min-w-0 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#b9f36b]/25 bg-[#b9f36b]/10 text-xl font-black text-[#b9f36b] sm:h-20 sm:w-20 sm:text-3xl">
                    {(matchData.player1_name || draft.player1_name || "P")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <h2 className="break-words text-sm font-black sm:text-2xl">
                    {matchData.player1_name || draft.player1_name || "Player 1"}
                  </h2>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-white/35 sm:text-xs">
                    Home team
                  </p>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 sm:gap-5">
                    <span className="text-4xl font-black tabular-nums sm:text-7xl">
                      {liveScore1}
                    </span>
                    <span className="text-xl font-bold text-white/25 sm:text-4xl">
                      –
                    </span>
                    <span className="text-4xl font-black tabular-nums sm:text-7xl">
                      {liveScore2}
                    </span>
                  </div>

                  <div
                    className={`mx-auto mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider sm:text-xs ${
                      matchFinished
                        ? "bg-[#b9f36b]/10 text-[#b9f36b]"
                        : "bg-white/[0.06] text-white/65"
                    }`}
                  >
                    {!matchFinished && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#b9f36b]" />
                    )}
                    {getMatchStatusLabel(
                      matchMinute,
                      matchFinished,
                      extraTimePlayed,
                    )}
                  </div>
                </div>

                <div className="min-w-0 text-center">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-xl font-black text-white/75 sm:h-20 sm:w-20 sm:text-3xl">
                    {(matchData.player2_name || draft.player2_name || "P")
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <h2 className="break-words text-sm font-black sm:text-2xl">
                    {matchData.player2_name || draft.player2_name || "Player 2"}
                  </h2>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-white/35 sm:text-xs">
                    Away team
                  </p>
                </div>
              </div>

              {(liveBoard.scorers1.length > 0 ||
                liveBoard.scorers2.length > 0) && (
                <div className="relative mt-6 grid grid-cols-[1fr_auto_1fr] items-start gap-3 border-t border-white/5 pt-4 sm:gap-8">
                  <ul className="space-y-1 text-right">
                    {liveBoard.scorers1.map((goal, index) => (
                      <li
                        key={`home-goal-${index}`}
                        className="text-xs text-white/70 sm:text-sm"
                      >
                        <span className="font-bold text-white/85">
                          {goal.name}
                        </span>{" "}
                        <span className="font-black tabular-nums text-[#b9f36b]">
                          {goal.minute}&apos;
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Goal size={16} className="mt-0.5 text-[#b9f36b]" />

                  <ul className="space-y-1 text-left">
                    {liveBoard.scorers2.map((goal, index) => (
                      <li
                        key={`away-goal-${index}`}
                        className="text-xs text-white/70 sm:text-sm"
                      >
                        <span className="font-black tabular-nums text-[#b9f36b]">
                          {goal.minute}&apos;
                        </span>{" "}
                        <span className="font-bold text-white/85">
                          {goal.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="relative mt-8">
                <div className="mb-2 flex items-center justify-between text-xs text-white/40">
                  <span className="flex items-center gap-2">
                    <Clock3 size={14} />
                    {matchFinished ? "Match completed" : "Match clock"}
                  </span>
                  <span className="font-bold tabular-nums text-[#b9f36b]">
                    {matchFinished
                      ? `${matchMinute}' / ${matchEndMinute}'`
                      : `${matchMinute}'`}
                  </span>
                </div>

                <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#b9f36b] transition-all duration-300"
                    style={{
                      width: `${Math.min(100, Math.max(0, (matchMinute / progressEndMinute) * 100))}%`,
                    }}
                  />
                </div>

                {!matchFinished ? null : extraTimePlayed ? (
                  <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[10px] text-white/25">
                    <span>Kick-off</span>
                    <span>45&apos; HT</span>
                    <span>90&apos; ET starts</span>
                    <span>105&apos; ET break</span>
                    <span>120&apos; FT</span>
                  </div>
                ) : (
                  <div className="mt-2 flex justify-between text-[10px] text-white/25">
                    <span>Kick-off</span>
                    <span>45&apos; HT</span>
                    <span>90&apos; FT</span>
                  </div>
                )}
              </div>
            </div>

            {/* Match report cards */}
            {matchFinished && (
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#10151d] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#b9f36b]/10 text-[#b9f36b]">
                      <Trophy size={22} />
                    </div>
                    <div>
                      <p className="text-xs text-white/40">Final result</p>
                      <p className="mt-1 font-black">
                        {matchData.is_draw ||
                        matchData.player1_score === matchData.player2_score
                          ? "It's a draw"
                          : `${getWinnerName(matchData)} wins`}
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-white/45">
                    {matchData.player1_name} {matchData.player1_score} –{" "}
                    {matchData.player2_score} {matchData.player2_name}
                  </p>
                </div>

                <div className="rounded-2xl border border-[#b9f36b]/20 bg-[#b9f36b]/[0.05] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#b9f36b]/10 text-[#b9f36b]">
                      <Medal size={22} />
                    </div>
                    <div>
                      <p className="text-xs text-white/40">Man of the Match</p>
                      <p className="mt-1 font-black">
                        {motmName || "Not provided"}
                      </p>
                    </div>
                  </div>
                  {motm && typeof motm === "object" && "rating" in motm && (
                    <p className="mt-3 text-sm text-[#b9f36b]">
                      Rating: {safeNumber((motm as Player & { rating?: number }).rating).toFixed(1)}
                      /10
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#10151d] p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/5 text-white/70">
                      <Activity size={22} />
                    </div>
                    <div>
                      <p className="text-xs text-white/40">Match events</p>
                      <p className="mt-1 font-black">
                        {matchEvents.filter((event) => event.event_type === "GOAL").length} goals
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-white/45">
                    {matchEvents.length} recorded events in the match report.
                  </p>
                </div>
              </div>
            )}

            {/* Commentary: horizontal, auto-scrolling timeline */}
            <div className="mt-6 rounded-[24px] border border-white/10 bg-[#10151d] p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9f36b]">
                    Live commentary
                  </p>
                  <h2 className="mt-2 text-xl font-black">Match timeline</h2>
                </div>
                <Goal className="text-[#b9f36b]" size={22} />
              </div>

              <div
                ref={timelineRef}
                onScroll={handleTimelineScroll}
                className="flex h-44 items-stretch gap-3 overflow-x-auto overflow-y-hidden rounded-xl pb-2 sm:h-48"
              >
                {visibleEvents.length === 0 && (
                  <div className="flex h-full w-full items-center justify-center rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm text-white/35">
                    Waiting for match events...
                  </div>
                )}

                {visibleEvents.map((event, eventIndex) => {
                  const type = (event.event_type || "").toUpperCase();
                  const isGoal = type === "GOAL";
                  const isCard =
                    type.includes("CARD") || type.includes("BOOKING");
                  const isExtraTimeStart = isExtraTimeStartType(type);
                  const isExtraTimeBreak = isExtraTimeBreakType(type);
                  const isHalfTime = isHalfTimeType(type);
                  const isFullTime = isFullTimeType(type);
                  const playerName = getPlayerName(event.player);
                  const secondaryName = getPlayerName(event.secondary_player);

                  const title = isGoal
                    ? "GOAL!"
                    : isExtraTimeStart
                      ? "Extra time begins"
                      : isExtraTimeBreak
                        ? "Extra-time break"
                        : isHalfTime
                          ? "Half-time"
                          : isFullTime
                            ? "Full-time"
                            : formatEventType(type);

                  const teamName =
                    event.team_number === 1
                      ? matchData.player1_name
                      : event.team_number === 2
                        ? matchData.player2_name
                        : "";

                  return (
                    <TimelineItem
                      key={`${matchData.match_id}-${event.event_number}`}
                      minute={event.minute}
                      eventType={type}
                      title={title}
                      description={event.commentary || title}
                      highlight={
                        isGoal ||
                        isFullTime ||
                        isExtraTimeStart ||
                        isExtraTimeBreak
                      }
                      warning={isCard}
                      teamName={teamName}
                      playerName={playerName}
                      secondaryName={secondaryName}
                      score={liveBoard.scoreAfter[eventIndex] ?? ""}
                    />
                  );
                })}
              </div>

              {!matchFinished && (
                <div className="mt-4 flex items-center gap-2 text-xs text-white/35">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#b9f36b]" />
                  Commentary is revealed as the match clock advances.
                </div>
              )}
            </div>

            {/* Match statistics: full width, shown only after full time */}
            {matchFinished && (
              <div className="mt-5 rounded-[24px] border border-white/10 bg-[#10151d] p-5 sm:p-7">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/40">
                      Match statistics
                    </p>
                    <h2 className="mt-2 text-xl font-black">
                      Team comparison
                    </h2>
                  </div>
                  <BarChart3 size={22} className="text-[#b9f36b]" />
                </div>

                <div className="mb-5 grid grid-cols-3 items-center gap-2 rounded-xl bg-white/[0.03] p-3 text-center">
                  <div>
                    <p className="text-[10px] text-white/35">HOME</p>
                    <p className="mt-1 truncate text-sm font-bold">
                      {matchData.player1_name}
                    </p>
                  </div>
                  <div className="text-xs font-bold text-white/25">VS</div>
                  <div>
                    <p className="text-[10px] text-white/35">AWAY</p>
                    <p className="mt-1 truncate text-sm font-bold">
                      {matchData.player2_name}
                    </p>
                  </div>
                </div>

                {team1Stats && team2Stats ? (
                  <div className="grid gap-x-12 gap-y-5 grid-cols-1">
                    <StatRow
                      label="Possession"
                      left={safeNumber(team1Stats.possession)}
                      right={safeNumber(team2Stats.possession)}
                      suffix="%"
                    />
                    <StatRow
                      label="Shots"
                      left={safeNumber(team1Stats.shots)}
                      right={safeNumber(team2Stats.shots)}
                    />
                    <StatRow
                      label="Shots on target"
                      left={safeNumber(team1Stats.shots_on_target)}
                      right={safeNumber(team2Stats.shots_on_target)}
                    />
                    <StatRow
                      label="Goals"
                      left={safeNumber(team1Stats.goals)}
                      right={safeNumber(team2Stats.goals)}
                    />
                    <StatRow
                      label="Fouls"
                      left={safeNumber(team1Stats.fouls)}
                      right={safeNumber(team2Stats.fouls)}
                    />
                    <StatRow
                      label="Corners"
                      left={safeNumber(team1Stats.corners)}
                      right={safeNumber(team2Stats.corners)}
                    />
                    <StatRow
                      label="Yellow cards"
                      left={safeNumber(team1Stats.yellow_cards)}
                      right={safeNumber(team2Stats.yellow_cards)}
                    />
                    <StatRow
                      label="Red cards"
                      left={safeNumber(team1Stats.red_cards)}
                      right={safeNumber(team2Stats.red_cards)}
                    />
                  </div>
                ) : (
                  <EmptyData message="Team statistics were not returned by the backend. Check the match API response." />
                )}

                <p className="mt-5 text-[11px] leading-5 text-white/30">
                  Statistics are the saved match totals returned by the simulator.
                </p>
              </div>
            )}

            {/* Team lineups (ratings appear on the cards after full time) */}
            <div className="mt-8">
              <SectionHeading
                eyebrow="Starting elevens"
                title="Team lineups"
                icon={<Users size={21} />}
                description="Your original drafted squads remain unchanged for every rematch. Player ratings appear on each card at full time."
              />

              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                <SquadPitch
                  name={matchData.player1_name}
                  number={1}
                  players={player1Squad}
                  complete
                  ratings={team1Ratings}
                  showRatings={matchFinished}
                />

                <SquadPitch
                  name={matchData.player2_name}
                  number={2}
                  players={player2Squad}
                  complete
                  ratings={team2Ratings}
                  showRatings={matchFinished}
                />
              </div>
            </div>

            {/* Match history and rematches */}
            {matchHistory.length > 1 && (
              <div className="mt-8 rounded-[24px] border border-white/10 bg-[#10151d] p-5 sm:p-7">
                <SectionHeading
                  eyebrow="This draft"
                  title="Match history"
                  icon={<Clock3 size={21} />}
                  description="Switch between results from this page session."
                />

                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {matchHistory.map((item, index) => (
                    <button
                      key={item.match_id}
                      onClick={() => showPreviousMatch(item)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        item.match_id === matchData.match_id
                          ? "border-[#b9f36b]/40 bg-[#b9f36b]/[0.06]"
                          : "border-white/10 bg-white/[0.02] hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                          Match {matchHistory.length - index}
                        </span>
                        {item.match_id === matchData.match_id && (
                          <span className="rounded-full bg-[#b9f36b]/10 px-2 py-1 text-[10px] font-bold text-[#b9f36b]">
                            Viewing
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-bold">
                          {item.player1_name}
                        </span>
                        <span className="shrink-0 text-xl font-black tabular-nums">
                          {item.player1_score} – {item.player2_score}
                        </span>
                        <span className="min-w-0 truncate text-right text-sm font-bold">
                          {item.player2_name}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-white/35">
                        {item.is_draw ||
                        item.player1_score === item.player2_score
                          ? "Draw"
                          : `${getWinnerName(item)} won`}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {matchFinished && (
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <button
                  onClick={startMatch}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-[#b9f36b] px-6 py-4 font-black text-black transition hover:bg-[#c9ff83] disabled:opacity-50"
                >
                  {loading ? (
                    <LoaderCircle size={18} className="animate-spin" />
                  ) : (
                    <RefreshCw size={17} />
                  )}
                  Play rematch · Same squads
                </button>

                <button
                  onClick={resetDraft}
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-4 font-semibold text-white/75 transition hover:bg-white/5 disabled:opacity-50"
                >
                  <RotateCcw size={17} />
                  Draft new teams
                </button>

                <Link
                  href="/"
                  className="rounded-xl border border-white/15 px-6 py-4 font-semibold text-white/75 transition hover:bg-white/5"
                >
                  Back home
                </Link>
              </div>
            )}

            {!matchFinished && (
              <p className="mt-6 text-center text-xs text-white/30">
                Simulation in progress. Keep this page open to watch the full match.
              </p>
            )}
          </section>
        ) : completed ? (
          /* ---------------------------------------------------------- */
          /* DRAFT COMPLETE                                             */
          /* ---------------------------------------------------------- */
          <section className="mx-auto max-w-6xl py-12 sm:py-16">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#b9f36b]/10 text-[#b9f36b]">
                <Crown size={32} />
              </div>

              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#b9f36b]">
                Draft complete
              </p>

              <h1 className="mt-3 text-4xl font-black sm:text-6xl">
                SQUADS LOCKED.
              </h1>

              <p className="mt-4 text-white/50">
                {draft.player1_name} and {draft.player2_name} have drafted
                their teams. Ready to see who wins on the pitch?
              </p>

              <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#b9f36b]/20 bg-[#b9f36b]/[0.06] px-4 py-2 text-sm font-semibold text-[#b9f36b]">
                <Trophy size={15} />
                {categoryLabel}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <SquadPitch
                name={draft.player1_name}
                number={1}
                players={player1Squad}
                complete
              />
              <SquadPitch
                name={draft.player2_name}
                number={2}
                players={player2Squad}
                complete
              />
            </div>

            {error && (
              <div className="mx-auto mt-6 max-w-2xl">
                <ErrorMessage message={error} />
              </div>
            )}

            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <button
                onClick={startMatch}
                disabled={
                  loading ||
                  player1Squad.length !== 11 ||
                  player2Squad.length !== 11
                }
                className="flex min-w-48 items-center justify-center gap-2 rounded-xl bg-[#b9f36b] px-7 py-4 font-black text-black transition hover:bg-[#c9ff83] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={19} className="animate-spin" />
                    Preparing match...
                  </>
                ) : (
                  <>
                    <Play size={18} fill="currentColor" />
                    Start Match
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <button
                onClick={resetDraft}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 font-semibold text-white/75 transition hover:bg-white/5 disabled:opacity-50"
              >
                <RotateCcw size={17} />
                Play another draft
              </button>

              <Link
                href="/"
                className="rounded-xl border border-white/15 px-6 py-3 font-semibold text-white/75 transition hover:bg-white/5"
              >
                Back home
              </Link>
            </div>

            {(player1Squad.length !== 11 || player2Squad.length !== 11) && (
              <p className="mt-4 text-center text-xs text-amber-300/70">
                Both squads must have 11 players before the match can start.
              </p>
            )}
          </section>
        ) : (
          /* ---------------------------------------------------------- */
          /* DRAFTING                                                    */
          /* ---------------------------------------------------------- */
          <section className="py-8 sm:py-10">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#b9f36b]">
                  <Zap size={15} />
                  Local draft · Round {round} of 11
                </div>

                <h1 className="text-3xl font-black sm:text-5xl">
                  MAKE YOUR PICK.
                </h1>

                <p className="mt-3 text-sm text-white/45 sm:text-base">
                  Choose one player. The other joins your rival&apos;s squad.
                </p>

                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/55">
                  <Trophy size={13} className="text-[#b9f36b]" />
                  {categoryLabel}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden h-2 w-32 overflow-hidden rounded-full bg-white/10 sm:block">
                  <div
                    className="h-full rounded-full bg-[#b9f36b] transition-all duration-500"
                    style={{ width: `${(round / 11) * 100}%` }}
                  />
                </div>

                <div className="rounded-xl border border-[#b9f36b]/30 bg-[#b9f36b]/[0.06] px-4 py-3">
                  <div className="text-xs text-white/40">Current manager</div>
                  <div className="mt-1 font-bold text-[#b9f36b]">
                    {currentName}
                  </div>
                </div>
              </div>
            </div>

            <div className="mb-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                <Sparkles size={14} className="text-[#b9f36b]" />
                {currentName}, choose your footballer
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              {offered.map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  disabled={loading}
                  onClick={() => choosePlayer(player)}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#10151d] p-3 text-left transition hover:-translate-y-1 hover:border-[#b9f36b]/60 hover:bg-[#141c23] disabled:cursor-wait disabled:opacity-60 sm:rounded-3xl sm:p-7"
                >
                  <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-[#b9f36b]/[0.04] blur-3xl transition group-hover:bg-[#b9f36b]/10" />

                  <div className="relative flex items-start justify-between gap-2 sm:gap-4">
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-white/50 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.16em]">
                      <span className="hidden sm:inline">Option </span>
                      {index + 1}
                    </span>

                    <span className="rounded-full bg-[#b9f36b]/10 px-2 py-1 text-[10px] font-bold text-[#b9f36b] sm:px-3 sm:py-1.5 sm:text-xs">
                      {player.position}
                    </span>
                  </div>

                  <div className="relative mt-4 flex flex-col items-start gap-3 sm:mt-7 sm:min-h-28 sm:flex-row sm:items-center sm:gap-5">
                    <PlayerAvatar
                      player={player}
                      className="h-16 w-16 rounded-xl text-xl sm:h-24 sm:w-24 sm:rounded-2xl sm:text-3xl"
                    />

                    <div className="min-w-0">
                      <h2 className="break-words text-base font-black leading-tight sm:text-3xl">
                        {player.name}
                      </h2>

                      <p className="mt-1 text-[11px] leading-4 text-white/45 sm:mt-2 sm:text-sm">
                        {[player.club, player.country]
                          .filter(Boolean)
                          .join(" · ") || "Football star"}
                      </p>
                    </div>
                  </div>

                  <div className="relative mt-4 flex items-center justify-between border-t border-white/10 pt-3 sm:mt-7 sm:pt-4">
                    <span className="text-xs font-bold text-white/65 transition group-hover:text-[#b9f36b] sm:text-sm">
                      Draft
                      <span className="hidden sm:inline"> this player</span>
                    </span>

                    {loading ? (
                      <LoaderCircle
                        size={19}
                        className="animate-spin text-[#b9f36b]"
                      />
                    ) : (
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/5 transition group-hover:bg-[#b9f36b] group-hover:text-black sm:h-9 sm:w-9">
                        <ChevronRight size={17} />
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {offered.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#10151d] p-8 text-center">
                <p className="text-white/60">
                  No player options were returned for this round.
                </p>

                <button
                  onClick={refreshDraft}
                  disabled={loading}
                  className="mt-4 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
                >
                  Refresh draft
                </button>
              </div>
            )}

            {error && (
              <div className="mt-5">
                <ErrorMessage message={error} />
              </div>
            )}

            <div className="mb-5 mt-10 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">
                Squads
              </span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <SquadPitch
                name={draft.player1_name}
                number={1}
                players={player1Squad}
                active={activePlayer === 1}
              />

              <SquadPitch
                name={draft.player2_name}
                number={2}
                players={player2Squad}
                active={activePlayer === 2}
              />
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-white/10 pt-5 text-xs text-white/35">
              <span>
                {player1Squad.length + player2Squad.length} / 22 players
                drafted
              </span>

              <span className="flex items-center gap-2">
                <Check size={14} className="text-[#b9f36b]" />
                Picks saved to your draft
              </span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Shared components                                                   */
/* ------------------------------------------------------------------ */

function SectionHeading({
  eyebrow,
  title,
  icon,
  description,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#b9f36b]/10 text-[#b9f36b]">
        {icon}
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#b9f36b]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-black">{title}</h2>
        {description && (
          <p className="mt-2 text-sm leading-6 text-white/40">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function EmptyData({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 text-sm leading-6 text-white/40">
      {message}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-300"
    >
      <CircleAlert size={18} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function EventIcon({ type }: { type: string }) {
  const size = 14;

  if (type === "GOAL") return <Goal size={size} />;
  if (type.includes("RED_CARD")) {
    return <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-red-500" />;
  }
  if (type.includes("CARD") || type.includes("BOOKING")) {
    return (
      <span className="inline-block h-3.5 w-2.5 rounded-[2px] bg-amber-300" />
    );
  }
  if (type.includes("KICKOFF")) return <Play size={size} />;
  if (type.includes("CORNER") || type.includes("OFFSIDE")) {
    return <Flag size={size} />;
  }
  if (type.includes("TACKLE") || type.includes("INTERCEPTION")) {
    return <Zap size={size} />;
  }
  if (type.includes("SAVE")) return <Shield size={size} />;
  if (type.includes("SHOT")) return <Target size={size} />;
  if (type.includes("FOUL")) return <Footprints size={size} />;
  if (
    type.includes("EXTRA_TIME") ||
    type.includes("HALF_TIME") ||
    type.includes("FULL_TIME") ||
    type.includes("HALFTIME") ||
    type.includes("FULLTIME")
  ) {
    return <Timer size={size} />;
  }

  return <Activity size={size} />;
}

function TimelineItem({
  minute,
  eventType,
  title,
  description,
  highlight = false,
  warning = false,
  teamName,
  playerName,
  secondaryName,
  score,
}: {
  minute: number;
  eventType: string;
  title: string;
  description: string;
  highlight?: boolean;
  warning?: boolean;
  teamName?: string;
  playerName?: string;
  secondaryName?: string;
  score?: string;
}) {
  return (
    <div
      className={`flex h-full w-60 shrink-0 flex-col gap-2 overflow-hidden rounded-xl border p-3 sm:w-72 ${
        highlight
          ? "border-[#b9f36b]/20 bg-[#b9f36b]/[0.05]"
          : warning
            ? "border-amber-400/20 bg-amber-400/[0.04]"
            : "border-white/5 bg-white/[0.02]"
      }`}
      title={description}
    >
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 min-w-11 items-center justify-center rounded-lg text-xs font-black tabular-nums ${
            highlight
              ? "bg-[#b9f36b]/10 text-[#b9f36b]"
              : warning
                ? "bg-amber-400/10 text-amber-300"
                : "bg-white/[0.04] text-white/50"
          }`}
        >
          {minute}&apos;
        </div>

        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            highlight
              ? "bg-[#b9f36b]/10 text-[#b9f36b]"
              : warning
                ? "bg-amber-400/10 text-amber-300"
                : "bg-white/[0.04] text-white/50"
          }`}
        >
          <EventIcon type={eventType} />
        </span>

        <p
          className={`min-w-0 flex-1 truncate text-sm font-black ${
            highlight
              ? "text-[#b9f36b]"
              : warning
                ? "text-amber-200"
                : "text-white/85"
          }`}
        >
          {title}
        </p>

        {score && (
          <span className="shrink-0 rounded-md bg-white/[0.05] px-2 py-1 text-[10px] font-black tabular-nums text-white/70">
            {score}
          </span>
        )}
      </div>

      {teamName && (
        <span className="w-fit max-w-full truncate rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/45">
          {teamName}
        </span>
      )}

      {playerName && (
        <p className="truncate text-xs font-bold text-white/75">
          {playerName}
          {secondaryName && (
            <span className="font-medium text-white/40">
              {" "}
              · Assist: {secondaryName}
            </span>
          )}
        </p>
      )}

      <p className="line-clamp-3 text-xs leading-5 text-white/45">
        {description}
      </p>
    </div>
  );
}

function StatRow({
  label,
  left,
  right,
  suffix = "",
}: {
  label: string;
  left: number;
  right: number;
  suffix?: string;
}) {
  const total = left + right;
  const leftWidth = total === 0 ? 50 : (left / total) * 100;
  const rightWidth = total === 0 ? 50 : (right / total) * 100;

  return (
    <div>
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <span className="font-bold tabular-nums text-white/80">
          {left}{suffix}
        </span>
        <span className="text-center text-xs text-white/40">{label}</span>
        <span className="text-right font-bold tabular-nums text-white/80">
          {right}{suffix}
        </span>
      </div>

      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-l-full bg-[#b9f36b] transition-all duration-300"
          style={{ width: `${leftWidth}%` }}
        />
        <div
          className="h-full rounded-r-full bg-white/20"
          style={{ width: `${rightWidth}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Player and squad components                                         */
/* ------------------------------------------------------------------ */

function PlayerAvatar({
  player,
  className = "",
}: {
  player: Player;
  className?: string;
}) {
  if (player.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.image_url}
        alt={player.name}
        className={`shrink-0 border border-white/10 bg-[#080b10] object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-white/10 bg-[#080b10] font-black text-[#b9f36b] ${className}`}
    >
      {player.name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    </div>
  );
}

function SquadPitch({
  name,
  number,
  players,
  active = false,
  complete = false,
  ratings = [],
  showRatings = false,
}: {
  name: string;
  number: number;
  players: Player[];
  active?: boolean;
  complete?: boolean;
  ratings?: PlayerRating[];
  showRatings?: boolean;
}) {
  const slots = useMemo(() => assignToFormation(players), [players]);

  // Ratings are matched to squad players by unique player id (compared as
  // strings so 12 and "12" still match). Only if no id match exists do we
  // fall back to an exact, case-insensitive name match within the same team.
  const { ratingById, ratingByName } = useMemo(() => {
    const byId = new Map<string, PlayerRating>();
    const byName = new Map<string, PlayerRating>();

    ratings.forEach((item) => {
      const id = item.player?.id;
      if (id !== null && id !== undefined) byId.set(String(id), item);

      const nameKey = (item.player?.name ?? "").trim().toLowerCase();
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, item);
    });

    return { ratingById: byId, ratingByName: byName };
  }, [ratings]);

  const findRating = (player: Player): PlayerRating | undefined =>
    ratingById.get(String(player.id)) ??
    ratingByName.get((player.name ?? "").trim().toLowerCase());

  return (
    <div
      className={`rounded-[28px] border p-4 transition sm:p-6 ${
        active
          ? "border-[#b9f36b]/50 bg-[#b9f36b]/[0.05]"
          : "border-white/10 bg-[#10151d]"
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black ${
              active ? "bg-[#b9f36b] text-black" : "bg-white/5 text-white/65"
            }`}
          >
            {number}
          </div>

          <div className="min-w-0">
            <h3 className="truncate font-bold">{name}</h3>
            <p className="mt-0.5 text-xs text-white/40">
              {players.length} / 11 players · 4–3–3
            </p>
          </div>
        </div>

        {complete ? (
          <span className="flex items-center gap-1 text-xs font-bold text-[#b9f36b]">
            <Check size={14} /> Complete
          </span>
        ) : active ? (
          <span className="rounded-full bg-[#b9f36b]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#b9f36b]">
            Picking
          </span>
        ) : (
          <span className="text-xs text-white/30">Waiting</span>
        )}
      </div>

      <div className="pitch relative overflow-hidden rounded-2xl border border-white/15">
        <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 sm:h-28 sm:w-28" />
        <div className="absolute left-1/2 top-0 h-9 w-28 -translate-x-1/2 rounded-b-xl border-x border-b border-white/20 sm:h-12 sm:w-36" />
        <div className="absolute bottom-0 left-1/2 h-9 w-28 -translate-x-1/2 rounded-t-xl border-x border-t border-white/20 sm:h-12 sm:w-36" />

        {FORMATION.map((slot, index) => {
          const player = slots[index];
          const rating = player ? findRating(player) : undefined;
          const ratingText = formatRating(rating?.rating);

          return (
            <div
              key={`${slot.code}-${index}`}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ left: slot.x, top: slot.y }}
              title={
                player ? `${player.name} (${player.position})` : slot.code
              }
            >
              {player ? (
                <>
                  <div className="relative">
                    <PlayerAvatar
                      player={player}
                      className="h-9 w-9 rounded-full border-[#b9f36b]/80 text-[11px] shadow-[0_0_16px_rgba(185,243,107,0.25)] sm:h-12 sm:w-12 sm:text-sm"
                    />
                    {showRatings && (
                      <span
                        className={`absolute -right-4 -top-2 z-20 min-w-[26px] rounded-md border border-black/40 px-1.5 py-0.5 text-center text-[10px] font-black leading-none tabular-nums shadow-lg sm:text-xs ${
                          ratingText
                            ? "bg-[#b9f36b] text-black"
                            : "bg-white/25 text-white/80"
                        }`}
                        aria-label={
                          ratingText
                            ? `Match rating ${ratingText}`
                            : "No match rating"
                        }
                      >
                        {ratingText ?? "—"}
                      </span>
                    )}
                  </div>

                  <span className="max-w-[68px] truncate rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold text-white sm:max-w-[84px] sm:text-[10px]">
                    {player.name.split(" ").slice(-1)[0]}
                  </span>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-white/30 bg-black/20 text-[10px] font-black text-white/40 sm:h-12 sm:w-12 sm:text-xs">
                    {slot.code}
                  </div>
                  <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/40 sm:text-[10px]">
                    {slot.code}
                  </span>
                </>
              )}
            </div>
          );
        })}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08110b]/20" />
      </div>

      {showRatings && ratings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-white/45">
          <span>
            Average rating:{" "}
            <strong className="text-[#b9f36b]">
              {(
                ratings.reduce((sum, item) => sum + safeNumber(item.rating), 0) /
                ratings.length
              ).toFixed(1)}
            </strong>
          </span>
          <span>
            Goals:{" "}
            <strong className="text-white/75">
              {ratings.reduce((sum, item) => sum + safeNumber(item.goals), 0)}
            </strong>
          </span>
          <span>
            Assists:{" "}
            <strong className="text-white/75">
              {ratings.reduce((sum, item) => sum + safeNumber(item.assists), 0)}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}