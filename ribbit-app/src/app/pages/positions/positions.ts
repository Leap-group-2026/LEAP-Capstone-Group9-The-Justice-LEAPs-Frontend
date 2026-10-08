import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageContainer } from '../../shared/components/page-container/page-container';

@Component({
  imports: [CommonModule, PageContainer],
  selector: 'app-positions',
  styleUrl: './positions.scss',
  templateUrl: './positions.html',
})
export class Positions {}
