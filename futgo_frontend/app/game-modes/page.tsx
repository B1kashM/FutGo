import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  Globe2,
  Shield,
  type LucideIcon,
} from "lucide-react";

type Mode = {
  href: string;
  title: string;
  tag: string;
  icon: LucideIcon;
  variant: "a" | "b";
};

const modes: Mode[] = [
  {
    href: "/local-draft",
    title: "Local",
    tag: "Same device",
    icon: Gamepad2,
    variant: "a",
  },
  {
    href: "/online-draft",
    title: "Online",
    tag: "Room code",
    icon: Globe2,
    variant: "b",
  },
];

const styles = {
  a: {
    hover: "hover:border-accent/70",
    glow: "bg-accent/25",
    icon: "bg-accent text-accent-ink shadow-lg shadow-accent/30",
    pill: "border-trim/40 bg-trim/10 text-accent-text",
    arrow: "bg-accent text-accent-ink",
    mark: "text-accent",
  },
  b: {
    hover: "hover:border-accent-2/70",
    glow: "bg-accent-2/25",
    icon: "bg-accent-2 text-accent-2-ink shadow-lg shadow-accent-2/30",
    pill: "border-accent-2/40 bg-accent-2/10 text-accent-2-text",
    arrow: "bg-accent-2 text-accent-2-ink",
    mark: "text-accent-2",
  },
};

export default function GameModes() {
  return (
    <main className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="brand-bar h-1.5 w-full shrink-0" />

      <div className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-7 pb-8 pt-8 sm:px-14 lg:px-24 lg:pb-12 lg:pt-14">
        <div className="pointer-events-none absolute left-1/4 top-0 h-[260px] w-[360px] -translate-x-1/2 rounded-full bg-accent/15 blur-[120px]" />
        <div className="pointer-events-none absolute right-0 top-10 h-[220px] w-[320px] rounded-full bg-accent-2/15 blur-[120px]" />

        {/* Title at the top, back arrow on the right */}
        <div className="relative flex shrink-0 items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight sm:text-4xl">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-md">
              <Shield size={22} />
            </span>
            Play Draft
          </h1>
          <Link
            href="/"
            aria-label="Back home"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground/25 bg-surface text-foreground/80 transition hover:border-accent/60 hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </Link>
        </div>

        {/* Cards: evenly spaced in the free area (stacked on mobile, side by side on desktop) */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-7 lg:grid lg:grid-cols-2 lg:content-center lg:gap-7">
          {modes.map((mode) => {
            const s = styles[mode.variant];
            const Icon = mode.icon;

            return (
              <Link
                key={mode.href}
                href={mode.href}
                className={`group relative flex h-[clamp(150px,24dvh,210px)] flex-col justify-between overflow-hidden rounded-3xl border border-border bg-surface-2 p-6 transition duration-300 hover:-translate-y-0.5 lg:h-[clamp(240px,38vh,320px)] lg:p-8 ${s.hover}`}
              >
                <div className="brand-bar absolute inset-x-0 top-0 h-1.5" />
                <div
                  className={`pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full blur-3xl ${s.glow}`}
                />
                <Icon
                  aria-hidden="true"
                  className={`pointer-events-none absolute -bottom-8 -right-8 h-40 w-40 opacity-[0.07] transition duration-300 group-hover:opacity-[0.14] lg:h-56 lg:w-56 ${s.mark}`}
                  strokeWidth={1.4}
                />

                <span
                  className={`relative flex h-14 w-14 items-center justify-center rounded-2xl lg:h-16 lg:w-16 ${s.icon}`}
                >
                  <Icon size={28} />
                </span>

                <div className="relative flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="text-3xl font-black tracking-tight lg:text-4xl">
                      {mode.title}
                    </h2>
                    <span
                      className={`mt-2 inline-block rounded-full border px-3 py-1 text-[11px] font-bold ${s.pill}`}
                    >
                      {mode.tag}
                    </span>
                  </div>
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition group-hover:translate-x-1 lg:h-14 lg:w-14 ${s.arrow}`}
                  >
                    <ArrowRight size={22} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}