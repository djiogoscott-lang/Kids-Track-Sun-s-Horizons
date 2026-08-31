/**
 * Read-only integrity audit of the real database.
 * Never writes. Reports anomalies for a human to decide on.
 */
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DB_URL });
await c.connect();

const q = async (sql, params) => (await c.query(sql, params)).rows;
const section = (t) => console.log("\n\n########## " + t + " ##########");

section("VOLUMÉTRIE");
console.table(
  await q(`select
    (select count(*)::int from organizations) ecoles,
    (select count(*)::int from activities) activites,
    (select count(*)::int from children) enfants,
    (select count(*)::int from weekly_roster) participants,
    (select count(*)::int from attendance) presences,
    (select count(*)::int from organization_memberships) memberships,
    (select count(*)::int from notifications) notifications,
    (select count(*)::int from activity_day_state) jours_clotures,
    (select count(*)::int from weekly_roster_audit_log) audit_roster,
    (select count(*)::int from operational_reset_log) resets`),
);

section("LIGNES ORPHELINES / INCOHÉRENCES DE TENANT");
const checks = [
  ["activité sans école valide", `select count(*)::int n from activities a left join organizations o on o.id=a.organization_id where o.id is null`],
  ["enfant sans école valide", `select count(*)::int n from children ch left join organizations o on o.id=ch.organization_id where o.id is null`],
  ["enfant sans activité valide", `select count(*)::int n from children ch left join activities a on a.id=ch.activity_id where a.id is null`],
  ["enfant dont l'activité est dans une AUTRE école", `select count(*)::int n from children ch join activities a on a.id=ch.activity_id where a.organization_id <> ch.organization_id`],
  ["roster sans enfant valide", `select count(*)::int n from weekly_roster w left join children ch on ch.id=w.child_id where ch.id is null`],
  ["roster sans activité valide", `select count(*)::int n from weekly_roster w left join activities a on a.id=w.activity_id where a.id is null`],
  ["roster dont l'activité est dans une AUTRE école", `select count(*)::int n from weekly_roster w join activities a on a.id=w.activity_id where a.organization_id <> w.organization_id`],
  ["roster dont l'enfant est dans une AUTRE école", `select count(*)::int n from weekly_roster w join children ch on ch.id=w.child_id where ch.organization_id <> w.organization_id`],
  ["présence sans enfant valide", `select count(*)::int n from attendance at left join children ch on ch.id=at.child_id where ch.id is null`],
  ["présence sans activité valide", `select count(*)::int n from attendance at left join activities a on a.id=at.activity_id where a.id is null`],
  ["présence dont l'enfant est dans une AUTRE école", `select count(*)::int n from attendance at join children ch on ch.id=at.child_id where ch.organization_id <> at.organization_id`],
  ["présence sur une activité d'une AUTRE école", `select count(*)::int n from attendance at join activities a on a.id=at.activity_id where a.organization_id <> at.organization_id`],
  ["présence dont l'enfant n'est PAS inscrit à cette activité cette semaine", `select count(*)::int n from attendance at where not exists (select 1 from weekly_roster w where w.child_id=at.child_id and w.activity_id=at.activity_id and at.date between w.week_start and w.week_end)`],
  ["membership sans école valide", `select count(*)::int n from organization_memberships m left join organizations o on o.id=m.organization_id where o.id is null`],
  ["membership sans utilisateur auth", `select count(*)::int n from organization_memberships m left join auth.users u on u.id=m.user_id where u.id is null`],
  ["activité dont le moniteur n'est pas membre de son école", `select count(*)::int n from activities a where a.monitor_id is not null and not exists (select 1 from organization_memberships m where m.user_id=a.monitor_id and m.organization_id=a.organization_id and m.revoked_at is null)`],
  ["notification sans activité valide", `select count(*)::int n from notifications nt left join activities a on a.id=nt.activity_id where nt.activity_id is not null and a.id is null`],
  ["jour clôturé sans activité valide", `select count(*)::int n from activity_day_state d left join activities a on a.id=d.activity_id where a.id is null`],
  ["jour clôturé sur activité d'une AUTRE école", `select count(*)::int n from activity_day_state d join activities a on a.id=d.activity_id where a.organization_id <> d.organization_id`],
];
for (const [label, sql] of checks) {
  const n = (await q(sql))[0].n;
  console.log(`${n === 0 ? "  OK  " : " >>>> "} ${String(n).padStart(4)}  ${label}`);
}

