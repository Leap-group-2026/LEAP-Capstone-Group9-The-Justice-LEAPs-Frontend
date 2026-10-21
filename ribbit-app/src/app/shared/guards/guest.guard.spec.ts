import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { guestGuard } from './guest.guard';

function token(role: string, expiresInS = 1800): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: '1', role, exp: Math.floor(Date.now() / 1000) + expiresInS })}.sig`;
}

describe('guestGuard', () => {
  function run(platform: 'browser' | 'server' = 'browser'): boolean | UrlTree {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: platform }
      ]
    });
    return TestBed.runInInjectionContext(() =>
      guestGuard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)
    ) as boolean | UrlTree;
  }

  const target = (result: boolean | UrlTree) =>
    result instanceof UrlTree ? TestBed.inject(Router).serializeUrl(result) : result;

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('lets signed-out visitors open the login page', () => {
    expect(run()).toBe(true);
  });

  it('lets a visitor with an expired token log in again', () => {
    localStorage.setItem('token', token('client', -60));
    expect(run()).toBe(true);
  });

  it('sends a signed-in client to the dashboard', () => {
    localStorage.setItem('token', token('client'));
    expect(target(run())).toBe('/dashboard');
  });

  it('sends a signed-in admin to the admin page', () => {
    localStorage.setItem('token', token('admin'));
    localStorage.setItem('adminRole', 'admin');
    expect(target(run())).toBe('/admin');
  });

  it('sends a signed-in reporter to the reporter page', () => {
    localStorage.setItem('token', token('admin'));
    localStorage.setItem('adminRole', 'analyst');
    expect(target(run())).toBe('/reporter');
  });

  it('allows the page while prerendering', () => {
    localStorage.setItem('token', token('client'));
    expect(run('server')).toBe(true);
  });

  it('is attached to both login pages', () => {
    for (const path of ['login', 'admin-login']) {
      const guards = routes.find(route => route.path === path)?.canActivate ?? [];
      expect(guards.includes(guestGuard), `${path} has guestGuard`).toBe(true);
    }
  });
});
