export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ModelDataNotAvailableError extends HttpError {
  constructor(message = "MODEL_DATA_NOT_AVAILABLE") {
    super(422, "MODEL_DATA_NOT_AVAILABLE", message);
    this.name = "ModelDataNotAvailableError";
  }
}
