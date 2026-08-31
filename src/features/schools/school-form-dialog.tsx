"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSchoolAction, updateSchoolAction } from "@/features/schools/actions";

export interface SchoolFormValues {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  active: boolean;
}

const EMPTY: SchoolFormValues = {
  name: "",
  address: "",
  city: "",
  postalCode: "",
  contactName: "",
  contactEmail: "",
  phone: "",
  active: true,
};

/** One dialog for both create and edit: the two forms are identical, and
 * keeping them as one component means a field added here can never be
 * forgotten in the other. */
export function SchoolFormDialog({
  mode,
  schoolId,
  initial,
  trigger,
}: {
  mode: "create" | "edit";
  schoolId?: string;
  initial?: SchoolFormValues;
  trigger: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [values, setValues] = useState<SchoolFormValues>(initial ?? EMPTY);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setValues(initial ?? EMPTY);
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }

  function set<K extends keyof SchoolFormValues>(key: K, value: SchoolFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = mode === "create" ? await createSchoolAction(values) : await updateSchoolAction(schoolId!, values);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  const field = "mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm outline-none focus:border-[var(--primary)]";

  return (
    <>
      <button
        type="button"
        onClick={open}
        className={
          mode === "create"
            ? "tap-scale h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--primary-strong)]"
            : "text-xs font-semibold text-[var(--primary)] hover:underline"
        }
      >
        {trigger}
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">{mode === "create" ? "Ajouter une école" : "Modifier l'école"}</h2>
          <div className="mt-4 space-y-3">
            <label className="block text-sm font-semibold">
              Nom de l&apos;école
              <input value={values.name} onChange={(e) => set("name", e.target.value)} className={field} />
            </label>
            <label className="block text-sm font-semibold">
              Adresse
              <input value={values.address} onChange={(e) => set("address", e.target.value)} className={field} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Code postal
                <input value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-semibold">
                Ville
                <input value={values.city} onChange={(e) => set("city", e.target.value)} className={field} />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Personne de contact
              <input value={values.contactName} onChange={(e) => set("contactName", e.target.value)} className={field} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                E-mail
                <input type="email" value={values.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} className={field} />
              </label>
              <label className="block text-sm font-semibold">
                Téléphone
                <input value={values.phone} onChange={(e) => set("phone", e.target.value)} className={field} />
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Statut
              <select value={values.active ? "active" : "inactive"} onChange={(e) => set("active", e.target.value === "active")} className={field}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={isPending || !values.name.trim()}
                onClick={submit}
                className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
              >
                {isPending ? "Enregistrement…" : mode === "create" ? "Créer l'école" : "Enregistrer"}
              </button>
              <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
