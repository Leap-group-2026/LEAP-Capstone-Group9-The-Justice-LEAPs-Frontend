import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';


function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

describe('App', () => {
  function createApp() {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
    });
    return TestBed.createComponent(App);
  }

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('should create the app', () => {
    expect(createApp().componentInstance).toBeTruthy();
  });

  it('shows only the routed page, without the main layout, when signed out', async () => {
    const fixture = createApp();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-main-layout')).toBeNull();
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('wraps the routed page in the main layout when signed in', async () => {
    sessionStorage.setItem('token', makeToken({ sub: '42', role: 'client', exp: Math.floor(Date.now() / 1000) + 1800 }));
    const fixture = createApp();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('app-main-layout router-outlet')).not.toBeNull();
  });
});
