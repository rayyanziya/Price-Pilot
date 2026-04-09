import { getPool } from "../db";
import { normalizeBrand, normalizeModelKey } from "../normalization";
import type { MarketPriceEntry, QuoteRepository } from "../types";

const ACTIVE_LISTING_WINDOW_SQL = "collected_at >= NOW() - INTERVAL '30 days'";

function mapRow(row: Record<string, unknown>): MarketPriceEntry {
  return {
    id: Number(row.id),
    country: String(row.country),
    brand: String(row.brand),
    model: String(row.model),
    storage_gb: Number(row.storage_gb),
    condition_grade: String(row.condition_grade) as MarketPriceEntry["condition_grade"],
    listing_price_idr: Number(row.listing_price_idr),
    battery_health_pct: Number(row.battery_health_pct),
    has_box: Boolean(row.has_box),
    source: String(row.source),
    collected_at: new Date(String(row.collected_at)).toISOString(),
    source_url: row.source_url ? String(row.source_url) : null,
  };
}

export class PostgresQuoteRepository implements QuoteRepository {
  async resolveCanonicalModel(brand: string, model: string): Promise<string | null> {
    const pool = getPool();
    const result = await pool.query(
      `
        SELECT canonical_model
        FROM model_alias_mapping
        WHERE brand = $1
          AND alias_key = $2
        LIMIT 1
      `,
      [normalizeBrand(brand), normalizeModelKey(model)],
    );

    return result.rows[0]?.canonical_model ?? null;
  }

  async findExactMatches(brand: string, model: string, storageGb: number): Promise<MarketPriceEntry[]> {
    const pool = getPool();
    const result = await pool.query(
      `
        SELECT *
        FROM market_price_entry
        WHERE country = 'ID'
          AND brand = $1
          AND model = $2
          AND storage_gb = $3
          AND ${ACTIVE_LISTING_WINDOW_SQL}
        ORDER BY collected_at DESC
      `,
      [normalizeBrand(brand), model, storageGb],
    );

    return result.rows.map(mapRow);
  }

  async findModelFamilyMatches(brand: string, model: string): Promise<MarketPriceEntry[]> {
    const pool = getPool();
    const result = await pool.query(
      `
        SELECT *
        FROM market_price_entry
        WHERE country = 'ID'
          AND brand = $1
          AND model = $2
          AND ${ACTIVE_LISTING_WINDOW_SQL}
        ORDER BY collected_at DESC
      `,
      [normalizeBrand(brand), model],
    );

    return result.rows.map(mapRow);
  }
}

export class InMemoryQuoteRepository implements QuoteRepository {
  private readonly entries: MarketPriceEntry[];
  private readonly aliasMap: Map<string, string>;

  constructor(entries: MarketPriceEntry[], aliases?: Array<{ brand: string; alias: string; canonical_model: string }>) {
    this.entries = entries.map((entry) => ({
      ...entry,
      brand: normalizeBrand(entry.brand),
    }));
    this.aliasMap = new Map<string, string>();

    for (const entry of entries) {
      this.aliasMap.set(`${normalizeBrand(entry.brand)}:${normalizeModelKey(entry.model)}`, entry.model);
    }

    for (const alias of aliases ?? []) {
      this.aliasMap.set(
        `${normalizeBrand(alias.brand)}:${normalizeModelKey(alias.alias)}`,
        alias.canonical_model,
      );
    }
  }

  async resolveCanonicalModel(brand: string, model: string): Promise<string | null> {
    return this.aliasMap.get(`${normalizeBrand(brand)}:${normalizeModelKey(model)}`) ?? null;
  }

  async findExactMatches(brand: string, model: string, storageGb: number): Promise<MarketPriceEntry[]> {
    return this.entries.filter(
      (entry) =>
        entry.country === "ID" &&
        entry.brand === normalizeBrand(brand) &&
        entry.model === model &&
        entry.storage_gb === storageGb,
    );
  }

  async findModelFamilyMatches(brand: string, model: string): Promise<MarketPriceEntry[]> {
    return this.entries.filter(
      (entry) =>
        entry.country === "ID" &&
        entry.brand === normalizeBrand(brand) &&
        entry.model === model,
    );
  }
}
