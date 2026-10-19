import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { finalize, map, Observable, of, switchMap, tap, throwError, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../../shared/services/auth.service';
import { ThemeService } from '../../shared/services/theme.service';
import { storeTokens } from '../../shared/interceptors/auth.interceptor';

export interface LoginCredentials {
  email: string;
  password: string;
  rememberEmail: boolean;
}

interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  access_token?: string;
  token?: string;
}

interface UserResponse {
  name: string;
  email: string;
  address: string;
}

interface UserAccount {
  accountId: number;
}

interface AccountResponse {
  accountId: number;
  tradeType?: string;
  balance: number;
  portfolio_size: string;
  trade_type?: string;
  created_at: string;
  account_active: boolean;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly theme = inject(ThemeService);
  private readonly authService = inject(AuthService);

  @Input() loading = false;
  @Input() errorMessage = '';

  @Output() loginRequested = new EventEmitter<LoginCredentials>();
  @Output() passkeyRequested = new EventEmitter<void>();

  showPassword = false;
  readonly isSubmitting = signal(false);
  readonly loginError = signal('');

  toggleTheme(): void {
    this.theme.toggle();
  }
  readonly isAdminLogin = this.router.url.startsWith('/admin-login');

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    rememberEmail: new FormControl(true, { nonNullable: true })
  });

  readonly chartPath =
    'M0 308 L30 295 L64 302 L96 273 L126 282 L162 251 ' +
    'L192 261 L220 229 L254 233 L284 199 L314 207 ' +
    'L350 168 L380 181 L409 163 L445 158 L478 123 ' +
    'L508 136 L535 110 L568 116 L600 77 L625 89 ' +
    'L657 52 L688 64 L720 24 L760 20';

  readonly candles = [
    [48, 268, 44], [79, 256, 46], [110, 247, 38],
    [141, 228, 57], [172, 235, 40], [203, 217, 44],
    [234, 192, 59], [265, 180, 42], [296, 174, 36],
    [327, 159, 47], [358, 139, 50], [389, 146, 41],
    [420, 134, 46], [451, 104, 62], [482, 97, 39],
    [513, 86, 38], [544, 77, 50], [575, 50, 55],
    [606, 43, 37], [637, 24, 50]
  ].map(([x, y, height], index) => ({
    x,
    y,
    height,
    down: [2, 4, 8, 11, 15, 18].includes(index)
  }));

  readonly quotes = [
    { symbol: 'AAPL', price: '228.42', change: '+0.86%' },
    { symbol: 'NVDA', price: '142.87', change: '+2.31%' },
    { symbol: 'SPY', price: '589.21', change: '+1.24%' }
  ];

  submit(): void {
    if (this.loading || this.isSubmitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const credentials = this.form.getRawValue();
    const requestBody = {
      email: credentials.email.trim(),
      password: credentials.password
    };

    this.isSubmitting.set(true);
    this.loginError.set('');

    this.http
      .post<LoginResponse>(
        `${environment.authUrl}/auth/${this.isAdminLogin ? 'adminLogin' : 'login'}`,
        requestBody
      )
      .pipe(
        timeout(5000),
        switchMap((response) => {
          const accessToken =
            response.accessToken ?? response.access_token ?? response.token;

          if (!accessToken) {
            return throwError(() => new Error('Missing access token'));
          }

          storeTokens(accessToken, response.refreshToken);

          if (this.isAdminLogin) {
            return of(null);
          }

          return this.http.get<UserResponse>(`${environment.springUrl}/user`, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });
        }),
        switchMap((user) =>
          user
            ? this.loadAccount(localStorage.getItem('token')!).pipe(map(() => user))
            : of(null)
        ),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: (user) => {
          if (user) {
            localStorage.setItem('name', user.name);
            localStorage.setItem('email', user.email);
            localStorage.setItem('address', user.address);
            this.authService.setUserProfile({
              name: user.name,
              email: user.email,
              address: user.address
            });
          } else {
            this.authService.setUserProfile({
              name: 'Administrator',
              email: requestBody.email,
              address: ''
            });
          }

          localStorage.setItem('userEmail', requestBody.email);
          this.router.navigate([this.isAdminLogin ? '/admin' : '/dashboard']);
        },
        error: (error: unknown) => {
          const status = (error as { status?: number })?.status;
          this.loginError.set(
            status === 401
              ? 'Login failed, username or password is incorrect.'
              : 'We could not sign you in right now. Please try again in a moment.'
          );
        }
      });

    // Emit event for any additional login logic (e.g., API call)
    this.loginRequested.emit({
      ...credentials,
      email: requestBody.email
    });
  }

  private loadAccount(accessToken: string): Observable<void> {
    return this.http
      .get<UserAccount[]>(`${environment.springUrl}/user/accounts`, {
        headers: new HttpHeaders({
          Authorization: `Bearer ${accessToken}`
        })
      })
      .pipe(
        switchMap((accounts) => {
          const accountIds = accounts
            .map((account) => account.accountId)
            .filter((accountId) => Number.isFinite(accountId));

          if (!accountIds.length) {
            return throwError(() => new Error('No account found for user'));
          }

          const accountId = Math.min(...accountIds);
          localStorage.setItem('accountId', String(accountId));

          return this.http.get<AccountResponse>(
            `${environment.springUrl}/accounts/${accountId}`,
            {
              headers: new HttpHeaders({
                Authorization: `Bearer ${accessToken}`
              })
            }
          );
        }),
        tap((account) => {
          localStorage.setItem('accountId', String(account.accountId));
          localStorage.setItem('tradeType', account.tradeType ?? account.trade_type ?? '');
          localStorage.setItem('balance', String(account.balance));
          localStorage.setItem('portfolioSize', account.portfolio_size);
          localStorage.setItem('createdAt', account.created_at);
          localStorage.setItem('accountActive', String(account.account_active));
        }),
        map(() => undefined)
      );
  }
}
