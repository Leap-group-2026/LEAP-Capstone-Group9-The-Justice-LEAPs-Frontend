import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MainLayout } from './shared/components/main-layout/main-layout';
import { AuthService } from './shared/services/auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, MainLayout],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly isLoggedIn = this.authService.isLoggedIn;

  protected showNavigation(): boolean {
    return this.isLoggedIn() && !this.router.url.includes('/login');
  }

  protected getCurrentPageTitle(): string {
    const path = this.router.url.split('/')[1] || 'dashboard';
    const titleMap: Record<string, string> = {
      dashboard: 'Dashboard',
      portfolio: 'Portfolio',
      trade: 'Trade',
      orders: 'Orders',
      transactions: 'Transactions',
      account: 'Account'
    };
    return titleMap[path] || 'Dashboard';
  }
}
