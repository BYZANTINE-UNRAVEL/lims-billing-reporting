import { CommonModule } from '@angular/common';
import { Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-consultants-page',
  standalone: true,
  imports: [CommonModule, FormsModule, MatCardModule],
  template: `
    <section class="consultants-page commission-page">
      <mat-card class="commission-card">
        <div class="panel-title"><h3>Consultant Master</h3><span class="status-pill">Commission profiles</span></div>
        <div class="consultant-basic-grid">
          <label><span>Name</span><input [(ngModel)]="consultant.name" placeholder="Consultant name"></label>
          <label><span>Phone</span><input [(ngModel)]="consultant.phone" placeholder="Phone"></label>
          <label><span>Clinic</span><input [(ngModel)]="consultant.clinic" placeholder="Clinic / hospital"></label>
          <label class="check-line"><input type="checkbox" [(ngModel)]="consultant.active"> Active</label>
        </div>
        <div class="predefined-group-panel" *ngIf="activeCommissionGroups().length; else noCommissionGroups">
          <div class="group-panel-head">
            <div><b>Use predefined commission groups</b><small>Select groups this consultant should use for billing commission.</small></div>
            <span class="status-pill">{{(consultant.commission_group_ids || []).length}} selected</span>
          </div>
          <div class="group-check-grid">
            <label class="group-check" *ngFor="let g of activeCommissionGroups()" [class.active]="consultantGroupSelected(g.id)">
              <input type="checkbox" [checked]="consultantGroupSelected(g.id)" (change)="toggleConsultantGroup(g.id,$event)">
              <span><b>{{g.name}}</b><small>{{groupMethodLabel(g)}} | {{g.items?.length || 0}} items</small></span>
            </label>
          </div>
        </div>
        <ng-template #noCommissionGroups><div class="commission-note">No predefined commission groups available. Create them first in Commission Profiles.</div></ng-template>
        <div class="actions"><button class="btn primary" (click)="saveConsultant()">Save Consultant</button><button class="btn secondary" (click)="reset()">Clear</button></div>
      </mat-card>

      <mat-card class="commission-card" *ngIf="consultant.id || consultant.name">
        <div class="panel-title"><h3>Custom Consultant Profiles</h3><span class="status-pill">{{consultant.commission_profiles?.length || 0}} custom</span></div>
        <div class="commission-note">Use predefined commission groups above by default. Add a custom profile only when this consultant needs a personal fallback or exception profile.</div>
        <div class="empty-custom-profile" *ngIf="!consultant.commission_profiles?.length">No custom consultant profile added.</div>
        <div class="commission-profile-list" *ngIf="consultant.commission_profiles?.length">
          <div class="commission-profile-row" *ngFor="let p of consultant.commission_profiles; let idx = index">
            <div class="profile-title-line">
              <label class="default-radio"><input type="radio" name="defaultProfile" [checked]="p.is_default" (change)="setDefaultProfile(idx)"> Default</label>
              <button class="icon-danger" type="button" title="Remove profile" (click)="removeProfile(idx)">x</button>
            </div>
            <div class="commission-grid">
              <label><span>Profile name</span><input [(ngModel)]="p.profile_name" placeholder="Standard 20%"></label>
              <label><span>Type</span><select [(ngModel)]="p.commission_type"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option><option value="NONE">None</option></select></label>
              <label><span>Value</span><input type="number" [(ngModel)]="p.commission_value" placeholder="0"></label>
              <label><span>Calculation base</span><select [(ngModel)]="p.calculation_base"><option value="GROSS">Gross item amount</option><option value="NET_AFTER_COST">Net after test cost</option><option value="NET_AFTER_COST_DEDUCTION">Net after cost + deduction</option></select></label>
              <label><span>Extra deduction</span><select [(ngModel)]="p.extra_deduction_type"><option value="NONE">None</option><option value="AMOUNT">Amount</option><option value="PERCENT">Percentage</option></select></label>
              <label><span>Deduction value</span><input type="number" [(ngModel)]="p.extra_deduction_value" placeholder="0"></label>
              <label class="check-line"><input type="checkbox" [(ngModel)]="p.min_enabled"> Minimum limit</label>
              <label *ngIf="p.min_enabled"><span>Minimum commission</span><input type="number" [(ngModel)]="p.min_commission" placeholder="0"></label>
              <label class="check-line"><input type="checkbox" [(ngModel)]="p.max_enabled"> Maximum limit</label>
              <label *ngIf="p.max_enabled"><span>Maximum commission</span><input type="number" [(ngModel)]="p.max_commission" placeholder="0"></label>
              <label class="wide"><span>Description</span><input [(ngModel)]="p.description" placeholder="Optional note"></label>
              <label class="check-line"><input type="checkbox" [(ngModel)]="p.active"> Active</label>
            </div>
          </div>
        </div>
        <button class="btn secondary" type="button" (click)="addProfile()">+ Add Custom Commission Profile</button>
      </mat-card>

      <mat-card class="commission-card" *ngIf="consultant.id || consultant.name">
        <div class="panel-title"><h3>Test / Profile Exceptions</h3><span class="status-pill">{{consultant.commission_rules?.length || 0}} rules</span></div>
        <div class="commission-note">Item rules beat commission groups and the default profile. Use Special commission for fixed/percent overrides (e.g. CBC ₹30). Use No commission to force zero (e.g. HIV).</div>
        <div class="rule-search-grid">
          <label><span>Search test/profile</span><input [(ngModel)]="ruleSearch" placeholder="Search by code/name"></label>
          <button class="btn secondary" type="button" (click)="ruleSearch=''">Clear</button>
        </div>
        <div class="rule-suggestions" *ngIf="ruleSearch.trim().length >= 1">
          <button type="button" *ngFor="let s of ruleSuggestions()" (click)="addRule(s)"><b>{{s.name}}</b><small>{{s.item_type}} · ₹{{s.price || 0}}</small></button>
          <span *ngIf="ruleSuggestions().length === 0">No item found.</span>
        </div>
        <div class="commission-table" *ngIf="consultant.commission_rules?.length; else noRules">
          <div class="commission-table-head"><span>Item</span><span>Action</span><span>Commission profile</span><span></span></div>
          <div class="commission-rule-row" *ngFor="let r of consultant.commission_rules; let i = index">
            <div><b>{{r.item_name}}</b><small>{{r.item_type}}</small></div>
            <select [(ngModel)]="r.action"><option value="USE_PROFILE">Special commission (use profile)</option><option value="NO_COMMISSION">No commission</option></select>
            <select [(ngModel)]="r.profile_temp_id" [disabled]="r.action === 'NO_COMMISSION'"><option [ngValue]="null">Select profile</option><option *ngFor="let p of consultant.commission_profiles" [ngValue]="p.temp_id || p.id || p.profile_name">{{p.profile_name}}</option></select>
            <button class="icon-danger" type="button" title="Remove rule" (click)="removeRule(i)">×</button>
          </div>
        </div>
        <ng-template #noRules><div class="commission-note">No exceptions added. Default commission profile will apply to all billable tests and profiles.</div></ng-template>
      </mat-card>

      <mat-card class="commission-card">
        <div class="panel-title"><h3>Consultants</h3><span class="status-pill">{{consultants().length}}</span></div>
        <div class="action-message" *ngIf="actionMessage">{{actionMessage}}</div><table><tr><th>Name</th><th>Status</th><th>Commission groups</th><th>Custom default</th><th>Rules</th><th></th></tr><tr *ngFor="let c of consultants()"><td>{{c.name}}<br><small>{{c.clinic}}</small></td><td><span class="status-pill" [class.inactive]="!c.active">{{c.active ? 'Active' : 'Archived'}}</span></td><td><div class="group-chip-list" *ngIf="consultantGroupNames(c).length; else noConsultantGroups"><span *ngFor="let name of consultantGroupNames(c)">{{name}}</span></div><ng-template #noConsultantGroups><small>No group</small></ng-template></td><td>{{defaultProfileName(c)}}</td><td>{{c.commission_rules?.length || 0}}</td><td><div class="row-actions"><button class="icon-btn" title="Edit" (click)="editConsultant(c)">Edit</button><button class="icon-danger" title="Delete or archive" (click)="deleteConsultant(c)">x</button></div></td></tr></table>
      </mat-card>
    </section>
  `,
  styles: [`
    .predefined-group-panel{margin-top:14px;border:1px solid var(--border);border-radius:16px;background:color-mix(in srgb,var(--surface) 92%,transparent);padding:12px}.group-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}.group-panel-head b,.group-panel-head small{display:block}.group-panel-head small{margin-top:3px;color:var(--muted);font-weight:750}.group-check-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.group-check{display:flex!important;align-items:flex-start;gap:9px;border:1px solid var(--border);border-radius:13px;background:var(--surface-2);padding:10px;color:var(--text)!important;cursor:pointer}.group-check.active{border-color:color-mix(in srgb,var(--accent) 58%,var(--border));background:var(--accent-soft)}.group-check input{width:17px;height:17px;margin-top:2px;accent-color:var(--accent)}.group-check b,.group-check small{display:block}.group-check small{margin-top:3px;color:var(--muted);font-size:10.5px}.empty-custom-profile{border:1px dashed var(--border);border-radius:14px;padding:13px;color:var(--muted);font-weight:800;margin-bottom:12px;background:color-mix(in srgb,var(--surface-2) 64%,transparent)}.group-chip-list{display:flex;gap:5px;flex-wrap:wrap}.group-chip-list span{border:1px solid color-mix(in srgb,var(--accent) 42%,var(--border));border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--surface));color:var(--text);padding:4px 8px;font-size:10.5px;font-weight:850}
    .commission-page{display:grid;gap:18px}.commission-card{padding:16px;border-radius:20px}.consultant-basic-grid,.commission-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}.consultant-basic-grid label,.commission-grid label,.rule-search-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.consultant-basic-grid input,.commission-grid input,.commission-grid select,.rule-search-grid input,.commission-rule-row select{height:40px;border-radius:12px;border:1px solid var(--border);background:var(--input,var(--surface-2));color:var(--text);padding:0 11px;font-weight:800}.check-line{display:flex!important;align-items:center;gap:8px;color:var(--text)!important}.check-line input{width:16px;height:16px}.commission-note{border:1px dashed var(--border);border-radius:14px;padding:10px 12px;color:var(--muted);font-weight:750;margin-bottom:12px}.commission-profile-list{display:grid;gap:12px;margin-bottom:12px}.commission-profile-row{border:1px solid var(--border);border-radius:16px;padding:12px;background:color-mix(in srgb,var(--surface) 92%,transparent)}.profile-title-line{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.default-radio{display:flex;gap:8px;align-items:center;font-weight:900;color:var(--text)}.commission-grid .wide{grid-column:span 2}.rule-search-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.rule-suggestions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.rule-suggestions button{border:1px solid var(--border);border-radius:13px;background:var(--surface-2);color:var(--text);padding:10px;text-align:left;cursor:pointer}.rule-suggestions small,.commission-rule-row small{display:block;color:var(--muted);font-weight:750}.commission-table{display:grid;gap:6px}.commission-table-head,.commission-rule-row{display:grid;grid-template-columns:1.2fr .9fr .9fr 42px;gap:10px;align-items:center}.commission-table-head{color:var(--muted);font-size:11px;font-weight:1000;text-transform:uppercase}.commission-rule-row{border:1px solid var(--border);border-radius:14px;padding:8px}.row-actions{display:flex;justify-content:flex-end;gap:7px}.action-message{margin-bottom:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);font-weight:800}.status-pill.inactive{opacity:.65}.icon-btn,.icon-danger{height:34px;width:34px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer}.icon-danger{color:#ef4444}.actions{display:flex;gap:10px;margin-top:14px}@media(max-width:900px){.consultant-basic-grid,.commission-grid,.rule-suggestions{grid-template-columns:1fr}.commission-table-head,.commission-rule-row{grid-template-columns:1fr}.commission-grid .wide{grid-column:auto}}
  `]
})
export class ConsultantsPageComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  consultants = signal<any[]>([]);
  tests:any[] = [];
  profiles:any[] = [];
  commissionGroups:any[] = [];
  ruleSearch = '';
  actionMessage = '';
  consultant:any = this.emptyConsultant();

  async ngOnInit(){ await this.reload(); }
  async reload(){
    this.consultants.set(await window.limsApi.listConsultants());
    this.tests = await window.limsApi.listTests(true);
    this.profiles = await window.limsApi.listProfiles(true);
    this.commissionGroups = await window.limsApi.listCommissionGroups?.() || [];
  }
  emptyProfile(){ return { temp_id:'tmp_' + Date.now() + '_' + Math.random().toString(16).slice(2), profile_name:'Standard 20%', commission_type:'PERCENT', commission_value:20, calculation_base:'GROSS', extra_deduction_type:'NONE', extra_deduction_value:0, min_enabled:false, max_enabled:false, min_commission:0, max_commission:0, active:true, is_default:false, description:'' }; }
  emptyConsultant(){ return { active:true, name:'', phone:'', clinic:'', commission_group_ids:[], commission_profiles:[], commission_rules:[] }; }
  async saveConsultant(){
    if(!String(this.consultant.name || '').trim()) return;
    const profiles = this.consultant.commission_profiles || [];
    if(profiles.length && !profiles.some((p:any)=>p.is_default)) profiles[0].is_default = true;
    const payload={...this.consultant,commission_group_ids:(this.consultant.commission_group_ids||[]).map((id:any)=>Number(id)).filter((id:number)=>id>0),commission_profiles:profiles.map((p:any)=>({...p,min_commission:p.min_enabled?Number(p.min_commission||0):0,max_commission:p.max_enabled?Number(p.max_commission||0):0}))};
    await window.limsApi.saveConsultant(payload);
    this.reset(); await this.reload(); this.changed.emit();
  }
  editConsultant(c:any){
    const copy = JSON.parse(JSON.stringify(c));
    copy.commission_group_ids = (copy.commission_group_ids || (copy.commission_groups || []).map((g:any)=>g.group_id)).map((id:any)=>Number(id)).filter((id:number)=>id>0);
    copy.commission_profiles = (copy.commission_profiles || []).map((p:any)=>({...p, temp_id:p.temp_id || String(p.id || p.profile_name), active:p.active !== false && p.active !== 0, is_default:!!p.is_default, min_enabled:Number(p.min_commission||0)>0, max_enabled:Number(p.max_commission||0)>0}));
    copy.commission_rules = (copy.commission_rules || []).map((r:any)=>({...r, profile_temp_id:r.commission_profile_id ? String(r.commission_profile_id) : null, item_name:this.itemName(r.item_type, r.item_id)}));
    this.consultant = copy;
  }
  async deleteConsultant(c:any){
    const name = String(c?.name || 'this consultant');
    const ok = window.confirm(`Delete ${name}? If the consultant is already used in bills, it will be archived to preserve old records.`);
    if(!ok) return;
    const result = await window.limsApi.deleteConsultant?.(Number(c.id));
    if(!result) return;
    this.consultants.set(result.consultants || []);
    this.actionMessage = result.action === 'archived'
      ? `${name} is used in existing bills, so it was archived instead of permanently deleted.`
      : result.action === 'deleted' ? `${name} was deleted.` : `${name} was not found.`;
    if(Number(this.consultant?.id) === Number(c.id)) this.reset();
    this.changed.emit();
  }
  reset(){ this.consultant=this.emptyConsultant(); this.ruleSearch=''; }
  addProfile(){ const p=this.emptyProfile(); if(!(this.consultant.commission_profiles||[]).length)p.is_default=true; this.consultant.commission_profiles=this.consultant.commission_profiles||[]; this.consultant.commission_profiles.push(p); }
  removeProfile(i:number){ this.consultant.commission_profiles.splice(i,1); if(!this.consultant.commission_profiles.some((p:any)=>p.is_default) && this.consultant.commission_profiles[0]) this.consultant.commission_profiles[0].is_default = true; }
  setDefaultProfile(i:number){ this.consultant.commission_profiles.forEach((p:any,idx:number)=>p.is_default = idx === i); }
  defaultProfileName(c:any){ return (c.commission_profiles || []).find((p:any)=>p.is_default)?.profile_name || (c.default_commission_value ? `${c.default_commission_value} ${c.default_commission_type}` : 'No custom default'); }
  activeCommissionGroups(){return this.commissionGroups.filter((g:any)=>Number(g?.active??1)===1);}
  consultantGroupSelected(id:any){return (this.consultant.commission_group_ids||[]).map(Number).includes(Number(id));}
  toggleConsultantGroup(id:any,e:any){const ids=new Set((this.consultant.commission_group_ids||[]).map(Number));e.target.checked?ids.add(Number(id)):ids.delete(Number(id));this.consultant.commission_group_ids=[...ids];}
  consultantGroupNames(c:any){return (c.commission_groups||[]).map((g:any)=>String(g.group_name||g.name||'Commission group'));}
  groupMethodLabel(g:any){const x=String(g.calculation_type||'');return ({PERCENT_NET:`${g.rate||0}% net`,PERCENT_PROFIT:`${g.rate||0}% profit`,PERCENT_GROSS:`${g.rate||0}% selling`,FIXED:`${g.fixed_amount||0} fixed`,FORMULA:'Formula'} as any)[x]||x;}
  allItems(){ return [...this.tests.map(t=>({item_type:'TEST', item_id:t.id, name:t.display_name || t.name, price:t.price, code:t.code})), ...this.profiles.map(p=>({item_type:'PROFILE', item_id:p.id, name:p.display_name || p.name, price:p.price, code:p.code}))]; }
  ruleSuggestions(){ const q = this.ruleSearch.trim().toLowerCase(); if(!q) return []; const used = new Set((this.consultant.commission_rules || []).map((r:any)=>`${r.item_type}:${r.item_id}`)); return this.allItems().filter(x=>!used.has(`${x.item_type}:${x.item_id}`)).map(x=>({...x, score:this.scoreItem(x,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,9); }
  scoreItem(x:any,q:string){ const name=String(x.name||'').toLowerCase(), code=String(x.code||'').toLowerCase(); let s=0; if(code===q)s+=100; if(name===q)s+=90; if(code.startsWith(q))s+=60; if(name.startsWith(q))s+=50; if(name.includes(q))s+=25; if(code.includes(q))s+=25; return s; }
  addRule(x:any){ const def = (this.consultant.commission_profiles || []).find((p:any)=>p.is_default) || this.consultant.commission_profiles?.[0]; this.consultant.commission_rules.push({ item_type:x.item_type, item_id:x.item_id, item_name:x.name, action:'USE_PROFILE', profile_temp_id:def?.temp_id || String(def?.id || def?.profile_name || '') }); this.ruleSearch=''; }
  removeRule(i:number){ this.consultant.commission_rules.splice(i,1); }
  itemName(type:any,id:any){ const list = String(type).toUpperCase() === 'PROFILE' ? this.profiles : this.tests; const found = list.find((x:any)=>+x.id===+id); return found ? (found.display_name || found.name) : `${type} #${id}`; }
}
