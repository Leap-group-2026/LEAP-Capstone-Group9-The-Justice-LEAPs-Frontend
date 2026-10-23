import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, finalize, forkJoin, of } from 'rxjs';
import { AuthService } from '../../shared/services/auth.service';
import {
  ACCOUNT_NAME_MAX_LENGTH,
  AccountContextService,
  CreateAccountRequest,
  accountLabel,
  accountNameProblem
} from '../../shared/services/account-context.service';
import { environment } from '../../environments/environment';
import { readToken } from '../../shared/interceptors/auth.interceptor';

type EditProfileStep = 'view' | 'edit' | 'success';
type ChangePasswordStep = 'form' | 'success';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  address: string;
}

interface AccountInfo {
  accountId: number;
  balance: number;
  portfolioSize: string;
  tradeType: string;
  createdAt: string;
  accountActive: boolean;
  accountName?: string | null;
}


function apiErrorMessage(error: { error?: unknown }, fallback: string): string {
  const body = error?.error as { fieldMessage?: string; message?: string } | string | undefined;
  if (typeof body === 'string' && body.trim()) return body;
  if (body && typeof body === 'object') return body.fieldMessage || body.message || fallback;
  return fallback;
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
  readonly accessToken = readToken();

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
  readonly positionCounts = signal<Record<number, number>>({});
  readonly closingAccountId = signal<number | null>(null);
  readonly closeAccountError = signal('');
  readonly blockedCloseAccount = signal<AccountInfo | null>(null);
  readonly showAddAccountModal = signal(false);
  readonly isAddingAccount = signal(false);
  readonly addAccountError = signal('');
  readonly addedAccountId = signal<number | null>(null);
  readonly addedAccountLabel = signal('');


  readonly accountNameMaxLength = ACCOUNT_NAME_MAX_LENGTH;
  readonly accountLabel = accountLabel;
  readonly renamingAccountId = signal<number | null>(null);
  readonly savingRename = signal(false);
  readonly renameError = signal('');
  renameDraft = '';

  newAccountName = '';
  newAccountBalance = '0';
  newAccountPortfolioSize = 'BALANCED';
  newAccountTradeType = 'Passive';

  // State signals
  readonly profileData = signal<UserProfile>(this.readProfile());
  readonly editProfileStep = signal<EditProfileStep>('view');
  readonly isSavingProfile = signal(false);
  readonly changePasswordStep = signal<ChangePasswordStep>('form');
  readonly showChangePasswordModal = signal(false);
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
    const token = readToken();
    const userId = this.resolveUserId(token);

    if (!token || userId === null) {
      this.accountLoadError.set('Unable to identify the signed-in user.');
      return;
    }

    this.http.get<AccountInfo[]>(
      `${environment.springUrl}/accounts/user/${userId}`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).subscribe({
      next: (accounts) => {
        const activeAccounts = accounts.filter(account => account.accountActive);
        this.accounts.set(activeAccounts);
        this.loadPositionCounts(activeAccounts);
      },
      error: () => this.accountLoadError.set('Unable to load your accounts right now.')
    });
  }

  private loadPositionCounts(accounts: AccountInfo[]): void {
    if (!accounts.length) {
      this.positionCounts.set({});
      return;
    }

    const token = readToken();
    if (!token) return;

    const positionRequests = accounts.map(account => this.http.get<unknown[]>(
      `${environment.springUrl}/positions/account/${account.accountId}`,
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).pipe(catchError(() => of([] as unknown[]))));

    forkJoin(positionRequests).subscribe(positionLists => {
      const counts: Record<number, number> = {};
      accounts.forEach((account, index) => counts[account.accountId] = positionLists[index].length);
      this.positionCounts.set(counts);
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

  closeAccount(account: AccountInfo): void {
    if (!this.canCloseAccount(account) || !window.confirm(`Close account #${account.accountId}?`)) {
      return;
    }

    this.closingAccountId.set(account.accountId);
    this.closeAccountError.set('');

    this.accountContext.closeAccount(account.accountId).pipe(
      finalize(() => this.closingAccountId.set(null))
    ).subscribe({
      next: () => {
        this.accounts.update(accounts => accounts.map(item => item.accountId === account.accountId
          ? { ...item, balance: 0, accountActive: false }
          : item));
        this.accountContext.accounts.update(accounts => accounts.filter(item => item.accountId !== account.accountId));
      },
      error: (error) => {
        const message = typeof error.error === 'string' ? error.error : error.error?.message;
        this.closeAccountError.set(message || 'Unable to close the account.');
      }
    });
  }

  explainCloseBlocked(account: AccountInfo): void {
    if (this.canCloseAccount(account)) return;
    this.blockedCloseAccount.set(account);
  }

  closeBlockedExplanation(): void {
    this.blockedCloseAccount.set(null);
  }

  getCloseBlockedReason(account: AccountInfo): string {
    const reasons: string[] = [];
    if (account.balance !== 0) {
      reasons.push(`Withdraw the remaining ${this.formatCurrency(account.balance)} first.`);
    }
    const positionCount = this.positionCounts()[account.accountId] ?? 0;
    if (positionCount > 0) {
      reasons.push(`Sell your ${positionCount} open position${positionCount === 1 ? '' : 's'} first.`);
    }
    return reasons.join(' ');
  }

  canCloseAccount(account: AccountInfo): boolean {
    return account.balance === 0 && (this.positionCounts()[account.accountId] ?? 0) === 0;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  startRename(account: AccountInfo): void {
    this.renamingAccountId.set(account.accountId);
    this.renameDraft = account.accountName ?? '';
    this.renameError.set('');
  }

  cancelRename(): void {
    if (this.savingRename()) return;
    this.renamingAccountId.set(null);
    this.renameError.set('');
  }


  saveRename(account: AccountInfo): void {
    if (this.savingRename()) return;
    const problem = accountNameProblem(this.renameDraft);
    if (problem) {
      this.renameError.set(problem);
      return;
    }

    const name = this.renameDraft.trim() || null;
    this.savingRename.set(true);
    this.renameError.set('');
    this.accountContext.renameAccount(account.accountId, name)
      .pipe(finalize(() => this.savingRename.set(false)))
      .subscribe({
        next: renamed => {
          this.accounts.update(accounts => accounts.map(item =>
            item.accountId === account.accountId ? { ...item, accountName: renamed.accountName } : item
          ));
          this.renamingAccountId.set(null);
        },
        error: error => this.renameError.set(
          error?.status === 404
            ? 'This account can no longer be renamed. Reload the page and try again.'
            : apiErrorMessage(error, 'Unable to rename this account. Please try again.')
        )
      });
  }

  openAddAccount(): void {
    this.newAccountName = '';
    this.newAccountBalance = '0';
    this.newAccountPortfolioSize = 'BALANCED';
    this.newAccountTradeType = 'Passive';
    this.addAccountError.set('');
    this.addedAccountId.set(null);
    this.addedAccountLabel.set('');
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
    const nameProblem = accountNameProblem(this.newAccountName);
    if (nameProblem) {
      this.addAccountError.set(nameProblem);
      return;
    }
    const accountName = this.newAccountName.trim();

    const request: CreateAccountRequest = {
      balance,
      portfolioSize: this.newAccountPortfolioSize,
      tradeType,
      // Optional: left out entirely when the user didn't name the account
      ...(accountName ? { accountName } : {})
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
          this.addedAccountLabel.set(accountLabel(account));
        },
        error: (error) => {
          this.addAccountError.set(apiErrorMessage(error, 'Unable to add the account. Please try again.'));
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
    if (!this.validateProfileForm() || this.isSavingProfile()) return;

    const name = `${this.editFirstName.trim()} ${this.editLastName.trim()}`;
    const email = this.editEmail.trim().toLowerCase();
    const address = this.editAddress.trim();
    const token = readToken();

    if (!token) {
      this.editFormError = 'Your session has expired. Please log in again.';
      return;
    }

    this.isSavingProfile.set(true);
    this.editFormError = '';
    this.http.patch<{ name: string; email: string; address: string }>(
      `${environment.springUrl}/user`,
      { name, email, address },
      { headers: new HttpHeaders({ Authorization: `Bearer ${token}` }) }
    ).pipe(finalize(() => this.isSavingProfile.set(false))).subscribe({
      next: (updatedUser) => {
        this.profileData.set({
          firstName: updatedUser.name.trim().split(/\s+/)[0] ?? '',
          lastName: updatedUser.name.trim().split(/\s+/).slice(1).join(' '),
          email: updatedUser.email,
          address: updatedUser.address
        });
        this.authService.setUserProfile(updatedUser);
        this.editProfileStep.set('success');
      },
      error: (error) => {
        this.editFormError = this.getProfileUpdateError(error);
      }
    });
  }

  private getProfileUpdateError(error: { error?: unknown }): string {
    if (typeof error.error === 'string') return error.error;
    if (error.error && typeof error.error === 'object' && 'message' in error.error) {
      return String((error.error as { message: unknown }).message);
    }
    return 'Unable to update your profile. Please try again.';
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
    this.authService.logout();
    this.router.navigate(['/forgot-password']);
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

  // Navigation
  navigate(destination: string): void {
    if (destination === 'logout') {
      this.authService.logout();
      this.router.navigate(['/login']);
      return;
    }
    this.router.navigate([`/${destination}`]);
  }
}
