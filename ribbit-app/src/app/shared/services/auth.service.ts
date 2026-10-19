import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { clearToken, readToken } from '../interceptors/auth.interceptor';

export interface StoredUser {
  name: string;
  email: string;
  address: string;
  initials: string;
  accountEnding: string;
}


const SESSION_DATA_KEYS = [
  'name', 'email', 'address', 'userEmail', 'accountId', 'balance',
  'tradeType', 'portfolioSize', 'createdAt', 'accountActive'
];

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

  private authState = signal<AuthState>({
    isLoggedIn: this.hasStoredSession(),
    user: this.readStoredAuthUser()
  });

  private readonly storedUser = signal<StoredUser>(this.readStoredUser());

  readonly isLoggedIn = this.authState.asReadonly();

  login(email: string, name = ''): void {
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
    this.clearSession();
  }


  clearSession(): void {
    clearToken();
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

    const token = window.localStorage.getItem('token');
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
    return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('token'));
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
    if (typeof window === 'undefined') {
      return false;
    }

    const token = window.localStorage.getItem('token');
    if (!token) {
      return false;
    }

    try {
      const payload = JSON.parse(this.decodeTokenPayload(token)) as { role?: string; roles?: string[] };
      const roles = [payload.role, ...(payload.roles ?? [])]
        .filter((role): role is string => !!role)
        .map(role => role.toLowerCase().replace(/[_-]/g, ' '));

      return roles.some(role => ['admin', 'super admin', 'superadmin'].includes(role));
    } catch {
      return false;
    }
  }

  private decodeTokenPayload(token: string): string {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    return decodeURIComponent(
      atob(normalized)
        .split('')
        .map(character => `%${`00${character.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
  }

}
