import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminApiService, DailyMoneyMoved, TopBoughtStock } from '../../shared/services/admin-api.service';

export const MONEY_WINDOW_DAYS = 30;

export interface MoneyDay {
  date: string;
  buyTotal: number;
  sellTotal: number;
  orders: number;
}

export interface MoneySummary {
  days: MoneyDay[];          // the last 30 calendar days, oldest first, zeros where nothing filled
  total: number;
  buyTotal: number;
  sellTotal: number;
  orders: number;
  priorTotal: number;        // the 30 days before that, for the comparison
  changePercent: number | null;
}

// Today's date in Eastern time, matching how the backend buckets fills.
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

// Date-only arithmetic on YYYY-MM-DD strings, done in UTC so no time zone can shift the day.
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Splits a 60-day response into the last 30 days (every calendar day) and the 30 before.
export function summarizeMoneyMoved(rows: DailyMoneyMoved[], today: string): MoneySummary {
  const byDate = new Map(rows.map(row => [row.date, row]));
  const start = addDays(today, -(MONEY_WINDOW_DAYS - 1));
  const priorStart = addDays(start, -MONEY_WINDOW_DAYS);

  const days: MoneyDay[] = [];
  for (let offset = 0; offset < MONEY_WINDOW_DAYS; offset++) {
    const date = addDays(start, offset);
    const row = byDate.get(date);
    days.push({
      date,
      buyTotal: Number(row?.buyTotal ?? 0),
      sellTotal: Number(row?.sellTotal ?? 0),
      orders: Number(row?.orders ?? 0)
    });
  }

  const buyTotal = days.reduce((sum, day) => sum + day.buyTotal, 0);
  const sellTotal = days.reduce((sum, day) => sum + day.sellTotal, 0);
  const total = buyTotal + sellTotal;
  const priorTotal = rows
    .filter(row => row.date >= priorStart && row.date < start)
    .reduce((sum, row) => sum + Number(row.buyTotal) + Number(row.sellTotal), 0);

  return {
    days,
    total,
    buyTotal,
    sellTotal,
    orders: days.reduce((sum, day) => sum + day.orders, 0),
    priorTotal,
    changePercent: priorTotal > 0 ? ((total - priorTotal) / priorTotal) * 100 : null
  };
}

// Rounds an axis maximum up to 1, 2, 2.5 or 5 times a power of ten.
export function niceCeiling(value: number): number {
  if (value <= 0) {
    return 1;
  }
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find(candidate => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

// $950, $4.5k, $1.2M
export function compactDollars(value: number): string {
  if (value >= 1_000_000) {
    return `$${trimZero(value / 1_000_000)}M`;
  }
  if (value >= 1_000) {
    return `$${trimZero(value / 1_000)}k`;
  }
  return `$${Math.round(value)}`;
}

function trimZero(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "Sep 20", read from the string so no time zone can move it
export function shortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

// Chart geometry, in viewBox units (shared with the trading volume chart's 780 x 260 frame)
const PLOT_LEFT = 56;
const PLOT_RIGHT = 760;
const BASELINE = 220;
const PLOT_HEIGHT = 190;

@Component({
  selector: 'app-reporter',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reporter.html',
  styleUrls: ['./reporter.scss']
})
export class Reporter implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly isLoading = signal(false);
  readonly topBoughtStocks = signal<TopBoughtStock[]>([]);

  readonly moneyLoading = signal(false);
  readonly moneyError = signal(false);
  readonly moneyRows = signal<DailyMoneyMoved[] | null>(null);
  readonly money = computed(() => {
    const rows = this.moneyRows();
    return rows ? summarizeMoneyMoved(rows, easternToday()) : null;
  });
  readonly moneyAxisMax = computed(() =>
    niceCeiling(Math.max(...(this.money()?.days ?? []).map(day => day.buyTotal + day.sellTotal), 0))
  );

  readonly compactDollars = compactDollars;
  readonly shortDate = shortDate;
  readonly axisTicks = [0, 0.25, 0.5, 0.75, 1];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadAnalytics();
      this.loadMoneyMoved();
    }
  }

  loadAnalytics(): void {
    this.isLoading.set(true);
    this.adminApi.getTopBoughtStocks().pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: stocks => this.topBoughtStocks.set(stocks),
      error: () => this.topBoughtStocks.set([])
    });
  }

  // 60 days in one call: the last 30 for the chart, the 30 before for the comparison.
  loadMoneyMoved(): void {
    this.moneyLoading.set(true);
    this.moneyError.set(false);
    this.adminApi.getMoneyMoved(MONEY_WINDOW_DAYS * 2).pipe(finalize(() => this.moneyLoading.set(false))).subscribe({
      next: rows => this.moneyRows.set(rows),
      error: () => {
        this.moneyRows.set(null);
        this.moneyError.set(true);
      }
    });
  }

  get maximumVolume(): number {
    return Math.max(...this.topBoughtStocks().map(stock => stock.totalVolume), 1);
  }

  volumeBarX(index: number): number {
    const chartWidth = 720;
    const barSlot = chartWidth / Math.max(this.topBoughtStocks().length, 1);
    return index * barSlot + barSlot * 0.2;
  }

  volumeBarWidth(): number {
    const chartWidth = 720;
    const barSlot = chartWidth / Math.max(this.topBoughtStocks().length, 1);
    return barSlot * 0.6;
  }

  volumeBarHeight(volume: number): number {
    return (volume / this.maximumVolume) * 190;
  }

  // Money moved chart geometry
  readonly moneyBaseline = BASELINE;

  moneySlotWidth(): number {
    return (PLOT_RIGHT - PLOT_LEFT) / MONEY_WINDOW_DAYS;
  }

  moneyBarX(index: number): number {
    return PLOT_LEFT + index * this.moneySlotWidth() + this.moneySlotWidth() * 0.18;
  }

  moneyBarWidth(): number {
    return this.moneySlotWidth() * 0.64;
  }

  moneyHeight(amount: number): number {
    return (amount / this.moneyAxisMax()) * PLOT_HEIGHT;
  }

  moneyTickY(tick: number): number {
    return BASELINE - tick * PLOT_HEIGHT;
  }

  // Date labels every 5 days, plus today
  showDateLabel(index: number): boolean {
    return index % 5 === 0 || index === MONEY_WINDOW_DAYS - 1;
  }

  dayTooltip(day: MoneyDay): string {
    if (day.orders === 0) {
      return `${shortDate(day.date)}: no filled orders`;
    }
    const money = (value: number) =>
      value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
    return `${shortDate(day.date)}: ${money(day.buyTotal + day.sellTotal)} · buys ${money(day.buyTotal)} · sells ${money(day.sellTotal)} · ${day.orders} ${day.orders === 1 ? 'order' : 'orders'}`;
  }
}
