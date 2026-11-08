/** Deliberately favors alerting. Unicode boundaries avoid hits inside unrelated words. */
const english =
  /\b(?:complaints?|complain(?:ed|ing)?|refund|broken|dirty|not\s+(?:working|clean)|worst|overcharged?|charged\s+twice|disappoint\w*|rude|terrible|unacceptable|reimburse\w*|kharab|gand[ai]|bekaa?r|waa?pas|machhar|paise\s+wapas|ac\s+band)\b/iu;
const hindi =
  /(?:^|[^\p{L}\p{M}])(?:शिकायत|खराब|गंदा|गंदी|बेकार|बंद था|पैसे वापस|दो बार लिए)(?=$|[^\p{L}\p{M}])/u;
export function hasComplaint(rawText: string, category?: string, modelSignal = false): boolean {
  return (
    category === "complaint" ||
    modelSignal ||
    english.test(rawText.normalize("NFKC")) ||
    hindi.test(rawText.normalize("NFKC"))
  );
}
