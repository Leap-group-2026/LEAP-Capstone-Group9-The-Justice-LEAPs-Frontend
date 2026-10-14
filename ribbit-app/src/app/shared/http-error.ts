import { HttpErrorResponse } from '@angular/common/http';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';


export function describeHttpError(error: unknown, fallback = GENERIC_MESSAGE): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (typeof error.error === 'string' && error.error.trim()) {
    return error.error;
  }
  if (error.error && typeof error.error.fieldMessage === 'string') {
    return error.error.fieldMessage;
  }
  return fallback;
}
