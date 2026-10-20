import { CommonModule } from '@angular/common';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, of, switchMap, timeout } from 'rxjs';
import { describeHttpError } from '../../shared/http-error';
import { AccountContextService } from '../../shared/services/account-context.service';
import { CurrentAccountService } from '../../shared/services/current-account.service';
import { InstrumentsApiService } from '../../shared/services/instruments-api.service';
import { TransactionsApiService } from '../../shared/services/transactions-api.service';
import {
  AccountDto,
  FundingMethod,
  OrderEventDto,
  Transaction,
  TransactionStatus
} from '../../shared/services/transactions.models';
import {
  TransactionsService,
  dollarsToCents,
  orderIdFromTransactionId,
  splitLocalDateTime
} from '../../shared/services/transactions.service';

type FundsStep = 'form' | 'review' | 'success';
type Currency = 'USD' | 'CAD' | 'EUR' | 'GBP' | 'INR' | 'JPY';
export type FundsMode = 'deposit' | 'withdraw';

export const MAX_TRANSFER_AMOUNT = 100000;
// Matches the backend: digits with at most 2 decimal places.
const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;

interface OrderHistoryState {
  loading: boolean;
  error: string | null;
  events: OrderEventDto[];
}


@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrls: ['./transactions.scss']
})
export class Transactions {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transactionsService = inject(TransactionsService);
  private readonly currentAccount = inject(CurrentAccountService);
  private readonly accountContext = inject(AccountContextService);
  private readonly instrumentsApi = inject(InstrumentsApiService);
  private readonly transactionsApi = inject(TransactionsApiService);

  // Funding methods for deposits and withdrawals
  readonly fundingMethods: { id: FundingMethod; label: string }[] = [
    { id: 'bank', label: 'Bank Account' },
    { id: 'debit', label: 'Debit Card' }
  ];

  // Icons
  readonly icons: Record<string, string> = {
    plus: 'M12 5v14 M5 12h14',
    external: 'M7 17 17 7 M7 7h10v10',
    chevron: 'M9 6l6 6-6 6'
  };

  // Data state
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly account = signal<AccountDto | null>(null);
  readonly accountName = signal('');
  readonly noAccount = signal(false);
  readonly transactions = signal<Transaction[]>([]);
  readonly orderHistory = signal<Record<number, OrderHistoryState>>({});

  // UI state
  readonly expandedTransactionId = signal<string | null>(null);

  // Deposit / withdraw modal state
  readonly showFundsModal = signal(false);
  readonly fundsMode = signal<FundsMode>('deposit');
  readonly fundsStep = signal<FundsStep>('form');
  readonly fundsError = signal('');
  readonly submitting = signal(false);
  readonly balanceAfterTransfer = signal<number | null>(null);
  fundsAmount = '';
  fundsMethod: FundingMethod = 'bank';

  // Currency exchange modal state
  readonly currencies: Currency[] = ['USD', 'CAD', 'EUR', 'GBP', 'INR', 'JPY'];
  readonly showCurrencyExchangeModal = signal(false);
  readonly exchangeRate = signal<number | null>(null);
  readonly exchangeRateLoading = signal(false);
  readonly exchangeSubmitting = signal(false);
  readonly exchangeError = signal('');
  readonly exchangeSuccess = signal('');
  exchangeFrom: Currency = 'USD';
  exchangeTo: Currency = 'CAD';
  exchangeAmount = '';
  private readonly forexPriceCache = new Map<string, { price: number; expiresAt: number }>();
  private readonly forexCacheDurationMs = 5 * 60 * 1000;

  // Filter state
  readonly searchQuery = signal('');
  readonly typeFilter = signal('all');
  readonly statusFilter = signal('all');

  readonly filteredTransactions = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const type = this.typeFilter();
    const status = this.statusFilter();

