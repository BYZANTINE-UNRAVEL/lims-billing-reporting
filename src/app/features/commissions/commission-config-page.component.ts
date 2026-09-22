import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type Technique =
  | 'PERCENT_NET' | 'PERCENT_NET_NO_BILL' | 'PERCENT_GROSS' | 'PERCENT_PROFIT'
  | 'FIXED_PER_ITEM' | 'FIXED_BEFORE_DISCOUNT' | 'FIXED_AFTER_DISCOUNT' | 'FIXED_PER_QTY'
  | 'PERCENT_BILL' | 'PERCENT_BILL_BEFORE' | 'FIXED_BILL'
  | 'CUSTOM_FORMULA' | 'NONE';

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
            <p>Default profile first, then assign items to a profile — one selection place.</p>
          </div>
        </div>
        <span class="info-pill" *ngIf="view==='list'">{{filteredDoctors().length}} consultants</span>
        <button class="action-btn ghost" type="button" *ngIf="view==='form'" (click)="backToList()">← Back to list</button>
      </div>

      <ng-container *ngIf="view==='list'; else configForm">
        <div class="list-toolbar">
          <label class="master-field grow">
            <span>Search</span>
            <input [(ngModel)]="doctorSearch" (ngModelChange)="onDoctorSearchChange()" placeholder="Search by name or clinic">
          </label>
        </div>
        <div class="table-card">
          <table class="masters-table">
            <thead>
              <tr><th>Consultant</th><th>Clinic</th><th>Default</th><th>Exceptions</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let c of filteredDoctors()">
                <td><strong class="entity-name">{{c.name}}</strong><small class="muted-code" *ngIf="c.phone">{{c.phone}}</small></td>
                <td>{{c.clinic || '—'}}</td>
                <td>{{configSummary(c)}}</td>
                <td>{{c.commission_rules?.length || 0}}</td>
                <td><span class="status-badge" [class.inactive]="!activeDefaultOf(c)"><i></i>{{activeDefaultOf(c) ? 'Configured' : 'Not set'}}</span></td>
                <td class="row-actions"><button class="edit-btn" type="button" (click)="openConfig(c)">Configure</button></td>
              </tr>
              <tr *ngIf="!filteredDoctors().length"><td colspan="6" class="empty-row">No consultants found. Add them under Consultants first.</td></tr>
            </tbody>
          </table>
          <div class="table-footer"><span>Total: <b>{{filteredDoctors().length}}</b></span><span>Unconfigured doctors earn ₹0 until a default is saved.</span></div>
        </div>
      </ng-container>

      <ng-template #configForm>
        <div class="form-topbar" *ngIf="selected() as doc">
          <div>
            <strong>{{doc.name}}</strong>
            <span>{{doc.clinic || 'No clinic'}} · {{doc.phone || 'No phone'}}</span>
          </div>
          <span class="status-badge" [class.inactive]="!activeDefault()"><i></i>{{activeDefault() ? 'Configured' : 'No commission (₹0)'}}</span>
        </div>
        <div class="note" *ngIf="message()">{{message()}}</div>

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

          <!-- Step 1: Default + special profiles -->
          <div class="config-step-panel" *ngIf="configStep === 0">
            <div class="entry-card nested">
              <div class="form-section-title">Default commission profile</div>
              <p class="muted-hint">{{defaultHint()}} Create this first. Tests and profiles without a special assignment use this default.</p>
              <div class="entry-grid">
                <label class="master-field calc-field"><span>Calculation</span>
                  <select [(ngModel)]="draft.technique" (ngModelChange)="onTechniqueChange()">
                    <option *ngFor="let t of defaultTechniques" [value]="t.id">{{t.label}}</option>
                  </select>
                </label>
                <label class="master-field" *ngIf="showRate(draft.technique)"><span>{{isPercent(draft.technique) ? 'Rate %' : 'Amount ₹'}}</span>
                  <input type="number" [(ngModel)]="draft.rate" min="0" step="0.01" (ngModelChange)="refreshFilteredItems()">
                </label>
                <label class="master-field"><span>Effective from</span><input type="date" [(ngModel)]="draft.effective_from"></label>
                <label class="master-field"><span>Effective to (optional)</span><input type="date" [(ngModel)]="draft.effective_to"></label>
              </div>
              <div class="formula-box" *ngIf="draft.technique==='CUSTOM_FORMULA'">
                <label class="master-field"><span>Custom formula</span>
                  <textarea rows="3" [(ngModel)]="draft.formula" placeholder="Example: MAX(PROFIT * 20 / 100, 50)"></textarea>
                </label>
                <div class="formula-meta">
                  <small>Variables: SELLING_PRICE, NET_AMOUNT, TEST_COST, PROFIT, DISCOUNT, QUANTITY. Functions: MIN, MAX, ABS, ROUND.</small>
                  <div class="form-actions inline">
                    <button class="action-btn ghost" type="button" (click)="validateDraftFormula()">Validate</button>
                    <span class="formula-msg" [class.ok]="formulaOk()===true" [class.bad]="formulaOk()===false">{{formulaMsg()}}</span>
                  </div>
                </div>
              </div>
              <div class="form-actions">
                <button class="action-btn primary" type="button" (click)="activeDefault() ? openPeriodModal('default') : saveDefault()">
                  {{activeDefault() ? 'Update default…' : 'Save default'}}
                </button>
              </div>
            </div>

            <div class="entry-card nested">
              <div class="form-section-title applied-head">
                <span>Special profiles</span>
                <button class="action-btn ghost" type="button" (click)="showSpecialForm = !showSpecialForm">
                  {{showSpecialForm ? 'Cancel' : '+ Add special profile'}}
                </button>
              </div>
              <p class="muted-hint">Optional named rules (e.g. full billed rate, no-share tests). After saving, assign them to items in step 3 — do not redefine calculation there.</p>
              <div class="special-form" *ngIf="showSpecialForm">
                <div class="entry-grid">
                  <label class="master-field calc-field"><span>Profile name</span>
                    <input [(ngModel)]="specialDraft.name" placeholder="e.g. Full billed rate / Outsourced">
                  </label>
                  <label class="master-field"><span>Calculation</span>
                    <select [(ngModel)]="specialDraft.technique">
                      <option *ngFor="let t of itemTechniques" [value]="t.id">{{t.label}}</option>
                    </select>
                  </label>
                  <label class="master-field" *ngIf="showRate(specialDraft.technique)">
                    <span>{{isPercent(specialDraft.technique) ? 'Rate %' : 'Amount ₹'}}</span>
                    <input type="number" [(ngModel)]="specialDraft.rate" min="0" step="0.01">
                  </label>
                  <label class="master-field"><span>Effective from</span><input type="date" [(ngModel)]="specialDraft.effective_from"></label>
                </div>
                <div class="formula-box" *ngIf="specialDraft.technique==='CUSTOM_FORMULA'">
                  <label class="master-field"><span>Custom formula</span>
                    <textarea rows="3" [(ngModel)]="specialDraft.formula" placeholder="Example: NET_AMOUNT * 15 / 100"></textarea>
                  </label>
                </div>
                <div class="form-actions">
                  <button class="action-btn primary" type="button" [disabled]="savingSpecial()" (click)="saveSpecialProfile()">
                    {{savingSpecial() ? 'Saving…' : 'Save special profile'}}
                  </button>
                </div>
              </div>
              <div class="table-card" *ngIf="specialProfiles().length">
                <table class="masters-table">
                  <thead><tr><th>Name</th><th>Calculation</th><th>Rate</th><th>Period</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of specialProfiles()">
                      <td><strong class="entity-name">{{p.profile_name}}</strong></td>
                      <td>{{techniqueLabel(p.technique)}}</td>
                      <td>{{rateText(p)}}</td>
                      <td>{{periodText(p)}}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="empty-inline" *ngIf="!specialProfiles().length && !showSpecialForm">No special profiles yet. Add one if some items need a different rule than the default.</div>
            </div>
          </div>

          <!-- Step 2: Selling rates -->
          <div class="config-step-panel" *ngIf="configStep === 1">
            <div class="entry-card nested">
              <div class="form-section-title">Custom selling rate &amp; CPT</div>
              <p class="muted-hint">
                Set this doctor’s bill price here. When they are <b>Ref By</b>, billing uses this selling rate — not the master price.
                Blank = master price.
              </p>
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
              <div class="table-card pick-table">
                <div class="pick-scroll">
                  <table class="masters-table pick-wide">
                    <thead>
                      <tr>
                        <th>Item</th><th>Code</th><th>Type</th>
                        <th class="num">Master ₹</th><th class="num">Selling rate ₹</th><th>CPT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let x of rateRows; trackBy: trackByItem">
                        <td><strong class="entity-name">{{x.name}}</strong></td>
                        <td><span class="code-chip">{{x.code || '—'}}</span></td>
                        <td><span class="type-chip" [attr.data-kind]="x.item_type">{{x.item_type}}</span></td>
                        <td class="num">₹{{x.price || 0}}</td>
                        <td class="num" (click)="$event.stopPropagation()">
                          <input class="inline-rate" type="number" min="0" step="0.01"
                            [ngModel]="x._selling_rate"
                            (ngModelChange)="x._selling_rate=$event; x._rateDirty=true"
                            [ngModelOptions]="{standalone: true}"
                            placeholder="Master">
                        </td>
                        <td (click)="$event.stopPropagation()">
                          <input class="inline-cpt" type="text"
                            [ngModel]="x._cpt"
                            (ngModelChange)="x._cpt=$event; x._rateDirty=true"
                            [ngModelOptions]="{standalone: true}"
                            placeholder="CPT">
                        </td>
                      </tr>
                      <tr *ngIf="!rateRows.length"><td colspan="6" class="empty-row">No matching items.</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div class="form-actions">
                <button class="action-btn primary" type="button" (click)="saveItemRates()">Save selling rates &amp; CPT</button>
              </div>
            </div>
          </div>

          <!-- Step 3: Assign items to a profile -->
          <div class="config-step-panel" *ngIf="configStep === 2">
            <div class="entry-card nested">
              <div class="form-section-title">Assign items to a profile</div>
              <p class="muted-hint">
                Select tests/profiles that should <b>not</b> use the default, then pick <b>one saved profile</b> (or No commission).
                Create special profiles in step 1 first — calculation is not entered again here.
              </p>
              <div class="item-filter-tabs" role="tablist" aria-label="Item assignment filter">
                <button type="button" role="tab" [class.active]="itemConfigFilter==='UNCONFIGURED'"
                  (click)="setItemConfigFilter('UNCONFIGURED')">Not assigned <b>{{unconfiguredCount()}}</b></button>
                <button type="button" role="tab" [class.active]="itemConfigFilter==='CONFIGURED'"
                  (click)="setItemConfigFilter('CONFIGURED')">Assigned <b>{{configuredCount()}}</b></button>
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
                  <button class="action-btn ghost" type="button" (click)="selectAllFiltered()">Select all</button>
                  <button class="action-btn ghost" type="button" (click)="clearSelection()">Clear</button>
                </div>
              </div>
              <div class="table-card pick-table">
                <div class="pick-scroll">
                  <table class="masters-table pick-wide">
                    <thead>
                      <tr>
                        <th class="check-col">
                          <input type="checkbox"
                            [ngModel]="allFilteredSelected()"
                            (ngModelChange)="setAllFiltered($event)"
                            [ngModelOptions]="{standalone: true}"
                            title="Select all filtered">
                        </th>
                        <th>Item</th><th>Code</th><th>Type</th><th class="num">Price</th>
                        <th>Current rule</th><th class="num">Test cost</th><th class="num">Rate</th>
                        <th class="num">Consultant</th><th class="num">Lab</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let x of visibleItems; trackBy: trackByItem" [class.selected]="isSelected(x)" (click)="toggleItemRow(x)">
                        <td class="check-col" (click)="$event.stopPropagation()">
                          <input type="checkbox"
                            [ngModel]="isSelected(x)"
                            (ngModelChange)="setItemSelected(x, $event)"
                            [ngModelOptions]="{standalone: true}">
                        </td>
                        <td><strong class="entity-name">{{x.name}}</strong></td>
                        <td><span class="code-chip">{{x.code || '—'}}</span></td>
                        <td><span class="type-chip" [attr.data-kind]="x.item_type">{{x.item_type}}</span></td>
                        <td class="num">₹{{x.price || 0}}</td>
                        <td><span class="rule-chip" *ngIf="x._ruleLabel; else noRule">{{x._ruleLabel}}</span><ng-template #noRule><span class="muted-dash">Default</span></ng-template></td>
                        <td class="num">₹{{x.running_cost || 0}}</td>
                        <td class="num"><span class="rate-chip">{{x._rateLabel}}</span></td>
                        <td class="num"><strong class="gets consultant">₹{{x._consultant}}</strong></td>
                        <td class="num"><strong class="gets lab">₹{{x._lab}}</strong></td>
                      </tr>
                      <tr *ngIf="!visibleItems.length"><td colspan="10" class="empty-row">No matching items.</td></tr>
                    </tbody>
                  </table>
                </div>
                <div class="table-footer">
                  <span>Showing <b>{{visibleItems.length}}</b> · Selected <b>{{selectedCount()}}</b></span>
                  <span>Lab = price − cost − consultant</span>
                </div>
              </div>

              <div class="apply-box" *ngIf="selectedCount()">
                <div class="apply-head">
                  <strong>Assign {{selectedCount()}} selected item(s)</strong>
                  <button class="action-btn ghost" type="button" (click)="clearSelection()">Clear selection</button>
                </div>
                <div class="entry-grid apply-grid assign-grid">
                  <label class="master-field"><span>Assignment</span>
                    <select [(ngModel)]="exc.action">
                      <option value="USE_PROFILE">Use a saved profile</option>
                      <option value="NO_COMMISSION">No commission</option>
                    </select>
                  </label>
                  <label class="master-field" *ngIf="exc.action==='USE_PROFILE'"><span>Profile</span>
                    <select [(ngModel)]="exc.profile_id">
                      <option [ngValue]="0">Select profile…</option>
                      <option *ngFor="let p of assignableProfiles()" [ngValue]="+p.id">{{profileOptionLabel(p)}}</option>
                    </select>
                  </label>
                </div>
                <p class="muted-hint" *ngIf="exc.action==='USE_PROFILE' && !assignableProfiles().length">
                  No profiles yet. Go to step 1 and save a default (and optional special profiles), then come back.
                </p>
                <div class="form-actions">
                  <button class="action-btn primary" type="button" (click)="applyException()">Assign to selected</button>
                </div>
              </div>

              <div class="applied-block" *ngIf="currentRules().length">
                <div class="form-section-title applied-head">
                  <span>Assigned exceptions</span>
                  <button class="action-btn ghost danger-outline" type="button" [disabled]="resettingExceptions()" (click)="confirmResetExceptions()">
                    {{resettingExceptions() ? 'Resetting…' : 'Reset all'}}
                  </button>
                </div>
                <p class="muted-hint">Already generated statements are not changed by resetting assignments here.</p>
                <div class="exc-toolbar applied-toolbar">
                  <label class="master-field grow"><span>Search assigned</span>
                    <input [(ngModel)]="ruleSearch" placeholder="Find by item name or type">
                  </label>
                  <span class="info-pill soft">{{filteredRules().length}} / {{currentRules().length}}</span>
                </div>
                <div class="table-card pick-table applied-table">
                  <div class="pick-scroll">
                    <table class="masters-table">
                      <thead>
                        <tr><th>Item</th><th>Type</th><th>Rule</th><th class="num">Rate</th><th></th></tr>
                      </thead>
                      <tbody>
                        <tr *ngFor="let r of filteredRules()">
                          <td><strong class="entity-name">{{r.item_name}}</strong></td>
                          <td><span class="type-chip" [attr.data-kind]="r.item_type">{{r.item_type}}</span></td>
                          <td>{{ruleText(r)}}</td>
                          <td class="num"><span class="rate-chip">{{ruleRateLabel(r)}}</span></td>
                          <td class="row-actions">
                            <button class="icon-action delete" type="button" title="Remove" (click)="removeRule(r)">×</button>
                          </td>
                        </tr>
                        <tr *ngIf="!filteredRules().length"><td colspan="5" class="empty-row">No matching exceptions.</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 4: History -->
          <div class="config-step-panel" *ngIf="configStep === 3">
            <div class="entry-card nested">
              <div class="form-section-title">History</div>
              <div class="table-card">
                <table class="masters-table">
                  <thead><tr><th>Rule</th><th>Period</th><th>Rate</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let p of historyProfiles()">
                      <td><strong class="entity-name">{{p.profile_name}}</strong><small class="muted-code">{{techniqueLabel(p.technique)}} · {{p.is_default ? 'Default' : 'Special'}}</small></td>
                      <td>{{periodText(p)}}</td>
                      <td>{{rateText(p)}}</td>
                    </tr>
                    <tr *ngIf="!historyProfiles().length"><td colspan="3" class="empty-row">No profiles yet.</td></tr>
                  </tbody>
                </table>
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

    <div class="modal-backdrop" *ngIf="periodModal()" (click)="periodModal.set(null)">
      <div class="modal" (click)="$event.stopPropagation()">
        <h3>New effective period</h3>
        <p>Current version closes the day before the new start date.</p>
        <label class="master-field"><span>New effective from</span><input type="date" [(ngModel)]="periodDraft.from"></label>
        <label class="master-field"><span>New effective to (optional)</span><input type="date" [(ngModel)]="periodDraft.to"></label>
        <div class="form-actions">
          <button class="action-btn ghost" type="button" (click)="periodModal.set(null)">Cancel</button>
          <button class="action-btn primary" type="button" (click)="confirmPeriodSave()">Save new version</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .master-panel{
      border:1px solid color-mix(in srgb,var(--border) 82%,var(--accent) 10%);border-radius:20px;
      background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 92%,transparent),color-mix(in srgb,var(--row) 72%,transparent));
      box-shadow:var(--shadow);padding:12px;overflow:hidden;
      --accent:#3b82f6;--accent-soft:color-mix(in srgb,var(--accent) 10%,transparent);
      --panel:rgba(15,23,42,.9);--row:rgba(15,23,42,.58);--input:#0b1220;
      --border:rgba(148,163,184,.18);--text:#f8fafc;--muted:#94a3b8;--shadow:0 14px 40px rgba(0,0,0,.22);
    }
    .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .panel-heading-left{display:flex;align-items:center;gap:10px;min-width:0}
    .panel-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,transparent),color-mix(in srgb,var(--accent) 7%,transparent));color:var(--accent);font-size:15px;font-weight:950;flex:0 0 auto}
    .panel-heading h2{margin:0;font-size:16px;line-height:1.15;font-weight:950;letter-spacing:-.02em}
    .panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:color-mix(in srgb,var(--accent) 76%,var(--text));font-size:12px;font-weight:850}
    .list-toolbar{display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:10px}
    .master-field{display:grid;gap:5px;min-width:0}.master-field.grow{min-width:0}
    .master-field span{font-size:12px;font-weight:850;color:var(--text)}
    .master-field input,.master-field select{height:36px;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12.5px;font-weight:650;padding:0 12px;outline:0}
    .master-field input:focus,.master-field select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .entry-card{border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--row) 62%,transparent);padding:14px;margin-bottom:14px;box-shadow:0 8px 20px rgba(0,0,0,.08)}
    .entry-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}
    .calc-field{grid-column:span 2}
    .formula-box{margin-top:10px;display:grid;gap:8px}
    .formula-box textarea{min-height:72px;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12.5px;font-weight:650;padding:10px 12px;outline:0;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
    .formula-box textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .formula-meta{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
    .formula-meta small{color:var(--muted);font-weight:750;font-size:11.5px}
    .formula-msg{font-size:12px;font-weight:800;color:var(--muted)}.formula-msg.ok{color:#10b981}.formula-msg.bad{color:#ef4444}
    .exc-toolbar{display:grid;grid-template-columns:1.5fr .55fr auto;gap:10px;align-items:end;margin-bottom:10px}
    .config-stepper-card{display:grid;gap:12px;margin-bottom:8px}
    .config-master-stepper{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .config-master-step{
      height:70px;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--muted);
      display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;gap:1px 8px;align-items:center;
      text-align:left;padding:9px 10px;cursor:pointer;transition:.18s ease;
    }
    .config-master-step span{grid-row:1/3;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted);font-size:12px;font-weight:950}
    .config-master-step strong{font-size:12.5px;font-weight:950;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .config-master-step small{font-size:10.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .config-master-step.active{border-color:color-mix(in srgb,var(--accent) 48%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent);box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 12%,transparent)}
    .config-master-step.active span,.config-master-step.done span{background:linear-gradient(135deg,var(--accent),#2563eb);color:#fff}
    .config-master-step.done{color:var(--text)}
    .config-step-panel{display:grid;gap:12px}
    .entry-card.nested{margin-bottom:0}
    .config-step-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 2px 8px}
    .config-step-actions .spacer{flex:1}
    .item-filter-tabs{
      display:grid;grid-template-columns:1fr 1fr;gap:0;margin:0 0 12px;overflow:hidden;
      border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--row) 70%,transparent);
    }
    .item-filter-tabs button{
      height:40px;border:0;border-right:1px solid var(--border);background:transparent;color:var(--muted);
      font-size:12.5px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;
    }
    .item-filter-tabs button:last-child{border-right:0}
    .item-filter-tabs button:hover{background:var(--accent-soft);color:var(--text)}
    .item-filter-tabs button.active{
      background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 14%,transparent),color-mix(in srgb,var(--accent) 6%,transparent));
      color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent);
    }
    .item-filter-tabs button b{
      display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 6px;
      border-radius:8px;background:color-mix(in srgb,var(--accent) 12%,transparent);font-size:11px;
    }
    .assign-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
    .special-form{margin:8px 0 12px;padding:12px;border:1px dashed color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--accent) 5%,transparent)}
    .empty-inline{color:var(--muted);font-size:12.5px;font-weight:750;padding:8px 2px}
    .applied-toolbar{grid-template-columns:1fr auto;margin-top:4px}
    .applied-block{margin-top:14px}
    .applied-table{max-height:280px}
    .applied-table .pick-scroll{max-height:220px}
    :host-context(body.light) .pick-table .masters-table.pick-wide thead th{background:#f8fafc}
    :host-context(body.light) .entry-card{background:#fff;border-color:#e2e8f0;box-shadow:0 6px 16px rgba(15,23,42,.06)}
    .info-pill.soft{border-color:var(--border);background:color-mix(in srgb,var(--row) 70%,transparent);color:var(--muted);font-size:11.5px;min-height:28px}
    .type-field{max-width:140px}
    .muted-hint b{color:var(--text);font-weight:900}
    .apply-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
    .form-section-title{font-size:13px;font-weight:950;letter-spacing:-.01em;text-transform:none;color:var(--text);padding:0 0 8px;border-bottom:1px solid var(--border);margin:0 0 10px}
    .form-section-title.applied-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .form-section-title.applied-head .action-btn{margin:0;flex:0 0 auto}
    .muted-hint{margin:0 0 10px;color:var(--muted);font-size:12px;font-weight:750;line-height:1.35}
    .form-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end;margin-top:10px}
    .form-actions.inline{margin-top:0;align-self:end}
    .action-btn,.edit-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:color-mix(in srgb,var(--row) 74%,transparent);cursor:pointer}
    .action-btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.20)}
    .action-btn.ghost:hover,.edit-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
    .action-btn.ghost.danger-outline{border-color:rgba(239,68,68,.45);color:#ef4444}
    .action-btn.ghost.danger-outline:hover{border-color:#ef4444;background:rgba(239,68,68,.1);color:#ef4444}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:color-mix(in srgb,var(--row) 52%,transparent)}
    .pick-table{min-width:0;overflow:hidden}
    .pick-scroll{
      display:block;
      overflow:auto;
      max-height:280px;
      min-width:0;
      width:100%;
      -webkit-overflow-scrolling:touch;
    }
    .pick-table .masters-table.pick-wide{
      width:max-content;
      min-width:100%;
      border-collapse:separate;
      border-spacing:0;
    }
    .pick-table .masters-table.pick-wide th,
    .pick-table .masters-table.pick-wide td{white-space:nowrap}
    .pick-table .masters-table.pick-wide th:first-child:not(.check-col),
    .pick-table .masters-table.pick-wide td:first-child:not(.check-col),
    .pick-table .masters-table.pick-wide .check-col + th,
    .pick-table .masters-table.pick-wide .check-col + td{min-width:160px;white-space:normal}
    .pick-table .masters-table.pick-wide thead th{
      position:sticky;top:0;z-index:3;
      background:color-mix(in srgb,var(--panel) 96%,#fff 4%);
      box-shadow:0 1px 0 var(--border);
    }
    .pick-table .masters-table.pick-wide .inline-rate{min-width:110px}
    .pick-table .masters-table.pick-wide .inline-cpt{min-width:120px}
    .masters-table{width:100%;border-collapse:collapse}
    .masters-table th{height:34px;text-align:left;padding:0 12px;color:var(--text);font-size:12.5px;font-weight:900;background:color-mix(in srgb,var(--panel) 88%,transparent);border-bottom:1px solid var(--border)}
    .masters-table td{height:38px;padding:0 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text);vertical-align:middle}
    .masters-table tbody tr{cursor:pointer;transition:background .12s}
    .masters-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
    .masters-table tbody tr.selected{background:color-mix(in srgb,var(--accent) 12%,transparent)}
    .check-col{width:42px;text-align:center;cursor:pointer;vertical-align:middle}
    .check-col input[type=checkbox]{
      width:18px;height:18px;margin:0;accent-color:var(--accent);cursor:pointer;
      appearance:auto;-webkit-appearance:checkbox;opacity:1;position:relative;z-index:2;
    }
    .num{text-align:right}
    .code-chip,.type-chip,.rule-chip,.rate-chip{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:8px;font-size:11px;font-weight:850}
    .code-chip{background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent)}
    .type-chip{background:color-mix(in srgb,var(--muted) 12%,transparent);color:var(--muted)}
    .type-chip[data-kind="PROFILE"]{background:color-mix(in srgb,#06b6d4 14%,transparent);color:#0891b2}
    .rule-chip{background:color-mix(in srgb,#f59e0b 14%,transparent);color:#d97706;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .rate-chip{background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent)}
    .gets{font-weight:900}.gets.consultant{color:#10b981}.gets.lab{color:#0ea5e9}
    .muted-dash{color:var(--muted);font-weight:750}
    .entity-name{font-size:12.8px;font-weight:900}.muted-code{display:block;margin-top:2px;color:var(--muted);font-size:11px;font-weight:750}
    .status-badge{display:inline-flex;align-items:center;gap:7px;height:24px;border-radius:9px;padding:0 9px;background:color-mix(in srgb,#10b981 16%,transparent);color:#10b981;font-size:12px;font-weight:850}
    .status-badge i{width:7px;height:7px;border-radius:50%;background:currentColor}.status-badge.inactive{background:color-mix(in srgb,var(--muted) 12%,transparent);color:var(--muted)}
    .row-actions{display:flex;gap:7px}.table-footer{display:flex;justify-content:space-between;padding:9px 12px;color:var(--muted);font-size:12px;font-weight:750;border-top:1px solid var(--border)}.table-footer b{color:var(--accent)}
    .empty-row,.empty-inline{text-align:center;color:var(--muted);font-weight:800;padding:18px}
    .form-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--row) 70%,transparent)}
    .form-topbar strong{display:block;font-size:14px}.form-topbar span{font-size:12px;color:var(--muted);font-weight:700}
    .apply-box{border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));border-radius:14px;padding:12px;margin-top:10px;background:color-mix(in srgb,var(--accent) 6%,transparent)}
    .apply-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
    .apply-head strong{font-size:13px}
    .note{margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--row) 70%,transparent);font-weight:800;font-size:12.5px}
    .icon-action{width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 86%,transparent);color:#ef4444;cursor:pointer}
    .inline-rate,.inline-cpt{width:100%;min-width:88px;height:34px;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12.5px;font-weight:750;padding:0 10px;outline:0}
    .inline-rate:focus,.inline-cpt:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:grid;place-items:center;z-index:40}
    .modal{width:min(420px,92vw);background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:18px;display:grid;gap:12px;color:var(--text)}
    .modal h3{margin:0}.modal p{margin:0;color:var(--muted);font-weight:750;font-size:12.5px}
    :host-context(body.light) .master-panel{--accent:#2563eb;--panel:#ffffff;--row:#f8fafc;--input:#ffffff;--border:#dbe4f0;--text:#0f172a;--muted:#64748b;--shadow:0 14px 32px rgba(15,23,42,.08);background:#fff;border-color:#dbe6f6}
    :host-context(body.light) .entry-card,:host-context(body.light) .table-card,:host-context(body.light) .form-topbar{background:#fff;border-color:#e2e8f0}
    :host-context(body.light) .master-field input,:host-context(body.light) .master-field select{background:#fff;color:#0f172a;border-color:#cbd5e1}
    @media(max-width:980px){.entry-grid,.exc-toolbar,.apply-grid,.assign-grid{grid-template-columns:1fr}.calc-field{grid-column:auto}.panel-heading{flex-direction:column;align-items:flex-start}.type-field{max-width:none}.config-master-stepper{grid-template-columns:1fr 1fr}.item-filter-tabs{grid-template-columns:1fr}}
  `]
})
export class CommissionConfigPageComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();

  view: 'list' | 'form' = 'list';
  configStep = 0;
  configMasterSteps = [
    { title: 'Profiles', caption: 'Default + special' },
    { title: 'Selling rates', caption: 'Doctor price / CPT' },
    { title: 'Assign items', caption: 'Pick a profile' },
    { title: 'History', caption: 'Past versions' }
  ];
  showSpecialForm = false;
  savingSpecial = signal(false);
  specialDraft: any = this.emptySpecialDraft();
  consultants = signal<any[]>([]);
  tests: any[] = [];
  profiles: any[] = [];
  catalogItems: any[] = [];
  visibleItems: any[] = [];
  doctorSearch = '';
  itemSearch = '';
  private doctorSearchTimer: any = null;
  private itemSearchTimer: any = null;

  onDoctorSearchChange() {
    if (this.doctorSearchTimer) clearTimeout(this.doctorSearchTimer);
    this.doctorSearchTimer = setTimeout(() => void this.reloadDoctorList(), 220);
  }
  onItemSearchChange() {
    if (this.itemSearchTimer) clearTimeout(this.itemSearchTimer);
    this.itemSearchTimer = setTimeout(() => void this.refreshCatalogFromSearch(), 220);
  }

  private async reloadDoctorList() {
    const api: any = window.limsApi;
    if (!api.searchConsultants) return;
    const result = await api.searchConsultants({
      q: this.doctorSearch,
      status: 'ACTIVE',
      page: 1,
      pageSize: 100
    });
    this.consultants.set(Array.isArray(result?.rows) ? result.rows : []);
  }
  ruleSearch = '';
  itemTypeFilter: 'ALL' | 'TEST' | 'PROFILE' = 'ALL';
  itemConfigFilter: 'CONFIGURED' | 'UNCONFIGURED' = 'UNCONFIGURED';
  selectedId = signal<number | null>(null);
  selected = computed(() => this.consultants().find(c => +c.id === +this.selectedId()!) || null);
  message = signal('');
  resettingExceptions = signal(false);
  formulaOk = signal<boolean | null>(null);
  formulaMsg = signal('');
  excFormulaOk = signal<boolean | null>(null);
  excFormulaMsg = signal('');
  periodModal = signal<'default' | null>(null);
  periodDraft = { from: '', to: '' };
  selectedKeys = signal<Set<string>>(new Set());
  selectedCount = signal(0);
  localRules: any[] = [];
  draft: any = this.emptyDraft();
  exc: any = this.emptyExc();
  rateSearch = '';
  rateTypeFilter: 'ALL' | 'TEST' | 'PROFILE' = 'ALL';
  rateRows: any[] = [];
  itemRatesMap = new Map<string, { selling_rate: number | null; cpt: string }>();
  groupItemKeys = new Set<string>();

  itemTechniques = [
    { id: 'PERCENT_NET', label: 'Per item after item disc − bill total disc' },
    { id: 'PERCENT_NET_NO_BILL', label: 'Per item after item disc (no bill disc)' },
    { id: 'PERCENT_GROSS', label: 'Per item before item discount' },
    { id: 'PERCENT_PROFIT', label: '% after test cost' },
    { id: 'FIXED_BEFORE_DISCOUNT', label: 'Billed item rate before discount (full commission)' },
    { id: 'FIXED_AFTER_DISCOUNT', label: 'Billed item rate after discount (full commission)' },
    { id: 'FIXED_PER_QTY', label: 'Fixed ₹ × quantity' },
    { id: 'CUSTOM_FORMULA', label: 'Custom formula' },
    { id: 'NONE', label: 'None' }
  ];
  defaultTechniques = [
    { id: 'PERCENT_NET', label: 'Per item after item discount − subtract bill total discount (default)' },
    { id: 'PERCENT_NET_NO_BILL', label: 'Per item after item discount (do not subtract bill discount)' },
    { id: 'PERCENT_GROSS', label: 'Per item before item discount' },
    { id: 'FIXED_BEFORE_DISCOUNT', label: 'Billed item rate before discount (full commission)' },
    { id: 'FIXED_AFTER_DISCOUNT', label: 'Billed item rate after discount (full commission)' },
    { id: 'FIXED_BILL', label: 'Fixed ₹ per bill' },
    { id: 'CUSTOM_FORMULA', label: 'Custom formula' },
    { id: 'NONE', label: 'None' }
  ];
  billTechniques = [
    { id: 'FIXED_BILL', label: 'Fixed ₹ per bill' },
    { id: 'NONE', label: 'None' }
  ];

  async ngOnInit() { await this.reload(); }

  async reload() {
    const api: any = window.limsApi;
    if (api.searchConsultants) {
      const result = await api.searchConsultants({ status: 'ACTIVE', page: 1, pageSize: 100 });
      this.consultants.set(Array.isArray(result?.rows) ? result.rows : []);
    } else {
      this.consultants.set(await window.limsApi.listConsultants());
    }
    // Catalog loaded on demand via item search — avoid hydrating full test/profile masters.
    this.tests = [];
    this.profiles = [];
    this.rebuildCatalog();
    if (this.selectedId()) {
      const full = api.getConsultant
        ? await api.getConsultant(+this.selectedId()!)
        : this.consultants().find((x: any) => +x.id === +this.selectedId()!);
      if (full) {
        this.rememberConsultant(full);
        this.hydrateFromConsultant(full);
        await this.loadItemRatesAndGroups(+full.id);
      }
    } else {
      this.refreshFilteredItems();
    }
  }

  private rememberConsultant(c: any) {
    if (!c?.id) return;
    const rest = this.consultants().filter((x: any) => +x.id !== +c.id);
    this.consultants.set([c, ...rest]);
  }

  today() { return new Date().toISOString().slice(0, 10); }
  emptyDraft() {
    return { mode: 'ITEM', technique: 'PERCENT_NET' as Technique, rate: 0, formula: 'NET_AMOUNT * 20 / 100', effective_from: this.today(), effective_to: '' };
  }
  emptyExc() {
    return { action: 'USE_PROFILE', profile_id: 0, effective_from: this.today() };
  }
  emptySpecialDraft() {
    return {
      name: '',
      technique: 'FIXED_AFTER_DISCOUNT' as Technique,
      rate: 0,
      formula: 'NET_AMOUNT * 20 / 100',
      effective_from: this.today()
    };
  }

  goToConfigStep(index: number) {
    this.configStep = Math.max(0, Math.min(index, this.configMasterSteps.length - 1));
    this.message.set('');
  }
  nextConfigStep() { this.goToConfigStep(this.configStep + 1); }
  prevConfigStep() { this.goToConfigStep(this.configStep - 1); }

  /** Profiles selectable when assigning items (special only — default applies automatically). */
  assignableProfiles() {
    return this.specialProfiles();
  }
  specialProfiles() {
    const c = this.selected();
    const today = this.today();
    return [...(c?.commission_profiles || [])]
      .filter((p: any) => !p.is_default)
      .filter((p: any) => p.active !== false && p.active !== 0)
      .filter((p: any) => {
        const from = String(p.effective_from || '').slice(0, 10);
        const to = p.effective_to ? String(p.effective_to).slice(0, 10) : '';
        if (from && from > today) return false;
        if (to && to < today) return false;
        return true;
      })
      .sort((a: any, b: any) => String(a.profile_name || '').localeCompare(String(b.profile_name || '')));
  }
  profileOptionLabel(p: any) {
    return `${p.profile_name || 'Profile'} · ${this.techniqueLabel(p.technique)} · ${this.rateText(p)}`;
  }

  isItemTechnique(t: string) {
    return !['PERCENT_BILL', 'PERCENT_BILL_BEFORE', 'FIXED_BILL'].includes(String(t || ''));
  }
  showRate(t: string) {
    const x = String(t || '');
    // Billed item rate before/after discount = full line amount; no separate Amount ₹.
    return x !== 'NONE' && x !== 'CUSTOM_FORMULA'
      && x !== 'FIXED_BEFORE_DISCOUNT' && x !== 'FIXED_AFTER_DISCOUNT' && x !== 'FIXED_PER_ITEM';
  }
  onTechniqueChange() {
    this.draft.mode = this.isItemTechnique(this.draft.technique) ? 'ITEM' : 'BILL';
    this.formulaOk.set(null);
    this.formulaMsg.set('');
    this.refreshFilteredItems();
  }
  defaultHint() {
    switch (String(this.draft.technique || '')) {
      case 'PERCENT_NET':
        return 'Default: % on each billed line after its item discount, then subtract that line’s share of the bill’s total discount.';
      case 'PERCENT_NET_NO_BILL':
        return 'Default: % on each billed line after its item discount only — bill total discount is ignored for commission.';
      case 'PERCENT_GROSS':
        return 'Default: % on each billed line before any item discount.';
      case 'PERCENT_BILL':
      case 'PERCENT_BILL_BEFORE':
        return 'Legacy full-bill % — pick a per-item option or Fixed ₹ per bill, then save a new period.';
      case 'FIXED_BEFORE_DISCOUNT':
        return 'Default: full commission = billed item rate before discount (gross line amount).';
      case 'FIXED_AFTER_DISCOUNT':
      case 'FIXED_PER_ITEM':
        return 'Default: full commission = billed item rate after discount (net line after item + bill discount share).';
      case 'FIXED_BILL':
        return 'Default: fixed ₹ commission once per bill. Item exceptions (if any) stay on their own rule and are left out of this pot.';
      case 'CUSTOM_FORMULA':
        return 'Default: custom formula per billed line. Example: MAX(PROFIT * 20 / 100, 50).';
      default:
        return 'Choose how commission is calculated for this doctor.';
    }
  }
  async validateDraftFormula() {
    const r = await window.limsApi.validateCommissionFormula?.({ formula: this.draft.formula });
    this.formulaOk.set(!!r?.valid);
    this.formulaMsg.set(r?.valid ? `Valid · sample ₹${Number(r.result || 0).toFixed(2)}` : (r?.error || 'Invalid formula'));
  }
  async validateExcFormula() {
    const r = await window.limsApi.validateCommissionFormula?.({ formula: this.exc.formula });
    this.excFormulaOk.set(!!r?.valid);
    this.excFormulaMsg.set(r?.valid ? `Valid · sample ₹${Number(r.result || 0).toFixed(2)}` : (r?.error || 'Invalid formula'));
  }

  filteredDoctors() {
    return this.consultants().filter((c: any) => +c.active !== 0);
  }

  openConfig(c: any) {
    this.selectedId.set(+c.id);
    void this.openConfigAsync(c);
  }

  private async openConfigAsync(c: any) {
    const api: any = window.limsApi;
    const full = api.getConsultant ? (await api.getConsultant(+c.id)) || c : c;
    this.rememberConsultant(full);
    this.hydrateFromConsultant(full);
    await this.loadItemRatesAndGroups(+full.id);
    this.setSelection(new Set());
    this.message.set('');
    this.configStep = 0;
    this.showSpecialForm = false;
    this.specialDraft = this.emptySpecialDraft();
    this.view = 'form';
    await this.refreshCatalogFromSearch();
  }

  async refreshCatalogFromSearch() {
    const api: any = window.limsApi;
    const q = this.itemSearch.trim();
    const pageSize = 80;
    try {
      const [testsRes, profilesRes] = await Promise.all([
        api.searchMastersTests
          ? api.searchMastersTests({ q, state: 'ACTIVE', status: 'BILLABLE', page: 1, pageSize })
          : api.listTests(true).then((rows: any[]) => ({ rows })),
        api.searchMastersProfiles
          ? api.searchMastersProfiles({ q, status: 'ALL', page: 1, pageSize })
          : api.listProfiles(true).then((rows: any[]) => ({ rows }))
      ]);
      this.tests = Array.isArray(testsRes?.rows) ? testsRes.rows : (Array.isArray(testsRes) ? testsRes : []);
      this.profiles = (Array.isArray(profilesRes?.rows) ? profilesRes.rows : (Array.isArray(profilesRes) ? profilesRes : []))
        .filter((p: any) => Number(p?.active ?? 1) === 1 && Number(p?.billable ?? 1) === 1);
      this.rebuildCatalog();
      this.refreshFilteredItems();
    } catch {
      /* keep prior catalog */
    }
  }

  backToList() {
    this.view = 'list';
    this.selectedId.set(null);
    this.configStep = 0;
    this.message.set('');
  }

  hydrateFromConsultant(c: any) {
    const def = this.activeDefaultOf(c);
    let technique = String(def?.technique || 'PERCENT_NET');
    // Net bill % options removed — migrate legacy defaults to per-item net.
    if (technique === 'PERCENT_BILL' || technique === 'PERCENT_BILL_BEFORE') {
      technique = 'PERCENT_NET';
      this.message.set('Legacy “net bill %” was removed. Default switched to per-item after discount — save a new period to confirm.');
    }
    this.draft = def
      ? {
          mode: this.isItemTechnique(technique) ? 'ITEM' : 'BILL',
          technique,
          rate: +def.commission_value || 0,
          formula: def.formula_expression || 'NET_AMOUNT * 20 / 100',
          effective_from: String(def.effective_from || this.today()).slice(0, 10),
          effective_to: def.effective_to ? String(def.effective_to).slice(0, 10) : ''
        }
      : this.emptyDraft();
    this.localRules = (c.commission_rules || []).map((r: any) => {
      const p = (c.commission_profiles || []).find((x: any) => String(x.id) === String(r.commission_profile_id));
      return {
        ...r,
        item_name: this.itemName(r.item_type, r.item_id),
        profile_temp_id: r.commission_profile_id ? String(r.commission_profile_id) : null,
        _technique: p?.technique || null,
        _rate: p ? (+p.commission_value || 0) : null,
        _formula: p?.formula_expression || null
      };
    });
    this.exc = this.emptyExc();
    this.specialDraft = this.emptySpecialDraft();
    this.showSpecialForm = false;
    this.formulaOk.set(null);
    this.formulaMsg.set('');
    this.excFormulaOk.set(null);
    this.excFormulaMsg.set('');
    this.refreshFilteredItems();
    this.refreshRateRows();
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
    } catch { /* optional API */ }
    try {
      const all = await window.limsApi.listCommissionGroups?.() || [];
      for (const g of all) {
        if (g.active === false || g.active === 0) continue;
        const assigned = (g.consultant_ids || []).map(Number).includes(+consultantId);
        if (!assigned) continue;
        for (const it of (g.items || [])) {
          this.groupItemKeys.add(`${String(it.item_type || '').toUpperCase()}:${+it.item_id}`);
        }
      }
    } catch { /* optional */ }
    this.refreshRateRows();
    this.refreshFilteredItems();
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

  async saveItemRates() {
    const c = this.selected();
    if (!c) return;
    // Merge current edits into map then save all non-empty
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
    const rates = [...this.itemRatesMap.entries()].map(([key, v]) => {
      const [item_type, item_id] = key.split(':');
      return { item_type, item_id: +item_id, selling_rate: v.selling_rate, cpt: v.cpt };
    });
    try {
      await window.limsApi.saveConsultantItemRates?.({ consultant_id: c.id, rates });
      this.message.set('Selling rates & CPT saved.');
      await this.loadItemRatesAndGroups(+c.id);
      this.changed.emit();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    }
  }

  activeDefaultOf(c: any) {
    const day = this.today();
    const rows = (c?.commission_profiles || []).filter((p: any) => p.is_default && p.active !== false && p.active !== 0);
    return rows.find((p: any) => this.inPeriod(p, day)) || null;
  }
  activeDefault() { return this.activeDefaultOf(this.selected()); }
  inPeriod(p: any, day: string) {
    const from = String(p?.effective_from || '').slice(0, 10);
    const to = String(p?.effective_to || '').slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }

  techniquesForMode() { return this.isItemTechnique(this.draft.technique) ? this.itemTechniques : this.billTechniques; }
  onModeChange() {
    this.draft.technique = this.draft.mode === 'BILL' ? 'FIXED_BILL' : 'PERCENT_NET';
  }
  isPercent(t: string) { return String(t || '').startsWith('PERCENT'); }
  isFixed(t: string) {
    const x = String(t || '');
    return x.startsWith('FIXED');
  }
  configSummary(c: any) {
    const d = this.activeDefaultOf(c);
    if (!d) return 'Not configured';
    return `${this.techniqueLabel(d.technique)} ${this.rateText(d)}`;
  }
  techniqueLabel(t: any) {
    const id = t === 'FIXED_PER_ITEM' ? 'FIXED_AFTER_DISCOUNT'
      : (t === 'PERCENT_BILL' || t === 'PERCENT_BILL_BEFORE') ? 'PERCENT_NET'
      : t;
    return [...this.defaultTechniques, ...this.itemTechniques, ...this.billTechniques].find(x => x.id === id)?.label
      || (t === 'PERCENT_BILL' || t === 'PERCENT_BILL_BEFORE' ? 'Per item after discounts (was net bill %)' : String(t || '—'));
  }
  isBilledRateTechnique(t: string) {
    const x = String(t || '');
    return x === 'FIXED_BEFORE_DISCOUNT' || x === 'FIXED_AFTER_DISCOUNT' || x === 'FIXED_PER_ITEM';
  }
  rateText(p: any) {
    const t = p.technique || p.commission_technique || '';
    if (t === 'NONE' || p.commission_type === 'NONE') return '—';
    if (t === 'CUSTOM_FORMULA' || p.formula_expression) return p.formula_expression || 'Formula';
    if (this.isBilledRateTechnique(t)) return 'Full billed rate';
    if (this.isFixed(t) || p.commission_type === 'FIXED') return `₹${+p.commission_value || 0}`;
    return `${+p.commission_value || 0}%`;
  }
  periodText(p: any) {
    const from = p.effective_from ? String(p.effective_from).slice(0, 10) : '—';
    const to = p.effective_to ? String(p.effective_to).slice(0, 10) : 'open';
    return `${from} → ${to}`;
  }
  historyProfiles() {
    const c = this.selected();
    return [...(c?.commission_profiles || [])].sort((a: any, b: any) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')) || (+b.id - +a.id));
  }

  rebuildCatalog() {
    const billable = (x: any) => Number(x?.active ?? 1) === 1 && Number(x?.billable ?? 1) === 1;
    this.catalogItems = [
      ...this.tests.filter(billable).map(t => ({
        item_type: 'TEST',
        item_id: +t.id,
        name: t.display_name || t.name,
        price: +t.price || 0,
        running_cost: +t.running_cost || 0,
        code: t.code
      })),
      ...this.profiles.filter(billable).map(p => ({
        item_type: 'PROFILE',
        item_id: +p.id,
        name: p.display_name || p.name,
        price: +p.price || 0,
        running_cost: +p.running_cost || 0,
        code: p.code
      }))
    ];
  }
  decorateItem(x: any) {
    const share = this.shareEstimate(x);
    x._ruleLabel = this.exceptionLabel(x);
    x._rateLabel = this.effectiveRateLabel(x);
    x._consultant = share.consultant;
    x._lab = share.lab;
    return x;
  }
  hasCommissionRule(x: any) {
    const key = `${x.item_type}:${x.item_id}`;
    if (this.localRules.some((r: any) => r.item_type === x.item_type && +r.item_id === +x.item_id)) return true;
    return this.groupItemKeys.has(key);
  }
  configuredCount() {
    const q = this.itemSearch.trim().toLowerCase();
    return this.catalogItems.filter(x => {
      if (!this.hasCommissionRule(x)) return false;
      if (this.itemTypeFilter !== 'ALL' && x.item_type !== this.itemTypeFilter) return false;
      if (!q) return true;
      return `${x.name} ${x.code || ''}`.toLowerCase().includes(q);
    }).length;
  }
  unconfiguredCount() {
    const q = this.itemSearch.trim().toLowerCase();
    return this.catalogItems.filter(x => {
      if (this.hasCommissionRule(x)) return false;
      if (this.itemTypeFilter !== 'ALL' && x.item_type !== this.itemTypeFilter) return false;
      if (!q) return true;
      return `${x.name} ${x.code || ''}`.toLowerCase().includes(q);
    }).length;
  }
  setItemConfigFilter(filter: 'CONFIGURED' | 'UNCONFIGURED') {
    this.itemConfigFilter = filter;
    this.clearSelection();
    this.refreshFilteredItems();
  }
  refreshFilteredItems() {
    const q = this.itemSearch.trim().toLowerCase();
    let source = this.catalogItems;
    if (this.itemConfigFilter === 'CONFIGURED') {
      // Ensure rule targets appear even when not in the current catalog page.
      const byKey = new Map(source.map(x => [this.keyOf(x), x]));
      for (const r of this.localRules) {
        const key = `${r.item_type}:${+r.item_id}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            item_type: r.item_type,
            item_id: +r.item_id,
            name: r.item_name || this.itemName(r.item_type, r.item_id),
            price: 0,
            running_cost: 0,
            code: ''
          });
        }
      }
      source = Array.from(byKey.values());
    }
    this.visibleItems = source.filter(x => {
      const configured = this.hasCommissionRule(x);
      if (this.itemConfigFilter === 'CONFIGURED' && !configured) return false;
      if (this.itemConfigFilter === 'UNCONFIGURED' && configured) return false;
      if (this.itemTypeFilter !== 'ALL' && x.item_type !== this.itemTypeFilter) return false;
      if (!q) return true;
      return `${x.name} ${x.code || ''}`.toLowerCase().includes(q);
    }).slice(0, 200).map(x => this.decorateItem(x));
  }
  trackByItem = (_: number, x: any) => `${x.item_type}:${x.item_id}`;
  allItems() { return this.catalogItems; }
  filteredItems() { return this.visibleItems; }
  keyOf(x: any) { return `${x.item_type}:${x.item_id}`; }
  isSelected(x: any) { return this.selectedKeys().has(this.keyOf(x)); }
  setSelection(next: Set<string>) {
    this.selectedKeys.set(next);
    this.selectedCount.set(next.size);
  }
  setItemSelected(x: any, on: boolean) {
    const next = new Set(this.selectedKeys());
    const key = this.keyOf(x);
    if (on) next.add(key);
    else next.delete(key);
    this.setSelection(next);
  }
  setAllFiltered(on: boolean) {
    if (on) this.selectAllFiltered();
    else this.clearSelection();
  }
  selectAllFiltered() {
    const next = new Set<string>();
    this.visibleItems.forEach(x => next.add(this.keyOf(x)));
    this.setSelection(next);
  }
  clearSelection() { this.setSelection(new Set()); }
  allFilteredSelected() {
    const rows = this.visibleItems;
    return !!rows.length && rows.every(x => this.isSelected(x));
  }
  toggleItemRow(x: any) {
    this.setItemSelected(x, !this.isSelected(x));
  }
  currentRules() { return this.localRules; }
  filteredRules() {
    const q = this.ruleSearch.trim().toLowerCase();
    const rows = this.currentRules();
    if (!q) return rows;
    return rows.filter((r: any) => `${r.item_name || ''} ${r.item_type || ''} ${this.ruleText(r)}`.toLowerCase().includes(q));
  }
  ruleRateLabel(r: any) {
    if (String(r.action).toUpperCase() === 'NO_COMMISSION') return 'None';
    const technique = String(r._technique || '');
    if (technique === 'CUSTOM_FORMULA' || r._formula) {
      const f = String(r._formula || '').trim();
      return f ? (f.length > 28 ? f.slice(0, 28) + '…' : f) : 'Formula';
    }
    if (!technique) {
      const c = this.selected();
      const p = (c?.commission_profiles || []).find((x: any) => String(x.id) === String(r.commission_profile_id || r.profile_temp_id));
      if (!p) return '—';
      if (p.technique === 'CUSTOM_FORMULA' || p.formula_expression) {
        const f = String(p.formula_expression || '').trim();
        return f ? (f.length > 28 ? f.slice(0, 28) + '…' : f) : 'Formula';
      }
      return this.isPercent(p.technique) ? `${+p.commission_value || 0}%`
        : (this.isBilledRateTechnique(p.technique) ? 'Full billed rate' : `₹${+p.commission_value || 0}`);
    }
    if (this.isBilledRateTechnique(technique)) return 'Full billed rate';
    return this.isPercent(technique) ? `${+r._rate || 0}%` : `₹${+r._rate || 0}`;
  }
  exceptionLabel(x: any) {
    const r = this.localRules.find((y: any) => y.item_type === x.item_type && +y.item_id === +x.item_id);
    if (r) return this.ruleText(r);
    if (this.groupItemKeys.has(`${x.item_type}:${x.item_id}`)) return 'Group plan';
    return '';
  }
  effectiveRateLabel(x: any) {
    const rule = this.effectiveRule(x);
    if (!rule) return '—';
    if (rule.none) return 'None';
    if (rule.technique === 'CUSTOM_FORMULA') {
      const f = String(rule.formula || '').trim();
      return f ? (f.length > 22 ? f.slice(0, 22) + '…' : f) : 'Formula';
    }
    if (this.isBilledRateTechnique(rule.technique)) return 'Full billed rate';
    return this.isPercent(rule.technique) ? `${rule.rate}%` : `₹${rule.rate}`;
  }
  /** Effective technique + value for this row (exception overrides default). */
  effectiveRule(x: any): { technique: string; rate: number; none: boolean; formula?: string } | null {
    const r = this.localRules.find((y: any) => y.item_type === x.item_type && +y.item_id === +x.item_id);
    if (r && String(r.action).toUpperCase() === 'NO_COMMISSION') return { technique: 'NONE', rate: 0, none: true };
    if (r) {
      if (r._technique) {
        const technique = String(r._technique);
        return { technique, rate: +r._rate || 0, none: technique === 'NONE', formula: r._formula || '' };
      }
      const c = this.selected();
      const pid = r.commission_profile_id || r.profile_temp_id;
      const p = (c?.commission_profiles || []).find((y: any) => String(y.id) === String(pid));
      if (p) {
        const technique = String(p.technique || 'PERCENT_NET');
        return { technique, rate: +p.commission_value || 0, none: technique === 'NONE', formula: p.formula_expression || '' };
      }
    }
    const technique = String(this.draft.technique || this.activeDefault()?.technique || 'PERCENT_NET');
    const rate = +this.draft.rate || +this.activeDefault()?.commission_value || 0;
    if (!this.activeDefault() && !this.draft.technique) return null;
    return { technique, rate, none: technique === 'NONE', formula: this.draft.formula || this.activeDefault()?.formula_expression || '' };
  }
  /** Estimate consultant vs lab share (qty 1, list price). Lab = price − cost − consultant. */
  shareEstimate(x: any): { consultant: number; lab: number } {
    const price = +x.price || 0;
    const cost = +x.running_cost || 0;
    const rule = this.effectiveRule(x);
    let consultant = 0;
    if (rule && !rule.none) {
      const t = String(rule.technique || '');
      if (t === 'CUSTOM_FORMULA') {
        // Preview only — engine evaluates on bill. Approximate with net * 0 if unknown.
        consultant = 0;
      } else if (t === 'PERCENT_PROFIT') consultant = Math.max(0, price - cost) * rule.rate / 100;
      else if (t === 'PERCENT_NET' || t === 'PERCENT_NET_NO_BILL' || t === 'PERCENT_GROSS' || t === 'PERCENT_BILL' || t === 'PERCENT_BILL_BEFORE') consultant = price * rule.rate / 100;
      else if (t === 'FIXED_AFTER_DISCOUNT' || t === 'FIXED_PER_ITEM' || t === 'FIXED_BEFORE_DISCOUNT') consultant = price;
      else if (t.startsWith('FIXED')) consultant = rule.rate;
      else consultant = this.isPercent(t) ? price * rule.rate / 100 : rule.rate;
    }
    consultant = Math.max(0, +consultant.toFixed(2));
    const lab = Math.max(0, +(price - cost - consultant).toFixed(2));
    return { consultant, lab };
  }
  estimatedGets(x: any) {
    return `₹${this.shareEstimate(x).consultant}`;
  }
  ruleText(r: any) {
    if (String(r.action).toUpperCase() === 'NO_COMMISSION') return 'No commission';
    if (r._technique === 'CUSTOM_FORMULA' || r._formula) {
      return `Custom formula · ${r._formula || ''}`.trim();
    }
    if (r._technique) {
      if (this.isBilledRateTechnique(r._technique)) return `${this.techniqueLabel(r._technique)} (full)`;
      const rate = this.isPercent(r._technique) ? `${+r._rate || 0}%` : `₹${+r._rate || 0}`;
      return `${this.techniqueLabel(r._technique)} ${rate}`;
    }
    const c = this.selected();
    const p = (c?.commission_profiles || []).find((x: any) => String(x.id) === String(r.commission_profile_id || r.profile_temp_id));
    if (p) return `${this.techniqueLabel(p.technique)} ${this.rateText(p)}`;
    return r.commission_profile_name || 'Special';
  }
  itemName(type: any, id: any) {
    const list = String(type).toUpperCase() === 'PROFILE' ? this.profiles : this.tests;
    const found = list.find((x: any) => +x.id === +id);
    return found ? (found.display_name || found.name) : `${type} #${id}`;
  }

  openPeriodModal(_kind: 'default') {
    this.periodDraft = { from: this.today(), to: this.draft.effective_to || '' };
    this.periodModal.set('default');
  }
  async confirmPeriodSave() {
    if (!this.periodDraft.from) return;
    this.draft.effective_from = this.periodDraft.from;
    this.draft.effective_to = this.periodDraft.to || '';
    this.periodModal.set(null);
    await this.saveDefault(true);
  }

  async saveDefault(forceNewVersion = false) {
    const c = this.selected();
    if (!c) return;
    if (!this.draft.effective_from) { this.message.set('Effective from date is required.'); return; }
    if (this.draft.technique === 'CUSTOM_FORMULA' && !String(this.draft.formula || '').trim()) {
      this.message.set('Custom formula is required.');
      return;
    }
    const current = this.activeDefault();
    const close_profile_id = (forceNewVersion || current) ? Number(current?.id || 0) : 0;
    try {
      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        close_profile_id,
        effective_from: this.draft.effective_from,
        new_profiles: [{
          temp_id: 'tmp_default_' + Date.now(),
          profile_name: 'Default',
          is_default: true,
          technique: this.draft.technique,
          commission_value: +this.draft.rate || 0,
          formula_expression: this.draft.technique === 'CUSTOM_FORMULA' ? String(this.draft.formula || '').trim() : '',
          effective_from: this.draft.effective_from,
          effective_to: this.draft.effective_to || null,
          active: true
        }],
        commission_rules: this.localRules.map((r: any) => ({
          item_type: r.item_type,
          item_id: r.item_id,
          action: r.action,
          commission_profile_id: r.commission_profile_id || r.profile_temp_id
        }))
      });
      this.message.set('Default commission saved.');
      await this.reload();
      this.changed.emit();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    }
  }

  async applyException() {
    const c = this.selected();
    if (!c || !this.selectedKeys().size) return;
    const keys = [...this.selectedKeys()];
    const alreadyExcepted = keys.filter(k => this.localRules.some((r: any) => `${r.item_type}:${r.item_id}` === k));
    if (alreadyExcepted.length) {
      this.message.set('Remove the existing assignment first (Assigned exceptions) before choosing a new profile for those items.');
      return;
    }
    const inGroup = keys.filter(k => this.groupItemKeys.has(k));
    if (inGroup.length) {
      this.message.set('Those items already belong to a commission group for this doctor. Remove them from that group before assigning a profile.');
      return;
    }

    const action = String(this.exc.action || 'USE_PROFILE').toUpperCase() === 'NO_COMMISSION' ? 'NO_COMMISSION' : 'USE_PROFILE';
    let profileId: number | null = null;
    let profileMeta: any = null;
    if (action === 'USE_PROFILE') {
      profileId = Number(this.exc.profile_id || 0);
      if (!profileId) {
        this.message.set('Select a saved profile (create one in step 1 if needed).');
        return;
      }
      profileMeta = this.assignableProfiles().find((p: any) => +p.id === profileId);
      if (!profileMeta) {
        this.message.set('Selected profile is not available. Save a default or special profile in step 1 first.');
        return;
      }
    }

    const nextRules = [...this.localRules];
    for (const key of keys) {
      const [item_type, item_id] = key.split(':');
      nextRules.push({
        item_type,
        item_id: +item_id,
        item_name: this.itemName(item_type, item_id),
        action,
        profile_temp_id: profileId ? String(profileId) : null,
        commission_profile_id: profileId,
        _technique: action === 'USE_PROFILE' ? (profileMeta?.technique || null) : 'NONE',
        _rate: action === 'USE_PROFILE' ? (+profileMeta?.commission_value || 0) : 0,
        _formula: action === 'USE_PROFILE' ? (profileMeta?.formula_expression || null) : null
      });
    }
    this.localRules = nextRules;
    try {
      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        commission_rules: this.localRules.map((r: any) => ({
          item_type: r.item_type,
          item_id: r.item_id,
          action: r.action,
          commission_profile_id: r.commission_profile_id || r.profile_temp_id
        }))
      });
      this.message.set(
        action === 'NO_COMMISSION'
          ? `Set no commission on ${keys.length} item(s).`
          : `Assigned “${profileMeta?.profile_name || 'profile'}” to ${keys.length} item(s).`
      );
      this.clearSelection();
      await this.reload();
      if (this.selectedId()) await this.loadItemRatesAndGroups(+this.selectedId()!);
      this.changed.emit();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    }
  }

  async saveSpecialProfile() {
    const c = this.selected();
    if (!c) return;
    const name = String(this.specialDraft.name || '').trim();
    if (!name) { this.message.set('Special profile name is required.'); return; }
    if (!this.specialDraft.effective_from) { this.message.set('Effective from date is required.'); return; }
    if (this.specialDraft.technique === 'CUSTOM_FORMULA' && !String(this.specialDraft.formula || '').trim()) {
      this.message.set('Custom formula is required.');
      return;
    }
    if (this.specialDraft.technique === 'NONE') {
      this.message.set('Use “No commission” when assigning items instead of a NONE profile.');
      return;
    }
    this.savingSpecial.set(true);
    this.message.set('');
    try {
      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        new_profiles: [{
          temp_id: 'tmp_special_' + Date.now(),
          profile_name: name,
          is_default: false,
          technique: this.specialDraft.technique,
          commission_value: this.isBilledRateTechnique(this.specialDraft.technique) ? 0 : (+this.specialDraft.rate || 0),
          formula_expression: this.specialDraft.technique === 'CUSTOM_FORMULA' ? String(this.specialDraft.formula || '').trim() : '',
          effective_from: this.specialDraft.effective_from,
          effective_to: null,
          active: true
        }]
      });
      this.message.set(`Special profile “${name}” saved. Assign it to items in step 3.`);
      this.showSpecialForm = false;
      this.specialDraft = this.emptySpecialDraft();
      await this.reload();
      this.changed.emit();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    } finally {
      this.savingSpecial.set(false);
    }
  }

  async removeRule(rule: any) {
    const c = this.selected();
    if (!c || !rule) return;
    this.localRules = this.localRules.filter((r: any) => !(r.item_type === rule.item_type && +r.item_id === +rule.item_id));
    try {
      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        commission_rules: this.localRules.map((r: any) => ({
          item_type: r.item_type,
          item_id: r.item_id,
          action: r.action,
          commission_profile_id: r.commission_profile_id || r.profile_temp_id
        }))
      });
      this.message.set('Exception removed.');
      await this.reload();
      this.changed.emit();
    } catch (e: any) {
      this.message.set(e?.message || String(e));
    }
  }

  async confirmResetExceptions() {
    const c = this.selected();
    const count = this.localRules.length;
    if (!c || !count) return;
    const ok = window.confirm(
      `Remove all ${count} applied exception(s) for ${c.name}?\n\n` +
      `This only clears configuration. Already generated commission statements stay as-is — you can open them from Commission Statement without resetting. Use Reset & regenerate there only if you need to recalculate unsettled lines.`
    );
    if (!ok) return;
    this.resettingExceptions.set(true);
    this.message.set('');
    const previous = this.localRules.slice();
    this.localRules = [];
    try {
      await window.limsApi.saveConsultantCommissionConfig?.({
        consultant_id: c.id,
        commission_rules: []
      });
      this.message.set(`Cleared ${count} exception(s). Existing generated statements were not changed.`);
      this.clearSelection();
      await this.reload();
      if (this.selectedId()) await this.loadItemRatesAndGroups(+this.selectedId()!);
      this.changed.emit();
    } catch (e: any) {
      this.localRules = previous;
      this.message.set(e?.message || String(e));
    } finally {
      this.resettingExceptions.set(false);
    }
  }
}
