// Verify migration: compare row counts and discover any tables I missed.
import pg from "pg";
const { Client } = pg;

const ssl = { rejectUnauthorized: false };

async function listAndCount(label, url) {
  const c = new Client({ connectionString: url, ssl });
  await c.connect();
  const tables = await c.query(`
    select table_schema, table_name
    from information_schema.tables
    where table_schema in ('public', 'auth')
      and table_type = 'BASE TABLE'
    order by table_schema, table_name
  `);
  const counts = {};
  for (const { table_schema, table_name } of tables.rows) {
    try {
      const r = await c.query(`select count(*)::int as n from "${table_schema}"."${table_name}"`);
      counts[`${table_schema}.${table_name}`] = r.rows[0].n;
    } catch (e) {
      counts[`${table_schema}.${table_name}`] = `ERR: ${e.message.slice(0, 60)}`;
    }
  }
  await c.end();
  return counts;
}

const oldCounts = await listAndCount("OLD", process.env.OLD_URL);
const newCounts = await listAndCount("NEW", process.env.NEW_URL);

const all = new Set([...Object.keys(oldCounts), ...Object.keys(newCounts)]);
console.log("Table".padEnd(45), "Old".padStart(8), "New".padStart(8), "Status");
console.log("-".repeat(80));
let mismatches = 0;
for (const t of [...all].sort()) {
  const o = oldCounts[t] ?? "-";
  const n = newCounts[t] ?? "-";
  let status = "✓";
  if (o === "-") status = "new-only (probably Supabase internal)";
  else if (n === "-") status = "MISSING ON NEW";
  else if (o !== n) {
    status = "MISMATCH";
    mismatches++;
  }
  console.log(t.padEnd(45), String(o).padStart(8), String(n).padStart(8), status);
}
console.log("-".repeat(80));
console.log(mismatches === 0 ? "All counts match." : `${mismatches} mismatches.`);
process.exit(mismatches === 0 ? 0 : 1);
