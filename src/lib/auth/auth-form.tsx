"use client";

import { useActionState } from "react";
import type { FormState } from "./actions";

type Field = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
};

/** Plain accessible form for auth pages. Restyled with UI kit components in F7. */
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
        <label key={f.name} className="flex flex-col gap-1 text-sm">
          {f.label}
          <input
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            required={f.required ?? true}
            aria-invalid={Boolean(state?.fieldErrors?.[f.name])}
            className="h-11 rounded-md border px-3"
          />
          {state?.fieldErrors?.[f.name] ? (
            <span role="alert" className="text-red-700">
              {state.fieldErrors[f.name]}
            </span>
          ) : null}
        </label>
      ))}
      {consent ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="consent" className="mt-1" />
          <span>{consent}</span>
        </label>
      ) : null}
      {state?.fieldErrors?.consent ? (
        <span role="alert" className="text-sm text-red-700">
          {state.fieldErrors.consent}
        </span>
      ) : null}
      {state?.error ? (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="h-11 rounded-md bg-black px-4 text-white disabled:opacity-60"
      >
        {pending ? "Please wait…" : submitLabel}
      </button>
    </form>
  );
}
