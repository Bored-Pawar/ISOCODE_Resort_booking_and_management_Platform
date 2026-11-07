import { Suspense } from "react";
import { AuthLayout } from "@/components/layout/auth-layout";
import { AuthForm } from "@/lib/auth/auth-form";
import { staffLoginAction } from "@/lib/auth/actions";

export const metadata = { title: "Staff sign in" };

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout title="Staff sign in">
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
