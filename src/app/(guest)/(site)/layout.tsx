import { GuestShell } from "@/components/layout/guest-shell";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <GuestShell>{children}</GuestShell>;
}
