import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';
import { code128Svg } from '../../shared/code128';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { OptionInputEngine } from './result-input/option-input.engine';
import { SearchSelectInputEngine } from './result-input/search-select-input.engine';
import { ResultOption } from './result-input/result-option';

type ReportQueueStatus = 'DRAFT' | 'TYPED' | 'RECHECK' | 'APPROVED' | 'CANCELLED' | 'LOG';
type WorkspaceMode = 'ENTRY' | 'APPROVE' | 'APPROVED';
type PdfPreviewState = { title: string; url: SafeResourceUrl } | null;
type ReopenState = { report: ReportVm; reason: string; error: string } | null;
type ResetConfirmState = { title: string; message: string; details: string; confirmText: string; cancelText: string } | null;
type ApprovedAction = 'VIEW' | 'PDF' | 'PRINT' | 'EMAIL' | 'WHATSAPP' | 'SMS';
type ApprovedActionState = { action: ApprovedAction; sourceReportId: number; reports: any[]; pending: any[]; showProfileName: boolean; showSubHeader: boolean; withBackground: boolean; signatures: any[]; mergeMode: 'MERGE' | 'SEPARATE'; printGrouping: 'BILL' | 'REPORT'; singleTestPlacement: 'TOP' | 'DEPARTMENT'; error: string } | null;
type RejectState = { report: ReportVm; mode: 'ENTRY' | 'RECOLLECTION' | 'RECHECK'; reason: string; error: string } | null;
type RecheckRequestState = { report: ReportVm; items: any[]; mode: 'INHOUSE' | 'OUTSOURCE' | 'BOTH'; vendor_id: number; reason: string; error: string } | null;
type ReportSection = { key: string; name: string; items: any[]; entered: number; itemCount: number; order: number; kind: 'PROFILE' | 'SINGLE' | 'GROUP' };
type ReportVm = any & { safeItems: any[]; safeSections: ReportSection[]; selectedCount: number; completionPercent: number; criticalList: any[]; abnormalList: any[] };

type HistoryState = { item: any; rows: any[]; loading: boolean; error: string } | null;
type QuickBarcodeModalState = { mode:'GENERATE'|'RESET'; row:any; state:any; selectedSpecimenKey:string; selectedCollectionKey:string; collectionDate:string; collectionTime:string; collectionType:string; manualCollectionType:string; selectedItemKeys:string[]; selectedItemSpecimenKeys:Record<string,string>; itemCollectionEvents?:Record<string,{collection_date:string; collection_time:string}>; error:string; loading?:boolean; step?:1|2|3; itemGroups?:any[]; collectionEventItems?:any[]; selectedCount?:number; pendingCount?:number; validationMessage?:string } | null;

