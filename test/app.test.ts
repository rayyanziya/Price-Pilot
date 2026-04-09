import assert from "node:assert/strict";
import test from "node:test";

import request from "supertest";

import { createApp } from "../src/app";
import { PricingEngine } from "../src/pricingEngine";
import type { QuoteEvent } from "../src/quoteEvents";
import { InMemoryQuoteRepository } from "../src/repositories/marketDataRepository";
import { buildSeedEntries } from "./helpers";

test("GET /health returns ok", async () => {
  const app = createApp(new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries())));
  const response = await request(app).get("/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: "ok" });
});

test("POST /api/v1/price/quote returns deterministic quote for valid seeded data", async () => {
  const recordedEvents: QuoteEvent[] = [];
  const app = createApp(
    new PricingEngine(
      new InMemoryQuoteRepository(buildSeedEntries(), [
        { brand: "Apple", alias: "iphone13", canonical_model: "iPhone 13" },
      ]),
    ),
    {
      quoteEventRecorder: async (event) => {
        recordedEvents.push(event);
      },
    },
  );
  const response = await request(app).post("/api/v1/price/quote").send({
    brand: "Apple",
    model: "iphone13",
    storage_gb: 128,
    condition_grade: "B",
    battery_health_pct: 87,
    has_box: true,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.currency, "IDR");
  assert.equal(response.body.average_price, 6335148);
  assert.equal(response.body.recommended_price, 6335148);
  assert.equal(response.body.fallback_used, false);
  assert.ok(Array.isArray(response.body.explanations));
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].status, "success");
  assert.equal(recordedEvents[0].fallback_used, false);
  assert.equal(recordedEvents[0].recommended_price, response.body.recommended_price);
  assert.ok(recordedEvents[0].latency_ms >= 0);
});

test("POST /api/v1/price/quote returns 400 for invalid request payload", async () => {
  const recordedEvents: QuoteEvent[] = [];
  const app = createApp(new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries())), {
    quoteEventRecorder: async (event) => {
      recordedEvents.push(event);
    },
  });
  const response = await request(app).post("/api/v1/price/quote").send({
    brand: "",
    model: "iPhone 13",
    storage_gb: "128",
    condition_grade: "Z",
    battery_health_pct: 120,
    has_box: "yes",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_REQUEST");
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].status, "validation_error");
  assert.equal(recordedEvents[0].error_code, "INVALID_REQUEST");
  assert.ok(recordedEvents[0].latency_ms >= 0);
});

test("POST /api/v1/price/quote returns 400 for malformed JSON", async () => {
  const app = createApp(new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries())));
  const response = await request(app)
    .post("/api/v1/price/quote")
    .set("Content-Type", "application/json")
    .send('{"brand":"Apple"');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, "INVALID_REQUEST");
  assert.equal(response.body.error.message, "Invalid request body");
});

test("POST /api/v1/price/quote returns 422 when model data is unavailable", async () => {
  const recordedEvents: QuoteEvent[] = [];
  const app = createApp(new PricingEngine(new InMemoryQuoteRepository(buildSeedEntries())), {
    quoteEventRecorder: async (event) => {
      recordedEvents.push(event);
    },
  });
  const response = await request(app).post("/api/v1/price/quote").send({
    brand: "Apple",
    model: "iPhone 99 Ultra",
    storage_gb: 128,
    condition_grade: "B",
    battery_health_pct: 87,
    has_box: true,
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, "MODEL_DATA_NOT_AVAILABLE");
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].status, "model_data_not_available");
  assert.equal(recordedEvents[0].error_code, "MODEL_DATA_NOT_AVAILABLE");
  assert.ok(recordedEvents[0].latency_ms >= 0);
});

test("POST /api/v1/price/quote returns 500 for unexpected errors", async () => {
  const originalConsoleError = console.error;
  console.error = () => {};
  const recordedEvents: QuoteEvent[] = [];
  const app = createApp({
    quote: async () => {
      throw new Error("forced failure");
    },
  }, {
    quoteEventRecorder: async (event) => {
      recordedEvents.push(event);
    },
  });
  const response = await request(app).post("/api/v1/price/quote").send({
    brand: "Apple",
    model: "iPhone 13",
    storage_gb: 128,
    condition_grade: "B",
    battery_health_pct: 87,
    has_box: true,
  });
  console.error = originalConsoleError;

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, "INTERNAL_SERVER_ERROR");
  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0].status, "internal_error");
  assert.equal(recordedEvents[0].error_code, "INTERNAL_SERVER_ERROR");
  assert.ok(recordedEvents[0].latency_ms >= 0);
});
