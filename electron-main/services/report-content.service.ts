import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
const PdfPrinter = require('pdfmake');
type ReportAlignment = 'left' | 'center' | 'right';
import { BrowserWindow, shell } from 'electron';
import { ReportLayoutService } from './report-layout.service';

export abstract class ReportContentService extends ReportLayoutService {  protected normalizeReportIdList(primaryId:number, options:any = {}): number[] {
    const raw = Array.isArray(options?.report_ids) ? options.report_ids : [];
    const ids = [primaryId, ...raw].map((x:any)=>+x || 0).filter((x:number)=>x>0);
    return Array.from(new Set(ids));
  }

  protected finalReportItemsForApprovedOutput(reports:any[], options:any = {}): any[] {
    const showProfileName = options?.show_profile_name !== false;
    const approvedOnly = options?.approved_only !== false;
    const itemMap = new Map<string, any>();
    for (const rpt of reports) {
      for (const item of (rpt?.items || [])) {
        if (!item?.test_id) continue;
        if (item.selected_for_reporting === false || +item.selected_for_reporting === 0) continue;
        if (approvedOnly) {
          const status = String(item.result_status || '').toUpperCase();
          const value = String(item.result_value || '').trim();
          if (status !== 'APPROVED' && String(rpt?.status || '').toUpperCase() !== 'APPROVED' && !value) continue;
        }
        const key = String(item.id || `${item.test_id}|${item.source_profile_id || ''}|${item.source_profile_name || ''}|${item.result_value || ''}`);
        if (!itemMap.has(key)) itemMap.set(key, {...item});
      }
    }
    const tests = Array.from(itemMap.values()).sort((a:any,b:any)=>{
      const ag = +(a.group_order_override ?? a.priority ?? 0);
      const bg = +(b.group_order_override ?? b.priority ?? 0);
      if (ag !== bg) return ag - bg;
      const ar = +(a.report_order_override ?? a.priority ?? 0);
      const br = +(b.report_order_override ?? b.priority ?? 0);
      if (ar !== br) return ar - br;
      return (+a.id || 0) - (+b.id || 0);
    });

    // Merge only. Do NOT apply single_test_placement here — dumping all singles to
    // the top (or bottom) poisons department first-occurrence order used later by
    // normalizeReportItemsForPdf. That function owns TOP/end within each department.
    const rows:any[] = [];
    const seenProfiles = new Set<string>();
    for (const t of tests) {
      const profileName = String(t.source_profile_name || '').trim();
      const profileId = +(t.source_profile_id || 0) || 0;
      if (profileName) {
        const key = `${profileId}|${profileName}`;
        if (showProfileName && !seenProfiles.has(key)) {
          seenProfiles.add(key);
          rows.push({
            test_id: null,
            test_name: profileName,
            heading_kind: 'PROFILE',
            source_profile_id: profileId,
            source_profile_name: profileName,
            department_name: t.department_name,
            profile_interpretation_enabled: t.profile_interpretation_enabled,
            profile_interpretation_text: t.profile_interpretation_text,
            group_order_override: t.group_order_override,
            priority: t.priority
          });
        }
      }
      rows.push({ ...t, heading_kind: '', test_name: t.test_name || t.name || 'Test' });
    }
    return rows;
  }

  protected reportPdfProfileKey(item:any): string {
    const name = String(item?.source_profile_name || item?.profile_name || '').trim();
    const id = +(item?.source_profile_id || item?.profile_id || 0) || 0;
    if (!name && !id) return '';
    return `${id}|${name || 'Profile'}`;
  }

  protected reportPdfDepartmentName(item:any, fallback = ''): string {
    return String(item?.department_name || item?.department || item?.dept_name || fallback || '').trim();
  }

  protected reportPdfProfileDepartmentName(item:any): string {
    const direct = this.reportPdfDepartmentName(item, '');
    if (direct) return direct;
    const profileId = +(item?.source_profile_id || item?.profile_id || 0) || 0;
    if (!profileId) return '';
    const db = (this.db as any).db;
    if (!db?.prepare) return '';
    try {
      const row = db.prepare(`SELECT TRIM(COALESCE(d.name,'')) department_name
        FROM profiles p LEFT JOIN departments d ON d.id=p.department_id
        WHERE p.id=? LIMIT 1`).get(profileId) as any;
      return String(row?.department_name || '').trim();
    } catch {
      return '';
    }
  }

