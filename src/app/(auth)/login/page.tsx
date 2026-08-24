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
    <main className="min-h-screen bg-[var(--background)] px-6 py-12">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <Card className="w-full overflow-hidden">
          <div className="flex flex-col items-center bg-white px-6 pb-3 pt-8 text-center">
            <SunsHorizonsMark className="h-14 w-14" />
            <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Sun’s Horizons</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Kids Track</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Accédez à votre espace de gestion.</p>
          </div>
          <CardContent>{isSupabaseConfigured ? <LoginForm /> : <DemoLoginOptions />}</CardContent>
        </Card>
      </div>
    </main>
  );
}
