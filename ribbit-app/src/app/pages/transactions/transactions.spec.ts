import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../environments/environment';
import { pickAccount } from '../../shared/services/current-account.service';
import { AccountDto, FundsTransferResponse } from '../../shared/services/transactions.models';
import { Transactions } from './transactions';

const SPRING = environment.springUrl;

const makeAccount = (accountId: number, balance = 1000): AccountDto => ({
  accountId,
  userId: 7,
  balance,
  portfolioSize: 'BALANCED',
  tradeType: 'Passive',
  createdAt: '2024-09-01T10:15:00',
  accountActive: true
});

const transferResponse = (
  type: 'DEPOSIT' | 'WITHDRAWAL',
  amount: number,
  balance: number
): FundsTransferResponse => ({
  transaction: {
    transaction_id: 118,
    transaction_type: type,
    amount,
    side: type === 'DEPOSIT' ? 'IN' : 'OUT',
    account_id: 42,
    happened_at: '2026-10-14T10:15:02'
  },
  balance
});

const validationError = (fieldName: string, fieldMessage: string) => ({
  status: 400,
  message: 'Validation failed',
  timestamp: '2026-10-14T10:15:02',
  fieldName,
  rejectedValue: null,
  fieldMessage
});

describe('pickAccount', () => {
  it('prefers the account selected in the header', () => {
    expect(pickAccount([makeAccount(42), makeAccount(43)], 43)?.accountId).toBe(43);
  });

  it('falls back to the lowest id when the selection is missing or closed', () => {
    expect(pickAccount([makeAccount(50), makeAccount(42)], 99)?.accountId).toBe(42);
    expect(pickAccount([makeAccount(50), makeAccount(42)], null)?.accountId).toBe(42);
  });

  it('returns null when there are no accounts', () => {
    expect(pickAccount([], 42)).toBeNull();
  });
});

