import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type BillingSettings = {
  logoEnabled: boolean;
  logoPath: string;
  logoPlacement: 'left' | 'center' | 'right';
  logoWidth: number;
  logoHeight: number;
  centreName: string;
  subtitle: string;
  address: string;
  phone: string;
  email: string;
  invoiceTitle: string;
  footerText: string;
  thankYouText: string;
  authorisedLabel: string;
  fontFamily: string;
  centreNameSize: number;
  subtitleSize: number;
  bodySize: number;
  patientSize: number;
  tableHeaderSize: number;
  tableBodySize: number;
  totalsSize: number;
  footerSize: number;
  primaryColor: string;
  accentColor: string;
  textColor: string;
  borderColor: string;
  alternateRowColor: string;
  showPhone: boolean;
  showEmail: boolean;
  showAddress: boolean;
  showPatientAddress: boolean;
  showConsultant: boolean;
  showItemDiscount: boolean;
  showAuthorisedSignature: boolean;
  showThankYou: boolean;
};

const DEFAULTS: BillingSettings = {
  logoEnabled: false, logoPath: '', logoPlacement: 'left', logoWidth: 48, logoHeight: 48,
  centreName: '', subtitle: 'DIAGNOSTIC CENTRE', address: '', phone: '', email: '',
  invoiceTitle: 'BILL / INVOICE', footerText: 'This bill is electronically generated.',
  thankYouText: 'Thank you for choosing us', authorisedLabel: 'Authorised Signatory',
  fontFamily: 'Roboto', centreNameSize: 24, subtitleSize: 9, bodySize: 8.8,
  patientSize: 9, tableHeaderSize: 8.5, tableBodySize: 8.5, totalsSize: 9,
  footerSize: 8, primaryColor: '#0b3a70', accentColor: '#0f68b7', textColor: '#0f172a',
  borderColor: '#d6e3f2', alternateRowColor: '#f8fbff', showPhone: true, showEmail: true,
  showAddress: true, showPatientAddress: true, showConsultant: true, showItemDiscount: true,
  showAuthorisedSignature: true, showThankYou: true
};

