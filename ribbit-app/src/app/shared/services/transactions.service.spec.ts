import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { FundsTransferResponse, OrderDto, Transaction, TransactionDto } from './transactions.models';
import {
  TransactionsService,
  dollarsToCents,
  orderIdFromTransactionId,
  orderToTransaction,
  sortNewestFirst,
  splitLocalDateTime,
  toTransaction
} from './transactions.service';

const txDto = (overrides: Partial<TransactionDto> = {}): TransactionDto => ({
  transaction_id: 1,
  transaction_type: 'DEPOSIT',
  amount: 5000,
  side: 'IN',
  account_id: 930001,
  happened_at: '2024-09-02T09:00:00',
  ...overrides
});

const orderDto = (overrides: Partial<OrderDto> = {}): OrderDto => ({
  orderId: 930001,
  ticker: 'AAPL',
  side: 'BUY',
  quantity: 10,
  pricePerUnit: 220,
  status: 'FILLED',
  totalPrice: 2200,
  executedAt: '2024-09-05T10:00:00',
  ...overrides
});

describe('splitLocalDateTime', () => {
  it('splits without applying any timezone shift', () => {
    expect(splitLocalDateTime('2024-09-03T14:30:15')).toEqual({ date: '2024-09-03', time: '14:30' });
    expect(splitLocalDateTime('2026-10-13T23:59:59.963162584')).toEqual({ date: '2026-10-13', time: '23:59' });
  });

  it('returns empty parts for missing values', () => {
    expect(splitLocalDateTime(null)).toEqual({ date: '', time: '' });
    expect(splitLocalDateTime(undefined)).toEqual({ date: '', time: '' });
  });
});

describe('dollarsToCents', () => {
  it('rounds to the nearest cent', () => {
    expect(dollarsToCents(12500.5)).toBe(1250050);
    expect(dollarsToCents(0.1 + 0.2)).toBe(30);
    expect(dollarsToCents(1.0049)).toBe(100);
    expect(dollarsToCents(1.005)).toBe(101);
  });
});

describe('toTransaction', () => {
  it.each(['EUR', null, undefined])('preserves currency %s without defaulting to USD', currency => {
    expect(toTransaction(txDto({ currency }))?.currency).toBe(currency ?? null);
    expect(toTransaction(txDto({
      transaction_type: 'CURRENCY EXCHANGE', side: 'EXCHANGE', currency
    }))?.currency).toBe(currency ?? null);
  });

  it('maps IN deposits to positive amounts', () => {
    expect(toTransaction(txDto())).toEqual({
      id: 'TX-1',
      date: '2024-09-02',
      time: '09:00',
      type: 'Deposit',
      description: 'Deposit',
      amount: 5000,
      currency: null,
      status: 'Completed'
    });
  });

  it('maps OUT withdrawals to negative amounts', () => {
    const t = toTransaction(txDto({ transaction_type: 'WITHDRAWAL', side: 'OUT', amount: 250 }));
    expect(t?.type).toBe('Withdrawal');
    expect(t?.amount).toBe(-250);
  });

  it('maps currency exchange rows into completed history entries', () => {
    expect(toTransaction(txDto({
      transaction_id: 101,
      transaction_type: 'CURRENCY EXCHANGE',
      side: 'EXCHANGE',
      amount: 100,
      happened_at: '2026-10-19T13:10:32.830734'
    }))).toEqual({
      id: 'TX-101',
      date: '2026-10-19',
      time: '13:10',
      type: 'Currency Exchange',
      description: 'Currency Exchange',
      amount: 100,
      currency: null,
      status: 'Completed'
    });
  });
});

describe('orderToTransaction', () => {
  it('maps a filled buy to a negative completed row', () => {
    expect(orderToTransaction(orderDto())).toEqual({
      id: 'ORD-930001',
      date: '2024-09-05',
      time: '10:00',
      type: 'Buy',
      description: 'Bought 10 AAPL',
      amount: -2200,
      status: 'Completed',
      instrument: 'AAPL',
      quantity: 10,
      price: 220
    });
  });

  it('maps a sell to a positive amount', () => {
    const t = orderToTransaction(orderDto({ side: 'SELL' }));
    expect(t.type).toBe('Sell');
    expect(t.amount).toBe(2200);
    expect(t.description).toBe('Sold 10 AAPL');
  });

  it('maps every order status', () => {
    const status = (s: OrderDto['status']) => orderToTransaction(orderDto({ status: s, executedAt: null })).status;
    expect(status('PENDING')).toBe('Pending');
    expect(status('DECLINED')).toBe('Failed');
    expect(status('FAILED')).toBe('Failed');
    expect(status('CANCELED')).toBe('Failed');
  });

  it('flags cancelled orders and leaves unexecuted orders undated', () => {
    const t = orderToTransaction(orderDto({ status: 'CANCELED', executedAt: null }));
    expect(t.description).toBe('Buy 10 AAPL · Cancelled');
    expect(t.date).toBe('');
  });
});

