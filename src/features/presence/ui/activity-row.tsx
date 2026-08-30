"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  assignMonitorAction,
  deleteActivityAction,
  getActivityDependencyCountsAction,
  unassignMonitorAction,
  updateActivityAction,
} from "@/features/presence/ui/actions";
import type { ActivityRecord, MonitorRecord } from "@/server/data-source";

function EditActivityDialog({ activity }: { activity: ActivityRecord }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [name, setName] = useState(activity.name);
  const [description, setDescription] = useState(activity.description);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setName(activity.name);
    setDescription(activity.description);
    setError(null);
    dialogRef.current?.showModal();
  }
  function close() {
    dialogRef.current?.close();
  }
  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateActivityAction(activity.id, { name, description });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="text-xs font-semibold text-[var(--primary)] hover:underline">
        Modifier
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Modifier l&apos;activité</h2>
          <label className="mt-4 block text-sm font-semibold">
            Nom
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 outline-none focus:border-[var(--primary)]"
            />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="tap-scale h-11 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button type="button" onClick={close} className="tap-scale h-11 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

function ActiveToggle({ activity }: { activity: ActivityRecord }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function apply() {
    startTransition(async () => {
      setError(null);
      const result = await updateActivityAction(activity.id, { active: !activity.active });
      setConfirming(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5 rounded-xl border border-[var(--border)] bg-white p-2.5">
        <p className="text-xs font-medium text-[var(--foreground)]">
          {activity.active
            ? `Désactiver ${activity.name} ? Elle disparaîtra des inscriptions mais son historique reste accessible.`
            : `Réactiver ${activity.name} ?`}
        </p>
        <div className="flex gap-1.5">
          <button type="button" disabled={isPending} onClick={apply} className="h-8 rounded-lg bg-[var(--foreground)] px-3 text-xs font-bold text-white disabled:opacity-50">
            Confirmer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-[var(--muted)]">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--danger)] disabled:opacity-50"
      >
        {activity.active ? "🔴 Désactiver" : "🟢 Activer"}
      </button>
      {error ? <p className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function MonitorAssignment({ activity, monitors }: { activity: ActivityRecord; monitors: MonitorRecord[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const currentMonitor = monitors.find((m) => m.id === activity.monitorId);

  function assign(monitorId: string) {
    setError(null);
    startTransition(async () => {
      const result = monitorId ? await assignMonitorAction(activity.id, monitorId) : await unassignMonitorAction(activity.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        value={activity.monitorId ?? ""}
        disabled={isPending}
        onChange={(e) => assign(e.target.value)}
        className="h-9 rounded-lg border border-[var(--border)] bg-white px-2.5 text-xs font-medium"
      >
        <option value="">Aucun moniteur</option>
        {monitors.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {currentMonitor ? <p className="text-[10px] text-[var(--muted)]">Attribuée à {currentMonitor.name}.</p> : null}
      {error ? <p className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

type DependencyCounts = { children: number; weeklyRoster: number; attendance: number; activityDayState: number; notifications: number };

function DeleteActivityButton({ activity }: { activity: ActivityRecord }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<DependencyCounts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);

  function open() {
    setError(null);
    setCounts(null);
    dialogRef.current?.showModal();
    setLoadingCounts(true);
    startTransition(async () => {
      const result = await getActivityDependencyCountsAction(activity.id);
      setLoadingCounts(false);
      if (result.ok) {
        setCounts({ children: result.children, weeklyRoster: result.weeklyRoster, attendance: result.attendance, activityDayState: result.activityDayState, notifications: result.notifications });
      } else {
        setError(result.message);
      }
    });
  }
  function close() {
    dialogRef.current?.close();
  }

  const total = counts ? counts.children + counts.weeklyRoster + counts.attendance + counts.activityDayState + counts.notifications : null;

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deleteActivityAction(activity.id);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  function deactivateInstead() {
    setError(null);
    startTransition(async () => {
      const result = await updateActivityAction(activity.id, { active: false });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="text-xs font-semibold text-[var(--danger)] hover:underline">
        Supprimer
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--danger)]">Supprimer {activity.name}</h2>
          {loadingCounts ? (
            <p className="mt-3 text-sm text-[var(--muted)]">Vérification des données liées…</p>
          ) : counts ? (
            total === 0 ? (
              <p className="mt-3 text-sm text-[var(--foreground)]">Cette activité ne possède aucune donnée liée — la suppression est définitive et sans risque.</p>
            ) : (
              <div className="mt-3 rounded-xl bg-[var(--warning-bg)] p-3 text-sm text-[var(--foreground)]">
                <p className="font-semibold">Cette activité possède des données :</p>
                <ul className="mt-1 list-disc pl-4">
                  {counts.children > 0 ? <li>{counts.children} enfant{counts.children > 1 ? "s" : ""}</li> : null}
                  {counts.weeklyRoster > 0 ? <li>{counts.weeklyRoster} entrée{counts.weeklyRoster > 1 ? "s" : ""} de roster</li> : null}
                  {counts.attendance > 0 ? <li>{counts.attendance} ligne{counts.attendance > 1 ? "s" : ""} de présence</li> : null}
                  {counts.activityDayState > 0 ? <li>{counts.activityDayState} séance{counts.activityDayState > 1 ? "s" : ""} clôturée{counts.activityDayState > 1 ? "s" : ""}</li> : null}
                  {counts.notifications > 0 ? <li>{counts.notifications} notification{counts.notifications > 1 ? "s" : ""}</li> : null}
                </ul>
                <p className="mt-2">La suppression définitive est refusée pour protéger l&apos;historique. Vous pouvez désactiver l&apos;activité à la place.</p>
              </div>
            )
          ) : null}
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            {counts && total === 0 ? (
              <button type="button" disabled={isPending} onClick={confirmDelete} className="tap-scale h-11 flex-1 rounded-xl bg-[var(--danger)] text-sm font-bold text-white disabled:opacity-50">
                Supprimer définitivement
              </button>
            ) : counts && total !== null && total > 0 ? (
              <button type="button" disabled={isPending} onClick={deactivateInstead} className="tap-scale h-11 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50">
                Désactiver l&apos;activité
              </button>
            ) : null}
            <button type="button" onClick={close} className="tap-scale h-11 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

export function ActivityRow({ activity, monitors }: { activity: ActivityRecord; monitors: MonitorRecord[] }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`font-semibold ${activity.active ? "text-[var(--foreground)]" : "text-[var(--muted)] line-through"}`}>{activity.name}</p>
          {!activity.active ? <span className="rounded-full bg-[var(--warning-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--brand-gold)]">INACTIVE</span> : null}
          <EditActivityDialog activity={activity} />
          <DeleteActivityButton activity={activity} />
        </div>
        {activity.description ? <p className="mt-1 text-xs text-[var(--muted)]">{activity.description}</p> : null}
      </div>
      <div className="flex items-start gap-3">
        <MonitorAssignment activity={activity} monitors={monitors} />
        <ActiveToggle activity={activity} />
      </div>
    </div>
  );
}