  protected reportPdfProfileItemOrder(item:any): number | null {
    const profileId = +(item?.source_profile_id || item?.profile_id || 0) || 0;
    if (!profileId) return null;
    const db = (this.db as any).db;
    if (!db?.prepare) return null;
    try {
      const testId = +(item?.test_id || 0) || 0;
      if (testId) {
        const row = db.prepare(`SELECT priority FROM profile_items
          WHERE profile_id=? AND UPPER(COALESCE(item_type,'TEST'))='TEST' AND test_id=?
          ORDER BY priority,id LIMIT 1`).get(profileId, testId) as any;
        const n = Number(row?.priority);
        return Number.isFinite(n) ? n : null;
      }
      const kind = String(item?.heading_kind || '').toUpperCase();
      if (kind === 'INNER') {
        const text = String(item?.test_name || item?.side_header || item?.header_text || '').trim();
        if (!text) return null;
        const row = db.prepare(`SELECT priority FROM profile_items
          WHERE profile_id=? AND UPPER(COALESCE(item_type,''))='HEADER'
            AND (TRIM(COALESCE(side_header,''))=? OR TRIM(COALESCE(header_text,''))=?)
          ORDER BY priority,id LIMIT 1`).get(profileId, text, text) as any;
        const n = Number(row?.priority);
        return Number.isFinite(n) ? n : null;
      }
    } catch { /* keep existing stored order if master lookup fails */ }
    return null;
  }

