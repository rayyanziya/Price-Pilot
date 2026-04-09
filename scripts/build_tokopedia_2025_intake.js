const fs = require("fs");
const path = require("path");

const INPUTS = [
  {
    file: "tmp_tokopedia_p2.txt",
    source_query: "iphone 13 128",
    source_url: "http://www.tokopedia.com/search?st=product&q=iphone%2013%20128&page=2",
    region_hint: "Jabodetabek",
  },
  {
    file: "tmp_tok_sby_ok.txt",
    source_query: "iphone surabaya",
    source_url: "http://www.tokopedia.com/search?st=product&q=iphone%20surabaya&page=2",
    region_hint: "Surabaya",
  },
];

const OUTPUT_DIR = path.join("artifacts", "dataset_intake");
const COLLECTION_DATE = "2026-04-08";

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function parsePriceToIdr(text) {
  const m = text.match(/Rp\s?([0-9.]+)/i);
  if (!m) return null;
  return Number(m[1].replace(/\./g, ""));
}

function extractModel(title) {
  const m = title.toLowerCase().match(/iphone\s*(\d{1,2})(?:\s*(pro\s*max|pro|max|mini))?/i);
  if (!m) return null;
  const num = m[1];
  const variantRaw = (m[2] || "").replace(/\s+/g, " ").trim();
  if (!variantRaw) return `iPhone ${num}`;
  return `iPhone ${num} ${variantRaw.replace(/\b\w/g, (c) => c.toUpperCase())}`;
}

function extractStorageGb(title) {
  const m = title.match(/\b(64|128|256|512|1024)\s*gb\b|\b(64|128|256|512|1024)\b/i);
  if (!m) return null;
  return Number(m[1] || m[2]);
}

function inferConditionProxy(titleLower) {
  if (/\bnew\b|\bbaru\b|preorder/i.test(titleLower)) return "new_or_preorder";
  if (/\bsecond\b|\bbekas\b|\bused\b/i.test(titleLower)) return "used";
  if (/\bmulus\b|like new|fullset|garansi/i.test(titleLower)) return "used_inferred";
  return "unknown";
}

function extractCity(tail) {
  const cityCandidates = [
    "Jakarta Pusat",
    "Jakarta Selatan",
    "Jakarta Barat",
    "Jakarta Timur",
    "Jakarta Utara",
    "Tangerang Selatan",
    "Tangerang",
    "Bekasi",
    "Surabaya",
    "Bandung",
    "Medan",
  ];
  for (const city of cityCandidates) {
    if (tail.toLowerCase().includes(city.toLowerCase())) return city;
  }
  return null;
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

function parseInput({ file, source_query, source_url, region_hint }) {
  const text = fs.readFileSync(file, "utf8");
  const regex = /\[!\[Image[^\n]*?\)\s+(.+?)\]\((https:\/\/www\.tokopedia\.com\/[^\)]+)\)/g;
  const rows = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    const line = m[1].replace(/\s+/g, " ").trim();
    const listing_url = m[2];
    const price_idr = parsePriceToIdr(line);
    if (!price_idr) continue;
    const idx = line.search(/Rp\s?[0-9.]+/i);
    const listing_title = line.slice(0, idx).trim();
    const tail = line.slice(idx).trim();

    const ratingMatch = tail.match(/\b([0-5](?:\.\d)?)\b/);
    const soldMatch = tail.match(/(\d+)\s+terjual/i);
    const model = extractModel(listing_title);
    const storage_gb = extractStorageGb(listing_title);
    const condition_proxy = inferConditionProxy(listing_title.toLowerCase());
    const city = extractCity(tail);

    const parseFlags = [];
    if (!model) parseFlags.push("missing_model");
    if (!storage_gb) parseFlags.push("missing_storage");

    rows.push({
      source_file: file,
      source: "tokopedia",
      source_query,
      source_url,
      collected_at: COLLECTION_DATE,
      listing_url,
      listing_title,
      model,
      storage_gb,
      condition_proxy,
      price_idr,
      rating: ratingMatch ? Number(ratingMatch[1]) : null,
      sold_count: soldMatch ? Number(soldMatch[1]) : null,
      city,
      region: city || region_hint,
      parse_flags: parseFlags.length ? parseFlags.join("|") : null,
    });
  }
  return rows;
}

