import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { InstrumentsApiService } from './instruments-api.service';

describe('InstrumentsApiService', () => {
  let service: InstrumentsApiService;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        InstrumentsApiService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(InstrumentsApiService);
    controller = TestBed.inject(HttpTestingController);
  });

  // Reset even when verify() throws, so one failing test can't break the specs after it
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    try {
      controller.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('requests instruments with the default pagination', () => {
    let response: unknown;

    service.getAll().subscribe(value => (response = value));

    const request = controller.expectOne(`${environment.springUrl}/instruments?pageNum=1&pageSize=100`);
    expect(request.request.method).toBe('GET');
    request.flush([]);

    expect(response).toEqual([]);
  });

  it('encodes ticker references and sends the bearer token', () => {
    localStorage.setItem('token', 'test-token');

    service.getByTicker('EUR/USD').subscribe();

    const request = controller.expectOne(`${environment.springUrl}/instruments/EUR/USD`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({});
  });

  it('posts the requested forex currency pair', () => {
    service.getForexPrice('EURUSD').subscribe();

    const request = controller.expectOne(`${environment.springUrl}/instruments/forex/price`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ currencyPair: 'EURUSD' });
    request.flush({});
  });

  it('sends all bar query parameters', () => {
    service.getBarNumbers('AAPL', '1D', '2026-01-01', '2026-01-31').subscribe();

    const request = controller.expectOne(
      `${environment.springUrl}/instruments/bars?symbols=AAPL&timeframe=1D&start=2026-01-01&end=2026-01-31`
    );
    expect(request.request.method).toBe('GET');
    request.flush([10, 20, 30]);
  });

  it('sends all crypto bar query parameters to the crypto bars endpoint', () => {
    service.getCryptoBarNumbers('BTC/USD', '1Day', '2026-01-01', '2026-01-31').subscribe();

    // Checked by value: Angular leaves "/" unencoded in query strings (symbols=BTC/USD), which is valid
    const request = controller.expectOne(req => req.url === `${environment.springUrl}/instruments/crypto-bars`);
    expect(request.request.method).toBe('GET');
    expect(request.request.params.get('symbols')).toBe('BTC/USD');
    expect(request.request.params.get('timeframe')).toBe('1Day');
    expect(request.request.params.get('start')).toBe('2026-01-01');
    expect(request.request.params.get('end')).toBe('2026-01-31');
    request.flush([10, 20, 30]);
  });

  it('normalizes wrapped and unwrapped news responses', () => {
    let wrappedNews: unknown;
    let plainNews: unknown;

    service.getNews().subscribe(value => (wrappedNews = value));
    service.getNews().subscribe(value => (plainNews = value));

    const newsRequests = controller.match(`${environment.springUrl}/instruments/news`);
    expect(newsRequests).toHaveLength(2);
    newsRequests[0].flush({ news: [{ author: 'Ribbit', headline: 'Markets open', url: '/news/1' }] });
    newsRequests[1].flush([{ author: 'Ribbit', headline: 'Markets close', url: '/news/2' }]);

    expect(wrappedNews).toEqual([{ author: 'Ribbit', headline: 'Markets open', url: '/news/1' }]);
    expect(plainNews).toEqual([{ author: 'Ribbit', headline: 'Markets close', url: '/news/2' }]);
  });
});
