import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { signOutAction } from "@/lib/auth/actions";

async function Content() {
  const user = await getSessionUser();
  if (!user || user.role !== "guest") redirect("/login?next=/account");
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Hello, {user.name}</h1>
      <p>Signed in as {user.email}. Your bookings will appear here.</p>
      <form action={signOutAction}>
        <button className="underline">Sign out</button>
      </form>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense>
      <Content />
    </Suspense>
  );
}
