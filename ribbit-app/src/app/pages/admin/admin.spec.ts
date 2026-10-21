import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AdminAccount, AdminUserLookup } from '../../shared/services/admin-api.service';
import { Admin } from './admin';

const SPRING = environment.springUrl;

const account = (overrides: Partial<AdminAccount> = {}): AdminAccount => ({
  accountId: 7,
  userId: 42,
  balance: 1250.5,
  portfolioSize: 'BALANCED',
  tradeType: 'Passive',
  createdAt: '2024-09-01T10:15:00',
  accountActive: true,
  accountFrozen: false,
  ...overrides
});

const jane: AdminUserLookup = {
  userId: 42,
  name: 'Jane Smith',
  email: 'jane@example.com',
  dateOfBirth: '1990-01-01',
  address: '1 Main St',
  accounts: [account(), account({ accountId: 8, balance: 10 })]
};

describe('Admin user lookup', () => {
  let http: HttpTestingController;

  function setup(queryParams: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } } }
      ]
    });
    http = TestBed.inject(HttpTestingController);
    return TestBed.runInInjectionContext(() => new Admin());
  }

  function search(admin: Admin, type: 'email' | 'userId' | 'accountId', term: string): void {
    admin.setSearchType(type);
    admin.searchTerm.set(term);
    admin.searchUser();
  }

  const notFound = { status: 404, statusText: 'Not Found' };

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('searches by user ID', () => {
    const admin = setup();
    search(admin, 'userId', ' 42 ');

    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);

    expect(admin.userLookup()).toEqual(jane);
    expect(admin.matchedAccount()).toBeNull();
    expect(admin.userLookupError()).toBe('');
  });

  it('searches by account ID and shows the account with its owner', () => {
    const admin = setup();
    const frozen = account({ accountFrozen: true });
    search(admin, 'accountId', '7');

    http.expectOne(`${SPRING}/admin/accounts/account/7`).flush(frozen);
    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);

    expect(admin.matchedAccount()).toEqual(frozen);
    expect(admin.userLookup()?.userId).toBe(42);
    expect(admin.accountStatus(frozen)).toBe('Frozen');
  });

  it('finds closed accounts too', () => {
    const admin = setup();
    const closed = account({ accountActive: false });
    search(admin, 'accountId', '7');

    http.expectOne(`${SPRING}/admin/accounts/account/7`).flush(closed);
    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);

    expect(admin.accountStatus(admin.matchedAccount()!)).toBe('Closed');
  });

  it('still searches by email', () => {
    const admin = setup();
    search(admin, 'email', 'jane@example.com');

    const req = http.expectOne(r => r.url === `${SPRING}/admin/users/by-email`);
    expect(req.request.params.get('email')).toBe('jane@example.com');
    req.flush(jane);
    expect(admin.userLookup()?.name).toBe('Jane Smith');
  });

  it.each(['abc', '0', '-3', '4.5', '7a'])('rejects the ID %j without sending a request', term => {
    const admin = setup();
    search(admin, 'accountId', term);

    expect(admin.userLookupError()).toBe('Enter an account ID as a whole number.');
    expect(admin.userLookupLoading()).toBe(false);
  });

  it.each([
    ['email', 'nobody@example.com', `${SPRING}/admin/users/by-email`, 'No user found with that email.'],
    ['userId', '999', `${SPRING}/admin/users/999`, 'No user with ID #999.'],
    ['accountId', '999', `${SPRING}/admin/accounts/account/999`, 'No account with ID #999.']
  ] as const)('explains a %s search that finds nothing', (type, term, url, message) => {
    const admin = setup();
    search(admin, type, term);

    http.expectOne(r => r.url === url).flush({ fieldMessage: 'Resource not found' }, notFound);

    expect(admin.userLookupError()).toBe(message);
    expect(admin.userLookup()).toBeNull();
  });

  it('clears the previous result when a new search starts', () => {
    const admin = setup();
    search(admin, 'accountId', '7');
    http.expectOne(`${SPRING}/admin/accounts/account/7`).flush(account());
    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);

    search(admin, 'userId', '42');
    expect(admin.matchedAccount()).toBeNull();
    expect(admin.userLookup()).toBeNull();
    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);
  });

  it('opens a user lookup from the Users tab link (?userId=42)', () => {
    const admin = setup({ userId: '42' });
    admin.ngOnInit();

    // The page also loads its overview; answer it so only the lookup is under test
    for (const path of ['/admin/orders', '/admin/accounts', '/admin/users', '/admin/transactions', '/admin/analytics/portfolio-sizes']) {
      http.expectOne(`${SPRING}${path}`).flush([]);
    }
    http.expectOne(`${SPRING}/admin/users/42`).flush(jane);

    expect(admin.searchType()).toBe('userId');
    expect(admin.searchTerm()).toBe('42');
    expect(admin.userLookup()?.name).toBe('Jane Smith');
  });
});
