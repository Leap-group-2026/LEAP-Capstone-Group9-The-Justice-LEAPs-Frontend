import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

@Injectable({
  providedIn: 'root'
})
export class InstrumentsApiService {
  private readonly http = inject(HttpClient);

  // GET /instruments is paginated; pageSize is the number of rows per page.
  getAll(pageNum = 1, pageSize = 100): Observable<InstrumentListItemApiResponse[]> {
    const params = new HttpParams()
      .set('pageNum', pageNum)
      .set('pageSize', pageSize);

    return this.http.get<InstrumentListItemApiResponse[]>(
      `${environment.springUrl}/instruments`,
      { headers: this.createAuthHeaders(), params }
    );
  }

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

  getCryptoBarNumbers(
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
      `${environment.springUrl}/instruments/crypto-bars`,
      { headers: this.createAuthHeaders(), params }
    );
  }

  getNews(): Observable<MarketNews[]> {
    return this.http.get<MarketNews[] | { news?: MarketNews[] }>(
      `${environment.springUrl}/instruments/news`,
      { headers: this.createAuthHeaders() }
    ).pipe(
      map(response => Array.isArray(response) ? response : response.news ?? [])
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
    return readToken();
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

export interface MarketNews {
  author: string;
  headline: string;
  url: string;
}

// Rows from GET /instruments: price and quote_time are null until a quote exists.
export interface InstrumentListItemApiResponse extends Omit<InstrumentApiResponse, 'price' | 'quote_time'> {
  price: number | null;
  quote_time: string | null;
}