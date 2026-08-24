import { redirect } from "next/navigation";
import { DemoLoginOptions } from "@/components/auth/demo-login-options";
import { LoginForm } from "@/components/auth/login-form";
import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser, resolveHomePath } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(await resolveHomePath(user));

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-6 py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,72,149,0.06),transparent_45%)]" />
      <div className="relative mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <Card className="w-full overflow-hidden animate-float-in">
          <div className="flex flex-col items-center bg-white px-6 pb-2 pt-10 text-center">
            <SunsHorizonsMark className="h-20 w-20" />
            <h1 className="font-heading mt-5 text-2xl font-bold tracking-tight text-[var(--foreground)]">Bienvenue</h1>
            <p className="mt-1.5 text-sm text-[var(--muted)]">Accédez à votre espace de gestion.</p>
          </div>
          <CardContent className="pt-6">{isSupabaseConfigured ? <LoginForm /> : <DemoLoginOptions />}</CardContent>
        </Card>
      </div>
    </main>
  );
}
