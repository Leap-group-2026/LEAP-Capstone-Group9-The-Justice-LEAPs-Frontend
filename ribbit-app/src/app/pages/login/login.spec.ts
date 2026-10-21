import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../../shared/services/auth.service';
import { AccountContextService } from '../../shared/services/account-context.service';
import { Login } from './login';

const SPRING = environment.springUrl;

// Unsigned JWT; the app only reads the claims.
function makeToken(payload: object): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const token = makeToken({ sub: '42', role: 'client', exp: Math.floor(Date.now() / 1000) + 1800 });

describe('Login', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
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

  // Regression: the layout reads isLoggedIn, so it must be true by the time the first page opens.
  it('marks the user as logged in before navigating to the dashboard', () => {
    const auth = TestBed.inject(AuthService);
    const accountContext = TestBed.inject(AccountContextService);
    accountContext.accounts.set([{ accountId: 99, userId: 1, balance: 0, portfolioSize: '', tradeType: '', createdAt: '', accountActive: true, accountFrozen: false }]);
    accountContext.selectedAccount.set(accountContext.accounts()[0]);
    expect(auth.isLoggedIn().isLoggedIn).toBe(false);

    let loggedInWhenNavigating: boolean | undefined;
    navigate.mockImplementation(() => {
      loggedInWhenNavigating = auth.isLoggedIn().isLoggedIn;
      return Promise.resolve(true);
    });

    const login = TestBed.runInInjectionContext(() => new Login());
    login.form.setValue({ email: 'jo@example.com', password: 'secret', rememberEmail: true });
    login.submit();

    http.expectOne(`${environment.authUrl}/auth/login`).flush({ accessToken: token, refreshToken: 'refresh-1' });
    http.expectOne(`${SPRING}/user`).flush({ name: 'Jo Client', email: 'jo@example.com', address: '1 Test St' });
    http.expectOne(`${SPRING}/user/accounts`).flush([{ accountId: 3 }]);
    http.expectOne(`${SPRING}/accounts/3`).flush({
      accountId: 40, balance: 1000, portfolio_size: 'BALANCED', trade_type: 'Passive',
      created_at: '2024-09-01T10:15:00', account_active: true
    });

    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(loggedInWhenNavigating).toBe(true);
    expect(auth.isLoggedIn().user).toEqual({ email: 'jo@example.com', name: 'Jo Client' });
    expect(localStorage.getItem('accountId')).toBe('3');
    expect(accountContext.accounts()).toEqual([]);
    expect(accountContext.selectedAccount()).toBeNull();
  });

  it('stays logged out when the password is wrong', () => {
    const login = TestBed.runInInjectionContext(() => new Login());
    login.form.setValue({ email: 'jo@example.com', password: 'wrong', rememberEmail: true });
    login.submit();

    http
      .expectOne(`${environment.authUrl}/auth/login`)
      .flush({ statusCode: 401, message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    expect(TestBed.inject(AuthService).isLoggedIn().isLoggedIn).toBe(false);
    expect(login.loginError()).toBe('Login failed, username or password is incorrect.');
    expect(navigate).not.toHaveBeenCalled();
  });

  // Regression: an admin signed in, the URL was edited to /login, and a client signed in on top.
  // The admin's stored role survived and the client was shown the admin interface.
  it('a client login after an admin login is not treated as admin, and ends the admin session', () => {
    const auth = TestBed.inject(AuthService);
    const url = vi.spyOn(TestBed.inject(Router), 'url', 'get');
    const tokenFor = (role: string, sub: string) =>
      makeToken({ sub, role, exp: Math.floor(Date.now() / 1000) + 1800 });
    const adminToken = tokenFor('admin', '7');

    url.mockReturnValue('/admin-login');
    const admin = TestBed.runInInjectionContext(() => new Login());
    admin.form.setValue({ email: 'boss@example.com', password: 'x', rememberEmail: false });
    admin.submit();
    http.expectOne(`${environment.authUrl}/auth/adminLogin`)
      .flush({ accessToken: adminToken, refreshToken: 'r1', role: 'admin' });
    expect(auth.isAdmin()).toBe(true);

    url.mockReturnValue('/login');
    const client = TestBed.runInInjectionContext(() => new Login());
    client.form.setValue({ email: 'jo@example.com', password: 'x', rememberEmail: false });
    client.submit();
    http.expectOne(`${environment.authUrl}/auth/login`)
      .flush({ accessToken: tokenFor('client', '42'), refreshToken: 'r2' });

    // The admin's session is revoked on the server, with the admin's own token
    const logout = http.expectOne(`${environment.authUrl}/auth/logout`);
    expect(logout.request.headers.get('Authorization')).toBe(`Bearer ${adminToken}`);
    logout.flush({});

    http.expectOne(`${SPRING}/user`).flush({ name: 'Jo', email: 'jo@example.com', address: 'x' });
    http.expectOne(`${SPRING}/user/accounts`).flush([{ accountId: 3 }]);
    http.expectOne(`${SPRING}/accounts/3`)
      .flush({ accountId: 3, balance: 1, portfolio_size: 'B', created_at: 'x', account_active: true });

    expect(localStorage.getItem('adminRole')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBe('r2');
    expect(auth.isAdmin()).toBe(false);
    expect(auth.isReporter()).toBe(false);
    expect(navigate).toHaveBeenLastCalledWith(['/dashboard']);
  });

  it('a wrong password leaves the current session alone', () => {
    const existing = makeToken({ sub: '7', role: 'admin', exp: Math.floor(Date.now() / 1000) + 1800 });
    localStorage.setItem('token', existing);
    localStorage.setItem('adminRole', 'admin');

    const login = TestBed.runInInjectionContext(() => new Login());
    login.form.setValue({ email: 'jo@example.com', password: 'wrong', rememberEmail: false });
    login.submit();
    http.expectOne(`${environment.authUrl}/auth/login`)
      .flush({ statusCode: 401, message: 'Invalid email or password' }, { status: 401, statusText: 'Unauthorized' });

    http.expectNone(`${environment.authUrl}/auth/logout`);
    expect(sessionStorage.getItem('token')).toBe(existing);
    expect(localStorage.getItem('adminRole')).toBe('admin');
  });
});
