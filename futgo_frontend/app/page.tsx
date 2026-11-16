"use client";

import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Gamepad2,
  Globe2,
  Goal,
  Info,
  Layers,
  Shield,
  Sparkles,
  Star,
  Swords,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import ClubPicker from "./components/ClubPicker";
import ThemeToggle from "./components/ThemeToggle";
import { useClub } from "./_theme/useClub";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const stepMeta = [
  {
    number: "01",
    description: "Pick your perfect starting eleven, one position at a time.",
    icon: Shield,
  },
  {
    number: "02",
    description: "Two managers. Two choices. Every pick changes the game.",
    icon: Swords,
  },
  {
    number: "03",
    description: "Complete your squad and find out who built the better team.",
    icon: Crown,
  },
];

const pitchPlayers = [
  { x: "50%", y: "13%", name: "GK", number: "01" },
  { x: "17%", y: "30%", name: "LB", number: "02" },
  { x: "39%", y: "30%", name: "CB", number: "03" },
  { x: "61%", y: "30%", name: "CB", number: "04" },
  { x: "83%", y: "30%", name: "RB", number: "05" },
  { x: "25%", y: "51%", name: "CM", number: "06" },
  { x: "50%", y: "51%", name: "DM", number: "07" },
  { x: "75%", y: "51%", name: "AM", number: "08" },
  { x: "20%", y: "73%", name: "LW", number: "09" },
  { x: "50%", y: "82%", name: "ST", number: "10" },
  { x: "80%", y: "73%", name: "RW", number: "11" },
];

type Tone = "club" | "gold" | "club2";

type Legend = {
  name: string;
  rating: number;
  pos: string;
  tone: Tone;
  stats: [string, number][];
};

// Placeholder ratings for the preview only.
const legends: Legend[] = [
  {
    name: "MARADONA",
    rating: 97,
    pos: "CAM",
    tone: "club",
    stats: [
      ["DRI", 99],
      ["PAS", 92],
      ["PHY", 80],
    ],
  },
  {
    name: "PELÉ",
    rating: 98,
    pos: "ST",
    tone: "gold",
    stats: [
      ["SHO", 97],
      ["DRI", 96],
      ["PAC", 93],
    ],
  },
  {
    name: "ZIDANE",
    rating: 96,
    pos: "CM",
    tone: "club2",
    stats: [
      ["PAS", 98],
      ["DRI", 95],
      ["PHY", 82],
    ],
  },
];

const toneClass: Record<Tone, string> = {
  club: "bg-accent",
  club2: "bg-accent-2",
  gold: "bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600",
};

/* ------------------------------------------------------------------ */
/* Clash-style legend card                                             */
/* ------------------------------------------------------------------ */

