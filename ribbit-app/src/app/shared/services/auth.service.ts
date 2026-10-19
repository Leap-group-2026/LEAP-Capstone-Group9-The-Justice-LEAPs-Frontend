import { Injectable, signal } from '@angular/core';

export interface StoredUser {
  name: string;
  email: string;
  address: string;
  initials: string;
  accountEnding: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: { email: string; name: string } | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('adminRole');
    }

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

    const token = window.localStorage.getItem('token')
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

    const token = window.localStorage.getItem('token');
    const storedRole = window.localStorage.getItem('adminRole');
    if (!token && !storedRole) {
      return false;
    }

    try {
      const payload = token
        ? JSON.parse(this.decodeTokenPayload(token)) as { role?: string; roles?: string[] }
        : {};
      const roles = [storedRole, payload.role, ...(payload.roles ?? [])]
        .filter((role): role is string => !!role)
        .map(role => this.normalizeRole(role));

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
