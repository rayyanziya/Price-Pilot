import { performance } from "node:perf_hooks";

import { PricingEngine } from "../src/pricingEngine";
import { InMemoryQuoteRepository } from "../src/repositories/marketDataRepository";

async function main(): Promise<void> {
  const repository = new InMemoryQuoteRepository([
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 7100000, battery_health_pct: 88, has_box: true, source: "manual_seed", collected_at: new Date().toISOString() },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 7050000, battery_health_pct: 87, has_box: true, source: "manual_seed", collected_at: new Date().toISOString() },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "A", listing_price_idr: 7250000, battery_health_pct: 91, has_box: true, source: "manual_seed", collected_at: new Date().toISOString() },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "C", listing_price_idr: 6600000, battery_health_pct: 81, has_box: false, source: "manual_seed", collected_at: new Date().toISOString() },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 7000000, battery_health_pct: 86, has_box: true, source: "manual_seed", collected_at: new Date().toISOString() },
  ]);
  const engine = new PricingEngine(repository);

  const start = performance.now();
  const result = await engine.quote({
    brand: "Apple",
    model: "iPhone 13",
    storage_gb: 128,
    condition_grade: "B",
    battery_health_pct: 87,
    has_box: true,
  });
  const end = performance.now();

  console.log(JSON.stringify(result, null, 2));
  console.log(`quote_latency_ms=${(end - start).toFixed(2)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
