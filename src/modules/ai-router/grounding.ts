import { isDateStr } from "@/lib/dates";
import type { Classification } from "./schema";

export type Evidence = "ok" | "missing" | "unsupported";
export type Grounding = {
  grounding: { dates: Evidence; guests: Evidence; room: Evidence };
  eligible: boolean;
  childrenSupplied: boolean;
  dates?: { from: string; to: string };
  guests?: { adults: number; children: number };
};
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const monthPattern =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
type Mention = { day: number; month: number; year?: number };
const iso = (v: Mention, year: number) =>
  `${year}-${String(v.month).padStart(2, "0")}-${String(v.day).padStart(2, "0")}`;

/** Small, fail-closed parser: ISO, Indian day/month, English month names and shared ranges. */
export function groundedDates(raw: string, today: string): { from: string; to: string } | null {
  if (!isDateStr(today)) return null;
  const found: { at: number; value: Mention }[] = [];
  let rest = raw;
  const collect = (pattern: RegExp, parse: (m: RegExpExecArray) => Mention[]) => {
    const chars = rest.split("");
    for (const m of rest.matchAll(pattern)) {
      const prefix = raw.slice(Math.max(0, m.index! - 25), m.index);
      // A currency/rate expression cannot supply calendar evidence.
      if (/(?:₹|\b(?:rs\.?|inr|price|budget|cost|rate))\s*[:=]?\s*$/i.test(prefix)) return false;
      parse(m).forEach((value, i) => found.push({ at: m.index! + i / 10, value }));
      for (let i = m.index!; i < m.index! + m[0].length; i++) chars[i] = " ";
    }
    rest = chars.join("");
    return true;
  };
  const month = (s: string) => months.indexOf(s.slice(0, 3).toLowerCase()) + 1;
  if (
    !collect(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g, (m) => [
      { year: +m[1], month: +m[2], day: +m[3] },
    ])
  )
    return null;
  if (
    !collect(
      new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|—|to|until)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s*,?\\s*(20\\d{2}))?\\b`,
        "gi",
      ),
      (m) => [
        { day: +m[1], month: month(m[3]), year: m[4] ? +m[4] : undefined },
        { day: +m[2], month: month(m[3]), year: m[4] ? +m[4] : undefined },
      ],
    )
  )
    return null;
  if (
    !collect(
      new RegExp(
        `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthPattern})(?:\\s*,?\\s*(20\\d{2}))?\\b`,
        "gi",
      ),
      (m) => [{ day: +m[1], month: month(m[2]), year: m[3] ? +m[3] : undefined }],
    )
  )
    return null;
  if (
    !collect(
      new RegExp(
        `\\b(${monthPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?\\b`,
        "gi",
      ),
      (m) => [{ day: +m[2], month: month(m[1]), year: m[3] ? +m[3] : undefined }],
    )
  )
    return null;
  if (
    !collect(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\/(\d{1,2})(?:\/(20\d{2}))?\b/g, (m) => [
      { day: +m[1], month: +m[3], year: m[4] ? +m[4] : undefined },
      { day: +m[2], month: +m[3], year: m[4] ? +m[4] : undefined },
    ])
  )
    return null;
  if (
    !collect(/\b(\d{1,2})([/-])(\d{1,2})(?:\2(20\d{2}))?\b/g, (m) => {
      // A two-component numeric date needs explicit stay/date context.
      const context = raw.slice(Math.max(0, m.index! - 35), m.index! + m[0].length + 20);
      return m[4] ||
        /\b(?:from|to|check[ -]?(?:in|out)|stay|dates?|arriv\w*|depart\w*|on|between|until)\b/i.test(
          context,
        )
        ? [{ day: +m[1], month: +m[3], year: m[4] ? +m[4] : undefined }]
        : [{ day: 0, month: 0 }];
    })
  )
    return null;
  const mentions = found.sort((a, b) => a.at - b.at).map((v) => v.value);
  // Extra calendar statements are ambiguous. Do not choose the model's preferred pair.
  if (mentions.length !== 2) return null;
  const [a, b] = mentions;
  const rollover = a.month === 12 && b.month === 1;
  let y1 = a.year ?? (b.year !== undefined ? b.year - Number(rollover) : +today.slice(0, 4));
  if (a.year === undefined && b.year === undefined && iso(a, y1) < today) y1++;
  const y2 = b.year ?? y1 + Number(rollover);
  const from = iso(a, y1),
    to = iso(b, y2);
  return isDateStr(from) && isDateStr(to) && from >= today && from < to ? { from, to } : null;
}

const numbers: Record<string, number> = {
  no: 0,
  zero: 0,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  paanch: 5,
};
const adultLabel = "(?:adults?|grown[ -]?ups?|vayask|वयस्क)";
const childLabel = "(?:children|child|kids?|bachch?[ae]|bachche|बच्चे|बच्चा|बच्चों)";
function countEvidence(text: string, label: string) {
  const mentions = [...text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}])${label}(?![\\p{L}])`, "giu"))];
  const counts = mentions.map((m) => {
    const before = text.slice(0, m.index).trimEnd();
    const token = before
      .match(/(?<![\p{L}\p{N}.])([+\-−]?\d+(?:\.\d+)?|[a-z]+)\s*$/iu)?.[1]
      ?.toLowerCase();
    const value =
      token === undefined ? undefined : /^\d+$/.test(token) ? Number(token) : numbers[token];
    return value;
  });
  return {
    mentioned: mentions.length > 0,
    count:
      counts.length && counts.every((n) => n !== undefined && n === counts[0])
        ? counts[0]
        : undefined,
  };
}

/** Original text stays on the server. Model confidence never supplies missing booking evidence. */
export function groundExtraction(
  rawText: string,
  extracted: Classification,
  todayIST: string,
): Grounding {
  const dates = groundedDates(rawText, todayIST);
  const dateStatus: Evidence =
    !extracted.dates.from || !extracted.dates.to
      ? "missing"
      : dates?.from === extracted.dates.from && dates.to === extracted.dates.to
        ? "ok"
        : "unsupported";
  const adults = countEvidence(rawText, adultLabel);
  const children = countEvidence(rawText, childLabel);
  const adultOk =
    Number.isInteger(extracted.guests.adults) &&
    extracted.guests.adults! > 0 &&
    adults.count === extracted.guests.adults;
  const childOk = children.mentioned
    ? children.count !== undefined && children.count === extracted.guests.children
    : extracted.guests.children === undefined || extracted.guests.children === 0;
  const childCount = children.mentioned ? children.count : 0;
  const totalOk =
    extracted.guests.total === undefined ||
    extracted.guests.total === (adults.count ?? 0) + (childCount ?? 0);
  const guestStatus: Evidence =
    !adults.mentioned || extracted.guests.adults === undefined
      ? "missing"
      : adultOk && childOk && totalOk
        ? "ok"
        : "unsupported";
  const grounding = { dates: dateStatus, guests: guestStatus, room: "missing" as Evidence };
  return {
    grounding,
    eligible: dateStatus === "ok" && guestStatus === "ok",
    childrenSupplied: children.mentioned,
    ...(dateStatus === "ok" && dates ? { dates } : {}),
    ...(guestStatus === "ok" ? { guests: { adults: adults.count!, children: childCount! } } : {}),
  };
}