@Component({
  selector: 'app-report-typing-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatMenuModule, MatSnackBarModule],
  template: `
    <section class="reporting-page">
      <ng-container *ngIf="!selectedReport(); else reportWorkspace">
        <div class="report-fixed-head">
          <div class="report-tabs">
            <button type="button" [class.active]="reportStatus==='DRAFT'" (click)="setReportStatus('DRAFT')"><span>Pending Results</span><b>{{reportCountByStatus('DRAFT')}}</b></button>
            <button type="button" *ngIf="!quickReporting" [class.active]="reportStatus==='TYPED'" (click)="setReportStatus('TYPED')"><span>Waiting Approval</span><b>{{reportCountByStatus('TYPED')}}</b></button>
            <!-- Pending Rechecks is intentionally hidden from Reporting. Recheck workflow stays internal/action-based. -->
            <button type="button" [class.active]="reportStatus==='APPROVED'" (click)="setReportStatus('APPROVED')"><span>{{quickReporting ? 'Finished' : 'Approved'}}</span><b>{{reportCountByStatus('APPROVED')}}</b></button>
            <button type="button" *ngIf="!quickReporting" [class.active]="reportStatus==='CANCELLED'" (click)="setReportStatus('CANCELLED')"><span>Cancelled</span><b>{{reportCountByStatus('CANCELLED')}}</b></button>
            <button type="button" *ngIf="!quickReporting" [class.active]="reportStatus==='LOG'" (click)="setReportStatus('LOG')"><span>Report log</span><b>{{reportLogCount()}}</b></button>
          </div>
        </div>

        <div class="report-content">
          <div class="master-card list-card">
            <div class="section-title">
              <div><h3>{{activeQueueTitle()}}</h3></div>
              <div class="head-actions"><button class="btn ghost small" type="button" (click)="reload()" [disabled]="busy()">↻ Refresh</button></div>
            </div>
            <div class="filter-row">
              <input placeholder="Search bill / patient / mobile..." [formControl]="queueFilterForm.controls.search">
              <input type="date" [formControl]="queueFilterForm.controls.fromDate" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)">
              <input type="date" [formControl]="queueFilterForm.controls.toDate" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)">
            </div>
            <div class="pending-summary-toolbar" *ngIf="reportStatus==='DRAFT' && filteredReports().length">
              <label class="plain-check pending-master-check">
                <input type="checkbox" [checked]="allVisiblePendingSelected()" [indeterminate]="someVisiblePendingSelected() && !allVisiblePendingSelected()" (change)="toggleAllVisiblePending($any($event.target).checked)">
                <span>Select pending</span>
              </label>
              <span class="pending-selected-count">{{pendingSummarySelectedCount()}} selected</span>
              <button class="btn primary small" type="button" *ngIf="pendingSummarySelectedCount() > 0" (click)="printPendingSummary()" [disabled]="busy()">Pending Summary</button>
              <button class="btn ghost small" type="button" *ngIf="pendingSummarySelectedCount() > 0" (click)="printBulkQuickBarcodeSelected()" [disabled]="busy()">Print Barcodes</button>
            </div>
            <div class="queue-view-toggle" *ngIf="canGroupReportQueue()">
              <button type="button" [class.active]="reportQueueView==='BILL'" (click)="setReportQueueView('BILL')">Group by bill</button>
              <button type="button" [class.active]="reportQueueView==='REPORT'" (click)="setReportQueueView('REPORT')">Group by report</button>
              <span>{{quickReporting ? (reportQueueView==='BILL' ? 'Finished reports are grouped bill-wise for review and printing.' : 'Each finished report is shown separately.') : (reportQueueView==='BILL' ? 'Bill view is for review/printing. Reject is hidden here.' : 'Report view is for approve/reject workflow actions.')}}</span>
            </div>
            <div class="log-type-filter" *ngIf="reportStatus==='LOG'">
              <button type="button" [class.active]="logFilter==='ALL'" (click)="logFilter='ALL'">All</button>
              <button type="button" [class.active]="logFilter==='RESULT'" (click)="logFilter='RESULT'">Result</button>
              <button type="button" [class.active]="logFilter==='CORRECTION'" (click)="logFilter='CORRECTION'">Correction</button>
              <button type="button" [class.active]="logFilter==='RECHECK'" (click)="logFilter='RECHECK'">Recheck</button>
              <button type="button" [class.active]="logFilter==='DELIVERY'" (click)="logFilter='DELIVERY'">Delivery</button>
              <button type="button" [class.active]="logFilter==='CANCEL'" (click)="logFilter='CANCEL'">Cancel</button>
            </div>
            <ng-container *ngIf="reportStatus==='LOG'; else reportQueueTable">
              <table class="master-table">
                <thead><tr><th>Date / time</th><th>Bill</th><th>Patient</th><th>Activity</th><th>Status</th></tr></thead>
                <tbody>
                  <tr *ngFor="let l of filteredReportLogs(); trackBy: trackLog">
                    <td><b>{{formatDateTime(l.created_at)}}</b><small>{{dateOnly(l.created_at)}}</small></td>
                    <td><b>{{l.bill_no || '-'}}</b><small>{{l.details_label || l.details || ''}}</small></td>
                    <td><b>{{l.patient_name || '-'}}</b><small>{{l.patient_mobile || ''}}</small></td>
                    <td><span class="status-pill">{{l.action_label || l.action}}</span></td>
                    <td><span class="status-pill" [class.typed]="l.status==='TYPED'" [class.approved]="l.status==='APPROVED'">{{l.status ? statusDisplay(l.status) : '-'}}</span></td>
                  </tr>
                </tbody>
              </table>
              <div class="empty" *ngIf="!filteredReportLogs().length">No reporting log found.</div>
            </ng-container>
            <ng-template #reportQueueTable>
              <div class="report-queue-scroll">
              <table class="master-table report-queue-table">
                <colgroup>
                  <col class="rq-select-col">
                  <col class="rq-bill-col">
                  <col class="rq-patient-col">
                  <col class="rq-date-col">
                  <col class="rq-action-col">
                  <col class="rq-expand-col">
                </colgroup>
                <thead><tr><th class="select-col"></th><th>Bill</th><th>Patient</th><th>Date</th><th>Action</th><th class="expand-head"></th></tr></thead>
                <tbody>
                  <ng-container *ngFor="let r of filteredReports(); trackBy: trackReport">
                    <tr class="report-queue-row" [class.report-pending-colors]="reportStatus==='DRAFT'" [class.pending-selected]="isPendingSummarySelected(r)">
                      <td class="select-col pending-select-cell">
                        <input *ngIf="reportStatus==='DRAFT'" type="checkbox" [checked]="isPendingSummarySelected(r)" (click)="$event.stopPropagation()" (change)="togglePendingSummaryRow(r, $any($event.target).checked)">
                      </td>
                      <td class="bill-status-cell">
                        <div class="bill-status-line" [class.complete]="progressTone(r)==='complete'" [class.pending]="progressTone(r)!=='complete'">
                          <span class="queue-status-icon queue-progress-ring" [style.--pct]="reportProgressPercent(r)"><b>{{queueStatusFraction(r)}}</b></span>
                          <b class="bill-no-inline">{{r.bill_no}}</b>
                        </div>
                        <small class="queue-group-line">{{queueGroupLabel(r)}}</small>
                      </td>
                      <td class="patient-summary-cell">
                        <b>{{r.patient_name || 'Unknown'}} · {{patientAgeGender(r)}}</b>
                        <small>{{r.patient_no || '-'}}</small>
                        <small>{{r.consultant_name || 'Self'}}</small>
                      </td>
                      <td class="date-stack-cell">
                        <div><b>Ordered</b><span>{{dateOnly(r.bill_date || r.created_at)}} {{timeOnly(r.bill_date || r.created_at)}}</span></div>
                        <div><b>{{quickReporting ? (reportStatus==='APPROVED' ? 'Saved' : 'Pending') : 'Collected'}}</b><span>{{quickReporting ? (dateOnly(r.updated_at || r.created_at || r.bill_date) + ' ' + timeOnly(r.updated_at || r.created_at || r.bill_date)) : (dateOnly(r.collected_at) + ' ' + timeOnly(r.collected_at))}}</span></div>
                      </td>
                      <td class="action-cell">
                        <div class="queue-actions compact-actions">
                          <button class="icon-action primary" *ngIf="reportStatus==='DRAFT' && !isEntryLocked(r)" type="button" (click)="openReport(r, 'DRAFT')" [disabled]="busy() || itemCountForQueue(r)===0" title="Enter Results" aria-label="Enter Results">📝</button>
                          <ng-container *ngIf="quickReporting && reportStatus==='DRAFT'">
                            <button class="icon-action more-dot quick-barcode-more" type="button" title="Barcode actions" aria-label="Barcode actions" [matMenuTriggerFor]="quickBarcodeActionsMenu" [disabled]="busy() || itemCountForQueue(r)===0">⋮</button>
                            <mat-menu #quickBarcodeActionsMenu="matMenu" class="lims-action-mat-menu quick-barcode-action-menu" xPosition="before" yPosition="below" [overlapTrigger]="false">
                              <div class="quick-menu-status" (click)="$event.stopPropagation()">
                                <span class="status-pill quick-barcode-pill" [class.approved]="quickBarcodeStatus(r)==='GENERATED'" [class.typed]="quickBarcodeStatus(r)==='PARTIAL'">{{quickBarcodeLabel(r)}}</span>
                              </div>
                              <button mat-menu-item type="button" (click)="openQuickBarcode(r, 'GENERATE')" [disabled]="busy() || itemCountForQueue(r)===0 || quickBarcodeStatus(r)==='GENERATED'">
                                <span>▦</span>
                                Generate Barcode
                              </button>
                              <button mat-menu-item type="button" (click)="printQuickBarcodeForBill(r)" *ngIf="quickBarcodeHasGenerated(r)" [disabled]="busy()">
                                <span>⎙</span>
                                Print Barcode
                              </button>
                              <button mat-menu-item type="button" (click)="openQuickBarcode(r, 'RESET')" [disabled]="busy() || itemCountForQueue(r)===0 || quickBarcodeStatus(r)==='PENDING'">
                                <span>↺</span>
                                Reset Barcode
                              </button>
                            </mat-menu>
                          </ng-container>
                          <button class="icon-action danger" *ngIf="reportStatus==='DRAFT' && !quickReporting" type="button" (click)="removePendingReportFromQueue(r.id)" [disabled]="busy()" title="Remove untouched pending report" aria-label="Remove pending report">🗑</button>
                          <span class="status-pill muted-action-pill" *ngIf="reportStatus==='DRAFT' && !quickReporting && isEntryLocked(r)" title="Result entry opens only after Collection receives the outsource result.">Awaiting result</span>
                          <button class="icon-action primary" *ngIf="reportStatus==='RECHECK' && !isRecheckEntryLocked(r)" type="button" (click)="openReport(r, 'RECHECK')" [disabled]="busy() || itemCountForQueue(r)===0" title="Enter Recheck Result" aria-label="Enter Recheck Result">↻</button><span class="status-pill muted-action-pill" *ngIf="reportStatus==='RECHECK' && isRecheckEntryLocked(r)" title="Outsource recheck can be typed only after dispatch and vendor result receive.">Awaiting outsource result</span>
                          <button class="icon-action danger" *ngIf="reportStatus==='RECHECK'" type="button" (click)="rejectRecheckFromQueue(r.id)" [disabled]="busy() || itemCountForQueue(r)===0" title="Reject recheck / restore to report pending" aria-label="Reject recheck">✕</button>
                          <ng-container *ngIf="reportStatus==='TYPED' && !isBillGroupedQueueRow(r)">
                            <button class="icon-action secondary" type="button" (click)="viewPdfFromQueue(r.id)" [disabled]="busy() || itemCountForQueue(r)===0" title="View" aria-label="View">👁</button>
                            <button class="icon-action" type="button" (click)="openReport(r, 'DRAFT')" [disabled]="busy() || itemCountForQueue(r)===0" title="Edit Results" aria-label="Edit Results">✎</button>
                            <button class="icon-action primary" type="button" (click)="openReport(r, 'TYPED')" [disabled]="busy() || itemCountForQueue(r)===0" title="Verify / Approve" aria-label="Verify / Approve">✓</button>
                            <button class="icon-action danger" type="button" (click)="startRejectFromQueue(r.id)" [disabled]="busy()" title="Reject" aria-label="Reject">✕</button>
                          </ng-container>
                          <span class="status-pill muted-action-pill" *ngIf="reportStatus==='TYPED' && isBillGroupedQueueRow(r)" title="Switch to Group by report to approve or reject one exact report.">Use report view</span>
                          <ng-container *ngIf="reportStatus==='APPROVED'">
                            <div class="quick-finished-actions" *ngIf="quickReporting; else normalApprovedMenu">
                              <ng-container *ngIf="reportQueueView==='BILL'; else reportFinishedActions">
                                <button class="quick-action-logo" type="button" [matMenuTriggerFor]="quickBillFinishedActions" [disabled]="busy()" title="Report actions" aria-label="Open report actions">
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M7.1 3.6 3.6 7.1a1.25 1.25 0 0 0 0 1.8l3.5 3.5a1.25 1.25 0 0 0 1.8 0l3.5-3.5a1.25 1.25 0 0 0 0-1.8L8.9 3.6a1.25 1.25 0 0 0-1.8 0Z"/>
                                    <path d="m15.1 11.6-3.5 3.5a1.25 1.25 0 0 0 0 1.8l3.5 3.5a1.25 1.25 0 0 0 1.8 0l3.5-3.5a1.25 1.25 0 0 0 0-1.8l-3.5-3.5a1.25 1.25 0 0 0-1.8 0Z"/>
                                    <circle cx="16.6" cy="6.7" r="2.1"/>
                                    <circle cx="7.3" cy="17.1" r="1.65"/>
                                  </svg>
                                  <span class="quick-action-logo-dot"></span>
                                </button>
                                <mat-menu #quickBillFinishedActions="matMenu" class="lims-action-mat-menu quick-output-actions-menu" xPosition="before" yPosition="below" [overlapTrigger]="false">
                                  <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PRINT')"><span>⎙</span>Print</button>
                                  <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PDF')"><span>⇩</span>Export</button>
                                  <button mat-menu-item type="button" class="danger-menu-item" (click)="quickDeleteFinishedGroup(r)"><span>🗑</span>Delete</button>
                                </mat-menu>
                              </ng-container>
                              <ng-template #reportFinishedActions>
                                <button class="quick-action-logo" type="button" [matMenuTriggerFor]="quickReportFinishedActions" [disabled]="busy()" title="Report actions" aria-label="Open report actions">
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <path d="M7.1 3.6 3.6 7.1a1.25 1.25 0 0 0 0 1.8l3.5 3.5a1.25 1.25 0 0 0 1.8 0l3.5-3.5a1.25 1.25 0 0 0 0-1.8L8.9 3.6a1.25 1.25 0 0 0-1.8 0Z"/>
                                    <path d="m15.1 11.6-3.5 3.5a1.25 1.25 0 0 0 0 1.8l3.5 3.5a1.25 1.25 0 0 0 1.8 0l3.5-3.5a1.25 1.25 0 0 0 0-1.8l-3.5-3.5a1.25 1.25 0 0 0-1.8 0Z"/>
                                    <circle cx="16.6" cy="6.7" r="2.1"/>
                                    <circle cx="7.3" cy="17.1" r="1.65"/>
                                  </svg>
                                  <span class="quick-action-logo-dot"></span>
                                </button>
                                <mat-menu #quickReportFinishedActions="matMenu" class="lims-action-mat-menu quick-output-actions-menu" xPosition="before" yPosition="below" [overlapTrigger]="false">
                                  <button mat-menu-item type="button" (click)="openFinishedReportForEdit(primaryApprovedReportId(r))"><span>✎</span>Edit</button>
                                  <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PRINT')"><span>⎙</span>Print</button>
                                  <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PDF')"><span>⇩</span>Export</button>
                                  <button mat-menu-item type="button" class="danger-menu-item" (click)="quickDeleteFinishedGroup(r)"><span>🗑</span>Delete</button>
                                </mat-menu>
                              </ng-template>
                            </div>
                            <ng-template #normalApprovedMenu>
                              <button class="icon-action more-dot" type="button" title="Actions" aria-label="Approved report actions" [matMenuTriggerFor]="approvedReportActionsMenu">⋮</button>
                              <mat-menu #approvedReportActionsMenu="matMenu" class="lims-action-mat-menu" xPosition="before" yPosition="below" [overlapTrigger]="false">
                                <button mat-menu-item *ngIf="!isBillGroupedQueueRow(r)" type="button" class="danger-menu-item" (click)="startCorrectionFromQueue(primaryApprovedReportId(r))" [disabled]="busy()"><span>✕</span>Reject report</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'VIEW')" [disabled]="busy()"><span>👁</span>View report</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PDF')" [disabled]="busy()"><span>PDF</span>Export PDF</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'PRINT')" [disabled]="busy()"><span>⎙</span>Print</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'EMAIL')" [disabled]="busy()"><span>✉</span>Email</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'WHATSAPP')" [disabled]="busy()"><span>☏</span>WhatsApp</button>
                                <button mat-menu-item type="button" (click)="startApprovedAction(primaryApprovedReportId(r), 'SMS')" [disabled]="busy()"><span>☏</span>SMS</button>
                              </mat-menu>
                            </ng-template>
                          </ng-container>
                        </div>
                      </td>
                      <td class="expand-cell"><button class="queue-expand-btn" type="button" (click)="toggleQueueDetails(r)" [disabled]="busy()" [attr.aria-label]="isQueueExpanded(r) ? 'Collapse report details' : 'Expand report details'">{{isQueueExpanded(r) ? '⌃' : '⌄'}}</button></td>
                    </tr>
                    <tr *ngIf="isQueueExpanded(r)" class="queue-detail-row">
                      <td colspan="6">
                        <div class="queue-detail-panel">
                          <div class="queue-detail-block">
                            <h4>{{reportStatus==='DRAFT' ? 'Pending tests' : reportStatus==='TYPED' ? 'Waiting approval tests' : reportStatus==='APPROVED' ? 'Approved tests' : 'Queue tests'}}</h4>
                            <div class="mini-list" *ngIf="queuePrimaryItems(r).length; else noPrimaryQueueItems">
                              <span *ngFor="let item of queuePrimaryItems(r)"><b>{{item.test_name}}</b><small *ngIf="sampleIdLabel(item)">Sample: {{sampleIdLabel(item)}}</small><small *ngIf="quickReporting && item.collection_type">{{item.collection_type}} <ng-container *ngIf="item.collection_datetime">· {{item.collection_datetime}}</ng-container></small></span>
                            </div>
                            <ng-template #noPrimaryQueueItems><p>No tests in this queue.</p></ng-template>
                          </div>
                          <div class="queue-detail-block" *ngIf="queueCompletedItems(r).length">
                            <h4>Already completed</h4>
                            <div class="mini-list muted"><span *ngFor="let item of queueCompletedItems(r)"><b>{{item.test_name}}</b><small *ngIf="sampleIdLabel(item)">Sample: {{sampleIdLabel(item)}} · {{resultStatusLabel(item)}}</small><small *ngIf="!sampleIdLabel(item)">{{resultStatusLabel(item)}}</small></span></div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  </ng-container>
                </tbody>
              </table>
              </div>
              <div class="empty" *ngIf="!filteredReports().length">No {{activeQueueTitle().toLowerCase()}} found.</div>
            </ng-template>
          </div>
        </div>
      </ng-container>

      <ng-template #reportWorkspace>
        <div *ngIf="selectedReport() as r" class="report-content workspace-wrap">
          <div class="master-card workspace-card">
            <div class="section-title form-head">
              <div><h3>{{workspaceTitle()}}</h3><p>{{r.bill_no}} · {{r.patient_name}} · {{reportableItems(r).length}} report items</p></div>
              <button class="btn ghost small" type="button" (click)="closeReport()">Back to list</button>
            </div>

            <div class="flow-status"><b>{{workspaceStatusTitle()}}</b><span>{{workspaceStatusText(r)}}</span></div>
            <div class="notice warning" *ngIf="criticalNotice()">{{criticalNotice()}}</div>
            <div class="notice danger" *ngIf="!r.safeItems.length">No collected reportable tests found. Please complete Collection before entering results.</div>

            <ng-container [ngSwitch]="workspaceMode()">
              <ng-container *ngSwitchCase="'ENTRY'">
                <div class="tool-row">
                  <label class="plain-check"><input type="checkbox" [checked]="allEntrySelected(r)" (change)="toggleEntrySelection(r, $any($event.target).checked)"><span>Select all tests for result entry</span></label>
                  <span>{{r.selectedCount}} selected · deselect tests that will be typed later</span>
                </div>
                <div class="meta-row">
                  <label>Typed by<input [formControl]="fieldControl(r,'typed_by')" placeholder="Typed by"></label>
                  <label>Report remarks<input [formControl]="fieldControl(r,'remarks')" placeholder="Optional remarks"></label>
                </div>

                <div class="department-card profile-card" *ngFor="let section of r.safeSections; trackBy: trackSection" draggable="true" (dragstart)="startSectionDrag($event,section)" (dragover)="allowSectionDrop($event)" (drop)="dropSection(r, section)">
                  <div class="department-head profile-head compact-report-head">
                    <div class="profile-title"><span class="drag profile-drag" title="Drag profile/test card to change report order">⋮⋮</span><label class="compact-group-check"><input type="checkbox" [checked]="sectionAllSelected(section)" [indeterminate]="sectionPartiallySelected(section)" (change)="toggleSectionSelection(r, section, $any($event.target).checked)"><span></span></label><div><h4>{{section.name}}</h4><p>{{section.kind === 'SINGLE' ? 'Single tests' : 'Profile / group'}} · {{sectionSelectedCount(section)}}/{{section.itemCount}} selected · {{section.entered}}/{{section.itemCount}} entered</p></div></div>
                    <div class="profile-actions"><button type="button" class="btn tiny ghost" (click)="toggleSectionSelection(r, section, true)" [disabled]="busy()">Select all</button><button type="button" class="btn tiny ghost" (click)="toggleSectionSelection(r, section, false)" [disabled]="busy()">Deselect</button><button type="button" class="icon-mini" title="Move profile/test card up" (click)="moveSection(r,section,-1)" [disabled]="busy()">↑</button><button type="button" class="icon-mini" title="Move profile/test card down" (click)="moveSection(r,section,1)" [disabled]="busy()">↓</button></div>
                  </div>
                  <div class="result-row compact-result-row" *ngFor="let x of section.items; trackBy: trackItem" [class.off]="x.selected_for_entry===false" [class.highlight]="truthy(x.highlight_parameter)" [class.result-picker-open]="isOptionPanelOpen(r,x) || isSearchPanelOpen(r,x)">
                    <label class="compact-test-check" [title]="x.selected_for_entry===false ? 'Type later' : 'Selected for entry'"><input type="checkbox" [formControl]="itemFieldControl(r,x,'selected_for_entry','selection')"><span></span></label>
                    <div class="order-actions" title="Test position override inside this card">
                      <span class="drag">⋮⋮</span>
                      <button type="button" class="icon-mini" title="Move test up" (click)="moveItem(r,x,-1)" [disabled]="busy()">↑</button>
                      <button type="button" class="icon-mini" title="Move test down" (click)="moveItem(r,x,1)" [disabled]="busy()">↓</button>
                    </div>
                    <div class="result-name"><b>{{x.test_name}}</b><small>{{x.department_name || section.name}}</small><small class="sample-id-line" *ngIf="sampleIdLabel(x)">Sample: {{sampleIdLabel(x)}}</small><div class="badges"><span *ngIf="truthy(x.highlight_parameter)">Highlight</span><span *ngIf="x.has_formula || x.formula_expression">Calculated</span><span *ngIf="isOutsourceItem(x)">Outsource</span><span *ngIf="x.internal_check_required">Internal check</span><span *ngIf="x.recheck_mode && x.recheck_mode !== 'NONE'">Recheck {{x.recheck_mode}}</span></div></div>
                    <div class="result-editor">
                      <span class="calc-slot">
                        <button class="icon-mini calc left-calc" *ngIf="x.has_formula || x.formula_expression" type="button" title="Calculate result" (click)="calculateItem(r,x)" [disabled]="busy()">∑</button>
                      </span>
                      <div class="result-input-label rt-result-label"><span class="rt-label-text">{{resultLabel(x)}}</span>
                        <div class="rt-control" [class.disabled]="isResultLocked(x)">
                          <ng-container *ngIf="isOptionInput(x); else searchOrFreeInput">
                            <div class="rt-control rt-picker" [class.open]="isOptionPanelOpen(r,x)" [class.open-up]="panelOpensUp(r,x,'option')" [class.disabled]="isResultLocked(x)">
                              <input class="rt-field rt-dropdown-input" type="text" [formControl]="optionTextControl(r,x)" (focus)="openOptionPanel(r,x,true,$any($event.target)); $any($event.target).select()" (click)="openOptionPanel(r,x,false,$any($event.target))" (keydown)="handleOptionKeydown($event,r,x)" (blur)="scheduleCloseOptionPanel(r,x)" placeholder="Type or select a result" autocomplete="off">
                              <span class="rt-chevron" aria-hidden="true">⌄</span>
                              <div class="rt-options-panel" *ngIf="isOptionPanelOpen(r,x)" draggable="false" (mousedown)="keepResultPickerOpen($event)" (click)="$event.stopPropagation()" (dragstart)="cancelResultPickerDrag($event)">
                                <button type="button" class="rt-option muted" *ngIf="!filteredOptionChoices(r,x).length" draggable="false">No matching suggestions — typed value will be used</button>
                                <button type="button" class="rt-option" *ngFor="let opt of filteredOptionChoices(r,x); trackBy: trackResultOption" [class.selected]="optionChoiceIsSelected(x,opt)" [class.active]="optionChoiceIsActive(r,x,opt)" [attr.aria-selected]="optionChoiceIsActive(r,x,opt)" draggable="false" (pointerdown)="commitOptionResult($event,r,x,opt)"><span class="rt-option-text">{{optionChoiceLabel(opt)}}</span><span class="rt-check" *ngIf="optionChoiceIsSelected(x,opt)">✓</span></button>
                              </div>
                            </div>
                          </ng-container>
                          <ng-template #searchOrFreeInput>
                            <ng-container *ngIf="isSearchSelectInput(x); else freeInput">
                              <div class="rt-control rt-picker" [class.open]="isSearchPanelOpen(r,x)" [class.open-up]="panelOpensUp(r,x,'search')" [class.disabled]="isResultLocked(x)">
                                <input class="rt-field" type="text" [formControl]="searchResultControl(r,x)" (focus)="openSearchPanel(r,x,true,$any($event.target)); $any($event.target).select()" (click)="openSearchPanel(r,x,true,$any($event.target))" (blur)="scheduleCloseSearchPanel(r,x)" [placeholder]="inputPlaceholder(x)" autocomplete="off">
                                <div class="rt-options-panel" *ngIf="isSearchPanelOpen(r,x)" draggable="false" (mousedown)="keepResultPickerOpen($event)" (click)="$event.stopPropagation()" (dragstart)="cancelResultPickerDrag($event)">
                                  <button type="button" class="rt-option muted" *ngIf="!filteredSearchSelectOptions(r,x).length" draggable="false">No matching suggestions — typed value will be used</button>
                                  <button type="button" class="rt-option" *ngFor="let opt of filteredSearchSelectOptions(r,x)" draggable="false" [class.selected]="searchChoiceIsSelected(x,opt)" (pointerdown)="commitSearchSelectResult($event,r,x,opt)" (dragstart)="cancelResultPickerDrag($event)"><span class="rt-option-text"><ng-container *ngFor="let part of searchOptionParts(r,x,opt)"><mark *ngIf="part.match; else normalPart">{{part.text}}</mark><ng-template #normalPart>{{part.text}}</ng-template></ng-container></span><span class="rt-check" *ngIf="searchChoiceIsSelected(x,opt)">✓</span></button>
                                </div>
                              </div>
                            </ng-container>
                            <ng-template #freeInput>
                              <input class="rt-field" [type]="inputType(x)" [attr.inputmode]="inputMode(x)" [formControl]="resultValueControl(r,x)" [placeholder]="inputPlaceholder(x)" autocomplete="off">
                            </ng-template>
                          </ng-template>
                        </div>
                      </div>
                      <span class="flag-pill flag-arrow" [class.low]="flagText(x)==='LOW'" [class.high]="flagText(x)==='HIGH'" [class.critical]="truthy(x.is_critical)" [title]="flagTitle(x)">{{flagIcon(x)}}</span>
                      <button class="icon-mini" type="button" title="View result history" (click)="openHistory(r,x)" [disabled]="busy()">↺</button>
                    </div>
                    <label class="small-field">Unit<input [formControl]="itemFieldControl(r,x,'unit')" placeholder="Unit"></label>
                    <label class="small-field">Range<input [formControl]="itemFieldControl(r,x,'normal_range')" placeholder="Reference"></label>
                    <label class="small-field">Remarks<input [formControl]="itemFieldControl(r,x,'recheck_remarks')" placeholder="Recheck / test remarks"></label>

                    <div class="outsource-panel" *ngIf="isOutsourceItem(x)">
                      <div class="panel-title">Outsource result</div>
                      <label>Vendor result method<select [formControl]="itemFieldControl(r,x,'vendor_result_method','vendorMethod')"><option value="ENTER_VALUES">Enter result values</option><option value="ATTACH_REPORT_ONLY">Attach vendor report only</option></select></label>
                      <label *ngIf="x.vendor_result_method==='ATTACH_REPORT_ONLY'">Vendor report ref<input [formControl]="itemFieldControl(r,x,'vendor_report_file','vendorReport')" placeholder="PDF / file reference"></label>
                      <label>Outsource value<input [type]="inputType(x)" [formControl]="itemFieldControl(r,x,'outsource_result_value','outsource')" placeholder="External lab value"></label>
                      <label *ngIf="truthy(x.internal_check_required)">Internal check<input [type]="inputType(x)" [formControl]="itemFieldControl(r,x,'internal_check_value','internalCheck')" placeholder="Local check value"></label>
                      <label>Final source<select [formControl]="itemFieldControl(r,x,'final_result_source','finalSource')"><option value="OUTSOURCE">Outsource</option><option *ngIf="truthy(x.internal_check_required)" value="INTERNAL_CHECK">Internal check</option><option value="MANUAL">Manual</option></select></label>
                      <label class="wide">Remarks<input [formControl]="itemFieldControl(r,x,'internal_check_remarks')" placeholder="Internal check / outsource remarks"></label>
                      <span class="notice-inline" *ngIf="outsourceMismatch(x)">Mismatch: outsource and internal check values differ.</span>
                    </div>
                  </div>
                </div>

                <div class="button-row">
                  <button class="btn ghost" *ngIf="!quickReporting" type="button" (click)="saveResultDraft()" [disabled]="busy() || !r.selectedCount">Save Draft</button>
                  <button class="btn primary" *ngIf="!quickReporting" type="button" (click)="submitForApproval()" [disabled]="busy() || !r.selectedCount">Submit for Approval</button>
                  <button class="btn primary" *ngIf="quickReporting" type="button" (click)="quickFinishSelected()" [disabled]="busy() || !r.selectedCount">Save Finished Report</button>
                </div>
              </ng-container>

              <ng-container *ngSwitchCase="'APPROVE'">
                <div class="summary-grid"><div><span>Completed</span><b>{{r.completionPercent}}%</b></div><div><span>Critical</span><b>{{r.criticalList.length}}</b></div><div><span>Abnormal</span><b>{{r.abnormalList.length}}</b></div></div>
                <div class="department-card" *ngFor="let section of r.safeSections; trackBy: trackSection">
                  <div class="department-head"><h4>{{section.name}}</h4></div>
                  <table class="review-table"><tbody><tr *ngFor="let x of section.items; trackBy: trackItem"><td><b>{{x.test_name}}</b><small>{{x.department_name || section.name}}</small><small class="sample-id-line" *ngIf="sampleIdLabel(x)">Sample: {{sampleIdLabel(x)}}</small></td><td>{{x.result_value || '-'}}</td><td>{{x.unit || '-'}}</td><td>{{x.normal_range || '-'}}</td><td><span class="flag-pill flag-arrow" [class.low]="flagText(x)==='LOW'" [class.high]="flagText(x)==='HIGH'" [class.critical]="truthy(x.is_critical)" [title]="flagTitle(x)">{{flagIcon(x)}}</span></td></tr></tbody></table>
                </div>
                <div class="meta-row"><label>Approved by<input [formControl]="fieldControl(r,'approved_by')" placeholder="Approved by"></label><label>Approval remarks<input [formControl]="fieldControl(r,'remarks')" placeholder="Optional remarks"></label></div>
                <div class="button-row">
                  <button class="btn ghost" type="button" (click)="editResults()" [disabled]="busy()">Edit Results</button>
                  <button class="btn secondary" type="button" (click)="viewReportPdf(r)" [disabled]="busy()">View PDF</button>
                  <button class="btn primary" type="button" (click)="verifyApproveReport()" [disabled]="busy()">Verify & Approve</button>
                </div>
              </ng-container>

              <ng-container *ngSwitchDefault>
                <div class="summary-grid"><div><span>Status</span><b>Approved</b></div><div><span>Items</span><b>{{reportableItems(r).length}}</b></div><div><span>Completion</span><b>{{r.completionPercent}}%</b></div></div>
                <div class="delivery-line">{{deliverySummary(r)}}</div>
                <div class="notice warning" *ngIf="pendingWarningText(r)">{{pendingWarningText(r)}}</div>
                <div class="export-row">
                  <ng-container *ngIf="quickReporting; else normalFinishedWorkspaceActions">
                    <button class="btn secondary" type="button" (click)="quickPrint(r.id, true)" [disabled]="busy()">Print with BG</button>
                    <button class="btn ghost" type="button" (click)="quickPrint(r.id, false)" [disabled]="busy()">Print without BG</button>
                    <button class="btn ghost" type="button" (click)="quickExport(r.id, true)" [disabled]="busy()">Export with BG</button>
                    <button class="btn ghost" type="button" (click)="quickExport(r.id, false)" [disabled]="busy()">Export without BG</button>
                    <button class="btn ghost" type="button" (click)="editResults()" [disabled]="busy()">Edit</button>
                    <button class="btn danger-soft" type="button" (click)="quickDeleteFinished(r.id)" [disabled]="busy()">Delete</button>
                  </ng-container>
                  <ng-template #normalFinishedWorkspaceActions>
                    <button class="btn secondary" type="button" (click)="startApprovedAction(r.id, 'VIEW')" [disabled]="busy()">View PDF</button>
                    <button class="btn ghost" type="button" (click)="startApprovedAction(r.id, 'PDF')" [disabled]="busy()">PDF Export</button>
                    <button class="btn ghost" type="button" (click)="startApprovedAction(r.id, 'PRINT')" [disabled]="busy()">Print</button>
                    <button class="btn ghost" type="button" (click)="startApprovedAction(r.id, 'EMAIL')" [disabled]="busy()">Email</button>
                    <button class="btn ghost" type="button" (click)="startApprovedAction(r.id, 'WHATSAPP')" [disabled]="busy()">WhatsApp</button>
                    <button class="btn ghost" type="button" (click)="startApprovedAction(r.id, 'SMS')" [disabled]="busy()">SMS</button>
                    <button class="btn danger-soft" type="button" (click)="openCorrectionModal(r)" [disabled]="busy()">Reject / Reopen</button>
                  </ng-template>
                </div>
              </ng-container>
            </ng-container>
          </div>
        </div>
      </ng-template>

      <div class="modal-backdrop" *ngIf="historyState() as h" (click)="historyState.set(null)">
        <div class="history-modal" (click)="$event.stopPropagation()">
          <div class="section-title"><div><h3>{{h.item?.test_name}} history</h3><p>Previous patient values for this test</p></div><button class="icon" type="button" (click)="historyState.set(null)">✕</button></div>
          <div *ngIf="h.loading" class="empty">Loading history...</div>
          <div *ngIf="h.error" class="notice danger">{{h.error}}</div>
          <table class="review-table" *ngIf="!h.loading && h.rows.length"><tbody><tr *ngFor="let row of h.rows"><td><b>{{row.bill_no || '-'}}</b><small>{{dateOnly(row.bill_date || row.created_at)}}</small></td><td>{{row.result_value || '-'}}</td><td>{{row.unit || '-'}}</td><td><span class="flag-pill flag-arrow" [title]="flagStatusTitle(row.flag_status, row.is_critical)">{{flagStatusIcon(row.flag_status, row.is_critical)}}</span></td></tr></tbody></table>
          <div *ngIf="!h.loading && !h.rows.length" class="empty">No previous result history found.</div>
        </div>
      </div>

      <div class="modal-backdrop quick-barcode-backdrop" *ngIf="quickBarcodeState() as qb" (click)="quickBarcodeState.set(null)">
        <div class="history-modal quick-barcode-modal collection-look-modal" (click)="$event.stopPropagation()">
          <div class="section-title form-head"><div><h3>{{qb.mode==='GENERATE' ? 'Generate Barcode' : 'Reset Barcode'}}</h3><p>{{qb.row?.bill_no}} · {{qb.row?.patient_name}}</p></div><button class="icon" type="button" (click)="quickBarcodeState.set(null)">✕</button></div>

          <div class="flow-status quick-flow-status"><b>{{qb.mode==='GENERATE' ? 'Quick collection barcode' : 'Reset barcode collection'}}</b><span>{{qb.mode==='GENERATE' ? 'Select active pending tests. Choose one specimen for each multi-specimen item. Different pre-configured collection groups are blocked.' : 'Select one generated collection, or reset all collections explicitly.'}}</span></div>
          <div class="inline-error quick-inline-error" *ngIf="qb.loading">Loading barcode details... If this stays here, backend did not return, but the modal is still alive.</div>
          <div class="inline-error quick-inline-error" *ngIf="!qb.loading && (qb.error || qb.validationMessage)">{{qb.error || qb.validationMessage}}</div>

          <ng-container *ngIf="qb.mode==='GENERATE'">
            <div class="quick-stepper-strip">
              <button type="button" [class.active]="(qb.step || 1)===1" (click)="setQuickBarcodeStep(1)">1 Selection</button>
              <button type="button" [class.active]="(qb.step || 1)===2" (click)="setQuickBarcodeStep(2)" [disabled]="!!qb.selectionValidationMessage">2 Specimen</button>
              <button type="button" [class.active]="(qb.step || 1)===3" (click)="setQuickBarcodeStep(3)" [disabled]="!!qb.selectionValidationMessage || !!qb.specimenValidationMessage">3 Collection & Generate</button>
            </div>

            <ng-container *ngIf="(qb.step || 1)===1">
              <div class="profile-collect-card quick-tests-card quick-normal-card">
                <div class="profile-head quick-profile-head">
                  <div class="profile-title"><span class="profile-icon">☑</span><div><b>Select active items</b><small>{{qb.selectedCount || 0}} / {{qb.pendingCount || 0}} pending selected</small></div></div>
                  <div class="quick-master-actions">
                    <label class="plain-check"><input type="checkbox" [checked]="!!qb.pendingCount && qb.selectedCount===qb.pendingCount" [indeterminate]="(qb.selectedCount || 0) > 0 && (qb.selectedCount || 0) < (qb.pendingCount || 0)" (change)="toggleQuickBarcodeAllItems($any($event.target).checked)"><span>Select all pending</span></label>
                    <button class="mini-action" type="button" (click)="toggleQuickBarcodeAllItems(true)" [disabled]="!qb.pendingCount">Select all</button>
                    <button class="mini-action ghost" type="button" (click)="toggleQuickBarcodeAllItems(false)" [disabled]="!qb.selectedCount">Deselect all</button>
                  </div>
                </div>
                <div class="profile-table quick-profile-table quick-group-table quick-selection-table">
                  <div class="profile-table-head quick-table-head"><span></span><span>Profile / Group / Test</span><span>Collection type</span><span>Status</span></div>
                  <ng-container *ngFor="let group of (qb.itemGroups || []); let gi=index; trackBy: trackQuickBarcodeGroup">
                    <div class="quick-group-row" [class.not-selected]="!group.anySelected">
                      <label class="row-test-check quick-group-check">
                        <input type="checkbox" [checked]="group.allSelected" [indeterminate]="group.someSelected" [disabled]="!group.pendingCount" (change)="toggleQuickBarcodeGroup(group, $any($event.target).checked)">
                        <span class="profile-row-index">{{gi+1}}</span>
                      </label>
                      <div class="test-name-cell quick-group-title-cell">
                        <b>{{group.name}}</b>
                        <small>{{group.selectedCount}} / {{group.pendingCount}} pending selected · {{group.items.length}} item{{group.items.length===1 ? '' : 's'}}</small>
                        <button class="mini-action ghost quick-only-group" type="button" (click)="quickBarcodeSelectOnlyGroup(group)" [disabled]="!group.pendingCount">Only this group</button>
                      </div>
                      <div class="quick-chip-line"><span>{{group.collectionSummary}}</span></div>
                      <span class="status-pill" [class.approved]="group.generatedCount===group.items.length" [class.warning]="group.blocked">{{group.status}}</span>
                    </div>
                    <div class="profile-test-row quick-test-row quick-child-row" *ngFor="let item of group.items; let i=index; trackBy: trackQuickBarcodeItem" [class.not-selected]="!item._quickSelected" [class.generated-row]="item._quickGenerated">
                      <label class="row-test-check"><input type="checkbox" [checked]="item._quickSelected" [disabled]="item._quickGenerated" (change)="toggleQuickBarcodeItem(item, $any($event.target).checked)"><span class="profile-row-index">{{i+1}}</span></label>
                      <div class="test-name-cell"><b>{{item.test_name}}</b><small>{{quickBarcodeItemParentName(item)}}</small></div>
                      <div class="quick-chip-line"><span>{{item.collection_type || 'Random'}}</span><span>{{item.collect_timing || 'NOW'}}</span></div>
                      <span class="status-pill" [class.approved]="item._quickGenerated" [class.warning]="item._quickBlocked">{{item._quickGenerated ? 'Generated' : (item._quickSelected ? 'Selected' : 'Not selected')}}</span>
                    </div>
                  </ng-container>
                </div>
                <div class="button-row quick-action-row">
                  <button class="btn ghost" type="button" (click)="quickBarcodeState.set(null)">Cancel</button>
                  <button class="btn primary" type="button" (click)="setQuickBarcodeStep(2)" [disabled]="busy() || qb.loading || !!qb.selectionValidationMessage">Next: Specimen</button>
                </div>
              </div>
            </ng-container>

            <ng-container *ngIf="(qb.step || 1)===2">
              <div class="profile-collect-card quick-tests-card quick-normal-card">
                <div class="profile-head quick-profile-head">
                  <div class="profile-title"><span class="profile-icon">🧪</span><div><b>Choose specimen</b><small>Only selected pending items are shown. Different specimens are allowed.</small></div></div>
                </div>
                <div class="profile-table quick-profile-table quick-group-table quick-specimen-table">
                  <div class="profile-table-head quick-table-head"><span>Profile / Group</span><span>Test</span><span>Specimen</span><span>Status</span></div>
                  <ng-container *ngFor="let group of (qb.selectedItemGroups || []); trackBy: trackQuickBarcodeGroup">
                    <div class="quick-group-row quick-step-group-row">
                      <div class="test-name-cell quick-group-title-cell"><b>{{group.name}}</b><small>{{group.selectedCount}} selected item{{group.selectedCount===1 ? '' : 's'}}</small></div>
                      <div></div><div></div><span class="status-pill" [class.warning]="group.blocked">{{group.blocked ? 'Needs specimen' : 'Ready'}}</span>
                    </div>
                    <div class="profile-test-row quick-test-row quick-child-row" *ngFor="let item of group.items; trackBy: trackQuickBarcodeItem">
                      <div class="test-name-cell"><small>{{quickBarcodeItemParentName(item)}}</small></div>
                      <div class="test-name-cell"><b>{{item.test_name}}</b></div>
                      <div class="quick-specimen-cell">
                        <ng-container *ngIf="(item._quickSpecimens || []).length > 1; else singleQuickSpecimenStep">
                          <select class="quick-specimen-select" [formControl]="quickSpecimenControl(item)">
                            <option [ngValue]="0">Select specimen</option>
                            <option *ngFor="let s of (item._quickSpecimens || [])" [ngValue]="quickSpecimenOptionValue(s)">{{s.name}}</option>
                          </select>
                        </ng-container>
                        <ng-template #singleQuickSpecimenStep>
                          <div class="quick-chip-line"><span>{{(item._quickSpecimens && item._quickSpecimens[0] && item._quickSpecimens[0].name) || '-'}}</span></div>
                        </ng-template>
                      </div>
                      <span class="status-pill" [class.warning]="item._quickBlocked">{{item._quickStatus}}</span>
                    </div>
                  </ng-container>
                </div>
                <div class="button-row quick-action-row">
                  <button class="btn ghost" type="button" (click)="setQuickBarcodeStep(1)">Back</button>
                  <button class="btn primary" type="button" (click)="setQuickBarcodeStep(3)" [disabled]="busy() || qb.loading || !!qb.specimenValidationMessage">Next: Collection event</button>
                </div>
              </div>
            </ng-container>

            <ng-container *ngIf="(qb.step || 1)===3">
              <div class="collection-defaults-card quick-defaults-card">
                <div class="quick-event-head"><b>Collection event & generate</b><small>Same specimen + collection type + same date/time shares one sample ID. Different time creates a different sample ID.</small></div>
                <div class="defaults-grid quick-defaults-grid">
                  <label>Default collection date<input type="date" [formControl]="quickFieldControl(qb,'collectionDate','dateTime')"></label>
                  <label>Default collection time<input type="time" [formControl]="quickFieldControl(qb,'collectionTime','dateTime')"></label>
                  <label>Collection type<select [formControl]="quickFieldControl(qb,'collectionType','collectionType')"><option>Random</option><option>Fasting</option><option>Post-prandial</option><option>Timed</option><option>Other</option></select></label>
                  <label *ngIf="qb.collectionType==='Other'">Manual type<input [formControl]="quickFieldControl(qb,'manualCollectionType')" placeholder="Example: 2 Hour PP"></label>
                </div>
                <div class="quick-event-editor">
                  <div class="quick-event-row" *ngFor="let ev of (qb.collectionEventItems || []); trackBy: trackQuickBarcodeEventItem">
                    <div class="quick-event-test"><b>{{ev.test_name}}</b><small>{{ev.group_name}}</small></div>
                    <div class="quick-chip-line"><span>{{ev.specimen_name}}</span><span>{{ev.collection_type}}</span><span>{{ev.collect_timing}}</span></div>
                    <label>Date<input type="date" [formControl]="quickEventControl(ev,'collection_date')"></label>
                    <label>Time<input type="time" [formControl]="quickEventControl(ev,'collection_time')"></label>
                  </div>
                </div>
                <div class="button-row quick-action-row">
                  <button class="btn ghost" type="button" (click)="setQuickBarcodeStep(2)">Back</button>
                  <button class="btn primary" type="button" (click)="confirmQuickBarcodeGenerate()" [disabled]="busy() || qb.loading || !!qb.validationMessage">Generate Barcode</button>
                </div>
              </div>
            </ng-container>
          </ng-container>

          <ng-container *ngIf="qb.mode==='RESET'">
            <div class="quick-pick-grid collection-pick-grid">
              <button type="button" class="quick-pick-card collection-pick-card" *ngFor="let c of qb.state?.generated_collections || []" [class.active]="qb.selectedCollectionKey===c.key" (click)="qb.selectedCollectionKey=c.key">
                <b>{{c.specimen_name}} · {{c.collection_type || 'Collection'}}</b><small>{{c.collection_datetime || ((c.collection_date || '') + ' ' + (c.collection_time || ''))}}</small><small>Sample: {{c.sample_id || '-'}} · {{quickCollectionTests(c)}}</small>
              </button>
            </div>
            <div class="button-row quick-action-row"><button class="btn ghost" type="button" (click)="quickBarcodeState.set(null)">Cancel</button><button class="btn danger-soft" type="button" (click)="confirmQuickBarcodeReset(false)" [disabled]="busy()">Reset Selected Collection</button><button class="btn danger-soft" type="button" (click)="confirmQuickBarcodeReset(true)" [disabled]="busy()">Reset All Collections</button></div>
          </ng-container>
        </div>
      </div>

      <div class="modal-backdrop pdf-backdrop" *ngIf="pdfPreview() as p" (click)="pdfPreview.set(null)">
        <div class="pdf-modal" (click)="$event.stopPropagation()">
          <div class="pdf-head"><div><h3>{{p.title}}</h3><p>Read-only PDF preview. Print/download controls are hidden here.</p></div><button class="icon pdf-close" type="button" (click)="pdfPreview.set(null)">✕</button></div>
          <div class="pdf-viewer-mask"><iframe class="pdf-frame" [src]="p.url"></iframe></div>
        </div>
      </div>

      <div class="modal-backdrop" *ngIf="reopenState() as c" (click)="reopenState.set(null)">
        <div class="history-modal" (click)="$event.stopPropagation()">
          <div class="section-title"><div><h3>Reopen approved report?</h3><p>{{c.report.bill_no}} · {{c.report.patient_name}}</p></div><button class="icon" type="button" (click)="reopenState.set(null)">✕</button></div>
          <div class="notice warning">Approved reports cannot be edited directly. Start a correction flow with a reason.</div>
          <label class="reason-field">Correction reason *<textarea [formControl]="fieldControl(c,'reason')" placeholder="Enter correction reason" data-report-autofocus="reopen"></textarea></label>
          <div class="notice danger" *ngIf="c.error">{{c.error}}</div>
          <div class="button-row"><button class="btn ghost" type="button" (click)="reopenState.set(null)">Cancel</button><button class="btn primary" type="button" (click)="confirmReopenCorrection()" [disabled]="busy()">Reopen for correction</button></div>
        </div>
      </div>

      <div class="modal-backdrop" *ngIf="rejectState() as rej" (click)="rejectState.set(null)">
        <div class="history-modal" (click)="$event.stopPropagation()">
          <div class="section-title"><div><h3>Reject waiting approval?</h3><p>{{rej.report.bill_no}} · {{rej.report.patient_name}}</p></div><button class="icon" type="button" (click)="rejectState.set(null)">✕</button></div>
          <div class="notice warning">This sends the waiting-approval result items back to Pending Results so they can be corrected and submitted again.</div>
          <div class="reject-options">
            <label><input type="radio" value="ENTRY" [formControl]="fieldControl(rej,'mode')"><span>Back to result entry</span></label>
            <label><input type="radio" value="RECOLLECTION" [formControl]="fieldControl(rej,'mode')"><span>Request recollection</span></label>
          </div>
          <label class="reason-field">Reject reason *<textarea [formControl]="fieldControl(rej,'reason')" placeholder="Enter reject reason" data-report-autofocus="reject"></textarea></label>
          <div class="notice danger" *ngIf="rej.error">{{rej.error}}</div>
          <div class="button-row"><button class="btn ghost" type="button" (click)="rejectState.set(null)">Cancel</button><button class="btn danger-soft" type="button" (click)="confirmRejectReport()" [disabled]="busy()">Reject</button></div>
        </div>
      </div>


      <div class="modal-backdrop" *ngIf="recheckRequestState() as rc" (click)="recheckRequestState.set(null)">
        <div class="history-modal" (click)="$event.stopPropagation()">
          <div class="section-title"><div><h3>Recheck selected tests</h3><p>{{rc.report.bill_no}} · {{rc.items.length}} selected test(s)</p></div><button class="icon" type="button" (click)="recheckRequestState.set(null)">✕</button></div>
          <div class="mini-list"><span *ngFor="let item of rc.items"><b>{{item.test_name}}</b><small>{{item.recheck_remarks || 'No row remarks'}}</small></span></div>
          <div class="reject-options">
            <label><input type="radio" value="INHOUSE" [formControl]="fieldControl(rc,'mode')"><span>In-house</span></label>
            <label><input type="radio" value="OUTSOURCE" [formControl]="fieldControl(rc,'mode')"><span>Outsource</span></label>
            <label><input type="radio" value="BOTH" [formControl]="fieldControl(rc,'mode')"><span>Outsource + internal check</span></label>
          </div>
          <label class="reason-field" *ngIf="rc.mode==='OUTSOURCE' || rc.mode==='BOTH'">Vendor *<select [formControl]="fieldControl(rc,'vendor_id')"><option [ngValue]="0">Select vendor</option><option *ngFor="let v of outsourceVendors" [ngValue]="+v.id">{{v.name}}</option></select></label>
          <label class="reason-field">Common recheck remarks *<textarea [formControl]="fieldControl(rc,'reason')" placeholder="Enter recheck reason / remarks"></textarea></label>
          <div class="notice warning" *ngIf="rc.mode==='OUTSOURCE' || rc.mode==='BOTH'">Outsource recheck result entry will stay locked until Collection dispatch is completed and vendor result is received.</div>
          <div class="notice danger" *ngIf="rc.error">{{rc.error}}</div>
          <div class="button-row"><button class="btn ghost" type="button" (click)="recheckRequestState.set(null)">Cancel</button><button class="btn primary" type="button" (click)="confirmBulkRecheck()" [disabled]="busy()">Save Recheck</button></div>
        </div>
      </div>


      <div #outputModalBackdrop class="modal-backdrop output-modal-backdrop" *ngIf="approvedActionState() as a" (click)="approvedActionState.set(null)" (wheel)="$event.stopPropagation()" (touchmove)="$event.stopPropagation()">
        <div class="history-modal approved-action-modal rich-output-modal" (click)="$event.stopPropagation()">
          <header class="output-modal-header">
            <div class="output-modal-heading">
              <span class="output-modal-icon">{{a.action==='PRINT' ? '⎙' : '⇩'}}</span>
              <div><h3>{{a.action==='PRINT' ? 'Print reports' : a.action==='PDF' ? 'Export reports' : 'Report output'}}</h3><p>{{reportQueueView==='BILL' ? 'Bill-wise output settings' : 'Report-wise output settings'}} · configure the final document</p></div>
            </div>
            <button class="output-modal-close" type="button" (click)="approvedActionState.set(null)" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>
          </header>
          <div class="output-modal-meta"><div><span>Bill</span><b>{{a.reports[0]?.bill_no || '-'}}</b></div><div><span>Selected</span><b>{{approvedSelectedCount(a)}} / {{a.reports.length}} reports</b></div><div><span>Output</span><b>{{a.mergeMode==='MERGE' ? 'Merged document' : 'Separate reports'}}</b></div></div>
          <div class="output-modal-body output-designer-grid">
            <section class="output-column reports-column">
              <div class="output-column-head"><div><h4>Reports to include</h4><p>Select reports and arrange their merge order.</p></div><span class="selected-count-pill">{{approvedSelectedCount(a)}} selected</span></div>
              <div class="notice warning" *ngIf="a.pending.length">Some tests/profiles are still pending. Only finished reports are included.</div>
              <div class="report-select-list ordered-report-list compact-report-list">
                <label class="report-select-row" *ngFor="let rpt of a.reports; let i=index">
                  <input type="checkbox" [formControl]="approvedReportControl(rpt)"><span class="order-badge">{{i+1}}</span>
                  <span class="report-row-copy"><b>{{rpt.report_no || ('Report #' + rpt.id)}}</b><small>{{rpt.specimen_label || rpt.collection_label || rpt.bill_no}} · {{rpt.item_count || rpt.approved_count || 0}} item(s)</small></span>
                  <span class="order-buttons"><button type="button" (click)="$event.preventDefault(); moveApprovedReport(a,i,-1)" [disabled]="i===0" aria-label="Move report up">↑</button><button type="button" (click)="$event.preventDefault(); moveApprovedReport(a,i,1)" [disabled]="i===a.reports.length-1" aria-label="Move report down">↓</button></span>
                </label>
              </div>
              <div class="reorder-hint"><span>↕</span><div><b>Report order</b><small>The selected reports will be generated in this visible order.</small></div></div>
            </section>
            <section class="output-column settings-column">
              <div class="output-column-head"><div><h4>Output settings</h4><p>Choose how the final document should be prepared.</p></div></div>
              <div class="compact-setting-block" *ngIf="approvedSelectedCount(a)>1"><div class="setting-title"><b>Merge or separate</b></div><div class="choice-card-grid compact-choice-grid"><label [class.active]="a.mergeMode==='MERGE'"><input type="radio" value="MERGE" [formControl]="fieldControl(a,'mergeMode')"><span><b>Merge into one document</b></span></label><label [class.active]="a.mergeMode==='SEPARATE'"><input type="radio" value="SEPARATE" [formControl]="fieldControl(a,'mergeMode')"><span><b>Keep reports separate</b></span></label></div></div>
              <div class="compact-setting-block"><div class="setting-title"><b>Document appearance</b><small>Header is always included.</small></div><div class="choice-card-grid compact-choice-grid"><label [class.active]="a.withBackground"><input type="radio" name="documentAppearance" [value]="true" [formControl]="fieldControl(a,'withBackground')"><span><b>With background</b></span></label><label [class.active]="!a.withBackground"><input type="radio" name="documentAppearance" [value]="false" [formControl]="fieldControl(a,'withBackground')"><span><b>Without background</b></span></label></div></div>
              <div class="compact-setting-block"><div class="setting-title"><b>Single tests position</b><small>Applied inside each category.</small></div><div class="choice-card-grid compact-choice-grid"><label [class.active]="a.singleTestPlacement==='TOP'"><input type="radio" name="singleTestPlacement" value="TOP" [formControl]="fieldControl(a,'singleTestPlacement')"><span><b>At the beginning</b></span></label><label [class.active]="a.singleTestPlacement==='DEPARTMENT'"><input type="radio" name="singleTestPlacement" value="DEPARTMENT" [formControl]="fieldControl(a,'singleTestPlacement')"><span><b>At the end</b></span></label></div></div>
              <div class="compact-setting-block" *ngIf="a.signatures.length"><div class="setting-title"><b>Uploaded signatures</b><small>Selected by default.</small></div><div class="signature-choice-list compact-signature-list"><label *ngFor="let sign of a.signatures"><input type="checkbox" [formControl]="approvedSignatureControl(sign)"><span class="signature-row-copy"><b>{{sign.label}}</b></span><em>{{sign.hasImage ? 'Uploaded' : 'Configured'}}</em></label></div></div>
              <div class="notice danger" *ngIf="a.error">{{a.error}}</div>
            </section>
            <aside class="output-column preview-column"><div class="preview-card"><div class="preview-document-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v5h5M10 12h5M10 16h5"></path></svg></div><h4>Preview summary</h4><div class="preview-summary-row"><span>Reports</span><b>{{approvedSelectedCount(a)}} selected</b></div><div class="preview-summary-row"><span>Output</span><b>{{a.mergeMode==='MERGE' ? 'Merged document' : 'Separate reports'}}</b></div><div class="preview-summary-row"><span>Background</span><b>{{a.withBackground ? 'Enabled' : 'Plain'}}</b></div><div class="preview-summary-row"><span>Single tests</span><b>{{a.singleTestPlacement==='TOP' ? 'At beginning' : 'At end'}}</b></div><div class="preview-summary-row" *ngIf="a.signatures.length"><span>Signatures</span><b>{{a.signatures.length}} available</b></div></div></aside>
          </div>
          <footer class="output-modal-footer"><div class="output-footer-summary"><b>{{approvedSelectedCount(a)}} report{{approvedSelectedCount(a)===1 ? '' : 's'}} selected</b><small>{{a.mergeMode==='MERGE' ? 'Will be merged into one document' : 'Will be generated separately'}}</small></div><div class="output-footer-actions"><button class="btn ghost" type="button" (click)="approvedActionState.set(null)">Cancel</button><button class="btn primary output-primary-action" type="button" (click)="confirmApprovedAction()" [disabled]="busy() || approvedSelectedCount(a)===0">{{a.action==='PRINT' ? 'Print selected reports' : 'Export selected reports'}}</button></div></footer>
        </div>
      </div>

      <div class="modal-backdrop confirm-backdrop" *ngIf="resetConfirm() as d" (click)="finishResetConfirm(false)">
        <div class="confirm-card" (click)="$event.stopPropagation()">
          <div class="confirm-top">
            <div class="confirm-icon danger">!</div>
            <button class="icon confirm-x" type="button" (click)="finishResetConfirm(false)">✕</button>
          </div>
          <h3>{{d.title}}</h3>
          <p>{{d.message}}</p>
          <div class="confirm-details">{{d.details}}</div>
          <div class="confirm-actions">
            <button class="btn ghost" type="button" (click)="finishResetConfirm(false)">{{d.cancelText}}</button>
            <button class="btn danger-solid" type="button" (click)="finishResetConfirm(true)">{{d.confirmText}}</button>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host{display:block;height:100%;}
    :host ::ng-deep .lims-action-mat-menu .mat-mdc-menu-content{padding:6px!important;background:var(--panel)!important;border:1px solid var(--border);border-radius:14px;box-shadow:0 22px 60px rgba(2,6,23,.62);min-width:230px;}
    :host ::ng-deep .lims-action-mat-menu .mat-mdc-menu-item{min-height:38px;color:var(--text)!important;font-weight:850;}
    :host ::ng-deep .lims-action-mat-menu .mat-mdc-menu-item span:first-child{width:24px;display:inline-block;text-align:center;color:var(--accent);margin-right:8px;}
    :host ::ng-deep .lims-action-mat-menu .mat-mdc-menu-item.danger-menu-item{color:#ef4444!important;}
    :host ::ng-deep .lims-action-mat-menu .mat-mdc-menu-item.danger-menu-item span:first-child{color:#ef4444!important;}
    :host ::ng-deep .cdk-overlay-pane{z-index:10000000!important;}

    .reporting-page{height:100%;display:flex;flex-direction:column;gap:14px;padding:0 4px 18px;color:var(--text)}
    .report-fixed-head{position:sticky;top:0;z-index:30;background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--bg) 84%,transparent));padding:0 0 10px;backdrop-filter:blur(12px)}
    .report-tabs{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-top:0;border:1px solid var(--border);border-radius:18px;background:var(--panel);padding:8px}
    .report-tabs button{height:42px;border:0;border-radius:13px;background:transparent;color:var(--muted);font-weight:850;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}
    .report-tabs button b{min-width:22px;height:22px;border-radius:999px;display:inline-grid;place-items:center;background:var(--row);font-size:11px;color:var(--text)}
    .report-tabs button.active{background:var(--accent-gradient);color:#fff;box-shadow:var(--glow)}
    .report-tabs button.active b{background:rgba(255,255,255,.22);color:#fff}
    .report-content{min-height:0;overflow:auto;padding:2px 0 22px}
    .master-card{border:1px solid var(--border);border-radius:22px;background:var(--panel);box-shadow:var(--shadow);padding:16px}
    .list-card{margin-top:0}
    .filter-row{display:grid;grid-template-columns:1fr 210px 210px;gap:10px;margin-bottom:12px}
    input,select{height:36px;width:100%;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text);padding:0 10px;font-size:13px;outline:none;color-scheme:dark}
    input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
    input[type="date"]{appearance:none;-webkit-appearance:none;color:#f8fafc!important;background-color:color-mix(in srgb,var(--input) 92%,var(--panel));background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23f8fafc' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 14px center;background-size:18px 18px;font-weight:850;letter-spacing:.01em;color-scheme:dark;padding-right:46px!important}
    input[type="date"]::-webkit-datetime-edit,input[type="date"]::-webkit-datetime-edit-fields-wrapper,input[type="date"]::-webkit-datetime-edit-text,input[type="date"]::-webkit-datetime-edit-month-field,input[type="date"]::-webkit-datetime-edit-day-field,input[type="date"]::-webkit-datetime-edit-year-field{color:#f8fafc!important}
    input[type="date"]::-webkit-calendar-picker-indicator{opacity:0!important;cursor:pointer;width:42px;height:100%;margin-right:-8px}
    :host-context(.light) input,:host-context(.light-mode) input{color-scheme:light}
    :host-context(.light) input[type="date"],:host-context(.light-mode) input[type="date"]{background-color:#fff;color:#0f172a!important;color-scheme:light;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")}
    :host-context(.light) input[type="date"]::-webkit-datetime-edit,:host-context(.light) input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light) input[type="date"]::-webkit-datetime-edit-text,:host-context(.light) input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light) input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light) input[type="date"]::-webkit-datetime-edit-year-field,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit-text,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light-mode) input[type="date"]::-webkit-datetime-edit-year-field{color:#0f172a!important}
    .master-table{width:100%;border-collapse:separate;border-spacing:0 8px}
    .master-table th{text-align:left;color:var(--muted);font-size:11px;text-transform:uppercase;padding:0 10px}
    .master-table td{background:var(--row);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:10px;font-size:13px;vertical-align:middle}
    .master-table td:first-child{border-left:1px solid var(--border);border-radius:14px 0 0 14px}
    .master-table td:last-child{border-right:1px solid var(--border);border-radius:0 14px 14px 0}
    .master-table small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.progress-cell{display:grid;gap:3px;align-items:center}.progress-cell small{margin-top:0;white-space:nowrap}
    .count-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 9px;background:var(--accent-soft);color:var(--accent);font-weight:900;font-size:12px}

    .report-queue-scroll{width:100%;overflow:visible;padding-bottom:0}
    .report-queue-table{width:100%;border-spacing:0 8px;table-layout:fixed}
    .report-queue-table .rq-select-col{width:42px}.report-queue-table .rq-bill-col{width:29%}.report-queue-table .rq-patient-col{width:31%}.report-queue-table .rq-date-col{width:20%}.report-queue-table .rq-action-col{width:86px}.report-queue-table .rq-expand-col{width:42px}
    .report-queue-table th{padding:0 8px}.report-queue-table th.select-col{padding:0;text-align:center!important}
    .report-queue-row td{height:58px;padding:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .report-queue-row td.pending-select-cell{padding:0;text-align:center;vertical-align:middle;overflow:visible}
    .queue-group-line{display:block;margin-top:3px;margin-left:38px;font-size:11px;font-weight:900;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
    .bill-status-cell{min-width:0}.bill-status-line{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap}.queue-status-icon{width:30px;height:30px;flex:0 0 30px;display:inline-grid;place-items:center;border-radius:999px;border:1px solid currentColor;font-weight:950;line-height:1;font-size:12px}.bill-status-line.pending{color:#fb6a55}.bill-status-line.complete{color:#57c774}.queue-status-count{font-weight:950;font-size:16px;letter-spacing:.01em;white-space:nowrap}.bill-no-inline{font-size:12px;color:var(--muted);font-weight:900;margin-left:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
    .patient-summary-cell b{display:block;font-size:13px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.patient-summary-cell small{font-size:11px;line-height:1.18;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.date-stack-cell{font-size:10px;color:var(--muted);line-height:1.28}.date-stack-cell div{display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.date-stack-cell b{font-size:9px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);min-width:50px}.date-stack-cell span{color:var(--text);font-weight:800;overflow:hidden;text-overflow:ellipsis}.action-cell{overflow:visible!important;text-overflow:clip!important}.compact-actions{display:flex;gap:6px;align-items:center;justify-content:flex-start;flex-wrap:nowrap;white-space:nowrap;min-width:0}.icon-action{width:30px;height:30px;min-width:30px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);display:inline-grid;place-items:center;font-size:12px;font-weight:950;cursor:pointer;padding:0}.icon-action.primary{background:var(--accent-gradient);color:#fff;border:0}.icon-action.secondary{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));color:var(--accent)}.icon-action.danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);color:#ef4444}.icon-action:disabled{opacity:.55;cursor:not-allowed}.approved-more-actions{position:relative;display:inline-flex;overflow:visible;z-index:20}.approved-more-actions summary{list-style:none}.approved-more-actions summary::-webkit-details-marker{display:none}.approved-more-actions:focus-within{z-index:1000002}.icon-action.more-dot{font-size:20px;line-height:1}.compact-actions .mat-mdc-menu-trigger{flex:0 0 30px}.quick-barcode-more{position:relative;z-index:2}.approved-action-menu{display:none;position:absolute;right:0;top:calc(100% + 8px);width:220px;border:1px solid var(--border);border-radius:14px;background:var(--panel);box-shadow:0 18px 45px rgba(2,6,23,.52);padding:6px;z-index:1000003}.approved-more-actions:focus-within .approved-action-menu,.approved-more-actions[open] .approved-action-menu{display:block}.approved-action-menu button{width:100%;min-height:34px;border:0;border-radius:10px;background:transparent;color:var(--text);display:flex;align-items:center;gap:9px;padding:0 10px;font-weight:850;cursor:pointer;text-align:left}.approved-action-menu button:hover{background:var(--input)}.approved-action-menu button span{width:24px;text-align:center;color:var(--accent);font-size:12px}.approved-action-menu button.danger{color:#ef4444}.approved-action-menu button.danger span{color:#ef4444}.approved-action-menu button:disabled{opacity:.55;cursor:not-allowed}.report-menu-backdrop{position:fixed;inset:0;z-index:1000000;background:transparent}.fixed-approved-menu{display:block!important;position:fixed!important;right:auto!important;width:250px;z-index:1000001;max-height:min(380px,calc(100vh - 24px));overflow:auto;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--accent) 55%,var(--border)) transparent}.fixed-approved-menu::-webkit-scrollbar{width:5px}.fixed-approved-menu::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--accent) 55%,var(--border));border-radius:999px}.action-cell{overflow:visible!important}.queue-table,.report-card,.queue-row{overflow:visible!important}.expand-cell{text-align:right;overflow:visible!important}.expand-head{width:44px}.queue-expand-btn{width:32px;height:32px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:18px;font-weight:950;border-radius:999px;cursor:pointer;display:inline-grid;place-items:center}.queue-expand-btn:hover{background:var(--row);border-color:color-mix(in srgb,var(--accent) 35%,var(--border))}
    .status-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:5px 9px;background:var(--accent-soft);color:var(--accent);font-weight:900;font-size:12px}
    .status-pill.typed{background:rgba(245,158,11,.16);color:#f59e0b}
    .status-pill.approved{background:rgba(34,197,94,.16);color:#16a34a}
    .flag-pill{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);background:var(--panel);border-radius:999px;padding:3px 8px;font-size:11px;font-weight:850}
    .flag-arrow{min-width:22px;width:22px;height:30px;padding:0;border:0;background:transparent;border-radius:0;font-size:18px;line-height:1;font-weight:950;letter-spacing:-1px;box-shadow:none}
    .flag-pill.low{color:#f59e0b}.flag-pill.high{color:#fb7185}.flag-pill.critical{color:#ef4444}.flag-pill.flag-arrow.low,.flag-pill.flag-arrow.high,.flag-pill.flag-arrow.critical{border:0;background:transparent}
    .btn{height:36px;border:1px solid var(--border);border-radius:12px;padding:0 14px;font-size:12px;font-weight:900;cursor:pointer;background:var(--input);color:var(--text)}.btn.primary{background:var(--accent-gradient);color:#fff;border:0}.btn.secondary{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));color:var(--accent)}.btn.ghost{background:transparent}.btn.small{height:30px;padding:0 10px;font-size:12px}.btn.tiny{height:26px;padding:0 8px;font-size:11px}.btn:disabled,.mini:disabled{opacity:.55;cursor:not-allowed}.empty{color:var(--muted);text-align:center;padding:22px}.workspace-wrap{padding-top:0}.workspace-card{max-width:1220px;margin:0 auto}.section-title,.form-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.section-title h3{margin:0;font-size:18px}.section-title p{margin:4px 0 0;color:var(--muted);font-size:12px}.flow-status,.notice{border:1px solid var(--border);border-radius:15px;background:var(--row);padding:10px 12px;margin-bottom:12px}.flow-status b{font-size:13px}.flow-status span{display:block;color:var(--muted);font-size:12px;margin-top:3px}.notice.warning{border-color:rgba(245,158,11,.35);background:rgba(245,158,11,.12)}.notice.danger{border-color:rgba(239,68,68,.35);background:rgba(239,68,68,.12)}.notice-inline{align-self:center;color:#f59e0b;font-size:12px;font-weight:800}.tool-row{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;color:var(--muted);font-size:13px}.plain-check{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:850;color:var(--text)}.plain-check input{width:auto}.meta-row{display:grid;grid-template-columns:180px 1fr;gap:10px;margin-bottom:12px}.meta-row label,.result-row label,.outsource-panel label{font-size:11px;color:var(--muted);display:grid;gap:5px}.department-card{border:1px solid var(--border);border-radius:17px;background:color-mix(in srgb,var(--panel) 86%,var(--row));padding:12px;margin-bottom:12px;overflow:visible;isolation:isolate}.department-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.profile-card{background:color-mix(in srgb,var(--panel) 92%,var(--accent));}.profile-head{cursor:grab;border-bottom:1px solid var(--border);padding-bottom:8px}.profile-title{display:flex;align-items:center;gap:8px}.profile-actions{display:flex;gap:6px}.profile-drag{font-size:18px;color:var(--accent)}.department-head h4{margin:0;font-size:14px}.department-head p{margin:2px 0 0;color:var(--muted);font-size:11px}.result-row{display:grid;grid-template-columns:28px 52px minmax(190px,1.05fr) minmax(250px,1.15fr) minmax(78px,.4fr) minmax(125px,.6fr) minmax(125px,.6fr);gap:8px;align-items:end;border-top:1px solid var(--border);padding:8px 0;position:relative;z-index:1}.result-row.result-picker-open{z-index:1000}.compact-group-check,.compact-test-check{display:inline-grid!important;place-items:center!important;width:24px;height:24px;min-width:24px;border-radius:8px;background:var(--input);border:1px solid var(--border);position:relative;cursor:pointer}.compact-group-check input,.compact-test-check input{position:absolute;opacity:0;inset:0;cursor:pointer}.compact-group-check span,.compact-test-check span{width:14px;height:14px;border-radius:5px;border:1px solid color-mix(in srgb,var(--muted) 70%,transparent);display:block}.compact-group-check input:checked + span,.compact-test-check input:checked + span{background:var(--accent-gradient);border-color:transparent;box-shadow:var(--glow)}.compact-group-check input:checked + span:after,.compact-test-check input:checked + span:after{content:'✓';display:block;text-align:center;line-height:14px;color:#fff;font-size:11px;font-weight:900}.compact-report-head .profile-title{align-items:center}.compact-report-head .profile-actions{align-items:center}.compact-result-row.off{opacity:.48}.compact-result-row.off .result-editor,.compact-result-row.off .small-field{pointer-events:none}.result-row.off{opacity:.6}.result-row.highlight{background:rgba(99,102,241,.07);margin-left:-8px;margin-right:-8px;padding-left:8px;padding-right:8px;border-radius:12px}.order-actions{display:flex;align-items:center;gap:4px}.drag{color:var(--muted);letter-spacing:-2px}.mini,.icon-mini{width:26px;height:26px;border:1px solid var(--border);border-radius:9px;background:var(--panel);color:var(--text);cursor:pointer;display:inline-grid;place-items:center;font-size:13px;font-weight:900}.icon-mini.calc{color:var(--accent);border-color:rgba(99,102,241,.38);background:rgba(99,102,241,.12)}.result-name b{font-size:13px}.result-name small,.review-table small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}.badges span{border:1px solid var(--border);background:var(--panel);border-radius:999px;padding:2px 6px;font-size:10px;color:var(--muted)}.result-editor{display:grid;grid-template-columns:30px minmax(150px,1fr) 24px 30px;gap:6px;align-items:end}.rt-result-label{position:relative;min-width:0;display:grid;gap:5px}.rt-label-text{font-size:11px;color:var(--muted)}.rt-control{position:relative;min-width:0}.rt-field{width:100%;height:38px;border:1px solid color-mix(in srgb,var(--border) 86%,var(--accent));border-radius:15px;background:color-mix(in srgb,var(--input) 94%,var(--panel));color:var(--text);padding:0 13px;font-size:14px;font-weight:850;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.04);transition:border-color .16s ease,box-shadow .16s ease,background .16s ease}.rt-field:focus,.rt-control.open .rt-field,.rt-control.open .rt-select-trigger{border-color:color-mix(in srgb,var(--accent) 70%,var(--border));box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 18%,transparent)}.rt-field:disabled,.rt-control.disabled .rt-field,.rt-control.disabled .rt-select-trigger{opacity:.64;cursor:not-allowed}.rt-select-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;text-align:left;cursor:pointer}.rt-select-trigger span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rt-select-trigger .placeholder{color:var(--muted);font-weight:750}.rt-select-trigger b{font-size:18px;line-height:1;color:var(--muted);font-weight:900}.rt-options-panel{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;max-height:210px;overflow:auto;border:1px solid color-mix(in srgb,var(--border) 82%,var(--accent));border-radius:15px;background:#111827;color:#f8fafc;box-shadow:0 18px 42px rgba(0,0,0,.48);padding:6px;opacity:1;isolation:isolate;contain:paint}.rt-option{width:100%;border:0;background:transparent;color:var(--text);text-align:left;border-radius:11px;min-height:34px;padding:7px 10px;font-size:13px;font-weight:850;cursor:pointer}.rt-option:hover,.rt-option.selected{background:color-mix(in srgb,var(--accent) 16%,var(--input));color:var(--text)}.rt-option.muted{color:var(--muted);font-weight:750}.rt-option-empty{padding:10px;color:var(--muted);font-size:12px;font-weight:800;text-align:center}.calc-slot{width:30px;height:30px;display:grid;place-items:end center;align-self:end}.result-input-label{min-width:0}.left-calc{align-self:end}.outsource-panel{grid-column:3/-1;display:grid;grid-template-columns:130px 130px 130px 1fr auto;gap:8px;align-items:end;border:1px dashed var(--border);border-radius:14px;padding:9px;background:var(--row)}.outsource-panel .panel-title{align-self:center;font-size:12px;font-weight:900;color:var(--accent)}.outsource-panel .wide{min-width:180px}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.summary-grid div{border:1px solid var(--border);border-radius:16px;background:var(--row);padding:12px}.summary-grid span{display:block;color:var(--muted);font-size:11px;text-transform:uppercase}.summary-grid b{display:block;margin-top:4px;font-size:18px}.review-table{width:100%;border-collapse:collapse}.review-table td{border-top:1px solid var(--border);padding:9px;font-size:13px}.button-row,.export-row{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:12px}.modal-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.58);display:grid;place-items:center;z-index:2147483000}.history-modal{width:min(720px,92vw);max-height:82vh;overflow:auto;border:1px solid var(--border);background:var(--panel);border-radius:20px;padding:16px;box-shadow:var(--shadow)}.approved-action-modal{width:min(860px,94vw)}.report-select-list{display:grid;gap:8px;margin:10px 0}.report-select-row{display:grid;grid-template-columns:26px 1fr auto;gap:10px;align-items:center;border:1px solid var(--border);background:var(--row);border-radius:14px;padding:10px}.report-select-row b{display:block}.report-select-row small{display:block;color:var(--muted);font-size:11px;margin-top:2px}.report-select-row em{font-style:normal;color:var(--accent);font-size:12px;font-weight:900}.report-options-row{grid-template-columns:1fr 1fr}

    .rt-native-option-select{display:block;width:100%;max-width:100%;min-width:0;appearance:auto;cursor:pointer;text-overflow:ellipsis;white-space:nowrap}.rt-native-option-select option{background:var(--panel);color:var(--text);font-weight:750}
    .rt-chevron{position:absolute;right:10px;top:50%;transform:translateY(-54%);color:var(--muted);font-size:18px;font-weight:900;pointer-events:none}.rt-picker .rt-field{padding-right:30px!important}
    .output-modal-backdrop{position:fixed!important;inset:0!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;z-index:2147483600!important;background:rgba(15,23,42,.74);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);overscroll-behavior:contain;padding:28px;box-sizing:border-box}.lims-shell.app:not(.side-collapsed) .output-modal-backdrop,.lims-shell.app.side-collapsed .output-modal-backdrop{left:0!important;right:0!important;width:100vw!important}.confirm-backdrop{z-index:2147483647;background:rgba(2,6,23,.68);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}
    .confirm-card{width:min(520px,92vw);border:1px solid color-mix(in srgb,#ef4444 30%,var(--border));background:var(--panel);color:var(--text);border-radius:24px;padding:18px;box-shadow:0 30px 100px rgba(0,0,0,.45);animation:confirmPop .14s ease-out}
    .confirm-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.confirm-icon{width:44px;height:44px;border-radius:16px;display:grid;place-items:center;font-weight:950;font-size:22px}.confirm-icon.danger{background:rgba(239,68,68,.14);color:#ef4444;border:1px solid rgba(239,68,68,.30)}.confirm-x{width:34px;height:34px;border-radius:12px}
    .confirm-card h3{margin:0 0 8px;font-size:20px;letter-spacing:-.02em}.confirm-card p{margin:0;color:var(--muted);font-size:14px;line-height:1.45}.confirm-details{margin-top:14px;border:1px solid var(--border);background:var(--row);border-radius:16px;padding:12px;color:var(--text);font-size:13px;line-height:1.45}.confirm-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.btn.danger-solid{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;border:0;box-shadow:0 14px 28px rgba(239,68,68,.20)}
    @keyframes confirmPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    :host-context(.light-mode) .confirm-card,:host-context(body.light-mode) .confirm-card,:host-context(body:not(.dark-theme)) .confirm-card{background:#ffffff!important;color:#0f172a!important;border-color:#fecaca!important;box-shadow:0 30px 80px rgba(15,23,42,.22)!important}.light-mode .confirm-details{}
    :host-context(.light-mode) .confirm-details,:host-context(body.light-mode) .confirm-details,:host-context(body:not(.dark-theme)) .confirm-details{background:#f8fafc!important;border-color:#e2e8f0!important;color:#0f172a!important}

    .head-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.btn.danger{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.35);color:#ef4444}.queue-actions{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}.pdf-backdrop{inset:0;padding:18px;align-items:stretch;justify-items:stretch}.pdf-modal{width:calc(100vw - 36px);height:calc(100vh - 36px);border:1px solid var(--border);background:var(--panel);border-radius:22px;padding:14px;box-shadow:0 28px 90px rgba(0,0,0,.38);display:flex;flex-direction:column;overflow:hidden}.pdf-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;flex:0 0 auto}.pdf-head h3{margin:0;font-size:18px}.pdf-head p{margin:4px 0 0;color:var(--muted);font-size:12px}.pdf-close{width:34px;height:34px;border-radius:10px}.pdf-viewer-mask{position:relative;flex:1;min-height:0;overflow:hidden;border:1px solid var(--border);border-radius:16px;background:#f8fafc}.pdf-frame{position:absolute;left:0;top:-58px;width:100%;height:calc(100% + 58px);border:0;background:white}.reason-field{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:800}.reason-field textarea{min-height:110px;border:1px solid var(--border);border-radius:12px;background:var(--input);color:var(--text);padding:10px;resize:vertical}.approved-note{color:var(--muted);font-size:12px;margin-top:8px}.delivery-line{border:1px solid var(--border);background:var(--row);border-radius:14px;padding:9px 12px;margin:-2px 0 12px;color:var(--muted);font-size:12px;font-weight:800}

    :host-context(.light-mode) .reporting-page,
    :host-context(body.light-mode) .reporting-page,
    :host-context(body:not(.dark-theme)) .reporting-page{color:#0f172a;}
    :host-context(.light-mode) .report-tabs,
    :host-context(.light-mode) .master-card,
    :host-context(.light-mode) .department-card,
    :host-context(body.light-mode) .report-tabs,
    :host-context(body.light-mode) .master-card,
    :host-context(body.light-mode) .department-card,
    :host-context(body:not(.dark-theme)) .report-tabs,
    :host-context(body:not(.dark-theme)) .master-card,
    :host-context(body:not(.dark-theme)) .department-card{background:#ffffff!important;border-color:#dbe3ef!important;box-shadow:0 10px 28px rgba(15,23,42,.07)!important;}
    :host-context(.light-mode) .profile-card,
    :host-context(body.light-mode) .profile-card,
    :host-context(body:not(.dark-theme)) .profile-card{background:#f8fbff!important;border-color:#cbd5e1!important;}
    :host-context(.light-mode) .result-row,
    :host-context(body.light-mode) .result-row,
    :host-context(body:not(.dark-theme)) .result-row{background:#f3f7ff!important;border-color:#dbe3ef!important;color:#0f172a!important;}
    :host-context(.light-mode) .result-row.highlight,
    :host-context(body.light-mode) .result-row.highlight,
    :host-context(body:not(.dark-theme)) .result-row.highlight{background:#eaf2ff!important;}
    :host-context(.light-mode) input,
    :host-context(.light-mode) select,
    :host-context(.light-mode) textarea,
    :host-context(body.light-mode) input,
    :host-context(body.light-mode) select,
    :host-context(body.light-mode) textarea,
    :host-context(body:not(.dark-theme)) input,
    :host-context(body:not(.dark-theme)) select,
    :host-context(body:not(.dark-theme)) textarea{background:#ffffff!important;color:#0f172a!important;border-color:#cbd5e1!important;color-scheme:light;}
    :host-context(.light-mode) input::placeholder,
    :host-context(body.light-mode) input::placeholder,
    :host-context(body:not(.dark-theme)) input::placeholder{color:#64748b!important;}
    :host-context(.light-mode) .master-table td,
    :host-context(body.light-mode) .master-table td,
    :host-context(body:not(.dark-theme)) .master-table td{background:#f8fbff!important;border-color:#dbe3ef!important;color:#0f172a!important;}
    :host-context(.light-mode) .flow-status,
    :host-context(.light-mode) .notice,
    :host-context(body.light-mode) .flow-status,
    :host-context(body.light-mode) .notice,
    :host-context(body:not(.dark-theme)) .flow-status,
    :host-context(body:not(.dark-theme)) .notice{background:#f8fafc!important;border-color:#dbe3ef!important;color:#0f172a!important;}
    :host-context(.light-mode) .flag-arrow,
    :host-context(body.light-mode) .flag-arrow,
    :host-context(body:not(.dark-theme)) .flag-arrow{background:transparent!important;}
    .queue-view-toggle{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 12px}.queue-view-toggle button{border:1px solid var(--border);border-radius:999px;background:var(--input);color:var(--text);font-weight:900;padding:8px 12px;cursor:pointer}.queue-view-toggle button.active{background:var(--accent-gradient);color:#fff;border-color:transparent}.queue-view-toggle span{font-size:12px;color:var(--muted);font-weight:800}.log-type-filter{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}.log-type-filter button{border:1px solid var(--border);border-radius:999px;background:var(--input);color:var(--text);font-weight:900;padding:8px 12px;cursor:pointer}.log-type-filter button.active{background:var(--accent-gradient);color:#fff;border-color:transparent}.reject-options{display:grid;gap:10px;margin:10px 0 14px}.reject-options label{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:var(--input);font-weight:850;display:flex;gap:10px;align-items:center}
    .queue-actions{display:flex;flex-wrap:nowrap;gap:6px}.queue-detail-row td{background:rgba(124,58,237,.06)!important;border-top:0!important}.queue-detail-panel{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:12px}.queue-detail-block{border:1px solid var(--border);border-radius:14px;background:var(--input);padding:12px}.queue-detail-block h4{margin:0 0 8px;font-size:13px}.mini-list{display:flex;flex-wrap:wrap;gap:8px}.mini-list span{border:1px solid var(--border);border-radius:12px;padding:6px 10px;background:var(--card);font-size:12px;font-weight:850;display:grid;gap:2px}.mini-list span b{font-size:12px}.mini-list span small,.sample-id-line{display:block;color:var(--muted);font-size:10px;font-weight:850;margin-top:2px}.mini-list.muted span{opacity:.78}.queue-detail-block p{margin:0;color:var(--muted);font-size:12px}

    /* Match Pending Results row status color with Collection pending loader. */
    .report-queue-row.report-pending-colors td{padding-top:12px!important;padding-bottom:12px!important}
    .report-queue-row.report-pending-colors .bill-status-line{gap:12px;color:#ff8468!important}
    .queue-progress-ring{--pct:0;width:58px!important;height:58px!important;min-width:58px!important;border-radius:50%!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;position:relative!important;background:conic-gradient(#ff8468 calc(var(--pct) * 1%), rgba(255,132,104,.16) 0)!important;border:0!important;color:#ff8468!important;box-shadow:0 0 0 1px rgba(255,132,104,.28) inset!important;font-size:0!important}
    .queue-progress-ring:after{content:'';position:absolute;inset:6px;border-radius:50%;background:var(--row);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
    .queue-progress-ring b{position:relative;z-index:1;font-size:17px!important;line-height:1;color:#ff8468!important;font-weight:950;letter-spacing:.02em;white-space:nowrap}
    .report-queue-row:not(.report-pending-colors) .queue-progress-ring{background:var(--accent-soft)!important;box-shadow:none!important;color:var(--accent)!important}
    .report-queue-row:not(.report-pending-colors) .queue-progress-ring:after{display:none!important}
    .report-queue-row:not(.report-pending-colors) .queue-progress-ring b{color:var(--accent)!important;font-size:13px!important}


    /* Custom result option panel: keep dropdown/search lists above rows and show full short lists. */
    .report-content.workspace-wrap,.workspace-card,.department-card,.profile-card,.result-row,.result-editor,.result-input-label,.rt-result-label,.rt-control{overflow:visible!important}
    .result-row{position:relative;z-index:1}
    .rt-control.open{z-index:2147482500}
    .rt-options-panel{z-index:2147482600!important;max-height:min(340px,55vh)!important;overflow-y:auto!important;overscroll-behavior:contain;scrollbar-width:thin;min-width:100%;padding:5px!important}
    .rt-control.open-up .rt-options-panel{top:auto!important;bottom:calc(100% + 6px)!important}
    .rt-option{min-height:38px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px;line-height:1.22!important;border:1px solid transparent!important;border-radius:8px!important;padding:7px 12px!important;color:inherit!important}
    .rt-option-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:normal}
    .rt-option mark{background:color-mix(in srgb,var(--accent) 28%,transparent)!important;color:inherit!important;border-radius:4px;padding:0 1px;font-weight:950}
    .rt-option:hover,.rt-option:focus-visible,.rt-option.selected,.rt-option.active{background:#356dcc!important;border-color:#356dcc!important;color:#ffffff!important;outline:none!important}
    .rt-option:active{background:#285db7!important;border-color:#285db7!important}
    .rt-check{margin-left:auto;color:currentColor;font-size:15px;font-weight:950}
    :host-context(body.dark-theme) .rt-options-panel,:host-context(body.dark) .rt-options-panel,:host-context(.dark-theme) .rt-options-panel,:host-context(.dark) .rt-options-panel{background:#111827!important;color:#f8fafc!important;border-color:rgba(148,163,184,.28)!important;box-shadow:0 20px 46px rgba(0,0,0,.45)!important}
    :host-context(body.light-theme) .rt-options-panel,:host-context(body.light) .rt-options-panel,:host-context(.light-theme) .rt-options-panel,:host-context(.light) .rt-options-panel{background:#ffffff!important;color:#0f172a!important;border-color:#dbe3ef!important;box-shadow:0 18px 42px rgba(15,23,42,.18)!important}
    .rt-options-panel::-webkit-scrollbar{width:6px}
    .rt-options-panel::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--accent) 45%,var(--border));border-radius:999px}


    /* Final compact result controls: use stable native select/input so selected option text always displays. */
    .rt-control{position:relative;min-width:0;overflow:visible!important}
    .rt-field{height:30px!important;min-height:30px!important;border-radius:10px!important;padding:0 10px!important;font-size:13px!important;font-weight:800!important;background:var(--input)!important;color:var(--text)!important;border:1px solid var(--border)!important;box-shadow:none!important;color-scheme:light dark}
    .rt-field:focus{border-color:var(--accent)!important;box-shadow:0 0 0 3px var(--accent-soft)!important}
    .rt-field::placeholder{color:var(--muted)!important;opacity:.78}
    .rt-native-select{appearance:auto!important;-webkit-appearance:menulist!important;cursor:pointer;padding-right:6px!important;background:var(--input)!important;color:var(--text)!important;color-scheme:light dark}
    .rt-native-select option{background:var(--panel)!important;color:var(--text)!important;font-weight:850!important}
    .rt-native-select option:checked,.rt-native-select option:hover{background:color-mix(in srgb,var(--accent) 22%,var(--panel))!important;color:var(--accent)!important}
    .rt-native-select option[value=""]{color:var(--muted)!important;font-weight:800!important}
    .rt-dropdown-input{cursor:text!important}
    .rt-result-label{gap:2px!important}.rt-label-text{font-size:10px!important;line-height:1!important}.result-editor{gap:4px!important}.compact-result-row{padding-top:5px!important;padding-bottom:5px!important}

    .pending-summary-toolbar{display:inline-flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--border);border-radius:14px;background:linear-gradient(145deg,var(--row),var(--panel));padding:7px 10px;margin:6px 0 10px;box-shadow:0 6px 14px rgba(15,23,42,.07);max-width:100%}
    .pending-master-check{margin-right:2px}.pending-selected-count{font-size:12px;font-weight:900;color:var(--muted)}
    .select-col{width:42px;text-align:center!important}.pending-select-cell input{width:17px;height:17px;accent-color:var(--accent);cursor:pointer;margin:0}.report-queue-row.pending-selected{background:color-mix(in srgb,var(--accent) 10%,var(--row))!important}

    .quick-barcode-more{background:var(--surface-card)!important;color:var(--text)!important;border:1px solid var(--border)!important;box-shadow:var(--shadow-soft)!important}
    .quick-menu-status{padding:8px 12px 6px;border-bottom:1px solid var(--border);margin-bottom:4px;display:flex;justify-content:center}
    .quick-barcode-pill{min-width:96px;justify-content:center}
    .quick-barcode-backdrop{position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:calc(-1 * var(--quick-sidebar-offset,72px))!important;width:calc(100vw + var(--quick-sidebar-offset,72px))!important;height:100vh!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:18px!important;box-sizing:border-box!important;z-index:2147483000!important;background:rgba(15,23,42,.58)!important}.quick-barcode-modal{width:min(1120px,calc(100vw - 48px))!important;max-width:calc(100vw - 48px)!important;max-height:calc(100vh - 48px)!important;overflow:auto;padding:14px!important;margin:0!important;box-sizing:border-box!important}
    .quick-finished-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.quick-action-logo{position:relative;width:38px;height:38px;min-width:38px;border:1px solid color-mix(in srgb,var(--accent) 42%,var(--border));border-radius:13px;display:grid;place-items:center;padding:0;cursor:pointer;color:#fff;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 92%,#fff 8%),color-mix(in srgb,var(--accent) 64%,#111827));box-shadow:0 9px 22px color-mix(in srgb,var(--accent) 24%,transparent),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}.quick-action-logo svg{width:21px;height:21px;fill:currentColor;filter:drop-shadow(0 2px 3px rgba(0,0,0,.2))}.quick-action-logo:hover:not(:disabled){transform:translateY(-2px) scale(1.025);box-shadow:0 13px 28px color-mix(in srgb,var(--accent) 34%,transparent),inset 0 1px 0 rgba(255,255,255,.38)}.quick-action-logo:focus-visible{outline:0;box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent),0 13px 28px color-mix(in srgb,var(--accent) 30%,transparent)}.quick-action-logo:disabled{opacity:.52;cursor:not-allowed;filter:saturate(.6)}.quick-action-logo-dot{position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-radius:999px;background:#fff;border:2px solid color-mix(in srgb,var(--accent) 72%,#111827);box-sizing:border-box}.btn.danger-soft{background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.28);color:#ef4444}.action-trigger{min-width:92px;justify-content:space-between;display:inline-flex;align-items:center;gap:10px;background:var(--input);border-color:color-mix(in srgb,var(--accent) 28%,var(--border))}.action-trigger b{font-size:14px;color:var(--muted)}.rich-output-modal{width:min(900px,92vw);height:min(720px,84vh);max-height:84vh;overflow:hidden!important;padding:0!important;display:flex;flex-direction:column;border-radius:26px;box-shadow:0 28px 90px rgba(2,6,23,.45);margin:auto}.output-modal-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,color-mix(in srgb,var(--panel) 90%,var(--accent)),var(--panel))}.output-modal-heading{display:flex;align-items:center;gap:12px}.output-modal-heading h3{margin:0;font-size:19px}.output-modal-heading p{margin:4px 0 0;color:var(--muted);font-size:12px}.output-modal-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:var(--accent-gradient);color:#fff;font-size:20px;box-shadow:var(--glow)}.output-modal-close{flex:0 0 auto}.output-modal-body{flex:1 1 auto;min-height:0;overflow:auto;padding:16px 20px 22px;scrollbar-gutter:stable}.output-modal-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row));box-shadow:0 -10px 28px rgba(2,6,23,.12)}.output-footer-summary b,.output-footer-summary small{display:block}.output-footer-summary b{font-size:13px}.output-footer-summary small{margin-top:2px;color:var(--muted);font-size:11px}.output-footer-actions{display:flex;align-items:center;gap:9px}.output-primary-action{min-width:190px}.output-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 12px;position:sticky;top:-16px;z-index:5;padding-top:2px;background:linear-gradient(180deg,var(--panel) 82%,transparent)}.output-summary div{border:1px solid var(--border);background:var(--row);border-radius:15px;padding:11px 12px}.output-summary span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.04em}.output-summary b{display:block;margin-top:4px;font-size:13px}.modal-option-section{border:1px solid var(--border);background:color-mix(in srgb,var(--panel) 94%,var(--accent));border-radius:18px;padding:14px;margin-top:12px}.modal-option-title{display:flex;justify-content:space-between;gap:10px;margin-bottom:10px}.modal-option-title b{font-size:14px}.modal-option-title small{display:block;color:var(--muted);font-size:11px;margin-top:3px}.ordered-report-list .report-select-row{grid-template-columns:24px 30px 1fr auto}.order-badge{width:28px;height:28px;border-radius:9px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:11px;font-weight:950}.order-buttons{display:flex;gap:4px}.order-buttons button{width:29px;height:29px;border:1px solid var(--border);border-radius:9px;background:var(--input);color:var(--text);cursor:pointer}.choice-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.choice-card-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.choice-card-grid label,.signature-choice-list label{display:flex;align-items:flex-start;gap:10px;border:1px solid var(--border);border-radius:15px;background:var(--row);padding:12px;cursor:pointer;transition:border-color .15s ease,background .15s ease,transform .15s ease}.choice-card-grid label:hover,.signature-choice-list label:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--border));transform:translateY(-1px)}.choice-card-grid label.active{border-color:color-mix(in srgb,var(--accent) 62%,var(--border));background:var(--accent-soft)}.choice-card-grid input,.signature-choice-list input{margin-top:2px}.choice-card-grid b,.signature-choice-list b{display:block;font-size:12px}.choice-card-grid small,.signature-choice-list small{display:block;color:var(--muted);font-size:10px;margin-top:3px;line-height:1.4}.signature-choice-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rich-output-modal{width:min(1320px,94vw);height:min(860px,90vh);max-height:90vh}.output-modal-header{padding:20px 24px}.output-modal-close{width:42px;height:42px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--panel) 92%,transparent);color:var(--text);display:grid;place-items:center;cursor:pointer;transition:background .16s ease,border-color .16s ease,color .16s ease,transform .16s ease;appearance:none}.output-modal-close svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}.output-modal-close:hover{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.42);color:#f87171;transform:scale(1.04)}.output-modal-meta{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.output-modal-meta>div{padding:13px 24px;border-right:1px solid var(--border)}.output-modal-meta>div:last-child{border-right:0}.output-modal-meta span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.06em}.output-modal-meta b{display:block;margin-top:5px;font-size:14px}.output-designer-grid{display:grid;grid-template-columns:minmax(320px,.95fr) minmax(440px,1.2fr) minmax(220px,.58fr);gap:0;padding:0!important;overflow:hidden!important}.output-column{min-width:0;min-height:0;padding:20px;overflow:auto}.output-column+.output-column{border-left:1px solid var(--border)}.output-column-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}.output-column-head h4,.preview-card h4{margin:0;font-size:16px}.output-column-head p{margin:4px 0 0;color:var(--muted);font-size:11px}.selected-count-pill{padding:6px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:900;white-space:nowrap}.compact-report-list{display:grid;gap:9px}.compact-report-list .report-select-row{grid-template-columns:22px 30px minmax(0,1fr) auto;padding:12px;border-radius:15px}.report-row-copy{min-width:0}.report-row-copy b,.report-row-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.reorder-hint{display:flex;align-items:flex-start;gap:10px;margin-top:14px;padding:12px;border:1px dashed var(--border);border-radius:14px;color:var(--muted)}.reorder-hint b,.reorder-hint small{display:block}.reorder-hint b{color:var(--text);font-size:12px}.reorder-hint small{font-size:10px;margin-top:3px}.compact-setting-block{padding-bottom:11px;margin-bottom:11px;border-bottom:1px solid var(--border)}.setting-title{margin-bottom:7px}.setting-title b,.setting-title small{display:block}.setting-title b{font-size:12px}.setting-title small{color:var(--muted);font-size:10px;margin-top:2px}.compact-choice-grid{gap:8px}.compact-choice-grid label{min-height:44px;padding:9px 12px;align-items:center;border-radius:12px}.compact-choice-grid input{width:17px;height:17px;margin:0;flex:0 0 auto}.compact-choice-grid span{min-width:0}.compact-choice-grid b{font-size:11px;line-height:1.2}.compact-choice-grid small{display:none}.compact-signature-list{grid-template-columns:1fr}.compact-signature-list label{min-height:44px;padding:8px 11px;align-items:center;border-radius:12px;gap:10px}.compact-signature-list input{width:18px;height:18px;margin:0;flex:0 0 auto}.compact-signature-list .signature-row-copy{min-width:0;flex:1}.compact-signature-list .signature-row-copy b{font-size:11px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.compact-signature-list em{margin-left:auto;color:var(--muted);font-size:9px;font-style:normal;font-weight:800;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.compact-signature-list label:hover{transform:none}.preview-column{background:color-mix(in srgb,var(--panel) 96%,var(--accent));padding:18px}.preview-card{position:sticky;top:0;border:1px solid var(--border);border-radius:18px;background:var(--row);padding:18px}.preview-document-icon{width:72px;height:86px;margin:4px auto 14px;display:grid;place-items:center;color:var(--accent)}.preview-document-icon svg{width:66px;height:82px;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linejoin:round;stroke-linecap:round}.preview-card h4{text-align:center;margin-bottom:14px}.preview-summary-row{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--border);font-size:11px}.preview-summary-row span{color:var(--muted)}.preview-summary-row b{text-align:right}.output-modal-footer{padding:15px 24px}.output-primary-action{min-width:220px}@media(max-width:1080px){.output-designer-grid{grid-template-columns:minmax(300px,.9fr) minmax(420px,1.1fr)}.preview-column{grid-column:1/-1;border-left:0!important;border-top:1px solid var(--border)}.preview-card{position:static;display:grid;grid-template-columns:auto repeat(5,minmax(0,1fr));align-items:center;gap:10px}.preview-document-icon{width:44px;height:54px;margin:0}.preview-document-icon svg{width:42px;height:52px}.preview-card h4{text-align:left;margin:0}.preview-summary-row{border-top:0;border-left:1px solid var(--border);padding:6px 10px;display:block}.preview-summary-row b{display:block;text-align:left;margin-top:3px}}@media(max-width:760px){.output-modal-backdrop{padding:12px}.rich-output-modal{width:96vw;height:88vh;max-height:88vh;border-radius:20px}.choice-card-grid,.choice-card-grid.three,.signature-choice-list,.output-summary{grid-template-columns:1fr}.output-modal-footer{align-items:stretch;flex-direction:column}.output-footer-actions{width:100%}.output-footer-actions .btn{flex:1}.output-primary-action{min-width:0}.output-summary{position:static}.output-modal-heading p{display:none}}@media(max-width:760px){.rich-output-modal{height:92vh;max-height:92vh}.output-modal-meta{grid-template-columns:1fr 1fr}.output-modal-meta>div{padding:10px 14px}.output-modal-meta>div:nth-child(3){grid-column:1/-1;border-top:1px solid var(--border)}.output-designer-grid{display:block;overflow:auto!important}.output-column{overflow:visible;padding:16px}.output-column+.output-column{border-left:0;border-top:1px solid var(--border)}.preview-card{display:block}.preview-document-icon{width:56px;height:66px;margin:0 auto 10px}.preview-document-icon svg{width:52px;height:64px}.preview-card h4{text-align:center;margin-bottom:10px}.preview-summary-row{display:flex;border-left:0;border-top:1px solid var(--border);padding:9px 0}.preview-summary-row b{text-align:right;margin:0}.output-modal-footer{padding:12px 14px}.output-modal-close{width:38px;height:38px}}
    .collection-look-modal .section-title{margin-bottom:8px}.quick-flow-status{border:1px solid var(--border);border-radius:12px;background:var(--row);padding:8px 11px;display:flex;gap:8px;align-items:center;margin-bottom:10px}.quick-flow-status b{font-size:13px;white-space:nowrap}.quick-flow-status span{color:var(--muted);font-size:12px}.quick-stepper-strip{display:flex;gap:8px;margin:8px 0 10px}.quick-stepper-strip button{border:1px solid var(--border);border-radius:999px;background:var(--input);color:var(--muted);font-size:12px;font-weight:950;padding:7px 12px;cursor:pointer}.quick-stepper-strip button.active{background:var(--accent-soft);color:var(--accent);border-color:rgba(124,58,237,.35)}.quick-only-group{margin-top:5px;padding:0 8px;height:24px;font-size:10px}.quick-inline-error{margin:8px 0 10px;padding:10px 12px;border-radius:12px;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.45);color:#f59e0b;font-weight:850;white-space:pre-line;line-height:1.45}.profile-collect-card{border:1px solid var(--border);border-radius:16px;background:linear-gradient(145deg,var(--row),var(--panel));padding:12px;box-shadow:0 12px 26px rgba(15,23,42,.08)}.quick-normal-card{margin-top:8px}.quick-profile-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.profile-title{display:flex;align-items:center;gap:10px}.profile-title b{display:block;font-size:14px}.profile-title small{display:block;color:var(--muted);font-size:11px;margin-top:2px}.profile-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:12px;background:var(--accent-gradient);color:#fff;font-weight:900;box-shadow:var(--glow)}.quick-master-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.plain-check{display:flex!important;align-items:center;gap:8px;font-weight:900;color:var(--text);white-space:nowrap}.plain-check input{width:16px;height:16px}.mini-action{height:28px;border:1px solid var(--border);border-radius:9px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:950;padding:0 10px;cursor:pointer}.mini-action.ghost{background:var(--input);color:var(--muted)}.mini-action:disabled{opacity:.5;cursor:not-allowed}.profile-table{border:1px solid var(--border);border-radius:14px;overflow:hidden;background:rgba(15,23,42,.03)}.profile-table-head,.profile-test-row{display:grid;grid-template-columns:58px minmax(190px,1.5fr) minmax(175px,1fr) minmax(130px,.8fr) minmax(135px,.8fr) 120px;gap:8px;align-items:center}.profile-table-head{padding:8px 10px;background:var(--row);color:var(--muted);font-size:10px;font-weight:950;text-transform:uppercase}.profile-test-row{padding:8px 10px;border-top:1px solid var(--border);min-height:48px}.quick-group-row{display:grid;grid-template-columns:58px minmax(190px,1.5fr) minmax(175px,1fr) minmax(130px,.8fr) minmax(135px,.8fr) 120px;gap:8px;align-items:center;padding:9px 10px;border-top:1px solid var(--border);background:rgba(124,58,237,.10)}.quick-selection-table .profile-table-head,.quick-selection-table .profile-test-row,.quick-selection-table .quick-group-row{grid-template-columns:58px minmax(260px,1.7fr) minmax(220px,1fr) 130px}.quick-specimen-table .profile-table-head,.quick-specimen-table .profile-test-row,.quick-specimen-table .quick-group-row{grid-template-columns:minmax(180px,.9fr) minmax(220px,1.1fr) minmax(260px,1fr) 120px}.quick-step-group-row{background:rgba(59,130,246,.08)}.quick-group-row.not-selected{opacity:.82}.quick-group-title-cell b{font-size:13px}.quick-group-check .profile-row-index{background:var(--accent);color:#fff}.quick-child-row{padding-left:24px}.quick-child-row .profile-row-index{width:22px;height:22px;font-size:11px;background:var(--input);color:var(--muted)}.profile-test-row.not-selected{opacity:.55}.profile-test-row.generated-row{opacity:.72}.row-test-check{display:flex!important;align-items:center;gap:8px}.row-test-check input{width:16px;height:16px}.profile-row-index{width:26px;height:26px;display:grid;place-items:center;border-radius:9px;background:var(--accent-soft);color:var(--accent);font-weight:950;font-size:12px}.test-name-cell b{display:block;font-size:12px}.test-name-cell small{display:block;color:var(--muted);font-size:10px}.quick-chip-line{display:flex;flex-wrap:wrap;gap:5px}.quick-chip-line span{border:1px solid var(--border);border-radius:999px;background:var(--input);padding:4px 7px;font-size:10px;font-weight:900;color:var(--muted)}.quick-specimen-select{height:32px;width:100%;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 9px;font-size:11px;font-weight:900}.quick-specimen-select:disabled{opacity:.65}.quick-date-cell{font-size:11px;color:var(--muted);font-weight:850}.status-pill.warning{background:rgba(245,158,11,.14)!important;border-color:rgba(245,158,11,.45)!important;color:#f59e0b!important}.quick-defaults-card{padding:10px;margin-top:10px;border:1px solid var(--border);border-radius:14px;background:var(--row)}.quick-defaults-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.quick-defaults-grid label{font-size:11px;color:var(--muted);font-weight:850}.quick-defaults-grid input,.quick-defaults-grid select{height:34px;width:100%;border:1px solid var(--border);border-radius:11px;background:var(--input);color:var(--text);padding:0 9px;margin-top:5px}.quick-event-editor{margin-top:10px;border-top:1px solid var(--border);padding-top:10px}.quick-event-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}.quick-event-head b{font-size:12px}.quick-event-head small{font-size:11px;color:var(--muted);font-weight:800;text-align:right}.quick-event-row{display:grid;grid-template-columns:minmax(160px,1.1fr) minmax(220px,1.2fr) 135px 120px;gap:8px;align-items:center;padding:8px;border:1px solid var(--border);border-radius:12px;background:var(--panel);margin-top:7px}.quick-event-test b{display:block;font-size:12px}.quick-event-test small{display:block;font-size:10px;color:var(--muted);font-weight:800}.quick-event-row label{font-size:10px;color:var(--muted);font-weight:900}.quick-event-row input{height:32px;width:100%;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 8px;margin-top:4px}.quick-action-row{margin-top:12px}.quick-barcode-modal .icon{width:34px;height:34px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);display:grid;place-items:center;font-size:18px;font-weight:900;line-height:1;cursor:pointer}.quick-pick-grid.collection-pick-grid{display:grid;grid-template-columns:1fr;gap:10px;margin:10px 0 4px}.quick-pick-card.collection-pick-card{appearance:none;-webkit-appearance:none;width:100%;border:1px solid var(--border);border-radius:14px;background:linear-gradient(145deg,var(--row),var(--panel));color:var(--text);padding:12px 14px;text-align:left;display:grid;grid-template-columns:minmax(210px,.85fr) minmax(145px,.55fr) minmax(260px,1.15fr);gap:12px;align-items:center;box-shadow:0 10px 22px rgba(15,23,42,.12);cursor:pointer;white-space:normal}.quick-pick-card.collection-pick-card b{font-size:13px;font-weight:950;color:var(--text);white-space:normal}.quick-pick-card.collection-pick-card small{font-size:11px;font-weight:800;color:var(--muted);white-space:normal;overflow:hidden;text-overflow:ellipsis}.quick-pick-card.collection-pick-card.active{border-color:rgba(124,58,237,.65);background:linear-gradient(145deg,rgba(124,58,237,.20),var(--panel));box-shadow:0 0 0 2px rgba(124,58,237,.18),0 14px 28px rgba(15,23,42,.18)}.quick-pick-card.collection-pick-card:hover{border-color:rgba(124,58,237,.45)}@media(max-width:900px){.quick-pick-card.collection-pick-card{grid-template-columns:1fr}}@media(max-width:1050px){.profile-table-head,.profile-test-row,.quick-group-row{grid-template-columns:50px 1fr}.profile-table-head span:nth-child(n+3),.profile-test-row>*:nth-child(n+3),.quick-group-row>*:nth-child(n+3){grid-column:2}.quick-defaults-grid{grid-template-columns:1fr}.quick-event-row{grid-template-columns:1fr}.quick-flow-status{align-items:flex-start;flex-direction:column}}


        @media(max-width:1150px){.report-tabs,.filter-row,.meta-row,.summary-grid{grid-template-columns:1fr}.result-row{grid-template-columns:1fr}.outsource-panel{grid-column:1/-1;grid-template-columns:1fr}.master-table:not(.report-queue-table) thead{display:none}.master-table:not(.report-queue-table) tr,.master-table:not(.report-queue-table) td{display:block}.master-table:not(.report-queue-table) td{border:1px solid var(--border);border-radius:0}.master-table:not(.report-queue-table) td:first-child{border-radius:14px 14px 0 0}.master-table:not(.report-queue-table) td:last-child{border-radius:0 0 14px 14px}.report-queue-table{min-width:0}}
  `]
})
export class ReportTypingPageComponent implements OnInit, OnDestroy {
  private outputModalBackdropElement: HTMLElement | null = null;
  private previousBodyOverflow = '';

