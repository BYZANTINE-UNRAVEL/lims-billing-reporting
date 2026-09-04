import { DatabaseCoreService } from './database-core.service';

export abstract class DatabaseBillingService extends DatabaseCoreService {  createBill(payload: any) {
    this.ensureBillingSchema();
    const tx = this.db.transaction(() => {
      const patientId = this.savePatient(payload.patient);
      const billNo = this.nextConfiguredNo('invoice', 'bills', 'bill_no');
      const data = this.prepareBillPayload(payload);
      const billId = Number(this.db.prepare('INSERT INTO bills(bill_no,patient_id,consultant_id,bill_date,subtotal,discount,discount_type,discount_value,total,paid,due,payment_mode,round_mode,round_off,cash_received,cash_return,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(billNo, patientId, payload.consultant_id || null, this.nowIst(), data.subtotal, data.finalDiscount, data.discountType, data.discountValue, data.total, 0, data.total, data.paymentMode, data.roundMode, data.roundOff, 0, 0, data.notes).lastInsertRowid);
      this.replaceBillItems(billId, data.preparedItems);
      // Quick Reporting must stay isolated from the normal lab workflow.
      // In quick mode billing creates only bill/bill_items; Report Typing reads those directly.
      if (!this.isQuickReportingEnabled()) {
        this.rebuildReportFromBill(billId);
        this.markBillReportQuickPending(billId);
      }
      this.audit('bill.create', billNo);
      return billId;
    });
    return this.getBill(tx());
  }

  updateBill(payload: any) {
    this.ensureBillingSchema();
    const billId = Number(payload.id || 0);
    if (!billId) throw new Error('Bill id is required for update.');
    const existing = this.db.prepare('SELECT bill_no FROM bills WHERE id=?').get(billId) as any;
    if (!existing) throw new Error('Bill not found.');
    this.assertBillEditableForClinicalWorkflow(billId);
    const tx = this.db.transaction(() => {
      const patientId = this.savePatient(payload.patient);
      const data = this.prepareBillPayload({ ...payload, paid: 0, cash_received: 0 });
      this.replaceBillItems(billId, data.preparedItems);
      this.db.prepare('UPDATE bills SET patient_id=?,consultant_id=?,subtotal=?,discount=?,discount_type=?,discount_value=?,total=?,payment_mode=?,round_mode=?,round_off=?,cash_received=?,cash_return=?,notes=? WHERE id=?')
        .run(patientId, payload.consultant_id || null, data.subtotal, data.finalDiscount, data.discountType, data.discountValue, data.total, payload.payment_mode || 'Cash', data.roundMode, data.roundOff, 0, 0, data.notes, billId);
      this.recalculateBillPayment(billId);
      // Quick Reporting must not rebuild/create Pending Request, Collection, or normal report rows.
      if (!this.isQuickReportingEnabled()) {
        this.rebuildReportFromBill(billId);
        this.markBillReportQuickPending(billId);
      }
      this.audit('bill.update', existing.bill_no);
      return billId;
    });
    return this.getBill(tx());
  }

  protected assertQuickBillFullyPending(billId: number) {
    this.ensureQuickReportingSchema();
    const active = this.db.prepare(`SELECT COUNT(*) c
      FROM quick_reports qr
      JOIN quick_report_items qri ON qri.quick_report_id=qr.id
      WHERE qr.bill_id=?
        AND UPPER(COALESCE(qr.status,'FINISHED'))='FINISHED'
        AND qri.test_id IS NOT NULL`).get(billId) as any;
    if ((+active?.c || 0) > 0) {
      throw new Error('Bill edit/delete blocked. Some billed items are already saved in Quick Reporting. Delete those finished quick reports first so all items return to Pending.');
    }
  }

  protected assertBillEditableForClinicalWorkflow(billId: number) {
    if (this.isQuickReportingEnabled()) {
      this.assertQuickBillFullyPending(billId);
      return;
    }
    const locked = this.db.prepare(`SELECT ri.test_name, COALESCE(ri.collection_status,'PENDING') collection_status, COALESCE(ri.result_status,'PENDING') result_status, COALESCE(r.status,'DRAFT') report_status
      FROM reports r JOIN report_items ri ON ri.report_id=r.id
      WHERE r.bill_id=? AND ri.test_id IS NOT NULL
        AND (COALESCE(ri.collection_status,'PENDING') <> 'PENDING' OR COALESCE(ri.result_status,'PENDING') <> 'PENDING' OR COALESCE(r.status,'DRAFT') NOT IN ('DRAFT','PENDING'))
      LIMIT 6`).all(billId) as any[];
    if (!locked.length) return;
    const names = locked.slice(0,5).map((x:any)=>x.test_name || 'Test').join(', ');
    const more = locked.length > 5 ? ` +${locked.length-5} more` : '';
    throw new Error(`Bill edit blocked. Collection/report workflow has started for: ${names}${more}. Use Cancel Test / Correction / Recollection flow instead of editing bill items directly.`);
  }

  protected replaceBillItems(billId: number, items: any[]) {
    const previous = this.db.prepare(`SELECT item_type, item_id, quantity, price, net_amount, running_cost, extra_deduction,
      commission_amount, profit_amount, commission_profile_name, commission_rule_source, commission_status,
      commission_approved_at, commission_paid_at, commission_hold_reason, commission_settlement_id,
      commission_formula, commission_formula_values, commission_group_id, commission_rule_version
      FROM bill_items WHERE bill_id=?`).all(billId) as any[];
    const protectedByKey = new Map<string, any>();
    for (const row of previous) {
      const status = String(row.commission_status || '').toUpperCase();
      if (!this.isProtectedCommissionStatus(status)) continue;
      const key = `${String(row.item_type || '').toUpperCase()}:${Number(row.item_id || 0)}`;
      // Keep first protected match per billed item identity
      if (!protectedByKey.has(key)) protectedByKey.set(key, row);
    }
    const paidStillPresent = new Set<string>();
    for (const i of items) {
      const key = `${String(i.item_type || '').toUpperCase()}:${Number(i.item_id || 0)}`;
      const prior = protectedByKey.get(key);
      if (!prior) continue;
      if (String(prior.commission_status || '').toUpperCase() === 'PAID' || String(prior.commission_status || '').toUpperCase() === 'REVERSAL_PENDING') {
        paidStillPresent.add(key);
      }
      // Preserve locked commission snapshot; refresh line pricing nets already computed upstream
      i.running_cost = +prior.running_cost || 0;
      i.extra_deduction = +prior.extra_deduction || 0;
      i.commission_amount = +prior.commission_amount || 0;
      i.profit_amount = +prior.profit_amount || 0;
      i.commission_profile_name = prior.commission_profile_name || '';
      i.commission_rule_source = prior.commission_rule_source || '';
      i.commission_status = prior.commission_status || 'APPROVED';
      i.commission_approved_at = prior.commission_approved_at || null;
      i.commission_paid_at = prior.commission_paid_at || null;
      i.commission_hold_reason = prior.commission_hold_reason || null;
      i.commission_settlement_id = prior.commission_settlement_id || null;
      i.commission_formula = prior.commission_formula || '';
      i.commission_formula_values = prior.commission_formula_values || '';
      i.commission_group_id = prior.commission_group_id || null;
      i.commission_rule_version = prior.commission_rule_version || 1;
      i._commission_locked = true;
    }
    for (const [key, prior] of protectedByKey) {
      const st = String(prior.commission_status || '').toUpperCase();
      if ((st === 'PAID' || st === 'REVERSAL_PENDING') && !paidStillPresent.has(key)) {
        throw new Error(`Cannot remove paid commission item (${String(prior.item_type)} #${prior.item_id}). Paid commission must remain on the bill or be reversed via settlement workflow.`);
      }
    }
    this.db.prepare('DELETE FROM bill_items WHERE bill_id=?').run(billId);
    const insert = this.db.prepare('INSERT INTO bill_items(bill_id,item_type,item_id,name,department_name,quantity,price,total,priority,side_header,discount_type,discount_value,discount_amount,net_amount,running_cost,extra_deduction,commission_amount,profit_amount,commission_profile_name,commission_rule_source,commission_status,commission_approved_at,commission_paid_at,commission_hold_reason,commission_settlement_id,commission_formula,commission_formula_values,commission_group_id,commission_rule_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    items.forEach((i:any) => insert.run(
      billId, i.item_type, i.item_id, i.name, i.department_name || '', i.quantity, i.price, i.net_amount, +i.priority || 0, i.side_header || '',
      i.discount_type, i.discount_value, i.discount_amount, i.net_amount,
      +i.running_cost || 0, +i.extra_deduction || 0, +i.commission_amount || 0, +i.profit_amount || 0,
      i.commission_profile_name || '', i.commission_rule_source || '', i.commission_status || 'GENERATED',
      i.commission_approved_at || null, i.commission_paid_at || null, i.commission_hold_reason || null, i.commission_settlement_id || null,
      i.commission_formula || '', i.commission_formula_values || '', i.commission_group_id || null, i.commission_rule_version || 1
    ));
    const lockedCount = items.filter((i:any) => i._commission_locked).length;
    if (lockedCount) this.audit('commission.recalc.skipped', JSON.stringify({ billId, lockedCount }));
  }


