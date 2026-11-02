"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { CLUBS } from "../_theme/clubs";
import { useClub } from "../_theme/useClub";

function Swatch({ colors }: { colors: [string, string] }) {
  return (
    <span className="relative inline-flex h-5 w-8 shrink-0" aria-hidden="true">
      <span
        className="absolute left-0 top-0 h-5 w-5 rounded-full border border-border"
        style={{ background: colors[0] }}
      />
      <span
        className="absolute left-3 top-0 h-5 w-5 rounded-full border border-border"
        style={{ background: colors[1] }}
      />
    </span>
  );
}

export default function ClubPicker() {
  const { club, setClub } = useClub();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Choose club theme"
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface pl-2.5 pr-2.5 text-xs font-bold text-foreground transition hover:border-accent sm:pr-3"
      >
        <Swatch colors={club.swatch} />
        <span className="hidden sm:inline">{club.short}</span>
        <ChevronDown
          size={14}
          className={`text-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-2 shadow-2xl">
          <div className="px-3 pb-2 pt-1.5 text-[10px] font-bold tracking-[0.22em] text-muted">
            CHOOSE YOUR CLUB
          </div>
          {CLUBS.map((item) => {
            const active = item.id === club.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setClub(item.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-foreground/[0.06] ${
                  active ? "bg-foreground/[0.05]" : ""
                }`}
              >
                <Swatch colors={item.swatch} />
                <span className="flex-1">{item.name}</span>
                {active && <Check size={16} className="text-accent-text" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}