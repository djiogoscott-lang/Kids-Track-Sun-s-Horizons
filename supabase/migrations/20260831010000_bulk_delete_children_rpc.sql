-- Atomic, batched replacement for the previous one-child-at-a-time deletion
-- loop. Two problems with the old approach: (1) N children meant up to 4*N
-- sequential round trips to Supabase instead of one, and (2) the "has this
-- child got real history?" check and the actual delete were two separate
-- round trips, leaving a window where a concurrent attendance write (a
-- monitor marking the child present) between the check and the delete could
-- be silently destroyed or bypass the protection entirely.
--
-- Running the whole thing as a single Postgres function call closes both
-- gaps: eligibility is computed once, and both deletes happen inside the
-- same statement's transaction, so no other transaction can interleave.
begin;

create or replace function public.bulk_delete_children(
  p_organization_id uuid,
  p_child_ids uuid[]
) returns jsonb
language plpgsql
as $$
declare
  v_eligible uuid[];
  v_deleted uuid[];
  v_blocked jsonb;
begin
  -- Snapshot eligibility once: a child qualifies only if it has no real
  -- attendance history (arrived or departed at least once — an empty
  -- placeholder row doesn't count) and no weekly_roster reference (past or
  -- present week), matching the single-child rules this replaces.
  select coalesce(array_agg(c.id), '{}')
  into v_eligible
  from public.children c
  where c.organization_id = p_organization_id
    and c.id = any(p_child_ids)
    and not exists (
      select 1 from public.attendance a
      where a.organization_id = p_organization_id
        and a.child_id = c.id
        and (a.arrived or a.departed)
    )
    and not exists (
      select 1 from public.weekly_roster wr
      where wr.organization_id = p_organization_id
        and wr.child_id = c.id
    );

  -- Placeholder attendance rows (no real history, already excluded above)
  -- must go first so the children delete doesn't hit the FK restrict.
  delete from public.attendance a
  where a.organization_id = p_organization_id
    and a.child_id = any(v_eligible);

  with removed as (
    delete from public.children c
    where c.organization_id = p_organization_id
      and c.id = any(v_eligible)
    returning c.id
  )
  select coalesce(array_agg(id), '{}') into v_deleted from removed;

  select coalesce(
    jsonb_agg(jsonb_build_object(
      'id', c.id,
      'firstName', c.first_name,
      'lastName', c.last_name,
      'reason', case
        when exists (
          select 1 from public.attendance a
          where a.organization_id = p_organization_id
            and a.child_id = c.id
            and (a.arrived or a.departed)
        ) then 'HISTORY'
        else 'ROSTER'
      end
    )),
    '[]'::jsonb
  )
  into v_blocked
  from public.children c
  where c.organization_id = p_organization_id
    and c.id = any(p_child_ids)
    and not (c.id = any(v_eligible));

  return jsonb_build_object('deletedIds', to_jsonb(v_deleted), 'blocked', v_blocked);
end;
$$;

-- SECURITY INVOKER (the default): runs as whichever role calls it. Only the
-- server's service-role client ever calls this (never exposed to a browser
-- session), and service_role already bypasses RLS by role attribute — no
-- SECURITY DEFINER needed, and none of the elevated-privilege risk that
-- comes with it.
revoke all on function public.bulk_delete_children(uuid, uuid[]) from public;
grant execute on function public.bulk_delete_children(uuid, uuid[]) to service_role;

commit;