describe('Transactions page: deposit and withdraw', () => {
  let harness: RouterTestingHarness;
  let page: Transactions;
  let http: HttpTestingController;

  async function setup(url = '/transactions', selectedId = 42): Promise<void> {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('accountId', String(selectedId));
    localStorage.setItem('balance', '1000');

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'transactions', component: Transactions }])
      ]
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    page = await harness.navigateByUrl(url, Transactions);
    await stable();
  }

  async function stable(): Promise<void> {
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  // Answers the requests the page makes when it loads (or reloads) its data.
  async function flushLoad(accounts: AccountDto[] = [makeAccount(42)], accountId = 42): Promise<void> {
    http.expectOne(`${SPRING}/user/accounts`).flush(accounts);
    http.expectOne(`${SPRING}/transactions/account/${accountId}`).flush([]);
    http.expectOne(`${SPRING}/accounts/${accountId}`).flush({
      accountId,
      user: { userId: 7, name: 'Jo Client', email: 'jo@example.com' },
      balance: accounts.find(a => a.accountId === accountId)?.balance ?? 0
    });
    await stable();
  }

  const root = () => harness.routeNativeElement as HTMLElement;
  const dialog = () => root().querySelector('[role="dialog"]') as HTMLElement | null;
  const alertText = () => dialog()?.querySelector('[role="alert"]')?.textContent?.trim() ?? '';

  function button(label: string, scope: HTMLElement | null = root()): HTMLButtonElement {
    const match = [...(scope?.querySelectorAll('button') ?? [])].find(
      b => b.textContent?.trim() === label
    );
    if (!match) {
      throw new Error(`No button labelled "${label}"`);
    }
    return match as HTMLButtonElement;
  }

  async function click(label: string, scope: HTMLElement | null = root()): Promise<void> {
    button(label, scope).click();
    await stable();
  }

  async function typeAmount(value: string): Promise<void> {
    const input = dialog()!.querySelector('#amount-input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await stable();
  }

  async function chooseMethod(value: 'bank' | 'debit'): Promise<void> {
    const select = dialog()!.querySelector('#funding-method') as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await stable();
  }

  // Opens the modal, enters an amount and goes to the review step.
  async function reviewTransfer(mode: 'Add Funds' | 'Withdraw', amount: string): Promise<void> {
    await click(mode);
    await typeAmount(amount);
    await click('Continue', dialog());
  }

  // Reset even when verify() throws, so one failing test can't break the ones after it.
  afterEach(() => {
    localStorage.clear();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('loads the account selected in the header', async () => {
    await setup('/transactions', 43);
    await flushLoad([makeAccount(42), makeAccount(43)], 43);

    expect(page.account()?.accountId).toBe(43);
  });

  describe('amount validation', () => {
    it.each([
      ['', 'Amount is required.'],
      ['0', 'Amount must be greater than $0.00.'],
      ['0.00', 'Amount must be greater than $0.00.'],
      ['-5', 'Enter a valid amount, like 250 or 250.50.'],
      ['10abc', 'Enter a valid amount, like 250 or 250.50.'],
      ['1e3', 'Enter a valid amount, like 250 or 250.50.'],
      ['10.123', 'Amount can have at most 2 decimal places.'],
      ['100000.01', 'Amount cannot exceed $100,000.']
    ])('rejects %j without sending a request', async (amount, message) => {
      await setup();
      await flushLoad();

      await reviewTransfer('Add Funds', amount);

      expect(page.fundsStep()).toBe('form');
      expect(alertText()).toBe(message);
      http.expectNone(req => req.method === 'POST');
    });

    it.each(['0.01', '250.5', '100000'])('accepts %j', async amount => {
      await setup();
      await flushLoad();

      await reviewTransfer('Add Funds', amount);

      expect(page.fundsStep()).toBe('review');
      expect(alertText()).toBe('');
    });

    it('blocks a withdrawal larger than the known balance', async () => {
      await setup();
      await flushLoad([makeAccount(42, 1000)]);

      await reviewTransfer('Withdraw', '1000.01');

      expect(page.fundsStep()).toBe('form');
      expect(alertText()).toBe('Insufficient funds. You have $1,000.00 available.');
      http.expectNone(req => req.method === 'POST');
    });
  });

  it('deposits, shows the balance the backend returned, and reloads the account and activity', async () => {
    await setup();
    await flushLoad([makeAccount(42, 1000)]);

    await reviewTransfer('Add Funds', '250.5');
    await click('Confirm Deposit', dialog());

    const req = http.expectOne(`${SPRING}/transactions/account/42/deposit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: 250.5, fundingMethod: 'bank' });
    // Deliberately not 1000 + 250.50, to prove the screen shows the backend's number.
    req.flush(transferResponse('DEPOSIT', 250.5, 1300));
    await stable();

    expect(dialog()?.querySelector('#modal-title')?.textContent?.trim()).toBe('Funds Added Successfully');
    expect(dialog()?.querySelector('.new-balance')?.textContent?.trim()).toBe('$1,300.00');
    expect(localStorage.getItem('balance')).toBe('1300');

    await flushLoad([makeAccount(42, 1300)]);
    expect(page.availableCash).toBe(1300);
  });

  it('withdraws to the chosen destination', async () => {
    await setup();
    await flushLoad([makeAccount(42, 1000)]);

    await click('Withdraw');
    await typeAmount('100');
    await chooseMethod('debit');
    await click('Continue', dialog());
    await click('Confirm Withdrawal', dialog());

    const req = http.expectOne(`${SPRING}/transactions/account/42/withdraw`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: 100, fundingMethod: 'debit' });
    req.flush(transferResponse('WITHDRAWAL', 100, 900));
    await stable();

    expect(dialog()?.querySelector('#modal-title')?.textContent?.trim()).toBe('Withdrawal Successful');
    expect(dialog()?.querySelector('.new-balance')?.textContent?.trim()).toBe('$900.00');
    await flushLoad([makeAccount(42, 900)]);
  });

  it('cannot submit twice while a request is in flight', async () => {
    await setup();
    await flushLoad();

    await reviewTransfer('Add Funds', '50');
    await click('Confirm Deposit', dialog());

    const confirm = button('Processing…', dialog());
    expect(confirm.disabled).toBe(true);
    page.confirmFunds();
    confirm.click();
    await stable();

    // expectOne fails if a second deposit was sent.
    http.expectOne(`${SPRING}/transactions/account/42/deposit`).flush(transferResponse('DEPOSIT', 50, 1050));
    await stable();
    await flushLoad([makeAccount(42, 1050)]);
  });

  it('returns to the form and shows the backend message on a validation error', async () => {
    await setup();
    await flushLoad();

    await reviewTransfer('Add Funds', '50');
    await click('Confirm Deposit', dialog());
    http
      .expectOne(`${SPRING}/transactions/account/42/deposit`)
      .flush(validationError('amount', 'amount must have at most 2 decimal places'), {
        status: 400,
        statusText: 'Bad Request'
      });
    await stable();

    expect(page.fundsStep()).toBe('form');
    expect(alertText()).toBe('amount must have at most 2 decimal places');
    expect(button('Continue', dialog()).disabled).toBe(false);
  });

  it('refreshes the balance and explains when the backend reports insufficient funds', async () => {
    await setup();
    await flushLoad([makeAccount(42, 1000)]);

    await reviewTransfer('Withdraw', '950');
    await click('Confirm Withdrawal', dialog());
    http
      .expectOne(`${SPRING}/transactions/account/42/withdraw`)
      .flush(
        validationError('balance', 'Insufficient balance for withdrawal: balance=$900.0000, requested=$950'),
        { status: 400, statusText: 'Bad Request' }
      );
    await stable();

    http.expectOne(`${SPRING}/user/accounts`).flush([makeAccount(42, 900)]);
    await stable();

    expect(page.fundsStep()).toBe('form');
    expect(alertText()).toBe('Insufficient funds. You have $900.00 available.');
    expect(page.availableCash).toBe(900);
  });

  it('explains a 404 as an account that is no longer available', async () => {
    await setup();
    await flushLoad();

    await reviewTransfer('Add Funds', '50');
    await click('Confirm Deposit', dialog());
    http
      .expectOne(`${SPRING}/transactions/account/42/deposit`)
      .flush({ status: 404, fieldName: 'Account', fieldMessage: 'Resource not found' }, {
        status: 404,
        statusText: 'Not Found'
      });
    await stable();

    expect(page.fundsStep()).toBe('form');
    expect(alertText()).toBe('This account is no longer available. Reload the page and try again.');
  });

  it('opens the deposit modal when linked with ?action=deposit', async () => {
    await setup('/transactions?action=deposit');
    await flushLoad();

    expect(dialog()?.querySelector('#modal-title')?.textContent?.trim()).toBe('Add Funds');
    expect(page.fundsMode()).toBe('deposit');
  });
});
