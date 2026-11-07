import { Suspense } from "react";
import type { Metadata } from "next";
import { Showcase } from "./showcase";
import { DevGate } from "../_components/dev-gate";
import { quoteFixture } from "@/modules/pricing";

// Hidden review page: not linked anywhere and kept out of search results.
export const metadata: Metadata = { title: "UI kit", robots: { index: false, follow: false } };

// The kit reads the clock for its date and timer demos, so it renders per request.
export default function UiKitPage() {
  return (
    <DevGate>
      <Suspense>
        <Showcase quoteFixture={quoteFixture} />
      </Suspense>
    </DevGate>
  );
}
