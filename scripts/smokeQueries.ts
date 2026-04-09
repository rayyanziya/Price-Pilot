import { closePool, getPool } from "../src/db";
import { loadLocalEnv } from "../src/loadEnv";

loadLocalEnv();

async function main(): Promise<void> {
  const pool = getPool();
  const checks = [
    { brand: "Apple", model: "iPhone 13", storage: 128 },
    { brand: "Samsung", model: "Galaxy S23", storage: 128 },
    { brand: "Xiaomi", model: "13T", storage: 256 },
  ];

  for (const check of checks) {
    const result = await pool.query(
      `
        SELECT COUNT(*)::int AS row_count
        FROM market_price_entry
        WHERE country = 'ID'
          AND brand = $1
          AND model = $2
          AND storage_gb = $3
      `,
      [check.brand, check.model, check.storage],
    );

    console.log(`${check.brand} ${check.model} ${check.storage}GB => ${result.rows[0].row_count} rows`);
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
