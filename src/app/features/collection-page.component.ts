import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DateTimeSettingsService } from '../shared/date-time-settings.service';
import { code128Svg } from '../shared/code128';
import { MatMenuModule } from '@angular/material/menu';
import { ReportTypingPageComponent } from './reports/report-typing-page.component';

type WorkflowStep = 'requests' | 'collection' | 'reporting' | 'logs';
type CollectionTab = 'pending' | 'collectionpending' | 'inhouse' | 'outsource' | 'internalcheck' | 'rejected' | 'log';
type CollectStep = 1 | 2 | 3 | 4;

type CollectionTestRow = {
  report_item_id: number;
  test_id: number;
  test_name: string;
  department_name?: string;
  source_profile_id?: number;
  source_profile_name?: string;
  selected?: boolean;
  specimen_type_id?: number;
  specimen_name?: string;
  sample_type?: string;
  custom_sample_type?: string;
  collection_mode?: 'INHOUSE' | 'OUTSOURCE' | 'BOTH';
  collect_timing?: 'NOW' | 'LATER';
  expected_collect_at?: string;
  remarks?: string;
  specimen_options?: any[];
  outsource_vendor_id?: number;
  sample_priority?: 'ROUTINE' | 'STAT' | 'CRITICAL' | 'VERIFICATION' | 'HOLD';
  timed_category?: 'NORMAL' | 'FASTING' | 'POST_PRANDIAL';
  collection_rule?: string;
  fasting_hours?: number;
  collection_gap_minutes?: number;
  collection_dependency?: string;
  same_specimen_allowed?: number | boolean;
  collection_instruction?: string;
  timed_note?: string;
  specimen_required?: boolean;
  specimen_missing?: boolean;
  override?: boolean;
};

