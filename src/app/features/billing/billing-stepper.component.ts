import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';
import { WhatsAppContactPromptComponent } from '../../shared/whatsapp-contact-prompt.component';

@Component({
  selector: 'app-billing-stepper',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatAutocompleteModule, MatInputModule, MatFormFieldModule, MatIconModule, MatCheckboxModule, MatTableModule, MatButtonModule, DragDropModule, WhatsAppContactPromptComponent],
  templateUrl: './billing-stepper.component.html',
  styleUrls: [
    './billing-patient-legacy.component.scss',
    './billing-patient-shell.component.scss',
    './billing-patient-compact.component.scss',
    './billing-registration.component.scss',
    './billing-items-selection.component.scss',
    './billing-items-search.component.scss',
    './billing-items-selected.component.scss',
    './billing-actions.component.scss',
    './billing-payment.component.scss'
  ]
})
export class BillingStepperComponent implements OnInit {
  @ViewChild(WhatsAppContactPromptComponent) private whatsAppPrompt?: WhatsAppContactPromptComponent;
  tests: any[] = [];
  profiles: any[] = [];
  consultants: any[] = [];
  @Output() billCreated = new EventEmitter<any>();
  @Output() billCleared = new EventEmitter<void>();
  @Output() errorOccurred = new EventEmitter<string>();

  step = signal(1);
  patientDetailSection = signal<'basic' | 'contact' | 'other'>('basic');
  creating = signal(false);
  billingPatientResults = signal<any[]>([]);
  consultantResults = signal<any[]>([]);
  lastBill = signal<any>(null);
  snack = signal('');
  snackTone = signal<'success' | 'error' | 'info'>('success');
  billPrintChoice = signal<{ open: boolean; billId: number | null; receiptCount: number }>({ open: false, billId: null, receiptCount: 0 });
  deleteReceiptChoice = signal<{ open: boolean; receipt: any | null }>({ open: false, receipt: null });
  receiptReviewPrompt = signal<{ open: boolean; message: string }>({ open: false, message: '' });
  duplicateMobileModal = signal<{ open: boolean; mobile: string; patients: any[]; proceedAfter: boolean }>({ open: false, mobile: '', patients: [], proceedAfter: false });
  duplicateMobileBypass = '';
  selectedPatientMobileFromSearch = '';
  mobileEditedManually = false;
  duplicateMobileCheckToken = 0;
  patientBillQuery = '';
  billSearch = '';
  billItemResultsCache: any[] = [];
  suggestedBillItemCardsCache: any[] = [];
  private commissionPreviewTimer: any = null;
  private commissionPreviewSeq = 0;
  pendingBillItemSelections: any[] = [];
  private lastPointerBillItemToggleKey = '';
  private lastPointerBillItemToggleAt = 0;
  searchOpen = false;
  showBillItemSuggestions = true;
  billItemActiveIndex = 0;
  private lastBillItemTapAt = 0;
  billItemResultColumns: string[] = ['select', 'name', 'mrp', 'action'];
  bill: any = this.emptyBill();
  editingBillId: number | null = null;
  editingBillNo = '';
  settings: Record<string, string> = {};
  honorificOptions: string[] = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Mx.', 'Baby', 'Baby Boy', 'Baby Girl', 'Master', 'Kumari', 'Child', 'Dr.', 'Prof.', 'Rev.', 'Sr.', 'Br.', 'Elder', 'Baby of'];
  registrationTypeOptions: string[] = ['Walk-in', 'Referral'];
  relationOptions: string[] = ['Father of', 'Mother of', 'Daughter of', 'Son of', 'Baby of', 'Child of', 'Parent', 'Guardian', 'Spouse', 'Self', 'Other'];
  patientRequiredFields: string[] = ['name'];
  billingRequiredFields: string[] = ['items'];
  customOptionModal: { open: boolean; kind: 'honorific' | 'relation' | 'registrationType'; value: string } = { open: false, kind: 'honorific', value: '' };
  consultantQuery = '';
  consultantSearchOpen = false;
  registrationTypeOpen = false;
  consultantModal: { open: boolean; name: string; phone: string; clinic: string } = { open: false, name: '', phone: '', clinic: '' };

