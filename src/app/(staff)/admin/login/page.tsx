import { Suspense } from "react";
import { AuthForm } from "@/lib/auth/auth-form";
import { staffLoginAction } from "@/lib/auth/actions";

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Staff sign in</h1>
      <AuthForm
        action={staffLoginAction}
        next={next}
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Work email", type: "email", autoComplete: "username" },
          {
            name: "password",
            label: "Password",
            type: "password",
            autoComplete: "current-password",
          },
        ]}
      />
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
