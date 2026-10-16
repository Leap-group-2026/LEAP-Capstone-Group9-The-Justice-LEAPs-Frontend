import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InstrumentsApiService {
  private readonly http = inject(HttpClient);

  getByTicker(ticker: string): Observable<InstrumentApiResponse> {
    return this.http.get<InstrumentApiResponse>(
      `${environment.springUrl}/instruments/${this.encodeInstrumentReference(ticker)}`,
      { headers: this.createAuthHeaders() }
    );
  }

  getForexPrice(currencyPair: string): Observable<InstrumentApiResponse> {
    return this.http.post<InstrumentApiResponse>(
      `${environment.springUrl}/instruments/forex/price`,
      { currencyPair },
      { headers: this.createAuthHeaders() }
    );
  }

  getBarNumbers(
    symbol: string,
    timeframe: string,
    start: string,
    end: string
  ): Observable<number[]> {
    const params = new HttpParams()
      .set('symbols', symbol)
      .set('timeframe', timeframe)
      .set('start', start)
      .set('end', end);

    return this.http.get<number[]>(
      `${environment.springUrl}/instruments/bars`,
      { headers: this.createAuthHeaders(), params }
    );
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.resolveAuthToken();

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private encodeInstrumentReference(reference: string): string {
    return reference.split('/').map(encodeURIComponent).join('/');
  }

  private resolveAuthToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedToken = window.localStorage.getItem('token')
      ?? window.localStorage.getItem('authToken')
      ?? window.localStorage.getItem('jwtToken')
      ?? window.localStorage.getItem('jwt');

    return storedToken?.trim().replace(/^Bearer\s+/i, '').replace(/^"|"$/g, '') || null;
  }
}

export interface InstrumentApiResponse {
  instrument_id: number;
  ticker: string;
  asset_type: string;
  asset_name: string;
  currency: string;
  price: number;
  quote_time: string;
}