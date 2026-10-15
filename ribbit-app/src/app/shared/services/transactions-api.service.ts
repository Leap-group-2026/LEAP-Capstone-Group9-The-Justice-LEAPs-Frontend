import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CurrencyExchangeRequest {
  baseAndExchange: string;
  amount: number;
  side: 'EXCHANGE';
  accountId: number;
  transactionType: 'CURRENCY EXCHANGE';
}

@Injectable({ providedIn: 'root' })
export class TransactionsApiService {
  private readonly http = inject(HttpClient);

  exchangeCurrency(request: CurrencyExchangeRequest): Observable<string> {
    return this.http.post<string>(
      `${environment.springUrl}/user/transactions/exchange`,
      request,
      { headers: this.createAuthHeaders() }
    );
  }

  private createAuthHeaders(): HttpHeaders {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}