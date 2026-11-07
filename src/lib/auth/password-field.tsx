"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { controlClass, FieldNote } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Password input with a show/hide toggle. Same label, error and 44px control as the UI kit Input;
 * the toggle is a real button (type="button", 44px target) so Enter in the field still submits.
 */
export function PasswordField({
  name,
  label,
  autoComplete,
  required = true,
  error,
}: {
  name: string;
  label: string;
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  const noteId = `${id}-note`;
  const [shown, setShown] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? noteId : undefined}
          className={cn(controlClass, "pr-12", error ? "border-danger" : "border-border")}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          className="absolute top-0 right-0 inline-flex size-11 items-center justify-center rounded-control text-muted transition-colors hover:text-text"
        >
          {shown ? (
            <EyeOff className="size-5" strokeWidth={1.5} aria-hidden />
          ) : (
            <Eye className="size-5" strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </div>
      <FieldNote id={noteId} error={error} />
    </div>
  );
}
