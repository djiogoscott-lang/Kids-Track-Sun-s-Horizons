"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createChildAction, updateChildAction } from "@/features/presence/ui/actions";
import type { ActivityRecord as Activity } from "@/server/data-source";

interface ChildFormValues {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
  /** Profile details carried by the school lists. Always sent, so the values
   * shown are exactly the values saved — the form is the whole truth for
   * these fields rather than patching a subset. */
  schoolClass: string;
  birthDate: string; // ISO (YYYY-MM-DD), "" when unknown
  phone: string;
  email: string;
}

export function ChildForm({
  activities,
  childId,
  initial,
}: {
  activities: Activity[];
  childId?: string;
  initial?: ChildFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ChildFormValues>(
    initial ?? {
      firstName: "",
      lastName: "",
      activityId: activities[0]?.id ?? "",
      daycareAuto: false,
      notes: "",
      schoolClass: "",
      birthDate: "",
      phone: "",
      email: "",
    },
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = childId
        ? await updateChildAction(childId, values)
        : await createChildAction({ ...values });
      if (result.ok) {
        router.push("/admin/children");
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="max-w-lg space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Prénom
          <input
            required
            value={values.firstName}
            onChange={(e) => setValues((v) => ({ ...v, firstName: e.target.value }))}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm font-semibold">
          Nom
          <input
            required
            value={values.lastName}
            onChange={(e) => setValues((v) => ({ ...v, lastName: e.target.value }))}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Classe
          <input
            value={values.schoolClass}
            onChange={(e) => setValues((v) => ({ ...v, schoolClass: e.target.value }))}
            placeholder="1D, 2M6, Accueil…"
            maxLength={40}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm font-semibold">
          Date de naissance
          <input
            type="date"
            value={values.birthDate}
            onChange={(e) => setValues((v) => ({ ...v, birthDate: e.target.value }))}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Téléphone
          <input
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            placeholder="0470/ 12 34 56"
            maxLength={200}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
        <label className="block text-sm font-semibold">
          E-mail
          <input
            type="email"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="parent@exemple.be"
            maxLength={300}
            className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4 outline-none focus:border-[var(--primary)]"
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        Activité
        <select
          value={values.activityId}
          onChange={(e) => setValues((v) => ({ ...v, activityId: e.target.value }))}
          className="mt-2 h-12 w-full rounded-xl border border-[var(--border)] bg-white px-4"
        >
          {activities.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="rounded-xl border border-[var(--border)] p-4">
        <legend className="px-1 text-sm font-semibold">Garderie</legend>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="radio"
            name="daycareAuto"
            checked={!values.daycareAuto}
            onChange={() => setValues((v) => ({ ...v, daycareAuto: false }))}
          />
          Non
        </label>
        <label className="flex items-center gap-2 py-1 text-sm">
          <input
            type="radio"
            name="daycareAuto"
            checked={values.daycareAuto}
            onChange={() => setValues((v) => ({ ...v, daycareAuto: true }))}
          />
          Oui — garderie automatique
        </label>
      </fieldset>

      <label className="block text-sm font-semibold">
        Note (allergie, contact particulier, information utile…)
        <textarea
          value={values.notes}
          onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
          rows={3}
          className="mt-2 w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 outline-none focus:border-[var(--primary)]"
        />
      </label>

      {error ? <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="button" disabled={isPending} onClick={submit}>
          {childId ? "Enregistrer" : "Ajouter l'enfant"}
        </Button>
        <button
          type="button"
          onClick={() => router.push("/admin/children")}
          className="h-11 rounded-lg px-4 text-sm font-medium text-[var(--muted)]"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}
