"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Select, useToast } from "@/components/ui";
import type { StaffUser } from "@/modules/enquiries";
import { CATEGORIES, defaultOwnerRole, ownerRolesFor } from "@/modules/enquiries/staff/rules";
import { CATEGORY_LABEL } from "./badges";
import { rerouteAction } from "../actions";

type Category = (typeof CATEGORIES)[number];
const ROLE = { reservations: "Reservations", sales: "Sales", gm: "GM" } as const;

/** One-click re-route: category and owner, logged as `rerouted`. Owners are limited by category. */
export function RerouteForm({
  enquiryId,
  category,
  ownerId,
  isComplaint,
  staff,
}: {
  enquiryId: string;
  category: Category | null;
  ownerId: string | null;
  isComplaint: boolean;
  staff: StaffUser[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const ownersFor = (c: Category) => {
    const roles = ownerRolesFor(c, isComplaint || c === "complaint");
    return staff.filter((u) => roles.includes(u.role));
  };
  const defaultFor = (c: Category) => {
    const list = ownersFor(c);
    const role = defaultOwnerRole(c, isComplaint || c === "complaint");
    return (list.find((u) => u.role === role) ?? list[0])?.id ?? "";
  };
  const [cat, setCat] = useState<Category>(category ?? "room");
  const owners = useMemo(() => ownersFor(cat), [cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const [owner, setOwner] = useState(
    ownerId && ownersFor(cat).some((u) => u.id === ownerId) ? ownerId : defaultFor(cat),
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
          setOwner(defaultFor(c));
        }}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CATEGORY_LABEL[c]}
          </option>
        ))}
      </Select>
      <Select label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)}>
        {owners.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} ({ROLE[u.role]})
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
