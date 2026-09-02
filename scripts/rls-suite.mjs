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
  if (activities.length === 0) {
    console.error("No activities exist — the suite needs at least one to probe against. Aborting.");
    process.exit(1);
  }
  // Any activity works for the admin write/scope probes. Picked positionally
  // on purpose: naming one made the suite crash the moment an admin renamed
  // it, and each school defines its own activities.
  const anyActivity = activities[0];

  const { rows: memberships } = await client.query(
    `select m.user_id, m.role, m.revoked_at, m.organization_id, u.email
     from organization_memberships m join auth.users u on u.id = m.user_id`,
  );
  const admin = memberships.find((m) => m.role === "ADMIN" && !m.revoked_at);

  // Everything an admin may see is scoped to the school(s) they belong to.
  // Comparing against global totals (as this suite did while the app was
  // single-school) turns correct cross-school denials into false failures —
  // and, worse, would hide a real leak behind an expected-looking number.
  const adminSchoolIds = new Set(
    memberships.filter((m) => m.user_id === admin.user_id && !m.revoked_at).map((m) => m.organization_id),
  );
  const adminActivities = activities.filter((a) => adminSchoolIds.has(a.organization_id));
  const foreignActivities = activities.filter((a) => !adminSchoolIds.has(a.organization_id));

  const { rows: activeChildren } = await client.query("select id, activity_id, organization_id from children where active");
  const countByActivity = {};
  for (const c of activeChildren) countByActivity[c.activity_id] = (countByActivity[c.activity_id] ?? 0) + 1;
  const childOf = (activityId) => activeChildren.find((c) => c.activity_id === activityId)?.id;
  const adminActiveChildren = activeChildren.filter((c) => adminSchoolIds.has(c.organization_id));
  const foreignChildren = activeChildren.filter((c) => !adminSchoolIds.has(c.organization_id));

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
    // Compared against the real count read with service-role visibility at
    // setup, not a hardcoded 4: the admin can create activities, so pinning
    // the number here made the suite fail the moment anyone legitimately
    // added one. What matters is that the admin sees *every* activity.
    const acts = await c.query("select id from activities");
    check(
      `admin: sees all ${adminActivities.length} activities of their own school(s)`,
      acts.rows.length === adminActivities.length,
      `got ${acts.rows.length}, expected ${adminActivities.length}`,
    );

    const kids = await c.query("select id from children where active");
    check(
      "admin: sees all active children of their own school(s)",
      kids.rows.length === adminActiveChildren.length,
      `got ${kids.rows.length}, expected ${adminActiveChildren.length}`,
    );

    // Cross-school denial, asserted explicitly rather than inferred from a
    // count: name another school's rows directly and require zero results.
    // Skipped (not silently passed) when only one school exists, so the
    // report never claims to have proven isolation it could not test.
    if (foreignActivities.length > 0) {
      const ids = foreignActivities.map((a) => a.id);
      const seen = await c.query("select id from activities where id = any($1::uuid[])", [ids]);
      check("admin: cannot see another school's activities by UUID", seen.rows.length === 0, `got ${seen.rows.length}`);

      const foreignWrite = await c.query("update activities set name = name where id = any($1::uuid[]) returning id", [ids]);
      check("admin: cannot write another school's activities", foreignWrite.rowCount === 0, `rowCount=${foreignWrite.rowCount}`);
    } else {
      console.log("  (skipped cross-school activity checks — only one school exists)");
    }
    if (foreignChildren.length > 0) {
      const ids = foreignChildren.map((ch) => ch.id);
      const seen = await c.query("select id from children where id = any($1::uuid[])", [ids]);
      check("admin: cannot see another school's children by UUID", seen.rows.length === 0, `got ${seen.rows.length}`);

      const foreignAttendance = await c.query("select id from attendance where child_id = any($1::uuid[])", [ids]);
      check("admin: cannot see another school's attendance", foreignAttendance.rows.length === 0, `got ${foreignAttendance.rows.length}`);

      const foreignRoster = await c.query("select id from weekly_roster where child_id = any($1::uuid[])", [ids]);
      check("admin: cannot see another school's roster", foreignRoster.rows.length === 0, `got ${foreignRoster.rows.length}`);
    } else {
      console.log("  (skipped cross-school children checks — only one school exists)");
    }

    // Scoped to the schools this admin actually administers, not the global
    // count. Comparing against every membership row in the database asserted
    // that an admin SHOULD see other schools' members — the exact leak this
    // suite exists to catch. It only passed while one school existed.
    const adminMemberships = memberships.filter((m) => adminSchoolIds.has(m.organization_id));
    const mem = await c.query("select id from organization_memberships");
    check(
      "admin: sees exactly their own school(s)' memberships",
      mem.rows.length === adminMemberships.length,
      `got ${mem.rows.length}, expected ${adminMemberships.length}`,
    );

    const upd = await c.query("update activities set name = name where id = $1 returning id", [anyActivity.id]);
    check("admin: can write to activities", upd.rowCount === 1);

    // An empty children table is a legitimate state (a fresh season starts
    // that way), so prove the admin's write permission with a disposable row
    // of our own rather than depending on seed data existing. The whole
    // block runs inside the transaction asUser() always rolls back, so this
    // child never actually reaches the database.
    const probeChild = await c.query(
      `insert into children (organization_id, first_name, last_name, activity_id)
       values ($1, 'RlsProbe', 'Child', $2) returning id`,
      [anyActivity.organization_id, anyActivity.id],
    );
    check("admin: can create children", probeChild.rowCount === 1, `rowCount=${probeChild.rowCount}`);
    const updChild = await c.query("update children set notes = notes where id = $1 returning id", [probeChild.rows[0].id]);
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
      [anyActivity.organization_id],
    );
    check("admin: cannot insert into weekly_roster_audit_log (service-role only)", auditInsert.denied, `rowCount=${auditInsert.rowCount}`);

    const resetLog = await c.query("select id from operational_reset_log");
    check("admin: can read operational_reset_log", resetLog.rows.length >= 0, `got ${resetLog.rows.length}`);

    const resetLogInsert = await attemptWrite(
      c,
      `insert into operational_reset_log (organization_id, attendance_rows) values ($1, 0) returning id`,
      [anyActivity.organization_id],
    );
    check("admin: cannot insert into operational_reset_log (service-role only)", resetLogInsert.denied, `rowCount=${resetLogInsert.rowCount}`);

    const resetRpc = await attemptWrite(c, `select public.reset_operational_data($1, null)`, [anyActivity.organization_id]);
    check("admin: cannot call reset_operational_data directly (service-role only)", resetRpc.denied, `rowCount=${resetRpc.rowCount}`);
  });

  // -------------------------------------------------------------------
  // 3. Named assignment check (business expectation, not just RLS)
  // -------------------------------------------------------------------
  // Reports the live assignments rather than asserting a fixed list. An
  // earlier version hardcoded four activity names and crashed outright the
  // moment the admin renamed one — this suite must survive the schools
  // feature, where every school defines its own activities. What is actually
  // worth asserting is the invariant, checked below: no monitor may hold two
  // activities, which is what the per-school unique index guarantees.
  console.log("Live assignments:");
  for (const a of activities) {
    console.log(`  ${a.name} -> ${monitorEmailOf(a.monitor_id)}`);
  }

  const assignedMonitors = activities.filter((a) => a.monitor_id).map((a) => a.monitor_id);
  check(
    "assignment: no monitor holds two activities in the same school",
    new Set(assignedMonitors).size === assignedMonitors.length,
    `${assignedMonitors.length} assignments, ${new Set(assignedMonitors).size} distinct monitors`,
  );

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
           on conflict (organization_id, child_id, date) do update set arrived = true
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
           on conflict (organization_id, child_id, date) do update set arrived = true
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

      // A monitor may legitimately belong to several schools (that is what
      // the school switcher reads), so the count is "their own rows", not
      // "one row". What must never happen is seeing somebody else's — which
      // is asserted directly rather than inferred from a total.
      const ownMemberships = memberships.filter((m) => m.user_id === activity.monitor_id);
      const mem = await c.query("select id, user_id from organization_memberships");
      check(
        `${monitorEmail}: sees only their own membership rows`,
        mem.rows.length === ownMemberships.length && mem.rows.every((r) => r.user_id === activity.monitor_id),
        `got ${mem.rows.length}, expected ${ownMemberships.length}`,
      );
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
  //    IN-TRANSACTION ONLY, always rolled back, so the borrowed activity's
  //    real assignment is untouched after this test. The activity is picked
  //    from whatever exists rather than named, so renaming activities (or
  //    running against a different school) cannot break this test.
  // -------------------------------------------------------------------
  {
    // Uses an activity's OWN monitor rather than borrowing an activity and
    // reassigning it. The borrow wrote to activities.monitor_id — a real
    // assignment — inside a transaction that was supposed to roll it back,
    // and the real assignment was found changed three times over this work
    // with updated_at matching runs of this suite. Whether or not the
    // rollback was at fault, a read-only regression test has no business
    // writing to that column at all, so the write is gone: revoke the
    // monitor who already holds an activity and check they lose it.
    const assigned = activities.find((a) => a.monitor_id);
    if (!assigned) {
      console.log("  (skipped revoked-monitor check — no activity has a monitor)");
    } else {
      await client.query("begin");
      try {
        await client.query("update organization_memberships set revoked_at = now() where user_id = $1", [assigned.monitor_id]);
        await client.query("select set_config('role', 'authenticated', true)");
        await client.query("select set_config('request.jwt.claims', $1, true)", [claim(assigned.monitor_id)]);
        const acts = await client.query("select id from activities where id = $1", [assigned.id]);
        check("revoked monitor: denied access despite matching monitor_id", acts.rows.length === 0, `got ${acts.rows.length}`);
      } finally {
        await client.query("rollback");
      }
      // The assignment this suite reads must be exactly what it was.
      const after = await client.query("select monitor_id::text from activities where id = $1", [assigned.id]);
      check(
        "suite: left every activity's monitor assignment untouched",
        after.rows[0].monitor_id === assigned.monitor_id,
        `got ${after.rows[0].monitor_id}, expected ${assigned.monitor_id}`,
      );
    }
  }

  // -------------------------------------------------------------------
  // 7. Revoked ADMIN regression (defense in depth)
  // -------------------------------------------------------------------
  {
    await client.query("begin");
    try {
      await client.query("update organization_memberships set revoked_at = now() where user_id = $1", [admin.user_id]);
      // The platform-level super-admin flag is a SEPARATE grant from school
      // membership: revoking someone from a school does not, and should not,
      // strip their platform rights. This section is about a plain revoked
      // admin, so the flag is cleared here to test that and nothing else —
      // otherwise the assertion silently changes meaning the day the account
      // running it gets promoted.
      await client.query("update profiles set is_super_admin = false where id = $1", [admin.user_id]);
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claim(admin.user_id)]);
      const acts = await client.query("select id from activities");
      check("revoked plain admin: loses global activity visibility", acts.rows.length === 0, `got ${acts.rows.length}`);
      const orgs = await client.query("select id from organizations");
      check("revoked plain admin: loses organization visibility", orgs.rows.length === 0, `got ${orgs.rows.length}`);
    } finally {
      await client.query("rollback");
    }
  }

  // -------------------------------------------------------------------
  // 8. SUPER_ADMIN
  //
  //    Nobody currently holds the flag in this database, so the behaviour is
  //    exercised by granting it IN-TRANSACTION and rolling back — the same
  //    discipline as the revoked-user tests above. That keeps the suite
  //    meaningful before anyone is promoted, and keeps proving the rule
  //    afterwards. A test school is created in the same transaction so
  //    "sees a school they are not a member of" is a real claim rather than
  //    a vacuous one when only one school exists.
  // -------------------------------------------------------------------
  {
    const superAdminsBefore = (await client.query("select count(*)::int n from profiles where is_super_admin")).rows[0].n;
    await client.query("begin");
    try {
      const otherOrg = (await client.query("insert into organizations (name) values ('RLS_TX_ONLY_school') returning id")).rows[0];
      const ownOrgCount = (await client.query("select count(*)::int n from organizations")).rows[0].n;

      // Baseline: a PLAIN admin must not see the school they don't belong to.
      // The flag is cleared explicitly rather than assumed absent — this
      // account may already hold it in a real deployment, and the whole
      // section would then compare a super admin against a super admin.
      await client.query("update profiles set is_super_admin = false where id = $1", [admin.user_id]);
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claim(admin.user_id)]);
      const asPlainAdmin = await client.query("select id from organizations");
      check(
        "plain admin: does not see a school they are not a member of",
        asPlainAdmin.rows.length === ownOrgCount - 1,
        `got ${asPlainAdmin.rows.length}, expected ${ownOrgCount - 1}`,
      );
      check(
        "plain admin: the foreign school is invisible by UUID",
        (await client.query("select id from organizations where id = $1", [otherOrg.id])).rows.length === 0,
      );

      // Same user, now flagged super admin.
      await client.query("select set_config('role', 'postgres', true)");
      await client.query("update profiles set is_super_admin = true where id = $1", [admin.user_id]);
      await client.query("select set_config('role', 'authenticated', true)");
      const asSuper = await client.query("select id from organizations");
      check("super admin: sees every school", asSuper.rows.length === ownOrgCount, `got ${asSuper.rows.length}, expected ${ownOrgCount}`);
      check(
        "super admin: sees the school they are not a member of",
        (await client.query("select id from organizations where id = $1", [otherOrg.id])).rows.length === 1,
      );
      check("super admin: is_super_admin() reports true", (await client.query("select public.is_super_admin() as v")).rows[0].v === true);

      // The flag widens school VISIBILITY only. It must not hand over the
      // contents of a school the user has no membership in — those stay
      // governed by the per-table policies.
      const foreignChildren = await client.query("select id from children where organization_id = $1", [otherOrg.id]);
      check("super admin: does not gain another school's children through the flag", foreignChildren.rows.length === 0);
    } finally {
      await client.query("rollback");
    }
    // Proof the rollback really happened — otherwise every assertion above
    // would be worthless, and the transaction both granted and revoked the
    // flag, so a failed rollback could leave a real account either wrongly
    // promoted or wrongly demoted. Compared against the count taken before
    // the transaction rather than against zero, since a real deployment
    // legitimately has a super admin.
    const after = await client.query("select count(*)::int n from profiles where is_super_admin");
    check(
      "super admin: the in-transaction grant and revoke left no trace",
      after.rows[0].n === superAdminsBefore,
      `got ${after.rows[0].n}, expected ${superAdminsBefore}`,
    );
    const noTestOrg = await client.query("select count(*)::int n from organizations where name = 'RLS_TX_ONLY_school'");
    check("super admin: the in-transaction school left no trace", noTestOrg.rows[0].n === 0, `got ${noTestOrg.rows[0].n}`);
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
