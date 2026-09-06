import { DateTimeSettingsService } from './shared/date-time-settings.service';
import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy, OnInit, ViewChild, computed, signal } from '@angular/core';
import { AppShellComponent, NavItem } from './layout/app-shell.component';
import { BillingStepperComponent } from './features/billing/billing-stepper.component';
import { DashboardPageComponent } from './features/dashboard/dashboard-page.component';
import { ReportTypingPageComponent } from './features/reports/report-typing-page.component';
import { MastersPageComponent } from './features/masters/masters-page.component';
import { ConsultantsPageComponent } from './features/consultants/consultants-page.component';
import { CommissionsPageComponent } from './features/commissions/commissions-page.component';
import { OperationsPageComponent } from './features/operations/operations-page.component';
import { CollectionPageComponent } from './features/collection-page.component';
import { StatementsPageComponent } from './features/statements/statements-page.component';
import { AnalyticsPageComponent } from './features/analytics/analytics-page.component';
import { PatientHistoryPageComponent } from './features/patients/patient-history-page.component';
import { SettingsBackupPageComponent } from './features/settings/settings-backup-page.component';
import { ReportSettingsComponent } from './features/report-settings/report-settings.component';
import { BillingSettingsComponent } from './features/billing/billing-settings.component';
import { ConfirmDialogComponent, ConfirmDialogTone } from './shared/confirm-dialog.component';

