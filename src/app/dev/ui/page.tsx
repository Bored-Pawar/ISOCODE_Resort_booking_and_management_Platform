import { Suspense } from "react";
import type { Metadata } from "next";
import { Showcase } from "./showcase";

// Hidden review page: not linked anywhere and kept out of search results.
export const metadata: Metadata = { title: "UI kit", robots: { index: false, follow: false } };

// The kit reads the clock for its date and timer demos, so it renders per request.
export default function UiKitPage() {
  return (
    <Suspense>
      <Showcase />
    </Suspense>
  );
}
