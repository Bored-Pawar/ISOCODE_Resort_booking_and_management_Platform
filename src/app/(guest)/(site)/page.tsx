import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto max-w-page px-4 py-16 md:px-8 md:py-24">
      <h1 className="font-display text-display-sm md:text-display">{site.name}</h1>
      <p className="mt-3 max-w-read text-body text-muted">{site.tagline}</p>
    </main>
  );
}
