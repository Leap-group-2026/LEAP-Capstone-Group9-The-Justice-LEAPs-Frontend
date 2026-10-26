import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AdminUserSummary } from '../../shared/services/admin-api.service';
import { AdminUsers } from './admin-users';

const USERS_URL = `${environment.springUrl}/admin/users`;

const USERS: AdminUserSummary[] = [
  { userId: 42, name: 'Jane Smith', email: 'jane@example.com', dateOfBirth: '1990-01-01', address: '1 Main St' },
  { userId: 7, name: 'Omar Haddad', email: 'omar@example.com', dateOfBirth: '1985-12-31', address: '9 Elm Rd' },
  { userId: 420, name: 'Lee Park', email: 'lee@example.com', dateOfBirth: '2000-06-15', address: '3 Oak Ave' }
];

describe('AdminUsers', () => {
  let fixture: ComponentFixture<AdminUsers>;
  let http: HttpTestingController;

  async function render(response: AdminUserSummary[] | null = USERS, status = 200): Promise<void> {
    TestBed.configureTestingModule({
      imports: [AdminUsers],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminUsers);
    fixture.detectChanges();
    const req = http.expectOne(USERS_URL);
    if (status === 200) {
      req.flush(response);
    } else {
      req.flush(null, { status, statusText: 'Error' });
    }
    await fixture.whenStable();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const rows = () => [...el().querySelectorAll('.account-row')];

  async function typeFilter(value: string): Promise<void> {
    const input = el().querySelector('#user-filter') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('lists every user with their details and a link to their lookup', async () => {
    await render();

    expect(el().querySelector('.panel-heading > strong')?.textContent?.trim()).toBe('3');
    expect(rows()).toHaveLength(3);
    const first = rows()[0];
    expect(first.textContent).toContain('Jane Smith');
    expect(first.textContent).toContain('#42');
    expect(first.textContent).toContain('jane@example.com');
    expect(first.textContent).toContain('born Jan 1, 1990');
    expect(first.querySelector('a.open-link')?.getAttribute('href')).toBe('/admin?userId=42');
    // Read from the string: Dec 31 must not slide to Dec 30 in a western time zone
    expect(rows()[1].textContent).toContain('born Dec 31, 1985');
  });

  it('filters by name, email or exact user ID', async () => {
    await render();

    await typeFilter('omar');
    expect(rows().map(r => r.querySelector('strong')?.textContent?.trim())).toEqual(['Omar Haddad #7']);

    await typeFilter('LEE@');
    expect(rows()).toHaveLength(1);

    // "42" must not also match user 420
    await typeFilter('#42');
    expect(rows().map(r => r.textContent)).toEqual([expect.stringContaining('Jane Smith')]);
    expect(el().querySelector('.filter-result')?.textContent?.trim()).toBe('1 of 3');

    await typeFilter('zzz');
    expect(el().querySelector('.empty-state')?.textContent?.trim()).toBe('No users match "zzz".');
  });

  it('says when there are no users', async () => {
    await render([]);
    expect(el().querySelector('.empty-state')?.textContent?.trim()).toBe('No users registered yet.');
  });

  it('explains a permission error', async () => {
    await render(null, 403);
    expect(el().querySelector('[role="alert"]')?.textContent?.trim()).toBe('You do not have permission to view users.');
    expect(rows()).toHaveLength(0);
  });
});
