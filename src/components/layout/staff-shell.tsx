import { Wordmark } from "./wordmark";
import { StaffNav, type StaffNavItem } from "./staff-nav";

/**
 * Staff frame: 232px left sidebar on desktop, a compact top bar on mobile.
 * `account` is a slot for the signed-in user and sign-out button. `bell` (GM only) renders once,
 * in a slim header bar above the content on every breakpoint.
 */
export function StaffShell({
  nav,
  account,
  bell,
  children,
}: {
  nav: StaffNavItem[];
  account?: React.ReactNode;
  bell?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_1fr]">
      <aside className="hidden border-r border-border bg-surface md:flex md:flex-col md:gap-6 md:p-4">
        <Wordmark href="/admin" className="px-3 pt-2" />
        <StaffNav items={nav} orientation="vertical" />
        <div className="mt-auto border-t border-border pt-4">{account}</div>
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2 md:hidden">
          <Wordmark href="/admin" />
          <div className="min-w-0 flex-1">
            <StaffNav items={nav} orientation="horizontal" />
          </div>
        </header>
        {bell ? (
          <div className="flex h-12 items-center justify-end border-b border-border bg-surface px-4 md:px-8">
            {bell}
          </div>
        ) : null}
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
        <div className="border-t border-border bg-surface p-4 md:hidden">{account}</div>
      </div>
    </div>
  );
}
