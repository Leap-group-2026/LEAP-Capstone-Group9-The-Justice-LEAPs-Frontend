import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { forkJoin, map, Observable, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { InstrumentsApiService } from './instruments-api.service';

interface PositionApiResponse {
  ticker: string;
  quantity: number;
  total_price: number;
  asset_type?: string;
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
            this.getInstrument(position).pipe(
              map(instrument => this.isForex(position)
                ? position.total_price
                : instrument.price * position.quantity)
            )
          );

          return forkJoin(priceRequests).pipe(
            map(values => values.reduce((total, value) => total + value, 0))
          );
        })
      );
  }

  private getInstrument(position: PositionApiResponse): Observable<InstrumentApiResponse> {
    const assetType = position.asset_type?.toUpperCase() ?? '';
    const usesPairPrice = assetType.includes('FOREX');

    return usesPairPrice
      ? this.instrumentsApi.getForexPrice(position.ticker)
      : this.instrumentsApi.getByTicker(position.ticker);
  }

  private isForex(position: PositionApiResponse): boolean {
    return position.asset_type?.toUpperCase().includes('FOREX') ?? false;
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