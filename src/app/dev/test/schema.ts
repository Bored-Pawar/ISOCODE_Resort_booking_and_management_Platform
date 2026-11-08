import { z } from "zod";
import { isUsableContact } from "@/modules/enquiries";

export const SIM_CHANNELS = ["email", "whatsapp"] as const;
export type SimChannel = (typeof SIM_CHANNELS)[number];

export const simulateSchema = z
  .object({
    channel: z.enum(SIM_CHANNELS),
    name: z.string().trim().min(1, "Enter a sender name").max(120),
    contact: z.string().trim().min(3, "Enter a contact").max(200),
    message: z.string().trim().min(5, "Message needs at least 5 characters").max(5000),
  })
  .superRefine((v, ctx) => {
    if (v.channel === "email" && !z.email().safeParse(v.contact).success) {
      ctx.addIssue({ code: "custom", path: ["contact"], message: "Enter a valid email address" });
    }
    if (v.channel === "whatsapp" && !isUsableContact(v.contact)) {
      ctx.addIssue({
        code: "custom",
        path: ["contact"],
        message: "Enter a phone number with at least 10 digits",
      });
    }
  });

export type SimState =
  | undefined
  | {
      error?: string;
      fieldErrors?: Record<string, string>;
      /** Set on success. */
      sent?: { enquiryId: string; channel: SimChannel; status: number };
    };
