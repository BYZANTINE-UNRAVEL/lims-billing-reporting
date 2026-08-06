import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

export type WhatsAppContactRequest = {
  mobile?: string | null;
  patientName?: string | null;
  billNo?: string | null;
};

type PromptState = { patientName: string; billNo: string; error: string };

@Component({
  selector: 'app-whatsapp-contact-prompt',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div #backdrop
         class="modal-backdrop output-modal-backdrop whatsapp-output-backdrop"
         *ngIf="prompt() as w"
         (click)="cancel()"
         (wheel)="$event.stopPropagation()"
         (touchmove)="$event.stopPropagation()">
      <div class="history-modal approved-action-modal rich-output-modal whatsapp-output-modal" (click)="$event.stopPropagation()">
        <header class="output-modal-header">
          <div class="output-modal-heading">
            <span class="output-modal-icon whatsapp-output-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Zm0 1.8a8.1 8.1 0 0 1 6.9 12.3l-.3.46.2.96-1.1.63-.93.22-.48.29a8.1 8.1 0 1 1-4.29-14.86Zm-2.8 3.4c-.22 0-.58.08-.88.4-.3.32-1.14 1.11-1.14 2.7 0 1.6 1.17 3.14 1.33 3.35.17.22 2.26 3.62 5.57 4.93 2.75 1.09 3.31.87 3.91.82.6-.05 1.94-.79 2.21-1.55.28-.76.28-1.41.2-1.55-.08-.14-.3-.22-.63-.38-.33-.17-1.94-.96-2.24-1.07-.3-.1-.52-.16-.74.16-.22.32-.85 1.07-1.04 1.29-.19.22-.38.25-.71.08-.33-.16-1.38-.51-2.63-1.62-1-.89-1.68-1.98-1.88-2.31-.2-.33-.02-.5.15-.67.15-.15.33-.38.5-.57.16-.19.22-.32.33-.54.11-.22.05-.41-.03-.57-.08-.16-.74-1.78-1.01-2.44-.26-.63-.53-.54-.74-.55Z"/></svg>
            </span>
            <div>
              <h3>Open WhatsApp</h3>
              <p>No mobile number is saved · enter a number to open the chat</p>
            </div>
          </div>
          <button class="output-modal-close" type="button" (click)="cancel()" aria-label="Close" title="Close">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>
          </button>
        </header>

        <div class="output-modal-meta">
          <div><span>Patient</span><b>{{w.patientName || '-'}}</b></div>
          <div><span>Bill</span><b>{{w.billNo || '-'}}</b></div>
          <div><span>Action</span><b>Open chat only</b></div>
        </div>

        <div class="output-modal-body whatsapp-output-body">
          <section class="output-column settings-column whatsapp-main-column">
            <div class="output-column-head">
              <div>
                <h4>Mobile number</h4>
                <p>Use the patient&apos;s WhatsApp number. Country code is added for 10-digit Indian numbers.</p>
              </div>
            </div>
            <label class="whatsapp-phone-field">
              <span>Mobile number</span>
              <div class="whatsapp-phone-input">
                <em>+91</em>
                <input type="tel" inputmode="tel" autocomplete="tel" maxlength="15" placeholder="98765 43210"
                       [formControl]="mobileControl" (keydown.enter)="confirm()" data-whatsapp-autofocus="1">
              </div>
              <small>Example: 9876543210 · do not include spaces or symbols</small>
            </label>
            <div class="notice danger" *ngIf="w.error">{{w.error}}</div>
          </section>

          <aside class="output-column preview-column">
            <div class="preview-card">
              <div class="preview-document-icon whatsapp-preview-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M12.04 2a9.9 9.9 0 0 0-8.5 14.9L2 22l5.25-1.38A9.9 9.9 0 1 0 12.04 2Z"/></svg>
              </div>
              <h4>WhatsApp handoff</h4>
              <div class="preview-summary-row"><span>Patient</span><b>{{w.patientName || '-'}}</b></div>
              <div class="preview-summary-row"><span>Bill</span><b>{{w.billNo || '-'}}</b></div>
              <div class="preview-summary-row"><span>Opens</span><b>WhatsApp chat</b></div>
              <div class="preview-summary-row"><span>Message</span><b>None (contact only)</b></div>
            </div>
          </aside>
        </div>

        <footer class="output-modal-footer">
          <div class="output-footer-summary">
            <b>Open WhatsApp contact</b>
            <small>No report PDF is attached. This only opens the chat for the entered number.</small>
          </div>
          <div class="output-footer-actions">
            <button class="btn ghost" type="button" (click)="cancel()">Cancel</button>
            <button class="btn whatsapp-solid output-primary-action" type="button" (click)="confirm()" [disabled]="busy()">Open WhatsApp</button>
          </div>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    :host{display:contents}
    .modal-backdrop.output-modal-backdrop{position:fixed!important;inset:0!important;left:0!important;top:0!important;right:0!important;bottom:0!important;width:100vw!important;height:100vh!important;z-index:2147483600!important;background:rgba(15,23,42,.74);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);overscroll-behavior:contain;padding:28px;box-sizing:border-box;display:flex;align-items:center;justify-content:center}
    .rich-output-modal{width:min(1100px,94vw);height:min(720px,88vh);max-height:88vh;overflow:hidden!important;padding:0!important;display:flex;flex-direction:column;border-radius:26px;box-shadow:0 28px 90px rgba(2,6,23,.45);margin:auto;border:1px solid var(--border);background:var(--panel);color:var(--text)}
    .output-modal-header{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,color-mix(in srgb,var(--panel) 88%,#25D366),var(--panel))}
    .output-modal-heading{display:flex;align-items:center;gap:12px}.output-modal-heading h3{margin:0;font-size:19px}.output-modal-heading p{margin:4px 0 0;color:var(--muted);font-size:12px}
    .output-modal-icon{width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:rgba(37,211,102,.16);color:#25D366}
    .output-modal-icon svg{width:22px;height:22px;fill:currentColor}
    .output-modal-close{width:40px;height:40px;border:1px solid var(--border);border-radius:13px;background:var(--row);color:var(--text);display:grid;place-items:center;cursor:pointer;padding:0}
    .output-modal-close svg{width:18px;height:18px;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round}
    .output-modal-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 20px;border-bottom:1px solid var(--border)}
    .output-modal-meta div{border:1px solid var(--border);border-radius:14px;background:var(--row);padding:10px 12px;min-width:0}
    .output-modal-meta span,.output-modal-meta b{display:block}.output-modal-meta span{color:var(--muted);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    .output-modal-meta b{margin-top:4px;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .whatsapp-output-body{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.75fr);gap:16px;padding:18px 20px;min-height:0;overflow:auto;flex:1}
    .output-column-head{margin-bottom:12px}.output-column-head h4{margin:0;font-size:15px}.output-column-head p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.4}
    .whatsapp-phone-field{display:grid;gap:7px}.whatsapp-phone-field>span{font-size:11px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
    .whatsapp-phone-input{display:grid;grid-template-columns:auto 1fr;align-items:center;border:1px solid var(--border);border-radius:14px;background:var(--input);overflow:hidden}
    .whatsapp-phone-input:focus-within{border-color:color-mix(in srgb,#25D366 55%,var(--border));box-shadow:0 0 0 4px rgba(37,211,102,.14)}
    .whatsapp-phone-input em{font-style:normal;font-weight:950;padding:0 12px;color:#25D366;border-right:1px solid var(--border);background:color-mix(in srgb,#25D366 10%,transparent);height:100%;display:grid;place-items:center;font-size:13px}
    .whatsapp-phone-input input{border:0;outline:0;background:transparent;color:var(--text);height:48px;padding:0 12px;font-size:16px;font-weight:850;width:100%;min-width:0}
    .whatsapp-phone-field small{color:var(--muted);font-size:11px;font-weight:750;line-height:1.35}
    .notice.danger{margin-top:12px;border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.1);color:#ef4444;border-radius:12px;padding:9px 11px;font-size:12px;font-weight:850}
    .preview-card{border:1px solid var(--border);border-radius:18px;background:var(--row);padding:16px;display:grid;gap:10px;height:fit-content}
    .preview-document-icon{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(37,211,102,.14);color:#25D366}
    .preview-document-icon svg{width:28px;height:28px;fill:currentColor}
    .preview-card h4{margin:0;font-size:14px}
    .preview-summary-row{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:12px}
    .preview-summary-row span{color:var(--muted);font-weight:800}.preview-summary-row b{font-weight:900;text-align:right}
    .output-modal-footer{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 20px;border-top:1px solid var(--border);background:color-mix(in srgb,var(--panel) 94%,var(--row))}
    .output-footer-summary b,.output-footer-summary small{display:block}.output-footer-summary b{font-size:13px}.output-footer-summary small{margin-top:3px;color:var(--muted);font-size:11px}
    .output-footer-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
    .btn{height:36px;border:1px solid var(--border);border-radius:12px;padding:0 14px;font-size:12px;font-weight:900;cursor:pointer;background:var(--input);color:var(--text)}
    .btn.ghost{background:transparent}.btn.whatsapp-solid{background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:0;box-shadow:0 14px 28px rgba(37,211,102,.22)}
    .btn:disabled{opacity:.55;cursor:not-allowed;box-shadow:none}
    @media(max-width:900px){.whatsapp-output-body,.output-modal-meta{grid-template-columns:1fr}.output-modal-footer{flex-direction:column;align-items:stretch}}
  `]
})
export class WhatsAppContactPromptComponent implements OnDestroy {
  private backdropElement: HTMLElement | null = null;
  private previousBodyOverflow = '';
  private resolver: ((value: string | null) => void) | null = null;

  readonly prompt = signal<PromptState | null>(null);
  readonly busy = signal(false);
  readonly mobileControl = new FormControl('', { nonNullable: true });

  @ViewChild('backdrop')
  set backdrop(ref: ElementRef<HTMLElement> | undefined) {
    const element = ref?.nativeElement ?? null;
    if (element && element !== this.backdropElement) {
      this.backdropElement = element;
      this.previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(element);
      return;
    }
    if (!element && this.backdropElement) {
      this.backdropElement = null;
      document.body.style.overflow = this.previousBodyOverflow;
    }
  }

  ngOnDestroy() {
    document.body.style.overflow = this.previousBodyOverflow;
    this.backdropElement = null;
    this.resolver?.(null);
    this.resolver = null;
  }

  /** Opens WhatsApp for the given contact. Prompts for a number when missing. */
  async openContact(request: WhatsAppContactRequest = {}): Promise<{ ok: boolean; mobile?: string; cancelled?: boolean; error?: string }> {
    let mobile = this.digits(request.mobile);
    if (!mobile) {
      mobile = (await this.askForMobile(request)) || '';
      if (!mobile) return { ok: false, cancelled: true };
    }
    return this.launch(mobile);
  }

  cancel() {
    this.prompt.set(null);
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(null);
  }

  confirm() {
    const state = this.prompt();
    if (!state) return;
    const mobile = this.digits(this.mobileControl.value);
    if (mobile.length < 8) {
      this.prompt.set({ ...state, error: 'Enter a valid mobile number (at least 8 digits).' });
      this.focusInput();
      return;
    }
    this.prompt.set(null);
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(mobile);
  }

  private askForMobile(request: WhatsAppContactRequest): Promise<string | null> {
    this.mobileControl.setValue('');
    this.prompt.set({
      patientName: String(request.patientName || '').trim(),
      billNo: String(request.billNo || '').trim(),
      error: ''
    });
    this.focusInput();
    return new Promise(resolve => { this.resolver = resolve; });
  }

  private async launch(mobile: string): Promise<{ ok: boolean; mobile?: string; error?: string }> {
    const api: any = window.limsApi as any;
    if (!api?.openWhatsAppContact) {
      return { ok: false, error: 'Open WhatsApp is not available in this build. Restart the app after rebuild.' };
    }
    this.busy.set(true);
    try {
      const result = await api.openWhatsAppContact(mobile);
      return { ok: true, mobile: result?.mobile || mobile };
    } catch (err: any) {
      return { ok: false, error: err?.message || 'Unable to open WhatsApp.' };
    } finally {
      this.busy.set(false);
    }
  }

  private digits(raw: any): string {
    return String(raw || '').replace(/[^0-9]/g, '');
  }

  private focusInput() {
    let tries = 0;
    const focus = () => {
      tries += 1;
      const el = document.querySelector('input[data-whatsapp-autofocus="1"]') as HTMLInputElement | null;
      if (el) { el.focus({ preventScroll: true }); el.select?.(); return; }
      if (tries < 8) window.setTimeout(focus, 50);
    };
    window.setTimeout(focus, 80);
  }
}
