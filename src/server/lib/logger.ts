type SerializedError = {
  name: string;
  message: string;
  stack?: string;
};

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack
    };
  }

  return {
    name: "UnknownError",
    message: typeof error === "string" ? error : JSON.stringify(error)
  };
}

export function logServerError(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  const payload = {
    level: "error",
    context,
    error: serializeError(error),
    metadata,
    timestamp: new Date().toISOString()
  };

  console.error("[server]", payload);
}

export function logServerWarning(context: string, error: unknown, metadata?: Record<string, unknown>): void {
  const payload = {
    level: "warn",
    context,
    error: serializeError(error),
    metadata,
    timestamp: new Date().toISOString()
  };

  console.warn("[server]", payload);
}
