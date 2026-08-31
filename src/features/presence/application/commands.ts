import {
  addNotificationRecord,
  addToRosterRecord,
  bulkAddToRosterRecord,
  bulkCreateChildRecords,
  bulkMarkAbsentRecords,
  closeDay,
  createAccountRecord,
  createActivityRecord,
  createChildRecord,
  bulkDeleteChildRecordsPermanently,
  deleteActivityRecord,
  deleteChildRecordPermanently,
  duplicateRosterWeekRecord,
  getActivitiesList,
  getActivityDependencyCountsRecord,
  getAttendanceMap,
  getOperationalResetPreviewRecord,
  resetOperationalDataRecord,
  getChildById,
  getChildrenList,
  getDayState,
  getMonitorsList,
  getRosterForWeek,
  isMonitorEmailTaken,
  markActivityNotificationsReadData,
  removeActivityMonitorRecord,
  removeFromRosterRecord,
  resetRosterForActivityWeekRecord,
  setAttendance,
  setMonitorActiveRecord,
  setMonitorForActivity,
  updateAccountPasswordRecord,
  updateActivityRecord,
  updateChildRecord,
  updateMonitorNameRecord,
  weekBounds,
  type ActivityRecord,
  type ChildRecord,
  type NewChildRecordInput,
} from "@/server/data-source";
import type { PresenceRecord } from "@/features/presence/domain/types";
import { suggestActivityMatch, suggestNameSplit } from "./ai-import-assist";
import { parseYesNo } from "./excel-import";
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
  const activity = activities.find((a) => a.id === activityId);
  if (!activity) throw new PresenceCommandError("Activité introuvable.");
  if (!monitors.some((m) => m.id === monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
  if (activity.monitorId) {
    const currentName = monitors.find((m) => m.id === activity.monitorId)?.name ?? "un autre moniteur";
    if (activity.monitorId !== monitorId) {
      throw new PresenceCommandError(`Cette activité est déjà attribuée à ${currentName}. Retirez-le d'abord avant d'attribuer un autre moniteur.`);
    }
  }
  await setMonitorForActivity(activityId, monitorId);
}

export async function unassignActivityMonitor(activityId: string) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  await removeActivityMonitorRecord(activityId);
}

const ACTIVITY_NAME_MAX = 160;
const ACTIVITY_DESCRIPTION_MAX = 1000;

