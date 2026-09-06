import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
const PdfPrinter = require('pdfmake');
type ReportAlignment = 'left' | 'center' | 'right';
import { BrowserWindow, shell } from 'electron';
import { ReportCoreService } from './report-core.service';

export abstract class ReportLayoutService extends ReportCoreService {
  protected abstract safeText(value: any, fallback?: string): string;
  protected abstract fmtDate(value: any): string;
  protected abstract fmtDateOnly(value: any): string;
  protected abstract arrowStyleForReport(flag: string): string;

  protected reportRepeatAllowed(mode: any, currentPage: number, pageCount: number): boolean {
    const m = String(mode || 'every-page');
    if (m === 'every-page') return true;
    if (m === 'first-page-only') return currentPage === 1;
    if (m === 'last-page-only') return currentPage === pageCount;
    if (m === 'continuation-pages-only') return currentPage > 1;
    if (m === 'never') return false;
    return true;
  }

  protected reportBackground(withBackground?: boolean) {
    const oldBackgroundOn = this.org().background;
    const enabled = withBackground === true && (this.reportBool('report.simple.backgroundEnabled', oldBackgroundOn) || this.reportBool('report.simple.watermarkTextEnabled', false));
    if (!enabled) return undefined;
    const imagePath = this.safeImagePath(this.reportSetting('report.simple.backgroundImagePath', ''));
    const backgroundColorEnabled = this.reportBool('report.simple.backgroundColorEnabled', false);
    const backgroundColor = this.reportColor('report.simple.backgroundColor', '#ffffff');
    const watermarkEnabled = this.reportBool('report.simple.watermarkTextEnabled', false);
    const watermarkText = this.reportSetting('report.simple.watermarkText', '');
    const opacity = this.reportNumber('report.simple.watermarkOpacity', 0.08, 0.01, 1);
    return (_currentPage: number, pageSize: any) => {
      const stack: any[] = [];
      if (backgroundColorEnabled) stack.push({ canvas: [{ type: 'rect', x: 0, y: 0, w: pageSize.width, h: pageSize.height, color: backgroundColor }] });
      if (imagePath) {
        const area = String(this.reportSetting('report.simple.backgroundImageArea', 'full_page')) === 'body_watermark' ? 'body_watermark' : 'full_page';
        const fit = String(this.reportSetting('report.simple.backgroundImageFit', 'cover'));
        const imageOpacity = this.reportNumber('report.simple.backgroundImageOpacity', area === 'body_watermark' ? 0.08 : 1, 0.01, 1);
        const offsetX = this.mmToPt(this.reportNumber('report.simple.backgroundImageOffsetXMm', 0, -100, 100));
        const offsetY = this.mmToPt(this.reportNumber('report.simple.backgroundImageOffsetYMm', 0, -100, 100));
        if (area === 'body_watermark') {
          const left = this.mmToPt(this.reportNumber('report.simple.marginLeftMm', 8.8, 0, 100));
          const right = this.mmToPt(this.reportNumber('report.simple.marginRightMm', 5.3, 0, 100));
          const header = this.mmToPt(this.reportNumber('report.simple.headerFixedHeightMm', 45, 0, 120));
          const footer = this.mmToPt(this.reportNumber('report.simple.footerFixedHeightMm', 18.8, 0, 80));
          const contentWidth = Math.max(80, pageSize.width - left - right);
          const bodyTop = header;
          const bodyHeight = Math.max(120, pageSize.height - header - footer);
          const watermarkWidth = contentWidth * this.reportNumber('report.simple.backgroundImageWatermarkWidthPct', 62, 10, 100) / 100;
          stack.push({ image: imagePath, width: watermarkWidth, opacity: imageOpacity, absolutePosition: { x: left + (contentWidth - watermarkWidth) / 2 + offsetX, y: bodyTop + bodyHeight / 2 - watermarkWidth * 0.28 + offsetY } });
        } else {
          const block: any = { image: imagePath, absolutePosition: { x: offsetX, y: offsetY }, opacity: imageOpacity };
          if (fit === 'contain') block.fit = [pageSize.width, pageSize.height];
          else { block.width = pageSize.width; block.height = pageSize.height; }
          stack.push(block);
        }
      }
      if (watermarkEnabled && watermarkText.trim()) {
        stack.push({ text: watermarkText, color: this.reportColor('report.simple.watermarkColor', '#777777'), opacity, bold: true, fontSize: this.reportNumber('report.simple.watermarkFontSize', 58, 10, 200), alignment: 'center', absolutePosition: { x: 0, y: pageSize.height / 2 - 60 } });
      }
      return stack.length ? { stack } : undefined;
    };
  }

  protected patientLabelOverrides(): Record<string, string> {
    const raw = this.reportSetting('report.simple.patientDetailsLabelsJson', '');
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  protected patientFieldLabel(field: string): string {
    const overrides = this.patientLabelOverrides();
    if (overrides[field]) return String(overrides[field]);
    const map: Record<string, string> = {
      patient_name: 'Patient Name', patient_no: 'Patient ID', age_gender: 'Age / Gender', age: 'Age', gender: 'Gender',
      mobile: 'Mobile', address: 'Address', consultant: 'Referred By', collected: 'Collected On', reported: 'Reported On', billed_date: 'Billed Date', mrn: 'MRN', bill_no: 'Bill No', report_no: 'Report No', sample_type: 'Specimen', specimen: 'Specimen'
    };
    return map[field] || field.replace(/_/g, ' ').replace(/\b\w/g, x => x.toUpperCase());
  }

  protected formatPatientNameForReport(row: any): string {
    const title = this.safeText(row?.patient_title || row?.title || row?.honorific, '');
    const name = this.safeText(row?.patient_name || row?.name, '');
    return [title, name].filter(Boolean).join(' ') || name || '-';
  }

  /** Prefer stored/split age; never show "0 years" when months/days or DOB say otherwise. */
  protected formatAgeForDisplay(patient: any): string {
    const stored = this.safeText(patient?.age, '');
    const split = patient?.age_split === true || patient?.age_split === 1 || patient?.age_split === '1' || patient?.age_split === 'true';
    const unitLabel = (unit: string, value: number) => {
      const u = unit === 'DAYS' ? 'day' : unit === 'MONTHS' ? 'month' : unit === 'WEEKS' ? 'week' : 'year';
      return `${u}${Number(value) === 1 ? '' : 's'}`;
    };
    if (stored && /month|day|week/i.test(stored)) return stored;

    if (split) {
      let years = patient?.age_years;
      let months = patient?.age_months;
      let days = patient?.age_days;
      const emptyParts = [years, months, days].every(v => v === undefined || v === null || v === '');
      if ((emptyParts || (Number(years || 0) === 0 && Number(months || 0) === 0 && Number(days || 0) === 0)) && patient?.dob) {
        const dob = new Date(String(patient.dob).slice(0, 10) + 'T00:00:00');
        const today = new Date();
        if (!Number.isNaN(dob.getTime()) && dob <= today) {
          let y = today.getFullYear() - dob.getFullYear();
          let m = today.getMonth() - dob.getMonth();
          let d = today.getDate() - dob.getDate();
          if (d < 0) { m--; d += new Date(today.getFullYear(), today.getMonth(), 0).getDate(); }
          if (m < 0) { y--; m += 12; }
          years = Math.max(0, y); months = Math.max(0, m); days = Math.max(0, d);
        }
      }
      if (years === undefined || years === null || years === '') years = patient?.age_value;
      years = Number(years || 0) || 0;
      months = Math.min(11, Math.max(0, Number(months || 0) || 0));
      days = Math.min(31, Math.max(0, Number(days || 0) || 0));
      const bits: string[] = [];
      if (years > 0) bits.push(`${years} ${unitLabel('YEARS', years)}`);
      if (months > 0) bits.push(`${months} ${unitLabel('MONTHS', months)}`);
      if (days > 0) bits.push(`${days} ${unitLabel('DAYS', days)}`);
      if (bits.length) return bits.join(' ');
      if (stored && !/^0\s*years?$/i.test(stored)) return stored;
      return `0 ${unitLabel('YEARS', 0)}`;
    }

    const unit = this.safeText(patient?.age_unit, '').toUpperCase();
    const value = patient?.age_value === undefined || patient?.age_value === null || patient?.age_value === ''
      ? ''
      : String(patient.age_value).trim();
    if (value !== '' && Number.isFinite(Number(value))) {
      const n = Number(value);
      if (n === 0 && stored && !/^0\s*years?$/i.test(stored)) return stored;
      return `${value} ${unitLabel(unit || 'YEARS', n)}`;
    }
    return stored || '';
  }

  protected safeReportFilePart(value: any, fallback = 'NA', maxLen = 48): string {
    const text = String(value ?? '').trim() || fallback;
    const cleaned = text
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '')
      .slice(0, maxLen);
    return cleaned || fallback;
  }

  protected buildReportPdfFileName(report: any, computed: any): string {
    const patientName = this.safeReportFilePart(computed?.patientName || report?.patient_name || report?.name || 'Patient', 'Patient', 60);
    const age = this.safeReportFilePart(this.formatAgeForDisplay(report) || report?.age || report?.patient_age || 'AgeNA', 'AgeNA', 22);
    const gender = this.safeReportFilePart(report?.gender || report?.patient_gender || 'GenderNA', 'GenderNA', 18);
    const billNo = this.safeReportFilePart(report?.bill_no || report?.billNo || report?.report_no || report?.id, 'BillNA', 36);
    const patientId = this.safeReportFilePart(report?.patient_no || report?.patient_id || report?.uhid || report?.patientId || report?.id, 'PatientIDNA', 36);
    return `${patientName}_${age}_${gender}_Bill-${billNo}_PID-${patientId}.pdf`;
  }

  protected cleanupLegacyTimestampedReportPdfs(dir: string, report: any): void {
    try {
      const keys = [report?.bill_no, report?.report_no, report?.id].map((x:any) => String(x ?? '').trim()).filter(Boolean);
      if (!keys.length) return;
      const safeKeys = new Set(keys.map(k => this.safeReportFilePart(k, '', 80)).filter(Boolean));
      for (const fileName of fs.readdirSync(dir)) {
        if (!/^report-.+-\d{10,}\.pdf$/i.test(fileName)) continue;
        for (const key of safeKeys) {
          if (fileName.startsWith(`report-${key}-`)) {
            try { fs.unlinkSync(path.join(dir, fileName)); } catch {}
            break;
          }
        }
      }
    } catch {}
  }

