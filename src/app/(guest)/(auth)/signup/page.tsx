import { Suspense } from "react";
import Link from "next/link";
import { AuthLayout } from "@/components/layout/auth-layout";
import { AuthForm } from "@/lib/auth/auth-form";
import { guestSignUpAction } from "@/lib/auth/actions";

export const metadata = { title: "Create account" };

async function Content({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthLayout title="Create your account">
      <AuthForm
        action={guestSignUpAction}
        next={next}
        submitLabel="Create account"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          {
            name: "phone",
            label: "Phone (optional)",
            type: "tel",
            autoComplete: "tel",
            required: false,
          },
          {
            name: "password",
            label: "Password (8+ characters)",
            type: "password",
            autoComplete: "new-password",
          },
        ]}
        consent="I agree that Company A may store my name, email and phone to manage my bookings, as described in the privacy notice (DPDP Act 2023). I can ask for my data to be deleted at any time."
      />
      <p className="mt-4 text-small text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent underline underline-offset-2">
          Sign in
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
