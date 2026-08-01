import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';

@Component({
  selector: 'app-settings-backup-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule],
  template: `
    <section class="settings-grid page-section settings-page">
      <mat-card>
        <div class="panel-title"><h3>Organisation & Report</h3><span class="status-pill">Report identity</span></div>
        <div class="form-grid">
          <input [(ngModel)]="settingsForm['org.name']" placeholder="Organisation name">
          <input [(ngModel)]="settingsForm['org.address']" placeholder="Address">
          <input [(ngModel)]="settingsForm['org.phone']" placeholder="Phone">
          <input [(ngModel)]="settingsForm['org.email']" placeholder="Email">
          <textarea [(ngModel)]="settingsForm['report.footer']" placeholder="Report footer"></textarea>
          <select [(ngModel)]="settingsForm['report.background']"><option value="on">Report background ON</option><option value="off">Report background OFF</option></select>
          <select [(ngModel)]="settingsForm['quickReporting.enabled']"><option value="false">Quick Reporting OFF</option><option value="true">Quick Reporting ON</option></select>
          <div class="path-row"><input [(ngModel)]="settingsForm['report.export.path']" placeholder="Report PDF export folder"><button class="btn secondary tiny" type="button" (click)="chooseReportExportFolder()">Browse</button></div>
        </div>
        <button class="btn primary" (click)="saveSettings()">Save Settings</button>
      </mat-card>
      <mat-card>
        <div class="panel-title"><h3>Date & Time Display</h3><span class="status-pill">India time</span></div>
        <p class="settings-subtitle">This overrides date/time display across Billing, Collection, Reporting, logs and printable views.</p>
        <div class="form-grid">
          <select [(ngModel)]="settingsForm['display.timeZone']">
            <option value="Asia/Kolkata">Indian Standard Time (Asia/Kolkata)</option>
          </select>
          <select [(ngModel)]="settingsForm['display.dateFormat']">
            <option value="dd-MM-yyyy">DD-MM-YYYY</option>
            <option value="dd/MM/yyyy">DD/MM/YYYY</option>
            <option value="yyyy-MM-dd">YYYY-MM-DD</option>
            <option value="dd MMM yyyy">12 Jun 2026</option>
            <option value="MMM dd, yyyy">Jun 12, 2026</option>
          </select>
          <select [(ngModel)]="settingsForm['display.timeFormat']">
            <option value="24h">24-hour time</option>
            <option value="12h">12-hour time</option>
          </select>
          <div class="time-preview"><b>Preview</b><span>{{dateTimePreview()}}</span></div>
        </div>
        <div class="config-block">
          <div class="config-head"><b>App-wide working date/time</b><span class="muted">Used for new bills, collections, reports and receipts after saving</span></div>
          <div class="form-grid">
            <select [(ngModel)]="settingsForm['app.time.override.enabled']">
              <option value="false">Use system date/time</option>
              <option value="true">Use manual date/time</option>
            </select>
            <input type="datetime-local" [(ngModel)]="settingsForm['app.time.override.value']">
          </div>
          <p class="settings-subtitle">This does not change Windows time. It only controls the LIMS timestamps created after this is enabled.</p>
        </div>
        <button class="btn primary" (click)="saveSettings()">Save Date & Time</button>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Patient Registry Configuration</h3><span class="status-pill">CRUD friendly</span></div>
        <div class="settings-subtitle">Honorifics and relation labels are configurable. These values appear in Billing patient registration.</div>
        <div class="config-block">
          <div class="config-head"><b>Honorifics</b><button class="btn secondary tiny" type="button" (click)="addListItem('patient.honorifics', 'Add honorific')">＋ Add</button></div>
          <div class="tag-editor">
            <span class="config-chip" *ngFor="let item of listItems('patient.honorifics')">
              {{item}} <button type="button" (click)="removeListItem('patient.honorifics', item)">×</button>
            </span>
          </div>
          <input class="wide-input" [(ngModel)]="settingsForm['patient.honorifics']" placeholder="Comma separated honorifics">
        </div>
        <div class="config-block">
          <div class="config-head"><b>Relation / Guardian Labels</b><button class="btn secondary tiny" type="button" (click)="addListItem('patient.relationTypes', 'Add relation label')">＋ Add</button></div>
          <div class="tag-editor">
            <span class="config-chip" *ngFor="let item of listItems('patient.relationTypes')">
              {{item}} <button type="button" (click)="removeListItem('patient.relationTypes', item)">×</button>
            </span>
          </div>
          <input class="wide-input" [(ngModel)]="settingsForm['patient.relationTypes']" placeholder="Comma separated relations">
        </div>
        <div class="config-block">
          <div class="config-head"><b>Billing Registration Defaults</b><span class="muted">Used in Billing registration Step 1</span></div>
          <div class="form-grid">
            <select [(ngModel)]="settingsForm['billing.defaultRegistrationType']">
              <option value="">No default registration type</option>
              <option *ngFor="let t of registrationTypes()" [value]="t">{{t}}</option>
            </select>
            <select [(ngModel)]="settingsForm['billing.defaultReferenceId']" [disabled]="defaultRegistrationIsWalkIn()">
              <option value="">No default reference</option>
              <option *ngFor="let c of consultants()" [value]="c.id">{{referenceLabel(c)}}</option>
            </select>
          </div>
          <p class="settings-subtitle" *ngIf="defaultRegistrationIsWalkIn()">Walk-in uses Self automatically, so reference is ignored.</p>
        </div>
        <div class="config-block">
          <div class="config-head"><b>Required Patient Fields</b><span class="muted">Controls Billing patient registration validation</span></div>
          <div class="check-grid">
            <label *ngFor="let f of patientFieldOptions"><input type="checkbox" [checked]="isRequired('patient.requiredFields', f.key)" (change)="toggleRequired('patient.requiredFields', f.key, $event)"> {{f.label}}</label>
          </div>
        </div>
        <button class="btn primary" (click)="saveSettings()">Save Patient Config</button>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Billing Validation</h3><span class="status-pill">Required fields</span></div>
        <div class="check-grid">
          <label *ngFor="let f of billingFieldOptions"><input type="checkbox" [checked]="isRequired('billing.requiredFields', f.key)" (change)="toggleRequired('billing.requiredFields', f.key, $event)"> {{f.label}}</label>
        </div>
        <button class="btn primary" (click)="saveSettings()">Save Billing Config</button>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Developer / Testing tools</h3><span class="status-pill danger">Testing only</span></div>
        <p class="settings-subtitle">Use this only while checking Billing → Collection → Reporting flow. Master configuration is kept.</p>
        <div class="danger-tool">
          <div><b>Reset transaction data</b><span>Clears bills, collections, reporting transactions, logs, delivery status, outsource workflow, recheck and recollection cycles.</span></div>
          <button class="btn danger" type="button" (click)="openResetConfirm()">Reset test data</button>
        </div>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Numbering & Backups</h3><span class="status-pill">Offline safety</span></div>
        <div class="form-grid">
          <input [(ngModel)]="settingsForm['patient.prefix']" placeholder="Patient prefix">
          <input [(ngModel)]="settingsForm['patient.suffix']" placeholder="Patient suffix">
          <input [(ngModel)]="settingsForm['patient.padding']" placeholder="Patient padding">
          <input [(ngModel)]="settingsForm['invoice.prefix']" placeholder="Invoice prefix">
          <input [(ngModel)]="settingsForm['invoice.suffix']" placeholder="Invoice suffix">
          <input [(ngModel)]="settingsForm['invoice.padding']" placeholder="Invoice padding">
          <input [(ngModel)]="settingsForm['receipt.prefix']" placeholder="Receipt prefix">
          <input [(ngModel)]="settingsForm['receipt.suffix']" placeholder="Receipt suffix">
          <input [(ngModel)]="settingsForm['receipt.padding']" placeholder="Receipt padding">
          <input [(ngModel)]="settingsForm['backup.path']" placeholder="Backup path">
          <input [(ngModel)]="settingsForm['backup.intervalMinutes']" placeholder="Auto backup minutes">
          <select [(ngModel)]="settingsForm['backup.enabled']"><option value="true">Auto backup ON</option><option value="false">Auto backup OFF</option></select>
          <div class="path-row"><input [ngModel]="dataDir()" readonly placeholder="Current database folder"><button class="btn secondary tiny" type="button" (click)="chooseDatabaseFolder()">Change DB folder</button></div>
        </div>
        <p class="settings-subtitle" *ngIf="dbMoveMessage">{{dbMoveMessage}}</p>
        <div class="actions"><button class="btn primary" (click)="saveSettings()">Save</button><button class="btn secondary" (click)="createBackup()" [disabled]="backupBusy()">Manual Backup</button></div>
        <div class="backup-storage-grid">
          <div class="backup-path-card"><span>Database folder</span><b [title]="dataDir()">{{dataDir()}}</b></div>
          <div class="backup-path-card"><span>Reports folder</span><b [title]="reportsDir()">{{reportsDir()}}</b></div>
        </div>
        <p class="backup-message" *ngIf="backupMessage">{{backupMessage}}</p>
        <div class="backup-log-summary">
          <div class="backup-summary-icon" aria-hidden="true">↻</div>
          <div class="backup-summary-copy">
            <span>Latest backup</span>
            <b *ngIf="lastBackup() as latest; else noBackup">{{formatBackupDate(latest.modifiedAt)}}</b>
            <ng-template #noBackup><b>No backup available</b></ng-template>
            <small *ngIf="lastBackup() as latest">{{shortBackupName(latest.name)}} · {{formatBytes(latest.size)}}</small>
            <small *ngIf="!lastBackup()">Create a manual backup to begin.</small>
          </div>
          <div class="backup-summary-actions">
            <button class="btn primary" type="button" (click)="createBackup()" [disabled]="backupBusy()">{{backupBusy() ? 'Creating…' : 'Backup now'}}</button>
            <button class="btn secondary" type="button" (click)="openBackupLogs()">View backup logs</button>
          </div>
        </div>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Analyzer API Integration</h3><span class="status-pill">GET / POST</span></div>
        <p class="settings-subtitle">Configure the local HTTP API used by equipment/middleware for sample ID order requests and result posting. Restart happens automatically after Save.</p>
        <div class="form-grid">
          <select [(ngModel)]="settingsForm['analyzer.api.enabled']"><option value="true">Analyzer API ON</option><option value="false">Analyzer API OFF</option></select>
          <input [(ngModel)]="settingsForm['analyzer.api.host']" placeholder="Host e.g. 127.0.0.1 or 0.0.0.0">
          <input [(ngModel)]="settingsForm['analyzer.api.port']" placeholder="Port e.g. 5055">
          <input [(ngModel)]="settingsForm['analyzer.api.basePath']" placeholder="Base path e.g. /api/analyzer">
          <input class="wide-input" [(ngModel)]="settingsForm['analyzer.api.publicUrl']" placeholder="Public/base URL shown to middleware">
          <div class="path-row"><input [(ngModel)]="settingsForm['analyzer.api.logPath']" placeholder="Daily analyzer API log folder"><button class="btn secondary tiny" type="button" (click)="chooseAnalyzerLogFolder()">Browse</button></div>
        </div>
        <div class="api-help-box">
          <b>Order GET</b><code>{{apiPreviewUrl()}}/orders/2607040001?equipmentId=1</code>
          <b>Result POST</b><code>{{apiPreviewUrl()}}/results</code>
          <span>Daily logs: one GET/POST log file per equipment per date inside the configured folder.</span>
        </div>
        <div class="actions"><button class="btn primary" (click)="saveSettings()">Save & Restart API</button></div>
      </mat-card>


      <div id="backup-log-layer" class="settings-modal-backdrop backup-log-layer" *ngIf="backupLogsOpen()" (click)="closeBackupLogs()">
        <section class="settings-modal-card backup-log-modal" role="dialog" aria-modal="true" aria-labelledby="backup-log-title" (click)="$event.stopPropagation()">
          <header class="backup-modal-header">
            <div class="backup-modal-heading">
              <div class="backup-modal-icon" aria-hidden="true">☁</div>
              <div><h3 id="backup-log-title">Backup Logs</h3><p>Validate or restore a saved database backup.</p></div>
            </div>
            <button class="backup-modal-close" type="button" aria-label="Close backup logs" (click)="closeBackupLogs()">×</button>
          </header>

          <div class="backup-filter-bar">
            <label><span>From</span><input type="date" [(ngModel)]="backupFrom" (ngModelChange)="resetBackupPage()"></label>
            <label><span>To</span><input type="date" [(ngModel)]="backupTo" (ngModelChange)="resetBackupPage()"></label>
            <div class="backup-quick-filters">
              <button class="btn secondary tiny" type="button" (click)="setBackupRange(0)">Today</button>
              <button class="btn secondary tiny" type="button" (click)="setBackupRange(7)">7 days</button>
              <button class="btn secondary tiny" type="button" (click)="setBackupRange(30)">30 days</button>
              <button class="btn secondary tiny" type="button" (click)="clearBackupRange()">All</button>
            </div>
            <div class="backup-filter-actions">
              <button class="btn primary tiny" type="button" (click)="createBackup()" [disabled]="backupBusy()">{{backupBusy() ? 'Creating…' : 'Backup now'}}</button>
              <button class="btn secondary tiny backup-refresh" type="button" (click)="refreshBackups()" [disabled]="backupBusy()">↻ Refresh</button>
            </div>
          </div>

          <div class="backup-log-body">
            <div class="backup-log-head"><span>Backup</span><span>Created</span><span>Size</span><span>Validation</span><span>Safety actions</span></div>
            <article class="backup-log-row" *ngFor="let b of pagedBackups()">
              <div class="backup-file-cell"><b [title]="b.name">{{shortBackupName(b.name)}}</b><small [title]="b.name">{{b.name}}</small></div>
              <div class="backup-date-cell"><b>{{formatBackupDate(b.modifiedAt)}}</b><small>{{formatBackupTime(b.modifiedAt)}}</small></div>
              <div class="backup-size-cell">{{formatBytes(b.size)}}</div>
              <div class="backup-validation-cell" [ngSwitch]="backupValidationState(b).state">
                <span class="backup-validation-badge checking" *ngSwitchCase="'checking'">Checking…</span>
                <span class="backup-validation-badge valid" *ngSwitchCase="'valid'">✓ Valid</span>
                <span class="backup-validation-badge invalid" *ngSwitchCase="'invalid'">✕ Invalid</span>
                <span class="backup-validation-badge unchecked" *ngSwitchDefault>Not checked</span>
                <small *ngIf="backupValidationState(b).message as validationMessage" [title]="validationMessage">{{validationMessage}}</small>
              </div>
              <div class="backup-actions"><button class="btn secondary tiny" type="button" (click)="validateBackup(b)" [disabled]="backupBusy() || backupValidationState(b).state === 'checking'">{{backupValidationState(b).state === 'valid' || backupValidationState(b).state === 'invalid' ? 'Validate again' : 'Validate'}}</button><button class="btn danger tiny" type="button" (click)="prepareRestore(b)" [disabled]="backupBusy() || backupValidationState(b).state === 'checking' || backupValidationState(b).state === 'invalid'">Restore</button></div>
            </article>
            <div class="backup-empty" *ngIf="!filteredBackups().length">No backups found for the selected date range.</div>
          </div>

          <footer class="backup-modal-footer">
            <div class="backup-page-summary">Showing {{backupRangeStart()}}–{{backupRangeEnd()}} of {{filteredBackups().length}}</div>
            <div class="backup-pagination">
              <button class="btn secondary tiny" type="button" (click)="previousBackupPage()" [disabled]="backupPage() <= 1">Previous</button>
              <span>Page {{backupPage()}} of {{backupPageCount()}}</span>
              <button class="btn secondary tiny" type="button" (click)="nextBackupPage()" [disabled]="backupPage() >= backupPageCount()">Next</button>
            </div>
          </footer>
        </section>
      </div>

      <div class="settings-modal-backdrop" *ngIf="resetConfirmOpen()" (click)="resetConfirmOpen.set(false)">
        <div class="settings-modal-card danger" (click)="$event.stopPropagation()">
          <div class="panel-title"><h3>Clear test transaction data?</h3><span class="status-pill danger">Danger</span></div>
          <p>Billing, Collection and Reporting transaction data will be cleared for testing.</p>
          <p class="settings-subtitle">Master configuration, tests, profiles, patients, vendors and settings will not be deleted.</p>
          <div class="actions"><button class="btn secondary" type="button" (click)="resetConfirmOpen.set(false)">Cancel</button><button class="btn danger" type="button" (click)="resetWorkflowData()">Clear test data</button></div>
        </div>
      </div>

      <div id="backup-restore-layer" class="settings-modal-backdrop backup-restore-layer" *ngIf="restoreCandidate() as candidate" (click)="restoreCandidate.set(null)">
        <div class="settings-modal-card danger" (click)="$event.stopPropagation()">
          <div class="panel-title"><h3>Restore validated backup?</h3><span class="status-pill danger">Replaces live data</span></div>
          <p><b>{{candidate.name}}</b> passed SQLite integrity and LIMS schema checks.</p>
          <div class="restore-summary"><span>Tests <b>{{candidate.counts?.tests || 0}}</b></span><span>Patients <b>{{candidate.counts?.patients || 0}}</b></span><span>Bills <b>{{candidate.counts?.bills || 0}}</b></span><span>Reports <b>{{candidate.counts?.reports || 0}}</b></span></div>
          <p class="settings-subtitle">Before replacement, the current database will be saved automatically as a pre-restore safety backup. The restored schema will then be upgraded if needed.</p>
          <div class="actions"><button class="btn secondary" type="button" (click)="restoreCandidate.set(null)" [disabled]="backupBusy()">Cancel</button><button class="btn danger" type="button" (click)="confirmRestore()" [disabled]="backupBusy()">{{backupBusy() ? 'Restoring…' : 'Restore backup'}}</button></div>
        </div>
      </div>
    </section>
  `,
  styles: [`
    .path-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.path-row input{min-width:0}.settings-wide{grid-column:1/-1;min-height:720px;display:block}.report-settings-host mat-card{box-shadow:0 20px 55px rgba(0,0,0,.16)!important}.time-preview{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:rgba(15,23,42,.18);display:flex;flex-direction:column;gap:4px}.time-preview span{color:var(--muted);font-weight:800}.settings-subtitle,.muted{color:var(--muted);font-size:12px;font-weight:700}.config-block{border:1px solid var(--border);border-radius:18px;padding:14px;margin:14px 0;background:rgba(15,23,42,.25)}.config-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.tag-editor{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.config-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;background:rgba(59,130,246,.08)}.config-chip button{border:0;background:transparent;color:inherit;font-size:16px;cursor:pointer}.check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.check-grid label{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:14px;padding:10px 12px;font-size:13px;font-weight:800;background:rgba(15,23,42,.18)}.wide-input{width:100%}.tiny{padding:7px 10px;font-size:12px}.status-pill.danger{background:rgba(220,38,38,.14);color:#ef4444}.danger-tool{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(220,38,38,.28);border-radius:18px;padding:14px;background:rgba(220,38,38,.08);margin-top:14px}.danger-tool b,.danger-tool span{display:block}.danger-tool span{color:var(--muted);font-size:12px;margin-top:4px}.settings-modal-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(2,6,23,.72);display:grid;place-items:center;backdrop-filter:blur(8px)}.settings-modal-card{width:min(620px,calc(100vw - 40px));border:1px solid var(--border);border-radius:24px;background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.45);padding:20px}.settings-modal-card.danger{border-color:rgba(220,38,38,.36)}.api-help-box{display:grid;gap:6px;border:1px solid var(--border);border-radius:16px;background:rgba(15,23,42,.18);padding:10px 12px;margin-top:10px}.api-help-box b{font-size:11px;text-transform:uppercase;color:var(--muted)}.api-help-box code{display:block;white-space:normal;word-break:break-all;border:1px solid var(--border);border-radius:10px;background:var(--input);padding:7px 9px;font-size:12px}.api-help-box span{color:var(--muted);font-size:12px;font-weight:700}.backup-actions{display:flex;gap:6px;flex-wrap:wrap}.backup-message{border:1px solid var(--border);border-radius:12px;padding:9px 11px;background:rgba(59,130,246,.08);font-weight:750}.restore-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.restore-summary span{border:1px solid var(--border);border-radius:12px;padding:9px;text-align:center;color:var(--muted);font-size:11px}.restore-summary b{display:block;color:var(--text);font-size:16px;margin-top:3px}.backup-storage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.backup-path-card{min-width:0;border:1px solid var(--border);border-radius:14px;background:var(--row);padding:11px 12px}.backup-path-card span,.backup-path-card b{display:block}.backup-path-card span{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.backup-path-card b{margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.backup-log-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:13px;border:1px solid var(--border);border-radius:17px;background:color-mix(in srgb,var(--panel) 94%,var(--accent));padding:13px;margin-top:14px}.backup-summary-icon,.backup-modal-icon{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);font-weight:950}.backup-summary-icon{width:40px;height:40px;border-radius:13px;font-size:20px}.backup-summary-copy{min-width:0}.backup-summary-copy span,.backup-summary-copy b,.backup-summary-copy small{display:block}.backup-summary-copy span{color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.05em}.backup-summary-copy b{margin-top:3px;font-size:13px}.backup-summary-copy small{margin-top:3px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-summary-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.backup-log-layer{z-index:8000;padding:88px 24px 24px;box-sizing:border-box}.backup-restore-layer{z-index:8100}.backup-log-modal{width:min(1180px,calc(100vw - 48px));height:min(760px,calc(100vh - 112px));max-height:calc(100vh - 112px);padding:0;overflow:hidden;display:flex;flex-direction:column}.backup-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 97%,var(--row))}.backup-modal-heading{display:flex;align-items:center;gap:12px;min-width:0}.backup-modal-heading h3{margin:0;font-size:19px}.backup-modal-heading p{margin:4px 0 0;color:var(--muted);font-size:12px}.backup-modal-icon{width:42px;height:42px;border-radius:14px;font-size:19px}.backup-modal-close{width:40px;height:40px;border:1px solid var(--border);border-radius:13px;background:var(--row);color:var(--text);font-size:24px;line-height:1;cursor:pointer}.backup-modal-close:hover{border-color:rgba(239,68,68,.48);background:rgba(239,68,68,.12);color:#f87171}.backup-filter-bar{display:grid;grid-template-columns:170px 170px minmax(0,1fr) auto;align-items:end;gap:10px;padding:14px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.backup-filter-bar label span{display:block;margin-bottom:6px;color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase}.backup-filter-bar input{width:100%}.backup-quick-filters{display:flex;gap:7px;flex-wrap:wrap}.backup-filter-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.backup-refresh{white-space:nowrap}.backup-log-body{flex:1;min-height:0;overflow:auto;padding:0 20px}.backup-log-head,.backup-log-row{display:grid;grid-template-columns:minmax(220px,1.35fr) minmax(135px,.68fr) 82px minmax(150px,.72fr) minmax(170px,.72fr);gap:14px;align-items:center}.backup-log-head{position:sticky;top:0;z-index:2;padding:12px 14px;background:var(--panel);border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.backup-log-row{padding:14px;border-bottom:1px solid var(--border)}.backup-file-cell,.backup-date-cell{min-width:0}.backup-file-cell b,.backup-file-cell small,.backup-date-cell b,.backup-date-cell small{display:block}.backup-file-cell b{font-size:13px}.backup-file-cell small{margin-top:4px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-date-cell b{font-size:12px}.backup-date-cell small{margin-top:3px;color:var(--muted);font-size:10px}.backup-size-cell{font-weight:850}.backup-validation-cell{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:5px}.backup-validation-cell small{max-width:100%;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-validation-badge{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border:1px solid var(--border);border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap}.backup-validation-badge.unchecked{color:var(--muted);background:var(--row)}.backup-validation-badge.checking{color:#60a5fa;border-color:rgba(59,130,246,.38);background:rgba(59,130,246,.12)}.backup-validation-badge.valid{color:#4ade80;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.12)}.backup-validation-badge.invalid{color:#f87171;border-color:rgba(239,68,68,.42);background:rgba(239,68,68,.12)}.backup-actions{justify-content:flex-end}.backup-empty{display:grid;place-items:center;min-height:220px;color:var(--muted);font-weight:800}.backup-modal-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 20px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 97%,var(--row))}.backup-page-summary{color:var(--muted);font-size:11px;font-weight:800}.backup-pagination{display:flex;align-items:center;gap:10px}.backup-pagination span{min-width:92px;text-align:center;font-size:11px;font-weight:900}@media(max-width:800px){.backup-storage-grid{grid-template-columns:1fr}.backup-log-summary{grid-template-columns:auto 1fr}.backup-summary-actions{grid-column:1/-1;justify-content:stretch}.backup-summary-actions .btn{flex:1}.backup-filter-bar{grid-template-columns:1fr 1fr}.backup-quick-filters{grid-column:1/-1}.backup-filter-actions{grid-column:1/-1;justify-content:flex-end}.backup-refresh{position:static}.backup-log-head{display:none}.backup-log-body{padding:12px}.backup-log-row{grid-template-columns:1fr auto;gap:10px;border:1px solid var(--border);border-radius:15px;margin-bottom:10px}.backup-date-cell{grid-column:1}.backup-size-cell{grid-column:2;grid-row:1}.backup-validation-cell{grid-column:1/-1}.backup-actions{grid-column:1/-1;justify-content:flex-start}.backup-modal-footer{align-items:stretch;flex-direction:column}.backup-pagination{justify-content:space-between}}
  `]
})
export class SettingsBackupPageComponent implements OnInit {
  @Output() changed = new EventEmitter<Record<string, string>>();
  settingsForm: Record<string, any> = {};
  backups = signal<any[]>([]); backupValidation = signal<Record<string, { state: 'unchecked' | 'checking' | 'valid' | 'invalid'; message: string }>>({}); dataDir = signal(''); reportsDir = signal(''); resetConfirmOpen = signal(false); restoreCandidate = signal<any | null>(null); backupBusy = signal(false); backupLogsOpen = signal(false); backupPage = signal(1); consultants = signal<any[]>([]); dbMoveMessage = ''; backupMessage = ''; backupFrom = ''; backupTo = ''; readonly backupPageSize = 10;
  patientFieldOptions = [
    { key: 'title', label: 'Honorific' }, { key: 'name', label: 'Patient name' }, { key: 'dob', label: 'Date of birth' },
    { key: 'age', label: 'Age' }, { key: 'gender', label: 'Gender' }, { key: 'mobile', label: 'Mobile' },
    { key: 'email', label: 'Email' }, { key: 'relation', label: 'Relation / guardian type' }, { key: 'guardian', label: 'Parent / guardian name' },
    { key: 'address', label: 'Address' }, { key: 'history', label: 'Clinical notes' }
  ];
  billingFieldOptions = [
    { key: 'consultant', label: 'Consultant' }, { key: 'items', label: 'At least one test/profile' },
    { key: 'payment_mode', label: 'Payment mode' }, { key: 'notes', label: 'Bill notes' }
  ];
  async ngOnInit(){ await this.reload(); }
  applyReportDefaults(settings: Record<string, any>) {
    const defaults: Record<string, any> = {
      'report.simple.pageSize': 'A4',
      'report.simple.orientation': 'portrait',
      'report.simple.marginTopMm': '52',
      'report.simple.marginRightMm': '7',
      'report.simple.marginBottomMm': '21',
      'report.simple.marginLeftMm': '14',
      'report.simple.backgroundEnabled': 'false',
      'report.simple.backgroundImageOpacity': '1',
      'report.simple.addressPlacement': 'header',
      'report.simple.headerLogoEnabled': 'false',
      'report.simple.headerLogoWidthMm': '32',
      'report.simple.headerLogoHeightMm': '18',
      'report.simple.headerLogoPlacement': 'left',
      'report.simple.headerShowBottomRule': 'true',
      'report.simple.patientDetailsEnabled': 'true',
      'report.simple.patientDetailsPlacement': 'header',
      'report.simple.patientDetailsFields': 'patient_name,patient_no,age_gender,mobile,consultant,collected,reported',
      'report.simple.patientDetailsColumns': '2',
      'report.simple.patientDetailsShowLabels': 'true',
      'report.simple.patientDetailsBorderEnabled': 'false',
      'report.simple.reportTitleEnabled': 'true',
      'report.simple.reportTitleText': 'LABORATORY REPORT',
      'report.simple.showSpecimenInTestName': 'true',
      'report.simple.showSampleIdInTestName': 'false',
      'report.simple.showMethodInReference': 'true',
      'report.simple.tableHeaderBgColor': '#F7FAFF',
      'report.simple.groupHeaderBgColor': '#E6EEF9',
      'report.simple.highColor': '#cc0000',
      'report.simple.lowColor': '#0000cc',
      'report.simple.tablePaddingTop': '4',
      'report.simple.tablePaddingBottom': '4',
      'report.simple.pageNumbersEnabled': 'true',
      'report.simple.endReportEnabled': 'true',
      'report.simple.endReportText': '-------------------------- END OF REPORT --------------------------',
      'report.simple.labSignEnabled': 'true',
      'report.simple.labSignLabel': 'Lab Technician Signature',
      'report.simple.labSignImageEnabled': 'false',
      'report.simple.labSignImageWidthMm': '35',
      'report.simple.labSignImageHeightMm': '12'
    };
    return { ...defaults, ...settings };
  }
  async reload(){ const api=window.limsApi; this.settingsForm=this.applyReportDefaults(DateTimeSettingsService.applyDefaults({...(await api.getSettings())})); DateTimeSettingsService.sync(this.settingsForm); this.backups.set(await api.listBackups()); this.dataDir.set(await api.getDataDir()); this.reportsDir.set(await api.getReportsDir()); this.consultants.set((await api.listConsultants()).filter((c:any)=>+c.active !== 0)); }
  lastBackup(){ const rows = this.backups() || []; return rows.length ? rows[0] : null; }
  dateTimePreview(){ DateTimeSettingsService.sync(this.settingsForm); return DateTimeSettingsService.dateTime(new Date()); }
  listItems(key: string) { return String(this.settingsForm[key] || '').split(',').map(x => x.trim()).filter(Boolean); }
  setListItems(key: string, items: string[]) { this.settingsForm[key] = Array.from(new Set(items.map(x => x.trim()).filter(Boolean))).join(','); }
  addListItem(key: string, title: string) { const value = window.prompt(title); if (!value?.trim()) return; this.setListItems(key, [...this.listItems(key), value.trim()]); }
  removeListItem(key: string, item: string) { this.setListItems(key, this.listItems(key).filter(x => x !== item)); }
  requiredItems(key: string) { return String(this.settingsForm[key] || '').split(',').map(x => x.trim()).filter(Boolean); }
  isRequired(key: string, field: string) { return this.requiredItems(key).includes(field); }
  toggleRequired(key: string, field: string, event: Event) { const checked = (event.target as HTMLInputElement).checked; const items = this.requiredItems(key).filter(x => x !== field); if (checked) items.push(field); this.settingsForm[key] = items.join(','); }
  registrationTypes() { return this.listItems('billing.registrationTypes').length ? this.listItems('billing.registrationTypes') : ['Walk-in', 'Referral']; }
  defaultRegistrationIsWalkIn() { return String(this.settingsForm['billing.defaultRegistrationType'] || '').trim().toLowerCase() === 'walk-in'; }
  referenceLabel(c:any) { return [c?.name || '', c?.clinic || ''].filter(Boolean).join(' - '); }
  async chooseReportExportFolder(){ const chosen = await window.limsApi.chooseDirectory?.('Choose report PDF export folder'); if (chosen?.path) this.settingsForm['report.export.path'] = chosen.path; }
  async chooseDatabaseFolder(){ const chosen = await window.limsApi.chooseDirectory?.('Choose database folder'); if (!chosen?.path) return; const result = await window.limsApi.setDataDir?.(chosen.path); if (result?.dataDir) { this.dataDir.set(result.dataDir); this.dbMoveMessage = 'Database folder changed. Restart the app to use the new location.'; } }
  async chooseAnalyzerLogFolder(){ const chosen = await window.limsApi.chooseDirectory?.('Choose analyzer API log folder'); if (chosen?.path) this.settingsForm['analyzer.api.logPath'] = chosen.path; }
  apiPreviewUrl(){ const host = String(this.settingsForm['analyzer.api.host'] || '127.0.0.1').trim() || '127.0.0.1'; const port = String(this.settingsForm['analyzer.api.port'] || '5055').trim() || '5055'; let base = String(this.settingsForm['analyzer.api.basePath'] || '/api/analyzer').trim() || '/api/analyzer'; if (!base.startsWith('/')) base = '/' + base; base = base.replace(/\/+$/, ''); return String(this.settingsForm['analyzer.api.publicUrl'] || '').trim() || `http://${host}:${port}${base}`; }
  async saveSettings(){ const saved = await window.limsApi.saveSettings(this.settingsForm); this.settingsForm=this.applyReportDefaults(DateTimeSettingsService.applyDefaults({...saved})); DateTimeSettingsService.sync(this.settingsForm); this.changed.emit(this.settingsForm); await this.reload(); }
  openBackupLogs(){ this.backupPage.set(1); this.backupLogsOpen.set(true); this.portalLayerToBody('backup-log-layer'); }

