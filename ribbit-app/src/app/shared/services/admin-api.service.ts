import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { forkJoin, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

export interface TopBoughtStock {
  ticker: string;
  totalVolume: number;
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

  getTopBoughtStocks(): Observable<TopBoughtStock[]> {
    return this.http.get<TopBoughtStock[]>(`${this.apiBaseUrl}/admin/analytics/top-bought`, {
      headers: this.authHeaders()
    });
  }

  getMoneyMoved(days = 30): Observable<DailyMoneyMoved[]> {
    return this.http.get<DailyMoneyMoved[]>(`${this.apiBaseUrl}/admin/analytics/money-moved`, {
      headers: this.authHeaders(),
      params: { days }
    });
  }

  findUserByEmail(email: string): Observable<AdminUserLookup> {
    return this.http.get<AdminUserLookup>(`${this.apiBaseUrl}/admin/users/by-email`, {
      headers: this.authHeaders(),
      params: { email }
    });
  }

  private authHeaders(): HttpHeaders {
    const token = typeof window === 'undefined'
      ? null
      : window.localStorage.getItem('token');

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }
}
