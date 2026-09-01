import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SchoolFormDialog } from "@/features/schools/school-form-dialog";
import { SchoolOpenButton } from "@/features/schools/school-open-button";
import { requireUser } from "@/lib/auth/require-user";
import { getActiveSchoolId, getUserSchools } from "@/lib/schools/context";
import { getSchools, getSchoolStats, isSuperAdmin } from "@/server/supabase/schools-repo";
import { formatDateLong } from "@/lib/format";

export default async function AdminSchoolsPage() {
  const user = await requireUser("ADMIN");

  // A super admin sees every school; a plain admin sees only the ones they
  // are a member of. The list of ids comes from the server-side membership
  // read, never from the request.
  const [memberships, activeSchoolId] = await Promise.all([getUserSchools(), getActiveSchoolId()]);
  // Read from the profile, always. This used to short-circuit to `true`
  // whenever real auth was off, back when a local session had no real user id
  // to look up. Local sign-in now adopts a real account, so the shortcut had
  // stopped being a stand-in and become a lie: a plain admin was shown every
  // school in the database plus "Ajouter une école", which is precisely the
  // privilege this screen exists to gate.
  const superAdmin = await isSuperAdmin(user.id);
  const schools = await getSchools(superAdmin ? undefined : memberships.map((m) => m.schoolId));

  const stats = await Promise.all(schools.map((s) => getSchoolStats(s.id)));

  return (
    <div className="animate-float-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Écoles</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {schools.length} école{schools.length > 1 ? "s" : ""}
            {superAdmin ? "" : " à laquelle vous avez accès"}. Chaque école a ses propres enfants, activités, moniteurs et historique.
          </p>
        </div>
        {superAdmin ? <SchoolFormDialog mode="create" trigger="+ Ajouter une école" /> : null}
      </div>

      {schools.length === 0 ? (
        <EmptyState title="Aucune école." description="Créez une première école pour commencer." />
      ) : (
        <div className="space-y-4">
          {schools.map((school, i) => {
            const s = stats[i];
            const isActiveContext = school.id === activeSchoolId;
            return (
              <Card key={school.id}>
                <CardContent className="p-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className={`font-heading text-lg font-bold ${school.active ? "text-[var(--foreground)]" : "text-[var(--muted)] line-through"}`}>
                          🏫 {school.name}
                        </p>
                        {isActiveContext ? (
                          <span className="rounded-full bg-[var(--tint-blue-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand-blue)]">
                            ÉCOLE ACTIVE
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            school.active ? "bg-[var(--success-bg)] text-[var(--success)]" : "bg-[var(--warning-bg)] text-[var(--brand-gold)]"
                          }`}
                        >
                          {school.active ? "🟢 ACTIVE" : "🟡 INACTIVE"}
                        </span>
                      </div>
                      {school.address || school.city ? (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          {[school.address, [school.postalCode, school.city].filter(Boolean).join(" ")].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                      {school.contactName || school.contactEmail || school.phone ? (
                        <p className="text-xs text-[var(--muted)]">
                          {[school.contactName, school.contactEmail, school.phone].filter(Boolean).join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <SchoolOpenButton schoolId={school.id} isActive={isActiveContext} />
                      <SchoolFormDialog
                        mode="edit"
                        schoolId={school.id}
                        trigger="Modifier"
                        initial={{
                          name: school.name,
                          address: school.address,
                          city: school.city,
                          postalCode: school.postalCode,
                          contactName: school.contactName,
                          contactEmail: school.contactEmail,
                          phone: school.phone,
                          active: school.active,
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-px border-t border-[var(--border)] bg-[var(--border)] sm:grid-cols-4">
                    {[
                      { label: "Enfants", value: s.children },
                      { label: "Activités", value: s.activities },
                      { label: "Moniteurs", value: s.monitors },
                    ].map((m) => (
                      <div key={m.label} className="bg-white px-4 py-3">
                        <p className="text-lg font-bold text-[var(--foreground)]">{m.value}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{m.label}</p>
                      </div>
                    ))}
                    <div className="bg-white px-4 py-3">
                      <p className="text-sm font-bold text-[var(--foreground)]">
                        {s.lastActivityDate ? formatDateLong(new Date(`${s.lastActivityDate}T12:00:00`)) : "—"}
                      </p>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">Dernière activité</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-[var(--muted)]">
        Désactiver une école la retire du travail quotidien mais conserve intégralement ses enfants, ses présences et son historique.
      </p>
    </div>
  );
}
