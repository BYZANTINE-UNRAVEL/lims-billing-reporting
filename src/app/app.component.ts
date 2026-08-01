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
      <app-billing-stepper *ngIf="tab()==='billing'" (billCreated)="onBillCreated($event)" (errorOccurred)="showError($event)"></app-billing-stepper>
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
  `
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

  @ViewChild(BillingStepperComponent) billingComponent?: BillingStepperComponent;
  @ViewChild(CollectionPageComponent) collectionComponent?: CollectionPageComponent;

  private dialogResolver?: (value: boolean) => void;

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
      const allow = await this.confirmAppClose();
      if (allow) {
        this.allowElectronClose = true;
        this.setElectronDirty(false);
      }
      window.limsApi.closeDecision?.(allow);
    });
    await this.reload();
  }

  ngOnDestroy(){
    if (this.dirtyTimer) window.clearInterval(this.dirtyTimer);
    this.closeUnsubscribe?.();
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
    this.bills.set(await api.listBills({ from: '1900-01-01', to: '2999-12-31', q: '' }));
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
        this.activeBillId.set(null);
        this.billSearchQuery.set('');
        this.billSearchResults.set([]);
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
    this.setTab(id);
  }

  private setTab(id: string){
    if (!this.validTab(id)) return;
    this.tab.set(id);
    localStorage.setItem('lims-active-tab', id);
    try { window.history.replaceState({ limsScreen: id, guard: true }, document.title); } catch {}
    this.syncDirtyState();
  }

  private async confirmLeaveBilling(mode: 'navigate' | 'close'){
    if (this.tab() !== 'billing') return true;
    if (!this.billingComponent?.hasUnsavedWork()) return true;
    return this.confirm({
      title: mode === 'close' ? 'Close application?' : 'Leave Billing?',
      message: mode === 'close'
        ? 'An unfinished bill is still open. Closing now will discard the current billing entry.'
        : 'An unfinished bill is still open. Leaving Billing will discard the current entry.',
      details: 'Complete the bill or clear it first if you do not want this warning.',
      tone: 'danger',
      confirmText: mode === 'close' ? 'Close anyway' : 'Leave anyway',
      cancelText: 'Stay here'
    });
  }

  private async confirmAppClose(){
    const hasUnfinishedBill = this.tab() === 'billing' && !!this.billingComponent?.hasUnsavedWork();
    return this.confirm({
      title: 'Exit application?',
      message: hasUnfinishedBill
        ? 'An unfinished bill is still open. Closing now will discard the current billing entry.'
        : 'Do you really want to close the LIMS application?',
      details: hasUnfinishedBill
        ? 'Complete the bill or clear it first if you do not want this warning.'
        : 'Make sure all work is saved before exiting.',
      tone: hasUnfinishedBill ? 'danger' : 'warning',
      confirmText: 'Exit app',
      cancelText: 'Stay here'
    });
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
    this.setTab('billing');
    this.activeBillId.set(null);
    this.billSearchQuery.set('');
    this.billSearchResults.set([]);
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
      this.billSearchResults.set(this.bills().slice(0, 8));
      return;
    }
    const rows = await window.limsApi.listBills({ from: '1900-01-01', to: '2999-12-31', q });
    this.billSearchResults.set(rows.slice(0, 8));
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
    const rows = this.bills();
    const idx = this.activeBillIndex();
    // New bill mode: Previous should open the latest existing bill. Next remains inactive.
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
      return;
    }
    this.activeBillId.set(Number(full.id));
    this.billSearchQuery.set(full.bill_no || '');
    setTimeout(() => this.billingComponent?.loadExistingBill(full));
  }

  async onBillCreated(bill:any){
    this.setElectronDirty(false);
    this.activeBillId.set(bill?.id ? Number(bill.id) : null);
    const currentTab = this.tab();
    await this.reload();
    // Bill save/update and receipt actions must keep the user on Billing.
    // Quick Reporting remains available from the Report Typing tab, but is no longer opened automatically.
    if (currentTab === 'billing') this.setTab('billing');
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
      if (moved > 10) {
        event.preventDefault();
        event.stopPropagation();
      }
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