function assertValidActivityName(name: string, existing: ActivityRecord[], excludingId?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new PresenceCommandError("Le nom de l'activité est obligatoire.");
  if (trimmed.length > ACTIVITY_NAME_MAX) throw new PresenceCommandError(`Le nom ne peut pas dépasser ${ACTIVITY_NAME_MAX} caractères.`);
  const clash = existing.find((a) => a.id !== excludingId && a.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (clash) throw new PresenceCommandError(`Une activité nommée "${trimmed}" existe déjà.`);
}

export interface CreateActivityInput {
  name: string;
  description: string;
  monitorId: string | null;
  active: boolean;
}

export async function createActivity(input: CreateActivityInput): Promise<ActivityRecord> {
  const [activities, monitors] = await Promise.all([getActivitiesList(), getMonitorsList()]);
  assertValidActivityName(input.name, activities);
  if (input.description.length > ACTIVITY_DESCRIPTION_MAX) {
    throw new PresenceCommandError(`La description ne peut pas dépasser ${ACTIVITY_DESCRIPTION_MAX} caractères.`);
  }
  if (input.monitorId) {
    if (!monitors.some((m) => m.id === input.monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
    const alreadyAssigned = activities.find((a) => a.monitorId === input.monitorId);
    if (alreadyAssigned) {
      throw new PresenceCommandError(`Ce moniteur est déjà attribué à ${alreadyAssigned.name}.`);
    }
  }
  return createActivityRecord({ name: input.name.trim(), description: input.description.trim(), monitorId: input.monitorId, active: input.active });
}

export interface UpdateActivityInput {
  name?: string;
  description?: string;
  active?: boolean;
}

export async function updateActivity(activityId: string, input: UpdateActivityInput): Promise<ActivityRecord> {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (input.name !== undefined) assertValidActivityName(input.name, activities, activityId);
  if (input.description !== undefined && input.description.length > ACTIVITY_DESCRIPTION_MAX) {
    throw new PresenceCommandError(`La description ne peut pas dépasser ${ACTIVITY_DESCRIPTION_MAX} caractères.`);
  }
  return updateActivityRecord(activityId, {
    name: input.name?.trim(),
    description: input.description?.trim(),
    active: input.active,
  });
}

export async function deleteActivity(activityId: string): Promise<void> {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  await deleteActivityRecord(activityId);
}

export async function getActivityDependencyCounts(activityId: string) {
  return getActivityDependencyCountsRecord(activityId);
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
  // One batched write, not one (read + write) per child: closing a 30-child
  // activity used to cost 60 sequential round trips.
  await bulkMarkAbsentRecords(
    unmarked.map((c) => ({ childId: c.id, activityId })),
    now,
    closedByUserId,
  );

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
 * One batched call, not a loop: eligibility (no real history, no roster
 * reference) is decided for the whole selection at once and both cleanup
 * deletes run inside a single Postgres function call, so a batch of 24
 * children where 3 are blocked deletes the 21 that can be deleted and
 * clearly reports the 3 that can't — without the round-trip cost or the
 * check-then-delete race window a per-child loop would carry.
 */
export async function bulkDeleteChildren(childIds: string[], confirmationText: string): Promise<BulkDeleteResult> {
  if (confirmationText.trim().toUpperCase() !== "SUPPRIMER") {
    throw new PresenceCommandError('Tapez "SUPPRIMER" pour confirmer.');
  }
  const { deletedIds, blocked } = await bulkDeleteChildRecordsPermanently(childIds);
  return { deletedCount: deletedIds.length, blockedNames: blocked.map((b) => `${b.firstName} ${b.lastName}`) };
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

export async function removeChildFromRoster(childId: string, weekStart: string, removedBy: string | null = null) {
  await removeFromRosterRecord(childId, weekStart, removedBy);
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
export async function resetRosterForActivityWeek(activityId: string, weekStart: string, resetBy: string | null = null): Promise<ResetRosterResult> {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  const removedCount = await resetRosterForActivityWeekRecord(activityId, weekStart, resetBy);
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
  row: number;
  sheetName: string;
  firstName: string;
  lastName: string;
  /** Raw "Nom complet" text when the file has no separate name columns. */
  fullName?: string;
  activityName: string;
  garderie: string;
  notes: string;
  /** Set by the admin in the preview UI to correct a row whose activityName
   * didn't match any known activity — an explicit activity id picked by
   * hand, never inferred. Takes priority over activityName when present. */
  activityOverride?: string;
}

export type RosterImportStatus = "NEW_CHILD" | "KNOWN_CHILD" | "ALREADY_ENROLLED" | "UNKNOWN_ACTIVITY" | "DUPLICATE" | "ERROR";

export interface RosterImportOutcome {
  row: RosterImportRow;
  status: RosterImportStatus;
  childId?: string;
  activityId?: string;
  activityName?: string;
  daycareAuto?: boolean;
  notes?: string;
  message?: string;
  /** OpenAI-suggested correction, shown in the preview UI as a proposal the
   * admin must explicitly accept (which fills activityOverride / firstName+
   * lastName and re-previews) — never applied automatically, never written
   * to Supabase directly. Absent whenever AI assist is disabled, the row
   * isn't ambiguous, or the model call failed/returned nothing usable. */
  aiSuggestion?: { activityName?: string; firstName?: string; lastName?: string };
}

export interface RosterImportSummary {
  total: number;
  byActivity: Array<{ activityId: string; activityName: string; count: number }>;
  newChildren: number;
  knownChildren: number;
  alreadyEnrolled: number;
  duplicates: number;
  errors: number;
}

/** Hard cap on how many AI suggestion calls one preview can trigger — even a
 * pathological file (garbled headers, hundreds of unmatched rows) can only
 * ever cost a bounded, small number of OpenAI calls; rows beyond the cap
 * simply keep the existing manual-correction path with no suggestion. */
const MAX_AI_SUGGESTIONS_PER_PREVIEW = 60;

/**
 * Preview-only: matches each row against known children (by first+last
 * name, case-insensitive), known activities, and this week's existing
 * roster — without writing anything. An unrecognized activity is flagged
 * (UNKNOWN_ACTIVITY) rather than skipped or guessed at; the admin corrects
 * it by attaching activityOverride and re-previewing, exactly like the
 * column-mapping correction for headers. A child appearing twice in the
 * file is flagged (DUPLICATE) so only one inscription is ever created; a
 * child already enrolled in the same activity for this exact week is
 * flagged (ALREADY_ENROLLED) purely for visibility — committing it is a
 * harmless no-op upsert, not an error.
 *
 * aiAssist (default on for the interactive preview, off for the commit
 * route's defensive re-preview — see commitRosterImport) optionally calls
 * OpenAI for rows that are still unresolved after the deterministic pass:
 * an unmatched activity name, or a missing first/last name when the file
 * only had a "Nom complet" column. The suggestion is attached to the
 * outcome for the UI to show as a proposal — it never changes the row's
 * status or gets written anywhere by itself.
 */
export async function previewRosterImport(
  rows: RosterImportRow[],
  targetWeekStart: string,
  aiAssist = true,
): Promise<{ outcomes: RosterImportOutcome[]; summary: RosterImportSummary }> {
  const { weekStart: normalizedTarget } = weekBounds(new Date(`${targetWeekStart}T12:00:00`));
  const [allChildren, activities, roster] = await Promise.all([getChildrenList(), getActivitiesList(), getRosterForWeek(normalizedTarget)]);
  const childByName = new Map(allChildren.filter((c) => c.active).map((c) => [`${c.firstName}|${c.lastName}`.toLowerCase().trim(), c]));
  // Inactive activities are never auto-matched by name — an inactive
  // activity is not "available for new enrollment" (see ActivityRecord.active),
  // so a file referencing one by name is treated the same as an unrecognized
  // name: the admin must explicitly pick a (necessarily active) replacement.
  const activityByName = new Map(activities.filter((a) => a.active).map((a) => [a.name.toLowerCase().trim(), a]));
  const activityById = new Map(activities.map((a) => [a.id, a]));
  const rosterByChildId = new Map(roster.map((r) => [r.childId, r]));
  const seenNameKeys = new Set<string>();

  const outcomes: RosterImportOutcome[] = rows.map((row) => {
    const firstName = row.firstName.trim();
    const lastName = row.lastName.trim();
    if (!firstName || !lastName) {
      return { row, status: "ERROR", message: row.fullName?.trim() ? `Nom complet non séparé : "${row.fullName.trim()}"` : "Prénom et nom obligatoires." };
    }

    const activity = row.activityOverride ? activityById.get(row.activityOverride) : activityByName.get(row.activityName.toLowerCase().trim());
    if (!activity) {
      return { row, status: "UNKNOWN_ACTIVITY", message: row.activityName.trim() ? `Activité inconnue : "${row.activityName.trim()}"` : "Activité manquante." };
    }

    const garderie = parseYesNo(row.garderie, "Garderie");
    if (!garderie.ok) {
      return { row, status: "ERROR", activityId: activity.id, activityName: activity.name, message: garderie.message };
    }

    const nameKey = `${firstName}|${lastName}`.toLowerCase();
    if (seenNameKeys.has(nameKey)) {
      return { row, status: "DUPLICATE", activityId: activity.id, activityName: activity.name, message: "Cet enfant apparaît plusieurs fois dans ce fichier." };
    }
    seenNameKeys.add(nameKey);

    const child = childByName.get(nameKey);
    if (!child) {
      return { row, status: "NEW_CHILD", activityId: activity.id, activityName: activity.name, daycareAuto: garderie.value, notes: row.notes.trim() };
    }
    const existingRoster = rosterByChildId.get(child.id);
    if (existingRoster && existingRoster.activityId === activity.id) {
      return { row, status: "ALREADY_ENROLLED", childId: child.id, activityId: activity.id, activityName: activity.name, message: "Déjà inscrit à cette activité pour cette semaine." };
    }
    return { row, status: "KNOWN_CHILD", childId: child.id, activityId: activity.id, activityName: activity.name, daycareAuto: garderie.value, notes: row.notes.trim() };
  });

  if (aiAssist) {
    const knownActivityNames = activities.map((a) => a.name);
    let budget = MAX_AI_SUGGESTIONS_PER_PREVIEW;
    await Promise.all(
      outcomes.map(async (outcome, index) => {
        if (budget <= 0) return;
        if (outcome.status === "UNKNOWN_ACTIVITY" && !outcome.row.activityOverride && outcome.row.activityName.trim()) {
          budget--;
          const suggested = await suggestActivityMatch(outcome.row.activityName, knownActivityNames);
          if (suggested) outcomes[index] = { ...outcome, aiSuggestion: { ...outcome.aiSuggestion, activityName: suggested } };
        } else if (outcome.status === "ERROR" && !outcome.row.firstName.trim() && !outcome.row.lastName.trim() && outcome.row.fullName?.trim()) {
          budget--;
          const split = await suggestNameSplit(outcome.row.fullName);
          if (split) outcomes[index] = { ...outcome, aiSuggestion: { ...outcome.aiSuggestion, firstName: split.firstName, lastName: split.lastName } };
        }
      }),
    );
  }

  const byActivityCount = new Map<string, number>();
  for (const o of outcomes) {
    if ((o.status === "NEW_CHILD" || o.status === "KNOWN_CHILD" || o.status === "ALREADY_ENROLLED") && o.activityId) {
      byActivityCount.set(o.activityId, (byActivityCount.get(o.activityId) ?? 0) + 1);
    }
  }

  const summary: RosterImportSummary = {
    total: outcomes.length,
    byActivity: activities
      .map((a) => ({ activityId: a.id, activityName: a.name, count: byActivityCount.get(a.id) ?? 0 }))
      .filter((a) => a.count > 0),
    newChildren: outcomes.filter((o) => o.status === "NEW_CHILD").length,
    knownChildren: outcomes.filter((o) => o.status === "KNOWN_CHILD").length,
    alreadyEnrolled: outcomes.filter((o) => o.status === "ALREADY_ENROLLED").length,
    duplicates: outcomes.filter((o) => o.status === "DUPLICATE").length,
    errors: outcomes.filter((o) => o.status === "ERROR" || o.status === "UNKNOWN_ACTIVITY").length,
  };

  return { outcomes, summary };
}

export interface CommitRosterImportResult {
  addedCount: number;
  createdChildrenCount: number;
  knownChildrenCount: number;
  skippedCount: number;
  byActivity: Array<{ activityId: string; activityName: string; count: number }>;
}

/**
 * Re-validates from scratch server-side (never trusts the client's echoed
 * preview) — same discipline as commitChildrenImport. New children are
 * created in a single batch insert (bulkCreateChildRecords), not one query
 * per row; PostgREST does not guarantee a bulk insert's RETURNING order
 * matches the input order, so created rows are matched back to their
 * outcome by (name, activity) rather than by position — safe because
 * DUPLICATE detection above already guarantees at most one NEW_CHILD row
 * per name in this batch. Every roster write (new, known, or
 * already-enrolled) lands in one final bulk upsert. AI assist is disabled
 * for this re-preview: by commit time every ambiguous row must already have
 * been explicitly resolved by the admin (activityOverride set, or firstName/
 * lastName filled in) — a row still unresolved here is simply skipped
 * (UNKNOWN_ACTIVITY/ERROR are never in the created/roster-written sets), so
 * calling OpenAI again at the moment of writing real data would only add
 * cost and an external dependency with zero effect on the outcome.
 */
export async function commitRosterImport(rows: RosterImportRow[], weekStart: string, actingUserId: string): Promise<CommitRosterImportResult> {
  const { outcomes, summary } = await previewRosterImport(rows, weekStart, false);
  const { weekStart: normalizedStart, weekEnd } = weekBounds(new Date(`${weekStart}T12:00:00`));

  const toCreate = outcomes.filter((o) => o.status === "NEW_CHILD");
  const createdChildren =
    toCreate.length > 0
      ? await bulkCreateChildRecords(
          toCreate.map((o) => ({
            firstName: o.row.firstName.trim(),
            lastName: o.row.lastName.trim(),
            activityId: o.activityId!,
            daycareAuto: o.daycareAuto ?? false,
            notes: o.notes ?? "",
          })),
        )
      : [];
  const createdByKey = new Map(createdChildren.map((c) => [`${c.firstName.toLowerCase()}|${c.lastName.toLowerCase()}|${c.activityId}`, c]));

  const entries: Array<{ childId: string; activityId: string }> = [];
  for (const outcome of outcomes) {
    if (outcome.status === "NEW_CHILD") {
      const key = `${outcome.row.firstName.trim().toLowerCase()}|${outcome.row.lastName.trim().toLowerCase()}|${outcome.activityId}`;
      const created = createdByKey.get(key);
      if (created) entries.push({ childId: created.id, activityId: outcome.activityId! });
    } else if (outcome.status === "KNOWN_CHILD" || outcome.status === "ALREADY_ENROLLED") {
      entries.push({ childId: outcome.childId!, activityId: outcome.activityId! });
    }
  }

  await bulkAddToRosterRecord(entries, normalizedStart, weekEnd, actingUserId);

  return {
    addedCount: entries.length,
    createdChildrenCount: createdChildren.length,
    knownChildrenCount: summary.knownChildren + summary.alreadyEnrolled,
    skippedCount: summary.duplicates + summary.errors,
    byActivity: summary.byActivity,
  };
}

// ---------------------------------------------------------------------------
// Operational reset — no extra validation beyond what the Server Action's
// requireUser("ADMIN") already enforces before this is ever called.
// ---------------------------------------------------------------------------

export async function getOperationalResetPreview() {
  return getOperationalResetPreviewRecord();
}

export async function resetOperationalData(actorId: string) {
  return resetOperationalDataRecord(actorId);
}
