"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FieldNote, Input } from "@/components/ui/input";
import type { FormState } from "./actions";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
};

/** Auth form built from the UI kit. Server action errors render inline, never as alerts. */
export function AuthForm({
  action,
  fields,
  submitLabel,
  next,
  consent,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  fields: Field[];
  submitLabel: string;
  next?: string;
  consent?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {fields.map((f) => (
        <Input
          key={f.name}
          name={f.name}
          label={f.label}
          type={f.type ?? "text"}
          autoComplete={f.autoComplete}
          required={f.required ?? true}
          error={state?.fieldErrors?.[f.name]}
        />
      ))}
      {consent ? (
        <div className="flex flex-col gap-1">
          <label className="flex items-start gap-3 text-small">
            <input
              type="checkbox"
              name="consent"
              className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
              aria-invalid={state?.fieldErrors?.consent ? true : undefined}
            />
            <span>{consent}</span>
          </label>
          <FieldNote error={state?.fieldErrors?.consent} />
        </div>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-small text-danger">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}
