import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { authInterceptor, isTokenExpired } from './auth.interceptor';

const NOW_S = Math.floor(Date.now() / 1000);

// Unsigned JWT with the given payload; the interceptor only reads the claims.
function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const validToken = makeToken({ sub: '42', role: 'client', exp: NOW_S + 1800 });
const expiredToken = makeToken({ sub: '42', role: 'client', exp: NOW_S - 60 });

describe('isTokenExpired', () => {
  it('reads the exp claim', () => {
    expect(isTokenExpired(validToken)).toBe(false);
    expect(isTokenExpired(expiredToken)).toBe(true);
  });

  it('treats unreadable tokens and tokens without exp as expired', () => {
    expect(isTokenExpired('not-a-jwt')).toBe(true);
    expect(isTokenExpired(makeToken({ sub: '42' }))).toBe(true);
  });
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    localStorage.clear();
    try {
      controller.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  function failWith401(url: string): HttpErrorResponse | undefined {
    let error: HttpErrorResponse | undefined;
    http.get(url).subscribe({ error: e => (error = e) });
    controller.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
    return error;
  }

  it('adds the bearer token to Spring requests but not to login', () => {
    localStorage.setItem('token', validToken);

    http.get(`${environment.springUrl}/user/accounts`).subscribe();
    http.post(`${environment.authUrl}/auth/login`, {}).subscribe();

    const spring = controller.expectOne(`${environment.springUrl}/user/accounts`);
    const login = controller.expectOne(`${environment.authUrl}/auth/login`);
    expect(spring.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    spring.flush([]);
    login.flush({});
  });

  it('keeps the session when one endpoint rejects a still-valid token', () => {
    localStorage.setItem('token', validToken);

    const error = failWith401(`${environment.springUrl}/instruments/NVDA`);

    expect(error?.status).toBe(401);
    expect(localStorage.getItem('token')).toBe(validToken);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('logs out and redirects when the token has expired', () => {
    localStorage.setItem('token', expiredToken);

    const error = failWith401(`${environment.springUrl}/user/accounts`);

    expect(error?.status).toBe(401);
    expect(localStorage.getItem('token')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('redirects on a 401 when there is no token at all', () => {
    failWith401(`${environment.springUrl}/user/accounts`);

    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not redirect when the login request itself returns 401', () => {
    let error: HttpErrorResponse | undefined;
    http.post(`${environment.authUrl}/auth/login`, {}).subscribe({ error: e => (error = e) });
    controller
      .expectOne(`${environment.authUrl}/auth/login`)
      .flush({ statusCode: 401, message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(error?.status).toBe(401);
    expect(navigate).not.toHaveBeenCalled();
  });
});
