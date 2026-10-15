import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly isLight = signal(this.readStoredTheme());

  constructor() {
    this.applyTheme(this.isLight());
  }

  toggle(): void {
    const next = !this.isLight();
    this.isLight.set(next);
    this.applyTheme(next);
  }

  private applyTheme(isLight: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('light-theme', isLight);
    localStorage.setItem('ribbit-theme', isLight ? 'light' : 'dark');
  }

  private readStoredTheme(): boolean {
    return typeof localStorage !== 'undefined' && localStorage.getItem('ribbit-theme') === 'light';
  }
}
