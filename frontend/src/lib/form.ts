import { ApiError } from './api';

export function fieldErrorsFrom(error: unknown, fields: string[]) {
  const next: Record<string, string> = {};
  if (!(error instanceof ApiError)) {
    return next;
  }
  for (const field of fields) {
    const message = error.fieldMessage(field);
    if (message) {
      next[field] = message;
    }
  }
  return next;
}
