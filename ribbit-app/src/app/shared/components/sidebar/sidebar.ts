import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  badge?: number;
}

@Component({
  imports: [CommonModule, RouterModule],
  selector: 'app-sidebar',
  styleUrl: './sidebar.scss',
  templateUrl: './sidebar.html',
})
export class Sidebar {
  sidebarOpen = true;

  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: '📊' },
    { label: 'Positions', route: '/positions', icon: '📈', badge: 5 },
    { label: 'Orders', route: '/orders', icon: '📋', badge: 2 },
    { label: 'Account', route: '/account', icon: '👤' },
  ];

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
  }
}
