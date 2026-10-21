import { CommonModule } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { InstrumentApiResponse, InstrumentsApiService } from '../../shared/services/instruments-api.service';
import { PortfolioValueService } from '../../shared/services/portfolio-value.service';
import { PortfolioSnapshot, PortfolioSnapshotsApiService } from '../../shared/services/portfolio-snapshots-api.service';

type Period = '3D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
type Destination =
  | 'dashboard'
  | 'portfolio'
  | 'trade'
  | 'orders'
  | 'transactions'
  | 'account'
  | 'logout';

interface Holding {
  symbol: string;
  name: string;
  type: 'Stock' | 'Crypto' | 'Forex';
  quantity: number;
  currentPrice: number;
  averageCost: number;
}

interface AccountPosition {
  ticker: string;
  asset_name: string;
  asset_type: string;
  quantity: number;
  average_price: number;
  total_price: number;
}

interface Order {
  id: string;
  instrument: string;
  type: 'Market' | 'Limit';
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  status: 'Pending' | 'Filled' | 'Cancelled';
  date: string;
  time: string;
}

interface PerformancePoint {
  date: string;
  value: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly instrumentsApi = inject(InstrumentsApiService);
  private readonly portfolioValueService = inject(PortfolioValueService);
  private readonly portfolioSnapshotsApi = inject(PortfolioSnapshotsApiService);

  selectedPeriod: Period = '1M';

  readonly user = this.createUser();

  readonly snapshotLabel = 'Oct 7, 2026, 2:32 PM ET';
  readonly availableCash = this.readStoredBalance();
  private readonly apiPortfolioValue = signal(0);
  portfolioValueLoading = true;
  performanceLoading = true;
  performanceError = false;
  private snapshots: PerformancePoint[] = [];

