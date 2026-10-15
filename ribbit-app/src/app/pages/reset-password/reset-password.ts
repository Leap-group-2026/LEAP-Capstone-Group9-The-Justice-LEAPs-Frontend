import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

interface ResetCodeRequest {
  email: string;
}

interface ResetPasswordRequest {
  email: string;
  password: string;
  code: string;
}

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.html',
  styleUrls: ['./reset-password.scss']
})
export class ResetPassword {
  private readonly http = inject(HttpClient);

  readonly isRequestingCode = signal(false);
  readonly isResettingPassword = signal(false);
  readonly codeRequested = signal(false);
  readonly codeMessage = signal('');
  readonly message = signal('');
  readonly errorMessage = signal('');
  showPassword = false;

  readonly emailForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    })
  });

  readonly resetForm = new FormGroup({
    code: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(12),
        Validators.pattern(/^(?=(?:.*[A-Z]){2})(?=(?:.*[^A-Za-z0-9_]){2,})[^_]+$/)
      ]
    })
  });

  requestCode(): void {
    if (this.isRequestingCode()) return;

    if (this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      return;
    }

    const email = this.emailForm.controls.email.value.trim().toLowerCase();
    const requestBody: ResetCodeRequest = { email };
    this.isRequestingCode.set(true);
    this.codeMessage.set('');
    this.message.set('');
    this.errorMessage.set('');

    this.http
      .post<string>(`${environment.springUrl}/user/resetpassword`, requestBody, {
        responseType: 'text'
      })
      .pipe(
        timeout(10000),
        finalize(() => this.isRequestingCode.set(false))
      )
      .subscribe({
        next: (response) => {
          this.codeRequested.set(true);
          this.codeMessage.set(response || 'A password reset verification code has been sent to your email.');
        },
        error: (error) => this.errorMessage.set(this.getErrorMessage(error, 'We could not send a reset code. Please check your email and try again.'))
      });
  }

  resetPassword(): void {
    if (this.isResettingPassword()) return;

    if (this.resetForm.invalid || this.emailForm.invalid) {
      this.emailForm.markAllAsTouched();
      this.resetForm.markAllAsTouched();
      return;
    }

    const email = this.emailForm.controls.email.value.trim().toLowerCase();
    const values = this.resetForm.getRawValue();
    const requestBody: ResetPasswordRequest = {
      email,
      password: values.password,
      code: values.code
    };
    this.isResettingPassword.set(true);
    this.message.set('');
    this.errorMessage.set('');

    this.http
      .post<string>(`${environment.springUrl}/user/resetpassword/reset`, requestBody, {
        responseType: 'text'
      })
      .pipe(
        timeout(10000),
        finalize(() => this.isResettingPassword.set(false))
      )
      .subscribe({
        next: (response) => {
          this.message.set(response || 'Password reset successfully.');
          this.resetForm.reset();
          this.codeRequested.set(false);
        },
        error: (error) => this.errorMessage.set(this.getErrorMessage(error, 'We could not reset your password. Please check the code and try again.'))
      });
  }

  private getErrorMessage(error: { error?: unknown }, fallback: string): string {
    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error;
    }

    if (typeof error.error === 'object' && error.error !== null && 'message' in error.error) {
      const message = (error.error as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }

    return fallback;
  }
}