import { z } from "zod";

/** Optional phone: empty means none. Shared by sign up and the booking details step. */
export const phoneField = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^\+?[0-9 ]{8,15}$/, "Enter a valid phone number")
    .optional(),
);

/** Guest sign up. `confirmPassword` must match; the error is reported on the confirm field. */
export const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your name").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
    phone: phoneField,
    password: z.string().min(8, "Use at least 8 characters").max(100),
    confirmPassword: z.string().min(1, "Confirm your password"),
    consent: z.literal("on", { error: "Please accept the privacy notice to continue" }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords do not match",
  });
