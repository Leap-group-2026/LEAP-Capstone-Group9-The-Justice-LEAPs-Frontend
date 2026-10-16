import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';
import { readToken } from '../interceptors/auth.interceptor';
import { AccountContextService } from './account-context.service';
import { AccountDto } from './transactions.models';
import { TransactionsService } from './transactions.service';

// The header's account selector stores the chosen account under this key, and
// the other pages read the balance from 'balance'.
const SELECTED_ACCOUNT_KEY = 'accountId';
const BALANCE_KEY = 'balance';

function readSelectedAccountId(): number | null {
  try {
    const id = Number(localStorage.getItem(SELECTED_ACCOUNT_KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

// The selected account if it is still open, otherwise the lowest id (what login picks).
export function pickAccount(accounts: AccountDto[], selectedId: number | null): AccountDto | null {
  return (
    accounts.find(account => account.accountId === selectedId) ??
    [...accounts].sort((a, b) => a.accountId - b.accountId)[0] ??
    null
  );
}

@Injectable({
  providedIn: 'root'
})
export class CurrentAccountService {
  private readonly transactions = inject(TransactionsService);
  private readonly accountContext = inject(AccountContextService);
  private readonly accountState = signal<AccountDto | null>(null);
  private request$: Observable<AccountDto | null> | null = null;
  private requestKey: string | null = null;

  readonly account = this.accountState.asReadonly();

  // Emits the current account, or null when the user has no open account.
  load(refresh = false): Observable<AccountDto | null> {
    const selectedId = readSelectedAccountId();
    // A different login or a different selected account makes the cache stale.
    const key = `${readToken()}|${selectedId}`;
    if (!refresh && this.request$ && key === this.requestKey) {
      return this.request$;
    }

    this.requestKey = key;
    this.request$ = this.transactions.getMyAccounts().pipe(
      map(accounts => pickAccount(accounts, selectedId)),
      tap(account => this.accountState.set(account)),
      catchError(error => {
        this.request$ = null;
        return throwError(() => error);
      }),
      shareReplay(1)
    );
    return this.request$;
  }

  // Applies a balance the backend just returned everywhere the app keeps one,
  // so other pages don't show a stale amount after a deposit or withdrawal.
  updateBalance(accountId: number, balance: number): void {
    const withBalance = <T extends { accountId: number }>(account: T): T =>
      account.accountId === accountId ? { ...account, balance } : account;

    this.accountState.update(account => (account ? withBalance(account) : account));
    this.request$ = null;
    this.accountContext.accounts.update(accounts => accounts.map(withBalance));
    this.accountContext.selectedAccount.update(account => (account ? withBalance(account) : account));

    if (readSelectedAccountId() === accountId) {
      try {
        localStorage.setItem(BALANCE_KEY, String(balance));
      } catch {
        // Other pages fall back to their own loading.
      }
    }
  }
}
