-- Manual, same-day addition to Garderie.
--
-- Existing daycare presence (PLANNED / AFTER_SESSION) is entirely computed
-- from daycare_auto (a permanent registration on children) plus the day's
-- closure/cutoff state — there was no way to represent "an admin or monitor
-- placed this specific child in daycare today" without touching either of
-- those. This adds a third, day-scoped fact on attendance itself: it never
-- alters children.daycare_auto (the permanent registration) and never
-- touches activity_id — it's a same-day event, exactly like arrived/departed,
-- and rides along with them into history for free since it lives on the same
-- row.
begin;

alter table public.attendance
  add column if not exists daycare_manual boolean not null default false;

commit;