  /**
   * Build the exact PDF print order from the existing report row order.
   *
   * Report body has three logical levels:
   *   1. Department heading
   *   2. Profile/group heading
   *   3. Optional sub-heading/test rows
   *
   * Profiles and single tests are intentionally rendered as separate areas.
   * - Profile area: department heading -> all profiles for that department.
   * - Single-test area: department heading -> all single tests for that department.
   *
   * If the same department contains both profiles and single tests, the department
   * heading appears once in the profile area and once again in the single-test area.
   * Ordering is not alphabetical and not hard-coded; it follows the first occurrence
   * in the report rows already returned by the DB/query.
   */
  protected normalizeReportItemsForPdf(items:any[], options:any = {}): any[] {
    const rows = Array.isArray(items) ? items : [];
    const showProfileName = options?.show_profile_name !== false;
    const showSubHeader = options?.show_sub_header !== false;
    const singlePlacement = String(options?.single_test_placement || 'DEPARTMENT').toUpperCase();

    const profileMeta = new Map<string, any>();
    const profileGroups = new Map<string, any>();
    const singleGroups = new Map<string, any>();

    const ensureProfile = (key:string, seed:any = {}, order = 0) => {
      if (!key) return null;
      const meta = profileMeta.get(key) || {};
      if (!profileGroups.has(key)) {
        const sourceName = String(seed?.source_profile_name || seed?.profile_name || meta.name || seed?.test_name || 'Profile').trim() || 'Profile';
        profileGroups.set(key, {
          key,
          order,
          name: sourceName,
          department: this.reportPdfProfileDepartmentName(seed),
          profile_interpretation_enabled: seed?.profile_interpretation_enabled ?? meta.profile_interpretation_enabled,
          profile_interpretation_text: seed?.profile_interpretation_text ?? meta.profile_interpretation_text,
          items: []
        });
      }
      const g = profileGroups.get(key);
      if (order < g.order) g.order = order;
      const seedName = String(seed?.source_profile_name || seed?.profile_name || seed?.test_name || meta.name || '').trim();
      if (seedName && (!g.name || g.name === 'Profile')) g.name = seedName;
      const dept = this.reportPdfProfileDepartmentName(seed);
      if (dept && !g.department) g.department = dept;
      if (!g.profile_interpretation_text && (seed?.profile_interpretation_text || meta.profile_interpretation_text)) {
        g.profile_interpretation_text = seed?.profile_interpretation_text || meta.profile_interpretation_text;
      }
      if (seed?.profile_interpretation_enabled !== undefined || meta.profile_interpretation_enabled !== undefined) {
        g.profile_interpretation_enabled = seed?.profile_interpretation_enabled ?? meta.profile_interpretation_enabled;
      }
      return g;
    };

    const ensureSingleDepartment = (dept:string, order:number) => {
      const key = String(dept || '').trim();
      if (!singleGroups.has(key)) singleGroups.set(key, { key, order, items: [] });
      const g = singleGroups.get(key);
      if (order < g.order) g.order = order;
      return g;
    };

    rows.forEach((raw:any, index:number) => {
      const item = { ...raw, _report_source_order: index };
      const profileItemOrder = this.reportPdfProfileItemOrder(item);
      if (profileItemOrder !== null) item._profile_item_order = profileItemOrder;
      const kind = String(item.heading_kind || '').toUpperCase();
      const profileKey = this.reportPdfProfileKey(item);

      if (!item.test_id) {
        if (kind === 'PROFILE') {
          const key = profileKey || `0|${String(item.test_name || item.source_profile_name || 'Profile').trim()}`;
          const meta = {
            name: String(item.test_name || item.source_profile_name || 'Profile').trim() || 'Profile',
            profile_interpretation_enabled: item.profile_interpretation_enabled,
            profile_interpretation_text: item.profile_interpretation_text
          };
          profileMeta.set(key, meta);
          ensureProfile(key, item, index);
          return;
        }

        // Preserve inner/sub-headings only when they belong to a profile. Department
        // headings for singles are rebuilt below from the single tests themselves.
        if (kind === 'INNER' && profileKey && showSubHeader) {
          const g = ensureProfile(profileKey, item, index);
          if (g) g.items.push(item);
        }
        return;
      }

      if (profileKey) {
        const g = ensureProfile(profileKey, item, index);
        if (g) g.items.push(item);
      } else {
        const dept = this.reportPdfDepartmentName(item, '');
        ensureSingleDepartment(dept, index).items.push(item);
      }
    });

    const byOrder = (a:any, b:any) => {
      const apo = a._profile_item_order;
      const bpo = b._profile_item_order;
      if (apo !== undefined || bpo !== undefined) {
        const av = apo !== undefined ? +apo : +(a._report_source_order ?? a.order ?? 0);
        const bv = bpo !== undefined ? +bpo : +(b._report_source_order ?? b.order ?? 0);
        if (av !== bv) return av - bv;
      }
      const ao = +(a._report_source_order ?? a.order ?? 0);
      const bo = +(b._report_source_order ?? b.order ?? 0);
      if (ao !== bo) return ao - bo;
      return (+a.id || 0) - (+b.id || 0);
    };

    const sortedProfiles = Array.from(profileGroups.values())
      .filter((g:any) => g.items.some((x:any) => x.test_id))
      .sort((a:any,b:any) => a.order - b.order);
    sortedProfiles.forEach((g:any) => {
      if (!g.department) {
        const firstDept = (g.items || []).map((x:any) => this.reportPdfDepartmentName(x, '')).find((x:string) => !!x);
        if (firstDept) g.department = firstDept;
      }
      g.department = String(g.department || '').trim();
      g.items.sort(byOrder);
    });

    const profileDeptOrder:string[] = [];
    for (const g of sortedProfiles) {
      if (!profileDeptOrder.includes(g.department)) profileDeptOrder.push(g.department);
    }

    const sortedSingleDepartments = Array.from(singleGroups.values())
      .filter((g:any) => g.items.some((x:any) => x.test_id))
      .sort((a:any,b:any) => a.order - b.order);
    sortedSingleDepartments.forEach((g:any) => g.items.sort(byOrder));

    const out:any[] = [];
    const pushDepartment = (dept:string) => {
      const name = String(dept || '').trim();
      if (name) out.push({ test_id:null, test_name:name, heading_kind:'DEPARTMENT' });
    };
    const pushProfilesForDepartment = (dept:string) => {
      for (const g of sortedProfiles.filter((x:any) => x.department === dept)) {
        if (showProfileName) {
          out.push({
            test_id:null,
            test_name:g.name,
            heading_kind:'PROFILE',
            source_profile_name:g.name,
            profile_interpretation_enabled:g.profile_interpretation_enabled,
            profile_interpretation_text:g.profile_interpretation_text
          });
        }
        out.push(...g.items);
      }
    };
    const pushSinglesForDepartment = (dept:string) => {
      const group = sortedSingleDepartments.find((x:any) => x.key === dept);
      if (group) out.push(...group.items);
    };

    // Department order is always the outer ordering rule.  The "single tests above
    // profiles" option only changes the order inside the same department; it must
    // never move a BIOCHEMISTRY single test above a HEMATOLOGY department/profile.
    const departmentOrder:string[] = [];
    const addDepartment = (dept:string) => {
      const key = String(dept || '').trim();
      if (!departmentOrder.includes(key)) departmentOrder.push(key);
    };
    for (const g of [...sortedProfiles, ...sortedSingleDepartments].sort((a:any, b:any) => (a.order || 0) - (b.order || 0))) {
      addDepartment(g.department || g.key || '');
    }

    for (const dept of departmentOrder) {
      pushDepartment(dept);
      if (singlePlacement === 'TOP') {
        pushSinglesForDepartment(dept);
        pushProfilesForDepartment(dept);
      } else {
        pushProfilesForDepartment(dept);
        pushSinglesForDepartment(dept);
      }
    }

    return out;
  }


  protected reportExportDir() {
    const configured = String(this.db.getSetting('report.export.path', '') || '').trim();
    const dir = configured || this.db.reportsDir;
    try { fs.mkdirSync(dir, { recursive: true }); return dir; } catch { return this.db.reportsDir; }
  }

  protected reportTempDir() {
    const dir = path.join(os.tmpdir(), 'lims-report-pdf-temp');
    try { fs.mkdirSync(dir, { recursive: true }); return dir; } catch { return this.db.reportsDir; }
  }

  protected cleanupOldTempReportPdfs() {
    const dir = this.reportTempDir();
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    try {
      for (const fileName of fs.readdirSync(dir)) {
        if (!/^report-temp-.*\.pdf$/i.test(fileName)) continue;
        const file = path.join(dir, fileName);
        try { if (fs.statSync(file).mtimeMs < cutoff) fs.unlinkSync(file); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  }


}
