import Database from 'better-sqlite3';
const dbPath = process.argv[2] || 'D:/lims_db/lims.sqlite3';
const db = new Database(dbPath, { readonly: true });
console.log('DB', dbPath);
console.log('settings', db.prepare(`SELECT key,value FROM settings WHERE key LIKE 'quick%' OR key LIKE 'billing.edit%' OR key LIKE 'report.%order%'`).all());
try {
  console.log('quick_reports', db.prepare(`SELECT id,bill_id,status,created_at FROM quick_reports ORDER BY id DESC LIMIT 8`).all());
  console.log('recent finished items', db.prepare(`
    SELECT qri.quick_report_id, qri.test_id, qri.test_name, qri.department_name,
           qri.group_order_override, qri.report_order_override, qri.priority,
           qri.source_profile_name
    FROM quick_report_items qri
    ORDER BY qri.quick_report_id DESC, COALESCE(qri.group_order_override,qri.priority,0), COALESCE(qri.report_order_override,qri.priority,0), qri.id
    LIMIT 40`).all());
} catch (e) {
  console.log('quick err', e.message);
}
try {
  console.log('bills', db.prepare(`SELECT id,bill_no,status,total FROM bills ORDER BY id DESC LIMIT 8`).all());
  console.log('bill_items sample', db.prepare(`SELECT bill_id,item_type,item_id,name FROM bill_items ORDER BY bill_id DESC LIMIT 20`).all());
} catch (e) {
  console.log('bill err', e.message);
}
try {
  console.log('depts', db.prepare(`SELECT id,name,priority FROM departments ORDER BY priority,name`).all());
} catch (e) {
  console.log('dept err', e.message);
}
db.close();
