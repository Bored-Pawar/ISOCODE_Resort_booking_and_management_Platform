import { isDateStr, todayIST } from "@/lib/dates";
import { classificationSchema, type Classification } from "./schema";
/** Conservative local rules: no network, no invented event prices or high confidence. */
export function rulesClassify(text: string, receivedAt: Date): Classification {
  const category: Classification["category"] =
    /complaint|complain|refund|charged twice|disappoint|not clean|rude|terrible|unacceptable|not working|kharab|waapas|machhar/i.test(
      text,
    )
      ? "complaint"
      : /wedding|shaadi|reception|engagement/i.test(text)
        ? "wedding"
        : /offsite|conference|corporate|team (?:outing|retreat)|employees|meeting room/i.test(text)
          ? "offsite"
          : /\b(rooms?|villas?|suites?|stays?|book(?:ing)?|breakfast)\b/i.test(text)
            ? "room"
            : "other";
  const dates: Classification["dates"] = {};
  const iso = text.match(/\b\d{4}-\d{2}-\d{2}\b/g);
  if (iso?.length === 2 && iso.every(isDateStr) && iso[1] > iso[0]) {
    dates.from = iso[0];
    dates.to = iso[1];
  }
  const range = text.match(
    /\b(\d{1,2})\s*[-–]\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+(20\d{2}))?\b/i,
  );
  if (!dates.from && range) {
    const month =
      ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(
        range[3].toLowerCase(),
      ) + 1;
    const reference = todayIST(receivedAt);
    let year = Number(range[4] || reference.slice(0, 4));
    const day = (n: string) => `${year}-${String(month).padStart(2, "0")}-${n.padStart(2, "0")}`;
    if (!range[4] && day(range[1]) < reference) year++;
    if (isDateStr(day(range[1])) && isDateStr(day(range[2])) && day(range[2]) > day(range[1])) {
      dates.from = day(range[1]);
      dates.to = day(range[2]);
    }
  }
  const adults = text.match(/(?<![\w.])(-?\d+(?:\.\d+)?)\s*adults?\b/i);
  const children = text.match(/(?<![\w.])(-?\d+(?:\.\d+)?)\s*(?:children|child|kids?)\b/i);
  const guests: Classification["guests"] = {};
  if (adults) guests.adults = Number(adults[1]);
  if (children) guests.children = Number(children[1]);
  else if (/\b(?:a|one) child\b/i.test(text)) guests.children = 1;
  const parsed = classificationSchema.safeParse({
    category,
    confidence: category === "other" ? 0.3 : 0.5,
    dates,
    guests,
    budget: {},
    language: "und",
    summary: `${category === "other" ? "Unclear" : category} enquiry; staff review required`,
  });
  return parsed.success
    ? parsed.data
    : {
        category,
        confidence: 0.3,
        dates: {},
        guests: {},
        budget: {},
        language: "und",
        summary: "Enquiry needs staff review",
      };
}
