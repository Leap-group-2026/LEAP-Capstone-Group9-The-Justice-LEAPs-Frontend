import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AccountContextItem {
  accountId: number;
  userId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
}

export interface CreateAccountRequest {
  balance: number;
  portfolioSize: string;
  tradeType: string;
}

@Injectable({ providedIn: 'root' })
export class AccountContextService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly accounts = signal<AccountContextItem[]>([]);
  readonly selectedAccount = signal<AccountContextItem | null>(null);
  readonly isLoading = signal(false);
  readonly loadError = signal('');

  loadAccounts(): void {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token');
    const userId = this.resolveUserId(token);
    if (!token || userId === null || this.isLoading() || this.accounts().length > 0) return;

    this.isLoading.set(true);
    this.loadError.set('');
    this.http.get<AccountContextItem[]>(`${environment.springUrl}/accounts/user/${userId}`, {
      headers: new HttpHeaders({ Authorization: `Bearer ${token}` })
    }).subscribe({
      next: (accounts) => {
        const activeAccounts = accounts.filter(account => account.accountActive);
        this.accounts.set(activeAccounts);
        const storedId = this.readStoredAccountId();
        const selected = activeAccounts.find(account => account.accountId === storedId)
          ?? [...activeAccounts].sort((left, right) => left.accountId - right.accountId)[0]
          ?? null;
        if (selected) this.setSelectedAccount(selected, false);
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
  }

  createAccount(request: CreateAccountRequest): Observable<AccountContextItem> {
    return this.http.post<AccountContextItem>(`${environment.springUrl}/accounts`, request, {
      headers: this.createAuthHeaders()
    });
  }

  private setSelectedAccount(account: AccountContextItem, refreshPage: boolean): void {
    this.selectedAccount.set(account);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('accountId', String(account.accountId));
      window.localStorage.setItem('tradeType', account.tradeType ?? '');
      window.localStorage.setItem('balance', String(account.balance));
      window.localStorage.setItem('portfolioSize', account.portfolioSize ?? '');
      window.localStorage.setItem('createdAt', account.createdAt ?? '');
      window.localStorage.setItem('accountActive', String(account.accountActive));
    }

    if (refreshPage) {
      const currentUrl = this.router.url;
      void this.router.navigateByUrl('/login', { skipLocationChange: true }).then(() => {
        void this.router.navigateByUrl(currentUrl);
      });
    }
  }

  private readStoredAccountId(): number | null {
    if (typeof window === 'undefined') return null;
    const accountId = Number(window.localStorage.getItem('accountId'));
    return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
  }

  private createAuthHeaders(): HttpHeaders {
    const token = typeof window === 'undefined' ? null : window.localStorage.getItem('token');
    return token
      ? new HttpHeaders({ Authorization: `Bearer ${token}` })
      : new HttpHeaders();
  }

  private resolveUserId(token: string | null): number | null {
    if (!token) return null;
    try {
      const encodedPayload = token.split('.')[1];
      const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')));
      const userId = Number(payload.sub);
      return Number.isInteger(userId) && userId > 0 ? userId : null;
    } catch {
      return null;
    }
  }
}
