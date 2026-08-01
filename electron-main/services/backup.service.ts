import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { DatabaseService } from './database.service';

export interface BackupValidation {
  valid: boolean;
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  integrity: string;
  tables: string[];
  counts: Record<string, number>;
  error?: string;
}

export class BackupService {
  private timer: NodeJS.Timeout | null = null;
  constructor(private db: DatabaseService) {}

  start() {
    this.stop();
    if (this.db.getSetting('backup.enabled', 'true') !== 'true') return;
    const minutes = Math.max(5, Number(this.db.getSetting('backup.intervalMinutes', '60')) || 60);
    this.timer = setInterval(() => this.createBackup('auto').catch(console.error), minutes * 60 * 1000);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async createBackup(reason = 'manual') {
    const backupDir = this.db.getSetting('backup.path');
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(backupDir, `lims-${reason}-${stamp}.sqlite3`);
    await this.db.db.backup(dest);
    this.db.audit('backup.create', dest);
    return { path: dest, createdAt: new Date().toISOString() };
  }
  listBackups() {
    const backupDir = this.db.getSetting('backup.path');
    if (!fs.existsSync(backupDir)) return [];
    return fs.readdirSync(backupDir).filter(f => f.endsWith('.sqlite3')).map(f => {
      const full = path.join(backupDir, f); const st = fs.statSync(full);
      return { name: f, path: full, size: st.size, modifiedAt: st.mtime.toISOString() };
    }).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
  }

  private resolveManagedBackup(filePath: string) {
    const backupDir = path.resolve(this.db.getSetting('backup.path'));
    const candidate = path.resolve(String(filePath || ''));
    if (!candidate || path.dirname(candidate) !== backupDir) throw new Error('Only files in the configured backup folder can be restored.');
    if (path.extname(candidate).toLowerCase() !== '.sqlite3') throw new Error('The selected file is not a SQLite backup.');
    return candidate;
  }

  validateBackup(filePath: string): BackupValidation {
    let candidate = '';
    try {
      candidate = this.resolveManagedBackup(filePath);
      const stat = fs.statSync(candidate);
      if (!stat.isFile() || stat.size < 100) throw new Error('The backup file is empty or unreadable.');
      const backupDb = new Database(candidate, { readonly: true, fileMustExist: true });
      try {
        const integrityRows = backupDb.pragma('integrity_check') as any[];
        const integrity = integrityRows.map(row => String(row.integrity_check || Object.values(row)[0] || '')).join('; ');
        const tables = (backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as any[]).map(row => String(row.name));
        const required = ['settings','tests','patients','bills','reports','report_items'];
        const missing = required.filter(name => !tables.includes(name));
        if (integrity.toLowerCase() !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
        if (missing.length) throw new Error(`Required LIMS tables are missing: ${missing.join(', ')}`);
        const counts: Record<string, number> = {};
        for (const table of ['tests','patients','bills','reports']) counts[table] = Number((backupDb.prepare(`SELECT COUNT(*) count FROM ${table}`).get() as any)?.count || 0);
        return { valid: true, path: candidate, name: path.basename(candidate), size: stat.size, modifiedAt: stat.mtime.toISOString(), integrity, tables, counts };
      } finally { backupDb.close(); }
    } catch (error: any) {
      let stat: fs.Stats | null = null;
      try { if (candidate) stat = fs.statSync(candidate); } catch {}
      return { valid: false, path: candidate || String(filePath || ''), name: path.basename(candidate || String(filePath || '')), size: stat?.size || 0, modifiedAt: stat?.mtime.toISOString() || '', integrity: 'failed', tables: [], counts: {}, error: String(error?.message || error || 'Backup validation failed.') };
    }
  }

  async restoreBackup(filePath: string) {
    const validation = this.validateBackup(filePath);
    if (!validation.valid) throw new Error(validation.error || 'Backup validation failed.');
    const safetyBackup = await this.createBackup('pre-restore');
    const staged = `${this.db.dbPath}.restore-${Date.now()}.staged`;
    fs.copyFileSync(validation.path, staged);
    const stagedDb = new Database(staged, { readonly: true, fileMustExist: true });
    try {
      const result = stagedDb.pragma('integrity_check') as any[];
      if (String(result?.[0]?.integrity_check || '').toLowerCase() !== 'ok') throw new Error('The staged restore file failed its integrity check.');
    } finally { stagedDb.close(); }

    this.db.closeDatabaseConnection();
    try {
      for (const suffix of ['-wal','-shm']) { const sidecar = this.db.dbPath + suffix; if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar); }
      fs.copyFileSync(staged, this.db.dbPath);
      this.db.reopenDatabaseConnection();
      this.db.audit('backup.restore', `${validation.path}; safety=${safetyBackup.path}`);
      return { restoredFrom: validation.path, safetyBackup: safetyBackup.path, validation, restartRequired: false };
    } catch (error) {
      try {
        if (this.db.db?.open) this.db.closeDatabaseConnection();
        for (const suffix of ['-wal','-shm']) { const sidecar = this.db.dbPath + suffix; if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar); }
        fs.copyFileSync(safetyBackup.path, this.db.dbPath);
        this.db.reopenDatabaseConnection();
      } catch {}
      throw error;
    } finally {
      try { if (fs.existsSync(staged)) fs.unlinkSync(staged); } catch {}
    }
  }
}
