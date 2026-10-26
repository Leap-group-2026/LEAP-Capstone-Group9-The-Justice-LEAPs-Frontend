import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OrderSide } from './transactions.models';

export interface CreateOrderRequest {
  side: OrderSide;
  accountId: number;
  instrumentId: number;
  quantity: number;
}

export interface CreateOrderResponse {
  order_id: number;
  created_at: string;
}

export interface OrderHistoryApiResponse {
  orderId: number;
  ticker: string;
  side: string;
  quantity: number;
  pricePerUnit: number;
  status: string;
  totalPrice: number;
  createdAt: string | null;
  executedAt: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class OrdersApiService {
  private readonly http = inject(HttpClient);

  private readonly apiBaseUrl = this.resolveApiBaseUrl();

  getOrderHistory(accountId: number): Observable<OrderHistoryApiResponse[]> {
    return this.http.get<OrderHistoryApiResponse[]>(
      `${this.apiBaseUrl}/orders/account/${accountId}`,
      { headers: this.createAuthHeaders() }
    );
  }

  // Orders are PENDING when accepted and fill asynchronously; poll getOrderHistory for the outcome.
  placeOrder(body: CreateOrderRequest): Observable<CreateOrderResponse> {
    return this.http.post<CreateOrderResponse>(
      `${this.apiBaseUrl}/orders`,
      body,
      { headers: this.createAuthHeaders() }
    );
  }

  private resolveApiBaseUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:8080';
    }

    return environment.springUrl;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.resolveAuthToken();

    if (!token) {
      return new HttpHeaders();
    }

    return new HttpHeaders({
      Authorization: `Bearer ${token}`
    });
  }

  private resolveAuthToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const tokenKeys = ['authToken', 'jwtToken', 'token', 'jwt'];

    for (const key of tokenKeys) {
      const value = window.localStorage.getItem(key)?.trim();
      if (value) {
        return value;
      }
    }

    return null;
  }
}
