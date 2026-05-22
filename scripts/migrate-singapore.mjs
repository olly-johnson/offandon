// One-shot data migration from the Ireland Supabase project to Singapore.
// Reads OLD_URL and NEW_URL from env. Connects via the pg driver, discovers
// columns from the destination schema, copies rows in dependency order, and
// reports counts. Idempotent: ON CONFLICT DO NOTHING means re-running after
// a partial failure is safe.
//
// Run:
//   $env:OLD_URL = "postgresql://...old..."
//   $env:NEW_URL = "postgresql://...new..."
//   node scripts/migrate-singapore.mjs

import pg from "pg";

const { Client } = pg;

const OLD_URL = process.env.OLD_URL;
const NEW_URL = process.env.NEW_URL;
if (!OLD_URL || !NEW_URL) {
  console.error("Set OLD_URL and NEW_URL env vars.");
  process.exit(1);
}

// FK-dependency order. Parents first.
const TABLES = [
  ["auth", "users"],
  ["auth", "identities"],
  ["public", "profiles"],
  ["public", "voice_dna"],
  ["public", "script_batches"],
  ["public", "scripts"],
  ["public", "conversations"],
  ["public", "messages"],
  ["public", "ideas"],
  ["public", "user_memories"],
  ["public", "user_methodology"],
  ["public", "admin_invites"],
  ["public", "instagram_connections"],
  ["public", "instagram_media"],
  ["public", "instagram_media_analysis"],
  ["public", "client_assets"],
  ["public", "client_documents"],
  ["public", "client_document_chunks"],
  ["public", "house_methodology"],
  ["public", "house_methodology_versions"],
  ["public", "house_methodology_proposals"],
  ["public", "methodology_rules"],
  ["public", "research_analysis_runs"],
  ["public", "api_usage"],
  ["public", "master_bot_messages"],
];

const ssl = { rejectUnauthorized: false };

async function tableExists(client, schema, table) {
  const r = await client.query(
    `select 1 from information_schema.tables where table_schema = $1 and table_name = $2`,
    [schema, table],
  );
  return r.rowCount > 0;
}

async function getColumns(client, schema, table) {
  const r = await client.query(
    `select column_name, is_generated
     from information_schema.columns
     where table_schema = $1 and table_name = $2
     order by ordinal_position`,
    [schema, table],
  );
  return r.rows.filter((c) => c.is_generated !== "ALWAYS").map((c) => c.column_name);
}

async function copyTable(oldC, newC, schema, table) {
  if (!(await tableExists(oldC, schema, table))) {
    return { table: `${schema}.${table}`, status: "missing-on-source", copied: 0 };
  }
  if (!(await tableExists(newC, schema, table))) {
    return { table: `${schema}.${table}`, status: "missing-on-target", copied: 0 };
  }

  // Use the intersection of columns so the migration is resilient to either
  // side having extra columns from Supabase platform updates.
  const oldCols = new Set(await getColumns(oldC, schema, table));
  const newCols = await getColumns(newC, schema, table);
  const cols = newCols.filter((c) => oldCols.has(c));
  if (cols.length === 0) {
    return { table: `${schema}.${table}`, status: "no-shared-columns", copied: 0 };
  }

  const quoted = cols.map((c) => `"${c}"`).join(",");
  const { rows } = await oldC.query(
    `select ${quoted} from "${schema}"."${table}"`,
  );
  if (rows.length === 0) {
    return { table: `${schema}.${table}`, status: "ok", copied: 0 };
  }

  // Chunk inserts to keep parameter count under Postgres' 65535 cap.
  const MAX_PARAMS = 30000;
  const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
  let inserted = 0;
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    const chunk = rows.slice(i, i + rowsPerChunk);
    const params = [];
    const valueRows = chunk.map((row) => {
      const start = params.length;
      for (const c of cols) params.push(row[c]);
      return `(${cols.map((_, k) => `$${start + k + 1}`).join(",")})`;
    });
    const sql = `insert into "${schema}"."${table}" (${quoted}) values ${valueRows.join(",")} on conflict do nothing`;
    const r = await newC.query(sql, params);
    inserted += r.rowCount ?? 0;
  }
  return { table: `${schema}.${table}`, status: "ok", copied: rows.length, inserted };
}

async function main() {
  const oldC = new Client({ connectionString: OLD_URL, ssl });
  const newC = new Client({ connectionString: NEW_URL, ssl });
  await oldC.connect();
  await newC.connect();
  console.log("Connected to both projects.");

  // Disable FK + triggers on the target while loading. Requires superuser-ish
  // privileges. The default `postgres` user on Supabase has these.
  try {
    await newC.query("set session_replication_role = replica");
    console.log("Disabled triggers/FK on target for load.");
  } catch (e) {
    console.warn("Could not disable triggers; falling back to ordered inserts:", e.message);
  }

  const results = [];
  for (const [schema, table] of TABLES) {
    try {
      const r = await copyTable(oldC, newC, schema, table);
      results.push(r);
      console.log(
        `${r.table.padEnd(40)} ${r.status.padEnd(20)} copied=${r.copied ?? 0} inserted=${r.inserted ?? 0}`,
      );
    } catch (e) {
      console.error(`FAILED ${schema}.${table}:`, e.message);
      results.push({ table: `${schema}.${table}`, status: "error", error: e.message });
    }
  }

  try {
    await newC.query("set session_replication_role = origin");
  } catch (e) {
    /* swallow */
  }

  await oldC.end();
  await newC.end();

  const failures = results.filter((r) => r.status === "error");
  console.log(
    `\nDone. tables=${results.length} failures=${failures.length} totalRows=${results.reduce(
      (n, r) => n + (r.copied ?? 0),
      0,
    )}`,
  );
  if (failures.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
