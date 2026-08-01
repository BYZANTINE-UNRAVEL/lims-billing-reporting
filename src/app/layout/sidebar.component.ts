import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="side" [class.pinned-open]="!collapsed" (mouseenter)="hovered = true" (mouseleave)="hovered = false">
      <button class="side-toggle icon-button" type="button" data-testid="nav-toggle" (click)="toggle.emit()" [title]="collapsed ? 'Pin menu open' : 'Collapse menu'">
        <span class="hamburger">☰</span>
        <span class="nav-label">{{ collapsed ? 'Pin menu' : 'Collapse menu' }}</span>
      </button>

      <div class="brand">
        <div class="logo">{{ (settings['org.name'] || 'LIMS').charAt(0) }}</div>
        <div class="brand-text">
          <h1>{{ settings['org.name'] || 'LIMS Professional' }}</h1>
          <p>Billing & Reporting</p>
        </div>
      </div>

      <nav class="side-nav" aria-label="Main navigation">
        <button class="nav-button" type="button" *ngFor="let n of nav" [attr.data-testid]="'nav-' + n.id" [class.active]="activeTab === n.id" (click)="select.emit(n.id)">
          <span class="nav-icon">{{ n.icon }}</span>
          <span class="nav-label">{{ n.label }}</span>
        </button>
      </nav>
      <button class="theme-toggle" type="button" (click)="themeToggle.emit()">
        <span>{{ theme === 'dark' ? '☀' : '☾' }}</span>
        <span class="nav-label">{{ theme === 'dark' ? 'Light mode' : 'Dark mode' }}</span>
      </button>
    </aside>
  `
})
export class SidebarComponent {
  @Input() nav: Array<{ id: string; label: string; icon: string }> = [];
  @Input() activeTab = 'dashboard';
  @Input() collapsed = false;
  @Input() theme = 'dark';
  @Input() settings: Record<string, string> = {};
  @Input() dashboard: any = null;
  @Output() select = new EventEmitter<string>();
  @Output() toggle = new EventEmitter<void>();
  @Output() themeToggle = new EventEmitter<void>();
  hovered = false;
}
