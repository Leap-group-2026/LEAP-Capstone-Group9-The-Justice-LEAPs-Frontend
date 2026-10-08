import { Injectable, signal } from '@angular/core';

export interface AuthState {
  isLoggedIn: boolean;
  user: { email: string; name: string } | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private authState = signal<AuthState>({
    isLoggedIn: false,
    user: null
  });

  readonly isLoggedIn = this.authState.asReadonly();

  login(email: string, name: string = 'John Trader'): void {
    this.authState.set({
      isLoggedIn: true,
      user: { email, name }
    });
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
}
