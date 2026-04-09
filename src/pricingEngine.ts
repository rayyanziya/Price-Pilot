import { ModelDataNotAvailableError } from "./errors";
import { normalizeBrand, normalizeModelText } from "./normalization";
import type {
  MarketPriceEntry,
  PriceQuoteRequest,
  PriceQuoteResponse,
  QuoteRepository,
} from "./types";

const CONDITION_MULTIPLIERS: Record<PriceQuoteRequest["condition_grade"], number> = {
  A: 1.0,
  B: 0.92,
  C: 0.82,
  D: 0.7,
};

function getBatteryMultiplier(batteryHealthPct: number): number {
  if (batteryHealthPct >= 90) return 1.0;
  if (batteryHealthPct >= 85) return 0.97;
  if (batteryHealthPct >= 80) return 0.93;
  if (batteryHealthPct >= 75) return 0.88;
  return 0.8;
}

function getBatteryLabel(batteryHealthPct: number): string {
  if (batteryHealthPct >= 90) return "90+";
  if (batteryHealthPct >= 85) return "85-89";
  if (batteryHealthPct >= 80) return "80-84";
  if (batteryHealthPct >= 75) return "75-79";
  return "<75";
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function roundCurrency(value: number): number {
  return Math.round(value);
}

function computeMedianAgeDays(entries: MarketPriceEntry[]): number {
  const ages = entries.map((entry) => {
    const ageMs = Date.now() - new Date(entry.collected_at).getTime();
    return ageMs / (1000 * 60 * 60 * 24);
  });
  return median(ages);
}

function computeVariancePct(entries: MarketPriceEntry[]): number {
  if (entries.length <= 1) {
    return 0;
  }

  const prices = entries.map((entry) => entry.listing_price_idr);
  const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const variance = prices.reduce((sum, price) => sum + (price - average) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  return (stdDev / average) * 100;
}

function groupByStorage(entries: MarketPriceEntry[]): Map<number, MarketPriceEntry[]> {
  const groups = new Map<number, MarketPriceEntry[]>();

  for (const entry of entries) {
    const group = groups.get(entry.storage_gb) ?? [];
    group.push(entry);
    groups.set(entry.storage_gb, group);
  }

  return groups;
}

function deriveStorageMultiplier(entries: MarketPriceEntry[], requestedStorageGb: number): {
  multiplier: number;
  explanation: string;
} {
  const groups = groupByStorage(entries);
  const requestedGroup = groups.get(requestedStorageGb);
  const storageKeys = [...groups.keys()].sort((left, right) => left - right);

  if (requestedGroup && requestedGroup.length > 0) {
    const requestedMedian = median(requestedGroup.map((entry) => entry.listing_price_idr));
    const familyMedian = median(entries.map((entry) => entry.listing_price_idr));
    return {
      multiplier: requestedMedian / familyMedian,
      explanation: `Storage ${requestedStorageGb}GB model-family fallback applied from observed median ratio`,
    };
  }

  if (storageKeys.length === 0) {
    return {
      multiplier: 1,
      explanation: `Storage ${requestedStorageGb}GB fallback used neutral multiplier`,
    };
  }

  const nearestStorage = storageKeys.reduce((closest, current) => {
    if (Math.abs(current - requestedStorageGb) < Math.abs(closest - requestedStorageGb)) {
      return current;
    }
    return closest;
  }, storageKeys[0]);
  const nearestGroup = groups.get(nearestStorage) ?? [];
  const nearestMedian = median(nearestGroup.map((entry) => entry.listing_price_idr));
  const familyMedian = median(entries.map((entry) => entry.listing_price_idr));

  return {
    multiplier: nearestMedian / familyMedian,
    explanation: `Storage ${requestedStorageGb}GB fallback mapped to nearest observed storage ${nearestStorage}GB`,
  };
}

function computeConfidence(
  entries: MarketPriceEntry[],
  exactSampleSize: number,
  fallbackUsed: boolean,
): number {
  let confidence = 0.5;

  if (exactSampleSize >= 10) confidence += 0.2;
  if (computeMedianAgeDays(entries) <= 14) confidence += 0.1;
  if (computeVariancePct(entries) < 12) confidence += 0.1;
  if (!fallbackUsed) confidence += 0.1;

  return Math.min(1, Number(confidence.toFixed(2)));
}

export class PricingEngine {
  constructor(private readonly repository: QuoteRepository) {}

  async quote(request: PriceQuoteRequest): Promise<PriceQuoteResponse> {
    const brand = normalizeBrand(request.brand);
    const canonicalModel =
      (await this.repository.resolveCanonicalModel(brand, request.model)) ?? normalizeModelText(request.model);

    const exactEntries = await this.repository.findExactMatches(brand, canonicalModel, request.storage_gb);
    let entriesForConfidence: MarketPriceEntry[] = exactEntries;
    let basePrice: number | null = null;
    const explanations: string[] = [];
    let fallbackUsed = false;

    if (exactEntries.length >= 5) {
      basePrice = median(exactEntries.map((entry) => entry.listing_price_idr));
      explanations.push(`Exact market sample used: ${exactEntries.length} listings`);
    } else {
      const familyEntries = await this.repository.findModelFamilyMatches(brand, canonicalModel);

      if (familyEntries.length >= 5) {
        const familyMedian = median(familyEntries.map((entry) => entry.listing_price_idr));
        const storageAdjustment = deriveStorageMultiplier(familyEntries, request.storage_gb);
        basePrice = familyMedian * storageAdjustment.multiplier;
        entriesForConfidence = familyEntries;
        fallbackUsed = true;
        explanations.push(
          `Fallback to model family sample used: ${familyEntries.length} listings`,
          storageAdjustment.explanation,
        );
      } else if (familyEntries.length > 0) {
        const latestSeedEntry = [...familyEntries].sort(
          (left, right) => new Date(right.collected_at).getTime() - new Date(left.collected_at).getTime(),
        )[0];
        const storageAdjustment = deriveStorageMultiplier(familyEntries, request.storage_gb);
        basePrice = latestSeedEntry.listing_price_idr * storageAdjustment.multiplier;
        entriesForConfidence = familyEntries;
        fallbackUsed = true;
        explanations.push(
          "Latest internal seed fallback used for model family",
          storageAdjustment.explanation,
        );
      }
    }

    if (!basePrice) {
      throw new ModelDataNotAvailableError();
    }

    const conditionMultiplier = CONDITION_MULTIPLIERS[request.condition_grade];
    const batteryMultiplier = getBatteryMultiplier(request.battery_health_pct);
    const boxMultiplier = request.has_box ? 1.0 : 0.97;
    const averagePrice = roundCurrency(basePrice * conditionMultiplier * batteryMultiplier * boxMultiplier);
    const confidence = computeConfidence(entriesForConfidence, exactEntries.length, fallbackUsed);
    const recommendedPrice =
      confidence >= 0.75 ? roundCurrency(averagePrice) : roundCurrency(averagePrice * 0.97);

    explanations.push(
      `Condition ${request.condition_grade} applied: ${Math.round((1 - conditionMultiplier) * 100)}% adjustment`,
      `Battery ${getBatteryLabel(request.battery_health_pct)} applied: ${Math.round(
        (1 - batteryMultiplier) * 100,
      )}% adjustment`,
      request.has_box ? "Box included: no discount applied" : "No box applied: 3% adjustment",
    );

    return {
      currency: "IDR",
      low_price: roundCurrency(averagePrice * 0.92),
      average_price: averagePrice,
      high_price: roundCurrency(averagePrice * 1.08),
      recommended_price: recommendedPrice,
      confidence,
      fallback_used: fallbackUsed,
      explanations,
    };
  }
}
