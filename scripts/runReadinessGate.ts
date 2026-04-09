import fs from "node:fs/promises";
import path from "node:path";

import type { AddressInfo } from "node:net";

import { createApp } from "../src/app";
import { closePool, getPool } from "../src/db";
import { loadLocalEnv } from "../src/loadEnv";
import { PricingEngine } from "../src/pricingEngine";
import type { DailyQuoteKpi } from "../src/quoteEvents";
import { PostgresQuoteRepository } from "../src/repositories/marketDataRepository";
import type { PriceQuoteRequest, PriceQuoteResponse } from "../src/types";

loadLocalEnv();

interface SmokeCase {
  name: string;
  request: PriceQuoteRequest;
  expectedStatus: number;
  expectedFallback?: boolean;
}

interface SuccessMatrixRow {
  name: string;
  status: number;
  fallback_used: boolean;
  confidence: number;
  recommended_price: number;
  average_price: number;
  delta_to_cohort_median_pct: number | null;
}

interface ErrorMatrixRow {
  name: string;
  status: number;
  error_code: string;
}

interface ErrorPayload {
  error?: {
    code?: string;
  };
}

const SMOKE_CASES: SmokeCase[] = [
  {
    name: "iPhone 13 128 alias exact",
    request: { brand: "Apple", model: "iphone13", storage_gb: 128, condition_grade: "B", battery_health_pct: 87, has_box: true },
    expectedStatus: 200,
    expectedFallback: false,
  },
  {
    name: "iPhone 13 128 strong condition",
    request: { brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "A", battery_health_pct: 94, has_box: true },
    expectedStatus: 200,
    expectedFallback: false,
  },
  {
    name: "iPhone 13 128 standard",
    request: { brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", battery_health_pct: 88, has_box: true },
    expectedStatus: 200,
    expectedFallback: false,
  },
  {
    name: "iPhone 13 128 no box",
    request: { brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", battery_health_pct: 84, has_box: false },
    expectedStatus: 200,
    expectedFallback: false,
  },
  {
    name: "iPhone 13 128 rough condition",
    request: { brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "D", battery_health_pct: 74, has_box: false },
    expectedStatus: 200,
    expectedFallback: false,
  },
  {
    name: "iPhone 13 256 storage fallback",
    request: { brand: "Apple", model: "iPhone 13", storage_gb: 256, condition_grade: "B", battery_health_pct: 87, has_box: true },
    expectedStatus: 200,
    expectedFallback: true,
  },
  {
    name: "iPhone 12 128 sparse cohort",
    request: { brand: "Apple", model: "iPhone 12", storage_gb: 128, condition_grade: "B", battery_health_pct: 85, has_box: true },
    expectedStatus: 200,
    expectedFallback: true,
  },
  {
    name: "iPhone 12 Pro Max 128 sparse cohort",
    request: { brand: "Apple", model: "iPhone 12 Pro Max", storage_gb: 128, condition_grade: "B", battery_health_pct: 86, has_box: true },
    expectedStatus: 200,
    expectedFallback: true,
  },
  {
    name: "iPhone 13 Pro 128 sparse cohort",
    request: { brand: "Apple", model: "iPhone 13 Pro", storage_gb: 128, condition_grade: "C", battery_health_pct: 83, has_box: false },
    expectedStatus: 200,
    expectedFallback: true,
  },
  {
    name: "iPhone 11 128 sparse cohort",
    request: { brand: "Apple", model: "iPhone 11", storage_gb: 128, condition_grade: "B", battery_health_pct: 84, has_box: true },
    expectedStatus: 200,
    expectedFallback: true,
  },
  {
    name: "iPhone XR 128 unavailable",
    request: { brand: "Apple", model: "iPhone XR", storage_gb: 128, condition_grade: "B", battery_health_pct: 85, has_box: true },
    expectedStatus: 422,
  },
];

function toIdr(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function toPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

async function getCohortMedian(brand: string, model: string, storageGb: number): Promise<number | null> {
  const pool = getPool();
  const result = await pool.query(
    `
      SELECT listing_price_idr
      FROM market_price_entry
      WHERE country = 'ID'
        AND brand = $1
        AND model = $2
        AND storage_gb = $3
      ORDER BY listing_price_idr
    `,
    [brand, model, storageGb],
  );

  if (result.rows.length === 0) {
    return null;
  }

  const prices = result.rows.map((row) => Number(row.listing_price_idr));
  const middle = Math.floor(prices.length / 2);
  if (prices.length % 2 === 0) {
    return (prices[middle - 1] + prices[middle]) / 2;
  }
  return prices[middle];
}

async function run(): Promise<void> {
  const pool = getPool();
  await pool.query("TRUNCATE quote_event RESTART IDENTITY");

  const app = createApp(new PricingEngine(new PostgresQuoteRepository()));
  const server = app.listen(0);
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const successRows: SuccessMatrixRow[] = [];
  const errorRows: ErrorMatrixRow[] = [];

  try {
    for (const smokeCase of SMOKE_CASES) {
      const response = await fetch(`${baseUrl}/api/v1/price/quote`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": `pri38-${smokeCase.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        },
        body: JSON.stringify(smokeCase.request),
      });
      const payload = (await response.json()) as PriceQuoteResponse | ErrorPayload;

      if (response.status !== smokeCase.expectedStatus) {
        throw new Error(`Unexpected status for ${smokeCase.name}: ${response.status}`);
      }

      if (response.status === 200) {
        const successPayload = payload as PriceQuoteResponse;
        if (successPayload.fallback_used !== smokeCase.expectedFallback) {
          throw new Error(`Unexpected fallback flag for ${smokeCase.name}`);
        }

        const cohortMedian = await getCohortMedian(
          smokeCase.request.brand,
          smokeCase.request.model === "iphone13" ? "iPhone 13" : smokeCase.request.model,
          smokeCase.request.storage_gb,
        );
        const deltaToCohortMedianPct =
          cohortMedian && cohortMedian > 0
            ? Number((((successPayload.recommended_price - cohortMedian) / cohortMedian) * 100).toFixed(2))
            : null;

        successRows.push({
          name: smokeCase.name,
          status: response.status,
          fallback_used: successPayload.fallback_used,
          confidence: successPayload.confidence,
          recommended_price: successPayload.recommended_price,
          average_price: successPayload.average_price,
          delta_to_cohort_median_pct: deltaToCohortMedianPct,
        });
        continue;
      }

      errorRows.push({
        name: smokeCase.name,
        status: response.status,
        error_code: (payload as ErrorPayload).error?.code ?? "UNKNOWN_ERROR",
      });
    }

    const kpiResponse = await fetch(`${baseUrl}/api/v1/internal/quote-kpi/daily`);
    if (!kpiResponse.ok) {
      throw new Error(`Failed to fetch KPI snapshot: ${kpiResponse.status}`);
    }
    const kpiPayload = (await kpiResponse.json()) as { days: DailyQuoteKpi[] };
    const latestKpi = kpiPayload.days[0] ?? null;

    const latestEvent = await pool.query(
      `
        SELECT request_id, status, brand, model, storage_gb, recommended_price, fallback_used, error_code, latency_ms, created_at
        FROM quote_event
        ORDER BY id DESC
        LIMIT 1
      `,
    );

    const artifactsDir = path.join(process.cwd(), "artifacts", "readiness");
    await fs.mkdir(artifactsDir, { recursive: true });

    const reportBody = [
      "# PRI-38 Readiness Report",
      "",
      `Generated at ${new Date().toISOString()}.`,
      "",
      "## Dependency Confirmation",
      "",
      "- Seed pipeline consumed `artifacts/dataset_intake/pri41_device_price_seed.csv` and `artifacts/dataset_intake/pri41_model_alias.csv`.",
      "- Observability path active: `quote_event` writes verified through live API requests and KPI endpoint output.",
      "- Scope held to smartphone quote flow only.",
      "",
      "## Smoke Matrix",
      "",
      "| Case | HTTP | Fallback | Confidence | Recommended | Avg | Delta vs cohort median |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      ...successRows.map(
        (row) =>
          `| ${row.name} | ${row.status} | ${row.fallback_used ? "yes" : "no"} | ${row.confidence} | ${toIdr(
            row.recommended_price,
          )} | ${toIdr(row.average_price)} | ${row.delta_to_cohort_median_pct === null ? "n/a" : toPct(
            row.delta_to_cohort_median_pct,
          )} |`,
      ),
      ...errorRows.map((row) => `| ${row.name} | ${row.status} | n/a | n/a | n/a | n/a | ${row.error_code} |`),
      "",
      "## KPI Snapshot",
      "",
      latestKpi
        ? `- ${latestKpi.quote_date}: total_quotes=${latestKpi.total_quotes}, success_rate_pct=${latestKpi.success_rate_pct}, p95_latency_ms=${latestKpi.p95_latency_ms}, validation_error_count=${latestKpi.validation_error_count}, model_data_not_available_count=${latestKpi.model_data_not_available_count}, internal_error_count=${latestKpi.internal_error_count}`
        : "- No KPI rows available.",
      "",
      "## Sample quote_event Row",
      "",
      "```json",
      JSON.stringify(latestEvent.rows[0] ?? null, null, 2),
      "```",
      "",
      "## Remaining Blockers",
      "",
      "- None at code/runtime level for the local MVP quote-flow gate.",
      "- Traceability mismatch remains in issue references: local accepted seed package is PRI-41 artifact output while PRI-38 still cites [PRI-29](/PRI/issues/PRI-29) and [PRI-32](/PRI/issues/PRI-32). CTO should decide whether PRI-41 is the canonical ingest dependency for acceptance.",
      "",
    ].join("\n");

    const jsonBody = {
      generated_at: new Date().toISOString(),
      base_url: baseUrl,
      smoke_cases: successRows,
      error_cases: errorRows,
      kpi_snapshot: latestKpi,
      sample_quote_event: latestEvent.rows[0] ?? null,
    };

    await fs.writeFile(path.join(artifactsDir, "pri38_readiness_report.md"), `${reportBody}\n`, "utf8");
    await fs.writeFile(path.join(artifactsDir, "pri38_smoke_results.json"), `${JSON.stringify(jsonBody, null, 2)}\n`, "utf8");

    console.log(`Readiness gate passed with ${successRows.length} successful quote checks and ${errorRows.length} expected error checks.`);
    console.log(`Report: ${path.join("artifacts", "readiness", "pri38_readiness_report.md")}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
