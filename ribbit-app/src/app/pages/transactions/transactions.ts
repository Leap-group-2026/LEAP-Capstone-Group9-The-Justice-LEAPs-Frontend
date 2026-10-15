import { CommonModule } from '@angular/common';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, catchError, finalize, of, switchMap } from 'rxjs';
import { describeHttpError } from '../../shared/http-error';
import { CurrentAccountService } from '../../shared/services/current-account.service';
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

    const action = mode === 'deposit' ? 'deposit' : 'withdrawal';
    this.fundsError.set(describeHttpError(error, `Unable to complete the ${action}. Please try again.`));
  }

  private insufficientFundsMessage(balance: number): string {
    return `Insufficient funds. You have ${this.formatCurrency(balance)} available.`;
  }

  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }
}
