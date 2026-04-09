import fs from "node:fs/promises";
import path from "node:path";

import { closePool, getPool } from "../src/db";
import { loadLocalEnv } from "../src/loadEnv";

loadLocalEnv();

async function main(): Promise<void> {
  const pool = getPool();
  const migrationsDir = path.join(process.cwd(), "db", "migrations");
  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    console.log(`Applied migration ${file}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
