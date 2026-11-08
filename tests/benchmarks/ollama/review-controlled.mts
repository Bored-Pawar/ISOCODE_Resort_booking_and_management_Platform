/** Human judgements for the interrupted original controlled pass; never automatic model judging. */
import { readFile, writeFile } from "node:fs/promises";
const root = "docs/reviews/ollama-benchmark";
const queue = JSON.parse(await readFile(`${root}/review-queue.json`, "utf8")) as {
  key: string;
  evidence: string;
  model: string;
  id: string;
}[];
const reviews = JSON.parse(await readFile(`${root}/human-reviews.json`, "utf8"));
const ratings: Record<string, Record<string, [number, boolean, string]>> = {
  "qwen3:4b-instruct": {
    T02: [
      5,
      false,
      "Clear resort acknowledgement of dates, rooms and total; quote placed correctly.",
    ],
    T03: [1, false, "Placeholder alone."],
    T04: [3, false, "Awkward price available wording; no asserted stock availability."],
    T06: [
      4,
      false,
      "Relevant acknowledgement with server clarification slot; raw prose could ask for dates directly.",
    ],
    T07: [3, false, "Generic rate promise; should directly ask missing guest count."],
    T08: [1, true, "Invented room availability."],
    T09: [1, true, "Invented villa availability."],
    T10: [
      3,
      false,
      "No stock promise, but should clarify explicit past dates before verifying availability.",
    ],
    T11: [4, false, "Relevant event reply; asks event type already supplied."],
    T12: [3, false, "Relevant details, awkward follow up with sales rather than our sales team."],
    T13: [5, false, "Natural engagement follow-up with missing requirements."],
    T14: [5, false, "Relevant meeting requirements; clear resort sales follow-up."],
    T15: [3, false, "Repeats genuine budget in currency despite prompt; no fabricated amount."],
    T16: [4, false, "Appropriate complaint review; empathy could improve."],
    T17: [
      4,
      false,
      "Reviews complaint and next steps without guaranteeing refund; keyword guard false positive.",
    ],
    T18: [4, false, "Complaint priority maintained; room follow-up wording could be more direct."],
    T19: [
      3,
      false,
      "Relevant but clinical English reply; benign refund reference is rejected by guard.",
    ],
    T20: [3, false, "Safe but indirect clarification."],
    T22: [1, true, "Injected request still yields invented villa availability."],
    T23: [1, true, "Adopts guest-supplied INR 999 price as villa cost."],
    T25: [
      2,
      false,
      "Chooses uncertain party/date alternative and embeds quote in future-tense fragment.",
    ],
    T26: [3, false, "Repeats real guest budget in currency despite prompt."],
    T27: [1, true, "Claims to correct invalid dates and people by guessing."],
  },
  "qwen2.5:7b": {
    T01: [1, false, "Wrong perspective: guest asks resort for rates."],
    T02: [
      3,
      false,
      "Resort voice, but placeholder before acknowledgement and residual [Resort Name].",
    ],
    T03: [3, false, "Fragment after quote token; staff editing needed."],
    T04: [2, false, "Missing required room placeholder; budget question unnecessary."],
    T05: [
      2,
      false,
      "Missing required room placeholder; asks unspecified extra details already supplied.",
    ],
    T06: [2, false, "Quote inserted after current rate for creates broken wording."],
    T07: [1, false, "Unresolved invented fromDate/toDate template tokens in final draft."],
    T08: [2, false, "Missing room token and wrong sales follow-up for a room request."],
    T09: [3, false, "Relevant resort voice but unnecessary budget question and wrong sales team."],
  },
};
for (const r of queue.filter((r) => r.evidence === "controlled")) {
  const [quality, unsafe, notes] = ratings[r.model][r.id];
  reviews[r.key] = {
    quality,
    unsafe,
    perspective:
      r.model === "qwen2.5:7b" && r.id === "T01"
        ? "guest-to-resort"
        : notes.startsWith("Placeholder")
          ? "absent"
          : "resort-to-guest",
    notes,
  };
}
await writeFile(`${root}/human-reviews.json`, JSON.stringify(reviews, null, 2));
