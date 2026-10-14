import { CommonModule } from '@angular/common';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EMPTY, catchError, of, switchMap } from 'rxjs';
import { describeHttpError } from '../../shared/http-error';
import { CurrentAccountService } from '../../shared/services/current-account.service';
import {
  AccountDto,
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

type AddFundsStep = 'form' | 'review' | 'success';

interface OrderHistoryState {
  loading: boolean;
  error: string | null;
  events: OrderEventDto[];
}


const DEPOSITS_ENABLED = false;

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrls: ['./transactions.scss']
})
export class Transactions {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transactionsService = inject(TransactionsService);
  private readonly currentAccount = inject(CurrentAccountService);

  readonly depositsEnabled = DEPOSITS_ENABLED;

  // Funding methods for Add Funds
  readonly fundingMethods = [
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
  readonly showAddFundsModal = signal(false);
  readonly addFundsStep = signal<AddFundsStep>('form');
  readonly expandedTransactionId = signal<string | null>(null);

  // Form state
  addFundsAmount = '';
  addFundsFundingMethod = 'bank';
  addFundsError = '';

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
    afterNextRender(() => this.load());
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

  getReviewAmount(): number {
    return window.parseFloat(this.addFundsAmount) || 0;
  }

  getNewCashBalance(): number {
    return this.availableCash + this.getReviewAmount();
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

  // Add Funds modal
  openAddFundsModal(): void {
    this.addFundsStep.set('form');
    this.addFundsAmount = '';
    this.addFundsFundingMethod = 'bank';
    this.addFundsError = '';
    this.showAddFundsModal.set(true);
  }

  closeAddFundsModal(): void {
    this.showAddFundsModal.set(false);
    this.addFundsError = '';
  }

  validateAddFundsForm(): boolean {
    this.addFundsError = '';

    if (!this.addFundsAmount.trim()) {
      this.addFundsError = 'Amount is required.';
      return false;
    }

    const amount = parseFloat(this.addFundsAmount);

    if (isNaN(amount) || amount <= 0) {
      this.addFundsError = 'Amount must be greater than $0.00.';
      return false;
    }

    if (amount > 100000) {
      this.addFundsError = 'Amount cannot exceed $100,000.';
      return false;
    }

    return true;
  }

  reviewAddFunds(): void {
    if (this.validateAddFundsForm()) {
      this.addFundsStep.set('review');
    }
  }

  cancelAddFunds(): void {
    this.addFundsStep.set('form');
    this.addFundsError = '';
  }

  confirmAddFunds(): void {
    if (!this.depositsEnabled) {
      return;
    }
    // TODO(backend): POST to the deposit endpoint once it exists, then
    // this.load(true) to refresh the balance and activity before showing success.
  }

  finishAddFunds(): void {
    this.closeAddFundsModal();
  }

  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }
}