@Component({
  selector: 'app-billing-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="billing-settings-page">
      <section class="settings-shell">
        <header class="page-head">
          <div>
            <span class="eyebrow">BILL & RECEIPT PDF</span>
            <h2>Billing Settings</h2>
            <p>Configure the identity, logo, typography, colours and visible fields used by both bill and receipt PDFs.</p>
          </div>
          <div class="head-actions">
            <button class="btn ghost" type="button" (click)="resetDefaults()">Restore defaults</button>
            <button class="btn primary" type="button" [disabled]="saving()" (click)="save()">{{saving() ? 'Saving...' : 'Save Billing Settings'}}</button>
          </div>
        </header>

        <div class="designer-grid">
          <nav class="step-nav">
            <button *ngFor="let s of steps" type="button" [class.active]="activeStep()===s.id" (click)="activeStep.set(s.id)">
              <b>{{s.no}}</b><span>{{s.label}}<small>{{s.help}}</small></span>
            </button>
          </nav>

          <section class="editor-card">
            <ng-container [ngSwitch]="activeStep()">
              <div *ngSwitchCase="'identity'" class="section-content">
                <div class="section-title"><h3>Billing identity and logo</h3><p>The same identity and logo are used in bill PDFs and payment receipts.</p></div>

                <section class="logo-card">
                  <div class="logo-card-head">
                    <div><b>Billing logo</b><small>PNG or JPG. This does not change the laboratory report logo.</small></div>
                    <label class="switch-row"><input type="checkbox" [(ngModel)]="model.logoEnabled"><span>Use logo</span></label>
                  </div>
                  <div class="logo-actions">
                    <button class="btn ghost" type="button" (click)="chooseLogo()">Upload / Change Logo</button>
                    <button class="btn ghost danger" type="button" [disabled]="!model.logoPath" (click)="clearLogo()">Clear</button>
                  </div>
                  <div class="form-grid three">
                    <label><span>Placement</span><select [(ngModel)]="model.logoPlacement"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                    <label><span>Logo width</span><input type="number" min="10" max="160" step="1" [(ngModel)]="model.logoWidth"></label>
                    <label><span>Logo height</span><input type="number" min="10" max="120" step="1" [(ngModel)]="model.logoHeight"></label>
                    <label class="wide"><span>Selected logo</span><input readonly [ngModel]="model.logoPath || 'No billing logo selected'"></label>
                  </div>
                </section>

                <div class="form-grid two">
                  <label><span>Centre / Business Name</span><input [(ngModel)]="model.centreName" placeholder="Uses organisation name when empty"></label>
                  <label><span>Subtitle</span><input [(ngModel)]="model.subtitle" placeholder="Diagnostic Centre"></label>
                  <label class="wide"><span>Address</span><textarea rows="3" [(ngModel)]="model.address" placeholder="Uses organisation address when empty"></textarea></label>
                  <label><span>Phone</span><input [(ngModel)]="model.phone"></label>
                  <label><span>Email</span><input [(ngModel)]="model.email"></label>
                  <label><span>Bill title</span><input [(ngModel)]="model.invoiceTitle"></label>
                  <label><span>Authorised label</span><input [(ngModel)]="model.authorisedLabel"></label>
                  <label class="wide"><span>Footer wording</span><textarea rows="2" [(ngModel)]="model.footerText"></textarea></label>
                  <label class="wide"><span>Thank-you wording</span><input [(ngModel)]="model.thankYouText"></label>
                </div>
              </div>

              <div *ngSwitchCase="'typography'" class="section-content">
                <div class="section-title"><h3>Typography</h3><p>These font settings are applied to both bill and receipt PDFs.</p></div>
                <div class="form-grid three">
                  <label><span>Font family</span><select [(ngModel)]="model.fontFamily"><option *ngFor="let f of fonts" [value]="f">{{fontLabel(f)}}</option></select></label>
                  <label><span>Centre name size</span><input type="number" min="10" max="36" step="0.5" [(ngModel)]="model.centreNameSize"></label>
                  <label><span>Subtitle size</span><input type="number" min="6" max="20" step="0.5" [(ngModel)]="model.subtitleSize"></label>
                  <label><span>Default body size</span><input type="number" min="6" max="18" step="0.5" [(ngModel)]="model.bodySize"></label>
                  <label><span>Patient details size</span><input type="number" min="6" max="18" step="0.5" [(ngModel)]="model.patientSize"></label>
                  <label><span>Table heading size</span><input type="number" min="6" max="18" step="0.5" [(ngModel)]="model.tableHeaderSize"></label>
                  <label><span>Table item size</span><input type="number" min="6" max="18" step="0.5" [(ngModel)]="model.tableBodySize"></label>
                  <label><span>Totals size</span><input type="number" min="6" max="20" step="0.5" [(ngModel)]="model.totalsSize"></label>
                  <label><span>Footer size</span><input type="number" min="6" max="16" step="0.5" [(ngModel)]="model.footerSize"></label>
                </div>
              </div>

              <div *ngSwitchCase="'appearance'" class="section-content">
                <div class="section-title"><h3>Colours and table appearance</h3><p>The same billing colour system is used for bills and receipts.</p></div>
                <div class="color-grid">
                  <label><span>Primary colour</span><input type="color" [(ngModel)]="model.primaryColor"><code>{{model.primaryColor}}</code></label>
                  <label><span>Accent colour</span><input type="color" [(ngModel)]="model.accentColor"><code>{{model.accentColor}}</code></label>
                  <label><span>Text colour</span><input type="color" [(ngModel)]="model.textColor"><code>{{model.textColor}}</code></label>
                  <label><span>Border colour</span><input type="color" [(ngModel)]="model.borderColor"><code>{{model.borderColor}}</code></label>
                  <label><span>Alternate row</span><input type="color" [(ngModel)]="model.alternateRowColor"><code>{{model.alternateRowColor}}</code></label>
                </div>
              </div>

              <div *ngSwitchCase="'visibility'" class="section-content">
                <div class="section-title"><h3>Visible billing sections</h3><p>These visibility choices are shared by bill and receipt PDFs where applicable.</p></div>
                <div class="check-grid">
                  <label><input type="checkbox" [(ngModel)]="model.showAddress"><span>Show centre address</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showPhone"><span>Show phone</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showEmail"><span>Show email</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showPatientAddress"><span>Show patient address</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showConsultant"><span>Show consultant</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showItemDiscount"><span>Show item discount columns</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showAuthorisedSignature"><span>Show authorised signature</span></label>
                  <label><input type="checkbox" [(ngModel)]="model.showThankYou"><span>Show thank-you strip</span></label>
                </div>
              </div>
            </ng-container>
          </section>
        </div>
      </section>
      <div *ngIf="message()" class="status" [class.error]="messageError()">{{message()}}</div>
    </main>
  `,
  styles: [`
    :host{display:block}.billing-settings-page{padding:16px;min-height:100%;box-sizing:border-box}.settings-shell{max-width:1220px;margin:0 auto}.page-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:16px}.page-head h2{margin:4px 0 5px;font-size:25px}.page-head p{margin:0;color:var(--muted);font-size:12px}.eyebrow{font-size:10px;font-weight:950;letter-spacing:.13em;color:var(--accent)}.head-actions,.logo-actions{display:flex;gap:9px;flex-wrap:wrap}.btn{border:1px solid var(--border);border-radius:11px;padding:9px 14px;font-weight:850;cursor:pointer;background:var(--row);color:var(--text)}.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}.btn.danger{color:#ef4444}.btn:disabled{opacity:.55;cursor:not-allowed}.designer-grid{display:grid;grid-template-columns:230px minmax(0,1fr);gap:14px;align-items:start}.step-nav,.editor-card{border:1px solid var(--border);border-radius:20px;background:var(--panel);box-shadow:0 14px 38px rgba(0,0,0,.12)}.step-nav{padding:8px;display:grid;gap:5px;position:sticky;top:10px}.step-nav button{display:flex;gap:10px;text-align:left;border:0;border-radius:13px;padding:10px;background:transparent;color:var(--text);cursor:pointer}.step-nav button.active{background:var(--accent-soft);color:var(--accent)}.step-nav b{width:28px;height:28px;display:grid;place-items:center;border:1px solid var(--border);border-radius:9px}.step-nav span{font-weight:900}.step-nav small{display:block;color:var(--muted);font-size:10px;margin-top:3px;font-weight:700}.editor-card{min-height:560px;padding:20px}.section-title{border-bottom:1px solid var(--border);padding-bottom:12px;margin-bottom:16px}.section-title h3{margin:0 0 4px}.section-title p{margin:0;color:var(--muted);font-size:12px}.form-grid{display:grid;gap:13px}.form-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.form-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.form-grid .wide{grid-column:1/-1}label span{display:block;font-size:11px;font-weight:850;color:var(--muted);margin-bottom:6px}input,select,textarea{width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:11px;background:var(--input);color:var(--text);padding:10px 11px;outline:none}textarea{resize:vertical}.logo-card{border:1px solid var(--border);border-radius:17px;background:var(--row);padding:14px;margin-bottom:16px}.logo-card-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px}.logo-card-head b,.logo-card-head small{display:block}.logo-card-head small{color:var(--muted);font-size:10px;margin-top:3px}.switch-row{display:flex;align-items:center;gap:8px;white-space:nowrap}.switch-row input{width:auto}.switch-row span{margin:0;color:var(--text)}.logo-actions{margin-bottom:13px}.color-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.color-grid label{display:grid;grid-template-columns:1fr 48px auto;align-items:center;gap:8px;border:1px solid var(--border);border-radius:14px;padding:11px}.color-grid label span{margin:0}.color-grid input{height:38px;padding:3px}.color-grid code{font-size:10px;color:var(--muted)}.check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.check-grid label{display:flex;align-items:center;gap:9px;border:1px solid var(--border);border-radius:14px;padding:12px;background:var(--row)}.check-grid input{width:auto}.check-grid span{margin:0;color:var(--text)}.status{position:fixed;right:22px;bottom:22px;background:#166534;color:#fff;border-radius:12px;padding:11px 14px;font-weight:800;z-index:3000}.status.error{background:#991b1b}@media(max-width:760px){.designer-grid{grid-template-columns:1fr}.step-nav{position:static;grid-template-columns:repeat(2,1fr)}.form-grid.two,.form-grid.three,.color-grid,.check-grid{grid-template-columns:1fr}.page-head,.logo-card-head{flex-direction:column}.head-actions{width:100%}.head-actions .btn{flex:1}}
  `]
})
export class BillingSettingsComponent implements OnInit {
  activeStep = signal('identity');
  saving = signal(false);
  message = signal('');
  messageError = signal(false);
  model: BillingSettings = {...DEFAULTS};
  steps = [
    {id:'identity',no:1,label:'Identity & logo',help:'Logo, name and wording'},
    {id:'typography',no:2,label:'Typography',help:'Bill and receipt fonts'},
    {id:'appearance',no:3,label:'Colours',help:'Billing colour theme'},
    {id:'visibility',no:4,label:'Visible sections',help:'Choose printed fields'}
  ];
  fonts = ['Roboto','Inter','Lato','NotoSans','NotoSerif','Poppins','Montserrat','OpenSans','NunitoSans','SourceSans3','Merriweather','LibreBaskerville','Lora'];
  async ngOnInit(){ await this.load(); }
  fontLabel(f:string){ return f.replace(/([a-z])([A-Z0-9])/g,'$1 $2'); }
  private key(k:keyof BillingSettings){ return `billing.pdf.${String(k)}`; }
  private bool(v:any, fallback:boolean){ if(v===undefined||v===null||v==='') return fallback; return String(v).toLowerCase()==='true'; }
  private num(v:any, fallback:number){ const n=Number(v); return Number.isFinite(n)?n:fallback; }
  async chooseLogo(){
    try {
      const selected=await (window as any).limsApi.chooseReportBackgroundImage();
      if(!selected?.path) return;
      this.model={...this.model,logoEnabled:true,logoPath:selected.path};
    } catch(e:any){ this.flash(e?.message||'Unable to select billing logo',true); }
  }
  clearLogo(){ this.model={...this.model,logoEnabled:false,logoPath:''}; }
  async load(){
    try {
      const s = await window.limsApi.getSettings();
      const next:any={...DEFAULTS};
      for(const k of Object.keys(DEFAULTS) as (keyof BillingSettings)[]){
        const raw=s[this.key(k)]; const d=(DEFAULTS as any)[k];
        next[k]=typeof d==='boolean'?this.bool(raw,d):typeof d==='number'?this.num(raw,d):(raw ?? d);
      }
      this.model=next;
    } catch(e:any){ this.flash(e?.message||'Unable to load billing settings',true); }
  }
  async save(){
    this.saving.set(true);
    try {
      const payload:Record<string,string>={};
      for(const k of Object.keys(DEFAULTS) as (keyof BillingSettings)[]) payload[this.key(k)]=String((this.model as any)[k] ?? '');
      await window.limsApi.saveSettings(payload);
      this.flash('Billing settings saved for bill and receipt PDFs.');
    } catch(e:any){ this.flash(e?.message||'Unable to save billing settings',true); }
    finally{ this.saving.set(false); }
  }
  resetDefaults(){ this.model={...DEFAULTS}; this.flash('Defaults restored in the editor. Click Save Billing Settings to apply.'); }
  private flash(text:string,error=false){ this.message.set(text);this.messageError.set(error);setTimeout(()=>this.message.set(''),3500); }
}
