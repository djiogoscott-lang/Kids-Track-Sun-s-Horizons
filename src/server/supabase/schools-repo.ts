import { getServiceRoleClient } from "@/lib/supabase/service";

/**
 * A school IS an organizations row — see lib/schools/context.ts for why the
 * existing tenant table was reused rather than a parallel `schools` table.
 * This repository is the only place that reads or writes schools *across*
 * tenants, so unlike every other repository it deliberately does not scope
 * by the active school: listing schools is precisely the operation that has
 * to see more than one. Authorization is enforced by the callers
 * (super-admin for creation, membership for everything else).
 */

export interface SchoolRecord {
  id: string;
  name: string;
  address: string;
  city: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  active: boolean;
  createdAt: Date;
}

interface SchoolRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  active: boolean;
  created_at: string;
}

const SCHOOL_COLUMNS = "id, name, address, city, postal_code, contact_name, contact_email, phone, active, created_at";

function mapRow(row: SchoolRow): SchoolRecord {
  return {
    id: row.id,
    name: row.name,
    address: row.address ?? "",
    city: row.city ?? "",
    postalCode: row.postal_code ?? "",
    contactName: row.contact_name ?? "",
    contactEmail: row.contact_email ?? "",
    phone: row.phone ?? "",
    active: row.active,
    createdAt: new Date(row.created_at),
  };
}

export async function getSchools(ids?: string[]): Promise<SchoolRecord[]> {
  const supabase = getServiceRoleClient();
  let query = supabase.from("organizations").select(SCHOOL_COLUMNS).order("name");
  // A plain admin only ever sees the schools they belong to; the caller
  // passes those ids. Omitting them (super admin) lists every school.
  if (ids) {
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown as SchoolRow[]).map(mapRow);
}

export async function getSchool(schoolId: string): Promise<SchoolRecord | null> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("organizations").select(SCHOOL_COLUMNS).eq("id", schoolId).maybeSingle();
  if (error) throw error;
  return data ? mapRow(data as unknown as SchoolRow) : null;
}

export interface SchoolInput {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  phone: string;
  active: boolean;
}

export async function createSchool(input: SchoolInput): Promise<SchoolRecord> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: input.name,
      address: input.address,
      city: input.city,
      postal_code: input.postalCode,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      phone: input.phone,
      active: input.active,
    })
    .select(SCHOOL_COLUMNS)
    .single();
  if (error) throw error;
  return mapRow(data as unknown as SchoolRow);
}

export type SchoolUpdate = Partial<SchoolInput>;

export async function updateSchool(schoolId: string, update: SchoolUpdate): Promise<SchoolRecord> {
  const supabase = getServiceRoleClient();
  const patch: Record<string, unknown> = {};
  if (update.name !== undefined) patch.name = update.name;
  if (update.address !== undefined) patch.address = update.address;
  if (update.city !== undefined) patch.city = update.city;
  if (update.postalCode !== undefined) patch.postal_code = update.postalCode;
  if (update.contactName !== undefined) patch.contact_name = update.contactName;
  if (update.contactEmail !== undefined) patch.contact_email = update.contactEmail;
  if (update.phone !== undefined) patch.phone = update.phone;
  if (update.active !== undefined) patch.active = update.active;

  const { data, error } = await supabase.from("organizations").update(patch).eq("id", schoolId).select(SCHOOL_COLUMNS).single();
  if (error) throw error;
  return mapRow(data as unknown as SchoolRow);
}

export interface SchoolStats {
  children: number;
  activities: number;
  monitors: number;
  lastActivityDate: string | null;
}

/**
 * Headline numbers for the schools list. One round trip per metric but all
 * five in parallel, and every one is a head-only count — no rows are
 * transferred just to be counted.
 */
export async function getSchoolStats(schoolId: string): Promise<SchoolStats> {
  const supabase = getServiceRoleClient();
  const [children, activities, monitors, lastAttendance] = await Promise.all([
    supabase.from("children").select("id", { count: "exact", head: true }).eq("organization_id", schoolId).eq("active", true),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("organization_id", schoolId).eq("active", true),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", schoolId)
      .eq("role", "MONITOR")
      .is("revoked_at", null),
    supabase.from("attendance").select("date").eq("organization_id", schoolId).order("date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  for (const r of [children, activities, monitors]) {
    if (r.error) throw r.error;
  }
  if (lastAttendance.error) throw lastAttendance.error;
  return {
    children: children.count ?? 0,
    activities: activities.count ?? 0,
    monitors: monitors.count ?? 0,
    lastActivityDate: (lastAttendance.data as { date: string } | null)?.date ?? null,
  };
}

/** Whether the signed-in user may create schools and see every school. */
export async function isSuperAdmin(userId: string): Promise<boolean> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle();
  if (error) throw error;
  return Boolean((data as { is_super_admin: boolean } | null)?.is_super_admin);
}
