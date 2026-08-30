import {
  addNotificationRecord,
  addToRosterRecord,
  bulkAddToRosterRecord,
  closeDay,
  createAccountRecord,
  createChildRecord,
  deleteChildRecordPermanently,
  duplicateRosterWeekRecord,
  getActivitiesList,
  getAttendanceMap,
  getChildById,
  getChildrenList,
  getDayState,
  getMonitorsList,
  getRosterForWeek,
  isMonitorEmailTaken,
  markActivityNotificationsReadData,
  removeFromRosterRecord,
  resetRosterForActivityWeekRecord,
  setAttendance,
  setMonitorActiveRecord,
  setMonitorForActivity,
  updateAccountPasswordRecord,
  updateChildRecord,
  updateMonitorNameRecord,
  weekBounds,
  type ChildRecord,
  type NewChildRecordInput,
} from "@/server/data-source";
import type { PresenceRecord } from "@/features/presence/domain/types";
import { PresenceCommandError } from "./errors";

function emptyRecord(childId: string, activityId: string): PresenceRecord {
  return { childId, activityId, arrived: false, arrivedAt: null, left: false, leftAt: null, daycareManual: false };
}

/**
 * A child with no attendance row yet is not an error — it's the normal
 * "not marked today" starting state (real rows only exist once someone
 * actually records something). Eligibility for a *first* mark today is
 * roster-based (or the legacy children.activityId check when no roster
 * exists yet for the week — see resolveEffectiveActivityMap in queries.ts
 * for the same fallback rule applied to reads). Once a real record already
 * exists for this activity+date, it is always returned as-is regardless of
 * any roster change since — a child moved to another activity's roster
 * mid-day must not suddenly become unmanageable on the activity that
 * already has their attendance row for today.
 */
async function requireRecord(childId: string, activityId: string, now: Date): Promise<PresenceRecord> {
  const child = await getChildById(childId);
  if (!child) throw new PresenceCommandError("Enfant introuvable.");

  const records = await getAttendanceMap(now, activityId);
  const existing = records.get(childId);
  if (existing) return existing;

  const { weekStart } = weekBounds(now);
  const roster = await getRosterForWeek(weekStart);
  const eligible = roster.length === 0 ? child.activityId === activityId && child.active : roster.some((r) => r.childId === childId && r.activityId === activityId);
  if (!eligible) throw new PresenceCommandError("Enfant introuvable pour cette activité.");

  return emptyRecord(childId, activityId);
}

/** Same roster-or-legacy-fallback rule as requireRecord/resolveEffectiveActivityMap
 * (queries.ts), for call sites that resolve one child's activity for this
 * week rather than validating against an already-known one. */
async function resolveEffectiveActivityId(child: ChildRecord, now: Date): Promise<string | null> {
  const { weekStart } = weekBounds(now);
  const roster = await getRosterForWeek(weekStart);
  if (roster.length === 0) return child.active ? child.activityId : null;
  return roster.find((r) => r.childId === child.id)?.activityId ?? null;
}

export async function markArrived(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { arrived: true, arrivedAt: now }, recordedBy);
}

/** Marking a child absent also clears any departure: an absent child cannot have "left". */
export async function markAbsent(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { arrived: false, arrivedAt: null, departed: false, departedAt: null }, recordedBy);
}

export async function markLeft(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  const record = await requireRecord(childId, activityId, now);
  if (!record.arrived) throw new PresenceCommandError("Un enfant absent ne peut pas être marqué parti.");
  await setAttendance(childId, activityId, now, { departed: true, departedAt: now }, recordedBy);
}

export async function markStillPresent(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { departed: false, departedAt: null }, recordedBy);
}

/**
 * Manual Garderie addition ("+ Ajouter un enfant"): a same-day event on the
 * child's own attendance row, never a change to their permanent daycareAuto
 * registration or their activity. A child not yet marked arrived today is
 * arrived automatically first — Garderie presence in this domain requires
 * `arrived: true` (see daycareReason), so there is no other coherent state
 * to put them in without also inventing a "present in daycare but absent
 * from their activity" case the rest of the app has no concept of.
 */
