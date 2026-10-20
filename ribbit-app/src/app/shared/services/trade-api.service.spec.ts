import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { InstrumentsApiService, InstrumentListItemApiResponse } from './instruments-api.service';
import { CreateOrderResponse, OrdersApiService } from './orders-api.service';

describe('trade API services', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('InstrumentsApiService.getAll', () => {
    it('requests the requested page and size from /instruments', () => {
      const page: InstrumentListItemApiResponse[] = [
        {
          instrument_id: 1,
          ticker: 'AAPL',
          asset_type: 'STOCK',
          asset_name: 'Apple Inc.',
          currency: 'USD',
          price: 201.5,
          quote_time: '2026-10-14T15:59:00Z'
        }
      ];
      let result: InstrumentListItemApiResponse[] | undefined;
      TestBed.inject(InstrumentsApiService).getAll(2, 50).subscribe(r => (result = r));

      const req = http.expectOne(r => r.url === `${environment.springUrl}/instruments`);
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('pageNum')).toBe('2');
      expect(req.request.params.get('pageSize')).toBe('50');
      req.flush(page);

      expect(result).toEqual(page);
    });
  });

  describe('OrdersApiService.placeOrder', () => {
    it('POSTs the order body to /orders and returns the accepted order id', () => {
      const response: CreateOrderResponse = { order_id: 77, created_at: '2026-10-14T15:30:00' };
      let result: CreateOrderResponse | undefined;
      TestBed.inject(OrdersApiService)
        .placeOrder({ side: 'BUY', accountId: 42, instrumentId: 3, quantity: 5 })
        .subscribe(r => (result = r));

      const req = http.expectOne(`${environment.springUrl}/orders`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ side: 'BUY', accountId: 42, instrumentId: 3, quantity: 5 });
      req.flush(response);

      expect(result).toEqual(response);
    });
  });
});
