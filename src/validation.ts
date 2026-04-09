import { z } from "zod";

import type { PriceQuoteRequest } from "./types";
import { HttpError } from "./errors";
import { normalizeBrand, normalizeModelText } from "./normalization";

export const quoteRequestSchema = z
  .object({
    brand: z.string().trim().min(1),
    model: z.string().trim().min(1),
    storage_gb: z.number().int().positive(),
    condition_grade: z.enum(["A", "B", "C", "D"]),
    battery_health_pct: z.number().min(0).max(100),
    has_box: z.boolean(),
  })
  .strict();

export function parseQuoteRequest(input: unknown): PriceQuoteRequest {
  const result = quoteRequestSchema.safeParse(input);

  if (!result.success) {
    throw new HttpError(400, "INVALID_REQUEST", "Invalid request body", result.error.flatten());
  }

  return {
    ...result.data,
    brand: normalizeBrand(result.data.brand),
    model: normalizeModelText(result.data.model),
  };
}
