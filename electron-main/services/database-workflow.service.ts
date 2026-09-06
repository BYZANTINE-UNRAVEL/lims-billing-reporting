import { DatabaseBillingService } from './database-billing.service';

export abstract class DatabaseWorkflowService extends DatabaseBillingService {  getReport(id:number) {
    if (this.isQuickReportingEnabled()) {
      if (+id < 0) return this.getQuickPendingReport(Math.abs(+id));
      return this.getQuickFinishedReport(+id);
    }
    let r=this.db.prepare('SELECT r.*,b.bill_no,b.bill_date,b.patient_snapshot_json,p.id patient_id,p.patient_no,p.title patient_title,p.name patient_name,p.age,p.age_value,p.age_unit,p.gender,p.mobile,p.mobile patient_mobile,p.email patient_email,p.history,c.name consultant_name FROM reports r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE r.id=? OR b.id=?').get(id,id) as any;
    if(!r) return null;
    this.ensureReportReady(+r.id);
    r=this.db.prepare('SELECT r.*,b.bill_no,b.bill_date,b.patient_snapshot_json,p.id patient_id,p.patient_no,p.title patient_title,p.name patient_name,p.age,p.age_value,p.age_unit,p.gender,p.mobile,p.mobile patient_mobile,p.email patient_email,p.history,c.name consultant_name FROM reports r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE r.id=?').get(r.id) as any;
    r = this.applyPatientSnapshotToRow(r);
    const isRecheckReport = String((r as any).report_kind || '').toUpperCase() === 'RECHECK' || String((r as any).report_scope || '').toUpperCase() === 'RECHECK';
    const items = this.db.prepare(`SELECT ri.*,
      COALESCE(sc.id,0) collection_id,
      CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN COALESCE(sc.outsource_vendor_id,0) ELSE 0 END outsource_vendor_id,
      CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN ov.name ELSE NULL END outsource_vendor_name,
      COALESCE(sc.status, ri.collection_status) sample_collection_status,
      COALESCE(sc.dispatch_status,'') dispatch_status,
      t.result_mode, t.result_data_type, t.input_control_type, t.decimal_places, t.rounding_mode, t.number_format, t.interpretation_enabled, t.interpretation_text,
      (SELECT p.interpretation_enabled FROM profiles p WHERE p.id=ri.source_profile_id) profile_interpretation_enabled,
      (SELECT p.interpretation_text FROM profiles p WHERE p.id=ri.source_profile_id) profile_interpretation_text,
      tf.formula_expression, tf.predefined_formula_key, tf.rounding_decimals, tf.allow_manual_override, CASE WHEN tf.id IS NULL THEN 0 ELSE 1 END has_formula,
      (SELECT GROUP_CONCAT(tro.option_value || '::' || COALESCE(tro.option_label, tro.option_value), '||') FROM test_result_options tro WHERE tro.test_id=ri.test_id AND tro.is_active=1) result_options,
      (SELECT GROUP_CONCAT(tfv.variable_key || '::' || tfv.source_test_id, '||') FROM test_formula_variables tfv WHERE tfv.formula_id=tf.id) formula_variables
      FROM report_items ri
      LEFT JOIN specimen_collection_tests sct ON sct.report_item_id=ri.id
      LEFT JOIN specimen_collections sc ON sc.id=sct.collection_id
      LEFT JOIN outsource_vendors ov ON ov.id=sc.outsource_vendor_id
      LEFT JOIN tests t ON t.id=ri.test_id
      LEFT JOIN test_formulas tf ON tf.test_id=ri.test_id AND tf.is_active=1
      WHERE ri.report_id=? AND COALESCE(ri.selected_for_reporting,1)=1
        AND NOT (COALESCE(ri.excluded_from_approval,0)=1 OR COALESCE(ri.moved_to_recheck_report_id,0)>0)
        AND (
          ri.test_id IS NULL
          OR (
            ${isRecheckReport ? 1 : 0}=1
            AND (
              COALESCE(ri.is_recheck_item,0)=1
              OR COALESCE(ri.original_report_item_id,0)>0
              OR COALESCE(ri.source_report_item_id,0)>0
              OR UPPER(COALESCE(ri.recheck_mode,'NONE')) IN ('INHOUSE','OUTSOURCE','BOTH')
            )
            AND UPPER(COALESCE(ri.result_status,'PENDING')) NOT IN ('CANCELLED','APPROVED','FINALIZED')
            AND UPPER(COALESCE(ri.recheck_status,'PENDING')) NOT IN ('REVERTED','RECHECK_REVERTED','RECHECK_REJECTED','CANCELLED','APPROVED','FINALIZED')
          )
          OR 1=1
        )
      GROUP BY ri.id
      ORDER BY COALESCE(ri.group_order_override, ri.priority, 0), COALESCE(ri.report_order_override, ri.priority, 0), ri.id`).all(r.id) as any[];
    this.attachResultOptions(items);
    this.quickBarcodeSvc().decorateItems(items);
    for (const item of items) {
      if (item?.test_id) {
        const selectedRef = this.pickReferenceRange(+item.test_id, r);
        const selectedReferenceText = String(selectedRef?.reference_text || item.normal_range || '').trim();
        if (selectedReferenceText) {
          item.selected_reference_text = selectedReferenceText;
          item.normal_range = selectedReferenceText;
        }
        item.selected_reference_gender = selectedRef?.gender || '';
        item.selected_reference_low = selectedRef?.lower_limit ?? null;
        item.selected_reference_high = selectedRef?.upper_limit ?? null;
        item.selected_reference_critical_low = selectedRef?.critical_low ?? null;
        item.selected_reference_critical_high = selectedRef?.critical_high ?? null;
        item.flag_enabled = selectedRef && Number(selectedRef.flag_enabled ?? 1) !== 0 ? 1 : 0;
        if (!item.flag_enabled) {
          item.flag_status = '';
          item.is_critical = 0;
          item.critical_message = '';
        }
      }
    }
    return this.attachProfileRemarks({...r, items});
  }
  protected listQuickReports(status='') {
    this.ensureQuickReportingSchema();
    const rows:any[] = [];
    const bills = this.db.prepare(`SELECT b.id bill_id,b.bill_no,b.bill_date,b.patient_snapshot_json,p.title patient_title,p.name patient_name,p.mobile patient_mobile,p.patient_no,p.age,p.age_value,p.age_unit,p.gender,c.name consultant_name
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE COALESCE(b.status,'BILLED') NOT IN ('CANCELLED','DELETED')
      ORDER BY b.id DESC LIMIT 300`).all() as any[];
    for (const b of bills) {
      const patient = this.applyPatientSnapshotToRow(b);
      const items = this.quickBuildBillItems(+b.bill_id, false, 0).filter((x:any)=>x.test_id);
      if (items.length) { const bc = this.quickBarcodeSvc().buildState(+b.bill_id, items); rows.push({ id: -Number(b.bill_id), bill_id:+b.bill_id, status:'DRAFT', queue_status:'DRAFT', report_scope:'QUICK', report_title:'Quick Report Pending', item_count:items.length, pending_count:items.length, approved_count:0, entered_count:0, ready_for_entry_count:items.length, entry_locked:0, quick_barcode_status:bc.status, quick_barcode_generated_count:bc.generated_count, quick_barcode_pending_count:bc.pending_count, ...patient }); }
    }
    const finished = this.db.prepare(`SELECT qr.id,qr.bill_id,qr.report_no,qr.created_at,qr.updated_at,qr.status raw_quick_status,b.bill_no,b.bill_date,b.patient_snapshot_json,p.title patient_title,p.name patient_name,p.mobile patient_mobile,p.patient_no,p.age,p.age_value,p.age_unit,p.gender,c.name consultant_name,COUNT(qri.id) item_count
      FROM quick_reports qr JOIN bills b ON b.id=qr.bill_id JOIN patients p ON p.id=qr.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id LEFT JOIN quick_report_items qri ON qri.quick_report_id=qr.id AND qri.test_id IS NOT NULL
      WHERE UPPER(COALESCE(qr.status,'FINISHED'))='FINISHED'
      GROUP BY qr.id ORDER BY qr.id DESC LIMIT 300`).all() as any[];
    for (const r of finished) {
      const patient = this.applyPatientSnapshotToRow(r);
      rows.push({ ...patient, status:'APPROVED', queue_status:'APPROVED', report_scope:'QUICK', report_title:r.report_no || 'Quick Report', pending_count:0, entered_count:0, approved_count:+r.item_count || 0, ready_for_entry_count:+r.item_count || 0, entry_locked:0 });
    }
    const wanted = String(status || '').toUpperCase();
    return wanted ? rows.filter(r => String(r.status).toUpperCase() === wanted) : rows;
  }

  listReports(status='') {
    if (this.isQuickReportingEnabled()) return this.listQuickReports(status);
    const baseRows = this.db.prepare(`SELECT r.id FROM reports r JOIN bills b ON b.id=r.bill_id WHERE COALESCE(r.report_scope,'COLLECTION')<>'STAGING' AND COALESCE(r.status,'')<>'COLLECTION_STAGING' ORDER BY r.id DESC LIMIT 300`).all() as any[];
    for (const row of baseRows) {
      try { this.ensureReportReady(+row.id); } catch (err) { console.error('Unable to prepare report', row.id, err); }
    }
    const rows = this.db.prepare(`SELECT r.*,b.bill_no,b.bill_date,b.patient_snapshot_json,p.title patient_title,p.name patient_name,p.mobile patient_mobile,p.patient_no,p.age,p.age_value,p.age_unit,p.gender,c.name consultant_name,
        MIN(sc.collected_at) collected_at,
        CASE WHEN COUNT(DISTINCT COALESCE(sc.id,0)) > 1 THEN 'MULTI_SAMPLE' ELSE COALESCE(NULLIF(TRIM(MAX(ri.specimen_id)),''), NULLIF(TRIM(MAX(ri.specimen_name)),''), 'NO_SAMPLE') END specimen_group_key,
        CASE WHEN COUNT(DISTINCT COALESCE(sc.id,0)) > 1 THEN 'Multiple specimens' ELSE COALESCE(NULLIF(TRIM(MAX(ri.specimen_name)),''),'Specimen') END specimen_label,
        CASE WHEN COUNT(DISTINCT COALESCE(NULLIF(TRIM(ri.sample_type),''),'Unspecified')) > 1 THEN 'Multiple collection types' ELSE COALESCE(NULLIF(TRIM(MAX(ri.sample_type)),''),'Unspecified') END collection_type_label,
        0 collection_id,
        COALESCE(NULLIF(TRIM(MAX(ri.collection_mode)),''),'INHOUSE') collection_mode,
        MAX(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN COALESCE(sc.outsource_vendor_id,0) ELSE 0 END) queue_vendor_id,
        CASE WHEN MAX(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN 1 ELSE 0 END)=1 THEN 'OUTSOURCE' ELSE 'INHOUSE' END workflow_key,
        CASE WHEN MAX(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN 1 ELSE 0 END)=1 THEN 'Outsource' ELSE 'In-house' END workflow_label,
        '' queue_group_key,
        COUNT(ri.id) item_count,
        SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='PENDING' OR TRIM(COALESCE(ri.result_value,''))='' THEN 1 ELSE 0 END) pending_count,
        SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='ENTERED' AND TRIM(COALESCE(ri.result_value,''))<>'' THEN 1 ELSE 0 END) entered_count,
        SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='APPROVED' AND TRIM(COALESCE(ri.result_value,''))<>'' THEN 1 ELSE 0 END) approved_count,
        SUM(CASE WHEN UPPER(COALESCE(ri.recheck_mode,'NONE')) <> 'NONE'
          AND COALESCE(ri.selected_for_reporting,1)=1
          AND COALESCE(ri.excluded_from_approval,0)=0
          AND COALESCE(ri.moved_to_recheck_report_id,0)=0
          AND UPPER(COALESCE(ri.result_status,'PENDING')) NOT IN ('CANCELLED','APPROVED','FINALIZED')
          AND UPPER(COALESCE(ri.recheck_status,'REQUESTED')) NOT IN ('DONE','REVERTED','RECHECK_REVERTED','RECHECK_REJECTED','CANCELLED','RECHECK_CANCELLED','APPROVED','FINALIZED')
          THEN 1 ELSE 0 END) recheck_count,
        SUM(CASE WHEN ${this.reportReadyCollectionStatusesSql('ri')} THEN 1 ELSE 0 END) ready_for_entry_count
      FROM reports r
      JOIN bills b ON b.id=r.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      LEFT JOIN report_items ri ON ri.report_id=r.id AND ri.test_id IS NOT NULL AND COALESCE(ri.selected_for_reporting,1)=1 AND NOT (COALESCE(ri.excluded_from_approval,0)=1 OR COALESCE(ri.moved_to_recheck_report_id,0)>0)
      LEFT JOIN specimen_collection_tests sct ON sct.report_item_id=ri.id
      LEFT JOIN specimen_collections sc ON sc.id=sct.collection_id
      WHERE COALESCE(r.report_scope,'COLLECTION')<>'STAGING' AND COALESCE(r.status,'')<>'COLLECTION_STAGING'
      GROUP BY r.id
      HAVING COUNT(ri.id) > 0
      ORDER BY r.id DESC LIMIT 300`).all() as any[];
    const visibleRows:any[] = [];
    for (const row of rows) {
      const pending = +row.pending_count || 0;
      const total = +row.item_count || 0;
      const rawStatus = String(row.status || '').toUpperCase();
      const scope = String(row.report_scope || '').toUpperCase();
      const kind = String(row.report_kind || '').toUpperCase();
      const isRecheckReport = scope === 'RECHECK' || kind === 'RECHECK';
      const activeRecheckCount = +row.recheck_count || 0;

      // Child RECHECK reports must never fall back into normal Pending Results.
      // They are visible only in Pending Rechecks while active. After reject/revert/cancel,
      // activeRecheckCount becomes 0 and the child report is hidden from all normal queues.
      if (isRecheckReport && activeRecheckCount <= 0) continue;

      if (rawStatus.includes('CANCEL')) row.queue_status = 'CANCELLED';
      else if ((+row.approved_count || 0) > 0 && pending === 0 && (+row.entered_count || 0) === 0) row.queue_status = 'APPROVED';
      else row.queue_status = pending > 0 || total === 0 ? 'DRAFT' : 'TYPED';
      row.ready_for_entry_count = +row.ready_for_entry_count || 0;
      row.entry_locked = row.ready_for_entry_count <= 0;
      row.is_recheck_report = isRecheckReport ? 1 : 0;
      row.status = row.queue_status;
      visibleRows.push(this.applyPatientSnapshotToRow(row));
    }
    return status ? visibleRows.filter(r => r.status === status) : visibleRows;
  }

