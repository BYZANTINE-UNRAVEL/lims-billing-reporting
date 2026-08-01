# Flattened Multiply background

Only the report path with **With Background** enabled is changed.

Pipeline:
1. pdfMake generates the report page without the letterhead image.
2. Each page is rendered at 300 DPI.
3. The configured full-page background is drawn first.
4. The report page is composited with canvas `multiply`.
5. The flattened pages are written into the final PDF.

Normal reports, report settings, margins, widths, ordering, fonts, colors, page breaks and database logic are unchanged.

Install dependencies once after extracting:

```bash
npm install
```

If raster composition fails on a machine, report generation automatically falls back to the existing normal pdfMake background output instead of blocking printing.
