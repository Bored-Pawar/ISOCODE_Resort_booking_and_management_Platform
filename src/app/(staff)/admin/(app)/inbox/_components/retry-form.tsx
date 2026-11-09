"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { retryFailedEnquiry } from "../actions";

/**
 * Failed AI: "Retry AI" (GM). The service checks the exact failed generation and logs it. The
 * result is a toast: on success the row is no longer failed, so this button unmounts on refresh.
 */
export function RetryForm({
  id,
  updatedAt,
  attempts,
}: {
  id: string;
  updatedAt: string;
  attempts: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      size="sm"
      className="self-start"
      loading={pending}
      onClick={() =>
        start(async () => {
          const form = new FormData();
          form.set("enquiryId", id);
          form.set("expectedUpdatedAt", updatedAt);
          form.set("expectedAttempts", String(attempts));
          const message = await retryFailedEnquiry("", form);
          toast(message, message.startsWith("Retry queued") ? "success" : "error");
          router.refresh();
        })
      }
    >
      <RotateCcw className="size-4" strokeWidth={1.5} aria-hidden />
      Retry AI
    </Button>
  );
}
