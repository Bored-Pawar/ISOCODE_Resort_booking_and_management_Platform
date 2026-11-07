import { useId } from "react";
import { cn } from "@/lib/utils";
import { controlClass, FieldNote } from "./input";

/** Same label, help and error pattern as Input; auto height is replaced by `rows`. */
export function Textarea({
  label,
  help,
  error,
  className,
  id,
  ...props
}: {
  label: string;
  help?: string;
  error?: string;
} & Omit<React.ComponentProps<"textarea">, "id"> & { id?: string }) {
  const auto = useId();
  const areaId = id ?? auto;
  const noteId = `${areaId}-note`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={areaId} className="text-small font-semibold text-text">
        {label}
      </label>
      <textarea
        id={areaId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? noteId : undefined}
        className={cn(
          controlClass,
          "h-auto min-h-28 py-2",
          error ? "border-danger" : "border-border",
        )}
        {...props}
      />
      <FieldNote id={noteId} help={help} error={error} />
    </div>
  );
}
