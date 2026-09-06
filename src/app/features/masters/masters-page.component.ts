import { CommonModule } from '@angular/common';
import { AfterViewChecked, Component, ElementRef, EventEmitter, HostListener, OnInit, Output, ViewChild, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTimeSettingsService } from '../../shared/date-time-settings.service';
import { EquipmentMasterComponent } from '../equipment/equipment-master.component';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'app-masters-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule, MatTabsModule, EquipmentMasterComponent],
  template: `
    <section class="masters-shell">
      <nav class="masters-tabs" aria-label="Masters sections">
        <button type="button" [class.active]="activeTab==='departments'" (click)="setActiveTab('departments')">
          <span class="tab-ico">▦</span>
          Departments
        </button>
        <button type="button" [class.active]="activeTab==='units'" (click)="setActiveTab('units')">
          <span class="tab-ico">◇</span>
          Units
        </button>
        <button type="button" [class.active]="activeTab==='tests'" (click)="setActiveTab('tests')">
          <span class="tab-ico">▵</span>
          Tests
        </button>
        <button type="button" [class.active]="activeTab==='profiles'" (click)="setActiveTab('profiles')">
          <span class="tab-ico">◎</span>
          Profiles
        </button>
        <button type="button" [class.active]="activeTab==='equipment'" (click)="setActiveTab('equipment')">
          <span class="tab-ico">⌁</span>
          Equipment
        </button>
      </nav>

      <section class="master-panel" *ngIf="activeTab==='departments'">
        <div class="panel-heading">
          <div class="panel-heading-left">
            <div class="panel-icon">▦</div>
            <div>
              <h2>Department Configuration</h2>
              <p>Manage and organize your departments.</p>
            </div>
          </div>
          <span class="info-pill">Priority controls report order</span>
        </div>

        <div class="entry-card department-entry">
          <label class="master-field department-name-field">
            <span>Department</span>
            <input [(ngModel)]="department.name" placeholder="Enter department name">
          </label>
          <label class="master-field order-field">
            <span>Display Order</span>
            <input type="number" [(ngModel)]="department.priority" placeholder="0">
          </label>
          <label class="switch-field">
            <span>Page break after</span>
            <span class="switch-line">
              <input type="checkbox" [(ngModel)]="department.page_break_after">
              <span class="switch-visual"></span>
              <b>{{ department.page_break_after ? 'Yes' : 'No' }}</b>
            </span>
          </label>
          <label class="switch-field">
            <span>Active</span>
            <span class="switch-line">
              <input type="checkbox" [(ngModel)]="department.active">
              <span class="switch-visual"></span>
              <b>{{ department.active ? 'Yes' : 'No' }}</b>
            </span>
          </label>
          <div class="propagation-box department-rename-scope span-all" *ngIf="department.id && isDepartmentRenamePending()">
            <strong>Rename scope</strong>
            <p class="editor-help">Department master always updates. Frozen bill/report prints keep the old name unless you rewrite them below.</p>
            <label class="master-field select-field"><span>Update mode</span>
              <select [(ngModel)]="departmentRenameScope.update_scope">
                <option value="future">Future only — keep existing bill/report names frozen</option>
                <option value="fromDate">From selected date</option>
                <option value="all">All history</option>
              </select>
            </label>
            <label class="master-field" *ngIf="departmentRenameScope.update_scope==='fromDate'"><span>Apply from date</span>
              <input type="date" [(ngModel)]="departmentRenameScope.apply_from" (focus)="departmentRenameScope.update_scope='fromDate'">
            </label>
            <div class="check-row">
              <label class="check-pill"><input type="checkbox" [(ngModel)]="departmentRenameScope.update_billing" [disabled]="departmentRenameScope.update_scope==='future'"> Billing prints</label>
              <label class="check-pill"><input type="checkbox" [(ngModel)]="departmentRenameScope.update_reporting" [disabled]="departmentRenameScope.update_scope==='future'"> Reporting prints</label>
            </div>
          </div>
          <div class="form-actions">
            <button class="action-btn primary" type="button" (click)="saveDepartment()">{{ department.id ? 'Save changes' : 'Save' }}</button>
            <button class="action-btn ghost" type="button" (click)="clearDepartmentForm()">Clear</button>
          </div>
        </div>

        <div class="table-card">
          <table class="masters-table">
            <thead>
              <tr><th>Order</th><th>Department Name</th><th>Page Break After</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              <tr *ngFor="let d of departments()" draggable="true" (dragstart)="onDepartmentDragStart(d)" (dragover)="onDepartmentDragOver($event)" (drop)="onDepartmentDrop(d)">
                <td class="drag-cell"><span class="drag-handle" title="Drag to reorder">⋮⋮</span><span class="order-chip">{{d.priority}}</span></td>
                <td><strong class="entity-name">{{d.name || '(unnamed)'}}</strong></td>
                <td><span class="status-badge" [class.inactive]="!d.page_break_after"><i></i>{{d.page_break_after?'Yes':'No'}}</span></td>
                <td><span class="status-badge" [class.inactive]="!isDepartmentActive(d)"><i></i>{{isDepartmentActive(d)?'Active':'Inactive'}}</span></td>
                <td class="row-actions">
                  <button class="edit-btn" type="button" (click)="editDepartment(d)">Edit</button>
                  <button class="mini-status-action" *ngIf="isDepartmentActive(d)" type="button" title="Hide from future test/profile assignment" (click)="deactivateDepartment(d)">Deactivate</button>
                  <button class="mini-status-action activate" *ngIf="!isDepartmentActive(d)" type="button" title="Show again for future use" (click)="activateDepartment(d)">Activate</button>
                  <button class="icon-action delete" type="button" title="Delete only if unused" aria-label="Delete department" (click)="deleteDepartment(d)">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="table-footer"><span>Total Departments: <b>{{ departments().length }}</b></span><span>Deactivate hides from future assignment. Delete only when unused.</span></div>
        </div>
      </section>

      <section class="master-panel" *ngIf="activeTab==='units'">
        <div class="panel-heading">
          <div class="panel-heading-left"><div class="panel-icon">◇</div><div><h2>Unit Configuration</h2><p>Create units used in test result entry.</p></div></div>
          <span class="info-pill">{{ units().length }} units</span>
        </div>
        <div class="entry-card compact-entry">
          <label class="master-field"><span>Unit</span><input [(ngModel)]="unit.name" placeholder="Enter unit name"></label>
          <label class="switch-field"><span>Active</span><span class="switch-line"><input type="checkbox" [(ngModel)]="unit.active"><span class="switch-visual"></span><b>{{ unit.active ? 'Yes' : 'No' }}</b></span></label>
          <div class="form-actions"><button class="action-btn primary" type="button" (click)="saveUnit()">Save</button><button class="action-btn ghost" type="button" (click)="unit={name:'',active:true}">Clear</button></div>
        </div>
        <div class="table-card"><table class="masters-table"><thead><tr><th>Unit</th><th>Status</th><th>Actions</th></tr></thead><tbody><tr *ngFor="let u of units()"><td><strong class="entity-name">{{u.name}}</strong></td><td><span class="status-badge" [class.inactive]="!u.active"><i></i>{{u.active?'Active':'Inactive'}}</span></td><td><button class="edit-btn" type="button" (click)="editUnit(u)">Edit</button></td></tr></tbody></table><div class="table-footer"><span>Total Units: <b>{{ units().length }}</b></span></div></div>
      </section>

      <section class="master-panel" *ngIf="activeTab==='tests'">
        <div class="panel-heading">
          <div class="panel-heading-left"><div class="panel-icon">▵</div><div><h2>Test Master</h2><p>Billing, result-entry behavior, specimen, method, references and order.</p></div></div>
          <span class="info-pill">Gap order: 1000, 2000, 3000</span>
        </div>

        <ng-container *ngIf="testMasterView === 'list'; else testMasterForm">
          <div class="test-list-toolbar">
            <div class="test-list-search">
              <span>Search</span>
              <input [(ngModel)]="testListSearch" placeholder="Search by code, test, report name, method, specimen">
            </div>
            <label class="test-list-filter">
              <span>Status</span>
              <select [(ngModel)]="testListStatus">
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="BILLABLE">Billing active</option>
                <option value="NON_BILLABLE">Billing inactive</option>
              </select>
            </label>
            <div class="test-list-actions">
              <button class="action-btn ghost" type="button" (click)="exportTestsCsv()">Export CSV</button>
              <button class="action-btn ghost" type="button" (click)="printTestsList()">PDF / Print</button>
              <button class="action-btn primary" type="button" (click)="openCreateTest()">+ Create Test</button>
            </div>
          </div>

          <div class="test-department-stepper status-stepper" aria-label="Filter tests by active or deactivated state">
            <button type="button" [class.active]="testListState==='ACTIVE'" (click)="setTestListState('ACTIVE')">
              <span>Active Tests</span><b>{{activeTestCount()}}</b>
            </button>
            <button type="button" [class.active]="testListState==='DEACTIVATED'" (click)="setTestListState('DEACTIVATED')">
              <span>Deactivated</span><b>{{deactivatedTestCount()}}</b>
            </button>
          </div>

          <div class="test-department-stepper" aria-label="Filter tests by department" *ngIf="testListState==='ACTIVE'">
            <button type="button" [class.active]="!testListDepartment" (click)="setTestListDepartment('')">
              <span>All</span><b>{{testListTotalCount()}}</b>
            </button>
            <button type="button" *ngFor="let d of activeDepartments()" [class.active]="isTestDepartmentSelected(d.id)" (click)="setTestListDepartment(d.id)">
              <span>{{d.name}}</span><b>{{testCountForDepartment(d.id)}}</b>
            </button>
          </div>

          <div class="table-card test-list-card" *ngIf="testListGroupMode === 'NONE'; else groupedTestList">
            <table class="masters-table test-master-list-table">
              <thead><tr><th class="drag-col">Order</th><th>Code</th><th>Test Name</th><th>Department</th><th>Result</th><th>Specimen</th><th>Method</th><th>Price</th><th>Actions</th></tr></thead>
              <tbody>
                <tr *ngFor="let t of filteredTests(); trackBy: trackByTestId" draggable="true" (dragstart)="onTestDragStart(t)" (dragover)="onTestDragOver($event)" (drop)="onTestDrop(t)">
                  <td class="drag-cell"><span class="drag-handle" title="Drag to reorder">⋮⋮</span><span class="order-chip">{{t.report_order || t.priority}}</span></td>
                  <td><strong>{{t.code || '-'}}</strong></td>
                  <td><strong class="entity-name">{{t.display_name || t.name}}</strong></td>
                  <td>{{t.department_name || '-'}}</td>
                  <td>{{displayResultType(t)}}</td>
                  <td>{{t.specimen_names || '-'}}</td>
                  <td>{{t.method || '-'}}</td>
                  <td>₹{{t.price}}</td>
                  <td class="row-actions"><button class="icon-action edit" type="button" title="Edit test" aria-label="Edit test" (click)="openEditTest(t)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button><button class="mini-status-action" *ngIf="testListState==='ACTIVE'" type="button" title="Deactivate test" (click)="deactivateTest(t)">Deactivate</button><button class="mini-status-action activate" *ngIf="testListState==='DEACTIVATED'" type="button" title="Activate test" (click)="activateTest(t)">Activate</button><button class="icon-action delete" type="button" title="Delete test" aria-label="Delete test" (click)="deleteTest(t)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button></td>
                </tr>
              </tbody>
            </table>
            <div class="table-footer"><span>Total Tests: <b>{{ filteredTests().length }}</b></span><span>Drag rows to update report order using safe gaps.</span></div>
          </div>

          <ng-template #groupedTestList>
            <div class="department-test-group" *ngFor="let group of groupedTests()">
              <div class="group-heading"><strong>{{group.department}}</strong><span>{{group.tests.length}} tests</span></div>
              <div class="table-card test-list-card compact-group-table">
                <table class="masters-table test-master-list-table">
                  <thead><tr><th class="drag-col">Order</th><th>Code</th><th>Test Name</th><th>Result</th><th>Specimen</th><th>Method</th><th>Price</th><th>Actions</th></tr></thead>
                  <tbody>
                    <tr *ngFor="let t of group.tests; trackBy: trackByTestId" draggable="true" (dragstart)="onTestDragStart(t)" (dragover)="onTestDragOver($event)" (drop)="onTestDrop(t)">
                      <td class="drag-cell"><span class="drag-handle" title="Drag to reorder">⋮⋮</span><span class="order-chip">{{t.report_order || t.priority}}</span></td>
                      <td><strong>{{t.code || '-'}}</strong></td>
                      <td><strong class="entity-name">{{t.display_name || t.name}}</strong></td>
                      <td>{{displayResultType(t)}}</td>
                      <td>{{t.specimen_names || '-'}}</td>
                      <td>{{t.method || '-'}}</td>
                      <td>₹{{t.price}}</td>
                      <td class="row-actions"><button class="icon-action edit" type="button" title="Edit test" aria-label="Edit test" (click)="openEditTest(t)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button><button class="mini-status-action" *ngIf="testListState==='ACTIVE'" type="button" title="Deactivate test" (click)="deactivateTest(t)">Deactivate</button><button class="mini-status-action activate" *ngIf="testListState==='DEACTIVATED'" type="button" title="Activate test" (click)="activateTest(t)">Activate</button><button class="icon-action delete" type="button" title="Delete test" aria-label="Delete test" (click)="deleteTest(t)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </ng-template>
        </ng-container>

        <ng-template #testMasterForm>
          <div class="test-form-topbar">
            <button class="action-btn ghost" type="button" (click)="backToTestList()">← Back to Test List</button>
            <div><strong>{{ testFormMode === 'edit' ? 'Edit Test Master' : 'Create Test Master' }}</strong><span>{{ test.display_name || test.name || 'Complete the stepper and save' }}</span></div>
          </div>
          <div class="test-master-layout">
          <div class="advanced-test-entry test-stepper-card">
            <div class="test-stepper-head span-all">
              <button type="button" *ngFor="let step of testMasterSteps; let i = index" class="test-stepper-step" [class.active]="testMasterStep === i" [class.done]="i < testMasterStep" (click)="goToTestStep(i)">
                <span>{{ i + 1 }}</span>
                <strong>{{ step.title }}</strong>
                <small>{{ step.caption }}</small>
              </button>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 0">
              <div class="form-section-title">Basic & Billing</div>
              <div class="test-step-grid basic-billing-grid">
                <label class="master-field" [class.field-error]="isDuplicateTestCode()"><span>Code <b class="req">*</b></span><input [class.invalid-control]="isDuplicateTestCode()" [(ngModel)]="test.code" (ngModelChange)="onTestCodeChange($event)" placeholder="Auto from name"><small class="field-note error" *ngIf="isDuplicateTestCode()">This test code already exists. Use a unique code.</small><small class="field-note success" *ngIf="test.code && !isDuplicateTestCode()">Code available.</small></label>
                <label class="master-field wide"><span>Test name <b class="req">*</b></span><input [(ngModel)]="test.name" (ngModelChange)="onTestNameChange($event)" placeholder="Enter test name"></label>
                <label class="master-field wide"><span>Report name <b class="req" *ngIf="test.active_for_reporting">*</b></span><input [(ngModel)]="test.display_name" (ngModelChange)="onDisplayNameChange($event)" placeholder="Auto from test name"></label>
                <label class="master-field"><span>Price <b class="req">*</b></span><input type="number" [(ngModel)]="test.price" placeholder="Price"></label>
                <label class="master-field"><span>Test cost</span><input type="number" [(ngModel)]="test.running_cost" placeholder="Internal test cost"></label>
                <label class="master-field wide"><span>Search keywords</span><input [(ngModel)]="test.search_keywords" placeholder="Auto keywords from code/name"></label>

                <label class="master-field select-field"><span>Department <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.department_id"><option [ngValue]="null">Department</option><option *ngFor="let d of departmentsForSelect(test.department_id)" [ngValue]="d.id">{{d.name}}{{isDepartmentActive(d) ? '' : ' (inactive)'}}</option></select></label>
                <label class="master-field select-field"><span>Unit <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.unit_id"><option [ngValue]="null">Unit</option><option *ngFor="let u of units()" [ngValue]="u.id">{{u.name}}</option></select></label>
                <label class="master-field order-entry-field"><span>Billing order</span><input type="number" [(ngModel)]="test.billing_order" (focus)="openOrderHelper('billing')" (input)="openOrderHelper('billing')" placeholder="Auto"></label>
                <label class="master-field order-entry-field"><span>Report order <small>Auto</small></span><input type="number" [(ngModel)]="test.report_order" (focus)="openOrderHelper('report')" (input)="openOrderHelper('report')" placeholder="Auto"></label>

                <div class="basic-status-row span-all">
                  <label class="basic-status-check">
                    <input type="checkbox" [(ngModel)]="test.active">
                    <span>Active</span>
                  </label>
                  <label class="basic-status-check">
                    <input type="checkbox" [(ngModel)]="test.billable">
                    <span>Active for billing</span>
                  </label>
                  <label class="basic-status-check">
                    <input type="checkbox" [(ngModel)]="test.active_for_reporting">
                    <span>Active for reporting</span>
                  </label>
                  <label class="basic-status-check">
                    <input type="checkbox" [(ngModel)]="test.highlight_parameter">
                    <span>Highlight parameter</span>
                  </label>
                  <label class="basic-status-check">
                    <input type="checkbox" [(ngModel)]="test.commission_allowed">
                    <span>Allow commission</span>
                  </label>
                </div>
              </div>

              <div class="order-helper" *ngIf="showOrderHelper()">
                <div class="order-helper-head">
                  <div>
                    <strong>{{ focusedOrderField === 'billing' ? 'Billing order helper' : 'Report order helper' }}</strong>
                    <p>Showing up to 50 tests in this department. Click an order to reuse it, or type any gap value like 1500.</p>
                  </div>
                  <button type="button" class="formula-chip-action" (click)="closeOrderHelper()">Close</button>
                </div>
                <div class="order-helper-list">
                  <button type="button" *ngFor="let item of orderHelperTests()" (click)="applyOrderFromHelper(item)">
                    <span class="order-helper-name">{{item.name}}</span>
                    <span class="order-helper-meta">{{item.code || 'No code'}} · {{item.department_name || 'No dept'}}</span>
                    <b>{{ focusedOrderField === 'billing' ? (item.billing_order || item.priority) : (item.report_order || item.priority) }}</b>
                  </button>
                </div>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 1">
              <div class="form-section-title">Result Setup</div>
              <div class="test-step-grid">
                <label class="master-field"><span>Data type <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.result_data_type" (ngModelChange)="syncInputTypeForDataType()"><option *ngFor="let x of dataTypes" [value]="x.value">{{x.label}}</option></select></label>
                <label class="master-field"><span>Input field <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.input_control_type"><option *ngFor="let x of inputTypes" [value]="x.value">{{x.label}}</option></select></label>
                <label class="master-field"><span>Result mode <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.result_mode"><option value="DIRECT">Direct input</option><option value="CALCULATED">Calculated</option></select></label>
                <label class="master-field wide"><span>Method <b class="req" *ngIf="test.active_for_reporting">*</b></span><input [(ngModel)]="test.method" list="methodOptions" placeholder="Type or pick method"><datalist id="methodOptions"><option *ngFor="let m of methods()" [value]="m.name"></option></datalist></label>
              </div>

              <ng-container *ngIf="isNumberLikeTest()">
                <div class="form-section-title">Number Formatting</div>
                <div class="test-step-grid compact-grid">
                  <label class="master-field"><span>Decimal digits <b class="req" *ngIf="test.active_for_reporting">*</b></span><input type="number" min="0" max="6" [(ngModel)]="test.decimal_places" placeholder="2"></label>
                  <label class="master-field"><span>Round off <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.rounding_mode"><option *ngFor="let r of roundingModes" [value]="r.value">{{r.label}}</option></select></label>
                  <label class="master-field"><span>Comma format <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.number_format"><option *ngFor="let f of numberFormats" [value]="f.value">{{f.label}}</option></select></label>
                </div>

                <div class="form-section-title">Result Output</div>
                <div class="test-step-grid compact-grid">
                  <label class="master-field"><span>Output operator <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.output_operator"><option *ngFor="let op of outputOperators" [value]="op.value">{{op.label}}</option></select></label>
                  <label class="master-field"><span>Output constant <b class="req" *ngIf="test.active_for_reporting">*</b></span><input type="number" step="any" [(ngModel)]="test.output_constant" placeholder="0"></label>
                  <div class="formula-help output-help">Final display value = entered/calculated value {{test.output_operator || '+'}} {{test.output_constant ?? 0}}. Default is + 0, so the result is unchanged.</div>
                </div>
              </ng-container>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 2">
              <div class="form-section-title">Specimen Mapping <b class="req" *ngIf="test.active_for_reporting">*</b></div>
              <div class="chip-picker">
                <button type="button" *ngFor="let s of specimens()" class="specimen-chip" [class.selected]="isSpecimenSelected(s.id)" (click)="toggleSpecimen(s.id)">{{s.name}}</button>
                <span class="empty-inline" *ngIf="!specimens().length">No specimen master yet.</span>
              </div>
              <div class="required-hint" *ngIf="!(test.specimen_ids || []).length">Select at least one specimen.</div>
              <div class="inline-add">
                <input [(ngModel)]="newSpecimenName" placeholder="Add specimen e.g. Serum, Plasma, Urine">
                <button class="action-btn ghost" type="button" (click)="addSpecimen()">Add specimen</button>
              </div>

              <div class="form-section-title timed-master-title">Timed Collection Rule</div>
              <div class="test-step-grid compact-grid timed-master-grid">
                <label class="master-field"><span>Collection rule</span><select [(ngModel)]="test.collection_rule"><option value="NORMAL">Normal / anytime</option><option value="FASTING">Fasting</option><option value="POST_PRANDIAL">Post-prandial</option><option value="TIMED_INTERVAL">Timed interval</option></select></label>
                <label class="master-field" *ngIf="test.collection_rule === 'FASTING'"><span>Minimum fasting hours</span><input type="number" min="0" max="24" [(ngModel)]="test.fasting_hours" placeholder="8"></label>
                <label class="master-field" *ngIf="test.collection_rule === 'POST_PRANDIAL' || test.collection_rule === 'TIMED_INTERVAL'"><span>Gap minutes</span><input type="number" min="0" max="1440" [(ngModel)]="test.collection_gap_minutes" placeholder="120"></label>
                <label class="master-field" *ngIf="test.collection_rule === 'POST_PRANDIAL' || test.collection_rule === 'TIMED_INTERVAL'"><span>Depends on</span><select [(ngModel)]="test.collection_dependency"><option value="MEAL_TIME">Meal time</option><option value="FASTING_SAMPLE">Fasting sample</option><option value="PREVIOUS_SAMPLE">Previous sample</option><option value="NONE">No dependency</option></select></label>
                <label class="master-field"><span>Same specimen group</span><select [(ngModel)]="test.same_specimen_allowed"><option [ngValue]="true">Allowed with same timing</option><option [ngValue]="false">Keep separate</option></select></label>
                <label class="master-field wide"><span>Collection instruction</span><input [(ngModel)]="test.collection_instruction" placeholder="Example: Collect 2 hours after food. Do not combine with fasting sample."></label>
                <div class="formula-help output-help span-all">Use this to stop accidental same-time collection of fasting and post-prandial tests. Collection will use this master rule first, and only fall back to name detection for old tests.</div>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 3">
              <div class="form-section-title">Reference & Flags</div>
              <div class="test-step-grid compact-grid">
                <label class="master-field"><span>Reference mode <b class="req" *ngIf="test.active_for_reporting">*</b></span><select [(ngModel)]="test.reference_mode"><option value="SINGLE">Single reference</option><option value="MALE_FEMALE">Male / Female</option></select></label>
                <label class="check-pill"><input type="checkbox" [(ngModel)]="test.flag_enabled"> Flags enabled</label>
              </div>
              <div class="test-step-grid" *ngIf="test.reference_mode !== 'MALE_FEMALE'">
                <label class="master-field"><span>Low</span><input type="number" [(ngModel)]="test.ref_lower" placeholder="Low"></label>
                <label class="master-field"><span>High</span><input type="number" [(ngModel)]="test.ref_upper" placeholder="High"></label>
                <div class="master-field wide reference-textarea-field reference-format-field"><span>Reference text <b class="req" *ngIf="test.active_for_reporting">*</b></span><textarea [(ngModel)]="test.reference_text" rows="10" placeholder="Example:
Adult: 4.0 - 10.0
Child: 5.0 - 12.0"></textarea><button class="reference-format-btn" type="button" (click)="formatReferenceText('reference_text')">Format / Align Reference</button></div>
                <ng-container *ngIf="test.flag_enabled">
                  <label class="master-field"><span>Critical low <small>(optional)</small></span><input type="number" [(ngModel)]="test.critical_low" placeholder="Critical low"></label>
                  <label class="master-field"><span>Critical high <small>(optional)</small></span><input type="number" [(ngModel)]="test.critical_high" placeholder="Critical high"></label>
                  <div class="formula-help output-help">Critical values are optional. They can be used later to highlight panic/critical results separately from normal low/high flags.</div>
                </ng-container>
                <div class="reference-rule-panel span-all">
                  <div class="builder-title compact"><h3>Age / Gender Rules</h3><span>No specimen, method, or pregnancy based rules.</span><button class="formula-chip-action" type="button" (click)="addReferenceRule()">+ Rule</button></div>
                  <div class="reference-rule-row" *ngFor="let rr of test.reference_ranges; let ri = index; trackBy: trackReferenceRule">
                    <select [(ngModel)]="rr.gender"><option value="ALL">All/Other</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select>
                    <input type="number" [(ngModel)]="rr.age_min" placeholder="Age from">
                    <input type="number" [(ngModel)]="rr.age_max" placeholder="Age to">
                    <select [(ngModel)]="rr.age_unit"><option value="YEARS">Years</option><option value="MONTHS">Months</option><option value="DAYS">Days</option></select>
                    <input type="number" [(ngModel)]="rr.lower_limit" placeholder="Low">
                    <input type="number" [(ngModel)]="rr.upper_limit" placeholder="High">
                    <textarea [(ngModel)]="rr.reference_text" rows="2" placeholder="Reference text"></textarea>
                    <input type="number" [(ngModel)]="rr.critical_low" placeholder="Critical low">
                    <input type="number" [(ngModel)]="rr.critical_high" placeholder="Critical high">
                    <button class="icon-action delete" type="button" title="Remove rule" (click)="removeReferenceRule(ri, $event)">×</button>
                  </div>
                </div>
              </div>
              <div class="test-step-grid" *ngIf="test.reference_mode === 'MALE_FEMALE'">
                <label class="master-field"><span>Male low</span><input type="number" [(ngModel)]="test.male_lower"></label>
                <label class="master-field"><span>Male high</span><input type="number" [(ngModel)]="test.male_upper"></label>
                <div class="master-field wide reference-textarea-field reference-format-field"><span>Male reference text <b class="req" *ngIf="test.active_for_reporting">*</b></span><textarea [(ngModel)]="test.male_reference_text" rows="10" placeholder="Example:
Male: 13.0 - 17.0 g/dL
Critical: below 7.0"></textarea><button class="reference-format-btn" type="button" (click)="formatReferenceText('male_reference_text')">Format / Align Reference</button></div>
                <ng-container *ngIf="test.flag_enabled">
                  <label class="master-field"><span>Male critical low <small>(optional)</small></span><input type="number" [(ngModel)]="test.male_critical_low" placeholder="Critical low"></label>
                  <label class="master-field"><span>Male critical high <small>(optional)</small></span><input type="number" [(ngModel)]="test.male_critical_high" placeholder="Critical high"></label>
                </ng-container>
                <label class="master-field"><span>Female low</span><input type="number" [(ngModel)]="test.female_lower"></label>
                <label class="master-field"><span>Female high</span><input type="number" [(ngModel)]="test.female_upper"></label>
                <div class="master-field wide reference-textarea-field reference-format-field"><span>Female reference text <b class="req" *ngIf="test.active_for_reporting">*</b></span><textarea [(ngModel)]="test.female_reference_text" rows="10" placeholder="Example:
Female: 12.0 - 15.0 g/dL
Pregnancy: 11.0 - 14.0"></textarea><button class="reference-format-btn" type="button" (click)="formatReferenceText('female_reference_text')">Format / Align Reference</button></div>
                <ng-container *ngIf="test.flag_enabled">
                  <label class="master-field"><span>Female critical low <small>(optional)</small></span><input type="number" [(ngModel)]="test.female_critical_low" placeholder="Critical low"></label>
                  <label class="master-field"><span>Female critical high <small>(optional)</small></span><input type="number" [(ngModel)]="test.female_critical_high" placeholder="Critical high"></label>
                  <div class="formula-help output-help">Critical values are optional for each gender. Leave blank if this test only needs normal low/high flags.</div>
                </ng-container>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 4">
              <div class="form-section-title" *ngIf="usesOptions()">Option engine</div>
              <label class="master-field" *ngIf="usesOptions()"><span>Allowed values, one per line <b class="req">*</b></span><textarea [(ngModel)]="test.options_text" placeholder="Nil&#10;Trace&#10;+&#10;++"></textarea></label>
              <div class="empty-inline">Select shows the configured values and also allows a custom typed result.</div>
              <div class="empty-inline" *ngIf="!usesOptions()">Allowed values are configured only for Option and Search Select inputs.</div>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 5">
              <ng-container *ngIf="isCalculatedTest(); else formulaNotNeeded">
                <div class="form-section-title">Formula Builder</div>
                <div class="formula-builder">
                  <div class="predefined-formula-panel">
                    <div>
                      <h4>Predefined formula</h4>
                      <p>Use safe built-in formulas when available. eGFR uses CKD-EPI 2021 with patient gender; any non-female gender uses male logic.</p>
                    </div>
                    <label class="master-field">
                      <span>Template</span>
                      <select [ngModel]="selectedPredefinedFormula" (ngModelChange)="selectPredefinedFormula($event)">
                        <option value="">Manual formula</option>
                        <option *ngFor="let f of predefinedFormulas" [value]="f.key">{{f.label}}</option>
                      </select>
                    </label>
                  </div>

                  <div class="egfr-source-panel" *ngIf="isEgfrTemplateSelected()">
                    <label class="master-field wide">
                      <span>Creatinine source test <b class="req">*</b></span>
                      <select [ngModel]="egfrSourceTestId" (ngModelChange)="setEgfrSourceTest($event)">
                        <option [ngValue]="null">Select creatinine test</option>
                        <option *ngFor="let source of egfrSourceTests()" [ngValue]="source.id">
                          {{source.code || ('T' + source.id)}} - {{source.name}}{{source.unit_name ? ' - ' + source.unit_name : ''}}
                        </option>
                      </select>
                    </label>
                    <div class="formula-help output-help">
                      eGFR will use this exact test as the creatinine dependency. The calculated result remains editable in Report Typing.
                    </div>
                  </div>

                  <label class="master-field formula-expression-field" *ngIf="isPredefinedFormulaSelected(); else manualFormulaExpression">
                    <span>eGFR formula</span>
                    <input [value]="predefinedFormulaDisplayExpression()"
                           readonly
                           class="readonly-formula"
                           aria-label="Read-only eGFR formula">
                  </label>
                  <ng-template #manualFormulaExpression>
                    <label class="master-field formula-expression-field">
                      <span>Formula expression <b class="req">*</b></span>
                      <input [(ngModel)]="test.formula_expression" placeholder="Example: TC - HDL - (TG / 5)">
                    </label>
                  </ng-template>
                  <div class="formula-help output-help" *ngIf="isPredefinedFormulaSelected()">
                    System formula — read only. Only the creatinine source test must be configured.
                  </div>
                  <div class="formula-actions-row" *ngIf="!isPredefinedFormulaSelected()">
                    <button class="formula-chip-action" type="button" (click)="clearFormula()">Clear formula</button>
                    <button class="formula-chip-action" type="button" (click)="removeLastFormulaToken()">Backspace</button>
                  </div>

                  <div class="formula-builder-grid" *ngIf="!isPredefinedFormulaSelected()">
                    <div class="formula-tool-card">
                      <h4>1. Insert test</h4>
                      <p>Search and select a source test. For eGFR, pick Serum Creatinine; it is mapped as SCR.</p>
                      <input class="formula-tool-input" [(ngModel)]="formulaTestQuery" (ngModelChange)="searchFormulaTests()" placeholder="Search test e.g. HDL, Glucose">
                      <div class="formula-test-results" *ngIf="formulaTestResults().length">
                        <button type="button" *ngFor="let t of formulaTestResults()" (click)="insertFormulaTest(t)">
                          <strong>{{t.name}}</strong>
                          <small>{{t.code || ('T' + t.id)}} · {{t.department_name || 'No department'}}</small>
                        </button>
                      </div>
                    </div>

                    <div class="formula-tool-card">
                      <h4>2. Insert constant</h4>
                      <p>Use fixed numbers like 5, 100, 1.73 or 0.8.</p>
                      <div class="constant-row">
                        <input class="formula-tool-input" type="number" step="any" [(ngModel)]="constantFormulaValue" placeholder="Constant">
                        <button class="formula-insert-btn" type="button" (click)="insertFormulaConstant()">Insert</button>
                      </div>
                    </div>

                    <div class="formula-tool-card">
                      <h4>3. Insert symbol</h4>
                      <p>Only these safe symbols/functions are allowed for formulas.</p>
                      <div class="symbol-grid">
                        <button type="button" *ngFor="let s of formulaSymbols" (click)="insertFormulaSymbol(s.value)" [title]="s.label">{{s.value}}</button>
                      </div>
                    </div>
                  </div>

                  <div class="formula-variable-map" *ngIf="(test.formula_variables || []).length">
                    <h4>Selected test variables</h4>
                    <span class="variable-pill" *ngFor="let v of test.formula_variables">{{v.variable_key}} = {{v.test_name}}</span>
                  </div>
                  <div class="formula-help">No unsafe JavaScript eval is used. The report-entry engine can later evaluate only numbers, selected test variables, constants, and allowed symbols.</div>
                </div>
              </ng-container>
              <ng-template #formulaNotNeeded><div class="empty-inline">Formula builder is shown only for calculated tests.</div></ng-template>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 6">
              <div class="form-section-title">Interpretation</div>
              <div class="interpretation-panel">
                <label class="check-pill interpretation-toggle"><input type="checkbox" [(ngModel)]="test.interpretation_enabled"> Interpretation enabled <b class="req" *ngIf="test.interpretation_enabled">*</b></label>
                <ng-container *ngIf="test.interpretation_enabled">
                  <div class="rich-toolbar" aria-label="Interpretation editor toolbar">
                    <div class="toolbar-line formatting-line">
                      <button type="button" [class.active]="activeEditorCommands.bold" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('bold')"><b>B</b></button>
                      <button type="button" [class.active]="activeEditorCommands.italic" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('italic')"><i>I</i></button>
                      <button type="button" [class.active]="activeEditorCommands.underline" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('underline')"><u>U</u></button>
                      <button type="button" [class.active]="activeEditorCommands.unorderedList" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('insertUnorderedList')">• List</button>
                      <button type="button" [class.active]="activeEditorCommands.orderedList" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('insertOrderedList')">1. List</button>
                      <select class="font-size-select" (change)="setInterpretationFontSize($event)">
                        <option value="">Font size</option>
                        <option value="2">Small</option>
                        <option value="3">Normal</option>
                        <option value="4">Large</option>
                        <option value="5">Heading</option>
                      </select>
                      <div class="toolbar-group" aria-label="Text alignment">
                        <button type="button" [class.active]="selectedTextAlign==='left'" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('justifyLeft')">Left</button>
                        <button type="button" [class.active]="selectedTextAlign==='center'" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('justifyCenter')">Center</button>
                        <button type="button" [class.active]="selectedTextAlign==='right'" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('justifyRight')">Right</button>
                        <button type="button" [class.active]="selectedTextAlign==='justify'" (mousedown)="$event.preventDefault()" (click)="formatInterpretation('justifyFull')">Justify</button>
                      </div>
                      <label class="colour-picker-control">Text
                        <input type="color" [(ngModel)]="interpretationTextColour" (change)="setInterpretationColorValue(interpretationTextColour)">
                      </label>
                      <div class="print-colour-palette" aria-label="Print-friendly text colours">
                        <button type="button" *ngFor="let c of printTextColours" [class.active]="isSelectedColour(interpretationTextColour,c.value)" [style.background]="c.value" [title]="c.label" (mousedown)="$event.preventDefault()" (click)="setInterpretationColorValue(c.value)"></button>
                      </div>
                      <label class="colour-picker-control">Highlight
                        <input type="color" [(ngModel)]="interpretationHighlightColour" (change)="setInterpretationBackgroundValue(interpretationHighlightColour)">
                      </label>
                      <div class="print-colour-palette" aria-label="Print-friendly highlight colours">
                        <button type="button" *ngFor="let c of printHighlightColours" [class.active]="isSelectedColour(interpretationHighlightColour,c.value)" [style.background]="c.value" [title]="c.label" (mousedown)="$event.preventDefault()" (click)="setInterpretationBackgroundValue(c.value)"></button>
                      </div>
                      <button type="button" class="clear-editor-btn" (mousedown)="$event.preventDefault()" (click)="clearInterpretation()">Clear</button>
                    </div>

                    <div class="toolbar-line table-line" aria-label="Table controls">
                      <span class="toolbar-section-label">Table</span>
                      <label class="table-size-control">Rows
                        <select [(ngModel)]="interpretationTableRows"><option *ngFor="let n of tableRowOptions" [ngValue]="n">{{n}}</option></select>
                      </label>
                      <label class="table-size-control">Cols
                        <select [(ngModel)]="interpretationTableCols"><option *ngFor="let n of tableColOptions" [ngValue]="n">{{n}}</option></select>
                      </label>
                      <label class="table-size-control">Width
                        <select [(ngModel)]="interpretationTableWidth"><option value="auto">Auto</option><option value="35%">Small</option><option value="50%">Medium</option><option value="75%">Wide</option><option value="100%">Full</option></select>
                      </label>
                      <label class="table-size-control">Align
                        <select [(ngModel)]="interpretationTableAlign"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
                      </label>
                      <label class="table-size-control">Border
                        <select [(ngModel)]="interpretationTableBorder"><option value="full">Full</option><option value="outer">Outer only</option><option value="none">None</option></select>
                      </label>
                      <button type="button" class="insert-table-btn" (mousedown)="$event.preventDefault()" (click)="insertInterpretationTable()">+ Table</button>
                    </div>
                  </div>
                  <div #interpretationEditor class="rich-editor" contenteditable="true" (input)="onInterpretationInput($event)" (keyup)="updateRichToolbarState()" (mouseup)="updateRichToolbarState()" (focus)="updateRichToolbarState()" data-placeholder="Add interpretation text, notes, clinical comments, table, or report guidance..."></div>
                  <p class="editor-help">This saves rich HTML for the test interpretation. It can be printed with report results later.</p>
                </ng-container>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="testMasterStep === 7">
              <div class="form-section-title">Status & Save</div>
              <div class="test-step-grid compact-grid">
                <label class="check-pill"><input type="checkbox" [(ngModel)]="test.allow_manual_override"> Allow manual override</label>
              </div>
              <div class="test-save-summary">
                <strong>{{ test.display_name || test.name || 'New test' }}</strong>
                <span>{{ test.code || 'No code' }} · {{ displayResultType(test) }} · {{ isCalculatedTest() ? 'Calculated' : 'Direct' }}</span>
              </div>
              <div class="validation-summary" *ngIf="validateTest().length">
                <strong>Required before saving</strong>
                <button type="button" *ngFor="let issue of validateTest()" (click)="goToTestStep(issue.step)">{{ issue.label }}</button>
              </div>

              <div class="final-review-card" *ngIf="!validateTest().length">
                <div class="review-header">
                  <div>
                    <strong>{{ testFormMode === 'edit' ? 'Review changes before update' : 'Review test before creation' }}</strong>
                    <span>Grouped by step. Confirm only after checking these details.</span>
                  </div>
                  <span class="review-mode-pill">{{ testFormMode === 'edit' ? 'Edit mode' : 'Create mode' }}</span>
                </div>

                <div class="review-groups">
                  <div class="review-group" *ngFor="let group of testReviewGroups()">
                    <h4>{{group.title}}</h4>
                    <div class="review-row" *ngFor="let row of group.rows"><span>{{row.label}}</span><b>{{row.value}}</b></div>
                  </div>
                </div>

                <div class="change-review" *ngIf="testFormMode === 'edit'">
                  <h4>Changes to apply</h4>
                  <div class="change-table" *ngIf="testChangeRows().length; else noTestChanges">
                    <div class="change-row head"><span>Field</span><span>From</span><span>To</span></div>
                    <div class="change-row" *ngFor="let c of testChangeRows()"><span>{{c.label}}</span><span>{{c.from}}</span><span>{{c.to}}</span></div>
                  </div>
                  <ng-template #noTestChanges><p class="muted-code">No field changes detected.</p></ng-template>

                  <div class="propagation-box">
                    <strong>Apply this update to</strong>
                    <label class="check-pill disabled"><input type="checkbox" checked disabled> Test Master</label>
                    <label class="check-pill"><input type="checkbox" [(ngModel)]="testUpdateTargets.profiles"> Linked Profiles</label>
                    <label class="check-pill"><input type="checkbox" [(ngModel)]="testUpdateTargets.billing"> Existing Billing Items</label>
                    <label class="master-field" *ngIf="testUpdateTargets.profiles"><span>Profile effective date <b class="req">*</b></span><input type="date" [(ngModel)]="testUpdateTargets.profileDate"></label>
                    <label class="master-field" *ngIf="testUpdateTargets.billing"><span>Billing effective date <b class="req">*</b></span><input type="date" [(ngModel)]="testUpdateTargets.billingDate"></label>
                    <p class="editor-help span-all">Profiles use the same test id, so future profile billing/reporting uses the updated master automatically. Billing propagation updates existing bill item names/rates only from the selected date.</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="test-step-actions span-all">
              <button class="action-btn ghost" type="button" (click)="prevTestStep()" [disabled]="testMasterStep === 0">Back</button>
              <button class="action-btn ghost" type="button" (click)="resetTest()">Clear</button>
              <button class="action-btn ghost" type="button" (click)="backToTestList()">Cancel</button>
              <button class="action-btn primary" type="button" *ngIf="testMasterStep < testMasterSteps.length - 1" (click)="nextTestStep()">Next</button>
              <button class="action-btn primary" type="button" *ngIf="testMasterStep === testMasterSteps.length - 1" (click)="saveTest()">{{ testFormMode === 'edit' ? 'Update Test' : 'Save Test' }}</button>
            </div>
          </div>
        </div>
        </ng-template>
      </section>

      <section class="master-panel" *ngIf="activeTab==='equipment'">
        <app-equipment-master (changed)="changed.emit()"></app-equipment-master>
      </section>

      <section class="master-panel" *ngIf="activeTab==='profiles'">
        <div class="panel-heading">
          <div class="panel-heading-left"><div class="panel-icon">◎</div><div><h2>Profile / Group Master</h2><p>Build live-linked profiles using tests, other profiles, and manual report headers.</p></div></div>
          <span class="info-pill">Tests update automatically inside profiles</span>
        </div>

        <ng-container *ngIf="profileMasterView === 'list'; else profileMasterForm">
          <div class="test-list-toolbar profile-list-toolbar">
            <div class="test-list-search">
              <span>Search</span>
              <input [(ngModel)]="profileListSearch" placeholder="Search profile code, name, keywords, side header">
            </div>
            <label class="test-list-filter">
              <span>Status</span>
              <select [(ngModel)]="profileListStatus">
                <option value="ALL">All</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="BILLABLE">Billing active</option>
                <option value="NON_BILLABLE">Billing inactive</option>
                <option value="REPORTING">Reporting active</option>
              </select>
            </label>
            <div class="test-list-actions">
              <button class="action-btn primary" type="button" (click)="openCreateProfile()">+ Create Profile</button>
            </div>
          </div>

          <div class="table-card profile-list-card">
            <table class="masters-table">
              <thead><tr><th>Order</th><th>Billing</th><th>Report</th><th>Profile</th><th>Items</th><th>Ordering</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                <tr *ngFor="let p of filteredProfiles(); trackBy: trackByProfileId" draggable="true" (dragstart)="onProfileDragStart(p)" (dragover)="onProfileDragOver($event)" (drop)="onProfileDrop(p)">
                  <td class="drag-cell"><span class="drag-handle" title="Drag to reorder">⋮⋮</span></td>
                  <td><span class="order-chip">{{p.billing_order || p.priority}}</span></td>
                  <td><span class="order-chip">{{p.report_order || p.priority}}</span></td>
                  <td><strong class="entity-name">{{p.display_name || p.name}}</strong><br><small>{{p.code || 'No code'}} · {{p.name || 'No profile name'}} · {{profileDepartmentName(p)}} · {{profileSummary(p)}}</small></td>
                  <td>{{profileItemCount(p)}}</td>
                  <td>{{p.ordering_mode === 'AUTO' ? 'Auto priority' : 'Manual'}}</td>
                  <td><span class="status-badge" [class.inactive]="!p.billable"><i></i>{{p.billable?'Billing':'No billing'}}</span><span class="status-badge" [class.inactive]="!p.active_for_reporting"><i></i>{{p.active_for_reporting?'Report':'No report'}}</span></td>
                  <td class="row-actions"><button class="icon-action edit" type="button" title="Edit profile" aria-label="Edit profile" (click)="openEditProfile(p)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg></button><button class="icon-action delete" type="button" title="Delete profile" aria-label="Delete profile" (click)="deleteProfile(p)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M6 6l1 15h10l1-15"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg></button></td>
                </tr>
              </tbody>
            </table>
            <div class="table-footer"><span>Total Profiles: <b>{{ filteredProfiles().length }}</b></span><span>Drag rows to update order using safe gaps.</span></div>
          </div>
        </ng-container>

        <ng-template #profileMasterForm>
          <div class="test-form-topbar">
            <button class="action-btn ghost" type="button" (click)="backToProfileList()">← Back to Profile List</button>
            <div><strong>{{ profileFormMode === 'edit' ? 'Edit Profile / Group' : 'Create Profile / Group' }}</strong><span>{{ profile.display_name || profile.name || 'Search and select tests/profiles inside the builder' }}</span></div>
          </div>

          <div class="advanced-test-entry test-stepper-card profile-stepper-card">
            <div class="test-stepper-head profile-stepper-head span-all">
              <button type="button" *ngFor="let step of profileMasterSteps; let i = index" class="test-stepper-step" [class.active]="profileMasterStep === i" [class.done]="i < profileMasterStep" (click)="goToProfileStep(i)">
                <span>{{ i + 1 }}</span>
                <strong>{{ step.title }}</strong>
                <small>{{ step.caption }}</small>
              </button>
            </div>

            <div class="test-step-panel span-all" *ngIf="profileMasterStep === 0">
              <div class="form-section-title">Basic Profile Details</div>
              <div class="test-step-grid profile-basic-grid">
                <label class="master-field"><span>Code <b class="req">*</b></span><input [(ngModel)]="profile.code" (ngModelChange)="onProfileCodeChange($event)" placeholder="Auto from name"></label>
                <label class="master-field"><span>Profile name <b class="req">*</b></span><input [(ngModel)]="profile.name" (ngModelChange)="onProfileNameChange($event)" placeholder="Profile name"></label>
                <label class="master-field"><span>Profile display name <b class="req">*</b></span><input [(ngModel)]="profile.display_name" (ngModelChange)="onProfileDisplayNameChange($event)" placeholder="Auto from profile name"></label>
                <label class="master-field select-field"><span>Department</span><select [(ngModel)]="profile.department_id"><option [ngValue]="0">Mixed</option><option *ngFor="let d of departmentsForSelect(profile.department_id)" [ngValue]="d.id">{{d.name}}{{isDepartmentActive(d) ? '' : ' (inactive)'}}</option></select></label>
                <label class="master-field"><span>Price</span><input type="number" [(ngModel)]="profile.price" placeholder="Price"></label>
                <label class="master-field select-field"><span>Running cost mode</span><select [(ngModel)]="profile.running_cost_mode"><option value="AUTO">Auto from tests</option><option value="MANUAL">Manual profile cost</option></select></label>
                <label class="master-field" *ngIf="profile.running_cost_mode === 'MANUAL'"><span>Profile running cost</span><input type="number" [(ngModel)]="profile.running_cost" placeholder="Manual cost"></label>
                <label class="master-field" *ngIf="profile.running_cost_mode !== 'MANUAL'"><span>Auto running cost</span><input type="number" [ngModel]="profileAutoRunningCost()" disabled placeholder="Auto"></label>
                <label class="master-field wide"><span>Search keywords</span><input [(ngModel)]="profile.search_keywords" placeholder="Auto keywords from code/name/display name"></label>
                <label class="master-field"><span>Billing order</span><input type="number" [(ngModel)]="profile.billing_order" (focus)="openProfileOrderHelper('billing')" (input)="openProfileOrderHelper('billing')" placeholder="Auto"></label>
                <label class="master-field"><span>Report order</span><input type="number" [(ngModel)]="profile.report_order" (focus)="openProfileOrderHelper('report')" (input)="openProfileOrderHelper('report')" placeholder="Auto"></label>
                <label class="master-field"><span>Ordering</span><select [(ngModel)]="profile.ordering_mode"><option value="MANUAL">Manual drag order</option><option value="AUTO">Auto by priority</option></select></label>
                <label class="master-field wide"><span>Profile side header</span><input [(ngModel)]="profile.side_header" placeholder="Optional report side header"></label>
                <div class="basic-status-row span-all">
                  <label class="basic-status-check"><input type="checkbox" [(ngModel)]="profile.active"><span>Active</span></label>
                  <label class="basic-status-check"><input type="checkbox" [(ngModel)]="profile.billable"><span>Active for billing</span></label>
                  <label class="basic-status-check"><input type="checkbox" [(ngModel)]="profile.active_for_reporting"><span>Active for reporting</span></label>
                  <label class="basic-status-check"><input type="checkbox" [(ngModel)]="profile.show_profile_name"><span>Display this profile name in report</span></label><label class="basic-status-check"><input type="checkbox" [(ngModel)]="profile.break_page_after"><span>Break page after profile</span></label>
                </div>
              </div>
              <div class="order-helper profile-order-helper" *ngIf="showProfileOrderHelper()">
                <div class="order-helper-head">
                  <div>
                    <strong>{{ profileFocusedOrderField === 'billing' ? 'Profile billing order helper' : 'Profile report order helper' }}</strong>
                    <p>Click an existing profile order to reuse it, or type a gap value like 1500. Profiles use the same priority suggestion style as tests.</p>
                  </div>
                  <button type="button" class="formula-chip-action" (click)="closeProfileOrderHelper()">Close</button>
                </div>
                <div class="order-helper-list">
                  <button type="button" *ngFor="let item of profileOrderHelperItems()" (click)="applyProfileOrderFromHelper(item)">
                    <span class="order-helper-name">{{item.display_name || item.name}}</span>
                    <span class="order-helper-meta">{{item.code || 'No code'}} · {{profileSummary(item)}}</span>
                    <b>{{ profileFocusedOrderField === 'billing' ? (item.billing_order || item.priority) : (item.report_order || item.priority) }}</b>
                  </button>
                </div>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="profileMasterStep === 1">
              <div class="form-section-title">Profile Layout Builder</div>
              <div class="profile-builder profile-builder-step">
                <div class="builder-title"><h3>Profile layout</h3><span>Search and select tests, nested profiles, or manual side headers. Nothing is shown by default.</span><button class="formula-chip-action" type="button" (click)="autoArrangeProfileItems()">Auto arrange by priority</button></div>
                <div class="profile-search-grid">
                  <div class="profile-search-card">
                    <label class="master-field"><span>Search tests</span><input [(ngModel)]="profileTestSearch" placeholder="Type test code or name to add"></label>
                    <div class="search-select-list" *ngIf="profileTestSearch.trim()">
                      <button type="button" *ngFor="let t of profileTestSearchResults()" (click)="addProfileTest(t); profileTestSearch=''">
                        <strong>{{t.display_name || t.name}}</strong><small>{{t.code || 'No code'}} · {{t.department_name || 'No department'}} · {{t.report_order || t.priority || 0}}</small>
                      </button>
                      <span class="empty-inline" *ngIf="!profileTestSearchResults().length">No matching tests</span>
                    </div>
                  </div>
                  <div class="profile-search-card">
                    <label class="master-field"><span>Search profiles</span><input [(ngModel)]="profileNestedSearch" placeholder="Type profile code or name to add"></label>
                    <div class="search-select-list" *ngIf="profileNestedSearch.trim()">
                      <button type="button" *ngFor="let p of profileSearchResults()" (click)="addProfileProfile(p); profileNestedSearch=''">
                        <strong>{{p.display_name || p.name}}</strong><small>{{p.code || 'No code'}} · {{p.name || 'Profile'}} · {{profileSummary(p)}} · {{p.report_order || p.priority || 0}}</small>
                      </button>
                      <span class="empty-inline" *ngIf="!profileSearchResults().length">No matching profiles</span>
                    </div>
                  </div>
                  <div class="profile-search-card header-card"><span class="search-card-label">Manual header</span><button class="catalog-btn" type="button" (click)="addProfileHeader()">+ Add side header</button></div>
                </div>
                <div class="profile-test-list">
                  <div class="profile-chip profile-chip-head"><strong>Item</strong><span>Order</span><span>Header text</span><span>Display</span><span>Position</span></div>
                  <div class="profile-chip" *ngFor="let item of profileItems(); let i=index" [class.header-row]="item.item_type==='HEADER'" [class.profile-row]="item.item_type==='PROFILE'">
                    <strong>{{profileItemLabel(item)}} <em>{{item.item_type}}</em></strong>
                    <input type="number" [(ngModel)]="item.priority" (change)="reindexProfileItems()" placeholder="Order">
                    <input *ngIf="item.item_type==='HEADER'" [(ngModel)]="item.side_header" placeholder="Header text">
                    <span class="muted-dash" *ngIf="item.item_type!=='HEADER'">—</span>
                    <label class="mini-check" *ngIf="item.item_type==='PROFILE'"><input type="checkbox" [(ngModel)]="item.display_profile_name"> Show profile name</label>
                    <span class="mini-note" *ngIf="item.item_type==='TEST'">Live test details</span>
                    <span class="mini-note header-note" *ngIf="item.item_type==='HEADER'">Prints once at this position</span>
                    <div class="chip-move"><button class="edit-btn" type="button" (click)="moveProfileItem(i,-1)" [disabled]="i===0">↑</button><button class="edit-btn" type="button" (click)="moveProfileItem(i,1)" [disabled]="i===profileItems().length-1">↓</button><button class="remove-btn" type="button" (click)="removeProfileItem(i)">Remove</button></div>
                  </div>
                  <div class="empty-profile-layout" *ngIf="!profileItems().length">Search and add tests/profiles, or add a manual side header.</div>
                </div>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="profileMasterStep === 2">
              <div class="form-section-title">Profile Interpretation</div>
              <div class="interpretation-panel">
                <label class="check-pill interpretation-toggle"><input type="checkbox" [(ngModel)]="profile.interpretation_enabled" (change)="profileInterpretationEditorNeedsSync = true"> Interpretation enabled <b class="req" *ngIf="profile.interpretation_enabled">*</b></label>
                <ng-container *ngIf="profile.interpretation_enabled">
                  <div class="rich-toolbar" aria-label="Profile interpretation editor toolbar">
                    <div class="toolbar-line formatting-line">
                      <button type="button" [class.active]="activeEditorCommands.bold" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('bold')"><b>B</b></button>
                      <button type="button" [class.active]="activeEditorCommands.italic" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('italic')"><i>I</i></button>
                      <button type="button" [class.active]="activeEditorCommands.underline" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('underline')"><u>U</u></button>
                      <button type="button" [class.active]="activeEditorCommands.unorderedList" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('insertUnorderedList')">• List</button>
                      <button type="button" [class.active]="activeEditorCommands.orderedList" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('insertOrderedList')">1. List</button>
                      <select class="font-size-select" (change)="setProfileInterpretationFontSize($event)">
                        <option value="">Font size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">Heading</option>
                      </select>
                      <div class="toolbar-group" aria-label="Text alignment">
                        <button type="button" [class.active]="selectedTextAlign==='left'" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('justifyLeft')">Left</button>
                        <button type="button" [class.active]="selectedTextAlign==='center'" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('justifyCenter')">Center</button>
                        <button type="button" [class.active]="selectedTextAlign==='right'" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('justifyRight')">Right</button>
                        <button type="button" [class.active]="selectedTextAlign==='justify'" (mousedown)="$event.preventDefault()" (click)="formatProfileInterpretation('justifyFull')">Justify</button>
                      </div>
                      <label class="colour-picker-control">Text <input type="color" [(ngModel)]="interpretationTextColour" (change)="setProfileInterpretationColorValue(interpretationTextColour)"></label>
                      <div class="print-colour-palette" aria-label="Print-friendly text colours"><button type="button" *ngFor="let c of printTextColours" [class.active]="isSelectedColour(interpretationTextColour,c.value)" [style.background]="c.value" [title]="c.label" (mousedown)="$event.preventDefault()" (click)="setProfileInterpretationColorValue(c.value)"></button></div>
                      <label class="colour-picker-control">Highlight <input type="color" [(ngModel)]="interpretationHighlightColour" (change)="setProfileInterpretationBackgroundValue(interpretationHighlightColour)"></label>
                      <div class="print-colour-palette" aria-label="Print-friendly highlight colours"><button type="button" *ngFor="let c of printHighlightColours" [class.active]="isSelectedColour(interpretationHighlightColour,c.value)" [style.background]="c.value" [title]="c.label" (mousedown)="$event.preventDefault()" (click)="setProfileInterpretationBackgroundValue(c.value)"></button></div>
                      <button type="button" class="clear-editor-btn" (mousedown)="$event.preventDefault()" (click)="clearProfileInterpretation()">Clear</button>
                    </div>
                    <div class="toolbar-line table-line" aria-label="Table controls">
                      <span class="toolbar-section-label">Table</span>
                      <label class="table-size-control">Rows <select [(ngModel)]="interpretationTableRows"><option *ngFor="let n of tableRowOptions" [ngValue]="n">{{n}}</option></select></label>
                      <label class="table-size-control">Cols <select [(ngModel)]="interpretationTableCols"><option *ngFor="let n of tableColOptions" [ngValue]="n">{{n}}</option></select></label>
                      <label class="table-size-control">Width <select [(ngModel)]="interpretationTableWidth"><option value="auto">Auto</option><option value="35%">Small</option><option value="50%">Medium</option><option value="75%">Wide</option><option value="100%">Full</option></select></label>
                      <label class="table-size-control">Align <select [(ngModel)]="interpretationTableAlign"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                      <label class="table-size-control">Border <select [(ngModel)]="interpretationTableBorder"><option value="full">Full</option><option value="outer">Outer only</option><option value="none">None</option></select></label>
                      <button type="button" class="insert-table-btn" (mousedown)="$event.preventDefault()" (click)="insertProfileInterpretationTable()">+ Table</button>
                    </div>
                  </div>
                  <div #profileInterpretationEditor class="rich-editor" contenteditable="true" (input)="onProfileInterpretationInput($event)" (keyup)="updateRichToolbarState()" (mouseup)="updateRichToolbarState()" (focus)="updateRichToolbarState()" data-placeholder="Add profile interpretation, clinical comments, advice, table, or profile-level note..."></div>
                  <p class="editor-help">This saves rich HTML for the profile interpretation. It follows the same editor behavior as Test Master.</p>
                </ng-container>
              </div>
            </div>

            <div class="test-step-panel span-all" *ngIf="profileMasterStep === 3">
              <div class="form-section-title">Review & Save</div>
              <div class="final-review-card">
                <div class="review-header"><div><strong>{{profile.display_name || profile.name || 'New Profile'}}</strong><span>{{profile.code || 'No code'}} · {{profileDepartmentName(profile)}} · {{profileItemCount(profile)}} items</span></div><span class="review-mode-pill">{{profile.ordering_mode === 'AUTO' ? 'Auto priority' : 'Manual order'}}</span></div>
                <div class="review-groups">
                  <div class="review-group"><h4>Basic</h4><div class="review-row"><span>Name</span><b>{{profile.name || '—'}}</b></div><div class="review-row"><span>Display</span><b>{{profile.display_name || '—'}}</b></div><div class="review-row"><span>Price</span><b>{{profile.price || 0}}</b></div><div class="review-row"><span>Running cost</span><b>{{profileEffectiveRunningCost()}} · {{profile.running_cost_mode === 'MANUAL' ? 'Manual' : 'Auto'}}</b></div></div>
                  <div class="review-group"><h4>Status</h4><div class="review-row"><span>Billing</span><b>{{profile.billable ? 'Active' : 'Inactive'}}</b></div><div class="review-row"><span>Reporting</span><b>{{profile.active_for_reporting ? 'Active' : 'Inactive'}}</b></div><div class="review-row"><span>Interpretation</span><b>{{profile.interpretation_enabled ? 'Enabled' : 'Disabled'}}</b></div></div>
                </div>
                <div class="propagation-box profile-propagation-box" *ngIf="profileFormMode === 'edit'">
                  <strong>Apply this update to</strong>
                  <label class="check-pill disabled"><input type="checkbox" checked disabled> Profile / Group Master</label>
                  <label class="check-pill disabled"><input type="checkbox" checked disabled> Linked Profiles / Groups</label>
                  <label class="check-pill"><input type="checkbox" [(ngModel)]="profileUpdateTargets.billing"> Bills from selected date range</label>
                  <label class="master-field" *ngIf="profileUpdateTargets.billing"><span>Pending bill from date <b class="req">*</b></span><input type="date" [(ngModel)]="profileUpdateTargets.billingFromDate"></label>
                  <label class="master-field" *ngIf="profileUpdateTargets.billing"><span>Pending bill to date <b class="req">*</b></span><input type="date" [(ngModel)]="profileUpdateTargets.billingToDate"></label>
                  <p class="editor-help span-all">Linked profiles use the same profile id, so future billing/reporting uses the updated master automatically. Billing propagation updates only bills in the selected date range; approved and finished reports are not changed.</p>
                </div>
                <div class="form-actions"><button class="action-btn primary" type="button" (click)="saveProfile()">Save Profile</button><button class="action-btn ghost" type="button" (click)="resetProfile()">Clear</button><button class="action-btn ghost" type="button" (click)="backToProfileList()">Cancel</button></div>
              </div>
            </div>

            <div class="test-step-actions span-all">
              <button class="action-btn ghost" type="button" (click)="goToProfileStep(profileMasterStep - 1)" [disabled]="profileMasterStep===0">Previous</button>
              <button class="action-btn primary" type="button" *ngIf="profileMasterStep < profileMasterSteps.length - 1" (click)="goToProfileStep(profileMasterStep + 1)">Next</button>
              <button class="action-btn primary" type="button" *ngIf="profileMasterStep === profileMasterSteps.length - 1" (click)="saveProfile()">Save Profile</button>
            </div>
          </div>
        </ng-template>
      </section>

      <div class="master-dialog-backdrop" *ngIf="masterDialog" (click)="$event.stopPropagation()">
        <div class="master-dialog" [class.danger]="masterDialog.danger" role="dialog" aria-modal="true">
          <div class="master-dialog-icon">{{ masterDialog.icon || '!' }}</div>
          <div class="master-dialog-body">
            <h3>{{ masterDialog.title }}</h3>
            <p *ngFor="let line of masterDialog.lines">{{ line }}</p>
            <div class="master-dialog-details" *ngIf="masterDialog.details?.length">
              <div *ngFor="let d of masterDialog.details">{{ d }}</div>
            </div>
          </div>
          <div class="master-dialog-actions">
            <button *ngFor="let action of masterDialog.actions" type="button" class="action-btn" [class.primary]="action.primary" [class.danger-action]="action.danger" [class.ghost]="!action.primary && !action.danger" (click)="resolveMasterDialog(action.value)">{{ action.label }}</button>
          </div>
        </div>
      </div>

    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    .masters-shell{
      padding:4px 20px 18px;
      color:var(--text);
      --accent:#3b82f6;
      --accent-soft:color-mix(in srgb,var(--accent) 10%,transparent);
      --panel:rgba(15,23,42,.9);
      --row:rgba(15,23,42,.58);
      --input:#0b1220;
      --border:rgba(148,163,184,.18);
      --text:#f8fafc;
      --muted:#94a3b8;
      --danger:#ef4444;
      --shadow:0 14px 40px rgba(0,0,0,.22);
    }
    .masters-tabs{
      display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden;margin:0 0 10px;
      border:1px solid color-mix(in srgb,var(--border) 82%,var(--accent) 10%);border-radius:14px;
      background:color-mix(in srgb,var(--panel) 82%,transparent);box-shadow:var(--shadow);
    }
    .masters-tabs button{
      height:38px;border:0;border-right:1px solid var(--border);background:transparent;color:var(--muted);
      font-size:12px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:8px;
      cursor:pointer;transition:.16s;
    }
    .masters-tabs button:last-child{border-right:0}
    .masters-tabs button:hover{background:var(--accent-soft);color:var(--text)}
    .masters-tabs button.active{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 13%,transparent),color-mix(in srgb,var(--accent) 5%,transparent));color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}
    .tab-ico{font-size:14px}
    .master-panel{
      border:1px solid color-mix(in srgb,var(--border) 82%,var(--accent) 10%);border-radius:20px;
      background:linear-gradient(180deg,color-mix(in srgb,var(--panel) 92%,transparent),color-mix(in srgb,var(--row) 72%,transparent));
      box-shadow:var(--shadow);padding:12px;overflow:hidden;
    }
    .panel-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
    .panel-heading-left{display:flex;align-items:center;gap:10px;min-width:0}
    .panel-icon{width:32px;height:32px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 22%,transparent),color-mix(in srgb,var(--accent) 7%,transparent));color:var(--accent);font-size:15px;font-weight:950;flex:0 0 auto}
    .panel-heading h2{margin:0;font-size:16px;line-height:1.15;font-weight:950;letter-spacing:-.02em}
    .panel-heading p{margin:3px 0 0;color:var(--muted);font-size:12px;font-weight:700}
    .info-pill{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 12px;border-radius:12px;border:1px solid color-mix(in srgb,var(--accent) 40%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--panel));color:color-mix(in srgb,var(--accent) 76%,var(--text));font-size:12px;font-weight:850;white-space:nowrap}
    .entry-card,.profile-builder{border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--row) 62%,transparent);padding:10px;margin-bottom:10px}
    .department-entry{display:grid;grid-template-columns:minmax(240px,1.45fr) minmax(150px,.75fr) minmax(120px,.45fr) auto;gap:10px;align-items:end}
    .department-rename-scope{grid-column:1/-1;align-items:stretch;margin-top:2px}
    .department-rename-scope .check-row{display:flex;flex-wrap:wrap;gap:8px}
    .department-entry .form-actions{grid-column:1/-1;justify-content:flex-end}
    .compact-entry{display:grid;grid-template-columns:minmax(240px,1fr) minmax(130px,.4fr) auto;gap:10px;align-items:end}
    .test-entry,.profile-entry{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:10px;align-items:end}
    .test-entry .wide,.profile-entry .wide{grid-column:span 2}.span-actions{grid-column:span 2}
    .master-field{display:grid;gap:5px;min-width:0}
    .master-field span,.switch-field>span{font-size:12px;font-weight:850;color:var(--text)}
    .req{color:#ef4444;font-weight:950;margin-left:2px}.required-hint{font-size:12px;font-weight:800;color:#ef4444;margin-top:-6px}.timed-master-title{margin-top:16px}.timed-master-grid{border:1px dashed color-mix(in srgb,var(--accent) 35%,var(--border));border-radius:14px;padding:12px;background:color-mix(in srgb,var(--accent) 5%,transparent)}.field-note{font-size:11px;font-weight:850;line-height:1.25}.field-note.error{color:#ef4444}.field-note.success{color:#16a34a}.invalid-control{border-color:#ef4444!important;box-shadow:0 0 0 3px color-mix(in srgb,#ef4444 13%,transparent)!important}
    .master-field input,.master-field select,.profile-chip input{
      height:36px;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);
      background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12.5px;font-weight:650;
      padding:0 12px;outline:0;transition:border-color .15s,box-shadow .15s,background .15s;
    }
    .master-field input::placeholder,.profile-chip input::placeholder{color:var(--muted);opacity:.82}
    .master-field input:focus,.master-field select:focus,.profile-chip input:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .switch-field{display:grid;gap:5px}.switch-line{height:36px;display:flex;align-items:center;gap:9px}.switch-line input{position:absolute;opacity:0;pointer-events:none}
    .switch-visual{position:relative;width:42px;height:22px;border-radius:999px;background:color-mix(in srgb,var(--muted) 28%,transparent);border:1px solid var(--border);transition:.18s}
    .switch-visual::after{content:'';position:absolute;width:18px;height:18px;left:2px;top:1px;border-radius:50%;background:#fff;box-shadow:0 5px 12px rgba(0,0,0,.18);transition:.18s}
    .switch-line input:checked+.switch-visual{background:linear-gradient(135deg,#2563eb,#60a5fa)}.switch-line input:checked+.switch-visual::after{transform:translateX(19px)}.switch-line b{font-size:13px}
    .form-actions{display:flex;align-items:center;gap:10px;justify-content:flex-end}
    .action-btn,.edit-btn,.catalog-btn,.remove-btn{height:34px;border-radius:10px;border:1px solid var(--border);padding:0 15px;color:var(--text);font-size:12px;font-weight:850;background:color-mix(in srgb,var(--row) 74%,transparent);cursor:pointer;transition:.16s}
    .action-btn.primary{border-color:transparent;background:linear-gradient(135deg,#2563eb,#3b82f6);color:#fff;box-shadow:0 10px 20px rgba(37,99,235,.20)}
    .action-btn.ghost:hover,.edit-btn:hover,.catalog-btn:hover{border-color:var(--accent);background:var(--accent-soft);color:var(--accent)}
    .table-card{border:1px solid var(--border);border-radius:16px;overflow:hidden;background:color-mix(in srgb,var(--row) 52%,transparent)}
    .masters-table{width:100%;border-collapse:collapse}.masters-table th{height:34px;text-align:left;padding:0 12px;color:var(--text);font-size:12.5px;font-weight:900;background:color-mix(in srgb,var(--panel) 50%,transparent);border-bottom:1px solid var(--border)}
    .masters-table td{height:36px;padding:0 12px;border-bottom:1px solid var(--border);font-size:12.5px;color:var(--text);vertical-align:middle;line-height:1}
    .masters-table th{vertical-align:middle;line-height:1}
    .masters-table tbody tr{height:36px}
    .masters-table tbody tr:hover{background:color-mix(in srgb,var(--accent) 7%,transparent)}
    .entity-name{font-size:12.8px;letter-spacing:.01em;display:inline-flex;align-items:center;height:24px;line-height:1}
    .order-chip{width:24px;height:24px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 12%,var(--row));font-weight:850;line-height:1;vertical-align:middle}
    .status-badge{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:24px;min-height:24px;border-radius:9px;padding:0 9px;background:color-mix(in srgb,#10b981 16%,transparent);color:#10b981;font-size:12px;font-weight:850;line-height:1;vertical-align:middle}.status-badge i{width:7px;height:7px;border-radius:50%;background:currentColor;box-shadow:0 0 10px currentColor;flex:0 0 auto}.status-badge.inactive{background:color-mix(in srgb,var(--muted) 12%,transparent);color:var(--muted)}
    .edit-btn{height:30px;padding:0 11px;display:inline-flex;align-items:center;justify-content:center;line-height:1;vertical-align:middle}.table-footer{display:flex;align-items:center;justify-content:space-between;padding:9px 12px;color:var(--muted);font-size:12px;font-weight:750}.table-footer b{color:var(--accent)}
    .status-inline-card{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:2px 0 0;border:0;border-radius:0;background:transparent}
    .check-pill{height:36px;border:1px solid var(--border);border-radius:11px;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:12.5px;font-weight:800;background:color-mix(in srgb,var(--input) 68%,transparent)}.check-pill input{width:16px;height:16px;accent-color:#3b82f6}
    .status-inline-card .check-pill{height:28px;border:0;border-radius:0;background:transparent;padding:0;font-size:12.5px;color:var(--text)}
    .basic-status-row{grid-column:1/-1;display:flex;align-items:center;gap:24px;flex-wrap:wrap;padding:8px 0 2px;margin-top:2px;border:0;border-radius:0;background:transparent;box-shadow:none}
    .basic-status-check{height:28px;min-height:28px;display:inline-flex;align-items:center;gap:8px;padding:0;margin:0;border:0;border-radius:0;background:transparent!important;box-shadow:none!important;color:var(--text);font-size:12.5px;font-weight:850;line-height:1;cursor:pointer;white-space:nowrap}
    .basic-status-check input{width:16px;height:16px;margin:0;flex:0 0 auto;accent-color:#3b82f6;cursor:pointer}
    .basic-status-check span{color:var(--text);font-size:12.5px;font-weight:850;line-height:1}
    .basic-status-check:hover span{color:var(--accent)}
    :host-context(body.dark-theme) .basic-status-row,:host-context(body.dark-theme) .basic-status-check,:host-context(body.dark) .basic-status-row,:host-context(body.dark) .basic-status-check{background:transparent!important;border:0!important;box-shadow:none!important}
    :host-context(body.dark-theme) .basic-status-check span,:host-context(body.dark) .basic-status-check span{color:#f8fafc}
    :host-context(body.dark-theme) .basic-status-check:hover span,:host-context(body.dark) .basic-status-check:hover span{color:#60a5fa}
    .profile-stepper-head{grid-template-columns:repeat(4,minmax(0,1fr))}.profile-basic-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.profile-builder-step{padding:0;border:0;background:transparent}.profile-builder h3{margin:0;font-size:15px;font-weight:900}.builder-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px}.builder-title span{color:var(--muted);font-size:12px}.profile-list-toolbar{grid-template-columns:1.35fr .55fr auto}.profile-form-card{margin-bottom:10px}.profile-search-grid{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;align-items:start;margin-bottom:12px}.profile-search-card{border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--row) 50%,transparent);padding:10px;display:grid;gap:8px;min-height:76px}.profile-search-card.header-card{align-content:end;min-width:170px}.search-card-label{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.search-select-list{display:grid;gap:6px;max-height:220px;overflow:auto}.search-select-list button{min-height:40px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);display:grid;gap:2px;text-align:left;padding:7px 10px;cursor:pointer}.search-select-list button:hover{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.search-select-list strong{font-size:12.5px;font-weight:950}.search-select-list small{font-size:11px;color:var(--muted);font-weight:750}.profile-catalogs{display:none}.catalog{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:0}.catalog-btn{height:32px;padding:0 10px;font-size:12px}.catalog-btn.profile-add{border-color:color-mix(in srgb,var(--accent) 42%,var(--border));}.header-add{display:flex;flex-direction:column;gap:6px}.profile-test-list{display:grid;gap:8px}.profile-chip{display:grid;grid-template-columns:minmax(190px,1fr) 78px minmax(150px,1fr) minmax(150px,.8fr) auto;gap:8px;align-items:center;border:1px solid var(--border);border-radius:12px;padding:8px;background:color-mix(in srgb,var(--panel) 60%,transparent)}.profile-chip.profile-chip-head{height:30px;padding:0 8px;border:0;background:transparent;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase}.profile-chip.header-row{border-style:dashed;background:color-mix(in srgb,var(--accent) 8%,transparent)}.profile-chip.profile-row{background:color-mix(in srgb,var(--accent) 5%,var(--panel))}.profile-chip strong{display:flex;align-items:center;gap:8px}.profile-chip strong em{font-style:normal;font-size:10px;font-weight:900;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:2px 6px}.profile-chip input{height:34px}.muted-dash{display:flex;align-items:center;height:34px;color:var(--muted);font-weight:900}.header-note{color:var(--accent)}.mini-check{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:800;color:var(--text)}.mini-check input{width:15px;height:15px;accent-color:var(--accent)}.mini-note{font-size:12px;color:var(--muted);font-weight:800}.chip-move{display:flex;align-items:center;gap:6px}.chip-move .edit-btn{height:30px;padding:0 8px}.remove-btn{height:34px;color:var(--danger)}.empty-profile-layout{border:1px dashed var(--border);border-radius:12px;padding:14px;text-align:center;color:var(--muted);font-size:12.5px;font-weight:800;background:color-mix(in srgb,var(--row) 35%,transparent)}

    .span-all{grid-column:1/-1}.form-section-title{font-size:12px;font-weight:950;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);padding:6px 0 2px;border-bottom:1px solid var(--border)}
    .master-field textarea{min-height:74px;border-radius:10px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12.5px;font-weight:650;padding:10px 12px;outline:0;resize:vertical}
    .master-field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .chip-picker{display:flex;flex-wrap:wrap;gap:8px}.specimen-chip{height:30px;border-radius:999px;border:1px solid var(--border);background:color-mix(in srgb,var(--row) 78%,transparent);color:var(--text);font-size:12px;font-weight:850;padding:0 12px;cursor:pointer}.specimen-chip.selected{background:linear-gradient(135deg,#2563eb,#3b82f6);border-color:transparent;color:#fff;box-shadow:0 8px 16px rgba(37,99,235,.18)}
    .test-list-toolbar{display:grid;grid-template-columns:1.35fr .55fr auto;gap:10px;align-items:end;margin-bottom:10px}.test-list-search,.test-list-filter{display:flex;flex-direction:column;gap:6px}.test-list-search span,.test-list-filter span{font-size:11px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.test-list-search input,.test-list-filter select{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}.test-list-search input:focus,.test-list-filter select:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.test-department-stepper{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 12px;margin-bottom:6px}.test-department-stepper button{height:34px;border-radius:999px;border:1px solid var(--border);background:var(--input);color:var(--muted);font-size:12px;font-weight:900;padding:0 12px;display:inline-flex;align-items:center;gap:8px;cursor:pointer;white-space:nowrap}.test-department-stepper button b{min-width:24px;height:22px;border-radius:999px;background:color-mix(in srgb,var(--accent) 9%,transparent);color:var(--accent);display:inline-flex;align-items:center;justify-content:center;font-size:11px}.test-department-stepper button.active{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--input));color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 9%,transparent)}.test-list-actions{display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}.test-form-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:color-mix(in srgb,var(--card) 86%,transparent)}.test-form-topbar div{display:flex;flex-direction:column;gap:2px;text-align:right}.test-form-topbar strong{font-size:14px;color:var(--text)}.test-form-topbar span{font-size:12px;color:var(--muted);font-weight:700}.department-test-group{margin-bottom:14px}.group-heading{height:38px;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--accent) 8%,var(--card));display:flex;align-items:center;justify-content:space-between;padding:0 14px;margin-bottom:8px}.group-heading strong{font-size:13px;color:var(--text)}.group-heading span{font-size:12px;color:var(--muted);font-weight:800}.test-master-list-table .drag-col{width:92px}.drag-cell{display:flex;align-items:center;gap:8px}.drag-handle{width:24px;height:28px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 11%,transparent);color:var(--accent);cursor:grab;font-weight:900;letter-spacing:-2px}.masters-table tr[draggable="true"]{cursor:grab}.masters-table tr[draggable="true"]:hover{background:color-mix(in srgb,var(--accent) 6%,transparent)}.row-actions{display:flex;align-items:center;gap:7px}.danger-btn{height:30px;padding:0 12px;border-radius:10px;border:1px solid color-mix(in srgb,#ef4444 35%,var(--border));background:color-mix(in srgb,#ef4444 8%,var(--input));color:#ef4444;font-size:12px;font-weight:900;cursor:pointer}.danger-btn:hover{background:color-mix(in srgb,#ef4444 15%,var(--input))}.icon-action{width:30px;height:30px;border-radius:10px;border:1px solid var(--border);background:color-mix(in srgb,var(--input) 86%,transparent);color:var(--muted);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;transition:.16s}.icon-action svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.icon-action.edit:hover{border-color:color-mix(in srgb,var(--accent) 45%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--input));color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 10%,transparent)}.icon-action.delete:hover{border-color:color-mix(in srgb,#ef4444 50%,var(--border));background:color-mix(in srgb,#ef4444 12%,var(--input));color:#ef4444;box-shadow:0 0 0 3px color-mix(in srgb,#ef4444 10%,transparent)}.mini-status-action{height:30px;padding:0 10px;border-radius:10px;border:1px solid color-mix(in srgb,#f59e0b 35%,var(--border));background:color-mix(in srgb,#f59e0b 10%,var(--input));color:#f59e0b;font-size:11px;font-weight:900;cursor:pointer}.mini-status-action:hover{background:color-mix(in srgb,#f59e0b 17%,var(--input))}.mini-status-action.activate{border-color:color-mix(in srgb,#22c55e 42%,var(--border));background:color-mix(in srgb,#22c55e 10%,var(--input));color:#22c55e}.mini-status-action.activate:hover{background:color-mix(in srgb,#22c55e 17%,var(--input))}.status-stepper{margin-bottom:8px}.status-stepper button.active{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 10%,transparent)}@media (max-width:1100px){.test-list-toolbar{grid-template-columns:1fr 1fr}.test-list-actions{justify-content:flex-start}.test-form-topbar{align-items:flex-start;flex-direction:column}.test-form-topbar div{text-align:left}}.inline-add{display:flex;gap:8px}.inline-add input{height:34px;flex:1;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 12px;font-size:12.5px}.formula-help,.empty-inline,.muted-code{color:var(--muted);font-size:12px;font-weight:750}.muted-code{display:block;margin-top:3px}.advanced-test-entry{grid-template-columns:repeat(3,minmax(0,1fr));align-items:end}.test-master-layout{display:grid;gap:14px}


    .test-stepper-card{display:grid;grid-template-columns:1fr;gap:14px;align-items:stretch;margin-bottom:10px}
    .test-stepper-head{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:8px;padding:0;border:0;border-radius:0;background:transparent}
    .test-stepper-step{height:70px;border:1px solid transparent;border-radius:13px;background:transparent;color:var(--muted);display:grid;grid-template-columns:28px 1fr;grid-template-rows:auto auto;gap:1px 8px;align-items:center;text-align:left;padding:9px 10px;cursor:pointer;transition:.18s ease}
    .test-stepper-step span{grid-row:1/3;width:28px;height:28px;border-radius:999px;display:grid;place-items:center;background:color-mix(in srgb,var(--muted) 14%,transparent);color:var(--muted);font-size:12px;font-weight:950}
    .test-stepper-step strong{font-size:12.5px;font-weight:950;color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.test-stepper-step small{font-size:10.5px;font-weight:700;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .test-stepper-step.active{border-color:color-mix(in srgb,var(--accent) 48%,var(--border));background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent);box-shadow:0 10px 24px color-mix(in srgb,var(--accent) 12%,transparent)}
    .test-stepper-step.active span,.test-stepper-step.done span{background:linear-gradient(135deg,var(--accent),#2563eb);color:#fff}.test-stepper-step.done{color:var(--text)}
    .test-step-panel{border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--panel) 78%,transparent);padding:14px;display:grid;gap:12px;min-height:190px}
    .test-step-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}.test-step-grid .wide{grid-column:span 2}.test-step-grid .span-all{grid-column:1/-1}.basic-billing-grid{align-items:start}.basic-billing-grid .select-field,.basic-billing-grid .order-entry-field{margin-top:4px}.compact-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    .test-step-actions{display:flex;justify-content:flex-end;gap:10px;border-top:1px solid var(--border);padding-top:12px}.test-step-actions .action-btn[disabled]{opacity:.45;cursor:not-allowed}.test-save-summary{border:1px solid var(--border);border-radius:14px;padding:12px 14px;background:var(--row);display:grid;gap:4px}.test-save-summary strong{font-size:15px;color:var(--text)}.test-save-summary span{font-size:12px;color:var(--muted);font-weight:750}.validation-summary{margin-top:12px;border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.08);border-radius:14px;padding:12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.validation-summary strong{width:100%;font-size:13px;color:var(--text)}.validation-summary button{border:1px solid rgba(245,158,11,.35);background:rgba(245,158,11,.12);color:var(--text);border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer}

    .final-review-card{border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--row) 58%,transparent);padding:13px;display:grid;gap:12px}.review-header{display:flex;align-items:center;justify-content:space-between;gap:12px}.review-header div{display:grid;gap:3px}.review-header strong{font-size:14px;color:var(--text)}.review-header span{font-size:12px;color:var(--muted);font-weight:750}.review-mode-pill{height:28px;display:inline-flex;align-items:center;border-radius:999px;padding:0 10px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)!important;font-size:12px;font-weight:900}.review-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.review-group{border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--panel) 72%,transparent);padding:10px;display:grid;gap:6px}.review-group h4,.change-review h4{margin:0 0 2px;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.06em;color:var(--accent)}.review-row{display:grid;grid-template-columns:125px 1fr;gap:8px;align-items:center;font-size:12px}.review-row span{color:var(--muted);font-weight:800}.review-row b{color:var(--text);font-weight:900;word-break:break-word}.change-review{border-top:1px solid var(--border);padding-top:12px;display:grid;gap:10px}.change-table{border:1px solid var(--border);border-radius:12px;overflow:hidden}.change-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border-top:1px solid var(--border);font-size:12px}.change-row:first-child{border-top:0}.change-row span{padding:8px 10px;border-left:1px solid var(--border);min-width:0;word-break:break-word}.change-row span:first-child{border-left:0;color:var(--muted);font-weight:900}.change-row.head{background:color-mix(in srgb,var(--accent) 9%,transparent);font-weight:950;color:var(--text)}.propagation-box{border:1px solid var(--border);border-radius:13px;padding:10px;background:color-mix(in srgb,var(--panel) 72%,transparent);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}.propagation-box>strong{grid-column:1/-1;font-size:12.5px;color:var(--text)}.check-pill.disabled{opacity:.75}.propagation-box .span-all{grid-column:1/-1}.profile-propagation-box{margin-top:2px;border-radius:18px;padding:14px;align-items:stretch}.profile-propagation-box>strong{font-size:15px;font-weight:950}.profile-propagation-box .check-pill{height:56px;border-radius:14px;font-size:14px;font-weight:950;padding:0 16px;gap:12px;background:color-mix(in srgb,var(--input) 72%,transparent)}.profile-propagation-box .check-pill input{width:18px;height:18px}.profile-propagation-box .editor-help{font-size:12.5px;line-height:1.45;margin:0}.profile-propagation-box .master-field{min-height:56px;border-radius:14px;background:color-mix(in srgb,var(--input) 72%,transparent)}.profile-propagation-box .master-field input{height:30px}@media (max-width:900px){.review-groups,.propagation-box{grid-template-columns:1fr}.change-row{grid-template-columns:1fr}.change-row span{border-left:0;border-top:1px solid var(--border)}.change-row span:first-child{border-top:0}}

    .formula-builder{border:1px solid var(--border);background:color-mix(in srgb,var(--row) 58%,transparent);border-radius:14px;padding:12px;display:grid;gap:12px}.formula-expression-field input{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:800}.formula-actions-row{display:flex;gap:8px;justify-content:flex-end}.formula-chip-action,.formula-insert-btn{height:30px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:12px;font-weight:850;padding:0 12px;cursor:pointer}.formula-chip-action:hover,.formula-insert-btn:hover{border-color:var(--accent);color:var(--accent)}.formula-builder-grid{display:grid;grid-template-columns:1.2fr .8fr 1fr;gap:12px}.formula-tool-card{border:1px solid var(--border);background:color-mix(in srgb,var(--panel) 72%,transparent);border-radius:13px;padding:12px;display:grid;gap:8px;align-content:start}.formula-tool-card h4,.formula-variable-map h4{margin:0;color:var(--text);font-size:12.5px;font-weight:950}.formula-tool-card p{margin:0;color:var(--muted);font-size:11.5px;font-weight:700;line-height:1.35}.formula-tool-input{height:34px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 11px;font-size:12.5px;font-weight:750;outline:0}.formula-test-results{display:grid;gap:6px;max-height:164px;overflow:auto}.formula-test-results button{border:1px solid var(--border);background:var(--row);border-radius:10px;padding:8px 10px;text-align:left;color:var(--text);cursor:pointer;display:grid;gap:2px}.formula-test-results button:hover{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.formula-test-results small{color:var(--muted);font-size:11px;font-weight:750}.constant-row{display:grid;grid-template-columns:1fr auto;gap:8px}.symbol-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.symbol-grid button{height:32px;border-radius:10px;border:1px solid var(--border);background:var(--input);color:var(--text);font-size:14px;font-weight:950;cursor:pointer}.symbol-grid button:hover{border-color:var(--accent);color:var(--accent)}.reference-rule-panel{border:1px solid var(--border);border-radius:14px;padding:10px;background:color-mix(in srgb,var(--row) 75%,transparent)}.reference-rule-row{display:grid;grid-template-columns:.8fr .7fr .7fr .75fr .7fr .7fr 1.4fr .85fr .85fr 32px;gap:7px;margin-top:8px;align-items:center}.reference-rule-row input,.reference-rule-row select,.reference-rule-row textarea{height:32px;border-radius:9px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:0 8px;font-size:12px;font-weight:750}.reference-rule-row textarea{height:46px;min-height:46px;resize:vertical;line-height:1.35;padding:7px 8px;white-space:pre-wrap}.builder-title.compact{margin-bottom:4px}.formula-variable-map{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.variable-pill{border:1px solid color-mix(in srgb,var(--accent) 32%,var(--border));background:color-mix(in srgb,var(--accent) 10%,var(--row));color:var(--text);border-radius:999px;padding:6px 10px;font-size:12px;font-weight:850}.output-help{align-self:end}.order-helper{border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));background:color-mix(in srgb,var(--accent) 7%,var(--row));border-radius:14px;padding:10px;display:grid;gap:9px}.order-helper-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.order-helper-head strong{font-size:13px;color:var(--text);font-weight:950}.order-helper-head p{margin:2px 0 0;color:var(--muted);font-size:11.5px;font-weight:700}.order-helper-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;max-height:250px;overflow:auto}.order-helper-list button{height:36px;border:1px solid var(--border);border-radius:10px;background:var(--input);color:var(--text);display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;gap:1px 8px;text-align:left;align-items:center;padding:5px 9px;cursor:pointer}.order-helper-list button:hover{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.order-helper-name{font-size:12.2px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.order-helper-meta{font-size:10.8px;color:var(--muted);font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.order-helper-list b{grid-row:1/3;grid-column:2;color:var(--accent);font-size:12px}
    .master-field textarea{width:100%;min-height:74px;border-radius:11px;border:1px solid var(--border);background:var(--input);color:var(--text);padding:9px 11px;font-size:12.5px;font-weight:750;line-height:1.45;outline:0;resize:vertical;white-space:pre-wrap;font-family:inherit}.master-field textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}.reference-textarea-field{align-self:stretch}.reference-textarea-field textarea{min-height:210px}.reference-textarea-field span{align-items:flex-start}.reference-textarea-field textarea::placeholder{color:color-mix(in srgb,var(--muted) 84%,transparent);font-weight:650;white-space:pre-wrap}.reference-format-field{gap:7px}.reference-format-field textarea{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.45}.reference-format-btn{justify-self:flex-start;height:30px;border-radius:10px;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--border));background:color-mix(in srgb,var(--accent) 8%,var(--input));color:var(--accent);font-size:12px;font-weight:900;padding:0 12px;cursor:pointer}.reference-format-btn:hover{background:color-mix(in srgb,var(--accent) 14%,var(--input));box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 10%,transparent)}
    :host-context(body.dark-theme) .masters-shell{--accent:#3b82f6}:host-context(body.dark-theme) .master-panel{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(8,13,24,.94));border-color:rgba(96,165,250,.18);box-shadow:0 18px 48px rgba(0,0,0,.34)}:host-context(body.dark-theme) .masters-tabs{background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(8,13,24,.88));border-color:rgba(96,165,250,.15)}:host-context(body.dark-theme) .entry-card,:host-context(body.dark-theme) .profile-builder,:host-context(body.dark-theme) .table-card{background:rgba(15,23,42,.55);border-color:rgba(148,163,184,.14)}:host-context(body.dark-theme) .master-field input,:host-context(body.dark-theme) .master-field select,:host-context(body.dark-theme) .master-field textarea,:host-context(body.dark-theme) .profile-chip input{background:#0b1220;border-color:rgba(148,163,184,.18);color:#f8fafc;color-scheme:dark}:host-context(body.dark-theme) .masters-table th{background:rgba(15,23,42,.65)}
    :host-context(body.light) .masters-shell{--accent:#2563eb;--panel:#ffffff;--row:#f8fafc;--input:#ffffff;--border:#dbe4f0;--text:#0f172a;--muted:#64748b;--shadow:0 14px 32px rgba(15,23,42,.08)}:host-context(body.light) .master-panel{background:#fff;border-color:#dbe6f6;box-shadow:0 16px 34px rgba(15,23,42,.08)}:host-context(body.light) .masters-tabs{background:#fff;border-color:#dbe6f6}:host-context(body.light) .entry-card,:host-context(body.light) .profile-builder,:host-context(body.light) .table-card{background:#fff;border-color:#e2e8f0}:host-context(body.light) .master-field input,:host-context(body.light) .master-field select,:host-context(body.light) .master-field textarea,:host-context(body.light) .profile-chip input{background:#fff;color:#0f172a;border-color:#cbd5e1;color-scheme:light}:host-context(body.light) .masters-table th{background:#f8fafc}:host-context(body.light) .masters-table td{color:#0f172a}:host-context(body.light) .panel-heading h2,:host-context(body.light) .master-field span,:host-context(body.light) .switch-field>span,:host-context(body.light) .entity-name{color:#0f172a}:host-context(body.light) .action-btn.ghost,:host-context(body.light) .edit-btn,:host-context(body.light) .catalog-btn{background:#f8fafc}:host-context(body.light) .status-inline-card{display:flex;align-items:center;gap:18px;flex-wrap:wrap;padding:2px 0 0;border:0;border-radius:0;background:transparent}
    :host-context(body.light) .check-pill{background:#f8fafc}:host-context(body.light) .status-inline-card .check-pill{background:transparent;border:0}:host-context(body.light) .basic-status-row,:host-context(body.light) .basic-status-check{background:transparent!important;border:0!important;box-shadow:none!important}:host-context(body.light) .basic-status-check span{color:#0f172a}:host-context(body.light) .basic-status-check:hover span{color:#2563eb}:host-context(body.light) .profile-chip{background:#f8fafc}

    .interpretation-panel{display:grid;gap:10px}
    .interpretation-toggle{width:max-content;min-width:220px}
    .rich-toolbar{display:grid;gap:8px;padding:8px;border:1px solid var(--border);border-radius:12px;background:color-mix(in srgb,var(--row) 70%,transparent)}
    .toolbar-line{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.table-line{flex-wrap:nowrap;overflow-x:auto;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--border) 75%,transparent)}
    .toolbar-section-label{height:30px;display:inline-flex;align-items:center;padding:0 10px;border-radius:9px;background:color-mix(in srgb,var(--accent) 10%,transparent);color:var(--accent);font-size:12px;font-weight:950;white-space:nowrap}
    .toolbar-group{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);border-radius:10px;padding:3px;background:color-mix(in srgb,var(--input) 70%,transparent)}
    .rich-toolbar button,.rich-toolbar select{height:30px;border:1px solid var(--border);border-radius:9px;background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12px;font-weight:850;padding:0 10px;outline:0;cursor:pointer}.toolbar-group button{height:24px;border:0;background:transparent;padding:0 8px}.toolbar-group button:hover{background:color-mix(in srgb,var(--accent) 11%,transparent)}
    .rich-toolbar button.active,.toolbar-group button.active{background:color-mix(in srgb,var(--accent) 18%,var(--input));border-color:var(--accent);color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 10%,transparent)}
    .colour-picker-control{height:30px;border:1px solid var(--border);border-radius:9px;background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12px;font-weight:850;padding:0 8px;display:inline-flex;align-items:center;gap:7px;white-space:nowrap}.colour-picker-control input{width:30px;height:22px;border:0;background:transparent;padding:0;cursor:pointer}
    .print-colour-palette{height:30px;display:inline-flex;align-items:center;gap:4px;border:1px solid var(--border);border-radius:9px;padding:0 6px;background:color-mix(in srgb,var(--input) 84%,transparent)}.print-colour-palette button{width:20px;height:20px;border-radius:6px;border:1px solid color-mix(in srgb,var(--border) 70%,#000 10%);padding:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}.print-colour-palette button.active{outline:2px solid var(--accent);outline-offset:2px;box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .table-size-control{height:30px;border:1px solid var(--border);border-radius:9px;background:color-mix(in srgb,var(--input) 84%,transparent);color:var(--text);font-size:12px;font-weight:850;padding:0 8px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}.table-size-control select{height:24px;min-width:54px;border:0;background:transparent;color:var(--text);font-size:12px;font-weight:850;outline:0;padding:0}.insert-table-btn{white-space:nowrap}.clear-editor-btn{margin-left:auto}
    .rich-toolbar button:hover,.rich-toolbar select:focus,.colour-picker-control:focus-within,.table-size-control:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 12%,transparent)}
    .rich-editor{min-height:160px;border:1px solid color-mix(in srgb,var(--border) 72%,var(--text) 8%);border-radius:12px;background:color-mix(in srgb,var(--input) 88%,transparent);color:var(--text);font-size:13px;font-weight:600;line-height:1.55;padding:12px;outline:0;overflow:auto}
    .rich-editor:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 15%,transparent)}
    .rich-editor:empty:before{content:attr(data-placeholder);color:var(--muted);font-weight:700}
    .rich-editor table{border-collapse:collapse;margin:8px 0;max-width:100%}.rich-editor td,.rich-editor th{border:1px solid var(--border);padding:6px 8px}.rich-editor th{background:color-mix(in srgb,var(--accent) 10%,transparent)}
    .editor-help{margin:0;color:var(--muted);font-size:12px;font-weight:700}

    .master-dialog-backdrop{
      position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:24px;
      background:rgba(2,6,23,.58);backdrop-filter:blur(12px);
    }
    .master-dialog{
      width:min(520px,92vw);border-radius:26px;border:1px solid var(--border);
      background:var(--panel);color:var(--text);box-shadow:0 28px 90px rgba(0,0,0,.38);
      padding:22px;display:grid;grid-template-columns:58px 1fr;gap:16px;
      animation:masterPopIn .16s ease-out;
    }
    .master-dialog-icon{
      width:54px;height:54px;border-radius:20px;display:grid;place-items:center;
      background:rgba(245,158,11,.16);border:1px solid rgba(245,158,11,.28);
      color:#f59e0b;font-weight:950;font-size:22px;line-height:1;
    }
    .master-dialog:not(.danger) .master-dialog-icon{background:color-mix(in srgb,var(--accent) 13%,transparent);border-color:color-mix(in srgb,var(--accent) 26%,var(--border));color:var(--accent)}
    .master-dialog.danger .master-dialog-icon{background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.28);color:#ef4444}
    .master-dialog-body h3{margin:0 0 8px;font-size:20px;font-weight:950;letter-spacing:-.02em;color:var(--text)}
    .master-dialog-body p{margin:0;color:var(--muted);font-size:14px;font-weight:650;line-height:1.5}
    .master-dialog-body p+p{margin-top:6px}
    .master-dialog-details{
      margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:16px;
      background:color-mix(in srgb,var(--input) 78%,transparent);display:grid;gap:7px;
      font-size:12.5px;font-weight:750;color:var(--text);max-height:260px;overflow:auto;
    }
    .master-dialog-details div{padding:2px 0;border-bottom:1px dashed color-mix(in srgb,var(--border) 70%,transparent)}
    .master-dialog-details div:last-child{border-bottom:0}
    .master-dialog-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding-top:8px}
    .master-dialog-actions .action-btn{min-width:112px;height:38px;border-radius:12px;font-size:13px}
    .action-btn.danger-action{border-color:rgba(239,68,68,.32);background:rgba(239,68,68,.12);color:#ef4444}
    .action-btn.danger-action:hover{background:rgba(239,68,68,.18)}
    @keyframes masterPopIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}

    @media (max-width:1100px){.test-stepper-head,.profile-stepper-head{grid-template-columns:repeat(4,minmax(0,1fr))}.test-step-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.department-entry,.compact-entry,.test-entry,.profile-entry{grid-template-columns:repeat(2,minmax(0,1fr))}.span-actions,.test-entry .wide,.profile-entry .wide{grid-column:auto}.form-actions{justify-content:flex-start}.masters-table{min-width:720px}.table-card{overflow:auto}}
    @media (max-width:920px){.profile-search-grid,.profile-chip{grid-template-columns:1fr}.profile-chip.profile-chip-head{display:none}.chip-move{justify-content:flex-start}}
    @media (max-width:720px){.masters-shell{padding:12px}.test-stepper-head,.profile-stepper-head,.test-step-grid,.compact-grid,.profile-basic-grid{grid-template-columns:1fr}.test-stepper-step{height:58px}.test-step-actions{justify-content:stretch;flex-wrap:wrap}.test-step-actions .action-btn{flex:1}.masters-tabs{grid-template-columns:1fr 1fr}.panel-heading{align-items:flex-start;flex-direction:column}.department-entry,.compact-entry,.test-entry,.profile-entry,.profile-chip{grid-template-columns:1fr}.info-pill{white-space:normal}.masters-tabs button{height:36px}}
`]
})
export class MastersPageComponent implements OnInit, AfterViewChecked {
  @ViewChild('interpretationEditor') interpretationEditor?: ElementRef<HTMLElement>;
  @ViewChild('profileInterpretationEditor') profileInterpretationEditor?: ElementRef<HTMLElement>;
  activeTab: 'departments' | 'units' | 'tests' | 'profiles' | 'equipment' = 'departments';
  testMasterView: 'list' | 'form' = 'list';
  testFormMode: 'create' | 'edit' = 'create';
  testListSearch = '';
  testListDepartment = '';
  testListState: 'ACTIVE' | 'DEACTIVATED' = 'ACTIVE';
  testListStatus: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'BILLABLE' | 'NON_BILLABLE' = 'ALL';
  testListGroupMode: 'DEPARTMENT' | 'NONE' = 'NONE';
  profileMasterView: 'list' | 'form' = 'list';
  profileFormMode: 'create' | 'edit' = 'create';
  profileListSearch = '';
  profileListStatus: 'ALL' | 'ACTIVE' | 'INACTIVE' | 'BILLABLE' | 'NON_BILLABLE' | 'REPORTING' = 'ALL';
  profileTestSearch = '';
  profileNestedSearch = '';
  draggedTest: any = null;
  draggedDepartment: any = null;
  draggedProfile: any = null;
  originalTestSnapshot: any = null;
  masterDialog: any = null;
  private masterDialogResolver: ((value:any)=>void) | null = null;
  testUpdateTargets = { master: true, profiles: false, billing: false, profileDate: '', billingDate: '' };
  profileUpdateTargets = { master: true, linkedProfiles: true, billing: false, billingFromDate: '', billingToDate: '' };
  @Output() changed = new EventEmitter<void>();
  departments = signal<any[]>([]); units = signal<any[]>([]); tests = signal<any[]>([]); profiles = signal<any[]>([]); specimens = signal<any[]>([]); methods = signal<any[]>([]); formulaTestResults = signal<any[]>([]);
  department:any = { name:'', priority:0, page_break_after:false, active:true };
  departmentOriginalName = '';
  departmentRenameScope = { update_scope: 'future' as 'future' | 'fromDate' | 'all', apply_from: '', update_billing: true, update_reporting: true };
  unit:any = { name:'', active:true };
  dataTypes = [
    { value:'NUMBER', label:'Number' },
    { value:'TEXT', label:'Text' }
  ];
  inputTypes = [
    { value:'TEXTBOX', label:'Textbox' },
    { value:'OPTION', label:'Select' },
    { value:'CALCULATED_EDITABLE', label:'Calculated Editable' }
  ];
  test:any = this.emptyTest();
  testMasterStep = 0;
  private interpretationEditorNeedsSync = false;
  profileInterpretationEditorNeedsSync = false;
  interpretationTableRows = 2;
  interpretationTableCols = 2;
  interpretationTableWidth = '50%';
  interpretationTableAlign: 'left' | 'center' | 'right' = 'center';
  interpretationTableBorder: 'full' | 'outer' | 'none' = 'full';
  interpretationTextColour = '#111827';
  interpretationHighlightColour = '#ffffff';
  activeEditorCommands = { bold:false, italic:false, underline:false, unorderedList:false, orderedList:false };
  selectedTextAlign: 'left' | 'center' | 'right' | 'justify' = 'left';
  tableRowOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  tableColOptions = Array.from({ length: 8 }, (_, i) => i + 1);
  printTextColours = [
    { label: 'Black', value: '#111827' },
    { label: 'Slate', value: '#334155' },
    { label: 'Navy', value: '#1e3a8a' },
    { label: 'Clinical blue', value: '#2563eb' },
    { label: 'Green', value: '#047857' },
    { label: 'Amber brown', value: '#92400e' },
    { label: 'Red', value: '#b91c1c' },
    { label: 'Purple', value: '#6d28d9' }
  ];
  printHighlightColours = [
    { label: 'No highlight', value: '#ffffff' },
    { label: 'Soft yellow', value: '#fef3c7' },
    { label: 'Soft blue', value: '#dbeafe' },
    { label: 'Soft green', value: '#dcfce7' },
    { label: 'Soft red', value: '#fee2e2' },
    { label: 'Soft purple', value: '#ede9fe' },
    { label: 'Light grey', value: '#f1f5f9' }
  ];
  testMasterSteps = [
    { title:'Basic', caption:'Code, name, price' },
    { title:'Result', caption:'Type and output' },
    { title:'Specimen', caption:'Sample mapping' },
    { title:'Reference', caption:'Ranges and flags' },
    { title:'Options', caption:'Selectable values' },
    { title:'Formula', caption:'Calculated tests' },
    { title:'Interpret', caption:'Rich text notes' },
    { title:'Save', caption:'Status and finish' }
  ];
  profileMasterSteps = [
    { title:'Basic', caption:'Name, dept, order' },
    { title:'Layout', caption:'Tests and headers' },
    { title:'Interpret', caption:'Profile notes' },
    { title:'Save', caption:'Review and finish' }
  ];
  profileMasterStep = 0;
  newSpecimenName = '';
  testCodeTouched = false;
  testDisplayNameTouched = false;
  profileCodeTouched = false;
  profileDisplayNameTouched = false;
  formulaTestQuery = '';
  constantFormulaValue: number | string = '';
  selectedPredefinedFormula = '';
  egfrSourceTestId: number | null = null;
  roundingModes = [
    { value:'NO_TRANSFORM', label:'No transformation' },
    { value:'NONE', label:'No rounding' },
    { value:'NEAREST', label:'Round nearest' },
    { value:'UP', label:'Round up' },
    { value:'DOWN', label:'Round down' }
  ];
  numberFormats = [
    { value:'NONE', label:'No comma' },
    { value:'INDIAN', label:'Indian comma: 1,23,456.78' },
    { value:'WESTERN', label:'Western comma: 123,456.78' }
  ];
  outputOperators = [
    { value: '+', label: '+ Add constant' },
    { value: '-', label: '- Subtract constant' },
    { value: '*', label: '* Multiply by constant' },
    { value: '/', label: '/ Divide by constant' }
  ];
  focusedOrderField: 'billing' | 'report' | null = null;
  profileFocusedOrderField: 'billing' | 'report' | null = null;
  predefinedFormulas = [
    {
      key:'EGFR_CKD_EPI_2021',
      label:'eGFR CKD-EPI 2021 - Creatinine',
      expression:'EGFR_CKD_EPI_2021 ( SCR , PATIENT_AGE , PATIENT_GENDER_MALE_DEFAULT )',
      note:'Requires serum creatinine source test in mg/dL. Female uses female coefficient; male and all other genders use male coefficient.'
    }
  ];
  formulaSymbols = [
    { value: '+', label: 'Addition' }, { value: '-', label: 'Subtraction' }, { value: '*', label: 'Multiplication' }, { value: '/', label: 'Division' },
    { value: '(', label: 'Open bracket' }, { value: ')', label: 'Close bracket' }, { value: '.', label: 'Decimal point' }, { value: '^', label: 'Power' },
    { value: ',', label: 'Comma separator' }, { value: 'MIN', label: 'Minimum function' }, { value: 'MAX', label: 'Maximum function' }, { value: 'POW', label: 'Power function' },
    { value: 'SQRT', label: 'Square root' }, { value: 'ABS', label: 'Absolute value' }
  ];
  profile:any = { break_page_after:false, active:true, billable:true, active_for_reporting:true, show_profile_name:true, ordering_mode:'MANUAL', price:0, running_cost:0, running_cost_mode:'AUTO', priority:0, billing_order:0, report_order:0, search_keywords:'', display_name:'', department_id:0, interpretation_enabled:false, interpretation_text:'', items:[] };
  async ngOnInit(){ await this.reload(); }
  ngAfterViewChecked(){ this.syncInterpretationEditorIfNeeded(); this.syncProfileInterpretationEditorIfNeeded(); }
  async reload(){ const api=window.limsApi; this.departments.set(await api.listDepartments()); this.units.set(await api.listUnits()); this.tests.set(await api.listTests()); this.profiles.set(await api.listProfiles()); this.specimens.set(api.listSpecimens ? await api.listSpecimens() : []); this.methods.set(api.listMethods ? await api.listMethods() : []); }
  isDepartmentActive(d:any){ return !(d?.active === false || d?.active === 0 || d?.active === '0'); }
  activeDepartments(){ return this.departments().filter((d:any) => this.isDepartmentActive(d) && String(d?.name || '').trim()); }
  departmentsForSelect(currentId:any){
    const cur = +currentId || 0;
    return this.departments().filter((d:any) => {
      if (!String(d?.name || '').trim() && +d.id !== cur) return false;
      return this.isDepartmentActive(d) || +d.id === cur;
    });
  }
  isDepartmentRenamePending(){
    if (!this.department?.id) return false;
    return String(this.department.name || '').trim().toLowerCase() !== String(this.departmentOriginalName || '').trim().toLowerCase();
  }
  clearDepartmentForm(){
    this.department = { name:'', priority:0, page_break_after:false, active:true };
    this.departmentOriginalName = '';
    this.departmentRenameScope = { update_scope:'future', apply_from:this.todayIso(), update_billing:true, update_reporting:true };
  }
  async saveDepartment(){
    const name = String(this.department?.name || '').trim();
    if (!name) { await this.showMasterAlert('Department name required', 'Enter a department name before saving.'); return; }
    const renaming = this.isDepartmentRenamePending();
    if (renaming && this.departmentRenameScope.update_scope === 'fromDate' && !String(this.departmentRenameScope.apply_from || '').trim()) {
      await this.showMasterAlert('Apply from date required', 'Select Apply from date, or choose Future only / All history.');
      return;
    }
    if (renaming && this.departmentRenameScope.update_scope !== 'future' && !this.departmentRenameScope.update_billing && !this.departmentRenameScope.update_reporting) {
      await this.showMasterAlert('Rename scope required', 'Turn on Billing and/or Reporting prints, or use Future only.');
      return;
    }
    try {
      const payload:any = {
        ...this.department,
        name,
        page_break_after: !!this.department.page_break_after,
        active: this.isDepartmentActive(this.department)
      };
      if (renaming) {
        payload.apply_scope = true;
        payload.update_scope = this.departmentRenameScope.update_scope;
        payload.apply_from = this.departmentRenameScope.apply_from;
        payload.update_billing = this.departmentRenameScope.update_scope !== 'future' && !!this.departmentRenameScope.update_billing;
        payload.update_reporting = this.departmentRenameScope.update_scope !== 'future' && !!this.departmentRenameScope.update_reporting;
      }
      const result:any = await window.limsApi.saveDepartment(payload);
      if (result && !Array.isArray(result) && result.scope) {
        const s = result.scope;
        await this.showMasterAlert(
          'Department updated',
          `Name saved${renaming ? ` (“${result.old_name}” → “${result.name}”)` : ''}. Billing rows updated: ${s.billing || 0}. Reporting rows updated: ${s.reporting || 0}.`
        );
      }
      this.clearDepartmentForm();
      await this.reload();
      this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Department save failed', String(err?.message || err || 'Could not save department.').replace(/^Error:\s*/i, ''));
    }
  }
  async deactivateDepartment(d:any){
    const ok = await this.showMasterConfirm(
      'Deactivate department?',
      [`Deactivate "${d.name || 'Department'}"?`, 'Existing tests/profiles/history stay as-is. It will not appear for new assignment.'],
      'Deactivate',
      true
    );
    if(!ok) return;
    try {
      await window.limsApi.saveDepartment({ ...d, active:false, page_break_after:!!d.page_break_after });
      await this.reload(); this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Deactivate failed', String(err?.message || err || 'Could not deactivate.').replace(/^Error:\s*/i, ''));
    }
  }
  async activateDepartment(d:any){
    try {
      await window.limsApi.saveDepartment({ ...d, active:true, page_break_after:!!d.page_break_after });
      await this.reload(); this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Activate failed', String(err?.message || err || 'Could not activate.').replace(/^Error:\s*/i, ''));
    }
  }
  async deleteDepartment(d:any){
    const ok = await this.showMasterConfirm(
      'Delete department?',
      [`Delete "${d.name || '(unnamed)'}"?`, 'Allowed only when unused on tests, profiles, bills, or reports.', 'If already used, deactivate it instead.'],
      'Delete',
      true
    );
    if(!ok) return;
    try {
      if(!window.limsApi.deleteDepartment) throw new Error('Delete API is not available. Restart the app.');
      await window.limsApi.deleteDepartment(d.id);
      if(+this.department?.id === +d.id) this.clearDepartmentForm();
      await this.reload(); this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Department in use', String(err?.message || err || 'This department could not be deleted.').replace(/^Error:\s*/i, ''));
    }
  }
  async saveUnit(){ await window.limsApi.saveUnit(this.unit); this.unit={name:'',active:true}; await this.reload(); this.changed.emit(); }
  onTestCodeChange(value:string){ this.testCodeTouched = true; this.test.code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); }
  onDisplayNameChange(value:string){ this.testDisplayNameTouched = true; this.test.display_name = value || ''; }
  onTestNameChange(value:string){
    this.test.name = value || '';
    if(!this.testDisplayNameTouched || !this.test.display_name) this.test.display_name = this.test.name;
    if(!this.testCodeTouched || !this.test.code) this.test.code = this.suggestTestCode(this.test.name);
  }
  suggestTestCode(name:string){
    const raw = String(name || '').trim();
    if(!raw) return '';
    const normal = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const common:any = {
      'HEMOGLOBIN':'HB','HAEMOGLOBIN':'HB','COMPLETE BLOOD COUNT':'CBC','CBC':'CBC','ESR':'ESR',
      'GLUCOSE':'GLU','BLOOD SUGAR':'BS','FASTING BLOOD SUGAR':'FBS','POST PRANDIAL BLOOD SUGAR':'PPBS',
      'SERUM CREATININE':'SCR','CREATININE':'CRE','UREA':'UREA','RENAL FUNCTION TEST':'RFT',
      'LIVER FUNCTION TEST':'LFT','LIPID PROFILE':'LIPID','TOTAL CHOLESTEROL':'TCH','TRIGLYCERIDES':'TG',
      'HDL CHOLESTEROL':'HDL','LDL CHOLESTEROL':'LDL','VLDL CHOLESTEROL':'VLDL','THYROID STIMULATING HORMONE':'TSH'
    };
    if(common[normal]) return common[normal];
    const words = normal.split(' ').filter(w => w && !['SERUM','BLOOD','PLASMA','URINE','TEST','TOTAL','THE','OF','AND'].includes(w));
    if(words.length >= 3) return words.slice(0, 4).map(w => w[0]).join('').slice(0, 8);
    if(words.length === 2) return (words[0][0] + words[1].slice(0, 2)).slice(0, 8);
    const word = (words[0] || normal.split(' ')[0] || '').replace(/[^A-Z0-9]/g, '');
    const consonants = word.replace(/[AEIOU]/g, '');
    return (consonants.length >= 3 ? consonants.slice(0, 3) : word.slice(0, 4)).slice(0, 8);
  }
  validateTest(){
    const issues:any[] = [];
    const add = (step:number, label:string) => issues.push({ step, label });
    const duplicateCode = this.isDuplicateTestCode();
    const reportingActive = this.test.active_for_reporting !== false && this.test.active_for_reporting !== 0;

    if(!String(this.test.code || '').trim()) add(0, 'Basic: Code is required');
    if(!String(this.test.name || '').trim()) add(0, 'Basic: Test name is required');
    if(duplicateCode) add(0, 'Basic: Test code must be unique');
    if(this.test.price === undefined || this.test.price === null || this.test.price === '' || Number(this.test.price) < 0) add(0, 'Basic: Price must be zero or more');

    if(!reportingActive) return issues;

    if(!String(this.test.display_name || '').trim()) add(0, 'Basic: Report name is required');
    if(!this.test.department_id) add(0, 'Basic: Department is required');
    if(!this.test.unit_id) add(0, 'Basic: Unit is required');
    if(!this.test.result_data_type) add(1, 'Result: Data type is required');
    if(!this.test.input_control_type) add(1, 'Result: Input field type is required');
    if(!this.test.result_mode) add(1, 'Result: Result mode is required');
    if(!String(this.test.method || '').trim()) add(1, 'Result: Method is required');
    if(this.isNumberLikeTest()){
      if(this.test.decimal_places === undefined || this.test.decimal_places === null || this.test.decimal_places === '') add(1, 'Result: Decimal digits are required');
      if(!this.test.rounding_mode) add(1, 'Result: Round-off mode is required');
      if(!this.test.number_format) add(1, 'Result: Number format is required');
      if(!this.test.output_operator) add(1, 'Result: Output operator is required');
      if(this.test.output_constant === undefined || this.test.output_constant === null || this.test.output_constant === '') add(1, 'Result: Output constant is required');
    }
    if(!(this.test.specimen_ids || []).length) add(2, 'Specimen: At least one specimen is required');
    if(this.test.reference_mode === 'MALE_FEMALE'){
      if(!String(this.test.male_reference_text || '').trim()) add(3, 'Reference: Male reference text is required');
      if(!String(this.test.female_reference_text || '').trim()) add(3, 'Reference: Female reference text is required');
    } else if(!String(this.test.reference_text || this.test.normal_range || '').trim()) add(3, 'Reference: Reference text is required');
    if(this.usesOptions() && !String(this.test.options_text || '').split('\n').some(x => x.trim())) add(4, 'Options: At least one option is required');
    if(this.isCalculatedTest()){
      const predefinedKey = String(this.test.predefined_formula_key || '').trim().toUpperCase();
      const isPredefined = !!predefinedKey;
      if(!isPredefined && !String(this.test.formula_expression || '').trim()) add(5, 'Formula: Formula expression is required');
      if(!isPredefined && !(this.test.formula_variables || []).length) add(5, 'Formula: Select at least one source test variable');
      if(predefinedKey === 'EGFR_CKD_EPI_2021' && !+(this.test.formula_variables || []).find((v:any)=>String(v.variable_key || '').trim().toUpperCase() === 'SCR')?.source_test_id) add(5, 'Formula: Select the creatinine source test for eGFR');
    }
    if(this.test.interpretation_enabled && !String(this.test.interpretation_text || '').replace(/<[^>]*>/g, '').trim()) add(6, 'Interpretation: Text is required when enabled');
    return issues;
  }
  firstInvalidStep(){ return this.validateTest()[0]?.step ?? -1; }
  private showMasterDialog(config:any): Promise<any> {
    return new Promise(resolve => {
      this.masterDialogResolver = resolve;
      this.masterDialog = {
        icon: config.icon || '!',
        title: config.title || 'Confirm action',
        lines: Array.isArray(config.lines) ? config.lines : [config.message || ''],
        details: config.details || [],
        danger: !!config.danger,
        cancelValue: config.cancelValue ?? false,
        actions: config.actions || [
          { label: 'Cancel', value: false },
          { label: config.confirmLabel || 'Confirm', value: true, primary: true, danger: !!config.danger }
        ]
      };
    });
  }
  resolveMasterDialog(value:any){
    const resolver = this.masterDialogResolver;
    this.masterDialog = null;
    this.masterDialogResolver = null;
    if(resolver) resolver(value);
  }
  async showMasterAlert(title:string, message:string){
    await this.showMasterDialog({
      icon: 'i',
      title,
      lines: [message],
      cancelValue: true,
      actions: [{ label: 'OK', value: true, primary: true }]
    });
  }
  showMasterConfirm(title:string, lines:string[], confirmLabel='Confirm', danger=false, details:string[]=[]): Promise<boolean>{
    return this.showMasterDialog({
      icon: danger ? '!' : '?',
      title,
      lines,
      details,
      danger,
      cancelValue: false,
      actions: [
        { label: 'Cancel', value: false },
        { label: confirmLabel, value: true, primary: !danger, danger }
      ]
    });
  }
  showTestPrintModeDialog(): Promise<'GROUPED' | 'FLAT' | null>{
    return this.showMasterDialog({
      icon: '⎙',
      title: 'Print tests',
      lines: ['Choose how the Test list should be printed.'],
      cancelValue: null,
      actions: [
        { label: 'Cancel', value: null },
        { label: 'Single list', value: 'FLAT' },
        { label: 'Department-wise', value: 'GROUPED', primary: true }
      ]
    });
  }
  async saveTest(){
    // Always pull the current contenteditable HTML before validation and save.
    // Keep interpretation_enabled controlled only by the Test Master checkbox.
    this.updateInterpretationFromEditor();
    this.test.interpretation_text = this.normalizeRichInterpretationHtml(this.test.interpretation_text || '');
    const issues = this.validateTest();
    if(issues.length){
      this.goToTestStep(issues[0].step);
      await this.showMasterAlert('Required fields missing', 'Please complete required Test Master fields before saving.');
      return;
    }
    if(this.testFormMode === 'edit'){
      if(this.testUpdateTargets.profiles && !this.testUpdateTargets.profileDate){
        await this.showMasterAlert('Profile effective date required', 'Select profile effective date before updating linked profiles.');
        return;
      }
      if(this.testUpdateTargets.billing && !this.testUpdateTargets.billingDate){
        await this.showMasterAlert('Billing effective date required', 'Select billing effective date before updating existing billing items.');
        return;
      }
    }
    const details = this.buildFinalConfirmationText().split('\n').map(x => x.trim()).filter(Boolean);
    const confirmed = await this.showMasterConfirm(
      this.testFormMode === 'edit' ? 'Update test?' : 'Create test?',
      [this.testFormMode === 'edit' ? 'Review the changes before updating this test.' : 'Review the summary before creating this test.'],
      this.testFormMode === 'edit' ? 'Update Test' : 'Create Test',
      false,
      details
    );
    if(!confirmed) return;
    this.updateInterpretationFromEditor();
    this.test.interpretation_text = this.normalizeRichInterpretationHtml(this.test.interpretation_text || '');
    if(!+this.test.report_order) this.test.report_order = 0;
    if(!+this.test.billing_order) this.test.billing_order = 0;
    const normalizedOptionRows = String(this.test.options_text || '')
      .split('\n')
      .map((x:string, i:number) => {
        const text = x.trim();
        return text ? { option_value: text, option_label: text, display_order: (i + 1) * 1000, is_active: 1 } : null;
      })
      .filter(Boolean);
    const payload = {
      ...this.test,
      options: normalizedOptionRows,
      update_targets: { ...this.testUpdateTargets },
      changed_fields: this.testChangeRows()
    };
    await window.limsApi.saveTest(payload);
    await this.reload();
    this.changed.emit();
    await this.backToTestList(true);
  }
  referenceCriticalSummary(){
    if(this.test.reference_mode === 'MALE_FEMALE') {
      const m = `M: ${this.test.male_critical_low ?? '-'} / ${this.test.male_critical_high ?? '-'}`;
      const f = `F: ${this.test.female_critical_low ?? '-'} / ${this.test.female_critical_high ?? '-'}`;
      return `${m}; ${f}`;
    }
    return `${this.test.critical_low ?? '-'} / ${this.test.critical_high ?? '-'}`;
  }
  testReviewGroups(){
    const dept = this.departments().find((d:any)=>+d.id===+this.test.department_id)?.name || '-';
    const unit = this.units().find((u:any)=>+u.id===+this.test.unit_id)?.name || '-';
    const specimenNames = (this.test.specimen_ids || []).map((id:any)=>this.specimens().find((s:any)=>+s.id===+id)?.name).filter(Boolean).join(', ') || '-';
    const collectionRuleLabel = this.collectionRuleLabel(this.test.collection_rule);
    const optionCount = String(this.test.options_text || '').split('\n').filter((x:string)=>x.trim()).length;
    return [
      { title:'Basic', rows:[
        { label:'Code', value:this.test.code || '-' }, { label:'Test name', value:this.test.name || '-' }, { label:'Report name', value:this.test.display_name || '-' },
        { label:'Department', value:dept }, { label:'Unit', value:unit }, { label:'Price', value:`₹${this.test.price || 0}` }, { label:'Test cost', value:`₹${this.test.running_cost || 0}` },
        { label:'Billing order', value:this.test.billing_order || 'Auto' }, { label:'Report order', value:this.test.report_order || '-' }, { label:'Highlight parameter', value:this.test.highlight_parameter ? 'Yes' : 'No' }
      ]},
      { title:'Result', rows:[
        { label:'Data type', value:this.test.result_data_type || '-' }, { label:'Input field', value:this.test.input_control_type || '-' }, { label:'Mode', value:this.test.result_mode || '-' },
        { label:'Method', value:this.test.method || '-' }, { label:'Decimals', value:String(this.test.decimal_places ?? '-') }, { label:'Round-off', value:this.test.rounding_mode || '-' },
        { label:'Comma format', value:this.test.number_format || '-' }, { label:'Output', value:`${this.test.output_operator || '+'} ${this.test.output_constant ?? 0}` }
      ]},
      { title:'Specimen & Reference', rows:[
        { label:'Specimens', value:specimenNames }, { label:'Reference mode', value:this.test.reference_mode || '-' },
        { label:'Reference text', value:this.test.reference_mode === 'MALE_FEMALE' ? `M: ${this.test.male_reference_text || '-'} / F: ${this.test.female_reference_text || '-'}` : (this.test.reference_text || this.test.normal_range || '-') },
        { label:'Critical limits', value:this.test.flag_enabled ? this.referenceCriticalSummary() : 'Flags disabled' },
        { label:'Flags', value:this.test.flag_enabled ? 'Enabled' : 'Disabled' }
      ]},
      { title:'Conditional', rows:[
        { label:'Options', value:this.usesOptions() ? `${optionCount} option(s)` : 'Not used' },
        { label:'Formula', value:this.isCalculatedTest() ? (this.test.formula_expression || '-') : 'Not used' },
        { label:'Interpretation', value:this.test.interpretation_enabled ? 'Enabled' : 'Disabled' },
        { label:'Status', value:`${this.test.active ? 'Active' : 'Inactive'} / ${this.test.billable ? 'Billing active' : 'No billing'} / ${this.test.active_for_reporting === false ? 'No reporting' : 'Reporting active'}` }
      ]}
    ];
  }
  cloneComparableTest(t:any){
    const copy:any = {};
    this.comparableTestFields().forEach(f => copy[f.key] = this.comparableValue(t?.[f.key]));
    return copy;
  }
  comparableTestFields(){
    return [
      { key:'code', label:'Code' }, { key:'name', label:'Test name' }, { key:'display_name', label:'Report name' }, { key:'department_id', label:'Department' }, { key:'unit_id', label:'Unit' },
      { key:'price', label:'Price' }, { key:'running_cost', label:'Test cost' }, { key:'billing_order', label:'Billing order' }, { key:'report_order', label:'Report order' }, { key:'search_keywords', label:'Search keywords' },
      { key:'result_data_type', label:'Data type' }, { key:'input_control_type', label:'Input field' }, { key:'result_mode', label:'Result mode' }, { key:'method', label:'Method' },
      { key:'decimal_places', label:'Decimal digits' }, { key:'rounding_mode', label:'Round-off' }, { key:'number_format', label:'Comma format' }, { key:'output_operator', label:'Output operator' }, { key:'output_constant', label:'Output constant' },
      { key:'reference_mode', label:'Reference mode' }, { key:'reference_text', label:'Reference text' }, { key:'critical_low', label:'Critical low' }, { key:'critical_high', label:'Critical high' }, { key:'male_reference_text', label:'Male reference text' }, { key:'male_critical_low', label:'Male critical low' }, { key:'male_critical_high', label:'Male critical high' }, { key:'female_reference_text', label:'Female reference text' }, { key:'female_critical_low', label:'Female critical low' }, { key:'female_critical_high', label:'Female critical high' },
      { key:'options_text', label:'Options' }, { key:'formula_expression', label:'Formula' }, { key:'interpretation_enabled', label:'Interpretation enabled' }, { key:'highlight_parameter', label:'Highlight parameter' }, { key:'active', label:'Active' }, { key:'billable', label:'Active for billing' }, { key:'active_for_reporting', label:'Active for reporting' }
    ];
  }
  comparableValue(value:any){
    if(value === undefined || value === null) return '';
    if(typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value).trim();
  }
  humanValue(key:string, value:any){
    if(key === 'department_id') return this.departments().find((d:any)=>+d.id===+value)?.name || '-';
    if(key === 'unit_id') return this.units().find((u:any)=>+u.id===+value)?.name || '-';
    if(value === undefined || value === null || value === '') return '-';
    if(typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
  }
  testChangeRows(){
    if(this.testFormMode !== 'edit' || !this.originalTestSnapshot) return [];
    return this.comparableTestFields().map(f => {
      const before = this.originalTestSnapshot[f.key] ?? '';
      const after = this.comparableValue(this.test[f.key]);
      return before !== after ? { label:f.label, from:this.humanValue(f.key, before), to:this.humanValue(f.key, after) } : null;
    }).filter(Boolean) as any[];
  }
  buildFinalConfirmationText(){
    const title = this.testFormMode === 'edit' ? 'Confirm Test Update' : 'Confirm Test Creation';
    const base = `${title}\n\n${this.test.code || '-'} - ${this.test.display_name || this.test.name || '-'}\nDepartment: ${this.departments().find((d:any)=>+d.id===+this.test.department_id)?.name || '-'}\nResult: ${this.displayResultType(this.test)}\n`;
    if(this.testFormMode !== 'edit') return `${base}\nCreate this test master?`;
    const changes = this.testChangeRows();
    const changeText = changes.length ? changes.map((c:any)=>`- ${c.label}: ${c.from} -> ${c.to}`).join('\n') : 'No field changes detected.';
    const targets = [`Test Master`];
    if(this.testUpdateTargets.profiles) targets.push(`Linked Profiles from ${this.testUpdateTargets.profileDate}`);
    if(this.testUpdateTargets.billing) targets.push(`Existing Billing Items from ${this.testUpdateTargets.billingDate}`);
    return `${base}\nChanges:\n${changeText}\n\nApply to:\n- ${targets.join('\n- ')}\n\nUpdate this test master?`;
  }
  todayIso(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  collectionRuleLabel(v:any){ const x=String(v||'NORMAL').toUpperCase(); return x==='FASTING'?'Fasting':x==='POST_PRANDIAL'?'Post-prandial':x==='TIMED_INTERVAL'?'Timed interval':'Normal'; }
  emptyTest(){ return { active:true, billable:true, active_for_reporting:true, highlight_parameter:false, start_new_page:false, price:0, running_cost:0, commission_allowed:true, priority:0, display_name:'', result_data_type:'NUMBER', input_control_type:'TEXTBOX', result_mode:'DIRECT', reference_mode:'SINGLE', flag_enabled:true, ref_lower:null, ref_upper:null, critical_low:null, critical_high:null, male_lower:null, male_upper:null, male_critical_low:null, male_critical_high:null, female_lower:null, female_upper:null, female_critical_low:null, female_critical_high:null, specimen_ids:[], options_text:'', formula_expression:'', formula_variables:[], allow_manual_override:false, decimal_places:2, rounding_mode:'NEAREST', number_format:'NONE', predefined_formula_key:'', output_operator:'+', output_constant:0, interpretation_enabled:false, interpretation_text:'', collection_rule:'NORMAL', fasting_hours:8, collection_gap_minutes:120, collection_dependency:'NONE', same_specimen_allowed:true, collection_instruction:'', reference_ranges:[] }; }
  resetTest(){ this.test=this.emptyTest(); this.testCodeTouched = false; this.testDisplayNameTouched = false; this.testMasterStep = 0; this.closeOrderHelper(); this.formulaTestResults.set([]); this.formulaTestQuery=''; this.constantFormulaValue=''; this.selectedPredefinedFormula=''; this.egfrSourceTestId=null; this.interpretationEditorNeedsSync = true; }
  goToTestStep(index:number){ this.testMasterStep = Math.max(0, Math.min(index, this.testMasterSteps.length - 1)); if(this.testMasterStep === 6) this.interpretationEditorNeedsSync = true; }
  nextTestStep(){ this.goToTestStep(this.testMasterStep + 1); }
  prevTestStep(){ this.goToTestStep(this.testMasterStep - 1); }
  syncInputTypeForDataType(){
    const map:any = { NUMBER:'TEXTBOX', TEXT:'TEXTBOX' };
    if (!['TEXTBOX','OPTION','CALCULATED_EDITABLE'].includes(this.test.input_control_type)) this.test.input_control_type = map[this.test.result_data_type] || 'TEXTBOX';
    if (this.test.input_control_type === 'CALCULATED_EDITABLE') {
      this.test.result_mode = 'CALCULATED';
      this.test.allow_manual_override = true;
    }
  }
  addReferenceRule(){
    if(!Array.isArray(this.test.reference_ranges)) this.test.reference_ranges = [];
    this.test.reference_ranges.push({gender:'ALL', age_min:null, age_max:null, age_unit:'YEARS', lower_limit:null, upper_limit:null, reference_text:'', flag_enabled:true, critical_low:null, critical_high:null, is_active:true, display_order:(this.test.reference_ranges.length + 1) * 1000});
  }
  trackReferenceRule(index:number, rr:any){ return rr?.id || rr?._uiKey || `${rr?.gender || 'ALL'}-${rr?.age_min ?? ''}-${rr?.age_max ?? ''}-${index}`; }
  private isPlainAllReferenceRule(r:any){
    return String(r?.gender || 'ALL').toUpperCase() === 'ALL'
      && (r?.age_min === null || r?.age_min === undefined || r?.age_min === '')
      && (r?.age_max === null || r?.age_max === undefined || r?.age_max === '');
  }
  removeReferenceRule(index:number, event?:Event){
    event?.preventDefault();
    event?.stopPropagation();
    const rows = Array.isArray(this.test.reference_ranges) ? [...this.test.reference_ranges] : [];
    if(index < 0 || index >= rows.length) return;
    rows.splice(index, 1);
    this.test.reference_ranges = rows;
  }
  formatReferenceText(field: 'reference_text' | 'male_reference_text' | 'female_reference_text'){
    const raw = String(this.test?.[field] || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = raw.split('\n');
    const parsed = lines.map(line => {
      const idx = line.indexOf(':');
      if(idx < 0) return { raw: line, hasColon: false, label: '', value: '' };
      return {
        raw: line,
        hasColon: true,
        label: line.slice(0, idx).trim(),
        value: line.slice(idx + 1).trim()
      };
    });
    const maxLabel = parsed.reduce((max, line) => line.hasColon ? Math.max(max, line.label.length) : max, 0);
    this.test[field] = parsed.map(line => {
      if(!line.hasColon) return line.raw;
      if(!line.label && !line.value) return '';
      return `${line.label.padEnd(maxLabel, ' ')} : ${line.value}`.trimEnd();
    }).join('\n');
  }
  isCalculatedTest(){ return this.test.result_mode === 'CALCULATED' || this.test.input_control_type === 'CALCULATED_EDITABLE'; }
  isNumberLikeTest(){ return this.test.result_data_type === 'NUMBER' || this.test.result_mode === 'CALCULATED' || this.test.input_control_type === 'CALCULATED_EDITABLE'; }
  openOrderHelper(field: 'billing' | 'report'){ this.focusedOrderField = field; }
  closeOrderHelper(){ this.focusedOrderField = null; }
  showOrderHelper(){ return !!this.focusedOrderField && (this.test.billing_order !== undefined || this.test.report_order !== undefined); }
  orderHelperTests(){
    const dept = this.test.department_id ? +this.test.department_id : null;
    const ownId = +this.test.id || 0;
    const orderKey = this.focusedOrderField === 'billing' ? 'billing_order' : 'report_order';
    return this.tests()
      .filter(t => +t.id !== ownId && (!dept || +t.department_id === dept))
      .sort((a:any,b:any) => (+a[orderKey] || +a.priority || 0) - (+b[orderKey] || +b.priority || 0) || String(a.name||'').localeCompare(String(b.name||'')))
      .slice(0, 50);
  }
  applyOrderFromHelper(item:any){
    const value = this.focusedOrderField === 'billing' ? (item.billing_order || item.priority) : (item.report_order || item.priority);
    if(this.focusedOrderField === 'billing') this.test.billing_order = value;
    if(this.focusedOrderField === 'report') this.test.report_order = value;
  }
  isPredefinedFormulaSelected(){
    return !!String(this.test.predefined_formula_key || '').trim();
  }
  selectPredefinedFormula(value:any){
    this.selectedPredefinedFormula = String(value || '');
    this.applyPredefinedFormula();
  }
  predefinedFormulaDisplayExpression(){
    if(this.isEgfrTemplateSelected()){
      return 'eGFR = 142 × min(SCr/κ, 1)^α × max(SCr/κ, 1)^-1.200 × 0.9938^Age × sex factor';
    }
    return String(this.test.formula_expression || '');
  }
  isEgfrTemplateSelected(){
    return String(this.selectedPredefinedFormula || this.test.predefined_formula_key || '').trim().toUpperCase() === 'EGFR_CKD_EPI_2021';
  }
  egfrSourceTests(){
    const ownId = +this.test.id || 0;
    const normalized = (v:any) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const likely = (t:any) => {
      const text = normalized(`${t.code || ''} ${t.name || ''} ${t.display_name || ''}`);
      return text.includes('CREATININE') || ['SCR','CREA','CREAT'].some(k => text.includes(k));
    };
    const rows = this.tests().filter((t:any)=>+t.id !== ownId && t.active !== false);
    return [...rows].sort((a:any,b:any)=>Number(likely(b))-Number(likely(a)) || String(a.name||'').localeCompare(String(b.name||'')));
  }
  setEgfrSourceTest(value:any){
    const id = +value || 0;
    this.egfrSourceTestId = id || null;
    const vars = [...(this.test.formula_variables || [])].filter((v:any)=>String(v.variable_key || '').trim().toUpperCase() !== 'SCR');
    if(id){
      const source = this.tests().find((t:any)=>+t.id === id);
      vars.unshift({ variable_key:'SCR', source_test_id:id, test_name:source?.name || this.testName(id) });
    }
    this.test.formula_variables = vars;
  }

  applyPredefinedFormula(){
    const selectedKey = String(this.selectedPredefinedFormula || '').trim().toUpperCase();
    if(!selectedKey){
      // Switching the Template dropdown to Manual must clear only the built-in
      // engine marker. Keep the current expression so it can be edited manually.
      this.test.predefined_formula_key = '';
      return;
    }
    const f = this.predefinedFormulas.find(x => x.key === selectedKey);
    if(!f) return;
    this.test.result_data_type = 'NUMBER';
    this.test.input_control_type = 'CALCULATED_EDITABLE';
    this.test.result_mode = 'CALCULATED';
    this.test.allow_manual_override = true;
    this.test.predefined_formula_key = f.key;
    this.test.formula_expression = f.expression;
    const savedScr = (this.test.formula_variables || []).find((v:any)=>String(v.variable_key || '').trim().toUpperCase() === 'SCR');
    this.egfrSourceTestId = +savedScr?.source_test_id || this.egfrSourceTestId || null;
    this.test.formula_variables = (this.test.formula_variables || []).filter((v:any) => v.variable_key !== 'PATIENT_AGE' && v.variable_key !== 'PATIENT_GENDER_MALE_DEFAULT');
    if(this.test.decimal_places === undefined || this.test.decimal_places === null || this.test.decimal_places === '') this.test.decimal_places = 2;
    if(!this.test.rounding_mode) this.test.rounding_mode = 'NEAREST';
  }
  searchFormulaTests(){
    const q = this.formulaTestQuery.trim().toLowerCase();
    if(!q){ this.formulaTestResults.set([]); return; }
    const ownId = +this.test.id || 0;
    this.formulaTestResults.set(this.tests().filter(t => +t.id !== ownId && (`${t.code || ''} ${t.name || ''} ${t.department_name || ''}`.toLowerCase().includes(q))).slice(0, 10));
  }
  variableKeyForTest(t:any){
    const raw = String(t.code || `T${t.id}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/^([0-9])/, 'T_$1');
    return raw || `T${t.id}`;
  }
  appendFormulaToken(token:string){ this.test.formula_expression = `${this.test.formula_expression || ''}${this.test.formula_expression ? ' ' : ''}${token}`.trim(); }
  insertFormulaTest(t:any){
    const variable_key = this.test.predefined_formula_key === 'EGFR_CKD_EPI_2021' && !(this.test.formula_variables || []).some((v:any)=>v.variable_key === 'SCR') ? 'SCR' : this.variableKeyForTest(t);
    const vars = [...(this.test.formula_variables || [])];
    if(!vars.some((v:any)=>v.variable_key === variable_key)) vars.push({ variable_key, source_test_id: t.id, test_name: t.name });
    this.test.formula_variables = vars;
    this.appendFormulaToken(variable_key);
    this.formulaTestQuery = '';
    this.formulaTestResults.set([]);
  }
  insertFormulaConstant(){
    const value = String(this.constantFormulaValue ?? '').trim();
    if(!value) return;
    this.appendFormulaToken(value);
    this.constantFormulaValue = '';
  }
  insertFormulaSymbol(symbol:string){ this.appendFormulaToken(symbol); }
  clearFormula(){ this.test.formula_expression = ''; this.test.formula_variables = []; }
  removeLastFormulaToken(){
    const parts = String(this.test.formula_expression || '').trim().split(/\s+/).filter(Boolean);
    parts.pop();
    this.test.formula_expression = parts.join(' ');
  }
  syncInterpretationEditorIfNeeded(){
    const editor = this.interpretationEditor?.nativeElement;
    if(!editor || !this.interpretationEditorNeedsSync) return;
    const html = this.test.interpretation_text || '';
    if(editor.innerHTML !== html) editor.innerHTML = html;
    this.interpretationEditorNeedsSync = false;
  }
  onInterpretationInput(event: Event){
    this.test.interpretation_text = this.normalizeRichInterpretationHtml((event.target as HTMLElement).innerHTML);
    this.updateRichToolbarState();
  }
  focusInterpretationEditor(){ this.interpretationEditor?.nativeElement.focus(); }
  updateInterpretationFromEditor(){
    const editor = this.interpretationEditor?.nativeElement;
    if(editor) this.test.interpretation_text = this.normalizeRichInterpretationHtml(editor.innerHTML);
  }
  hasMeaningfulRichText(html: string){
    const text = String(html || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>|<\/div>|<\/li>|<\/tr>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .trim();
    return !!text;
  }
  normalizeRichInterpretationHtml(html: string){
    const doc = document.implementation.createHTMLDocument('interpretation');
    doc.body.innerHTML = html || '';
    const fontSizeMap: Record<string, string> = { '1':'8px', '2':'10px', '3':'12px', '4':'14px', '5':'18px', '6':'24px', '7':'32px' };
    doc.body.querySelectorAll('font').forEach((font: Element) => {
      const span = doc.createElement('span');
      const styles: string[] = [];
      const color = font.getAttribute('color');
      const size = font.getAttribute('size');
      const face = font.getAttribute('face');
      if(color) styles.push(`color:${color}`);
      if(size) styles.push(`font-size:${fontSizeMap[String(size)] || String(size)}`);
      if(face) styles.push(`font-family:${face}`);
      const oldStyle = font.getAttribute('style');
      if(oldStyle) styles.push(oldStyle.replace(/;\s*$/,''));
      if(styles.length) span.setAttribute('style', styles.join(';'));
      while(font.firstChild) span.appendChild(font.firstChild);
      font.replaceWith(span);
    });
    doc.body.querySelectorAll('[bgcolor]').forEach((el: Element) => {
      const bg = el.getAttribute('bgcolor');
      if(bg) (el as HTMLElement).style.backgroundColor = bg;
      el.removeAttribute('bgcolor');
    });
    doc.body.querySelectorAll('[style]').forEach((el: Element) => {
      const node = el as HTMLElement;
      node.setAttribute('style', node.getAttribute('style')?.replace(/\s*;\s*/g, ';').replace(/;$/,'') || '');
      if(!node.getAttribute('style')) node.removeAttribute('style');
    });
    return doc.body.innerHTML.trim();
  }
  formatInterpretation(command: string, value?: string){ this.focusInterpretationEditor(); document.execCommand(command, false, value || undefined); this.updateInterpretationFromEditor(); this.updateRichToolbarState(); }
  setInterpretationFontSize(event: Event){ const select = event.target as HTMLSelectElement; if(select.value) this.formatInterpretation('fontSize', select.value); select.value = ''; }
  setInterpretationColorValue(value: string){ if(value){ this.interpretationTextColour = value; this.formatInterpretation('foreColor', value); } }
  setInterpretationBackgroundValue(value: string){ if(value){ this.interpretationHighlightColour = value; this.formatInterpretation('hiliteColor', value); } }
  isSelectedColour(a:string,b:string){ return String(a || '').toLowerCase() === String(b || '').toLowerCase(); }
  @HostListener('document:selectionchange')
  onDocumentSelectionChange(){ this.updateRichToolbarState(false); }
  private selectionInsideInterpretationEditor(){
    const testEditor = this.interpretationEditor?.nativeElement;
    const profileEditor = this.profileInterpretationEditor?.nativeElement;
    const selection = document.getSelection();
    if(!selection || selection.rangeCount === 0) return false;
    const node = selection.anchorNode;
    return !!node && ((!!testEditor && (node === testEditor || testEditor.contains(node))) || (!!profileEditor && (node === profileEditor || profileEditor.contains(node))));
  }
  updateRichToolbarState(force = true){
    if(!force && !this.selectionInsideInterpretationEditor()) return;
    try {
      this.activeEditorCommands = {
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
        orderedList: document.queryCommandState('insertOrderedList')
      };
      this.selectedTextAlign = document.queryCommandState('justifyCenter') ? 'center'
        : document.queryCommandState('justifyRight') ? 'right'
        : document.queryCommandState('justifyFull') ? 'justify'
        : 'left';
    } catch { /* execCommand state is best-effort across Chromium versions */ }
  }
  insertInterpretationTable(){
    const rows = Math.max(1, Math.min(12, Number(this.interpretationTableRows) || 2));
    const cols = Math.max(1, Math.min(8, Number(this.interpretationTableCols) || 2));
    const width = ['auto','35%','50%','75%','100%'].includes(this.interpretationTableWidth) ? this.interpretationTableWidth : '50%';
    const align = ['left','center','right'].includes(this.interpretationTableAlign) ? this.interpretationTableAlign : 'center';
    const borderMode = ['full','outer','none'].includes(this.interpretationTableBorder) ? this.interpretationTableBorder : 'full';
    const margin = align === 'center' ? '8px auto' : align === 'right' ? '8px 0 8px auto' : '8px auto 8px 0';
    const borderColour = '#94a3b8';
    const tableBorder = borderMode === 'none' ? 'border:none;' : `border:1px solid ${borderColour};`;
    const cellBorder = borderMode === 'full' ? `border:1px solid ${borderColour};` : 'border:none;';
    const tableStyle = `width:${width};margin:${margin};border-collapse:collapse;${tableBorder}`;
    const thStyle = `${cellBorder}padding:6px 8px;background:#eef4ff;font-weight:700;`;
    const tdStyle = `${cellBorder}padding:6px 8px;`;
    const header = '<thead><tr>' + Array.from({length: cols}, (_, i) => `<th style="${thStyle}">Header ${i + 1}</th>`).join('') + '</tr></thead>';
    const body = '<tbody>' + Array.from({length: rows}, () => '<tr>' + Array.from({length: cols}, () => `<td style="${tdStyle}">&nbsp;</td>`).join('') + '</tr>').join('') + '</tbody>';
    this.focusInterpretationEditor();
    document.execCommand('insertHTML', false, `<table data-border-mode="${borderMode}" style="${tableStyle}">${header}${body}</table><p><br></p>`);
    this.updateInterpretationFromEditor();
  }
  clearInterpretation(){ this.test.interpretation_text = ''; if(this.interpretationEditor?.nativeElement) this.interpretationEditor.nativeElement.innerHTML = ''; }
  syncProfileInterpretationEditorIfNeeded(){
    const editor = this.profileInterpretationEditor?.nativeElement;
    if(!editor || !this.profileInterpretationEditorNeedsSync) return;
    editor.innerHTML = this.profile.interpretation_text || '';
    this.profileInterpretationEditorNeedsSync = false;
  }
  onProfileInterpretationInput(event: Event){
    this.profile.interpretation_text = this.normalizeRichInterpretationHtml((event.target as HTMLElement).innerHTML);
    this.updateRichToolbarState();
  }
  focusProfileInterpretationEditor(){ this.profileInterpretationEditor?.nativeElement.focus(); }
  updateProfileInterpretationFromEditor(){
    const editor = this.profileInterpretationEditor?.nativeElement;
    if(editor) this.profile.interpretation_text = this.normalizeRichInterpretationHtml(editor.innerHTML);
  }
  formatProfileInterpretation(command: string, value?: string){ this.focusProfileInterpretationEditor(); document.execCommand(command, false, value || undefined); this.updateProfileInterpretationFromEditor(); this.updateRichToolbarState(); }
  setProfileInterpretationFontSize(event: Event){ const select = event.target as HTMLSelectElement; if(select.value) this.formatProfileInterpretation('fontSize', select.value); select.value = ''; }
  setProfileInterpretationColorValue(value: string){ if(value){ this.interpretationTextColour = value; this.formatProfileInterpretation('foreColor', value); } }
  setProfileInterpretationBackgroundValue(value: string){ if(value){ this.interpretationHighlightColour = value; this.formatProfileInterpretation('hiliteColor', value); } }
  insertProfileInterpretationTable(){
    const rows = Math.max(1, Math.min(12, Number(this.interpretationTableRows) || 2));
    const cols = Math.max(1, Math.min(8, Number(this.interpretationTableCols) || 2));
    const width = ['auto','35%','50%','75%','100%'].includes(this.interpretationTableWidth) ? this.interpretationTableWidth : '50%';
    const align = ['left','center','right'].includes(this.interpretationTableAlign) ? this.interpretationTableAlign : 'center';
    const borderMode = ['full','outer','none'].includes(this.interpretationTableBorder) ? this.interpretationTableBorder : 'full';
    const borderCss = borderMode === 'none' ? 'border:0;' : 'border:1px solid #475569;';
    const cellBorder = borderMode === 'full' ? 'border:1px solid #475569;' : 'border:0;';
    const margin = align === 'center' ? 'margin-left:auto;margin-right:auto;' : align === 'right' ? 'margin-left:auto;margin-right:0;' : 'margin-left:0;margin-right:auto;';
    let html = `<table style="width:${width};${margin}${borderCss}border-collapse:collapse;"><tbody>`;
    for(let r=0;r<rows;r++){ html += '<tr>'; for(let c=0;c<cols;c++) html += `<td style="${cellBorder}padding:4px 6px;min-width:40px;">&nbsp;</td>`; html += '</tr>'; }
    html += '</tbody></table><p></p>';
    this.focusProfileInterpretationEditor(); document.execCommand('insertHTML', false, html); this.updateProfileInterpretationFromEditor();
  }
  clearProfileInterpretation(){ this.profile.interpretation_text = ''; if(this.profileInterpretationEditor?.nativeElement) this.profileInterpretationEditor.nativeElement.innerHTML = ''; }
  usesOptions(){ return this.test.input_control_type === 'OPTION'; }
  isSpecimenSelected(id:number){ return (this.test.specimen_ids || []).map((x:any)=>+x).includes(+id); }
  toggleSpecimen(id:number){ const set = new Set((this.test.specimen_ids || []).map((x:any)=>+x)); set.has(+id) ? set.delete(+id) : set.add(+id); this.test.specimen_ids = Array.from(set); }
  async addSpecimen(){ const name = this.newSpecimenName.trim(); if(!name) return; if(window.limsApi.saveSpecimen) await window.limsApi.saveSpecimen({ name }); this.newSpecimenName=''; await this.reload(); }
  displayResultType(t:any){ return `${t.result_data_type || 'NUMBER'}`; }


  async setActiveTab(tab:'departments' | 'units' | 'tests' | 'profiles' | 'equipment'){
    if(this.activeTab === tab) return;
    if(this.activeTab === 'tests' && this.testMasterView === 'form' && this.isTestFormDirty()){
      const ok = await this.showMasterConfirm('Discard Test Master changes?', ['You have unsaved Test Master configuration changes.', 'Leave this screen and discard the changes?'], 'Discard');
      if(!ok) return;
    }
    if(this.activeTab === 'profiles' && this.profileMasterView === 'form'){
      const ok = await this.showMasterConfirm('Discard Profile changes?', ['You may have unsaved Profile / Group changes.', 'Leave this screen and discard the changes?'], 'Discard');
      if(!ok) return;
    }
    this.activeTab = tab;
    if(tab !== 'tests' && this.testMasterView === 'form') await this.backToTestList(true);
    if(tab !== 'profiles' && this.profileMasterView === 'form') await this.backToProfileList(true);
  }
  isTestFormDirty(){
    if(this.testMasterView !== 'form') return false;
    if(!this.originalTestSnapshot) return false;
    return JSON.stringify(this.cloneComparableTest(this.test)) !== JSON.stringify(this.originalTestSnapshot);
  }
  openCreateTest(){
    this.testFormMode = 'create';
    this.testUpdateTargets = { master:true, profiles:false, billing:false, profileDate:'', billingDate:'' };
    this.resetTest();
    this.originalTestSnapshot = this.cloneComparableTest(this.test);
    this.testMasterView = 'form';
    this.testMasterStep = 0;
  }
  openEditTest(t:any){
    this.testFormMode = 'edit';
    this.editTest(t);
    this.originalTestSnapshot = this.cloneComparableTest(this.test);
    this.testUpdateTargets = { master:true, profiles:false, billing:false, profileDate:'', billingDate:'' };
    this.testMasterView = 'form';
    this.testMasterStep = 0;
  }
  async backToTestList(force=false){
    if(!force && this.isTestFormDirty()){
      const ok = await this.showMasterConfirm('Discard Test Master changes?', ['You have unsaved Test Master configuration changes.', 'Go back to the Test list and discard the changes?'], 'Discard');
      if(!ok) return;
    }
    this.testMasterView = 'list';
    this.originalTestSnapshot = null;
    this.testUpdateTargets = { master:true, profiles:false, billing:false, profileDate:'', billingDate:'' };
    this.resetTest();
    await this.reload();
  }
  trackByTestId(_index:number, item:any){ return item?.id; }
  setTestListState(state:'ACTIVE' | 'DEACTIVATED'){
    this.testListState = state;
    this.testListDepartment = '';
    this.testListGroupMode = 'NONE';
    if(state === 'ACTIVE' && this.testListStatus === 'INACTIVE') this.testListStatus = 'ALL';
    if(state === 'DEACTIVATED') this.testListStatus = 'ALL';
  }
  setTestListDepartment(id:any){ this.testListDepartment = id === '' || id === null || id === undefined ? '' : String(id); this.testListGroupMode = 'NONE'; }
  activeTestCount(){ return this.tests().filter((t:any)=>!!t.active).length; }
  deactivatedTestCount(){ return this.tests().filter((t:any)=>!t.active).length; }
  testListTotalCount(){ return this.tests().filter((t:any)=>!!t.active && this.testMatchesStatus(t)).length; }
  testCountForDepartment(id:any){ return this.tests().filter((t:any)=>!!t.active && +t.department_id === +id && this.testMatchesStatus(t)).length; }
  isTestDepartmentSelected(id:any){ return this.testListDepartment === String(id); }
  testMatchesStatus(t:any){
    if(this.testListState === 'DEACTIVATED') return !t.active;
    if(!t.active) return false;
    if(this.testListStatus === 'BILLABLE') return !!t.billable;
    if(this.testListStatus === 'NON_BILLABLE') return !t.billable;
    return true;
  }
  isDuplicateTestCode(){
    const code = String(this.test.code || '').trim().toUpperCase();
    if(!code) return false;
    const currentId = +this.test.id || 0;
    return this.tests().some((t:any) => +t.id !== currentId && String(t.code || '').trim().toUpperCase() === code);
  }
  filteredTests(){
    const q = String(this.testListSearch || '').trim().toLowerCase();
    const dept = this.testListState === 'ACTIVE' && this.testListDepartment ? +this.testListDepartment : 0;
    return this.tests().filter((t:any) => {
      if(dept && +t.department_id !== dept) return false;
      if(!this.testMatchesStatus(t)) return false;
      if(!q) return true;
      return `${t.code || ''} ${t.name || ''} ${t.display_name || ''} ${t.department_name || ''} ${t.unit_name || ''} ${t.method || ''} ${t.specimen_names || ''} ${t.result_data_type || ''}`.toLowerCase().includes(q);
    }).sort((a:any,b:any) => String(a.department_name||'').localeCompare(String(b.department_name||'')) || (+a.report_order || +a.priority || 0) - (+b.report_order || +b.priority || 0) || String(a.name||'').localeCompare(String(b.name||'')));
  }
  groupedTests(){
    const map = new Map<string, any[]>();
    for(const t of this.filteredTests()){
      const key = t.department_name || 'No Department';
      if(!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([department, tests]) => ({ department, tests }));
  }
  groupedTestsForPrint(){
    const previous = this.testListDepartment;
    this.testListDepartment = '';
    const all = this.groupedTests();
    this.testListDepartment = previous;
    return all;
  }
  exportTestsCsv(){
    const rows = this.filteredTests();
    const headers = ['Code','Test Name','Report Name','Department','Unit','Result Type','Specimen','Method','Price','Billing Order','Report Order'];
    const csvRows = [headers, ...rows.map((t:any)=>[t.code,t.name,t.display_name||t.name,t.department_name,t.unit_name,t.result_data_type,t.specimen_names,t.method,t.price,t.billing_order,t.report_order])];
    const csv = csvRows.map(row => row.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `test-master-${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  async printTestsList(){
    const printMode = await this.showTestPrintModeDialog();
    if(!printMode) return;
    const groups = printMode === 'GROUPED' ? this.groupedTestsForPrint() : [{ department: 'All Tests', tests: this.filteredTests() }];
    const esc = (v:any) => String(v ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[ch]);
    const html = `<!doctype html><html><head><title>Tests</title><style>body{font-family:Arial,sans-serif;margin:24px;color:#111827}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 18px;color:#64748b;font-size:12px}.group{margin:16px 0 8px;font-weight:700;background:#eef4ff;padding:8px 10px;border-radius:8px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px}th,td{border:1px solid #cbd5e1;padding:6px 7px;text-align:left;vertical-align:top}th{background:#f8fafc}</style></head><body><h1>Tests</h1><p>${DateTimeSettingsService.dateTime(new Date())}</p>${groups.map(g=>`<div class="group">${esc(g.department)} (${g.tests.length})</div><table><thead><tr><th>Order</th><th>Code</th><th>Test</th><th>Result</th><th>Specimen</th><th>Method</th><th>Price</th></tr></thead><tbody>${g.tests.map((t:any)=>`<tr><td>${esc(t.report_order||t.priority)}</td><td>${esc(t.code)}</td><td><b>${esc(t.display_name||t.name)}</b></td><td>${esc(t.result_data_type)}</td><td>${esc(t.specimen_names||'-')}</td><td>${esc(t.method||'-')}</td><td>${esc(t.price)}</td></tr>`).join('')}</tbody></table>`).join('')}</body></html>`;
    const win = window.open('', '_blank');
    if(!win) return;
    win.document.write(html); win.document.close(); win.focus(); win.print();
  }
  onTestDragStart(t:any){ this.draggedTest = t; }
  onTestDragOver(event: DragEvent){ event.preventDefault(); }
  async onTestDrop(target:any){
    if(!this.draggedTest || !target || +this.draggedTest.id === +target.id) return;
    const dept = target.department_id || this.draggedTest.department_id || null;
    const rows = this.filteredTests().filter((t:any)=>!dept || +t.department_id === +dept);
    const moving = this.draggedTest;
    const without = rows.filter((t:any)=>+t.id !== +moving.id);
    const targetIndex = without.findIndex((t:any)=>+t.id === +target.id);
    without.splice(Math.max(0,targetIndex), 0, moving);
    const updates = without.map((t:any,i:number)=>({ id:t.id, report_order:(i+1)*1000, billing_order:t.billing_order || (i+1)*1000 }));
    if(window.limsApi.reorderTests) await window.limsApi.reorderTests(updates);
    else for(const u of updates){ const original = this.tests().find((t:any)=>+t.id===+u.id); if(original) await window.limsApi.saveTest({ ...original, ...u }); }
    this.draggedTest = null;
    await this.reload();
  }
  onDepartmentDragStart(d:any){ this.draggedDepartment = d; }
  onDepartmentDragOver(event: DragEvent){ event.preventDefault(); }
  async onDepartmentDrop(target:any){
    if(!this.draggedDepartment || !target || +this.draggedDepartment.id === +target.id) return;
    const rows = [...this.departments()];
    const moving = this.draggedDepartment;
    const without = rows.filter((d:any)=>+d.id !== +moving.id);
    const targetIndex = without.findIndex((d:any)=>+d.id === +target.id);
    without.splice(Math.max(0, targetIndex), 0, moving);
    const updates = without.map((d:any, i:number)=>({ id:+d.id, priority:(i+1)*1000 })).filter((u:any)=>Number.isFinite(u.id) && u.id > 0);
    try {
      if(window.limsApi.reorderDepartments) await window.limsApi.reorderDepartments(updates);
      else for(const u of updates){ const original = this.departments().find((d:any)=>+d.id===+u.id); if(original) await window.limsApi.saveDepartment({ ...original, ...u }); }
      await this.reload();
      this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Reorder failed', String(err?.message || err || 'Could not update department order.').replace(/^Error:\s*/i, ''));
    } finally {
      this.draggedDepartment = null;
    }
  }
  onProfileDragStart(p:any){ this.draggedProfile = p; }
  onProfileDragOver(event: DragEvent){ event.preventDefault(); }
  async onProfileDrop(target:any){
    if(!this.draggedProfile || !target || +this.draggedProfile.id === +target.id) return;
    const rows = this.filteredProfiles();
    const moving = this.draggedProfile;
    const without = rows.filter((p:any)=>+p.id !== +moving.id);
    const targetIndex = without.findIndex((p:any)=>+p.id === +target.id);
    without.splice(Math.max(0, targetIndex), 0, moving);
    const updates = without.map((p:any, i:number)=>({ id:+p.id, report_order:(i+1)*1000, billing_order:(i+1)*1000 })).filter((u:any)=>Number.isFinite(u.id) && u.id > 0);
    try {
      // Prefer bulk reorder API only — saveProfile fallback can wipe profile_items on conflict/empty payloads.
      if(!window.limsApi.reorderProfiles) {
        await this.showMasterAlert('Restart required', 'Profile reorder needs an app restart to load the new API. Please restart LIMS and try again.');
        return;
      }
      await window.limsApi.reorderProfiles(updates);
      await this.reload();
      this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Reorder failed', String(err?.message || err || 'Could not update profile order.').replace(/^Error:\s*/i, ''));
    } finally {
      this.draggedProfile = null;
    }
  }
  async deactivateTest(t:any){
    const ok = await this.showMasterConfirm(
      'Deactivate test?',
      [`Deactivate test "${t.display_name || t.name}"?`, 'It will be hidden from active Test Master list, billing selection, reporting selection, and future usage lists.', 'Old bills and old reports will remain unchanged.'],
      'Deactivate',
      true
    );
    if(!ok) return;
    await window.limsApi.saveTest({ ...t, active:false, billable:false, active_for_reporting:false });
    await this.reload();
    this.changed.emit();
  }

  async activateTest(t:any){
    const ok = await this.showMasterConfirm(
      'Activate test?',
      [`Activate test "${t.display_name || t.name}"?`, 'It will return to the active Test Master list and can be selected again for billing and reporting.'],
      'Activate'
    );
    if(!ok) return;
    await window.limsApi.saveTest({ ...t, active:true, billable:true, active_for_reporting:true });
    await this.reload();
    this.changed.emit();
  }

  async deleteTest(t:any){
    const ok = await this.showMasterConfirm(
      'Delete test?',
      [`Delete test "${t.display_name || t.name}"?`, 'This is allowed only when the test is not mapped or used anywhere.', 'Reference ranges, result options, formulas, specimen defaults, and reagent setup belong to this Test Master record and will be removed with it.'],
      'Delete',
      true
    );
    if(!ok) return;
    try {
      if(window.limsApi.deleteTest) await window.limsApi.deleteTest(t.id);
      else throw new Error('Delete API is not available.');
      await this.reload(); this.changed.emit();
    } catch (err:any) {
      const message = String(err?.message || err || 'This test could not be deleted.');
      await this.showMasterAlert('Test is mapped', message.replace(/^Error:\s*/i, ''));
    }
  }



  async deleteProfile(p:any){
    const ok = await this.showMasterConfirm(
      'Remove profile?',
      [
        `Remove profile "${p.name || p.code || 'Profile'}"?`,
        'If this profile was already used in billing, nested profiles, or reports, it will only be deactivated (archived) and history will be kept.',
        'Unused profiles can be deleted from master only. Tests inside the profile are never deleted.'
      ],
      'Continue',
      true
    );
    if(!ok) return;
    try {
      if(!window.limsApi.deleteProfile) throw new Error('Delete profile API is not available.');
      const result:any = await window.limsApi.deleteProfile(p.id);
      const action = String(result?.action || '').toLowerCase();
      if (action === 'deactivated') {
        await this.showMasterAlert('Profile deactivated', 'This profile was already used, so it was deactivated instead of deleted. Historical bills and reports were not changed.');
      }
      // Prefer returned list when available; otherwise reload.
      if (Array.isArray(result?.list)) this.profiles.set(result.list);
      else if (Array.isArray(result)) this.profiles.set(result);
      else await this.reload();
      this.changed.emit();
    } catch (err:any) {
      await this.showMasterAlert('Profile remove failed', String(err?.message || err || 'Could not remove profile.').replace(/^Error:\s*/i, ''));
    }
  }

  trackByProfileId(_index:number, item:any){ return item?.id; }
  profileMatchesStatus(p:any){
    if(this.profileListStatus === 'ACTIVE') return !!p.active;
    if(this.profileListStatus === 'INACTIVE') return !p.active;
    if(this.profileListStatus === 'BILLABLE') return !!p.billable;
    if(this.profileListStatus === 'NON_BILLABLE') return !p.billable;
    if(this.profileListStatus === 'REPORTING') return !!p.active_for_reporting;
    return true;
  }
  filteredProfiles(){
    const q = String(this.profileListSearch || '').trim().toLowerCase();
    return this.profiles().filter((p:any) => {
      if(!this.profileMatchesStatus(p)) return false;
      if(!q) return true;
      return `${p.code || ''} ${p.name || ''} ${p.display_name || ''} ${p.search_keywords || ''} ${p.side_header || ''} ${p.department_name || ''}`.toLowerCase().includes(q);
    }).sort((a:any,b:any) => (+a.billing_order || +a.priority || 0) - (+b.billing_order || +b.priority || 0) || (+a.report_order || 0) - (+b.report_order || 0) || String(a.name||'').localeCompare(String(b.name||'')));
  }
  openCreateProfile(){
    this.profileFormMode = 'create';
    this.resetProfile();
    this.profileMasterView = 'form';
    this.profileTestSearch = '';
    this.profileNestedSearch = '';
    this.profileMasterStep = 0;
  }
  openEditProfile(p:any){
    this.profileFormMode = 'edit';
    this.profileUpdateTargets = { master:true, linkedProfiles:true, billing:false, billingFromDate:this.todayIso(), billingToDate:this.todayIso() };
    this.editProfile(p);
    this.profileMasterView = 'form';
    this.profileTestSearch = '';
    this.profileNestedSearch = '';
    this.profileMasterStep = 0;
    this.profileInterpretationEditorNeedsSync = true;
  }
  async backToProfileList(force=false){
    if(!force){
      const ok = await this.showMasterConfirm('Back to Profile List?', ['Any unsaved Profile / Group changes will be discarded.'], 'Discard');
      if(!ok) return;
    }
    this.profileMasterView = 'list';
    this.profileFormMode = 'create';
    this.profileTestSearch = '';
    this.profileNestedSearch = '';
    this.resetProfile();
    await this.reload();
  }
  goToProfileStep(index:number){ this.profileMasterStep = Math.max(0, Math.min(index, this.profileMasterSteps.length - 1)); if(this.profileMasterStep === 2) this.profileInterpretationEditorNeedsSync = true; }
  profileTestSearchResults(){
    const q = String(this.profileTestSearch || '').trim().toLowerCase();
    if(!q) return [];
    const selected = new Set(this.profileItems().filter((x:any)=>x.item_type==='TEST').map((x:any)=>+x.test_id));
    return this.tests().filter((t:any) => {
      if(selected.has(+t.id)) return false;
      return `${t.code || ''} ${t.name || ''} ${t.display_name || ''} ${t.search_keywords || ''} ${t.department_name || ''}`.toLowerCase().includes(q);
    }).sort((a:any,b:any) => (+a.report_order || +a.priority || 0) - (+b.report_order || +b.priority || 0) || String(a.name||'').localeCompare(String(b.name||''))).slice(0, 30);
  }
  profileSearchResults(){
    const q = String(this.profileNestedSearch || '').trim().toLowerCase();
    if(!q) return [];
    const ownId = +this.profile.id || 0;
    const selected = new Set(this.profileItems().filter((x:any)=>x.item_type==='PROFILE').map((x:any)=>+x.profile_id));
    return this.profiles().filter((p:any) => {
      if(+p.id === ownId || selected.has(+p.id)) return false;
      return `${p.code || ''} ${p.name || ''} ${p.display_name || ''} ${p.search_keywords || ''} ${p.side_header || ''} ${p.department_name || ''}`.toLowerCase().includes(q);
    }).sort((a:any,b:any) => (+a.report_order || +a.priority || 0) - (+b.report_order || +b.priority || 0) || String(a.name||'').localeCompare(String(b.name||''))).slice(0, 30);
  }


  onProfileCodeChange(value:string){ this.profileCodeTouched = true; this.profile.code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14); }
  onProfileNameChange(value:string){
    this.profile.name = value || '';
    if(!this.profileDisplayNameTouched || !this.profile.display_name) this.profile.display_name = this.profile.name;
    if(!this.profileCodeTouched || !this.profile.code) this.profile.code = this.suggestProfileCode(this.profile.name);
    if(!this.profile.search_keywords) this.profile.search_keywords = this.profileKeywords();
  }
  onProfileDisplayNameChange(value:string){
    this.profileDisplayNameTouched = true;
    this.profile.display_name = value || '';
  }
  suggestProfileCode(name:string){
    const raw = String(name || '').trim();
    if(!raw) return '';
    const normal = raw.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const common:any = {
      'COMPLETE BLOOD COUNT':'CBC','CBC PROFILE':'CBC','LIVER FUNCTION TEST':'LFT','LFT PROFILE':'LFT',
      'RENAL FUNCTION TEST':'RFT','KIDNEY FUNCTION TEST':'KFT','THYROID PROFILE':'THY','THYROID FUNCTION TEST':'TFT',
      'LIPID PROFILE':'LIPID','DIABETES PROFILE':'DIA','MASTER HEALTH CHECKUP':'MHC','FEVER PROFILE':'FVR'
    };
    if(common[normal]) return common[normal];
    const words = normal.split(' ').filter(Boolean);
    const acro = words.map(w => w[0]).join('').slice(0, 8);
    return acro || normal.replace(/\s+/g, '').slice(0, 8);
  }
  profileKeywords(){ return [this.profile.code, this.profile.name, this.profile.display_name, this.profile.side_header].filter(Boolean).join(' ').trim(); }
  openProfileOrderHelper(field: 'billing' | 'report'){ this.profileFocusedOrderField = field; }
  closeProfileOrderHelper(){ this.profileFocusedOrderField = null; }
  showProfileOrderHelper(){ return !!this.profileFocusedOrderField; }
  profileOrderHelperItems(){
    const ownId = +this.profile.id || 0;
    const orderKey = this.profileFocusedOrderField === 'billing' ? 'billing_order' : 'report_order';
    return this.profiles()
      .filter((p:any) => +p.id !== ownId)
      .sort((a:any,b:any) => (+a[orderKey] || +a.priority || 0) - (+b[orderKey] || +b.priority || 0) || String(a.name||'').localeCompare(String(b.name||'')))
      .slice(0, 50);
  }
  applyProfileOrderFromHelper(item:any){
    const value = this.profileFocusedOrderField === 'billing' ? (item.billing_order || item.priority) : (item.report_order || item.priority);
    if(this.profileFocusedOrderField === 'billing') this.profile.billing_order = value;
    if(this.profileFocusedOrderField === 'report') this.profile.report_order = value;
  }
  autoArrangeProfileItems(){
    const rank = (x:any) => {
      if(x.item_type === 'HEADER') return +x.priority || 0;
      if(x.item_type === 'PROFILE') {
        const p = this.profiles().find((r:any)=>+r.id===+(x.profile_id || x.child_profile_id));
        return +(x.priority || p?.report_order || p?.priority || 0);
      }
      const t = this.tests().find((r:any)=>+r.id===+x.test_id);
      return +(x.priority || t?.report_order || t?.priority || 0);
    };
    this.profileItems().sort((a:any,b:any)=> rank(a)-rank(b) || String(this.profileItemLabel(a)).localeCompare(String(this.profileItemLabel(b))));
    this.reindexProfileItems(true);
  }
  profileItems(): any[]{
    if(!this.profile.items) this.profile.items = [];
    if((!this.profile.items.length) && Array.isArray(this.profile.tests) && this.profile.tests.length){
      this.profile.items = this.profile.tests.map((x:any, i:number) => ({ item_type:'TEST', test_id:x.test_id, priority:+x.priority || i+1, side_header:'' }));
    }
    return this.profile.items;
  }
  addProfileTest(t:any){
    const items = this.profileItems();
    if(!items.some((x:any)=>x.item_type==='TEST' && +x.test_id===+t.id)) items.push({ item_type:'TEST', test_id:t.id, priority:+t.report_order || +t.priority || items.length+1, side_header:'' });
  }
  addProfileProfile(p:any){
    const items = this.profileItems();
    if(+p.id === +this.profile.id) return;
    if(!items.some((x:any)=>x.item_type==='PROFILE' && +x.profile_id===+p.id)) items.push({ item_type:'PROFILE', profile_id:p.id, priority:+p.report_order || +p.priority || items.length+1, side_header:'', display_profile_name:true });
  }
  addProfileHeader(){ const items = this.profileItems(); items.push({ item_type:'HEADER', priority:items.length+1, side_header:'New Header', display_profile_name:false }); }
  removeProfileItem(i:number){ this.profileItems().splice(i,1); this.reindexProfileItems(); }
  moveProfileItem(i:number, dir:number){ const items=this.profileItems(); const j=i+dir; if(j<0 || j>=items.length) return; [items[i],items[j]]=[items[j],items[i]]; this.reindexProfileItems(true); }
  reindexProfileItems(force=false){ this.profileItems().forEach((x:any,i:number)=>{ if(force || !+x.priority) x.priority=i+1; }); }
  addableProfiles(){ return this.profiles().filter((p:any)=>+p.id !== +this.profile.id); }
  profileItemLabel(item:any): string | number{
    if(item.item_type==='HEADER') return item.side_header || 'Header';
    if(item.item_type==='PROFILE') { const p = this.profiles().find((p:any)=>+p.id===+item.profile_id); return p?.display_name || p?.name || item.profile_name || item.profile_id; }
    return this.testName(item.test_id);
  }
  profileAutoRunningCost(items:any[] = this.profileItems(), seen: Set<number> = new Set<number>()): number{
    const sum = (items || []).reduce((acc:number, item:any) => {
      const type = String(item.item_type || 'TEST').toUpperCase();
      if(type === 'TEST') {
        const t = this.tests().find((x:any)=>+x.id===+item.test_id);
        return acc + Math.max(0, +t?.running_cost || 0);
      }
      if(type === 'PROFILE') {
        const pid = +(item.profile_id || item.child_profile_id || 0);
        if(!pid || seen.has(pid)) return acc;
        const p = this.profiles().find((x:any)=>+x.id===pid);
        if(!p) return acc;
        if(String(p.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL') return acc + Math.max(0, +(p.manual_running_cost ?? p.running_cost) || 0);
        const next = new Set(seen); next.add(pid);
        return acc + this.profileAutoRunningCost(p.items || [], next);
      }
      return acc;
    }, 0);
    return +sum.toFixed(2);
  }
  profileEffectiveRunningCost(): number{
    return +(String(this.profile.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? Math.max(0, +this.profile.running_cost || 0) : this.profileAutoRunningCost()).toFixed(2);
  }
  profileItemCount(p:any): number{ return (p.items || p.tests || []).length || 0; }
  profileDepartmentName(p:any): string{
    if(!p || !+p.department_id) return 'Mixed';
    return p.department_name || this.departments().find((d:any)=>+d.id===+p.department_id)?.name || 'Mixed';
  }
  profileSummary(p:any): string{
    const items = p.items || [];
    if(!items.length) return `${(p.tests || []).length || 0} tests`;
    const tests = items.filter((x:any)=>x.item_type==='TEST').length;
    const profiles = items.filter((x:any)=>x.item_type==='PROFILE').length;
    const headers = items.filter((x:any)=>x.item_type==='HEADER').length;
    return [`${tests} tests`, profiles ? `${profiles} profiles` : '', headers ? `${headers} headers` : ''].filter(Boolean).join(' · ');
  }
  editProfile(p:any){
    const items = (p.items && p.items.length ? p.items : (p.tests||[]).map((x:any)=>({ item_type:'TEST', test_id:x.test_id, priority:x.priority, side_header:'' }))).map((x:any)=>{
      const type = String(x.item_type || 'TEST').toUpperCase();
      return { item_type:type, test_id:x.test_id || null, profile_id:x.profile_id || x.child_profile_id || null, priority:x.priority, side_header:type === 'HEADER' ? (x.side_header || x.header_text || '') : '', display_profile_name:x.display_profile_name !== false && x.display_profile_name !== 0 };
    });
    this.profile={...p, display_name:p.display_name || p.name || '', running_cost_mode:String(p.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO', running_cost:+(p.manual_running_cost ?? p.running_cost ?? 0) || 0, active_for_reporting:p.active_for_reporting !== false && p.active_for_reporting !== 0, show_profile_name:p.show_profile_name !== false && p.show_profile_name !== 0, ordering_mode:p.ordering_mode || 'MANUAL', billing_order:p.billing_order || p.priority || 0, report_order:p.report_order || p.priority || 0, search_keywords:p.search_keywords || '', department_id:+p.department_id || 0, interpretation_enabled:!!p.interpretation_enabled, interpretation_text:p.interpretation_text || '', items};
    this.profileCodeTouched = true;
    this.profileDisplayNameTouched = true;
    this.profileMasterStep = 0;
    this.profileInterpretationEditorNeedsSync = true;
  }
  testName(id:number){ return this.tests().find(t=>+t.id===+id)?.name || id; }
  async saveProfile(){
    // Always pull the current profile editor HTML before validation and save.
    // Keep interpretation_enabled controlled only by the Profile Master checkbox.
    this.updateProfileInterpretationFromEditor();
    this.profile.interpretation_text = this.normalizeRichInterpretationHtml(this.profile.interpretation_text || '');
    if(!String(this.profile.code || '').trim() || !String(this.profile.name || '').trim() || !String(this.profile.display_name || '').trim()) { await this.showMasterAlert('Profile details required', 'Enter profile code, profile name, and profile display name before saving.'); return; }
    if(!this.profileItems().length) { await this.showMasterAlert('Profile items required', 'Add at least one test, nested profile, or manual side header.'); return; }
    this.updateProfileInterpretationFromEditor();
    this.profile.interpretation_text = this.normalizeRichInterpretationHtml(this.profile.interpretation_text || '');
    if(this.profile.interpretation_enabled && !String(this.profile.interpretation_text || '').replace(/<[^>]*>/g, '').trim()) { await this.showMasterAlert('Profile interpretation required', 'Enter profile interpretation text or disable interpretation before saving.'); this.goToProfileStep(2); return; }
    if(String(this.profile.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' && (+this.profile.running_cost || 0) < 0) { await this.showMasterAlert('Profile running cost invalid', 'Manual profile running cost must be zero or more.'); this.goToProfileStep(0); return; }
    if(this.profileFormMode === 'edit' && this.profileUpdateTargets.billing){
      if(!this.profileUpdateTargets.billingFromDate || !this.profileUpdateTargets.billingToDate){
        await this.showMasterAlert('Pending bill date range required', 'Select both From Date and To Date before updating existing pending billing items.');
        return;
      }
      if(String(this.profileUpdateTargets.billingFromDate) > String(this.profileUpdateTargets.billingToDate)){
        await this.showMasterAlert('Pending bill date range invalid', 'From Date cannot be after To Date.');
        return;
      }
    }
    if(!this.profile.search_keywords) this.profile.search_keywords = this.profileKeywords();
    if(!+this.profile.report_order) this.profile.report_order = +this.profile.priority || ((this.profiles().length + 1) * 1000);
    if(!+this.profile.billing_order) this.profile.billing_order = +this.profile.report_order || +this.profile.priority || 0;
    this.profile.priority = Math.max(1, Math.round((+this.profile.report_order || +this.profile.billing_order || 1000) / 1000));
    if(this.profile.ordering_mode === 'AUTO') this.autoArrangeProfileItems();
    const payload = {...this.profile, running_cost_mode:String(this.profile.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO', running_cost:String(this.profile.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? (+this.profile.running_cost || 0) : this.profileAutoRunningCost(), items:this.profileItems()};
    if(this.profileFormMode === 'edit' && +this.profile.id){
      payload.update_pending_bills = !!this.profileUpdateTargets.billing;
      payload.update_targets = { ...this.profileUpdateTargets };
    }
    try {
      await window.limsApi.saveProfile(payload);
    } catch (err:any) {
      const msg = String(err?.message || err || '');
      if(msg.includes('Profile conflicts found:')) {
        const details = msg.replace(/^.*Profile conflicts found:\s*/, '').split('|').map(x => x.trim()).filter(Boolean);
        const ok = await this.showMasterConfirm('Profile conflict warning', ['This profile has conflicts or inactive linked items.', 'Save anyway?'], 'Save anyway', true, details);
        if(!ok) return;
        await window.limsApi.saveProfile({...payload, confirm_conflicts:true});
      } else { throw err; }
    }
    this.profileMasterView = 'list'; this.profileFormMode = 'create'; this.resetProfile(); await this.reload(); this.changed.emit();
  }
  resetProfile(){ this.profile={active:true,billable:true,active_for_reporting:true,show_profile_name:true,ordering_mode:'MANUAL',price:0,running_cost:0,running_cost_mode:'AUTO',priority:0,billing_order:0,report_order:0,search_keywords:'',display_name:'',department_id:0,interpretation_enabled:false,interpretation_text:'',items:[]}; this.profileUpdateTargets = { master:true, linkedProfiles:true, billing:false, billingFromDate:this.todayIso(), billingToDate:this.todayIso() }; this.profileCodeTouched = false; this.profileDisplayNameTouched = false; this.profileMasterStep = 0; this.profileInterpretationEditorNeedsSync = true; this.closeProfileOrderHelper(); }
  editDepartment(d:any){
    this.department = { ...d, page_break_after: !!d.page_break_after, active: this.isDepartmentActive(d) };
    this.departmentOriginalName = String(d?.name || '').trim();
    this.departmentRenameScope = {
      update_scope: 'future',
      apply_from: this.todayIso(),
      update_billing: true,
      update_reporting: true
    };
  }
  editUnit(u:any){ this.unit={...u}; }
  editTest(t:any){
    const refs = t.reference_ranges || [];
    const all = refs.find((r:any)=>r.gender === 'ALL') || refs[0] || {};
    const male = refs.find((r:any)=>r.gender === 'MALE') || {};
    const female = refs.find((r:any)=>r.gender === 'FEMALE') || {};
    const editableRules = (t.reference_ranges || [])
      .map((r:any, i:number)=>({...r, _uiKey: r.id || `ref-${i}-${Date.now()}`, gender:r.gender || 'ALL', age_unit:r.age_unit || 'YEARS'}))
      // Plain ALL row is the main General Reference fields above. Do not show it again under Age / Gender Rules; otherwise delete appears to fail because save recreates the main ALL row from the top fields.
      .filter((r:any)=>!this.isPlainAllReferenceRule(r));
    const normalizedInputType = ['SEARCH_SELECT','SEARCHSELECT','DROPDOWN','RADIO','CHECKBOX','SELECT','OPTION_SELECT'].includes(String(t.input_control_type || '').trim().toUpperCase().replace(/[- ]+/g, '_')) ? 'OPTION' : String(t.input_control_type || 'TEXTBOX').trim().toUpperCase();
    this.test={...this.emptyTest(), ...t, input_control_type: normalizedInputType, display_name: t.display_name || t.name || '', reference_ranges: editableRules,
      reference_mode: refs.some((r:any)=>['MALE','FEMALE'].includes(r.gender)) ? 'MALE_FEMALE' : 'SINGLE',
      flag_enabled: all.flag_enabled !== 0,
      ref_lower: all.lower_limit, ref_upper: all.upper_limit, reference_text: all.reference_text || t.normal_range || '', critical_low: all.critical_low, critical_high: all.critical_high,
      male_lower: male.lower_limit, male_upper: male.upper_limit, male_reference_text: male.reference_text || '', male_critical_low: male.critical_low, male_critical_high: male.critical_high,
      female_lower: female.lower_limit, female_upper: female.upper_limit, female_reference_text: female.reference_text || '', female_critical_low: female.critical_low, female_critical_high: female.critical_high,
      options_text: (t.options || []).map((o:any)=>o.option_label || o.option_value).join('\n'),
      formula_expression: t.formula?.formula_expression || '',
      formula_variables: (t.formula?.variables || []).map((v:any)=>({ variable_key:v.variable_key, source_test_id:v.source_test_id, test_name:v.source_test_name || this.testName(v.source_test_id) })),
      predefined_formula_key: this.resolvePredefinedFormulaKey(t),
      rounding_decimals: t.formula?.rounding_decimals || t.decimal_places || 2,
      decimal_places: t.decimal_places ?? t.formula?.rounding_decimals ?? 2,
      rounding_mode: t.rounding_mode || t.formula?.rounding_mode || 'NEAREST',
      number_format: t.number_format || 'NONE',
      output_operator: t.output_operator || '+',
      output_constant: t.output_constant ?? 0,
      interpretation_enabled: !!t.interpretation_enabled,
      interpretation_text: t.interpretation_text || '',
      allow_manual_override: !!t.formula?.allow_manual_override
    };
    // The Template select uses its own UI model. Restore it from the persisted
    // formula engine whenever an existing test is opened; otherwise Angular
    // displays the empty "Manual formula" option even though eGFR is saved.
    this.selectedPredefinedFormula = String(this.test.predefined_formula_key || '');
    const savedEgfrSource = (this.test.formula_variables || []).find((v:any)=>String(v.variable_key || '').trim().toUpperCase() === 'SCR');
    this.egfrSourceTestId = +savedEgfrSource?.source_test_id || null;
    this.testCodeTouched = true;
    this.testDisplayNameTouched = true;
    this.interpretationEditorNeedsSync = true;
  }

  private resolvePredefinedFormulaKey(t:any): string {
    const stored = String(t?.formula?.predefined_formula_key || t?.predefined_formula_key || '').trim().toUpperCase();
    if(this.predefinedFormulas.some(f => f.key === stored)) return stored;

    // Backward compatibility for records created before predefined_formula_key
    // was persisted correctly. Do not classify arbitrary manual formulas.
    const expression = String(t?.formula?.formula_expression || t?.formula_expression || '').trim().toUpperCase();
    if(/^EGFR_CKD_EPI_2021\s*\(/.test(expression)) return 'EGFR_CKD_EPI_2021';
    return '';
  }

}
