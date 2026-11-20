"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";

/** Chrome / Edge / Android fire this when the app can be installed. */
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "futgo_install_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // ask again after 7 days
const SHOW_DELAY_MS = 1500;

/** True when the page is already running as an installed app. */
function isInstalled(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  const iPhoneOrPod = /iPhone|iPod/.test(ua);
  // iPadOS reports itself as a Mac, so check for touch support too.
  const iPad =
    /iPad/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iPhoneOrPod || iPad;
}

function recentlyDismissed(): boolean {
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

export default function InstallPrompt() {
  const [mode, setMode] = useState<"native" | "ios" | null>(null);
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    // Already installed or recently dismissed: never show anything.
    if (isInstalled() || recentlyDismissed()) return undefined;

    let timer: number | undefined;

    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // stop the browser's own mini-bar
      setDeferred(event as InstallEvent);
      timer = window.setTimeout(() => setMode("native"), SHOW_DELAY_MS);
    };

    const onInstalled = () => {
      setMode(null);
      setDeferred(null);
      rememberDismiss();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS never fires beforeinstallprompt, so show manual steps instead.
    if (isIos()) {
      timer = window.setTimeout(() => setMode("ios"), SHOW_DELAY_MS);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = () => {
    rememberDismiss();
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;

    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* the user closed the browser prompt */
    }

    // The event can only be used once.
    setDeferred(null);
    close();
  };

  if (!mode) return null;

  return (
    <div
      role="dialog"
      aria-label="Install the app"
      className="fixed inset-x-0 bottom-0 z-[100] flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <div className="relative w-full max-w-md rounded-3xl border-2 border-border bg-surface p-4 shadow-2xl shadow-black/30">
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-foreground/60 transition hover:text-foreground"
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-3 pr-8">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-ink">
            <Download size={22} />
          </span>
          <div className="min-w-0">
            <p className="text-base font-black leading-tight">Install FutGo</p>
            <p className="mt-1 text-xs font-semibold text-muted">
              {mode === "ios"
                ? "Add it to your Home Screen for a full-screen app."
                : "Get a full-screen app and open it from your home screen."}
            </p>
          </div>
        </div>

        {mode === "ios" ? (
          <ol className="mt-4 grid gap-2 text-sm font-semibold">
            <li className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
              <Share size={16} className="shrink-0 text-accent-text" />
              <span>
                Tap <b>Share</b> in the browser bar
              </span>
            </li>
            <li className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
              <PlusSquare size={16} className="shrink-0 text-accent-text" />
              <span>
                Choose <b>Add to Home Screen</b>
              </span>
            </li>
          </ol>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={close}
              className="rounded-xl border-2 border-border bg-surface px-4 py-2.5 text-xs font-black uppercase tracking-wide text-foreground/80 transition hover:border-accent/60"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => void install()}
              className="rounded-xl bg-accent px-4 py-2.5 text-xs font-black uppercase tracking-wide text-accent-ink shadow-[0_5px_0_0_rgba(0,0,0,0.3)] transition hover:brightness-110 active:translate-y-[3px] active:shadow-[0_2px_0_0_rgba(0,0,0,0.3)]"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}