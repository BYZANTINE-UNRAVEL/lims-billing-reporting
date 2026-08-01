import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';

type StatementAction = 'print' | 'download';
type StatementKind = 'detailed' | 'consolidated';

@Component({
  selector: 'app-statements-page',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, MatMenuModule, MatTooltipModule],
  template: `
    <section class="statement-page">
      <div class="kpi-grid">
        <article class="kpi-card">
          <span class="kpi-icon bill">▣</span>
          <div><small>Total Bills</small><b>{{clientFilteredBills().length}}</b><em>Selected period</em></div>
        </article>
        <article class="kpi-card">
          <span class="kpi-icon paid">₹</span>
          <div><small>Total Collection</small><b>₹{{money(visibleTotals().paid)}}</b><em>Receipt payments</em></div>
        </article>
        <article class="kpi-card">
          <span class="kpi-icon due">!</span>
          <div><small>Total Due</small><b>₹{{money(visibleTotals().due)}}</b><em>Pending amount</em></div>
        </article>
        <article class="kpi-card">
          <span class="kpi-icon cancel">×</span>
          <div><small>Cancelled</small><b>{{cancelledCount()}}</b><em>Audit records</em></div>
        </article>
      </div>

      <section class="filter-card">
        <div class="filter-row">
          <label class="field small-date">
            <span>From Date</span>
            <input type="date" [(ngModel)]="filters.from" (change)="validateDates()" />
          </label>
          <label class="field small-date">
            <span>To Date</span>
            <input type="date" [(ngModel)]="filters.to" (change)="validateDates()" />
          </label>
          <label class="field search-field">
            <span>Search</span>
            <div class="input-icon">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input [(ngModel)]="filters.q" placeholder="Bill no / Patient / Mobile" (keyup.enter)="loadStatement()" />
            </div>
          </label>
          <div class="filter-button-wrap">
            <button class="btn filter-btn" type="button" (click)="openFilterModal()" title="Advanced filters">
              <svg viewBox="0 0 24 24"><path d="M4 6h16"></path><path d="M7 12h10"></path><path d="M10 18h4"></path></svg>
              <span>Filters</span>
              <b *ngIf="activeFilterCount()">{{activeFilterCount()}}</b>
            </button>
          </div>
          <button class="btn icon-btn" type="button" title="Reset filters" (click)="clearFilters()">
            <svg viewBox="0 0 24 24"><path d="M4 4v6h6"></path><path d="M20 20v-6h-6"></path><path d="M20 9A8 8 0 0 0 6.4 4.6L4 7"></path><path d="M4 15a8 8 0 0 0 13.6 4.4L20 17"></path></svg>
          </button>
          <button class="btn search-btn" type="button" (click)="loadStatement()">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
            <span>Search</span>
          </button>
        </div>

        <div class="active-filter-row" *ngIf="activeChips().length">
          <strong>Active filters:</strong>
          <button *ngFor="let chip of activeChips()" class="chip" type="button" (click)="removeFilter(chip.key, chip.value)">
            {{chip.label}} <span>×</span>
          </button>
          <button class="clear-link" type="button" (click)="clearAdvancedFilters()">Clear all</button>
        </div>
        <p class="filter-error" *ngIf="filterError()">{{filterError()}}</p>
      </section>

      <section class="register-card">
        <header class="register-header">
          <div>
            <h2>Bill Register</h2>
            <p>Showing {{pagedBills().length}} of {{clientFilteredBills().length}} bills</p>
          </div>
          <div class="register-tools">
            <button class="btn tool-btn" type="button" title="Print statement PDF" (click)="statementPdf('print')">
              <svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2"></path><path d="M6 14h12v7H6z"></path></svg>
              Print PDF
            </button>
            <button class="btn tool-btn" type="button" title="Download statement PDF" (click)="statementPdf('download')">
              <svg viewBox="0 0 24 24"><path d="M12 3v12"></path><path d="M7 10l5 5 5-5"></path><path d="M5 21h14"></path></svg>
              PDF
            </button>
            <button class="btn tool-btn" type="button" title="Export Excel" (click)="statementExcel()">
              <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z"></path><path d="M8 8l8 8"></path><path d="M16 8l-8 8"></path></svg>
              Excel
            </button>
            <select class="page-select" [(ngModel)]="pageSize" (ngModelChange)="page.set(1)">
              <option [ngValue]="10">10 / page</option>
              <option [ngValue]="25">25 / page</option>
              <option [ngValue]="50">50 / page</option>
            </select>
          </div>
        </header>

        <div class="table-scroll">
          <table class="bill-table">
            <colgroup>
              <col class="col-bill-no" />
              <col class="col-date" />
              <col class="col-patient-summary" />
              <col class="col-money" />
              <col class="col-money" />
              <col class="col-due" />
              <col class="col-payment" />
              <col class="col-status" />
              <col class="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>Bill No.</th>
                <th>Date & Time</th>
                <th>Patient Details</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Due / Excess</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let b of pagedBills()" [class.cancelled-row]="b.status==='CANCELLED'">
                <td>
                  <button class="bill-link cell-ellipsis" type="button" (click)="editBill.emit(b.id)" [matTooltip]="b.bill_no" matTooltipPosition="above">{{b.bill_no}}</button>
                </td>
                <td>
                  <div class="cell-stack" [matTooltip]="(b.bill_date | date:'dd MMM yyyy, shortTime') || ''" matTooltipPosition="above">
                    <b class="cell-ellipsis">{{b.bill_date | date:'dd MMM yyyy'}}</b>
                    <small class="cell-ellipsis">{{b.bill_date | date:'shortTime'}}</small>
                  </div>
                </td>
                <td>
                  <div class="patient-summary-cell"
                       [matTooltip]="patientSummaryTooltip(b)"
                       matTooltipPosition="above"
                       matTooltipClass="rich-cell-tooltip">
                    <div class="patient-primary cell-ellipsis">{{b.patient_name || '-'}}</div>
                    <div class="patient-meta cell-ellipsis">{{patientAgeGender(b)}}</div>
                    <div class="patient-mobile cell-ellipsis">{{b.mobile || b.patient_no || '-'}}</div>
                    <div class="patient-consultant cell-ellipsis">{{b.consultant_name || 'No consultant'}}</div>
                  </div>
                </td>
                <td><span class="cell-ellipsis" [matTooltip]="'₹' + money(b.total)">₹{{money(b.total)}}</span></td>
                <td class="paid-text"><span class="cell-ellipsis" [matTooltip]="'₹' + money(b.paid)">₹{{money(b.paid)}}</span></td>
                <td [class.due-text]="(+b.due||0)>0" [class.excess-text]="excess(b)>0">
                  <span class="cell-ellipsis" [matTooltip]="excess(b)>0 ? '+₹' + money(excess(b)) : '₹' + money(b.due)">
                    <ng-container *ngIf="excess(b)>0; else dueTpl">+₹{{money(excess(b))}}</ng-container>
                    <ng-template #dueTpl>₹{{money(b.due)}}</ng-template>
                  </span>
                </td>
                <td><span class="status-chip cell-ellipsis" [ngClass]="paymentStatusClass(b)" [matTooltip]="statusText(b)" matTooltipPosition="above">{{statusText(b)}}</span></td>
                <td><span class="status-chip cell-ellipsis" [class.cancelled]="b.status==='CANCELLED'" [matTooltip]="b.status==='CANCELLED' ? 'Cancelled' : 'Active'" matTooltipPosition="above">{{b.status==='CANCELLED' ? 'Cancelled' : 'Active'}}</span></td>
                <td class="actions-cell">
                  <button class="actions-trigger" type="button" [matMenuTriggerFor]="billActionsMenu" [matMenuTriggerData]="{ bill: b }" aria-label="Open bill actions" matTooltip="Click to view actions" matTooltipPosition="above">
                    <span class="actions-trigger-icon">•••</span>
                    <span>Actions</span>
                  </button>
                </td>
              </tr>
              <tr *ngIf="!pagedBills().length"><td class="empty-row" colspan="9">No bills found. Adjust filters or date range.</td></tr>
            </tbody>
          </table>
        </div>

          <mat-menu #billActionsMenu="matMenu" class="bill-actions-menu rich-actions-menu" xPosition="before">
            <ng-template matMenuContent let-bill="bill">
              <div class="action-menu-head" (click)="$event.stopPropagation()">
                <span class="action-avatar">{{patientInitials(bill)}}</span>
                <div>
                  <b class="cell-ellipsis">{{bill.patient_name || 'Patient'}}</b>
                  <small class="cell-ellipsis">{{bill.bill_no}} · {{patientAgeGender(bill)}}</small>
                </div>
              </div>
              <div class="action-menu-grid">
                <button mat-menu-item type="button" class="rich-menu-item" (click)="printBill(bill)">
                  <span class="menu-action-icon pdf-icon">▧</span><span><b>Bill PDF</b><small>Preview or print</small></span>
                </button>
                <button mat-menu-item type="button" class="rich-menu-item" [disabled]="bill.status==='CANCELLED'" (click)="editBill.emit(bill.id)">
                  <span class="menu-action-icon edit-icon">✎</span><span><b>Edit bill</b><small>Update bill details</small></span>
                </button>
                <button mat-menu-item type="button" class="rich-menu-item" [disabled]="bill.status==='CANCELLED'" (click)="openCancel(bill)">
                  <span class="menu-action-icon warning-icon">⊖</span><span><b>Cancel / refund</b><small>Record cancellation</small></span>
                </button>
                <button mat-menu-item type="button" class="rich-menu-item danger-menu-item" [disabled]="bill.paid > 0 || bill.status==='CANCELLED'" (click)="openDelete(bill)">
                  <span class="menu-action-icon danger-icon">⌫</span><span><b>Delete bill</b><small>Only unpaid bills</small></span>
                </button>
              </div>
            </ng-template>
          </mat-menu>
        <footer class="pagination-bar">
          <button class="page-btn" type="button" [disabled]="page() <= 1" (click)="page.set(page()-1)">‹</button>
          <span>Page <b>{{page()}}</b> / {{totalPages()}}</span>
          <button class="page-btn" type="button" [disabled]="page() >= totalPages()" (click)="page.set(page()+1)">›</button>
        </footer>
      </section>
    </section>

    <div class="modal-backdrop" *ngIf="filterModal()">
      <div class="pro-modal filter-modal">
        <div class="modal-head">
          <div><h3>Advanced filters</h3><p>Select optional filters for this register.</p></div>
          <button class="close-btn" type="button" (click)="filterModal.set(false)">×</button>
        </div>
        <div class="modal-grid multi-filter-grid">
          <div class="multi-filter-group">
            <div class="multi-filter-title">
              <span>Consultants</span>
              <small>{{list(draftFilters.consultant_ids).length}} selected</small>
            </div>
            <div class="mini-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input [(ngModel)]="draftSearch.consultants" placeholder="Search consultants" />
            </div>
            <div class="multi-filter-actions">
              <button type="button" (click)="selectAllDraft('consultant_ids', visibleConsultantValues())">Select shown</button>
              <button type="button" (click)="clearDraftList('consultant_ids')">Clear</button>
            </div>
            <div class="option-list">
              <label class="check-row" *ngIf="matchesText('No consultant', draftSearch.consultants)"><input type="checkbox" [checked]="isDraftSelected('consultant_ids','NONE')" (change)="toggleDraftList('consultant_ids','NONE')"><span>No consultant</span></label>
              <label class="check-row" *ngFor="let c of filteredConsultants()"><input type="checkbox" [checked]="isDraftSelected('consultant_ids', c.id)" (change)="toggleDraftList('consultant_ids', c.id)"><span>{{c.name}}</span></label>
              <p class="list-empty" *ngIf="!filteredConsultants().length && !matchesText('No consultant', draftSearch.consultants)">No consultants found</p>
            </div>
          </div>

          <div class="multi-filter-group">
            <div class="multi-filter-title">
              <span>Bill Status</span>
              <small>{{list(draftFilters.status_list).length}} selected</small>
            </div>
            <div class="mini-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input [(ngModel)]="draftSearch.billStatus" placeholder="Search bill status" />
            </div>
            <div class="multi-filter-actions">
              <button type="button" (click)="selectAllDraft('status_list', filteredBillStatusValues())">Select shown</button>
              <button type="button" (click)="clearDraftList('status_list')">Clear</button>
            </div>
            <div class="option-list">
              <label class="check-row" *ngFor="let s of filteredBillStatusOptions()"><input type="checkbox" [checked]="isDraftSelected('status_list', s.value)" (change)="toggleDraftList('status_list', s.value)"><span>{{s.label}}</span></label>
              <p class="list-empty" *ngIf="!filteredBillStatusOptions().length">No bill statuses found</p>
            </div>
          </div>

          <div class="multi-filter-group">
            <div class="multi-filter-title">
              <span>Payment Status</span>
              <small>{{list(draftFilters.payment_statuses).length}} selected</small>
            </div>
            <div class="mini-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input [(ngModel)]="draftSearch.paymentStatus" placeholder="Search payment status" />
            </div>
            <div class="multi-filter-actions">
              <button type="button" (click)="selectAllDraft('payment_statuses', filteredPaymentStatusValues())">Select shown</button>
              <button type="button" (click)="clearDraftList('payment_statuses')">Clear</button>
            </div>
            <div class="option-list">
              <label class="check-row" *ngFor="let s of filteredPaymentStatusOptions()"><input type="checkbox" [checked]="isDraftSelected('payment_statuses', s.value)" (change)="toggleDraftList('payment_statuses', s.value)"><span>{{s.label}}</span></label>
              <p class="list-empty" *ngIf="!filteredPaymentStatusOptions().length">No payment statuses found</p>
            </div>
          </div>

          <div class="multi-filter-group">
            <div class="multi-filter-title">
              <span>Payment Modes</span>
              <small>{{list(draftFilters.payment_modes).length}} selected</small>
            </div>
            <div class="mini-search">
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input [(ngModel)]="draftSearch.paymentMode" placeholder="Search payment mode" />
            </div>
            <div class="multi-filter-actions">
              <button type="button" (click)="selectAllDraft('payment_modes', filteredPaymentModeOptions())">Select shown</button>
              <button type="button" (click)="clearDraftList('payment_modes')">Clear</button>
            </div>
            <div class="option-list">
              <label class="check-row" *ngFor="let m of filteredPaymentModeOptions()"><input type="checkbox" [checked]="isDraftSelected('payment_modes', m)" (change)="toggleDraftList('payment_modes', m)"><span>{{m}}</span></label>
              <p class="list-empty" *ngIf="!filteredPaymentModeOptions().length">No payment modes found</p>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn secondary" type="button" (click)="resetDraftFilters()">Clear</button>
          <button class="btn primary" type="button" (click)="applyAdvancedFilters()">Apply filters</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" *ngIf="statementTypeModal() as st">
      <div class="pro-modal choice-modal">
        <div class="modal-head"><div><h3>{{st.action === 'print' ? 'Print statement PDF' : 'Download statement PDF'}}</h3><p>You selected more than one day. Choose the statement format.</p></div></div>
        <div class="choice-grid">
          <button type="button" class="choice-card" (click)="confirmStatementPdf('detailed')"><b>Detailed statement</b><span>Bill-wise list with patient, consultant, total, paid and due.</span></button>
          <button type="button" class="choice-card" (click)="confirmStatementPdf('consolidated')"><b>Consolidated statement</b><span>Grouped summary by date, consultant and payment status.</span></button>
        </div>
        <div class="modal-actions"><button class="btn secondary" type="button" (click)="statementTypeModal.set(null)">Cancel</button></div>
      </div>
    </div>

    <div class="modal-backdrop" *ngIf="cancelModal() as m">
      <div class="pro-modal">
        <div class="modal-head"><div><h3>Cancel bill {{m.bill.bill_no}}</h3><p>This bill will remain in statements for audit history.</p></div></div>
        <div class="summary-line"><span>Paid amount</span><b>₹{{money(m.bill.paid)}}</b></div>
        <label class="stacked"><span>Cancellation reason</span><textarea [(ngModel)]="cancelForm.reason" placeholder="Reason for cancellation"></textarea></label>
        <div class="modal-grid" *ngIf="m.bill.paid > 0">
          <label><span>Refund amount *</span><input type="number" [(ngModel)]="cancelForm.refund_amount"></label>
          <label><span>Refund mode *</span><select [(ngModel)]="cancelForm.refund_mode"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank Transfer</option></select></label>
        </div>
        <div class="modal-actions"><button class="btn secondary" type="button" (click)="cancelModal.set(null)">Keep bill</button><button class="btn danger" type="button" (click)="confirmCancel()">Cancel bill</button></div>
      </div>
    </div>

    <div class="modal-backdrop" *ngIf="deleteModal() as m">
      <div class="pro-modal">
        <div class="modal-head"><div><h3>Delete bill {{m.bill.bill_no}}?</h3><p>Only unpaid bills can be deleted. This action cannot be undone.</p></div></div>
        <div class="modal-actions"><button class="btn secondary" type="button" (click)="deleteModal.set(null)">Keep bill</button><button class="btn danger" type="button" (click)="confirmDelete()">Delete bill</button></div>
      </div>
    </div>
  `,
  styles: [`
    :host { display:block; --bg:#08101f; --panel:#101827; --panel-2:#0b1424; --input:#0b1322; --border:#263349; --text:#f8fafc; --muted:#9aa8bc; --soft:#172238; --brand:#3b82f6; --shadow:0 22px 50px rgba(0,0,0,.22); font-size:14px; }
    :host-context(.light) { --bg:#f6f8fc; --panel:#fff; --panel-2:#f8fafc; --input:#fff; --border:#dbe3ee; --text:#0f172a; --muted:#64748b; --soft:#eef4ff; --shadow:0 18px 40px rgba(15,23,42,.08); }
    .statement-page { color:var(--text); display:flex; flex-direction:column; gap:16px; padding:4px 2px 28px; }
    .kpi-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
    .kpi-card { display:flex; align-items:center; gap:16px; min-height:112px; padding:18px 20px; border:1px solid var(--border); border-radius:22px; background:var(--panel); box-shadow:var(--shadow); }
    .kpi-card small { display:block; color:var(--muted); font-size:13px; font-weight:800; }
    .kpi-card b { display:block; margin-top:5px; font-size:26px; line-height:1; letter-spacing:-.03em; }
    .kpi-card em { display:block; margin-top:9px; color:var(--muted); font-style:normal; font-size:12.5px; font-weight:750; }
    .kpi-icon { width:48px; height:48px; flex:0 0 48px; border-radius:16px; display:grid; place-items:center; font-weight:1000; }
    .kpi-icon.bill { background:rgba(59,130,246,.16); color:#6aa4ff; } .kpi-icon.paid { background:rgba(34,197,94,.16); color:#56d98d; } .kpi-icon.due { background:rgba(245,158,11,.16); color:#f8b84e; } .kpi-icon.cancel { background:rgba(244,63,94,.14); color:#ff8ca3; }
    .filter-card, .register-card { border:1px solid var(--border); border-radius:24px; background:var(--panel); box-shadow:var(--shadow); }
    .filter-card { padding:18px; overflow:hidden; }
    .filter-row { display:grid; grid-template-columns: 160px 160px minmax(240px,1fr) 140px 54px 150px; gap:12px; align-items:end; }
    .field span, .modal-grid span, .stacked span { display:block; color:var(--muted); font-size:12.5px; font-weight:900; margin:0 0 7px; }
    input, select, textarea { width:100%; box-sizing:border-box; border:1px solid var(--border); border-radius:14px; background:var(--input); color:var(--text); outline:none; font-weight:800; font-size:14px; }
    input, select { height:46px; padding:0 13px; } textarea { min-height:84px; padding:12px; resize:vertical; }
    input:focus, select:focus, textarea:focus { border-color:#68a1ff; box-shadow:0 0 0 3px rgba(59,130,246,.15); }
    .input-icon { position:relative; } .input-icon svg { position:absolute; left:13px; top:50%; transform:translateY(-50%); width:19px; height:19px; color:var(--muted); stroke:currentColor; fill:none; stroke-width:2.2; } .input-icon input { padding-left:42px; }
    .btn { height:46px; border:1px solid var(--border); border-radius:14px; background:var(--panel-2); color:var(--text); display:inline-flex; align-items:center; justify-content:center; gap:9px; padding:0 16px; font-weight:950; font-size:14px; cursor:pointer; white-space:nowrap; transition:.15s ease; }
    .btn:hover { transform:translateY(-1px); border-color:#5d8ef4; } .btn svg, .round-icon svg { width:19px; height:19px; stroke:currentColor; fill:none; stroke-width:2.2; stroke-linecap:round; stroke-linejoin:round; }
    .filter-btn { width:100%; color:#7fb2ff; border-color:rgba(59,130,246,.5); } .filter-btn b { min-width:22px; height:22px; border-radius:999px; display:grid; place-items:center; background:#2563eb; color:white; font-size:12px; }
    .icon-btn { width:54px; padding:0; } .search-btn, .btn.primary { color:white; border-color:transparent; background:linear-gradient(135deg,#3b82f6,#5145e9); box-shadow:0 14px 30px rgba(59,130,246,.25); }
    .active-filter-row { display:flex; flex-wrap:wrap; align-items:center; gap:9px; margin-top:13px; font-size:13px; color:var(--muted); }
    .active-filter-row strong { color:#6aa4ff; font-weight:950; } .chip { border:0; border-radius:999px; background:var(--soft); color:var(--text); padding:7px 12px; font-weight:800; cursor:pointer; } .chip span { color:var(--muted); margin-left:5px; } .clear-link { border:0; background:transparent; color:#6aa4ff; font-weight:900; cursor:pointer; }
    .filter-error { margin:12px 0 0; color:#ff8ca3; font-weight:900; }
    .register-card { overflow:hidden; }
    .register-header { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:20px 22px; border-bottom:1px solid var(--border); }
    .register-header h2 { margin:0; font-size:23px; letter-spacing:-.03em; } .register-header p { margin:5px 0 0; color:var(--muted); font-weight:800; }
    .register-tools { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:10px; } .tool-btn { height:42px; font-size:13.5px; } .page-select { width:130px; height:42px; }
    .table-scroll { overflow:auto; } .bill-table { width:100%; min-width:1120px; table-layout:fixed; border-collapse:collapse; }
    .bill-table .col-bill-no { width:110px; } .bill-table .col-date { width:120px; } .bill-table .col-patient-summary { width:340px; } .bill-table .col-money { width:100px; } .bill-table .col-due { width:115px; } .bill-table .col-payment { width:125px; } .bill-table .col-status { width:105px; } .bill-table .col-actions { width:112px; }
    .bill-table th { padding:14px 18px; border-bottom:1px solid var(--border); color:var(--muted); font-size:12px; letter-spacing:.055em; text-transform:uppercase; text-align:left; }
    .bill-table td { min-width:0; padding:16px 14px; border-bottom:1px solid var(--border); font-weight:850; vertical-align:middle; overflow:hidden; }
    .bill-table td small { display:block; margin-top:5px; color:var(--muted); font-size:12.5px; font-weight:750; }
    .bill-link { border:0; background:transparent; color:#6aa4ff; padding:0; font-weight:1000; cursor:pointer; } .muted { color:var(--muted); } .paid-text { color:#57d898; } .due-text { color:#ffb44d; } .excess-text { color:#c084fc; }
    .status-chip { display:inline-flex; align-items:center; border:1px solid rgba(96,165,250,.25); border-radius:999px; padding:7px 13px; background:rgba(96,165,250,.13); color:#93c5fd; font-weight:950; font-size:12.5px; white-space:nowrap; }
    .status-chip.paid { color:#65d99b; background:rgba(34,197,94,.15); border-color:rgba(34,197,94,.28); } .status-chip.partial { color:#fbbf64; background:rgba(245,158,11,.15); border-color:rgba(245,158,11,.28); } .status-chip.pending { color:#cbd5e1; background:rgba(148,163,184,.14); border-color:rgba(148,163,184,.25); } .status-chip.excess { color:#d8b4fe; background:rgba(168,85,247,.15); border-color:rgba(168,85,247,.28); } .status-chip.cancelled { color:#ff9caf; background:rgba(244,63,94,.14); border-color:rgba(244,63,94,.28); }
    .cell-stack { min-width:0; max-width:100%; } .cell-ellipsis { display:block; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .patient-summary-cell { min-width:0; display:grid; gap:4px; padding:2px 0; line-height:1.2; } .patient-primary { color:var(--text); font-size:14px; font-weight:1000; } .patient-meta { color:#79a9ff; font-size:12px; font-weight:900; } .patient-mobile { color:var(--muted); font-size:12px; font-weight:800; } .patient-consultant { color:var(--muted); font-size:10.5px; font-weight:750; letter-spacing:.005em; }
    .bill-link.cell-ellipsis { width:100%; text-align:left; }
    .actions-cell { text-align:center; overflow:visible !important; } .actions-trigger { min-width:92px; height:38px; display:inline-flex; align-items:center; justify-content:center; gap:8px; border:1px solid color-mix(in srgb,var(--brand) 35%,var(--border)); border-radius:12px; background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 12%,var(--panel-2)),var(--panel-2)); color:#70a6ff; font:inherit; font-size:12px; font-weight:950; cursor:pointer; box-shadow:0 8px 18px rgba(37,99,235,.10); transition:.18s ease; } .actions-trigger:hover { transform:translateY(-1px); border-color:#70a6ff; background:rgba(59,130,246,.12); box-shadow:0 10px 24px rgba(37,99,235,.18); } .actions-trigger-icon { letter-spacing:2px; font-size:13px; line-height:1; }
    .action-menu-head { width:300px; display:flex; align-items:center; gap:11px; padding:14px 14px 12px; border-bottom:1px solid var(--border); background:linear-gradient(135deg,rgba(59,130,246,.12),rgba(124,58,237,.08)); } .action-avatar { flex:0 0 40px; width:40px; height:40px; display:grid; place-items:center; border-radius:13px; background:linear-gradient(135deg,#3b82f6,#7c3aed); color:white; font-size:12px; font-weight:1000; box-shadow:0 8px 18px rgba(59,130,246,.24); } .action-menu-head div { min-width:0; flex:1; } .action-menu-head b { color:var(--text); font-size:13px; } .action-menu-head small { display:block; margin-top:4px; color:var(--muted); font-size:11px; font-weight:750; } .action-menu-grid { padding:7px; } .rich-menu-item { min-height:54px !important; border-radius:11px !important; margin:2px 0; } .rich-menu-item:hover { background:rgba(59,130,246,.10) !important; } .rich-menu-item > span:last-child { display:flex; align-items:center; min-width:0; } .rich-menu-item > span:last-child > span:last-child { min-width:0; } .rich-menu-item b,.rich-menu-item small { display:block; } .rich-menu-item b { color:var(--text); font-size:12.5px; font-weight:900; } .rich-menu-item small { margin-top:2px; color:var(--muted); font-size:10.5px; font-weight:700; } .menu-action-icon { display:inline-grid; flex:0 0 34px; width:34px; height:34px; margin-right:10px; place-items:center; border-radius:11px; background:rgba(59,130,246,.12); color:#70a6ff; font-size:17px; font-weight:900; } .menu-action-icon.edit-icon { color:#a78bfa; background:rgba(139,92,246,.12); } .menu-action-icon.warning-icon { color:#f59e0b; background:rgba(245,158,11,.12); } .menu-action-icon.danger-icon { color:#ef4444; background:rgba(239,68,68,.12); } .danger-menu-item:hover { background:rgba(239,68,68,.08) !important; }
    .empty-row { text-align:center; color:var(--muted); padding:30px!important; }
    .pagination-bar { display:flex; align-items:center; justify-content:center; gap:14px; padding:16px; } .page-btn { width:42px; height:42px; border-radius:14px; border:1px solid var(--border); background:var(--panel-2); color:var(--text); font-size:23px; cursor:pointer; } .page-btn:disabled { opacity:.35; cursor:not-allowed; }
    .modal-backdrop { position:fixed; inset:0; z-index:3000; display:grid; place-items:center; background:rgba(2,6,23,.72); backdrop-filter:blur(8px); padding:20px; }
    .pro-modal { width:min(620px,94vw); border:1px solid var(--border); border-radius:26px; background:var(--panel); color:var(--text); padding:22px; box-shadow:0 30px 80px rgba(0,0,0,.45); }
    .modal-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; } .modal-head h3 { margin:0; font-size:22px; letter-spacing:-.025em; } .modal-head p { margin:6px 0 0; color:var(--muted); font-weight:750; }
    .close-btn { border:1px solid var(--border); background:var(--panel-2); color:var(--text); width:38px; height:38px; border-radius:12px; font-size:22px; cursor:pointer; }
    .modal-grid { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:18px; }
    .multi-filter-grid { grid-template-columns:repeat(2,minmax(0,1fr)); align-items:start; }
    .multi-filter-group { border:1px solid var(--border); border-radius:18px; background:var(--panel-2); padding:14px; max-height:260px; overflow:auto; }
    .multi-filter-title { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; color:var(--muted); font-size:12.5px; font-weight:900; text-transform:uppercase; letter-spacing:.04em; }
    .multi-filter-title small { color:#6aa4ff; font-size:11.5px; font-weight:950; text-transform:none; letter-spacing:0; }
    .multi-filter-title button { border:0; background:transparent; color:#6aa4ff; font-weight:900; cursor:pointer; }
    .mini-search { position:relative; margin-bottom:9px; } .mini-search svg { position:absolute; left:11px; top:50%; transform:translateY(-50%); width:17px; height:17px; color:var(--muted); stroke:currentColor; fill:none; stroke-width:2.2; } .mini-search input { height:38px; padding-left:36px; border-radius:12px; font-size:13px; }
    .multi-filter-actions { display:flex; gap:8px; margin-bottom:8px; } .multi-filter-actions button { flex:1; height:30px; border:1px solid var(--border); border-radius:10px; background:var(--input); color:#6aa4ff; font-size:12px; font-weight:900; cursor:pointer; } .multi-filter-actions button:hover { border-color:#6aa4ff; }
    .option-list { max-height:145px; overflow:auto; padding-right:2px; } .list-empty { margin:12px 4px 4px; color:var(--muted); font-size:12.5px; font-weight:800; }
    .check-row { display:flex; align-items:center; gap:10px; padding:9px 8px; border-radius:12px; cursor:pointer; font-weight:800; color:var(--text); }
    .check-row:hover { background:var(--soft); }
    .check-row input { width:16px; height:16px; accent-color:var(--brand); }
    .check-row span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
     .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; } .btn.secondary { background:var(--panel-2); color:var(--text); } .btn.danger { background:#ef4444; color:white; border-color:transparent; }
    .summary-line { display:flex; justify-content:space-between; border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:12px 0; margin:14px 0; } .stacked { display:block; margin-top:12px; }
    .choice-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-top:18px; } .choice-card { text-align:left; border:1px solid var(--border); border-radius:18px; background:var(--panel-2); color:var(--text); padding:16px; cursor:pointer; } .choice-card:hover { border-color:#6aa4ff; } .choice-card b { display:block; margin-bottom:7px; font-size:16px; } .choice-card span { color:var(--muted); font-size:13px; font-weight:750; line-height:1.4; }
    @media(max-width:1200px){ .kpi-grid{grid-template-columns:repeat(2,1fr)} .filter-row{grid-template-columns:1fr 1fr 1fr} .filter-button-wrap,.icon-btn,.search-btn{width:100%;} }
    @media(max-width:760px){ .kpi-grid,.filter-row,.modal-grid,.choice-grid{grid-template-columns:1fr} .register-header{align-items:flex-start; flex-direction:column} .register-tools{justify-content:flex-start} }
  `]
})
export class StatementsPageComponent implements OnInit {
  @Output() editBill = new EventEmitter<number>();
  @Output() newBill = new EventEmitter<void>();

