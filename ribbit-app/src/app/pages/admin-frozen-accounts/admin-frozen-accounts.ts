import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminAccount, AdminApiService } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin-frozen-accounts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-frozen-accounts.html',
  styleUrls: ['./admin-frozen-accounts.scss']
})
export class AdminFrozenAccounts implements OnInit {
  private readonly adminApi = inject(AdminApiService);

  readonly accounts = signal<AdminAccount[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly updatingAccountId = signal<number | null>(null);

  ngOnInit(): void {
    this.loadAccounts();
  }

  loadAccounts(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminApi.getAccounts()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: accounts => this.accounts.set(accounts.filter(account => account.accountActive && account.accountFrozen)),
        error: () => this.error.set('Unable to load frozen accounts.')
      });
  }

  unfreeze(account: AdminAccount): void {
    if (this.updatingAccountId() !== null || !window.confirm(`Unfreeze account #${account.accountId}?`)) return;

    this.updatingAccountId.set(account.accountId);
    this.adminApi.unfreezeAccount(account.accountId)
      .pipe(finalize(() => this.updatingAccountId.set(null)))
      .subscribe({
        next: () => this.accounts.update(accounts => accounts.filter(item => item.accountId !== account.accountId)),
        error: response => this.error.set(response.error || 'Unable to unfreeze this account.')
      });
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  }
}
