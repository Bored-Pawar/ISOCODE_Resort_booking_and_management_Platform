"use client";

import { useMemo, useState } from "react";
import { Check, Clock, Inbox, MessageCircle, TriangleAlert } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  DataGrid,
  DateRange,
  EmptyState,
  ErrorState,
  HoldTimer,
  Input,
  PriceBlock,
  PriceBlockSkeleton,
  RoomCardSkeleton,
  Select,
  Skeleton,
  StepIndicator,
  Stepper,
  TableSkeleton,
  useToast,
  type DateRangeValue,
  type GridColumn,
  type GridRow,
} from "@/components/ui";
import type { Quote } from "@/modules/pricing";
import { addDays, todayIST } from "@/lib/dates";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <h2 className="text-h2 font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="flex flex-wrap items-start gap-4">{children}</div>
    </div>
  );
}

export function Showcase({ quoteFixture }: { quoteFixture: Quote }) {
  const { toast } = useToast();
  const today = useMemo(() => todayIST(), []);
  const [range, setRange] = useState<DateRangeValue>({
    checkIn: addDays(today, 7),
    checkOut: addDays(today, 9),
  });
  const [badRange, setBadRange] = useState<DateRangeValue>({
    checkIn: addDays(today, 9),
    checkOut: addDays(today, 7),
  });
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [loadingBtn, setLoadingBtn] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(2);
  const [hold] = useState(() => new Date(Date.now() + 8 * 60_000 + 42_000).toISOString());
  const [soon] = useState(() => new Date(Date.now() + 95_000).toISOString());
  const [gridState, setGridState] = useState<"ready" | "loading" | "error">("ready");

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const cols: GridColumn[] = days.map((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    return { key: d, header: d.slice(5), shaded: dow === 5 || dow === 6 };
  });
  const [rows, setRows] = useState<GridRow[]>(() => [
    {
      id: "plantation",
      label: "Plantation Room",
      cells: Object.fromEntries(days.map((d, i) => [d, 16 - i])),
      sub: Object.fromEntries(days.map((d, i) => [d, `sold ${i} · held ${i % 2}`])),
    },
    {
      id: "suite",
      label: "Estate Suite",
      cells: Object.fromEntries(days.map((d) => [d, 10])),
      sub: Object.fromEntries(days.map((d) => [d, "sold 3 · held 0"])),
    },
  ]);

  return (
    <div className="mx-auto flex max-w-page flex-col gap-10 px-4 py-10 md:px-8">
      <header>
        <h1 className="font-display text-display-sm md:text-display">UI kit</h1>
        <p className="mt-2 max-w-read text-muted">
          Every component with its default, loading, empty, error and disabled states. Hidden page
          for review; not linked from the app.{" "}
          <a className="text-accent underline underline-offset-2" href="/dev/ui/guest">
            Guest shell
          </a>{" "}
          ·{" "}
          <a className="text-accent underline underline-offset-2" href="/dev/ui/staff">
            Staff shell
          </a>
        </p>
      </header>

      <Section title="Colour tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
          {[
            ["bg", "bg-bg"],
            ["surface", "bg-surface"],
            ["surface-2", "bg-surface-2"],
            ["text", "bg-text"],
            ["muted", "bg-muted"],
            ["border", "bg-border"],
            ["accent", "bg-accent"],
            ["accent-hover", "bg-accent-hover"],
            ["accent-soft", "bg-accent-soft"],
            ["coffee", "bg-coffee"],
            ["success", "bg-success"],
            ["warning", "bg-warning"],
            ["danger", "bg-danger"],
          ].map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1 text-xs">
              <div className={`h-12 rounded-control border border-border ${cls}`} />
              {name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="flex flex-col gap-2">
          <p className="font-display text-display-sm md:text-display">Display Fraunces 500</p>
          <p className="font-display text-h1">H1 Page title</p>
          <p className="text-h2 font-medium">H2 Section title</p>
          <p className="text-body">Body 16/24 system sans. Prices read ₹12,400 incl. ₹1,890 GST.</p>
          <p className="text-small">Small 14/20 for labels and staff tables.</p>
          <p className="text-xs">Extra small 12/16 for badges and captions.</p>
        </div>
      </Section>

      <Section title="Button">
        <Row label="Variants (md 44px)">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <ButtonLink href="/dev/ui">Link button</ButtonLink>
        </Row>
        <Row label="Small (36px)">
          <Button size="sm">Primary</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="ghost">
            Ghost
          </Button>
        </Row>
        <Row label="Loading keeps its text / disabled">
          <Button
            loading={loadingBtn}
            onClick={() => {
              setLoadingBtn(true);
              setTimeout(() => setLoadingBtn(false), 1500);
            }}
          >
            Check availability
          </Button>
          <Button loading>Paying…</Button>
          <Button disabled>Disabled</Button>
          <Button variant="secondary" disabled>
            Disabled
          </Button>
        </Row>
      </Section>

      <Section title="Input, Select, DateRange, Stepper">
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="Full name" placeholder="Asha Kulkarni" help="As on your ID at check-in." />
          <Input
            label="Email"
            type="email"
            defaultValue="not-an-email"
            error="Enter a valid email address."
          />
          <Input label="Disabled" disabled defaultValue="Locked" />
          <Select label="Room type" defaultValue="plantation" help="Choose one.">
            <option value="plantation">Plantation Room</option>
            <option value="suite">Estate Suite</option>
            <option value="garden">Garden Villa</option>
            <option value="pool">Pool Villa</option>
          </Select>
          <Select label="Rate plan" error="Pick a rate plan.">
            <option value="">Select…</option>
            <option value="ep">Room only</option>
          </Select>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <DateRange value={range} onChange={setRange} min={today} />
          <DateRange value={badRange} onChange={setBadRange} min={today} />
        </div>
        <Card className="max-w-md">
          <div className="flex flex-col gap-4">
            <Stepper
              label="Adults"
              hint="Age 13+"
              value={adults}
              onChange={setAdults}
              min={1}
              max={4}
            />
            <Stepper
              label="Children"
              hint="Age 0 to 12"
              value={children}
              onChange={setChildren}
              max={3}
            />
          </div>
        </Card>
      </Section>

      <Section title="Card and Badge">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <h3 className="text-h2">Plantation Room</h3>
            <p className="mt-1 text-muted">Borders over shadows. 10px radius.</p>
          </Card>
        </div>
        <Row label="Tones">
          <Badge>Neutral</Badge>
          <Badge tone="accent">Room enquiry</Badge>
          <Badge tone="coffee">Best value</Badge>
          <Badge tone="success" icon={<Check strokeWidth={1.5} />}>
            Confirmed
          </Badge>
          <Badge tone="warning" icon={<Clock strokeWidth={1.5} />}>
            Low confidence 0.62
          </Badge>
          <Badge tone="danger" icon={<TriangleAlert strokeWidth={1.5} />}>
            Complaint
          </Badge>
          <Badge icon={<MessageCircle strokeWidth={1.5} />}>WhatsApp</Badge>
        </Row>
      </Section>

      <Section title="StepIndicator">
        <StepIndicator current={step} />
        <div className="flex gap-2">
          {([1, 2, 3] as const).map((n) => (
            <Button
              key={n}
              size="sm"
              variant={n === step ? "primary" : "secondary"}
              onClick={() => setStep(n)}
            >
              Step {n}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="PriceBlock">
        <div className="grid gap-8 md:grid-cols-2">
          <Row label="With per night breakdown">
            <PriceBlock
              totalPaise={quoteFixture.totalPaise}
              gstPaise={quoteFixture.gstPaise}
              nights={quoteFixture.nights}
            />
          </Row>
          <Row label="Loading">
            <PriceBlockSkeleton />
          </Row>
        </div>
      </Section>

      <Section title="HoldTimer">
        <Row label="Normal / under 2 minutes">
          <HoldTimer expiresAt={hold} />
          <HoldTimer expiresAt={soon} />
          <HoldTimer expiresAt={new Date(0).toISOString()} />
        </Row>
      </Section>

      <Section title="Skeleton (matches final shapes)">
        <RoomCardSkeleton />
        <TableSkeleton rows={3} cols={5} />
        <Row label="Primitives">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="size-12 rounded-full" />
        </Row>
      </Section>

      <Section title="EmptyState and ErrorState">
        <div className="grid gap-4 md:grid-cols-2">
          <Card padded={false}>
            <EmptyState
              icon={<Inbox strokeWidth={1.5} />}
              message="No enquiries in this lane."
              action={<Button variant="secondary">Simulate inbound</Button>}
            />
          </Card>
          <Card padded={false}>
            <ErrorState
              title="Could not load rooms"
              message="We could not reach the server. Check your connection and try again."
              onRetry={() => toast("Retrying…", "info")}
            />
          </Card>
        </div>
      </Section>

      <Section title="Toast">
        <Row label="Bottom right on desktop, full width on mobile">
          <Button variant="secondary" onClick={() => toast("Rates saved for 14 days.", "success")}>
            Success
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast("Price updated. Please review the new total.", "info")}
          >
            Info
          </Button>
          <Button
            variant="secondary"
            onClick={() => toast("Could not save. Allotment is below sold rooms.", "error")}
          >
            Error
          </Button>
        </Row>
      </Section>

      <Section title="DataGrid (click a number to edit; Enter saves, Esc cancels)">
        <div className="flex gap-2">
          {(["ready", "loading", "error"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={gridState === s ? "primary" : "secondary"}
              onClick={() => setGridState(s)}
            >
              {s}
            </Button>
          ))}
        </div>
        <DataGrid
          columns={cols}
          rows={rows}
          editable
          state={gridState}
          onRetry={() => setGridState("ready")}
          onCommit={(rowId, key, value) => {
            const n = Number(value);
            if (!Number.isInteger(n) || n < 0) return "Enter a whole number, 0 or more.";
            const row = rows.find((r) => r.id === rowId)!;
            const committed = Number(row.sub?.[key]?.match(/sold (\d+)/)?.[1] ?? 0);
            if (n < committed)
              return `Cannot go below ${committed}: that many rooms are already sold or held on this date.`;
            setRows((rs) =>
              rs.map((r) => (r.id === rowId ? { ...r, cells: { ...r.cells, [key]: n } } : r)),
            );
            toast("Allotment saved.", "success");
          }}
        />
        <DataGrid
          columns={cols}
          rows={[]}
          emptyMessage="No room types match this filter."
          emptyAction={<Button variant="secondary">Clear filter</Button>}
        />
      </Section>
    </div>
  );
}
