import { ChangeDetectorRef, Component, ElementRef, Input, ViewChild, effect, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SessionTimer } from '../session-timer/session-timer';
import { Router, RouterLink, RouterLinkActive, NavigationEnd } from '@angular/router';
import { interval, Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';
import { AuthService, StoredUser } from '../../services/auth.service';
import { AccountContextService } from '../../services/account-context.service';
import { InstrumentsApiService, MarketNews } from '../../services/instruments-api.service';
import { ThemeService } from '../../services/theme.service';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [CommonModule, SessionTimer, RouterLink, RouterLinkActive],
  templateUrl: './main-layout.html',
  styleUrls: ['./main-layout.scss']
})
export class MainLayout implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly instrumentsApi = inject(InstrumentsApiService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  readonly accountContext = inject(AccountContextService);
  readonly theme = inject(ThemeService);
  private readonly destroy$ = new Subject<void>();

  @Input() pageTitle = '';
  @Input() user: StoredUser = this.authService.getUserProfile();

  sidebarOpen = false;
  sidebarCollapsed = false;
  profileMenuOpen = false;
  currentPage = 'dashboard';
  news: MarketNews[] = [];
  activeNewsIndex = 0;
  newsStatus: 'loading' | 'ready' | 'unavailable' = 'loading';
  newsTransition: 'next' | 'previous' | '' = '';
  marketOpen = false;
  readonly supportModalOpen = signal(false);
  readonly frozenNoticeOpen = signal(false);
  readonly frozenNoticeAccountId = signal<number | null>(null);
  private frozenNoticeShownAccountId: number | null = null;
  private newsTransitionTimeout?: ReturnType<typeof setTimeout>;
  private readonly frozenAccountEffect = effect(() => {
    const account = this.accountContext.selectedAccount();
    if (account?.accountFrozen && account.accountId !== this.frozenNoticeShownAccountId) {
      this.frozenNoticeShownAccountId = account.accountId;
      this.frozenNoticeAccountId.set(account.accountId);
      this.frozenNoticeOpen.set(true);
    } else if (!account?.accountFrozen) {
      this.frozenNoticeShownAccountId = null;
    }
  });

  @ViewChild('newsItem') private newsItem?: ElementRef<HTMLElement>;

  readonly navigation: NavigationItem[] = [
    { id: 'dashboard', label: 'Home', icon: 'dashboard' },
    { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
    { id: 'trade', label: 'Trade', icon: 'trade' },
    { id: 'orders', label: 'Orders', icon: 'orders' },
    { id: 'transactions', label: 'Transactions', icon: 'history' },
    { id: 'account', label: 'Account', icon: 'account' },
    { id: 'news', label: 'Ribbit News', icon: 'news' },
    { id: 'admin', label: 'Admin', icon: 'admin' },
    { id: 'admin/users', label: 'Users', icon: 'account' },
    { id: 'admin/orders', label: 'Orders', icon: 'orders' },
    { id: 'admin/transactions', label: 'Transactions', icon: 'history' },
    { id: 'admin/frozen-accounts', label: 'Frozen accounts', icon: 'admin' },
    { id: 'admin/add-admin', label: 'Add admin', icon: 'plus' },
    { id: 'reporter', label: 'Trending data', icon: 'trends' },
    { id: 'trading-trends', label: 'Trading trends', icon: 'trends' }
  ];

  get visibleNavigation(): NavigationItem[] {
    if (this.authService.isReporter()) {
      return this.navigation.filter(item => item.id === 'reporter');
    }

    if (this.authService.isAdmin()) {
      return this.navigation.filter(item => item.id.startsWith('admin'));
    }

    return this.navigation.filter(item => !item.id.startsWith('admin') && item.id !== 'reporter');
  }

  get isAdminUser(): boolean {
    return this.authService.isAdmin();
  }

  get isReporterUser(): boolean {
    return this.authService.isReporter();
  }

  readonly icons: Record<string, string> = {
    dashboard: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    portfolio: 'M8 7V5h8v2 M3 7h18v13H3z M3 12h18 M10 12v3h4v-3',
    trends: 'M4 19V5 M4 19h16 M8 15l3-4 3 2 5-7',
    trade: 'M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4',
    orders: 'M8 4H5v17h14V4h-3 M8 3h8v4H8z M8 11h8 M8 15h5',
    history: 'M3 11a9 9 0 1 1 2 7 M3 4v7h7 M12 7v5l3 2',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2',
    news: 'M4 5h16v14H4z M8 9h8 M8 13h5',
    admin: 'M12 3 20 6v5c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z M9 12l2 2 4-4',
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
    this.accountContext.frozenNoticeRequested
      .pipe(takeUntil(this.destroy$))
      .subscribe(accountId => {
        if (!this.isAdminUser) {
          this.frozenNoticeAccountId.set(accountId);
          this.frozenNoticeOpen.set(true);
        }
      });

    if (!this.authService.isAdmin() && !this.authService.isReporter()) {
      this.accountContext.loadAccounts();
    }
    this.updateCurrentPage();
    this.updateMarketStatus();
    this.loadNews();
    
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => this.updateCurrentPage());

    interval(10000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.advanceNewsAutomatically());

    interval(60000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.updateMarketStatus());
  }

  private updateMarketStatus(): void {
    const easternTimeParts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(new Date());
    const parts = Object.fromEntries(easternTimeParts.map(({ type, value }) => [type, value]));
    const weekday = parts['weekday'];
    const minutes = Number(parts['hour']) * 60 + Number(parts['minute']);

    this.marketOpen = weekday !== 'Sat' && weekday !== 'Sun' && minutes >= 570 && minutes < 960;
    this.changeDetectorRef.markForCheck();
  }

  closeFrozenNotice(): void {
    this.frozenNoticeOpen.set(false);
  }

  openSupportModal(): void {
    this.supportModalOpen.set(true);
  }

  closeSupportModal(): void {
    this.supportModalOpen.set(false);
  }

  loadNews(): void {
    this.instrumentsApi.getNews()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: news => {
          this.news = news.filter(item => item.headline && item.url);
          this.activeNewsIndex = 0;
          this.newsStatus = this.news.length ? 'ready' : 'unavailable';
          this.changeDetectorRef.markForCheck();
        },
        error: () => {
          this.news = [];
          this.newsStatus = 'unavailable';
          this.changeDetectorRef.markForCheck();
        }
      });
  }

  showPreviousNews(): void {
    if (this.news.length > 1) {
      this.activeNewsIndex = (this.activeNewsIndex - 1 + this.news.length) % this.news.length;
      this.restartNewsAnimation('previous');
      this.changeDetectorRef.markForCheck();
    }
  }

  showNextNews(): void {
    if (this.news.length > 1) {
      this.activeNewsIndex = (this.activeNewsIndex + 1) % this.news.length;
      this.restartNewsAnimation('next');
      this.changeDetectorRef.markForCheck();
    }
  }

  private advanceNewsAutomatically(): void {
    if (this.news.length > 1) {
      this.activeNewsIndex = (this.activeNewsIndex + 1) % this.news.length;
      this.restartNewsAnimation('next');
      this.changeDetectorRef.markForCheck();
    }
  }

  private restartNewsAnimation(direction: 'next' | 'previous'): void {
    clearTimeout(this.newsTransitionTimeout);
    this.newsTransition = '';
    this.changeDetectorRef.detectChanges();
    this.newsItem?.nativeElement.offsetWidth;
    this.newsTransition = direction;
    this.changeDetectorRef.detectChanges();

    this.newsTransitionTimeout = setTimeout(() => {
      this.newsTransition = '';
      this.changeDetectorRef.markForCheck();
    }, 350);
  }

  selectAccount(event: Event): void {
    const accountId = Number((event.target as HTMLSelectElement).value);
    if (Number.isInteger(accountId)) {
      this.accountContext.selectAccount(accountId);
    }
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  navigateFromProfile(destination: 'account' | 'logout'): void {
    this.profileMenuOpen = false;
    this.navigate(destination);
  }

  ngOnDestroy(): void {
    clearTimeout(this.newsTransitionTimeout);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateCurrentPage(): void {
    const segments = this.router.url.split('?')[0].split('/').filter(Boolean);
    this.currentPage = segments[0] === 'admin' && segments[1]
      ? `admin/${segments[1]}`
      : segments[0] || 'dashboard';
    this.user = this.authService.getUserProfile();
  }

  isNavigationActive(item: NavigationItem): boolean {
    const currentPath = this.router.url.split('?')[0].replace(/\/$/, '') || '/';
    return currentPath === `/${item.id}`;
  }

  navigate(destination: string): void {
    this.sidebarOpen = false;
    if (destination === 'logout') {
      this.authService.logout();
      this.router.navigate(['/login']);
    } else if (destination === 'account' && this.authService.isAdmin()) {
      this.router.navigate(['/admin']);
    } else {
      this.router.navigate([`/${destination}`]);
    }
  }
}
