import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [CommonModule, MatCardModule],
  template: `
    <section class="grid4 page-section dashboard-page">
      <mat-card><small>Today Bills</small><b>{{dashboard?.billsToday?.c || 0}}</b><span>₹ {{dashboard?.billsToday?.total || 0}}</span></mat-card>
      <mat-card><small>Today Paid</small><b>₹ {{dashboard?.billsToday?.paid || 0}}</b><span>Due ₹ {{dashboard?.billsToday?.due || 0}}</span></mat-card>
      <mat-card><small>Patients</small><b>{{dashboard?.patients || 0}}</b><span>Registered records</span></mat-card>
      <mat-card><small>Pending Reports</small><b>{{dashboard?.pendingReports || 0}}</b><span>Draft / typed</span></mat-card>
      <mat-card class="wide clean-dashboard-card">
        <h3>Welcome</h3>
        <p class="muted">Use Billing & Statements for bill list, statement filters, print, edit, cancel, delete and refund workflows.</p>
      </mat-card>
    </section>
  `
})
export class DashboardPageComponent {
  @Input() dashboard: any = null;
}
