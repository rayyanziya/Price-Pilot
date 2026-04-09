import type { MarketPriceEntry } from "../src/types";

const baseDate = new Date("2026-04-07T12:00:00Z").toISOString();

export function buildSeedEntries(): MarketPriceEntry[] {
  return [
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "A", listing_price_idr: 7249000, battery_health_pct: 93, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 7099000, battery_health_pct: 89, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 6999000, battery_health_pct: 87, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "C", listing_price_idr: 6699000, battery_health_pct: 82, has_box: false, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 128, condition_grade: "B", listing_price_idr: 7149000, battery_health_pct: 88, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 256, condition_grade: "A", listing_price_idr: 8099000, battery_health_pct: 92, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 256, condition_grade: "B", listing_price_idr: 7899000, battery_health_pct: 87, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 13", storage_gb: 256, condition_grade: "B", listing_price_idr: 7999000, battery_health_pct: 86, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 12", storage_gb: 128, condition_grade: "B", listing_price_idr: 5899000, battery_health_pct: 85, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Apple", model: "iPhone 12", storage_gb: 128, condition_grade: "C", listing_price_idr: 5599000, battery_health_pct: 80, has_box: false, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Samsung", model: "Galaxy S23", storage_gb: 128, condition_grade: "A", listing_price_idr: 8899000, battery_health_pct: 95, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Samsung", model: "Galaxy S23", storage_gb: 128, condition_grade: "B", listing_price_idr: 8599000, battery_health_pct: 90, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Samsung", model: "Galaxy S23", storage_gb: 128, condition_grade: "B", listing_price_idr: 8499000, battery_health_pct: 88, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Samsung", model: "Galaxy S23", storage_gb: 128, condition_grade: "C", listing_price_idr: 7999000, battery_health_pct: 83, has_box: false, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Samsung", model: "Galaxy S23", storage_gb: 128, condition_grade: "B", listing_price_idr: 8699000, battery_health_pct: 89, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Xiaomi", model: "13T", storage_gb: 256, condition_grade: "A", listing_price_idr: 6499000, battery_health_pct: 92, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Xiaomi", model: "13T", storage_gb: 256, condition_grade: "B", listing_price_idr: 6299000, battery_health_pct: 87, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Xiaomi", model: "13T", storage_gb: 256, condition_grade: "B", listing_price_idr: 6199000, battery_health_pct: 86, has_box: true, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Xiaomi", model: "13T", storage_gb: 256, condition_grade: "C", listing_price_idr: 5899000, battery_health_pct: 82, has_box: false, source: "manual_seed", collected_at: baseDate },
    { country: "ID", brand: "Xiaomi", model: "13T", storage_gb: 256, condition_grade: "B", listing_price_idr: 6249000, battery_health_pct: 88, has_box: true, source: "manual_seed", collected_at: baseDate },
  ];
}
