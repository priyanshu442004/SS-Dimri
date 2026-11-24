// Fresh start for documents after the storage move (24 Nov 2026: AWS S3 → DigitalOcean Spaces).
// Files whose stored_files.bucket is not the current bucket (AWS_BUCKET_NAME) can no longer be
// opened, so they are detached everywhere: optional slots (profile pictures, certificates, photos,
// bills…) are emptied, rows that exist only to hold a file (client / employee / firm documents,
// task attachments, the firm certificate) are removed, and the stored_files rows are deleted.
// The record a file was attached to always stays. Everything removed is written to a backup first.
//
//   npx tsx scripts/storage-detach-old-files.ts --dry-run
//   npx tsx scripts/storage-detach-old-files.ts --apply  [--out backups/old-files-<date>.json]
//   npx tsx scripts/storage-detach-old-files.ts --restore backups/old-files-<date>.json [--verify]
//   (--verify runs the restore and rolls it back: proves the backup restores, changes nothing)
//
// Run it where AWS_BUCKET_NAME is the CURRENT bucket (the server's .env.local): with an old bucket
// name it would treat the new files as old ones. It refuses when the current bucket has no files
// at all while other buckets do, unless --current-bucket-empty-ok is given.
//
// Restore puts the stored_files rows and document rows back and re-links empty slots (a slot that
// has since received a new file keeps the new one). Issued HR letters are never touched: if one
// points at an old file, the run stops.
import { loadEnvConfig } from "@next/env";
import { Pool, type PoolClient } from "@neondatabase/serverless";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

loadEnvConfig(process.cwd());

type Ref = { table: string; column: string; nullable: boolean };
type Backup = {
  createdAt: string;
  currentBucket: string;
  storedFiles: Record<string, unknown>[];
  documentRows: { table: string; column: string; rows: Record<string, unknown>[] }[];
  slots: { table: string; column: string; links: { id: string; fileId: string }[] }[];
};

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;

async function refsToStoredFiles(c: PoolClient): Promise<Ref[]> {
  const { rows } = await c.query(`
    select kcu.table_name as table, kcu.column_name as column, (col.is_nullable = 'YES') as nullable
    from information_schema.referential_constraints rc
    join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name and kcu.constraint_schema = rc.constraint_schema
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = rc.constraint_name and ccu.constraint_schema = rc.constraint_schema
    join information_schema.columns col on col.table_schema = kcu.table_schema and col.table_name = kcu.table_name and col.column_name = kcu.column_name
    where ccu.table_name = 'stored_files' and ccu.column_name = 'id' and kcu.table_schema = current_schema()
    order by 1, 2`);
  return rows as Ref[];
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : process.argv.includes("--restore") ? "restore" : "dry-run";
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket) throw new Error("AWS_BUCKET_NAME is not set");
  const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    if (mode === "restore") return await restore(c, process.argv[process.argv.indexOf("--restore") + 1]);

    const refs = await refsToStoredFiles(c);
    const old = `select id from stored_files where bucket <> $1`;
    const { rows: files } = await c.query(`select * from stored_files where bucket <> $1 order by created_at`, [bucket]);
    const { rows: [cur] } = await c.query(`select count(*)::int as n from stored_files where bucket = $1`, [bucket]);
    console.log(`Current bucket: ${bucket} (${cur.n} files). Old files: ${files.length} in ${[...new Set(files.map((f) => f.bucket))].join(", ") || "-"}`);
    if (cur.n === 0 && files.length && !process.argv.includes("--current-bucket-empty-ok"))
      throw new Error("No files in the current bucket — is AWS_BUCKET_NAME the current bucket? Stopping.");

    const backup: Backup = { createdAt: new Date().toISOString(), currentBucket: bucket, storedFiles: files, documentRows: [], slots: [] };
    for (const r of refs) {
      if (r.nullable) {
        const { rows } = await c.query(`select id::text as id, ${q(r.column)}::text as "fileId" from ${q(r.table)} where ${q(r.column)} in (${old})`, [bucket]);
        if (rows.length) backup.slots.push({ table: r.table, column: r.column, links: rows });
        console.log(`  slot  ${r.table}.${r.column}: ${rows.length} to empty`);
      } else {
        const { rows } = await c.query(`select * from ${q(r.table)} where ${q(r.column)} in (${old})`, [bucket]);
        if (rows.length) backup.documentRows.push({ table: r.table, column: r.column, rows });
        console.log(`  rows  ${r.table}: ${rows.length} to remove`);
        if (r.table === "employee_letters" && rows.length) throw new Error("Issued letters point at old files — not touching them. Stopping.");
      }
    }
    if (mode === "dry-run") { console.log("Dry run: nothing changed. Use --apply to back up and detach."); return; }

    const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : `backups/old-files-${backup.createdAt.slice(0, 10)}.json`;
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(backup, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 1), { mode: 0o600 });
    console.log(`Backup written: ${out}`);

    await c.query("begin");
    for (const s of backup.slots) {
      await c.query(`update ${q(s.table)} set ${q(s.column)} = null where id::text = any($1::text[])`, [s.links.map((l) => l.id)]);
    }
    for (const d of backup.documentRows) {
      await c.query(`delete from ${q(d.table)} where ${q(d.column)} in (${old})`, [bucket]);
    }
    const del = await c.query(`delete from stored_files where bucket <> $1`, [bucket]);
    await c.query("commit");
    console.log(`Done: ${backup.slots.reduce((n, s) => n + s.links.length, 0)} slots emptied, ${backup.documentRows.reduce((n, d) => n + d.rows.length, 0)} document rows removed, ${del.rowCount} stored files removed.`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

async function insertRows(c: PoolClient, table: string, rows: Record<string, unknown>[]) {
  // Rows go back exactly as backed up (all columns, same ids); one already present is left alone.
  for (const row of rows) {
    await c.query(`insert into ${q(table)} select * from json_populate_record(null::${q(table)}, $1::json) on conflict do nothing`, [JSON.stringify(row)]);
  }
}

async function restore(c: PoolClient, file: string | undefined) {
  if (!file) throw new Error("--restore needs the backup file");
  const b = JSON.parse(readFileSync(file, "utf8")) as Backup;
  await c.query("begin");
  try {
    await insertRows(c, "stored_files", b.storedFiles);
    for (const d of b.documentRows) await insertRows(c, d.table, d.rows);
    let relinked = 0;
    for (const s of b.slots) {
      for (const l of s.links) {
        const r = await c.query(`update ${q(s.table)} set ${q(s.column)} = $2::uuid where id::text = $1 and ${q(s.column)} is null`, [l.id, l.fileId]);
        relinked += r.rowCount ?? 0;
      }
    }
    if (process.argv.includes("--verify")) {
      await c.query("rollback");
      console.log(`Verify OK (rolled back): would restore ${b.storedFiles.length} stored files, ${b.documentRows.reduce((n, d) => n + d.rows.length, 0)} document rows, ${relinked} slots.`);
      return;
    }
    await c.query("commit");
    console.log(`Restored ${b.storedFiles.length} stored files, ${b.documentRows.reduce((n, d) => n + d.rows.length, 0)} document rows, ${relinked} slots re-linked.`);
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
