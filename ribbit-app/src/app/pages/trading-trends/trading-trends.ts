import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { AdminApiService, TopBoughtStock } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-trading-trends',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './trading-trends.html',
  styleUrls: ['./trading-trends.scss']
})
export class TradingTrends implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly isLoading = signal(false);
  readonly topBoughtStocks = signal<TopBoughtStock[]>([]);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadTradingTrends();
    }
  }

  loadTradingTrends(): void {
    this.isLoading.set(true);
    this.adminApi.getTopBoughtStocks().pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: stocks => this.topBoughtStocks.set(stocks),
      error: () => this.topBoughtStocks.set([])
    });
  }

  get maximumVolume(): number {
    return Math.max(...this.topBoughtStocks().map(stock => stock.totalVolume), 1);
  }

  volumeBarX(index: number): number {
    const chartWidth = 720;
    const barSlot = chartWidth / Math.max(this.topBoughtStocks().length, 1);
    return index * barSlot + barSlot * 0.2;
  }

  volumeBarWidth(): number {
    const chartWidth = 720;
    const barSlot = chartWidth / Math.max(this.topBoughtStocks().length, 1);
    return barSlot * 0.6;
  }

  volumeBarHeight(volume: number): number {
    return (volume / this.maximumVolume) * 190;
  }
}