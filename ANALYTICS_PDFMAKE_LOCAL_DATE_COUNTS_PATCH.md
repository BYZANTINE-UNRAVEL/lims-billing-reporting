# Analytics PDF / Date / Count update

- Removed the standalone local clock field.
- Existing dates and date-times render in the PC local format.
- Analytics modal Print now creates and opens a pdfmake PDF through Electron IPC.
- Every modal shows record count and the PDF repeats total records at the top.
- Tests & Profiles show item quantity plus billed value.
- Consultants replaces Top Consultants and includes all consultants used in billing for the selected date period.
- Analytics cards, modal rows, pending reports, finished reports, items and refunds continue to use the active From/To range.