  @ViewChild('outputModalBackdrop')
  set outputModalBackdrop(ref: ElementRef<HTMLElement> | undefined) {
    const element = ref?.nativeElement ?? null;
    if (element && element !== this.outputModalBackdropElement) {
      this.outputModalBackdropElement = element;
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(element);
      return;
    }

    if (!element && this.outputModalBackdropElement) {
      this.outputModalBackdropElement = null;
      document.body.style.overflow = this.previousBodyOverflow;
    }
  }

  constructor(private sanitizer: DomSanitizer, private snackBar: MatSnackBar) {
    this.queueFilterForm.controls.search.valueChanges.subscribe(value => { this.reportSearch = value; });
    this.queueFilterForm.controls.fromDate.valueChanges.subscribe(value => { this.fromDate = value; this.onDateFilterChanged(); });
    this.queueFilterForm.controls.toDate.valueChanges.subscribe(value => { this.toDate = value; this.onDateFilterChanged(); });
  }
  private dateRangeRestored = false;
  private dateReloadTimer: any = null;
  @Output() changed = new EventEmitter<void>();
  reports = signal<any[]>([]);
  quickReporting = false;
  reportLogs = signal<any[]>([]);
  selectedReport = signal<ReportVm | null>(null);
  workspaceMode = signal<WorkspaceMode>('ENTRY');
  busy = signal(false);
  errorMessage = signal('');
  successMessage = signal('');
  criticalNotice = signal('');
  historyState = signal<HistoryState>(null);
  pdfPreview = signal<PdfPreviewState>(null);
  reopenState = signal<ReopenState>(null);
  rejectState = signal<RejectState>(null);
  recheckRequestState = signal<RecheckRequestState>(null);
  resetConfirm = signal<ResetConfirmState>(null);
  approvedActionState = signal<ApprovedActionState>(null);
  quickBarcodeState = signal<QuickBarcodeModalState>(null);
  approvedQueueMenu = signal<{row:any; style:Record<string,string>}|null>(null);
  private resetConfirmResolver: ((value: boolean) => void) | null = null;
  reportStatus: ReportQueueStatus = 'DRAFT';
  reportQueueView: 'BILL' | 'REPORT' = 'BILL';
  recheckEntryMode = false;
  reportSearch = '';
  fromDate = DateTimeSettingsService.nowInputValue().slice(0, 10);
  toDate = DateTimeSettingsService.nowInputValue().slice(0, 10);
  readonly queueFilterForm = new FormGroup({
    search: new FormControl('', { nonNullable:true }),
    fromDate: new FormControl(this.fromDate, { nonNullable:true }),
    toDate: new FormControl(this.toDate, { nonNullable:true })
  });
  logFilter: 'ALL' | 'RESULT' | 'CORRECTION' | 'RECHECK' | 'DELIVERY' | 'CANCEL' = 'ALL';
  queueExpanded = new Set<string>();
  pendingSummarySelected = new Set<string>();
  queueDetails: Record<number, ReportVm> = {};
  resultOptionPanelKey = '';
  resultOptionDrafts: Record<string, string> = {};
  resultOptionActiveIndex: Record<string, number> = {};
  resultSearchDrafts: Record<string, string> = {};
  private readonly optionEngine = new OptionInputEngine();
  private readonly optionTextControls = new WeakMap<object, FormControl<string>>();
  private readonly reactiveGroups = new WeakMap<object, FormGroup>();
  private readonly controlCallbacks = new WeakMap<FormControl<any>, (value:any)=>void>();
  private readonly searchControls = new WeakMap<object, FormControl<string>>();
  private readonly searchSelectEngine = new SearchSelectInputEngine();
  resultPanelDirections: Record<string, 'up' | 'down'> = {};
  private resultPanelCloseTimers: Record<string, any> = {};
  outsourceVendors: any[] = [];
  private errorListener = (event: ErrorEvent) => this.showError(event?.message || 'Unexpected reporting error.');
  private rejectionListener = (event: PromiseRejectionEvent) => this.showError(event?.reason?.message || String(event?.reason || 'Unexpected reporting error.'));

