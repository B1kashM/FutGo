"use client";

import { STAT_KEYS, STAT_META, statTier, topStatKeys } from "./cardsShared";
import type { CardPlayer, StatKey, StatTier } from "./cardsShared";

const TIER_CLASS: Record<StatTier, string> = {
  elite: "stat-elite",
  great: "stat-great",
  good: "stat-good",
  low: "stat-low",
};

const RESULT_CLASS = {
  win: "pcard-win",
  lose: "pcard-lose",
  tie: "pcard-tie",
} as const;

type PlayerCardProps = {
  player: CardPlayer;
  /** The stat the challenger locked (highlighted strongly). */
  lockedStat?: StatKey | null;
  /** The stat currently picked (before locking). */
  selectedStat?: StatKey | null;
  /** When given, stats become tappable (challenger's choosing turn). */
  onSelectStat?: (stat: StatKey) => void;
  result?: "win" | "lose" | "tie" | null;
  /** Play the flip-in animation when the card appears. */
  flip?: boolean;
  /** Small caption above the card, e.g. the owner's name. */
  owner?: string;
};

export function PlayerCard({
  player,
  lockedStat = null,
  selectedStat = null,
  onSelectStat,
  result = null,
  flip = false,
  owner,
}: PlayerCardProps) {
  const selectable = Boolean(onSelectStat);
  const best = new Set(topStatKeys(player.stats, 3));

  return (
    <div className="w-full">
      {owner && (
        <p className="mb-2 truncate text-center text-xs font-black uppercase tracking-[0.18em] text-foreground/70">
          {owner}
        </p>
      )}

      <div
        className={`pcard relative w-full overflow-hidden rounded-3xl ${
          result ? RESULT_CLASS[result] : ""
        } ${flip ? "card-flip-in" : ""}`}
      >
        {/* Header: rating, position, photo, name */}
        <div className="pcard-photo relative h-44 sm:h-52">
          <div className="absolute left-3 top-3 z-10 flex flex-col items-center gap-1">
            <div className="rounded-xl bg-amber-400 px-2.5 py-1 text-2xl font-black leading-none text-slate-900 shadow-md">
              {player.ovr_rating}
            </div>
            <div className="rounded-md bg-accent-2 px-2 py-0.5 text-[10px] font-black tracking-wider text-accent-2-ink shadow">
              {player.position}
            </div>
          </div>

          <div className="absolute right-3 top-3 z-10 max-w-[45%] truncate rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white shadow">
            {player.country}
          </div>

          {player.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={player.image_url}
              alt={player.name}
              referrerPolicy="no-referrer"
              className="absolute inset-x-0 bottom-0 mx-auto h-[92%] w-auto max-w-full object-contain object-bottom"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white/20">
              {player.name.charAt(0)}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-4 pb-2 pt-9">
            <h3 className="truncate text-lg font-black leading-tight text-white">
              {player.name}
            </h3>
            <p className="truncate text-[11px] font-semibold text-white/75">
              {player.club}
            </p>
          </div>
        </div>

        {/* The 10 stats */}
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {STAT_KEYS.map((key) => {
            const value = player.stats[key];
            const tier = statTier(value);
            const isLocked = lockedStat === key;
            const isSelected = selectedStat === key;

            const classes = `stat-tile ${TIER_CLASS[tier]} ${
              isLocked ? "stat-locked" : isSelected ? "stat-selected" : ""
            } ${selectable ? "stat-pick" : ""} relative overflow-hidden`;

            const inner = (
              <>
                {tier === "elite" && (
                  <span className="card-gold-shine pointer-events-none absolute inset-0 opacity-50" />
                )}
                <span className="relative flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-bold opacity-90">
                    {best.has(key) && <span className="mr-1">★</span>}
                    {STAT_META[key].label}
                  </span>
                  <span className="text-base font-black">{value}</span>
                </span>
                <span className="stat-track relative mt-1 block h-1.5 overflow-hidden rounded-full">
                  <span
                    className="stat-fill block h-full rounded-full"
                    style={{ width: `${Math.min(100, value)}%` }}
                  />
                </span>
              </>
            );

            return selectable ? (
              <button
                key={key}
                type="button"
                onClick={() => onSelectStat?.(key)}
                className={classes}
              >
                {inner}
              </button>
            ) : (
              <div key={key} className={classes}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

type CardBackProps = {
  title: string;
  subtitle?: string;
  owner?: string;
};

export function CardBack({ title, subtitle, owner }: CardBackProps) {
  return (
    <div className="w-full">
      {owner && (
        <p className="mb-2 truncate text-center text-xs font-black uppercase tracking-[0.18em] text-foreground/70">
          {owner}
        </p>
      )}

      <div className="relative flex aspect-[3/4.4] w-full items-center justify-center overflow-hidden rounded-3xl border-[3px] border-amber-400 bg-gradient-to-br from-accent to-accent-2 shadow-xl">
        <div className="card-back-pattern absolute inset-0" />
        <div className="relative mx-6 rounded-2xl border-2 border-amber-400 bg-slate-900 px-6 py-5 text-center text-white shadow-2xl">
          <div className="text-6xl font-black leading-none text-amber-400">?</div>
          <div className="mt-3 text-sm font-black tracking-[0.2em]">{title}</div>
          {subtitle && (
            <div className="mt-1 text-xs text-white/75">{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}