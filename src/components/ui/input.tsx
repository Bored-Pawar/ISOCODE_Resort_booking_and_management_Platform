import { useId } from "react";
import { cn } from "@/lib/utils";

type FieldProps = {
  label: string;
  help?: string;
  error?: string;
};

export const controlClass =
  "h-11 w-full rounded-control border bg-surface px-3 text-body text-text placeholder:text-muted transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";

/** Label above, help or error below, 44px control. */
export function Input({
  label,
  help,
  error,
  className,
  id,
  ...props
}: FieldProps & Omit<React.ComponentProps<"input">, "id"> & { id?: string }) {
  const auto = useId();
  const inputId = id ?? auto;
  const noteId = `${inputId}-note`;
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={inputId} className="text-small font-semibold text-text">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || help ? noteId : undefined}
        className={cn(controlClass, error ? "border-danger" : "border-border")}
        {...props}
      />
      <FieldNote id={noteId} help={help} error={error} />
    </div>
  );
}

export function FieldNote({ id, help, error }: { id?: string; help?: string; error?: string }) {
  if (error)
    return (
      <p id={id} role="alert" className="text-small text-danger">
        {error}
      </p>
    );
  if (help)
    return (
      <p id={id} className="text-small text-muted">
        {help}
      </p>
    );
  return null;
}
