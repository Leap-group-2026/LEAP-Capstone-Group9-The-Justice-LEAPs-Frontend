import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { SessionTimer } from './session-timer';

const START = new Date('2026-10-19T10:00:00Z').getTime();
const REFRESH_URL = `${environment.authUrl}/auth/refresh`;

// Unsigned JWT expiring at the given epoch ms; the app only reads the claims.
function tokenExpiringAt(ms: number): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: '42', role: 'client', exp: Math.floor(ms / 1000) })}.sig`;
}

describe('SessionTimer', () => {
  let fixture: ComponentFixture<SessionTimer>;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(token: string | null, refreshToken: string | null = 'refresh-1'): Promise<void> {
    if (token) localStorage.setItem('token', token);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    TestBed.configureTestingModule({
      imports: [SessionTimer],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SessionTimer);
    await fixture.whenStable();
  }

  async function advance(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const time = () => el().querySelector('.time')?.textContent?.trim();
  const button = () => el().querySelector<HTMLButtonElement>('button.refresh');

  beforeEach(() => {
    // Only the interval and the clock are faked; whenStable still uses real timers.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    sessionStorage.clear();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('shows the time left on the access token and counts down every second', async () => {
    await render(tokenExpiringAt(START + 29 * 60_000 + 30_000));
    expect(time()).toBe('29:30');

    await advance(5_000);
    expect(time()).toBe('29:25');
  });

  it('highlights the last 5 minutes and shows Expired at zero', async () => {
    await render(tokenExpiringAt(START + 5 * 60_000 + 2_000));
    expect(el().querySelector('.session-timer')?.classList.contains('warn')).toBe(false);

    await advance(3_000);
    expect(time()).toBe('4:59');
    expect(el().querySelector('.session-timer')?.classList.contains('warn')).toBe(true);

    await advance(5 * 60_000);
    expect(time()).toBe('Expired');
    expect(el().querySelector('.session-timer')?.classList.contains('expired')).toBe(true);
  });

  it('shows nothing when signed out', async () => {
    await render(null, null);
    expect(el().querySelector('.session-timer')).toBeNull();
  });

  it('hides the refresh button when there is no refresh token', async () => {
    await render(tokenExpiringAt(START + 10 * 60_000), null);
    expect(time()).toBe('10:00');
    expect(button()).toBeNull();
  });

  it('refreshes through /auth/refresh and restarts the countdown from the new token', async () => {
    await render(tokenExpiringAt(START + 2 * 60_000));
    expect(time()).toBe('2:00');

    button()!.click();
    await fixture.whenStable();
    expect(button()!.disabled).toBe(true);

    const req = http.expectOne(REFRESH_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ accessToken: tokenExpiringAt(START + 30 * 60_000), refreshToken: 'refresh-2' });
    await fixture.whenStable();

    expect(time()).toBe('30:00');
    expect(sessionStorage.getItem('refreshToken')).toBe('refresh-2');
    expect(button()!.disabled).toBe(false);
  });

  it('picks up a token refreshed elsewhere (interceptor or another tab) on the next tick', async () => {
    await render(tokenExpiringAt(START + 60_000));
    localStorage.setItem('token', tokenExpiringAt(START + 30 * 60_000));

    await advance(1_000);
    expect(time()).toBe('29:59');
  });

  it('ends the session when the refresh is refused', async () => {
    localStorage.setItem('email', 'jo@example.com');
    await render(tokenExpiringAt(START + 60_000));

    button()!.click();
    http.expectOne(REFRESH_URL).flush({ message: 'Session has ended' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(sessionStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('email')).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('keeps the session and says so when the server cannot be reached', async () => {
    const token = tokenExpiringAt(START + 60_000);
    await render(token);

    button()!.click();
    http.expectOne(REFRESH_URL).flush('Bad Gateway', { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();

    expect(el().querySelector('.label')?.textContent?.trim()).toBe("CAN'T REACH SERVER");
    expect(sessionStorage.getItem('token')).toBe(token);
    expect(sessionStorage.getItem('refreshToken')).toBe('refresh-1');
    expect(navigate).not.toHaveBeenCalled();
    expect(button()!.disabled).toBe(false);
  });
});
