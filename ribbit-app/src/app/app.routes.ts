import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { Portfolio } from './pages/portfolio/portfolio';
import { Trade } from './pages/trade/trade';
import { Positions } from './pages/positions/positions';
import { Orders } from './pages/orders/orders';
import { Transactions } from './pages/transactions/transactions';
import { Account } from './pages/account/account';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'dashboard', component: Dashboard },
  { path: 'portfolio', component: Portfolio },
  { path: 'trade', component: Trade },
  { path: 'positions', component: Positions },
  { path: 'orders', component: Orders },
  { path: 'transactions', component: Transactions },
  { path: 'account', component: Account },
  { path: '**', redirectTo: '/dashboard' },
];
