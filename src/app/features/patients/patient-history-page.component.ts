import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-patient-history-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, MatCardModule, MatButtonModule, MatIconModule],
  styles: [`
    .patient-page { height: calc(100vh - 96px); padding: 14px; display: grid; grid-template-columns: 330px 1fr; gap: 14px; color: var(--text); overflow: hidden; }
    mat-card { background: var(--panel); border: 1px solid var(--border); border-radius: 22px; box-shadow: var(--shadow); overflow: hidden; }
    .left-card, .main-card { min-height: 0; display: flex; flex-direction: column; }
    .panel-head { padding: 14px 14px 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--border); }
    .title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    h2, h3, h4 { margin: 0; color: var(--text); }
    h2 { font-size: 18px; letter-spacing: -0.01em; }
    h3 { font-size: 15px; }
    h4 { font-size: 13px; margin-bottom: 8px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }
    small, .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 9px; font-size: 12px; color: var(--accent); background: var(--accent-soft); white-space: nowrap; }
    .search { margin: 12px; display: flex; align-items: center; gap: 8px; background: var(--input); border: 1px solid var(--border); border-radius: 16px; padding: 0 11px; }
    .search input { width: 100%; height: 40px; border: 0; outline: 0; background: transparent; color: var(--text); }
    .patient-list { padding: 0 10px 12px; overflow: auto; display: grid; gap: 8px; }
    .patient-row { border: 1px solid var(--border); background: var(--row); color: var(--text); border-radius: 16px; padding: 10px; text-align: left; cursor: pointer; display: grid; gap: 4px; }
    .patient-row:hover, .patient-row.active { border-color: var(--accent); background: var(--accent-soft); }
    .patient-row b { font-size: 13px; }
    .patient-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: var(--muted); font-size: 12px; }
    .empty { margin: 16px; padding: 18px; border: 1px dashed var(--border); border-radius: 18px; color: var(--muted); text-align: center; }
    .tabs { display: flex; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); overflow-x: auto; }
    .tab { border: 1px solid var(--border); background: var(--row); color: var(--muted); border-radius: 999px; padding: 8px 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .tab.active { color: white; border-color: transparent; background: var(--accent-gradient); box-shadow: var(--glow); }
    .content { padding: 14px; overflow: auto; min-height: 0; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .stat { background: var(--row); border: 1px solid var(--border); border-radius: 18px; padding: 12px; }
    .stat strong { display: block; font-size: 18px; color: var(--text); }
    .form-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 10px; }
    label { display: grid; gap: 5px; color: var(--muted); font-size: 12px; font-weight: 700; }
    input, select, textarea { width: 100%; border: 1px solid var(--border); background: var(--input); color: var(--text); border-radius: 14px; padding: 10px 11px; outline: none; font: inherit; }
    textarea { min-height: 74px; resize: vertical; }
    .span-2 { grid-column: span 2; }
    .span-4 { grid-column: 1 / -1; }
    .actions { margin-top: 12px; display: flex; justify-content: flex-end; gap: 10px; flex-wrap: wrap; }
    .btn { border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; font-weight: 800; cursor: pointer; background: var(--row); color: var(--text); }
    .btn.primary { border-color: transparent; background: var(--accent-gradient); color: white; box-shadow: var(--glow); }
    .btn.warn { color: var(--danger); }
    .history-table { width: 100%; border-collapse: separate; border-spacing: 0 8px; }
    .history-table th { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; padding: 0 10px; }
    .history-table td { background: var(--row); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); padding: 10px; font-size: 13px; }
    .history-table td:first-child { border-left: 1px solid var(--border); border-radius: 14px 0 0 14px; }
    .history-table td:last-child { border-right: 1px solid var(--border); border-radius: 0 14px 14px 0; }
    .scope-card { display: grid; gap: 12px; background: var(--row); border: 1px solid var(--border); border-radius: 18px; padding: 14px; }
    .check-row { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .check-row label { display: inline-flex; align-items: center; gap: 8px; color: var(--text); }
    .note { background: var(--accent-soft); color: var(--text); border: 1px solid var(--border); border-radius: 16px; padding: 10px 12px; font-size: 13px; }
    .snack { position: fixed; right: 24px; bottom: 22px; background: var(--panel); border: 1px solid var(--border); color: var(--text); box-shadow: var(--shadow); border-radius: 16px; padding: 12px 16px; z-index: 50; }
    @media (max-width: 1100px) { .patient-page { grid-template-columns: 1fr; height: auto; overflow: auto; } .left-card { max-height: 360px; } .summary-grid, .form-grid { grid-template-columns: repeat(2, minmax(140px, 1fr)); } .span-4 { grid-column: 1 / -1; } }
  `],
  template: `
    <section class="patient-page">
      <mat-card class="left-card">
        <div class="panel-head">
          <div class="title"><h2>Patient</h2><small>Search, edit and view history</small></div>
          <span class="pill">{{ patients().length }} found</span>
        </div>
        <div class="search">
          <span>⌕</span>
          <input [(ngModel)]="patientQuery" (input)="loadPatients()" placeholder="Search name, mobile, patient no">
        </div>
        <div class="patient-list">
          <button class="patient-row" type="button" *ngFor="let p of patients()" [class.active]="selectedId() === p.id" (click)="loadHistory(p.id)">
            <b>{{ displayName(p) }}</b>
            <div class="patient-meta"><span>{{ p.patient_no }}</span><span>{{ p.mobile || 'No mobile' }}</span></div>
            <small>{{ p.gender || '-' }} · {{ p.age || ageDisplay(p) || '-' }}</small>
          </button>
          <div class="empty" *ngIf="!patients().length">No patients found</div>
        </div>
      </mat-card>

      <mat-card class="main-card" *ngIf="history() as h; else noPatient">
        <div class="panel-head">
          <div class="title">
            <h2>{{ displayName(h.patient) }}</h2>
            <small>{{ h.patient?.patient_no }} · {{ h.patient?.mobile || 'No mobile' }} · Registered {{ h.patient?.created_at | date:'dd-MMM-yyyy' }}</small>
          </div>
          <span class="pill">{{ h.patient?.gender || '-' }} · {{ h.patient?.age || ageDisplay(h.patient) || '-' }}</span>
        </div>

        <div class="tabs">
          <button class="tab" [class.active]="tab()==='details'" (click)="tab.set('details')">Details</button>
          <button class="tab" [class.active]="tab()==='bills'" (click)="tab.set('bills')">Bills {{ h.bills?.length || 0 }}</button>
          <button class="tab" [class.active]="tab()==='reports'" (click)="tab.set('reports')">Reports {{ reportCount(h) }}</button>
          <button class="tab" [class.active]="tab()==='update'" (click)="tab.set('update')">Update Scope</button>
        </div>

        <div class="content" *ngIf="tab()==='details'">
          <div class="summary-grid">
            <div class="stat"><small>Total Bills</small><strong>{{ h.bills?.length || 0 }}</strong></div>
            <div class="stat"><small>Total Amount</small><strong>₹{{ totalAmount(h.bills) }}</strong></div>
            <div class="stat"><small>Paid</small><strong>₹{{ paidAmount(h.bills) }}</strong></div>
            <div class="stat"><small>Due</small><strong>₹{{ dueAmount(h.bills) }}</strong></div>
          </div>

          <h4>Edit patient details</h4>
          <div class="form-grid">
            <label>Patient No<input [(ngModel)]="edit.patient_no"></label>
            <label>Title<input [(ngModel)]="edit.title" placeholder="Mr./Mrs./Baby"></label>
            <label class="span-2">Name<input [(ngModel)]="edit.name" placeholder="Patient name"></label>
            <label>DOB<input type="date" [(ngModel)]="edit.dob"></label>
            <label>Age Value<input type="number" [(ngModel)]="edit.age_value"></label>
            <label>Age Unit<select [(ngModel)]="edit.age_unit"><option>YEARS</option><option>MONTHS</option><option>WEEKS</option><option>DAYS</option></select></label>
            <label>Gender<select [(ngModel)]="edit.gender"><option value="">Select</option><option>Male</option><option>Female</option><option>Other</option></select></label>
            <label>Relation Type<input [(ngModel)]="edit.relation_type" placeholder="Father of"></label>
            <label class="span-2">Guardian Name<input [(ngModel)]="edit.guardian_name"></label>
            <label>Guardian Mobile<input [(ngModel)]="edit.guardian_mobile"></label>
            <label>Mobile<input [(ngModel)]="edit.mobile"></label>
            <label>Email<input [(ngModel)]="edit.email"></label>
            <label class="span-2">Address<input [(ngModel)]="edit.address"></label>
            <label class="span-4">Clinical History<textarea [(ngModel)]="edit.history"></textarea></label>
          </div>
          <div class="actions">
            <button class="btn" type="button" (click)="resetEdit()">Reset</button>
            <button class="btn primary" type="button" (click)="savePatient()">Save Patient</button>
          </div>
        </div>

        <div class="content" *ngIf="tab()==='bills'">
          <h4>Bill history</h4>
          <table class="history-table">
            <tr><th>Bill No</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Due</th><th>Status</th></tr>
            <tr *ngFor="let b of h.bills"><td><b>{{ b.bill_no }}</b></td><td>{{ b.bill_date | date:'dd-MMM-yyyy hh:mm a' }}</td><td>{{ b.item_count || 0 }}</td><td>₹{{ b.total || 0 }}</td><td>₹{{ b.paid || b.receipt_total || 0 }}</td><td>₹{{ b.due || 0 }}</td><td>{{ b.status || 'BILLED' }}</td></tr>
          </table>
          <div class="empty" *ngIf="!h.bills?.length">No bill history</div>
        </div>

        <div class="content" *ngIf="tab()==='reports'">
          <h4>Quick reports</h4>
          <table class="history-table">
            <tr><th>Report No</th><th>Bill</th><th>Date</th><th>Items</th><th>Status</th></tr>
            <tr *ngFor="let r of h.quickReports"><td><b>{{ r.report_no || ('QR-' + r.id) }}</b></td><td>{{ r.bill_no }}</td><td>{{ r.created_at | date:'dd-MMM-yyyy hh:mm a' }}</td><td>{{ r.item_count || 0 }}</td><td>{{ r.status }}</td></tr>
          </table>
          <div class="empty" *ngIf="!h.quickReports?.length">No quick report history</div>

          <h4 style="margin-top:16px">Lab workflow reports</h4>
          <table class="history-table">
            <tr><th>Report ID</th><th>Bill</th><th>Date</th><th>Items</th><th>Status</th></tr>
            <tr *ngFor="let r of h.reports"><td><b>#{{ r.id }}</b></td><td>{{ r.bill_no }}</td><td>{{ r.updated_at || r.created_at | date:'dd-MMM-yyyy hh:mm a' }}</td><td>{{ r.item_count || 0 }}</td><td>{{ r.status }}</td></tr>
          </table>
          <div class="empty" *ngIf="!h.reports?.length">No lab workflow report history</div>
        </div>

        <div class="content" *ngIf="tab()==='update'">
          <div class="scope-card">
            <h3>Controlled patient update</h3>
            <div class="note">
              Save Patient updates the patient master. Because this app currently prints bills/reports by joining patient master data, the latest patient details will be used when old bills/reports are opened or printed again. Use the controls below to record the intended correction scope.
            </div>
            <div class="form-grid">
              <label>Apply from date<input type="date" [(ngModel)]="applyFrom"></label>
              <label>Update mode<select [(ngModel)]="updateMode"><option value="future">Future only</option><option value="pending">Pending only</option><option value="fromDate">From selected date</option><option value="all">All history</option></select></label>
              <label class="span-2">Reason<input [(ngModel)]="updateReason" placeholder="Reason for correction"></label>
            </div>
            <div class="check-row">
              <label><input type="checkbox" [(ngModel)]="updateBilling"> Billing</label>
              <label><input type="checkbox" [(ngModel)]="updateReporting"> Reporting</label>
            </div>
            <div class="actions"><button class="btn primary" type="button" (click)="savePatient()">Save with this scope note</button></div>
          </div>
        </div>
      </mat-card>

      <ng-template #noPatient>
        <mat-card class="main-card"><div class="empty">Select a patient to edit details and view bill/report history.</div></mat-card>
      </ng-template>
      <div class="snack" *ngIf="snack()">{{ snack() }}</div>
    </section>
  `
})
export class PatientHistoryPageComponent implements OnInit {
  patients = signal<any[]>([]);
  history = signal<any>(null);
  selectedId = signal<number | null>(null);
  tab = signal<'details' | 'bills' | 'reports' | 'update'>('details');
  patientQuery = '';
  edit: any = {};
  snack = signal('');
  applyFrom = new Date().toISOString().slice(0, 10);
  updateMode: 'future' | 'pending' | 'fromDate' | 'all' = 'future';
  updateBilling = true;
  updateReporting = true;
  updateReason = '';

