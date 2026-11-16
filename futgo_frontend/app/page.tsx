"use client";

import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Goal,
  Info,
  Shield,
  Sparkles,
  Star,
  Swords,
  X,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import ClubPicker from "./components/ClubPicker";
import ThemeToggle from "./components/ThemeToggle";
import { useClub } from "./_theme/useClub";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

// "Play Draft" opens the game modes page, where the player picks Local or Online.
const DRAFT_HREF = "/game-modes";
const CARDS_HREF = "/cards";

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

// Pitch positions (x = across, y = GK at the top -> ST at the bottom).
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
  shirt: string;
  tone: Tone;
  stats: [string, number][];
};

// Placeholder ratings for the preview only.
const legends: Legend[] = [
  {
    name: "MARADONA",
    rating: 97,
    pos: "CAM",
    shirt: "10",
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
    shirt: "10",
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
    shirt: "05",
    tone: "club2",
    stats: [
      ["PAS", 98],
      ["DRI", 95],
      ["PHY", 82],
    ],
  },
];

// Frame colour + glow per tone. The white frame and the glow are what make
// the cards stand out on dark backgrounds.
const toneClass: Record<Tone, string> = {
  club: "bg-accent shadow-2xl shadow-accent/60",
  club2: "bg-accent-2 shadow-2xl shadow-accent-2/60",
  gold: "bg-gradient-to-b from-amber-200 via-yellow-400 to-amber-600 shadow-[0_0_34px_rgba(251,191,36,0.6)]",
};

/* ------------------------------------------------------------------ */
/* Vertical pitch (sizes scale with the pitch's own width)             */
/* ------------------------------------------------------------------ */

