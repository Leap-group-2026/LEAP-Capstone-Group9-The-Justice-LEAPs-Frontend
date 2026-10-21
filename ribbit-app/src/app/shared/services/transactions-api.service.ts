import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

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
      { headers: this.createAuthHeaders(), responseType: 'text' as const }
    );
  }

  private createAuthHeaders(): HttpHeaders {
    const storedToken = readToken();
    const token = storedToken?.trim().replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '') || null;
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}