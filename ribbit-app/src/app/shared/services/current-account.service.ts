import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, shareReplay, tap, throwError } from 'rxjs';
import { readToken } from '../interceptors/auth.interceptor';
import { AccountDto } from './transactions.models';
import { TransactionsService } from './transactions.service';


@Injectable({
  providedIn: 'root'
})
export class CurrentAccountService {
  private readonly transactions = inject(TransactionsService);
  private readonly accountState = signal<AccountDto | null>(null);
  private request$: Observable<AccountDto | null> | null = null;
  private requestToken: string | null = null;

  readonly account = this.accountState.asReadonly();

  // Emits the current account, or null when the user has no open account.
  load(refresh = false): Observable<AccountDto | null> {
    const token = readToken();
    // A different token means a different login, so the cached account is stale.
    if (!refresh && this.request$ && token === this.requestToken) {
      return this.request$;
    }

    this.requestToken = token;
    this.request$ = this.transactions.getMyAccounts().pipe(
      // TODO: account selector for users with several accounts; the first one is used for now.
      map((accounts) => accounts[0] ?? null),
      tap((account) => this.accountState.set(account)),
      catchError((error) => {
        this.request$ = null;
        return throwError(() => error);
      }),
      shareReplay(1)
    );
    return this.request$;
  }
}
