"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CircleHelp,
  Crown,
  Gamepad2,
  Globe2,
  Goal,
  Menu,
  Shield,
  Sparkles,
  Swords,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState, type MouseEvent } from "react";
import ClubPicker from "./components/ClubPicker";
import ThemeToggle from "./components/ThemeToggle";
import { useClub } from "./_theme/useClub";

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
  { x: "50%", y: "11%", name: "GK", number: "01" },
  { x: "17%", y: "31%", name: "LB", number: "02" },
  { x: "39%", y: "31%", name: "CB", number: "03" },
  { x: "61%", y: "31%", name: "CB", number: "04" },
  { x: "83%", y: "31%", name: "RB", number: "05" },
  { x: "25%", y: "51%", name: "CM", number: "06" },
  { x: "50%", y: "51%", name: "DM", number: "07" },
  { x: "75%", y: "51%", name: "AM", number: "08" },
  { x: "20%", y: "74%", name: "LW", number: "09" },
  { x: "50%", y: "81%", name: "ST", number: "10" },
  { x: "80%", y: "74%", name: "RW", number: "11" },
];

const mobileChips = [
  { icon: Users, label: "2 managers" },
  { icon: Shield, label: "11 picks" },
  { icon: Zap, label: "1 winner" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModes, setShowModes] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const { club } = useClub();

  const isMobile = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;

  // On mobile the page is a fixed screen: never let the anchor jump scroll it.
  const openModes = (e: MouseEvent) => {
    setMenuOpen(false);
    if (isMobile()) {
      e.preventDefault();
      setShowModes(true);
    }
  };

  const openHow = (e: MouseEvent) => {
    setMenuOpen(false);
    if (isMobile()) {
      e.preventDefault();
      setShowHow(true);
    }
  };

  // Hard-lock the page on mobile. `position: fixed` on <body> is what actually
  // stops iOS/Android from scrolling or rubber-banding the background.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const html = document.documentElement;
    const body = document.body;

    const reset = () => {
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

    const apply = () => {
      if (!mq.matches) {
        reset();
        return;
      }
      html.style.overflow = "hidden";
      html.style.height = "100%";
      html.style.overscrollBehavior = "none";
      body.style.position = "fixed";
      body.style.inset = "0";
      body.style.width = "100%";
      body.style.height = "100%";
      body.style.overflow = "hidden";
      body.style.overscrollBehavior = "none";
    };

    apply();
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      reset();
    };
  }, []);

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
    <main className="relative h-[100dvh] overflow-hidden bg-background text-foreground md:h-auto md:min-h-screen md:overflow-visible">
      {/* Club colour bar */}
      <div className="brand-bar h-1.5 w-full" />

      {/* Navigation */}
      <header className="relative z-20 border-b border-border">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
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

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              onClick={openHow}
              className="text-sm text-muted transition hover:text-foreground"
            >
              How to play
            </a>
            <a
              href="#game-modes"
              onClick={openModes}
              className="text-sm text-muted transition hover:text-foreground"
            >
              Matchday
            </a>
            <a
              href="#about"
              className="text-sm text-muted transition hover:text-foreground"
            >
              About FutGo
            </a>
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* The club picker lives on the landing page only */}
            <ClubPicker />
            <ThemeToggle />

            <a
              href="#game-modes"
              onClick={openModes}
              className="hidden items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-ink transition hover:brightness-110 sm:flex"
            >
              Play now <ArrowUpRight size={16} />
            </a>

            <button
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen(!menuOpen)}
              className="rounded-lg border border-border p-2 md:hidden"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="absolute left-0 right-0 top-full flex flex-col gap-4 border-b border-border bg-surface p-6 md:hidden">
            <a href="#how-it-works" onClick={openHow}>
              How to play
            </a>
            <a href="#game-modes" onClick={openModes}>
              Matchday
            </a>
            <a href="#about" onClick={() => setMenuOpen(false)}>
              About FutGo
            </a>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section
        className={`relative h-[calc(100dvh-83px)] overflow-hidden md:h-auto md:overflow-visible ${
          showModes ? "hidden md:block" : "block"
        }`}
      >
        <div className="pointer-events-none absolute left-1/4 top-0 h-[500px] w-[600px] -translate-x-1/2 rounded-full bg-accent/20 blur-[130px]" />
        <div className="pointer-events-none absolute right-0 top-20 h-[420px] w-[520px] rounded-full bg-accent-2/20 blur-[130px]" />

        <div className="relative mx-auto grid h-full max-w-7xl content-center items-center gap-3 overflow-hidden px-5 py-6 sm:px-8 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-12 lg:py-28">
          <div>
            {/* Badge: desktop only */}
            <div className="mb-4 hidden items-center gap-2 rounded-full border border-trim/40 bg-trim/10 px-4 py-2 text-xs font-semibold text-accent-text md:inline-flex">
              <Sparkles size={14} />
              {club.badge}
            </div>

            {/* Mobile: text left, pitch right. Desktop: normal block */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 md:block">
              <div>
                <h1 className="max-w-2xl text-[clamp(2.2rem,10.5vw,3.2rem)] font-black leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[76px]">
                  {club.headline[0]}
                  <br />
                  {club.headline[1]}
                  <br />
                  <span className="bg-gradient-to-r from-accent-text to-accent-2-text bg-clip-text text-transparent">
                    {club.headline[2]}
                  </span>
                </h1>

                <div className="mt-6 flex flex-col gap-2.5 md:mt-6 md:flex-row md:flex-wrap md:gap-3">
                  <a
                    href="#game-modes"
                    onClick={openModes}
                    className="group inline-flex w-full items-center justify-center gap-3 rounded-xl bg-accent px-5 py-3.5 text-sm font-bold text-accent-ink shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:brightness-110 md:w-auto"
                  >
                    Start drafting
                    <ArrowRight
                      size={19}
                      className="transition group-hover:translate-x-1"
                    />
                  </a>
                  <a
                    href="#how-it-works"
                    onClick={openHow}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border px-5 py-3.5 text-sm font-semibold text-foreground/80 transition hover:border-accent-2 hover:bg-accent-2/10 md:w-auto"
                  >
                    <CircleHelp size={18} />
                    How to play
                  </a>
                </div>
              </div>

              {/* Mobile pitch: fixed size, raised above the headline */}
              <div className="relative -mt-8 h-[210px] w-[150px] shrink-0 self-start overflow-hidden rounded-2xl border border-accent/30 shadow-lg shadow-accent/10 md:hidden">
                {/* Stripes fill the whole pitch, alternating the club's two colours */}
                <div className="absolute inset-0 flex flex-col bg-surface-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex-1 ${
                        i % 2 === 0 ? "bg-accent/35" : "bg-accent-2/35"
                      }`}
                    />
                  ))}
                </div>
                <div className="pitch-line absolute left-0 right-0 top-1/2 border-t" />
                <div className="pitch-line absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border" />
                <div className="pitch-line absolute left-1/2 top-0 h-8 w-16 -translate-x-1/2 rounded-b-lg border-x border-b" />
                <div className="pitch-line absolute bottom-0 left-1/2 h-8 w-16 -translate-x-1/2 rounded-t-lg border-x border-t" />
                {pitchPlayers.map((player) => (
                  <div
                    key={`mobile-${player.number}`}
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                    style={{ left: player.x, top: player.y }}
                  >
                    <div className="shirt flex h-6 w-6 items-center justify-center rounded-full border text-[8px] font-black shadow">
                      {player.number}
                    </div>
                    <span className="rounded bg-black/60 px-1 text-[7px] font-bold leading-3 text-white">
                      {player.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile-only info chips fill the lower space */}
            <div className="mt-7 flex flex-wrap justify-center gap-2 md:hidden">
              {mobileChips.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 px-3.5 py-2 text-[11px] font-semibold text-muted"
                >
                  <Icon size={13} className="text-accent-text" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Dream XI preview (desktop): every colour here follows the selected club */}
          <div className="relative mx-auto hidden w-full max-w-[510px] md:block">
            <div className="absolute inset-8 rounded-full bg-accent-2/25 blur-3xl" />

            <div className="relative overflow-hidden rounded-[28px] border border-accent/30 bg-surface-2 p-4 shadow-2xl shadow-accent/15 sm:p-6">
              <div className="brand-bar absolute inset-x-0 top-0 h-1.5" />

              <div className="mb-5 mt-1 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.24em] text-muted">
                    YOUR NEXT MASTERPIECE
                  </div>
                  <div className="mt-1 text-lg font-bold">Dream XI</div>
                </div>
                <div className="rounded-lg border border-trim/40 bg-trim/10 px-3 py-2 text-xs font-bold text-accent-text">
                  {club.formation}
                </div>
              </div>

              <div className="pitch-club relative overflow-hidden rounded-2xl border border-accent/30">
                <div className="pitch-line absolute left-0 right-0 top-1/2 border-t" />
                <div className="pitch-line absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border sm:h-28 sm:w-28" />
                <div className="pitch-line absolute left-1/2 top-0 h-9 w-28 -translate-x-1/2 rounded-b-xl border-x border-b sm:h-12 sm:w-36" />
                <div className="pitch-line absolute bottom-0 left-1/2 h-9 w-28 -translate-x-1/2 rounded-t-xl border-x border-t sm:h-12 sm:w-36" />

                {pitchPlayers.map((player) => (
                  <div
                    key={player.number}
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                    style={{ left: player.x, top: player.y }}
                  >
                    {/* Dot wears the selected club's kit */}
                    <div className="shirt flex h-8 w-8 items-center justify-center rounded-full border-2 text-[10px] font-black shadow-lg sm:h-10 sm:w-10 sm:text-xs">
                      {player.number}
                    </div>
                    <span className="rounded bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/90 sm:text-[10px]">
                      {player.name}
                    </span>
                  </div>
                ))}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20" />
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Users size={15} />
                  <span>2 managers · 1 winner</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-accent-text">
                  <Zap size={14} />
                  YOUR XI, YOUR RULES
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile game mode screen */}
      <section
        className={`${
          showModes ? "flex" : "hidden"
        } fixed inset-0 z-50 flex-col overflow-hidden overscroll-none touch-none bg-surface px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] md:hidden`}
      >
        <button
          type="button"
          onClick={() => setShowModes(false)}
          className="mb-4 flex w-fit shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted"
        >
          <ChevronRight className="rotate-180" size={16} />
          Back to home
        </button>

        <div className="mb-4 shrink-0">
          <div className="text-[10px] font-bold tracking-[0.22em] text-accent-text">
            CHOOSE YOUR MATCHDAY
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            HOW DO YOU WANT TO PLAY?
          </h2>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 overflow-hidden">
          <Link
            href="/local-draft"
            className="group relative flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface-2 p-4"
          >
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/15 text-accent-text">
                  <Gamepad2 size={25} />
                </div>
                <span className="rounded-full border border-border px-3 py-1.5 text-[9px] font-bold tracking-wider text-muted">
                  SAME DEVICE
                </span>
              </div>
              <h3 className="mt-3 text-lg font-black">Local Draft</h3>
              <p className="mt-1.5 max-w-xs text-xs leading-4 text-muted">
                Play with a friend on the same device. Take turns picking
                players and build two legendary squads.
              </p>
            </div>
            <div className="relative flex items-center justify-between">
              <span className="text-sm font-bold text-accent-text">
                Play locally
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink">
                <ArrowRight size={19} />
              </span>
            </div>
          </Link>

          <Link
            href="/online-draft"
            className="group relative flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface-2 p-4"
          >
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent-2/20 blur-2xl" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-2/15 text-accent-2-text">
                  <Globe2 size={25} />
                </div>
                <span className="rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-[9px] font-bold tracking-wider text-accent-2-text">
                  ONLINE
                </span>
              </div>
              <h3 className="mt-3 text-lg font-black">Online Draft</h3>
              <p className="mt-1.5 max-w-xs text-xs leading-4 text-muted">
                Challenge a friend anywhere. Create a private room, share your
                code, and compete pick by pick.
              </p>
            </div>
            <div className="relative flex items-center justify-between">
              <span className="text-sm font-bold text-accent-2-text">
                Challenge a friend
              </span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-2 text-accent-2-ink">
                <ArrowRight size={19} />
              </span>
            </div>
          </Link>
        </div>
        <br /><br />
      </section>
      
      {/* Mobile how-to-play screen */}
      <section
        className={`${
          showHow ? "flex" : "hidden"
        } fixed inset-0 z-50 flex-col overflow-hidden overscroll-none touch-none bg-surface px-5 pb-5 pt-[max(1rem,env(safe-area-inset-top))] md:hidden`}
      >
        <button
          type="button"
          onClick={() => setShowHow(false)}
          className="mb-4 flex w-fit shrink-0 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted"
        >
          <ChevronRight className="rotate-180" size={16} />
          Back to home
        </button>

        <div className="mb-4 shrink-0">
          <div className="text-[10px] font-bold tracking-[0.22em] text-accent-text">
            SIMPLE TO LEARN. HARD TO MASTER.
          </div>
          <h2 className="mt-2 text-2xl font-black tracking-tight">
            THREE STEPS. ONE DREAM TEAM.
          </h2>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-3 gap-3 overflow-hidden">
          {stepMeta.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="flex min-h-0 flex-col justify-between rounded-2xl border border-border bg-surface-2 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-text">
                    {step.number}
                  </span>
                  <Icon size={22} className="text-muted" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">{club.stepTitles[i]}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-muted">
                    {step.description}
                  </p>
                </div>
                <div
                  className={`h-1 w-12 rounded-full ${
                    i % 2 === 0 ? "bg-accent" : "bg-accent-2"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Game modes */}
      <section id="game-modes" className="hidden border-y border-border bg-surface md:block">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-bold tracking-[0.22em] text-accent-text">
                CHOOSE YOUR MATCHDAY
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                HOW DO YOU WANT TO PLAY?
              </h2>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Link
              href="/local-draft"
              className="group relative overflow-hidden rounded-3xl border border-border bg-surface-2 p-7 transition duration-300 hover:-translate-y-1 hover:border-accent/60 sm:p-9"
            >
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-accent/20 blur-2xl transition group-hover:bg-accent/35" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-accent-text">
                    <Gamepad2 size={28} />
                  </div>
                  <span className="rounded-full border border-border px-3 py-1.5 text-[10px] font-bold tracking-wider text-muted">
                    SAME DEVICE
                  </span>
                </div>
                <h3 className="mt-7 text-2xl font-black">Local Draft</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
                  Face off against a friend on the same screen. Take turns
                  choosing players and build two legendary squads.
                </p>
                <div className="mt-7 flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-text">
                    Play locally
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink transition group-hover:translate-x-1">
                    <ArrowRight size={19} />
                  </span>
                </div>
              </div>
            </Link>

            <Link
              href="/online-draft"
              className="group relative overflow-hidden rounded-3xl border border-border bg-surface-2 p-7 transition duration-300 hover:-translate-y-1 hover:border-accent-2/60 sm:p-9"
            >
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-accent-2/20 blur-2xl transition group-hover:bg-accent-2/35" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-2/15 text-accent-2-text">
                    <Globe2 size={28} />
                  </div>
                  <span className="rounded-full border border-accent-2/40 bg-accent-2/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-accent-2-text">
                    ONLINE
                  </span>
                </div>
                <h3 className="mt-7 text-2xl font-black">Online Draft</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
                  Challenge a friend from anywhere. Create a private room,
                  share your code, and compete pick by pick.
                </p>
                <div className="mt-7 flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-2-text">
                    Challenge a friend
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-2 text-accent-2-ink transition group-hover:translate-x-1">
                    <ArrowRight size={19} />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="mx-auto hidden max-w-7xl md:block px-5 py-20 sm:px-8 lg:px-12 lg:py-24"
      >
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-[0.22em] text-accent-text">
            SIMPLE TO LEARN. HARD TO MASTER.
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            THREE STEPS. ONE DREAM TEAM.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {stepMeta.map((step, i) => {
            const Icon = step.icon;

            return (
              <div
                key={step.number}
                className="rounded-2xl border border-border bg-foreground/[0.03] p-6 transition hover:border-trim/60 hover:bg-foreground/[0.05] sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-text">
                    {step.number}
                  </span>
                  <Icon size={23} className="text-muted" />
                </div>
                <h3 className="mt-8 text-xl font-bold">{club.stepTitles[i]}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {step.description}
                </p>
                <div
                  className={`mt-6 h-1 w-12 rounded-full ${
                    i % 2 === 0 ? "bg-accent" : "bg-accent-2"
                  }`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="hidden border-t border-border md:block">
        <div className="brand-bar h-1 w-full" />
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="shirt flex h-8 w-8 items-center justify-center rounded-lg border-2">
              <Goal size={18} />
            </div>
            <span className="font-black tracking-[0.15em]">
              FUT<span className="text-accent-text">GO</span>
            </span>
          </Link>

          <p className="text-xs text-muted">
            Built by Bikash. The PesGoalPoacher. {club.footerCheer}
          </p>

          <a
            href="#game-modes"
            onClick={openModes}
            className="flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-accent-text"
          >
            Ready to draft? <ChevronRight size={16} />
          </a>
        </div>
      </footer>
    </main>
  );
}