section("DOUBLONS");
const dupChildren = await q(`select organization_id, lower(first_name) f, lower(last_name) l, coalesce(birth_date::text,'-') b, count(*)::int n
  from children group by 1,2,3,4 having count(*)>1`);
console.log("enfants identiques (école+nom+naissance):", dupChildren.length ? JSON.stringify(dupChildren) : "aucun");
const homonyms = await q(`select lower(first_name)||' '||lower(last_name) nom, count(*)::int n, count(distinct coalesce(birth_date::text,'-'))::int dates
  from children group by 1 having count(*)>1`);
console.log("homonymes:", homonyms.length ? JSON.stringify(homonyms) : "aucun");
const dupRoster = await q(`select organization_id, child_id, week_start, count(*)::int n from weekly_roster group by 1,2,3 having count(*)>1`);
console.log("roster en double:", dupRoster.length ? JSON.stringify(dupRoster) : "aucun");
const dupAtt = await q(`select organization_id, child_id, date, count(*)::int n from attendance group by 1,2,3 having count(*)>1`);
console.log("présences en double:", dupAtt.length ? JSON.stringify(dupAtt) : "aucune");
const dupAct = await q(`select organization_id, lower(name) n2, count(*)::int n from activities group by 1,2 having count(*)>1`);
console.log("activités homonymes dans la même école:", dupAct.length ? JSON.stringify(dupAct) : "aucune");

section("ÉTATS DE PRÉSENCE");
console.table(await q(`select
  count(*) filter (where arrived and not departed)::int arrives_presents,
  count(*) filter (where arrived and departed)::int partis,
  count(*) filter (where not arrived and departed)::int INCOHERENT_parti_sans_arriver,
  count(*) filter (where not arrived and not departed)::int ni_arrive_ni_parti,
  count(*) filter (where daycare_manual)::int garderie_manuelle,
  count(*) filter (where daycare_manual and not arrived)::int INCOHERENT_garderie_sans_arrivee
  from attendance`));

section("DATES");
console.table(await q(`select min(date)::text plus_ancienne, max(date)::text plus_recente,
  count(*) filter (where date > current_date)::int dans_le_futur from attendance`));
console.table(await q(`select min(week_start)::text, max(week_start)::text,
  count(*) filter (where week_end <> week_start + 6)::int INCOHERENT_semaine_pas_7j from weekly_roster`));

section("CONTRAINTES UNIQUES ET INDEXES");
console.table(await q(`select tc.table_name, tc.constraint_name, tc.constraint_type,
   string_agg(kcu.column_name, ',' order by kcu.ordinal_position) cols
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu on kcu.constraint_name=tc.constraint_name
  where tc.table_schema='public' and tc.constraint_type in ('UNIQUE','PRIMARY KEY')
  group by 1,2,3 order by 1,3 desc`));

section("INDEXES");
for (const r of await q(`select tablename, indexname, indexdef from pg_indexes where schemaname='public' order by tablename, indexname`)) {
  console.log(`  ${r.tablename.padEnd(26)} ${r.indexdef.replace(/CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ /, (m, u) => (u ? "UNIQUE " : "")).replace("USING btree ", "")}`);
}

section("RLS ACTIVÉ ?");
console.table(await q(`select c.relname table, c.relrowsecurity rls_active, c.relforcerowsecurity force,
   (select count(*)::int from pg_policies p where p.tablename=c.relname) policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' order by 1`));

await c.end();