function Pitch({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 border-accent/50 shadow-2xl shadow-accent/30 ${className}`}
      style={{ containerType: "inline-size" }}
    >
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

      {/* Markings */}
      <div className="pitch-line absolute left-0 right-0 top-1/2 border-t" />
      <div className="pitch-line absolute left-1/2 top-1/2 aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full border" />
      <div className="pitch-line absolute left-1/2 top-0 h-[13%] w-[48%] -translate-x-1/2 rounded-b-lg border-x border-b" />
      <div className="pitch-line absolute bottom-0 left-1/2 h-[13%] w-[48%] -translate-x-1/2 rounded-t-lg border-x border-t" />

      {pitchPlayers.map((p) => (
        <div
          key={p.number}
          className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          style={{ left: p.x, top: p.y }}
        >
          <div
            className="shirt flex items-center justify-center rounded-full border-2 font-black shadow-lg"
            style={{ width: "14cqw", height: "14cqw", fontSize: "6.2cqw" }}
          >
            {p.number}
          </div>
          {/* Position labels only on wider screens, too tiny on phones */}
          <span
            className="mt-[1cqw] hidden rounded bg-black/60 px-[2cqw] font-bold leading-tight text-white lg:block"
            style={{ fontSize: "4.4cqw" }}
          >
            {p.name}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Clash-style legend card (everything scales with the card's width)   */
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
      className={`absolute aspect-[7/10] w-[37%] transition-transform duration-300 ${className}`}
    >
      <div className="h-full w-full" style={{ containerType: "inline-size" }}>
        <div
          className={`relative flex h-full w-full flex-col overflow-hidden ${toneClass[legend.tone]}`}
          style={{
            borderRadius: "10cqw",
            border: "2.6cqw solid rgba(255,255,255,0.92)",
            padding: "3cqw",
          }}
        >
          {/* Depth: light from the top, shade at the bottom */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-transparent to-black/35" />

          {/* Portrait */}
          <div
            className={`relative flex-1 overflow-hidden ${
              isGold ? "bg-amber-900/30" : "bg-black/30"
            }`}
            style={{ borderRadius: "6cqw" }}
          >
            {/* Sunburst */}
            <div
              className="absolute inset-[-60%] opacity-70"
              style={{
                background:
                  "repeating-conic-gradient(from 0deg at 50% 62%, rgba(255,255,255,0.22) 0deg 9deg, transparent 9deg 18deg)",
              }}
            />
            {/* Shirt number */}
            <span
              className="absolute inset-x-0 top-[8%] select-none text-center font-black leading-none text-white/25"
              style={{ fontSize: "58cqw" }}
            >
              {legend.shirt}
            </span>
            {/* Player bust */}
            <svg
              viewBox="0 0 100 80"
              className="absolute bottom-0 left-1/2 w-[88%] -translate-x-1/2"
              style={{ filter: "drop-shadow(0 1.5cqw 2cqw rgba(0,0,0,0.45))" }}
              fill="white"
              fillOpacity="0.95"
            >
              <circle cx="50" cy="27" r="16" />
              <path d="M10 80c0-21 17-33 40-33s40 12 40 33z" />
            </svg>

            {/* Rating + position */}
            <div
              className="absolute left-[7%] top-[5%] flex flex-col items-center leading-none text-white"
              style={{ textShadow: "0 0.8cqw 0 rgba(0,0,0,0.5)" }}
            >
              <span className="font-black" style={{ fontSize: "26cqw" }}>
                {legend.rating}
              </span>
              <span className="font-extrabold" style={{ fontSize: "10cqw" }}>
                {legend.pos}
              </span>
            </div>

            {isGold && (
              <Star
                className="absolute right-[7%] top-[6%] fill-amber-200 text-amber-50"
                style={{ width: "16cqw", height: "16cqw" }}
              />
            )}
          </div>

          {/* Name plate */}
          <div
            className="relative mt-[2.5cqw] bg-black/70 text-center font-black tracking-wide text-white"
            style={{
              borderRadius: "4cqw",
              fontSize: "11.5cqw",
              padding: "1.6cqw 1cqw",
            }}
          >
            {legend.name}
          </div>

          {/* Stats (hidden on small phones, too tiny to read) */}
          <div className="relative mt-[2cqw] hidden gap-[2cqw] lg:flex">
            {legend.stats.map(([label, value]) => (
              <span
                key={label}
                className="flex-1 bg-black/35 text-center font-bold text-white"
                style={{
                  borderRadius: "3cqw",
                  fontSize: "8cqw",
                  padding: "1.2cqw 0",
                }}
              >
                {label} {value}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mode card (the whole card is the link)                              */
/* ------------------------------------------------------------------ */

const variants = {
  a: {
    hover: "hover:border-accent/70",
    glow: "bg-accent/25",
    stage: "bg-accent/30",
    pill: "border-trim/40 bg-trim/10 text-accent-text",
    arrow: "bg-accent text-accent-ink",
  },
  b: {
    hover: "hover:border-accent-2/70",
    glow: "bg-accent-2/25",
    stage: "bg-accent-2/30",
    pill: "border-accent-2/40 bg-accent-2/10 text-accent-2-text",
    arrow: "bg-accent-2 text-accent-2-ink",
  },
};

function ModeCard({
  href,
  title,
  tagline,
  pill,
  variant,
  children,
}: {
  href: string;
  title: string;
  tagline: string;
  pill: string;
  variant: keyof typeof variants;
  children: ReactNode;
}) {
  const v = variants[variant];

  return (
    <Link
      href={href}
      className={`group relative flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-border bg-surface-2 p-3 transition duration-300 hover:-translate-y-0.5 lg:p-6 ${v.hover}`}
    >
      <div className="brand-bar absolute inset-x-0 top-0 h-1" />
      <div
        className={`pointer-events-none absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full blur-3xl ${v.glow}`}
      />

      {/* Visual */}
      <div className="relative min-h-0 flex-1">
        <div
          className={`pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl ${v.stage}`}
        />
        <div className="absolute inset-0 flex items-center justify-center py-1">
          {children}
        </div>
      </div>

      {/* Label */}
      <div className="relative mt-2 flex items-center justify-between gap-3 lg:mt-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black tracking-tight lg:text-3xl">
              {title}
            </h2>
            <span
              className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${v.pill}`}
            >
              {pill}
            </span>
          </div>
          <p className="mt-1 hidden text-sm text-muted sm:block">{tagline}</p>
        </div>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-1 lg:h-11 lg:w-11 ${v.arrow}`}
        >
          <ArrowRight size={19} />
        </span>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function Home() {
  const [showHow, setShowHow] = useState(false);
  const { club } = useClub();

  // Fix the page: no scrolling or rubber-banding on any screen size.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.style.overflow = "hidden";
    html.style.height = "100%";
    html.style.overscrollBehavior = "none";
    body.style.position = "fixed";
    body.style.inset = "0";
    body.style.width = "100%";
    body.style.height = "100%";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      html.style.overflow = "";
      html.style.height = "";
      html.style.overscrollBehavior = "";
      body.style.position = "";
      body.style.inset = "";
      body.style.width = "";
      body.style.height = "";
      body.style.overflow = "";
      body.style.overscrollBehavior = "";
    };
  }, []);

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
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      {/* Club colour bar */}
      <div className="brand-bar h-1.5 w-full shrink-0" />

      {/* Navigation */}
      <header className="relative z-20 shrink-0 border-b border-border">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-8 md:h-[68px] lg:px-12">
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

      {/* Content: always fits one screen */}
      <div className="relative mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col justify-center gap-3 px-4 py-3 sm:px-8 lg:gap-6 lg:py-6">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[300px] w-[420px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[260px] w-[360px] rounded-full bg-accent-2/15 blur-[120px]" />

        {/* Club slogan */}
        <div className="relative flex shrink-0 items-end justify-between gap-4">
          <h1 className="text-[clamp(1.6rem,7.5vw,2.25rem)] font-black leading-[0.98] tracking-[-0.05em] sm:text-4xl lg:text-5xl">
            {club.headline[0]} {club.headline[1]}{" "}
            <span className="bg-gradient-to-r from-accent-text to-accent-2-text bg-clip-text text-transparent">
              {club.headline[2]}
            </span>
          </h1>
          <div className="hidden shrink-0 items-center gap-2 rounded-full border border-trim/40 bg-trim/10 px-4 py-2 text-xs font-semibold text-accent-text md:inline-flex">
            <Sparkles size={14} />
            {club.badge}
          </div>
        </div>

        {/* Two modes: stacked on mobile, side by side on desktop */}
        <div className="relative grid min-h-0 flex-1 grid-rows-2 gap-3 lg:h-[clamp(320px,58vh,440px)] lg:flex-none lg:grid-cols-2 lg:grid-rows-1 lg:gap-6">
          <ModeCard
            href={DRAFT_HREF}
            title="Play Draft"
            tagline="Build your dream XI, pick by pick."
            pill={club.formation}
            variant="a"
          >
            <Pitch className="aspect-[133/188] h-full max-w-full" />
          </ModeCard>

          <ModeCard
            href={CARDS_HREF}
            title="Play Cards"
            tagline="Lock your best stat. Win their cards."
            pill="1v1 battle"
            variant="b"
          >
            <div className="relative aspect-[1.7/1] h-full max-w-full">
              <LegendCard
                legend={legends[0]}
                className="left-0 top-[5%] -rotate-[8deg] group-hover:-rotate-[12deg]"
              />
              <LegendCard
                legend={legends[2]}
                className="right-0 top-[5%] rotate-[8deg] group-hover:rotate-[12deg]"
              />
              <LegendCard
                legend={legends[1]}
                className="left-[31.5%] top-0 z-10 group-hover:-translate-y-1"
              />
            </div>
          </ModeCard>
        </div>

        <p className="relative hidden shrink-0 text-center text-xs text-muted md:block">
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