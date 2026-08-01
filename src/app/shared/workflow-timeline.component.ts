import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';

type TimelineContext = 'billing' | 'collection' | 'reporting' | 'approval' | 'delivery' | 'outsource';

type TimelineStep = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  done: boolean;
  active: boolean;
  blocked: boolean;
};

@Component({
  selector: 'app-workflow-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="timeline-card" [class.compact]="compact">
      <div class="timeline-head" *ngIf="!compact">
        <div>
          <h4>{{title}}</h4>
          <p>{{subtitleText()}}</p>
        </div>
        <span class="timeline-badge">{{activeStepLabel()}}</span>
      </div>
      <div class="timeline-track">
        <div class="timeline-step" *ngFor="let s of steps()" [class.done]="s.done" [class.active]="s.active" [class.blocked]="s.blocked">
          <span class="dot">{{s.icon}}</span>
          <b>{{s.label}}</b>
          <small>{{s.hint}}</small>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host{display:block;width:100%}
    .timeline-card{border:1px solid var(--border);border-radius:18px;background:linear-gradient(145deg,var(--row),var(--panel));padding:14px;box-shadow:0 12px 28px rgba(15,23,42,.08);margin:10px 0;color:var(--text)}
    .timeline-card.compact{padding:10px;margin:6px 0;box-shadow:none;background:var(--row)}
    .timeline-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
    .timeline-head h4{margin:0;font-size:15px;font-weight:950}.timeline-head p{margin:4px 0 0;color:var(--muted);font-size:12px}
    .timeline-badge{display:inline-flex;align-items:center;border-radius:999px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:950;padding:6px 10px;white-space:nowrap}
    .timeline-track{display:grid;grid-template-columns:repeat(6,minmax(96px,1fr));gap:8px;position:relative}
    .timeline-step{position:relative;border:1px solid var(--border);border-radius:15px;background:var(--input);padding:10px 9px;min-height:74px;display:grid;grid-template-columns:26px 1fr;grid-template-rows:auto auto;column-gap:8px;align-items:center;opacity:.78}
    .timeline-step:before{content:'';position:absolute;left:-9px;top:50%;width:8px;height:2px;background:var(--border);transform:translateY(-50%)}
    .timeline-step:first-child:before{display:none}
    .timeline-step .dot{grid-row:1/3;width:26px;height:26px;border-radius:999px;display:grid;place-items:center;background:var(--row);border:1px solid var(--border);font-size:13px}
    .timeline-step b{font-size:12px;font-weight:950;line-height:1.1}.timeline-step small{color:var(--muted);font-size:10px;font-weight:800;margin-top:3px;line-height:1.2}
    .timeline-step.done{opacity:1;border-color:color-mix(in srgb,var(--accent) 32%,var(--border));background:color-mix(in srgb,var(--accent-soft) 55%,var(--input))}.timeline-step.done .dot{background:var(--accent-soft);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 45%,var(--border))}
    .timeline-step.active{opacity:1;border-color:color-mix(in srgb,var(--accent) 72%,var(--border));box-shadow:0 0 0 3px var(--accent-soft),0 12px 26px rgba(124,58,237,.16);background:linear-gradient(135deg,var(--accent-soft),var(--input))}.timeline-step.active .dot{background:var(--accent-gradient);color:#fff;border:0}
    .timeline-step.blocked{border-color:rgba(220,38,38,.35);background:rgba(220,38,38,.09)}.timeline-step.blocked .dot{background:rgba(220,38,38,.14);color:var(--danger);border-color:rgba(220,38,38,.28)}
    :host-context(.light-mode) .timeline-card,:host-context(body.light-mode) .timeline-card,:host-context(body:not(.dark-theme)) .timeline-card{background:#fff!important;border-color:#dbe3ef!important;color:#0f172a!important}
    :host-context(.light-mode) .timeline-step,:host-context(body.light-mode) .timeline-step,:host-context(body:not(.dark-theme)) .timeline-step{background:#f8fafc!important;border-color:#dbe3ef!important;color:#0f172a!important}
    @media(max-width:1100px){.timeline-track{grid-template-columns:repeat(2,1fr)}.timeline-step:before{display:none}}
  `]
})
export class WorkflowTimelineComponent {
  @Input() record: any = null;
  @Input() context: TimelineContext = 'billing';
  @Input() title = 'Workflow timeline';
  @Input() compact = false;

  private text(v:any){ return String(v ?? '').toUpperCase(); }
  private hasAny(...fields:string[]){ const r=this.record||{}; return fields.some(f=>!!r[f]); }
  private reportStatus(){ return this.text(this.record?.report_status || this.record?.status); }
  private collectionStatus(){ return this.text(this.record?.collection_status || this.record?.status || this.record?.dispatch_status); }
  private isCancelled(){ return this.text(this.record?.status).includes('CANCEL') || this.text(this.record?.report_status).includes('CANCEL') || this.text(this.record?.bill_status).includes('CANCEL'); }
  private isOutsource(){ return this.text(this.record?.collection_mode).includes('OUTSOURCE') || this.collectionStatus().includes('OUTSOURCE') || !!this.record?.outsource_vendor_name; }

  steps(): TimelineStep[] {
    const cancelled = this.isCancelled();
    const rep = this.reportStatus();
    const col = this.collectionStatus();
    const deliveryDone = this.hasAny('pdf_exported_at','printed_at','emailed_at','smsed_at');
    const approved = rep === 'APPROVED' || this.text(this.record?.status) === 'APPROVED';
    const waiting = rep === 'TYPED' || rep === 'ENTERED' || rep === 'WAITING_APPROVAL';
    const draft = rep === 'DRAFT' || rep === '';
    const collected = col.includes('COLLECTED') || col.includes('OUTSOURCE') || rep === 'DRAFT' || waiting || approved;
    const outsourceDone = col.includes('RESULT_RECEIVED') || rep === 'DRAFT' || waiting || approved;
    const inOutsource = this.isOutsource();
    const activeKey = this.activeKey(cancelled, approved, waiting, draft, collected, inOutsource, outsourceDone, deliveryDone);
    const base = [
      {key:'billing', label:'Billing', hint:this.context==='billing'?'current module':'bill created', icon:'₹'},
      {key:'collection', label:'Collection', hint:col.includes('REJECT')?'rejected/recollect': collected?'sample collected':'pending sample', icon:'◈'},
      {key:'outsource', label:'Outsource', hint:inOutsource ? (outsourceDone?'result received':'vendor flow') : 'not needed', icon:'↗'},
      {key:'reporting', label:'Reporting', hint:waiting?'waiting approval':approved?'reported':'result entry', icon:'▣'},
      {key:'approval', label:'Approval', hint:approved?'approved':waiting?'verify now':'not approved', icon:'✓'},
      {key:'delivery', label:'Delivery', hint:deliveryDone?'shared/printed':'after approval', icon:'✉'}
    ];
    return base.map(s=>({
      ...s,
      active: s.key === activeKey,
      blocked: cancelled && s.key !== 'billing',
      done: this.stepDone(s.key, approved, waiting, draft, collected, inOutsource, outsourceDone, deliveryDone)
    }));
  }

  private activeKey(cancelled:boolean, approved:boolean, waiting:boolean, draft:boolean, collected:boolean, outsource:boolean, outsourceDone:boolean, deliveryDone:boolean){
    if (cancelled) return 'billing';
    if (this.context === 'billing' && !collected) return 'billing';
    if (this.context === 'collection' && !draft && !waiting && !approved) return 'collection';
    if (this.context === 'outsource' || (outsource && !outsourceDone)) return 'outsource';
    if (this.context === 'reporting' || draft) return 'reporting';
    if (this.context === 'approval' || waiting) return 'approval';
    if (this.context === 'delivery' || deliveryDone || approved) return deliveryDone ? 'delivery' : 'approval';
    return this.context;
  }

  private stepDone(key:string, approved:boolean, waiting:boolean, draft:boolean, collected:boolean, outsource:boolean, outsourceDone:boolean, deliveryDone:boolean){
    if (key === 'billing') return true;
    if (key === 'collection') return collected || draft || waiting || approved;
    if (key === 'outsource') return !outsource || outsourceDone || draft || waiting || approved;
    if (key === 'reporting') return draft || waiting || approved;
    if (key === 'approval') return approved;
    if (key === 'delivery') return deliveryDone;
    return false;
  }

  activeStepLabel(){ return this.steps().find(s=>s.active)?.label || 'Timeline'; }
  subtitleText(){ const r=this.record||{}; const bill=r.bill_no || r.billNo || 'Current item'; const patient=r.patient_name || r.patient?.name || r.patientName || ''; return patient ? `${bill} · ${patient}` : bill; }
}
