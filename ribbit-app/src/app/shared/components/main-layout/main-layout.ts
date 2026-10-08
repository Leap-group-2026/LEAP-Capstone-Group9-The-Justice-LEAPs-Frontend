import { Component, Input, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
}

type Destination = 'dashboard' | 'portfolio' | 'trade' | 'orders' | 'transactions' | 'account' | 'logout';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss']
})
export class MainLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  @Input() pageTitle = '';
  @Input() user = {
    name: 'Jordan Lee',
    initials: 'JL',
    accountEnding: '4821'
  };

  sidebarOpen = false;
  sidebarCollapsed = false;
  currentPage = 'dashboard';

  readonly navigation: NavigationItem[] = [
    { id: 'dashboard', label: 'Home', icon: 'dashboard' },
    { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
    { id: 'trade', label: 'Trade', icon: 'trade' },
    { id: 'orders', label: 'Orders', icon: 'orders' },
    { id: 'transactions', label: 'Transactions', icon: 'history' },
    { id: 'account', label: 'Account', icon: 'account' }
  ];

  readonly icons: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    portfolio: 'M8 7V5h8v2 M3 7h18v13H3z M3 12h18 M10 12v3h4v-3',
    trade: 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
    orders: 'M8 4H5v17h14V4h-3 M8 3h8v4H8z M8 11h8 M8 15h5',
    history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2',
    logout: 'M9 3H4v18h5 M10 12h11 M17 8l4 4-4 4',
    support: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',
    arrow: 'M5 12h14 M13 6l6 6-6 6',
    external: 'M7 17 17 7 M7 7h10v10',
    plus: 'M12 5v14 M5 12h14',
    menu: 'M4 6h16 M4 12h16 M4 18h16',
    collapse: 'M15 19l-7-7 7-7',
    expand: 'M9 5l7 7-7 7'
  };

  ngOnInit(): void {
    this.updateCurrentPage();
    
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.updateCurrentPage());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateCurrentPage(): void {
    const path = this.router.url.split('/')[1] || 'dashboard';
    this.currentPage = path;
  }

  navigate(destination: string): void {
    this.sidebarOpen = false;
    if (destination === 'logout') {
      this.router.navigate(['/login']);
    } else {
      this.router.navigate([`/${destination}`]);
    }
  }
}
