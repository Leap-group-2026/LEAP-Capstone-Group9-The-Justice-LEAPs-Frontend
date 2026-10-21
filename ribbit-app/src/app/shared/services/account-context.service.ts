import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { map, Observable, Subject, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

export interface AccountContextItem {
  accountId: number;
  userId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
  accountFrozen: boolean;
}

export interface CreateAccountRequest {
  balance: number;
  portfolioSize: string;
  tradeType: string;
}

interface AccountApiResponse {
  accountId: number;
  userId?: number;
  balance: number;
  portfolioSize?: string;
  portfolio_size?: string;
  tradeType?: string;
  trade_type?: string;
  createdAt?: string;
  created_at?: string;
  accountActive?: boolean;
  account_active?: boolean;
  accountFrozen?: boolean;
  account_frozen?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AccountContextService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly accounts = signal<AccountContextItem[]>([]);
  readonly selectedAccount = signal<AccountContextItem | null>(null);
  readonly isLoading = signal(false);
  readonly loadError = signal('');
  readonly accountUpdated = new Subject<AccountContextItem>();

  clear(): void {
    this.accounts.set([]);
    this.selectedAccount.set(null);
    this.isLoading.set(false);
    this.loadError.set('');
  }
  readonly frozenNoticeRequested = new Subject<number>();

  loadAccounts(): void {
    const token = readToken();
    if (!token || this.isLoading() || this.accounts().length > 0) return;

    this.isLoading.set(true);
    this.loadError.set('');
    this.http.get<AccountContextItem[]>(`${environment.springUrl}/user/accounts`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: (accounts) => {
        const activeAccounts = accounts.filter(account => account.accountActive);
        this.accounts.set(activeAccounts);
        const storedId = this.readStoredAccountId();
        const selected = activeAccounts.find(account => account.accountId === storedId)
          ?? [...activeAccounts].sort((left, right) => left.accountId - right.accountId)[0]
          ?? null;
        console.info('[account-debug] header accounts:', accounts);
        console.info('[account-debug] header active IDs:', activeAccounts.map(account => account.accountId),
          'stored accountId:', storedId,
          'selected accountId:', selected?.accountId ?? null);
        if (selected) {
          this.setSelectedAccount(selected, false);
          if (selected.accountFrozen) this.requestFrozenNotice(selected.accountId);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load accounts.');
        this.isLoading.set(false);
      }
    });
  }

  selectAccount(accountId: number): void {
    const account = this.accounts().find(item => item.accountId === accountId);
    if (!account || this.selectedAccount()?.accountId === accountId) return;

    this.setSelectedAccount(account, true);
    if (account.accountFrozen) this.requestFrozenNotice(account.accountId);
  }

  requestFrozenNotice(accountId = this.selectedAccount()?.accountId ?? 0): void {
    if (accountId > 0) this.frozenNoticeRequested.next(accountId);
  }

  getKnownSelectedAccount(): AccountContextItem | null {
    const selected = this.selectedAccount();
    if (selected) return selected;

    if (typeof window === 'undefined') return null;
    const accountId = Number(window.localStorage.getItem('accountId'));
    if (!Number.isInteger(accountId) || accountId <= 0) return null;

    return {
      accountId,
      userId: 0,
      balance: Number(window.localStorage.getItem('balance')) || 0,
      portfolioSize: window.localStorage.getItem('portfolioSize') ?? '',
      tradeType: window.localStorage.getItem('tradeType') ?? '',
      createdAt: window.localStorage.getItem('createdAt') ?? '',
      accountActive: window.localStorage.getItem('accountActive') !== 'false',
      accountFrozen: window.localStorage.getItem('accountFrozen') === 'true'
    };
  }

  createAccount(request: CreateAccountRequest): Observable<AccountContextItem> {
    return this.http.post<AccountContextItem>(`${environment.springUrl}/accounts`, request, {
      headers: this.createAuthHeaders()
    });
  }

  refreshAccount(accountId: number): Observable<AccountContextItem> {
    return this.http.get<AccountApiResponse>(`${environment.springUrl}/accounts/${accountId}`, {
      headers: this.createAuthHeaders()
    }).pipe(
      map(response => this.normalizeAccount(response)),
      tap(account => {
        this.persistAccount(account);
        this.accounts.update(accounts => accounts.map(item =>
          item.accountId === account.accountId ? account : item
        ));
        if (this.selectedAccount()?.accountId === account.accountId) {
          this.selectedAccount.set(account);
        }
        this.accountUpdated.next(account);
      })
    );
  }

  closeAccount(accountId: number): Observable<string> {
    return this.http.patch(`${environment.springUrl}/accounts/close/${accountId}`, {}, {
      headers: this.createAuthHeaders(),
      responseType: 'text'
    });
  }

  private setSelectedAccount(account: AccountContextItem, refreshPage: boolean): void {
    this.selectedAccount.set(account);
    this.persistAccount(account);
    this.accountUpdated.next(account);

    if (refreshPage) {
      const currentUrl = this.router.url;
      void this.router.navigateByUrl('/login', { skipLocationChange: true }).then(() => {
        void this.router.navigateByUrl(currentUrl);
      });
    }
  }

  private persistAccount(account: AccountContextItem): void {
    if (typeof window === 'undefined') return;

    window.localStorage.setItem('accountId', String(account.accountId));
    window.localStorage.setItem('tradeType', account.tradeType ?? '');
    window.localStorage.setItem('balance', String(account.balance));
    window.localStorage.setItem('portfolioSize', account.portfolioSize ?? '');
    window.localStorage.setItem('createdAt', account.createdAt ?? '');
    window.localStorage.setItem('accountActive', String(account.accountActive));
    window.localStorage.setItem('accountFrozen', String(account.accountFrozen));
  }

  private normalizeAccount(response: AccountApiResponse): AccountContextItem {
    return {
      accountId: response.accountId,
      userId: response.userId ?? 0,
      balance: response.balance,
      portfolioSize: response.portfolioSize ?? response.portfolio_size ?? '',
      tradeType: response.tradeType ?? response.trade_type ?? '',
      createdAt: response.createdAt ?? response.created_at ?? '',
      accountActive: response.accountActive ?? response.account_active ?? true,
      accountFrozen: response.accountFrozen ?? response.account_frozen ?? false
    };
  }

  private readStoredAccountId(): number | null {
    if (typeof window === 'undefined') return null;
    const accountId = Number(window.localStorage.getItem('accountId'));
    return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = readToken();
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

}
