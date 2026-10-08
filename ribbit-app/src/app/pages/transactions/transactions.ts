import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type TransactionType = 'Deposit' | 'Withdrawal' | 'Buy' | 'Sell';
type TransactionStatus = 'Completed' | 'Pending' | 'Failed';
type AddFundsStep = 'form' | 'review' | 'success';

interface Transaction {
  id: string;
  date: string;
  time: string;
  type: TransactionType;
  description: string;
  amount: number;
  status: TransactionStatus;
  instrument?: string;
  quantity?: number;
  price?: number;
}

interface MockTransaction extends Transaction {}

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrls: ['./transactions.scss']
})
export class Transactions {
  private readonly router = inject(Router);

  // Account data
  readonly user = {
    name: 'Jordan Lee',
    accountEnding: '4821'
  };

  private availableCashCents = 1_250_000; // $12,500.00 in cents

  // Mock transaction data
  readonly mockTransactions: MockTransaction[] = [
    {
      id: 'TRX-2026-1001',
      date: '2026-10-08',
      time: '2:45 PM ET',
      type: 'Buy',
      description: 'Apple Inc.',
      amount: -2284.20,
      status: 'Completed',
      instrument: 'AAPL',
      quantity: 10,
      price: 228.42
    },
    {
      id: 'TRX-2026-1000',
      date: '2026-10-08',
      time: '10:30 AM ET',
      type: 'Deposit',
      description: 'Bank transfer from Chase',
      amount: 5000.00,
      status: 'Completed'
    },
    {
      id: 'TRX-2026-0999',
      date: '2026-10-07',
      time: '3:15 PM ET',
      type: 'Sell',
      description: 'Microsoft Corporation',
      amount: 2128.00,
      status: 'Completed',
      instrument: 'MSFT',
      quantity: 5,
      price: 425.60
    },
    {
      id: 'TRX-2026-0998',
      date: '2026-10-07',
      time: '11:20 AM ET',
      type: 'Withdrawal',
      description: 'Withdrawal to checking account',
      amount: -1500.00,
      status: 'Completed'
    },
    {
      id: 'TRX-2026-0997',
      date: '2026-10-06',
      time: '4:30 PM ET',
      type: 'Buy',
      description: 'NVIDIA Corporation',
      amount: -2871.40,
      status: 'Completed',
      instrument: 'NVDA',
      quantity: 20,
      price: 143.57
    },
    {
      id: 'TRX-2026-0996',
      date: '2026-10-06',
      time: '9:00 AM ET',
      type: 'Deposit',
      description: 'Direct deposit salary',
      amount: 3500.00,
      status: 'Completed'
    },
    {
      id: 'TRX-2026-0995',
      date: '2026-10-05',
      time: '2:10 PM ET',
      type: 'Buy',
      description: 'Tesla, Inc.',
      amount: -7455.00,
      status: 'Pending',
      instrument: 'TSLA',
      quantity: 30,
      price: 248.50
    },
    {
      id: 'TRX-2026-0994',
      date: '2026-10-04',
      time: '1:45 PM ET',
      type: 'Withdrawal',
      description: 'Withdrawal attempt',
      amount: -2000.00,
      status: 'Failed'
    },
    {
      id: 'TRX-2026-0993',
      date: '2026-10-04',
      time: '10:15 AM ET',
      type: 'Deposit',
      description: 'Credit card transfer',
      amount: 1000.00,
      status: 'Completed'
    },
    {
      id: 'TRX-2026-0992',
      date: '2026-10-03',
      time: '3:30 PM ET',
      type: 'Sell',
      description: 'Apple Inc.',
      amount: 1827.36,
      status: 'Completed',
      instrument: 'AAPL',
      quantity: 8,
      price: 228.42
    }
  ];

  // Funding methods for Add Funds
  readonly fundingMethods = [
    { id: 'bank', label: 'Bank Account' },
    { id: 'debit', label: 'Debit Card' }
  ];

  // Icons
  readonly icons: Record<string, string> = {
    plus: 'M12 5v14 M5 12h14',
    external: 'M7 17 17 7 M7 7h10v10',
    chevron: 'M9 6l6 6-6 6'
  };

  // UI state
  readonly showAddFundsModal = signal(false);
  readonly addFundsStep = signal<AddFundsStep>('form');
  readonly transactions = signal<Transaction[]>(this.mockTransactions);
  readonly filteredTransactions = signal<Transaction[]>(this.mockTransactions);
  readonly expandedTransactionId = signal<string | null>(null);

  // Form state
  addFundsAmount = '';
  addFundsFundingMethod = 'bank';
  addFundsError = '';

  // Filter state
  searchQuery = '';
  typeFilter = 'all';
  statusFilter = 'all';

