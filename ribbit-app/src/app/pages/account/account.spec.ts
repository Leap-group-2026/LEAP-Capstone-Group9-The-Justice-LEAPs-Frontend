import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import { AccountContextService } from '../../shared/services/account-context.service';
import { Account } from './account';

const SPRING = environment.springUrl;

const record = (accountId: number, accountName: string | null = null) => ({
  accountId,
  balance: 100,
  portfolioSize: 'BALANCED',
  tradeType: 'Passive',
  createdAt: '2024-09-01T10:15:00',
  accountActive: true,
  accountName
});

describe('Account page: account names', () => {
  let http: HttpTestingController;
  let page: Account;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    http = TestBed.inject(HttpTestingController);
    page = TestBed.runInInjectionContext(() => new Account());
    page.accounts.set([record(8), record(9, 'Retirement')]);
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  const rename = (accountId: number, draft: string) => {
    page.startRename(page.accounts().find(a => a.accountId === accountId)!);
    page.renameDraft = draft;
    page.saveRename(page.accounts().find(a => a.accountId === accountId)!);
  };

  it('starts editing with the current name filled in', () => {
    page.startRename(page.accounts()[1]);
    expect(page.renamingAccountId()).toBe(9);
    expect(page.renameDraft).toBe('Retirement');
  });

  it('saves a trimmed name and updates this page', () => {
    rename(8, '  Savings  ');

    const req = http.expectOne(`${SPRING}/accounts/rename/8`);
    expect(req.request.body).toEqual({ name: 'Savings' });
    req.flush({ accountId: 8, accountName: 'Savings' });

    expect(page.accounts().map(a => a.accountName)).toEqual(['Savings', 'Retirement']);
    expect(page.renamingAccountId()).toBeNull();
  });

  it('an empty name removes it', () => {
    rename(9, '   ');

    const req = http.expectOne(`${SPRING}/accounts/rename/9`);
    expect(req.request.body).toEqual({ name: null });
    req.flush({ accountId: 9, accountName: null });

    expect(page.accounts()[1].accountName).toBeNull();
  });

  it('blocks a name over 40 characters without sending a request', () => {
    rename(8, 'a'.repeat(41));

    expect(page.renameError()).toBe('Account names can be at most 40 characters.');
    expect(page.renamingAccountId()).toBe(8);
  });

  it("shows the API's reason when it rejects the name", () => {
    rename(8, 'Savings');
    http.expectOne(`${SPRING}/accounts/rename/8`).flush(
      { status: 400, message: 'Validation failed', fieldName: 'name', fieldMessage: 'Account name must be at most 40 characters' },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(page.renameError()).toBe('Account name must be at most 40 characters');
    expect(page.renamingAccountId()).toBe(8);
    expect(page.accounts()[0].accountName).toBeNull();
  });

  it('explains a 404 (closed or no longer yours)', () => {
    rename(8, 'Savings');
    http.expectOne(`${SPRING}/accounts/rename/8`).flush({}, { status: 404, statusText: 'Not Found' });

    expect(page.renameError()).toBe('This account can no longer be renamed. Reload the page and try again.');
  });

  it('sends a name when opening a new account, and shows it on success', () => {
    page.openAddAccount();
    page.newAccountName = ' Travel fund ';
    page.newAccountBalance = '250';
    page.addAccount();

    const req = http.expectOne(`${SPRING}/accounts`);
    expect(req.request.body).toEqual({ balance: 250, portfolioSize: 'BALANCED', tradeType: 'Passive', accountName: 'Travel fund' });
    req.flush({ ...record(10, 'Travel fund'), userId: 42, accountFrozen: false });

    expect(page.addedAccountLabel()).toBe('Travel fund · #10');
    expect(TestBed.inject(AccountContextService).accounts().map(a => a.accountId)).toContain(10);
  });

  it('leaves the name out when the new account is not named', () => {
    page.openAddAccount();
    page.newAccountBalance = '0';
    page.addAccount();

    const req = http.expectOne(`${SPRING}/accounts`);
    expect('accountName' in req.request.body).toBe(false);
    req.flush({ ...record(11), userId: 42, accountFrozen: false });

    expect(page.addedAccountLabel()).toBe('#11');
  });
});
