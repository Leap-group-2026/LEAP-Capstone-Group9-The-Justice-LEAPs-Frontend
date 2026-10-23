import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { describeHttpError } from '../../shared/http-error';
import { AdminApiService } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin-add-admin',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-add-admin.html',
  styleUrl: './admin-add-admin.scss'
})
export class AdminAddAdmin {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly showConfirmPassword = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  }, {
    validators: control => control.get('password')?.value === control.get('confirmPassword')?.value
      ? null
      : { passwordMismatch: true }
  });

  submit(): void {
    if (this.submitting()) return;

    this.errorMessage.set('');
    this.successMessage.set('');
    this.form.controls.email.setValue(this.form.controls.email.value.trim());
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.api.createAdmin({ email, password }).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: () => {
        this.form.reset();
        this.showPassword.set(false);
        this.showConfirmPassword.set(false);
        this.successMessage.set(`Admin account created for ${email}. Your current session is unchanged.`);
      },
      error: (error: unknown) => {
        let message = 'Unable to create the admin. Please try again.';
        if (error instanceof HttpErrorResponse) {
          if (error.status === 403) {
            message = 'You do not have permission to create an admin.';
          } else if (error.status === 401) {
            message = 'Your session has expired. Please sign in again.';
          } else if (error.status < 500) {
            message = describeHttpError(error, message);
          }
        }
        this.errorMessage.set(message);
      }
    });
  }
}