import { Component } from '@angular/core';

@Component({
  selector: 'app-reporter',
  standalone: true,
  templateUrl: './reporter.html',
  styleUrls: ['./reporter.scss']
})
export class Reporter {
  activeSection = 'analytics';

  selectSection(section: string): void {
    this.activeSection = section;
  }
}