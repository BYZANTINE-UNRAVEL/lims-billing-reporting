import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';
import { dateRangePresets, matchesDateRange, openNativeDatePicker, DATE_RANGE_FILTER_STYLES } from '../../shared/date-range-filters';

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
        <div class="panel-title"><h3>Patient maintenance</h3><span class="status-pill">Cleanup</span></div>
        <p class="settings-subtitle">Remove patient records that were saved but never billed and are not linked to any quick report. Patients with any bill (including cancelled) are kept. After drop, patient ID numbering is recalculated from remaining patients.</p>
        <div class="danger-tool">
          <div>
            <b>Drop unused patients</b>
            <span *ngIf="unusedPatientPreview() as p; else unusedPatientHint">{{p.count}} unused of {{p.totalPatients}} total. Sample: {{unusedPatientSampleLabel(p)}}</span>
            <ng-template #unusedPatientHint><span>Counts unused patients with no bill and no quick report.</span></ng-template>
          </div>
          <div class="danger-tool-actions">
            <button class="btn secondary" type="button" (click)="refreshUnusedPatients()" [disabled]="patientDropBusy()">Refresh count</button>
            <button class="btn danger" type="button" (click)="openDropUnusedPatientsConfirm()" [disabled]="patientDropBusy() || !(unusedPatientPreview()?.count)">Drop unused</button>
          </div>
        </div>
      </mat-card>

      <mat-card>
        <div class="panel-title"><h3>Numbering</h3><span class="status-pill">IDs</span></div>
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
        </div>
        <div class="actions"><button class="btn primary" (click)="saveSettings()">Save numbering</button></div>
      </mat-card>

      <mat-card class="backup-schedule-card">
        <div class="panel-title"><h3>Backup schedule</h3><span class="status-pill">Offline safety</span></div>
        <p class="settings-subtitle">Automatic copies of the live database. Interval backups run in the background; start/close backups show a progress screen.</p>

        <div class="print-flow backup-schedule-flow">
          <section class="print-flow-block">
            <div class="setting-title"><b>Scheduled backups</b><small>Timer while the app stays open. Minimum 5 minutes.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="settingsForm['backup.enabled'] === 'true'"><input type="radio" name="bkEnabled" [checked]="settingsForm['backup.enabled'] === 'true'" (change)="settingsForm['backup.enabled'] = 'true'"><span><b>Auto backup ON</b></span></label>
              <label [class.active]="settingsForm['backup.enabled'] !== 'true'"><input type="radio" name="bkEnabled" [checked]="settingsForm['backup.enabled'] !== 'true'" (change)="settingsForm['backup.enabled'] = 'false'"><span><b>Auto backup OFF</b></span></label>
            </div>
            <div class="backup-interval-block" *ngIf="settingsForm['backup.enabled'] === 'true'">
              <div class="setting-title" style="margin-top:12px"><b>How often</b><small>{{backupIntervalSummary()}}</small></div>
              <div class="backup-preset-grid">
                <button type="button" class="backup-preset" *ngFor="let preset of backupIntervalPresets" [class.active]="isBackupInterval(preset.minutes)" (click)="setBackupInterval(preset.minutes)">{{preset.label}}</button>
              </div>
              <label class="backup-custom-minutes">
                <span>Custom minutes</span>
                <input type="number" min="5" step="5" [(ngModel)]="settingsForm['backup.intervalMinutes']" (ngModelChange)="normalizeBackupInterval()">
              </label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title"><b>Backup when app starts</b><small>Shows a progress screen, then opens the app.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="settingsForm['backup.onStart'] === 'true'"><input type="radio" name="bkStart" [checked]="settingsForm['backup.onStart'] === 'true'" (change)="settingsForm['backup.onStart'] = 'true'"><span><b>On</b></span></label>
              <label [class.active]="settingsForm['backup.onStart'] !== 'true'"><input type="radio" name="bkStart" [checked]="settingsForm['backup.onStart'] !== 'true'" (change)="settingsForm['backup.onStart'] = 'false'"><span><b>Off</b></span></label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title"><b>Backup when app closes</b><small>After you confirm exit: progress screen → backup → then quit.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="settingsForm['backup.onClose'] === 'true'"><input type="radio" name="bkClose" [checked]="settingsForm['backup.onClose'] === 'true'" (change)="settingsForm['backup.onClose'] = 'true'"><span><b>On</b></span></label>
              <label [class.active]="settingsForm['backup.onClose'] !== 'true'"><input type="radio" name="bkClose" [checked]="settingsForm['backup.onClose'] !== 'true'" (change)="settingsForm['backup.onClose'] = 'false'"><span><b>Off</b></span></label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title"><b>Backup folder</b><small>Where SQLite copies are stored.</small></div>
            <div class="path-row"><input [(ngModel)]="settingsForm['backup.path']" placeholder="Backup path"><button class="btn secondary tiny" type="button" (click)="chooseBackupFolder()">Browse</button></div>
            <div class="path-row" style="margin-top:8px"><input [ngModel]="dataDir()" readonly placeholder="Current database folder"><button class="btn secondary tiny" type="button" (click)="chooseDatabaseFolder()">Change DB folder</button></div>
          </section>
        </div>

        <p class="settings-subtitle" *ngIf="dbMoveMessage">{{dbMoveMessage}}</p>
        <div class="actions" style="margin-top:14px"><button class="btn primary" (click)="saveSettings()">Save backup settings</button><button class="btn secondary" (click)="createBackup()" [disabled]="backupBusy()">Manual Backup</button></div>
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

      <mat-card class="print-defaults-card">
        <div class="panel-title"><h3>Finished report Print / PDF defaults</h3><span class="status-pill">Quick Reporting</span></div>
        <p class="settings-subtitle">Prefills the Finished Print / Export modal. Modal always opens so you can still change options per job.</p>

        <div class="print-flow">
          <section class="print-flow-block">
            <div class="setting-title"><b>Document appearance</b><small>Header is always included.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="printDefaults.withBackground"><input type="radio" name="pdBg" [checked]="printDefaults.withBackground" (change)="setPrintDefault('withBackground', true)"><span><b>With background</b></span></label>
              <label [class.active]="!printDefaults.withBackground"><input type="radio" name="pdBg" [checked]="!printDefaults.withBackground" (change)="setPrintDefault('withBackground', false)"><span><b>Without background</b></span></label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title"><b>Multiple reports</b><small>When more than one finished report is selected.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="printDefaults.mergeMode === 'MERGE'"><input type="radio" name="pdMerge" [checked]="printDefaults.mergeMode === 'MERGE'" (change)="setPrintDefault('mergeMode', 'MERGE')"><span><b>Merge into one document</b></span></label>
              <label [class.active]="printDefaults.mergeMode === 'SEPARATE'"><input type="radio" name="pdMerge" [checked]="printDefaults.mergeMode === 'SEPARATE'" (change)="setPrintDefault('mergeMode', 'SEPARATE')"><span><b>Keep reports separate</b></span></label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title"><b>Single tests position</b><small>Applied inside each category.</small></div>
            <div class="choice-card-grid">
              <label [class.active]="printDefaults.singleTestPlacement === 'TOP'"><input type="radio" name="pdSingle" [checked]="printDefaults.singleTestPlacement === 'TOP'" (change)="setPrintDefault('singleTestPlacement', 'TOP')"><span><b>At the beginning</b></span></label>
              <label [class.active]="printDefaults.singleTestPlacement === 'DEPARTMENT'"><input type="radio" name="pdSingle" [checked]="printDefaults.singleTestPlacement === 'DEPARTMENT'" (change)="setPrintDefault('singleTestPlacement', 'DEPARTMENT')"><span><b>At the end</b></span></label>
            </div>
          </section>

          <section class="print-flow-block">
            <div class="setting-title">
              <div>
                <b>Signatures</b>
                <small>All Report Settings signs. Tick to include, then choose image + text, image only, or text only.</small>
              </div>
              <span class="selected-count-pill">{{printSignatureRows.length}} available</span>
            </div>
            <div class="print-sign-empty" *ngIf="!printSignatureRows.length">No advanced signatures configured yet. Add them under Report Settings first.</div>
            <div class="signature-rich-list" *ngIf="printSignatureRows.length">
              <article class="signature-rich-card" *ngFor="let sign of printSignatureRows; trackBy: trackPrintSign" [class.active]="sign.selected" [class.off]="!sign.selected">
                <label class="signature-rich-include">
                  <input type="checkbox" [checked]="sign.selected" (change)="setSignDefault(sign.id, 'selected', $any($event.target).checked)">
                  <span class="signature-row-copy">
                    <b>{{sign.label}}</b>
                    <small>{{sign.hasImage ? 'Image available' : 'No image uploaded'}}</small>
                  </span>
                  <em>{{sign.selected ? (sign.contentMode === 'TEXT_ONLY' ? 'TEXT ONLY' : sign.contentMode === 'IMAGE_ONLY' ? 'IMAGE ONLY' : 'IMAGE + TEXT') : 'EXCLUDED'}}</em>
                </label>
                <div class="choice-card-grid signature-content-grid three" *ngIf="sign.selected">
                  <label [class.active]="sign.contentMode === 'IMAGE_TEXT'"><input type="radio" [name]="'pdSignContent-' + sign.id" [checked]="sign.contentMode === 'IMAGE_TEXT'" (change)="setSignDefault(sign.id, 'contentMode', 'IMAGE_TEXT')"><span><b>Image + text</b></span></label>
                  <label [class.active]="sign.contentMode === 'IMAGE_ONLY'"><input type="radio" [name]="'pdSignContent-' + sign.id" [checked]="sign.contentMode === 'IMAGE_ONLY'" (change)="setSignDefault(sign.id, 'contentMode', 'IMAGE_ONLY')"><span><b>Image only</b></span></label>
                  <label [class.active]="sign.contentMode === 'TEXT_ONLY'"><input type="radio" [name]="'pdSignContent-' + sign.id" [checked]="sign.contentMode === 'TEXT_ONLY'" (change)="setSignDefault(sign.id, 'contentMode', 'TEXT_ONLY')"><span><b>Text only</b></span></label>
                </div>
              </article>
            </div>
          </section>
        </div>

        <div class="print-defaults-actions">
          <button class="btn secondary" type="button" (click)="resetPrintDefaults()">Reset to recommended</button>
          <button class="btn primary" type="button" (click)="saveSettings()">Save Print / PDF defaults</button>
        </div>
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
            <div class="date-range-filters" aria-label="Backup date filters">
              <label class="date-field"><input type="date" [(ngModel)]="backupFrom" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (ngModelChange)="resetBackupPage()"></label>
              <span class="range-arrow">→</span>
              <label class="date-field"><input type="date" [(ngModel)]="backupTo" (click)="openDatePicker($event)" (keydown.enter)="openDatePicker($event)" (ngModelChange)="resetBackupPage()"></label>
              <button type="button" [class.active]="isBackupTodayRange()" (click)="setBackupDatePreset('today')">Today</button>
              <button type="button" [class.active]="isBackupPreviousDayRange()" (click)="setBackupDatePreset('previousDay')">Previous Day</button>
              <button type="button" [class.active]="isBackupCurrentMonthRange()" (click)="setBackupDatePreset('currentMonth')">Current Month</button>
              <button type="button" [class.active]="isBackupLastMonthRange()" (click)="setBackupDatePreset('lastMonth')">Last Month</button>
              <button type="button" [class.active]="isBackupThirtyDayRange()" (click)="setBackupDatePreset('thirtyDays')">30 Days</button>
              <button type="button" [class.active]="isBackupCurrentYearRange()" (click)="setBackupDatePreset('currentYear')">Current Year</button>
              <button type="button" [class.active]="isBackupLastYearRange()" (click)="setBackupDatePreset('lastYear')">Last Year</button>
              <button type="button" (click)="clearBackupRange()">All</button>
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

      <div class="settings-modal-backdrop" *ngIf="dropUnusedPatientsConfirmOpen()" (click)="dropUnusedPatientsConfirmOpen.set(false)">
        <div class="settings-modal-card danger" (click)="$event.stopPropagation()">
          <div class="panel-title"><h3>Drop unused patients?</h3><span class="status-pill danger">Permanent</span></div>
          <p *ngIf="unusedPatientPreview() as p">This will permanently delete <b>{{p.count}}</b> patient(s) that have no bill and no quick report.</p>
          <p class="settings-subtitle">Patients linked to any bill are kept. Patient ID numbering is recalculated from remaining patients (starts at {{settingsForm['patient.prefix'] || 'P'}}…001 if none remain). Create a manual backup first if you want a recovery point.</p>
          <div class="actions">
            <button class="btn secondary" type="button" (click)="dropUnusedPatientsConfirmOpen.set(false)" [disabled]="patientDropBusy()">Cancel</button>
            <button class="btn danger" type="button" (click)="confirmDropUnusedPatients()" [disabled]="patientDropBusy()">{{patientDropBusy() ? 'Dropping…' : 'Drop unused patients'}}</button>
          </div>
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
    .path-row{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}.path-row input{min-width:0}.settings-wide{grid-column:1/-1;min-height:720px;display:block}.report-settings-host mat-card{box-shadow:0 20px 55px rgba(0,0,0,.16)!important}.time-preview{border:1px solid var(--border);border-radius:14px;padding:10px 12px;background:rgba(15,23,42,.18);display:flex;flex-direction:column;gap:4px}.time-preview span{color:var(--muted);font-weight:800}.settings-subtitle,.muted{color:var(--muted);font-size:12px;font-weight:700}.config-block{border:1px solid var(--border);border-radius:18px;padding:14px;margin:14px 0;background:rgba(15,23,42,.25)}.config-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}.tag-editor{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}.config-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;background:rgba(59,130,246,.08)}.config-chip button{border:0;background:transparent;color:inherit;font-size:16px;cursor:pointer}.check-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.check-grid label{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:14px;padding:10px 12px;font-size:13px;font-weight:800;background:rgba(15,23,42,.18)}.wide-input{width:100%}.tiny{padding:7px 10px;font-size:12px}.status-pill.danger{background:rgba(220,38,38,.14);color:#ef4444}.danger-tool{display:flex;align-items:center;justify-content:space-between;gap:14px;border:1px solid rgba(220,38,38,.28);border-radius:18px;padding:14px;background:rgba(220,38,38,.08);margin-top:14px}.danger-tool b,.danger-tool span{display:block}.danger-tool span{color:var(--muted);font-size:12px;margin-top:4px}.danger-tool-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.backup-schedule-card{grid-column:1/-1}.backup-interval-block{margin-top:4px}.backup-preset-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-bottom:10px}.backup-preset{min-height:40px;border:1px solid var(--border);border-radius:12px;background:var(--row);color:var(--text);font-size:11px;font-weight:850;cursor:pointer;padding:8px 10px}.backup-preset:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--border))}.backup-preset.active{border-color:color-mix(in srgb,var(--accent) 62%,var(--border));background:var(--accent-soft);color:var(--accent)}.backup-custom-minutes{display:grid;gap:6px;max-width:220px}.backup-custom-minutes span{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.backup-custom-minutes input{min-height:40px}.print-flow{display:flex;flex-direction:column;gap:0;margin-top:12px;border:1px solid var(--border);border-radius:18px;background:color-mix(in srgb,var(--panel) 96%,var(--row));overflow:hidden}.print-flow-block{padding:16px 18px;border-bottom:1px solid var(--border)}.print-flow-block:last-child{border-bottom:0}.setting-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.setting-title b,.setting-title small{display:block}.setting-title b{font-size:12px}.setting-title small{margin-top:2px;color:var(--muted);font-size:10px;font-weight:750;line-height:1.4}.selected-count-pill{padding:6px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:900;white-space:nowrap}.choice-card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.choice-card-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.choice-card-grid label{display:flex;align-items:center;gap:10px;min-height:44px;border:1px solid var(--border);border-radius:12px;background:var(--row);padding:9px 12px;cursor:pointer;transition:border-color .15s ease,background .15s ease}.choice-card-grid label:hover{border-color:color-mix(in srgb,var(--accent) 40%,var(--border))}.choice-card-grid label.active{border-color:color-mix(in srgb,var(--accent) 62%,var(--border));background:var(--accent-soft)}.choice-card-grid input{width:17px;height:17px;margin:0;flex:0 0 auto}.choice-card-grid b{font-size:11px;line-height:1.2}.print-sign-empty{border:1px dashed var(--border);border-radius:14px;padding:16px;color:var(--muted);font-weight:750;text-align:center}.signature-rich-list{display:grid;gap:9px}.signature-rich-card{border:1px solid var(--border);border-radius:14px;background:var(--row);padding:10px;display:grid;gap:8px}.signature-rich-card.active{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent-soft) 58%,var(--row))}.signature-rich-card.off{opacity:.72}.signature-rich-include{display:flex;align-items:center;gap:10px;cursor:pointer}.signature-rich-include input{width:18px;height:18px;margin:0;flex:0 0 auto}.signature-rich-include .signature-row-copy{min-width:0;flex:1}.signature-rich-include .signature-row-copy b,.signature-rich-include .signature-row-copy small{display:block}.signature-rich-include .signature-row-copy b{font-size:11px;line-height:1.25}.signature-rich-include .signature-row-copy small{color:var(--muted);font-size:10px;margin-top:2px}.signature-rich-include em{margin-left:auto;color:var(--muted);font-size:9px;font-style:normal;font-weight:800;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}.signature-content-grid{margin-top:2px}.print-defaults-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:14px}@media(max-width:700px){.choice-card-grid,.choice-card-grid.three{grid-template-columns:1fr}}.settings-modal-backdrop{position:fixed;inset:0;z-index:999999;background:rgba(2,6,23,.72);display:grid;place-items:center;backdrop-filter:blur(8px)}.settings-modal-card{width:min(620px,calc(100vw - 40px));border:1px solid var(--border);border-radius:24px;background:var(--panel);box-shadow:0 28px 90px rgba(0,0,0,.45);padding:20px}.settings-modal-card.danger{border-color:rgba(220,38,38,.36)}.api-help-box{display:grid;gap:6px;border:1px solid var(--border);border-radius:16px;background:rgba(15,23,42,.18);padding:10px 12px;margin-top:10px}.api-help-box b{font-size:11px;text-transform:uppercase;color:var(--muted)}.api-help-box code{display:block;white-space:normal;word-break:break-all;border:1px solid var(--border);border-radius:10px;background:var(--input);padding:7px 9px;font-size:12px}.api-help-box span{color:var(--muted);font-size:12px;font-weight:700}.backup-actions{display:flex;gap:6px;flex-wrap:wrap}.backup-message{border:1px solid var(--border);border-radius:12px;padding:9px 11px;background:rgba(59,130,246,.08);font-weight:750}.restore-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.restore-summary span{border:1px solid var(--border);border-radius:12px;padding:9px;text-align:center;color:var(--muted);font-size:11px}.restore-summary b{display:block;color:var(--text);font-size:16px;margin-top:3px}.backup-storage-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.backup-path-card{min-width:0;border:1px solid var(--border);border-radius:14px;background:var(--row);padding:11px 12px}.backup-path-card span,.backup-path-card b{display:block}.backup-path-card span{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.backup-path-card b{margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.backup-log-summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:13px;border:1px solid var(--border);border-radius:17px;background:color-mix(in srgb,var(--panel) 94%,var(--accent));padding:13px;margin-top:14px}.backup-summary-icon,.backup-modal-icon{display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);font-weight:950}.backup-summary-icon{width:40px;height:40px;border-radius:13px;font-size:20px}.backup-summary-copy{min-width:0}.backup-summary-copy span,.backup-summary-copy b,.backup-summary-copy small{display:block}.backup-summary-copy span{color:var(--muted);font-size:10px;text-transform:uppercase;font-weight:900;letter-spacing:.05em}.backup-summary-copy b{margin-top:3px;font-size:13px}.backup-summary-copy small{margin-top:3px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-summary-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.backup-log-layer{z-index:8000;padding:88px 24px 24px;box-sizing:border-box}.backup-restore-layer{z-index:8100}.backup-log-modal{width:min(1180px,calc(100vw - 48px));height:min(760px,calc(100vh - 112px));max-height:calc(100vh - 112px);padding:0;overflow:hidden;display:flex;flex-direction:column}.backup-modal-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 97%,var(--row))}.backup-modal-heading{display:flex;align-items:center;gap:12px;min-width:0}.backup-modal-heading h3{margin:0;font-size:19px}.backup-modal-heading p{margin:4px 0 0;color:var(--muted);font-size:12px}.backup-modal-icon{width:42px;height:42px;border-radius:14px;font-size:19px}.backup-modal-close{width:40px;height:40px;border:1px solid var(--border);border-radius:13px;background:var(--row);color:var(--text);font-size:24px;line-height:1;cursor:pointer}.backup-modal-close:hover{border-color:rgba(239,68,68,.48);background:rgba(239,68,68,.12);color:#f87171}.backup-filter-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:14px 20px;border-bottom:1px solid var(--border);background:color-mix(in srgb,var(--panel) 96%,var(--row))}.backup-filter-bar .date-range-filters{flex:1 1 auto}.backup-filter-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.backup-refresh{white-space:nowrap}.backup-log-body{flex:1;min-height:0;overflow:auto;padding:0 20px}.backup-log-head,.backup-log-row{display:grid;grid-template-columns:minmax(220px,1.35fr) minmax(135px,.68fr) 82px minmax(150px,.72fr) minmax(170px,.72fr);gap:14px;align-items:center}.backup-log-head{position:sticky;top:0;z-index:2;padding:12px 14px;background:var(--panel);border-bottom:1px solid var(--border);color:var(--muted);font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.backup-log-row{padding:14px;border-bottom:1px solid var(--border)}.backup-file-cell,.backup-date-cell{min-width:0}.backup-file-cell b,.backup-file-cell small,.backup-date-cell b,.backup-date-cell small{display:block}.backup-file-cell b{font-size:13px}.backup-file-cell small{margin-top:4px;color:var(--muted);font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-date-cell b{font-size:12px}.backup-date-cell small{margin-top:3px;color:var(--muted);font-size:10px}.backup-size-cell{font-weight:850}.backup-validation-cell{min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:5px}.backup-validation-cell small{max-width:100%;color:var(--muted);font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.backup-validation-badge{display:inline-flex;align-items:center;min-height:25px;padding:4px 9px;border:1px solid var(--border);border-radius:999px;font-size:10px;font-weight:900;white-space:nowrap}.backup-validation-badge.unchecked{color:var(--muted);background:var(--row)}.backup-validation-badge.checking{color:#60a5fa;border-color:rgba(59,130,246,.38);background:rgba(59,130,246,.12)}.backup-validation-badge.valid{color:#4ade80;border-color:rgba(34,197,94,.4);background:rgba(34,197,94,.12)}.backup-validation-badge.invalid{color:#f87171;border-color:rgba(239,68,68,.42);background:rgba(239,68,68,.12)}.backup-actions{justify-content:flex-end}.backup-empty{display:grid;place-items:center;min-height:220px;color:var(--muted);font-weight:800}.backup-modal-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:13px 20px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 97%,var(--row))}.backup-page-summary{color:var(--muted);font-size:11px;font-weight:800}.backup-pagination{display:flex;align-items:center;gap:10px}.backup-pagination span{min-width:92px;text-align:center;font-size:11px;font-weight:900}@media(max-width:800px){.backup-storage-grid{grid-template-columns:1fr}.backup-log-summary{grid-template-columns:auto 1fr}.backup-summary-actions{grid-column:1/-1;justify-content:stretch}.backup-summary-actions .btn{flex:1}.backup-filter-actions{justify-content:flex-end;width:100%}.backup-refresh{position:static}.backup-log-head{display:none}.backup-log-body{padding:12px}.backup-log-row{grid-template-columns:1fr auto;gap:10px;border:1px solid var(--border);border-radius:15px;margin-bottom:10px}.backup-date-cell{grid-column:1}.backup-size-cell{grid-column:2;grid-row:1}.backup-validation-cell{grid-column:1/-1}.backup-actions{grid-column:1/-1;justify-content:flex-start}.backup-modal-footer{align-items:stretch;flex-direction:column}.backup-pagination{justify-content:space-between}}
    ${DATE_RANGE_FILTER_STYLES}
  `]
})
export class SettingsBackupPageComponent implements OnInit {
  @Output() changed = new EventEmitter<Record<string, string>>();
  settingsForm: Record<string, any> = {};
  printDefaults: { withBackground: boolean; mergeMode: 'MERGE' | 'SEPARATE'; singleTestPlacement: 'TOP' | 'DEPARTMENT'; signatures: Record<string, { selected: boolean; contentMode: 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' }> } = {
    withBackground: true,
    mergeMode: 'MERGE',
    singleTestPlacement: 'DEPARTMENT',
    signatures: {}
  };
  printSignatureRows: Array<{ id: string; label: string; hasImage: boolean; selected: boolean; contentMode: 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' }> = [];
  backups = signal<any[]>([]); backupValidation = signal<Record<string, { state: 'unchecked' | 'checking' | 'valid' | 'invalid'; message: string }>>({}); dataDir = signal(''); reportsDir = signal(''); resetConfirmOpen = signal(false); dropUnusedPatientsConfirmOpen = signal(false); unusedPatientPreview = signal<{ count: number; totalPatients: number; sample: any[] } | null>(null); patientDropBusy = signal(false); restoreCandidate = signal<any | null>(null); backupBusy = signal(false); backupLogsOpen = signal(false); backupPage = signal(1); consultants = signal<any[]>([]); dbMoveMessage = ''; backupMessage = ''; backupFrom = ''; backupTo = ''; readonly backupPageSize = 10;
  readonly backupIntervalPresets = [
    { minutes: 15, label: '15 min' },
    { minutes: 30, label: '30 min' },
    { minutes: 60, label: '1 hour' },
    { minutes: 120, label: '2 hours' },
    { minutes: 360, label: '6 hours' },
    { minutes: 720, label: '12 hours' },
    { minutes: 1440, label: '24 hours' }
  ];
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
      'report.simple.labSignImageHeightMm': '12',
      'report.printDefaults.json': JSON.stringify(this.defaultPrintDefaults())
    };
    return { ...defaults, ...settings };
  }
  defaultPrintDefaults() {
    return {
      withBackground: true,
      mergeMode: 'MERGE' as const,
      singleTestPlacement: 'DEPARTMENT' as const,
      signatures: {} as Record<string, { selected: boolean; contentMode: 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' }>
    };
  }
  private normalizeSignContentMode(value: any): 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' {
    const mode = String(value || 'IMAGE_TEXT').toUpperCase();
    if (mode === 'TEXT_ONLY') return 'TEXT_ONLY';
    if (mode === 'IMAGE_ONLY') return 'IMAGE_ONLY';
    return 'IMAGE_TEXT';
  }
  private parsePrintDefaults(raw: any) {
    const fallback = this.defaultPrintDefaults();
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
      const signatures: Record<string, { selected: boolean; contentMode: 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' }> = {};
      const source = parsed?.signatures && typeof parsed.signatures === 'object' ? parsed.signatures : {};
      Object.keys(source).forEach((id) => {
        const row = source[id] || {};
        signatures[String(id)] = {
          selected: row.selected !== false,
          contentMode: this.normalizeSignContentMode(row.contentMode)
        };
      });
      return {
        withBackground: parsed?.withBackground !== false,
        mergeMode: String(parsed?.mergeMode || 'MERGE').toUpperCase() === 'SEPARATE' ? 'SEPARATE' as const : 'MERGE' as const,
        singleTestPlacement: String(parsed?.singleTestPlacement || 'DEPARTMENT').toUpperCase() === 'TOP' ? 'TOP' as const : 'DEPARTMENT' as const,
        signatures
      };
    } catch {
      return fallback;
    }
  }
  private syncPrintDefaultsFromForm() {
    this.printDefaults = this.parsePrintDefaults(this.settingsForm['report.printDefaults.json']);
    this.refreshPrintSignatureRows();
  }
  private writePrintDefaultsToForm() {
    this.settingsForm['report.printDefaults.json'] = JSON.stringify(this.printDefaults);
  }
  availableReportSignatures(): Array<{ id: string; label: string; hasImage: boolean }> {
    try {
      const parsed = JSON.parse(String(this.settingsForm['report.simple.signatureRowsJson'] || '[]'));
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.signatures) ? parsed.signatures : [];
      return rows.filter((x: any) => x && x.enabled !== false).map((x: any, index: number) => ({
        id: String(x.id ?? index),
        label: String(x.label || x.name || (Array.isArray(x.lines) ? x.lines.map((line: any) => String(line?.text || '').trim()).filter(Boolean)[0] : '') || `Signature ${index + 1}`),
        hasImage: !!String(x.imagePath || x.signatureImagePath || '').trim()
      }));
    } catch {
      return [];
    }
  }
  private refreshPrintSignatureRows() {
    this.printSignatureRows = this.availableReportSignatures().map((sign: { id: string; label: string; hasImage: boolean }) => {
      const saved = this.printDefaults.signatures?.[sign.id];
      return {
        ...sign,
        selected: saved?.selected !== false,
        contentMode: this.normalizeSignContentMode(saved?.contentMode)
      };
    });
  }
  trackPrintSign(_index: number, sign: { id: string }) { return sign.id; }
  setPrintDefault(key: 'withBackground' | 'mergeMode' | 'singleTestPlacement', value: any) {
    if (key === 'withBackground') this.printDefaults = { ...this.printDefaults, withBackground: value === true || value === 'true' };
    if (key === 'mergeMode') this.printDefaults = { ...this.printDefaults, mergeMode: String(value).toUpperCase() === 'SEPARATE' ? 'SEPARATE' : 'MERGE' };
    if (key === 'singleTestPlacement') this.printDefaults = { ...this.printDefaults, singleTestPlacement: String(value).toUpperCase() === 'TOP' ? 'TOP' : 'DEPARTMENT' };
    this.writePrintDefaultsToForm();
  }
  setSignDefault(id: string, key: 'selected' | 'contentMode', value: any) {
    const current = this.printDefaults.signatures?.[id] || { selected: true, contentMode: 'IMAGE_TEXT' as const };
    const next = {
      selected: key === 'selected' ? !!value : current.selected !== false,
      contentMode: key === 'contentMode' ? this.normalizeSignContentMode(value) : this.normalizeSignContentMode(current.contentMode)
    };
    this.printDefaults = {
      ...this.printDefaults,
      signatures: { ...(this.printDefaults.signatures || {}), [String(id)]: next }
    };
    this.writePrintDefaultsToForm();
    this.refreshPrintSignatureRows();
  }
  resetPrintDefaults() {
    const signatures: Record<string, { selected: boolean; contentMode: 'IMAGE_TEXT' | 'IMAGE_ONLY' | 'TEXT_ONLY' }> = {};
    this.availableReportSignatures().forEach((sign: { id: string; label: string; hasImage: boolean }) => {
      signatures[sign.id] = { selected: true, contentMode: 'IMAGE_TEXT' };
    });
    this.printDefaults = { ...this.defaultPrintDefaults(), signatures };
    this.writePrintDefaultsToForm();
    this.refreshPrintSignatureRows();
  }
  async reload(){
    const api=window.limsApi;
    this.settingsForm=this.applyReportDefaults(DateTimeSettingsService.applyDefaults({...(await api.getSettings())}));
    this.applyBackupDefaults();
    this.syncPrintDefaultsFromForm();
    DateTimeSettingsService.sync(this.settingsForm);
    this.backups.set(await api.listBackups());
    this.dataDir.set(await api.getDataDir());
    this.reportsDir.set(await api.getReportsDir());
    this.consultants.set((await api.listConsultants()).filter((c:any)=>+c.active !== 0));
    await this.refreshUnusedPatients();
  }
  private applyBackupDefaults(){
    if (this.settingsForm['backup.enabled'] == null || this.settingsForm['backup.enabled'] === '') this.settingsForm['backup.enabled'] = 'true';
    if (this.settingsForm['backup.intervalMinutes'] == null || this.settingsForm['backup.intervalMinutes'] === '') this.settingsForm['backup.intervalMinutes'] = '60';
    if (this.settingsForm['backup.onClose'] == null || this.settingsForm['backup.onClose'] === '') this.settingsForm['backup.onClose'] = 'true';
    if (this.settingsForm['backup.onStart'] == null || this.settingsForm['backup.onStart'] === '') this.settingsForm['backup.onStart'] = 'false';
    this.normalizeBackupInterval();
  }
  setBackupInterval(minutes: number){
    this.settingsForm['backup.intervalMinutes'] = String(Math.max(5, Math.round(Number(minutes) || 60)));
  }
  normalizeBackupInterval(){
    const n = Math.max(5, Math.round(Number(this.settingsForm['backup.intervalMinutes']) || 60));
    this.settingsForm['backup.intervalMinutes'] = String(n);
  }
  isBackupInterval(minutes: number){
    return Number(this.settingsForm['backup.intervalMinutes']) === minutes;
  }
  backupIntervalSummary(){
    const minutes = Math.max(5, Math.round(Number(this.settingsForm['backup.intervalMinutes']) || 60));
    if (minutes % 1440 === 0) {
      const days = minutes / 1440;
      return days === 1 ? 'Every day while the app is open' : `Every ${days} days while the app is open`;
    }
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return hours === 1 ? 'Every hour while the app is open' : `Every ${hours} hours while the app is open`;
    }
    return `Every ${minutes} minutes while the app is open`;
  }
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
  async chooseDatabaseFolder(){ const chosen = await window.limsApi.chooseDirectory?.('Choose database folder'); if (!chosen?.path) return; const result = await window.limsApi.setDataDir?.(chosen.path); if (result?.dataDir) { this.dataDir.set(result.dataDir); this.dbMoveMessage = String(result.message || 'Database folder changed. Restart the app to use the new location.'); } }
  async chooseBackupFolder(){
    const chosen = await window.limsApi.chooseDirectory?.('Choose backup folder');
    if (!chosen?.path) return;
    this.settingsForm['backup.path'] = chosen.path;
  }
  async chooseAnalyzerLogFolder(){ const chosen = await window.limsApi.chooseDirectory?.('Choose analyzer API log folder'); if (chosen?.path) this.settingsForm['analyzer.api.logPath'] = chosen.path; }
  apiPreviewUrl(){ const host = String(this.settingsForm['analyzer.api.host'] || '127.0.0.1').trim() || '127.0.0.1'; const port = String(this.settingsForm['analyzer.api.port'] || '5055').trim() || '5055'; let base = String(this.settingsForm['analyzer.api.basePath'] || '/api/analyzer').trim() || '/api/analyzer'; if (!base.startsWith('/')) base = '/' + base; base = base.replace(/\/+$/, ''); return String(this.settingsForm['analyzer.api.publicUrl'] || '').trim() || `http://${host}:${port}${base}`; }
  async saveSettings(){
    this.writePrintDefaultsToForm();
    this.applyBackupDefaults();
    const saved = await window.limsApi.saveSettings(this.settingsForm);
    this.settingsForm=this.applyReportDefaults(DateTimeSettingsService.applyDefaults({...saved}));
    this.applyBackupDefaults();
    this.syncPrintDefaultsFromForm();
    DateTimeSettingsService.sync(this.settingsForm);
    this.changed.emit(this.settingsForm);
    await this.reload();
  }
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
  clearBackupRange(){ this.backupFrom=''; this.backupTo=''; this.resetBackupPage(); }
  openDatePicker(event: Event) { openNativeDatePicker(event); }
  setBackupDatePreset(key: keyof ReturnType<typeof dateRangePresets>) { const range = this.backupDatePresets()[key]; this.backupFrom = range.from; this.backupTo = range.to; this.resetBackupPage(); }
  private backupDatePresets() { return dateRangePresets(DateTimeSettingsService.nowInputValue()); }
  private matchesBackupPreset(key: keyof ReturnType<typeof dateRangePresets>) { return matchesDateRange(this.backupFrom, this.backupTo, this.backupDatePresets()[key]); }
  isBackupTodayRange() { return this.matchesBackupPreset('today'); }
  isBackupPreviousDayRange() { return this.matchesBackupPreset('previousDay'); }
  isBackupCurrentMonthRange() { return this.matchesBackupPreset('currentMonth'); }
  isBackupLastMonthRange() { return this.matchesBackupPreset('lastMonth'); }
  isBackupThirtyDayRange() { return this.matchesBackupPreset('thirtyDays'); }
  isBackupCurrentYearRange() { return this.matchesBackupPreset('currentYear'); }
  isBackupLastYearRange() { return this.matchesBackupPreset('lastYear'); }
  async refreshBackups(){ this.backupBusy.set(true); try { this.backups.set(await window.limsApi.listBackups()); if(this.backupPage()>this.backupPageCount()) this.backupPage.set(this.backupPageCount()); } finally { this.backupBusy.set(false); } }
  shortBackupName(name:any){ const value=String(name || 'Backup'); if(value.length<=34) return value; return `${value.slice(0,20)}…${value.slice(-10)}`; }
  formatBackupDate(value:any){ const date=new Date(value); if(!Number.isFinite(date.getTime())) return '-'; return new Intl.DateTimeFormat('en-IN',{day:'2-digit',month:'short',year:'numeric'}).format(date); }
  formatBackupTime(value:any){ const date=new Date(value); if(!Number.isFinite(date.getTime())) return ''; return new Intl.DateTimeFormat('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}).format(date); }
  async createBackup(){
    if (this.backupBusy()) return;
    this.backupBusy.set(true);
    this.backupMessage='Creating backup…';
    try {
      const result=await window.limsApi.createBackup('manual');
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
  async refreshUnusedPatients(){
    const api:any = window.limsApi as any;
    if (!api.previewUnusedPatients) { this.unusedPatientPreview.set(null); return; }
    try {
      const preview = await api.previewUnusedPatients();
      this.unusedPatientPreview.set(preview || { count: 0, totalPatients: 0, sample: [] });
    } catch {
      this.unusedPatientPreview.set(null);
    }
  }
  unusedPatientSampleLabel(p: { sample?: any[] } | null): string {
    const sample = Array.isArray(p?.sample) ? p!.sample : [];
    if (!sample.length) return 'none';
    return sample.slice(0, 3).map((x:any) => x.patient_no || x.name || `#${x.id}`).join(', ') + (sample.length > 3 ? '…' : '');
  }
  async openDropUnusedPatientsConfirm(){
    await this.refreshUnusedPatients();
    if (!(this.unusedPatientPreview()?.count)) {
      this.backupMessage = 'No unused patients to drop.';
      return;
    }
    this.dropUnusedPatientsConfirmOpen.set(true);
  }
  async confirmDropUnusedPatients(){
    const api:any = window.limsApi as any;
    if (!api.dropUnusedPatients) return;
    this.patientDropBusy.set(true);
    try {
      const result = await api.dropUnusedPatients();
      this.dropUnusedPatientsConfirmOpen.set(false);
      await this.refreshUnusedPatients();
      const nextNo = String(result?.nextPatientNo || '').trim();
      this.backupMessage = nextNo
        ? `Dropped ${Number(result?.deleted || 0)} unused patient(s). Next patient ID will be ${nextNo}.`
        : `Dropped ${Number(result?.deleted || 0)} unused patient(s).`;
    } catch (error:any) {
      this.dropUnusedPatientsConfirmOpen.set(false);
      this.backupMessage = String(error?.message || error || 'Drop unused patients failed.');
    } finally {
      this.patientDropBusy.set(false);
    }
  }
  async resetWorkflowData(){
    const api:any = window.limsApi as any;
    if (!api.resetWorkflowData) return;
    try {
      await api.resetWorkflowData();
      this.resetConfirmOpen.set(false);
      await this.reload();
      this.changed.emit(this.settingsForm);
      this.backupMessage = 'Workflow transactional data was cleared.';
    } catch (error:any) {
      this.resetConfirmOpen.set(false);
      this.backupMessage = String(error?.message || error || 'Clear test data failed.');
    }
  }
}
