import { app, BrowserWindow, ipcMain, shell, dialog, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import { DatabaseService } from './services/database.service';
import { ReportService } from './services/report.service';
import { BackupService } from './services/backup.service';
import { AnalyzerApiService } from './services/analyzer-api.service';
import { AnalyticsPdfService } from './services/analytics-pdf.service';

const execFileAsync = promisify(execFile);

/** Put a real file on the OS clipboard (FileDropList on Windows) so WhatsApp Desktop can Ctrl+V attach it. */
async function copyFileToClipboard(filePath: string): Promise<{ ok: boolean; mode: 'file' | 'path' | 'none'; error?: string }> {
  const file = String(filePath || '').trim();
  if (!file || !fs.existsSync(file)) return { ok: false, mode: 'none', error: 'PDF file not found.' };
  try {
    if (process.platform === 'win32') {
      const escaped = file.replace(/'/g, "''");
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `Set-Clipboard -Path '${escaped}'`],
        { windowsHide: true, timeout: 20000 }
      );
      return { ok: true, mode: 'file' };
    }
    // Non-Windows: best-effort path text (cannot reliably put FileDropList from Electron alone).
    clipboard.writeText(file);
    return { ok: true, mode: 'path' };
  } catch (err: any) {
    try {
      clipboard.writeText(file);
      return { ok: true, mode: 'path', error: String(err?.message || err || '') };
    } catch (err2: any) {
      return { ok: false, mode: 'none', error: String(err2?.message || err?.message || err2 || err || 'Clipboard copy failed.') };
    }
  }
}

function normalizeWaMobile(raw: any): string {
  let mobile = String(raw || '').replace(/[^0-9]/g, '');
  if (mobile.length === 10) mobile = `91${mobile}`;
  return mobile;
}

function formatWhatsAppPatientCaption(report: any): string {
  const name = [report?.patient_title, report?.patient_name || report?.name]
    .map((x: any) => String(x || '').trim())
    .filter(Boolean)
    .join(' ')
    .trim() || 'Patient';
  const ageRaw = String(report?.age || '').trim();
  let age = ageRaw;
  if (!age) {
    const value = report?.age_value;
    const unit = String(report?.age_unit || 'YEARS').trim().toLowerCase();
    if (value != null && value !== '') {
      const u = unit.startsWith('month') ? 'months' : unit.startsWith('day') ? 'days' : 'years';
      age = `${value} ${u}`;
    }
  }
  const gender = String(report?.gender || '').trim();
  const bill = String(report?.bill_no || '').trim();
  return [
    `Patient: ${name}`,
    ...(age ? [`Age: ${age}`] : []),
    ...(gender ? [`Gender: ${gender}`] : []),
    ...(bill ? [`Bill: ${bill}`] : []),
    '',
    'Your approved lab report is ready. Please find the PDF attached.'
  ].join('\n');
}

let mainWindow: BrowserWindow | null = null;
let db: DatabaseService;
let reports: ReportService;
let backups: BackupService;
let analyzerApi: AnalyzerApiService;
let analyticsPdf: AnalyticsPdfService;
let rendererHasUnsavedWork = false;
let pendingClose = false;
let closePromptInProgress = false;
let closeFallbackTimer: NodeJS.Timeout | null = null;
let appShutdownDone = false;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function emitShutdownProgress(payload: Record<string, any>) {
  safeSendToRenderer('app:shutdown-progress', payload);
}

async function prepareShutdownWithProgress() {
  const steps = [
    { id: 'timer', label: 'Auto backup timer' },
    { id: 'analyzer', label: 'Analyzer API' },
    { id: 'database', label: 'Database connection' }
  ];

  const emit = (activeId: string, status: 'running' | 'done' | 'error', message: string, progress: number) => {
    emitShutdownProgress({
      stage: activeId,
      stageLabel: steps.find(s => s.id === activeId)?.label || activeId,
      title: 'Shutting down LIMS',
      message,
      progress,
      statusText: status === 'running' ? 'Working' : status === 'done' ? 'Done' : 'Error',
      status,
      steps: steps.map(s => {
        const order = steps.findIndex(x => x.id === s.id);
        const active = steps.findIndex(x => x.id === activeId);
        let state: 'pending' | 'running' | 'done' | 'error' = 'pending';
        if (s.id === activeId) state = status === 'error' ? 'error' : status === 'done' ? 'done' : 'running';
        else if (order < active || (status === 'done' && order <= active)) state = 'done';
        return { ...s, state };
      })
    });
  };

  try {
    emit('timer', 'running', 'Clearing the scheduled backup timer…', 20);
    await sleep(180);
    try { backups?.stop(); } catch (err) { try { log.warn('[shutdown] backup stop failed', err); } catch {} }
    emit('timer', 'done', 'Backup timer stopped.', 40);
    await sleep(120);

    emit('analyzer', 'running', 'Stopping Analyzer TCP / API listener…', 55);
    await sleep(180);
    try { analyzerApi?.stop(); } catch (err) { try { log.warn('[shutdown] analyzer API stop failed', err); } catch {} }
    emit('analyzer', 'done', 'Analyzer API stopped.', 75);
    await sleep(120);

    emit('database', 'running', 'Checkpointing and closing SQLite…', 88);
    await sleep(180);
    try { db?.closeDatabaseConnection(); } catch (err) { try { log.warn('[shutdown] database close failed', err); } catch {} }
    appShutdownDone = true;
    emit('database', 'done', 'Database closed cleanly.', 100);
    await sleep(160);
    emitShutdownProgress({
      stage: 'ready',
      stageLabel: 'Ready',
      title: 'Shutting down LIMS',
      message: 'All services stopped. Closing the application window…',
      progress: 100,
      statusText: 'Closing',
      status: 'done',
      steps: steps.map(s => ({ ...s, state: 'done' as const }))
    });
    return { ok: true };
  } catch (err: any) {
    emitShutdownProgress({
      stage: 'error',
      stageLabel: 'Failed',
      title: 'Shutdown interrupted',
      message: String(err?.message || err || 'Unable to finish shutdown.'),
      progress: 100,
      statusText: 'Error',
      status: 'error',
      steps: steps.map(s => ({ ...s, state: 'error' as const }))
    });
    return { ok: false, error: String(err?.message || err || 'Shutdown failed') };
  }
}

