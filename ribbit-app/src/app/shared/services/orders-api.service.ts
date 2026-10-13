import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrderHistoryApiResponse {
  orderId: number;
  ticker: string;
  side: string;
  quantity: number;
  pricePerUnit: number;
  status: string;
  totalPrice: number;
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

  private resolveApiBaseUrl(): string {
    if (typeof window === 'undefined') {
      return 'http://localhost:8080';
    }

    return environment.apiUrl;
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
