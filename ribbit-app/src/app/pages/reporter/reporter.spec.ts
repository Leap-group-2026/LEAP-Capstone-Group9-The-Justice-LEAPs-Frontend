import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import {
  Reporter,
  addDays,
  compactDollars,
  easternToday,
  niceCeiling,
  shortDate,
  summarizeMoneyMoved
} from './reporter';

// 2026-10-19 12:00 Eastern: the last 30 days run Sep 20 to Oct 19, the prior 30 Aug 21 to Sep 19.
const NOW = new Date('2026-10-19T16:00:00Z');
const MONEY_URL = `${environment.springUrl}/admin/analytics/money-moved`;
const TOP_URL = `${environment.springUrl}/admin/analytics/top-bought`;
const ACTIVE_ACCOUNTS_URL = `${environment.springUrl}/admin/analytics/active-accounts`;
const ORDER_STATUSES_URL = `${environment.springUrl}/admin/analytics/order-statuses`;

const ROWS = [
  { date: '2026-08-20', buyTotal: 999, sellTotal: 0, orders: 1 },     // outside both windows
  { date: '2026-08-21', buyTotal: 500, sellTotal: 500, orders: 2 },   // first day of the prior window
  { date: '2026-09-19', buyTotal: 0, sellTotal: 1000, orders: 1 },    // last day of the prior window
  { date: '2026-09-20', buyTotal: 1200, sellTotal: 0, orders: 2 },    // first day shown
  { date: '2026-10-16', buyTotal: 1000, sellTotal: 400, orders: 3 },
  { date: '2026-10-19', buyTotal: 300.5, sellTotal: 99.5, orders: 2 } // today
];

describe('money moved helpers', () => {
  it('computes today in Eastern time, even when UTC has already moved on', () => {
    expect(easternToday(new Date('2026-10-20T02:30:00Z'))).toBe('2026-10-19');
    expect(easternToday(NOW)).toBe('2026-10-19');
  });

  it('adds days across month ends without time zone drift', () => {
    expect(addDays('2026-10-19', -29)).toBe('2026-09-20');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('builds all 30 calendar days with zeros for days without fills, and sums both windows', () => {
    const summary = summarizeMoneyMoved(ROWS, '2026-10-19');

    expect(summary.days).toHaveLength(30);
    expect(summary.days[0]).toEqual({ date: '2026-09-20', buyTotal: 1200, sellTotal: 0, orders: 2 });
    expect(summary.days[29]).toEqual({ date: '2026-10-19', buyTotal: 300.5, sellTotal: 99.5, orders: 2 });
    expect(summary.days[1]).toEqual({ date: '2026-09-21', buyTotal: 0, sellTotal: 0, orders: 0 });

    expect(summary.buyTotal).toBe(2500.5);
    expect(summary.sellTotal).toBe(499.5);
    expect(summary.total).toBe(3000);
    expect(summary.orders).toBe(7);
    expect(summary.priorTotal).toBe(2000);
    expect(summary.changePercent).toBe(50);
  });

  it('has no comparison when nothing filled in the prior window', () => {
    const summary = summarizeMoneyMoved([{ date: '2026-10-19', buyTotal: 10, sellTotal: 0, orders: 1 }], '2026-10-19');
    expect(summary.changePercent).toBeNull();
  });

  it('rounds the axis up to a readable maximum and formats compact dollars', () => {
    expect(niceCeiling(1400)).toBe(2000);
    expect(niceCeiling(2100)).toBe(2500);
    expect(niceCeiling(0)).toBe(1);
    expect(compactDollars(950)).toBe('$950');
    expect(compactDollars(4500)).toBe('$4.5k');
    expect(compactDollars(2000)).toBe('$2k');
    expect(compactDollars(1_200_000)).toBe('$1.2M');
    expect(shortDate('2026-09-20')).toBe('Sep 20');
  });
});

describe('Reporter money moved block', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    TestBed.configureTestingModule({
      imports: [Reporter],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.useRealTimers();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  async function render() {
    const fixture = TestBed.createComponent(Reporter);
    fixture.detectChanges();
    http.expectOne(TOP_URL).flush([]);
    http.expectOne(ACTIVE_ACCOUNTS_URL).flush([]);
    http.expectOne(ORDER_STATUSES_URL).flush([]);
    return fixture;
  }

  it('asks for 60 days and draws the total, the comparison and 30 day slots', async () => {
    const fixture = await render();
    const req = http.expectOne(r => r.url === MONEY_URL);
    expect(req.request.params.get('days')).toBe('60');
    req.flush(ROWS);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    const panel = el.querySelector('.money-panel') as HTMLElement;
    expect(panel.querySelector('.money-headline strong')?.textContent?.trim()).toBe('$3,000.00');
    expect(panel.querySelector('.money-change')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('▲ 50% vs prior 30 days');
    expect(panel.querySelector('.chart-count')?.textContent?.trim()).toBe('7 orders');
    expect(panel.querySelectorAll('.money-day')).toHaveLength(30);
    // 3 days with buys, 2 with sells; empty days draw no bars
    expect(panel.querySelectorAll('.money-bar.buy')).toHaveLength(3);
    expect(panel.querySelectorAll('.money-bar.sell')).toHaveLength(2);
    expect(panel.querySelector('.money-day:last-child title')?.textContent).toContain('$400.00');
  });

  it('says so when the analytics request fails', async () => {
    const fixture = await render();
    http.expectOne(r => r.url === MONEY_URL).flush('nope', { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.money-panel .chart-message')?.textContent?.trim())
      .toBe('Money moved is unavailable right now.');
  });
});