function shutdownAppServices(reason = 'app-exit') {
  if (appShutdownDone) return;
  appShutdownDone = true;
  try {
    log.info(`[shutdown] Stopping services (${reason})`);
  } catch {}
  try { backups?.stop(); } catch (err) { try { log.warn('[shutdown] backup stop failed', err); } catch {} }
  try { analyzerApi?.stop(); } catch (err) { try { log.warn('[shutdown] analyzer API stop failed', err); } catch {} }
  try { db?.closeDatabaseConnection(); } catch (err) { try { log.warn('[shutdown] database close failed', err); } catch {} }
  try {
    log.info('[shutdown] Services stopped');
  } catch {}
}

function safeSendToRenderer(channel: string, ...args: any[]) {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return false;
  const contents = win.webContents;
  if (!contents || contents.isDestroyed() || contents.isCrashed()) return false;
  try {
    contents.send(channel, ...args);
    return true;
  } catch (err) {
    log.warn(`Skipped IPC send after renderer was disposed: ${channel}`, err);
    return false;
  }
}

/** Windows/Electron can leave the webview without keyboard/mouse focus after native dialogs. */
function restoreMainWindowFocus() {
  const focusNow = () => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    try {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
      if (!win.webContents.isDestroyed()) win.webContents.focus();
    } catch (err) {
      try { log.warn('[focus] Failed to restore main window focus', err); } catch {}
    }
  };
  focusNow();
  // A second tick helps after Windows file/folder pickers release ownership.
  setTimeout(focusNow, 40);
}

process.on('uncaughtException', err => log.error('UNCAUGHT', err));
process.on('unhandledRejection', err => log.error('UNHANDLED', err));

if (process.platform === 'win32') app.setAppUserModelId('com.lims.professional.billing.reporting');

// One running instance only (skip for Playwright/E2E).
const allowMultipleInstances = process.env.LIMS_E2E === '1';
const gotSingleInstanceLock = allowMultipleInstances ? true : app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else if (!allowMultipleInstances) {
  app.on('second-instance', () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
    // Prefer the in-app rich alert; fall back to native dialog only if renderer is unavailable.
    const sent = safeSendToRenderer('app:already-running', {
      title: 'Already Running',
      message: 'LIMS is already open.',
      details: 'You tried to start the app again from a shortcut. This existing window was brought to the front.'
    });
    if (!sent) {
      dialog.showMessageBox(win || undefined, {
        type: 'info',
        title: 'Already Running',
        message: 'LIMS is already open.',
        detail: 'You tried to start the app again from a shortcut. This existing window was brought to the front.',
        buttons: ['OK'],
        defaultId: 0,
        noLink: true
      }).catch(() => {});
    }
  });
}

