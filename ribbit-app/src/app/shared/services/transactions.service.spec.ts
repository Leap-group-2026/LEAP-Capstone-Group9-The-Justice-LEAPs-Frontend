import { OrderDto, Transaction, TransactionDto } from './transactions.models';
import {
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
  it('maps IN deposits to positive amounts', () => {
    expect(toTransaction(txDto())).toEqual({
      id: 'TX-1',
      date: '2024-09-02',
      time: '09:00',
      type: 'Deposit',
      description: 'Deposit',
      amount: 5000,
      status: 'Completed'
    });
  });

  it('maps OUT withdrawals to negative amounts', () => {
    const t = toTransaction(txDto({ transaction_type: 'WITHDRAWAL', side: 'OUT', amount: 250 }));
    expect(t?.type).toBe('Withdrawal');
    expect(t?.amount).toBe(-250);
  });

  it('skips currency exchange rows', () => {
    expect(toTransaction(txDto({ transaction_type: 'CURRENCY EXCHANGE', side: 'EXCHANGE' }))).toBeNull();
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
