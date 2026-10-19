import { HttpClient } from '@angular/common/http';
import { Injectable, NgZone, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

const KEEP_ALIVE_EVERY_MS = 5 * 60 * 1000;
const INPUT_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

@Injectable({ providedIn: 'root' })
export class SessionActivityService {
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private lastKeepAlive = Date.now();
  private started = false;

  start(): void {
    if (this.started || typeof window === 'undefined') {
      return;
    }
    this.started = true;
    const onInput = () => this.keepAlive();
    this.zone.runOutsideAngular(() =>
      INPUT_EVENTS.forEach(event => window.addEventListener(event, onInput, { passive: true }))
    );
  }

  private keepAlive(): void {
    const now = Date.now();
    if (now - this.lastKeepAlive < KEEP_ALIVE_EVERY_MS || !readToken()) {
      return;
    }
    this.lastKeepAlive = now;
    this.zone.run(() =>
      this.http
        .get(`${environment.springUrl}/instruments`, { params: { pageNum: 1, pageSize: 1 } })
        .subscribe({ error: () => undefined })
    );
  }
}
