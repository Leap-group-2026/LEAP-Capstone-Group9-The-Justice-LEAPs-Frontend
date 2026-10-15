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
import { Admin } from './pages/admin/admin';
import { adminGuard } from './shared/guards/admin.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'admin-login', component: Login },
  { path: 'signup', component: Signup },
  { path: 'dashboard', component: Dashboard },
  { path: 'portfolio', component: Portfolio },
  { path: 'trade', component: Trade },
  { path: 'positions', component: Positions },
  { path: 'orders', component: Orders },
  { path: 'transactions', component: Transactions },
  { path: 'account', component: Account },
  { path: 'admin', component: Admin, canActivate: [adminGuard] },
  { path: '**', redirectTo: '/dashboard' },
];
