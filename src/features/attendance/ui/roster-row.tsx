"use client";

import { useState, useTransition } from "react";
import { PresenceBadge } from "@/features/attendance/ui/presence-badge";
import { arriveAction, absentAction, correctDepartureAction, departAction, excuseAction } from "@/features/attendance/ui/actions";
import { formatDuration, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ParticipantView } from "@/features/attendance/application/queries";

const actionButtonClass =
  "inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

export function RosterRow({ sessionId, participant, locked = false }: { sessionId: string; participant: ParticipantView; locked?: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [showCorrection, setShowCorrection] = useState(false);

  function run(action: () => Promise<{ ok: boolean; message?: string }>, successLabel: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setConfirmation(successLabel);
        setTimeout(() => setConfirmation(null), 2500);
      } else {
        setError(result.message ?? "Une erreur est survenue.");
      }
    });
  }

  const fullName = `${participant.firstName} ${participant.lastName}`;

  return (
    <li className="border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">{fullName}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <PresenceBadge presenceState={participant.presenceState} arrivalClassification={participant.arrivalClassification} />
            {participant.arrivedAt ? (
              <span className="text-xs text-[var(--muted)]">Arrivé {formatTime(participant.arrivedAt)}</span>
            ) : null}
            {participant.leftAt ? (
              <span className="text-xs text-[var(--muted)]">
                · Parti {formatTime(participant.leftAt)}
                {participant.arrivedAt ? ` · ${formatDuration(participant.arrivedAt.getTime(), participant.leftAt.getTime())}` : ""}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {confirmation ? <span className="text-xs font-semibold text-[var(--success)]">✓ {confirmation}</span> : null}

          {!locked && participant.presenceState === "EXPECTED" ? (
            <>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => arriveAction(sessionId, participant.id), "Arrivée enregistrée")}
                className={cn(actionButtonClass, "bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]")}
              >
                Arrivée
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => absentAction(sessionId, participant.id), "Absence enregistrée")}
                className={cn(actionButtonClass, "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--danger)]")}
              >
                Absent
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => run(() => excuseAction(sessionId, participant.id), "Absence excusée")}
                className={cn(actionButtonClass, "border border-[var(--border)] bg-white text-[var(--foreground)] hover:border-[var(--primary)]")}
              >
                Excusé
              </button>
            </>
          ) : null}

          {!locked && (participant.presenceState === "ABSENT" || participant.presenceState === "EXCUSED") ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => arriveAction(sessionId, participant.id), "Arrivée enregistrée")}
              className={cn(actionButtonClass, "bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]")}
            >
              Arrivée
            </button>
          ) : null}

          {!locked && participant.presenceState === "PRESENT" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => run(() => departAction(sessionId, participant.id), "Départ enregistré")}
              className={cn(actionButtonClass, "bg-[var(--foreground)] text-white hover:opacity-90")}
            >
              Départ
            </button>
          ) : null}

          {participant.presenceState === "LEFT" ? (
            <button
              type="button"
              onClick={() => setShowCorrection((v) => !v)}
              className={cn(actionButtonClass, "border border-[var(--border)] bg-white text-[var(--muted)] hover:text-[var(--foreground)]")}
            >
              Corriger
            </button>
          ) : null}
        </div>
      </div>

      {error ? <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">{error}</p> : null}

      {showCorrection && participant.presenceState === "LEFT" ? (
        <CorrectionForm
          sessionId={sessionId}
          participant={participant}
          onDone={() => setShowCorrection(false)}
          onSuccess={() => {
            setConfirmation("Correction enregistrée");
            setTimeout(() => setConfirmation(null), 2500);
          }}
        />
      ) : null}
    </li>
  );
}

function CorrectionForm({
  sessionId,
  participant,
  onDone,
  onSuccess,
}: {
  sessionId: string;
  participant: ParticipantView;
  onDone: () => void;
  onSuccess: () => void;
}) {
  const [time, setTime] = useState(participant.leftAt ? toTimeInputValue(participant.leftAt) : "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    setError(null);
    if (!time || !reason.trim()) {
      setError("Indiquez la nouvelle heure et le motif de la correction.");
      return;
    }
    const base = participant.leftAt ?? new Date();
    const corrected = new Date(base);
    const [hours, minutes] = time.split(":").map(Number);
    corrected.setHours(hours, minutes, 0, 0);

    startTransition(async () => {
      const result = await correctDepartureAction(sessionId, participant.id, corrected.toISOString(), reason);
      if (result.ok) {
        onSuccess();
        onDone();
      } else {
        setError(result.message ?? "Une erreur est survenue.");
      }
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-xs font-semibold text-[var(--foreground)]">Corriger l&apos;heure de départ</p>
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-[var(--muted)]">
          Nouvelle heure
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            className="mt-1 block h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
          />
        </label>
        <label className="min-w-[180px] flex-1 text-xs font-medium text-[var(--muted)]">
          Motif
          <input
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Erreur de saisie…"
            className="mt-1 block h-9 w-full rounded-lg border border-[var(--border)] bg-white px-2 text-sm"
          />
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="h-9 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          Confirmer
        </button>
        <button type="button" onClick={onDone} className="h-9 rounded-lg px-2 text-xs font-medium text-[var(--muted)]">
          Annuler
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

function toTimeInputValue(date: Date): string {
  return new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Brussels" }).format(date);
}
