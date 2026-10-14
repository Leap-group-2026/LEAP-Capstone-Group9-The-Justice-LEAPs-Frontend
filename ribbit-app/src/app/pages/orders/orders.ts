import { Component, OnInit, PLATFORM_ID, inject, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { OrdersApiService, OrderHistoryApiResponse } from '../../shared/services/orders-api.service';
import { environment } from '../../environments/environment';
import { AuthService } from '../../shared/services/auth.service';

type OrderStatus = 'Pending' | 'Filled' | 'Cancelled' | 'Rejected';
type OrderSide = 'Buy' | 'Sell';
type OrderType = 'Market' | 'Limit';

interface Order {
  backendOrderId?: number;
  id: string;
  date: string;
  time: string;
  symbol: string;
  instrument: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  price: number;
  totalValue: number;
  status: OrderStatus;
  filledQuantity?: number;
  averageFillPrice?: number;
}

interface AccountApiResponse {
  accountId: number;
}

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.html',
  styleUrls: ['./orders.scss']
})
export class Orders implements OnInit {
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly ordersApiService = inject(OrdersApiService);
  private readonly authService = inject(AuthService);

  readonly user = this.authService.getUserProfile();

  readonly mockOrders: Order[] = [
    {
      id: 'ORD-2026-1048',
      date: '2026-10-08',
      time: '2:45 PM ET',
      symbol: 'NVDA',
      instrument: 'NVIDIA Corporation',
      side: 'Buy',
      quantity: 50,
      orderType: 'Limit',
      price: 140.00,
      totalValue: 7000.00,
      status: 'Filled',
      filledQuantity: 50,
      averageFillPrice: 139.85
    },
    {
      id: 'ORD-2026-1047',
      date: '2026-10-08',
      time: '1:30 PM ET',
      symbol: 'TSLA',
      instrument: 'Tesla Inc.',
      side: 'Sell',
      quantity: 25,
      orderType: 'Market',
      price: 245.50,
      totalValue: 6137.50,
      status: 'Pending'
    },
    {
      id: 'ORD-2026-1046',
      date: '2026-10-08',
      time: '11:15 AM ET',
      symbol: 'AAPL',
      instrument: 'Apple Inc.',
      side: 'Buy',
      quantity: 100,
      orderType: 'Limit',
      price: 225.00,
      totalValue: 22500.00,
      status: 'Filled',
      filledQuantity: 100,
      averageFillPrice: 224.80
    },
    {
      id: 'ORD-2026-1045',
      date: '2026-10-07',
      time: '3:45 PM ET',
      symbol: 'MSFT',
      instrument: 'Microsoft Corporation',
      side: 'Buy',
      quantity: 40,
      orderType: 'Limit',
      price: 420.00,
      totalValue: 16800.00,
      status: 'Pending'
    },
    {
      id: 'ORD-2026-1044',
      date: '2026-10-07',
      time: '2:30 PM ET',
      symbol: 'GOOGL',
      instrument: 'Alphabet Inc.',
      side: 'Sell',
      quantity: 30,
      orderType: 'Market',
      price: 170.25,
      totalValue: 5107.50,
      status: 'Cancelled'
    },
    {
      id: 'ORD-2026-1043',
      date: '2026-10-07',
      time: '10:00 AM ET',
      symbol: 'META',
      instrument: 'Meta Platforms Inc.',
      side: 'Buy',
      quantity: 60,
      orderType: 'Limit',
      price: 510.00,
      totalValue: 30600.00,
      status: 'Filled',
      filledQuantity: 60,
      averageFillPrice: 508.50
    },
    {
      id: 'ORD-2026-1042',
      date: '2026-10-06',
      time: '4:15 PM ET',
      symbol: 'AMZN',
      instrument: 'Amazon.com Inc.',
      side: 'Buy',
      quantity: 20,
      orderType: 'Market',
      price: 185.00,
      totalValue: 3700.00,
      status: 'Rejected'
    },
    {
      id: 'ORD-2026-1041',
      date: '2026-10-06',
      time: '1:20 PM ET',
      symbol: 'AMD',
      instrument: 'Advanced Micro Devices Inc.',
      side: 'Sell',
      quantity: 75,
      orderType: 'Limit',
      price: 165.00,
      totalValue: 12375.00,
      status: 'Pending'
    },
    {
      id: 'ORD-2026-1040',
      date: '2026-10-06',
      time: '10:30 AM ET',
      symbol: 'INTC',
      instrument: 'Intel Corporation',
      side: 'Buy',
      quantity: 120,
      orderType: 'Limit',
      price: 28.50,
      totalValue: 3420.00,
      status: 'Filled',
      filledQuantity: 120,
      averageFillPrice: 28.42
    },
    {
      id: 'ORD-2026-1039',
      date: '2026-10-05',
      time: '2:00 PM ET',
      symbol: 'NFLX',
      instrument: 'Netflix Inc.',
      side: 'Buy',
      quantity: 15,
      orderType: 'Market',
      price: 265.00,
      totalValue: 3975.00,
      status: 'Pending'
    }
  ];