  today = new Date().toISOString().slice(0, 10);
  filters: any = { from: this.today, to: this.today, q: '', consultant_ids: [], status_list: [], payment_statuses: [], payment_modes: [] };
  draftFilters: any = { consultant_ids: [], status_list: [], payment_statuses: [], payment_modes: [] };
  draftSearch: any = { consultants: '', billStatus: '', paymentStatus: '', paymentMode: '' };
  billStatusOptions = [
    { value: 'BILLED', label: 'Active bills' },
    { value: 'CANCELLED', label: 'Cancelled bills' }
  ];
  paymentStatusOptions = [
    { value: 'PAID', label: 'Paid' },
    { value: 'PARTIAL', label: 'Partial' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'OVERPAID', label: 'Overpaid' }
  ];
  paymentModeOptions = ['Cash', 'UPI', 'Card', 'Bank Transfer'];
  consultants: any[] = [];
  statement = signal<any>(null);
  page = signal(1);
  pageSize = 10;
  filterModal = signal(false);
  cancelModal = signal<any>(null);
  deleteModal = signal<any>(null);
  statementTypeModal = signal<any>(null);
  filterError = signal('');
  cancelForm: any = { reason: '', refund_amount: 0, refund_mode: 'Cash' };

  async ngOnInit() {
    this.consultants = await window.limsApi.listConsultants();
    await this.loadStatement();
  }

