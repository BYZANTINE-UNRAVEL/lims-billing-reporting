import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { CommissionConfigPageComponent } from './commission-config-page.component';
import { CommissionStatementPageComponent } from './commission-statement-page.component';
import { CommissionsPageComponent } from './commissions-page.component';

@Component({
  selector: 'app-commissions-workspace',
  standalone: true,
  imports: [CommonModule, CommissionConfigPageComponent, CommissionStatementPageComponent, CommissionsPageComponent],
  template: `
    <section class="masters-shell">
      <nav class="masters-tabs" aria-label="Commission sections">
        <button type="button" [class.active]="tab()==='config'" (click)="tab.set('config')">
          <span class="tab-ico">%</span>
          Config
        </button>
        <button type="button" [class.active]="tab()==='statement'" (click)="tab.set('statement')">
          <span class="tab-ico">☷</span>
          Statement
        </button>
        <button type="button" [class.active]="tab()==='register'" (click)="tab.set('register')">
          <span class="tab-ico">▦</span>
          Register
        </button>
      </nav>

      <app-commission-config-page *ngIf="tab()==='config'"></app-commission-config-page>
      <app-commission-statement-page *ngIf="tab()==='statement'"></app-commission-statement-page>
      <app-commissions-page *ngIf="tab()==='register'"></app-commissions-page>
    </section>
  `,
  styles: [`
    :host{display:block;min-width:0}
    /* Light-first tokens — same bug as config: dark defaults + white shell washed text out. */
    .masters-shell{
      padding:4px 20px 18px;color:#0f172a;
      --accent:#2563eb;--accent-soft:rgba(37,99,235,.12);
      --panel:#ffffff;--row:#f8fafc;--input:#ffffff;
      --border:#dbe4f0;--text:#0f172a;--muted:#64748b;--shadow:0 14px 32px rgba(15,23,42,.08);
    }
    :host-context(body.dark-theme) .masters-shell{
      color:#f8fafc;
      --accent:#3b82f6;--accent-soft:rgba(59,130,246,.15);
      --panel:rgba(15,23,42,.9);--row:rgba(15,23,42,.58);--input:#0b1220;
      --border:rgba(148,163,184,.18);--text:#f8fafc;--muted:#94a3b8;--shadow:0 14px 40px rgba(0,0,0,.22);
    }
    .masters-tabs{
      display:grid;grid-template-columns:repeat(3,1fr);overflow:hidden;margin:0 0 10px;
      border:1px solid var(--border);border-radius:14px;
      background:var(--panel);box-shadow:var(--shadow);
    }
    .masters-tabs button{
      height:38px;border:0;border-right:1px solid var(--border);background:transparent;color:var(--muted);
      font-size:12px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;transition:.16s;
    }
    .masters-tabs button:last-child{border-right:0}
    .masters-tabs button:hover{background:var(--accent-soft);color:var(--text)}
    .masters-tabs button.active{background:linear-gradient(180deg,color-mix(in srgb,var(--accent) 13%,transparent),color-mix(in srgb,var(--accent) 5%,transparent));color:var(--accent);box-shadow:inset 0 -2px 0 var(--accent)}
    .tab-ico{font-size:14px}
    @media (max-width:720px){
      .masters-shell{padding:12px}
      .masters-tabs{grid-template-columns:1fr}
      .masters-tabs button{height:36px}
    }
  `]
})
export class CommissionsWorkspaceComponent {
  tab = signal<'config' | 'statement' | 'register'>('config');
}
