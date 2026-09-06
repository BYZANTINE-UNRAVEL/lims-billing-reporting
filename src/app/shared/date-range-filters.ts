/** Shared Analytics-style from/to date range helpers for queue/filter bars. */
export type DateRangeValue = { from: string; to: string };

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function openNativeDatePicker(event: Event): void {
  const input = event.currentTarget as HTMLInputElement | null;
  if (!input || input.disabled) return;
  try {
    const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
    if (typeof picker === 'function') picker.call(input);
  } catch {
    input.focus();
  }
}

export function dateRangePresets() {
  const today = new Date();
  const previous = new Date(today);
  previous.setDate(today.getDate() - 1);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
  const lastYearEnd = new Date(today.getFullYear() - 1, 11, 31);
  const thirtyStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  return {
    today: { from: isoDate(today), to: isoDate(today) },
    previousDay: { from: isoDate(previous), to: isoDate(previous) },
    currentMonth: { from: isoDate(monthStart), to: isoDate(today) },
    lastMonth: { from: isoDate(lastMonthStart), to: isoDate(lastMonthEnd) },
    thirtyDays: { from: isoDate(thirtyStart), to: isoDate(today) },
    currentYear: { from: isoDate(yearStart), to: isoDate(today) },
    lastYear: { from: isoDate(lastYearStart), to: isoDate(lastYearEnd) },
  } as const;
}

export function matchesDateRange(from: string, to: string, range: DateRangeValue): boolean {
  return from === range.from && to === range.to;
}

const CAL_ICON_DARK = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23f8fafc' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")`;
const CAL_ICON_LIGHT = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%230f172a' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2' ry='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")`;

/** Shared CSS for Analytics-style date filter bars (paste into component styles).
 * Calendar icon matches Analytics in both dark and light. Uses background-color (not
 * background shorthand) so later `input { background: ... }` rules cannot wipe the icon. */
export const DATE_RANGE_FILTER_STYLES = `
.date-range-filters{display:flex;align-items:center;justify-content:flex-start;gap:8px;flex-wrap:wrap;width:100%;margin:0}
.date-range-filters .date-field{display:block}
.date-range-filters .range-arrow{color:var(--muted);font-weight:900}
.date-range-filters input[type="date"],.date-range-filters button{height:36px;border:1px solid var(--border);border-radius:12px;background-color:var(--input);color:var(--text);padding:0 12px;font-weight:850;outline:none}
.date-range-filters input[type="date"]:focus,.date-range-filters button:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.date-range-filters button{cursor:pointer;background:var(--input)}
.date-range-filters button.active{background:var(--accent-gradient);border-color:transparent;color:#fff;box-shadow:var(--glow)}
.date-range-filters .icon-btn{font-size:18px;min-width:40px}
.date-range-filters input[type="date"]{width:220px;min-width:220px;box-sizing:border-box;appearance:none;-webkit-appearance:none;color:#f8fafc!important;background-color:color-mix(in srgb,var(--input) 92%,var(--panel))!important;background-image:${CAL_ICON_DARK}!important;background-repeat:no-repeat!important;background-position:right 14px center!important;background-size:18px 18px!important;font-weight:850;letter-spacing:.01em;color-scheme:dark;padding-right:46px!important;cursor:pointer}
.date-range-filters input[type="date"]::-webkit-datetime-edit,.date-range-filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,.date-range-filters input[type="date"]::-webkit-datetime-edit-text,.date-range-filters input[type="date"]::-webkit-datetime-edit-month-field,.date-range-filters input[type="date"]::-webkit-datetime-edit-day-field,.date-range-filters input[type="date"]::-webkit-datetime-edit-year-field{color:#f8fafc!important}
.date-range-filters input[type="date"]::-webkit-calendar-picker-indicator{opacity:0!important;cursor:pointer;width:42px;height:100%;margin-right:-8px}
:host-context(.light) .date-range-filters input[type="date"],:host-context(.light-mode) .date-range-filters input[type="date"],:host-context(body.light) .date-range-filters input[type="date"]{background-color:#fff!important;color:#0f172a!important;color-scheme:light;background-image:${CAL_ICON_LIGHT}!important}
:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit,:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit-text,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(.light-mode) .date-range-filters input[type="date"]::-webkit-datetime-edit-year-field,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-fields-wrapper,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-text,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-month-field,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-day-field,:host-context(body.light) .date-range-filters input[type="date"]::-webkit-datetime-edit-year-field{color:#0f172a!important}
`;
