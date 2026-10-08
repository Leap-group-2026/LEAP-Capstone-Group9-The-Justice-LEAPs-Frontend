import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [CommonModule, RouterModule],
  selector: 'app-header',
  styleUrl: './header.scss',
  templateUrl: './header.html',
})
export class Header {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  userMenuOpen = false;

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
