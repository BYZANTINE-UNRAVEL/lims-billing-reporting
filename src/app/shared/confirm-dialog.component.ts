import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';

export type ConfirmDialogTone = 'warning' | 'danger' | 'info' | 'success';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <dialog
      #dialog
      class="dialog-backdrop"
      (cancel)="onNativeCancel($event)"
      (click)="onBackdropClick($event)">
      <section class="confirm-card" role="document" [attr.aria-label]="title" (click)="$event.stopPropagation()">
        <div class="confirm-icon" [class.danger]="tone === 'danger'" [class.info]="tone === 'info'" [class.success]="tone === 'success'">
          <span *ngIf="tone === 'danger'">!</span>
          <span *ngIf="tone === 'warning'">!</span>
          <span *ngIf="tone === 'info'">i</span>
          <span *ngIf="tone === 'success'">✓</span>
        </div>
        <div class="confirm-content">
          <h3>{{ title }}</h3>
          <p>{{ message }}</p>
          <small *ngIf="details">{{ details }}</small>
        </div>
        <div class="confirm-actions">
          <button *ngIf="showCancel" class="btn secondary" type="button" (click)="cancel.emit()">{{ cancelText }}</button>
          <button class="btn primary" [class.danger-btn]="tone === 'danger'" type="button" (click)="confirm.emit()">{{ confirmText }}</button>
        </div>
      </section>
    </dialog>
  `,
  styles: [`
    dialog.dialog-backdrop {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 24px !important;
      border: 0 !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      background: transparent !important;
      color: var(--text);
      display: none !important;
    }
    dialog.dialog-backdrop[open] {
      display: grid !important;
      place-items: center !important;
    }
    dialog.dialog-backdrop::backdrop {
      background: rgba(2, 6, 23, 0.72);
      -webkit-backdrop-filter: blur(12px);
      backdrop-filter: blur(12px);
    }
    .confirm-card {
      width: min(520px, calc(100vw - 48px));
      max-height: calc(100vh - 48px);
      overflow: auto;
      border: 1px solid var(--border);
      background: var(--panel);
      color: var(--text);
      border-radius: 26px;
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.38);
      padding: 22px;
      display: grid;
      grid-template-columns: 58px 1fr;
      gap: 16px;
      animation: popIn 0.16s ease-out;
      box-sizing: border-box;
    }
    .confirm-icon {
      width: 54px;
      height: 54px;
      border-radius: 20px;
      display: grid;
      place-items: center;
      font-weight: 900;
      font-size: 24px;
      background: rgba(245, 158, 11, 0.16);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.28);
    }
    .confirm-icon.danger { background: rgba(239, 68, 68, 0.15); color: #ef4444; border-color: rgba(239, 68, 68, 0.28); }
    .confirm-icon.info { background: var(--accent-soft); color: var(--accent); border-color: var(--border); }
    .confirm-icon.success { background: rgba(16, 185, 129, 0.15); color: var(--success); border-color: rgba(16, 185, 129, 0.28); }
    .confirm-content h3 { margin: 0 0 8px; font-size: 20px; }
    .confirm-content p { margin: 0; line-height: 1.5; color: var(--muted); }
    .confirm-content small { display: block; margin-top: 10px; color: var(--muted); }
    .confirm-actions { grid-column: 1 / -1; display: flex; justify-content: flex-end; gap: 10px; padding-top: 8px; }
    .danger-btn { background: linear-gradient(135deg, #ef4444, #f97316) !important; }
    @keyframes popIn { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (max-width: 600px) {
      dialog.dialog-backdrop { padding: 12px !important; }
      .confirm-card { width: calc(100vw - 24px); grid-template-columns: 48px 1fr; padding: 18px; }
      .confirm-icon { width: 46px; height: 46px; border-radius: 16px; }
    }
  `]
})
export class ConfirmDialogComponent implements AfterViewInit, OnChanges {
  @ViewChild('dialog') dialog?: ElementRef<HTMLDialogElement>;

  @Input() open = false;
  @Input() title = 'Please confirm';
  @Input() message = '';
  @Input() details = '';
  @Input() tone: ConfirmDialogTone = 'warning';
  @Input() confirmText = 'Continue';
  @Input() cancelText = 'Cancel';
  @Input() showCancel = true;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  ngAfterViewInit(): void {
    this.syncDialogState();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    queueMicrotask(() => this.syncDialogState());
  }

  onNativeCancel(event: Event): void {
    event.preventDefault();
    if (this.showCancel) this.cancel.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget && this.showCancel) this.cancel.emit();
  }

  private syncDialogState(): void {
    const dialog = this.dialog?.nativeElement;
    if (!dialog) return;
    if (this.open && !dialog.open) {
      dialog.showModal();
      return;
    }
    if (!this.open && dialog.open) dialog.close();
  }
}
