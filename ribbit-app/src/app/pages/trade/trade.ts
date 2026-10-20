import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EMPTY,
  Subscription,
  catchError,
  filter,
  map,
  of,
  switchMap,
  take,
  takeWhile,
  timer
} from 'rxjs';
import {
  InstrumentListItemApiResponse,
  InstrumentsApiService
} from '../../shared/services/instruments-api.service';
import { OrdersApiService } from '../../shared/services/orders-api.service';
import { CurrentAccountService } from '../../shared/services/current-account.service';
import { TransactionsService } from '../../shared/services/transactions.service';
import { OrderStatus, PositionDto } from '../../shared/services/transactions.models';

type Side = 'Buy' | 'Sell';
type Step = 'entry' | 'review' | 'success';
type Field = 'symbol' | 'quantity';

const CATALOG_PAGE_SIZE = 100;
const CATALOG_MAX_PAGES = 50;
const ORDER_POLL_INTERVAL_MS = 2_000;
const ORDER_POLL_MAX_ATTEMPTS = 30;

export interface Instrument {
  readonly symbol: string;
  readonly instrumentId: number;
  readonly name: string;
  readonly assetType: string;
  readonly priceCents: number | null;
}

export interface OrderSnapshot {
  readonly side: Side;
  readonly instrument: Instrument;
  readonly quantity: number;
  readonly priceCents: number | null;
  readonly totalCents: number;
  readonly cashAfterCents: number;
}

export interface OrderSubmission {
  readonly orderId: number;
  readonly status: OrderStatus;
  readonly order: OrderSnapshot;
  readonly createdAt: string;
}

function toPriceCents(price: number | null | undefined): number | null {
  return typeof price === 'number' && Number.isFinite(price) ? Math.round(price * 100) : null;
}

function toInstrument(item: InstrumentListItemApiResponse): Instrument {
  return Object.freeze({
    symbol: item.ticker,
    instrumentId: item.instrument_id,
    name: item.asset_name,
    assetType: item.asset_type,
    priceCents: toPriceCents(item.price)
  });
}

const wholeShares: ValidatorFn = (
  control: AbstractControl
): ValidationErrors | null => {
  const value = String(control.value ?? '').trim();

  if (!value) return null;

  return /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) >= 1
    ? null
    : { wholeShares: true };
};

@Component({
  selector: 'app-trade',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './trade.html',
  styleUrls: ['./trade.scss']
})
export class Trade {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly instrumentsApi = inject(InstrumentsApiService);
  private readonly ordersApi = inject(OrdersApiService);
  private readonly transactions = inject(TransactionsService);
  private readonly currentAccount = inject(CurrentAccountService);

  readonly account = this.currentAccount.account;
  readonly accountError = signal(false);
  readonly instruments = signal<readonly Instrument[]>([]);
  readonly catalogLoading = signal(true);
  readonly catalogError = signal(false);
  readonly positions = signal<readonly PositionDto[] | null>(null);

  get cashCents(): number | null {
    const balance = this.account()?.balance;
    return typeof balance === 'number' && Number.isFinite(balance) ? Math.round(balance * 100) : null;
  }

  readonly icons: Record<string, string> = {
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    check: 'M5 12l4 4L19 6'
  };

  readonly step = signal<Step>('entry');
  readonly attempted = signal(false);
  readonly reviewSnapshot = signal<OrderSnapshot | null>(null);
  readonly submission = signal<OrderSubmission | null>(null);
  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly searchQuery = signal('');
  readonly dropdownOpen = signal(false);
  readonly activeIndex = signal(-1);
  readonly chartPrices = signal<readonly number[]>([]);
  readonly chartDates = signal<readonly Date[]>([]);
  readonly chartLoading = signal(false);
  readonly chartError = signal(false);
  readonly chartSize = signal({ width: 400, height: 200 });

