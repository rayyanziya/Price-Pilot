import express, { type NextFunction, type Request, type Response } from "express";

import { HttpError, ModelDataNotAvailableError } from "./errors";
import { getDailyQuoteKpis } from "./quoteEvents";
import { createQuoteRoute, type CreateQuoteRouteOptions, type QuoteService } from "./quoteRoute";

type CreateAppOptions = CreateQuoteRouteOptions;

function isMalformedJsonError(error: unknown): error is SyntaxError & { status?: number; body?: unknown } {
  const candidate = error as { status?: unknown; body?: unknown } | null;

  return (
    error instanceof SyntaxError &&
    typeof candidate?.status === "number" &&
    candidate.status === 400 &&
    "body" in (candidate ?? {})
  );
}

export function createApp(quoteService: QuoteService, options: CreateAppOptions = {}): express.Express {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/api/v1/internal/quote-kpi/daily", async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const days = await getDailyQuoteKpis();
      res.status(200).json({ days });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/v1/price/quote", createQuoteRoute(quoteService, options));

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (isMalformedJsonError(error)) {
      res.status(400).json({
        error: {
          code: "INVALID_REQUEST",
          message: "Invalid request body",
        },
      });
      return;
    }

    if (error instanceof ModelDataNotAvailableError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }

    if (error instanceof HttpError) {
      res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
      return;
    }

    console.error(error);
    res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
    });
  });

  return app;
}