function createWindow() {
  const appIcon = path.join(__dirname, '../build/icon.ico');
  mainWindow = new BrowserWindow({
    icon: appIcon,
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('close', event => {
    // In Playwright/E2E mode, never show the app-close confirmation.
    // Tests may close/kill Electron during cleanup and should not block on UI dialogs.
    if (process.env.LIMS_E2E === '1') {
      pendingClose = true;
      return;
    }
    if (pendingClose) return;

    const win = mainWindow;
    if (!win || win.isDestroyed()) {
      pendingClose = true;
      return;
    }
    event.preventDefault();
    if (closePromptInProgress) return;
    closePromptInProgress = true;
    const sent = safeSendToRenderer('app:close-request');
    if (!sent) {
      closePromptInProgress = false;
      return;
    }

    // The renderer owns the graphical confirmation. If it is temporarily busy,
    // unlock another close attempt instead of leaving Electron in a blocked state.
    if (closeFallbackTimer) clearTimeout(closeFallbackTimer);
    // Allow time for exit confirmation + optional on-close backup before unlocking another attempt.
    closeFallbackTimer = setTimeout(() => {
      closePromptInProgress = false;
      closeFallbackTimer = null;
    }, 180000);
  });

  mainWindow.on('closed', () => {
    if (closeFallbackTimer) { clearTimeout(closeFallbackTimer); closeFallbackTimer = null; }
    closePromptInProgress = false;
    pendingClose = false;
    mainWindow = null;
  });

  if (!app.isPackaged) mainWindow.loadURL('http://127.0.0.1:4500');
  else mainWindow.loadFile(path.join(__dirname, '../dist/lims-billing-reporting/browser/index.html'));
}


async function createHtmlPdfFile(payload: any = {}) {
  const html = String(payload?.html || '').trim();
  if (!html) throw new Error('No HTML content supplied for PDF generation.');
  const titleRaw = String(payload?.title || payload?.filePrefix || 'document').trim() || 'document';
  const safePrefix = titleRaw.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'document';
  const dir = path.join(app.getPath('temp'), 'lims-generated-pdf-temp');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safePrefix}-${Date.now()}.pdf`);
  const pdfWindow = new BrowserWindow({
    show: false,
    width: Number(payload?.width || 1024),
    height: Number(payload?.height || 768),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  try {
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise(resolve => setTimeout(resolve, Number(payload?.renderDelayMs || 250)));
    const pdfOptions: any = {
      printBackground: payload?.printBackground !== false,
      landscape: !!payload?.landscape,
      preferCSSPageSize: payload?.preferCSSPageSize !== false
    };
    if (payload?.pageSize && payload.pageSize !== 'CSS') pdfOptions.pageSize = payload.pageSize;
    if (!payload?.pageSize) pdfOptions.pageSize = 'A4';
    const data = await pdfWindow.webContents.printToPDF(pdfOptions);
    fs.writeFileSync(file, data);
  } finally {
    if (!pdfWindow.isDestroyed()) pdfWindow.destroy();
  }
  if (payload?.open !== false) await shell.openPath(file);
  return file;
}

function registerIpc() {
  const safeIpcHandle = (channel: string, listener: (...args: any[]) => any) => {
    try { ipcMain.removeHandler(channel); } catch {}
    ipcMain.handle(channel, async (...args: any[]) => {
      try { return await listener(...args); }
      catch (err: any) {
        const message = String(err?.message || err || 'Action failed.');
        if (channel.startsWith('collection:')) return { ok: false, error: message };
        throw err;
      }
    });
  };
  safeIpcHandle('app:set-dirty', (_e, dirty = false) => { rendererHasUnsavedWork = !!dirty; return true; });
  safeIpcHandle('app:prepare-shutdown', async () => prepareShutdownWithProgress());
  safeIpcHandle('app:close-decision', (_e, allowClose = false) => {
    if (closeFallbackTimer) { clearTimeout(closeFallbackTimer); closeFallbackTimer = null; }
    closePromptInProgress = false;
    if (allowClose && mainWindow) {
      pendingClose = true;
      rendererHasUnsavedWork = false;
      mainWindow.destroy();
    }
    return true;
  });

  safeIpcHandle('dashboard', () => db.dashboard());
  safeIpcHandle('settings:get-all', () => db.getSettings());
  safeIpcHandle('settings:save-all', (_e, s) => { const out = db.saveSettings(s); backups.start(); analyzerApi?.restart(); return out; });
  safeIpcHandle('settings:get-one', (_e, key, fallback = '') => db.getSetting(String(key), String(fallback ?? '')));
  safeIpcHandle('settings:set-one', (_e, key, value) => { db.setSetting(String(key), String(value ?? '')); return db.getSettings(); });
  safeIpcHandle('report:choose-image', async () => {
    const win = mainWindow || undefined;
    try {
      const result = await dialog.showOpenDialog(win as any, {
        title: 'Choose report image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png','jpg','jpeg','webp'] }]
      });
      if (result.canceled || !result.filePaths?.length) return null;
      return { path: result.filePaths[0] };
    } finally {
      restoreMainWindowFocus();
    }
  });
  safeIpcHandle('paths:choose-dir', async (_e, title = 'Choose folder') => {
    const win = mainWindow || undefined;
    try {
      const result = await dialog.showOpenDialog(win as any, { title: String(title || 'Choose folder'), properties: ['openDirectory', 'createDirectory'] });
      if (result.canceled || !result.filePaths?.length) return null;
      return { path: result.filePaths[0] };
    } finally {
      restoreMainWindowFocus();
    }
  });
  safeIpcHandle('paths:set-data-dir', async (_e, dir) => {
    const selected = String(dir || '').trim();
    if (!selected) throw new Error('Database folder is required.');
    fs.mkdirSync(selected, { recursive: true });
    const targetDb = path.join(selected, 'lims.sqlite3');
    const currentDb = db.dbPath;
    const samePath = path.resolve(selected) === path.resolve(db.dataDir);
    let copied = false;
    let usedExisting = false;
    if (!samePath) {
      if (fs.existsSync(targetDb)) {
        usedExisting = true;
      } else if (fs.existsSync(currentDb)) {
        fs.copyFileSync(currentDb, targetDb);
        for (const suffix of ['-wal', '-shm']) {
          const src = currentDb + suffix;
          if (fs.existsSync(src)) fs.copyFileSync(src, targetDb + suffix);
        }
        copied = true;
      }
    }
    DatabaseService.writePathConfig({ dataDir: selected });
    return {
      dataDir: selected,
      restartRequired: true,
      copied,
      usedExisting,
      message: usedExisting
        ? 'Selected folder already has a database. Restart to use that database.'
        : (copied
          ? 'Current database was copied to the new folder. Restart to use it.'
          : 'Database folder changed. Restart the app to use the new location.')
    };
  });
  safeIpcHandle('masters:departments', (_e, activeOnly=false) => db.listDepartments(!!activeOnly));
  safeIpcHandle('masters:department:save', (_e, x) => db.saveDepartment(x));
  safeIpcHandle('masters:department:delete', (_e, id) => db.deleteDepartment(Number(id)));
  safeIpcHandle('masters:departments:reorder', (_e, items) => db.reorderDepartments(items));
  safeIpcHandle('masters:units', () => db.listUnits());
  safeIpcHandle('masters:unit:save', (_e, x) => db.saveUnit(x));
  safeIpcHandle('masters:tests', (_e, activeOnly=false) => db.listTests(activeOnly));
  safeIpcHandle('masters:test:save', (_e, x) => db.saveTest(x));
  safeIpcHandle('masters:test:delete', (_e, id) => db.deleteTest(id));
  safeIpcHandle('masters:tests:reorder', (_e, items) => db.reorderTests(items));
  safeIpcHandle('masters:specimens', () => db.listSpecimenTypes());
  safeIpcHandle('masters:specimen:save', (_e, x) => db.saveSpecimenType(x));
  safeIpcHandle('masters:methods', () => db.listTestMethods());
  safeIpcHandle('masters:profiles', (_e, activeOnly=false) => db.listProfiles(activeOnly));
  safeIpcHandle('masters:profile:save', (_e, x) => db.saveProfile(x));
  safeIpcHandle('masters:profiles:reorder', (_e, items) => db.reorderProfiles(items));
  safeIpcHandle('masters:equipment:list', (_e, activeOnly=false) => db.listEquipmentMasters(activeOnly));
  safeIpcHandle('masters:equipment:save', (_e, x) => db.saveEquipmentMaster(x));
  safeIpcHandle('masters:equipment:delete', (_e, id) => db.deleteEquipmentMaster(Number(id)));
  safeIpcHandle('masters:profile:delete', (_e, id) => db.deleteProfile(id));
  safeIpcHandle('consultants:list', () => db.listConsultants());
  safeIpcHandle('consultants:save', (_e, x) => db.saveConsultant(x));
  safeIpcHandle('consultants:delete', (_e, id) => db.deleteConsultant(Number(id)));
  safeIpcHandle('consultants:commission:calculate', (_e, payload={}) => db.calculateBillCommission(payload));
  safeIpcHandle('commissions:list', (_e, filters={}) => db.listCommissionEntries(filters));
  safeIpcHandle('commissions:status', (_e, payload={}) => db.updateCommissionStatus(payload));
  safeIpcHandle('commissions:settle', (_e, payload={}) => db.createCommissionSettlement(payload));
  safeIpcHandle('commissions:settlements', (_e, filters={}) => db.listCommissionSettlements(filters));
  safeIpcHandle('commissions:groups:list', () => db.listCommissionGroups());
  safeIpcHandle('commissions:groups:save', (_e,payload={}) => db.saveCommissionGroup(payload));
  safeIpcHandle('commissions:groups:delete', (_e,id) => db.deleteCommissionGroup(Number(id)));
  safeIpcHandle('commissions:formula:validate', (_e,payload={}) => db.validateCommissionFormula(payload));
  safeIpcHandle('commissions:consultant-groups:list', (_e,id) => db.listConsultantGroupAssignments(Number(id)));
  safeIpcHandle('commissions:consultant-groups:save', (_e,payload={}) => db.saveConsultantGroupAssignments(payload));

  safeIpcHandle('operations:dashboard', () => db.operationsDashboard());
  safeIpcHandle('operations:vendors:list', () => db.listVendors());
  safeIpcHandle('operations:vendors:save', (_e, x) => db.saveVendor(x));
  safeIpcHandle('operations:inventory:list', () => db.listInventoryItems());
  safeIpcHandle('operations:units:list', () => db.listOperationUnits());
  safeIpcHandle('operations:brands:list', () => db.listOperationBrands());
  safeIpcHandle('operations:hsns:list', () => db.listOperationHsns());
  safeIpcHandle('operations:inventory:versions', (_e, itemId) => db.listInventoryItemVersions(Number(itemId)));
  safeIpcHandle('operations:inventory:batches', (_e, itemId) => db.listInventoryBatches(Number(itemId)));
  safeIpcHandle('operations:inventory:save', (_e, x) => db.saveInventoryItem(x));
  safeIpcHandle('operations:purchases:save', (_e, x) => db.savePurchase(x));
  safeIpcHandle('operations:purchases:list', (_e, f={}) => db.listPurchases(f));
  safeIpcHandle('operations:purchases:item-history', (_e, itemId) => db.listPurchaseItemHistory(itemId));
  safeIpcHandle('operations:reagents:list', (_e, testId) => db.listReagentConsumption(testId ? Number(testId) : undefined));
  safeIpcHandle('operations:reagents:save', (_e, x) => db.saveReagentConsumption(x));
  safeIpcHandle('operations:reagents:delete', (_e, id) => db.deleteReagentConsumption(Number(id)));
  safeIpcHandle('operations:expenses:save', (_e, x) => db.saveExpense(x));
  safeIpcHandle('operations:expenses:list', (_e, f={}) => db.listExpenses(f));
  safeIpcHandle('operations:payments:save', (_e, x) => db.savePayment(x));
  safeIpcHandle('operations:payments:list', (_e, f={}) => db.listPayments(f));
  safeIpcHandle('operations:outsource-vendors:list', () => db.listOutsourceVendors());
  safeIpcHandle('operations:outsource-vendors:save', (_e, x) => db.saveOutsourceVendor(x));
  safeIpcHandle('operations:outsource-rates:list', () => db.listOutsourceRates());
  safeIpcHandle('operations:outsource-rates:save', (_e, x) => db.saveOutsourceRate(x));
  safeIpcHandle('operations:outsource-cases:save', (_e, x) => db.saveOutsourceCase(x));
  safeIpcHandle('operations:outsource-cases:list', (_e, f={}) => db.listOutsourceCases(f));

  const collectionIpc = async (fn: () => any) => {
    try { return { ok: true, data: await fn() }; }
    catch (err: any) { return { ok: false, error: String(err?.message || err || 'Collection action failed.') }; }
  };
  safeIpcHandle('collection:pending', () => db.listCollectionPending());
  safeIpcHandle('collection:accepted-pending', () => db.listAcceptedCollectionPending());
  safeIpcHandle('collection:accept-request', (_e, billId) => collectionIpc(() => db.acceptCollectionRequest(Number(billId))));
  safeIpcHandle('collection:cancel-accepted-request', (_e, billId) => collectionIpc(() => db.cancelAcceptedCollectionRequest(Number(billId))));
  safeIpcHandle('collection:bill', (_e, billId) => db.getCollectionBill(Number(billId)));
  safeIpcHandle('collection:save', (_e, payload) => collectionIpc(() => db.saveCollection(payload)));
  safeIpcHandle('collection:list', (_e, f={}) => db.listCollections(f));
  safeIpcHandle('collection:logs', (_e, f={}) => db.listCollectionLogs(f));
  safeIpcHandle('collection:dispatch-status', (_e, collectionId, status) => collectionIpc(() => db.updateCollectionDispatchStatus(Number(collectionId), String(status || 'READY'))));
  safeIpcHandle('collection:vendor-result', (_e, collectionId, payload) => collectionIpc(() => db.receiveOutsourceVendorResult(Number(collectionId), payload || {})));
  safeIpcHandle('collection:reject', (_e, collectionId, reason) => collectionIpc(() => db.rejectCollection(Number(collectionId), String(reason || ''))));
  safeIpcHandle('collection:delete-rejected', (_e, collectionId) => collectionIpc(() => db.deleteRejectedCollection(Number(collectionId))));
  safeIpcHandle('collection:recollect', (_e, collectionId) => collectionIpc(() => db.recollectCollection(Number(collectionId))));
  safeIpcHandle('collection:reopen-approved-report', (_e, ref, reason) => collectionIpc(() => {
    const payload: any = ref && typeof ref === 'object' ? ref : { report_id: ref };
    let id = Number(payload.report_id || payload.reportId || 0);
    const collectionId = Number(payload.collection_id || payload.collectionId || 0);
    const correctionReason = String(reason || '').trim();
    if (!id && collectionId) {
      const row: any = db.getCollectionReportReference(collectionId);
      id = Number(row?.report_id || 0);
    }
    if (!id) throw new Error('Report id not found for this collection row. Refresh and try again.');
    if (!correctionReason) throw new Error('Correction reason is required.');
    const report: any = db.getReport(id);
    if (!report?.id) throw new Error('Report not found.');
    return db.saveReport({
      ...report,
      status: 'TYPED',
      correction_mode: true,
      correction_reason: correctionReason,
      correction_remarks: correctionReason,
      remarks: `${report.remarks || ''}${report.remarks ? '\n' : ''}Correction: ${correctionReason}`,
      items: (report.items || []).filter((x: any) => x?.test_id)
    });
  }));
  safeIpcHandle('patients:list', (_e, q='') => db.listPatients(q));
  safeIpcHandle('patients:save', (_e, x) => {
    const id = db.savePatient(x);
    if (x?.apply_scope) return { id, scope: db.lastPatientScopeResult() };
    return id;
  });
  safeIpcHandle('patients:history', (_e, id) => db.patientHistory(Number(id)));
  safeIpcHandle('patients:unused-preview', () => db.previewUnusedPatients());
  safeIpcHandle('patients:drop-unused', () => db.dropUnusedPatients());
  safeIpcHandle('billing:create', (_e, payload) => db.createBill(payload));
  safeIpcHandle('billing:update', (_e, payload) => db.updateBill(payload));
  safeIpcHandle('billing:list', (_e, filters={}) => db.listBills(filters));
  safeIpcHandle('billing:analytics', (_e, filters={}) => db.analytics(filters));
  safeIpcHandle('billing:get', (_e, id) => db.getBill(Number(id)));
  safeIpcHandle('billing:cancel', (_e, billId, payload={}) => db.cancelBill(Number(billId), payload));
  safeIpcHandle('billing:delete', (_e, billId) => db.deleteBill(Number(billId)));
  safeIpcHandle('receipts:add', (_e, billId, amount, mode) => db.addReceipt(Number(billId), Number(amount), String(mode || 'Cash')));
  safeIpcHandle('receipts:delete', (_e, billId, receiptId) => db.deleteReceipt(Number(billId), Number(receiptId)));
  safeIpcHandle('reports:list', (_e, status='') => db.listReports(status));
  safeIpcHandle('reports:logs', (_e, f={}) => db.listReportLogs(f));
  safeIpcHandle('reports:get', (_e, id) => db.getReport(Number(id)));
  safeIpcHandle('reports:save', (_e, payload) => db.saveReport(payload));
  safeIpcHandle('reports:remove-pending', (_e, reportId, payload={}) => db.removePendingReport(Number(reportId), payload));
  safeIpcHandle('reports:reject', (_e, reportId, payload) => db.rejectReport(Number(reportId), payload));
  safeIpcHandle('reports:reopen-approved-correction', (_e, reportId, payload={}) => db.reopenApprovedReportForCorrection(Number(reportId), payload));
  safeIpcHandle('reports:request-recheck', (_e, payload={}) => db.requestReportRecheck(payload));
  safeIpcHandle('reports:revert-recheck', (_e, payload={}) => db.revertReportRecheck(payload));
  safeIpcHandle('reports:quick-cancel', (_e, reportId, reason='Cancelled from Finished Reports') => db.cancelQuickFinishedReport(Number(reportId), String(reason || 'Cancelled from Finished Reports')));
  safeIpcHandle('reports:quick-delete', (_e, reportId, reason='Deleted from Finished Reports') => db.deleteQuickFinishedReport(Number(reportId), String(reason || 'Deleted from Finished Reports')));
  safeIpcHandle('quick-reporting-barcode:state', (_e, reportOrBillId) => db.quickReportingBarcodeState(Number(reportOrBillId)));
  safeIpcHandle('quick-reporting-barcode:generate', (_e, reportOrBillId, payload={}) => db.quickReportingBarcodeGenerate(Number(reportOrBillId), payload || {}));
  safeIpcHandle('quick-reporting-barcode:reset', (_e, reportOrBillId, payload={}) => db.quickReportingBarcodeReset(Number(reportOrBillId), payload || {}));
  const runWithReportProgress = async (event:any, task:((progress:(payload:any)=>void)=>Promise<any>)) => {
    const send = (payload:any) => {
      try { if (!event.sender.isDestroyed()) event.sender.send('report-progress', payload); } catch { /* renderer closed */ }
    };
    try {
      return await task(send);
    } catch (error:any) {
      send({ stage:'error', stageLabel:'Unable to complete', title:'PDF generation failed', message:String(error?.message || error || 'Unable to generate PDF'), current:0, total:0, progress:100, statusText:'Failed' });
      throw error;
    } finally {
      // Successful paths send done below; error stays visible briefly in UI.
    }
  };

  safeIpcHandle('reports:pdf', async (_e, id, withBackground) => runWithReportProgress(_e, async reportProgress => { const result = await reports.createReportPdf(Number(id), withBackground, { pdfOutputMode:'export', reportProgress }); reportProgress({stage:'done',stageLabel:'Completed',title:'Report ready',message:'The PDF has been created successfully.',current:1,total:1,progress:100,statusText:'Completed'}); return result; }));
  safeIpcHandle('reports:pdf-data', async (_e, id, withBackground) => {
    const file = await reports.createReportPdf(Number(id), withBackground, { pdfOutputMode:'preview', reportProgress: (payload:any) => { try { _e.sender.send('report-progress', payload); } catch {} } });
    const buffer = fs.readFileSync(file);
    try { fs.unlinkSync(file); } catch { /* temp preview cleanup */ }
    try { _e.sender.send('report-progress', {stage:'done',stageLabel:'Completed',title:'Report ready',message:'Opening preview...',current:1,total:1,progress:100,statusText:'Completed'}); } catch {}
    return { file: '', dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}` };
  });
  safeIpcHandle('reports:settings-preview-pdf-data', async (_e, mode='profile', withBackground=true) => {
    const reportProgress = (payload:any) => { try { _e.sender.send('report-progress', payload); } catch {} };
    const file = await reports.createReportSettingsPreviewPdf(String(mode || 'profile'), withBackground !== false, { reportProgress });
    const buffer = fs.readFileSync(file);
    try { fs.unlinkSync(file); } catch { /* temp preview cleanup */ }
    try { _e.sender.send('report-progress', {stage:'done',stageLabel:'Completed',title:'Report ready',message:'Opening preview...',current:1,total:1,progress:100,statusText:'Completed'}); } catch {}
    return { file: '', dataUrl: `data:application/pdf;base64,${buffer.toString('base64')}` };
  });
  safeIpcHandle('reports:excel', async (_e, id) => reports.createReportExcel(Number(id)));
  safeIpcHandle('reports:print', async (_e, id, withBackground=true) => runWithReportProgress(_e, async reportProgress => { if (!mainWindow) throw new Error('Window not ready'); const result = await reports.printReport(Number(id), mainWindow, {withBackground: withBackground !== false, reportProgress}); reportProgress({stage:'done',stageLabel:'Completed',title:'Report ready',message:'Opening the PDF...',current:1,total:1,progress:100,statusText:'Completed'}); return result; }));
  safeIpcHandle('print:html-pdf-open', async (_e, payload={}) => createHtmlPdfFile({ ...(payload || {}), open: true }));
  safeIpcHandle('analytics:pdf-open', async (_e, payload={}) => analyticsPdf.createAndOpen(payload || {}));
  safeIpcHandle('analytics:xlsx-open', async (_e, payload={}) => analyticsPdf.createExcelAndSave(payload || {}));

  safeIpcHandle('reports:approved-pdf-export', async (_e, id, options={}) => {
    const reportProgress = (payload:any) => { try { _e.sender.send('report-progress', payload); } catch {} };
    const file = await reports.createReportPdf(Number(id), options?.withBackground !== false, {...options, pdfOutputMode:'export', reportProgress});
    db.markReportDelivery(Number(id), 'PDF_EXPORT');
    reportProgress({stage:'done',stageLabel:'Completed',title:'Report ready',message:'The PDF has been exported successfully.',current:1,total:1,progress:100,statusText:'Completed'});
    return file;
  });
  safeIpcHandle('reports:approved-print', async (_e, id, options={}) => {
    if (!mainWindow) throw new Error('Window not ready');
    const reportProgress = (payload:any) => { try { _e.sender.send('report-progress', payload); } catch {} };
    const file = await reports.printReport(Number(id), mainWindow, {...options, withBackground: options?.withBackground !== false, reportProgress});
    db.markReportDelivery(Number(id), 'PRINT');
    reportProgress({stage:'done',stageLabel:'Completed',title:'Report ready',message:'Opening the PDF...',current:1,total:1,progress:100,statusText:'Completed'});
    return file;
  });
  safeIpcHandle('reports:approved-email', async (_e, id, options={}) => {
    const report:any = db.getReport(Number(id));
    if (!report?.id) throw new Error('Report not found');
    if (String(report.status || '').toUpperCase() !== 'APPROVED') throw new Error('Email is available only for approved reports.');
    const file = await reports.createReportPdf(Number(id), options?.withBackground !== false, {...options, pdfOutputMode:'preview'});
    const to = String(report.patient_email || '').trim();
    const subject = encodeURIComponent(`Lab report ${report.bill_no || ''}`.trim());
    const body = encodeURIComponent(`Dear ${report.patient_name || 'Patient'},

Your approved lab report is ready. Please find the exported PDF from the lab system.

Bill: ${report.bill_no || ''}

Regards`);
    await shell.openExternal(`mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`);
    db.markReportDelivery(Number(id), 'EMAIL', to || 'email handoff');
    return { file, to };
  });
  safeIpcHandle('reports:approved-whatsapp', async (_e, id, options={}) => {
    const report:any = db.getReport(Number(id));
    if (!report?.id) throw new Error('Report not found');
    if (String(report.status || '').toUpperCase() !== 'APPROVED') throw new Error('WhatsApp is available only for approved reports.');

    const emit = (payload: Record<string, any>) => {
      try { _e.sender.send('whatsapp-handoff-progress', payload); } catch { /* ignore */ }
    };
    const step = (sid: string, label: string, status: 'pending' | 'running' | 'done' | 'error' | 'skipped', detail = '', progress = 0) => {
      emit({ id: sid, label, status, detail, progress, billNo: report.bill_no || '', reportId: report.id });
    };

    // Phase 1: Report Generation overlay (report-progress) — same as Export PDF.
    // Phase 2: WhatsApp live status (clipboard + open) after PDF is done.
    const reportProgress = (payload: any) => {
      try { _e.sender.send('report-progress', payload); } catch { /* ignore */ }
    };
    const file = await reports.createReportPdf(Number(id), options?.withBackground !== false, {
      ...options,
      pdfOutputMode: 'export',
      reportProgress
    });
    reportProgress({
      stage: 'done',
      stageLabel: 'Completed',
      title: 'Report ready',
      message: 'The PDF has been exported successfully.',
      current: 1,
      total: 1,
      progress: 100,
      statusText: 'Completed'
    });
    // Let the Report Generation overlay finish its dismiss animation before WhatsApp status.
    await new Promise(resolve => setTimeout(resolve, 900));

    step('clipboard', 'Copying PDF to clipboard', 'running', file, 40);
    const clipboardResult = await copyFileToClipboard(file);
    if (clipboardResult.ok && clipboardResult.mode === 'file') {
      step('clipboard', 'PDF copied to clipboard', 'done', 'Ready to paste with Ctrl+V in WhatsApp Desktop', 70);
    } else if (clipboardResult.ok) {
      step('clipboard', 'Path copied (file paste may not work)', 'done', file, 70);
    } else {
      step('clipboard', 'Clipboard copy failed', 'error', clipboardResult.error || 'Could not copy PDF file', 70);
    }

    step('whatsapp', 'Opening WhatsApp', 'running', '', 88);
    const mobile = normalizeWaMobile(options?.mobile || report.patient_mobile || report.mobile || '');
    const body = encodeURIComponent(formatWhatsAppPatientCaption(report));
    if (mobile) await shell.openExternal(`https://wa.me/${mobile.replace(/^\+/, '')}?text=${body}`);
    else await shell.openExternal(`https://wa.me/?text=${body}`);
    step('whatsapp', mobile ? `WhatsApp opened for ${mobile}` : 'WhatsApp opened', 'done', '', 98);

    db.markReportDelivery(Number(id), 'EMAIL', mobile || 'whatsapp handoff');
    const summary = clipboardResult.ok && clipboardResult.mode === 'file'
      ? 'Done — PDF ready and copied. Press Ctrl+V in the chat to attach.'
      : clipboardResult.ok
        ? 'Done — PDF ready. Clipboard has the path; attach the file manually if paste fails.'
        : 'Done — PDF ready, but clipboard copy failed. Attach the PDF from the reports folder.';
    emit({
      id: 'done',
      label: summary,
      status: clipboardResult.ok ? 'done' : 'error',
      detail: file,
      progress: 100,
      cancelled: false,
      clipboardCopied: clipboardResult.ok,
      clipboardMode: clipboardResult.mode,
      clipboardError: clipboardResult.error || ''
    });

    return {
      file,
      mobile,
      openFile: false,
      cancelled: false,
      clipboardCopied: clipboardResult.ok,
      clipboardMode: clipboardResult.mode,
      clipboardError: clipboardResult.error || '',
      summary
    };
  });
  safeIpcHandle('clipboard:copy-file', async (_e, filePath) => copyFileToClipboard(String(filePath || '')));
  safeIpcHandle('whatsapp:open-contact', async (_e, mobileRaw, options:any = {}) => {
    let mobile = normalizeWaMobile(mobileRaw);
    if (!mobile) throw new Error('Patient mobile number is not available.');
    const file = String(options?.file || options?.filePath || '').trim();
    let clipboardResult: { ok: boolean; mode: 'file' | 'path' | 'none'; error?: string } = { ok: false, mode: 'none' };
    if (file) clipboardResult = await copyFileToClipboard(file);
    await shell.openExternal(`https://wa.me/${mobile}`);
    return {
      ok: true,
      mobile,
      clipboardCopied: clipboardResult.ok,
      clipboardMode: clipboardResult.mode,
      clipboardError: clipboardResult.error || ''
    };
  });
  safeIpcHandle('billing:whatsapp', async (_e, billId, options:any = {}) => {
    const id = Number(billId);
    if (!id) throw new Error('Bill id is required.');
    const row:any = (db as any).getBill?.(id);
    if (!row?.id) throw new Error('Bill not found.');

    const emit = (payload: Record<string, any>) => {
      try { _e.sender.send('whatsapp-handoff-progress', payload); } catch { /* ignore */ }
    };
    const step = (sid: string, label: string, status: string, detail = '', progress = 0) => {
      emit({ id: sid, label, status, detail, progress, billNo: row.bill_no || '', billId: id });
    };

    const mobile = normalizeWaMobile(options?.mobile || row.patient_mobile || row.mobile || row.patient?.mobile || '');
    if (!mobile) throw new Error('Patient mobile number is not available.');

    step('generate', 'Generating bill PDF', 'running', '', 25);
    const includeReceipts = options?.includeReceipts !== false;
    const file = await reports.createBillPdf(id, !!includeReceipts);
    step('generate', 'Bill PDF ready', 'done', file, 55);

    step('clipboard', 'Copying PDF to clipboard', 'running', '', 75);
    const clipboardResult = await copyFileToClipboard(file);
    if (clipboardResult.ok && clipboardResult.mode === 'file') {
      step('clipboard', 'PDF copied to clipboard', 'done', 'Press Ctrl+V in WhatsApp Desktop to attach', 88);
    } else if (clipboardResult.ok) {
      step('clipboard', 'Path copied (file paste may not work)', 'done', file, 88);
    } else {
      step('clipboard', 'Clipboard copy failed', 'error', clipboardResult.error || 'Could not copy PDF', 88);
    }

    step('whatsapp', 'Opening WhatsApp', 'running', '', 94);
    await shell.openExternal(`https://wa.me/${mobile}`);
    step('whatsapp', `WhatsApp opened for ${mobile}`, 'done', '', 98);

    const summary = clipboardResult.ok && clipboardResult.mode === 'file'
      ? 'Done — bill PDF copied to clipboard. Press Ctrl+V in the chat to attach.'
      : clipboardResult.ok
        ? 'Done — WhatsApp opened. Clipboard has the path; attach manually if paste fails.'
        : 'Done — WhatsApp opened, but clipboard copy failed. Attach the bill PDF manually.';
    emit({ id: 'done', label: summary, status: clipboardResult.ok ? 'done' : 'error', detail: file, progress: 100 });

    return {
      ok: true,
      file,
      mobile,
      openFile: false,
      clipboardCopied: clipboardResult.ok,
      clipboardMode: clipboardResult.mode,
      clipboardError: clipboardResult.error || '',
      summary
    };
  });
  safeIpcHandle('reports:approved-sms', async (_e, id, options={}) => {
    const report:any = db.getReport(Number(id));
    if (!report?.id) throw new Error('Report not found');
    if (String(report.status || '').toUpperCase() !== 'APPROVED') throw new Error('SMS is available only for approved reports.');
    const mobile = String(report.patient_mobile || report.mobile || '').replace(/[^0-9+]/g, '');
    const body = encodeURIComponent(`Your approved lab report for bill ${report.bill_no || ''} is ready. Please contact the lab for the PDF/report copy.`);
    if (mobile) await shell.openExternal(`sms:${mobile}?&body=${body}`); else await shell.openExternal(`sms:?&body=${body}`);
    db.markReportDelivery(Number(id), 'SMS', mobile || 'sms handoff');
    return { mobile };
  });
  safeIpcHandle('reports:item-history', (_e, patientId, testId, currentReportId) => db.reportItemHistory(Number(patientId), Number(testId), Number(currentReportId || 0)));
  safeIpcHandle('billing:pdf', async (_e, billId, includeReceipts) => reports.createBillPdf(Number(billId), !!includeReceipts));
  safeIpcHandle('receipts:pdf', async (_e, billId, receiptId) => reports.createReceiptPdf(Number(billId), receiptId ? Number(receiptId) : undefined));
  safeIpcHandle('statement', (_e, filters={}) => db.statement(filters));
  safeIpcHandle('statement:excel', async (_e, filters={}) => reports.createStatementExcel(filters));
  safeIpcHandle('statement:pdf', async (_e, filters={}) => reports.createStatementPdf(filters));
  safeIpcHandle('backup:create', (_e, reason) => {
    const cleaned = String(reason || 'manual').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    return backups.createBackup(cleaned || 'manual');
  });
  safeIpcHandle('backup:list', () => backups.listBackups());
  safeIpcHandle('backup:validate', (_e, filePath) => backups.validateBackup(String(filePath || '')));
  safeIpcHandle('backup:restore', async (_e, filePath) => {
    backups.stop();
    analyzerApi?.stop();
    try { return await backups.restoreBackup(String(filePath || '')); }
    finally { backups.start(); analyzerApi?.restart(); }
  });
  safeIpcHandle('debug:reset-workflow-data', () => {
    if (app.isPackaged) {
      throw new Error('Clear test data is disabled in the installed app to protect live bills and reports. Use a development build if you need a full workflow reset.');
    }
    return db.resetTransactionalWorkflowData('Manual debug reset from app');
  });
  safeIpcHandle('paths:data-dir', () => db.dataDir);
  safeIpcHandle('paths:reports-dir', () => db.reportsDir);
  safeIpcHandle('paths:open', async (_e, fileOrDir) => shell.openPath(String(fileOrDir)));
  safeIpcHandle('analyzer-api:status', () => analyzerApi?.status());
  safeIpcHandle('analyzer-api:restart', () => analyzerApi?.restart());
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  log.initialize();
  db = new DatabaseService();
  reports = new ReportService(db);
  analyticsPdf = new AnalyticsPdfService(db);
  backups = new BackupService(db);
  analyzerApi = new AnalyzerApiService(db);
  backups.start();
  analyzerApi.start();
  registerIpc();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('before-quit', () => {
  shutdownAppServices('before-quit');
});

app.on('will-quit', () => {
  shutdownAppServices('will-quit');
});

app.on('window-all-closed', () => {
  if (!gotSingleInstanceLock) return;
  shutdownAppServices('window-all-closed');
  if (process.platform !== 'darwin') app.quit();
});
