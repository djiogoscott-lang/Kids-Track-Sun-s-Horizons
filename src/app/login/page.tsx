"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Adresse e-mail ou mot de passe incorrect.");
      setLoading(false);
      return;
    }

    router.replace("/app");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[var(--background)] px-6 py-12">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <Card className="w-full overflow-hidden">
          <div className="flex flex-col items-center bg-white px-6 pb-3 pt-8 text-center">
            <SunsHorizonsMark className="h-14 w-14" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Sun’s Horizons</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Connexion</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Accédez à votre espace de gestion.</p>
          </div>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <label className="block text-sm font-semibold">
                Adresse e-mail
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none transition focus:border-[var(--primary)]"
                  placeholder="vous@sunshorizons.fr"
                />
              </label>
              <label className="block text-sm font-semibold">
                Mot de passe
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none transition focus:border-[var(--primary)]"
                  placeholder="••••••••"
                />
              </label>
              {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Connexion…" : "Se connecter"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
