import { Suspense } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/layout/auth-layout";
import { AuthForm } from "@/lib/auth/auth-form";
import { guestLoginAction } from "@/lib/auth/actions";

export const metadata = { title: "Sign in" };

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout title="Sign in">
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
      <p className="mt-4 text-small text-muted">
        New here?{" "}
        <Link href="/signup" className="text-accent underline underline-offset-2">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense>
      <Content searchParams={searchParams} />
    </Suspense>
  );
}
