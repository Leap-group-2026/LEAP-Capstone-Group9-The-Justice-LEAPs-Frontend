import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MainLayout } from './shared/components/main-layout/main-layout';
import { AuthService } from './shared/services/auth.service';
import { SessionActivityService } from './shared/services/session-activity.service';

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

  constructor() {
    inject(SessionActivityService).start();
  }

  protected showNavigation(): boolean {
    const currentPath = this.router.url.split('?')[0].replace(/\/$/, '');
    const isPublicPage = ['/login', '/admin-login', '/signup', '/forgot-password'].includes(currentPath);
    return this.isLoggedIn().isLoggedIn && !isPublicPage;
  }

  protected getCurrentPageTitle(): string {
    const path = this.router.url.split('/')[1] || 'dashboard';
    const titleMap: Record<string, string> = {
      dashboard: 'Dashboard',
      portfolio: 'Portfolio',
      trade: 'Trade',
      orders: 'Orders',
      transactions: 'Transactions',
      account: 'Account',
      admin: 'Admin'
    };
    return titleMap[path] || 'Dashboard';
  }
}
