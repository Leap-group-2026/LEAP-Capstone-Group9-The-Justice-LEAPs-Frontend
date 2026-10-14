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
    this.authState.set({
      isLoggedIn: false,
      user: null
    });
  }

  getUser() {
    return this.authState().user;
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

    return { name, email, address, initials, accountEnding: '4821' };
  }

}
