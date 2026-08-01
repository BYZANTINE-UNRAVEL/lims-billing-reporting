import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function requireMarker(source, marker, label) {
  const index = source.indexOf(marker);
  if (index < 0) throw new Error(`Missing ${label} marker: ${marker}`);
  return index;
}

function protectedMembers(source) {
  return source
    .replace(/^  private /gm, '  protected ')
    .replace(/constructor\(private db: DatabaseService\)/g, 'constructor(protected db: DatabaseService)');
}

function classFile(imports, className, parentName, body) {
  return `${imports}\n\nexport class ${className}${parentName ? ` extends ${parentName}` : ''} {${protectedMembers(body)}\n}\n`;
}

function splitDatabaseService() {
  const file = path.join(root, 'electron-main/services/database.service.ts');
  const source = fs.readFileSync(file, 'utf8');
  const classMarker = 'export class DatabaseService {';
  const classStart = requireMarker(source, classMarker, 'database class');
  const imports = source.slice(0, classStart).trimEnd();
  const bodyStart = classStart + classMarker.length;
  const billingStart = requireMarker(source, '  createBill(payload: any) {', 'billing');
  const workflowStart = requireMarker(source, '  getReport(id:number) {', 'workflow');
  const sharedTailStart = requireMarker(source, '  audit(action:string, details=', 'shared tail');
  const operationsStart = requireMarker(source, '  operationsDashboard() {', 'operations');
  const resetStart = requireMarker(source, '  resetTransactionalWorkflowDataOnce(', 'reset');
  const classEnd = source.lastIndexOf('\n}');
  if (classEnd < resetStart) throw new Error('Database class closing brace not found.');

  const sharedTail = source.slice(sharedTailStart, operationsStart);
  const coreBody = source.slice(bodyStart, billingStart) + '\n' + sharedTail;
  const billingBody = source.slice(billingStart, workflowStart);
  const workflowBody = source.slice(workflowStart, sharedTailStart);
  const operationsBody = source.slice(operationsStart, resetStart);
  const resetBody = source.slice(resetStart, classEnd);

  const core = classFile(
    imports,
    'DatabaseCoreService',
    '',
    coreBody.replaceAll('DatabaseService.pathConfigFile()', 'DatabaseCoreService.pathConfigFile()')
      .replaceAll('DatabaseService.readPathConfig()', 'DatabaseCoreService.readPathConfig()')
      .replaceAll('DatabaseService.configuredDataDir()', 'DatabaseCoreService.configuredDataDir()')
  );
  const billing = classFile("import { DatabaseCoreService } from './database-core.service';", 'DatabaseBillingService', 'DatabaseCoreService', billingBody);
  const workflow = classFile("import { DatabaseBillingService } from './database-billing.service';", 'DatabaseWorkflowService', 'DatabaseBillingService', workflowBody);
  const operations = classFile("import { DatabaseWorkflowService } from './database-workflow.service';", 'DatabaseOperationsService', 'DatabaseWorkflowService', operationsBody);
  const facade = classFile("import { DatabaseOperationsService } from './database-operations.service';", 'DatabaseService', 'DatabaseOperationsService', resetBody);

  fs.writeFileSync(path.join(root, 'electron-main/services/database-core.service.ts'), core);
  fs.writeFileSync(path.join(root, 'electron-main/services/database-billing.service.ts'), billing);
  fs.writeFileSync(path.join(root, 'electron-main/services/database-workflow.service.ts'), workflow);
  fs.writeFileSync(path.join(root, 'electron-main/services/database-operations.service.ts'), operations);
  fs.writeFileSync(file, facade);
}

function splitReportService() {
  const file = path.join(root, 'electron-main/services/report.service.ts');
  const source = fs.readFileSync(file, 'utf8');
  const classMarker = 'export class ReportService {';
  const classStart = requireMarker(source, classMarker, 'report class');
  const imports = source.slice(0, classStart).trimEnd();
  const bodyStart = classStart + classMarker.length;
  const layoutStart = requireMarker(source, '  private reportRepeatAllowed(', 'report layout');
  const contentStart = requireMarker(source, '  private normalizeReportIdList(', 'report content');
  const documentStart = requireMarker(source, '  async createReportPdf(', 'report document');
  const billingStart = requireMarker(source, '  async createBillPdf(', 'report billing');
  const classEnd = source.lastIndexOf('\n}');
  if (classEnd < billingStart) throw new Error('Report class closing brace not found.');

  const coreBody = source.slice(bodyStart, layoutStart);
  const layoutBody = source.slice(layoutStart, contentStart);
  const contentBody = source.slice(contentStart, documentStart);
  const documentBody = source.slice(documentStart, billingStart);
  const billingBody = source.slice(billingStart, classEnd);
  const sharedImports = `import fs from 'node:fs';\nimport path from 'node:path';\nimport os from 'node:os';\nimport ExcelJS from 'exceljs';\nconst PdfPrinter = require('pdfmake');\ntype ReportAlignment = 'left' | 'center' | 'right';\nimport { BrowserWindow, shell } from 'electron';`;

  fs.writeFileSync(path.join(root, 'electron-main/services/report-core.service.ts'), classFile(imports, 'ReportCoreService', '', coreBody));
  fs.writeFileSync(path.join(root, 'electron-main/services/report-layout.service.ts'), classFile(`${sharedImports}\nimport { ReportCoreService } from './report-core.service';`, 'ReportLayoutService', 'ReportCoreService', layoutBody));
  fs.writeFileSync(path.join(root, 'electron-main/services/report-content.service.ts'), classFile(`${sharedImports}\nimport { ReportLayoutService } from './report-layout.service';`, 'ReportContentService', 'ReportLayoutService', contentBody));
  fs.writeFileSync(path.join(root, 'electron-main/services/report-document.service.ts'), classFile(`${sharedImports}\nimport { ReportContentService } from './report-content.service';`, 'ReportDocumentService', 'ReportContentService', documentBody));
  fs.writeFileSync(file, classFile(`${sharedImports}\nimport { ReportDocumentService } from './report-document.service';`, 'ReportService', 'ReportDocumentService', billingBody));
}

splitDatabaseService();
splitReportService();
