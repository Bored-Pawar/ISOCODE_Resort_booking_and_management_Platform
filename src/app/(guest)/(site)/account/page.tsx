import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUser } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";

export const metadata = { title: "Your account" };

async function Content() {
  // Auth.js uses crypto.getRandomValues() inside auth(); render at request time first.
  await connection();
  const user = await getSessionUser();
  if (!user || user.role !== "guest") redirect("/login?next=/account");
  return (
    <>
      <h1 className="font-display text-h1">Hello, {user.name}</h1>
      <p className="mt-1 text-muted">Signed in as {user.email}</p>
      <Card className="mt-8" padded={false}>
        <EmptyState message="You have no bookings yet." />
      </Card>
      <form action={signOutAction} className="mt-6">
        <Button variant="secondary" type="submit">
          Sign out
        </Button>
      </form>
    </>
  );
}

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-page px-4 py-10 md:px-8">
      <Suspense fallback={<Skeleton className="h-9 w-64" />}>
        <Content />
      </Suspense>
    </main>
  );
}
