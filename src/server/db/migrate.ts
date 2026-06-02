/**
 * Migration runner, invoked on deploy/release (Railway) or via `npm run db:migrate`.
 * Applies the generated SQL migrations from ./drizzle. Runtime only.
 */
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./client";

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

// Allow `tsx src/server/db/migrate.ts` style invocation if ever needed.
if (process.argv[1] && process.argv[1].endsWith("migrate.ts")) {
  runMigrations()
    .then(() => {
      console.log("migrations applied");
      process.exit(0);
    })
    .catch((e) => {
      console.error("migration failed", e);
      process.exit(1);
    });
}
