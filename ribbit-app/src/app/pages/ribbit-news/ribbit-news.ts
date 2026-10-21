import { CommonModule } from '@angular/common';
import { Component, DestroyRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, finalize, forkJoin, of } from 'rxjs';

import { describeHttpError } from '../../shared/http-error';
import { AccountContextService } from '../../shared/services/account-context.service';
import { MarketNewsArticle, NewsApiService, NewsArticle, NewsSentiment } from '../../shared/services/news-api.service';

@Component({
  selector: 'app-ribbit-news',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ribbit-news.html',
  styleUrls: ['./ribbit-news.scss']
})
export class RibbitNews {
  private readonly accountContext = inject(AccountContextService);
  private readonly newsApi = inject(NewsApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly articles = signal<NewsArticle[]>([]);
  readonly allArticles = signal<NewsArticle[]>([]);
  readonly symbols = signal<string[]>([]);
  readonly selectedSentiment = signal<NewsSentiment>('all');
  readonly selectedSymbol = signal('all');

  readonly filteredArticles = computed(() => {
    return this.filterArticles(this.articles());
  });

  constructor() {
    afterNextRender(() => this.loadNews());
  }

  selectSentiment(sentiment: NewsSentiment): void {
    if (this.selectedSentiment() === sentiment) return;
    this.selectedSentiment.set(sentiment);
    this.loadNews();
  }

  selectSymbol(event: Event): void {
    this.selectedSymbol.set((event.target as HTMLSelectElement).value);
  }

  loadNews(): void {
    const accountId = this.accountContext.getKnownSelectedAccount()?.accountId;
    if (!accountId) {
      this.loading.set(false);
      this.error.set('Select an active account to view personalized news.');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      personalized: this.newsApi.getAccountNews(accountId, this.selectedSentiment()),
      all: this.newsApi.getAllNews().pipe(catchError(() => of([] as MarketNewsArticle[])))
    })
      .pipe(
        catchError(error => {
          this.error.set(describeHttpError(error, 'Unable to load personalized news.'));
          this.articles.set([]);
          this.allArticles.set([]);
          return EMPTY;
        }),
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ personalized, all }) => {
        this.symbols.set(personalized.symbols);
        this.articles.set(personalized.articles);
        this.allArticles.set(all.map((article, index) => this.toNewsArticle(article, index)));
        if (this.selectedSymbol() !== 'all' && !personalized.symbols.includes(this.selectedSymbol())) {
          this.selectedSymbol.set('all');
        }
      });
  }

  private filterArticles(articles: NewsArticle[]): NewsArticle[] {
    const symbol = this.selectedSymbol();
    const sentiment = this.selectedSentiment();
    return articles.filter(article =>
      (symbol === 'all' || this.matchesSymbol(article, symbol)) &&
      (sentiment === 'all' || article.sentiment === sentiment)
    );
  }

  private matchesSymbol(article: NewsArticle, symbol: string): boolean {
    if (article.symbols.includes(symbol)) return true;
    const searchableText = `${article.title} ${article.source ?? ''} ${article.url}`.toUpperCase();
    return new RegExp(`(^|[^A-Z0-9])${this.escapeRegExp(symbol)}([^A-Z0-9]|$)`).test(searchableText);
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private toNewsArticle(article: MarketNewsArticle, index: number): NewsArticle {
    return {
      uuid: `market-${index}-${article.url}`,
      title: article.headline,
      description: null,
      url: article.url,
      source: article.author || 'Market source',
      imageUrl: null,
      publishedAt: null,
      sentiment: 'neutral',
      sentimentScore: 0,
      symbols: []
    };
  }

  formatDate(value: string | null): string {
    if (!value) return 'Date unavailable';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date(value));
  }

  sentimentLabel(sentiment: NewsSentiment): string {
    return sentiment === 'all' ? 'All news' : `${sentiment[0].toUpperCase()}${sentiment.slice(1)}`;
  }
}