"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BadgePercent, Check, Plus, X } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Select, useToast } from "@/components/ui";
import { addDays } from "@/lib/dates";
import { formatInr } from "@/lib/money";
import type { PromoRow } from "@/modules/admin";
import { createPromoAction, deactivatePromoAction } from "./actions";

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const fmt = (d: string) => dayFmt.format(new Date(`${d}T00:00:00Z`));

function valueText(p: Pick<PromoRow, "kind" | "value">) {
  return p.kind === "pct" ? `${p.value}% off` : `${formatInr(p.value)} off`;
}

/** Whole number or NaN; empty stays empty (for optional fields). */
const num = (s: string) => (/^\s*\d+\s*$/.test(s) ? Number(s) : Number.NaN);

export function PromosBoard({ promos, today }: { promos: PromoRow[]; today: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(promos.length === 0);

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? (
            <X className="size-[18px]" aria-hidden />
          ) : (
            <Plus className="size-[18px]" aria-hidden />
          )}
          {open ? "Close" : "New code"}
        </Button>
      </div>
      <div className={open ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]" : ""}>
        <PromoTable
          promos={promos}
          today={today}
          onChanged={(message) => {
            toast(message, "success");
            router.refresh();
          }}
          onNew={() => setOpen(true)}
        />
        {open ? (
          <CreatePromo
            today={today}
            onCreated={(code) => {
              toast(`${code} created.`, "success");
              router.refresh();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function PromoTable({
  promos,
  today,
  onChanged,
  onNew,
}: {
  promos: PromoRow[];
  today: string;
  onChanged: (message: string) => void;
  onNew: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!promos.length)
    return (
      <Card padded={false}>
        <EmptyState
          icon={<BadgePercent strokeWidth={1.5} />}
          message="No promo codes yet."
          action={
            <Button variant="secondary" onClick={onNew}>
              Create the first code
            </Button>
          }
        />
      </Card>
    );

  const deactivate = (p: PromoRow) =>
    startTransition(async () => {
      setError(null);
      const res = await deactivatePromoAction({ id: p.id });
      setConfirming(null);
      if (!res.ok) {
        setError(
          res.code === "FORBIDDEN"
            ? "Your role cannot manage promo codes."
            : res.code === "NOT_FOUND"
              ? `${p.code} no longer exists.`
              : (Object.values(res.errors)[0] ?? "Could not save. Try again."),
        );
        return;
      }
      onChanged(`${p.code} switched off. New bookings cannot use it.`);
    });

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[760px] text-small">
          <caption className="sr-only">Promo codes</caption>
          <thead className="bg-surface-2 text-left">
            <tr className="h-11">
              <th scope="col" className="px-3 font-semibold">
                Code
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Discount
              </th>
              <th scope="col" className="px-3 font-semibold">
                Stay dates
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Min nights
              </th>
              <th scope="col" className="px-3 text-right font-semibold">
                Used
              </th>
              <th scope="col" className="px-3 font-semibold">
                Status
              </th>
              <th scope="col" className="px-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {promos.map((p) => {
              const expired = p.validTo < today;
              const usedUp = p.maxUses !== null && p.usedCount >= p.maxUses;
              return (
                <tr key={p.id} className="h-11 border-t border-border">
                  <th scope="row" className="px-3 text-left font-mono font-semibold">
                    {p.code}
                  </th>
                  <td className="px-3 text-right">{valueText(p)}</td>
                  <td className="px-3 whitespace-nowrap">
                    {fmt(p.validFrom)} to {fmt(p.validTo)}
                  </td>
                  <td className="px-3 text-right">{p.minNights}</td>
                  <td className="px-3 text-right whitespace-nowrap">
                    {p.usedCount} / {p.maxUses ?? "no limit"}
                  </td>
                  <td className="px-3">
                    {!p.active ? (
                      <Badge tone="neutral" icon={<X className="size-3" aria-hidden />}>
                        Off
                      </Badge>
                    ) : expired ? (
                      <Badge tone="neutral">Ended</Badge>
                    ) : usedUp ? (
                      <Badge tone="warning">Used up</Badge>
                    ) : (
                      <Badge tone="success" icon={<Check className="size-3" aria-hidden />}>
                        Active
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 text-right">
                    {p.active ? (
                      confirming === p.id ? (
                        <span className="inline-flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-danger"
                            loading={pending}
                            onClick={() => deactivate(p)}
                          >
                            Switch off {p.code}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setConfirming(p.id)}>
                          Switch off
                        </Button>
                      )
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CreatePromo({ today, onCreated }: { today: string; onCreated: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"pct" | "flat">("pct");
  const [value, setValue] = useState("");
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState(addDays(today, 90));
  const [minNights, setMinNights] = useState("1");
  const [maxUses, setMaxUses] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      setErrors({});
      const res = await createPromoAction({
        code,
        kind,
        value: num(value),
        validFrom,
        validTo,
        minNights: num(minNights),
        maxUses: maxUses.trim() === "" ? null : num(maxUses),
      });
      if (!res.ok) {
        if (res.code === "FORBIDDEN") setErrors({ form: "Your role cannot manage promo codes." });
        else if (res.code === "DUPLICATE_CODE")
          setErrors({
            code: `${res.existing} already exists (codes ignore upper and lower case).`,
          });
        else setErrors(res.errors);
        return;
      }
      setCode("");
      setValue("");
      setMaxUses("");
      onCreated(res.promo.code);
    });
  };

  return (
    <Card className="self-start">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <h2 className="text-h2">New code</h2>
        <Input
          label="Code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          placeholder="e.g. MONSOON20"
          maxLength={20}
          error={errors.code}
          help="3 to 20 letters or digits. Stored in capitals; guests can type any case."
        />
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Discount"
            value={kind}
            onChange={(e) => setKind(e.target.value as "pct" | "flat")}
          >
            <option value="pct">Percent</option>
            <option value="flat">Flat amount</option>
          </Select>
          <Input
            label={kind === "pct" ? "Percent off" : "Rupees off"}
            inputMode="numeric"
            placeholder={kind === "pct" ? "1 to 100" : "e.g. 1500"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            error={errors.value}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Valid from"
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            error={errors.validFrom}
          />
          <Input
            label="Valid to"
            type="date"
            min={validFrom}
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            error={errors.validTo}
          />
        </div>
        <p className="-mt-2 text-small text-muted">
          Stay dates: the first and last night of the stay must be inside this range.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Minimum nights"
            inputMode="numeric"
            value={minNights}
            onChange={(e) => setMinNights(e.target.value)}
            error={errors.minNights}
            help="1 to 14, per stay"
          />
          <Input
            label="Maximum uses"
            inputMode="numeric"
            placeholder="No limit"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            error={errors.maxUses}
            help="Empty for no limit"
          />
        </div>
        {errors.form ? (
          <p role="alert" className="text-small text-danger">
            {errors.form}
          </p>
        ) : null}
        <Button type="submit" loading={pending}>
          Create code
        </Button>
      </form>
    </Card>
  );
}
