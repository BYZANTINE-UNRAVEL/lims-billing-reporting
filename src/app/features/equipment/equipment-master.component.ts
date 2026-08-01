import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

type RoundingMode = 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
type TransformOperator = 'NONE' | '+' | '-' | '*' | '/';

@Component({
  selector: 'app-equipment-master',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="equipment-shell">
      <div class="equipment-hero">
        <div>
          <span class="eyebrow">Analyzer integration</span>
          <h3>Equipment Master</h3>
          <p>First choose an equipment from the list. Create or edit opens the full analyzer configuration screen.</p>
        </div>
        <div class="hero-stats">
          <div><strong>{{ equipment.length }}</strong><span>Equipment</span></div>
          <div><strong>{{ activeCount() }}</strong><span>Active</span></div>
          <div><strong>{{ totalMappingCount() }}</strong><span>Mapped tests</span></div>
        </div>
      </div>

      <ng-container *ngIf="viewMode === 'list'; else editorTpl">
        <div class="list-page-card">
          <div class="list-toolbar">
            <div>
              <span class="eyebrow">Available equipment</span>
              <h3>Equipment list</h3>
            </div>
            <div class="list-tools">
              <label class="compact-search"><span>Search</span><input [(ngModel)]="equipmentSearch" placeholder="Name, code, model"></label>
              <div class="status-toggle">
                <button type="button" [class.active]="listMode==='ALL'" (click)="listMode='ALL'">All</button>
                <button type="button" [class.active]="listMode==='ACTIVE'" (click)="listMode='ACTIVE'">Active</button>
                <button type="button" [class.active]="listMode==='INACTIVE'" (click)="listMode='INACTIVE'">Inactive</button>
              </div>
              <button class="ux-btn primary" type="button" (click)="newEquipment()">+ Create Equipment</button>
            </div>
          </div>

          <div class="equipment-table-wrap">
            <table class="equipment-table">
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Code / ID</th>
                  <th>Type / Model</th>
                  <th>Request flow</th>
                  <th>Tests</th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let e of filteredEquipment()" [class.inactive-row]="!truthy(e.is_active)">
                  <td class="equip-name-cell">
                    <span class="equip-dot" [class.off]="!truthy(e.is_active)"></span>
                    <div><strong>{{ e.equipment_name }}</strong><small>{{ e.manufacturer || 'No manufacturer' }}</small></div>
                  </td>
                  <td><b>{{ e.equipment_code }}</b><small>ID {{ e.id }}<ng-container *ngIf="e.equipment_identifier"> · {{ e.equipment_identifier }}</ng-container></small></td>
                  <td><b>{{ e.equipment_type || '-' }}</b><small>{{ e.model || 'No model' }}</small></td>
                  <td><b>{{ prettyFlow(e.order_request_type) }}</b><small>{{ prettyFlow(e.result_receive_type) }}</small></td>
                  <td><b>{{ (e.mappings || []).length }}</b><small>{{ activeMappingCount(e) }} active</small></td>
                  <td><span class="status-pill" [class.off]="!truthy(e.is_active)">{{ truthy(e.is_active) ? 'Active' : 'Inactive' }}</span></td>
                  <td class="row-actions">
                    <button class="ux-btn tiny" type="button" (click)="editEquipment(e)">Edit</button>
                    <button class="ux-btn tiny warn" type="button" *ngIf="truthy(e.is_active)" (click)="setEquipmentActive(e, false)">Inactive</button>
                    <button class="ux-btn tiny success" type="button" *ngIf="!truthy(e.is_active)" (click)="setEquipmentActive(e, true)">Activate</button>
                    <button class="ux-btn tiny danger" type="button" [disabled]="truthy(e.is_active)" [title]="truthy(e.is_active) ? 'Make equipment inactive before delete' : 'Delete equipment'" (click)="deleteEquipmentRow(e)">Delete</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="empty-mini" *ngIf="!filteredEquipment().length">No equipment found.</div>
          </div>
        </div>
      </ng-container>

      <ng-template #editorTpl>
        <main class="equipment-editor-card">
          <div class="editor-head">
            <div>
              <span class="eyebrow">{{ form.id ? 'Edit equipment' : 'Create equipment' }}</span>
              <h3>{{ form.equipment_name || 'New equipment' }}</h3>
              <p>Configure analyzer identity, request/result flow, active status and test mappings.</p>
            </div>
            <div class="head-actions">
              <button class="ux-btn ghost" type="button" (click)="backToList()">Back to list</button>
              <button class="ux-btn danger" type="button" *ngIf="form.id" [disabled]="truthy(form.is_active)" [title]="truthy(form.is_active) ? 'Make equipment inactive before delete' : 'Delete equipment'" (click)="deleteCurrent()">Delete</button>
              <button class="ux-btn primary" type="button" (click)="save()">Save Equipment</button>
            </div>
          </div>

          <div class="compact-form-grid">
            <label class="ux-field wide"><span>Name <b>*</b></span><input [(ngModel)]="form.equipment_name" placeholder="Yumizen H500"></label>
            <label class="ux-field"><span>Code <b>*</b></span><input [(ngModel)]="form.equipment_code" (ngModelChange)="form.equipment_code=cleanCode($event)" placeholder="H500"></label>
            <label class="ux-field"><span>External ID</span><input [(ngModel)]="form.equipment_identifier" placeholder="1 / HOST01"></label>
            <label class="ux-field"><span>Type</span><input [(ngModel)]="form.equipment_type" placeholder="Hematology"></label>
            <label class="ux-field"><span>Manufacturer</span><input [(ngModel)]="form.manufacturer" placeholder="Horiba"></label>
            <label class="ux-field"><span>Model</span><input [(ngModel)]="form.model" placeholder="H500"></label>
            <label class="ux-field"><span>Order request</span><select [(ngModel)]="form.order_request_type"><option value="NONE">None</option><option value="HTTP_GET_SAMPLE_ID">HTTP GET by sample ID</option><option value="ASTM_QUERY">ASTM query</option><option value="HL7_ORDER">HL7 order</option></select></label>
            <label class="ux-field"><span>Result receive</span><select [(ngModel)]="form.result_receive_type"><option value="NONE">None</option><option value="HTTP_POST">HTTP POST</option><option value="ASTM_RESULT">ASTM result</option><option value="HL7_RESULT">HL7 result</option><option value="MANUAL_IMPORT">Manual import</option></select></label>
            <label class="ux-check"><input type="checkbox" [(ngModel)]="form.is_active"><span>Equipment active</span></label>
            <label class="ux-field wide"><span>Notes</span><input [(ngModel)]="form.notes" placeholder="Optional integration notes"></label>
          </div>

          <section class="mapping-section">
            <div class="mapping-head">
              <div>
                <span class="eyebrow">Parameter mapping</span>
                <h4>Tests used by this equipment</h4>
              </div>
              <div class="mapping-tools">
                <label class="compact-search test-search"><span>Add test</span><input [(ngModel)]="testSearch" placeholder="Search test code/name"></label>
                <button class="ux-btn" type="button" (click)="addFirstMatchedTest()">Add</button>
              </div>
            </div>

            <div class="quick-test-picks" *ngIf="testSearch.trim()">
              <button type="button" *ngFor="let t of testSuggestions().slice(0, 10)" (click)="addMapping(t)">
                <strong>{{ t.code || '-' }}</strong><span>{{ t.display_name || t.name }}</span><small>{{ t.department_name || 'No department' }}</small>
              </button>
            </div>

            <div class="mapping-table-wrap">
              <table class="mapping-table">
                <thead>
                  <tr>
                    <th>On</th><th>Test</th><th>Analyzer code</th><th>LIS code</th><th>Decimals</th><th>Round</th><th>Transform</th><th>Value</th><th>Order</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let m of form.mappings; let i = index" [class.off-row]="!m.is_active">
                    <td><input type="checkbox" [(ngModel)]="m.is_active"></td>
                    <td class="test-cell"><strong>{{ m.test_name }}</strong><small>{{ testMeta(m.test_id) }}</small></td>
                    <td><input class="mini-input code" [(ngModel)]="m.analyzer_code" (ngModelChange)="m.analyzer_code=cleanCode($event)" placeholder="WBC"></td>
                    <td><input class="mini-input code" [(ngModel)]="m.lis_code" (ngModelChange)="m.lis_code=cleanCode($event)" placeholder="WBC"></td>
                    <td><input class="mini-input tiny" type="number" min="0" max="6" [(ngModel)]="m.decimal_places"></td>
                    <td><select class="mini-select" [(ngModel)]="m.rounding_mode"><option value="NONE">None</option><option value="NEAREST">Normal</option><option value="UP">Ceil</option><option value="DOWN">Floor</option></select></td>
                    <td><select class="mini-select" [(ngModel)]="m.transform_operator"><option value="NONE">None</option><option value="*">×</option><option value="/">÷</option><option value="+">+</option><option value="-">-</option></select></td>
                    <td><input class="mini-input tiny" type="number" [(ngModel)]="m.transform_value" [disabled]="m.transform_operator==='NONE'"></td>
                    <td><input class="mini-input tiny" type="number" [(ngModel)]="m.sort_order"></td>
                    <td><button class="icon-remove" type="button" title="Remove" (click)="removeMapping(i)">×</button></td>
                  </tr>
                </tbody>
              </table>
              <div class="empty-map" *ngIf="!form.mappings.length">Search and add tests. Only active mapped rows will be shared for sample-ID GET and allowed for result POST.</div>
            </div>
          </section>
        </main>
      </ng-template>
    </section>
  `,
  styles: [`
    :host{display:block}.equipment-shell{padding:12px 14px 22px;color:var(--text);font-size:12px}.equipment-hero,.list-page-card,.equipment-editor-card{border:1px solid var(--border);background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 94%,transparent),color-mix(in srgb,var(--row) 86%,transparent));box-shadow:var(--shadow);border-radius:18px}.equipment-hero{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 16px;margin-bottom:12px}.eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:var(--muted);font-weight:800}.equipment-hero h3,.editor-head h3,.list-toolbar h3{margin:2px 0 3px;font-size:18px}.equipment-hero p,.editor-head p{margin:0;color:var(--muted);max-width:760px}.hero-stats{display:flex;gap:8px}.hero-stats div{min-width:78px;border:1px solid var(--border);border-radius:14px;background:var(--input);padding:8px 10px;text-align:center}.hero-stats strong{display:block;font-size:18px}.hero-stats span{font-size:10px;color:var(--muted);text-transform:uppercase}.list-page-card,.equipment-editor-card{padding:12px}.list-toolbar,.editor-head,.mapping-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.list-tools,.head-actions,.mapping-tools{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.compact-search span,.ux-field span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:800;margin-bottom:4px}.compact-search input,.ux-field input,.ux-field select,.mini-input,.mini-select{width:100%;height:32px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);padding:0 9px;outline:none;font-size:12px}.compact-search input:focus,.ux-field input:focus,.ux-field select:focus,.mini-input:focus,.mini-select:focus{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}.status-toggle{display:inline-flex;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:var(--input);height:32px}.status-toggle button{border:0;background:transparent;color:var(--muted);padding:0 10px;font-size:11px;font-weight:800;cursor:pointer}.status-toggle button.active{background:var(--accent-soft);color:var(--text)}.ux-btn{height:32px;border:1px solid var(--border);background:var(--row);color:var(--text);border-radius:11px;padding:0 12px;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}.ux-btn.primary{background:var(--accent-gradient);border-color:transparent;color:#fff;box-shadow:var(--glow)}.ux-btn.ghost{background:transparent}.ux-btn.danger{background:color-mix(in srgb,var(--danger) 13%,transparent);border-color:color-mix(in srgb,var(--danger) 26%,transparent);color:var(--danger)}.ux-btn.warn{background:color-mix(in srgb,#f59e0b 14%,transparent);border-color:color-mix(in srgb,#f59e0b 28%,transparent);color:#f59e0b}.ux-btn.success{background:color-mix(in srgb,var(--success) 13%,transparent);border-color:color-mix(in srgb,var(--success) 28%,transparent);color:var(--success)}.ux-btn.tiny{height:28px;border-radius:9px;padding:0 9px;font-size:11px}.ux-btn:disabled{opacity:.42;cursor:not-allowed}.equipment-table-wrap{border:1px solid var(--border);border-radius:16px;overflow:auto;background:color-mix(in srgb,var(--row) 78%,transparent)}.equipment-table{width:100%;border-collapse:separate;border-spacing:0;min-width:920px}.equipment-table th{height:32px;text-align:left;padding:0 10px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--input) 82%,transparent)}.equipment-table td{padding:8px 10px;border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent);vertical-align:middle}.equipment-table tr:last-child td{border-bottom:0}.equipment-table tr.inactive-row{opacity:.72}.equipment-table b{font-size:12px}.equipment-table small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.equip-name-cell{display:flex;align-items:center;gap:9px;min-width:190px}.equip-name-cell strong{display:block;font-size:13px}.equip-dot{width:9px;height:9px;border-radius:50%;background:var(--success);box-shadow:0 0 0 4px color-mix(in srgb,var(--success) 16%,transparent);flex:0 0 auto}.equip-dot.off{background:var(--danger);box-shadow:0 0 0 4px color-mix(in srgb,var(--danger) 14%,transparent)}.status-pill{display:inline-flex;height:24px;align-items:center;border-radius:999px;padding:0 9px;border:1px solid color-mix(in srgb,var(--success) 28%,transparent);background:color-mix(in srgb,var(--success) 12%,transparent);color:var(--success);font-weight:900;font-size:11px}.status-pill.off{border-color:color-mix(in srgb,var(--danger) 28%,transparent);background:color-mix(in srgb,var(--danger) 10%,transparent);color:var(--danger)}.actions-col{text-align:right}.row-actions{display:flex;gap:6px;justify-content:flex-end;align-items:center;min-width:260px}.compact-form-grid{display:grid;grid-template-columns:1.5fr 1fr .8fr 1fr 1fr 1fr;gap:8px;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--row) 76%,transparent);padding:10px}.ux-field.wide{grid-column:span 2}.ux-field b{color:var(--danger)}.ux-check{height:32px;align-self:end;display:flex;align-items:center;gap:8px;border:1px solid var(--border);background:var(--input);border-radius:10px;padding:0 10px;font-weight:800}.mapping-section{margin-top:12px}.mapping-head h4{margin:2px 0 0;font-size:14px}.test-search{width:260px}.quick-test-picks{display:flex;gap:7px;overflow:auto;padding:2px 0 9px}.quick-test-picks button{min-width:190px;text-align:left;border:1px solid var(--border);background:var(--row);color:var(--text);border-radius:13px;padding:8px;cursor:pointer}.quick-test-picks strong{font-size:11px;color:var(--accent);margin-right:6px}.quick-test-picks span{font-weight:800;font-size:11px}.quick-test-picks small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.mapping-table-wrap{border:1px solid var(--border);border-radius:16px;overflow:auto;background:color-mix(in srgb,var(--row) 78%,transparent)}.mapping-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}.mapping-table th{height:30px;text-align:left;padding:0 8px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--input) 82%,transparent)}.mapping-table td{padding:6px 8px;border-bottom:1px solid color-mix(in srgb,var(--border) 72%,transparent);vertical-align:middle}.mapping-table tr:last-child td{border-bottom:0}.mapping-table tr.off-row{opacity:.58}.test-cell{min-width:190px}.test-cell strong{display:block;font-size:12px}.test-cell small{display:block;color:var(--muted);font-size:10px;margin-top:2px}.mini-input{height:28px;border-radius:8px}.mini-input.code{width:92px;text-transform:uppercase}.mini-input.tiny{width:64px}.mini-select{height:28px;border-radius:8px;width:88px}.icon-remove{width:28px;height:28px;border:1px solid color-mix(in srgb,var(--danger) 28%,transparent);background:color-mix(in srgb,var(--danger) 11%,transparent);color:var(--danger);border-radius:9px;font-weight:900;cursor:pointer}.empty-mini,.empty-map{padding:20px;text-align:center;color:var(--muted);font-size:12px}.empty-map{background:color-mix(in srgb,var(--input) 50%,transparent)}@media(max-width:1180px){.compact-form-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.equipment-hero,.editor-head,.mapping-head,.list-toolbar{flex-direction:column;align-items:flex-start}.hero-stats{width:100%}.hero-stats div{flex:1}.compact-form-grid{grid-template-columns:1fr}.ux-field.wide{grid-column:auto}.test-search,.compact-search{width:100%}.row-actions{justify-content:flex-start;min-width:0}}
  `]
})
export class EquipmentMasterComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  equipment: any[] = [];
  tests: any[] = [];
  equipmentSearch = '';
  testSearch = '';
  listMode: 'ALL' | 'ACTIVE' | 'INACTIVE' = 'ALL';
  viewMode: 'list' | 'editor' = 'list';
  form: any = this.blankForm();

  async ngOnInit() { await this.load(); }

  async load() {
    const api = window.limsApi;
    this.equipment = api.listEquipment ? await api.listEquipment(false) : [];
    this.tests = await api.listTests(true);
  }

  blankForm() {
    return { id: 0, equipment_name: '', equipment_code: '', equipment_identifier: '', equipment_type: '', manufacturer: '', model: '', order_request_type: 'HTTP_GET_SAMPLE_ID', result_receive_type: 'HTTP_POST', is_active: true, notes: '', mappings: [] as any[] };
  }

  truthy(v: any) { return v === true || v === 1 || String(v).toLowerCase() === 'true'; }
  activeCount() { return this.equipment.filter(e => this.truthy(e.is_active)).length; }
  totalMappingCount() { return this.equipment.reduce((n, e) => n + ((e.mappings || []).length || 0), 0); }
  activeMappingCount(e: any) { return (e?.mappings || []).filter((m: any) => this.truthy(m.is_active)).length; }
  selectedMappings() { return Array.isArray(this.form.mappings) ? this.form.mappings : []; }
  cleanCode(v: any) { return String(v || '').toUpperCase().replace(/[^A-Z0-9_\-./]/g, '').slice(0, 32); }
  prettyFlow(v: any) { return String(v || 'NONE').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }

  filteredEquipment() {
    const q = this.equipmentSearch.trim().toLowerCase();
    return this.equipment.filter(e => {
      const active = this.truthy(e.is_active);
      if (this.listMode === 'ACTIVE' && !active) return false;
      if (this.listMode === 'INACTIVE' && active) return false;
      if (!q) return true;
      return [e.equipment_name, e.equipment_code, e.equipment_identifier, e.model, e.manufacturer, e.equipment_type].some(x => String(x || '').toLowerCase().includes(q));
    });
  }

  newEquipment() {
    this.form = this.blankForm();
    this.testSearch = '';
    this.viewMode = 'editor';
  }

  backToList() {
    this.viewMode = 'list';
    this.testSearch = '';
  }

  editEquipment(e: any) {
    this.form = {
      ...this.blankForm(),
      ...JSON.parse(JSON.stringify(e || {})),
      is_active: this.truthy(e?.is_active),
      mappings: (e?.mappings || []).map((m: any, index: number) => ({
        ...m,
        is_active: this.truthy(m.is_active),
        analyzer_code: this.cleanCode(m.analyzer_code || ''),
        lis_code: this.cleanCode(m.lis_code || m.analyzer_code || ''),
        decimal_places: m.decimal_places ?? '',
        rounding_mode: (m.rounding_mode || 'NEAREST') as RoundingMode,
        transform_operator: (m.transform_operator || 'NONE') as TransformOperator,
        transform_value: m.transform_value ?? '',
        sort_order: +m.sort_order || (index + 1) * 1000
      }))
    };
    this.viewMode = 'editor';
  }

  async setEquipmentActive(e: any, active: boolean) {
    if (!e?.id) return;
    const msg = active ? `Activate equipment ${e.equipment_name}?` : `Make equipment ${e.equipment_name} inactive?`;
    if (!confirm(msg)) return;
    const payload = { ...JSON.parse(JSON.stringify(e)), is_active: active, active };
    this.equipment = await window.limsApi.saveEquipment!(payload);
    this.changed.emit();
  }

  async deleteEquipmentRow(e: any) {
    if (!e?.id) return;
    if (this.truthy(e.is_active)) { alert('Active equipment cannot be deleted. Make it inactive first.'); return; }
    if (!confirm(`Delete inactive equipment ${e.equipment_name}?`)) return;
    this.equipment = await window.limsApi.deleteEquipment!(+e.id);
    this.changed.emit();
  }

  testSuggestions() {
    const q = this.testSearch.trim().toLowerCase();
    const existing = new Set((this.form.mappings || []).map((m: any) => +m.test_id));
    return this.tests.filter(t => !existing.has(+t.id) && (!q || [t.code, t.name, t.display_name, t.department_name].some(x => String(x || '').toLowerCase().includes(q))));
  }

  addFirstMatchedTest() {
    const first = this.testSuggestions()[0];
    if (first) this.addMapping(first);
  }

  addMapping(t: any) {
    if (!t?.id) return;
    if ((this.form.mappings || []).some((m: any) => +m.test_id === +t.id)) return;
    const code = this.cleanCode(t.code || this.shortCode(t.display_name || t.name));
    this.form.mappings = [
      ...(this.form.mappings || []),
      {
        test_id: +t.id,
        test_name: t.display_name || t.name,
        analyzer_code: code,
        lis_code: code,
        decimal_places: t.decimal_places ?? '',
        rounding_mode: t.rounding_mode || 'NEAREST',
        transform_operator: 'NONE',
        transform_value: '',
        is_active: true,
        sort_order: ((this.form.mappings || []).length + 1) * 1000,
        notes: ''
      }
    ];
    this.testSearch = '';
  }

  shortCode(name: string) {
    return String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).map(x => x[0]).join('').slice(0, 8) || 'CODE';
  }

  removeMapping(index: number) { this.form.mappings.splice(index, 1); this.form.mappings = [...this.form.mappings]; }

  testMeta(testId: number) {
    const t = this.tests.find(x => +x.id === +testId);
    const bits = [t?.code, t?.department_name, t?.unit_name].filter(Boolean);
    return bits.length ? bits.join(' · ') : 'Mapped test';
  }

  async save() {
    if (!this.form.equipment_name?.trim()) { alert('Equipment name is required.'); return; }
    if (!this.form.equipment_code?.trim()) { alert('Equipment code is required.'); return; }
    for (const m of this.form.mappings || []) {
      const analyzerCode = this.cleanCode(m.analyzer_code || '');
      if (!analyzerCode) { alert('Analyzer code is required for every mapped test.'); return; }

      const lisCode = this.cleanCode(m.lis_code || analyzerCode);
      if (!lisCode) { alert('LIS code is required for every mapped test.'); return; }

      m.analyzer_code = analyzerCode;
      m.lis_code = lisCode;
    }
    this.equipment = await window.limsApi.saveEquipment!(this.form);
    const saved = this.equipment.find(e => String(e.equipment_code).toUpperCase() === String(this.form.equipment_code).toUpperCase());
    if (saved) this.editEquipment(saved);
    this.changed.emit();
  }

  async deleteCurrent() {
    if (!this.form.id) return;
    if (this.truthy(this.form.is_active)) { alert('Active equipment cannot be deleted. Make it inactive first.'); return; }
    const ok = confirm(`Delete inactive equipment ${this.form.equipment_name}?`);
    if (!ok) return;
    this.equipment = await window.limsApi.deleteEquipment!(+this.form.id);
    this.newEquipment();
    this.viewMode = 'list';
    this.changed.emit();
  }
}
