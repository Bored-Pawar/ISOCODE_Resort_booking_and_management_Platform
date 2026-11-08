"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { retryFailedEnquiry } from "./actions";
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
    <form action={action} className="mt-3">
      <input type="hidden" name="enquiryId" value={id} />
      <input type="hidden" name="expectedUpdatedAt" value={updatedAt} />
      <input type="hidden" name="expectedAttempts" value={attempts} />
      <Button type="submit" variant="secondary" loading={pending}>
        Retry
      </Button>
      <p role="status" className="mt-2 text-small text-muted">
        {message}
      </p>
    </form>
  );
}
