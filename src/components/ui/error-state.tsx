"use client";

import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** What happened, plus a Retry button. Says what to do next. */
export function ErrorState({
  title = "Something went wrong",
  message = "We could not load this. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}
    >
      <TriangleAlert aria-hidden className="size-8 text-danger" strokeWidth={1.5} />
      <p className="text-h2 font-medium">{title}</p>
      <p className="max-w-read text-body text-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}
