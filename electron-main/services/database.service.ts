import { DatabaseOperationsService } from './database-operations.service';

export class DatabaseService extends DatabaseOperationsService {
  resetTransactionalWorkflowData(reason = 'Clean workflow reset') {
    this.ensureBillingSchema();
    this.ensureCollectionSchema();
    this.ensureOperationsSchema();

    const tableExists = (table: string) => !!(this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table) as any)?.name;
    const safeDelete = (table: string, where = '') => {
      if (!tableExists(table)) return;
      this.db.prepare(`DELETE FROM ${table}${where}`).run();
    };

    const counts = {
      bills: tableExists('bills') ? (((this.db.prepare('SELECT COUNT(*) c FROM bills').get() as any)?.c || 0)) : 0,
      reports: tableExists('reports') ? (((this.db.prepare('SELECT COUNT(*) c FROM reports').get() as any)?.c || 0)) : 0,
      collections: tableExists('specimen_collections') ? (((this.db.prepare('SELECT COUNT(*) c FROM specimen_collections').get() as any)?.c || 0)) : 0
    };

    // PRAGMA foreign_keys cannot be changed from inside an active transaction.
    // Keep it OFF for the delete transaction and restore it afterwards.
    const fkBefore = String(((this.db.pragma('foreign_keys') as any[])?.[0]?.foreign_keys ?? 1));
    this.db.pragma('foreign_keys = OFF');

    try {
      const tx = this.db.transaction(() => {
        // Delete dependent rows first. Keep this reset workflow-only and avoid touching master/setup tables.
        safeDelete('specimen_collection_tests');
        safeDelete('payment_allocations', ' WHERE bill_id IS NOT NULL');
        safeDelete('outsource_cases');

        // Quick Reporting barcode/sample collection state is transactional test data too.
        // Reset test data must clear it, otherwise old generated/deleted barcode rows
        // can still block the Quick Barcode modal after bills/reports are cleared.
        safeDelete('quick_reporting_barcode_items');
        safeDelete('quick_reporting_barcode_used_sample_ids');
        safeDelete('quick_reporting_barcode_daily_counter');

        safeDelete('quick_report_items');
        safeDelete('quick_reports');
        safeDelete('report_items');
        safeDelete('specimen_collections');
        safeDelete('reports');
        safeDelete('receipts');
        safeDelete('refunds');
        safeDelete('commission_settlement_items');
        safeDelete('commission_settlements');
        safeDelete('bill_items');
        safeDelete('bills');

        const seq = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='number_sequences'").get() as any;
        if (seq?.name) {
          this.db.prepare("UPDATE number_sequences SET next_number=1, updated_at=datetime('now','+330 minutes') WHERE kind IN ('invoice','receipt')").run();
        }

        this.db.prepare("INSERT INTO audit_logs(action,details,created_at) VALUES(?,?,datetime('now','+330 minutes'))")
          .run('debug.workflow.reset', JSON.stringify({ reason, counts }));
        return { ok: true, cleared: counts };
      });

      return tx();
    } finally {
      this.db.pragma(`foreign_keys = ${fkBefore === '0' ? 'OFF' : 'ON'}`);
    }
  }
}
