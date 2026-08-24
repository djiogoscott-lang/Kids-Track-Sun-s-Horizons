"use server";

import { revalidatePath } from "next/cache";
import {
  closeSession,
  correctDeparture,
  recordAbsence,
  recordArrival,
  recordDeparture,
  recordExcused,
} from "@/features/attendance/application/commands";
import { AttendanceCommandError } from "@/features/attendance/application/errors";
import { resolveAnomaly } from "@/features/attendance/application/queries";
import { requireUser } from "@/lib/auth/require-user";
import { getDemoState } from "@/server/demo/store";

export type ActionResult = { ok: true } | { ok: false; message: string };
export type CloseActionResult = { ok: true; closed: boolean; stillPresentCount: number } | { ok: false; message: string };

async function assertSessionAccess(sessionId: string) {
  const user = await requireUser();
  const session = getDemoState().sessions.get(sessionId);
  if (!session) throw new AttendanceCommandError("Séance introuvable.");
  if (user.role !== "ADMIN" && !session.monitorIds.includes(user.id)) {
    throw new AttendanceCommandError("Vous n'avez pas accès à cette séance.");
  }
  return user;
}

function toResult(fn: () => void): ActionResult {
  try {
    fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof AttendanceCommandError) return { ok: false, message: error.message };
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function arriveAction(sessionId: string, participantId: string): Promise<ActionResult> {
  const user = await assertSessionAccess(sessionId);
  const result = toResult(() => recordArrival(sessionId, participantId, user));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  return result;
}

export async function absentAction(sessionId: string, participantId: string): Promise<ActionResult> {
  const user = await assertSessionAccess(sessionId);
  const result = toResult(() => recordAbsence(sessionId, participantId, user));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  return result;
}

export async function excuseAction(sessionId: string, participantId: string): Promise<ActionResult> {
  const user = await assertSessionAccess(sessionId);
  const result = toResult(() => recordExcused(sessionId, participantId, user));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  return result;
}

export async function departAction(sessionId: string, participantId: string): Promise<ActionResult> {
  const user = await assertSessionAccess(sessionId);
  const result = toResult(() => recordDeparture(sessionId, participantId, user));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  return result;
}

export async function correctDepartureAction(
  sessionId: string,
  participantId: string,
  newLeftAtIso: string,
  reason: string,
): Promise<ActionResult> {
  const user = await assertSessionAccess(sessionId);
  const result = toResult(() => correctDeparture(sessionId, participantId, new Date(newLeftAtIso), reason, user));
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath(`/sessions/${sessionId}/history`);
  revalidatePath("/anomalies");
  return result;
}

export async function closeSessionAction(sessionId: string, force: boolean): Promise<CloseActionResult> {
  const user = await assertSessionAccess(sessionId);
  try {
    const result = closeSession(sessionId, user, { force });
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath("/dashboard");
    revalidatePath("/sessions");
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof AttendanceCommandError) return { ok: false, message: error.message };
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function resolveAnomalyAction(anomalyId: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  resolveAnomaly(anomalyId, user.name);
  revalidatePath("/anomalies");
  revalidatePath("/dashboard");
  return { ok: true };
}
