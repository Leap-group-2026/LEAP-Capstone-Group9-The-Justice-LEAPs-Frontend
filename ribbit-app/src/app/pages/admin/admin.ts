import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminApiService, AdminOrder, AdminOverview, TopBoughtStock, AdminTransaction, AdminUserLookup } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin.html',
  styleUrls: ['./admin.scss']
})
export class Admin implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly overview = signal<AdminOverview>({ orders: [], accounts: [], users: [], transactions: [] });
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly showOrders = signal(false);
  readonly topBoughtStocks = signal<TopBoughtStock[]>([]);
  readonly showTransactions = signal(false);
  readonly selectedAccountId = signal<number | null>(null);
  readonly userEmail = signal('');
  readonly userLookup = signal<AdminUserLookup | null>(null);
  readonly userLookupLoading = signal(false);
  readonly userLookupError = signal('');
  readonly ordersPage = signal(1);
  readonly transactionsPage = signal(1);
  readonly pageSize = 10;

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadOverview();
    }
  }

  loadOverview(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.adminApi
      .getOverview()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: overview => this.overview.set(overview),
        error: response => {
          this.errorMessage.set(
            response.status === 401 || response.status === 403
              ? 'You do not have permission to view the admin workspace.'
              : 'Unable to load admin data from the API.'
          );
        }
      });

    this.adminApi.getTopBoughtStocks().subscribe({
      next: stocks => this.topBoughtStocks.set(stocks),
      error: response => {
        if (!this.errorMessage()) {
          this.errorMessage.set(
            response.status === 401 || response.status === 403
              ? 'You do not have permission to view warehouse analytics.'
              : 'Unable to load warehouse analytics.'
          );
        }
      }
    });
  }

  get orders(): AdminOrder[] {
    const accountId = this.selectedAccountId();
    return accountId === null
      ? this.overview().orders
      : this.overview().orders.filter(order => order.account_id === accountId);
  }

  get transactions(): AdminTransaction[] {
    const accountId = this.selectedAccountId();
    return accountId === null
      ? this.overview().transactions
      : this.overview().transactions.filter(transaction => transaction.account_id === accountId);
  }

  get pagedOrders(): AdminOrder[] {
    return this.pageItems(this.orders, this.ordersPage());
  }

  get pagedTransactions(): AdminTransaction[] {
    return this.pageItems(this.transactions, this.transactionsPage());
  }

  get ordersPageCount(): number {
    return Math.max(1, Math.ceil(this.orders.length / this.pageSize));
  }

  get transactionsPageCount(): number {
    return Math.max(1, Math.ceil(this.transactions.length / this.pageSize));
  }

  get accountOptions(): number[] {
    return this.overview().accounts
      .map(account => account.accountId)
      .sort((left, right) => left - right);
  }

  get pendingOrders(): number {
    return this.orders.filter(order => order.status === 'PENDING').length;
  }

  get filledOrders(): number {
    return this.orders.filter(order => order.status === 'FILLED').length;
  }

  volumeWidth(volume: number): number {
    const maximum = Math.max(...this.topBoughtStocks().map(stock => stock.totalVolume), 1);
    return (volume / maximum) * 100;
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

  toggleOrders(): void {
    this.showOrders.update(isVisible => !isVisible);
  }

  toggleTransactions(): void {
    this.showTransactions.update(isVisible => !isVisible);
  }

  onAccountFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedAccountId.set(value ? Number(value) : null);
    this.ordersPage.set(1);
    this.transactionsPage.set(1);
  }

  searchUser(): void {
    const email = this.userEmail().trim();
    if (!email) return;

    this.userLookupLoading.set(true);
    this.userLookupError.set('');
    this.userLookup.set(null);
    this.adminApi.findUserByEmail(email).pipe(finalize(() => this.userLookupLoading.set(false))).subscribe({
      next: user => this.userLookup.set(user),
      error: response => this.userLookupError.set(response.status === 404 ? 'No user found with that email.' : 'Unable to search users.')
    });
  }

  setOrdersPage(page: number): void {
    this.ordersPage.set(Math.min(Math.max(page, 1), this.ordersPageCount));
  }

  setTransactionsPage(page: number): void {
    this.transactionsPage.set(Math.min(Math.max(page, 1), this.transactionsPageCount));
  }

  private pageItems<T>(items: T[], page: number): T[] {
    const start = (page - 1) * this.pageSize;
    return items.slice(start, start + this.pageSize);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : new Intl.DateTimeFormat('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        }).format(date);
  }

  statusClass(status: string): string {
    return status.toLowerCase();
  }
}
