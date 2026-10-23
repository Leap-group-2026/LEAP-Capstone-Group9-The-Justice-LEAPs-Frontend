import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { routes } from '../../app.routes';
import { authGuard } from '../../shared/guards/auth.guard';
import { adminGuard } from '../../shared/guards/admin.guard';
import { MainLayout } from '../../shared/components/main-layout/main-layout';
import { AdminAddAdmin } from './admin-add-admin';

const ADMIN_URL = `${environment.springUrl}/admin`;

describe('AdminAddAdmin', () => {
  let fixture: ComponentFixture<AdminAddAdmin>;
  let http: HttpTestingController;
  let originalToken: string | null;

  beforeEach(async () => {
    originalToken = sessionStorage.getItem('token');
    sessionStorage.setItem('token', 'current-admin-token');
    TestBed.configureTestingModule({
      imports: [AdminAddAdmin],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminAddAdmin);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      if (originalToken === null) sessionStorage.removeItem('token');
      else sessionStorage.setItem('token', originalToken);
      TestBed.resetTestingModule();
    }
  });

  const el = () => fixture.nativeElement as HTMLElement;

  function fillForm(email = 'new-admin@example.com', password = ' secret password ') {
    fixture.componentInstance.form.setValue({ email, password, confirmPassword: password });
  }

  it('toggles each password independently without submitting the form', async () => {
    fillForm();
    const password = el().querySelector('#admin-password') as HTMLInputElement;
    const confirmation = el().querySelector('#admin-confirm-password') as HTMLInputElement;
    const toggle = el().querySelector('[aria-controls="admin-password"]') as HTMLButtonElement;
    const confirmToggle = el().querySelector('[aria-controls="admin-confirm-password"]') as HTMLButtonElement;
    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');

    toggle.click();
    await fixture.whenStable();
    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('password');
    expect(toggle.getAttribute('aria-label')).toBe('Hide password');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    confirmToggle.click();
    await fixture.whenStable();
    expect(confirmation.type).toBe('text');
    toggle.click();
    confirmToggle.click();
    await fixture.whenStable();
    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');
    expect(fixture.componentInstance.form.controls.password.value).toBe(' secret password ');
    http.expectNone(ADMIN_URL);
  });

  it('requires valid credentials and matching passwords without sending a request', async () => {
    fixture.componentInstance.submit();
    await fixture.whenStable();
    expect(el().textContent).toContain('Enter a valid email address.');
    expect(el().textContent).toContain('Enter a password.');

    fillForm('invalid-email');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.form.controls.email.invalid).toBe(true);

    fillForm();
    fixture.componentInstance.form.controls.confirmPassword.setValue('different');
    fixture.componentInstance.submit();
    await fixture.whenStable();
    expect(el().textContent).toContain('Passwords do not match.');
    http.expectNone(ADMIN_URL);
  });

  it('posts only email and password with the current session token and preserves the session', async () => {
    fillForm('  new-admin@example.com  ');
    el().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();

    const request = http.expectOne(ADMIN_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Authorization')).toBe('Bearer current-admin-token');
    expect(request.request.body).toEqual({ email: 'new-admin@example.com', password: ' secret password ' });
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    expect(el().querySelector('fieldset')!.disabled).toBe(true);

    fixture.componentInstance.submit();
    http.expectNone(ADMIN_URL);

    request.flush({
      adminId: 42, role: 'ADMIN', email: 'new-admin@example.com',
      pass_hash: 'sensitive-hash', created_at: '2026-10-22T19:01:46.302Z'
    });
    await fixture.whenStable();
    expect(el().querySelector('[role="status"]')!.textContent).toContain('Admin account created for new-admin@example.com.');
    expect(el().textContent).not.toContain('sensitive-hash');
    expect(fixture.componentInstance.form.getRawValue()).toEqual({ email: '', password: '', confirmPassword: '' });
    expect(sessionStorage.getItem('token')).toBe('current-admin-token');
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
  });

  it('shows the duplicate-username response and allows a corrected submission', async () => {
    fillForm();
    fixture.componentInstance.submit();
    http.expectOne(ADMIN_URL).flush('Username already exists', { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain('Username already exists');
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(el().querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);

    fillForm('another-admin@example.com');
    fixture.componentInstance.submit();
    expect(fixture.componentInstance.errorMessage()).toBe('');
    http.expectOne(ADMIN_URL).flush({ adminId: 43, email: 'another-admin@example.com' });
    await fixture.whenStable();
    expect(fixture.componentInstance.successMessage()).toContain('another-admin@example.com');
  });

  it.each([
    [401, 'Your session has expired. Please sign in again.'],
    [403, 'You do not have permission to create an admin.'],
    [500, 'Unable to create the admin. Please try again.']
  ])('handles HTTP %s without exposing backend details', async (status, message) => {
    fillForm();
    fixture.componentInstance.submit();
    http.expectOne(ADMIN_URL).flush('internal detail', { status, statusText: 'Error' });
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')!.textContent).toBe(message);
    expect(fixture.componentInstance.submitting()).toBe(false);
    expect(fixture.componentInstance.successMessage()).toBe('');
  });

  it('explains network errors', async () => {
    fillForm();
    fixture.componentInstance.submit();
    http.expectOne(ADMIN_URL).error(new ProgressEvent('error'));
    await fixture.whenStable();
    expect(el().querySelector('[role="alert"]')!.textContent).toContain("Can't reach the server.");
    expect(fixture.componentInstance.submitting()).toBe(false);
  });

  it('restricts the route to authenticated admins and includes an admin-only sidebar item', () => {
    const route = routes.find(route => route.path === 'admin/add-admin');
    expect(route?.component).toBe(AdminAddAdmin);
    expect(route?.canActivate).toEqual([authGuard, adminGuard]);

    const visibleNavigation = Object.getOwnPropertyDescriptor(MainLayout.prototype, 'visibleNavigation')!.get!;
    const context = (admin: boolean) => ({
      authService: { isAdmin: () => admin, isReporter: () => false },
      navigation: [{ id: 'admin/add-admin', label: 'Add admin', icon: 'plus' }]
    });
    expect(visibleNavigation.call(context(true))).toHaveLength(1);
    expect(visibleNavigation.call(context(false))).toHaveLength(0);
  });
});