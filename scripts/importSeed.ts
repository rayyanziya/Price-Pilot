import fs from "node:fs/promises";
import path from "node:path";

import { closePool, getPool } from "../src/db";
import { loadLocalEnv } from "../src/loadEnv";
import { normalizeBrand, normalizeConditionGrade, normalizeModelKey, normalizeModelText } from "../src/normalization";

loadLocalEnv();

interface RawSeedRow {
  country: string;
  brand: string;
  model: string;
  model_alias: string;
  storage_gb: string;
  condition_grade: string;
  listing_price_idr: string;
  battery_health_pct: string;
  has_box: string;
  source: string;
  collected_at: string;
  source_url: string;
}

interface Pri41SeedRow {
  brand: string;
  model: string;
  storage_gb: string;
  condition_grade: string;
  battery_bucket: string;
  city: string;
  price_idr: string;
  source: string;
  observed_at: string;
  listing_url: string;
  listing_title: string;
  source_url: string;
  source_file: string;
  source_query: string;
}

interface Pri41AliasRow {
  alias_text: string;
  canonical_brand: string;
  canonical_model: string;
  canonical_storage_gb: string;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
        continue;
      }
      current += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(content: string): RawSeedRow[] {
  const [headerLine, ...lines] = content.split(/\r?\n/).filter(Boolean);
  const headers = parseCsvLine(headerLine);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const row = {} as Record<string, string>;

    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });

    return row as unknown as RawSeedRow;
  });
}

function percentile(sortedValues: number[], point: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const position = (sortedValues.length - 1) * point;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex];
  }

  const weight = position - lowerIndex;
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function filterOutliers(rows: Array<RawSeedRow & { listing_price_value: number }>): Array<RawSeedRow & { listing_price_value: number }> {
  const groups = new Map<string, Array<RawSeedRow & { listing_price_value: number }>>();

  for (const row of rows) {
    const key = `${normalizeBrand(row.brand)}:${normalizeModelText(row.model)}:${row.storage_gb}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  const accepted: Array<RawSeedRow & { listing_price_value: number }> = [];

  for (const group of groups.values()) {
    if (group.length < 6) {
      accepted.push(...group);
      continue;
    }

    const sortedPrices = group.map((row) => row.listing_price_value).sort((left, right) => left - right);
    const q1 = percentile(sortedPrices, 0.25);
    const q3 = percentile(sortedPrices, 0.75);
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    accepted.push(
      ...group.filter((row) => row.listing_price_value >= lowerBound && row.listing_price_value <= upperBound),
    );
  }

  return accepted;
}

function resolveInputPath(): string {
  const preferredPath = path.join(process.cwd(), "artifacts", "dataset_intake", "pri41_device_price_seed.csv");
  if (process.env.SEED_INPUT_PATH) {
    return path.resolve(process.cwd(), process.env.SEED_INPUT_PATH);
  }
  return preferredPath;
}

function resolveAliasPath(): string | null {
  if (process.env.SEED_ALIAS_PATH) {
    return path.resolve(process.cwd(), process.env.SEED_ALIAS_PATH);
  }

  const preferredPath = path.join(process.cwd(), "artifacts", "dataset_intake", "pri41_model_alias.csv");
  return preferredPath;
}

function mapBatteryBucketToPct(bucket: string): number {
  switch (bucket) {
    case "gte90":
      return 92;
    case "80_89":
      return 85;
    case "lt80":
      return 75;
    default:
      return 85;
  }
}

function toObservedAtTimestamp(observedAt: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(observedAt)) {
    return `${observedAt}T12:00:00Z`;
  }
  return observedAt;
}

async function importLegacySeedRows(
  rows: Array<RawSeedRow & { listing_price_value: number }>,
): Promise<number> {
  const pool = getPool();
  const filteredRows = filterOutliers(rows);

  for (const row of filteredRows) {
    const brand = normalizeBrand(row.brand);
    const model = normalizeModelText(row.model);
    const aliasKey = normalizeModelKey(row.model_alias || row.model);

    await pool.query(
      `
        INSERT INTO model_alias_mapping (brand, canonical_model, alias_key, alias_text)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (brand, alias_key) DO UPDATE
        SET canonical_model = EXCLUDED.canonical_model,
            alias_text = EXCLUDED.alias_text
      `,
      [brand, model, aliasKey, row.model_alias || row.model],
    );

    await pool.query(
      `
        INSERT INTO market_price_entry (
          country,
          brand,
          model,
          storage_gb,
          condition_grade,
          listing_price_idr,
          battery_health_pct,
          has_box,
          source,
          collected_at,
          source_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        row.country || "ID",
        brand,
        model,
        Number(row.storage_gb),
        normalizeConditionGrade(row.condition_grade),
        row.listing_price_value,
        Number(row.battery_health_pct),
        row.has_box === "true",
        row.source,
        row.collected_at,
        row.source_url || null,
      ],
    );
  }

  return filteredRows.length;
}

