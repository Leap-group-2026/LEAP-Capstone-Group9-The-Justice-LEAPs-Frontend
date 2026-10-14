import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { isPlatformBrowser } from '@angular/common';
import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';

export type PortfolioState = 'ready' | 'loading' | 'error';

export type PortfolioDestination =
  | 'dashboard'
  | 'portfolio'
  | 'trade'
  | 'orders'
  | 'transactions'
  | 'account'
  | 'logout';

type HoldingFilter = 'all' | 'gainers' | 'losers' | 'stocks' | 'etfs';

export interface Holding {
  symbol: string;
  name: string;
  type: 'Stock' | 'ETF';
  quantity: number;
  averagePurchasePrice: number;
  currentPrice: number;
}

interface AllocationItem {
  label: string;
  name: string;
  value: number;
  percentage: number;
  color: string;
}

interface UserAccount {
  accountId: number;
  userId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
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
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './portfolio.html',
  styleUrls: ['./portfolio.scss']
})
export class Portfolio implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  readonly accessToken = typeof localStorage === 'undefined'
    ? null
    : localStorage.getItem('token');

  state: PortfolioState = 'ready';
  accountId: number | null = null;
  availableCash = 12500;

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.loadAccount();
  }

  holdings: Holding[] = [];

  /*
  holdings: Holding[] = [
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: 'Stock',
      quantity: 80,
      averagePurchasePrice: 210,
      currentPrice: 228.42
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      type: 'Stock',
      quantity: 120,
      averagePurchasePrice: 120,
      currentPrice: 142.87
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      type: 'Stock',
      quantity: 40,
      averagePurchasePrice: 400,
      currentPrice: 425.60
    },
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      type: 'ETF',
      quantity: 60,
      averagePurchasePrice: 550,
      currentPrice: 589.21
    },
    {
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      type: 'Stock',
      quantity: 30,
      averagePurchasePrice: 260,
      currentPrice: 248.50
    }
  ];
  */

  readonly user = {
    name: 'Jordan Lee',
    initials: 'JL',
    accountEnding: '4821'
  };

  readonly snapshotLabel = 'Oct 7, 2026, 2:32 PM ET';
  readonly skeletonRows = [1, 2, 3, 4, 5];

  search = '';
  filter: HoldingFilter = 'all';
  selectedSymbol: string | null = null;

  readonly icons: Record<string, string> = {
    external:
      'M7 17 17 7 M7 7h10v10',
    warning:
      'M12 3 2 21h20L12 3Z M12 9v5 M12 17h.01',
    portfolio:
      'M8 7V5h8v2 M3 7h18v13H3z M3 12h18 M10 12v3h4v-3',
    search:
      'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6'
  };

  private readonly allocationColors = [
    '#c1ff39',
    '#91c83e',
    '#64a67b',
    '#8aaab1',
    '#c8bd87'
  ];

  get holdingsValue(): number {
    return this.round(
      this.holdings.reduce(
        (total, holding) => total + this.marketValue(holding),
        0
      )
    );
  }

  get portfolioValue(): number {
    return this.round(this.holdingsValue + this.availableCash);
  }

  get totalInvested(): number {
    return this.round(
      this.holdings.reduce(
        (total, holding) =>
          total + holding.quantity * holding.averagePurchasePrice,
        0
      )
    );
  }

  get totalGain(): number {
    return this.round(this.holdingsValue - this.totalInvested);
  }

  get totalGainPercent(): number {
    const initialCapital = this.totalInvested + this.availableCash;
    return initialCapital > 0 ? this.totalGain / initialCapital : 0;
  }

  get filteredHoldings(): Holding[] {
    const query = this.search.trim().toLowerCase();

    return this.holdings.filter(holding => {
      const matchesSearch =
        !query ||
        holding.symbol.toLowerCase().includes(query) ||
        holding.name.toLowerCase().includes(query);

      const matchesFilter =
        this.filter === 'all' ||
        (this.filter === 'gainers' && this.gain(holding) > 0) ||
        (this.filter === 'losers' && this.gain(holding) < 0) ||
        (this.filter === 'stocks' && holding.type === 'Stock') ||
        (this.filter === 'etfs' && holding.type === 'ETF');

      return matchesSearch && matchesFilter;
    });
  }

  get selectedHolding(): Holding | undefined {
    return this.filteredHoldings.find(
      holding => holding.symbol === this.selectedSymbol
    );
  }

  get allocation(): AllocationItem[] {
    const total = this.portfolioValue;

    if (total <= 0) return [];

    const items: AllocationItem[] = this.holdings.map((holding, index) => ({
      label: holding.symbol,
      name: holding.name,
      value: this.marketValue(holding),
      percentage: this.marketValue(holding) / total,
      color: this.allocationColors[index % this.allocationColors.length]
    }));

    if (this.availableCash > 0) {
      items.push({
        label: 'Cash',
        name: 'Available to invest',
        value: this.availableCash,
        percentage: this.availableCash / total,
        color: '#525e54'
      });
    }

    return items.filter(item => item.value > 0);
  }

  get allocationGradient(): string {
    const items = this.allocation;

    if (!items.length) return 'var(--border)';

    let position = 0;

    const stops = items.map(item => {
      const start = position;
      position += item.percentage * 100;
      return `${item.color} ${start}% ${position}%`;
    });

    return `conic-gradient(${stops.join(', ')})`;
  }

  get allocationDescription(): string {
    if (!this.allocation.length) return 'No portfolio allocation yet.';

    return 'Allocation of total portfolio value: ' +
      this.allocation
        .map(item => `${item.label} ${(item.percentage * 100).toFixed(1)}%`)
        .join(', ');
  }

  marketValue(holding: Holding): number {
    return this.round(holding.quantity * holding.currentPrice);
  }

  gain(holding: Holding): number {
    return this.round(
      holding.quantity *
      (holding.currentPrice - holding.averagePurchasePrice)
    );
  }

  gainPercent(holding: Holding): number {
    return holding.averagePurchasePrice > 0
      ? (holding.currentPrice - holding.averagePurchasePrice) /
        holding.averagePurchasePrice
      : 0;
  }

  selectHolding(holding: Holding): void {
    this.selectedSymbol = holding.symbol;
  }

  clearFilters(): void {
    this.search = '';
    this.filter = 'all';
  }

  navigate(destination: PortfolioDestination): void {
    if (destination === 'logout') {
      this.router.navigate(['/login']);
    } else {
      this.router.navigate([`/${destination}`]);
    }
  }

  retry(): void {
    this.state = 'ready';
  }

  private loadAccount(): void {
    if (!this.accessToken) {
      console.warn('No access token found; skipped account lookup.');
      return;
    }

    this.http
      .get<UserAccount[]>(`${environment.springUrl}/user/accounts`, {
        headers: new HttpHeaders({
          Authorization: `Bearer ${this.accessToken}`
        })
      })
      .subscribe({
        next: accounts => {
          const accountIds = accounts
            .map(account => account.accountId)
            .filter(accountId => Number.isFinite(accountId));

          this.accountId = accountIds.length ? Math.min(...accountIds) : null;
          console.log('Earliest account ID:', this.accountId);

          if (this.accountId !== null) {
            this.loadPositions(this.accountId);
          }
        },
        error: error => {
          console.error('Account lookup failed:', error);
        }
      });
  }

  private loadPositions(accountId: number): void {
    this.http
      .get<AccountPosition[]>(
        `${environment.springUrl}/positions/account/${accountId}`,
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${this.accessToken}`
          })
        }
      )
      .subscribe({
        next: positions => {
          this.holdings = positions.map(position => ({
            symbol: position.ticker,
            name: position.asset_name,
            type: position.asset_type.toUpperCase().includes('ETF')
              ? 'ETF'
              : 'Stock',
            quantity: position.quantity,
            averagePurchasePrice: position.average_price,
            currentPrice: position.quantity > 0
              ? position.total_price / position.quantity
              : position.average_price
          }));
          console.log('Positions loaded:', this.holdings.length);
        },
        error: error => {
          console.error('Positions lookup failed:', error);
        }
      });
  }

  absolute(value: number): number {
    return Math.abs(value);
  }

  sign(value: number): string {
    return value < 0 ? '−' : '+';
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}