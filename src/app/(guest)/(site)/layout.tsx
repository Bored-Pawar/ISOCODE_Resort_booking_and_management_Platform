import { Suspense } from "react";
import { GuestShell } from "@/components/layout/guest-shell";
import { HeaderAccount, HeaderAccountFallback } from "../_components/header-account";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <GuestShell
      account={
        <Suspense fallback={<HeaderAccountFallback />}>
          <HeaderAccount />
        </Suspense>
      }
    >
      {children}
    </GuestShell>
  );
}
