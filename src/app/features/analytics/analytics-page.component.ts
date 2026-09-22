import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { dateRangeFilterError } from '../../shared/date-range-filters';

type DetailRow = Record<string, any>;
type DetailColumn = {key:string;label:string;money?:boolean;status?:boolean};
type ModalState = { title:string; subtitle:string; columns:DetailColumn[]; rows:DetailRow[] } | null;

@Component({
  selector: 'app-analytics-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule],
  template: `
    <section class="analytics-page">
      <header class="page-head">
        <div class="filters" aria-label="Analytics date filters">
          <label class="date-field"><input type="date" [(ngModel)]="fromDate" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (change)="reload()"></label><span class="range-arrow">→</span>
          <label class="date-field"><input type="date" [(ngModel)]="toDate" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (change)="reload()"></label>
          <button type="button" [class.active]="isTodayRange" (click)="setRange(0)">Today</button>
          <button type="button" [class.active]="isPreviousDayRange" (click)="setPreviousDay()">Previous Day</button>
          <button type="button" [class.active]="isCurrentMonthRange" (click)="setCurrentMonth()">Current Month</button>
          <button type="button" [class.active]="isLastMonthRange" (click)="setLastMonth()">Last Month</button>
          <button type="button" [class.active]="isThirtyDayRange" (click)="setRange(29)">30 Days</button>
          <button type="button" [class.active]="isCurrentYearRange" (click)="setCurrentYear()">Current Year</button>
          <button type="button" [class.active]="isLastYearRange" (click)="setLastYear()">Last Year</button>
          <button type="button" class="icon-btn" title="Refresh" (click)="reload()">↻</button>
        </div>
        <p class="date-range-error" *ngIf="dateError">{{dateError}}</p>
      </header>

      <div class="kpi-grid" *ngIf="!dateError">
        <div class="kpi-hitbox" *ngFor="let card of kpiCards; trackBy: trackKpiByKey" [class.is-loading]="card.loading">
          <button type="button" class="kpi kpi-surface" (click)="openMetric(card.key)" [disabled]="card.loading">
            <ng-container *ngIf="!card.loading; else kpiLoader">
              <span class="icon" [class]="'icon '+card.tone">{{card.icon}}</span>
              <span class="kpi-copy"><small>{{card.label}}</small><strong>{{card.value}}</strong><em>{{card.note}}</em></span>
              <span class="open">↗</span>
            </ng-container>
            <ng-template #kpiLoader>
              <span [class]="'icon ghost '+card.tone">{{card.icon}}</span>
              <span class="kpi-copy"><small>{{card.label}}</small><strong class="card-loading-text">Loading…</strong><em>Fetching period totals</em></span>
              <span class="card-spinner" aria-hidden="true"></span>
            </ng-template>
          </button>
        </div>
      </div>

      <div class="insight-grid" *ngIf="!dateError">
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openDaily()" [disabled]="!chartsReady">
            <div class="title"><span><b>{{dailyTrendTitle}}</b><small>Billed value</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading chart…</small></div>
            <div class="trend-bars" *ngIf="chartsReady"><div *ngFor="let x of dailyRows" class="trend-bar" [title]="x.label + ': ' + money(x.billed)"><i [style.height.%]="percent(x.billed,dailyMax)"></i><span>{{x.label}}</span></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openPayments()" [disabled]="!chartsReady">
            <div class="title"><span><b>Payment Mode Distribution</b><small>By collected amount</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading chart…</small></div>
            <div class="donut-wrap" *ngIf="chartsReady"><div class="donut" [style.background]="paymentDonut"></div><div class="legend"><div *ngFor="let row of paymentRows"><span class="dot"></span><span>{{row.label}}</span><b>{{money(row.value)}} ({{percent(row.value,totalPaid)|number:'1.0-1'}}%)</b></div></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!itemsReady">
          <button type="button" class="insight card-surface" (click)="openTopTests()" [disabled]="!itemsReady">
            <div class="title"><span><b>Top Tests & Profiles</b><small>{{itemsReady ? (topItems.length + ' items/groups · item count and billed value') : 'Loading item totals…'}}</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!itemsReady"><span class="card-spinner"></span><small>Loading tests…</small></div>
            <div class="bar-list" *ngIf="itemsReady"><div *ngFor="let row of topItems.slice(0,5)"><span>{{row.name}}</span><div><i [style.width.%]="percent(row.count,topItemCountMax)"></i></div><b>{{row.count}} items · {{money(row.value)}}</b></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openConsultants()" [disabled]="!chartsReady">
            <div class="title"><span><b>Consultants</b><small>{{chartsReady ? (consultantRows.length + ' used in selected period') : 'Loading…'}}</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading consultants…</small></div>
            <div class="bar-list purple all-consultants" *ngIf="chartsReady"><div *ngFor="let row of consultantRows"><span>{{row.name}}</span><div><i [style.width.%]="percent(row.billed,consultantMax)"></i></div><b>{{row.count}} bills · {{money(row.billed)}}</b></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openStatuses()" [disabled]="!chartsReady">
            <div class="title"><span><b>Bill Status Summary</b><small>By number of bills</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading statuses…</small></div>
            <div class="mini-list" *ngIf="chartsReady"><div *ngFor="let row of statusRows"><span>{{row.label}}</span><b>{{row.value}} ({{percent(row.value, totalBillsForStatus)|number:'1.0-1'}}%)</b></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openAgeing()" [disabled]="!chartsReady">
            <div class="title"><span><b>Outstanding Ageing</b><small>By days</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading ageing…</small></div>
            <div class="mini-list" *ngIf="chartsReady"><div *ngFor="let row of ageingRows"><span>{{row.label}}</span><b>{{money(row.value)}} ({{percent(row.value,totalDue)|number:'1.0-1'}}%)</b></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!chartsReady">
          <button type="button" class="insight card-surface" (click)="openCollections()" [disabled]="!chartsReady">
            <div class="title"><span><b>Collections Trend</b><small>Collected amount</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!chartsReady"><span class="card-spinner"></span><small>Loading chart…</small></div>
            <div class="trend-bars green" *ngIf="chartsReady"><div *ngFor="let x of dailyRows" class="trend-bar" [title]="x.label + ': ' + money(x.paid)"><i [style.height.%]="percent(x.paid,collectionMax)"></i><span>{{x.label}}</span></div></div>
          </button>
        </div>
        <div class="card-hitbox" [class.is-loading]="!kpisReady">
          <button type="button" class="insight card-surface" (click)="openMonthly()" [disabled]="!kpisReady">
            <div class="title"><span><b>Monthly Summary</b><small>Current vs previous period</small></span><i>↗</i></div>
            <div class="card-body-loader" *ngIf="!kpisReady"><span class="card-spinner"></span><small>Loading summary…</small></div>
            <ng-container *ngIf="kpisReady">
              <div class="month-row"><span>Selected period</span><b>{{money(totalBilled)}}</b></div>
              <div class="month-row"><span>Previous period</span><b>{{money(previousBilled)}}</b></div>
              <strong class="growth" [class.down]="growthPercent<0">{{growthPercent>=0?'↑':'↓'}} {{growthPercent|number:'1.0-1'}}% change</strong>
            </ng-container>
          </button>
        </div>
      </div>
    </section>

    <dialog #analyticsDialog class="output-modal-backdrop analytics-output-backdrop" *ngIf="modal" (click)="onDialogBackdropClick($event)" (cancel)="$event.preventDefault(); closeModal()" (wheel)="$event.stopPropagation()" (touchmove)="$event.stopPropagation()">
      <section class="history-modal approved-action-modal rich-output-modal analytics-output-modal" role="document" [attr.aria-label]="modal.title" (click)="$event.stopPropagation()">
        <header class="output-modal-header">
          <div class="output-modal-heading">
            <span class="output-modal-icon">↗</span>
            <div><h3>{{modal.title}}</h3><p>{{modal.subtitle}}</p></div>
          </div>
          <button type="button" class="output-modal-close" aria-label="Close" (click)="closeModal()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </button>
        </header>
        <div class="output-modal-meta">
          <div><span>From</span><b>{{displayDate(fromDate)}}</b></div>
          <div><span>To</span><b>{{displayDate(toDate)}}</b></div>
          <div><span>Records</span><b>{{modalLoading ? 'Loading…' : modalFilteredTotal}}</b></div>
        </div>
        <main class="output-modal-body analytics-modal-body">
          <div class="modal-skeleton" *ngIf="modalLoading"><i *ngFor="let n of modalSkeletonRows"></i></div>
          <ng-container *ngIf="!modalLoading">
            <div class="modal-tools" *ngIf="modal">
              <label class="modal-search"><span>Search</span><input [(ngModel)]="modalSearch" (ngModelChange)="resetModalPage()" placeholder="Search visible columns"></label>
              <label *ngIf="modalStatusOptions.length"><span>Status</span><select [(ngModel)]="modalStatusFilter" (ngModelChange)="resetModalPage()"><option value="">All statuses</option><option *ngFor="let option of modalStatusOptions" [value]="option">{{option}}</option></select></label>
              <label *ngIf="modalConsultantOptions.length"><span>Consultant</span><select [(ngModel)]="modalConsultantFilter" (ngModelChange)="resetModalPage()"><option value="">All consultants</option><option *ngFor="let option of modalConsultantOptions" [value]="option">{{option}}</option></select></label>
              <label *ngIf="modalPaymentOptions.length"><span>Payment mode</span><select [(ngModel)]="modalPaymentFilter" (ngModelChange)="resetModalPage()"><option value="">All modes</option><option *ngFor="let option of modalPaymentOptions" [value]="option">{{option}}</option></select></label>
              <button type="button" class="clear-filter" (click)="clearModalFilters()" [disabled]="!hasModalFilters">Clear filters</button>
            </div>
            <div class="analytics-table-shell" *ngIf="modalFilteredTotal">
              <table><thead><tr><th *ngFor="let c of modal.columns" (click)="sortModal(c.key)" class="sortable">{{c.label}} <span *ngIf="modalSortKey===c.key">{{modalSortDirection==='asc'?'▲':'▼'}}</span></th></tr></thead><tbody><tr *ngFor="let row of modalPageRows"><td *ngFor="let c of modal.columns" [class.money-cell]="c.money"><span *ngIf="c.status; else plainCell" class="status-badge" [attr.data-status]="statusText(row[c.key])">{{displayCell(row,c)}}</span><ng-template #plainCell>{{displayCell(row,c)}}</ng-template></td></tr></tbody></table>
            </div>
            <div class="empty" *ngIf="!modalFilteredTotal"><b>No analytics data</b><span>No records were found for the selected date range.</span></div>
          </ng-container>
        </main>
        <div class="export-overlay" *ngIf="exportChooser">
          <div class="export-chooser">
            <b>Export options</b>
            <small>{{exportChooser.total.toLocaleString('en-IN')}} bills from {{displayDate(fromDate)}} to {{displayDate(toDate)}} — too many for one detailed PDF (limit {{exportDetailPdfMax.toLocaleString('en-IN')}}).</small>
            <button type="button" class="chooser-opt primary" (click)="confirmExport('daily')" [disabled]="exportLoading">
              <strong>Daily summary PDF</strong>
              <span>One row per day for the full period. Use for year / large ranges.</span>
            </button>
            <button type="button" class="chooser-opt" (click)="confirmExport('full')" [disabled]="exportLoading">
              <strong>Full bill list (Excel)</strong>
              <span>Every bill line — recommended when you need detailed rows beyond the PDF limit.</span>
            </button>
            <button type="button" class="chooser-cancel" (click)="cancelExportChooser()" [disabled]="exportLoading">Cancel</button>
          </div>
        </div>
        <div class="export-overlay" *ngIf="exportLoading"><div class="export-loader"><span></span><b>{{exportMessage}}</b><small>{{exportHint}}</small></div></div>
        <footer class="output-modal-footer analytics-paged-footer">
          <div class="output-footer-summary">
            <b>{{modalLoading ? 'Loading details…' : modalRangeLabel}}</b>
            <small>{{displayDate(fromDate)}} to {{displayDate(toDate)}}</small>
          </div>
          <div class="modal-pagination" *ngIf="!modalLoading && modalFilteredTotal">
            <label>Rows
              <select [ngModel]="modalPageSize" (ngModelChange)="changeModalPageSize($event)">
                <option *ngFor="let size of modalPageSizes" [ngValue]="size">{{size}}</option>
              </select>
            </label>
            <button type="button" class="page-nav" (click)="goToModalPage(modalPage-1)" [disabled]="modalPage<=1" aria-label="Previous page">‹</button>
            <button type="button" class="page-number" *ngFor="let page of modalVisiblePages" [class.active]="page===modalPage" (click)="goToModalPage(page)">{{page}}</button>
            <button type="button" class="page-nav" (click)="goToModalPage(modalPage+1)" [disabled]="modalPage>=modalTotalPages" aria-label="Next page">›</button>
          </div>
          <div class="output-footer-actions"><button type="button" class="print-btn" (click)="downloadPdf()" [disabled]="modalLoading || exportLoading || !!exportChooser || !modalFilteredTotal">Download PDF</button><button type="button" class="xlsx-btn" (click)="downloadXlsx()" [disabled]="modalLoading || exportLoading || !!exportChooser || !modalFilteredTotal">Download XLSX</button><button type="button" class="close-btn" (click)="closeModal()">Close</button></div>
        </footer>
      </section>
    </dialog>
  `,
  styles: [`
    :host{display:block;color:var(--text)}
    .analytics-page{display:grid;gap:16px}.page-head{display:flex;justify-content:flex-start;align-items:flex-start;gap:8px;flex-direction:column;min-height:40px;width:100%}
    .filters{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;width:100%;margin:0}.date-field{display:block}.range-arrow{color:var(--muted);font-weight:900}.filters input,.filters button{height:36px;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text);padding:0 12px;font-weight:850;outline:none}.filters input:focus,.filters button:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.filters button{cursor:pointer}.filters button.active{background:var(--accent-gradient);border-color:transparent;color:#fff;box-shadow:var(--glow)}.icon-btn{font-size:18px;min-width:40px}
    .date-range-error{margin:8px 0 0;padding:8px 12px;border:1px solid rgba(239,68,68,.35);border-radius:12px;background:rgba(239,68,68,.08);color:#ef4444;font-size:12.5px;font-weight:800;width:100%}
    .filters input[type="date"]{width:220px;min-width:220px;box-sizing:border-box;appearance:none;-webkit-appearance:none;color:#f8fafc!important;background-color:color-mix(in srgb,var(--input) 92%,var(--panel));background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23f8fafc' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-size:18px 18px;font-weight:850;letter-spacing:.01em;color-scheme:dark;padding-right:46px!important;cursor:pointer}
    .filters input[type="date"]::-webkit-datetime-edit,.filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,.filters input[type="date"]::-webkit-datetime-edit-text,.filters input[type="date"]::-webkit-datetime-edit-month-field,.filters input[type="date"]::-webkit-datetime-edit-day-field,.filters input[type="date"]::-webkit-datetime-edit-year-field{color:#f8fafc!important}
    .filters input[type="date"]::-webkit-calendar-picker-indicator{opacity:0!important;cursor:pointer;width:42px;height:100%;margin-right:-8px}
    :host-context(.light) .filters input[type="date"],:host-context(.light-mode) .filters input[type="date"],:host-context(body:not(.dark-theme)) .filters input[type="date"]{background-color:#fff;color:#0f172a!important;color-scheme:light;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")}
    :host-context(.light) .filters input[type="date"]::-webkit-datetime-edit,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-year-field{color:#0f172a!important}
    .kpi-grid,.insight-grid,.dashboard-skeleton{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card-hitbox{position:relative;min-width:0;height:100%;padding-top:4px;margin-top:-4px}.card-surface{width:100%;height:100%;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;will-change:transform}.card-hitbox:not(.is-loading):hover .card-surface,.card-hitbox:not(.is-loading):focus-within .card-surface{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 14px 34px rgba(2,6,23,.24)}.kpi-hitbox{position:relative;min-width:0;height:100%;padding-top:6px;margin-top:-6px;cursor:pointer}.kpi-hitbox.is-loading{cursor:default}.kpi-surface{width:100%;height:100%;transform:translate3d(0,0,0);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;will-change:transform}.kpi-hitbox:not(.is-loading):hover .kpi-surface,.kpi-hitbox:not(.is-loading):focus-within .kpi-surface{transform:translate3d(0,-4px,0);border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 14px 34px rgba(2,6,23,.24)}
    .kpi{position:relative;display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center;text-align:left;padding:14px;border:1px solid var(--border);border-radius:13px;background:linear-gradient(145deg,var(--panel),var(--row));color:var(--text);cursor:pointer;min-height:100px}.kpi:disabled{cursor:default;opacity:.92}.kpi:disabled:hover{transform:none;box-shadow:none}.icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:21px;color:#fff;background:#3b82f6}.icon.green{background:#18b86b}.icon.purple{background:#7456d8}.icon.orange{background:#f59e0b}.icon.red{background:#ef4f3f}.icon.pink{background:#d83d7d}.icon.teal{background:#10b7a3}.icon.ghost{opacity:.45;filter:grayscale(.35)}.kpi-copy{display:grid;gap:4px;min-width:0}.kpi small{font-size:12px;color:var(--muted)}.kpi strong{font-size:21px;white-space:nowrap}.kpi em{font-style:normal;font-size:10px;color:var(--muted)}.card-loading-text{color:var(--muted)!important;font-size:15px!important;letter-spacing:.02em}.open{position:absolute;right:10px;top:8px;color:var(--muted)}
    .card-spinner{width:18px;height:18px;border:2.5px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .75s linear infinite;flex:0 0 auto}.kpi .card-spinner{position:absolute;right:12px;top:12px}.card-body-loader{min-height:140px;display:grid;place-content:center;justify-items:center;gap:10px;color:var(--muted)}.card-body-loader .card-spinner{width:28px;height:28px;border-width:3px}.card-body-loader small{font-size:11px;font-weight:800}.insight:disabled{cursor:default;opacity:.95}.insight:disabled:hover{transform:none;box-shadow:none}
    .insight{border:1px solid var(--border);border-radius:13px;background:var(--panel);color:var(--text);padding:14px;text-align:left;cursor:pointer;min-height:210px;overflow:hidden}.title{display:flex;justify-content:space-between;margin-bottom:12px}.title span{display:grid;gap:3px}.title b{font-size:14px}.title small{font-size:10px;color:var(--muted)}.title i{font-style:normal;color:var(--muted)}.line-chart{height:125px;color:#3b82f6;position:relative;background:repeating-linear-gradient(to bottom,transparent 0,transparent 30px,var(--border) 31px)}.line-chart.green{color:#36c96b}.line-chart svg{width:100%;height:100%}.axis{display:flex;justify-content:space-between;color:var(--muted);font-size:9px}.donut-wrap{display:grid;grid-template-columns:115px 1fr;gap:14px;align-items:center}.donut{width:110px;height:110px;border-radius:50%;position:relative}.donut:after{content:'';position:absolute;inset:24px;border-radius:50%;background:var(--panel)}.legend{display:grid;gap:8px}.legend div{display:grid;grid-template-columns:8px 1fr auto;gap:7px;align-items:center;font-size:10px}.legend b{font-size:9px}.dot{height:7px;width:7px;border-radius:50%;background:#38c982}.all-consultants{max-height:170px;overflow:auto;padding-right:4px}.bar-list{display:grid;gap:10px}.bar-list>div{display:grid;grid-template-columns:minmax(70px,90px) 1fr 70px;gap:8px;align-items:center;font-size:10px}.bar-list>div>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bar-list>div>div{height:7px;border-radius:99px;background:var(--row);overflow:hidden}.bar-list i{display:block;height:100%;background:#3b82f6;border-radius:99px}.bar-list.purple i{background:#9b6ce5}.bar-list b{text-align:right}.mini-list{display:grid;gap:12px}.mini-list div,.month-row{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--border);padding-bottom:9px;font-size:11px}.month-row{padding:12px 0}.growth{display:block;margin-top:12px;color:#35c86d;font-size:12px}.growth.down{color:#ef5350}
    dialog.output-modal-backdrop{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;background:transparent!important;padding:28px!important;box-sizing:border-box!important;overflow:hidden!important;display:grid!important;place-items:center!important;color:var(--text);overscroll-behavior:contain}
    dialog.output-modal-backdrop::backdrop{background:rgba(15,23,42,.74);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
    .history-modal{border:1px solid var(--border);background:var(--panel);color:var(--text);box-shadow:var(--shadow)}
    .rich-output-modal{width:min(1320px,94vw);height:min(860px,90vh);max-height:90vh;overflow:hidden!important;padding:0!important;display:flex;flex-direction:column;border-radius:26px;box-shadow:0 28px 90px rgba(2,6,23,.45);margin:auto;box-sizing:border-box;min-width:0}
    .output-modal-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,color-mix(in srgb,var(--panel) 90%,var(--accent)),var(--panel))}
    .output-modal-heading{display:flex;align-items:center;gap:12px;min-width:0}.output-modal-heading>div{min-width:0}.output-modal-heading h3{margin:0;font-size:19px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.output-modal-heading p{margin:4px 0 0;color:var(--muted);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.output-modal-icon{width:42px;height:42px;min-width:42px;border-radius:14px;display:grid;place-items:center;background:var(--accent-gradient);color:#fff;font-size:20px;box-shadow:var(--glow)}
    .output-modal-close{width:42px;height:42px;min-width:42px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--panel) 92%,transparent);color:var(--text);display:grid;place-items:center;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease;appearance:none}.output-modal-close svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}.output-modal-close:hover{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.42);color:#f87171;transform:scale(1.04)}
    .output-modal-meta{flex:0 0 auto;display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.output-modal-meta>div{padding:13px 24px;border-right:1px solid var(--border);min-width:0}.output-modal-meta>div:last-child{border-right:0}.output-modal-meta span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.output-modal-meta b{display:block;margin-top:5px;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .output-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px 22px;scrollbar-gutter:stable}.analytics-modal-body{padding:0!important;background:var(--panel)}.analytics-table-shell{min-width:100%;overflow:auto;padding:0 20px 22px;box-sizing:border-box}.analytics-table-shell table{width:100%;border-collapse:separate;border-spacing:0}.analytics-table-shell th,.analytics-table-shell td{padding:12px;border-bottom:1px solid var(--border);text-align:left;white-space:nowrap;font-size:12px}.analytics-table-shell th{position:sticky;top:0;z-index:2;background:var(--panel);font-size:10px;text-transform:uppercase;color:var(--muted);box-shadow:0 1px var(--border)}
    .output-modal-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:15px 24px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row));box-shadow:0 -10px 28px rgba(2,6,23,.12)}.output-footer-summary b,.output-footer-summary small{display:block}.output-footer-summary b{font-size:13px}.output-footer-summary small{margin-top:2px;color:var(--muted);font-size:11px}.output-footer-actions{display:flex;align-items:center;gap:9px}.print-btn,.close-btn{height:36px;border:1px solid var(--border);border-radius:11px;background:var(--input);color:var(--text);padding:0 18px;font-weight:900;cursor:pointer}.print-btn{background:var(--accent-gradient);border-color:transparent;color:#fff}.print-btn:disabled{opacity:.55;cursor:not-allowed}.analytics-paged-footer{display:grid;grid-template-columns:minmax(170px,1fr) auto minmax(180px,1fr);align-items:center}.modal-pagination{display:flex;align-items:center;justify-content:center;gap:6px;min-width:0}.modal-pagination label{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:11px;font-weight:800;white-space:nowrap}.modal-pagination select{height:34px;min-width:62px;border:1px solid var(--border);border-radius:9px;background:var(--input);color:var(--text);padding:0 8px;outline:none}.page-nav,.page-number{height:34px;min-width:34px;border:1px solid var(--border);border-radius:9px;background:var(--input);color:var(--text);font-weight:900;cursor:pointer}.page-number.active{background:var(--accent-gradient);border-color:transparent;color:#fff}.page-nav:disabled,.page-number:disabled{opacity:.42;cursor:not-allowed}.analytics-paged-footer .output-footer-actions{justify-content:flex-end}
    .empty{height:100%;min-height:260px;display:grid;place-content:center;text-align:center;color:var(--muted);gap:5px}.empty b{color:var(--text);font-size:16px}.empty span{font-size:12px}
    .skeleton-card,.skeleton-panel{overflow:hidden;position:relative;border:1px solid var(--border);border-radius:13px;background:var(--panel)}.skeleton-card{min-height:100px;padding:14px;display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center}.skeleton-card>span{width:42px;height:42px;border-radius:12px;background:var(--row)}.skeleton-card>div{display:grid;gap:8px}.skeleton-card i,.skeleton-card b,.skeleton-card em,.skeleton-panel i,.skeleton-panel b,.skeleton-panel em,.modal-skeleton i{display:block;border-radius:99px;background:linear-gradient(90deg,var(--row) 25%,color-mix(in srgb,var(--muted) 24%,transparent) 45%,var(--row) 65%);background-size:220% 100%;animation:skeletonPulse 1.25s linear infinite}.skeleton-card i{height:10px;width:55%}.skeleton-card b{height:20px;width:78%}.skeleton-card em{height:8px;width:68%}.skeleton-panel{min-height:210px;padding:14px}.skeleton-panel i{height:12px;width:48%;margin-bottom:18px}.skeleton-panel b{height:116px;width:100%;border-radius:10px}.skeleton-panel em{height:8px;width:72%;margin-top:14px}.modal-skeleton{display:grid;gap:12px;padding:20px 0}.modal-skeleton i{height:44px;width:100%;border-radius:9px}@keyframes skeletonPulse{to{background-position:-220% 0}}
    :host-context(.light) dialog.output-modal-backdrop::backdrop,:host-context(.light-mode) dialog.output-modal-backdrop::backdrop,:host-context(body:not(.dark-theme)) dialog.output-modal-backdrop::backdrop{background:rgba(15,23,42,.48)}

    .trend-bars{height:150px;display:flex;align-items:flex-end;gap:6px;padding:8px 4px 0;overflow-x:auto}.trend-bar{height:100%;min-width:22px;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.trend-bar i{display:block;width:72%;min-height:3px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#22d3ee,#3b82f6);transition:height .2s ease}.trend-bars.green .trend-bar i{background:linear-gradient(180deg,#34d399,#10b981)}.trend-bar span{font-size:9px;color:var(--muted);white-space:nowrap}.modal-tools{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.modal-tools label{display:grid;gap:5px;min-width:150px}.modal-tools label span{font-size:10px;font-weight:900;text-transform:uppercase;color:var(--muted)}.modal-tools input,.modal-tools select{height:36px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 10px;outline:none}.modal-search{flex:1;min-width:220px!important}.clear-filter{height:36px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);font-weight:800;padding:0 14px;cursor:pointer}.clear-filter:disabled{opacity:.45}.sortable{cursor:pointer;user-select:none}.money-cell{text-align:right!important;font-variant-numeric:tabular-nums}.status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;background:rgba(148,163,184,.14);color:var(--text)}.status-badge[data-status*="paid"],.status-badge[data-status*="finished"],.status-badge[data-status*="approved"]{background:rgba(16,185,129,.15);color:#34d399}.status-badge[data-status*="pending"],.status-badge[data-status*="partial"]{background:rgba(245,158,11,.16);color:#fbbf24}.status-badge[data-status*="cancel"]{background:rgba(239,68,68,.16);color:#f87171}.xlsx-btn{height:36px;border:1px solid rgba(16,185,129,.45);border-radius:11px;background:rgba(16,185,129,.14);color:#34d399;padding:0 16px;font-weight:900;cursor:pointer}.xlsx-btn:disabled{opacity:.5}.export-overlay{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:color-mix(in srgb,var(--panel) 82%,transparent);backdrop-filter:blur(7px)}.analytics-output-modal{position:relative}.export-loader{min-width:280px;max-width:420px;display:grid;place-items:center;text-align:center;gap:8px;padding:26px;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:var(--shadow)}.export-loader span{width:44px;height:44px;border:4px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}.export-loader b{font-size:16px}.export-loader small{color:var(--muted)}.export-chooser{width:min(440px,92%);display:grid;gap:10px;padding:22px;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:var(--shadow)}.export-chooser>b{font-size:17px}.export-chooser>small{color:var(--muted);font-size:12px;line-height:1.45;margin-bottom:4px}.chooser-opt{display:grid;gap:4px;text-align:left;padding:14px 16px;border:1px solid var(--border);border-radius:14px;background:var(--input);color:var(--text);cursor:pointer}.chooser-opt strong{font-size:14px}.chooser-opt span{font-size:11px;color:var(--muted);line-height:1.4}.chooser-opt.primary{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--panel))}.chooser-opt:hover{border-color:var(--accent)}.chooser-opt:disabled,.chooser-cancel:disabled{opacity:.55;cursor:not-allowed}.chooser-cancel{height:36px;border:1px solid var(--border);border-radius:11px;background:transparent;color:var(--muted);font-weight:800;cursor:pointer}@keyframes spin{to{transform:rotate(360deg)}}
    @media(max-width:1250px){.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.page-head{align-items:flex-start;flex-direction:column}.filters{width:100%}.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:repeat(2,1fr)}}@media(max-width:1000px){.analytics-paged-footer{grid-template-columns:1fr auto}.modal-pagination{grid-column:1/-1;grid-row:1;justify-content:flex-start}.analytics-paged-footer .output-footer-summary{grid-column:1;grid-row:2}.analytics-paged-footer .output-footer-actions{grid-column:2;grid-row:2}}@media(max-width:760px){.output-modal-backdrop{padding:12px}.rich-output-modal{width:96vw;height:92vh;max-height:92vh;border-radius:20px}.output-modal-meta{grid-template-columns:1fr 1fr}.output-modal-meta>div{padding:10px 14px}.output-modal-meta>div:nth-child(3){grid-column:1/-1;border-top:1px solid var(--border)}.output-modal-footer{padding:12px 14px}.output-modal-heading p{display:none}.output-modal-close{width:38px;height:38px;min-width:38px}}@media(max-width:620px){.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:1fr}.filters input[type="date"]{width:180px;min-width:180px}.range-arrow{display:none}.output-modal-backdrop{padding:8px}.rich-output-modal{width:calc(100vw - 16px);height:calc(100vh - 16px);max-height:calc(100vh - 16px);border-radius:16px}.output-modal-header{padding:14px}.output-modal-meta>div{padding:9px 12px}.analytics-table-shell{padding:0 12px 16px}.output-modal-footer{align-items:stretch;flex-direction:column}.analytics-paged-footer{display:flex}.modal-pagination{order:1;justify-content:flex-start;overflow-x:auto;padding-bottom:2px}.analytics-paged-footer .output-footer-summary{order:2}.analytics-paged-footer .output-footer-actions{order:3}.output-footer-actions{width:100%}.print-btn,.close-btn{width:100%}}
  `]
})
export class AnalyticsPageComponent implements OnInit {
  @ViewChild('analyticsDialog') analyticsDialog?: ElementRef<HTMLDialogElement>;
  bills:any[]=[]; previousBills:any[]=[]; items:any[]=[]; refunds:any[]=[]; reports:any[]=[];
  dashboard:any=null; previousBilledValue=0;
  fromDate=''; toDate=''; dateError=''; modal:ModalState=null; loading=true; kpisReady=false; chartsReady=false; itemsReady=false; modalLoading=false; exportLoading=false; exportMessage='Preparing export…'; exportHint='Please wait while records are prepared.'; exportChooser:{format:'pdf'|'xlsx'; total:number}|null=null; modalSearch=''; modalStatusFilter=''; modalConsultantFilter=''; modalPaymentFilter=''; modalSortKey=''; modalSortDirection:'asc'|'desc'='asc'; modalPage=1; modalPageSize=100; modalPageSizes=[25,50,100,200]; modalServerTotal=0; modalDetailKind=''; modalDetailExtra:Record<string,any>={}; modalSkeletonRows=Array.from({length:7});
  /** Bill-detail PDF is safe up to this many rows. Above → daily summary option (long ranges) or Excel. */
  readonly exportDetailPdfMax = 5000;
  /** Ranges up to this many days (e.g. month) always prefer bill-level detail — never auto daily PDF. */
  readonly exportDetailPreferMaxDays = 40;
  private reloadGen=0;
  async ngOnInit(){ this.setCurrentMonth(false); await this.reload(); }
  ngOnDestroy(){ this.restoreBodyScroll(); }
  @HostListener('document:keydown.escape') onEscape(){
    if (this.exportLoading) return;
    if (this.exportChooser) { this.cancelExportChooser(); return; }
    if (this.modal) this.closeModal();
  }
  private mergeDashboard(partial:any){
    if (!partial || typeof partial !== 'object') return;
    const next = { ...(this.dashboard || {}) };
    for (const [key, value] of Object.entries(partial)) {
      // Never let a later phase clobber earlier KPI fields with undefined.
      if (value === undefined) continue;
      next[key] = value;
    }
    this.dashboard = next;
    if (partial.previousBilled != null) this.previousBilledValue = Number(partial.previousBilled || 0);
    if (Array.isArray(partial.topItems)) {
      this.items = partial.topItems.map((x:any)=>({ name:x.name, quantity:x.count, net_amount:x.value }));
    }
  }
  private kpiNeeds(key:string): 'kpis'|'charts'|'items' {
    if (key === 'tests') return 'items';
    if (['patients','consultants','cash','card','upi'].includes(key)) return 'charts';
    return 'kpis';
  }
  private isSectionReady(section:'kpis'|'charts'|'items') {
    if (section === 'kpis') return this.kpisReady;
    if (section === 'charts') return this.chartsReady;
    return this.itemsReady;
  }
  async reload(){
    this.dateError = dateRangeFilterError(this.fromDate, this.toDate);
    if (this.dateError) {
      this.loading = false;
      this.kpisReady = this.chartsReady = this.itemsReady = false;
      return;
    }
    const gen = ++this.reloadGen;
    this.loading=true;
    this.kpisReady=false;
    this.chartsReady=false;
    this.itemsReady=false;
    try{
      const analytics = window.limsApi.analytics;
      if (!analytics) { this.loading=false; return; }
      // Phase 1: KPI scalars only — paint fast, keep UI responsive.
      const summary = await analytics({ from:this.fromDate, to:this.toDate, phase:'summary' });
      if (gen !== this.reloadGen) return;
      this.bills=[]; this.refunds=[]; this.reports=[]; this.previousBills=[];
      this.mergeDashboard(summary?.dashboard);
      this.previousBilledValue=Number(summary?.previousBilled ?? summary?.dashboard?.previousBilled ?? 0);
      this.kpisReady=true;
      this.loading=false;

      // Phase 2: charts from one bill pass (no bill_items).
      const charts = await analytics({ from:this.fromDate, to:this.toDate, phase:'charts' });
      if (gen !== this.reloadGen) return;
      this.mergeDashboard(charts?.dashboard);
      this.chartsReady=true;

      // Phase 3: top tests (heavier) — does not block charts.
      void analytics({ from:this.fromDate, to:this.toDate, phase:'items' }).then((items:any) => {
        if (gen !== this.reloadGen) return;
        this.mergeDashboard(items?.dashboard);
        this.itemsReady=true;
      }).catch(()=>{ if (gen === this.reloadGen) this.itemsReady=true; });
    } catch (e: any) {
      if (gen !== this.reloadGen) return;
      this.dateError = e?.message || String(e) || 'Failed to load analytics.';
      this.bills=[]; this.items=[]; this.refunds=[]; this.reports=[]; this.dashboard=null; this.previousBilledValue=0;
      this.loading=false;
      this.kpisReady=this.chartsReady=this.itemsReady=false;
    }
  }
  setPreviousDay(reload=true){const e=new Date();e.setDate(e.getDate()-1);this.applyRange(e,e,reload);}
  setCurrentMonth(reload=true){const e=new Date(),s=new Date(e.getFullYear(),e.getMonth(),1);this.applyRange(s,e,reload);}
  setLastMonth(reload=true){const e=new Date(),s=new Date(e.getFullYear(),e.getMonth()-1,1),t=new Date(e.getFullYear(),e.getMonth(),0);this.applyRange(s,t,reload);}
  setCurrentYear(reload=true){const e=new Date(),s=new Date(e.getFullYear(),0,1);this.applyRange(s,e,reload);}
  setLastYear(reload=true){const e=new Date(),s=new Date(e.getFullYear()-1,0,1),t=new Date(e.getFullYear()-1,11,31);this.applyRange(s,t,reload);}
  setRange(days:number,reload=true){const e=new Date(),s=new Date(e.getFullYear(),e.getMonth(),e.getDate()-days);this.applyRange(s,e,reload);}
  private applyRange(start:Date,end:Date,reload=true){this.fromDate=this.isoDate(start);this.toDate=this.isoDate(end);if(reload)this.reload();}
  isoDate(d:Date){const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`}
  openDatePicker(event: Event){const input=event.currentTarget as HTMLInputElement|null;if(!input||input.disabled)return;try{const picker=(input as HTMLInputElement & {showPicker?:()=>void}).showPicker;if(typeof picker==='function')picker.call(input)}catch{input.focus()}}
  get isTodayRange(){const t=this.isoDate(new Date());return this.fromDate===t&&this.toDate===t}
  get isPreviousDayRange(){const e=new Date();e.setDate(e.getDate()-1);return this.matchesRange(e,e)}
  get isCurrentMonthRange(){const e=new Date();return this.matchesRange(new Date(e.getFullYear(),e.getMonth(),1),e)}
  get isLastMonthRange(){const e=new Date();return this.matchesRange(new Date(e.getFullYear(),e.getMonth()-1,1),new Date(e.getFullYear(),e.getMonth(),0))}
  get isThirtyDayRange(){const e=new Date(),s=new Date(e.getFullYear(),e.getMonth(),e.getDate()-29);return this.matchesRange(s,e)}
  get isCurrentYearRange(){const e=new Date();return this.matchesRange(new Date(e.getFullYear(),0,1),e)}
  get isLastYearRange(){const e=new Date();return this.matchesRange(new Date(e.getFullYear()-1,0,1),new Date(e.getFullYear()-1,11,31))}
  displayDate(value:any){
    const raw=String(value??'').trim();
    if(!raw)return '-';
    // Monthly analytics buckets are YYYY-MM
    if (/^\d{4}-\d{2}$/.test(raw)) {
      const d=new Date(raw+'-01T00:00:00');
      if(Number.isNaN(d.getTime())) return raw;
      return new Intl.DateTimeFormat('en-IN',{month:'short',year:'numeric'}).format(d);
    }
    const d=new Date(raw.length===10?raw+'T00:00:00':raw.replace(' ','T'));
    if(Number.isNaN(d.getTime()))return raw;
    return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d);
  }
  displayDateTime(value:any){const raw=String(value??'').trim();if(!raw)return '-';if(/^\d{4}-\d{2}$/.test(raw))return this.displayDate(raw);const d=new Date(raw.replace(' ','T'));if(Number.isNaN(d.getTime()))return raw;return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(d)}
  generatedLocalDateTime(){return this.displayDateTime(new Date().toISOString())}
  displayCell(row:any,column:any){
    const value=row?.[column.key];
    if(column.money)return this.money(value);
    const key=String(column.key||'').toLowerCase();
    if(key.includes('date')||key.endsWith('_at')||key.includes('time')){
      const raw=String(value??'').trim();
      if(/^\d{4}-\d{2}$/.test(raw) || key==='date' || raw.length===10) return this.displayDate(value);
      return this.displayDateTime(value);
    }
    return value??'-';
  }
  private matchesRange(start:Date,end:Date){return this.fromDate===this.isoDate(start)&&this.toDate===this.isoDate(end)}
  trackKpiByKey(_index:number,card:{key:string}){return card.key;}
  private previousBodyOverflow:string|null=null;
  private lockBodyScroll(){if(this.previousBodyOverflow===null){this.previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}}
  private restoreBodyScroll(){if(this.previousBodyOverflow!==null){document.body.style.overflow=this.previousBodyOverflow;this.previousBodyOverflow=null}}
  num(v:any){const n=Number(v);return Number.isFinite(n)?n:0} money(v:any){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(this.num(v))} billTime(b:any){const t=new Date(String(b.bill_date||b.created_at||'').replace(' ','T')).getTime();return Number.isFinite(t)?t:0} percent(v:number,total:number){return total?Math.max(0,Math.min(100,this.num(v)/total*100)):0}
  get filteredBills(){return this.bills.filter(b=>String(b.status||'').toUpperCase()!=='CANCELLED')} get cancelledBills(){return this.bills.filter(b=>String(b.status||'').toUpperCase()==='CANCELLED')}
  get totalBilled(){return this.dashboard?this.num(this.dashboard.billed):this.filteredBills.reduce((s,b)=>s+this.num(b.total),0)}
  get grossRevenue(){return this.dashboard?this.num(this.dashboard.subtotal):this.filteredBills.reduce((s,b)=>s+this.num(b.subtotal),0)}
  get totalPaid(){return this.dashboard?this.num(this.dashboard.paid):this.filteredBills.reduce((s,b)=>s+this.num(b.paid),0)}
  get totalDue(){return this.dashboard?this.num(this.dashboard.due):this.filteredBills.reduce((s,b)=>s+Math.max(0,this.num(b.due)),0)}
  get totalDiscount(){return this.dashboard?this.num(this.dashboard.discount):this.filteredBills.reduce((s,b)=>s+this.num(b.discount),0)}
  get averageBill(){const n=this.dashboard?this.num(this.dashboard.billCount):this.filteredBills.length;return n?this.totalBilled/n:0}
  get refundTotal(){return this.dashboard?this.num(this.dashboard.refundTotal):this.refunds.reduce((s,r)=>s+this.num(r.amount),0)}
  get previousBilled(){return this.previousBilledValue||this.previousBills.filter(b=>String(b.status||'').toUpperCase()!=='CANCELLED').reduce((s,b)=>s+this.num(b.total),0)}
  get growthPercent(){return this.previousBilled?(this.totalBilled-this.previousBilled)/this.previousBilled*100:(this.totalBilled?100:0)}
  get pendingReports(){return this.reports.filter(r=>String(r.queue_status||'').toUpperCase()==='PENDING')}
  get finishedReports(){return this.reports.filter(r=>String(r.queue_status||'').toUpperCase()==='FINISHED')}
  get reportCols(){return[{key:'bill_date',label:'Bill Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_no',label:'Patient ID'},{key:'patient_name',label:'Patient'},{key:'consultant_name',label:'Consultant'},{key:'item_count',label:'Tests'},{key:'pending_item_count',label:'Pending'},{key:'finished_item_count',label:'Finished'},{key:'queue_status',label:'Status',status:true}]}
  get kpiCards(){const mode=(name:string)=>this.paymentRows.find((x:any)=>x.label.toLowerCase().includes(name))?.value||0;const billCount=this.dashboard?this.num(this.dashboard.billCount):this.filteredBills.length;const dueBills=this.dashboard?this.num(this.dashboard.dueBillCount):this.filteredBills.filter((b:any)=>this.num(b.due)>0).length;const itemQty=this.dashboard?this.num(this.dashboard.itemQty):this.items.reduce((s:number,x:any)=>s+this.num(x.quantity||1),0);const patients=this.dashboard?this.num(this.dashboard.patientCount):new Set(this.filteredBills.map((b:any)=>b.patient_id)).size;const consultants=this.dashboard?this.num(this.dashboard.consultantCount):new Set(this.filteredBills.filter((b:any)=>b.consultant_id).map((b:any)=>b.consultant_id)).size;const cancelled=this.dashboard?this.num(this.dashboard.cancelledCount):this.cancelledBills.length;const refundN=this.dashboard?this.num(this.dashboard.refundCount):this.refunds.length;const pendingN=this.dashboard?this.num(this.dashboard.pendingReports):this.pendingReports.length;const finishedN=this.dashboard?this.num(this.dashboard.finishedReports):this.finishedReports.length;const loading=(key:string)=>!this.isSectionReady(this.kpiNeeds(key));return[
    {key:'bills',icon:'▤',tone:'',label:'Total Bills',value:String(billCount),note:'Click for bill details',loading:loading('bills')},
    {key:'billed',icon:'₹',tone:'green',label:'Billed Value',value:this.money(this.totalBilled),note:`${this.growthPercent>=0?'↑':'↓'} ${Math.abs(this.growthPercent).toFixed(1)}% vs previous period`,loading:loading('billed')},
    {key:'collected',icon:'▣',tone:'purple',label:'Collected',value:this.money(this.totalPaid),note:`${this.percent(this.totalPaid,this.totalBilled).toFixed(1)}% collection rate`,loading:loading('collected')},
    {key:'outstanding',icon:'₹',tone:'red',label:'Outstanding',value:this.money(this.totalDue),note:`${dueBills} bills with balance`,loading:loading('outstanding')},
    {key:'average',icon:'≡',tone:'orange',label:'Average Bill Value',value:this.money(this.averageBill),note:'Per invoice',loading:loading('average')},
    {key:'discount',icon:'◇',tone:'pink',label:'Discounts Given',value:this.money(this.totalDiscount),note:'Across selected period',loading:loading('discount')},
    {key:'discountRate',icon:'%',tone:'',label:'Discount %',value:`${this.percent(this.totalDiscount,this.grossRevenue).toFixed(2)}%`,note:'Of gross revenue',loading:loading('discountRate')},
    {key:'gross',icon:'♙',tone:'teal',label:'Gross Revenue',value:this.money(this.grossRevenue),note:'Before discounts',loading:loading('gross')},
    {key:'tests',icon:'⚗',tone:'purple',label:'Total Tests / Profiles',value:String(itemQty),note:'Billed item quantity',loading:loading('tests')},
    {key:'patients',icon:'♧',tone:'green',label:'Patients',value:String(patients),note:'Unique billed patients',loading:loading('patients')},
    {key:'consultants',icon:'♙',tone:'orange',label:'Consultants',value:String(consultants),note:'With billed activity',loading:loading('consultants')},
    {key:'cash',icon:'▰',tone:'teal',label:'Cash Collected',value:this.money(mode('cash')),note:`${this.percent(mode('cash'),this.totalPaid).toFixed(1)}% of collection`,loading:loading('cash')},
    {key:'card',icon:'▣',tone:'purple',label:'Card Collected',value:this.money(mode('card')),note:`${this.percent(mode('card'),this.totalPaid).toFixed(1)}% of collection`,loading:loading('card')},
    {key:'upi',icon:'▥',tone:'orange',label:'UPI Collected',value:this.money(mode('upi')),note:`${this.percent(mode('upi'),this.totalPaid).toFixed(1)}% of collection`,loading:loading('upi')},
    {key:'cancelledBills',icon:'×',tone:'red',label:'Cancelled Bills',value:String(cancelled),note:`${cancelled} cancelled in period`,loading:loading('cancelledBills')},
    {key:'refunds',icon:'↻',tone:'red',label:'Refunds',value:this.money(this.refundTotal),note:`${refundN} refund${refundN===1?'':'s'}`,loading:loading('refunds')},
    {key:'pendingReports',icon:'⌛',tone:'orange',label:'Pending Reports',value:String(pendingN),note:'Click for report details',loading:loading('pendingReports')},
    {key:'finishedReports',icon:'✓',tone:'green',label:'Finished Reports',value:String(finishedN),note:'Click for report details',loading:loading('finishedReports')}
  ]}
  get dailyRows(){
    if(this.dashboard?.daily?.length){
      return this.dashboard.daily.map((r:any)=>{
        const date=String(r.date||'');
        const monthly=/^\d{4}-\d{2}$/.test(date);
        return {
          date,
          label: monthly ? this.displayDate(date) : this.displayDate(date).slice(0,5),
          billed:this.num(r.billed),
          paid:this.num(r.paid)
        };
      });
    }
    const m=new Map<string,{billed:number,paid:number}>();
    for(const b of this.filteredBills){
      const k=this.isoDate(new Date(this.billTime(b)));
      const r=m.get(k)||{billed:0,paid:0};
      r.billed+=this.num(b.total);r.paid+=this.num(b.paid);m.set(k,r);
    }
    return[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,label:this.displayDate(date).slice(0,5),...v}));
  }
  get dailyTrendTitle(){
    const first=String(this.dashboard?.daily?.[0]?.date||'');
    return /^\d{4}-\d{2}$/.test(first) ? 'Monthly Revenue Trend' : 'Daily Revenue Trend';
  }
  get dailyDetailsTitle(){
    const first=String(this.dashboard?.daily?.[0]?.date||'');
    return /^\d{4}-\d{2}$/.test(first) ? 'Monthly Revenue Details' : 'Daily Revenue Details';
  }
  get dailyDateColumnLabel(){
    const first=String(this.dashboard?.daily?.[0]?.date||'');
    return /^\d{4}-\d{2}$/.test(first) ? 'Month' : 'Date';
  }
  get dailyMax(){return Math.max(1,...this.dailyRows.map((x:any)=>x.billed))}
  get collectionMax(){return Math.max(1,...this.dailyRows.map((x:any)=>x.paid))}
  get paymentRows(){if(this.dashboard?.payments?.length)return this.dashboard.payments.map((r:any)=>({label:r.label,value:this.num(r.value)}));const m=new Map<string,number>();for(const b of this.filteredBills){const k=String(b.payment_mode||'Unspecified');m.set(k,(m.get(k)||0)+this.num(b.paid))}return[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)} get paymentDonut(){const colors=['#32c982','#3b82f6','#f9b51a','#9b6ce5','#ef5350'];let p=0;const parts=this.paymentRows.map((r:any,i:number)=>{const a=p,b=p+this.percent(r.value,this.totalPaid);p=b;return `${colors[i%colors.length]} ${a}% ${b}%`});return `conic-gradient(${parts.length?parts.join(','):'#263247 0 100%'})`}
  get topItems(){if(this.dashboard?.topItems?.length)return this.dashboard.topItems.map((x:any)=>({name:x.name,count:this.num(x.count),value:this.num(x.value)}));const m=new Map<string,{name:string;count:number;value:number}>();for(const x of this.items){const name=String(x.name||'Unknown');const r=m.get(name)||{name,count:0,value:0};r.count+=this.num(x.quantity||1);r.value+=this.num(x.net_amount||x.total);m.set(name,r)}return[...m.values()].sort((a,b)=>b.count-a.count||b.value-a.value)} get topItemMax(){return Math.max(1,...this.topItems.map((x:any)=>x.value))} get topItemCountMax(){return Math.max(1,...this.topItems.map((x:any)=>x.count))}
  get consultantRows(){if(this.dashboard?.consultants?.length)return this.dashboard.consultants.map((r:any)=>({name:r.name,count:this.num(r.count),billed:this.num(r.billed),paid:this.num(r.paid),due:this.num(r.due)}));const m=new Map<string,any>();for(const b of this.filteredBills){const name=String(b.consultant_name||'Walk-in / Direct');const r=m.get(name)||{name,count:0,billed:0,paid:0,due:0};r.count++;r.billed+=this.num(b.total);r.paid+=this.num(b.paid);r.due+=Math.max(0,this.num(b.due));m.set(name,r)}return[...m.values()].sort((a,b)=>b.billed-a.billed)} get consultantMax(){return Math.max(1,...this.consultantRows.map((x:any)=>x.billed))}
  get statusRows(){if(this.dashboard?.statuses?.length)return this.dashboard.statuses;const m=new Map<string,number>();for(const b of this.bills){const k=String(b.payment_status||b.status||'Unknown').replaceAll('_',' ');m.set(k,(m.get(k)||0)+1)}return[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)}
  get totalBillsForStatus(){return this.dashboard?this.num(this.dashboard.billCount)+this.num(this.dashboard.cancelledCount):this.bills.length}
  get ageingRows(){if(this.dashboard?.ageing?.length)return this.dashboard.ageing;const now=Date.now(),a=[{label:'0 - 30 days',min:0,max:30,value:0},{label:'31 - 60 days',min:31,max:60,value:0},{label:'61 - 90 days',min:61,max:90,value:0},{label:'Over 90 days',min:91,max:Infinity,value:0}];for(const b of this.filteredBills){const due=Math.max(0,this.num(b.due));if(!due)continue;const days=Math.max(0,Math.floor((now-this.billTime(b))/86400000));a.find((x:any)=>days>=x.min&&days<=x.max)!.value+=due}return a}

  inSelectedDate(value:any){const raw=String(value||'').slice(0,10);return !!raw&&raw>=this.fromDate&&raw<=this.toDate}
  statusText(value:any){return String(value??'').trim().toLowerCase().replaceAll('_',' ')}
  get modalStatusOptions(){return this.uniqueModalValues(['payment_status','status','queue_status'])}
  get modalConsultantOptions(){return this.uniqueModalValues(['consultant_name','name'], true)}
  get modalPaymentOptions(){return this.uniqueModalValues(['payment_mode','mode'])}
  private uniqueModalValues(keys:string[],consultantOnly=false){if(!this.modal)return[];const set=new Set<string>();for(const row of this.modal.rows){for(const key of keys){const value=String(row?.[key]??'').trim();if(value && (!consultantOnly || key==='consultant_name'))set.add(value)}}return [...set].sort((a,b)=>a.localeCompare(b))}
  get hasModalFilters(){return !!(this.modalSearch||this.modalStatusFilter||this.modalConsultantFilter||this.modalPaymentFilter)}
  get modalFilteredRows(){if(!this.modal)return[];const q=this.modalSearch.trim().toLowerCase();let rows=this.modal.rows.filter(row=>{const searchOk=!q||this.modal!.columns.some(c=>String(row?.[c.key]??'').toLowerCase().includes(q));const status=String(row.payment_status||row.status||row.queue_status||'');const statusOk=!this.modalStatusFilter||status===this.modalStatusFilter;const consultant=String(row.consultant_name||'');const consultantOk=!this.modalConsultantFilter||consultant===this.modalConsultantFilter;const payment=String(row.payment_mode||row.mode||'');const paymentOk=!this.modalPaymentFilter||payment===this.modalPaymentFilter;return searchOk&&statusOk&&consultantOk&&paymentOk});if(this.modalSortKey){const key=this.modalSortKey,dir=this.modalSortDirection==='asc'?1:-1;rows=[...rows].sort((a,b)=>{const av=a?.[key],bv=b?.[key],an=Number(av),bn=Number(bv);if(Number.isFinite(an)&&Number.isFinite(bn))return(an-bn)*dir;return String(av??'').localeCompare(String(bv??''),undefined,{numeric:true,sensitivity:'base'})*dir})}return rows}
  get modalFilteredTotal(){return this.modalServerTotal || this.modalFilteredRows.length}
  resetModalPage(){this.modalPage=1; if(this.modalDetailKind) void this.reloadModalPage();}
  clearModalFilters(){this.modalSearch='';this.modalStatusFilter='';this.modalConsultantFilter='';this.modalPaymentFilter='';this.modalPage=1}
  sortModal(key:string){if(this.modalSortKey===key)this.modalSortDirection=this.modalSortDirection==='asc'?'desc':'asc';else{this.modalSortKey=key;this.modalSortDirection='asc'}this.modalPage=1}
  get modalTotalRecords(){return this.modalServerTotal || this.modal?.rows.length||0}
  get modalTotalPages(){return Math.max(1,Math.ceil(this.modalFilteredTotal/this.modalPageSize))}
  get modalPageRows(){if(!this.modal)return[]; if(this.modalDetailKind) return this.modalFilteredRows; const start=(this.modalPage-1)*this.modalPageSize;return this.modalFilteredRows.slice(start,start+this.modalPageSize)}
  get modalRangeLabel(){if(!this.modalFilteredTotal)return '0 records';const start=(this.modalPage-1)*this.modalPageSize+1;const end=Math.min(this.modalPage*this.modalPageSize,this.modalFilteredTotal);return `Showing ${start}-${end} of ${this.modalFilteredTotal} filtered records`}
  get modalVisiblePages(){const total=this.modalTotalPages,current=this.modalPage,start=Math.max(1,Math.min(current-2,total-4)),end=Math.min(total,start+4);return Array.from({length:end-start+1},(_,i)=>start+i)}
  goToModalPage(page:number){this.modalPage=Math.min(this.modalTotalPages,Math.max(1,Number(page)||1));this.scrollModalTableTop(); if(this.modalDetailKind) void this.reloadModalPage();}
  changeModalPageSize(size:number){this.modalPageSize=[25,50,100,200].includes(Number(size))?Number(size):100;this.modalPage=1;this.scrollModalTableTop(); if(this.modalDetailKind) void this.reloadModalPage();}
  private scrollModalTableTop(){setTimeout(()=>this.analyticsDialog?.nativeElement.querySelector('.output-modal-body')?.scrollTo({top:0,behavior:'smooth'}),0)}

  async open(title:string,subtitle:string,columns:any[],rowsOrLoader:any[]|(()=>Promise<any[]>), detail?: { kind:string; extra?:Record<string,any> }){
    this.modal={title,subtitle,columns,rows:[]};
    this.modalPage=1; this.clearModalFilters(); this.modalSortKey=''; this.modalSortDirection='asc';
    this.modalServerTotal=0;
    this.modalDetailKind = detail?.kind || '';
    this.modalDetailExtra = detail?.extra || {};
    this.modalLoading=true;
    this.lockBodyScroll();
    await new Promise(resolve=>setTimeout(resolve,0));
    const dialog=this.analyticsDialog?.nativeElement;
    if(dialog && !dialog.open) dialog.showModal();
    try {
      const rows = typeof rowsOrLoader === 'function' ? await rowsOrLoader() : rowsOrLoader;
      if(this.modal) this.modal={title,subtitle,columns,rows: Array.isArray(rows) ? rows : []};
    } catch (e: any) {
      if(this.modal) this.modal={title,subtitle,columns,rows:[]};
      console.error('[Analytics details]', e);
    } finally {
      this.modalLoading=false;
    }
  }
  onDialogBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.closeModal();}
  private async loadDetails(kind:string, extra:Record<string,any>={}){
    const api = window.limsApi.analyticsDetails;
    if (!api) return [];
    const result = await api({
      from: this.fromDate,
      to: this.toDate,
      kind,
      page: this.modalPage || 1,
      pageSize: this.modalPageSize || 100,
      ...extra
    });
    this.modalServerTotal = Math.max(0, Number(result?.total || 0));
    return Array.isArray(result?.rows) ? result.rows : [];
  }
  private async reloadModalPage(){
    if (!this.modal || !this.modalDetailKind) return;
    this.modalLoading = true;
    try {
      const rows = await this.loadDetails(this.modalDetailKind, this.modalDetailExtra);
      if (this.modal) this.modal = { ...this.modal, rows };
    } finally {
      this.modalLoading = false;
    }
  }
  openMetric(key:string){
    if(!this.isSectionReady(this.kpiNeeds(key))) return;
    if(key==='pendingReports') return void this.open('Pending Reports',this.period,this.reportCols,()=>this.loadDetails('pendingReports'),{kind:'pendingReports'});
    if(key==='cancelledBills') return void this.open('Cancelled Bills',this.period,this.billCols,()=>this.loadDetails('cancelled'),{kind:'cancelled'});
    if(key==='finishedReports') return void this.open('Finished Reports',this.period,this.reportCols,()=>this.loadDetails('finishedReports'),{kind:'finishedReports'});
    if(key==='tests') return this.openTopTests();
    if(key==='consultants') return this.openConsultants();
    if(key==='refunds') return void this.open('Refund Details',this.period,[{key:'refunded_at',label:'Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_name',label:'Patient'},{key:'mode',label:'Mode'},{key:'amount',label:'Amount',money:true}],()=>this.loadDetails('refunds'),{kind:'refunds'});
    if(['cash','card','upi'].includes(key)) {
      const term=key.toLowerCase();
      return void this.open(`${key.toUpperCase()} Collection Details`,this.period,this.billCols,()=>this.loadDetails('bills',{ paymentMode: term }),{kind:'bills',extra:{ paymentMode: term }});
    }
    if(key==='outstanding') return void this.open(this.kpiCards.find(x=>x.key===key)?.label||'Outstanding',this.period,this.billCols,()=>this.loadDetails('outstanding'),{kind:'outstanding'});
    return void this.open(this.kpiCards.find(x=>x.key===key)?.label||'Details',this.period,this.billCols,()=>this.loadDetails('bills'),{kind:'bills'});
  }
  get billCols(){return[{key:'bill_date',label:'Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_name',label:'Patient'},{key:'consultant_name',label:'Consultant'},{key:'total',label:'Billed',money:true},{key:'paid',label:'Paid',money:true},{key:'due',label:'Due',money:true},{key:'payment_status',label:'Status',status:true}]}
  get period(){return `${this.displayDate(this.fromDate)} to ${this.displayDate(this.toDate)}`}
  openDaily(){this.open(this.dailyDetailsTitle,this.period,[{key:'date',label:this.dailyDateColumnLabel},{key:'billed',label:'Billed',money:true},{key:'paid',label:'Collected',money:true}],this.dailyRows)} openCollections(){this.openDaily()} openPayments(){this.open('Payment Mode Details',this.period,[{key:'label',label:'Mode'},{key:'value',label:'Collected',money:true}],this.paymentRows)} openTopTests(){this.open('Test & Profile Performance',this.period,[{key:'name',label:'Test / Profile'},{key:'count',label:'Item Count'},{key:'value',label:'Billed Value',money:true}],this.topItems)} openConsultants(){this.open('Consultants',this.period,[{key:'name',label:'Consultant'},{key:'count',label:'Bills'},{key:'billed',label:'Billed',money:true},{key:'paid',label:'Collected',money:true},{key:'due',label:'Due',money:true}],this.consultantRows)} openStatuses(){this.open('Bill Status Details',this.period,[{key:'label',label:'Status'},{key:'value',label:'Bills'}],this.statusRows)} openAgeing(){this.open('Outstanding Ageing Details',this.period,[{key:'label',label:'Ageing Bucket'},{key:'value',label:'Outstanding',money:true}],this.ageingRows)} openMonthly(){this.open('Period Comparison',this.period,[{key:'period',label:'Period'},{key:'value',label:'Billed Value',money:true}],[{period:'Selected period',value:this.totalBilled},{period:'Previous period',value:this.previousBilled}])}
  private buildExportTotals(modal:NonNullable<ModalState>, sourceRows:DetailRow[], recordCount?:number){
    const totals:any[]=[{key:'__records',label:'Total Records',value:recordCount ?? sourceRows.length,display:String(recordCount ?? sourceRows.length),money:false}];
    const totalKey=/count|quantity|qty|value|billed|paid|due|amount|discount|refund|balance|bills|pending|finished|tests|subtotal|total|bill_count/i;
    for(const column of modal.columns){
      if(!column.money && !totalKey.test(column.key)) continue;
      const numericValues=sourceRows.map(row=>Number(row?.[column.key])).filter(value=>Number.isFinite(value));
      if(!numericValues.length) continue;
      const value=numericValues.reduce((sum,item)=>sum+item,0);
      totals.push({key:column.key,label:`Total ${column.label}`,value,display:column.money?this.money(value):new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value),money:!!column.money});
    }
    return totals;
  }
  private isBillLikeExportKind(kind:string){
    return ['bills','outstanding','cancelled','cancelledbills'].includes(String(kind||'').toLowerCase());
  }
  private selectedRangeDaySpan(): number {
    const from = new Date(this.fromDate + 'T00:00:00');
    const to = new Date(this.toDate + 'T00:00:00');
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
    return Math.max(1, Math.floor((to.getTime() - from.getTime()) / 86400000) + 1);
  }
  private exportRecordTotal(): number {
    return Math.max(this.modalServerTotal || 0, this.modalFilteredTotal || 0);
  }
  cancelExportChooser(){ this.exportChooser=null; }
  async downloadPdf(){ await this.beginExport('pdf'); }
  async downloadXlsx(){ await this.beginExport('xlsx'); }
  private async beginExport(format:'pdf'|'xlsx'){
    if(!this.modal||this.modalLoading||this.exportLoading||this.exportChooser) return;
    const api = format==='pdf' ? window.limsApi.analyticsPdfOpen : window.limsApi.analyticsXlsxOpen;
    if(!api && format==='pdf'){ console.error('Analytics PDF generator is unavailable.'); return; }
    if(format==='xlsx' && !api && !window.limsApi.analyticsXlsxExportAll){ console.error('Analytics XLSX generator is unavailable.'); return; }

    // Charts / non-bill modals: always export the visible detail as-is.
    if (!this.modalDetailKind || !this.isBillLikeExportKind(this.modalDetailKind)) {
      await this.runExport(format, 'full');
      return;
    }

    const total = this.exportRecordTotal();
    const daySpan = this.selectedRangeDaySpan();
    const preferDetail = daySpan <= this.exportDetailPreferMaxDays; // month / short ranges → bill rows
    const fitsDetailPdf = total <= this.exportDetailPdfMax;

    // Monthly / short range: always detailed bills (PDF if it fits, else Excel). Never daily summary.
    if (preferDetail) {
      await this.runExport(format, 'full');
      return;
    }

    // XLSX: full bill list (no daily unless user somehow chose it).
    if (format === 'xlsx') {
      await this.runExport('xlsx', 'full');
      return;
    }

    // PDF + long range:
    // - under threshold → detailed PDF
    // - over threshold → ask daily summary PDF vs full Excel
    if (fitsDetailPdf) {
      await this.runExport('pdf', 'full');
      return;
    }
    this.exportChooser = { format: 'pdf', total };
  }
  async confirmExport(mode:'daily'|'full'){
    const chooser = this.exportChooser;
    if (!chooser || this.exportLoading) return;
    const format = chooser.format;
    this.exportChooser = null;
    await this.runExport(format, mode);
  }
  private async runExport(format:'pdf'|'xlsx', mode:'daily'|'full'){
    if(!this.modal||this.exportLoading) return;
    this.exportLoading = true;
    this.exportMessage = mode === 'daily' ? 'Building daily summary…' : 'Preparing detailed bill export…';
    this.exportHint = 'Read-only export — your database is not modified.';
    let stopProgress: (() => void) | undefined;
    try {
      const total = this.exportRecordTotal();
      const fitsDetailPdf = total <= this.exportDetailPdfMax;

      // Full bill detail as Excel when: user asked XLSX, or PDF but too many rows for one PDF.
      if (mode === 'full' && this.modalDetailKind && this.isBillLikeExportKind(this.modalDetailKind)) {
        const useFullExcel = format === 'xlsx' || !fitsDetailPdf;
        if (useFullExcel) {
          const exportAll = window.limsApi.analyticsXlsxExportAll;
          if (!exportAll) throw new Error('Full bill Excel export is unavailable. Restart the app after updating Electron.');
          stopProgress = window.limsApi.onAnalyticsExportProgress?.((p) => {
            this.exportMessage = p?.message || this.exportMessage;
            this.exportHint = p?.total
              ? `${Number(p.fetched||0).toLocaleString('en-IN')} / ${Number(p.total).toLocaleString('en-IN')} bills`
              : this.exportHint;
          });
          if (format === 'pdf' && !fitsDetailPdf) {
            this.exportMessage = 'Too many bills for one detailed PDF…';
            this.exportHint = `Exporting all ${total.toLocaleString('en-IN')} bills as Excel (PDF detail limit ${this.exportDetailPdfMax.toLocaleString('en-IN')}).`;
          }
          const result = await exportAll({
            title: this.modal.title,
            subtitle: `Selected period: ${this.period} · full bill list (all rows)`,
            generatedAt: this.generatedLocalDateTime(),
            from: this.fromDate,
            to: this.toDate,
            kind: this.modalDetailKind,
            extra: this.modalDetailExtra,
            columns: this.modal.columns.map(column => ({ key: column.key, label: column.label, money: !!column.money }))
          });
          if (result?.cancelled) {
            this.exportMessage = 'Export cancelled';
            this.exportHint = 'No file was saved.';
            await new Promise(r => setTimeout(r, 900));
          } else {
            this.exportMessage = 'Full bill Excel saved';
            this.exportHint = `${Number(result?.exported||0).toLocaleString('en-IN')} of ${Number(result?.total||0).toLocaleString('en-IN')} bills.`;
            await new Promise(r => setTimeout(r, 900));
          }
          return;
        }
      }

      const api = format==='pdf' ? window.limsApi.analyticsPdfOpen : window.limsApi.analyticsXlsxOpen;
      if(!api) throw new Error(format==='pdf' ? 'Analytics PDF generator is unavailable.' : 'Analytics XLSX generator is unavailable.');
      const exported = await this.rowsForExport(format, mode);
      const modal = exported.modal;
      const sourceRows = exported.rows;
      this.exportMessage = format === 'pdf' ? 'Generating PDF…' : 'Generating Excel…';
      this.exportHint = exported.subtitle || this.exportHint;
      const rows = sourceRows.map(row => {
        const formatted: any = {};
        for (const column of modal.columns) formatted[column.key] = this.displayCell(row, column);
        return formatted;
      });
      const totals = this.buildExportTotals(modal, sourceRows, exported.recordCount);
      await api({
        title: modal.title,
        subtitle: exported.subtitle,
        generatedAt: this.generatedLocalDateTime(),
        columns: modal.columns.map(column => ({ key: column.key, label: column.label, money: !!column.money })),
        rows,
        totals
      });
    } catch (e: any) {
      console.error('[Analytics export]', e);
      this.exportMessage = 'Export failed';
      this.exportHint = e?.message || String(e) || 'Please try a shorter date range or Excel export.';
      await new Promise(r => setTimeout(r, 1800));
    } finally {
      try { stopProgress?.(); } catch {}
      this.exportLoading = false;
      this.exportHint = 'Please wait while records are prepared.';
    }
  }
  private async rowsForExport(format:'pdf'|'xlsx', mode:'daily'|'full'): Promise<{ rows: DetailRow[]; modal: NonNullable<ModalState>; subtitle: string; recordCount: number }> {
    if (!this.modal) return { rows: [], modal: { title:'', subtitle:'', columns:[], rows:[] }, subtitle: '', recordCount: 0 };
    const baseModal = this.modal;
    const periodNote = `Selected period: ${this.period}`;
    if (!this.modalDetailKind) {
      const rows = this.modalFilteredRows;
      return { rows, modal: baseModal, subtitle: periodNote, recordCount: rows.length };
    }
    const api = window.limsApi.analyticsDetails;
    if (!api) {
      const rows = this.modalFilteredRows;
      return { rows, modal: baseModal, subtitle: periodNote, recordCount: rows.length };
    }

    const kind = String(this.modalDetailKind || 'bills');
    const probe = await api({
      from: this.fromDate,
      to: this.toDate,
      kind,
      page: 1,
      pageSize: 1,
      ...this.modalDetailExtra
    });
    const total = Math.max(0, Number(probe?.total || 0));

    if (mode === 'daily' && this.isBillLikeExportKind(kind)) {
      this.exportMessage = 'Fetching daily summary for full period…';
      this.exportHint = `${total.toLocaleString('en-IN')} bills will be rolled up by day.`;
      const dailyExtra: Record<string, any> = { ...this.modalDetailExtra };
      if (kind.toLowerCase() === 'outstanding') dailyExtra.scope = 'outstanding';
      if (kind.toLowerCase() === 'cancelled' || kind.toLowerCase() === 'cancelledbills') dailyExtra.scope = 'cancelled';
      // Pull every day in range (no paging truncation for year ~366 days).
      const result = await api({
        from: this.fromDate,
        to: this.toDate,
        kind: 'daily',
        page: 1,
        pageSize: 5000,
        ...dailyExtra
      });
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      if (!result?.aggregate && rows.length && (rows[0].bill_no != null || rows[0].bill_date != null) && rows[0].bill_count == null) {
        throw new Error('Daily summary is unavailable. Restart the app after updating Electron, then choose Daily summary again.');
      }
      const dailyModal: NonNullable<ModalState> = {
        title: `${baseModal.title} — Daily Summary`,
        subtitle: baseModal.subtitle,
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'bill_count', label: 'Bills' },
          { key: 'billed', label: 'Billed', money: true },
          { key: 'paid', label: 'Paid', money: true },
          { key: 'due', label: 'Due', money: true }
        ],
        rows
      };
      const billTotal = rows.reduce((s, r) => s + Number(r.bill_count || 0), 0);
      const dayTotal = Math.max(rows.length, Number(result?.total || 0));
      if (!rows.length) {
        throw new Error('No daily rows were returned for this period.');
      }
      return {
        rows,
        modal: dailyModal,
        subtitle: `${periodNote} · daily summary of ${total.toLocaleString('en-IN')} bills across ${dayTotal} days`,
        recordCount: billTotal || total
      };
    }

    // Full detail (small PDF only): page through remaining rows with no artificial short cap.
    const exportPageSize = 5000;
    const maxPages = Math.max(1, Math.ceil(total / exportPageSize) || 1);
    const all: DetailRow[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const fetched = Math.min(total, page * exportPageSize);
      this.exportMessage = `Fetching bill details ${fetched.toLocaleString('en-IN')} / ${total.toLocaleString('en-IN')}…`;
      this.exportHint = 'App may pause briefly — data is read-only.';
      await new Promise(r => setTimeout(r, 0));
      const result = await api({
        from: this.fromDate,
        to: this.toDate,
        kind,
        page,
        pageSize: exportPageSize,
        ...this.modalDetailExtra
      });
      const batch = Array.isArray(result?.rows) ? result.rows : [];
      all.push(...batch);
      if (batch.length < exportPageSize) break;
    }
    return {
      rows: all,
      modal: baseModal,
      subtitle: periodNote,
      recordCount: total || all.length
    };
  }
  closeModal(){
    if (this.exportLoading) return;
    const dialog=this.analyticsDialog?.nativeElement;
    if(dialog?.open)dialog.close();
    this.modal=null; this.modalLoading=false; this.modalPage=1; this.modalServerTotal=0;
    this.modalDetailKind=''; this.modalDetailExtra={}; this.exportChooser=null;
    this.restoreBodyScroll();
  }
}