  openApprovedQueueMenu(event:MouseEvent, row:any){
    event.preventDefault();
    event.stopPropagation();
    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const width = 250;
    const preferredHeight = 380;
    const margin = 12;
    const vw = document.documentElement.clientWidth || window.innerWidth || 1024;
    const vh = document.documentElement.clientHeight || window.innerHeight || 720;
    const menuHeight = Math.max(220, Math.min(preferredHeight, vh - margin * 2));
    const left = Math.max(margin, Math.min(rect.right - width, vw - width - margin));
    let top = rect.bottom + 8;
    if(top + menuHeight > vh - margin) top = rect.top - menuHeight - 8;
    if(top < margin) top = Math.max(margin, vh - menuHeight - margin);
    this.approvedQueueMenu.set({row, style:{left:`${Math.round(left)}px`, top:`${Math.round(top)}px`, maxHeight:`${Math.round(menuHeight)}px`}});
  }
  closeApprovedQueueMenu(){ this.approvedQueueMenu.set(null); }
  approvedQueueMenuDo(action: ApprovedAction | 'REJECT'){
    const menu = this.approvedQueueMenu();
    if(!menu) return;
    const id = this.primaryApprovedReportId(menu.row);
    this.closeApprovedQueueMenu();
    const result = action === 'REJECT' ? this.startCorrectionFromQueue(id) : this.startApprovedAction(id, action);
    if(result && typeof (result as any).then === 'function') (result as any).catch((err:any)=>this.showError(err?.message || String(err || 'Action failed.')));
  }
  async ngOnInit() {
    window.addEventListener('error', this.errorListener);
    window.addEventListener('unhandledrejection', this.rejectionListener);
    this.restoreDateRangeForStatus(this.reportStatus);
    await this.loadOutsourceVendors();
    await this.loadReports();
  }
  async loadOutsourceVendors() { const api:any = window.limsApi as any; this.outsourceVendors = api.listOutsourceVendors ? await api.listOutsourceVendors() : []; }
  ngOnDestroy() {
    document.body.style.overflow = this.previousBodyOverflow;
    this.outputModalBackdropElement = null;
    window.removeEventListener('error', this.errorListener);
    window.removeEventListener('unhandledrejection', this.rejectionListener);
    if (this.dateReloadTimer) window.clearTimeout(this.dateReloadTimer);
  }
  private cleanErrorMessage(message: any, fallback = 'Unexpected reporting error.'): string {
    const raw = String(message || fallback || '').trim();
    return raw
      .replace(/^Error invoking remote method '[^']+':\s*/i, '')
      .replace(/^Error occurred in handler for '[^']+':\s*/i, '')
      .replace(/^Error:\s*/i, '')
      .trim() || fallback;
  }
  showError(message: string) {
    const clean = this.cleanErrorMessage(message);
    // Do not render the old inline "Reporting error" banner above the tabs.
    // Errors are shown only as Angular Material snack bars.
    this.errorMessage.set('');
    this.successMessage.set('');
    this.snackBar.open(clean, 'Close', {
      duration: 7000,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['reporting-snack', 'reporting-snack-error']
    });
  }
  showSuccess(message: string) {
    const clean = String(message || 'Done.').trim() || 'Done.';
    // Do not render the old inline "Reporting updated" banner above the tabs.
    // Success messages are shown only as Angular Material snack bars.
    this.successMessage.set('');
    this.errorMessage.set('');
    this.snackBar.open(clean, 'OK', {
      duration: 3500,
      horizontalPosition: 'right',
      verticalPosition: 'top',
      panelClass: ['reporting-snack', 'reporting-snack-success']
    });
  }
  async runAction<T>(action: () => Promise<T>, fallback: string): Promise<T | null> { if (this.busy()) return null; this.busy.set(true); this.errorMessage.set(''); this.successMessage.set(''); try { return await action(); } catch (err:any) { console.error('[Reporting]', err); this.showError(err?.message || fallback); return null; } finally { this.busy.set(false); } }

  askResetConfirm(): Promise<boolean> {
    this.resetConfirm.set({
      title: 'Reset test data?',
      message: 'This will clear Billing, Collection and Reporting transaction data for testing.',
      details: 'Master configuration, tests, profiles, patients, vendors and settings will not be deleted.',
      confirmText: 'Clear test data',
      cancelText: 'Cancel'
    });
    return new Promise(resolve => this.resetConfirmResolver = resolve);
  }
  finishResetConfirm(value: boolean) {
    this.resetConfirm.set(null);
    const resolve = this.resetConfirmResolver;
    this.resetConfirmResolver = null;
    resolve?.(value);
  }

  private askInlineConfirm(options: ResetConfirmState): Promise<boolean> {
    if (!options) return Promise.resolve(false);
    this.resetConfirm.set(options);
    return new Promise(resolve => this.resetConfirmResolver = resolve);
  }

  private focusReportModalTextarea(kind: 'reject' | 'reopen') {
    const selector = `textarea[data-report-autofocus="${kind}"]`;
    let tries = 0;
    const focus = () => {
      tries += 1;
      const el = document.querySelector(selector) as HTMLTextAreaElement | null;
      if (el) {
        el.focus({ preventScroll: true });
        el.select?.();
        return;
      }
      if (tries < 8) window.setTimeout(focus, 50);
    };
    window.setTimeout(focus, 80);
  }

