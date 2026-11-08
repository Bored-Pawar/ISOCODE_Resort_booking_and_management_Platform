"use client";

import { useMemo, useSyncExternalStore } from "react";
import { readStoredStay, STAY_CHANGE_EVENT, STAY_STORAGE_KEY } from "../_lib/stay-storage";
import type { ParsedCart } from "../_lib/cart";

function subscribe(onChange: () => void) {
  window.addEventListener(STAY_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange); // other tabs
  return () => {
    window.removeEventListener(STAY_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
function snapshot(): string | null {
  try {
    return window.localStorage.getItem(STAY_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The stay saved in this browser, live. Null on the server and when nothing (readable) is saved. */
export function useStoredStay(): ParsedCart | null {
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(
    () => (raw ? readStoredStay({ getItem: () => raw, setItem() {}, removeItem() {} }) : null),
    [raw],
  );
}
