import Image from "next/image";
import { Wordmark } from "./wordmark";

/** Centred card on --bg with the wordmark above and one photo on the side (desktop only). */
export function AuthLayout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 md:px-12">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <Wordmark className="text-h1" />
          <div className="rounded-card border border-border bg-surface p-6">
            <h1 className="mb-6 text-h2 font-medium">{title}</h1>
            {children}
          </div>
        </div>
      </div>
      <div className="relative hidden md:block">
        <Image
          src="/images/auth-side.jpg"
          alt="Coffee leaves with morning dew"
          fill
          sizes="50vw"
          className="object-cover"
        />
      </div>
    </div>
  );
}