  protected splitSpecimenValues(value: any): string[] {
    const raw = String(value ?? '').trim();
    if (!raw || raw === '-') return [];
    return raw
      .split(/\s*(?:\/|,|\||;|\n|\r)+\s*/g)
      .map(x => x.trim())
      .filter(x => !!x && x !== '-');
  }

  /** Collection timing labels must never print as specimen under the test name. */
  protected isCollectionTypeLabel(value: any): boolean {
    const t = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    return [
      'random', 'fasting', 'post-prandial', 'post prandial', 'timed', 'other',
      'collection', 'unspecified', 'multiple collection types', 'collection type not set'
    ].includes(t);
  }

  protected isGenericSpecimenPlaceholder(value: any): boolean {
    return String(value ?? '').trim().toLowerCase() === 'specimen';
  }

  protected joinUniqueSpecimens(values: any[]): string {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
      for (const text of this.splitSpecimenValues(value)) {
        if (this.isCollectionTypeLabel(text) || this.isGenericSpecimenPlaceholder(text)) continue;
        const key = text.toLowerCase();
        if (!seen.has(key)) { seen.add(key); out.push(text); }
      }
    }
    return out.join(' / ');
  }

  protected mappedSpecimensForTest(testId: any): string {
    const id = Number(testId || 0);
    if (!id) return '';
    try {
      const rows = ((this.db as any).db?.prepare(`SELECT s.name
        FROM test_specimen_mappings m
        JOIN specimen_types s ON s.id=m.specimen_type_id
        WHERE m.test_id=? AND COALESCE(s.is_active,1)=1
        ORDER BY COALESCE(m.display_order,1000), s.name`).all(id) || []) as any[];
      return this.joinUniqueSpecimens(rows.map(r => r.name));
    } catch { return ''; }
  }

  protected reportItemCollectionText(item: any): string {
    const fromCollection = String(item?.collection_type || '').trim();
    if (fromCollection && !this.isGenericSpecimenPlaceholder(fromCollection)) return fromCollection;
    const fromSample = String(item?.sample_type || '').trim();
    if (fromSample && this.isCollectionTypeLabel(fromSample)) return fromSample;
    return '';
  }

  protected reportItemSpecimenText(item: any): string {
    if (!item?.test_id) return '';
    // Real specimen names only. Collection type is optional via report.simple.collectionVisible.
    const primary = this.joinUniqueSpecimens([
      item.mapped_specimen_names,
      item.specimen_names,
      this.mappedSpecimensForTest(item.test_id),
      item.specimen_name
    ]);
    let specimen = primary;
    if (!specimen) {
      const fallback = String(item.sample_type || item.specimen || '').trim();
      if (fallback
        && !this.isCollectionTypeLabel(fallback)
        && !this.isGenericSpecimenPlaceholder(fallback)
        && String(item.collection_type || '').trim().toLowerCase() !== fallback.toLowerCase()) {
        specimen = fallback;
      }
    }
    const showCollection = this.reportBool('report.simple.collectionVisible', false);
    if (!showCollection) return specimen;
    const collection = this.reportItemCollectionText(item);
    if (!collection) return specimen;
    if (!specimen) return collection;
    if (specimen.toLowerCase().split(/\s*\/\s*/).includes(collection.toLowerCase())) return specimen;
    return `${specimen} / ${collection}`;
  }

  protected uniqueJoinedSpecimens(items: any[], fallbackRow?: any): string {
    const values: any[] = [];
    for (const item of (Array.isArray(items) ? items : [])) {
      if (!item?.test_id) continue;
      values.push(this.reportItemSpecimenText(item));
    }
    values.push(
      fallbackRow?.mapped_specimen_names,
      fallbackRow?.specimen_names,
      fallbackRow?.specimen_name,
      this.isCollectionTypeLabel(fallbackRow?.sample_type) ? '' : fallbackRow?.sample_type,
      this.isGenericSpecimenPlaceholder(fallbackRow?.specimen) || this.isCollectionTypeLabel(fallbackRow?.specimen) ? '' : fallbackRow?.specimen
    );
    return this.joinUniqueSpecimens(values);
  }

  protected fmtPatientBlockDate(value: any, kind: 'billed'|'collected'|'reported'): string {
    if (!value) return '-';
    const showTime = kind === 'billed'
      ? this.reportBool('report.simple.patientDetailsShowTimeBilled', false)
      : kind === 'collected'
        ? this.reportBool('report.simple.patientDetailsShowTimeCollected', false)
        : this.reportBool('report.simple.patientDetailsShowTimeReported', false);
    return showTime ? this.fmtDate(value) : this.fmtDateOnly(value);
  }

  protected patientFieldValue(r: any, field: string, computed: any): string {
    const specimen = this.safeText(computed.specimenSummary || r.sample_type || r.specimen_name || r.sample_id, '');
    const map: Record<string, string> = {
      patient_name: this.formatPatientNameForReport(r), patient_no: this.safeText(r.patient_no, ''),
      age_gender: computed.ageGender, age: this.formatAgeForDisplay(r) || this.safeText(r.age, ''), gender: this.safeText(r.gender, ''), mobile: this.safeText(r.mobile || r.patient_mobile, ''), address: this.safeText(r.address || r.patient_address, ''),
      consultant: computed.consultant, collected: computed.collectedOn, reported: computed.reportedOn, billed_date: this.fmtPatientBlockDate(r.bill_date || r.created_at, 'billed'), mrn: this.safeText(r.mrn || r.uhId || r.uh_id || r.patient_mrn, ''),
      bill_no: this.safeText(r.bill_no, ''), report_no: this.safeText(r.report_no, ''), sample_type: specimen, specimen
    };
    return this.applyPatientValueCase(map[field] ?? this.safeText(r?.[field], ''));
  }

  protected applyPatientValueCase(value: any): string {
    const text = String(value ?? '');
    const trimmed = text.trim();
    if (!trimmed || trimmed === '-') return text;
    const mode = String(this.reportSetting('report.simple.patientDetailsValueCase', 'as_entered') || 'as_entered').trim().toLowerCase();
    if (mode === 'upper' || mode === 'uppercase') return text.toUpperCase();
    if (mode === 'lower' || mode === 'lowercase') return text.toLowerCase();
    if (mode === 'title' || mode === 'titlecase' || mode === 'title_case') {
      return text.replace(/\S+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
    }
    return text;
  }

  protected buildCode39Barcode(value: string) {
    const text = String(value || '').toUpperCase().replace(/[^0-9A-Z .\-$/+%]/g, '');
    if (!text) return null;
    const enc = `*${text}*`;
    const patterns: Record<string, string> = {
      '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn','A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn','K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn','U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','*':'nwnnwnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn'
    };
    const x = this.mmToPt(this.reportNumber('report.simple.patientBarcodeXMm', 150, 0, 300), 425);
    const y = this.mmToPt(this.reportNumber('report.simple.patientBarcodeYMm', 42, 0, 400), 119);
    const totalW = this.mmToPt(this.reportNumber('report.simple.patientBarcodeWidthMm', 42, 5, 200), 119);
    const h = this.mmToPt(this.reportNumber('report.simple.patientBarcodeHeightMm', 10, 3, 80), 28);
    let units = 0;
    for (const ch of enc) units += [...(patterns[ch] || '')].reduce((a,b)=>a+(b==='w'?3:1), 0) + 1;
    const narrow = totalW / Math.max(1, units);
    let cursor = 0;
    const canvas:any[] = [];
    for (const ch of enc) {
      const pat = patterns[ch] || '';
      for (let i=0;i<pat.length;i++) {
        const w = narrow * (pat[i] === 'w' ? 3 : 1);
        if (i % 2 === 0) canvas.push({ type:'rect', x:cursor, y:0, w, h, color:'#111111' });
        cursor += w;
      }
      cursor += narrow;
    }
    const stack:any[] = [{ canvas }];
    if (this.reportBool('report.simple.patientBarcodeTextEnabled', true)) stack.push({ text, fontSize:7, alignment:'center', margin:[0,1,0,0] });
    return { stack, width: totalW, absolutePosition:{ x, y } };
  }

  protected patientFieldStyleOverrides(): Record<string, any> {
    const raw = this.reportSetting('report.simple.patientDetailsFieldStylesJson', '{}');
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  protected mergePatientStyle(base: any, override: any): any {
    if (!override || typeof override !== 'object') return base;
    const out = { ...base };
    if (override.fontSize !== undefined && Number.isFinite(Number(override.fontSize))) out.fontSize = Number(override.fontSize);
    if (override.bold !== undefined) out.bold = !!override.bold;
    if (override.italic !== undefined) out.italics = !!override.italic;
    if (override.italics !== undefined) out.italics = !!override.italics;
    if (override.underline !== undefined) out.decoration = override.underline ? 'underline' : undefined;
    if (override.color && /^#[0-9a-fA-F]{6}$/.test(String(override.color))) out.color = String(override.color);
    if (override.alignment) out.alignment = String(override.alignment);
    return out;
  }

  protected buildReportPatientBlock(r: any, computed: any, location: 'header'|'body' = 'header') {
    if (!this.reportBool('report.simple.patientDetailsEnabled', true)) return [];
    const placement = String(this.reportSetting('report.simple.patientDetailsPlacement', 'header'));
    if (location === 'header' && placement !== 'header') return [];
    if (location === 'body' && placement === 'header') return [];
    const fields = String(this.reportSetting('report.simple.patientDetailsFields', 'patient_name,age,gender,consultant,collected,reported,mrn,specimen'))
      .split(',').map(x => x.trim()).filter(Boolean);
    const showLabels = this.reportBool('report.simple.patientDetailsShowLabels', true);
    const columns = Math.max(1, Math.min(3, this.reportNumber('report.simple.patientDetailsColumns', 2, 1, 3)));
    const colon = this.reportSetting('report.simple.patientDetailsColonText', ':');
    const labelStyle = this.reportStyle('patientLabelStyle', { fontSize: 10, bold: true, color: '#111111' });
    const valueStyle = this.reportStyle('patientValueStyle', { fontSize: 10, color: '#111111' });
    const styleOverrides = this.patientFieldStyleOverrides();
    const rows = fields.map(field => {
      const value = this.patientFieldValue(r, field, computed);
      if (!String(value || '').trim()) return null;
      const override = styleOverrides[field] || {};
      return {
        field,
        label: showLabels ? this.patientFieldLabel(field) : '',
        value: showLabels ? `${colon} ${value}`.trim() : String(value || ''),
        labelStyle: this.mergePatientStyle(labelStyle, override.label),
        valueStyle: this.mergePatientStyle(valueStyle, override.value)
      };
    }).filter(Boolean) as any[];
    if (!rows.length) return [];
    const bg = this.reportColor('report.simple.patientDetailsBgColor', '#ffffff');
    const pct = (key: string, fallback: number) => Math.max(0, Math.min(100, this.reportNumber(key, fallback, 0, 100)));
    const firstLabelPct = pct('report.simple.patientFirstLabelWidthPct', 16);
    const firstValuePct = pct('report.simple.patientFirstValueWidthPct', 28);
    const gapPct = pct('report.simple.patientColumnGapWidthPct', 14);
    const secondLabelPct = pct('report.simple.patientSecondLabelWidthPct', 18);
    const secondValuePct = pct('report.simple.patientSecondValueWidthPct', 24);
    const totalPct = Math.max(1, firstLabelPct + firstValuePct + gapPct + secondLabelPct + secondValuePct);
    const pctWidth = (n: number) => `${(n * 100 / totalPct).toFixed(3)}%`;
    const tableRows: any[] = [];
    const widths: any[] = [];
    if (columns >= 2) {
      widths.push(pctWidth(firstLabelPct), pctWidth(firstValuePct), pctWidth(gapPct), pctWidth(secondLabelPct), pctWidth(secondValuePct));
      for (let i = 0; i < rows.length; i += 2) {
        const left = rows[i];
        const right = rows[i + 1];
        tableRows.push([
          { text: left?.label || '', ...(left?.labelStyle || labelStyle), noWrap: true, fillColor:bg, margin: [0, 2, 2, 2] },
          { text: left?.value || '', ...(left?.valueStyle || valueStyle), fillColor:bg, margin: [2, 2, 2, 2] },
          { text: '', fillColor:bg, margin: [0, 2, 0, 2] },
          { text: right?.label || '', ...(right?.labelStyle || labelStyle), noWrap: true, fillColor:bg, margin: [0, 2, 2, 2] },
          { text: right?.value || '', ...(right?.valueStyle || valueStyle), fillColor:bg, margin: [2, 2, 2, 2] }
        ]);
      }
    } else {
      const labelPct = Math.max(1, firstLabelPct || 25);
      const valuePct = Math.max(1, 100 - labelPct);
      widths.push(`${labelPct.toFixed(3)}%`, `${valuePct.toFixed(3)}%`);
      for (const row of rows) {
        tableRows.push([
          { text: row?.label || '', ...(row?.labelStyle || labelStyle), noWrap: true, fillColor:bg, margin: [0, 2, 2, 2] },
          { text: row?.value || '', ...(row?.valueStyle || valueStyle), fillColor:bg, margin: [2, 2, 2, 2] }
        ]);
      }
    }
    const outside = this.reportBool('report.simple.patientDetailsOutsideBorder', this.reportBool('report.simple.patientDetailsBorderEnabled', false));
    const topBorder = this.reportBool('report.simple.patientDetailsTopBorder', true);
    const bottomBorder = this.reportBool('report.simple.patientDetailsBottomBorder', true);
    const leftBorder = this.reportBool('report.simple.patientDetailsLeftBorder', true);
    const rightBorder = this.reportBool('report.simple.patientDetailsRightBorder', true);
    const inner = this.reportBool('report.simple.patientDetailsInnerBorder', false);
    const innerH = this.reportBool('report.simple.patientDetailsInnerHBorder', inner);
    const innerV = this.reportBool('report.simple.patientDetailsInnerVBorder', inner);
    const lineColor = this.reportColor('report.simple.patientDetailsBorderColor', '#cccccc');
    const lineWidth = this.reportNumber('report.simple.patientDetailsBorderWidth', 0.4, 0, 5);
    const tablePadLeft = this.reportNumber('report.simple.patientTablePaddingLeftMm', this.reportNumber('report.simple.patientDetailsPaddingLeftMm', 0, 0, 50), 0, 50);
    const tablePadRight = this.reportNumber('report.simple.patientTablePaddingRightMm', this.reportNumber('report.simple.patientDetailsPaddingRightMm', 0, 0, 50), 0, 50);
    const tablePadTop = this.reportNumber('report.simple.patientTablePaddingTopMm', this.reportNumber('report.simple.patientDetailsPaddingTopMm', 0, 0, 50), 0, 50);
    const tablePadBottom = this.reportNumber('report.simple.patientTablePaddingBottomMm', this.reportNumber('report.simple.patientDetailsPaddingBottomMm', 0, 0, 50), 0, 50);
    const innerPadLeft = this.mmToPt(this.reportNumber('report.simple.patientTableInnerPaddingLeftMm', 0, 0, 50), 0);
    const innerPadRight = this.mmToPt(this.reportNumber('report.simple.patientTableInnerPaddingRightMm', 0, 0, 50), 0);
    const innerPadTop = this.mmToPt(this.reportNumber('report.simple.patientTableInnerPaddingTopMm', 0, 0, 50), 0);
    const innerPadBottom = this.mmToPt(this.reportNumber('report.simple.patientTableInnerPaddingBottomMm', 0, 0, 50), 0);
    const offsetLeftPt = this.mmToPt(this.reportNumber('report.simple.patientDetailsOffsetXMm', 0, -100, 100), 0);
    const offsetTopPt = this.mmToPt(this.reportNumber('report.simple.patientDetailsOffsetYMm', 0, -100, 100), 0);
    const blockMargin: [number, number, number, number] = [
      this.mmToPt(this.reportNumber('report.simple.patientDetailsMarginLeftMm', 0, 0, 100), 0) + offsetLeftPt,
      this.mmToPt(this.reportNumber('report.simple.patientDetailsMarginTopMm', 0, 0, 100), 0) + offsetTopPt,
      this.mmToPt(this.reportNumber('report.simple.patientDetailsMarginRightMm', 0, 0, 100), 0) - offsetLeftPt,
      this.mmToPt(this.reportNumber('report.simple.patientDetailsMarginBottomMm', 4, 0, 100), 12)
    ];
    const patientContentTable = {
      table: { widths, body: tableRows },
      layout: {
        hLineWidth: (i:number, node:any) => (innerH && i > 0 && i < node.table.body.length) ? lineWidth : 0,
        vLineWidth: (i:number, node:any) => (innerV && i > 0 && i < node.table.widths.length) ? lineWidth : 0,
        hLineColor: () => lineColor, vLineColor: () => lineColor,
        paddingLeft: () => this.mmToPt(tablePadLeft, 0),
        paddingRight: () => this.mmToPt(tablePadRight, 0),
        paddingTop: () => this.mmToPt(tablePadTop, 0),
        paddingBottom: () => this.mmToPt(tablePadBottom, 0)
      }
    };
    const patientOuterTable = {
      table: { widths: ['*'], body: [[{ stack: [patientContentTable], fillColor: bg }]] },
      layout: {
        hLineWidth: (i:number, node:any) => (outside && ((i === 0 && topBorder) || (i === node.table.body.length && bottomBorder))) ? lineWidth : 0,
        vLineWidth: (i:number, node:any) => (outside && ((i === 0 && leftBorder) || (i === node.table.widths.length && rightBorder))) ? lineWidth : 0,
        hLineColor: () => lineColor, vLineColor: () => lineColor,
        paddingLeft: () => innerPadLeft,
        paddingRight: () => innerPadRight,
        paddingTop: () => innerPadTop,
        paddingBottom: () => innerPadBottom
      }
    };
    return [{ margin: blockMargin, stack: [patientOuterTable] }];
  }

  protected buildReportHeaderBlock(r: any, computed: any) {
    const org = this.org();
    const title = this.reportSetting('report.simple.institutionName', org.name || '');
    const subText = this.reportSetting('report.simple.institutionSubText', '');
    const addressText = this.reportSetting('report.simple.addressText', org.address || '96 C/1, Subramaniyar Kovil Street, (AJ Nagar)\n Adiramapattinam - 614 701');
    const phoneEmail = [org.phone, org.email].filter(Boolean).join('    Email: ');
    const logoPath = this.reportBool('report.simple.headerLogoEnabled', false) ? this.safeImagePath(this.reportSetting('report.simple.headerLogoPath', '')) : '';
    const titleStyle = this.reportStyle('institutionNameStyle', { fontSize: 15, bold: true, alignment: 'center', color: '#1756AD' });
    const subStyle = this.reportStyle('institutionSubTextStyle', { fontSize: 9, alignment: 'center', color: '#5E7FB3' });
    const addressStyle = this.reportStyle('addressStyle', { fontSize: 10, alignment: 'center', color: '#5E7FB3', bold: true });
    const header: any[] = [];
    const logoW = this.mmToPt(this.reportNumber('report.simple.headerLogoWidthMm', 70, 5, 100), 200);
    const logoH = this.mmToPt(this.reportNumber('report.simple.headerLogoHeightMm', 53, 5, 80), 150);
    const textStack: any[] = [];
    if (title.trim()) textStack.push({ text: title, ...titleStyle, margin: [0, 0, 0, subText ? 1 : 2] });
    if (subText.trim()) textStack.push({ text: subText, ...subStyle, margin: [0, 0, 0, 1] });
    if (addressText.trim() && this.reportSetting('report.simple.addressPlacement', 'header') === 'header') textStack.push({ text: addressText, ...addressStyle, lineHeight: 1.08, margin: [0, 0, 0, phoneEmail ? 1 : 6] });
    if (phoneEmail) textStack.push({ text: phoneEmail, ...addressStyle, fontSize: Math.max(7, Number(addressStyle.fontSize || 9) - 0.5), margin: [0, 0, 0, 6] });
    if (logoPath) {
      const place = this.reportAlign('report.simple.headerLogoPlacement', 'left');
      if (place === 'center') header.push({ image: logoPath, fit: [logoW, logoH], alignment: 'center', margin: [0, 0, 0, 2] }, { stack: textStack });
      else header.push({ columns: place === 'right' ? [{ width: '*', stack: textStack }, { width: logoW + 8, image: logoPath, fit: [logoW, logoH], alignment: 'right' }] : [{ width: logoW + 8, image: logoPath, fit: [logoW, logoH], alignment: 'left' }, { width: '*', stack: textStack }], columnGap: 8 });
    } else {
      header.push({ stack: textStack });
    }
    header.push(...this.reportHrBlocks('after-institution'));
    header.push(...this.reportHrBlocks('before-patient'));
    header.push(...this.buildReportPatientBlock(r, computed, 'header'));
    header.push(...this.reportHrBlocks('after-patient'));
    if (this.reportBool('report.simple.patientBarcodeEnabled', false)) {
      const barcodeSource = this.reportSetting('report.simple.patientBarcodeSource', 'patient_no');
      const barcodeValue = this.patientFieldValue(r, barcodeSource, computed);
      const barcode = this.buildCode39Barcode(barcodeValue);
      if (barcode) header.push(barcode);
    }
    return header;
  }

  protected signatureTextStyle(line: any, fallbackAlignment: ReportAlignment, fallbackLineNo: number): any {
    const fontSize = this.safeNumber(line?.fontSize, fallbackLineNo === 2 ? 10 : 8, 4, 72);
    const color = this.safeColor(line?.color, '#111111');
    const align = this.safeAlign(line?.alignment || fallbackAlignment, fallbackAlignment);
    const font = this.reportFont(line?.fontFamily || line?.font || 'Roboto');
    const out: any = {
      text: String(line?.text || ''),
      font,
      fontSize,
      color,
      bold: line?.bold === true,
      italics: line?.italic === true || line?.italics === true,
      alignment: align,
      lineHeight: this.safeNumber(line?.lineHeight, this.reportNumber(`report.simple.signatureLine${fallbackLineNo}Height`, 1.05, 0.7, 3), 0.7, 3),
      characterSpacing: this.safeNumber(line?.characterSpacing, 0, -20, 20),
      margin: [0, this.mmToPt(this.safeNumber(line?.topOffsetMm, 0, -50, 50)), 0, this.mmToPt(this.safeNumber(line?.bottomOffsetMm, 0, -50, 50))]
    };
    if (line?.underline === true) out.decoration = 'underline';
    return out;
  }

  protected safeNumber(value: any, fallback: number, min = -9999, max = 9999): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  }

  protected safeColor(value: any, fallback = '#111111'): string {
    const raw = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(raw) ? raw : fallback;
  }

  protected safeAlign(value: any, fallback: ReportAlignment = 'center'): ReportAlignment {
    const raw = String(value || '').trim().toLowerCase();
    return raw === 'left' || raw === 'right' || raw === 'center' ? raw as ReportAlignment : fallback;
  }

  protected dynamicSignatureImageZone(signs: any[]): number {
    // Manual override only when user sets Image Zone Height > 0.
    const manual = this.reportNumber('report.simple.signatureImageZoneHeightMm', 0, 0, 100);
    if (manual > 0) return this.mmToPt(manual);
    // Otherwise size only from the configured image height — do not pre-pad
    // with top/bottom offsets (those are nudges, not reserved blank space).
    let maxHeightMm = 0;
    for (const sign of signs || []) {
      const imagePath = sign?.imageEnabled === false ? '' : this.safeImagePath(String(sign?.imagePath || sign?.signatureImagePath || '').trim());
      if (!imagePath) continue;
      maxHeightMm = Math.max(maxHeightMm, this.safeNumber(sign?.imageHeightMm, 12, 0, 120));
    }
    return this.mmToPt(maxHeightMm);
  }

  protected buildDynamicSignatureBlock(rawSign: any, slotAlignment: ReportAlignment, rowImageZonePt = 0): any {
    const blockAlignment = this.safeAlign(rawSign?.blockAlignment || rawSign?.blockAlign || slotAlignment, slotAlignment);
    const textAlignment = this.safeAlign(rawSign?.textAlignment || rawSign?.textAlign || 'center', 'center');
    const imageAlignment = this.safeAlign(rawSign?.imageAlignment || rawSign?.imageAlign || textAlignment, textAlignment);
    const stack: any[] = [];
    const imagePath = rawSign?.imageEnabled === false ? '' : this.safeImagePath(String(rawSign?.imagePath || rawSign?.signatureImagePath || '').trim());
    const imageTextGapPt = this.mmToPt(this.reportNumber('report.simple.signatureImageTextGapMm', 1, 0, 40));
    if (imagePath) {
      const imageWidthPt = this.mmToPt(this.safeNumber(rawSign?.imageWidthMm, 28, 1, 180));
      const imageHeightPt = this.mmToPt(this.safeNumber(rawSign?.imageHeightMm, 12, 1, 120));
      const xOffsetPt = this.mmToPt(this.safeNumber(rawSign?.imageLeftOffsetMm ?? rawSign?.imageOffsetXMm, 0, -200, 200) - this.safeNumber(rawSign?.imageRightOffsetMm, 0, -200, 200));
      const yOffsetPt = this.mmToPt(this.safeNumber(rawSign?.imageTopOffsetMm ?? rawSign?.imageOffsetYMm, 0, -200, 200));
      const bottomOffsetPt = this.mmToPt(this.safeNumber(rawSign?.imageBottomOffsetMm, 0, -200, 200));
      // Height follows the image fit box only. Offsets nudge placement; they do not
      // inflate a taller empty zone above the stamp.
      stack.push({
        image: imagePath,
        fit: [imageWidthPt, imageHeightPt],
        width: imageWidthPt,
        height: imageHeightPt,
        alignment: imageAlignment,
        margin: [xOffsetPt, yOffsetPt, -xOffsetPt, Math.max(0, bottomOffsetPt) + imageTextGapPt]
      });
    } else if (rowImageZonePt > 0) {
      // Sibling signs in this row have images — keep text lines aligned without
      // inventing extra top padding beyond the shared image height.
      stack.push({
        table: { widths: ['*'], heights: [rowImageZonePt], body: [[{ text: '' }]] },
        layout: 'noBorders',
        margin: [0, 0, 0, imageTextGapPt]
      });
    }
    const rawLines = Array.isArray(rawSign?.lines) ? rawSign.lines : [
      { text: rawSign?.designation || rawSign?.label || '', fontSize: 8, bold: false },
      { text: rawSign?.name || rawSign?.text || '', fontSize: 10, bold: true },
      { text: rawSign?.qualification || '', fontSize: 8, bold: false },
      { text: rawSign?.extra || rawSign?.extraText || '', fontSize: 8, bold: false }
    ];
    const emptyMode = String(rawSign?.emptyLineMode || this.reportSetting('report.simple.signatureEmptyLineMode', 'reserve')).toLowerCase();
    if (rawSign?.textEnabled !== false) {
      rawLines.slice(0, 12).forEach((line: any, idx: number) => {
        const text = String(line?.text || '').trim();
        if (!text && emptyMode !== 'reserve') return;
        const node = this.signatureTextStyle({ ...line, text }, textAlignment, Math.min(idx + 1, 4));
        if (!text) node.text = ' ';
        stack.push(node);
      });
    }
    if (!stack.length) return { text: '' };
    return {
      stack,
      alignment: blockAlignment,
      margin: [
        this.mmToPt(this.safeNumber(rawSign?.blockLeftMarginMm ?? rawSign?.leftMarginMm, 0, -200, 200)),
        this.mmToPt(this.safeNumber(rawSign?.blockTopOffsetMm ?? rawSign?.topOffsetMm, 0, -200, 200)),
        this.mmToPt(this.safeNumber(rawSign?.blockRightMarginMm ?? rawSign?.rightMarginMm, 0, -200, 200)),
        this.mmToPt(this.safeNumber(rawSign?.blockBottomOffsetMm ?? rawSign?.bottomOffsetMm, 0, -200, 200))
      ]
    };
  }

  protected buildAdvancedSignatureBlocks(options:any = {}): any[] {
    if (options?.show_signatures === false) return [];
    if (!this.reportBool('report.simple.signatureAdvancedEnabled', false)) return [];
    let signs: any[] = [];
    try {
      const parsed = JSON.parse(this.reportSetting('report.simple.signatureRowsJson', '[]'));
      signs = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.signatures) ? parsed.signatures : [];
    } catch { signs = []; }
    const selectedSignatureIds = Array.isArray(options?.signature_ids) ? new Set(options.signature_ids.map((x:any)=>String(x))) : null;
    const signatureContent = options?.signature_content && typeof options.signature_content === 'object' ? options.signature_content : {};
    signs = signs
      .filter((s: any, index:number) => s && s.enabled !== false && (!selectedSignatureIds || selectedSignatureIds.has(String(s.id ?? index))))
      .map((s: any, index: number) => {
        const id = String(s.id ?? index);
        const mode = String(signatureContent?.[id] || signatureContent?.[String(s.id)] || 'IMAGE_TEXT').toUpperCase();
        return {
          ...s,
          imageEnabled: mode === 'TEXT_ONLY' ? false : (s.imageEnabled !== false),
          textEnabled: mode === 'IMAGE_ONLY' ? false : (s.textEnabled !== false)
        };
      });
    if (!signs.length) return [];
    const groups = new Map<number, any[]>();
    signs.forEach((sign: any, index: number) => {
      const row = Math.max(0, Math.floor(this.safeNumber(sign?.row, Math.floor(index / 3), 0, 99)));
      const existing = groups.get(row) || [];
      existing.push({ ...sign, __index: index });
      groups.set(row, existing);
    });
    const out: any[] = [];
    const rowTop = this.mmToPt(this.reportNumber('report.simple.signatureRowTopMarginMm', 0, 0, 100));
    const rowBottom = this.mmToPt(this.reportNumber('report.simple.signatureRowBottomMarginMm', 2, 0, 100));
    Array.from(groups.keys()).sort((a,b) => a-b).forEach((rowNo) => {
      const rowSigns = (groups.get(rowNo) || []).sort((a,b) => this.safeNumber(a.order ?? a.__index, a.__index) - this.safeNumber(b.order ?? b.__index, b.__index));
      const slots: Record<ReportAlignment, any[]> = { left: [], center: [], right: [] };
      rowSigns.forEach((sign: any, idx: number) => {
        const fallback: ReportAlignment = idx % 3 === 0 ? 'left' : idx % 3 === 1 ? 'center' : 'right';
        const pos = this.safeAlign(sign.position || sign.blockPosition || fallback, fallback);
        slots[pos].push(sign);
      });
      const rowImageZonePt = this.dynamicSignatureImageZone(rowSigns);
      const makeSlot = (items: any[], align: ReportAlignment) => ({
        width: '*',
        stack: items.length ? items.map(sign => this.buildDynamicSignatureBlock(sign, align, rowImageZonePt)) : [{ text: ' ' }],
        alignment: align
      });
      out.push({
        unbreakable: true,
        margin: [0, rowTop, 0, rowBottom],
        columns: [makeSlot(slots.left, 'left'), makeSlot(slots.center, 'center'), makeSlot(slots.right, 'right')],
        columnGap: this.mmToPt(this.reportNumber('report.simple.signatureColumnGapMm', 2, 0, 50))
      });
    });
    return out;
  }

  protected buildReportSignatureBlock(prefix: 'labSign' | 'otherSign', defaultLabel: string, defaultAlignment: ReportAlignment): any[] {
    const key = (name: string) => `report.simple.${prefix}${name}`;
    if (!this.reportBool(key('Enabled'), prefix === 'labSign')) return [];
    const signLabel = this.reportSetting(key('Label'), defaultLabel);
    const signText = this.reportSetting(key('Text'), '');
    const styleKey = prefix === 'labSign' ? 'labSignStyle' : 'otherSignStyle';
    const signStyle = this.reportStyle(styleKey, { fontSize: 10, bold: true, alignment: defaultAlignment, color: '#111111' });
    const alignment = this.reportAlign(key('Alignment'), (signStyle.alignment || defaultAlignment) as ReportAlignment);
    const signImage = this.reportBool(key('ImageEnabled'), false) ? this.safeImagePath(this.reportSetting(key('ImagePath'), '')) : '';
    const signStack: any[] = [];
    const textStyle = { ...signStyle, alignment };
    if (signImage) signStack.push({
      image: signImage,
      fit: [
        this.mmToPt(this.reportNumber(key('ImageWidthMm'), 28, 5, 120), 99),
        this.mmToPt(this.reportNumber(key('ImageHeightMm'), 12, 5, 80), 34)
      ],
      alignment,
      margin: [
        this.mmToPt(this.reportNumber(key('ImageOffsetXMm'), 0, -100, 100)),
        this.mmToPt(this.reportNumber(key('ImageOffsetYMm'), -4, -100, 100)),
        0,
        2
      ]
    });
    if (signLabel.trim()) signStack.push({ text: signLabel, ...textStyle });
    if (signText.trim()) signStack.push({ text: signText, ...textStyle, bold: false, margin: [0, 1, 0, 0] });
    if (!signStack.length) return [];
    const signTopPt = this.mmToPt(this.reportNumber(key('MarginTopMm'), 0, 0, 100));
    const signBottomPt = this.mmToPt(this.reportNumber(key('MarginBottomMm'), 2, 0, 100), 5);
    const signOffsetXPt = this.mmToPt(this.reportNumber(key('OffsetXMm'), 0, -100, 100));
    const signOffsetYPt = this.mmToPt(this.reportNumber(key('OffsetYMm'), 0, -100, 100));
    return [{ unbreakable: true, stack: signStack, margin: [signOffsetXPt, signTopPt + signOffsetYPt, -signOffsetXPt, signBottomPt] }];
  }

  protected buildReportLabSignatureBlock(options:any = {}): any[] {
    if (options?.show_signatures === false) return [];
    if (!this.reportBool('report.simple.signatureAdvancedEnabled', false)) return [];
    return this.buildAdvancedSignatureBlocks(options);
  }

  protected buildReportDisclaimerBlock(area: 'footer' | 'body'): any[] {
    const placement = String(this.reportSetting('report.simple.disclaimerPlacement', 'footer')).toLowerCase();
    if (placement === 'hidden') return [];
    if (area === 'footer' && placement !== 'footer') return [];
    if (area === 'body' && placement !== 'above-footer') return [];
    const text = this.reportSetting('report.simple.disclaimerText', this.reportSetting('report.simple.footerText', this.org().footer || '')).trim();
    if (!text) return [];
    const style = this.reportStyle('disclaimerStyle', { fontSize: 9, alignment: 'center', color: '#111111' });
    const alignment = this.reportAlign('report.simple.disclaimerAlignment', style.alignment || 'center');
    const bg = this.reportColor('report.simple.disclaimerBgColor', '#ffffff');
    const widthPct = this.reportNumber('report.simple.disclaimerWidthPct', 100, 5, 100);
    const lineHeight = this.reportNumber('report.simple.disclaimerLineHeight', 1.05, 0.8, 2.5);
    const characterSpacing = this.reportNumber('report.simple.disclaimerCharacterSpacing', 0, -20, 20);
    const textNode: any = { text, ...style, alignment, lineHeight, characterSpacing };
    const useBg = bg && bg.toLowerCase() !== '#ffffff';
    const bodyNode: any = useBg ? { table: { widths: ['*'], body: [[{ ...textNode, fillColor: bg, border: [false, false, false, false], margin: [3, 2, 3, 2] }]] }, layout: 'noBorders' } : textNode;
    const topPt = this.mmToPt(this.reportNumber('report.simple.disclaimerMarginTopMm', 0, 0, 100));
    const bottomPt = this.mmToPt(this.reportNumber('report.simple.disclaimerMarginBottomMm', 0, 0, 100));
    const leftPt = this.mmToPt(this.reportNumber('report.simple.disclaimerMarginLeftMm', 0, 0, 100));
    const rightPt = this.mmToPt(this.reportNumber('report.simple.disclaimerMarginRightMm', 0, 0, 100));
    const offsetXPt = this.mmToPt(this.reportNumber('report.simple.disclaimerOffsetXMm', 0, -100, 100));
    const offsetYPt = this.mmToPt(this.reportNumber('report.simple.disclaimerOffsetYMm', 0, -100, 100));
    const block: any = { width: `${widthPct}%`, stack: [bodyNode], margin: [leftPt + offsetXPt, topPt + offsetYPt, rightPt - offsetXPt, bottomPt] };
    if (widthPct >= 99) return [block];
    if (alignment === 'right') return [{ columns: [{ width: '*', text: '' }, block] }];
    if (alignment === 'center') return [{ columns: [{ width: '*', text: '' }, block, { width: '*', text: '' }] }];
    return [{ columns: [block, { width: '*', text: '' }] }];
  }

  protected buildReportFooterBlock() {
    const showPage = this.reportBool('report.simple.pageNumbersEnabled', true);
    return (currentPage: number, pageCount: number) => {
      const stack: any[] = [];
      const footerHrWidthPt = this.reportPageContentWidthPt();
      stack.push(...this.reportHrBlocks('before-footer', footerHrWidthPt));
      const pageLeftMm = this.reportNumber('report.simple.marginLeftMm', 8.8, 0, 100);
      const pageRightMm = this.reportNumber('report.simple.marginRightMm', 5.3, 0, 100);
      const pageBottomMm = this.reportNumber('report.simple.marginBottomMm', 2, 0, 100);
      const footerLeftPt = this.mmToPt(pageLeftMm);
      const footerRightPt = this.mmToPt(pageRightMm);
      const footerTopPt = this.mmToPt(this.reportNumber('report.simple.footerMarginTopMm', 0, 0, 60));
      const footerBottomPt = this.mmToPt(pageBottomMm + this.reportNumber('report.simple.footerMarginBottomMm', 0, 0, 60), 6);
      const footerTextTopPt = this.mmToPt(this.reportNumber('report.simple.footerTextMarginTopMm', 0, 0, 60));
      const footerTextBottomPt = this.mmToPt(this.reportNumber('report.simple.footerTextMarginBottomMm', 0, 0, 60));
      const footerTextOffsetXPt = this.mmToPt(this.reportNumber('report.simple.footerTextOffsetXMm', 0, -100, 100));
      const footerTextOffsetYPt = this.mmToPt(this.reportNumber('report.simple.footerTextOffsetYMm', 0, -100, 100));
      stack.push(...this.reportHrBlocks('footer', footerHrWidthPt));
      stack.push(...this.reportHrBlocks('in-footer', footerHrWidthPt));
      const disclaimerPlacement = String(this.reportSetting('report.simple.disclaimerPlacement', 'footer')).toLowerCase();
      const disclaimerText = disclaimerPlacement === 'footer' ? this.reportSetting('report.simple.disclaimerText', this.reportSetting('report.simple.footerText', this.org().footer || '')).trim() : '';
      const footerStyle = this.reportStyle('footerStyle', { fontSize: 9, alignment: 'left', color: '#111111' });
      const disclaimerStyle = this.reportStyle('disclaimerStyle', { fontSize: 9, alignment: 'center', color: '#111111' });
      const rowColumns: any[] = [];
      const gapPt = this.mmToPt(this.reportNumber('report.simple.footerColumnGapMm', 4, 0, 30));
      const discPct = this.reportNumber('report.simple.footerDisclaimerWidthPct', 82, 5, 95);
      const pagePct = this.reportNumber('report.simple.footerPageNumberWidthPct', 18, 5, 60);
      const totalPct = Math.max(1, discPct + pagePct);
      const availablePt = Math.max(80, footerHrWidthPt - gapPt);
      const discWidthPt = availablePt * (discPct / totalPct);
      const pageWidthPt = availablePt * (pagePct / totalPct);
      if (disclaimerText) rowColumns.push({ width: discWidthPt, text: disclaimerText, ...disclaimerStyle, alignment: this.reportAlign('report.simple.disclaimerAlignment', disclaimerStyle.alignment || 'center'), lineHeight: this.reportNumber('report.simple.disclaimerLineHeight', 1.05, 0.8, 2.5), characterSpacing: this.reportNumber('report.simple.disclaimerCharacterSpacing', 0, -20, 20) });
      else rowColumns.push({ width: discWidthPt, text: '' });
      rowColumns.push({ width: gapPt, text: '' });
      if (showPage) rowColumns.push({ width: pageWidthPt, text: `Page ${currentPage} of ${pageCount}`, ...footerStyle, alignment: this.reportAlign('report.simple.footerPageNumberAlignment', 'right'), noWrap: true });
      if (disclaimerText || showPage) stack.push({ columns: rowColumns, margin: [footerTextOffsetXPt, footerTextTopPt + footerTextOffsetYPt, -footerTextOffsetXPt, footerTextBottomPt] });
      stack.push(...this.reportHrBlocks('after-footer', footerHrWidthPt));
      return { margin: [footerLeftPt, footerTopPt, footerRightPt, footerBottomPt], stack };
    };
  }

  protected reportTableLayout(): any {
    const color = this.reportColor('report.simple.tableBorderColor', '#cccccc');
    const line = this.reportNumber('report.simple.tableBorderWidth', this.reportNumber('report.simple.tableLineWidth', 0.3, 0, 5), 0, 5);
    const outside = this.reportBool('report.simple.tableOutsideBorder', true);
    const topBorder = this.reportBool('report.simple.tableTopBorder', true);
    const bottomBorder = this.reportBool('report.simple.tableBottomBorder', true);
    const leftBorder = this.reportBool('report.simple.tableLeftBorder', true);
    const rightBorder = this.reportBool('report.simple.tableRightBorder', true);
    const inner = this.reportBool('report.simple.tableInnerBorder', true);
    const innerH = this.reportBool('report.simple.tableInnerHBorder', inner);
    const innerV = this.reportBool('report.simple.tableInnerVBorder', inner);
    const legacyPtToMm = (key: string, fallbackPt: number) => this.reportNumber(key, fallbackPt, 0, 40) / 2.8346456693;
    return {
      paddingLeft: () => this.mmToPt(this.reportNumber('report.simple.tablePaddingLeftMm', legacyPtToMm('report.simple.tablePaddingLeft', 6), 0, 20)),
      paddingRight: () => this.mmToPt(this.reportNumber('report.simple.tablePaddingRightMm', legacyPtToMm('report.simple.tablePaddingRight', 6), 0, 20)),
      paddingTop: () => this.mmToPt(this.reportNumber('report.simple.tablePaddingTopMm', legacyPtToMm('report.simple.tablePaddingTop', 4), 0, 20)),
      paddingBottom: () => this.mmToPt(this.reportNumber('report.simple.tablePaddingBottomMm', legacyPtToMm('report.simple.tablePaddingBottom', 4), 0, 20)),
      hLineWidth: (i:number, node:any) => ((outside && ((i === 0 && topBorder) || (i === node.table.body.length && bottomBorder))) || (innerH && i > 0 && i < node.table.body.length)) ? line : 0,
      vLineWidth: (i:number, node:any) => ((outside && ((i === 0 && leftBorder) || (i === node.table.widths.length && rightBorder))) || (innerV && i > 0 && i < node.table.widths.length)) ? line : 0,
      hLineColor: () => color,
      vLineColor: () => color
    };
  }


  protected reportHrBlocks(placement: string, widthOverridePt?: number): any[] {
    const config = this.reportSetting('report.simple.hrLinesConfig', '');
    if (!config.trim()) return [];
    const width = widthOverridePt || this.reportAvailableWidthPt();
    return config.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const [where, top = '0', thickness = '0.45', color = '#111111', bottom = '0', xOffset = '0', widthPct = '100'] = line.split('|').map(x => x.trim());
      if (where !== placement) return null;
      const pct = Math.max(1, Math.min(100, Number(widthPct) || 100));
      return {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: width * pct / 100, y2: 0, lineWidth: Number(thickness) || 0.45, lineColor: this.reportColorValue(color, '#111111') }],
        margin: [this.mmToPt(Number(xOffset) || 0), this.mmToPt(Number(top) || 0), 0, this.mmToPt(Number(bottom) || 0)]
      };
    }).filter(Boolean) as any[];
  }

  protected reportColorValue(value: string, fallback: string): string {
    const c = String(value || '').trim();
    return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback;
  }

  protected reportTableColumnKeys(): string[] {
    const arrangement = this.reportSetting('report.simple.tableColumnArrangement', 'test_specimen,result_flag,unit,reference_method');
    const rawKeys = arrangement.split(',').map((x:string)=>x.trim().toLowerCase()).filter(Boolean);
    const keys = rawKeys.length ? rawKeys : ['test_specimen','result_flag','unit','reference_method'];
    const showSpecimen = this.reportBool('report.simple.specimenVisible', this.reportBool('report.simple.showSpecimenInTestName', true));
    const specimenPlacement = this.reportSetting('report.simple.specimenPlacement', 'under-test');
    const showMethod = this.reportBool('report.simple.methodVisible', this.reportBool('report.simple.showMethodInReference', true));
    const methodPlacement = this.reportSetting('report.simple.methodPlacement', 'under-reference');
    const flagMode = this.reportFlagMode();
    const flagsEnabled = this.reportBool('report.simple.tableFlagsEnabled', true) && flagMode !== 'none' && flagMode !== 'range_only';
    const showFlagColumn = flagsEnabled && this.reportBool('report.simple.tableShowFlagColumn', false);
    const valid = new Set(['test_specimen','test','specimen','result_flag','result','flag','unit','reference_method','reference','method']);
    const out:string[] = [];
    const push = (key:string) => { if (valid.has(key) && !out.includes(key)) out.push(key); };
    for (const key of keys) {
      if (!valid.has(key)) continue;
      if (key === 'test_specimen') {
        if (showSpecimen && specimenPlacement === 'separate-column') { push('test'); push('specimen'); } else push('test_specimen');
      } else if (key === 'specimen') {
        if (showSpecimen && specimenPlacement !== 'hidden') push('specimen');
      } else if (key === 'result_flag') {
        if (!flagsEnabled) push('result'); else if (showFlagColumn) { push('result'); push('flag'); } else push('result_flag');
      } else if (key === 'flag') {
        if (showFlagColumn) push('flag');
      } else if (key === 'reference_method') {
        if (showMethod && methodPlacement === 'separate-column') { push('reference'); push('method'); } else push('reference_method');
      } else if (key === 'method') {
        if (showMethod && methodPlacement !== 'hidden') push('method');
      } else {
        push(key);
      }
    }
    if (!out.some(k => k === 'reference' || k === 'reference_method')) push(showMethod && methodPlacement === 'separate-column' ? 'reference' : 'reference_method');
    return out.length ? out : ['test_specimen','result_flag','unit','reference_method'];
  }

  protected reportTableColumnLabel(key:string): string {
    const map:any = {
      test_specimen: ['report.simple.tableTestSpecimenLabel', 'Test / Specimen'], test: ['report.simple.tableTestLabel', 'Test'], specimen: ['report.simple.tableSpecimenLabel', 'Specimen'],
      result_flag: ['report.simple.tableResultFlagLabel', 'Result + Flag'], result: ['report.simple.tableResultLabel', 'Result'], flag: ['report.simple.tableFlagLabel', 'Flag'], unit: ['report.simple.tableUnitLabel', 'Unit'],
      reference_method: ['report.simple.tableReferenceMethodLabel', 'Reference / Method'], reference: ['report.simple.tableReferenceLabel', 'Reference'], method: ['report.simple.tableMethodLabel', 'Method']
    };
    const item = map[key] || [key, key];
    const configured = String(this.reportSetting(item[0], '') ?? '');
    const trimmed = configured.trim();
    if (trimmed.toLowerCase() === '__blank__') return '';
    return trimmed ? configured : item[1];
  }

  protected reportTableColumnWidthPct(key:string): number {
    const map:any = {
      test_specimen: ['report.simple.tableTestSpecimenPct', this.reportNumber('report.simple.tableParamPct', 34, 1, 90)], test: ['report.simple.tableTestPct', 28], specimen: ['report.simple.tableSpecimenPct', 10],
      result_flag: ['report.simple.tableResultFlagPct', this.reportNumber('report.simple.tableAnalysedPct', 13, 1, 90)], result: ['report.simple.tableResultPct', this.reportNumber('report.simple.tableAnalysedPct', 13, 1, 90)], flag: ['report.simple.tableFlagPct', 5], unit: ['report.simple.tableUnitWidthPct', this.reportNumber('report.simple.tableUnitPct', 10, 1, 90)],
      reference_method: ['report.simple.tableReferenceMethodPct', this.reportNumber('report.simple.tableRangePct', 43, 1, 90)], reference: ['report.simple.tableReferencePct', 35], method: ['report.simple.tableMethodPct', 8]
    };
    const item = map[key] || [key, 10];
    return Math.max(1, this.reportNumber(item[0], item[1], 1, 90));
  }


  protected reportFlagDisplayMode(): string {
    const raw = String(this.reportSetting('report.simple.tableFlagDisplayMode', 'text') || '').trim().toLowerCase();
    return raw === 'symbol' || raw === 'drawn_arrow' || raw === 'custom' ? raw : 'text';
  }

  protected flagOutputUsesUnicodeSymbol(text: string): boolean {
    return /[↑↓▲▼△▽⬆⬇⇑⇓]/.test(String(text || ''));
  }

  protected buildFlagSymbolTextNode(flag: string): any {
    const text = this.reportFlagOutputText(flag);
    if (!text) return { text: '' };
    const styleName = this.arrowStyleForReport(flag);
    if (this.flagOutputUsesUnicodeSymbol(text)) {
      const base = this.reportStyle('flagStyle', { bold: true, fontSize: 11, color: '#111111', fontFamily: 'NotoSansSymbols' });
      const color = styleName === 'arrowHigh'
        ? this.reportColor('report.simple.highColor', '#c00')
        : styleName === 'arrowLow'
          ? this.reportColor('report.simple.lowColor', '#00c')
          : (base.color || '#111111');
      const font = this.reportFont('NotoSansSymbols');
      return {
        text,
        bold: true,
        fontSize: Number(base.fontSize) || 11,
        color,
        font: font !== this.defaultReportFont ? font : undefined,
        alignment: 'center'
      };
    }
    return { text, style: styleName, alignment: 'center' };
  }

  protected isHighReportFlag(flag:string): boolean {
    const f = String(flag || '').toUpperCase();
    return ['CH','CRITICAL_HIGH','CRITICAL HIGH','HH','H','HIGH','CR','C','CRIT','CRITICAL'].includes(f);
  }

  protected isLowReportFlag(flag:string): boolean {
    const f = String(flag || '').toUpperCase();
    return ['CL','CRITICAL_LOW','CRITICAL LOW','LL','L','LOW'].includes(f);
  }

  protected isCriticalReportFlag(flag:string): boolean {
    const f = String(flag || '').toUpperCase();
    return ['CH','CRITICAL_HIGH','CRITICAL HIGH','HH','CL','CRITICAL_LOW','CRITICAL LOW','LL'].includes(f);
  }

  protected buildDrawnFlagArrow(flag:string): any {
    if (!flag) return { text:'' };
    const high = this.isHighReportFlag(flag);
    const low = this.isLowReportFlag(flag);
    if (!high && !low) return { text:'' };
    const critical = this.isCriticalReportFlag(flag);
    const size = this.mmToPt(this.reportNumber('report.simple.tableFlagDrawnArrowSizeMm', 2.8, 1, 8));
    const stroke = this.reportNumber('report.simple.tableFlagDrawnArrowStrokeWidth', 1.1, 0.3, 3);
    const color = high ? this.reportColor('report.simple.highColor','#c00') : this.reportColor('report.simple.lowColor','#00c');
    const gap = Math.max(1, size * 0.30);
    const count = critical ? 2 : 1;
    const width = count === 2 ? (size * 2 + gap) : size;
    const canvas:any[] = [];
    const addArrow = (x:number) => {
      const cx = x + size / 2;
      const top = 0.5;
      const bottom = Math.max(top + 1, size - 0.5);
      const head = Math.max(2, size * 0.34);
      if (high) {
        canvas.push({ type:'line', x1:cx, y1:bottom, x2:cx, y2:top, lineWidth:stroke, lineColor:color });
        canvas.push({ type:'line', x1:cx, y1:top, x2:cx - head, y2:top + head, lineWidth:stroke, lineColor:color });
        canvas.push({ type:'line', x1:cx, y1:top, x2:cx + head, y2:top + head, lineWidth:stroke, lineColor:color });
      } else {
        canvas.push({ type:'line', x1:cx, y1:top, x2:cx, y2:bottom, lineWidth:stroke, lineColor:color });
        canvas.push({ type:'line', x1:cx, y1:bottom, x2:cx - head, y2:bottom - head, lineWidth:stroke, lineColor:color });
        canvas.push({ type:'line', x1:cx, y1:bottom, x2:cx + head, y2:bottom - head, lineWidth:stroke, lineColor:color });
      }
    };
    addArrow(0);
    if (critical) addArrow(size + gap);
    return { canvas, width, height:size, alignment:'center', margin:[0,0,0,0] };
  }

  /** Same geometry/stroke as canvas arrows, but SVG — positions correctly inside Flag cells. */
  protected buildDrawnFlagArrowSvg(flag:string): any {
    if (!flag) return { text:'' };
    const high = this.isHighReportFlag(flag);
    const low = this.isLowReportFlag(flag);
    if (!high && !low) return { text:'' };
    const critical = this.isCriticalReportFlag(flag);
    const size = this.mmToPt(this.reportNumber('report.simple.tableFlagDrawnArrowSizeMm', 2.8, 1, 8));
    const stroke = this.reportNumber('report.simple.tableFlagDrawnArrowStrokeWidth', 1.1, 0.3, 3);
    const color = high ? this.reportColor('report.simple.highColor','#c00') : this.reportColor('report.simple.lowColor','#00c');
    const gap = Math.max(1, size * 0.30);
    const count = critical ? 2 : 1;
    const width = count === 2 ? (size * 2 + gap) : size;
    const lines:string[] = [];
    const addArrow = (x:number) => {
      const cx = x + size / 2;
      const top = 0.5;
      const bottom = Math.max(top + 1, size - 0.5);
      const head = Math.max(2, size * 0.34);
      const common = `stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
      if (high) {
        lines.push(`<line x1="${cx}" y1="${bottom}" x2="${cx}" y2="${top}" ${common}/>`);
        lines.push(`<line x1="${cx}" y1="${top}" x2="${cx - head}" y2="${top + head}" ${common}/>`);
        lines.push(`<line x1="${cx}" y1="${top}" x2="${cx + head}" y2="${top + head}" ${common}/>`);
      } else {
        lines.push(`<line x1="${cx}" y1="${top}" x2="${cx}" y2="${bottom}" ${common}/>`);
        lines.push(`<line x1="${cx}" y1="${bottom}" x2="${cx - head}" y2="${bottom - head}" ${common}/>`);
        lines.push(`<line x1="${cx}" y1="${bottom}" x2="${cx + head}" y2="${bottom - head}" ${common}/>`);
      }
    };
    addArrow(0);
    if (critical) addArrow(size + gap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${size}" viewBox="0 0 ${width} ${size}">${lines.join('')}</svg>`;
    return { svg, width, height: size, alignment: 'center', margin: [0, 0, 0, 0] };
  }

  protected buildReportFlagCell(flag:string): any {
    if (!flag) return { text:'' };
    if (this.reportFlagDisplayMode() === 'drawn_arrow') {
      // pdfmake `canvas` inside multi-column result tables (esp. MHC with many
      // section bands) paints into Result. SVG uses the same size/stroke/colors
      // and stays in the Flag column like text.
      const drawn = this.buildDrawnFlagArrowSvg(flag);
      if (drawn?.svg) return drawn;
    }
    return this.buildFlagSymbolTextNode(flag);
  }

  protected buildResultFlagCell(resultText:string, flag:string, resultStyle:any): any {
    if (!flag) return { text:resultText, style:resultStyle };
    // Combined Result+Flag column only (no separate Flag column).
    if (this.reportFlagDisplayMode() === 'drawn_arrow') {
      const drawn = this.buildDrawnFlagArrow(flag);
      if (Array.isArray(drawn?.canvas) && drawn.canvas.length) {
        return {
          columns: [
            { text: resultText, style: resultStyle, width: '*', alignment: 'right' },
            { ...drawn, width: 'auto', margin: [3, 0, 0, 0] }
          ],
          columnGap: 0
        };
      }
    }
    const flagNode = this.buildFlagSymbolTextNode(flag);
    if (!flagNode || !String(flagNode.text || '').trim()) {
      return { text:resultText, style:resultStyle };
    }
    return {
      columns: [
        { text: resultText, style: resultStyle, width: '*', alignment: 'right' },
        { ...flagNode, width: 'auto', margin: [4, 0, 0, 0] }
      ],
      columnGap: 0
    };
  }


  protected reportFlagMode(): string {
    const raw = String(this.reportSetting('report.simple.tableFlagMode', 'critical_flag_abnormal') || '').trim().toLowerCase();
    const allowed = new Set(['none','range_only','flag_only','flag_abnormal','critical_flag_abnormal']);
    return allowed.has(raw) ? raw : 'critical_flag_abnormal';
  }

  protected reportFlagOutputText(flag:string): string {
    const f = String(flag || '').toUpperCase();
    const clean = (key:string, fallback:string) => {
      const raw = String(this.reportSetting(key, '') ?? '');
      const trimmed = raw.trim();
      if (!trimmed) return fallback;
      if (trimmed.toLowerCase() === '__blank__') return '';
      return raw;
    };
    if (['CH','CRITICAL_HIGH','CRITICAL HIGH','HIGH_CRITICAL','HH'].includes(f)) return clean('report.simple.criticalHighFlagText', 'CH');
    if (['CL','CRITICAL_LOW','CRITICAL LOW','LOW_CRITICAL','LL'].includes(f)) return clean('report.simple.criticalLowFlagText', 'CL');
    if (['H','HIGH'].includes(f)) return clean('report.simple.highFlagText', 'H');
    if (['L','LOW'].includes(f)) return clean('report.simple.lowFlagText', 'L');
    return '';
  }


  protected reportTableColumnHeaderAlign(key:string): 'left'|'center'|'right' {
    const map:any = {
      test_specimen: ['report.simple.tableTestSpecimenHeaderAlign', 'left'], test: ['report.simple.tableTestHeaderAlign', 'left'], specimen: ['report.simple.tableSpecimenHeaderAlign', 'left'],
      result_flag: ['report.simple.tableResultFlagHeaderAlign', 'center'], result: ['report.simple.tableResultHeaderAlign', 'center'], flag: ['report.simple.tableFlagHeaderAlign', 'center'], unit: ['report.simple.tableUnitHeaderAlign', 'center'],
      reference_method: ['report.simple.tableReferenceMethodHeaderAlign', 'right'], reference: ['report.simple.tableReferenceHeaderAlign', 'right'], method: ['report.simple.tableMethodHeaderAlign', 'right']
    };
    const item = map[key] || ['', 'left'];
    const v = String(this.reportSetting(item[0], item[1]) || item[1]).toLowerCase();
    return v === 'center' ? 'center' : (v === 'right' ? 'right' : 'left');
  }

  protected reportTableColumnBodyAlign(key:string): 'left'|'center'|'right' {
    const map:any = {
      test_specimen: ['report.simple.tableTestSpecimenBodyAlign', 'left'], test: ['report.simple.tableTestBodyAlign', 'left'], specimen: ['report.simple.tableSpecimenBodyAlign', 'left'],
      result_flag: ['report.simple.tableResultFlagBodyAlign', 'center'], result: ['report.simple.tableResultBodyAlign', 'center'], flag: ['report.simple.tableFlagBodyAlign', 'center'], unit: ['report.simple.tableUnitBodyAlign', 'center'],
      reference_method: ['report.simple.tableReferenceMethodBodyAlign', 'right'], reference: ['report.simple.tableReferenceBodyAlign', 'right'], method: ['report.simple.tableMethodBodyAlign', 'right']
    };
    const item = map[key] || ['', 'left'];
    const v = String(this.reportSetting(item[0], item[1]) || item[1]).toLowerCase();
    return v === 'center' ? 'center' : (v === 'right' ? 'right' : 'left');
  }

  protected reportTableColumnBodyVerticalCenter(key:string): boolean {
    if (this.reportTableColumnBodyAlign(key) !== 'center') return false;
    const map:any = {
      test_specimen: ['report.simple.tableTestSpecimenBodyVerticalCenter', false], test: ['report.simple.tableTestBodyVerticalCenter', false], specimen: ['report.simple.tableSpecimenBodyVerticalCenter', false],
      result_flag: ['report.simple.tableResultFlagBodyVerticalCenter', true], result: ['report.simple.tableResultBodyVerticalCenter', true], flag: ['report.simple.tableFlagBodyVerticalCenter', true], unit: ['report.simple.tableUnitBodyVerticalCenter', true],
      reference_method: ['report.simple.tableReferenceMethodBodyVerticalCenter', false], reference: ['report.simple.tableReferenceBodyVerticalCenter', false], method: ['report.simple.tableMethodBodyVerticalCenter', false]
    };
    const item = map[key] || ['', false];
    return this.reportBool(item[0], item[1]);
  }

  protected reportTableBodyCellLineCount(cell:any): number {
    if (!cell) return 1;
    if (typeof cell.svg === 'string' && cell.svg) return 1;
    if (Array.isArray(cell.canvas) && cell.canvas.length) return 1;
    if (Array.isArray(cell.stack)) {
      return Math.max(1, cell.stack.reduce((total:number, part:any) => total + this.reportTableBodyCellLineCount(part), 0));
    }
    if (Array.isArray(cell.columns)) {
      return Math.max(1, ...cell.columns.map((part:any) => this.reportTableBodyCellLineCount(part)));
    }
    const text = cell.text == null ? '' : String(cell.text);
    return Math.max(1, text.split(/\r?\n/).length);
  }

  protected applyReportTableAlignmentDeep(cell:any, align:'left'|'center'|'right'): any {
    if (!cell || typeof cell !== 'object') return cell;
    if (cell._preserveReferenceAlignment) return cell;
    const next:any = { ...cell, alignment: align };
    if (Array.isArray(cell.stack)) next.stack = cell.stack.map((part:any) => this.applyReportTableAlignmentDeep(part, align));
    if (Array.isArray(cell.columns)) next.columns = cell.columns.map((part:any) => this.applyReportTableAlignmentDeep(part, align));
    return next;
  }

  /** Center drawn Flag SVG in-cell (pdfmake ignores alignment on svg in tables). */
  protected applyDrawnFlagGraphicsAlignment(cell:any, key:string, rowMaxLines = 1, cellLines = 1): any {
    const align = this.reportTableColumnBodyAlign(key);
    const w = Math.max(1, Number(cell.width) || 10);
    const h = Math.max(1, Number(cell.height) || w);
    const keys = this.reportTableColumnKeys();
    const widths = this.reportResultTableWidths(keys);
    const idx = keys.indexOf(key);
    const cellW = idx >= 0 ? Math.max(w, Number(widths[idx]) || w) : w;

    let left = 0;
    if (align === 'center') left = Math.max(0, (cellW - w) / 2);
    else if (align === 'right') left = Math.max(0, cellW - w);

    // Vertical middle even when body align is left/right — multi-line test rows
    // otherwise pin the arrow to the top of the Flag cell.
    let top = 0;
    const vCenter = key === 'flag'
      ? this.reportBool('report.simple.tableFlagBodyVerticalCenter', true)
      : (align === 'center' && this.reportTableColumnBodyVerticalCenter(key));
    if (vCenter) {
      const extraLines = Math.max(0, rowMaxLines - Math.max(1, cellLines));
      top = extraLines * this.reportNumber('report.simple.tableBodyVerticalCenterLineOffsetPt', 4.5, 0, 24);
    }

    if (typeof cell.svg === 'string' && cell.svg) {
      return { svg: cell.svg, width: w, height: h, margin: [left, top, 0, 0] };
    }
    return { ...cell, alignment: align, margin: [left, top, 0, 0] };
  }

  protected applyReportTableBodyAlignment(cell:any, key:string, rowMaxLines = 1, cellLines = 1): any {
    if (cell && typeof cell.svg === 'string' && cell.svg) {
      return this.applyDrawnFlagGraphicsAlignment(cell, key, rowMaxLines, cellLines);
    }
    if (cell && Array.isArray(cell.canvas) && cell.canvas.length) {
      return this.applyDrawnFlagGraphicsAlignment(cell, key, rowMaxLines, cellLines);
    }
    if (cell && cell.table && Array.isArray(cell.table.body)) {
      const first = cell.table.body?.[0]?.[0];
      if (first && Array.isArray(first.canvas) && first.canvas.length) {
        return { ...cell, alignment: this.reportTableColumnBodyAlign(key) };
      }
    }
    if (cell && Array.isArray(cell.columns) && cell.columns.some((c:any) => Array.isArray(c?.canvas) && c.canvas.length)) {
      return { ...cell, alignment: this.reportTableColumnBodyAlign(key) };
    }
    const align = this.reportTableColumnBodyAlign(key);
    const next:any = this.applyReportTableAlignmentDeep(cell, align);
    if (align === 'center' && this.reportTableColumnBodyVerticalCenter(key)) {
      const extraLines = Math.max(0, rowMaxLines - cellLines);
      const centerOffset = extraLines * this.reportNumber('report.simple.tableBodyVerticalCenterLineOffsetPt', 4.5, 0, 24);
      const margin = Array.isArray(next.margin) ? next.margin.slice(0, 4) : [0, 0, 0, 0];
      while (margin.length < 4) margin.push(0);
      margin[1] = (Number(margin[1]) || 0) + centerOffset;
      next.margin = margin;
      next.verticalAlignment = 'middle';
    }
    return next;
  }

  protected formatReportResultForDisplay(item:any, value:any): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    const roundMode = String(item?.rounding_mode || '').toUpperCase().replace(/[\s-]+/g, '_');
    if (roundMode === 'NO_TRANSFORM' || roundMode === 'NOTRANSFORM') return text;
    const type = String(item?.result_data_type || '').toUpperCase();
    if (type !== 'NUMBER' && type !== 'CALCULATED') return text;
    const n = Number(text.replace(/,/g, ''));
    if (!Number.isFinite(n)) return text;
    const decimals = text.includes('.') ? text.split('.').pop()?.length || 0 : 0;
    const fixed = n.toFixed(decimals);
    const fmt = String(item?.number_format || 'NONE').toUpperCase();
    if (fmt === 'INDIAN') {
      const [intPart, dec] = fixed.split('.');
      const sign = intPart.startsWith('-') ? '-' : '';
      const x = intPart.replace('-', '');
      const last3 = x.slice(-3);
      const rest = x.slice(0, -3);
      const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
      return sign + grouped + (dec !== undefined ? '.' + dec : '');
    }
    if (fmt === 'WESTERN') return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return fixed;
  }

  protected reportReferenceText(item:any): string {
    const source = String(this.reportSetting('report.simple.referenceSource', 'saved') || 'saved').toLowerCase();
    if (source === 'generated_only') {
      return String(item?.generated_reference || item?.generated_normal_range || item?.selected_reference_text || item?.reference_text || item?.normal_range || '').trim();
    }
    return item?.normal_range ? String(item.normal_range) : '';
  }

  protected referenceLineParts(line:string): { label:string; value:string } | null {
    const text = String(line ?? '').trim();
    if (!text) return null;
    const index = text.indexOf(':');
    if (index <= 0) return null;
    const label = text.slice(0, index).trim();
    const value = text.slice(index + 1).trim();
    if (!label || !value) return null;
    return { label, value };
  }

  protected buildReferencePdfNode(referenceText:any, margin:any[] = [0,0,0,0], outerAlign:'left'|'center'|'right' = 'left'): any {
    const align = outerAlign === 'center' ? 'center' : (outerAlign === 'right' ? 'right' : 'left');
    const text = String(referenceText ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!text) return { text:'', style:'refMain', alignment:align, margin, _preserveReferenceAlignment:true };

    const lines = text.split('\n').map(line => line.trimEnd()).filter(line => line.trim().length > 0);
    const hasAlignedLines = lines.some(line => !!this.referenceLineParts(line));
    if (!hasAlignedLines) return { text, style:'refMain', alignment:align, margin, _preserveReferenceAlignment:true };

    const body = lines.map(line => {
      const parts = this.referenceLineParts(line);
      if (!parts) {
        return [
          { text:line.trim(), style:'refMain', colSpan:3, alignment:'left', margin:[0,1,0,1] },
          {},
          {}
        ];
      }
      return [
        { text:parts.label, style:'refMain', alignment:'left', noWrap:true, margin:[0,1,1,1] },
        { text:':', style:'refMain', alignment:'center', noWrap:true, margin:[1,1,1,1] },
        { text:parts.value, style:'refMain', alignment:'left', margin:[1,1,0,1] }
      ];
    });

    const tableNode:any = {
      table: {
        // Intrinsic-width table keeps label / colon / value aligned.
        widths: ['auto', 4, 'auto'],
        body
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0
      },
      margin:[0,0,0,0]
    };

    // pdfmake does not reliably move table nodes with `alignment` in every output path.
    // Wrap the intrinsic-width pretty table in columns so final exported/printed PDFs
    // match the report-settings alignment exactly like preview.
    if (align === 'right') {
      return { columns:[{ text:'' }, tableNode], widths:['*', 'auto'], columnGap:0, margin, _preserveReferenceAlignment:true };
    }
    if (align === 'center') {
      return { columns:[{ text:'' }, tableNode, { text:'' }], widths:['*', 'auto', '*'], columnGap:0, margin, _preserveReferenceAlignment:true };
    }
    return { ...tableNode, margin, _preserveReferenceAlignment:true };
  }

  protected reportResultTableWidths(keys?: string[]): any[] {
    const columns = keys && keys.length ? keys : this.reportTableColumnKeys();
    const physicalAvailable = this.reportAvailableWidthPt();
    const legacyPtToMm = (key: string, fallbackPt: number) => this.reportNumber(key, fallbackPt, 0, 40) / 2.8346456693;
    const padLeft = this.mmToPt(this.reportNumber('report.simple.tablePaddingLeftMm', legacyPtToMm('report.simple.tablePaddingLeft', 6), 0, 20));
    const padRight = this.mmToPt(this.reportNumber('report.simple.tablePaddingRightMm', legacyPtToMm('report.simple.tablePaddingRight', 6), 0, 20));
    const border = this.reportNumber('report.simple.tableBorderWidth', this.reportNumber('report.simple.tableLineWidth', 0.3, 0, 5), 0, 5);
    const totalPaddingAndBorders = ((padLeft + padRight) * columns.length) + (border * (columns.length + 1)) + 4;
    const available = Math.max(180, physicalAvailable - totalPaddingAndBorders);
    const pcts = columns.map(k => this.reportTableColumnWidthPct(k));
    const sum = Math.max(1, pcts.reduce((a,b)=>a+b, 0));
    const widths = pcts.map(p => Math.max(8, Math.floor((available * p / sum) * 100) / 100));
    const correction = available - widths.reduce((a, b) => a + b, 0);
    if (widths.length) widths[widths.length - 1] = Math.max(8, Math.floor((widths[widths.length - 1] + correction) * 100) / 100);
    return widths;
  }


}
