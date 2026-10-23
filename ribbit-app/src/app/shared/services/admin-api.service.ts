import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

export interface CreateAdminRequest {
  email: string;
  password: string;
}

export interface CreatedAdmin {
  adminId: number;
  role: string;
  email: string;
  created_at: string;
}

export interface AdminOrder {
  order_id: number;
  account_id: number;
  instrument_id: number;
  side: string;
  quantity: number;
  total_price: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AdminAccount {
  accountId: number;
  userId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
  accountFrozen: boolean;
}

export interface AdminUser {
  userId?: number;
  email?: string;
  name?: string;
  role?: string;
}

export interface AdminOverview {
  orders: AdminOrder[];
  accounts: AdminAccount[];
  users: AdminUser[];
  transactions: AdminTransaction[];
}

export interface AdminTransaction {
  transaction_id: number;
  transaction_type: string;
  amount: number;
  currency?: string | null;
  side: string;
  account_id: number;
  happened_at: string;
}

export interface AdminUserLookup {
  userId: number;
  name: string;
  email: string;
  dateOfBirth: string;
  address: string;
  accounts: AdminAccount[];
}

// GET /admin/users: a user's profile without password hash, SSN hash or reset code
export interface AdminUserSummary {
  userId: number;
  name: string;
  email: string;
  dateOfBirth: string;
  address: string;
}

export interface PortfolioSizeCount {
  portfolioSize: string;
  accountCount: number;
}

export interface TopBoughtStock {
  ticker: string;
  totalVolume: number;
}

export interface ActiveAccountAnalytics {
  accountId: number;
  orderCount: number;
  filledQuantity: number;
  totalTradedValue: number;
  buyCount: number;
  sellCount: number;
}

export interface OrderStatusCount {
  status: string;
  orderCount: number;
  percentage: number;
}

// GET /admin/analytics/money-moved: one row per day with filled orders (days without fills are omitted)
export interface DailyMoneyMoved {
  date: string;       // YYYY-MM-DD, Eastern time
  buyTotal: number;
  sellTotal: number;
  orders: number;
}

@Injectable({
  providedIn: 'root'
})
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.springUrl;

  createAdmin(request: CreateAdminRequest): Observable<CreatedAdmin> {
    return this.http.post<CreatedAdmin>(`${this.apiBaseUrl}/admin`, request, {
      headers: this.authHeaders()
    });
  }

  getOverview(): Observable<AdminOverview> {
    return forkJoin({
      orders: this.http.get<AdminOrder[]>(`${this.apiBaseUrl}/admin/orders`, {
        headers: this.authHeaders()
      }),
      accounts: this.http.get<AdminAccount[]>(`${this.apiBaseUrl}/admin/accounts`, {
        headers: this.authHeaders()
      }),
      users: this.http.get<AdminUser[]>(`${this.apiBaseUrl}/admin/users`, {
        headers: this.authHeaders()
      }),
      transactions: this.http.get<AdminTransaction[]>(`${this.apiBaseUrl}/admin/transactions`, {
        headers: this.authHeaders()
      })
    });
  }

  getAccounts(): Observable<AdminAccount[]> {
    return this.http.get<AdminAccount[]>(`${this.apiBaseUrl}/admin/accounts`, {
      headers: this.authHeaders()
    });
  }

  getOrders(): Observable<AdminOrder[]> {
    return this.http.get<AdminOrder[]>(`${this.apiBaseUrl}/admin/orders`, {
      headers: this.authHeaders()
    });
  }

  getTransactions(): Observable<AdminTransaction[]> {
    return this.http.get<AdminTransaction[]>(`${this.apiBaseUrl}/admin/transactions`, {
      headers: this.authHeaders()
    });
  }

  freezeAccount(accountId: number): Observable<string> {
    return this.http.patch(`${this.apiBaseUrl}/accounts/freeze/${accountId}`, null, {
      headers: this.authHeaders(),
      responseType: 'text'
    });
  }

  unfreezeAccount(accountId: number): Observable<string> {
    return this.http.patch(`${this.apiBaseUrl}/accounts/unfreeze/${accountId}`, null, {
      headers: this.authHeaders(),
      responseType: 'text'
    });
  }

  getTopBoughtStocks(): Observable<TopBoughtStock[]> {
    return this.http.get<TopBoughtStock[]>(`${this.apiBaseUrl}/admin/analytics/top-bought`, {
      headers: this.authHeaders()
    });
  }

  getMostActiveAccounts(): Observable<ActiveAccountAnalytics[]> {
    return this.http.get<ActiveAccountAnalytics[]>(`${this.apiBaseUrl}/admin/analytics/active-accounts`, {
      headers: this.authHeaders()
    });
  }

  getMoneyMoved(days = 30): Observable<DailyMoneyMoved[]> {
    return this.http.get<DailyMoneyMoved[]>(`${this.apiBaseUrl}/admin/analytics/money-moved`, {
      headers: this.authHeaders(),
      params: { days }
    });
  }

  getUsers(): Observable<AdminUserSummary[]> {
    return this.http.get<AdminUserSummary[]>(`${this.apiBaseUrl}/admin/users`, {
      headers: this.authHeaders()
    });
  }

  // Profile plus every account; 404 when no user has this id
  findUserById(userId: number): Observable<AdminUserLookup> {
    return this.http.get<AdminUserLookup>(`${this.apiBaseUrl}/admin/users/${userId}`, {
      headers: this.authHeaders()
    });
  }

  // Includes closed and frozen accounts; 404 when no account has this id
  getAccountById(accountId: number): Observable<AdminAccount> {
    return this.http.get<AdminAccount>(`${this.apiBaseUrl}/admin/accounts/account/${accountId}`, {
      headers: this.authHeaders()
    });
  }

  getOrderStatuses(): Observable<OrderStatusCount[]> {
    return this.http.get<OrderStatusCount[]>(`${this.apiBaseUrl}/admin/analytics/order-statuses`, {
      headers: this.authHeaders()
    });
  }

  findUserByEmail(email: string): Observable<AdminUserLookup> {
    return this.http.get<AdminUserLookup>(`${this.apiBaseUrl}/admin/users/by-email`, {
      headers: this.authHeaders(),
      params: { email }
    });
  }

  getPortfolioSizeCounts(): Observable<PortfolioSizeCount[]> {
    return this.http.get<PortfolioSizeCount[]>(`${this.apiBaseUrl}/admin/analytics/portfolio-sizes`, {
      headers: this.authHeaders()
    });
  }

  private authHeaders(): HttpHeaders {
    const token = readToken();

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }
}
