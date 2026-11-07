"use client";

import { useRouter } from "next/navigation";
import { ErrorState } from "@/components/ui";

/**
 * ErrorState takes a callback, which a server component cannot pass, so this client wrapper
 * retries by re-rendering the current route (the server component runs again).
 */
export function RetryError({ title, message }: { title?: string; message?: string }) {
  const router = useRouter();
  return <ErrorState title={title} message={message} onRetry={() => router.refresh()} />;
}