function LegendCard({
  legend,
  className = "",
}: {
  legend: Legend;
  className?: string;
}) {
  const isGold = legend.tone === "gold";

  return (
    <div
      className={`absolute flex h-[112px] w-[80px] flex-col overflow-hidden rounded-xl border-[3px] border-b-[5px] border-black/35 p-1 shadow-xl shadow-black/40 transition-transform duration-300 lg:h-[186px] lg:w-[132px] lg:rounded-2xl lg:p-1.5 ${toneClass[legend.tone]} ${className}`}
    >
      {/* Portrait */}
      <div className="relative flex-1 overflow-hidden rounded-lg bg-black/25">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.35),transparent_65%)]" />
        <span className="absolute inset-0 flex select-none items-center justify-center text-[46px] font-black leading-none text-white/85 lg:text-[82px]">
          {legend.name[0]}
        </span>

        {/* Rating bubble, like the elixir cost on a Clash card */}
        <div className="absolute left-1 top-1 flex flex-col items-center leading-none text-white drop-shadow-[0_1px_0_rgba(0,0,0,0.6)]">
          <span className="text-[15px] font-black lg:text-[26px]">
            {legend.rating}
          </span>
          <span className="text-[7px] font-extrabold lg:text-[10px]">
            {legend.pos}
          </span>
        </div>

        {isGold && (
          <Star
            size={14}
            className="absolute right-1 top-1 fill-amber-200 text-amber-100 lg:h-5 lg:w-5"
          />
        )}
      </div>

      {/* Name plate */}
      <div className="mt-1 rounded-md bg-black/60 px-1 py-0.5 text-center text-[8px] font-black tracking-wide text-white lg:text-[12px]">
        {legend.name}
      </div>

      {/* Stats (desktop only, too small on mobile) */}
      <div className="mt-1 hidden justify-between gap-1 lg:flex">
        {legend.stats.map(([label, value]) => (
          <span
            key={label}
            className="flex-1 rounded bg-black/30 py-0.5 text-center text-[9px] font-bold text-white"
          >
            {label} {value}
          </span>
        ))}
      </div>

      {/* Gloss */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/25 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [showHow, setShowHow] = useState(false);
  const { club } = useClub();

  // Close the how-to-play dialog with Escape.
  useEffect(() => {
    if (!showHow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHow(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHow]);

  // Keep the browser's status-bar / notch colour in sync with the page
  // background (follows the light/dark toggle and the club theme).
  useEffect(() => {
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    const tag = meta;

    const sync = () => {
      const colour = getComputedStyle(document.body).backgroundColor;
      if (colour) tag.content = colour;
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "data-club", "style"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background text-foreground">
      {/* Club colour bar */}
      <div className="brand-bar h-1.5 w-full" />

      {/* Navigation */}
      <header className="relative z-20 border-b border-border">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-4 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3">
            <div className="shirt flex h-10 w-10 items-center justify-center rounded-xl border-2">
              <Goal size={22} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-xl font-black tracking-[0.18em]">
                FUT<span className="text-accent-text">GO</span>
              </div>
              <div className="text-[9px] font-semibold tracking-[0.28em] text-muted">
                {club.brandTag}
              </div>
            </div>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* The club picker lives on the landing page only */}
            <ClubPicker />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setShowHow(true)}
              aria-label="How to play"
              className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm font-semibold text-muted transition hover:border-accent/60 hover:text-foreground sm:px-4"
            >
              <Info size={18} />
              <span className="hidden sm:inline">How to play</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 sm:px-8 lg:gap-6 lg:px-12 lg:py-8">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[360px] w-[480px] -translate-x-1/2 rounded-full bg-accent/15 blur-[130px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[320px] w-[420px] rounded-full bg-accent-2/15 blur-[130px]" />

        {/* Title row */}
        <div className="relative flex items-center justify-between gap-4">
          <h1 className="sr-only md:not-sr-only md:text-3xl md:font-black md:tracking-tight lg:text-4xl">
            {club.headline.join(" ")}
          </h1>
          <div className="hidden items-center gap-2 rounded-full border border-trim/40 bg-trim/10 px-4 py-2 text-xs font-semibold text-accent-text md:inline-flex">
            <Sparkles size={14} />
            {club.badge}
          </div>
        </div>

        {/* The two modes: stacked on mobile, side by side on desktop */}
        <div className="relative grid flex-1 grid-rows-2 gap-4 lg:grid-cols-2 lg:grid-rows-1 lg:gap-6">
          {/* ---------------- Play Draft ---------------- */}
          <article className="group relative flex flex-row items-center justify-between gap-4 overflow-hidden rounded-3xl border border-border bg-surface-2 p-5 transition-colors duration-300 hover:border-accent/60 lg:flex-col-reverse lg:items-stretch lg:justify-between lg:gap-8 lg:p-8">
            <div className="brand-bar absolute inset-x-0 top-0 h-1" />
            <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-accent/25 blur-3xl" />

            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent-text lg:h-12 lg:w-12">
                  <Shield size={22} />
                </div>
                <span className="rounded-full border border-trim/40 bg-trim/10 px-3 py-1 text-[10px] font-bold text-accent-text">
                  {club.formation}
                </span>
              </div>

              <h2 className="mt-3 text-xl font-black tracking-tight lg:mt-5 lg:text-3xl">
                Play Draft
              </h2>
              <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted lg:text-sm lg:leading-6">
                Build your dream eleven pick by pick and out-draft your rival.
              </p>

              <div className="mt-4 flex flex-col gap-2 lg:mt-6 lg:flex-row lg:gap-3">
                <Link
                  href="/local-draft"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-extrabold text-accent-ink transition hover:brightness-110 lg:px-5 lg:py-3"
                >
                  <Gamepad2 size={17} />
                  Local
                </Link>
                <Link
                  href="/online-draft"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent-2 px-4 py-2.5 text-sm font-extrabold text-accent-2-ink transition hover:brightness-110 lg:px-5 lg:py-3"
                >
                  <Globe2 size={17} />
                  Online
                </Link>
              </div>
            </div>

            {/* Club pitch */}
            <div className="relative flex shrink-0 items-center justify-center lg:flex-1 lg:rounded-2xl lg:border lg:border-border lg:bg-background/40 lg:py-6">
              <div className="relative h-[168px] w-[119px] -rotate-3 overflow-hidden rounded-2xl border border-accent/35 shadow-xl shadow-accent/15 lg:h-[270px] lg:w-[191px] lg:rotate-0">
                {/* Stripes alternate the club's two colours */}
                <div className="absolute inset-0 flex flex-col bg-surface-2">
                  {Array.from({ length: 11 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 ${
                        i % 2 === 0
                          ? "bg-accent dark:brightness-75"
                          : "bg-accent-2 dark:brightness-75"
                      }`}
                    />
                  ))}
                </div>

                <div className="pitch-line absolute left-0 right-0 top-1/2 border-t" />
                <div className="pitch-line absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border lg:h-16 lg:w-16" />
                <div className="pitch-line absolute left-1/2 top-0 h-7 w-14 -translate-x-1/2 rounded-b-lg border-x border-b lg:h-10 lg:w-24" />
                <div className="pitch-line absolute bottom-0 left-1/2 h-7 w-14 -translate-x-1/2 rounded-t-lg border-x border-t lg:h-10 lg:w-24" />

                {pitchPlayers.map((player) => (
                  <div
                    key={player.number}
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                    style={{ left: player.x, top: player.y }}
                  >
                    <div className="shirt flex h-5 w-5 items-center justify-center rounded-full border text-[7px] font-black shadow lg:h-7 lg:w-7 lg:border-2 lg:text-[10px]">
                      {player.number}
                    </div>
                    <span className="hidden rounded bg-black/60 px-1 text-[8px] font-bold leading-3 text-white lg:block">
                      {player.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          {/* ---------------- Play Cards ---------------- */}
          <Link
            href="/cards"
            className="group relative flex flex-row items-center justify-between gap-4 overflow-hidden rounded-3xl border border-border bg-surface-2 p-5 transition-colors duration-300 hover:border-accent-2/60 lg:flex-col-reverse lg:items-stretch lg:justify-between lg:gap-8 lg:p-8"
          >
            <div className="brand-bar absolute inset-x-0 top-0 h-1" />
            <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-accent-2/25 blur-3xl" />

            <div className="relative min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-2/15 text-accent-2-text lg:h-12 lg:w-12">
                  <Layers size={22} />
                </div>
                <span className="rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1 text-[10px] font-bold text-accent-2-text">
                  1v1 card battle
                </span>
              </div>

              <h2 className="mt-3 text-xl font-black tracking-tight lg:mt-5 lg:text-3xl">
                Play Cards
              </h2>
              <p className="mt-1.5 max-w-sm text-xs leading-5 text-muted lg:text-sm lg:leading-6">
                Lock your best stat, make your rival reveal their card, and the
                higher stat wins both.
              </p>

              <span className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-accent-2 px-4 py-2.5 text-sm font-extrabold text-accent-2-ink transition group-hover:brightness-110 lg:mt-6 lg:px-5 lg:py-3">
                Start a battle
                <ArrowRight
                  size={17}
                  className="transition group-hover:translate-x-1"
                />
              </span>
            </div>

            {/* Legends card fan */}
            <div className="relative flex shrink-0 items-center justify-center lg:flex-1 lg:rounded-2xl lg:border lg:border-border lg:bg-background/40 lg:py-6">
              <div className="relative h-[140px] w-[136px] lg:h-[230px] lg:w-[364px]">
                <LegendCard
                  legend={legends[0]}
                  className="left-0 top-4 -rotate-[9deg] group-hover:-rotate-[13deg] lg:top-6"
                />
                <LegendCard
                  legend={legends[2]}
                  className="right-0 top-4 rotate-[9deg] group-hover:rotate-[13deg] lg:top-6"
                />
                <LegendCard
                  legend={legends[1]}
                  className="left-1/2 top-0 z-10 -translate-x-1/2 group-hover:-translate-y-1"
                />
              </div>
            </div>
          </Link>
        </div>

        <p className="relative text-center text-xs text-muted">
          Built by Bikash. The PesGoalPoacher. {club.footerCheer}
        </p>
      </div>

      {/* How to play dialog */}
      {showHow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowHow(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="How to play"
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface p-6 shadow-2xl"
          >
            <button
              type="button"
              aria-label="Close"
              onClick={() => setShowHow(false)}
              className="absolute right-4 top-4 rounded-lg border border-border p-2 text-muted transition hover:text-foreground"
            >
              <X size={18} />
            </button>

            <div className="pr-10">
              <div className="text-[10px] font-bold tracking-[0.22em] text-accent-text">
                SIMPLE TO LEARN. HARD TO MASTER.
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                THREE STEPS. ONE DREAM TEAM.
              </h2>
            </div>

            <div className="mt-5 flex flex-col gap-3">
              {stepMeta.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className="rounded-2xl border border-border bg-surface-2 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-accent-text">
                        {step.number}
                      </span>
                      <Icon size={20} className="text-muted" />
                    </div>
                    <h3 className="mt-3 text-lg font-bold">
                      {club.stepTitles[i]}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted">
                      {step.description}
                    </p>
                    <div
                      className={`mt-3 h-1 w-12 rounded-full ${
                        i % 2 === 0 ? "bg-accent" : "bg-accent-2"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}