import Database from 'better-sqlite3';

export type QuickBarcodeItem = any;

export class QuickReportingBarcodeService {
  constructor(private db: Database.Database, private now: () => string) {}

  ensureSchema() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS quick_reporting_barcode_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id INTEGER NOT NULL,
  bill_item_id INTEGER NOT NULL DEFAULT 0,
  item_key TEXT NOT NULL,
  test_id INTEGER,
  specimen_type_id INTEGER NOT NULL DEFAULT 0,
  specimen_name TEXT,
  sample_id TEXT,
  barcode TEXT,
  collection_type TEXT,
  collect_timing TEXT NOT NULL DEFAULT 'NOW',
  expected_collect_at TEXT,
  collection_date TEXT,
  collection_time TEXT,
  collection_datetime TEXT,
  barcode_generated INTEGER NOT NULL DEFAULT 0,
  barcode_generated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  UNIQUE(bill_id,item_key)
);
CREATE INDEX IF NOT EXISTS idx_quick_barcode_bill ON quick_reporting_barcode_items(bill_id,barcode_generated);
CREATE INDEX IF NOT EXISTS idx_quick_barcode_sample ON quick_reporting_barcode_items(bill_id,specimen_type_id,sample_id);
CREATE INDEX IF NOT EXISTS idx_quick_barcode_sample_test ON quick_reporting_barcode_items(sample_id,test_id);
`);
    const ensureColumn = (name:string, type:string) => {
      const cols = this.db.prepare('PRAGMA table_info(quick_reporting_barcode_items)').all() as any[];
      if (!cols.some(c => c.name === name)) this.db.exec(`ALTER TABLE quick_reporting_barcode_items ADD COLUMN ${name} ${type}`);
    };
    ensureColumn('result_value', 'TEXT');
    ensureColumn('raw_result_value', 'TEXT');
    ensureColumn('transformed_result_value', 'TEXT');
    ensureColumn('result_updated_at', 'TEXT');
    ensureColumn('result_updated_date', 'TEXT');
    ensureColumn('result_updated_time', 'TEXT');
    ensureColumn('result_source', 'TEXT');
    ensureColumn('result_equipment_id', 'INTEGER');
    ensureColumn('result_analyzer_code', 'TEXT');
  }

  repairBlankReleasedRows(billId?: number) {
    this.ensureSchema();
    try {
      const whereBill = billId ? 'AND bill_id=?' : '';
      const sql = `DELETE FROM quick_reporting_barcode_items
        WHERE COALESCE(barcode_generated,0)=0
          AND TRIM(COALESCE(sample_id,''))=''
          AND TRIM(COALESCE(barcode,''))=''
          AND TRIM(COALESCE(collection_date,''))=''
          AND TRIM(COALESCE(collection_time,''))=''
          AND TRIM(COALESCE(collection_datetime,''))=''
          ${whereBill}`;
      if (billId) this.db.prepare(sql).run(billId);
      else this.db.prepare(sql).run();
    } catch (err:any) {
      console.error('[quick-barcode-repair-blank-released-rows]', err?.message || err);
    }
  }

  decorateItems(items: QuickBarcodeItem[]) {
    this.ensureSchema();
    const byKey = new Map<string, any>();
    const billIds = Array.from(new Set((items || []).map(x => +x?.bill_id || 0).filter(Boolean)));
    for (const billId of billIds) this.repairBlankReleasedRows(billId);
    for (const billId of billIds) {
      const rows = this.db.prepare('SELECT * FROM quick_reporting_barcode_items WHERE bill_id=?').all(billId) as any[];
      for (const row of rows) byKey.set(`${row.bill_id}|${row.item_key}`, row);
    }
    for (const item of items || []) {
      if (!item?.test_id) continue;
      const master = this.resolveTestMaster(+item.test_id);
      const saved = byKey.get(`${+item.bill_id || 0}|${String(item.item_key || '')}`);
      const specimen = saved?.specimen_type_id ? { id:+saved.specimen_type_id, name:saved.specimen_name || '' } : this.defaultSpecimen(master.specimens);
      item.specimen_options = master.specimens;
      item.specimen_type_id = saved?.specimen_type_id ?? item.specimen_type_id ?? specimen.id ?? 0;
      item.specimen_name = saved?.specimen_name ?? item.specimen_name ?? specimen.name ?? '';
      item.sample_id = saved?.sample_id || item.sample_id || '';
      item.specimen_id = saved?.sample_id || item.specimen_id || item.sample_id || '';
      item.barcode = saved?.barcode || saved?.sample_id || item.barcode || item.sample_id || '';
      item.collection_rule = item.collection_rule || master?.test?.collection_rule || 'NORMAL';
      item.collection_type_preconfigured = this.isConfiguredCollectionRule(master?.test);
      item.sample_type = saved?.collection_type || item.collection_type || item.sample_type || this.collectionTypeFromRule(master.test);
      item.collection_type = saved?.collection_type || item.collection_type || item.sample_type || 'Random';
      item.collect_timing = saved?.collect_timing || item.collect_timing || this.collectTimingFromRule(master.test);
      item.expected_collect_at = saved?.expected_collect_at || item.expected_collect_at || '';
      item.collection_date = saved?.collection_date || item.collection_date || '';
      item.collection_time = saved?.collection_time || item.collection_time || '';
      item.collection_datetime = saved?.collection_datetime || item.collection_datetime || '';
      item.barcode_generated = saved?.barcode_generated ? 1 : (item.barcode_generated ? 1 : 0);
      item.barcode_generated_at = saved?.barcode_generated_at || item.barcode_generated_at || '';
      // Analyzer API seeds empty results only. Never overwrite a typed/saved value
      // (edit finished / manual correction must win over instrument store).
      const existingResult = item.result_value;
      const hasExistingResult = existingResult !== undefined && existingResult !== null && String(existingResult).trim() !== '';
      const analyzerResult = saved?.result_value;
      const hasAnalyzerResult = analyzerResult !== undefined && analyzerResult !== null && String(analyzerResult).trim() !== '';
      if (!hasExistingResult && hasAnalyzerResult) {
        item.result_value = analyzerResult;
        if (!item.final_result_source || String(item.final_result_source).toUpperCase() === 'MANUAL') {
          item.final_result_source = 'ANALYZER';
        }
      } else if (!hasExistingResult) {
        item.result_value = existingResult ?? '';
      }
      item.raw_result_value = item.raw_result_value || saved?.raw_result_value || '';
      item.transformed_result_value = item.transformed_result_value || saved?.transformed_result_value || '';
      item.result_updated_at = item.result_updated_at || saved?.result_updated_at || '';
      item.result_updated_date = item.result_updated_date || saved?.result_updated_date || '';
      item.result_updated_time = item.result_updated_time || saved?.result_updated_time || '';
      item.result_source = item.result_source || saved?.result_source || '';
      item.result_equipment_id = item.result_equipment_id || saved?.result_equipment_id || '';
      item.result_analyzer_code = item.result_analyzer_code || saved?.result_analyzer_code || '';
    }
    return items;
  }

  buildState(billId: number, items: QuickBarcodeItem[]) {
    this.ensureSchema();
    const active = this.decorateItems((items || []).filter(x => x?.test_id)).filter(x => x?.test_id);
    const specimens = this.groupSpecimens(active, true);
    const generated = this.generatedCollectionGroups(active);
    const total = active.length;
    const generatedCount = active.filter(x => this.hasBarcode(x)).length;
    return {
      bill_id: billId,
      total,
      generated_count: generatedCount,
      pending_count: Math.max(0, total - generatedCount),
      status: total > 0 && generatedCount >= total ? 'GENERATED' : generatedCount > 0 ? 'PARTIAL' : 'PENDING',
      specimens,
      flat_items: active.map(x => this.slimItem(x)),
      generated_collections: generated
    };
  }

  generate(billId: number, items: QuickBarcodeItem[], payload: any) {
    this.ensureSchema();
    const active = this.decorateItems((items || []).filter(x => x?.test_id)).filter(x => x?.test_id);
    if (!active.length) throw new Error('No active quick reporting items found.');
    if (active.every(x => this.hasBarcode(x))) throw new Error('Barcode already generated for all samples in this bill. Please use Reset Barcode if you want to regenerate.');

    const payloadKeys = Array.isArray(payload?.item_keys) ? payload.item_keys.map((x:any)=>String(x || '').trim()).filter(Boolean) : [];
    const pending = active.filter(x => !this.hasBarcode(x));
    const selectedKeySet = new Set(payloadKeys.length ? payloadKeys : pending.map(x => String(x.item_key || '')));
    if (!selectedKeySet.size) throw new Error('Select at least one pending item.');
    const selectedItems = pending.filter(x => selectedKeySet.has(String(x.item_key || '')));
    if (!selectedItems.length) throw new Error('No pending items found for barcode generation.');

    const specimenMap = new Map<string, any>();
    for (const row of Array.isArray(payload?.item_specimens) ? payload.item_specimens : []) {
      const itemKey = String(row?.item_key || '').trim();
      if (!itemKey) continue;
      specimenMap.set(itemKey, row);
    }
    const itemEventMap = new Map<string, any>();
    for (const row of Array.isArray(payload?.item_collection_events) ? payload.item_collection_events : []) {
      const itemKey = String(row?.item_key || '').trim();
      if (!itemKey) continue;
      itemEventMap.set(itemKey, row);
    }
    const selectedWithSpecimen = selectedItems.map((item:any) => {
      const itemKey = String(item.item_key || '').trim();
      const candidates = this.specimenCandidates(item);
      const requested = specimenMap.get(itemKey);
      let picked:any = null;
      if (requested) {
        const reqKey = String(requested.specimen_key || '').trim();
        picked = candidates.find((sp:any)=>this.specimenKeyFrom(sp.id, sp.name) === reqKey) || null;
        if (!picked && (+requested.specimen_type_id || 0)) picked = candidates.find((sp:any)=>(+sp.id || 0) === (+requested.specimen_type_id || 0)) || null;
        if (!picked && String(requested.specimen_name || '').trim()) picked = candidates.find((sp:any)=>String(sp.name || '').trim().toUpperCase() === String(requested.specimen_name || '').trim().toUpperCase()) || null;
      }
      if (!picked && candidates.length === 1) picked = candidates[0];
      if (!picked) throw new Error(`${item.test_name || 'Selected test'} has multiple specimens. Select exactly one specimen for this item.`);
      return { item, specimen:picked, specimenKey:this.specimenKeyFrom(+picked.id || 0, picked.name || 'Specimen') };
    });

    const configuredItems = selectedWithSpecimen
      .map((x:any)=>({ item:x.item, key:this.collectionOnlyKeyIfConfigured(x.item), label:this.collectionOnlyLabel(x.item) }))
      .filter((x:any)=>!!x.key);
    const collectionKeys = Array.from(new Set(configuredItems.map((x:any)=>x.key)));
    if (collectionKeys.length > 1) {
      const lines = configuredItems.map((x:any)=>`${x.item?.test_name || 'Selected test'} = ${x.label}`);
      throw new Error('Selected items contain different predefined collection types. Deselect one of the conflicting items before generating barcode.\n' + lines.join('\n'));
    }

    const collectionDate = String(payload?.collection_date || this.today()).trim();
    const collectionTime = String(payload?.collection_time || this.timeNow()).trim();
    const requestedCollectionType = String(payload?.collection_type || selectedItems[0]?.collection_type || selectedItems[0]?.sample_type || 'Random').trim() || 'Random';
    const now = this.now();
    const upsert = this.db.prepare(`INSERT INTO quick_reporting_barcode_items(
      bill_id,bill_item_id,item_key,test_id,specimen_type_id,specimen_name,sample_id,barcode,collection_type,collect_timing,expected_collect_at,collection_date,collection_time,collection_datetime,barcode_generated,barcode_generated_at,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(bill_id,item_key) DO UPDATE SET
      specimen_type_id=excluded.specimen_type_id,specimen_name=excluded.specimen_name,sample_id=excluded.sample_id,barcode=excluded.barcode,collection_type=excluded.collection_type,
      collect_timing=excluded.collect_timing,expected_collect_at=excluded.expected_collect_at,collection_date=excluded.collection_date,collection_time=excluded.collection_time,
      collection_datetime=excluded.collection_datetime,barcode_generated=1,barcode_generated_at=excluded.barcode_generated_at,updated_at=excluded.updated_at`);
    const sampleIds:string[] = [];
    const tx = this.db.transaction(() => {
      const groups = new Map<string, any[]>();
      for (const row of selectedWithSpecimen) {
        const itemKey = String(row.item?.item_key || '').trim();
        const event = itemEventMap.get(itemKey) || {};
        const effectiveCollectionType = this.effectiveCollectionType(row.item, requestedCollectionType);
        const effectiveCollectTiming = this.effectiveCollectTiming(row.item);
        const effectiveExpectedAt = String(row.item?.expected_collect_at || '').trim();
        const effectiveCollectionDate = String(event.collection_date || collectionDate || this.today()).trim();
        const effectiveCollectionTime = String(event.collection_time || collectionTime || this.timeNow()).trim();
        const effectiveCollectionDateTime = this.combineDateTime(effectiveCollectionDate, effectiveCollectionTime);
        const groupKey = this.generatedSampleGroupKey(row.specimenKey, effectiveCollectionType, effectiveCollectTiming, effectiveExpectedAt, effectiveCollectionDate, effectiveCollectionTime);
        const enriched = { ...row, effectiveCollectionType, effectiveCollectTiming, effectiveExpectedAt, effectiveCollectionDate, effectiveCollectionTime, effectiveCollectionDateTime, groupKey };
        if (!groups.has(groupKey)) groups.set(groupKey, []);
        groups.get(groupKey)!.push(enriched);
      }

      const sampleSequenceByPrefix = new Map<string, number>();
      const nextSequenceForDate = (dateText:string) => {
        const prefix = this.sampleIdPrefix(dateText);
        if (!sampleSequenceByPrefix.has(prefix)) sampleSequenceByPrefix.set(prefix, this.maxSampleSequenceForPrefix(prefix));
        const next = (sampleSequenceByPrefix.get(prefix) || 0) + 1;
        sampleSequenceByPrefix.set(prefix, next);
        return { prefix, sequence: next };
      };

      for (const groupItems of groups.values()) {
        const picked = groupItems[0].specimen;
        const first = groupItems[0];
        let sampleId = this.findExistingCollectionSampleId(billId, +picked.id || 0, picked.name || 'Specimen', first.effectiveCollectionType, first.effectiveCollectTiming, first.effectiveExpectedAt, first.effectiveCollectionDate, first.effectiveCollectionTime);
        if (!sampleId) {
          const next = nextSequenceForDate(first.effectiveCollectionDate);
          sampleId = this.formatSampleId(next.prefix, next.sequence);
        }
        sampleIds.push(sampleId);
        for (const row of groupItems) {
          const item = row.item;
          const sp = row.specimen;
          upsert.run(billId, +item.bill_item_id || 0, String(item.item_key || ''), +item.test_id || null, +sp.id || 0, sp.name || 'Specimen', sampleId, sampleId, row.effectiveCollectionType, row.effectiveCollectTiming, row.effectiveExpectedAt, row.effectiveCollectionDate, row.effectiveCollectionTime, row.effectiveCollectionDateTime, 1, now, now);
        }
      }
    });
    tx();
    const uniqueSampleIds = Array.from(new Set(sampleIds));
    return { ok:true, sample_id: uniqueSampleIds.join(', '), sample_ids: uniqueSampleIds.join(', '), affected_count: selectedItems.length, collection_type: requestedCollectionType, state: this.buildState(billId, items) };
  }

  reset(billId:number, items:QuickBarcodeItem[], payload:any) {
    this.ensureSchema();
    const active = this.decorateItems((items || []).filter(x => x?.test_id)).filter(x => x?.test_id && this.hasBarcode(x));
    if (!active.length) throw new Error('No barcode generated to reset.');
    const groups = this.generatedCollectionGroups(active);
    const mode = String(payload?.mode || '').toUpperCase();
    const collectionKey = String(payload?.collection_key || '').trim();
    let targetKeys:string[] = [];
    if (mode === 'ALL') targetKeys = active.map(x => String(x.item_key || ''));
    else {
      if (groups.length > 1 && !collectionKey) throw new Error('Please select which collection to revert.');
      const group = collectionKey ? groups.find((g:any)=>g.key === collectionKey) : groups[0];
      if (!group) throw new Error('Selected collection was not found.');
      targetKeys = (group.items || []).map((x:any)=>String(x.item_key || ''));
    }
    const stmt = this.db.prepare(`DELETE FROM quick_reporting_barcode_items WHERE bill_id=? AND item_key=?`);
    const tx = this.db.transaction(() => { for (const key of targetKeys) stmt.run(billId, key); });
    tx();
    return { ok:true, affected_count: targetKeys.length, state: this.buildState(billId, items) };
  }

  private resolveTestMaster(testId:number) {
    const test = this.db.prepare('SELECT id,collection_rule,collection_gap_minutes,collection_dependency,same_specimen_allowed FROM tests WHERE id=?').get(testId) as any || {};
    const specimens = this.db.prepare(`SELECT st.id,st.name,st.code,COALESCE(tsm.is_default,0) is_default,COALESCE(tsm.display_order,1000) display_order
      FROM test_specimen_mappings tsm JOIN specimen_types st ON st.id=tsm.specimen_type_id
      WHERE tsm.test_id=? AND COALESCE(st.is_active,1)=1 ORDER BY COALESCE(tsm.is_default,0) DESC, COALESCE(tsm.display_order,1000), st.name`).all(testId) as any[];
    return { test, specimens };
  }
  private defaultSpecimen(specimens:any[]) { return (specimens || [])[0] || { id:0, name:'Specimen' }; }
  private collectionTypeFromRule(test:any) { const rule = String(test?.collection_rule || 'NORMAL').toUpperCase(); if (rule === 'FASTING') return 'Fasting'; if (rule === 'POST_PRANDIAL') return 'Post-prandial'; if (rule === 'TIMED_INTERVAL') return 'Timed'; return 'Random'; }
  private collectTimingFromRule(test:any) { const rule = String(test?.collection_rule || 'NORMAL').toUpperCase(); return (rule === 'POST_PRANDIAL' || rule === 'TIMED_INTERVAL') ? 'LATER' : 'NOW'; }
  private isConfiguredCollectionRule(test:any) { const rule = String(test?.collection_rule || '').trim().toUpperCase(); return !!rule && rule !== 'NORMAL' && rule !== 'RANDOM' && rule !== 'NONE'; }
  private itemHasConfiguredCollection(item:any) {
    if (item?.collection_type_preconfigured === true || item?.collection_type_preconfigured === 1) return true;
    const rule = String(item?.collection_rule || '').trim().toUpperCase();
    if (rule && rule !== 'NORMAL' && rule !== 'RANDOM' && rule !== 'NONE') return true;
    const timing = String(item?.collect_timing || '').trim().toUpperCase();
    if (timing && timing !== 'NOW') return true;
    if (String(item?.expected_collect_at || '').trim()) return true;
    return false;
  }
  private hasBarcode(x:any) { return !!String(x?.sample_id || x?.barcode || '').trim(); }
  private specimenKey(item:any) { const id = +item.specimen_type_id || 0; return id ? `ID:${id}` : `NAME:${String(item.specimen_name || 'Specimen').trim().toUpperCase()}`; }
  private collectionKey(item:any) { return [this.specimenKey(item), String(item.collection_type || item.sample_type || 'Random').trim().toUpperCase(), String(item.collect_timing || 'NOW').trim().toUpperCase(), String(item.expected_collect_at || '').trim(), String(item.collection_datetime || '').trim()].join('|'); }
  private collectionOnlyKey(item:any) { return [String(item.collection_type || item.sample_type || 'Random').trim().toUpperCase(), String(item.collect_timing || 'NOW').trim().toUpperCase(), String(item.expected_collect_at || '').trim(), String(item.collection_datetime || '').trim()].join('|'); }
  private collectionOnlyKeyIfConfigured(item:any) { return this.itemHasConfiguredCollection(item) ? this.collectionOnlyKey(item) : ''; }
  private collectionOnlyLabel(item:any) {
    const type = String(item.collection_type || item.sample_type || 'Random').trim() || 'Random';
    const timing = String(item.collect_timing || 'NOW').trim() || 'NOW';
    const expected = String(item.expected_collect_at || item.collection_datetime || '').trim();
    return [type, timing, expected].filter(Boolean).join(' · ');
  }
  private specimenCandidates(item:any) {
    const opts = Array.isArray(item?.specimen_options) && item.specimen_options.length ? item.specimen_options : [{ id:+item?.specimen_type_id || 0, name:item?.specimen_name || 'Specimen', code:item?.specimen_code || '' }];
    return opts.map((s:any) => ({ id:+s.id || +s.specimen_type_id || 0, name:String(s.name || s.specimen_name || item?.specimen_name || 'Specimen'), code:String(s.code || '') }));
  }
  private specimenKeyFrom(id:number, name:string) { return id ? `ID:${id}` : `NAME:${String(name || 'Specimen').trim().toUpperCase()}`; }
  private collectionKeyFor(item:any, specimenKey:string) { return [specimenKey, String(item.collection_type || item.sample_type || 'Random').trim().toUpperCase(), String(item.collect_timing || 'NOW').trim().toUpperCase(), String(item.expected_collect_at || '').trim(), String(item.collection_datetime || '').trim()].join('|'); }
  private effectiveCollectionType(item:any, requestedCollectionType:string) {
    if (this.itemHasConfiguredCollection(item)) return String(item?.collection_type || item?.sample_type || this.collectionTypeFromRule(item) || 'Random').trim() || 'Random';
    return String(requestedCollectionType || item?.collection_type || item?.sample_type || 'Random').trim() || 'Random';
  }
  private effectiveCollectTiming(item:any) { return String(item?.collect_timing || this.collectTimingFromRule(item) || 'NOW').trim() || 'NOW'; }
  private generatedSampleGroupKey(specimenKey:string, collectionType:string, collectTiming:string, expectedCollectAt:string, collectionDate:string, collectionTime:string) {
    return [specimenKey, String(collectionType || 'Random').trim().toUpperCase(), String(collectTiming || 'NOW').trim().toUpperCase(), String(expectedCollectAt || '').trim(), String(collectionDate || '').trim(), String(collectionTime || '').trim()].join('|');
  }
  private groupSpecimens(items:any[], includeGenerated:boolean) {
    const map = new Map<string, any>();
    for (const item of items) {
      if (!includeGenerated && this.hasBarcode(item)) continue;
      for (const sp of this.specimenCandidates(item)) {
        const key = this.specimenKeyFrom(sp.id, sp.name);
        if (!map.has(key)) map.set(key, { key, specimen_type_id:sp.id, specimen_name:sp.name || 'Specimen', generated:this.hasBarcode(item), item_count:0, items:[], collections:[] });
        const g = map.get(key); g.item_count += 1; g.items.push(this.slimItem(item));
      }
    }
    for (const g of map.values()) {
      const cMap = new Map<string, any>();
      for (const item of items) {
        if (!includeGenerated && this.hasBarcode(item)) continue;
        const candidates = this.specimenCandidates(item);
        if (!candidates.some((sp:any)=>this.specimenKeyFrom(sp.id, sp.name) === g.key)) continue;
        const key = this.collectionKeyFor(item, g.key);
        if (!cMap.has(key)) cMap.set(key, { key, specimen_key:g.key, collection_type:item.collection_type || item.sample_type || 'Random', collect_timing:item.collect_timing || 'NOW', expected_collect_at:item.expected_collect_at || '', collection_date:item.collection_date || '', collection_time:item.collection_time || '', collection_datetime:item.collection_datetime || '', sample_id:item.sample_id || '', item_count:0, items:[] });
        const c = cMap.get(key); c.item_count += 1; c.items.push(this.slimItem(item)); if (!c.sample_id && item.sample_id) c.sample_id = item.sample_id;
      }
      g.collections = Array.from(cMap.values());
    }
    return Array.from(map.values());
  }
  private generatedCollectionGroups(items:any[]) {
    const map = new Map<string, any>();
    for (const item of items) {
      if (!this.hasBarcode(item)) continue;
      const key = this.collectionKey(item);
      if (!map.has(key)) map.set(key, { key, specimen_type_id:+item.specimen_type_id || 0, specimen_name:item.specimen_name || 'Specimen', collection_type:item.collection_type || item.sample_type || 'Random', collect_timing:item.collect_timing || 'NOW', expected_collect_at:item.expected_collect_at || '', collection_date:item.collection_date || '', collection_time:item.collection_time || '', collection_datetime:item.collection_datetime || '', sample_id:item.sample_id || item.barcode || '', item_count:0, items:[] });
      const g = map.get(key); g.item_count += 1; g.items.push(this.slimItem(item));
    }
    return Array.from(map.values());
  }
  private slimItem(item:any) { return { id:item.id, bill_item_id:item.bill_item_id || 0, item_key:item.item_key, test_id:item.test_id, test_name:item.test_name, source_profile_id:item.source_profile_id || null, source_profile_name:item.source_profile_name || '', profile_id:item.source_profile_id || item.profile_id || null, profile_name:item.source_profile_name || item.profile_name || item.group_name || '', group_name:item.group_name || '', department_name:item.department_name || '', specimen_type_id:+item.specimen_type_id || 0, specimen_name:item.specimen_name || '', specimen_options:item.specimen_options || [], sample_id:item.sample_id || '', barcode:item.barcode || '', collection_type:item.collection_type || item.sample_type || 'Random', collect_timing:item.collect_timing || 'NOW', expected_collect_at:item.expected_collect_at || '', collection_rule:item.collection_rule || 'NORMAL', collection_type_preconfigured: item.collection_type_preconfigured ? 1 : 0 }; }
  private findExistingCollectionSampleId(billId:number, specimenTypeId:number, specimenName:string, collectionType:string, collectTiming:string, expectedCollectAt:string, collectionDate:string, collectionTime:string) {
    const type = String(collectionType || 'Random').trim().toUpperCase();
    const timing = String(collectTiming || 'NOW').trim().toUpperCase();
    const expected = String(expectedCollectAt || '').trim();
    const date = String(collectionDate || '').trim();
    const time = String(collectionTime || '').trim();
    const base = `bill_id=? AND COALESCE(barcode_generated,0)=1 AND TRIM(COALESCE(sample_id,''))<>'' AND UPPER(TRIM(COALESCE(collection_type,'')))=? AND UPPER(TRIM(COALESCE(collect_timing,'NOW')))=? AND TRIM(COALESCE(expected_collect_at,''))=? AND TRIM(COALESCE(collection_date,''))=? AND TRIM(COALESCE(collection_time,''))=?`;
    const row = specimenTypeId
      ? this.db.prepare(`SELECT sample_id FROM quick_reporting_barcode_items WHERE ${base} AND specimen_type_id=? ORDER BY id LIMIT 1`).get(billId, type, timing, expected, date, time, specimenTypeId) as any
      : this.db.prepare(`SELECT sample_id FROM quick_reporting_barcode_items WHERE ${base} AND UPPER(TRIM(COALESCE(specimen_name,'')))=UPPER(TRIM(?)) ORDER BY id LIMIT 1`).get(billId, type, timing, expected, date, time, specimenName || '') as any;
    return String(row?.sample_id || '').trim();
  }

  private sampleIdPrefix(dateText?:string) {
    const rawDate = String(dateText || this.today()).trim() || this.today();
    return rawDate.replace(/[^0-9]/g, '').slice(2, 8) || this.today().replace(/-/g,'').slice(2);
  }

  private maxSampleSequenceForPrefix(prefix:string) {
    const rows = this.db.prepare(`
      SELECT sample_id FROM quick_reporting_barcode_items
      WHERE COALESCE(barcode_generated,0)=1
        AND TRIM(COALESCE(sample_id,''))<>''
        AND sample_id LIKE ?
      UNION ALL
      SELECT qri.sample_id FROM quick_report_items qri
      JOIN quick_reports qr ON qr.id=qri.quick_report_id
      WHERE UPPER(COALESCE(qr.status,'FINISHED'))='FINISHED'
        AND COALESCE(qri.barcode_generated,0)=1
        AND TRIM(COALESCE(qri.sample_id,''))<>''
        AND qri.sample_id LIKE ?
    `).all(prefix + '%', prefix + '%') as any[];
    let maxNo = 0;
    for (const row of rows || []) {
      const sid = String(row?.sample_id || '').trim();
      if (!sid.startsWith(prefix)) continue;
      const n = Number(sid.slice(prefix.length));
      if (Number.isFinite(n) && n > maxNo) maxNo = n;
    }
    return maxNo;
  }

  private formatSampleId(prefix:string, sequence:number) {
    return prefix + String(sequence).padStart(4, '0');
  }

  private nextSampleId(dateText?:string) {
    const prefix = this.sampleIdPrefix(dateText);
    return this.formatSampleId(prefix, this.maxSampleSequenceForPrefix(prefix) + 1);
  }
  private today() { return this.now().slice(0,10); }
  private timeNow() { const m = this.now().match(/\s(\d{2}:\d{2})/); return m ? m[1] : '00:00'; }
  private combineDateTime(d:string,t:string){ return `${d || this.today()} ${t || this.timeNow()}`.trim(); }
}
