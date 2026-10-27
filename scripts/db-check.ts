// Read-only inspection of the target database. Prints no credentials.
import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url });
  try {
    const host = new URL(url).hostname.replace(/^([^.]{6})[^.]*/, "$1***");
    const { rows: [info] } = await pool.query(
      "select current_database() as db, current_user as role, split_part(version(), ' ', 2) as pg_version",
    );
    console.log(`Connected: host=${host} db=${info.db} role=${info.role} postgres=${info.pg_version}`);
    const { rows: schemas } = await pool.query(
      "select schema_name from information_schema.schemata where schema_name not in ('pg_catalog','information_schema','pg_toast') and schema_name not like 'pg_temp%' and schema_name not like 'pg_toast_temp%' order by 1",
    );
    console.log("Schemas:", schemas.map((r) => r.schema_name).join(", "));
    const { rows: tables } = await pool.query(
      "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by 1, 2",
    );
    console.log(`Tables (${tables.length}):`, tables.map((r) => `${r.table_schema}.${r.table_name}`).join(", ") || "(none)");
    const { rows: types } = await pool.query(
      "select count(*)::int as n from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typtype = 'e'",
    );
    console.log("Enum types in public:", types[0].n);
    if (tables.some((t) => t.table_name === "_prisma_migrations")) {
      const { rows } = await pool.query("select migration_name, finished_at from _prisma_migrations order by started_at");
      console.log("Applied migrations:", rows);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Inspection failed:", e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, "[redacted-url]") : "unknown error");
  process.exit(1);
});
