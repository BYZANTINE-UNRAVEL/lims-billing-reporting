import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, shell } from 'electron';
import ExcelJS from 'exceljs';
import { DatabaseService } from './database.service';
import { ReportCoreService } from './report-core.service';

export class AnalyticsPdfService extends ReportCoreService {
  constructor(db: DatabaseService) { super(db); }

  private safeName(title: string) {
    return title.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'analytics';
  }

  /**
   * Adds legal wrap opportunities to long tokens (bill numbers, IDs, emails, etc.)
   * so pdfmake never pushes a cell outside the A4 content box.
   */
  private wrapPdfText(value: unknown): string {
    const text = String(value ?? '');
    return text
      .split(/(\s+)/)
      .map(part => {
        if (/^\s+$/.test(part) || part.length <= 18) return part;
        return part.replace(/(.{12})/g, '$1\u200b');
      })
      .join('');
  }

  private isNumericColumn(key: string): boolean {
    return /amount|total|paid|due|billed|value|count|tests|quantity|qty|pending|finished|discount|refund|balance/i.test(key);
  }

  private isDateColumn(key: string): boolean {
    return /date|time|created|updated|approved|cancelled|reported|collected/i.test(key);
  }

  private isWideTextColumn(key: string): boolean {
    return /name|patient|consultant|test|profile|reason|description|remarks|status/i.test(key);
  }

  /**
   * Calculates fixed pdfmake widths whose total (including table padding/borders)
   * always remains inside the A4 printable area.
   */
  private calculatePdfLayout(columns: any[], rows: any[]) {
    const count = Math.max(1, columns.length);
    const landscape = count >= 6 || columns.some((c: any) => this.isWideTextColumn(String(c?.key || '')) && count >= 5);
    const pageWidth = landscape ? 841.89 : 595.28; // A4 points
    const margins: [number, number, number, number] = landscape ? [22, 34, 22, 34] : [24, 34, 24, 34];
    const outerWidth = pageWidth - margins[0] - margins[2];

    // pdfmake adds cell padding and vertical borders outside each declared width.
    const horizontalPaddingPerColumn = count >= 9 ? 4 : count >= 7 ? 5 : 6;
    const borderAllowance = count + 1;
    const availableColumnWidth = Math.max(120, outerWidth - (horizontalPaddingPerColumn * count) - borderAllowance);

    const sampleRows = rows.slice(0, 250);
    const desired = columns.map((column: any) => {
      const key = String(column?.key || '');
      const labelLength = String(column?.label || key).length;
      const sampleMax = Math.max(labelLength, ...sampleRows.map((row: any) => String(row?.[key] ?? '').length));
      const measured = Math.min(sampleMax, 42);

      if (this.isNumericColumn(key)) return Math.max(44, Math.min(72, 35 + measured * 1.8));
      if (this.isDateColumn(key)) return Math.max(58, Math.min(92, 42 + measured * 2.0));
      if (this.isWideTextColumn(key)) return Math.max(78, Math.min(170, 46 + measured * 3.1));
      return Math.max(54, Math.min(112, 40 + measured * 2.4));
    });

    // Scale all desired widths to the exact printable width. This is deliberately
    // allowed to go below the preferred width because text wraps safely.
    const desiredTotal = desired.reduce((sum: number, width: number) => sum + width, 0) || 1;
    let widths = desired.map((width: number) => Math.max(28, (width / desiredTotal) * availableColumnWidth));
    const scaledTotal = widths.reduce((sum: number, width: number) => sum + width, 0) || 1;
    widths = widths.map((width: number) => Number((width * availableColumnWidth / scaledTotal).toFixed(2)));

    // Correct floating point drift on the final column.
    const widthTotal = widths.reduce((sum: number, width: number) => sum + width, 0);
    widths[widths.length - 1] = Number((widths[widths.length - 1] + availableColumnWidth - widthTotal).toFixed(2));

    const fontSize = count >= 10 ? 5.8 : count >= 8 ? 6.3 : count >= 6 ? 6.9 : 7.7;
    const cellPadding = horizontalPaddingPerColumn / 2;
    return { landscape, margins, widths, fontSize, cellPadding };
  }

