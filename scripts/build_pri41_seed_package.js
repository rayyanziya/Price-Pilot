const fs = require("fs");
const path = require("path");

const INPUT_CSV = path.join("artifacts", "dataset_intake", "tokopedia_2025_normalized.csv");
const OUTPUT_DIR = path.join("artifacts", "dataset_intake");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parseCsvLine(line) {
  const cells = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === "\"") {
        if (line[i + 1] === "\"") {
          cur += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else if (ch === "\"") {
      inQuotes = true;
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = vals[idx] ?? "";
    });
    return row;
  });
}

function toCsv(rows, headers) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, "\"\"")}"`;
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => esc(row[h])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeCity(city) {
  const x = (city || "").toLowerCase().trim();
  const map = {
    "jakarta pusat": "jakarta_pusat",
    "jakarta selatan": "jakarta_selatan",
    "jakarta barat": "jakarta_barat",
    "jakarta timur": "jakarta_timur",
    "jakarta utara": "jakarta_utara",
    "tangerang selatan": "tangerang_selatan",
    tangerang: "tangerang",
    bekasi: "bekasi",
    surabaya: "surabaya",
    bandung: "bandung",
    medan: "medan",
  };
  if (map[x]) return map[x];
  return x ? x.replace(/\s+/g, "_") : "unknown";
}

function mapConditionGrade(conditionProxy) {
  if (conditionProxy === "used") return "B";
  if (conditionProxy === "used_inferred") return "C";
  return "C";
}

function q(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] * (hi - idx) + a[hi] * (idx - lo);
}

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function confidenceFromCount(n) {
  if (n >= 10) return "high";
  if (n >= 5) return "medium";
  return "low";
}