  async resetWorkflowData() {
    const ok = await this.askResetConfirm();
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.resetWorkflowData) { this.showError('Reset action is not available in this build.'); return; }
    const result = await this.runAction(async()=>api.resetWorkflowData(), 'Unable to reset test workflow data.');
    if (!result) return;
    this.selectedReport.set(null); this.reportStatus='DRAFT'; await this.loadReports(); this.changed.emit(); this.showSuccess('Billing, Collection and Reporting test data cleared. Master setup is untouched.');
  }

  quickBarcodeStatus(r:any): string { return String(r?.quick_barcode_status || 'PENDING').toUpperCase(); }
  quickBarcodeLabel(r:any): string {
    const status = this.quickBarcodeStatus(r);
    if (status === 'GENERATED') return 'Barcode done';
    if (status === 'PARTIAL') return `Barcode ${+r?.quick_barcode_generated_count || 0}/${(+r?.quick_barcode_generated_count || 0) + (+r?.quick_barcode_pending_count || 0)}`;
    return 'Barcode pending';
  }
  quickBarcodeHasGenerated(r:any): boolean { return ['GENERATED','PARTIAL'].includes(this.quickBarcodeStatus(r)) || (+r?.quick_barcode_generated_count || 0) > 0; }
  private htmlSafe(value:any): string { return String(value ?? '').replace(/[&<>"']/g, (ch:string)=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' } as any)[ch]); }
  private prettySampleId(value:any): string { const s=String(value || '').replace(/\D/g,''); return s.length > 4 ? s.replace(/(.{2})/g,'$1-').replace(/-$/,'') : this.htmlSafe(value || '-'); }
  private async openGeneratedPdfFromHtml(html:string, title:string, filePrefix:string, fallback:string, options:any = {}){
    const api:any = window.limsApi as any;
    if (!api.htmlToPdfOpen) { this.showError('PDF generator is not available in this build. Rebuild Electron after applying the patch.'); return; }
    await this.runAction(async()=>{
      const file = await api.htmlToPdfOpen({ html, title, filePrefix, pageSize:'A4', printBackground:true, preferCSSPageSize:true, open:true, ...options });
      if (!file) throw new Error('No PDF file was generated.');
      return file;
    }, fallback);
  }

  private async buildQuickBarcodeLabelHtml(rows:any[]): Promise<{ html:string; count:number; bills:number } | null> {
    const api:any = window.limsApi as any;
    if (!api.quickBarcodeState) { this.showError('Quick Reporting barcode service is not available in this build.'); return null; }
    const labels:string[] = [];
    let billCount = 0;
    for (const row of rows) {
      const state = await api.quickBarcodeState(row.id);
      const groups = (state?.generated_collections || []).filter((g:any)=>String(g?.sample_id || '').trim());
      if (!groups.length) continue;
      billCount += 1;
      for (const g of groups) {
        const sampleId = String(g.sample_id || '').trim();
        const tests = (g.items || []).map((x:any)=>this.htmlSafe(x.test_name || '')).filter(Boolean).join(', ');
        labels.push(`<section class="label"><div class="label-head"><b>${this.htmlSafe(row.patient_name || '-')}</b><span>${this.htmlSafe(row.bill_no || '-')}</span></div><div class="sample">${this.htmlSafe(sampleId)}</div><div class="barcode">${code128Svg(sampleId)}</div><div class="label-foot"><b>${this.htmlSafe(g.specimen_name || 'Specimen')}</b><span>${this.htmlSafe(g.collection_type || 'Random')} ${this.htmlSafe(g.collection_time || '')}</span></div><div class="tests">${tests}</div></section>`);
      }
    }
    if (!labels.length) return { html:'', count:0, bills:billCount };
    const html=`<html><head><title>Barcode Labels</title><style>@page{size:50mm 25mm;margin:0}*{box-sizing:border-box}html,body{width:50mm;margin:0;padding:0;background:#fff;color:#111;font-family:Arial,sans-serif}.label{width:50mm;height:25mm;padding:1.25mm 1.5mm;overflow:hidden;page-break-after:always;break-after:page}.label-head{display:flex;justify-content:space-between;gap:1.5mm;font-size:5.2pt;line-height:1.1;white-space:nowrap;overflow:hidden}.label-head b{max-width:31mm;overflow:hidden;text-overflow:ellipsis}.sample{text-align:center;font-size:8.8pt;font-weight:900;letter-spacing:.7pt;line-height:1;margin-top:.7mm}.barcode{width:45mm;height:9.4mm;margin:.8mm auto .6mm;overflow:hidden}.barcode svg{display:block;width:100%;height:100%}.label-foot{display:flex;justify-content:space-between;gap:1mm;font-size:5.2pt;line-height:1.1;white-space:nowrap;overflow:hidden}.label-foot b{max-width:22mm;overflow:hidden;text-overflow:ellipsis}.label-foot span{max-width:22mm;overflow:hidden;text-overflow:ellipsis}.tests{font-size:4.8pt;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:.35mm}</style></head><body>${labels.join('')}</body></html>`;
    return { html, count:labels.length, bills:billCount };
  }

  async printQuickBarcodeForBill(row:any){
    const result = await this.runAction(async()=>this.buildQuickBarcodeLabelHtml([row]), 'Unable to load generated barcode details.');
    if (!result) return;
    if (!result.count) { this.showError('No generated barcode found for this bill.'); return; }
    await this.openGeneratedPdfFromHtml(result.html, `Barcode ${row.bill_no || ''}`, `barcode-${row.bill_no || row.id || 'bill'}`, 'Unable to generate barcode PDF.', { pageSize:'CSS', width:240, height:140 });
  }

  async printBulkQuickBarcodeSelected(){
    const rows = this.pendingSummarySelectedRows();
    if (!rows.length) { this.showError('Select one or more pending reports.'); return; }
    const result = await this.runAction(async()=>this.buildQuickBarcodeLabelHtml(rows), 'Unable to load selected barcode details.');
    if (!result) return;
    if (!result.count) { this.showError('No generated barcodes found in the selected pending reports.'); return; }
    const now = DateTimeSettingsService.nowInputValue();
    await this.openGeneratedPdfFromHtml(result.html, 'Bulk Barcode Labels', `bulk-barcodes-${now.slice(0,10)}`, 'Unable to generate bulk barcode PDF.', { pageSize:'CSS', width:240, height:140 });
  }

  private quickNowParts() { const v = DateTimeSettingsService.nowInputValue(); return { date:v.slice(0,10), time:v.slice(11,16) }; }

  setQuickBarcodeStep(step:1|2|3) {
    const qb = this.quickBarcodeState();
    if (!qb) return;
    qb.error = '';
    if (qb.mode === 'GENERATE' && step > 1) {
      const collectionCtx = this.quickCollectionTypeContextForState(qb);
      if (!collectionCtx.ok) {
        qb.step = 1;
        qb.error = collectionCtx.error;
        this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
        return;
      }
    }
    if (qb.mode === 'GENERATE' && step > 2) {
      const specimenCtx = this.quickSelectionContextForState(qb);
      if (!specimenCtx.ok) {
        qb.step = 2;
        qb.error = specimenCtx.error;
        this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
        return;
      }
    }
    qb.step = step;
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }
  trackQuickBarcodeGroup(_i:number, group:any) { return group?.key || _i; }
  trackQuickBarcodeItem(_i:number, item:any) { return item?.item_key || item?.id || item?.test_id || _i; }
  private recomputeQuickBarcodeState(qb:any): any {
    if (!qb) return qb;
    const items = ((qb.state?.flat_items || qb.state?.items || []) as any[]);
    const pending = items.filter((x:any)=>!this.quickItemGenerated(x));
    const selectedSet = new Set((qb.selectedItemKeys || []).map((x:any)=>String(x)));
    const map = new Map<string, any>();
    for (const item of items) {
      const itemKey = this.quickItemKey(item);
      const generated = this.quickItemGenerated(item);
      const specimens = this.quickBarcodeItemSpecimens(item);
      const selected = !generated && selectedSet.has(itemKey);
      const selectedSpecimenKey = this.quickSelectedSpecimenKeyForItem(item);
      const selectedSpecimen = specimens.find((s:any)=>this.quickSpecimenKey(s) === selectedSpecimenKey) || null;
      item._quickSpecimens = specimens;
      item._quickGenerated = generated;
      item._quickSelected = selected;
      item._quickBlocked = !generated && selected && specimens.length > 1 && !selectedSpecimenKey;
      item._quickStatus = generated ? 'Generated' : (item._quickBlocked ? 'Select specimen' : 'Pending');
      item._quickSpecimenModel = specimens.length <= 1 ? (specimens[0] ? this.quickSpecimenOptionValue(specimens[0]) : 0) : (selectedSpecimen ? this.quickSpecimenOptionValue(selectedSpecimen) : 0);
      const groupKey = this.quickBarcodeItemGroupKey(item);
      if (!map.has(groupKey)) map.set(groupKey, { key:groupKey, name:this.quickBarcodeItemParentName(item), items:[] });
      map.get(groupKey).items.push(item);
    }
    const groups = Array.from(map.values()).map((group:any)=>{
      const groupPending = (group.items || []).filter((x:any)=>!x._quickGenerated);
      const selectedCount = groupPending.filter((x:any)=>x._quickSelected).length;
      const generatedCount = (group.items || []).filter((x:any)=>x._quickGenerated).length;
      const specimenNames = Array.from(new Set((group.items || []).map((item:any)=>{
        const sp = this.quickResolvedItemSpecimen(item) || (item._quickSpecimens || [])[0];
        return String(sp?.name || sp?.specimen_name || item?.specimen_name || '').trim();
      }).filter(Boolean)));
      const collectionLabels = Array.from(new Set((group.items || []).map((item:any)=>`${item?.collection_type || 'Random'} · ${item?.collect_timing || 'NOW'}`)));
      const dateLabels = Array.from(new Set((group.items || []).map((item:any)=>this.quickBarcodeItemDateTime(item)).filter((x:string)=>x && x !== '-')));
      const blocked = groupPending.some((x:any)=>x._quickBlocked);
      group.pendingCount = groupPending.length;
      group.selectedCount = selectedCount;
      group.generatedCount = generatedCount;
      group.allSelected = !!groupPending.length && selectedCount === groupPending.length;
      group.someSelected = selectedCount > 0 && selectedCount < groupPending.length;
      group.anySelected = selectedCount > 0 || generatedCount > 0;
      group.blocked = blocked;
      group.specimenSummary = specimenNames.length ? (specimenNames.length === 1 ? String(specimenNames[0]) : `${specimenNames.length} specimens`) : '-';
      group.collectionSummary = collectionLabels.length ? (collectionLabels.length === 1 ? String(collectionLabels[0]) : `${collectionLabels.length} collection types`) : '-';
      group.dateSummary = dateLabels.length ? (dateLabels.length === 1 ? String(dateLabels[0]) : `${dateLabels.length} timings`) : '-';
      group.status = blocked ? 'Select specimen' : (!groupPending.length && generatedCount ? 'Generated' : `${selectedCount}/${groupPending.length} selected`);
      return group;
    });
    qb.itemGroups = groups;
    qb.selectedItemGroups = groups
      .map((group:any)=>({ ...group, items:(group.items || []).filter((item:any)=>item._quickSelected) }))
      .filter((group:any)=>(group.items || []).length);
    qb.collectionEventItems = this.quickBuildCollectionEventItemsForState(qb);
    qb.pendingCount = pending.length;
    qb.selectedCount = (qb.selectedItemKeys || []).filter((k:string)=>pending.some((x:any)=>this.quickItemKey(x) === k)).length;
    if (!qb.loading && qb.mode === 'GENERATE') {
      const selectionCtx = this.quickCollectionTypeContextForState(qb);
      const specimenCtx = selectionCtx.ok ? this.quickSpecimenContextForState(qb) : { ok:true, error:'' };
      const generateCtx = selectionCtx.ok ? this.quickSelectionContextForState(qb) : selectionCtx;
      qb.selectionValidationMessage = selectionCtx.ok ? '' : selectionCtx.error;
      qb.specimenValidationMessage = specimenCtx.ok ? '' : specimenCtx.error;
      const step = +(qb.step || 1);
      qb.validationMessage = step <= 1 ? qb.selectionValidationMessage : (step === 2 ? qb.specimenValidationMessage : (generateCtx.ok ? '' : generateCtx.error));
    } else {
      qb.selectionValidationMessage = '';
      qb.specimenValidationMessage = '';
      qb.validationMessage = '';
    }
    return { ...qb };
  }
  private quickCollectionTypeContextForState(qb:any): any {
    const items = ((qb.state?.flat_items || qb.state?.items || []) as any[]).filter((x:any)=>!this.quickItemGenerated(x));
    const selectedKeys = new Set((qb.selectedItemKeys || []).map((x:any)=>String(x)));
    const selectedItems = items.filter((x:any)=>selectedKeys.has(this.quickItemKey(x)));
    if (!selectedItems.length) return { ok:false, error:'Select at least one pending item.' };
    const configuredItems = selectedItems
      .map((item:any)=>({ item, key:this.quickConfiguredCollectionKey(item), label:this.quickConfiguredCollectionLabel(item) }))
      .filter((x:any)=>!!x.key);
    const collectionKeys = Array.from(new Set(configuredItems.map((x:any)=>x.key)));
    if (collectionKeys.length > 1) {
      return { ok:false, error:this.quickPrettyCollectionConflictMessage(configuredItems) };
    }
    return { ok:true, collectionKey:String(collectionKeys[0] || '') };
  }

  private quickPrettyCollectionConflictMessage(configuredItems:any[]): string {
    const grouped = new Map<string, Map<string, string[]>>();
    for (const x of configuredItems || []) {
      const label = String(x?.label || 'Configured collection').trim() || 'Configured collection';
      const groupName = this.quickBarcodeItemParentName(x?.item);
      const testName = String(x?.item?.test_name || 'Selected test').trim() || 'Selected test';
      if (!grouped.has(label)) grouped.set(label, new Map<string, string[]>());
      const profileMap = grouped.get(label)!;
      if (!profileMap.has(groupName)) profileMap.set(groupName, []);
      profileMap.get(groupName)!.push(testName);
    }
    const parts:string[] = [
      'Collection type conflict',
      '',
      'You selected items from different predefined collection timings.',
      'Choose only one timing group, deselect conflicting items, or use "Only this group".',
      ''
    ];
    for (const [label, profileMap] of grouped.entries()) {
      parts.push(label);
      for (const [profileName, tests] of profileMap.entries()) {
        parts.push(`  ${profileName}`);
        for (const testName of tests) parts.push(`    - ${testName}`);
      }
      parts.push('');
    }
    return parts.join('\n').trim();
  }

  private quickSpecimenContextForState(qb:any): any {
    const items = ((qb.state?.flat_items || qb.state?.items || []) as any[]).filter((x:any)=>!this.quickItemGenerated(x));
    const selectedKeys = new Set((qb.selectedItemKeys || []).map((x:any)=>String(x)));
    const selectedItems = items.filter((x:any)=>selectedKeys.has(this.quickItemKey(x)));
    if (!selectedItems.length) return { ok:false, error:'Select at least one pending item.' };
    const missing:string[] = [];
    for (const item of selectedItems) {
      const specimens = this.quickBarcodeItemSpecimens(item);
      const resolved = this.quickResolvedItemSpecimen(item);
      if (specimens.length > 1 && !resolved) missing.push(`${this.quickBarcodeItemParentName(item)} / ${item?.test_name || 'Selected test'}`);
    }
    if (missing.length) return { ok:false, error:'Select specimen for:\n' + missing.map(x=>`  - ${x}`).join('\n') };
    return { ok:true };
  }
  private quickSelectionContextForState(qb:any): any {
    const items = ((qb.state?.flat_items || qb.state?.items || []) as any[]).filter((x:any)=>!this.quickItemGenerated(x));
    const selectedKeys = new Set((qb.selectedItemKeys || []).map((x:any)=>String(x)));
    const selectedItems = items.filter((x:any)=>selectedKeys.has(this.quickItemKey(x)));
    if (!selectedItems.length) return { ok:false, error:'Select at least one pending item.' };
    const itemSpecimens:any[] = [];
    const itemCollectionEvents:any[] = [];
    for (const item of selectedItems) {
      const specimens = this.quickBarcodeItemSpecimens(item);
      const resolved = this.quickResolvedItemSpecimen(item);
      if (specimens.length > 1 && !resolved) return { ok:false, error:`${item?.test_name || 'Selected test'} has multiple specimens. Select exactly one specimen for this item.` };
      const finalSpecimen = resolved || specimens[0] || item;
      const itemKey = this.quickItemKey(item);
      itemSpecimens.push({ item_key:itemKey, specimen_key:this.quickSpecimenKey(finalSpecimen), specimen_type_id:+finalSpecimen?.id || +finalSpecimen?.specimen_type_id || +item?.specimen_type_id || 0, specimen_name:String(finalSpecimen?.name || finalSpecimen?.specimen_name || item?.specimen_name || 'Specimen') });
      const ev: any = qb.itemCollectionEvents?.[itemKey] || {};
      itemCollectionEvents.push({ item_key:itemKey, collection_date:String(ev.collection_date || qb.collectionDate || '').trim(), collection_time:String(ev.collection_time || qb.collectionTime || '').trim() });
    }
    const configuredItems = selectedItems
      .map((item:any)=>({ item, key:this.quickConfiguredCollectionKey(item), label:this.quickConfiguredCollectionLabel(item) }))
      .filter((x:any)=>!!x.key);
    const collectionKeys = Array.from(new Set(configuredItems.map((x:any)=>x.key)));
    if (collectionKeys.length > 1) {
      return { ok:false, error:this.quickPrettyCollectionConflictMessage(configuredItems) };
    }
    return { ok:true, specimenKey:'', collectionKey:String(collectionKeys[0] || ''), collection:null, itemSpecimens, itemCollectionEvents };
  }
  private quickBuildCollectionEventItemsForState(qb:any): any[] {
    if (!qb || qb.mode !== 'GENERATE') return [];
    const items = ((qb.state?.flat_items || qb.state?.items || []) as any[]).filter((x:any)=>!this.quickItemGenerated(x));
    const selectedKeys = new Set((qb.selectedItemKeys || []).map((x:any)=>String(x)));
    const events = qb.itemCollectionEvents || {};
    return items
      .filter((item:any)=>selectedKeys.has(this.quickItemKey(item)))
      .map((item:any)=>{
        const key = this.quickItemKey(item);
        const sp = this.quickResolvedItemSpecimen(item) || this.quickBarcodeItemSpecimens(item)[0] || item;
        const override = events[key] || {};
        const collectionDate = String(override.collection_date || qb.collectionDate || '').trim();
        const collectionTime = String(override.collection_time || qb.collectionTime || '').trim();
        return {
          item,
          item_key:key,
          test_name:item?.test_name || 'Selected test',
          group_name:this.quickBarcodeItemParentName(item),
          specimen_name:String(sp?.name || sp?.specimen_name || item?.specimen_name || 'Specimen'),
          collection_type:String(item?.collection_type || item?.sample_type || qb.collectionType || 'Random'),
          collect_timing:String(item?.collect_timing || 'NOW'),
          collection_date:collectionDate,
          collection_time:collectionTime
        };
      });
  }
  trackQuickBarcodeEventItem(_i:number, ev:any) { return ev?.item_key || _i; }
  private quickSetItemCollectionEvent(item:any, patch:any) {
    const qb = this.quickBarcodeState();
    if (!qb) return;
    const key = this.quickItemKey(item);
    if (!key) return;
    qb.itemCollectionEvents = { ...(qb.itemCollectionEvents || {}) };
    const current = qb.itemCollectionEvents[key] || { collection_date: qb.collectionDate || '', collection_time: qb.collectionTime || '' };
    qb.itemCollectionEvents[key] = { ...current, ...patch };
    qb.error = '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }
  onQuickBarcodeItemCollectionDateChange(item:any, value:string) { this.quickSetItemCollectionEvent(item, { collection_date:String(value || '').trim() }); }
  onQuickBarcodeItemCollectionTimeChange(item:any, value:string) { this.quickSetItemCollectionEvent(item, { collection_time:String(value || '').trim() }); }
  onQuickBarcodeDefaultDateTimeChange() {
    const qb = this.quickBarcodeState();
    if (!qb) return;
    qb.error = '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }

  quickBarcodeSelectOnlyGroup(group:any) {
    const qb = this.quickBarcodeState();
    if (!qb || !group) return;
    qb.selectedItemKeys = (group.items || []).filter((x:any)=>!this.quickItemGenerated(x)).map((x:any)=>this.quickItemKey(x)).filter(Boolean);
    qb.error = '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }
  selectedQuickBarcodeSpecimen(): any {
    const qb = this.quickBarcodeState();
    if (!qb) return null;
    return (qb.state?.specimens || []).find((x:any)=>x.key === qb.selectedSpecimenKey) || null;
  }
  quickCollectionTests(c:any): string { return (c?.items || []).map((x:any)=>x.test_name).filter(Boolean).slice(0,4).join(', ') + ((c?.items || []).length > 4 ? '…' : ''); }
  quickFlatItems(): any[] { const qb = this.quickBarcodeState(); return qb?.state?.flat_items || qb?.state?.items || []; }
  quickBarcodeItemParentName(item:any): string {
    const sourceName = String(item?.source_profile_name || '').trim();
    if (sourceName) return sourceName;
    const profileName = String(item?.profile_name || item?.master_name || item?.group_name || item?.panel_name || item?.package_name || '').trim();
    if (profileName) return profileName;
    return 'Individual tests';
  }
  private quickBarcodeItemGroupKey(item:any): string {
    const sourceId = item?.source_profile_id || item?.profile_id || item?.master_id || item?.group_id || item?.panel_id || item?.package_id || '';
    const sourceName = this.quickBarcodeItemParentName(item);
    if (sourceId) return `P|${String(sourceId)}`;
    return `I|${sourceName.toUpperCase()}`;
  }
  quickBarcodeItemGroups(): any[] {
    const map = new Map<string, any>();
    for (const item of this.quickFlatItems()) {
      const key = this.quickBarcodeItemGroupKey(item);
      if (!map.has(key)) map.set(key, { key, name:this.quickBarcodeItemParentName(item), items:[] });
      map.get(key).items.push(item);
    }
    return Array.from(map.values());
  }
  private quickBarcodeGroupPendingItems(group:any): any[] { return (group?.items || []).filter((x:any)=>!this.quickItemGenerated(x)); }
  quickBarcodeGroupPendingCount(group:any): number { return this.quickBarcodeGroupPendingItems(group).length; }
  quickBarcodeGroupGeneratedCount(group:any): number { return (group?.items || []).filter((x:any)=>this.quickItemGenerated(x)).length; }
  quickBarcodeGroupSelectedCount(group:any): number { return this.quickBarcodeGroupPendingItems(group).filter((x:any)=>this.quickItemSelected(x)).length; }
  quickBarcodeGroupAllSelected(group:any): boolean { const pending = this.quickBarcodeGroupPendingItems(group); return !!pending.length && pending.every((x:any)=>this.quickItemSelected(x)); }
  quickBarcodeGroupSomeSelected(group:any): boolean { const n = this.quickBarcodeGroupSelectedCount(group); const t = this.quickBarcodeGroupPendingCount(group); return n > 0 && n < t; }
  quickBarcodeGroupAnySelected(group:any): boolean { return this.quickBarcodeGroupSelectedCount(group) > 0 || this.quickBarcodeGroupGeneratedCount(group) > 0; }
  toggleQuickBarcodeGroup(group:any, checked:boolean) {
    const qb = this.quickBarcodeState();
    if (!qb) return;
    const set = new Set(qb.selectedItemKeys || []);
    for (const item of this.quickBarcodeGroupPendingItems(group)) {
      const key = this.quickItemKey(item);
      if (!key) continue;
      checked ? set.add(key) : set.delete(key);
    }
    qb.selectedItemKeys = Array.from(set);
    qb.error = '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }
  quickBarcodeGroupSpecimenSummary(group:any): string {
    const names = Array.from(new Set((group?.items || []).map((item:any)=>{
      const sp = this.quickResolvedItemSpecimen(item) || this.quickBarcodeItemSpecimens(item)[0];
      return String(sp?.name || sp?.specimen_name || item?.specimen_name || '').trim();
    }).filter(Boolean)));
    if (!names.length) return '-';
    if (names.length === 1) return String(names[0]);
    return `${names.length} specimens`;
  }
  quickBarcodeGroupCollectionSummary(group:any): string {
    const labels = Array.from(new Set((group?.items || []).map((item:any)=>`${item?.collection_type || 'Random'} · ${item?.collect_timing || 'NOW'}`)));
    if (!labels.length) return '-';
    if (labels.length === 1) return String(labels[0]);
    return `${labels.length} collection types`;
  }
  quickBarcodeGroupDateSummary(group:any): string {
    const labels = Array.from(new Set((group?.items || []).map((item:any)=>this.quickBarcodeItemDateTime(item)).filter((x:string)=>x && x !== '-')));
    if (!labels.length) return '-';
    if (labels.length === 1) return String(labels[0]);
    return `${labels.length} timings`;
  }
  quickBarcodeGroupBlocked(group:any): boolean { return this.quickBarcodeGroupPendingItems(group).some((item:any)=>this.quickBarcodeItemBlocked(item)); }
  quickBarcodeGroupStatus(group:any): string {
    if (this.quickBarcodeGroupBlocked(group)) return 'Select specimen';
    const pending = this.quickBarcodeGroupPendingCount(group);
    const selected = this.quickBarcodeGroupSelectedCount(group);
    const generated = this.quickBarcodeGroupGeneratedCount(group);
    if (!pending && generated) return 'Generated';
    return `${selected}/${pending} selected`;
  }
  quickItemKey(item:any): string { return String(item?.item_key || item?.id || item?.test_id || ''); }
  quickSpecimenKey(s:any): string { const rawKey = String(s?.key || '').trim(); if (rawKey) return rawKey; const id = +s?.id || +s?.specimen_type_id || 0; return id ? `ID:${id}` : `NAME:${String(s?.name || s?.specimen_name || 'Specimen').trim().toUpperCase()}`; }
  quickSpecimenOptionValue(s:any): any { const id = +s?.id || +s?.specimen_type_id || 0; return id || this.quickSpecimenKey(s); }
  quickItemGenerated(item:any): boolean { return !!String(item?.sample_id || item?.barcode || '').trim(); }
  quickPendingItems(): any[] { return this.quickFlatItems().filter(x => !this.quickItemGenerated(x)); }
  quickPendingItemCount(): number { return this.quickPendingItems().length; }
  quickItemSelected(item:any): boolean { const qb = this.quickBarcodeState(); return !!qb && (qb.selectedItemKeys || []).includes(this.quickItemKey(item)); }
  quickSelectedItemCount(): number { const qb = this.quickBarcodeState(); if (!qb) return 0; const pending = new Set(this.quickPendingItems().map(x => this.quickItemKey(x))); return (qb.selectedItemKeys || []).filter((k:string)=>pending.has(k)).length; }
  quickAllItemsSelected(): boolean { const items = this.quickPendingItems(); return !!items.length && this.quickSelectedItemCount() === items.length; }
  quickSomeItemsSelected(): boolean { const n = this.quickSelectedItemCount(); const total = this.quickPendingItems().length; return n > 0 && n < total; }
  toggleQuickBarcodeAllItems(checked:boolean) { const qb = this.quickBarcodeState(); if (!qb) return; qb.selectedItemKeys = checked ? this.quickPendingItems().map((x:any)=>this.quickItemKey(x)).filter(Boolean) : []; qb.error = ''; this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb)); }
  toggleQuickBarcodeItem(item:any, checked:boolean) { const qb = this.quickBarcodeState(); if (!qb || this.quickItemGenerated(item)) return; const key = this.quickItemKey(item); const set = new Set(qb.selectedItemKeys || []); checked ? set.add(key) : set.delete(key); qb.selectedItemKeys = Array.from(set); qb.error = ''; this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb)); }
  quickBarcodeItemSpecimens(item:any): any[] {
    const opts = Array.isArray(item?.specimen_options) ? item.specimen_options : [];
    const list = opts.length ? opts : [{ id:+item?.specimen_type_id || 0, name:item?.specimen_name || 'Specimen' }];
    const seen = new Set<string>();
    return list.map((s:any)=>({ key:String(s?.key || '').trim(), id:+s?.id || +s?.specimen_type_id || 0, name:String(s?.name || s?.specimen_name || item?.specimen_name || 'Specimen').trim() || 'Specimen' }))
      .filter((s:any)=>{ const key = this.quickSpecimenKey(s); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  quickSelectedSpecimenKeyForItem(item:any): string {
    const qb = this.quickBarcodeState();
    const key = this.quickItemKey(item);
    const specimens = this.quickBarcodeItemSpecimens(item);
    if (!qb || !key) return specimens.length === 1 ? this.quickSpecimenKey(specimens[0]) : '';
    const selected = qb.selectedItemSpecimenKeys?.[key] || '';
    if (selected) return selected;
    return specimens.length === 1 ? this.quickSpecimenKey(specimens[0]) : '';
  }
  quickSpecimenModelValue(item:any): any {
    const specimens = this.quickBarcodeItemSpecimens(item);
    if (specimens.length <= 1) return specimens[0] ? this.quickSpecimenOptionValue(specimens[0]) : 0;
    const selectedKey = this.quickSelectedSpecimenKeyForItem(item);
    if (!selectedKey) return 0;
    const selected = specimens.find((s:any)=>this.quickSpecimenKey(s) === selectedKey);
    return selected ? this.quickSpecimenOptionValue(selected) : 0;
  }
  onQuickBarcodeItemSpecimenChange(item:any, specimenValue:any) {
    const qb = this.quickBarcodeState();
    if (!qb || this.quickItemGenerated(item)) return;
    const itemKey = this.quickItemKey(item);
    const specimens = this.quickBarcodeItemSpecimens(item);
    const found = specimens.find((s:any)=>String(this.quickSpecimenOptionValue(s)) === String(specimenValue));
    qb.selectedItemSpecimenKeys = { ...(qb.selectedItemSpecimenKeys || {}) };
    if (found) {
      item.specimen_type_id = this.quickSpecimenOptionValue(found);
      item.specimen_name = found.name;
      qb.selectedItemSpecimenKeys[itemKey] = this.quickSpecimenKey(found);
    } else {
      item.specimen_type_id = 0;
      item.specimen_name = '';
      delete qb.selectedItemSpecimenKeys[itemKey];
    }
    qb.error = '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
  }
  private quickResolvedItemSpecimen(item:any): any {
    const specimens = this.quickBarcodeItemSpecimens(item);
    if (specimens.length === 1) return specimens[0];
    const selectedKey = this.quickSelectedSpecimenKeyForItem(item);
    return specimens.find((s:any)=>this.quickSpecimenKey(s) === selectedKey) || null;
  }
  quickBarcodeItemBlocked(item:any): boolean { return !this.quickItemGenerated(item) && this.quickItemSelected(item) && this.quickBarcodeItemSpecimens(item).length > 1 && !this.quickSelectedSpecimenKeyForItem(item); }
  quickBarcodeItemStatus(item:any): string { if (this.quickItemGenerated(item)) return 'Generated'; if (this.quickBarcodeItemBlocked(item)) return 'Select specimen'; return 'Pending'; }
  quickBarcodeItemDateTime(item:any): string { return String(item?.collection_datetime || [item?.collection_date, item?.collection_time].filter(Boolean).join(' ') || item?.expected_collect_at || '-'); }
  private quickSelectedPendingItems(): any[] { const qb = this.quickBarcodeState(); if (!qb) return []; const keys = new Set(qb.selectedItemKeys || []); return this.quickPendingItems().filter(x => keys.has(this.quickItemKey(x))); }
  private quickCollectionForItem(item:any, specimenKey:string): any {
    const qb = this.quickBarcodeState();
    const sp = (qb?.state?.specimens || []).find((x:any)=>x.key === specimenKey);
    const key = this.quickItemKey(item);
    return (sp?.collections || []).find((c:any)=>(c.items || []).some((it:any)=>this.quickItemKey(it) === key)) || null;
  }

  private quickConfiguredCollectionKey(item:any): string {
    if (!this.quickHasConfiguredCollectionType(item)) return '';
    return [String(item?.collection_type || item?.sample_type || 'Random').trim().toUpperCase(), String(item?.collect_timing || 'NOW').trim().toUpperCase(), String(item?.expected_collect_at || '').trim(), String(item?.collection_datetime || '').trim()].join('|');
  }
  private quickConfiguredCollectionLabel(item:any): string {
    const type = String(item?.collection_type || item?.sample_type || 'Random').trim() || 'Random';
    const timing = String(item?.collect_timing || 'NOW').trim() || 'NOW';
    const expected = String(item?.expected_collect_at || item?.collection_datetime || '').trim();
    return [type, timing, expected].filter(Boolean).join(' · ');
  }
  private quickHasConfiguredCollectionType(item:any): boolean {
    if (item?.collection_type_preconfigured === true || item?.collection_type_preconfigured === 1) return true;
    const rule = String(item?.collection_rule || '').trim().toUpperCase();
    if (rule && rule !== 'NORMAL' && rule !== 'RANDOM' && rule !== 'NONE') return true;
    const timing = String(item?.collect_timing || '').trim().toUpperCase();
    if (timing && timing !== 'NOW') return true;
    if (String(item?.expected_collect_at || '').trim()) return true;
    return false;
  }
  private quickSelectionContext(): any {
    const qb = this.quickBarcodeState();
    const items = this.quickSelectedPendingItems();
    if (!items.length) return { ok:false, error:'Select at least one pending item.' };
    const itemSpecimens:any[] = [];
    const itemCollectionEvents:any[] = [];
    for (const item of items) {
      const specimens = this.quickBarcodeItemSpecimens(item);
      const resolved = this.quickResolvedItemSpecimen(item);
      if (specimens.length > 1 && !resolved) return { ok:false, error:`${item?.test_name || 'Selected test'} has multiple specimens. Select exactly one specimen for this item.` };
      const finalSpecimen = resolved || specimens[0] || item;
      const itemKey = this.quickItemKey(item);
      itemSpecimens.push({ item_key:itemKey, specimen_key:this.quickSpecimenKey(finalSpecimen), specimen_type_id:+finalSpecimen?.id || +finalSpecimen?.specimen_type_id || +item?.specimen_type_id || 0, specimen_name:String(finalSpecimen?.name || finalSpecimen?.specimen_name || item?.specimen_name || 'Specimen') });
      const ev: any = qb?.itemCollectionEvents?.[itemKey] || {};
      itemCollectionEvents.push({ item_key:itemKey, collection_date:String(ev.collection_date || qb?.collectionDate || '').trim(), collection_time:String(ev.collection_time || qb?.collectionTime || '').trim() });
    }
    const configuredItems = items
      .map((item:any)=>({ item, key:this.quickConfiguredCollectionKey(item), label:this.quickConfiguredCollectionLabel(item) }))
      .filter((x:any)=>!!x.key);
    const collectionKeys = Array.from(new Set(configuredItems.map((x:any)=>x.key)));
    if (collectionKeys.length > 1) {
      return { ok:false, error:this.quickPrettyCollectionConflictMessage(configuredItems) };
    }
    return { ok:true, specimenKey:'', collectionKey:String(collectionKeys[0] || ''), collection:null, itemSpecimens, itemCollectionEvents };
  }
  quickBarcodeValidationMessage(): string { const qb = this.quickBarcodeState(); return qb?.validationMessage || ''; }
  quickSelectedCollectionLabel(): string { const qb = this.quickBarcodeState(); const sp = this.selectedQuickBarcodeSpecimen(); const col = (sp?.collections || []).find((c:any)=>c.key === qb?.selectedCollectionKey); return col ? `${col.collection_type || 'Random'} · ${col.collect_timing || 'NOW'}` : 'Select one'; }
  selectQuickBarcodeSpecimen(key:string) {
    const qb = this.quickBarcodeState(); if (!qb) return;
    qb.selectedSpecimenKey = key;
    const sp = (qb.state?.specimens || []).find((x:any)=>x.key === key);
    const first = (sp?.collections || [])[0];
    qb.selectedCollectionKey = first?.key || '';
    if (first?.collection_type) qb.collectionType = ['Random','Fasting','Post-prandial','Timed'].includes(first.collection_type) ? first.collection_type : 'Other';
    qb.manualCollectionType = qb.collectionType === 'Other' ? (first?.collection_type || '') : '';
    this.quickBarcodeState.set({...qb});
  }
  selectQuickBarcodeCollection(c:any) {
    const qb = this.quickBarcodeState(); if (!qb) return;
    qb.selectedCollectionKey = c?.key || '';
    const ct = String(c?.collection_type || 'Random');
    qb.collectionType = ['Random','Fasting','Post-prandial','Timed'].includes(ct) ? ct : 'Other';
    qb.manualCollectionType = qb.collectionType === 'Other' ? ct : '';
    this.quickBarcodeState.set({...qb});
  }
  async openQuickBarcode(row:any, mode:'GENERATE'|'RESET') {
    if (!this.quickReporting) return;
    const api:any = window.limsApi as any;
    if (!api.quickBarcodeState) { this.showError('Quick Reporting barcode service is not available in this build.'); return; }
    const parts = this.quickNowParts();
    const emptyState = { total:0, generated_count:0, pending_count:0, specimens:[], flat_items:[], items:[], generated_collections:[] };
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState({ mode, row, state:emptyState, selectedSpecimenKey:'', selectedCollectionKey:'', collectionDate:parts.date, collectionTime:parts.time, collectionType:'Random', manualCollectionType:'', selectedItemKeys:[], selectedItemSpecimenKeys:{}, itemCollectionEvents:{}, error:'', loading:true, step:1 } as any));
    let state:any = null;
    try {
      state = await Promise.race([
        api.quickBarcodeState(row.id),
        new Promise((_, reject)=>setTimeout(()=>reject(new Error('Barcode details did not load. Backend did not respond within 8 seconds.')), 8000))
      ]);
    } catch (err:any) {
      const current = this.quickBarcodeState();
      if (current) this.quickBarcodeState.set({...current, loading:false, error:err?.message || String(err || 'Unable to load barcode details.')});
      return;
    }
    if (!state) {
      const current = this.quickBarcodeState();
      if (current) this.quickBarcodeState.set({...current, loading:false, error:'Unable to load barcode details. Empty response from backend.'});
      return;
    }
    const specimens = state.specimens || [];
    const generated = state.generated_collections || [];
    if (mode === 'GENERATE' && state.total > 0 && state.generated_count >= state.total) {
      const current = this.quickBarcodeState();
      if (current) this.quickBarcodeState.set({...current, state, loading:false, error:'Barcode already generated for all samples in this bill. Please use Reset Barcode if you want to regenerate.'});
      return;
    }
    if (mode === 'RESET' && !generated.length) {
      const current = this.quickBarcodeState();
      if (current) this.quickBarcodeState.set({...current, state, loading:false, error:'No barcode generated to reset.'});
      return;
    }
    const sp = specimens[0] || null;
    const firstPending = ((state.flat_items || state.items || []) as any[]).find((x:any)=>!(x.sample_id || x.barcode)) || null;
    const col = mode === 'RESET' ? (generated[0] || null) : null;
    const defaultCollectionType = mode === 'RESET' ? (col?.collection_type || 'Random') : (firstPending?.collection_type || firstPending?.sample_type || 'Random');
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState({ mode, row, state, selectedSpecimenKey: mode === 'RESET' ? (sp?.key || '') : '', selectedCollectionKey: mode === 'RESET' ? (col?.key || '') : '', collectionDate: parts.date, collectionTime: parts.time, collectionType: defaultCollectionType && ['Random','Fasting','Post-prandial','Timed'].includes(defaultCollectionType) ? defaultCollectionType : (defaultCollectionType ? 'Other' : 'Random'), manualCollectionType: defaultCollectionType && !['Random','Fasting','Post-prandial','Timed'].includes(defaultCollectionType) ? defaultCollectionType : '', selectedItemKeys:(state.flat_items || state.items || []).filter((x:any)=>!(x.sample_id || x.barcode)).map((x:any)=>String(x.item_key || x.id || x.test_id || '')).filter(Boolean), selectedItemSpecimenKeys:{}, itemCollectionEvents:{}, error:'', loading:false, step:1 } as any));
  }
  async confirmQuickBarcodeGenerate() {
    const qb = this.quickBarcodeState(); if (!qb) return;
    qb.error = '';
    const collectionType = qb.collectionType === 'Other' ? String(qb.manualCollectionType || '').trim() : qb.collectionType;
    const ctx = this.quickSelectionContext();
    if (!ctx.ok) { qb.error = ctx.error; this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb)); return; }
    if (!collectionType) { qb.error = 'Collection type is required.'; this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb)); return; }
    qb.selectedSpecimenKey = ctx.specimenKey || '';
    qb.selectedCollectionKey = ctx.collectionKey || '';
    this.quickBarcodeState.set(this.recomputeQuickBarcodeState(qb));
    const api:any = window.limsApi as any;
    const result = await this.runAction(async()=>api.quickBarcodeGenerate(qb.row.id, { collection_key:ctx.collectionKey, item_keys:qb.selectedItemKeys, item_specimens:ctx.itemSpecimens || [], item_collection_events:ctx.itemCollectionEvents || [], collection_date:qb.collectionDate, collection_time:qb.collectionTime, collection_type:collectionType }), 'Unable to generate barcode.');
    if (!result) return;
    this.quickBarcodeState.set(null);
    await this.loadReports();
    this.showSuccess(`Barcode generated. Sample ${result.sample_id || result.sample_ids || ''} assigned to ${result.affected_count || 0} item(s).`);
  }
  async confirmQuickBarcodeReset(all:boolean) {
    const qb = this.quickBarcodeState(); if (!qb) return;
    qb.error = '';
    if (!all && !qb.selectedCollectionKey) { qb.error = 'Please select which collection to revert.'; this.quickBarcodeState.set({...qb}); return; }
    const ok = await this.askInlineConfirm({ title: all ? 'Reset all barcode collections?' : 'Reset selected collection?', message: all ? 'This will revert all Quick Reporting barcode/sample details for this bill.' : 'This will revert only the selected Quick Reporting collection.', details:'Result values and report typing data will not be cleared.', confirmText: all ? 'Reset all' : 'Reset selected', cancelText:'Cancel' });
    if (!ok) return;
    const api:any = window.limsApi as any;
    const result = await this.runAction(async()=>api.quickBarcodeReset(qb.row.id, all ? { mode:'ALL' } : { collection_key:qb.selectedCollectionKey }), 'Unable to reset barcode.');
    if (!result) return;
    this.quickBarcodeState.set(null);
    await this.loadReports();
    this.showSuccess(`Barcode reset for ${result.affected_count || 0} item(s).`);
  }

  async reload() { await this.loadReports(); }

  private dateRangeStorageKey(status: ReportQueueStatus = this.reportStatus): string {
    const mode = this.quickReporting ? 'quick' : 'normal';
    return `lims.reportTyping.dateRange.${mode}.${String(status || 'DRAFT').toUpperCase()}`;
  }

  private validInputDate(value: any): string {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }

  private restoreDateRangeForStatus(status: ReportQueueStatus = this.reportStatus) {
    try {
      const raw = localStorage.getItem(this.dateRangeStorageKey(status));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const today = DateTimeSettingsService.nowInputValue().slice(0, 10);
      const savedOn = this.validInputDate(parsed?.savedOn);
      let from = this.validInputDate(parsed?.fromDate);
      let to = this.validInputDate(parsed?.toDate);
      // Roll yesterday's default one-day filter forward, but preserve intentional custom/history ranges.
      if (savedOn && savedOn !== today && from === savedOn && to === savedOn) {
        from = today;
        to = today;
      }
      if (from) this.fromDate = from;
      if (to) this.toDate = to;
      this.queueFilterForm.patchValue({fromDate:this.fromDate,toDate:this.toDate},{emitEvent:false});
      this.saveDateRangeForStatus(status);
    } catch {}
  }

  private saveDateRangeForStatus(status: ReportQueueStatus = this.reportStatus) {
    try {
      localStorage.setItem(this.dateRangeStorageKey(status), JSON.stringify({
        fromDate: this.validInputDate(this.fromDate),
        toDate: this.validInputDate(this.toDate),
        savedOn: DateTimeSettingsService.nowInputValue().slice(0, 10)
      }));
    } catch {}
  }


  openDatePicker(event: Event) {
    const input = event.currentTarget as HTMLInputElement | null;
    if (!input || input.disabled) return;
    try {
      const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
      if (typeof picker === 'function') picker.call(input);
    } catch { input.focus(); }
  }

  onDateFilterChanged() {
    this.saveDateRangeForStatus(this.reportStatus);
    this.pendingSummarySelected.clear();
    if (this.dateReloadTimer) window.clearTimeout(this.dateReloadTimer);
    this.dateReloadTimer = window.setTimeout(() => { void this.loadReports(); }, 120);
  }

  async loadReports() {
    await this.runAction(async () => {
      const settings = await window.limsApi.getSettings();
      const nextQuickReporting = String(settings['quickReporting.enabled'] || 'false').toLowerCase() === 'true';
      const quickModeChanged = nextQuickReporting !== this.quickReporting;
      this.quickReporting = nextQuickReporting;
      if (this.quickReporting && !['DRAFT','APPROVED'].includes(this.reportStatus)) this.reportStatus = 'DRAFT';
      if (!this.dateRangeRestored || quickModeChanged) {
        this.restoreDateRangeForStatus(this.reportStatus);
        this.dateRangeRestored = true;
      }
      const rows = await window.limsApi.listReports('');
      this.reports.set((Array.isArray(rows) ? rows : []).map(r => ({...r, status: this.normalizeStatus(r.status)})));
      const api:any = window.limsApi as any;
      const logs = api.listReportLogs ? await api.listReportLogs({ from: this.fromDate || '1900-01-01', to: this.toDate || '2999-12-31' }) : [];
      this.reportLogs.set(Array.isArray(logs) ? logs : []);
    }, 'Unable to load reports.');
  }

  setReportStatus(status: ReportQueueStatus) {
    if (status === 'RECHECK') status = 'DRAFT';
    if (this.quickReporting && !['DRAFT','APPROVED'].includes(status)) status = 'DRAFT';
    this.saveDateRangeForStatus(this.reportStatus);
    this.reportStatus = status;
    this.restoreDateRangeForStatus(this.reportStatus);
    this.pendingSummarySelected.clear();
    if (status === 'TYPED' || status === 'APPROVED') this.reportQueueView = 'BILL';
    void this.loadReports();
  }
  canGroupReportQueue(): boolean {
    if (this.quickReporting) return this.reportStatus === 'APPROVED';
    return this.reportStatus === 'TYPED' || this.reportStatus === 'APPROVED';
  }
  setReportQueueView(mode: 'BILL' | 'REPORT') { this.reportQueueView = mode; this.queueExpanded.clear(); this.pendingSummarySelected.clear(); }
  isBillGroupedQueueRow(r:any): boolean { return !!(r?._bill_group || r?._approved_bill_group); }
  isRecheckEntryLocked(r:any): boolean { return (+r?.recheck_count || 0) > 0 && (+r?.ready_for_entry_count || 0) === 0; }

  async openReport(ref: any, status?: string) {
    const source = typeof ref === 'object' && ref ? ref : null;
    const id = +(source?.id ?? ref ?? 0);
    const groupKey = source?.queue_group_key || '';
    if (!id) return;
    if (!this.quickReporting && String(status || this.reportStatus || '').toUpperCase() === 'DRAFT' && this.isEntryLocked(source)) { this.showError('Result entry is locked until Collection receives the outsource result.'); return; }
    if (String(status || this.reportStatus || '').toUpperCase() === 'RECHECK' && this.isRecheckEntryLocked(source)) { this.showError('Outsource recheck entry is locked until Collection dispatch is completed and vendor result is received.'); return; }

    const requestedStatus = String(status || this.reportStatus || source?.status || '').toUpperCase();
    const queueStatus = String(this.reportStatus || source?.status || requestedStatus || '').toUpperCase();

    // Important: the Waiting Approval pencil button opens the report for editing,
    // but the row still belongs to the TYPED / waiting-approval queue.  The old
    // code passed DRAFT and then filtered for pending items, so edited results
    // could throw "No collected reportable tests found" even though entered
    // items were present.  Keep ENTRY workspace, but filter the items as TYPED.
    const filterStatus = queueStatus === 'TYPED' && requestedStatus === 'DRAFT'
      ? 'TYPED'
      : (queueStatus === 'APPROVED' && requestedStatus === 'DRAFT'
        ? 'APPROVED'
        : (requestedStatus || queueStatus || 'DRAFT'));

    const report = await this.runAction(async () => {
      const raw = await window.limsApi.getReport(id);
      if (!raw?.id) throw new Error('Report not found. Refresh Reporting and try again.');

      let vm = this.toReportVm(raw);
      this.filterReportItemsForQueue(vm, filterStatus, groupKey, source);

      // Waiting approval / approved reports are report-level actions.  If a stale
      // or over-specific collection workflow key filters everything out, fall
      // back to the full report-level status filter instead of showing a wrong
      // collection workflow error.
      if (!this.reportableItems(vm).length && false && groupKey && ['TYPED', 'ENTERED', 'WAITING_APPROVAL', 'APPROVED'].includes(filterStatus)) {
        const fallbackVm = this.toReportVm(raw);
        this.filterReportItemsForQueue(fallbackVm, filterStatus, '', source);
        if (this.reportableItems(fallbackVm).length) {
          vm = fallbackVm;
          this.snackBar.open('Opened the full report because this collection group has no matching reportable rows.', 'OK', {
            duration: 4500,
            horizontalPosition: 'right',
            verticalPosition: 'top',
            panelClass: ['reporting-snack', 'reporting-snack-info']
          });
        }
      }

      if (!this.reportableItems(vm).length) {
        throw new Error(
          ['TYPED', 'ENTERED', 'WAITING_APPROVAL', 'APPROVED'].includes(filterStatus)
            ? 'No reportable entered results found for this report. Refresh Reporting or check whether the report items were cancelled/reopened.'
            : 'No collected reportable tests found for this collection type / workflow.'
        );
      }
      if (this.reportableItems(vm).length > 800) throw new Error(`Too many report items (${this.reportableItems(vm).length}). Check duplicated profile/group configuration.`);
      return vm;
    }, 'Unable to open report.');
    if (!report) return;
    this.recheckEntryMode = requestedStatus === 'RECHECK';
    if (this.recheckEntryMode) this.prepareRecheckSelection(report);
    this.selectedReport.set(report);
    const currentStatus = this.normalizeStatus(requestedStatus || report.status);
    this.workspaceMode.set(this.recheckEntryMode ? 'ENTRY' : currentStatus === 'APPROVED' ? 'APPROVED' : currentStatus === 'TYPED' ? 'APPROVE' : 'ENTRY');
    this.setCriticalNotice(report);
  }
  async openFinishedReportForEdit(ref:any) {
    await this.openReport(ref, 'DRAFT');
    const report = this.selectedReport();
    if (!report) return;
    this.prepareEntrySelection(report);
    this.refreshSelectedState(report);
    this.workspaceMode.set('ENTRY');
  }

  closeReport() { this.recheckEntryMode = false; this.selectedReport.set(null); this.criticalNotice.set(''); this.errorMessage.set(''); this.historyState.set(null); this.pdfPreview.set(null); this.reopenState.set(null); this.rejectState.set(null); void this.loadReports(); }
  editResults() { const r = this.selectedReport(); if (r) { this.prepareEntrySelection(r); this.refreshSelectedState(r); } this.workspaceMode.set('ENTRY'); }

  async quickFinishSelected() {
    const report = this.selectedReport(); if (!report) return;
    this.refreshSelectedState(report);
    if (!report.selectedCount) { this.showError('Select at least one test before saving finished report.'); return; }
    const groupError = this.validateSelectedReportGroup(report); if (groupError) { this.showError(groupError); return; }
    const saved = await this.saveReportWithStatus(report, 'APPROVED', 'Unable to save finished report.');
    if (!saved) return;
    this.selectedReport.set(null);
    this.workspaceMode.set('ENTRY');
    this.reportStatus = 'APPROVED';
    await this.loadReports();
    this.changed.emit();
    this.showSuccess('Finished report saved. Remaining tests stay pending.');
  }

  async quickSingleTestPlacementOption(id:number): Promise<'TOP' | 'DEPARTMENT'> {
    try {
      const raw = await window.limsApi.getReport(id);
      const items = Array.isArray(raw?.items) ? raw.items : [];
      const tests = items.filter((x:any)=>x?.test_id);
      const hasProfileTests = tests.some((x:any)=>String(x?.source_profile_name || '').trim() || +(x?.source_profile_id || 0));
      const hasSingleTests = tests.some((x:any)=>!String(x?.source_profile_name || '').trim() && !(+(x?.source_profile_id || 0)));
      if (hasProfileTests && hasSingleTests) {
        const below = window.confirm('This report has profile tests and single tests.\n\nPress OK to print single tests BELOW the profiles.\nPress Cancel to print single tests ABOVE the profiles.');
        return below ? 'DEPARTMENT' : 'TOP';
      }
    } catch {}
    return 'DEPARTMENT';
  }
  async quickPrint(id:number, withBackground:boolean) {
    const single_test_placement = await this.quickSingleTestPlacementOption(id);
    const api:any = window.limsApi as any;
    if (api.approvedReportPrint) {
      await this.safeOpenPath(() => api.approvedReportPrint(id, { withBackground, single_test_placement }));
      return;
    }
    await this.safeOpenPath(() => window.limsApi.printReport(id, withBackground));
  }
  async quickExport(id:number, withBackground:boolean) {
    const single_test_placement = await this.quickSingleTestPlacementOption(id);
    const api:any = window.limsApi as any;
    if (api.approvedReportPdfExport) {
      await this.safeExportPath(() => api.approvedReportPdfExport(id, { withBackground, single_test_placement }));
      return;
    }
    await this.safeExportPath(() => window.limsApi.reportPdf(id, withBackground));
  }
  async quickDeleteFinished(id:number) {
    const ok = await this.askInlineConfirm({ title:'Delete finished report?', message:'This will remove this finished report and return its tests to Pending.', details:'Only this report entry is affected. Other finished reports for the same bill stay finished.', confirmText:'Delete report', cancelText:'Cancel' });
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.quickDeleteReport) { this.showError('Quick report delete action is not available in this build.'); return; }
    const result = await this.runAction(async()=>api.quickDeleteReport(id, 'Deleted from Finished Reports'), 'Unable to delete finished report.');
    if (!result) return;
    this.selectedReport.set(null);
    this.workspaceMode.set('ENTRY');
    this.reportStatus = 'DRAFT';
    await this.loadReports(); this.changed.emit(); this.showSuccess('Finished report deleted. Its tests are back in Pending.');
  }

  async saveResultDraft() {
    const report = this.selectedReport(); if (!report) return;
    this.refreshSelectedState(report);
    if (!report.selectedCount) { this.showError('Select at least one test to save as draft.'); return; }
    const groupError = this.validateSelectedReportGroup(report); if (groupError) { this.showError(groupError); return; }
    const saved = await this.saveReportWithStatus(report, 'DRAFT', 'Unable to save result draft.');
    if (!saved) return;
    if (this.quickReporting && String(report.report_scope || '').toUpperCase() === 'QUICK' && String(report.status || '').toUpperCase() === 'APPROVED' && +report.id > 0) {
      this.selectedReport.set(saved);
      this.workspaceMode.set('APPROVED');
      this.reportStatus = 'APPROVED';
      await this.loadReports();
      this.changed.emit();
      this.showSuccess('Finished report updated.');
      return;
    }

    // Save Draft keeps the result as draft/pending, then returns the user to the
    // Pending Results stepper/list.  It must never move to Waiting Approval or
    // open the approve/review stepper.  The saved draft can be reopened from
    // Pending Results for continued entry.
    this.selectedReport.set(null);
    this.workspaceMode.set('ENTRY');
    this.recheckEntryMode = false;
    this.reportStatus = 'DRAFT';
    await this.loadReports();
    this.changed.emit();
    this.showSuccess('Draft saved in Pending Results.');
  }
  async submitForApproval() {
    const report = this.selectedReport(); if (!report) return;
    this.refreshSelectedState(report);
    if (!report.selectedCount) { this.showError('Select at least one test before submitting for approval.'); return; }
    const groupError = this.validateSelectedReportGroup(report); if (groupError) { this.showError(groupError); return; }
    const saved = await this.saveReportWithStatus(report, 'TYPED', 'Unable to submit results for approval.');
    if (!saved) return;
    if (this.quickReporting && String(report.report_scope || '').toUpperCase() === 'QUICK' && String(report.status || '').toUpperCase() === 'APPROVED' && +report.id > 0) {
      this.selectedReport.set(saved);
      this.workspaceMode.set('APPROVED');
      this.reportStatus = 'APPROVED';
      await this.loadReports();
      this.changed.emit();
      this.showSuccess('Finished report updated.');
      return;
    }

    // Submit should move the selected items to the Waiting Approval queue, but it
    // must not auto-open the approve/review stepper.  Auto-navigation to approve
    // caused users to think that simple result entry/save was already approval.
    // Keep approval as a separate queue action.
    this.selectedReport.set(null);
    this.workspaceMode.set('ENTRY');
    this.reportStatus = 'TYPED';
    await this.loadReports();
    this.changed.emit();
    this.showSuccess('Results submitted to Waiting Approval.');
  }

  async saveResultsEntered() {
    // Any legacy "results entered" action is now a draft save only.
    // It must not submit to approval and must not navigate to the approve stepper.
    await this.saveResultDraft();
  }
  async saveReportWithStatus(report: ReportVm, status: ReportQueueStatus, fallback: string, extra: any = {}): Promise<ReportVm | null> {
    return await this.runAction(async () => {
      // IMPORTANT: save/submit/approve must touch only the rows the user selected.
      // A physical sample can contain in-house, outsource and recheck tests together;
      // approving selected in-house tests must never approve the remaining tests in the
      // same sample/specimen/profile. Unselected rows stay in their current queue.
      const selectedItems = this.reportableItems(report).filter((x:any) => x.selected_for_entry === true);
      const payload = {...report, ...extra, recheck_entry_mode: this.recheckEntryMode, items: selectedItems, status};
      const raw = await window.limsApi.saveReport(payload);
      return this.toReportVm(raw);
    }, fallback);
  }
  async verifyApproveReport() {
    const report = this.selectedReport(); if (!report) return;
    const groupError = this.validateSelectedReportGroup(report); if (groupError) { this.showError(groupError); return; }
    const saved = await this.saveReportWithStatus(report, 'APPROVED', 'Unable to verify and approve report.');
    if (!saved) return; this.selectedReport.set(saved); await this.loadReports(); this.changed.emit(); this.workspaceMode.set('APPROVED'); this.setCriticalNotice(saved);
  }
  async viewReportPdf(report: ReportVm) {
    if (!report?.id) { this.showError('Report not found. Refresh Reporting and try again.'); return; }
    const preview = await this.runAction(async () => {
      if (window.limsApi.reportPdfData) {
        const generated = await window.limsApi.reportPdfData(report.id, false);
        if (!generated?.dataUrl) throw new Error('No PDF preview was generated.');
        return generated.dataUrl + '#toolbar=0&navpanes=0&scrollbar=1';
      }
      const generated = await window.limsApi.reportPdf(report.id, false);
      if (!generated) throw new Error('No PDF was generated.');
      const normalized = String(generated).replace(/\\/g,'/');
      const fileUrl = normalized.startsWith('file:') ? normalized : `file:///${encodeURI(normalized)}`;
      return fileUrl + '#toolbar=0&navpanes=0&scrollbar=1';
    }, 'Unable to generate PDF preview.');
    if (!preview) return;
    this.pdfPreview.set({title: `${report.bill_no || 'Report'} preview`, url: this.sanitizer.bypassSecurityTrustResourceUrl(preview)});
  }
  async viewPdfFromQueue(id: number) {
    if (!id) return;
    const report = await this.runAction(async () => {
      const raw = await window.limsApi.getReport(id);
      if (!raw?.id) throw new Error('Report not found. Refresh Reporting and try again.');
      const vm = this.toReportVm(raw);
      if (!this.reportableItems(vm).length) throw new Error('No reportable items found for PDF preview.');
      return vm;
    }, 'Unable to load report for preview.');
    if (report) await this.viewReportPdf(report);
  }
  async removePendingReportFromQueue(id: number) {
    if (!id) { this.showError('Report not found. Refresh Reporting and try again.'); return; }
    const ok = await this.askInlineConfirm({
      title: 'Remove pending report?',
      message: 'This removes only the untouched pending report record from Reporting.',
      details: 'Use this before rejecting/deleting a freshly collected sample. Collection and specimen data stay safe; only untouched pending report items are removed.',
      confirmText: 'Remove pending report',
      cancelText: 'Cancel'
    });
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.removePendingReport) { this.showError('Remove pending report action is not available in this build.'); return; }
    const result = await this.runAction(async()=>api.removePendingReport(id, {reason:'Removed from Pending Results before collection reject/delete'}), 'Unable to remove pending report.');
    if (!result) return;
    await this.loadReports(); this.changed.emit(); this.showSuccess('Pending report removed. You can now reject/delete the collection if needed.');
  }

  async startRejectFromQueue(id: number) {
    if (!id) { this.showError('Report not found. Refresh Reporting and try again.'); return; }
    const report = await this.runAction(async () => {
      const raw = await window.limsApi.getReport(id);
      if (!raw?.id) throw new Error('Report not found. Refresh Reporting and try again.');
      return this.toReportVm(raw);
    }, 'Unable to open report rejection.');
    if (report) this.openRejectModal(report);
  }
  openRejectModal(report: ReportVm) { this.rejectState.set({report, mode:'ENTRY', reason:'', error:''}); this.focusReportModalTextarea('reject'); }
  async confirmRejectReport() {
    const state = this.rejectState(); if (!state) return;
    const reason = String(state.reason || '').trim();
    if (!reason) { this.rejectState.set({...state, error:'Reject reason is required.'}); return; }
    const api:any = window.limsApi as any;
    if (!api.rejectReport) { this.rejectState.set({...state, error:'Reject report action is not available in this build.'}); return; }
    const result = await this.runAction(async()=>api.rejectReport(+state.report.id, {mode: state.mode, reason}), 'Unable to reject report.');
    if (!result) { this.rejectState.set({...state, error:'Unable to reject report. Please refresh and try again.'}); return; }
    this.rejectState.set(null); this.selectedReport.set(null); this.workspaceMode.set('ENTRY'); this.recheckEntryMode=false;
    await this.loadReports(); this.changed.emit();
    this.reportStatus = state.mode === 'RECHECK' ? 'RECHECK' : 'DRAFT';
    this.showSuccess(state.mode === 'RECOLLECTION' ? 'Report rejected and tests moved to Pending Collection.' : 'Report rejected and sent back to result entry.');
  }

  selectedEntryItems(report: ReportVm): any[] { return this.reportableItems(report).filter((x:any)=>x.selected_for_entry === true); }
  hasSelectedRecheckItems(report: ReportVm): boolean { return this.selectedEntryItems(report).some((x:any)=>String(x?.recheck_mode || 'NONE').toUpperCase() !== 'NONE'); }
  openBulkRecheck(report: ReportVm) {
    const items = this.selectedEntryItems(report);
    if (!items.length) { this.showError('Select at least one test for recheck.'); return; }
    this.recheckRequestState.set({ report, items, mode:'INHOUSE', vendor_id:0, reason:'', error:'' });
  }
  async confirmBulkRecheck() {
    const state = this.recheckRequestState(); if (!state) return;
    const reason = String(state.reason || '').trim();
    if (!reason) { this.recheckRequestState.set({...state, error:'Recheck remarks are required.'}); return; }
    const mode = String(state.mode || 'INHOUSE').toUpperCase();
    const vendorRequired = mode === 'OUTSOURCE' || mode === 'BOTH';
    if (vendorRequired && !(+state.vendor_id || 0)) { this.recheckRequestState.set({...state, error:'Vendor is required for outsource recheck.'}); return; }
    const payload = {
      report_id: +state.report.id,
      report_item_ids: state.items.map((x:any)=>+x.id).filter(Boolean),
      recheck_mode: mode,
      recheck_vendor_id: vendorRequired ? (+state.vendor_id || 0) : null,
      recheck_remarks: reason,
      item_remarks: state.items.map((x:any)=>({ report_item_id:+x.id, remarks:String(x.recheck_remarks || '').trim() }))
    };
    const api:any = window.limsApi as any;
    if (!api.requestReportRecheck) { this.recheckRequestState.set({...state, error:'Recheck request action is not available in this build.'}); return; }
    const result = await this.runAction(async()=>api.requestReportRecheck(payload), 'Unable to save recheck request.');
    if (!result) return;
    this.recheckRequestState.set(null); this.selectedReport.set(null); this.workspaceMode.set('ENTRY'); this.reportStatus='RECHECK'; this.recheckEntryMode=false;
    await this.loadReports(); this.changed.emit();
    this.showSuccess(vendorRequired ? 'Selected tests split into a new outsource recheck report. Result entry is locked until vendor result is received.' : 'Selected tests split into a new in-house recheck report.');
  }
  async revertSelectedRecheck(report: ReportVm) {
    const items = this.selectedEntryItems(report).filter((x:any)=>String(x?.recheck_mode || 'NONE').toUpperCase() !== 'NONE');
    if (!items.length) { this.showError('Select recheck test(s) to revert.'); return; }
    const ok = await this.askInlineConfirm({ title:'Revert recheck?', message:`This will revert recheck for ${items.length} selected test(s) only.`, details:'The selected recheck item(s) will be cancelled and restored back to the original report. Original result values are preserved.', confirmText:'Revert selected recheck', cancelText:'Cancel' });
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.revertReportRecheck) { this.showError('Revert recheck action is not available in this build.'); return; }
    const result = await this.runAction(async()=>api.revertReportRecheck({ report_id:+report.id, report_item_ids:items.map((x:any)=>+x.id).filter(Boolean), reason:'Recheck reverted from Reporting' }), 'Unable to revert recheck.');
    if (!result) return;
    this.selectedReport.set(null); this.workspaceMode.set('ENTRY'); this.recheckEntryMode=false;
    await this.loadReports(); this.changed.emit(); this.showSuccess('Selected recheck item(s) reverted back to the original report.');
  }

  async rejectRecheckFromQueue(id: number) {
    if (!id) { this.showError('Recheck report not found. Refresh Reporting and try again.'); return; }
    const report = await this.runAction(async () => {
      const raw = await window.limsApi.getReport(id);
      if (!raw?.id) throw new Error('Recheck report not found. Refresh Reporting and try again.');
      return this.toReportVm(raw);
    }, 'Unable to open recheck rejection.');
    if (!report) return;
    const items = (report.safeItems || report.items || []).filter((x:any)=>this.isPendingRecheckItem(x));
    const ok = await this.askInlineConfirm({
      title:'Reject recheck?',
      message: items.length
        ? `This will reject/revert ${items.length} recheck test(s) and restore them back to report pending.`
        : 'This will reject/revert the active recheck test(s) in this child recheck report and restore them back to report pending.',
      details:'If this is an outsource recheck, its child outsource collection will be cancelled/removed from active outsource collection. Normal collection/report flows are not changed.',
      confirmText:'Reject recheck',
      cancelText:'Cancel'
    });
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.revertReportRecheck) { this.showError('Reject recheck action is not available in this build.'); return; }
    const result = await this.runAction(async()=>api.revertReportRecheck({ report_id:+report.id, report_item_ids:items.map((x:any)=>+x.id).filter(Boolean), reason:'Recheck rejected from Pending Rechecks' }), 'Unable to reject recheck.');
    if (!result) return;
    this.selectedReport.set(null); this.workspaceMode.set('ENTRY'); this.recheckEntryMode=false; this.reportStatus='DRAFT';
    await this.loadReports(); this.changed.emit(); this.showSuccess('Recheck rejected. Selected test(s) restored to report pending and removed from active outsource recheck collection.');
  }

  async startCorrectionFromQueue(id: number) {
    const report = await this.runAction(async () => this.toReportVm(await window.limsApi.getReport(id)), 'Unable to open report for correction.');
    if (report) this.openCorrectionModal(report);
  }
  openCorrectionModal(report: ReportVm) { this.reopenState.set({report, reason:'', error:''}); this.focusReportModalTextarea('reopen'); }
  async confirmReopenCorrection() {
    const state = this.reopenState(); if (!state) return;
    const reason = String(state.reason || '').trim();
    if (!reason) { this.reopenState.set({...state, error:'Correction reason is required.'}); return; }
    const api:any = window.limsApi as any;
    if (!api.reopenApprovedReportForCorrection) { this.reopenState.set({...state, error:'Correction reopen action is not available in this build.'}); return; }
    const saved = await this.runAction(async()=>api.reopenApprovedReportForCorrection(+state.report.id, { reason }), 'Unable to reopen report for correction.');
    if (!saved) return;
    this.reopenState.set(null);
    this.selectedReport.set(null);
    this.workspaceMode.set('ENTRY');
    this.reportStatus = 'TYPED';
    await this.loadReports();
    this.changed.emit();
    this.showSuccess('Approved report reopened for correction in Waiting Approval. No new report was created.');
  }
  validateSelectedReportGroup(report: ReportVm): string {
    const selected = this.reportableItems(report).filter((x:any)=>x.selected_for_entry === true);

    // Report typing/submission boundary is now the real workflow report id.
    // A single report can legitimately contain multiple physical specimens collected
    // in the same session, same workflow mode, and same vendor/timing.  Do not block
    // submission just because sample/specimen ids differ; each item still carries its
    // specimen id for traceability/integration.
    const reportIds = Array.from(new Set(selected
      .map((x:any)=>+(x.report_id || x.source_report_id || x.parent_report_id || report?.id || 0))
      .filter((id:number)=>id > 0)));
    if (reportIds.length > 1) return 'Selected tests belong to more than one report. Open one report at a time and submit again.';
    return '';
  }
  reportTypingGroupKey(x:any): string {
    // Kept only for older callers/debugging.  The active validation above uses report id,
    // not specimen id, because same-report multi-specimen submission is valid.
    const reportId = String(+(x.report_id || x.source_report_id || x.parent_report_id || 0));
    const mode = this.normalizedGroupPart(x.collection_mode || (this.isOutsourceItem(x) ? 'OUTSOURCE' : 'INHOUSE'));
    const vendor = String(+(x.outsource_vendor_id || x.vendor_id || 0));
    return `${reportId}|${mode}|${vendor}`;
  }
  onVendorMethodChange(report: ReportVm, item:any) {
    if (!item.vendor_result_method) item.vendor_result_method = 'ENTER_VALUES';
    if (item.vendor_result_method === 'ATTACH_REPORT_ONLY') {
      item.final_result_source = 'VENDOR_REPORT';
      if (String(item.vendor_report_file || '').trim()) item.result_value = 'See attached vendor report';
    } else if (item.final_result_source === 'VENDOR_REPORT') {
      item.final_result_source = this.truthy(item.internal_check_required) ? 'INTERNAL_CHECK' : 'OUTSOURCE';
      if (item.result_value === 'See attached vendor report') item.result_value = '';
    }
    this.refreshSelectedState(report);
  }
  onVendorReportRefChange(report: ReportVm, item:any) {
    item.vendor_report_status = String(item.vendor_report_file || '').trim() ? 'RECEIVED' : 'PENDING';
    if (item.vendor_result_method === 'ATTACH_REPORT_ONLY' && item.vendor_report_status === 'RECEIVED') item.result_value = 'See attached vendor report';
    this.refreshSelectedState(report);
  }
  pendingWarningText(report:any): string {
    const pending = this.pendingItemsForBill(report);
    return pending.length ? `${pending.length} test/profile item(s) are still pending for this bill. Approved report actions will include approved reports only.` : '';
  }
  pendingItemsForBill(report:any): any[] {
    const items = (this.queueDetailReport(report) || report)?.safeItems || report?.items || [];
    return (items || []).filter((x:any)=>x?.test_id && this.isPendingResultItem(x)).map((x:any)=>({label:`${x.source_profile_name ? x.source_profile_name + ': ' : ''}${x.test_name || 'Pending test'}`}));
  }
  approvedActionTitle(action: ApprovedAction): string { return action==='PDF' ? 'Export PDF' : action==='PRINT' ? 'Print' : action==='EMAIL' ? 'Email' : action==='WHATSAPP' ? 'WhatsApp' : action==='SMS' ? 'SMS' : 'View'; }
  approvedActionButton(action: ApprovedAction): string { return action==='PDF' ? 'Export selected' : action==='PRINT' ? 'Print selected' : action==='EMAIL' ? 'Email selected' : action==='WHATSAPP' ? 'WhatsApp selected' : action==='SMS' ? 'Send SMS' : 'View selected'; }
  async startApprovedAction(id:number, action: ApprovedAction) {
    const source = await this.runAction(async()=>this.toReportVm(await window.limsApi.getReport(id)), 'Unable to prepare approved report action.');
    if (!source) return;
    const sameBill = (this.reports() || []).filter((r:any)=>String(r.bill_no || '') === String(source.bill_no || ''));
    const defaultPrintGrouping: 'BILL' | 'REPORT' = this.reportQueueView === 'REPORT' ? 'REPORT' : 'BILL';
    const approved = sameBill.filter((r:any)=>(+r.approved_count || 0) > 0 || this.normalizeStatus(r.status)==='APPROVED').map((r:any)=>({ ...r, selected: defaultPrintGrouping === 'BILL' || +r.id === +source.id, status:'APPROVED', report_no: r.report_no || `RPT${String(r.id).padStart(4,'0')}`, item_count: (+r.approved_count || 0) || this.reportCompletedCount(r) || r.item_count || 0 }));
    if (!approved.some((r:any)=>+r.id === +source.id) && (this.normalizeStatus(source.status)==='APPROVED' || this.reportableItems(source).some((x:any)=>this.isApprovedResultItem(x)))) approved.unshift({ ...source, selected:true, status:'APPROVED', report_no:`RPT${String(source.id).padStart(4,'0')}`, item_count:this.reportableItems(source).filter((x:any)=>this.isApprovedResultItem(x)).length || this.reportableItems(source).length });
    const pending = this.reportableItems(source).filter((x:any)=>this.isPendingResultItem(x)).map((x:any)=>({label:`${x.source_profile_name ? x.source_profile_name + ': ' : ''}${x.test_name}`}));
    let signatures:any[] = [];
    try {
      const settings:any = await window.limsApi.getSettings();
      const parsed = JSON.parse(String(settings?.['report.simple.signatureRowsJson'] || '[]'));
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.signatures) ? parsed.signatures : [];
      signatures = rows.filter((x:any)=>x && x.enabled !== false).map((x:any,index:number)=>({
        id:String(x.id ?? index), sourceIndex:index, selected:true,
        label:String(x.label || x.name || (Array.isArray(x.lines) ? x.lines.map((line:any)=>String(line?.text || '').trim()).filter(Boolean)[0] : '') || `Signature ${index + 1}`),
        hasImage:!!String(x.imagePath || x.signatureImagePath || '').trim()
      }));
    } catch { signatures = []; }
    this.approvedActionState.set({ action, sourceReportId:id, reports:approved, pending, showProfileName:true, showSubHeader:true, withBackground:true, signatures, mergeMode:defaultPrintGrouping === 'BILL' ? 'MERGE' : 'SEPARATE', printGrouping:defaultPrintGrouping, singleTestPlacement:'DEPARTMENT', error:'' });
  }
  approvedSelectedCount(state:any): number { return (state?.reports || []).filter((r:any)=>r.selected && r.status === 'APPROVED').length; }
  approvedSignatureControl(sign:any): FormControl { return this.fieldControl(sign,'selected') as FormControl; }
  moveApprovedReport(state:any, index:number, direction:number) {
    const next = index + direction;
    if (!state || next < 0 || next >= state.reports.length) return;
    const rows = [...state.reports];
    [rows[index], rows[next]] = [rows[next], rows[index]];
    this.approvedActionState.set({...state, reports:rows});
  }
  async quickDeleteFinishedGroup(row:any) {
    const ids:number[] = this.reportQueueView === 'BILL' && Array.isArray(row?._approved_report_ids) ? row._approved_report_ids.map((x:any)=>+x).filter((x:number)=>x>0) : [+this.primaryApprovedReportId(row)].filter((x:number)=>x>0);
    if (!ids.length) return;
    const ok = await this.askInlineConfirm({ title:ids.length > 1 ? 'Delete finished reports for this bill?' : 'Delete finished report?', message:ids.length > 1 ? `This will delete ${ids.length} finished reports and return their tests to Pending.` : 'This will remove this finished report and return its tests to Pending.', details:ids.length > 1 ? 'All finished reports currently grouped under this bill will be affected.' : 'Other finished reports for the same bill stay finished.', confirmText:ids.length > 1 ? 'Delete reports' : 'Delete report', cancelText:'Cancel' });
    if (!ok) return;
    const api:any = window.limsApi as any;
    if (!api.quickDeleteReport) { this.showError('Quick report delete action is not available in this build.'); return; }
    const result = await this.runAction(async()=>{ for (const id of ids) await api.quickDeleteReport(id, 'Deleted from Finished Reports'); return true; }, 'Unable to delete finished report(s).');
    if (!result) return;
    await this.loadReports(); this.changed.emit(); this.showSuccess(`${ids.length} finished report${ids.length===1?'':'s'} deleted. Tests are back in Pending.`);
  }
  async confirmApprovedAction() {
    const state = this.approvedActionState(); if (!state) return;
    const selected = (state.reports || []).filter((r:any)=>r.selected && r.status === 'APPROVED');
    if (!selected.length) { this.approvedActionState.set({...state, error:'Select at least one approved report.'}); return; }
    const opts = { show_profile_name:state.showProfileName, show_sub_header:state.showSubHeader, show_header:true, withBackground:state.withBackground, signature_ids:(state.signatures || []).filter((x:any)=>x.selected).map((x:any)=>String(x.id)), show_signatures:(state.signatures || []).some((x:any)=>x.selected), merge_mode:state.mergeMode, single_test_placement:state.singleTestPlacement, report_ids:selected.map((r:any)=>+r.id) };
    if (state.action === 'VIEW') { this.approvedActionState.set(null); await this.safeOpenPath(() => (window.limsApi as any).approvedReportPdfExport(+selected[0].id, opts)); return; }
    if (state.action === 'PDF') {
      this.approvedActionState.set(null);
      if (state.mergeMode === 'SEPARATE' && selected.length > 1) {
        await this.runAction(async()=>{ for (const report of selected) await (window.limsApi as any).approvedReportPdfExport(+report.id, {...opts, report_ids:[+report.id], merge_mode:'SEPARATE'}); return true; }, 'Unable to export selected reports separately.');
        await this.afterDeliveryAction(`${selected.length} report PDFs exported separately.`);
      } else {
        await this.safeExportPath(() => (window.limsApi as any).approvedReportPdfExport(+selected[0].id, opts));
        await this.afterDeliveryAction('PDF exported. Report delivery status updated.');
      }
      return;
    }
    if (state.action === 'PRINT') {
      this.approvedActionState.set(null);
      if (state.mergeMode === 'SEPARATE') {
        await this.runAction(async()=>{
          for (const report of selected) {
            await (window.limsApi as any).approvedReportPrint(+report.id, {
              show_profile_name: state.showProfileName,
              show_sub_header: state.showSubHeader,
              show_header: true,
              withBackground: state.withBackground,
              signature_ids: (state.signatures || []).filter((x:any)=>x.selected).map((x:any)=>String(x.id)),
              show_signatures: (state.signatures || []).some((x:any)=>x.selected),
              merge_mode: 'SEPARATE',
              single_test_placement: state.singleTestPlacement
            });
          }
          return true;
        }, 'Unable to print selected reports separately.');
        await this.afterDeliveryAction(`${selected.length} report${selected.length === 1 ? '' : 's'} opened separately for printing.`);
      } else {
        await this.safeOpenPath(() => (window.limsApi as any).approvedReportPrint(+selected[0].id, {...opts, merge_mode:'MERGE'}));
        await this.afterDeliveryAction('Bill-wise report opened for printing. Report print status updated.');
      }
      return;
    }
    if (state.action === 'EMAIL') { this.approvedActionState.set(null); await this.runDeliveryAction(async()=> (window.limsApi as any).approvedReportEmail(+selected[0].id, opts), 'Email handoff opened. Report email status updated.'); return; }
    if (state.action === 'WHATSAPP') { this.approvedActionState.set(null); await this.runDeliveryAction(async()=> (window.limsApi as any).approvedReportWhatsapp(+selected[0].id, opts), 'WhatsApp handoff opened. Report WhatsApp status updated.'); return; }
    if (state.action === 'SMS') { this.approvedActionState.set(null); await this.runDeliveryAction(async()=> (window.limsApi as any).approvedReportSms(+selected[0].id, opts), 'SMS handoff opened. Report SMS status updated.'); return; }
  }

  async reportPdf(id:number,bg:boolean){ await this.safeOpenPath(() => window.limsApi.reportPdf(id,bg)); }
  async reportExcel(id:number){ await this.safeOpenPath(() => window.limsApi.reportExcel(id)); }
  async printReport(id:number){ await this.safeOpenPath(() => window.limsApi.printReport(id)); }
  async approvedPdfExport(id:number){ await this.safeExportPath(() => (window.limsApi as any).approvedReportPdfExport(id)); await this.afterDeliveryAction('PDF exported. Report delivery status updated.'); }
  async approvedPrint(id:number){ await this.safeOpenPath(() => (window.limsApi as any).approvedReportPrint(id)); await this.afterDeliveryAction('Print opened. Report print status updated.'); }
  async approvedEmail(id:number){ await this.runDeliveryAction(async()=> (window.limsApi as any).approvedReportEmail(id), 'Email handoff opened. Report email status updated.'); }
  async approvedSms(id:number){ await this.runDeliveryAction(async()=> (window.limsApi as any).approvedReportSms(id), 'SMS handoff opened. Report SMS status updated.'); }
  async runDeliveryAction(action:()=>Promise<any>, message:string){ await this.runAction(async()=>{ const result=await action(); if(result?.file) await window.limsApi.openPath(result.file); return result; }, 'Unable to complete approved report delivery action.'); await this.afterDeliveryAction(message); }
  async afterDeliveryAction(message:string){ await this.loadReports(); const current=this.selectedReport(); if(current?.id){ const raw=await this.runAction(async()=>window.limsApi.getReport(current.id),'Unable to refresh report delivery status.'); if(raw) this.selectedReport.set(this.toReportVm(raw)); } this.changed.emit(); window.setTimeout(()=>this.showSuccess(message), 0); }
  async safeOpenPath(action:()=>Promise<string>){ await this.runAction(async()=>{ const filePath=await action(); if(!filePath) throw new Error('No file was generated.'); await window.limsApi.openPath(filePath); }, 'Unable to open generated file.'); }
  async safeExportPath(action:()=>Promise<string>){ await this.runAction(async()=>{ const filePath=await action(); if(!filePath) throw new Error('No file was generated.'); const folder = String(filePath).replace(/[\\/][^\\/]*$/, ''); await window.limsApi.openPath(folder || filePath); }, 'Unable to export report PDF.'); }

  toReportVm(raw:any): ReportVm { const report: ReportVm = {...(raw || {})} as ReportVm; report.status = this.normalizeStatus(report.status); report.safeItems = this.cleanItems(raw?.items || []); this.prepareEntrySelection(report); this.refreshSelectedState(report); return report; }
  cleanItems(items:any[]): any[] {
    const seen = new Set<string>();
    return (Array.isArray(items) ? items : [])
      .filter(x => x && x.selected_for_reporting !== false && +x.selected_for_reporting !== 0)
      .map((x,i) => {
        const heading = !x.test_id;
        const item:any = {...x, _key:`${x.id || 'row'}-${x.test_id || 'head'}-${i}`, _isHeading: heading, test_name:x.test_name || x.name || (heading ? 'Profile' : 'Test'), department_name:x.department_name || '', selected_for_entry:x.selected_for_entry, recheck_mode:x.recheck_mode || 'NONE'};
        if (!heading && this.optionEngine.accepts(item)) item.optionsValue = this.optionEngine.options(item);
        return item;
      })
      .filter(x => { const key = String(x.id || x._key); if (seen.has(key)) return false; seen.add(key); return true; })
      .sort((a,b) => (+a.group_order_override || +a.priority || 0) - (+b.group_order_override || +b.priority || 0) || (+a.report_order_override || +a.priority || 0) - (+b.report_order_override || +b.priority || 0) || (+a.id || 0) - (+b.id || 0));
  }
  isMovedToRecheckOriginal(x:any): boolean {
    return !!x && +x.is_recheck_item !== 1 && (
      +x.excluded_from_approval === 1 ||
      +x.moved_to_recheck_report_id > 0 ||
      String(x.status || '').toUpperCase() === 'MOVED_TO_RECHECK'
    );
  }
  reportableItems(report: ReportVm): any[] { return (report.safeItems || []).filter((x:any)=>x && x.test_id && !x._isHeading && !this.isMovedToRecheckOriginal(x)); }
  prepareEntrySelection(report: ReportVm) {
    // In edit/result-entry mode, keep all reportable rows selected by default.
    // Users can still deselect tests that must be typed later. Previously entered
    // rows should not appear disabled/unselected when the user clicks Edit Results.
    this.reportableItems(report).forEach((x:any)=>{
      x.selected_for_entry = true;
      if (!x.final_result_source) x.final_result_source = this.isOutsourceItem(x) ? 'OUTSOURCE' : 'MANUAL';
      if (!x.recheck_mode) x.recheck_mode = 'NONE';
      if (!x.vendor_result_method) x.vendor_result_method = x.vendor_report_file ? 'ATTACH_REPORT_ONLY' : 'ENTER_VALUES';
    });
  }
  prepareRecheckSelection(report: ReportVm) {
    this.reportableItems(report).forEach((x:any)=>{
      const pending = this.isPendingRecheckItem(x);
      x.selected_for_entry = pending;
      if (!x.final_result_source) x.final_result_source = this.isOutsourceItem(x) ? 'OUTSOURCE' : 'MANUAL';
    });
    this.refreshSelectedState(report);
  }
  isPendingRecheckItem(x:any): boolean {
    const mode = String(x?.recheck_mode || 'NONE').toUpperCase();
    const recheckStatus = String(x?.recheck_status || '').toUpperCase();
    const resultStatus = String(x?.result_status || '').toUpperCase();
    const isRecheckRow = mode !== 'NONE' || +x?.is_recheck_item === 1 || +x?.original_report_item_id > 0 || +x?.source_report_item_id > 0;
    const inactive = ['DONE','REVERTED','RECHECK_REVERTED','RECHECK_REJECTED','CANCELLED','APPROVED','FINALIZED'].includes(recheckStatus)
      || ['CANCELLED','APPROVED','FINALIZED'].includes(resultStatus);
    return isRecheckRow && !inactive;
  }
  refreshSelectedState(report: ReportVm) { const items = this.reportableItems(report); report.selectedCount = items.filter((x:any)=>x.selected_for_entry === true).length; report.safeSections = this.buildSections(report.safeItems); report.completionPercent = this.calcCompletion(items); report.criticalList = items.filter((x:any)=>this.truthy(x.is_critical)); report.abnormalList = items.filter((x:any)=>!!this.flagText(x) && !this.truthy(x.is_critical)); }
  buildSections(rows:any[]): ReportSection[] {
    // Group cards by billed profile/group source. Parameter headings like Proteins/Enzymes
    // are inner headings and never define the outer draggable card.
    const sections: ReportSection[] = [];
    const byKey = new Map<string, ReportSection>();
    let single: ReportSection | null = null;
    const sourceOrder = new Map<string, number>();

    const ensureSingle = (item:any) => {
      if (!single) {
        single = {
          key: 'single-tests',
          name: 'Single tests',
          items: [],
          entered: 0,
          itemCount: 0,
          order: +(item?.group_order_override || item?.priority || 999000),
          kind: 'SINGLE'
        };
        sections.push(single);
      }
      return single;
    };

    const ensureProfile = (item:any) => {
      const name = String(item?.source_profile_name || item?.profile_name || item?.group_name || '').trim();
      if (!name) return ensureSingle(item);
      const key = `profile-${item?.source_profile_id || name}`;
      let section = byKey.get(key);
      if (!section) {
        const order = sourceOrder.get(key) ?? +(item?.group_order_override || item?.priority || sections.length + 1);
        sourceOrder.set(key, order);
        section = { key, name, items: [], entered: 0, itemCount: 0, order, kind: 'PROFILE' };
        byKey.set(key, section);
        sections.push(section);
      }
      return section;
    };

    for (const row of rows || []) {
      if (!row || !row.test_id || row._isHeading) continue;
      const sec = ensureProfile(row);
      sec.items.push(row);
    }

    return sections
      .filter((s: ReportSection) => s.items.length)
      .map((s: ReportSection) => {
        const tests = s.items.filter((x:any)=>x && x.test_id && !x._isHeading);
        return {...s, itemCount: tests.length, entered: tests.filter((x:any)=>!!String(x.result_value || '').trim()).length};
      })
      .sort((a: ReportSection,b: ReportSection)=>{
        // Respect the billing/report configured order. Do not force "Single tests"
        // before profiles, because profile-owned interpretation rows must stay visually
        // with their profile card order instead of being pushed after/before unrelated tests.
        const d = (a.order || 0) - (b.order || 0);
        if (d) return d;
        if (a.kind === 'SINGLE' && b.kind !== 'SINGLE') return 1;
        if (a.kind !== 'SINGLE' && b.kind === 'SINGLE') return -1;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }
  calcCompletion(items:any[]): number { if(!items.length) return 0; return Math.round((items.filter(x=>!!String(x.result_value || '').trim()).length / items.length) * 100); }
  setCriticalNotice(report: ReportVm) { const critical = report.criticalList || []; this.criticalNotice.set(critical.length ? 'Critical value alert: ' + critical.map((x:any)=>(x.test_name + ': ' + (x.critical_message || 'Review immediately'))).join(' | ') : ''); }

  onResultValueChange(report: ReportVm, item:any, value:any) { item.result_value = this.normalizeInput(item, value); this.applyClientFlag(item); this.applyFinalSource(report,item); this.recalculateDependentItems(report, item); this.refreshSelectedState(report); this.setCriticalNotice(report); }
  onOutsourceValueChange(report: ReportVm,item:any,value:any){ item.outsource_result_value=this.normalizeInput(item,value); if ((item.final_result_source || 'OUTSOURCE') === 'OUTSOURCE') item.result_value = item.outsource_result_value; this.applyClientFlag(item); this.refreshSelectedState(report); }
  onInternalCheckValueChange(report: ReportVm,item:any,value:any){ item.internal_check_value=this.normalizeInput(item,value); if (item.final_result_source === 'INTERNAL_CHECK') item.result_value = item.internal_check_value; this.applyClientFlag(item); this.refreshSelectedState(report); }
  applyFinalSource(report: ReportVm,item:any){ const src = item.final_result_source || (this.isOutsourceItem(item) ? 'OUTSOURCE' : 'MANUAL'); if (src === 'OUTSOURCE') item.result_value = item.outsource_result_value || item.result_value || ''; else if (src === 'INTERNAL_CHECK') item.result_value = item.internal_check_value || item.result_value || ''; this.applyClientFlag(item); this.refreshSelectedState(report); }
  normalizeInput(item:any,value:any): string {
    let normalized = String(value ?? '');
    if (this.isOptionInput(item) || this.isSearchSelectInput(item)) return normalized;
    if (String(item.result_data_type || 'NUMBER').toUpperCase() === 'NUMBER') {
      normalized = normalized.replace(/[^0-9+\-.]/g, '');
      const parts = normalized.split('.');
      if (parts.length > 2) normalized = parts.shift() + '.' + parts.join('');
    }
    return normalized;
  }
  inputType(item:any): string { const type = String(item.result_data_type || 'NUMBER').toUpperCase(); if (type === 'DATE') return 'date'; if (type === 'TIME') return 'time'; return 'text'; }
  inputMode(item:any): string { return String(item.result_data_type || 'NUMBER').toUpperCase() === 'NUMBER' ? 'decimal' : 'text'; }
  inputPlaceholder(item:any): string { if (this.isSearchSelectInput(item)) return 'Search, select, or type a result'; return String(item.result_data_type || 'NUMBER').toUpperCase() === 'NUMBER' ? 'Numeric value' : 'Enter result'; }

  isOptionInput(item:any): boolean { return this.optionEngine.accepts(item); }
  isSearchSelectInput(item:any): boolean { return this.searchSelectEngine.accepts(item); }
  private reactiveControl(owner:any,key:string,onChange?:(value:any)=>void): FormControl<any> {
    if (!owner || (typeof owner !== 'object' && typeof owner !== 'function')) return new FormControl('');
    let group=this.reactiveGroups.get(owner);
    if (!group) { group=new FormGroup({}); this.reactiveGroups.set(owner,group); }
    let control=group.get(key) as FormControl<any> | null;
    if (!control) {
      control=new FormControl(owner[key] ?? '');
      group.addControl(key,control);
      if (onChange) {
        this.controlCallbacks.set(control,onChange);
        control.valueChanges.subscribe(value=>{
          owner[key]=value;
          this.controlCallbacks.get(control!)?.(value);
        });
      } else control.valueChanges.subscribe(value=>{ owner[key]=value; });
    }
    const external=owner[key] ?? '';
    if (!Object.is(control.value,external)) control.setValue(external,{emitEvent:false});
    return control;
  }
  private setControlDisabled(control:FormControl<any>,disabled:boolean) {
    if (disabled && control.enabled) control.disable({emitEvent:false});
    if (!disabled && control.disabled) control.enable({emitEvent:false});
    return control;
  }
  fieldControl(owner:any,key:string): FormControl<any> { return this.reactiveControl(owner,key); }
  itemFieldControl(report:ReportVm,item:any,key:string,behavior=''): FormControl<any> {
    const control=this.reactiveControl(item,key,value=>{
      if (behavior==='selection') this.refreshSelectedState(report);
      else if (behavior==='vendorMethod') this.onVendorMethodChange(report,item);
      else if (behavior==='vendorReport') this.onVendorReportRefChange(report,item);
      else if (behavior==='outsource') this.onOutsourceValueChange(report,item,value);
      else if (behavior==='internalCheck') this.onInternalCheckValueChange(report,item,value);
      else if (behavior==='finalSource') this.applyFinalSource(report,item);
    });
    const selectionDependent=['unit','normal_range','recheck_remarks'].includes(key) && item.selected_for_entry===false;
    return this.setControlDisabled(control,selectionDependent);
  }
  resultValueControl(report:ReportVm,item:any): FormControl<any> {
    return this.setControlDisabled(this.reactiveControl(item,'result_value',value=>this.onResultValueChange(report,item,value)),this.isResultLocked(item));
  }
  searchResultControl(report:ReportVm,item:any): FormControl<string> {
    let control=this.searchControls.get(item);
    if (!control) {
      control=new FormControl(this.searchDraftValue(report,item),{nonNullable:true});
      control.valueChanges.subscribe(value=>this.onSearchSelectTyping(report,item,value));
      this.searchControls.set(item,control);
    }
    return this.setControlDisabled(control,this.isResultLocked(item)) as FormControl<string>;
  }
  quickSpecimenControl(item:any): FormControl<any> {
    return this.reactiveControl(item,'_quickSpecimenModel',value=>this.onQuickBarcodeItemSpecimenChange(item,value));
  }
  quickFieldControl(qb:any,key:string,behavior=''): FormControl<any> {
    return this.reactiveControl(qb,key,value=>{
      if (behavior==='dateTime') this.onQuickBarcodeDefaultDateTimeChange();
      if (behavior==='collectionType') {
        qb.manualCollectionType=value==='Other' ? qb.manualCollectionType : '';
        const manual=this.reactiveGroups.get(qb)?.get('manualCollectionType');
        if (manual && value!=='Other') manual.setValue('',{emitEvent:false});
      }
    });
  }
  quickEventControl(event:any,key:'collection_date'|'collection_time'): FormControl<any> {
    return this.reactiveControl(event,key,value=>key==='collection_date'
      ? this.onQuickBarcodeItemCollectionDateChange(event.item,value)
      : this.onQuickBarcodeItemCollectionTimeChange(event.item,value));
  }
  approvedReportControl(report:any): FormControl<any> {
    return this.setControlDisabled(this.reactiveControl(report,'selected'),report.status!=='APPROVED');
  }
  resultFieldKey(report:any,item:any): string { return `${report?.id || 'r'}:${item?.id || item?.report_item_id || item?.test_id || item?.test_name || 'x'}`; }
  resultPanelKey(report:any,item:any,type:'option'|'search'): string { return type + ':' + this.resultFieldKey(report,item); }
  panelOpensUp(report:any,item:any,type:'option'|'search'): boolean { return this.resultPanelDirections[this.resultPanelKey(report,item,type)] === 'up'; }
  setResultPanelDirection(key:string, trigger?: HTMLElement) {
    if (!trigger || typeof trigger.getBoundingClientRect !== 'function') { this.resultPanelDirections[key] = 'down'; return; }
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = (window?.innerHeight || 800) - rect.bottom;
    this.resultPanelDirections[key] = (spaceBelow < 170 && rect.top > spaceBelow) ? 'up' : 'down';
  }
  keepResultPickerOpen(event:Event){ event.preventDefault(); event.stopPropagation(); }
  cancelResultPickerDrag(event:Event){ event.preventDefault(); event.stopPropagation(); }
  stopResultOptionClick(event:Event){ event.preventDefault(); event.stopPropagation(); (event as any).stopImmediatePropagation?.(); }

  optionChoices(item:any): ResultOption[] {
    if (!this.isOptionInput(item)) return [];
    if (!Array.isArray(item.optionsValue)) item.optionsValue = this.optionEngine.options(item);
    return item.optionsValue;
  }
  optionChoiceLabel(option:ResultOption): string { return String(option?.label || option?.value || '').trim(); }
  optionChoiceValue(option:ResultOption): string { return String(option?.value || option?.label || '').trim(); }
  optionSelectedValue(item:any): string {
    const option=this.optionEngine.resolve(item,item?.result_value);
    return option ? this.optionChoiceLabel(option) : String(item?.result_value || '').trim();
  }
  trackResultOption(_index:number,option:ResultOption): string {
    const value=String(option?.value || option?.label || '').trim();
    const label=String(option?.label || option?.value || '').trim();
    return `${value}\u0000${label}`;
  }
  optionDraftValue(report:any,item:any): string {
    const key=this.resultFieldKey(report,item);
    return Object.prototype.hasOwnProperty.call(this.resultOptionDrafts,key) ? this.resultOptionDrafts[key] || '' : this.optionSelectedValue(item);
  }
  optionTextControl(report:ReportVm,item:any): FormControl<string> {
    let control=this.optionTextControls.get(item);
    if (!control) {
      control=new FormControl(this.optionDraftValue(report,item),{nonNullable:true});
      control.valueChanges.subscribe(value=>this.onOptionTyping(report,item,value));
      this.optionTextControls.set(item,control);
    }
    return this.setControlDisabled(control,this.isResultLocked(item)) as FormControl<string>;
  }
  isOptionPanelOpen(report:any,item:any): boolean { return this.resultOptionPanelKey===this.resultPanelKey(report,item,'option'); }
  openOptionPanel(report:any,item:any,resetToSelected=false,trigger?:HTMLElement) {
    if (this.isResultLocked(item)) return;
    const panelKey=this.resultPanelKey(report,item,'option');
    if (this.resultPanelCloseTimers[panelKey]) clearTimeout(this.resultPanelCloseTimers[panelKey]);
    if (trigger || !this.resultPanelDirections[panelKey]) this.setResultPanelDirection(panelKey,trigger);
    this.resultOptionPanelKey=panelKey;
    const dataKey=this.resultFieldKey(report,item);
    if (resetToSelected || this.resultOptionDrafts[dataKey]===undefined) {
      const selected=this.optionSelectedValue(item);
      this.resultOptionDrafts[dataKey]=selected;
      this.optionTextControls.get(item)?.setValue(selected,{emitEvent:false});
    }
    const choices=this.filteredOptionChoices(report,item);
    const selectedIndex=choices.findIndex(option=>this.optionChoiceIsSelected(item,option));
    this.resultOptionActiveIndex[panelKey]=selectedIndex >= 0 ? selectedIndex : (choices.length ? 0 : -1);
  }
  closeOptionPanel(report:any,item:any){ const key=this.resultPanelKey(report,item,'option'); if(this.resultOptionPanelKey===key) this.resultOptionPanelKey=''; }
  scheduleCloseOptionPanel(report:any,item:any){ const key=this.resultPanelKey(report,item,'option'); if(this.resultPanelCloseTimers[key]) clearTimeout(this.resultPanelCloseTimers[key]); this.resultPanelCloseTimers[key]=setTimeout(()=>this.closeOptionPanel(report,item),160); }
  onOptionTyping(report:ReportVm,item:any,value:any) {
    const typed=String(value ?? '');
    this.resultOptionDrafts[this.resultFieldKey(report,item)]=typed;
    this.applyCommittedEngineResult(report,item,typed,false);
    this.openOptionPanel(report,item,false);
    const panelKey=this.resultPanelKey(report,item,'option');
    this.resultOptionActiveIndex[panelKey]=this.filteredOptionChoices(report,item).length ? 0 : -1;
  }
  filteredOptionChoices(report:any,item:any): ResultOption[] {
    const options=this.optionChoices(item);
    const query=String(this.optionDraftValue(report,item) || '').trim().toLowerCase();
    const exact=options.some(option=>this.optionChoiceValue(option).toLowerCase()===query || this.optionChoiceLabel(option).toLowerCase()===query);
    if (!query || exact) return options;
    return options.filter(option=>this.optionChoiceValue(option).toLowerCase().includes(query) || this.optionChoiceLabel(option).toLowerCase().includes(query));
  }
  optionChoiceIsSelected(item:any,option:ResultOption): boolean { return this.optionEngine.isSelected(item,option); }

  optionChoiceIsActive(report:any,item:any,option:ResultOption): boolean {
    const choices=this.filteredOptionChoices(report,item);
    const index=choices.findIndex(candidate=>this.trackResultOption(0,candidate)===this.trackResultOption(0,option));
    return index >= 0 && this.resultOptionActiveIndex[this.resultPanelKey(report,item,'option')]===index;
  }
  handleOptionKeydown(event:KeyboardEvent,report:ReportVm,item:any) {
    if (this.isResultLocked(item)) return;
    const key=event.key;
    if (!['ArrowDown','ArrowUp','Enter','Escape'].includes(key)) return;
    const panelKey=this.resultPanelKey(report,item,'option');
    if (key === 'Escape') {
      event.preventDefault();
      this.closeOptionPanel(report,item);
      return;
    }
    if (!this.isOptionPanelOpen(report,item)) this.openOptionPanel(report,item,false,event.currentTarget as HTMLElement);
    const choices=this.filteredOptionChoices(report,item);
    if (!choices.length) return;
    let index=this.resultOptionActiveIndex[panelKey];
    if (!Number.isInteger(index) || index < 0 || index >= choices.length) index=0;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      index=key === 'ArrowDown' ? (index + 1) % choices.length : (index - 1 + choices.length) % choices.length;
      this.resultOptionActiveIndex[panelKey]=index;
      this.scrollActiveOptionIntoView(event.currentTarget as HTMLElement,index);
      return;
    }
    if (key === 'Enter') {
      event.preventDefault();
      this.commitOptionResult(event,report,item,choices[index]);
    }
  }
  private scrollActiveOptionIntoView(input:HTMLElement,index:number) {
    setTimeout(()=>{
      const picker=input.closest('.rt-picker');
      const options=picker?.querySelectorAll<HTMLElement>('.rt-options-panel .rt-option:not(.muted)');
      options?.[index]?.scrollIntoView({block:'nearest'});
    });
  }
  commitOptionResult(event:Event,report:ReportVm,item:any,option:ResultOption) {
    event.preventDefault(); event.stopPropagation(); (event as any).stopImmediatePropagation?.();
    const selected=this.optionEngine.commit(option);
    this.resultOptionDrafts[this.resultFieldKey(report,item)]=selected;
    this.optionTextControls.get(item)?.setValue(selected,{emitEvent:false});
    this.applyCommittedEngineResult(report,item,selected,false);
    this.closeOptionPanel(report,item);
  }

  searchDraftValue(report:any,item:any): string { const key=this.resultFieldKey(report,item); return Object.prototype.hasOwnProperty.call(this.resultSearchDrafts,key) ? this.resultSearchDrafts[key] || '' : this.searchSelectEngine.display(item); }
  isSearchPanelOpen(report:any,item:any): boolean { return this.resultOptionPanelKey === this.resultPanelKey(report,item,'search'); }
  openSearchPanel(report:any,item:any,resetToSelected=false,trigger?:HTMLElement){
    if (this.isResultLocked(item)) return;
    const panelKey=this.resultPanelKey(report,item,'search');
    if(this.resultPanelCloseTimers[panelKey]) clearTimeout(this.resultPanelCloseTimers[panelKey]);
    if(trigger || !this.resultPanelDirections[panelKey]) this.setResultPanelDirection(panelKey,trigger);
    this.resultOptionPanelKey=panelKey;
    const dataKey=this.resultFieldKey(report,item);
    if(resetToSelected || this.resultSearchDrafts[dataKey] === undefined) {
      const selected=this.searchSelectEngine.display(item);
      this.resultSearchDrafts[dataKey]=selected;
      this.searchControls.get(item)?.setValue(selected,{emitEvent:false});
    }
  }
  closeSearchPanel(report:any,item:any){ const key=this.resultPanelKey(report,item,'search'); if(this.resultOptionPanelKey===key) this.resultOptionPanelKey=''; }
  scheduleCloseSearchPanel(report:any,item:any){ const key=this.resultPanelKey(report,item,'search'); if(this.resultPanelCloseTimers[key]) clearTimeout(this.resultPanelCloseTimers[key]); this.resultPanelCloseTimers[key]=setTimeout(()=>this.closeSearchPanel(report,item),160); }
  onSearchSelectTyping(report:ReportVm,item:any,value:any){ const typed=String(value ?? ''); this.resultSearchDrafts[this.resultFieldKey(report,item)]=typed; this.applyCommittedEngineResult(report,item,typed,false); this.openSearchPanel(report,item,false); }
  filteredSearchSelectOptions(report:any,item:any): ResultOption[] { return this.isSearchSelectInput(item) ? this.searchSelectEngine.filter(item,this.searchDraftValue(report,item)) : []; }
  searchChoiceIsSelected(item:any,option:ResultOption): boolean { return this.searchSelectEngine.isSelected(item,option); }
  searchOptionParts(report:any,item:any,option:ResultOption){ return this.searchSelectEngine.parts(item,option,this.searchDraftValue(report,item)); }
  commitSearchSelectResult(event:Event,report:ReportVm,item:any,option:ResultOption){
    event.preventDefault(); event.stopPropagation(); (event as any).stopImmediatePropagation?.();
    if (!this.isSearchSelectInput(item)) return;
    const selected=this.searchSelectEngine.commit(option);
    this.resultSearchDrafts[this.resultFieldKey(report,item)]=selected;
    this.searchControls.get(item)?.setValue(selected,{emitEvent:false});
    this.applyCommittedEngineResult(report,item,selected);
    this.closeSearchPanel(report,item);
  }

  private applyCommittedEngineResult(report:ReportVm,item:any,value:string,rememberDisplayLabel=true){
    item.result_value=value;
    if(rememberDisplayLabel) item._selected_result_label=value;
    else delete item._selected_result_label;
    if(!item.final_result_source) item.final_result_source='MANUAL';
    this.applyClientFlag(item);
    this.refreshSelectedState(report);
    this.setCriticalNotice(report);
  }
  resultLabel(item:any): string { return this.isOutsourceItem(item) ? 'Final result' : 'Result'; }
  isResultLocked(item:any): boolean {
    // Calculated fields must always remain editable. Automatic recalculation may
    // populate the value, but the operator can still correct/override it.
    return this.isOutsourceRecheckAwaitingResult(item);
  }
  isOutsourceRecheckAwaitingResult(item:any): boolean { const mode=String(item?.recheck_mode || 'NONE').toUpperCase(); const status=String(item?.recheck_status || '').toUpperCase(); return (mode==='OUTSOURCE' || mode==='BOTH') && !!status && !['OUTSOURCE_RESULT_RECEIVED','WAITING_RECHECK_ENTRY','DONE','NONE'].includes(status); }
  isOutsourceItem(item:any): boolean { const mode = String(item.collection_mode || '').toUpperCase(); const source = String(item.final_result_source || '').toUpperCase(); return mode.includes('OUTSOURCE') || source === 'OUTSOURCE' || source === 'VENDOR_REPORT' || !!item.outsource_result_value; }
  outsourceMismatch(item:any): boolean { if(!this.truthy(item.internal_check_required)) return false; const a = String(item.outsource_result_value || '').trim(); const b = String(item.internal_check_value || '').trim(); return !!a && !!b && a !== b; }
  flagText(item:any): string { return String(item?.flag_status || '').toUpperCase(); }
  flagIcon(item:any): string { return this.flagStatusIcon(item?.flag_status, item?.is_critical); }
  flagTitle(item:any): string { return this.flagStatusTitle(item?.flag_status, item?.is_critical); }
  flagStatusIcon(status:any, critical:any = false): string {
    const flag = String(status || '').toUpperCase();
    const isCritical = this.truthy(critical);
    if (flag === 'HIGH') return isCritical ? '↑↑' : '↑';
    if (flag === 'LOW') return isCritical ? '↓↓' : '↓';
    return '-';
  }
  flagStatusTitle(status:any, critical:any = false): string {
    const flag = String(status || '').toUpperCase();
    const isCritical = this.truthy(critical);
    if (flag === 'HIGH') return isCritical ? 'Critical high' : 'High';
    if (flag === 'LOW') return isCritical ? 'Critical low' : 'Low';
    return 'Normal';
  }
  applyClientFlag(item:any) {
    const n = Number(String(item.result_value || '').replace(/,/g,'').trim());
    item.is_critical = 0;
    item.critical_message = '';
    if (!Number.isFinite(n)) { item.flag_status = ''; return; }

    // Report Typing must match PDF/backend rules:
    // reference_text / normal_range is display-only and must never be parsed for flags.
    // Use only numeric limits attached from the backend-selected ALL / MALE / FEMALE reference row.
    if (!this.truthy(item?.flag_enabled)) { item.flag_status = ''; return; }

    const low = this.selectedReferenceNumber(item, 'low');
    const high = this.selectedReferenceNumber(item, 'high');
    const cLow = this.selectedReferenceNumber(item, 'critical_low');
    const cHigh = this.selectedReferenceNumber(item, 'critical_high');

    // If no selected reference-row numeric limits are available, do not fall back to
    // reference_low / critical_low / normal_range because those can be derived from display text.
    if (low === null && high === null && cLow === null && cHigh === null) {
      item.flag_status = '';
      return;
    }

    if (cLow !== null && n <= cLow) { item.flag_status = 'LOW'; item.is_critical = 1; item.critical_message = `Critical low: ${n} <= ${cLow}`; return; }
    if (cHigh !== null && n >= cHigh) { item.flag_status = 'HIGH'; item.is_critical = 1; item.critical_message = `Critical high: ${n} >= ${cHigh}`; return; }
    let flag = '';
    if (low !== null && n < low) flag = 'LOW';
    if (high !== null && n > high) flag = 'HIGH';
    item.flag_status = flag;
  }
  selectedReferenceNumber(item:any, key:'low'|'high'|'critical_low'|'critical_high'): number|null {
    const candidates: any[] = key === 'low'
      ? [item?.selected_reference_low, item?.selected_ref_low, item?.selected_reference_lower_limit, item?.selected_ref_lower_limit]
      : key === 'high'
        ? [item?.selected_reference_high, item?.selected_ref_high, item?.selected_reference_upper_limit, item?.selected_ref_upper_limit]
        : key === 'critical_low'
          ? [item?.selected_reference_critical_low, item?.selected_ref_critical_low]
          : [item?.selected_reference_critical_high, item?.selected_ref_critical_high];
    for (const value of candidates) {
      const n = this.numericOrNull(value);
      if (n !== null) return n;
    }
    return null;
  }
  numericOrNull(value:any): number|null { const raw = String(value ?? '').replace(/,/g,'').trim(); if (!raw) return null; const n = Number(raw); return Number.isFinite(n) ? n : null; }
  parseRange(range:any): {low:number|null, high:number|null} { return { low:null, high:null }; }

  calculateItem(report: ReportVm, item:any, silent = false) {
    const predefinedKey = String(item.predefined_formula_key || item.formula_predefined_key || '').trim().toUpperCase();
    if ((predefinedKey === 'EGFR_CKD_EPI_2021' || predefinedKey === 'EGFR_CKD_EPI') || /^EGFR_CKD_EPI(?:_2021)?\s*\(/i.test(String(item.formula_expression || ''))) {
      const vars = this.formulaVariables(item);
      const scrVar = vars.find(v => String(v.variable_key || '').trim().toUpperCase() === 'SCR') || vars[0];
      const source = this.findEgfrCreatinineSource(report, scrVar, item);
      const creatinine = this.numericOrNull(source?.result_value);
      const age = this.patientAgeYears(report);
      if (creatinine === null || creatinine <= 0 || age === null || age < 18) {
        const dependencyName = source?.test_name || (scrVar?.source_test_id ? `selected creatinine test (#${scrVar.source_test_id})` : 'creatinine source test');
        item.formula_status = creatinine === null ? `Missing dependency: ${dependencyName}` : 'eGFR requires patient age 18 years or older';
        if (!silent) this.showError(item.test_name + ': ' + item.formula_status);
        this.refreshSelectedState(report);
        return;
      }
      const female = this.patientIsFemale(report);
      const kappa = female ? 0.7 : 0.9;
      const alpha = female ? -0.241 : -0.302;
      const ratio = creatinine / kappa;
      const calculated = 142 * Math.pow(Math.min(ratio, 1), alpha) * Math.pow(Math.max(ratio, 1), -1.2) * Math.pow(0.9938, age) * (female ? 1.012 : 1);
      item.result_value = this.formatNumberForItem(item, calculated);
      item.formula_status = 'Calculated';
      item.selected_for_entry = item.selected_for_entry === false ? false : true;
      this.applyClientFlag(item);
      this.refreshSelectedState(report);
      this.setCriticalNotice(report);
      return;
    }
    const expr = String(item.formula_expression || '').trim();
    if (!expr) { item.formula_status = 'No formula configured'; this.refreshSelectedState(report); return; }
    const vars = this.formulaVariables(item);
    if (!vars.length) { item.formula_status = 'No formula variables configured'; if (!silent) this.showError(item.test_name + ': no formula variables configured.'); this.refreshSelectedState(report); return; }
    let finalExpr = expr.replace(/\^/g, '**');
    let missing: string[] = [];
    for (const v of vars) {
      const source = this.findFormulaSource(report, v, item);
      const rawValue = String(source?.result_value ?? '').replace(/,/g,'').trim();
      const value = Number(rawValue);
      if (!source || !rawValue || !Number.isFinite(value)) { missing.push(v.variable_key); continue; }
      finalExpr = finalExpr.replace(new RegExp('\\b' + this.escapeRegExp(v.variable_key) + '\\b', 'g'), String(value));
    }
    if (missing.length) { item.formula_status = 'Missing dependency: ' + missing.join(', '); if (!silent) this.showError(item.test_name + ': ' + item.formula_status); this.refreshSelectedState(report); return; }
    if (/[A-Za-z_]/.test(finalExpr)) { item.formula_status = 'Unresolved formula token'; if (!silent) this.showError(item.test_name + ': formula still has unresolved text.'); this.refreshSelectedState(report); return; }
    const calculated = this.safeEval(finalExpr);
    if (calculated === null) { item.formula_status = 'Formula error'; if (!silent) this.showError(item.test_name + ': formula could not be calculated.'); this.refreshSelectedState(report); return; }
    item.result_value = this.formatNumberForItem(item, calculated);
    item.formula_status = 'Calculated';
    item.selected_for_entry = item.selected_for_entry === false ? false : true;
    this.applyClientFlag(item);
    this.refreshSelectedState(report);
    this.setCriticalNotice(report);
  }

  private patientAgeYears(report:any): number|null {
    const direct = this.numericOrNull(report?.age_value ?? report?.patient_age_value);
    const unit = String(report?.age_unit || report?.patient_age_unit || 'YEAR').toUpperCase();
    if (direct !== null) {
      if (unit.startsWith('MONTH')) return direct / 12;
      if (unit.startsWith('DAY')) return direct / 365.25;
      return direct;
    }
    const match = String(report?.age || report?.patient_age || '').match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : null;
  }
  private patientIsFemale(report:any): boolean {
    const gender = String(report?.gender || report?.patient_gender || '').trim().toUpperCase();
    return gender === 'F' || gender.startsWith('FEMALE');
  }
  private recalculateDependentItems(report: ReportVm, changedItem:any) {
    const changedId = +changedItem?.test_id || 0;
    const changedCode = String(changedItem?.test_code || changedItem?.code || '').trim().toUpperCase();
    for (const candidate of this.reportableItems(report)) {
      if (candidate === changedItem || !(candidate?.has_formula || candidate?.formula_expression || candidate?.predefined_formula_key)) continue;
      const vars = this.formulaVariables(candidate);
      const normalize = (v:any) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
      const changedTokens = [changedItem?.test_code, changedItem?.code, changedItem?.test_short_code, changedItem?.test_name, changedItem?.display_name]
        .map(normalize).filter(Boolean);
      const creatinineChanged = changedTokens.some((token:string)=>
        token === 'SCR' || token === 'CREA' || token === 'CREAT' || token === 'CREATININE' ||
        token === 'SCREATININE' || token.includes('SERUMCREATININE')
      );
      const depends = vars.some(v =>
        (+v.source_test_id && +v.source_test_id === changedId) ||
        (!v.source_test_id && normalize(v.variable_key) === normalize(changedCode)) ||
        (normalize(v.variable_key) === 'SCR' && creatinineChanged)
      );
      if (depends) this.calculateItem(report, candidate, true);
    }
  }

  formulaVariables(item:any): {variable_key:string, source_test_id:number}[] {
    const raw = String(item.formula_variables || '').trim();
    if(!raw) return [];
    return raw.split('||').map(p=>{
      const [k,id] = p.split('::');
      return { variable_key:String(k || '').trim(), source_test_id:+id || 0 };
    }).filter(v=>v.variable_key);
  }
  private findEgfrCreatinineSource(report: ReportVm, variable:any, currentItem:any): any {
    const items = this.reportableItems(report).filter((x:any)=>x !== currentItem);

    // Prefer the explicitly saved Test Master dependency when it is available.
    const sourceTestId = +variable?.source_test_id || 0;
    if (sourceTestId) {
      const byId = items.find((x:any)=>+x.test_id === sourceTestId && this.numericOrNull(x.result_value) !== null);
      if (byId) return byId;
    }

    // Older records commonly stored the variable as SCR while the actual test
    // code/name is CREA, CREATININE, S.CREATININE, SERUM CREATININE, etc.
    const normalize = (v:any) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    const exactAliases = new Set([
      'SCR', 'SCREATININE', 'SERUMCREATININE', 'CREATININE', 'CREA',
      'CREAT', 'CREATININESERUM', 'CREATININES'
    ]);

    return items.find((x:any)=>{
      if (this.numericOrNull(x.result_value) === null) return false;
      const values = [x.test_code, x.code, x.test_short_code, x.test_name, x.display_name, x.side_header]
        .map(normalize).filter(Boolean);
      return values.some((value:string)=>
        exactAliases.has(value) ||
        value.includes('SERUMCREATININE') ||
        value === 'CREATININE' ||
        value === 'SCREATININE'
      );
    }) || null;
  }

  findFormulaSource(report: ReportVm, variable:{variable_key:string, source_test_id:number}, currentItem:any): any {
    const items = this.reportableItems(report).filter((x:any)=>x !== currentItem);
    const key = String(variable.variable_key || '').trim().toUpperCase();
    if (variable.source_test_id) {
      const byId = items.find((x:any)=>+x.test_id === +variable.source_test_id && String(x.result_value ?? '').trim());
      if (byId) return byId;
    }
    const normalize = (v:any) => String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
    const nk = normalize(key);
    return items.find((x:any)=>{
      const code = normalize(x.test_code || x.code || x.test_short_code || '');
      const name = normalize(x.test_name || x.display_name || '');
      const side = normalize(x.side_header || '');
      return !!String(x.result_value ?? '').trim() && (code === nk || name === nk || side === nk || code.includes(nk));
    });
  }
  safeEval(expr:string): number|null { const s = String(expr || '').replace(/\^/g,'**'); if (!/^[0-9+\-*/().\s]*$/.test(s)) return null; try { const v = Function(`"use strict"; return (${s})`)(); return Number.isFinite(Number(v)) ? Number(v) : null; } catch { return null; } }
  formatNumberForItem(item:any,value:number): string { const places = Number.isFinite(+item.decimal_places) ? Math.max(0,+item.decimal_places) : 2; let n = Number(value); const mode = String(item.rounding_mode || 'NEAREST').toUpperCase(); const f = Math.pow(10, places); if (mode.includes('CEIL')) n = Math.ceil(n*f)/f; else if (mode.includes('FLOOR')) n = Math.floor(n*f)/f; else n = Math.round(n*f)/f; return n.toFixed(places); }
  escapeRegExp(s:string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  draggedSectionName = '';
  startSectionDrag(event:DragEvent,section:ReportSection) {
    const target=event.target as HTMLElement | null;
    if (!target?.closest('.profile-drag')) { event.preventDefault(); this.draggedSectionName=''; return; }
    this.draggedSectionName=section.key;
  }
  allowSectionDrop(event: DragEvent) { event.preventDefault(); }
  dropSection(report: ReportVm, target: ReportSection) {
    if (!this.draggedSectionName || this.draggedSectionName === target.key) return;
    const sections: ReportSection[] = report.safeSections || [];
    const from = sections.findIndex((s: ReportSection) => s.key === this.draggedSectionName);
    const to = sections.findIndex((s: ReportSection) => s.key === target.key);
    if (from < 0 || to < 0) return;
    const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved);
    this.applySectionOrder(report, sections); this.draggedSectionName = '';
  }
  moveSection(report: ReportVm, section: ReportSection, delta:number) { const sections: ReportSection[] = [...(report.safeSections||[])]; const i=sections.findIndex((s: ReportSection)=>s.key===section.key); const j=i+delta; if(i<0||j<0||j>=sections.length) return; [sections[i],sections[j]]=[sections[j],sections[i]]; this.applySectionOrder(report,sections); }
  applySectionOrder(report: ReportVm, sections: ReportSection[]) { sections.forEach((section, index)=>{ const order=(index+1)*1000; section.order=order; section.items.forEach((x:any)=>x.group_order_override=order); }); this.refreshSelectedState(report); }

  moveItem(report: ReportVm, item:any, delta:number) { const arr = report.safeItems; const i = arr.indexOf(item); const j = i + delta; if (i < 0 || j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; arr.forEach((x:any, idx:number) => x.report_order_override = (idx + 1) * 10); this.refreshSelectedState(report); }
  async openHistory(report: ReportVm, item:any) {
    this.historyState.set({item, rows:[], loading:true, error:''});
    const currentReportId = +report.id || 0;
    const result = await this.runAction(async()=>{
      const api:any = window.limsApi as any;
      if (!api.reportItemHistory) return [];
      return await api.reportItemHistory(+report.patient_id, +item.test_id, currentReportId);
    }, 'Unable to load result history.');
    const current = this.historyState();
    if (!current) return;
    const rows = (Array.isArray(result) ? result : []).filter((row:any)=>!currentReportId || +row.report_id !== currentReportId);
    this.historyState.set({item, rows, loading:false, error: result === null ? 'Unable to load history.' : ''});
  }


  normalizeResultStatus(item:any): string { return String(item?.result_status || 'PENDING').toUpperCase(); }
  hasRealResultValue(item:any): boolean {
    const source = String(item?.final_result_source || '').toUpperCase();
    const method = String(item?.vendor_result_method || '').toUpperCase();
    const resultValue = String(item?.result_value || '').trim();
    const outsourceValue = String(item?.outsource_result_value || '').trim();
    const internalValue = String(item?.internal_check_value || '').trim();
    const vendorFile = String(item?.vendor_report_file || '').trim();
    if (method === 'ATTACH_REPORT_ONLY' || source === 'VENDOR_REPORT') return !!vendorFile || resultValue === 'See attached vendor report';
    if (source === 'OUTSOURCE') return !!outsourceValue || !!resultValue;
    if (source === 'INTERNAL_CHECK') return !!internalValue || !!resultValue;
    return !!resultValue;
  }
  isPendingResultItem(item:any): boolean {
    const s = this.normalizeResultStatus(item);
    // Vendor/outsource received is logistics only. Until the user submits the row for approval,
    // it must stay in Pending Results even if outsource_result_value/vendor file exists.
    return s === 'PENDING' || !this.hasRealResultValue(item);
  }
  isEnteredResultItem(item:any): boolean { const s=this.normalizeResultStatus(item); return (s === 'ENTERED' || s === 'TYPED' || s === 'WAITING_APPROVAL') && this.hasRealResultValue(item); }
  isApprovedResultItem(item:any): boolean { return this.normalizeResultStatus(item) === 'APPROVED' && this.hasRealResultValue(item); }
  resultStatusLabel(item:any): string { const s=this.normalizeResultStatus(item); return s === 'APPROVED' && this.hasRealResultValue(item) ? 'Approved' : this.isEnteredResultItem(item) ? 'Waiting approval' : 'Pending'; }
  queueGroupKeyForItem(item:any): string {
    // Must match database listReports.queue_group_key exactly.
    // Collection id is first because reporting scope must be the exact physical
    // collection/specimen group, not the billed profile.  This prevents one
    // outsourced test inside a profile from making the whole profile look outsourced.
    const collectionId = String(+(item?.collection_id || item?.specimen_collection_id || 0));
    const specimen = this.normalizedGroupPart(item?.specimen_id || item?.specimen_name || 'NO_SAMPLE');
    const specimenName = this.normalizedGroupPart(item?.specimen_name || 'SPECIMEN');
    const collectionType = this.normalizedGroupPart(item?.sample_type || item?.collection_type || item?.collectionType || 'UNSPECIFIED');
    const mode = this.normalizedGroupPart(item?.collection_mode || 'INHOUSE');
    const workflow = mode === 'OUTSOURCE' ? 'OUTSOURCE' : 'INHOUSE';
    const vendor = String(+(item?.outsource_vendor_id || item?.vendor_id || 0));
    return `${collectionId}|${specimen}|${specimenName}|${collectionType}|${mode}|${workflow}|${vendor}`;
  }
  normalizedGroupPart(v:any): string { return String(v || 'UNSPECIFIED').trim().toUpperCase().replace(/\s+/g, '_') || 'UNSPECIFIED'; }
  queueGroupMatches(item:any, groupKey:any): boolean { const key=String(groupKey || '').trim(); return !key || this.queueGroupKeyForItem(item) === key; }
  queueGroupLabel(r:any): string {
    if (this.quickReporting || String(r?.report_scope || '').toUpperCase() === 'QUICK') {
      const n = +r?.approved_count || +r?.pending_count || +r?.item_count || 0;
      if (this.normalizeStatus(r?.status) === 'APPROVED') {
        const no = String(r?.report_no || r?.report_title || ('Quick Report #' + (r?.id || ''))).trim();
        return `${no} · ${n} test${n === 1 ? '' : 's'}`;
      }
      return `${n} pending reportable test${n === 1 ? '' : 's'}`;
    }
    if (r?._bill_group) {
      const reportCount = +r._bill_report_count || (Array.isArray(r._bill_report_ids) ? r._bill_report_ids.length : 1);
      const tests = +r.entered_count || +r.item_count || 0;
      const labels = Array.isArray(r._bill_group_labels) ? r._bill_group_labels.slice(0, 2).join(' + ') : '';
      const more = Array.isArray(r._bill_group_labels) && r._bill_group_labels.length > 2 ? ` +${r._bill_group_labels.length - 2} more` : '';
      return `${reportCount} waiting report${reportCount === 1 ? '' : 's'} · ${tests} test${tests === 1 ? '' : 's'}${labels ? ' · ' + labels + more : ''}`;
    }
    if (r?._approved_bill_group) {
      const reportCount = +r._approved_report_count || (Array.isArray(r._approved_report_ids) ? r._approved_report_ids.length : 1);
      const tests = +r.approved_count || +r.item_count || 0;
      const labels = Array.isArray(r._approved_group_labels) ? r._approved_group_labels.slice(0, 2).join(' + ') : '';
      const more = Array.isArray(r._approved_group_labels) && r._approved_group_labels.length > 2 ? ` +${r._approved_group_labels.length - 2} more` : '';
      return `${reportCount} approved report${reportCount === 1 ? '' : 's'} · ${tests} test${tests === 1 ? '' : 's'}${labels ? ' · ' + labels + more : ''}`;
    }
    const specimen = String(r?.specimen_label || r?.specimen_name || '').trim();
    const type = String(r?.collection_type_label || r?.sample_type || '').trim() || 'Collection type not set';
    const workflow = String(r?.workflow_label || '').trim() || this.workflowLabelFromRow(r);
    const vendor = +(r?.queue_vendor_id || r?.outsource_vendor_id || 0) ? ` · Vendor ${+(r?.queue_vendor_id || r?.outsource_vendor_id || 0)}` : '';
    return `${specimen ? specimen + ' · ' : ''}${type} · ${workflow}${vendor}`;
  }
  workflowLabelFromRow(r:any): string {
    const mode = String(r?.collection_mode_label || r?.collection_mode || 'INHOUSE').toUpperCase();
    const workflow = String(r?.workflow_key || '').toUpperCase();
    if (workflow === 'OUTSOURCE' || mode === 'OUTSOURCE') return 'Outsource';
    return 'In-house';
  }
  filterReportItemsForQueue(report: ReportVm, status:any, groupKey:any = '', queueRow:any = null) {
    const queue = String(status || this.reportStatus || '').toUpperCase();
    const group = String(groupKey || '').trim();
    let items = (report.safeItems || []).filter((x:any)=>x && x.test_id && !this.isMovedToRecheckOriginal(x));

    // Strict Reporting scope:
    // A report-entry row must represent the exact physical collection + workflow.
    // Do not include the rest of a billed profile just because source_profile_name
    // is the same.  The collection/specimen row and per-test collection_mode are
    // the boundary for report typing.
    const collectionId = +(queueRow?.collection_id || 0);
    if (collectionId) {
      items = items.filter((x:any)=>+(x.collection_id || x.specimen_collection_id || 0) === collectionId);
    } else if (group) {
      items = items.filter((x:any)=>this.queueGroupMatches(x, group));
    }

    const workflow = String(queueRow?.workflow_key || queueRow?.workflow_label || '').toUpperCase();
    const mode = String(queueRow?.collection_mode || queueRow?.collection_mode_label || '').toUpperCase();
    if (workflow.includes('OUTSOURCE') || mode === 'OUTSOURCE') {
      items = items.filter((x:any)=>this.isOutsourceItem(x));
    } else if (workflow.includes('INHOUSE') || mode === 'INHOUSE') {
      items = items.filter((x:any)=>!this.isOutsourceItem(x));
    } else if (group) {
      const groupParts = group.split('|');
      const groupMode = String(groupParts[4] || groupParts[5] || '').toUpperCase();
      if (groupMode.includes('OUTSOURCE')) items = items.filter((x:any)=>this.isOutsourceItem(x));
      if (groupMode === 'INHOUSE') items = items.filter((x:any)=>!this.isOutsourceItem(x));
    }

    const vendorId = +(queueRow?.queue_vendor_id || queueRow?.outsource_vendor_id || 0);
    if (vendorId) items = items.filter((x:any)=>+(x.outsource_vendor_id || x.vendor_id || 0) === vendorId);

    if (queue === 'DRAFT' || queue === 'PENDING') report.safeItems = items.filter((x:any)=>this.isPendingResultItem(x));
    else if (queue === 'TYPED' || queue === 'ENTERED' || queue === 'WAITING_APPROVAL') report.safeItems = items.filter((x:any)=>this.isEnteredResultItem(x));
    else if (queue === 'APPROVED') report.safeItems = items.filter((x:any)=>this.isApprovedResultItem(x));
    else if (queue === 'RECHECK') report.safeItems = items.filter((x:any)=>this.isPendingRecheckItem(x));
    else report.safeItems = items;

    this.prepareEntrySelection(report); this.refreshSelectedState(report);
  }
  queueRowKey(r:any): string { return `${+r?.id || 0}:${r?.queue_group_key || 'all'}`; }
  isQueueExpanded(r:any): boolean { return this.queueExpanded.has(this.queueRowKey(r)); }
  async toggleQueueDetails(r:any) {
    const id=+r.id; if(!id) return;
    const key=this.queueRowKey(r);
    if(this.queueExpanded.has(key)) { this.queueExpanded.delete(key); return; }
    this.queueExpanded.add(key);
    if(!this.queueDetails[id]) {
      const raw = await this.runAction(async()=>window.limsApi.getReport(id), 'Unable to load report item details.');
      if(raw) this.queueDetails[id] = this.toReportVm(raw);
    }
  }
  queueDetailReport(r:any): ReportVm | null { return this.queueDetails[+r.id] || null; }
  queuePrimaryItems(r:any): any[] {
    const detail=this.queueDetailReport(r); const items=detail ? this.reportableItems(detail).filter((x:any)=>this.queueGroupMatches(x, r?.queue_group_key)) : [];
    if(this.reportStatus==='DRAFT') return items.filter((x:any)=>this.isPendingResultItem(x));
    if(this.reportStatus==='TYPED') return items.filter((x:any)=>this.isEnteredResultItem(x));
    if(this.reportStatus==='APPROVED') return items.filter((x:any)=>this.isApprovedResultItem(x));
    if(this.reportStatus==='RECHECK') return items.filter((x:any)=>this.isPendingRecheckItem(x));
    return items;
  }
  queueCompletedItems(r:any): any[] {
    const detail=this.queueDetailReport(r); const items=detail ? this.reportableItems(detail).filter((x:any)=>this.queueGroupMatches(x, r?.queue_group_key)) : [];
    if(this.reportStatus==='DRAFT') return items.filter((x:any)=>!this.isPendingResultItem(x));
    return [];
  }


  primaryApprovedReportId(r:any): number {
    const ids = Array.isArray(r?._approved_report_ids) ? r._approved_report_ids : [];
    return +(ids[0] || r?.id || 0);
  }

  queueBillKey(r:any): string { return `${String(r?.bill_no || '').trim()}|${String(r?.patient_no || r?.patient_id || '').trim() || String(r?.patient_name || '').trim()}`; }
  waitingApprovalRows(): any[] { return (this.reports() || []).filter((r:any)=>(+r.entered_count || 0) > 0 && this.normalizeStatus(r.status) !== 'APPROVED' && (+r.recheck_count || 0) === 0 && this.inDateRange(r)); }
  waitingApprovalGroupedRows(): any[] {
    const groups = new Map<string, any>();
    for (const r of this.waitingApprovalRows()) {
      const key = this.queueBillKey(r);
      const enteredCount = (+r.entered_count || 0) || this.reportCompletedCount(r) || (+r.item_count || 0);
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          ...r,
          _bill_group: true,
          _bill_group_key: key,
          _bill_report_ids: [+r.id],
          _bill_report_count: 1,
          _bill_group_labels: [this.queueGroupLabel(r)].filter(Boolean),
          entered_count: enteredCount,
          item_count: enteredCount,
          total_item_count: enteredCount,
          pending_count: 0,
          status: 'TYPED'
        });
      } else {
        existing._bill_report_ids.push(+r.id);
        existing._bill_report_count += 1;
        const label = this.queueGroupLabel(r);
        if (label && !existing._bill_group_labels.includes(label)) existing._bill_group_labels.push(label);
        existing.entered_count = (+existing.entered_count || 0) + enteredCount;
        existing.item_count = (+existing.item_count || 0) + enteredCount;
        existing.total_item_count = (+existing.total_item_count || 0) + enteredCount;
        if (new Date(r.collected_at || r.created_at || 0).getTime() > new Date(existing.collected_at || existing.created_at || 0).getTime()) existing.collected_at = r.collected_at;
      }
    }
    return Array.from(groups.values());
  }

  approvedBillKey(r:any): string { return `${String(r?.bill_no || '').trim()}|${String(r?.patient_no || r?.patient_id || '').trim() || String(r?.patient_name || '').trim()}`; }
  approvedRows(): any[] { return (this.reports() || []).filter((r:any)=>((+r.approved_count || 0) > 0 || (this.normalizeStatus(r.status) === 'APPROVED' && this.reportCompletedCount(r) > 0)) && this.inDateRange(r)); }
  approvedGroupedRows(): any[] {
    const groups = new Map<string, any>();
    for (const r of this.approvedRows()) {
      const key = this.approvedBillKey(r);
      const approvedCount = (+r.approved_count || 0) || this.reportCompletedCount(r) || (+r.item_count || 0);
      const totalCount = (+r.total_item_count || 0) || (+r.item_count || 0) || approvedCount;
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          ...r,
          _approved_bill_group: true,
          _approved_group_key: key,
          _approved_report_ids: [+r.id],
          _approved_report_count: 1,
          _approved_group_labels: [this.queueGroupLabel({...r, _approved_bill_group:false})].filter(Boolean),
          approved_count: approvedCount,
          item_count: approvedCount,
          total_item_count: approvedCount,
          pending_count: 0,
          entered_count: 0,
          status: 'APPROVED'
        });
      } else {
        existing._approved_report_ids.push(+r.id);
        existing._approved_report_count += 1;
        const label = this.queueGroupLabel({...r, _approved_bill_group:false});
        if (label && !existing._approved_group_labels.includes(label)) existing._approved_group_labels.push(label);
        existing.approved_count = (+existing.approved_count || 0) + approvedCount;
        existing.item_count = (+existing.item_count || 0) + approvedCount;
        existing.total_item_count = (+existing.total_item_count || 0) + approvedCount;
        if (new Date(r.collected_at || r.created_at || 0).getTime() > new Date(existing.collected_at || existing.created_at || 0).getTime()) existing.collected_at = r.collected_at;
        if (new Date(r.bill_date || r.created_at || 0).getTime() < new Date(existing.bill_date || existing.created_at || Date.now()).getTime()) existing.bill_date = r.bill_date;
      }
    }
    return Array.from(groups.values());
  }
  pendingSummaryRowKey(r:any): string { return String(r?.id || r?.bill_id || r?.bill_no || ''); }
  visiblePendingRows(): any[] { return this.reportStatus === 'DRAFT' ? this.filteredReports().filter((r:any)=>(+r?.id || 0) !== 0) : []; }
  isPendingSummarySelected(r:any): boolean { return this.pendingSummarySelected.has(this.pendingSummaryRowKey(r)); }
  pendingSummarySelectedCount(): number { const visible = new Set(this.visiblePendingRows().map((r:any)=>this.pendingSummaryRowKey(r))); return Array.from(this.pendingSummarySelected).filter(k=>visible.has(k)).length; }
  someVisiblePendingSelected(): boolean { return this.pendingSummarySelectedCount() > 0; }
  allVisiblePendingSelected(): boolean { const rows=this.visiblePendingRows(); return rows.length > 0 && rows.every((r:any)=>this.isPendingSummarySelected(r)); }
  togglePendingSummaryRow(r:any, checked:boolean){ const key=this.pendingSummaryRowKey(r); checked ? this.pendingSummarySelected.add(key) : this.pendingSummarySelected.delete(key); }
  toggleAllVisiblePending(checked:boolean){ for(const r of this.visiblePendingRows()){ const key=this.pendingSummaryRowKey(r); checked ? this.pendingSummarySelected.add(key) : this.pendingSummarySelected.delete(key); } }
  private pendingSummarySelectedRows(): any[] { return this.visiblePendingRows().filter((r:any)=>this.isPendingSummarySelected(r)); }
  private pendingSummaryGroups(items:any[]): any[] {
    const map = new Map<string, any>();
    for (const item of (items || []).filter((x:any)=>x?.test_id)) {
      const sampleId = String(item.sample_id || item.barcode || item.specimen_id || '').trim() || 'Not generated';
      const specimen = String(item.specimen_name || item.sample_type || 'Specimen').trim() || 'Specimen';
      const collection = [item.collection_type || item.sample_type || 'Random', item.collection_time || '', item.collection_datetime || ''].filter(Boolean).join(' · ');
      const key = [sampleId, specimen, collection].join('|');
      if (!map.has(key)) map.set(key, { sampleId, specimen, collection, profiles:new Map<string,string[]>(), singles:[] as string[] });
      const group = map.get(key);
      const profile = String(item.source_profile_name || item.profile_name || item.group_name || '').trim();
      const testName = String(item.test_name || '').trim();
      if (profile) {
        if (!group.profiles.has(profile)) group.profiles.set(profile, []);
        if (testName) group.profiles.get(profile).push(testName);
      } else if (testName) group.singles.push(testName);
    }
    return Array.from(map.values()).map((g:any)=>{
      const profileText = Array.from(g.profiles.entries()).map(([name, tests]:any)=>`${name}: ${Array.from(new Set(tests)).join(', ')}`);
      const singleText = Array.from(new Set(g.singles));
      return {...g, tests:[...profileText, ...singleText].join(' | ') || '-'};
    });
  }
  async printPendingSummary(){
    const rows = this.pendingSummarySelectedRows();
    if (!rows.length) { this.showError('Select one or more pending reports.'); return; }
    const details:any[] = [];
    const loaded = await this.runAction(async()=>{
      for (const row of rows) {
        const raw = await window.limsApi.getReport(+row.id);
        details.push({ row, report: raw || row });
      }
      return true;
    }, 'Unable to load selected pending report details.');
    if (!loaded) return;
    const now = DateTimeSettingsService.nowInputValue();
    const blocks = details.map(({row, report}:any, idx:number)=>{
      const patient = this.htmlSafe(report?.patient_name || row?.patient_name || '-');
      const bill = this.htmlSafe(report?.bill_no || row?.bill_no || '-');
      const ageGender = this.htmlSafe(this.patientAgeGender(report || row));
      const refBy = this.htmlSafe(report?.consultant_name || row?.consultant_name || 'Self');
      const billDate = this.htmlSafe(this.dateOnly(report?.bill_date || row?.bill_date || row?.created_at));
      const groups = this.pendingSummaryGroups(report?.items || []);
      const sampleRows = groups.map((g:any)=>`<tr><td class="sid"><b>${this.prettySampleId(g.sampleId)}</b><small>${this.htmlSafe(g.sampleId)}</small></td><td>${this.htmlSafe(g.specimen)}</td><td>${this.htmlSafe(g.collection || '-')}</td><td>${this.htmlSafe(g.tests)}</td></tr>`).join('') || `<tr><td colspan="4" class="empty-print">No sample/test details found.</td></tr>`;
      return `<section class="bill-block"><table class="patient-table"><tr><td class="sl">${idx+1}</td><td><b>${bill}</b><small>Bill No</small></td><td><b>${patient}</b><small>Patient</small></td><td><b>${ageGender}</b><small>Age / Gender</small></td><td><b>${refBy}</b><small>Ref By</small></td><td><b>${billDate}</b><small>Bill Date</small></td></tr></table><table class="sample-table"><thead><tr><th>Sample ID</th><th>Specimen</th><th>Collection</th><th>Tests / Profiles</th></tr></thead><tbody>${sampleRows}</tbody></table></section>`;
    }).join('');
    const html=`<html><head><title>Pending Summary</title><style>@page{size:A4 portrait;margin:8mm}body{font-family:Arial,sans-serif;color:#111;margin:0;padding:0;font-size:11px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}.head h2{font-size:17px;margin:0}.head p{margin:2px 0 0;color:#555}.bill-block{break-inside:avoid;page-break-inside:avoid;margin:0 0 11px;border:1px solid #999;border-radius:8px;overflow:hidden}.patient-table,.sample-table{width:100%;border-collapse:collapse}.patient-table td{border-bottom:1px solid #bbb;padding:6px 7px;vertical-align:top}.patient-table .sl{width:24px;text-align:center;font-weight:900;background:#f3f4f6}.patient-table b{display:block;font-size:11px}.patient-table small{display:block;font-size:9px;color:#666;margin-top:1px}.sample-table th{background:#f3f4f6;text-align:left;border-bottom:1px solid #bbb;padding:5px 7px;font-size:11px}.sample-table td{border-top:1px solid #e5e7eb;padding:5px 7px;vertical-align:top;line-height:1.3;font-size:11px}.sample-table b{font-size:11px}.sid{width:105px}.sid small{display:block;color:#666;font-size:11px}.empty-print{text-align:center;color:#777}.foot{margin-top:8px;color:#666;font-size:11px}</style></head><body><div class="head"><div><h2>Pending Summary</h2><p>Selected pending reports with sample, specimen and test/profile details</p></div><div>${this.htmlSafe(now.slice(0,10))} ${this.htmlSafe(now.slice(11,16))}</div></div>${blocks}<div class="foot">Total bills: ${details.length}</div></body></html>`;
    await this.openGeneratedPdfFromHtml(html, 'Pending Summary', `pending-summary-${now.slice(0,10)}`, 'Unable to generate Pending Summary PDF.');
  }

  filteredReports(): any[] {
    if (this.reportStatus === 'LOG') return [];
    const q=(this.reportSearch||'').trim().toLowerCase();
    const rows = this.quickReporting
      ? (this.reportStatus === 'APPROVED'
        ? (this.reportQueueView === 'REPORT' ? this.approvedRows() : this.approvedGroupedRows())
        : (this.reports()||[]).filter((r:any)=>this.matchesReportTab(r) && this.inDateRange(r)))
      : (this.reportStatus === 'APPROVED'
        ? (this.reportQueueView === 'REPORT' ? this.approvedRows() : this.approvedGroupedRows())
        : (this.reportStatus === 'TYPED'
          ? (this.reportQueueView === 'REPORT' ? this.waitingApprovalRows() : this.waitingApprovalGroupedRows())
          : (this.reports()||[]).filter((r:any)=>this.matchesReportTab(r) && this.inDateRange(r))));
    if(!q) return rows;
    return rows.filter((r:any)=>((r.bill_no||'')+' '+(r.report_no||'')+' '+(r.report_title||'')+' '+(r.patient_name||'')+' '+(r.status||'')+' '+(r.mobile||'')+' '+(r.patient_mobile||'')+' '+this.queueGroupLabel(r)+' '+((r._approved_group_labels||[]).join(' '))).toLowerCase().includes(q));
  }
  isRecheckReportRow(r:any): boolean {
    const scope = String(r?.report_scope || '').toUpperCase();
    const kind = String(r?.report_kind || '').toUpperCase();
    return scope === 'RECHECK' || kind === 'RECHECK' || +r?.is_recheck_report === 1;
  }
  matchesReportTab(r:any): boolean {
    const isRecheckReport = this.isRecheckReportRow(r);
    const activeRecheckCount = +r.recheck_count || 0;
    if (this.reportStatus === 'RECHECK') return activeRecheckCount > 0;
    if (isRecheckReport) return false;
    if (this.reportStatus === 'CANCELLED') return this.normalizeStatus(r.status) === 'CANCELLED';
    if (activeRecheckCount > 0) return false;
    if (this.reportStatus === 'DRAFT') return (+r.pending_count || 0) > 0;
    if (this.reportStatus === 'TYPED') return (+r.entered_count || 0) > 0 && this.normalizeStatus(r.status) !== 'APPROVED';
    if (this.reportStatus === 'APPROVED') return (+r.approved_count || 0) > 0 || (this.normalizeStatus(r.status) === 'APPROVED' && this.reportCompletedCount(r) > 0);
    return this.normalizeStatus(r.status)===this.reportStatus;
  }
  filteredReportLogs(): any[] {
    const q=(this.reportSearch||'').trim().toLowerCase();
    const rows=(this.reportLogs()||[]).filter((l:any)=>this.inDateRange(l) && this.matchesLogFilter(l));
    if(!q) return rows;
    return rows.filter((l:any)=>((l.bill_no||'')+' '+(l.patient_name||'')+' '+(l.patient_mobile||'')+' '+(l.action_label||'')+' '+(l.details_label||'')+' '+(l.action||'')).toLowerCase().includes(q));
  }
  matchesLogFilter(l:any): boolean {
    const a=String(l?.action||'').toLowerCase(); const f=this.logFilter;
    return f==='ALL' || (f==='RESULT' && (a.includes('draft') || a.includes('submit') || a.includes('approve'))) || (f==='CORRECTION' && a.includes('correction')) || (f==='RECHECK' && a.includes('recheck')) || (f==='DELIVERY' && a.includes('delivery')) || (f==='CANCEL' && (a.includes('cancel') || a.includes('reject')));
  }
  private queueFilterDateValue(r:any): any {
    return r?.bill_date || r?.billDate || r?.bill_date_time || r?.created_at || r?.createdAt || r?.updated_at;
  }

  private inputDateOnly(value:any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = raw.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    return DateTimeSettingsService.toInputDateTime(value).slice(0, 10);
  }

  inDateRange(r:any): boolean {
    const d = this.inputDateOnly(this.queueFilterDateValue(r));
    if (!d) return true;
    if (this.fromDate && d < this.fromDate) return false;
    if (this.toDate && d > this.toDate) return false;
    return true;
  }
  dateOnly(value:any): string { return DateTimeSettingsService.date(value); }
  formatDateTime(value:any): string { return DateTimeSettingsService.dateTime(value); }
  timeOnly(value:any): string { return DateTimeSettingsService.time(value, '-'); }

  reportTotalCount(r:any): number { return +r.total_item_count || +r.item_count || 0; }
  reportPendingCount(r:any): number { return +r.pending_count || 0; }
  reportCompletedCount(r:any): number { const total=this.reportTotalCount(r); const pending=this.reportPendingCount(r); const entered=+r.entered_count || 0; return Math.max(0, Math.min(total || entered, total ? total - pending : entered)); }
  progressTone(r:any): 'pending' | 'partial' | 'complete' { const total=this.reportTotalCount(r); const done=this.reportCompletedCount(r); if(total && done >= total) return 'complete'; if(done > 0) return 'partial'; return 'pending'; }
  progressDisplay(r:any): string { const tone=this.progressTone(r); if(tone==='complete') return this.reportStatus==='APPROVED' ? 'Approved' : 'Completed'; if(tone==='partial') return this.reportStatus==='TYPED' ? 'Partial waiting approval' : 'Partially entered'; return this.reportStatus==='RECHECK' ? 'Pending recheck' : this.reportStatus==='CANCELLED' ? 'Cancelled' : 'Pending'; }
  progressCountText(r:any): string { const total=this.reportTotalCount(r); const done=this.reportCompletedCount(r); return total ? `${done} of ${total} completed` : `${done} completed`; }
  reportProgressPercent(r:any): number { const total=this.reportTotalCount(r); if(!total) return 0; const pending=this.reportPendingCount(r); const completed=Math.max(0,total-pending); return Math.max(0, Math.min(100, Math.round((completed/total)*100))); }
  queueStatusIcon(r:any): string { if(this.normalizeStatus(r.status)==='CANCELLED') return '⚠'; return this.progressTone(r)==='complete' ? '✓' : '⏳'; }
  queueStatusFraction(r:any): string { const total=this.reportTotalCount(r); const pending=this.reportPendingCount(r); const done=this.reportCompletedCount(r); if(!total) return '0 / 0'; return this.progressTone(r)==='complete' ? `${total} / ${total}` : `${Math.max(0, pending)} / ${total}`; }
  patientAgeGender(r:any): string { const age=String(r?.age || r?.patient_age || '').trim(); const gender=String(r?.gender || r?.patient_gender || '').trim(); const agePart=age ? age.replace(/years?/i,'Y') : '-'; const genderPart=gender || '-'; return `${agePart} / ${genderPart}`; }

  sampleIdLabel(item:any): string {
    return String(item?.specimen_id || item?.sample_id || item?.barcode || '').trim();
  }
  isEntryLocked(r:any): boolean { if (this.quickReporting) return false; return !!r?.entry_locked || (+r?.ready_for_entry_count || 0) <= 0; }
  itemCountForQueue(r:any): number { const total=+r.item_count || 0; if(this.reportStatus==='DRAFT') return (+r.pending_count || 0); if(this.reportStatus==='TYPED') return (+r.entered_count || 0); if(this.reportStatus==='RECHECK') return (+r.recheck_count || 0); if(this.reportStatus==='APPROVED') return (+r.approved_count || 0) || total; return total; }
  queueItemLabel(r:any): string { const n=this.itemCountForQueue(r); if(this.reportStatus==='DRAFT') return n === 1 ? 'pending test' : 'pending tests'; if(this.reportStatus==='TYPED') return n === 1 ? 'waiting item' : 'waiting items'; return n === 1 ? 'item' : 'items'; }
  reportCountByStatus(status:ReportQueueStatus): number { if (status === 'LOG') return this.reportLogCount(); if (this.quickReporting) return (this.reports() || []).filter((r:any)=>this.normalizeStatus(r.status)===status && (status !== 'DRAFT' || (+r.pending_count || 0) > 0) && (status !== 'APPROVED' || (+r.approved_count || +r.item_count || 0) > 0)).length; if (status === 'RECHECK') return (this.reports() || []).filter((r:any)=>(+r.recheck_count || 0) > 0).length; if (status === 'CANCELLED') return (this.reports() || []).filter((r:any)=>!this.isRecheckReportRow(r) && this.normalizeStatus(r.status)==='CANCELLED').length; if (status === 'DRAFT') return (this.reports() || []).filter((r:any)=>!this.isRecheckReportRow(r) && (+r.pending_count || 0) > 0 && (+r.recheck_count || 0) === 0).length; if (status === 'TYPED') return this.waitingApprovalGroupedRows().length; if (status === 'APPROVED') return this.approvedGroupedRows().length; return (this.reports() || []).filter((r:any)=>!this.isRecheckReportRow(r) && this.normalizeStatus(r.status)===status && (+r.recheck_count || 0) === 0).length; }
  reportLogCount(): number { return (this.reportLogs() || []).length; }
  activeQueueTitle(): string { if (this.quickReporting) return this.reportStatus === 'APPROVED' ? 'Finished Reports' : 'Pending Reports'; return this.reportStatus === 'LOG' ? 'Reporting log' : this.reportStatus === 'RECHECK' ? 'Pending Rechecks' : this.reportStatus === 'CANCELLED' ? 'Cancelled Reports' : this.reportStatus === 'TYPED' ? 'Results Entered / Waiting Approval' : this.reportStatus === 'APPROVED' ? 'Approved' : 'Pending Results'; }
  normalizeStatus(status:any): ReportQueueStatus { const s=String(status || 'DRAFT').toUpperCase(); return s.includes('CANCEL') ? 'CANCELLED' : s==='APPROVED' ? 'APPROVED' : s==='TYPED' || s==='ENTERED' || s==='WAITING_APPROVAL' ? 'TYPED' : 'DRAFT'; }
  statusDisplay(status:string): string { const s=this.normalizeStatus(status); if (this.quickReporting) return s==='APPROVED' ? 'Finished' : 'Pending'; return s==='CANCELLED' ? 'Cancelled' : s==='TYPED' ? 'Waiting Approval' : s==='APPROVED' ? 'Approved' : 'Pending Results'; }
  queueActionLabel(status:string): string { const s=this.normalizeStatus(status); return s==='TYPED' ? 'Verify / Approve' : s==='APPROVED' ? 'View' : 'Enter Results'; }
  workspaceTitle(): string { return this.recheckEntryMode ? 'Enter recheck result' : this.workspaceMode()==='APPROVED' ? 'Approved report' : this.workspaceMode()==='APPROVE' ? 'Verify / Approve' : 'Enter results'; }
  workspaceStatusTitle(): string { return this.recheckEntryMode ? 'Pending recheck' : this.workspaceMode()==='APPROVED' ? 'Approved report' : this.workspaceMode()==='APPROVE' ? 'Verify / Approve' : 'Result entry'; }
  workspaceStatusText(report:ReportVm): string { if (this.quickReporting && this.workspaceMode()==='ENTRY') return `${report.selectedCount} selected · save as one finished report`; if (this.quickReporting && this.workspaceMode()==='APPROVED') return 'Finished · print/export with or without background, edit, or delete.'; if(this.recheckEntryMode) return `${report.selectedCount} recheck item(s) selected · enter recheck values and submit back for approval`; if(this.workspaceMode()==='ENTRY') return `${report.selectedCount} selected · save draft or submit for approval`; if(this.workspaceMode()==='APPROVE') return `${report.completionPercent}% completed · view PDF, edit, or verify & approve`; return 'Approved · view, PDF export, print, email, SMS, or use correction flow for changes.'; }
  deliverySummary(r:any): string { const parts:string[]=[]; if(r?.pdf_exported_at) parts.push('PDF exported'); if(r?.printed_at) parts.push('Printed'); if(r?.emailed_at) parts.push('Email sent/opened'); if(r?.smsed_at) parts.push('SMS sent/opened'); return parts.length ? 'Delivery status: ' + parts.join(' · ') : 'Delivery status: not exported, printed, emailed, or SMS shared yet.'; }
  sectionSelectedCount(section: ReportSection): number { return (section.items || []).filter((x:any)=>x.selected_for_entry !== false).length; }
  sectionAllSelected(section: ReportSection): boolean { return !!(section.items || []).length && (section.items || []).every((x:any)=>x.selected_for_entry !== false); }
  sectionPartiallySelected(section: ReportSection): boolean { const items=section.items || []; const selected=this.sectionSelectedCount(section); return selected > 0 && selected < items.length; }
  toggleSectionSelection(report:ReportVm, section:ReportSection, checked:boolean) { (section.items || []).forEach((x:any)=>x.selected_for_entry=checked); this.refreshSelectedState(report); }
  allEntrySelected(report:ReportVm): boolean { return !!report.safeItems.length && report.safeItems.every((x:any)=>x.selected_for_entry !== false); }
  toggleEntrySelection(report:ReportVm, checked:boolean) { report.safeItems.forEach((x:any)=>x.selected_for_entry=checked); this.refreshSelectedState(report); }
  truthy(v:any): boolean { return v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true'; }
  trackReport = (_i:number,r:any) => { if (this.quickReporting) return r?._approved_group_key ? `quick-approved:${r._approved_group_key}` : `quick:${r?.id}:${r?.status || ''}`; return r?._bill_group_key ? `waiting:${r._bill_group_key}` : (r?._approved_group_key ? `approved:${r._approved_group_key}` : `${r.id}:${r.queue_group_key || 'all'}:${r.status || ''}`); };
  trackLog(_i:number,l:any){ return l.id || _i; }
  trackSection(_i:number,s:ReportSection){ return s.key; }
  trackItem(_i:number,x:any){ return x._key || x.id || _i; }
}
