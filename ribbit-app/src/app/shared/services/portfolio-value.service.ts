import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { InstrumentsApiService } from './instruments-api.service';

interface PositionApiResponse {
  ticker: string;
  quantity: number;
}

interface InstrumentApiResponse {
  ticker: string;
  price: number;
}

@Injectable({
  providedIn: 'root'
})
export class PortfolioValueService {
  private readonly http = inject(HttpClient);
  private readonly instrumentsApi = inject(InstrumentsApiService);

  getPortfolioValue(accountId: number): Observable<number> {
    return this.http
      .get<PositionApiResponse[]>(
        `${environment.springUrl}/positions/account/${accountId}`,
        { headers: this.createAuthHeaders() }
      )
      .pipe(
        map(positions => positions.filter(position => position.ticker)),
        switchMap(positions => {
          if (!positions.length) {
            return [0];
          }

          const priceRequests = positions.map(position =>
            this.getInstrument(position.ticker).pipe(
              map(instrument => instrument.price * position.quantity)
            )
          );

          return forkJoin(priceRequests).pipe(
            map(values => values.reduce((total, value) => total + value, 0))
          );
        })
      );
  }

  private getInstrument(ticker: string): Observable<InstrumentApiResponse> {
    return ticker.includes('/')
      ? this.instrumentsApi.getForexPrice(ticker)
      : this.instrumentsApi.getByTicker(ticker);
  }

  private createAuthHeaders(): HttpHeaders {
    const token = this.resolveAuthToken();

    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private resolveAuthToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    for (const key of ['authToken', 'jwtToken', 'token', 'jwt']) {
      const value = window.localStorage.getItem(key)?.trim();
      if (value) {
        return value;
      }
    }

    return null;
  }
}