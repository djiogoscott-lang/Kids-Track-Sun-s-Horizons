import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";
import { toDateKey } from "./attendance-repo";

export interface DayState {
  closed: boolean;
  closedAt: Date | null;
  closedBy: string | null;
}

export async function getDayState(activityId: string, date: Date): Promise<DayState> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("activity_day_state")
    .select("closed, closed_at, closed_by")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("activity_id", activityId)
    .eq("date", toDateKey(date))
    .maybeSingle();
  if (error) throw error;
  if (!data) return { closed: false, closedAt: null, closedBy: null };
  return { closed: data.closed, closedAt: data.closed_at ? new Date(data.closed_at) : null, closedBy: data.closed_by };
}

/** Batch form for history views (one query for a whole week/organization
 * instead of one round trip per activity per day). */
export async function getDayStatesForDateRange(startDate: Date, endDate: Date, activityId?: string) {
  const supabase = getServiceRoleClient();
  let query = supabase
    .from("activity_day_state")
    .select("activity_id, date, closed, closed_at, closed_by")
    .eq("organization_id", ORGANIZATION_ID)
    .gte("date", toDateKey(startDate))
    .lte("date", toDateKey(endDate));
  if (activityId) query = query.eq("activity_id", activityId);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((row) => ({
    activityId: row.activity_id,
    date: row.date,
    closed: row.closed,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
    closedBy: row.closed_by,
  }));
}

/**
 * Idempotent, guarded against double-closure at the data layer too (not just
 * in application code): if a row already exists with closed = true, this
 * throws rather than silently overwriting it, so a race between two taps
 * can't produce two different closed_at timestamps for the same day.
 */
export async function closeDay(activityId: string, date: Date, closedByUserId: string | null): Promise<void> {
  const supabase = getServiceRoleClient();
  const existing = await getDayState(activityId, date);
  if (existing.closed) {
    throw new Error("Cette séance est déjà clôturée.");
  }
  const { error } = await supabase.from("activity_day_state").upsert(
    {
      organization_id: ORGANIZATION_ID,
      activity_id: activityId,
      date: toDateKey(date),
      closed: true,
      closed_at: new Date().toISOString(),
      closed_by: closedByUserId,
    },
    { onConflict: "activity_id,date" },
  );
  if (error) throw error;
}
