import { computed, Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ThemeService } from './theme.service';

export interface TutorialStep {
  title: string;
  description: string;
  route: string | null;
}

@Injectable({ providedIn: 'root' })
export class TutorialService {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  readonly steps: TutorialStep[] = [
    { title: 'Home', description: 'Your dashboard gives you a quick overview of your account and the market.', route: '/dashboard' },
    { title: 'Portfolio', description: 'Review your holdings, market value, and investment performance.', route: '/portfolio' },
    { title: 'Trade', description: 'Explore instruments and place buy or sell orders from the Trade page.', route: '/trade' },
    { title: 'Orders', description: 'Check the status and details of your submitted orders.', route: '/orders' },
    { title: 'Transactions', description: 'Review deposits, withdrawals, and trade history.', route: '/transactions' },
    { title: 'Ribbit News', description: 'Catch up on market news relevant to your investments.', route: '/news' },
    { title: 'Settings', description: 'Manage your profile, security, and accounts from the Account page.', route: '/account' },
    { title: 'Light mode', description: 'The tutorial uses light mode. Click the Ribbit logo in the header to switch between light and dark mode at any time.', route: null }
  ];

  readonly isOpen = signal(false);
  readonly stepIndex = signal(0);
  readonly currentStep = computed(() => this.steps[this.stepIndex()] ?? this.steps[0]);

  markRegistrationForTutorial(email: string): void {
    if (typeof localStorage === 'undefined' || !email.trim()) return;
    localStorage.setItem(this.pendingKey(email), 'true');
  }

  startForFirstLogin(email: string): void {
    if (typeof localStorage === 'undefined' || !email.trim()) return;
    const key = this.pendingKey(email);
    if (localStorage.getItem(key) !== 'true') return;
    localStorage.removeItem(key);
    this.start();
  }

  start(): void {
    this.stepIndex.set(0);
    this.isOpen.set(true);
    if (!this.theme.isLight()) this.theme.toggle();
    void this.router.navigate(['/dashboard']);
  }

  next(): void {
    if (this.stepIndex() === this.steps.length - 1) {
      this.close();
      return;
    }
    this.stepIndex.update(index => index + 1);
    this.navigateToCurrentStep();
  }

  previous(): void {
    if (this.stepIndex() === 0) return;
    this.stepIndex.update(index => index - 1);
    this.navigateToCurrentStep();
  }

  close(): void {
    this.isOpen.set(false);
  }

  private navigateToCurrentStep(): void {
    const route = this.currentStep().route;
    if (route) void this.router.navigate([route]);
  }

  private pendingKey(email: string): string {
    return `ribbit-tutorial-pending:${email.trim().toLowerCase()}`;
  }
}
