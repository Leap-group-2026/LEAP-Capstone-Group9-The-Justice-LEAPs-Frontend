import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  imports: [CommonModule],
  selector: 'app-page-container',
  styleUrl: './page-container.scss',
  templateUrl: './page-container.html',
})
export class PageContainer {
  @Input() title: string = '';
  @Input() description: string = '';
}