function main() {
  ensureDir(OUTPUT_DIR);

  const rawRows = INPUTS.flatMap(parseInput);
  const byUrl = new Map();
  for (const row of rawRows) {
    if (!byUrl.has(row.listing_url)) byUrl.set(row.listing_url, row);
  }
  const dedupedRows = [...byUrl.values()];
  const smartphoneRows = dedupedRows.filter((r) => /^iPhone\s\d+/.test(r.model || ""));
  const mvpRows = smartphoneRows.filter(
    (r) => /^iPhone\s(1[0-6]|[7-9])/.test(r.model || "") && r.storage_gb !== null && r.condition_proxy !== "new_or_preorder"
  );

  const prices = smartphoneRows.map((r) => r.price_idr);
  const q1 = q(prices, 0.25);
  const q3 = q(prices, 0.75);
  const iqr = q3 - q1;
  const outlierLow = q1 - 1.5 * iqr;
  const outlierHigh = q3 + 1.5 * iqr;
  const outliers = smartphoneRows.filter((r) => r.price_idr < outlierLow || r.price_idr > outlierHigh);

  const missing = {
    model: smartphoneRows.filter((r) => !r.model).length,
    storage_gb: smartphoneRows.filter((r) => r.storage_gb === null).length,
    condition_proxy_unknown: smartphoneRows.filter((r) => r.condition_proxy === "unknown").length,
    city: smartphoneRows.filter((r) => !r.city).length,
    rating: smartphoneRows.filter((r) => r.rating === null).length,
    sold_count: smartphoneRows.filter((r) => r.sold_count === null).length,
  };

  const modelGroups = {};
  for (const row of smartphoneRows) {
    if (!modelGroups[row.model]) modelGroups[row.model] = [];
    modelGroups[row.model].push(row.price_idr);
  }
  const modelCohorts = Object.entries(modelGroups)
    .map(([model, modelPrices]) => {
      const n = modelPrices.length;
      return {
        model,
        listing_count: n,
        median_price_idr: median(modelPrices),
        confidence: n >= 10 ? "high" : n >= 5 ? "medium" : "low",
      };
    })
    .sort((a, b) => b.listing_count - a.listing_count);

  const profile = {
    collection_date: COLLECTION_DATE,
    source_files: INPUTS.map((i) => i.file),
    totals: {
      raw_rows: rawRows.length,
      deduped_rows: dedupedRows.length,
      smartphone_rows: smartphoneRows.length,
      mvp_subset_rows: mvpRows.length,
    },
    pricing: {
      min_price_idr: Math.min(...prices),
      median_price_idr: median(prices),
      max_price_idr: Math.max(...prices),
      iqr_outlier_bounds: {
        low: Math.round(outlierLow),
        high: Math.round(outlierHigh),
      },
      outlier_count: outliers.length,
    },
    missing,
    cohort_confidence: modelCohorts,
    outlier_examples: outliers.map((o) => ({
      model: o.model,
      price_idr: o.price_idr,
      listing_title: o.listing_title,
      listing_url: o.listing_url,
    })),
  };

  const commonHeaders = [
    "source_file",
    "source",
    "source_query",
    "source_url",
    "collected_at",
    "listing_url",
    "listing_title",
    "model",
    "storage_gb",
    "condition_proxy",
    "price_idr",
    "rating",
    "sold_count",
    "city",
    "region",
    "parse_flags",
  ];
  const mvpHeaders = [
    "model",
    "storage_gb",
    "condition_proxy",
    "price_idr",
    "source",
    "collected_at",
    "region",
    "city",
    "listing_title",
    "listing_url",
  ];

  fs.writeFileSync(path.join(OUTPUT_DIR, "tokopedia_2025_normalized.csv"), toCsv(smartphoneRows, commonHeaders));
  fs.writeFileSync(path.join(OUTPUT_DIR, "tokopedia_2025_mvp_subset.csv"), toCsv(mvpRows, mvpHeaders));
  fs.writeFileSync(path.join(OUTPUT_DIR, "tokopedia_2025_profile.json"), `${JSON.stringify(profile, null, 2)}\n`);

  const reportMd = [
    "# Tokopedia 2025 Dataset Intake Quality Baseline",
    "",
    `- Collection date: ${COLLECTION_DATE}`,
    `- Scope: iPhone smartphone listings only (Indonesia; Tokopedia public listing pages)`,
    `- Source files used: ${INPUTS.map((x) => x.file).join(", ")}`,
    "",
    "## Coverage",
    "",
    `- Raw parsed rows: ${profile.totals.raw_rows}`,
    `- Deduped rows (listing URL): ${profile.totals.deduped_rows}`,
    `- Smartphone rows retained: ${profile.totals.smartphone_rows}`,
    `- MVP-ready subset rows: ${profile.totals.mvp_subset_rows}`,
    "",
    "## Missing-Value Profile",
    "",
    `- model missing: ${missing.model}`,
    `- storage_gb missing: ${missing.storage_gb}`,
    `- condition_proxy unknown: ${missing.condition_proxy_unknown}`,
    `- city missing: ${missing.city}`,
    `- rating missing: ${missing.rating}`,
    `- sold_count missing: ${missing.sold_count}`,
    "",
    "## Duplicate Profile",
    "",
    `- Duplicate count removed by listing_url key: ${rawRows.length - dedupedRows.length}`,
    `- Note: tmp_tok_retry.txt is a byte-identical duplicate of tmp_tokopedia_p2.txt and was excluded from intake source list.`,
    "",
    "## Outlier Notes",
    "",
    `- Price IQR bounds: Rp${Math.round(outlierLow).toLocaleString("id-ID")} to Rp${Math.round(outlierHigh).toLocaleString("id-ID")}`,
    `- Outlier rows flagged: ${outliers.length}`,
    "",
    "## Cohort Confidence",
    "",
    ...modelCohorts.map(
      (c) =>
        `- ${c.model}: n=${c.listing_count}, median=Rp${c.median_price_idr.toLocaleString("id-ID")}, confidence=${c.confidence}`
    ),
    "",
    "## Key Risks",
    "",
    "- Narrow capture window (page-2 snapshots only) creates sparse cohorts for most models.",
    "- Condition signal is text-derived proxy, not verified grading standard.",
    "- Presence of new/preorder listings in scrape requires filtering for used-price model training.",
  ].join("\n");

  fs.writeFileSync(path.join(OUTPUT_DIR, "tokopedia_2025_quality_report.md"), `${reportMd}\n`);

  console.log(
    JSON.stringify(
      {
        output_dir: OUTPUT_DIR,
        files: [
          "tokopedia_2025_normalized.csv",
          "tokopedia_2025_mvp_subset.csv",
          "tokopedia_2025_profile.json",
          "tokopedia_2025_quality_report.md",
        ],
        totals: profile.totals,
      },
      null,
      2
    )
  );
}

main();
