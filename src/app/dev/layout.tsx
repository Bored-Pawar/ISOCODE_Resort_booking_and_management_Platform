import type { Metadata } from "next";

// Developer and demo tools. Not linked from any navigation; kept out of search results.
export const metadata: Metadata = {
  title: { default: "Dev tools", template: "%s · Dev tools" },
  robots: { index: false, follow: false, nocache: true },
};

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return children;
}
