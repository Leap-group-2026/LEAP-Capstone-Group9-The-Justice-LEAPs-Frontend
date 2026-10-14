import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainer } from '../../shared/components/page-container/page-container';

type PositionsState = 'loading' | 'ready' | 'error';

interface PositionRow {
  positionId: number;
  instrumentId: number;
  symbol: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  pnl: number | null;
  pnlPercent: number | null;
}
@Component({
  imports: [CommonModule, PageContainer],
  selector: 'app-positions',
  styleUrl: './positions.scss',
  templateUrl: './positions.html',
})
export class Positions {
  state: PositionsState = 'loading';
  
  positions: PositionRow[] = [];

  accountId: number | null = null;

  errorMessage = ' ';
  
  loadPositions(): void {
    this.state = 'loading';
    this.errorMessage = '';
  }
}