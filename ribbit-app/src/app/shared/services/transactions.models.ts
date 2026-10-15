// DTOs mirror the Spring core service's JSON exactly, including its mix of
// camelCase and snake_case. Money is dollars (NUMERIC(18,4)); timestamps are
// naive local date-times like "2024-09-03T14:30:15" unless noted otherwise.

export type PortfolioSize = 'LOW' | 'BALANCED' | 'HIGH';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'PENDING' | 'FILLED' | 'DECLINED' | 'FAILED' | 'CANCELED';

// GET /user/accounts
export interface AccountDto {
  accountId: number;
  userId: number;
  balance: number;
  portfolioSize: PortfolioSize;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
}

// GET /accounts/{accountId}
// `user` also carries ssn_hash and pass_hash (backend bug). It is deliberately
// typed with only the fields we read so nothing else is ever referenced.
export interface AccountDetailDto {
  accountId: number;
  tradeType: string;
  user: { userId: number; name: string; email: string } | null;
  balance: number;
  portfolio_size: PortfolioSize;
  trade_type: string;
  created_at: string;
  account_active: boolean;
  userId: number;
}

// The only part of AccountDetailDto the app keeps.
export interface AccountSummary {
  accountId: number;
  balance: number;
  name: string;
  email: string;
}

// GET /transactions/account/{accountId}
export interface TransactionDto {
  transaction_id: number;
  transaction_type: 'DEPOSIT' | 'WITHDRAWAL' | 'CURRENCY EXCHANGE';
  amount: number;
  side: 'IN' | 'OUT' | 'EXCHANGE';
  account_id: number;
  happened_at: string;
}

// GET /orders/account/{accountId}
export interface OrderDto {
  orderId: number;
  ticker: string;
  side: OrderSide;
  quantity: number;
  pricePerUnit: number;
  status: OrderStatus;
  totalPrice: number;
  executedAt: string | null;
}

export type FundingMethod = 'bank' | 'debit';

// POST /transactions/account/{accountId}/deposit and /withdraw.
// amount: > 0, <= 100000, at most 2 decimal places, sent as a JSON number.
export interface FundsTransferRequest {
  amount: number;
  fundingMethod?: FundingMethod;
}

// `balance` is the account's new balance after the transfer.
export interface FundsTransferResponse {
  transaction: TransactionDto;
  balance: number;
}

// GET /orders/{orderId}/history
export interface OrderEventDto {
  event_id: number;
  order_id: number;
  account_id: number;
  snapshot: string;
  occurred_at: string;
  status: OrderStatus;
  side: OrderSide;
  quantity: number;
  total_price: number;
  instrument_id: number;
  snapshot_updated_at: string | null;
  snapshot_error: string | null;
}

// GET /positions/account/{accountId}
export interface PositionDto {
  position_id: number;
  account_id: number;
  instrument_id: number;
  ticker: string;
  asset_name: string;
  asset_type: string;
  currency: string;
  quantity: number;
  average_price: number;
  total_price: number;
  opened_at: string;
}

// View model used by the Transactions page.
export type TransactionType = 'Deposit' | 'Withdrawal' | 'Buy' | 'Sell';
export type TransactionStatus = 'Completed' | 'Pending' | 'Failed';

export interface Transaction {
  id: string;
  date: string;
  time: string;
  type: TransactionType;
  description: string;
  amount: number;
  status: TransactionStatus;
  instrument?: string;
  quantity?: number;
  price?: number;
}
