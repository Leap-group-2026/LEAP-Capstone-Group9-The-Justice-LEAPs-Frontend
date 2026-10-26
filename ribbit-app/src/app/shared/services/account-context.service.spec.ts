import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../environments/environment';
import {
  AccountContextItem,
  AccountContextService,
  accountLabel,
  accountNameProblem
} from './account-context.service';

const item = (accountId: number, accountName: string | null = null): AccountContextItem => ({
  accountId,
  userId: 42,
  balance: 100,
  portfolioSize: 'BALANCED',
  tradeType: 'Passive',
  createdAt: '2024-09-01T10:15:00',
  accountActive: true,
  accountFrozen: false,
  accountName
});

describe('accountLabel', () => {
  it('shows the name with the number, or just the number when unnamed', () => {
    expect(accountLabel({ accountId: 8, accountName: 'Savings' })).toBe('Savings · #8');
    expect(accountLabel({ accountId: 8, accountName: null })).toBe('#8');
    expect(accountLabel({ accountId: 8 })).toBe('#8');
    expect(accountLabel({ accountId: 8, accountName: '   ' })).toBe('#8');
  });
});

describe('accountNameProblem', () => {
  it('accepts names up to 40 characters after trimming, and empty (which removes the name)', () => {
    expect(accountNameProblem('Savings')).toBeNull();
    expect(accountNameProblem('  ' + 'a'.repeat(40) + '  ')).toBeNull();
    expect(accountNameProblem('')).toBeNull();
    expect(accountNameProblem('Rainy day 💰')).toBeNull();
  });

  it('rejects names over 40 characters and control characters, like the API', () => {
    expect(accountNameProblem('a'.repeat(41))).toBe('Account names can be at most 40 characters.');
    expect(accountNameProblem('Sav\tings')).toBe("Account names can't contain tabs or line breaks.");
    expect(accountNameProblem('Savings\n')).toBe("Account names can't contain tabs or line breaks.");
  });
});

describe('AccountContextService.renameAccount', () => {
  let service: AccountContextService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    });
    service = TestBed.inject(AccountContextService);
    http = TestBed.inject(HttpTestingController);
    service.accounts.set([item(8), item(9, 'Retirement')]);
    service.selectedAccount.set(item(8));
  });

  afterEach(() => {
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('PATCHes the name and updates the list and the selected account (the top bar)', () => {
    let renamed: AccountContextItem | undefined;
    service.renameAccount(8, 'Savings').subscribe(account => (renamed = account));

    const req = http.expectOne(`${environment.springUrl}/accounts/rename/8`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Savings' });
    // The API answers in the GET /accounts/{id} shape, with snake_case fields
    req.flush({ accountId: 8, balance: 100, portfolio_size: 'BALANCED', trade_type: 'Passive', account_active: true, accountName: 'Savings' });

    expect(renamed?.accountName).toBe('Savings');
    expect(service.accounts().map(a => a.accountName)).toEqual(['Savings', 'Retirement']);
    expect(service.selectedAccount()?.accountName).toBe('Savings');
    // Only the name changes; the rest of the selected account is untouched
    expect(service.selectedAccount()?.userId).toBe(42);
  });

  it('removes a name with null', () => {
    service.renameAccount(9, null).subscribe();

    const req = http.expectOne(`${environment.springUrl}/accounts/rename/9`);
    expect(req.request.body).toEqual({ name: null });
    req.flush({ accountId: 9, accountName: null });

    expect(service.accounts().find(a => a.accountId === 9)?.accountName).toBeNull();
    expect(service.selectedAccount()?.accountId).toBe(8);
  });
});
