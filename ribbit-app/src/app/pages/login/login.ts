import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';

export interface LoginCredentials {
  email: string;
  password: string;
  rememberEmail: boolean;
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class Login {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  @Input() loading = false;
  @Input() errorMessage = '';

  @Output() loginRequested = new EventEmitter<LoginCredentials>();
  @Output() passkeyRequested = new EventEmitter<void>();

  showPassword = false;

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
    if (this.loading) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const credentials = this.form.getRawValue();

    // Set authentication state and redirect to dashboard
    this.authService.login(credentials.email);
    this.router.navigate(['/dashboard']);

    // Emit event for any additional login logic (e.g., API call)
    this.loginRequested.emit({
      ...credentials,
      email: credentials.email.trim()
    });
  }
}
