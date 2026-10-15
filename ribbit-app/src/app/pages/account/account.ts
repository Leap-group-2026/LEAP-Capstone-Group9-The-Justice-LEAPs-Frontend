import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import { AccountContextService, CreateAccountRequest } from '../../shared/services/account-context.service';
import { environment } from '../../environments/environment';

type EditProfileStep = 'view' | 'edit' | 'success';
type ChangePasswordStep = 'form' | 'success';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
}

interface PreferenceSettings {
  emailNotifications: boolean;
  orderConfirmations: boolean;
  tradeAlerts: boolean;
  accountNotifications: boolean;
}

interface AccountInfo {
  accountId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account.html',
  styleUrls: ['./account.scss']
})
export class Account implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly accountContext = inject(AccountContextService);
  readonly accessToken = typeof localStorage === 'undefined'
    ? null
    : localStorage.getItem('token');

  // Icons
  readonly icons: Record<string, string> = {
    plus: 'M12 5v14 M5 12h14',
    edit: 'M11 4H4v16h16v-7',
    check: 'M20 6L9 17l-5-5',
    X: 'M18 6L6 18 M6 6l12 12',
    key: 'M12.5 1a5.5 5.5 0 0 0-5 8.75H1v4h6v6h4v-6h10v-4h-6.5a5.5 5.5 0 0 0 5-8.75zm0 2a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
    toggle: 'M5 9c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm14-2c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3zm-14 6c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
    logout: 'M9 3H4v18h5 M10 12h11 M17 8l4 4-4 4'
  };

  readonly accountId = this.readStorage('accountId');
  readonly accountType = this.readStorage('tradeType');
  readonly accountStatus = this.readStorage('accountActive') === 'true' ? 'Active' : 'Inactive';
  readonly accountCreated = this.formatAccountDate(this.readStorage('createdAt'));
  readonly portfolioProfile = this.readStorage('portfolioSize');
  readonly accounts = signal<AccountInfo[]>([]);
  readonly accountLoadError = signal('');
  readonly showAddAccountModal = signal(false);
  readonly isAddingAccount = signal(false);
  readonly addAccountError = signal('');
  readonly addedAccountId = signal<number | null>(null);

  newAccountBalance = '0';
  newAccountPortfolioSize = 'BALANCED';
  newAccountTradeType = 'Passive';

  // State signals
  readonly profileData = signal<UserProfile>(this.readProfile());
  readonly editProfileStep = signal<EditProfileStep>('view');
  readonly changePasswordStep = signal<ChangePasswordStep>('form');
  readonly showChangePasswordModal = signal(false);
  readonly preferences = signal<PreferenceSettings>({
    emailNotifications: true,
    orderConfirmations: true,
    tradeAlerts: true,
    accountNotifications: false
  });

  // Form state
  editFirstName = '';
  editLastName = '';
  editEmail = '';
  editAddress = '';
  editFormError = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordFormError = '';

  ngOnInit(): void {
    this.loadAccounts();
  }

  private loadAccounts(): void {
    const token = typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem('token');
    const userId = this.resolveUserId(token);

    if (!token || userId === null) {
      this.accountLoadError.set('Unable to identify the signed-in user.');
      return;
    }

    this.http.get<AccountInfo[]>(
      `${environment.springUrl}/accounts/user/${userId}`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).subscribe({
      next: (accounts) => this.accounts.set(accounts.filter(account => account.accountActive)),
      error: () => this.accountLoadError.set('Unable to load your accounts right now.')
    });
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

  openAddAccount(): void {
    this.newAccountBalance = '0';
    this.newAccountPortfolioSize = 'BALANCED';
    this.newAccountTradeType = 'Passive';
    this.addAccountError.set('');
    this.addedAccountId.set(null);
    this.showAddAccountModal.set(true);
  }

  closeAddAccount(): void {
    if (!this.isAddingAccount()) this.showAddAccountModal.set(false);
  }

  addAccount(): void {
    const balance = Number(this.newAccountBalance);
    const tradeType = this.newAccountTradeType.trim();
    if (!Number.isFinite(balance) || balance < 0) {
      this.addAccountError.set('Enter a balance of $0 or more.');
      return;
    }
    if (!tradeType) {
      this.addAccountError.set('Choose a trading style.');
      return;
    }

    const request: CreateAccountRequest = {
      balance,
      portfolioSize: this.newAccountPortfolioSize,
      tradeType
    };
    this.isAddingAccount.set(true);
    this.addAccountError.set('');
    this.accountContext.createAccount(request)
      .pipe(finalize(() => this.isAddingAccount.set(false)))
      .subscribe({
        next: (account) => {
          this.accountContext.accounts.update((accounts) => [...accounts, account]);
          this.accounts.update((accounts) => [...accounts, account]);
          this.addedAccountId.set(account.accountId);
        },
        error: (error) => {
          const message = typeof error.error === 'string' ? error.error : error.error?.message;
          this.addAccountError.set(message || 'Unable to add the account. Please try again.');
        }
      });
  }

  // Getters for display
  get userDisplayName(): string {
    const profile = this.profileData();
    return `${profile.firstName} ${profile.lastName}`;
  }

  get lastPasswordChange(): string {
    return 'September 12, 2026';
  }

  // Edit Profile methods
  openEditProfile(): void {
    const profile = this.profileData();
    this.editFirstName = profile.firstName;
    this.editLastName = profile.lastName;
    this.editEmail = profile.email;
    this.editAddress = profile.address;
    this.editFormError = '';
    this.editProfileStep.set('edit');
  }

  closeEditProfile(): void {
    this.editProfileStep.set('view');
    this.editFormError = '';
  }

  validateProfileForm(): boolean {
    this.editFormError = '';

    if (!this.editFirstName.trim()) {
      this.editFormError = 'First name is required.';
      return false;
    }

    if (!this.editLastName.trim()) {
      this.editFormError = 'Last name is required.';
      return false;
    }

    if (!this.editEmail.trim()) {
      this.editFormError = 'Email is required.';
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.editEmail)) {
      this.editFormError = 'Please enter a valid email address.';
      return false;
    }

    if (!this.editAddress.trim()) {
      this.editFormError = 'Address is required.';
      return false;
    }

    return true;
  }

  saveProfileChanges(): void {
    if (this.validateProfileForm()) {
      this.profileData.set({
        firstName: this.editFirstName,
        lastName: this.editLastName,
        email: this.editEmail,
        address: this.editAddress
      });
      this.authService.setUserProfile({
        name: `${this.editFirstName.trim()} ${this.editLastName.trim()}`,
        email: this.editEmail.trim(),
        address: this.editAddress.trim()
      });
      this.editProfileStep.set('success');
    }
  }

  finishProfileEdit(): void {
    this.editProfileStep.set('view');
  }

  private readProfile(): UserProfile {
    const user = this.authService.getUserProfile();
    const nameParts = user.name.trim().split(/\s+/).filter(Boolean);

    return {
      firstName: nameParts[0] ?? '',
      lastName: nameParts.slice(1).join(' '),
      email: user.email,
      address: user.address
    };
  }

  private readStorage(key: string): string {
    return typeof localStorage === 'undefined' ? '' : localStorage.getItem(key) ?? '';
  }

  private formatAccountDate(value: string): string {
    if (!value) return '';

    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
  }

  // Change Password methods
  openChangePasswordModal(): void {
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordFormError = '';
    this.changePasswordStep.set('form');
    this.showChangePasswordModal.set(true);
  }

  closeChangePasswordModal(): void {
    this.showChangePasswordModal.set(false);
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.passwordFormError = '';
  }

  validatePasswordForm(): boolean {
    this.passwordFormError = '';

    if (!this.currentPassword.trim()) {
      this.passwordFormError = 'Current password is required.';
      return false;
    }

    if (!this.newPassword.trim()) {
      this.passwordFormError = 'New password is required.';
      return false;
    }

    if (this.newPassword.length < 8) {
      this.passwordFormError = 'Password must be at least 8 characters long.';
      return false;
    }

    if (!/[A-Z]/.test(this.newPassword)) {
      this.passwordFormError = 'Password must contain at least one uppercase letter.';
      return false;
    }

    if (!/[a-z]/.test(this.newPassword)) {
      this.passwordFormError = 'Password must contain at least one lowercase letter.';
      return false;
    }

    if (!/[0-9]/.test(this.newPassword)) {
      this.passwordFormError = 'Password must contain at least one number.';
      return false;
    }

    if (!/[!@#$%^&*]/.test(this.newPassword)) {
      this.passwordFormError = 'Password must contain at least one special character (!@#$%^&*).';
      return false;
    }

    if (!this.confirmPassword.trim()) {
      this.passwordFormError = 'Please confirm your new password.';
      return false;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordFormError = 'Passwords do not match.';
      return false;
    }

    return true;
  }

  submitPasswordChange(): void {
    if (this.validatePasswordForm()) {
      // Frontend-only validation. Will later integrate with NestJS auth service.
      this.changePasswordStep.set('success');
    }
  }

  finishPasswordChange(): void {
    this.closeChangePasswordModal();
  }

  // Preferences toggle methods
  togglePreference(key: keyof PreferenceSettings): void {
    const current = this.preferences();
    this.preferences.set({
      ...current,
      [key]: !current[key]
    });
  }

  // Navigation
  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }
}
