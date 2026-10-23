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
    sessionStorage.clear();
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
    sessionStorage.setItem('token', validToken);

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
    sessionStorage.setItem('token', validToken);

    const error = failWith401(`${environment.springUrl}/instruments/NVDA`);

    expect(error?.status).toBe(401);
    expect(sessionStorage.getItem('token')).toBe(validToken);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('logs out and redirects when the token has expired', () => {
    sessionStorage.setItem('token', expiredToken);

    const error = failWith401(`${environment.springUrl}/user/accounts`);

    expect(error?.status).toBe(401);
    expect(sessionStorage.getItem('token')).toBeNull();
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

describe('authInterceptor with BR-03 sessions', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  const accounts = `${environment.springUrl}/user/accounts`;
  const refreshUrl = `${environment.authUrl}/auth/refresh`;
  // Lets the Web Lock (when the browser has one) and promise hops run before asserting
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

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
    sessionStorage.clear();
    try {
      controller.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  const springError = (code: string, status = 401) =>
    ({ body: { error: code, message: 'x' }, opts: { status, statusText: 'Error' } });

  it('clears the session instead of refreshing after the access token expires', async () => {
    sessionStorage.setItem('token', validToken);
    sessionStorage.setItem('refreshToken', 'refresh-1');
    let error: HttpErrorResponse | undefined;
    http.get(accounts).subscribe({ error: e => (error = e) });

    const expired = springError('token_expired');
    controller.expectOne(accounts).flush(expired.body, expired.opts);
    await settle();

    expect(error?.status).toBe(401);
    expect(controller.match(refreshUrl)).toHaveLength(0);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('logs out without refreshing when the JWT refresh token is already expired', async () => {
    const expiredRefreshToken = makeToken({ sub: '42', exp: NOW_S - 60 });
    sessionStorage.setItem('token', validToken);
    sessionStorage.setItem('refreshToken', expiredRefreshToken);
    http.get(accounts).subscribe({ error: () => undefined });

    const expired = springError('token_expired');
    controller.expectOne(accounts).flush(expired.body, expired.opts);
    await settle();

    expect(controller.match(refreshUrl)).toHaveLength(0);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it.each(['session_revoked', 'session_idle', 'session_expired', 'session_invalid', 'token_invalid'])(
    'logs out at once on %s, even though the JWT has not expired', code => {
      sessionStorage.setItem('token', validToken);
      sessionStorage.setItem('refreshToken', 'refresh-1');
      http.get(accounts).subscribe({ error: () => undefined });

      const ended = springError(code);
      controller.expectOne(accounts).flush(ended.body, ended.opts);

      expect(sessionStorage.getItem('token')).toBeNull();
      expect(sessionStorage.getItem('refreshToken')).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

  it('clears profile and account data and the logged-in state when the server ends the session', async () => {
    const { AuthService } = await import('../services/auth.service');
    const sessionData = ['name', 'email', 'address', 'userEmail', 'accountId', 'balance',
      'tradeType', 'portfolioSize', 'createdAt', 'accountActive', 'adminRole'];
    sessionStorage.setItem('token', validToken);
    sessionStorage.setItem('refreshToken', 'refresh-1');
    for (const key of sessionData) {
      localStorage.setItem(key, `value-${key}`);
    }
    localStorage.setItem('theme', 'dark');
    const auth = TestBed.inject(AuthService);
    expect(auth.isLoggedIn().isLoggedIn).toBe(true);

    http.get(accounts).subscribe({ error: () => undefined });
    const ended = springError('session_revoked');
    controller.expectOne(accounts).flush(ended.body, ended.opts);

    for (const key of ['token', 'refreshToken', ...sessionData]) {
      expect(localStorage.getItem(key), key).toBeNull();
    }
    // Not session data: survives.
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(auth.isLoggedIn().isLoggedIn).toBe(false);
    expect(auth.getUserProfile().name).toBe('');
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('reads the code from a text response too', () => {
    sessionStorage.setItem('token', validToken);
    http.get(accounts, { responseType: 'text' }).subscribe({ error: () => undefined });

    controller.expectOne(accounts).flush(JSON.stringify({ error: 'session_revoked', message: 'x' }),
      { status: 401, statusText: 'Unauthorized' });

    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('never ends the session on 503 session_store_unavailable or 403', () => {
    sessionStorage.setItem('token', validToken);
    http.get(`${accounts}?503`).subscribe({ error: () => undefined });
    http.get(`${accounts}?403`).subscribe({ error: () => undefined });

    controller.expectOne(`${accounts}?503`).flush({ error: 'session_store_unavailable' }, { status: 503, statusText: 'Unavailable' });
    controller.expectOne(`${accounts}?403`).flush(null, { status: 403, statusText: 'Forbidden' });

    expect(sessionStorage.getItem('token')).toBe(validToken);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('AuthService.logout', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('ends the session at the server and clears both tokens', async () => {
    const { AuthService } = await import('../services/auth.service');
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const controller = TestBed.inject(HttpTestingController);
    sessionStorage.setItem('token', validToken);
    sessionStorage.setItem('refreshToken', 'refresh-1');
    localStorage.setItem('email', 'jo@example.com');
    localStorage.setItem('balance', '1000');

    TestBed.inject(AuthService).logout();

    const logout = controller.expectOne(`${environment.authUrl}/auth/logout`);
    expect(logout.request.method).toBe('POST');
    expect(logout.request.headers.get('Authorization')).toBe(`Bearer ${validToken}`);
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('email')).toBeNull();
    expect(localStorage.getItem('balance')).toBeNull();
    logout.flush({ message: 'Logout successful' });
    controller.verify();
  });
});