  private chartResizeObserver?: ResizeObserver;
  private pollSubscription?: Subscription;

  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });

  readonly form = new FormGroup(
    {
      side: new FormControl<Side>('Buy', {
        nonNullable: true,
        validators: [Validators.required]
      }),
      symbol: new FormControl('', {
        nonNullable: true,
        validators: [
          Validators.required,
          control =>
            !control.value ||
            this.instruments().some(item => item.symbol === control.value)
              ? null
              : { unknownInstrument: true }
        ]
      }),
      quantity: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, wholeShares]
      })
    },
    { validators: [control => this.validateOrder(control)] }
  );

  @ViewChild('searchField') searchField?: ElementRef<HTMLElement>;

  @ViewChild('priceChart') set priceChart(ref: ElementRef<SVGSVGElement> | undefined) {
    this.chartResizeObserver?.disconnect();
    if (!ref) return;

    this.chartResizeObserver ??= new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        this.chartSize.set({ width: Math.round(width), height: Math.round(height) });
      }
    });
    this.chartResizeObserver.observe(ref.nativeElement);
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.chartResizeObserver?.disconnect());

    this.form.controls.symbol.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(symbol => {
        if (symbol) {
          this.loadChart(symbol);
          this.refreshPrice(symbol);
        } else {
          this.resetChart();
        }
      });

    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.step() === 'review') {
          this.reviewSnapshot.set(null);
          this.step.set('entry');
        }
      });

    this.loadCatalog();
    this.loadAccount();
  }

  get selectedInstrument(): Instrument | undefined {
    return this.instruments().find(
      item => item.symbol === this.form.controls.symbol.value
    );
  }

  get filteredInstruments(): Instrument[] {
    const query = this.searchQuery().toLowerCase().trim();
    const all = this.instruments();
    if (!query) return [...all];

    return all.filter(
      instrument =>
        instrument.symbol.toLowerCase().includes(query) ||
        instrument.name.toLowerCase().includes(query)
    );
  }

  get accountLabel(): string {
    const account = this.account();
    return account ? `Account #${account.accountId}` : '—';
  }

  // Cash and positions are both needed to validate an order.
  get accountReady(): boolean {
    return this.cashCents !== null && this.positions() !== null;
  }

  ownedShares(symbol: string): number | null {
    const positions = this.positions();
    if (!positions) return null;

    return positions
      .filter(position => position.ticker === symbol)
      .reduce((total, position) => total + position.quantity, 0);
  }

  get selectedOwned(): number | null {
    const instrument = this.selectedInstrument;
    return instrument ? this.ownedShares(instrument.symbol) : null;
  }

  // The backend has no change %, so it is derived from the current price and the previous daily close.
  get selectedChangePct(): number | null {
    const instrument = this.selectedInstrument;
    const prices = this.chartPrices();
    if (!instrument || instrument.priceCents === null || prices.length < 2) return null;

    const previousClose = prices[prices.length - 2];
    if (!previousClose) return null;

    return ((instrument.priceCents / 100 - previousClose) / previousClose) * 100;
  }

  get chartGeometry() {
    const { width, height } = this.chartSize();
    const left = 44;
    const right = width - 8;
    const top = 8;
    const bottom = height - 24;
    return {
      width,
      height,
      left,
      right,
      top,
      bottom,
      midY: (top + bottom) / 2
    };
  }

  get chartPoints(): string {
    const prices = this.chartPrices();
    if (!prices.length) return '';

    const { left, right, top, bottom } = this.chartGeometry;
    const min = this.chartAxisMin;
    const max = Math.max(...prices);
    const range = max - min || 1;
    const plotWidth = right - left;
    const plotHeight = bottom - top;

    return prices
      .map((price, index) => {
        const x = left + (index / Math.max(prices.length - 1, 1)) * plotWidth;
        const y = bottom - ((price - min) / range) * plotHeight;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  get chartAxisMin(): number {
    const prices = this.chartPrices();
    return prices.length ? Math.min(...prices) : 0;
  }

  get chartMax(): number {
    return Math.max(...this.chartPrices());
  }

  get chartXLabels(): { x: number; label: string; anchor: 'start' | 'middle' | 'end' }[] {
    const dates = this.chartDates();
    const count = dates.length;
    if (count < 2) return [];

    const { left, right } = this.chartGeometry;
    const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
    const indexes = [...new Set([0, Math.round((count - 1) / 3), Math.round((2 * (count - 1)) / 3), count - 1])];

    return indexes.map(index => ({
      x: left + (index / (count - 1)) * (right - left) + (index === 0 ? 6 : 0),
      label: formatter.format(dates[index]),
      anchor: index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'
    }));
  }

  get chartChangePercent(): number | null {
    const prices = this.chartPrices();
    if (prices.length < 2 || prices[0] === 0) return null;

    return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
  }

  get side(): Side {
    return this.form.controls.side.value;
  }

  get priceCents(): number | null {
    return this.selectedInstrument?.priceCents ?? null;
  }

  get estimatedCents(): number | null {
    if (
      !this.selectedInstrument ||
      this.form.controls.quantity.invalid ||
      this.priceCents === null
    ) {
      return null;
    }

    const total =
      Number(this.form.controls.quantity.value) * this.priceCents;

    return Number.isSafeInteger(total) ? total : null;
  }

  get cashAfterCents(): number | null {
    const cash = this.cashCents;
    if (
      cash === null ||
      this.estimatedCents === null ||
      this.form.hasError('insufficientFunds') ||
      this.form.hasError('exceedsOwned')
    ) {
      return null;
    }

    return cash +
      (this.side === 'Sell' ? this.estimatedCents : -this.estimatedCents);
  }

  get maximumBuyQuantity(): number | null {
    const cash = this.cashCents;
    const price = this.priceCents;
    return cash !== null && price
      ? Math.floor(cash / price)
      : null;
  }

  get fundsShortfall(): number {
    const cash = this.cashCents;
    const estimated = this.estimatedCents;
    if (cash === null || estimated === null) return 0;

    return Math.max(0, estimated - cash);
  }

  get displayedOrder(): OrderSnapshot | null {
    return this.step() === 'success'
      ? this.submission()?.order ?? null
      : this.reviewSnapshot();
  }

  get errorSummary(): string[] {
    const messages = (['symbol', 'quantity'] as const)
      .map(field => this.fieldError(field))
      .filter(Boolean);

    if (this.form.hasError('invalidSide')) {
      messages.push('Choose Buy or Sell.');
    }

    return messages;
  }

  fieldError(field: Field): string {
    const control = this.form.controls[field];

    if (!this.attempted() && !control.touched) return '';

    if (field === 'symbol') {
      if (control.hasError('required')) {
        return 'Select an instrument to continue.';
      }
      if (control.hasError('unknownInstrument')) {
        return 'Select an instrument from the available list.';
      }
    }

    if (field === 'quantity') {
      if (control.hasError('required')) {
        return 'Quantity is required.';
      }
      if (control.hasError('wholeShares')) {
        return 'Enter a whole number of shares, at least 1.';
      }
      if (this.form.hasError('exceedsOwned')) {
        return `You own ${this.selectedOwned ?? 0} shares. Short selling is not supported.`;
      }
      if (this.form.hasError('insufficientFunds')) {
        return 'Estimated order value exceeds your available cash.';
      }
      if (this.form.hasError('unsafeTotal')) {
        return 'Enter a smaller quantity to calculate a valid total.';
      }
    }

    return '';
  }

  money(cents: number | null | undefined): string {
    return cents == null
      ? '—'
      : this.currencyFormatter.format(cents / 100);
  }

  formatChange(pct: number): string {
    const sign = pct > 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }

  selectSide(side: Side): void {
    this.form.controls.side.setValue(side);
  }

  selectInstrument(symbol: string): void {
    this.form.controls.symbol.setValue(symbol);
    this.closeDropdown();
  }

  openDropdown(): void {
    this.dropdownOpen.set(true);
  }

  updateSearch(query: string): void {
    this.searchQuery.set(query);
    this.dropdownOpen.set(true);
    this.activeIndex.set(-1);
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.closeDropdown();
      return;
    }

    if (!this.dropdownOpen()) return;

    const items = this.filteredInstruments;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;

      const current = this.activeIndex();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next =
        current < 0
          ? (step > 0 ? 0 : items.length - 1)
          : (current + step + items.length) % items.length;
      this.activeIndex.set(next);
    } else if (event.key === 'Enter') {
      const item = items[this.activeIndex()];
      if (item) {
        event.preventDefault();
        this.selectInstrument(item.symbol);
      }
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onDocumentMouseDown(event: MouseEvent): void {
    const container = this.searchField?.nativeElement;
    if (container && !container.contains(event.target as Node)) {
      this.closeDropdown();
    }
  }

  private closeDropdown(): void {
    this.dropdownOpen.set(false);
    this.activeIndex.set(-1);
  }

  private resetChart(): void {
    this.chartPrices.set([]);
    this.chartDates.set([]);
    this.chartLoading.set(false);
    this.chartError.set(false);
  }

  private loadChart(symbol: string): void {
    this.chartPrices.set([]);
    this.chartDates.set([]);
    this.chartError.set(false);
    this.chartLoading.set(true);

    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 6);

    this.instrumentsApi
      .getBarNumbers(
        symbol,
        '1Day',
        this.formatDate(startDate),
        this.formatDate(endDate)
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: prices => {
          if (this.selectedInstrument?.symbol !== symbol) return;

          const dates = this.estimateBarDates(prices.length);
          const validBars = prices
            .map((price, index) => ({ price, date: dates[index] }))
            .filter(bar => typeof bar.price === 'number' && Number.isFinite(bar.price));
          this.chartPrices.set(validBars.map(bar => bar.price));
          this.chartDates.set(validBars.map(bar => bar.date));
          this.chartLoading.set(false);
        },
        error: () => {
          if (this.selectedInstrument?.symbol !== symbol) return;

          this.chartLoading.set(false);
          this.chartError.set(true);
        }
      });
  }

  private estimateBarDates(count: number): Date[] {
    const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    while (isWeekend(cursor)) cursor.setDate(cursor.getDate() - 1);

    const dates: Date[] = [];
    for (let i = 0; i < count; i++) {
      dates.push(new Date(cursor));
      do {
        cursor.setDate(cursor.getDate() - 1);
      } while (isWeekend(cursor));
    }
    return dates.reverse();
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  reviewOrder(): void {
    this.attempted.set(true);
    this.submitError.set('');
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();

    const instrument = this.selectedInstrument;
    const price = this.priceCents;
    const total = this.estimatedCents;
    const remaining = this.cashAfterCents;

    if (
      this.form.invalid ||
      !this.accountReady ||
      !instrument ||
      price === null ||
      total === null ||
      remaining === null
    ) {
      return;
    }

    this.reviewSnapshot.set(Object.freeze({
      side: this.side,
      instrument,
      quantity: Number(this.form.controls.quantity.value),
      priceCents: price,
      totalCents: total,
      cashAfterCents: remaining
    }));

    this.step.set('review');
    this.focusHeading();
  }

  cancelReview(): void {
    this.reviewSnapshot.set(null);
    this.step.set('entry');
    this.focusHeading();
  }

  confirmOrder(): void {
    const order = this.reviewSnapshot();
    const account = this.account();

    if (
      this.step() !== 'review' ||
      !order ||
      !account ||
      !this.accountReady ||
      this.submitting()
    ) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set('');

    this.ordersApi
      .placeOrder({
        side: order.side === 'Buy' ? 'BUY' : 'SELL',
        accountId: account.accountId,
        instrumentId: order.instrument.instrumentId,
        quantity: order.quantity
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: response => {
          this.submitting.set(false);
          this.submission.set({
            orderId: response.order_id,
            status: 'PENDING',
            order,
            createdAt: response.created_at
          });
          this.step.set('success');
          this.focusHeading();
          this.pollOrderStatus(account.accountId, response.order_id);
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.submitError.set(this.describeOrderError(error));
        }
      });
  }

  newOrder(): void {
    this.pollSubscription?.unsubscribe();
    this.step.set('entry');
    this.reviewSnapshot.set(null);
    this.submission.set(null);
    this.submitError.set('');
    this.attempted.set(false);
    this.searchQuery.set('');

    this.form.reset({
      side: 'Buy',
      symbol: '',
      quantity: ''
    });

    this.focusHeading();
  }

  navigateTo(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }

  private validateOrder(control: AbstractControl): ValidationErrors | null {
    const value = control.getRawValue();
    const errors: ValidationErrors = {};

    if (value.side !== 'Buy' && value.side !== 'Sell') {
      errors['invalidSide'] = true;
    }

    const instrument = this.instruments().find(
      item => item.symbol === value.symbol
    );

    const quantityText = String(value.quantity ?? '').trim();
    const quantity = Number(quantityText);
    const validQuantity =
      /^\d+$/.test(quantityText) &&
      Number.isSafeInteger(quantity) &&
      quantity > 0;

    const price = instrument?.priceCents ?? null;

    if (instrument && validQuantity && value.side === 'Sell') {
      const owned = this.ownedShares(instrument.symbol);
      if (owned !== null && quantity > owned) {
        errors['exceedsOwned'] = true;
      }
    }

    if (instrument && validQuantity && price !== null) {
      const total = quantity * price;
      const cash = this.cashCents;

      if (!Number.isSafeInteger(total)) {
        errors['unsafeTotal'] = true;
      } else if (value.side === 'Buy' && cash !== null && total > cash) {
        errors['insufficientFunds'] = true;
      }
    }

    return Object.keys(errors).length ? errors : null;
  }

  private loadCatalog(): void {
    const collected: Instrument[] = [];

    const fetchPage = (pageNum: number): void => {
      this.instrumentsApi
        .getAll(pageNum, CATALOG_PAGE_SIZE)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: page => {
            collected.push(...page.map(toInstrument));

            if (page.length === CATALOG_PAGE_SIZE && pageNum < CATALOG_MAX_PAGES) {
              fetchPage(pageNum + 1);
              return;
            }

            this.instruments.set(collected);
            this.catalogLoading.set(false);
          },
          error: () => {
            this.catalogError.set(true);
            this.catalogLoading.set(false);
          }
        });
    };

    fetchPage(1);
  }

  private loadAccount(refresh = false): void {
    this.currentAccount
      .load(refresh)
      .pipe(
        switchMap(account =>
          account
            ? this.transactions.getPositions(account.accountId)
            : of([] as PositionDto[])
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: positions => {
          this.positions.set(positions);
          this.accountError.set(false);
          this.form.updateValueAndValidity({ emitEvent: false });
        },
        error: () => this.accountError.set(true)
      });
  }

  private refreshPrice(symbol: string): void {
    this.instrumentsApi
      .getByTicker(symbol)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: quote => {
          const priceCents = toPriceCents(quote.price);
          this.instruments.update(list =>
            list.map(item => (item.symbol === symbol ? Object.freeze({ ...item, priceCents }) : item))
          );
        }
      });
  }

  // Orders fill asynchronously, so poll the account's order history until the status is final.
  private pollOrderStatus(accountId: number, orderId: number): void {
    this.pollSubscription?.unsubscribe();

    this.pollSubscription = timer(ORDER_POLL_INTERVAL_MS, ORDER_POLL_INTERVAL_MS)
      .pipe(
        take(ORDER_POLL_MAX_ATTEMPTS),
        switchMap(() =>
          this.ordersApi.getOrderHistory(accountId).pipe(catchError(() => EMPTY))
        ),
        map(orders => orders.find(order => order.orderId === orderId)?.status),
        filter((status): status is string => status !== undefined),
        takeWhile(status => status === 'PENDING', true),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(status => this.applyOrderStatus(orderId, status as OrderStatus));
  }

  private applyOrderStatus(orderId: number, status: OrderStatus): void {
    const current = this.submission();
    if (!current || current.orderId !== orderId) return;

    this.submission.set({ ...current, status });

    if (status === 'FILLED') {
      this.loadAccount(true);
    }
  }

  private describeOrderError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 0) {
        return 'Could not reach the trading service. Check your connection and try again.';
      }
      if (error.status === 401 || error.status === 403) {
        return 'Your session has expired. Sign in again to place orders.';
      }

      const body: unknown = error.error;
      const fieldName =
        typeof body === 'object' && body !== null
          ? (body as { fieldName?: unknown }).fieldName
          : undefined;

      if (fieldName === 'balance') return 'Insufficient funds for this order.';
      if (fieldName === 'market_hours') {
        return 'The market is closed. Orders are accepted Monday to Friday, 9:30 AM to 4:00 PM ET.';
      }
    }

    return 'The order could not be placed. Please try again.';
  }


  private focusHeading(): void {
    queueMicrotask(() => {
      document.getElementById('trade-heading')?.focus();
    });
  }
}
