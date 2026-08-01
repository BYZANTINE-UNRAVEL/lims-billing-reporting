import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';

export interface ProDialogOptions {
  title: string;
  message: string;
  tone?: 'warning' | 'danger' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
}

@Component({
  selector: 'app-pro-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dialog-backdrop" *ngIf="visible()" (mousedown)="$event.preventDefault()">
      <section class="pro-dialog" [class.danger]="options()?.tone === 'danger'" [class.success]="options()?.tone === 'success'">
        <div class="dialog-icon">{{ icon() }}</div>
        <div class="dialog-content">
          <h3>{{ options()?.title }}</h3>
          <p>{{ options()?.message }}</p>
        </div>
        <div class="dialog-actions">
          <button *ngIf="options()?.showCancel !== false" class="btn secondary" type="button" (click)="close(false)">
            {{ options()?.cancelText || 'Stay here' }}
          </button>
          <button class="btn primary" type="button" (click)="close(true)">
            {{ options()?.confirmText || 'Continue' }}
          </button>
        </div>
      </section>
    </div>
  `
})
export class ProDialogComponent {
  visible = signal(false);
  options = signal<ProDialogOptions | null>(null);
  private resolver: ((value: boolean) => void) | null = null;

  confirm(options: ProDialogOptions): Promise<boolean> {
    this.options.set(options);
    this.visible.set(true);
    return new Promise(resolve => this.resolver = resolve);
  }

  alert(options: ProDialogOptions): Promise<boolean> {
    return this.confirm({ ...options, showCancel: false, confirmText: options.confirmText || 'OK' });
  }

  icon() {
    const tone = this.options()?.tone || 'info';
    if (tone === 'danger') return '!';
    if (tone === 'warning') return '⚠';
    if (tone === 'success') return '✓';
    return 'i';
  }

  close(value: boolean) {
    this.visible.set(false);
    const resolve = this.resolver;
    this.resolver = null;
    resolve?.(value);
  }
}
