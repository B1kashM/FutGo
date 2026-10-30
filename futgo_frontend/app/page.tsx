"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
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
import { useState } from "react";
import ThemeToggle from "./components/ThemeToggle";

const features = [
  {
    number: "01",
    title: "Build your dream XI",
    description:
      "Pick your perfect starting eleven, one position at a time.",
    icon: Shield,
  },
  {
    number: "02",
    title: "Outdraft your rival",
    description:
      "Two players. Two choices. Every pick changes the game.",
    icon: Swords,
  },
  {
    number: "03",
    title: "Settle the debate",
    description:
      "Complete your squad and find out who built the better team.",
    icon: Crown,
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      {/* Navigation */}
      <header className="relative z-20 border-b border-border">
        <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-accent-ink">
              <Goal size={24} strokeWidth={2.5} />
            </div>
            <div>
              <div className="text-xl font-black tracking-[0.18em]">
                FUT<span className="text-accent-text">GO</span>
              </div>
              <div className="text-[9px] font-semibold tracking-[0.28em] text-muted">
                THE FOOTBALL DRAFT
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            <a
              href="#how-it-works"
              className="text-sm text-muted transition hover:text-foreground"
            >
              How to play
            </a>
            <a
              href="#game-modes"
              className="text-sm text-muted transition hover:text-foreground"
            >
              Game modes
            </a>
            <a
              href="#about"
              className="text-sm text-muted transition hover:text-foreground"
            >
              About FutGo
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <ThemeToggle />

            <a
              href="#game-modes"
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
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              How to play
            </a>
            <a href="#game-modes" onClick={() => setMenuOpen(false)}>
              Game modes
            </a>
            <a href="#about" onClick={() => setMenuOpen(false)}>
              About FutGo
            </a>
          </nav>
        )}
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-accent/[0.055] blur-[120px]" />

        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:px-12 lg:pb-28 lg:pt-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-4 py-2 text-xs font-semibold text-accent-text">
              <Sparkles size={14} />
              YOUR FOOTBALL. YOUR PICKS. YOUR LEGACY.
            </div>

            <h1 className="max-w-2xl text-5xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl lg:text-[76px]">
              ¡Uno
              <br />
              des
              <br />
              tres...
              <br />
              <span className="text-accent-text">Vamoss</span>
            </h1>

            <p className="mt-7 max-w-lg text-base leading-7 text-muted sm:text-lg sm:leading-8">
              Build your ultimate football XI. Prove who really knows football.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#game-modes"
                className="group inline-flex items-center gap-3 rounded-xl bg-accent px-6 py-4 font-bold text-accent-ink transition hover:-translate-y-0.5 hover:brightness-110"
              >
                Start drafting
                <ArrowRight
                  size={19}
                  className="transition group-hover:translate-x-1"
                />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-4 font-semibold text-foreground/80 transition hover:border-foreground/25 hover:bg-foreground/[0.04]"
              >
                <CircleHelp size={18} />
                How to play
              </a>
            </div>

            <div className="mt-11 flex flex-wrap gap-x-7 gap-y-3 text-xs font-medium text-muted sm:text-sm">
              <span className="flex items-center gap-2">
                <Check size={15} className="text-accent-text" />
                11 players per squad
              </span>
              <span className="flex items-center gap-2">
                <Check size={15} className="text-accent-text" />
                Position-by-position picks
              </span>
            </div>
          </div>

          {/* Football pitch visual */}
          <div className="relative mx-auto w-full max-w-[510px]">
            <div className="absolute inset-8 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative overflow-hidden rounded-[28px] border border-border bg-surface-2 p-4 shadow-2xl sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold tracking-[0.24em] text-muted">
                    YOUR NEXT MASTERPIECE
                  </div>
                  <div className="mt-1 text-lg font-bold">Dream XI</div>
                </div>
                <div className="rounded-lg border border-accent/20 bg-accent/10 px-3 py-2 text-xs font-bold text-accent-text">
                  4–3–3 FORMATION
                </div>
              </div>

              {/* The pitch is green in both themes, so its inner colours stay fixed */}
              <div className="pitch relative overflow-hidden rounded-2xl border border-border">
                <div className="absolute left-0 right-0 top-1/2 border-t border-white/20" />
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20 sm:h-28 sm:w-28" />
                <div className="absolute left-1/2 top-0 h-9 w-28 -translate-x-1/2 rounded-b-xl border-b border-x border-white/20 sm:h-12 sm:w-36" />
                <div className="absolute bottom-0 left-1/2 h-9 w-28 -translate-x-1/2 rounded-t-xl border-t border-x border-white/20 sm:h-12 sm:w-36" />

                {[
                  { x: "50%", y: "9%", name: "GK", number: "01" },
                  { x: "17%", y: "29%", name: "LB", number: "02" },
                  { x: "39%", y: "29%", name: "CB", number: "03" },
                  { x: "61%", y: "29%", name: "CB", number: "04" },
                  { x: "83%", y: "29%", name: "RB", number: "05" },
                  { x: "25%", y: "49%", name: "CM", number: "06" },
                  { x: "50%", y: "49%", name: "DM", number: "07" },
                  { x: "75%", y: "49%", name: "AM", number: "08" },
                  { x: "20%", y: "72%", name: "LW", number: "09" },
                  { x: "50%", y: "79%", name: "ST", number: "10" },
                  { x: "80%", y: "72%", name: "RW", number: "11" },
                ].map((player) => (
                  <div
                    key={player.number}
                    className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                    style={{ left: player.x, top: player.y }}
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b9f36b]/70 bg-[#1b2a1b] text-[10px] font-black text-[#b9f36b] shadow-[0_0_16px_rgba(185,243,107,0.12)] sm:h-10 sm:w-10 sm:text-xs">
                      {player.number}
                    </div>
                    <span className="rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-white/90 sm:text-[10px]">
                      {player.name}
                    </span>
                  </div>
                ))}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#08110b]/20" />
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-muted">
                  <Users size={15} />
                  <span>2 players · 1 winner</span>
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

      {/* Game modes */}
      <section id="game-modes" className="border-y border-border bg-surface">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
          <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <div className="text-xs font-bold tracking-[0.22em] text-accent-text">
                CHOOSE YOUR BATTLE
              </div>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                HOW DO YOU WANT TO PLAY?
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted">
              Same beautiful game. Two ways to build your dream team.
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <Link
              href="/local-draft"
              className="group relative overflow-hidden rounded-3xl border border-border bg-surface-2 p-7 transition duration-300 hover:-translate-y-1 hover:border-accent/50 sm:p-9"
            >
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-accent/[0.07] blur-2xl transition group-hover:bg-accent/[0.12]" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent-text">
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
              className="group relative overflow-hidden rounded-3xl border border-border bg-surface-2 p-7 transition duration-300 hover:-translate-y-1 hover:border-sky-400/50 sm:p-9"
            >
              <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-sky-400/[0.06] blur-2xl transition group-hover:bg-sky-400/[0.11]" />
              <div className="relative">
                <div className="flex items-start justify-between">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-400/10 text-sky-600 dark:text-sky-300">
                    <Globe2 size={28} />
                  </div>
                  <span className="rounded-full border border-sky-500/25 bg-sky-400/[0.08] px-3 py-1.5 text-[10px] font-bold tracking-wider text-sky-600 dark:text-sky-300">
                    ONLINE
                  </span>
                </div>
                <h3 className="mt-7 text-2xl font-black">Online Draft</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-muted">
                  Challenge a friend from anywhere. Create a private room,
                  share your code, and compete pick by pick.
                </p>
                <div className="mt-7 flex items-center justify-between">
                  <span className="text-sm font-bold text-sky-600 dark:text-sky-300">
                    Challenge a friend
                  </span>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-300 text-black transition group-hover:translate-x-1">
                    <ArrowRight size={19} />
                  </span>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-12 lg:py-24">
        <div className="max-w-2xl">
          <div className="text-xs font-bold tracking-[0.22em] text-accent-text">
            SIMPLE TO LEARN. HARD TO MASTER.
          </div>
          <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
            THREE STEPS. ONE DREAM TEAM.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.number}
                className="rounded-2xl border border-border bg-foreground/[0.03] p-6 transition hover:border-foreground/20 hover:bg-foreground/[0.05] sm:p-7"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-accent-text">
                    {feature.number}
                  </span>
                  <Icon size={23} className="text-muted" />
                </div>
                <h3 className="mt-8 text-xl font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-6 text-muted">
                  {feature.description}
                </p>
                <div className="mt-6 h-1 w-12 rounded-full bg-accent/70" />
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer id="about" className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
              <Goal size={19} />
            </div>
            <span className="font-black tracking-[0.15em]">
              FUT<span className="text-accent-text">GO</span>
            </span>
          </Link>

          <p className="text-xs text-muted">
            Built by Bikash. The PesGoalPoacher.
          </p>

          <a
            href="#game-modes"
            className="flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-accent-text"
          >
            Ready to draft? <ChevronRight size={16} />
          </a>
        </div>
      </footer>
    </main>
  );
}