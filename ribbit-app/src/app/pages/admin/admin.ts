import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminApiService, AdminOverview, AdminUserLookup } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin.html',
  styleUrls: ['./admin.scss']
})
export class Admin implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly overview = signal<AdminOverview>({ orders: [], accounts: [], users: [], transactions: [] });
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly userEmail = signal('');
  readonly userLookup = signal<AdminUserLookup | null>(null);
  readonly userLookupLoading = signal(false);
  readonly userLookupError = signal('');
  readonly closingAccountId = signal<number | null>(null);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadOverview();
    }
  }

  loadOverview(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.adminApi.getOverview()
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

  get pendingOrders(): number {
    return this.overview().orders.filter(order => order.status === 'PENDING').length;
  }

  get filledOrders(): number {
    return this.overview().orders.filter(order => order.status === 'FILLED').length;
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

  closeAccount(accountId: number): void {
    if (this.closingAccountId() !== null || !window.confirm(`Freeze account #${accountId}?`)) return;

    this.closingAccountId.set(accountId);
    this.userLookupError.set('');
    this.adminApi.freezeAccount(accountId).pipe(finalize(() => this.closingAccountId.set(null))).subscribe({
      next: () => this.searchUser(),
      error: response => this.userLookupError.set(response.error || 'Unable to freeze this account.')
    });
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
