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
        <div class="actions"><button class="btn primary" (click)="saveConsultant()">Save Consultant</button><button class="btn secondary" (click)="reset()">Clear</button></div>
      </mat-card>

      <mat-card class="commission-card" *ngIf="consultant.id || consultant.name">
        <div class="panel-title"><h3>Configure Commission</h3><span class="status-pill">{{consultant.commission_profiles?.length || 0}} profiles</span></div>
        <div class="commission-note">Default profile applies to all tests/profiles. Add item exceptions only for special commission or no commission.</div>
        <div class="commission-profile-list">
          <div class="commission-profile-row" *ngFor="let p of consultant.commission_profiles; let idx = index">
            <div class="profile-title-line">
              <label class="default-radio"><input type="radio" name="defaultProfile" [checked]="p.is_default" (change)="setDefaultProfile(idx)"> Default</label>
              <button class="icon-danger" type="button" title="Remove profile" (click)="removeProfile(idx)" [disabled]="consultant.commission_profiles.length <= 1">×</button>
            </div>
            <div class="commission-grid">
              <label><span>Profile name</span><input [(ngModel)]="p.profile_name" placeholder="Standard 20%"></label>
              <label><span>Type</span><select [(ngModel)]="p.commission_type"><option value="PERCENT">Percentage</option><option value="FIXED">Fixed amount</option><option value="NONE">None</option></select></label>
              <label><span>Value</span><input type="number" [(ngModel)]="p.commission_value" placeholder="0"></label>
              <label><span>Calculation base</span><select [(ngModel)]="p.calculation_base"><option value="GROSS">Gross item amount</option><option value="NET_AFTER_COST">Net after test cost</option><option value="NET_AFTER_COST_DEDUCTION">Net after cost + deduction</option></select></label>
              <label><span>Extra deduction</span><select [(ngModel)]="p.extra_deduction_type"><option value="NONE">None</option><option value="AMOUNT">Amount</option><option value="PERCENT">Percentage</option></select></label>
              <label><span>Deduction value</span><input type="number" [(ngModel)]="p.extra_deduction_value" placeholder="0"></label>
              <label class="wide"><span>Description</span><input [(ngModel)]="p.description" placeholder="Optional note"></label>
              <label class="check-line"><input type="checkbox" [(ngModel)]="p.active"> Active</label>
            </div>
          </div>
        </div>
        <button class="btn secondary" type="button" (click)="addProfile()">+ Add Commission Profile</button>
      </mat-card>

      <mat-card class="commission-card" *ngIf="consultant.id || consultant.name">
        <div class="panel-title"><h3>Test / Profile Exceptions</h3><span class="status-pill">{{consultant.commission_rules?.length || 0}} rules</span></div>
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
            <select [(ngModel)]="r.action"><option value="USE_PROFILE">Use selected profile</option><option value="NO_COMMISSION">No commission</option></select>
            <select [(ngModel)]="r.profile_temp_id" [disabled]="r.action === 'NO_COMMISSION'"><option [ngValue]="null">Select profile</option><option *ngFor="let p of consultant.commission_profiles" [ngValue]="p.temp_id || p.id || p.profile_name">{{p.profile_name}}</option></select>
            <button class="icon-danger" type="button" title="Remove rule" (click)="removeRule(i)">×</button>
          </div>
        </div>
        <ng-template #noRules><div class="commission-note">No exceptions added. Default commission profile will apply to all billable tests and profiles.</div></ng-template>
      </mat-card>

      <mat-card class="commission-card">
        <div class="panel-title"><h3>Consultants</h3><span class="status-pill">{{consultants().length}}</span></div>
        <div class="action-message" *ngIf="actionMessage">{{actionMessage}}</div><table><tr><th>Name</th><th>Status</th><th>Default profile</th><th>Rules</th><th></th></tr><tr *ngFor="let c of consultants()"><td>{{c.name}}<br><small>{{c.clinic}}</small></td><td><span class="status-pill" [class.inactive]="!c.active">{{c.active ? 'Active' : 'Archived'}}</span></td><td>{{defaultProfileName(c)}}</td><td>{{c.commission_rules?.length || 0}}</td><td><div class="row-actions"><button class="icon-btn" title="Edit" (click)="editConsultant(c)">✎</button><button class="icon-danger" title="Delete or archive" (click)="deleteConsultant(c)">×</button></div></td></tr></table>
      </mat-card>
    </section>
  `,
  styles: [`
    .commission-page{display:grid;gap:18px}.commission-card{padding:16px;border-radius:20px}.consultant-basic-grid,.commission-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end}.consultant-basic-grid label,.commission-grid label,.rule-search-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:900}.consultant-basic-grid input,.commission-grid input,.commission-grid select,.rule-search-grid input,.commission-rule-row select{height:40px;border-radius:12px;border:1px solid var(--border);background:var(--input,var(--surface-2));color:var(--text);padding:0 11px;font-weight:800}.check-line{display:flex!important;align-items:center;gap:8px;color:var(--text)!important}.check-line input{width:16px;height:16px}.commission-note{border:1px dashed var(--border);border-radius:14px;padding:10px 12px;color:var(--muted);font-weight:750;margin-bottom:12px}.commission-profile-list{display:grid;gap:12px;margin-bottom:12px}.commission-profile-row{border:1px solid var(--border);border-radius:16px;padding:12px;background:color-mix(in srgb,var(--surface) 92%,transparent)}.profile-title-line{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.default-radio{display:flex;gap:8px;align-items:center;font-weight:900;color:var(--text)}.commission-grid .wide{grid-column:span 2}.rule-search-grid{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}.rule-suggestions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0}.rule-suggestions button{border:1px solid var(--border);border-radius:13px;background:var(--surface-2);color:var(--text);padding:10px;text-align:left;cursor:pointer}.rule-suggestions small,.commission-rule-row small{display:block;color:var(--muted);font-weight:750}.commission-table{display:grid;gap:6px}.commission-table-head,.commission-rule-row{display:grid;grid-template-columns:1.2fr .9fr .9fr 42px;gap:10px;align-items:center}.commission-table-head{color:var(--muted);font-size:11px;font-weight:1000;text-transform:uppercase}.commission-rule-row{border:1px solid var(--border);border-radius:14px;padding:8px}.row-actions{display:flex;justify-content:flex-end;gap:7px}.action-message{margin-bottom:10px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);font-weight:800}.status-pill.inactive{opacity:.65}.icon-btn,.icon-danger{height:34px;width:34px;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer}.icon-danger{color:#ef4444}.actions{display:flex;gap:10px;margin-top:14px}@media(max-width:900px){.consultant-basic-grid,.commission-grid,.rule-suggestions{grid-template-columns:1fr}.commission-table-head,.commission-rule-row{grid-template-columns:1fr}.commission-grid .wide{grid-column:auto}}
  `]
})
export class ConsultantsPageComponent implements OnInit {
  @Output() changed = new EventEmitter<void>();
  consultants = signal<any[]>([]);
  tests:any[] = [];
  profiles:any[] = [];
  ruleSearch = '';
  actionMessage = '';
  consultant:any = this.emptyConsultant();

  async ngOnInit(){ await this.reload(); }
  async reload(){
    this.consultants.set(await window.limsApi.listConsultants());
    this.tests = await window.limsApi.listTests(true);
    this.profiles = await window.limsApi.listProfiles(true);
  }
  emptyProfile(){ return { temp_id:'tmp_' + Date.now() + '_' + Math.random().toString(16).slice(2), profile_name:'Standard 20%', commission_type:'PERCENT', commission_value:20, calculation_base:'GROSS', extra_deduction_type:'NONE', extra_deduction_value:0, active:true, is_default:false, description:'' }; }
  emptyConsultant(){ const p = this.emptyProfile(); p.is_default = true; return { active:true, name:'', phone:'', clinic:'', commission_profiles:[p], commission_rules:[] }; }
  async saveConsultant(){
    if(!String(this.consultant.name || '').trim()) return;
    const profiles = this.consultant.commission_profiles || [];
    if(!profiles.some((p:any)=>p.is_default)) profiles[0].is_default = true;
    await window.limsApi.saveConsultant(this.consultant);
    this.reset(); await this.reload(); this.changed.emit();
  }
  editConsultant(c:any){
    const copy = JSON.parse(JSON.stringify(c));
    if(!copy.commission_profiles?.length){ const p = this.emptyProfile(); p.is_default = true; copy.commission_profiles = [p]; }
    copy.commission_profiles = copy.commission_profiles.map((p:any)=>({...p, temp_id:p.temp_id || String(p.id || p.profile_name), active:p.active !== false && p.active !== 0, is_default:!!p.is_default}));
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
  addProfile(){ this.consultant.commission_profiles.push(this.emptyProfile()); }
  removeProfile(i:number){ this.consultant.commission_profiles.splice(i,1); if(!this.consultant.commission_profiles.some((p:any)=>p.is_default) && this.consultant.commission_profiles[0]) this.consultant.commission_profiles[0].is_default = true; }
  setDefaultProfile(i:number){ this.consultant.commission_profiles.forEach((p:any,idx:number)=>p.is_default = idx === i); }
  defaultProfileName(c:any){ return (c.commission_profiles || []).find((p:any)=>p.is_default)?.profile_name || (c.default_commission_value ? `${c.default_commission_value} ${c.default_commission_type}` : 'None'); }
  allItems(){ return [...this.tests.map(t=>({item_type:'TEST', item_id:t.id, name:t.display_name || t.name, price:t.price, code:t.code})), ...this.profiles.map(p=>({item_type:'PROFILE', item_id:p.id, name:p.display_name || p.name, price:p.price, code:p.code}))]; }
  ruleSuggestions(){ const q = this.ruleSearch.trim().toLowerCase(); if(!q) return []; const used = new Set((this.consultant.commission_rules || []).map((r:any)=>`${r.item_type}:${r.item_id}`)); return this.allItems().filter(x=>!used.has(`${x.item_type}:${x.item_id}`)).map(x=>({...x, score:this.scoreItem(x,q)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score || a.name.localeCompare(b.name)).slice(0,9); }
  scoreItem(x:any,q:string){ const name=String(x.name||'').toLowerCase(), code=String(x.code||'').toLowerCase(); let s=0; if(code===q)s+=100; if(name===q)s+=90; if(code.startsWith(q))s+=60; if(name.startsWith(q))s+=50; if(name.includes(q))s+=25; if(code.includes(q))s+=25; return s; }
  addRule(x:any){ const def = (this.consultant.commission_profiles || []).find((p:any)=>p.is_default) || this.consultant.commission_profiles?.[0]; this.consultant.commission_rules.push({ item_type:x.item_type, item_id:x.item_id, item_name:x.name, action:'USE_PROFILE', profile_temp_id:def?.temp_id || String(def?.id || def?.profile_name || '') }); this.ruleSearch=''; }
  removeRule(i:number){ this.consultant.commission_rules.splice(i,1); }
  itemName(type:any,id:any){ const list = String(type).toUpperCase() === 'PROFILE' ? this.profiles : this.tests; const found = list.find((x:any)=>+x.id===+id); return found ? (found.display_name || found.name) : `${type} #${id}`; }
}
