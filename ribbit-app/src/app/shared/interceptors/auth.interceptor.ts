import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, defer, finalize, firstValueFrom, from, map, of, shareReplay, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

const TOKEN_KEY = 'token';
const REFRESH_TOKEN_KEY = 'refreshToken';

const SESSION_ENDED = new Set([
  'unauthenticated',
  'token_invalid',
  'session_invalid',
  'session_revoked',
  'session_expired',
  'session_idle'
]);

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function readToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function readRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeTokens(accessToken: string, refreshToken?: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) {
      sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    }
  } catch {

  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {

  }
}

// The JWT's own `exp` as epoch milliseconds, or null when the token can't be read.
export function tokenExpiresAt(token: string): number | null {
  try {
    const encodedPayload = token
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^"|"$/g, '')
      .split('.')[1];
    const normalizedPayload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + (4 - normalizedPayload.length % 4) % 4,
      '='
    );
    const payload = JSON.parse(atob(paddedPayload));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// True when the JWT's own `exp` claim has passed, or the token can't be read.
export function isTokenExpired(token: string, nowMs = Date.now()): boolean {
  const expiresAt = tokenExpiresAt(token);
  return expiresAt === null || expiresAt <= nowMs;
}

let refreshInFlight: Observable<string | null> | null = null;


export function refreshSession(http: HttpClient): Observable<string | null> {
  if (!readRefreshToken()) {
    return of(null);
  }
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const staleToken = readToken();
  const attempt = (): Observable<string | null> => {
    const current = readToken();
    if (current && current !== staleToken && !isTokenExpired(current)) {
      return of(current);
    }
    const refreshToken = readRefreshToken();
    if (!refreshToken) {
      return of(null);
    }
    return http.post<TokenPair>(`${environment.authUrl}/auth/refresh`, { refreshToken }).pipe(
      map(tokens => {
        storeTokens(tokens.accessToken, tokens.refreshToken);
        return tokens.accessToken;
      }),
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 401 ? of(null) : throwError(() => error)
      )
    );
  };

  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  const run$ = locks
    ? from(locks.request('ribbit-token-refresh', () => firstValueFrom(attempt())))
    : defer(attempt);

  refreshInFlight = run$.pipe(
    finalize(() => (refreshInFlight = null)),
    shareReplay(1)
  );
  return refreshInFlight;
}

function needsToken(url: string): boolean {
  return (
    url.startsWith(environment.springUrl) ||
    url === `${environment.authUrl}/auth/logout` ||
    url === `${environment.authUrl}/auth/verify`
  );
}


function errorCode(error: HttpErrorResponse): string | undefined {
  let body: unknown = error.error;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return undefined;
    }
  }
  const code = (body as { error?: unknown } | null)?.error;
  return typeof code === 'string' ? code : undefined;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const authService = inject(AuthService);
  // Bypasses this interceptor, so the refresh call itself is never intercepted
  const refreshHttp = new HttpClient(inject(HttpBackend));
  const token = readToken();

  const send = (accessToken: string | null) =>
    next(
      accessToken && needsToken(req.url)
        ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
        : req
    );

  // Clears the tokens, profile and account data, and the logged-in state the layout reads
  const endSession = () => {
    authService.clearSession();
    router.navigate(['/login']);
  };

  return send(token).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !needsToken(req.url)) {
        return throwError(() => error);
      }

      const code = errorCode(error);
      const accessTokenExpired = code === 'token_expired' || (!code && (!token || isTokenExpired(token)));

      if (accessTokenExpired) {
        return refreshSession(refreshHttp).pipe(
          catchError(() => throwError(() => error)),
          switchMap(newToken => {
            if (!newToken) {
              endSession();
              return throwError(() => error);
            }
            return send(newToken);
          })
        );
      }

      if (code && SESSION_ENDED.has(code)) {
        endSession();
      }
      return throwError(() => error);
    })
  );
};
