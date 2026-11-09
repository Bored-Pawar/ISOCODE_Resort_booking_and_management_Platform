/**
 * Production QA-04: when Save or Approve is refused because the draft changed underneath (another
 * tab rebuilt the quote), the panel remounts with the current draft and the staff member's unsaved
 * prose used to vanish. The refusal itself is correct and stays. This keeps a recoverable copy of
 * that prose, per enquiry, so it can be shown next to the current draft and reused deliberately.
 *
 * The copy lives in memory for the session and is mirrored to sessionStorage when available, so a
 * router refresh or a reload keeps it. It never reaches the server and is never sent by itself.
 */
export type RecoveryStore = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export type Recovered = { text: string; at: string };

const keyOf = (enquiryId: string) => `inbox.unsaved.${enquiryId}`;

/** Keep `text` only when it differs from the draft the server refused it against. */
export function keepUnsaved(
  store: RecoveryStore,
  enquiryId: string,
  text: string,
  refusedBody: string,
  now: Date = new Date(),
): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed === refusedBody.trim()) return false;
  store.set(keyOf(enquiryId), JSON.stringify({ text: trimmed, at: now.toISOString() }));
  return true;
}

/** The kept prose, unless the current draft already says exactly the same. */
export function recoverable(
  store: RecoveryStore,
  enquiryId: string,
  currentBody: string,
): Recovered | null {
  const raw = store.get(keyOf(enquiryId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Recovered;
    if (typeof parsed?.text !== "string" || !parsed.text) return null;
    if (parsed.text === currentBody.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function discardUnsaved(store: RecoveryStore, enquiryId: string): void {
  store.remove(keyOf(enquiryId));
}

const memory = new Map<string, string>();

/** Session store: in memory, mirrored to sessionStorage when the browser allows it. */
export const sessionStore: RecoveryStore = {
  get(key) {
    if (memory.has(key)) return memory.get(key) ?? null;
    try {
      return window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try {
      window.sessionStorage.setItem(key, value);
    } catch {
      /* private mode or blocked storage: memory copy still covers a refresh */
    }
  },
  remove(key) {
    memory.delete(key);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
