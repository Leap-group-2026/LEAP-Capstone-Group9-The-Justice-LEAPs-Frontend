import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'token';


export function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {

  }
}

// True when the JWT's own `exp` claim has passed, or the token can't be read.
export function isTokenExpired(token: string, nowMs = Date.now()): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp !== 'number' || payload.exp * 1000 <= nowMs;
  } catch {
    return true;
  }
}

function needsToken(url: string): boolean {
  return (
    url.startsWith(environment.springUrl) ||
    url === `${environment.authUrl}/auth/logout` ||
    url === `${environment.authUrl}/auth/verify`
  );
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = readToken();
  const request =
    token && needsToken(req.url)
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  return next(request).pipe(
    catchError((error: unknown) => {

      // Only end the session when the token itself is gone or expired. A 401 from
      // one endpoint while the token is still valid is left for the page to handle,
      // so a single misbehaving endpoint can't log the user out.
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        req.url !== `${environment.authUrl}/auth/login` &&
        (!token || isTokenExpired(token))
      ) {
        clearToken();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
