import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown, c: Context) {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          status: 422,
          code: "VALIDATION_ERROR",
          message: "The request is invalid.",
          fieldErrors: error.flatten().fieldErrors,
        },
      },
      422,
    );
  }
  if (error instanceof ApiError) {
    return c.json(
      {
        error: {
          status: error.status,
          code: error.code,
          message: error.message,
          ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
        },
      },
      error.status,
    );
  }
  console.error(
    JSON.stringify({
      level: "error",
      event: "unhandled_request_error",
      requestId: c.res.headers.get("X-Request-Id"),
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return c.json(
    {
      error: {
        status: 500,
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    },
    500,
  );
}