  // State management
  readonly orders = signal<Order[]>([]);
  readonly filteredOrders = computed(() => this.applyFilters());
  readonly expandedOrderId = signal<string | null>(null);
  readonly showOrderDetailsModal = signal(false);
  readonly selectedOrder = signal<Order | null>(null);
  readonly showCancelConfirmModal = signal(false);
  readonly orderToCancelId = signal<string | null>(null);
  readonly isLoading = signal(false);
  readonly loadError = signal('');

  // Filter state
  searchQuery = '';
  statusFilter = 'all';
  sideFilter = 'all';
  orderTypeFilter = 'all';
  dateFilter = 'all';

  // Icons
  readonly icons: Record<string, string> = {
    plus: 'M12 5v14 M5 12h14',
    chevron: 'M8 14l4-4 4 4',
    external: 'M7 17 17 7 M7 7h10v10'
  };

  // Summary computations
  readonly totalOrders = computed(() => this.orders().length);
  readonly openOrders = computed(() => 
    this.orders().filter(o => o.status === 'Pending').length
  );
  readonly filledOrders = computed(() => 
    this.orders().filter(o => o.status === 'Filled').length
  );
  readonly cancelledOrders = computed(() => 
    this.orders().filter(o => o.status === 'Cancelled' || o.status === 'Rejected').length
  );

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set('');