  private portalLayerToBody(id:string){
    setTimeout(() => {
      const layer = document.getElementById(id);
      if (layer && layer.parentElement !== document.body) document.body.appendChild(layer);
    });
  }

  closeBackupLogs(){ if (!this.restoreCandidate()) this.backupLogsOpen.set(false); }
  @HostListener('document:keydown.escape')
  closeBackupLogsOnEscape(){ if (this.backupLogsOpen() && !this.restoreCandidate()) this.closeBackupLogs(); }
  resetBackupPage(){ this.backupPage.set(1); }
  filteredBackups(){
    const from = this.backupFrom ? new Date(`${this.backupFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
    const to = this.backupTo ? new Date(`${this.backupTo}T23:59:59.999`).getTime() : Number.POSITIVE_INFINITY;
    return (this.backups() || []).filter((b:any) => { const value = new Date(b?.modifiedAt || 0).getTime(); return Number.isFinite(value) && value >= from && value <= to; });
  }
  pagedBackups(){ const rows=this.filteredBackups(); const start=(this.backupPage()-1)*this.backupPageSize; return rows.slice(start,start+this.backupPageSize); }
  backupPageCount(){ return Math.max(1, Math.ceil(this.filteredBackups().length / this.backupPageSize)); }
  backupRangeStart(){ return this.filteredBackups().length ? ((this.backupPage()-1)*this.backupPageSize)+1 : 0; }
  backupRangeEnd(){ return Math.min(this.backupPage()*this.backupPageSize, this.filteredBackups().length); }
  previousBackupPage(){ this.backupPage.set(Math.max(1,this.backupPage()-1)); }
  nextBackupPage(){ this.backupPage.set(Math.min(this.backupPageCount(),this.backupPage()+1)); }
  setBackupRange(days:number){ const end=new Date(); const start=new Date(); start.setDate(end.getDate()-Math.max(0,days-1)); this.backupFrom=this.toDateInput(start); this.backupTo=this.toDateInput(end); this.resetBackupPage(); }
  clearBackupRange(){ this.backupFrom=''; this.backupTo=''; this.resetBackupPage(); }
  private toDateInput(value:Date){ const y=value.getFullYear(); const m=String(value.getMonth()+1).padStart(2,'0'); const d=String(value.getDate()).padStart(2,'0'); return `${y}-${m}-${d}`; }
  async refreshBackups(){ this.backupBusy.set(true); try { this.backups.set(await window.limsApi.listBackups()); if(this.backupPage()>this.backupPageCount()) this.backupPage.set(this.backupPageCount()); } finally { this.backupBusy.set(false); } }
  shortBackupName(name:any){ const value=String(name || 'Backup'); if(value.length<=34) return value; return `${value.slice(0,20)}…${value.slice(-10)}`; }
  formatBackupDate(value:any){ const date=new Date(value); if(!Number.isFinite(date.getTime())) return '-'; return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(date); }
  formatBackupTime(value:any){ const date=new Date(value); if(!Number.isFinite(date.getTime())) return ''; return new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).format(date); }
  async createBackup(){
    if (this.backupBusy()) return;
    this.backupBusy.set(true);
    this.backupMessage='Creating backup…';
    try {
      const result=await window.limsApi.createBackup();
      this.backups.set(await window.limsApi.listBackups());
      this.backupPage.set(1);
      const createdName=String(result?.name || result?.fileName || '').trim();
      this.backupMessage=createdName ? `Backup created: ${createdName}` : 'Backup created successfully.';
    } catch (error:any) {
      this.backupMessage=String(error?.message || error || 'Unable to create backup.');
    } finally {
      this.backupBusy.set(false);
    }
  }
  formatBytes(value:any){ const bytes=Number(value)||0; if(bytes<1024) return `${bytes} B`; if(bytes<1024*1024) return `${(bytes/1024).toFixed(1)} KB`; return `${(bytes/1024/1024).toFixed(1)} MB`; }
  backupValidationState(backup:any){
    const key=String(backup?.path || backup?.name || '');
    return this.backupValidation()[key] || { state: 'unchecked' as const, message: '' };
  }
  private setBackupValidation(backup:any, state:'unchecked'|'checking'|'valid'|'invalid', message=''){
    const key=String(backup?.path || backup?.name || '');
    if(!key) return;
    this.backupValidation.update(current => ({ ...current, [key]: { state, message } }));
  }
  async validateBackup(backup:any){
    this.backupBusy.set(true); this.backupMessage='';
    this.setBackupValidation(backup,'checking','Checking SQLite integrity and LIMS schema…');
    try {
      const result=await window.limsApi.validateBackup(backup.path);
      if(result.valid){
        const tableCount=Array.isArray(result.tables) ? result.tables.length : 0;
        const message=`Integrity check passed${tableCount ? ` · ${tableCount} LIMS tables found` : ''}`;
        this.setBackupValidation(backup,'valid',message);
        this.backupMessage=`${backup.name} is valid.`;
      } else {
        const message=String(result.error || 'SQLite integrity or LIMS schema validation failed.');
        this.setBackupValidation(backup,'invalid',message);
        this.backupMessage=`${backup.name} is invalid: ${message}`;
      }
    }
    catch(error:any){
      const message=String(error?.message || error || 'Backup validation failed.');
      this.setBackupValidation(backup,'invalid',message);
      this.backupMessage=message;
    }
    finally { this.backupBusy.set(false); }
  }
  async prepareRestore(backup:any){
    this.backupBusy.set(true); this.backupMessage='Validating backup before restore…';
    try { const result=await window.limsApi.validateBackup(backup.path); if(!result.valid){ this.backupMessage=`Cannot restore ${backup.name}: ${result.error}`; return; } this.backupMessage=''; this.restoreCandidate.set(result); this.portalLayerToBody('backup-restore-layer'); }
    catch(error:any){ this.backupMessage=String(error?.message || error || 'Backup validation failed.'); }
    finally { this.backupBusy.set(false); }
  }
  async confirmRestore(){
    const candidate=this.restoreCandidate(); if(!candidate) return;
    this.backupBusy.set(true); this.backupMessage='Restoring validated backup…';
    try { const result=await window.limsApi.restoreBackup(candidate.path); this.restoreCandidate.set(null); this.backupMessage=`Restore completed. Safety backup: ${result.safetyBackup}`; await this.reload(); }
    catch(error:any){ this.backupMessage=String(error?.message || error || 'Restore failed. The safety backup was retained.'); }
    finally { this.backupBusy.set(false); }
  }
  openResetConfirm(){ this.resetConfirmOpen.set(true); }
  async resetWorkflowData(){
    const api:any = window.limsApi as any;
    if (!api.resetWorkflowData) return;
    await api.resetWorkflowData();
    this.resetConfirmOpen.set(false);
    await this.reload();
    this.changed.emit(this.settingsForm);
  }
}
