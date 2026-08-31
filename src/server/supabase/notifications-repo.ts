import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveSchoolId } from "@/lib/schools/context";

export interface Notification {
  id: string;
  activityId: string;
  message: string;
  createdAt: Date;
  createdBy: string;
  read: boolean;
  readAt: Date | null;
}

interface NotificationRow {
  id: string;
  activity_id: string;
  message: string;
  created_at: string;
  read_at: string | null;
  created_by_name: string | null;
}

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    activityId: row.activity_id,
    message: row.message,
    createdAt: new Date(row.created_at),
    createdBy: row.created_by_name ?? "Administrateur",
    read: row.read_at !== null,
    readAt: row.read_at ? new Date(row.read_at) : null,
  };
}

// created_by is a nullable FK to profiles — only admins ever insert (enforced
// by RLS), so a missing name falls back to "Administrateur" rather than
// failing the whole read, same resilience pattern as monitorName() elsewhere.
const SELECT_COLUMNS = "id, activity_id, message, created_at, read_at, created_by_name:profiles(full_name)";

export async function getNotificationsForActivity(activityId: string): Promise<Notification[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLUMNS)
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("activity_id", activityId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as (Omit<NotificationRow, "created_by_name"> & { created_by_name: { full_name: string } | null })[]).map((row) =>
    toNotification({ ...row, created_by_name: row.created_by_name?.full_name ?? null }),
  );
}

export async function getUnreadCountForActivity(activityId: string): Promise<number> {
  const supabase = getServiceRoleClient();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("activity_id", activityId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getAllNotifications(): Promise<Notification[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLUMNS)
    .eq("organization_id", (await requireActiveSchoolId()))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as (Omit<NotificationRow, "created_by_name"> & { created_by_name: { full_name: string } | null })[]).map((row) =>
    toNotification({ ...row, created_by_name: row.created_by_name?.full_name ?? null }),
  );
}

export async function addNotification(activityId: string, message: string, createdBy: string | null): Promise<Notification> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("notifications")
    .insert({ organization_id: (await requireActiveSchoolId()), activity_id: activityId, message, created_by: createdBy })
    .select("id, activity_id, message, created_at, read_at")
    .single();
  if (error) throw error;
  return toNotification({ ...data, created_by_name: null });
}

export async function markActivityNotificationsRead(activityId: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("activity_id", activityId)
    .is("read_at", null);
  if (error) throw error;
}