    try {
      const accountId = await this.resolveAccountId();

      if (!accountId) {
        this.orders.set([]);
        this.loadError.set('No active account was found for the logged-in user.');
        return;
      }

      this.ordersApiService
        .getOrderHistory(accountId)
        .pipe(finalize(() => this.isLoading.set(false)))
        .subscribe({
          next: apiOrders => {
            this.orders.set(apiOrders.map(order => this.mapApiOrderToView(order)));
          },
          error: error => {
            this.orders.set([]);
            this.loadError.set(this.getLoadErrorMessage(error));
          }
        });
        console.log(this.orders().length);
    } catch {
      this.orders.set([]);
      this.isLoading.set(false);
      this.loadError.set('Unable to load the logged-in user account.');
    }
  }

  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }

  applyFilters(): Order[] {
    let filtered = this.orders();

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.id.toLowerCase().includes(query) ||
        order.symbol.toLowerCase().includes(query) ||
        order.instrument.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.status.toLowerCase() === this.statusFilter.toLowerCase()
      );
    }

    // Side filter
    if (this.sideFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.side.toLowerCase() === this.sideFilter.toLowerCase()
      );
    }

    // Order type filter
    if (this.orderTypeFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.orderType.toLowerCase() === this.orderTypeFilter.toLowerCase()
      );
    }

    // Date filter
    if (this.dateFilter !== 'all') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      filtered = filtered.filter(order => {
        const orderDate = new Date(order.date);
        orderDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

        if (this.dateFilter === 'today') return daysDiff === 0;
        if (this.dateFilter === 'week') return daysDiff < 7;
        if (this.dateFilter === 'month') return daysDiff < 30;
        return true;
      });
    }

    return filtered;
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
  }

  onStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter = target.value;
  }

  onSideFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.sideFilter = target.value;
  }

  onOrderTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.orderTypeFilter = target.value;
  }

  onDateFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.dateFilter = target.value;
  }

  toggleOrderDetails(orderId: string): void {
    if (this.expandedOrderId() === orderId) {
      this.expandedOrderId.set(null);
    } else {
      this.expandedOrderId.set(orderId);
    }
  }

  isOrderExpanded(orderId: string): boolean {
    return this.expandedOrderId() === orderId;
  }

  openOrderDetailsModal(order: Order): void {
    this.selectedOrder.set(order);
    this.showOrderDetailsModal.set(true);
  }

  closeOrderDetailsModal(): void {
    this.showOrderDetailsModal.set(false);
    this.selectedOrder.set(null);
  }

  openCancelConfirmation(orderId: string): void {
    const order = this.orders().find(o => o.id === orderId);
    if (order) {
      this.selectedOrder.set(order);
      this.orderToCancelId.set(orderId);
      this.showCancelConfirmModal.set(true);
    }
  }

  closeCancelConfirmation(): void {
    this.showCancelConfirmModal.set(false);
    this.orderToCancelId.set(null);
    this.selectedOrder.set(null);
  }

  confirmCancelOrder(): void {
    const orderId = this.orderToCancelId();
    if (!orderId) return;

    const orders = this.orders();
    const orderIndex = orders.findIndex(o => o.id === orderId);
    
    if (orderIndex !== -1) {
      const updatedOrders = [...orders];
      updatedOrders[orderIndex] = { ...updatedOrders[orderIndex], status: 'Cancelled' };
      this.orders.set(updatedOrders);
    }

    this.closeCancelConfirmation();
    this.closeOrderDetailsModal();
  }

  canCancelOrder(order: Order): boolean {
    return order.status === 'Pending';
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  }

  getStatusBadgeClass(status: OrderStatus): string {
    const statusMap: Record<OrderStatus, string> = {
      'Pending': 'pending',
      'Filled': 'filled',
      'Cancelled': 'cancelled',
      'Rejected': 'rejected'
    };
    return statusMap[status] || '';
  }

  getSideClass(side: OrderSide): string {
    return side.toLowerCase();
  }

  private async resolveAccountId(): Promise<number | null> {
    if (typeof window === 'undefined') {
      return null;
    }
    const token = localStorage.getItem('token');
    if (!token) {
      return null;
    }

    const response = await fetch(`${environment.springUrl}/user`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error(`Account request failed: ${response.status}`);
    }

    const accounts = await response.json() as AccountApiResponse[];
    const accountId = accounts[0]?.accountId;

    return Number.isInteger(accountId) && accountId > 0 ? accountId : null;
  }

  private mapApiOrderToView(order: OrderHistoryApiResponse): Order {
    const parsedDate = order.executedAt ? new Date(order.executedAt) : null;
    const hasValidDate = !!parsedDate && !Number.isNaN(parsedDate.getTime());
    const status = this.mapOrderStatus(order.status);

    return {
      backendOrderId: order.orderId,
      id: `ORD-${order.orderId}`,
      date: hasValidDate ? parsedDate!.toISOString().slice(0, 10) : '',
      time: hasValidDate
        ? new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZoneName: 'short'
          }).format(parsedDate!)
        : 'N/A',
      symbol: (order.ticker || '').toUpperCase(),
      instrument: (order.ticker || '').toUpperCase(),
      side: this.mapOrderSide(order.side),
      quantity: Number(order.quantity) || 0,
      orderType: 'Market',
      price: Number(order.pricePerUnit) || 0,
      totalValue: Number(order.totalPrice) || 0,
      status,
      filledQuantity: status === 'Filled' ? Number(order.quantity) || 0 : undefined,
      averageFillPrice: status === 'Filled' ? Number(order.pricePerUnit) || 0 : undefined
    };
  }

  private mapOrderStatus(status: string): OrderStatus {
    switch ((status || '').toUpperCase()) {
      case 'PENDING':
        return 'Pending';
      case 'FILLED':
        return 'Filled';
      case 'CANCELED':
      case 'CANCELLED':
        return 'Cancelled';
      case 'DECLINED':
      case 'FAILED':
      case 'REJECTED':
        return 'Rejected';
      default:
        return 'Pending';
    }
  }

  private mapOrderSide(side: string): OrderSide {
    return (side || '').toUpperCase() === 'SELL' ? 'Sell' : 'Buy';
  }

  private getLoadErrorMessage(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'Unable to load live orders. Showing mock orders.';
    }

    if (error.status === 0) {
      return 'Could not reach API (network/CORS). Showing mock orders.';
    }

    if (error.status === 401 || error.status === 403) {
      return 'API auth failed (401/403). Add a valid JWT token in localStorage. Showing mock orders.';
    }

    if (error.status === 404) {
      return 'Account or endpoint not found (404). Verify localStorage accountId and API base URL. Showing mock orders.';
    }

    return `Live orders request failed (HTTP ${error.status}). Showing mock orders.`;
  }
}
