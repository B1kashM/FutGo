import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  Globe2,
  Goal,
  type LucideIcon,
} from "lucide-react";

type Mode = {
  href: string;
  title: string;
  tag: string;
  description: string;
  cta: string;
  icon: LucideIcon;
  variant: "a" | "b";
};

const modes: Mode[] = [
  {
    href: "/local-draft",
    title: "Local Draft",
    tag: "Same device",
    description: "Play with a friend on one screen. Take turns picking players.",
    cta: "Play locally",
    icon: Gamepad2,
    variant: "a",
  },
  {
    href: "/online-draft",
    title: "Online Draft",
    tag: "Online",
    description: "Create a private room, share the code and draft from anywhere.",
    cta: "Challenge a friend",
    icon: Globe2,
    variant: "b",
  },
];

const styles = {
  a: {
    hover: "hover:border-accent/70",
    glow: "bg-accent/25",
    icon: "bg-accent/15 text-accent-text",
    pill: "border-trim/40 bg-trim/10 text-accent-text",
    cta: "text-accent-text",
    arrow: "bg-accent text-accent-ink",
  },
  b: {
    hover: "hover:border-accent-2/70",
    glow: "bg-accent-2/25",
    icon: "bg-accent-2/15 text-accent-2-text",
    pill: "border-accent-2/40 bg-accent-2/10 text-accent-2-text",
    cta: "text-accent-2-text",
    arrow: "bg-accent-2 text-accent-2-ink",
  },
};

export default function GameModes() {
  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="brand-bar h-1.5 w-full shrink-0" />

      <header className="shrink-0 border-b border-border">
        <div className="mx-auto flex h-[60px] max-w-7xl items-center justify-between px-4 sm:px-8 md:h-[68px] lg:px-12">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:border-accent/60 hover:text-foreground"
          >
            <ArrowLeft size={16} />
            Home
          </Link>

          <Link href="/" className="flex items-center gap-2.5">
            <div className="shirt flex h-9 w-9 items-center justify-center rounded-xl border-2">
              <Goal size={20} strokeWidth={2.5} />
            </div>
            <span className="text-lg font-black tracking-[0.18em]">
              FUT<span className="text-accent-text">GO</span>
            </span>
          </Link>
        </div>
      </header>

      <div className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col justify-center gap-4 px-4 py-4 sm:px-8 lg:gap-8">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[280px] w-[400px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[240px] w-[340px] rounded-full bg-accent-2/15 blur-[120px]" />

        <h1 className="relative text-[clamp(1.6rem,7.5vw,2.25rem)] font-black leading-[0.98] tracking-[-0.05em] sm:text-4xl lg:text-5xl">
          How do you want to play?
        </h1>

        <div className="relative grid min-h-0 flex-1 grid-rows-2 gap-3 lg:h-[clamp(280px,50vh,380px)] lg:flex-none lg:grid-cols-2 lg:grid-rows-1 lg:gap-6">
          {modes.map((mode) => {
            const s = styles[mode.variant];
            const Icon = mode.icon;

            return (
              <Link
                key={mode.href}
                href={mode.href}
                className={`group relative flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface-2 p-5 transition duration-300 hover:-translate-y-0.5 lg:p-8 ${s.hover}`}
              >
                <div className="brand-bar absolute inset-x-0 top-0 h-1" />
                <div
                  className={`pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full blur-3xl ${s.glow}`}
                />

                <div className="relative flex items-start justify-between">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl lg:h-16 lg:w-16 ${s.icon}`}
                  >
                    <Icon size={30} />
                  </div>
                  <span
                    className={`rounded-full border px-3 py-1 text-[10px] font-bold ${s.pill}`}
                  >
                    {mode.tag}
                  </span>
                </div>

                <div className="relative">
                  <h2 className="text-2xl font-black tracking-tight lg:text-3xl">
                    {mode.title}
                  </h2>
                  <p className="mt-1.5 max-w-xs text-sm leading-5 text-muted">
                    {mode.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={`text-sm font-bold ${s.cta}`}>
                      {mode.cta}
                    </span>
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-full transition group-hover:translate-x-1 ${s.arrow}`}
                    >
                      <ArrowRight size={19} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}