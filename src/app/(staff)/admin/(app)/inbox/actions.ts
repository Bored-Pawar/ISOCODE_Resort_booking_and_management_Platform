"use server";
import { requireRole } from "@/lib/auth";
import { retryEnquiry } from "@/modules/enquiries";
import { revalidatePath } from "next/cache";
import { z } from "zod";
const formSchema = z.object({
  enquiryId: z.string().min(1).max(100),
  expectedUpdatedAt: z.iso.datetime(),
  expectedAttempts: z.coerce.number().int().min(3),
});
export async function retryFailedEnquiry(_previous: string, form: FormData): Promise<string> {
  await requireRole("reservations", "sales", "gm");
  const input = formSchema.safeParse({
    enquiryId: form.get("enquiryId"),
    expectedUpdatedAt: form.get("expectedUpdatedAt"),
    expectedAttempts: form.get("expectedAttempts"),
  });
  if (!input.success) return "Refresh the queue and try again.";
  try {
    const result = await retryEnquiry(input.data);
    if (!result.ok) return "This enquiry has changed. Refresh the queue before retrying.";
    revalidatePath("/admin/inbox");
    return "Retry queued. Refresh shortly to see the result.";
  } catch {
    return "Retry could not be queued. Please try again.";
  }
}
