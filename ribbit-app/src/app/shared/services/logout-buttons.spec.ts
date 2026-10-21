import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectorRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { Account } from '../../pages/account/account';
import { Dashboard } from '../../pages/dashboard/dashboard';
import { Portfolio } from '../../pages/portfolio/portfolio';
import { MainLayout } from '../components/main-layout/main-layout';
import { AuthService } from './auth.service';

// Unsigned JWT; the app only reads the claims.
function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const token = makeToken({ sub: '42', role: 'client', exp: Math.floor(Date.now() / 1000) + 1800 });

// Every "Logout" button must end the session on the server and clear the browser.
// Regression: the Account page's button only navigated to /logout, which cleared nothing.
describe('Logout buttons', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', 'refresh-1');
    localStorage.setItem('email', 'jo@example.com');
    localStorage.setItem('balance', '1000');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        // These components are built directly here (only their button handlers are under test),
        // so stand in for the ChangeDetectorRef Angular would give a rendered component
        { provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined, detectChanges: () => undefined } }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  function expectLoggedOut(): void {
    const logout = http.expectOne(`${environment.authUrl}/auth/logout`);
    expect(logout.request.method).toBe('POST');
    expect(logout.request.headers.get('Authorization')).toBe(`Bearer ${token}`);
    logout.flush({});

    for (const key of ['token', 'refreshToken', 'email', 'balance']) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    expect(TestBed.inject(AuthService).isLoggedIn().isLoggedIn).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  }

  it('Account page', () => {
    TestBed.runInInjectionContext(() => new Account()).navigate('logout');
    expectLoggedOut();
  });

  it('Account page still navigates normally for other destinations', () => {
    TestBed.runInInjectionContext(() => new Account()).navigate('dashboard');
    http.expectNone(`${environment.authUrl}/auth/logout`);
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('sidebar', () => {
    TestBed.runInInjectionContext(() => new MainLayout()).navigate('logout');
    expectLoggedOut();
  });

  it('Dashboard', () => {
    TestBed.runInInjectionContext(() => new Dashboard()).navigate('logout');
    expectLoggedOut();
  });

  it('Portfolio', () => {
    TestBed.runInInjectionContext(() => new Portfolio()).navigate('logout');
    expectLoggedOut();
  });
});