  protected patientAgeInYears(age: any, ageUnit: any) {
    const n = Number(age);
    if (!Number.isFinite(n)) return null;
    const unit = String(ageUnit || 'YEARS').toUpperCase();
    if (unit.startsWith('DAY')) return n / 365.25;
    if (unit.startsWith('MONTH')) return n / 12;
    return n;
  }

  protected normalizeReferenceGender(value: any) {
    const compact = String(value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
    if (!compact) return 'ALL';
    if (compact === 'F' || compact.startsWith('FEMALE') || compact === 'MS' || compact === 'MRS' || compact === 'MISS' || compact.includes('WOMAN') || compact.includes('GIRL')) return 'FEMALE';
    if (compact === 'M' || compact.startsWith('MALE') || compact === 'MR' || compact === 'MASTER' || compact.includes('MAN') || compact.includes('BOY')) return 'MALE';
    if (compact.includes('FEMALE')) return 'FEMALE';
    if (compact.includes('MALE')) return 'MALE';
    return 'ALL';
  }

  protected pickReferenceRange(testId: number, patient: any) {
    const ranges = this.db.prepare('SELECT * FROM test_reference_ranges WHERE test_id=? AND is_active=1 ORDER BY display_order,id').all(testId) as any[];
    if (!ranges.length) return null;
    const gender = this.normalizeReferenceGender(patient?.gender);
    // Reporting intentionally ignores age-based reference rows for now.
    // Selection is gender first, then ALL fallback.
    const candidates = [
      ranges.find(r => this.normalizeReferenceGender(r.gender || 'ALL') === gender),
      ranges.find(r => this.normalizeReferenceGender(r.gender || 'ALL') === 'ALL'),
      ranges[0]
    ].filter(Boolean);
    return candidates[0] || null;
  }

  protected globalReportFlagsEnabled() {
    const enabled = String(this.getSetting('report.simple.tableFlagsEnabled', 'true')).toLowerCase() !== 'false';
    const mode = String(this.getSetting('report.simple.tableFlagMode', 'critical_flag_abnormal') || '').trim().toLowerCase();
    return enabled && mode !== 'none' && mode !== 'range_only';
  }

  protected selectedReferenceTextForItem(item: any, patient: any) {
    if (!item?.test_id) return '';
    const ref = this.pickReferenceRange(+item.test_id, patient);
    return String(ref?.reference_text || item?.normal_range || '').trim();
  }

  protected selectedReferenceFlagEnabled(item: any, patient: any) {
    if (!item?.test_id) return false;
    const ref = this.pickReferenceRange(+item.test_id, patient);
    return !!ref && Number(ref.flag_enabled ?? 1) !== 0;
  }

  protected applyResultFlagsToItem(item: any, patient: any) {
    if (!item?.test_id) return { flag_status:'', is_critical:0, critical_message:'' };
    if (!this.globalReportFlagsEnabled()) return { flag_status:'', is_critical:0, critical_message:'' };
    const ref = this.pickReferenceRange(+item.test_id, patient);
    const value = Number(String(item.result_value ?? '').replace(/,/g, '').trim());
    if (!ref || Number(ref.flag_enabled ?? 1) === 0 || !Number.isFinite(value)) return { flag_status:'', is_critical:0, critical_message:'' };
    const low = ref.lower_limit === null || ref.lower_limit === undefined || ref.lower_limit === '' ? null : Number(ref.lower_limit);
    const high = ref.upper_limit === null || ref.upper_limit === undefined || ref.upper_limit === '' ? null : Number(ref.upper_limit);
    const cLow = ref.critical_low === null || ref.critical_low === undefined || ref.critical_low === '' ? null : Number(ref.critical_low);
    const cHigh = ref.critical_high === null || ref.critical_high === undefined || ref.critical_high === '' ? null : Number(ref.critical_high);
    let flag = '';
    if (cLow !== null && Number.isFinite(cLow) && value <= cLow) return { flag_status: 'LOW', is_critical: 1, critical_message: `Critical low: ${value} <= ${cLow}` };
    if (cHigh !== null && Number.isFinite(cHigh) && value >= cHigh) return { flag_status: 'HIGH', is_critical: 1, critical_message: `Critical high: ${value} >= ${cHigh}` };
    if (low !== null && Number.isFinite(low) && value < low) flag = 'LOW';
    if (high !== null && Number.isFinite(high) && value > high) flag = 'HIGH';
    return { flag_status: flag, is_critical: 0, critical_message: '' };
  }

  protected formulaDependencyStatus(testId: number, reportItems: any[]) {
    const formula = this.db.prepare('SELECT * FROM test_formulas WHERE test_id=? AND is_active=1 ORDER BY id DESC LIMIT 1').get(testId) as any;
    if (!formula?.id) return '';
    const vars = this.db.prepare('SELECT * FROM test_formula_variables WHERE formula_id=?').all(formula.id) as any[];
    const missing = vars.filter(v => !reportItems.some((ri:any) => +ri.test_id === +v.source_test_id && String(ri.result_value || '').trim() !== '')).map(v => v.variable_key);
    return missing.length ? `Missing dependency: ${missing.join(', ')}` : 'Dependencies OK';
  }

  protected validateProfileItems(profileId:number, items:any[]) {
    const problems:string[] = [];
    const testSeen = new Set<number>();
    const profileSeen = new Set<number>();
    const visit = (pid:number, path:number[]) => {
      if (path.includes(pid)) { problems.push('Circular profile nesting is not allowed.'); return; }
      const rows = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(pid) as any[];
      for (const row of rows) {
        const type = String(row.item_type || 'TEST').toUpperCase();
        if (type === 'TEST' && row.test_id) {
          const tid = +row.test_id;
          if (testSeen.has(tid)) problems.push(`Duplicate test detected through nested profile: ${tid}`);
          testSeen.add(tid);
        } else if (type === 'PROFILE' && row.child_profile_id) {
          const cid = +row.child_profile_id;
          if (profileSeen.has(cid)) problems.push(`Duplicate nested profile detected: ${cid}`);
          profileSeen.add(cid); visit(cid, [...path, pid]);
        }
      }
    };
    for (const x of items || []) {
      const type = String(x.item_type || 'TEST').toUpperCase();
      if (type === 'TEST') {
        const tid = +x.test_id || 0;
        if (!tid) continue;
        if (testSeen.has(tid)) problems.push(`Duplicate test selected: ${tid}`);
        testSeen.add(tid);
        const t = this.db.prepare('SELECT code,name,active,billable,active_for_reporting FROM tests WHERE id=?').get(tid) as any;
        if (t) {
          const label = `${t.code || ''} ${t.name || ''}`.trim();
          if (Number(t.active) !== 1) problems.push(`Inactive test included: ${label}`);
          if (Number(t.billable) !== 1) problems.push(`Test inactive for billing: ${label}`);
          if (Number(t.active_for_reporting ?? 1) !== 1) problems.push(`Test inactive for reporting: ${label}`);
        }
      } else if (type === 'PROFILE') {
        const cid = +x.profile_id || +x.child_profile_id || 0;
        if (!cid) continue;
        if (cid === profileId) problems.push('Profile cannot contain itself.');
        if (profileSeen.has(cid)) problems.push(`Duplicate nested profile selected: ${cid}`);
        profileSeen.add(cid);
        const p = this.db.prepare('SELECT code,name,active,billable,active_for_reporting FROM profiles WHERE id=?').get(cid) as any;
        if (p) {
          const label = `${p.code || ''} ${p.name || ''}`.trim();
          if (Number(p.active) !== 1) problems.push(`Inactive profile included: ${label}`);
          if (Number(p.billable) !== 1) problems.push(`Profile inactive for billing: ${label}`);
          if (Number(p.active_for_reporting ?? 1) !== 1) problems.push(`Profile inactive for reporting: ${label}`);
        }
        visit(cid, [profileId]);
      }
    }
    return Array.from(new Set(problems));
  }


  protected repairCollectedReportProfileSources(reportId: number, billId: number) {
    // Do not delete collected report_items: specimen_collection_tests keeps FK references to them.
    // Instead, reconcile the current billed TEST/PROFILE tree into report_items and repair the
    // profile/card source on existing rows. Empty profile headings must never be shown.
    const sourceByTest = new Map<number, { sourceProfileId: number | null; sourceProfileName: string; order: number }>();
    let seq = 0;
    const profileDisplayName = (profile:any, fallback='Profile / group') => String(profile?.display_name || profile?.name || fallback || 'Profile / group').trim();
    const rememberTest = (testId:number, sourceProfileId:any, sourceProfileName:any, fallbackOrder:any=0) => {
      if (!testId || sourceByTest.has(+testId)) return;
      const t = this.db.prepare('SELECT id FROM tests WHERE id=? AND COALESCE(active_for_reporting,1)=1').get(+testId) as any;
      if (!t?.id) return;
      seq += 1;
      sourceByTest.set(+testId, { sourceProfileId: sourceProfileId ? +sourceProfileId : null, sourceProfileName: String(sourceProfileName || '').trim(), order: (+fallbackOrder || 0) + seq / 1000 });
    };
    const expandProfile = (profileId:number, seen:Set<number>, sourceProfileId:any, sourceProfileName:any, fallbackOrder:any=0) => {
      if (!profileId || seen.has(profileId)) return;
      const nextSeen = new Set(seen); nextSeen.add(profileId);
      const profile = this.db.prepare('SELECT * FROM profiles WHERE id=?').get(profileId) as any;
      if (!profile || Number(profile.active_for_reporting ?? 1) !== 1) return;
      const baseSourceId = sourceProfileId || profile.id || profileId;
      const baseSourceName = String(sourceProfileName || profileDisplayName(profile)).trim();
      const profileItems = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      if (profileItems.length) {
        for (const pi of profileItems) {
          const type = String(pi.item_type || 'TEST').toUpperCase();
          if (type === 'TEST') rememberTest(+pi.test_id, baseSourceId, baseSourceName, pi.priority || fallbackOrder);
          else if (type === 'PROFILE') {
            const child = this.db.prepare('SELECT * FROM profiles WHERE id=? AND COALESCE(active_for_reporting,1)=1').get(+pi.child_profile_id) as any;
            if (!child?.id) continue;
            const childShows = pi.display_profile_name !== 0;
            const childSourceId = childShows ? (+pi.child_profile_id || +child.id || baseSourceId) : baseSourceId;
            const childSourceName = childShows ? profileDisplayName(child, baseSourceName) : baseSourceName;
            expandProfile(+pi.child_profile_id, nextSeen, childSourceId, childSourceName, pi.priority || fallbackOrder);
          }
        }
      } else {
        const rows = this.db.prepare('SELECT pt.test_id,pt.priority FROM profile_tests pt JOIN tests t ON t.id=pt.test_id WHERE pt.profile_id=? AND COALESCE(t.active_for_reporting,1)=1 ORDER BY pt.priority,t.report_order,t.priority').all(profileId) as any[];
        for (const r of rows) rememberTest(+r.test_id, baseSourceId, baseSourceName, r.priority || fallbackOrder);
      }
    };
    const items = this.db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY priority,name').all(billId) as any[];
    for (const item of items) {
      const type = String(item.item_type || 'TEST').toUpperCase();
      if (type === 'TEST') rememberTest(+item.item_id, null, '', item.priority);
      else if (type === 'PROFILE') {
        const profile = this.db.prepare('SELECT * FROM profiles WHERE id=? AND COALESCE(active_for_reporting,1)=1').get(+item.item_id) as any;
        if (!profile?.id) continue;
        const title = profileDisplayName(profile, item.name || 'Profile / group');
        expandProfile(+item.item_id, new Set<number>(), +item.item_id, title, item.priority);
      }
    }

    // Append missing billed profile children only before recheck workflow starts.
    // During selected-test recheck, the bill still contains the full profile (for example LFT),
    // but only the selected child item (for example GGT) belongs to the recheck flow.
    // Re-appending missing bill/profile children here can recreate the whole collected profile
    // as Pending Collection. Keep metadata repair, but do not add new pending staging rows
    // once any active RECHECK report exists for this bill.
    const existingTestIds = new Set((this.db.prepare('SELECT test_id FROM report_items WHERE report_id=? AND test_id IS NOT NULL').all(reportId) as any[]).map(x => +x.test_id).filter(Boolean));
    const activeRecheck = +(this.db.prepare(`SELECT COUNT(*) c FROM reports
      WHERE bill_id=?
        AND (UPPER(COALESCE(report_scope,''))='RECHECK' OR UPPER(COALESCE(report_kind,''))='RECHECK')
        AND UPPER(COALESCE(status,'')) NOT IN ('CANCELLED','RECHECK_REJECTED','RECHECK_REVERTED','REVERTED')`).get(billId) as any)?.c || 0;
    if (!activeRecheck) {
      const insertMissingTest = this.db.prepare(`INSERT INTO report_items(report_id,test_id,test_name,department_name,side_header,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name,result_status,collection_status,selected_for_reporting)
        SELECT ?,t.id,COALESCE(NULLIF(t.display_name,''),t.name),COALESCE(d.name,''),'',COALESCE(u.name,''),COALESCE(t.normal_range,''),COALESCE(t.method,''),?,CASE WHEN COALESCE(t.highlight_parameter,0)=1 THEN 1 ELSE 0 END,'',?,?,'PENDING','PENDING',1
        FROM tests t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN units u ON u.id=t.unit_id
        WHERE t.id=? AND COALESCE(t.active_for_reporting,1)=1`);
      for (const [testId, src] of sourceByTest.entries()) {
        if (!existingTestIds.has(+testId)) {
          insertMissingTest.run(reportId, src.order, src.sourceProfileId, src.sourceProfileName, testId);
          existingTestIds.add(+testId);
        }
      }
    }

    const update = this.db.prepare(`UPDATE report_items SET source_profile_id=?, source_profile_name=?, heading_kind='', priority=COALESCE(report_order_override, ?) WHERE report_id=? AND test_id=?`);
    for (const [testId, src] of sourceByTest.entries()) update.run(src.sourceProfileId, src.sourceProfileName, src.order, reportId, testId);

    // Remove headings and re-add only profile cards that have at least one actual ordered test row.
    this.db.prepare('DELETE FROM report_items WHERE report_id=? AND test_id IS NULL').run(reportId);
    const cardsWithTests = this.db.prepare(`SELECT source_profile_id, source_profile_name, MIN(priority) priority, COUNT(*) c
      FROM report_items
      WHERE report_id=? AND test_id IS NOT NULL AND TRIM(COALESCE(source_profile_name,''))<>''
      GROUP BY source_profile_id, source_profile_name
      HAVING COUNT(*) > 0
      ORDER BY MIN(priority)`).all(reportId) as any[];
    const insertHeading = this.db.prepare('INSERT INTO report_items(report_id,test_id,test_name,department_name,side_header,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const src of cardsWithTests) insertHeading.run(reportId, null, src.source_profile_name, '', '', '', '', '', (+src.priority || 0) - 0.0001, 0, 'PROFILE', src.source_profile_id || null, src.source_profile_name);
  }

  protected rebuildReportFromBill(billId: number, scope: 'STAGING'|'COLLECTION' = 'STAGING') {
    const reportScope = scope === 'COLLECTION' ? 'COLLECTION' : 'STAGING';
    let reportId = (this.db.prepare("SELECT id FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION')=? ORDER BY id LIMIT 1").get(billId, reportScope) as any)?.id;
    if (!reportId) { const now = this.nowIst(); reportId = Number(this.db.prepare("INSERT INTO reports(bill_id,status,created_at,updated_at,report_scope,report_title) VALUES(?,?,?,?,?,?)").run(billId, reportScope === 'STAGING' ? 'COLLECTION_STAGING' : 'DRAFT', now, now, reportScope, reportScope === 'STAGING' ? 'Collection staging' : '').lastInsertRowid); }
    const billPatient = (this.db.prepare(`SELECT p.* FROM bills b JOIN patients p ON p.id=b.patient_id WHERE b.id=?`).get(billId) as any) || {};
    const linkedCollections = (this.db.prepare(`SELECT COUNT(*) c FROM specimen_collection_tests sct JOIN report_items ri ON ri.id=sct.report_item_id WHERE ri.report_id=?`).get(reportId) as any)?.c || 0;
    if (linkedCollections > 0) { this.repairCollectedReportProfileSources(reportId, billId); return; }
    this.db.prepare('DELETE FROM report_items WHERE report_id=?').run(reportId);
    const items = this.db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY priority,name').all(billId) as any[];
    const insert = this.db.prepare('INSERT INTO report_items(report_id,test_id,test_name,department_name,side_header,unit,normal_range,method,priority,highlight_parameter,heading_kind,source_profile_id,source_profile_name) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
    const insertedTestIds = new Set<number>();
    let reportRowOrder = 0;
    const nextOrder = (fallback:any) => { reportRowOrder += 1; return (+fallback || 0) + (reportRowOrder / 1000); };
    const profileDisplayName = (profile:any, fallback='Profile / group') => String(profile?.display_name || profile?.name || fallback || 'Profile / group').trim();
    const testIsReportable = (testId:number) => {
      if (!testId || insertedTestIds.has(+testId)) return false;
      const t = this.db.prepare('SELECT id FROM tests WHERE id=? AND COALESCE(active_for_reporting,1)=1').get(+testId) as any;
      return !!t?.id;
    };
    const profileHasUninsertedTest = (profileId:number, seen:Set<number>): boolean => {
      if (!profileId || seen.has(profileId)) return false;
      const profile = this.db.prepare('SELECT id FROM profiles WHERE id=? AND COALESCE(active_for_reporting,1)=1').get(profileId) as any;
      if (!profile?.id) return false;
      const nextSeen = new Set(seen); nextSeen.add(profileId);
      const profileItems = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      if (profileItems.length) {
        return profileItems.some(pi => {
          const type = String(pi.item_type || 'TEST').toUpperCase();
          if (type === 'TEST') return testIsReportable(+pi.test_id);
          if (type === 'PROFILE') return profileHasUninsertedTest(+pi.child_profile_id, nextSeen);
          return false;
        });
      }
      const rows = this.db.prepare('SELECT pt.test_id FROM profile_tests pt JOIN tests t ON t.id=pt.test_id WHERE pt.profile_id=? AND COALESCE(t.active_for_reporting,1)=1').all(profileId) as any[];
      return rows.some(r => testIsReportable(+r.test_id));
    };
    const insertHeading = (text:string, fallbackPriority:any, kind:'PROFILE'|'INNER'='INNER', sourceProfileId:any=null, sourceProfileName:any='') => {
      const title = String(text || '').trim();
      if (title) insert.run(reportId, null, title, '', '', '', '', '', nextOrder(fallbackPriority), 0, kind, sourceProfileId || null, sourceProfileName || title);
    };
    const insertTest = (testId:number, fallbackPriority:any, sourceProfileId:any=null, sourceProfileName:any='') => {
      if (!testIsReportable(+testId)) return;
      const t = this.db.prepare('SELECT t.*,d.name department_name,u.name unit_name FROM tests t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN units u ON u.id=t.unit_id WHERE t.id=?').get(testId) as any;
      if (t?.id) {
        insertedTestIds.add(+testId);
        const refText = this.selectedReferenceTextForItem({ test_id: t.id, normal_range: t.normal_range || '' }, billPatient) || t.normal_range || '';
        insert.run(reportId, t.id, t.display_name || t.name, t.department_name, '', t.unit_name || '', refText, t.method || '', nextOrder(fallbackPriority || t.report_order || t.priority || 0), t.highlight_parameter ? 1 : 0, '', sourceProfileId || null, sourceProfileName || '');
      }
    };
    const expandProfile = (profileId:number, showHeading:boolean, seen:Set<number>, fallbackPriority:any=0, sourceProfileId:any=null, sourceProfileName:any='', forceSource=false) => {
      if (!profileId || seen.has(profileId) || !profileHasUninsertedTest(profileId, seen)) return;
      const nextSeen = new Set(seen); nextSeen.add(profileId);
      const profile = this.db.prepare('SELECT * FROM profiles WHERE id=?').get(profileId) as any;
      if (!profile || Number(profile.active_for_reporting ?? 1) !== 1) return;
      const ownName = profileDisplayName(profile, sourceProfileName || 'Profile / group');
      const ownSourceId = profile.id || sourceProfileId || null;
      const ownSourceName = ownName || sourceProfileName || '';
      const cardSourceId = forceSource || showHeading ? ownSourceId : (sourceProfileId || ownSourceId);
      const cardSourceName = forceSource || showHeading ? ownSourceName : (sourceProfileName || ownSourceName);
      if (showHeading) insertHeading(ownSourceName, fallbackPriority || profile.report_order || profile.priority || 0, 'PROFILE', ownSourceId, ownSourceName);
      // Profile interpretation is rendered as rich PDF content by ReportService when Report Settings allow it.
      const profileItems = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
      if (profileItems.length) {
        for (const pi of profileItems) {
          const type = String(pi.item_type || 'TEST').toUpperCase();
          if (type === 'HEADER') { insertHeading(pi.side_header || pi.header_text || '', pi.priority, 'INNER', cardSourceId, cardSourceName); continue; }
          if (type === 'PROFILE') {
            const childShow = pi.display_profile_name !== 0;
            expandProfile(+pi.child_profile_id, childShow, nextSeen, pi.priority, cardSourceId, cardSourceName, childShow);
          } else insertTest(+pi.test_id, pi.priority, cardSourceId, cardSourceName);
        }
      } else {
        const rows = this.db.prepare('SELECT pt.*,t.*,d.name department_name,u.name unit_name FROM profile_tests pt JOIN tests t ON t.id=pt.test_id LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN units u ON u.id=t.unit_id WHERE pt.profile_id=? AND COALESCE(t.active_for_reporting,1)=1 ORDER BY pt.priority,t.report_order,t.priority').all(profileId) as any[];
        rows.forEach(r => insertTest(+r.test_id, r.report_order || r.priority, cardSourceId, cardSourceName));
      }
    };
    for (const item of items) {
      const type = String(item.item_type || 'TEST').toUpperCase();
      if (type === 'TEST') insertTest(+item.item_id, item.priority);
      else if (type === 'PROFILE') expandProfile(+item.item_id, true, new Set<number>(), item.priority, item.item_id, item.name, true);
    }
    // Final cleanup: no heading/card without actual child rows.
    this.db.prepare(`DELETE FROM report_items
      WHERE report_id=? AND test_id IS NULL AND TRIM(COALESCE(source_profile_name,''))<>''
      AND NOT EXISTS (SELECT 1 FROM report_items child WHERE child.report_id=report_items.report_id AND child.test_id IS NOT NULL AND child.source_profile_name=report_items.source_profile_name AND COALESCE(child.source_profile_id,0)=COALESCE(report_items.source_profile_id,0))`).run(reportId);
  }

  getBill(id:number) { const bill=this.db.prepare('SELECT b.*,p.*,b.id id,p.id patient_id,p.created_at patient_registered_at,c.name consultant_name FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id WHERE b.id=?').get(id) as any; if(!bill) return null; return {...bill, items:this.db.prepare('SELECT * FROM bill_items WHERE bill_id=? ORDER BY priority,name').all(id), receipts:this.db.prepare('SELECT * FROM receipts WHERE bill_id=? ORDER BY id').all(id)}; }
  listBills(filters:any={}) {
    this.ensureBillingSchema();
    const from = filters.from || '1900-01-01';
    const to = filters.to || '2999-12-31';
    const q = `%${filters.q || ''}%`;
    const list = (value:any) => Array.isArray(value) ? value.map(v => String(v)).filter(Boolean) : (value && value !== 'ALL' ? [String(value)] : []);
    const statusList = list(filters.status_list || filters.status);
    const consultantIds = list(filters.consultant_ids || filters.consultant_id);
    const paymentModes = list(filters.payment_modes || filters.payment_mode);
    const paymentStatuses = list(filters.payment_statuses || filters.payment_status);
    const paymentStatusExpr = `CASE WHEN b.status='CANCELLED' THEN 'CANCELLED' WHEN COALESCE(b.paid,0)<=0 THEN 'PENDING' WHEN COALESCE(b.paid,0)>COALESCE(b.total,0) THEN 'OVERPAID' WHEN COALESCE(b.paid,0)>=COALESCE(b.total,0) THEN 'PAID' ELSE 'PARTIAL' END`;
    const whereParts = [`date(b.bill_date) BETWEEN date(?) AND date(?)`, `(p.name LIKE ? OR b.bill_no LIKE ? OR p.mobile LIKE ?)`];
    const params:any[] = [from, to, q, q, q];
    if (statusList.length) { whereParts.push(`b.status IN (${statusList.map(() => '?').join(',')})`); params.push(...statusList); }
    if (consultantIds.length) {
      const realIds = consultantIds.filter(v => v !== 'NONE');
      const consultantParts:string[] = [];
      if (consultantIds.includes('NONE')) consultantParts.push('b.consultant_id IS NULL');
      if (realIds.length) { consultantParts.push(`b.consultant_id IN (${realIds.map(() => '?').join(',')})`); params.push(...realIds.map(v => Number(v))); }
      whereParts.push(`(${consultantParts.join(' OR ')})`);
    }
    if (paymentModes.length) { whereParts.push(`b.payment_mode IN (${paymentModes.map(() => '?').join(',')})`); params.push(...paymentModes); }
    if (paymentStatuses.length) { whereParts.push(`${paymentStatusExpr} IN (${paymentStatuses.map(() => '?').join(',')})`); params.push(...paymentStatuses); }
    const sql = `SELECT b.*,p.patient_no,p.title patient_title,p.name patient_name,p.age,p.age_value,p.age_unit,p.gender,p.mobile,c.name consultant_name,
      ${paymentStatusExpr} payment_status,
      MAX(COALESCE(b.paid,0)-COALESCE(b.total,0),0) excess_paid
      FROM bills b JOIN patients p ON p.id=b.patient_id LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE ${whereParts.join(' AND ')} ORDER BY b.id DESC LIMIT 1000`;
    return this.db.prepare(sql).all(...params);
  }
  analytics(filters:any={}) {
    this.ensureBillingSchema();
    const from = String(filters.from || '1900-01-01');
    const to = String(filters.to || '2999-12-31');
    const bills = this.db.prepare(`SELECT b.*, p.patient_no, p.name patient_name, p.created_at patient_registered_at,
      c.name consultant_name
      FROM bills b
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE date(b.bill_date) BETWEEN date(?) AND date(?)
      ORDER BY b.bill_date DESC, b.id DESC`).all(from, to) as any[];
    const items = this.db.prepare(`SELECT bi.*, b.bill_no, b.bill_date, b.patient_id, p.name patient_name,
      COALESCE(c.name,'Walk-in / Direct') consultant_name
      FROM bill_items bi
      JOIN bills b ON b.id=bi.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      WHERE date(b.bill_date) BETWEEN date(?) AND date(?) AND b.status<>'CANCELLED'
      ORDER BY b.bill_date DESC, bi.id DESC`).all(from, to) as any[];
    let refunds:any[] = [];
    try {
      refunds = this.db.prepare(`SELECT r.*, b.bill_no, p.name patient_name
        FROM refunds r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id
        WHERE date(r.refunded_at) BETWEEN date(?) AND date(?) ORDER BY r.refunded_at DESC`).all(from, to) as any[];
    } catch {}
    let reports:any[] = [];
    try {
      reports = this.db.prepare(`SELECT r.id, r.status, r.created_at, r.updated_at, r.approved_at,
          b.bill_no, b.bill_date, p.patient_no, p.name patient_name,
          COALESCE(c.name,'Walk-in / Direct') consultant_name,
          COUNT(ri.id) item_count,
          SUM(CASE WHEN UPPER(COALESCE(ri.result_status,'PENDING')) IN ('APPROVED','FINALIZED') THEN 1 ELSE 0 END) finished_item_count,
          SUM(CASE WHEN UPPER(COALESCE(ri.result_status,'PENDING')) NOT IN ('APPROVED','FINALIZED','CANCELLED') THEN 1 ELSE 0 END) pending_item_count
        FROM reports r
        JOIN bills b ON b.id=r.bill_id
        JOIN patients p ON p.id=b.patient_id
        LEFT JOIN consultants c ON c.id=b.consultant_id
        LEFT JOIN report_items ri ON ri.report_id=r.id AND ri.test_id IS NOT NULL AND COALESCE(ri.selected_for_reporting,1)=1
        WHERE date(b.bill_date) BETWEEN date(?) AND date(?)
          AND COALESCE(r.report_scope,'COLLECTION')<>'STAGING'
          AND UPPER(COALESCE(r.status,'')) NOT IN ('CANCELLED','APPROVED_CANCELLED','COLLECTION_STAGING')
        GROUP BY r.id
        HAVING COUNT(ri.id)>0
        ORDER BY b.bill_date DESC, r.id DESC`).all(from, to) as any[];
      reports = reports.map((r:any) => {
        const raw = String(r.status || '').toUpperCase();
        const pendingItems = Number(r.pending_item_count || 0);
        const finishedItems = Number(r.finished_item_count || 0);
        const total = Number(r.item_count || 0);
        const queue_status = raw === 'APPROVED' || (total > 0 && pendingItems === 0 && finishedItems === total) ? 'FINISHED' : 'PENDING';
        return { ...r, queue_status };
      });
    } catch {}
    return { bills, items, refunds, reports };
  }

  cancelBill(billId:number, payload:any={}) {
    this.ensureBillingSchema();
    this.ensureCollectionSchema();
    this.ensureOperationsSchema();
    const bill = this.db.prepare('SELECT * FROM bills WHERE id=?').get(billId) as any;
    if (!bill) throw new Error('Bill not found.');
    if (bill.status === 'CANCELLED') return this.getBill(billId);
    const paid = +bill.paid || 0;
    const refundAmount = +payload.refund_amount || 0;
    const refundMode = String(payload.refund_mode || 'Cash');
    const reason = String(payload.reason || 'Bill cancelled').trim() || 'Bill cancelled';
    const cancelledAt = this.nowIst();
    if (paid > 0 && refundAmount <= 0) throw new Error('Refund is mandatory because payment has already been collected.');
    if (refundAmount > paid) throw new Error('Refund amount cannot be greater than paid amount.');
    const tx = this.db.transaction(() => {
      if (refundAmount > 0) this.db.prepare('INSERT INTO refunds(bill_id,amount,mode,reason,refunded_at) VALUES(?,?,?,?,?)').run(billId, refundAmount, refundMode, reason, cancelledAt);

      const activeCollections = (this.db.prepare("SELECT COUNT(*) c FROM specimen_collections WHERE bill_id=? AND COALESCE(status,'') <> 'CANCELLED'").get(billId) as any)?.c || 0;
      const activeReportItems = (this.db.prepare(`SELECT COUNT(*) c FROM reports r JOIN report_items ri ON ri.report_id=r.id
        WHERE r.bill_id=? AND ri.test_id IS NOT NULL AND COALESCE(ri.collection_status,'PENDING') <> 'CANCELLED'`).get(billId) as any)?.c || 0;

      this.db.prepare("UPDATE bills SET status='CANCELLED', cancelled_at=?, cancel_reason=?, refund_amount=?, refund_mode=?, due=0 WHERE id=?").run(cancelledAt, reason, refundAmount, refundMode, billId);

      // Unpaid commission → CANCELLED; paid commission → REVERSAL_PENDING (no silent wipe)
      const unpaid = this.db.prepare(`UPDATE bill_items SET commission_status='CANCELLED'
        WHERE bill_id=? AND COALESCE(commission_amount,0)>0
          AND UPPER(COALESCE(commission_status,'GENERATED')) IN ('GENERATED','APPROVED','HELD')`).run(billId);
      const paid = this.db.prepare(`UPDATE bill_items SET commission_status='REVERSAL_PENDING'
        WHERE bill_id=? AND COALESCE(commission_amount,0)>0
          AND UPPER(COALESCE(commission_status,''))='PAID'`).run(billId);
      this.audit('commission.bill.cancel', JSON.stringify({
        billId,
        billNo: bill.bill_no,
        unpaidCancelled: unpaid.changes || 0,
        paidReversalPending: paid.changes || 0
      }));

      this.db.prepare(`UPDATE reports SET status=CASE WHEN COALESCE(status,'')='APPROVED' THEN 'APPROVED_CANCELLED' ELSE 'CANCELLED' END, remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=? WHERE bill_id=?`)
        .run('Cancelled due to bill cancellation: ' + reason, cancelledAt, billId);

      this.db.prepare(`UPDATE report_items SET collection_status='CANCELLED', sample_remarks=TRIM(COALESCE(sample_remarks,'') || CASE WHEN COALESCE(sample_remarks,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE report_id IN (SELECT id FROM reports WHERE bill_id=?) AND test_id IS NOT NULL`)
        .run('Bill cancelled: ' + reason, billId);

      this.db.prepare(`UPDATE specimen_collections SET status='CANCELLED', remarks=TRIM(COALESCE(remarks,'') || CASE WHEN COALESCE(remarks,'')<>'' THEN ' | ' ELSE '' END || ?), updated_at=?
        WHERE bill_id=? AND COALESCE(status,'') <> 'CANCELLED'`)
        .run('Cancelled due to bill cancellation: ' + reason, cancelledAt, billId);

      this.db.prepare(`UPDATE outsource_cases SET status='CANCELLED', notes=TRIM(COALESCE(notes,'') || CASE WHEN COALESCE(notes,'')<>'' THEN ' | ' ELSE '' END || ?)
        WHERE bill_id=? AND COALESCE(status,'') NOT IN ('RECEIVED','CANCELLED')`)
        .run('Cancelled due to bill cancellation: ' + reason, billId);

      this.audit('bill.cancel', `${bill.bill_no} refund ${refundAmount}; collections cancelled ${activeCollections}; report items cancelled ${activeReportItems}; reason: ${reason}`);
      this.audit('collection.bill.cancel', `${bill.bill_no}: active collections ${activeCollections}, active tests ${activeReportItems}`);
      const cancelledReports = this.db.prepare('SELECT id,status FROM reports WHERE bill_id=?').all(billId) as any[];
      cancelledReports.forEach((rr:any) => this.audit('report.bill.cancel', `${rr.id}:${String(rr.status||'CANCELLED')}:${reason}`));
      return billId;
    });
    return this.getBill(tx());
  }

  deleteBill(billId:number) {
    this.ensureBillingSchema();
    if (!billId) throw new Error('Bill id is required.');
    this.assertBillEditableForClinicalWorkflow(billId);
    const tx = this.db.transaction(() => {
      const bill = this.db.prepare('SELECT bill_no FROM bills WHERE id=?').get(billId) as any;
      if (!bill) throw new Error('Bill not found.');
      if (this.isQuickReportingEnabled()) {
        // Quick mode delete is allowed only when every billed item is still pending in Quick Reporting.
        // Remove only quick-report rows for this bill plus the bill itself.
        const quickIds = (this.db.prepare('SELECT id FROM quick_reports WHERE bill_id=?').all(billId) as any[]).map((x:any)=>+x.id).filter(Boolean);
        for (const id of quickIds) this.db.prepare('DELETE FROM quick_report_items WHERE quick_report_id=?').run(id);
        this.db.prepare('DELETE FROM quick_reports WHERE bill_id=?').run(billId);
        // Cleanup stale normal workflow rows for this bill only if older quick-mode builds created them.
        const staleReportIds = (this.db.prepare("SELECT id FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION') IN ('STAGING','COLLECTION')").all(billId) as any[]).map((x:any)=>+x.id).filter(Boolean);
        for (const id of staleReportIds) this.db.prepare('DELETE FROM report_items WHERE report_id=?').run(id);
        this.db.prepare("DELETE FROM reports WHERE bill_id=? AND COALESCE(report_scope,'COLLECTION') IN ('STAGING','COLLECTION')").run(billId);
      } else {
        // Fully-pending normal workflow bill delete removes normal report pending rows too.
        const reportIds = (this.db.prepare('SELECT id FROM reports WHERE bill_id=?').all(billId) as any[]).map((x:any)=>+x.id).filter(Boolean);
        for (const id of reportIds) this.db.prepare('DELETE FROM report_items WHERE report_id=?').run(id);
        this.db.prepare('DELETE FROM reports WHERE bill_id=?').run(billId);
      }
      this.db.prepare('DELETE FROM bill_items WHERE bill_id=?').run(billId);
      this.db.prepare('DELETE FROM receipts WHERE bill_id=?').run(billId);
      this.db.prepare('DELETE FROM bills WHERE id=?').run(billId);
      this.audit('bill.delete', bill.bill_no || String(billId));
      return { deleted:true, id:billId };
    });
    return tx();
  }


  addReceipt(billId:number, amount:number, mode:string) {
    const tx = this.db.transaction(() => {
      const bill = this.db.prepare('SELECT total,paid,due,status FROM bills WHERE id=?').get(billId) as any;
      if (!bill) throw new Error('Bill not found.');
      if (bill.status === 'CANCELLED') throw new Error('Cannot collect payment for a cancelled bill.');
      const remaining = Math.max(0, (+bill.total || 0) - (+bill.paid || 0));
      const receiptAmount = Math.min(Math.max(0, +amount || 0), remaining);
      if (receiptAmount <= 0) throw new Error('No due amount available for receipt.');
      const receiptNo=this.nextConfiguredNo('receipt','receipts','receipt_no');
      this.db.prepare('INSERT INTO receipts(receipt_no,bill_id,amount,payment_mode,received_at) VALUES(?,?,?,?,?)').run(receiptNo,billId,receiptAmount,mode || 'Cash', this.nowIst());
      this.recalculateBillPayment(billId);
      this.audit('receipt.add', `${receiptNo} / Bill ${billId}`);
      return receiptNo;
    });
    return tx();
  }

  deleteReceipt(billId:number, receiptId:number) {
    const receipt = this.db.prepare('SELECT * FROM receipts WHERE id=? AND bill_id=?').get(receiptId, billId) as any;
    if (!receipt) throw new Error('Receipt not found for this bill.');
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM receipts WHERE id=? AND bill_id=?').run(receiptId, billId);
      this.recalculateBillPayment(billId);
      this.audit('receipt.delete', `${receipt.receipt_no} / Bill ${billId}`);
      return billId;
    });
    return this.getBill(tx());
  }

  protected recalculateBillPayment(billId:number) {
    const paid = (this.db.prepare('SELECT COALESCE(SUM(amount),0) paid FROM receipts WHERE bill_id=?').get(billId) as any).paid || 0;
    const bill = this.db.prepare('SELECT total FROM bills WHERE id=?').get(billId) as any;
    const total = +bill?.total || 0;
    this.db.prepare('UPDATE bills SET paid=?,due=MAX(total-?,0) WHERE id=?').run(paid, paid, billId);
  }

  protected reportReadyCollectionStatusesSql(alias='ri') {
    return `(COALESCE(${alias}.collection_status,'PENDING')='COLLECTED' OR (COALESCE(${alias}.collection_mode,'')='OUTSOURCE' AND COALESCE(${alias}.collection_status,'PENDING')='OUTSOURCE_RESULT_RECEIVED'))`;
  }

  protected markBillReportQuickPending(billId:number) {
    // Quick Reporting is isolated in quick_reports / quick_report_items.
    // Do not modify normal Lab Workflow reports/report_items here.
    return;
  }

  protected refreshReportMetadataFromMaster(reportId:number) {
    const patient = (this.db.prepare(`SELECT p.* FROM reports r JOIN bills b ON b.id=r.bill_id JOIN patients p ON p.id=b.patient_id WHERE r.id=?`).get(reportId) as any) || {};
    const rows = this.db.prepare(`SELECT ri.id,ri.test_id,t.display_name,t.name,t.report_order,t.priority test_priority,t.highlight_parameter,
        d.name department_name,u.name unit_name,t.normal_range,t.method,t.active_for_reporting
      FROM report_items ri LEFT JOIN tests t ON t.id=ri.test_id LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN units u ON u.id=t.unit_id
      WHERE ri.report_id=? AND ri.test_id IS NOT NULL`).all(reportId) as any[];
    const upd = this.db.prepare(`UPDATE report_items SET test_name=?,department_name=?,unit=?,normal_range=?,method=?,highlight_parameter=?,selected_for_reporting=?,priority=COALESCE(report_order_override,?) WHERE id=?`);
    for (const r of rows) {
      if (!r.test_id) continue;
      if (Number(r.active_for_reporting ?? 1) !== 1) {
        this.db.prepare('UPDATE report_items SET selected_for_reporting=0 WHERE id=?').run(r.id);
        continue;
      }
      const order = +(r.report_order || r.test_priority || 0);
      const refText = this.selectedReferenceTextForItem({ test_id: r.test_id, normal_range: r.normal_range || '' }, patient) || r.normal_range || '';
      upd.run(r.display_name || r.name || 'Test', r.department_name || '', r.unit_name || '', refText, r.method || '', r.highlight_parameter ? 1 : 0, 1, order, r.id);
    }
  }

  protected ensureReportReady(reportId:number) {
    const r = this.db.prepare('SELECT id,bill_id,status,report_scope FROM reports WHERE id=?').get(reportId) as any;
    if (!r?.id) return;
    const stat = String(r.status || 'DRAFT').toUpperCase();
    const row = this.db.prepare(`SELECT
        COUNT(*) c,
        SUM(CASE WHEN test_id IS NOT NULL AND TRIM(COALESCE(result_value,'')) <> '' THEN 1 ELSE 0 END) entered
      FROM report_items WHERE report_id=?`).get(reportId) as any;
    const count = +(row?.c || 0);
    const entered = +(row?.entered || 0);
    // Pending/untyped reports must always reflect the latest billed profile tree.
    // This also repairs old drafts where multiple billed profiles were collapsed under an inner heading
    // like Proteins/Liver Function. Once values are entered/approved, preserve the report rows.
    const scope = String((r as any).report_scope || '').toUpperCase();

    // COLLECTION reports represent already-collected workflow rows. RECHECK reports are
    // child reports created from selected report items only. Neither should ever rebuild
    // the hidden STAGING collection report from the full bill, because that can re-create
    // all billed/profile tests as Pending Collection.
    if (scope === 'COLLECTION' || scope === 'RECHECK') {
      this.refreshReportMetadataFromMaster(reportId);
      return;
    }

    if (!count || ((stat === 'DRAFT' || stat === 'PENDING' || stat === 'COLLECTION_STAGING') && entered === 0)) this.rebuildReportFromBill(+r.bill_id, 'STAGING');
    this.refreshReportMetadataFromMaster(reportId);
  }


}
