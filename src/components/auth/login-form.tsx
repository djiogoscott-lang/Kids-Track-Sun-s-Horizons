"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
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

    router.replace("/activities");
    router.refresh();
  }

  return (
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
          placeholder="vous@sunshorizons.be"
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
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Connexion…" : "Se connecter"}
      </Button>
    </form>
  );
}
