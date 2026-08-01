# Billing & Statements table UI update

Changed only `src/app/features/statements/statements-page.component.ts`.

- Fixed widths are defined through `<colgroup>` and `table-layout: fixed`.
- Long values are clipped with ellipsis.
- Angular Material tooltips show the complete value on hover.
- All row operations are consolidated into one Angular Material `Actions` menu.
- Existing handlers and disabled rules are unchanged.
- Statement Print PDF, PDF download, Excel export, filters and pagination are unchanged.

The current Billing screen does not contain a separate bill-register table; the shared bill register is the Billing & Statements component updated here.
