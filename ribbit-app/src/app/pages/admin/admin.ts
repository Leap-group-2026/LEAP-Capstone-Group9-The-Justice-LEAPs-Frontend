import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminApiService, AdminOrder, AdminOverview } from '../../shared/services/admin-api.service';

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

  readonly overview = signal<AdminOverview>({ orders: [], accounts: [], users: [] });
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

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
  }

  get orders(): AdminOrder[] {
    return this.overview().orders;
  }

  get pendingOrders(): number {
    return this.orders.filter(order => order.status === 'PENDING').length;
  }

  get filledOrders(): number {
    return this.orders.filter(order => order.status === 'FILLED').length;
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
