import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

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

  authService.logout();
  return router.createUrlTree(['/login']);
};