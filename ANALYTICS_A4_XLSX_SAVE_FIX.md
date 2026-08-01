# Analytics A4 PDF and XLSX Save Fix

- All Analytics PDF exports use A4 only.
- Orientation is selected automatically from the column set.
- Column widths are calculated from labels, sample data, and semantic column type.
- Declared widths reserve space for pdfmake padding and borders, preventing margin overflow.
- Long unbroken values receive safe wrapping opportunities.
- Table headers repeat on every PDF page.
- XLSX is generated in memory first, then Electron opens a Save As dialog.
- The user chooses the XLSX filename and destination folder.
- Cancelling Save As returns cleanly without creating or opening a file.
