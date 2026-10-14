import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AccountDetailDto,
  AccountDto,
  AccountSummary,
  OrderDto,
  OrderEventDto,
  OrderStatus,
  PositionDto,
  Transaction,
  TransactionDto,
  TransactionStatus
} from './transactions.models';

export const TRANSACTION_ID_PREFIX = 'TX-';
export const ORDER_ID_PREFIX = 'ORD-';

// toFixed first so float error (1.005 * 100 = 100.4999...) can't flip a half cent down.
export function dollarsToCents(dollars: number): number {
  return Math.round(Number((dollars * 100).toFixed(2)));
}

// Backend timestamps have no zone, so they are split as plain text and never
// passed through `new Date(str)`, which would shift them by the browser offset.
export function splitLocalDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) {
    return { date: '', time: '' };
  }
  const [date, rest = ''] = value.split('T');
  return { date, time: rest.slice(0, 5) };
}

// Returns null for rows the frontend has no type for.
export function toTransaction(dto: TransactionDto): Transaction | null {
  if (dto.transaction_type === 'CURRENCY EXCHANGE' || dto.side === 'EXCHANGE') {
    // TODO(backend): 'CURRENCY EXCHANGE' rows have no frontend type and no defined amount direction; skipped.
    return null;
  }

  const isDeposit = dto.transaction_type === 'DEPOSIT';
  return {
    id: `${TRANSACTION_ID_PREFIX}${dto.transaction_id}`,
    ...splitLocalDateTime(dto.happened_at),
    type: isDeposit ? 'Deposit' : 'Withdrawal',
    description: isDeposit ? 'Deposit' : 'Withdrawal',
    amount: dto.side === 'IN' ? dto.amount : -dto.amount,
    // TODO(backend): transactions have no status column; every row is treated as completed.
    status: 'Completed'
  };
}

const ORDER_STATUS_MAP: Record<OrderStatus, TransactionStatus> = {
  FILLED: 'Completed',
  PENDING: 'Pending',
  DECLINED: 'Failed',
  FAILED: 'Failed',
  // CANCELED has no frontend status; flagged in the description instead.
  CANCELED: 'Failed'
};

export function orderToTransaction(dto: OrderDto): Transaction {
  const isBuy = dto.side === 'BUY';
  const filled = dto.status === 'FILLED';
  const verb = filled ? (isBuy ? 'Bought' : 'Sold') : (isBuy ? 'Buy' : 'Sell');
  const suffix = dto.status === 'CANCELED' ? ' · Cancelled' : '';

  return {
    id: `${ORDER_ID_PREFIX}${dto.orderId}`,
    // TODO(backend): unfilled orders have no timestamp in this list; placement time is only in /history.
    ...splitLocalDateTime(dto.executedAt),
    type: isBuy ? 'Buy' : 'Sell',
    description: `${verb} ${dto.quantity} ${dto.ticker}${suffix}`,
    amount: isBuy ? -dto.totalPrice : dto.totalPrice,
    status: ORDER_STATUS_MAP[dto.status] ?? 'Failed',
    instrument: dto.ticker,
    quantity: dto.quantity,
    price: dto.pricePerUnit
  };
}

// Newest first; rows without a date go last. Sort is stable, so ties keep the
// backend's own newest-first ordering.
export function sortNewestFirst(items: Transaction[]): Transaction[] {
  const key = (t: Transaction) => (t.date ? `${t.date} ${t.time}` : '');
  return [...items].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (!ka || !kb) {
      return ka ? -1 : kb ? 1 : 0;
    }
    return kb.localeCompare(ka);
  });
}

export function orderIdFromTransactionId(id: string): number | null {
  return id.startsWith(ORDER_ID_PREFIX) ? Number(id.slice(ORDER_ID_PREFIX.length)) : null;
}

@Injectable({
  providedIn: 'root'
})
export class TransactionsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.springUrl;

  getMyAccounts(): Observable<AccountDto[]> {
    return this.http.get<AccountDto[]>(`${this.baseUrl}/user/accounts`);
  }

  // TODO(backend): no "current user profile" endpoint; the name comes from here,
  // and this response leaks ssn_hash/pass_hash. Only name/email are read, the
  // rest of `user` is dropped immediately. Never store or log the raw response.
  getAccount(accountId: number): Observable<AccountSummary> {
    return this.http.get<AccountDetailDto>(`${this.baseUrl}/accounts/${accountId}`).pipe(
      map((dto) => ({
        accountId: dto.accountId,
        balance: dto.balance,
        name: dto.user?.name ?? '',
        email: dto.user?.email ?? ''
      }))
    );
  }

  getTransactions(accountId: number): Observable<TransactionDto[]> {
    return this.http.get<TransactionDto[]>(`${this.baseUrl}/transactions/account/${accountId}`);
  }

  getOrders(accountId: number): Observable<OrderDto[]> {
    return this.http.get<OrderDto[]>(`${this.baseUrl}/orders/account/${accountId}`);
  }

  getOrderHistory(orderId: number): Observable<OrderEventDto[]> {
    return this.http.get<OrderEventDto[]>(`${this.baseUrl}/orders/${orderId}/history`);
  }

  getPositions(accountId: number): Observable<PositionDto[]> {
    return this.http.get<PositionDto[]>(`${this.baseUrl}/positions/account/${accountId}`);
  }

  // TODO(backend): nothing writes transaction rows yet, so Buy/Sell activity comes from orders.
  getActivity(accountId: number): Observable<Transaction[]> {
    return forkJoin({
      transactions: this.getTransactions(accountId),
      orders: this.getOrders(accountId)
    }).pipe(
      map(({ transactions, orders }) =>
        sortNewestFirst([
          ...transactions.map(toTransaction).filter((t): t is Transaction => t !== null),
          ...orders.map(orderToTransaction)
        ])
      )
    );
  }
}
