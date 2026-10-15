import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class InstrumentsApiService {
  private readonly http = inject(HttpClient);

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

  private resolveAuthToken(): string | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage.getItem('token');
  }
}