    return this.transactions().filter(t =>
      (!query ||
        t.id.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        !!t.instrument?.toLowerCase().includes(query)) &&
      (type === 'all' || t.type.toLowerCase() === type) &&
      (status === 'all' || t.status.toLowerCase() === status)
    );
  });

  readonly availableCashCents = computed(() => {
    const account = this.account();
    return account ? dollarsToCents(account.balance) : 0;
  });

  readonly accountEnding = computed(() => {
    const account = this.account();
    return account ? String(account.accountId).slice(-4) : '';
  });

  readonly totalDeposits = computed(() =>
    this.transactions()
      .filter(t => t.type === 'Deposit' && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  readonly totalWithdrawals = computed(() =>
    Math.abs(
      this.transactions()
        .filter(t => t.type === 'Withdrawal' && t.status === 'Completed')
        .reduce((sum, t) => sum + t.amount, 0)
    )
  );

  readonly totalTransactionValue = computed(() =>
    this.transactions()
      .filter(t => t.status === 'Completed')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  );

  readonly completedTransactionsCount = computed(
    () => this.transactions().filter(t => t.status === 'Completed').length
  );

  constructor() {
    // Browser only: the route is prerendered and there is no token on the server.
    afterNextRender(() => {
      this.load();
      this.openModalFromQueryParam();
    });
  }

  // The dashboard links here with ?action=deposit (or withdraw) to open the modal.
  private openModalFromQueryParam(): void {
    const action = this.route.snapshot.queryParamMap.get('action');
    if (action === 'deposit' || action === 'withdraw') {
      this.openFundsModal(action);
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { action: null },
        queryParamsHandling: 'merge',
        replaceUrl: true
      });
    }
  }

  load(refreshAccount = false): void {
    this.loading.set(true);
    this.error.set(null);

    this.currentAccount
      .load(refreshAccount)
      .pipe(
        switchMap(account => {
          this.account.set(account);
          this.noAccount.set(!account);
          if (!account) {
            this.transactions.set([]);
            return of([]);
          }
          this.loadAccountName(account.accountId);
          return this.transactionsService.getActivity(account.accountId);
        }),
        catchError(error => {
          this.error.set(describeHttpError(error, 'Unable to load your transactions.'));
          this.loading.set(false);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(activity => {
        this.transactions.set(activity);
        this.loading.set(false);
      });
  }

  // The name is a nice-to-have; a failure here shouldn't block the page.
  private loadAccountName(accountId: number): void {
    this.transactionsService
      .getAccount(accountId)
      .pipe(
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(summary => this.accountName.set(summary.name));
  }

  get availableCash(): number {
    return this.availableCashCents() / 100;
  }

  // Format helpers
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  // Dates are local calendar dates with no zone, so build the Date from parts.
  formatDate(dateStr: string): string {
    if (!dateStr) {
      return '—';
    }
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  // "14:30" -> "2:30 PM", shown as wall-clock time.
  formatTime(timeStr: string): string {
    if (!timeStr) {
      return '';
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`;
  }

  formatDateTime(value: string): string {
    const { date, time } = splitLocalDateTime(value);
    return `${this.formatDate(date)} · ${this.formatTime(time)}`;
  }

  getAmountDisplay(amount: number): string {
    return amount >= 0 ? `+${this.formatCurrency(amount)}` : this.formatCurrency(amount);
  }

  getStatusBadgeClass(status: TransactionStatus): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  // Filter and search
  onSearchChange(value: string): void {
    this.searchQuery.set(value);
  }

  onTypeFilterChange(event: Event): void {
    this.typeFilter.set((event.target as HTMLSelectElement).value);
  }

  onStatusFilterChange(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.searchQuery.set('');
    this.typeFilter.set('all');
    this.statusFilter.set('all');
  }

  // Strictly parsed amount, or null when the input isn't a plain number with at most 2 decimals.
  parseAmount(value: string): number | null {
    const trimmed = value.trim();
    return AMOUNT_PATTERN.test(trimmed) ? Number(trimmed) : null;
  }

  getReviewAmount(): number {
    return this.parseAmount(this.fundsAmount) ?? 0;
  }

  // Estimate shown before confirming; the success step uses the backend's balance.
  getEstimatedBalance(): number {
    const amount = this.getReviewAmount();
    return this.fundsMode() === 'deposit' ? this.availableCash + amount : this.availableCash - amount;
  }

  fundingMethodLabel(): string {
    return this.fundingMethods.find(m => m.id === this.fundsMethod)?.label ?? 'Bank Account';
  }

  // Transaction details
  toggleTransactionDetails(id: string): void {
    const expanding = this.expandedTransactionId() !== id;
    this.expandedTransactionId.set(expanding ? id : null);

    const orderId = orderIdFromTransactionId(id);
    if (expanding && orderId !== null) {
      this.loadOrderHistory(orderId);
    }
  }

  isTransactionExpanded(id: string): boolean {
    return this.expandedTransactionId() === id;
  }

  historyFor(id: string): OrderHistoryState | null {
    const orderId = orderIdFromTransactionId(id);
    return orderId === null ? null : this.orderHistory()[orderId] ?? null;
  }

  private loadOrderHistory(orderId: number): void {
    const existing = this.orderHistory()[orderId];
    if (existing && (existing.loading || !existing.error)) {
      return;
    }

    this.setOrderHistory(orderId, { loading: true, error: null, events: [] });
    this.transactionsService
      .getOrderHistory(orderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: events => this.setOrderHistory(orderId, { loading: false, error: null, events }),
        error: error =>
          this.setOrderHistory(orderId, {
            loading: false,
            error: describeHttpError(error, 'Unable to load order history.'),
            events: []
          })
      });
  }

  private setOrderHistory(orderId: number, state: OrderHistoryState): void {
    this.orderHistory.update(current => ({ ...current, [orderId]: state }));
  }

  // Deposit / withdraw modal
  openFundsModal(mode: FundsMode = 'deposit'): void {
    const account = this.account() ?? this.accountContext.getKnownSelectedAccount();
    if (mode === 'deposit' && account?.accountFrozen) {
      this.accountContext.requestFrozenNotice(account.accountId);
      return;
    }
    this.fundsMode.set(mode);
    this.fundsStep.set('form');
    this.fundsAmount = '';
    this.fundsMethod = 'bank';
    this.fundsError.set('');
    this.balanceAfterTransfer.set(null);
    this.showFundsModal.set(true);
  }

  setFundsMode(mode: FundsMode): void {
    if (this.fundsStep() === 'form') {
      this.fundsMode.set(mode);
      this.fundsError.set('');
    }
  }

  closeFundsModal(): void {
    // Keep the modal open until an in-flight request settles.
    if (this.submitting()) {
      return;
    }
    this.showFundsModal.set(false);
    this.fundsError.set('');
  }

  validateFundsForm(): boolean {
    this.fundsError.set('');
    const raw = this.fundsAmount.trim();

    if (!raw) {
      this.fundsError.set('Amount is required.');
      return false;
    }

    const amount = this.parseAmount(raw);

    if (amount === null) {
      this.fundsError.set(
        /^\d*\.\d{3,}$/.test(raw)
          ? 'Amount can have at most 2 decimal places.'
          : 'Enter a valid amount, like 250 or 250.50.'
      );
      return false;
    }

    if (amount <= 0) {
      this.fundsError.set('Amount must be greater than $0.00.');
      return false;
    }

    if (amount > MAX_TRANSFER_AMOUNT) {
      this.fundsError.set('Amount cannot exceed $100,000.');
      return false;
    }

    // The balance can change after loading, so the backend's check is still handled on submit.
    if (this.fundsMode() === 'withdraw' && this.account() && amount > this.availableCash) {
      this.fundsError.set(this.insufficientFundsMessage(this.availableCash));
      return false;
    }

    return true;
  }

  reviewFunds(): void {
    if (this.validateFundsForm()) {
      this.fundsStep.set('review');
    }
  }

  backToFundsForm(): void {
    this.fundsStep.set('form');
    this.fundsError.set('');
  }

  confirmFunds(): void {
    const account = this.account();
    if (this.submitting() || !account) {
      return;
    }
    if (!this.validateFundsForm()) {
      this.fundsStep.set('form');
      return;
    }

    const mode = this.fundsMode();
    const request = { amount: this.getReviewAmount(), fundingMethod: this.fundsMethod };
    const transfer$ =
      mode === 'deposit'
        ? this.transactionsService.deposit(account.accountId, request)
        : this.transactionsService.withdraw(account.accountId, request);

    this.submitting.set(true);
    this.fundsError.set('');
    transfer$
      .pipe(
        finalize(() => this.submitting.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: response => {
          this.balanceAfterTransfer.set(response.balance);
          this.currentAccount.updateBalance(account.accountId, response.balance);
          this.fundsStep.set('success');
          this.load(true);
        },
        error: error => this.handleFundsError(error, mode)
      });
  }

  private handleFundsError(error: unknown, mode: FundsMode): void {
    this.fundsStep.set('form');

    if (!(error instanceof HttpErrorResponse)) {
      this.fundsError.set(describeHttpError(error));
      return;
    }

    if (error.status === 404) {
      this.fundsError.set('This account is no longer available. Reload the page and try again.');
      return;
    }

    // Insufficient funds: the balance changed since the page loaded, so show the current one.
    if (error.status === 400 && error.error?.fieldName === 'balance') {
      this.fundsError.set('Insufficient funds.');
      this.currentAccount
        .load(true)
        .pipe(
          catchError(() => EMPTY),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe(account => {
          if (account) {
            this.account.set(account);
            this.fundsError.set(this.insufficientFundsMessage(account.balance));
          }
        });
      return;
    }

    if (this.isFrozenAccountError(error)) {
      const accountId = this.account()?.accountId;
      if (accountId) this.accountContext.requestFrozenNotice(accountId);
    }

    const action = mode === 'deposit' ? 'deposit' : 'withdrawal';
    this.fundsError.set(describeHttpError(error, `Unable to complete the ${action}. Please try again.`));
  }

  private insufficientFundsMessage(balance: number): string {
    return `Insufficient funds. You have ${this.formatCurrency(balance)} available.`;
  }

  private isFrozenAccountError(error: HttpErrorResponse): boolean {
    const body = typeof error.error === 'object' && error.error !== null
      ? JSON.stringify(error.error)
      : String(error.error ?? '');
    return body.toLowerCase().includes('frozen');
  }

  // Currency exchange modal
  openCurrencyExchangeModal(): void {
    const account = this.account() ?? this.accountContext.getKnownSelectedAccount();
    if (account?.accountFrozen) {
      this.accountContext.requestFrozenNotice(account.accountId);
      return;
    }
    this.exchangeFrom = 'USD';
    this.exchangeTo = 'CAD';
    this.exchangeAmount = '';
    this.exchangeError.set('');
    this.exchangeSuccess.set('');
    this.exchangeRate.set(null);
    this.showCurrencyExchangeModal.set(true);
    this.loadExchangeRate();
  }

  closeCurrencyExchangeModal(): void {
    if (this.exchangeSubmitting()) return;
    this.showCurrencyExchangeModal.set(false);
    this.exchangeError.set('');
    this.exchangeSuccess.set('');
  }

  onExchangeCurrencyChange(): void {
    this.exchangeError.set('');
    this.exchangeSuccess.set('');
    this.exchangeRate.set(null);
    this.loadExchangeRate();
  }

  // Rates are quoted as USD/XXX, so non-USD bases use the inverse.
  loadExchangeRate(): void {
    if (this.exchangeFrom === this.exchangeTo) {
      this.exchangeError.set('Choose two different currencies.');
      return;
    }

    const fromUsd = this.exchangeFrom === 'USD';
    const currencyPair = `USD/${fromUsd ? this.exchangeTo : this.exchangeFrom}`;
    const cachedPrice = this.forexPriceCache.get(currencyPair);
    if (cachedPrice && cachedPrice.expiresAt > Date.now()) {
      this.exchangeRate.set(fromUsd ? cachedPrice.price : 1 / cachedPrice.price);
      return;
    }

    this.exchangeRateLoading.set(true);
    this.instrumentsApi
      .getForexPrice(currencyPair)
      .pipe(
        timeout(10000),
        finalize(() => this.exchangeRateLoading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: instrument => {
          const price = Number(instrument.price);
          const rate = fromUsd ? price : 1 / price;
          if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(rate)) {
            this.exchangeRate.set(null);
            this.exchangeError.set('The exchange rate is unavailable right now.');
            return;
          }

          this.forexPriceCache.set(currencyPair, {
            price,
            expiresAt: Date.now() + this.forexCacheDurationMs
          });
          this.exchangeRate.set(rate);
        },
        error: () => this.exchangeError.set('Unable to load the exchange rate. Please try again.')
      });
  }

  get convertedExchangeAmount(): number | null {
    const amount = Number(this.exchangeAmount);
    const rate = this.exchangeRate();
    return rate !== null && Number.isFinite(amount) ? amount * rate : null;
  }

  formatExchangeRate(): string {
    const rate = this.exchangeRate();
    return rate === null ? '--' : rate.toLocaleString('en-US', {
      minimumFractionDigits: 4,
      maximumFractionDigits: 8
    });
  }

  submitCurrencyExchange(): void {
    this.exchangeError.set('');
    this.exchangeSuccess.set('');
    const amount = Number(this.exchangeAmount);
    const accountId = this.account()?.accountId;

    if (this.exchangeFrom === this.exchangeTo) {
      this.exchangeError.set('Choose two different currencies.');
    } else if (!Number.isFinite(amount) || amount <= 0) {
      this.exchangeError.set('Enter an amount greater than 0.');
    } else if (this.exchangeRate() === null) {
      this.exchangeError.set('Wait for the exchange rate to load before submitting.');
    } else if (accountId === undefined) {
      this.exchangeError.set('Select an account before exchanging currency.');
    } else {
      this.exchangeSubmitting.set(true);
      this.transactionsApi
        .exchangeCurrency({
          baseAndExchange: `${this.exchangeFrom}/${this.exchangeTo}`,
          amount,
          side: 'EXCHANGE',
          accountId,
          transactionType: 'CURRENCY EXCHANGE'
        })
        .pipe(
          timeout(15000),
          // Keeps the header selector and stored balance in sync for the other pages.
          switchMap(() =>
            this.accountContext.refreshAccount(accountId).pipe(
              catchError(error => {
                console.error('Currency exchange completed but account refresh failed', error);
                return of(null);
              })
            )
          ),
          finalize(() => this.exchangeSubmitting.set(false)),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe({
          next: account => {
            this.exchangeSuccess.set(
              account
                ? 'Currency exchange submitted successfully. Your account balance and portfolio have been updated.'
                : 'Currency exchange submitted successfully, but the account balance could not be refreshed.'
            );
            this.load(true);
          },
          error: error => {
            console.error('Unable to complete currency exchange', error);
            if (error instanceof HttpErrorResponse && this.isFrozenAccountError(error)) {
              this.accountContext.requestFrozenNotice(accountId);
            }
            this.exchangeError.set('Unable to complete the currency exchange. Please try again.');
          }
        });
    }
  }

  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }
}
