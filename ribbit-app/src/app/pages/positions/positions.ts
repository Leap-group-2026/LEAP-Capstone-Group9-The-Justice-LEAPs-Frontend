import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { PageContainer } from '../../shared/components/page-container/page-container';
import { environment } from '../../environments/environment';

type PositionsState = 'loading' | 'ready' | 'error';

interface PositionRow {
  positionId: number;
  instrumentId: number;
  symbol: string;
  assetName: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
}

interface UserAccount {
  accountId: number;
}

interface AccountPosition {
  position_id: number;
  account_id: number;
  instrument_id: number;
  ticker: string;
  asset_name: string;
  asset_type: string;
  currency: string;
  quantity: number;
  average_price: number;
  total_price: number;
  opened_at: string;
}
@Component({
  imports: [CommonModule, PageContainer],
  selector: 'app-positions',
  styleUrl: './positions.scss',
  templateUrl: './positions.html',
})
export class Positions implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);

  state: PositionsState = 'loading';
  positions: PositionRow[] = [];
  accountId: number | null = null;
  errorMessage = '';

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadPositions();
    }
  }

  loadPositions(): void {
    this.state = 'loading';
    this.errorMessage = '';

    const accessToken = localStorage.getItem('token');
    if (!accessToken) {
      this.setError('You must be signed in to view your positions.');
      return;
    }

    const headers = new HttpHeaders({
      Authorization: `Bearer ${accessToken}`
    });

    this.http
      .get<UserAccount[]>(`${environment.springUrl}/user/accounts`, { headers })
      .subscribe({
        next: accounts => {
          const accountIds = accounts
            .map(account => account.accountId)
            .filter(accountId => Number.isFinite(accountId));

          this.accountId = accountIds.length ? Math.min(...accountIds) : null;

          if (this.accountId === null) {
            this.setError('No active account was found.');
            return;
          }

          this.http
            .get<AccountPosition[]>(
              `${environment.springUrl}/positions/account/${this.accountId}`,
              { headers }
            )
            .subscribe({
              next: positions => {
                this.positions = positions.map(position => this.mapPosition(position));
                this.state = 'ready';
              },
              error: error => this.handleRequestError(error, 'positions')
            });
        },
        error: error => this.handleRequestError(error, 'accounts')
      });
  }

  private mapPosition(position: AccountPosition): PositionRow {
    const currentPrice = position.quantity > 0
      ? position.total_price / position.quantity
      : null;
    const pnl = currentPrice === null
      ? null
      : position.total_price - position.quantity * position.average_price;

    return {
      positionId: position.position_id,
      instrumentId: position.instrument_id,
      symbol: position.ticker,
      assetName: position.asset_name,
      quantity: position.quantity,
      entryPrice: position.average_price,
      currentPrice,
      pnl,
      pnlPercent: position.average_price > 0 && currentPrice !== null
        ? (currentPrice - position.average_price) / position.average_price
        : null
    };
  }

  private handleRequestError(error: HttpErrorResponse, resource: string): void {
    const message = error.error?.message;
    this.setError(
      typeof message === 'string'
        ? message
        : `Unable to load ${resource}. Please try again.`
    );
  }

  private setError(message: string): void {
    this.errorMessage = message;
    this.state = 'error';
  }
}