describe('sortNewestFirst', () => {
  const row = (id: string, date: string, time = ''): Transaction => ({
    id, date, time, type: 'Buy', description: '', amount: 0, status: 'Completed'
  });

  it('orders by date and time descending with undated rows last', () => {
    const sorted = sortNewestFirst([
      row('a', '2024-09-02', '09:00'),
      row('b', ''),
      row('c', '2024-09-05', '10:00'),
      row('d', '2024-09-05', '08:00')
    ]);
    expect(sorted.map(t => t.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});

describe('orderIdFromTransactionId', () => {
  it('extracts order ids only', () => {
    expect(orderIdFromTransactionId('ORD-42')).toBe(42);
    expect(orderIdFromTransactionId('TX-42')).toBeNull();
  });
});

describe('TransactionsService deposit/withdraw', () => {
  let service: TransactionsService;
  let http: HttpTestingController;
  const base = `${environment.springUrl}/transactions/account/42`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(TransactionsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const depositResponse: FundsTransferResponse = {
    transaction: {
      transaction_id: 118,
      transaction_type: 'DEPOSIT',
      amount: 250,
      side: 'IN',
      account_id: 42,
      happened_at: '2026-10-14T10:15:02'
    },
    balance: 1250
  };

  it('POSTs a deposit to the account and returns the typed response', () => {
    let result: FundsTransferResponse | undefined;
    service.deposit(42, { amount: 250, fundingMethod: 'bank' }).subscribe(r => (result = r));

    const req = http.expectOne(`${base}/deposit`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: 250, fundingMethod: 'bank' });
    expect(typeof req.request.body.amount).toBe('number');
    req.flush(depositResponse);

    expect(result).toEqual(depositResponse);
    expect(result && toTransaction(result.transaction)).toEqual({
      id: 'TX-118',
      date: '2026-10-14',
      time: '10:15',
      type: 'Deposit',
      description: 'Deposit',
      amount: 250,
      status: 'Completed'
    });
  });

  it('POSTs a withdrawal to the account and maps it as money out', () => {
    const response: FundsTransferResponse = {
      transaction: { ...depositResponse.transaction, transaction_id: 119, transaction_type: 'WITHDRAWAL', side: 'OUT', amount: 100.5 },
      balance: 1149.5
    };
    let result: FundsTransferResponse | undefined;
    service.withdraw(42, { amount: 100.5, fundingMethod: 'debit' }).subscribe(r => (result = r));

    const req = http.expectOne(`${base}/withdraw`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ amount: 100.5, fundingMethod: 'debit' });
    req.flush(response);

    expect(result?.balance).toBe(1149.5);
    expect(result && toTransaction(result.transaction)?.amount).toBe(-100.5);
  });

  it('omits fundingMethod when it is not given', () => {
    service.deposit(42, { amount: 10 }).subscribe();

    const req = http.expectOne(`${base}/deposit`);
    expect(req.request.body).toEqual({ amount: 10 });
    expect('fundingMethod' in req.request.body).toBe(false);
    req.flush(depositResponse);
  });

  it('passes the ValidationError body through to the caller', () => {
    const body = {
      status: 400,
      message: 'Validation failed',
      timestamp: '2026-10-14T10:15:02',
      fieldName: 'balance',
      rejectedValue: null,
      fieldMessage: 'Insufficient balance for withdrawal: balance=$1150.0000, requested=$5000'
    };
    let error: HttpErrorResponse | undefined;
    service.withdraw(42, { amount: 5000 }).subscribe({ error: e => (error = e) });

    http.expectOne(`${base}/withdraw`).flush(body, { status: 400, statusText: 'Bad Request' });

    expect(error?.status).toBe(400);
    expect(error?.error).toEqual(body);
  });

  it('gets transactions for the stored account with the bearer token', () => {
    localStorage.setItem('token', 'test-token');
    let result: TransactionDto[] | undefined;
    service.getTransactions(42).subscribe(transactions => (result = transactions));

    const req = http.expectOne(`${base}`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');

    const response = [txDto({ account_id: 42 })];
    req.flush(response);
    expect(result).toEqual(response);
  });
});
