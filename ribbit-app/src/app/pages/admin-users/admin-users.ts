import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { AdminApiService, AdminUserSummary } from '../../shared/services/admin-api.service';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-users.html',
  styleUrls: ['./admin-users.scss']
})
export class AdminUsers implements OnInit {
  private readonly adminApi = inject(AdminApiService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly users = signal<AdminUserSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly filter = signal('');

  // Matches name, email or user ID
  readonly filteredUsers = computed(() => {
    const query = this.filter().trim().toLowerCase();
    if (!query) return this.users();
    return this.users().filter(user =>
      user.name.toLowerCase().includes(query) ||
      user.email.toLowerCase().includes(query) ||
      String(user.userId) === query.replace(/^#/, '')
    );
  });

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set('');
    this.adminApi.getUsers()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: users => this.users.set(users),
        error: response => this.error.set(
          response.status === 403 ? 'You do not have permission to view users.' : 'Unable to load users.'
        )
      });
  }

  // "1990-01-01" -> "Jan 1, 1990", read from the string so no time zone can move it
  formatDate(value: string): string {
    const [year, month, day] = (value ?? '').split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day)));
  }
}