  displayConsultantOption = (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.name || '');
  };

  referenceSearchText() {
    return typeof this.consultantQuery === 'string' ? this.consultantQuery : this.displayConsultantOption(this.consultantQuery);
  }

  private escapeHtml(value: any) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  highlightReferenceMatch(value: any) {
    const raw = String(value ?? '');
    const escaped = this.escapeHtml(raw);
    const query = String(this.referenceSearchText() || '').trim();
    if (!query || query.toLowerCase() === 'self') return escaped;
    const terms = Array.from(new Set(query.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 1)));
    if (!terms.length) return escaped;
    const re = new RegExp(`(${terms.map(t => this.escapeRegExp(this.escapeHtml(t))).join('|')})`, 'ig');
    return escaped.replace(re, '<mark class="reference-match-highlight">$1</mark>');
  }

  highlightPatientMatch(value: any) {
    const raw = String(value ?? '');
    const escaped = this.escapeHtml(raw);
    const query = String(this.patientBillQuery || '').trim();
    if (!query || query.length < 2) return escaped;
    const terms = Array.from(new Set(query.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)));
    if (!terms.length) return escaped;
    const re = new RegExp(`(${terms.map(t => this.escapeRegExp(this.escapeHtml(t))).join('|')})`, 'ig');
    return escaped.replace(re, '<mark class="reference-match-highlight">$1</mark>');
  }

  displayBillItemOption = (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    return String(value.name || value.display_name || '');
  };

  billItemAutocompleteSuggestions() {
    if (!this.hasBillSearch()) return [];
    return this.smartSuggestions(true);
  }


  billItemSearchResults() {
    if (!this.hasBillSearch()) return [];
    return this.smartSuggestions(true).slice(0, 20);
  }

  selectedBillItemCount() {
    return this.bill.items.length;
  }

  allVisibleBillItemsSelected() {
    const rows = this.billItemResultsCache;
    return !!rows.length && rows.every((row: any) => this.isBillItemAlreadyAdded(row));
  }

  toggleVisibleBillItems(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.canAddBillItems()) return;
    const query = String(this.billSearch || '').trim();
    const rows = this.billItemResultsCache;
    if (!rows.length) return;
    const allSelected = rows.every((row: any) => this.isBillItemAlreadyAdded(row));
    if (allSelected) {
      const visibleKeys = new Set(rows.map((row: any) => this.billItemKey(row)));
      this.bill.items = this.bill.items.filter((item: any) => {
        if (this.isBillItemLineLocked(item)) return true;
        return !visibleKeys.has(`${item.item_type}:${item.item_id}`);
      });
      this.pendingBillItemSelections = this.pendingBillItemSelections.filter((item: any) => !visibleKeys.has(this.billItemKey(item)));
      this.scheduleCommissionPreview();
      this.billSearch = query;
      this.searchOpen = this.hasBillSearch();
      this.rebuildBillItemCaches();
      return;
    }
    for (const row of rows) {
      if (!this.isBillItemAlreadyAdded(row)) {
        const key = this.billItemKey(row);
        this.addItem(row.itemType, row, false);
        this.pendingBillItemSelections = [...this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key), row];
        this.rememberRecent(key);
      }
    }
    this.billSearch = query;
    this.searchOpen = this.hasBillSearch();
    this.scheduleCommissionPreview();
    this.rebuildBillItemCaches();
  }

  onBillItemResultRowClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.billItemTapAllowed()) return;
    this.toggleBillItemSelection(value);
  }

  onBillItemResultCheckboxClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.billItemTapAllowed()) return;
    this.toggleBillItemSelection(value);
  }

  trackBillItemSuggestion = (_index: number, value: any) => this.billItemKey(value);

  onBillItemResultActionClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.billItemTapAllowed()) return;
    this.toggleBillItemSelection(value);
  }

  clearBillItemSearch() {
    this.billSearch = '';
    this.searchOpen = false;
    this.showBillItemSuggestions = true;
    this.billItemActiveIndex = 0;
    this.rebuildBillItemCaches();
  }

  setBillItemSearch(value: any) {
    this.billSearch = String(value || '').trim();
    this.searchOpen = this.hasBillSearch();
    this.showBillItemSuggestions = !this.hasBillSearch();
    this.billItemActiveIndex = 0;
    this.rebuildBillItemCaches();
  }

  openBillItemSearchOverlay() {
    if (this.hasBillSearch()) {
      this.searchOpen = true;
      this.showBillItemSuggestions = false;
    }
  }

  toggleBillItemFromResult(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    this.toggleBillItemSelection(value);
  }

  addBillItemFromResult(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!value || !this.canAddBillItems()) return;
    if (!this.isBillItemAlreadyAdded(value)) {
      this.addSuggestedBillItem(value);
    }
  }

  removeBillItemAt(index: number) {
    const item = this.bill.items[index];
    if (!item || this.isBillItemLineLocked(item)) return;
    this.bill.items = this.bill.items.filter((_: any, idx: number) => idx !== index);
    this.scheduleCommissionPreview();
  }

  dropSelectedBillItem(event: CdkDragDrop<any[]>) {
    if (this.isCancelledBill() || event.previousIndex === event.currentIndex) return;
    const moving = this.bill.items[event.previousIndex];
    if (this.isBillItemLineLocked(moving)) return;
    const next = [...this.bill.items];
    moveItemInArray(next, event.previousIndex, event.currentIndex);
    this.bill.items = next;
  }

  trackSelectedBillItem = (_index: number, item: any): string => {
    const type = String(item?.item_type || item?.type || 'ITEM');
    const id = String(item?.item_id ?? item?.id ?? item?.name ?? _index);
    return `${type}:${id}`;
  };

  sortBillItemsAlphabetically() {
    this.bill.items = [...(this.bill.items || [])].sort((a: any, b: any) =>
      String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' })
    );
  }

  allowOnlyNumberKey(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'Tab', 'Escape', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }

  onSelectedItemRateChange(item: any, value: string | number): void {
    if (!this.canEditBillItemRate(item)) return;
    const numeric = String(value ?? '').replace(/\D/g, '');
    item.price = numeric ? Number(numeric) : 0;
    item.base_rate = item.price;
    item.mrp = item.price;
    // Do not call refreshCommissionPreview() while typing. It replaces bill.items
    // from the async backend response, which recreates the row and drops input focus.
  }

  onSelectedItemDiscountChange(item: any, value: string | number): void {
    if (!this.canEditBillItemRate(item)) return;
    const numeric = String(value ?? '').replace(/\D/g, '');
    item.discount_value = numeric ? Number(numeric) : 0;
    // Keep focus stable; totals recalculate from the local item immediately.
  }

  toggleSelectedItemDiscountType(item: any): void {
    if (!item || !this.canEditBillItemRate(item)) return;
    item.discount_type = item.discount_type === 'VALUE' ? 'PERCENT' : 'VALUE';
  }

  onBillItemSearchChanged() {
    this.onBillItemSearchInput();
  }

  onBillItemSearchInput() {
    this.searchOpen = this.hasBillSearch();
    this.showBillItemSuggestions = !this.hasBillSearch();
    this.billItemActiveIndex = 0;
    this.rebuildBillItemCaches();
  }

  onBillItemSearchKeydown(event: KeyboardEvent) {
    const rows = this.billItemResultsCache;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.searchOpen = false;
      return;
    }
    if (!rows.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.billItemActiveIndex = Math.min(this.billItemActiveIndex + 1, rows.length - 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.billItemActiveIndex = Math.max(this.billItemActiveIndex - 1, 0);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const active = rows[this.billItemActiveIndex] || rows[0];
      if (active) this.toggleBillItemSelection(active);
    }
  }

  openBillItemSuggestions() {
    this.billSearch = '';
    this.searchOpen = false;
    this.billItemActiveIndex = 0;
    this.showBillItemSuggestions = true;
    this.rebuildBillItemCaches();
  }

  private billItemTapAllowed() {
    if (!this.canAddBillItems()) return false;
    const now = Date.now();
    if (now - this.lastBillItemTapAt < 120) return false;
    this.lastBillItemTapAt = now;
    return true;
  }

  onBillItemSelected(value: any) {
    if (!value) return;
    this.togglePendingBillItem(value);
  }

  onBillItemAutocompleteSelection(event: any, value: any) {
    if (!event?.isUserInput || !value) return;
    this.onBillItemAutocompleteConfirmed(value);
  }

  onBillItemAutocompleteConfirmed(value: any) {
    if (!value || this.isCancelledBill()) return;
    this.toggleBillItemSelection(value);
    this.billSearch = '';
    this.searchOpen = false;
  }

  onBillItemAutocompletePanelClosed() {
    if (typeof this.billSearch !== 'string') this.billSearch = '';
  }

  billItemOptionDescription(value: any) {
    if (!value) return '';
    if (value.itemType === 'PROFILE') {
      const tests = Array.isArray(value.tests) ? value.tests : [];
      const names = tests.map((test: any) => test.display_name || test.name).filter(Boolean).slice(0, 4);
      return names.length ? names.join(', ') : 'Profile tests';
    }
    return value.display_name || value.name || value.code || 'Single test';
  }


  markBillItemPointer(event: Event, value: any) {
    event.preventDefault();
    const key = this.billItemKey(value);
    this.lastPointerBillItemToggleKey = key;
    this.lastPointerBillItemToggleAt = Date.now();
  }

  toggleBillItemFromAutocompleteClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    const key = this.billItemKey(value);
    this.lastPointerBillItemToggleKey = key;
    this.lastPointerBillItemToggleAt = Date.now();
    this.toggleBillItemSelection(value);
    this.billSearch = '';
    this.searchOpen = false;
  }

  billItemKey(value: any) {
    if (!value) return '';
    return value.key || `${value.itemType}:${value.id}`;
  }

  billItemKindLabel(value: any) {
    if (!value) return '';
    if (value.itemType === 'PROFILE') return `Profile · ${value.tests?.length || 0} tests`;
    return `Single · ${value.code || value.shortName || value.display_name || value.name || 'Test'}`;
  }

  isPendingBillItemSelected(value: any) {
    return this.isBillItemAlreadyAdded(value);
  }

  isBillItemAlreadyAdded(value: any) {
    if (!value) return false;
    return this.bill.items.some((i: any) => i.item_type === value.itemType && i.item_id === value.id);
  }

  togglePendingBillItem(value: any) {
    this.toggleBillItemSelection(value);
  }

  toggleBillItemSelection(value: any) {
    if (!value || this.isCancelledBill()) return;
    const key = this.billItemKey(value);
    if (!key) return;
    if (this.isBillItemAlreadyAdded(value)) {
      this.bill.items = this.bill.items.filter((i: any) => !(i.item_type === value.itemType && i.item_id === value.id));
      this.pendingBillItemSelections = this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key);
      this.scheduleCommissionPreview();
    } else {
      this.addItem(value.itemType, value, false);
      this.pendingBillItemSelections = [...this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key), value];
      this.rememberRecent(key);
      this.scheduleCommissionPreview();
    }
    this.searchOpen = this.hasBillSearch();
    this.rebuildBillItemCaches();
  }

  onSuggestedBillItemAddClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    this.addSuggestedBillItem(value);
  }

  onSuggestedBillItemCardClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.billItemTapAllowed()) return;
    this.addSuggestedBillItem(value);
  }

  onSearchResultActionClick(event: Event, value: any) {
    event.preventDefault();
    event.stopPropagation();
    if (!value || !this.canAddBillItems() || this.isBillItemAlreadyAdded(value)) return;
    const key = this.billItemKey(value);
    this.addItem(value.itemType, value, false);
    this.pendingBillItemSelections = [...this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key), value];
    this.rememberRecent(key);
    this.scheduleCommissionPreview();
    this.rebuildBillItemCaches();
    this.searchOpen = true;
  }

  addFirstMatchFromSearch(event: Event) {
    event.preventDefault();
    if (!this.hasBillSearch() || !this.canAddBillItems()) return;
    const first = this.billItemResultsCache[0];
    if (first) this.toggleBillItemSelection(first);
  }

  addSuggestedBillItem(value: any) {
    if (!value || !this.canAddBillItems() || this.isBillItemAlreadyAdded(value)) return;
    const key = this.billItemKey(value);
    this.addItem(value.itemType, value, false);
    this.pendingBillItemSelections = [...this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key), value];
    this.rememberRecent(key);
    this.scheduleCommissionPreview();
    this.billSearch = '';
    this.searchOpen = false;
  }

  togglePendingBillItemFromPointer(event: Event, value: any) {
    this.swallowPickerEvent(event);
    const key = this.billItemKey(value);
    const now = Date.now();
    if (key && key === this.lastPointerBillItemToggleKey && now - this.lastPointerBillItemToggleAt < 300) return;
    this.lastPointerBillItemToggleKey = key;
    this.lastPointerBillItemToggleAt = now;
    this.toggleBillItemSelection(value);
  }

  removePendingBillItem(value: any) {
    const key = this.billItemKey(value);
    this.pendingBillItemSelections = this.pendingBillItemSelections.filter(item => this.billItemKey(item) !== key);
  }

  addPendingBillItems() {
    if (this.isCancelledBill()) return;
    this.billSearch = '';
    this.searchOpen = false;
  }

  highlightBillItemMatch(value: any) {
    const raw = String(value ?? '');
    const escaped = this.escapeHtml(raw);
    const query = String(this.billSearch || '').trim();
    if (!query || query.length < 2) return escaped;
    const terms = Array.from(new Set(query.split(/\s+/).map(t => t.trim()).filter(t => t.length >= 2)));
    if (!terms.length) return escaped;
    const re = new RegExp(`(${terms.map(t => this.escapeRegExp(this.escapeHtml(t))).join('|')})`, 'ig');
    return escaped.replace(re, '<mark class="reference-match-highlight">$1</mark>');
  }


  billableTests() { return this.tests.filter(t => Number(t.active) === 1 && Number(t.billable) === 1); }
  billableProfiles() { return this.profiles.filter(p => Number(p.active) === 1 && Number(p.billable) === 1); }
  hasBillSearch() { return String(this.billSearch || '').trim().length >= 2; }

  allBillableOptions() {
    return [
      ...this.billableProfiles().map(p => this.toSuggestion('PROFILE', p)),
      ...this.billableTests().map(t => this.toSuggestion('TEST', t))
    ];
  }

  allBillableSuggestions() {
    return this.allBillableOptions().filter(s => !this.bill.items.some((i: any) => i.item_type === s.itemType && i.item_id === s.id));
  }

  smartSuggestions(includeSelected = false) {
    const q = String(this.billSearch || '').trim().toLowerCase();
    const recentKeys = this.loadRecentKeys();
    const all = includeSelected ? this.allBillableOptions() : this.allBillableSuggestions();
    if (q.length < 2) {
      return all
        .map(s => ({ ...s, _score: this.recentScore(s.key, recentKeys) + this.defaultPopularityScore(s), reason: this.recentScore(s.key, recentKeys) ? 'Recent' : 'Suggested' }))
        .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)))
        .slice(0, 8);
    }
    return all
      .map(s => ({ ...s, _score: this.searchScore(s, q, recentKeys), reason: this.reasonForSuggestion(s, q, recentKeys) }))
      .filter(s => s._score > 0)
      .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)))
      .slice(0, 8);
  }

  suggestedItems() { return this.smartSuggestions(); }

  openSmartSuggestions() { this.searchOpen = true; }

  recentItems() { return this.smartSuggestions(); }

  rebuildBillItemCaches() {
    this.billItemResultsCache = this.hasBillSearch() ? this.smartSuggestions(true).slice(0, 20) : [];
    this.suggestedBillItemCardsCache = this.buildSuggestedBillItemCards();
    if (this.billItemActiveIndex >= this.billItemResultsCache.length) {
      this.billItemActiveIndex = Math.max(this.billItemResultsCache.length - 1, 0);
    }
  }

  popularBillItemSuggestions() {
    const queryBefore = this.billSearch;
    if (String(queryBefore || '').trim().length >= 2) {
      return this.smartSuggestions().slice(0, 5);
    }
    const recentKeys = this.loadRecentKeys();
    return this.allBillableSuggestions()
      .map(s => ({ ...s, _score: this.recentScore(s.key, recentKeys) + this.defaultPopularityScore(s), reason: this.recentScore(s.key, recentKeys) ? 'Recent' : 'Popular' }))
      .sort((a, b) => b._score - a._score || String(a.name).localeCompare(String(b.name)))
      .slice(0, 5);
  }

  buildSuggestedBillItemCards() {
    const recentKeys = this.loadRecentKeys();
    const rank = (s: any) => ({
      ...s,
      _score: this.recentScore(s.key, recentKeys) + this.defaultPopularityScore(s),
      reason: this.recentScore(s.key, recentKeys) ? 'Recent' : 'Suggested'
    });
    const byScoreThenName = (a: any, b: any) =>
      b._score - a._score || String(a.name || a.display_name || '').localeCompare(String(b.name || b.display_name || ''));

    // Default suggestion cards are intentionally balanced:
    // first 5 single tests, then 4 profiles = 9 cards total.
    const available = this.allBillableSuggestions().map(rank);
    const singleTests = available
      .filter((s: any) => s.itemType === 'TEST')
      .sort(byScoreThenName)
      .slice(0, 5);
    const profiles = available
      .filter((s: any) => s.itemType === 'PROFILE')
      .sort(byScoreThenName)
      .slice(0, 4);

    return [...singleTests, ...profiles];
  }

  suggestedBillItemCards() { return this.suggestedBillItemCardsCache; }

  async ngOnInit() { await this.loadBillingMasters(); }

  async loadBillingMasters() {
    const api = window.limsApi;
    this.settings = await api.getSettings();
    this.honorificOptions = this.parseSettingList(this.settings['patient.honorifics'], this.honorificOptions);
    this.relationOptions = this.parseSettingList(this.settings['patient.relationTypes'], this.relationOptions);
    this.registrationTypeOptions = this.parseSettingList(this.settings['billing.registrationTypes'], this.registrationTypeOptions);
    this.patientRequiredFields = this.parseSettingList(this.settings['patient.requiredFields'], ['name']);
    this.billingRequiredFields = this.parseSettingList(this.settings['billing.requiredFields'], ['items']);
    this.tests = await api.listTests();
    this.profiles = await api.listProfiles();
    this.consultants = await api.listConsultants();
    this.applyRegistrationDefaults();
    this.consultantQuery = this.selectedConsultantName() || this.consultantQuery;
    this.rebuildBillItemCaches();
  }

  parseSettingList(value: any, fallback: string[]) { const items = String(value || '').split(',').map(x => x.trim()).filter(Boolean); return items.length ? Array.from(new Set(items)) : fallback; }

  patientFieldsCapsEnabled() {
    const mode = String(this.settings?.['patient.fieldsCaps'] || 'off').trim().toLowerCase();
    return mode === 'upper' || mode === 'uppercase' || mode === 'caps' || mode === 'true' || mode === '1' || mode === 'on';
  }

  applyPatientFieldsCapsUi() {
    if (!this.patientFieldsCapsEnabled() || !this.bill?.patient) return;
    const up = (v: any) => {
      const s = String(v ?? '').trim();
      return s ? s.toUpperCase() : String(v ?? '');
    };
    const p = this.bill.patient;
    p.title = up(p.title);
    p.name = up(p.name);
    p.relation_type = up(p.relation_type);
    p.guardian_name = up(p.guardian_name);
    p.address = up(p.address);
    p.history = up(p.history);
    p.gender = up(p.gender);
  }

  consultantSearchScore(c: any, q: string) {
    const name = String(c.name || '').toLowerCase();
    const phone = String(c.phone || '').toLowerCase();
    const clinic = String(c.clinic || '').toLowerCase();
    const hay = [name, phone, clinic].filter(Boolean).join(' ');
    if (!q) return 5;
    const terms = q.split(/\s+/).filter(Boolean);
    let score = 0;
    if (name === q) score += 120;
    if (name.startsWith(q)) score += 80;
    if (phone.startsWith(q)) score += 70;
    if (clinic.startsWith(q)) score += 45;
    for (const term of terms) {
      if (name.startsWith(term)) score += 35;
      else if (name.includes(term)) score += 20;
      if (phone.includes(term)) score += 18;
      if (clinic.includes(term)) score += 12;
    }
    if (terms.every(t => hay.includes(t))) score += 25;
    return score;
  }
  filteredConsultants(q = this.consultantQuery) {
    const query = String(q || '').trim().toLowerCase();
    const active = (this.consultants || []).filter((c: any) => Number(c.active ?? 1) === 1);
    return active
      .map((c: any) => ({ ...c, _score: this.consultantSearchScore(c, query) }))
      .filter((c: any) => query ? c._score > 0 : c._score > 0)
      .sort((a: any, b: any) => b._score - a._score || String(a.name).localeCompare(String(b.name)))
      .slice(0, query ? 8 : 5);
  }
  consultantAutocompleteOptions() {
    const q = String(this.consultantQuery || '').trim();
    return q.length >= 1 ? this.consultantResults() : [];
  }
  shouldShowConsultantEmpty() {
    return this.consultantSearchOpen && String(this.consultantQuery || '').trim().length >= 1 && this.consultantResults().length === 0;
  }
  private runConsultantAutocompleteSearch() {
    const q = String(this.consultantQuery || '').trim();
    if (q.length >= 1) {
      this.consultantResults.set(this.filteredConsultants(q));
      this.consultantSearchOpen = true;
    } else {
      this.clearConsultantResults();
    }
  }
  searchRegistrationReference() {
    if (!this.requiresReference()) { this.applyRegistrationDefaults(); return; }
    this.bill.consultant_id = null;
    this.runConsultantAutocompleteSearch();
  }
  openRegistrationReferenceSearch() {
    this.registrationTypeOpen = false;
    if (!this.requiresReference() || !this.patientEditable()) return;
    this.runConsultantAutocompleteSearch();
  }
  searchPatientConsultantsForBilling() {
    const q = String(this.consultantQuery || '').trim();
    this.bill.consultant_id = null;
    if (!q) {
      this.bill.referrer_type = 'Walk-in';
    }
    this.runConsultantAutocompleteSearch();
  }
  openPatientConsultantSearch() {
    this.registrationTypeOpen = false;
    if (!this.patientEditable() || !this.requiresReference()) return;
    this.runConsultantAutocompleteSearch();
  }
  searchConsultantsForBilling() {
    this.searchPatientConsultantsForBilling();
  }
  clearConsultantResults() {
    this.consultantResults.set([]);
    this.consultantSearchOpen = false;
  }
  toggleRegistrationTypeMenu(ev?: Event) {
    ev?.preventDefault();
    ev?.stopPropagation();
    if (!this.patientEditable()) return;
    this.registrationTypeOpen = !this.registrationTypeOpen;
  }
  selectRegistrationType(value: string) {
    this.bill.referrer_type = value;
    this.registrationTypeOpen = false;
    this.onRegistrationTypeChanged();
  }
  normalizedRegistrationType() { return String(this.bill?.referrer_type || 'Walk-in').trim(); }
  isWalkInRegistration() { return this.normalizedRegistrationType().toLowerCase() === 'walk-in'; }
  requiresReference() { return !this.isWalkInRegistration(); }
  canGoRegistration() { return !!this.normalizedRegistrationType() && (!this.requiresReference() || !!this.bill.consultant_id); }
  applyRegistrationDefaults() {
    if (!this.bill) return;
    const configuredType = String(this.settings?.['billing.defaultRegistrationType'] || '').trim();
    if (!this.editingBillId && configuredType) this.bill.referrer_type = configuredType;
    if (!this.bill.referrer_type) this.bill.referrer_type = configuredType || 'Walk-in';
    const configuredReferenceId = +(this.settings?.['billing.defaultReferenceId'] || 0);
    if (this.requiresReference() && configuredReferenceId && !this.bill.consultant_id) {
      const found = (this.consultants || []).find((c:any) => +c.id === configuredReferenceId);
      if (found) {
        this.bill.consultant_id = +found.id;
        this.consultantQuery = found.name || '';
        if (this.bill.patient) {
          this.bill.patient.referrer_type = this.bill.referrer_type;
          this.bill.patient.consultant_id = this.bill.consultant_id;
        }
      }
    }
    this.syncRegistrationToPatientFields();
  }

  private syncRegistrationToPatientFields() {
    if (!this.bill) return;
    if (this.isWalkInRegistration()) {
      this.bill.consultant_id = null;
      this.consultantQuery = 'Self';
      this.clearConsultantResults();
      return;
    }
    if (!this.consultantQuery || String(this.consultantQuery).trim().toLowerCase() === 'self') {
      this.consultantQuery = this.selectedConsultantName();
    }
  }

  onRegistrationTypeChanged() {
    this.registrationTypeOpen = false;
    this.syncRegistrationToPatientFields();
    this.scheduleCommissionPreview();
  }

  onPatientReferrerTypeChanged() {
    this.onRegistrationTypeChanged();
  }
  openReferenceSearch() {
    this.openRegistrationReferenceSearch();
  }
  selectFirstConsultantForBill(ev?: Event) {
    ev?.preventDefault();
    const first = this.consultantResults()[0];
    if (first) this.selectConsultantForBill(first);
    else this.clearConsultantResults();
  }
  selectConsultantForBill(c: any) {
    if (c?.id && this.isWalkInRegistration()) this.bill.referrer_type = 'Referral';
    this.bill.consultant_id = c?.id ?? null;
    this.consultantQuery = c?.name || '';
    this.clearConsultantResults();
    this.scheduleCommissionPreview();
  }

  onConsultantAutocompleteSelection(event: any, c: any) {
    if (!event?.isUserInput || !c) return;
    this.selectConsultantForBill(c);
  }
  selectNoConsultantForBill() {
    this.bill.referrer_type = 'Walk-in';
    this.bill.consultant_id = null;
    this.consultantQuery = 'Self';
    this.clearConsultantResults();
    this.scheduleCommissionPreview();
  }
  openConsultantModal() { this.consultantModal = { open: true, name: this.consultantQuery && !['No consultant','Self'].includes(this.consultantQuery) ? this.consultantQuery : '', phone: '', clinic: '' }; }
  closeConsultantModal() { this.consultantModal = { open: false, name: '', phone: '', clinic: '' }; }
  async saveQuickConsultant() {
    const name = String(this.consultantModal.name || '').trim();
    if (!name) { this.notify('Consultant name is required.', 'error'); return; }
    const updated = await window.limsApi.saveConsultant({ name, phone: this.consultantModal.phone || '', clinic: this.consultantModal.clinic || '', active: 1, default_commission_type: 'PERCENT', default_commission_value: 0 });
    this.consultants = updated || [];
    const created = this.consultants.find((c: any) => String(c.name || '').toLowerCase() === name.toLowerCase()) || this.consultants[this.consultants.length - 1];
    if (created) this.selectConsultantForBill(created);
    this.closeConsultantModal();
    this.notify(`${name} added to consultants.`);
  }
  isPatientFieldRequired(key: string) { return this.patientRequiredFields.includes(key); }
  isBillingFieldRequired(key: string) { return this.billingRequiredFields.includes(key); }
  openCustomOption(kind: 'honorific' | 'relation' | 'registrationType') { this.customOptionModal = { open: true, kind, value: '' }; }
  closeCustomOption() { this.customOptionModal = { ...this.customOptionModal, open: false, value: '' }; }
  async saveCustomOption() {
    const value = this.customOptionModal.value.trim();
    if (!value) return;
    const kind = this.customOptionModal.kind;
    const key = kind === 'honorific' ? 'patient.honorifics' : kind === 'relation' ? 'patient.relationTypes' : 'billing.registrationTypes';
    const fallback = kind === 'honorific' ? this.honorificOptions : kind === 'relation' ? this.relationOptions : this.registrationTypeOptions;
    const current = this.parseSettingList(this.settings[key], fallback);
    const next = Array.from(new Set([...current, value]));
    this.settings[key] = next.join(',');
    const saved = await window.limsApi.saveSettings(this.settings);
    this.settings = saved;
    if (kind === 'honorific') { this.honorificOptions = next; this.bill.patient.title = value; this.onHonorificChanged(); }
    else if (kind === 'relation') { this.relationOptions = next; this.bill.patient.relation_type = value; }
    else { this.registrationTypeOptions = next; this.bill.referrer_type = value; this.onRegistrationTypeChanged(); }
    this.closeCustomOption();
    this.notify(`${value} added to ${kind === 'honorific' ? 'honorifics' : kind === 'relation' ? 'relations' : 'registration types'}.`);
  }
  customOptionTitle() { return this.customOptionModal.kind === 'honorific' ? 'Add honorific' : this.customOptionModal.kind === 'relation' ? 'Add relation label' : 'Add registration type'; }
  customOptionPlaceholder() { return this.customOptionModal.kind === 'honorific' ? 'Example: Baby of' : this.customOptionModal.kind === 'relation' ? 'Example: Daughter of' : 'Example: Camp'; }
  billingValidationMessage(stepOnly = false) {
    const p = this.bill.patient || {};
    const missing: string[] = [];
    const checks: Record<string, [string, any]> = {
      title: ['Honorific', p.title], name: ['Patient name', p.name], dob: ['Date of birth', p.dob], age: ['Age', p.age_value || p.age],
      gender: ['Gender', p.gender], mobile: ['Mobile', p.mobile], email: ['Email', p.email], relation: ['Relation / guardian', p.relation_type],
      guardian: ['Parent / guardian name', p.guardian_name], address: ['Address', p.address], history: ['Clinical notes', p.history]
    };
    for (const key of this.patientRequiredFields) if (!String(checks[key]?.[1] ?? '').trim()) missing.push(checks[key]?.[0] || key);
    if (!stepOnly) {
      if (this.isBillingFieldRequired('consultant') && this.requiresReference() && !this.bill.consultant_id) missing.push('Consultant');
      if (this.isBillingFieldRequired('items') && !(this.bill.items || []).length) missing.push('At least one test/profile');
      if (this.isBillingFieldRequired('payment_mode') && !String(this.bill.payment_mode || '').trim()) missing.push('Payment mode');
      if (this.isBillingFieldRequired('notes') && !String(this.bill.notes || '').trim()) missing.push('Bill notes');
    }
    return missing.length ? `Required: ${missing.join(', ')}` : '';
  }

  emptyBill() {
    return { patient: { age_unit: 'YEARS', age_split: false }, referrer_type: 'Walk-in', consultant_id: null, items: [], receipts: [], discount_type: 'VALUE', discount_value: 0, round_mode: 'NONE', paid: 0, cash_received: 0, payment_mode: 'Cash', status: 'BILLED' };
  }

  canGoItems() { return !this.billingValidationMessage(true); }
  canGoPayment() { return this.canGoItems() && this.bill.items.length > 0; }

  footerSecondaryLabel() {
    if (this.step() === 1) return 'Cancel';
    return 'Back';
  }

  footerPrimaryLabel() {
    if (this.step() === 1) return 'Continue';
    if (this.step() === 2) return 'Save & Continue';
    if (this.step() === 3) return 'Continue to Payment';
    if (this.isCancelledBill()) return 'Cancelled - Read Only';
    if (this.creating()) return this.editingBillId ? 'Updating Bill...' : 'Creating Bill...';
    return this.editingBillId ? 'Update Bill' : 'Create Bill';
  }

  footerSecondaryDisabled() {
    return this.step() === 1 && this.isCancelledBill();
  }

  footerPrimaryDisabled() {
    if (this.step() === 1) return !this.canGoRegistration();
    if (this.step() === 2) return !this.canGoItems();
    if (this.step() === 3) return !this.canGoPayment();
    return this.isCancelledBill() || this.creating() || !this.canGoPayment();
  }

  onFooterSecondary() {
    if (this.step() === 1) { this.resetBill(); return; }
    if (this.step() === 2) { this.step.set(1); return; }
    if (this.step() === 3) { this.step.set(2); return; }
    this.step.set(3);
  }

  onFooterPrimary() {
    if (this.footerPrimaryDisabled()) return;
    if (this.step() === 1) { this.step.set(2); return; }
    if (this.step() === 2) { this.attemptContinueFromPatient(); return; }
    if (this.step() === 3) { this.step.set(4); return; }
    this.createBill();
  }
  matchesSearch(text: string, q: string) {
    if (!q) return true;
    const target = (text || '').toLowerCase();
    return q.split(/\s+/).filter(Boolean).every(part => target.includes(part));
  }
  suggestionText(s: any) {
    return `${s.name || ''} ${s.display_name || ''} ${s.code || ''} ${s.search_keywords || ''} ${s.side_header || ''} ${s.department_name || ''} ${s.unit_name || ''} ${s.meta || ''} ${(s.tests || []).map((x: any) => x.test_name || '').join(' ')}`.toLowerCase();
  }
  acronym(text: string) {
    return String(text || '').split(/[^a-zA-Z0-9]+/).filter(Boolean).map(x => x[0]).join('').toLowerCase();
  }
  recentScore(key: string, recentKeys: string[]) {
    const idx = recentKeys.indexOf(key);
    return idx >= 0 ? 120 - idx * 8 : 0;
  }
  defaultPopularityScore(s: any) {
    const name = String(s.display_name || s.name || '').toLowerCase();
    const order = +s.billing_order || +s.report_order || +s.priority || 999999;
    let score = 80 - Math.min(70, Math.floor(order / 100));
    if (s.itemType === 'PROFILE') score += 20;
    if (s.department_name && String(s.department_name).toLowerCase() !== 'mixed') score += 8;
    if (/complete blood|cbc|renal|rft|liver|lft|thyroid|lipid|sugar|glucose/.test(name)) score += 25;
    return score;
  }
  searchScore(s: any, q: string, recentKeys: string[]) {
    const text = this.suggestionText(s);
    const name = String(s.display_name || s.name || '').toLowerCase();
    const code = String(s.code || '').toLowerCase();
    const acro = this.acronym(s.display_name || s.name);
    const parts = q.split(/\s+/).filter(Boolean);
    let score = this.recentScore(s.key, recentKeys) + this.defaultPopularityScore(s);
    const keyword = String(s.search_keywords || '').toLowerCase();
    if (code === q) score += 420;
    if (name === q || acro === q) score += 340;
    if (code.startsWith(q)) score += 260;
    if (name.startsWith(q)) score += 220;
    if (keyword.split(/[,;\s]+/).includes(q)) score += 190;
    if (name.includes(q) || code.includes(q) || acro.includes(q) || keyword.includes(q)) score += 120;
    const allPartsMatch = parts.every(part => text.includes(part) || acro.includes(part));
    if (!allPartsMatch) return 0;
    score += parts.reduce((sum, part) => sum + (code === part ? 160 : code.startsWith(part) ? 110 : name.startsWith(part) ? 80 : keyword.includes(part) ? 70 : acro.includes(part) ? 60 : text.includes(part) ? 35 : 0), 0);
    return score;
  }
  reasonForSuggestion(s: any, q: string, recentKeys: string[]) {
    if (this.recentScore(s.key, recentKeys)) return 'Recent';
    if (String(s.code || '').toLowerCase().includes(q) || this.acronym(s.name).includes(q)) return 'Code match';
    if (String(s.display_name || s.name || '').toLowerCase().includes(q)) return 'Name match';
    return 'Smart match';
  }

  onPatientLookupQueryChange(value: any) {
    if (typeof value !== 'string') return;
    this.patientBillQuery = value;
    this.searchPatientsForBilling();
  }

  async searchPatientsForBilling() {
    const q = String(this.patientBillQuery || '').trim();
    this.billingPatientResults.set(q.length >= 2 ? await window.limsApi.listPatients(q) : []);
  }

  clearPatientSearchResults() {
    this.billingPatientResults.set([]);
  }

  focusPatientSearch() {
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>('.top-patient-search input');
      input?.focus();
      this.searchPatientsForBilling();
    });
  }

  startFreshPatient() {
    if (!this.patientEditable()) return;
    this.bill.patient = { age_unit: 'YEARS', age_split: false };
    this.patientBillQuery = '';
    this.billingPatientResults.set([]);
    this.selectedPatientMobileFromSearch = '';
    this.mobileEditedManually = false;
    this.duplicateMobileBypass = '';
    this.focusPatientSearch();
  }

  @HostListener('document:mousedown', ['$event'])
  closePatientSearchOnOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.top-patient-search')) return;
    if (target.closest('.template-search, .template-search-popover, .template-chips, .template-suggested')) {
      this.clearPatientSearchResults();
      return;
    }
    if (target.closest('.mat-mdc-autocomplete-panel, .mat-autocomplete-panel, .cdk-overlay-pane, .cdk-overlay-container')) return;
    this.clearPatientSearchResults();
    this.searchOpen = false;
  }
  selectPatientForBill(p: any) {
    this.bill.patient = this.normalizePatient(p);
    this.applyPatientFieldsCapsUi();
    this.syncAgeText();
    this.patientBillQuery = this.patientSearchLabel(p);
    this.billingPatientResults.set([]);
    this.duplicateMobileModal.set({ open: false, mobile: '', patients: [], proceedAfter: false });
    // Existing-patient selection is already intentional. Do not show the duplicate-mobile review modal again
    // unless the user manually changes the mobile number field after selection.
    this.selectedPatientMobileFromSearch = this.normalizeMobile(p.mobile);
    this.mobileEditedManually = false;
    this.duplicateMobileBypass = this.selectedPatientMobileFromSearch;
  }

  onPatientAutocompleteSelection(event: any, p: any) {
    if (!event?.isUserInput || !p) return;
    this.selectPatientForBill(p);
  }

  onMobileEdited() {
    const current = this.normalizeMobile(this.bill.patient?.mobile);
    if (!this.selectedPatientMobileFromSearch || current !== this.selectedPatientMobileFromSearch) {
      this.mobileEditedManually = true;
      this.duplicateMobileBypass = '';
    }
  }

  normalizeMobile(value: any) { return String(value || '').replace(/\D+/g, ''); }

  async checkMobileDuplicate(proceedAfter = false) {
    const mobile = this.normalizeMobile(this.bill.patient?.mobile);
    if (mobile.length < 6 || this.isCancelledBill()) return false;
    // Only open the duplicate-patient review when the mobile number was entered/changed manually.
    // Selecting an existing patient from the search box should fill silently and continue without a review popup.
    if (this.selectedPatientMobileFromSearch && mobile === this.selectedPatientMobileFromSearch && !this.mobileEditedManually) return false;
    if (this.duplicateMobileBypass === mobile && proceedAfter) return false;
    const token = ++this.duplicateMobileCheckToken;
    const rows = await window.limsApi.listPatients(mobile);
    if (token !== this.duplicateMobileCheckToken) return false;
    const currentId = Number(this.bill.patient?.id || 0);
    const matches = (rows || []).filter((p: any) => this.normalizeMobile(p.mobile) === mobile && Number(p.id || 0) !== currentId);
    if (!matches.length) return false;
    this.duplicateMobileModal.set({ open: true, mobile: this.bill.patient.mobile, patients: matches.slice(0, 8), proceedAfter });
    return true;
  }

  async attemptContinueFromPatient() {
    const validationError = this.billingValidationMessage(true);
    if (validationError) { this.notify(validationError, 'error'); return; }
    const blocked = await this.checkMobileDuplicate(true);
    if (!blocked) this.step.set(3);
  }

  useDuplicatePatient(p: any) {
    const proceedAfter = this.duplicateMobileModal().proceedAfter;
    this.selectPatientForBill(p);
    if (proceedAfter) this.step.set(3);
  }

  closeDuplicateMobileModal() {
    this.duplicateMobileModal.set({ open: false, mobile: '', patients: [], proceedAfter: false });
  }

  proceedWithNewPatientDespiteDuplicate() {
    const mobile = this.normalizeMobile(this.bill.patient?.mobile);
    const proceedAfter = this.duplicateMobileModal().proceedAfter;
    this.duplicateMobileBypass = mobile;
    this.closeDuplicateMobileModal();
    this.notify('Continuing with a new patient using the same mobile number.');
    if (proceedAfter) this.step.set(3);
  }

  toSuggestion(type: 'TEST' | 'PROFILE', x: any) {
    const meta = type === 'PROFILE'
      ? `${x.tests?.length || 0} tests · ${x.code || x.side_header || 'Profile'}`
      : `${x.code || 'Test'} · ${x.department_name || 'General'}${x.unit_name ? ' · ' + x.unit_name : ''}`;
    return {
      ...x,
      key: `${type}:${x.id}`,
      itemType: type,
      typeLabel: type === 'PROFILE' ? 'Profile' : 'Test',
      shortName: this.shortName(x.display_name || x.name),
      meta
    };
  }

  shortName(name: string) {
    const text = String(name || '').trim();
    return text.length > 18 ? text.slice(0, 17) + '…' : text;
  }

  addFirstMatch() {
    if (!this.hasBillSearch()) return;
    const first = this.billItemAutocompleteSuggestions()[0];
    if (first) {
      this.addSuggestedBillItem(first);
    }
  }

  addFirstMatchFromPointer(event: Event) {
    this.swallowPickerEvent(event);
    this.addPendingBillItems();
  }

  selectSuggestedItem(event: Event, s: any) {
    this.swallowPickerEvent(event);
    this.addSuggestedItem(s);
  }

  private swallowPickerEvent(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const anyEvent = event as any;
    if (typeof anyEvent.stopImmediatePropagation === 'function') anyEvent.stopImmediatePropagation();
  }


  scheduleCommissionPreview() {
    if (this.commissionPreviewTimer) clearTimeout(this.commissionPreviewTimer);
    this.commissionPreviewTimer = setTimeout(() => this.refreshCommissionPreview(), 180);
  }

  async refreshCommissionPreview() {
    if (!window.limsApi.calculateCommission || !(this.bill.items || []).length) return;
    const seq = ++this.commissionPreviewSeq;
    const itemsSnapshot = [...this.bill.items];
    try {
      const result = await window.limsApi.calculateCommission({ consultant_id: this.bill.consultant_id, items: itemsSnapshot });
      if (seq !== this.commissionPreviewSeq) return;
      if (result?.items?.length === itemsSnapshot.length && this.bill.items.length === itemsSnapshot.length) {
        const resultByKey = new Map(result.items.map((item: any, idx: number) => [this.trackSelectedBillItem(idx, itemsSnapshot[idx]), item]));
        this.bill.items = this.bill.items.map((item:any, idx:number) => ({ ...item, ...(resultByKey.get(this.trackSelectedBillItem(idx, item)) || {}) }));
      }
    } catch { /* commission preview is best-effort; backend recalculates on save */ }
  }

  addSuggestedItem(s: any) {
    if (!s) return;
    this.addItem(s.itemType, s, false);
    this.rememberRecent(s.key);
    this.scheduleCommissionPreview();
    this.billSearch = '';
    this.pendingBillItemSelections = [];
    this.searchOpen = false;
    this.rebuildBillItemCaches();
  }

  addItem(type: string, x: any, refreshPreview = true) {
    if (this.bill.items.some((i: any) => i.item_type === type && i.item_id === x.id)) return;
    const item = {
      item_type: type,
      item_id: x.id,
      name: x.display_name || x.name,
      price: +x.price || 0,
      quantity: 1,
      discount_type: 'VALUE',
      discount_value: 0,
      priority: +(x.billing_order || x.report_order || x.priority) || 0,
      side_header: x.side_header || '',
      department_name: x.department_name || '',
      running_cost: +x.running_cost || 0,
      extra_deduction: 0,
      commission_amount: 0,
      profit_amount: 0,
      commission_profile_name: '',
      commission_rule_source: ''
    };
    this.bill.items = [...this.bill.items, item];
    this.sortBillItemsAlphabetically();
    this.rebuildBillItemCaches();
    if (refreshPreview) this.scheduleCommissionPreview();
  }
  clearBillItems() { this.bill.items = []; this.pendingBillItemSelections = []; this.rebuildBillItemCaches(); this.scheduleCommissionPreview(); }

  private loadRecentKeys() {
    try { return JSON.parse(localStorage.getItem('lims-recent-bill-items') || '[]') as string[]; }
    catch { return []; }
  }
  private rememberRecent(key: string) {
    const next = [key, ...this.loadRecentKeys().filter(x => x !== key)].slice(0, 12);
    localStorage.setItem('lims-recent-bill-items', JSON.stringify(next));
  }

  itemGross(i: any) { return (+i.price || 0) * (+i.quantity || 1); }
  itemDiscount(i: any) { const gross = this.itemGross(i); const v = Math.max(0, +i.discount_value || 0); return Math.min(gross, i.discount_type === 'PERCENT' ? gross * v / 100 : v); }
  lineTotal(i: any) { return +(Math.max(0, this.itemGross(i) - this.itemDiscount(i))).toFixed(2); }
  itemRunningCost(i:any) { return +(+i.running_cost || +i.runningCost || 0).toFixed(2); }
  itemExtraDeduction(i:any) { return +(+i.extra_deduction || 0).toFixed(2); }
  itemCommission(i:any) { return +(+i.commission_amount || 0).toFixed(2); }
  itemProfit(i:any) { return +((+i.profit_amount || (this.lineTotal(i) - this.itemRunningCost(i) - this.itemExtraDeduction(i) - this.itemCommission(i)))).toFixed(2); }
  runningCostTotal() { return +this.bill.items.reduce((s:number,i:any)=>s+this.itemRunningCost(i),0).toFixed(2); }
  extraDeductionTotal() { return +this.bill.items.reduce((s:number,i:any)=>s+this.itemExtraDeduction(i),0).toFixed(2); }
  commissionTotal() { return +this.bill.items.reduce((s:number,i:any)=>s+this.itemCommission(i),0).toFixed(2); }
  profitTotal() { return +this.bill.items.reduce((s:number,i:any)=>s+this.itemProfit(i),0).toFixed(2); }
  billSubTotal() { return +this.bill.items.reduce((s: number, i: any) => s + this.itemGross(i), 0).toFixed(2); }
  itemDiscountTotal() { return +this.bill.items.reduce((s: number, i: any) => s + this.itemDiscount(i), 0).toFixed(2); }
  itemNetTotal() { return +this.bill.items.reduce((s: number, i: any) => s + this.lineTotal(i), 0).toFixed(2); }
  finalDiscountAmount() { const base = this.itemNetTotal(); const v = Math.max(0, +this.bill.discount_value || 0); return +Math.min(base, this.bill.discount_type === 'PERCENT' ? base * v / 100 : v).toFixed(2); }
  totalBeforeRound() { return +Math.max(0, this.itemNetTotal() - this.finalDiscountAmount()).toFixed(2); }
  billTotal() { const before = this.totalBeforeRound(); const mode = this.bill.round_mode; const total = mode === 'NEAREST' ? Math.round(before) : mode === 'UP' ? Math.ceil(before) : mode === 'DOWN' ? Math.floor(before) : before; return +total.toFixed(2); }
  roundOff() { return +(this.billTotal() - this.totalBeforeRound()).toFixed(2); }
  existingReceiptTotal() { return +(this.bill.receipts || []).reduce((sum: number, r: any) => sum + (+r.amount || 0), 0).toFixed(2); }
  receiptDueOnly() { return +Math.max(0, this.billTotal() - this.existingReceiptTotal()).toFixed(2); }
  receiptExcess() { return +Math.max(0, this.existingReceiptTotal() - this.billTotal()).toFixed(2); }
  remainingBeforeCurrentPayment() { return this.receiptDueOnly(); }
  paidAmount() {
    const remaining = this.remainingBeforeCurrentPayment();
    const raw = this.bill.payment_mode === 'Cash' && (+this.bill.cash_received || 0) > 0 ? +this.bill.cash_received || 0 : +this.bill.paid || 0;
    return +Math.min(Math.max(0, raw), remaining).toFixed(2);
  }
  totalPaidPreview() { return +Math.min(this.billTotal(), this.existingReceiptTotal() + this.paidAmount()).toFixed(2); }
  billDue() { return +Math.max(0, this.billTotal() - this.totalPaidPreview()).toFixed(2); }
  cashReturn() { return this.bill.payment_mode === 'Cash' ? +Math.max(0, (+this.bill.cash_received || 0) - this.paidAmount()).toFixed(2) : 0; }
  paymentStatus() { const paid = this.totalPaidPreview(); const total = this.billTotal(); return paid <= 0 ? 'Pending' : paid < total ? 'Partial paid' : 'Paid'; }
  paymentStatusNow() { if (this.isCancelledBill()) return 'Cancelled'; const paid = this.existingReceiptTotal(); const total = this.billTotal(); return paid <= 0 ? 'Pending' : paid < total ? 'Partial paid' : paid > total ? 'Excess paid' : 'Paid'; }
  billNoPaymentClass() {
    const status = this.paymentStatusNow().toLowerCase();
    if (status.includes('cancel')) return 'pay-cancelled';
    if (status.includes('excess')) return 'pay-excess';
    if (status.includes('partial')) return 'pay-partial';
    if (status === 'paid') return 'pay-paid';
    return 'pay-pending';
  }
  receiptHeaderStatus() { if (this.isCancelledBill()) return 'Cancelled'; return this.receiptExcess() > 0 ? `Excess ₹${this.receiptExcess()}` : this.receiptDueOnly() > 0 ? `Due ₹${this.receiptDueOnly()}` : 'Paid in full'; }

  displayPatientName(p: any) {
    const name = [p?.title, p?.name].filter(Boolean).join(' ').trim();
    if (!this.patientFieldsCapsEnabled() || !name) return name;
    return name.toUpperCase();
  }

  patientSearchLabel(p: any) {
    if (!p) return '';
    if (typeof p === 'string') return p;
    const name = this.displayPatientName(p) || String(p.name || p.patient_name || '').trim();
    const no = String(p.patient_no || '').trim();
    const mobile = String(p.mobile || '').trim();
    const parts = [no, name].filter(Boolean).join(' - ');
    return mobile ? `${parts}${parts ? ' · ' : ''}${mobile}` : parts;
  }

  displayPatientSearchOption = (value: any) => this.patientSearchLabel(value);

  normalizePatient(p: any) {
    const age_split = p?.age_split === undefined ? false : !!p.age_split;
    const base = {
      ...p,
      age_unit: p?.age_unit || this.parseAgeUnit(p?.age) || 'YEARS',
      age_value: p?.age_value ?? this.parseAgeValue(p?.age),
      age_split
    };
    const parts = p?.dob
      ? this.agePartsFromDob(p.dob)
      : this.parseSplitAgeParts(p?.age);
    base.age_years = p?.age_years ?? parts.years ?? (base.age_unit === 'YEARS' ? base.age_value : 0) ?? 0;
    base.age_months = p?.age_months ?? parts.months ?? 0;
    base.age_days = p?.age_days ?? parts.days ?? 0;
    if (age_split) {
      base.age_value = Number(base.age_years || 0);
      base.age_unit = 'YEARS';
    }
    return base;
  }
  parseAgeValue(age: any) { const m = String(age || '').match(/\d+/); return m ? Number(m[0]) : ''; }
  parseAgeUnit(age: any) {
    const text = String(age || '').toLowerCase();
    if (text.includes('week') || text.includes('wk')) return 'WEEKS';
    if (text.includes('day') || text.endsWith('d')) return 'DAYS';
    if (text.includes('month') || text.includes('mts') || text.endsWith('m')) return 'MONTHS';
    return 'YEARS';
  }
  parseSplitAgeParts(age: any) {
    const text = String(age || '').toLowerCase();
    const years = Number((text.match(/(\d+)\s*y/) || [])[1] || 0);
    const months = Number((text.match(/(\d+)\s*m/) || [])[1] || 0);
    const days = Number((text.match(/(\d+)\s*d/) || [])[1] || 0);
    if (years || months || days) return { years, months, days };
    const only = Number((text.match(/\d+/) || [])[0] || 0);
    return { years: only, months: 0, days: 0 };
  }
  ageUnitLabel(unit: string, value: number) {
    const u = unit === 'DAYS' ? 'day' : unit === 'WEEKS' ? 'week' : unit === 'MONTHS' ? 'month' : 'year';
    return `${u}${Number(value) === 1 ? '' : 's'}`;
  }
  agePartsFromDob(dobValue?: string) {
    if (!dobValue) return { years: 0, months: 0, weeks: 0, days: 0, totalDays: 0 };
    const dob = new Date(dobValue + 'T00:00:00');
    const today = new Date();
    if (Number.isNaN(dob.getTime()) || dob > today) return { years: 0, months: 0, weeks: 0, days: 0, totalDays: 0 };
    let years = today.getFullYear() - dob.getFullYear();
    let months = today.getMonth() - dob.getMonth();
    let days = today.getDate() - dob.getDate();
    if (days < 0) { months--; const prevMonthDays = new Date(today.getFullYear(), today.getMonth(), 0).getDate(); days += prevMonthDays; }
    if (months < 0) { years--; months += 12; }
    const totalDays = Math.max(0, Math.floor((today.getTime() - dob.getTime()) / 86400000));
    return { years: Math.max(0, years), months: Math.max(0, months), weeks: Math.floor(totalDays / 7), days: Math.max(0, days), totalDays };
  }
  /** Numeric-only age fields: digits only (no letters / signs / decimals). */
  blockNonNumericAge(event: KeyboardEvent) {
    const allow = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (allow.includes(event.key)) return;
    if (event.ctrlKey || event.metaKey) return;
    if (!/^\d$/.test(event.key)) event.preventDefault();
  }
  /** Strip non-digits while typing; keep empty string so the field stays editable. */
  private digitsOnlyWhileTyping(value: any): string {
    return String(value ?? '').replace(/\D/g, '');
  }
  private clampInt(value: any, min: number, max: number): number {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits === '') return 0;
    return Math.min(max, Math.max(min, parseInt(digits, 10) || 0));
  }
  currentAgeParts() {
    if (this.bill.patient?.age_split) {
      return {
        years: this.clampInt(this.bill.patient.age_years ?? this.bill.patient.age_value, 0, 150),
        months: this.clampInt(this.bill.patient.age_months, 0, 11),
        days: this.clampInt(this.bill.patient.age_days, 0, 31),
        weeks: 0,
        totalDays: 0
      };
    }
    const years = this.clampInt(this.bill.patient?.age_value, 0, 150);
    return { years, months: 0, days: 0, weeks: 0, totalDays: 0 };
  }
  formatAgeFromParts(parts: any, split = !!this.bill.patient?.age_split) {
    const years = Math.max(0, Number(parts?.years || 0) || 0);
    const months = Math.max(0, Number(parts?.months || 0) || 0);
    const days = Math.max(0, Number(parts?.days || 0) || 0);
    if (!split) {
      return `${years} ${this.ageUnitLabel('YEARS', years)}`;
    }
    const bits: string[] = [];
    if (years > 0) bits.push(`${years} ${this.ageUnitLabel('YEARS', years)}`);
    if (months > 0) bits.push(`${months} ${this.ageUnitLabel('MONTHS', months)}`);
    if (days > 0) bits.push(`${days} ${this.ageUnitLabel('DAYS', days)}`);
    if (!bits.length) return years === 0 && months === 0 && days === 0 ? `0 ${this.ageUnitLabel('YEARS', 0)}` : '';
    return bits.join(' ');
  }
  formattedAgeDisplay() {
    if (this.bill.patient?.age_split) {
      if (this.bill.patient?.dob) return this.formatAgeFromParts(this.agePartsFromDob(this.bill.patient.dob), true);
      return this.formatAgeFromParts(this.currentAgeParts(), true);
    }
    if (this.bill.patient?.dob) {
      const parts = this.agePartsFromDob(this.bill.patient.dob);
      return this.formatAgeFromParts({ years: parts.years, months: 0, days: 0 }, false);
    }
    const years = this.clampInt(this.bill.patient?.age_value, 0, 150);
    return years || years === 0 ? this.formatAgeFromParts({ years, months: 0, days: 0 }, false) : '';
  }
  syncAgeText() {
    const p = this.bill.patient || {};
    if (p.age_split) {
      const parts = this.currentAgeParts();
      p.age_years = parts.years;
      p.age_months = parts.months;
      p.age_days = parts.days;
      p.age_value = parts.years;
      p.age_unit = 'YEARS';
    } else {
      p.age_value = this.clampInt(p.age_value, 0, 150);
      p.age_unit = 'YEARS';
      p.age_years = p.age_value;
      p.age_months = 0;
      p.age_days = 0;
    }
    p.age = this.formattedAgeDisplay();
  }
  patientAgeLabel(p: any): string {
    if (!p) return '';
    const stored = String(p.age || '').trim();
    const split = p.age_split === undefined ? false : !!p.age_split;
    if (stored && /month|day|week/i.test(stored)) return stored;
    if (split && p.dob) return this.formatAgeFromParts(this.agePartsFromDob(p.dob), true);
    if (stored && !/^0\s*years?$/i.test(stored)) return stored;
    if (split) {
      return this.formatAgeFromParts({
        years: Number(p.age_years ?? p.age_value ?? 0) || 0,
        months: Number(p.age_months || 0) || 0,
        days: Number(p.age_days || 0) || 0
      }, true);
    }
    const value = p.age_value;
    if (value !== '' && value !== undefined && value !== null && Number.isFinite(+value)) {
      return `${+value} ${this.ageUnitLabel('YEARS', +value)}`;
    }
    return stored;
  }
  updateAgeFromDob() {
    const dobValue = this.bill.patient?.dob;
    if (!dobValue) return;
    const parts = this.agePartsFromDob(dobValue);
    this.bill.patient.age_years = parts.years;
    this.bill.patient.age_months = parts.months;
    this.bill.patient.age_days = parts.days;
    this.bill.patient.age_value = parts.years;
    this.bill.patient.age_unit = 'YEARS';
    this.syncAgeText();
  }
  updateDobFromAge() {
    const split = !!this.bill.patient?.age_split;
    const parts = split ? this.currentAgeParts() : { years: this.clampInt(this.bill.patient?.age_value, 0, 150), months: 0, days: 0 };
    if (!parts.years && !parts.months && !parts.days) {
      this.syncAgeText();
      return;
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setFullYear(d.getFullYear() - parts.years);
    d.setMonth(d.getMonth() - parts.months);
    d.setDate(d.getDate() - parts.days);
    this.bill.patient.dob = d.toISOString().slice(0, 10);
    // Re-normalize parts from the computed DOB so months/days stay calendar-accurate.
    const normalized = this.agePartsFromDob(this.bill.patient.dob);
    this.bill.patient.age_years = normalized.years;
    this.bill.patient.age_months = normalized.months;
    this.bill.patient.age_days = normalized.days;
    this.bill.patient.age_value = split ? normalized.years : parts.years;
    this.bill.patient.age_unit = 'YEARS';
    this.syncAgeText();
  }
  onSplitAgeInput(field: 'age_years' | 'age_months' | 'age_days') {
    if (field === 'age_years') this.bill.patient.age_years = this.digitsOnlyWhileTyping(this.bill.patient.age_years);
    if (field === 'age_months') this.bill.patient.age_months = this.digitsOnlyWhileTyping(this.bill.patient.age_months);
    if (field === 'age_days') this.bill.patient.age_days = this.digitsOnlyWhileTyping(this.bill.patient.age_days);
    this.bill.patient.age_value = this.digitsOnlyWhileTyping(this.bill.patient.age_years);
    this.bill.patient.age_unit = 'YEARS';
    // Do not clamp/rewrite fields while typing — keep empty editable until blur.
    this.bill.patient.age = this.formatAgeFromParts({
      years: this.clampInt(this.bill.patient.age_years, 0, 150),
      months: this.clampInt(this.bill.patient.age_months, 0, 11),
      days: this.clampInt(this.bill.patient.age_days, 0, 31)
    }, true);
  }
  onYearsOnlyAgeInput() {
    this.bill.patient.age_value = this.digitsOnlyWhileTyping(this.bill.patient.age_value);
    this.bill.patient.age_years = this.bill.patient.age_value;
    this.bill.patient.age_months = 0;
    this.bill.patient.age_days = 0;
    this.bill.patient.age_unit = 'YEARS';
    this.bill.patient.age = this.formatAgeFromParts({
      years: this.clampInt(this.bill.patient.age_value, 0, 150),
      months: 0,
      days: 0
    }, false);
  }
  /** Clamp + sync DOB after the user leaves an age field. */
  commitAgeFromFields() {
    if (this.bill.patient?.age_split) {
      this.bill.patient.age_years = this.clampInt(this.bill.patient.age_years, 0, 150);
      this.bill.patient.age_months = this.clampInt(this.bill.patient.age_months, 0, 11);
      this.bill.patient.age_days = this.clampInt(this.bill.patient.age_days, 0, 31);
      this.bill.patient.age_value = this.bill.patient.age_years;
    } else {
      this.bill.patient.age_value = this.clampInt(this.bill.patient.age_value, 0, 150);
      this.bill.patient.age_years = this.bill.patient.age_value;
      this.bill.patient.age_months = 0;
      this.bill.patient.age_days = 0;
    }
    this.bill.patient.age_unit = 'YEARS';
    this.updateDobFromAge();
  }
  onAgeSplitToggle() {
    if (this.bill.patient.age_split) {
      if (this.bill.patient.dob) this.updateAgeFromDob();
      else {
        this.bill.patient.age_years = this.clampInt(this.bill.patient.age_value ?? this.bill.patient.age_years, 0, 150);
        this.bill.patient.age_months = this.clampInt(this.bill.patient.age_months, 0, 11);
        this.bill.patient.age_days = this.clampInt(this.bill.patient.age_days, 0, 31);
        this.updateDobFromAge();
      }
    } else {
      if (this.bill.patient.dob) {
        const parts = this.agePartsFromDob(this.bill.patient.dob);
        this.bill.patient.age_value = parts.years;
      } else {
        this.bill.patient.age_value = this.clampInt(this.bill.patient.age_years ?? this.bill.patient.age_value, 0, 150);
      }
      this.bill.patient.age_unit = 'YEARS';
      this.bill.patient.age_months = 0;
      this.bill.patient.age_days = 0;
      this.bill.patient.age_years = this.bill.patient.age_value;
      this.updateDobFromAge();
    }
    this.syncAgeText();
  }
  inferGenderFromHonorific(title: string) {
    const h = String(title || '').toLowerCase().replace(/\./g, '').trim();
    const male = ['mr', 'master', 'baby boy', 'boy', 'son', 'sir'];
    const female = ['mrs', 'ms', 'miss', 'kumari', 'baby girl', 'girl', 'daughter', 'madam'];
    if (male.some(x => h === x || h.includes(x))) return 'Male';
    if (female.some(x => h === x || h.includes(x))) return 'Female';
    if (h === 'mx') return 'Other';
    return '';
  }
  genderAutoHint() { return !!this.inferGenderFromHonorific(this.bill.patient?.title); }
  onHonorificChanged() {
    const h = String(this.bill.patient?.title || '').toLowerCase();
    const gender = this.inferGenderFromHonorific(h);
    if (gender) this.bill.patient.gender = gender;
    if (h.includes('baby') || h.includes('child') || ['master', 'kumari'].includes(h)) {
      if (!this.bill.patient.relation_type) this.bill.patient.relation_type = h.includes('girl') ? 'Daughter of' : h.includes('boy') ? 'Son of' : 'Baby of';
      this.bill.patient.age_split = true;
      this.bill.patient.age_unit = 'YEARS';
      this.syncAgeText();
    }
    this.applyPatientFieldsCapsUi();
  }
  shouldShowGuardianSection() {
    const h = String(this.bill.patient?.title || '').toLowerCase();
    return this.isPatientFieldRequired('relation') || this.isPatientFieldRequired('guardian') || h.includes('baby') || h.includes('child') || ['master', 'kumari'].includes(h) || !!this.bill.patient?.relation_type || !!this.bill.patient?.guardian_name;
  }
  patientInitials() { const name = String(this.bill.patient?.name || '').trim(); return name ? name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase() : 'P'; }
  patientRelationLine() { return [this.bill.patient?.relation_type, this.bill.patient?.guardian_name].filter(Boolean).join(' '); }
  displayDob() { const v = this.bill.patient?.dob; if (!v) return ''; const [y,m,d] = String(v).split('-'); return d && m && y ? `${d}-${m}-${y}` : v; }

  formatIstDateTime(value: any) {
    if (!value) return 'Not available';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true
    }).format(d).replace(',', '');
  }
  selectedConsultantName() {
    const id = Number(this.bill?.consultant_id || 0);
    return this.consultants.find((c: any) => Number(c.id) === id)?.name || '';
  }

  absValue(value: any) { return Math.abs(Number(value || 0)); }

  patientAgeGenderSummary() {
    const age = this.formattedAgeDisplay() || this.bill?.patient?.age || '-';
    let gender = this.bill?.patient?.gender || '-';
    if (this.patientFieldsCapsEnabled() && gender && gender !== '-') gender = String(gender).toUpperCase();
    return `${age} / ${gender}`;
  }

  registrationTypeSummary() {
    return this.normalizedRegistrationType() || '-';
  }

  referenceSummary() {
    if (this.isWalkInRegistration()) return 'Self';
    return this.selectedConsultantName() || String(this.consultantQuery || '').trim() || '-';
  }

  referralNameSummary() {
    return this.referenceSummary();
  }

  referralIdSummary() {
    if (this.isWalkInRegistration()) return '-';
    return this.bill?.consultant_id ? `REF${this.bill.consultant_id}` : '-';
  }

  savedBillStatus(b: any) { if (String(b?.status || '').toUpperCase() === 'CANCELLED') return 'Cancelled'; const paid = +b?.paid || 0; const due = +b?.due || 0; const excess = Math.max(0, paid - (+b?.total || 0)); return paid <= 0 ? 'Pending' : excess > 0 ? 'Excess paid' : due > 0 ? 'Partial paid' : 'Paid'; }
  isCancelledBill() { return String((this.lastBill()?.status || this.bill?.status || '')).toUpperCase() === 'CANCELLED'; }
  cancelledDetails() { const b:any = this.lastBill() || this.bill || {}; const parts = []; if (b.cancelled_at) parts.push(`Cancelled: ${DateTimeSettingsService.dateTime(b.cancelled_at)}`); if (b.cancel_reason) parts.push(`Reason: ${b.cancel_reason}`); if (+b.refund_amount > 0) parts.push(`Refund: ₹${b.refund_amount} ${b.refund_mode || ''}`); return parts.join(' · '); }

  isQuickReportingEnabled() {
    return String(this.settings['quickReporting.enabled'] || 'false').toLowerCase() === 'true';
  }
  private billingEditSettingOn(key: string) {
    return String(this.settings[key] || 'false').toLowerCase() === 'true';
  }
  allowItemsAfterWorkflow() { return this.billingEditSettingOn('billing.edit.allowItemsAfterWorkflow'); }
  allowPatientAfterWorkflow() { return this.billingEditSettingOn('billing.edit.allowPatientAfterWorkflow'); }
  hasFinishedQuickItems() {
    const meta: any = this.lastBill() || {};
    if (+meta.has_finished_quick_items === 1) return true;
    return (this.bill?.items || []).some((i: any) => this.isBillItemFinished(i));
  }
  isBillItemFinished(item: any) {
    return +item?.quick_finished === 1 || item?.quick_finished === true;
  }
  /** Patient/registration/consultant fields (Quick Reporting unlock settings). */
  patientEditable() {
    if (this.isCancelledBill()) return false;
    if (!this.editingBillId) return true;
    if (!this.isQuickReportingEnabled()) return true;
    if (!this.hasFinishedQuickItems()) return true;
    return this.allowPatientAfterWorkflow();
  }
  /** Add / search / select new bill items. */
  canAddBillItems() {
    if (this.isCancelledBill()) return false;
    if (!this.editingBillId) return true;
    if (!this.isQuickReportingEnabled()) return true;
    if (!this.hasFinishedQuickItems()) return true;
    return this.allowItemsAfterWorkflow();
  }
  /** Per-line lock: finished quick items stay locked when unlock is enabled; otherwise all lines lock under default quick lock. */
  isBillItemLineLocked(item: any) {
    if (this.isCancelledBill()) return true;
    if (!this.editingBillId) return false;
    if (!this.isQuickReportingEnabled()) return false;
    if (!this.hasFinishedQuickItems()) return false;
    if (this.allowItemsAfterWorkflow()) return this.isBillItemFinished(item);
    return true;
  }
  /** Rate/discount can still be edited when the bill is fully unsettled (no receipts yet). */
  isBillFullyUnsettled() {
    if (this.isCancelledBill()) return false;
    const receipts = this.bill?.receipts || [];
    if (receipts.length > 0) return false;
    return this.existingReceiptTotal() <= 0;
  }
  /** Any receipt / part payment locks rate, line discount, and bill discount. */
  canEditBillPricing() {
    if (this.isCancelledBill()) return false;
    if (!this.editingBillId) return true;
    return this.isBillFullyUnsettled();
  }
  canEditBillItemRate(item: any) {
    if (!item) return false;
    return this.canEditBillPricing();
  }
  patientLockedBanner() {
    if (this.isCancelledBill() || this.patientEditable() || !this.editingBillId) return '';
    return 'Patient and consultant fields are locked because finished Quick Reporting items exist. Enable “Allow patient / consultant edits…” in Settings → Billing Config to unlock.';
  }

  hasUnsavedWork() {
    const patient = this.bill?.patient || {};
    const hasPatient = ['patient_no', 'title', 'name', 'dob', 'age', 'age_value', 'age_unit', 'age_split', 'gender', 'relation_type', 'guardian_name', 'guardian_mobile', 'mobile', 'email', 'address', 'history']
      .some(key => String(patient[key] ?? '').trim().length > 0);
    const hasPaymentChanges =
      Number(this.bill?.discount_value || 0) !== 0 ||
      Number(this.bill?.paid || 0) !== 0 ||
      Number(this.bill?.cash_received || 0) !== 0 ||
      String(this.bill?.round_mode || 'NONE') !== 'NONE' ||
      String(this.bill?.payment_mode || 'Cash') !== 'Cash';
    return hasPatient || (this.bill?.items?.length || 0) > 0 || hasPaymentChanges || this.step() !== 1;
  }

  loadExistingBill(existing: any) {
    if (!existing) return;
    this.editingBillId = Number(existing.id || 0) || null;
    this.editingBillNo = existing.bill_no || '';
    this.bill = {
      id: this.editingBillId,
      patient: {
        id: existing.patient_id,
        patient_no: existing.patient_no,
        title: existing.title || '',
        name: existing.name || existing.patient_name || '',
        dob: existing.dob || '',
        age: existing.age || '',
        age_value: existing.age_value || this.parseAgeValue(existing.age),
        age_unit: existing.age_unit || this.parseAgeUnit(existing.age),
        age_split: existing.age_split === undefined ? false : !!existing.age_split,
        age_years: existing.age_years,
        age_months: existing.age_months,
        age_days: existing.age_days,
        gender: existing.gender || '',
        relation_type: existing.relation_type || '',
        guardian_name: existing.guardian_name || '',
        guardian_mobile: existing.guardian_mobile || '',
        mobile: existing.mobile || '',
        email: existing.email || '',
        address: existing.address || '',
        history: existing.history || ''
      },
      consultant_id: existing.consultant_id || null,
      referrer_type: existing.referrer_type || (existing.consultant_id ? 'Referral' : 'Walk-in'),
      receipts: existing.receipts || [],
      items: (existing.items || []).map((i: any) => ({
        item_type: i.item_type,
        item_id: i.item_id,
        name: i.name,
        department_name: i.department_name || '',
        quantity: +i.quantity || 1,
        price: +i.price || 0,
        priority: +i.priority || 0,
        side_header: i.side_header || '',
        discount_type: String(i.discount_type || '').toUpperCase() === 'PERCENT' ? 'PERCENT' : 'VALUE',
        discount_value: +i.discount_value || 0,
        running_cost:+i.running_cost || 0,
        extra_deduction:+i.extra_deduction || 0,
        commission_amount:+i.commission_amount || 0,
        profit_amount:+i.profit_amount || 0,
        commission_profile_name:i.commission_profile_name || '',
        commission_rule_source:i.commission_rule_source || '',
        quick_finished: +i.quick_finished === 1 || i.quick_finished === true
      })),
      discount_type: existing.discount_type || 'VALUE',
      discount_value: existing.discount_value !== undefined && existing.discount_value !== null && existing.discount_value !== '' ? Number(existing.discount_value) || 0 : Number(existing.discount) || 0,
      round_mode: existing.round_mode || 'NONE',
      paid: 0,
      cash_received: 0,
      payment_mode: existing.payment_mode || 'Cash',
      notes: existing.notes || '',
      status: existing.status || 'BILLED',
      cancelled_at: existing.cancelled_at || '',
      cancel_reason: existing.cancel_reason || '',
      refund_amount: +existing.refund_amount || 0,
      refund_mode: existing.refund_mode || '',
      has_finished_quick_items: +existing.has_finished_quick_items === 1
    };
    this.patientBillQuery = this.patientSearchLabel(this.bill.patient);
    this.consultantQuery = this.selectedConsultantName();
    this.applyRegistrationDefaults();
    this.billingPatientResults.set([]);
    this.searchOpen = false;
    this.lastBill.set(existing);
    this.step.set(2);
  }

  async createBill() {
    if (this.isCancelledBill()) { this.notify('Cancelled bills are read-only and cannot be updated.', 'error'); return; }
    const validationError = this.billingValidationMessage();
    if (validationError) { this.notify(validationError, 'error'); return; }
    if (!this.canGoPayment() || this.creating()) return;
    this.commitAgeFromFields();
    this.applyPatientFieldsCapsUi();
    this.creating.set(true);
    try {
      const wasEditing = !!this.editingBillId;
      const payload = { ...this.bill, id: this.editingBillId, paid: 0, cash_received: 0 };
      const b = this.editingBillId
        ? await window.limsApi.updateBill(payload)
        : await window.limsApi.createBill(payload);
      this.editingBillId = Number(b.id);
      this.editingBillNo = b.bill_no || '';
      this.bill.id = this.editingBillId;
      this.bill.patient = {
        ...this.bill.patient,
        id: b.patient_id,
        patient_no: b.patient_no || this.bill.patient.patient_no
      };
      this.bill.receipts = b.receipts || [];
      this.bill.paid = 0;
      this.bill.cash_received = 0;
      this.bill.has_finished_quick_items = +b.has_finished_quick_items === 1;
      if (Array.isArray(b.items)) {
        const finishedByKey = new Map(
          (b.items as any[]).map((i: any) => [`${String(i.item_type || '').toUpperCase()}:${+i.item_id || 0}`, +i.quick_finished === 1])
        );
        this.bill.items = (this.bill.items || []).map((item: any) => ({
          ...item,
          quick_finished: finishedByKey.get(`${String(item.item_type || '').toUpperCase()}:${+item.item_id || 0}`) || false
        }));
      }
      this.lastBill.set(b);
      this.billCreated.emit(b);
      this.notify(wasEditing ? `Bill ${b.bill_no} updated successfully.` : `Bill ${b.bill_no} created successfully.`);
      if (wasEditing) this.promptReceiptReviewIfNeeded(b);
      // Stay on the current Billing step after save/update; do not auto-navigate.
    } catch (error: any) {
      const message = String(error?.message || error || 'Unable to save bill.');
      const friendly = message.includes('discount_type')
        ? 'The billing database needs the new discount columns. The app has an auto-migration for this; please restart the app once and try again.'
        : message;
      this.notify(friendly, 'error');
      this.errorOccurred.emit(friendly);
    } finally {
      this.creating.set(false);
    }
  }


  private promptReceiptReviewIfNeeded(b: any) {
    const paid = +b?.paid || 0;
    const total = +b?.total || 0;
    const due = Math.max(0, total - paid);
    const excess = Math.max(0, paid - total);
    if (excess > 0) {
      this.receiptReviewPrompt.set({ open: true, message: `The edited bill total is lower than the receipt total. Excess receipt amount is ₹${excess}. Please review or delete receipts for this bill if needed.` });
    } else if (due > 0 && paid > 0) {
      this.receiptReviewPrompt.set({ open: true, message: `The edited bill is partially paid. Due amount is ₹${due}. Please review receipts or collect balance if needed.` });
    } else if (paid >= total && total > 0) {
      this.receiptReviewPrompt.set({ open: true, message: 'This bill is fully paid after the edit. Please verify the receipt list before printing or closing.' });
    }
  }

  askDeleteReceipt(r: any) {
    if (this.isCancelledBill()) { this.notify('Receipt deletion is disabled for cancelled bills.', 'error'); return; }
    this.deleteReceiptChoice.set({ open: true, receipt: r });
  }

  async confirmDeleteReceipt() {
    const receipt = this.deleteReceiptChoice().receipt;
    this.deleteReceiptChoice.set({ open: false, receipt: null });
    if (!this.editingBillId || !receipt?.id) return;
    try {
      const b = await window.limsApi.deleteReceipt!(this.editingBillId, receipt.id);
      this.bill.receipts = b.receipts || [];
      this.lastBill.set(b);
      this.billCreated.emit(b);
      this.notify(`Receipt ${receipt.receipt_no} deleted. Payment status recalculated.`);
    } catch (error: any) {
      this.notify(String(error?.message || error || 'Unable to delete receipt.'), 'error');
    }
  }

  async generateReceiptNow() {
    if (this.isCancelledBill()) { this.notify('Cancelled bills are read-only. Receipt collection is disabled.', 'error'); return; }
    if (!this.editingBillId) { this.notify('Save the bill first, then generate receipt for that bill.', 'error'); return; }
    if (this.remainingBeforeCurrentPayment() <= 0) { this.notify('This bill is fully paid. No additional payment is accepted.', 'error'); return; }
    const amount = this.paidAmount();
    if (amount <= 0) { this.notify('Enter a valid receipt amount.', 'error'); return; }
    this.creating.set(true);
    try {
      await window.limsApi.addReceipt(this.editingBillId, amount, this.bill.payment_mode || 'Cash');
      const b = await window.limsApi.getBill(this.editingBillId);
      this.bill.receipts = b.receipts || [];
      this.bill.paid = 0;
      this.bill.cash_received = 0;
      this.lastBill.set(b);
      this.billCreated.emit(b);
      this.notify(`Receipt generated for bill ${b.bill_no}.`);
      // Stay on the current Billing/Receipt screen after collecting payment.
    } catch (error: any) {
      this.notify(String(error?.message || error || 'Unable to generate receipt.'), 'error');
    } finally {
      this.creating.set(false);
    }
  }

  async billPdf(id: number, includeReceipts?: boolean) {
    const bill = this.lastBill()?.id === id ? this.lastBill() : (this.editingBillId === id ? { receipts: this.bill.receipts } : null);
    const receiptCount = (bill?.receipts || []).length;
    if (includeReceipts === undefined && receiptCount > 0) {
      this.billPrintChoice.set({ open: true, billId: id, receiptCount });
      return;
    }
    window.limsApi.openPath(await window.limsApi.billPdf(id, !!includeReceipts));
  }

  async openPatientWhatsApp(source?: any) {
    const bill = source || this.lastBill() || (this.editingBillId ? this.bill : null);
    const billId = +(bill?.id || this.editingBillId || this.lastBill()?.id || 0);
    const patient = bill?.patient || this.bill?.patient || {};
    const patientName = patient?.name || bill?.patient_name;
    const billNo = bill?.bill_no || this.lastBill()?.bill_no;
    const mobileHint = patient?.mobile || bill?.mobile || bill?.patient_mobile;

    if (billId && (window.limsApi as any).billWhatsApp) {
      const prompted = await this.whatsAppPrompt?.promptMobile({
        mobile: mobileHint,
        patientName,
        billNo
      });
      if (!prompted || prompted.cancelled || !prompted.mobile) return;
      try {
        const result = await (window.limsApi as any).billWhatsApp(billId, {
          mobile: prompted.mobile,
          includeReceipts: true
        });
        this.notify(
          result?.clipboardCopied && result?.clipboardMode === 'file'
            ? 'Clipboard: copied. WhatsApp opened — press Ctrl+V in the chat to attach the bill PDF.'
            : result?.clipboardCopied
              ? 'Clipboard: path copied. WhatsApp opened — attach the bill PDF manually if paste fails.'
              : `WhatsApp opened for ${result?.mobile || prompted.mobile}. Clipboard: not copied — attach the bill PDF manually.`
        );
      } catch (e: any) {
        this.notify(e?.message || 'Unable to open WhatsApp with bill PDF.', 'error');
      }
      return;
    }

    const result = await this.whatsAppPrompt?.openContact({
      mobile: mobileHint,
      patientName,
      billNo
    });
    if (!result || result.cancelled) return;
    if (!result.ok) this.notify(result.error || 'Unable to open WhatsApp.', 'error');
    else this.notify(`Opened WhatsApp for ${result.mobile}.`);
  }

  async confirmBillPrint(includeReceipts: boolean) {
    const id = this.billPrintChoice().billId;
    this.billPrintChoice.set({ open: false, billId: null, receiptCount: 0 });
    if (id) await this.billPdf(id, includeReceipts);
  }
  async receipt(id: number, receiptId?: number) { window.limsApi.openPath(await window.limsApi.receiptPdf(id, receiptId)); }
  notify(message: string, tone: 'success' | 'error' | 'info' = 'success') { this.snack.set(message); this.snackTone.set(tone); window.setTimeout(() => { if (this.snack() === message) this.snack.set(''); }, 3200); }
  resetBill() {
    this.registrationTypeOpen = false;
    this.bill = this.emptyBill();
    this.editingBillId = null;
    this.editingBillNo = '';
    this.lastBill.set(null);
    this.patientBillQuery = '';
    this.consultantQuery = '';
    this.clearConsultantResults();
    this.billingPatientResults.set([]);
    this.selectedPatientMobileFromSearch = '';
    this.mobileEditedManually = false;
    this.duplicateMobileBypass = '';
    this.closeDuplicateMobileModal();
    this.applyRegistrationDefaults();
    this.step.set(1);
    this.billCleared.emit();
  }
}
