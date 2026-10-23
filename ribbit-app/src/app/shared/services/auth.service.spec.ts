import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

// Unsigned JWT; the app only reads the claims.
function tokenWithRole(role: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: '1', role, exp: Math.floor(Date.now() / 1000) + 1800 })}.sig`;
}

describe('AuthService roles', () => {
  function service(token: string | null, adminRole: string | null): AuthService {
    localStorage.clear();
    sessionStorage.clear();
    if (token) sessionStorage.setItem('token', token);
    if (adminRole) localStorage.setItem('adminRole', adminRole);
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return TestBed.inject(AuthService);
  }

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('a leftover adminRole never makes a client token an admin or reporter', () => {
    const auth = service(tokenWithRole('client'), 'admin');
    expect(auth.isAdmin()).toBe(false);
    expect(auth.isReporter()).toBe(false);

    TestBed.resetTestingModule();
    const reporterLeftover = service(tokenWithRole('client'), 'analyst');
    expect(reporterLeftover.isReporter()).toBe(false);
  });

  it('an adminRole without any token grants nothing', () => {
    const auth = service(null, 'admin');
    expect(auth.isAdmin()).toBe(false);
    expect(auth.isReporter()).toBe(false);
  });

  it('an admin token is an admin', () => {
    const auth = service(tokenWithRole('admin'), 'admin');
    expect(auth.isAdmin()).toBe(true);
    expect(auth.isReporter()).toBe(false);
  });

  it('the stored role narrows an admin token to reporter', () => {
    // The token says 'admin' for every admin login; the stored role tells reporters apart
    const auth = service(tokenWithRole('admin'), 'analyst');
    expect(auth.isReporter()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
  });

  it('an admin token with no stored role falls back to the token role', () => {
    const auth = service(tokenWithRole('admin'), null);
    expect(auth.isAdmin()).toBe(true);
  });
});