  protected calculateReportFormulaValue(testId: number, reportItems: any[]) {
    const formula = this.db.prepare('SELECT * FROM test_formulas WHERE test_id=? AND is_active=1 ORDER BY id DESC LIMIT 1').get(testId) as any;
    if (!formula?.id) return null;
    const vars = this.db.prepare('SELECT * FROM test_formula_variables WHERE formula_id=?').all(formula.id) as any[];
    let expr = String(formula.formula_expression || '').trim().replace(/\^/g, '**');
    const missing:string[] = [];
    for (const v of vars) {
      const source = reportItems.find((ri:any) => +ri.test_id === +v.source_test_id);
      const value = Number(String(source?.result_value ?? '').replace(/,/g, '').trim());
      if (!Number.isFinite(value)) { missing.push(String(v.variable_key)); continue; }
      expr = expr.replace(new RegExp(`\\b${String(v.variable_key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), String(value));
    }
    if (missing.length) return { value: null, status: `Missing dependency: ${missing.join(', ')}`, allow_manual_override: +formula.allow_manual_override || 0 };
    if (!/^[0-9+\-*/().\s]*$/.test(expr)) return { value: null, status: 'Formula error', allow_manual_override: +formula.allow_manual_override || 0 };
    try {
      const raw = Function(`"use strict"; return (${expr})`)();
      if (!Number.isFinite(Number(raw))) return { value: null, status: 'Formula error', allow_manual_override: +formula.allow_manual_override || 0 };
      const decimals = Number.isFinite(+formula.rounding_decimals) ? Math.max(0,+formula.rounding_decimals) : 2;
      const factor = Math.pow(10, decimals);
      const mode = String(formula.rounding_mode || 'NEAREST').toUpperCase().replace(/[\s-]+/g, '_');
      let n = Number(raw);
      if (mode === 'NO_TRANSFORM' || mode === 'NOTRANSFORM') {
        return { value: String(n), status: 'Calculated', allow_manual_override: +formula.allow_manual_override || 0 };
      }
      if (mode.includes('CEIL') || mode === 'UP') n = Math.ceil(n * factor) / factor;
      else if (mode.includes('FLOOR') || mode === 'DOWN') n = Math.floor(n * factor) / factor;
      else n = Math.round(n * factor) / factor;
      return { value: n.toFixed(decimals), status: 'Calculated', allow_manual_override: +formula.allow_manual_override || 0 };
    } catch { return { value: null, status: 'Formula error', allow_manual_override: +formula.allow_manual_override || 0 }; }
  }

  protected normalizeReportValueForTest(item:any, value:any) {
    const test = item?.test_id ? this.db.prepare('SELECT result_data_type,decimal_places,rounding_mode,number_format,output_operator,output_constant FROM tests WHERE id=?').get(+item.test_id) as any : null;
    const type = String(test?.result_data_type || item?.result_data_type || '').toUpperCase();
    if (type !== 'NUMBER' && type !== 'CALCULATED') return String(value ?? '').trim();
    const mode = String(test?.rounding_mode || item?.rounding_mode || 'NEAREST').toUpperCase().replace(/[\s-]+/g, '_');
    // Preserve exactly what was typed — no rounding, padding, or output constant rewrite.
    if (mode === 'NO_TRANSFORM' || mode === 'NOTRANSFORM') {
      return String(value ?? '').trim();
    }
    let raw = Number(String(value ?? '').replace(/,/g, '').trim());
    if (!Number.isFinite(raw)) return String(value ?? '').trim();
    const op = String(test?.output_operator || item?.output_operator || '+');
    const constant = Number(test?.output_constant ?? item?.output_constant ?? 0);
    if (Number.isFinite(constant)) {
      if (op === '+') raw += constant;
      else if (op === '-') raw -= constant;
      else if (op === '*') raw *= constant;
      else if (op === '/' && constant !== 0) raw /= constant;
    }
    const places = Number.isFinite(+test?.decimal_places) ? Math.max(0,+test.decimal_places) : (Number.isFinite(+item?.decimal_places) ? Math.max(0,+item.decimal_places) : 2);
    const f = Math.pow(10, places);
    let n = raw;
    if (mode.includes('CEIL') || mode === 'UP') n = Math.ceil(n*f)/f;
    else if (mode.includes('FLOOR') || mode === 'DOWN') n = Math.floor(n*f)/f;
    else n = Math.round(n*f)/f;
    return n.toFixed(places);
  }

  /** True if any selected test row has a non-empty reportable value (mirrors UI hasRealResultValue). */
  protected selectionHasRealResultValue(selected:any[]): boolean {
    return (selected || []).some((item:any) => {
      if (!item?.test_id) return false;
      const source = String(item?.final_result_source || '').toUpperCase();
      const method = String(item?.vendor_result_method || '').toUpperCase();
      const resultValue = String(item?.result_value || '').trim();
      const outsourceValue = String(item?.outsource_result_value || '').trim();
      const internalValue = String(item?.internal_check_value || '').trim();
      const vendorFile = String(item?.vendor_report_file || '').trim();
      if (method === 'ATTACH_REPORT_ONLY' || source === 'VENDOR_REPORT') return !!vendorFile || resultValue === 'See attached vendor report';
      if (source === 'OUTSOURCE') return !!outsourceValue || !!resultValue;
      if (source === 'INTERNAL_CHECK') return !!internalValue || !!resultValue;
      return !!resultValue;
    });
  }

  protected quickItemKey(billItemId:any, testId:any) { return `${Number(billItemId) || 0}:${Number(testId) || 0}`; }
  protected quickSyntheticItemId(billItemId:any, testId:any) { return (Number(billItemId) || 0) * 100000 + (Number(testId) || 0); }

  /**
   * Keep report option controls independent from SQLite GROUP_CONCAT formatting.
   * Electron can safely clone this plain array, and the renderer gets the same
   * option shape for pending, finished and normal reports.
   */
  protected attachResultOptions(items:any[]) {
    const testIds = Array.from(new Set((items || []).map(item => +item?.test_id || 0).filter(Boolean)));
    if (!testIds.length) return items || [];
    const placeholders = testIds.map(() => '?').join(',');
    const rows = this.db.prepare(`SELECT test_id,option_value,COALESCE(option_label,option_value) option_label,display_order
      FROM test_result_options
      WHERE COALESCE(is_active,1)=1 AND test_id IN (${placeholders})
      ORDER BY test_id,display_order,id`).all(...testIds) as any[];
    const byTest = new Map<number, any[]>();
    for (const row of rows) {
      const options = byTest.get(+row.test_id) || [];
      options.push({ value:String(row.option_value || '').trim(), label:String(row.option_label || row.option_value || '').trim() });
      byTest.set(+row.test_id, options);
    }
    for (const item of items || []) {
      if (!item?.test_id) continue;
      const options = byTest.get(+item.test_id) || [];
      item.options = options;
      if (options.length) item.result_options = options.map(option => `${option.value}::${option.label}`).join('||');
    }
    return items || [];
  }

  protected quickBaseBillRow(billId:number) {
    const row = this.db.prepare(`SELECT b.id bill_id,b.bill_no,b.bill_date,b.patient_snapshot_json,p.id patient_id,p.patient_no,p.title patient_title,p.name patient_name,p.age,p.age_value,p.age_unit,p.gender,p.mobile,p.mobile patient_mobile,p.email patient_email,p.history,c.name consultant_name
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE b.id=?`).get(billId) as any;
    return this.applyPatientSnapshotToRow(row);
  }

  protected quickActiveItemKeys() {
    const rows = this.db.prepare(`SELECT qri.item_key FROM quick_report_items qri JOIN quick_reports qr ON qr.id=qri.quick_report_id WHERE UPPER(COALESCE(qr.status,'FINISHED'))='FINISHED'`).all() as any[];
    return new Set(rows.map(r => String(r.item_key || '')));
  }

  /**
   * Profile members: attach Masters profile_items / profile_tests priority so
   * typing ↑↓ can exchange layout-scale ranks (same idea as singles + report_order).
   */
  protected attachMasterProfileOrders(items:any[]) {
    if (!Array.isArray(items) || !items.length) return items;
    const cache = new Map<string, number>();
    const lookup = (profileId:number, testId:number) => {
      const key = `${profileId}:${testId}`;
      if (cache.has(key)) return cache.get(key)!;
      let master = 0;
      try {
        const pi = this.db.prepare(`
          SELECT priority FROM profile_items
          WHERE profile_id=? AND UPPER(COALESCE(item_type,'TEST'))='TEST' AND test_id=?
          ORDER BY priority,id LIMIT 1`).get(profileId, testId) as any;
        master = +(pi?.priority || 0) || 0;
        if (!master) {
          const pt = this.db.prepare(`
            SELECT priority FROM profile_tests
            WHERE profile_id=? AND test_id=?
            ORDER BY priority,id LIMIT 1`).get(profileId, testId) as any;
          master = +(pt?.priority || 0) || 0;
        }
      } catch { master = 0; }
      cache.set(key, master);
      return master;
    };
    for (const item of items) {
      if (!item?.test_id) continue;
      const profileId = +(item.source_profile_id || 0);
      if (!profileId) continue;
      if (+(item.master_profile_order || 0) > 0) continue;
      const master = lookup(profileId, +item.test_id);
      if (master > 0) item.master_profile_order = master;
    }
    return items;
  }

  /**
   * Singles: fill Masters report_order only when override is missing.
   * Never overwrite a saved typing/PDF order value.
   * Also collapse legacy Masters-encoded fractional group_order so PDF/typing
   * sort by report_order_override within the department.
   */
  protected applyMasterReportOrderToSinglesUnlessTypingOverride(items:any[]) {
    if (!Array.isArray(items) || !items.length) return items;
    for (const item of items) {
      if (!item?.test_id) continue;
      const isSingle = !(+(item.source_profile_id || 0)) && !String(item.source_profile_name || '').trim();
      if (!isSingle) continue;
      let master = +(item.master_report_order ?? 0) || 0;
      if (!master) {
        try {
          const t = this.db.prepare('SELECT report_order, priority FROM tests WHERE id=?').get(+item.test_id) as any;
          master = +(t?.report_order || t?.priority || 0) || 0;
        } catch { master = 0; }
      }
      if (master) item.master_report_order = master;
      const hasSaved = item.report_order_override !== null
        && item.report_order_override !== undefined
        && item.report_order_override !== '';
      if (!hasSaved && master) {
        item.report_order_override = master;
        item.priority = master;
      }
      // Only collapse legacy Masters fractions (e.g. 3000.07). Do NOT rewrite
      // dept*10000 card orders or other shared group values down to raw dept priority —
      // that made Biochemistry singles (3000) sort before Hematology profiles (10001000).
      const go = +(item.group_order_override ?? Number.NaN);
      if (Number.isFinite(go) && go !== Math.floor(go) && Math.abs(go) < 10000) {
        const dp = +(item.department_priority ?? Number.NaN);
        item.group_order_override = Number.isFinite(dp) ? dp : Math.floor(go);
      }
    }
    return items;
  }

  protected quickBuildBillItems(billId:number, includeFinished=false, quickReportId=0) {
    // item_key is bill_item_id:test_id. Updating a bill replaces bill_items (new ids), so
    // finished keys alone would miss and re-show finished tests in Pending. Also block by
    // finished test_id for this bill so only newly added unfinished work remains pending.
    const blocked = includeFinished ? new Set<string>() : this.quickActiveItemKeys();
    const finishedTestIds = includeFinished ? new Set<number>() : this.finishedQuickTestIdsForBill(billId);
    const isBlockedTest = (billItemId:any, testId:any) => {
      const tid = +testId || 0;
      if (!tid) return true;
      if (finishedTestIds.has(tid)) return true;
      return blocked.has(this.quickItemKey(billItemId, tid));
    };
    const billPatient = this.quickBaseBillRow(billId) || {};
    const out:any[] = [];
    const insertedKeys = new Set<string>();
    let seq = 0;
    const nextOrder = (fallback:any) => { seq += 1; return (+fallback || 0) + seq / 1000; };
    const profileName = (p:any, fallback='Profile / group') => String(p?.display_name || p?.name || fallback || 'Profile / group').trim();
    const pushHeading = (billItemId:number, title:string, priority:any, kind='PROFILE', sourceProfileId:any=null, sourceProfileName:any='', departmentOverride:any=null, cardGroup:any=null) => {
      const text = String(title || '').trim();
      if (!text) return;
      // Only apply profile department when it has a real Masters name; otherwise leave blank.
      const deptName = String(departmentOverride?.name || '').trim();
      const deptPriority = deptName
        ? (departmentOverride?.priority == null || departmentOverride?.priority === '' ? 9999 : +departmentOverride.priority)
        : 9999;
      const reportOrder = +(priority || 0) || 0;
      // Unique key per heading text/kind so multiple INNER side-headers under one profile are kept.
      const itemKey = `H:${billItemId}:${String(kind || 'PROFILE').toUpperCase()}:${sourceProfileId || 0}:${text}:${reportOrder}`;
      // Card order within department only — department sort uses department_priority.
      const groupOrder = cardGroup != null && cardGroup !== ''
        ? +cardGroup
        : reportOrder;
      out.push({
        id: -(1000000000 + (++seq)), report_id: quickReportId || -billId, quick_report_id: quickReportId || 0,
        bill_id: billId, bill_item_id: billItemId, item_key: itemKey,
        test_id: null, test_name: text, department_name: deptName, side_header: kind === 'INNER' ? text : '', result_value: '', unit: '', normal_range: '', method: '',
        priority: nextOrder(priority), highlight_parameter: 0, heading_kind: kind, source_profile_id: sourceProfileId || null, source_profile_name: String(sourceProfileName || '').trim(),
        result_status: 'PENDING', selected_for_reporting: 1,
        department_id: deptName ? (departmentOverride?.id || null) : null,
        department_priority: deptPriority,
        group_order_override: groupOrder,
        report_order_override: reportOrder
      });
    };
    const pushTest = (billItemId:number, testId:number, priority:any, sourceProfileId:any=null, sourceProfileName:any='', departmentOverride:any=null, layoutMasterPriority:any=null, cardGroup:any=null) => {
      if (!testId) return;
      const key = this.quickItemKey(billItemId, testId);
      if (isBlockedTest(billItemId, testId) || insertedKeys.has(key)) return;
      const t = this.db.prepare(`SELECT t.*,d.name department_name,d.priority department_priority,u.name unit_name,
          tf.formula_expression, tf.predefined_formula_key, tf.rounding_decimals, tf.allow_manual_override, CASE WHEN tf.id IS NULL THEN 0 ELSE 1 END has_formula,
          (SELECT GROUP_CONCAT(tro.option_value || '::' || COALESCE(tro.option_label, tro.option_value), '||') FROM test_result_options tro WHERE tro.test_id=t.id AND tro.is_active=1) result_options,
          (SELECT GROUP_CONCAT(tfv.variable_key || '::' || tfv.source_test_id, '||') FROM test_formula_variables tfv WHERE tfv.formula_id=tf.id) formula_variables
        FROM tests t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN units u ON u.id=t.unit_id LEFT JOIN test_formulas tf ON tf.test_id=t.id AND tf.is_active=1
        WHERE t.id=? AND COALESCE(t.active,1)=1 AND COALESCE(t.active_for_reporting,1)=1`).get(testId) as any;
      if (!t?.id) return;
      insertedKeys.add(key);
      // Profile department wins only when Masters assigned a real department name.
      // Mixed / blank profile dept → each test keeps its own department + priority.
      const overrideName = String(departmentOverride?.name || '').trim();
      const deptName = overrideName || String(t.department_name || '').trim();
      const deptPriority = overrideName
        ? (departmentOverride?.priority == null || departmentOverride?.priority === '' ? 9999 : +departmentOverride.priority)
        : (t.department_priority == null || t.department_priority === '' ? 9999 : +t.department_priority);
      // Singles: Masters Report order only (not bill priority / billing_order).
      // Profile members: remapped layout slot for within-card test order (card group comes from profile Masters order).
      const isSingle = !(+(sourceProfileId || 0)) && !String(sourceProfileName || '').trim();
      const reportOrder = isSingle
        ? (+(t.report_order || t.priority || 0) || 0)
        : (+(priority || t.report_order || t.priority || 0) || 0);
      // group_order = card-within-department only. Department order is department_priority.
      // Singles default within=5000 (after profiles). Profiles share one cardGroup from Masters profile order.
      const groupOrder = isSingle
        ? 5000
        : (cardGroup != null && cardGroup !== '' ? +cardGroup : (+(priority || 0) || 0));
      const layoutMaster = !isSingle
        ? (+(layoutMasterPriority ?? 0) || +(priority || 0) || 0)
        : 0;
      out.push({
        id: this.quickSyntheticItemId(billItemId, testId), report_id: quickReportId || -billId, quick_report_id: quickReportId || 0,
        bill_id: billId, bill_item_id: billItemId, item_key: key, test_id: t.id, test_name: t.display_name || t.name, department_name: deptName, side_header: '',
        result_value: '', unit: t.unit_name || '', normal_range: this.selectedReferenceTextForItem({ test_id: t.id, normal_range: t.normal_range || '' }, billPatient) || t.normal_range || '', method: t.method || '', priority: nextOrder(reportOrder),
        highlight_parameter: t.highlight_parameter ? 1 : 0, heading_kind: '', source_profile_id: sourceProfileId || null, source_profile_name: sourceProfileName || '',
        result_status: 'PENDING', selected_for_reporting: 1, result_mode: t.result_mode, result_data_type: t.result_data_type, input_control_type: t.input_control_type,
        decimal_places: t.decimal_places, rounding_mode: t.rounding_mode, number_format: t.number_format, interpretation_enabled: t.interpretation_enabled,
        interpretation_text: t.interpretation_text, result_options: t.result_options || '', formula_expression: t.formula_expression, predefined_formula_key: t.predefined_formula_key || '', formula_variables: t.formula_variables || '', has_formula: t.has_formula || 0,
        department_id: overrideName ? (departmentOverride?.id || null) : (t.department_id || null),
        department_priority: deptPriority,
        group_order_override: groupOrder,
        report_order_override: reportOrder,
        master_report_order: +(t.report_order || t.priority || 0) || 0,
        master_profile_order: layoutMaster || null
      });
    };
    const profileHasAvailable = (billItemId:number, profileId:number, seen:Set<number>): boolean => {
      if (!profileId || seen.has(profileId)) return false;
      const p = this.db.prepare('SELECT id FROM profiles WHERE id=? AND COALESCE(active,1)=1 AND COALESCE(active_for_reporting,1)=1').get(profileId) as any;
      if (!p?.id) return false;
      const next = new Set(seen); next.add(profileId);
      const rows = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      if (rows.length) return rows.some(pi => String(pi.item_type || 'TEST').toUpperCase()==='TEST' ? !isBlockedTest(billItemId, +pi.test_id) : String(pi.item_type || '').toUpperCase()==='PROFILE' ? profileHasAvailable(billItemId, +pi.child_profile_id, next) : false);
      const pt = this.db.prepare('SELECT test_id FROM profile_tests WHERE profile_id=? ORDER BY priority').all(profileId) as any[];
      return pt.some(x => !isBlockedTest(billItemId, +x.test_id));
    };
    const expandProfile = (billItemId:number, profileId:number, showHeading:boolean, seen:Set<number>, fallbackPriority:any=0, sourceProfileId:any=null, sourceProfileName:any='', forceSource=false, departmentOverride:any=null) => {
      if (!profileId || seen.has(profileId) || !profileHasAvailable(billItemId, profileId, seen)) return;
      const p = this.db.prepare('SELECT p.*, d.name department_name, d.priority department_priority FROM profiles p LEFT JOIN departments d ON d.id=p.department_id WHERE p.id=? AND COALESCE(p.active,1)=1 AND COALESCE(p.active_for_reporting,1)=1').get(profileId) as any;
      if (!p?.id) return;
      const ownName = profileName(p, sourceProfileName || 'Profile / group');
      const ownSourceId = +p.id || sourceProfileId || null;
      const ownSourceName = ownName || sourceProfileName || '';
      const cardSourceId = forceSource || showHeading ? ownSourceId : (sourceProfileId || ownSourceId);
      const cardSourceName = forceSource || showHeading ? ownSourceName : (sourceProfileName || ownSourceName);
      const ownDepartment = {
        id: +p.department_id || null,
        name: String(p.department_name || '').trim(),
        priority: p.department_priority == null || p.department_priority === '' ? 9999 : +p.department_priority
      };
      // Nested profile that prints as its own card → that profile's Masters department.
      // Flattened nested content (no display name) → stay under parent department.
      // Own card with no Masters department (Mixed) → null so tests keep their own dept.
      const cardDepartment = (forceSource || showHeading)
        ? (ownDepartment.name ? ownDepartment : null)
        : (departmentOverride || (ownDepartment.name ? ownDepartment : null));
      // Profile card order = Masters report_order only (never billing_order / bill_items.priority).
      const profileOrder = +(p.report_order || p.priority || 0) || 0;
      const isOwnCard = !!(forceSource || showHeading);
      // Own card → Masters profile order. Flattened into parent → inherit parent layout slot.
      const cardGroup = isOwnCard ? profileOrder : (+fallbackPriority || profileOrder);
      // Remap nested layout into parent slot only when flattened; own cards stay on profileOrder.
      const slotBase = isOwnCard ? profileOrder : (+fallbackPriority || profileOrder);
      if (showHeading) pushHeading(billItemId, ownSourceName, cardGroup, 'PROFILE', ownSourceId, ownSourceName, cardDepartment, cardGroup);
      const next = new Set(seen); next.add(profileId);
      const rows = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      // Remap this profile's local priorities into the parent/card slot so a nested
      // profile ordered later inside a parent does not jump ahead via its own 1000/2000 masters.
      const localMin = rows.length ? Math.min(...rows.map((r:any) => +r.priority || 0)) : 0;
      const slotPri = (local:any) => slotBase + (((+local || 0) - localMin) / 1000);
      if (rows.length) {
        for (const pi of rows) {
          const type = String(pi.item_type || 'TEST').toUpperCase();
          const pri = slotPri(pi.priority);
          if (type === 'HEADER') pushHeading(billItemId, pi.side_header || pi.header_text || '', pri, 'INNER', cardSourceId, cardSourceName, cardDepartment, cardGroup);
          else if (type === 'PROFILE') {
            const childId = +pi.child_profile_id || 0;
            const layoutShow = pi.display_profile_name !== 0;
            // Masters show_profile_name hides the title only — keep own card / department when layout says show.
            let masterShow = true;
            try {
              const child = this.db.prepare('SELECT show_profile_name FROM profiles WHERE id=?').get(childId) as any;
              masterShow = Number(child?.show_profile_name ?? 1) !== 0;
            } catch { masterShow = true; }
            expandProfile(billItemId, childId, layoutShow && masterShow, next, pri, cardSourceId, cardSourceName, layoutShow, cardDepartment);
          }
          else pushTest(billItemId, +pi.test_id, pri, cardSourceId, cardSourceName, cardDepartment, +pi.priority || 0, cardGroup);
        }
      } else {
        const pt = this.db.prepare('SELECT pt.*,t.report_order,t.priority test_priority FROM profile_tests pt JOIN tests t ON t.id=pt.test_id WHERE pt.profile_id=? AND COALESCE(t.active_for_reporting,1)=1 ORDER BY pt.priority,t.report_order,t.priority').all(profileId) as any[];
        const ptMin = pt.length ? Math.min(...pt.map((r:any) => +(r.priority || r.report_order || r.test_priority || 0))) : 0;
        for (const r of pt) {
          const local = +(r.priority || r.report_order || r.test_priority || 0);
          pushTest(billItemId, +r.test_id, slotBase + ((local - ptMin) / 1000), cardSourceId, cardSourceName, cardDepartment, local, cardGroup);
        }
      }
    };
    const billItems = this.db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY priority,id').all(billId) as any[];
    for (const bi of billItems) {
      const type = String(bi.item_type || 'TEST').toUpperCase();
      if (type === 'TEST') pushTest(+bi.id, +bi.item_id, bi.priority);
      // Top-level profile cards: Masters report_order — do not pass bill priority.
      else if (type === 'PROFILE') expandProfile(+bi.id, +bi.item_id, true, new Set<number>(), 0, bi.item_id, bi.name, true);
    }
    // remove headings without following tests in the same source profile
    const filtered = out.filter((row, idx) => row.test_id || out.slice(idx + 1).some(n => n.test_id && String(n.source_profile_name || '') === String(row.source_profile_name || '')));
    this.attachResultOptions(filtered);
    return this.quickBarcodeSvc().decorateItems(filtered);
  }

  /**
   * Finished reports previously saved INNER side-headers with nextOrder() priority,
   * which could place them below later tests. Re-seat each INNER just before the
   * first following test according to the profile layout master order.
   * Also re-seat PROFILE card headers before their first test when report_order ties
   * (create path inserts headings after tests, so id-order alone puts tests first).
   */
  protected repairQuickFinishedInnerHeaderOrder(items:any[]) {
    if (!Array.isArray(items) || !items.length) return items;
    const byProfile = new Map<number, any[]>();
    for (const item of items) {
      const pid = +(item?.source_profile_id || 0);
      if (!pid) continue;
      if (!byProfile.has(pid)) byProfile.set(pid, []);
      byProfile.get(pid)!.push(item);
    }
    for (const [profileId, rows] of byProfile) {
      const layout = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      const masterTestPri = new Map<number, number>();
      const masterHeaderPri = new Map<string, number>();
      for (const pi of layout) {
        const type = String(pi.item_type || 'TEST').toUpperCase();
        const pri = +pi.priority || 0;
        if (type === 'TEST' && +pi.test_id) masterTestPri.set(+pi.test_id, pri);
        if (type === 'HEADER') {
          const text = String(pi.side_header || pi.header_text || '').trim().toLowerCase();
          if (text) masterHeaderPri.set(text, pri);
        }
      }
      const testOrders = rows.filter((r:any) => r?.test_id).map((r:any) => +(r.report_order_override ?? r.priority ?? 0));
      const minTestOrder = testOrders.length ? Math.min(...testOrders) : 0;

      for (const row of rows) {
        const kind = String(row?.heading_kind || '').toUpperCase();
        if (!row?.test_id && (kind === 'PROFILE' || !kind)) {
          // PROFILE card title must sort before its tests (create inserts headers last).
          row.report_order_override = minTestOrder - 0.0001;
          row.priority = row.report_order_override;
          continue;
        }
        if (kind !== 'INNER') continue;
        if (!layout.length) continue;
        const text = String(row.test_name || row.side_header || '').trim().toLowerCase();
        const headerPri = masterHeaderPri.get(text);
        if (headerPri == null) continue;
        const following = rows
          .filter((r:any) => r?.test_id && masterTestPri.has(+r.test_id) && (masterTestPri.get(+r.test_id) as number) > headerPri)
          .map((r:any) => ({ order: +(r.report_order_override ?? r.priority ?? 0) }));
        if (following.length) {
          const minFollow = Math.min(...following.map((x:any) => x.order));
          row.report_order_override = minFollow - 0.0001;
        } else {
          row.report_order_override = minTestOrder - 0.0001;
        }
        row.priority = row.report_order_override;
      }
    }
    items.sort((a:any, b:any) =>
      (+a.group_order_override || +a.priority || 0) - (+b.group_order_override || +b.priority || 0) ||
      (+(a.report_order_override ?? a.priority ?? 0)) - (+(b.report_order_override ?? b.priority ?? 0)) ||
      // Prefer headers before tests when numeric order ties.
      ((a.test_id ? 1 : 0) - (b.test_id ? 1 : 0)) ||
      (+a.id || 0) - (+b.id || 0)
    );
    return items;
  }

  /**
   * Department order = department_order_override when typing swapped depts, else Masters.
   * Card order = group_order_override within department only (never encodes dept).
   */
  protected repairQuickFinishedDepartmentOrder(items:any[]) {
    if (!Array.isArray(items) || !items.length) return items;
    let deptByName = new Map<string, number>();
    try {
      const depts = this.db.prepare(`SELECT name, priority FROM departments`).all() as any[];
      deptByName = new Map((depts || []).map((d:any) => [String(d?.name || '').trim().toLowerCase(), +(d?.priority ?? 9999)]));
    } catch { /* ignore */ }
    for (const item of items) {
      const name = String(item?.department_name || '').trim();
      const fromMasters = name ? deptByName.get(name.toLowerCase()) : undefined;
      const fromJoin = item?.department_priority != null && item?.department_priority !== '' ? +item.department_priority : NaN;
      const mastersPriority = fromMasters != null
        ? fromMasters
        : (Number.isFinite(fromJoin) ? fromJoin : 9999);
      const hasDeptOverride = item?.department_order_override !== null
        && item?.department_order_override !== undefined
        && item?.department_order_override !== ''
        && Number.isFinite(+item.department_order_override);
      const deptOverridden = !!(+item?.department_order_overridden === 1 || item?._departmentOrderOverridden || hasDeptOverride);
      if (deptOverridden && hasDeptOverride) {
        item.department_priority = +item.department_order_override;
        item._departmentOrderOverridden = true;
        item.department_order_overridden = 1;
      } else {
        item.department_priority = mastersPriority;
      }
      const hasTypedGroup = item?.group_order_override !== null && item?.group_order_override !== undefined && item?.group_order_override !== '';
      if (!hasTypedGroup) {
        const isSingle = !(+(item?.source_profile_id || 0)) && !String(item?.source_profile_name || '').trim();
        const ro = +(item?.report_order_override ?? item?.priority ?? 0) || 0;
        item.group_order_override = isSingle ? 5000 : ro;
      }
    }
    items.sort((a:any, b:any) =>
      (+(a.department_priority ?? 9999) || 9999) - (+(b.department_priority ?? 9999) || 9999) ||
      (+a.group_order_override || +a.priority || 0) - (+b.group_order_override || +b.priority || 0) ||
      (+(a.report_order_override ?? a.priority ?? 0)) - (+(b.report_order_override ?? b.priority ?? 0)) ||
      ((a.test_id ? 1 : 0) - (b.test_id ? 1 : 0)) ||
      (+a.id || 0) - (+b.id || 0)
    );
    return items;
  }

  protected getQuickPendingReport(billId:number) {
    const base = this.quickBaseBillRow(billId);
    if (!base?.bill_id) return null;
    const items = this.quickBuildBillItems(billId, false, 0);
    this.applyMasterReportOrderToSinglesUnlessTypingOverride(items);
    return { id: -billId, report_id: -billId, bill_id: billId, status: 'DRAFT', report_scope: 'QUICK', report_title: 'Quick Report Pending', item_count: items.filter((x:any)=>x.test_id).length, pending_count: items.filter((x:any)=>x.test_id).length, approved_count: 0, entered_count: 0, ready_for_entry_count: items.filter((x:any)=>x.test_id).length, entry_locked: 0, ...base, items };
  }

  protected getQuickFinishedReport(reportId:number) {
    const qr = this.db.prepare(`SELECT qr.*,b.bill_no,b.bill_date,b.patient_snapshot_json,p.id patient_id,p.patient_no,p.title patient_title,p.name patient_name,p.age,p.age_value,p.age_unit,p.gender,p.mobile,p.mobile patient_mobile,p.email patient_email,p.history,c.name consultant_name
      FROM quick_reports qr JOIN bills b ON b.id=qr.bill_id JOIN patients p ON p.id=qr.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE qr.id=?`).get(reportId) as any;
    if (!qr?.id) return null;
    const base = this.applyPatientSnapshotToRow(qr);
    const items = this.db.prepare(`SELECT qri.*,qri.quick_report_id report_id,qri.quick_report_id, 'APPROVED' result_status,
        COALESCE(
          CASE WHEN COALESCE(qri.source_profile_id,0)>0 AND TRIM(COALESCE(pd.name,'')) != '' THEN pd.name ELSE NULL END,
          NULLIF(TRIM(qri.department_name),''),
          td.name, pd.name, ''
        ) department_name,
        COALESCE(
          qri.department_order_override,
          CASE WHEN COALESCE(qri.source_profile_id,0)>0 AND pd.priority IS NOT NULL THEN pd.priority ELSE NULL END,
          td.priority, pd.priority, 9999
        ) department_priority,
        qri.department_order_override,
        qri.department_order_overridden,
        t.result_mode,t.result_data_type,t.input_control_type,t.decimal_places,t.rounding_mode,t.number_format,t.interpretation_enabled,t.interpretation_text,
        t.report_order master_report_order,
        1 flag_enabled,
        (SELECT p.interpretation_enabled FROM profiles p WHERE p.id=qri.source_profile_id) profile_interpretation_enabled,
        (SELECT p.interpretation_text FROM profiles p WHERE p.id=qri.source_profile_id) profile_interpretation_text,
        tf.formula_expression, tf.predefined_formula_key, tf.rounding_decimals, tf.allow_manual_override, CASE WHEN tf.id IS NULL THEN 0 ELSE 1 END has_formula,
        (SELECT GROUP_CONCAT(tro.option_value || '::' || COALESCE(tro.option_label, tro.option_value), '||') FROM test_result_options tro WHERE tro.test_id=qri.test_id AND tro.is_active=1) result_options,
        (SELECT GROUP_CONCAT(tfv.variable_key || '::' || tfv.source_test_id, '||') FROM test_formula_variables tfv WHERE tfv.formula_id=tf.id) formula_variables
      FROM quick_report_items qri
      LEFT JOIN tests t ON t.id=qri.test_id
      LEFT JOIN departments td ON td.id=t.department_id
      LEFT JOIN profiles sp ON sp.id=qri.source_profile_id
      LEFT JOIN departments pd ON pd.id=sp.department_id
      LEFT JOIN test_formulas tf ON tf.test_id=qri.test_id AND tf.is_active=1
      WHERE qri.quick_report_id=?
      ORDER BY COALESCE(qri.department_order_override, qri.group_order_override, CASE WHEN COALESCE(qri.source_profile_id,0)>0 THEN pd.priority ELSE td.priority END, qri.priority, 0),
               COALESCE(qri.group_order_override, 0),
               COALESCE(qri.report_order_override,qri.priority,0), qri.id`).all(reportId) as any[];
    this.repairQuickFinishedInnerHeaderOrder(items);
    this.repairQuickFinishedDepartmentOrder(items);
    this.applyMasterReportOrderToSinglesUnlessTypingOverride(items);
    this.attachMasterProfileOrders(items);
    this.attachResultOptions(items);
    this.quickBarcodeSvc().decorateItems(items);
    for (const item of items) {
      if (item?.test_id) {
        const selectedRef = this.pickReferenceRange(+item.test_id, base);
        const selectedReferenceText = String(selectedRef?.reference_text || item.normal_range || '').trim();
        if (selectedReferenceText) {
          item.selected_reference_text = selectedReferenceText;
          item.normal_range = selectedReferenceText;
        }
        item.selected_reference_gender = selectedRef?.gender || '';
        item.selected_reference_low = selectedRef?.lower_limit ?? null;
        item.selected_reference_high = selectedRef?.upper_limit ?? null;
        item.selected_reference_critical_low = selectedRef?.critical_low ?? null;
        item.selected_reference_critical_high = selectedRef?.critical_high ?? null;
        item.flag_enabled = selectedRef && Number(selectedRef.flag_enabled ?? 1) !== 0 ? 1 : 0;
        if (!item.flag_enabled) {
          item.flag_status = '';
          item.is_critical = 0;
          item.critical_message = '';
        }
      }
    }
    return this.attachProfileRemarks({ ...base, id: qr.id, report_id: qr.id, status: 'APPROVED', report_scope: 'QUICK', report_title: qr.report_no || 'Quick Report', item_count: items.filter((x:any)=>x.test_id).length, pending_count: 0, approved_count: items.filter((x:any)=>x.test_id).length, entered_count: 0, ready_for_entry_count: items.filter((x:any)=>x.test_id).length, entry_locked: 0, items });
  }


  quickReportingBarcodeState(reportOrBillId:number) {
    try {
      if (!this.isQuickReportingEnabled()) throw new Error('Quick Reporting barcode is available only in Quick Reporting mode.');
      const billId = +reportOrBillId < 0 ? Math.abs(+reportOrBillId) : +(this.db.prepare('SELECT bill_id FROM quick_reports WHERE id=?').get(+reportOrBillId) as any)?.bill_id || +reportOrBillId;
      const includeFinished = +reportOrBillId > 0;
      this.quickBarcodeSvc().repairBlankReleasedRows(billId);
      const items = this.quickBuildBillItems(billId, includeFinished, 0).filter((x:any)=>x.test_id);
      return this.quickBarcodeSvc().buildState(billId, items);
    } catch (err:any) {
      console.error('[quick-reporting-barcode-state]', err?.message || err);
      return { ok:false, success:false, error:String(err?.message || err || 'Unable to load barcode details.'), total:0, generated_count:0, pending_count:0, status:'ERROR', specimens:[], flat_items:[], generated_collections:[] };
    }
  }

  quickReportingBarcodeGenerate(reportOrBillId:number, payload:any={}) {
    if (!this.isQuickReportingEnabled()) throw new Error('Quick Reporting barcode is available only in Quick Reporting mode.');
    const billId = +reportOrBillId < 0 ? Math.abs(+reportOrBillId) : +(this.db.prepare('SELECT bill_id FROM quick_reports WHERE id=?').get(+reportOrBillId) as any)?.bill_id || +reportOrBillId;
    const includeFinished = +reportOrBillId > 0;
    const items = this.quickBuildBillItems(billId, includeFinished, 0).filter((x:any)=>x.test_id);
    const result = this.quickBarcodeSvc().generate(billId, items, payload || {});
    this.audit('quick_barcode.generate', `bill:${billId}:sample:${result.sample_id}:items:${result.affected_count}`);
    return result;
  }

  quickReportingBarcodeReset(reportOrBillId:number, payload:any={}) {
    if (!this.isQuickReportingEnabled()) throw new Error('Quick Reporting barcode is available only in Quick Reporting mode.');
    const billId = +reportOrBillId < 0 ? Math.abs(+reportOrBillId) : +(this.db.prepare('SELECT bill_id FROM quick_reports WHERE id=?').get(+reportOrBillId) as any)?.bill_id || +reportOrBillId;
    const includeFinished = +reportOrBillId > 0;
    const items = this.quickBuildBillItems(billId, includeFinished, 0).filter((x:any)=>x.test_id);
    const result = this.quickBarcodeSvc().reset(billId, items, payload || {});
    this.audit('quick_barcode.reset', `bill:${billId}:items:${result.affected_count}`);
    return result;
  }

  protected updateQuickFinishedReportItems(payload:any, current:any, selected:any[]) {
    const quickId = +payload.id || +current?.id || +current?.quick_report_id || 0;
    if (!quickId) throw new Error('Quick finished report id is required.');
    if (!selected.length) throw new Error('Select at least one test to update.');
    if (!this.selectionHasRealResultValue(selected)) {
      throw new Error('Enter at least one result value before saving the finished report. Empty-only reports are not allowed.');
    }
    const existingItems = (current?.items || []).filter((x:any)=>x?.test_id);
    const allowedIds = new Set(existingItems.map((x:any)=>+x.id).filter(Boolean));
    const selectedRows = selected.filter((x:any)=>+x.test_id);
    const missing = selectedRows.filter((x:any)=>!allowedIds.has(+x.id));
    if (missing.length) throw new Error('Selected finished report items were not found. Refresh the finished report and try again.');
    const selectedIds = new Set(selectedRows.map((x:any)=>+x.id).filter(Boolean));
    const returnUncheckedToPending = payload?.return_unchecked_to_pending === true || payload?.returnUncheckedToPending === true;
    const now = this.nowIst();
    const tx = this.db.transaction(() => {
      this.ensureColumn('quick_report_items', 'selected_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
      this.ensureColumn('quick_report_items', 'report_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('quick_report_items', 'group_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
      this.ensureColumn('quick_report_items', 'department_order_override', 'REAL');
      this.ensureColumn('quick_report_items', 'department_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
      const upd = this.db.prepare(`UPDATE quick_report_items SET
          result_value=?,
          unit=?,
          normal_range=?,
          method=?,
          side_header=?,
          priority=?,
          report_order_override=?,
          group_order_override=?,
          report_order_overridden=?,
          group_order_overridden=?,
          department_order_override=?,
          department_order_overridden=?,
          flag_status=?,
          is_critical=?,
          critical_message=?,
          formula_status=?,
          final_result_source=?,
          recheck_remarks=?,
          selected_for_reporting=?
        WHERE id=? AND quick_report_id=?`);
      for (const incoming of selectedRows) {
        const match = existingItems.find((x:any)=>+x.id === +incoming.id) || incoming;
        const source = incoming.final_result_source || match.final_result_source || 'MANUAL';
        let finalValue = source === 'OUTSOURCE'
          ? (incoming.outsource_result_value || incoming.result_value || match.result_value || '')
          : (incoming.result_value ?? match.result_value ?? '');
        finalValue = this.normalizeReportValueForTest({...match, ...incoming}, finalValue);
        const itemForRules = {...match, ...incoming, result_value: finalValue};
        const selectedReferenceText = this.selectedReferenceTextForItem(itemForRules, current || {});
        if (selectedReferenceText) itemForRules.normal_range = selectedReferenceText;
        const flags = this.applyResultFlagsToItem(itemForRules, current || {});
        const formulaStatus = itemForRules.test_id ? (String(itemForRules.formula_status || '').trim() || this.formulaDependencyStatus(+itemForRules.test_id, selected)) : '';
        // Trust UI order as saved (Masters default or typing ↑↓). Do not rewrite here.
        const reportOrder = itemForRules.report_order_override !== null && itemForRules.report_order_override !== undefined && itemForRules.report_order_override !== ''
          ? +itemForRules.report_order_override
          : (+itemForRules.priority || 0);
        const overridden = !!(itemForRules._reportOrderOverridden || +itemForRules.report_order_overridden === 1);
        const groupOverridden = !!(itemForRules._groupOrderOverridden || +itemForRules.group_order_overridden === 1);
        const deptOverridden = !!(itemForRules._departmentOrderOverridden || +itemForRules.department_order_overridden === 1
          || (itemForRules.department_order_override !== null && itemForRules.department_order_override !== undefined && itemForRules.department_order_override !== ''));
        const isSingle = !(+(itemForRules.source_profile_id || 0)) && !String(itemForRules.source_profile_name || '').trim();
        let groupOrder = itemForRules.group_order_override !== null && itemForRules.group_order_override !== undefined && itemForRules.group_order_override !== ''
          ? +itemForRules.group_order_override
          : null;
        if (isSingle) {
          // Keep UI card-within value (e.g. 5000). Do not collapse to department_priority.
          if (groupOrder == null || !Number.isFinite(+groupOrder)) groupOrder = 5000;
        }
        const deptOrder = deptOverridden
          ? +(itemForRules.department_order_override ?? itemForRules.department_priority ?? 9999)
          : null;
        upd.run(
          finalValue,
          itemForRules.unit || '',
          itemForRules.normal_range || '',
          itemForRules.method || '',
          itemForRules.side_header || '',
          reportOrder,
          reportOrder,
          groupOrder,
          overridden ? 1 : 0,
          groupOverridden ? 1 : 0,
          deptOrder,
          deptOverridden ? 1 : 0,
          flags.flag_status || '',
          flags.is_critical ? 1 : 0,
          flags.critical_message || '',
          formulaStatus,
          source,
          itemForRules.recheck_remarks || incoming.recheck_remarks || match.recheck_remarks || '',
          1,
          +incoming.id,
          quickId
        );
        // Keep barcode/instrument store in sync so decorateItems cannot resurrect old analyzer values.
        const billIdForSync = +match.bill_id || +current?.bill_id || 0;
        const itemKey = String(match.item_key || incoming.item_key || '').trim();
        if (billIdForSync && itemKey) {
          try {
            this.db.prepare(`UPDATE quick_reporting_barcode_items
              SET result_value=?, result_source=?, updated_at=?
              WHERE bill_id=? AND TRIM(COALESCE(item_key,''))=?`)
              .run(finalValue, String(source || 'MANUAL').toUpperCase() === 'ANALYZER' ? 'ANALYZER' : 'MANUAL', now, billIdForSync, itemKey);
          } catch { /* schema optional on older DBs */ }
        }
      }
      const existingIds = existingItems.map((x:any)=>+x.id).filter(Boolean);
      const uncheckedIds = existingIds.filter((id:number) => !selectedIds.has(id));
      if (uncheckedIds.length) {
        if (returnUncheckedToPending) {
          // Explicit option only: remove from finished so tests return to Pending.
          this.db.prepare(`DELETE FROM quick_report_items WHERE quick_report_id=? AND test_id IS NOT NULL AND id IN (${uncheckedIds.map(()=>'?').join(',')})`)
            .run(quickId, ...uncheckedIds);
          const remaining = this.db.prepare(`
            SELECT DISTINCT TRIM(COALESCE(source_profile_name,'')) profile_name,
                   COALESCE(source_profile_id,0) profile_id
            FROM quick_report_items
            WHERE quick_report_id=? AND test_id IS NOT NULL`).all(quickId) as any[];
          const keepNames = new Set(remaining.map((r:any) => String(r.profile_name || '').trim()).filter(Boolean));
          const keepIds = new Set(remaining.map((r:any) => +r.profile_id || 0).filter((n:number) => n > 0));
          const headings = this.db.prepare(`
            SELECT id, source_profile_id, source_profile_name
            FROM quick_report_items
            WHERE quick_report_id=? AND test_id IS NULL`).all(quickId) as any[];
          for (const h of headings) {
            const pid = +h.source_profile_id || 0;
            const name = String(h.source_profile_name || '').trim();
            const keep = (pid > 0 && keepIds.has(pid)) || (!!name && keepNames.has(name));
            if (!keep) this.db.prepare('DELETE FROM quick_report_items WHERE id=? AND quick_report_id=?').run(+h.id, quickId);
          }
        } else {
          // Default: preserve values; hide from finished PDF only.
          this.db.prepare(`UPDATE quick_report_items SET selected_for_reporting=0
            WHERE quick_report_id=? AND test_id IS NOT NULL AND id IN (${uncheckedIds.map(()=>'?').join(',')})`)
            .run(quickId, ...uncheckedIds);
        }
      }
      // Headings follow printable tests for each profile.
      const printable = this.db.prepare(`
        SELECT DISTINCT TRIM(COALESCE(source_profile_name,'')) profile_name,
               COALESCE(source_profile_id,0) profile_id
        FROM quick_report_items
        WHERE quick_report_id=? AND test_id IS NOT NULL AND COALESCE(selected_for_reporting,1)=1`).all(quickId) as any[];
      const printNames = new Set(printable.map((r:any) => String(r.profile_name || '').trim()).filter(Boolean));
      const printIds = new Set(printable.map((r:any) => +r.profile_id || 0).filter((n:number) => n > 0));
      const allHeadings = this.db.prepare(`
        SELECT id, source_profile_id, source_profile_name
        FROM quick_report_items WHERE quick_report_id=? AND test_id IS NULL`).all(quickId) as any[];
      const setHeading = this.db.prepare(`UPDATE quick_report_items SET selected_for_reporting=? WHERE id=? AND quick_report_id=?`);
      for (const h of allHeadings) {
        const pid = +h.source_profile_id || 0;
        const name = String(h.source_profile_name || '').trim();
        const include = (pid > 0 && printIds.has(pid)) || (!!name && printNames.has(name));
        setHeading.run(include ? 1 : 0, +h.id, quickId);
      }
      this.ensureColumn('quick_reports', 'profile_remarks_json', "TEXT NOT NULL DEFAULT '{}'");
      this.db.prepare(`UPDATE quick_reports SET
          typed_by=?,
          approved_by=?,
          remarks=?,
          profile_remarks_json=?,
          show_profile_name_on_report=?,
          show_sub_header_on_report=?,
          updated_at=?
        WHERE id=?`).run(payload.typed_by || '', payload.approved_by || '', payload.remarks || '', this.serializeProfileRemarksJson(payload), payload.show_profile_name === false ? 0 : 1, payload.show_sub_header === false ? 0 : 1, now, quickId);
      this.audit('quick_report.finished.update', `${quickId}:${selectedRows.length}:unchecked:${uncheckedIds.length}:returnPending:${returnUncheckedToPending ? 1 : 0}`);
      return quickId;
    });
    return tx();
  }

  protected createQuickFinishedReportFromSelection(payload:any, current:any, selected:any[]) {
    if (!selected.length) throw new Error('Select at least one test to finish.');
    if (!this.selectionHasRealResultValue(selected)) {
      throw new Error('Enter at least one result value before saving the finished report. Empty-only reports are not allowed.');
    }
    const billId = Math.abs(Number(current?.bill_id || payload.bill_id || payload.id || 0));
    const base = this.quickBaseBillRow(billId);
    if (!base?.bill_id) throw new Error('Bill not found for quick report.');
    const now = this.nowIst();
    this.ensureColumn('quick_report_items', 'report_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('quick_report_items', 'group_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('quick_report_items', 'department_order_override', 'REAL');
    this.ensureColumn('quick_report_items', 'department_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
    const tx = this.db.transaction(() => {
      const reportNo = this.nextConfiguredNo ? this.nextConfiguredNo('report', 'quick_reports', 'report_no') : `QR-${Date.now()}`;
      this.ensureColumn('quick_reports', 'profile_remarks_json', "TEXT NOT NULL DEFAULT '{}'");
      const quickId = Number(this.db.prepare(`INSERT INTO quick_reports(report_no,bill_id,patient_id,status,typed_by,approved_by,remarks,profile_remarks_json,show_profile_name_on_report,show_sub_header_on_report,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(reportNo, billId, +base.patient_id, 'FINISHED', payload.typed_by || '', payload.approved_by || '', payload.remarks || '', this.serializeProfileRemarksJson(payload), payload.show_profile_name === false ? 0 : 1, payload.show_sub_header === false ? 0 : 1, now, now).lastInsertRowid);
      const allPending = this.quickBuildBillItems(billId, false, quickId);
      const selectedKeys = new Set<string>();
      for (const incoming of selected) {
        const match = allPending.find((x:any)=>+x.id === +incoming.id && x.test_id);
        if (!match) continue;
        selectedKeys.add(String(match.item_key));
        const finalValue = this.normalizeReportValueForTest({...match, ...incoming}, incoming.result_value ?? match.result_value ?? '');
        const itemForRules = {...match, ...incoming, result_value: finalValue};
        const selectedReferenceText = this.selectedReferenceTextForItem(itemForRules, base);
        if (selectedReferenceText) itemForRules.normal_range = selectedReferenceText;
        const flags = this.applyResultFlagsToItem(itemForRules, base);
        // Singles: trust UI order (Masters default or typing ↑↓). Never rewrite from Masters here.
        const reportOrder = incoming.report_order_override !== null && incoming.report_order_override !== undefined && incoming.report_order_override !== ''
          ? +incoming.report_order_override
          : (match.report_order_override !== null && match.report_order_override !== undefined && match.report_order_override !== '' ? +match.report_order_override : (+match.priority || 0));
        const isSingle = !(+(match.source_profile_id || incoming.source_profile_id || 0))
          && !String(match.source_profile_name || incoming.source_profile_name || '').trim();
        let groupOrder = incoming.group_order_override !== null && incoming.group_order_override !== undefined && incoming.group_order_override !== ''
          ? +incoming.group_order_override
          : (match.group_order_override !== null && match.group_order_override !== undefined && match.group_order_override !== '' ? +match.group_order_override : (+match.priority || 0));
        if (isSingle) {
          // Keep UI card-within value. Do not collapse to department_priority.
          if (!Number.isFinite(+groupOrder)) groupOrder = 5000;
        }
        const overridden = !!(incoming._reportOrderOverridden || +incoming.report_order_overridden === 1);
        const groupOverridden = !!(incoming._groupOrderOverridden || +incoming.group_order_overridden === 1);
        const deptOverridden = !!(incoming._departmentOrderOverridden || +incoming.department_order_overridden === 1
          || (incoming.department_order_override !== null && incoming.department_order_override !== undefined && incoming.department_order_override !== ''));
        const deptOrder = deptOverridden
          ? +(incoming.department_order_override ?? incoming.department_priority ?? match.department_priority ?? 9999)
          : null;
        const departmentName = String(incoming.department_name || match.department_name || '').trim();
        this.db.prepare(`INSERT INTO quick_report_items(quick_report_id,bill_id,bill_item_id,item_key,test_id,test_name,department_name,side_header,result_value,unit,normal_range,method,priority,report_order_override,report_order_overridden,group_order_override,group_order_overridden,department_order_override,department_order_overridden,highlight_parameter,heading_kind,source_profile_id,source_profile_name,flag_status,is_critical,critical_message,formula_status,final_result_source,specimen_type_id,specimen_name,sample_id,barcode,collection_type,collect_timing,expected_collect_at,collection_date,collection_time,collection_datetime,barcode_generated,barcode_generated_at,recheck_remarks,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(quickId,billId,+match.bill_item_id,String(match.item_key),+match.test_id,match.test_name,departmentName,incoming.side_header||match.side_header||'',finalValue,incoming.unit||match.unit||'',itemForRules.normal_range||incoming.normal_range||match.normal_range||'',incoming.method||match.method||'',reportOrder,reportOrder,overridden?1:0,groupOrder,groupOverridden?1:0,deptOrder,deptOverridden?1:0,match.highlight_parameter?1:0,'',match.source_profile_id||null,match.source_profile_name||'',flags.flag_status||'',flags.is_critical?1:0,flags.critical_message||'',incoming.formula_status||match.formula_status||'',incoming.final_result_source||match.final_result_source||'MANUAL',+match.specimen_type_id||0,match.specimen_name||'',match.sample_id||'',match.barcode||match.sample_id||'',match.collection_type||match.sample_type||'',match.collect_timing||'NOW',match.expected_collect_at||'',match.collection_date||'',match.collection_time||'',match.collection_datetime||'',match.barcode_generated?1:0,match.barcode_generated_at||'',incoming.recheck_remarks||match.recheck_remarks||'',now);
        const itemKey = String(match.item_key || '').trim();
        if (itemKey) {
          try {
            const src = String(incoming.final_result_source || match.final_result_source || 'MANUAL').toUpperCase();
            this.db.prepare(`UPDATE quick_reporting_barcode_items
              SET result_value=?, result_source=?, updated_at=?
              WHERE bill_id=? AND TRIM(COALESCE(item_key,''))=?`)
              .run(finalValue, src === 'ANALYZER' ? 'ANALYZER' : 'MANUAL', now, billId, itemKey);
          } catch { /* optional */ }
        }
      }
      if (!selectedKeys.size) throw new Error('Selected tests were not found in Quick Reporting Pending. Refresh and try again.');
      // Copy only headings that belong to selected profile rows.
      const selectedProfileNames = new Set((allPending.filter((x:any)=>x.test_id && selectedKeys.has(String(x.item_key))).map((x:any)=>String(x.source_profile_name||'').trim()).filter(Boolean)));
      for (const h of allPending.filter((x:any)=>!x.test_id && selectedProfileNames.has(String(x.source_profile_name||'').trim()))) {
        const profileRows = selected.filter((x:any)=>String(x.source_profile_name || '').trim() === String(h.source_profile_name || '').trim());
        const headingGroupOrder = profileRows.reduce((best:number|null, x:any) => {
          const value = x.group_order_override !== null && x.group_order_override !== undefined && x.group_order_override !== '' ? +x.group_order_override : null;
          return value === null ? best : (best === null ? value : Math.min(best, value));
        }, null);
        // Use the pending layout order (report_order_override), not nextOrder() priority —
        // otherwise INNER side-headers can sort below later tests (e.g. under pH).
        // PROFILE card titles share the first test's order; seat them just before that test
        // so ORDER BY report_order, id does not put Total Cholesterol above the profile header.
        let headingReportOrder = h.report_order_override !== null && h.report_order_override !== undefined && h.report_order_override !== ''
          ? +h.report_order_override
          : (+h.priority || 0);
        const kind = String(h.heading_kind || 'PROFILE').toUpperCase();
        if (kind === 'PROFILE' || !kind) {
          const testOrders = profileRows
            .map((x:any) => x.report_order_override !== null && x.report_order_override !== undefined && x.report_order_override !== '' ? +x.report_order_override : null)
            .filter((n:number|null): n is number => n !== null && Number.isFinite(n));
          if (testOrders.length) headingReportOrder = Math.min(...testOrders) - 0.0001;
        }
        const headingGroup = headingGroupOrder ?? (h.group_order_override !== null && h.group_order_override !== undefined && h.group_order_override !== '' ? +h.group_order_override : headingReportOrder);
        const headingDeptOrder = profileRows.reduce((best:number|null, x:any) => {
          if (!(x._departmentOrderOverridden || +x.department_order_overridden === 1
            || (x.department_order_override !== null && x.department_order_override !== undefined && x.department_order_override !== ''))) {
            return best;
          }
          const value = +(x.department_order_override ?? x.department_priority ?? Number.NaN);
          return Number.isFinite(value) ? (best === null ? value : Math.min(best, value)) : best;
        }, null);
        this.db.prepare(`INSERT INTO quick_report_items(quick_report_id,bill_id,bill_item_id,item_key,test_id,test_name,department_name,side_header,result_value,unit,normal_range,method,priority,report_order_override,group_order_override,department_order_override,department_order_overridden,highlight_parameter,heading_kind,source_profile_id,source_profile_name,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(quickId,billId,+h.bill_item_id,String(h.item_key),null,h.test_name,h.department_name||'',h.side_header||'','','','','',headingReportOrder,headingReportOrder,headingGroup,headingDeptOrder,headingDeptOrder!=null?1:0,0,h.heading_kind||'PROFILE',h.source_profile_id||null,h.source_profile_name||'',now);
      }
      this.audit('quick_report.create', `${quickId}:${reportNo}:bill:${billId}`);
      return quickId;
    });
    return tx();
  }

  cancelQuickFinishedReport(reportId:number, reason='Cancelled from Finished Reports') {
    const qr = this.db.prepare('SELECT * FROM quick_reports WHERE id=?').get(reportId) as any;
    if (!qr?.id) throw new Error('Quick report not found.');
    const now = this.nowIst();
    this.db.prepare("UPDATE quick_reports SET status='CANCELLED', cancel_reason=?, cancelled_at=?, updated_at=? WHERE id=?").run(reason, now, now, reportId);
    this.releaseQuickBarcodeForCancelledReport(+reportId, +qr.bill_id, now);
    this.audit('quick_report.cancel', `${reportId}:${reason}`);
    return { cancelled:true, id:reportId, bill_id:+qr.bill_id };
  }

  deleteQuickFinishedReport(reportId:number, reason='Deleted from Finished Reports') { return this.cancelQuickFinishedReport(reportId, reason); }

  protected releaseQuickBarcodeForCancelledReport(reportId:number, billId:number, now:string) {
    if (!reportId || !billId) return;
    try {
      const reportRows = this.db.prepare(`
        SELECT DISTINCT item_key, sample_id
        FROM quick_report_items
        WHERE quick_report_id=?
          AND test_id IS NOT NULL
          AND TRIM(COALESCE(item_key,''))<>''
      `).all(reportId) as any[];
      const itemKeys = Array.from(new Set(reportRows.map((x:any)=>String(x.item_key || '').trim()).filter(Boolean)));
      const sampleIds = new Set<string>();
      for (const row of reportRows) {
        const sid = String(row?.sample_id || '').trim();
        if (sid) sampleIds.add(sid);
      }
      if (itemKeys.length) {
        const qbiRows = this.db.prepare(`
          SELECT sample_id FROM quick_reporting_barcode_items
          WHERE bill_id=?
            AND item_key=?
            AND TRIM(COALESCE(sample_id,''))<>''
        `);
        for (const key of itemKeys) {
          const row = qbiRows.get(billId, key) as any;
          const sid = String(row?.sample_id || '').trim();
          if (sid) sampleIds.add(sid);
        }
        const clearQuick = this.db.prepare(`
          DELETE FROM quick_reporting_barcode_items
          WHERE bill_id=? AND item_key=?
        `);
        for (const key of itemKeys) clearQuick.run(billId, key);
      }
      this.db.prepare(`
        UPDATE quick_report_items
        SET sample_id=NULL, barcode=NULL, collection_type=NULL, collection_date=NULL, collection_time=NULL, collection_datetime=NULL,
            barcode_generated=0, barcode_generated_at=NULL
        WHERE quick_report_id=? AND test_id IS NOT NULL
      `).run(reportId);
      try {
        const delHist = this.db.prepare(`DELETE FROM quick_reporting_barcode_used_sample_ids WHERE sample_id=?`);
        for (const sid of sampleIds) delHist.run(sid);
      } catch {}
    } catch (err:any) {
      console.error('[quick-barcode-release-cancelled-report]', err?.message || err);
    }
  }

  protected serializeProfileRemarksJson(payload:any): string {
    const raw = payload?.profile_remarks ?? payload?.profile_remarks_json;
    if (!raw) return '{}';
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '{}';
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsed)) {
          const key = String(k || '').trim();
          const text = String(v ?? '').trim();
          if (key && text) out[key] = text;
        }
        return JSON.stringify(out);
      } catch {
        return '{}';
      }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        const key = String(k || '').trim();
        const text = String(v ?? '').trim();
        if (key && text) out[key] = text;
      }
      return JSON.stringify(out);
    }
    return '{}';
  }

  protected attachProfileRemarks(row:any) {
    if (!row || typeof row !== 'object') return row;
    try {
      const raw = row.profile_remarks ?? row.profile_remarks_json;
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        row.profile_remarks = raw;
        return row;
      }
      row.profile_remarks = JSON.parse(String(raw || '{}') || '{}');
      if (!row.profile_remarks || typeof row.profile_remarks !== 'object' || Array.isArray(row.profile_remarks)) {
        row.profile_remarks = {};
      }
    } catch {
      row.profile_remarks = {};
    }
    return row;
  }

  saveReport(payload:any) {
    const current = this.getReport(+payload.id);
    const patient = current || {};
    const incoming = payload.items || [];
    const tx=this.db.transaction(()=>{
      const now = this.nowIst();
      const selected = incoming.filter((i:any) => i.selected_for_entry === true && i.selected_for_reporting !== false);
      if (this.isQuickReportingEnabled() && String(current?.report_scope || '').toUpperCase() === 'QUICK' && +payload.id > 0) {
        const quickId = this.updateQuickFinishedReportItems(payload, current, selected);
        return quickId;
      }
      if (this.isQuickReportingEnabled() && String(payload.status || '').toUpperCase() === 'APPROVED') {
        const quickId = this.createQuickFinishedReportFromSelection(payload, current || { bill_id: Math.abs(+payload.id || +payload.bill_id || 0) }, selected);
        return quickId;
      }
      const allowedIds = new Set((current?.items || []).map((x:any) => +x.id));
      const blocked = selected.filter((i:any) => !allowedIds.has(+i.id));
      if (blocked.length) throw new Error('Result entry is allowed only after Collection. Please collect the sample first.');
      const upd=this.db.prepare(`UPDATE report_items SET result_value=?,outsource_result_value=?,internal_check_value=?,internal_check_remarks=?,internal_check_status=?,final_result_source=?,vendor_result_method=?,vendor_report_file=?,vendor_report_status=?,unit=?,normal_range=?,method=?,side_header=?,priority=?,report_order_override=?,group_order_override=?,flag_status=?,is_critical=?,critical_message=?,formula_status=?,result_status=?,recheck_mode=?,recheck_status=?,recheck_requested_at=?,recheck_remarks=? WHERE id=?`);
      for (const i of selected) {
        const recheckModeForLock = String(i.recheck_mode || 'NONE').toUpperCase();
        const recheckStatusForLock = String(i.recheck_status || '').toUpperCase();
        if ((recheckModeForLock === 'OUTSOURCE' || recheckModeForLock === 'BOTH') && recheckStatusForLock && !['OUTSOURCE_RESULT_RECEIVED','WAITING_RECHECK_ENTRY','DONE','NONE'].includes(recheckStatusForLock)) {
          throw new Error('Outsource recheck result entry is locked until Collection dispatch is completed and vendor result is received.');
        }
        const internalStatus = +i.internal_check_required === 1 ? (String(i.internal_check_value || '').trim() ? 'DONE' : 'PENDING') : 'NOT_REQUIRED';
        const source = i.final_result_source || (i.collection_mode === 'OUTSOURCE' ? 'OUTSOURCE' : 'MANUAL');
        let finalValue = source === 'VENDOR_REPORT' || String(i.vendor_result_method || '').toUpperCase() === 'ATTACH_REPORT_ONLY' ? (String(i.vendor_report_file || '').trim() ? 'See attached vendor report' : '') : source === 'OUTSOURCE' ? (i.outsource_result_value || i.result_value || '') : source === 'INTERNAL_CHECK' ? (i.internal_check_value || i.result_value || '') : (i.result_value || '');
        // Do not calculate formulas automatically here. Reporting calculates only when the user clicks the calculate icon.
        let formulaStatus = i.test_id ? (String(i.formula_status || '').trim() || this.formulaDependencyStatus(+i.test_id, incoming)) : '';
        finalValue = this.normalizeReportValueForTest(i, finalValue);
        i.result_value = finalValue;
        const selectedReferenceText = this.selectedReferenceTextForItem(i, patient);
        if (selectedReferenceText) i.normal_range = selectedReferenceText;
        const flags = this.applyResultFlagsToItem(i, patient);
        const orderOverride = i.report_order_override !== null && i.report_order_override !== undefined && i.report_order_override !== '' ? +i.report_order_override : null;
        const groupOverride = i.group_order_override !== null && i.group_order_override !== undefined && i.group_order_override !== '' ? +i.group_order_override : null;
        const priority = orderOverride !== null ? orderOverride : (+i.priority || 0);
        const requestedStatus = String(payload.status || 'DRAFT').toUpperCase();
        const hasFinalValue = String(finalValue || '').trim() !== '';
        // Save Draft must never push a row into Waiting Approval.
        // Only Submit for Approval moves selected rows to ENTERED, and only if a real result exists.
        const nextStatus = requestedStatus === 'APPROVED'
          ? (hasFinalValue ? 'APPROVED' : 'PENDING')
          : (requestedStatus === 'TYPED' || requestedStatus === 'ENTERED' || requestedStatus === 'WAITING_APPROVAL')
            ? (hasFinalValue ? 'ENTERED' : 'PENDING')
            : 'PENDING';
        const recheckMode = String(i.recheck_mode || 'NONE').toUpperCase();
        const wasPendingRecheck = recheckMode !== 'NONE' && String(i.recheck_status || 'REQUESTED').toUpperCase() !== 'DONE';
        const recheckStatus = recheckMode === 'NONE' ? 'NONE' : (payload.recheck_entry_mode && String(finalValue || '').trim() ? 'DONE' : (String(i.recheck_status || 'REQUESTED').toUpperCase()));
        const recheckAt = recheckMode === 'NONE' ? null : (i.recheck_requested_at || now);
        upd.run(finalValue,i.outsource_result_value||'',i.internal_check_value||'',i.internal_check_remarks||'',internalStatus,source,i.vendor_result_method||'ENTER_VALUES',i.vendor_report_file||'',i.vendor_report_status || (String(i.vendor_report_file||'').trim() ? 'RECEIVED' : 'PENDING'),i.unit||'',i.normal_range||'',i.method||'',i.side_header||'',priority,orderOverride,groupOverride,flags.flag_status,flags.is_critical,flags.critical_message,formulaStatus,nextStatus,recheckMode,recheckStatus,recheckAt,i.recheck_remarks||'',i.id);
      }
      const statusCounts = this.db.prepare(`SELECT
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='PENDING' OR TRIM(COALESCE(result_value,''))='' THEN 1 ELSE 0 END) pending_count,
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='ENTERED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) entered_count,
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='APPROVED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) approved_count
        FROM report_items ri
        WHERE report_id=? AND test_id IS NOT NULL AND COALESCE(selected_for_reporting,1)=1 AND ${this.reportReadyCollectionStatusesSql('ri')}`).get(payload.id) as any;
      const remaining = +statusCounts?.pending_count || 0;
      const enteredCount = +statusCounts?.entered_count || 0;
      const approvedCount = +statusCounts?.approved_count || 0;
      // Report row status is only a queue summary. Do not mark the whole report/sample
      // APPROVED while any other item in the same sample/report is still pending or
      // waiting approval. Item-level result_status is the source of truth.
      const finalStatus = remaining > 0 ? 'DRAFT' : (enteredCount > 0 ? 'TYPED' : (approvedCount > 0 ? 'APPROVED' : 'DRAFT'));
      this.ensureColumn('reports', 'profile_remarks_json', "TEXT NOT NULL DEFAULT '{}'");
      this.db.prepare('UPDATE reports SET status=?,remarks=?,profile_remarks_json=?,typed_by=?,approved_by=?,show_profile_name_on_report=?,show_sub_header_on_report=?,updated_at=? WHERE id=?').run(finalStatus,payload.remarks||'',this.serializeProfileRemarksJson(payload),payload.typed_by||'',payload.approved_by||'',payload.show_profile_name === false ? 0 : 1,payload.show_sub_header === false ? 0 : 1,now,payload.id);
      this.db.prepare(`UPDATE specimen_collections
        SET internal_check_status = CASE WHEN (SELECT COUNT(*) FROM specimen_collection_tests sct JOIN report_items ri ON ri.id=sct.report_item_id WHERE sct.collection_id=specimen_collections.id AND ri.internal_check_required=1 AND COALESCE(ri.internal_check_status,'PENDING')<>'DONE')=0 THEN 'DONE' ELSE 'PENDING' END,
            internal_checked_at = CASE WHEN (SELECT COUNT(*) FROM specimen_collection_tests sct JOIN report_items ri ON ri.id=sct.report_item_id WHERE sct.collection_id=specimen_collections.id AND ri.internal_check_required=1 AND COALESCE(ri.internal_check_status,'PENDING')<>'DONE')=0 THEN COALESCE(internal_checked_at, ?) ELSE internal_checked_at END,
            updated_at=?
        WHERE internal_check_required=1`).run(now, now);
      const correctionReason = String(payload.correction_reason || payload.correction_remarks || '').trim();
      const isCorrectionReopen = +current?.id === +payload.id && String(current?.status || '').toUpperCase() === 'APPROVED' && payload.status === 'TYPED' && correctionReason;
      if (isCorrectionReopen) {
        this.audit('report.correction.reopen', `${payload.id}:${correctionReason}`);
      } else if (payload.recheck_entry_mode) {
        this.audit('report.recheck.done', String(payload.id));
      } else {
        const auditAction = finalStatus === 'APPROVED' ? 'report.approve' : (finalStatus === 'TYPED' ? 'report.submit.approval' : 'report.draft.save');
        this.audit(auditAction, String(payload.id));
      }
    });
    const changedReportId = tx() as number | undefined;
    return this.getReport(Number(changedReportId ?? payload.id));
  }


  protected ensureReportDeliverySchema() {
    const cols = this.db.prepare("PRAGMA table_info(reports)").all() as any[];
    const has = (name:string) => cols.some(c => c.name === name);
    const add = (name:string, type:string) => { if (!has(name)) this.db.exec(`ALTER TABLE reports ADD COLUMN ${name} ${type}`); };
    add('pdf_exported_at', 'TEXT');
    add('printed_at', 'TEXT');
    add('emailed_at', 'TEXT');
    add('smsed_at', 'TEXT');
    add('delivery_status', 'TEXT');
    add('show_profile_name_on_report', 'INTEGER NOT NULL DEFAULT 1');
    add('show_sub_header_on_report', 'INTEGER NOT NULL DEFAULT 1');
  }

  markReportDelivery(reportId:number, channel:string, details:string='') {
    const now = this.nowIst();
    const normalized = String(channel || '').toUpperCase();
    const col = normalized === 'PDF_EXPORT' ? 'pdf_exported_at' : normalized === 'PRINT' ? 'printed_at' : normalized === 'EMAIL' ? 'emailed_at' : normalized === 'SMS' ? 'smsed_at' : '';
    if (!col) throw new Error('Unknown report delivery channel.');
    const label = normalized === 'PDF_EXPORT' ? 'PDF_EXPORTED' : normalized === 'PRINT' ? 'PRINTED' : normalized === 'EMAIL' ? 'EMAILED' : 'SMS_SENT';
    if (this.isQuickReportingEnabled()) {
      const qr = this.db.prepare('SELECT id,status FROM quick_reports WHERE id=?').get(reportId) as any;
      if (qr?.id) {
        this.db.prepare('UPDATE quick_reports SET updated_at=? WHERE id=?').run(now, reportId);
        this.audit(`quick_report.delivery.${normalized.toLowerCase()}`, `${reportId}:${details || label}`);
        return this.getReport(reportId);
      }
    }
    const r = this.db.prepare('SELECT id,status FROM reports WHERE id=?').get(reportId) as any;
    if (!r?.id) throw new Error('Report not found');
    if (String(r.status || '').toUpperCase() !== 'APPROVED') throw new Error('Delivery actions are allowed only for approved reports.');
    this.db.prepare(`UPDATE reports SET ${col}=?, delivery_status=?, updated_at=? WHERE id=?`).run(now, label, now, reportId);
    this.audit(`report.delivery.${normalized.toLowerCase()}`, `${reportId}:${details || label}`);
    return this.getReport(reportId);
  }


  protected ensureCollectionSchema() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS specimen_collections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  specimen_id TEXT NOT NULL UNIQUE,
  specimen_type_id INTEGER,
  specimen_name TEXT NOT NULL,
  sample_type TEXT,
  collection_mode TEXT NOT NULL DEFAULT 'INHOUSE',
  outsource_vendor_id INTEGER,
  sample_priority TEXT NOT NULL DEFAULT 'ROUTINE',
  dispatch_status TEXT NOT NULL DEFAULT 'READY',
  status TEXT NOT NULL DEFAULT 'COLLECTED',
  collect_timing TEXT NOT NULL DEFAULT 'NOW',
  expected_collect_at TEXT,
  remarks TEXT,
  collected_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  rejected_at TEXT,
  reject_reason TEXT,
  parent_collection_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY(specimen_type_id) REFERENCES specimen_types(id),
  FOREIGN KEY(parent_collection_id) REFERENCES specimen_collections(id)
);
CREATE TABLE IF NOT EXISTS specimen_collection_tests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER NOT NULL,
  report_item_id INTEGER,
  test_id INTEGER,
  test_name TEXT,
  FOREIGN KEY(collection_id) REFERENCES specimen_collections(id) ON DELETE CASCADE,
  FOREIGN KEY(report_item_id) REFERENCES report_items(id),
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
CREATE INDEX IF NOT EXISTS idx_specimen_collection_bill ON specimen_collections(bill_id,status,collection_mode);
CREATE INDEX IF NOT EXISTS idx_specimen_collection_date ON specimen_collections(collected_at);
CREATE INDEX IF NOT EXISTS idx_specimen_collection_tests_report ON specimen_collection_tests(report_item_id);
`);
    this.ensureColumn('report_items', 'source_report_item_id', 'INTEGER');
    this.ensureColumn('specimen_collection_tests', 'source_report_item_id', 'INTEGER');
    this.ensureColumn('specimen_collection_tests', 'collection_mode', 'TEXT');
    this.ensureColumn('specimen_collection_tests', 'internal_check_required', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('specimen_collection_tests', 'outsource_vendor_id', 'INTEGER');
    this.ensureColumn('report_items', 'collection_status', "TEXT NOT NULL DEFAULT 'PENDING'");
    this.ensureColumn('report_items', 'collection_request_status', "TEXT NOT NULL DEFAULT 'REQUEST_PENDING'");
    this.ensureColumn('report_items', 'specimen_id', 'TEXT');
    this.ensureColumn('report_items', 'specimen_type_id', 'INTEGER');
    this.ensureColumn('report_items', 'specimen_name', 'TEXT');
    this.ensureColumn('report_items', 'sample_type', 'TEXT');
    this.ensureColumn('report_items', 'sample_remarks', 'TEXT');
    this.ensureColumn('report_items', 'collection_datetime', 'TEXT');
    this.ensureColumn('report_items', 'collection_type', 'TEXT');
    this.ensureColumn('report_items', 'collect_timing', "TEXT NOT NULL DEFAULT 'NOW'");
    this.ensureColumn('report_items', 'expected_collect_at', 'TEXT');
    this.ensureColumn('report_items', 'barcode_generated_at', 'TEXT');
    this.ensureColumn('report_items', 'collection_mode', 'TEXT');
    this.ensureColumn('report_items', 'outsource_result_value', 'TEXT');
    this.ensureColumn('report_items', 'internal_check_required', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('report_items', 'internal_check_value', 'TEXT');
    this.ensureColumn('report_items', 'internal_check_remarks', 'TEXT');
    this.ensureColumn('report_items', 'internal_check_status', "TEXT NOT NULL DEFAULT 'NOT_REQUIRED'");
    this.ensureColumn('report_items', 'final_result_source', "TEXT NOT NULL DEFAULT 'MANUAL'");
    this.ensureColumn('report_items', 'vendor_result_method', "TEXT NOT NULL DEFAULT 'ENTER_VALUES'");
    this.ensureColumn('report_items', 'vendor_report_file', 'TEXT');
    this.ensureColumn('report_items', 'vendor_report_status', "TEXT NOT NULL DEFAULT 'PENDING'");
    this.ensureColumn('report_items', 'recheck_vendor_id', 'INTEGER');
    this.ensureColumn('report_items', 'recheck_reverted_at', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_collection_status', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_collection_mode', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_final_result_source', 'TEXT');
    this.ensureColumn('report_items', 'original_report_item_id', 'INTEGER');
    this.ensureColumn('report_items', 'moved_to_recheck_report_id', 'INTEGER');
    this.ensureColumn('report_items', 'recheck_child_report_item_id', 'INTEGER');
    this.ensureColumn('report_items', 'is_recheck_item', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('report_items', 'excluded_from_approval', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('report_items', 'original_result_value', 'TEXT');
    this.ensureColumn('specimen_collections', 'internal_check_required', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('specimen_collections', 'internal_check_value', 'TEXT');
    this.ensureColumn('specimen_collections', 'internal_check_remarks', 'TEXT');
    this.ensureColumn('specimen_collections', 'internal_check_status', "TEXT NOT NULL DEFAULT 'NOT_REQUIRED'");
    this.ensureColumn('specimen_collections', 'internal_checked_at', 'TEXT');
    this.ensureColumn('specimen_collections', 'outsource_vendor_id', 'INTEGER');
    this.ensureColumn('specimen_collections', 'sample_priority', "TEXT NOT NULL DEFAULT 'ROUTINE'");
    this.ensureColumn('specimen_collections', 'dispatch_status', "TEXT NOT NULL DEFAULT 'READY'");
    this.ensureColumn('specimen_collections', 'source_type', "TEXT NOT NULL DEFAULT 'NORMAL'");
    this.ensureColumn('specimen_collections', 'sample_identification', "TEXT NOT NULL DEFAULT 'NORMAL'");
    this.ensureColumn('specimen_collections', 'recheck_report_id', 'INTEGER');
    this.ensureColumn('report_items', 'sample_priority', "TEXT NOT NULL DEFAULT 'ROUTINE'");
    this.ensureColumn('report_items', 'result_status', "TEXT NOT NULL DEFAULT 'PENDING'");
    this.ensureColumn('report_items', 'selected_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('report_items', 'report_order_override', 'REAL');
    this.ensureColumn('report_items', 'group_order_override', 'REAL');
    const specimenCount = (this.db.prepare('SELECT COUNT(*) c FROM specimen_types').get() as any)?.c || 0;
    if (!specimenCount) ['Blood','Serum','Plasma','Urine','Stool','Swab'].forEach((name, i) => {
      this.db.prepare('INSERT OR IGNORE INTO specimen_types(name,code,is_active) VALUES(?,?,?)').run(name, name.slice(0,3).toUpperCase(), 1);
    });
  }

  protected collectionDatePrefix(dateValue?: any) {
    const raw = String(dateValue || this.nowIst()).slice(0, 10);
    const [y, m, d] = raw.split('-');
    return `${d || '01'}${m || '01'}${y || '1970'}`;
  }

  protected specimenCode(specimenName: string) {
    const clean = String(specimenName || 'SP').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (clean.slice(0, 3) || 'SPM').padEnd(3, 'X');
  }

  protected nextSpecimenId(specimenName: string, dateValue?: any) {
    const prefix = this.collectionDatePrefix(dateValue) + this.specimenCode(specimenName);
    const row = this.db.prepare('SELECT specimen_id FROM specimen_collections WHERE specimen_id LIKE ? ORDER BY specimen_id DESC LIMIT 1').get(`${prefix}%`) as any;
    const last = row?.specimen_id ? Number(String(row.specimen_id).slice(-4)) : 0;
    return `${prefix}${String(last + 1).padStart(4, '0')}`;
  }

  protected ensureReportForBill(billId: number) {
    if (this.isQuickReportingEnabled()) return 0;
    this.ensureMultiReportSchema();
    const existing = this.db.prepare("SELECT id FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION')='STAGING' ORDER BY id LIMIT 1").get(billId) as any;
    if (existing?.id) {
      this.repairCollectedReportProfileSources(+existing.id, billId);
      return existing.id;
    }
    this.rebuildReportFromBill(billId, 'STAGING');
    return (this.db.prepare("SELECT id FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION')='STAGING' ORDER BY id LIMIT 1").get(billId) as any)?.id || 0;
  }


  getBarcodeBill(billId: number) {
    this.ensureCollectionSchema();
    this.ensureReportForBill(billId);
    this.pruneDeletedBillPendingRequestItems(billId);
    const bill = this.db.prepare(`SELECT b.id,b.bill_no,b.bill_date,p.title patient_title,p.name patient_name,p.mobile,c.name consultant_name
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE b.id=?`).get(billId) as any;
    if (!bill) return null;
    const rows = this.db.prepare(`SELECT ri.id report_item_id, ri.test_id, ri.test_name, ri.department_name, ri.source_profile_id, ri.source_profile_name,
        COALESCE(ri.specimen_id,'') specimen_id, COALESCE(ri.specimen_type_id,0) specimen_type_id, COALESCE(ri.specimen_name,'') specimen_name,
        COALESCE(ri.sample_type,'') sample_type, COALESCE(ri.collection_type,'') collection_type, COALESCE(ri.collection_datetime,'') collection_datetime,
        COALESCE(ri.collect_timing,'NOW') collect_timing, COALESCE(ri.expected_collect_at,'') expected_collect_at,
        COALESCE(t.collection_rule,'NORMAL') collection_rule, COALESCE(t.fasting_hours,8) fasting_hours,
        COALESCE(t.collection_gap_minutes,120) collection_gap_minutes, COALESCE(t.collection_dependency,'NONE') collection_dependency,
        COALESCE(t.same_specimen_allowed,1) same_specimen_allowed, COALESCE(t.collection_instruction,'') collection_instruction
      FROM reports r JOIN report_items ri ON ri.report_id=r.id LEFT JOIN tests t ON t.id=ri.test_id
      WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL
        AND COALESCE(ri.selected_for_reporting,1)=1
        AND UPPER(COALESCE(ri.collection_status,'PENDING')) NOT IN ('CANCELLED')
      ORDER BY ri.priority, ri.test_name`).all(billId) as any[];
    const options = this.db.prepare(`SELECT m.test_id,s.id,s.name,s.code,m.is_default,m.display_order
      FROM test_specimen_mappings m JOIN specimen_types s ON s.id=m.specimen_type_id
      WHERE s.is_active=1 ORDER BY m.display_order,s.name`).all() as any[];
    const fallback = this.db.prepare(`SELECT id,name,code,0 is_default,1000 display_order FROM specimen_types WHERE is_active=1 ORDER BY name LIMIT 1`).get() as any;
    const tests = rows.map(r => {
      let opts = options.filter(o => +o.test_id === +r.test_id);
      if (!opts.length && fallback?.id) opts = [fallback];
      const def = opts.find(o => +o.is_default === 1) || opts[0] || null;
      return { ...r, specimen_options: opts, default_specimen_type_id:def?.id || 0, default_specimen_name:def?.name || '' };
    });
    return { bill, tests };
  }

  generateBarcodeForBill(payload: any) {
    this.ensureCollectionSchema();
    const billId = +payload?.bill_id || 0;
    const ids = Array.from(new Set((payload?.report_item_ids || []).map((x:any)=>+x || 0).filter(Boolean))) as number[];
    if (!billId) throw new Error('Bill is required for barcode generation.');
    if (!ids.length) throw new Error('Select one specimen/collection group to generate barcode.');
    this.assertCollectionUnlockedForReportItems(ids, 'Barcode generation');
    const specimenTypeId = +payload?.specimen_type_id || 0;
    const specimenName = String(payload?.specimen_name || '').trim();
    const collectionType = String(payload?.collection_type || payload?.sample_type || 'Random').trim() || 'Random';
    const collectionDateTime = String(payload?.collection_datetime || this.nowIst()).replace('T',' ').slice(0,16);
    const collectTiming = String(payload?.collect_timing || 'NOW').toUpperCase() === 'LATER' ? 'LATER' : 'NOW';
    const expectedCollectAt = String(payload?.expected_collect_at || '').trim();
    const now = this.nowIst();
    const placeholders = ids.map(()=>'?').join(',');
    const rows = this.db.prepare(`SELECT ri.id,ri.test_name,COALESCE(ri.specimen_id,'') specimen_id,COALESCE(ri.specimen_type_id,0) specimen_type_id,COALESCE(ri.specimen_name,'') specimen_name
      FROM reports r JOIN report_items ri ON ri.report_id=r.id
      WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.id IN (${placeholders}) AND ri.test_id IS NOT NULL AND COALESCE(ri.selected_for_reporting,1)=1`).all(billId, ...ids) as any[];
    if (rows.length !== ids.length) throw new Error('Some selected barcode items are no longer active. Refresh and try again.');
    const already = rows.filter(r=>String(r.specimen_id || '').trim());
    if (already.length) throw new Error('Selected item already has a sample ID. Use Reset Barcode before regenerating it.');
    const existingFromItems = this.db.prepare(`SELECT ri.specimen_id FROM reports r JOIN report_items ri ON ri.report_id=r.id
      WHERE r.bill_id=? AND ri.test_id IS NOT NULL AND TRIM(COALESCE(ri.specimen_id,''))<>''
        AND (COALESCE(ri.specimen_type_id,0)=? OR lower(COALESCE(ri.specimen_name,''))=lower(?))
      ORDER BY ri.id LIMIT 1`).get(billId, specimenTypeId, specimenName) as any;
    const existingFromCollection = this.db.prepare(`SELECT specimen_id FROM specimen_collections
      WHERE bill_id=? AND TRIM(COALESCE(specimen_id,''))<>'' AND COALESCE(status,'') NOT IN ('CANCELLED','REJECTED')
        AND (COALESCE(specimen_type_id,0)=? OR lower(COALESCE(specimen_name,''))=lower(?))
      ORDER BY id LIMIT 1`).get(billId, specimenTypeId, specimenName) as any;
    const specimenId = String(existingFromItems?.specimen_id || existingFromCollection?.specimen_id || this.nextSpecimenId(specimenName, collectionDateTime));
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE report_items SET
          collection_status='COLLECTED',
          specimen_id=?, specimen_type_id=?, specimen_name=?, sample_type=?, collection_type=?, collection_datetime=?, collect_timing=?, expected_collect_at=?, barcode_generated_at=?,
          sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE id IN (${placeholders})`).run(specimenId, specimenTypeId || null, specimenName, specimenName, collectionType, collectionDateTime, collectTiming, expectedCollectAt, now, `Barcode generated: ${specimenId} / ${collectionType} / ${collectionDateTime}`, ...ids);
      this.audit('barcode.generate', `Bill ${billId}: ${specimenId}: ${ids.length} item(s): ${collectionType} ${collectionDateTime}`);
      return { specimen_id: specimenId, updated: ids.length };
    });
    return tx();
  }

  resetBarcodeForBill(payload: any) {
    this.ensureCollectionSchema();
    const billId = +payload?.bill_id || 0;
    const ids = Array.from(new Set((payload?.report_item_ids || []).map((x:any)=>+x || 0).filter(Boolean))) as number[];
    if (!billId) throw new Error('Bill is required for barcode reset.');
    let targetIds = ids;
    if (!targetIds.length) {
      targetIds = (this.db.prepare(`SELECT ri.id FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL AND TRIM(COALESCE(ri.specimen_id,''))<>''`).all(billId) as any[]).map(x=>+x.id).filter(Boolean);
    }
    if (!targetIds.length) throw new Error('No barcode generated to reset.');
    this.assertCollectionUnlockedForReportItems(targetIds, 'Barcode reset');
    const placeholders = targetIds.map(()=>'?').join(',');
    const now = this.nowIst();
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE report_items SET
          collection_status='PENDING', specimen_id=NULL, specimen_type_id=NULL, specimen_name=NULL, sample_type=NULL, collection_type=NULL, collection_datetime=NULL, collect_timing='NOW', expected_collect_at=NULL, barcode_generated_at=NULL,
          collection_mode=NULL, internal_check_required=0, internal_check_status='NOT_REQUIRED', final_result_source='MANUAL', sample_priority='ROUTINE',
          sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE id IN (${placeholders})`).run(`Barcode reset ${now}`, ...targetIds);
      this.audit('barcode.reset', `Bill ${billId}: ${targetIds.length} item(s)`);
      return { reset: targetIds.length };
    });
    return tx();
  }

  listCollectionPending(accepted = false) {
    if (this.isQuickReportingEnabled()) return [];
    this.ensureCollectionSchema();
    const requestStatus = accepted ? 'ACCEPTED' : 'REQUEST_PENDING';
    const bills = this.db.prepare(`SELECT b.id,b.bill_no,b.bill_date,p.title patient_title,p.name patient_name,p.mobile,p.patient_no,p.age,p.gender,c.name consultant_name
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE b.status <> 'CANCELLED' ORDER BY b.id DESC LIMIT 500`).all() as any[];
    const out:any[] = [];
    for (const b of bills) {
      this.ensureReportForBill(+b.id);
      this.pruneDeletedBillPendingRequestItems(+b.id);
      const row = this.db.prepare(`SELECT COUNT(*) c, SUM(CASE WHEN COALESCE(ri.sample_remarks,'') LIKE '%Report rejected for recollection%' THEN 1 ELSE 0 END) recollection_count FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL AND COALESCE(ri.collection_status,'PENDING')='PENDING'
          AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')=?
          AND NOT EXISTS (
            SELECT 1 FROM specimen_collection_tests dsct
            JOIN specimen_collections dsc ON dsc.id=dsct.collection_id
            LEFT JOIN report_items dri ON dri.id=dsct.report_item_id
            WHERE dsc.bill_id=r.bill_id
              AND COALESCE(dsc.status,'') NOT IN ('CANCELLED','REJECTED','RECOLLECT_REQUESTED','RECHECK_REJECTED','RECHECK_REVERTED','RECHECK_CANCELLED')
              AND COALESCE(dri.test_id, dsct.test_id)=ri.test_id
          )`).get(b.id, requestStatus) as any;
      if ((+row?.c || 0) > 0) {
        const total = this.db.prepare(`SELECT COUNT(*) c FROM reports r JOIN report_items ri ON ri.report_id=r.id
          WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL AND COALESCE(ri.selected_for_reporting,1)=1 AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')=?`).get(b.id, requestStatus) as any;
        const pendingRows = this.db.prepare(`SELECT ri.id report_item_id, ri.test_name, COALESCE(ri.sample_type,'') sample_type, COALESCE(ri.sample_remarks,'') sample_remarks,
            COALESCE(t.collection_rule,'NORMAL') collection_rule, COALESCE(t.collection_gap_minutes,120) collection_gap_minutes,
            COALESCE(t.collection_dependency,'NONE') collection_dependency, COALESCE(t.collection_instruction,'') collection_instruction
          FROM reports r JOIN report_items ri ON ri.report_id=r.id LEFT JOIN tests t ON t.id=ri.test_id
          WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL AND COALESCE(ri.collection_status,'PENDING')='PENDING'
          AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')=?
          AND NOT EXISTS (
            SELECT 1 FROM specimen_collection_tests dsct
            JOIN specimen_collections dsc ON dsc.id=dsct.collection_id
            LEFT JOIN report_items dri ON dri.id=dsct.report_item_id
            WHERE dsc.bill_id=r.bill_id
              AND COALESCE(dsc.status,'') NOT IN ('CANCELLED','REJECTED','RECOLLECT_REQUESTED','RECHECK_REJECTED','RECHECK_REVERTED','RECHECK_CANCELLED')
              AND COALESCE(dri.test_id, dsct.test_id)=ri.test_id
          )
          ORDER BY CASE WHEN COALESCE(t.collection_rule,'NORMAL')<>'NORMAL' THEN 0 ELSE 1 END, ri.priority, ri.test_name`).all(b.id, requestStatus) as any[];
        const picked = pendingRows[0] || {};
        const previous = this.db.prepare(`SELECT sc.id, sc.specimen_id, sc.specimen_name, COALESCE(sc.sample_type,'') sample_type,
            COALESCE(sc.collect_timing,'NOW') collect_timing, COALESCE(sc.expected_collect_at,'') expected_collect_at, sc.collected_at,
            GROUP_CONCAT(COALESCE(sct.test_name,''), ', ') test_names
          FROM specimen_collections sc LEFT JOIN specimen_collection_tests sct ON sct.collection_id=sc.id
          WHERE sc.bill_id=? AND COALESCE(sc.status,'') NOT IN ('CANCELLED','REJECTED')
          GROUP BY sc.id ORDER BY datetime(sc.collected_at) DESC LIMIT 1`).get(b.id) as any;
        const previousSame = picked?.sample_type ? this.db.prepare(`SELECT COUNT(*) c FROM specimen_collections sc
          WHERE sc.bill_id=? AND COALESCE(sc.status,'') NOT IN ('CANCELLED','REJECTED') AND lower(COALESCE(sc.sample_type,''))=lower(?)`).get(b.id, picked.sample_type) as any : { c:0 };
        out.push({
          ...b,
          pending_count:+row.c,
          recollection_count:+row.recollection_count || 0,
          total_parameter_count:+total?.c || +row.c || 0,
          pending_test_name:picked?.test_name || '',
          pending_sample_type:picked?.sample_type || '',
          pending_collection_rule:picked?.collection_rule || 'NORMAL',
          pending_collection_gap_minutes:+picked?.collection_gap_minutes || 0,
          pending_collection_dependency:picked?.collection_dependency || 'NONE',
          pending_collection_instruction:picked?.collection_instruction || picked?.sample_remarks || '',
          previous_collected_at:previous?.collected_at || '',
          previous_sample_type:previous?.sample_type || '',
          previous_specimen_name:previous?.specimen_name || '',
          previous_specimen_id:previous?.specimen_id || '',
          previous_test_names:previous?.test_names || '',
          previous_same_sample_collected_count:+previousSame?.c || 0
        });
      }
    }
    return out;
  }



  listAcceptedCollectionPending() {
    return this.listCollectionPending(true);
  }

  acceptCollectionRequest(billId: number) {
    if (this.isQuickReportingEnabled()) throw new Error('Collection workflow is disabled while Quick Reporting is enabled.');
    this.ensureCollectionSchema();
    this.ensureReportForBill(billId);
    this.pruneDeletedBillPendingRequestItems(billId);
    const result = this.db.prepare(`UPDATE report_items
      SET collection_request_status='ACCEPTED'
      WHERE id IN (
        SELECT ri.id
        FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=?
          AND COALESCE(r.report_scope,'COLLECTION')='STAGING'
          AND ri.test_id IS NOT NULL
          AND COALESCE(ri.collection_status,'PENDING')='PENDING'
          AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')='REQUEST_PENDING'
          AND NOT EXISTS (
            SELECT 1 FROM specimen_collection_tests sct
            JOIN specimen_collections sc ON sc.id=sct.collection_id
            LEFT JOIN report_items cri ON cri.id=sct.report_item_id
            WHERE sc.bill_id=r.bill_id
              AND COALESCE(sc.status,'') NOT IN ('CANCELLED','REJECTED','RECOLLECT_REQUESTED','RECHECK_REJECTED','RECHECK_REVERTED','RECHECK_CANCELLED')
              AND COALESCE(cri.test_id, sct.test_id)=ri.test_id
          )
      )`).run(billId);
    this.audit('collection.request.accepted', `Bill ${billId}: accepted ${result.changes || 0} test request(s) for collection.`);
    return { accepted: result.changes || 0 };
  }

  cancelAcceptedCollectionRequest(billId: number) {
    if (this.isQuickReportingEnabled()) throw new Error('Collection workflow is disabled while Quick Reporting is enabled.');
    this.ensureCollectionSchema();
    this.ensureReportForBill(billId);
    this.pruneDeletedBillPendingRequestItems(billId);

    const activeCollection = this.db.prepare(`SELECT COUNT(*) c
      FROM specimen_collections sc
      WHERE sc.bill_id=?
        AND COALESCE(sc.status,'') NOT IN ('CANCELLED','REJECTED','RECOLLECT_REQUESTED','RECHECK_REJECTED','RECHECK_REVERTED','RECHECK_CANCELLED')`).get(billId) as any;
    if ((+activeCollection?.c || 0) > 0) {
      throw new Error('Cannot cancel collection because at least one item/specimen is already collected.');
    }

    const result = this.db.prepare(`UPDATE report_items
      SET collection_request_status='REQUEST_PENDING'
      WHERE id IN (
        SELECT ri.id
        FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=?
          AND COALESCE(r.report_scope,'COLLECTION')='STAGING'
          AND ri.test_id IS NOT NULL
          AND COALESCE(ri.collection_status,'PENDING')='PENDING'
          AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')='ACCEPTED'
          AND NOT EXISTS (SELECT 1 FROM specimen_collection_tests sct WHERE sct.report_item_id=ri.id)
      )`).run(billId);
    this.audit('collection.request.cancelled', `Bill ${billId}: moved ${result.changes || 0} accepted collection request item(s) back to pending requests.`);
    return { cancelled: result.changes || 0 };
  }

  protected pruneDeletedBillPendingRequestItems(billId: number) {
    this.ensureCollectionSchema();
    const report = this.db.prepare("SELECT id FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION')='STAGING' ORDER BY id LIMIT 1").get(billId) as any;
    const reportId = +report?.id || 0;
    if (!reportId) return;
    this.db.prepare(`DELETE FROM report_items
      WHERE report_id=?
        AND test_id IS NOT NULL
        AND COALESCE(collection_status,'PENDING')='PENDING'
        AND NOT EXISTS (SELECT 1 FROM specimen_collection_tests sct WHERE sct.report_item_id=report_items.id)
        AND NOT EXISTS (
          SELECT 1 FROM bill_items bi
          WHERE bi.bill_id=?
            AND (
              (UPPER(COALESCE(bi.item_type,''))='TEST' AND bi.item_id=report_items.test_id)
              OR (UPPER(COALESCE(bi.item_type,''))='PROFILE' AND bi.item_id=COALESCE(report_items.source_profile_id,0))
            )
        )`).run(reportId, billId);
  }
  getCollectionBill(billId: number) {
    this.ensureCollectionSchema();
    this.ensureReportForBill(billId);
    this.pruneDeletedBillPendingRequestItems(billId);
    const bill = this.db.prepare(`SELECT b.id,b.bill_no,b.bill_date,p.title patient_title,p.name patient_name,p.mobile,c.name consultant_name
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE b.id=?`).get(billId) as any;
    if (!bill) return null;
    const rows = this.db.prepare(`SELECT ri.id report_item_id, ri.test_id, ri.test_name, ri.department_name, ri.source_profile_id, ri.source_profile_name,
        COALESCE(t.collection_rule,'NORMAL') collection_rule, COALESCE(t.fasting_hours,8) fasting_hours,
        COALESCE(t.collection_gap_minutes,120) collection_gap_minutes, COALESCE(t.collection_dependency,'NONE') collection_dependency,
        COALESCE(t.same_specimen_allowed,1) same_specimen_allowed, COALESCE(t.collection_instruction,'') collection_instruction
      FROM reports r JOIN report_items ri ON ri.report_id=r.id LEFT JOIN tests t ON t.id=ri.test_id
      WHERE r.bill_id=? AND COALESCE(r.report_scope,'COLLECTION')='STAGING' AND ri.test_id IS NOT NULL AND COALESCE(ri.collection_status,'PENDING')='PENDING'
          AND COALESCE(ri.collection_request_status,'REQUEST_PENDING')='ACCEPTED'
          AND NOT EXISTS (
            SELECT 1 FROM specimen_collection_tests dsct
            JOIN specimen_collections dsc ON dsc.id=dsct.collection_id
            LEFT JOIN report_items dri ON dri.id=dsct.report_item_id
            WHERE dsc.bill_id=r.bill_id
              AND COALESCE(dsc.status,'') NOT IN ('CANCELLED','REJECTED','RECOLLECT_REQUESTED','RECHECK_REJECTED','RECHECK_REVERTED','RECHECK_CANCELLED')
              AND COALESCE(dri.test_id, dsct.test_id)=ri.test_id
          )
      ORDER BY ri.priority, ri.test_name`).all(billId) as any[];
    const options = this.db.prepare(`SELECT m.test_id,s.id,s.name,s.code,m.is_default,m.display_order
      FROM test_specimen_mappings m JOIN specimen_types s ON s.id=m.specimen_type_id
      WHERE s.is_active=1 ORDER BY m.display_order,s.name`).all() as any[];
    const fallback = this.db.prepare(`SELECT id,name,code,0 is_default,1000 display_order FROM specimen_types WHERE is_active=1 ORDER BY name LIMIT 1`).get() as any;
    const tests = rows.map(r => {
      let opts = options.filter(o => +o.test_id === +r.test_id);
      if (!opts.length && fallback?.id) opts = [fallback];
      const def = opts.find(o => +o.is_default === 1) || opts[0] || null;
      return { ...r, specimen_options: opts, default_specimen_type_id:def?.id || 0, default_specimen_name:def?.name || '' };
    });
    return { bill, tests };
  }


  protected collectionLockedRowsForReportItems(reportItemIds: number[]) {
    const ids = Array.from(new Set((reportItemIds || []).map(x => +x || 0).filter(Boolean)));
    if (!ids.length) return [] as any[];
    const placeholders = ids.map(() => '?').join(',');

    // Collection/rejection must be locked only after real report entry starts.
    // Outsource logistics like vendor pending, dispatched, received or PDF uploaded
    // are not final lab results by themselves and must remain rejectable.
    return this.db.prepare(`SELECT ri.id report_item_id, ri.test_name, COALESCE(ri.result_status,'PENDING') result_status,
        COALESCE(ri.final_result_source,'MANUAL') final_result_source,
        COALESCE(ri.vendor_report_status,'') vendor_report_status,
        COALESCE(ri.collection_status,'PENDING') collection_status,
        COALESCE(ri.result_value,'') result_value,
        COALESCE(ri.outsource_result_value,'') outsource_result_value,
        COALESCE(ri.internal_check_value,'') internal_check_value,
        COALESCE(r.status,'DRAFT') report_status, b.bill_no
      FROM report_items ri
      JOIN reports r ON r.id=ri.report_id
      JOIN bills b ON b.id=r.bill_id
      WHERE ri.id IN (${placeholders})
        AND (
          TRIM(COALESCE(ri.result_value,'')) NOT IN ('','See attached vendor report')
          OR TRIM(COALESCE(ri.outsource_result_value,''))<>''
          OR TRIM(COALESCE(ri.internal_check_value,''))<>''
        )
        AND (
          COALESCE(ri.result_status,'PENDING') IN ('ENTERED','APPROVED')
          OR COALESCE(r.status,'DRAFT') IN ('TYPED','WAITING_APPROVAL','PENDING_APPROVAL','APPROVED')
        )`).all(...ids) as any[];
  }

  protected assertCollectionUnlockedForReportItems(reportItemIds: number[], actionLabel: string) {
    const locked = this.collectionLockedRowsForReportItems(reportItemIds);
    if (!locked.length) return;
    const names = locked.slice(0, 5).map((x:any) => x.test_name || ('Item ' + x.report_item_id)).join(', ');
    const more = locked.length > 5 ? ` +${locked.length - 5} more` : '';
    throw new Error(`${actionLabel} blocked. Result already entered/approved for: ${names}${more}. Reopen/correct the report workflow first; Collection cannot be changed for entered or approved tests.`);
  }

  protected reportItemIdsForCollection(collectionId: number) {
    return (this.db.prepare('SELECT report_item_id FROM specimen_collection_tests WHERE collection_id=?').all(collectionId) as any[])
      .map(x => +x.report_item_id).filter(Boolean);
  }

  protected collectionRowModeSql() {
    // For Collection tabs, classify rows by each collected test/workflow, not by the physical specimen row.
    // sct.collection_mode survives pending-report removal, while ri can be deleted/unlinked.
    return "COALESCE(NULLIF(TRIM(sct.collection_mode),''), NULLIF(TRIM(ri.collection_mode),''), NULLIF(TRIM(sc.collection_mode),''), 'INHOUSE')";
  }


  protected createPendingReportForCollectionSegment(billId:number, collectionId:number, workflowKey:string, vendorId:number|null, sourceReportItemIds:number[], title:string) {
    this.ensureMultiReportSchema();
    const ids = Array.from(new Set((sourceReportItemIds || []).map(x=>+x).filter(Boolean)));
    if (!billId || !collectionId || !ids.length) return 0;
    const now = this.nowIst();
    const reportId = Number(this.db.prepare(`INSERT INTO reports(bill_id,status,created_at,updated_at,report_scope,source_collection_id,workflow_key,queue_vendor_id,report_title)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(billId, 'DRAFT', now, now, 'COLLECTION', collectionId, workflowKey, vendorId || null, title || workflowKey).lastInsertRowid);
    const sourceRows = this.db.prepare(`SELECT * FROM report_items WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY COALESCE(group_order_override, priority, 0), COALESCE(report_order_override, priority, 0), id`).all(...ids) as any[];
    const insertHeading = this.db.prepare(`INSERT INTO report_items(report_id,test_id,test_name,department_name,side_header,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name,selected_for_reporting,collection_status,result_status)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const insertItem = this.db.prepare(`INSERT INTO report_items(report_id,test_id,test_name,department_name,side_header,result_value,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name,flag_status,is_critical,critical_message,formula_status,result_status,selected_for_reporting,report_order_override,group_order_override,recheck_mode,recheck_status,sample_priority,source_report_item_id)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const newIds = new Map<number, number>();
    const insertedHeadings = new Set<string>();
    for (const src of sourceRows) {
      const profileName = String(src.source_profile_name || '').trim();
      const profileId = +(src.source_profile_id || 0) || null;
      const headingKey = profileName ? `${profileId || 0}|${profileName}` : '';
      if (headingKey && !insertedHeadings.has(headingKey)) {
        insertedHeadings.add(headingKey);
        insertHeading.run(reportId, null, profileName, '', '', '', '', '', +(src.group_order_override || src.priority || 0) - 0.01, 0, 'PROFILE', profileId, profileName, 1, 'PENDING', 'PENDING');
      }
      const info = insertItem.run(reportId, src.test_id || null, src.test_name || '', src.department_name || '', src.side_header || '', '', src.unit || '', src.normal_range || '', src.method || '', +(src.priority || 0), +(src.highlight_parameter || 0), '', src.source_profile_id || null, src.source_profile_name || '', '', 0, '', '', 'PENDING', 1, src.report_order_override ?? null, src.group_order_override ?? null, 'NONE', 'NONE', src.sample_priority || 'ROUTINE', +src.id || null);
      newIds.set(+src.id, Number(info.lastInsertRowid));
    }
    return { reportId, newIds } as any;
  }

  protected resetSourceReportItemsForCollection(collectionId:number, reason:string) {
    const id = +collectionId || 0;
    if (!id) return 0;
    const rows = this.db.prepare(`SELECT sct.id sct_id, sct.test_id, sct.source_report_item_id sct_source_id,
        ri.source_report_item_id ri_source_id, ri.id workflow_report_item_id,
        sc.bill_id, sc.specimen_id, sc.specimen_name, sc.sample_type
      FROM specimen_collection_tests sct
      JOIN specimen_collections sc ON sc.id=sct.collection_id
      LEFT JOIN report_items ri ON ri.id=sct.report_item_id
      WHERE sct.collection_id=?`).all(id) as any[];
    const sourceIds = new Set<number>();
    for (const row of rows) {
      const direct = +(row.sct_source_id || row.ri_source_id || 0);
      if (direct) { sourceIds.add(direct); continue; }
      // Fallback for older rows created before source_report_item_id existed.
      const fallback = this.db.prepare(`SELECT ri.id FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=? AND ri.test_id=? AND COALESCE(r.report_scope,'')<>'COLLECTION'
          AND (COALESCE(ri.specimen_id,'')='' OR COALESCE(ri.specimen_id,'')=?)
        ORDER BY ri.id LIMIT 1`).get(row.bill_id, row.test_id, row.specimen_id || '') as any;
      if (+fallback?.id) sourceIds.add(+fallback.id);
    }
    const ids = Array.from(sourceIds).filter(Boolean);
    if (!ids.length) return 0;
    const placeholders = ids.map(()=>'?').join(',');
    this.db.prepare(`UPDATE report_items SET
        collection_status='PENDING',
        result_status=CASE WHEN COALESCE(result_status,'PENDING') IN ('PENDING','') THEN 'PENDING' ELSE result_status END,
        specimen_id=NULL,
        specimen_type_id=NULL,
        specimen_name=NULL,
        sample_type=NULL,
        sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?),
        collection_mode=NULL,
        internal_check_required=0,
        internal_check_status='NOT_REQUIRED',
        outsource_result_value=NULL,
        internal_check_value=NULL,
        internal_check_remarks=NULL,
        final_result_source='MANUAL',
        sample_priority='ROUTINE'
      WHERE id IN (${placeholders})`).run(reason || 'Collection reversed to pending', ...ids);
    this.audit('collection.source_items.pending', `${collectionId}:${ids.length}:${reason || ''}`);
    return ids.length;
  }

  protected deletePendingReportsForCollection(collectionId:number, reason:string) {
    const id = +collectionId || 0;
    if (!id) return;
    const linked = this.db.prepare(`SELECT DISTINCT ri.report_id, ri.id report_item_id
      FROM specimen_collection_tests sct
      JOIN report_items ri ON ri.id=sct.report_item_id
      JOIN reports r ON r.id=ri.report_id
      WHERE sct.collection_id=? AND COALESCE(r.report_scope,'COLLECTION')='COLLECTION'`).all(id) as any[];
    const byReport = new Map<number, number[]>();
    for (const x of linked) {
      const rid = +x.report_id || 0;
      const iid = +x.report_item_id || 0;
      if (!rid || !iid) continue;
      if (!byReport.has(rid)) byReport.set(rid, []);
      byReport.get(rid)!.push(iid);
    }
    for (const [reportId, itemIds] of byReport.entries()) {
      const stat = this.db.prepare(`SELECT r.id,r.status,
          SUM(CASE WHEN ri.test_id IS NOT NULL THEN 1 ELSE 0 END) item_count,
          SUM(CASE WHEN ri.test_id IS NOT NULL AND (COALESCE(ri.result_status,'PENDING')<>'PENDING' OR TRIM(COALESCE(ri.result_value,''))<>'') THEN 1 ELSE 0 END) touched_count
        FROM reports r LEFT JOIN report_items ri ON ri.report_id=r.id
        WHERE r.id=? GROUP BY r.id`).get(reportId) as any;
      if (!stat) continue;
      const status = String(stat.status || 'DRAFT').toUpperCase();
      const untouched = (+stat.touched_count || 0) === 0 && ['DRAFT','PENDING'].includes(status);
      if (!untouched) continue;
      const placeholders = itemIds.map(()=>'?').join(',');
      // Important: specimen_collection_tests has an FK to report_items.
      // Unlink the collection rows first, then delete the untouched pending report items.
      this.db.prepare(`UPDATE specimen_collection_tests SET report_item_id=NULL WHERE collection_id=? AND report_item_id IN (${placeholders})`).run(collectionId, ...itemIds);
      this.db.prepare(`DELETE FROM report_items WHERE id IN (${placeholders})`).run(...itemIds);
      // Remove profile headings that no longer have any real test item below them in this report.
      this.db.prepare(`DELETE FROM report_items
        WHERE report_id=? AND COALESCE(heading_kind,'')='PROFILE'
          AND NOT EXISTS (
            SELECT 1 FROM report_items child
            WHERE child.report_id=report_items.report_id
              AND child.test_id IS NOT NULL
              AND COALESCE(child.source_profile_id,0)=COALESCE(report_items.source_profile_id,0)
              AND COALESCE(child.source_profile_name,'')=COALESCE(report_items.source_profile_name,'')
          )`).run(reportId);
      const remaining = this.db.prepare(`SELECT COUNT(*) cnt FROM report_items WHERE report_id=? AND test_id IS NOT NULL`).get(reportId) as any;
      if ((+remaining?.cnt || 0) === 0) {
        this.db.prepare('DELETE FROM report_items WHERE report_id=?').run(reportId);
        this.db.prepare('DELETE FROM reports WHERE id=?').run(reportId);
        this.audit('report.pending.delete.collection', `${reportId}:${collectionId}:${reason}`);
      } else {
        this.db.prepare('UPDATE reports SET updated_at=? WHERE id=?').run(this.nowIst(), reportId);
        this.audit('report.pending.items.delete.collection', `${reportId}:${collectionId}:${itemIds.length}:${reason}`);
      }
    }
  }

  saveCollection(payload: any) {
    this.ensureCollectionSchema();
    this.ensureMultiReportSchema();
    const billId = +payload.bill_id || 0;
    if (!billId) throw new Error('Bill is required for collection.');
    const groups = Array.isArray(payload.groups) ? payload.groups : [];
    if (!groups.length) throw new Error('No specimen groups selected.');
    const selectedIds = groups.flatMap((g:any) => Array.isArray(g.tests) ? g.tests.map((t:any) => +t.report_item_id || 0) : []).filter(Boolean);
    this.assertCollectionUnlockedForReportItems(selectedIds, 'Collection save');
    const tx = this.db.transaction(() => {
      const created:any[] = [];
      const reportSegments = new Map<string, any>();
      const now = this.nowIst();
      const insertTest = this.db.prepare('INSERT INTO specimen_collection_tests(collection_id,report_item_id,test_id,test_name,source_report_item_id,collection_mode,internal_check_required,outsource_vendor_id) VALUES(?,?,?,?,?,?,?,?)');
      const updateRi = this.db.prepare(`UPDATE report_items SET collection_status=?, specimen_id=?, specimen_type_id=?, specimen_name=?, sample_type=?, sample_remarks=?, collection_mode=?, internal_check_required=?, internal_check_status=?, final_result_source=?, sample_priority=? WHERE id=?`);

      const testMode = (t:any) => String(t?.collection_mode || t?.mode || 'INHOUSE').toUpperCase();
      const isTestOutsource = (t:any) => testMode(t) === 'OUTSOURCE' || testMode(t) === 'BOTH';
      const isTestInternal = (t:any) => testMode(t) === 'BOTH' || t?.internal_check_required === true || +(t?.internal_check_required || 0) === 1;

      // First create the physical specimen/barcode collection rows exactly as Collection UI grouped them.
      // Then create reports from report workflow groups across the whole save session, not per specimen.
      // Example: Serum + Urine, both FASTING + INHOUSE in the same collection save => one pending report.
      for (const g of groups) {
        const specimenName = String(g.specimen_name || 'Specimen');
        const tests = Array.isArray(g.tests) ? g.tests : [];
        const hasOutsource = tests.some(isTestOutsource);
        const internalCheckRequired = tests.some(isTestInternal);
        const physicalMode = hasOutsource ? 'OUTSOURCE' : 'INHOUSE';
        const status = physicalMode === 'OUTSOURCE' ? 'OUTSOURCE_READY' : 'COLLECTED';
        const internalCheckStatus = internalCheckRequired ? 'PENDING' : 'NOT_REQUIRED';
        const outsourceVendorId = physicalMode === 'OUTSOURCE' ? (+(tests.find(isTestOutsource)?.outsource_vendor_id || g.outsource_vendor_id) || 0) : null;
        const missingVendor = tests.find((t:any) => isTestOutsource(t) && !(+t.outsource_vendor_id || +g.outsource_vendor_id));
        if (missingVendor) throw new Error(`Outsource vendor is required for ${missingVendor.test_name || 'outsourced test'}.`);
        const samplePriority = String(g.sample_priority || 'ROUTINE').toUpperCase();
        const dispatchStatus = physicalMode === 'OUTSOURCE' ? 'READY' : 'NOT_REQUIRED';
        const specimenId = this.nextSpecimenId(specimenName, now);
        const info = this.db.prepare(`INSERT INTO specimen_collections(bill_id,specimen_id,specimen_type_id,specimen_name,sample_type,collection_mode,outsource_vendor_id,sample_priority,dispatch_status,status,collect_timing,expected_collect_at,remarks,internal_check_required,internal_check_status,collected_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(billId, specimenId, +g.specimen_type_id || null, specimenName, g.sample_type || 'Random', physicalMode, outsourceVendorId, samplePriority, dispatchStatus, status, g.collect_timing || 'NOW', g.expected_collect_at || '', g.remarks || '', internalCheckRequired ? 1 : 0, internalCheckStatus, now, now, now);
        const collectionId = Number(info.lastInsertRowid);
        created.push({ id: collectionId, specimen_id: specimenId });

        for (const t of tests) {
          const perTestMode = isTestOutsource(t) ? 'OUTSOURCE' : 'INHOUSE';
          const vendorId = perTestMode === 'OUTSOURCE' ? (+(t.outsource_vendor_id || g.outsource_vendor_id) || 0) : 0;
          // Report grouping intentionally ignores specimen/container. The physical collection can have
          // many specimen rows, but reporting is one work item per workflow/vendor/timing for the save.
          const timingKey = String(g.collect_timing || 'NOW').toUpperCase();
          const expectedKey = timingKey === 'LATER' ? String(g.expected_collect_at || '') : '';
          // Report grouping must NOT include specimen/sample type. Different physical specimens
          // collected in the same save/session and same workflow must share one report header.
          // Specimen id/type stays on each report item for barcode/integration traceability.
          const key = `${perTestMode}|${vendorId}|${timingKey}|${expectedKey}`;
          if (!reportSegments.has(key)) {
            reportSegments.set(key, {
              workflow: perTestMode,
              vendorId,
              timingKey,
              expectedKey,
              sampleType: g.sample_type || 'Random',
              collectionIds: [],
              tests: []
            });
          }
          const seg = reportSegments.get(key);
          if (!seg.collectionIds.includes(collectionId)) seg.collectionIds.push(collectionId);
          seg.tests.push({
            ...t,
            collectionId,
            specimenId,
            specimenName,
            specimenTypeId: +g.specimen_type_id || null,
            sampleType: g.sample_type || 'Random',
            remarks: g.remarks || '',
            samplePriority: String(t.sample_priority || samplePriority || 'ROUTINE').toUpperCase(),
            internalRequired: isTestInternal(t)
          });
        }
      }

      // Create one pending report per report segment across the entire collection save session.
      for (const seg of reportSegments.values()) {
        const specimenCount = new Set(seg.tests.map((t:any)=>t.collectionId)).size;
        const sampleTypes = Array.from(new Set(seg.tests.map((t:any)=>String(t.sampleType || '').trim()).filter(Boolean)));
        const titleSample = sampleTypes.length === 1 ? sampleTypes[0] : 'Multiple specimens';
        const title = `${titleSample || 'Sample'} · ${seg.workflow === 'OUTSOURCE' ? 'Outsource' : 'In-house'}${specimenCount > 1 ? ` · ${specimenCount} specimens` : ''}`;
        const sourceIds = seg.tests.map((t:any)=>+t.report_item_id);
        const primaryCollectionId = +seg.collectionIds[0] || +created[0]?.id || 0;
        const made:any = this.createPendingReportForCollectionSegment(billId, primaryCollectionId, seg.workflow, seg.vendorId || null, sourceIds, title);
        for (const t of seg.tests) {
          const newReportItemId = made?.newIds?.get(+t.report_item_id) || 0;
          insertTest.run(+t.collectionId, newReportItemId || null, +t.test_id || null, t.test_name || '', +t.report_item_id || null, seg.workflow, t.internalRequired ? 1 : 0, seg.vendorId || null);
          const perTestStatus = seg.workflow === 'OUTSOURCE' ? 'OUTSOURCE_READY' : 'COLLECTED';
          const perTestInternalStatus = t.internalRequired ? 'PENDING' : 'NOT_REQUIRED';
          if (newReportItemId) {
            updateRi.run(perTestStatus, t.specimenId, t.specimenTypeId, t.specimenName, t.sampleType, t.remarks, seg.workflow, t.internalRequired ? 1 : 0, perTestInternalStatus, seg.workflow === 'OUTSOURCE' ? 'OUTSOURCE' : 'MANUAL', t.samplePriority, newReportItemId);
          }
          if (+t.report_item_id) {
            updateRi.run('COLLECTED', t.specimenId, t.specimenTypeId, t.specimenName, t.sampleType, t.remarks, seg.workflow, t.internalRequired ? 1 : 0, perTestInternalStatus, seg.workflow === 'OUTSOURCE' ? 'OUTSOURCE' : 'MANUAL', t.samplePriority, +t.report_item_id);
          }
        }
      }

      this.audit('collection.save', JSON.stringify(created.map(c => c.specimen_id)));
      created.forEach(c => this.audit('collection.dispatch.ready', `${c.specimen_id}: grouped pending report(s) created; outsource result entry locked until received`));
      return created;
    });
    return tx();
  }

  listCollections(filters: any = {}) {
    this.ensureCollectionSchema();
    const from = filters.from || '1900-01-01';
    const to = filters.to || '2999-12-31';
    return this.db.prepare(`SELECT sc.*,b.bill_no,p.title patient_title,p.name patient_name,p.patient_no,p.age,p.gender,p.mobile,ov.name outsource_vendor_name,
      (SELECT GROUP_CONCAT(id, '||') FROM (SELECT DISTINCT r2.id FROM specimen_collection_tests xsct JOIN report_items xri ON xri.id=xsct.report_item_id JOIN reports r2 ON r2.id=xri.report_id WHERE xsct.collection_id=sc.id AND COALESCE(r2.report_scope,'COLLECTION')='COLLECTION')) report_ids,
      (SELECT r2.id FROM specimen_collection_tests xsct JOIN report_items xri ON xri.id=xsct.report_item_id JOIN reports r2 ON r2.id=xri.report_id WHERE xsct.collection_id=sc.id AND COALESCE(r2.report_scope,'COLLECTION')='COLLECTION' ORDER BY r2.id DESC LIMIT 1) report_id,
      (SELECT CASE
          WHEN COUNT(DISTINCT r2.id)=0 THEN 'DRAFT'
          WHEN SUM(CASE WHEN COALESCE(r2.status,'DRAFT')='APPROVED' THEN 1 ELSE 0 END)=COUNT(DISTINCT r2.id) THEN 'APPROVED'
          WHEN SUM(CASE WHEN COALESCE(r2.status,'DRAFT') IN ('WAITING_APPROVAL','PENDING_APPROVAL') THEN 1 ELSE 0 END)>0 THEN 'WAITING_APPROVAL'
          WHEN SUM(CASE WHEN COALESCE(r2.status,'DRAFT') IN ('TYPED','ENTERED') THEN 1 ELSE 0 END)>0 THEN 'TYPED'
          ELSE 'DRAFT' END
        FROM (SELECT DISTINCT r2.id, r2.status FROM specimen_collection_tests xsct JOIN report_items xri ON xri.id=xsct.report_item_id JOIN reports r2 ON r2.id=xri.report_id WHERE xsct.collection_id=sc.id AND COALESCE(r2.report_scope,'COLLECTION')='COLLECTION') r2) report_status,
      GROUP_CONCAT(COALESCE(sct.test_name,''), '||') test_names,
      COUNT(sct.id) test_count,
      GROUP_CONCAT(CASE WHEN ${this.collectionRowModeSql()}='INHOUSE' THEN COALESCE(sct.test_name,'') END, '||') inhouse_test_names,
      SUM(CASE WHEN ${this.collectionRowModeSql()}='INHOUSE' THEN 1 ELSE 0 END) inhouse_test_count,
      GROUP_CONCAT(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN COALESCE(sct.test_name,'') END, '||') outsource_test_names,
      SUM(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' THEN 1 ELSE 0 END) outsource_test_count,
      GROUP_CONCAT(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' AND COALESCE(ri.internal_check_required,sct.internal_check_required,0)=1 THEN COALESCE(sct.test_name,'') END, '||') internal_check_test_names,
      SUM(CASE WHEN ${this.collectionRowModeSql()}='OUTSOURCE' AND COALESCE(ri.internal_check_required,sct.internal_check_required,0)=1 THEN 1 ELSE 0 END) internal_check_test_count,
      (SELECT COUNT(*) FROM bill_items bi WHERE bi.bill_id=b.id AND bi.item_type IN ('TEST','PROFILE')) billed_test_count,
      COUNT(sct.id) requested_test_count,
      SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='APPROVED' THEN 1 ELSE 0 END) approved_test_count,
      SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='ENTERED' THEN 1 ELSE 0 END) entered_test_count,
      SUM(CASE WHEN COALESCE(ri.result_status,'PENDING')='PENDING' THEN 1 ELSE 0 END) report_pending_test_count
      FROM specimen_collections sc
      JOIN bills b ON b.id=sc.bill_id JOIN patients p ON p.id=b.patient_id
      LEFT JOIN outsource_vendors ov ON ov.id=sc.outsource_vendor_id
      LEFT JOIN specimen_collection_tests sct ON sct.collection_id=sc.id
      LEFT JOIN report_items ri ON ri.id=sct.report_item_id
      WHERE date(sc.collected_at) BETWEEN date(?) AND date(?)
      GROUP BY sc.id ORDER BY sc.id DESC LIMIT 1000`).all(from, to);
  }


  getCollectionReportReference(collectionId: number) {
    this.ensureCollectionSchema();
    const id = +collectionId || 0;
    if (!id) return null;
    return this.db.prepare(`SELECT sc.id collection_id, r.id report_id, r.status report_status
      FROM specimen_collections sc
      JOIN specimen_collection_tests sct ON sct.collection_id=sc.id
      JOIN report_items ri ON ri.id=sct.report_item_id
      JOIN reports r ON r.id=ri.report_id AND COALESCE(r.report_scope,'COLLECTION')='COLLECTION'
      WHERE sc.id=?
      ORDER BY r.id DESC LIMIT 1`).get(id) as any;
  }

  protected recheckCollectionRows(collectionId: number) {
    const rows = this.db.prepare(`SELECT
        sc.id collection_id,
        sc.source_type,
        sc.sample_identification,
        sc.status collection_status,
        sc.dispatch_status,
        sc.remarks collection_remarks,
        sc.parent_collection_id,
        sct.report_item_id child_report_item_id,
        sct.source_report_item_id sct_source_report_item_id,
        ri.report_id child_report_id,
        ri.original_report_item_id,
        ri.source_report_item_id,
        ri.recheck_mode,
        ri.recheck_status,
        ri.result_status,
        ri.is_recheck_item,
        r.parent_report_id,
        r.report_kind,
        r.report_scope
      FROM specimen_collections sc
      LEFT JOIN specimen_collection_tests sct ON sct.collection_id=sc.id
      LEFT JOIN report_items ri ON ri.id=sct.report_item_id
      LEFT JOIN reports r ON r.id=ri.report_id
      WHERE sc.id=?`).all(collectionId) as any[];
    const isRecheck = rows.some((x:any) => {
      const recheckMode = String(x.recheck_mode || '').toUpperCase();
      const recheckStatus = String(x.recheck_status || '').toUpperCase();
      return String(x.source_type || '').toUpperCase() === 'RECHECK' ||
        String(x.sample_identification || '').toUpperCase() === 'RECHECK' ||
        (+x.is_recheck_item || 0) === 1 ||
        String(x.report_kind || '').toUpperCase() === 'RECHECK' ||
        String(x.report_scope || '').toUpperCase() === 'RECHECK' ||
        (!!recheckMode && recheckMode !== 'NONE') ||
        (!!recheckStatus && recheckStatus !== 'NONE');
    });
    return isRecheck ? rows.filter((x:any)=>+x.child_report_item_id) : [];
  }

  protected recomputeReportStatusForActiveItems(reportId: number) {
    const id = +reportId || 0;
    if (!id) return;
    const remaining = this.db.prepare(`SELECT
        SUM(CASE WHEN COALESCE(result_status,'PENDING')='PENDING' OR TRIM(COALESCE(result_value,''))='' THEN 1 ELSE 0 END) pending_count,
        SUM(CASE WHEN COALESCE(result_status,'PENDING')='ENTERED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) entered_count,
        SUM(CASE WHEN COALESCE(result_status,'PENDING')='APPROVED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) approved_count,
        COUNT(*) item_count
      FROM report_items
      WHERE report_id=?
        AND test_id IS NOT NULL
        AND COALESCE(selected_for_reporting,1)=1
        AND NOT (COALESCE(excluded_from_approval,0)=1 OR COALESCE(moved_to_recheck_report_id,0)>0)`).get(id) as any;
    const pendingCount = +remaining?.pending_count || 0;
    const enteredCount = +remaining?.entered_count || 0;
    const approvedCount = +remaining?.approved_count || 0;
    const itemCount = +remaining?.item_count || 0;
    const nextStatus = itemCount === 0 ? 'DRAFT' : (pendingCount > 0 ? 'DRAFT' : (enteredCount > 0 ? 'TYPED' : (approvedCount > 0 ? 'APPROVED' : 'DRAFT')));
    this.db.prepare('UPDATE reports SET status=?, updated_at=? WHERE id=?').run(nextStatus, this.nowIst(), id);
  }

  protected rejectRecheckCollectionAndRestoreToReportPending(collectionId: number, reason: string) {
    const rows = this.recheckCollectionRows(collectionId);
    if (!rows.length) return false;
    const locked = rows.find((x:any)=>['APPROVED','FINALIZED'].includes(String(x.result_status || '').toUpperCase()) || ['DONE','APPROVED','FINALIZED'].includes(String(x.recheck_status || '').toUpperCase()));
    if (locked) throw new Error('Completed/approved recheck cannot be rejected from Collection. Use correction/admin flow.');
    const now = this.nowIst();
    const childReportIds = Array.from(new Set(rows.map((x:any)=>+x.child_report_id || 0).filter(Boolean)));
    const parentReportIds = Array.from(new Set(rows.map((x:any)=>+x.parent_report_id || 0).filter(Boolean)));
    const childItemIds = Array.from(new Set(rows.map((x:any)=>+x.child_report_item_id || 0).filter(Boolean)));
    const parentItemIds = Array.from(new Set(rows.map((x:any)=>+x.original_report_item_id || +x.source_report_item_id || +x.sct_source_report_item_id || 0).filter(Boolean)));
    const parentCollectionIds = Array.from(new Set(rows.map((x:any)=>+x.parent_collection_id || 0).filter(Boolean)));
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE specimen_collections SET
          status='REJECTED',
          dispatch_status='REJECTED',
          sample_identification='RECHECK',
          source_type='RECHECK',
          reject_reason=?,
          rejected_at=?,
          updated_at=?,
          remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE id=?`).run(reason || 'Recheck rejected', now, now, 'Recheck outsource rejected - restored to report pending: ' + (reason || 'Rejected'), collectionId);
      if (parentCollectionIds.length) {
        const phc = parentCollectionIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE specimen_collections SET source_type='NORMAL', sample_identification='NORMAL', updated_at=? WHERE id IN (${phc})`).run(now, ...parentCollectionIds);
      }
      if (parentItemIds.length) {
        const ph = parentItemIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE report_items SET
            selected_for_reporting=1,
            excluded_from_approval=0,
            moved_to_recheck_report_id=NULL,
            recheck_child_report_item_id=NULL,
            recheck_mode='NONE',
            recheck_status='NONE',
            recheck_vendor_id=NULL,
            recheck_requested_at=NULL,
            recheck_remarks='',
            result_status='PENDING',
            collection_status=CASE WHEN COALESCE(collection_status,'') IN ('','PENDING','REJECTED') THEN 'COLLECTED' ELSE collection_status END,
            collection_mode=CASE WHEN COALESCE(collection_mode,'')='OUTSOURCE' THEN collection_mode ELSE collection_mode END,
            final_result_source=CASE WHEN COALESCE(final_result_source,'')='' THEN 'MANUAL' ELSE final_result_source END,
            sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
          WHERE id IN (${ph})`).run('Recheck rejected - restored as normal report pending: ' + (reason || 'Rejected'), ...parentItemIds);
      }
      if (childItemIds.length) {
        const ph = childItemIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE report_items SET
            selected_for_reporting=0,
            result_status='CANCELLED',
            collection_status='REJECTED',
            recheck_status='REVERTED',
            recheck_reverted_at=?,
            sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?),
            recheck_remarks=TRIM(COALESCE(recheck_remarks,'') || CASE WHEN COALESCE(recheck_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
          WHERE id IN (${ph})`).run(now, 'Child recheck collection rejected: ' + (reason || 'Rejected'), reason || 'Rejected', ...childItemIds);
      }
      for (const childReportId of childReportIds) {
        const active = this.db.prepare(`SELECT COUNT(*) c FROM report_items WHERE report_id=? AND test_id IS NOT NULL AND COALESCE(selected_for_reporting,1)=1`).get(childReportId) as any;
        if ((+active?.c || 0) === 0) {
          this.db.prepare(`UPDATE reports SET status='RECHECK_CANCELLED', remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE id=?`).run('Recheck rejected from outsource collection: ' + (reason || 'Rejected'), now, childReportId);
        }
      }
      parentReportIds.forEach((rid:number)=>this.recomputeReportStatusForActiveItems(rid));
      this.audit('collection.recheck.reject.restore', JSON.stringify({ collectionId, childReportIds, parentReportIds, childItemIds, parentItemIds, reason }));
      return true;
    });
    return tx();
  }

  rejectCollection(collectionId: number, reason: string) {
    this.ensureCollectionSchema();
    if (!collectionId) throw new Error('Collection id is required.');
    const row = this.db.prepare('SELECT * FROM specimen_collections WHERE id=?').get(collectionId) as any;
    if (!row) throw new Error('Specimen not found.');
    const isRecheckCollection =
      String(row.source_type || '').toUpperCase() === 'RECHECK' ||
      String(row.sample_identification || '').toUpperCase() === 'RECHECK' ||
      (+row.recheck_report_id || 0) > 0 ||
      this.recheckCollectionRows(collectionId).length > 0;
    if (isRecheckCollection) {
      throw new Error('Recheck samples cannot be rejected from Collection. Use Reporting > Pending Rechecks > Reject Recheck.');
    }
    this.assertCollectionUnlockedForReportItems(this.reportItemIdsForCollection(collectionId), 'Reject specimen');
    const tx = this.db.transaction(() => {
      this.resetSourceReportItemsForCollection(collectionId, 'Rejected: ' + (reason || 'Rejected'));
      this.db.prepare("UPDATE specimen_collections SET status='REJECTED', rejected_at=?, reject_reason=?, updated_at=? WHERE id=?").run(this.nowIst(), reason || 'Rejected', this.nowIst(), collectionId);
      this.deletePendingReportsForCollection(collectionId, 'Rejected: ' + (reason || 'Rejected'));
      const tests = this.db.prepare('SELECT report_item_id FROM specimen_collection_tests WHERE collection_id=?').all(collectionId) as any[];
      const upd = this.db.prepare("UPDATE report_items SET collection_status='REJECTED', sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?) WHERE id=?");
      tests.forEach(t => { if (+t.report_item_id) upd.run('Rejected: ' + (reason || 'Rejected'), +t.report_item_id); });
      this.audit('collection.reject', `${row.specimen_id}: ${reason}`);
      return true;
    });
    return tx();
  }

  deleteRejectedCollection(collectionId: number) {
    this.ensureCollectionSchema();
    if (!collectionId) throw new Error('Collection id is required.');
    const row = this.db.prepare('SELECT * FROM specimen_collections WHERE id=?').get(collectionId) as any;
    if (!row) throw new Error('Specimen not found.');
    if (String(row.status || '') !== 'REJECTED') throw new Error('Only rejected specimens can be deleted here.');
    const recheckRows = this.recheckCollectionRows(collectionId);
    if (recheckRows.length) {
      const txRecheckDelete = this.db.transaction(() => {
        this.db.prepare('DELETE FROM specimen_collection_tests WHERE collection_id=?').run(collectionId);
        this.db.prepare('DELETE FROM specimen_collections WHERE id=?').run(collectionId);
        this.audit('collection.recheck.rejected.delete', `${row.specimen_id || collectionId}: ${row.reject_reason || 'Rejected recheck specimen deleted'}`);
        return true;
      });
      return txRecheckDelete();
    }
    this.assertCollectionUnlockedForReportItems(this.reportItemIdsForCollection(collectionId), 'Delete/reopen rejected specimen');
    const tests = this.db.prepare('SELECT report_item_id, source_report_item_id FROM specimen_collection_tests WHERE collection_id=?').all(collectionId) as any[];
    const tx = this.db.transaction(() => {
      this.resetSourceReportItemsForCollection(collectionId, 'Rejected specimen deleted - returned to Pending Collection');
      const sourceIds = Array.from(new Set(tests.map((t:any)=>+t.source_report_item_id || 0).filter(Boolean)));
      if (sourceIds.length) {
        const ph = sourceIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE report_items SET collection_status='PENDING', collection_request_status='REQUEST_PENDING', result_status=CASE WHEN COALESCE(result_status,'PENDING') IN ('PENDING','') THEN 'PENDING' ELSE result_status END, specimen_id=NULL, specimen_type_id=NULL, specimen_name=NULL, sample_type=NULL, sample_remarks=TRIM(COALESCE(sample_remarks,'')), collection_mode=NULL, internal_check_required=0, internal_check_status='NOT_REQUIRED', outsource_result_value=NULL, internal_check_value=NULL, internal_check_remarks=NULL, final_result_source='MANUAL', sample_priority='ROUTINE' WHERE id IN (${ph})`).run(...sourceIds);
      }
      const resetRi = this.db.prepare(`UPDATE report_items SET collection_status='PENDING', collection_request_status='REQUEST_PENDING', specimen_id=NULL, specimen_type_id=NULL, specimen_name=NULL, sample_type=NULL, sample_remarks=TRIM(COALESCE(sample_remarks,'')), collection_mode=NULL, internal_check_required=0, internal_check_status='NOT_REQUIRED', outsource_result_value=NULL, internal_check_value=NULL, internal_check_remarks=NULL, final_result_source='MANUAL', sample_priority='ROUTINE' WHERE id=?`);
      tests.forEach((t:any) => { if (+t.report_item_id) resetRi.run(+t.report_item_id); });
      this.deletePendingReportsForCollection(collectionId, 'Rejected specimen deleted');
      this.db.prepare('DELETE FROM specimen_collections WHERE id=?').run(collectionId);
      this.audit('collection.rejected.delete', `${row.specimen_id || collectionId}: ${row.reject_reason || 'Rejected specimen deleted'}`);
      return true;
    });
    return tx();
  }

  recollectCollection(collectionId: number) {
    this.ensureCollectionSchema();
    const row = this.db.prepare(`SELECT sc.*,b.id bill_id,b.bill_no,b.bill_date,p.title patient_title,p.name patient_name,p.mobile,c.name consultant_name
      FROM specimen_collections sc JOIN bills b ON b.id=sc.bill_id JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE sc.id=?`).get(collectionId) as any;
    if (!row) return null;

    const linkedRows = this.db.prepare('SELECT report_item_id FROM specimen_collection_tests WHERE collection_id=?').all(collectionId) as any[];
    const linkedIds = linkedRows.map(x => +x.report_item_id).filter(Boolean);

    // Safety fallback: older/partially migrated rows can lose one or more rows in
    // specimen_collection_tests. A rejected specimen is still tied to every report item
    // that carries the same specimen_id and REJECTED collection_status, so include those
    // too. This prevents Recollect from adding only the first test back to Pending.
    const specimenIds = row.specimen_id ? (this.db.prepare(`SELECT ri.id FROM reports r JOIN report_items ri ON ri.report_id=r.id
      WHERE r.bill_id=? AND ri.test_id IS NOT NULL AND ri.specimen_id=? AND COALESCE(ri.collection_status,'PENDING')='REJECTED'`).all(row.bill_id, row.specimen_id) as any[]).map(x => +x.id).filter(Boolean) : [];
    const reportItemIds = Array.from(new Set([...linkedIds, ...specimenIds]));
    this.assertCollectionUnlockedForReportItems(reportItemIds, 'Recollect specimen');

    const tx = this.db.transaction(() => {
      this.resetSourceReportItemsForCollection(collectionId, 'Recollect requested - returned to Pending Collection');
      this.db.prepare("UPDATE specimen_collections SET status='RECOLLECT_REQUESTED', updated_at=? WHERE id=?").run(this.nowIst(), collectionId);
      this.deletePendingReportsForCollection(collectionId, 'Recollect requested');
      const upd = this.db.prepare("UPDATE report_items SET collection_status='PENDING', collection_request_status='REQUEST_PENDING', specimen_id=NULL, specimen_type_id=NULL, specimen_name=NULL, sample_type=NULL, collection_mode=NULL, internal_check_required=0, internal_check_status='NOT_REQUIRED', outsource_result_value=NULL, internal_check_value=NULL, internal_check_remarks=NULL, final_result_source='MANUAL', sample_priority='ROUTINE' WHERE id=?");
      reportItemIds.forEach(id => upd.run(id));
      this.audit('collection.recollect.request', `${row.specimen_id || collectionId}: ${reportItemIds.length} test(s) moved to pending`);
    });
    tx();
    return { bill: { id: row.bill_id, bill_no: row.bill_no, bill_date: row.bill_date, patient_name: row.patient_name, mobile: row.mobile, consultant_name: row.consultant_name }, report_item_ids: reportItemIds };
  }



  updateCollectionDispatchStatus(collectionId: number, status: string) {
    this.ensureCollectionSchema();
    const id = +collectionId || 0;
    const next = String(status || 'READY').toUpperCase();
    if (!id) throw new Error('Collection id is required.');
    if (!['READY','DISPATCHED','RESULT_RECEIVED'].includes(next)) throw new Error('Invalid dispatch status.');
    const row = this.db.prepare('SELECT * FROM specimen_collections WHERE id=?').get(id) as any;
    if (!row) throw new Error('Specimen not found.');
    const linked = this.db.prepare(`SELECT ri.id report_item_id FROM specimen_collection_tests sct JOIN report_items ri ON ri.id=sct.report_item_id JOIN specimen_collections sc ON sc.id=sct.collection_id WHERE sct.collection_id=? AND ${this.collectionRowModeSql()}='OUTSOURCE'`).all(id) as any[];
    if (!linked.length) throw new Error('No outsourced tests found for this sample.');
    this.assertCollectionUnlockedForReportItems(linked.map(x => +x.report_item_id).filter(Boolean), 'Outsource status change');
    const now = this.nowIst();
    const itemStatus = next === 'RESULT_RECEIVED' ? 'OUTSOURCE_RESULT_RECEIVED' : (next === 'DISPATCHED' ? 'OUTSOURCE_DISPATCHED' : 'OUTSOURCE_READY');
    const tx = this.db.transaction(() => {
      // Dispatch is workflow scoped. A mixed specimen may have in-house and outsource tests under the same barcode,
      // so do not require specimen_collections.collection_mode='OUTSOURCE' and do not overwrite the whole specimen status.
      this.db.prepare('UPDATE specimen_collections SET dispatch_status=?, updated_at=? WHERE id=?').run(next, now, id);
      const recheckStatus = next === 'RESULT_RECEIVED' ? 'OUTSOURCE_RESULT_RECEIVED' : (next === 'DISPATCHED' ? 'OUTSOURCE_DISPATCHED' : 'OUTSOURCE_PENDING_DISPATCH');
      const upd = this.db.prepare("UPDATE report_items SET collection_status=?, collection_mode='OUTSOURCE', final_result_source='OUTSOURCE', recheck_status=CASE WHEN COALESCE(recheck_mode,'NONE') IN ('OUTSOURCE','BOTH') THEN ? ELSE recheck_status END WHERE id=?");
      linked.forEach(x => { if (+x.report_item_id) upd.run(itemStatus, recheckStatus, +x.report_item_id); });
      this.audit('collection.dispatch.' + next.toLowerCase(), `${row.specimen_id || id}: ${next}`);
    });
    tx();
    return true;
  }


  receiveOutsourceVendorResult(collectionId: number, payload: any = {}) {
    this.ensureCollectionSchema();
    const id = +collectionId || 0;
    if (!id) throw new Error('Collection id is required.');
    const row = this.db.prepare('SELECT * FROM specimen_collections WHERE id=?').get(id) as any;
    if (!row) throw new Error('Specimen not found.');
    const method = String(payload.method || 'ENTER_VALUES').toUpperCase() === 'ATTACH_REPORT_ONLY' ? 'ATTACH_REPORT_ONLY' : 'ENTER_VALUES';
    const vendorReportFile = String(payload.vendor_report_file || '').trim();
    const remarks = String(payload.remarks || '').trim();
    if (method === 'ATTACH_REPORT_ONLY' && !vendorReportFile) throw new Error('Vendor report file/reference is required.');
    const now = this.nowIst();
    const linked = this.db.prepare(`SELECT ri.id, COALESCE(ri.internal_check_required,0) internal_check_required
      FROM specimen_collection_tests sct JOIN report_items ri ON ri.id=sct.report_item_id
      JOIN specimen_collections sc ON sc.id=sct.collection_id
      WHERE sct.collection_id=? AND ${this.collectionRowModeSql()}='OUTSOURCE'`).all(id) as any[];
    if (!linked.length) throw new Error('No outsourced tests found for this sample.');
    this.assertCollectionUnlockedForReportItems(linked.map(x=>+x.id), 'Receive vendor result');
    const tx = this.db.transaction(() => {
      this.db.prepare('UPDATE specimen_collections SET dispatch_status=?, status=?, updated_at=? WHERE id=?').run('RESULT_RECEIVED', 'OUTSOURCE_RESULT_RECEIVED', now, id);
      const updEnter = this.db.prepare(`UPDATE report_items SET collection_status='OUTSOURCE_RESULT_RECEIVED', vendor_result_method='ENTER_VALUES', vendor_report_status='PENDING', final_result_source='OUTSOURCE', recheck_status=CASE WHEN COALESCE(recheck_mode,'NONE') IN ('OUTSOURCE','BOTH') THEN 'OUTSOURCE_RESULT_RECEIVED' ELSE recheck_status END, internal_check_status=CASE WHEN COALESCE(internal_check_required,0)=1 THEN 'PENDING' ELSE 'NOT_REQUIRED' END WHERE id=?`);
      const updAttach = this.db.prepare(`UPDATE report_items SET collection_status='OUTSOURCE_RESULT_RECEIVED', vendor_result_method='ATTACH_REPORT_ONLY', vendor_report_file=?, vendor_report_status='RECEIVED', final_result_source='VENDOR_REPORT', result_status='PENDING', recheck_status=CASE WHEN COALESCE(recheck_mode,'NONE') IN ('OUTSOURCE','BOTH') THEN 'OUTSOURCE_RESULT_RECEIVED' ELSE recheck_status END, internal_check_status=CASE WHEN COALESCE(internal_check_required,0)=1 THEN 'PENDING' ELSE 'NOT_REQUIRED' END, internal_check_remarks=TRIM(COALESCE(internal_check_remarks,'') || CASE WHEN COALESCE(internal_check_remarks,'')<>'' AND ?<>'' THEN ' | ' ELSE '' END || ?) WHERE id=?`);
      for (const x of linked) {
        if (method === 'ATTACH_REPORT_ONLY') updAttach.run(vendorReportFile, remarks, remarks, +x.id);
        else updEnter.run(+x.id);
      }
      this.audit('collection.vendor_result.' + method.toLowerCase(), `${row.specimen_id || id}: ${linked.length} outsourced test(s) received${vendorReportFile ? ' / ' + vendorReportFile : ''}`);
    });
    tx();
    return { ok: true, method, count: linked.length };
  }

  listCollectionLogs(filters: any = {}) {
    const from = filters.from || '1900-01-01';
    const to = filters.to || '2999-12-31';
    return this.db.prepare(`SELECT a.*, sc.specimen_id, sc.specimen_name, b.bill_no, p.title patient_title,p.name patient_name
      FROM audit_logs a
      LEFT JOIN specimen_collections sc ON a.details LIKE '%' || sc.specimen_id || '%'
      LEFT JOIN bills b ON b.id=sc.bill_id
      LEFT JOIN patients p ON p.id=b.patient_id
      WHERE (a.action LIKE 'collection.%' OR a.action='bill.cancel')
        AND date(a.created_at) BETWEEN date(?) AND date(?)
      GROUP BY a.id
      ORDER BY a.id DESC LIMIT 1000`).all(from, to);
  }


  statement(filters:any={}) { const bills=this.listBills(filters) as any[]; const totals=bills.reduce((a,b)=>({subtotal:a.subtotal+b.subtotal,discount:a.discount+b.discount,total:a.total+b.total,paid:a.paid+b.paid,due:a.due+b.due}),{subtotal:0,discount:0,total:0,paid:0,due:0}); return { bills, totals }; }


  removePendingReport(reportId: number, payload: any = {}) {
    const id = +reportId || 0;
    if (!id) throw new Error('Report id is required.');
    const reason = String(payload?.reason || 'Pending report removed').trim() || 'Pending report removed';
    const report = this.db.prepare('SELECT r.*, b.bill_no FROM reports r JOIN bills b ON b.id=r.bill_id WHERE r.id=?').get(id) as any;
    if (!report?.id) throw new Error('Report not found.');
    const status = String(report.status || 'DRAFT').toUpperCase();
    if (!['DRAFT','PENDING'].includes(status)) throw new Error('Only untouched pending reports can be removed from Pending Results.');
    const touched = this.db.prepare(`SELECT COUNT(*) c FROM report_items
      WHERE report_id=? AND test_id IS NOT NULL AND (
        COALESCE(result_status,'PENDING')<>'PENDING'
        OR TRIM(COALESCE(result_value,''))<>''
        OR TRIM(COALESCE(outsource_result_value,''))<>''
        OR TRIM(COALESCE(internal_check_value,''))<>''
      )`).get(id) as any;
    if ((+touched?.c || 0) > 0) throw new Error('This report already has result work. Use the report rejection/correction flow instead.');
    const tx = this.db.transaction(() => {
      const itemRows = this.db.prepare('SELECT id FROM report_items WHERE report_id=?').all(id) as any[];
      const itemIds = itemRows.map((x:any)=>+x.id || 0).filter(Boolean);
      if (itemIds.length) {
        const placeholders = itemIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE specimen_collection_tests SET report_item_id=NULL WHERE report_item_id IN (${placeholders})`).run(...itemIds);
      }
      this.db.prepare('DELETE FROM report_items WHERE report_id=?').run(id);
      this.db.prepare('DELETE FROM reports WHERE id=?').run(id);
      this.audit('report.pending.remove', `${id}:${report.bill_no || ''}:${reason}`);
      return { ok: true, report_id: id };
    });
    return tx();
  }

  requestReportRecheck(payload: any = {}) {
    this.ensureCollectionSchema();
    this.ensureMultiReportSchema();
    const reportId = +payload.report_id || 0;
    const ids = Array.from(new Set((payload.report_item_ids || []).map((x:any)=>+x).filter(Boolean)));
    if (!reportId) throw new Error('Report id is required.');
    if (!ids.length) throw new Error('Select at least one test for recheck.');
    const mode = String(payload.recheck_mode || 'INHOUSE').toUpperCase();
    if (!['INHOUSE','OUTSOURCE','BOTH'].includes(mode)) throw new Error('Invalid recheck mode.');
    const vendorId = +payload.recheck_vendor_id || 0;
    if ((mode === 'OUTSOURCE' || mode === 'BOTH') && !vendorId) throw new Error('Vendor is required for outsource recheck.');
    const reason = String(payload.recheck_remarks || '').trim();
    if (!reason) throw new Error('Recheck remarks are required.');
    const placeholders = ids.map(()=>'?').join(',');
    const parentReport = this.db.prepare(`SELECT r.*, b.bill_no FROM reports r JOIN bills b ON b.id=r.bill_id WHERE r.id=?`).get(reportId) as any;
    if (!parentReport?.id) throw new Error('Report not found.');
    if (String(parentReport.status || '').toUpperCase().includes('CANCEL')) throw new Error('Cancelled reports cannot be sent for recheck.');
    const rows = this.db.prepare(`SELECT ri.*, sct.collection_id, sc.id source_collection_id,
        sc.specimen_id source_specimen_id, sc.specimen_name source_specimen_name, sc.specimen_type_id source_specimen_type_id,
        sc.sample_type source_sample_type, sc.collect_timing source_collect_timing, sc.expected_collect_at source_expected_collect_at,
        sc.sample_priority source_sample_priority, sc.remarks source_collection_remarks
      FROM report_items ri
      LEFT JOIN specimen_collection_tests sct ON sct.report_item_id=ri.id
      LEFT JOIN specimen_collections sc ON sc.id=sct.collection_id
      WHERE ri.report_id=? AND ri.id IN (${placeholders}) AND ri.test_id IS NOT NULL AND COALESCE(ri.selected_for_reporting,1)=1`).all(reportId, ...ids) as any[];
    if (rows.length !== ids.length) throw new Error('Some selected tests were not found in this report. Refresh and try again.');
    const alreadyMoved = rows.find((x:any)=>+x.moved_to_recheck_report_id || +x.is_recheck_item || String(x.recheck_mode || 'NONE').toUpperCase() !== 'NONE');
    if (alreadyMoved) throw new Error('One selected test is already under recheck. Refresh and use the existing recheck report.');
    const invalid = rows.find((x:any)=>!['ENTERED','TYPED','WAITING_APPROVAL','PENDING'].includes(String(x.result_status || 'PENDING').toUpperCase()));
    if (invalid) throw new Error('Only pending/waiting approval report items can be sent for recheck.');
    const remarksById = new Map<number,string>((payload.item_remarks || []).map((x:any)=>[+x.report_item_id, String(x.remarks || '').trim()]));
    const now = this.nowIst();
    let childReportId = 0;
    const childItemIds:number[] = [];
    const tx = this.db.transaction(() => {
      const seqRow = this.db.prepare(`SELECT COALESCE(MAX(recheck_sequence),0) n FROM reports WHERE parent_report_id=? AND COALESCE(report_kind,'NORMAL')='RECHECK'`).get(reportId) as any;
      const seq = (+seqRow?.n || 0) + 1;
      const reportTitle = `${parentReport.report_title || parentReport.bill_no || 'Report'} - Recheck ${seq}`;
      childReportId = Number(this.db.prepare(`INSERT INTO reports(bill_id,status,typed_by,approved_by,remarks,created_at,updated_at,show_profile_name_on_report,show_sub_header_on_report,report_scope,source_collection_id,workflow_key,queue_vendor_id,report_title,parent_report_id,report_kind,recheck_sequence,recheck_mode)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          +parentReport.bill_id,
          'DRAFT',
          '',
          '',
          `Recheck ${seq} from report ${reportId}: ${reason}`,
          now,
          now,
          parentReport.show_profile_name_on_report === 0 ? 0 : 1,
          parentReport.show_sub_header_on_report === 0 ? 0 : 1,
          'RECHECK',
          null,
          `RECHECK_${mode}_${vendorId || 0}_${reportId}_${seq}`,
          vendorId || null,
          reportTitle,
          reportId,
          'RECHECK',
          seq,
          mode
        ).lastInsertRowid);

      const status = mode === 'INHOUSE' ? 'REQUESTED' : 'OUTSOURCE_PENDING_DISPATCH';
      const collectionStatus = mode === 'INHOUSE' ? 'COLLECTED' : 'OUTSOURCE_READY';
      const collectionMode = mode === 'INHOUSE' ? 'INHOUSE' : 'OUTSOURCE';
      const finalSource = mode === 'INHOUSE' ? 'MANUAL' : 'OUTSOURCE';
      const insertChild = this.db.prepare(`INSERT INTO report_items(
          report_id,test_id,test_name,department_name,side_header,result_value,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name,
          flag_status,is_critical,critical_message,formula_status,result_status,selected_for_reporting,report_order_override,group_order_override,
          recheck_mode,recheck_status,recheck_vendor_id,recheck_requested_at,recheck_remarks,sample_priority,source_report_item_id,original_report_item_id,is_recheck_item,original_result_value,
          collection_status,collection_mode,outsource_result_value,internal_check_required,internal_check_status,final_result_source,specimen_id,specimen_type_id,specimen_name,sample_type,sample_remarks
        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const markParent = this.db.prepare(`UPDATE report_items SET
          selected_for_reporting=0,
          excluded_from_approval=1,
          moved_to_recheck_report_id=?,
          recheck_child_report_item_id=?,
          sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE report_id=? AND id=?`);
      const childBySource = new Map<number, number>();
      for (const src of rows) {
        const rowRemark = remarksById.get(+src.id) || '';
        const combined = rowRemark || reason;
        const childId = Number(insertChild.run(
          childReportId,
          src.test_id || null,
          src.test_name || '',
          src.department_name || '',
          src.side_header || '',
          '',
          src.unit || '',
          src.normal_range || '',
          src.method || '',
          +(src.priority || 0),
          +(src.highlight_parameter || 0),
          src.heading_kind || '',
          src.source_profile_id || null,
          src.source_profile_name || '',
          '',
          0,
          '',
          '',
          'PENDING',
          1,
          src.report_order_override ?? null,
          src.group_order_override ?? null,
          mode,
          status,
          vendorId || null,
          now,
          combined,
          src.sample_priority || src.source_sample_priority || 'ROUTINE',
          +src.id,
          +src.id,
          1,
          src.result_value || '',
          collectionStatus,
          collectionMode,
          '',
          mode === 'BOTH' ? 1 : (+src.internal_check_required || 0),
          mode === 'BOTH' ? 'PENDING' : 'NOT_REQUIRED',
          finalSource,
          src.specimen_id || src.source_specimen_id || '',
          src.specimen_type_id || src.source_specimen_type_id || null,
          src.specimen_name || src.source_specimen_name || '',
          src.sample_type || src.source_sample_type || '',
          `Recheck from report ${reportId}: ${combined}`
        ).lastInsertRowid);
        childBySource.set(+src.id, childId);
        childItemIds.push(childId);
        markParent.run(childReportId, childId, `Moved to recheck report ${childReportId}: ${combined}`, reportId, +src.id);
      }

      if (mode === 'OUTSOURCE' || mode === 'BOTH') {
        const groups = new Map<string, any[]>();
        for (const src of rows) {
          const key = String(src.source_collection_id || 0) + '|' + String(src.source_specimen_name || src.specimen_name || 'Specimen') + '|' + String(src.source_sample_type || src.sample_type || '');
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(src);
        }
        const insertCollection = this.db.prepare(`INSERT INTO specimen_collections(bill_id,specimen_id,specimen_type_id,specimen_name,sample_type,collection_mode,outsource_vendor_id,sample_priority,dispatch_status,status,collect_timing,expected_collect_at,remarks,collected_at,parent_collection_id,updated_at,source_type,sample_identification,recheck_report_id)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
        const insertSct = this.db.prepare(`INSERT INTO specimen_collection_tests(collection_id,report_item_id,test_id,test_name,source_report_item_id,collection_mode,internal_check_required,outsource_vendor_id)
          VALUES(?,?,?,?,?,?,?,?)`);
        for (const groupRows of groups.values()) {
          const first = groupRows[0] || {};
          const specimenName = String(first.source_specimen_name || first.specimen_name || 'Specimen');
          const specimenId = this.nextSpecimenId(specimenName, now);
          const collectionId = Number(insertCollection.run(
            +parentReport.bill_id,
            specimenId,
            first.source_specimen_type_id || first.specimen_type_id || null,
            specimenName,
            first.source_sample_type || first.sample_type || '',
            'OUTSOURCE',
            vendorId,
            first.source_sample_priority || first.sample_priority || 'ROUTINE',
            'READY',
            'COLLECTED',
            first.source_collect_timing || 'NOW',
            first.source_expected_collect_at || null,
            `Recheck outsource collection for report ${childReportId}: ${reason}`,
            now,
            first.source_collection_id || null,
            now,
            'RECHECK',
            'RECHECK',
            childReportId
          ).lastInsertRowid);
          for (const src of groupRows) {
            const childId = childBySource.get(+src.id) || 0;
            if (!childId) continue;
            insertSct.run(collectionId, childId, src.test_id || null, src.test_name || '', +src.id, 'OUTSOURCE', mode === 'BOTH' ? 1 : (+src.internal_check_required || 0), vendorId);
          }
        }
      }

      const remaining = this.db.prepare(`SELECT
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='PENDING' OR TRIM(COALESCE(result_value,''))='' THEN 1 ELSE 0 END) pending_count,
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='ENTERED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) entered_count,
          SUM(CASE WHEN COALESCE(result_status,'PENDING')='APPROVED' AND TRIM(COALESCE(result_value,''))<>'' THEN 1 ELSE 0 END) approved_count,
          COUNT(*) item_count
        FROM report_items WHERE report_id=? AND test_id IS NOT NULL AND COALESCE(selected_for_reporting,1)=1 AND NOT (COALESCE(excluded_from_approval,0)=1 OR COALESCE(moved_to_recheck_report_id,0)>0)`).get(reportId) as any;
      const pendingCount = +remaining?.pending_count || 0;
      const enteredCount = +remaining?.entered_count || 0;
      const approvedCount = +remaining?.approved_count || 0;
      const itemCount = +remaining?.item_count || 0;
      const nextParentStatus = itemCount === 0 ? 'RECHECK_SPLIT' : (pendingCount > 0 ? 'DRAFT' : (enteredCount > 0 ? 'TYPED' : (approvedCount > 0 ? 'APPROVED' : 'DRAFT')));
      this.db.prepare(`UPDATE reports SET status=?, remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE id=?`).run(nextParentStatus, `Split ${rows.length} test(s) to recheck report ${childReportId}: ${reason}`, now, reportId);
      this.audit('report.recheck.split', JSON.stringify({ parentReportId: reportId, childReportId, parentItemIds: ids, childItemIds, mode, vendorId, reason }));
    });
    tx();
    return { ok: true, report_id: childReportId, parent_report_id: reportId, count: rows.length, mode, child_item_ids: childItemIds };
  }

  revertReportRecheck(payload: any = {}) {
    this.ensureCollectionSchema();
    this.ensureMultiReportSchema();
    const childReportId = +payload.report_id || 0;
    let ids = Array.from(new Set((payload.report_item_ids || []).map((x:any)=>+x).filter(Boolean)));
    if (!childReportId) throw new Error('Recheck report id is required.');
    const childReport = this.db.prepare(`SELECT * FROM reports WHERE id=?`).get(childReportId) as any;
    if (!childReport?.id) throw new Error('Recheck report not found.');
    if (String(childReport.report_kind || '').toUpperCase() !== 'RECHECK' && String(childReport.report_scope || '').toUpperCase() !== 'RECHECK') throw new Error('Selected report is not a recheck report.');
    const parentReportId = +childReport.parent_report_id || 0;
    if (!parentReportId) throw new Error('Original report link is missing for this recheck report.');

    // Reporting > Pending Rechecks is the single place allowed to cancel/reject a recheck.
    // Resolve child recheck rows by the child report and parent/original links. Do not depend on
    // old same-report recheck statuses, because split child reports may store different statuses
    // after dispatch/receive. If the UI sends no item ids, reject all active child recheck rows.
    let rows: any[] = [];
    const activePredicate = `
      ri.test_id IS NOT NULL
      AND COALESCE(ri.selected_for_reporting,1)=1
      AND (
        COALESCE(ri.is_recheck_item,0)=1
        OR COALESCE(ri.original_report_item_id,0)>0
        OR COALESCE(ri.source_report_item_id,0)>0
        OR UPPER(COALESCE(ri.recheck_mode,'NONE')) IN ('INHOUSE','OUTSOURCE','BOTH')
      )
      AND UPPER(COALESCE(ri.result_status,'PENDING')) NOT IN ('CANCELLED','APPROVED','FINALIZED')
      AND UPPER(COALESCE(ri.recheck_status,'PENDING')) NOT IN ('REVERTED','RECHECK_REVERTED','RECHECK_REJECTED','CANCELLED','DONE','APPROVED','FINALIZED')`;
    const selectBase = `SELECT
        ri.id,
        ri.original_report_item_id,
        ri.source_report_item_id,
        ri.recheck_mode,
        ri.recheck_status,
        ri.result_status,
        sct.collection_id
      FROM report_items ri
      LEFT JOIN specimen_collection_tests sct ON sct.report_item_id=ri.id
      WHERE ri.report_id=? AND ${activePredicate}`;
    if (ids.length) {
      const placeholders = ids.map(()=>'?').join(',');
      rows = this.db.prepare(`${selectBase} AND ri.id IN (${placeholders})`).all(childReportId, ...ids) as any[];
    }
    if (!rows.length) {
      rows = this.db.prepare(selectBase).all(childReportId) as any[];
      ids = rows.map((x:any)=>+x.id).filter(Boolean);
    }
    if (!rows.length) {
      // Final fallback for current DBs where the child recheck row was created with an older
      // status/selection combination. Pending Rechecks reject is report-scoped, so when the UI
      // sends no usable item ids we can safely resolve by the child RECHECK report links.
      rows = this.db.prepare(`SELECT
          ri.id,
          ri.original_report_item_id,
          ri.source_report_item_id,
          ri.recheck_mode,
          ri.recheck_status,
          ri.result_status,
          sct.collection_id
        FROM report_items ri
        LEFT JOIN specimen_collection_tests sct ON sct.report_item_id=ri.id
        WHERE ri.report_id=?
          AND ri.test_id IS NOT NULL
          AND (
            COALESCE(ri.is_recheck_item,0)=1
            OR COALESCE(ri.original_report_item_id,0)>0
            OR COALESCE(ri.source_report_item_id,0)>0
            OR UPPER(COALESCE(ri.recheck_mode,'NONE')) IN ('INHOUSE','OUTSOURCE','BOTH')
          )
          AND UPPER(COALESCE(ri.result_status,'PENDING')) NOT IN ('APPROVED','FINALIZED')
          AND UPPER(COALESCE(ri.recheck_status,'PENDING')) NOT IN ('REVERTED','RECHECK_REVERTED','RECHECK_REJECTED','CANCELLED','APPROVED','FINALIZED')`).all(childReportId) as any[];
      ids = rows.map((x:any)=>+x.id).filter(Boolean);
    }
    if (!rows.length) throw new Error('No active pending recheck items found to reject. Refresh Pending Rechecks and try again.');
    const locked = rows.find((x:any)=>['APPROVED','FINALIZED'].includes(String(x.result_status || '').toUpperCase()) || ['APPROVED','FINALIZED'].includes(String(x.recheck_status || '').toUpperCase()));
    if (locked) throw new Error('Completed/approved recheck cannot be reverted here. Use correction/admin flow.');
    const reason = String(payload.reason || 'Recheck reverted').trim();
    const now = this.nowIst();
    const tx = this.db.transaction(() => {
      const restoreParent = this.db.prepare(`UPDATE report_items SET
          selected_for_reporting=1,
          excluded_from_approval=0,
          moved_to_recheck_report_id=NULL,
          recheck_child_report_item_id=NULL,
          recheck_mode='NONE',
          recheck_status='NONE',
          recheck_vendor_id=NULL,
          recheck_requested_at=NULL,
          recheck_remarks='',
          result_status='PENDING',
          collection_status=CASE WHEN COALESCE(collection_status,'') IN ('','PENDING','REJECTED') THEN 'COLLECTED' ELSE collection_status END,
          sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE report_id=? AND id=?`);
      const cancelChild = this.db.prepare(`UPDATE report_items SET
          selected_for_reporting=0,
          result_status='CANCELLED',
          recheck_status='REVERTED',
          recheck_reverted_at=?,
          recheck_remarks=TRIM(COALESCE(recheck_remarks,'') || CASE WHEN COALESCE(recheck_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE report_id=? AND id=?`);
      const originalItemIds = Array.from(new Set(rows.map((x:any)=>+x.original_report_item_id || +x.source_report_item_id || 0).filter(Boolean)));
      const childCollectionIds = Array.from(new Set(rows.map((x:any)=>+x.collection_id || 0).filter(Boolean)));
      for (const row of rows) {
        const originalId = +row.original_report_item_id || +row.source_report_item_id || 0;
        if (originalId) restoreParent.run(`Recheck report ${childReportId} rejected/reverted: ${reason}`, parentReportId, originalId);
        cancelChild.run(now, reason, childReportId, +row.id);
      }
      // OUTSOURCE/BOTH child recheck collections are cancelled here and removed from active outsource collection.
      // Internal/in-house recheck has no child outsource collection, so this section is naturally skipped.
      if (childCollectionIds.length) {
        const ph = childCollectionIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE specimen_collections SET
            status='CANCELLED',
            dispatch_status='CANCELLED',
            source_type='RECHECK',
            sample_identification='RECHECK',
            reject_reason=?,
            rejected_at=?,
            updated_at=?,
            remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
          WHERE id IN (${ph})`).run(reason, now, now, 'Recheck rejected/reverted from Pending Rechecks - removed from active outsource recheck collection: ' + reason, ...childCollectionIds);
        this.db.prepare(`UPDATE specimen_collection_tests SET
            collection_mode='RECHECK_CANCELLED',
            internal_check_required=0
          WHERE collection_id IN (${ph})`).run(...childCollectionIds);
      }
      // Restored parent/original active samples must not keep a RECHECK identity after revert/reject.
      // This updates only collections directly linked to the restored original item ids, not the old child history.
      if (originalItemIds.length) {
        const ph = originalItemIds.map(()=>'?').join(',');
        this.db.prepare(`UPDATE specimen_collections SET
            source_type='NORMAL',
            sample_identification='NORMAL',
            updated_at=?
          WHERE id IN (SELECT DISTINCT collection_id FROM specimen_collection_tests WHERE report_item_id IN (${ph}))
            AND (UPPER(COALESCE(source_type,''))='RECHECK' OR UPPER(COALESCE(sample_identification,''))='RECHECK')`).run(now, ...originalItemIds);
      }
      const activeChild = this.db.prepare(`SELECT COUNT(*) c FROM report_items
        WHERE report_id=?
          AND test_id IS NOT NULL
          AND COALESCE(selected_for_reporting,1)=1
          AND UPPER(COALESCE(result_status,'PENDING')) NOT IN ('CANCELLED','APPROVED','FINALIZED')`).get(childReportId) as any;
      if ((+activeChild?.c || 0) === 0) this.db.prepare(`UPDATE reports SET status='RECHECK_CANCELLED', remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE id=?`).run(`Recheck rejected/reverted: ${reason}`, now, childReportId);
      this.recomputeReportStatusForActiveItems(parentReportId);
      this.audit('report.recheck.reject_restore', JSON.stringify({ parentReportId, childReportId, childItemIds: rows.map((x:any)=>+x.id), originalItemIds, childCollectionIds, reason }));
    });
    tx();
    return { ok: true, report_id: parentReportId, recheck_report_id: childReportId, count: rows.length };
  }

  reopenApprovedReportForCorrection(reportId: number, payload: any = {}) {
    const id = +reportId || 0;
    if (!id) throw new Error('Report id is required.');
    const reason = String(payload?.reason || '').trim();
    if (!reason) throw new Error('Correction reason is required.');
    const report = this.db.prepare('SELECT r.*, b.bill_no FROM reports r JOIN bills b ON b.id=r.bill_id WHERE r.id=?').get(id) as any;
    if (!report?.id) throw new Error('Report not found.');
    const status = String(report.status || 'DRAFT').toUpperCase();
    if (status !== 'APPROVED') throw new Error('Only approved reports can be reopened with this correction flow.');
    if (String(report.report_kind || '').toUpperCase() === 'RECHECK' || String(report.report_scope || '').toUpperCase() === 'RECHECK') {
      throw new Error('Approved recheck reports need the correction/admin flow, not normal report reject.');
    }
    const now = this.nowIst();
    const tx = this.db.transaction(() => {
      const itemRows = this.db.prepare(`SELECT id FROM report_items
        WHERE report_id=?
          AND test_id IS NOT NULL
          AND COALESCE(selected_for_reporting,1)=1
          AND NOT (COALESCE(excluded_from_approval,0)=1 OR COALESCE(moved_to_recheck_report_id,0)>0)
          AND COALESCE(result_status,'PENDING')='APPROVED'`).all(id) as any[];
      if (!itemRows.length) throw new Error('No approved result items found to reopen.');
      this.db.prepare(`UPDATE report_items SET
          result_status='ENTERED',
          sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE report_id=?
          AND test_id IS NOT NULL
          AND COALESCE(selected_for_reporting,1)=1
          AND NOT (COALESCE(excluded_from_approval,0)=1 OR COALESCE(moved_to_recheck_report_id,0)>0)
          AND COALESCE(result_status,'PENDING')='APPROVED'`).run('Approved report reopened for correction: ' + reason, id);
      this.db.prepare(`UPDATE reports SET
          status='TYPED',
          approved_by='',
          remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?),
          updated_at=?
        WHERE id=?`).run('Approved report reopened for correction: ' + reason, now, id);
      this.audit('report.correction.reopen', `${id}:${reason}`);
    });
    tx();
    return this.getReport(id);
  }


  rejectReport(reportId: number, payload: any = {}) {
    const id = +reportId || 0;
    if (!id) throw new Error('Report id is required.');
    const report = this.db.prepare('SELECT r.*, b.bill_no FROM reports r JOIN bills b ON b.id=r.bill_id WHERE r.id=?').get(id) as any;
    if (!report?.id) throw new Error('Report not found.');
    const status = String(report.status || 'DRAFT').toUpperCase();
    if (status === 'APPROVED') throw new Error('Approved reports cannot be rejected directly. Use Correction/Reopen flow.');
    if (status.includes('CANCEL')) throw new Error('Cancelled reports cannot be rejected.');
    const mode = String(payload.mode || 'ENTRY').toUpperCase();
    const reason = String(payload.reason || '').trim();
    if (!reason) throw new Error('Reject reason is required.');
    if (!['ENTRY','RECHECK','RECOLLECTION'].includes(mode)) throw new Error('Invalid report reject action.');
    const now = this.nowIst();
    const tx = this.db.transaction(() => {
      if (mode === 'ENTRY') {
        const rejectedItems = this.db.prepare(`SELECT id,test_name,result_value,outsource_result_value,internal_check_value,final_result_source,vendor_result_method,vendor_report_file,vendor_report_status
          FROM report_items
          WHERE report_id=? AND test_id IS NOT NULL
            AND COALESCE(result_status,'PENDING') IN ('ENTERED','TYPED','WAITING_APPROVAL')
            AND (TRIM(COALESCE(result_value,''))<>'' OR TRIM(COALESCE(outsource_result_value,''))<>'' OR TRIM(COALESCE(internal_check_value,''))<>'')`).all(id) as any[];
        const changed = this.db.prepare(`UPDATE report_items SET
            result_value='',
            outsource_result_value=NULL,
            internal_check_value=NULL,
            internal_check_remarks=TRIM(COALESCE(internal_check_remarks,'')),
            final_result_source='MANUAL',
            vendor_result_method='ENTER_VALUES',
            vendor_report_status='PENDING',
            vendor_report_file='',
            result_status='PENDING',
            recheck_mode='NONE',
            recheck_status='NONE',
            recheck_requested_at=NULL,
            recheck_remarks='',
            flag_status='',
            is_critical=0,
            critical_message='',
            formula_status='',
            sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
          WHERE report_id=? AND test_id IS NOT NULL
            AND COALESCE(result_status,'PENDING') IN ('ENTERED','TYPED','WAITING_APPROVAL')
            AND (TRIM(COALESCE(result_value,''))<>'' OR TRIM(COALESCE(outsource_result_value,''))<>'' OR TRIM(COALESCE(internal_check_value,''))<>'')`).run('Report rejected to result entry: ' + reason, id);
        if (!changed.changes) throw new Error('No waiting-approval result items found to reject. Refresh Reporting and try again.');
        this.audit('report.reject.entry.previous_values', JSON.stringify({ reportId:id, reason, items: rejectedItems.slice(0, 100) }));
        this.db.prepare(`UPDATE reports SET status='DRAFT', remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE id=?`).run('Report rejected to result entry: ' + reason, now, id);
      } else if (mode === 'RECHECK') {
        throw new Error('Use Recheck Selected from the report entry screen. Report-level recheck is disabled to avoid moving the full report by accident.');
      } else {
        const itemRows = this.db.prepare(`SELECT id,specimen_id FROM report_items WHERE report_id=? AND test_id IS NOT NULL AND COALESCE(result_status,'PENDING') IN ('ENTERED','TYPED','WAITING_APPROVAL') AND TRIM(COALESCE(result_value,''))<>''`).all(id) as any[];
        const changed = this.db.prepare(`UPDATE report_items SET result_value='', result_status='PENDING', collection_status='PENDING', specimen_id=NULL, specimen_type_id=NULL, specimen_name=NULL, sample_type=NULL, collection_mode=NULL, internal_check_required=0, internal_check_status='NOT_REQUIRED', outsource_result_value=NULL, internal_check_value=NULL, internal_check_remarks=NULL, final_result_source='MANUAL', sample_priority='ROUTINE', recheck_mode='NONE', recheck_status='NONE', sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?) WHERE report_id=? AND test_id IS NOT NULL AND COALESCE(result_status,'PENDING') IN ('ENTERED','TYPED','WAITING_APPROVAL') AND TRIM(COALESCE(result_value,''))<>''`).run('Report rejected for recollection: ' + reason, id);
        if (!changed.changes) throw new Error('No waiting-approval result items found to recollect. Refresh Reporting and try again.');
        const specimenIds = Array.from(new Set(itemRows.map((x:any)=>String(x.specimen_id||'')).filter(Boolean)));
        if (specimenIds.length) {
          const placeholders = specimenIds.map(()=>'?').join(',');
          this.db.prepare(`UPDATE specimen_collections SET status='RECOLLECT_REQUESTED', reject_reason=COALESCE(NULLIF(reject_reason,''), ?), remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE bill_id=? AND specimen_id IN (${placeholders})`).run(reason, 'Report rejected for recollection: ' + reason, now, report.bill_id, ...specimenIds);
        }
        this.db.prepare(`UPDATE reports SET status='DRAFT', remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE id=?`).run('Report rejected for recollection: ' + reason, now, id);
      }
      this.audit('report.reject.' + mode.toLowerCase(), `${id}:${mode}:${reason}`);
      return id;
    });
    tx();
    return this.getReport(id);
  }

  listReportLogs(filters: any = {}) {
    const from = filters.from || '1900-01-01';
    const to = filters.to || '2999-12-31';
    return this.db.prepare(`SELECT a.id,a.action,a.details,a.created_at,r.id report_id,r.status,b.bill_no,p.title patient_title,p.name patient_name,p.mobile patient_mobile,
        CASE
          WHEN a.action='report.draft.save' THEN 'Draft saved'
          WHEN a.action='report.submit.approval' THEN 'Submitted for approval'
          WHEN a.action='report.approve' THEN 'Verified and approved'
          WHEN a.action='report.correction.reopen' THEN 'Reopened for correction'
          WHEN a.action='report.reject.entry' THEN 'Report rejected to result entry'
          WHEN a.action='report.reject.recheck' THEN 'Report rejected for recheck'
          WHEN a.action='report.reject.recollection' THEN 'Report rejected to collection'
          WHEN a.action='report.bill.cancel' THEN 'Bill cancelled report'
          WHEN a.action='report.recheck.done' THEN 'Recheck completed'
          WHEN a.action='report.delivery.pdf_export' THEN 'PDF exported'
          WHEN a.action='report.delivery.print' THEN 'Printed'
          WHEN a.action='report.delivery.email' THEN 'Email sent/opened'
          WHEN a.action='report.delivery.sms' THEN 'SMS sent/opened'
          ELSE REPLACE(REPLACE(a.action,'report.',''),'_',' ')
        END AS action_label,
        CASE
          WHEN a.action='report.correction.reopen' AND instr(a.details, ':') > 0 THEN 'Reason: ' || substr(a.details, instr(a.details, ':') + 1)
          WHEN a.action LIKE 'report.reject.%' AND instr(a.details, ':') > 0 THEN 'Reason: ' || substr(a.details, instr(a.details, ':') + 1 + instr(substr(a.details, instr(a.details, ':') + 1), ':'))
          WHEN a.action='report.bill.cancel' AND instr(a.details, ':') > 0 THEN 'Bill cancellation: ' || substr(a.details, instr(a.details, ':') + 1)
          WHEN a.action='report.approve' THEN 'Final approval completed'
          WHEN a.action='report.submit.approval' THEN 'Waiting approval'
          WHEN a.action='report.draft.save' THEN 'Draft saved, still editable'
          WHEN a.action='report.recheck.done' THEN 'Recheck result submitted back to approval'
          WHEN a.action LIKE 'report.delivery.%' AND instr(a.details, ':') > 0 THEN 'Delivery: ' || substr(a.details, instr(a.details, ':') + 1)
          ELSE a.details
        END AS details_label
      FROM audit_logs a
      LEFT JOIN reports r ON CAST(a.details AS INTEGER)=r.id
      LEFT JOIN bills b ON b.id=r.bill_id
      LEFT JOIN patients p ON p.id=b.patient_id
      WHERE a.action LIKE 'report.%'
        AND date(a.created_at) BETWEEN date(?) AND date(?)
      ORDER BY a.id DESC LIMIT 1000`).all(from, to);
  }

  reportItemHistory(patientId:number, testId:number, currentReportId:number=0) {
    if (!patientId || !testId) return [];
    const patient = (this.db.prepare('SELECT patient_no,mobile FROM patients WHERE id=?').get(patientId) as any) || {};
    const patientNo = String(patient.patient_no || '').trim();
    const mobile = String(patient.mobile || '').trim();
    return this.db.prepare(`
      SELECT * FROM (
        SELECT b.bill_no,b.bill_date,r.id report_id,ri.test_id,ri.test_name,
          COALESCE(NULLIF(TRIM(COALESCE(ri.result_value,'')),''), NULLIF(TRIM(COALESCE(ri.outsource_result_value,'')),''), NULLIF(TRIM(COALESCE(ri.internal_check_value,'')),'')) AS result_value,
          ri.unit,ri.normal_range,ri.flag_status,ri.is_critical,COALESCE(r.updated_at,r.created_at,b.bill_date) AS created_at,'REGULAR' AS report_source
        FROM report_items ri
        JOIN reports r ON r.id=ri.report_id
        JOIN bills b ON b.id=r.bill_id
        JOIN patients p ON p.id=b.patient_id
        WHERE (b.patient_id=? OR (?<>'' AND p.patient_no=?) OR (?<>'' AND p.mobile=?))
          AND ri.test_id=?
          AND COALESCE(NULLIF(TRIM(COALESCE(ri.result_value,'')),''), NULLIF(TRIM(COALESCE(ri.outsource_result_value,'')),''), NULLIF(TRIM(COALESCE(ri.internal_check_value,'')),'')) IS NOT NULL
          AND (?=0 OR r.id<>?)
        UNION ALL
        SELECT b.bill_no,b.bill_date,-qr.id AS report_id,qri.test_id,qri.test_name,
          NULLIF(TRIM(COALESCE(qri.result_value,'')),'') AS result_value,
          qri.unit,qri.normal_range,qri.flag_status,qri.is_critical,COALESCE(qr.updated_at,qr.created_at,b.bill_date) AS created_at,'QUICK' AS report_source
        FROM quick_report_items qri
        JOIN quick_reports qr ON qr.id=qri.quick_report_id
        JOIN bills b ON b.id=qr.bill_id
        JOIN patients p ON p.id=qr.patient_id
        WHERE (qr.patient_id=? OR (?<>'' AND p.patient_no=?) OR (?<>'' AND p.mobile=?))
          AND qri.test_id=?
          AND NULLIF(TRIM(COALESCE(qri.result_value,'')),'') IS NOT NULL
      ) h
      ORDER BY date(COALESCE(h.bill_date,h.created_at)) DESC, h.created_at DESC, h.report_id DESC
      LIMIT 25`).all(patientId, patientNo, patientNo, mobile, mobile, testId, currentReportId, currentReportId, patientId, patientNo, patientNo, mobile, mobile, testId);
  }

  patientHistory(patientId:number) {
    this.ensureQuickReportingSchema();
    const patient = this.db.prepare('SELECT * FROM patients WHERE id=?').get(patientId) as any;
    const bills = this.db.prepare(`SELECT b.*,c.name consultant_name,
        (SELECT COUNT(*) FROM bill_items bi WHERE bi.bill_id=b.id) item_count,
        (SELECT COALESCE(SUM(amount),0) FROM receipts r WHERE r.bill_id=b.id) receipt_total
      FROM bills b LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE b.patient_id=? ORDER BY b.id DESC`).all(patientId) as any[];
    const receipts = this.db.prepare(`SELECT r.*,b.bill_no FROM receipts r JOIN bills b ON b.id=r.bill_id WHERE b.patient_id=? ORDER BY r.id DESC`).all(patientId) as any[];
    const reports = this.db.prepare(`SELECT r.*,b.bill_no,b.bill_date,COUNT(ri.id) item_count
      FROM reports r JOIN bills b ON b.id=r.bill_id LEFT JOIN report_items ri ON ri.report_id=r.id AND ri.test_id IS NOT NULL
      WHERE b.patient_id=? GROUP BY r.id ORDER BY r.id DESC`).all(patientId) as any[];
    const quickReports = this.db.prepare(`SELECT qr.*,b.bill_no,b.bill_date,COUNT(qri.id) item_count
      FROM quick_reports qr JOIN bills b ON b.id=qr.bill_id LEFT JOIN quick_report_items qri ON qri.quick_report_id=qr.id AND qri.test_id IS NOT NULL
      WHERE qr.patient_id=? GROUP BY qr.id ORDER BY qr.id DESC`).all(patientId) as any[];
    return { patient, bills, receipts, reports, quickReports };
  }
  dashboard() { return { billsToday:(this.db.prepare("SELECT COUNT(*) c, COALESCE(SUM(total),0) total, COALESCE(SUM(paid),0) paid, COALESCE(SUM(due),0) due FROM bills WHERE date(bill_date)=date('now','+330 minutes')").get() as any), pendingReports:(this.db.prepare("SELECT COUNT(*) c FROM reports WHERE status!='APPROVED'").get() as any).c, patients:(this.db.prepare('SELECT COUNT(*) c FROM patients').get() as any).c }; }

}
