import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { dateRangePresets, matchesDateRange, openNativeDatePicker, DATE_RANGE_FILTER_STYLES } from '../../shared/date-range-filters';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';

@Component({
  selector: 'app-commissions-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule],
  template: `
    <section class="commission-workspace">
      <nav class="commission-tabs" aria-label="Commission sections">
        <button type="button" [class.active]="commissionTab==='register'" (click)="setCommissionTab('register')"><span>Q</span>Review Queue</button>
        <button type="button" [class.active]="commissionTab==='rules'" (click)="setCommissionTab('rules')"><span>M</span>Commission Profiles</button>
        <button type="button" [class.active]="commissionTab==='settlements'" (click)="setCommissionTab('settlements')"><span>S</span>Settlements</button>
        <button type="button" [class.active]="commissionTab==='reports'" (click)="setCommissionTab('reports')"><span>P</span>Reports</button>
      </nav>

      <header class="commission-command">
        <div class="command-title">
          <span>Quick Reporting</span>
          <h2>Commission Workbench</h2>
          <p>Billing item snapshots</p>
        </div>
        <div class="workflow-strip" aria-label="Commission workflow">
          <button type="button" [class.active]="filters.status==='GENERATED'" (click)="setStatus('GENERATED')"><b>1</b><span>Review</span><small>{{money(totals().generated)}}</small></button>
          <button type="button" [class.active]="filters.status==='APPROVED'" (click)="setStatus('APPROVED')"><b>2</b><span>Approve</span><small>{{money(totals().approved)}}</small></button>
          <button type="button" [class.active]="filters.status==='HELD'" (click)="setStatus('HELD')"><b>3</b><span>Hold</span><small>{{money(totals().held)}}</small></button>
          <button type="button" [class.active]="filters.status==='PAID'" (click)="setStatus('PAID')"><b>4</b><span>Paid</span><small>{{money(totals().paid)}}</small></button>
        </div>
      </header>
      <div class="toolbar" *ngIf="commissionTab==='register'">
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
        <select class="queue-select consultant-select" [(ngModel)]="filters.consultant_id" (change)="load()"><option [ngValue]="0">All consultants</option><option *ngFor="let c of consultants()" [ngValue]="c.id">{{c.name}}</option></select>
        <select class="queue-select status-select" [(ngModel)]="filters.status" (change)="load()"><option value="ALL">All statuses</option><option value="GENERATED">Pending review</option><option value="APPROVED">Approved</option><option value="HELD">Held</option><option value="PAID">Paid</option><option value="CANCELLED">Cancelled</option><option value="REVERSAL_PENDING">Reversal pending</option></select>
        <input class="search queue-search" [(ngModel)]="filters.search" (keyup.enter)="load()" placeholder="Search bill, patient, item">
        <button class="btn secondary queue-refresh" (click)="load()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><path d="M21 3v6h-6"></path></svg><span>Refresh</span></button>
      </div>

      <div class="dashboard-skeleton commission-dashboard-skeleton" *ngIf="loading()" aria-label="Loading commissions">
        <div class="skeleton-card" *ngFor="let n of [1,2,3,4,5,6,7]"><span></span><div><i></i><b></b><em></em></div></div>
        <div class="skeleton-panel" *ngFor="let n of [1,2,3,4]"><i></i><b></b><em></em></div>
      </div>

      <ng-container *ngIf="!loading()">
        <div class="kpi-grid">
          <div class="kpi-hitbox" *ngFor="let card of commissionKpis()">
            <button type="button" class="kpi kpi-surface" [class.active]="filters.status===card.status" (click)="setStatus(card.status)">
              <span class="icon" [ngClass]="card.tone">{{card.icon}}</span>
              <span class="kpi-copy"><small>{{card.label}}</small><strong>{{card.value}}</strong><em>{{card.note}}</em></span>
              <span class="open">Open</span>
            </button>
          </div>
        </div>

        <div class="insight-grid">
          <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="setStatus('GENERATED')">
            <div class="title"><span><b>Review Queue</b><small>Generated entries needing decision</small></span><i>Open</i></div>
            <div class="mini-list status-breakdown"><div *ngFor="let row of statusRows()"><span><i [ngClass]="row.tone"></i>{{row.label}}</span><b>{{row.value}}</b></div></div>
          </button></div>
          <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="setStatus('APPROVED')">
            <div class="title"><span><b>Settlement Ready</b><small>Approved commission can be paid</small></span><i>Open</i></div>
            <div class="bar-list"><div *ngFor="let row of commissionMoneyRows()"><span>{{row.label}}</span><div><i [style.width.%]="row.percent"></i></div><b>{{row.value}}</b></div></div>
          </button></div>
          <div class="card-hitbox"><div class="insight card-surface rule-insight">
            <div class="title"><span><b>Rule Setup</b><small>Test/profile groups assigned to consultants</small></span><i>{{activeGroupCount()}} active</i></div>
            <div class="rule-stats"><div><span>Groups</span><b>{{groups().length}}</b></div><div><span>Items</span><b>{{groupItemTotal()}}</b></div><div><span>Assignments</span><b>{{groupConsultantTotal()}}</b></div></div>
            <div class="group-chip-list" *ngIf="groups().length; else noGroups">
              <button type="button" *ngFor="let g of groups()" (click)="editGroup(g)"><b>{{g.name}}</b><small>{{groupMethodLabel(g)}}</small></button>
            </div>
            <ng-template #noGroups><div class="empty compact-empty">No rule groups configured.</div></ng-template>
            <button type="button" class="print-btn insight-action" (click)="newGroup()">New rule group</button>
          </div></div>
          <div class="card-hitbox"><div class="insight card-surface report-insight">
            <div class="title"><span><b>Reports</b><small>Date range and consultant filter apply</small></span><i>{{reportTypes.length}} reports</i></div>
            <div class="report-grid compact-reports">
              <div class="report-card" *ngFor="let r of reportTypes">
                <div><b>{{r.label}}</b><small>{{r.hint}}</small></div>
                <div class="report-actions">
                  <button type="button" class="btn secondary tiny" [disabled]="exporting()" (click)="exportReport(r.id,'pdf')">PDF</button>
                  <button type="button" class="btn secondary tiny" [disabled]="exporting()" (click)="exportReport(r.id,'excel')">Excel</button>
                </div>
              </div>
            </div>
          </div></div>
        </div>
      </ng-container>

      <mat-card class="data-card group-manager" *ngIf="commissionTab==='rules' && ruleMasterView==='list'">
        <div class="panel-title">
          <div><h3>Commission Profile Master</h3><p>Create profiles that assign tests/profiles to consultants.</p></div>
          <button class="btn primary" (click)="newGroup()">Create profile</button>
        </div>
        <div class="rule-list-toolbar">
          <label><span>Search</span><input [(ngModel)]="ruleSearch" placeholder="Search profile, code, calculation"></label>
          <label><span>Status</span><select [(ngModel)]="ruleStatus"><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></label>
        </div>
        <div class="group-grid">
          <button class="group-card" *ngFor="let g of filteredGroups()" (click)="editGroup(g)">
            <span class="status" [attr.data-status]="g.active ? 'APPROVED' : 'CANCELLED'">{{g.active ? 'Active' : 'Archived'}}</span>
            <b>{{g.name}}</b><small>{{groupMethodLabel(g)}} · {{g.items?.length || 0}} items · {{g.consultant_ids?.length || 0}} consultants</small>
          </button>
          <div class="empty" *ngIf="!filteredGroups().length">No commission profiles found. Create one to assign many tests/profiles together.</div>
        </div>
      </mat-card>

      <section class="rule-form-shell" *ngIf="commissionTab==='rules' && ruleMasterView==='form'">
        <div class="rule-form-topbar">
          <button class="action-btn ghost" type="button" (click)="requestCloseGroup()">Back to Profile List</button>
          <div><strong>{{ruleFormMode === 'edit' ? 'Edit Commission Profile' : 'Create Commission Profile'}}</strong><span>{{groupForm.name || 'Complete the steps and save'}}</span></div>
        </div>
        <div class="rule-stepper-card">
          <div class="rule-stepper-head">
            <button type="button" *ngFor="let step of ruleMasterSteps; let i = index" class="rule-stepper-step" [class.active]="ruleMasterStep === i" [class.done]="i < ruleMasterStep" (click)="goToRuleStep(i)">
              <span>{{i + 1}}</span>
              <strong>{{step.title}}</strong>
              <small>{{step.caption}}</small>
            </button>
          </div>

          <div class="rule-step-panel" *ngIf="ruleMasterStep === 0">
            <div class="form-section-title">Basic Profile</div>
            <div class="rule-step-grid">
              <label class="master-field"><span>Profile name</span><input [(ngModel)]="groupForm.name" placeholder="Routine Biochemistry"></label>
              <label class="master-field"><span>Code</span><input [(ngModel)]="groupForm.code" placeholder="BIO-ROUTINE"></label>
              <label class="master-field"><span>Effective from</span><input type="date" [(ngModel)]="groupForm.effective_from"></label>
              <label class="master-field"><span>Effective to</span><input type="date" [(ngModel)]="groupForm.effective_to"></label>
              <label class="switch-field"><span>Active</span><span class="switch-line"><input type="checkbox" [(ngModel)]="groupForm.active"><span class="switch-visual"></span><b>{{groupForm.active ? 'Yes' : 'No'}}</b></span></label>
              <label class="master-field wide"><span>Description</span><textarea rows="3" [(ngModel)]="groupForm.description" placeholder="Optional note for this rule"></textarea></label>
            </div>
          </div>

          <div class="rule-step-panel" *ngIf="ruleMasterStep === 1">
            <div class="form-section-title">Calculation</div>
            <div class="rule-step-grid compact-grid">
              <label class="master-field"><span>Calculation</span><select [(ngModel)]="groupForm.calculation_type" (change)="formulaState=''">
                <option value="PERCENT_NET">% of net amount</option><option value="PERCENT_PROFIT">% of profit</option><option value="PERCENT_GROSS">% of selling price</option><option value="FIXED">Fixed per quantity</option><option value="FORMULA">Custom formula</option>
              </select></label>
              <label class="master-field" *ngIf="groupForm.calculation_type!=='FORMULA' && groupForm.calculation_type!=='FIXED'"><span>Rate %</span><input type="number" [(ngModel)]="groupForm.rate"></label>
              <label class="master-field" *ngIf="groupForm.calculation_type==='FIXED'"><span>Fixed amount</span><input type="number" [(ngModel)]="groupForm.fixed_amount"></label>
              <label class="switch-field"><span>Minimum limit</span><span class="switch-line"><input type="checkbox" [(ngModel)]="groupForm.min_enabled"><span class="switch-visual"></span><b>{{groupForm.min_enabled ? 'On' : 'Off'}}</b></span></label>
              <label class="master-field" *ngIf="groupForm.min_enabled"><span>Minimum commission</span><input type="number" [(ngModel)]="groupForm.min_commission"></label>
              <label class="switch-field"><span>Maximum limit</span><span class="switch-line"><input type="checkbox" [(ngModel)]="groupForm.max_enabled"><span class="switch-visual"></span><b>{{groupForm.max_enabled ? 'On' : 'Off'}}</b></span></label>
              <label class="master-field" *ngIf="groupForm.max_enabled"><span>Maximum commission</span><input type="number" [(ngModel)]="groupForm.max_commission"></label>
              <label class="master-field wide" *ngIf="groupForm.calculation_type==='FORMULA'"><span>Formula expression</span><textarea rows="3" [(ngModel)]="groupForm.formula_expression" placeholder="MAX(PROFIT * 20 / 100, 50)"></textarea><small>Variables: SELLING_PRICE, NET_AMOUNT, TEST_COST, PROFIT, DISCOUNT, QUANTITY, COLLECTED_AMOUNT, DUE_AMOUNT. Functions: MIN, MAX, ABS, ROUND.</small></label>
              <div class="wide formula-actions" *ngIf="groupForm.calculation_type==='FORMULA'"><button class="action-btn ghost" type="button" (click)="validateGroupFormula()">Validate and test</button><span [class.ok]="formulaState==='valid'" [class.bad]="formulaState==='invalid'">{{formulaMessage}}</span></div>
            </div>
          </div>

          <div class="rule-step-panel" *ngIf="ruleMasterStep === 2">
            <div class="form-section-title">Tests and Profiles</div>
            <section class="commission-item-selector">
              <div class="selector-title-row">
                <div><h4>Select billable items</h4><small>Commission is calculated from billed test/profile snapshots.</small></div>
                <div class="selector-title-actions"><span class="selected-count">{{selectedGroupItemCount()}} selected</span><button type="button" class="bulk-select-btn" (click)="toggleAllVisibleGroupItems()">{{allVisibleGroupItemsSelected() ? 'Clear visible' : 'Bulk select visible'}}</button></div>
              </div>
              <div class="billing-like-search">
                <span class="search-glyph" aria-hidden="true">S</span>
                <input [(ngModel)]="itemSearch" (focus)="itemSearchOpen=true" (input)="itemSearchOpen=true" placeholder="Search tests or profiles..." autocomplete="off">
                <button type="button" class="search-clear" *ngIf="itemSearch" (click)="itemSearch=''; itemSearchOpen=true">x</button>
              </div>
              <div class="selector-filters">
                <button type="button" [class.active]="itemTypeFilter==='ALL'" (click)="itemTypeFilter='ALL'">All</button>
                <button type="button" [class.active]="itemTypeFilter==='TEST'" (click)="itemTypeFilter='TEST'">Tests</button>
                <button type="button" [class.active]="itemTypeFilter==='PROFILE'" (click)="itemTypeFilter='PROFILE'">Profiles</button>
              </div>
              <div class="billing-like-results">
                <div class="result-info"><span>{{filteredGroupItems().length}} result{{filteredGroupItems().length===1 ? '' : 's'}}</span><span>Click a row to select</span></div>
                <button type="button" class="billing-like-row" *ngFor="let x of filteredGroupItems(); trackBy: trackGroupItem" [class.selected]="groupHasItem(x)" [class.has-conflict]="groupItemExistingGroups(x).length" (click)="toggleGroupItemDirect(x)">
                  <span class="compact-check" [class.checked]="groupHasItem(x)"><span>&#10003;</span></span>
                  <span class="item-copy"><span class="item-title"><b>{{x.name}}</b><em [attr.data-kind]="x.item_type">{{x.item_type}}</em><i class="item-conflict" *ngIf="groupItemExistingGroups(x).length">Used in {{groupItemExistingGroupNames(x)}}</i></span><small>{{groupItemDescription(x)}}</small></span>
                  <span class="item-cost"><small>Cost</small><b>{{money(x.running_cost || 0)}}</b></span>
                </button>
                <div class="selector-empty" *ngIf="!filteredGroupItems().length"><b>No matching tests or profiles</b><span>Try a name, code, category, or item type.</span></div>
              </div>
              <div class="selected-item-chips" *ngIf="selectedGroupItemCount()">
                <button type="button" *ngFor="let x of selectedGroupItems(); trackBy: trackGroupItem" (click)="toggleGroupItemDirect(x)" title="Remove item"><span>{{x.name}}</span><b>x</b></button>
              </div>
            </section>
          </div>

          <div class="rule-step-panel" *ngIf="ruleMasterStep === 3">
            <div class="form-section-title">Consultants</div>
            <section class="consultant-step">
              <div class="selector-title-row">
                <div><h4>Assign consultants</h4><small>Only selected consultants use this rule for matching billed items.</small></div>
                <span class="selected-count">{{(groupForm.consultant_ids || []).length}} selected</span>
              </div>
              <div class="pick-list consultant-pick-list"><label *ngFor="let c of consultants()"><input type="checkbox" [checked]="groupHasConsultant(c.id)" (change)="toggleGroupConsultant(c.id,$event)"><span>{{c.name}}<small>{{c.clinic || 'No clinic'}}</small><small *ngIf="consultantCommissionGroupNames(c.id)">Groups: {{consultantCommissionGroupNames(c.id)}}</small></span></label></div>
            </section>
          </div>

          <div class="rule-step-panel" *ngIf="ruleMasterStep === 4">
            <div class="form-section-title">Review</div>
            <div class="rule-review-grid">
              <div><span>Rule</span><b>{{groupForm.name || '-'}}</b><small>{{groupForm.code || 'No code'}}</small></div>
              <div><span>Calculation</span><b>{{groupMethodLabel(groupForm)}}</b><small>{{groupForm.calculation_type || '-'}}</small></div>
              <div><span>Items</span><b>{{selectedGroupItemCount()}}</b><small>Tests/profiles selected</small></div>
              <div><span>Consultants</span><b>{{(groupForm.consultant_ids || []).length}}</b><small>Assigned doctors</small></div>
            </div>
            <div class="review-chip-section"><b>Selected items</b><div class="selected-item-chips"><button type="button" *ngFor="let x of selectedGroupItems(); trackBy: trackGroupItem"><span>{{x.name}}</span></button></div></div>
            <div class="review-chip-section"><b>Assigned consultants</b><div class="consultant-review-list"><span *ngFor="let c of selectedGroupConsultants()">{{c.name}}</span><span *ngIf="!selectedGroupConsultants().length">No consultants selected</span></div></div>
          </div>

          <div class="rule-step-actions">
            <button class="action-btn ghost" type="button" (click)="requestCloseGroup()">Cancel</button>
            <button class="action-btn ghost" type="button" (click)="prevRuleStep()" [disabled]="ruleMasterStep<=0">Previous</button>
            <button class="action-btn ghost" type="button" (click)="nextRuleStep()" [disabled]="ruleMasterStep>=ruleMasterSteps.length-1">Next</button>
            <button class="action-btn danger" type="button" *ngIf="groupForm.id" (click)="deleteGroup()">Archive/Delete</button>
            <button class="action-btn primary" type="button" [disabled]="saving()" (click)="saveGroup()">{{saving() ? 'Saving...' : 'Save profile'}}</button>
          </div>
        </div>
      </section>

      <div class="summary-grid" *ngIf="!loading(); else summarySkeleton">
        <button class="summary-card" (click)="setStatus('ALL')"><span>Total payable</span><strong>{{money(totals().commission)}}</strong><small>{{totals().records || 0}} entries · {{totals().billCount || 0}} bills</small></button>
        <button class="summary-card pending" (click)="setStatus('GENERATED')"><span>Pending review</span><strong>{{money(totals().generated)}}</strong><small>Generated automatically</small></button>
        <button class="summary-card approved" (click)="setStatus('APPROVED')"><span>Approved</span><strong>{{money(totals().approved)}}</strong><small>Ready for settlement</small></button>
        <button class="summary-card held" (click)="setStatus('HELD')"><span>Held</span><strong>{{money(totals().held)}}</strong><small>Needs attention</small></button>
        <button class="summary-card paid" (click)="setStatus('PAID')"><span>Paid</span><strong>{{money(totals().paid)}}</strong><small>Settled commission</small></button>
        <button class="summary-card reversed" (click)="setStatus('CANCELLED')"><span>Cancelled</span><strong>{{money(totals().cancelled)}}</strong><small>Unpaid on cancelled bills</small></button>
        <button class="summary-card reversal" (click)="setStatus('REVERSAL_PENDING')"><span>Reversal pending</span><strong>{{money(totals().reversal_pending)}}</strong><small>Paid on cancelled bills</small></button>
      </div>
      <ng-template #summarySkeleton><div class="summary-grid"><div class="skeleton" *ngFor="let x of [1,2,3,4,5,6,7]"></div></div></ng-template>

      <mat-card class="data-card reports-card" *ngIf="commissionTab==='reports'">
        <div class="panel-title">
          <div><h3>Reports</h3><p>Date range and consultant filter apply.</p></div>
        </div>
        <div class="report-grid">
          <div class="report-card" *ngFor="let r of reportTypes">
            <div><b>{{r.label}}</b><small>{{r.hint}}</small></div>
            <div class="report-actions">
              <button type="button" class="btn secondary tiny" [disabled]="exporting()" (click)="exportReport(r.id,'pdf')">PDF</button>
              <button type="button" class="btn secondary tiny" [disabled]="exporting()" (click)="exportReport(r.id,'excel')">Excel</button>
            </div>
          </div>
        </div>
      </mat-card>

      <mat-card class="data-card register-card" *ngIf="commissionTab==='register'">
        <div class="panel-title queue-panel-title">
          <div class="queue-title-copy">
            <span class="queue-title-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l1 2h3v15H5V6h3z"></path><path d="M9 6h6"></path><path d="M9 11h1"></path><path d="M13 11h3"></path><path d="M9 15h1"></path><path d="M13 15h3"></path></svg></span>
            <div><h3>Review Queue</h3><p>Approve, hold, or settle selected entries.</p></div>
          </div>
          <div class="queue-head-actions">
            <div class="selection-actions" *ngIf="selectedIds().size">
              <span>{{selectedIds().size}} selected</span>
              <button class="btn secondary" (click)="changeStatus('HELD')">Hold</button>
              <button class="btn primary" (click)="changeStatus('APPROVED')">Approve</button>
              <button class="btn success" (click)="openSettlement()">Settle</button>
            </div>
            <button type="button" class="queue-filter-button" title="Queue filters"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10"></path><path d="M18 7h2"></path><path d="M16 5v4"></path><path d="M4 12h3"></path><path d="M11 12h9"></path><path d="M9 10v4"></path><path d="M4 17h10"></path><path d="M18 17h2"></path><path d="M16 15v4"></path></svg></button>
          </div>
        </div>

        <div class="table-wrap" *ngIf="!loading(); else rowsSkeleton">
          <table>
            <thead><tr><th><input type="checkbox" [checked]="allVisibleSelected()" (change)="toggleAll($event)"></th><th>Date / Bill</th><th>Consultant</th><th>Patient</th><th>Item</th><th>Rule</th><th class="num">Net</th><th class="num">Running Cost</th><th class="num">Profit</th><th class="num">Commission</th><th>Status</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of pagedRows()" [class.cancelled]="r.commission_status==='CANCELLED' || r.commission_status==='REVERSAL_PENDING'">
                <td><input type="checkbox" [disabled]="r.commission_status==='PAID' || r.commission_status==='CANCELLED' || r.commission_status==='REVERSAL_PENDING'" [checked]="selectedIds().has(r.id)" (change)="toggleRow(r.id,$event)"></td>
                <td><b>{{localDate(r.bill_date)}}</b><small>{{r.bill_no}}</small></td>
                <td><b>{{r.consultant_name || 'No consultant'}}</b><small>{{r.consultant_clinic}}</small></td>
                <td>{{r.patient_name || '-'}}</td>
                <td><b>{{r.item_name}}</b><small>{{r.item_type}} · Qty {{r.quantity}}</small></td>
                <td>{{r.commission_profile_name || '-' }}<small>{{r.commission_rule_source}}</small></td>
                <td class="num">{{money(r.net_amount)}}</td>
                <td class="num">{{money(r.running_cost)}}</td>
                <td class="num">{{money(r.profit_amount)}}</td>
                <td class="num emph">{{money(r.commission_amount)}}</td>
                <td><span class="status" [attr.data-status]="r.commission_status">{{statusLabel(r.commission_status)}}</span><small *ngIf="r.commission_hold_reason">{{r.commission_hold_reason}}</small></td>
              </tr>
              <tr *ngIf="!rows().length"><td colspan="11" class="empty queue-empty"><span class="queue-empty-icon"><svg viewBox="0 0 96 72" aria-hidden="true"><path d="M22 36h16l4 7h12l4-7h16v19H22z"></path><path d="M30 36l8-17h20l8 17"></path><path d="M48 7v8"></path><path d="M29 12l5 7"></path><path d="M67 12l-5 7"></path><path d="M16 24l8 3"></path><path d="M80 24l-8 3"></path></svg></span><b>No commission entries for the selected period.</b></td></tr>
            </tbody>
          </table>
        </div>
        <ng-template #rowsSkeleton><div class="row-skeleton" *ngFor="let x of [1,2,3,4,5,6,7]"></div></ng-template>

        <div class="footer">
          <span>Showing {{pageStart()}}–{{pageEnd()}} of {{rows().length}}</span>
          <div class="pager"><label>Rows <select [(ngModel)]="pageSize" (change)="page.set(1)"><option [ngValue]="10">10</option><option [ngValue]="25">25</option><option [ngValue]="50">50</option><option [ngValue]="100">100</option></select></label><button (click)="page.set(page()-1)" [disabled]="page()<=1">‹</button><b>{{page()}} / {{totalPages()}}</b><button (click)="page.set(page()+1)" [disabled]="page()>=totalPages()">›</button></div>
        </div>
      </mat-card>

      <mat-card class="data-card settlement-card" *ngIf="commissionTab==='settlements'">
        <div class="panel-title"><div><h3>Settlement History</h3><p>Paid vouchers for the selected period.</p></div><span class="status-pill">{{settlements().length}}</span></div>
        <div class="settlement-list"><div class="settlement-row" *ngFor="let s of settlements()"><div><b>{{s.settlement_no}}</b><small>{{localDateTime(s.settlement_date)}}</small></div><div><b>{{s.consultant_name}}</b><small>{{s.item_count}} items</small></div><div><b>{{s.payment_mode}}</b><small>{{s.reference_no || 'No reference'}}</small></div><strong>{{money(s.amount)}}</strong><div class="settlement-actions"><button type="button" class="btn secondary tiny" title="Open PDF voucher" (click)="exportSettlement(s.id,'pdf')">PDF</button><button type="button" class="btn secondary tiny" title="Export Excel" (click)="exportSettlement(s.id,'excel')">Excel</button></div></div><div class="empty" *ngIf="!settlements().length">No settlements in this period.</div></div>
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
          <label class="check-line"><input type="checkbox" [(ngModel)]="groupForm.min_enabled"> Minimum limit</label>
          <label *ngIf="groupForm.min_enabled"><span>Minimum commission</span><input type="number" [(ngModel)]="groupForm.min_commission"></label>
          <label class="check-line"><input type="checkbox" [(ngModel)]="groupForm.max_enabled"> Maximum limit</label>
          <label *ngIf="groupForm.max_enabled"><span>Maximum commission</span><input type="number" [(ngModel)]="groupForm.max_commission"></label>
          <label><span>Effective from</span><input type="date" [(ngModel)]="groupForm.effective_from"></label>
          <label><span>Effective to</span><input type="date" [(ngModel)]="groupForm.effective_to"></label>
          <label class="wide" *ngIf="groupForm.calculation_type==='FORMULA'"><span>Formula expression</span><textarea rows="3" [(ngModel)]="groupForm.formula_expression" placeholder="MAX(PROFIT * 20 / 100, 50)"></textarea><small>Variables: SELLING_PRICE, NET_AMOUNT, TEST_COST, PROFIT, DISCOUNT, QUANTITY, COLLECTED_AMOUNT, DUE_AMOUNT. Functions: MIN, MAX, ABS, ROUND.</small></label>
          <div class="wide formula-actions" *ngIf="groupForm.calculation_type==='FORMULA'"><button class="btn secondary" (click)="validateGroupFormula()">Validate & test</button><span [class.ok]="formulaState==='valid'" [class.bad]="formulaState==='invalid'">{{formulaMessage}}</span></div>
          <label class="wide"><span>Description</span><textarea rows="2" [(ngModel)]="groupForm.description"></textarea></label>
          <div class="wide split-picker">
            <section class="commission-item-selector">
              <div class="selector-title-row">
                <div><h4>Tests and profiles</h4><small>Search and select items using the same compact flow as Billing.</small></div>
                <div class="selector-title-actions"><span class="selected-count">{{selectedGroupItemCount()}} selected</span><button type="button" class="bulk-select-btn" (click)="toggleAllVisibleGroupItems()">{{allVisibleGroupItemsSelected() ? 'Clear visible' : 'Bulk select visible'}}</button></div>
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
              </div>
              <div class="billing-like-results">
                <div class="result-info"><span>{{filteredGroupItems().length}} result{{filteredGroupItems().length===1 ? '' : 's'}}</span><span>Click a row to select</span></div>
                <button type="button" class="billing-like-row" *ngFor="let x of filteredGroupItems(); trackBy: trackGroupItem" [class.selected]="groupHasItem(x)" [class.has-conflict]="groupItemExistingGroups(x).length" (click)="toggleGroupItemDirect(x)">
                  <span class="compact-check" [class.checked]="groupHasItem(x)"><span>&#10003;</span></span>
                  <span class="item-copy"><span class="item-title"><b>{{x.name}}</b><em [attr.data-kind]="x.item_type">{{x.item_type}}</em><i class="item-conflict" *ngIf="groupItemExistingGroups(x).length">Used in {{groupItemExistingGroupNames(x)}}</i></span><small>{{groupItemDescription(x)}}</small></span>
                  <span class="item-cost"><small>Cost</small><b>{{money(x.running_cost || 0)}}</b></span>
                </button>
                <div class="selector-empty" *ngIf="!filteredGroupItems().length"><b>No matching tests or profiles</b><span>Try a name, code, category, or item type.</span></div>
              </div>
              <div class="selected-item-chips" *ngIf="selectedGroupItemCount()">
                <button type="button" *ngFor="let x of selectedGroupItems(); trackBy: trackGroupItem" (click)="toggleGroupItemDirect(x)" title="Remove item"><span>{{x.name}}</span><b>×</b></button>
              </div>
            </section>
            <section><h4>Assign consultants</h4><div class="pick-list consultant-pick-list"><label *ngFor="let c of consultants()"><input type="checkbox" [checked]="groupHasConsultant(c.id)" (change)="toggleGroupConsultant(c.id,$event)"><span>{{c.name}}<small>{{c.clinic || 'No clinic'}}</small><small *ngIf="consultantCommissionGroupNames(c.id)">Groups: {{consultantCommissionGroupNames(c.id)}}</small></span></label></div></section>
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
    .commission-workspace{display:grid;gap:16px}.toolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:12px;border:1px solid var(--border);border-radius:18px;background:var(--surface)}.date-field{display:grid;gap:4px}.date-field span{font-size:11px;font-weight:900;color:var(--muted)}input,select,textarea{border:1px solid var(--border);background:var(--input,var(--surface-2));color:var(--text);border-radius:11px;padding:0 11px;font-weight:750}.toolbar input,.toolbar select{height:40px}.search{min-width:220px;flex:1}.arrow{padding-bottom:10px;color:var(--muted)}.summary-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:12px}.summary-card,.skeleton{min-height:112px;border:1px solid var(--border);border-radius:18px;background:var(--surface);padding:15px;text-align:left;color:var(--text)}.summary-card{cursor:pointer;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.summary-card:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(0,0,0,.14)}.summary-card span{display:block;color:var(--muted);font-size:12px;font-weight:900}.summary-card strong{display:block;font-size:25px;margin:7px 0}.summary-card small{color:var(--muted)}.summary-card.pending{border-top:3px solid #f59e0b}.summary-card.approved{border-top:3px solid #22c55e}.summary-card.held{border-top:3px solid #a855f7}.summary-card.paid{border-top:3px solid #06b6d4}.summary-card.reversed{border-top:3px solid #ef4444}.summary-card.reversal{border-top:3px solid #f97316}.skeleton,.row-skeleton{background:linear-gradient(90deg,var(--surface) 20%,var(--surface-2) 45%,var(--surface) 70%);background-size:220% 100%;animation:shimmer 1.2s infinite}.data-card{padding:0;border-radius:20px;overflow:hidden}.report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:14px 16px}.report-card{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--surface-2)}.report-card b{display:block}.report-card small{display:block;color:var(--muted);margin-top:3px}.report-actions{display:flex;gap:6px;flex:0 0 auto}.panel-title{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)}.panel-title h3{margin:0}.panel-title p{margin:4px 0 0;color:var(--muted)}.selection-actions{display:flex;align-items:center;gap:8px}.table-wrap{overflow:auto;max-height:520px}table{width:100%;border-collapse:collapse;min-width:1280px}th,td{padding:11px 12px;border-bottom:1px solid var(--border);text-align:left}th{position:sticky;top:0;background:var(--surface);z-index:2;color:var(--muted);font-size:11px;text-transform:uppercase}td small{display:block;color:var(--muted);margin-top:3px}.num{text-align:right}.emph{font-weight:950}.cancelled{opacity:.58}.status{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950;background:var(--surface-2)}.status[data-status="APPROVED"]{color:#16a34a}.status[data-status="HELD"]{color:#9333ea}.status[data-status="PAID"]{color:#0891b2}.status[data-status="CANCELLED"]{color:#dc2626}.status[data-status="REVERSAL_PENDING"]{color:#ea580c}.footer{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-top:1px solid var(--border);color:var(--muted)}.pager{display:flex;align-items:center;gap:8px}.pager select{height:34px}.pager button{width:34px;height:34px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--text)}.row-skeleton{height:48px;margin:8px 14px;border-radius:12px}.settlement-list{padding:10px 16px}.settlement-row{display:grid;grid-template-columns:1.1fr 1.2fr 1fr auto auto;gap:14px;align-items:center;padding:11px 0;border-bottom:1px solid var(--border)}.settlement-row small{display:block;color:var(--muted)}.settlement-actions{display:flex;gap:6px}.btn.tiny{height:32px;padding:0 10px;font-size:11px;border-radius:9px}.empty{text-align:center;color:var(--muted);padding:28px}dialog.app-modal-backdrop,dialog.rich-popup-dialog{display:none!important}dialog.app-modal-backdrop[open],dialog.rich-popup-dialog[open]{display:grid!important;place-items:center!important}dialog.app-modal-backdrop{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;background:transparent!important;padding:24px!important;box-sizing:border-box!important;overflow:hidden!important;color:var(--text)}dialog.app-modal-backdrop::backdrop{background:rgba(2,6,23,.76);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}.modal{width:min(760px,calc(100vw - 48px));max-height:calc(100vh - 48px);background:var(--panel,var(--surface));color:var(--text);border:1px solid var(--border);border-radius:24px;box-shadow:0 32px 100px rgba(0,0,0,.5);overflow:hidden}.modal-head,.modal-foot{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid var(--border)}.modal-foot{border-bottom:0;border-top:1px solid var(--border);justify-content:flex-end}.modal-head h2{margin:2px 0}.modal-head small{color:var(--muted);font-weight:900}.modal-head button{border:0;background:transparent;color:var(--text);font-size:26px}.modal-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 18px;background:var(--surface-2)}.modal-summary span{color:var(--muted);font-size:12px}.modal-summary strong{display:block;color:var(--text);font-size:18px;margin-top:4px}.modal-body{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px}.modal-body label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.modal-body input,.modal-body select{height:42px}.modal-body textarea{padding:10px}.modal-body .wide{grid-column:1/-1}.commission-item-selector{min-width:0}.selector-title-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.selector-title-row h4{margin:0}.selector-title-row small{display:block;color:var(--muted);margin-top:4px}.selected-count{flex:0 0 auto;border:1px solid color-mix(in srgb,#6366f1 55%,var(--border));background:color-mix(in srgb,#6366f1 12%,var(--surface));color:var(--text);border-radius:999px;padding:5px 9px;font-size:11px;font-weight:950}.billing-like-search{position:relative;display:flex;align-items:center}.billing-like-search input{width:100%;height:46px;padding:0 44px 0 42px;border-radius:14px;font-size:13px}.search-glyph{position:absolute;left:14px;z-index:2;color:var(--muted);font-size:20px}.search-clear{position:absolute;right:9px;width:30px;height:30px;border:0;border-radius:9px;background:var(--surface-2);color:var(--text);font-size:20px}.selector-filters{display:flex;gap:7px;align-items:center;margin:9px 0;flex-wrap:wrap}.selector-filters button{height:32px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);color:var(--muted);font-size:11px;font-weight:900}.selector-filters button.active{background:linear-gradient(135deg,#2563eb,#6d4aff);color:#fff;border-color:transparent}.selector-filters .select-visible{margin-left:auto;color:var(--text)}.billing-like-results{border:1px solid var(--border);border-radius:15px;background:var(--surface-2);overflow:auto;max-height:330px}.result-info{position:sticky;top:0;z-index:3;display:flex;justify-content:space-between;gap:12px;padding:8px 11px;border-bottom:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:10px;font-weight:850}.billing-like-row{width:100%;display:grid;grid-template-columns:28px minmax(0,1fr) 94px;align-items:center;gap:10px;min-height:58px;padding:9px 11px;border:0;border-bottom:1px solid var(--border);background:var(--surface);color:var(--text);text-align:left;cursor:pointer;transition:background .14s ease,border-color .14s ease}.billing-like-row:last-of-type{border-bottom:0}.billing-like-row:hover{background:color-mix(in srgb,#6366f1 10%,var(--surface))}.billing-like-row.selected{background:linear-gradient(90deg,color-mix(in srgb,#4f46e5 28%,var(--surface)),color-mix(in srgb,#2563eb 12%,var(--surface)));box-shadow:inset 3px 0 #6366f1}.compact-check{width:21px;height:21px;border:2px solid color-mix(in srgb,var(--muted) 55%,transparent);border-radius:6px;display:grid;place-items:center;background:var(--surface)}.compact-check span{opacity:0;color:#fff;font-size:13px;font-weight:950}.compact-check.checked{border-color:#6366f1;background:#6366f1}.compact-check.checked span{opacity:1}.item-copy{min-width:0;display:grid;gap:4px}.item-title{min-width:0;display:flex;align-items:center;gap:8px}.item-title b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}.item-title em{flex:0 0 auto;font-style:normal;border:1px solid color-mix(in srgb,#8b5cf6 40%,var(--border));background:color-mix(in srgb,#8b5cf6 12%,var(--surface));color:color-mix(in srgb,#8b5cf6 75%,var(--text));border-radius:999px;padding:3px 7px;font-size:9px;font-weight:950}.item-title em[data-kind="PROFILE"]{border-color:color-mix(in srgb,#06b6d4 45%,var(--border));background:color-mix(in srgb,#06b6d4 12%,var(--surface));color:color-mix(in srgb,#06b6d4 72%,var(--text))}.item-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:10.5px}.item-cost{display:grid;justify-items:end;gap:2px}.item-cost small{color:var(--muted);font-size:9px;text-transform:uppercase}.item-cost b{font-size:11px}.selector-empty{padding:24px;text-align:center;display:grid;gap:5px;color:var(--muted)}.selector-empty b{color:var(--text)}.selected-item-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;max-height:76px;overflow:auto}.selected-item-chips button{display:flex;align-items:center;gap:7px;max-width:220px;border:1px solid color-mix(in srgb,#6366f1 38%,var(--border));background:color-mix(in srgb,#6366f1 10%,var(--surface));color:var(--text);border-radius:999px;padding:5px 9px;font-size:10px;font-weight:850}.selected-item-chips button span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.selected-item-chips button b{font-size:14px}.consultant-pick-list input[type="checkbox"]{width:18px;height:18px;accent-color:#6366f1}.group-modal{width:calc(100vw - 48px);height:calc(100vh - 48px);max-width:none;max-height:none;display:flex;flex-direction:column}.group-modal .modal-head{flex:0 0 auto}.group-modal .modal-body{overflow:auto;flex:1 1 auto}.group-modal .modal-foot{flex:0 0 auto;justify-content:space-between;gap:16px}.modal-foot-summary{display:grid;gap:3px}.modal-foot-summary small{color:var(--muted)}.modal-foot-actions{display:flex;gap:9px;align-items:center}.danger-outline{border-color:rgba(239,68,68,.45)!important;color:#ef4444!important}.settlement-modal{width:min(760px,calc(100vw - 48px));display:flex;flex-direction:column}dialog.rich-popup-dialog{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;padding:24px!important;box-sizing:border-box!important;overflow:hidden!important;background:transparent!important;color:var(--text);display:grid!important;place-items:center!important}dialog.rich-popup-dialog::backdrop{background:rgba(2,6,23,.76);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}.rich-dialog-card{width:min(540px,92vw);display:grid;grid-template-columns:58px 1fr;gap:16px;padding:22px;border:1px solid var(--border);border-radius:26px;background:var(--panel,var(--surface));color:var(--text);box-shadow:0 28px 90px rgba(0,0,0,.42);animation:popIn .16s ease-out}.rich-dialog-icon{width:54px;height:54px;border-radius:20px;display:grid;place-items:center;font-size:24px;font-weight:950;background:rgba(245,158,11,.16);color:#f59e0b;border:1px solid rgba(245,158,11,.3)}.rich-dialog-icon[data-tone="danger"]{background:rgba(239,68,68,.15);color:#ef4444;border-color:rgba(239,68,68,.28)}.rich-dialog-icon[data-tone="info"]{background:var(--accent-soft);color:var(--accent);border-color:var(--border)}.rich-dialog-icon[data-tone="success"]{background:rgba(16,185,129,.15);color:#10b981;border-color:rgba(16,185,129,.28)}.rich-dialog-copy h3{margin:0 0 8px;font-size:20px}.rich-dialog-copy p{margin:0;color:var(--muted);line-height:1.5}.rich-dialog-copy small{display:block;margin-top:8px;color:var(--muted)}.rich-dialog-input{grid-column:1/-1;display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.rich-dialog-input textarea{padding:10px;min-height:86px}.rich-dialog-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px}.danger-btn{background:linear-gradient(135deg,#ef4444,#f97316)!important;border-color:transparent!important;color:#fff!important}@keyframes popIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}@media(max-width:850px){dialog.app-modal-backdrop{padding:10px!important}.split-picker{grid-template-columns:1fr!important}.billing-like-row{grid-template-columns:26px minmax(0,1fr) 78px}.selector-filters .select-visible{margin-left:0}.group-modal{width:calc(100vw - 20px);height:calc(100vh - 20px);border-radius:18px}.modal-foot{align-items:flex-start;flex-direction:column}.modal-foot-actions{width:100%;justify-content:flex-end;flex-wrap:wrap}}.btn.success{background:#16a34a;color:#fff;border-color:#16a34a}@keyframes shimmer{to{background-position:-220% 0}}@media(max-width:1200px){.summary-grid{grid-template-columns:repeat(3,1fr)}.report-grid{grid-template-columns:1fr}}@media(max-width:760px){.summary-grid{grid-template-columns:1fr 1fr}.panel-title,.footer{align-items:flex-start;flex-direction:column}.settlement-row{grid-template-columns:1fr 1fr}.report-card{flex-direction:column;align-items:flex-start}.modal-summary,.modal-body{grid-template-columns:1fr}.modal-body .wide{grid-column:auto}}
    .commission-command{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:16px;align-items:center;padding:16px 18px;border:1px solid var(--border);border-radius:16px;background:var(--surface)}
    .selector-title-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.bulk-select-btn{height:30px;border:1px solid color-mix(in srgb,var(--accent) 46%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,var(--surface));color:var(--accent);padding:0 12px;font-size:11px;font-weight:950;cursor:pointer}.bulk-select-btn:hover{background:var(--accent);border-color:var(--accent);color:#fff}
    .master-field input[type="date"],.date-field input[type="date"]{color-scheme:dark}
    .billing-like-row.has-conflict:not(.selected){box-shadow:inset 3px 0 #f59e0b}.item-conflict{flex:0 1 auto;min-width:0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-style:normal;border:1px solid rgba(245,158,11,.38);background:rgba(245,158,11,.12);color:#b45309;border-radius:999px;padding:3px 7px;font-size:9px;font-weight:950}
    .command-title{display:grid;gap:4px}.command-title span{color:var(--muted);font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.06em}.command-title h2{margin:0;font-size:22px}.command-title p{margin:0;color:var(--muted);font-size:12px;font-weight:800}
    .workflow-strip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.workflow-strip button{height:46px;display:grid;grid-template-columns:26px auto;grid-template-rows:auto auto;column-gap:8px;align-items:center;padding:0 13px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);color:var(--text);cursor:pointer;text-align:left}.workflow-strip button b{grid-row:1/3;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:var(--surface);font-size:12px}.workflow-strip button span{font-size:12px;font-weight:950;line-height:1}.workflow-strip button small{color:var(--muted);font-size:10.5px;font-weight:850}.workflow-strip button.active{border-color:color-mix(in srgb,var(--accent) 70%,var(--border));background:var(--accent-soft);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
    .toolbar{border-radius:16px}.toolbar select,.toolbar .search{min-width:180px}.group-manager{order:4}.reports-card{order:5}.settlement-card{order:6}
    .summary-grid{display:flex!important;align-items:stretch;gap:8px;flex-wrap:wrap}.summary-card,.summary-grid .skeleton{min-height:58px!important;border-radius:999px!important;padding:8px 14px!important;display:grid;grid-template-columns:auto auto;grid-template-rows:auto auto;align-items:center;column-gap:10px;min-width:190px;box-shadow:none!important}.summary-card span{grid-column:1/2;font-size:11px!important}.summary-card strong{grid-column:2/3;grid-row:1/3;margin:0!important;font-size:16px!important;white-space:nowrap}.summary-card small{grid-column:1/2;font-size:10.5px!important}.summary-card:hover{transform:none!important;border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
    .data-card{border-radius:16px!important}.panel-title{padding:14px 16px}.panel-title h3{font-size:17px}.panel-title p{font-size:12px}.selection-actions{padding:6px 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface-2);flex-wrap:wrap}.selection-actions span{font-size:12px;font-weight:950;color:var(--muted)}
    .group-grid{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px}.group-card{min-width:230px;max-width:320px;text-align:left;border:1px solid var(--border);border-radius:14px;background:var(--surface-2);color:var(--text);padding:12px;cursor:pointer}.group-card b{display:block;margin:8px 0 4px}.group-card small{display:block;color:var(--muted);font-size:11px;line-height:1.35}
    @media(max-width:900px){.commission-command{grid-template-columns:1fr}.workflow-strip{justify-content:flex-start}.summary-card,.summary-grid .skeleton{min-width:calc(50% - 6px)}}
    @media(max-width:640px){.summary-card,.summary-grid .skeleton{min-width:100%}.workflow-strip button{width:100%}.toolbar select,.toolbar .search{min-width:100%}}
    ${DATE_RANGE_FILTER_STYLES}
    .commission-command,.commission-workspace>.summary-grid,.commission-dashboard-skeleton,.commission-workspace>.kpi-grid,.commission-workspace>.insight-grid{display:none!important}
    .commission-tabs{display:grid;grid-template-columns:repeat(4,1fr);overflow:hidden;margin:0 0 10px;border:1px solid color-mix(in srgb,var(--border) 82%,var(--accent) 10%);border-radius:14px;background:var(--surface)}
    .commission-tabs button{height:38px;border:0;border-right:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer}.commission-tabs button:last-child{border-right:0}.commission-tabs button:hover{background:var(--accent-soft);color:var(--text)}.commission-tabs button.active{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 13%,transparent),color-mix(in srgb,var(--accent) 5%,transparent));color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}.commission-tabs span{width:22px;height:22px;border-radius:8px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 12%,transparent);font-size:11px;font-weight:950}
    .group-manager,.reports-card,.register-card,.settlement-card,.rule-form-shell{border:1px solid var(--border);border-radius:16px;background:var(--surface);box-shadow:var(--shadow,none);overflow:hidden}.rule-list-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 180px;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border)}.rule-list-toolbar label,.master-field{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase}.rule-list-toolbar input,.rule-list-toolbar select,.master-field input,.master-field select,.master-field textarea{width:100%;min-width:0;border:1px solid var(--border);border-radius:11px;background:var(--input,var(--surface-2));color:var(--text);font-size:12.5px;font-weight:750;outline:0}.rule-list-toolbar input,.rule-list-toolbar select,.master-field input,.master-field select{height:36px}.master-field textarea{min-height:78px;padding:9px 11px;resize:vertical;text-transform:none}.master-field small{font-size:10.5px;color:var(--muted);text-transform:none;line-height:1.45}
    .rule-form-shell{padding:12px}.rule-form-topbar{display:flex;align-items:center;gap:12px;margin-bottom:12px}.rule-form-topbar div{display:grid;gap:3px}.rule-form-topbar strong{font-size:15px}.rule-form-topbar span{color:var(--muted);font-size:12px}.rule-stepper-card{display:grid;gap:14px}.rule-stepper-head{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.rule-stepper-step{height:70px;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--muted);display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;gap:1px 8px;align-items:center;text-align:left;padding:9px 10px;cursor:pointer;transition:.18s ease}.rule-stepper-step span{grid-row:1/3;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted);font-size:12px;font-weight:950}.rule-stepper-step strong{font-size:12.5px;font-weight:950;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rule-stepper-step small{font-size:10.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.rule-stepper-step.active{border-color:color-mix(in srgb,var(--accent) 48%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--surface));color:var(--accent);box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 12%,transparent)}.rule-stepper-step.active span,.rule-stepper-step.done span{background:linear-gradient(135deg,var(--accent),#2563eb);color:#fff}.rule-stepper-step.done{color:var(--text)}
    .rule-step-panel{border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--surface) 78%,transparent);padding:14px;display:grid;gap:12px;min-height:220px}.form-section-title{font-size:12px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);padding:2px 0 8px;border-bottom:1px solid var(--border)}.rule-step-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}.rule-step-grid .wide,.wide{grid-column:1/-1}.switch-field{display:grid;gap:6px;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase}.switch-line{height:36px;display:flex;align-items:center;gap:9px}.switch-line input{position:absolute;opacity:0;pointer-events:none}.switch-visual{position:relative;width:42px;height:22px;border-radius:999px;background:color-mix(in srgb,var(--muted) 28%,transparent);border:1px solid var(--border);transition:.18s}.switch-visual:after{content:'';position:absolute;width:18px;height:18px;left:2px;top:1px;border-radius:50%;background:#fff;box-shadow:0 5px 12px rgba(0,0,0,.18);transition:.18s}.switch-line input:checked+.switch-visual{background:linear-gradient(135deg,#2563eb,#60a5fa);border-color:transparent}.switch-line input:checked+.switch-visual:after{transform:translateX(19px)}.switch-line b{color:var(--text);font-size:12px;text-transform:none}
    .action-btn{height:36px;border:1px solid var(--border);border-radius:12px;background:var(--input,var(--surface-2));color:var(--text);padding:0 14px;font-size:12px;font-weight:900;cursor:pointer}.action-btn.primary{background:var(--accent-gradient);border-color:transparent;color:#fff}.action-btn.ghost:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}.action-btn.danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.28);color:#ef4444}.action-btn:disabled{opacity:.48;cursor:not-allowed}.rule-step-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.consultant-step{display:grid;gap:10px}.pick-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pick-list label{display:flex;align-items:flex-start;gap:9px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);padding:10px;color:var(--text);font-size:12px;font-weight:850}.pick-list small{display:block;color:var(--muted);font-size:10.5px;margin-top:3px}.rule-review-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.rule-review-grid div{border:1px solid var(--border);border-radius:14px;background:var(--surface-2);padding:12px}.rule-review-grid span{display:block;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.rule-review-grid b{display:block;margin-top:4px;font-size:16px}.rule-review-grid small{display:block;color:var(--muted);margin-top:3px}.review-chip-section{display:grid;gap:8px}.review-chip-section>b{font-size:12px}.consultant-review-list{display:flex;gap:6px;flex-wrap:wrap}.consultant-review-list span{border:1px solid var(--border);border-radius:999px;background:var(--surface-2);padding:6px 10px;font-size:11px;font-weight:850;color:var(--text)}
    .toolbar{display:flex!important;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;width:100%;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important}
    .toolbar .date-range-filters{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;margin:0}.toolbar input,.toolbar select,.toolbar button{height:36px;border:1px solid var(--border);border-radius:12px;background:var(--input,var(--surface-2));color:var(--text);padding:0 12px;font-weight:850;outline:none}.toolbar input:focus,.toolbar select:focus,.toolbar button:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.toolbar button{cursor:pointer}.toolbar .date-range-filters button.active{background:var(--accent-gradient);border-color:transparent;color:#fff;box-shadow:var(--glow)}.toolbar select{min-width:160px}.toolbar .search{min-width:240px;flex:1}.toolbar>.btn.secondary{min-width:90px}
    .commission-workspace>.toolbar{display:grid!important;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px 16px;margin-bottom:10px}.commission-workspace>.toolbar .queue-select{height:58px!important;border-radius:12px!important;border-color:color-mix(in srgb,var(--border) 86%,#94a3b8)!important;background-color:color-mix(in srgb,var(--surface) 96%,#fff)!important;color:var(--text)!important;font-size:17px!important;font-weight:950!important;padding-left:52px!important;padding-right:44px!important;appearance:none;background-repeat:no-repeat,no-repeat;background-size:22px 22px,16px 16px}.consultant-select{grid-column:1/span 6;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%231e293b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E"),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-position:left 18px center,right 18px center}.status-select{grid-column:7/span 6;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%231e293b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6h16'/%3E%3Cpath d='M4 12h16'/%3E%3Cpath d='M4 18h16'/%3E%3Ccircle cx='8' cy='6' r='2' fill='white'/%3E%3Ccircle cx='16' cy='12' r='2' fill='white'/%3E%3Ccircle cx='10' cy='18' r='2' fill='white'/%3E%3C/svg%3E"),url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");background-position:left 18px center,right 18px center}.queue-search{grid-column:1/span 10;height:58px!important;border-radius:12px!important;font-size:16px!important;padding-left:54px!important;background-color:color-mix(in srgb,var(--surface) 96%,#fff)!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%231e293b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:left 18px center;background-size:22px 22px}.queue-refresh{grid-column:11/span 2;height:58px!important;border-radius:12px!important;display:inline-flex!important;align-items:center;justify-content:center;gap:10px;border-color:color-mix(in srgb,var(--accent) 54%,var(--border))!important;background:color-mix(in srgb,var(--surface) 96%,#fff)!important;color:color-mix(in srgb,var(--accent) 72%,var(--text))!important;font-size:16px!important;font-weight:950!important}.queue-refresh svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}.commission-workspace>.toolbar .date-range-filters{order:5;grid-column:1/-1;display:flex!important;align-items:center;gap:8px;padding:8px;border:1px solid color-mix(in srgb,var(--border) 82%,transparent);border-radius:14px;background:color-mix(in srgb,var(--surface) 78%,var(--surface-2));overflow:auto}.commission-workspace>.toolbar .date-range-filters input[type="date"]{height:34px!important;min-width:150px!important}.commission-workspace>.toolbar .date-range-filters button{height:34px!important;border-radius:10px!important;font-size:11px!important;white-space:nowrap}
    .register-card{border-radius:22px!important;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 96%,#fff),var(--surface))!important;border-color:color-mix(in srgb,var(--border) 88%,#94a3b8)!important;box-shadow:0 18px 45px rgba(15,23,42,.08)!important}.queue-panel-title{padding:26px 28px 22px!important;border-bottom:1px solid color-mix(in srgb,var(--border) 86%,#cbd5e1)!important}.queue-title-copy{display:flex;align-items:center;gap:16px;min-width:0}.queue-title-copy h3{font-size:22px!important;line-height:1.1;margin:0;color:var(--text)}.queue-title-copy p{font-size:15px!important;margin:6px 0 0;color:var(--muted)}.queue-title-icon{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);flex:0 0 auto}.queue-title-icon svg{width:29px;height:29px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.queue-head-actions{display:flex;align-items:center;gap:12px}.queue-filter-button{width:46px;height:46px;border:1px solid var(--border);border-radius:12px;background:var(--surface);color:color-mix(in srgb,var(--text) 74%,var(--muted));display:grid;place-items:center;cursor:pointer}.queue-filter-button svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .register-card .table-wrap{padding:0 28px;max-height:540px}.register-card table{min-width:1260px;border-collapse:collapse}.register-card th{height:58px;background:transparent!important;border-bottom:1px solid color-mix(in srgb,var(--border) 88%,#cbd5e1);color:color-mix(in srgb,var(--text) 68%,var(--muted));font-size:13px;font-weight:950;letter-spacing:.02em}.register-card td{height:56px;border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent);font-size:13px}.register-card input[type="checkbox"]{width:18px;height:18px;accent-color:var(--accent)}.queue-empty{height:220px!important;text-align:center!important;vertical-align:middle!important;color:color-mix(in srgb,var(--text) 62%,var(--muted))!important;border-bottom:1px dashed color-mix(in srgb,var(--border) 70%,transparent)!important}.queue-empty b{display:block;margin-top:10px;font-size:16px;font-weight:950}.queue-empty-icon{display:block;width:104px;height:76px;margin:0 auto;color:color-mix(in srgb,var(--accent) 78%,var(--muted))}.queue-empty-icon svg{width:100%;height:100%;fill:none;stroke:currentColor;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}.register-card .footer{position:relative;padding:28px 28px 24px!important;border-top:1px solid color-mix(in srgb,var(--border) 70%,transparent)!important;color:color-mix(in srgb,var(--text) 72%,var(--muted));font-size:15px}.register-card .footer:before{content:'';position:absolute;left:28px;right:28px;top:0;height:5px;border-radius:999px;background:linear-gradient(90deg,#a78bfa 0,#a78bfa 65%,color-mix(in srgb,var(--border) 55%,transparent) 65%,color-mix(in srgb,var(--border) 55%,transparent) 100%)}.register-card .pager{gap:14px}.register-card .pager label{display:flex;align-items:center;gap:10px;color:color-mix(in srgb,var(--text) 72%,var(--muted));font-weight:850}.register-card .pager select{height:44px;min-width:94px;border-radius:11px;font-size:15px;font-weight:950;padding:0 16px;background:var(--surface);color:var(--text)}.register-card .pager button{width:44px;height:44px;border-radius:11px;background:var(--surface);font-size:22px}.register-card .pager b{min-width:64px;text-align:center;color:var(--text);font-size:16px}
    .commission-workspace>.toolbar{grid-template-columns:repeat(12,minmax(0,1fr));gap:10px 12px!important;margin:0 0 12px!important}.commission-workspace>.toolbar .queue-select{height:44px!important;border-radius:10px!important;font-size:14px!important;font-weight:900!important;padding-left:42px!important;padding-right:36px!important;background-size:18px 18px,14px 14px!important;background-position:left 14px center,right 14px center!important}.queue-search{height:44px!important;border-radius:10px!important;font-size:14px!important;font-weight:800!important;padding-left:42px!important;background-size:18px 18px!important;background-position:left 14px center!important}.queue-refresh{height:44px!important;border-radius:10px!important;font-size:14px!important;gap:8px!important}.queue-refresh svg{width:18px!important;height:18px!important}.queue-search:focus{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent)!important}.commission-workspace>.toolbar .date-range-filters{padding:6px!important;border-radius:12px!important;background:transparent!important;border:1px solid color-mix(in srgb,var(--border) 72%,transparent)!important}.commission-workspace>.toolbar .date-range-filters input[type="date"]{height:32px!important;min-width:138px!important;border-radius:9px!important;font-size:12px!important}.commission-workspace>.toolbar .date-range-filters button{height:32px!important;border-radius:9px!important;font-size:11px!important;padding:0 10px!important;box-shadow:none!important}.register-card{border-radius:16px!important;box-shadow:none!important}.queue-panel-title{padding:18px 22px 16px!important}.queue-title-copy{gap:12px!important}.queue-title-icon{width:42px!important;height:42px!important}.queue-title-icon svg{width:23px!important;height:23px!important}.queue-title-copy h3{font-size:19px!important}.queue-title-copy p{font-size:13px!important;margin-top:4px!important}.queue-filter-button{width:38px!important;height:38px!important;border-radius:10px!important}.queue-filter-button svg{width:19px!important;height:19px!important}.register-card .table-wrap{padding:0 22px!important;max-height:460px!important}.register-card th{height:46px!important;font-size:11px!important}.register-card td{height:48px!important;font-size:12px!important}.queue-empty{height:170px!important}.queue-empty-icon{width:76px!important;height:56px!important}.queue-empty b{font-size:13px!important}.register-card .footer{padding:20px 22px 18px!important;font-size:13px!important}.register-card .footer:before{left:22px!important;right:22px!important;height:3px!important}.register-card .pager{gap:10px!important}.register-card .pager select{height:36px!important;min-width:78px!important;font-size:13px!important}.register-card .pager button{width:36px!important;height:36px!important;font-size:18px!important}.register-card .pager b{font-size:13px!important;min-width:48px!important}
    :host-context(body.light) .commission-workspace>.toolbar,:host-context(body.light-mode) .commission-workspace>.toolbar,:host-context(body:not(.dark-theme)) .commission-workspace>.toolbar{padding:12px!important;border:1px solid #d7dee9!important;border-radius:16px!important;background:#fff!important;box-shadow:0 10px 26px rgba(15,23,42,.06)!important}
    :host-context(body.light) .commission-tabs,:host-context(body.light-mode) .commission-tabs,:host-context(body:not(.dark-theme)) .commission-tabs{background:#fff!important;border-color:#d7dee9!important;box-shadow:0 8px 20px rgba(15,23,42,.04)}
    :host-context(body.light) .register-card,:host-context(body.light-mode) .register-card,:host-context(body:not(.dark-theme)) .register-card{background:#fff!important;border-color:#d7dee9!important;box-shadow:0 12px 30px rgba(15,23,42,.07)!important;color:#0f172a!important}
    :host-context(body.light) .commission-workspace>.toolbar .queue-select,:host-context(body.light) .queue-search,:host-context(body.light) .queue-refresh,:host-context(body.light-mode) .commission-workspace>.toolbar .queue-select,:host-context(body.light-mode) .queue-search,:host-context(body.light-mode) .queue-refresh,:host-context(body:not(.dark-theme)) .commission-workspace>.toolbar .queue-select,:host-context(body:not(.dark-theme)) .queue-search,:host-context(body:not(.dark-theme)) .queue-refresh{background-color:#fff!important;border-color:#cbd5e1!important;color:#0f172a!important;box-shadow:0 1px 0 rgba(15,23,42,.04)!important}
    :host-context(body.light) .queue-search::placeholder,:host-context(body.light-mode) .queue-search::placeholder,:host-context(body:not(.dark-theme)) .queue-search::placeholder{color:#64748b!important;opacity:1}
    :host-context(body.light) .commission-workspace>.toolbar .date-range-filters,:host-context(body.light-mode) .commission-workspace>.toolbar .date-range-filters,:host-context(body:not(.dark-theme)) .commission-workspace>.toolbar .date-range-filters{background:#f8fafc!important;border-color:#dbe4f0!important}
    :host-context(body.light) .commission-workspace>.toolbar .date-range-filters input,:host-context(body.light) .commission-workspace>.toolbar .date-range-filters button,:host-context(body.light-mode) .commission-workspace>.toolbar .date-range-filters input,:host-context(body.light-mode) .commission-workspace>.toolbar .date-range-filters button,:host-context(body:not(.dark-theme)) .commission-workspace>.toolbar .date-range-filters input,:host-context(body:not(.dark-theme)) .commission-workspace>.toolbar .date-range-filters button{background:#fff!important;border-color:#d7dee9!important;color:#0f172a!important}
    :host-context(body.light) .queue-title-copy h3,:host-context(body.light-mode) .queue-title-copy h3,:host-context(body:not(.dark-theme)) .queue-title-copy h3{color:#0f172a!important}
    :host-context(body.light) .queue-title-copy p,:host-context(body.light-mode) .queue-title-copy p,:host-context(body:not(.dark-theme)) .queue-title-copy p{color:#64748b!important}
    :host-context(body.light) .register-card th,:host-context(body.light-mode) .register-card th,:host-context(body:not(.dark-theme)) .register-card th{color:#334155!important;border-bottom-color:#dbe4f0!important}
    :host-context(body.light) .register-card td,:host-context(body.light-mode) .register-card td,:host-context(body:not(.dark-theme)) .register-card td{color:#0f172a!important;border-bottom-color:#edf2f7!important}
    :host-context(body.light) .queue-empty,:host-context(body.light-mode) .queue-empty,:host-context(body:not(.dark-theme)) .queue-empty{color:#475569!important}
    :host-context(body.light) .rule-form-shell,:host-context(body.light-mode) .rule-form-shell,:host-context(body:not(.dark-theme)) .rule-form-shell{background:#fff!important;border-color:#d7dee9!important;box-shadow:0 12px 30px rgba(15,23,42,.07)!important;color:#0f172a!important}
    :host-context(body.light) .rule-form-topbar,:host-context(body.light-mode) .rule-form-topbar,:host-context(body:not(.dark-theme)) .rule-form-topbar{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:14px!important;padding:12px!important}
    :host-context(body.light) .rule-form-topbar strong,:host-context(body.light-mode) .rule-form-topbar strong,:host-context(body:not(.dark-theme)) .rule-form-topbar strong{color:#0f172a!important}
    :host-context(body.light) .rule-form-topbar span,:host-context(body.light-mode) .rule-form-topbar span,:host-context(body:not(.dark-theme)) .rule-form-topbar span{color:#64748b!important}
    :host-context(body.light) .rule-stepper-head,:host-context(body.light-mode) .rule-stepper-head,:host-context(body:not(.dark-theme)) .rule-stepper-head{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:14px!important;padding:10px!important}
    :host-context(body.light) .rule-stepper-step,:host-context(body.light-mode) .rule-stepper-step,:host-context(body:not(.dark-theme)) .rule-stepper-step{background:#fff!important;border-color:#e2e8f0!important;color:#64748b!important}
    :host-context(body.light) .rule-stepper-step.active,:host-context(body.light-mode) .rule-stepper-step.active,:host-context(body:not(.dark-theme)) .rule-stepper-step.active{background:#eef4ff!important;border-color:#8fb1ff!important;color:#2563eb!important;box-shadow:0 8px 18px rgba(37,99,235,.10)!important}
    :host-context(body.light) .rule-stepper-step.done,:host-context(body.light-mode) .rule-stepper-step.done,:host-context(body:not(.dark-theme)) .rule-stepper-step.done{color:#0f172a!important}
    :host-context(body.light) .rule-step-panel,:host-context(body.light-mode) .rule-step-panel,:host-context(body:not(.dark-theme)) .rule-step-panel{background:#fff!important;border-color:#d7dee9!important;box-shadow:0 8px 22px rgba(15,23,42,.05)!important}
    :host-context(body.light) .form-section-title,:host-context(body.light-mode) .form-section-title,:host-context(body:not(.dark-theme)) .form-section-title{color:#2563eb!important;border-bottom-color:#dbe4f0!important}
    :host-context(body.light) .master-field,:host-context(body.light) .switch-field,:host-context(body.light-mode) .master-field,:host-context(body.light-mode) .switch-field,:host-context(body:not(.dark-theme)) .master-field,:host-context(body:not(.dark-theme)) .switch-field{color:#64748b!important}
    :host-context(body.light) .master-field input,:host-context(body.light) .master-field select,:host-context(body.light) .master-field textarea,:host-context(body.light-mode) .master-field input,:host-context(body.light-mode) .master-field select,:host-context(body.light-mode) .master-field textarea,:host-context(body:not(.dark-theme)) .master-field input,:host-context(body:not(.dark-theme)) .master-field select,:host-context(body:not(.dark-theme)) .master-field textarea{background:#fff!important;border-color:#cbd5e1!important;color:#0f172a!important;box-shadow:0 1px 0 rgba(15,23,42,.04)!important;color-scheme:light}
    :host-context(body.light) .master-field input[type="date"],:host-context(body.light) .date-field input[type="date"],:host-context(body.light-mode) .master-field input[type="date"],:host-context(body.light-mode) .date-field input[type="date"],:host-context(body:not(.dark-theme)) .master-field input[type="date"],:host-context(body:not(.dark-theme)) .date-field input[type="date"]{color-scheme:light!important}
    :host-context(body.light) .master-field input::placeholder,:host-context(body.light) .master-field textarea::placeholder,:host-context(body.light-mode) .master-field input::placeholder,:host-context(body.light-mode) .master-field textarea::placeholder,:host-context(body:not(.dark-theme)) .master-field input::placeholder,:host-context(body:not(.dark-theme)) .master-field textarea::placeholder{color:#64748b!important;opacity:1}
    :host-context(body.light) .switch-visual,:host-context(body.light-mode) .switch-visual,:host-context(body:not(.dark-theme)) .switch-visual{background:#e2e8f0!important;border-color:#cbd5e1!important}
    :host-context(body.light) .switch-line b,:host-context(body.light-mode) .switch-line b,:host-context(body:not(.dark-theme)) .switch-line b{color:#0f172a!important}
    :host-context(body.light) .action-btn.ghost,:host-context(body.light-mode) .action-btn.ghost,:host-context(body:not(.dark-theme)) .action-btn.ghost{background:#fff!important;border-color:#d7dee9!important;color:#0f172a!important}
    :host-context(body.light) .action-btn.ghost:hover,:host-context(body.light-mode) .action-btn.ghost:hover,:host-context(body:not(.dark-theme)) .action-btn.ghost:hover{background:#eef4ff!important;border-color:#8fb1ff!important;color:#2563eb!important}
    .register-card .footer:before{display:none!important}
    .register-card .table-wrap{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--accent) 45%,#cbd5e1) transparent}.register-card .table-wrap::-webkit-scrollbar{height:8px}.register-card .table-wrap::-webkit-scrollbar-track{background:transparent}.register-card .table-wrap::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--accent) 42%,#cbd5e1);border-radius:999px}
    .dashboard-skeleton,.kpi-grid,.insight-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.commission-dashboard-skeleton{grid-auto-rows:minmax(100px,auto)}.card-hitbox,.kpi-hitbox{position:relative;min-width:0;height:100%;padding-top:4px;margin-top:-4px}.card-surface,.kpi-surface{width:100%;height:100%;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;will-change:transform}.card-hitbox:hover .card-surface,.card-hitbox:focus-within .card-surface,.kpi-hitbox:hover .kpi-surface,.kpi-hitbox:focus-within .kpi-surface{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 14px 34px rgba(2,6,23,.24)}
    .kpi{position:relative;display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center;text-align:left;padding:14px;border:1px solid var(--border);border-radius:13px;background:linear-gradient(145deg,var(--panel,var(--surface)),var(--row,var(--surface-2)));color:var(--text);cursor:pointer;min-height:100px}.kpi.active{border-color:color-mix(in srgb,var(--accent) 76%,var(--border));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}.icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:18px;font-weight:950;color:#fff;background:#3b82f6}.icon.green{background:#18b86b}.icon.purple{background:#7456d8}.icon.orange{background:#f59e0b}.icon.red{background:#ef4f3f}.icon.pink{background:#d83d7d}.icon.teal{background:#10b7a3}.icon.blue{background:#3b82f6}.kpi-copy{display:grid;gap:4px;min-width:0}.kpi small{font-size:12px;color:var(--muted)}.kpi strong{font-size:21px;white-space:nowrap}.kpi em{font-style:normal;font-size:10px;color:var(--muted)}.open{position:absolute;right:10px;top:8px;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}
    .insight{border:1px solid var(--border);border-radius:13px;background:var(--panel,var(--surface));color:var(--text);padding:14px;text-align:left;cursor:pointer;min-height:230px;overflow:hidden}.rule-insight,.report-insight{cursor:default}.title{display:flex;justify-content:space-between;gap:12px;margin-bottom:12px}.title span{display:grid;gap:3px;min-width:0}.title b{font-size:14px}.title small{font-size:10px;color:var(--muted)}.title i{font-style:normal;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.mini-list{display:grid;gap:12px}.mini-list div{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding-bottom:9px;font-size:11px}.status-breakdown span{display:flex;align-items:center;gap:7px}.status-breakdown i{width:8px;height:8px;border-radius:99px;background:#3b82f6}.status-breakdown i.green{background:#18b86b}.status-breakdown i.purple{background:#7456d8}.status-breakdown i.orange{background:#f59e0b}.status-breakdown i.red{background:#ef4f3f}.status-breakdown i.pink{background:#d83d7d}.status-breakdown i.teal{background:#10b7a3}
    .bar-list{display:grid;gap:10px}.bar-list>div{display:grid;grid-template-columns:minmax(82px,98px) 1fr 90px;gap:8px;align-items:center;font-size:10px}.bar-list>div>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-list>div>div{height:7px;border-radius:99px;background:var(--row,var(--surface-2));overflow:hidden}.bar-list i{display:block;height:100%;background:#3b82f6;border-radius:99px}.bar-list b{text-align:right}
    .rule-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.rule-stats div{border:1px solid var(--border);border-radius:12px;background:var(--row,var(--surface-2));padding:9px}.rule-stats span{display:block;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.rule-stats b{display:block;margin-top:4px;font-size:17px}.group-chip-list{display:flex;gap:6px;flex-wrap:wrap;max-height:82px;overflow:auto;margin-bottom:10px}.group-chip-list button{max-width:190px;border:1px solid var(--border);border-radius:999px;background:var(--input,var(--surface-2));color:var(--text);padding:6px 10px;text-align:left;cursor:pointer}.group-chip-list b,.group-chip-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.group-chip-list b{font-size:11px}.group-chip-list small{color:var(--muted);font-size:9px}.compact-empty{min-height:60px;padding:12px}.insight-action{height:36px;width:100%;border-radius:11px}
    .compact-reports{grid-template-columns:1fr!important;padding:0!important;gap:8px;max-height:160px;overflow:auto}.compact-reports .report-card{padding:9px 10px;border-radius:11px}.compact-reports .report-card b{font-size:11px}.compact-reports .report-card small{font-size:9px;line-height:1.25}.compact-reports .report-actions{gap:5px}.btn.tiny{height:30px;min-width:48px}
    .skeleton-card,.skeleton-panel{overflow:hidden;position:relative;border:1px solid var(--border);border-radius:13px;background:var(--panel,var(--surface))}.skeleton-card{min-height:100px;padding:14px;display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center}.skeleton-card>span{width:42px;height:42px;border-radius:12px;background:var(--row,var(--surface-2))}.skeleton-card>div{display:grid;gap:8px}.skeleton-card i,.skeleton-card b,.skeleton-card em,.skeleton-panel i,.skeleton-panel b,.skeleton-panel em{display:block;border-radius:99px;background:linear-gradient(90deg,var(--row,var(--surface-2)) 25%,color-mix(in srgb,var(--muted) 24%,transparent) 45%,var(--row,var(--surface-2)) 65%);background-size:220% 100%;animation:skeletonPulse 1.25s linear infinite}.skeleton-card i{height:10px;width:55%}.skeleton-card b{height:20px;width:78%}.skeleton-card em{height:8px;width:68%}.skeleton-panel{min-height:230px;padding:14px}.skeleton-panel i{height:12px;width:48%;margin-bottom:18px}.skeleton-panel b{height:128px;width:100%;border-radius:10px}.skeleton-panel em{height:8px;width:72%;margin-top:14px}@keyframes skeletonPulse{to{background-position:-220% 0}}
    @media(max-width:1250px){.dashboard-skeleton,.kpi-grid,.insight-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.toolbar{align-items:flex-start}.dashboard-skeleton,.kpi-grid,.insight-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.dashboard-skeleton,.kpi-grid,.insight-grid{grid-template-columns:1fr}.toolbar .date-range-filters input[type="date"]{width:180px;min-width:180px}.toolbar .range-arrow{display:none}.toolbar select,.toolbar .search,.toolbar>.btn.secondary{width:100%;min-width:100%}.bar-list>div{grid-template-columns:82px 1fr 76px}.rule-stats{grid-template-columns:1fr}}
    @media(max-width:1100px){.rule-stepper-head{grid-template-columns:repeat(3,minmax(0,1fr))}.rule-step-grid,.pick-list{grid-template-columns:repeat(2,minmax(0,1fr))}.rule-review-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:720px){.commission-tabs{grid-template-columns:1fr 1fr}.rule-list-toolbar,.rule-stepper-head,.rule-step-grid,.pick-list,.rule-review-grid{grid-template-columns:1fr}.rule-form-topbar{align-items:flex-start;flex-direction:column}.rule-step-actions{justify-content:stretch}.rule-step-actions .action-btn{flex:1}.commission-tabs button{height:36px}}
    @media(max-width:900px){.commission-workspace>.toolbar{grid-template-columns:1fr 1fr}.consultant-select,.status-select,.queue-search,.queue-refresh{grid-column:auto!important}.queue-refresh{width:100%}.queue-panel-title{align-items:flex-start!important;flex-direction:column}.queue-head-actions{width:100%;justify-content:space-between}.register-card .table-wrap{padding:0 18px}.register-card .footer{padding-left:18px!important;padding-right:18px!important}.register-card .footer:before{left:18px;right:18px}}
    @media(max-width:620px){.commission-workspace>.toolbar{grid-template-columns:1fr}.consultant-select,.status-select,.queue-search,.queue-refresh{grid-column:1!important;width:100%!important;min-width:0!important}.commission-workspace>.toolbar .date-range-filters{grid-column:1!important}.queue-title-copy{align-items:flex-start}.queue-title-copy h3{font-size:19px!important}.queue-title-copy p{font-size:13px!important}.register-card .footer{align-items:flex-start!important;gap:16px}.register-card .pager{width:100%;justify-content:space-between;flex-wrap:wrap}.selection-actions{border-radius:14px!important;width:100%;justify-content:flex-start}}
  `]
})
export class CommissionsPageComponent implements OnInit, OnDestroy {
  @ViewChild('groupDialog') groupDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('settlementDialog') settlementDialog?: ElementRef<HTMLDialogElement>;
  @ViewChild('popupDialog') popupDialog?: ElementRef<HTMLDialogElement>;
  consultants = signal<any[]>([]); rows = signal<any[]>([]); totals = signal<any>({}); settlements = signal<any[]>([]);
  groups=signal<any[]>([]); tests=signal<any[]>([]); profiles=signal<any[]>([]); groupModal=signal(false); popup=signal<any>(null); popupOpen=signal(false); popupValue=''; private popupResolver:((value:any)=>void)|null=null; private popupSequence=0; itemSearch=''; itemTypeFilter:'ALL'|'TEST'|'PROFILE'='ALL'; itemSearchOpen=false; formulaState=''; formulaMessage=''; groupForm:any={};
  commissionTab:'register'|'rules'|'settlements'|'reports'='register'; ruleMasterView:'list'|'form'='list'; ruleFormMode:'create'|'edit'='create'; ruleMasterStep=0; ruleSearch=''; ruleStatus:'ALL'|'ACTIVE'|'ARCHIVED'='ALL';
  ruleMasterSteps=[{title:'Basic',caption:'Name and dates'},{title:'Calculation',caption:'Rate or formula'},{title:'Items',caption:'Tests/profiles'},{title:'Consultants',caption:'Assigned doctors'},{title:'Review',caption:'Confirm and save'}];
  loading=signal(false); saving=signal(false); exporting=signal(false); page=signal(1); pageSize=25; settlementModal=signal(false); selectedIds=signal<Set<number>>(new Set());
  filters:any={from:'',to:'',consultant_id:0,status:'ALL',search:''}; settlement:any={payment_mode:'Cash',reference_no:'',notes:''};
  reportTypes=[
    { id:'CONSULTANT_SUMMARY', label:'Consultant-wise summary', hint:'Totals by consultant with pending/approved/held/paid split' },
    { id:'BILL_DETAILS', label:'Bill-wise details', hint:'Commission rolled up per bill (Excel includes line items)' },
    { id:'PENDING', label:'Pending approval list', hint:'Generated entries waiting for review' },
    { id:'HELD', label:'Held commission list', hint:'Entries placed on hold with reason' },
    { id:'SETTLEMENT_HISTORY', label:'Paid settlement history', hint:'Settlement vouchers in the selected period' },
    { id:'CANCELLED_REVERSAL', label:'Cancelled / reversal list', hint:'Unpaid cancelled + paid reversal-pending' },
    { id:'PROFIT', label:'Profit with commission', hint:'Net, running cost, commission and profit' }
  ];
  totalPages=computed(()=>Math.max(1,Math.ceil(this.rows().length/this.pageSize)));
  pagedRows=computed(()=>this.rows().slice((this.page()-1)*this.pageSize,this.page()*this.pageSize));
  pageStart=computed(()=>this.rows().length?(this.page()-1)*this.pageSize+1:0); pageEnd=computed(()=>Math.min(this.page()*this.pageSize,this.rows().length));
  async ngOnInit(){ this.resetPopupState(); this.currentMonth(false); this.consultants.set(await window.limsApi.listConsultants()); this.tests.set(await window.limsApi.listTests(true)); this.profiles.set(await window.limsApi.listProfiles(true)); this.groups.set(await window.limsApi.listCommissionGroups?.() || []); await this.load(); }
  currentMonth(reload=true){const range=this.datePresets().currentMonth;this.filters.from=range.from;this.filters.to=range.to;if(reload)this.load();}
  openDatePicker(event: Event) { openNativeDatePicker(event); }
  setDatePreset(key: keyof ReturnType<typeof dateRangePresets>) { const range = this.datePresets()[key]; this.filters.from = range.from; this.filters.to = range.to; this.load(); }
  private datePresets() { return dateRangePresets(DateTimeSettingsService.nowInputValue()); }
  private matchesPreset(key: keyof ReturnType<typeof dateRangePresets>) { return matchesDateRange(this.filters.from, this.filters.to, this.datePresets()[key]); }
  isTodayRange() { return this.matchesPreset('today'); }
  isPreviousDayRange() { return this.matchesPreset('previousDay'); }
  isCurrentMonthRange() { return this.matchesPreset('currentMonth'); }
  isLastMonthRange() { return this.matchesPreset('lastMonth'); }
  isThirtyDayRange() { return this.matchesPreset('thirtyDays'); }
  isCurrentYearRange() { return this.matchesPreset('currentYear'); }
  isLastYearRange() { return this.matchesPreset('lastYear'); }
  setCommissionTab(tab:'register'|'rules'|'settlements'|'reports'){this.commissionTab=tab;}
  goToRuleStep(index:number){this.ruleMasterStep=Math.max(0,Math.min(index,this.ruleMasterSteps.length-1));}
  nextRuleStep(){this.goToRuleStep(this.ruleMasterStep+1);}
  prevRuleStep(){this.goToRuleStep(this.ruleMasterStep-1);}
  filteredGroups(){
    const q=this.ruleSearch.trim().toLowerCase();
    return this.groups().filter((g:any)=>{
      const active=g?.active!==false&&Number(g?.active??1)!==0;
      if(this.ruleStatus==='ACTIVE'&&!active)return false;
      if(this.ruleStatus==='ARCHIVED'&&active)return false;
      if(!q)return true;
      return [g.name,g.code,g.description,g.calculation_type,this.groupMethodLabel(g)].some((v:any)=>String(v||'').toLowerCase().includes(q));
    });
  }
  async load(){
    this.loading.set(true);
    try{
      const api=window.limsApi;
      if(!api.listCommissions)return;
      const data=await api.listCommissions(this.filters);
      let totals=data?.totals||{};
      if(this.filters.status&&this.filters.status!=='ALL'){
        const summary=await api.listCommissions({...this.filters,status:'ALL'});
        totals=summary?.totals||totals;
      }
      this.rows.set(data?.rows||[]);
      this.totals.set(totals);
      this.settlements.set(await api.listCommissionSettlements?.({from:this.filters.from,to:this.filters.to})||[]);
      this.page.set(1);
      this.selectedIds.set(new Set());
    }finally{
      this.loading.set(false);
    }
  }
  setStatus(s:string){this.filters.status=s;this.load();}
  commissionKpis(){
    const t=this.totals();
    return [
      {status:'ALL',label:'Total Payable',value:this.money(t.commission),note:`${t.records||0} entries | ${t.billCount||0} bills`,icon:'T',tone:'blue'},
      {status:'GENERATED',label:'Pending Review',value:this.money(t.generated),note:'Generated automatically',icon:'R',tone:'orange'},
      {status:'APPROVED',label:'Approved',value:this.money(t.approved),note:'Ready for settlement',icon:'A',tone:'green'},
      {status:'HELD',label:'Held',value:this.money(t.held),note:'Needs attention',icon:'H',tone:'purple'},
      {status:'PAID',label:'Paid',value:this.money(t.paid),note:'Settled commission',icon:'P',tone:'teal'},
      {status:'CANCELLED',label:'Cancelled',value:this.money(t.cancelled),note:'Unpaid on cancelled bills',icon:'C',tone:'red'},
      {status:'REVERSAL_PENDING',label:'Reversal Pending',value:this.money(t.reversal_pending),note:'Paid on cancelled bills',icon:'V',tone:'pink'}
    ];
  }
  statusRows(){
    const t=this.totals();
    return [
      {label:'Pending review',value:this.money(t.generated),tone:'orange'},
      {label:'Approved',value:this.money(t.approved),tone:'green'},
      {label:'Held',value:this.money(t.held),tone:'purple'},
      {label:'Paid',value:this.money(t.paid),tone:'teal'},
      {label:'Cancelled',value:this.money(t.cancelled),tone:'red'},
      {label:'Reversal pending',value:this.money(t.reversal_pending),tone:'pink'}
    ];
  }
  commissionMoneyRows(){
    const net=this.sumRows('net_amount');
    const cost=this.sumRows('running_cost');
    const profit=this.sumRows('profit_amount');
    const commission=Number(this.totals().commission||0);
    const max=Math.max(1,net,cost,profit,commission);
    return [
      {label:'Net billed',value:this.money(net),percent:this.percentOf(net,max)},
      {label:'Running cost',value:this.money(cost),percent:this.percentOf(cost,max)},
      {label:'Commission',value:this.money(commission),percent:this.percentOf(commission,max)},
      {label:'Profit',value:this.money(profit),percent:this.percentOf(profit,max)}
    ];
  }
  sumRows(key:string){return this.rows().reduce((s:number,r:any)=>s+Number(r?.[key]||0),0);}
  percentOf(value:any,total:any){return Math.max(3,Math.min(100,(Number(value||0)/Math.max(1,Number(total||0)))*100));}
  activeGroupCount(){return this.groups().filter((g:any)=>g?.active!==false&&Number(g?.active??1)!==0).length;}
  groupItemTotal(){return this.groups().reduce((s:number,g:any)=>s+(g?.items?.length||0),0);}
  groupConsultantTotal(){return this.groups().reduce((s:number,g:any)=>s+(g?.consultant_ids?.length||0),0);}
  money(v:any){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(v||0));}
  localDate(v:any){if(!v)return '-';const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-GB');}
  localDateTime(v:any){if(!v)return '-';const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):d.toLocaleString('en-IN');}
  statusLabel(s:string){return ({GENERATED:'Pending review',APPROVED:'Approved',HELD:'Held',PAID:'Paid',CANCELLED:'Cancelled',REVERSAL_PENDING:'Reversal pending'} as any)[s]||s;}
  toggleRow(id:number,e:any){const x=new Set(this.selectedIds());e.target.checked?x.add(id):x.delete(id);this.selectedIds.set(x);}
  toggleAll(e:any){const x=new Set(this.selectedIds());for(const r of this.pagedRows()){if(r.commission_status!=='PAID'&&r.commission_status!=='CANCELLED'&&r.commission_status!=='REVERSAL_PENDING')e.target.checked?x.add(r.id):x.delete(r.id);}this.selectedIds.set(x);}
  allVisibleSelected(){const eligible=this.pagedRows().filter(r=>r.commission_status!=='PAID'&&r.commission_status!=='CANCELLED'&&r.commission_status!=='REVERSAL_PENDING');return !!eligible.length&&eligible.every(r=>this.selectedIds().has(r.id));}
  async changeStatus(status:string){const ids=[...this.selectedIds()];let reason='';if(status==='HELD'){const result=await this.ask({title:'Hold selected commissions',message:'Enter the reason for placing these commission entries on hold.',tone:'warning',confirmText:'Place on hold',cancelText:'Cancel',input:true,inputLabel:'Hold reason',inputPlaceholder:'Reason for hold'});if(!result)return;reason=String(result);}await window.limsApi.updateCommissionStatus?.({ids,status,reason,filters:this.filters});await this.load();}
  selectedRows(){return this.rows().filter(r=>this.selectedIds().has(r.id));}
  selectedAmount(){return this.selectedRows().reduce((s,r)=>s+Number(r.commission_amount||0),0);}
  selectedConsultantName(){const names=[...new Set(this.selectedRows().map(r=>r.consultant_name).filter(Boolean))];return names.length===1?names[0]:names.length?`${names.length} consultants`:'-';}
  async openSettlement(){const rows=this.selectedRows();if(!rows.length)return;const consultants=new Set(rows.map(r=>Number(r.consultant_id||0)));if(consultants.size!==1){await this.notify('Select one consultant','Choose commission entries belonging to one consultant only.','warning');return;}if(rows.some(r=>r.commission_status!=='APPROVED')){await this.notify('Approval required','Only approved commission entries can be settled.','warning');return;}this.settlementModal.set(true);setTimeout(()=>this.settlementDialog?.nativeElement.showModal(),0);}
  closeSettlement(){const d=this.settlementDialog?.nativeElement;if(d?.open)d.close();this.settlementModal.set(false);this.settlement={payment_mode:'Cash',reference_no:'',notes:''};}
  onSettlementBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.closeSettlement();}
  async settle(){this.saving.set(true);try{const result=await window.limsApi.settleCommissions?.({ids:[...this.selectedIds()],...this.settlement});this.closeSettlement();await this.load();const settlementId=Number(result?.settlementId||0);if(settlementId){const open=await this.ask({title:'Settlement created',message:`${result?.settlementNo||'Settlement'} for ${this.money(result?.amount||0)} is ready.`,details:'Open the printable PDF voucher now?',tone:'success',confirmText:'Open PDF voucher',cancelText:'Later'});if(open)await this.exportSettlement(settlementId,'pdf');}}catch(e:any){await this.notify('Settlement failed',e?.message||String(e),'danger');}finally{this.saving.set(false);}}
  async exportSettlement(id:number, kind:'pdf'|'excel'){
    try{
      const api=window.limsApi;
      const file=kind==='excel'
        ? await api.commissionSettlementExcel?.(Number(id))
        : await api.commissionSettlementPdf?.(Number(id));
      if(!file)throw new Error('Export is not available.');
      await api.openPath(file);
    }catch(e:any){
      await this.notify(kind==='excel'?'Excel export failed':'PDF voucher failed', e?.message||String(e), 'danger');
    }
  }
  async exportReport(reportType:string, kind:'pdf'|'excel'){
    this.exporting.set(true);
    try{
      const payload={...this.filters, report_type:reportType};
      const api=window.limsApi;
      const file=kind==='excel'
        ? await api.commissionReportExcel?.(payload)
        : await api.commissionReportPdf?.(payload);
      if(!file)throw new Error('Report export is not available.');
      await api.openPath(file);
    }catch(e:any){
      await this.notify(kind==='excel'?'Report Excel failed':'Report PDF failed', e?.message||String(e), 'danger');
    }finally{
      this.exporting.set(false);
    }
  }
  blankGroup(){return {name:'',code:'',description:'',calculation_type:'PERCENT_NET',rate:10,fixed_amount:0,formula_type:'CUSTOM',formula_expression:'PROFIT * 20 / 100',discount_basis:'AFTER_DISCOUNT',profile_mode:'PROFILE_ONLY',min_enabled:false,max_enabled:false,min_commission:0,max_commission:0,effective_from:'',effective_to:'',active:true,items:[],consultant_ids:[]};}
  newGroup(){this.groupForm=this.blankGroup();this.itemSearch='';this.itemTypeFilter='ALL';this.itemSearchOpen=false;this.formulaState='';this.formulaMessage='';this.commissionTab='rules';this.ruleFormMode='create';this.ruleMasterView='form';this.ruleMasterStep=0;this.groupModal.set(false);}
  editGroup(g:any){this.groupForm=JSON.parse(JSON.stringify(g));this.groupForm.items=this.groupForm.items||[];this.groupForm.consultant_ids=this.groupForm.consultant_ids||[];this.groupForm.min_enabled=Number(this.groupForm.min_commission||0)>0;this.groupForm.max_enabled=Number(this.groupForm.max_commission||0)>0;this.itemSearch='';this.itemTypeFilter='ALL';this.itemSearchOpen=false;this.formulaState='';this.formulaMessage='';this.commissionTab='rules';this.ruleFormMode='edit';this.ruleMasterView='form';this.ruleMasterStep=0;this.groupModal.set(false);}
  closeGroup(){const d=this.groupDialog?.nativeElement;if(d?.open)d.close();this.groupModal.set(false);this.itemSearchOpen=false;this.groupForm={};this.ruleMasterView='list';this.ruleFormMode='create';this.ruleMasterStep=0;}
  onGroupBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.requestCloseGroup();}
  async requestCloseGroup(){if(!this.groupModal()&&this.ruleMasterView!=='form')return;const dirty=!!(String(this.groupForm?.name||'').trim()||(this.groupForm?.items||[]).length||(this.groupForm?.consultant_ids||[]).length);if(dirty){const ok=await this.ask({title:'Discard commission group changes?',message:'Your unsaved group configuration will be lost.',tone:'warning',confirmText:'Discard changes',cancelText:'Keep editing'});if(!ok)return;}this.closeGroup();}
  groupMethodLabel(g:any){const x=String(g.calculation_type||'');return ({PERCENT_NET:`${g.rate||0}% net`,PERCENT_PROFIT:`${g.rate||0}% profit`,PERCENT_GROSS:`${g.rate||0}% selling`,FIXED:`${this.money(g.fixed_amount||0)} fixed`,FORMULA:'Custom formula'} as any)[x]||x;}
  isActiveForBilling(x:any){return Number(x?.active ?? 1)===1&&Number(x?.billable ?? 1)===1;}
  allGroupItems(){return [...this.tests().filter((x:any)=>this.isActiveForBilling(x)).map((x:any)=>({item_type:'TEST',item_id:x.id,name:x.display_name||x.name||'Unnamed test',code:x.test_code||x.code||x.short_name||'',category:x.category_name||x.test_category_name||x.department_name||x.department||'',running_cost:x.running_cost||x.vendor_cost||0})),...this.profiles().filter((x:any)=>this.isActiveForBilling(x)).map((x:any)=>({item_type:'PROFILE',item_id:x.id,name:x.display_name||x.name||'Unnamed profile',code:x.profile_code||x.code||'',category:x.category_name||x.department_name||x.department||'',running_cost:x.running_cost||0}))];}
  filteredGroupItems(){const q=this.itemSearch.trim().toLowerCase();return this.allGroupItems().filter(x=>(this.itemTypeFilter==='ALL'||x.item_type===this.itemTypeFilter)&&(!q||[x.name,x.item_type,x.code,x.category].some((v:any)=>String(v||'').toLowerCase().includes(q)))).slice(0,300);}
  selectedGroupItemCount(){return (this.groupForm.items||[]).length;}
  selectedGroupItems(){const selected=this.groupForm.items||[];const all=this.allGroupItems();return selected.map((i:any)=>all.find((x:any)=>x.item_type===i.item_type&&Number(x.item_id)===Number(i.item_id))||i);}
  groupItemDescription(x:any){return [x.code,x.category].filter(Boolean).join(' · ')||`${x.item_type==='PROFILE'?'Billable profile':'Individual test'} · ID ${x.item_id}`;}
  selectedGroupConsultants(){const ids=new Set((this.groupForm.consultant_ids||[]).map((x:any)=>Number(x)));return this.consultants().filter((c:any)=>ids.has(Number(c.id)));}
  consultantCommissionGroupNames(consultantId:any){const ownId=Number(this.groupForm?.id||0);const names=this.groups().filter((g:any)=>Number(g?.id||0)!==ownId&&Number(g?.active??1)===1&&(g?.consultant_ids||[]).map(Number).includes(Number(consultantId))).map((g:any)=>String(g?.name||'Unnamed profile'));return names.slice(0,2).join(', ')+(names.length>2?` +${names.length-2} more`:'');}
  trackGroupItem(_index:number,x:any){return `${x.item_type}-${x.item_id}`;}
  groupItemExistingGroups(x:any){const ownId=Number(this.groupForm?.id||0);const key=`${String(x?.item_type||'TEST').toUpperCase()}-${Number(x?.item_id||x?.id||0)}`;return this.groups().filter((g:any)=>Number(g?.id||0)!==ownId&&Number(g?.active??1)===1&&(g?.items||[]).some((i:any)=>`${String(i?.item_type||'TEST').toUpperCase()}-${Number(i?.item_id||i?.id||0)}`===key));}
  groupItemExistingGroupNames(x:any){const names=this.groupItemExistingGroups(x).map((g:any)=>String(g?.name||'Unnamed profile'));return names.slice(0,2).join(', ')+(names.length>2?` +${names.length-2} more`:'');}
  groupItemOverlapDetails(items:any[]){const rows=(items||[]).filter((x:any)=>this.groupItemExistingGroups(x).length).map((x:any)=>`${x.name||'Selected item'}: ${this.groupItemExistingGroupNames(x)}`);return rows.slice(0,6).join(' | ')+(rows.length>6?` | +${rows.length-6} more`: '');}
  async confirmGroupItemOverlap(items:any[]){const conflicts=(items||[]).filter((x:any)=>this.groupItemExistingGroups(x).length);if(!conflicts.length)return true;return !!await this.ask({title:'Already used in commission profile',message:`${conflicts.length} selected item${conflicts.length===1?' is':'s are'} already used in another active commission profile.`,details:this.groupItemOverlapDetails(conflicts),tone:'warning',confirmText:'Select anyway',cancelText:'Review items'});}
  async toggleGroupItemDirect(x:any){this.groupForm.items=this.groupForm.items||[];if(this.groupHasItem(x)){this.groupForm.items=this.groupForm.items.filter((i:any)=>!(i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id)));return;}if(!await this.confirmGroupItemOverlap([x]))return;this.groupForm.items.push({...x});}
  allVisibleGroupItemsSelected(){const visible=this.filteredGroupItems();return !!visible.length&&visible.every(x=>this.groupHasItem(x));}
  async toggleAllVisibleGroupItems(){const visible=this.filteredGroupItems();const remove=this.allVisibleGroupItemsSelected();if(remove){const keys=new Set(visible.map(x=>`${x.item_type}-${Number(x.item_id)}`));this.groupForm.items=(this.groupForm.items||[]).filter((i:any)=>!keys.has(`${i.item_type}-${Number(i.item_id)}`));}else{this.groupForm.items=this.groupForm.items||[];const add=visible.filter(x=>!this.groupHasItem(x));if(!await this.confirmGroupItemOverlap(add))return;for(const x of add)this.groupForm.items.push({...x});}}
  groupHasItem(x:any){return (this.groupForm.items||[]).some((i:any)=>i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id));}
  async toggleGroupItem(x:any,e:any){this.groupForm.items=this.groupForm.items||[];if(e.target.checked&&!this.groupHasItem(x)){if(!await this.confirmGroupItemOverlap([x])){e.target.checked=false;return;}this.groupForm.items.push(x);}if(!e.target.checked)this.groupForm.items=this.groupForm.items.filter((i:any)=>!(i.item_type===x.item_type&&Number(i.item_id)===Number(x.item_id)));}
  groupHasConsultant(id:number){return (this.groupForm.consultant_ids||[]).map(Number).includes(Number(id));}
  toggleGroupConsultant(id:number,e:any){const x=new Set((this.groupForm.consultant_ids||[]).map(Number));e.target.checked?x.add(Number(id)):x.delete(Number(id));this.groupForm.consultant_ids=[...x];}
  async validateGroupFormula(){const r=await window.limsApi.validateCommissionFormula?.({formula:this.groupForm.formula_expression});this.formulaState=r?.valid?'valid':'invalid';this.formulaMessage=r?.valid?`Valid · sample commission ${this.money(r.result)}`:(r?.error||'Invalid formula');}
  async saveGroup(){if(!String(this.groupForm.name||'').trim()){await this.notify('Group name required','Enter a name for this commission group before saving.','warning');return;}if(this.groupForm.calculation_type==='FORMULA'){const r=await window.limsApi.validateCommissionFormula?.({formula:this.groupForm.formula_expression});if(!r?.valid){await this.notify('Invalid commission formula',r?.error||'Formula is invalid.','danger');return;}}const payload={...this.groupForm,min_commission:this.groupForm.min_enabled?Number(this.groupForm.min_commission||0):0,max_commission:this.groupForm.max_enabled?Number(this.groupForm.max_commission||0):0};this.saving.set(true);try{const out=await window.limsApi.saveCommissionGroup?.(payload);this.groups.set(out?.groups||await window.limsApi.listCommissionGroups?.()||[]);this.closeGroup();}catch(e:any){await this.notify('Unable to save commission group',e?.message||String(e),'danger');}finally{this.saving.set(false);}}
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
