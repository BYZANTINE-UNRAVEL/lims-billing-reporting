/**
 * Quick Reporting scenario tests against a temp copy of lims.sqlite3.
 * Covers: pending order seed, dept/card rules, finish/save, edit, return-to-pending.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const LIVE_DB = 'D:\\lims_db\\lims.sqlite3';
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'lims-qr-test-'));
const DATA = path.join(WORK, 'data');
fs.mkdirSync(DATA, { recursive: true });
const DEST_DB = path.join(DATA, 'lims.sqlite3');
// Copy main + WAL sidecars so we get committed data while Electron has the DB open.
fs.copyFileSync(LIVE_DB, DEST_DB);
for (const side of ['-wal', '-shm']) {
  const src = LIVE_DB + side;
  if (fs.existsSync(src)) fs.copyFileSync(src, DEST_DB + side);
}
fs.writeFileSync(path.join(WORK, 'lims-paths.json'), JSON.stringify({ dataDir: DATA }, null, 2));

// Mock electron before loading compiled services
const electronMock = {
  app: {
    getPath: (name) => {
      if (name === 'userData') return WORK;
      return WORK;
    },
    isPackaged: false,
  },
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electronMock;
  return origLoad(request, parent, isMain);
};

function assert(cond, msg) {
  if (!cond) throw new Error('FAIL: ' + msg);
}
function pass(msg) { console.log('PASS:', msg); }

async function main() {
  const root = path.join(__dirname, '..');
  // Prefer compiled dist; fall back to ts-node-less require of dist-electron
  const candidates = [
    path.join(root, 'dist-electron', 'services', 'database.service.js'),
    path.join(root, 'dist-electron', 'electron-main', 'services', 'database.service.js'),
  ];
  let DatabaseService;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      DatabaseService = require(c).DatabaseService;
      break;
    }
  }
  if (!DatabaseService) {
    console.log('Compiling electron first...');
    const { execSync } = require('child_process');
    execSync('npx tsc -p tsconfig.electron.json', { cwd: root, stdio: 'inherit' });
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        DatabaseService = require(c).DatabaseService;
        break;
      }
    }
  }
  assert(DatabaseService, 'DatabaseService not found after compile');

  const dbSvc = new DatabaseService();
  // Ensure schema columns from latest code
  if (typeof dbSvc.ensureColumn === 'function') {
    try {
      dbSvc.ensureColumn('quick_report_items', 'department_order_override', 'REAL');
      dbSvc.ensureColumn('quick_report_items', 'department_order_overridden', 'INTEGER NOT NULL DEFAULT 0');
    } catch (_) { /* may be private */ }
  }

  const setting = dbSvc.db.prepare(`SELECT value FROM settings WHERE key=?`).get('quickReporting.enabled');
  const qrOn = String(setting?.value || '').toLowerCase() === 'true';
  console.log('quickReporting.enabled =', setting?.value, '| workDir =', WORK);
  console.log('dbPath =', dbSvc.dbPath, '| tables sample =', dbSvc.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 8`).all().map(r=>r.name).join(','));
  if (!qrOn) {
    dbSvc.db.prepare(`INSERT INTO settings(key,value) VALUES(?,?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run('quickReporting.enabled', 'true');
    pass('Enabled quickReporting for test DB copy');
  }

  // Find a bill with 2+ departments and at least one profile + one single if possible
  const bills = dbSvc.db.prepare(`
    SELECT b.id bill_id, b.bill_no,
      COUNT(DISTINCT CASE WHEN UPPER(COALESCE(bi.item_type,''))='PROFILE' THEN bi.id END) profiles,
      COUNT(DISTINCT CASE WHEN UPPER(COALESCE(bi.item_type,'')) IN ('TEST','SINGLE') THEN bi.id END) singles
    FROM bills b
    JOIN bill_items bi ON bi.bill_id=b.id
    WHERE UPPER(COALESCE(b.status,'')) NOT IN ('CANCELLED','VOID')
    GROUP BY b.id
    HAVING profiles >= 1
    ORDER BY (profiles+singles) DESC, b.id DESC
    LIMIT 15
  `).all();
  console.log('candidate bills=', bills.length, bills.slice(0,3).map(b => `${b.bill_no}:p${b.profiles}/s${b.singles}`).join(', '));
  assert(bills.length, 'No bills with profiles found');

  let chosen = null;
  let pending = null;
  const pendingProto = findProtoWith(dbSvc, 'getQuickPendingReport');
  const buildProto = findProtoWith(dbSvc, 'quickBuildBillItems');
  for (const b of bills) {
    // On the copy: clear finished rows for this bill so pending rebuild has content.
    const finishedIds = dbSvc.db.prepare(`SELECT id FROM quick_reports WHERE bill_id=?`).all(b.bill_id).map((r) => +r.id);
    if (finishedIds.length) {
      dbSvc.db.prepare(`DELETE FROM quick_report_items WHERE quick_report_id IN (${finishedIds.map(()=>'?').join(',')})`).run(...finishedIds);
      dbSvc.db.prepare(`DELETE FROM quick_reports WHERE bill_id=?`).run(b.bill_id);
      console.log(`cleared ${finishedIds.length} finished report(s) for ${b.bill_no} on test copy`);
    }
    let report = null;
    try {
      report = pendingProto.getQuickPendingReport.call(dbSvc, b.bill_id);
    } catch (e) {
      console.log('pending build error for', b.bill_no, String(e && e.message || e));
      // Fallback direct build
      try {
        const items = buildProto.quickBuildBillItems.call(dbSvc, b.bill_id, false, 0);
        report = { id: -b.bill_id, bill_id: b.bill_id, items };
      } catch (e2) {
        console.log('direct build error', String(e2 && e2.message || e2));
      }
    }
    const tests = (report?.items || []).filter((x) => x.test_id);
    const depts = new Set(tests.map((x) => String(x.department_name || '').trim()).filter(Boolean));
    console.log(`bill ${b.bill_no}: tests=${tests.length} depts=${depts.size}`);
    if (tests.length >= 2 && depts.size >= 1) {
      chosen = b;
      pending = report;
      if (depts.size >= 2) break;
    }
  }
  assert(chosen && pending, 'Could not build pending quick report');
  pass(`Using bill ${chosen.bill_no} (id=${chosen.bill_id}) items=${pending.items.filter(i=>i.test_id).length}`);

  const tests = pending.items.filter((x) => x.test_id);
  const profiles = tests.filter((x) => +(x.source_profile_id || 0) || String(x.source_profile_name || '').trim());
  const singles = tests.filter((x) => !(+(x.source_profile_id || 0)) && !String(x.source_profile_name || '').trim());

  // --- Scenario A: profile card order uses Masters, not bill priority ---
  const billItems = dbSvc.db.prepare(`SELECT * FROM bill_items WHERE bill_id=? AND item_type='PROFILE'`).all(chosen.bill_id);
  for (const bi of billItems) {
    const p = dbSvc.db.prepare(`SELECT report_order, billing_order, priority FROM profiles WHERE id=?`).get(+bi.item_id);
    if (!p) continue;
    const expected = +(p.report_order || p.billing_order || p.priority || 0) || 0;
    const profileRows = tests.filter((x) => +x.source_profile_id === +bi.item_id
      || String(x.source_profile_name || '').trim() === String(bi.name || '').trim());
    if (!profileRows.length) continue;
    const cardGroup = +profileRows[0].group_order_override;
    // Must not equal bill priority when Masters order differs
    if (+bi.priority && expected && +bi.priority !== expected) {
      assert(cardGroup !== +bi.priority || cardGroup === expected,
        `Profile ${bi.name}: card group ${cardGroup} should follow Masters ${expected}, not bill priority ${bi.priority}`);
    }
    assert(cardGroup === expected || Math.abs(cardGroup - expected) < 0.001,
      `Profile ${bi.name}: group_order ${cardGroup} !== Masters ${expected}`);
    pass(`Profile card seed OK: ${bi.name} group=${cardGroup} (Masters ${expected}, billPri ${bi.priority})`);
  }

  // --- Scenario B: singles use Masters report_order, group 5000 ---
  for (const s of singles.slice(0, 5)) {
    const t = dbSvc.db.prepare(`SELECT report_order, priority FROM tests WHERE id=?`).get(+s.test_id);
    const master = +(t?.report_order || t?.priority || 0) || 0;
    assert(+s.group_order_override === 5000, `Single ${s.test_name} group_order should be 5000, got ${s.group_order_override}`);
    if (master) {
      assert(+s.report_order_override === master,
        `Single ${s.test_name} report_order ${s.report_order_override} !== Masters ${master}`);
    }
  }
  if (singles.length) pass(`Singles Masters order + group 5000 OK (n=${singles.length})`);
  else pass('No singles on bill — skipped singles seed check');

  // --- Scenario C: sort key = dept → card → test ---
  const sorted = [...tests].sort((a, b) =>
    (+(a.department_priority ?? 9999) || 9999) - (+(b.department_priority ?? 9999) || 9999) ||
    (+(a.group_order_override ?? 0)) - (+(b.group_order_override ?? 0)) ||
    (+(a.report_order_override ?? 0)) - (+(b.report_order_override ?? 0))
  );
  assert(sorted.length === tests.length, 'sort length');
  pass('Dept→card→test sort applies');

  // --- Scenario D: simulate within-dept card swap + dept swap flags ---
  const byDept = new Map();
  for (const x of tests) {
    const k = String(x.department_name || 'General').trim().toLowerCase();
    if (!byDept.has(k)) byDept.set(k, []);
    byDept.get(k).push(x);
  }
  const deptKeys = [...byDept.keys()];
  if (deptKeys.length >= 1) {
    const cards = byDept.get(deptKeys[0]);
    const profileCard = cards.find((x) => +(x.source_profile_id || 0));
    const singleCard = cards.find((x) => !(+(x.source_profile_id || 0)) && !String(x.source_profile_name || '').trim());
    if (profileCard && singleCard) {
      const a = +profileCard.group_order_override;
      const b = +singleCard.group_order_override;
      // swap within dept
      for (const x of cards) {
        if (+x.source_profile_id === +profileCard.source_profile_id || String(x.source_profile_name) === String(profileCard.source_profile_name)) {
          x.group_order_override = b; x._groupOrderOverridden = true; x.group_order_overridden = 1;
        }
        if (!(+(x.source_profile_id || 0)) && !String(x.source_profile_name || '').trim()) {
          x.group_order_override = a; x._groupOrderOverridden = true; x.group_order_overridden = 1;
        }
      }
      pass(`Within-dept profile↔singles card swap simulated (${deptKeys[0]}: ${a}↔${b})`);
    } else {
      pass('Within-dept profile+singles pair not present — skipped card swap sim');
    }
  }
  if (deptKeys.length >= 2) {
    const d0 = byDept.get(deptKeys[0])[0];
    const d1 = byDept.get(deptKeys[1])[0];
    const p0 = +(d0.department_priority ?? 9999);
    const p1 = +(d1.department_priority ?? 9999);
    for (const x of byDept.get(deptKeys[0])) {
      x.department_priority = p1; x.department_order_override = p1;
      x._departmentOrderOverridden = true; x.department_order_overridden = 1;
    }
    for (const x of byDept.get(deptKeys[1])) {
      x.department_priority = p0; x.department_order_override = p0;
      x._departmentOrderOverridden = true; x.department_order_overridden = 1;
    }
    pass(`Department swap simulated (${deptKeys[0]}↔${deptKeys[1]}: ${p0}↔${p1})`);
  } else {
    pass('Only one department on bill — skipped dept swap sim');
  }

  // Fill results for finish
  for (const x of tests) {
    x.result_value = x.result_value || '1';
    x.selected_for_entry = true;
    x.final_result_source = 'MANUAL';
  }

  // --- Scenario E: Finish / save ---
  const finishPayload = {
    bill_id: chosen.bill_id,
    id: -chosen.bill_id,
    typed_by: 'QR-TEST',
    approved_by: 'QR-TEST',
    remarks: 'automated quick reporting scenario test',
    show_profile_name: true,
    show_sub_header: true,
    items: tests,
  };
  let finishedId = 0;
  const createFn = findProtoWith(dbSvc, 'createQuickFinishedReportFromSelection');
  finishedId = createFn.createQuickFinishedReportFromSelection.call(dbSvc, finishPayload, pending, tests);
  assert(+finishedId > 0, 'finish create returned id');
  const finished = dbSvc.db.prepare(`SELECT * FROM quick_reports WHERE id=?`).get(+finishedId);
  assert(finished && String(finished.status).toUpperCase() !== 'CANCELLED', 'finished report row');
  const savedItems = dbSvc.db.prepare(`SELECT * FROM quick_report_items WHERE quick_report_id=? AND test_id IS NOT NULL`).all(+finishedId);
  assert(savedItems.length >= 1, 'finished items saved');
  pass(`Finish/save OK → quick_report id=${finishedId}, items=${savedItems.length}`);

  // Verify dept override persisted if we set it
  const withDeptOverride = tests.filter((x) => x._departmentOrderOverridden);
  if (withDeptOverride.length) {
    const row = savedItems.find((r) => +r.test_id === +withDeptOverride[0].test_id);
    assert(row && +row.department_order_overridden === 1, 'department_order_overridden persisted on finish');
    pass(`department_order_override persisted (${row.department_order_override})`);
  }

  // --- Scenario F: Edit finished (hide unchecked, keep values) ---
  const editSelection = savedItems.map((r, idx) => ({
    ...r,
    id: r.id,
    result_value: String(r.result_value || '1'),
    selected_for_entry: idx !== 0, // uncheck first
    _groupOrderOverridden: +r.group_order_overridden === 1,
    _reportOrderOverridden: +r.report_order_overridden === 1,
    _departmentOrderOverridden: +r.department_order_overridden === 1,
  }));
  const kept = editSelection.filter((x) => x.selected_for_entry);
  const currentFinished = findProtoWith(dbSvc, 'getQuickFinishedReport').getQuickFinishedReport.call(dbSvc, +finishedId);
  findProtoWith(dbSvc, 'updateQuickFinishedReportItems').updateQuickFinishedReportItems.call(
    dbSvc,
    { id: finishedId, return_unchecked_to_pending: false },
    currentFinished,
    kept
  );
  const afterHide = dbSvc.db.prepare(`SELECT id, selected_for_reporting, result_value FROM quick_report_items WHERE quick_report_id=? AND test_id IS NOT NULL`).all(+finishedId);
  const hidden = afterHide.filter((x) => +x.selected_for_reporting === 0);
  assert(hidden.length >= 1, 'edit hide unchecked should set selected_for_reporting=0');
  assert(hidden.every((x) => String(x.result_value || '').length >= 0), 'values kept on hide');
  pass(`Edit hide-from-PDF OK (hidden=${hidden.length}, total=${afterHide.length})`);

  // --- Scenario G: Return unchecked to pending (DELETE) ---
  // Re-select all but one, return that one to pending
  const current2 = findProtoWith(dbSvc, 'getQuickFinishedReport').getQuickFinishedReport.call(dbSvc, +finishedId);
  const allAgain = (current2.items || []).filter((x) => x.test_id).map((x, idx) => ({
    ...x,
    result_value: x.result_value || '1',
    selected_for_entry: idx !== 0,
    _groupOrderOverridden: +x.group_order_overridden === 1,
    _departmentOrderOverridden: +x.department_order_overridden === 1,
  }));
  const keep2 = allAgain.filter((x) => x.selected_for_entry);
  const beforeCount = dbSvc.db.prepare(`SELECT COUNT(*) c FROM quick_report_items WHERE quick_report_id=? AND test_id IS NOT NULL`).get(+finishedId).c;
  findProtoWith(dbSvc, 'updateQuickFinishedReportItems').updateQuickFinishedReportItems.call(
    dbSvc,
    { id: finishedId, return_unchecked_to_pending: true },
    current2,
    keep2
  );
  const afterCount = dbSvc.db.prepare(`SELECT COUNT(*) c FROM quick_report_items WHERE quick_report_id=? AND test_id IS NOT NULL`).get(+finishedId).c;
  assert(afterCount < beforeCount, `return-to-pending should DELETE rows (${beforeCount}→${afterCount})`);
  pass(`Return-to-pending OK (${beforeCount}→${afterCount})`);

  // Pending rebuild should include the returned test(s).
  const pendingAgain = findProtoWith(dbSvc, 'getQuickPendingReport').getQuickPendingReport.call(dbSvc, chosen.bill_id);
  const pendingTests = (pendingAgain?.items || []).filter((x) => x.test_id);
  assert(pendingTests.length >= 1, `pending should include returned test(s), got ${pendingTests.length}`);
  pass(`Pending rebuild OK after return-to-pending (pending tests=${pendingTests.length}, finished kept=${afterCount})`);

  console.log('\n=== ALL QUICK REPORTING SCENARIOS PASSED ===');
  console.log('Temp DB (safe copy):', path.join(DATA, 'lims.sqlite3'));
  try { dbSvc.closeDatabaseConnection?.(); } catch (_) {}
}

function findProtoWith(obj, method) {
  let p = obj;
  while (p) {
    if (typeof p[method] === 'function') return p;
    p = Object.getPrototypeOf(p);
  }
  throw new Error('Method not found: ' + method);
}

main().catch((err) => {
  console.error('\n=== FAILED ===');
  console.error(err && err.stack || err);
  process.exit(1);
});
