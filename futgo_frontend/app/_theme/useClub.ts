"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  CLUB_EVENT,
  CLUB_STORAGE_KEY,
  DEFAULT_CLUB,
  getClub,
  isClubId,
  type ClubId,
} from "./clubs";

function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    // Keep other open tabs in sync
    if (event.key === CLUB_STORAGE_KEY && isClubId(event.newValue)) {
      document.documentElement.dataset.club = event.newValue;
      callback();
    }
  };

  window.addEventListener(CLUB_EVENT, callback);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CLUB_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): ClubId {
  const value = document.documentElement.dataset.club;
  return isClubId(value) ? value : DEFAULT_CLUB;
}

export function useClub() {
  const id = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_CLUB);

  const setClub = useCallback((next: ClubId) => {
    document.documentElement.dataset.club = next;
    try {
      localStorage.setItem(CLUB_STORAGE_KEY, next);
    } catch {}
    window.dispatchEvent(new Event(CLUB_EVENT));
  }, []);

  return { club: getClub(id), setClub };
}