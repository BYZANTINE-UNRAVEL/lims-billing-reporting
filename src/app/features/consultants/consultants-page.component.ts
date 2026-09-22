import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-consultants-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="masters-shell">
      <section class="master-panel">
        <div class="panel-heading">
          <div class="panel-heading-left">
            <div class="panel-icon">◎</div>
            <div>
              <h2>Consultant Master</h2>
              <p>Name, phone and clinic. Commission rates are configured in Commission Config.</p>
            </div>
          </div>
          <span class="info-pill">{{ listTotal }} consultants</span>
        </div>

        <div class="entry-card consultant-entry" *ngIf="formOpen">
          <label class="master-field"><span>Name</span><input [(ngModel)]="consultant.name" placeholder="Consultant name"></label>
          <label class="master-field"><span>Phone</span><input [(ngModel)]="consultant.phone" placeholder="Phone"></label>
          <label class="master-field"><span>Clinic</span><input [(ngModel)]="consultant.clinic" placeholder="Clinic / hospital"></label>
          <label class="switch-field">
            <span>Active</span>
            <span class="switch-line">
              <input type="checkbox" [(ngModel)]="consultant.active">
              <span class="switch-visual"></span>
              <b>{{ consultant.active ? 'Yes' : 'No' }}</b>
            </span>
          </label>
          <div class="form-actions">
            <button class="action-btn primary" type="button" (click)="saveConsultant()">{{ consultant.id ? 'Save changes' : 'Save' }}</button>
            <button class="action-btn ghost" type="button" (click)="closeForm()">Cancel</button>
          </div>
        </div>

        <div class="test-list-toolbar">
          <div class="test-list-search">
            <span>Search</span>
            <input [(ngModel)]="listSearch" (ngModelChange)="onSearchChange()" placeholder="Search by name, phone, clinic">
          </div>
          <label class="test-list-filter">
            <span>Status</span>
            <select [(ngModel)]="listStatus" (ngModelChange)="onFilterChange()">
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <div class="test-list-actions">
            <button class="action-btn primary" type="button" (click)="openCreate()">+ Add Consultant</button>
          </div>
        </div>

        <div class="masters-fetch-banner" *ngIf="loading" aria-live="polite">
          <span class="masters-fetch-spinner" aria-hidden="true"></span>
          <b>Loading consultants…</b>
          <small>Fetching from database with current filters</small>
        </div>

        <div class="action-message" *ngIf="actionMessage">{{ actionMessage }}</div>

        <div class="table-card" [class.is-loading]="loading">
          <table class="masters-table">
            <thead>
              <tr><th>Name</th><th>Phone</th><th>Clinic</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of consultants(); trackBy: trackById">
                <td><strong class="entity-name">{{ c.name || '(unnamed)' }}</strong></td>
                <td>{{ c.phone || '—' }}</td>
                <td>{{ c.clinic || '—' }}</td>
                <td><span class="status-badge" [class.inactive]="!isActive(c)"><i></i>{{ isActive(c) ? 'Active' : 'Archived' }}</span></td>
                <td class="row-actions">
                  <button class="edit-btn" type="button" (click)="editConsultant(c)">Edit</button>
                  <button class="icon-action delete" type="button" title="Delete or archive" aria-label="Delete consultant" (click)="deleteConsultant(c)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                  </button>
                </td>
              </tr>
              <tr *ngIf="!loading && !consultants().length">
                <td colspan="5" class="empty-cell">No consultants found</td>
              </tr>
            </tbody>
          </table>
          <div class="table-footer">
            <span>Showing <b>{{ consultants().length }}</b> of <b>{{ listTotal }}</b> consultants</span>
            <span>Archive keeps bill history when a consultant is already used.</span>
          </div>
          <div class="masters-pager" *ngIf="listTotal > 0">
            <label>Rows
              <select [ngModel]="pageSize" (ngModelChange)="setPageSize(+$event)">
                <option [ngValue]="25">25</option>
                <option [ngValue]="50">50</option>
                <option [ngValue]="100">100</option>
              </select>
            </label>
            <button type="button" title="First page" (click)="setPage(1)" [disabled]="page <= 1">«</button>
            <button type="button" title="Previous page" (click)="setPage(page - 1)" [disabled]="page <= 1">‹</button>
            <b>{{ page }} / {{ totalPages() }}</b>
            <button type="button" title="Next page" (click)="setPage(page + 1)" [disabled]="page >= totalPages()">›</button>
            <button type="button" title="Last page" (click)="setPage(totalPages())" [disabled]="page >= totalPages()">»</button>
          </div>
        </div>
      </section>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .masters-shell{padding:4px 20px 18px;color:var(--text);--accent:#3b82f6;--accent-soft:color-mix(in srgb,var(--accent) 10%,transparent)}
    .master-panel{border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--panel) 92%,transparent);box-shadow:var(--shadow);padding:14px 16px 16px}
    .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .panel-heading-left{display:flex;align-items:center;gap:10px;min-width:0}
    .panel-icon{width:34px;height:34px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);font-weight:950}
    .panel-heading h2{margin:0;font-size:16px;line-height:1.15;font-weight:950;letter-spacing:-.02em}
    .panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:color-mix(in srgb,var(--accent) 76%,var(--text));font-size:12px;font-weight:850;white-space:nowrap}
    .entry-card{border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--row) 62%,transparent);padding:10px;margin-bottom:10px}
    .consultant-entry{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}
    .master-field{display:grid;gap:6px;min-width:0}
    .master-field span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .master-field input{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}
    .master-field input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .switch-field{display:grid;gap:6px}
    .switch-field>span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .switch-line{height:34px;display:inline-flex;align-items:center;gap:8px}
    .switch-line input{width:16px;height:16px;accent-color:var(--accent)}
    .switch-visual{display:none}
    .form-actions{display:flex;gap:8px;align-items:center;grid-column:1/-1;justify-content:flex-end}
    .action-btn,.edit-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:color-mix(in srgb,var(--row) 74%,transparent);cursor:pointer}
    .action-btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.20)}
    .action-btn.ghost:hover,.edit-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
    .test-list-toolbar{display:grid;grid-template-columns:1.35fr .55fr auto;gap:10px;align-items:end;margin-bottom:10px}
    .test-list-search,.test-list-filter{display:flex;flex-direction:column;gap:6px}
    .test-list-search span,.test-list-filter span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .test-list-search input,.test-list-filter select{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}
    .test-list-search input:focus,.test-list-filter select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .test-list-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center}
    .masters-fetch-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;padding:10px 12px;border:1px solid color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;background:color-mix(in srgb,var(--accent-soft) 70%,var(--panel))}
    .masters-fetch-banner b{font-size:13px;font-weight:900}.masters-fetch-banner small{color:var(--muted);font-size:11px;font-weight:750}
    .masters-fetch-spinner{width:16px;height:16px;border-radius:50%;border:2px solid color-mix(in srgb,var(--accent) 30%,transparent);border-top-color:var(--accent);animation:spin .7s linear infinite;flex:0 0 auto}
    @keyframes spin{to{transform:rotate(360deg)}}
    .action-message{margin-bottom:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2,var(--row));font-weight:800;font-size:12.5px}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:color-mix(in srgb,var(--row) 52%,transparent)}
    .table-card.is-loading{opacity:.72}
    .masters-table{width:100%;border-collapse:collapse}
    .masters-table th{height:34px;text-align:left;padding:0 12px;color:var(--text);font-size:12.5px;font-weight:900;background:color-mix(in srgb,var(--panel) 50%,transparent);border-bottom:1px solid var(--border)}
    .masters-table td{height:36px;padding:0 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text);vertical-align:middle}
    .masters-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
    .entity-name{font-weight:900}
    .empty-cell{text-align:center;color:var(--muted);font-weight:800;padding:18px 12px!important;height:auto!important}
    .status-badge{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:850}
    .status-badge i{width:7px;height:7px;border-radius:50%;background:#22c55e;display:inline-block}
    .status-badge.inactive i{background:#94a3b8}
    .row-actions{display:flex;align-items:center;gap:7px}
    .icon-action{width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 86%,transparent);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer}
    .icon-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
    .icon-action.delete:hover{border-color:color-mix(in srgb,#ef4444 50%,var(--border));background:color-mix(in srgb,#ef4444 12%,var(--input));color:#ef4444}
    .table-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;color:var(--muted);font-size:12px;font-weight:750;border-top:1px solid var(--border)}
    .table-footer b{color:var(--text)}
    .masters-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:8px 12px 12px;color:var(--muted);font-size:12px;font-weight:800}
    .masters-pager label{display:inline-flex;align-items:center;gap:6px}
    .masters-pager select{width:78px;height:32px;padding:0 8px;font-weight:850;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text)}
    .masters-pager button{width:32px;height:32px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);font-weight:950;cursor:pointer}
    .masters-pager button:disabled{opacity:.45;cursor:not-allowed}
    .masters-pager b{min-width:64px;text-align:center;color:var(--text)}
    @media (max-width:900px){.consultant-entry,.test-list-toolbar{grid-template-columns:1fr}.test-list-actions,.form-actions{justify-content:flex-start}}
  `]
})
export class ConsultantsPageComponent implements OnInit, OnDestroy {
  @Output() changed = new EventEmitter<void>();
  consultants = signal<any[]>([]);
  actionMessage = '';
  consultant: any = this.emptyConsultant();
  formOpen = false;
  loading = false;
  listSearch = '';
  listStatus: 'ALL' | 'ACTIVE' | 'ARCHIVED' = 'ALL';
  page = 1;
  pageSize = 50;
  listTotal = 0;
  private loadSeq = 0;
  private searchTimer: any = null;

  async ngOnInit() { await this.reload(); }
  ngOnDestroy() { if (this.searchTimer) clearTimeout(this.searchTimer); }

  emptyConsultant() { return { active: true, name: '', phone: '', clinic: '' }; }
  trackById = (_: number, c: any) => c?.id;
  isActive(c: any) { return c?.active !== false && c?.active !== 0; }
  totalPages() { return Math.max(1, Math.ceil(this.listTotal / Math.max(1, this.pageSize))); }

  onSearchChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 1;
      void this.reload();
    }, 220);
  }
  onFilterChange() { this.page = 1; void this.reload(); }
  setPage(p: number) {
    const next = Math.max(1, Math.min(this.totalPages(), Math.floor(+p || 1)));
    if (next === this.page) return;
    this.page = next;
    void this.reload();
  }
  setPageSize(size: number) {
    this.pageSize = Math.min(100, Math.max(1, Number(size) || 50));
    this.page = 1;
    void this.reload();
  }

  async reload() {
    const api: any = window.limsApi;
    const seq = ++this.loadSeq;
    this.loading = true;
    try {
      if (!api.searchConsultants) {
        const all = await api.listConsultants();
        if (seq !== this.loadSeq) return;
        let rows = Array.isArray(all) ? all : [];
        const q = this.listSearch.trim().toLowerCase();
        if (q) {
          rows = rows.filter((c: any) =>
            String(c.name || '').toLowerCase().includes(q)
            || String(c.phone || '').toLowerCase().includes(q)
            || String(c.clinic || '').toLowerCase().includes(q));
        }
        if (this.listStatus === 'ACTIVE') rows = rows.filter((c: any) => this.isActive(c));
        if (this.listStatus === 'ARCHIVED') rows = rows.filter((c: any) => !this.isActive(c));
        this.listTotal = rows.length;
        const start = (this.page - 1) * this.pageSize;
        this.consultants.set(rows.slice(start, start + this.pageSize));
        return;
      }
      const result = await api.searchConsultants({
        q: this.listSearch,
        status: this.listStatus,
        page: this.page,
        pageSize: this.pageSize
      });
      if (seq !== this.loadSeq) return;
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      this.consultants.set(rows);
      this.listTotal = Math.max(0, +result?.total || rows.length);
      this.page = Math.max(1, +result?.page || this.page);
      this.pageSize = +result?.pageSize || this.pageSize;
      const maxPage = this.totalPages();
      if (this.page > maxPage) {
        this.page = maxPage;
        await this.reload();
      }
    } finally {
      if (seq === this.loadSeq) this.loading = false;
    }
  }

  openCreate() {
    this.consultant = this.emptyConsultant();
    this.formOpen = true;
    this.actionMessage = '';
  }
  closeForm() {
    this.formOpen = false;
    this.consultant = this.emptyConsultant();
  }
  editConsultant(c: any) {
    this.consultant = {
      id: c.id,
      name: c.name,
      phone: c.phone || '',
      clinic: c.clinic || '',
      active: this.isActive(c)
    };
    this.formOpen = true;
    this.actionMessage = '';
  }
  async saveConsultant() {
    if (!String(this.consultant.name || '').trim()) return;
    const payload = {
      id: this.consultant.id,
      name: this.consultant.name,
      phone: this.consultant.phone || '',
      clinic: this.consultant.clinic || '',
      active: this.consultant.active !== false
    };
    await window.limsApi.saveConsultant(payload);
    this.closeForm();
    await this.reload();
    this.changed.emit();
  }
  async deleteConsultant(c: any) {
    const name = String(c?.name || 'this consultant');
    const ok = window.confirm(`Delete ${name}? If the consultant is already used in bills, it will be archived to preserve old records.`);
    if (!ok) return;
    const result = await window.limsApi.deleteConsultant?.(Number(c.id));
    if (!result) return;
    this.actionMessage = result.action === 'archived'
      ? `${name} is used in existing bills, so it was archived instead of permanently deleted.`
      : result.action === 'deleted' ? `${name} was deleted.` : `${name} was not found.`;
    if (Number(this.consultant?.id) === Number(c.id)) this.closeForm();
    await this.reload();
    this.changed.emit();
  }
}
