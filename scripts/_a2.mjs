import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DB_URL });
await c.connect();
const r = await c.query(`select a.name, u.email from activities a left join auth.users u on u.id=a.monitor_id where a.name='Mat 1 NDC'`);
console.log("APRES suite RLS:", JSON.stringify(r.rows[0]));
await c.end();
