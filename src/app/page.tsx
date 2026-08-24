import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { SplashRedirect } from "@/components/splash-redirect";
import { getCurrentUser, resolveHomePath } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  const target = user ? await resolveHomePath(user) : "/login";

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[var(--background)] px-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(22,119,255,0.10),transparent_34%)]" />
      <section className="relative flex w-full max-w-md flex-col items-center text-center animate-float-in">
        <div className="mb-7 rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_20px_70px_rgba(16,35,63,0.10)]">
          <SunsHorizonsMark className="h-20 w-20" />
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-[var(--primary)]">Sun’s Horizons</p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">Kids Track</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--muted)]">Gestion intelligente des présences.</p>
        <div className="mt-9 flex items-center gap-2" aria-label="Chargement">
          {[0, 1, 2, 3].map((item) => (
            <span
              key={item}
              className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse-dot"
              style={{ animationDelay: `${item * 120}ms` }}
            />
          ))}
        </div>
      </section>
      <SplashRedirect href={target} />
    </main>
  );
}
