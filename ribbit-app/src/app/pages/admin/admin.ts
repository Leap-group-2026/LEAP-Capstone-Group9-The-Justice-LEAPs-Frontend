import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Observable, finalize, map, switchMap } from 'rxjs';
import {
  AdminAccount,
  AdminApiService,
  AdminOverview,
  AdminUserLookup,
  PortfolioSizeCount
} from '../../shared/services/admin-api.service';

export type AdminSearchType = 'email' | 'userId' | 'accountId';

interface SearchResult {
  user: AdminUserLookup;
  account: AdminAccount | null;   // the account searched for, when searching by account ID
}

const NOT_FOUND: Record<AdminSearchType, (term: string) => string> = {
  email: () => 'No user found with that email.',
  userId: term => `No user with ID #${term}.`,
  accountId: term => `No account with ID #${term}.`
};

// A positive whole number, or null
function parseId(value: string): number | null {
  return /^\d+$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

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
  private readonly route = inject(ActivatedRoute);

  readonly overview = signal<AdminOverview>({ orders: [], accounts: [], users: [], transactions: [] });
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');
  readonly searchType = signal<AdminSearchType>('email');
  readonly searchTerm = signal('');
  // The account searched for (account ID search), shown above the owner's details
  readonly matchedAccount = signal<AdminAccount | null>(null);
  readonly userLookup = signal<AdminUserLookup | null>(null);
  readonly userLookupLoading = signal(false);
  readonly userLookupError = signal('');
  readonly portfolioSizes = signal<PortfolioSizeCount[]>([]);
  readonly closingAccountId = signal<number | null>(null);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadOverview();
      this.searchFromQueryParams();
    }
  }

  // The Users tab links here with ?userId=42 (or ?accountId=7) to open that lookup.
  private searchFromQueryParams(): void {
    const params = this.route.snapshot.queryParamMap;
    const userId = params.get('userId');
    const accountId = params.get('accountId');
    if (userId) {
      this.searchType.set('userId');
      this.searchTerm.set(userId);
      this.searchUser();
    } else if (accountId) {
      this.searchType.set('accountId');
      this.searchTerm.set(accountId);
      this.searchUser();
    }
  }

  setSearchType(type: AdminSearchType): void {
    this.searchType.set(type);
    this.searchTerm.set('');
    this.userLookupError.set('');
  }

  loadOverview(): void {
    this.isLoading.set(true);
    this.adminApi.getOverview()
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: overview => {
          this.overview.set(overview);
        },
        error: response => {
          this.errorMessage.set(
            response.status === 401 || response.status === 403
              ? 'You do not have permission to view the admin workspace.'
              : 'Unable to load admin data from the API.'
          );
        }
      });

    this.adminApi.getPortfolioSizeCounts().subscribe({
      next: counts => this.portfolioSizes.set(counts),
      error: response => {
        if (!this.errorMessage()) {
          this.errorMessage.set(
            response.status === 401 || response.status === 403
              ? 'You do not have permission to view portfolio analytics.'
              : 'Unable to load portfolio analytics.'
          );
        }
      }
    });

  }

  get pendingOrders(): number {
    return this.overview().orders.filter(order => order.status === 'PENDING').length;
  }

  get filledOrders(): number {
    return this.overview().orders.filter(order => order.status === 'FILLED').length;
  }

  get maximumPortfolioCount(): number {
    return Math.max(...this.portfolioSizes().map(item => item.accountCount), 1);
  }

  portfolioBarWidth(count: number): number {
    return (count / this.maximumPortfolioCount) * 100;
  }

  searchUser(): void {
    const type = this.searchType();
    const term = this.searchTerm().trim();
    if (!term) return;

    let search$: Observable<SearchResult>;
    if (type === 'email') {
      search$ = this.adminApi.findUserByEmail(term).pipe(map(user => ({ user, account: null })));
    } else {
      const id = parseId(term);
      if (id === null) {
        this.userLookupError.set(`Enter ${type === 'userId' ? 'a user' : 'an account'} ID as a whole number.`);
        return;
      }
      search$ = type === 'userId'
        ? this.adminApi.findUserById(id).pipe(map(user => ({ user, account: null })))
        // Find the account, then its owner, so both show together
        : this.adminApi.getAccountById(id).pipe(
            switchMap(account => this.adminApi.findUserById(account.userId).pipe(map(user => ({ user, account }))))
          );
    }

    this.userLookupLoading.set(true);
    this.userLookupError.set('');
    this.userLookup.set(null);
    this.matchedAccount.set(null);
    search$.pipe(finalize(() => this.userLookupLoading.set(false))).subscribe({
      next: result => {
        this.userLookup.set(result.user);
        this.matchedAccount.set(result.account);
      },
      error: response => this.userLookupError.set(
        response.status === 404 ? NOT_FOUND[type](term) : 'Unable to search right now.'
      )
    });
  }

  accountStatus(account: AdminAccount): string {
    if (!account.accountActive) return 'Closed';
    return account.accountFrozen ? 'Frozen' : 'Active';
  }

  toggleAccountFreeze(accountId: number, frozen: boolean): void {
    const action = frozen ? 'Unfreeze' : 'Freeze';
    if (this.closingAccountId() !== null || !window.confirm(`${action} account #${accountId}?`)) return;

    this.closingAccountId.set(accountId);
    this.userLookupError.set('');
    const request = frozen
      ? this.adminApi.unfreezeAccount(accountId)
      : this.adminApi.freezeAccount(accountId);
    request.pipe(finalize(() => this.closingAccountId.set(null))).subscribe({
      next: () => this.searchUser(),
      error: response => this.userLookupError.set(response.error || `Unable to ${action.toLowerCase()} this account.`)
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
