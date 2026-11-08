"use client";
import { useActionState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { retryFailedEnquiry } from "../actions";

/** Failed AI: "Retry AI" (GM). The service checks the exact failed generation and logs it. */
export function RetryForm({
  id,
  updatedAt,
  attempts,
}: {
  id: string;
  updatedAt: string;
  attempts: number;
}) {
  const [message, action, pending] = useActionState(retryFailedEnquiry, "");
  return (
    <form action={action} className="flex flex-col items-start gap-2">
      <input type="hidden" name="enquiryId" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <input type="hidden" name="expectedAttempts" value={attempts} />
      <Button type="submit" variant="secondary" size="sm" loading={pending}>
        <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
        Retry AI
      </Button>
      <p role="status" className="text-small text-muted">
        {message}
      </p>
    </form>
  );
}
