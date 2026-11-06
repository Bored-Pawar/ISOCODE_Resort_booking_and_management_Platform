import { Suspense } from "react";
import Link from "next/link";
import { AuthForm } from "@/lib/auth/auth-form";
import { guestLoginAction } from "@/lib/auth/actions";

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <AuthForm
        action={guestLoginAction}
        next={next}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
      <p className="text-sm">
        New here?{" "}
        <Link href="/signup" className="underline">
          Create an account
        </Link>
      </p>
    </main>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
