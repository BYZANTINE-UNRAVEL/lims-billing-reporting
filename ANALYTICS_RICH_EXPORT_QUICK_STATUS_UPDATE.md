# Analytics rich modal, export and Quick Reporting update

- Trend panels now use bar charts.
- Added Cancelled Bills card and detailed view.
- Pending/Finished report analytics now read the same Quick Reporting queue returned by `reports:list` and use the selected Analytics date range.
- Added modal search, status/consultant/payment filters, clear filters, sortable columns, status badges and filtered pagination.
- PDF and XLSX exports use all currently filtered modal rows.
- Added rich export loading overlay for PDF/XLSX generation.
- PDF output automatically uses portrait/landscape, wrapped cells, calculated widths, repeated headers and multiple pages without right-side overflow.
- XLSX output includes frozen headers, AutoFilter, wrapped columns and all filtered rows.
- Added Electron IPC/preload/API wiring for Analytics XLSX export.
