import "dotenv/config";
import { createClient } from "@libsql/client";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const DRIZZLE_DIR = join(import.meta.dir, "..", "drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
}

interface Journal {
  entries: JournalEntry[];
}

interface AppliedMigration {
  id: number;
  hash: string;
  created_at: number;
}

interface ColumnInfo {
  name: string;
}

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    console.error("❌ TURSO_DATABASE_URL not set");
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  const journalPath = join(DRIZZLE_DIR, "meta", "_journal.json");
  if (!existsSync(journalPath)) {
    console.error("❌ No migrations found (missing drizzle/meta/_journal.json)");
    process.exit(1);
  }

  const journal: Journal = JSON.parse(readFileSync(journalPath, "utf-8"));
  const expectedMigrations = journal.entries.map((e) => e.tag);

  let appliedMigrations: string[] = [];
  try {
    const result = await client.execute(
      "SELECT hash FROM __drizzle_migrations ORDER BY id"
    );
    appliedMigrations = result.rows.map((r) => r.hash as string);
  } catch {
    console.log("ℹ️  No migrations table yet (fresh database)");
  }

  const unappliedMigrations = expectedMigrations.filter(
    (tag) => !appliedMigrations.includes(tag)
  );

  if (unappliedMigrations.length === 0) {
    console.log("✅ All migrations already applied");
    process.exit(0);
  }

  console.log(`📋 Found ${unappliedMigrations.length} unapplied migration(s)`);

  const tableColumns = new Map<string, Set<string>>();
  async function getTableColumns(table: string): Promise<Set<string>> {
    if (tableColumns.has(table)) {
      return tableColumns.get(table)!;
    }
    try {
      const result = await client.execute(`PRAGMA table_info("${table}")`);
      const columns = new Set(result.rows.map((r) => r.name as string));
      tableColumns.set(table, columns);
      return columns;
    } catch {
      tableColumns.set(table, new Set());
      return new Set();
    }
  }

  async function tableExists(table: string): Promise<boolean> {
    const result = await client.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [table]
    );
    return result.rows.length > 0;
  }

  const issues: string[] = [];

  for (const tag of unappliedMigrations) {
    const sqlPath = join(DRIZZLE_DIR, `${tag}.sql`);
    if (!existsSync(sqlPath)) {
      console.error(`❌ Missing SQL file for migration: ${tag}`);
      process.exit(1);
    }

    const sql = readFileSync(sqlPath, "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const stmt of statements) {
      const alterMatch = stmt.match(
        /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+(?:COLUMN\s+)?[`"]?(\w+)[`"]?/i
      );
      if (alterMatch) {
        const [, table, column] = alterMatch;
        const columns = await getTableColumns(table);
        if (columns.has(column)) {
          issues.push(
            `Column "${column}" already exists in table "${table}" but migration "${tag}" not recorded`
          );
        }
        continue;
      }

      const createMatch = stmt.match(
        /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?(\w+)[`"]?/i
      );
      if (createMatch) {
        const [, table] = createMatch;
        if (await tableExists(table)) {
          issues.push(
            `Table "${table}" already exists but migration "${tag}" not recorded`
          );
        }
      }
    }
  }

  if (issues.length > 0) {
    console.error("\n❌ PARTIAL MIGRATION DETECTED\n");
    console.error("The following schema objects exist but their migrations are not recorded:\n");
    for (const issue of issues) {
      console.error(`  • ${issue}`);
    }
    console.error("\n🔧 To fix this, manually insert the migration record:\n");

    for (const tag of unappliedMigrations) {
      const sqlPath = join(DRIZZLE_DIR, `${tag}.sql`);
      if (existsSync(sqlPath)) {
        console.error(
          `   INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('${tag}', ${Date.now()});`
        );
      }
    }
    console.error("\n   Then re-run: bun run db:migrate\n");
    process.exit(1);
  }

  console.log("✅ Database state is clean, safe to run migrations");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration check failed:", err.message);
  process.exit(1);
});