@Component({
  selector: 'app-collection-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatMenuModule, ReportTypingPageComponent],
  templateUrl: './collection-page.component.html',
  styleUrls: ['./collection-page.component.scss'],
})
export class CollectionPageComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  tabs = [
    {id:'pending' as CollectionTab,label:'Pending Requests'},
    {id:'collectionpending' as CollectionTab,label:'Pending'},
    {id:'inhouse' as CollectionTab,label:'In-house'},
    {id:'outsource' as CollectionTab,label:'Outsource'},
    {id:'internalcheck' as CollectionTab,label:'Internal check'},
    {id:'rejected' as CollectionTab,label:'Rejected'},
    {id:'log' as CollectionTab,label:'Collection log'}
  ];
  workflowStep = signal<WorkflowStep>('requests');
  tab = signal<CollectionTab>('pending');
  mode = signal<'list'|'collect'>('list');
  step = signal<CollectStep>(1);
  pendingBills:any[]=[];
  acceptedPendingBills:any[]=[];
  collections:any[]=[];
  expandedCollectionId = signal<string|null>(null);
  expandedBillKey = signal<string|null>(null);
  actionMenuKey = signal<string|null>(null);
  actionMenuStyle = signal<Record<string,string>>({});
  collectionLogs:any[]=[];
  outsourceVendors:any[]=[];
  pendingSearch=''; collectionSearch=''; logSearch=''; logFilter='ALL'; collectionGroupMode:'BILL'|'SPECIMEN'='SPECIMEN';
  fromDate=''; toDate='';
  activeBill:any=null;
  collectionTests: CollectionTestRow[]=[];
  sampleTypes = ['Random','Fasting','Post-prandial','Timed','Emergency','Scheduled','Specify'];
  bulkMode:'INHOUSE'|'OUTSOURCE'|'BOTH'='INHOUSE';
  bulkSpecimenId=0;
  bulkSampleType='Random';
  bulkPriority:'ROUTINE'|'STAT'|'CRITICAL'|'VERIFICATION'|'HOLD'='ROUTINE';
  bulkOutsourceVendorId=0;
  leavePromptOpen=false; private leaveAction: (()=>void)|null=null; dirty=false;
  rejectModalOpen=false; rejectTarget:any=null; rejectReason=''; rejectError=''; approvedReportRejectModalOpen=false; approvedReportRejectTarget:any=null; approvedReportRejectReason=''; approvedReportRejectError=''; dispatchRejectConfirmOpen=false; dispatchRejectTarget:any=null; deleteModalOpen=false; deleteTarget:any=null; vendorResultModalOpen=false; vendorResultTarget:any=null; vendorResultMethod:'ENTER_VALUES'|'ATTACH_REPORT_ONLY'='ENTER_VALUES'; vendorReportFile=''; vendorResultRemarks=''; vendorResultError=''; formError=''; specimenPromptOpen=false; missingSpecimenTests: CollectionTestRow[]=[]; ppEarlyPromptOpen=false; earlyPpTests: CollectionTestRow[]=[]; private ppEarlyConfirmed=false; collectionActionSheetOpen=false; collectionActionSheetKind:'bill'|'sample'|'specimen'='specimen'; collectionActionSheetRow:any=null; collectionActionSheetX=0; collectionActionSheetY=0;

  private get api(): any { return (window as any).limsApi; }

  async ngOnInit(){ await this.load(); }

  async load(){
    this.pendingBills = await this.api?.listCollectionPending?.() || [];
    this.acceptedPendingBills = await this.api?.listAcceptedCollectionPending?.() || [];
    const rawCollections = await this.api?.listCollections?.({from:this.fromDate,to:this.toDate}) || [];
    this.collections = this.buildWorkflowScopedCollectionRows(rawCollections);
    this.collectionLogs = await this.api?.listCollectionLogs?.({from:this.fromDate,to:this.toDate}) || [];
    this.outsourceVendors = await this.api?.listOutsourceVendors?.() || [];
  }


  private buildWorkflowScopedCollectionRows(rows:any[]){
    const out:any[] = [];
    for(const c of (rows || [])){
      const status = String(c?.status || c?.collection_status || '').toUpperCase();
      const inhouseNames = this.splitTestNames(c?.inhouse_test_names || '');
      const outsourceNames = this.splitTestNames(c?.outsource_test_names || '');
      const internalNames = this.splitTestNames(c?.internal_check_test_names || '');
      const inhouseCount = +c?.inhouse_test_count || inhouseNames.length || 0;
      const outsourceCount = +c?.outsource_test_count || outsourceNames.length || 0;
      const internalCount = +c?.internal_check_test_count || internalNames.length || 0;
      const originalMode = String(c?.collection_mode || '').toUpperCase();
      const hasMixedWorkflow = inhouseCount > 0 && outsourceCount > 0;

      const make = (mode:'INHOUSE'|'OUTSOURCE'|'INTERNALCHECK', names:string[], count:number) => {
        const isOut = mode === 'OUTSOURCE' || mode === 'INTERNALCHECK';
        return {
          ...c,
          workflow_mode: mode,
          workflow_row_key: `${c?.id || c?.specimen_id || 'collection'}|${mode}|${isOut ? (+c?.outsource_vendor_id || 0) : 0}`,
          collection_mode: isOut ? 'OUTSOURCE' : 'INHOUSE',
          display_test_names: names.join('||'),
          display_test_count: count,
          test_names: names.join('||'),
          test_count: count,
          inhouse_test_names: mode === 'INHOUSE' ? names.join('||') : '',
          inhouse_test_count: mode === 'INHOUSE' ? count : 0,
          outsource_test_names: mode === 'OUTSOURCE' ? names.join('||') : '',
          outsource_test_count: mode === 'OUTSOURCE' ? count : 0,
          internal_check_test_names: mode === 'INTERNALCHECK' ? names.join('||') : (mode === 'OUTSOURCE' ? c?.internal_check_test_names : ''),
          internal_check_test_count: mode === 'INTERNALCHECK' ? count : (mode === 'OUTSOURCE' ? internalCount : 0),
          internal_check_required: mode === 'INTERNALCHECK' ? 1 : (mode === 'OUTSOURCE' ? c?.internal_check_required : 0),
          outsource_vendor_name: isOut ? c?.outsource_vendor_name : '',
          dispatch_status: isOut ? c?.dispatch_status : 'NOT_REQUIRED',
          status: status || c?.status,
          is_workflow_slice: hasMixedWorkflow ? 1 : 0
        };
      };

      if(status === 'REJECTED'){
        out.push({ ...c, workflow_mode:'REJECTED', workflow_row_key:`${c?.id || c?.specimen_id || 'collection'}|REJECTED|0` });
        continue;
      }
      if(inhouseCount > 0) out.push(make('INHOUSE', inhouseNames.length ? inhouseNames : this.splitTestNames(c?.test_names || ''), inhouseCount));
      if(outsourceCount > 0) out.push(make('OUTSOURCE', outsourceNames.length ? outsourceNames : this.splitTestNames(c?.test_names || ''), outsourceCount));
      // Internal check is a view over outsource tests requiring internal check. Keep it as its own display slice
      // only when those tests are not already visible through the normal outsource slice in the internal tab.
      if(internalCount > 0 && outsourceCount === 0) out.push(make('INTERNALCHECK', internalNames.length ? internalNames : outsourceNames, internalCount));
      if(inhouseCount === 0 && outsourceCount === 0 && internalCount === 0) out.push({ ...c, workflow_row_key:`${c?.id || c?.specimen_id || 'collection'}|${originalMode || 'INHOUSE'}|0` });
    }
    return out;
  }

  setWorkflowStep(id: WorkflowStep){ if(this.dirty) return this.askLeave(()=>this.setWorkflowStepNow(id)); this.setWorkflowStepNow(id); }
  private setWorkflowStepNow(id: WorkflowStep){
    this.workflowStep.set(id);
    this.mode.set('list');
    this.step.set(1);
    this.dirty=false;
    if(id==='requests' && !this.isRequestTab(this.tab())) this.tab.set('pending');
    if(id==='collection' && !this.isCollectionWorkTab(this.tab())) this.tab.set('collectionpending');
    if(id==='logs') this.tab.set('log');
    this.closeActionMenu();
    if(id!=='reporting') this.load();
  }
  setTab(id: CollectionTab){ if(this.dirty) return this.askLeave(()=>this.setTabNow(id)); this.setTabNow(id); }
  private setTabNow(id: CollectionTab){ this.tab.set(id); this.workflowStep.set(this.workflowForTab(id)); this.mode.set('list'); this.step.set(1); this.dirty=false; this.load(); }
  private isRequestTab(id: CollectionTab){ return id==='pending'; }
  private isCollectionWorkTab(id: CollectionTab){ return id==='collectionpending' || id==='inhouse' || id==='outsource' || id==='internalcheck' || id==='rejected'; }
  private workflowForTab(id: CollectionTab): WorkflowStep { return id==='log' ? 'logs' : this.isRequestTab(id) ? 'requests' : 'collection'; }
  markDirty(){ this.dirty=true; }
  askLeave(action:()=>void){ this.leaveAction=action; this.leavePromptOpen=true; }
  confirmLeave(){ this.leavePromptOpen=false; this.dirty=false; const action=this.leaveAction; this.leaveAction=null; action?.(); }
  requestBackToList(){ if(this.dirty) return this.askLeave(()=>this.closeCollect()); this.closeCollect(); }
  closeCollect(){ this.mode.set('list'); this.step.set(1); this.activeBill=null; this.collectionTests=[]; this.dirty=false; }

  filteredPendingBills(){ const q=this.pendingSearch.toLowerCase().trim(); return this.pendingBills.filter(b=>{
    const d=this.dateOnly(b.bill_date);
    const inDate=(!this.fromDate || d>=this.fromDate) && (!this.toDate || d<=this.toDate);
    const normalPendingOk = (+b.pending_count || 0) > 0;
    return inDate && normalPendingOk && (!q || [b.bill_no,b.patient_name,b.mobile,b.consultant_name].join(' ').toLowerCase().includes(q));
  }); }


  filteredAcceptedPendingBills(){ const q=this.pendingSearch.toLowerCase().trim(); return this.acceptedPendingBills.filter(b=>{
    const hay=[b.bill_no,b.patient_name,b.mobile,b.patient_no,b.consultant_name,b.pending_test_name,b.pending_sample_type].join(' ').toLowerCase();
    return !q || hay.includes(q);
  }); }

  billParameterTotal(b:any){
    return +b?.total_parameter_count || +b?.requested_parameter_count || +b?.billed_parameter_count || +b?.parameter_count || +b?.requested_test_count || +b?.billed_test_count || +b?.total_test_count || +b?.test_count || +b?.pending_count || 0;
  }
  pendingVsTotalLabel(b:any){
    const pending = +b?.pending_count || 0;
    const total = this.billParameterTotal(b) || pending;
    const collected = Math.max(0, total - pending);
    // Display collection progress as collected / still-pending.
    // Example: 44 billed, 1 collected, 43 pending => 1/43.
    return `${collected}/${pending}`;
  }
  pendingProgressPercent(b:any){
    const pending = +b?.pending_count || 0;
    const total = this.billParameterTotal(b) || pending;
    if(!total) return 0;
    const completed = Math.max(0, total - pending);
    return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
  }
  timeOnly(v:any){ return DateTimeSettingsService.time(v, ''); }
  private pendingRule(b:any){
    const rule = String(b?.pending_collection_rule || '').toUpperCase();
    const hay = [b?.pending_sample_type,b?.pending_test_name,b?.pending_collection_instruction,b?.sample_type,b?.collection_type,b?.test_names,b?.remarks].join(' ').toLowerCase();
    if(rule.includes('POST') || hay.includes('post') || hay.includes('pp')) return 'POST_PRANDIAL';
    if(rule.includes('TIMED') || rule.includes('INTERVAL') || b?.scheduled_collect_at || b?.expected_collect_at || b?.collect_at || b?.collection_time) return 'TIMED_INTERVAL';
    if(rule.includes('FAST') || hay.includes('fasting')) return 'FASTING';
    return 'NORMAL';
  }
  private pendingTypeLabel(b:any){
    const rule = this.pendingRule(b);
    if(rule === 'POST_PRANDIAL') return 'Post-prandial';
    if(rule === 'TIMED_INTERVAL') return 'Scheduled';
    if(rule === 'FASTING') return 'Fasting';
    return 'Routine';
  }
  private addMinutesToDate(v:any, minutes:any){
    const s = String(v || '');
    if(!s) return '';
    const normalized = s.includes('T') ? s : s.replace(' ', 'T');
    const d = new Date(normalized);
    if(Number.isNaN(d.getTime())) return '';
    d.setMinutes(d.getMinutes() + (+minutes || 0));
    const yyyy=d.getFullYear();
    const mm=String(d.getMonth()+1).padStart(2,'0');
    const dd=String(d.getDate()).padStart(2,'0');
    const hh=String(d.getHours()).padStart(2,'0');
    const mi=String(d.getMinutes()).padStart(2,'0');
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  }
  private shortTime(v:any){
    const t = this.timeOnly(v);
    return t || (v ? this.dateTime(v) : '');
  }
  pendingCollectionWarning(b:any){
    return (+b?.previous_same_sample_collected_count || 0) > 0;
  }
  pendingCollectionIsTimed(b:any){
    return this.pendingRule(b) !== 'NORMAL' || !!b?.previous_collected_at || !!this.pendingNextCollectionDate(b);
  }
  private pendingExpectedDate(b:any){
    return b?.expected_collect_at || b?.collect_at || b?.collection_time || b?.scheduled_collect_at || '';
  }
  private pendingNextCollectionDate(b:any){
    const expected = this.pendingExpectedDate(b);
    if(expected) return expected;
    const rule = this.pendingRule(b);
    if((rule === 'POST_PRANDIAL' || rule === 'TIMED_INTERVAL') && b?.previous_collected_at){
      return this.addMinutesToDate(b.previous_collected_at, +b?.pending_collection_gap_minutes || 120);
    }
    return '';
  }
  pendingNextCollectionLabel(b:any){
    if(this.pendingCollectionWarning(b)) return '';
    const next = this.pendingNextCollectionDate(b);
    if(!next) return '';
    const label = this.pendingTypeLabel(b);
    const time = this.timeOnly(next);
    return `${label}${time ? ' ' + time : ''}`;
  }
  pendingCollectionTimeLabel(b:any){
    const rule = this.pendingRule(b);
    if(this.pendingCollectionWarning(b)) return `${this.pendingTypeLabel(b)} already collected`;
    if((rule === 'POST_PRANDIAL' || rule === 'TIMED_INTERVAL') && b?.previous_collected_at){
      const prevType = b?.previous_sample_type || b?.previous_collection_type || b?.previous_specimen_name || 'Previous';
      const when = this.timeOnly(b.previous_collected_at);
      return `${prevType}${when ? ' ' + when : ''}`;
    }
    if(rule === 'POST_PRANDIAL') return 'Post-prandial';
    if(rule === 'TIMED_INTERVAL') return 'Scheduled';
    if(rule === 'FASTING') return 'Fasting';
    return 'Now';
  }
  pendingCollectionTimeNote(b:any){
    const rule = this.pendingRule(b);
    const instruction = b?.pending_collection_instruction || '';
    if(this.pendingCollectionWarning(b)){
      const when = this.dateTime(b?.previous_collected_at);
      return `${this.pendingTypeLabel(b)} was collected before${when ? ' at ' + when : ''}. Verify before collecting again.`;
    }
    const next = this.pendingNextCollectionDate(b);
    if(next){
      return `Next collection: ${this.dateTime(next)}`;
    }
    if(rule === 'POST_PRANDIAL') return instruction || 'Collect post-prandial after the previous/meal sample time is available.';
    if(rule === 'TIMED_INTERVAL') return instruction || 'Collect at the scheduled interval.';
    if(rule === 'FASTING') return instruction || 'Collect fasting sample.';
    return '';
  }


  inactiveCollectionStatus(c:any){ return ['CANCELLED','RECHECK_CANCELLED','RECHECK_REJECTED','RECHECK_REVERTED'].includes(String(c?.status || c?.collection_status || '').toUpperCase()) || ['CANCELLED','RECHECK_CANCELLED','RECHECK_REJECTED','RECHECK_REVERTED'].includes(String(c?.dispatch_status || '').toUpperCase()); }
  isRecheckCollection(c:any){
    const sourceType = String(c?.source_type || '').toUpperCase();
    const sampleIdentification = String(c?.sample_identification || '').toUpperCase();
    const reportKind = String(c?.report_kind || c?.reportKind || '').toUpperCase();
    const reportScope = String(c?.report_scope || c?.reportScope || '').toUpperCase();
    const recheckMode = String(c?.recheck_mode || c?.recheckMode || '').toUpperCase();
    const recheckStatus = String(c?.recheck_status || c?.recheckStatus || '').toUpperCase();
    return sourceType === 'RECHECK'
      || sampleIdentification === 'RECHECK'
      || (+c?.recheck_report_id || 0) > 0
      || (+c?.is_recheck_item || 0) === 1
      || reportKind === 'RECHECK'
      || reportScope === 'RECHECK'
      || (!!recheckMode && recheckMode !== 'NONE')
      || (!!recheckStatus && recheckStatus !== 'NONE');
  }
  filteredCollections(){ const q=this.collectionSearch.toLowerCase().trim(); const tab=this.tab(); return this.collections.filter(c=>{
    const status = String(c.status||'').toUpperCase();
    const rejected = status==='REJECTED';
    const inactive = this.inactiveCollectionStatus(c);
    const hasInhouse = (+c.inhouse_test_count || 0) > 0;
    const hasOutsource = (+c.outsource_test_count || 0) > 0;
    const hasInternal = (+c.internal_check_test_count || 0) > 0 || (+c.internal_check_required || 0) === 1;
    const statusOk = tab==='rejected'
      ? rejected
      : tab==='internalcheck'
        ? !rejected && !inactive && hasInternal && String(c.internal_check_status||'PENDING').toUpperCase()!=='DONE'
        : tab==='outsource'
          ? !rejected && !inactive && hasOutsource
          : tab==='inhouse'
            ? !rejected && !inactive && hasInhouse
            : !inactive;
    return statusOk && (!q || [c.specimen_id,c.bill_no,c.patient_name,c.specimen_name,c.sample_type,c.test_names,c.inhouse_test_names,c.outsource_test_names,c.internal_check_test_names,c.remarks,c.reject_reason,c.patient_no,c.gender,c.age].join(' ').toLowerCase().includes(q));
  }); }
  collectionExpandKey(c:any){ return String(c?.workflow_row_key ?? c?.id ?? c?.specimen_id ?? ''); }
  billExpandKey(g:any){ return String(g?.key ?? g?.bill_no ?? ''); }
  isCollectionExpanded(c:any){ const id=this.collectionExpandKey(c); return !!id && this.expandedCollectionId()===id; }
  isBillExpanded(g:any){ const key=this.billExpandKey(g); return !!key && this.expandedBillKey()===key; }
  toggleCollectionExpand(c:any){ const id=this.collectionExpandKey(c); if(!id) return; this.expandedCollectionId.set(this.expandedCollectionId()===id ? null : id); }
  toggleBillExpand(g:any){ const key=this.billExpandKey(g); if(!key) return; this.expandedBillKey.set(this.expandedBillKey()===key ? null : key); }
  private splitTestNames(v:any){ return String(v || '').split('||').map(x=>x.trim()).filter(Boolean); }
  collectionTestNames(c:any){
    if(c?.display_test_names) return this.splitTestNames(c.display_test_names);
    const tab = this.tab();
    if(tab==='inhouse') return this.splitTestNames(c?.inhouse_test_names || c?.test_names);
    if(tab==='outsource') return this.splitTestNames(c?.outsource_test_names || c?.test_names);
    if(tab==='internalcheck') return this.splitTestNames(c?.internal_check_test_names || c?.outsource_test_names || c?.test_names);
    return this.splitTestNames(c?.test_names);
  }
  collectionTestCount(c:any){
    if(c?.display_test_count !== undefined && c?.display_test_count !== null) return +c.display_test_count || this.collectionTestNames(c).length || 0;
    const tab = this.tab();
    if(tab==='inhouse') return +c?.inhouse_test_count || this.collectionTestNames(c).length || 0;
    if(tab==='outsource') return +c?.outsource_test_count || this.collectionTestNames(c).length || 0;
    if(tab==='internalcheck') return +c?.internal_check_test_count || this.collectionTestNames(c).length || 0;
    return +c?.test_count || this.collectionTestNames(c).length || 0;
  }
  collectionParameterCount(c:any){ return +c?.requested_test_count || +c?.billed_parameter_count || +c?.parameter_count || +c?.billed_test_count || this.collectionTestCount(c); }
  collectionBilledTestCount(c:any){ return this.collectionParameterCount(c); }
  billProgressLabel(c:any){ const billed = this.collectionBilledTestCount(c); const requested = +c?.requested_test_count || billed; return `${billed} / ${requested}`; }
  collectionBillGroups(){
    const groups = new Map<string, any>();
    this.filteredCollections().forEach(c=>{
      const key = String(c?.bill_id || c?.bill_no || c?.patient_no || c?.id || 'bill');
      const existing = groups.get(key);
      if(!existing){
        groups.set(key, {
          key,
          bill_no: c?.bill_no || '—',
          patient_name: c?.patient_name || '—',
          patient_no: c?.patient_no || '',
          age: c?.age,
          gender: c?.gender,
          samples: [c],
          sampleCount: 1,
          billedTests: this.collectionTestCount(c),
          billedParameters: this.collectionParameterCount(c),
          latestCollectedAt: c?.collected_at,
          modeLabel: this.collectionModeLabel(c),
          priorityLabel: c?.outsource_vendor_name || this.priorityLabel(c?.sample_priority),
          reportStatus: this.reportWorkflowStatus(c)
        });
      } else {
        existing.samples.push(c);
        existing.sampleCount = existing.samples.length;
        existing.billedTests = existing.samples.reduce((sum:any,x:any)=>sum + this.collectionTestCount(x), 0);
        existing.billedParameters = Math.max(+existing.billedParameters || 0, this.collectionParameterCount(c));
        if(String(c?.collected_at || '') > String(existing.latestCollectedAt || '')) existing.latestCollectedAt = c?.collected_at;
        existing.modeLabel = this.mergeModeLabel(existing.samples);
        existing.priorityLabel = this.mergePriorityLabel(existing.samples);
        existing.reportStatus = existing.samples.every((x:any)=>this.reportWorkflowStatus(x)==='Report approved') ? 'Report approved' : 'Report pending';
      }
    });
    return Array.from(groups.values());
  }
  collectionGroupForSingle(c:any){ return { key:String(c?.bill_id || c?.bill_no || c?.id || 'bill'), bill_no:c?.bill_no || '—', patient_name:c?.patient_name || '—', patient_no:c?.patient_no || '', age:c?.age, gender:c?.gender, samples:[c], sampleCount:1, billedTests:this.collectionTestCount(c), billedParameters:this.collectionParameterCount(c), latestCollectedAt:c?.collected_at, modeLabel:this.collectionModeLabel(c), priorityLabel:c?.outsource_vendor_name || this.priorityLabel(c?.sample_priority), reportStatus:this.reportWorkflowStatus(c) }; }
  collectionModeLabel(v:any){
    if(v && typeof v==='object'){
      const tab = this.tab();
      if(String(v?.workflow_mode || '').toUpperCase()==='INTERNALCHECK') return 'Outsource + internal check';
      if(String(v?.workflow_mode || '').toUpperCase()==='OUTSOURCE') return 'Outsource';
      if(String(v?.workflow_mode || '').toUpperCase()==='INHOUSE') return 'In-house';
      if(tab==='internalcheck') return 'Outsource + internal check';
      if(tab==='outsource') return 'Outsource';
      if(tab==='inhouse') return 'In-house';
      const hasInhouse = (+v.inhouse_test_count || 0) > 0;
      const hasOutsource = (+v.outsource_test_count || 0) > 0;
      const hasInternal = (+v.internal_check_test_count || 0) > 0 || (+v.internal_check_required || 0) === 1;
      if((hasInhouse && hasOutsource) || (hasOutsource && hasInternal)) return 'Mixed workflow';
      return hasInternal ? 'Outsource + internal check' : (hasOutsource || String(v?.collection_mode || v?.mode || 'INHOUSE').toUpperCase()==='OUTSOURCE' ? 'Outsource' : 'In-house');
    }
    const x=String(v||'INHOUSE').toUpperCase();
    return x==='BOTH'?'Outsource + internal check':x==='OUTSOURCE'?'Outsource':x==='MIXED'?'Mixed workflow':'In-house';
  }
  mergeModeLabel(samples:any[]){ const labels=Array.from(new Set(samples.map(x=>this.collectionModeLabel(x)).filter(Boolean))); return labels.length===1 ? labels[0] : 'Mixed modes'; }
  mergePriorityLabel(samples:any[]){ const labels=Array.from(new Set(samples.map(x=>x?.outsource_vendor_name || this.priorityLabel(x?.sample_priority)).filter(Boolean))); return labels.length===1 ? labels[0] : 'Multiple priorities'; }
  htmlSafe(v:any){ return String(v ?? '').replace(/[&<>"]/g, ch=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' } as any)[ch]); }
  viewBillDetailsPdf(g:any){
    const samples = g?.samples || [];
    const rows = samples.map((c:any)=>`<tr><td><b>${this.htmlSafe(c.specimen_id || '-')}</b><br><span>${this.htmlSafe(c.specimen_name || '-')} · ${this.htmlSafe(c.sample_type || '-')}</span></td><td><span class="tube-dot" style="background:${this.htmlSafe(this.collectionTubeColor(c))}"></span>${this.htmlSafe(this.collectionTubeLabel(c))}</td><td>${this.htmlSafe(this.dateTime(c.collected_at))}</td><td>${this.collectionTestNames(c).map(t=>this.htmlSafe(t)).join('<br>') || '-'}</td><td>${this.htmlSafe(c.remarks || c.reject_reason || '-')}</td></tr>`).join('');
    const html=`<html><head><title>Bill ${this.htmlSafe(g?.bill_no || '')} details</title><style>body{font-family:Arial,sans-serif;padding:26px;color:#111;background:#fff}h2{margin:0 0 4px}.muted{color:#666;font-size:12px}.top{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}.box{border:1px solid #ccc;border-radius:12px;padding:12px}b{font-weight:700}table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#f3f4f6;text-align:left}td,th{border:1px solid #d1d5db;padding:9px;vertical-align:top;font-size:13px}td span{color:#666}.tube-dot{display:inline-block;width:14px;height:14px;border-radius:4px;margin-right:7px;vertical-align:-2px;border:1px solid #999}.actions{margin:0 0 16px;text-align:right}@media print{.actions{display:none}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div><h2>Collection Bill Details</h2><div class="muted">Generated: ${DateTimeSettingsService.dateTime(new Date())}</div><div class="top"><div class="box"><b>Bill No:</b> ${this.htmlSafe(g?.bill_no || '-')}<br><b>Patient:</b> ${this.htmlSafe(g?.patient_name || '-')} ${this.htmlSafe(this.patientAgeGender(g) !== '—' ? ' · '+this.patientAgeGender(g) : '')}<br><b>Patient No:</b> ${this.htmlSafe(g?.patient_no || '-')}</div><div class="box"><b>Total samples:</b> ${+g?.sampleCount || samples.length}<br><b>Tests billed:</b> ${+g?.billedTests || 0}<br><b>Status:</b> Sample collected · ${this.htmlSafe(g?.reportStatus || '-')}</div></div><table><thead><tr><th>Sample</th><th>Tube</th><th>Collected</th><th>Tests</th><th>Remarks</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No sample details found.</td></tr>'}</tbody></table></body></html>`;
    const w=window.open('','_blank','width=980,height=760'); if(w){ w.document.write(html); w.document.close(); }
  }

  isRejectedCollection(c:any){ return this.tab()==='rejected' || String(c?.status || c?.collection_status || '').toUpperCase()==='REJECTED'; }
  isRejectedCollectionGroup(g:any){ return this.tab()==='rejected' || (g?.samples || []).some((x:any)=>this.isRejectedCollection(x)); }
  collectionTubeColor(c:any){ return this.tubeColorForSpecimen(c?.specimen_name || c?.specimen || c?.sample_type || ''); }
  collectionTubeLabel(c:any){ return this.tubeLabel(c?.specimen_name || c?.specimen || c?.sample_type || ''); }
  billGroupTubeColor(g:any){ const s=(g?.samples || [])[0]; return s ? this.collectionTubeColor(s) : '#64748b'; }
  billGroupTubeLabel(g:any){ const names=Array.from(new Set((g?.samples || []).map((x:any)=>this.collectionTubeLabel(x)).filter(Boolean))); return names.length===1 ? String(names[0]) : (names.length ? 'Mixed tubes' : 'Tube'); }
  printBillDetails(g:any){ this.viewBillDetailsPdf(g); }
  printCollectionDetails(c:any){ this.viewBillDetailsPdf(this.collectionGroupForSingle(c)); }
  printBillBarcodes(g:any){ (g?.samples || []).forEach((c:any, idx:number)=>{ setTimeout(()=>this.printBarcode(c), idx*250); }); }
  printBarcode(c:any){
    const barcodeValue=String(c?.specimen_id || c?.bill_no || '').trim();
    if(!barcodeValue){ throw new Error('Cannot print barcode: specimen ID and bill number are empty.'); }
    const id=this.htmlSafe(barcodeValue);
    const tube=this.htmlSafe(this.collectionTubeLabel(c));
    const tubeColor=this.htmlSafe(this.collectionTubeColor(c));
    const html=`<html><head><title>Barcode ${id}</title><style>body{font-family:Arial,sans-serif;padding:18px;color:#111}.label{width:360px;border:1px solid #111;border-radius:10px;padding:12px}.top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.id{font-size:17px;font-weight:800}.muted{font-size:11px;color:#555;margin-top:2px}.tube{display:inline-flex;align-items:center;gap:6px;border:1px solid #bbb;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:700}.dot{width:12px;height:12px;border-radius:3px;background:${tubeColor};border:1px solid #777}.barcode{width:45mm;max-width:100%;height:64px;margin:12px auto 8px}.barcode svg{display:block;width:100%;height:100%}.small{font-size:12px}@media print{body{padding:0}.label{break-inside:avoid}}</style></head><body><div class="label"><div class="top"><div><div class="id">${id}</div><div class="muted">${this.htmlSafe(c?.specimen_name || '-')} · ${this.htmlSafe(c?.sample_type || '-')}</div></div><span class="tube"><i class="dot"></i>${tube}</span></div><div class="barcode">${code128Svg(barcodeValue)}</div><div class="small"><b>${this.htmlSafe(c?.patient_name || '-')}</b> · ${this.htmlSafe(c?.bill_no || '-')}</div></div><script>window.print();</script></body></html>`;
    const w=window.open('', '_blank', 'width=450,height=320'); if(w){ w.document.write(html); w.document.close(); }
  }

  patientAgeGender(c:any){ return [c?.age, c?.gender].filter(x=>String(x||'').trim()).join(' / ') || '—'; }
  reportWorkflowStatus(c:any){
    const normalize=(v:any)=>String(v || '').toUpperCase().replace(/[\s-]+/g,'_');
    const reportStatus=normalize(c?.report_status || c?.reportStatus || '');
    const approvalStatus=normalize(c?.approval_status || c?.report_approval_status || '');
    const approved=+(c?.approved_test_count ?? 0) || 0;
    const entered=+(c?.entered_test_count ?? c?.typed_test_count ?? 0) || 0;
    const pending=+(c?.report_pending_test_count ?? 0) || 0;
    const total=+(c?.test_count ?? 0) || this.collectionTestNames(c).length || 0;
    const approvedStatuses=new Set(['APPROVED','REPORT_APPROVED','APPROVAL_COMPLETED']);
    const approvalStatuses=new Set(['WAITING_APPROVAL','AWAITING_APPROVAL','PENDING_APPROVAL','DRAFTED_PENDING_APPROVAL','DRAFT_PENDING_APPROVAL','TYPED','ENTERED']);
    if(total>0 && approved>=total) return 'Report approved';
    if(total>0 && entered>0) return 'Pending approval';
    if(approvedStatuses.has(reportStatus) || approvedStatuses.has(approvalStatus)) return 'Report approved';
    if((approvalStatuses.has(reportStatus) || approvalStatuses.has(approvalStatus)) && total>0 && pending===0) return 'Pending approval';
    return 'Report pending';
  }
  canRejectCollection(c:any){
    if(this.isRecheckCollection(c)) return false;
    const workflow=this.reportWorkflowStatus(c);

    // What the user sees as plain "Report pending" must remain rejectable.
    if(workflow==='Report pending') return true;

    // Once the report is approved, drafted, typed, or waiting approval, rejection is locked.
    if(workflow==='Report approved' || workflow==='Pending approval') return false;

    return true;
  }
  tabCount(id: CollectionTab){
    if(id==='log') return this.collectionLogs.length;
    if(id==='pending') return this.pendingBills.reduce((a,b)=>a+(+b.pending_count||0),0);
    if(id==='collectionpending') return this.acceptedPendingBills.reduce((a,b)=>a+(+b.pending_count||0),0);
    return this.collections.filter(c=>{
      const status = String(c.status||'').toUpperCase();
      const rejected = status==='REJECTED';
      const inactive = this.inactiveCollectionStatus(c);
      const hasInhouse = (+c.inhouse_test_count || 0) > 0;
      const hasOutsource = (+c.outsource_test_count || 0) > 0;
      const hasInternal = (+c.internal_check_test_count || 0) > 0 || (+c.internal_check_required || 0) === 1;
      return id==='rejected' ? rejected : id==='internalcheck' ? !rejected && !inactive && hasInternal && String(c.internal_check_status||'PENDING').toUpperCase()!=='DONE' : id==='outsource' ? !rejected && !inactive && hasOutsource : id==='inhouse' ? !rejected && !inactive && hasInhouse : false;
    }).length;
  }

  workflowCount(id: WorkflowStep){
    if(id==='requests') return this.tabCount('pending');
    if(id==='collection') return this.tabCount('collectionpending') + this.tabCount('inhouse') + this.tabCount('outsource') + this.tabCount('internalcheck') + this.tabCount('rejected');
    if(id==='logs') return this.tabCount('log');
    // Reporting has its own live status pills inside the Reporting step. Show collection items waiting for report workflow here.
    return this.collections.filter(c=>!this.isRejectedCollection(c) && this.reportWorkflowStatus(c)!=='Report approved').length;
  }

  workflowSubtitle(){
    const step=this.workflowStep();
    if(step==='requests') return 'Approve requests and start collection when ready.';
    if(step==='collection') return 'Collected sample workflow by current collection status.';
    if(step==='reporting') return 'Pending results, approval, rechecks, approved reports and report log.';
    return 'Full collection activity history.';
  }

  tabIcon(id: CollectionTab){ return id==='pending'?'▣':id==='collectionpending'?'⌛':id==='inhouse'?'⌂':id==='outsource'?'↗':id==='internalcheck'?'☑':id==='rejected'?'♨':'▤'; }
  collectStepStatusTitle(){ return this.step()===1 ? 'Select tests + collection type' : this.step()===2 ? 'Collection details' : this.step()===3 ? 'Tubes to prepare' : 'Ready to save collection'; }
  collectStepStatusText(){ return this.step()===1 ? 'Choose tests and set collection type. All selected tests must have the same collection type.' : this.step()===2 ? 'Configure specimen, mode, priority, time when needed and remarks for the selected tests.' : this.step()===3 ? 'Review specimen groups. One specimen type creates one specimen ID for this collection.' : 'Review selected tests and specimen groups before saving.'; }

  currentListTitle(){ return this.tab()==='collectionpending'?'Accepted requests pending collection':this.tab()==='inhouse'?'In-house collected specimens':this.tab()==='outsource'?'Outsource waiting specimens':this.tab()==='internalcheck'?'Internal check specimens':this.tab()==='log'?'Collection Log':this.tab()==='rejected'?'Rejected specimens':'Pending Requests'; }
  statusLabel(s:string){ const x=String(s||'').toUpperCase(); return x==='REJECTED'?'Rejected':x==='OUTSOURCE_RESULT_RECEIVED'?'Outsource · result received':x==='OUTSOURCE_DISPATCHED'?'Outsource · dispatched':(x==='OUTSOURCE_READY'||x==='OUTSOURCE')?'Outsource · waiting result':x==='RECOLLECT_REQUESTED'?'Recollect requested':x==='COLLECTED'?'Collected · waiting report':'Collected'; }
  tabStatusText(){ return this.tab()==='collectionpending'?'Accepted requests waiting for sample collection.':this.tab()==='outsource'?'Outsource specimens with vendor, priority and dispatch print.':this.tab()==='internalcheck'?'Outsource specimens waiting for local verification value.':this.tab()==='rejected'?'Rejected specimens needing recollection or deletion.':this.tab()==='inhouse'?'Collected in-house specimens waiting for report workflow.':'Request worklist'; }
  pendingStepStatus(){
    const total = this.collectionTests.length;
    const selected = this.selectedTests().length;
    return total ? `${selected}/${total} selected` : 'No pending tests';
  }
  tubesStepStatus(){
    const selected = this.selectedTests();
    if(!selected.length) return 'Select tests first';
    const missing = selected.filter(t=>!t.specimen_type_id).length;
    return missing ? `${missing} tube/specimen missing` : 'Tubes ready';
  }
  detailsStepStatus(){
    const selected = this.selectedTests();
    if(!selected.length) return 'Select tests first';
    const check = selected.filter(t=>t.collection_mode==='BOTH').length;
    const outsource = selected.filter(t=>t.collection_mode==='OUTSOURCE').length;
    const inhouse = selected.length - outsource - check;
    return (outsource || check) ? `${inhouse} in-house · ${outsource} outsource · ${check} internal check` : `${inhouse} in-house`;
  }
  reviewStepStatus(){
    const groups = this.collectionGroups().length;
    return groups ? `${groups} specimen group${groups>1?'s':''} ready` : 'Not ready';
  }
  dateOnly(v:any){ return DateTimeSettingsService.date(v); }
  today(){ return new Date().toISOString().slice(0,10); }

  private normalizedTestName(t:any){ return String(t?.test_name || '').toLowerCase().replace(/[^a-z0-9]+/g,' '); }
  detectTimedCategory(t:any): 'NORMAL' | 'FASTING' | 'POST_PRANDIAL' {
    const masterRule = String(t?.collection_rule || '').toUpperCase();
    if(masterRule === 'FASTING') return 'FASTING';
    if(masterRule === 'POST_PRANDIAL' || masterRule === 'TIMED_INTERVAL') return 'POST_PRANDIAL';
    const n = this.normalizedTestName(t);
    const isPp = /\b(pp|ppbs|post prandial|postprandial|post meal|after food|2 hr|2 hour|two hour)\b/.test(n) || n.includes('post prandial') || n.includes('postprandial');
    if(isPp) return 'POST_PRANDIAL';
    const isFasting = /\b(fbs|fasting|fasting blood sugar)\b/.test(n) || n.includes('fasting');
    if(isFasting) return 'FASTING';
    return 'NORMAL';
  }
  timedCategoryLabel(t:any){ const c=t?.timed_category || this.detectTimedCategory(t); return c==='FASTING'?'Fasting':c==='POST_PRANDIAL'?'Post-prandial':'Routine'; }
  private localDateTimeAfter(minutes:number){ return DateTimeSettingsService.addMinutesInputValue(minutes); }
  applySmartTimedRules(){
    const hasFasting = this.collectionTests.some(t=>t.timed_category==='FASTING');
    const hasPp = this.collectionTests.some(t=>t.timed_category==='POST_PRANDIAL');
    this.collectionTests.forEach(t=>{
      t.timed_category = t.timed_category || this.detectTimedCategory(t);
      if(t.timed_category==='FASTING'){
        t.sample_type='Fasting';
        t.collect_timing='NOW';
        t.timed_note = hasPp ? 'Collect fasting sample now. PP sample must be separate.' : 'Fasting sample.';
      } else if(t.timed_category==='POST_PRANDIAL'){
        const gap = Math.max(0, +t.collection_gap_minutes! || 120);
        t.sample_type='Post-prandial';
        t.collect_timing='LATER';
        t.expected_collect_at = t.expected_collect_at || this.localDateTimeAfter(gap);
        t.remarks = t.remarks || t.collection_instruction || 'Post-prandial sample - collect separately after meal time.';
        t.timed_note = t.collection_instruction || (hasFasting ? 'Auto scheduled separately; do not collect with fasting sample.' : 'Post-prandial timed sample.');
      } else {
        t.timed_note='';
      }
    });
  }
  hasFastingAndPpSelected(){ const selected=this.selectedTests(); return selected.some(t=>t.timed_category==='FASTING') && selected.some(t=>t.timed_category==='POST_PRANDIAL'); }
  timedRuleSummary(){
    const hasFasting=this.collectionTests.some(t=>t.timed_category==='FASTING');
    const hasPp=this.collectionTests.some(t=>t.timed_category==='POST_PRANDIAL');
    if(hasFasting && hasPp) return 'Fasting and post-prandial tests were detected. PP tests are scheduled separately so both samples are not collected together accidentally.';
    if(hasPp) return 'Post-prandial test detected. It is marked as scheduled/collect later by default; change to collect now only when the PP time is actually due.';
    if(hasFasting) return 'Fasting test detected. Sample type is set to Fasting automatically.';
    return '';
  }
  onTimingChange(t:CollectionTestRow){
    if(t.timed_category==='POST_PRANDIAL' && t.collect_timing==='LATER' && !t.expected_collect_at) t.expected_collect_at=this.localDateTimeAfter(Math.max(0, +t.collection_gap_minutes! || 120));
    this.markDirty();
  }
  private fixedCollectionTypeFor(t: CollectionTestRow){
    const rule = String(t?.collection_rule || '').toUpperCase();
    const timed = t?.timed_category || this.detectTimedCategory(t);
    if(rule === 'FASTING' || timed === 'FASTING') return 'Fasting';
    if(rule === 'POST_PRANDIAL' || rule === 'TIMED_INTERVAL' || timed === 'POST_PRANDIAL') return 'Post-prandial';
    return '';
  }
  canChangeCollectionType(t: CollectionTestRow){ return !this.fixedCollectionTypeFor(t); }
  private applyCollectionTypeIfAllowed(t: CollectionTestRow, sample: string){
    const fixed = this.fixedCollectionTypeFor(t);
    t.sample_type = fixed || sample || 'Random';
    if(t.sample_type === 'Post-prandial'){
      t.collect_timing = 'LATER';
      t.expected_collect_at = t.expected_collect_at || this.localDateTimeAfter(Math.max(0, +t.collection_gap_minutes! || 120));
    }
  }
  onStep1CollectionTypeChange(t: CollectionTestRow, sample: string){
    this.applyCollectionTypeIfAllowed(t, sample);
    // One collection event can use only one collection type. When the user picks a type
    // on any selected row, apply it to other selected tests where the master/default rule
    // allows changing it. Fixed tests such as Fasting or PP keep their default type.
    this.selectedTests().filter(x=>x.report_item_id !== t.report_item_id).forEach(x=>this.applyCollectionTypeIfAllowed(x, sample));
    this.markDirty();
  }


  async acceptRequest(b:any){
    if(!b?.id) return;
    try{
      this.unwrapCollectionResult(await this.api?.acceptCollectionRequest?.(b.id));
      this.changed.emit();
      await this.load();
      this.workflowStep.set('collection');
      this.tab.set('collectionpending');
      this.mode.set('list');
      this.step.set(1);
    }catch(err:any){
      this.formError=this.friendlyError(err);
    }
  }

  async cancelPendingCollection(b:any){
    if(!b?.id) return;
    try{
      this.unwrapCollectionResult(await this.api?.cancelAcceptedCollectionRequest?.(b.id));
      this.changed.emit();
      await this.load();
      this.workflowStep.set('requests');
      this.tab.set('pending');
      this.mode.set('list');
      this.step.set(1);
    }catch(err:any){
      this.formError=this.friendlyError(err);
    }
  }

  async openCollection(b:any){
    this.activeBill=b;
    const data = await this.api?.getCollectionBill?.(b.id);
    this.collectionTests = (data?.tests || []).map((t:any) => {
      const opts = t.specimen_options || [];
      const single = opts.length === 1 ? opts[0] : null;
      const row:any = {...t, selected:true, specimen_type_id:single?.id || 0, specimen_name:single?.name || '', sample_type:'Random', collection_mode:'INHOUSE', collect_timing:'NOW', sample_priority:'ROUTINE', outsource_vendor_id:0, remarks:'', specimen_required: opts.length > 1, specimen_missing:false, override:false};
      row.timed_category = this.detectTimedCategory(row);
      return row;
    });
    this.applySmartTimedRules();
    this.mode.set('collect'); this.step.set(1); this.dirty=false;
  }
  allSelected(){ return this.collectionTests.length>0 && this.collectionTests.every(t=>t.selected); }
  toggleAll(v:boolean){ this.collectionTests.forEach(t=>t.selected=v); this.markDirty(); }
  selectedTests(){ return this.collectionTests.filter(t=>t.selected); }
  selectedCollectionTypes(){ return Array.from(new Set(this.selectedTests().map(t=>this.collectionTypeDisplay(t)).filter(Boolean))); }
  groupAllSelected(g:any){ return (g?.tests || []).length > 0 && (g?.tests || []).every((t:CollectionTestRow)=>!!t.selected); }
  groupPartiallySelected(g:any){ const tests=g?.tests || []; return tests.some((t:CollectionTestRow)=>!!t.selected) && !tests.every((t:CollectionTestRow)=>!!t.selected); }
  toggleGroupSelection(g:any, checked:boolean){ (g?.tests || []).forEach((t:CollectionTestRow)=>t.selected=checked); this.markDirty(); }
  groupSampleTypeValue(g:any){ return this.oneValue(g, (t)=>t.sample_type || 'Random'); }
  setGroupSampleType(g:any, sample:any){
    if(sample && sample!=='MIXED'){
      (g?.tests || []).filter((t:CollectionTestRow)=>!!t.selected).forEach((t:CollectionTestRow)=>this.applyCollectionTypeIfAllowed(t, sample));
      this.markDirty();
    }
  }
  goToCollectionDetails(){
    const selected=this.selectedTests();
    if(!selected.length){ this.formError='Select at least one test to collect.'; this.step.set(1); return; }
    const types=this.selectedCollectionTypes();
    if(types.length>1){ this.formError='Different collection types selected. Select only one collection type for this collection, or change all selected tests to the same collection type.'; this.step.set(1); return; }
    this.formError='';
    this.step.set(2);
  }
  onSpecimenChange(t:CollectionTestRow){ const s=(t.specimen_options||[]).find((x:any)=>+x.id===+t.specimen_type_id!); t.specimen_name=s?.name || ''; t.specimen_missing=!t.specimen_type_id; this.markDirty(); }
  onRowSpecimenChange(t:CollectionTestRow){ this.onSpecimenChange(t); t.override=true; }
  markRowCustom(t:CollectionTestRow){ t.override=true; this.markDirty(); }
  singleSpecimen(t:CollectionTestRow){ const opts=t.specimen_options || []; return opts.length===1 ? opts[0] : null; }

  requiresTiming(t: CollectionTestRow){
    const type = String(t.sample_type || '').toLowerCase();
    return type.includes('post') || type.includes('pp') || type.includes('timed') || type.includes('scheduled');
  }
  collectionTimeValue(t:CollectionTestRow){
    const v=String(t.expected_collect_at || '');
    const match=v.match(/T(\d{2}:\d{2})/);
    if(match) return match[1];
    if(/^\d{2}:\d{2}$/.test(v)) return v;
    return '';
  }
  setCollectionTime(t:CollectionTestRow, value:string){
    if(value){
      const d=new Date();
      const yyyy=d.getFullYear();
      const mm=String(d.getMonth()+1).padStart(2,'0');
      const dd=String(d.getDate()).padStart(2,'0');
      t.expected_collect_at=`${yyyy}-${mm}-${dd}T${value}`;
      t.collect_timing='LATER';
    } else {
      t.expected_collect_at='';
      t.collect_timing='NOW';
    }
    t.override=true;
    this.markDirty();
  }
  applyBulkMode(){ this.selectedTests().forEach(t=>t.collection_mode=this.bulkMode); this.markDirty(); }
  applyBulkSpecimenId(){ const id=+this.bulkSpecimenId || 0; if(!id) return this.applyBulkSpecimenDefaults(); this.selectedTests().forEach(t=>this.applySpecimenToTest(t,id)); this.markDirty(); }
  applyBulkSampleType(){ this.selectedTests().forEach(t=>this.applyCollectionTypeIfAllowed(t, this.bulkSampleType)); this.markDirty(); }
  applyBulkPriority(){ this.selectedTests().forEach(t=>t.sample_priority=this.bulkPriority); this.markDirty(); }
  applyBulkOutsourceVendor(){ this.selectedTests().filter(t=>t.collection_mode==='OUTSOURCE' || t.collection_mode==='BOTH').forEach(t=>t.outsource_vendor_id=this.bulkOutsourceVendorId); this.markDirty(); }
  applyBulkSpecimenDefaults(){ this.selectedTests().forEach(t=>{ const d=(t.specimen_options||[]).find((s:any)=>s.is_default) || (t.specimen_options||[])[0]; if(d){ t.specimen_type_id=d.id; t.specimen_name=d.name; t.specimen_missing=false; }}); this.markDirty(); }

  private applySpecimenToTest(t:CollectionTestRow, specimenId:any){
    const s=(t.specimen_options||[]).find((x:any)=>+x.id===+specimenId);
    if(s){ t.specimen_type_id=s.id; t.specimen_name=s.name; t.specimen_missing=false; }
  }
  allSpecimenOptions(){
    const map = new Map<number, any>();
    this.selectedTests().forEach(t => (t.specimen_options||[]).forEach((s:any)=>{ if(s?.id && !map.has(+s.id)) map.set(+s.id, s); }));
    return Array.from(map.values()).sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||'')));
  }
  profileGroups(onlySelected = false){
    const rows = onlySelected ? this.selectedTests() : this.collectionTests;
    const map = new Map<string, any>();

    for(const t of rows){
      const sourceName = String(t.source_profile_name || '').trim();
      const hasProfile = !!sourceName;
      const key = hasProfile ? `P|${t.source_profile_id || sourceName}` : 'I|Individual tests';
      const name = hasProfile ? sourceName : 'Individual tests';

      if(!map.has(key)){
        map.set(key, { key, name, tests: [] as CollectionTestRow[] });
      }

      map.get(key).tests.push(t);
    }

    // In details/review flow, a profile heading must appear only when at least
    // one test under that profile is selected. Completely deselected profiles
    // are hidden, while a single selected test still keeps its profile heading.
    return Array.from(map.values()).filter((g:any)=>Array.isArray(g.tests) && g.tests.length >= 1);
  }
  trackProfileGroup(_i:number,g:any){ return g.key; }
  private oneValue(g:any, getter:(t:CollectionTestRow)=>any, mixed:any='MIXED'){
    const values = (g?.tests || []).map((t:CollectionTestRow)=>getter(t)).filter((v:any)=>v!==undefined && v!==null && v!=='');
    if(!values.length) return mixed;
    return values.every((v:any)=>String(v)===String(values[0])) ? values[0] : mixed;
  }
  profileSpecimenOptions(g:any){
    const map = new Map<number, any>();
    (g?.tests || []).forEach((t:CollectionTestRow)=>(t.specimen_options||[]).forEach((s:any)=>{ if(s?.id && !map.has(+s.id)) map.set(+s.id, s); }));
    return Array.from(map.values()).sort((a:any,b:any)=>String(a.name||'').localeCompare(String(b.name||'')));
  }
  private profileSelectedTests(g:any, includeOverride = true): CollectionTestRow[]{
    const rows = (g?.tests || []).filter((t:CollectionTestRow)=>!!t.selected);
    return includeOverride ? rows : rows.filter((t:CollectionTestRow)=>!t.override);
  }
  profileSpecimenValue(g:any){ return this.oneValue({tests:this.profileSelectedTests(g)}, (t)=>+t.specimen_type_id! || 0, 0); }
  profileModeValue(g:any){ return this.oneValue({tests:this.profileSelectedTests(g)}, (t)=>t.collection_mode || 'INHOUSE'); }
  profileNeedsVendor(g:any){ return this.profileSelectedTests(g).some((t:CollectionTestRow)=>t.collection_mode==='OUTSOURCE' || t.collection_mode==='BOTH'); }
  profileVendorValue(g:any){ return this.oneValue({tests:this.profileSelectedTests(g)}, (t)=> (t.collection_mode==='OUTSOURCE' || t.collection_mode==='BOTH') ? (+t.outsource_vendor_id! || 0) : 0, 0); }
  profileSampleTypeValue(g:any){ return this.oneValue({tests:this.profileSelectedTests(g)}, (t)=>t.sample_type || 'Random'); }
  profilePriorityValue(g:any){ return this.oneValue({tests:this.profileSelectedTests(g)}, (t)=>t.sample_priority || 'ROUTINE'); }
  setProfileSpecimen(g:any, id:any){
    if(+id){
      this.profileSelectedTests(g, false).forEach((t:CollectionTestRow)=>this.applySpecimenToTest(t,id));
      this.markDirty();
    }
  }
  setProfileMode(g:any, mode:any){
    if(mode && mode!=='MIXED'){
      this.profileSelectedTests(g, false).forEach((t:CollectionTestRow)=>{
        t.collection_mode=mode;
        if(mode==='INHOUSE') t.outsource_vendor_id=0;
      });
      this.markDirty();
    }
  }
  setProfileVendor(g:any, vendorId:any){
    const id=+vendorId || 0;
    // Apply vendor only to selected outsourced tests in this profile.
    // Never push unselected profile tests into outsource/vendor workflow.
    this.profileSelectedTests(g)
      .filter((t:CollectionTestRow)=>t.collection_mode==='OUTSOURCE' || t.collection_mode==='BOTH')
      .forEach((t:CollectionTestRow)=>t.outsource_vendor_id=id);
    this.markDirty();
  }
  setProfileSampleType(g:any, sample:any){
    if(sample && sample!=='MIXED'){
      this.profileSelectedTests(g, false).forEach((t:CollectionTestRow)=>this.applyCollectionTypeIfAllowed(t,sample));
      this.markDirty();
    }
  }
  setProfilePriority(g:any, priority:any){
    if(priority && priority!=='MIXED'){
      this.profileSelectedTests(g, false).forEach((t:CollectionTestRow)=>t.sample_priority=priority);
      this.markDirty();
    }
  }
  applyProfileToAll(g:any){
    const rows = this.profileSelectedTests(g);
    const specimen = this.profileSpecimenValue(g);
    const mode = this.profileModeValue(g);
    const vendor = this.profileVendorValue(g);
    const sample = this.profileSampleTypeValue(g);
    const priority = this.profilePriorityValue(g);
    if(+specimen) rows.forEach((t:CollectionTestRow)=>this.applySpecimenToTest(t,specimen));
    if(mode && mode!=='MIXED') rows.forEach((t:CollectionTestRow)=>{ t.collection_mode=mode; if(mode==='INHOUSE') t.outsource_vendor_id=0; });
    if(+vendor) rows.filter((t:CollectionTestRow)=>t.collection_mode==='OUTSOURCE' || t.collection_mode==='BOTH').forEach((t:CollectionTestRow)=>t.outsource_vendor_id=+vendor);
    if(sample && sample!=='MIXED') rows.forEach((t:CollectionTestRow)=>this.applyCollectionTypeIfAllowed(t,sample));
    if(priority && priority!=='MIXED') rows.forEach((t:CollectionTestRow)=>t.sample_priority=priority);
    rows.forEach((t:CollectionTestRow)=>t.override=false);
    this.markDirty();
  }

  enableTestOverride(t:CollectionTestRow){ t.override=true; if(!t.specimen_type_id && (t.specimen_options||[]).length===1) this.applySpecimenToTest(t,(t.specimen_options||[])[0].id); this.markDirty(); }
  clearTestOverride(t:CollectionTestRow){ t.override=false; this.markDirty(); }
  specimenDisplay(t:CollectionTestRow){ return t.specimen_name || (t.specimen_type_id ? String(t.specimen_type_id) : 'Select specimen'); }
  modeDisplay(t:CollectionTestRow){ return t.collection_mode==='OUTSOURCE' ? 'Outsource' : t.collection_mode==='BOTH' ? 'Outsource + check' : 'In-house'; }
  collectionTypeDisplay(t:CollectionTestRow){ return t.sample_type==='Specify' ? (t.custom_sample_type || 'Specify') : (t.sample_type || 'Random'); }
  priorityDisplay(t:CollectionTestRow){ return this.priorityLabel(t.sample_priority || 'ROUTINE'); }
  timingDisplay(t:CollectionTestRow){ return t.collect_timing==='LATER' ? 'Scheduled' : 'Collect now'; }

  collectionGroups(){
    const groups:any[]=[];
    for(const t of this.selectedTests()){
      const sample = t.sample_type==='Specify' ? (t.custom_sample_type || 'Specified') : (t.sample_type || 'Random');
      const priority = t.sample_priority || 'ROUTINE';
      const timing = t.collect_timing || 'NOW';
      const expected = t.expected_collect_at || '';

      // One physical specimen/container must create one barcode/sample ID.
      // Do NOT split the same specimen by In-house / Outsource / Internal check.
      // Per-test routing is stored on the individual report items, while the
      // specimen row is only a container/sample record.
      const key=[
        t.specimen_type_id || 0,
        t.specimen_name || '',
        sample,
        timing,
        expected
      ].join('|');

      let g=groups.find(x=>x.key===key);
      if(!g){
        g={
          key,
          specimen_type_id:t.specimen_type_id,
          specimen_name:t.specimen_name || 'Specimen',
          sample_type:sample,
          mode:'INHOUSE',
          collection_mode:'INHOUSE',
          internal_check_required:false,
          outsource_vendor_id:0,
          sample_priority:priority,
          collect_timing:timing,
          expected_collect_at:expected,
          remarks:t.remarks||'',
          tests:[]
        };
        groups.push(g);
      }
      g.tests.push(t);
      const hasInternal = g.tests.some((x:CollectionTestRow)=>x.collection_mode==='BOTH');
      const hasOutsource = g.tests.some((x:CollectionTestRow)=>x.collection_mode==='OUTSOURCE' || x.collection_mode==='BOTH');
      const firstVendor = g.tests.find((x:CollectionTestRow)=>x.collection_mode==='OUTSOURCE' || x.collection_mode==='BOTH')?.outsource_vendor_id || 0;
      g.mode = hasOutsource ? 'OUTSOURCE' : 'INHOUSE';
      g.collection_mode = g.mode;
      g.internal_check_required = hasInternal;
      g.outsource_vendor_id = +firstVendor || 0;
      if(t.remarks && !String(g.remarks || '').includes(t.remarks)) g.remarks = g.remarks ? `${g.remarks}; ${t.remarks}` : t.remarks;
    }
    return groups;
  }
  tubeGroups(){
    return this.collectionGroups().map((g:any)=>({
      ...g,
      color: this.tubeColorForSpecimen(g.specimen_name),
      label: this.tubeLabel(g.specimen_name),
      hint: this.tubeHint(g.specimen_name)
    }));
  }
  timingLabel(v:any){ return String(v||'NOW').toUpperCase()==='LATER' ? 'Scheduled later' : 'Collect now'; }
  requiresVendor(t:CollectionTestRow){ return t.collection_mode === 'OUTSOURCE' || t.collection_mode === 'BOTH'; }
  isVendorMissing(t:CollectionTestRow){ return !!t.selected && this.requiresVendor(t) && !(+t.outsource_vendor_id!); }
  missingVendorTests(){ return this.selectedTests().filter(t=>this.isVendorMissing(t)); }
  validateCollectionDetailsBeforeNext(){
    const missingVendor=this.missingVendorTests();
    if(missingVendor.length){
      this.formError = missingVendor.length === 1 ? `Select outsource vendor for ${missingVendor[0].test_name} before continuing.` : `Select outsource vendor for ${missingVendor.length} outsourced tests before continuing.`;
      this.step.set(2);
      return false;
    }
    return true;
  }

  nowForDisplay(){ return new Date(); }
  private isPostPrandialEarly(t: CollectionTestRow){
    const isPp = (t.timed_category || this.detectTimedCategory(t)) === 'POST_PRANDIAL' || String(t.sample_type || '').toLowerCase().includes('post');
    if(!isPp || !t.expected_collect_at) return false;
    const due = new Date(String(t.expected_collect_at).includes('T') ? String(t.expected_collect_at) : String(t.expected_collect_at).replace(' ', 'T'));
    if(Number.isNaN(due.getTime())) return false;
    return Date.now() < due.getTime();
  }
  private selectedEarlyPostPrandialTests(){ return this.selectedTests().filter(t=>this.isPostPrandialEarly(t)); }
  closePpEarlyPrompt(){ this.ppEarlyPromptOpen=false; this.earlyPpTests=[]; this.ppEarlyConfirmed=false; }
  confirmPpEarlyProceed(){ this.ppEarlyPromptOpen=false; this.ppEarlyConfirmed=true; this.formError=''; this.step.set(3); }

  goToTubes(){
    this.selectedTests().forEach(t=>t.specimen_missing=false);
    const missing=this.selectedTests().filter(t=>!t.specimen_type_id);
    if(missing.length){ missing.forEach(t=>t.specimen_missing=true); this.showMissingSpecimenPrompt(missing); return; }
    if(!this.validateCollectionDetailsBeforeNext()) return;
    const types=this.selectedCollectionTypes();
    if(types.length>1){ this.formError='Different collection types selected. Save one collection type at a time.'; this.step.set(1); return; }
    const earlyPp=this.selectedEarlyPostPrandialTests();
    if(earlyPp.length && !this.ppEarlyConfirmed){ this.earlyPpTests=earlyPp; this.ppEarlyPromptOpen=true; return; }
    this.ppEarlyConfirmed=false;
    this.formError='';
    this.step.set(3);
  }
  goToReview(){
    this.selectedTests().forEach(t=>t.specimen_missing=false);
    const missing=this.selectedTests().filter(t=>!t.specimen_type_id);
    if(missing.length){ missing.forEach(t=>t.specimen_missing=true); this.showMissingSpecimenPrompt(missing); return; }
    this.formError='';
    this.step.set(4);
  }
  needsSpecimenChoice(t:CollectionTestRow){ return (t.specimen_options || []).length > 1; }
  specimenOptionNames(t:CollectionTestRow){ return (t.specimen_options || []).map((s:any)=>s.name).join(' / ') || 'No specimen configured'; }
  closeSpecimenPrompt(){ this.specimenPromptOpen=false; this.step.set(2); }
  private showMissingSpecimenPrompt(missing:CollectionTestRow[]){
    this.missingSpecimenTests=missing;
    this.specimenPromptOpen=true;
    this.formError = missing.length === 1 ? `Select specimen type for ${missing[0].test_name} before collection.` : `Select specimen type for ${missing.length} selected tests before collection.`;
    this.step.set(2);
  }
  tubeColorForTest(t:any){ return this.tubeColorForSpecimen(t?.specimen_name || this.selectedSpecimenName(t)); }
  tubeLabelForTest(t:any){ const name=t?.specimen_name || this.selectedSpecimenName(t); return name ? this.tubeLabel(name) : 'Select tube'; }
  tubeHintForTest(t:any){ const name=t?.specimen_name || this.selectedSpecimenName(t); return name ? this.tubeHint(name) : 'Specimen required'; }
  private selectedSpecimenName(t:any){ const s=(t?.specimen_options||[]).find((x:any)=>+x.id===Number(t?.specimen_type_id || 0)); return s?.name || ''; }
  private tubeColorForSpecimen(name:any){
    const n=String(name||'').toLowerCase();
    if(/citrate.*3\.8|3\.8.*citrate/.test(n)) return '#111827';
    if(/citrate.*3\.2|3\.2.*citrate|sodium citrate|citrate|coag|pt|aptt/.test(n)) return '#38bdf8';
    if(/sst|serum separator|gel tube|gel/.test(n)) return '#facc15';
    if(/serum|clot/.test(n)) return '#ef4444';
    if(/heparin|lithium heparin/.test(n)) return '#22c55e';
    if(/fluoride|glucose|sugar|oxalate/.test(n)) return '#94a3b8';
    if(/edta|whole blood|cbc|hematology/.test(n)) return '#a855f7';
    if(/urine/.test(n)) return '#f59e0b';
    if(/stool/.test(n)) return '#92400e';
    if(/swab|culture/.test(n)) return '#ef4444';
    return '#64748b';
  }
  private tubeLabel(name:any){
    const n=String(name||'').toLowerCase();
    if(/citrate.*3\.8|3\.8.*citrate/.test(n)) return 'Black / Citrate 3.8% plasma';
    if(/citrate.*3\.2|3\.2.*citrate|sodium citrate|citrate|coag|pt|aptt/.test(n)) return 'Sky blue / Citrate 3.2% plasma';
    if(/sst|serum separator|gel tube|gel/.test(n)) return 'Yellow / SST gel tube';
    if(/serum|clot/.test(n)) return 'Red / Serum tube';
    if(/heparin|lithium heparin/.test(n)) return 'Green / Heparin tube';
    if(/fluoride|glucose|sugar|oxalate/.test(n)) return 'Grey / Fluoride tube';
    if(/edta|whole blood|cbc|hematology/.test(n)) return 'Purple / EDTA tube';
    if(/urine/.test(n)) return 'Urine container';
    if(/stool/.test(n)) return 'Stool container';
    if(/swab|culture/.test(n)) return 'Swab container';
    return 'Others';
  }
  private tubeHint(name:any){
    const n=String(name||'').toLowerCase();
    if(/citrate.*3\.8|3\.8.*citrate/.test(n)) return 'For citrate 3.8% plasma';
    if(/citrate.*3\.2|3\.2.*citrate|sodium citrate|citrate|coag|pt|aptt/.test(n)) return 'For citrate 3.2% plasma/coagulation';
    if(/sst|serum separator|gel tube|gel/.test(n)) return 'For serum separator/SST';
    if(/serum|clot/.test(n)) return 'For plain serum';
    if(/heparin|lithium heparin/.test(n)) return 'For heparin plasma';
    if(/fluoride|glucose|sugar|oxalate/.test(n)) return 'For glucose/fluoride plasma';
    if(/edta|whole blood|cbc|hematology/.test(n)) return 'For EDTA whole blood';
    if(/urine/.test(n)) return 'Urine sample';
    if(/stool/.test(n)) return 'Stool sample';
    if(/swab|culture/.test(n)) return 'Microbiology swab';
    return 'Others';
  }

  async saveCollection(){
    if(!this.activeBill?.id) return;
    this.selectedTests().forEach(t=>t.specimen_missing=false);
    const missing = this.selectedTests().filter(t=>!t.specimen_type_id);
    if(missing.length){ missing.forEach(t=>t.specimen_missing=true); this.showMissingSpecimenPrompt(missing); return; }
    if(!this.validateCollectionDetailsBeforeNext()) return;
    const badPpNow = this.hasFastingAndPpSelected() && this.selectedTests().some(t=>t.timed_category==='POST_PRANDIAL' && t.collect_timing==='NOW');
    if(badPpNow){ this.formError='Post-prandial tests cannot be collected at the same time as fasting tests. Keep PP as Schedule / collect later.'; this.step.set(3); return; }
    const missingPpDue = this.selectedTests().filter(t=>t.timed_category==='POST_PRANDIAL' && t.collect_timing==='LATER' && !t.expected_collect_at);
    if(missingPpDue.length){ this.formError='Set expected collection time for post-prandial scheduled samples.'; this.step.set(3); return; }
    this.formError='';
    const groups = this.collectionGroups();
    const payload = { bill_id:this.activeBill.id, groups:groups.map(g=>({
      ...g,
      collection_mode:g.mode,
      tests:g.tests.map((t:CollectionTestRow)=>({
        report_item_id:t.report_item_id,
        test_id:t.test_id,
        test_name:t.test_name,
        collection_mode:t.collection_mode || 'INHOUSE',
        outsource_vendor_id:+t.outsource_vendor_id! || 0,
        internal_check_required:t.collection_mode==='BOTH',
        sample_priority:t.sample_priority || g.sample_priority
      }))
    })) };
    try{
      this.unwrapCollectionResult(await this.api?.saveCollection?.(payload));
    }catch(err:any){
      this.formError=this.friendlyError(err);
      return;
    }
    const selectedRows = this.selectedTests();
    const nextTab:CollectionTab = selectedRows.some(t=>t.collection_mode==='BOTH') ? 'internalcheck' : (selectedRows.some(t=>t.collection_mode==='OUTSOURCE') ? 'outsource' : 'inhouse');
    this.changed.emit(); await this.load(); this.closeCollect(); this.tab.set(nextTab);
  }
  priorityLabel(v:any){ const x=String(v||'ROUTINE').toUpperCase(); return x==='STAT'?'STAT':x==='CRITICAL'?'Critical':x==='VERIFICATION'?'Verification':x==='HOLD'?'Hold':'Routine'; }
  vendorName(id:any){ return (this.outsourceVendors||[]).find(v=>+v.id===+id)?.name || ''; }
  dispatchLabel(v:any){ const x=String(v||'READY').toUpperCase(); return x==='DISPATCHED'?'Dispatched':x==='RESULT_RECEIVED'?'Result received':'Ready to dispatch'; }
  dateTime(v:any){ return DateTimeSettingsService.dateTime(v); }
  logActionLabel(action:any){ const a=String(action||''); if(a.includes('reject')) return 'Rejected'; if(a.includes('recollect')) return 'Recollected'; if(a.includes('cancel')) return 'Cancelled'; if(a.includes('dispatch')) return 'Dispatch'; if(a.includes('internal')) return 'Internal check'; if(a.includes('outsource')) return 'Outsource'; return a.replace('collection.','') || 'Log'; }
  filteredCollectionLogs(){ const q=this.logSearch.toLowerCase().trim(); const f=this.logFilter; return this.collectionLogs.filter(l=>{ const a=String(l.action||'').toLowerCase(); const ok=f==='ALL' || (f==='REJECTED' && a.includes('reject')) || (f==='RECOLLECTED' && a.includes('recollect')) || (f==='CANCELLED' && a.includes('cancel')) || (f==='OUTSOURCE' && a.includes('outsource')) || (f==='INTERNAL' && a.includes('internal')) || (f==='DISPATCH' && a.includes('dispatch')); return ok && (!q || [l.action,l.details,l.bill_no,l.patient_name,l.specimen_id,l.specimen_name].join(' ').toLowerCase().includes(q)); }); }
  isOutsourceWorkflow(c:any){ return !this.isRejectedCollection(c) && ((+c?.outsource_test_count || 0) > 0 || String(c?.collection_mode || '').toUpperCase()==='OUTSOURCE' || !!c?.internal_check_required); }
  hasVendorReport(c:any){ return !!String(c?.vendor_report_file || c?.vendor_report_ref || '').trim(); }
  openVendorResult(c:any){
    this.vendorResultTarget=c;
    this.vendorResultMethod=String(c?.vendor_result_method || '').toUpperCase()==='ATTACH_REPORT_ONLY' ? 'ATTACH_REPORT_ONLY' : 'ENTER_VALUES';
    this.vendorReportFile=String(c?.vendor_report_file || c?.vendor_report_ref || '');
    this.vendorResultRemarks='';
    this.vendorResultError='';
    this.vendorResultModalOpen=true;
  }
  closeVendorResultModal(){ this.vendorResultModalOpen=false; this.vendorResultTarget=null; this.vendorResultError=''; }
  onVendorFileSelected(evt:any){ const file=evt?.target?.files?.[0]; if(file?.name) this.vendorReportFile=file.name; }
  async confirmVendorResult(){
    if(!this.vendorResultTarget?.id) return;
    if(this.vendorResultMethod==='ATTACH_REPORT_ONLY' && !String(this.vendorReportFile||'').trim()){
      this.vendorResultError='Vendor report PDF/image reference is required for PDF-only result.';
      return;
    }
    try{
      this.unwrapCollectionResult(await this.api?.receiveOutsourceVendorResult?.(this.vendorResultTarget.id, {
        method:this.vendorResultMethod,
        vendor_report_file:this.vendorReportFile,
        remarks:this.vendorResultRemarks
      }));
      this.closeVendorResultModal();
      await this.load();
      this.changed.emit();
    }catch(err:any){
      this.vendorResultError=this.friendlyError(err);
    }
  }
  printVendorReport(c:any){
    const file=this.htmlSafe(c?.vendor_report_file || c?.vendor_report_ref || 'Vendor report not uploaded');
    const html=`<html><head><title>Vendor Report</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}.box{border:1px solid #ccc;border-radius:10px;padding:12px;margin:12px 0}.muted{color:#666;font-size:12px}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Print</button><h2>Vendor Report</h2><div class="muted">Generated: ${DateTimeSettingsService.dateTime(new Date())}</div><div class="box"><b>Bill:</b> ${this.htmlSafe(c?.bill_no || '-')}<br><b>Patient:</b> ${this.htmlSafe(c?.patient_name || '-')}<br><b>Sample:</b> ${this.htmlSafe(c?.specimen_id || '-')} · ${this.htmlSafe(c?.specimen_name || '-')}<br><b>Vendor:</b> ${this.htmlSafe(c?.outsource_vendor_name || '-')}</div><div class="box"><b>Vendor report file/reference:</b><br>${file}</div><script>window.print();</script></body></html>`;
    const w=window.open('','_blank','width=850,height=700'); if(w){ w.document.write(html); w.document.close(); }
  }
  async setDispatchStatus(c:any,status:string){
    try{
      this.unwrapCollectionResult(await this.api?.updateCollectionDispatchStatus?.(c.id,status));
      await this.load(); this.changed.emit();
    }catch(err:any){
      this.formError=this.friendlyError(err);
    }
  }
  printDispatch(c:any){ const html=`<html><head><title>Outsource Dispatch</title><style>body{font-family:Arial,sans-serif;padding:24px;color:#111}h2{margin:0 0 4px}.muted{color:#666;font-size:12px}.box{border:1px solid #999;border-radius:10px;padding:12px;margin:12px 0}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{border:1px solid #bbb;padding:8px;text-align:left}.sign{margin-top:40px;display:flex;justify-content:space-between}</style></head><body><h2>Outsource Specimen Dispatch</h2><div class="muted">Print date: ${DateTimeSettingsService.dateTime(new Date())}</div><div class="box"><b>Vendor:</b> ${c.outsource_vendor_name || '-'}<br><b>Bill:</b> ${c.bill_no || '-'}<br><b>Patient:</b> ${c.patient_name || '-'} ${c.mobile ? ' / '+c.mobile : ''}<br><b>Specimen ID:</b> ${c.specimen_id || '-'}<br><b>Specimen:</b> ${c.specimen_name || '-'} · ${c.sample_type || '-'}<br><b>Priority:</b> ${this.priorityLabel(c.sample_priority)}<br><b>Dispatch status:</b> ${this.dispatchLabel(c.dispatch_status)}</div><table><thead><tr><th>Tests</th><th>Remarks</th></tr></thead><tbody><tr><td>${c.test_names || '-'}</td><td>${c.remarks || '-'}</td></tr></tbody></table><div class="sign"><span>Prepared by: __________</span><span>Vendor received: __________</span></div><script>window.print();</script></body></html>`; const w=window.open('','_blank','width=850,height=700'); if(w){ w.document.write(html); w.document.close(); } }

  isDispatchedCollection(c:any){
    const status = String(c?.dispatch_status || c?.status || c?.collection_status || '').toUpperCase();
    return status.includes('DISPATCHED') || status.includes('OUTSOURCE_DISPATCHED');
  }
  private unwrapCollectionResult(result:any){
    if(result && typeof result==='object' && result.ok===false) throw new Error(result.error || 'Collection action failed.');
    return result && typeof result==='object' && 'data' in result ? result.data : result;
  }
  private friendlyError(err:any){
    let msg=String(err?.error || err?.message || err || 'Action failed.').trim();
    for(let i=0;i<4;i++){
      msg=msg
        .replace(/^Error invoking remote method '[^']+':\s*/,'')
        .replace(/^Error occurred in handler for '[^']+':\s*/,'')
        .replace(/^Error:\s*/,'')
        .replace(/^SqliteError:\s*/,'')
        .trim();
    }
    return msg || 'Action failed.';
  }
  canRejectApprovedReport(c:any){
    return this.canShowRejectReportAction(c);
  }
  canShowRejectReportAction(c:any){
    const workflow=this.reportWorkflowStatus(c);
    const reportStatus=String(c?.report_status || c?.reportStatus || '').toUpperCase();
    return workflow==='Report approved' || reportStatus==='APPROVED' || (+c?.approved_test_count || 0) > 0;
  }
  private focusCollectionModalTextarea(kind: 'reject' | 'approved-report-reject') {
    const selector = `textarea[data-collection-autofocus="${kind}"]`;
    let tries = 0;
    const focus = () => {
      tries += 1;
      const el = document.querySelector(selector) as HTMLTextAreaElement | null;
      if (el) {
        el.focus({ preventScroll: true });
        el.select?.();
        return;
      }
      if (tries < 8) window.setTimeout(focus, 50);
    };
    window.setTimeout(focus, 90);
  }

  openApprovedReportReject(c:any){
    this.approvedReportRejectTarget=c;
    this.approvedReportRejectReason='';
    this.approvedReportRejectError='';
    this.approvedReportRejectModalOpen=true;
    this.focusCollectionModalTextarea('approved-report-reject');
  }
  closeApprovedReportRejectModal(){
    this.approvedReportRejectModalOpen=false;
    this.approvedReportRejectTarget=null;
    this.approvedReportRejectReason='';
    this.approvedReportRejectError='';
  }
  async confirmApprovedReportReject(){
    const target=this.approvedReportRejectTarget;
    const reportId=+(target?.report_id || target?.reportId || 0);
    const collectionId=+(target?.id || target?.collection_id || target?.collectionId || 0);
    const reason=String(this.approvedReportRejectReason || '').trim();
    if(!reason){ this.approvedReportRejectError='Reason is required.'; return; }
    if(!reportId && !collectionId){ this.approvedReportRejectError='Report/collection reference not found. Refresh and try again.'; return; }
    try{
      const api:any=this.api;
      if(api.reopenApprovedReportFromCollection){
        this.unwrapCollectionResult(await api.reopenApprovedReportFromCollection({report_id:reportId, collection_id:collectionId}, reason));
      }else{
        const report=this.unwrapCollectionResult(await api.getReport?.(reportId));
        if(!report?.id) throw new Error('Report not found.');
        this.unwrapCollectionResult(await api.saveReport?.({
          ...report,
          status:'TYPED',
          correction_mode:true,
          correction_reason:reason,
          correction_remarks:reason,
          remarks:`${report.remarks || ''}${report.remarks ? '\n' : ''}Correction: ${reason}`,
          items:(report.items || []).filter((x:any)=>x?.test_id)
        }));
      }
      this.closeApprovedReportRejectModal();
      await this.load();
      this.changed.emit();
    }catch(err:any){
      this.approvedReportRejectError=this.friendlyError(err);
    }
  }
  private openRejectModal(c:any){ this.rejectTarget=c; this.rejectReason=''; this.rejectError=''; this.rejectModalOpen=true; this.focusCollectionModalTextarea('reject'); }
  openReject(c:any){
    if(this.isRecheckCollection(c)){ this.showRejectLockedMessage(c); return; }
    if(this.isDispatchedCollection(c)){ this.dispatchRejectTarget=c; this.dispatchRejectConfirmOpen=true; return; }
    this.openRejectModal(c);
  }
  closeDispatchRejectConfirm(){ this.dispatchRejectConfirmOpen=false; this.dispatchRejectTarget=null; }
  continueRejectDispatchedSample(){ const target=this.dispatchRejectTarget; this.closeDispatchRejectConfirm(); if(target) this.openRejectModal(target); }
  closeRejectModal(){ this.rejectModalOpen=false; this.rejectTarget=null; this.rejectReason=''; this.rejectError=''; }
  async confirmReject(){
    if(!this.rejectTarget?.id || !this.rejectReason.trim()) return;
    this.rejectError='';
    try{
      this.unwrapCollectionResult(await this.api?.rejectCollection?.(this.rejectTarget.id,this.rejectReason));
      this.closeRejectModal();
      await this.load();
      this.tab.set('rejected');
      this.changed.emit();
    }catch(err:any){
      this.rejectError=this.friendlyError(err);
    }
  }
  openDeleteRejected(c:any){ this.deleteTarget=c; this.deleteModalOpen=true; }
  closeDeleteModal(){ this.deleteModalOpen=false; this.deleteTarget=null; }
  async confirmDeleteRejected(){
    if(!this.deleteTarget?.id) return;
    try{
      this.unwrapCollectionResult(await this.api?.deleteRejectedCollection?.(this.deleteTarget.id));
      this.closeDeleteModal();
      await this.load();
      this.changed.emit();
    }catch(err:any){
      this.rejectError=this.friendlyError(err);
    }
  }


  private resetCollectionFiltersAfterRejectedAction(){
    this.pendingSearch='';
    this.collectionSearch='';
    this.fromDate='';
    this.toDate='';
  }

  async recollectBillSamples(g:any){
    const samples = (g?.samples || []).filter((c:any)=>c?.id);
    if(!samples.length) return;
    for(const c of samples){
      this.unwrapCollectionResult(await this.api?.recollectCollection?.(c.id));
    }
    this.resetCollectionFiltersAfterRejectedAction();
    await this.load();
    this.workflowStep.set('collection');
    this.tab.set('collectionpending');
    this.mode.set('list');
    this.step.set(1);
    this.changed.emit();
  }

  async deleteRejectedBillSamples(g:any){
    const samples = (g?.samples || []).filter((c:any)=>c?.id);
    if(!samples.length) return;
    for(const c of samples){
      await this.api?.deleteRejectedCollection?.(c.id);
    }
    this.resetCollectionFiltersAfterRejectedAction();
    await this.load();
    this.workflowStep.set('collection');
    this.tab.set('collectionpending');
    this.mode.set('list');
    this.step.set(1);
    this.changed.emit();
  }

  async recollect(c:any){
    this.unwrapCollectionResult(await this.api?.recollectCollection?.(c.id));

    // Recollect is a workflow jump back to Pending Collection. Clear the shared
    // collection filters first; otherwise a rejected-tab date/search filter can
    // hide the restored bill from the Pending list and make it look like the
    // recollect did not work.
    this.resetCollectionFiltersAfterRejectedAction();

    await this.load();
    this.workflowStep.set('collection');
    this.tab.set('collectionpending');
    this.mode.set('list');
    this.step.set(1);
    this.changed.emit();
  }


  @HostListener('document:click')
  onDocumentClick(){ this.closeActionMenu(); }

  @HostListener('window:resize')
  onWindowResize(){ this.closeActionMenu(); }

  @HostListener('window:scroll')
  onWindowScroll(){ this.closeActionMenu(); }

  toggleActionMenu(key:any, event?: MouseEvent){
    const k=String(key || '');
    if(!k) return;
    if(this.actionMenuKey()===k){ this.closeActionMenu(); return; }
    this.positionActionMenu(event);
    this.actionMenuKey.set(k);
  }

  private positionActionMenu(event?: MouseEvent){
    const target = event?.currentTarget as HTMLElement | null;
    if(!target || typeof window === 'undefined'){
      this.actionMenuStyle.set({});
      return;
    }
    const rect = target.getBoundingClientRect();
    const menuWidth = 250;
    const menuHeight = 360;
    const gap = 8;
    const margin = 12;
    const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
    const left = Math.min(Math.max(margin, rect.right - menuWidth), maxLeft);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    let top = spaceBelow >= Math.min(menuHeight, 240) || spaceBelow >= spaceAbove
      ? rect.bottom + gap
      : rect.top - menuHeight - gap;
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - menuHeight - margin));
    this.actionMenuStyle.set({ left: `${left}px`, top: `${top}px`, width: `${menuWidth}px` });
  }

  isActionMenuOpen(key:any){
    const k=String(key || '');
    return !!k && this.actionMenuKey()===k;
  }

  closeActionMenu(){
    this.actionMenuKey.set(null);
    this.actionMenuStyle.set({});
  }

  openCollectionActionSheet(event: Event, kind: 'bill'|'sample'|'specimen', row: any){
    event.preventDefault();
    event.stopPropagation();
    (event as any).stopImmediatePropagation?.();
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect?.();
    const panelWidth = 270;
    const panelHeight = 420;
    const margin = 12;
    let left = rect ? rect.right - panelWidth : window.innerWidth - panelWidth - margin;
    let top = rect ? rect.bottom + 8 : margin;
    left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
    if(top + panelHeight > window.innerHeight - margin){
      top = rect ? rect.top - panelHeight - 8 : margin;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - margin - 80));
    this.collectionActionSheetKind = kind;
    this.collectionActionSheetRow = row;
    this.collectionActionSheetX = left;
    this.collectionActionSheetY = top;
    this.collectionActionSheetOpen = true;
    console.log('[Collection] action sheet opened', kind, row);
  }

  closeCollectionActionSheet(){
    this.collectionActionSheetOpen=false;
  }

  showRejectLockedMessage(row:any){
    if(this.isRecheckCollection(row)){
      this.formError = 'Recheck samples cannot be rejected from Collection. Use Reporting > Pending Rechecks > Reject Recheck.';
      return;
    }
    const status=this.reportWorkflowStatus(row);
    this.formError = status === 'Report approved'
      ? 'Cannot reject this sample because the report is already approved. Use Reject report / reopen correction first.'
      : 'Cannot reject this sample because report values are entered or waiting approval. Reopen/correct the report first.';
  }

  async runCollectionSheetAction(action:string){
    const row=this.collectionActionSheetRow;
    const kind=this.collectionActionSheetKind;
    this.closeCollectionActionSheet();
    if(!row) return;
    console.log('[Collection] action clicked', action, row);
    try{
      switch(action){
        case 'view': kind === 'bill' ? this.viewBillDetailsPdf(row) : this.printCollectionDetails(row); break;
        case 'print': kind === 'bill' ? this.printBillDetails(row) : this.printCollectionDetails(row); break;
        case 'barcode': kind === 'bill' ? this.printBillBarcodes(row) : this.printBarcode(row); break;
        case 'toggle-bill': this.toggleBillExpand(row); break;
        case 'toggle-tests': this.toggleCollectionExpand(row); break;
        case 'print-dispatch': this.printDispatch(row); break;
        case 'dispatch': await this.setDispatchStatus(row,'DISPATCHED'); break;
        case 'received': await this.setDispatchStatus(row,'RESULT_RECEIVED'); break;
        case 'vendor-result': this.openVendorResult(row); break;
        case 'vendor-report': this.printVendorReport(row); break;
        case 'reject': this.openReject(row); break;
        case 'reject-locked': this.showRejectLockedMessage(row); break;
        case 'reject-report': this.openApprovedReportReject(row); break;
        case 'recollect-bill': await this.recollectBillSamples(row); break;
        case 'recollect': await this.recollect(row); break;
        case 'delete-rejected-bill': await this.deleteRejectedBillSamples(row); break;
        case 'delete-rejected': this.openDeleteRejected(row); break;
      }
    }catch(err:any){
      this.formError=this.friendlyError(err);
    }
  }

}
