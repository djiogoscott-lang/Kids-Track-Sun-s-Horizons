import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function AppHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8">
          <p className="text-sm font-semibold text-[var(--primary)]">Sun’s Horizons</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Espace de gestion</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Foundation active. Le module de présence sera construit après validation de cette base.</p>
        </header>
        <Card>
          <CardHeader>
            <h2 className="font-semibold">Compte connecté</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted)]">{user.email}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
