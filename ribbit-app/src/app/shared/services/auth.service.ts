import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { clearToken, readToken } from '../interceptors/auth.interceptor';
import { AccountContextService } from './account-context.service';

export interface StoredUser {
  name: string;
  email: string;
  address: string;
  initials: string;
  accountEnding: string;
}


// Everything stored for a signed-in user besides the tokens. adminRole is included because
// hasRole() trusts it even without a token, so it must not outlive the session.
const SESSION_DATA_KEYS = [
  'name', 'email', 'address', 'userEmail', 'accountId', 'balance',
  'tradeType', 'portfolioSize', 'createdAt', 'accountActive', 'adminRole'
];

// Roles an admin-login token can carry. A token with any other role (e.g. 'client') is never
// treated as an admin, whatever is stored in localStorage.
const ADMIN_FAMILY_ROLES = ['admin', 'super admin', 'superadmin', 'analyst', 'reporter', 'reporter/analyst'];

export interface AuthState {
  isLoggedIn: boolean;
  user: { email: string; name: string } | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Bypasses the interceptor: logout must not trigger a refresh or a redirect of its own
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly accountContext = inject(AccountContextService);

  private authState = signal<AuthState>({
    isLoggedIn: this.hasStoredSession(),
    user: this.readStoredAuthUser()
  });

  private readonly storedUser = signal<StoredUser>(this.readStoredUser());

  readonly isLoggedIn = this.authState.asReadonly();

  login(email: string, name = ''): void {
    // The account list belongs to the authenticated user, so discard any prior user's context.
    this.accountContext.clear();
    this.authState.set({
      isLoggedIn: true,
      user: { email, name }
    });
  }

  getUserProfile(): StoredUser {
    return this.storedUser();
  }

  setUserProfile(profile: Pick<StoredUser, 'name' | 'email' | 'address'>): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('name', profile.name);
      localStorage.setItem('email', profile.email);
      localStorage.setItem('address', profile.address);
    }

    this.storedUser.set(this.createStoredUser(profile.name, profile.email, profile.address));
  }


  logout(): void {
    const token = readToken();
    if (token) {
      this.http
        .post(`${environment.authUrl}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } })
        .subscribe({ error: () => undefined });
    }
    // Removes the token, the admin role and every other session key
    this.clearSession();
  }


  clearSession(): void {
    clearToken();
    this.accountContext.clear();
    if (typeof localStorage !== 'undefined') {
      for (const key of SESSION_DATA_KEYS) {
        localStorage.removeItem(key);
      }
    }
    this.storedUser.set(this.createStoredUser('', '', ''));

    this.authState.set({
      isLoggedIn: false,
      user: null
    });
  }

  getUser() {
    return this.authState().user;
  }

  hasValidAccessToken(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const token = window.sessionStorage.getItem('token')
      ?.trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^"|"$/g, '');
    if (!token) {
      return false;
    }

    try {
      const payload = JSON.parse(this.decodeTokenPayload(token)) as { exp?: number };
      return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000);
    } catch {
      return false;
    }
  }


  private readStoredUser(): StoredUser {
    const name = typeof localStorage === 'undefined' ? '' : localStorage.getItem('name') ?? '';
    const email = typeof localStorage === 'undefined' ? '' : localStorage.getItem('email') ?? '';
    const address = typeof localStorage === 'undefined' ? '' : localStorage.getItem('address') ?? '';

    return this.createStoredUser(name, email, address);
  }

  private hasStoredSession(): boolean {
    return typeof sessionStorage !== 'undefined' && Boolean(sessionStorage.getItem('token'));
  }

  private readStoredAuthUser(): AuthState['user'] {
    if (!this.hasStoredSession() || typeof localStorage === 'undefined') {
      return null;
    }

    return {
      email: localStorage.getItem('email') ?? '',
      name: localStorage.getItem('name') ?? ''
    };
  }

  private createStoredUser(name: string, email: string, address: string): StoredUser {
    const initials = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const accountId = typeof localStorage === 'undefined'
      ? ''
      : localStorage.getItem('accountId') ?? '';

    return {
      name,
      email,
      address,
      initials,
      accountEnding: name === 'Administrator' ? 'Admin' : accountId || '—'
    };
  }


  isAdmin(): boolean {
    return this.hasRole(['admin', 'super admin', 'superadmin']);
  }

  isReporter(): boolean {
    return this.hasRole(['reporter/analyst', 'reporter', 'analyst']);
  }

  setAdminRole(role: string): void {
    if (typeof localStorage !== 'undefined') {
      if (role) {
        localStorage.setItem('adminRole', this.normalizeRole(role));
      } else {
        localStorage.removeItem('adminRole');
      }
    }
  }

  private hasRole(expectedRoles: string[]): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    // No token, no role: a leftover adminRole alone grants nothing.
    const token = window.sessionStorage.getItem('token');
    if (!token) {
      return false;
    }

    try {
      const payload = JSON.parse(this.decodeTokenPayload(token)) as { role?: string; roles?: string[] };
      const tokenRoles = [payload.role, ...(payload.roles ?? [])]
        .filter((role): role is string => !!role)
        .map(role => this.normalizeRole(role));

      // The stored role only narrows an admin token down to admin or reporter (the token itself
      // says 'admin' for both); it can never turn a client token into an admin.
      const storedRole = window.localStorage.getItem('adminRole');
      const isAdminToken = tokenRoles.some(role => ADMIN_FAMILY_ROLES.includes(role));
      const roles = storedRole && isAdminToken ? [this.normalizeRole(storedRole)] : tokenRoles;

      return roles.some(role => expectedRoles.includes(role));
    } catch {
      return false;
    }
  }

  private normalizeRole(role: string): string {
    return role.toLowerCase().replace(/[_-]/g, ' ').trim();
  }

  private decodeTokenPayload(token: string): string {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(
      normalized.length + (4 - normalized.length % 4) % 4,
      '='
    );

    return decodeURIComponent(
      atob(padded)
        .split('')
        .map(character => `%${`00${character.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
  }

}
