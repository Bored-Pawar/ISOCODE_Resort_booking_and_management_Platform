"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, useToast } from "@/components/ui";
import type { CATEGORIES } from "@/modules/enquiries/staff/display";
import { rerouteAction } from "../actions";

type Category = (typeof CATEGORIES)[number];
export type RerouteOption = {
  category: Category;
  label: string;
  /** Users whose role may see this category (computed on the server from permissions). */
  owners: { id: string; label: string }[];
  defaultOwnerId: string;
};

/** One-click re-route: category and owner, logged as `rerouted`. The server checks both again. */
export function RerouteForm({
  enquiryId,
  category,
  ownerId,
  isComplaint,
  options,
}: {
  enquiryId: string;
  category: Category | null;
  ownerId: string | null;
  isComplaint: boolean;
  options: RerouteOption[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cat, setCat] = useState<Category>(category ?? "room");
  const current = options.find((o) => o.category === cat) ?? options[0];
  const [owner, setOwner] = useState(
    ownerId && current?.owners.some((u) => u.id === ownerId) ? ownerId : current?.defaultOwnerId,
  );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const res = await rerouteAction({ enquiryId, category: cat, ownerId: owner });
      toast(res.message, res.ok ? "success" : "error");
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <Select
        label="Category"
        value={cat}
        onChange={(e) => {
          const c = e.target.value as Category;
          setCat(c);
          setOwner(options.find((o) => o.category === c)?.defaultOwnerId ?? "");
        }}
      >
        {options.map((o) => (
          <option key={o.category} value={o.category}>
            {o.label}
          </option>
        ))}
      </Select>
      <Select label="Owner" value={owner ?? ""} onChange={(e) => setOwner(e.target.value)}>
        {current?.owners.map((u) => (
          <option key={u.id} value={u.id}>
            {u.label}
          </option>
        ))}
      </Select>
      <Button type="submit" variant="secondary" loading={pending} disabled={!owner}>
        Re-route
      </Button>
      {isComplaint ? (
        <p className="text-xs text-muted sm:col-span-3">
          This is a complaint: it stays with the GM whatever the category.
        </p>
      ) : null}
    </form>
  );
}