  async createAndOpen(payload: any = {}): Promise<string> {
    const title = String(payload?.title || 'Analytics Details').trim() || 'Analytics Details';
    const subtitle = String(payload?.subtitle || '').trim();
    const generatedAt = String(payload?.generatedAt || '').trim();
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const totals = Array.isArray(payload?.totals) ? payload.totals : [];
    if (!columns.length) throw new Error('No columns are available for this analytics export.');

    const layoutInfo = this.calculatePdfLayout(columns, rows);
    const body = [
      columns.map((c: any) => ({
        text: this.wrapPdfText(c?.label || c?.key || ''),
        bold: true,
        color: '#ffffff',
        fillColor: '#334155',
        margin: [0, 1, 0, 1],
        noWrap: false
      })),
      ...rows.map((row: any) => columns.map((c: any) => ({
        text: this.wrapPdfText(row?.[c.key] ?? ''),
        margin: [0, 0.5, 0, 0.5],
        noWrap: false,
        alignment: this.isNumericColumn(String(c?.key || '')) ? 'right' : 'left'
      })))
    ];
    if (!rows.length) {
      body.push([
        { text: 'No data available for the selected period.', colSpan: columns.length, alignment: 'center', color: '#64748b', margin: [0, 14, 0, 14] },
        ...Array(Math.max(0, columns.length - 1)).fill({})
      ]);
    } else {
      const totalsByKey = new Map(totals.map((item: any) => [String(item?.key || ''), item]));
      body.push(columns.map((column: any, index: number) => {
        const total: any = totalsByKey.get(String(column?.key || ''));
        return {
          text: index === 0 ? 'TOTAL' : total ? this.wrapPdfText(total?.display ?? total?.value ?? '') : '',
          bold: true,
          fillColor: '#e2e8f0',
          color: '#0f172a',
          alignment: index === 0 ? 'left' : this.isNumericColumn(String(column?.key || '')) ? 'right' : 'left',
          margin: [0, 1, 0, 1],
          noWrap: false
        };
      }));
    }

    const summaryItems = totals.length ? totals : [{ label: 'Total Records', display: String(rows.length) }];
    const summaryCells = summaryItems.map((item: any) => ({
      stack: [
        { text: this.wrapPdfText(item?.label || ''), color: '#64748b', fontSize: Math.max(6, layoutInfo.fontSize - 1.2) },
        { text: this.wrapPdfText(item?.display ?? item?.value ?? ''), bold: true, fontSize: Math.max(7.2, layoutInfo.fontSize + 0.2), margin: [0, 1, 0, 0] }
      ],
      margin: [4, 4, 4, 4]
    }));
    const summaryColumnCount = Math.min(layoutInfo.landscape ? 4 : 3, Math.max(1, summaryCells.length));
    const summaryRows: any[] = [];
    for (let index = 0; index < summaryCells.length; index += summaryColumnCount) {
      const row = summaryCells.slice(index, index + summaryColumnCount);
      while (row.length < summaryColumnCount) row.push({ text: '' });
      summaryRows.push(row);
    }

    const doc: any = {
      pageSize: 'A4',
      pageOrientation: layoutInfo.landscape ? 'landscape' : 'portrait',
      pageMargins: layoutInfo.margins,
      defaultStyle: { font: 'Roboto', fontSize: layoutInfo.fontSize, color: '#0f172a', lineHeight: 1.08 },
      footer: (currentPage: number, pageCount: number) => ({
        columns: [
          { text: generatedAt ? `Generated: ${generatedAt}` : '', color: '#64748b', fontSize: 6.5 },
          { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', color: '#64748b', fontSize: 6.5 }
        ],
        margin: [layoutInfo.margins[0], 8, layoutInfo.margins[2], 0]
      }),
      content: [
        { text: this.wrapPdfText(title), bold: true, fontSize: 15, margin: [0, 0, 0, 3] },
        { text: this.wrapPdfText(subtitle), color: '#64748b', fontSize: 8.2, margin: [0, 0, 0, 7] },
        {
          columns: [
            { text: `Total records: ${rows.length}`, bold: true },
            { text: generatedAt ? `Generated: ${generatedAt}` : '', alignment: 'right', color: '#475569' }
          ],
          margin: [0, 0, 0, 6]
        },
        {
          table: {
            widths: Array(summaryColumnCount).fill('*'),
            body: summaryRows
          },
          layout: {
            fillColor: () => '#f8fafc',
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1',
            hLineWidth: () => 0.45,
            vLineWidth: () => 0.45,
            paddingLeft: () => 2,
            paddingRight: () => 2,
            paddingTop: () => 2,
            paddingBottom: () => 2
          },
          margin: [0, 0, 0, 8]
        },
        {
          table: { headerRows: 1, dontBreakRows: false, keepWithHeaderRows: 1, widths: layoutInfo.widths, body },
          layout: {
            hLineColor: () => '#cbd5e1',
            vLineColor: () => '#cbd5e1',
            hLineWidth: () => 0.45,
            vLineWidth: () => 0.45,
            paddingLeft: () => layoutInfo.cellPadding,
            paddingRight: () => layoutInfo.cellPadding,
            paddingTop: () => 2.2,
            paddingBottom: () => 2.2
          }
        }
      ]
    };

    const dir = path.join(app.getPath('documents'), 'LIMS Analytics');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${this.safeName(title)}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    await shell.openPath(file);
    return file;
  }

  async createExcelAndSave(payload: any = {}): Promise<{ file: string; cancelled: boolean }> {
    const title = String(payload?.title || 'Analytics Details').trim() || 'Analytics Details';
    const subtitle = String(payload?.subtitle || '').trim();
    const generatedAt = String(payload?.generatedAt || '').trim();
    const columns = Array.isArray(payload?.columns) ? payload.columns : [];
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    const totals = Array.isArray(payload?.totals) ? payload.totals : [];
    if (!columns.length) throw new Error('No columns are available for this Excel export.');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'LIMS';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(title.slice(0, 31) || 'Analytics');
    sheet.addRow([title]);
    sheet.mergeCells(1, 1, 1, Math.max(1, columns.length));
    sheet.getCell(1, 1).font = { bold: true, size: 16 };
    sheet.addRow([subtitle]);
    sheet.mergeCells(2, 1, 2, Math.max(1, columns.length));
    sheet.addRow([`Generated: ${generatedAt}`, `Records: ${rows.length}`]);
    sheet.addRow([]);
    const summaryTitleRow = sheet.addRow(['SUMMARY']);
    sheet.mergeCells(summaryTitleRow.number, 1, summaryTitleRow.number, Math.max(1, columns.length));
    summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
    for (const total of (totals.length ? totals : [{label:'Total Records',display:String(rows.length)}])) {
      const summaryRow = sheet.addRow([String(total?.label || ''), total?.display ?? total?.value ?? '']);
      summaryRow.getCell(1).font = { bold: true };
      summaryRow.getCell(2).font = { bold: true };
      summaryRow.getCell(2).alignment = { horizontal: 'right' };
    }
    sheet.addRow([]);
    const headerRowNumber = sheet.rowCount + 1;
    const header = sheet.addRow(columns.map((c: any) => String(c.label || c.key || '')));
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 24;

    for (const row of rows) {
      const worksheetRow = sheet.addRow(columns.map((c: any) => row?.[c.key] ?? ''));
      worksheetRow.alignment = { vertical: 'top', wrapText: true };
    }

    if (rows.length) {
      const totalsByKey = new Map(totals.map((item: any) => [String(item?.key || ''), item]));
      const totalRow = sheet.addRow(columns.map((column: any, index: number) => {
        const total: any = totalsByKey.get(String(column?.key || ''));
        return index === 0 ? 'TOTAL' : total ? (total?.display ?? total?.value ?? '') : '';
      }));
      totalRow.font = { bold: true };
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      totalRow.alignment = { vertical: 'middle', wrapText: true };
    }

    sheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
    columns.forEach((c: any, index: number) => {
      const key = String(c?.key || '');
      const max = Math.max(String(c.label || '').length, ...rows.slice(0, 1000).map((r: any) => String(r?.[key] ?? '').length));
      const preferred = this.isNumericColumn(key) ? 14 : this.isDateColumn(key) ? 20 : this.isWideTextColumn(key) ? 34 : 22;
      sheet.getColumn(index + 1).width = Math.min(48, Math.max(12, Math.min(max + 2, preferred)));
      sheet.getColumn(index + 1).alignment = {
        vertical: 'top',
        wrapText: true,
        horizontal: this.isNumericColumn(key) ? 'right' : 'left'
      };
    });
    sheet.autoFilter = { from: { row: headerRowNumber, column: 1 }, to: { row: headerRowNumber, column: Math.max(1, columns.length) } };

    // Generate the workbook fully first, then ask the user where it should be saved.
    const output = await workbook.xlsx.writeBuffer();
    const defaultDir = path.join(app.getPath('documents'), 'LIMS Analytics');
    fs.mkdirSync(defaultDir, { recursive: true });
    const result = await dialog.showSaveDialog({
      title: 'Save Analytics Excel',
      defaultPath: path.join(defaultDir, `${this.safeName(title)}-${Date.now()}.xlsx`),
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
      properties: ['createDirectory', 'showOverwriteConfirmation']
    });
    if (result.canceled || !result.filePath) return { file: '', cancelled: true };

    fs.writeFileSync(result.filePath, output as any);
    return { file: result.filePath, cancelled: false };
  }
}
