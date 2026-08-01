-- LIMS Professional Billing & Reporting schema
-- The runtime app creates this schema from DatabaseService.migrate().
-- This file is kept for review, documentation, and future external migration tooling.

CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, priority INTEGER NOT NULL DEFAULT 0, page_break_after INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS tests(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, display_name TEXT, department_id INTEGER, unit_id INTEGER, price REAL NOT NULL DEFAULT 0, running_cost REAL NOT NULL DEFAULT 0, normal_range TEXT, method TEXT, priority INTEGER NOT NULL DEFAULT 0, highlight_parameter INTEGER NOT NULL DEFAULT 0, side_header TEXT, active INTEGER NOT NULL DEFAULT 1, billable INTEGER NOT NULL DEFAULT 1, active_for_reporting INTEGER NOT NULL DEFAULT 1, result_data_type TEXT NOT NULL DEFAULT 'NUMBER', input_control_type TEXT NOT NULL DEFAULT 'TEXTBOX', result_mode TEXT NOT NULL DEFAULT 'DIRECT', billing_order INTEGER NOT NULL DEFAULT 0, report_order INTEGER NOT NULL DEFAULT 0, search_keywords TEXT, method_id INTEGER, decimal_places INTEGER NOT NULL DEFAULT 2, rounding_mode TEXT NOT NULL DEFAULT 'NEAREST', number_format TEXT NOT NULL DEFAULT 'NONE', predefined_formula_key TEXT, output_operator TEXT NOT NULL DEFAULT '+', output_constant REAL NOT NULL DEFAULT 0, interpretation_enabled INTEGER NOT NULL DEFAULT 0, interpretation_text TEXT, collection_rule TEXT NOT NULL DEFAULT 'NORMAL', fasting_hours INTEGER NOT NULL DEFAULT 8, collection_gap_minutes INTEGER NOT NULL DEFAULT 120, collection_dependency TEXT NOT NULL DEFAULT 'NONE', same_specimen_allowed INTEGER NOT NULL DEFAULT 1, collection_instruction TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, name TEXT NOT NULL, display_name TEXT, department_id INTEGER NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, active INTEGER NOT NULL DEFAULT 1, billable INTEGER NOT NULL DEFAULT 1, active_for_reporting INTEGER NOT NULL DEFAULT 1, show_profile_name INTEGER NOT NULL DEFAULT 1, ordering_mode TEXT NOT NULL DEFAULT 'MANUAL', billing_order INTEGER NOT NULL DEFAULT 0, report_order INTEGER NOT NULL DEFAULT 0, search_keywords TEXT);
CREATE TABLE IF NOT EXISTS profile_tests(profile_id INTEGER NOT NULL, test_id INTEGER NOT NULL, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, PRIMARY KEY(profile_id,test_id));
CREATE TABLE IF NOT EXISTS profile_items(id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id INTEGER NOT NULL, item_type TEXT NOT NULL DEFAULT 'TEST', test_id INTEGER, child_profile_id INTEGER, header_text TEXT, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, display_profile_name INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS patients(id INTEGER PRIMARY KEY AUTOINCREMENT, patient_no TEXT NOT NULL UNIQUE, title TEXT, name TEXT NOT NULL, dob TEXT, age TEXT, age_value INTEGER, age_unit TEXT NOT NULL DEFAULT 'YEARS', age_split INTEGER NOT NULL DEFAULT 1, gender TEXT, relation_type TEXT, guardian_name TEXT, guardian_mobile TEXT, mobile TEXT, email TEXT, address TEXT, history TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS consultants(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, clinic TEXT, active INTEGER NOT NULL DEFAULT 1, default_commission_type TEXT NOT NULL DEFAULT 'PERCENT', default_commission_value REAL NOT NULL DEFAULT 0, default_commission_profile_id INTEGER);
CREATE TABLE IF NOT EXISTS consultant_commission_profiles(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, profile_name TEXT NOT NULL, description TEXT, commission_type TEXT NOT NULL DEFAULT 'PERCENT', commission_value REAL NOT NULL DEFAULT 0, calculation_base TEXT NOT NULL DEFAULT 'GROSS', extra_deduction_type TEXT NOT NULL DEFAULT 'NONE', extra_deduction_value REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, is_default INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS consultant_commission_rules(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, action TEXT NOT NULL DEFAULT 'USE_PROFILE', commission_profile_id INTEGER);
CREATE TABLE IF NOT EXISTS consultant_commissions(id INTEGER PRIMARY KEY AUTOINCREMENT, consultant_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, commission_type TEXT NOT NULL, commission_value REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS bills(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_no TEXT NOT NULL UNIQUE, patient_id INTEGER NOT NULL, consultant_id INTEGER, bill_date TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), subtotal REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0, discount_type TEXT NOT NULL DEFAULT 'VALUE', discount_value REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, paid REAL NOT NULL DEFAULT 0, due REAL NOT NULL DEFAULT 0, payment_mode TEXT NOT NULL DEFAULT 'Cash', round_mode TEXT NOT NULL DEFAULT 'NONE', round_off REAL NOT NULL DEFAULT 0, cash_received REAL NOT NULL DEFAULT 0, cash_return REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'BILLED', notes TEXT);
CREATE TABLE IF NOT EXISTS bill_items(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL, item_type TEXT NOT NULL, item_id INTEGER NOT NULL, name TEXT NOT NULL, department_name TEXT, quantity INTEGER NOT NULL DEFAULT 1, price REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0, priority INTEGER NOT NULL DEFAULT 0, side_header TEXT, discount_type TEXT NOT NULL DEFAULT 'VALUE', discount_value REAL NOT NULL DEFAULT 0, discount_amount REAL NOT NULL DEFAULT 0, net_amount REAL NOT NULL DEFAULT 0, running_cost REAL NOT NULL DEFAULT 0, extra_deduction REAL NOT NULL DEFAULT 0, commission_amount REAL NOT NULL DEFAULT 0, profit_amount REAL NOT NULL DEFAULT 0, commission_profile_name TEXT, commission_rule_source TEXT);
CREATE TABLE IF NOT EXISTS receipts(id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_no TEXT NOT NULL UNIQUE, bill_id INTEGER NOT NULL, amount REAL NOT NULL, payment_mode TEXT NOT NULL, received_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, bill_id INTEGER NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'DRAFT', typed_by TEXT, approved_by TEXT, remarks TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS report_items(id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL, test_id INTEGER, test_name TEXT NOT NULL, department_name TEXT, side_header TEXT, result_value TEXT, unit TEXT, normal_range TEXT, method TEXT, priority INTEGER NOT NULL DEFAULT 0, highlight_parameter INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, details TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));

-- Advanced Test Master / Report Definition Engine additions
CREATE TABLE IF NOT EXISTS specimen_types(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, code TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS test_specimen_mappings(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, specimen_type_id INTEGER NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, display_order INTEGER NOT NULL DEFAULT 1000, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), UNIQUE(test_id, specimen_type_id));
CREATE TABLE IF NOT EXISTS test_methods(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS test_result_options(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, option_value TEXT NOT NULL, option_label TEXT, display_order INTEGER NOT NULL DEFAULT 1000, is_default INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), UNIQUE(test_id, option_value));
CREATE TABLE IF NOT EXISTS test_reference_ranges(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, gender TEXT NOT NULL DEFAULT 'ALL', age_min REAL, age_max REAL, age_unit TEXT NOT NULL DEFAULT 'YEARS', lower_limit REAL, upper_limit REAL, reference_text TEXT, flag_enabled INTEGER NOT NULL DEFAULT 1, critical_low REAL, critical_high REAL, display_order INTEGER NOT NULL DEFAULT 1000, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')));
CREATE TABLE IF NOT EXISTS test_formulas(id INTEGER PRIMARY KEY AUTOINCREMENT, test_id INTEGER NOT NULL, formula_expression TEXT NOT NULL, rounding_decimals INTEGER NOT NULL DEFAULT 2, allow_manual_override INTEGER NOT NULL DEFAULT 0, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), updated_at TEXT NOT NULL DEFAULT (datetime('now','+330 minutes')), predefined_formula_key TEXT, rounding_mode TEXT NOT NULL DEFAULT 'NEAREST');
CREATE TABLE IF NOT EXISTS test_formula_variables(id INTEGER PRIMARY KEY AUTOINCREMENT, formula_id INTEGER NOT NULL, variable_key TEXT NOT NULL, source_test_id INTEGER NOT NULL, UNIQUE(formula_id, variable_key));
CREATE INDEX IF NOT EXISTS idx_tests_report_order ON tests(department_id, report_order, name);
CREATE INDEX IF NOT EXISTS idx_tests_billing_order ON tests(department_id, billing_order, name);

-- profiles_interpretation_enabled: runtime migration adds profiles.interpretation_enabled and profiles.interpretation_text

-- Equipment / Analyzer Integration Master
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
  UNIQUE(equipment_id, analyzer_code),
  UNIQUE(equipment_id, test_id),
  FOREIGN KEY(equipment_id) REFERENCES equipment_master(id) ON DELETE CASCADE,
  FOREIGN KEY(test_id) REFERENCES tests(id)
);
CREATE INDEX IF NOT EXISTS idx_equipment_test_map_equipment ON equipment_test_mappings(equipment_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_equipment_test_map_analyzer ON equipment_test_mappings(equipment_id, analyzer_code);
