import { signOutAction } from "@/lib/auth/actions";
import { getSessionUser } from "@/lib/auth";

export default async function AdminHome() {
  const user = await getSessionUser();
  return (
    <main className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Staff area</h1>
      <p>
        {user?.name} ({user?.role})
      </p>
      <form action={signOutAction}>
        <button className="underline">Sign out</button>
      </form>
    </main>
  );
}
