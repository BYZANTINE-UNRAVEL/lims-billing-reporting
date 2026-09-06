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

  protected reportPdfInnerHeaderKey(item:any): string {
    const profileId = +(item?.source_profile_id || item?.profile_id || 0) || 0;
    const profileName = String(item?.source_profile_name || item?.profile_name || '').trim().toLowerCase();
    const text = String(item?.test_name || item?.side_header || item?.header_text || '').trim().toLowerCase();
    return `${profileId}|${profileName}|${text}`;
  }

  /**
   * Merge helper for singles only:
   * - NEVER rewrite report_order_override (typing ↑↓ / Masters value already saved)
   * - Only unify group_order so items from different finish batches sort together
   *   by their saved report_order_override.
   */
  protected unifyMergedSingleGroupOrders(items:any[]) {
    if (!Array.isArray(items) || !items.length) return;
    const singles = items.filter((item:any) =>
      item?.test_id
      && !(+(item.source_profile_id || 0))
      && !String(item.source_profile_name || '').trim()
    );
    const byDept = new Map<string, any[]>();
    for (const item of singles) {
      const dept = String(item.department_name || '').trim().toLowerCase() || '_';
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept)!.push(item);
    }
    for (const rows of byDept.values()) {
      const existingGroups = rows
        .map((x:any) => +(x.group_order_override ?? Number.NaN))
        .filter((n:number) => Number.isFinite(n));
      // Shared card-within value for singles in this department (legacy *10000 → within).
      const shared = existingGroups.length
        ? Math.min(...existingGroups.map((n) => (Math.abs(n) >= 10000 ? Math.abs(n) % 10000 : n)))
        : 5000;
      for (const item of rows) item.group_order_override = shared;
    }
  }

  protected finalReportItemsForApprovedOutput(reports:any[], options:any = {}): any[] {
    const showProfileName = options?.show_profile_name !== false;
    const showSubHeader = options?.show_sub_header !== false;
    const approvedOnly = options?.approved_only !== false;
    const itemMap = new Map<string, any>();
    const innerMap = new Map<string, any>();
    for (const rpt of reports) {
      for (const item of (rpt?.items || [])) {
        if (!item?.test_id) {
          // Keep profile-layout HEADER rows (INNER). PROFILE/DEPARTMENT headings are rebuilt below.
          const kind = String(item.heading_kind || '').toUpperCase();
          if (kind === 'INNER' && showSubHeader) {
            // Dedupe by profile + header text — not row id. Partial finishes of the same bill
            // each copy "Macroscopic Examination"; merge must not print it twice (e.g. around Colour).
            const key = this.reportPdfInnerHeaderKey(item);
            if (!key.endsWith('|')) {
              const existing = innerMap.get(key);
              const nextOrder = +(item.report_order_override ?? item.priority ?? 0);
              const prevOrder = existing ? +(existing.report_order_override ?? existing.priority ?? 0) : Number.POSITIVE_INFINITY;
              if (!existing || nextOrder < prevOrder) {
                innerMap.set(key, { ...item, heading_kind: 'INNER', test_id: null, test_name: item.test_name || item.side_header || item.header_text || 'Header' });
              }
            }
          }
          continue;
        }
        if (item.selected_for_reporting === false || +item.selected_for_reporting === 0) continue;
        if (approvedOnly) {
          const status = String(item.result_status || '').toUpperCase();
          const value = String(item.result_value || '').trim();
          if (status !== 'APPROVED' && String(rpt?.status || '').toUpperCase() !== 'APPROVED' && !value) continue;
        }
        // Prefer stable test identity across partial finished reports of the same bill.
        const key = String(`${item.test_id}|${item.source_profile_id || ''}|${item.source_profile_name || ''}`);
        if (!itemMap.has(key)) {
          const row = { ...item };
          const profileId = +(item.source_profile_id || 0) || 0;
          const profileName = String(item.source_profile_name || '').trim().toLowerCase();
          // Partial finishes can encode different card orders for the same profile
          // (Colour finished later). Keep one group_order so Colour stays with Macroscopic.
          if (profileId || profileName) {
            for (const existing of itemMap.values()) {
              const eid = +(existing.source_profile_id || 0) || 0;
              const ename = String(existing.source_profile_name || '').trim().toLowerCase();
              if ((profileId && eid === profileId) || (profileName && ename === profileName)) {
                if (existing.group_order_override != null && existing.group_order_override !== '') {
                  row.group_order_override = existing.group_order_override;
                }
                break;
              }
            }
          }
          itemMap.set(key, row);
        }
      }
    }
    // Align INNER headers to the same profile card order as their tests.
    for (const [ikey, inner] of innerMap.entries()) {
      const profileId = +(inner.source_profile_id || 0) || 0;
      const profileName = String(inner.source_profile_name || '').trim().toLowerCase();
      for (const test of itemMap.values()) {
        const tid = +(test.source_profile_id || 0) || 0;
        const tname = String(test.source_profile_name || '').trim().toLowerCase();
        if ((profileId && tid === profileId) || (profileName && tname === profileName)) {
          if (test.group_order_override != null && test.group_order_override !== '') {
            inner.group_order_override = test.group_order_override;
          }
          break;
        }
      }
      innerMap.set(ikey, inner);
    }
    const tests = Array.from(itemMap.values());
    // Do not rewrite report_order_override here — that fights typing ↑↓ saves.
    // Only align group_order so multi-finish singles can sort by saved report order.
    if ((reports || []).length > 1) this.unifyMergedSingleGroupOrders(tests);
    // Repair legacy ↑↓ 10/20/30 so later Masters finishes (e.g. PP=2000) interleave.
    this.remapDenseSingleOverridesForPdf(tests);
    const inners = Array.from(innerMap.values());
    const mixed = [...tests, ...inners].sort((a:any,b:any)=>{
      const ag = +(a.group_order_override ?? a.priority ?? 0);
      const bg = +(b.group_order_override ?? b.priority ?? 0);
      if (ag !== bg) return ag - bg;
      const ar = +(a.report_order_override ?? a.priority ?? 0);
      const br = +(b.report_order_override ?? b.priority ?? 0);
      if (ar !== br) return ar - br;
      // Keep INNER before a test when orders tie and INNER was earlier in source.
      const ak = a.test_id ? 1 : 0;
      const bk = b.test_id ? 1 : 0;
      if (ak !== bk) return ak - bk;
      return (+a.id || 0) - (+b.id || 0);
    });

    // Merge only. Do NOT apply single_test_placement here — dumping all singles to
    // the top (or bottom) poisons department first-occurrence order used later by
    // normalizeReportItemsForPdf. That function owns TOP/end within each department.
    const rows:any[] = [];
    const seenProfiles = new Set<string>();
    for (const t of mixed) {
      const profileName = String(t.source_profile_name || '').trim();
      const profileId = +(t.source_profile_id || 0) || 0;
      if (profileName) {
        const key = `${profileId}|${profileName}`;
        if (showProfileName && !this.isMixedProfileMaster(profileId) && !seenProfiles.has(key)) {
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
            report_order_override: t.report_order_override,
            priority: t.priority
          });
        }
      }
      if (!t.test_id) {
        rows.push({
          ...t,
          heading_kind: 'INNER',
          test_id: null,
          test_name: t.test_name || t.side_header || t.header_text || 'Header'
        });
      } else {
        rows.push({ ...t, heading_kind: '', test_name: t.test_name || t.name || 'Test' });
      }
    }
    return rows;
  }

  protected reportPdfProfileKey(item:any): string {
    const name = String(item?.source_profile_name || item?.profile_name || '').trim();
    const id = +(item?.source_profile_id || item?.profile_id || 0) || 0;
    if (!name && !id) return '';
    return `${id}|${name || 'Profile'}`;
  }

  /** Masters profile with no department (Mixed / multi-dept package). */
  protected isMixedProfileMaster(profileId: number): boolean {
    const id = +profileId || 0;
    if (!id) return false;
    try {
      const db = (this as any).db?.db || (this as any).db;
      if (!db?.prepare) return false;
      const row = db.prepare('SELECT department_id, show_profile_name FROM profiles WHERE id=? LIMIT 1').get(id) as any;
      if (!row) return false;
      const deptId = +(row.department_id || 0) || 0;
      return deptId <= 0;
    } catch {
      return false;
    }
  }

  protected mixedProfileMasterShowsName(profileId: number): boolean {
    const id = +profileId || 0;
    if (!id) return false;
    try {
      const db = (this as any).db?.db || (this as any).db;
      if (!db?.prepare) return false;
      const row = db.prepare('SELECT show_profile_name, display_name, name FROM profiles WHERE id=? LIMIT 1').get(id) as any;
      if (!row) return false;
      return Number(row.show_profile_name ?? 1) !== 0;
    } catch {
      return false;
    }
  }

  protected mixedProfilePrintName(profileId: number, fallback = ''): string {
    const id = +profileId || 0;
    const fb = String(fallback || '').trim();
    if (!id) return fb || 'Profile';
    try {
      const db = (this as any).db?.db || (this as any).db;
      if (!db?.prepare) return fb || 'Profile';
      const row = db.prepare('SELECT display_name, name FROM profiles WHERE id=? LIMIT 1').get(id) as any;
      return String(row?.display_name || row?.name || fb || 'Profile').trim() || 'Profile';
    } catch {
      return fb || 'Profile';
    }
  }

  /**
   * Mixed package titles: print once at the start of the PDF body (before departments).
   * PDF-only — does not change report typing / saved item order.
   */
  protected collectMixedPackageHeaders(items: any[], showProfileName: boolean): any[] {
    if (!showProfileName || !Array.isArray(items)) return [];
    const seen = new Set<number>();
    const out: any[] = [];
    for (const item of items) {
      const id = +(item?.source_profile_id || 0) || 0;
      if (!id || seen.has(id)) continue;
      if (!this.isMixedProfileMaster(id)) continue;
      if (!this.mixedProfileMasterShowsName(id)) continue;
      // Need at least one printable test for this package (or a PROFILE heading row).
      const hasTest = items.some((x:any) => +x?.test_id && +(x.source_profile_id || 0) === id
        && !(x.selected_for_reporting === false || +x.selected_for_reporting === 0));
      const isHeading = !item?.test_id && String(item?.heading_kind || '').toUpperCase() === 'PROFILE'
        && +(item?.source_profile_id || 0) === id;
      if (!hasTest && !isHeading) continue;
      seen.add(id);
      const name = this.mixedProfilePrintName(id, String(item?.source_profile_name || item?.test_name || '').trim());
      out.push({
        test_id: null,
        test_name: name,
        heading_kind: 'PROFILE',
        source_profile_id: id,
        source_profile_name: name,
        department_name: '',
        mixed_package_header: 1
      });
    }
    return out;
  }

  protected profileIdFromKeyOrItems(profile: { key?: string; items?: any[]; name?: string }): number {
    const fromKey = +(String(profile?.key || '').split('|')[0] || 0) || 0;
    if (fromKey) return fromKey;
    const hit = (profile?.items || []).find((i:any) => +(i?.source_profile_id || 0));
    return +(hit?.source_profile_id || 0) || 0;
  }

  protected reportPdfDepartmentName(item:any, fallback = ''): string {
    return String(item?.department_name || item?.department || item?.dept_name || fallback || '').trim();
  }

  /**
   * Typed PDF department/card order:
   * prefer saved group_order_override (typing reorder), then Masters department.priority.
   */
  protected reportPdfDepartmentSortKey(item:any): number {
    const go = item?.group_order_override;
    if (go != null && go !== '' && Number.isFinite(+go)) return +go;
    const name = this.reportPdfDepartmentName(item, '');
    if (name) {
      try {
        const db = (this.db as any)?.db || (this as any).db;
        if (db?.prepare) {
          const row = db.prepare(`SELECT priority FROM departments WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1`).get(name) as any;
          if (row?.priority != null && row?.priority !== '') return +row.priority;
        }
      } catch { /* ignore */ }
    }
    const dp = item?.department_priority;
    if (dp != null && dp !== '' && Number.isFinite(+dp)) return +dp;
    return +(item?.priority ?? 9999);
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
   *
   * Quick Reporting (order_mode=TYPED) preserves department/item overrides from
   * report typing instead of re-sorting by master profile_items priority.
   */
  protected normalizeReportItemsForPdf(items:any[], options:any = {}): any[] {
    if (String(options?.order_mode || '').toUpperCase() === 'TYPED') {
      return this.normalizeTypedReportItemsForPdf(items, options);
    }
    const rows = (Array.isArray(items) ? items : [])
      .filter((x:any) => !(x?.selected_for_reporting === false || +x?.selected_for_reporting === 0));
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
          if (g) {
            const ik = this.reportPdfInnerHeaderKey(item);
            const already = (g.items || []).some((x:any) => !x.test_id && String(x.heading_kind || '').toUpperCase() === 'INNER' && this.reportPdfInnerHeaderKey(x) === ik);
            if (!already) g.items.push(item);
          }
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
      .sort((a:any,b:any) => {
        if (a.order !== b.order) return a.order - b.order;
        const minRO = (g:any) => {
          const vals = (g.items || []).map((x:any) => +(x.report_order_override ?? x.priority ?? x._report_source_order ?? 0));
          return vals.length ? Math.min(...vals) : Number.POSITIVE_INFINITY;
        };
        const rd = minRO(a) - minRO(b);
        if (rd) return rd;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
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
    // Mixed package name once, before any department — PDF only.
    out.push(...this.collectMixedPackageHeaders(rows, showProfileName));
    const pushDepartment = (dept:string) => {
      const name = String(dept || '').trim();
      if (!name) return;
      out.push({
        test_id: null,
        test_name: name,
        heading_kind: 'DEPARTMENT',
        department_name: name,
        department_id: this.departmentIdByName(name) || null
      });
    };
    /** Mixed packages span departments: only emit rows that belong to this department. */
    const profileItemsForDepartment = (g:any, dept:string, isMixed:boolean) => {
      const items = Array.isArray(g?.items) ? g.items : [];
      if (!isMixed) return g.department === dept ? items : [];
      return items.filter((i:any) => {
        const itemDept = this.reportPdfDepartmentName(i, '');
        if (i?.test_id) return itemDept === dept;
        // Inner headings without a department follow the surrounding mixed package section.
        return !itemDept || itemDept === dept;
      });
    };
    const pushProfilesForDepartment = (dept:string) => {
      for (const g of sortedProfiles) {
        const profileId = this.profileIdFromKeyOrItems(g);
        const isMixed = this.isMixedProfileMaster(profileId);
        if (!isMixed && g.department !== dept) continue;
        const items = profileItemsForDepartment(g, dept, isMixed);
        if (!items.some((i:any) => i?.test_id)) continue;
        // Mixed package title is already printed once at the top — do not repeat under a department.
        if (showProfileName && !isMixed) {
          out.push({
            test_id:null,
            test_name:g.name,
            heading_kind:'PROFILE',
            source_profile_id: profileId || null,
            source_profile_name:g.name,
            department_name: dept,
            profile_interpretation_enabled:g.profile_interpretation_enabled,
            profile_interpretation_text:g.profile_interpretation_text
          });
        }
        out.push(...items);
      }
    };
    const pushSinglesForDepartment = (dept:string) => {
      const group = sortedSingleDepartments.find((x:any) => x.key === dept);
      if (group) out.push(...group.items);
    };

    // Department order is always the outer ordering rule.  The "single tests above
    // profiles" option only changes the order inside the same department; it must
    // never move a BIOCHEMISTRY single test above a HEMATOLOGY department/profile.
    // Mixed multi-dept packages contribute every department their tests belong to.
    const departmentOrder:string[] = [];
    const addDepartment = (dept:string) => {
      const key = String(dept || '').trim();
      if (key && !departmentOrder.includes(key)) departmentOrder.push(key);
    };
    const orderedSources = [
      ...sortedProfiles.map((g:any) => ({ kind: 'profile' as const, g, order: +g.order || 0 })),
      ...sortedSingleDepartments.map((g:any) => ({ kind: 'single' as const, g, order: +g.order || 0 }))
    ].sort((a, b) => (a.order - b.order));
    for (const src of orderedSources) {
      if (src.kind === 'single') {
        addDepartment(src.g.key || src.g.department || '');
        continue;
      }
      const profileId = this.profileIdFromKeyOrItems(src.g);
      if (this.isMixedProfileMaster(profileId)) {
        for (const item of src.g.items || []) {
          if (!item?.test_id) continue;
          addDepartment(this.reportPdfDepartmentName(item, ''));
        }
      } else {
        addDepartment(src.g.department || '');
      }
    }

    for (const dept of departmentOrder) {
      const hasProfiles = sortedProfiles.some((g:any) => {
        const profileId = this.profileIdFromKeyOrItems(g);
        const isMixed = this.isMixedProfileMaster(profileId);
        return profileItemsForDepartment(g, dept, isMixed).some((i:any) => i?.test_id);
      });
      const hasSingles = sortedSingleDepartments.some((x:any) => x.key === dept && (x.items || []).some((i:any) => i?.test_id));
      pushDepartment(dept);
      if (singlePlacement === 'TOP') {
        pushSinglesForDepartment(dept);
        pushProfilesForDepartment(dept);
      } else {
        pushProfilesForDepartment(dept);
        // Singles at end: repeat department heading before the single-test block.
        if (hasProfiles && hasSingles) pushDepartment(dept);
        pushSinglesForDepartment(dept);
      }
    }

    return out;
  }

  /** Resolve Masters department id from a display name (for PDF page-break flags). */
  protected departmentIdByName(name: string): number {
    const key = String(name || '').trim().toLowerCase();
    if (!key) return 0;
    try {
      const rows: any[] = this.db.listDepartments ? this.db.listDepartments(false) : [];
      const hit = rows.find((d: any) => String(d?.name || '').trim().toLowerCase() === key);
      return +(hit?.id || 0) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * ↑↓ used to rewrite singles to 10/20/30, which pushed later Masters-scale
   * finishes (e.g. Postprandial=2000) to the bottom of the PDF. Remap those
   * dense overrides onto each test's Masters report_order while keeping the
   * typing visual rank. Non-dense rows (true Masters values) stay as-is.
   */
  protected remapDenseSingleOverridesForPdf(items:any[]) {
    if (!Array.isArray(items) || !items.length) return;
    const isSingle = (x:any) =>
      !!x?.test_id
      && !(+(x.source_profile_id || 0))
      && !String(x.source_profile_name || '').trim();
    const masterOf = (x:any) => {
      const m = +(x.master_report_order ?? Number.NaN);
      if (Number.isFinite(m) && m > 0) return m;
      try {
        const db = (this as any).db?.db || (this as any).db;
        if (db?.prepare && +x.test_id) {
          const t = db.prepare('SELECT report_order, priority FROM tests WHERE id=?').get(+x.test_id) as any;
          const fromDb = +(t?.report_order || t?.priority || 0) || 0;
          if (fromDb > 0) {
            x.master_report_order = fromDb;
            return fromDb;
          }
        }
      } catch { /* ignore */ }
      const o = +(x.report_order_override ?? x.priority ?? 0);
      return Number.isFinite(o) ? o : 0;
    };
    const isDense = (x:any) => {
      const order = +(x.report_order_override ?? x.priority ?? 0);
      const master = masterOf(x);
      if (!Number.isFinite(order) || order <= 0) return false;
      if (+x.report_order_overridden === 1 || x._reportOrderOverridden) {
        return master > 0 && order !== master && order <= Math.max(100, master / 5);
      }
      // Legacy saves: 10/20/30 style without the flag.
      return master >= 100 && order <= 100 && order % 10 === 0 && order !== master;
    };
    const byDept = new Map<string, any[]>();
    for (const item of items) {
      if (!isSingle(item)) continue;
      const dept = String(item.department_name || '').trim().toLowerCase() || '_';
      if (!byDept.has(dept)) byDept.set(dept, []);
      byDept.get(dept)!.push(item);
    }
    for (const rows of byDept.values()) {
      const dense = rows.filter(isDense);
      if (!dense.length) continue;
      dense.sort((a:any, b:any) =>
        (+(a.report_order_override ?? a.priority ?? 0)) - (+(b.report_order_override ?? b.priority ?? 0)) ||
        (+a.id || 0) - (+b.id || 0)
      );
      const masters = dense.map(masterOf).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
      if (masters.length !== dense.length) continue;
      dense.forEach((item, idx) => {
        item.report_order_override = masters[idx];
        item.priority = masters[idx];
      });
    }
  }

  /** Quick Reporting / typed override path: keep department order from typing, and apply single-test beginning/end inside each department. */
  protected normalizeTypedReportItemsForPdf(items:any[], options:any = {}): any[] {
    const showProfileName = options?.show_profile_name !== false;
    const showSubHeader = options?.show_sub_header !== false;
    const singlePlacement = String(options?.single_test_placement || 'DEPARTMENT').toUpperCase();
    const working = (Array.isArray(items) ? items : []).map((x:any) => ({ ...x }));
    this.remapDenseSingleOverridesForPdf(working);
    // Department = Masters / typing department_order_override. Card = group_order within dept only.
    // Legacy dept*10000+within → extract within for card key.
    const cardWithin = (go:number) => {
      if (!Number.isFinite(go)) return 0;
      return Math.abs(go) >= 10000 ? Math.round((Math.abs(go) % 10000) * 1000) / 1000 : go;
    };
    // Always department first, then card-within. Card overrides never jump across departments.
    const typedDeptKey = (x:any) => {
      const override = +(x.department_order_override ?? Number.NaN);
      if (Number.isFinite(override)) return override;
      const dp = +(x.department_priority ?? Number.NaN);
      if (Number.isFinite(dp) && dp > 0 && dp < 100000) return dp;
      const name = this.reportPdfDepartmentName(x, '');
      if (name) {
        try {
          const db = (this as any).db?.db || (this as any).db;
          if (db?.prepare) {
            const row = db.prepare(`SELECT priority FROM departments WHERE LOWER(TRIM(name))=LOWER(TRIM(?)) LIMIT 1`).get(name) as any;
            if (row?.priority != null && row?.priority !== '') return +row.priority;
          }
        } catch { /* ignore */ }
      }
      const go = +(x.group_order_override ?? Number.NaN);
      if (Number.isFinite(go) && Math.abs(go) >= 10000) return Math.floor(Math.abs(go) / 10000);
      return 9999;
    };
    const typedCardKey = (x:any) => cardWithin(+(x.group_order_override ?? x.priority ?? 0));
    const rows = working
      .filter((x:any) => !(x?.selected_for_reporting === false || +x?.selected_for_reporting === 0))
      .map((x:any, index:number) => ({ ...x, _report_source_order: index }))
      .sort((a:any, b:any) => {
        const ag = typedDeptKey(a);
        const bg = typedDeptKey(b);
        if (ag !== bg) return ag - bg;
        const ac = typedCardKey(a);
        const bc = typedCardKey(b);
        if (ac !== bc) return ac - bc;
        const ar = +(a.report_order_override ?? a.priority ?? a._report_source_order ?? 0);
        const br = +(b.report_order_override ?? b.priority ?? b._report_source_order ?? 0);
        if (ar !== br) return ar - br;
        return (+a.id || 0) - (+b.id || 0) || (a._report_source_order - b._report_source_order);
      });

    type DeptBucket = {
      name: string;
      order: number;
      profiles: Map<string, { key: string; order: number; name: string; items: any[]; profile_interpretation_enabled?: any; profile_interpretation_text?: any }>;
      singles: any[];
      innerByProfile: Map<string, any[]>;
    };
    const departments = new Map<string, DeptBucket>();
    const ensureDept = (name:string, order:number) => {
      const key = String(name || '').trim();
      if (!departments.has(key)) {
        departments.set(key, { name: key, order, profiles: new Map(), singles: [], innerByProfile: new Map() });
      }
      const bucket = departments.get(key)!;
      if (order < bucket.order) bucket.order = order;
      return bucket;
    };

    for (const item of rows) {
      const kind = String(item.heading_kind || '').toUpperCase();
      const deptOrder = typedDeptKey(item);
      const cardOrder = typedCardKey(item);
      if (!item.test_id) {
        if (kind === 'DEPARTMENT') {
          ensureDept(item.test_name || item.department_name || '', deptOrder);
          continue;
        }
        if (kind === 'PROFILE') {
          const dept = this.reportPdfDepartmentName(item, '') || '';
          const bucket = ensureDept(dept, deptOrder);
          const key = this.reportPdfProfileKey(item) || `0|${String(item.test_name || item.source_profile_name || 'Profile').trim()}`;
          if (!bucket.profiles.has(key)) {
            bucket.profiles.set(key, {
              key,
              order: cardOrder,
              name: String(item.test_name || item.source_profile_name || 'Profile').trim() || 'Profile',
              items: [],
              profile_interpretation_enabled: item.profile_interpretation_enabled,
              profile_interpretation_text: item.profile_interpretation_text
            });
          }
          continue;
        }
        if (kind === 'INNER' && showSubHeader) {
          const profileKey = this.reportPdfProfileKey(item);
          const dept = this.reportPdfDepartmentName(item, '') || '';
          const bucket = ensureDept(dept, deptOrder);
          if (profileKey) {
            if (!bucket.innerByProfile.has(profileKey)) bucket.innerByProfile.set(profileKey, []);
            const list = bucket.innerByProfile.get(profileKey)!;
            const ik = this.reportPdfInnerHeaderKey(item);
            const idx = list.findIndex((x:any) => this.reportPdfInnerHeaderKey(x) === ik);
            if (idx < 0) {
              list.push(item);
            } else {
              const prev = list[idx];
              const nextOrder = +(item.report_order_override ?? item.priority ?? 0);
              const prevOrder = +(prev.report_order_override ?? prev.priority ?? 0);
              if (nextOrder < prevOrder) list[idx] = item;
            }
          }
        }
        continue;
      }

      const dept = this.reportPdfDepartmentName(item, '') || '';
      const bucket = ensureDept(dept, deptOrder);
      const profileKey = this.reportPdfProfileKey(item);
      if (profileKey) {
        if (!bucket.profiles.has(profileKey)) {
          bucket.profiles.set(profileKey, {
            key: profileKey,
            order: cardOrder,
            name: String(item.source_profile_name || 'Profile').trim() || 'Profile',
            items: [],
            profile_interpretation_enabled: item.profile_interpretation_enabled,
            profile_interpretation_text: item.profile_interpretation_text
          });
        }
        const profile = bucket.profiles.get(profileKey)!;
        if (cardOrder < profile.order) profile.order = cardOrder;
        profile.items.push({ ...item, heading_kind: '', test_name: item.test_name || item.name || 'Test' });
      } else {
        bucket.singles.push({ ...item, heading_kind: '', test_name: item.test_name || item.name || 'Test' });
      }
    }

    const out:any[] = [];
    // Mixed package name once, before any department — PDF only (no typing-order impact).
    out.push(...this.collectMixedPackageHeaders(working, showProfileName));
    const sortedDepartments = Array.from(departments.values())
      .filter((d) => d.singles.length || Array.from(d.profiles.values()).some((p) => p.items.length))
      .sort((a, b) => (a.order - b.order) || String(a.name || '').localeCompare(String(b.name || '')));

    for (const dept of sortedDepartments) {
      if (dept.name) {
        out.push({
          test_id: null,
          test_name: dept.name,
          heading_kind: 'DEPARTMENT',
          department_name: dept.name,
          department_id: this.departmentIdByName(dept.name) || null
        });
      }

      const profiles = Array.from(dept.profiles.values())
        .filter((p) => p.items.length)
        .sort((a, b) => {
          if (a.order !== b.order) return a.order - b.order;
          const minRO = (p: { items: any[] }) => {
            const vals = (p.items || []).map((x:any) => +(x.report_order_override ?? x.priority ?? x._report_source_order ?? 0));
            return vals.length ? Math.min(...vals) : Number.POSITIVE_INFINITY;
          };
          const rd = minRO(a) - minRO(b);
          if (rd) return rd;
          return String(a.name || '').localeCompare(String(b.name || ''));
        });
      const pushSingles = () => {
        const sorted = [...dept.singles].sort((a:any, b:any) => {
          const ar = +(a.report_order_override ?? a.priority ?? a._report_source_order ?? 0);
          const br = +(b.report_order_override ?? b.priority ?? b._report_source_order ?? 0);
          if (ar !== br) return ar - br;
          return (+a.id || 0) - (+b.id || 0) || (+a._report_source_order || 0) - (+b._report_source_order || 0);
        });
        for (const item of sorted) out.push(item);
      };
      const pushDepartmentAgain = () => {
        if (dept.name) {
          out.push({
            test_id: null,
            test_name: dept.name,
            heading_kind: 'DEPARTMENT',
            department_name: dept.name,
            department_id: this.departmentIdByName(dept.name) || null
          });
        }
      };
      const pushProfiles = () => {
        for (const profile of profiles) {
          const profileId = this.profileIdFromKeyOrItems(profile);
          if (showProfileName && !this.isMixedProfileMaster(profileId)) {
            out.push({
              test_id: null,
              test_name: profile.name,
              heading_kind: 'PROFILE',
              source_profile_id: profileId || null,
              source_profile_name: profile.name,
              department_name: dept.name,
              profile_interpretation_enabled: profile.profile_interpretation_enabled,
              profile_interpretation_text: profile.profile_interpretation_text
            });
          }
          const inners = showSubHeader ? (dept.innerByProfile.get(profile.key) || []) : [];
          // Interleave INNER side-headers with tests by stored report order (not dump all headers first).
          if (inners.length) {
            const merged = [...inners, ...profile.items].sort((a:any, b:any) => {
              const ar = +(a.report_order_override ?? a.priority ?? a._report_source_order ?? 0);
              const br = +(b.report_order_override ?? b.priority ?? b._report_source_order ?? 0);
              if (ar !== br) return ar - br;
              return (+a._report_source_order || 0) - (+b._report_source_order || 0) || (+a.id || 0) - (+b.id || 0);
            });
            out.push(...merged);
          } else {
            out.push(...profile.items);
          }
        }
      };

      const hasProfiles = profiles.length > 0;
      const hasSingles = dept.singles.length > 0;

      // Print modal: TOP/END force singles as one block; CUSTOM keeps typing card order inside the department.
      if (singlePlacement === 'CUSTOM') {
        const units: Array<{ kind: 'SINGLE' | 'PROFILE'; order: number; profile?: typeof profiles[number] }> = [];
        if (dept.singles.length) {
          const order = Math.min(...dept.singles.map((x:any) => typedCardKey(x)));
          units.push({ kind: 'SINGLE', order });
        }
        for (const profile of profiles) units.push({ kind: 'PROFILE', order: profile.order, profile });
        units.sort((a, b) => (a.order - b.order) || (a.kind === 'SINGLE' ? -1 : 1));
        let sawProfile = false;
        for (const unit of units) {
          if (unit.kind === 'SINGLE') {
            // Singles after profiles → repeat department so they don't look like profile tests.
            if (sawProfile && hasSingles) pushDepartmentAgain();
            pushSingles();
          } else if (unit.profile) {
            const profile = unit.profile;
            const profileId = this.profileIdFromKeyOrItems(profile);
            if (showProfileName && !this.isMixedProfileMaster(profileId)) {
              out.push({
                test_id: null,
                test_name: profile.name,
                heading_kind: 'PROFILE',
                source_profile_id: profileId || null,
                source_profile_name: profile.name,
                department_name: dept.name,
                profile_interpretation_enabled: profile.profile_interpretation_enabled,
                profile_interpretation_text: profile.profile_interpretation_text
              });
            }
            const inners = showSubHeader ? (dept.innerByProfile.get(profile.key) || []) : [];
            if (inners.length) {
              const merged = [...inners, ...profile.items].sort((a:any, b:any) => {
                const ar = +(a.report_order_override ?? a.priority ?? a._report_source_order ?? 0);
                const br = +(b.report_order_override ?? b.priority ?? b._report_source_order ?? 0);
                if (ar !== br) return ar - br;
                return (+a._report_source_order || 0) - (+b._report_source_order || 0) || (+a.id || 0) - (+b.id || 0);
              });
              out.push(...merged);
            } else out.push(...profile.items);
            sawProfile = true;
          }
        }
      } else if (singlePlacement === 'TOP') {
        pushSingles();
        pushProfiles();
      } else {
        pushProfiles();
        if (hasProfiles && hasSingles) pushDepartmentAgain();
        pushSingles();
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