async function importPri41SeedRows(rows: Pri41SeedRow[], aliasRows: Pri41AliasRow[]): Promise<number> {
  const pool = getPool();

  for (const aliasRow of aliasRows) {
    const brand = normalizeBrand(aliasRow.canonical_brand);
    const canonicalModel = normalizeModelText(aliasRow.canonical_model);
    const aliasText = aliasRow.alias_text.trim();

    if (!aliasText) {
      continue;
    }

    await pool.query(
      `
        INSERT INTO model_alias_mapping (brand, canonical_model, alias_key, alias_text)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (brand, alias_key) DO UPDATE
        SET canonical_model = EXCLUDED.canonical_model,
            alias_text = EXCLUDED.alias_text
      `,
      [brand, canonicalModel, normalizeModelKey(aliasText), aliasText],
    );
  }

  for (const row of rows) {
    await pool.query(
      `
        INSERT INTO market_price_entry (
          country,
          brand,
          model,
          storage_gb,
          condition_grade,
          listing_price_idr,
          battery_health_pct,
          has_box,
          source,
          collected_at,
          source_url
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      `,
      [
        "ID",
        normalizeBrand(row.brand),
        normalizeModelText(row.model),
        Number(row.storage_gb),
        normalizeConditionGrade(row.condition_grade),
        Number(row.price_idr),
        mapBatteryBucketToPct(row.battery_bucket),
        false,
        row.source,
        toObservedAtTimestamp(row.observed_at),
        row.listing_url || row.source_url || null,
      ],
    );
  }

  return rows.length;
}

async function main(): Promise<void> {
  const pool = getPool();
  const seedPath = resolveInputPath();
  const rawContent = await fs.readFile(seedPath, "utf8");
  const parsedRows = parseCsv(rawContent);
  const aliasPath = resolveAliasPath();

  await pool.query("TRUNCATE model_alias_mapping, market_price_entry RESTART IDENTITY CASCADE");

  if ("price_idr" in (parsedRows[0] ?? {})) {
    let aliasRows: Pri41AliasRow[] = [];
    if (aliasPath) {
      const aliasContent = await fs.readFile(aliasPath, "utf8");
      aliasRows = parseCsv(aliasContent) as unknown as Pri41AliasRow[];
    }

    const importedRows = await importPri41SeedRows(parsedRows as unknown as Pri41SeedRow[], aliasRows);
    console.log(`Imported ${importedRows} market price rows from ${path.relative(process.cwd(), seedPath)}`);
    return;
  }

  const legacyRows = (parsedRows as RawSeedRow[]).map((row) => ({
    ...row,
    listing_price_value: Number(row.listing_price_idr),
  }));
  const importedRows = await importLegacySeedRows(legacyRows);

  console.log(`Imported ${importedRows} market price rows from ${path.relative(process.cwd(), seedPath)}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
