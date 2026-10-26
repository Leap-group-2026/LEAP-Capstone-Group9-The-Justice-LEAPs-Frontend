import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// Keeps signed-in users off /login and /admin-login: they go to their own home page instead,
// so a second login can't happen on top of an existing session. Log out to switch accounts.
export const guestGuard: CanActivateFn = () => {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return true;   // login pages are prerendered; the browser decides after loading
  }

  const authService = inject(AuthService);
  if (!authService.hasValidAccessToken()) {
    return true;
  }

  const home = authService.isReporter() ? '/reporter' : authService.isAdmin() ? '/admin' : '/dashboard';
  return inject(Router).createUrlTree([home]);
};
