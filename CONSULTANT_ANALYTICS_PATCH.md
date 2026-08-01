# Consultant and Analytics Patch

## Consultant Master
- Added Delete/Archive action beside Edit.
- Unused consultants are permanently deleted with commission profiles/rules.
- Consultants referenced by bills are archived (`active = 0`) to preserve historical billing records.
- Added active/archived status display and audit entries.

## Analytics
- Added a separate Analytics sidebar menu.
- Added date filters and quick ranges.
- Added billing KPIs, daily revenue, payment-mode totals, bill status, consultant performance, and outstanding ageing.
- Uses existing billing and consultant records; no duplicate analytics storage was added.

## Scope
- Billing and Statement screens were not modified.
