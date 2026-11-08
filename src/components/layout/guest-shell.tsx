import Link from "next/link";
import { site } from "@/lib/site";
import { Wordmark } from "./wordmark";

/**
 * Guest site frame: quiet header, content, footer with address and contact. `account` is the
 * header's right side (sign in link or profile menu); it defaults to a plain sign in link.
 */
export function GuestShell({
  children,
  account,
}: {
  children: React.ReactNode;
  account?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between px-4 md:px-8">
          <Wordmark />
          <nav aria-label="Main" className="flex items-center gap-1">
            {account ?? (
              <Link
                href="/login"
                className="inline-flex h-11 items-center rounded-control px-3 text-small font-semibold text-text hover:bg-surface-2"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="mt-16 border-t border-border bg-surface-2 md:mt-24">
        <div className="mx-auto grid max-w-page gap-6 px-4 py-10 text-small text-muted md:grid-cols-2 md:px-8">
          <div>
            <p className="font-display text-h2 font-medium text-text">{site.name}</p>
            <p className="mt-1">{site.tagline}</p>
          </div>
          <address className="not-italic">
            <p>Chikkamagaluru, Karnataka 577101</p>
            <p>reservations@companya.example</p>
            <p>+91 00000 00000</p>
          </address>
        </div>
      </footer>
    </div>
  );
}
