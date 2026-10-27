// Generates docs/database-schema-reference.md from the LIVE database catalog
// (columns, types, nullability, defaults, PK/FK/unique/check constraints,
// indexes), so the inventory always matches what is actually deployed.
// Usage: npm run docs:schema
import { writeFileSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import { Pool } from "@neondatabase/serverless";

loadEnvConfig(process.cwd());

type Row = Record<string, string | boolean | null>;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const q = async (sql: string) => (await pool.query(sql)).rows as Row[];

    const tables = await q(`
      select c.relname as table_name, obj_description(c.oid) as comment
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname <> '_prisma_migrations'
      order by c.relname`);

    const columns = await q(`
      select c.table_name, c.column_name, c.ordinal_position,
             case when c.data_type = 'USER-DEFINED' then c.udt_name
                  when c.data_type = 'character varying' then 'varchar' || coalesce('(' || c.character_maximum_length || ')', '')
                  when c.data_type = 'character' then 'char(' || c.character_maximum_length || ')'
                  when c.data_type = 'numeric' then 'numeric(' || c.numeric_precision || ',' || c.numeric_scale || ')'
                  when c.data_type = 'timestamp with time zone' then 'timestamptz'
                  else c.data_type end as type,
             c.is_nullable = 'YES' as nullable, c.column_default
      from information_schema.columns c
      where c.table_schema = 'public'
      order by c.table_name, c.ordinal_position`);

    const constraints = await q(`
      select cl.relname as table_name, con.conname as name, con.contype as type,
             pg_get_constraintdef(con.oid) as definition
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace n on n.oid = cl.relnamespace
      where n.nspname = 'public'
      order by cl.relname, con.contype, con.conname`);

    const indexes = await q(`
      select tablename as table_name, indexname as name, indexdef as definition
      from pg_indexes where schemaname = 'public'
      order by tablename, indexname`);

    const enums = await q(`
      select t.typname as name, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
      group by t.typname order by t.typname`);

    const fkTargets = new Map<string, string>();
    for (const c of constraints.filter((c) => c.type === "f")) {
      const m = /FOREIGN KEY \((.+?)\) REFERENCES (\w+)\((.+?)\)(.*)/.exec(String(c.definition));
      if (m) {
        const action = /ON DELETE (CASCADE|SET NULL|RESTRICT|NO ACTION)/.exec(m[4])?.[1] ?? "NO ACTION";
        fkTargets.set(`${c.table_name}.${m[1].replaceAll('"', "")}`, `${m[2].replaceAll('"', "")}.${m[3].replaceAll('"', "")} (on delete ${action.toLowerCase()})`);
      }
    }
    const pkCols = new Set<string>();
    const uniqueCols = new Set<string>();
    for (const c of constraints) {
      const cols = /\((.+?)\)/.exec(String(c.definition))?.[1].replaceAll('"', "").split(", ") ?? [];
      if (c.type === "p") cols.forEach((col) => pkCols.add(`${c.table_name}.${col}`));
    }
    for (const i of indexes) {
      const def = String(i.definition);
      if (!def.startsWith("CREATE UNIQUE INDEX")) continue;
      const cols = /\((.+?)\)/.exec(def)?.[1].replaceAll('"', "").split(", ") ?? [];
      if (cols.length === 1 && !String(i.name).endsWith("_pkey")) uniqueCols.add(`${i.table_name}.${cols[0]}`);
    }

    const out: string[] = [];
    out.push("# Database Schema Reference (generated)");
    out.push("");
    out.push("> **Generated from the live PostgreSQL catalog by `npm run docs:schema`. Do not edit by hand.**");
    out.push(`> Generated: ${new Date().toISOString()} · Tables: ${tables.length} · Enums: ${enums.length}`);
    out.push(">");
    out.push("> Purpose of each table, design rationale and requirement mapping: see `database-design.md`,");
    out.push("> `database-erd.md` and `requirements-traceability.md`.");
    out.push("");
    out.push("Legend: **PK** primary key · **FK** foreign key · **UQ** single-column unique · `NULL` = nullable.");
    out.push("");
    out.push("## Contents");
    out.push("");
    for (const t of tables) out.push(`- [${t.table_name}](#${t.table_name})`);
    out.push("- [Enum types](#enum-types)");
    out.push("");

    for (const t of tables) {
      const name = String(t.table_name);
      out.push(`## ${name}`);
      out.push("");
      out.push("| Column | Type | Null | Default | Keys / references |");
      out.push("|---|---|---|---|---|");
      for (const c of columns.filter((c) => c.table_name === name)) {
        const key = `${name}.${c.column_name}`;
        const tags = [
          pkCols.has(key) ? "**PK**" : "",
          uniqueCols.has(key) ? "**UQ**" : "",
          fkTargets.has(key) ? `**FK** → ${fkTargets.get(key)}` : "",
        ].filter(Boolean).join(" ");
        const def = c.column_default ? `\`${String(c.column_default).replace(/\|/g, "\\|")}\`` : "";
        out.push(`| ${c.column_name} | ${c.type} | ${c.nullable ? "NULL" : "NOT NULL"} | ${def} | ${tags} |`);
      }
      out.push("");
      const tCons = constraints.filter((c) => c.table_name === name && (c.type === "u" || c.type === "c"));
      const tIdx = indexes.filter((i) => i.table_name === name && !String(i.name).endsWith("_pkey"));
      if (tIdx.length) {
        out.push("**Indexes / unique constraints**");
        out.push("");
        for (const i of tIdx) {
          const def = String(i.definition);
          const unique = def.startsWith("CREATE UNIQUE") ? "UNIQUE " : "";
          out.push(`- ${unique}\`${i.name}\` (${/\((.+)\)$/.exec(def)?.[1].replaceAll('"', "")})`);
        }
        out.push("");
      }
      if (tCons.length) {
        out.push("**Check constraints**");
        out.push("");
        for (const c of tCons) out.push(`- \`${c.name}\`: \`${String(c.definition).replaceAll('"', "")}\``);
        out.push("");
      }
    }

    out.push("## Enum types");
    out.push("");
    out.push("| Enum | Values |");
    out.push("|---|---|");
    for (const e of enums) out.push(`| ${e.name} | ${e.labels} |`);
    out.push("");

    writeFileSync("docs/database-schema-reference.md", out.join("\n"));
    console.log(`Wrote docs/database-schema-reference.md (${tables.length} tables, ${enums.length} enums)`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("Doc generation failed:", e instanceof Error ? e.message : "unknown error");
  process.exit(1);
});
