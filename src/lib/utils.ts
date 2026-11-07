import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** Custom type scale from globals.css (@theme --text-*). Must stay in sync with it. */
export const FONT_SIZES = ["display", "display-sm", "h1", "h2", "body", "small", "xs"] as const;

// Without this, tailwind-merge reads `text-body` / `text-small` as text COLOURS and drops the real
// colour class that comes before it (e.g. text-accent-foreground on a primary button).
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: [...FONT_SIZES] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
