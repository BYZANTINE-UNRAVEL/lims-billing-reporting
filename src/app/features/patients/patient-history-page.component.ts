import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

export type PatientQuickReportNav = {
  billNo: string;
  billId?: number;
  reportNo?: string;
  status?: string;
  focusDate?: string;
};

@Component({
  selector: 'app-patient-history-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  styles: [`
    :host{display:block;min-width:0}
    .masters-shell{padding:4px 20px 18px;color:var(--text);--accent:#3b82f6;--accent-soft:color-mix(in srgb,var(--accent) 10%,transparent)}
    .master-panel{border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:var(--shadow);padding:14px 16px 16px}
    .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .panel-heading-left{display:flex;align-items:center;gap:10px;min-width:0}
    .panel-icon{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-weight:950}
    .panel-heading h2{margin:0;font-size:16px;line-height:1.15;font-weight:950;letter-spacing:-.02em}
    .panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:color-mix(in srgb,var(--accent) 76%,var(--text));font-size:12px;font-weight:850;white-space:nowrap}
    .test-list-toolbar{display:grid;grid-template-columns:1.35fr .55fr auto;gap:10px;align-items:end;margin-bottom:10px}
    .test-list-search,.test-list-filter{display:flex;flex-direction:column;gap:6px}
    .test-list-search span,.test-list-filter span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .test-list-search input,.test-list-filter select{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}
    .test-list-search input:focus,.test-list-filter select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .test-list-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}
    .masters-fetch-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--accent-soft) 70%,var(--panel))}
    .masters-fetch-banner b{font-size:13px;font-weight:900}.masters-fetch-banner small{color:var(--muted);font-size:11px;font-weight:750}
    .masters-fetch-spinner{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--accent) 30%,transparent);border-top-color:var(--accent);animation:spin .7s linear infinite;flex:0 0 auto}
    @keyframes spin{to{transform:rotate(360deg)}}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:color-mix(in srgb,var(--row) 52%,transparent)}
    .table-card.is-loading{opacity:.72}
    .masters-table{width:100%;border-collapse:collapse}
    .masters-table th{height:34px;text-align:left;padding:0 12px;color:var(--text);font-size:12.5px;font-weight:900;background:color-mix(in srgb,var(--panel) 50%,transparent);border-bottom:1px solid var(--border)}
    .masters-table td{height:36px;padding:0 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text);vertical-align:middle}
    .masters-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
    .entity-name{font-weight:900}
    .empty-cell{text-align:center;color:var(--muted);font-weight:800;padding:18px 12px!important;height:auto!important}
    .row-actions{display:flex;align-items:center;gap:7px}
    .edit-btn,.action-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:color-mix(in srgb,var(--row) 74%,transparent);cursor:pointer}
    .action-btn.primary,.btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.20)}
    .action-btn.ghost:hover,.edit-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
    .table-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;color:var(--muted);font-size:12px;font-weight:750;border-top:1px solid var(--border)}
    .table-footer b{color:var(--text)}
    .masters-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:8px 12px 12px;color:var(--muted);font-size:12px;font-weight:800}
    .masters-pager label{display:inline-flex;align-items:center;gap:6px}
    .masters-pager select{width:78px;height:32px;padding:0 8px;font-weight:850;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text)}
    .masters-pager button{width:32px;height:32px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);font-weight:950;cursor:pointer}
    .masters-pager button:disabled{opacity:.45;cursor:not-allowed}
    .masters-pager b{min-width:64px;text-align:center;color:var(--text)}

    .detail-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--card,var(--panel)) 86%,transparent)}
    .detail-topbar .title{display:flex;flex-direction:column;gap:2px;min-width:0}
    .detail-topbar strong{font-size:14px;color:var(--text)}
    .detail-topbar span{font-size:12px;color:var(--muted);font-weight:700}
    .tabs{display:flex;gap:8px;padding:0 0 10px;overflow-x:auto}
    .tab{border:1px solid var(--border);background:var(--row);color:var(--muted);border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer;white-space:nowrap;font-size:12px}
    .tab.active{color:#fff;border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);box-shadow:0 8px 16px rgba(37,99,235,.18)}
    .content{padding:4px 2px 8px;min-height:0}
    .summary-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin-bottom:14px}
    .stat{background:var(--row);border:1px solid var(--border);border-radius:14px;padding:12px}
    .stat strong{display:block;font-size:18px;color:var(--text)}
    .stat small{color:var(--muted);font-weight:750}
    h4{margin:0 0 8px;font-size:12px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .form-grid{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px}
    label{display:grid;gap:5px;color:var(--muted);font-size:12px;font-weight:700}
    input,select,textarea{width:100%;border:1px solid var(--border);background:var(--input);color:var(--text);border-radius:12px;padding:10px 11px;outline:none;font:inherit}
    textarea{min-height:74px;resize:vertical}
    .span-2{grid-column:span 2}.span-4{grid-column:1/-1}
    .check-inline{display:inline-flex!important;align-items:center;gap:8px;grid-auto-flow:column;color:var(--text)}
    .check-inline input{width:auto;height:auto;padding:0}
    .age-split-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .age-split-row>span{display:grid;gap:4px;min-width:0}
    .age-split-row small{color:var(--muted);font-size:10px;font-weight:800}
    .age-split-row input{text-align:center;padding:10px 8px}
    .age-split-row.years-only{grid-template-columns:minmax(0,1fr) auto;align-items:center}
    .age-split-row.years-only em{font-style:normal;font-weight:800;color:var(--muted);padding:0 8px}
    .actions{margin-top:12px;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
    .btn{border:1px solid var(--border);border-radius:12px;padding:10px 14px;font-weight:800;cursor:pointer;background:var(--row);color:var(--text)}
    .history-table{width:100%;border-collapse:separate;border-spacing:0 8px}
    .history-table th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:0 10px}
    .history-table td{background:var(--row);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:10px;font-size:13px}
    .history-table td:first-child{border-left:1px solid var(--border);border-radius:14px 0 0 14px}
    .history-table td:last-child{border-right:1px solid var(--border);border-radius:0 14px 14px 0}
    .nav-link{border:0;background:transparent;padding:0;margin:0;color:var(--accent);font:inherit;font-weight:800;cursor:pointer;text-align:left;text-decoration:underline;text-underline-offset:2px}
    .nav-link:disabled{opacity:.45;cursor:not-allowed;text-decoration:none}
    .scope-card{display:grid;gap:12px;background:var(--row);border:1px solid var(--border);border-radius:18px;padding:14px}
    .check-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
    .check-row label{display:inline-flex;align-items:center;gap:8px;color:var(--text)}
    .note{background:var(--accent-soft);color:var(--text);border:1px solid var(--border);border-radius:16px;padding:10px 12px;font-size:13px}
    .empty{margin:8px 0;padding:18px;border:1px dashed var(--border);border-radius:18px;color:var(--muted);text-align:center;font-weight:750}
    .snack{position:fixed;right:24px;bottom:22px;background:var(--panel);border:1px solid var(--border);color:var(--text);box-shadow:var(--shadow);border-radius:16px;padding:12px 16px;z-index:50}
    @media (max-width:1100px){.test-list-toolbar,.summary-grid,.form-grid{grid-template-columns:repeat(2,minmax(140px,1fr))}.span-4{grid-column:1/-1}.test-list-actions{justify-content:flex-start}}
    @media (max-width:720px){.test-list-toolbar,.summary-grid,.form-grid{grid-template-columns:1fr}}
  `],
  template: `
    <section class="masters-shell">
      <section class="master-panel" *ngIf="viewMode === 'list'">
        <div class="panel-heading">
          <div class="panel-heading-left">
            <div class="panel-icon">⌕</div>
            <div>
              <h2>Patient Master</h2>
              <p>Search, edit details, and open bill / report history.</p>
            </div>
          </div>
          <span class="info-pill">{{ listTotal }} patients</span>
        </div>

        <div class="test-list-toolbar">
          <div class="test-list-search">
            <span>Search</span>
            <input [(ngModel)]="patientQuery" (ngModelChange)="onSearchChange()" placeholder="Search name, mobile, patient no">
          </div>
          <label class="test-list-filter">
            <span>Field</span>
            <select [(ngModel)]="searchField" (ngModelChange)="onFilterChange()">
              <option value="">All fields</option>
              <option value="NAME">Name</option>
              <option value="MOBILE">Mobile</option>
              <option value="PATIENT_ID">Patient ID</option>
            </select>
          </label>
          <div class="test-list-actions"></div>
        </div>

        <div class="masters-fetch-banner" *ngIf="loading" aria-live="polite">
          <span class="masters-fetch-spinner" aria-hidden="true"></span>
          <b>Loading patients…</b>
          <small>Fetching from database with current filters</small>
        </div>

        <div class="table-card" [class.is-loading]="loading">
          <table class="masters-table">
            <thead>
              <tr><th>Patient No</th><th>Name</th><th>Mobile</th><th>Gender</th><th>Age</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let p of patients(); trackBy: trackById">
                <td><strong>{{ p.patient_no || '—' }}</strong></td>
                <td><strong class="entity-name">{{ displayName(p) }}</strong></td>
                <td>{{ p.mobile || '—' }}</td>
                <td>{{ p.gender || '—' }}</td>
                <td>{{ ageDisplay(p) || p.age || '—' }}</td>
                <td class="row-actions">
                  <button class="edit-btn" type="button" (click)="openPatient(p.id)">Open</button>
                </td>
              </tr>
              <tr *ngIf="!loading && !patients().length">
                <td colspan="6" class="empty-cell">No patients found</td>
              </tr>
            </tbody>
          </table>
          <div class="table-footer">
            <span>Showing <b>{{ patients().length }}</b> of <b>{{ listTotal }}</b> patients</span>
            <span>Open a row to edit details and view history.</span>
          </div>
          <div class="masters-pager" *ngIf="listTotal > 0">
            <label>Rows
              <select [ngModel]="pageSize" (ngModelChange)="setPageSize(+$event)">
                <option [ngValue]="25">25</option>
                <option [ngValue]="50">50</option>
                <option [ngValue]="100">100</option>
              </select>
            </label>
            <button type="button" title="First page" (click)="setPage(1)" [disabled]="page <= 1">«</button>
            <button type="button" title="Previous page" (click)="setPage(page - 1)" [disabled]="page <= 1">‹</button>
            <b>{{ page }} / {{ totalPages() }}</b>
            <button type="button" title="Next page" (click)="setPage(page + 1)" [disabled]="page >= totalPages()">›</button>
            <button type="button" title="Last page" (click)="setPage(totalPages())" [disabled]="page >= totalPages()">»</button>
          </div>
        </div>
      </section>

      <section class="master-panel" *ngIf="viewMode === 'detail' && history() as h">
        <div class="detail-topbar">
          <div class="title">
            <strong>{{ displayName(h.patient) }}</strong>
            <span>{{ h.patient?.patient_no }} · {{ h.patient?.mobile || 'No mobile' }} · Registered {{ h.patient?.created_at | date:'dd-MMM-yyyy' }}</span>
          </div>
          <div class="test-list-actions">
            <span class="info-pill">{{ h.patient?.gender || '-' }} · {{ ageDisplay(h.patient) || h.patient?.age || '-' }}</span>
            <button class="action-btn ghost" type="button" (click)="backToList()">← Back to list</button>
          </div>
        </div>

        <div class="tabs">
          <button class="tab" type="button" [class.active]="tab()==='details'" (click)="tab.set('details')">Details</button>
          <button class="tab" type="button" [class.active]="tab()==='bills'" (click)="tab.set('bills')">Bills {{ h.bills?.length || 0 }}</button>
          <button class="tab" type="button" [class.active]="tab()==='reports'" (click)="tab.set('reports')">Reports {{ reportCount(h) }}</button>
          <button class="tab" type="button" [class.active]="tab()==='update'" (click)="tab.set('update')">Update Scope</button>
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
            <label>DOB<input type="date" [(ngModel)]="edit.dob" (change)="updateEditAgeFromDob()"></label>
            <label class="span-2">Age
              <div class="age-split-row" *ngIf="edit.age_split !== false; else yearsOnlyEdit">
                <span><small>Years</small><input type="text" inputmode="numeric" [(ngModel)]="edit.age_years" (input)="onEditSplitAgeInput()" (blur)="commitEditAge()"></span>
                <span><small>Months</small><input type="text" inputmode="numeric" [(ngModel)]="edit.age_months" (input)="onEditSplitAgeInput()" (blur)="commitEditAge()"></span>
                <span><small>Days</small><input type="text" inputmode="numeric" [(ngModel)]="edit.age_days" (input)="onEditSplitAgeInput()" (blur)="commitEditAge()"></span>
              </div>
              <ng-template #yearsOnlyEdit>
                <div class="age-split-row years-only">
                  <input type="text" inputmode="numeric" [(ngModel)]="edit.age_value" (input)="onEditYearsOnlyInput()" (blur)="commitEditAge()">
                  <em>Years</em>
                </div>
              </ng-template>
            </label>
            <label class="check-inline"><span>Split age</span><input type="checkbox" [(ngModel)]="edit.age_split" (change)="onEditAgeSplitToggle()"></label>
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
            <tr *ngFor="let b of h.bills">
              <td><button class="nav-link" type="button" [disabled]="!b.id" (click)="openBill(b)" title="Open bill in Billing">{{ b.bill_no }}</button></td>
              <td>{{ b.bill_date | date:'dd-MMM-yyyy hh:mm a' }}</td>
              <td>{{ b.item_count || 0 }}</td>
              <td>₹{{ b.total || 0 }}</td>
              <td>₹{{ b.paid || b.receipt_total || 0 }}</td>
              <td>₹{{ b.due || 0 }}</td>
              <td>{{ b.status || 'BILLED' }}</td>
            </tr>
          </table>
          <div class="empty" *ngIf="!h.bills?.length">No bill history</div>
        </div>

        <div class="content" *ngIf="tab()==='reports'">
          <h4>Quick reports</h4>
          <table class="history-table">
            <tr><th>Report No</th><th>Bill</th><th>Date</th><th>Items</th><th>Status</th></tr>
            <tr *ngFor="let r of h.quickReports">
              <td><button class="nav-link" type="button" [disabled]="!r.bill_no" (click)="openQuickReport(r)" title="Open in Reports">{{ r.report_no || ('QR-' + r.id) }}</button></td>
              <td><button class="nav-link" type="button" [disabled]="!(r.bill_id || r.bill_no)" (click)="openBillFromReport(r)" title="Open bill in Billing">{{ r.bill_no }}</button></td>
              <td>{{ r.created_at | date:'dd-MMM-yyyy hh:mm a' }}</td>
              <td>{{ r.item_count || 0 }}</td>
              <td>{{ r.status }}</td>
            </tr>
          </table>
          <div class="empty" *ngIf="!h.quickReports?.length">No quick report history</div>

          <h4 style="margin-top:16px">Lab workflow reports</h4>
          <table class="history-table">
            <tr><th>Report ID</th><th>Bill</th><th>Date</th><th>Items</th><th>Status</th></tr>
            <tr *ngFor="let r of h.reports">
              <td><b>#{{ r.id }}</b></td>
              <td><button class="nav-link" type="button" [disabled]="!(r.bill_id || r.bill_no)" (click)="openBillFromReport(r)" title="Open bill in Billing">{{ r.bill_no }}</button></td>
              <td>{{ r.updated_at || r.created_at | date:'dd-MMM-yyyy hh:mm a' }}</td>
              <td>{{ r.item_count || 0 }}</td>
              <td>{{ r.status }}</td>
            </tr>
          </table>
          <div class="empty" *ngIf="!h.reports?.length">No lab workflow report history</div>
        </div>

        <div class="content" *ngIf="tab()==='update'">
          <div class="scope-card">
            <h3 style="margin:0">Controlled patient update</h3>
            <div class="note">
              Patient master is always updated. Historical bill/report prints use a frozen patient snapshot per bill.
              Choose the scope below to rewrite those snapshots (Billing / Reporting) or leave older visits frozen.
            </div>
            <div class="form-grid">
              <label>Update mode
                <select [(ngModel)]="updateMode">
                  <option value="future">Future only — freeze all existing bills/reports</option>
                  <option value="pending">Pending only — unpaid or unfinished reports</option>
                  <option value="fromDate">From selected date</option>
                  <option value="all">All history</option>
                </select>
              </label>
              <label>Apply from date
                <input type="date" [(ngModel)]="applyFrom" (focus)="onApplyFromInteract()" (change)="onApplyFromInteract()">
              </label>
              <label class="span-2">Reason<input [(ngModel)]="updateReason" placeholder="Reason for correction"></label>
            </div>
            <div class="note" *ngIf="updateMode==='fromDate'">Snapshots from <b>{{ applyFrom || 'the selected date' }}</b> onward will be rewritten for the checked print types.</div>
            <div class="note" *ngIf="updateMode!=='fromDate'">To rewrite from a specific day, pick a date above (switches to “From selected date”) or choose that mode first.</div>
            <div class="check-row">
              <label><input type="checkbox" [(ngModel)]="updateBilling"> Billing prints</label>
              <label><input type="checkbox" [(ngModel)]="updateReporting"> Reporting prints</label>
            </div>
            <div class="note" *ngIf="!updateBilling && !updateReporting">Neither Billing nor Reporting is checked — only the patient master will change; existing visits stay frozen if they already have a snapshot, otherwise they are frozen to the previous details.</div>
            <div class="actions"><button class="btn primary" type="button" (click)="savePatientWithScope()">Save with this scope</button></div>
          </div>
        </div>
      </section>

      <div class="snack" *ngIf="snack()">{{ snack() }}</div>
    </section>
  `
})
export class PatientHistoryPageComponent implements OnInit, OnDestroy {
  @Output() editBill = new EventEmitter<number>();
  @Output() openQuickReportNav = new EventEmitter<PatientQuickReportNav>();

  patients = signal<any[]>([]);
  history = signal<any>(null);
  selectedId = signal<number | null>(null);
  tab = signal<'details' | 'bills' | 'reports' | 'update'>('details');
  viewMode: 'list' | 'detail' = 'list';
  patientQuery = '';
  searchField = '';
  loading = false;
  page = 1;
  pageSize = 50;
  listTotal = 0;
  edit: any = {};
  snack = signal('');
  applyFrom = new Date().toISOString().slice(0, 10);
  updateMode: 'future' | 'pending' | 'fromDate' | 'all' = 'future';
  updateBilling = true;
  updateReporting = true;
  updateReason = '';
  private loadSeq = 0;
  private searchTimer: any = null;

  trackById = (_: number, p: any) => p?.id;
  totalPages() { return Math.max(1, Math.ceil(this.listTotal / Math.max(1, this.pageSize))); }

  onApplyFromInteract() {
    if (this.updateMode !== 'fromDate') this.updateMode = 'fromDate';
  }

  openBill(b: any) {
    const id = Number(b?.id || 0);
    if (!id) return;
    this.editBill.emit(id);
  }

  openBillFromReport(r: any) {
    const id = Number(r?.bill_id || 0);
    if (id) { this.editBill.emit(id); return; }
    const billNo = String(r?.bill_no || '').trim();
    if (!billNo) return;
    const match = (this.history()?.bills || []).find((b: any) => String(b?.bill_no || '').trim() === billNo);
    if (match?.id) this.editBill.emit(Number(match.id));
  }

  openQuickReport(r: any) {
    const billNo = String(r?.bill_no || '').trim();
    if (!billNo) return;
    this.openQuickReportNav.emit({
      billNo,
      billId: Number(r?.bill_id || 0) || undefined,
      reportNo: String(r?.report_no || '').trim() || undefined,
      status: String(r?.status || '').trim() || undefined,
      focusDate: this.toInputDate(r?.created_at || r?.bill_date || r?.updated_at)
    });
  }

  private toInputDate(value: any): string | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return m?.[1];
  }

  async ngOnInit() { await this.loadPatients(); }
  ngOnDestroy() { if (this.searchTimer) clearTimeout(this.searchTimer); }

  onSearchChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      void this.loadPatients();
    }, 220);
  }
  onFilterChange() { this.page = 1; void this.loadPatients(); }
  setPage(p: number) {
    const next = Math.max(1, Math.min(this.totalPages(), Math.floor(+p || 1)));
    if (next === this.page) return;
    this.page = next;
    void this.loadPatients();
  }
  setPageSize(size: number) {
    this.pageSize = Math.min(100, Math.max(1, Number(size) || 50));
    this.page = 1;
    void this.loadPatients();
  }

  async loadPatients() {
    const api: any = window.limsApi;
    const seq = ++this.loadSeq;
    this.loading = true;
    try {
      if (!api.searchPatients) {
        const rows = await api.listPatients({ q: this.patientQuery, searchField: this.searchField || undefined });
        if (seq !== this.loadSeq) return;
        const list = Array.isArray(rows) ? rows : [];
        this.patients.set(list);
        this.listTotal = list.length;
        return;
      }
      const result = await api.searchPatients({
        q: this.patientQuery,
        searchField: this.searchField || undefined,
        page: this.page,
        pageSize: this.pageSize
      });
      if (seq !== this.loadSeq) return;
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      this.patients.set(rows);
      this.listTotal = Math.max(0, +result?.total || rows.length);
      this.page = Math.max(1, +result?.page || this.page);
      this.pageSize = +result?.pageSize || this.pageSize;
      const maxPage = this.totalPages();
      if (this.page > maxPage) {
        this.page = maxPage;
        await this.loadPatients();
      }
    } finally {
      if (seq === this.loadSeq) this.loading = false;
    }
  }

  async openPatient(id: number) {
    await this.loadHistory(id);
    this.viewMode = 'detail';
  }

  backToList() {
    this.viewMode = 'list';
    this.history.set(null);
    this.selectedId.set(null);
    void this.loadPatients();
  }

  async loadHistory(id: number, keepTab = false) {
    this.selectedId.set(id);
    const data = await window.limsApi.patientHistory(id);
    this.history.set(data);
    this.edit = this.normalizeEditPatient(data?.patient || {});
    if (!keepTab) this.tab.set('details');
  }

  resetEdit() {
    this.edit = this.normalizeEditPatient(this.history()?.patient || {});
  }

  normalizeEditPatient(p: any) {
    const age_split = p?.age_split === undefined ? false : !!(p.age_split === true || p.age_split === 1 || p.age_split === '1');
    const parts = p?.dob ? this.agePartsFromDob(p.dob) : this.parseSplitAgeParts(p?.age);
    return {
      ...p,
      age_split,
      age_unit: 'YEARS',
      age_years: p?.age_years ?? parts.years ?? (Number(p?.age_value) || 0),
      age_months: p?.age_months ?? parts.months ?? 0,
      age_days: p?.age_days ?? parts.days ?? 0,
      age_value: age_split
        ? (Number(p?.age_years ?? parts.years ?? p?.age_value ?? 0) || 0)
        : (Number(p?.age_value ?? parts.years ?? 0) || 0)
    };
  }

  parseSplitAgeParts(age: any) {
    const text = String(age || '').toLowerCase();
    const years = Number((text.match(/(\d+)\s*y/) || [])[1] || 0);
    const months = Number((text.match(/(\d+)\s*m/) || [])[1] || 0);
    const days = Number((text.match(/(\d+)\s*d/) || [])[1] || 0);
    if (years || months || days) return { years, months, days };
    const only = Number((text.match(/\d+/) || [])[0] || 0);
    return { years: only, months: 0, days: 0 };
  }

  agePartsFromDob(dobValue?: string) {
    if (!dobValue) return { years: 0, months: 0, days: 0 };
    const dob = new Date(String(dobValue).slice(0, 10) + 'T00:00:00');
    const today = new Date();
    if (Number.isNaN(dob.getTime()) || dob > today) return { years: 0, months: 0, days: 0 };
    let years = today.getFullYear() - dob.getFullYear();
    let months = today.getMonth() - dob.getMonth();
    let days = today.getDate() - dob.getDate();
    if (days < 0) { months--; days += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
    if (months < 0) { years--; months += 12; }
    return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
  }

  private digitsOnly(value: any): string { return String(value ?? '').replace(/\D/g, ''); }
  private clampInt(value: any, min: number, max: number): number {
    const digits = this.digitsOnly(value);
    if (digits === '') return 0;
    return Math.min(max, Math.max(min, parseInt(digits, 10) || 0));
  }

  formatAgeFromParts(parts: any, split = true) {
    const years = Math.max(0, Number(parts?.years || 0) || 0);
    const months = Math.max(0, Number(parts?.months || 0) || 0);
    const days = Math.max(0, Number(parts?.days || 0) || 0);
    if (!split) return `${years} ${years === 1 ? 'year' : 'years'}`;
    const bits: string[] = [];
    if (years > 0) bits.push(`${years} ${years === 1 ? 'year' : 'years'}`);
    if (months > 0) bits.push(`${months} ${months === 1 ? 'month' : 'months'}`);
    if (days > 0) bits.push(`${days} ${days === 1 ? 'day' : 'days'}`);
    return bits.length ? bits.join(' ') : '0 years';
  }

  onEditSplitAgeInput() {
    this.edit.age_years = this.digitsOnly(this.edit.age_years);
    this.edit.age_months = this.digitsOnly(this.edit.age_months);
    this.edit.age_days = this.digitsOnly(this.edit.age_days);
    this.edit.age_value = this.edit.age_years;
    this.edit.age = this.formatAgeFromParts({
      years: this.clampInt(this.edit.age_years, 0, 150),
      months: this.clampInt(this.edit.age_months, 0, 11),
      days: this.clampInt(this.edit.age_days, 0, 31)
    }, true);
  }

  onEditYearsOnlyInput() {
    this.edit.age_value = this.digitsOnly(this.edit.age_value);
    this.edit.age_years = this.edit.age_value;
    this.edit.age_months = 0;
    this.edit.age_days = 0;
    this.edit.age = this.formatAgeFromParts({ years: this.clampInt(this.edit.age_value, 0, 150), months: 0, days: 0 }, false);
  }

  commitEditAge() {
    if (this.edit.age_split !== false) {
      this.edit.age_years = this.clampInt(this.edit.age_years, 0, 150);
      this.edit.age_months = this.clampInt(this.edit.age_months, 0, 11);
      this.edit.age_days = this.clampInt(this.edit.age_days, 0, 31);
      this.edit.age_value = this.edit.age_years;
      this.updateEditDobFromAge();
    } else {
      this.edit.age_value = this.clampInt(this.edit.age_value, 0, 150);
      this.edit.age_years = this.edit.age_value;
      this.edit.age_months = 0;
      this.edit.age_days = 0;
      this.updateEditDobFromAge();
    }
    this.syncEditAge();
  }

  updateEditAgeFromDob() {
    if (!this.edit?.dob) return;
    const parts = this.agePartsFromDob(this.edit.dob);
    this.edit.age_years = parts.years;
    this.edit.age_months = parts.months;
    this.edit.age_days = parts.days;
    this.edit.age_value = parts.years;
    this.syncEditAge();
  }

  updateEditDobFromAge() {
    const split = this.edit.age_split !== false;
    const parts = split
      ? { years: this.clampInt(this.edit.age_years, 0, 150), months: this.clampInt(this.edit.age_months, 0, 11), days: this.clampInt(this.edit.age_days, 0, 31) }
      : { years: this.clampInt(this.edit.age_value, 0, 150), months: 0, days: 0 };
    if (!parts.years && !parts.months && !parts.days) return;
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setFullYear(d.getFullYear() - parts.years);
    d.setMonth(d.getMonth() - parts.months);
    d.setDate(d.getDate() - parts.days);
    this.edit.dob = d.toISOString().slice(0, 10);
    const normalized = this.agePartsFromDob(this.edit.dob);
    this.edit.age_years = normalized.years;
    this.edit.age_months = normalized.months;
    this.edit.age_days = normalized.days;
    this.edit.age_value = split ? normalized.years : parts.years;
  }

  onEditAgeSplitToggle() {
    if (this.edit.age_split) {
      if (this.edit.dob) this.updateEditAgeFromDob();
      else {
        this.edit.age_years = this.clampInt(this.edit.age_value ?? this.edit.age_years, 0, 150);
        this.edit.age_months = this.clampInt(this.edit.age_months, 0, 11);
        this.edit.age_days = this.clampInt(this.edit.age_days, 0, 31);
      }
    } else if (this.edit.dob) {
      this.edit.age_value = this.agePartsFromDob(this.edit.dob).years;
      this.edit.age_years = this.edit.age_value;
      this.edit.age_months = 0;
      this.edit.age_days = 0;
    }
    this.syncEditAge();
  }

  async savePatient() {
    if (!String(this.edit?.name || '').trim()) { this.notify('Patient name is required'); return; }
    this.commitEditAge();
    const id = await window.limsApi.savePatient({ ...this.edit });
    this.notify('Patient master updated');
    await this.loadPatients();
    await this.loadHistory(Number((id && typeof id === 'object' ? (id as any).id : id) || this.selectedId()));
  }

  async savePatientWithScope() {
    if (!String(this.edit?.name || '').trim()) { this.notify('Patient name is required'); return; }
    this.commitEditAge();
    if (!this.updateBilling && !this.updateReporting && this.updateMode !== 'future') {
      this.notify('Turn on Billing and/or Reporting, or use Future only');
      return;
    }
    if (this.updateMode === 'fromDate' && !String(this.applyFrom || '').trim()) {
      this.notify('Select Apply from date');
      return;
    }
    const result: any = await window.limsApi.savePatient({
      ...this.edit,
      apply_scope: true,
      update_scope: this.updateMode,
      apply_from: this.applyFrom,
      update_billing: this.updateBilling,
      update_reporting: this.updateReporting,
      update_reason: this.updateReason
    });
    const id = result && typeof result === 'object' ? result.id : result;
    const scope = result && typeof result === 'object' ? result.scope : null;
    const modeLabel = ({
      future: 'Future only',
      pending: 'Pending only',
      fromDate: 'From selected date',
      all: 'All history'
    } as any)[this.updateMode] || this.updateMode;
    if (scope) {
      this.notify(`${modeLabel}: master saved · ${scope.updated || 0} visit(s) updated · ${scope.frozen || 0} frozen`);
    } else {
      this.notify(`Patient updated with scope: ${modeLabel}`);
    }
    await this.loadPatients();
    await this.loadHistory(Number(id || this.selectedId()), true);
    this.tab.set('update');
  }

  displayName(p: any) { return [p?.title, p?.name || p?.patient_name].filter(Boolean).join(' ') || '-'; }
  ageDisplay(p: any) {
    const stored = String(p?.age || '').trim();
    if (stored && /month|day|week/i.test(stored)) return stored;
    const split = p?.age_split === true || p?.age_split === 1 || p?.age_split === '1';
    if (split && p?.dob) return this.formatAgeFromParts(this.agePartsFromDob(p.dob), true);
    if (stored && !/^0\s*years?$/i.test(stored)) return stored;
    if (p?.age_value === '' || p?.age_value === undefined || p?.age_value === null) return stored || '';
    const unit = String(p.age_unit || 'YEARS').toUpperCase();
    const n = Number(p.age_value) || 0;
    if (n === 0 && stored && !/^0\s*years?$/i.test(stored)) return stored;
    const label = ({ YEARS: n === 1 ? 'year' : 'years', MONTHS: n === 1 ? 'month' : 'months', WEEKS: n === 1 ? 'week' : 'weeks', DAYS: n === 1 ? 'day' : 'days' } as any)[unit] || unit.toLowerCase();
    return `${n} ${label}`;
  }
  syncEditAge() {
    if (!this.edit) return;
    this.edit.age_unit = 'YEARS';
    if (this.edit.age_split !== false) {
      this.edit.age = this.formatAgeFromParts({
        years: this.clampInt(this.edit.age_years ?? this.edit.age_value, 0, 150),
        months: this.clampInt(this.edit.age_months, 0, 11),
        days: this.clampInt(this.edit.age_days, 0, 31)
      }, true);
      this.edit.age_value = this.clampInt(this.edit.age_years ?? this.edit.age_value, 0, 150);
    } else {
      const v = this.clampInt(this.edit.age_value, 0, 150);
      this.edit.age_value = v;
      this.edit.age = this.formatAgeFromParts({ years: v, months: 0, days: 0 }, false);
    }
  }
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
