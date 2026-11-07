import { Suspense } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { AuthForm } from "@/lib/auth/auth-form";
import { devLoginAction } from "@/lib/auth/actions";
import { requireDevEnabled } from "../_lib/access";

export const metadata = { title: "Sign in" };

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireDevEnabled();
  const { next } = await searchParams;
  return (
    <AuthLayout title="Dev tools sign in">
      <AuthForm
        action={devLoginAction}
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
