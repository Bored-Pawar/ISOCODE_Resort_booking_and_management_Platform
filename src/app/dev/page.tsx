import Link from "next/link";
import { Card } from "@/components/ui";
import { signOutAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { DevGate } from "./_components/dev-gate";

export const metadata = { title: "Index" };

const tools = [
  { href: "/dev/ui", title: "UI kit", note: "Every component and token in one page." },
  {
    href: "/dev/test",
    title: "Inbound simulator",
    note: "Send email and WhatsApp enquiries through the real webhooks.",
  },
];

export default function DevIndex() {
  return (
    <DevGate>
      <main className="mx-auto max-w-page px-4 py-10 md:px-8">
        <h1 className="text-h1 font-medium">Dev tools</h1>
        <p className="mt-1 text-body text-muted">Staff only. Enabled by DEV_TOOLS_ENABLED.</p>
        <ul className="mt-6 grid gap-4 md:grid-cols-2">
          {tools.map((t) => (
            <li key={t.href}>
              <Link href={t.href} className="block rounded-card focus-visible:outline-2">
                <Card className="h-full transition-colors hover:bg-surface-2">
                  <p className="text-h2 font-medium">{t.title}</p>
                  <p className="mt-1 text-body text-muted">{t.note}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <form action={signOutAction} className="mt-8">
          <Button type="submit" variant="ghost" size="sm" className="-ml-3">
            Sign out
          </Button>
        </form>
      </main>
    </DevGate>
  );
}
