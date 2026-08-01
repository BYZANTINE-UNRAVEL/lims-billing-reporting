# Analytics KPI hover and date-filter update

- Left-aligned Analytics date/filter toolbar.
- Increased date input width so the full year remains visible.
- Added Last Month, Current Year, and Last Year filters.
- Added active-state detection for all quick filters.
- Added `trackBy` for KPI cards so Angular does not recreate the card DOM on every change-detection cycle.
- Kept the KPI lift animation while preventing repeated animation restarts.
- Lower insight/chart cards were not changed.