  async ngOnInit() { await this.loadPatients(); }

  async loadPatients() {
    this.patients.set(await window.limsApi.listPatients(this.patientQuery));
  }

  async loadHistory(id: number) {
    this.selectedId.set(id);
    const data = await window.limsApi.patientHistory(id);
    this.history.set(data);
    this.edit = { ...(data?.patient || {}) };
    this.tab.set('details');
  }

  resetEdit() {
    this.edit = { ...(this.history()?.patient || {}) };
  }

  async savePatient() {
    if (!String(this.edit?.name || '').trim()) { this.notify('Patient name is required'); return; }
    const payload = {
      ...this.edit,
      update_scope: this.updateMode,
      apply_from: this.applyFrom,
      update_billing: this.updateBilling,
      update_reporting: this.updateReporting,
      update_reason: this.updateReason
    };
    const id = await window.limsApi.savePatient(payload);
    this.notify('Patient details updated');
    await this.loadPatients();
    await this.loadHistory(Number(id || this.selectedId()));
  }

  displayName(p: any) { return [p?.title, p?.name || p?.patient_name].filter(Boolean).join(' ') || '-'; }
  ageDisplay(p: any) { return p?.age_value ? `${p.age_value} ${p.age_unit || 'YEARS'}` : ''; }
  totalAmount(rows: any[] = []) { return this.money(rows.reduce((sum, x) => sum + (+x.total || 0), 0)); }
  paidAmount(rows: any[] = []) { return this.money(rows.reduce((sum, x) => sum + (+x.paid || +x.receipt_total || 0), 0)); }
  dueAmount(rows: any[] = []) { return this.money(rows.reduce((sum, x) => sum + (+x.due || 0), 0)); }
  reportCount(h: any) { return (h?.reports?.length || 0) + (h?.quickReports?.length || 0); }
  money(value: number) { return Math.round((+value || 0) * 100) / 100; }

  private notify(message: string) {
    this.snack.set(message);
    setTimeout(() => this.snack.set(''), 2200);
  }
}
