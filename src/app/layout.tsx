import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { site } from "@/lib/site";
import { ToastProvider } from "@/components/ui/toast";

// Display font: headings and prices on guest pages. Self hosted by next/font, latin subset only.
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fraunces.variable}>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