export async function addChildToDaycare(childId: string, recordedBy: string, now = new Date()) {
  const child = await getChildById(childId);
  if (!child || !child.active) throw new PresenceCommandError("Enfant introuvable ou inactif.");
  const activityId = await resolveEffectiveActivityId(child, now);
  if (!activityId) throw new PresenceCommandError("Cet enfant ne fait pas partie du roster de la semaine.");

  const records = await getAttendanceMap(now, activityId);
  const record = records.get(childId) ?? emptyRecord(childId, activityId);
  if (record.left) {
    throw new PresenceCommandError("Cet enfant est déjà parti aujourd'hui et ne peut pas être ajouté à la garderie.");
  }

  if (!record.arrived) {
    await setAttendance(childId, activityId, now, { arrived: true, arrivedAt: now, daycareManual: true }, recordedBy);
  } else {
    await setAttendance(childId, activityId, now, { daycareManual: true }, recordedBy);
  }

  return { activityId };
}

export async function assignMonitor(activityId: string, monitorId: string) {
  const [activities, monitors] = await Promise.all([getActivitiesList(), getMonitorsList()]);
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!monitors.some((m) => m.id === monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
  await setMonitorForActivity(activityId, monitorId);
}

/**
 * Guarded twice against double-closure: once here (a friendly error message
 * before ever touching the write path) and once more at the repository
 * layer (server/supabase/activity-day-state-repo.ts), which is the one that
 * actually matters — a reload racing a second tap can't slip past both.
 */
export async function closeActivityDay(activityId: string, closedByUserId: string, closedByName: string, now = new Date()) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  const dayState = await getDayState(activityId, now);
  if (dayState.closed) throw new PresenceCommandError("Cette séance est déjà clôturée.");

  // Finalize the roll call: once the session is closed there is no more
  // "not yet marked" — anyone still untouched becomes explicitly absent, so
  // a closed day's counters are always real numbers, never a leftover
  // NOT_MARKED bucket implying the appel is somehow still open. Scoped to
  // this week's roster (or the legacy children.activityId fallback when no
  // roster exists yet) — exactly who the live "à traiter" count showed,
  // never a child who was already correctly excluded from today's séance.
  const { weekStart } = weekBounds(now);
  const [children, records, roster] = await Promise.all([getChildrenList(), getAttendanceMap(now, activityId), getRosterForWeek(weekStart)]);
  const rosterChildIds = roster.length === 0 ? null : new Set(roster.filter((r) => r.activityId === activityId).map((r) => r.childId));
  const unmarked = children.filter(
    (c) => c.active && !records.has(c.id) && (rosterChildIds === null ? c.activityId === activityId : rosterChildIds.has(c.id)),
  );
  for (const child of unmarked) {
    await setAttendance(child.id, activityId, now, { arrived: false, arrivedAt: null, departed: false, departedAt: null }, closedByUserId);
  }

  await closeDay(activityId, now, closedByUserId, closedByName);
}

async function validateChildInput(input: Pick<NewChildRecordInput, "firstName" | "lastName" | "activityId">) {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new PresenceCommandError("Le prénom et le nom sont obligatoires.");
  }
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === input.activityId)) {
    throw new PresenceCommandError("Activité introuvable.");
  }
}

export async function createChild(input: NewChildRecordInput): Promise<ChildRecord> {
  await validateChildInput(input);
  // Deliberately no attendance row seeded here: "no row for (child, date)"
  // is exactly what NOT_MARKED means (see morningStatus in domain/types.ts).
  // Seeding an {arrived: false} placeholder would make a brand-new child
  // indistinguishable from one a monitor explicitly marked absent.
  return createChildRecord(input);
}

export interface UpdateChildInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
}

