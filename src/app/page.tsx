import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { SplashRedirect } from "@/components/splash-redirect";
import { Loader } from "@/components/ui/loader";
import { getCurrentUser, resolveHomePath } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getCurrentUser();
  const target = user ? await resolveHomePath(user) : "/login";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 bg-white px-6">
      <div className="animate-float-in">
        <SunsHorizonsMark className="h-28 w-28" />
      </div>
      <Loader />
      <SplashRedirect href={target} />
    </main>
  );
}
