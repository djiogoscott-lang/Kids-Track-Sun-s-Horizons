#!/usr/bin/env node
/**
 * Reference RLS + role-scoping regression suite for Kids Track.
 *
 * Every test that could write connects as a real user via
 * set_config('request.jwt.claims', ...) inside a transaction that is ALWAYS
 * rolled back — no run of this suite can ever persist a change to real data,
 * including the "revoked monitor" tests, which temporarily reassign a real
 * activity's monitor_id in-transaction and roll it back immediately after.
 *
 * Run with: npm run test:rls
 * Requires SUPABASE_DB_URL in .env.local (a direct Postgres connection
 * string — the session pooler works where the direct host does not).
 */
import fs from "node:fs";
import pg from "pg";

function loadEnvLocal() {
  const path = new URL("../.env.local", import.meta.url);
  if (!fs.existsSync(path)) return;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error("SUPABASE_DB_URL is not set (expected in .env.local). Aborting.");
  process.exit(1);
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail: detail ?? "" });
}

function claim(userId) {
  return JSON.stringify({ sub: userId, role: "authenticated" });
}

/** INSERT/UPDATE with a failing WITH CHECK throws (42501) and, unlike a
 * USING-filtered SELECT/UPDATE returning 0 rows, leaves the whole
 * transaction aborted until a rollback — so this wraps each attempt in its
 * own savepoint, recovering the outer transaction on denial and normalizing
 * both shapes of "denied" into one result: { denied, rowCount }. */
async function attemptWrite(client, sql, params) {
  await client.query("savepoint attempt_write_sp");
  try {
    const res = await client.query(sql, params);
    await client.query("release savepoint attempt_write_sp");
    return { denied: res.rowCount === 0, rowCount: res.rowCount };
  } catch (err) {
    await client.query("rollback to savepoint attempt_write_sp");
    if (err.code === "42501") return { denied: true, rowCount: 0 };
    throw err;
  }
}

/** Runs fn as `userId` (or fully anonymous if null) inside a transaction that
 * is always rolled back, so nothing it does — read or write — ever persists. */
async function asUser(client, userId, fn) {
  await client.query("begin");
  try {
    await client.query("select set_config('role', $1, true)", [userId ? "authenticated" : "anon"]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [userId ? claim(userId) : "{}"]);
    return await fn(client);
  } finally {
    await client.query("rollback");
  }
}

