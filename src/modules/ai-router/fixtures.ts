import type { ProcessResult } from "./index";

type Success = Extract<ProcessResult, { ok: true }>;
type Fixture = Omit<Success, "ok">;

export const classificationFixtures: Record<string, Fixture> = {
  "ENQ-4410": {
    status: "ok",
    lane: "sorted",
    ownerRole: "sales",
    notifyGm: false,
    classification: {
      category: "wedding",
      confidence: 0.94,
      dates: { text: "Feb 2027" },
      guests: { total: 250 },
      budget: {},
      language: "en",
      summary: "Wedding venue, Feb 2027, ~250 guests, 2 nights",
    },
  },
  "ENQ-4411": {
    status: "ok",
    lane: "sorted",
    ownerRole: "reservations",
    notifyGm: false,
    classification: {
      category: "room",
      confidence: 0.91,
      dates: { from: "2026-11-14", to: "2026-11-16", text: "14-16 Nov" },
      guests: { adults: 2, children: 1, total: 3 },
      budget: {},
      language: "en",
      summary: "Villa 14-16 Nov, 2 adults + 1 child",
    },
  },
  "ENQ-4412": {
    status: "ok",
    lane: "sorted",
    ownerRole: "sales",
    notifyGm: false,
    classification: {
      category: "offsite",
      confidence: 0.88,
      dates: { text: "January" },
      guests: { total: 45 },
      budget: {},
      language: "en",
      summary: "Corporate offsite, January, 45 people, conference hall",
    },
  },
  "ENQ-COMPLAINT": {
    status: "ok",
    lane: "sorted",
    ownerRole: "gm",
    notifyGm: true,
    classification: {
      category: "complaint",
      confidence: 0.82,
      dates: {},
      guests: {},
      budget: {},
      language: "en",
      summary: "Guest complaint about hot water during last stay",
    },
  },
  "ENQ-UNSURE": {
    status: "fallback",
    lane: "unsorted",
    ownerRole: null,
    notifyGm: false,
    classification: {
      category: "other",
      confidence: 0.5,
      dates: {},
      guests: {},
      budget: {},
      language: "en",
      summary: "Unclear request, needs a human",
    },
  },
};
