import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { readToken } from '../interceptors/auth.interceptor';

export type NewsSentiment = 'all' | 'negative' | 'neutral' | 'positive';

export interface NewsArticle {
  uuid: string;
  title: string;
  description: string | null;
  url: string;
  source: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  sentiment: Exclude<NewsSentiment, 'all'>;
  sentimentScore: number;
  symbols: string[];
}

export interface AccountNewsResponse {
  accountId: number;
  symbols: string[];
  sentiment: NewsSentiment;
  articles: NewsArticle[];
}

export interface MarketNewsArticle {
  author: string;
  headline: string;
  url: string;
}

@Injectable({ providedIn: 'root' })
export class NewsApiService {
  private readonly http = inject(HttpClient);

  getAccountNews(accountId: number, sentiment: NewsSentiment = 'all', limit = 50): Observable<AccountNewsResponse> {
    const params = new HttpParams()
      .set('sentiment', sentiment)
      .set('limit', limit);

    return this.http.get<AccountNewsResponse>(
      `${environment.springUrl}/news/account/${accountId}`,
      { headers: this.createAuthHeaders(), params }
    );
  }

  getAllNews(): Observable<MarketNewsArticle[]> {
    return this.http.get<MarketNewsArticle[]>(
      `${environment.springUrl}/instruments/news`,
      { headers: this.createAuthHeaders() }
    );
  }

  private createAuthHeaders(): HttpHeaders {
    const token = readToken();
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }
}