import { getPool, hasDatabaseUrl } from "./db";
import type { ConditionGrade } from "./types";

export type QuoteEventStatus =
  | "success"
  | "validation_error"
  | "model_data_not_available"
  | "internal_error";

export interface QuoteEvent {
  request_id: string;
  brand: string;
  model: string;
  storage_gb: number;
  condition_grade: ConditionGrade;
  battery_health_pct: number;
  has_box: boolean;
  status: QuoteEventStatus;
  latency_ms: number;
  fallback_used?: boolean | null;
  recommended_price?: number | null;
  error_code?: string | null;
  error_detail?: string | null;
}

export interface DailyQuoteKpi {
  quote_date: string;
  total_quotes: number;
  success_rate_pct: number;
  p95_latency_ms: number;
  validation_error_count: number;
  model_data_not_available_count: number;
  internal_error_count: number;
}

export type QuoteEventRecorder = (event: QuoteEvent) => Promise<void>;

export async function recordQuoteEvent(event: QuoteEvent): Promise<void> {
  if (!hasDatabaseUrl()) {
    return;
  }

  const pool = getPool();
  await pool.query(
    `
      INSERT INTO quote_event (
        request_id,
        brand,
        model,
        storage_gb,
        condition_grade,
        battery_health_pct,
        has_box,
        status,
        latency_ms,
        fallback_used,
        recommended_price,
        error_code,
        error_detail
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `,
    [
      event.request_id,
      event.brand,
      event.model,
      event.storage_gb,
      event.condition_grade,
      event.battery_health_pct,
      event.has_box,
      event.status,
      event.latency_ms,
      event.fallback_used ?? null,
      event.recommended_price ?? null,
      event.error_code ?? null,
      event.error_detail ?? null,
    ],
  );
}

export async function getDailyQuoteKpis(): Promise<DailyQuoteKpi[]> {
  if (!hasDatabaseUrl()) {
    return [];
  }

  const pool = getPool();
  const result = await pool.query(
    `
      SELECT
        created_at::date::text AS quote_date,
        COUNT(*)::int AS total_quotes,
        ROUND((100.0 * AVG(CASE WHEN status = 'success' THEN 1 ELSE 0 END))::numeric, 2) AS success_rate_pct,
        ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms))::numeric, 2) AS p95_latency_ms,
        COUNT(*) FILTER (WHERE status = 'validation_error')::int AS validation_error_count,
        COUNT(*) FILTER (WHERE status = 'model_data_not_available')::int AS model_data_not_available_count,
        COUNT(*) FILTER (WHERE status = 'internal_error')::int AS internal_error_count
      FROM quote_event
      GROUP BY created_at::date
      ORDER BY quote_date DESC
    `,
  );

  return result.rows.map((row) => ({
    quote_date: String(row.quote_date),
    total_quotes: Number(row.total_quotes),
    success_rate_pct: Number(row.success_rate_pct),
    p95_latency_ms: Number(row.p95_latency_ms),
    validation_error_count: Number(row.validation_error_count),
    model_data_not_available_count: Number(row.model_data_not_available_count),
    internal_error_count: Number(row.internal_error_count),
  }));
}