type ShutdownSheetItem = { icon: string; title: string; detail: string; status: string; active: boolean; warn?: boolean };
type ShutdownSheetState = {
  hasUnsavedBill: boolean;
  analyzerRunning: boolean;
  analyzerEndpoint: string;
  backupEnabled: boolean;
  backupOnClose: boolean;
  currentTabLabel: string;
  items: ShutdownSheetItem[];
};
type BackupLifecycleState = {
  phase: 'running' | 'done' | 'error';
  title: string;
  message: string;
  statusText: string;
  reason: string;
};
type ExitProgressStep = { id: string; label: string; detail: string; state: 'pending' | 'running' | 'done' | 'error' | 'skipped' };
type ExitProgressState = {
  title: string;
  message: string;
  statusText: string;
  progress: number;
  phase: 'running' | 'done' | 'error';
  steps: ExitProgressStep[];
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    AppShellComponent,
    DashboardPageComponent,
    BillingStepperComponent,
    ReportTypingPageComponent,
    MastersPageComponent,
    ConsultantsPageComponent,
    CommissionsPageComponent,
    OperationsPageComponent,
    CollectionPageComponent,
    StatementsPageComponent,
    AnalyticsPageComponent,
    PatientHistoryPageComponent,
    SettingsBackupPageComponent,
    ReportSettingsComponent,
    BillingSettingsComponent,
    ConfirmDialogComponent
  ],
  template: `
    <app-shell
      [nav]="visibleNav()"
      [activeTab]="tab()"
      [title]="title()"
      [collapsed]="sideCollapsed()"
      [theme]="theme()"
      [settings]="settings()"
      [dashboard]="dash()"
      (select)="requestTab($event)"
      (toggleSidebar)="toggleSidebar()"
      (themeToggle)="toggleTheme()"
      [showBillTools]="tab()==='billing'"
      [billSearchQuery]="billSearchQuery()"
      [billSearchResults]="billSearchResults()"
      [activeBillNo]="activeBillNo()"
      [activeBillPaymentClass]="activeBillPaymentClass()"
      [previousBillNo]="previousBillNo()"
      [nextBillNo]="nextBillNo()"
      [billingFooterPrimaryText]="billingFooterPrimaryText()"
      [billingFooterSecondaryText]="billingFooterSecondaryText()"
      [showBillingFooter]="false"
      [billingFooterPrimaryDisabled]="billingFooterPrimaryDisabled()"
      [billingFooterSecondaryDisabled]="billingFooterSecondaryDisabled()"
      (billingFooterPrimary)="onBillingFooterPrimary()"
      (billingFooterSecondary)="onBillingFooterSecondary()"
      (billSearchChange)="onBillSearchChange($event)"
      (billSearchFocus)="onBillSearchFocus()"
      (billSearchClose)="closeBillSearchResults()"
      (billSearchSelect)="openBillFromSearch($event)"
      (previousBill)="openAdjacentBill(-1)"
      (nextBill)="openAdjacentBill(1)"
      (refresh)="onTopRefresh()"
      (newBill)="newBillFromTopbar()">

      <app-dashboard-page *ngIf="tab()==='dashboard'" [dashboard]="dash()"></app-dashboard-page>
      <app-billing-stepper *ngIf="tab()==='billing'" (billCreated)="onBillCreated($event)" (billCleared)="onBillCleared()" (errorOccurred)="showError($event)"></app-billing-stepper>
      <app-report-typing-page *ngIf="tab()==='reports'" (changed)="reload()"></app-report-typing-page>
      <app-masters-page *ngIf="tab()==='masters'" (changed)="reload()"></app-masters-page>
      <app-consultants-page *ngIf="tab()==='consultants'" (changed)="reload()"></app-consultants-page>
      <app-operations-page *ngIf="tab()==='operations'" (changed)="reload()"></app-operations-page>
      <app-collection-page *ngIf="tab()==='collection'" (changed)="reload()"></app-collection-page>
      <app-analytics-page *ngIf="tab()==='analytics'"></app-analytics-page>
      <app-statements-page *ngIf="tab()==='statements'" (editBill)="openBillFromStatement($event)" (newBill)="newBillFromTopbar()"></app-statements-page>
      <app-patient-history-page *ngIf="tab()==='patients'"></app-patient-history-page>
      <app-report-settings *ngIf="tab()==='reportSettings'"></app-report-settings>
      <app-billing-settings *ngIf="tab()==='billingSettings'"></app-billing-settings>
      <app-settings-backup-page *ngIf="tab()==='settings'" (changed)="onSettingsChanged($event)"></app-settings-backup-page>
    </app-shell>

    <div class="report-process-overlay" *ngIf="pdfProcessing()" role="status" aria-live="polite" aria-busy="true">
      <div class="report-process-card" [class.is-complete]="pdfProgress().stage === 'done'" [class.is-error]="pdfProgress().stage === 'error'">
        <div class="process-visual">
          <div class="pdf-document"><div class="pdf-fold"></div><span>{{ pdfProgress().stage === 'done' ? 'OK' : 'PDF' }}</span></div>
          <div class="process-orbit" *ngIf="pdfProgress().stage !== 'done' && pdfProgress().stage !== 'error'"><span></span><span></span><span></span></div>
          <div class="process-success" *ngIf="pdfProgress().stage === 'done'">✓</div>
          <div class="process-error-mark" *ngIf="pdfProgress().stage === 'error'">!</div>
        </div>
        <div class="process-copy">
          <div class="process-eyebrow">REPORT GENERATION</div>
          <h2>{{ pdfProgress().title || 'Preparing your report' }}</h2>
          <p>{{ pdfProgress().message || 'Please wait while the report is processed.' }}</p>
        </div>
        <div class="process-progress">
          <div class="progress-meta"><span>{{ pdfProgress().stageLabel || 'Preparing' }}</span><strong>{{ progressPercent() }}%</strong></div>
          <div class="progress-track"><div class="progress-fill" [style.width.%]="progressPercent()"></div></div>
          <div class="progress-footer"><span *ngIf="pdfProgress().total > 0">Page {{ pdfProgress().current }} of {{ pdfProgress().total }}</span><span class="progress-status">{{ pdfProgress().statusText || 'Processing' }}</span></div>
        </div>
        <div class="process-steps">
          <div class="process-step" [class.active]="isPdfStageActive('preparing')" [class.complete]="isPdfStageComplete('preparing')"><div class="step-dot">{{ isPdfStageComplete('preparing') ? '✓' : '1' }}</div><strong>Prepare</strong><small>Report layout</small></div>
          <div class="process-step" [class.active]="isPdfStageActive('rendering')" [class.complete]="isPdfStageComplete('rendering')"><div class="step-dot">{{ isPdfStageComplete('rendering') ? '✓' : '2' }}</div><strong>Render</strong><small>HQ pages</small></div>
          <div class="process-step" [class.active]="isPdfStageActive('blending')" [class.complete]="isPdfStageComplete('blending')"><div class="step-dot">{{ isPdfStageComplete('blending') ? '✓' : '3' }}</div><strong>Blend</strong><small>Background merge</small></div>
          <div class="process-step" [class.active]="isPdfStageActive('building')" [class.complete]="isPdfStageComplete('building')"><div class="step-dot">{{ isPdfStageComplete('building') ? '✓' : '4' }}</div><strong>Finalize</strong><small>Print-ready PDF</small></div>
        </div>
      </div>
    </div>

    <div class="report-process-overlay backup-lifecycle-overlay" *ngIf="exitProgress() as ex" role="status" aria-live="polite" aria-busy="true">
      <div class="report-process-card" [class.is-complete]="ex.phase === 'done'" [class.is-error]="ex.phase === 'error'">
        <div class="process-visual">
          <div class="pdf-document"><div class="pdf-fold"></div><span>{{ ex.phase === 'done' ? 'OK' : 'OFF' }}</span></div>
          <div class="process-orbit" *ngIf="ex.phase === 'running'"><span></span><span></span><span></span></div>
          <div class="process-success" *ngIf="ex.phase === 'done'">✓</div>
          <div class="process-error-mark" *ngIf="ex.phase === 'error'">!</div>
        </div>
        <div class="process-copy">
          <div class="process-eyebrow">LIVE SHUTDOWN STATUS</div>
          <h2>{{ ex.title }}</h2>
          <p>{{ ex.message }}</p>
        </div>
        <div class="process-progress">
          <div class="progress-meta"><span>{{ ex.statusText }}</span><strong>{{ ex.progress }}%</strong></div>
          <div class="progress-track"><div class="progress-fill" [style.width.%]="ex.progress"></div></div>
          <div class="progress-footer"><span>Do not force-quit</span><span class="progress-status">{{ ex.phase === 'running' ? 'In progress' : ex.phase === 'done' ? 'Complete' : 'Failed' }}</span></div>
        </div>
        <div class="process-steps exit-progress-steps">
          <div class="process-step" *ngFor="let step of ex.steps" [class.active]="step.state === 'running'" [class.complete]="step.state === 'done' || step.state === 'skipped'" [class.error]="step.state === 'error'">
            <div class="step-dot">{{ step.state === 'done' || step.state === 'skipped' ? '✓' : step.state === 'error' ? '!' : step.state === 'running' ? '…' : '·' }}</div>
            <strong>{{ step.label }}</strong>
            <small>{{ step.detail }}</small>
          </div>
        </div>
      </div>
    </div>

    <div class="report-process-overlay backup-lifecycle-overlay" *ngIf="backupLifecycle() as bk" role="status" aria-live="polite" aria-busy="true">
      <div class="report-process-card" [class.is-complete]="bk.phase === 'done'" [class.is-error]="bk.phase === 'error'">
        <div class="process-visual">
          <div class="pdf-document"><div class="pdf-fold"></div><span>{{ bk.phase === 'done' ? 'OK' : 'DB' }}</span></div>
          <div class="process-orbit" *ngIf="bk.phase === 'running'"><span></span><span></span><span></span></div>
          <div class="process-success" *ngIf="bk.phase === 'done'">✓</div>
          <div class="process-error-mark" *ngIf="bk.phase === 'error'">!</div>
        </div>
        <div class="process-copy">
          <div class="process-eyebrow">DATABASE BACKUP</div>
          <h2>{{ bk.title }}</h2>
          <p>{{ bk.message }}</p>
        </div>
        <div class="process-progress">
          <div class="progress-meta"><span>{{ bk.phase === 'running' ? 'Copying SQLite' : bk.phase === 'done' ? 'Complete' : 'Failed' }}</span><strong>{{ bk.phase === 'done' ? '100%' : bk.phase === 'error' ? '—' : '…' }}</strong></div>
          <div class="progress-track"><div class="progress-fill backup-progress-fill" [class.indeterminate]="bk.phase === 'running'" [style.width.%]="bk.phase === 'done' ? 100 : bk.phase === 'error' ? 100 : 42"></div></div>
          <div class="progress-footer"><span>{{ bk.reason }}</span><span class="progress-status">{{ bk.statusText }}</span></div>
        </div>
        <div class="process-steps backup-lifecycle-steps">
          <div class="process-step" [class.active]="bk.phase === 'running'" [class.complete]="bk.phase === 'done' || bk.phase === 'error'"><div class="step-dot">{{ bk.phase === 'running' ? '…' : '✓' }}</div><strong>Prepare</strong><small>Lock &amp; copy</small></div>
          <div class="process-step" [class.active]="bk.phase === 'running'" [class.complete]="bk.phase === 'done'"><div class="step-dot">{{ bk.phase === 'done' ? '✓' : '2' }}</div><strong>Write</strong><small>Backup file</small></div>
          <div class="process-step" [class.active]="bk.phase === 'done'" [class.complete]="bk.phase === 'done'"><div class="step-dot">{{ bk.phase === 'done' ? '✓' : '3' }}</div><strong>Finish</strong><small>{{ bk.phase === 'error' ? 'Retry later' : 'Safe copy ready' }}</small></div>
        </div>
      </div>
    </div>

    <app-confirm-dialog
      [open]="dialogState().open"
      [title]="dialogState().title"
      [message]="dialogState().message"
      [details]="dialogState().details || ''"
      [tone]="dialogState().tone"
      [confirmText]="dialogState().confirmText"
      [cancelText]="dialogState().cancelText"
      [showCancel]="dialogState().showCancel"
      (confirm)="resolveDialog(true)"
      (cancel)="resolveDialog(false)">
    </app-confirm-dialog>

    <div class="shutdown-backdrop" *ngIf="shutdownSheet() as s" role="dialog" aria-modal="true" aria-labelledby="shutdown-title">
      <section class="shutdown-sheet rich-output-modal" (click)="$event.stopPropagation()">
        <header class="output-modal-header shutdown-header">
          <div class="output-modal-heading">
            <span class="output-modal-icon" [class.warn]="s.hasUnsavedBill">⏻</span>
            <div>
              <h3 id="shutdown-title">Exit LIMS</h3>
              <p>{{ s.hasUnsavedBill ? 'Unsaved work detected — review before exiting' : 'Confirm shutdown and what will be closed' }}</p>
            </div>
          </div>
          <button class="output-modal-close" type="button" (click)="resolveShutdown(false)" aria-label="Stay here" title="Stay here">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </button>
        </header>

        <div class="output-modal-meta shutdown-meta">
          <div><span>Current screen</span><b>{{ s.currentTabLabel }}</b></div>
          <div><span>Unsaved bill</span><b [class.danger-text]="s.hasUnsavedBill">{{ s.hasUnsavedBill ? 'Yes — will discard' : 'None' }}</b></div>
          <div><span>Analyzer API</span><b>{{ s.analyzerRunning ? ('Running · ' + s.analyzerEndpoint) : 'Stopped' }}</b></div>
          <div><span>Auto backup</span><b>{{ s.backupEnabled ? 'Enabled' : 'Off' }}</b></div>
          <div><span>Exit backup</span><b>{{ s.backupOnClose ? 'Will run' : 'Skip' }}</b></div>
        </div>

        <div class="output-modal-body shutdown-body">
          <div class="shutdown-warning" *ngIf="s.hasUnsavedBill">
            <b>Unfinished billing entry</b>
            <p>Closing now will discard the current billing entry. Stay here if you still need to finish or clear that bill.</p>
          </div>
          <div class="shutdown-warning backup-exit-note" *ngIf="!s.hasUnsavedBill">
            <b>Live shutdown status</b>
            <p>After you confirm, a progress screen stays open until backup (if enabled), services, and the database are fully stopped — then the app process exits.</p>
          </div>

          <div class="shutdown-section-head">
            <div><h4>What will close</h4><p>These services and resources stop when you exit.</p></div>
          </div>
          <div class="shutdown-list">
            <article class="shutdown-item" *ngFor="let item of s.items" [class.active]="item.active" [class.warn]="item.warn">
              <div class="shutdown-item-icon">{{ item.icon }}</div>
              <div class="shutdown-item-copy">
                <b>{{ item.title }}</b>
                <small>{{ item.detail }}</small>
              </div>
              <em>{{ item.status }}</em>
            </article>
          </div>
        </div>

        <footer class="output-modal-footer shutdown-footer">
          <div class="output-footer-summary">
            <b>{{ s.hasUnsavedBill ? 'Exit will discard unfinished bill work' : 'Ready to shut down cleanly' }}</b>
            <small>Live status stays on screen until backup (if enabled), services, and the database finish — then the process exits.</small>
          </div>
          <div class="output-footer-actions">
            <button class="btn ghost" type="button" (click)="resolveShutdown(false)">Stay here</button>
            <button class="btn primary" [class.danger-exit]="s.hasUnsavedBill" type="button" (click)="resolveShutdown(true)">Exit app</button>
          </div>
        </footer>
      </section>
    </div>
  `,
  styles: [`
    .shutdown-backdrop {
      position: fixed; inset: 0; z-index: 2147483646;
      display: grid; place-items: center; padding: 28px; box-sizing: border-box;
      background: rgba(15, 23, 42, 0.74);
      -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px);
    }
    .shutdown-sheet {
      width: min(760px, 94vw);
      max-height: min(820px, 92vh);
      overflow: hidden;
      display: flex; flex-direction: column;
      border: 1px solid var(--border);
      border-radius: 26px;
      background: var(--panel);
      color: var(--text);
      box-shadow: 0 28px 90px rgba(2, 6, 23, 0.45);
      animation: shutdownPop 0.16s ease-out;
    }
    .shutdown-header { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 20px 24px; border-bottom: 1px solid var(--border); background: linear-gradient(135deg, color-mix(in srgb, var(--panel) 90%, var(--accent)), var(--panel)); }
    .output-modal-heading { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .output-modal-heading > div { min-width: 0; }
    .output-modal-heading h3 { margin: 0; font-size: 19px; }
    .output-modal-heading p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
    .output-modal-icon { width: 42px; height: 42px; min-width: 42px; border-radius: 14px; display: grid; place-items: center; background: var(--accent-gradient); color: #fff; font-size: 20px; box-shadow: var(--glow); }
    .output-modal-icon.warn { background: linear-gradient(135deg, #ef4444, #f97316); }
    .output-modal-close { width: 42px; height: 42px; min-width: 42px; border: 1px solid var(--border); border-radius: 14px; background: color-mix(in srgb, var(--panel) 92%, transparent); color: var(--text); display: grid; place-items: center; cursor: pointer; appearance: none; }
    .output-modal-close svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
    .output-modal-close:hover { background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.42); color: #f87171; }
    .shutdown-meta { flex: 0 0 auto; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--panel) 96%, var(--row)); }
    .backup-exit-note { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)) !important; background: color-mix(in srgb, var(--accent-soft) 70%, transparent) !important; }
    .backup-exit-note b { color: var(--accent) !important; }
    .backup-lifecycle-overlay { z-index: 2147483647; }
    .backup-lifecycle-steps { grid-template-columns: repeat(3, 1fr); }
    .exit-progress-steps { grid-template-columns: repeat(5, minmax(0, 1fr)); }
    .process-step.error { opacity: 1; border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.08); }
    .process-step.error .step-dot { background: #dc2626; color: #fff; }
    .backup-progress-fill.indeterminate { width: 42% !important; animation: backupIndeterminate 1.1s ease-in-out infinite; }
    @keyframes backupIndeterminate {
      0% { transform: translateX(-40%); }
      100% { transform: translateX(180%); }
    }
    .shutdown-meta > div { padding: 13px 18px; border-right: 1px solid var(--border); min-width: 0; }
    .shutdown-meta > div:last-child { border-right: 0; }
    .shutdown-meta span { display: block; color: var(--muted); font-size: 10px; text-transform: uppercase; font-weight: 900; letter-spacing: 0.06em; }
    .shutdown-meta b { display: block; margin-top: 5px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .danger-text { color: #f87171 !important; }
    .shutdown-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 16px 20px 20px; display: grid; gap: 14px; }
    .shutdown-warning { border: 1px solid rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.10); border-radius: 16px; padding: 12px 14px; }
    .shutdown-warning b { display: block; margin-bottom: 4px; color: #fca5a5; }
    .shutdown-warning p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .shutdown-section-head h4 { margin: 0 0 3px; font-size: 14px; }
    .shutdown-section-head p { margin: 0; color: var(--muted); font-size: 12px; }
    .shutdown-list { display: grid; gap: 8px; }
    .shutdown-item { display: grid; grid-template-columns: 42px minmax(0, 1fr) auto; gap: 12px; align-items: center; border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; background: color-mix(in srgb, var(--panel) 88%, var(--row)); }
    .shutdown-item.active { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); }
    .shutdown-item.warn { border-color: rgba(239, 68, 68, 0.40); background: rgba(239, 68, 68, 0.06); }
    .shutdown-item-icon { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center; background: var(--row); border: 1px solid var(--border); font-size: 16px; }
    .shutdown-item-copy b { display: block; font-size: 13px; }
    .shutdown-item-copy small { display: block; margin-top: 3px; color: var(--muted); font-size: 12px; line-height: 1.35; }
    .shutdown-item em { font-style: normal; font-size: 11px; font-weight: 900; color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 5px 9px; white-space: nowrap; }
    .shutdown-item.active em { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); }
    .shutdown-item.warn em { color: #f87171; border-color: rgba(239, 68, 68, 0.35); }
    .shutdown-footer { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 15px 24px; border-top: 1px solid var(--border); background: color-mix(in srgb, var(--panel) 96%, var(--row)); }
    .output-footer-summary b, .output-footer-summary small { display: block; }
    .output-footer-summary b { font-size: 13px; }
    .output-footer-summary small { margin-top: 2px; color: var(--muted); font-size: 11px; }
    .output-footer-actions { display: flex; align-items: center; gap: 9px; }
    .danger-exit { background: linear-gradient(135deg, #ef4444, #dc2626) !important; border-color: transparent !important; }
    @keyframes shutdownPop { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (max-width: 720px) {
      .shutdown-meta { grid-template-columns: 1fr 1fr; }
      .shutdown-meta > div:nth-child(2) { border-right: 0; }
      .shutdown-footer { flex-direction: column; align-items: stretch; }
      .output-footer-actions { justify-content: flex-end; }
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  nav: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '▣' },
    { id: 'billing', label: 'Billing', icon: '₹' },
    { id: 'reports', label: 'Report Typing', icon: '▦' },
    { id: 'masters', label: 'Masters', icon: '⚙' },
    { id: 'consultants', label: 'Consultants', icon: '★' },
    { id: 'analytics', label: 'Analytics', icon: '◒' },
    { id: 'operations', label: 'Operations', icon: '▤' },
    { id: 'collection', label: 'Lab Workflow', icon: '◈' },
    { id: 'statements', label: 'Billing & Statements', icon: '☷' },
    { id: 'patients', label: 'Patient', icon: '☤' },
    { id: 'reportSettings', label: 'Report Settings', icon: '▧' },
    { id: 'billingSettings', label: 'Billing Settings', icon: '₹' },
    { id: 'settings', label: 'Settings & Backup', icon: '☁' }
  ];

  tab = signal('statements');
  theme = signal(localStorage.getItem('lims-theme') || 'dark');
  sideCollapsed = signal(localStorage.getItem('lims-side-collapsed') !== 'false');
  dash = signal<any>(null);
  settings = signal<Record<string, string>>({});
  bills = signal<any[]>([]);
  pdfProcessing = signal(false);
  pdfProgress = signal<any>({stage:'preparing',stageLabel:'Preparing',title:'Preparing your report',message:'Building the report structure...',current:0,total:0,progress:0,statusText:'Starting'});
  private reportProgressUnsubscribe?: () => void;
  private pdfProgressHideTimer?: number;
  billSearchQuery = signal('');
  billSearchResults = signal<any[]>([]);
  activeBillId = signal<number | null>(null);
  quickReportingEnabled = computed(() => String(this.settings()['quickReporting.enabled'] || 'false').toLowerCase() === 'true');
  visibleNav = computed(() => this.nav.filter(n => n.id !== 'dashboard' && n.id !== 'operations' && (this.quickReportingEnabled() ? n.id !== 'collection' : true)));
  title = computed(() => this.nav.find(n => n.id === this.tab())?.label || 'LIMS');
  activeBillIndex = computed(() => { const id = this.activeBillId(); return id ? this.bills().findIndex(b => Number(b.id) === Number(id)) : -1; });
  activeBillNo = computed(() => this.bills().find(b => Number(b.id) === Number(this.activeBillId()))?.bill_no || '');
  activeBillPaymentClass = computed(() => {
    const id = this.activeBillId();
    if (!id) return '';
    const bill = this.bills().find(b => Number(b.id) === Number(id));
    if (!bill) return '';
    const raw = String(bill.payment_status || '').toUpperCase();
    if (raw === 'CANCELLED' || String(bill.status || '').toUpperCase() === 'CANCELLED') return 'pay-cancelled';
    if (raw === 'PAID') return 'pay-paid';
    if (raw === 'PARTIAL') return 'pay-partial';
    if (raw === 'OVERPAID') return 'pay-excess';
    if (raw === 'PENDING') return 'pay-pending';
    const paid = +bill.paid || 0;
    const total = +bill.total || 0;
    if (paid <= 0) return 'pay-pending';
    if (paid > total) return 'pay-excess';
    if (paid >= total) return 'pay-paid';
    return 'pay-partial';
  });
  previousBillNo = computed(() => {
    const rows = this.bills();
    const idx = this.activeBillIndex();
    // In a new bill screen there is no active bill yet. Keep Previous active so the user can jump to the most recent existing bill.
    if (idx < 0) return this.tab() === 'billing' ? rows[0]?.bill_no || '' : '';
    return idx < rows.length - 1 ? rows[idx + 1]?.bill_no || '' : '';
  });
  nextBillNo = computed(() => {
    const idx = this.activeBillIndex();
    return idx > 0 ? this.bills()[idx - 1]?.bill_no || '' : '';
  });
  dialogState = signal({ open: false, title: '', message: '', details: '', tone: 'warning' as ConfirmDialogTone, confirmText: 'Continue', cancelText: 'Cancel', showCancel: true });
  shutdownSheet = signal<ShutdownSheetState | null>(null);
  backupLifecycle = signal<BackupLifecycleState | null>(null);
  exitProgress = signal<ExitProgressState | null>(null);

  @ViewChild(BillingStepperComponent) billingComponent?: BillingStepperComponent;
  @ViewChild(CollectionPageComponent) collectionComponent?: CollectionPageComponent;

  private dialogResolver?: (value: boolean) => void;
  private shutdownResolver?: (value: boolean) => void;
  private startupBackupHandled = false;
  private closeBackupInFlight = false;
  private shutdownProgressUnsubscribe?: () => void;

  billingFooterPrimaryText() {
    return this.tab() === 'billing' ? (this.billingComponent?.footerPrimaryLabel() || 'Save & Continue') : '';
  }

  billingFooterSecondaryText() {
    return this.tab() === 'billing' ? (this.billingComponent?.footerSecondaryLabel() || 'Cancel') : '';
  }

  billingFooterPrimaryDisabled() {
    return this.tab() !== 'billing' || !this.billingComponent || this.billingComponent.footerPrimaryDisabled();
  }

  billingFooterSecondaryDisabled() {
    return this.tab() !== 'billing' || !this.billingComponent || this.billingComponent.footerSecondaryDisabled();
  }

  onBillingFooterPrimary() {
    this.billingComponent?.onFooterPrimary();
  }

  onBillingFooterSecondary() {
    this.billingComponent?.onFooterSecondary();
  }
  private dirtyTimer: any = null;
  private lastDirtyState = false;
  private closeUnsubscribe?: () => void;
  private alreadyRunningUnsubscribe?: () => void;
  private allowElectronClose = false;
  private pointerStart: { x: number; y: number } | null = null;
  private clickCapture?: (event: MouseEvent) => void;
  private pointerDownCapture?: (event: PointerEvent) => void;


  progressPercent = computed(() => Math.max(0, Math.min(100, Number(this.pdfProgress()?.progress || 0))));

  private readonly pdfStageOrder = ['preparing','rendering','blending','building','done'];

  isPdfStageActive(stage:string){ return this.pdfProgress()?.stage === stage; }
  isPdfStageComplete(stage:string){
    const current = this.pdfStageOrder.indexOf(String(this.pdfProgress()?.stage || ''));
    const target = this.pdfStageOrder.indexOf(stage);
    return current > target;
  }
  private handleReportProgress(progress:any){
    if (!progress) return;
    if (this.pdfProgressHideTimer) window.clearTimeout(this.pdfProgressHideTimer);
    this.pdfProgress.update(current => ({...current, ...progress}));
    this.pdfProcessing.set(true);
    if (progress.stage === 'done') {
      this.pdfProgressHideTimer = window.setTimeout(() => this.pdfProcessing.set(false), 850);
    } else if (progress.stage === 'error') {
      this.pdfProgressHideTimer = window.setTimeout(() => this.pdfProcessing.set(false), 2600);
    }
  }

  async ngOnInit(){
    this.applyTheme();
    this.installE2eHooks();
    this.lockBrowserBackNavigation();
    this.installAccidentalNavigationGuards();
    this.dirtyTimer = window.setInterval(() => this.syncDirtyState(), 350);
    this.reportProgressUnsubscribe = window.limsApi.onReportProgress?.((progress:any) => this.handleReportProgress(progress));
    this.closeUnsubscribe = window.limsApi.onCloseRequest?.(async () => {
      if (this.closeBackupInFlight) return;
      const allow = await this.confirmAppClose();
      if (!allow) {
        window.limsApi.closeDecision?.(false);
        return;
      }
      await this.runLiveExitSequence();
    });
    this.alreadyRunningUnsubscribe = window.limsApi.onAlreadyRunning?.(async (payload) => {
      await this.confirm({
        title: payload?.title || 'Already Running',
        message: payload?.message || 'LIMS is already open.',
        details: payload?.details || 'You tried to start the app again from a shortcut. This existing window was brought to the front.',
        tone: 'info',
        confirmText: 'OK',
        showCancel: false
      });
    });
    this.shutdownProgressUnsubscribe = window.limsApi.onShutdownProgress?.((progress: any) => this.handleShutdownProgress(progress));
    await this.reload();
    await this.maybeStartupBackup();
  }

  ngOnDestroy(){
    if (this.dirtyTimer) window.clearInterval(this.dirtyTimer);
    this.closeUnsubscribe?.();
    this.alreadyRunningUnsubscribe?.();
    this.shutdownProgressUnsubscribe?.();
    this.reportProgressUnsubscribe?.();
    if (this.pdfProgressHideTimer) window.clearTimeout(this.pdfProgressHideTimer);
    if (this.clickCapture) window.removeEventListener('click', this.clickCapture, true);
    if (this.pointerDownCapture) window.removeEventListener('pointerdown', this.pointerDownCapture, true);
    this.setElectronDirty(false);
  }

  async onTopRefresh(){
    await this.reload();
    if (this.tab() === 'collection') await this.collectionComponent?.load();
  }

  async reload(){
    const api = window.limsApi;
    this.dash.set(await api.dashboard());
    const currentSettings = await api.getSettings();
    DateTimeSettingsService.sync(currentSettings);
    this.settings.set(currentSettings);
    if (this.tab() === 'dashboard' || this.tab() === 'operations') this.setTab('statements');
    if (String(currentSettings['quickReporting.enabled'] || 'false').toLowerCase() === 'true' && this.tab() === 'collection') this.setTab('reports');
    await this.refreshBills();
  }

  /** Always re-fetch bill navigation list so Previous/Next never stick to app-open snapshot. */
  private async refreshBills(){
    try {
      const rows = await window.limsApi.listBills({ from: '1900-01-01', to: '2999-12-31', q: '' });
      this.bills.set(Array.isArray(rows) ? rows : []);
    } catch {
      // Keep last known list if refresh fails; navigation still uses whatever we have.
    }
  }

  private installE2eHooks(){
    const w = window as any;
    w.__limsE2e = {
      openTab: async (id: string) => {
        if (!this.validTab(id)) return false;
        this.setTab(id);
        await this.reload();
        return true;
      },
      resetWorkflowData: async () => {
        if (!window.limsApi?.resetWorkflowData) return { ok: false, error: 'resetWorkflowData API is not available' };
        const result = await window.limsApi.resetWorkflowData();
        this.clearBillSession();
        await this.reload();
        this.setElectronDirty(false);
        return { ok: true, result };
      }
    };
  }

  async requestTab(id: string){
    if (!this.validTab(id)) return;
    if (id === this.tab()) return;
    if (!(await this.confirmLeaveBilling('navigate'))) return;
    // Leaving Billing discards the session so returning always opens a blank new bill.
    if (this.tab() === 'billing') this.clearBillSession();
    this.setTab(id);
  }

  private setTab(id: string){
    if (!this.validTab(id)) return;
    this.tab.set(id);
    localStorage.setItem('lims-active-tab', id);
    try { window.history.replaceState({ limsScreen: id, guard: true }, document.title); } catch {}
    this.syncDirtyState();
  }

  private clearBillSession(){
    this.activeBillId.set(null);
    this.billSearchQuery.set('');
    this.billSearchResults.set([]);
  }

  onBillCleared(){
    this.clearBillSession();
  }

  private async confirmLeaveBilling(mode: 'navigate' | 'close'){
    if (this.tab() !== 'billing') return true;
    if (!this.billingComponent?.hasUnsavedWork()) return true;
    const ok = await this.confirm({
      title: mode === 'close' ? 'Close application?' : 'Leave Billing?',
      message: mode === 'close'
        ? 'An unfinished bill is still open. Closing now will discard the current billing entry.'
        : 'An unfinished bill is still open. Leaving Billing will discard the current entry.',
      details: 'Complete the bill or clear it first if you do not want this warning.',
      tone: 'danger',
      confirmText: mode === 'close' ? 'Close anyway' : 'Leave anyway',
      cancelText: 'Stay here'
    });
    // User chose to discard — drop top-bar bill session so Billing reopen is a new page.
    if (ok) this.clearBillSession();
    return ok;
  }

  private async confirmAppClose(){
    const sheet = await this.buildShutdownSheet();
    this.shutdownResolver?.(false);
    this.shutdownSheet.set(sheet);
    return new Promise<boolean>(resolve => { this.shutdownResolver = resolve; });
  }

  resolveShutdown(allow: boolean){
    const resolver = this.shutdownResolver;
    this.shutdownResolver = undefined;
    this.shutdownSheet.set(null);
    resolver?.(allow);
  }

  private async buildShutdownSheet(): Promise<ShutdownSheetState> {
    const hasUnsavedBill = this.tab() === 'billing' && !!this.billingComponent?.hasUnsavedWork();
    const backupEnabled = String(this.settings()['backup.enabled'] || 'true').toLowerCase() === 'true';
    const backupOnClose = String(this.settings()['backup.onClose'] || 'true').toLowerCase() === 'true';
    let analyzerRunning = false;
    let analyzerEndpoint = '—';
    try {
      const status = await window.limsApi.analyzerApiStatus?.();
      analyzerRunning = !!status?.running;
      const host = String(status?.host || '127.0.0.1');
      const port = String(status?.port || '');
      analyzerEndpoint = analyzerRunning && port ? `${host}:${port}` : (port ? `configured :${port}` : 'not configured');
    } catch {
      analyzerRunning = false;
    }
    const currentTabLabel = this.title();
    const items: ShutdownSheetItem[] = [
      {
        icon: '☁',
        title: 'Exit database backup',
        detail: backupOnClose
          ? 'A full SQLite backup will run with a progress screen before the window closes.'
          : 'Exit backup is off. Enable it under Settings & Backup → Backup schedule.',
        status: backupOnClose ? 'Will run' : 'Skip',
        active: backupOnClose
      },
      {
        icon: '🔌',
        title: 'Analyzer TCP / API',
        detail: analyzerRunning ? `HTTP listener on ${analyzerEndpoint} will be stopped and the port released.` : 'No analyzer listener is active right now.',
        status: analyzerRunning ? 'Will stop' : 'Idle',
        active: analyzerRunning
      },
      {
        icon: '⏱',
        title: 'Auto backup timer',
        detail: backupEnabled ? 'Scheduled backup interval will be cleared on exit.' : 'Automatic backups are currently disabled.',
        status: backupEnabled ? 'Will stop' : 'Off',
        active: backupEnabled
      },
      {
        icon: '🗄',
        title: 'Database connection',
        detail: 'SQLite will checkpoint and close cleanly before the process exits.',
        status: 'Will close',
        active: true
      },
      {
        icon: '🪟',
        title: 'Application window',
        detail: 'The LIMS desktop window will close after services shut down.',
        status: 'Will close',
        active: true
      },
      {
        icon: '₹',
        title: 'Unsaved billing entry',
        detail: hasUnsavedBill ? 'Current unfinished bill work will be discarded.' : 'No unfinished billing entry on this screen.',
        status: hasUnsavedBill ? 'Will discard' : 'Clear',
        active: hasUnsavedBill,
        warn: hasUnsavedBill
      }
    ];
    return { hasUnsavedBill, analyzerRunning, analyzerEndpoint, backupEnabled, backupOnClose, currentTabLabel, items };
  }

  private async maybeStartupBackup(){
    if (this.startupBackupHandled) return;
    this.startupBackupHandled = true;
    if (String(this.settings()['backup.onStart'] || 'false').toLowerCase() !== 'true') return;
    await this.runLifecycleBackup({
      reason: 'on-start',
      title: 'Startup backup',
      message: 'Creating a fresh copy of the live database before you continue.',
      statusText: 'Almost ready'
    });
  }

  private buildExitSteps(backupOnClose: boolean): ExitProgressStep[] {
    return [
      {
        id: 'backup',
        label: 'Exit backup',
        detail: backupOnClose ? 'Copy database' : 'Skipped',
        state: backupOnClose ? 'pending' : 'skipped'
      },
      { id: 'timer', label: 'Backup timer', detail: 'Stop schedule', state: 'pending' },
      { id: 'analyzer', label: 'Analyzer API', detail: 'Release port', state: 'pending' },
      { id: 'database', label: 'Database', detail: 'Checkpoint & close', state: 'pending' },
      { id: 'window', label: 'Window', detail: 'Quit process', state: 'pending' }
    ];
  }

  private setExitProgress(partial: Partial<ExitProgressState> & { steps?: ExitProgressStep[] }){
    const current = this.exitProgress();
    this.exitProgress.set({
      title: partial.title || current?.title || 'Shutting down LIMS',
      message: partial.message || current?.message || 'Please wait…',
      statusText: partial.statusText || current?.statusText || 'Working',
      progress: Math.max(0, Math.min(100, Number(partial.progress ?? current?.progress ?? 0))),
      phase: partial.phase || current?.phase || 'running',
      steps: partial.steps || current?.steps || []
    });
  }

  private updateExitStep(id: string, state: ExitProgressStep['state'], detail?: string){
    const current = this.exitProgress();
    if (!current) return;
    const steps = current.steps.map(step => step.id === id
      ? { ...step, state, detail: detail || step.detail }
      : step);
    this.setExitProgress({ steps });
  }

  private handleShutdownProgress(progress: any){
    if (!progress || !this.exitProgress()) return;
    const stage = String(progress.stage || '');
    if (stage === 'timer' || stage === 'analyzer' || stage === 'database') {
      const state = progress.status === 'error' ? 'error' : progress.status === 'done' ? 'done' : 'running';
      this.updateExitStep(stage, state, String(progress.message || '').trim() || undefined);
    }
    if (Array.isArray(progress.steps)) {
      for (const remote of progress.steps) {
        const id = String(remote?.id || '');
        if (!id || id === 'backup' || id === 'window') continue;
        const state = remote.state === 'error' ? 'error' : remote.state === 'done' ? 'done' : remote.state === 'running' ? 'running' : 'pending';
        this.updateExitStep(id, state as ExitProgressStep['state']);
      }
    }
    this.setExitProgress({
      title: String(progress.title || 'Shutting down LIMS'),
      message: String(progress.message || 'Stopping services…'),
      statusText: String(progress.statusText || 'Working'),
      progress: Math.max(35, Math.min(92, Number(progress.progress || 50))),
      phase: progress.status === 'error' ? 'error' : 'running'
    });
  }

  private async runLiveExitSequence(){
    this.closeBackupInFlight = true;
    const backupOnClose = String(this.settings()['backup.onClose'] || 'true').toLowerCase() === 'true';
    this.exitProgress.set({
      title: 'Shutting down LIMS',
      message: 'Live status until every service is stopped and the app process exits.',
      statusText: 'Starting',
      progress: 4,
      phase: 'running',
      steps: this.buildExitSteps(backupOnClose)
    });

    try {
      if (backupOnClose) {
        this.updateExitStep('backup', 'running', 'Creating SQLite copy…');
        this.setExitProgress({
          title: 'Exit backup',
          message: 'Creating a fresh copy of the live database before services stop.',
          statusText: 'Backing up',
          progress: 12,
          phase: 'running'
        });
        try {
          await window.limsApi.createBackup('on-close');
          this.updateExitStep('backup', 'done', 'Backup saved');
          this.setExitProgress({ progress: 32, statusText: 'Backup done', message: 'Database copy saved. Stopping services…' });
        } catch (error: any) {
          this.updateExitStep('backup', 'error', 'Backup failed');
          this.exitProgress.set(null);
          this.closeBackupInFlight = false;
          const force = await this.confirm({
            title: 'Exit backup failed',
            message: 'Could not create the exit backup. Exit LIMS anyway?',
            details: String(error?.message || error || 'Backup failed.'),
            tone: 'danger',
            confirmText: 'Exit anyway',
            cancelText: 'Stay here'
          });
          if (!force) {
            window.limsApi.closeDecision?.(false);
            return;
          }
          this.exitProgress.set({
            title: 'Shutting down LIMS',
            message: 'Continuing exit without backup…',
            statusText: 'Continuing',
            progress: 28,
            phase: 'running',
            steps: this.buildExitSteps(false).map(step => step.id === 'backup'
              ? { ...step, state: 'skipped', detail: 'Skipped after failure' }
              : step)
          });
        }
      } else {
        this.updateExitStep('backup', 'skipped', 'Disabled in settings');
        this.setExitProgress({ progress: 18, message: 'Exit backup skipped. Stopping services…' });
      }

      this.setExitProgress({
        title: 'Stopping services',
        message: 'Stopping backup timer, Analyzer API, and closing the database…',
        statusText: 'Services',
        progress: 40,
        phase: 'running'
      });
      this.updateExitStep('timer', 'running');

      if (window.limsApi.prepareShutdown) {
        const result = await window.limsApi.prepareShutdown();
        if (result?.ok === false) {
          throw new Error(String(result?.error || 'Shutdown preparation failed.'));
        }
      } else {
        this.updateExitStep('timer', 'done');
        this.updateExitStep('analyzer', 'done');
        this.updateExitStep('database', 'done');
      }

      this.updateExitStep('timer', 'done');
      this.updateExitStep('analyzer', 'done');
      this.updateExitStep('database', 'done');
      this.updateExitStep('window', 'running', 'Closing process…');
      this.setExitProgress({
        title: 'Closing LIMS',
        message: 'All services stopped. Closing the application window now.',
        statusText: 'Finalizing',
        progress: 98,
        phase: 'running'
      });
      await new Promise(resolve => setTimeout(resolve, 350));
      this.updateExitStep('window', 'done', 'Quitting');
      this.setExitProgress({
        title: 'Closed cleanly',
        message: 'Everything stopped. The process will leave Task Manager now.',
        statusText: 'Done',
        progress: 100,
        phase: 'done'
      });
      await new Promise(resolve => setTimeout(resolve, 280));
      this.allowElectronClose = true;
      this.setElectronDirty(false);
      window.limsApi.closeDecision?.(true);
    } catch (error: any) {
      this.setExitProgress({
        title: 'Shutdown interrupted',
        message: String(error?.message || error || 'Unable to finish shutdown.'),
        statusText: 'Error',
        progress: 100,
        phase: 'error'
      });
      this.closeBackupInFlight = false;
      const force = await this.confirm({
        title: 'Shutdown interrupted',
        message: 'Some services may not have stopped cleanly. Force close the window anyway?',
        details: String(error?.message || error || ''),
        tone: 'danger',
        confirmText: 'Force close',
        cancelText: 'Stay here'
      });
      this.exitProgress.set(null);
      if (!force) {
        window.limsApi.closeDecision?.(false);
        return;
      }
      this.allowElectronClose = true;
      this.setElectronDirty(false);
      window.limsApi.closeDecision?.(true);
    }
  }

  private async runLifecycleBackup(options: { reason: string; title: string; message: string; statusText: string }){
    this.backupLifecycle.set({
      phase: 'running',
      title: options.title,
      message: options.message,
      statusText: options.statusText,
      reason: options.reason === 'on-close' ? 'Exit backup' : options.reason === 'on-start' ? 'Startup backup' : options.reason
    });
    try {
      await window.limsApi.createBackup(options.reason);
      this.backupLifecycle.set({
        phase: 'done',
        title: options.reason === 'on-close' ? 'Backup saved — closing' : 'Backup complete',
        message: options.reason === 'on-close'
          ? 'Database copy saved. LIMS will close now.'
          : 'Database copy saved. Continuing into the app.',
        statusText: 'Done',
        reason: options.reason === 'on-close' ? 'Exit backup' : 'Startup backup'
      });
      await new Promise(resolve => setTimeout(resolve, options.reason === 'on-close' ? 450 : 700));
      this.backupLifecycle.set(null);
      return true;
    } catch (error: any) {
      this.backupLifecycle.set({
        phase: 'error',
        title: 'Backup failed',
        message: String(error?.message || error || 'Unable to create backup.'),
        statusText: 'Error',
        reason: options.reason === 'on-close' ? 'Exit backup' : 'Startup backup'
      });
      await new Promise(resolve => setTimeout(resolve, 900));
      this.backupLifecycle.set(null);
      return false;
    }
  }

  private validTab(id: string | null | undefined){
    return !!id && this.nav.some(n => n.id === id);
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent){
    if (this.allowElectronClose) return;
    if (this.tab() === 'billing' && this.billingComponent?.hasUnsavedWork()) {
      event.preventDefault();
      event.returnValue = '';
    }
  }

  @HostListener('window:dragover', ['$event'])
  preventDragNavigation(event: DragEvent){
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('window:drop', ['$event'])
  preventDropNavigation(event: DragEvent){
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('window:keydown', ['$event'])
  blockAccidentalBrowserNavigation(event: KeyboardEvent){
    if (event.key !== 'Backspace' && !(event.altKey && event.key === 'ArrowLeft')) return;
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isTextInput = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
    if (!isTextInput || (event.altKey && event.key === 'ArrowLeft')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  async newBillFromTopbar(){
    if (!(await this.confirmLeaveBilling('navigate'))) return;
    this.clearBillSession();
    this.setTab('billing');
    await this.refreshBills();
    setTimeout(() => this.billingComponent?.resetBill());
  }

  async onBillSearchFocus(){
    await this.updateBillSearchResults(this.billSearchQuery());
  }

  async onBillSearchChange(value: string){
    this.billSearchQuery.set(value || '');
    await this.updateBillSearchResults(value || '');
  }

  private async updateBillSearchResults(value: string){
    const q = String(value || '').trim();
    if (!q) {
      await this.refreshBills();
      this.billSearchResults.set(this.bills().slice(0, 8));
      return;
    }
    const rows = await window.limsApi.listBills({ from: '1900-01-01', to: '2999-12-31', q });
    this.billSearchResults.set((Array.isArray(rows) ? rows : []).slice(0, 8));
  }

  closeBillSearchResults(){ this.billSearchResults.set([]); }

  async openBillFromStatement(id: number){
    await this.openBill(Number(id));
  }

  async openBillFromSearch(row: any){
    if (!row?.id) return;
    this.billSearchResults.set([]);
    this.billSearchQuery.set(row.bill_no || '');
    await this.openBill(row.id);
  }

  async openAdjacentBill(direction: -1 | 1){
    // Refresh first so Previous/Next track bills created after app open.
    await this.refreshBills();
    const rows = this.bills();
    const idx = this.activeBillIndex();
    // New bill mode: Previous opens the latest existing bill. Next remains inactive.
    if (idx < 0) {
      if (direction === -1 && rows[0]?.id) await this.openBill(rows[0].id);
      return;
    }
    const target = rows[idx - direction];
    if (target?.id) await this.openBill(target.id);
  }

  private async openBill(id: number){
    if (!(await this.confirmLeaveBilling('navigate'))) return;
    this.setTab('billing');
    const full = await window.limsApi.getBill(Number(id));
    if (!full) {
      this.showError('Bill was not found. It may have been deleted or moved.');
      await this.refreshBills();
      return;
    }
    this.activeBillId.set(Number(full.id));
    this.billSearchQuery.set(full.bill_no || '');
    // Upsert in place — never move the opened bill to index 0, or Next stays disabled.
    this.upsertBillInNav(full);
    setTimeout(() => this.billingComponent?.loadExistingBill(full));
  }

  async onBillCreated(bill:any){
    this.setElectronDirty(false);
    this.activeBillId.set(bill?.id ? Number(bill.id) : null);
    this.billSearchQuery.set(bill?.bill_no || '');
    const currentTab = this.tab();
    // Upsert immediately so Previous/Next don't wait on full reload.
    if (bill?.id) this.upsertBillInNav(bill);
    await this.reload();
    // Bill save/update and receipt actions must keep the user on Billing.
    if (currentTab === 'billing') this.setTab('billing');
  }

  /** Keep list order (newest-first from listBills). Only update fields or insert by id DESC. */
  private upsertBillInNav(bill: any) {
    const tip = this.billNavRow(bill);
    const id = Number(tip.id);
    if (!id) return;
    const rows = this.bills().slice();
    const idx = rows.findIndex(b => Number(b.id) === id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...tip };
      this.bills.set(rows);
      return;
    }
    let insertAt = rows.findIndex(b => Number(b.id) < id);
    if (insertAt < 0) insertAt = rows.length;
    rows.splice(insertAt, 0, tip);
    this.bills.set(rows);
  }

  private billNavRow(bill: any) {
    const paid = +bill?.paid || 0;
    const total = +bill?.total || 0;
    const status = String(bill?.status || '').toUpperCase();
    let payment_status = String(bill?.payment_status || '').toUpperCase();
    if (!payment_status) {
      if (status === 'CANCELLED') payment_status = 'CANCELLED';
      else if (paid <= 0) payment_status = 'PENDING';
      else if (paid > total) payment_status = 'OVERPAID';
      else if (paid >= total) payment_status = 'PAID';
      else payment_status = 'PARTIAL';
    }
    return {
      id: bill.id,
      bill_no: bill.bill_no,
      patient_name: bill.name || bill.patient_name,
      total,
      paid,
      due: bill.due,
      status,
      payment_status,
      mobile: bill.mobile
    };
  }

  showError(message: string){
    this.confirm({
      title: 'Action could not be completed',
      message: message || 'Something went wrong while processing the request.',
      tone: 'danger',
      confirmText: 'OK',
      showCancel: false
    });
  }

  onSettingsChanged(settings: Record<string, string>){
    DateTimeSettingsService.sync(settings);
    this.settings.set(settings);
    this.reload();
  }

  toggleTheme(){
    this.theme.set(this.theme()==='dark'?'light':'dark');
    localStorage.setItem('lims-theme', this.theme());
    this.applyTheme();
  }

  toggleSidebar(){
    this.sideCollapsed.set(!this.sideCollapsed());
    localStorage.setItem('lims-side-collapsed', String(this.sideCollapsed()));
  }

  private confirm(options: { title: string; message: string; details?: string; tone?: ConfirmDialogTone; confirmText?: string; cancelText?: string; showCancel?: boolean }){
    this.dialogResolver?.(false);
    this.dialogState.set({
      open: true,
      title: options.title,
      message: options.message,
      details: options.details || '',
      tone: options.tone || 'warning',
      confirmText: options.confirmText || 'Continue',
      cancelText: options.cancelText || 'Cancel',
      showCancel: options.showCancel !== false
    });
    return new Promise<boolean>(resolve => { this.dialogResolver = resolve; });
  }

  resolveDialog(value: boolean){
    const resolver = this.dialogResolver;
    this.dialogResolver = undefined;
    this.dialogState.set({ open: false, title: '', message: '', details: '', tone: 'warning', confirmText: 'Continue', cancelText: 'Cancel', showCancel: true });
    resolver?.(value);
  }

  private installAccidentalNavigationGuards(){
    this.pointerDownCapture = (event: PointerEvent) => {
      this.pointerStart = { x: event.clientX, y: event.clientY };
    };
    this.clickCapture = (event: MouseEvent) => {
      if (!this.pointerStart) return;
      const moved = Math.abs(event.clientX - this.pointerStart.x) + Math.abs(event.clientY - this.pointerStart.y);
      this.pointerStart = null;
      if (moved <= 10) return;
      const target = event.target as HTMLElement | null;
      // Never block focus/activation on form controls — small drag while clicking an input is common.
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], button, a, label, .mat-mdc-menu-panel, .cdk-overlay-pane')) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('pointerdown', this.pointerDownCapture, true);
    window.addEventListener('click', this.clickCapture, true);
  }

  private lockBrowserBackNavigation(){
    try {
      window.history.replaceState({ limsScreen: this.tab() }, document.title);
      window.history.pushState({ limsScreen: this.tab(), guard: true }, document.title);
      window.addEventListener('popstate', () => {
        window.history.pushState({ limsScreen: this.tab(), guard: true }, document.title);
      });
    } catch {}
  }

  private applyTheme(){
    document.body.classList.toggle('light', this.theme()==='light');
    document.body.classList.toggle('dark-theme', this.theme()==='dark');
  }

  private syncDirtyState(){
    const dirty = this.tab() === 'billing' && !!this.billingComponent?.hasUnsavedWork();
    if (dirty === this.lastDirtyState) return;
    this.lastDirtyState = dirty;
    this.setElectronDirty(dirty);
  }

  private setElectronDirty(dirty: boolean){
    try { window.limsApi?.setDirty?.(dirty); } catch {}
  }
}