export async function updateChild(childId: string, input: UpdateChildInput): Promise<ChildRecord> {
  await validateChildInput(input);
  const existing = await getChildById(childId);
  if (!existing) throw new PresenceCommandError("Enfant introuvable.");

  const updated = await updateChildRecord(childId, input);
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");
  // Moving a child to another activity needs no attendance write: their
  // attendance map query is scoped by activity_id, so any prior row (still
  // tagged with the old activity) simply won't match the new activity's
  // query — they naturally start NOT_MARKED there without a placeholder.
  return updated;
}

export async function setChildActive(childId: string, active: boolean): Promise<ChildRecord> {
  const updated = await updateChildRecord(childId, { active });
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");
  return updated;
}

/**
 * confirmationText is re-checked here, not just enforced by a disabled
 * button in the UI — the "type SUPPRIMER" requirement is a safeguard against
 * misclicks, and a client-only check would be trivial to bypass.
 */
export async function deleteChildPermanently(childId: string, confirmationText: string): Promise<void> {
  if (confirmationText.trim().toUpperCase() !== "SUPPRIMER") {
    throw new PresenceCommandError('Tapez "SUPPRIMER" pour confirmer.');
  }
  const child = await getChildById(childId);
  if (!child) throw new PresenceCommandError("Enfant introuvable.");
  await deleteChildRecordPermanently(childId);
}

export interface BulkDeleteResult {
  deletedCount: number;
  blockedNames: string[];
}

/**
 * Each child is attempted independently rather than as one all-or-nothing
 * operation: a batch of 24 children where 3 have history should delete the
 * 21 that can be deleted and clearly report the 3 that can't, not fail the
 * whole batch over rows that were never going to succeed anyway.
 */
export async function bulkDeleteChildren(childIds: string[], confirmationText: string): Promise<BulkDeleteResult> {
  if (confirmationText.trim().toUpperCase() !== "SUPPRIMER") {
    throw new PresenceCommandError('Tapez "SUPPRIMER" pour confirmer.');
  }
  let deletedCount = 0;
  const blockedNames: string[] = [];
  for (const childId of childIds) {
    const child = await getChildById(childId);
    if (!child) continue;
    try {
      await deleteChildRecordPermanently(childId);
      deletedCount++;
    } catch (error) {
      if (error instanceof PresenceCommandError) {
        blockedNames.push(`${child.firstName} ${child.lastName}`);
      } else {
        throw error;
      }
    }
  }
  return { deletedCount, blockedNames };
}

export async function sendNotification(activityId: string, message: string, createdByUserId: string, createdByName: string) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!message.trim()) throw new PresenceCommandError("Le message ne peut pas être vide.");
  return addNotificationRecord(activityId, message.trim(), createdByUserId, createdByName);
}

export async function markNotificationsRead(activityId: string) {
  await markActivityNotificationsReadData(activityId);
}

export async function setMonitorActive(monitorId: string, active: boolean, actingAdminId: string) {
  await setMonitorActiveRecord(monitorId, active, actingAdminId);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function assertValidPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PresenceCommandError("Le mot de passe ne respecte pas les conditions requises.");
  }
}

/**
 * The admin chooses the password directly — no invitation email, no
 * "set your own password" step. Validated here (format, length, uniqueness)
 * before ever reaching Supabase Auth; createAccountRecord() rolls back the
 * Auth user itself if a later step (membership, activity) fails, so this
 * never leaves a half-created account behind.
 */
export async function createAccount(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: "ADMIN" | "MONITOR",
  activityId: string | null,
) {
  const trimmedEmail = email.trim();
  if (!EMAIL_PATTERN.test(trimmedEmail)) throw new PresenceCommandError("Adresse email invalide.");
  if (!firstName.trim() || !lastName.trim()) throw new PresenceCommandError("Le prénom et le nom sont obligatoires.");
  assertValidPassword(password);
  if (await isMonitorEmailTaken(trimmedEmail)) throw new PresenceCommandError("Cette adresse e-mail est déjà utilisée.");
  if (activityId) {
    const activities = await getActivitiesList();
    if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  }
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  return createAccountRecord(trimmedEmail, password, fullName, role, activityId);
}