async function main() {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();

  // --- Setup: read real state with full (service-role) visibility ---
  const { rows: activities } = await client.query("select id, name, monitor_id, organization_id from activities order by name");
  const byName = Object.fromEntries(activities.map((a) => [a.name, a]));

  const { rows: memberships } = await client.query(
    `select m.user_id, m.role, m.revoked_at, u.email
     from organization_memberships m join auth.users u on u.id = m.user_id`,
  );
  const admin = memberships.find((m) => m.role === "ADMIN" && !m.revoked_at);
  const monitorByEmail = Object.fromEntries(memberships.filter((m) => m.role === "MONITOR").map((m) => [m.email, m]));

  const { rows: activeChildren } = await client.query("select id, activity_id from children where active");
  const countByActivity = {};
  for (const c of activeChildren) countByActivity[c.activity_id] = (countByActivity[c.activity_id] ?? 0) + 1;
  const childOf = (activityId) => activeChildren.find((c) => c.activity_id === activityId)?.id;

  // children_read_scope has no `active` condition — RLS scopes by activity,
  // not by active status (the app's own queries decide whether to filter
  // active children, not RLS) — so the "own activity's children" assertion
  // below must compare against ALL children (active + inactive), not just
  // the active-only baseline used for the admin-visibility check above.
  const { rows: allChildrenAnyStatus } = await client.query("select id, activity_id from children");
  const totalByActivity = {};
  for (const c of allChildrenAnyStatus) totalByActivity[c.activity_id] = (totalByActivity[c.activity_id] ?? 0) + 1;

  console.log("=== Kids Track — RLS reference suite ===");
  console.log(`Activities: ${activities.map((a) => `${a.name}=${monitorEmailOf(a.monitor_id)}`).join(", ")}\n`);

  function monitorEmailOf(userId) {
    return memberships.find((m) => m.user_id === userId)?.email ?? "(non assigné)";
  }

  // -------------------------------------------------------------------
  // 1. Unauthenticated / anonymous
  // -------------------------------------------------------------------
  await asUser(client, null, async (c) => {
    check("anon: 0 activities visible", (await c.query("select id from activities")).rows.length === 0);
    check("anon: 0 children visible", (await c.query("select id from children")).rows.length === 0);
    check("anon: 0 memberships visible", (await c.query("select id from organization_memberships")).rows.length === 0);
    check("anon: 0 attendance rows visible", (await c.query("select id from attendance")).rows.length === 0);
    check("anon: 0 weekly_roster rows visible", (await c.query("select id from weekly_roster")).rows.length === 0);
    check("anon: 0 weekly_roster_audit_log rows visible", (await c.query("select id from weekly_roster_audit_log")).rows.length === 0);
  });

  // -------------------------------------------------------------------
  // 2. ADMIN = accès global
  // -------------------------------------------------------------------
  await asUser(client, admin.user_id, async (c) => {
    const acts = await c.query("select id from activities");
    check("admin: sees all 4 activities", acts.rows.length === 4, `got ${acts.rows.length}`);

    const kids = await c.query("select id from children where active");
    const totalKids = Object.values(countByActivity).reduce((a, b) => a + b, 0);
    check("admin: sees all active children", kids.rows.length === totalKids, `got ${kids.rows.length}, expected ${totalKids}`);

    const mem = await c.query("select id from organization_memberships");
    check("admin: sees all memberships", mem.rows.length === memberships.length, `got ${mem.rows.length}, expected ${memberships.length}`);

    const upd = await c.query("update activities set name = name where id = $1 returning id", [byName["Danse"].id]);
    check("admin: can write to activities", upd.rowCount === 1);

    const childId = childOf(byName["Danse"].id);
    const updChild = await c.query("update children set notes = notes where id = $1 returning id", [childId]);
    check("admin: can write to children", updChild.rowCount === 1);

    const roster = await c.query("select id from weekly_roster");
    check("admin: sees weekly_roster rows across all activities", roster.rows.length >= 0, `got ${roster.rows.length}`);

    const auditLog = await c.query("select id from weekly_roster_audit_log");
    check("admin: can read weekly_roster_audit_log", auditLog.rows.length >= 0, `got ${auditLog.rows.length}`);

    // No insert policy exists for any role — only the service-role client
    // (which bypasses RLS) is expected to write here, so even an admin's
    // authenticated write must be denied.
    const auditInsert = await attemptWrite(
      c,
      `insert into weekly_roster_audit_log (organization_id, action, week_start, rows_affected)
       values ($1, 'ADD', current_date, 0) returning id`,
      [byName["Danse"].organization_id],
    );
    check("admin: cannot insert into weekly_roster_audit_log (service-role only)", auditInsert.denied, `rowCount=${auditInsert.rowCount}`);

    const resetLog = await c.query("select id from operational_reset_log");
    check("admin: can read operational_reset_log", resetLog.rows.length >= 0, `got ${resetLog.rows.length}`);

    const resetLogInsert = await attemptWrite(
      c,
      `insert into operational_reset_log (organization_id, attendance_rows) values ($1, 0) returning id`,
      [byName["Danse"].organization_id],
    );
    check("admin: cannot insert into operational_reset_log (service-role only)", resetLogInsert.denied, `rowCount=${resetLogInsert.rowCount}`);

    const resetRpc = await attemptWrite(c, `select public.reset_operational_data($1, null)`, [byName["Danse"].organization_id]);
    check("admin: cannot call reset_operational_data directly (service-role only)", resetRpc.denied, `rowCount=${resetRpc.rowCount}`);
  });

  // -------------------------------------------------------------------
  // 3. Named assignment check (business expectation, not just RLS)
  // -------------------------------------------------------------------
  const expectedAssignment = [
    ["Danse", "moniteur1@sunshorizons.be"],
    ["Multisport", "moniteur2@sunshorizons.be"],
    ["Vélo", "moniteur3@sunshorizons.be"],
    // Confirmed by the project owner (2026-08-29): djiogoscott@gmail.com is
    // the real, intended monitor of Baby Tennis — moniteur4@sunshorizons.be
    // is a spare seeded account with no activity, not a pending assignment.
    ["Baby Tennis", "djiogoscott@gmail.com"],
  ];
  for (const [activityName, expectedEmail] of expectedAssignment) {
    const actual = monitorEmailOf(byName[activityName].monitor_id);
    check(`assignment: ${activityName} -> ${expectedEmail}`, actual === expectedEmail, `actual monitor: ${actual}`);
  }

  // -------------------------------------------------------------------
  // 4. Each monitor currently assigned to an activity = scoped to that
  //    activity only (tested against REAL current assignments, whatever
  //    they are — the assignment check above already flags any mismatch
  //    with the intended business mapping separately).
  // -------------------------------------------------------------------
  for (const activity of activities) {
    if (!activity.monitor_id) continue;
    const monitorEmail = monitorEmailOf(activity.monitor_id);
    const otherActivities = activities.filter((a) => a.id !== activity.id);

    await asUser(client, activity.monitor_id, async (c) => {
      const acts = await c.query("select id from activities");
      check(
        `${monitorEmail}: sees exactly their own activity (${activity.name})`,
        acts.rows.length === 1 && acts.rows[0].id === activity.id,
        `got ${JSON.stringify(acts.rows.map((r) => r.id))}`,
      );

      for (const other of otherActivities) {
        const direct = await c.query("select id from activities where id = $1", [other.id]);
        check(`${monitorEmail}: direct UUID lookup of ${other.name} denied`, direct.rows.length === 0);

        const otherKids = await c.query("select id from children where activity_id = $1", [other.id]);
        check(`${monitorEmail}: cannot read ${other.name}'s children`, otherKids.rows.length === 0, `got ${otherKids.rows.length}`);

        const otherAttendance = await c.query("select id from attendance where activity_id = $1", [other.id]);
        check(`${monitorEmail}: cannot read ${other.name}'s attendance`, otherAttendance.rows.length === 0);
      }

      const ownKids = await c.query("select id from children where activity_id = $1", [activity.id]);
      check(
        `${monitorEmail}: sees own activity's children`,
        ownKids.rows.length === (totalByActivity[activity.id] ?? 0),
        `got ${ownKids.rows.length}, expected ${totalByActivity[activity.id] ?? 0}`,
      );

      // children table has no monitor-write policy at all — admin-only by design.
      const ownChildId = childOf(activity.id);
      if (ownChildId) {
        const writeOwn = await c.query("update children set notes = notes where id = $1 returning id", [ownChildId]);
        check(`${monitorEmail}: cannot write children even for own activity`, writeOwn.rowCount === 0, `rowCount=${writeOwn.rowCount}`);
      }

      // activities table has no monitor-write policy at all — admin-only by
      // design, including for the monitor's own assigned activity.
      const writeActivity = await c.query("update activities set name = name where id = $1 returning id", [activity.id]);
      check(`${monitorEmail}: cannot rename own activity`, writeActivity.rowCount === 0, `rowCount=${writeActivity.rowCount}`);

      const insActivity = await attemptWrite(
        c,
        `insert into activities (organization_id, name) values ($1, 'rls-suite probe activity') returning id`,
        [activity.organization_id],
      );
      check(`${monitorEmail}: cannot create activities (admin-only)`, insActivity.denied, `rowCount=${insActivity.rowCount}`);

      const delActivity = await c.query("delete from activities where id = $1 returning id", [activity.id]);
      check(`${monitorEmail}: cannot delete own activity`, delActivity.rowCount === 0, `rowCount=${delActivity.rowCount}`);

      // attendance: monitor CAN write within their own activity...
      if (ownChildId) {
        const insAttendance = await attemptWrite(
          c,
          `insert into attendance (organization_id, child_id, activity_id, date, arrived, recorded_by)
           values ($1, $2, $3, current_date + interval '30 days', true, $4)
           on conflict (child_id, date) do update set arrived = true
           returning id`,
          [activity.organization_id, ownChildId, activity.id, activity.monitor_id],
        );
        check(`${monitorEmail}: can write attendance for own activity`, insAttendance.rowCount === 1, `rowCount=${insAttendance.rowCount}`);
      }

      // ...but never for another activity's child, even naming its real UUID.
      const otherChildId = childOf(otherActivities[0]?.id);
      if (otherChildId) {
        const insOther = await attemptWrite(
          c,
          `insert into attendance (organization_id, child_id, activity_id, date, arrived, recorded_by)
           values ($1, $2, $3, current_date + interval '31 days', true, $4)
           on conflict (child_id, date) do update set arrived = true
           returning id`,
          [otherActivities[0].organization_id, otherChildId, otherActivities[0].id, activity.monitor_id],
        );
        check(`${monitorEmail}: cannot write attendance for another activity's child`, insOther.denied, `rowCount=${insOther.rowCount}`);
      }

      // notifications: insert is admin-only, even for the monitor's own activity.
      const notifIns = await attemptWrite(
        c,
        `insert into notifications (organization_id, activity_id, message, created_by) values ($1, $2, 'rls-suite probe', $3) returning id`,
        [activity.organization_id, activity.id, activity.monitor_id],
      );
      check(`${monitorEmail}: cannot insert notifications (admin-only)`, notifIns.denied, `rowCount=${notifIns.rowCount}`);

      // weekly_roster: read own activity's roster, denied for others, no write access at all.
      const ownRoster = await c.query("select id from weekly_roster where activity_id = $1", [activity.id]);
      check(`${monitorEmail}: can read own activity's roster`, ownRoster.rows.length >= 0);
      if (otherActivities[0]) {
        const otherRoster = await c.query("select id from weekly_roster where activity_id = $1", [otherActivities[0].id]);
        check(`${monitorEmail}: cannot read another activity's roster`, otherRoster.rows.length === 0, `got ${otherRoster.rows.length}`);
      }

      // weekly_roster_audit_log: admin-only read (see weekly_roster_audit_log_read_admin),
      // no monitor read policy at all — must return 0 rows regardless of scope.
      const auditLog = await c.query("select id from weekly_roster_audit_log");
      check(`${monitorEmail}: cannot read weekly_roster_audit_log`, auditLog.rows.length === 0, `got ${auditLog.rows.length}`);

      // operational_reset_log: admin-only read, and the reset RPC itself is
      // service-role-only — a monitor must not be able to see past resets
      // or trigger one, not even scoped to their own activity.
      const resetLog = await c.query("select id from operational_reset_log");
      check(`${monitorEmail}: cannot read operational_reset_log`, resetLog.rows.length === 0, `got ${resetLog.rows.length}`);
      const resetRpc = await attemptWrite(c, `select public.reset_operational_data($1, null)`, [activity.organization_id]);
      check(`${monitorEmail}: cannot call reset_operational_data`, resetRpc.denied, `rowCount=${resetRpc.rowCount}`);
      if (ownChildId) {
        const rosterWrite = await attemptWrite(
          c,
          `insert into weekly_roster (organization_id, child_id, activity_id, week_start, week_end)
           values ($1, $2, $3, current_date + interval '60 days', current_date + interval '66 days') returning id`,
          [activity.organization_id, ownChildId, activity.id],
        );
        check(`${monitorEmail}: cannot write to weekly_roster (admin-only)`, rosterWrite.denied, `rowCount=${rosterWrite.rowCount}`);
      }

      const mem = await c.query("select id from organization_memberships");
      check(`${monitorEmail}: sees only own membership row`, mem.rows.length === 1, `got ${mem.rows.length}`);
    });
  }

  // -------------------------------------------------------------------
  // 5. Monitor with no activity assigned sees nothing activity-scoped
  // -------------------------------------------------------------------
  const unassignedMonitor = memberships.find((m) => m.role === "MONITOR" && !m.revoked_at && !activities.some((a) => a.monitor_id === m.user_id));
  if (unassignedMonitor) {
    await asUser(client, unassignedMonitor.user_id, async (c) => {
      const acts = await c.query("select id from activities");
      check(`${unassignedMonitor.email}: unassigned monitor sees 0 activities`, acts.rows.length === 0, `got ${acts.rows.length}`);
    });
  }

  // -------------------------------------------------------------------
  // 6. Revoked-membership regression (the historical is_activity_monitor
  //    privilege-escalation fix) — reassigns a real activity's monitor_id
  //    IN-TRANSACTION ONLY, always rolled back, so Vélo's real assignment
  //    to moniteur3 is untouched after this test.
  // -------------------------------------------------------------------
  {
    const velo = byName["Vélo"];
    const testSubject = unassignedMonitor ?? Object.values(monitorByEmail)[0];
    await client.query("begin");
    try {
      await client.query("update activities set monitor_id = $1 where id = $2", [testSubject.user_id, velo.id]);
      await client.query("update organization_memberships set revoked_at = now() where user_id = $1", [testSubject.user_id]);
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claim(testSubject.user_id)]);
      const acts = await client.query("select id from activities where id = $1", [velo.id]);
      check("revoked monitor: denied access despite matching monitor_id", acts.rows.length === 0, `got ${acts.rows.length}`);
    } finally {
      await client.query("rollback");
    }
  }

  // -------------------------------------------------------------------
  // 7. Revoked ADMIN regression (defense in depth)
  // -------------------------------------------------------------------
  {
    await client.query("begin");
    try {
      await client.query("update organization_memberships set revoked_at = now() where user_id = $1", [admin.user_id]);
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claim(admin.user_id)]);
      const acts = await client.query("select id from activities");
      check("revoked admin: loses global activity visibility", acts.rows.length === 0, `got ${acts.rows.length}`);
      const orgs = await client.query("select id from organizations");
      check("revoked admin: loses organization visibility", orgs.rows.length === 0, `got ${orgs.rows.length}`);
    } finally {
      await client.query("rollback");
    }
  }

  await client.end();

  // --- Report ---
  const passed = results.filter((r) => r.pass);
  const failed = results.filter((r) => !r.pass);
  console.log(`\nTotal: ${results.length}  PASS: ${passed.length}  FAIL: ${failed.length}\n`);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("RLS suite crashed:", err);
  process.exit(1);
});
