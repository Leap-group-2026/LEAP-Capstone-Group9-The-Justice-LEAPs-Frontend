import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Dashboard } from './pages/dashboard/dashboard';
import { Portfolio } from './pages/portfolio/portfolio';
import { Trade } from './pages/trade/trade';
import { Positions } from './pages/positions/positions';
import { Orders } from './pages/orders/orders';
import { Transactions } from './pages/transactions/transactions';
import { Account } from './pages/account/account';
import { Signup } from './pages/signup/signup';
import { ResetPassword } from './pages/reset-password/reset-password';
import { Admin } from './pages/admin/admin';
import { adminGuard } from './shared/guards/admin.guard';
import { authGuard } from './shared/guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'admin-login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'forgot-password', component: ResetPassword },
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'portfolio', component: Portfolio, canActivate: [authGuard] },
  { path: 'trade', component: Trade, canActivate: [authGuard] },
  { path: 'positions', component: Positions, canActivate: [authGuard] },
  { path: 'orders', component: Orders, canActivate: [authGuard] },
  { path: 'transactions', component: Transactions, canActivate: [authGuard] },
  { path: 'account', component: Account, canActivate: [authGuard] },
  { path: 'admin', component: Admin, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: '/login' },
];
