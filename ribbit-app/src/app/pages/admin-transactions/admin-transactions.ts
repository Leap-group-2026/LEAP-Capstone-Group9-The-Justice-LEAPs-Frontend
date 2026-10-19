import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminApiService, AdminTransaction } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin-transactions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-transactions.html',
  styleUrls: ['./admin-transactions.scss']
})
export class AdminTransactions implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);

  readonly transactions = signal<AdminTransaction[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly accountIdFilter = signal('');

  readonly typeColors: Record<string, string> = {
    DEPOSIT: '#c1ff39',
    WITHDRAW: '#69c6c9',
    WITHDRAWAL: '#69c6c9',
    BUY: '#e7c96a',
    SELL: '#8f9be8',
    'CURRENCY EXCHANGE': '#7fbf9f'
  };

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParamMap.subscribe(params => {
        this.accountIdFilter.set(params.get('accountId') ?? '');
        this.page.set(1);
      });
      this.loadTransactions();
    }
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredTransactions.length / this.pageSize));
  }

  get filteredTransactions(): AdminTransaction[] {
    const accountId = this.accountIdFilter().trim();
    return accountId
      ? this.transactions().filter(transaction => String(transaction.account_id) === accountId)
      : this.transactions();
  }

  get accountOptions(): number[] {
    const selectedAccountId = Number(this.accountIdFilter());
    const accountIds = this.transactions().map(transaction => transaction.account_id);
    if (Number.isInteger(selectedAccountId) && selectedAccountId > 0) accountIds.push(selectedAccountId);
    return [...new Set(accountIds)].sort((left, right) => left - right);
  }

  get pagedTransactions(): AdminTransaction[] {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  get typeBreakdown(): { label: string; count: number; color: string }[] {
    const labels = [...new Set(this.filteredTransactions.map(transaction => transaction.transaction_type.toUpperCase()))];
    return labels.map(label => ({
      label,
      count: this.filteredTransactions.filter(transaction => transaction.transaction_type.toUpperCase() === label).length,
      color: this.typeColors[label] ?? '#8f9be8'
    }));
  }

  pieStyle(items: { count: number; color: string }[]): string {
    const total = items.reduce((sum, item) => sum + item.count, 0);
    if (!total) return 'conic-gradient(#293029 0 100%)';

    let start = 0;
    const stops = items.map(item => {
      const end = start + (item.count / total) * 100;
      const stop = `${item.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }

  percentage(count: number, total: number): number {
    return total ? Math.round((count / total) * 100) : 0;
  }

  loadTransactions(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.adminApi.getTransactions().pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: transactions => this.transactions.set(transactions),
      error: response => this.errorMessage.set(response.status === 401 || response.status === 403
        ? 'You do not have permission to view transactions.'
        : 'Unable to load transactions from the API.')
    });
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.pageCount));
  }

  setAccountFilter(event: Event): void {
    this.accountIdFilter.set((event.target as HTMLSelectElement).value);
    this.page.set(1);
  }

  isSelectedAccount(accountId: number): boolean {
    return String(accountId) === this.accountIdFilter();
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }
}