  rawBills() { return this.statement()?.bills || []; }
  clientFilteredBills() {
    return this.rawBills().filter((b: any) => {
      const paymentStatuses = this.list(this.filters.payment_statuses);
      const paymentModes = this.list(this.filters.payment_modes);
      if (paymentStatuses.length && !paymentStatuses.includes(this.statusText(b).toUpperCase())) return false;
      if (paymentModes.length && !paymentModes.includes(String(b.payment_mode || ''))) return false;
      return true;
    });
  }
  visibleTotals() {
    return this.clientFilteredBills().reduce((a: any, b: any) => ({ total: a.total + (+b.total || 0), paid: a.paid + (+b.paid || 0), due: a.due + (+b.due || 0) }), { total: 0, paid: 0, due: 0 });
  }
  cancelledCount() { return this.clientFilteredBills().filter((b: any) => b.status === 'CANCELLED').length; }
  totalPages() { return Math.max(1, Math.ceil(this.clientFilteredBills().length / Number(this.pageSize || 10))); }
  pagedBills() { const start = (this.page() - 1) * Number(this.pageSize || 10); return this.clientFilteredBills().slice(start, start + Number(this.pageSize || 10)); }
  money(v: any) { return Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }); }
  excess(b: any) { return Math.max(0, (+b.paid || 0) - (+b.total || 0)); }
  statusText(b: any) { if (b.status === 'CANCELLED') return 'Cancelled'; if (this.excess(b) > 0) return 'Overpaid'; if ((+b.paid || 0) <= 0) return 'Pending'; if ((+b.paid || 0) >= (+b.total || 0)) return 'Paid'; return 'Partial'; }
  paymentStatusClass(b: any) { const s = this.statusText(b).toLowerCase(); return { paid: s === 'paid', partial: s === 'partial', pending: s === 'pending', excess: s === 'overpaid', cancelled: s === 'cancelled' }; }
  patientAgeGender(b: any) { const age = String(b?.age || b?.patient_age || '').trim(); const gender = String(b?.gender || b?.patient_gender || '').trim(); return [age || '-', gender || '-'].join(' / '); }
  patientSummaryTooltip(b: any) { return [b?.patient_name || '-', this.patientAgeGender(b), b?.mobile || b?.patient_no || '-', b?.consultant_name || 'No consultant'].join('\n'); }
  patientInitials(b: any) { const name = String(b?.patient_name || 'P').trim(); return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part.charAt(0).toUpperCase()).join('') || 'P'; }

  list(value: any): string[] { return Array.isArray(value) ? value.map(v => String(v)) : (value && value !== 'ALL' ? [String(value)] : []); }
  activeFilterCount() { return this.list(this.filters.consultant_ids).length + this.list(this.filters.status_list).length + this.list(this.filters.payment_statuses).length + this.list(this.filters.payment_modes).length; }
  consultantName(id: any) { if (String(id) === 'NONE') return 'No consultant'; return this.consultants.find(c => String(c.id) === String(id))?.name || 'Selected consultant'; }
  billStatusName(v: string) { return v === 'BILLED' ? 'Active' : v === 'CANCELLED' ? 'Cancelled' : v; }
  paymentStatusName(v: string) { return this.paymentStatusOptions.find(x => x.value === v)?.label || this.titleCase(v); }
  activeChips() {
    const chips: any[] = [];
    this.list(this.filters.consultant_ids).forEach(id => chips.push({ key: 'consultant_ids', value: id, label: `Consultant: ${this.consultantName(id)}` }));
    this.list(this.filters.status_list).forEach(v => chips.push({ key: 'status_list', value: v, label: `Bill Status: ${this.billStatusName(v)}` }));
    this.list(this.filters.payment_statuses).forEach(v => chips.push({ key: 'payment_statuses', value: v, label: `Payment: ${this.paymentStatusName(v)}` }));
    this.list(this.filters.payment_modes).forEach(v => chips.push({ key: 'payment_modes', value: v, label: `Mode: ${v}` }));
    return chips;
  }
  titleCase(v: string) { return String(v || '').toLowerCase().replace(/(^|\s)\w/g, s => s.toUpperCase()); }
  removeFilter(key: string, value?: any) { this.filters[key] = this.list(this.filters[key]).filter(v => String(v) !== String(value)); this.page.set(1); this.loadStatement(); }
  clearAdvancedFilters() { this.filters.consultant_ids = []; this.filters.status_list = []; this.filters.payment_statuses = []; this.filters.payment_modes = []; this.page.set(1); this.loadStatement(); }
  openFilterModal() {
    this.draftFilters = {
      consultant_ids: [...this.list(this.filters.consultant_ids)],
      status_list: [...this.list(this.filters.status_list)],
      payment_statuses: [...this.list(this.filters.payment_statuses)],
      payment_modes: [...this.list(this.filters.payment_modes)]
    };
    this.draftSearch = { consultants: '', billStatus: '', paymentStatus: '', paymentMode: '' };
    this.filterModal.set(true);
  }
  resetDraftFilters() { this.draftFilters = { consultant_ids: [], status_list: [], payment_statuses: [], payment_modes: [] }; }
  isDraftSelected(key: string, value: any) { return this.list(this.draftFilters[key]).includes(String(value)); }
  toggleDraftList(key: string, value: any) { const current = this.list(this.draftFilters[key]); const text = String(value); this.draftFilters[key] = current.includes(text) ? current.filter(v => v !== text) : [...current, text]; }
  selectAllDraft(key: string, values: any[]) {
    const existing = new Set(this.list(this.draftFilters[key]));
    values.map(v => String(v)).forEach(v => existing.add(v));
    this.draftFilters[key] = [...existing];
  }
  clearDraftList(key: string) { this.draftFilters[key] = []; }
  matchesText(value: any, query: string) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return true;
    return String(value || '').toLowerCase().includes(q);
  }
  filteredConsultants() {
    const q = String(this.draftSearch.consultants || '').trim().toLowerCase();
    if (!q) return this.consultants;
    return this.consultants.filter(c => [c.name, c.phone, c.clinic].some(v => String(v || '').toLowerCase().includes(q)));
  }
  visibleConsultantValues() {
    const values = this.filteredConsultants().map(c => c.id);
    if (this.matchesText('No consultant', this.draftSearch.consultants)) values.unshift('NONE');
    return values;
  }
  filteredBillStatusOptions() { return this.billStatusOptions.filter(x => this.matchesText(x.label, this.draftSearch.billStatus) || this.matchesText(x.value, this.draftSearch.billStatus)); }
  filteredBillStatusValues() { return this.filteredBillStatusOptions().map(x => x.value); }
  filteredPaymentStatusOptions() { return this.paymentStatusOptions.filter(x => this.matchesText(x.label, this.draftSearch.paymentStatus) || this.matchesText(x.value, this.draftSearch.paymentStatus)); }
  filteredPaymentStatusValues() { return this.filteredPaymentStatusOptions().map(x => x.value); }
  filteredPaymentModeOptions() { return this.paymentModeOptions.filter(m => this.matchesText(m, this.draftSearch.paymentMode)); }
  applyAdvancedFilters() { this.filters.consultant_ids = [...this.list(this.draftFilters.consultant_ids)]; this.filters.status_list = [...this.list(this.draftFilters.status_list)]; this.filters.payment_statuses = [...this.list(this.draftFilters.payment_statuses)]; this.filters.payment_modes = [...this.list(this.draftFilters.payment_modes)]; this.filterModal.set(false); this.page.set(1); this.loadStatement(); }

  selectedDays() { if (!this.filters.from || !this.filters.to) return 0; const a = new Date(this.filters.from + 'T00:00:00'); const b = new Date(this.filters.to + 'T00:00:00'); return Math.round((+b - +a) / 86400000) + 1; }
  validateDates() { this.filterError.set(''); if (!this.filters.from || !this.filters.to) { this.filterError.set('From and To date are required.'); return false; } if (new Date(this.filters.from) > new Date(this.filters.to)) { this.filterError.set('From date cannot be after To date.'); return false; } return true; }
  async loadStatement() { if (!this.validateDates()) return; this.page.set(1); const serverFilters = { from: this.filters.from, to: this.filters.to, q: this.filters.q, status_list: this.filters.status_list, consultant_ids: this.filters.consultant_ids, payment_statuses: this.filters.payment_statuses, payment_modes: this.filters.payment_modes }; this.statement.set(await window.limsApi.statement(serverFilters)); }
  clearFilters() { this.filters = { from: this.today, to: this.today, q: '', consultant_ids: [], status_list: [], payment_statuses: [], payment_modes: [] }; this.loadStatement(); }
  async statementExcel() { if (!this.validateDates()) return; window.limsApi.openPath(await window.limsApi.statementExcel(this.filters)); }
  async statementPdf(action: StatementAction) { if (!this.validateDates()) return; if (this.selectedDays() > 1) { this.statementTypeModal.set({ action }); return; } await this.runStatementPdf(action, 'detailed'); }
  async confirmStatementPdf(type: StatementKind) { const action = this.statementTypeModal()?.action || 'download'; this.statementTypeModal.set(null); await this.runStatementPdf(action, type); }
  async runStatementPdf(action: StatementAction, type: StatementKind) { const file = await window.limsApi.statementPdf({ ...this.filters, type, action }); await window.limsApi.openPath(file); }
  async printBill(b: any) { window.limsApi.openPath(await window.limsApi.billPdf(b.id, false)); }
  openCancel(b: any) { this.cancelForm = { reason: '', refund_amount: +b.paid || 0, refund_mode: 'Cash' }; this.cancelModal.set({ bill: b }); }
  async confirmCancel() { const bill = this.cancelModal()?.bill; if (!bill) return; try { await window.limsApi.cancelBill?.(bill.id, this.cancelForm); this.cancelModal.set(null); await this.loadStatement(); } catch (e: any) { alert(e?.message || 'Unable to cancel bill.'); } }
  openDelete(b: any) { if ((+b.paid || 0) > 0) { this.openCancel(b); return; } this.deleteModal.set({ bill: b }); }
  async confirmDelete() { const bill = this.deleteModal()?.bill; if (!bill) return; try { await window.limsApi.deleteBill?.(bill.id); this.deleteModal.set(null); await this.loadStatement(); } catch (e: any) { alert(e?.message || 'Unable to delete bill.'); } }
}
