import { site } from "@/lib/site";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{site.name}</h1>
      <p>{site.tagline}</p>
    </main>
  );
}
