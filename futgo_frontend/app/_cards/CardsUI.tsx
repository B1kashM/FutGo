"use client";

import { STAT_KEYS, STAT_META, statTier, topStatKeys } from "./cardsShared";
import type { CardPlayer, StatKey, StatTier } from "./cardsShared";

const TIER_TEXT: Record<StatTier, string> = {
  elite: "text-amber-500 dark:text-amber-300",
  great: "text-emerald-600 dark:text-emerald-400",
  good: "text-foreground",
  low: "text-muted",
};

const TIER_BAR: Record<StatTier, string> = {
  elite: "bg-amber-400",
  great: "bg-emerald-500",
  good: "bg-foreground/45",
  low: "bg-foreground/20",
};

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

  const frame =
    result === "win"
      ? "border-emerald-400 shadow-emerald-500/30"
      : result === "lose"
        ? "border-red-400/60 opacity-90"
        : result === "tie"
          ? "border-amber-400"
          : "border-accent/40";

  return (
    <div className="w-full">
      {owner && (
        <p className="mb-2 truncate text-center text-xs font-bold uppercase tracking-[0.18em] text-muted">
          {owner}
        </p>
      )}

      <div
        className={`relative w-full overflow-hidden rounded-3xl border-2 bg-surface-2 shadow-xl ${frame} ${
          flip ? "card-flip-in" : ""
        }`}
      >
        {/* Header: rating, position, photo, name */}
        <div className="relative h-44 bg-gradient-to-b from-accent/25 to-transparent sm:h-52">
          <div className="absolute left-3 top-3 z-10 text-center leading-none">
            <div className="text-3xl font-black text-accent-text">
              {player.ovr_rating}
            </div>
            <div className="mt-1 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-black tracking-wider">
              {player.position}
            </div>
          </div>

          <div className="absolute right-3 top-3 z-10 max-w-[45%] truncate rounded-full bg-foreground/10 px-2.5 py-1 text-[10px] font-bold text-muted">
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
            <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-foreground/10">
              {player.name.charAt(0)}
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-surface-2 via-surface-2/90 to-transparent px-4 pb-2 pt-8">
            <h3 className="truncate text-lg font-black leading-tight">
              {player.name}
            </h3>
            <p className="truncate text-[11px] text-muted">{player.club}</p>
          </div>
        </div>

        {/* The 10 stats */}
        <div className="grid grid-cols-2 gap-1.5 p-3">
          {STAT_KEYS.map((key) => {
            const value = player.stats[key];
            const tier = statTier(value);
            const isLocked = lockedStat === key;
            const isSelected = selectedStat === key;

            const state = isLocked
              ? "border-accent bg-accent/20 ring-2 ring-accent"
              : isSelected
                ? "border-accent-text bg-accent/10 ring-2 ring-accent/60"
                : `border-border bg-foreground/[0.04] ${
                    selectable ? "hover:border-accent/60" : ""
                  }`;

            const inner = (
              <>
                {tier === "elite" && (
                  <span className="card-gold-shine pointer-events-none absolute inset-0 opacity-40" />
                )}
                <span className="relative flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-bold text-muted">
                    {best.has(key) && (
                      <span className="mr-1 text-amber-500 dark:text-amber-300">
                        ★
                      </span>
                    )}
                    {STAT_META[key].label}
                  </span>
                  <span className={`text-base font-black ${TIER_TEXT[tier]}`}>
                    {value}
                  </span>
                </span>
                <span className="relative mt-1 block h-1 overflow-hidden rounded-full bg-foreground/10">
                  <span
                    className={`block h-full rounded-full ${TIER_BAR[tier]}`}
                    style={{ width: `${Math.min(100, value)}%` }}
                  />
                </span>
              </>
            );

            const classes = `relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition ${state}`;

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
        <p className="mb-2 truncate text-center text-xs font-bold uppercase tracking-[0.18em] text-muted">
          {owner}
        </p>
      )}

      <div className="relative flex aspect-[3/4.4] w-full items-center justify-center overflow-hidden rounded-3xl border-2 border-accent/40 bg-gradient-to-br from-accent to-accent-2 shadow-xl">
        <div className="card-back-pattern absolute inset-0" />
        <div className="relative mx-6 rounded-2xl bg-black/40 px-6 py-5 text-center text-white backdrop-blur">
          <div className="text-6xl font-black leading-none">?</div>
          <div className="mt-3 text-sm font-black tracking-[0.2em]">{title}</div>
          {subtitle && (
            <div className="mt-1 text-xs text-white/80">{subtitle}</div>
          )}
        </div>
      </div>
    </div>
  );
}