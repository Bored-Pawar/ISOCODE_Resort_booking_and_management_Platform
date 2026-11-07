import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass, FieldNote } from "./input";

export function Select({
  label,
  help,
  error,
  className,
  id,
  children,
  ...props
}: {
  label: string;
  help?: string;
  error?: string;
} & Omit<React.ComponentProps<"select">, "id"> & { id?: string }) {
  const auto = useId();
  const selectId = id ?? auto;
  const noteId = `${selectId}-note`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={selectId} className="text-small font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <select
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || help ? noteId : undefined}
          className={cn(
            controlClass,
            "appearance-none pr-10",
            error ? "border-danger" : "border-border",
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute top-1/2 right-3 size-[18px] -translate-y-1/2 text-muted"
          strokeWidth={1.5}
          aria-hidden
        />
      </div>
      <FieldNote id={noteId} help={help} error={error} />
    </div>
  );
}
