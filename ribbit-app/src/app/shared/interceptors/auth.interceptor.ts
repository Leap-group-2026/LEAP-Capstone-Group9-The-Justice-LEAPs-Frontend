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

      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        req.url !== `${environment.authUrl}/auth/login`
      ) {
        clearToken();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
