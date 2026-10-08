import {
  Component,
  DestroyRef,
  inject,
  signal
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

type Side = 'Buy' | 'Sell';
type OrderType = 'Market' | 'Limit';
type Step = 'entry' | 'review' | 'success';
type Field = 'symbol' | 'quantity' | 'limitPrice';

export interface Instrument {
  readonly symbol: string;
  readonly name: string;
  readonly priceCents: number;
  readonly owned: number;
  readonly exchange: string;
}

export interface OrderSnapshot {
  readonly side: Side;
  readonly instrument: Instrument;
  readonly quantity: number;
  readonly type: OrderType;
  readonly priceCents: number;
  readonly totalCents: number;
  readonly cashAfterCents: number;
  readonly timeInForce: 'Day';
}

export interface MockSubmission {
  readonly id: string;
  readonly status: 'Submitted';
  readonly order: OrderSnapshot;
  readonly submittedAt: string;
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

function parseUsdCents(input: string): number | null {
  const value = input.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;

  const [dollars, fraction = ''] = value.split('.');
  const cents =
    Number(dollars) * 100 + Number(fraction.padEnd(2, '0'));

  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

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

  readonly cashCents = 1_250_000;
  readonly snapshotLabel = 'Oct 8, 2026 · Mock prices';

  readonly instruments: readonly Instrument[] = Object.freeze([
    Object.freeze({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      priceCents: 22_842,
      owned: 80,
      exchange: 'NASDAQ'
    }),
    Object.freeze({
      symbol: 'NVDA',
      name: 'NVIDIA Corporation',
      priceCents: 14_287,
      owned: 120,
      exchange: 'NASDAQ'
    }),
    Object.freeze({
      symbol: 'MSFT',
      name: 'Microsoft Corporation',
      priceCents: 42_560,
      owned: 40,
      exchange: 'NASDAQ'
    }),
    Object.freeze({
      symbol: 'SPY',
      name: 'SPDR S&P 500 ETF Trust',
      priceCents: 58_921,
      owned: 60,
      exchange: 'NYSE ARCA'
    }),
    Object.freeze({
      symbol: 'TSLA',
      name: 'Tesla, Inc.',
      priceCents: 24_850,
      owned: 30,
      exchange: 'NASDAQ'
    })
  ]);

  readonly icons: Record<string, string> = {
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    check: 'M5 12l4 4L19 6'
  };

  readonly step = signal<Step>('entry');
  readonly attempted = signal(false);
  readonly reviewSnapshot = signal<OrderSnapshot | null>(null);
  readonly submission = signal<MockSubmission | null>(null);
  readonly searchQuery = signal('');
  readonly showInstrumentModal = signal(false);
  readonly selectedInstrumentForModal = signal<Instrument | null>(null);

  private submissionCount = 0;

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
      symbol: new FormControl('NVDA', {
        nonNullable: true,
        validators: [
          Validators.required,
          control =>
            !control.value ||
            this.instruments.some(item => item.symbol === control.value)
              ? null
              : { unknownInstrument: true }
        ]
      }),
      quantity: new FormControl('20', {
        nonNullable: true,
        validators: [Validators.required, wholeShares]
      }),
      orderType: new FormControl<OrderType>('Market', {
        nonNullable: true,
        validators: [Validators.required]
      }),
      limitPrice: new FormControl('140.00', { nonNullable: true })
    },
    { validators: [control => this.validateOrder(control)] }
  );

  constructor() {
    this.form.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.step() === 'review') {
          this.reviewSnapshot.set(null);
          this.step.set('entry');
        }
      });
  }

  get selectedInstrument(): Instrument | undefined {
    return this.instruments.find(
      item => item.symbol === this.form.controls.symbol.value
    );
  }

  get filteredInstruments(): Instrument[] {
    const query = this.searchQuery().toLowerCase().trim();
    if (!query) return Array.from(this.instruments);

    return this.instruments.filter(
      instrument =>
        instrument.symbol.toLowerCase().includes(query) ||
        instrument.name.toLowerCase().includes(query)
    );
  }

  get side(): Side {
    return this.form.controls.side.value;
  }

  get isLimit(): boolean {
    return this.form.controls.orderType.value === 'Limit';
  }

  get priceCents(): number | null {
    return this.isLimit
      ? parseUsdCents(this.form.controls.limitPrice.value)
      : this.selectedInstrument?.priceCents ?? null;
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
    if (
      this.estimatedCents === null ||
      this.form.hasError('insufficientFunds') ||
      this.form.hasError('exceedsOwned')
    ) {
      return null;
    }

    return this.cashCents +
      (this.side === 'Sell' ? this.estimatedCents : -this.estimatedCents);
  }

  get maximumBuyQuantity(): number | null {
    return this.priceCents
      ? Math.floor(this.cashCents / this.priceCents)
      : null;
  }

  get fundsShortfall(): number {
    return Math.max(0, (this.estimatedCents ?? 0) - this.cashCents);
  }

  get displayedOrder(): OrderSnapshot | null {
    return this.step() === 'success'
      ? this.submission()?.order ?? null
      : this.reviewSnapshot();
  }

  get errorSummary(): string[] {
    const messages = (['symbol', 'quantity', 'limitPrice'] as const)
      .map(field => this.fieldError(field))
      .filter(Boolean);

    if (this.form.hasError('invalidSide')) {
      messages.push('Choose Buy or Sell.');
    }
    if (this.form.hasError('invalidOrderType')) {
      messages.push('Choose Market or Limit.');
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
        return `You own ${this.selectedInstrument?.owned ?? 0} shares. Short selling is not supported.`;
      }
      if (this.form.hasError('insufficientFunds')) {
        return 'Estimated order value exceeds your available cash.';
      }
      if (this.form.hasError('unsafeTotal')) {
        return 'Enter a smaller quantity to calculate a valid total.';
      }
    }

    if (field === 'limitPrice' && this.isLimit) {
      if (this.form.hasError('requiredPrice')) {
        return 'Limit price is required for a Limit order.';
      }
      if (this.form.hasError('invalidPrice')) {
        return 'Enter a price greater than $0.00 with up to 2 decimal places.';
      }
    }

    return '';
  }

  money(cents: number | null | undefined): string {
    return cents == null
      ? '—'
      : this.currencyFormatter.format(cents / 100);
  }

  selectSide(side: Side): void {
    this.form.controls.side.setValue(side);
  }

  selectType(type: OrderType): void {
    this.form.controls.orderType.setValue(type);
  }

  selectInstrument(symbol: string): void {
    this.form.controls.symbol.setValue(symbol);
    this.searchQuery.set('');
  }

  updateSearch(query: string): void {
    this.searchQuery.set(query);
  }

  openInstrumentModal(instrument: Instrument): void {
    this.selectedInstrumentForModal.set(instrument);
    this.showInstrumentModal.set(true);
  }

  closeInstrumentModal(): void {
    this.showInstrumentModal.set(false);
    this.selectedInstrumentForModal.set(null);
  }

  selectFromModal(): void {
    const instrument = this.selectedInstrumentForModal();
    if (instrument) {
      this.selectInstrument(instrument.symbol);
      this.closeInstrumentModal();
    }
  }

  reviewOrder(): void {
    this.attempted.set(true);
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();

    const instrument = this.selectedInstrument;
    const price = this.priceCents;
    const total = this.estimatedCents;
    const remaining = this.cashAfterCents;

    if (
      this.form.invalid ||
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
      type: this.form.controls.orderType.value,
      priceCents: price,
      totalCents: total,
      cashAfterCents: remaining,
      timeInForce: 'Day'
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

    if (this.step() !== 'review' || !order) return;

    this.submissionCount += 1;

    const result: MockSubmission = Object.freeze({
      id: `SIM-20261008-${String(this.submissionCount).padStart(3, '0')}`,
      status: 'Submitted',
      order,
      submittedAt: new Date().toISOString()
    });

    this.submission.set(result);
    this.step.set('success');
    this.focusHeading();
  }

  newOrder(): void {
    this.step.set('entry');
    this.reviewSnapshot.set(null);
    this.submission.set(null);
    this.attempted.set(false);

    this.form.reset({
      side: 'Buy',
      symbol: 'NVDA',
      quantity: '20',
      orderType: 'Market',
      limitPrice: '140.00'
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
    if (value.orderType !== 'Market' && value.orderType !== 'Limit') {
      errors['invalidOrderType'] = true;
    }

    const instrument = this.instruments.find(
      item => item.symbol === value.symbol
    );

    const quantityText = String(value.quantity ?? '').trim();
    const quantity = Number(quantityText);
    const validQuantity =
      /^\d+$/.test(quantityText) &&
      Number.isSafeInteger(quantity) &&
      quantity > 0;

    let price: number | null = instrument?.priceCents ?? null;

    if (value.orderType === 'Limit') {
      const limitText = String(value.limitPrice ?? '').trim();
      price = parseUsdCents(limitText);

      if (!limitText) errors['requiredPrice'] = true;
      else if (price === null) errors['invalidPrice'] = true;
    }

    if (
      instrument &&
      validQuantity &&
      value.side === 'Sell' &&
      quantity > instrument.owned
    ) {
      errors['exceedsOwned'] = true;
    }

    if (instrument && validQuantity && price !== null) {
      const total = quantity * price;

      if (!Number.isSafeInteger(total)) {
        errors['unsafeTotal'] = true;
      } else if (value.side === 'Buy' && total > this.cashCents) {
        errors['insufficientFunds'] = true;
      }
    }

    return Object.keys(errors).length ? errors : null;
  }

  private focusHeading(): void {
    queueMicrotask(() => {
      document.getElementById('trade-heading')?.focus();
    });
  }
}
