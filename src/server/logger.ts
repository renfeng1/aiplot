import "server-only";

export function logInfo(message: string, context?: Record<string, unknown>) {
  console.info(`[aiplot] ${message}`, context ?? {});
}

export function logWarn(message: string, context?: Record<string, unknown>) {
  console.warn(`[aiplot] ${message}`, context ?? {});
}

export function logError(message: string, context?: Record<string, unknown>) {
  console.error(`[aiplot] ${message}`, context ?? {});
}