export async function updateMonitorName(monitorId: string, fullName: string) {
  if (!fullName.trim()) throw new PresenceCommandError("Le nom est obligatoire.");
  await updateMonitorNameRecord(monitorId, fullName.trim());
}

export async function updateMonitorPassword(monitorId: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw new PresenceCommandError("Les deux mots de passe ne correspondent pas.");
  assertValidPassword(newPassword);
  await updateAccountPasswordRecord(monitorId, newPassword);
}

// ---------------------------------------------------------------------------
// Weekly roster — "participants de la semaine". Distinct on purpose from
// child management above: these commands only ever touch weekly_roster,
// never public.children — removing someone from a roster is never a
// substitute for (and can never trigger) deleteChildPermanently.
// ---------------------------------------------------------------------------

export async function addChildToRoster(childId: string, activityId: string, weekStart: string, addedBy: string) {
  const [child, activities] = await Promise.all([getChildById(childId), getActivitiesList()]);
  if (!child || !child.active) throw new PresenceCommandError("Enfant introuvable ou inactif.");
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  const { weekStart: normalizedStart, weekEnd } = weekBounds(new Date(`${weekStart}T12:00:00`));
  await addToRosterRecord(childId, activityId, normalizedStart, weekEnd, addedBy);
}

export async function removeChildFromRoster(childId: string, weekStart: string) {
  await removeFromRosterRecord(childId, weekStart);
}

export interface ResetRosterResult {
  removedCount: number;
}

/**
 * Unlike deleteChildPermanently/bulkDeleteChildren, this never touches
 * public.children or history — it only removes rows from weekly_roster for
 * one activity's one week, so a simple confirm/cancel (no typed word) is
 * enough friction, matching the spec's lighter confirmation for this action.
 */
export async function resetRosterForActivityWeek(activityId: string, weekStart: string): Promise<ResetRosterResult> {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  const removedCount = await resetRosterForActivityWeekRecord(activityId, weekStart);
  return { removedCount };
}

/** Never automatic — an explicit admin action that copies last week's
 * roster forward as a starting point, skipping any child who already has a
 * row for the target week so it never clobbers an edit already made there. */
export async function duplicatePreviousWeekRoster(fromWeekStart: string, toWeekStart: string, createdBy: string): Promise<number> {
  const { weekEnd: toWeekEnd } = weekBounds(new Date(`${toWeekStart}T12:00:00`));
  return duplicateRosterWeekRecord(fromWeekStart, toWeekStart, toWeekEnd, createdBy);
}

export interface RosterImportRow {
  firstName: string;
  lastName: string;
  activityName: string;
  /** Optional free-text date (ISO YYYY-MM-DD or DD/MM/YYYY) — when present,
   * checked against the target week rather than used to route the row, so a
   * stale file re-imported into the wrong week is caught instead of
   * silently accepted. */
  weekLabel?: string;
}

export interface RosterImportOutcome {
  row: RosterImportRow;
  status: "MATCHED" | "UNKNOWN_CHILD" | "UNKNOWN_ACTIVITY" | "WEEK_MISMATCH" | "DUPLICATE";
  childId?: string;
  activityId?: string;
  message?: string;
}

function parseWeekLabel(label: string): Date | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return new Date(`${trimmed}T12:00:00`);
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (fr) return new Date(`${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}T12:00:00`);
  return null;
}

/**
 * Preview-only: matches each row against known children (by first+last
 * name, case-insensitive) and activities, without writing anything. Unknown
 * children are flagged rather than silently skipped or auto-created — the
 * admin explicitly decides whether to create the profile (commitRosterImport
 * below, with createUnknownChildren) before anything is written. A row
 * naming a different week than targetWeekStart is flagged rather than
 * silently imported into the wrong week; a child appearing twice in the
 * same file is flagged as a duplicate rather than silently overwritten.
 */
