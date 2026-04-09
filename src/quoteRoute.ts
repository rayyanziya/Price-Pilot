import { randomUUID } from "node:crypto";

import type { NextFunction, Request, RequestHandler, Response } from "express";

import { HttpError, ModelDataNotAvailableError } from "./errors";
import { normalizeBrand, normalizeModelText } from "./normalization";
import { PricingEngine } from "./pricingEngine";
import { recordQuoteEvent, type QuoteEvent, type QuoteEventRecorder } from "./quoteEvents";
import type { ConditionGrade } from "./types";
import { parseQuoteRequest } from "./validation";

export interface QuoteService {
  quote: PricingEngine["quote"];
}

export interface CreateQuoteRouteOptions {
  quoteEventRecorder?: QuoteEventRecorder;
}

function isConditionGrade(value: unknown): value is ConditionGrade {
  return value === "A" || value === "B" || value === "C" || value === "D";
}

function buildRequestId(req: Request): string {
  const requestIdHeader = req.header("x-request-id");
  return requestIdHeader && requestIdHeader.trim().length > 0 ? requestIdHeader.trim() : randomUUID();
}

function getLatencyMs(startedAt: bigint): number {
  return Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
}

function serializeErrorDetail(details: unknown): string | null {
  if (details === undefined) {
    return null;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

function buildEventRequestShape(input: unknown): Omit<QuoteEvent, "request_id" | "status" | "latency_ms"> {
  const candidate = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  return {
    brand:
      typeof candidate.brand === "string" && candidate.brand.trim().length > 0
        ? normalizeBrand(candidate.brand)
        : "INVALID_BRAND",
    model:
      typeof candidate.model === "string" && candidate.model.trim().length > 0
        ? normalizeModelText(candidate.model)
        : "INVALID_MODEL",
    storage_gb:
      typeof candidate.storage_gb === "number" &&
      Number.isInteger(candidate.storage_gb) &&
      candidate.storage_gb >= 0
        ? candidate.storage_gb
        : 0,
    condition_grade: isConditionGrade(candidate.condition_grade) ? candidate.condition_grade : "D",
    battery_health_pct:
      typeof candidate.battery_health_pct === "number" && Number.isFinite(candidate.battery_health_pct)
        ? Math.min(Math.max(candidate.battery_health_pct, 0), 100)
        : 0,
    has_box: typeof candidate.has_box === "boolean" ? candidate.has_box : false,
    fallback_used: null,
    recommended_price: null,
    error_code: null,
    error_detail: null,
  };
}

async function persistQuoteEvent(quoteEventRecorder: QuoteEventRecorder, event: QuoteEvent): Promise<void> {
  try {
    await quoteEventRecorder(event);
  } catch (error) {
    console.error("Failed to record quote event", error);
  }
}

export function createQuoteRoute(
  quoteService: QuoteService,
  options: CreateQuoteRouteOptions = {},
): RequestHandler {
  const quoteEventRecorder = options.quoteEventRecorder ?? recordQuoteEvent;

  return async (req: Request, res: Response, next: NextFunction) => {
    const requestId = buildRequestId(req);
    const startedAt = process.hrtime.bigint();
    let eventRequestShape = buildEventRequestShape(req.body);

    try {
      const quoteRequest = parseQuoteRequest(req.body);
      eventRequestShape = {
        ...eventRequestShape,
        ...quoteRequest,
      };
      const response = await quoteService.quote(quoteRequest);

      await persistQuoteEvent(quoteEventRecorder, {
        ...eventRequestShape,
        request_id: requestId,
        status: "success",
        latency_ms: getLatencyMs(startedAt),
        fallback_used: response.fallback_used,
        recommended_price: response.recommended_price,
      });

      res.status(200).json(response);
    } catch (error) {
      const latencyMs = getLatencyMs(startedAt);

      if (error instanceof ModelDataNotAvailableError) {
        await persistQuoteEvent(quoteEventRecorder, {
          ...eventRequestShape,
          request_id: requestId,
          status: "model_data_not_available",
          latency_ms: latencyMs,
          error_code: error.code,
          error_detail: error.message,
        });
      } else if (error instanceof HttpError) {
        await persistQuoteEvent(quoteEventRecorder, {
          ...eventRequestShape,
          request_id: requestId,
          status: "validation_error",
          latency_ms: latencyMs,
          error_code: error.code,
          error_detail: serializeErrorDetail(error.details) ?? error.message,
        });
      } else {
        await persistQuoteEvent(quoteEventRecorder, {
          ...eventRequestShape,
          request_id: requestId,
          status: "internal_error",
          latency_ms: latencyMs,
          error_code: "INTERNAL_SERVER_ERROR",
          error_detail: error instanceof Error ? error.message : "Unknown error",
        });
      }

      next(error);
    }
  };
}
