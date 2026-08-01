# Analytics Modal Pagination Patch

- Added fixed-footer pagination to every Analytics detail modal.
- Default page size: 25 records.
- Page-size choices: 10, 25, 50, 100.
- The footer shows the current visible range and total record count.
- Previous, numbered page, and next controls remain visible while the table body scrolls.
- Only the active page rows are rendered in the modal table.
- Print PDF continues to use every filtered record and pdfmake paginates the document automatically.
- Mobile layout wraps the paginator, count, Print PDF, and Close controls without covering table content.
