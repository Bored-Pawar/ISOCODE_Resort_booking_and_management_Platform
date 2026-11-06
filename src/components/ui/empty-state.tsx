import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon, one line, one action. */
export function EmptyState({
  icon,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  message: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 px-4 py-12 text-center", className)}>
      <span aria-hidden className="text-muted [&>svg]:size-8">
        {icon ?? <Inbox strokeWidth={1.5} />}
      </span>
      <p className="text-body text-muted">{message}</p>
      {action}
    </div>
  );
}
