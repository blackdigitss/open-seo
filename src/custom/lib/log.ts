export type Logger = (message: string, data?: Record<string, unknown>) => void;

export function createLogger(scope: string): Logger {
  return (message, data) => {
    if (data) {
      console.log(`[custom:${scope}] ${message}`, data);
    } else {
      console.log(`[custom:${scope}] ${message}`);
    }
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
