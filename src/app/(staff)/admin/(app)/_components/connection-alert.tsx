"use client";

import { useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { CONNECTION_TEXT, CONNECTION_TITLE } from "./transport";

/** Inline connection error with Retry (QA-05). Never claims the change was saved. */
export function ConnectionAlert({
  onRetry,
  pending,
  text = CONNECTION_TEXT,
  reloadLabel = "Reload grid",
}: {
  onRetry: () => void;
  pending: boolean;
  text?: string;
  reloadLabel?: string;
}) {
  const router = useRouter();
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-control border border-danger/40 bg-danger/5 p-3 text-small"
    >
      <p className="flex items-center gap-1 font-semibold text-danger">
        <WifiOff className="size-4" strokeWidth={1.5} aria-hidden />
        {CONNECTION_TITLE}
      </p>
      <p>{text}</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={pending} onClick={onRetry}>
          <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />
          Retry
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => router.refresh()}>
          {reloadLabel}
        </Button>
      </div>
    </div>
  );
}
