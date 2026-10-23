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
import { TutorialService } from '../../shared/services/tutorial.service';

interface RegistrationResponse {
  message?: string;
}

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrls: ['./signup.scss']
})
export class Signup {
  private readonly http = inject(HttpClient);
  private readonly tutorial = inject(TutorialService);

  readonly isSubmitting = signal(false);
  readonly registrationError = signal('');
  readonly registrationComplete = signal(false);
  showPassword = false;

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    dateOfBirth: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    address: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    ssn: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^\d{3}-?\d{2}-?\d{4}$/)]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(12),
        Validators.pattern(/^(?=(?:.*[A-Z]){2})(?=(?:.*[^A-Za-z0-9_]){2,})[^_]+$/)
      ]
    }),
    disclosureAccepted: new FormControl(false, {
      nonNullable: true,
      validators: [Validators.requiredTrue]
    })
  });

  submit(): void {
    if (this.isSubmitting()) return;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const values = this.form.getRawValue();
    const body = {
      ...values,
      name: values.name.trim(),
      email: values.email.trim().toLowerCase(),
      address: values.address.trim(),
      ssn: values.ssn.trim()
    };

    this.isSubmitting.set(true);
    this.registrationError.set('');

    this.http
      .post<RegistrationResponse>(`${environment.authUrl}/auth/register`, body, {
        responseType: 'text' as 'json'
      })
      .pipe(
        timeout(10000),
        finalize(() => this.isSubmitting.set(false))
      )
      .subscribe({
        next: () => {
          this.tutorial.markRegistrationForTutorial(body.email);
          this.registrationComplete.set(true);
        },
        error: (error) => {
          const message = typeof error.error === 'string'
            ? error.error
            : error.error?.message;
          this.registrationError.set(message || 'We could not create your account. Please check your details and try again.');
        }
      });
  }
}
