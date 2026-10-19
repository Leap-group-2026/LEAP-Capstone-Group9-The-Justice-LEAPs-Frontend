import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { SessionActivityService } from './session-activity.service';

describe('SessionActivityService', () => {
  let controller: HttpTestingController;
  const keepAlive = (r: { url: string }) => r.url === `${environment.springUrl}/instruments`;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    controller = TestBed.inject(HttpTestingController);
    localStorage.setItem('token', 'some-token');
    TestBed.inject(SessionActivityService).start();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const input = () => window.dispatchEvent(new Event('keydown'));

  it('sends nothing for input within 5 minutes of the last keep-alive', () => {
    vi.advanceTimersByTime(4 * 60_000);
    input();
    controller.expectNone(keepAlive);
  });

  it('sends one keep-alive on input after 5 minutes, then waits another 5', () => {
    vi.advanceTimersByTime(5 * 60_000 + 1);
    input(); input();
    controller.expectOne(keepAlive).flush([]);
    vi.advanceTimersByTime(60_000);
    input();
    controller.expectNone(keepAlive);
  });

  it('does not count mouse movement as activity', () => {
    vi.advanceTimersByTime(5 * 60_000 + 1);
    window.dispatchEvent(new Event('mousemove'));
    controller.expectNone(keepAlive);
  });

  it.each(['pointerdown', 'keydown', 'scroll'])('counts %s as activity', type => {
    vi.advanceTimersByTime(5 * 60_000 + 1);
    window.dispatchEvent(new Event(type));
    controller.expectOne(keepAlive).flush([]);
  });

  it('sends nothing without input, however long the tab sits', () => {
    vi.advanceTimersByTime(60 * 60_000);
    controller.expectNone(keepAlive);
  });

  it('sends nothing when logged out', () => {
    localStorage.removeItem('token');
    vi.advanceTimersByTime(10 * 60_000);
    input();
    controller.expectNone(keepAlive);
  });
});
