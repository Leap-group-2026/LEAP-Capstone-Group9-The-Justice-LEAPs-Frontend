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
}

export interface TopBoughtStock {
  ticker: string;
  totalVolume: number;
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
      })
    });
  }

  getTopBoughtStocks(): Observable<TopBoughtStock[]> {
    return this.http.get<TopBoughtStock[]>(`${this.apiBaseUrl}/admin/analytics/top-bought`, {
      headers: this.authHeaders()
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
