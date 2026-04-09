import assert from "node:assert/strict";
import test from "node:test";

import { PricingEngine } from "../src/pricingEngine";
import { InMemoryQuoteRepository } from "../src/repositories/marketDataRepository";
import { buildSeedEntries } from "./helpers";

test("PricingEngine applies multipliers and produces deterministic ranges", async () => {
  const engine = new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries()));
  const response = await engine.quote({
    brand: "Apple",
    model: "iPhone 13",
    storage_gb: 256,
    condition_grade: "C",
    battery_health_pct: 78,
    has_box: false,
  });

  assert.equal(response.currency, "IDR");
  assert.equal(response.fallback_used, true);
  assert.equal(response.average_price, 5598916);
  assert.equal(response.low_price, 5151003);
  assert.equal(response.high_price, 6046829);
  assert.equal(response.recommended_price, 5430949);
});

test("PricingEngine uses model-family fallback when exact storage sample is thin", async () => {
  const engine = new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries()));
  const response = await engine.quote({
    brand: "Apple",
    model: "iPhone 12",
    storage_gb: 256,
    condition_grade: "B",
    battery_health_pct: 86,
    has_box: true,
  });

  assert.equal(response.fallback_used, true);
  assert.ok(response.explanations.some((line) => line.toLowerCase().includes("fallback")));
});
