"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Check, LoaderCircle, Shield, Users } from "lucide-react";

import {
  DRAFT_CATEGORIES,
  apiRequest,
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

/**
 * Mobile: the setup screen is pinned to the viewport, below the site header.
 * Change `top-[83px]` if your DraftPageShell header is a different height.
 * The page itself never scrolls; the panel only scrolls internally on very
 * short screens so the Start button can never become unreachable.
 */
const MOBILE_SCREEN =
  "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:top-[83px] max-md:z-30 max-md:overflow-y-auto max-md:overscroll-contain max-md:bg-background max-md:px-4 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function useLockMobileScroll(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;

    const mq = window.matchMedia("(max-width: 767px)");
    const html = document.documentElement;

    const apply = () => {
      const locked = mq.matches;
      html.style.overflow = locked ? "hidden" : "";
      document.body.style.overflow = locked ? "hidden" : "";
      html.style.overscrollBehavior = locked ? "none" : "";
      document.body.style.overscrollBehavior = locked ? "none" : "";
    };

    apply();
    mq.addEventListener("change", apply);

    return () => {
      mq.removeEventListener("change", apply);
      html.style.overflow = "";
      document.body.style.overflow = "";
      html.style.overscrollBehavior = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [active]);
}

export default function LocalDraftPage() {
  const [player1Name, setPlayer1Name] = useState("");
  const [player2Name, setPlayer2Name] = useState("");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryValue | "">("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [player1TeamId, setPlayer1TeamId] = useState("");
  const [player2TeamId, setPlayer2TeamId] = useState("");
  const [teamsLoading, setTeamsLoading] = useState(false);

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    matchData,
    matchHistory,
    matchMinute,
    matchFinished,
    playMatch,
    watchAgain,
    showPreviousMatch,
    clearMatches,
  } = useMatchPlayback();

  // Lock page scroll on mobile while the setup screen is showing.
  useLockMobileScroll(!draft);

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
          setError(
            err instanceof Error
              ? `Unable to load football clubs: ${err.message}`
              : "Unable to load football clubs.",
          );
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

  const selectedTeam1 = useMemo(
    () => teams.find((team) => String(team.id) === player1TeamId) ?? null,
    [teams, player1TeamId],
  );

  const selectedTeam2 = useMemo(
    () => teams.find((team) => String(team.id) === player2TeamId) ?? null,
    [teams, player2TeamId],
  );

  const completed =
    draft?.status === "COMPLETED" || (!draft?.current_event && !!draft);

  const categoryLabel = getCategoryLabel(draft?.category || selectedCategory);

  const withTeams = (updated: DraftState, previous: DraftState): DraftState => ({
    ...updated,
    category: updated.category || previous.category,
    player1_team: updated.player1_team || previous.player1_team,
    player2_team: updated.player2_team || previous.player2_team,
  });

  const startDraft = async (event: FormEvent<HTMLFormElement>) => {
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

    if (!player1TeamId || !player2TeamId) {
      setError("Choose a football club for both players.");
      return;
    }

    if (player1TeamId === player2TeamId) {
      setError("Both players must choose different football clubs.");
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
            player1_team_id: Number(player1TeamId),
            player2_team_id: Number(player2TeamId),
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
        player1_team: state.player1_team || selectedTeam1,
        player2_team: state.player2_team || selectedTeam2,
      });
      clearMatches();
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

      setDraft(withTeams(updated, draft));
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

      setDraft(withTeams(updated, draft));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed.");
    } finally {
      setLoading(false);
    }
  };

  const startMatch = async () => {
    if (!draft || loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await apiRequest<MatchResult>(
        `/api/drafts/${draft.draft_id}/match/`,
        {
          method: "POST",
          headers: {
            "Idempotency-Key": makeIdempotencyKey(),
          },
        },
      );

      playMatch(result, {
        player1_team: draft.player1_team,
        player2_team: draft.player2_team,
      });
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

  const resetDraft = () => {
    setDraft(null);
    setPlayer1Name("");
    setPlayer2Name("");
    setSelectedCategory("");
    setPlayer1TeamId("");
    setPlayer2TeamId("");
    clearMatches();
    setError("");
  };

  return (
    <DraftPageShell>
      {!draft ? (
        <section
          className={`${MOBILE_SCREEN} mx-auto max-w-6xl pt-3 sm:py-12`}
        >
          <div className="mb-3 flex flex-wrap items-end justify-between gap-4 sm:mb-7">
            <div>
              <div className="mb-3 hidden items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-[0.16em] text-accent-text sm:inline-flex">
                <Users size={14} /> Local multiplayer
              </div>
              <h1 className="text-2xl font-black tracking-tight sm:text-5xl">
                CREATE YOUR DRAFT
              </h1>
              <p className="mt-3 hidden max-w-2xl text-sm leading-6 text-muted sm:block sm:text-base">
                Choose a player pool, name both managers, and assign a different club to each side.
              </p>
            </div>
            <div className="hidden gap-2 text-xs text-muted sm:flex">
              <span className="rounded-full border border-border bg-foreground/[0.03] px-3 py-2">2 managers</span>
              <span className="rounded-full border border-border bg-foreground/[0.03] px-3 py-2">11 rounds</span>
              <span className="rounded-full border border-border bg-foreground/[0.03] px-3 py-2">22 players</span>
            </div>
          </div>

          <form onSubmit={startDraft} className="overflow-visible rounded-[22px] border border-border bg-surface shadow-2xl shadow-black/10 sm:rounded-[28px] dark:shadow-black/20">
            <div className="border-b border-border px-4 py-3 sm:px-7 sm:py-5">
              <div className="mb-2 flex items-center justify-between gap-3 sm:mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-text sm:text-xs">Step 1</p>
                  <h2 className="mt-0.5 text-base font-black sm:mt-1 sm:text-xl">Choose your player pool</h2>
                </div>
                {selectedCategory && (
                  <span className="hidden rounded-full border border-accent/20 bg-accent/[0.06] px-3 py-1.5 text-xs font-bold text-accent-text sm:inline-flex">
                    {DRAFT_CATEGORIES.find((category) => category.value === selectedCategory)?.label}
                  </span>
                )}
              </div>
              <CategoryGrid
                value={selectedCategory}
                disabled={loading}
                onChange={(value) => {
                  setSelectedCategory(value);
                  setError("");
                }}
              />
            </div>

            <div className="grid gap-0 lg:grid-cols-2">
              <div className="border-b border-border p-4 sm:p-7 lg:border-b-0 lg:border-r">
                <div className="mb-3 flex items-center gap-3 sm:mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-sm font-black text-accent-text sm:h-10 sm:w-10 sm:rounded-xl sm:text-base">01</div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Manager one</p>
                    <h3 className="text-base font-black sm:text-lg">Home side</h3>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-semibold text-muted sm:mb-2">Player name</span>
                    <input
                      value={player1Name}
                      onChange={(event) => setPlayer1Name(event.target.value)}
                      placeholder="Enter first player's name"
                      maxLength={40}
                      required
                      disabled={loading}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60 sm:py-3.5"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-semibold text-muted sm:mb-2">Football club</span>
                    <TeamDropdown
                      teams={teams}
                      value={player1TeamId}
                      placeholder={teamsLoading ? "Loading clubs..." : "Select a team"}
                      disabled={teamsLoading || loading}
                      onChange={(value) => {
                        setPlayer1TeamId(value);
                        setError("");
                      }}
                    />
                  </label>
                </div>
                <div className="mt-4 hidden min-h-[72px] sm:block">
                  {selectedTeam1 ? (
                    <TeamBadge team={selectedTeam1} />
                  ) : (
                    <div className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm text-muted">
                      <Shield size={20} /> Your selected club will appear here
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-7">
                <div className="mb-3 flex items-center gap-3 sm:mb-5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-2/10 text-sm font-black text-accent-2-text sm:h-10 sm:w-10 sm:rounded-xl sm:text-base">02</div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted sm:text-xs">Manager two</p>
                    <h3 className="text-base font-black sm:text-lg">Away side</h3>
                  </div>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-4">
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-semibold text-muted sm:mb-2">Player name</span>
                    <input
                      value={player2Name}
                      onChange={(event) => setPlayer2Name(event.target.value)}
                      placeholder="Enter second player's name"
                      maxLength={40}
                      required
                      disabled={loading}
                      className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-foreground/30 focus:border-accent-text/70 focus:ring-2 focus:ring-accent/20 disabled:opacity-60 sm:py-3.5"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className="mb-1.5 block text-xs font-semibold text-muted sm:mb-2">Football club</span>
                    <TeamDropdown
                      teams={teams}
                      value={player2TeamId}
                      placeholder={teamsLoading ? "Loading clubs..." : "Select a different team"}
                      disabled={teamsLoading || loading}
                      excludedId={player1TeamId}
                      onChange={(value) => {
                        setPlayer2TeamId(value);
                        setError("");
                      }}
                    />
                  </label>
                </div>
                <div className="mt-4 hidden min-h-[72px] sm:block">
                  {selectedTeam2 ? (
                    <TeamBadge team={selectedTeam2} />
                  ) : (
                    <div className="flex h-[72px] items-center gap-3 rounded-xl border border-dashed border-border px-4 text-sm text-muted">
                      <Shield size={20} /> Choose a different club for the away side
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-b-[22px] border-t border-border bg-foreground/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:rounded-b-[28px] sm:px-7 sm:py-5">
              <div className="min-w-0">
                {selectedCategory && player1TeamId && player2TeamId && player1TeamId !== player2TeamId ? (
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground/75">
                    <Check size={17} className="shrink-0 text-accent-text" />
                    <span className="truncate">
                      {selectedTeam1?.name} <span className="text-muted">vs</span> {selectedTeam2?.name}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs leading-5 text-muted">
                    Select a category, enter both names, and choose two different clubs.
                  </p>
                )}
                {teams.length === 0 && !teamsLoading && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-300">No clubs found. Add clubs to the backend first.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={
                  loading ||
                  teamsLoading ||
                  !selectedCategory ||
                  !player1Name.trim() ||
                  !player2Name.trim() ||
                  !player1TeamId ||
                  !player2TeamId ||
                  player1TeamId === player2TeamId ||
                  player1Name.trim().toLowerCase() === player2Name.trim().toLowerCase()
                }
                className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-7 py-3 font-black text-accent-ink transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-56 sm:py-4"
              >
                {loading ? (
                  <>
                    <LoaderCircle size={19} className="animate-spin" /> Setting up draft...
                  </>
                ) : (
                  <>
                    Start drafting <ArrowRight size={19} />
                  </>
                )}
              </button>
            </div>
            {error && (
              <div className="p-3 sm:p-5 sm:px-7">
                <ErrorMessage message={error} />
              </div>
            )}
          </form>
        </section>
      ) : matchData ? (
        <MatchCentreView
          matchData={matchData}
          draft={draft}
          matchMinute={matchMinute}
          matchFinished={matchFinished}
          matchHistory={matchHistory}
          loading={loading}
          error={error}
          onWatchAgain={watchAgain}
          onRematch={startMatch}
          onReset={resetDraft}
          onShowPrevious={(match) => {
            showPreviousMatch(match);
            setError("");
          }}
        />
      ) : completed ? (
        <DraftCompleteView
          draft={draft}
          categoryLabel={categoryLabel}
          loading={loading}
          error={error}
          onStartMatch={startMatch}
          onReset={resetDraft}
        />
      ) : (
        <DraftingView
          draft={draft}
          modeLabel="Local draft"
          categoryLabel={categoryLabel}
          loading={loading}
          error={error}
          onPick={choosePlayer}
          onRefresh={refreshDraft}
        />
      )}
    </DraftPageShell>
  );
}