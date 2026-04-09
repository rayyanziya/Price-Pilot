export type ConditionGrade = "A" | "B" | "C" | "D";

export interface PriceQuoteRequest {
  brand: string;
  model: string;
  storage_gb: number;
  condition_grade: ConditionGrade;
  battery_health_pct: number;
  has_box: boolean;
}

export interface PriceQuoteResponse {
  currency: "IDR";
  low_price: number;
  average_price: number;
  high_price: number;
  recommended_price: number;
  confidence: number;
  fallback_used: boolean;
  explanations: string[];
}

export interface MarketPriceEntry {
  id?: number;
  country: string;
  brand: string;
  model: string;
  storage_gb: number;
  condition_grade: ConditionGrade;
  listing_price_idr: number;
  battery_health_pct: number;
  has_box: boolean;
  source: string;
  collected_at: string;
  source_url?: string | null;
}

export interface QuoteRepository {
  resolveCanonicalModel(brand: string, model: string): Promise<string | null>;
  findExactMatches(brand: string, model: string, storageGb: number): Promise<MarketPriceEntry[]>;
  findModelFamilyMatches(brand: string, model: string): Promise<MarketPriceEntry[]>;
}
