import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../../shared/services/auth.service';
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
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    localStorage.clear();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  // Regression: the layout reads isLoggedIn, so it must be true by the time the first page opens.
  it('marks the user as logged in before navigating to the dashboard', () => {
    const auth = TestBed.inject(AuthService);
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
      accountId: 3, balance: 1000, portfolio_size: 'BALANCED', trade_type: 'Passive',
      created_at: '2024-09-01T10:15:00', account_active: true
    });

    expect(navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(loggedInWhenNavigating).toBe(true);
    expect(auth.isLoggedIn().user).toEqual({ email: 'jo@example.com', name: 'Jo Client' });
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
});
