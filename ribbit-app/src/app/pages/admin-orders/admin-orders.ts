import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminApiService, AdminOrder } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-orders.html',
  styleUrls: ['./admin-orders.scss']
})
export class AdminOrders implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);

  readonly orders = signal<AdminOrder[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly accountIdFilter = signal('');

  readonly sideColors: Record<string, string> = {
    BUY: '#c1ff39',
    SELL: '#69c6c9'
  };

  readonly statusColors: Record<string, string> = {
    PENDING: '#e7c96a',
    FILLED: '#c1ff39',
    CANCELED: '#69c6c9',
    CANCELLED: '#69c6c9',
    DECLINED: '#8f9be8',
    FAILED: '#6f7f9a'
  };

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.route.queryParamMap.subscribe(params => {
        this.accountIdFilter.set(params.get('accountId') ?? '');
        this.page.set(1);
      });
      this.loadOrders();
    }
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.filteredOrders.length / this.pageSize));
  }

  get filteredOrders(): AdminOrder[] {
    const accountId = this.accountIdFilter().trim();
    return accountId
      ? this.orders().filter(order => String(order.account_id) === accountId)
      : this.orders();
  }

  get accountOptions(): number[] {
    const selectedAccountId = Number(this.accountIdFilter());
    const accountIds = this.orders().map(order => order.account_id);
    if (Number.isInteger(selectedAccountId) && selectedAccountId > 0) accountIds.push(selectedAccountId);
    return [...new Set(accountIds)].sort((left, right) => left - right);
  }

  get pagedOrders(): AdminOrder[] {
    const start = (this.page() - 1) * this.pageSize;
    return this.filteredOrders.slice(start, start + this.pageSize);
  }

  get sideBreakdown(): { label: string; count: number; color: string }[] {
    return Object.keys(this.sideColors).map(label => ({
      label,
      count: this.filteredOrders.filter(order => order.side.toUpperCase() === label).length,
      color: this.sideColors[label]
    }));
  }

  get statusBreakdown(): { label: string; count: number; color: string }[] {
    const labels = [...new Set(this.filteredOrders.map(order => order.status.toUpperCase()))];
    return labels.map(label => ({
      label,
      count: this.filteredOrders.filter(order => order.status.toUpperCase() === label).length,
      color: this.statusColors[label] ?? '#98a399'
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

  loadOrders(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.adminApi.getOrders().pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: orders => this.orders.set(orders),
      error: response => this.errorMessage.set(response.status === 401 || response.status === 403
        ? 'You do not have permission to view orders.'
        : 'Unable to load orders from the API.')
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

  statusClass(status: string): string {
    return status.toLowerCase();
  }
}
