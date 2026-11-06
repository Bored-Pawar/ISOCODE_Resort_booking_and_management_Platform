import type { Metadata } from "next";
import { BedDouble, CalendarRange, Inbox, Tag } from "lucide-react";
import { StaffShell } from "@/components/layout/staff-shell";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Staff shell", robots: { index: false, follow: false } };

// Preview only: these links are sample items for the shell, not real routes.
const nav = [
  { href: "/dev/ui/staff", label: "Inbox", icon: <Inbox strokeWidth={1.5} />, badge: 3 },
  { href: "/dev/ui/staff#rates", label: "Rates", icon: <CalendarRange strokeWidth={1.5} /> },
  { href: "/dev/ui/staff#allotment", label: "Allotment", icon: <BedDouble strokeWidth={1.5} /> },
  { href: "/dev/ui/staff#promos", label: "Promos", icon: <Tag strokeWidth={1.5} /> },
];

export default function StaffShellPreview() {
  return (
    <StaffShell nav={nav} account={<Badge tone="accent">reservations</Badge>}>
      <h1 className="text-h1">Staff shell</h1>
      <Card className="mt-6" padded={false}>
        <EmptyState
          message="Sidebar is 232px on desktop and a top bar on mobile."
          action={
            <ButtonLink href="/dev/ui" variant="secondary">
              Back to UI kit
            </ButtonLink>
          }
        />
      </Card>
    </StaffShell>
  );
}
