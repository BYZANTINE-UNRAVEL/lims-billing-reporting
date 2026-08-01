export type LimsDateFormat = 'dd-MM-yyyy' | 'dd/MM/yyyy' | 'yyyy-MM-dd' | 'dd MMM yyyy' | 'MMM dd, yyyy';
export type LimsTimeFormat = '24h' | '12h';

export type LimsDateTimeOptions = {
  timeZone: string;
  dateFormat: LimsDateFormat;
  timeFormat: LimsTimeFormat;
};

const DEFAULT_OPTIONS: LimsDateTimeOptions = {
  timeZone: 'Asia/Kolkata',
  dateFormat: 'dd-MM-yyyy',
  timeFormat: '24h'
};

const DATE_FORMATS = new Set<LimsDateFormat>(['dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd', 'dd MMM yyyy', 'MMM dd, yyyy']);
const TIME_FORMATS = new Set<LimsTimeFormat>(['24h', '12h']);

export class DateTimeSettingsService {
  static storageKeys = {
    timeZone: 'lims-display-time-zone',
    dateFormat: 'lims-display-date-format',
    timeFormat: 'lims-display-time-format',
    appTimeOverrideEnabled: 'lims-app-time-override-enabled',
    appTimeOverrideValue: 'lims-app-time-override-value'
  };

  static options(): LimsDateTimeOptions {
    const timeZone = localStorage.getItem(this.storageKeys.timeZone) || DEFAULT_OPTIONS.timeZone;
    const rawDate = localStorage.getItem(this.storageKeys.dateFormat) as LimsDateFormat | null;
    const rawTime = localStorage.getItem(this.storageKeys.timeFormat) as LimsTimeFormat | null;
    return {
      timeZone: timeZone || DEFAULT_OPTIONS.timeZone,
      dateFormat: rawDate && DATE_FORMATS.has(rawDate) ? rawDate : DEFAULT_OPTIONS.dateFormat,
      timeFormat: rawTime && TIME_FORMATS.has(rawTime) ? rawTime : DEFAULT_OPTIONS.timeFormat
    };
  }

  static sync(settings: Record<string, any> | null | undefined): void {
    if (!settings) return;
    const timeZone = String(settings['display.timeZone'] || settings['time.timeZone'] || settings['timezone'] || DEFAULT_OPTIONS.timeZone);
    const dateFormat = String(settings['display.dateFormat'] || settings['date.format'] || DEFAULT_OPTIONS.dateFormat) as LimsDateFormat;
    const timeFormat = String(settings['display.timeFormat'] || settings['time.format'] || DEFAULT_OPTIONS.timeFormat) as LimsTimeFormat;
    localStorage.setItem(this.storageKeys.timeZone, timeZone || DEFAULT_OPTIONS.timeZone);
    localStorage.setItem(this.storageKeys.dateFormat, DATE_FORMATS.has(dateFormat) ? dateFormat : DEFAULT_OPTIONS.dateFormat);
    localStorage.setItem(this.storageKeys.timeFormat, TIME_FORMATS.has(timeFormat) ? timeFormat : DEFAULT_OPTIONS.timeFormat);
    localStorage.setItem(this.storageKeys.appTimeOverrideEnabled, String(settings['app.time.override.enabled'] || 'false'));
    localStorage.setItem(this.storageKeys.appTimeOverrideValue, String(settings['app.time.override.value'] || ''));
  }

  static applyDefaults(settings: Record<string, any>): Record<string, any> {
    return {
      ...settings,
      'display.timeZone': settings['display.timeZone'] || DEFAULT_OPTIONS.timeZone,
      'display.dateFormat': settings['display.dateFormat'] || DEFAULT_OPTIONS.dateFormat,
      'display.timeFormat': settings['display.timeFormat'] || DEFAULT_OPTIONS.timeFormat,
      'app.time.override.enabled': settings['app.time.override.enabled'] || 'false',
      'app.time.override.value': settings['app.time.override.value'] || ''
    };
  }

  static nowInputValue(): string {
    const manual = this.manualOverrideInputValue();
    if (manual) return manual;
    return this.addMinutesInputValue(0);
  }

  private static manualOverrideInputValue(): string {
    const enabled = String(localStorage.getItem(this.storageKeys.appTimeOverrideEnabled) || '').toLowerCase();
    const raw = String(localStorage.getItem(this.storageKeys.appTimeOverrideValue) || '').trim();
    if ((enabled === 'true' || enabled === '1' || enabled === 'yes' || enabled === 'on') && raw) return raw.slice(0, 16);
    return '';
  }

  static addMinutesInputValue(minutes: number): string {
    const manual = this.manualOverrideInputValue();
    const base = manual ? new Date(manual.replace(' ', 'T')) : new Date();
    const d = new Date(base.getTime() + (Number(minutes) || 0) * 60000);
    return this.toInputDateTime(d);
  }

  static toInputDateTime(value: any): string {
    const p = this.parts(value);
    if (!p) return '';
    return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
  }

  static date(value: any): string {
    const p = this.parts(value);
    if (!p) return '';
    const opts = this.options();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    switch (opts.dateFormat) {
      case 'dd/MM/yyyy': return `${p.d}/${p.mo}/${p.y}`;
      case 'yyyy-MM-dd': return `${p.y}-${p.mo}-${p.d}`;
      case 'dd MMM yyyy': return `${p.d} ${months[Number(p.mo) - 1] || p.mo} ${p.y}`;
      case 'MMM dd, yyyy': return `${months[Number(p.mo) - 1] || p.mo} ${p.d}, ${p.y}`;
      case 'dd-MM-yyyy':
      default: return `${p.d}-${p.mo}-${p.y}`;
    }
  }

  static time(value: any, fallback = ''): string {
    const p = this.parts(value);
    if (!p) return fallback;
    if (this.options().timeFormat === '12h') {
      const hour = Number(p.h);
      const suffix = hour >= 12 ? 'PM' : 'AM';
      const shown = hour % 12 || 12;
      return `${String(shown).padStart(2, '0')}:${p.mi} ${suffix}`;
    }
    return `${p.h}:${p.mi}`;
  }

  static dateTime(value: any): string {
    const d = this.date(value);
    const t = this.time(value);
    return d && t ? `${d} ${t}` : d || t || '';
  }

  private static parts(value: any): { y: string; mo: string; d: string; h: string; mi: string } | null {
    if (!value) return null;
    if (value instanceof Date) return this.partsFromDate(value);
    const s = String(value).trim();
    if (!s) return null;
    const wall = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?!\s*(?:Z|[+-]\d{2}:?\d{2}))/);
    if (wall) return { y: wall[1], mo: wall[2], d: wall[3], h: wall[4] || '00', mi: wall[5] || '00' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return this.partsFromDate(d);
  }

  private static partsFromDate(d: Date): { y: string; mo: string; d: string; h: string; mi: string } {
    const opts = this.options();
    const map: Record<string, string> = {};
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: opts.timeZone || DEFAULT_OPTIONS.timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d);
    for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value;
    return { y: map['year'], mo: map['month'], d: map['day'], h: map['hour'], mi: map['minute'] };
  }
}