function main() {
  ensureDir(OUTPUT_DIR);
  const rows = parseCsv(fs.readFileSync(INPUT_CSV, "utf8"));
  const rawCount = rows.length;

  const filtered = rows.filter((r) => {
    const model = (r.model || "").trim();
    const price = toNumber(r.price_idr);
    const storage = toNumber(r.storage_gb);
    return /^iPhone\s+\d+/i.test(model) && r.condition_proxy !== "new_or_preorder" && !!price && !!storage;
  });

  const byListingUrl = new Map();
  for (const row of filtered) {
    if (!byListingUrl.has(row.listing_url)) byListingUrl.set(row.listing_url, row);
  }
  const deduped = [...byListingUrl.values()];

  const seedRows = deduped.map((r) => ({
    brand: "Apple",
    model: r.model,
    storage_gb: toNumber(r.storage_gb),
    condition_grade: mapConditionGrade(r.condition_proxy),
    battery_bucket: "unknown",
    city: normalizeCity(r.city),
    price_idr: toNumber(r.price_idr),
    source: r.source,
    observed_at: r.collected_at,
    listing_url: r.listing_url,
    listing_title: r.listing_title,
    source_url: r.source_url,
    source_file: r.source_file,
    source_query: r.source_query,
  }));

  const storageCountByModel = new Map();
  for (const row of seedRows) {
    if (!storageCountByModel.has(row.model)) storageCountByModel.set(row.model, new Set());
    storageCountByModel.get(row.model).add(row.storage_gb);
  }

  const aliasMap = new Map();
  for (const row of seedRows) {
    const canonicalBrand = row.brand;
    const canonicalModel = row.model;
    const canonicalStorage = row.storage_gb;
    const k = `${canonicalBrand}|${canonicalModel}|${canonicalStorage}`;

    const aliases = new Set();
    const lowerModel = canonicalModel.toLowerCase();
    aliases.add(`${lowerModel} ${canonicalStorage}gb`);
    aliases.add(`apple ${lowerModel} ${canonicalStorage}gb`);
    aliases.add(`${lowerModel.replace(/\s+/g, "")}${canonicalStorage}gb`);
    aliases.add(`iphone${lowerModel.replace(/^iphone\s*/, "").replace(/\s+/g, "")}${canonicalStorage}gb`);

    const storageSet = storageCountByModel.get(row.model);
    if (storageSet && storageSet.size === 1) {
      aliases.add(lowerModel);
      aliases.add(`apple ${lowerModel}`);
      aliases.add(lowerModel.replace(/\s+/g, ""));
      aliases.add(`iphone${lowerModel.replace(/^iphone\s*/, "").replace(/\s+/g, "")}`);
    }

    if (!aliasMap.has(k)) aliasMap.set(k, new Set());
    const bucket = aliasMap.get(k);
    for (const a of aliases) bucket.add(a);
  }

  const aliasRows = [];
  for (const [k, aliases] of aliasMap.entries()) {
    const [canonical_brand, canonical_model, canonical_storage_gb] = k.split("|");
    for (const alias_text of aliases) {
      aliasRows.push({
        alias_text,
        canonical_brand,
        canonical_model,
        canonical_storage_gb: Number(canonical_storage_gb),
      });
    }
  }
  aliasRows.sort((a, b) => {
    if (a.canonical_model !== b.canonical_model) return a.canonical_model.localeCompare(b.canonical_model);
    if (a.canonical_storage_gb !== b.canonical_storage_gb) return a.canonical_storage_gb - b.canonical_storage_gb;
    return a.alias_text.localeCompare(b.alias_text);
  });

  const prices = seedRows.map((r) => r.price_idr);
  const q1 = q(prices, 0.25);
  const q3 = q(prices, 0.75);
  const iqr = q3 - q1;
  const low = q1 - 1.5 * iqr;
  const high = q3 + 1.5 * iqr;
  const outliers = seedRows.filter((r) => r.price_idr < low || r.price_idr > high);

  const missing = {
    brand: seedRows.filter((r) => !r.brand).length,
    model: seedRows.filter((r) => !r.model).length,
    storage_gb: seedRows.filter((r) => r.storage_gb === null).length,
    condition_grade: seedRows.filter((r) => !r.condition_grade).length,
    battery_bucket: seedRows.filter((r) => !r.battery_bucket).length,
    city: seedRows.filter((r) => !r.city || r.city === "unknown").length,
    price_idr: seedRows.filter((r) => r.price_idr === null).length,
    source: seedRows.filter((r) => !r.source).length,
    observed_at: seedRows.filter((r) => !r.observed_at).length,
    listing_url: seedRows.filter((r) => !r.listing_url).length,
  };

  const cohorts = new Map();
  for (const row of seedRows) {
    const key = `${row.model}|${row.storage_gb}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row.price_idr);
  }
  const cohortStats = [...cohorts.entries()]
    .map(([k, vals]) => {
      const [model, storage] = k.split("|");
      return {
        model,
        storage_gb: Number(storage),
        listing_count: vals.length,
        median_price_idr: median(vals),
        confidence: confidenceFromCount(vals.length),
      };
    })
    .sort((a, b) => b.listing_count - a.listing_count);

  const profile = {
    input_file: INPUT_CSV,
    generated_at: new Date().toISOString(),
    totals: {
      raw_rows: rawCount,
      filtered_rows: filtered.length,
      deduped_rows: seedRows.length,
      alias_rows: aliasRows.length,
      model_storage_cohorts: cohortStats.length,
    },
    duplicate_profile: {
      duplicate_rows_removed_by_listing_url: filtered.length - seedRows.length,
    },
    missing_profile: missing,
    outlier_profile: {
      method: "global_iqr",
      bounds_price_idr: {
        low: Math.round(low),
        high: Math.round(high),
      },
      outlier_count: outliers.length,
      examples: outliers.slice(0, 5).map((r) => ({
        model: r.model,
        storage_gb: r.storage_gb,
        city: r.city,
        price_idr: r.price_idr,
        listing_url: r.listing_url,
      })),
    },
    cohort_confidence: cohortStats,
    assumptions: [
      "Only used-phone rows retained; new_or_preorder rows are excluded.",
      "condition_proxy -> condition_grade mapping: used=B, used_inferred=C, unknown=C.",
      "battery_bucket is set to unknown because no battery-health field is available in source snapshots.",
      "city values are normalized to snake_case from listing city field.",
    ],
  };

  const seedHeaders = [
    "brand",
    "model",
    "storage_gb",
    "condition_grade",
    "battery_bucket",
    "city",
    "price_idr",
    "source",
    "observed_at",
    "listing_url",
    "listing_title",
    "source_url",
    "source_file",
    "source_query",
  ];
  const aliasHeaders = ["alias_text", "canonical_brand", "canonical_model", "canonical_storage_gb"];

  fs.writeFileSync(path.join(OUTPUT_DIR, "pri41_device_price_seed.csv"), toCsv(seedRows, seedHeaders));
  fs.writeFileSync(path.join(OUTPUT_DIR, "pri41_model_alias.csv"), toCsv(aliasRows, aliasHeaders));
  fs.writeFileSync(path.join(OUTPUT_DIR, "pri41_seed_quality_summary.json"), `${JSON.stringify(profile, null, 2)}\n`);

  const report = [
    "# PRI-41 Seed Package Notes",
    "",
    "Schema aligned to [PRI-42 plan](/PRI/issues/PRI-42#document-plan) for `device_price_seed` and `model_alias`.",
    "",
    "## Column Dictionary",
    "",
    "- `brand`: canonical brand name (`Apple`).",
    "- `model`: canonical model string (e.g., `iPhone 13`).",
    "- `storage_gb`: numeric storage in GB (`64|128|256|512|1024`).",
    "- `condition_grade`: normalized grade (`A|B|C|D`).",
    "- `battery_bucket`: `gte90|80_89|lt80|unknown`.",
    "- `city`: normalized city token (snake_case).",
    "- `price_idr`: listing price in Indonesian Rupiah.",
    "- `source`: data source identifier (`tokopedia`).",
    "- `observed_at`: collection date from listing snapshot (`YYYY-MM-DD`).",
    "- `listing_url`: public listing URL for traceability.",
    "- `listing_title`: listing title captured from snapshot.",
    "- `source_url`: search/source URL where listing was collected.",
    "- `source_file`: raw snapshot filename.",
    "- `source_query`: query term used for collection.",
    "",
    "## Accepted Value Sets",
    "",
    "- `condition_grade`: `A`, `B`, `C`, `D`.",
    "- `battery_bucket`: `gte90`, `80_89`, `lt80`, `unknown`.",
    "- `city` (current batch): `jakarta_pusat`, `jakarta_selatan`, `jakarta_barat`, `jakarta_timur`, `tangerang_selatan`, `tangerang`, `bekasi`, `surabaya`.",
    "",
    "## Assumptions",
    "",
    "- Excluded rows with `condition_proxy=new_or_preorder` to keep used-phone pricing only.",
    "- Mapped `condition_proxy` to grade: `used -> B`, `used_inferred -> C`, `unknown -> C`.",
    "- Set all `battery_bucket=unknown` because battery health is not available in these source snapshots.",
    "- City values normalized from free-text city labels in source tails.",
    "",
    "## Quality Summary",
    "",
    `- Raw rows in input normalized file: ${rawCount}`,
    `- Filtered used-smartphone rows: ${filtered.length}`,
    `- Deduped rows (by listing_url): ${seedRows.length}`,
    `- Duplicate rows removed: ${filtered.length - seedRows.length}`,
    `- Global outlier bounds (IQR): Rp${Math.round(low).toLocaleString("id-ID")} to Rp${Math.round(high).toLocaleString("id-ID")}`,
    `- Outlier rows flagged: ${outliers.length}`,
    "",
    "## Cohort Confidence",
    "",
    ...cohortStats.map(
      (c) =>
        `- ${c.model} ${c.storage_gb}GB: n=${c.listing_count}, median=Rp${c.median_price_idr.toLocaleString("id-ID")}, confidence=${c.confidence}`
    ),
  ].join("\n");

  fs.writeFileSync(path.join(OUTPUT_DIR, "pri41_seed_package_notes.md"), `${report}\n`);

  console.log(
    JSON.stringify(
      {
        output_dir: OUTPUT_DIR,
        files: [
          "pri41_device_price_seed.csv",
          "pri41_model_alias.csv",
          "pri41_seed_quality_summary.json",
          "pri41_seed_package_notes.md",
        ],
        rows: {
          seed_rows: seedRows.length,
          alias_rows: aliasRows.length,
        },
      },
      null,
      2
    )
  );
}

main();
