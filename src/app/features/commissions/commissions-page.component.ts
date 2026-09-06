import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { dateRangePresets, matchesDateRange, openNativeDatePicker, DATE_RANGE_FILTER_STYLES } from '../../shared/date-range-filters';

@Component({
  selector: 'app-commissions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule],
  template: `
    <section class="commission-workspace">
      <div class="toolbar">
        <div class="date-range-filters" aria-label="Commission date filters">
          <label class="date-field"><input type="date" [(ngModel)]="filters.from" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (change)="load()"></label>
          <span class="range-arrow">→</span>
          <label class="date-field"><input type="date" [(ngModel)]="filters.to" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (change)="load()"></label>
          <button type="button" [class.active]="isTodayRange()" (click)="setDatePreset('today')">Today</button>
          <button type="button" [class.active]="isPreviousDayRange()" (click)="setDatePreset('previousDay')">Previous Day</button>
          <button type="button" [class.active]="isCurrentMonthRange()" (click)="setDatePreset('currentMonth')">Current Month</button>
          <button type="button" [class.active]="isLastMonthRange()" (click)="setDatePreset('lastMonth')">Last Month</button>
          <button type="button" [class.active]="isThirtyDayRange()" (click)="setDatePreset('thirtyDays')">30 Days</button>
          <button type="button" [class.active]="isCurrentYearRange()" (click)="setDatePreset('currentYear')">Current Year</button>
          <button type="button" [class.active]="isLastYearRange()" (click)="setDatePreset('lastYear')">Last Year</button>
        </div>
        <select [(ngModel)]="filters.consultant_id" (change)="load()"><option [ngValue]="0">All consultants</option><option *ngFor="let c of consultants()" [ngValue]="c.id">{{c.name}}</option></select>
        <select [(ngModel)]="filters.status" (change)="load()"><option value="ALL">All statuses</option><option value="GENERATED">Pending review</option><option value="APPROVED">Approved</option><option value="HELD">Held</option><option value="PAID">Paid</option><option value="CANCELLED">Reversed</option></select>
        <input class="search" [(ngModel)]="filters.search" (keyup.enter)="load()" placeholder="Search bill, patient, item...">
        <button class="btn secondary" (click)="load()">Refresh</button>
      </div>

      <mat-card class="data-card group-manager">
        <div class="panel-title">
          <div><h3>Commission Groups</h3><p>Reusable test/profile groups with cost-aware percentages, fixed rates, or validated formulas.</p></div>
          <button class="btn primary" (click)="newGroup()">+ New group</button>
        </div>
        <div class="group-grid">
          <button class="group-card" *ngFor="let g of groups()" (click)="editGroup(g)">
            <span class="status" [attr.data-status]="g.active ? 'APPROVED' : 'CANCELLED'">{{g.active ? 'Active' : 'Archived'}}</span>
            <b>{{g.name}}</b><small>{{groupMethodLabel(g)}} · {{g.items?.length || 0}} items · {{g.consultant_ids?.length || 0}} consultants</small>
          </button>
          <div class="empty" *ngIf="!groups().length">No commission groups yet. Create one to assign many tests/profiles together.</div>
        </div>
      </mat-card>

      <div class="summary-grid" *ngIf="!loading(); else summarySkeleton">
        <button class="summary-card" (click)="setStatus('ALL')"><span>Total payable</span><strong>{{money(totals().commission)}}</strong><small>{{totals().records || 0}} entries · {{totals().billCount || 0}} bills</small></button>
        <button class="summary-card pending" (click)="setStatus('GENERATED')"><span>Pending review</span><strong>{{money(totals().generated)}}</strong><small>Generated automatically</small></button>
        <button class="summary-card approved" (click)="setStatus('APPROVED')"><span>Approved</span><strong>{{money(totals().approved)}}</strong><small>Ready for settlement</small></button>
        <button class="summary-card held" (click)="setStatus('HELD')"><span>Held</span><strong>{{money(totals().held)}}</strong><small>Needs attention</small></button>
        <button class="summary-card paid" (click)="setStatus('PAID')"><span>Paid</span><strong>{{money(totals().paid)}}</strong><small>Settled commission</small></button>
        <button class="summary-card reversed" (click)="setStatus('CANCELLED')"><span>Reversed</span><strong>{{money(totals().cancelled)}}</strong><small>Cancelled bills</small></button>
      </div>
      <ng-template #summarySkeleton><div class="summary-grid"><div class="skeleton" *ngFor="let x of [1,2,3,4,5,6]"></div></div></ng-template>

      <mat-card class="data-card">
        <div class="panel-title">
          <div><h3>Commission Register</h3><p>Calculated silently from billed items. Nothing is shown or editable in Billing.</p></div>
          <div class="selection-actions" *ngIf="selectedIds().size">
            <span>{{selectedIds().size}} selected</span>
            <button class="btn secondary" (click)="changeStatus('HELD')">Hold</button>
            <button class="btn primary" (click)="changeStatus('APPROVED')">Approve</button>
            <button class="btn success" (click)="openSettlement()">Settle</button>
          </div>
        </div>

        <div class="table-wrap" *ngIf="!loading(); else rowsSkeleton">
          <table>
            <thead><tr><th><input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAll($event)"></th><th>Date / Bill</th><th>Consultant</th><th>Patient</th><th>Test / Profile</th><th>Profile</th><th class="num">Net</th><th class="num">Commission</th><th>Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of pagedRows()" [class.cancelled]="r.commission_status==='CANCELLED'">
                <td><input type="checkbox" [disabled]="r.commission_status==='PAID' || r.commission_status==='CANCELLED'" [checked]="selectedIds().has(r.id)" (change)="toggleRow(r.id,$event)"></td>
                <td><b>{{localDate(r.bill_date)}}</b><small>{{r.bill_no}}</small></td>
                <td><b>{{r.consultant_name || 'No consultant'}}</b><small>{{r.consultant_clinic}}</small></td>
                <td>{{r.patient_name || '-'}}</td>
                <td><b>{{r.item_name}}</b><small>{{r.item_type}} · Qty {{r.quantity}}</small></td>
                <td>{{r.commission_profile_name || '-' }}<small>{{r.commission_rule_source}}</small></td>
                <td class="num">{{money(r.net_amount)}}</td>
                <td class="num emph">{{money(r.commission_amount)}}</td>
                <td><span class="status" [attr.data-status]="r.commission_status">{{statusLabel(r.commission_status)}}</span><small *ngIf="r.commission_hold_reason">{{r.commission_hold_reason}}</small></td>
              </tr>
              <tr *ngIf="!rows().length"><td colspan="9" class="empty">No commission entries for the selected period.</td></tr>
            </tbody>
          </table>
        </div>
        <ng-template #rowsSkeleton><div class="row-skeleton" *ngFor="let x of [1,2,3,4,5,6,7]"></div></ng-template>

        <div class="footer">
          <span>Showing {{pageStart()}}–{{pageEnd()}} of {{rows().length}}</span>
          <div class="pager"><label>Rows <select [(ngModel)]="pageSize" (change)="page.set(1)"><option [ngValue]="10">10</option><option [ngValue]="25">25</option><option [ngValue]="50">50</option><option [ngValue]="100">100</option></select></label><button (click)="page.set(page()-1)" [disabled]="page()<=1">‹</button><b>{{page()}} / {{totalPages()}}</b><button (click)="page.set(page()+1)" [disabled]="page()>=totalPages()">›</button></div>
        </div>
      </mat-card>

      <mat-card class="data-card settlement-card">
        <div class="panel-title"><div><h3>Settlement History</h3><p>One settlement groups approved entries for a single consultant.</p></div><span class="status-pill">{{settlements().length}}</span></div>
        <div class="settlement-list"><div class="settlement-row" *ngFor="let s of settlements()"><div><b>{{s.settlement_no}}</b><small>{{localDateTime(s.settlement_date)}}</small></div><div><b>{{s.consultant_name}}</b><small>{{s.item_count}} items</small></div><div><b>{{s.payment_mode}}</b><small>{{s.reference_no || 'No reference'}}</small></div><strong>{{money(s.amount)}}</strong></div><div class="empty" *ngIf="!settlements().length">No settlements in this period.</div></div>
      </mat-card>
    </section>

    <dialog #groupDialog class="app-modal-backdrop" *ngIf="groupModal()" (click)="onGroupBackdropClick($event)" (cancel)="$event.preventDefault(); requestCloseGroup()">
      <section class="modal group-modal" role="document" aria-label="Commission group master" (click)="$event.stopPropagation()">
        <div class="modal-head"><div><small>COMMISSION GROUP MASTER</small><h2>{{groupForm.id ? 'Edit' : 'Create'}} commission group</h2></div><button type="button" aria-label="Close" (click)="requestCloseGroup()">×</button></div>
        <div class="modal-body group-form">
          <label><span>Group name</span><input [(ngModel)]="groupForm.name" placeholder="Routine Biochemistry"></label>
          <label><span>Code</span><input [(ngModel)]="groupForm.code" placeholder="BIO-ROUTINE"></label>
          <label><span>Calculation</span><select [(ngModel)]="groupForm.calculation_type" (change)="formulaState=''">
            <option value="PERCENT_NET">% of net amount</option><option value="PERCENT_PROFIT">% of profit</option><option value="PERCENT_GROSS">% of selling price</option><option value="FIXED">Fixed per quantity</option><option value="FORMULA">Custom formula</option>
          </select></label>
          <label *ngIf="groupForm.calculation_type!=='FORMULA' && groupForm.calculation_type!=='FIXED'"><span>Rate %</span><input type="number" [(ngModel)]="groupForm.rate"></label>
          <label *ngIf="groupForm.calculation_type==='FIXED'"><span>Fixed amount</span><input type="number" [(ngModel)]="groupForm.fixed_amount"></label>
          <label><span>Minimum commission</span><input type="number" [(ngModel)]="groupForm.min_commission"></label>
          <label><span>Maximum commission</span><input type="number" [(ngModel)]="groupForm.max_commission"></label>
          <label><span>Effective from</span><input type="date" [(ngModel)]="groupForm.effective_from"></label>
          <label><span>Effective to</span><input type="date" [(ngModel)]="groupForm.effective_to"></label>
          <label class="wide" *ngIf="groupForm.calculation_type==='FORMULA'"><span>Formula expression</span><textarea rows="3" [(ngModel)]="groupForm.formula_expression" placeholder="MAX(PROFIT * 20 / 100, 50)"></textarea><small>Variables: SELLING_PRICE, NET_AMOUNT, TEST_COST, PROFIT, DISCOUNT, QUANTITY, COLLECTED_AMOUNT, DUE_AMOUNT. Functions: MIN, MAX, ABS, ROUND.</small></label>
          <div class="wide formula-actions" *ngIf="groupForm.calculation_type==='FORMULA'"><button class="btn secondary" (click)="validateGroupFormula()">Validate & test</button><span [class.ok]="formulaState==='valid'" [class.bad]="formulaState==='invalid'">{{formulaMessage}}</span></div>
          <label class="wide"><span>Description</span><textarea rows="2" [(ngModel)]="groupForm.description"></textarea></label>
          <div class="wide split-picker">
            <section class="commission-item-selector">
              <div class="selector-title-row">
                <div><h4>Tests and profiles</h4><small>Search and select items using the same compact flow as Billing.</small></div>
                <span class="selected-count">{{selectedGroupItemCount()}} selected</span>
              </div>
              <div class="billing-like-search">
                <span class="search-glyph" aria-hidden="true">⌕</span>
                <input [(ngModel)]="itemSearch" (focus)="itemSearchOpen=true" (input)="itemSearchOpen=true" placeholder="Search tests or profiles..." autocomplete="off">
                <button type="button" class="search-clear" *ngIf="itemSearch" (click)="itemSearch=''; itemSearchOpen=true">×</button>
              </div>
              <div class="selector-filters">
                <button type="button" [class.active]="itemTypeFilter==='ALL'" (click)="itemTypeFilter='ALL'">All</button>
                <button type="button" [class.active]="itemTypeFilter==='TEST'" (click)="itemTypeFilter='TEST'">Tests</button>
                <button type="button" [class.active]="itemTypeFilter==='PROFILE'" (click)="itemTypeFilter='PROFILE'">Profiles</button>
                <button type="button" class="select-visible" (click)="toggleAllVisibleGroupItems()">{{allVisibleGroupItemsSelected() ? 'Clear visible' : 'Select visible'}}</button>
              </div>
              <div class="billing-like-results">
                <div class="result-info"><span>{{filteredGroupItems().length}} result{{filteredGroupItems().length===1 ? '' : 's'}}</span><span>Click a row to select</span></div>
                <button type="button" class="billing-like-row" *ngFor="let x of filteredGroupItems(); trackBy: trackGroupItem" [class.selected]="groupHasItem(x)" (click)="toggleGroupItemDirect(x)">
                  <span class="compact-check" [class.checked]="groupHasItem(x)"><span>✓</span></span>
                  <span class="item-copy"><span class="item-title"><b>{{x.name}}</b><em [attr.data-kind]="x.item_type">{{x.item_type}}</em></span><small>{{groupItemDescription(x)}}</small></span>
                  <span class="item-cost"><small>Cost</small><b>{{money(x.running_cost || 0)}}</b></span>
                </button>
                <div class="selector-empty" *ngIf="!filteredGroupItems().length"><b>No matching tests or profiles</b><span>Try a name, code, category, or item type.</span></div>
              </div>
              <div class="selected-item-chips" *ngIf="selectedGroupItemCount()">
                <button type="button" *ngFor="let x of selectedGroupItems(); trackBy: trackGroupItem" (click)="toggleGroupItemDirect(x)" title="Remove item"><span>{{x.name}}</span><b>×</b></button>
              </div>
            </section>
            <section><h4>Assign consultants</h4><div class="pick-list consultant-pick-list"><label *ngFor="let c of consultants()"><input type="checkbox" [checked]="groupHasConsultant(c.id)" (change)="toggleGroupConsultant(c.id,$event)"><span>{{c.name}}<small>{{c.clinic || 'No clinic'}}</small></span></label></div></section>
          </div>
        </div>
        <div class="modal-foot"><div class="modal-foot-summary"><b>{{selectedGroupItemCount()}} item{{selectedGroupItemCount()===1 ? '' : 's'}} selected</b><small>{{(groupForm.consultant_ids || []).length}} consultant{{(groupForm.consultant_ids || []).length===1 ? '' : 's'}} assigned</small></div><div class="modal-foot-actions"><button class="btn secondary" (click)="requestCloseGroup()">Cancel</button><button class="btn secondary danger-outline" *ngIf="groupForm.id" (click)="deleteGroup()">Archive/Delete</button><button class="btn primary" [disabled]="saving()" (click)="saveGroup()">{{saving() ? 'Saving…' : 'Save group'}}</button></div></div>
      </section>
    </dialog>

    <dialog #settlementDialog class="app-modal-backdrop" *ngIf="settlementModal()" (click)="onSettlementBackdropClick($event)" (cancel)="$event.preventDefault(); closeSettlement()">
      <section class="modal settlement-modal" role="document" aria-label="Commission settlement" (click)="$event.stopPropagation()">
        <div class="modal-head"><div><small>COMMISSION SETTLEMENT</small><h2>Pay selected commission</h2></div><button (click)="closeSettlement()">×</button></div>
        <div class="modal-summary"><span>Consultant<strong>{{selectedConsultantName()}}</strong></span><span>Entries<strong>{{selectedIds().size}}</strong></span><span>Amount<strong>{{money(selectedAmount())}}</strong></span></div>
        <div class="modal-body"><label>Payment mode<select [(ngModel)]="settlement.payment_mode"><option>Cash</option><option>Bank Transfer</option><option>UPI</option><option>Cheque</option></select></label><label>Reference number<input [(ngModel)]="settlement.reference_no" placeholder="Optional"></label><label class="wide">Notes<textarea [(ngModel)]="settlement.notes" rows="3" placeholder="Optional settlement note"></textarea></label></div>
        <div class="modal-foot"><button class="btn secondary" (click)="closeSettlement()">Cancel</button><button class="btn success" [disabled]="saving()" (click)="settle()">{{saving() ? 'Creating settlement…' : 'Confirm & mark paid'}}</button></div>
      </section>
    </dialog>

    <dialog #popupDialog class="rich-popup-dialog" *ngIf="popupOpen() && popup()" (click)="onPopupBackdropClick($event)" (cancel)="$event.preventDefault(); popup()?.showCancel !== false && resolvePopup(false)">
      <section class="rich-dialog-card" role="document" (click)="$event.stopPropagation()">
        <div class="rich-dialog-icon" [attr.data-tone]="popup()?.tone || 'info'">{{popup()?.tone==='success' ? '✓' : popup()?.tone==='info' ? 'i' : '!'}}</div>
        <div class="rich-dialog-copy"><h3>{{popup()?.title}}</h3><p>{{popup()?.message}}</p><small *ngIf="popup()?.details">{{popup()?.details}}</small></div>
        <label class="rich-dialog-input" *ngIf="popup()?.input"><span>{{popup()?.inputLabel || 'Reason'}}</span><textarea rows="3" [(ngModel)]="popupValue" [placeholder]="popup()?.inputPlaceholder || ''"></textarea></label>
        <div class="rich-dialog-actions"><button *ngIf="popup()?.showCancel !== false" class="btn secondary" type="button" (click)="resolvePopup(false)">{{popup()?.cancelText || 'Cancel'}}</button><button class="btn primary" [class.danger-btn]="popup()?.tone==='danger'" type="button" (click)="resolvePopup(true)" [disabled]="popup()?.input && !popupValue.trim()">{{popup()?.confirmText || 'Continue'}}</button></div>
      </section>
    </dialog>
  `,
  styles: [`
    .commission-workspace{display:grid;gap:16px}.toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.date-field{display:grid;gap:4px}.date-field span{font-size:11px;font-weight:900;color:var(--muted)}input,select,textarea{border:1px solid var(--border);background:var(--input,var(--surface-2));color:var(--text);border-radius:11px;padding:0 11px;font-weight:750}.toolbar input,.toolbar select{height:40px}.search{min-width:220px;flex:1}.arrow{padding-bottom:10px;color:var(--muted)}.summary-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}.summary-card,.skeleton{min-height:112px;border:1px solid var(--border);border-radius:18px;background:var(--surface);padding:15px;text-align:left;color:var(--text)}.summary-card{cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.summary-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.14)}.summary-card span{display:block;color:var(--muted);font-size:12px;font-weight:900}.summary-card strong{display:block;font-size:25px;margin:7px 0}.summary-card small{color:var(--muted)}.summary-card.pending{border-top:3px solid #f59e0b}.summary-card.approved{border-top:3px solid #22c55e}.summary-card.held{border-top:3px solid #a855f7}.summary-card.paid{border-top:3px solid #06b6d4}.summary-card.reversed{border-top:3px solid #ef4444}.skeleton,.row-skeleton{background:linear-gradient(90deg,var(--surface) 20%,var(--surface-2) 45%,var(--surface) 70%);background-size:220% 100%;animation:shimmer 1.2s infinite}.data-card{padding:0;border-radius:20px;overflow:hidden}.panel-title{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)}.panel-title h3{margin:0}.panel-title p{margin:4px 0 0;color:var(--muted)}.selection-actions{display:flex;align-items:center;gap:8px}.table-wrap{overflow:auto;max-height:520px}table{width:100%;border-collapse:collapse;min-width:1120px}th,td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left}th{position:sticky;top:0;background:var(--surface);z-index:2;color:var(--muted);font-size:11px;text-transform:uppercase}td small{display:block;color:var(--muted);margin-top:3px}.num{text-align:right}.emph{font-weight:950}.cancelled{opacity:.58}.status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950;background:var(--surface-2)}.status[data-status="APPROVED"]{color:#16a34a}.status[data-status="HELD"]{color:#9333ea}.status[data-status="PAID"]{color:#0891b2}.status[data-status="CANCELLED"]{color:#dc2626}.footer{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--border);color:var(--muted)}.pager{display:flex;align-items:center;gap:8px}.pager select{height:34px}.pager button{width:34px;height:34px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--text)}.row-skeleton{height:48px;margin:8px 14px;border-radius:12px}.settlement-list{padding:10px 16px}.settlement-row{display:grid;grid-template-columns:1.1fr 1.2fr 1fr auto;gap:14px;align-items:center;padding:11px 0;border-bottom:1px solid var(--border)}.settlement-row small{display:block;color:var(--muted)}.empty{text-align:center;color:var(--muted);padding:28px}dialog.app-modal-backdrop,dialog.rich-popup-dialog{display:none!important}dialog.app-modal-backdrop[open],dialog.rich-popup-dialog[open]{display:grid!important;place-items:center!important}dialog.app-modal-backdrop{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;background:transparent!important;padding:24px!important;box-sizing:border-box!important;overflow:hidden!important;color:var(--text)}dialog.app-modal-backdrop::backdrop{background:rgba(2,6,23,.76);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}.modal{width:min(760px,calc(100vw - 48px));max-height:calc(100vh - 48px);background:var(--panel,var(--surface));color:var(--text);border:1px solid var(--border);border-radius:24px;box-shadow:0 32px 100px rgba(0,0,0,.5);overflow:hidden}.modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)}.modal-foot{border-bottom:0;border-top:1px solid var(--border);justify-content:flex-end}.modal-head h2{margin:2px 0}.modal-head small{color:var(--muted);font-weight:900}.modal-head button{border:0;background:transparent;color:var(--text);font-size:26px}.modal-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 18px;background:var(--surface-2)}.modal-summary span{color:var(--muted);font-size:12px}.modal-summary strong{display:block;color:var(--text);font-size:18px;margin-top:4px}.modal-body{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px}.modal-body label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.modal-body input,.modal-body select{height:42px}.modal-body textarea{padding:10px}.modal-body .wide{grid-column:1/-1}.commission-item-selector{min-width:0}.selector-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.selector-title-row h4{margin:0}.selector-title-row small{display:block;color:var(--muted);margin-top:4px}.selected-count{flex:0 0 auto;border:1px solid color-mix(in srgb,#6366f1 55%,var(--border));background:color-mix(in srgb,#6366f1 12%,var(--surface));color:var(--text);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950}.billing-like-search{position:relative;display:flex;align-items:center}.billing-like-search input{width:100%;height:46px;padding:0 44px 0 42px;border-radius:14px;font-size:13px}.search-glyph{position:absolute;left:14px;z-index:2;color:var(--muted);font-size:20px}.search-clear{position:absolute;right:9px;width:30px;height:30px;border:0;border-radius:9px;background:var(--surface-2);color:var(--text);font-size:20px}.selector-filters{display:flex;gap:7px;align-items:center;margin:9px 0;flex-wrap:wrap}.selector-filters button{height:32px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);color:var(--muted);font-size:11px;font-weight:900}.selector-filters button.active{background:linear-gradient(135deg,#2563eb,#6d4aff);color:#fff;border-color:transparent}.selector-filters .select-visible{margin-left:auto;color:var(--text)}.billing-like-results{border:1px solid var(--border);border-radius:15px;background:var(--surface-2);overflow:auto;max-height:330px}.result-info{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:12px;padding:8px 11px;border-bottom:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:10px;font-weight:850}.billing-like-row{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) 94px;align-items:center;gap:10px;min-height:58px;padding:9px 11px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);text-align:left;cursor:pointer;transition:background .14s ease,border-color .14s ease}.billing-like-row:last-of-type{border-bottom:0}.billing-like-row:hover{background:color-mix(in srgb,#6366f1 10%,var(--surface))}.billing-like-row.selected{background:linear-gradient(90deg,color-mix(in srgb,#4f46e5 28%,var(--surface)),color-mix(in srgb,#2563eb 12%,var(--surface)));box-shadow:inset 3px 0 #6366f1}.compact-check{width:21px;height:21px;border:2px solid color-mix(in srgb,var(--muted) 55%,transparent);border-radius:6px;display:grid;place-items:center;background:var(--surface)}.compact-check span{opacity:0;color:#fff;font-size:13px;font-weight:950}.compact-check.checked{border-color:#6366f1;background:#6366f1}.compact-check.checked span{opacity:1}.item-copy{min-width:0;display:grid;gap:4px}.item-title{min-width:0;display:flex;align-items:center;gap:8px}.item-title b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.item-title em{flex:0 0 auto;font-style:normal;border:1px solid color-mix(in srgb,#8b5cf6 40%,var(--border));background:color-mix(in srgb,#8b5cf6 12%,var(--surface));color:color-mix(in srgb,#8b5cf6 75%,var(--text));border-radius:999px;padding:3px 7px;font-size:9px;font-weight:950}.item-title em[data-kind="PROFILE"]{border-color:color-mix(in srgb,#06b6d4 45%,var(--border));background:color-mix(in srgb,#06b6d4 12%,var(--surface));color:color-mix(in srgb,#06b6d4 72%,var(--text))}.item-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10.5px}.item-cost{display:grid;justify-items:end;gap:2px}.item-cost small{color:var(--muted);font-size:9px;text-transform:uppercase}.item-cost b{font-size:11px}.selector-empty{padding:24px;text-align:center;display:grid;gap:5px;color:var(--muted)}.selector-empty b{color:var(--text)}.selected-item-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;max-height:76px;overflow:auto}.selected-item-chips button{display:flex;align-items:center;gap:7px;max-width:220px;border:1px solid color-mix(in srgb,#6366f1 38%,var(--border));background:color-mix(in srgb,#6366f1 10%,var(--surface));color:var(--text);border-radius:999px;padding:5px 9px;font-size:10px;font-weight:850}.selected-item-chips button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selected-item-chips button b{font-size:14px}.consultant-pick-list input[type="checkbox"]{width:18px;height:18px;accent-color:#6366f1}.group-modal{width:calc(100vw - 48px);height:calc(100vh - 48px);max-width:none;max-height:none;display:flex;flex-direction:column}.group-modal .modal-head{flex:0 0 auto}.group-modal .modal-body{overflow:auto;flex:1 1 auto}.group-modal .modal-foot{flex:0 0 auto;justify-content:space-between;gap:16px}.modal-foot-summary{display:grid;gap:3px}.modal-foot-summary small{color:var(--muted)}.modal-foot-actions{display:flex;gap:9px;align-items:center}.danger-outline{border-color:rgba(239,68,68,.45)!important;color:#ef4444!important}.settlement-modal{width:min(760px,calc(100vw - 48px));display:flex;flex-direction:column}dialog.rich-popup-dialog{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;padding:24px!important;box-sizing:border-box!important;overflow:hidden!important;background:transparent!important;color:var(--text);display:grid!important;place-items:center!important}dialog.rich-popup-dialog::backdrop{background:rgba(2,6,23,.76);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}.rich-dialog-card{width:min(540px,92vw);display:grid;grid-template-columns:58px 1fr;gap:16px;padding:22px;border:1px solid var(--border);border-radius:26px;background:var(--panel,var(--surface));color:var(--text);box-shadow:0 28px 90px rgba(0,0,0,.42);animation:popIn .16s ease-out}.rich-dialog-icon{width:54px;height:54px;border-radius:20px;display:grid;place-items:center;font-size:24px;font-weight:950;background:rgba(245,158,11,.16);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}.rich-dialog-icon[data-tone="danger"]{background:rgba(239,68,68,.15);color:#ef4444;border-color:rgba(239,68,68,.28)}.rich-dialog-icon[data-tone="info"]{background:var(--accent-soft);color:var(--accent);border-color:var(--border)}.rich-dialog-icon[data-tone="success"]{background:rgba(16,185,129,.15);color:#10b981;border-color:rgba(16,185,129,.28)}.rich-dialog-copy h3{margin:0 0 8px;font-size:20px}.rich-dialog-copy p{margin:0;color:var(--muted);line-height:1.5}.rich-dialog-copy small{display:block;margin-top:8px;color:var(--muted)}.rich-dialog-input{grid-column:1/-1;display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.rich-dialog-input textarea{padding:10px;min-height:86px}.rich-dialog-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px}.danger-btn{background:linear-gradient(135deg,#ef4444,#f97316)!important;border-color:transparent!important;color:#fff!important}@keyframes popIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}@media(max-width:850px){dialog.app-modal-backdrop{padding:10px!important}.split-picker{grid-template-columns:1fr!important}.billing-like-row{grid-template-columns:26px minmax(0,1fr) 78px}.selector-filters .select-visible{margin-left:0}.group-modal{width:calc(100vw - 20px);height:calc(100vh - 20px);border-radius:18px}.modal-foot{align-items:flex-start;flex-direction:column}.modal-foot-actions{width:100%;justify-content:flex-end;flex-wrap:wrap}}.btn.success{background:#16a34a;color:#fff;border-color:#16a34a}@keyframes shimmer{to{background-position:-220% 0}}@media(max-width:1200px){.summary-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.summary-grid{grid-template-columns:1fr 1fr}.panel-title,.footer{align-items:flex-start;flex-direction:column}.settlement-row{grid-template-columns:1fr 1fr}.modal-summary,.modal-body{grid-template-columns:1fr}.modal-body .wide{grid-column:auto}}
    ${DATE_RANGE_FILTER_STYLES}
  `]
})
export class CommissionsPageComponent implements OnInit, OnDestroy {
  @ViewChild('groupDialog') groupDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('settlementDialog') settlementDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('popupDialog') popupDialog?: ElementRef<HTMLDialogElement>;
  consultants = signal<any[]>([]); rows = signal<any[]>([]); totals = signal<any>({}); settlements = signal<any[]>([]);
  groups=signal<any[]>([]); tests=signal<any[]>([]); profiles=signal<any[]>([]); groupModal=signal(false); popup=signal<any>(null); popupOpen=signal(false); popupValue=''; private popupResolver:((value:any)=>void)|null=null; private popupSequence=0; itemSearch=''; itemTypeFilter:'ALL'|'TEST'|'PROFILE'='ALL'; itemSearchOpen=false; formulaState=''; formulaMessage=''; groupForm:any={};
  loading=signal(false); saving=signal(false); page=signal(1); pageSize=25; settlementModal=signal(false); selectedIds=signal<Set<number>>(new Set());
  filters:any={from:'',to:'',consultant_id:0,status:'ALL',search:''}; settlement:any={payment_mode:'Cash',reference_no:'',notes:''};
  totalPages=computed(()=>Math.max(1,Math.ceil(this.rows().length/this.pageSize)));
  pagedRows=computed(()=>this.rows().slice((this.page()-1)*this.pageSize,this.page()*this.pageSize));
  pageStart=computed(()=>this.rows().length?(this.page()-1)*this.pageSize+1:0); pageEnd=computed(()=>Math.min(this.page()*this.pageSize,this.rows().length));
  async ngOnInit(){ this.resetPopupState(); this.currentMonth(false); this.consultants.set(await window.limsApi.listConsultants()); this.tests.set(await window.limsApi.listTests(false)); this.profiles.set(await window.limsApi.listProfiles(false)); this.groups.set(await window.limsApi.listCommissionGroups?.() || []); await this.load(); }
  currentMonth(reload=true){const range=dateRangePresets().currentMonth;this.filters.from=range.from;this.filters.to=range.to;if(reload)this.load();}
  openDatePicker(event: Event) { openNativeDatePicker(event); }
  setDatePreset(key: keyof ReturnType<typeof dateRangePresets>) { const range = dateRangePresets()[key]; this.filters.from = range.from; this.filters.to = range.to; this.load(); }
  private matchesPreset(key: keyof ReturnType<typeof dateRangePresets>) { return matchesDateRange(this.filters.from, this.filters.to, dateRangePresets()[key]); }
  isTodayRange() { return this.matchesPreset('today'); }
  isPreviousDayRange() { return this.matchesPreset('previousDay'); }
  isCurrentMonthRange() { return this.matchesPreset('currentMonth'); }
  isLastMonthRange() { return this.matchesPreset('lastMonth'); }
  isThirtyDayRange() { return this.matchesPreset('thirtyDays'); }
  isCurrentYearRange() { return this.matchesPreset('currentYear'); }
  isLastYearRange() { return this.matchesPreset('lastYear'); }
  async load(){this.loading.set(true);try{const api=window.limsApi;if(!api.listCommissions)return;const data=await api.listCommissions(this.filters);this.rows.set(data?.rows||[]);this.totals.set(data?.totals||{});this.settlements.set(await api.listCommissionSettlements?.({from:this.filters.from,to:this.filters.to})||[]);this.page.set(1);this.selectedIds.set(new Set());}finally{this.loading.set(false);}}
  setStatus(s:string){this.filters.status=s;this.load();}
  money(v:any){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(v||0));}
  localDate(v:any){if(!v)return '-';const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB');}
  localDateTime(v:any){if(!v)return '-';const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-IN');}
  statusLabel(s:string){return ({GENERATED:'Pending review',APPROVED:'Approved',HELD:'Held',PAID:'Paid',CANCELLED:'Reversed'} as any)[s]||s;}
  toggleRow(id:number,e:any){const x=new Set(this.selectedIds());e.target.checked?x.add(id):x.delete(id);this.selectedIds.set(x);}
  toggleAll(e:any){const x=new Set(this.selectedIds());for(const r of this.pagedRows()){if(r.commission_status!=='PAID'&&r.commission_status!=='CANCELLED')e.target.checked?x.add(r.id):x.delete(r.id);}this.selectedIds.set(x);}
  allVisibleSelected(){const eligible=this.pagedRows().filter(r=>r.commission_status!=='PAID'&&r.commission_status!=='CANCELLED');return !!eligible.length&&eligible.every(r=>this.selectedIds().has(r.id));}
  async changeStatus(status:string){const ids=[...this.selectedIds()];let reason='';if(status==='HELD'){const result=await this.ask({title:'Hold selected commissions',message:'Enter the reason for placing these commission entries on hold.',tone:'warning',confirmText:'Place on hold',cancelText:'Cancel',input:true,inputLabel:'Hold reason',inputPlaceholder:'Reason for hold'});if(!result)return;reason=String(result);}await window.limsApi.updateCommissionStatus?.({ids,status,reason,filters:this.filters});await this.load();}
  selectedRows(){return this.rows().filter(r=>this.selectedIds().has(r.id));}
  selectedAmount(){return this.selectedRows().reduce((s,r)=>s+Number(r.commission_amount||0),0);}
  selectedConsultantName(){const names=[...new Set(this.selectedRows().map(r=>r.consultant_name).filter(Boolean))];return names.length===1?names[0]:names.length?`${names.length} consultants`:'-';}
  async openSettlement(){const rows=this.selectedRows();if(!rows.length)return;const consultants=new Set(rows.map(r=>Number(r.consultant_id||0)));if(consultants.size!==1){await this.notify('Select one consultant','Choose commission entries belonging to one consultant only.','warning');return;}if(rows.some(r=>r.commission_status!=='APPROVED')){await this.notify('Approval required','Only approved commission entries can be settled.','warning');return;}this.settlementModal.set(true);setTimeout(()=>this.settlementDialog?.nativeElement.showModal(),0);}
  closeSettlement(){const d=this.settlementDialog?.nativeElement;if(d?.open)d.close();this.settlementModal.set(false);this.settlement={payment_mode:'Cash',reference_no:'',notes:''};}
  onSettlementBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.closeSettlement();}
  async settle(){this.saving.set(true);try{await window.limsApi.settleCommissions?.({ids:[...this.selectedIds()],...this.settlement});this.closeSettlement();await this.load();}catch(e:any){await this.notify('Settlement failed',e?.message||String(e),'danger');}finally{this.saving.set(false);}}
  blankGroup(){return {name:'',code:'',description:'',calculation_type:'PERCENT_NET',rate:10,fixed_amount:0,formula_type:'CUSTOM',formula_expression:'PROFIT * 20 / 100',discount_basis:'AFTER_DISCOUNT',profile_mode:'PROFILE_ONLY',min_commission:0,max_commission:0,effective_from:'',effective_to:'',active:true,items:[],consultant_ids:[]};}
  newGroup(){this.groupForm=this.blankGroup();this.itemSearch='';this.itemTypeFilter='ALL';this.itemSearchOpen=false;this.formulaState='';this.formulaMessage='';this.groupModal.set(true);setTimeout(()=>this.groupDialog?.nativeElement.showModal(),0);}
  editGroup(g:any){this.groupForm=JSON.parse(JSON.stringify(g));this.groupForm.items=this.groupForm.items||[];this.groupForm.consultant_ids=this.groupForm.consultant_ids||[];this.itemSearch='';this.itemTypeFilter='ALL';this.itemSearchOpen=false;this.formulaState='';this.formulaMessage='';this.groupModal.set(true);setTimeout(()=>this.groupDialog?.nativeElement.showModal(),0);}
  closeGroup(){const d=this.groupDialog?.nativeElement;if(d?.open)d.close();this.groupModal.set(false);this.itemSearchOpen=false;this.groupForm={};}
  onGroupBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.requestCloseGroup();}
  async requestCloseGroup(){if(!this.groupModal())return;const dirty=!!(String(this.groupForm?.name||'').trim()||(this.groupForm?.items||[]).length||(this.groupForm?.consultant_ids||[]).length);if(dirty){const ok=await this.ask({title:'Discard commission group changes?',message:'Your unsaved group configuration will be lost.',tone:'warning',confirmText:'Discard changes',cancelText:'Keep editing'});if(!ok)return;}this.closeGroup();}
  groupMethodLabel(g:any){const x=String(g.calculation_type||'');return ({PERCENT_NET:`${g.rate||0}% net`,PERCENT_PROFIT:`${g.rate||0}% profit`,PERCENT_GROSS:`${g.rate||0}% selling`,FIXED:`${this.money(g.fixed_amount||0)} fixed`,FORMULA:'Custom formula'} as any)[x]||x;}
  allGroupItems(){return [...this.tests().map((x:any)=>({item_type:'TEST',item_id:x.id,name:x.display_name||x.name||'Unnamed test',code:x.test_code||x.code||x.short_name||'',category:x.category_name||x.test_category_name||x.department_name||x.department||'',running_cost:x.running_cost||x.vendor_cost||0})),...this.profiles().map((x:any)=>({item_type:'PROFILE',item_id:x.id,name:x.display_name||x.name||'Unnamed profile',code:x.profile_code||x.code||'',category:x.category_name||x.department_name||x.department||'',running_cost:x.running_cost||0}))];}
  filteredGroupItems(){const q=this.itemSearch.trim().toLowerCase();return this.allGroupItems().filter(x=>(this.itemTypeFilter==='ALL'||x.item_type===this.itemTypeFilter)&&(!q||[x.name,x.item_type,x.code,x.category].some((v:any)=>String(v||'').toLowerCase().includes(q)))).slice(0,300);}
  selectedGroupItemCount(){return (this.groupForm.items||[]).length;}
  selectedGroupItems(){const selected=this.groupForm.items||[];const all=this.allGroupItems();return selected.map((i:any)=>all.find((x:any)=>x.item_type===i.item_type&&Number(x.item_id)===Number(i.item_id))||i);}
  groupItemDescription(x:any){return [x.code,x.category].filter(Boolean).join(' · ')||`${x.item_type==='PROFILE'?'Billable profile':'Individual test'} · ID ${x.item_id}`;}
  trackGroupItem(_index:number,x:any){return `${x.item_type}-${x.item_id}`;}
  toggleGroupItemDirect(x:any){this.groupForm.items=this.groupForm.items||[];if(this.groupHasItem(x))this.groupForm.items=this.groupForm.items.filter((i:any)=>!(i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id)));else this.groupForm.items.push({...x});}
  allVisibleGroupItemsSelected(){const visible=this.filteredGroupItems();return !!visible.length&&visible.every(x=>this.groupHasItem(x));}
  toggleAllVisibleGroupItems(){const visible=this.filteredGroupItems();const remove=this.allVisibleGroupItemsSelected();if(remove){const keys=new Set(visible.map(x=>`${x.item_type}-${Number(x.item_id)}`));this.groupForm.items=(this.groupForm.items||[]).filter((i:any)=>!keys.has(`${i.item_type}-${Number(i.item_id)}`));}else{this.groupForm.items=this.groupForm.items||[];for(const x of visible)if(!this.groupHasItem(x))this.groupForm.items.push({...x});}}
  groupHasItem(x:any){return (this.groupForm.items||[]).some((i:any)=>i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id));}
  toggleGroupItem(x:any,e:any){this.groupForm.items=this.groupForm.items||[];if(e.target.checked&&!this.groupHasItem(x))this.groupForm.items.push(x);if(!e.target.checked)this.groupForm.items=this.groupForm.items.filter((i:any)=>!(i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id)));}
  groupHasConsultant(id:number){return (this.groupForm.consultant_ids||[]).map(Number).includes(Number(id));}
  toggleGroupConsultant(id:number,e:any){const x=new Set((this.groupForm.consultant_ids||[]).map(Number));e.target.checked?x.add(Number(id)):x.delete(Number(id));this.groupForm.consultant_ids=[...x];}
  async validateGroupFormula(){const r=await window.limsApi.validateCommissionFormula?.({formula:this.groupForm.formula_expression});this.formulaState=r?.valid?'valid':'invalid';this.formulaMessage=r?.valid?`Valid · sample commission ${this.money(r.result)}`:(r?.error||'Invalid formula');}
  async saveGroup(){if(!String(this.groupForm.name||'').trim()){await this.notify('Group name required','Enter a name for this commission group before saving.','warning');return;}if(this.groupForm.calculation_type==='FORMULA'){const r=await window.limsApi.validateCommissionFormula?.({formula:this.groupForm.formula_expression});if(!r?.valid){await this.notify('Invalid commission formula',r?.error||'Formula is invalid.','danger');return;}}this.saving.set(true);try{const out=await window.limsApi.saveCommissionGroup?.(this.groupForm);this.groups.set(out?.groups||await window.limsApi.listCommissionGroups?.()||[]);this.closeGroup();}catch(e:any){await this.notify('Unable to save commission group',e?.message||String(e),'danger');}finally{this.saving.set(false);}}
  async deleteGroup(){const ok=await this.ask({title:'Archive or delete commission group?',message:`${this.groupForm.name || 'This group'} will no longer be available for new commission calculations. Historical commission snapshots remain unchanged.`,tone:'danger',confirmText:'Archive / Delete',cancelText:'Keep group'});if(!ok)return;this.groups.set(await window.limsApi.deleteCommissionGroup?.(Number(this.groupForm.id))||[]);this.closeGroup();}
  ask(options:any):Promise<any>{
    const sequence=++this.popupSequence;
    this.forceClosePopupDialog();
    this.popupValue='';
    this.popup.set({...options,showCancel:options.showCancel!==false});
    this.popupOpen.set(true);
    queueMicrotask(()=>{
      if(sequence!==this.popupSequence||!this.popupOpen()||!this.popup())return;
      const d=this.popupDialog?.nativeElement;
      if(d&&!d.open)d.showModal();
    });
    return new Promise(resolve=>this.popupResolver=resolve);
  }
  notify(title:string,message:string,tone:'info'|'warning'|'danger'|'success'='info'){return this.ask({title,message,tone,showCancel:false,confirmText:'OK'});}
  onPopupBackdropClick(event:MouseEvent){if(event.target===event.currentTarget&&this.popup()?.allowBackdropClose!==false&&this.popup()?.showCancel!==false)this.resolvePopup(false);}
  resolvePopup(confirmed:boolean){
    const current=this.popup();
    const value=confirmed?(current?.input?this.popupValue:true):false;
    ++this.popupSequence;
    this.forceClosePopupDialog();
    this.popupOpen.set(false);
    this.popup.set(null);
    this.popupValue='';
    const resolver=this.popupResolver;
    this.popupResolver=null;
    resolver?.(value);
  }
  private forceClosePopupDialog(){const d=this.popupDialog?.nativeElement;if(d?.open)d.close();}
  private resetPopupState(){
    ++this.popupSequence;
    this.forceClosePopupDialog();
    this.popupOpen.set(false);
    this.popup.set(null);
    this.popupValue='';
    const resolver=this.popupResolver;
    this.popupResolver=null;
    resolver?.(false);
  }
  ngOnDestroy(){this.resetPopupState();const g=this.groupDialog?.nativeElement;if(g?.open)g.close();const s=this.settlementDialog?.nativeElement;if(s?.open)s.close();}
}
