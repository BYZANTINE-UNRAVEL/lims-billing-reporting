import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { QuickReportingBarcodeService } from './quick-reporting-barcode.service';

export abstract class DatabaseCoreService {
  protected abstract ensureReportDeliverySchema(): void;
  protected abstract ensureCollectionSchema(): void;
  protected abstract seedInventoryItemVersions(): void;
  protected abstract normalizeReferenceGender(value: any): string;
  protected abstract validateProfileItems(profileId: number, items: any[]): string[];
  protected abstract normalizeDateOnly(value: any, fallback?: string): string;
  db: Database.Database;
  dataDir: string;
  reportsDir: string;
  dbPath: string;
  protected quickBarcode?: QuickReportingBarcodeService;

  protected static pathConfigFile() { return path.join(app.getPath('userData'), 'lims-paths.json'); }

  protected static readPathConfig(): any {
    try { return JSON.parse(fs.readFileSync(DatabaseCoreService.pathConfigFile(), 'utf8')); } catch { return {}; }
  }

  static writePathConfig(config: any) {
    const file = DatabaseCoreService.pathConfigFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(config || {}, null, 2));
    return config || {};
  }

  static configuredDataDir() {
    const cfg = DatabaseCoreService.readPathConfig();
    const configured = String(cfg.dataDir || '').trim();
    return configured || path.join(app.getPath('userData'), 'data');
  }

  constructor() {
    this.dataDir = DatabaseCoreService.configuredDataDir();
    this.reportsDir = path.join(app.getPath('userData'), 'reports');
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.reportsDir, { recursive: true });
    this.dbPath = path.join(this.dataDir, 'lims.sqlite3');
    this.db = null as any;
    this.reopenDatabaseConnection();
  }

  public closeDatabaseConnection() {
    if (!this.db?.open) return;
    try { this.db.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
    this.quickBarcode = undefined;
    this.db.close();
  }

  public reopenDatabaseConnection() {
    if (this.db?.open) return;
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
    this.quickBarcode = new QuickReportingBarcodeService(this.db, () => this.nowIst());
    this.quickBarcode.ensureSchema();
    this.seedDefaults();
  }

  protected nowIst() {
    return new Date(Date.now() + 330 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }

  public currentIstTimestamp() { return this.nowIst(); }

  protected quickBarcodeSvc(): QuickReportingBarcodeService {
    if (!this.quickBarcode) {
      this.quickBarcode = new QuickReportingBarcodeService(this.db, () => this.nowIst());
      this.quickBarcode.ensureSchema();
    }
    return this.quickBarcode;
  }

  protected toBool01(value:any): number {
    if (value === true || value === 1) return 1;
    const text = String(value ?? '').trim().toLowerCase();
    return ['1','true','yes','y','on','enabled'].includes(text) ? 1 : 0;
  }

  protected migrate() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, priority INTEGER NOT NULL DEFAULT 0, page_break_after INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS tests(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, display_name TEXT, department_id INTEGER, unit_id INTEGER, price REAL NOT NULL DEFAULT 0, normal_range TEXT, method TEXT, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, active INTEGER NOT NULL DEFAULT 1, billable INTEGER NOT NULL DEFAULT 1, active_for_reporting INTEGER NOT NULL DEFAULT 1, highlight_parameter INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(department_id) REFERENCES departments(id), FOREIGN KEY(unit_id) REFERENCES units(id));
CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, display_name TEXT, department_id INTEGER NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, running_cost REAL NOT NULL DEFAULT 0, running_cost_mode TEXT NOT NULL DEFAULT 'AUTO', priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, active INTEGER NOT NULL DEFAULT 1, billable INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS profile_tests(profile_id INTEGER NOT NULL, test_id INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, PRIMARY KEY(profile_id,test_id), FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE, FOREIGN KEY(test_id) REFERENCES tests(id));
CREATE TABLE IF NOT EXISTS profile_items(id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, item_type TEXT NOT NULL DEFAULT 'TEST', test_id INTEGER, child_profile_id INTEGER, header_text TEXT, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, display_profile_name INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE, FOREIGN KEY(test_id) REFERENCES tests(id), FOREIGN KEY(child_profile_id) REFERENCES profiles(id));
CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY AUTOINCREMENT, patient_no TEXT NOT NULL UNIQUE, title TEXT, name TEXT NOT NULL, dob TEXT, age TEXT, age_value INTEGER, age_unit TEXT NOT NULL DEFAULT 'YEARS', gender TEXT, relation_type TEXT, guardian_name TEXT, guardian_mobile TEXT, age_split INTEGER NOT NULL DEFAULT 1, mobile TEXT, email TEXT, address TEXT, history TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS consultants(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, clinic TEXT, active INTEGER NOT NULL DEFAULT 1, default_commission_type TEXT NOT NULL DEFAULT 'PERCENT', default_commission_value REAL NOT NULL DEFAULT 0, default_commission_profile_id INTEGER);
CREATE TABLE IF NOT EXISTS consultant_commissions(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, commission_type TEXT NOT NULL, commission_value REAL NOT NULL DEFAULT 0, FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS consultant_commission_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, profile_name TEXT NOT NULL, description TEXT, commission_type TEXT NOT NULL DEFAULT 'PERCENT', commission_value REAL NOT NULL DEFAULT 0, calculation_base TEXT NOT NULL DEFAULT 'GROSS', extra_deduction_type TEXT NOT NULL DEFAULT 'NONE', extra_deduction_value REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS consultant_commission_rules(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, action TEXT NOT NULL DEFAULT 'USE_PROFILE', commission_profile_id INTEGER, FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE, FOREIGN KEY(commission_profile_id) REFERENCES consultant_commission_profiles(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_no TEXT NOT NULL UNIQUE, patient_id INTEGER NOT NULL, consultant_id INTEGER, bill_date TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, discount_type TEXT NOT NULL DEFAULT 'VALUE', discount_value REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, due REAL NOT NULL DEFAULT 0, payment_mode TEXT NOT NULL DEFAULT 'Cash', round_mode TEXT NOT NULL DEFAULT 'NONE', round_off REAL NOT NULL DEFAULT 0, cash_received REAL NOT NULL DEFAULT 0, cash_return REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'BILLED', notes TEXT, FOREIGN KEY(patient_id) REFERENCES patients(id), FOREIGN KEY(consultant_id) REFERENCES consultants(id));
CREATE TABLE IF NOT EXISTS bill_items(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, name TEXT NOT NULL, department_name TEXT, quantity INTEGER NOT NULL DEFAULT 1, price REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, discount_type TEXT NOT NULL DEFAULT 'VALUE', discount_value REAL NOT NULL DEFAULT 0, discount_amount REAL NOT NULL DEFAULT 0, net_amount REAL NOT NULL DEFAULT 0, running_cost REAL NOT NULL DEFAULT 0, extra_deduction REAL NOT NULL DEFAULT 0, commission_amount REAL NOT NULL DEFAULT 0, profit_amount REAL NOT NULL DEFAULT 0, commission_profile_name TEXT, commission_rule_source TEXT, FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS receipts(id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE, bill_id INTEGER NOT NULL, amount REAL NOT NULL, payment_mode TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(bill_id) REFERENCES bills(id));
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'DRAFT', typed_by TEXT, approved_by TEXT, remarks TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(bill_id) REFERENCES bills(id));
CREATE TABLE IF NOT EXISTS report_items(id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, test_id INTEGER, test_name TEXT NOT NULL, department_name TEXT, side_header TEXT, result_value TEXT, unit TEXT, normal_range TEXT, method TEXT, priority INTEGER NOT NULL DEFAULT 0, highlight_parameter INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(report_id) REFERENCES reports(id) ON DELETE CASCADE, FOREIGN KEY(test_id) REFERENCES tests(id));
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE INDEX IF NOT EXISTS idx_patients_name_mobile ON patients(name, mobile);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(bill_date);
CREATE INDEX IF NOT EXISTS idx_bills_patient ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_report_status ON reports(status);
`);
    this.ensureBillingSchema();
    this.ensureEquipmentIntegrationSchema();
  }

  protected ensureBillingSchema() {
    this.ensureBillingDiscountColumns();
    this.ensurePatientDemographicColumns();
    this.ensureCancellationSchema();
    this.ensureReportDeliverySchema();
    this.ensureNumberSequenceSchema();
    this.ensureAdvancedTestMasterSchema();
    this.ensureCommissionSchema();
    this.ensureOperationsSchema();
    this.ensureCollectionSchema();
    this.ensureMultiReportSchema();
    this.ensureQuickReportingSchema();
  }


  protected ensureQuickReportingSchema() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS quick_reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_no TEXT,
  bill_id INTEGER NOT NULL,
  patient_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'FINISHED',
  typed_by TEXT,
  approved_by TEXT,
  remarks TEXT,
  show_profile_name_on_report INTEGER NOT NULL DEFAULT 1,
  show_sub_header_on_report INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  cancelled_at TEXT,
  cancel_reason TEXT,
  FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY(patient_id) REFERENCES patients(id)
);
CREATE TABLE IF NOT EXISTS quick_report_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quick_report_id INTEGER NOT NULL,
  bill_id INTEGER NOT NULL,
  bill_item_id INTEGER NOT NULL,
  item_key TEXT NOT NULL,
  test_id INTEGER,
  test_name TEXT NOT NULL,
  department_name TEXT,
  side_header TEXT,
  result_value TEXT,
  unit TEXT,
  normal_range TEXT,
  method TEXT,
  priority REAL NOT NULL DEFAULT 0,
  highlight_parameter INTEGER NOT NULL DEFAULT 0,
  heading_kind TEXT,
  source_profile_id INTEGER,
  source_profile_name TEXT,
  flag_status TEXT,
  is_critical INTEGER NOT NULL DEFAULT 0,
  critical_message TEXT,
  formula_status TEXT,
  final_result_source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  FOREIGN KEY(quick_report_id) REFERENCES quick_reports(id) ON DELETE CASCADE,
  FOREIGN KEY(bill_id) REFERENCES bills(id) ON DELETE CASCADE,
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
CREATE INDEX IF NOT EXISTS idx_quick_reports_bill_status ON quick_reports(bill_id,status);
CREATE INDEX IF NOT EXISTS idx_quick_report_items_key ON quick_report_items(item_key);
CREATE INDEX IF NOT EXISTS idx_quick_report_items_report ON quick_report_items(quick_report_id);
`);
    this.ensureColumn('quick_report_items', 'specimen_type_id', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('quick_report_items', 'specimen_name', 'TEXT');
    this.ensureColumn('quick_report_items', 'sample_id', 'TEXT');
    this.ensureColumn('quick_report_items', 'barcode', 'TEXT');
    this.ensureColumn('quick_report_items', 'collection_type', 'TEXT');
    this.ensureColumn('quick_report_items', 'collect_timing', "TEXT NOT NULL DEFAULT 'NOW'");
    this.ensureColumn('quick_report_items', 'expected_collect_at', 'TEXT');
    this.ensureColumn('quick_report_items', 'collection_date', 'TEXT');
    this.ensureColumn('quick_report_items', 'collection_time', 'TEXT');
    this.ensureColumn('quick_report_items', 'collection_datetime', 'TEXT');
    this.ensureColumn('quick_report_items', 'barcode_generated', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('quick_report_items', 'barcode_generated_at', 'TEXT');
    // Persist per-report ordering from Quick Reporting. Master priority remains unchanged.
    this.ensureColumn('quick_report_items', 'report_order_override', 'REAL');
    this.ensureColumn('quick_report_items', 'group_order_override', 'REAL');
    this.quickBarcode?.ensureSchema();
  }


  protected ensureMultiReportSchema() {
    // Reports are no longer one row per bill. Collection creates real report
    // records per physical collection workflow: one in-house report, and one
    // outsource report per vendor/scope. The old bill-level report is kept only
    // as a hidden COLLECTION_STAGING workspace for Pending Collection selection.
    const cols = this.db.prepare("PRAGMA table_info(reports)").all() as any[];
    const has = (name:string) => cols.some(c => c.name === name);
    const add = (name:string, type:string) => { if (!has(name)) this.db.exec(`ALTER TABLE reports ADD COLUMN ${name} ${type}`); };

    // If an older database has reports.bill_id UNIQUE, rebuild the table so
    // many reports can belong to the same bill.
    const indexes = this.db.prepare("PRAGMA index_list(reports)").all() as any[];
    const uniqueBillIndex = indexes.find((idx:any) => +idx.unique === 1 && (this.db.prepare(`PRAGMA index_info(${idx.name})`).all() as any[]).some((x:any)=>x.name === 'bill_id'));
    if (uniqueBillIndex) {
      this.db.pragma('foreign_keys = OFF');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS reports_multi_tmp(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bill_id INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'DRAFT',
          typed_by TEXT,
          approved_by TEXT,
          remarks TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
          pdf_exported_at TEXT,
          printed_at TEXT,
          emailed_at TEXT,
          smsed_at TEXT,
          delivery_status TEXT,
          show_profile_name_on_report INTEGER NOT NULL DEFAULT 1,
          show_sub_header_on_report INTEGER NOT NULL DEFAULT 1,
          report_scope TEXT NOT NULL DEFAULT 'COLLECTION',
          source_collection_id INTEGER,
          workflow_key TEXT,
          queue_vendor_id INTEGER,
          report_title TEXT,
          FOREIGN KEY(bill_id) REFERENCES bills(id)
        );
        INSERT OR IGNORE INTO reports_multi_tmp(id,bill_id,status,typed_by,approved_by,remarks,created_at,updated_at,pdf_exported_at,printed_at,emailed_at,smsed_at,delivery_status,show_profile_name_on_report,show_sub_header_on_report,report_scope,source_collection_id,workflow_key,queue_vendor_id,report_title)
        SELECT id,bill_id,status,typed_by,approved_by,remarks,created_at,updated_at,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='pdf_exported_at') THEN pdf_exported_at ELSE NULL END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='printed_at') THEN printed_at ELSE NULL END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='emailed_at') THEN emailed_at ELSE NULL END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='smsed_at') THEN smsed_at ELSE NULL END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='delivery_status') THEN delivery_status ELSE NULL END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='show_profile_name_on_report') THEN show_profile_name_on_report ELSE 1 END,
          CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('reports') WHERE name='show_sub_header_on_report') THEN show_sub_header_on_report ELSE 1 END,
          CASE WHEN status='COLLECTION_STAGING' THEN 'STAGING' ELSE 'COLLECTION' END,
          NULL,NULL,NULL,NULL
        FROM reports;
        DROP TABLE reports;
        ALTER TABLE reports_multi_tmp RENAME TO reports;
      `);
      this.db.pragma('foreign_keys = ON');
    }

    add('report_scope', "TEXT NOT NULL DEFAULT 'COLLECTION'");
    add('source_collection_id', 'INTEGER');
    add('workflow_key', 'TEXT');
    add('queue_vendor_id', 'INTEGER');
    add('report_title', 'TEXT');
    add('parent_report_id', 'INTEGER');
    add('report_kind', "TEXT NOT NULL DEFAULT 'NORMAL'");
    add('recheck_sequence', 'INTEGER NOT NULL DEFAULT 0');
    add('recheck_mode', "TEXT NOT NULL DEFAULT 'NONE'");
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_bill_scope ON reports(bill_id,report_scope,status);
                  CREATE INDEX IF NOT EXISTS idx_reports_collection_scope ON reports(source_collection_id,workflow_key,queue_vendor_id);
                  CREATE INDEX IF NOT EXISTS idx_reports_parent_recheck ON reports(parent_report_id,report_kind,status);`);
    this.db.prepare("UPDATE reports SET report_scope='STAGING', status='COLLECTION_STAGING' WHERE report_scope IS NULL AND status='COLLECTION_STAGING'").run();
  }


  protected ensureCommissionSchema() {
    this.ensureColumn('tests', 'running_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'outsourced_test', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'vendor_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'commission_allowed', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('consultants', 'default_commission_profile_id', 'INTEGER');
    this.db.exec(`CREATE TABLE IF NOT EXISTS consultant_commission_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, profile_name TEXT NOT NULL, description TEXT, commission_type TEXT NOT NULL DEFAULT 'PERCENT', commission_value REAL NOT NULL DEFAULT 0, calculation_base TEXT NOT NULL DEFAULT 'GROSS', extra_deduction_type TEXT NOT NULL DEFAULT 'NONE', extra_deduction_value REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0, FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS consultant_commission_rules(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, action TEXT NOT NULL DEFAULT 'USE_PROFILE', commission_profile_id INTEGER, FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE, FOREIGN KEY(commission_profile_id) REFERENCES consultant_commission_profiles(id) ON DELETE SET NULL);`);
    this.ensureColumn('bill_items', 'running_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'extra_deduction', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'commission_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'profit_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'commission_profile_name', 'TEXT');
    this.ensureColumn('bill_items', 'commission_rule_source', 'TEXT');
    this.ensureColumn('bill_items', 'commission_status', "TEXT NOT NULL DEFAULT 'GENERATED'");
    ["min_commission REAL NOT NULL DEFAULT 0","max_commission REAL NOT NULL DEFAULT 0","round_mode TEXT NOT NULL DEFAULT 'NONE'","discount_basis TEXT NOT NULL DEFAULT 'AFTER_DISCOUNT'","fixed_apply_mode TEXT NOT NULL DEFAULT 'PER_ITEM'","effective_from TEXT","effective_to TEXT","status TEXT NOT NULL DEFAULT 'GENERATED'"].forEach(def => { const [name] = def.split(' '); this.ensureColumn('consultant_commission_profiles', name, def.substring(name.length + 1)); });
    this.ensureColumn('bill_items', 'commission_approved_at', 'TEXT');
    this.ensureColumn('bill_items', 'commission_paid_at', 'TEXT');
    this.ensureColumn('bill_items', 'commission_hold_reason', 'TEXT');
    this.ensureColumn('bill_items', 'commission_settlement_id', 'INTEGER');
    this.ensureColumn('bill_items', 'commission_formula', 'TEXT');
    this.ensureColumn('bill_items', 'commission_formula_values', 'TEXT');
    this.ensureColumn('bill_items', 'commission_group_id', 'INTEGER');
    this.ensureColumn('bill_items', 'commission_rule_version', 'INTEGER NOT NULL DEFAULT 1');
    this.db.exec(`CREATE TABLE IF NOT EXISTS commission_groups(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT,
      description TEXT,
      calculation_type TEXT NOT NULL DEFAULT 'PERCENT_NET',
      rate REAL NOT NULL DEFAULT 0,
      fixed_amount REAL NOT NULL DEFAULT 0,
      formula_type TEXT NOT NULL DEFAULT 'PREDEFINED',
      formula_expression TEXT,
      discount_basis TEXT NOT NULL DEFAULT 'AFTER_DISCOUNT',
      profile_mode TEXT NOT NULL DEFAULT 'PROFILE_ONLY',
      min_commission REAL NOT NULL DEFAULT 0,
      max_commission REAL NOT NULL DEFAULT 0,
      effective_from TEXT,
      effective_to TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
    );
    CREATE TABLE IF NOT EXISTS commission_group_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER NOT NULL,
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      UNIQUE(group_id,item_type,item_id),
      FOREIGN KEY(group_id) REFERENCES commission_groups(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS consultant_commission_group_assignments(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      consultant_id INTEGER NOT NULL,
      group_id INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      custom_formula TEXT,
      custom_rate REAL,
      active INTEGER NOT NULL DEFAULT 1,
      UNIQUE(consultant_id,group_id),
      FOREIGN KEY(consultant_id) REFERENCES consultants(id) ON DELETE CASCADE,
      FOREIGN KEY(group_id) REFERENCES commission_groups(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_commission_group_item ON commission_group_items(item_type,item_id);
    CREATE INDEX IF NOT EXISTS idx_consultant_group ON consultant_commission_group_assignments(consultant_id,active,priority);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS commission_settlements(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_no TEXT NOT NULL UNIQUE,
      consultant_id INTEGER NOT NULL,
      settlement_date TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
      amount REAL NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      reference_no TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
      FOREIGN KEY(consultant_id) REFERENCES consultants(id)
    );
    CREATE TABLE IF NOT EXISTS commission_settlement_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      settlement_id INTEGER NOT NULL,
      bill_item_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      FOREIGN KEY(settlement_id) REFERENCES commission_settlements(id) ON DELETE CASCADE,
      FOREIGN KEY(bill_item_id) REFERENCES bill_items(id)
    );
    CREATE INDEX IF NOT EXISTS idx_bill_items_commission_status ON bill_items(commission_status);
    CREATE INDEX IF NOT EXISTS idx_commission_settlement_consultant ON commission_settlements(consultant_id, settlement_date);`);
  }


  protected ensureOperationsSchema() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS vendors(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, address TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS inventory_items(id INTEGER PRIMARY KEY AUTOINCREMENT, item_code TEXT, item_name TEXT NOT NULL, category TEXT, unit TEXT, reorder_level REAL NOT NULL DEFAULT 0, current_stock REAL NOT NULL DEFAULT 0, average_cost REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS purchases(id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_no TEXT, vendor_id INTEGER, purchase_date TEXT NOT NULL DEFAULT (date('now','+330 minutes')), invoice_no TEXT, subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, due REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(vendor_id) REFERENCES vendors(id));
CREATE TABLE IF NOT EXISTS purchase_items(id INTEGER PRIMARY KEY AUTOINCREMENT, purchase_id INTEGER NOT NULL, inventory_item_id INTEGER NOT NULL, batch_no TEXT, expiry_date TEXT, quantity REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE CASCADE, FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id));
CREATE TABLE IF NOT EXISTS inventory_movements(id INTEGER PRIMARY KEY AUTOINCREMENT, inventory_item_id INTEGER NOT NULL, movement_type TEXT NOT NULL, quantity REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, reference_type TEXT, reference_id INTEGER, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id));
CREATE TABLE IF NOT EXISTS test_reagent_consumption(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, inventory_item_id INTEGER NOT NULL, quantity_per_test REAL NOT NULL DEFAULT 0, wastage_percent REAL NOT NULL DEFAULT 0, cost_per_test REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, UNIQUE(test_id, inventory_item_id), FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE, FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id));
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY AUTOINCREMENT, expense_date TEXT NOT NULL DEFAULT (date('now','+330 minutes')), category TEXT NOT NULL, description TEXT, amount REAL NOT NULL DEFAULT 0, payment_mode TEXT NOT NULL DEFAULT 'Cash', paid_to TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY AUTOINCREMENT, payment_date TEXT NOT NULL DEFAULT (date('now','+330 minutes')), party_type TEXT NOT NULL DEFAULT 'VENDOR', party_id INTEGER, party_name TEXT, amount REAL NOT NULL DEFAULT 0, payment_mode TEXT NOT NULL DEFAULT 'Cash', reference_no TEXT, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS payment_allocations(id INTEGER PRIMARY KEY AUTOINCREMENT, payment_id INTEGER NOT NULL, purchase_id INTEGER, bill_id INTEGER, allocated_amount REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE, FOREIGN KEY(purchase_id) REFERENCES purchases(id));
CREATE TABLE IF NOT EXISTS outsource_vendors(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, address TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS outsource_test_rates(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, outsource_vendor_id INTEGER NOT NULL, vendor_rate REAL NOT NULL DEFAULT 0, billing_rate REAL NOT NULL DEFAULT 0, commission_allowed INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, UNIQUE(test_id,outsource_vendor_id), FOREIGN KEY(test_id) REFERENCES tests(id), FOREIGN KEY(outsource_vendor_id) REFERENCES outsource_vendors(id));
CREATE TABLE IF NOT EXISTS outsource_cases(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER, test_id INTEGER NOT NULL, outsource_vendor_id INTEGER NOT NULL, sent_date TEXT NOT NULL DEFAULT (date('now','+330 minutes')), expected_date TEXT, received_date TEXT, status TEXT NOT NULL DEFAULT 'SENT', vendor_cost REAL NOT NULL DEFAULT 0, notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(bill_id) REFERENCES bills(id), FOREIGN KEY(test_id) REFERENCES tests(id), FOREIGN KEY(outsource_vendor_id) REFERENCES outsource_vendors(id));`);
    this.ensureColumn('vendors', 'gstin', 'TEXT');
    this.db.exec(`CREATE TABLE IF NOT EXISTS inventory_batches(id INTEGER PRIMARY KEY AUTOINCREMENT, inventory_item_id INTEGER NOT NULL, batch_no TEXT NOT NULL, expiry_date TEXT, quantity REAL NOT NULL DEFAULT 0, rate REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), UNIQUE(inventory_item_id,batch_no), FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE);`);
    this.ensureColumn('inventory_items', 'hsn_code', 'TEXT');
    this.ensureColumn('inventory_items', 'gst_percent', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('inventory_items', 'batch_expiry_required', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('inventory_items', 'maintain_batch', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('inventory_items', 'maintain_expiry', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('inventory_items', 'pack_size', 'REAL NOT NULL DEFAULT 1');
    this.ensureColumn('inventory_items', 'pack_unit', 'TEXT');
    this.ensureColumn('inventory_items', 'purchase_unit', 'TEXT');
    this.ensureColumn('inventory_items', 'brand', 'TEXT');
    this.ensureColumn('inventory_items', 'effective_from', 'TEXT');
    this.ensureColumn('inventory_items', 'effective_to', 'TEXT');
    this.db.exec(`CREATE TABLE IF NOT EXISTS operation_units(id INTEGER PRIMARY KEY AUTOINCREMENT, unit_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS operation_brands(id INTEGER PRIMARY KEY AUTOINCREMENT, brand_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS operation_hsns(id INTEGER PRIMARY KEY AUTOINCREMENT, hsn_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS inventory_item_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, inventory_item_id INTEGER NOT NULL, effective_from TEXT NOT NULL, effective_to TEXT, item_code TEXT, item_name TEXT NOT NULL, brand TEXT, category TEXT, unit TEXT, pack_unit TEXT, purchase_unit TEXT, pack_size REAL NOT NULL DEFAULT 1, hsn_code TEXT, gst_percent REAL NOT NULL DEFAULT 0, batch_expiry_required INTEGER NOT NULL DEFAULT 0, maintain_batch INTEGER NOT NULL DEFAULT 0, maintain_expiry INTEGER NOT NULL DEFAULT 0, reorder_level REAL NOT NULL DEFAULT 0, average_cost REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(inventory_item_id) REFERENCES inventory_items(id) ON DELETE CASCADE);`);
    this.db.prepare('UPDATE inventory_items SET maintain_batch=1, maintain_expiry=1 WHERE batch_expiry_required=1 AND maintain_batch=0 AND maintain_expiry=0').run();
    this.seedInventoryItemVersions();
    this.ensureColumn('purchase_items', 'hsn_code', 'TEXT');
    this.ensureColumn('purchase_items', 'gst_percent', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'discount_type', "TEXT NOT NULL DEFAULT 'PERCENT'");
    this.ensureColumn('purchase_items', 'discount_value', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'discount_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'final_rate', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'taxable_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'tax_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'line_total', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('purchase_items', 'item_code_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'item_name_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'brand_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'unit_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'inventory_version_id', 'INTEGER');
    this.ensureColumn('purchase_items', 'pack_size_snapshot', 'REAL NOT NULL DEFAULT 1');
    this.ensureColumn('purchase_items', 'pack_unit_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'purchase_unit_snapshot', 'TEXT');
    this.ensureColumn('purchase_items', 'batch_splits_json', 'TEXT');
    this.ensureColumn('test_reagent_consumption', 'consumption_method', "TEXT NOT NULL DEFAULT 'QTY_PER_TEST'");
    this.ensureColumn('test_reagent_consumption', 'qty_unit', 'TEXT');
    this.ensureColumn('test_reagent_consumption', 'tests_per_pack', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('test_reagent_consumption', 'include_control', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('test_reagent_consumption', 'control_tests_count', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('test_reagent_consumption', 'control_frequency', "TEXT NOT NULL DEFAULT 'DAY'");
    this.ensureColumn('test_reagent_consumption', 'expected_tests_count', 'REAL NOT NULL DEFAULT 1');
    this.ensureColumn('test_reagent_consumption', 'expected_tests_frequency', "TEXT NOT NULL DEFAULT 'DAY'");
    this.ensureColumn('inventory_movements', 'batch_no', 'TEXT');
    this.ensureColumn('inventory_movements', 'expiry_date', 'TEXT');
    this.ensureColumn('inventory_movements', 'effective_date', 'TEXT');
    this.ensureColumn('purchases', 'effective_purchase_date', 'TEXT');
  }


  protected ensureAdvancedTestMasterSchema() {
    this.ensureColumn('tests', 'display_name', 'TEXT');
    this.ensureColumn('tests', 'running_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'outsourced_test', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'vendor_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'commission_allowed', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('tests', 'result_data_type', "TEXT NOT NULL DEFAULT 'NUMBER'");
    this.ensureColumn('tests', 'input_control_type', "TEXT NOT NULL DEFAULT 'TEXTBOX'");
    this.ensureColumn('tests', 'result_mode', "TEXT NOT NULL DEFAULT 'DIRECT'");
    this.ensureColumn('tests', 'billing_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'report_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'search_keywords', 'TEXT');
    this.ensureColumn('tests', 'method_id', 'INTEGER');
    this.ensureColumn('tests', 'decimal_places', 'INTEGER NOT NULL DEFAULT 2');
    this.ensureColumn('tests', 'rounding_mode', "TEXT NOT NULL DEFAULT 'NEAREST'");
    this.ensureColumn('tests', 'number_format', "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn('tests', 'predefined_formula_key', 'TEXT');
    this.ensureColumn('tests', 'output_operator', "TEXT NOT NULL DEFAULT '+'");
    this.ensureColumn('tests', 'output_constant', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'interpretation_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'interpretation_text', 'TEXT');
    this.ensureColumn('tests', 'active_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('tests', 'highlight_parameter', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'start_new_page', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('departments', 'page_break_after', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('tests', 'collection_rule', "TEXT NOT NULL DEFAULT 'NORMAL'");
    this.ensureColumn('tests', 'fasting_hours', 'INTEGER NOT NULL DEFAULT 8');
    this.ensureColumn('tests', 'collection_gap_minutes', 'INTEGER NOT NULL DEFAULT 120');
    this.ensureColumn('tests', 'collection_dependency', "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn('tests', 'same_specimen_allowed', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('tests', 'collection_instruction', 'TEXT');
    this.ensureColumn('report_items', 'highlight_parameter', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('report_items', 'heading_kind', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('report_items', 'source_profile_id', 'INTEGER');
    this.ensureColumn('report_items', 'source_profile_name', 'TEXT');
    this.ensureColumn('report_items', 'flag_status', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('report_items', 'is_critical', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('report_items', 'critical_message', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('report_items', 'formula_status', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('report_items', 'result_status', "TEXT NOT NULL DEFAULT 'PENDING'");
    this.ensureColumn('report_items', 'selected_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('report_items', 'report_order_override', 'REAL');
    this.ensureColumn('report_items', 'group_order_override', 'REAL');
    this.ensureColumn('report_items', 'recheck_mode', "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn('report_items', 'recheck_status', "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn('report_items', 'recheck_requested_at', 'TEXT');
    this.ensureColumn('report_items', 'recheck_remarks', 'TEXT');
    this.ensureColumn('report_items', 'recheck_vendor_id', 'INTEGER');
    this.ensureColumn('report_items', 'recheck_reverted_at', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_collection_status', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_collection_mode', 'TEXT');
    this.ensureColumn('report_items', 'recheck_prev_final_result_source', 'TEXT');
    this.ensureColumn('profiles', 'display_name', 'TEXT');
    this.ensureColumn('profiles', 'active_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('profiles', 'report_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'interpretation_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'interpretation_text', 'TEXT');
    this.ensureColumn('profiles', 'department_id', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'show_profile_name', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('profiles', 'start_new_page', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'break_page_after', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'ordering_mode', "TEXT NOT NULL DEFAULT 'MANUAL'");
    this.ensureProfileBuilderSchema();
    this.db.exec(`
CREATE TABLE IF NOT EXISTS specimen_types(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, code TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS test_specimen_mappings(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, specimen_type_id INTEGER NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 1000, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), UNIQUE(test_id, specimen_type_id), FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE, FOREIGN KEY(specimen_type_id) REFERENCES specimen_types(id));
CREATE TABLE IF NOT EXISTS test_methods(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS test_result_options(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, option_value TEXT NOT NULL, option_label TEXT, display_order INTEGER NOT NULL DEFAULT 1000, is_default INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), UNIQUE(test_id, option_value), FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS test_reference_ranges(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, gender TEXT NOT NULL DEFAULT 'ALL', age_min REAL, age_max REAL, age_unit TEXT NOT NULL DEFAULT 'YEARS', lower_limit REAL, upper_limit REAL, reference_text TEXT, flag_enabled INTEGER NOT NULL DEFAULT 1, critical_low REAL, critical_high REAL, display_order INTEGER NOT NULL DEFAULT 1000, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS test_formulas(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, formula_expression TEXT NOT NULL, rounding_decimals INTEGER NOT NULL DEFAULT 2, allow_manual_override INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(test_id) REFERENCES tests(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS test_formula_variables(id INTEGER PRIMARY KEY AUTOINCREMENT, formula_id INTEGER NOT NULL, variable_key TEXT NOT NULL, source_test_id INTEGER NOT NULL, UNIQUE(formula_id, variable_key), FOREIGN KEY(formula_id) REFERENCES test_formulas(id) ON DELETE CASCADE, FOREIGN KEY(source_test_id) REFERENCES tests(id));
CREATE INDEX IF NOT EXISTS idx_tests_report_order ON tests(department_id, report_order, name);
CREATE INDEX IF NOT EXISTS idx_tests_billing_order ON tests(department_id, billing_order, name);
`);
    this.ensureColumn('test_formulas', 'predefined_formula_key', 'TEXT');
    this.ensureColumn('test_formulas', 'rounding_mode', "TEXT NOT NULL DEFAULT 'NEAREST'");
    this.db.prepare(`UPDATE tests SET input_control_type='OPTION'
      WHERE UPPER(REPLACE(COALESCE(input_control_type,''),'-','_')) IN ('DROPDOWN','RADIO','CHECKBOX','SELECT','OPTION_SELECT','SEARCH_SELECT','SEARCHSELECT')`).run();
    this.backfillTestOrders();
  }

  protected backfillTestOrders() {
    const rows = this.db.prepare('SELECT id, department_id, priority, billing_order, report_order FROM tests ORDER BY COALESCE(department_id,0), priority, name').all() as any[];
    const counters = new Map<string, number>();
    const update = this.db.prepare('UPDATE tests SET billing_order=?, report_order=? WHERE id=?');
    for (const row of rows) {
      const dept = String(row.department_id || 0);
      const next = counters.get(dept) || 1000;
      counters.set(dept, next + 1000);
      const billing = +row.billing_order > 0 ? +row.billing_order : (+row.priority > 0 ? +row.priority * 1000 : next);
      const report = +row.report_order > 0 ? +row.report_order : (+row.priority > 0 ? +row.priority * 1000 : next);
      if (!(+row.billing_order > 0) || !(+row.report_order > 0)) update.run(billing, report, row.id);
    }
  }

  protected nextTestOrder(departmentId: any, column: 'billing_order' | 'report_order') {
    const row = this.db.prepare(`SELECT MAX(${column}) max_order FROM tests WHERE COALESCE(department_id,0)=COALESCE(?,0)`).get(departmentId || null) as any;
    const current = +row?.max_order || 0;
    return current > 0 ? current + 1000 : 1000;
  }

  protected normalizeName(value: string) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  protected richTextPlainText(value: any): string {
    return String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .trim();
  }

  protected hasRichInterpretation(value: any): boolean {
    return !!this.richTextPlainText(value);
  }

  protected findOrCreateMethodId(methodName: string) {
    const name = this.normalizeName(methodName);
    if (!name) return null;
    const existing = this.db.prepare('SELECT id FROM test_methods WHERE lower(name)=lower(?)').get(name) as any;
    if (existing?.id) return existing.id;
    return Number(this.db.prepare('INSERT INTO test_methods(name,is_active,created_at,updated_at) VALUES(?,?,?,?)').run(name, 1, this.nowIst(), this.nowIst()).lastInsertRowid);
  }

  protected ensureNumberSequenceSchema() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS number_sequences(
      kind TEXT PRIMARY KEY,
      next_number INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
    );`);
    this.ensureNumberSequence('patient', 'patients', 'patient_no');
    this.ensureNumberSequence('invoice', 'bills', 'bill_no');
    this.ensureNumberSequence('receipt', 'receipts', 'receipt_no');
  }

  protected ensureNumberSequence(kind: string, table: string, col: string) {
    const existingMax = this.maxExistingNumberForKind(kind, table, col);
    const requiredNext = existingMax + 1;
    const row = this.db.prepare('SELECT next_number FROM number_sequences WHERE kind=?').get(kind) as any;
    if (!row) {
      this.db.prepare('INSERT INTO number_sequences(kind,next_number) VALUES(?,?)').run(kind, requiredNext);
      return;
    }
    if ((+row.next_number || 1) < requiredNext) {
      this.db.prepare('UPDATE number_sequences SET next_number=?,updated_at=? WHERE kind=?').run(requiredNext, this.nowIst(), kind);
    }
  }

  protected maxExistingNumberForKind(kind: string, table: string, col: string) {
    const prefix = this.getSetting(`${kind}.prefix`, kind === 'invoice' ? 'B' : kind === 'patient' ? 'P' : 'R');
    const suffix = this.getSetting(`${kind}.suffix`, '');
    const rows = this.db.prepare(`SELECT ${col} value FROM ${table}`).all() as any[];
    let max = 0;
    for (const row of rows) {
      const value = String(row.value || '');
      if (prefix && !value.startsWith(prefix)) continue;
      if (suffix && !value.endsWith(suffix)) continue;
      const start = prefix.length;
      const end = suffix ? value.length - suffix.length : value.length;
      const numericPart = value.slice(start, end);
      if (!/^\d+$/.test(numericPart)) continue;
      max = Math.max(max, Number(numericPart));
    }
    return max;
  }

  protected ensurePatientDemographicColumns() {
    this.ensureColumn('patients', 'title', 'TEXT');
    this.ensureColumn('patients', 'dob', 'TEXT');
    this.ensureColumn('patients', 'age_value', 'INTEGER');
    this.ensureColumn('patients', 'age_unit', "TEXT NOT NULL DEFAULT 'YEARS'");
    this.ensureColumn('patients', 'relation_type', 'TEXT');
    this.ensureColumn('patients', 'guardian_name', 'TEXT');
    this.ensureColumn('patients', 'guardian_mobile', 'TEXT');
    this.ensureColumn('patients', 'age_split', 'INTEGER NOT NULL DEFAULT 1');
  }

  protected ensureCancellationSchema() {
    this.ensureColumn('bills', 'cancelled_at', 'TEXT');
    this.ensureColumn('bills', 'cancel_reason', 'TEXT');
    this.ensureColumn('bills', 'refund_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bills', 'refund_mode', "TEXT NOT NULL DEFAULT ''");
    this.db.exec(`CREATE TABLE IF NOT EXISTS refunds(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, amount REAL NOT NULL, mode TEXT NOT NULL, reason TEXT, refunded_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), FOREIGN KEY(bill_id) REFERENCES bills(id));`);
  }

  protected ensureBillingDiscountColumns() {
    this.ensureColumn('bills', 'discount_type', "TEXT NOT NULL DEFAULT 'VALUE'");
    this.ensureColumn('bills', 'discount_value', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bills', 'round_mode', "TEXT NOT NULL DEFAULT 'NONE'");
    this.ensureColumn('bills', 'round_off', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bills', 'cash_received', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bills', 'cash_return', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'discount_type', "TEXT NOT NULL DEFAULT 'VALUE'");
    this.ensureColumn('bill_items', 'discount_value', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'discount_amount', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('bill_items', 'net_amount', 'REAL NOT NULL DEFAULT 0');
  }

  protected ensureColumn(table: string, column: string, definition: string) {
    const exists = (this.db.prepare(`PRAGMA table_info(${table})`).all() as any[]).some(c => c.name === column);
    if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }


  protected ensureProfileBuilderSchema() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS profile_items(id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, item_type TEXT NOT NULL DEFAULT 'TEST', test_id INTEGER, child_profile_id INTEGER, header_text TEXT, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, display_profile_name INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE, FOREIGN KEY(test_id) REFERENCES tests(id), FOREIGN KEY(child_profile_id) REFERENCES profiles(id));`);
    this.ensureColumn('profiles', 'display_name', 'TEXT');
    this.ensureColumn('profiles', 'active_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('profiles', 'report_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'interpretation_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'interpretation_text', 'TEXT');
    this.ensureColumn('profiles', 'department_id', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'show_profile_name', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('profiles', 'ordering_mode', "TEXT NOT NULL DEFAULT 'MANUAL'");
    this.ensureColumn('profiles', 'active_for_reporting', 'INTEGER NOT NULL DEFAULT 1');
    this.ensureColumn('profiles', 'billing_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'report_order', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'search_keywords', 'TEXT');
    this.ensureColumn('profiles', 'interpretation_enabled', 'INTEGER NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'interpretation_text', 'TEXT');
    this.ensureColumn('profiles', 'running_cost', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('profiles', 'running_cost_mode', "TEXT NOT NULL DEFAULT 'AUTO'");
    const itemCount = (this.db.prepare('SELECT COUNT(*) count FROM profile_items').get() as any)?.count || 0;
    const legacyCount = (this.db.prepare('SELECT COUNT(*) count FROM profile_tests').get() as any)?.count || 0;
    if (!itemCount && legacyCount) {
      this.db.prepare(`INSERT INTO profile_items(profile_id,item_type,test_id,priority,side_header,display_profile_name)
        SELECT profile_id,'TEST',test_id,priority,side_header,1 FROM profile_tests`).run();
    }
  }

  protected seedDefaults() {
    const defaults: Record<string, string> = {
      'org.name': 'Your Lab Name', 'org.address': 'Lab address', 'org.phone': '', 'org.email': '',
      'report.footer': 'This report is electronically generated.', 'report.background': 'off',
      'backup.path': path.join(app.getPath('documents'), 'LIMS-Professional-Backups'), 'backup.enabled': 'true', 'backup.intervalMinutes': '60',
      'theme': 'dark',
      'patient.prefix': 'P', 'patient.suffix': '', 'patient.padding': '6',
      'invoice.prefix': 'B', 'invoice.suffix': '', 'invoice.padding': '6',
      'receipt.prefix': 'R', 'receipt.suffix': '', 'receipt.padding': '6',
      'patient.honorifics': 'Mr.,Mrs.,Ms.,Miss,Mx.,Baby,Baby Boy,Baby Girl,Master,Kumari,Child,Dr.,Prof.,Rev.,Sr.,Br.,Elder,Baby of',
      'patient.relationTypes': 'Father of,Mother of,Daughter of,Son of,Baby of,Child of,Parent,Guardian,Spouse,Self,Other',
      'patient.requiredFields': 'name',
      'billing.requiredFields': 'items',
      'billing.pdf.logoEnabled': 'false', 'billing.pdf.logoPath': '',
      'billing.pdf.logoPlacement': 'left', 'billing.pdf.logoWidth': '48', 'billing.pdf.logoHeight': '48',
      'billing.pdf.centreName': '', 'billing.pdf.subtitle': 'DIAGNOSTIC CENTRE',
      'billing.pdf.address': '', 'billing.pdf.phone': '', 'billing.pdf.email': '',
      'billing.pdf.invoiceTitle': 'BILL / INVOICE',
      'billing.pdf.footerText': 'This bill is electronically generated.',
      'billing.pdf.thankYouText': 'Thank you for choosing us',
      'billing.pdf.authorisedLabel': 'Authorised Signatory',
      'billing.pdf.fontFamily': 'Roboto', 'billing.pdf.centreNameSize': '24',
      'billing.pdf.subtitleSize': '9', 'billing.pdf.bodySize': '8.8',
      'billing.pdf.patientSize': '9', 'billing.pdf.tableHeaderSize': '8.5',
      'billing.pdf.tableBodySize': '8.5', 'billing.pdf.totalsSize': '9',
      'billing.pdf.footerSize': '8', 'billing.pdf.primaryColor': '#0b3a70',
      'billing.pdf.accentColor': '#0f68b7', 'billing.pdf.textColor': '#0f172a',
      'billing.pdf.borderColor': '#d6e3f2', 'billing.pdf.alternateRowColor': '#f8fbff',
      'billing.pdf.showPhone': 'true', 'billing.pdf.showEmail': 'true',
      'billing.pdf.showAddress': 'true', 'billing.pdf.showPatientAddress': 'true',
      'billing.pdf.showConsultant': 'true', 'billing.pdf.showItemDiscount': 'true',
      'billing.pdf.showAuthorisedSignature': 'true', 'billing.pdf.showThankYou': 'true',
      'analyzer.api.enabled': 'true',
      'analyzer.api.host': '127.0.0.1',
      'analyzer.api.port': '5055',
      'analyzer.api.basePath': '/api/analyzer',
      'analyzer.api.publicUrl': 'http://127.0.0.1:5055/api/analyzer',
      'analyzer.api.logPath': path.join(app.getPath('documents'), 'LIMS-Analyzer-API-Logs')
    };
    Object.entries(defaults).forEach(([k, v]) => { if (this.getSetting(k, '') === '') this.setSetting(k, v); });
    if (((this.db.prepare('SELECT COUNT(*) c FROM departments').get() as any).c) === 0) {
      ['HEMATOLOGY','BIOCHEMISTRY','SEROLOGY','URINE','MICROBIOLOGY'].forEach((name, i) => this.saveDepartment({ name, priority: i + 1, active: 1 }));
      ['mg/dL','g/dL','%','cells/cumm','IU/L','mmol/L','10^3/uL','10^6/uL'].forEach(name => this.saveUnit({ name, active: 1 }));
    }
    this.seedSampleBillingMasters();
    this.seedComprehensiveLabMasters();
  }

  protected seedSampleBillingMasters() {
    const testCount = (this.db.prepare('SELECT COUNT(*) c FROM tests').get() as any).c;
    if (testCount > 0) return;
    const dept = (name: string) => (this.db.prepare('SELECT id FROM departments WHERE name=?').get(name) as any)?.id || null;
    const unit = (name: string) => (this.db.prepare('SELECT id FROM units WHERE name=?').get(name) as any)?.id || null;
    const samples = [
      { code:'HB', name:'Hemoglobin', department_id:dept('HEMATOLOGY'), unit_id:unit('g/dL'), price:120, normal_range:'Male 13-17 / Female 12-15', method:'Photometry', priority:1, side_header:'' },
      { code:'WBC', name:'Total WBC Count', department_id:dept('HEMATOLOGY'), unit_id:unit('cells/cumm'), price:120, normal_range:'4000 - 11000', method:'Automated count', priority:2, side_header:'' },
      { code:'RBC', name:'RBC Count', department_id:dept('HEMATOLOGY'), unit_id:unit('10^6/uL'), price:120, normal_range:'4.5 - 5.5', method:'Automated count', priority:3, side_header:'' },
      { code:'PLT', name:'Platelet Count', department_id:dept('HEMATOLOGY'), unit_id:unit('10^3/uL'), price:120, normal_range:'150 - 450', method:'Automated count', priority:4, side_header:'' },
      { code:'GLU', name:'Blood Sugar Random', department_id:dept('BIOCHEMISTRY'), unit_id:unit('mg/dL'), price:100, normal_range:'70 - 140', method:'GOD-POD', priority:1, side_header:'' },
      { code:'UREA', name:'Urea', department_id:dept('BIOCHEMISTRY'), unit_id:unit('mg/dL'), price:150, normal_range:'15 - 40', method:'Urease', priority:2, side_header:'' },
      { code:'CREA', name:'Creatinine', department_id:dept('BIOCHEMISTRY'), unit_id:unit('mg/dL'), price:150, normal_range:'0.6 - 1.3', method:'Jaffe', priority:3, side_header:'' },
      { code:'SGOT', name:'SGOT / AST', department_id:dept('BIOCHEMISTRY'), unit_id:unit('IU/L'), price:180, normal_range:'Up to 40', method:'IFCC', priority:4, side_header:'' },
      { code:'SGPT', name:'SGPT / ALT', department_id:dept('BIOCHEMISTRY'), unit_id:unit('IU/L'), price:180, normal_range:'Up to 40', method:'IFCC', priority:5, side_header:'' }
    ];
    samples.forEach(t => this.saveTest({ ...t, active: 1, billable: 1 }));
    const testId = (code: string) => (this.db.prepare('SELECT id FROM tests WHERE code=?').get(code) as any)?.id;
    this.saveProfile({ code:'CBC', name:'Complete Blood Count', price:450, priority:1, side_header:'CBC', active:1, billable:1, items:[{ item_type:'HEADER', priority:1, side_header:'CBC' }, ...['HB','WBC','RBC','PLT'].map((code, i)=>({ item_type:'TEST', test_id:testId(code), priority:i+2, side_header:'' }))] });
    this.saveProfile({ code:'RFT', name:'Renal Function Test', price:350, priority:2, side_header:'Renal Function', active:1, billable:1, items:[{ item_type:'HEADER', priority:1, side_header:'Renal Function' }, ...['UREA','CREA'].map((code, i)=>({ item_type:'TEST', test_id:testId(code), priority:i+2, side_header:'' }))] });
    this.saveProfile({ code:'LFT', name:'Liver Function Test Basic', price:450, priority:3, side_header:'Liver Function', active:1, billable:1, items:[{ item_type:'HEADER', priority:1, side_header:'Liver Function' }, ...['SGOT','SGPT'].map((code, i)=>({ item_type:'TEST', test_id:testId(code), priority:i+2, side_header:'' }))] });
  }


  protected seedComprehensiveLabMasters() {
    const seedKey = 'seed.comprehensiveLabMasters.v1';
    if (this.getSetting(seedKey, '') === 'DONE') return;

    const ensureDepartment = (name: string, priority: number) => {
      const existing = this.db.prepare('SELECT id FROM departments WHERE lower(name)=lower(?) LIMIT 1').get(name) as any;
      if (existing?.id) return existing.id;
      this.db.prepare('INSERT INTO departments(name,priority,active) VALUES(?,?,1)').run(name, priority);
      return (this.db.prepare('SELECT id FROM departments WHERE lower(name)=lower(?) LIMIT 1').get(name) as any)?.id;
    };
    const ensureUnit = (name: string) => {
      const existing = this.db.prepare('SELECT id FROM units WHERE lower(name)=lower(?) LIMIT 1').get(name) as any;
      if (existing?.id) return existing.id;
      this.db.prepare('INSERT INTO units(name,active) VALUES(?,1)').run(name);
      return (this.db.prepare('SELECT id FROM units WHERE lower(name)=lower(?) LIMIT 1').get(name) as any)?.id;
    };
    const ensureSpecimen = (name: string, code: string) => {
      const existing = this.db.prepare('SELECT id FROM specimen_types WHERE lower(name)=lower(?) LIMIT 1').get(name) as any;
      if (existing?.id) return existing.id;
      this.db.prepare('INSERT INTO specimen_types(name,code,is_active,created_at,updated_at) VALUES(?,?,?,?,?)').run(name, code, 1, this.nowIst(), this.nowIst());
      return (this.db.prepare('SELECT id FROM specimen_types WHERE lower(name)=lower(?) LIMIT 1').get(name) as any)?.id;
    };
    const dept: Record<string, number> = {
      HEM: ensureDepartment('HEMATOLOGY', 1),
      BIO: ensureDepartment('BIOCHEMISTRY', 2),
      SER: ensureDepartment('SEROLOGY', 3),
      URI: ensureDepartment('URINE', 4),
      MIC: ensureDepartment('MICROBIOLOGY', 5),
      IMM: ensureDepartment('IMMUNOLOGY', 6),
      COAG: ensureDepartment('COAGULATION', 7)
    };
    const unit: Record<string, number> = {};
    ['mg/dL','g/dL','%','cells/cumm','IU/L','U/L','mmol/L','mEq/L','10^3/uL','10^6/uL','/HPF','/LPF','Ratio','seconds','INR','uIU/mL','ng/mL','pg/mL','U/mL','Index','mg/L','mL/min/1.73m2'].forEach(u => unit[u] = ensureUnit(u));
    const spec: Record<string, number> = {
      serum: ensureSpecimen('Serum', 'SER'),
      sst: ensureSpecimen('SST / Gel Serum', 'SST'),
      plasma: ensureSpecimen('Plasma', 'PLA'),
      fluoride: ensureSpecimen('Fluoride Plasma', 'FLU'),
      edta: ensureSpecimen('EDTA Whole Blood', 'EDTA'),
      whole: ensureSpecimen('Whole Blood', 'WB'),
      cit32: ensureSpecimen('Citrate 3.2% Plasma', 'CIT32'),
      cit38: ensureSpecimen('Citrate 3.8% Plasma', 'CIT38'),
      heparin: ensureSpecimen('Heparin Plasma', 'HEP'),
      urine: ensureSpecimen('Urine', 'URI'),
      stool: ensureSpecimen('Stool', 'STL'),
      swab: ensureSpecimen('Swab', 'SWB'),
      nasal: ensureSpecimen('Nasal Swab', 'NSW'),
      throat: ensureSpecimen('Throat Swab', 'TSW')
    };
    const existingTestId = (code: string) => (this.db.prepare('SELECT id FROM tests WHERE lower(code)=lower(?) LIMIT 1').get(code) as any)?.id || 0;
    const testId = (code: string) => existingTestId(code);
    const ref = (low: any, high: any, text: string, criticalLow: any = null, criticalHigh: any = null) => ({ gender:'ALL', lower_limit: low, upper_limit: high, reference_text: text, critical_low: criticalLow, critical_high: criticalHigh, flag_enabled: 1, is_active: 1 });
    const opt = (...values: string[]) => values.map((v, i) => ({ option_value: v, option_label: v, display_order: (i + 1) * 1000, is_active: 1 }));
    const save = (t: any) => {
      const id = existingTestId(t.code);
      const payload = { id, active: 1, billable: 1, active_for_reporting: t.active_for_reporting === false ? 0 : 1, commission_allowed: t.commission_allowed === false ? 0 : 1, result_data_type: 'NUMBER', input_control_type: 'TEXTBOX', result_mode: 'DIRECT', decimal_places: 2, rounding_mode: 'NEAREST', number_format: 'NONE', same_specimen_allowed: true, ...t };
      this.saveTest(payload);
      return existingTestId(t.code);
    };

    const tests: any[] = [
      { code:'HB', name:'Hemoglobin', department_id:dept.HEM, unit_id:unit['g/dL'], price:120, method:'Photometry', priority:1, report_order:1000, normal_range:'Male 13-17 / Female 12-15', reference_ranges:[ref(12,17,'Male 13-17 / Female 12-15',7,20)], specimen_ids:[spec.edta], decimal_places:1, highlight_parameter:1, search_keywords:'hb haemoglobin hemoglobin cbc' },
      { code:'HCT', name:'Packed Cell Volume / Hematocrit', display_name:'PCV / Hematocrit', department_id:dept.HEM, unit_id:unit['%'], price:100, method:'Calculated', priority:2, report_order:2000, normal_range:'36 - 50', reference_ranges:[ref(36,50,'36 - 50 %')], specimen_ids:[spec.edta], decimal_places:1 },
      { code:'RBC', name:'RBC Count', department_id:dept.HEM, unit_id:unit['10^6/uL'], price:120, method:'Automated count', priority:3, report_order:3000, normal_range:'4.0 - 5.5', reference_ranges:[ref(4,5.5,'4.0 - 5.5')], specimen_ids:[spec.edta], decimal_places:2 },
      { code:'WBC', name:'Total WBC Count', department_id:dept.HEM, unit_id:unit['cells/cumm'], price:120, method:'Automated count', priority:4, report_order:4000, normal_range:'4000 - 11000', reference_ranges:[ref(4000,11000,'4000 - 11000',2000,30000)], specimen_ids:[spec.edta], decimal_places:0, highlight_parameter:1 },
      { code:'PLT', name:'Platelet Count', department_id:dept.HEM, unit_id:unit['10^3/uL'], price:120, method:'Automated count', priority:5, report_order:5000, normal_range:'150 - 450', reference_ranges:[ref(150,450,'150 - 450',50,1000)], specimen_ids:[spec.edta], decimal_places:0, highlight_parameter:1 },
      { code:'MCV', name:'MCV', department_id:dept.HEM, unit_id:unit['pg/mL'], price:80, method:'Calculated', priority:6, report_order:6000, normal_range:'80 - 100', reference_ranges:[ref(80,100,'80 - 100 fL')], specimen_ids:[spec.edta], decimal_places:1 },
      { code:'MCH', name:'MCH', department_id:dept.HEM, unit_id:unit['pg/mL'], price:80, method:'Calculated', priority:7, report_order:7000, normal_range:'27 - 33', reference_ranges:[ref(27,33,'27 - 33 pg')], specimen_ids:[spec.edta], decimal_places:1 },
      { code:'MCHC', name:'MCHC', department_id:dept.HEM, unit_id:unit['g/dL'], price:80, method:'Calculated', priority:8, report_order:8000, normal_range:'32 - 36', reference_ranges:[ref(32,36,'32 - 36 g/dL')], specimen_ids:[spec.edta], decimal_places:1 },
      { code:'RDW', name:'RDW-CV', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Automated count', priority:9, report_order:9000, normal_range:'11.5 - 14.5', reference_ranges:[ref(11.5,14.5,'11.5 - 14.5 %')], specimen_ids:[spec.edta], decimal_places:1 },
      { code:'NEUT', name:'Neutrophils', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Differential count', priority:10, report_order:10000, normal_range:'40 - 75', reference_ranges:[ref(40,75,'40 - 75 %')], specimen_ids:[spec.edta], decimal_places:0 },
      { code:'LYMPH', name:'Lymphocytes', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Differential count', priority:11, report_order:11000, normal_range:'20 - 45', reference_ranges:[ref(20,45,'20 - 45 %')], specimen_ids:[spec.edta], decimal_places:0 },
      { code:'EOS', name:'Eosinophils', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Differential count', priority:12, report_order:12000, normal_range:'1 - 6', reference_ranges:[ref(1,6,'1 - 6 %')], specimen_ids:[spec.edta], decimal_places:0 },
      { code:'MONO', name:'Monocytes', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Differential count', priority:13, report_order:13000, normal_range:'2 - 10', reference_ranges:[ref(2,10,'2 - 10 %')], specimen_ids:[spec.edta], decimal_places:0 },
      { code:'BASO', name:'Basophils', department_id:dept.HEM, unit_id:unit['%'], price:80, method:'Differential count', priority:14, report_order:14000, normal_range:'0 - 1', reference_ranges:[ref(0,1,'0 - 1 %')], specimen_ids:[spec.edta], decimal_places:0 },
      { code:'ESR', name:'ESR', display_name:'Erythrocyte Sedimentation Rate', department_id:dept.HEM, unit_id:unit['mmol/L'], price:120, method:'Westergren', priority:15, report_order:15000, normal_range:'Male 0-15 / Female 0-20', reference_ranges:[ref(null,20,'Male 0-15 / Female 0-20 mm/hr')], specimen_ids:[spec.cit32, spec.edta], decimal_places:0, search_keywords:'esr westergren' },

      { code:'GLU_F', name:'Blood Sugar Fasting', department_id:dept.BIO, unit_id:unit['mg/dL'], price:100, method:'GOD-POD', priority:1, report_order:101000, normal_range:'70 - 100', reference_ranges:[ref(70,100,'70 - 100')], specimen_ids:[spec.fluoride, spec.serum], decimal_places:0, collection_rule:'FASTING', fasting_hours:8, collection_instruction:'Collect after 8-12 hours fasting.', highlight_parameter:1, search_keywords:'fbs fasting glucose sugar' },
      { code:'GLU_PP', name:'Blood Sugar Post Prandial', display_name:'Blood Sugar PP', department_id:dept.BIO, unit_id:unit['mg/dL'], price:100, method:'GOD-POD', priority:2, report_order:102000, normal_range:'Less than 140', reference_ranges:[ref(null,140,'Less than 140')], specimen_ids:[spec.fluoride, spec.serum], decimal_places:0, collection_rule:'POST_PRANDIAL', collection_gap_minutes:120, collection_dependency:'MEAL_TIME', same_specimen_allowed:false, collection_instruction:'Collect 2 hours after meal.', highlight_parameter:1, search_keywords:'ppbs post prandial glucose sugar' },
      { code:'GLU_R', name:'Blood Sugar Random', department_id:dept.BIO, unit_id:unit['mg/dL'], price:100, method:'GOD-POD', priority:3, report_order:103000, normal_range:'70 - 140', reference_ranges:[ref(70,140,'70 - 140')], specimen_ids:[spec.fluoride, spec.serum], decimal_places:0, search_keywords:'rbs random glucose sugar' },
      { code:'HBA1C', name:'HbA1c', display_name:'Glycated Hemoglobin', department_id:dept.BIO, unit_id:unit['%'], price:450, method:'HPLC / Immunoturbidimetry', priority:4, report_order:104000, normal_range:'Less than 5.7', reference_ranges:[ref(null,5.7,'Normal <5.7, Prediabetes 5.7-6.4, Diabetes >=6.5')], specimen_ids:[spec.edta], decimal_places:1, highlight_parameter:1, search_keywords:'hba1c glycosylated glycated diabetes' },

      { code:'UREA', name:'Urea', department_id:dept.BIO, unit_id:unit['mg/dL'], price:150, method:'Urease', priority:20, report_order:120000, normal_range:'15 - 40', reference_ranges:[ref(15,40,'15 - 40')], specimen_ids:[spec.serum, spec.heparin], decimal_places:1, highlight_parameter:1 },
      { code:'CREA', name:'Creatinine', department_id:dept.BIO, unit_id:unit['mg/dL'], price:150, method:'Jaffe / Enzymatic', priority:21, report_order:121000, normal_range:'0.6 - 1.3', reference_ranges:[ref(0.6,1.3,'0.6 - 1.3',0.3,5)], specimen_ids:[spec.serum, spec.heparin], decimal_places:2, highlight_parameter:1 },
      { code:'UA', name:'Uric Acid', department_id:dept.BIO, unit_id:unit['mg/dL'], price:180, method:'Uricase', priority:22, report_order:122000, normal_range:'3.5 - 7.2', reference_ranges:[ref(3.5,7.2,'3.5 - 7.2')], specimen_ids:[spec.serum], decimal_places:1 },
      { code:'BUN', name:'Blood Urea Nitrogen', department_id:dept.BIO, unit_id:unit['mg/dL'], price:100, method:'Calculated', priority:23, report_order:123000, normal_range:'7 - 20', reference_ranges:[ref(7,20,'7 - 20')], specimen_ids:[spec.serum], decimal_places:1, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'UREA / 2.14', formula_variables:[{variable_key:'UREA', source_test_id:0}], allow_manual_override:true },
      { code:'EGFR', name:'eGFR', display_name:'eGFR (CKD-EPI)', department_id:dept.BIO, unit_id:unit['mL/min/1.73m2'], price:0, method:'Calculated', priority:24, report_order:124000, normal_range:'> 90', reference_ranges:[ref(90,null,'> 90')], specimen_ids:[spec.serum], decimal_places:0, predefined_formula_key:'EGFR_CKD_EPI', collection_instruction:'Use creatinine with patient age and gender. Other/unknown gender can use male fallback if configured.', search_keywords:'egfr ckd epi creatinine' },
      { code:'NA', name:'Sodium', department_id:dept.BIO, unit_id:unit['mEq/L'], price:150, method:'ISE', priority:25, report_order:125000, normal_range:'135 - 145', reference_ranges:[ref(135,145,'135 - 145',120,160)], specimen_ids:[spec.serum, spec.heparin], decimal_places:1, highlight_parameter:1 },
      { code:'K', name:'Potassium', department_id:dept.BIO, unit_id:unit['mEq/L'], price:150, method:'ISE', priority:26, report_order:126000, normal_range:'3.5 - 5.1', reference_ranges:[ref(3.5,5.1,'3.5 - 5.1',2.5,6.5)], specimen_ids:[spec.serum, spec.heparin], decimal_places:1, highlight_parameter:1 },
      { code:'CL', name:'Chloride', department_id:dept.BIO, unit_id:unit['mEq/L'], price:150, method:'ISE', priority:27, report_order:127000, normal_range:'98 - 107', reference_ranges:[ref(98,107,'98 - 107')], specimen_ids:[spec.serum, spec.heparin], decimal_places:1 },
      { code:'CA', name:'Calcium', department_id:dept.BIO, unit_id:unit['mg/dL'], price:180, method:'Arsenazo III', priority:28, report_order:128000, normal_range:'8.6 - 10.2', reference_ranges:[ref(8.6,10.2,'8.6 - 10.2')], specimen_ids:[spec.serum], decimal_places:1 },
      { code:'PHOS', name:'Phosphorus', department_id:dept.BIO, unit_id:unit['mg/dL'], price:180, method:'UV', priority:29, report_order:129000, normal_range:'2.5 - 4.5', reference_ranges:[ref(2.5,4.5,'2.5 - 4.5')], specimen_ids:[spec.serum], decimal_places:1 },

      { code:'TC', name:'Total Cholesterol', department_id:dept.BIO, unit_id:unit['mg/dL'], price:180, method:'CHOD-PAP', priority:40, report_order:140000, normal_range:'Desirable < 200', reference_ranges:[ref(null,200,'Desirable < 200')], specimen_ids:[spec.serum], decimal_places:0, collection_rule:'FASTING', fasting_hours:8, highlight_parameter:1 },
      { code:'TG', name:'Triglycerides', department_id:dept.BIO, unit_id:unit['mg/dL'], price:180, method:'GPO-PAP', priority:41, report_order:141000, normal_range:'Normal < 150', reference_ranges:[ref(null,150,'Normal < 150')], specimen_ids:[spec.serum], decimal_places:0, collection_rule:'FASTING', fasting_hours:8, highlight_parameter:1 },
      { code:'HDL', name:'HDL Cholesterol', department_id:dept.BIO, unit_id:unit['mg/dL'], price:220, method:'Direct', priority:42, report_order:142000, normal_range:'> 40', reference_ranges:[ref(40,null,'> 40')], specimen_ids:[spec.serum], decimal_places:0, collection_rule:'FASTING', fasting_hours:8, highlight_parameter:1 },
      { code:'LDL', name:'LDL Cholesterol', department_id:dept.BIO, unit_id:unit['mg/dL'], price:0, method:'Calculated - Friedewald', priority:43, report_order:143000, normal_range:'Optimal < 100', reference_ranges:[ref(null,100,'Optimal < 100')], specimen_ids:[spec.serum], decimal_places:0, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TC - HDL - (TG / 5)', formula_variables:[{variable_key:'TC', source_test_id:0},{variable_key:'HDL', source_test_id:0},{variable_key:'TG', source_test_id:0}], allow_manual_override:true, highlight_parameter:1 },
      { code:'VLDL', name:'VLDL Cholesterol', department_id:dept.BIO, unit_id:unit['mg/dL'], price:0, method:'Calculated', priority:44, report_order:144000, normal_range:'5 - 40', reference_ranges:[ref(5,40,'5 - 40')], specimen_ids:[spec.serum], decimal_places:0, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TG / 5', formula_variables:[{variable_key:'TG', source_test_id:0}], allow_manual_override:true },
      { code:'NONHDL', name:'Non-HDL Cholesterol', department_id:dept.BIO, unit_id:unit['mg/dL'], price:0, method:'Calculated', priority:45, report_order:145000, normal_range:'< 130', reference_ranges:[ref(null,130,'< 130')], specimen_ids:[spec.serum], decimal_places:0, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TC - HDL', formula_variables:[{variable_key:'TC', source_test_id:0},{variable_key:'HDL', source_test_id:0}], allow_manual_override:true },
      { code:'TC_HDL', name:'Total Cholesterol / HDL Ratio', department_id:dept.BIO, unit_id:unit['Ratio'], price:0, method:'Calculated', priority:46, report_order:146000, normal_range:'< 5.0', reference_ranges:[ref(null,5,'< 5.0')], specimen_ids:[spec.serum], decimal_places:2, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TC / HDL', formula_variables:[{variable_key:'TC', source_test_id:0},{variable_key:'HDL', source_test_id:0}], allow_manual_override:true },

      { code:'TBIL', name:'Bilirubin Total', department_id:dept.BIO, unit_id:unit['mg/dL'], price:160, method:'Diazo', priority:60, report_order:160000, normal_range:'0.2 - 1.2', reference_ranges:[ref(0.2,1.2,'0.2 - 1.2')], specimen_ids:[spec.serum], decimal_places:2, highlight_parameter:1 },
      { code:'DBIL', name:'Bilirubin Direct', department_id:dept.BIO, unit_id:unit['mg/dL'], price:160, method:'Diazo', priority:61, report_order:161000, normal_range:'0.0 - 0.3', reference_ranges:[ref(0,0.3,'0.0 - 0.3')], specimen_ids:[spec.serum], decimal_places:2 },
      { code:'IBIL', name:'Bilirubin Indirect', department_id:dept.BIO, unit_id:unit['mg/dL'], price:0, method:'Calculated', priority:62, report_order:162000, normal_range:'0.2 - 0.9', reference_ranges:[ref(0.2,0.9,'0.2 - 0.9')], specimen_ids:[spec.serum], decimal_places:2, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TBIL - DBIL', formula_variables:[{variable_key:'TBIL', source_test_id:0},{variable_key:'DBIL', source_test_id:0}], allow_manual_override:true },
      { code:'SGOT', name:'SGOT / AST', department_id:dept.BIO, unit_id:unit['U/L'], price:180, method:'IFCC', priority:63, report_order:163000, normal_range:'Up to 40', reference_ranges:[ref(null,40,'Up to 40')], specimen_ids:[spec.serum], decimal_places:0, highlight_parameter:1 },
      { code:'SGPT', name:'SGPT / ALT', department_id:dept.BIO, unit_id:unit['U/L'], price:180, method:'IFCC', priority:64, report_order:164000, normal_range:'Up to 40', reference_ranges:[ref(null,40,'Up to 40')], specimen_ids:[spec.serum], decimal_places:0, highlight_parameter:1 },
      { code:'ALP', name:'Alkaline Phosphatase', department_id:dept.BIO, unit_id:unit['U/L'], price:180, method:'IFCC', priority:65, report_order:165000, normal_range:'40 - 129', reference_ranges:[ref(40,129,'40 - 129')], specimen_ids:[spec.serum], decimal_places:0 },
      { code:'GGT', name:'Gamma GT', display_name:'GGT', department_id:dept.BIO, unit_id:unit['U/L'], price:220, method:'IFCC', priority:66, report_order:166000, normal_range:'Up to 55', reference_ranges:[ref(null,55,'Up to 55')], specimen_ids:[spec.serum], decimal_places:0 },
      { code:'TPROT', name:'Total Protein', department_id:dept.BIO, unit_id:unit['g/dL'], price:160, method:'Biuret', priority:67, report_order:167000, normal_range:'6.4 - 8.3', reference_ranges:[ref(6.4,8.3,'6.4 - 8.3')], specimen_ids:[spec.serum], decimal_places:1 },
      { code:'ALB', name:'Albumin', department_id:dept.BIO, unit_id:unit['g/dL'], price:160, method:'BCG', priority:68, report_order:168000, normal_range:'3.5 - 5.2', reference_ranges:[ref(3.5,5.2,'3.5 - 5.2')], specimen_ids:[spec.serum], decimal_places:1 },
      { code:'GLOB', name:'Globulin', department_id:dept.BIO, unit_id:unit['g/dL'], price:0, method:'Calculated', priority:69, report_order:169000, normal_range:'2.0 - 3.5', reference_ranges:[ref(2,3.5,'2.0 - 3.5')], specimen_ids:[spec.serum], decimal_places:1, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'TPROT - ALB', formula_variables:[{variable_key:'TPROT', source_test_id:0},{variable_key:'ALB', source_test_id:0}], allow_manual_override:true },
      { code:'AGRATIO', name:'A/G Ratio', department_id:dept.BIO, unit_id:unit['Ratio'], price:0, method:'Calculated', priority:70, report_order:170000, normal_range:'1.0 - 2.2', reference_ranges:[ref(1,2.2,'1.0 - 2.2')], specimen_ids:[spec.serum], decimal_places:2, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression:'ALB / GLOB', formula_variables:[{variable_key:'ALB', source_test_id:0},{variable_key:'GLOB', source_test_id:0}], allow_manual_override:true },

      { code:'TSH', name:'TSH', department_id:dept.IMM, unit_id:unit['uIU/mL'], price:350, method:'CLIA / ELISA', priority:1, report_order:301000, normal_range:'0.35 - 5.5', reference_ranges:[ref(0.35,5.5,'0.35 - 5.5')], specimen_ids:[spec.serum], decimal_places:2, highlight_parameter:1 },
      { code:'T3', name:'T3', department_id:dept.IMM, unit_id:unit['ng/mL'], price:300, method:'CLIA / ELISA', priority:2, report_order:302000, normal_range:'0.8 - 2.0', reference_ranges:[ref(0.8,2,'0.8 - 2.0')], specimen_ids:[spec.serum], decimal_places:2 },
      { code:'T4', name:'T4', department_id:dept.IMM, unit_id:unit['ug/dL'] || ensureUnit('ug/dL'), price:300, method:'CLIA / ELISA', priority:3, report_order:303000, normal_range:'5.0 - 12.0', reference_ranges:[ref(5,12,'5.0 - 12.0')], specimen_ids:[spec.serum], decimal_places:2 },
      { code:'FT3', name:'Free T3', department_id:dept.IMM, unit_id:unit['pg/mL'], price:350, method:'CLIA / ELISA', priority:4, report_order:304000, normal_range:'2.3 - 4.2', reference_ranges:[ref(2.3,4.2,'2.3 - 4.2')], specimen_ids:[spec.serum], decimal_places:2 },
      { code:'FT4', name:'Free T4', department_id:dept.IMM, unit_id:unit['ng/mL'], price:350, method:'CLIA / ELISA', priority:5, report_order:305000, normal_range:'0.8 - 1.8', reference_ranges:[ref(0.8,1.8,'0.8 - 1.8')], specimen_ids:[spec.serum], decimal_places:2 },

      { code:'UR_COLOR', name:'Urine Colour', department_id:dept.URI, unit_id:null, price:20, method:'Physical examination', priority:1, report_order:401000, normal_range:'Pale yellow', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Pale yellow','Yellow','Dark yellow','Amber','Red','Brown'), decimal_places:0 },
      { code:'UR_APP', name:'Urine Appearance', department_id:dept.URI, unit_id:null, price:20, method:'Physical examination', priority:2, report_order:402000, normal_range:'Clear', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Clear','Slightly turbid','Turbid'), decimal_places:0 },
      { code:'UR_PH', name:'Urine Reaction / pH', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:3, report_order:403000, normal_range:'5.0 - 8.0', reference_ranges:[ref(5,8,'5.0 - 8.0')], specimen_ids:[spec.urine], decimal_places:1 },
      { code:'UR_SG', name:'Specific Gravity', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick / Refractometer', priority:4, report_order:404000, normal_range:'1.005 - 1.030', reference_ranges:[ref(1.005,1.03,'1.005 - 1.030')], specimen_ids:[spec.urine], decimal_places:3 },
      { code:'UR_PRO', name:'Urine Protein', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:5, report_order:405000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Trace','+','++','+++','++++'), decimal_places:0, highlight_parameter:1 },
      { code:'UR_GLU', name:'Urine Glucose', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:6, report_order:406000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Trace','+','++','+++','++++'), decimal_places:0, highlight_parameter:1 },
      { code:'UR_KET', name:'Urine Ketone', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:7, report_order:407000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Trace','+','++','+++'), decimal_places:0 },
      { code:'UR_BIL', name:'Urine Bilirubin', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:8, report_order:408000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive'), decimal_places:0 },
      { code:'UR_UBG', name:'Urobilinogen', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:9, report_order:409000, normal_range:'Normal', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Normal','Increased','Decreased'), decimal_places:0 },
      { code:'UR_NIT', name:'Nitrite', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:10, report_order:410000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive'), decimal_places:0 },
      { code:'UR_LEU', name:'Leukocyte Esterase', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:11, report_order:411000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Trace','+','++','+++'), decimal_places:0 },
      { code:'UR_BLOOD', name:'Occult Blood', department_id:dept.URI, unit_id:null, price:20, method:'Dipstick', priority:12, report_order:412000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Trace','+','++','+++'), decimal_places:0 },
      { code:'UR_PUS', name:'Pus Cells', department_id:dept.URI, unit_id:unit['/HPF'], price:30, method:'Microscopy', priority:13, report_order:413000, normal_range:'0 - 5 /HPF', reference_ranges:[ref(0,5,'0 - 5 /HPF')], specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'TEXTBOX', decimal_places:0, highlight_parameter:1 },
      { code:'UR_RBC', name:'RBCs in Urine', department_id:dept.URI, unit_id:unit['/HPF'], price:30, method:'Microscopy', priority:14, report_order:414000, normal_range:'0 - 2 /HPF', reference_ranges:[ref(0,2,'0 - 2 /HPF')], specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'TEXTBOX', decimal_places:0, highlight_parameter:1 },
      { code:'UR_EPI', name:'Epithelial Cells', department_id:dept.URI, unit_id:unit['/HPF'], price:30, method:'Microscopy', priority:15, report_order:415000, normal_range:'Few', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Nil','Few','Moderate','Plenty'), decimal_places:0 },
      { code:'UR_CAST', name:'Casts', department_id:dept.URI, unit_id:null, price:30, method:'Microscopy', priority:16, report_order:416000, normal_range:'Nil', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'TEXTBOX', options:opt('Nil','Hyaline','Granular','RBC cast','WBC cast'), decimal_places:0 },
      { code:'UR_CRYS', name:'Crystals', department_id:dept.URI, unit_id:null, price:30, method:'Microscopy', priority:17, report_order:417000, normal_range:'Nil', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'TEXTBOX', options:opt('Nil','Calcium oxalate','Uric acid','Triple phosphate','Amorphous'), decimal_places:0 },
      { code:'UR_BACT', name:'Bacteria', department_id:dept.URI, unit_id:null, price:30, method:'Microscopy', priority:18, report_order:418000, normal_range:'Nil', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Nil','Occasional','Few','Moderate','Plenty'), decimal_places:0 },

      { code:'DENGUE_NS1', name:'Dengue NS1 Antigen', department_id:dept.SER, unit_id:null, price:450, method:'Rapid card', priority:1, report_order:501000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'DENGUE_IGM', name:'Dengue IgM', department_id:dept.SER, unit_id:null, price:450, method:'Rapid card', priority:2, report_order:502000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'DENGUE_IGG', name:'Dengue IgG', department_id:dept.SER, unit_id:null, price:450, method:'Rapid card', priority:3, report_order:503000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid') },
      { code:'MP_PF', name:'Malaria Parasite P. falciparum', display_name:'Malaria Pf', department_id:dept.SER, unit_id:null, price:300, method:'Rapid card', priority:4, report_order:504000, normal_range:'Negative', specimen_ids:[spec.edta, spec.whole], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'MP_PV', name:'Malaria Parasite P. vivax', display_name:'Malaria Pv', department_id:dept.SER, unit_id:null, price:300, method:'Rapid card', priority:5, report_order:505000, normal_range:'Negative', specimen_ids:[spec.edta, spec.whole], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'HBSAG', name:'HBsAg', department_id:dept.SER, unit_id:null, price:350, method:'Rapid card', priority:6, report_order:506000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'HCV', name:'Anti HCV', department_id:dept.SER, unit_id:null, price:500, method:'Rapid card', priority:7, report_order:507000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid') },
      { code:'HIV', name:'HIV I & II', department_id:dept.SER, unit_id:null, price:500, method:'Rapid card', priority:8, report_order:508000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid') },
      { code:'UPT', name:'Urine Pregnancy Test', department_id:dept.SER, unit_id:null, price:150, method:'Rapid card', priority:9, report_order:509000, normal_range:'Negative', specimen_ids:[spec.urine], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), search_keywords:'upt urine pregnancy card' },
      { code:'CRP_Q', name:'CRP Qualitative', department_id:dept.SER, unit_id:null, price:250, method:'Latex / Rapid', priority:10, report_order:510000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive') },
      { code:'CRP', name:'CRP Quantitative', department_id:dept.SER, unit_id:unit['mg/L'], price:450, method:'Turbidimetry', priority:11, report_order:511000, normal_range:'< 6', reference_ranges:[ref(null,6,'< 6')], specimen_ids:[spec.serum], decimal_places:1 },
      { code:'RA_Q', name:'RA Factor Qualitative', department_id:dept.SER, unit_id:null, price:250, method:'Latex', priority:12, report_order:512000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive') },
      { code:'ASO_Q', name:'ASO Qualitative', department_id:dept.SER, unit_id:null, price:250, method:'Latex', priority:13, report_order:513000, normal_range:'Negative', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive') },
      { code:'TROP_I', name:'Troponin I', department_id:dept.SER, unit_id:null, price:800, method:'Rapid card', priority:14, report_order:514000, normal_range:'Negative', specimen_ids:[spec.serum, spec.heparin], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('Negative','Positive','Invalid'), highlight_parameter:1 },
      { code:'WIDAL_TO', name:'Widal TO', department_id:dept.SER, unit_id:null, price:120, method:'Slide / Tube agglutination', priority:15, report_order:515000, normal_range:'< 1:80', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('<1:20','1:20','1:40','1:80','1:160','1:320') },
      { code:'WIDAL_TH', name:'Widal TH', department_id:dept.SER, unit_id:null, price:120, method:'Slide / Tube agglutination', priority:16, report_order:516000, normal_range:'< 1:80', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('<1:20','1:20','1:40','1:80','1:160','1:320') },
      { code:'WIDAL_AH', name:'Widal AH', department_id:dept.SER, unit_id:null, price:120, method:'Slide / Tube agglutination', priority:17, report_order:517000, normal_range:'< 1:80', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('<1:20','1:20','1:40','1:80','1:160','1:320') },
      { code:'WIDAL_BH', name:'Widal BH', department_id:dept.SER, unit_id:null, price:120, method:'Slide / Tube agglutination', priority:18, report_order:518000, normal_range:'< 1:80', specimen_ids:[spec.serum], result_data_type:'TEXT', input_control_type:'OPTION', options:opt('<1:20','1:20','1:40','1:80','1:160','1:320') },

      { code:'PT', name:'Prothrombin Time', department_id:dept.COAG, unit_id:unit['seconds'], price:250, method:'Coagulation', priority:1, report_order:601000, normal_range:'11 - 15', reference_ranges:[ref(11,15,'11 - 15 sec')], specimen_ids:[spec.cit32, spec.cit38], decimal_places:1, highlight_parameter:1 },
      { code:'INR', name:'INR', department_id:dept.COAG, unit_id:unit['INR'], price:0, method:'Calculated / Instrument', priority:2, report_order:602000, normal_range:'0.8 - 1.2', reference_ranges:[ref(0.8,1.2,'0.8 - 1.2')], specimen_ids:[spec.cit32, spec.cit38], decimal_places:2, highlight_parameter:1 },
      { code:'APTT', name:'APTT', department_id:dept.COAG, unit_id:unit['seconds'], price:300, method:'Coagulation', priority:3, report_order:603000, normal_range:'25 - 35', reference_ranges:[ref(25,35,'25 - 35 sec')], specimen_ids:[spec.cit32], decimal_places:1 }
    ];

    tests.forEach(save);
    const formulaUpdates: any[] = [
      ['BUN', 'UREA / 2.14', [['UREA','UREA']]],
      ['LDL', 'TC - HDL - (TG / 5)', [['TC','TC'],['HDL','HDL'],['TG','TG']]],
      ['VLDL', 'TG / 5', [['TG','TG']]],
      ['NONHDL', 'TC - HDL', [['TC','TC'],['HDL','HDL']]],
      ['TC_HDL', 'TC / HDL', [['TC','TC'],['HDL','HDL']]],
      ['IBIL', 'TBIL - DBIL', [['TBIL','TBIL'],['DBIL','DBIL']]],
      ['GLOB', 'TPROT - ALB', [['TPROT','TPROT'],['ALB','ALB']]],
      ['AGRATIO', 'ALB / GLOB', [['ALB','ALB'],['GLOB','GLOB']]]
    ];
    formulaUpdates.forEach(([code, expr, vars]) => {
      const row = this.db.prepare('SELECT * FROM tests WHERE code=?').get(code) as any;
      if (!row?.id) return;
      this.saveTest({ ...row, id: row.id, active: 1, billable: row.billable !== 0, active_for_reporting: 1, result_data_type:'CALCULATED', result_mode:'CALCULATED', formula_expression: expr, formula_variables: (vars as any[]).map(([key, src]) => ({ variable_key:key, source_test_id:testId(src) })).filter(v => v.source_test_id), allow_manual_override: true, specimen_ids: (this.db.prepare('SELECT specimen_type_id FROM test_specimen_mappings WHERE test_id=? ORDER BY display_order').all(row.id) as any[]).map(x => x.specimen_type_id) });
    });

    const profileId = (code: string) => (this.db.prepare('SELECT id FROM profiles WHERE lower(code)=lower(?) LIMIT 1').get(code) as any)?.id || 0;
    const upsertProfile = (p: any) => {
      const id = profileId(p.code);
      const items = (p.items || []).map((it: any, i: number) => {
        const priority = it.priority || (i + 1) * 1000;
        if (it.item_type === 'HEADER') return { item_type:'HEADER', header_text:it.header_text || it.side_header || '', side_header:it.side_header || it.header_text || '', priority };
        if (it.item_type === 'PROFILE') return { item_type:'PROFILE', profile_id:profileId(it.code), child_profile_id:profileId(it.code), display_profile_name: it.display_profile_name !== false, priority };
        return { item_type:'TEST', test_id:testId(it.code), priority };
      }).filter((it:any) => it.item_type === 'HEADER' || it.test_id || it.profile_id || it.child_profile_id);
      this.saveProfile({ id, code:p.code, name:p.name, display_name:p.display_name || p.name, department_id:p.department_id || 0, price:p.price || 0, priority:p.priority || 0, billing_order:p.billing_order || p.priority || 0, report_order:p.report_order || p.priority || 0, side_header:p.side_header || p.name, active:1, billable:1, active_for_reporting:1, show_profile_name:p.show_profile_name !== false, ordering_mode:'MANUAL', search_keywords:p.search_keywords || '', interpretation_enabled: !!p.interpretation_enabled, interpretation_text:p.interpretation_text || '', items });
    };
    const header = (text:string, priority:number) => ({ item_type:'HEADER', side_header:text, header_text:text, priority });
    const titem = (code:string, priority:number) => ({ item_type:'TEST', code, priority });
    const pitem = (code:string, priority:number) => ({ item_type:'PROFILE', code, priority, display_profile_name:true });

    upsertProfile({ code:'CBC', name:'Complete Blood Count', department_id:dept.HEM, price:450, priority:1000, side_header:'CBC', items:[header('CBC',1000), ...['HB','RBC','HCT','WBC','NEUT','LYMPH','EOS','MONO','BASO','PLT','MCV','MCH','MCHC','RDW'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'LIPID', name:'Lipid Profile', department_id:dept.BIO, price:700, priority:2000, side_header:'Lipid Profile', items:[header('Lipid Profile',1000), ...['TC','TG','HDL','LDL','VLDL','NONHDL','TC_HDL'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'LFT', name:'Liver Function Test', department_id:dept.BIO, price:750, priority:3000, side_header:'Liver Function', items:[header('Bilirubin',1000), ...['TBIL','DBIL','IBIL'].map((c,i)=>titem(c,(i+2)*1000)), header('Enzymes',6000), ...['SGOT','SGPT','ALP','GGT'].map((c,i)=>titem(c,(i+7)*1000)), header('Proteins',12000), ...['TPROT','ALB','GLOB','AGRATIO'].map((c,i)=>titem(c,(i+13)*1000))] });
    upsertProfile({ code:'RFT', name:'Renal Function Test', department_id:dept.BIO, price:650, priority:4000, side_header:'Renal Function', items:[header('Renal Function',1000), ...['UREA','BUN','CREA','EGFR','UA'].map((c,i)=>titem(c,(i+2)*1000)), header('Electrolytes / Minerals',9000), ...['NA','K','CL','CA','PHOS'].map((c,i)=>titem(c,(i+10)*1000))] });
    upsertProfile({ code:'ELECTROLYTES', name:'Electrolytes', department_id:dept.BIO, price:400, priority:4500, side_header:'Electrolytes', items:[header('Electrolytes',1000), ...['NA','K','CL'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'DIABETES', name:'Diabetes Profile', department_id:dept.BIO, price:600, priority:5000, side_header:'Diabetes', items:[header('Glucose',1000), ...['GLU_F','GLU_PP','GLU_R','HBA1C'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'THYROID', name:'Thyroid Profile', department_id:dept.IMM, price:700, priority:6000, side_header:'Thyroid', items:[header('Thyroid Profile',1000), ...['T3','T4','TSH'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'TFT_FULL', name:'Thyroid Profile Full', department_id:dept.IMM, price:1000, priority:6500, side_header:'Thyroid', items:[header('Thyroid Profile',1000), ...['T3','T4','TSH','FT3','FT4'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'URINE_ROUTINE', name:'Urine Routine', department_id:dept.URI, price:250, priority:7000, side_header:'Urine Routine', items:[header('Physical Examination',1000), ...['UR_COLOR','UR_APP','UR_PH','UR_SG'].map((c,i)=>titem(c,(i+2)*1000)), header('Chemical Examination',8000), ...['UR_PRO','UR_GLU','UR_KET','UR_BIL','UR_UBG','UR_NIT','UR_LEU','UR_BLOOD'].map((c,i)=>titem(c,(i+9)*1000))] });
    upsertProfile({ code:'URINE_COMPLETE', name:'Urine Complete Examination', department_id:dept.URI, price:350, priority:7500, side_header:'Urine Complete', items:[pitem('URINE_ROUTINE',1000), header('Microscopy',20000), ...['UR_PUS','UR_RBC','UR_EPI','UR_CAST','UR_CRYS','UR_BACT'].map((c,i)=>titem(c,(i+21)*1000))] });
    upsertProfile({ code:'RAPID_CARDS', name:'Rapid Cards / Serology', department_id:dept.SER, price:0, priority:8000, side_header:'Rapid Cards', items:[header('Dengue',1000), ...['DENGUE_NS1','DENGUE_IGM','DENGUE_IGG'].map((c,i)=>titem(c,(i+2)*1000)), header('Malaria',6000), ...['MP_PF','MP_PV'].map((c,i)=>titem(c,(i+7)*1000)), header('Infectious Screening',10000), ...['HBSAG','HCV','HIV','UPT','TROP_I'].map((c,i)=>titem(c,(i+11)*1000))] });
    upsertProfile({ code:'WIDAL', name:'Widal Test', department_id:dept.SER, price:300, priority:8500, side_header:'Widal', items:[header('Widal',1000), ...['WIDAL_TO','WIDAL_TH','WIDAL_AH','WIDAL_BH'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'COAG_BASIC', name:'Coagulation Profile Basic', department_id:dept.COAG, price:500, priority:9000, side_header:'Coagulation', items:[header('Coagulation',1000), ...['PT','INR','APTT'].map((c,i)=>titem(c,(i+2)*1000))] });
    upsertProfile({ code:'FEVER_BASIC', name:'Fever Profile Basic', department_id:0, price:1200, priority:9500, side_header:'Fever Profile', items:[pitem('CBC',1000), header('Inflammation / Rapid Tests',30000), ...['CRP_Q','DENGUE_NS1','MP_PF','MP_PV','WIDAL_TO','WIDAL_TH'].map((c,i)=>titem(c,(i+31)*1000))] });
    upsertProfile({ code:'HEALTH_BASIC', name:'Basic Health Checkup', department_id:0, price:2500, priority:10000, side_header:'Health Checkup', items:[pitem('CBC',1000), pitem('DIABETES',2000), pitem('LIPID',3000), pitem('LFT',4000), pitem('RFT',5000), pitem('URINE_COMPLETE',6000)] });

    this.setSetting(seedKey, 'DONE');
    this.audit('masters.seed.comprehensive', 'Seeded comprehensive test masters and profiles: CBC, Lipid, LFT, RFT, Urine, Rapid Cards, Diabetes, Thyroid, Coagulation, Fever, Health Checkup.');
  }

  getSetting(key: string, fallback = '') { return (this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any)?.value ?? fallback; }
  setSetting(key: string, value: string) { const now = this.nowIst(); this.db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=?').run(key, value, now, now); }
  getSettings() { const rows = this.db.prepare('SELECT key,value FROM settings').all() as any[]; return Object.fromEntries(rows.map(r => [r.key, r.value])); }
  protected isQuickReportingEnabled(): boolean { return String(this.getSetting('quickReporting.enabled', 'false')).toLowerCase() === 'true'; }
  protected quickReportingEnabledSql(): string { return "COALESCE((SELECT value FROM settings WHERE key='quickReporting.enabled'),'false')='true'"; }
  saveSettings(s: any) {
    Object.entries(s).forEach(([k,v]) => this.setSetting(k, String(v ?? '')));
    const exportPath = String((s || {})['report.export.path'] || '').trim();
    if (exportPath) {
      try { fs.mkdirSync(exportPath, { recursive: true }); this.reportsDir = exportPath; } catch {}
    }
    this.audit('settings.save', JSON.stringify(s));
    return this.getSettings();
  }

  listDepartments() { return this.db.prepare('SELECT * FROM departments ORDER BY priority,name').all(); }
  saveDepartment(d: any) { const id = Number(d.id || 0); const pageBreakAfter = d.page_break_after ? 1 : 0; if (id) this.db.prepare('UPDATE departments SET name=?,priority=?,page_break_after=?,active=? WHERE id=?').run(d.name, +d.priority||0, pageBreakAfter, d.active?1:0, id); else this.db.prepare('INSERT INTO departments(name,priority,page_break_after,active) VALUES(?,?,?,?)').run(d.name, +d.priority||0, pageBreakAfter, d.active?1:0); return this.listDepartments(); }
  listUnits() { return this.db.prepare('SELECT * FROM units ORDER BY name').all(); }
  saveUnit(u: any) { const id = Number(u.id || 0); if (id) this.db.prepare('UPDATE units SET name=?,active=? WHERE id=?').run(u.name, u.active?1:0, id); else this.db.prepare('INSERT INTO units(name,active) VALUES(?,?)').run(u.name, u.active?1:0); return this.listUnits(); }

  listSpecimenTypes() { return this.db.prepare('SELECT * FROM specimen_types ORDER BY name').all(); }
  saveSpecimenType(s: any) { const name=this.normalizeName(s.name); if(!name) return this.listSpecimenTypes(); const existing=this.db.prepare('SELECT id FROM specimen_types WHERE lower(name)=lower(?)').get(name) as any; if(existing?.id) return this.listSpecimenTypes(); this.db.prepare('INSERT INTO specimen_types(name,code,is_active,created_at,updated_at) VALUES(?,?,?,?,?)').run(name, s.code||'', s.is_active === false ? 0 : 1, this.nowIst(), this.nowIst()); return this.listSpecimenTypes(); }
  listTestMethods() { return this.db.prepare('SELECT * FROM test_methods ORDER BY name').all(); }


  protected ensureEquipmentIntegrationSchema() {
    this.db.exec(`
CREATE TABLE IF NOT EXISTS equipment_master(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_name TEXT NOT NULL,
  equipment_code TEXT NOT NULL UNIQUE,
  equipment_identifier TEXT,
  equipment_type TEXT,
  manufacturer TEXT,
  model TEXT,
  order_request_type TEXT NOT NULL DEFAULT 'HTTP_GET_SAMPLE_ID',
  result_receive_type TEXT NOT NULL DEFAULT 'HTTP_POST',
  is_active INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes'))
);
CREATE TABLE IF NOT EXISTS equipment_test_mappings(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  test_name TEXT,
  analyzer_code TEXT NOT NULL,
  lis_code TEXT,
  decimal_places INTEGER,
  rounding_mode TEXT NOT NULL DEFAULT 'NEAREST',
  transform_operator TEXT NOT NULL DEFAULT 'NONE',
  transform_value REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  UNIQUE(equipment_id, test_id),
  FOREIGN KEY(equipment_id) REFERENCES equipment_master(id) ON DELETE CASCADE,
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
`);
    this.ensureEquipmentMappingDuplicateCodesAllowed();
    this.db.exec(`
CREATE INDEX IF NOT EXISTS idx_equipment_test_map_equipment ON equipment_test_mappings(equipment_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_equipment_test_map_analyzer ON equipment_test_mappings(equipment_id, analyzer_code);
`);
    this.ensureColumn('equipment_master', 'equipment_identifier', 'TEXT');
    this.ensureColumn('equipment_master', 'notes', 'TEXT');
    this.ensureColumn('equipment_test_mappings', 'notes', 'TEXT');
    this.ensureAnalyzerRuntimeSchema();
  }

  protected ensureEquipmentMappingDuplicateCodesAllowed() {
    const row = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='equipment_test_mappings'").get() as any;
    const compactSql = String(row?.sql || '').toUpperCase().replace(/\s+/g, '');
    const hasAnalyzerUnique = compactSql.includes('UNIQUE(EQUIPMENT_ID,ANALYZER_CODE)');
    const hasLisUnique = compactSql.includes('UNIQUE(EQUIPMENT_ID,LIS_CODE)');
    if (!hasAnalyzerUnique && !hasLisUnique) return;

    const migrate = this.db.transaction(() => {
      this.db.exec(`
CREATE TABLE equipment_test_mappings_allow_duplicates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  equipment_id INTEGER NOT NULL,
  test_id INTEGER NOT NULL,
  test_name TEXT,
  analyzer_code TEXT NOT NULL,
  lis_code TEXT,
  decimal_places INTEGER,
  rounding_mode TEXT NOT NULL DEFAULT 'NEAREST',
  transform_operator TEXT NOT NULL DEFAULT 'NONE',
  transform_value REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 1000,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')),
  UNIQUE(equipment_id, test_id),
  FOREIGN KEY(equipment_id) REFERENCES equipment_master(id) ON DELETE CASCADE,
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
INSERT INTO equipment_test_mappings_allow_duplicates(
  id,equipment_id,test_id,test_name,analyzer_code,lis_code,decimal_places,rounding_mode,
  transform_operator,transform_value,is_active,sort_order,notes,created_at,updated_at
)
SELECT id,equipment_id,test_id,test_name,analyzer_code,lis_code,decimal_places,rounding_mode,
  transform_operator,transform_value,is_active,sort_order,notes,created_at,updated_at
FROM equipment_test_mappings;
DROP TABLE equipment_test_mappings;
ALTER TABLE equipment_test_mappings_allow_duplicates RENAME TO equipment_test_mappings;
`);
    });

    this.db.pragma('foreign_keys = OFF');
    try { migrate(); }
    finally { this.db.pragma('foreign_keys = ON'); }
  }

  protected ensureAnalyzerRuntimeSchema() {
    try { this.quickBarcodeSvc().ensureSchema(); } catch {}
    const barcodeCols: Array<[string, string]> = [
      ['result_value', 'TEXT'],
      ['raw_result_value', 'TEXT'],
      ['transformed_result_value', 'TEXT'],
      ['result_updated_at', 'TEXT'],
      ['result_updated_date', 'TEXT'],
      ['result_updated_time', 'TEXT'],
      ['result_source', 'TEXT'],
      ['result_equipment_id', 'INTEGER'],
      ['result_analyzer_code', 'TEXT']
    ];
    for (const [name, type] of barcodeCols) this.ensureColumn('quick_reporting_barcode_items', name, type);
    const itemCols: Array<[string, string]> = [
      ['raw_result_value', 'TEXT'],
      ['transformed_result_value', 'TEXT'],
      ['result_updated_at', 'TEXT'],
      ['result_updated_date', 'TEXT'],
      ['result_updated_time', 'TEXT'],
      ['result_source', 'TEXT'],
      ['result_equipment_id', 'INTEGER'],
      ['result_analyzer_code', 'TEXT']
    ];
    for (const [name, type] of itemCols) {
      this.ensureColumn('quick_report_items', name, type);
      this.ensureColumn('report_items', name, type);
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qb_analyzer_sample ON quick_reporting_barcode_items(sample_id,test_id);
                  CREATE INDEX IF NOT EXISTS idx_qri_analyzer_sample ON quick_report_items(sample_id,test_id);
                  CREATE INDEX IF NOT EXISTS idx_report_items_analyzer_specimen ON report_items(specimen_id,test_id);`);
  }

  listEquipmentMasters(activeOnly = false) {
    this.ensureEquipmentIntegrationSchema();
    const rows = this.db.prepare(`SELECT * FROM equipment_master ${activeOnly ? 'WHERE is_active=1' : ''} ORDER BY is_active DESC, equipment_name COLLATE NOCASE`).all() as any[];
    const mappings = this.db.prepare(`SELECT m.*, t.code test_code, t.name current_test_name, t.display_name current_display_name, d.name department_name, u.name unit_name
      FROM equipment_test_mappings m
      LEFT JOIN tests t ON t.id=m.test_id
      LEFT JOIN departments d ON d.id=t.department_id
      LEFT JOIN units u ON u.id=t.unit_id
      ORDER BY m.equipment_id, m.sort_order, COALESCE(t.name, m.test_name)`).all() as any[];
    return rows.map(e => ({
      ...e,
      active: !!e.is_active,
      mappings: mappings.filter(m => +m.equipment_id === +e.id).map(m => ({
        ...m,
        is_active: m.is_active !== 0,
        active: m.is_active !== 0,
        test_name: m.current_display_name || m.current_test_name || m.test_name || '',
        unit_name: m.unit_name || ''
      }))
    }));
  }

  saveEquipmentMaster(payload: any) {
    this.ensureEquipmentIntegrationSchema();
    const tx = this.db.transaction(() => {
      const id = +payload.id || 0;
      const name = this.normalizeName(payload.equipment_name || payload.name || '');
      const code = this.normalizeName(payload.equipment_code || payload.code || '').toUpperCase();
      if (!name) throw new Error('Equipment name is required.');
      if (!code) throw new Error('Equipment code is required.');
      const duplicate = this.db.prepare('SELECT id FROM equipment_master WHERE lower(equipment_code)=lower(?) AND id<>? LIMIT 1').get(code, id || 0) as any;
      if (duplicate?.id) throw new Error(`Equipment code ${code} already exists.`);
      const orderType = ['NONE','HTTP_GET_SAMPLE_ID','ASTM_QUERY','HL7_ORDER'].includes(String(payload.order_request_type || '').toUpperCase()) ? String(payload.order_request_type).toUpperCase() : 'HTTP_GET_SAMPLE_ID';
      const resultType = ['NONE','HTTP_POST','ASTM_RESULT','HL7_RESULT','MANUAL_IMPORT'].includes(String(payload.result_receive_type || '').toUpperCase()) ? String(payload.result_receive_type).toUpperCase() : 'HTTP_POST';
      const now = this.nowIst();
      let equipmentId = id;
      const vals = [
        name,
        code,
        this.normalizeName(payload.equipment_identifier || payload.equipment_no || payload.equipmentId || ''),
        this.normalizeName(payload.equipment_type || ''),
        this.normalizeName(payload.manufacturer || ''),
        this.normalizeName(payload.model || ''),
        orderType,
        resultType,
        payload.is_active === false || payload.active === false ? 0 : 1,
        String(payload.notes || '').trim(),
        now
      ];
      if (equipmentId) {
        this.db.prepare(`UPDATE equipment_master SET equipment_name=?,equipment_code=?,equipment_identifier=?,equipment_type=?,manufacturer=?,model=?,order_request_type=?,result_receive_type=?,is_active=?,notes=?,updated_at=? WHERE id=?`).run(...vals, equipmentId);
      } else {
        equipmentId = Number(this.db.prepare(`INSERT INTO equipment_master(equipment_name,equipment_code,equipment_identifier,equipment_type,manufacturer,model,order_request_type,result_receive_type,is_active,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(...vals).lastInsertRowid);
      }

      this.db.prepare('DELETE FROM equipment_test_mappings WHERE equipment_id=?').run(equipmentId);
      const rows = Array.isArray(payload.mappings) ? payload.mappings : [];
      const usedTests = new Set<number>();
      rows.forEach((row: any, index: number) => {
        const testId = +row.test_id || +row.testId || 0;
        const analyzerCode = this.normalizeName(row.analyzer_code || row.analyzerCode || '').toUpperCase();
        const lisCode = this.normalizeName(row.lis_code || row.lisCode || analyzerCode).toUpperCase();
        if (!testId || !analyzerCode) return;
        if (usedTests.has(testId)) throw new Error('Same test mapped more than once for this equipment.');
        usedTests.add(testId);
        const test = this.db.prepare('SELECT name, display_name, decimal_places, rounding_mode FROM tests WHERE id=?').get(testId) as any;
        const roundingMode = ['NONE','NEAREST','UP','DOWN'].includes(String(row.rounding_mode || '').toUpperCase()) ? String(row.rounding_mode).toUpperCase() : 'NEAREST';
        const operator = ['NONE','+','-','*','/'].includes(String(row.transform_operator || 'NONE').toUpperCase()) ? String(row.transform_operator || 'NONE').toUpperCase() : 'NONE';
        const decimalsRaw = row.decimal_places === '' || row.decimal_places === null || row.decimal_places === undefined ? null : Math.max(0, Math.min(6, Number(row.decimal_places) || 0));
        this.db.prepare(`INSERT INTO equipment_test_mappings(equipment_id,test_id,test_name,analyzer_code,lis_code,decimal_places,rounding_mode,transform_operator,transform_value,is_active,sort_order,notes,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          equipmentId,
          testId,
          this.normalizeName(row.test_name || test?.display_name || test?.name || ''),
          analyzerCode,
          lisCode,
          decimalsRaw,
          roundingMode,
          operator,
          operator === 'NONE' ? null : (Number.isFinite(Number(row.transform_value)) ? Number(row.transform_value) : 0),
          row.is_active === false || row.active === false ? 0 : 1,
          +row.sort_order || (index + 1) * 1000,
          String(row.notes || '').trim(),
          now
        );
      });
      return equipmentId;
    });
    tx();
    return this.listEquipmentMasters();
  }

  deleteEquipmentMaster(id: number) {
    this.ensureEquipmentIntegrationSchema();
    if (!+id) return this.listEquipmentMasters();
    const row = this.db.prepare('SELECT id,is_active,equipment_name FROM equipment_master WHERE id=? LIMIT 1').get(+id) as any;
    if (row?.is_active) throw new Error('Active equipment cannot be deleted. Make it inactive first.');
    this.db.prepare('DELETE FROM equipment_master WHERE id=?').run(+id);
    return this.listEquipmentMasters();
  }

  getEquipmentMappingForRequest(equipmentId: number, activeOnly = true) {
    this.ensureEquipmentIntegrationSchema();
    const filter = activeOnly ? 'AND e.is_active=1 AND m.is_active=1' : '';
    return this.db.prepare(`SELECT e.id equipment_id, e.equipment_name, e.equipment_code, e.order_request_type, e.result_receive_type,
      m.*, t.code test_code, t.name test_name_master, t.display_name test_display_name, u.name unit_name
      FROM equipment_master e
      JOIN equipment_test_mappings m ON m.equipment_id=e.id
      JOIN tests t ON t.id=m.test_id
      LEFT JOIN units u ON u.id=t.unit_id
      WHERE e.id=? ${filter}
      ORDER BY m.sort_order, t.name`).all(+equipmentId) as any[];
  }


  getAnalyzerApiSettings() {
    const host = String(this.getSetting('analyzer.api.host', '127.0.0.1') || '127.0.0.1').trim() || '127.0.0.1';
    const port = Math.max(1, Math.min(65535, Number(this.getSetting('analyzer.api.port', '5055')) || 5055));
    let basePath = String(this.getSetting('analyzer.api.basePath', '/api/analyzer') || '/api/analyzer').trim() || '/api/analyzer';
    if (!basePath.startsWith('/')) basePath = '/' + basePath;
    basePath = basePath.replace(/\/+$/, '');
    const publicUrl = String(this.getSetting('analyzer.api.publicUrl', `http://${host}:${port}${basePath}`) || '').trim() || `http://${host}:${port}${basePath}`;
    const logPath = String(this.getSetting('analyzer.api.logPath', path.join(app.getPath('documents'), 'LIMS-Analyzer-API-Logs')) || '').trim() || path.join(app.getPath('documents'), 'LIMS-Analyzer-API-Logs');
    return {
      enabled: String(this.getSetting('analyzer.api.enabled', 'true')).toLowerCase() !== 'false',
      host,
      port,
      basePath,
      publicUrl,
      logPath
    };
  }

  analyzerEquipmentSummary(equipmentId: number) {
    this.ensureEquipmentIntegrationSchema();
    return this.db.prepare('SELECT id,equipment_name,equipment_code,equipment_identifier,is_active,order_request_type,result_receive_type FROM equipment_master WHERE id=?').get(+equipmentId) as any;
  }

  protected analyzerNormalizeCode(value: any) { return String(value ?? '').trim().toUpperCase(); }

  protected analyzerPatientName(row: any) {
    return [row?.title, row?.patient_name].map(x => String(x || '').trim()).filter(Boolean).join(' ').trim();
  }

  protected analyzerOrderRowsFromBarcode(sampleId: string) {
    return this.db.prepare(`SELECT qbi.*, b.bill_no, b.bill_date, p.id patient_id, p.patient_no, p.title, p.name patient_name, p.age, p.age_value, p.age_unit, p.gender, p.mobile, p.email, p.dob, c.name ref_by,
        t.code test_code, t.name test_name_master, t.display_name test_display_name, u.name unit_name
      FROM quick_reporting_barcode_items qbi
      JOIN bills b ON b.id=qbi.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      JOIN tests t ON t.id=qbi.test_id
      LEFT JOIN units u ON u.id=t.unit_id
      WHERE TRIM(COALESCE(qbi.sample_id,''))=? AND COALESCE(qbi.barcode_generated,0)=1 AND qbi.test_id IS NOT NULL
      ORDER BY qbi.bill_id, qbi.collection_datetime, qbi.item_key`).all(sampleId) as any[];
  }

  protected analyzerOrderRowsFromQuickReport(sampleId: string) {
    return this.db.prepare(`SELECT qri.*, qr.report_no, qr.status report_status, b.bill_no, b.bill_date, p.id patient_id, p.patient_no, p.title, p.name patient_name, p.age, p.age_value, p.age_unit, p.gender, p.mobile, p.email, p.dob, c.name ref_by,
        t.code test_code, t.name test_name_master, t.display_name test_display_name, u.name unit_name
      FROM quick_report_items qri
      JOIN quick_reports qr ON qr.id=qri.quick_report_id
      JOIN bills b ON b.id=qri.bill_id
      JOIN patients p ON p.id=b.patient_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      JOIN tests t ON t.id=qri.test_id
      LEFT JOIN units u ON u.id=t.unit_id
      WHERE TRIM(COALESCE(qri.sample_id,''))=? AND qri.test_id IS NOT NULL
      ORDER BY qri.bill_id, qri.collection_datetime, qri.item_key`).all(sampleId) as any[];
  }

  getAnalyzerOrder(sampleIdInput: any, equipmentIdInput: any) {
    this.ensureEquipmentIntegrationSchema();
    const sampleId = String(sampleIdInput ?? '').trim();
    const equipmentId = Number(equipmentIdInput || 0);
    if (!sampleId) return { status:false, message:'sampleId is required.', sampleId:'', equipmentId, patient:null, collection:null, tests:[] };
    if (!equipmentId) return { status:false, message:'equipmentId is required.', sampleId, equipmentId, patient:null, collection:null, tests:[] };

    const equipment = this.analyzerEquipmentSummary(equipmentId);
    if (!equipment?.id) return { status:false, message:`Equipment ${equipmentId} was not found.`, sampleId, equipmentId, patient:null, collection:null, tests:[] };
    if (+equipment.is_active !== 1) return { status:false, message:`Equipment ${equipment.equipment_name || equipmentId} is inactive.`, sampleId, equipmentId, patient:null, collection:null, tests:[] };
    if (String(equipment.order_request_type || '').toUpperCase() === 'NONE') return { status:false, message:`Order request is disabled for ${equipment.equipment_name || equipmentId}.`, sampleId, equipmentId, patient:null, collection:null, tests:[] };

    const mappings = this.getEquipmentMappingForRequest(equipmentId, true) as any[];
    const byTestId = new Map<number, any>();
    mappings.forEach((m:any) => byTestId.set(+m.test_id, m));
    const rows = this.analyzerOrderRowsFromBarcode(sampleId);
    const fallbackRows = rows.length ? [] : this.analyzerOrderRowsFromQuickReport(sampleId);
    const sourceRows = rows.length ? rows : fallbackRows;
    if (!sourceRows.length) return { status:false, message:`No order found for sampleId ${sampleId}.`, equipmentId, equipment, sampleId, patient:null, collection:null, tests:[] };

    const matched = sourceRows.filter((r:any) => byTestId.has(+r.test_id));
    const first = matched[0] || sourceRows[0];
    const patient = first ? {
      billId: +first.bill_id || 0,
      billNo: first.bill_no || '',
      patientId: +first.patient_id || 0,
      patientNo: first.patient_no || '',
      name: this.analyzerPatientName(first),
      age: String(first.age || '').trim() || [first.age_value, first.age_unit].filter(Boolean).join(' '),
      ageValue: first.age_value ?? null,
      ageUnit: first.age_unit || '',
      gender: first.gender || '',
      mobileNo: first.mobile || '',
      email: first.email || '',
      dateOfBirth: first.dob || '',
      refBy: first.ref_by || ''
    } : null;
    const collection = first ? {
      specimenTypeId: +first.specimen_type_id || 0,
      specimenName: first.specimen_name || '',
      collectionType: first.collection_type || '',
      collectTiming: first.collect_timing || 'NOW',
      expectedCollectAt: first.expected_collect_at || '',
      collectionDate: first.collection_date || '',
      collectionTime: first.collection_time || '',
      collectionDateTime: first.collection_datetime || ''
    } : null;
    const tests = matched.map((r:any) => {
      const m = byTestId.get(+r.test_id) || {};
      return {
        itemKey: r.item_key || '',
        billItemId: +r.bill_item_id || 0,
        testId: +r.test_id || 0,
        testName: m.test_display_name || m.test_name_master || r.test_display_name || r.test_name_master || r.test_name || '',
        testCode: r.test_code || m.test_code || '',
        sampleId,
        specimenName: r.specimen_name || '',
        analyzerCode: m.analyzer_code || '',
        lisCode: m.lis_code || m.analyzer_code || '',
        unit: r.unit_name || m.unit_name || '',
        sortOrder: +m.sort_order || 0
      };
    });
    return {
      status: tests.length > 0,
      message: tests.length ? 'Order found' : 'Order found, but no active tests are mapped for this equipment.',
      equipmentId,
      equipment: { id:+equipment.id, name:equipment.equipment_name, code:equipment.equipment_code, identifier:equipment.equipment_identifier || '' },
      sampleId,
      patient,
      collection,
      tests,
      reportDetails: {
        sampleId,
        patientName: patient?.name || '',
        age: patient?.age || '',
        sex: patient?.gender || '',
        gender: patient?.gender || '',
        uhId: patient?.patientNo || '',
        refBy: patient?.refBy || '',
        lisTests: tests.map((t:any) => ({ sampleNo: sampleId, sampleId, analyzerCode: t.analyzerCode, lisId: t.lisCode, lisCode: t.lisCode, testId: t.testId, testName: t.testName, unit: t.unit }))
      }
    };
  }

  protected analyzerApplyTransform(rawValue: any, mapping: any) {
    const rawText = String(rawValue ?? '').trim();
    const n = Number(rawText);
    if (!rawText || !Number.isFinite(n)) return rawText;
    const op = String(mapping?.transform_operator || 'NONE').toUpperCase();
    const v = Number(mapping?.transform_value);
    let out = n;
    if (op === '+' && Number.isFinite(v)) out = n + v;
    else if (op === '-' && Number.isFinite(v)) out = n - v;
    else if (op === '*' && Number.isFinite(v)) out = n * v;
    else if (op === '/' && Number.isFinite(v) && v !== 0) out = n / v;
    const decimals = mapping?.decimal_places === null || mapping?.decimal_places === undefined || mapping?.decimal_places === '' ? null : Math.max(0, Math.min(6, Number(mapping.decimal_places) || 0));
    const mode = String(mapping?.rounding_mode || 'NEAREST').toUpperCase();
    if (decimals === null || mode === 'NONE') return String(out);
    const factor = Math.pow(10, decimals);
    if (mode === 'UP') out = Math.ceil(out * factor) / factor;
    else if (mode === 'DOWN') out = Math.floor(out * factor) / factor;
    else out = Math.round(out * factor) / factor;
    return out.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  }

  protected analyzerResultTimestamp(input: any) {
    const raw = String(input || '').trim();
    let dt: Date | null = null;
    if (raw) {
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) dt = parsed;
    }
    if (!dt) return this.nowIst();
    return new Date(dt.getTime() + 330 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
  }

  saveAnalyzerResults(payload: any) {
    this.ensureEquipmentIntegrationSchema();
    const equipmentId = Number(payload?.equipmentId || payload?.equipment_id || payload?.machineId || payload?.machine_id || 0);
    const sampleId = String(payload?.sampleId || payload?.sample_id || payload?.sampleNo || payload?.sample_no || '').trim();
    if (!equipmentId) return { status:false, message:'equipmentId is required.', equipmentId, sampleId, updatedCount:0, failedCount:0, details:[] };
    if (!sampleId) return { status:false, message:'sampleId is required.', equipmentId, sampleId, updatedCount:0, failedCount:0, details:[] };
    const equipment = this.analyzerEquipmentSummary(equipmentId);
    if (!equipment?.id) return { status:false, message:`Equipment ${equipmentId} was not found.`, equipmentId, sampleId, updatedCount:0, failedCount:0, details:[] };
    if (+equipment.is_active !== 1) return { status:false, message:`Equipment ${equipment.equipment_name || equipmentId} is inactive.`, equipmentId, sampleId, updatedCount:0, failedCount:0, details:[] };
    if (String(equipment.result_receive_type || '').toUpperCase() === 'NONE') return { status:false, message:`Result posting is disabled for ${equipment.equipment_name || equipmentId}.`, equipmentId, sampleId, updatedCount:0, failedCount:0, details:[] };

    const incomingRows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [payload];
    const mappings = this.getEquipmentMappingForRequest(equipmentId, true) as any[];
    const byAnalyzer = new Map<string, any>();
    mappings.forEach((m:any) => {
      byAnalyzer.set(this.analyzerNormalizeCode(m.analyzer_code), m);
      if (m.lis_code) byAnalyzer.set(this.analyzerNormalizeCode(m.lis_code), m);
    });
    const now = this.analyzerResultTimestamp(payload?.resultDateTime || payload?.result_datetime || payload?.resultTime || payload?.result_time);
    const [datePart, timePart] = now.split(' ');
    const updateQb = this.db.prepare(`UPDATE quick_reporting_barcode_items SET result_value=?, raw_result_value=?, transformed_result_value=?, result_updated_at=?, result_updated_date=?, result_updated_time=?, result_source='ANALYZER', result_equipment_id=?, result_analyzer_code=?, updated_at=? WHERE TRIM(COALESCE(sample_id,''))=? AND test_id=?`);
    const updateQr = this.db.prepare(`UPDATE quick_report_items SET result_value=?, raw_result_value=?, transformed_result_value=?, result_updated_at=?, result_updated_date=?, result_updated_time=?, result_source='ANALYZER', result_equipment_id=?, result_analyzer_code=?, final_result_source='ANALYZER' WHERE TRIM(COALESCE(sample_id,''))=? AND test_id=?`);
    const updateRi = this.db.prepare(`UPDATE report_items SET result_value=?, raw_result_value=?, transformed_result_value=?, result_updated_at=?, result_updated_date=?, result_updated_time=?, result_source='ANALYZER', result_equipment_id=?, result_analyzer_code=?, final_result_source='ANALYZER', result_status='RESULT_ENTERED' WHERE TRIM(COALESCE(specimen_id,''))=? AND test_id=?`);
    const details:any[] = [];
    const tx = this.db.transaction(() => {
      for (const row of incomingRows) {
        const analyzerCode = this.analyzerNormalizeCode(row?.analyzerCode || row?.analyzer_code || row?.lisCode || row?.lis_code || row?.code);
        const rawValue = row?.result ?? row?.value ?? row?.resultValue ?? row?.result_value ?? '';
        if (!analyzerCode) { details.push({ status:'failed', reason:'Missing analyzerCode', rawValue }); continue; }
        const mapping = byAnalyzer.get(analyzerCode);
        if (!mapping?.test_id) { details.push({ analyzerCode, rawValue, status:'failed', reason:'Analyzer code is not active/mapped for this equipment.' }); continue; }
        const resultTime = this.analyzerResultTimestamp(row?.resultDateTime || row?.result_datetime || row?.resultTime || row?.result_time || now);
        const [dPart, tPart] = resultTime.split(' ');
        const savedValue = this.analyzerApplyTransform(rawValue, mapping);
        const qbr:any = updateQb.run(savedValue, String(rawValue ?? ''), savedValue, resultTime, dPart || datePart, tPart || timePart, equipmentId, analyzerCode, resultTime, sampleId, +mapping.test_id);
        const qrr:any = updateQr.run(savedValue, String(rawValue ?? ''), savedValue, resultTime, dPart || datePart, tPart || timePart, equipmentId, analyzerCode, sampleId, +mapping.test_id);
        const rir:any = updateRi.run(savedValue, String(rawValue ?? ''), savedValue, resultTime, dPart || datePart, tPart || timePart, equipmentId, analyzerCode, sampleId, +mapping.test_id);
        const changed = Number(qbr?.changes || 0) + Number(qrr?.changes || 0) + Number(rir?.changes || 0);
        details.push({ analyzerCode, testId:+mapping.test_id, testName:mapping.test_display_name || mapping.test_name_master || mapping.test_name || '', rawValue:String(rawValue ?? ''), savedValue, resultUpdatedAt:resultTime, status: changed > 0 ? 'updated' : 'failed', reason: changed > 0 ? '' : 'Mapped test was not found for this sampleId.', updatedRows: changed });
      }
    });
    tx();
    const updatedCount = details.filter(x => x.status === 'updated').length;
    return { status: updatedCount > 0, message: updatedCount > 0 ? 'Results processed' : 'No results updated', equipmentId, equipment: { id:+equipment.id, name:equipment.equipment_name, code:equipment.equipment_code }, sampleId, updatedCount, failedCount: details.length - updatedCount, details };
  }

  listTests(activeOnly = false) {
    const rows = this.db.prepare(`SELECT t.*, d.name department_name, u.name unit_name, m.name method_name,
      COALESCE(NULLIF(t.billing_order,0), t.priority * 1000, 1000) billing_order,
      COALESCE(NULLIF(t.report_order,0), t.priority * 1000, 1000) report_order
      FROM tests t
      LEFT JOIN departments d ON d.id=t.department_id
      LEFT JOIN units u ON u.id=t.unit_id
      LEFT JOIN test_methods m ON m.id=t.method_id
      ${activeOnly?'WHERE t.active=1 AND t.billable=1':''}
      ORDER BY d.priority, COALESCE(NULLIF(t.report_order,0), t.priority * 1000, 1000), t.name`).all() as any[];
    const specimens = this.db.prepare('SELECT m.test_id, s.id, s.name, m.is_default FROM test_specimen_mappings m JOIN specimen_types s ON s.id=m.specimen_type_id ORDER BY m.display_order,s.name').all() as any[];
    const options = this.db.prepare('SELECT * FROM test_result_options ORDER BY display_order, option_label, option_value').all() as any[];
    const refs = this.db.prepare('SELECT * FROM test_reference_ranges ORDER BY display_order, gender').all() as any[];
    const formulas = this.db.prepare('SELECT * FROM test_formulas WHERE is_active=1 ORDER BY id DESC').all() as any[];
    const formulaVars = this.db.prepare(`SELECT v.*, t.name source_test_name, t.code source_test_code
      FROM test_formula_variables v
      LEFT JOIN tests t ON t.id=v.source_test_id
      ORDER BY v.id`).all() as any[];
    return rows.map(t => {
      const formula = formulas.find(f => +f.test_id === +t.id) || null;
      return {
        ...t,
        method: t.method_name || t.method || '',
        side_header: '',
        specimen_ids: specimens.filter(s => +s.test_id === +t.id).map(s => s.id),
        specimen_names: specimens.filter(s => +s.test_id === +t.id).map(s => s.name).join(', '),
        options: options.filter(o => +o.test_id === +t.id),
        reference_ranges: refs.filter(r => +r.test_id === +t.id),
        formula: formula ? { ...formula, variables: formulaVars.filter(v => +v.formula_id === +formula.id) } : null
      };
    });
  }

  saveTest(t: any) {
    this.ensureAdvancedTestMasterSchema();
    const tx = this.db.transaction(() => {
      const id=+t.id||0;
      const code = this.normalizeName(t.code || '').toUpperCase();
      if (!code) throw new Error('Test code is required.');
      const duplicateCode = this.db.prepare('SELECT id FROM tests WHERE lower(code)=lower(?) AND id<>? LIMIT 1').get(code, id || 0) as any;
      if (duplicateCode?.id) throw new Error(`Test code ${code} already exists. Please use a unique code.`);
      const departmentId = t.department_id || null;
      const billingOrder = +t.billing_order || (id ? (+t.priority ? +t.priority * 1000 : 0) : this.nextTestOrder(departmentId, 'billing_order'));
      const reportOrder = +t.report_order || (id ? (+t.priority ? +t.priority * 1000 : 0) : this.nextTestOrder(departmentId, 'report_order'));
      const priority = Math.max(1, Math.round((reportOrder || billingOrder || 1000) / 1000));
      const methodId = this.findOrCreateMethodId(t.method || t.method_name || '');
      const displayName = this.normalizeName(t.display_name || t.report_name || t.name || '');
      const normalRangeText = this.normalizeName(this.defaultReferenceTextFromPayload(t));
      const decimalPlaces = Math.max(0, Math.min(6, Number(t.decimal_places ?? t.rounding_decimals ?? 2) || 0));
      const roundingMode = ['NONE','NEAREST','UP','DOWN'].includes(String(t.rounding_mode || '').toUpperCase()) ? String(t.rounding_mode).toUpperCase() : 'NEAREST';
      const numberFormat = ['NONE','INDIAN','WESTERN'].includes(String(t.number_format || '').toUpperCase()) ? String(t.number_format).toUpperCase() : 'NONE';
      const outputOperator = ['+','-','*','/'].includes(String(t.output_operator || '+')) ? String(t.output_operator || '+') : '+';
      const outputConstant = Number.isFinite(Number(t.output_constant)) ? Number(t.output_constant) : 0;
      const predefinedFormulaKey = this.normalizeName(t.predefined_formula_key || t.formula?.predefined_formula_key || '');
      const collectionRuleRaw = String(t.collection_rule || 'NORMAL').toUpperCase();
      const collectionRule = ['NORMAL','FASTING','POST_PRANDIAL','TIMED_INTERVAL'].includes(collectionRuleRaw) ? collectionRuleRaw : 'NORMAL';
      const fastingHours = Math.max(0, Math.min(24, Number(t.fasting_hours ?? 8) || 0));
      const collectionGapMinutes = Math.max(0, Math.min(1440, Number(t.collection_gap_minutes ?? (collectionRule === 'POST_PRANDIAL' ? 120 : 0)) || 0));
      const collectionDependencyRaw = String(t.collection_dependency || (collectionRule === 'POST_PRANDIAL' ? 'MEAL_TIME' : 'NONE')).toUpperCase();
      const collectionDependency = ['NONE','MEAL_TIME','FASTING_SAMPLE','PREVIOUS_SAMPLE'].includes(collectionDependencyRaw) ? collectionDependencyRaw : 'NONE';
      const sameSpecimenAllowed = t.same_specimen_allowed === false ? 0 : 1;
      const collectionInstruction = this.normalizeName(t.collection_instruction || '');
      const interpretationText = String(t.interpretation_text ?? t.interpretation_html ?? t.interpretation ?? '');
      const interpretationEnabled = this.toBool01(t.interpretation_enabled);
      const inputControlRaw = String(t.input_control_type || 'TEXTBOX').trim().toUpperCase().replace(/[- ]+/g, '_');
      const inputControlType = ['DROPDOWN','RADIO','CHECKBOX','SELECT','OPTION_SELECT','SEARCH_SELECT','SEARCHSELECT'].includes(inputControlRaw) ? 'OPTION' : inputControlRaw;
      const vals = [
        code, t.name, displayName, departmentId, t.unit_id||null, +t.price||0, +t.running_cost||0, t.outsourced_test ? 1 : 0, +t.vendor_cost || 0, t.commission_allowed === false ? 0 : 1, normalRangeText, t.method||'', priority, '', t.active?1:0, t.billable?1:0, t.active_for_reporting === false ? 0 : 1, t.highlight_parameter ? 1 : 0,
        t.result_data_type || 'NUMBER', inputControlType, t.result_mode || 'DIRECT', billingOrder || this.nextTestOrder(departmentId, 'billing_order'), reportOrder || this.nextTestOrder(departmentId, 'report_order'), t.search_keywords || '', methodId,
        decimalPlaces, roundingMode, numberFormat, predefinedFormulaKey, outputOperator, outputConstant, interpretationEnabled, interpretationText, collectionRule, fastingHours, collectionGapMinutes, collectionDependency, sameSpecimenAllowed, collectionInstruction
      ];
      let testId = id;
      if(id) this.db.prepare('UPDATE tests SET code=?,name=?,display_name=?,department_id=?,unit_id=?,price=?,running_cost=?,outsourced_test=?,vendor_cost=?,commission_allowed=?,normal_range=?,method=?,priority=?,side_header=?,active=?,billable=?,active_for_reporting=?,highlight_parameter=?,result_data_type=?,input_control_type=?,result_mode=?,billing_order=?,report_order=?,search_keywords=?,method_id=?,decimal_places=?,rounding_mode=?,number_format=?,predefined_formula_key=?,output_operator=?,output_constant=?,interpretation_enabled=?,interpretation_text=?,collection_rule=?,fasting_hours=?,collection_gap_minutes=?,collection_dependency=?,same_specimen_allowed=?,collection_instruction=? WHERE id=?').run(...vals,id);
      else testId = Number(this.db.prepare('INSERT INTO tests(code,name,display_name,department_id,unit_id,price,running_cost,outsourced_test,vendor_cost,commission_allowed,normal_range,method,priority,side_header,active,billable,active_for_reporting,highlight_parameter,result_data_type,input_control_type,result_mode,billing_order,report_order,search_keywords,method_id,decimal_places,rounding_mode,number_format,predefined_formula_key,output_operator,output_constant,interpretation_enabled,interpretation_text,collection_rule,fasting_hours,collection_gap_minutes,collection_dependency,same_specimen_allowed,collection_instruction) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);

      this.db.prepare('DELETE FROM test_specimen_mappings WHERE test_id=?').run(testId);
      (t.specimen_ids || []).filter((x:any)=>+x).forEach((specimenId:any, i:number) => this.db.prepare('INSERT OR IGNORE INTO test_specimen_mappings(test_id,specimen_type_id,is_default,display_order) VALUES(?,?,?,?)').run(testId, +specimenId, i===0 ? 1 : 0, (i+1)*1000));

      this.db.prepare('DELETE FROM test_result_options WHERE test_id=?').run(testId);
      const hasOptionsText = Object.prototype.hasOwnProperty.call(t, 'options_text');
      const optionRows = hasOptionsText
        ? String(t.options_text || '').split('\n').map((x:string)=>({ option_value:x.trim(), option_label:x.trim() })).filter((x:any)=>x.option_value)
        : (Array.isArray(t.options) ? t.options : []);
      optionRows.filter((o:any)=>this.normalizeName(o.option_value || o.option_label)).forEach((o:any, i:number) => {
        const value = this.normalizeName(o.option_value || o.option_label);
        this.db.prepare('INSERT OR IGNORE INTO test_result_options(test_id,option_value,option_label,display_order,is_default,is_active) VALUES(?,?,?,?,?,?)').run(testId, value, o.option_label || value, +o.display_order || (i+1)*1000, o.is_default ? 1 : 0, o.is_active === false ? 0 : 1);
      });

      this.db.prepare('DELETE FROM test_reference_ranges WHERE test_id=?').run(testId);
      const refs = this.referenceRangesForSave(t);
      refs.filter((r:any)=>r && (r.reference_text || r.lower_limit !== undefined || r.upper_limit !== undefined)).forEach((r:any, i:number) => {
        this.db.prepare('INSERT INTO test_reference_ranges(test_id,gender,age_min,age_max,age_unit,lower_limit,upper_limit,reference_text,flag_enabled,critical_low,critical_high,display_order,is_active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(testId, this.normalizeReferenceGender(r.gender || 'ALL'), r.age_min ?? null, r.age_max ?? null, r.age_unit || 'YEARS', r.lower_limit === '' ? null : r.lower_limit ?? null, r.upper_limit === '' ? null : r.upper_limit ?? null, r.reference_text || '', r.flag_enabled === false ? 0 : 1, r.critical_low ?? null, r.critical_high ?? null, +r.display_order || (i+1)*1000, r.is_active === false ? 0 : 1);
      });

      const oldFormulaIds = (this.db.prepare('SELECT id FROM test_formulas WHERE test_id=?').all(testId) as any[]).map(x => +x.id);
      oldFormulaIds.forEach(fid => this.db.prepare('DELETE FROM test_formula_variables WHERE formula_id=?').run(fid));
      this.db.prepare('DELETE FROM test_formulas WHERE test_id=?').run(testId);
      if ((t.result_mode === 'CALCULATED' || t.result_data_type === 'CALCULATED') && this.normalizeName(t.formula_expression || t.formula?.formula_expression)) {
        const formulaId = Number(this.db.prepare('INSERT INTO test_formulas(test_id,formula_expression,rounding_decimals,allow_manual_override,is_active,created_at,updated_at,predefined_formula_key,rounding_mode) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(testId, this.normalizeName(t.formula_expression || t.formula?.formula_expression), decimalPlaces, t.allow_manual_override ? 1 : 0, 1, this.nowIst(), this.nowIst(), predefinedFormulaKey, roundingMode).lastInsertRowid);
        const variables = Array.isArray(t.formula_variables) ? t.formula_variables : [];
        variables.filter((v:any) => this.normalizeName(v.variable_key) && +v.source_test_id).forEach((v:any) => {
          this.db.prepare('INSERT OR IGNORE INTO test_formula_variables(formula_id,variable_key,source_test_id) VALUES(?,?,?)')
            .run(formulaId, this.normalizeName(v.variable_key).toUpperCase(), +v.source_test_id);
        });
      }

      const targets = t.update_targets || {};
      if (id && targets.billing && targets.billingDate) {
        const departmentName = (this.db.prepare('SELECT name FROM departments WHERE id=?').get(departmentId) as any)?.name || '';
        this.db.prepare(`UPDATE bill_items
          SET name=?, department_name=?, price=?, total=quantity*?, net_amount=MAX((quantity*?) - discount_amount, 0), priority=?
          WHERE item_type='TEST' AND item_id=? AND bill_id IN (SELECT id FROM bills WHERE date(bill_date) >= date(?))`)
          .run(displayName || t.name || '', departmentName, +t.price || 0, +t.price || 0, +t.price || 0, priority, testId, targets.billingDate);
        this.audit('test.propagate.billing', `${code} from ${targets.billingDate}`);
      }
      if (id && targets.profiles && targets.profileDate) {
        this.db.prepare('UPDATE profile_tests SET priority=COALESCE(NULLIF(priority,0), ?) WHERE test_id=?').run(priority, testId);
        this.audit('test.propagate.profiles', `${code} from ${targets.profileDate}`);
      }
      this.db.prepare('UPDATE tests SET start_new_page=? WHERE id=?').run(t.start_new_page ? 1 : 0, testId);
      if (id) this.audit('test.update', `${code}`); else this.audit('test.create', `${code}`);
    });
    tx();
    return this.listTests();
  }

  protected normalizedReferenceMode(t: any) {
    return String(t?.reference_mode || t?.referenceMode || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  protected isSingleReferenceMode(t: any) {
    const mode = this.normalizedReferenceMode(t);
    return mode === 'SINGLE' || mode === 'GENERAL' || mode === 'ALL' || mode === 'NORMAL' || mode === 'COMMON';
  }

  protected usesMaleFemaleReferencePayload(t: any) {
    if (this.isSingleReferenceMode(t)) return false;
    const mode = this.normalizedReferenceMode(t);
    const hasMode = mode.includes('MALE') && mode.includes('FEMALE');
    if (hasMode) return true;

    // Backward compatibility for older UI payloads that did not send reference_mode.
    // Do not use this fallback when the user explicitly selected Single/General mode.
    const hasMale = String(t?.male_reference_text || '').trim() !== '' || t?.male_lower !== undefined || t?.male_upper !== undefined;
    const hasFemale = String(t?.female_reference_text || '').trim() !== '' || t?.female_lower !== undefined || t?.female_upper !== undefined;
    return hasMale || hasFemale;
  }

  protected defaultReferenceTextFromPayload(t: any) {
    if (this.usesMaleFemaleReferencePayload(t)) {
      return t.reference_text || t.normal_range || t.male_reference_text || t.female_reference_text || '';
    }
    return t.reference_text || t.normal_range || t.male_reference_text || t.female_reference_text || '';
  }

  protected referenceRangesForSave(t: any) {
    if (this.usesMaleFemaleReferencePayload(t)) return this.buildReferenceRangesFromPayload({ ...t, reference_ranges: undefined });

    const incoming = Array.isArray(t.reference_ranges) ? t.reference_ranges.map((r:any) => ({ ...r, gender: this.normalizeReferenceGender(r.gender || 'ALL') })) : [];
    const isPlainAll = (r:any) => this.normalizeReferenceGender(r.gender || 'ALL') === 'ALL'
      && (r.age_min === null || r.age_min === undefined || r.age_min === '')
      && (r.age_max === null || r.age_max === undefined || r.age_max === '');
    const existingAll = incoming.find(isPlainAll) || {};
    const hasTopReference = Object.prototype.hasOwnProperty.call(t, 'reference_text') || Object.prototype.hasOwnProperty.call(t, 'normal_range') || Object.prototype.hasOwnProperty.call(t, 'ref_lower') || Object.prototype.hasOwnProperty.call(t, 'ref_upper');
    const primary = {
      gender: 'ALL',
      age_min: null,
      age_max: null,
      age_unit: 'YEARS',
      lower_limit: t.ref_lower ?? existingAll?.lower_limit ?? null,
      upper_limit: t.ref_upper ?? existingAll?.upper_limit ?? null,
      reference_text: String(t.reference_text ?? t.normal_range ?? existingAll?.reference_text ?? '').trim(),
      flag_enabled: t.flag_enabled !== false,
      critical_low: t.critical_low ?? existingAll?.critical_low ?? null,
      critical_high: t.critical_high ?? existingAll?.critical_high ?? null,
      display_order: 1000,
      is_active: 1
    };

    // When the user explicitly changes Male/Female mode back to Single/General,
    // never keep stale MALE/FEMALE reference rows from the form payload.
    if (this.isSingleReferenceMode(t)) return [primary];

    if (!incoming.length) return [primary];

    const plainIndex = incoming.findIndex(isPlainAll);
    if (plainIndex >= 0) {
      incoming[plainIndex] = { ...incoming[plainIndex], ...primary, display_order: incoming[plainIndex].display_order ?? primary.display_order };
    } else if (hasTopReference && (primary.reference_text || primary.lower_limit !== null || primary.upper_limit !== null)) {
      incoming.unshift(primary);
    }
    return incoming;
  }

  protected buildReferenceRangesFromPayload(t: any) {
    if (this.usesMaleFemaleReferencePayload(t)) {
      const rows:any[] = [];
      const generalText = String(t.reference_text || '').trim();
      if (generalText || t.ref_lower !== undefined || t.ref_upper !== undefined) {
        rows.push({ gender:'ALL', lower_limit:t.ref_lower, upper_limit:t.ref_upper, reference_text:generalText || t.normal_range || '', flag_enabled:t.flag_enabled !== false, critical_low:t.critical_low, critical_high:t.critical_high, display_order:1000 });
      }
      const flagsOn = t.flag_enabled !== false;
      rows.push(
        { gender:'MALE', lower_limit:t.male_lower, upper_limit:t.male_upper, reference_text:t.male_reference_text || '', flag_enabled:flagsOn, critical_low:flagsOn ? t.male_critical_low : null, critical_high:flagsOn ? t.male_critical_high : null, display_order:2000 },
        { gender:'FEMALE', lower_limit:t.female_lower, upper_limit:t.female_upper, reference_text:t.female_reference_text || '', flag_enabled:flagsOn, critical_low:flagsOn ? t.female_critical_low : null, critical_high:flagsOn ? t.female_critical_high : null, display_order:3000 }
      );
      return rows;
    }
    return [{ gender:'ALL', lower_limit:t.ref_lower, upper_limit:t.ref_upper, reference_text:t.reference_text || t.normal_range || '', flag_enabled:t.flag_enabled !== false, critical_low:t.critical_low, critical_high:t.critical_high, display_order:1000 }];
  }


  protected countRows(sql: string, ...params: any[]) {
    const row = this.db.prepare(sql).get(...params) as any;
    return +(row?.count || 0);
  }

  protected getTestDeleteBlockers(testId: number) {
    const blockers = [
      { label: 'Profile Master', count: this.countRows("SELECT COUNT(*) count FROM profile_items WHERE item_type='TEST' AND test_id=?", testId) + this.countRows('SELECT COUNT(*) count FROM profile_tests WHERE test_id=?', testId) },
      { label: 'Billing / bill items', count: this.countRows("SELECT COUNT(*) count FROM bill_items WHERE item_type='TEST' AND item_id=?", testId) },
      { label: 'Report Typing / saved reports', count: this.countRows('SELECT COUNT(*) count FROM quick_report_items WHERE test_id=?', testId) + this.countRows('SELECT COUNT(*) count FROM report_items WHERE test_id=?', testId) },
      { label: 'Specimen collection', count: this.countRows('SELECT COUNT(*) count FROM specimen_collection_tests WHERE test_id=?', testId) },
      { label: 'Other calculated test formulas', count: this.countRows("SELECT COUNT(*) count FROM test_formula_variables v JOIN test_formulas f ON f.id=v.formula_id WHERE v.source_test_id=? AND f.test_id<>?", testId, testId) }
    ].filter(x => x.count > 0);
    return blockers;
  }

  deleteTest(id: number) {
    const testId = +id;
    const blockers = this.getTestDeleteBlockers(testId);
    if (blockers.length) {
      const details = blockers.map(x => `${x.label}: ${x.count}`).join(', ');
      const err:any = new Error(`Cannot delete this test because it is already mapped/used. Remove the mapping first. ${details}`);
      err.code = 'TEST_MAPPED_CANNOT_DELETE';
      err.details = blockers;
      throw err;
    }
    const tx = this.db.transaction(() => {
      const formulaIds = (this.db.prepare('SELECT id FROM test_formulas WHERE test_id=?').all(testId) as any[]).map(x => +x.id);
      formulaIds.forEach(fid => this.db.prepare('DELETE FROM test_formula_variables WHERE formula_id=?').run(fid));
      this.db.prepare('DELETE FROM test_formulas WHERE test_id=?').run(testId);
      this.db.prepare('DELETE FROM test_reference_ranges WHERE test_id=?').run(testId);
      this.db.prepare('DELETE FROM test_result_options WHERE test_id=?').run(testId);
      this.db.prepare('DELETE FROM test_specimen_mappings WHERE test_id=?').run(testId);
      this.db.prepare('DELETE FROM test_reagent_consumption WHERE test_id=?').run(testId);
      this.db.prepare('DELETE FROM tests WHERE id=?').run(testId);
    });
    tx();
    this.audit('test.delete', JSON.stringify({ id:testId }));
    return this.listTests();
  }

  reorderTests(items: any[]) {
    const tx = this.db.transaction(() => {
      (items || []).forEach((x:any, i:number) => {
        const reportOrder = +x.report_order || ((i + 1) * 1000);
        const billingOrder = +x.billing_order || reportOrder;
        const priority = Math.max(1, Math.round(reportOrder / 1000));
        this.db.prepare('UPDATE tests SET report_order=?,billing_order=?,priority=? WHERE id=?').run(reportOrder, billingOrder, priority, +x.id);
      });
    });
    tx();
    this.audit('test.reorder', JSON.stringify(items || []));
    return this.listTests();
  }

  listProfiles(activeOnly = false) {
    this.ensureProfileBuilderSchema();
    const profiles = this.db.prepare(`SELECT p.*, CASE WHEN COALESCE(p.department_id,0)=0 THEN 'Mixed' ELSE COALESCE(d.name,'Mixed') END department_name FROM profiles p LEFT JOIN departments d ON d.id=p.department_id ${activeOnly?'WHERE p.active=1 AND p.billable=1':''} ORDER BY COALESCE(NULLIF(p.billing_order,0), NULLIF(p.report_order,0), p.priority), p.name`).all() as any[];
    const itemStmt = this.db.prepare(`SELECT pi.*, pi.child_profile_id profile_id_ref, t.name test_name, p.name profile_name, p.display_name profile_display_name
      FROM profile_items pi
      LEFT JOIN tests t ON t.id=pi.test_id
      LEFT JOIN profiles p ON p.id=pi.child_profile_id
      WHERE pi.profile_id=?
      ORDER BY pi.priority, pi.id`);
    return profiles.map(p => {
      const items = itemStmt.all(p.id) as any[];
      const normalized = items.map(x => ({...x, item_type: String(x.item_type || 'TEST').toUpperCase(), profile_id: x.child_profile_id, display_profile_name: x.display_profile_name !== 0}));
      const autoRunningCost = this.profileRunningCost(+p.id, new Set<number>(), true);
      const runningCostMode = String(p.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO';
      const effectiveRunningCost = runningCostMode === 'MANUAL' ? Math.max(0, +p.running_cost || 0) : autoRunningCost;
      return {...p, display_name: p.display_name || p.name || '', department_id:+p.department_id || 0, department_name:p.department_name || 'Mixed', running_cost:+effectiveRunningCost.toFixed(2), manual_running_cost:Math.max(0, +p.running_cost || 0), auto_running_cost:autoRunningCost, running_cost_mode:runningCostMode, active_for_reporting: p.active_for_reporting !== 0, show_profile_name: p.show_profile_name !== 0, ordering_mode: p.ordering_mode || 'MANUAL', billing_order: p.billing_order || p.priority || 0, report_order: p.report_order || p.priority || 0, search_keywords: p.search_keywords || '', interpretation_enabled: p.interpretation_enabled === 1, interpretation_text: p.interpretation_text || '', break_page_after: Number(p.break_page_after || p.start_new_page || 0) === 1, start_new_page:false, items: normalized, tests: normalized.filter(x => x.item_type === 'TEST').map(x => ({ test_id:x.test_id, priority:x.priority, side_header:'', test_name:x.test_name }))};
    });
  }
  saveProfile(p: any) {
    this.ensureProfileBuilderSchema();
    const plannedItems = Array.isArray(p.items) && p.items.length ? p.items : (p.tests||[]).map((x:any)=>({ item_type:'TEST', test_id:x.test_id, priority:x.priority, side_header:x.side_header }));
    const conflictList = this.validateProfileItems(+p.id || 0, plannedItems);
    if (conflictList.length && !p.confirm_conflicts) throw new Error('Profile conflicts found: ' + conflictList.join(' | '));
    const tx = this.db.transaction(() => {
      const runningCostMode = String(p.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO';
      const manualRunningCost = Math.max(0, +p.running_cost || +p.manual_running_cost || 0);
      const interpretationText = String(p.interpretation_text ?? p.interpretation_html ?? p.interpretation ?? '');
      const interpretationEnabled = this.toBool01(p.interpretation_enabled);
      const vals=[p.code||'',p.name,p.display_name || p.name || '',+p.department_id||0,+p.price||0,manualRunningCost,runningCostMode,+p.priority||0,p.side_header||'',p.active?1:0,p.billable?1:0,p.active_for_reporting === false || p.active_for_reporting === 0 ? 0 : 1,p.show_profile_name === false || p.show_profile_name === 0 ? 0 : 1,p.ordering_mode || 'MANUAL',+p.billing_order||+p.priority||0,+p.report_order||+p.priority||0,p.search_keywords||'',interpretationEnabled,interpretationText];
      let id=+p.id||0;
      if(id) this.db.prepare('UPDATE profiles SET code=?,name=?,display_name=?,department_id=?,price=?,running_cost=?,running_cost_mode=?,priority=?,side_header=?,active=?,billable=?,active_for_reporting=?,show_profile_name=?,ordering_mode=?,billing_order=?,report_order=?,search_keywords=?,interpretation_enabled=?,interpretation_text=? WHERE id=?').run(...vals,id);
      else id=Number(this.db.prepare('INSERT INTO profiles(code,name,display_name,department_id,price,running_cost,running_cost_mode,priority,side_header,active,billable,active_for_reporting,show_profile_name,ordering_mode,billing_order,report_order,search_keywords,interpretation_enabled,interpretation_text) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);
      this.db.prepare('DELETE FROM profile_items WHERE profile_id=?').run(id);
      this.db.prepare('DELETE FROM profile_tests WHERE profile_id=?').run(id);
      const sourceItems = plannedItems;
      const itemInsert = this.db.prepare('INSERT INTO profile_items(profile_id,item_type,test_id,child_profile_id,header_text,priority,side_header,display_profile_name) VALUES(?,?,?,?,?,?,?,?)');
      const legacyInsert = this.db.prepare('INSERT OR REPLACE INTO profile_tests(profile_id,test_id,priority,side_header) VALUES(?,?,?,?)');
      sourceItems.forEach((x:any,i:number) => {
        const type = String(x.item_type || 'TEST').toUpperCase();
        const priority = +x.priority || i+1;
        const sideHeader = type === 'HEADER' ? (x.side_header || x.header_text || '') : '';
        if(type === 'PROFILE') {
          const childId = +x.profile_id || +x.child_profile_id || 0;
          if(childId && childId !== id) itemInsert.run(id,'PROFILE',null,childId,null,priority,'',x.display_profile_name === false || x.display_profile_name === 0 ? 0 : 1);
        } else if(type === 'HEADER') {
          itemInsert.run(id,'HEADER',null,null,sideHeader,priority,sideHeader,1);
        } else {
          const testId = +x.test_id || 0;
          if(testId) { itemInsert.run(id,'TEST',testId,null,null,priority,'',1); legacyInsert.run(id,testId,priority,''); }
        }
      });
      this.db.prepare('UPDATE profiles SET break_page_after=?, start_new_page=0 WHERE id=?').run(p.break_page_after || p.start_new_page ? 1 : 0, id);
      if(+p.id && p.update_pending_bills) {
        const targets = p.update_targets || {};
        const fromDate = this.normalizeDateOnly(targets.billingFromDate || targets.billingDate || targets.fromDate || '', '');
        const toDate = this.normalizeDateOnly(targets.billingToDate || targets.billingDate || targets.toDate || fromDate, '');
        if(!fromDate || !toDate) throw new Error('Pending bill date range is required for profile billing propagation.');
        const departmentName = (this.db.prepare('SELECT name FROM departments WHERE id=?').get(+p.department_id || 0) as any)?.name || '';
        const profileName = this.normalizeName(p.display_name || p.name || '');
        const profilePrice = +p.price || 0;
        const profilePriority = +p.billing_order || +p.report_order || +p.priority || 0;
        const profileSideHeader = this.normalizeName(p.side_header || p.display_name || p.name || '');
        const info = this.db.prepare(`UPDATE bill_items
          SET name=?, department_name=?, price=?, total=quantity*?, net_amount=MAX((quantity*?) - discount_amount, 0), priority=?, side_header=?
          WHERE item_type='PROFILE' AND item_id=?
            AND bill_id IN (SELECT id FROM bills WHERE date(bill_date) BETWEEN date(?) AND date(?))
            AND bill_id NOT IN (SELECT bill_id FROM reports WHERE COALESCE(status,'')='APPROVED')
            AND bill_id NOT IN (SELECT bill_id FROM quick_reports WHERE COALESCE(status,'') IN ('FINISHED','APPROVED'))`)
          .run(profileName, departmentName, profilePrice, profilePrice, profilePrice, profilePriority, profileSideHeader, id, fromDate, toDate);
        this.audit('profile.propagate.pending_bills', JSON.stringify({ profile_id:id, code:p.code || '', name:profileName, fromDate, toDate, changed:info.changes }));
      }
    });
    tx();
    return this.listProfiles();
  }


  deleteProfile(id: number) {
    this.ensureProfileBuilderSchema();
    const profileId = +id;
    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM profile_items WHERE profile_id=?').run(profileId);
      this.db.prepare('DELETE FROM profile_items WHERE child_profile_id=?').run(profileId);
      this.db.prepare('DELETE FROM profile_tests WHERE profile_id=?').run(profileId);
      this.db.prepare("DELETE FROM bill_items WHERE item_type='PROFILE' AND item_id=?").run(profileId);
      this.db.prepare('DELETE FROM profiles WHERE id=?').run(profileId);
    });
    tx();
    this.audit('profile.delete.hard', JSON.stringify({ id: profileId }));
    return this.listProfiles();
  }

  listPatients(q = '') { return this.db.prepare('SELECT * FROM patients WHERE name LIKE ? OR mobile LIKE ? OR patient_no LIKE ? OR title LIKE ? OR guardian_name LIKE ? ORDER BY id DESC LIMIT 200').all(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`); }
  savePatient(p: any) { const id=+p.id||0; const no=p.patient_no || this.nextConfiguredNo('patient', 'patients', 'patient_no'); const ageValue = p.age_value === '' || p.age_value === undefined || p.age_value === null ? null : +p.age_value; const vals=[no,p.title||'',p.name,p.dob||'',p.age||'',ageValue,p.age_unit||'YEARS',p.gender||'',p.relation_type||'',p.guardian_name||'',p.guardian_mobile||'',p.age_split ? 1 : 0,p.mobile||'',p.email||'',p.address||'',p.history||'']; const now=this.nowIst(); if(id) this.db.prepare('UPDATE patients SET patient_no=?,title=?,name=?,dob=?,age=?,age_value=?,age_unit=?,gender=?,relation_type=?,guardian_name=?,guardian_mobile=?,age_split=?,mobile=?,email=?,address=?,history=?,updated_at=? WHERE id=?').run(...vals,now,id); else return this.db.prepare('INSERT INTO patients(patient_no,title,name,dob,age,age_value,age_unit,gender,relation_type,guardian_name,guardian_mobile,age_split,mobile,email,address,history,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals,now,now).lastInsertRowid; return id; }
  listConsultants() {
    this.ensureCommissionSchema();
    const rows = this.db.prepare('SELECT * FROM consultants ORDER BY name').all() as any[];
    const profiles = this.db.prepare('SELECT * FROM consultant_commission_profiles ORDER BY is_default DESC, id').all() as any[];
    const rules = this.db.prepare('SELECT r.*, cp.profile_name commission_profile_name FROM consultant_commission_rules r LEFT JOIN consultant_commission_profiles cp ON cp.id=r.commission_profile_id ORDER BY r.id').all() as any[];
    return rows.map(c => ({
      ...c,
      commission_profiles: profiles.filter(p => +p.consultant_id === +c.id).map(p => ({...p, active: p.active !== 0, is_default: p.is_default === 1})),
      commission_rules: rules.filter(r => +r.consultant_id === +c.id)
    }));
  }

  saveConsultant(c: any) {
    this.ensureCommissionSchema();
    const vals=[c.name,c.phone||'',c.clinic||'',c.active?1:0,c.default_commission_type||'PERCENT',+c.default_commission_value||0,c.default_commission_profile_id || null];
    let id=+c.id||0;
    const tx = this.db.transaction(() => {
      if(id) this.db.prepare('UPDATE consultants SET name=?,phone=?,clinic=?,active=?,default_commission_type=?,default_commission_value=?,default_commission_profile_id=? WHERE id=?').run(...vals,id);
      else id = Number(this.db.prepare('INSERT INTO consultants(name,phone,clinic,active,default_commission_type,default_commission_value,default_commission_profile_id) VALUES(?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);
      if (Array.isArray(c.commission_profiles)) {
        this.db.prepare('DELETE FROM consultant_commission_rules WHERE consultant_id=?').run(id);
        this.db.prepare('DELETE FROM consultant_commission_profiles WHERE consultant_id=?').run(id);
        const profileIdMap = new Map<any, number>();
        const profileInsert = this.db.prepare('INSERT INTO consultant_commission_profiles(consultant_id,profile_name,description,commission_type,commission_value,calculation_base,extra_deduction_type,extra_deduction_value,min_commission,max_commission,round_mode,discount_basis,fixed_apply_mode,effective_from,effective_to,status,active,is_default) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        for (const p of c.commission_profiles) {
          const name = this.normalizeName(p.profile_name || p.name || 'Commission Profile');
          const newId = Number(profileInsert.run(id, name, p.description || '', this.normalizeCommissionType(p.commission_type), +p.commission_value || 0, this.normalizeCalculationBase(p.calculation_base), this.normalizeDeductionType(p.extra_deduction_type), +p.extra_deduction_value || 0, Math.max(0,+p.min_commission||0), Math.max(0,+p.max_commission||0), this.normalizeCommissionRoundMode(p.round_mode), this.normalizeDiscountBasis(p.discount_basis), this.normalizeFixedApplyMode(p.fixed_apply_mode), p.effective_from || null, p.effective_to || null, this.normalizeCommissionStatus(p.status), p.active === false ? 0 : 1, p.is_default ? 1 : 0).lastInsertRowid);
          profileIdMap.set(p.id || p.temp_id || name, newId);
          profileIdMap.set(String(p.id || p.temp_id || name), newId);
          profileIdMap.set(p.temp_id || String(p.id || name), newId);
          if (p.is_default) this.db.prepare('UPDATE consultants SET default_commission_profile_id=? WHERE id=?').run(newId, id);
        }
        const defaultProfile = this.db.prepare('SELECT id FROM consultant_commission_profiles WHERE consultant_id=? AND is_default=1 ORDER BY id LIMIT 1').get(id) as any;
        if (!defaultProfile?.id) {
          const first = this.db.prepare('SELECT id FROM consultant_commission_profiles WHERE consultant_id=? ORDER BY id LIMIT 1').get(id) as any;
          if (first?.id) this.db.prepare('UPDATE consultant_commission_profiles SET is_default=1 WHERE id=?').run(first.id);
          if (first?.id) this.db.prepare('UPDATE consultants SET default_commission_profile_id=? WHERE id=?').run(first.id, id);
        }
        const ruleInsert = this.db.prepare('INSERT INTO consultant_commission_rules(consultant_id,item_type,item_id,action,commission_profile_id) VALUES(?,?,?,?,?)');
        for (const r of (c.commission_rules || [])) {
          const action = String(r.action || 'USE_PROFILE').toUpperCase() === 'NO_COMMISSION' ? 'NO_COMMISSION' : 'USE_PROFILE';
          const profileRef = r.commission_profile_id || r.profile_temp_id || r.commission_profile_name;
          const commissionProfileId = action === 'NO_COMMISSION' ? null : (profileIdMap.get(profileRef) || Number(profileRef) || null);
          if (r.item_id && (String(r.item_type || '').toUpperCase() === 'TEST' || String(r.item_type || '').toUpperCase() === 'PROFILE')) ruleInsert.run(id, String(r.item_type).toUpperCase(), +r.item_id, action, commissionProfileId);
        }
      }
    });
    tx();
    return this.listConsultants();
  }

  deleteConsultant(id: number) {
    this.ensureCommissionSchema();
    const consultantId = Number(id || 0);
    if (!consultantId) throw new Error('Invalid consultant.');
    const consultant = this.db.prepare('SELECT * FROM consultants WHERE id=?').get(consultantId) as any;
    if (!consultant) return { action: 'missing', consultants: this.listConsultants() };

    const billCount = Number((this.db.prepare('SELECT COUNT(*) count FROM bills WHERE consultant_id=?').get(consultantId) as any)?.count || 0);
    const hasAuditReferences = billCount > 0;

    if (hasAuditReferences) {
      this.db.prepare('UPDATE consultants SET active=0 WHERE id=?').run(consultantId);
      this.audit('consultant.archive', JSON.stringify({ id: consultantId, name: consultant.name, billCount }));
      return { action: 'archived', consultants: this.listConsultants() };
    }

    const tx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM consultant_commission_rules WHERE consultant_id=?').run(consultantId);
      this.db.prepare('DELETE FROM consultant_commission_profiles WHERE consultant_id=?').run(consultantId);
      this.db.prepare('DELETE FROM consultant_commissions WHERE consultant_id=?').run(consultantId);
      this.db.prepare('DELETE FROM consultants WHERE id=?').run(consultantId);
    });
    tx();
    this.audit('consultant.delete', JSON.stringify({ id: consultantId, name: consultant.name }));
    return { action: 'deleted', consultants: this.listConsultants() };
  }

  protected normalizeCommissionType(value:any) {
    const v = String(value || 'PERCENT').toUpperCase();
    return ['NONE','PERCENT','FIXED'].includes(v) ? v : 'PERCENT';
  }
  protected normalizeCalculationBase(value:any) {
    const v = String(value || 'GROSS').toUpperCase();
    return ['GROSS','NET_AFTER_COST','NET_AFTER_COST_DEDUCTION'].includes(v) ? v : 'GROSS';
  }
  protected normalizeDeductionType(value:any) {
    const v = String(value || 'NONE').toUpperCase();
    return ['NONE','AMOUNT','PERCENT'].includes(v) ? v : 'NONE';
  }

  protected normalizeCommissionRoundMode(value:any) {
    const v = String(value || 'NONE').toUpperCase();
    return ['NONE','RUPEE','NEAREST_5','NEAREST_10','FLOOR','CEIL'].includes(v) ? v : 'NONE';
  }
  protected normalizeDiscountBasis(value:any) {
    const v = String(value || 'AFTER_DISCOUNT').toUpperCase();
    return ['BEFORE_DISCOUNT','AFTER_DISCOUNT'].includes(v) ? v : 'AFTER_DISCOUNT';
  }
  protected normalizeFixedApplyMode(value:any) {
    const v = String(value || 'PER_ITEM').toUpperCase();
    return ['PER_ITEM','PER_BILL','PER_QUANTITY'].includes(v) ? v : 'PER_ITEM';
  }
  protected normalizeCommissionStatus(value:any) {
    const v = String(value || 'GENERATED').toUpperCase();
    return ['GENERATED','APPROVED','PAID','HELD','CANCELLED'].includes(v) ? v : 'GENERATED';
  }
  protected isProfileEffective(profile:any, onDate = new Date()) {
    const from = String(profile?.effective_from || '').trim();
    const to = String(profile?.effective_to || '').trim();
    const day = onDate.toISOString().slice(0,10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  }
  protected applyCommissionRounding(value:number, mode:any) {
    const v = Math.max(0, Number(value) || 0);
    switch (this.normalizeCommissionRoundMode(mode)) {
      case 'RUPEE': return Math.round(v);
      case 'NEAREST_5': return Math.round(v / 5) * 5;
      case 'NEAREST_10': return Math.round(v / 10) * 10;
      case 'FLOOR': return Math.floor(v);
      case 'CEIL': return Math.ceil(v);
      default: return v;
    }
  }

  protected testRunningCost(testId:number): number {
    const row = this.db.prepare('SELECT running_cost,outsourced_test,vendor_cost FROM tests WHERE id=?').get(testId) as any;
    if (Number(row?.outsourced_test) === 1 && (+row?.vendor_cost || 0) > 0) return Math.max(0, +row.vendor_cost || 0);
    return Math.max(0, +row?.running_cost || 0);
  }

  protected profileRunningCost(profileId:number, seen: Set<number> = new Set<number>(), forceAuto: boolean = false): number {
    if (!profileId || seen.has(profileId)) return 0;
    const profile = this.db.prepare('SELECT running_cost,running_cost_mode FROM profiles WHERE id=?').get(profileId) as any;
    if (!forceAuto && String(profile?.running_cost_mode || 'AUTO').toUpperCase() === 'MANUAL') return +Math.max(0, +profile.running_cost || 0).toFixed(2);
    const next = new Set(seen); next.add(profileId);
    const items = this.db.prepare('SELECT * FROM profile_items WHERE profile_id=? ORDER BY priority,id').all(profileId) as any[];
    if (items.length) {
      return +items.reduce((sum:number, it:any): number => {
        const type = String(it.item_type || 'TEST').toUpperCase();
        if (type === 'TEST') return sum + this.testRunningCost(+it.test_id || 0);
        if (type === 'PROFILE') return sum + this.profileRunningCost(+it.child_profile_id || 0, next);
        return sum;
      }, 0).toFixed(2);
    }
    const legacy = this.db.prepare('SELECT test_id FROM profile_tests WHERE profile_id=?').all(profileId) as any[];
    return +legacy.reduce((sum:number, x:any) => sum + this.testRunningCost(+x.test_id || 0), 0).toFixed(2);
  }

  protected resolveItemRunningCost(item:any): number {
    const type = String(item.item_type || '').toUpperCase();
    if (type === 'PROFILE') return this.profileRunningCost(+item.item_id || 0);
    return this.testRunningCost(+item.item_id || 0);
  }

  protected commissionAllowedForItem(item:any): boolean {
    const type = String(item.item_type || '').toUpperCase();
    if (type !== 'TEST') return true;
    const row = this.db.prepare('SELECT outsourced_test,commission_allowed FROM tests WHERE id=?').get(+item.item_id || 0) as any;
    return !(Number(row?.outsourced_test) === 1 && Number(row?.commission_allowed) === 0);
  }

  protected commissionFormulaVariables(item:any, netAmount:number, runningCost:number, beforeDiscountAmount:number) {
    const quantity = Math.max(1, Number(item?.quantity || 1));
    const sellingPrice = Math.max(0, Number(beforeDiscountAmount || netAmount || 0));
    const net = Math.max(0, Number(netAmount || 0));
    const discount = Math.max(0, sellingPrice - net);
    const profit = net - Math.max(0, Number(runningCost || 0));
    return { SELLING_PRICE:sellingPrice, NET_AMOUNT:net, TEST_COST:Math.max(0,Number(runningCost||0)), PROFIT:profit, DISCOUNT:discount, QUANTITY:quantity, COLLECTED_AMOUNT:net, DUE_AMOUNT:0 };
  }

  protected evaluateCommissionFormula(expression:string, variables:Record<string,number>): number {
    const source=String(expression||'').trim().toUpperCase();
    if(!source) throw new Error('Formula is empty.');
    const allowedVars=new Set(['SELLING_PRICE','NET_AMOUNT','TEST_COST','PROFIT','DISCOUNT','QUANTITY','COLLECTED_AMOUNT','DUE_AMOUNT']);
    const tokens:string[]=[];
    const rx=/\s*(\d+(?:\.\d+)?|[A-Z_][A-Z0-9_]*|[()+\-*/,])\s*/gy;
    let pos=0;
    while(pos<source.length){rx.lastIndex=pos;const m=rx.exec(source);if(!m||m.index!==pos)throw new Error(`Unsupported formula token near: ${source.slice(pos,pos+12)}`);tokens.push(m[1]);pos=rx.lastIndex;}
    let i=0;
    const peek=()=>tokens[i];
    const take=()=>tokens[i++];
    const parseExpression=():number=>{let v=parseTerm();while(peek()==='+'||peek()==='-'){const op=take();const r=parseTerm();v=op==='+'?v+r:v-r;}return v;};
    const parseTerm=():number=>{let v=parseUnary();while(peek()==='*'||peek()==='/'){const op=take();const r=parseUnary();if(op==='/'&&Math.abs(r)<1e-12)throw new Error('Division by zero.');v=op==='*'?v*r:v/r;}return v;};
    const parseUnary=():number=>{if(peek()==='+'){take();return parseUnary();}if(peek()==='-'){take();return -parseUnary();}return parsePrimary();};
    const parsePrimary=():number=>{
      const t=take(); if(t===undefined)throw new Error('Unexpected end of formula.');
      if(/^\d/.test(t))return Number(t);
      if(t==='('){const v=parseExpression();if(take()!==')')throw new Error('Missing closing bracket.');return v;}
      if(/^[A-Z_]/.test(t)){
        if(peek()==='('){take();const args:number[]=[];if(peek()!==')'){args.push(parseExpression());while(peek()===','){take();args.push(parseExpression());}}if(take()!==')')throw new Error('Missing closing bracket.');
          if(t==='MIN'&&args.length>=1)return Math.min(...args);if(t==='MAX'&&args.length>=1)return Math.max(...args);if(t==='ABS'&&args.length===1)return Math.abs(args[0]);if(t==='ROUND'&&args.length===1)return Math.round(args[0]);throw new Error(`Unsupported function or argument count: ${t}`);
        }
        if(!allowedVars.has(t))throw new Error(`Unknown formula variable: ${t}`);return Number(variables[t]||0);
      }
      throw new Error(`Unexpected token: ${t}`);
    };
    const result=parseExpression();if(i!==tokens.length)throw new Error(`Unexpected token: ${tokens[i]}`);if(!Number.isFinite(result))throw new Error('Formula produced an invalid number.');return Math.max(0,result);
  }

  validateCommissionFormula(payload:any={}) {
    try {
      const vars={SELLING_PRICE:1000,NET_AMOUNT:900,TEST_COST:400,PROFIT:500,DISCOUNT:100,QUANTITY:1,COLLECTED_AMOUNT:900,DUE_AMOUNT:0,...(payload.variables||{})};
      const result=this.evaluateCommissionFormula(String(payload.formula||''),vars);
      return {valid:true,result:+result.toFixed(2),variables:vars};
    } catch(e:any) { return {valid:false,error:e?.message||String(e)}; }
  }

  listCommissionGroups() {
    this.ensureCommissionSchema();
    const groups=this.db.prepare('SELECT * FROM commission_groups ORDER BY active DESC,name COLLATE NOCASE').all() as any[];
    const itemStmt=this.db.prepare(`SELECT cgi.*,CASE WHEN cgi.item_type='TEST' THEN COALESCE(t.display_name,t.name) ELSE COALESCE(p.display_name,p.name) END item_name FROM commission_group_items cgi LEFT JOIN tests t ON cgi.item_type='TEST' AND t.id=cgi.item_id LEFT JOIN profiles p ON cgi.item_type='PROFILE' AND p.id=cgi.item_id WHERE cgi.group_id=? ORDER BY item_name`);
    const consultantStmt=this.db.prepare('SELECT consultant_id FROM consultant_commission_group_assignments WHERE group_id=? AND active=1 ORDER BY consultant_id');
    return groups.map(g=>({...g,items:itemStmt.all(g.id),consultant_ids:(consultantStmt.all(g.id) as any[]).map(x=>Number(x.consultant_id))}));
  }

  saveCommissionGroup(payload:any) {
    this.ensureCommissionSchema();
    const name=String(payload?.name||'').trim(); if(!name) throw new Error('Group name is required.');
    const formula=String(payload.formula_expression||'').trim();
    if(String(payload.calculation_type||'').toUpperCase()==='FORMULA') {
      const checked=this.validateCommissionFormula({formula}); if(!checked.valid) throw new Error(checked.error);
    }
    const tx=this.db.transaction(()=>{
      let id=Number(payload.id||0); const now=this.nowIst();
      const vals=[name,String(payload.code||''),String(payload.description||''),String(payload.calculation_type||'PERCENT_NET').toUpperCase(),Number(payload.rate||0),Number(payload.fixed_amount||0),String(payload.formula_type||'PREDEFINED').toUpperCase(),formula,String(payload.discount_basis||'AFTER_DISCOUNT').toUpperCase(),String(payload.profile_mode||'PROFILE_ONLY').toUpperCase(),Number(payload.min_commission||0),Number(payload.max_commission||0),payload.effective_from||null,payload.effective_to||null,payload.active===false?0:1,now];
      if(id) { this.db.prepare('UPDATE commission_groups SET name=?,code=?,description=?,calculation_type=?,rate=?,fixed_amount=?,formula_type=?,formula_expression=?,discount_basis=?,profile_mode=?,min_commission=?,max_commission=?,effective_from=?,effective_to=?,active=?,version=version+1,updated_at=? WHERE id=?').run(...vals,id); }
      else id=Number(this.db.prepare('INSERT INTO commission_groups(name,code,description,calculation_type,rate,fixed_amount,formula_type,formula_expression,discount_basis,profile_mode,min_commission,max_commission,effective_from,effective_to,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...vals).lastInsertRowid);
      this.db.prepare('DELETE FROM commission_group_items WHERE group_id=?').run(id);
      const ins=this.db.prepare('INSERT OR IGNORE INTO commission_group_items(group_id,item_type,item_id) VALUES(?,?,?)');
      for(const it of payload.items||[]) ins.run(id,String(it.item_type||'TEST').toUpperCase(),Number(it.item_id||it.id||0));
      if(Array.isArray(payload.consultant_ids)) {
        this.db.prepare('DELETE FROM consultant_commission_group_assignments WHERE group_id=?').run(id);
        const assign=this.db.prepare('INSERT OR IGNORE INTO consultant_commission_group_assignments(consultant_id,group_id,priority,active) VALUES(?,?,?,1)');
        for(const consultantId of payload.consultant_ids) assign.run(Number(consultantId),id,Number(payload.priority||100));
      }
      this.audit('commission.group.save',JSON.stringify({id,name,itemCount:(payload.items||[]).length,consultants:(payload.consultant_ids||[]).length}));
      return id;
    });
    const id=tx(); return {id,groups:this.listCommissionGroups()};
  }

  deleteCommissionGroup(id:number) {
    this.ensureCommissionSchema();
    const used=(this.db.prepare('SELECT COUNT(*) c FROM consultant_commission_group_assignments WHERE group_id=?').get(id) as any)?.c||0;
    if(used) this.db.prepare('UPDATE commission_groups SET active=0,updated_at=? WHERE id=?').run(this.nowIst(),id);
    else this.db.prepare('DELETE FROM commission_groups WHERE id=?').run(id);
    this.audit('commission.group.delete',JSON.stringify({id,archived:!!used}));
    return this.listCommissionGroups();
  }

  listConsultantGroupAssignments(consultantId:number) {
    this.ensureCommissionSchema();
    return this.db.prepare(`SELECT a.*,g.name group_name,g.calculation_type,g.rate,g.formula_expression FROM consultant_commission_group_assignments a JOIN commission_groups g ON g.id=a.group_id WHERE a.consultant_id=? ORDER BY a.priority,a.id`).all(consultantId);
  }

  saveConsultantGroupAssignments(payload:any) {
    this.ensureCommissionSchema(); const consultantId=Number(payload.consultant_id||0); if(!consultantId) throw new Error('Consultant is required.');
    const tx=this.db.transaction(()=>{this.db.prepare('DELETE FROM consultant_commission_group_assignments WHERE consultant_id=?').run(consultantId); const ins=this.db.prepare('INSERT INTO consultant_commission_group_assignments(consultant_id,group_id,priority,custom_formula,custom_rate,active) VALUES(?,?,?,?,?,?)'); for(const a of payload.assignments||[]) ins.run(consultantId,Number(a.group_id),Number(a.priority||100),a.custom_formula||null,a.custom_rate===null||a.custom_rate===undefined?null:Number(a.custom_rate),a.active===false?0:1);}); tx();
    this.audit('commission.consultant-groups.save',JSON.stringify({consultantId,count:(payload.assignments||[]).length})); return this.listConsultantGroupAssignments(consultantId);
  }

  protected resolveCommissionGroup(consultantId:number,itemType:string,itemId:number):any {
    return this.db.prepare(`SELECT g.*,a.custom_formula,a.custom_rate,a.priority FROM consultant_commission_group_assignments a JOIN commission_groups g ON g.id=a.group_id JOIN commission_group_items gi ON gi.group_id=g.id WHERE a.consultant_id=? AND a.active=1 AND g.active=1 AND gi.item_type=? AND gi.item_id=? AND (g.effective_from IS NULL OR date(g.effective_from)<=date('now','+330 minutes')) AND (g.effective_to IS NULL OR date(g.effective_to)>=date('now','+330 minutes')) ORDER BY a.priority ASC,a.id ASC LIMIT 1`).get(consultantId,itemType,itemId) as any;
  }

  protected computeItemCommission(consultantId:number, item:any, netAmount:number, runningCost:number, beforeDiscountAmount?:number): any {
    const effectiveNetAmount = Math.max(0, +netAmount || 0);
    const rawBeforeDiscountAmount = beforeDiscountAmount === undefined || beforeDiscountAmount === null ? effectiveNetAmount : Number(beforeDiscountAmount);
    const preDiscountAmount = Math.max(effectiveNetAmount, Number.isFinite(rawBeforeDiscountAmount) ? rawBeforeDiscountAmount : effectiveNetAmount);
    if (!this.commissionAllowedForItem(item)) return { commission_amount:0, extra_deduction:0, profit_amount:+(effectiveNetAmount-runningCost).toFixed(2), commission_profile_name:'No commission', commission_rule_source:'Outsourced disallowed', commission_status:'CANCELLED' };
    if (!consultantId) return { commission_amount:0, extra_deduction:0, profit_amount:+(effectiveNetAmount-runningCost).toFixed(2), commission_profile_name:'', commission_rule_source:'No consultant', commission_status:'GENERATED' };
    const itemType = String(item.item_type || '').toUpperCase();
    const rule = this.db.prepare('SELECT * FROM consultant_commission_rules WHERE consultant_id=? AND item_type=? AND item_id=? ORDER BY id DESC LIMIT 1').get(consultantId, itemType, +item.item_id || 0) as any;
    if (rule && String(rule.action || '').toUpperCase() === 'NO_COMMISSION') return { commission_amount:0, extra_deduction:0, profit_amount:+(effectiveNetAmount-runningCost).toFixed(2), commission_profile_name:'No commission', commission_rule_source:'Item exception', commission_status:'CANCELLED' };
    let profile:any = null;
    let group:any = null;
    if (rule?.commission_profile_id) profile = this.db.prepare('SELECT * FROM consultant_commission_profiles WHERE id=? AND active=1').get(rule.commission_profile_id) as any;
    if (!profile && !rule) group = this.resolveCommissionGroup(consultantId,itemType,+item.item_id||0);
    if (profile && !this.isProfileEffective(profile)) profile = null;
    if (!profile && !group) profile = this.db.prepare('SELECT cp.* FROM consultants c JOIN consultant_commission_profiles cp ON cp.id=c.default_commission_profile_id WHERE c.id=? AND cp.active=1').get(consultantId) as any;
    if (profile && !this.isProfileEffective(profile)) profile = null;
    if (!profile && !group) profile = this.db.prepare('SELECT * FROM consultant_commission_profiles WHERE consultant_id=? AND is_default=1 AND active=1 ORDER BY id LIMIT 1').get(consultantId) as any;
    if (profile && !this.isProfileEffective(profile)) profile = null;
    if (!profile && !group) {
      const legacy = this.db.prepare('SELECT default_commission_type, default_commission_value FROM consultants WHERE id=?').get(consultantId) as any;
      if (legacy && (+legacy.default_commission_value || 0) > 0) profile = { profile_name:'Legacy default', commission_type: legacy.default_commission_type || 'PERCENT', commission_value:+legacy.default_commission_value || 0, calculation_base:'GROSS', extra_deduction_type:'NONE', extra_deduction_value:0, discount_basis:'AFTER_DISCOUNT', round_mode:'NONE', fixed_apply_mode:'PER_ITEM', min_commission:0, max_commission:0, status:'GENERATED' };
    }
    if (!profile && !group) return { commission_amount:0, extra_deduction:0, profit_amount:+(effectiveNetAmount-runningCost).toFixed(2), commission_profile_name:'', commission_rule_source:'No active profile', commission_status:'GENERATED' };
    if (group) {
      const vars=this.commissionFormulaVariables(item,effectiveNetAmount,runningCost,preDiscountAmount);
      const kind=String(group.calculation_type||'PERCENT_NET').toUpperCase();
      let commission=0; let formula='';
      if(kind==='FORMULA') { formula=String(group.custom_formula||group.formula_expression||''); commission=this.evaluateCommissionFormula(formula,vars); }
      else if(kind==='PERCENT_PROFIT') commission=Math.max(0,vars.PROFIT)*Number(group.custom_rate??group.rate??0)/100;
      else if(kind==='PERCENT_GROSS') commission=vars.SELLING_PRICE*Number(group.custom_rate??group.rate??0)/100;
      else if(kind==='FIXED') commission=Number(group.fixed_amount||group.custom_rate||group.rate||0)*Math.max(1,vars.QUANTITY);
      else commission=vars.NET_AMOUNT*Number(group.custom_rate??group.rate??0)/100;
      if(Number(group.min_commission||0)>0&&commission>0) commission=Math.max(commission,Number(group.min_commission));
      if(Number(group.max_commission||0)>0) commission=Math.min(commission,Number(group.max_commission));
      commission=Math.max(0,+commission.toFixed(2));
      return {commission_amount:commission,extra_deduction:0,profit_amount:+(effectiveNetAmount-runningCost-commission).toFixed(2),commission_profile_name:group.name||'',commission_rule_source:'Commission group',commission_status:'GENERATED',commission_formula:formula,commission_formula_values:JSON.stringify(vars),commission_group_id:group.id,commission_rule_version:Number(group.version||1)};
    }
    const discountBasis = this.normalizeDiscountBasis(profile.discount_basis);
    const commissionAmountBase = discountBasis === 'BEFORE_DISCOUNT' ? preDiscountAmount : effectiveNetAmount;
    const baseMode = this.normalizeCalculationBase(profile.calculation_base);
    const deductionType = this.normalizeDeductionType(profile.extra_deduction_type);
    const extraDeduction = deductionType === 'PERCENT' ? Math.max(0, commissionAmountBase * (+profile.extra_deduction_value || 0) / 100) : deductionType === 'AMOUNT' ? Math.max(0, +profile.extra_deduction_value || 0) : 0;
    const commissionBase = Math.max(0, commissionAmountBase - (baseMode === 'GROSS' ? 0 : runningCost) - (baseMode === 'NET_AFTER_COST_DEDUCTION' ? extraDeduction : 0));
    const type = this.normalizeCommissionType(profile.commission_type);
    let commission = 0;
    if (type === 'FIXED') {
      const applyMode = this.normalizeFixedApplyMode(profile.fixed_apply_mode);
      const qty = Math.max(1, +item.quantity || 1);
      commission = applyMode === 'PER_QUANTITY' ? Math.max(0,+profile.commission_value||0) * qty : Math.max(0,+profile.commission_value||0);
    } else if (type === 'PERCENT') {
      commission = Math.max(0, commissionBase * (+profile.commission_value || 0) / 100);
    }
    const min = Math.max(0, +profile.min_commission || 0);
    const max = Math.max(0, +profile.max_commission || 0);
    if (commission > 0 && min > 0) commission = Math.max(commission, min);
    if (max > 0) commission = Math.min(commission, max);
    commission = this.applyCommissionRounding(commission, profile.round_mode);
    const totalExtra = baseMode === 'NET_AFTER_COST_DEDUCTION' ? extraDeduction : 0;
    return { commission_amount:+commission.toFixed(2), extra_deduction:+totalExtra.toFixed(2), profit_amount:+(effectiveNetAmount - runningCost - totalExtra - commission).toFixed(2), commission_profile_name:profile.profile_name || '', commission_rule_source: rule ? 'Item override' : 'Default profile', commission_status:this.normalizeCommissionStatus(profile.status) };
  }

  listCommissionEntries(filters:any = {}) {
    this.ensureCommissionSchema();
    const from = String(filters.from || filters.fromDate || '').trim();
    const to = String(filters.to || filters.toDate || '').trim();
    const consultantId = Number(filters.consultant_id || filters.consultantId || 0);
    const status = String(filters.status || 'ALL').toUpperCase();
    const search = String(filters.search || '').trim();
    const params:any[] = [];
    const where:string[] = ['COALESCE(bi.commission_amount,0) > 0'];
    if (from) { where.push('date(b.bill_date) >= date(?)'); params.push(from); }
    if (to) { where.push('date(b.bill_date) <= date(?)'); params.push(to); }
    if (consultantId) { where.push('b.consultant_id=?'); params.push(consultantId); }
    if (status !== 'ALL') {
      if (status === 'CANCELLED') where.push("UPPER(COALESCE(b.status,'')) IN ('CANCELLED','CANCELED')");
      else { where.push("UPPER(COALESCE(b.status,'')) NOT IN ('CANCELLED','CANCELED')"); where.push('UPPER(COALESCE(bi.commission_status,\'GENERATED\'))=?'); params.push(status); }
    }
    if (search) {
      const q = `%${search}%`;
      where.push('(b.bill_no LIKE ? OR p.name LIKE ? OR c.name LIKE ? OR bi.name LIKE ?)');
      params.push(q,q,q,q);
    }
    const rows = this.db.prepare(`SELECT bi.id,bi.bill_id,bi.item_type,bi.item_id,bi.name item_name,bi.quantity,bi.net_amount,
      bi.running_cost,bi.extra_deduction,bi.commission_amount,bi.profit_amount,bi.commission_profile_name,bi.commission_rule_source,
      CASE WHEN UPPER(COALESCE(b.status,'')) IN ('CANCELLED','CANCELED') THEN 'CANCELLED' ELSE UPPER(COALESCE(bi.commission_status,'GENERATED')) END commission_status,
      bi.commission_approved_at,bi.commission_paid_at,bi.commission_hold_reason,bi.commission_settlement_id,
      b.bill_no,b.bill_date,b.total bill_total,b.paid bill_paid,b.due bill_due,b.status bill_status,
      c.id consultant_id,c.name consultant_name,c.clinic consultant_clinic,p.name patient_name
      FROM bill_items bi
      JOIN bills b ON b.id=bi.bill_id
      LEFT JOIN consultants c ON c.id=b.consultant_id
      LEFT JOIN patients p ON p.id=b.patient_id
      WHERE ${where.join(' AND ')}
      ORDER BY datetime(b.bill_date) DESC, b.id DESC, bi.id`).all(...params) as any[];
    const totals:any = { records:rows.length, commission:0, generated:0, approved:0, held:0, paid:0, cancelled:0, billCount:0, consultantCount:0 };
    const bills = new Set<number>(), consultants = new Set<number>();
    for (const r of rows) {
      const amount = Number(r.commission_amount || 0);
      totals.commission += r.commission_status === 'CANCELLED' ? 0 : amount;
      const key = String(r.commission_status || 'GENERATED').toLowerCase();
      if (key in totals) totals[key] += amount;
      bills.add(Number(r.bill_id)); if (r.consultant_id) consultants.add(Number(r.consultant_id));
    }
    totals.billCount=bills.size; totals.consultantCount=consultants.size;
    Object.keys(totals).forEach(k=>{ if(typeof totals[k]==='number') totals[k]=+Number(totals[k]).toFixed(2); });
    return { rows, totals };
  }

  updateCommissionStatus(payload:any = {}) {
    this.ensureCommissionSchema();
    const ids = Array.from(new Set((payload.ids || []).map((x:any)=>Number(x)).filter(Boolean)));
    if (!ids.length) throw new Error('Select at least one commission entry.');
    const status = String(payload.status || '').toUpperCase();
    if (!['GENERATED','APPROVED','HELD'].includes(status)) throw new Error('Invalid commission status.');
    const placeholders = ids.map(()=>'?').join(',');
    const now = this.nowIst();
    const reason = status === 'HELD' ? String(payload.reason || '').trim() : '';
    this.db.prepare(`UPDATE bill_items SET commission_status=?, commission_approved_at=?, commission_hold_reason=?
      WHERE id IN (${placeholders}) AND COALESCE(commission_amount,0)>0 AND UPPER(COALESCE(commission_status,'GENERATED')) <> 'PAID'`)
      .run(status, status === 'APPROVED' ? now : null, reason || null, ...ids);
    this.audit('commission.status', JSON.stringify({ids,status,reason}));
    return this.listCommissionEntries(payload.filters || {});
  }

  createCommissionSettlement(payload:any = {}) {
    this.ensureCommissionSchema();
    const ids = Array.from(new Set((payload.ids || []).map((x:any)=>Number(x)).filter(Boolean)));
    if (!ids.length) throw new Error('Select approved commission entries to settle.');
    const placeholders = ids.map(()=>'?').join(',');
    const rows = this.db.prepare(`SELECT bi.id,bi.commission_amount,b.consultant_id,b.bill_no
      FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
      WHERE bi.id IN (${placeholders}) AND UPPER(COALESCE(bi.commission_status,'GENERATED'))='APPROVED'
        AND UPPER(COALESCE(b.status,'')) NOT IN ('CANCELLED','CANCELED')`).all(...ids) as any[];
    if (!rows.length) throw new Error('No approved commission entries are available for settlement.');
    const consultantIds = new Set(rows.map(r=>Number(r.consultant_id || 0)));
    if (consultantIds.size !== 1 || consultantIds.has(0)) throw new Error('A settlement can contain entries for one consultant only.');
    const consultantId = Number(rows[0].consultant_id);
    const amount = +rows.reduce((s:number,r:any)=>s+Number(r.commission_amount||0),0).toFixed(2);
    const tx=this.db.transaction(()=>{
      const base = `CS-${this.nowIst().replace(/[^0-9]/g,'').slice(0,14)}`;
      let settlementNo=base, n=1;
      while(this.db.prepare('SELECT 1 FROM commission_settlements WHERE settlement_no=?').get(settlementNo)) settlementNo=`${base}-${n++}`;
      const result=this.db.prepare('INSERT INTO commission_settlements(settlement_no,consultant_id,settlement_date,amount,payment_mode,reference_no,notes) VALUES(?,?,?,?,?,?,?)')
        .run(settlementNo,consultantId,this.nowIst(),amount,String(payload.payment_mode||'Cash'),String(payload.reference_no||''),String(payload.notes||''));
      const settlementId=Number(result.lastInsertRowid);
      const itemInsert=this.db.prepare('INSERT INTO commission_settlement_items(settlement_id,bill_item_id,amount) VALUES(?,?,?)');
      const now=this.nowIst();
      for(const r of rows){ itemInsert.run(settlementId,r.id,Number(r.commission_amount||0)); this.db.prepare("UPDATE bill_items SET commission_status='PAID',commission_paid_at=?,commission_settlement_id=? WHERE id=?").run(now,settlementId,r.id); }
      this.audit('commission.settlement.create',JSON.stringify({settlementId,settlementNo,consultantId,amount,ids:rows.map(r=>r.id)}));
      return {settlementId,settlementNo,amount};
    });
    return tx();
  }

  listCommissionSettlements(filters:any = {}) {
    this.ensureCommissionSchema();
    const from=String(filters.from||''), to=String(filters.to||''); const params:any[]=[]; const where:string[]=['1=1'];
    if(from){where.push('date(cs.settlement_date)>=date(?)');params.push(from);} if(to){where.push('date(cs.settlement_date)<=date(?)');params.push(to);}
    return this.db.prepare(`SELECT cs.*,c.name consultant_name,COUNT(csi.id) item_count
      FROM commission_settlements cs JOIN consultants c ON c.id=cs.consultant_id
      LEFT JOIN commission_settlement_items csi ON csi.settlement_id=cs.id
      WHERE ${where.join(' AND ')} GROUP BY cs.id ORDER BY datetime(cs.settlement_date) DESC,cs.id DESC`).all(...params);
  }

  calculateBillCommission(payload:any) {
    this.ensureCommissionSchema();
    const consultantId = +payload.consultant_id || 0;
    const rawItems = (payload.items || []).map((i:any) => {
      const qty = +i.quantity || 1;
      const gross = (+i.price || 0) * qty;
      const discountType = i.discount_type === 'PERCENT' ? 'PERCENT' : 'VALUE';
      const discountValue = Math.max(0, +i.discount_value || 0);
      const discountAmount = Math.min(gross, discountType === 'PERCENT' ? gross * discountValue / 100 : discountValue);
      const itemNet = Math.max(0, gross - discountAmount);
      return {...i, gross, item_net_amount:itemNet, item_discount_amount:discountAmount};
    });
    const itemNetTotal = rawItems.reduce((s:number,i:any)=>s+(+i.item_net_amount||0),0);
    const billDiscountType = payload.discount_type === 'PERCENT' ? 'PERCENT' : 'VALUE';
    const billDiscountValue = Math.max(0, +payload.discount_value || +payload.discount || 0);
    const finalDiscount = Math.min(itemNetTotal, billDiscountType === 'PERCENT' ? itemNetTotal * billDiscountValue / 100 : billDiscountValue);
    const items = rawItems.map((i:any) => {
      const share = itemNetTotal > 0 ? finalDiscount * ((+i.item_net_amount || 0) / itemNetTotal) : 0;
      const netAmount = Math.max(0, (+i.item_net_amount || 0) - share);
      const runningCost = this.resolveItemRunningCost(i) * (+i.quantity || 1);
      const calc = this.computeItemCommission(consultantId, i, netAmount, runningCost, +i.gross || netAmount);
      return {...i, net_amount:+netAmount.toFixed(2), bill_discount_share:+share.toFixed(2), running_cost:+runningCost.toFixed(2), ...calc};
    });
    return {
      items,
      running_cost_total:+items.reduce((s:number,i:any)=>s+(+i.running_cost||0),0).toFixed(2),
      extra_deduction_total:+items.reduce((s:number,i:any)=>s+(+i.extra_deduction||0),0).toFixed(2),
      commission_total:+items.reduce((s:number,i:any)=>s+(+i.commission_amount||0),0).toFixed(2),
      profit_total:+items.reduce((s:number,i:any)=>s+(+i.profit_amount||0),0).toFixed(2)
    };
  }

  protected prepareBillPayload(payload: any) {
    const items = (payload.items || []);
    const preparedItems = items.map((i:any) => {
      const qty = +i.quantity || 1;
      const price = +i.price || 0;
      const gross = price * qty;
      const discountType = i.discount_type === 'PERCENT' ? 'PERCENT' : 'VALUE';
      const discountValue = Math.max(0, +i.discount_value || 0);
      const discountAmount = Math.min(gross, discountType === 'PERCENT' ? gross * discountValue / 100 : discountValue);
      const netAmount = Math.max(0, gross - discountAmount);
      return {...i, quantity: qty, price, gross, discount_type: discountType, discount_value: discountValue, discount_amount: discountAmount, total: netAmount, net_amount: netAmount};
    });
    const consultantId = +payload.consultant_id || 0;
    const subtotal = preparedItems.reduce((sum:number, i:any) => sum + (+i.gross || 0), 0);
    const itemsNetTotal = preparedItems.reduce((sum:number, i:any) => sum + (+i.net_amount || 0), 0);
    const discountType = payload.discount_type === 'PERCENT' ? 'PERCENT' : 'VALUE';
    const rawDiscountValue = payload.discount_value !== undefined && payload.discount_value !== null && payload.discount_value !== '' ? payload.discount_value : payload.discount;
    const discountValue = Math.max(0, Number(rawDiscountValue) || 0);
    const finalDiscount = Math.min(itemsNetTotal, discountType === 'PERCENT' ? itemsNetTotal * discountValue / 100 : discountValue);
    const beforeRound = Math.max(0, itemsNetTotal - finalDiscount);
    const roundMode = payload.round_mode || 'NONE';
    const roundedTotal = roundMode === 'NEAREST' ? Math.round(beforeRound) : roundMode === 'UP' ? Math.ceil(beforeRound) : roundMode === 'DOWN' ? Math.floor(beforeRound) : beforeRound;
    const roundOff = +(roundedTotal - beforeRound).toFixed(2);
    preparedItems.forEach((i:any) => {
      const share = itemsNetTotal > 0 ? finalDiscount * ((+i.net_amount || 0) / itemsNetTotal) : 0;
      const commissionNetAmount = Math.max(0, (+i.net_amount || 0) - share);
      const runningCost = this.resolveItemRunningCost(i) * (+i.quantity || 1);
      const calc = this.computeItemCommission(consultantId, i, commissionNetAmount, runningCost, +i.gross || +i.net_amount || 0);
      i.running_cost = +runningCost.toFixed(2);
      i.bill_discount_share = +share.toFixed(2);
      Object.assign(i, calc);
    });
    const total = +roundedTotal.toFixed(2);
    const cashReceived = +payload.cash_received || 0;
    const paidInput = +payload.paid || 0;
    const paid = payload.payment_mode === 'Cash' && cashReceived > 0 ? Math.min(cashReceived, total) : Math.min(paidInput, total);
    const cashReturn = payload.payment_mode === 'Cash' ? Math.max(0, cashReceived - total) : 0;
    return { preparedItems, subtotal, discountType, discountValue, finalDiscount, total, paid, due: Math.max(0, total - paid), paymentMode: payload.payment_mode || 'Cash', roundMode, roundOff, cashReceived, cashReturn, notes: payload.notes || '' };
  }


  audit(action:string, details='') { this.db.prepare('INSERT INTO audit_logs(action,details,created_at) VALUES(?,?,?)').run(action,details,this.nowIst()); }
  protected nextConfiguredNo(kind:string, table:string, col:string) {
    this.ensureNumberSequence(kind, table, col);
    const prefix = this.getSetting(`${kind}.prefix`, kind === 'invoice' ? 'B' : kind === 'patient' ? 'P' : 'R');
    const suffix = this.getSetting(`${kind}.suffix`, '');
    const padding = Math.max(1, Number(this.getSetting(`${kind}.padding`, '6')) || 6);
    let next = (this.db.prepare('SELECT next_number FROM number_sequences WHERE kind=?').get(kind) as any)?.next_number || 1;
    for (let attempt = 0; attempt < 100000; attempt++) {
      const candidate = `${prefix}${String(next).padStart(padding,'0')}${suffix}`;
      this.db.prepare('UPDATE number_sequences SET next_number=?,updated_at=? WHERE kind=?').run(next + 1, this.nowIst(), kind);
      const exists = (this.db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE ${col}=?`).get(candidate) as any).c > 0;
      if (!exists) return candidate;
      next++;
    }
    throw new Error(`Unable to generate unique ${kind} number. Please check numbering settings.`);
  }


}
