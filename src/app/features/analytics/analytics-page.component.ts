import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';

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
      </header>

      <div class="dashboard-skeleton" *ngIf="loading" aria-label="Loading analytics">
        <div class="skeleton-card" *ngFor="let n of skeletonCards"><span></span><div><i></i><b></b><em></em></div></div>
        <div class="skeleton-panel" *ngFor="let n of skeletonPanels"><i></i><b></b><em></em></div>
      </div>

      <div class="kpi-grid" *ngIf="!loading">
        <div class="kpi-hitbox" *ngFor="let card of kpiCards; trackBy: trackKpiByKey">
          <button type="button" class="kpi kpi-surface" (click)="openMetric(card.key)">
            <span class="icon" [class]="'icon '+card.tone">{{card.icon}}</span>
            <span class="kpi-copy"><small>{{card.label}}</small><strong>{{card.value}}</strong><em>{{card.note}}</em></span>
            <span class="open">↗</span>
          </button>
        </div>
      </div>

      <div class="insight-grid" *ngIf="!loading">
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openDaily()">
          <div class="title"><span><b>Daily Revenue Trend</b><small>Billed value</small></span><i>↗</i></div>
          <div class="trend-bars"><div *ngFor="let x of dailyRows" class="trend-bar" [title]="x.label + ': ' + money(x.billed)"><i [style.height.%]="percent(x.billed,dailyMax)"></i><span>{{x.label}}</span></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openPayments()">
          <div class="title"><span><b>Payment Mode Distribution</b><small>By collected amount</small></span><i>↗</i></div>
          <div class="donut-wrap"><div class="donut" [style.background]="paymentDonut"></div><div class="legend"><div *ngFor="let row of paymentRows"><span class="dot"></span><span>{{row.label}}</span><b>{{money(row.value)}} ({{percent(row.value,totalPaid)|number:'1.0-1'}}%)</b></div></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openTopTests()">
          <div class="title"><span><b>Top Tests & Profiles</b><small>{{topItems.length}} items/groups · item count and billed value</small></span><i>↗</i></div>
          <div class="bar-list"><div *ngFor="let row of topItems.slice(0,5)"><span>{{row.name}}</span><div><i [style.width.%]="percent(row.count,topItemCountMax)"></i></div><b>{{row.count}} items · {{money(row.value)}}</b></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openConsultants()">
          <div class="title"><span><b>Consultants</b><small>{{consultantRows.length}} used in selected period</small></span><i>↗</i></div>
          <div class="bar-list purple all-consultants"><div *ngFor="let row of consultantRows"><span>{{row.name}}</span><div><i [style.width.%]="percent(row.billed,consultantMax)"></i></div><b>{{row.count}} bills · {{money(row.billed)}}</b></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openStatuses()">
          <div class="title"><span><b>Bill Status Summary</b><small>By number of bills</small></span><i>↗</i></div>
          <div class="mini-list"><div *ngFor="let row of statusRows"><span>{{row.label}}</span><b>{{row.value}} ({{percent(row.value,filteredBills.length)|number:'1.0-1'}}%)</b></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openAgeing()">
          <div class="title"><span><b>Outstanding Ageing</b><small>By days</small></span><i>↗</i></div>
          <div class="mini-list"><div *ngFor="let row of ageingRows"><span>{{row.label}}</span><b>{{money(row.value)}} ({{percent(row.value,totalDue)|number:'1.0-1'}}%)</b></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openCollections()">
          <div class="title"><span><b>Collections Trend</b><small>Collected amount</small></span><i>↗</i></div>
          <div class="trend-bars green"><div *ngFor="let x of dailyRows" class="trend-bar" [title]="x.label + ': ' + money(x.paid)"><i [style.height.%]="percent(x.paid,collectionMax)"></i><span>{{x.label}}</span></div></div>
        </button></div>
        <div class="card-hitbox"><button type="button" class="insight card-surface" (click)="openMonthly()">
          <div class="title"><span><b>Monthly Summary</b><small>Current vs previous period</small></span><i>↗</i></div>
          <div class="month-row"><span>Selected period</span><b>{{money(totalBilled)}}</b></div>
          <div class="month-row"><span>Previous period</span><b>{{money(previousBilled)}}</b></div>
          <strong class="growth" [class.down]="growthPercent<0">{{growthPercent>=0?'↑':'↓'}} {{growthPercent|number:'1.0-1'}}% change</strong>
        </button></div>
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
        <div class="export-overlay" *ngIf="exportLoading"><div class="export-loader"><span></span><b>{{exportMessage}}</b><small>Please wait while all filtered records are prepared.</small></div></div>
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
          <div class="output-footer-actions"><button type="button" class="print-btn" (click)="downloadPdf()" [disabled]="modalLoading || exportLoading || !modalFilteredTotal">Download PDF</button><button type="button" class="xlsx-btn" (click)="downloadXlsx()" [disabled]="modalLoading || exportLoading || !modalFilteredTotal">Download XLSX</button><button type="button" class="close-btn" (click)="closeModal()">Close</button></div>
        </footer>
      </section>
    </dialog>
  `,
  styles: [`
    :host{display:block;color:var(--text)}
    .analytics-page{display:grid;gap:16px}.page-head{display:flex;justify-content:flex-start;align-items:center;gap:16px;min-height:40px;width:100%}
    .filters{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;width:100%;margin:0}.date-field{display:block}.range-arrow{color:var(--muted);font-weight:900}.filters input,.filters button{height:36px;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text);padding:0 12px;font-weight:850;outline:none}.filters input:focus,.filters button:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}.filters button{cursor:pointer}.filters button.active{background:var(--accent-gradient);border-color:transparent;color:#fff;box-shadow:var(--glow)}.icon-btn{font-size:18px;min-width:40px}
    .filters input[type="date"]{width:220px;min-width:220px;box-sizing:border-box;appearance:none;-webkit-appearance:none;color:#f8fafc!important;background-color:color-mix(in srgb,var(--input) 92%,var(--panel));background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23f8fafc' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-size:18px 18px;font-weight:850;letter-spacing:.01em;color-scheme:dark;padding-right:46px!important;cursor:pointer}
    .filters input[type="date"]::-webkit-datetime-edit,.filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,.filters input[type="date"]::-webkit-datetime-edit-text,.filters input[type="date"]::-webkit-datetime-edit-month-field,.filters input[type="date"]::-webkit-datetime-edit-day-field,.filters input[type="date"]::-webkit-datetime-edit-year-field{color:#f8fafc!important}
    .filters input[type="date"]::-webkit-calendar-picker-indicator{opacity:0!important;cursor:pointer;width:42px;height:100%;margin-right:-8px}
    :host-context(.light) .filters input[type="date"],:host-context(.light-mode) .filters input[type="date"],:host-context(body:not(.dark-theme)) .filters input[type="date"]{background-color:#fff;color:#0f172a!important;color-scheme:light;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")}
    :host-context(.light) .filters input[type="date"]::-webkit-datetime-edit,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light) .filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light-mode) .filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-text,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(body:not(.dark-theme)) .filters input[type="date"]::-webkit-datetime-edit-year-field{color:#0f172a!important}
    .kpi-grid,.insight-grid,.dashboard-skeleton{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.card-hitbox{position:relative;min-width:0;height:100%;padding-top:4px;margin-top:-4px}.card-surface{width:100%;height:100%;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;will-change:transform}.card-hitbox:hover .card-surface,.card-hitbox:focus-within .card-surface{transform:translateY(-4px);border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 14px 34px rgba(2,6,23,.24)}.kpi-hitbox{position:relative;min-width:0;height:100%;padding-top:6px;margin-top:-6px;cursor:pointer}.kpi-surface{width:100%;height:100%;transform:translate3d(0,0,0);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease,background .18s ease;will-change:transform}.kpi-hitbox:hover .kpi-surface,.kpi-hitbox:focus-within .kpi-surface{transform:translate3d(0,-4px,0);border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 14px 34px rgba(2,6,23,.24)}
    .kpi{position:relative;display:grid;grid-template-columns:46px 1fr;gap:12px;align-items:center;text-align:left;padding:14px;border:1px solid var(--border);border-radius:13px;background:linear-gradient(145deg,var(--panel),var(--row));color:var(--text);cursor:pointer;min-height:100px}.icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:21px;color:#fff;background:#3b82f6}.icon.green{background:#18b86b}.icon.purple{background:#7456d8}.icon.orange{background:#f59e0b}.icon.red{background:#ef4f3f}.icon.pink{background:#d83d7d}.icon.teal{background:#10b7a3}.kpi-copy{display:grid;gap:4px;min-width:0}.kpi small{font-size:12px;color:var(--muted)}.kpi strong{font-size:21px;white-space:nowrap}.kpi em{font-style:normal;font-size:10px;color:var(--muted)}.open{position:absolute;right:10px;top:8px;color:var(--muted)}
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

    .trend-bars{height:150px;display:flex;align-items:flex-end;gap:6px;padding:8px 4px 0;overflow-x:auto}.trend-bar{height:100%;min-width:22px;flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.trend-bar i{display:block;width:72%;min-height:3px;border-radius:6px 6px 2px 2px;background:linear-gradient(180deg,#22d3ee,#3b82f6);transition:height .2s ease}.trend-bars.green .trend-bar i{background:linear-gradient(180deg,#34d399,#10b981)}.trend-bar span{font-size:9px;color:var(--muted);white-space:nowrap}.modal-tools{display:flex;align-items:end;gap:10px;flex-wrap:wrap;padding:14px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.modal-tools label{display:grid;gap:5px;min-width:150px}.modal-tools label span{font-size:10px;font-weight:900;text-transform:uppercase;color:var(--muted)}.modal-tools input,.modal-tools select{height:36px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 10px;outline:none}.modal-search{flex:1;min-width:220px!important}.clear-filter{height:36px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);font-weight:800;padding:0 14px;cursor:pointer}.clear-filter:disabled{opacity:.45}.sortable{cursor:pointer;user-select:none}.money-cell{text-align:right!important;font-variant-numeric:tabular-nums}.status-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 9px;font-size:10px;font-weight:900;background:rgba(148,163,184,.14);color:var(--text)}.status-badge[data-status*="paid"],.status-badge[data-status*="finished"],.status-badge[data-status*="approved"]{background:rgba(16,185,129,.15);color:#34d399}.status-badge[data-status*="pending"],.status-badge[data-status*="partial"]{background:rgba(245,158,11,.16);color:#fbbf24}.status-badge[data-status*="cancel"]{background:rgba(239,68,68,.16);color:#f87171}.xlsx-btn{height:36px;border:1px solid rgba(16,185,129,.45);border-radius:11px;background:rgba(16,185,129,.14);color:#34d399;padding:0 16px;font-weight:900;cursor:pointer}.xlsx-btn:disabled{opacity:.5}.export-overlay{position:absolute;inset:0;z-index:20;display:grid;place-items:center;background:color-mix(in srgb,var(--panel) 82%,transparent);backdrop-filter:blur(7px)}.analytics-output-modal{position:relative}.export-loader{min-width:280px;display:grid;place-items:center;text-align:center;gap:8px;padding:26px;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:var(--shadow)}.export-loader span{width:44px;height:44px;border:4px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}.export-loader b{font-size:16px}.export-loader small{color:var(--muted)}@keyframes spin{to{transform:rotate(360deg)}}
    @media(max-width:1250px){.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:repeat(3,1fr)}}@media(max-width:900px){.page-head{align-items:flex-start;flex-direction:column}.filters{width:100%}.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:repeat(2,1fr)}}@media(max-width:1000px){.analytics-paged-footer{grid-template-columns:1fr auto}.modal-pagination{grid-column:1/-1;grid-row:1;justify-content:flex-start}.analytics-paged-footer .output-footer-summary{grid-column:1;grid-row:2}.analytics-paged-footer .output-footer-actions{grid-column:2;grid-row:2}}@media(max-width:760px){.output-modal-backdrop{padding:12px}.rich-output-modal{width:96vw;height:92vh;max-height:92vh;border-radius:20px}.output-modal-meta{grid-template-columns:1fr 1fr}.output-modal-meta>div{padding:10px 14px}.output-modal-meta>div:nth-child(3){grid-column:1/-1;border-top:1px solid var(--border)}.output-modal-footer{padding:12px 14px}.output-modal-heading p{display:none}.output-modal-close{width:38px;height:38px;min-width:38px}}@media(max-width:620px){.kpi-grid,.insight-grid,.dashboard-skeleton{grid-template-columns:1fr}.filters input[type="date"]{width:180px;min-width:180px}.range-arrow{display:none}.output-modal-backdrop{padding:8px}.rich-output-modal{width:calc(100vw - 16px);height:calc(100vh - 16px);max-height:calc(100vh - 16px);border-radius:16px}.output-modal-header{padding:14px}.output-modal-meta>div{padding:9px 12px}.analytics-table-shell{padding:0 12px 16px}.output-modal-footer{align-items:stretch;flex-direction:column}.analytics-paged-footer{display:flex}.modal-pagination{order:1;justify-content:flex-start;overflow-x:auto;padding-bottom:2px}.analytics-paged-footer .output-footer-summary{order:2}.analytics-paged-footer .output-footer-actions{order:3}.output-footer-actions{width:100%}.print-btn,.close-btn{width:100%}}
  `]
})
export class AnalyticsPageComponent implements OnInit {
  @ViewChild('analyticsDialog') analyticsDialog?: ElementRef<HTMLDialogElement>;
  bills:any[]=[]; previousBills:any[]=[]; items:any[]=[]; refunds:any[]=[]; reports:any[]=[]; fromDate=''; toDate=''; modal:ModalState=null; loading=true; modalLoading=false; exportLoading=false; exportMessage='Preparing export…'; modalSearch=''; modalStatusFilter=''; modalConsultantFilter=''; modalPaymentFilter=''; modalSortKey=''; modalSortDirection:'asc'|'desc'='asc'; modalPage=1; modalPageSize=25; modalPageSizes=[10,25,50,100]; skeletonCards=Array.from({length:12}); skeletonPanels=Array.from({length:8}); modalSkeletonRows=Array.from({length:7});
  async ngOnInit(){ this.setCurrentMonth(false); await this.reload(); }
  ngOnDestroy(){ this.restoreBodyScroll(); }
  @HostListener('document:keydown.escape') onEscape(){ if(this.modal) this.closeModal(); }
  async reload(){
    this.loading=true;
    try{
      const analytics = window.limsApi.analytics;
      const current = analytics ? await analytics({from:this.fromDate,to:this.toDate}) : {bills:await window.limsApi.listBills({from:this.fromDate,to:this.toDate}),items:[],refunds:[]};
      this.bills=current?.bills||[]; this.items=current?.items||[]; this.refunds=current?.refunds||[];
      const quickRows = await window.limsApi.listReports('');
      this.reports=(quickRows||[]).filter((r:any)=>this.inSelectedDate(r.bill_date||r.created_at||r.updated_at)).map((r:any)=>{const finished=['APPROVED','FINISHED','COMPLETED'].includes(String(r.status||r.queue_status||'').toUpperCase());return {...r,queue_status:finished?'FINISHED':'PENDING',pending_item_count:finished?0:this.num(r.pending_count||r.item_count),finished_item_count:finished?this.num(r.approved_count||r.item_count):0};});
      const span=Math.max(1,Math.round((new Date(this.toDate).getTime()-new Date(this.fromDate).getTime())/86400000)+1); const prevTo=new Date(this.fromDate+'T00:00:00'); prevTo.setDate(prevTo.getDate()-1); const prevFrom=new Date(prevTo); prevFrom.setDate(prevFrom.getDate()-span+1);
      const previous=analytics ? await analytics({from:this.isoDate(prevFrom),to:this.isoDate(prevTo)}) : {bills:[]}; this.previousBills=previous?.bills||[];
    } finally { this.loading=false; }
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
  displayDate(value:any){const raw=String(value??'').trim();if(!raw)return '-';const d=new Date(raw.length===10?raw+'T00:00:00':raw.replace(' ','T'));if(Number.isNaN(d.getTime()))return raw;return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}).format(d)}
  displayDateTime(value:any){const raw=String(value??'').trim();if(!raw)return '-';const d=new Date(raw.replace(' ','T'));if(Number.isNaN(d.getTime()))return raw;return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).format(d)}
  generatedLocalDateTime(){return this.displayDateTime(new Date().toISOString())}
  displayCell(row:any,column:any){const value=row?.[column.key];if(column.money)return this.money(value);const key=String(column.key||'').toLowerCase();if(key.includes('date')||key.endsWith('_at')||key.includes('time'))return key==='date'||String(value||'').length===10?this.displayDate(value):this.displayDateTime(value);return value??'-'}
  private matchesRange(start:Date,end:Date){return this.fromDate===this.isoDate(start)&&this.toDate===this.isoDate(end)}
  trackKpiByKey(_index:number,card:{key:string}){return card.key;}
  private previousBodyOverflow:string|null=null;
  private lockBodyScroll(){if(this.previousBodyOverflow===null){this.previousBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}}
  private restoreBodyScroll(){if(this.previousBodyOverflow!==null){document.body.style.overflow=this.previousBodyOverflow;this.previousBodyOverflow=null}}
  num(v:any){const n=Number(v);return Number.isFinite(n)?n:0} money(v:any){return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2}).format(this.num(v))} billTime(b:any){const t=new Date(String(b.bill_date||b.created_at||'').replace(' ','T')).getTime();return Number.isFinite(t)?t:0} percent(v:number,total:number){return total?Math.max(0,Math.min(100,this.num(v)/total*100)):0}
  get filteredBills(){return this.bills.filter(b=>String(b.status||'').toUpperCase()!=='CANCELLED')} get cancelledBills(){return this.bills.filter(b=>String(b.status||'').toUpperCase()==='CANCELLED')} get totalBilled(){return this.filteredBills.reduce((s,b)=>s+this.num(b.total),0)} get grossRevenue(){return this.filteredBills.reduce((s,b)=>s+this.num(b.subtotal),0)} get totalPaid(){return this.filteredBills.reduce((s,b)=>s+this.num(b.paid),0)} get totalDue(){return this.filteredBills.reduce((s,b)=>s+Math.max(0,this.num(b.due)),0)} get totalDiscount(){return this.filteredBills.reduce((s,b)=>s+this.num(b.discount),0)} get averageBill(){return this.filteredBills.length?this.totalBilled/this.filteredBills.length:0} get refundTotal(){return this.refunds.reduce((s,r)=>s+this.num(r.amount),0)} get previousBilled(){return this.previousBills.filter(b=>String(b.status||'').toUpperCase()!=='CANCELLED').reduce((s,b)=>s+this.num(b.total),0)} get growthPercent(){return this.previousBilled?(this.totalBilled-this.previousBilled)/this.previousBilled*100:(this.totalBilled?100:0)}
  get pendingReports(){return this.reports.filter(r=>String(r.queue_status||'').toUpperCase()==='PENDING')}
  get finishedReports(){return this.reports.filter(r=>String(r.queue_status||'').toUpperCase()==='FINISHED')}
  get reportCols(){return[{key:'bill_date',label:'Bill Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_no',label:'Patient ID'},{key:'patient_name',label:'Patient'},{key:'consultant_name',label:'Consultant'},{key:'item_count',label:'Tests'},{key:'pending_item_count',label:'Pending'},{key:'finished_item_count',label:'Finished'},{key:'queue_status',label:'Status',status:true}]}
  get kpiCards(){const mode=(name:string)=>this.paymentRows.find(x=>x.label.toLowerCase().includes(name))?.value||0;return[
    {key:'bills',icon:'▤',tone:'',label:'Total Bills',value:String(this.filteredBills.length),note:'Click for bill details'},
    {key:'billed',icon:'₹',tone:'green',label:'Billed Value',value:this.money(this.totalBilled),note:`${this.growthPercent>=0?'↑':'↓'} ${Math.abs(this.growthPercent).toFixed(1)}% vs previous period`},
    {key:'collected',icon:'▣',tone:'purple',label:'Collected',value:this.money(this.totalPaid),note:`${this.percent(this.totalPaid,this.totalBilled).toFixed(1)}% collection rate`},
    {key:'outstanding',icon:'₹',tone:'red',label:'Outstanding',value:this.money(this.totalDue),note:`${this.filteredBills.filter(b=>this.num(b.due)>0).length} bills with balance`},
    {key:'average',icon:'≡',tone:'orange',label:'Average Bill Value',value:this.money(this.averageBill),note:'Per invoice'},
    {key:'discount',icon:'◇',tone:'pink',label:'Discounts Given',value:this.money(this.totalDiscount),note:'Across selected period'},
    {key:'discountRate',icon:'%',tone:'',label:'Discount %',value:`${this.percent(this.totalDiscount,this.grossRevenue).toFixed(2)}%`,note:'Of gross revenue'},
    {key:'gross',icon:'♙',tone:'teal',label:'Gross Revenue',value:this.money(this.grossRevenue),note:'Before discounts'},
    {key:'tests',icon:'⚗',tone:'purple',label:'Total Tests / Profiles',value:String(this.items.reduce((s,x)=>s+this.num(x.quantity||1),0)),note:'Billed item quantity'},
    {key:'patients',icon:'♧',tone:'green',label:'Patients',value:String(new Set(this.filteredBills.map(b=>b.patient_id)).size),note:'Unique billed patients'},
    {key:'consultants',icon:'♙',tone:'orange',label:'Consultants',value:String(new Set(this.filteredBills.filter(b=>b.consultant_id).map(b=>b.consultant_id)).size),note:'With billed activity'},
    {key:'cash',icon:'▰',tone:'teal',label:'Cash Collected',value:this.money(mode('cash')),note:`${this.percent(mode('cash'),this.totalPaid).toFixed(1)}% of collection`},
    {key:'card',icon:'▣',tone:'purple',label:'Card Collected',value:this.money(mode('card')),note:`${this.percent(mode('card'),this.totalPaid).toFixed(1)}% of collection`},
    {key:'upi',icon:'▥',tone:'orange',label:'UPI Collected',value:this.money(mode('upi')),note:`${this.percent(mode('upi'),this.totalPaid).toFixed(1)}% of collection`},
    {key:'cancelledBills',icon:'×',tone:'red',label:'Cancelled Bills',value:String(this.cancelledBills.length),note:`${this.cancelledBills.length} cancelled in period`},
    {key:'refunds',icon:'↻',tone:'red',label:'Refunds',value:this.money(this.refundTotal),note:`${this.refunds.length} refund${this.refunds.length===1?'':'s'}`},
    {key:'pendingReports',icon:'⌛',tone:'orange',label:'Pending Reports',value:String(this.pendingReports.length),note:`${this.pendingReports.reduce((s,r)=>s+this.num(r.pending_item_count),0)} pending test items`},
    {key:'finishedReports',icon:'✓',tone:'green',label:'Finished Reports',value:String(this.finishedReports.length),note:`${this.finishedReports.reduce((s,r)=>s+this.num(r.finished_item_count),0)} finished test items`}
  ]}
  get dailyRows(){const m=new Map<string,{billed:number,paid:number}>();for(const b of this.filteredBills){const k=this.isoDate(new Date(this.billTime(b)));const r=m.get(k)||{billed:0,paid:0};r.billed+=this.num(b.total);r.paid+=this.num(b.paid);m.set(k,r)}return[...m.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([date,v])=>({date,label:this.displayDate(date).slice(0,5),...v}))}
  get dailyMax(){return Math.max(1,...this.dailyRows.map(x=>x.billed))}
  get collectionMax(){return Math.max(1,...this.dailyRows.map(x=>x.paid))}
  get paymentRows(){const m=new Map<string,number>();for(const b of this.filteredBills){const k=String(b.payment_mode||'Unspecified');m.set(k,(m.get(k)||0)+this.num(b.paid))}return[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)} get paymentDonut(){const colors=['#32c982','#3b82f6','#f9b51a','#9b6ce5','#ef5350'];let p=0;const parts=this.paymentRows.map((r,i)=>{const a=p,b=p+this.percent(r.value,this.totalPaid);p=b;return `${colors[i%colors.length]} ${a}% ${b}%`});return `conic-gradient(${parts.length?parts.join(','):'#263247 0 100%'})`}
  get topItems(){const m=new Map<string,{name:string;count:number;value:number}>();for(const x of this.items){const name=String(x.name||'Unknown');const r=m.get(name)||{name,count:0,value:0};r.count+=this.num(x.quantity||1);r.value+=this.num(x.net_amount||x.total);m.set(name,r)}return[...m.values()].sort((a,b)=>b.count-a.count||b.value-a.value)} get topItemMax(){return Math.max(1,...this.topItems.map(x=>x.value))} get topItemCountMax(){return Math.max(1,...this.topItems.map(x=>x.count))}
  get consultantRows(){const m=new Map<string,any>();for(const b of this.filteredBills){const name=String(b.consultant_name||'Walk-in / Direct');const r=m.get(name)||{name,count:0,billed:0,paid:0,due:0};r.count++;r.billed+=this.num(b.total);r.paid+=this.num(b.paid);r.due+=Math.max(0,this.num(b.due));m.set(name,r)}return[...m.values()].sort((a,b)=>b.billed-a.billed)} get consultantMax(){return Math.max(1,...this.consultantRows.map(x=>x.billed))}
  get statusRows(){const m=new Map<string,number>();for(const b of this.bills){const k=String(b.payment_status||b.status||'Unknown').replaceAll('_',' ');m.set(k,(m.get(k)||0)+1)}return[...m.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value)}
  get ageingRows(){const now=Date.now(),a=[{label:'0 - 30 days',min:0,max:30,value:0},{label:'31 - 60 days',min:31,max:60,value:0},{label:'61 - 90 days',min:61,max:90,value:0},{label:'Over 90 days',min:91,max:Infinity,value:0}];for(const b of this.filteredBills){const due=Math.max(0,this.num(b.due));if(!due)continue;const days=Math.max(0,Math.floor((now-this.billTime(b))/86400000));a.find(x=>days>=x.min&&days<=x.max)!.value+=due}return a}

  inSelectedDate(value:any){const raw=String(value||'').slice(0,10);return !!raw&&raw>=this.fromDate&&raw<=this.toDate}
  statusText(value:any){return String(value??'').trim().toLowerCase().replaceAll('_',' ')}
  get modalStatusOptions(){return this.uniqueModalValues(['payment_status','status','queue_status'])}
  get modalConsultantOptions(){return this.uniqueModalValues(['consultant_name','name'], true)}
  get modalPaymentOptions(){return this.uniqueModalValues(['payment_mode','mode'])}
  private uniqueModalValues(keys:string[],consultantOnly=false){if(!this.modal)return[];const set=new Set<string>();for(const row of this.modal.rows){for(const key of keys){const value=String(row?.[key]??'').trim();if(value && (!consultantOnly || key==='consultant_name'))set.add(value)}}return [...set].sort((a,b)=>a.localeCompare(b))}
  get hasModalFilters(){return !!(this.modalSearch||this.modalStatusFilter||this.modalConsultantFilter||this.modalPaymentFilter)}
  get modalFilteredRows(){if(!this.modal)return[];const q=this.modalSearch.trim().toLowerCase();let rows=this.modal.rows.filter(row=>{const searchOk=!q||this.modal!.columns.some(c=>String(row?.[c.key]??'').toLowerCase().includes(q));const status=String(row.payment_status||row.status||row.queue_status||'');const statusOk=!this.modalStatusFilter||status===this.modalStatusFilter;const consultant=String(row.consultant_name||'');const consultantOk=!this.modalConsultantFilter||consultant===this.modalConsultantFilter;const payment=String(row.payment_mode||row.mode||'');const paymentOk=!this.modalPaymentFilter||payment===this.modalPaymentFilter;return searchOk&&statusOk&&consultantOk&&paymentOk});if(this.modalSortKey){const key=this.modalSortKey,dir=this.modalSortDirection==='asc'?1:-1;rows=[...rows].sort((a,b)=>{const av=a?.[key],bv=b?.[key],an=Number(av),bn=Number(bv);if(Number.isFinite(an)&&Number.isFinite(bn))return(an-bn)*dir;return String(av??'').localeCompare(String(bv??''),undefined,{numeric:true,sensitivity:'base'})*dir})}return rows}
  get modalFilteredTotal(){return this.modalFilteredRows.length}
  resetModalPage(){this.modalPage=1}
  clearModalFilters(){this.modalSearch='';this.modalStatusFilter='';this.modalConsultantFilter='';this.modalPaymentFilter='';this.modalPage=1}
  sortModal(key:string){if(this.modalSortKey===key)this.modalSortDirection=this.modalSortDirection==='asc'?'desc':'asc';else{this.modalSortKey=key;this.modalSortDirection='asc'}this.modalPage=1}
  get modalTotalRecords(){return this.modal?.rows.length||0}
  get modalTotalPages(){return Math.max(1,Math.ceil(this.modalFilteredTotal/this.modalPageSize))}
  get modalPageRows(){if(!this.modal)return[];const start=(this.modalPage-1)*this.modalPageSize;return this.modalFilteredRows.slice(start,start+this.modalPageSize)}
  get modalRangeLabel(){if(!this.modalFilteredTotal)return '0 records';const start=(this.modalPage-1)*this.modalPageSize+1;const end=Math.min(this.modalPage*this.modalPageSize,this.modalFilteredTotal);return `Showing ${start}-${end} of ${this.modalFilteredTotal} filtered records`}
  get modalVisiblePages(){const total=this.modalTotalPages,current=this.modalPage,start=Math.max(1,Math.min(current-2,total-4)),end=Math.min(total,start+4);return Array.from({length:end-start+1},(_,i)=>start+i)}
  goToModalPage(page:number){this.modalPage=Math.min(this.modalTotalPages,Math.max(1,Number(page)||1));this.scrollModalTableTop()}
  changeModalPageSize(size:number){this.modalPageSize=[10,25,50,100].includes(Number(size))?Number(size):25;this.modalPage=1;this.scrollModalTableTop()}
  private scrollModalTableTop(){setTimeout(()=>this.analyticsDialog?.nativeElement.querySelector('.output-modal-body')?.scrollTo({top:0,behavior:'smooth'}),0)}

  async open(title:string,subtitle:string,columns:any[],rows:any[]){
    this.modal={title,subtitle,columns,rows:[]};
    this.modalPage=1; this.clearModalFilters(); this.modalSortKey=''; this.modalSortDirection='asc';
    this.modalLoading=true;
    this.lockBodyScroll();
    await new Promise(resolve=>setTimeout(resolve,0));
    const dialog=this.analyticsDialog?.nativeElement;
    if(dialog && !dialog.open) dialog.showModal();
    await new Promise(resolve=>setTimeout(resolve,180));
    if(this.modal) this.modal={title,subtitle,columns,rows};
    this.modalLoading=false;
  }
  onDialogBackdropClick(event:MouseEvent){if(event.target===event.currentTarget)this.closeModal();}
  openMetric(key:string){if(key==='pendingReports')return this.open('Pending Reports',this.period,this.reportCols,this.pendingReports);if(key==='cancelledBills')return this.open('Cancelled Bills',this.period,this.billCols,this.cancelledBills);if(key==='finishedReports')return this.open('Finished Reports',this.period,this.reportCols,this.finishedReports);if(key==='tests')return this.openTopTests();if(key==='consultants')return this.openConsultants();if(key==='refunds')return this.open('Refund Details',this.period,[{key:'refunded_at',label:'Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_name',label:'Patient'},{key:'mode',label:'Mode'},{key:'amount',label:'Amount',money:true}],this.refunds);if(['cash','card','upi'].includes(key)){const term=key.toLowerCase();return this.open(`${key.toUpperCase()} Collection Details`,this.period,this.billCols,this.filteredBills.filter(b=>String(b.payment_mode||'').toLowerCase().includes(term)))}const rows=key==='outstanding'?this.filteredBills.filter(b=>this.num(b.due)>0):this.filteredBills;this.open(this.kpiCards.find(x=>x.key===key)?.label||'Details',this.period,this.billCols,rows)}
  get billCols(){return[{key:'bill_date',label:'Date'},{key:'bill_no',label:'Bill No.'},{key:'patient_name',label:'Patient'},{key:'consultant_name',label:'Consultant'},{key:'total',label:'Billed',money:true},{key:'paid',label:'Paid',money:true},{key:'due',label:'Due',money:true},{key:'payment_status',label:'Status',status:true}]}
  get period(){return `${this.displayDate(this.fromDate)} to ${this.displayDate(this.toDate)}`}
  openDaily(){this.open('Daily Revenue Details',this.period,[{key:'date',label:'Date'},{key:'billed',label:'Billed',money:true},{key:'paid',label:'Collected',money:true}],this.dailyRows)} openCollections(){this.openDaily()} openPayments(){this.open('Payment Mode Details',this.period,[{key:'label',label:'Mode'},{key:'value',label:'Collected',money:true}],this.paymentRows)} openTopTests(){this.open('Test & Profile Performance',this.period,[{key:'name',label:'Test / Profile'},{key:'count',label:'Item Count'},{key:'value',label:'Billed Value',money:true}],this.topItems)} openConsultants(){this.open('Consultants',this.period,[{key:'name',label:'Consultant'},{key:'count',label:'Bills'},{key:'billed',label:'Billed',money:true},{key:'paid',label:'Collected',money:true},{key:'due',label:'Due',money:true}],this.consultantRows)} openStatuses(){this.open('Bill Status Details',this.period,[{key:'label',label:'Status'},{key:'value',label:'Bills'}],this.statusRows)} openAgeing(){this.open('Outstanding Ageing Details',this.period,[{key:'label',label:'Ageing Bucket'},{key:'value',label:'Outstanding',money:true}],this.ageingRows)} openMonthly(){this.open('Period Comparison',this.period,[{key:'period',label:'Period'},{key:'value',label:'Billed Value',money:true}],[{period:'Selected period',value:this.totalBilled},{period:'Previous period',value:this.previousBilled}])}
  private buildExportTotals(modal:NonNullable<ModalState>, sourceRows:DetailRow[]){
    const totals:any[]=[{key:'__records',label:'Total Records',value:sourceRows.length,display:String(sourceRows.length),money:false}];
    const totalKey=/count|quantity|qty|value|billed|paid|due|amount|discount|refund|balance|bills|pending|finished|tests|subtotal|total/i;
    for(const column of modal.columns){
      if(!column.money && !totalKey.test(column.key)) continue;
      const numericValues=sourceRows.map(row=>Number(row?.[column.key])).filter(value=>Number.isFinite(value));
      if(!numericValues.length) continue;
      const value=numericValues.reduce((sum,item)=>sum+item,0);
      totals.push({key:column.key,label:`Total ${column.label}`,value,display:column.money?this.money(value):new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(value),money:!!column.money});
    }
    return totals;
  }
  async downloadPdf(){
    if(!this.modal||this.modalLoading||this.exportLoading)return;
    const modal=this.modal;
    const api=window.limsApi.analyticsPdfOpen;
    if(!api){console.error('Analytics PDF generator is unavailable. Rebuild Electron after applying this update.');return;}
    this.exportLoading=true; this.exportMessage='Preparing PDF…';
    const sourceRows=this.modalFilteredRows;
    const rows=sourceRows.map(row=>{const formatted:any={};for(const column of modal.columns)formatted[column.key]=this.displayCell(row,column);return formatted;});
    const totals=this.buildExportTotals(modal,sourceRows);
    try{await api({
      title:modal.title,
      subtitle:`Selected period: ${this.period}`,
      generatedAt:this.generatedLocalDateTime(),
      columns:modal.columns.map(column=>({key:column.key,label:column.label,money:!!column.money})),
      rows,
      totals
    });}finally{this.exportLoading=false;}
  }
  async downloadXlsx(){
    if(!this.modal||this.modalLoading||this.exportLoading)return;
    const api=window.limsApi.analyticsXlsxOpen;
    if(!api){console.error('Analytics XLSX generator is unavailable.');return;}
    this.exportLoading=true;this.exportMessage='Generating Excel…';
    try{
      const modal=this.modal;
      const sourceRows=this.modalFilteredRows;
      const rows=sourceRows.map(row=>{const formatted:any={};for(const column of modal.columns)formatted[column.key]=this.displayCell(row,column);return formatted;});
      const totals=this.buildExportTotals(modal,sourceRows);
      await api({title:modal.title,subtitle:`Selected period: ${this.period}`,generatedAt:this.generatedLocalDateTime(),columns:modal.columns.map(column=>({key:column.key,label:column.label,money:!!column.money})),rows,totals});
    }finally{this.exportLoading=false;}
  }
  closeModal(){const dialog=this.analyticsDialog?.nativeElement;if(dialog?.open)dialog.close();this.modal=null;this.modalLoading=false;this.modalPage=1;this.restoreBodyScroll()}
}
