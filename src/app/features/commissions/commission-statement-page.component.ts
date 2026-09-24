import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { dateRangeFilterError, dateRangePresets, matchesDateRange, openNativeDatePicker, DATE_RANGE_FILTER_STYLES } from '../../shared/date-range-filters';

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-commission-statement-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="master-panel cs-page">
      <div class="panel-heading">
        <div class="panel-heading-left">
          <div class="panel-icon">☷</div>
          <div><h2>Commission Statement</h2><p>Period → filters → review, export, and settle.</p></div>
        </div>
        <span class="info-pill">100 bills / page</span>
      </div>
      <div class="steps">
        <button type="button" [class.on]="step()===1" (click)="goStep(1)">1. Period</button>
        <button type="button" [class.on]="step()===2" [disabled]="!periodOk()" (click)="goStep(2)">2. Filters</button>
        <button type="button" [class.on]="step()===3" [disabled]="!loaded()" (click)="goStep(3)">3. Review</button>
      </div>

      <div class="queue-fetch-banner" *ngIf="loading() || settling()" aria-live="polite">
        <span class="queue-fetch-spinner" aria-hidden="true"></span>
        <b>{{ settling() ? 'Settling commission…' : 'Loading statement…' }}</b>
        <small>{{ settling() ? 'Saving settlement for selected lines' : 'Fetching from database with current filters' }}</small>
      </div>

      <div class="cs-body" [class.is-loading]="loading() || settling()">
      <div class="entry-card" *ngIf="step()===1">
        <div class="form-section-title">Period & consultant</div>
        <div class="grid-4">
          <label class="field"><span>Consultant</span>
            <select [(ngModel)]="filters.consultant_id">
              <option [ngValue]="0">Select consultant</option>
              <option *ngFor="let c of consultants()" [ngValue]="c.id">{{c.name}}</option>
            </select>
          </label>
          <label class="field"><span>From</span><input type="date" [(ngModel)]="filters.from" (click)="openDatePicker($event)"></label>
          <label class="field"><span>To</span><input type="date" [(ngModel)]="filters.to" (click)="openDatePicker($event)"></label>
        </div>
        <div class="date-range-filters" aria-label="Period presets">
          <button type="button" [class.active]="isPreset('today')" (click)="setPreset('today')">Today</button>
          <button type="button" [class.active]="isPreset('previousDay')" (click)="setPreset('previousDay')">Previous Day</button>
          <button type="button" [class.active]="isPreset('currentMonth')" (click)="setPreset('currentMonth')">Current Month</button>
          <button type="button" [class.active]="isPreset('lastMonth')" (click)="setPreset('lastMonth')">Last Month</button>
          <button type="button" [class.active]="isPreset('thirtyDays')" (click)="setPreset('thirtyDays')">30 Days</button>
        </div>
        <div class="note err" *ngIf="dateError()">{{dateError()}}</div>
        <div class="form-actions"><button class="action-btn primary" type="button" [disabled]="!periodOk()" (click)="goStep(2)">Continue</button></div>
      </div>

      <div class="entry-card" *ngIf="step()===2">
        <div class="form-section-title">Filters · {{consultantName()}} · {{filters.from}} → {{filters.to}}</div>
        <p class="note">First generate creates the statement for <b>fully paid</b> bills. If this period was already generated, you can open the existing statement without resetting — reset only if you need to recalculate with current rules.</p>
        <div class="grid-4">
          <label class="field"><span>Commission status</span>
            <select [(ngModel)]="filters.status">
              <option value="ALL">All</option>
              <option value="UNSETTLED">Unsettled (pending + approved)</option>
              <option value="GENERATED">Pending review</option>
              <option value="APPROVED">Approved</option>
              <option value="PAID">Paid</option>
              <option value="HELD">Held</option>
            </select>
          </label>
          <label class="field"><span>Bill payment</span>
            <select [(ngModel)]="filters.payment_status">
              <option value="PAID">Fully paid (cleared)</option>
              <option value="ALL">All payments</option>
              <option value="PARTIAL">Partial</option>
              <option value="DUE">Due</option>
            </select>
          </label>
          <label class="field"><span>Bill status</span>
            <select [(ngModel)]="filters.bill_status">
              <option value="ACTIVE">Active</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="ALL">All</option>
            </select>
          </label>
          <label class="field"><span>Search</span><input [(ngModel)]="filters.search" placeholder="Bill no / patient"></label>
        </div>
        <div class="form-actions">
          <button class="action-btn ghost" type="button" (click)="goStep(1)">Back</button>
          <button class="action-btn primary" type="button" [disabled]="loading()" (click)="loadStatement()">{{loading() ? 'Loading…' : 'Generate / Load statement'}}</button>
        </div>
        <div class="note err" *ngIf="message()">{{message()}}</div>
      </div>

      <ng-container *ngIf="step()===3">
        <div class="entry-card toolbar-card">
          <div class="review-head">
            <div><strong>Review statement</strong><span>{{consultantName()}} · {{filters.from}} → {{filters.to}} · {{billListTotal}} bills</span></div>
            <div class="toolbar-actions">
              <button class="action-btn ghost" type="button" (click)="goStep(2)">Filters</button>
              <button class="action-btn ghost" type="button" [disabled]="loading() || !periodCanReset()" (click)="confirmResetAndRegenerate()" title="Clear unsettled commission and recalculate">Reset &amp; regenerate</button>
              <button class="action-btn ghost" type="button" (click)="exportModal.set(true)">Excel / PDF / Print</button>
              <button class="action-btn primary" type="button" [disabled]="!selectedItemIds().size || settling()" (click)="openSettle()">Settle</button>
            </div>
          </div>
          <div class="note info" *ngIf="viewingExisting()">
            Commission for this period was already generated. You are viewing the saved statement — no reset needed unless you want to recalculate unsettled lines with current rules.
          </div>
          <label class="check-line"><input type="checkbox" [(ngModel)]="persistOverrides"> Also update bill records when overriding / settling</label>
        </div>

        <div class="table-card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" [checked]="allPageSelected()" (change)="toggleAllPage($event)"></th>
                  <th></th>
                  <th>Date / Bill</th>
                  <th>Patient</th>
                  <th class="num">Billed</th>
                  <th class="num">Discount</th>
                  <th class="num">Commission</th>
                  <th>Method / Profile</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <ng-container *ngFor="let b of pagedBills()">
                  <tr [class.locked]="isLocked(b)" [class.off]="!isBillSelected(b)">
                    <td><input type="checkbox" [disabled]="isLocked(b)" [checked]="isBillSelected(b)" (change)="toggleBill(b,$event)"></td>
                    <td><button class="icon-btn" type="button" (click)="toggleExpand(b.bill_id)">{{expanded().has(b.bill_id) ? '▾' : '▸'}}</button></td>
                    <td><b>{{localDate(b.bill_date)}}</b><small>{{b.bill_no}}</small></td>
                    <td>{{b.patient_name || '—'}}</td>
                    <td class="num">{{money(b.bill_total)}}</td>
                    <td class="num">{{b.bill_discount > 0 ? money(b.bill_discount) : '—'}}</td>
                    <td class="num emph">{{money(billPayable(b))}}</td>
                    <td>{{b.method_summary}}</td>
                    <td><span class="status" [attr.data-status]="b.commission_status">{{statusLabel(b.commission_status)}}</span></td>
                  </tr>
                  <tr class="expand" *ngIf="expanded().has(b.bill_id)">
                    <td colspan="9">
                      <div class="item-table">
                        <div class="item-head"><span>Item</span><span>Qty</span><span>Billed rate</span><span>Discount</span><span>Net</span><span>Method</span><span>Engine</span><span>Payable</span></div>
                        <div class="item-row" *ngFor="let it of b.items">
                          <div><b>{{it.item_name}}</b><small>{{it.item_type}} · {{it.commission_rule_source || '—'}}</small></div>
                          <div>{{it.quantity || 1}}</div>
                          <div>{{money(it.price)}}</div>
                          <div>{{money((+it.discount_amount||0)+(+it.bill_discount_share||0))}}</div>
                          <div>{{money(it.net_amount)}}</div>
                          <div><small>{{it.commission_profile_name || '—'}}</small></div>
                          <div>{{money(it.engine_commission ?? it.commission_amount)}}</div>
                          <div>
                            <input class="ov" type="number" min="0" step="0.01"
                              [disabled]="isLocked(b)"
                              [ngModel]="itemPayable(it)"
                              (ngModelChange)="setOverride(it,$event)">
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                </ng-container>
                <tr *ngIf="!pagedBills().length"><td colspan="9" class="empty">No bills for this period/filter.</td></tr>
              </tbody>
            </table>
          </div>
          <div class="footer">
            <span>Showing {{pageStart()}}–{{pageEnd()}} of {{billListTotal}}</span>
            <div class="pager">
              <button type="button" (click)="setPage(1)" [disabled]="page()<=1">«</button>
              <button type="button" (click)="setPage(page()-1)" [disabled]="page()<=1">‹</button>
              <b>{{page()}} / {{totalPages()}}</b>
              <button type="button" (click)="setPage(page()+1)" [disabled]="page()>=totalPages()">›</button>
              <button type="button" (click)="setPage(totalPages())" [disabled]="page()>=totalPages()">»</button>
            </div>
          </div>
        </div>

        <div class="sticky-bar">
          <span>{{selectedBillCount()}} bills · {{selectedItemIds().size}} lines</span>
          <span>Billed {{money(selectedBilled())}}</span>
          <span>Discount {{money(selectedDiscount())}}</span>
          <span>Engine {{money(selectedEngine())}}</span>
          <span *ngIf="overrideDelta()!==0" class="delta">Δ {{money(overrideDelta())}}</span>
          <strong>Payable {{money(selectedPayable())}}</strong>
        </div>
      </ng-container>
      </div>
    </section>

    <div class="modal-backdrop" *ngIf="existingModal()" (click)="closeExistingModal()">
      <div class="modal exist-modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <small>STATEMENT EXISTS</small>
            <h3>Already generated for this period</h3>
          </div>
          <button type="button" class="modal-close" aria-label="Close" (click)="closeExistingModal()">×</button>
        </div>
        <p class="modal-hint" *ngIf="existingInfo() as info">
          Commission for <b>{{consultantName()}}</b>
          ({{info.from}} → {{info.to}}) has <b>already been generated</b> —
          <b>{{info.bill_count || 0}}</b> bills, commission {{money(info.commission_total)}}.
          You can open and review that saved statement without resetting.
          <ng-container *ngIf="info.paid_lines"> {{info.paid_lines}} paid line(s) stay locked.</ng-container>
          Use reset only if you need to recalculate unsettled lines with current rules.
        </p>
        <div class="modal-foot">
          <button class="action-btn ghost" type="button" (click)="closeExistingModal()">Cancel</button>
          <button class="action-btn ghost" type="button" [disabled]="loading() || !existingInfo()?.can_reset" (click)="resetAndRegenerate()" title="Optional — only if rules changed">
            {{loading() ? 'Working…' : 'Reset & regenerate'}}
          </button>
          <button class="action-btn primary" type="button" [disabled]="loading()" (click)="openExistingStatement()">
            {{loading() ? 'Opening…' : 'Open existing statement'}}
          </button>
        </div>
        <div class="note err" *ngIf="message()" style="margin:0 18px 14px">{{message()}}</div>
      </div>
    </div>

    <div class="modal-backdrop" *ngIf="exportModal()" (click)="exportModal.set(false)">
      <div class="modal export-modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <small>COMMISSION STATEMENT</small>
            <h3>Export fields</h3>
          </div>
          <button type="button" class="modal-close" aria-label="Close" (click)="exportModal.set(false)">×</button>
        </div>
        <p class="modal-hint">Choose columns for Excel, PDF, or print.</p>
        <div class="preset-toggle" role="tablist" aria-label="Field presets">
          <button type="button" role="tab" [class.active]="exportPreset==='summary'" (click)="applyPreset('summary')">Summary</button>
          <button type="button" role="tab" [class.active]="exportPreset==='detailed'" (click)="applyPreset('detailed')">Detailed</button>
        </div>
        <div class="field-grid">
          <label class="field-chip" *ngFor="let f of allExportFields" [class.on]="exportFields.has(f.id)">
            <input type="checkbox" [checked]="exportFields.has(f.id)" (change)="toggleField(f.id,$event)">
            <span>{{f.label}}</span>
          </label>
        </div>
        <div class="modal-foot">
          <button class="action-btn ghost" type="button" (click)="exportModal.set(false)">Cancel</button>
          <button class="action-btn ghost" type="button" (click)="doExport('excel')">Excel</button>
          <button class="action-btn ghost" type="button" (click)="doExport('pdf')">PDF</button>
          <button class="action-btn primary" type="button" (click)="doExport('print')">Print</button>
        </div>
      </div>
    </div>

    <div class="modal-backdrop" *ngIf="settleModal()" (click)="settleModal.set(false)">
      <div class="modal settle-modal" (click)="$event.stopPropagation()">
        <div class="modal-head">
          <div>
            <small>SETTLEMENT</small>
            <h3>Settle commission</h3>
          </div>
          <button type="button" class="modal-close" aria-label="Close" (click)="settleModal.set(false)">×</button>
        </div>
        <p class="modal-hint">Auto-approves unsettled selected lines, then marks them paid. Payable: <b>{{money(selectedPayable())}}</b></p>
        <label class="field"><span>Payment mode</span>
          <select [(ngModel)]="settlement.payment_mode"><option>Cash</option><option>UPI</option><option>Bank</option><option>Cheque</option></select>
        </label>
        <label class="field"><span>Reference</span><input [(ngModel)]="settlement.reference_no" placeholder="Optional"></label>
        <label class="field"><span>Notes</span><input [(ngModel)]="settlement.notes" placeholder="Optional"></label>
        <label class="check-line"><input type="checkbox" [(ngModel)]="persistOverrides"><span>Also update bill records with overrides</span></label>
        <div class="modal-foot">
          <button class="action-btn ghost" type="button" (click)="settleModal.set(false)">Cancel</button>
          <button class="action-btn primary" type="button" [disabled]="settling()" (click)="settle()">{{settling() ? 'Settling…' : 'Confirm settle'}}</button>
        </div>
        <div class="note err" *ngIf="message()">{{message()}}</div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .master-panel{
      border:1px solid #dbe6f6;border-radius:20px;
      background:#ffffff;box-shadow:0 14px 32px rgba(15,23,42,.08);padding:12px;overflow:hidden;padding-bottom:72px;
      --accent:#2563eb;--accent-soft:rgba(37,99,235,.12);
      --panel:#ffffff;--row:#f8fafc;--input:#ffffff;
      --border:#dbe4f0;--text:#0f172a;--muted:#64748b;--shadow:0 14px 32px rgba(15,23,42,.08);
      color:#0f172a;
    }
    :host-context(body.dark-theme) .master-panel{
      border-color:rgba(96,165,250,.18);
      background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(8,13,24,.94));
      box-shadow:0 18px 48px rgba(0,0,0,.34);
      --accent:#3b82f6;--accent-soft:rgba(59,130,246,.15);
      --panel:#101827;--row:#0b1220;--input:#0b1220;
      --border:rgba(148,163,184,.18);--text:#f8fafc;--muted:#94a3b8;--shadow:0 14px 40px rgba(0,0,0,.22);
      color:#f8fafc;
    }
    .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .panel-heading-left{display:flex;align-items:center;gap:10px}.panel-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,transparent),color-mix(in srgb,var(--accent) 7%,transparent));color:var(--accent);font-size:15px;font-weight:950}
    .panel-heading h2{margin:0;font-size:16px;font-weight:950}.panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:color-mix(in srgb,var(--accent) 76%,var(--text));font-size:12px;font-weight:850}
    .steps{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
    .steps button{height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 80%,transparent);color:var(--muted);font-weight:900;cursor:pointer}
    .steps button.on{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
    .entry-card{border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--row) 62%,transparent);padding:12px;margin-bottom:10px}
    .form-section-title{font-size:12px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);padding:0 0 8px;margin-bottom:10px;border-bottom:1px solid var(--border)}
    .grid-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}
    .field{display:grid;gap:6px;color:var(--text);font-size:12px;font-weight:850}
    .field input,.field select,.ov{height:36px;border-radius:10px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);padding:0 11px;font-weight:750}
    .form-actions{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;justify-content:flex-end}
    .action-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:color-mix(in srgb,var(--row) 74%,transparent);cursor:pointer}
    .action-btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff}
    .action-btn.ghost:hover{border-color:var(--accent);color:var(--accent);background:var(--accent-soft)}
    .note{margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;font-weight:800;font-size:12.5px;line-height:1.45}.note.err{border-color:rgba(239,68,68,.4);color:#ef4444}.note.info{border-color:color-mix(in srgb,var(--accent) 35%,var(--border));background:color-mix(in srgb,var(--accent) 8%,transparent);color:color-mix(in srgb,var(--accent) 70%,var(--text))}
    .check-line{display:flex;align-items:center;gap:10px;font-weight:800;margin-top:8px;font-size:12.5px;color:var(--text)}
    .check-line input[type=checkbox]{width:16px;height:16px;min-width:16px;margin:0;flex:0 0 auto;accent-color:var(--accent)}
    .review-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.review-head strong{display:block;font-size:14px}.review-head span{display:block;color:var(--muted);font-size:12px;font-weight:700;margin-top:3px}
    .toolbar-actions{display:flex;gap:8px;flex-wrap:wrap}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:color-mix(in srgb,var(--row) 52%,transparent)}
    .table-wrap{overflow:auto;max-height:520px}table{width:100%;border-collapse:collapse;min-width:980px}th,td{padding:10px 11px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top;font-size:12.5px}
    th{position:sticky;top:0;background:color-mix(in srgb,var(--panel) 70%,transparent);z-index:2;color:var(--muted);font-size:11px;text-transform:uppercase;font-weight:900}
    td small{display:block;color:var(--muted);margin-top:3px}.num{text-align:right}.emph{font-weight:950}.empty{text-align:center;color:var(--muted);padding:28px}
    tr.off{opacity:.55}.status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:950;background:color-mix(in srgb,var(--row) 80%,transparent)}
    .status[data-status="APPROVED"]{color:#16a34a}.status[data-status="PAID"]{color:#0891b2}.status[data-status="HELD"]{color:#9333ea}.status[data-status="CANCELLED"]{color:#dc2626}
    .icon-btn{width:32px;height:32px;border-radius:9px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 80%,transparent);color:var(--text);cursor:pointer}
    .expand td{background:color-mix(in srgb,var(--row) 80%,transparent);padding:8px 12px 14px}
    .item-table{display:grid;gap:6px}.item-head,.item-row{display:grid;grid-template-columns:1.4fr .4fr .7fr .7fr .7fr 1fr .7fr .8fr;gap:8px;align-items:center}
    .item-head{color:var(--muted);font-size:10px;font-weight:1000;text-transform:uppercase}.item-row{border:1px solid var(--border);border-radius:12px;padding:8px;background:color-mix(in srgb,var(--panel) 60%,transparent)}.ov{width:100%;height:34px}
    .footer{display:flex;justify-content:space-between;align-items:center;padding:12px;color:var(--muted);font-size:12px}.pager{display:flex;align-items:center;gap:8px}.pager button{width:34px;height:34px;border:1px solid var(--border);border-radius:9px;background:color-mix(in srgb,var(--input) 80%,transparent);color:var(--text)}
    .sticky-bar{position:sticky;bottom:8px;z-index:5;display:flex;gap:16px;flex-wrap:wrap;align-items:center;padding:12px 16px;border:1px solid var(--border);border-radius:16px;background:var(--panel);box-shadow:0 10px 30px rgba(0,0,0,.18);font-weight:800;font-size:12.5px;margin-top:10px}
    .sticky-bar .delta{color:#f59e0b}.sticky-bar strong{margin-left:auto;font-size:15px}
    .modal-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:grid;place-items:center;z-index:50;padding:20px}
    .modal{width:min(560px,94vw);background:var(--panel);border:1px solid var(--border);border-radius:22px;padding:0;display:grid;gap:0;color:var(--text);box-shadow:0 28px 80px rgba(0,0,0,.45);overflow:hidden}
    .modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px 0}
    .modal-head small{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.08em}
    .modal-head h3{margin:4px 0 0;font-size:18px;font-weight:950;letter-spacing:-.02em}
    .modal-close{width:34px;height:34px;border:0;border-radius:10px;background:transparent;color:var(--muted);font-size:24px;line-height:1;cursor:pointer}
    .modal-close:hover{background:var(--accent-soft);color:var(--text)}
    .modal-hint{margin:8px 18px 0;color:var(--muted);font-size:12.5px;font-weight:750;line-height:1.4}
    .modal-hint b{color:var(--text)}
    .preset-toggle{display:grid;grid-template-columns:1fr 1fr;margin:14px 18px 0;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:color-mix(in srgb,var(--row) 70%,transparent)}
    .preset-toggle button{height:38px;border:0;border-right:1px solid var(--border);background:transparent;color:var(--muted);font-size:12.5px;font-weight:850;cursor:pointer}
    .preset-toggle button:last-child{border-right:0}
    .preset-toggle button:hover{color:var(--text);background:var(--accent-soft)}
    .preset-toggle button.active{color:var(--accent);background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 14%,transparent),color-mix(in srgb,var(--accent) 6%,transparent));box-shadow:inset 0 -2px 0 var(--accent)}
    .field-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 18px;max-height:min(42vh,320px);overflow:auto;padding-right:2px}
    .field-chip{display:flex;align-items:center;gap:10px;min-width:0;margin:0;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--row) 55%,transparent);color:var(--text);font-size:12.5px;font-weight:800;cursor:pointer;transition:border-color .12s,background .12s}
    .field-chip span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .field-chip input[type=checkbox]{width:16px;height:16px;min-width:16px;margin:0;flex:0 0 auto;accent-color:var(--accent);appearance:auto;-webkit-appearance:checkbox}
    .field-chip:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--border));background:var(--accent-soft)}
    .field-chip.on{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 12%,transparent)}
    .modal-foot{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:14px 18px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--row) 40%,transparent)}
    .settle-modal{width:min(440px,94vw);padding-bottom:0}
    .settle-modal .field{margin:12px 18px 0}
    .settle-modal .check-line{margin:12px 18px 0}
    .settle-modal .note{margin:0 18px 12px}
    .exist-modal{width:min(520px,94vw)}
    .exist-modal .modal-hint{margin-bottom:4px}
    .queue-fetch-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--accent-soft) 70%,var(--panel))}
    .queue-fetch-banner b{font-size:13px;font-weight:900;color:var(--text)}
    .queue-fetch-banner small{color:var(--muted);font-size:11px;font-weight:750}
    .queue-fetch-spinner{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--accent) 25%,transparent);border-top-color:var(--accent);animation:queueSpin .7s linear infinite;flex:0 0 auto}
    @keyframes queueSpin{to{transform:rotate(360deg)}}
    .cs-body.is-loading{opacity:.55;pointer-events:none;transition:opacity .15s ease}
    :host-context(body.light) .master-panel{--accent:#2563eb;--panel:#ffffff;--row:#f8fafc;--input:#ffffff;--border:#dbe4f0;--text:#0f172a;--muted:#64748b;--shadow:0 14px 32px rgba(15,23,42,.08);background:#fff;border-color:#dbe6f6}
    :host-context(body.light) .entry-card,:host-context(body.light) .table-card{background:#fff;border-color:#e2e8f0}
    :host-context(body.light) .modal{background:#fff;border-color:#e2e8f0}
    :host-context(body.light) .field-chip{background:#fff;border-color:#e2e8f0}
    :host-context(body.light) .modal-foot{background:#f8fafc}
    @media(max-width:980px){.grid-4,.item-head,.item-row,.field-grid{grid-template-columns:1fr}}
    ${DATE_RANGE_FILTER_STYLES}
  `]
})
export class CommissionStatementPageComponent implements OnInit {
  consultants = signal<any[]>([]);
  bills = signal<any[]>([]);
  totals = signal<any>({});
  step = signal<Step>(1);
  loading = signal(false);
  settling = signal(false);
  loaded = signal(false);
  message = signal('');
  page = signal(1);
  pageSize = 50;
  billListTotal = 0;
  expanded = signal<Set<number>>(new Set());
  selectedItemIds = signal<Set<number>>(new Set());
  overrides = signal<Map<number, number>>(new Map());
  exportModal = signal(false);
  settleModal = signal(false);
  existingModal = signal(false);
  existingInfo = signal<any>(null);
  viewingExisting = signal(false);
  persistOverrides = false;
  exportPreset: 'summary' | 'detailed' | 'custom' = 'summary';
  exportFields = new Set<string>(['bill_no','bill_date','patient_name','bill_total','bill_discount','commission_total','commission_status','method_summary']);
  settlement: any = { payment_mode: 'Cash', reference_no: '', notes: '' };
  filters: any = { consultant_id: 0, from: '', to: '', status: 'ALL', payment_status: 'PAID', bill_status: 'ACTIVE', search: '' };

  allExportFields = [
    { id: 'bill_no', label: 'Bill No' }, { id: 'bill_date', label: 'Date' }, { id: 'patient_name', label: 'Patient' },
    { id: 'bill_total', label: 'Billed total' }, { id: 'bill_discount', label: 'Discount' }, { id: 'commission_total', label: 'Commission' },
    { id: 'commission_status', label: 'Status' }, { id: 'method_summary', label: 'Method / Profile' },
    { id: 'item_name', label: 'Item name' }, { id: 'qty', label: 'Qty' }, { id: 'price', label: 'Billed rate' },
    { id: 'item_discount', label: 'Item discount' }, { id: 'net_amount', label: 'Net' }, { id: 'commission_amount', label: 'Line commission' },
    { id: 'profile_name', label: 'Profile' }, { id: 'rule_source', label: 'Rule source' }
  ];

  totalPages = computed(() => Math.max(1, Math.ceil(this.billListTotal / Math.max(1, this.pageSize))));
  pagedBills = computed(() => this.bills());
  pageStart = computed(() => this.billListTotal ? (this.page() - 1) * this.pageSize + 1 : 0);
  pageEnd = computed(() => Math.min(this.page() * this.pageSize, this.billListTotal));

  async ngOnInit() {
    const range = dateRangePresets().currentMonth;
    this.filters.from = range.from;
    this.filters.to = range.to;
    this.consultants.set(await this.loadActiveConsultants());
    try {
      const saved = JSON.parse(localStorage.getItem('lims-commission-statement-fields') || '[]');
      if (Array.isArray(saved) && saved.length) this.exportFields = new Set(saved);
    } catch {}
  }

  private async loadActiveConsultants() {
    const api: any = window.limsApi;
    if (api.searchConsultants) {
      const result = await api.searchConsultants({ status: 'ACTIVE', page: 1, pageSize: 100 });
      return Array.isArray(result?.rows) ? result.rows : [];
    }
    return (await window.limsApi.listConsultants()).filter((c: any) => +c.active !== 0);
  }

  openDatePicker(e: Event) { openNativeDatePicker(e); }
  setPreset(key: keyof ReturnType<typeof dateRangePresets>) {
    const range = dateRangePresets()[key];
    this.filters.from = range.from;
    this.filters.to = range.to;
  }
  isPreset(key: keyof ReturnType<typeof dateRangePresets>) { return matchesDateRange(this.filters.from, this.filters.to, dateRangePresets()[key]); }

  dateError() {
    return dateRangeFilterError(this.filters.from, this.filters.to);
  }
  periodOk() { return !!this.filters.consultant_id && !this.dateError(); }
  consultantName() {
    return this.consultants().find(c => +c.id === +this.filters.consultant_id)?.name || 'Consultant';
  }

  goStep(s: Step) {
    if (s === 2 && !this.periodOk()) return;
    if (s === 3 && !this.loaded()) return;
    this.step.set(s);
    this.message.set('');
  }

  async loadStatement() {
    if (!this.periodOk()) return;
    this.loading.set(true);
    this.message.set('');
    try {
      const info = await window.limsApi.commissionStatementPeriodInfo?.(this.filters);
      if (info?.exists) {
        this.existingInfo.set(info);
        this.existingModal.set(true);
        return;
      }
      this.viewingExisting.set(false);
      await this.fetchStatement({ regenerate: false });
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  closeExistingModal() {
    this.existingModal.set(false);
    this.existingInfo.set(null);
  }

  async openExistingStatement() {
    this.loading.set(true);
    this.message.set('');
    try {
      this.closeExistingModal();
      this.viewingExisting.set(true);
      await this.fetchStatement({ skipGenerate: true });
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async resetAndRegenerate() {
    this.loading.set(true);
    this.message.set('');
    try {
      await window.limsApi.resetCommissionStatementPeriod?.(this.filters);
      this.closeExistingModal();
      this.viewingExisting.set(false);
      await this.fetchStatement({ regenerate: true });
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  async confirmResetAndRegenerate() {
    if (!this.periodCanReset()) {
      this.message.set('Paid commission for this period cannot be reset here.');
      return;
    }
    const ok = window.confirm(
      `Reset unsettled commission for ${this.consultantName()} (${this.filters.from} → ${this.filters.to}) and regenerate with current rules?\n\nPaid lines stay locked.\n\nYou can keep viewing the existing statement without resetting if you only need to review or settle.`
    );
    if (!ok) return;
    this.loading.set(true);
    this.message.set('');
    try {
      await window.limsApi.resetCommissionStatementPeriod?.(this.filters);
      this.viewingExisting.set(false);
      await this.fetchStatement({ regenerate: true });
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.loading.set(false);
    }
  }

  periodCanReset() {
    const bills = this.bills();
    return bills.some(b => !this.isLocked(b) && (b.items || []).length);
  }

  private async fetchStatement(opts: { regenerate?: boolean; skipGenerate?: boolean; keepSelection?: boolean } = {}) {
    if (!opts.keepSelection) this.page.set(1);
    const data = await window.limsApi.listCommissionStatement?.({
      ...this.filters,
      regenerate: !!opts.regenerate,
      skipGenerate: !!opts.skipGenerate,
      page: this.page(),
      pageSize: this.pageSize
    });
    const bills = (data?.bills || []).map((b: any) => ({
      ...b,
      items: (b.items || []).map((it: any) => ({ ...it, engine_commission: +Number(it.commission_amount || 0).toFixed(2) }))
    }));
    this.bills.set(bills);
    this.totals.set(data?.totals || {});
    this.billListTotal = Math.max(0, +(data as any)?.total || +(data?.totals as any)?.billCount || bills.length);
    if (!opts.keepSelection) {
      const selected = new Set<number>();
      for (const b of bills) {
        if (!this.isLocked(b)) for (const it of b.items) selected.add(Number(it.id));
      }
      this.selectedItemIds.set(selected);
      this.overrides.set(new Map());
    }
    this.expanded.set(new Set());
    this.loaded.set(true);
    this.step.set(3);
  }

  setPage(p: number) {
    const next = Math.max(1, Math.min(this.totalPages(), Math.floor(+p || 1)));
    if (next === this.page()) return;
    this.page.set(next);
    void this.fetchStatement({ skipGenerate: true, keepSelection: true });
  }

  isLocked(b: any) {
    return b.commission_status === 'PAID' || b.commission_status === 'CANCELLED';
  }
  money(v: any) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(v || 0)); }
  localDate(v: any) {
    if (!v) return '—';
    const d = new Date(String(v).replace(' ', 'T'));
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-GB');
  }
  statusLabel(s: string) {
    return ({ GENERATED: 'Pending', APPROVED: 'Approved', HELD: 'Held', PAID: 'Paid', CANCELLED: 'Cancelled' } as any)[s] || s;
  }

  toggleExpand(billId: number) {
    const next = new Set(this.expanded());
    next.has(billId) ? next.delete(billId) : next.add(billId);
    this.expanded.set(next);
  }

  itemPayable(it: any) {
    const ov = this.overrides();
    return ov.has(Number(it.id)) ? ov.get(Number(it.id))! : Number(it.engine_commission ?? it.commission_amount ?? 0);
  }
  setOverride(it: any, value: any) {
    const next = new Map(this.overrides());
    const amount = Math.max(0, +Number(value || 0).toFixed(2));
    const engine = +Number(it.engine_commission ?? it.commission_amount ?? 0).toFixed(2);
    if (amount === engine) next.delete(Number(it.id));
    else next.set(Number(it.id), amount);
    this.overrides.set(next);
  }
  billPayable(b: any) {
    return +((b.items || []).reduce((s: number, it: any) => s + this.itemPayable(it), 0)).toFixed(2);
  }

  isBillSelected(b: any) {
    const ids = this.selectedItemIds();
    const items = b.items || [];
    return !!items.length && items.every((it: any) => ids.has(Number(it.id)));
  }
  toggleBill(b: any, e: any) {
    if (this.isLocked(b)) return;
    const next = new Set(this.selectedItemIds());
    for (const it of b.items || []) e.target.checked ? next.add(Number(it.id)) : next.delete(Number(it.id));
    this.selectedItemIds.set(next);
  }
  allPageSelected() {
    const eligible = this.pagedBills().filter(b => !this.isLocked(b));
    return !!eligible.length && eligible.every(b => this.isBillSelected(b));
  }
  toggleAllPage(e: any) {
    const next = new Set(this.selectedItemIds());
    for (const b of this.pagedBills()) {
      if (this.isLocked(b)) continue;
      for (const it of b.items || []) e.target.checked ? next.add(Number(it.id)) : next.delete(Number(it.id));
    }
    this.selectedItemIds.set(next);
  }

  selectedBills() {
    const ids = this.selectedItemIds();
    return this.bills().filter(b => (b.items || []).some((it: any) => ids.has(Number(it.id))));
  }
  selectedBillCount() { return this.selectedBills().length; }
  selectedBilled() { return +this.selectedBills().reduce((s, b) => s + Number(b.bill_total || 0), 0).toFixed(2); }
  selectedDiscount() { return +this.selectedBills().reduce((s, b) => s + Number(b.bill_discount || 0), 0).toFixed(2); }
  selectedEngine() {
    const ids = this.selectedItemIds();
    let sum = 0;
    for (const b of this.bills()) for (const it of b.items || []) if (ids.has(Number(it.id))) sum += Number(it.engine_commission ?? it.commission_amount ?? 0);
    return +sum.toFixed(2);
  }
  selectedPayable() {
    const ids = this.selectedItemIds();
    let sum = 0;
    for (const b of this.bills()) for (const it of b.items || []) if (ids.has(Number(it.id))) sum += this.itemPayable(it);
    return +sum.toFixed(2);
  }
  overrideDelta() { return +(this.selectedPayable() - this.selectedEngine()).toFixed(2); }

  overridePayload() {
    return [...this.overrides().entries()].map(([bill_item_id, commission_amount]) => ({ bill_item_id, commission_amount }));
  }

  applyPreset(kind: 'summary' | 'detailed') {
    this.exportPreset = kind;
    if (kind === 'summary') {
      this.exportFields = new Set(['bill_no','bill_date','patient_name','bill_total','bill_discount','commission_total','commission_status','method_summary']);
    } else {
      this.exportFields = new Set(['bill_no','bill_date','patient_name','bill_total','bill_discount','commission_total','commission_status','method_summary','item_name','qty','price','item_discount','net_amount','commission_amount','profile_name','rule_source']);
    }
  }
  toggleField(id: string, e: any) {
    if (e.target.checked) this.exportFields.add(id); else this.exportFields.delete(id);
    this.exportPreset = 'custom';
  }

  exportPayload() {
    return {
      filters: this.filters,
      fields: [...this.exportFields],
      detailed: [...this.exportFields].some(f => ['item_name','qty','price','item_discount','net_amount','commission_amount','profile_name','rule_source'].includes(f)),
      bill_ids: this.selectedBills().map(b => b.bill_id),
      item_ids: [...this.selectedItemIds()],
      overrides: this.overridePayload(),
      open: true
    };
  }

  async doExport(kind: 'excel' | 'pdf' | 'print') {
    localStorage.setItem('lims-commission-statement-fields', JSON.stringify([...this.exportFields]));
    const payload = this.exportPayload();
    try {
      if (kind === 'excel') await window.limsApi.commissionStatementExcel?.(payload);
      else await window.limsApi.commissionStatementPdf?.(payload);
      this.exportModal.set(false);
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    }
  }

  openSettle() {
    if (!this.selectedItemIds().size) return;
    this.message.set('');
    this.settleModal.set(true);
  }

  async settle() {
    this.settling.set(true);
    this.message.set('');
    try {
      if (this.persistOverrides && this.overridePayload().length) {
        await window.limsApi.applyCommissionOverrides?.({ items: this.overridePayload(), reason: 'Statement override before settle' });
      }
      const result = await window.limsApi.settleCommissionStatement?.({
        ids: [...this.selectedItemIds()],
        overrides: this.overridePayload(),
        persist_overrides: this.persistOverrides,
        payment_mode: this.settlement.payment_mode,
        reference_no: this.settlement.reference_no,
        notes: this.settlement.notes
      });
      this.settleModal.set(false);
      if (result?.settlementId) {
        const openPdf = window.confirm(`Settled ${result.settlementNo} for ${this.money(result.amount)}. Open settlement PDF?`);
        if (openPdf) await window.limsApi.commissionSettlementPdf?.(result.settlementId, true);
      }
      await this.loadStatement();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.settling.set(false);
    }
  }
}
