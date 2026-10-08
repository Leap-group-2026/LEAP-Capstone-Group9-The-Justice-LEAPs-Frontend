import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

type Period = '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
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
  quantity: number;
  currentPrice: number;
  averageCost: number;
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
export class Dashboard {
  private readonly router = inject(Router);

  selectedPeriod: Period = '1M';

  readonly user = {
    name: 'Jordan Lee',
    firstName: 'Jordan',
    initials: 'JL',
    accountEnding: '4821'
  };

  readonly snapshotLabel = 'Oct 7, 2026, 2:32 PM ET';
  readonly availableCash = 12500;
  readonly todayGain = 864.20;

  readonly holdings: Holding[] = [
    {
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
  ];

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

  readonly periods: Period[] = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

  readonly periodDescriptions: Record<Period, string> = {
    '1D': 'today',
    '1W': 'past week',
    '1M': 'past month',
    '3M': 'past 3 months',
    '1Y': 'past year',
    ALL: 'all time'
  };

  private readonly periodConfig: Record<
    Period,
    { start: number; days: number }
  > = {
    '1D': { start: 106885.40, days: 0 },
    '1W': { start: 106120, days: 7 },
    '1M': { start: 103925, days: 30 },
    '3M': { start: 102800, days: 92 },
    '1Y': { start: 98500, days: 365 },
    ALL: { start: 100500, days: 540 }
  };

  private readonly fluctuations = [
    0, -.018, .045, .015, .052, .022, .070, .036,
    .062, .010, .035, .076, .042, .105, .065, .072,
    .044, .081, .039, .112, .054, .069, .028, .079,
    .038, -.015, .034, .004, .060, .019, .078, .035,
    .062, .009, .045, .018, .038, -.012, .012, 0
  ];

  readonly performance: Record<Period, PerformancePoint[]> = {
    '1D': this.makeMockHistory('1D'),
    '1W': this.makeMockHistory('1W'),
    '1M': this.makeMockHistory('1M'),
    '3M': this.makeMockHistory('3M'),
    '1Y': this.makeMockHistory('1Y'),
    ALL: this.makeMockHistory('ALL')
  };

  get holdingsValue(): number {
    return this.round(
      this.holdings.reduce((sum, item) => sum + this.marketValue(item), 0)
    );
  }

  get portfolioValue(): number {
    return this.round(this.holdingsValue + this.availableCash);
  }

  get totalCostBasis(): number {
    return this.holdings.reduce(
      (sum, item) => sum + item.quantity * item.averageCost,
      0
    );
  }

  get totalGain(): number {
    return this.round(this.holdingsValue - this.totalCostBasis);
  }

  get totalGainPercent(): number {
    return this.totalGain / (this.totalCostBasis + this.availableCash);
  }

  get todayGainPercent(): number {
    return this.todayGain / (this.portfolioValue - this.todayGain);
  }

  get openOrders(): number {
    return this.orders.filter(order => order.status === 'Pending').length;
  }

  get series(): PerformancePoint[] {
    return this.performance[this.selectedPeriod];
  }

  get periodGain(): number {
    return this.round(this.series[this.series.length - 1].value - this.series[0].value);
  }

  get periodGainPercent(): number {
    return this.periodGain / this.series[0].value;
  }

  get chartDomain(): { min: number; max: number } {
    if (this.selectedPeriod === '1M') {
      return { min: 102500, max: 110000 };
    }

    const values = this.series.map(point => point.value);
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
    return `${this.linePath} L 900 216 L 16 216 Z`;
  }

  get lastPoint(): { x: number; y: number } {
    return {
      x: 900,
      y: this.chartY(this.series[this.series.length - 1].value)
    };
  }

  get dateLabels(): { date: string; fraction: number }[] {
    return [0, .25, .5, .75, 1].map(fraction => ({
      date: this.series[Math.round((this.series.length - 1) * fraction)].date,
      fraction
    }));
  }

  marketValue(holding: Holding): number {
    return this.round(holding.quantity * holding.currentPrice);
  }

  gain(holding: Holding): number {
    return this.round(
      holding.quantity * (holding.currentPrice - holding.averageCost)
    );
  }

  gainPercent(holding: Holding): number {
    return (holding.currentPrice - holding.averageCost) / holding.averageCost;
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
      this.router.navigate(['/login']);
    } else {
      this.router.navigate([`/${destination}`]);
    }
  }

  addFunds(): void {
    console.log('Add funds requested');
  }

  support(): void {
    console.log('Support requested');
  }

  private chartX(index: number): number {
    return 16 + (index / (this.series.length - 1)) * 884;
  }

  private chartY(value: number): number {
    const { min, max } = this.chartDomain;
    return 204 - ((value - min) / (max - min)) * 188;
  }

  private makeMockHistory(period: Period): PerformancePoint[] {
    const { start, days } = this.periodConfig[period];
    const end = this.portfolioValue;
    const count = this.fluctuations.length;
    const endDate = Date.UTC(2026, 9, 7, 18, 32);
    const duration = days === 0 ? 5 * 60 * 60 * 1000 : days * 86400000;
    const amplitude = Math.max(Math.abs(end - start), 1000);

    return this.fluctuations.map((fluctuation, index) => {
      const progress = index / (count - 1);

      return {
        date: new Date(endDate - duration * (1 - progress)).toISOString(),
        value: this.round(
          start + (end - start) * progress + fluctuation * amplitude
        )
      };
    });
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
