import { HttpBackend, HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { readRefreshToken, refreshSession } from '../interceptors/auth.interceptor';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.hasValidAccessToken()) {
    return true;
  }

  if (readRefreshToken()) {
    return refreshSession(new HttpClient(inject(HttpBackend))).pipe(
      map(newToken => {
        if (newToken) {
          return true;
        }
        authService.clearSession();
        return router.createUrlTree(['/login']);
      }),
      catchError(() => of(router.createUrlTree(['/login'])))
    );
  }

  authService.clearSession();
  return router.createUrlTree(['/login']);
};
