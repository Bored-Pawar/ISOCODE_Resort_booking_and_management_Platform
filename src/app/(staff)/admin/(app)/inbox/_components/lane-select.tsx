"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui";

/** Mobile lanes: a select that navigates. The desktop list of links is the same set. */
export function LaneSelect({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string; href: string }[];
}) {
  const router = useRouter();
  return (
    <Select
      label="Lane"
      value={value}
      onChange={(ev) => {
        const o = options.find((x) => x.value === ev.target.value);
        if (o) router.push(o.href);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
