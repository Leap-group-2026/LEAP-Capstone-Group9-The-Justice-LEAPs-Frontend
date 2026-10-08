import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type EditProfileStep = 'view' | 'edit' | 'success';
type ChangePasswordStep = 'form' | 'success';

interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

interface AccountInfo {
  accountId: string;
  accountType: string;
  accountStatus: string;
  accountCreated: string;
  portfolioProfile: string;
}

interface PreferenceSettings {
  emailNotifications: boolean;
  orderConfirmations: boolean;
  tradeAlerts: boolean;
  accountNotifications: boolean;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account.html',
  styleUrls: ['./account.scss']
})
export class Account {
  private readonly router = inject(Router);

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

  // Mock user profile data
  readonly mockProfile: UserProfile = {
    firstName: 'John',
    lastName: 'Trader',
    email: 'john.trader@example.com',
    phone: '(555) 123-4567'
  };

  // Mock account information
  readonly mockAccountInfo: AccountInfo = {
    accountId: 'RB-100024',
    accountType: 'Individual',
    accountStatus: 'Active',
    accountCreated: 'August 15, 2026',
    portfolioProfile: 'Balanced'
  };

  // State signals
  readonly profileData = signal<UserProfile>({ ...this.mockProfile });
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
  editPhone = '';
  editFormError = '';

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordFormError = '';

  // Getters for display
  get userDisplayName(): string {
    const profile = this.profileData();
    return `${profile.firstName} ${profile.lastName}`;
  }

  get lastPasswordChange(): string {
    return 'September 12, 2026';
  }

  // Format phone number for display
  formatPhoneDisplay(phone: string): string {
    return phone || 'Not provided';
  }

  // Edit Profile methods
  openEditProfile(): void {
    const profile = this.profileData();
    this.editFirstName = profile.firstName;
    this.editLastName = profile.lastName;
    this.editEmail = profile.email;
    this.editPhone = profile.phone;
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

    if (!this.editPhone.trim()) {
      this.editFormError = 'Phone number is required.';
      return false;
    }

    const phoneRegex = /^\(\d{3}\)\s\d{3}-\d{4}$/;
    if (!phoneRegex.test(this.editPhone)) {
      this.editFormError = 'Please enter a valid phone number (e.g., (555) 123-4567).';
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
        phone: this.editPhone
      });
      this.editProfileStep.set('success');
    }
  }

  finishProfileEdit(): void {
    this.editProfileStep.set('view');
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
