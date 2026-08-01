import http, { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseService } from './database.service';

type ApiConfig = { enabled: boolean; host: string; port: number; basePath: string; publicUrl: string; logPath: string };

export class AnalyzerApiService {
  private server: http.Server | null = null;
  private config: ApiConfig | null = null;

  constructor(private db: DatabaseService) {}

  status() {
    return { running: !!this.server, ...(this.config || this.db.getAnalyzerApiSettings()) };
  }

  start() {
    const cfg = this.db.getAnalyzerApiSettings();
    this.config = cfg;
    if (!cfg.enabled) return this.stop();
    if (this.server) return this.status();
    this.server = http.createServer((req, res) => this.handle(req, res));
    this.server.on('error', (err: any) => console.error('[analyzer-api-server]', err?.message || err));
    this.server.listen(cfg.port, cfg.host, () => {
      console.log(`[analyzer-api-server] listening on ${cfg.host}:${cfg.port}${cfg.basePath}`);
    });
    return this.status();
  }

  stop() {
    if (this.server) {
      try { this.server.close(); } catch {}
      this.server = null;
    }
    return this.status();
  }

  restart() {
    this.stop();
    return this.start();
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const cfg = this.db.getAnalyzerApiSettings();
    this.config = cfg;
    const startedAt = this.db.currentIstTimestamp();
    const method = String(req.method || 'GET').toUpperCase();
    const host = req.headers.host || `${cfg.host}:${cfg.port}`;
    const url = new URL(req.url || '/', `http://${host}`);
    let body: any = null;
    let equipmentId = 0;
    let sampleId = '';
    let responsePayload: any = null;
    let statusCode = 200;

    try {
      this.applyCors(res);
      if (method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const base = cfg.basePath.replace(/\/+$/, '');
      const pathName = url.pathname.replace(/\/+$/, '') || '/';

      if (method === 'GET' && (pathName === `${base}/health` || pathName === '/health')) {
        responsePayload = { status: true, message: 'Analyzer API running', ...this.status() };
        return this.writeJson(res, 200, responsePayload);
      }

      if (method === 'GET' && (pathName.startsWith(`${base}/orders/`) || pathName === `${base}/orders` || pathName === '/testWorkList/getTests')) {
        sampleId = pathName.startsWith(`${base}/orders/`) ? decodeURIComponent(pathName.slice(`${base}/orders/`.length)) : String(url.searchParams.get('sampleId') || url.searchParams.get('sample_id') || url.searchParams.get('sampleNo') || '').trim();
        equipmentId = Number(url.searchParams.get('equipmentId') || url.searchParams.get('equipment_id') || url.searchParams.get('machineId') || url.searchParams.get('machine_id') || 0);
        responsePayload = this.db.getAnalyzerOrder(sampleId, equipmentId);
        statusCode = responsePayload.status ? 200 : (responsePayload.message || '').includes('required') ? 400 : 404;
        return this.writeJson(res, statusCode, responsePayload);
      }

      if (method === 'POST' && (pathName === `${base}/results` || pathName === '/testWorkList/addvalues')) {
        body = await this.readBody(req);
        if (Array.isArray(body)) body = { results: body, equipmentId: url.searchParams.get('equipmentId') || url.searchParams.get('equipment_id'), sampleId: url.searchParams.get('sampleId') || url.searchParams.get('sample_id') };
        body = { ...(body || {}) };
        if (!body.equipmentId && !body.equipment_id) body.equipmentId = url.searchParams.get('equipmentId') || url.searchParams.get('equipment_id') || url.searchParams.get('machineId') || url.searchParams.get('machine_id');
        if (!body.sampleId && !body.sample_id) body.sampleId = url.searchParams.get('sampleId') || url.searchParams.get('sample_id') || url.searchParams.get('sampleNo') || url.searchParams.get('sample_no');
        equipmentId = Number(body.equipmentId || body.equipment_id || 0);
        sampleId = String(body.sampleId || body.sample_id || body.sampleNo || body.sample_no || '').trim();
        responsePayload = this.db.saveAnalyzerResults(body);
        statusCode = responsePayload.status ? 200 : 400;
        return this.writeJson(res, statusCode, responsePayload);
      }

      responsePayload = { status: false, message: `Route not found: ${method} ${pathName}`, publicUrl: cfg.publicUrl, orderExample: `${cfg.publicUrl}/orders/{sampleId}?equipmentId=1`, resultExample: `${cfg.publicUrl}/results` };
      statusCode = 404;
      return this.writeJson(res, statusCode, responsePayload);
    } catch (err: any) {
      statusCode = 500;
      responsePayload = { status: false, message: err?.message || 'Analyzer API failed' };
      return this.writeJson(res, statusCode, responsePayload);
    } finally {
      try {
        const logEquipmentId = equipmentId || Number(url.searchParams.get('equipmentId') || url.searchParams.get('equipment_id') || 0) || Number(responsePayload?.equipmentId || 0);
        this.writeDailyLog(cfg, method, logEquipmentId, {
          at: startedAt,
          statusCode,
          method,
          path: url.pathname,
          query: Object.fromEntries(url.searchParams.entries()),
          request: method === 'POST' ? body : null,
          response: responsePayload
        });
      } catch (err: any) {
        console.error('[analyzer-api-log]', err?.message || err);
      }
    }
  }

  private applyCors(res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  private readBody(req: IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8').trim();
        if (!text) return resolve({});
        try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid JSON body.')); }
      });
      req.on('error', reject);
    });
  }

  private writeJson(res: ServerResponse, statusCode: number, payload: any) {
    this.applyCors(res);
    const text = JSON.stringify(payload || {}, null, 2);
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(text);
  }

  private safePart(value: any, fallback: string) {
    const text = String(value || '').trim().replace(/[^a-zA-Z0-9._-]/g, '_');
    return text || fallback;
  }

  private writeDailyLog(cfg: ApiConfig, method: string, equipmentId: number, row: any) {
    const eq = equipmentId ? this.db.analyzerEquipmentSummary(equipmentId) : null;
    const code = this.safePart(eq?.equipment_code || equipmentId || 'UNKNOWN', 'UNKNOWN');
    const date = String(row?.at || this.db.currentIstTimestamp()).slice(0, 10);
    const dir = path.join(cfg.logPath, `equipment-${equipmentId || 'unknown'}-${code}`);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${date}-${method}.log`);
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  }
}
