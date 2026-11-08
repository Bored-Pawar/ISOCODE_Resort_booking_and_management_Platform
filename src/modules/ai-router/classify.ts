import { executeStructured } from "@/modules/ai-provider";
import { modelResponseSchema, classificationSchema } from "./schema";
import { redactPii } from "./pii";
import { SYSTEM_PROMPT, enquiryPrompt } from "./prompts";
import { rulesClassify } from "./fallback";

export async function classifyMessage(input: {
  rawText: string;
  senderName: string;
  senderContact: string;
  receivedAt: Date;
}) {
  const text = redactPii(input.rawText, input);
  const response = await executeStructured({
    schema: modelResponseSchema,
    system: SYSTEM_PROMPT,
    prompt: enquiryPrompt(text, input.receivedAt),
  });
  if (response.kind === "success") {
    const value = response.value;
    const classification = classificationSchema.parse({
      ...value,
      summary: redactPii(value.summary, input),
      dates: {
        ...value.dates,
        ...(value.dates.text ? { text: redactPii(value.dates.text, input) } : {}),
      },
      budget: {
        ...value.budget,
        ...(value.budget.text ? { text: redactPii(value.budget.text, input) } : {}),
      },
    });
    return {
      classification,
      draftText: value.draftText ? redactPii(value.draftText, input) : null,
      status: "ok" as const,
      response,
      text,
    };
  }
  return {
    classification: rulesClassify(text, input.receivedAt),
    draftText: null,
    status: "fallback" as const,
    response,
    text,
  };
}
