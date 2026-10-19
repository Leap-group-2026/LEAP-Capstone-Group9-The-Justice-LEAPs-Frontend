import { HttpBackend, HttpClient } from '@angular/common/http';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  readRefreshToken,
  readToken,
  refreshSession,
  tokenExpiresAt
} from '../../interceptors/auth.interceptor';
import { AuthService } from '../../services/auth.service';

const TICK_MS = 1000;

// Time left on the access token, with a button to refresh it. Refreshing goes through
// refreshSession(), the only allowed caller of /auth/refresh (single-flight, cross-tab lock).
// A manual refresh counts as activity at the server, which is fine: the user clicked it.
@Component({
  selector: 'app-session-timer',
  template: `
    @if (expiresAt() !== null) {
      <div class="session-timer" [class.expired]="remainingMs() === 0" [class.warn]="warn()">
        <div class="readout">
          <span class="label">{{ status() ?? 'SESSION' }}</span>
          <span class="time" aria-live="off">{{ remaining() }}</span>
        </div>
        @if (canRefresh()) {
          <button
            type="button"
            class="refresh"
            [class.spinning]="refreshing()"
            [disabled]="refreshing()"
            (click)="refresh()"
            aria-label="Refresh session"
            title="Refresh session"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.3-5.7 M20 4v5h-5" />
            </svg>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: flex; margin-left: auto; }

    .session-timer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 20px;
      border-left: 1px solid var(--border);
    }

    .readout { display: grid; gap: 4px; }

    .label {
      color: var(--subtle);
      font-family: "IBM Plex Mono", monospace;
      font-size: 8px;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .time {
      min-width: 44px;
      color: var(--text);
      font-family: "IBM Plex Mono", monospace;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }

    .warn .time { color: var(--accent); }
    .expired .time { color: var(--negative); }

    .refresh {
      width: 26px;
      height: 26px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: transparent;
      color: var(--muted);
      cursor: pointer;
    }

    .refresh:hover:not(:disabled),
    .refresh:focus-visible {
      color: var(--accent);
      border-color: var(--accent);
      outline: none;
    }

    .refresh:disabled { cursor: progress; }

    .refresh svg {
      width: 13px;
      height: 13px;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .spinning svg { animation: spin 0.8s linear infinite; }

    @keyframes spin { to { transform: rotate(360deg); } }

    @media (prefers-reduced-motion: reduce) {
      .spinning svg { animation: none; }
    }

    @media (max-width: 760px) {
      .session-timer { padding: 0 12px; }
      .label { display: none; }
    }
  `
})
export class SessionTimer {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  // Same client the guard uses: the refresh call must not pass through the interceptor.
  private readonly refreshHttp = new HttpClient(inject(HttpBackend));

  private readonly now = signal(Date.now());
  // Re-read every tick, so a refresh by the interceptor or another tab shows up at once.
  private readonly token = signal<string | null>(null);

  readonly refreshing = signal(false);
  readonly status = signal<string | null>(null);

  readonly expiresAt = computed(() => {
    const token = this.token();
    return token ? tokenExpiresAt(token) : null;
  });

  readonly remainingMs = computed(() => {
    const expiresAt = this.expiresAt();
    return expiresAt === null ? 0 : Math.max(0, expiresAt - this.now());
  });

  // Under 5 minutes: the next request or click will refresh anyway, but the user can see it coming.
  readonly warn = computed(() => this.remainingMs() > 0 && this.remainingMs() < 5 * 60 * 1000);

  // "29:58", "4:07", or "Expired"
  readonly remaining = computed(() => {
    const ms = this.remainingMs();
    if (ms === 0) {
      return 'Expired';
    }
    const seconds = Math.ceil(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  readonly canRefresh = signal(false);

  constructor() {
    // Browser only: the app is prerendered, and there is no token or timer on the server.
    afterNextRender(() => {
      this.tick();
      const timer = setInterval(() => this.tick(), TICK_MS);
      this.destroyRef.onDestroy(() => clearInterval(timer));
    });
  }

  refresh(): void {
    if (this.refreshing()) {
      return;
    }
    this.refreshing.set(true);
    this.status.set('REFRESHING');

    refreshSession(this.refreshHttp).subscribe({
      next: newToken => {
        this.refreshing.set(false);
        if (newToken) {
          this.status.set(null);
          this.tick();
          return;
        }
        // The auth service refused the refresh token: the session is over.
        this.status.set(null);
        this.authService.clearSession();
        void this.router.navigate(['/login']);
      },
      error: () => {
        // NestJS or Spring unreachable: nothing was rotated, so the session is kept.
        this.refreshing.set(false);
        this.status.set("CAN'T REACH SERVER");
      }
    });
  }

  private tick(): void {
    this.now.set(Date.now());
    this.token.set(readToken());
    this.canRefresh.set(readRefreshToken() !== null);
  }
}
