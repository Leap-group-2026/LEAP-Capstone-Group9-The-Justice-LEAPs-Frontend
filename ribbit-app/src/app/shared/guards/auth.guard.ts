import { HttpBackend, HttpClient } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { readRefreshToken, refreshSession } from '../interceptors/auth.interceptor';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  // The browser validates the persisted token after SSR hydration.
  if (!isPlatformBrowser(platformId)) {
    return true;
  }

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
