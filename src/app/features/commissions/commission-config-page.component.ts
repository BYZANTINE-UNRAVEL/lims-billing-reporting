import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Technique =
  | 'PERCENT_NET' | 'PERCENT_NET_NO_BILL' | 'PERCENT_GROSS' | 'PERCENT_PROFIT'
  | 'FIXED_PER_ITEM' | 'FIXED_BEFORE_DISCOUNT' | 'FIXED_AFTER_DISCOUNT' | 'FIXED_PER_QTY'
  | 'PERCENT_BILL' | 'PERCENT_BILL_BEFORE' | 'FIXED_BILL'
  | 'CUSTOM_FORMULA' | 'NONE';

type LocalProfile = {
  temp_id: string;
  id?: number;
  profile_name: string;
  technique: Technique | string;
  commission_value: number;
  formula_expression: string;
  effective_from: string;
  effective_to: string | null;
  is_default: boolean;
  active: boolean;
  _isNew?: boolean;
};

@Component({
  selector: 'app-commission-config-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="master-panel">
      <div class="panel-heading">
        <div class="panel-heading-left">
          <div class="panel-icon">%</div>
          <div>
            <h2>Commission Config</h2>
            <p>Name profiles → assign items → save. Nothing is assigned until you choose it.</p>
          </div>
        </div>
        <span class="info-pill" *ngIf="view==='list'">{{filteredDoctors().length}} consultants</span>
        <button class="action-btn ghost" type="button" *ngIf="view==='form'" (click)="backToList()">← Back to list</button>
      </div>

      <ng-container *ngIf="view==='list'; else configForm">
        <div class="test-list-toolbar">
          <label class="test-list-search">
            <span>Search</span>
            <input [(ngModel)]="doctorSearch" (ngModelChange)="onDoctorSearchChange()" placeholder="Search by name or clinic">
          </label>
        </div>
        <div class="table-card config-list-card">
          <div class="table-scroll">
            <table class="masters-table config-list-table">
              <thead>
                <tr>
                  <th>Consultant</th>
                  <th>Clinic</th>
                  <th class="num">Profiles</th>
                  <th class="num">Assigned</th>
                  <th>Status</th>
                  <th class="actions-col">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let c of filteredDoctors()">
                  <td>
                    <div class="name-cell">
                      <strong class="entity-name" [title]="c.name">{{c.name}}</strong>
                      <small class="muted-code" *ngIf="c.phone">{{c.phone}}</small>
                    </div>
                  </td>
                  <td><span class="clinic-cell" [title]="c.clinic || ''">{{c.clinic || '—'}}</span></td>
                  <td class="num">{{profileCount(c)}}</td>
                  <td class="num">{{ruleCount(c)}}</td>
                  <td>
                    <span class="status-badge" [class.inactive]="!profileCount(c)">
                      <i></i>{{profileCount(c) ? 'Configured' : 'Not set'}}
                    </span>
                  </td>
                  <td class="row-actions">
                    <button class="edit-btn" type="button" (click)="openConfig(c)">Configure</button>
                  </td>
                </tr>
                <tr *ngIf="!filteredDoctors().length">
                  <td colspan="6" class="empty-row">No consultants found. Add them under Consultants first.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="table-footer">
            <span>Total: <b>{{filteredDoctors().length}}</b></span>
            <span>Unassigned items earn ₹0 until you assign a profile.</span>
          </div>
        </div>
      </ng-container>

      <ng-template #configForm>
        <div class="form-topbar" *ngIf="selected() as doc">
          <div>
            <strong>{{doc.name}}</strong>
            <span>{{doc.clinic || 'No clinic'}} · {{doc.phone || 'No phone'}}</span>
          </div>
          <span class="status-badge" [class.inactive]="!localProfiles.length"><i></i>{{localProfiles.length ? (localProfiles.length + ' profile(s)') : 'No profiles yet'}}</span>
        </div>

        <div class="live-status" [attr.data-tone]="liveStatus().tone" aria-live="polite">
          <div class="live-status-main">
            <span class="live-pulse" aria-hidden="true"></span>
            <div class="live-status-copy">
              <b>{{liveStatus().title}}</b>
              <small>{{liveStatus().detail}}</small>
            </div>
          </div>
          <div class="live-status-meta">
            <span class="live-chip">Step {{configStep + 1}}/{{configMasterSteps.length}}</span>
            <span class="live-chip">{{localProfiles.length}} profile{{localProfiles.length===1?'':'s'}}</span>
            <span class="live-chip">{{localRules.length}} assigned</span>
            <span class="live-chip" *ngIf="selectedCount()">{{selectedCount()}} selected</span>
            <span class="live-chip warn" *ngIf="draftDirty()">Unsaved draft</span>
            <span class="live-chip ok" *ngIf="!draftDirty() && localProfiles.length">Saved baseline</span>
          </div>
          <div class="live-progress" aria-hidden="true">
            <i *ngFor="let s of configMasterSteps; let i = index"
              [class.done]="stepDone(i)"
              [class.active]="configStep===i"
              [title]="s.title"></i>
          </div>
        </div>

        <div class="note" *ngIf="message()" [class.ok]="messageTone()==='ok'" [class.err]="messageTone()==='err'">{{message()}}</div>

        <div class="config-stepper-card">
          <div class="config-master-stepper" role="tablist" aria-label="Commission configuration steps">
            <button type="button" *ngFor="let s of configMasterSteps; let i = index"
              class="config-master-step" role="tab"
              [class.active]="configStep === i" [class.done]="i < configStep"
              [attr.aria-selected]="configStep === i"
              (click)="goToConfigStep(i)">
              <span>{{ i + 1 }}</span>
              <strong>{{ s.title }}</strong>
              <small>{{ s.caption }}</small>
            </button>
          </div>

          <!-- 1. Profiles -->
          <div class="config-step-panel" *ngIf="configStep === 0">
            <div class="entry-card nested">
              <div class="form-section-title applied-head">
                <span>Commission profiles</span>
                <button class="action-btn ghost" type="button" (click)="toggleProfileForm()">
                  {{showProfileForm ? 'Cancel' : '+ Add profile'}}
                </button>
              </div>
              <p class="muted-hint">
                Give each profile a <b>name you choose</b> (e.g. “Routine 55%”, “Full billed rate”).
                Create profiles here first. Items stay unassigned until step 2.
              </p>

              <div class="special-form" *ngIf="showProfileForm">
                <div class="entry-grid">
                  <label class="master-field calc-field"><span>Profile name</span>
                    <input [(ngModel)]="profileDraft.name" placeholder="e.g. Routine 55% / Full billed rate">
                  </label>
                  <label class="master-field"><span>Calculation</span>
                    <select [(ngModel)]="profileDraft.technique">
                      <option *ngFor="let t of profileTechniques" [value]="t.id">{{t.label}}</option>
                    </select>
                  </label>
                  <label class="master-field" *ngIf="showRate(profileDraft.technique)">
                    <span>{{isPercent(profileDraft.technique) ? 'Rate %' : 'Amount ₹'}}</span>
                    <input type="number" [(ngModel)]="profileDraft.rate" min="0" step="0.01">
                  </label>
                  <label class="master-field"><span>Effective from</span>
                    <input type="date" [(ngModel)]="profileDraft.effective_from">
                  </label>
                </div>
                <div class="formula-box" *ngIf="profileDraft.technique==='CUSTOM_FORMULA'">
                  <label class="master-field"><span>Custom formula</span>
                    <textarea rows="3" [(ngModel)]="profileDraft.formula" placeholder="Example: NET_AMOUNT * 15 / 100"></textarea>
                  </label>
                </div>
                <label class="check-line">
                  <input type="checkbox" [(ngModel)]="profileDraft.is_fallback">
                  <span>Also use as fallback for items with no assignment</span>
                </label>
                <div class="form-actions">
                  <button class="action-btn primary" type="button" (click)="addLocalProfile()">Add to draft</button>
                </div>
              </div>

              <div class="table-card" *ngIf="localProfiles.length">
                <table class="masters-table">
                  <thead><tr><th>Name</th><th>Calculation</th><th>Rate</th><th>Fallback</th><th></th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of localProfiles">
                      <td><strong class="entity-name">{{p.profile_name}}</strong></td>
                      <td>{{techniqueLabel(p.technique)}}</td>
                      <td>{{rateText(p)}}</td>
                      <td>
                        <button class="action-btn ghost" type="button" (click)="setFallback(p)" [disabled]="!!p.is_default">
                          {{p.is_default ? 'Fallback' : 'Make fallback'}}
                        </button>
                      </td>
                      <td class="row-actions">
                        <button class="icon-action delete" type="button" title="Remove from draft" (click)="removeLocalProfile(p)">×</button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="empty-inline" *ngIf="!localProfiles.length && !showProfileForm">No profiles yet. Click “+ Add profile” and give it a name.</div>
            </div>
          </div>

          <!-- 2. Assign -->
          <div class="config-step-panel" *ngIf="configStep === 1">
            <div class="entry-card nested">
              <div class="form-section-title">Assign items to a profile</div>
              <p class="muted-hint">
                1) Choose a profile. 2) Select tests/profiles. 3) Click Assign.
                Nothing is selected by default. Unassigned items earn ₹0 (unless a fallback profile is set).
              </p>

              <div class="entry-grid assign-grid" style="margin-bottom:12px">
                <div class="master-field">
                  <span>Profile to assign</span>
                  <div class="profile-pick-row" role="listbox" aria-label="Draft profiles">
                    <button type="button" class="profile-pick"
                      *ngFor="let p of localProfiles; trackBy: trackByProfile"
                      [class.on]="assignProfileRef===p.temp_id"
                      (click)="pickAssignProfile(p.temp_id)">
                      <b>{{p.profile_name || 'Unnamed profile'}}</b>
                      <small>{{rateText(p)}}</small>
                    </button>
                    <button type="button" class="profile-pick"
                      [class.on]="assignProfileRef==='NO_COMMISSION'"
                      (click)="pickAssignProfile('NO_COMMISSION')">
                      <b>No commission</b>
                      <small>₹0</small>
                    </button>
                  </div>
                  <p class="muted-hint" *ngIf="!localProfiles.length" style="margin:8px 0 0">
                    No draft profiles yet — go back to step 1 and add a named profile first.
                  </p>
                </div>
                <label class="master-field"><span>Show</span>
                  <select [(ngModel)]="itemConfigFilter" (ngModelChange)="refreshFilteredItems()">
                    <option value="ALL">All items</option>
                    <option value="UNCONFIGURED">Unassigned only</option>
                    <option value="CONFIGURED">Assigned only</option>
                  </select>
                </label>
              </div>

              <div class="exc-toolbar">
                <label class="master-field grow"><span>Search catalog</span>
                  <input [(ngModel)]="itemSearch" (ngModelChange)="onItemSearchChange()" placeholder="Code or name">
                </label>
                <label class="master-field type-field"><span>Type</span>
                  <select [(ngModel)]="itemTypeFilter" (ngModelChange)="refreshFilteredItems()">
                    <option value="ALL">All</option>
                    <option value="TEST">Tests</option>
                    <option value="PROFILE">Profiles</option>
                  </select>
                </label>
                <div class="form-actions inline">
                  <button class="action-btn ghost" type="button" (click)="selectAllFiltered()">Select visible</button>
                  <button class="action-btn ghost" type="button" (click)="clearSelection()">Clear</button>
                </div>
              </div>

              <div class="item-stack" *ngIf="visibleItems.length; else assignEmpty">
                <p class="catalog-line" *ngFor="let x of visibleItems; trackBy: trackByItem"
                  [class.on]="isSelected(x)" [class.off]="isAssignedToPickedProfile(x)"
                  (click)="toggleItemRow(x)">
                  {{x.name || x.code || ('Item #' + x.item_id)}} · {{x.code || '—'}} · {{x.item_type}} · ₹{{x.price || 0}} · {{assignmentLabel(x) || 'Not assigned'}}{{isAssignedToPickedProfile(x) ? ' · Assigned' : ''}}{{isSelected(x) ? ' · Selected' : ''}}
                </p>
              </div>
              <ng-template #assignEmpty>
                <p class="muted-hint">{{catalogLoading ? 'Loading items…' : (catalogItems.length ? 'No items match the current filters.' : 'No catalog items loaded yet. Check Masters for billable tests/profiles.')}}</p>
              </ng-template>
              <div class="table-footer plain-foot">
                <span>Showing <b>{{visibleItems.length}}</b> · Selected <b>{{selectedCount()}}</b> · Assigned <b>{{localRules.length}}</b></span>
                <span>Draft only — Save in last step</span>
              </div>

              <div class="form-actions">
                <button class="action-btn primary" type="button"
                  [disabled]="!selectedCount() || !assignProfileRef"
                  (click)="assignSelectedToProfile()">
                  Assign {{selectedCount() || ''}} selected
                </button>
                <button class="action-btn ghost danger-outline" type="button"
                  *ngIf="localRules.length"
                  (click)="clearAllAssignments()">
                  Clear all assignments
                </button>
              </div>
            </div>
          </div>

          <!-- 3. Selling rates -->
          <div class="config-step-panel" *ngIf="configStep === 2">
            <div class="entry-card nested">
              <div class="form-section-title">Custom selling rate &amp; CPT</div>
              <p class="muted-hint">Optional. When this doctor is <b>Ref By</b>, billing uses this selling rate. Blank = master price. Saved with the final Save.</p>
              <div class="exc-toolbar">
                <label class="master-field grow"><span>Search</span>
                  <input [(ngModel)]="rateSearch" (ngModelChange)="refreshRateRows()" placeholder="Code or name">
                </label>
                <label class="master-field type-field"><span>Type</span>
                  <select [(ngModel)]="rateTypeFilter" (ngModelChange)="refreshRateRows()">
                    <option value="ALL">All</option>
                    <option value="TEST">Tests</option>
                    <option value="PROFILE">Profiles</option>
                  </select>
                </label>
              </div>
              <div class="item-stack" *ngIf="rateRows.length; else rateEmpty">
                <div class="catalog-line rate-line" *ngFor="let x of rateRows; trackBy: trackByItem">
                  <span>{{x.name || x.code || ('Item #' + x.item_id)}} · {{x.code || '—'}} · {{x.item_type}} · Master ₹{{x.price || 0}}</span>
                  <input class="inline-rate" type="number" min="0" step="0.01"
                    [ngModel]="x._selling_rate"
                    (ngModelChange)="x._selling_rate=$event; x._rateDirty=true; ratesDirty=true"
                    [ngModelOptions]="{standalone: true}"
                    placeholder="Selling ₹">
                  <input class="inline-cpt" type="text"
                    [ngModel]="x._cpt"
                    (ngModelChange)="x._cpt=$event; x._rateDirty=true; ratesDirty=true"
                    [ngModelOptions]="{standalone: true}"
                    placeholder="CPT">
                </div>
              </div>
              <ng-template #rateEmpty>
                <p class="muted-hint">{{catalogLoading ? 'Loading…' : 'No matching items.'}}</p>
              </ng-template>
            </div>
          </div>

          <!-- 4. Save -->
          <div class="config-step-panel" *ngIf="configStep === 3">
            <div class="entry-card nested">
              <div class="form-section-title">Review &amp; save</div>
              <p class="muted-hint">Review the draft below, then save everything in one step. Already generated statements are not changed.</p>
              <div class="summary-grid">
                <div class="summary-card"><b>{{localProfiles.length}}</b><span>Profiles</span></div>
                <div class="summary-card"><b>{{localRules.length}}</b><span>Item assignments</span></div>
                <div class="summary-card"><b>{{fallbackProfile()?.profile_name || 'None'}}</b><span>Fallback profile</span></div>
                <div class="summary-card"><b>{{ratesDirty ? 'Pending' : 'Unchanged'}}</b><span>Selling rates</span></div>
              </div>
              <div class="table-card" *ngIf="localProfiles.length" style="margin-top:12px">
                <table class="masters-table">
                  <thead><tr><th>Profile</th><th>Calculation</th><th>Rate</th><th>Fallback</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of localProfiles">
                      <td><strong class="entity-name">{{p.profile_name}}</strong></td>
                      <td>{{techniqueLabel(p.technique)}}</td>
                      <td>{{rateText(p)}}</td>
                      <td>{{p.is_default ? 'Yes' : '—'}}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="form-actions" style="margin-top:14px">
                <button class="action-btn primary" type="button" [disabled]="savingAll()" (click)="saveAll()">
                  {{savingAll() ? 'Saving…' : 'Save all'}}
                </button>
              </div>
            </div>
          </div>

          <div class="config-step-actions">
            <button class="action-btn ghost" type="button" (click)="backToList()">← Back to list</button>
            <div class="spacer"></div>
            <button class="action-btn ghost" type="button" [disabled]="configStep<=0" (click)="prevConfigStep()">Previous</button>
            <button class="action-btn primary" type="button" *ngIf="configStep < configMasterSteps.length - 1" (click)="nextConfigStep()">Next</button>
          </div>
        </div>
      </ng-template>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0;color:var(--text,#0f172a)}
    /* Default LIGHT tokens (app is often light). Dark only via body.dark-theme —
       hardcoding dark --text on a white panel was blanking rows after Masters-like restyle. */
    .master-panel{
      border:1px solid #dbe6f6;border-radius:20px;
      background:#ffffff;box-shadow:0 14px 32px rgba(15,23,42,.08);padding:12px;overflow:visible;
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
    .panel-heading-left{display:flex;align-items:center;gap:10px;min-width:0}
    .panel-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(37,99,235,.18),rgba(37,99,235,.06));color:var(--accent);font-size:15px;font-weight:950;flex:0 0 auto}
    .panel-heading h2{margin:0;font-size:16px;line-height:1.15;font-weight:950;letter-spacing:-.02em;color:var(--text)}
    .panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:var(--accent);font-size:12px;font-weight:850;white-space:nowrap}
    .test-list-toolbar{display:grid;grid-template-columns:1.35fr;gap:10px;align-items:end;margin-bottom:10px}
    .test-list-search{display:flex;flex-direction:column;gap:6px;min-width:0}
    .test-list-search span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
    .test-list-search input{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}
    .test-list-search input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .master-field{display:grid;gap:5px;min-width:0}.master-field.grow{min-width:0}
    .master-field span{font-size:12px;font-weight:850;color:var(--text)}
    .master-field input,.master-field select{height:36px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:12.5px;font-weight:650;padding:0 12px;outline:0}
    .master-field input:focus,.master-field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .form-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end}
    .form-actions.inline{justify-content:flex-start}
    .action-btn,.edit-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:var(--row);cursor:pointer;transition:.16s}
    .action-btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.20)}
    .action-btn.ghost:hover,.edit-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
    .action-btn.ghost.danger-outline{color:#dc2626;border-color:#fecaca}
    .edit-btn{height:30px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:middle}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:var(--panel)}
    .config-list-card{display:flex;flex-direction:column;min-height:0}
    .table-scroll{overflow:auto;max-height:min(560px,calc(100vh - 280px));-webkit-overflow-scrolling:touch}
    .table-scroll thead th{position:sticky;top:0;z-index:2;background:var(--row);box-shadow:0 1px 0 var(--border)}
    .masters-table{width:100%;border-collapse:collapse;table-layout:fixed}
    .masters-table th{height:34px;text-align:left;padding:0 12px;color:var(--muted);font-size:12.5px;font-weight:900;background:var(--row);border-bottom:1px solid var(--border);vertical-align:middle;line-height:1;white-space:nowrap}
    .masters-table td{height:36px;padding:0 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:#0f172a;vertical-align:middle;line-height:1}
    .masters-table tbody tr{height:36px}
    .masters-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
    .config-list-table th:nth-child(1),.config-list-table td:nth-child(1){width:34%}
    .config-list-table th:nth-child(2),.config-list-table td:nth-child(2){width:18%}
    .config-list-table th.num,.config-list-table td.num{width:10%;text-align:center}
    .config-list-table th:nth-child(5),.config-list-table td:nth-child(5){width:14%}
    .config-list-table th.actions-col,.config-list-table td.row-actions{width:14%;text-align:right}
    .name-cell{display:grid;gap:2px;min-width:0}
    .entity-name{font-size:12.8px;letter-spacing:.01em;display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;color:#0f172a!important}
    .muted-code{display:block;color:var(--muted);font-size:11px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .clinic-cell{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a}
    .status-badge{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:24px;min-height:24px;border-radius:9px;padding:0 9px;background:rgba(16,185,129,.14);color:#059669;font-size:12px;font-weight:850;line-height:1;vertical-align:middle;white-space:nowrap}
    .status-badge i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor;flex:0 0 auto}
    .status-badge.inactive{background:rgba(100,116,139,.12);color:var(--muted)}
    .row-actions{white-space:nowrap}
    .table-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 12px;color:var(--muted);font-size:12px;font-weight:750;border-top:1px solid var(--border);background:var(--row)}
    .table-footer b{color:var(--accent)}
    .empty-row{text-align:center;color:var(--muted);font-weight:750;padding:22px 12px!important;height:auto!important}
    .form-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--row)}
    .form-topbar div{display:flex;flex-direction:column;gap:2px;min-width:0}
    .form-topbar strong{font-size:14px;color:var(--text)}
    .form-topbar span{font-size:12px;color:var(--muted);font-weight:700}
    .entry-card{border:1px solid var(--border);border-radius:14px;background:var(--panel);padding:10px;margin-bottom:10px}
    .entry-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}
    .calc-field{grid-column:span 2}
    .formula-box{margin-top:10px;display:grid;gap:8px}
    .formula-box textarea{min-height:72px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:12.5px;font-weight:650;padding:10px 12px;outline:0;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .exc-toolbar{display:grid;grid-template-columns:1.5fr .55fr auto;gap:10px;align-items:end;margin-bottom:10px}
    .form-section-title{font-size:12px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);padding:6px 0 2px;border-bottom:1px solid var(--border);margin-bottom:8px}
    .muted-hint{margin:0 0 10px;color:var(--muted);font-size:12px;font-weight:700;line-height:1.4}
    .config-stepper-card{display:grid;gap:12px;margin-bottom:8px}
    .config-master-stepper{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .config-master-step{
      height:70px;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--muted);
      display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;gap:1px 8px;align-items:center;
      text-align:left;padding:9px 10px;cursor:pointer;transition:.18s ease;
    }
    .config-master-step span{grid-row:1/3;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:rgba(100,116,139,.14);color:var(--muted);font-size:12px;font-weight:950}
    .config-master-step strong{font-size:12.5px;font-weight:950;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .config-master-step small{font-size:10.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .config-master-step.active{border-color:color-mix(in srgb,var(--accent) 48%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent);box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 12%,transparent)}
    .config-master-step.active span,.config-master-step.done span{background:linear-gradient(135deg,var(--accent),#2563eb);color:#fff}
    .config-master-step.done{color:var(--text)}
    .config-step-panel{display:grid;gap:12px}
    .entry-card.nested{margin-bottom:0}
    .config-step-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 2px 8px}
    .config-step-actions .spacer{flex:1}
    .assign-grid{grid-template-columns:1.6fr .7fr}
    .profile-pick-row{display:flex;flex-wrap:wrap;gap:8px;min-height:40px}
    .profile-pick{
      display:grid;gap:2px;text-align:left;min-width:160px;max-width:280px;padding:10px 12px;border-radius:12px;
      border:1px solid var(--border);background:var(--input);color:var(--text);cursor:pointer;
    }
    .profile-pick b{display:block;font-size:12.5px;font-weight:950;color:inherit;line-height:1.25;white-space:normal;word-break:break-word}
    .profile-pick small{display:block;font-size:11px;font-weight:750;color:var(--muted)}
    .profile-pick.on{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .profile-pick.on small{color:inherit;opacity:.85}
    :host,.master-panel,.config-stepper-card,.config-step-panel,.entry-card{
      overflow:visible !important;max-height:none !important;height:auto !important;contain:none !important;
    }
    .item-stack{
      display:flex;flex-direction:column;gap:6px;box-sizing:border-box;
      margin:0 0 10px;padding:8px;min-height:56px;max-height:min(520px,58vh);height:auto;
      overflow-x:hidden;overflow-y:auto;border:1px solid #64748b;border-radius:12px;background:#fff;
    }
    .catalog-line{
      display:block;position:relative;z-index:1;box-sizing:border-box;flex:0 0 auto;
      margin:0;padding:10px 12px;min-height:42px;height:auto;
      border:1px solid #64748b;border-radius:10px;background:#fff;color:#0f172a;
      font-size:14px;font-weight:800;line-height:1.35;cursor:pointer;white-space:normal;
    }
    .catalog-line.on{border-color:#2563eb;background:#eff6ff}
    .catalog-line.off{background:#f1f5f9;color:#64748b;border-color:#cbd5e1;cursor:not-allowed;opacity:.72}
    .catalog-line.rate-line{display:flex;align-items:center;gap:10px;cursor:default}
    .catalog-line.rate-line span{flex:1 1 auto;min-width:140px;color:#0f172a;white-space:normal}
    .catalog-line .inline-rate,.catalog-line .inline-cpt{width:120px !important;max-width:120px !important;flex:0 0 120px !important;height:34px;margin:0;padding:0 8px;color:#0f172a;background:#fff}
    :host-context(body.dark-theme) .catalog-line{background:#101827;color:#f8fafc;border-color:rgba(148,163,184,.35)}
    :host-context(body.dark-theme) .catalog-line.off{background:#0b1220;color:#94a3b8;border-color:rgba(148,163,184,.22)}
    :host-context(body.dark-theme) .catalog-line.rate-line span,:host-context(body.dark-theme) .catalog-line .inline-rate,:host-context(body.dark-theme) .catalog-line .inline-cpt{color:#f8fafc;background:#0b1220}
    .item-line,.rate-line{
      display:flex;align-items:center;gap:10px;width:100%;text-align:left;
      border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#0f172a;
      padding:8px 12px;min-height:44px;overflow:visible;
    }
    .item-line{cursor:pointer}
    .item-line.on{border-color:#2563eb;background:#eff6ff}
    .item-line input{width:16px !important;height:16px !important;min-width:16px !important;max-width:16px !important;flex:0 0 16px !important;margin:0 !important;padding:0 !important;accent-color:#2563eb}
    .item-line-copy{display:grid;gap:2px;flex:1 1 auto;min-width:160px;overflow:visible}
    .item-line-copy b{display:block;color:#0f172a !important;font-size:13px !important;font-weight:900;line-height:1.25;opacity:1 !important}
    .item-line-copy small{display:block;color:#475569 !important;font-size:11px;font-weight:750;opacity:1 !important}
    .plain-foot{border:1px solid #dbe4f0;border-radius:12px;background:#f8fafc}
    .rate-line .inline-rate,.rate-line .inline-cpt{width:120px;flex:0 0 auto;height:34px;border-radius:10px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;padding:0 10px}
    :host-context(body.dark-theme) .item-line,
    :host-context(body.dark-theme) .rate-line{background:#101827;border-color:rgba(148,163,184,.22);color:#f8fafc}
    :host-context(body.dark-theme) .item-line-copy b{color:#f8fafc !important}
    :host-context(body.dark-theme) .item-line-copy small{color:#94a3b8 !important}
    :host-context(body.dark-theme) .rate-line .inline-rate,
    :host-context(body.dark-theme) .rate-line .inline-cpt{background:#0b1220;color:#f8fafc;border-color:rgba(148,163,184,.22)}
    .muted-dash{color:var(--muted)}
    .live-status{
      display:grid;gap:10px;margin:0 0 12px;padding:12px 14px;border-radius:14px;
      border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));
      background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 10%,transparent),var(--row));
    }
    .live-status[data-tone="warn"]{border-color:rgba(245,158,11,.45);background:linear-gradient(135deg,rgba(245,158,11,.12),var(--row))}
    .live-status[data-tone="ok"]{border-color:rgba(16,185,129,.4);background:linear-gradient(135deg,rgba(16,185,129,.1),var(--row))}
    .live-status[data-tone="busy"]{border-color:color-mix(in srgb,var(--accent) 50%,var(--border))}
    .live-status[data-tone="err"]{border-color:rgba(239,68,68,.45);background:linear-gradient(135deg,rgba(239,68,68,.1),var(--row))}
    .live-status-main{display:flex;align-items:flex-start;gap:10px;min-width:0}
    .live-pulse{
      width:10px;height:10px;margin-top:5px;border-radius:50%;flex:0 0 auto;
      background:var(--accent);box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 55%,transparent);
      animation:livePulse 1.6s ease-out infinite;
    }
    .live-status[data-tone="warn"] .live-pulse{background:#f59e0b}
    .live-status[data-tone="ok"] .live-pulse{background:#10b981;animation:none}
    .live-status[data-tone="err"] .live-pulse{background:#ef4444;animation:none}
    @keyframes livePulse{
      0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--accent) 45%,transparent)}
      70%{box-shadow:0 0 0 10px transparent}
      100%{box-shadow:0 0 0 0 transparent}
    }
    .live-status-copy{min-width:0;display:grid;gap:3px}
    .live-status-copy b{font-size:13px;font-weight:950;color:var(--text);line-height:1.25}
    .live-status-copy small{font-size:12px;font-weight:750;color:var(--muted);line-height:1.4}
    .live-status-meta{display:flex;flex-wrap:wrap;gap:6px}
    .live-chip{
      display:inline-flex;align-items:center;min-height:24px;padding:0 9px;border-radius:999px;
      border:1px solid var(--border);background:var(--panel);
      color:var(--muted);font-size:11px;font-weight:850;
    }
    .live-chip.warn{border-color:rgba(245,158,11,.45);color:#d97706;background:rgba(245,158,11,.1)}
    .live-chip.ok{border-color:rgba(16,185,129,.4);color:#059669;background:rgba(16,185,129,.1)}
    .live-progress{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
    .live-progress i{display:block;height:4px;border-radius:999px;background:rgba(100,116,139,.22)}
    .live-progress i.active{background:var(--accent)}
    .live-progress i.done{background:#10b981}
    .note{margin:0 0 12px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--row);font-weight:800;font-size:12.5px;color:var(--text)}
    .note.ok{border-color:rgba(16,185,129,.35);color:#059669;background:rgba(16,185,129,.08)}
    .note.err{border-color:rgba(239,68,68,.4);color:#ef4444;background:rgba(239,68,68,.08)}
    .icon-action{width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:#ef4444;cursor:pointer}
    .inline-rate,.inline-cpt{width:100%;min-width:88px;height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:12.5px;font-weight:750;padding:0 10px;outline:0}
    .code-chip,.type-chip,.rule-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:8px;border:1px solid var(--border);background:var(--row);color:var(--text);font-size:11px;font-weight:850;white-space:nowrap}
    .type-field{max-width:140px}
    .summary-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    @media(max-width:980px){
      .entry-grid,.exc-toolbar,.assign-grid,.summary-grid{grid-template-columns:1fr}
      .calc-field{grid-column:auto}.panel-heading{flex-direction:column;align-items:flex-start}
      .type-field{max-width:none}.config-master-stepper{grid-template-columns:1fr 1fr}
      .config-list-table{min-width:720px}.table-scroll{overflow:auto}
    }
    @media(max-width:720px){
      .panel-heading{align-items:flex-start;flex-direction:column}
      .info-pill{white-space:normal}
      .table-footer{flex-direction:column;align-items:flex-start}
    }
  `]
})
export class CommissionConfigPageComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();

  constructor(private cdr: ChangeDetectorRef) {}

  view: 'list' | 'form' = 'list';
  configStep = 0;
  configMasterSteps = [
    { title: 'Profiles', caption: 'Name & rules' },
    { title: 'Assign items', caption: 'Pick profile + items' },
    { title: 'Selling rates', caption: 'Optional prices' },
    { title: 'Save', caption: 'Save everything' }
  ];

  consultants = signal<any[]>([]);
  selectedId = signal<number | null>(null);
  selected = computed(() => this.consultants().find(c => +c.id === +this.selectedId()!) || null);
  message = signal('');
  messageTone = signal<'ok' | 'err' | 'info'>('info');
  savingAll = signal(false);
  catalogLoading = false;
  fullCatalogLoaded = false;
  /** Bumped so live status refreshes after draft mutations. */
  statusTick = signal(0);
  private baselineFingerprint = '';
  private draftDirtyFlag = false;

  doctorSearch = '';
  private doctorSearchTimer: any = null;
  itemSearch = '';
  private itemSearchTimer: any = null;

  tests: any[] = [];
  profiles: any[] = [];
  catalogItems: any[] = [];
  visibleItems: any[] = [];
  rateRows: any[] = [];
  rateSearch = '';
  rateTypeFilter: 'ALL' | 'TEST' | 'PROFILE' = 'ALL';
  ratesDirty = false;

  itemTypeFilter: 'ALL' | 'TEST' | 'PROFILE' = 'ALL';
  itemConfigFilter: 'ALL' | 'CONFIGURED' | 'UNCONFIGURED' = 'ALL';
  selectedKeys = signal<Set<string>>(new Set());
  selectedCount = signal(0);

  localProfiles: LocalProfile[] = [];
  localRules: any[] = [];
  assignProfileRef = '';
  showProfileForm = false;
  profileDraft: any = this.emptyProfileDraft();

  itemRatesMap = new Map<string, { selling_rate: number | null; cpt: string }>();
  groupItemKeys = new Set<string>();
  /** Profile ids present when the draft was opened. Missing ones are deleted on save. */
  private loadedProfileIds: number[] = [];

  profileTechniques = [
    { id: 'PERCENT_NET', label: 'Per item after item disc − bill total disc' },
    { id: 'PERCENT_NET_NO_BILL', label: 'Per item after item disc (no bill disc)' },
    { id: 'PERCENT_GROSS', label: 'Per item before item discount' },
    { id: 'PERCENT_PROFIT', label: '% after test cost' },
    { id: 'FIXED_BEFORE_DISCOUNT', label: 'Billed item rate before discount (full)' },
    { id: 'FIXED_AFTER_DISCOUNT', label: 'Billed item rate after discount (full)' },
    { id: 'FIXED_PER_QTY', label: 'Fixed ₹ × quantity' },
    { id: 'FIXED_BILL', label: 'Fixed ₹ per bill' },
    { id: 'CUSTOM_FORMULA', label: 'Custom formula' }
  ];

  async ngOnInit() { await this.reloadList(); }

  today() { return new Date().toISOString().slice(0, 10); }
  emptyProfileDraft() {
    return {
      name: '',
      technique: 'PERCENT_NET' as Technique,
      rate: 55,
      formula: 'NET_AMOUNT * 20 / 100',
      effective_from: this.today(),
      is_fallback: false
    };
  }

  onDoctorSearchChange() {
    if (this.doctorSearchTimer) clearTimeout(this.doctorSearchTimer);
    this.doctorSearchTimer = setTimeout(() => void this.reloadList(), 220);
  }
  onItemSearchChange() {
    if (this.itemSearchTimer) clearTimeout(this.itemSearchTimer);
    this.itemSearchTimer = setTimeout(() => {
      // Prefer client filter over re-fetch when full catalog already loaded.
      if (this.fullCatalogLoaded && this.catalogItems.length) {
        this.refreshFilteredItems();
        this.refreshRateRows();
        this.bumpStatus();
      } else {
        void this.refreshCatalogFromSearch(true);
      }
    }, 220);
  }

  async reloadList() {
    const api: any = window.limsApi;
    if (api.searchConsultants) {
      const result = await api.searchConsultants({
        q: this.doctorSearch,
        status: 'ACTIVE',
        page: 1,
        pageSize: 100
      });
      this.consultants.set(Array.isArray(result?.rows) ? result.rows : []);
    } else {
      this.consultants.set(await window.limsApi.listConsultants());
    }
  }

  filteredDoctors() {
    return this.consultants().filter((c: any) => +c.active !== 0);
  }

  profileCount(c: any) {
    const listed = Number(c?.commission_profile_count);
    if (Number.isFinite(listed)) return listed;
    return Array.isArray(c?.commission_profiles) ? c.commission_profiles.length : 0;
  }

  ruleCount(c: any) {
    const listed = Number(c?.commission_rule_count);
    if (Number.isFinite(listed)) return listed;
    return Array.isArray(c?.commission_rules) ? c.commission_rules.length : 0;
  }

  openConfig(c: any) {
    this.selectedId.set(+c.id);
    void this.openConfigAsync(c);
  }

  private async openConfigAsync(c: any) {
    const api: any = window.limsApi;
    const full = api.getConsultant ? (await api.getConsultant(+c.id)) || c : c;
    this.rememberConsultant(full);
    this.hydrateDraft(full);
    this.captureBaseline();
    await this.loadItemRatesAndGroups(+full.id);
    this.clearSelection();
    this.assignProfileRef = '';
    this.message.set('');
    this.configStep = 0;
    this.showProfileForm = false;
    this.profileDraft = this.emptyProfileDraft();
    this.ratesDirty = false;
    this.fullCatalogLoaded = false;
    this.view = 'form';
    await this.refreshCatalogFromSearch(true);
  }

  backToList() {
    this.view = 'list';
    this.selectedId.set(null);
    this.configStep = 0;
    this.message.set('');
    void this.reloadList();
  }

  rememberConsultant(c: any) {
    if (!c?.id) return;
    const rest = this.consultants().filter((x: any) => +x.id !== +c.id);
    this.consultants.set([c, ...rest]);
  }

  hydrateDraft(c: any) {
    const day = this.today();
    this.localProfiles = (c.commission_profiles || [])
      .filter((p: any) => p.active !== false && p.active !== 0)
      .filter((p: any) => this.inPeriod(p, day))
      .map((p: any) => ({
        temp_id: String(p.id),
        id: +p.id,
        profile_name: String(p.profile_name || 'Profile'),
        technique: String(p.technique || 'PERCENT_NET'),
        commission_value: +p.commission_value || 0,
        formula_expression: String(p.formula_expression || ''),
        effective_from: String(p.effective_from || day).slice(0, 10),
        effective_to: p.effective_to ? String(p.effective_to).slice(0, 10) : null,
        is_default: !!p.is_default,
        active: true,
        _isNew: false
      }));
    this.loadedProfileIds = this.localProfiles.map(p => Number(p.id)).filter(id => id > 0);

    this.localRules = (c.commission_rules || []).map((r: any) => {
      const p = this.localProfiles.find(x => String(x.id) === String(r.commission_profile_id));
      return {
        item_type: String(r.item_type || '').toUpperCase(),
        item_id: +r.item_id,
        item_name: this.itemName(r.item_type, r.item_id),
        action: String(r.action || 'USE_PROFILE').toUpperCase() === 'NO_COMMISSION' ? 'NO_COMMISSION' : 'USE_PROFILE',
        profile_ref: r.commission_profile_id ? String(r.commission_profile_id) : null,
        commission_profile_id: r.commission_profile_id || null,
        _technique: p?.technique || null,
        _rate: p ? (+p.commission_value || 0) : null,
        _formula: p?.formula_expression || null,
        _profile_name: p?.profile_name || null
      };
    });
  }

  inPeriod(p: any, day: string) {
    const from = String(p?.effective_from || '').slice(0, 10);
    const to = String(p?.effective_to || '').slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }

  goToConfigStep(index: number) {
    this.configStep = Math.max(0, Math.min(index, this.configMasterSteps.length - 1));
    this.setMessage('');
    this.bumpStatus();
    if (this.configStep === 1 || this.configStep === 2) {
      void this.refreshCatalogFromSearch(true);
    }
  }
  nextConfigStep() { this.goToConfigStep(this.configStep + 1); }
  prevConfigStep() { this.goToConfigStep(this.configStep - 1); }

  pickAssignProfile(ref: string) {
    this.assignProfileRef = ref;
    const next = new Set([...this.selectedKeys()].filter(key => {
      const [item_type, item_id] = key.split(':');
      return !this.isAssignedToPickedProfile({ item_type, item_id });
    }));
    this.setSelection(next);
    this.bumpStatus();
  }
  trackByProfile(_: number, p: LocalProfile) { return p.temp_id; }

  private bumpStatus() { this.statusTick.update(v => v + 1); }
  private setMessage(text: string, tone: 'ok' | 'err' | 'info' = 'info') {
    this.message.set(text);
    this.messageTone.set(tone);
    this.bumpStatus();
  }
  private fingerprintDraft() {
    return JSON.stringify({
      profiles: this.localProfiles.map(p => ({
        n: p.profile_name, t: p.technique, v: p.commission_value, f: p.formula_expression, d: !!p.is_default, id: p.id || p.temp_id
      })),
      rules: this.localRules.map(r => ({
        k: `${r.item_type}:${r.item_id}`, a: r.action, p: r.profile_ref || r.commission_profile_id || null
      })),
      rates: this.ratesDirty
    });
  }
  private captureBaseline() {
    this.baselineFingerprint = this.fingerprintDraft();
    this.draftDirtyFlag = false;
    this.ratesDirty = false;
    this.bumpStatus();
  }
  private markDraftDirty() {
    this.draftDirtyFlag = this.fingerprintDraft() !== this.baselineFingerprint || this.ratesDirty;
    this.bumpStatus();
  }
  draftDirty() {
    this.statusTick(); // dependency for CD when signal bumps
    return this.draftDirtyFlag || this.ratesDirty || this.fingerprintDraft() !== this.baselineFingerprint;
  }
  stepDone(i: number) {
    if (i === 0) return this.localProfiles.length > 0;
    if (i === 1) return this.localRules.length > 0;
    if (i === 2) return this.ratesDirty || this.itemRatesMap.size > 0;
    if (i === 3) return !this.draftDirty() && this.localProfiles.length > 0;
    return false;
  }
  liveStatus(): { title: string; detail: string; tone: 'idle' | 'busy' | 'warn' | 'ok' | 'err' } {
    this.statusTick();
    if (this.savingAll()) {
      return { title: 'Saving configuration…', detail: 'Writing profiles, item assignments, and selling rates to the database.', tone: 'busy' };
    }
    if (this.catalogLoading) {
      return { title: 'Loading catalog…', detail: 'Fetching tests and profiles so you can assign them.', tone: 'busy' };
    }
    if (this.messageTone() === 'err' && this.message()) {
      return { title: 'Action needed', detail: this.message(), tone: 'err' };
    }

    const doctor = this.selected()?.name || 'this doctor';
    const profiles = this.localProfiles.length;
    const assigned = this.localRules.length;
    const selected = this.selectedCount();
    const fallback = this.fallbackProfile()?.profile_name;

    if (this.configStep === 0) {
      if (this.showProfileForm) {
        const typed = String(this.profileDraft?.name || '').trim();
        return {
          title: typed ? `Creating profile “${typed}”` : 'Creating a new profile',
          detail: typed
            ? `Set the calculation, then click Add to draft. This is not saved to the database until the Save step.`
            : `Type a clear name (e.g. “Routine 55%”). Items stay unassigned until step 2.`,
          tone: 'busy'
        };
      }
      if (!profiles) {
        return {
          title: `Setting up commission for ${doctor}`,
          detail: 'Start by adding a named profile. Nothing is assigned to tests yet.',
          tone: 'warn'
        };
      }
      return {
        title: `${profiles} profile${profiles === 1 ? '' : 's'} in draft`,
        detail: fallback
          ? `Fallback for unassigned items: “${fallback}”. Next: assign specific items in step 2.`
          : 'No fallback set — unassigned items earn ₹0. Next: assign items in step 2, or mark a fallback.',
        tone: this.draftDirty() ? 'busy' : 'idle'
      };
    }

    if (this.configStep === 1) {
      if (!profiles) {
        return {
          title: 'Add a profile first',
          detail: 'Go back to step 1 and create at least one named profile before assigning items.',
          tone: 'warn'
        };
      }
      if (selected && this.assignProfileRef) {
        const target = this.assignProfileRef === 'NO_COMMISSION'
          ? 'No commission'
          : (this.localProfiles.find(p => p.temp_id === this.assignProfileRef)?.profile_name || 'profile');
        return {
          title: `Ready to assign ${selected} item${selected === 1 ? '' : 's'}`,
          detail: `Will attach them to “${target}”. Click Assign selected — still a draft until Save.`,
          tone: 'busy'
        };
      }
      if (selected && !this.assignProfileRef) {
        return {
          title: `${selected} item${selected === 1 ? '' : 's'} selected`,
          detail: 'Choose a profile (or No commission) above, then click Assign selected.',
          tone: 'warn'
        };
      }
      if (this.assignProfileRef && !selected) {
        const target = this.assignProfileRef === 'NO_COMMISSION'
          ? 'No commission'
          : (this.localProfiles.find(p => p.temp_id === this.assignProfileRef)?.profile_name || 'profile');
        return {
          title: `Profile “${target}” selected`,
          detail: 'Now tick the tests/profiles in the list that should use it. Nothing is auto-selected.',
          tone: 'busy'
        };
      }
      return {
        title: assigned ? `${assigned} item${assigned === 1 ? '' : 's'} assigned in draft` : 'Assign items to a profile',
        detail: assigned
          ? 'Select more items or continue. Changes stay in draft until you Save.'
          : 'Pick a profile first, then select items. Unassigned items earn ₹0 unless a fallback profile is set.',
        tone: assigned ? 'idle' : 'warn'
      };
    }

    if (this.configStep === 2) {
      return {
        title: this.ratesDirty ? 'Editing selling rates (unsaved)' : 'Optional selling rates',
        detail: this.ratesDirty
          ? 'Rate/CPT edits are in draft and will be written on Save all.'
          : 'Leave blank to keep master prices. Continue to Save when ready.',
        tone: this.ratesDirty ? 'busy' : 'idle'
      };
    }

    // Save step
    if (!profiles) {
      return { title: 'Nothing to save yet', detail: 'Add at least one profile before saving.', tone: 'warn' };
    }
    if (this.draftDirty()) {
      return {
        title: 'Ready to save your draft',
        detail: `${profiles} profile${profiles === 1 ? '' : 's'}, ${assigned} assignment${assigned === 1 ? '' : 's'}${this.ratesDirty ? ', selling-rate edits' : ''}. Click Save all to write to the database.`,
        tone: 'busy'
      };
    }
    return {
      title: 'Configuration is up to date',
      detail: 'No unsaved draft changes. You can still edit profiles/assignments and save again.',
      tone: 'ok'
    };
  }

  async ensureCatalogLoaded() {
    await this.refreshCatalogFromSearch(true);
  }

  /** Load billable tests/profiles. Server pageSize max is 100 — page through when needed. */
  async refreshCatalogFromSearch(force = false) {
    const api: any = window.limsApi;
    const q = this.itemSearch.trim();
    // Client-side filter when we already have a full catalog and user is just typing.
    if (!force && this.fullCatalogLoaded && this.catalogItems.length) {
      this.refreshFilteredItems();
      this.refreshRateRows();
      this.bumpStatus();
      return;
    }
    this.catalogLoading = true;
    this.bumpStatus();
    try {
      const tests = await this.fetchCatalogPages(
        (page, pageSize) => api.searchMastersTests
          ? api.searchMastersTests({ q, state: 'ACTIVE', status: 'BILLABLE', page, pageSize })
          : api.listTests?.(true).then((rows: any[]) => ({ rows, total: rows?.length || 0 }))
      );
      const profiles = await this.fetchCatalogPages(
        (page, pageSize) => api.searchMastersProfiles
          ? api.searchMastersProfiles({ q, status: 'BILLABLE', page, pageSize })
          : api.listProfiles?.(true).then((rows: any[]) => ({ rows, total: rows?.length || 0 }))
      );

      this.tests = tests;
      this.profiles = profiles.filter((p: any) => Number(p?.active ?? 1) === 1 && Number(p?.billable ?? 1) === 1);
      this.rebuildCatalog();
      this.fullCatalogLoaded = !q;
      this.refreshFilteredItems();
      this.refreshRateRows();
      this.localRules = this.localRules.map(r => ({
        ...r,
        item_name: this.itemName(r.item_type, r.item_id)
      }));
      if (!this.catalogItems.length) {
        this.setMessage('No billable tests/profiles found in Masters. Add billable items first, then come back.', 'err');
      } else if (this.configStep === 1 || this.configStep === 2) {
        this.setMessage(`Loaded ${this.catalogItems.length} catalog item(s).`, 'ok');
      }
    } catch (e: any) {
      this.setMessage(e?.message || 'Failed to load catalog items.', 'err');
    } finally {
      this.catalogLoading = false;
      this.bumpStatus();
      this.cdr.detectChanges();
    }
  }

  private async fetchCatalogPages(loader: (page: number, pageSize: number) => Promise<any>): Promise<any[]> {
    const pageSize = 100; // server allows 25|50|100 only
    const all: any[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await loader(page, pageSize);
      const rows = Array.isArray(res?.rows) ? res.rows : (Array.isArray(res) ? res : []);
      all.push(...rows);
      if (!rows.length || rows.length < pageSize) break;
      const total = Number(res?.total || 0);
      if (total && all.length >= total) break;
      // listTests returns full array once
      if (!res?.rows && Array.isArray(res)) break;
    }
    return all;
  }

  rebuildCatalog() {
    // searchMasters* already returns billable/active rows; keep rows even if flags are boolean/0/1.
    const keep = (x: any) => {
      const active = x?.active;
      const billable = x?.billable;
      if (active === false || active === 0) return false;
      if (billable === false || billable === 0) return false;
      return true;
    };
    this.catalogItems = [
      ...this.tests.filter(keep).map(t => ({
        item_type: 'TEST' as const,
        item_id: +t.id,
        name: t.display_name || t.name,
        price: +t.price || 0,
        running_cost: +t.running_cost || 0,
        code: t.code
      })),
      ...this.profiles.filter(keep).map(p => ({
        item_type: 'PROFILE' as const,
        item_id: +p.id,
        name: p.display_name || p.name,
        price: +p.price || 0,
        running_cost: +p.running_cost || 0,
        code: p.code
      }))
    ];
  }

  refreshFilteredItems() {
    const q = this.itemSearch.trim().toLowerCase();
    this.visibleItems = this.catalogItems.filter(x => {
      if (this.itemTypeFilter !== 'ALL' && x.item_type !== this.itemTypeFilter) return false;
      const assigned = this.hasAssignment(x);
      if (this.itemConfigFilter === 'CONFIGURED' && !assigned) return false;
      if (this.itemConfigFilter === 'UNCONFIGURED' && assigned) return false;
      if (!q) return true;
      return `${x.name} ${x.code || ''}`.toLowerCase().includes(q);
    });
  }

  refreshRateRows() {
    const q = this.rateSearch.trim().toLowerCase();
    this.rateRows = this.catalogItems.filter((x: any) => {
      if (this.rateTypeFilter !== 'ALL' && x.item_type !== this.rateTypeFilter) return false;
      if (!q) return true;
      return `${x.code || ''} ${x.name || ''}`.toLowerCase().includes(q);
    }).map((x: any) => {
      const key = `${x.item_type}:${x.item_id}`;
      const saved = this.itemRatesMap.get(key);
      return {
        ...x,
        _selling_rate: saved?.selling_rate ?? '',
        _cpt: saved?.cpt || '',
        _rateDirty: false
      };
    });
  }

  async loadItemRatesAndGroups(consultantId: number) {
    this.itemRatesMap.clear();
    this.groupItemKeys.clear();
    try {
      const rates = await window.limsApi.listConsultantItemRates?.(consultantId) || [];
      for (const r of rates) {
        this.itemRatesMap.set(`${String(r.item_type).toUpperCase()}:${+r.item_id}`, {
          selling_rate: r.selling_rate === null || r.selling_rate === undefined ? null : +r.selling_rate,
          cpt: String(r.cpt || '')
        });
      }
    } catch { /* optional */ }
    try {
      const all = await window.limsApi.listCommissionGroups?.() || [];
      for (const g of all) {
        if (g.active === false || g.active === 0) continue;
        if (!(g.consultant_ids || []).map(Number).includes(+consultantId)) continue;
        for (const it of (g.items || [])) {
          this.groupItemKeys.add(`${String(it.item_type || '').toUpperCase()}:${+it.item_id}`);
        }
      }
    } catch { /* optional */ }
  }

  toggleProfileForm() {
    this.showProfileForm = !this.showProfileForm;
    if (this.showProfileForm) this.profileDraft = this.emptyProfileDraft();
  }

  addLocalProfile() {
    const name = String(this.profileDraft.name || '').trim();
    if (!name) { this.message.set('Enter a profile name.'); return; }
    if (!this.profileDraft.effective_from) { this.message.set('Effective from is required.'); return; }
    if (this.profileDraft.technique === 'CUSTOM_FORMULA' && !String(this.profileDraft.formula || '').trim()) {
      this.message.set('Custom formula is required.');
      return;
    }
    if (this.localProfiles.some(p => p.profile_name.toLowerCase() === name.toLowerCase())) {
      this.message.set('A profile with this name already exists in the draft.');
      return;
    }
    const makeFallback = !!this.profileDraft.is_fallback;
    if (makeFallback) {
      this.localProfiles = this.localProfiles.map(p => ({ ...p, is_default: false }));
    }
    this.localProfiles = [
      ...this.localProfiles,
      {
        temp_id: 'tmp_' + Date.now(),
        profile_name: name,
        technique: this.profileDraft.technique,
        commission_value: this.isBilledRateTechnique(this.profileDraft.technique) ? 0 : (+this.profileDraft.rate || 0),
        formula_expression: this.profileDraft.technique === 'CUSTOM_FORMULA' ? String(this.profileDraft.formula || '').trim() : '',
        effective_from: String(this.profileDraft.effective_from).slice(0, 10),
        effective_to: null,
        is_default: makeFallback,
        active: true,
        _isNew: true
      }
    ];
    this.assignProfileRef = this.localProfiles[this.localProfiles.length - 1].temp_id;
    this.setMessage(`Profile “${name}” added to draft. Go to Assign items to attach tests.`, 'ok');
    this.showProfileForm = false;
    this.profileDraft = this.emptyProfileDraft();
    this.markDraftDirty();
  }

  setFallback(p: LocalProfile) {
    this.localProfiles = this.localProfiles.map(x => ({
      ...x,
      is_default: x.temp_id === p.temp_id
    }));
    this.message.set(`“${p.profile_name}” set as fallback for unassigned items.`);
  }

  removeLocalProfile(p: LocalProfile) {
    const used = this.localRules.filter(r => this.ruleUsesProfile(r, p));
    if (used.length) {
      const drop = new Set(used.map(r => `${r.item_type}:${r.item_id}`));
      this.localRules = this.localRules.filter(r => !drop.has(`${r.item_type}:${r.item_id}`));
    }
    this.localProfiles = this.localProfiles.filter(x => x.temp_id !== p.temp_id);
    if (this.assignProfileRef === p.temp_id) this.assignProfileRef = '';
    this.refreshFilteredItems();
    this.markDraftDirty();
    this.setMessage(
      used.length
        ? `Removed “${p.profile_name}”. ${used.length} assigned test(s) were deactivated. Save to keep this.`
        : `Removed “${p.profile_name}” from the draft. Save to keep this.`,
      'ok'
    );
  }

  fallbackProfile() {
    return this.localProfiles.find(p => p.is_default) || null;
  }

  keyOf(x: any) { return `${x.item_type}:${x.item_id}`; }
  trackByItem(index: number, x: any) { return x ? `${x.item_type}:${x.item_id}:${index}` : index; }
  isSelected(x: any) { return this.selectedKeys().has(this.keyOf(x)); }
  setSelection(next: Set<string>) {
    this.selectedKeys.set(next);
    this.selectedCount.set(next.size);
  }
  setItemSelected(x: any, on: boolean) {
    const next = new Set(this.selectedKeys());
    const key = this.keyOf(x);
    if (on) next.add(key); else next.delete(key);
    this.setSelection(next);
  }
  setAllFiltered(on: boolean) {
    if (on) this.selectAllFiltered();
    else this.clearSelection();
  }
  selectAllFiltered() {
    const next = new Set<string>();
    this.visibleItems.forEach(x => {
      if (!this.isAssignedToPickedProfile(x)) next.add(this.keyOf(x));
    });
    this.setSelection(next);
  }
  clearSelection() { this.setSelection(new Set()); }
  allFilteredSelected() {
    const rows = this.visibleItems;
    return !!rows.length && rows.every(x => this.isSelected(x));
  }
  toggleItemRow(x: any) {
    if (this.isAssignedToPickedProfile(x)) return;
    this.setItemSelected(x, !this.isSelected(x));
  }
  ruleUsesProfile(r: any, p: LocalProfile) {
    return String(r.profile_ref) === String(p.temp_id) || (!!p.id && String(r.commission_profile_id) === String(p.id));
  }
  isAssignedToPickedProfile(x: any) {
    if (!this.assignProfileRef) return false;
    const r = this.localRules.find(y => y.item_type === x.item_type && +y.item_id === +x.item_id);
    if (!r) return false;
    if (this.assignProfileRef === 'NO_COMMISSION') return String(r.action).toUpperCase() === 'NO_COMMISSION';
    const profile = this.localProfiles.find(p => p.temp_id === this.assignProfileRef);
    return !!profile && this.ruleUsesProfile(r, profile);
  }

  hasAssignment(x: any) {
    return this.localRules.some(r => r.item_type === x.item_type && +r.item_id === +x.item_id);
  }
  assignmentLabel(x: any) {
    const r = this.localRules.find(y => y.item_type === x.item_type && +y.item_id === +x.item_id);
    if (!r) return '';
    if (String(r.action).toUpperCase() === 'NO_COMMISSION') return 'No commission';
    const p = this.localProfiles.find(pr =>
      String(pr.temp_id) === String(r.profile_ref) || String(pr.id || '') === String(r.commission_profile_id || '')
    );
    return p?.profile_name || r._profile_name || 'Assigned';
  }

  assignSelectedToProfile() {
    if (!this.assignProfileRef || !this.selectedCount()) return;
    const keys = [...this.selectedKeys()].filter(key => {
      const [item_type, item_id] = key.split(':');
      return !this.isAssignedToPickedProfile({ item_type, item_id });
    });
    if (!keys.length) {
      this.message.set('Those tests are already assigned to this profile.');
      return;
    }
    const isNone = this.assignProfileRef === 'NO_COMMISSION';
    const profile = isNone ? null : this.localProfiles.find(p => p.temp_id === this.assignProfileRef);
    if (!isNone && !profile) {
      this.message.set('Select a profile from the list (create one in step 1 first).');
      return;
    }

    const next = this.localRules.filter(r => !keys.includes(`${r.item_type}:${r.item_id}`));
    for (const key of keys) {
      const [item_type, item_id] = key.split(':');
      next.push({
        item_type,
        item_id: +item_id,
        item_name: this.itemName(item_type, item_id),
        action: isNone ? 'NO_COMMISSION' : 'USE_PROFILE',
        profile_ref: isNone ? null : profile!.temp_id,
        commission_profile_id: isNone ? null : (profile!.id || null),
        _technique: isNone ? 'NONE' : profile!.technique,
        _rate: isNone ? 0 : (+profile!.commission_value || 0),
        _formula: isNone ? null : profile!.formula_expression,
        _profile_name: isNone ? null : profile!.profile_name
      });
    }
    this.localRules = next;
    this.message.set(
      isNone
        ? `Marked ${keys.length} item(s) as no commission (draft).`
        : `Assigned “${profile!.profile_name}” to ${keys.length} item(s) (draft).`
    );
    this.clearSelection();
    this.refreshFilteredItems();
  }

  clearAllAssignments() {
    if (!this.localRules.length) return;
    if (!window.confirm(`Clear all ${this.localRules.length} item assignment(s) from this draft?`)) return;
    this.localRules = [];
    this.clearSelection();
    this.refreshFilteredItems();
    this.message.set('All assignments cleared from draft.');
  }

  showRate(t: string) {
    const x = String(t || '');
    return x !== 'NONE' && x !== 'CUSTOM_FORMULA'
      && x !== 'FIXED_BEFORE_DISCOUNT' && x !== 'FIXED_AFTER_DISCOUNT' && x !== 'FIXED_PER_ITEM';
  }
  isPercent(t: string) { return String(t || '').startsWith('PERCENT'); }
  isFixed(t: string) { return String(t || '').startsWith('FIXED'); }
  isBilledRateTechnique(t: string) {
    const x = String(t || '');
    return x === 'FIXED_BEFORE_DISCOUNT' || x === 'FIXED_AFTER_DISCOUNT' || x === 'FIXED_PER_ITEM';
  }
  techniqueLabel(t: any) {
    return this.profileTechniques.find(x => x.id === t)?.label || String(t || '—');
  }
  rateText(p: any) {
    const t = p.technique || '';
    if (t === 'CUSTOM_FORMULA' || p.formula_expression) return p.formula_expression || 'Formula';
    if (this.isBilledRateTechnique(t)) return 'Full billed rate';
    if (this.isFixed(t)) return `₹${+p.commission_value || 0}`;
    return `${+p.commission_value || 0}%`;
  }
  itemName(type: any, id: any) {
    const list = String(type).toUpperCase() === 'PROFILE' ? this.profiles : this.tests;
    const found = list.find((x: any) => +x.id === +id);
    return found ? (found.display_name || found.name) : `${type} #${id}`;
  }

  mergeRateEditsIntoMap() {
    for (const row of this.rateRows) {
      const key = `${row.item_type}:${row.item_id}`;
      const rateStr = row._selling_rate === '' || row._selling_rate === null || row._selling_rate === undefined
        ? ''
        : String(row._selling_rate).trim();
      const cpt = String(row._cpt || '').trim();
      if (!rateStr && !cpt) this.itemRatesMap.delete(key);
      else {
        this.itemRatesMap.set(key, {
          selling_rate: rateStr === '' ? null : Math.max(0, Number(rateStr) || 0),
          cpt
        });
      }
    }
  }

  async saveAll() {
    const c = this.selected();
    if (!c) return;
    const keptIds = new Set(this.localProfiles.map(p => Number(p.id)).filter(id => id > 0));
    const removeProfileIds = this.loadedProfileIds.filter(id => !keptIds.has(id));
    if (!this.localProfiles.length && !removeProfileIds.length) {
      this.message.set('Add at least one named profile before saving.');
      this.configStep = 0;
      return;
    }

    this.savingAll.set(true);
    this.message.set('');
    try {
      const existingDefault = (c.commission_profiles || []).find((p: any) =>
        p.is_default && p.active !== false && p.active !== 0 && this.inPeriod(p, this.today())
      );
      const fallback = this.fallbackProfile();
      const newProfiles = this.localProfiles.filter(p => p._isNew || !p.id);
      // If fallback changed identity vs existing default, close old default period
      const close_profile_id =
        fallback && existingDefault && +existingDefault.id !== +(fallback.id || 0)
          ? +existingDefault.id
          : (fallback && !fallback.id && existingDefault ? +existingDefault.id : 0);

      const payloadProfiles = newProfiles.map(p => ({
        temp_id: p.temp_id,
        profile_name: p.profile_name,
        is_default: !!p.is_default,
        technique: p.technique,
        commission_value: +p.commission_value || 0,
        formula_expression: p.formula_expression || '',
        effective_from: p.effective_from,
        effective_to: p.effective_to,
        active: true
      }));

      // Also re-assert fallback flag on an existing profile by creating a new version if needed
      if (fallback && fallback.id && !fallback._isNew) {
        const needsDefaultFlip = !existingDefault || +existingDefault.id !== +fallback.id || !existingDefault.is_default;
        if (needsDefaultFlip && !payloadProfiles.some(p => p.temp_id === fallback.temp_id)) {
          payloadProfiles.push({
            temp_id: 'tmp_fallback_' + Date.now(),
            profile_name: fallback.profile_name,
            is_default: true,
            technique: fallback.technique,
            commission_value: +fallback.commission_value || 0,
            formula_expression: fallback.formula_expression || '',
            effective_from: this.today(),
            effective_to: null,
            active: true
          });
        }
      }

      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        close_profile_id: close_profile_id || undefined,
        effective_from: fallback?.effective_from || this.today(),
        new_profiles: payloadProfiles,
        remove_profile_ids: removeProfileIds,
        commission_rules: this.localRules.map(r => ({
          item_type: r.item_type,
          item_id: r.item_id,
          action: r.action,
          commission_profile_id: r.action === 'NO_COMMISSION' ? null : (r.profile_ref || r.commission_profile_id)
        }))
      });

      this.mergeRateEditsIntoMap();
      const rates = [...this.itemRatesMap.entries()].map(([key, v]) => {
        const [item_type, item_id] = key.split(':');
        return { item_type, item_id: +item_id, selling_rate: v.selling_rate, cpt: v.cpt };
      });
      await window.limsApi.saveConsultantItemRates?.({ consultant_id: c.id, rates });

      this.message.set('Commission configuration saved.');
      this.messageTone.set('ok');
      this.ratesDirty = false;
      this.changed.emit();

      const api: any = window.limsApi;
      const full = api.getConsultant ? await api.getConsultant(+c.id) : c;
      this.rememberConsultant(full || c);
      this.hydrateDraft(full || c);
      this.captureBaseline();
      await this.loadItemRatesAndGroups(+c.id);
      await this.refreshCatalogFromSearch(true);
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.savingAll.set(false);
    }
  }
}