  constructor() {
    this.applyFilters();
  }

  // Getters for calculations
  get availableCash(): number {
    return this.availableCashCents / 100;
  }

  get totalDeposits(): number {
    return this.mockTransactions
      .filter(t => t.type === 'Deposit' && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0);
  }

  get totalWithdrawals(): number {
    return Math.abs(
      this.mockTransactions
        .filter(t => t.type === 'Withdrawal' && t.status === 'Completed')
        .reduce((sum, t) => sum + t.amount, 0)
    );
  }

  get totalTransactionValue(): number {
    return this.mockTransactions
      .filter(t => t.status === 'Completed')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  }

  get completedTransactionsCount(): number {
    return this.mockTransactions.filter(t => t.status === 'Completed').length;
  }

  // Format helpers
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getAmountDisplay(amount: number): string {
    return amount >= 0 ? `+${this.formatCurrency(amount)}` : this.formatCurrency(amount);
  }

  getStatusBadgeClass(status: TransactionStatus): string {
    return status.toLowerCase().replace(/\s+/g, '-');
  }

  // Filter and search
  applyFilters(): void {
    let filtered = [...this.mockTransactions];

    // Search filter
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(t =>
        t.id.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.instrument?.toLowerCase().includes(query)
      );
    }

    // Type filter
    if (this.typeFilter !== 'all') {
      filtered = filtered.filter(t => t.type.toLowerCase() === this.typeFilter.toLowerCase());
    }

    // Status filter
    if (this.statusFilter !== 'all') {
      filtered = filtered.filter(t => t.status.toLowerCase() === this.statusFilter.toLowerCase());
    }

    this.filteredTransactions.set(filtered);
  }

  onSearchChange(value: string): void {
    this.searchQuery = value;
    this.applyFilters();
  }

  onTypeFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.typeFilter = target.value;
    this.applyFilters();
  }

  onStatusFilterChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.statusFilter = target.value;
    this.applyFilters();
  }

  parseFloat(value: string): number {
    return window.parseFloat(value);
  }

  getReviewAmount(): number {
    return window.parseFloat(this.addFundsAmount) || 0;
  }

  getNewCashBalance(): number {
    return this.availableCash + this.getReviewAmount();
  }

  // Transaction details
  toggleTransactionDetails(id: string): void {
    this.expandedTransactionId.update(current => current === id ? null : id);
  }

  isTransactionExpanded(id: string): boolean {
    return this.expandedTransactionId() === id;
  }

  // Add Funds modal
  openAddFundsModal(): void {
    this.addFundsStep.set('form');
    this.addFundsAmount = '';
    this.addFundsFundingMethod = 'bank';
    this.addFundsError = '';
    this.showAddFundsModal.set(true);
  }

  closeAddFundsModal(): void {
    this.showAddFundsModal.set(false);
    this.addFundsError = '';
  }

  validateAddFundsForm(): boolean {
    this.addFundsError = '';

    if (!this.addFundsAmount.trim()) {
      this.addFundsError = 'Amount is required.';
      return false;
    }

    const amount = parseFloat(this.addFundsAmount);

    if (isNaN(amount) || amount <= 0) {
      this.addFundsError = 'Amount must be greater than $0.00.';
      return false;
    }

    if (amount > 100000) {
      this.addFundsError = 'Amount cannot exceed $100,000.';
      return false;
    }

    return true;
  }

  reviewAddFunds(): void {
    if (this.validateAddFundsForm()) {
      this.addFundsStep.set('review');
    }
  }

  cancelAddFunds(): void {
    this.addFundsStep.set('form');
    this.addFundsError = '';
  }

  confirmAddFunds(): void {
    const amount = parseFloat(this.addFundsAmount);
    const amountCents = Math.round(amount * 100);

    // Update cash balance
    this.availableCashCents += amountCents;

    // Add transaction to history
    const now = new Date();
    const newTransaction: MockTransaction = {
      id: `TRX-2026-${Math.floor(Math.random() * 10000)}`,
      date: now.toISOString().split('T')[0],
      time: now.toLocaleTimeString('en-US', { timeStyle: 'short' }),
      type: 'Deposit',
      description: this.fundingMethods.find(m => m.id === this.addFundsFundingMethod)?.label || 'Bank transfer',
      amount: amount,
      status: 'Completed'
    };

    this.mockTransactions.unshift(newTransaction);
    this.transactions.set([...this.mockTransactions]);
    this.applyFilters();

    // Show success
    this.addFundsStep.set('success');
  }

  finishAddFunds(): void {
    this.closeAddFundsModal();
  }

  navigate(destination: string): void {
    this.router.navigate([`/${destination}`]);
  }
}