  ngOnInit(): void {
    const accountId = this.readAccountId();

    if (accountId === null) {
      this.portfolioValueLoading = false;
      return;
    }
    this.loadPositions();

    this.portfolioValueService.getPortfolioValue(accountId).subscribe({
      next: value => {
        this.apiPortfolioValue.set(value);
        this.portfolioValueLoading = false;
      },
      error: error => {
        console.error('Unable to load portfolio value', error)
        this.portfolioValueLoading = false;
      }
    });

    this.portfolioSnapshotsApi.getByAccountId(accountId).subscribe({
      next: snapshots => {
        this.snapshots = snapshots
          .filter(snapshot => Number.isFinite(snapshot.portfolioValue) && !Number.isNaN(Date.parse(snapshot.snapshotDate)))
          .map(snapshot => this.toPerformancePoint(snapshot))
          .sort((first, second) => Date.parse(first.date) - Date.parse(second.date));
        this.performanceLoading = false;
      },
      error: error => {
        console.error('Unable to load portfolio snapshots', error);
        this.performanceError = true;
        this.performanceLoading = false;
      }
    });
  }
  private loadPositions(): void {
    const accessToken = localStorage.getItem('token');
    const accountId = this.readAccountId();

    if (!accessToken || accountId === null) {
      console.warn('Missing token or account ID; skipped positions lookup.');
      return;
    }

    this.http
      .get<AccountPosition[]>(
        `${environment.springUrl}/positions/account/${accountId}`,
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${accessToken}`
          })
        }
      )
      .subscribe({
        next: positions => {
          forkJoin(
            positions.map(position => this.getCurrentPrice(position).pipe(
              map(currentPrice => ({ position, currentPrice }))
            ))
          ).subscribe(holdings => {
            this.holdings = holdings.map(({ position, currentPrice }) => ({
              symbol: position.ticker,
              name: position.asset_name,
              type: this.getHoldingType(position),
              quantity: position.quantity,
              averageCost: position.average_price,
              currentPrice
            }))
              .sort((first, second) =>
                this.marketValue(second) - this.marketValue(first)
              )
              .slice(0, 5)
          });
        },
        error: error => {
          console.error('Positions lookup failed:', error);
        }
      });
  }

  private getCurrentPrice(position: AccountPosition) {
    const instrumentRequest = this.usesPairPrice(position)
      ? this.instrumentsApi.getForexPrice(position.ticker)
      : this.instrumentsApi.getByTicker(position.ticker);
    const fallbackPrice = position.quantity > 0
      ? position.total_price / position.quantity
      : position.average_price;

    return instrumentRequest.pipe(
      map((instrument: InstrumentApiResponse) =>
        Number.isFinite(instrument.price) ? instrument.price : fallbackPrice
      ),
      catchError(error => {
        console.error(`Unable to load current price for ${position.ticker}`, error);
        return of(fallbackPrice);
      })
    );
  }

  private createUser() {
    const user = this.authService.getUserProfile();
    const firstName = user.name.trim().split(/\s+/)[0] ?? '';

    return { ...user, firstName };
  }

  private readStoredBalance(): number {
    const balance = Number(typeof localStorage === 'undefined' ? null : localStorage.getItem('balance'));
    return Number.isFinite(balance) ? balance : 0;
  }

  // TODO: Replace this hardcoded list with an initially empty Holding[].
  // Populate it from the positions API after transforming and sorting the response.
   holdings: Holding[] = []
    /*{
      symbol: 'AAPL',
      name: 'Apple Inc.',
      quantity: 80,
      currentPrice: 228.42,
      averageCost: 210
    },
    {
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      quantity: 120,
      currentPrice: 142.87,
      averageCost: 120
    },
    {
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      quantity: 40,
      currentPrice: 425.60,
      averageCost: 400
    },
    {
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      quantity: 60,
      currentPrice: 589.21,
      averageCost: 550
    },
    {
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      quantity: 30,
      currentPrice: 248.50,
      averageCost: 260
    }
  ];*/
  // TODO: Add loadPositions() near the other private helper methods.
  // Read the token and account ID, call /positions/account/{accountId},
  // transform each response into Holding, calculate market value, sort highest
  // to lowest, and keep only the first five before assigning this.holdings.
  

  readonly orders: Order[] = [
    {
      id: 'RBT-1048',
      instrument: 'TSLA',
      type: 'Limit',
      side: 'Buy',
      quantity: 10,
      price: 240,
      status: 'Pending',
      date: '2026-10-07',
      time: '2:18 PM ET'
    },
    {
      id: 'RBT-1047',
      instrument: 'AAPL',
      type: 'Market',
      side: 'Buy',
      quantity: 10,
      price: 226.80,
      status: 'Filled',
      date: '2026-10-07',
      time: '10:42 AM ET'
    },
    {
      id: 'RBT-1046',
      instrument: 'MSFT',
      type: 'Limit',
      side: 'Sell',
      quantity: 5,
      price: 430,
      status: 'Cancelled',
      date: '2026-10-06',
      time: '3:05 PM ET'
    },
    {
      id: 'RBT-1045',
      instrument: 'NVDA',
      type: 'Market',
      side: 'Buy',
      quantity: 20,
      price: 140.50,
      status: 'Filled',
      date: '2026-10-06',
      time: '11:16 AM ET'
    }
  ];

  readonly icons: Record<string, string> = {
    external: 'M7 17 17 7 M7 7h10v10',
    plus: 'M12 5v14 M5 12h14'
  };

  readonly periods: Period[] = ['3D', '1W', '1M', '3M', '1Y', 'ALL'];

  readonly periodDescriptions: Record<Period, string> = {
    '3D': 'past 3 days',
    '1W': 'past week',
    '1M': 'past month',
    '3M': 'past 3 months',
    '1Y': 'past year',
    ALL: 'all time'
  };

  get holdingsValue(): number {
    return this.round(
      this.holdings.reduce((sum, item) => sum + this.marketValue(item), 0)
    );
  }

  get portfolioValue(): number {
    return this.apiPortfolioValue() + this.availableCash;
  }

  get todayGain(): number {
    return this.round(this.portfolioValue - this.previousClose);
  }

  get totalCostBasis(): number {
    return this.round(
      this.holdings.reduce(
        (sum, item) => sum + (this.isForex(item) ? 0 : item.quantity * item.averageCost),
        0
      )
    );
  }

  get totalGain(): number {
    return this.round(
      this.holdings.reduce(
        (sum, item) => sum + (this.isForex(item) ? 0 : this.gain(item)),
        0
      )
    );
  }

  get totalGainPercent(): number {
    const initialCapital = this.totalCostBasis + this.availableCash;
    return initialCapital > 0 ? this.totalGain / initialCapital : 0;
  }

  get todayGainPercent(): number {
    return this.previousClose > 0 ? this.todayGain / this.previousClose : 0;
  }

  private get previousClose(): number {
    return this.snapshots.length
      ? this.snapshots[this.snapshots.length - 1].value
      : this.portfolioValue;
  }

  get openOrders(): number {
    return this.orders.filter(order => order.status === 'Pending').length;
  }

  get series(): PerformancePoint[] {
    if (!this.snapshots.length) return [];
    if (this.selectedPeriod === 'ALL') return this.snapshots;

    const latestDate = Date.parse(this.snapshots[this.snapshots.length - 1].date);
    const days = { '3D': 3, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }[this.selectedPeriod];
    const startDate = latestDate - days * 86400000;
    const filtered = this.snapshots.filter(snapshot => Date.parse(snapshot.date) >= startDate);

    return filtered.length ? filtered : [this.snapshots[this.snapshots.length - 1]];
  }

  get periodGain(): number {
    if (this.series.length < 2) return 0;
    return this.round(this.series[this.series.length - 1].value - this.series[0].value);
  }

  get periodGainPercent(): number {
    return this.series[0]?.value ? this.periodGain / this.series[0].value : 0;
  }

  get chartDomain(): { min: number; max: number } {
    const values = this.series.map(point => point.value);
    if (!values.length) return { min: 0, max: 1 };
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = Math.max((high - low) * .2, 100);

    return { min: low - padding, max: high + padding };
  }

  get chartTicks(): { value: number; y: number }[] {
    const { min, max } = this.chartDomain;

    return [0, 1, 2, 3].map(index => ({
      value: max - ((max - min) * index) / 3,
      y: 16 + (188 * index) / 3
    }));
  }

  get linePath(): string {
    return this.series
      .map((point, index) =>
        `${index === 0 ? 'M' : 'L'} ${this.chartX(index)} ${this.chartY(point.value)}`
      )
      .join(' ');
  }

  get areaPath(): string {
    return `${this.linePath} L 900 216 L ${this.chartX(0)} 216 Z`;
  }

  get lastPoint(): { x: number; y: number } {
    return {
      x: 900,
      y: this.chartY(this.series[this.series.length - 1].value)
    };
  }

  get dateLabels(): { date: string; fraction: number }[] {
    return [0, .25, .5, .75, 1].map(fraction => ({
      date: new Date(
        this.chartStartDate + (this.chartEndDate - this.chartStartDate) * fraction
      ).toISOString(),
      fraction
    }));
  }

  get dateLabelFormat(): string {
    if (this.series.length < 2) return 'MMM d';

    const firstDate = Date.parse(this.series[0].date);
    const lastDate = Date.parse(this.series[this.series.length - 1].date);
    return lastDate - firstDate < 2 * 86400000 ? 'HH:mm' : 'MMM d';
  }

  get dateLabelTimezone(): string {
    return this.dateLabelFormat === 'HH:mm' ? '-0400' : 'UTC';
  }

  marketValue(holding: Holding): number {
    return this.round(holding.quantity * holding.currentPrice);
  }

  gain(holding: Holding): number {
    if (this.isForex(holding)) return 0;

    return this.round(
      holding.quantity * (holding.currentPrice - holding.averageCost)
    );
  }

  gainPercent(holding: Holding): number {
    if (this.isForex(holding)) return 0;

    return (holding.currentPrice - holding.averageCost) / holding.averageCost;
  }

  isForex(holding: Holding): boolean {
    return holding.type === 'Forex';
  }

  absolute(value: number): number {
    return Math.abs(value);
  }

  sign(value: number): string {
    return value < 0 ? '−' : '+';
  }

  selectPeriod(period: Period): void {
    this.selectedPeriod = period;
  }

  navigate(destination: Destination): void {
    if (destination === 'logout') {
      this.authService.logout();
      this.router.navigate(['/login']);
    } else {
      this.router.navigate([`/${destination}`]);
    }
  }

  // The deposit modal lives on the Transactions page; ?action=deposit opens it.
  addFunds(): void {
    this.router.navigate(['/transactions'], { queryParams: { action: 'deposit' } });
  }

  support(): void {
    console.log('Support requested');
  }

  private chartX(index: number): number {
    const timestamp = Date.parse(this.series[index].date);
    const duration = Math.max(this.chartEndDate - this.chartStartDate, 1);
    return 72 + ((timestamp - this.chartStartDate) / duration) * 828;
  }

  private get chartStartDate(): number {
    const latestDate = this.latestSnapshotDate;
    if (this.selectedPeriod === 'ALL') return Date.parse(this.snapshots[0]?.date) || latestDate;

    const days = { '3D': 3, '1W': 7, '1M': 30, '3M': 90, '1Y': 365 }[this.selectedPeriod];
    return latestDate - days * 86400000;
  }

  private get chartEndDate(): number {
    return this.latestSnapshotDate;
  }

  private get latestSnapshotDate(): number {
    return Date.parse(this.snapshots[this.snapshots.length - 1]?.date) || Date.now();
  }

  private chartY(value: number): number {
    const { min, max } = this.chartDomain;
    return 204 - ((value - min) / (max - min)) * 188;
  }

  private toPerformancePoint(snapshot: PortfolioSnapshot): PerformancePoint {
    return {
      date: snapshot.snapshotDate,
      value: this.round(Number(snapshot.portfolioValue))
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private getHoldingType(position: AccountPosition): Holding['type'] {
    const assetType = position.asset_type.toUpperCase();

    if (assetType.includes('FOREX')) {
      return 'Forex';
    }

    if (assetType.includes('CRYPTO')) {
      return 'Crypto';
    }

    return 'Stock';
  }

  private usesPairPrice(position: AccountPosition): boolean {
    const assetType = position.asset_type.toUpperCase();
    return assetType.includes('FOREX');
  }

  private readAccountId(): number | null {
    const accountId = Number(typeof localStorage === 'undefined' ? null : localStorage.getItem('accountId'));
    return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
  }
}