export async function previewRosterImport(rows: RosterImportRow[], targetWeekStart: string): Promise<RosterImportOutcome[]> {
  const [allChildren, activities] = await Promise.all([getChildrenList(), getActivitiesList()]);
  const childByName = new Map(allChildren.filter((c) => c.active).map((c) => [`${c.firstName} ${c.lastName}`.toLowerCase().trim(), c]));
  const activityByName = new Map(activities.map((a) => [a.name.toLowerCase().trim(), a]));
  const { weekStart: normalizedTarget } = weekBounds(new Date(`${targetWeekStart}T12:00:00`));
  const seenChildIds = new Set<string>();

  return rows.map((row) => {
    if (row.weekLabel?.trim()) {
      const parsed = parseWeekLabel(row.weekLabel);
      const rowWeekStart = parsed ? weekBounds(parsed).weekStart : null;
      if (!rowWeekStart) return { row, status: "WEEK_MISMATCH" as const, message: `Semaine "${row.weekLabel}" illisible.` };
      if (rowWeekStart !== normalizedTarget) {
        return { row, status: "WEEK_MISMATCH" as const, message: `Cette ligne concerne la semaine du ${rowWeekStart}, pas celle importée (${normalizedTarget}).` };
      }
    }
    const activity = activityByName.get(row.activityName.toLowerCase().trim());
    if (!activity) return { row, status: "UNKNOWN_ACTIVITY" as const };
    const child = childByName.get(`${row.firstName} ${row.lastName}`.toLowerCase().trim());
    if (!child) return { row, status: "UNKNOWN_CHILD" as const, activityId: activity.id };
    if (seenChildIds.has(child.id)) {
      return { row, status: "DUPLICATE" as const, childId: child.id, activityId: activity.id, message: "Cet enfant apparaît plusieurs fois dans ce fichier." };
    }
    seenChildIds.add(child.id);
    return { row, status: "MATCHED" as const, childId: child.id, activityId: activity.id };
  });
}

export interface CommitRosterImportResult {
  addedCount: number;
  createdChildrenCount: number;
  skippedCount: number;
}

/**
 * Re-validates from scratch server-side (never trusts the client's echoed
 * preview) — same discipline as commitChildrenImport. createUnknownChildren
 * opts into creating a permanent profile for a row with no existing match;
 * without it, unknown-child rows are silently skipped and counted.
 */
export async function commitRosterImport(
  rows: RosterImportRow[],
  weekStart: string,
  createUnknownChildren: boolean,
  actingUserId: string,
): Promise<CommitRosterImportResult> {
  const outcomes = await previewRosterImport(rows, weekStart);
  const { weekStart: normalizedStart, weekEnd } = weekBounds(new Date(`${weekStart}T12:00:00`));

  let createdChildrenCount = 0;
  let skippedCount = 0;
  const entries: Array<{ childId: string; activityId: string }> = [];

  for (const outcome of outcomes) {
    if (outcome.status === "UNKNOWN_ACTIVITY" || outcome.status === "WEEK_MISMATCH" || outcome.status === "DUPLICATE") {
      skippedCount++;
      continue;
    }
    if (outcome.status === "UNKNOWN_CHILD") {
      if (!createUnknownChildren) {
        skippedCount++;
        continue;
      }
      const created = await createChildRecord({
        firstName: outcome.row.firstName.trim(),
        lastName: outcome.row.lastName.trim(),
        activityId: outcome.activityId!,
        daycareAuto: false,
        notes: "",
      });
      createdChildrenCount++;
      entries.push({ childId: created.id, activityId: outcome.activityId! });
      continue;
    }
    entries.push({ childId: outcome.childId!, activityId: outcome.activityId! });
  }

  await bulkAddToRosterRecord(entries, normalizedStart, weekEnd, actingUserId);
  return { addedCount: entries.length, createdChildrenCount, skippedCount };
}
