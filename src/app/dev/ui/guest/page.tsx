import type { Metadata } from "next";
import { GuestShell } from "@/components/layout/guest-shell";
import { ButtonLink } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Guest shell", robots: { index: false, follow: false } };

export default function GuestShellPreview() {
  return (
    <GuestShell>
      <main className="mx-auto max-w-page px-4 py-16 md:px-8">
        <h1 className="font-display text-display-sm md:text-display">{site.name}</h1>
        <p className="mt-3 max-w-read text-muted">{site.tagline}</p>
        <ButtonLink href="/dev/ui" variant="secondary" className="mt-6">
          Back to UI kit
        </ButtonLink>
      </main>
    </GuestShell>
  );
}
