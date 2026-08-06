import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SidebarComponent } from './sidebar.component';

export interface NavItem { id: string; label: string; icon: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent],
  template: `
    <div class="app lims-shell pro-shell" [class.side-collapsed]="collapsed" [class.light]="theme === 'light'">
      <app-sidebar
        [nav]="nav"
        [activeTab]="activeTab"
        [collapsed]="collapsed"
        [theme]="theme"
        [settings]="settings"
        [dashboard]="dashboard"
        (select)="select.emit($event)"
        (toggle)="toggleSidebar.emit()"
        (themeToggle)="themeToggle.emit()">
      </app-sidebar>

      <main class="main-scroll pro-main" [class.billing-main-layout]="showBillTools">
        <header class="topbar pro-topbar fixed-billing-topbar" *ngIf="activeTab !== 'operations' || showBillTools">
          <div class="topbar-title" [class.masters-topbar-title]="activeTab === 'masters'" [class.collection-topbar-title]="activeTab === 'collection'">
            <ng-container *ngIf="activeTab === 'masters'; else nonMastersTopbarTitle">
              <div class="masters-topbar-mark" aria-hidden="true">
                <span></span><span></span><span></span><span></span>
              </div>
              <div class="masters-topbar-copy">
                <h2>Masters</h2>
                <small>Manage billing, report order, tests and profiles.</small>
              </div>
            </ng-container>
            <ng-template #nonMastersTopbarTitle>
              <ng-container *ngIf="activeTab === 'collection'; else plainTopbarTitle">
                <div class="collection-topbar-mark" aria-hidden="true">◈</div>
                <h2>Collection</h2>
              </ng-container>
            </ng-template>
            <ng-template #plainTopbarTitle>
              <ng-container *ngIf="showBillTools; else normalPlainTitle">
                <div class="billing-title-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" class="tool-ico"><path d="M8 3h8l3 3v15H5V3h3z"></path><path d="M16 3v4h4"></path><path d="M8 12h8"></path><path d="M8 16h5"></path><path d="M18 13v6"></path><path d="M15 16h6"></path></svg>
                </div>
                <div class="billing-title-copy"><h2>Billing</h2><small [ngClass]="activeBillPaymentClass">{{ activeBillNo || 'Create new bill' }}</small></div>
              </ng-container>
              <ng-template #normalPlainTitle><h2>{{ title }}</h2></ng-template>
            </ng-template>
          </div>

          <div class="topbar-live-clock" aria-label="Current date and time">
            <span class="live-clock-icon" aria-hidden="true">◷</span>
            <div class="topbar-live-copy">
              <strong>{{ liveTime }}</strong>
              <small>{{ liveDate }}</small>
            </div>
          </div>

          <button class="topbar-refresh-btn" *ngIf="activeTab === 'collection'" type="button" (click)="refresh.emit()">↻ Refresh</button>

          <div class="bill-top-tools" *ngIf="showBillTools">
            <div class="top-bill-search">
              <svg viewBox="0 0 24 24" class="tool-ico"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
              <input
                [ngModel]="billSearchQuery"
                (ngModelChange)="billSearchChange.emit($event)"
                (focus)="openBillSearch()"
                (blur)="scheduleBillSearchClose()"
                (keydown.escape)="closeBillSearch()"
                [ngClass]="activeBillPaymentClass"
                placeholder="Search bill no, patient or mobile">
              <div class="top-search-results" *ngIf="billSearchResults.length">
                <button type="button" *ngFor="let b of billSearchResults" (pointerdown)="$event.preventDefault(); $event.stopPropagation(); billSearchSelect.emit(b)" (mousedown)="$event.preventDefault(); $event.stopPropagation()">
                  <b [ngClass]="billPaymentClass(b)">{{ b.bill_no }}</b>
                  <span>{{ b.patient_name }} · ₹{{ b.total }} · {{ b.mobile || 'No mobile' }}</span>
                </button>
              </div>
            </div>

            <button class="icon-action" type="button" title="{{ previousBillNo ? 'Previous bill: ' + previousBillNo : 'No previous bill' }}" [disabled]="!previousBillNo" (click)="previousBill.emit()">
              <svg viewBox="0 0 24 24" class="tool-ico"><path d="M15 18l-6-6 6-6"></path></svg>
            </button>
            <button class="icon-action" type="button" title="{{ nextBillNo ? 'Next bill: ' + nextBillNo : 'No next bill' }}" [disabled]="!nextBillNo" (click)="nextBill.emit()">
              <svg viewBox="0 0 24 24" class="tool-ico"><path d="M9 6l6 6-6 6"></path></svg>
            </button>
            <button class="icon-action primary-icon" type="button" title="New Bill" (click)="newBill.emit()">
              <svg viewBox="0 0 24 24" class="tool-ico"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>
            </button>
          </div>
        </header>

        <div class="app-content-scroll" [class.has-billing-footer]="showBillTools && showBillingFooter">
          <ng-content></ng-content>

          <footer class="billing-page-footer inline-billing-footer" *ngIf="showBillTools && showBillingFooter">
            <button class="btn secondary" type="button" [disabled]="billingFooterSecondaryDisabled" (click)="billingFooterSecondary.emit()">{{ billingFooterSecondaryText }}</button>
            <button class="btn primary big" type="button" [disabled]="billingFooterPrimaryDisabled" (click)="billingFooterPrimary.emit()">{{ billingFooterPrimaryText }}</button>
          </footer>
        </div>
      </main>
    </div>
  `
})
export class AppShellComponent implements OnInit, OnDestroy {
  private searchBlurTimer: any = null;
  private clockTimer: any = null;
  liveTime = '';
  liveDate = '';

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);
  }

  ngOnDestroy(): void {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.searchBlurTimer) clearTimeout(this.searchBlurTimer);
  }

  private updateClock(): void {
    const now = new Date();
    this.liveTime = new Intl.DateTimeFormat('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).format(now);
    this.liveDate = new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(now);
  }
  @Input() nav: NavItem[] = [];
  @Input() activeTab = 'dashboard';
  @Input() title = 'LIMS';
  @Input() collapsed = true;
  @Input() theme = 'dark';
  @Input() settings: Record<string, string> = {};
  @Input() dashboard: any = null;
  @Input() showBillTools = false;
  @Input() billSearchQuery = '';
  @Input() billSearchResults: any[] = [];
  @Input() activeBillNo = '';
  @Input() activeBillPaymentClass = '';
  @Input() previousBillNo = '';
  @Input() nextBillNo = '';
  @Input() billingFooterPrimaryText = 'Save & Continue';
  @Input() billingFooterSecondaryText = 'Cancel';
  @Input() billingFooterPrimaryDisabled = false;
  @Input() billingFooterSecondaryDisabled = false;
  @Input() showBillingFooter = true;
  @Output() select = new EventEmitter<string>();
  @Output() toggleSidebar = new EventEmitter<void>();
  @Output() themeToggle = new EventEmitter<void>();
  @Output() refresh = new EventEmitter<void>();
  @Output() newBill = new EventEmitter<void>();
  @Output() billSearchChange = new EventEmitter<string>();
  @Output() billSearchFocus = new EventEmitter<void>();
  @Output() billSearchClose = new EventEmitter<void>();
  @Output() billSearchSelect = new EventEmitter<any>();
  @Output() previousBill = new EventEmitter<void>();
  @Output() nextBill = new EventEmitter<void>();
  @Output() billingFooterPrimary = new EventEmitter<void>();
  @Output() billingFooterSecondary = new EventEmitter<void>();

  billPaymentClass(b: any): string {
    const raw = String(b?.payment_status || '').toUpperCase();
    if (raw === 'CANCELLED' || String(b?.status || '').toUpperCase() === 'CANCELLED') return 'pay-cancelled';
    if (raw === 'PAID') return 'pay-paid';
    if (raw === 'PARTIAL') return 'pay-partial';
    if (raw === 'OVERPAID') return 'pay-excess';
    if (raw === 'PENDING') return 'pay-pending';
    const paid = +b?.paid || 0;
    const total = +b?.total || 0;
    if (paid <= 0) return 'pay-pending';
    if (paid > total) return 'pay-excess';
    if (paid >= total) return 'pay-paid';
    return 'pay-partial';
  }
  openBillSearch() {
    if (this.searchBlurTimer) clearTimeout(this.searchBlurTimer);
    this.billSearchFocus.emit();
  }

  scheduleBillSearchClose() {
    if (this.searchBlurTimer) clearTimeout(this.searchBlurTimer);
    this.searchBlurTimer = setTimeout(() => this.billSearchClose.emit(), 180);
  }

  closeBillSearch() {
    if (this.searchBlurTimer) clearTimeout(this.searchBlurTimer);
    this.billSearchClose.emit();
  }

  @HostListener('document:pointerdown', ['$event'])
  closeSearchOnOutsideClick(event: PointerEvent) {
    const target = event.target as Node | null;
    const search = this.host.nativeElement.querySelector('.top-bill-search');
    if (search && target && !search.contains(target)) this.closeBillSearch();
  }

}
