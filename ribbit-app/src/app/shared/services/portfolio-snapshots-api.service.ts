import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PortfolioSnapshot {
  portfolioSnapshotId: number;
  accountId: number;
  portfolioValue: number;
  snapshotDate: string;
}

@Injectable({ providedIn: 'root' })
export class PortfolioSnapshotsApiService {
  private readonly http = inject(HttpClient);

  getByAccountId(accountId: number): Observable<PortfolioSnapshot[]> {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token');

    return this.http.get<PortfolioSnapshot[]>(
      `${environment.springUrl}/portfolio-snapshots/account/${accountId}`,
      {
        headers: token
          ? new HttpHeaders({ Authorization: `Bearer ${token}` })
          : new HttpHeaders()
      }
    );
  }
}