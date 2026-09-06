import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
const PdfPrinter = require('pdfmake');
type ReportAlignment = 'left' | 'center' | 'right';
import { app, BrowserWindow, shell } from 'electron';
import { DatabaseService } from './database.service';
const REGISTERED_REPORT_FONTS: Record<string, any> = {
  Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Bold.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-BoldItalic.ttf' },
  Inter: { normal: 'Inter-Regular.ttf', bold: 'Inter-Bold.ttf', italics: 'Inter-Italic.ttf', bolditalics: 'Inter-BoldItalic.ttf' },
  Lato: { normal: 'Lato-Regular.ttf', bold: 'Lato-Bold.ttf', italics: 'Lato-Italic.ttf', bolditalics: 'Lato-BoldItalic.ttf' },
  NotoSans: { normal: 'NotoSans-Regular.ttf', bold: 'NotoSans-Bold.ttf', italics: 'NotoSans-Italic.ttf', bolditalics: 'NotoSans-BoldItalic.ttf' },
  NotoSerif: { normal: 'NotoSerif-Regular.ttf', bold: 'NotoSerif-Bold.ttf', italics: 'NotoSerif-Italic.ttf', bolditalics: 'NotoSerif-BoldItalic.ttf' },
  NotoSansTamil: { normal: 'NotoSansTamil-Regular.ttf', bold: 'NotoSansTamil-Bold.ttf', italics: 'NotoSansTamil-Regular.ttf', bolditalics: 'NotoSansTamil-Bold.ttf' },
  NotoSansDevanagari: { normal: 'NotoSansDevanagari-Regular.ttf', bold: 'NotoSansDevanagari-Bold.ttf', italics: 'NotoSansDevanagari-Regular.ttf', bolditalics: 'NotoSansDevanagari-Bold.ttf' },
  NotoSansMalayalam: { normal: 'NotoSansMalayalam-Regular.ttf', bold: 'NotoSansMalayalam-Bold.ttf', italics: 'NotoSansMalayalam-Regular.ttf', bolditalics: 'NotoSansMalayalam-Bold.ttf' },
  NotoSansKannada: { normal: 'NotoSansKannada-Regular.ttf', bold: 'NotoSansKannada-Bold.ttf', italics: 'NotoSansKannada-Regular.ttf', bolditalics: 'NotoSansKannada-Bold.ttf' },
  NotoSansTelugu: { normal: 'NotoSansTelugu-Regular.ttf', bold: 'NotoSansTelugu-Bold.ttf', italics: 'NotoSansTelugu-Regular.ttf', bolditalics: 'NotoSansTelugu-Bold.ttf' },
  NotoSansBengali: { normal: 'NotoSansBengali-Regular.ttf', bold: 'NotoSansBengali-Bold.ttf', italics: 'NotoSansBengali-Regular.ttf', bolditalics: 'NotoSansBengali-Bold.ttf' },
  NotoSansSymbols: { normal: 'NotoSansSymbols-Regular.ttf', bold: 'NotoSansSymbols-Regular.ttf', italics: 'NotoSansSymbols-Regular.ttf', bolditalics: 'NotoSansSymbols-Regular.ttf' },
  NotoSansSymbols2: { normal: 'NotoSansSymbols2-Regular.ttf', bold: 'NotoSansSymbols2-Regular.ttf', italics: 'NotoSansSymbols2-Regular.ttf', bolditalics: 'NotoSansSymbols2-Regular.ttf' },
  Poppins: { normal: 'Poppins-Regular.ttf', bold: 'Poppins-Bold.ttf', italics: 'Poppins-Italic.ttf', bolditalics: 'Poppins-BoldItalic.ttf' },
  Montserrat: { normal: 'Montserrat-Regular.ttf', bold: 'Montserrat-Bold.ttf', italics: 'Montserrat-Italic.ttf', bolditalics: 'Montserrat-BoldItalic.ttf' },
  OpenSans: { normal: 'OpenSans-Regular.ttf', bold: 'OpenSans-Bold.ttf', italics: 'OpenSans-Italic.ttf', bolditalics: 'OpenSans-BoldItalic.ttf' },
  NunitoSans: { normal: 'NunitoSans-Regular.ttf', bold: 'NunitoSans-Bold.ttf', italics: 'NunitoSans-Italic.ttf', bolditalics: 'NunitoSans-BoldItalic.ttf' },
  SourceSans3: { normal: 'SourceSans3-Regular.ttf', bold: 'SourceSans3-Bold.ttf', italics: 'SourceSans3-Italic.ttf', bolditalics: 'SourceSans3-BoldItalic.ttf' },
  Merriweather: { normal: 'Merriweather-Regular.ttf', bold: 'Merriweather-Bold.ttf', italics: 'Merriweather-Italic.ttf', bolditalics: 'Merriweather-BoldItalic.ttf' },
  LibreBaskerville: { normal: 'LibreBaskerville-Regular.ttf', bold: 'LibreBaskerville-Bold.ttf', italics: 'LibreBaskerville-Italic.ttf', bolditalics: 'LibreBaskerville-Regular.ttf' },
  Lora: { normal: 'Lora-Regular.ttf', bold: 'Lora-Bold.ttf', italics: 'Lora-Italic.ttf', bolditalics: 'Lora-BoldItalic.ttf' }
};

export class ReportCoreService {
  protected availableReportFonts = new Set<string>(['Roboto']);
  protected defaultReportFont = 'Roboto';
  protected pdfPrinter: any = null;
  protected pdfPrinterFonts: Record<string, any> = {};

  constructor(protected db: DatabaseService) {
    this.registerBundledReportFonts();
    this.ensureUploadedReportDefaultSettings();
  }

  protected registerBundledReportFonts() {
    const fontDirs = [
      // Installed/packaged Electron application: fonts are copied by
      // electron-builder to <resources>/fonts.
      app.isPackaged ? path.join(process.resourcesPath, 'fonts') : '',

      // Development build output (dist-electron/assets/fonts).
      path.join(__dirname, '..', 'assets', 'fonts'),

      // Source tree fallback used by npm run dev.
      path.join(__dirname, '..', '..', 'electron-main', 'assets', 'fonts')
    ].filter(Boolean);
    const activeFonts: Record<string, any> = {};
    for (const [fontName, def] of Object.entries(REGISTERED_REPORT_FONTS)) {
      const activeDef = this.makeAvailableFontDefinition(def, fontDirs);
      if (activeDef) activeFonts[fontName] = activeDef;
    }
    this.defaultReportFont = activeFonts.Roboto ? 'Roboto' : (Object.keys(activeFonts)[0] || 'Roboto');
    this.availableReportFonts = new Set(Object.keys(activeFonts));
    this.pdfPrinterFonts = activeFonts;
    this.pdfPrinter = Object.keys(activeFonts).length ? new PdfPrinter(activeFonts) : null;
  }

  protected makeAvailableFontDefinition(def: any, fontDirs: string[]): any | null {
    const normal = this.resolveReportFontFile(String(def?.normal || ''), fontDirs);
    if (!normal) return null;
    const bold = this.resolveReportFontFile(String(def?.bold || ''), fontDirs) || normal;
    const italics = this.resolveReportFontFile(String(def?.italics || ''), fontDirs) || normal;
    const bolditalics = this.resolveReportFontFile(String(def?.bolditalics || ''), fontDirs) || bold || normal;
    return { normal, bold, italics, bolditalics };
  }

  protected resolveReportFontFile(fileName: string, fontDirs: string[]): string {
    if (!fileName) return '';
    for (const dir of fontDirs) {
      const filePath = path.join(dir, fileName);
      try {
        if (fs.existsSync(filePath)) return filePath;
      } catch { /* ignore missing/unreadable font */ }
    }
    return '';
  }

  protected async writePdfFile(doc: any, file: string): Promise<void> {
    if (!this.pdfPrinter) this.registerBundledReportFonts();
    if (!this.pdfPrinter || !Object.keys(this.pdfPrinterFonts || {}).length) {
      throw new Error('The bundled report fonts could not be loaded. Please reinstall LIMS.');
    }
    const existingDefault = doc?.defaultStyle || {};
    const safeFont = this.reportFont(existingDefault.font || this.defaultReportFont || 'Roboto');
    let docForPdf: any = {
      ...doc,
      // Never reuse a pdfmake images dictionary — leftover $$pdfmake$$N keys resolve as
      // relative files under the install folder (e.g. Program Files\LIMS Professional).
      images: undefined,
      defaultStyle: { ...existingDefault, font: safeFont }
    };

    // "Continued on next page…" is possible only when it still fits under the table.
    // If pdfmake pushes it alone onto the next page, drop that notice (never show an empty continue page).
    // Never JSON.stringify the doc — page-break tables / layout callbacks can be circular and crash IPC.
    if (this.contentHasContinuedNotice(docForPdf.content)) {
      docForPdf = await this.pruneOrphanContinuedNotices(docForPdf);
    }

    // Final safety: drop any internal pdfmake image ids left on nodes (from a prior probe).
    this.sanitizePdfImageNodes(docForPdf.content);
    docForPdf.images = undefined;

    await new Promise<void>((resolve, reject) => {
      const pdfDoc = this.pdfPrinter.createPdfKitDocument(docForPdf);
      const stream = fs.createWriteStream(file);
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      pdfDoc.on('error', reject);
      pdfDoc.pipe(stream);
      pdfDoc.end();
    });
  }

  /**
   * pdfmake rewrites image nodes to $$pdfmake$$N during layout. If those ids leak into
   * a second createPdfKitDocument pass, Node tries to open them as files under cwd
   * (Program Files when installed) → ENOENT Invalid image.
   */
  protected sanitizePdfImageNodes(nodes: any, seen?: Set<any>): void {
    if (!nodes || typeof nodes !== 'object') return;
    const visited = seen || new Set<any>();
    if (visited.has(nodes)) return;
    visited.add(nodes);
    if (Array.isArray(nodes)) {
      nodes.forEach((n: any) => this.sanitizePdfImageNodes(n, visited));
      return;
    }
    const img = nodes.image;
    if (typeof img === 'string') {
      const raw = img.trim();
      const ok = /^data:image\//i.test(raw)
        || (path.isAbsolute(raw) && (() => { try { return fs.existsSync(raw); } catch { return false; } })());
      if (!ok || /^\$\$pdfmake\$\$/i.test(raw)) {
        delete nodes.image;
        if (nodes.text == null) nodes.text = '';
      }
    }
    if (nodes.stack) this.sanitizePdfImageNodes(nodes.stack, visited);
    if (nodes.columns) this.sanitizePdfImageNodes(nodes.columns, visited);
    if (nodes.table?.body) this.sanitizePdfImageNodes(nodes.table.body, visited);
  }

  /** Safe walk — avoids JSON.stringify circular crashes on page-break PDFs. */
  protected contentHasContinuedNotice(nodes: any, seen?: Set<any>): boolean {
    if (!nodes || typeof nodes !== 'object') return false;
    const visited = seen || new Set<any>();
    if (visited.has(nodes)) return false;
    visited.add(nodes);
    if (Array.isArray(nodes)) {
      return nodes.some((n: any) => this.contentHasContinuedNotice(n, visited));
    }
    if (String(nodes.id || '').startsWith('lims-continued-')) return true;
    if (nodes.stack && this.contentHasContinuedNotice(nodes.stack, visited)) return true;
    if (nodes.columns && this.contentHasContinuedNotice(nodes.columns, visited)) return true;
    if (nodes.table?.body && this.contentHasContinuedNotice(nodes.table.body, visited)) return true;
    return false;
  }

  /** Deep-clone PDF content nodes so pdfmake layout cannot attach circular parent refs onto the live doc. */
  protected clonePdfContentNodes(nodes: any, seen?: WeakMap<object, any>): any {
    if (nodes == null || typeof nodes !== 'object') return nodes;
    if (typeof nodes === 'function') return undefined;
    const map = seen || new WeakMap<object, any>();
    if (map.has(nodes)) return map.get(nodes);
    if (Array.isArray(nodes)) {
      const arr: any[] = [];
      map.set(nodes, arr);
      for (const item of nodes) arr.push(this.clonePdfContentNodes(item, map));
      return arr;
    }
    const out: any = {};
    map.set(nodes, out);
    for (const key of Object.keys(nodes)) {
      const value = (nodes as any)[key];
      if (typeof value === 'function') continue;
      out[key] = this.clonePdfContentNodes(value, map);
    }
    return out;
  }

  /** Layout probe: remove continued notices that landed alone on a page. */
  protected async pruneOrphanContinuedNotices(doc: any): Promise<any> {
    const orphanIds = new Set<string>();
    const probePath = `${os.tmpdir()}${path.sep}lims-continued-probe-${Date.now()}.pdf`;
    const isRealBodyNode = (n: any) => {
      if (!n) return false;
      if (String(n.id || '').startsWith('lims-continued-')) return false;
      if (n.table) return true;
      if (n.image || n.canvas || n.svg || n.columns || n.ul || n.ol) return true;
      if (n.stack === true) return true;
      const text = String(n.text || '').trim();
      return !!text;
    };
    const previousNodesFromArgs = (followingOrHelpers: any, previousNodesOnPage: any): any[] => {
      // pdfmake 0.2+: pageBreakBefore(nodeInfo, { getPreviousNodesOnPage, ... })
      if (followingOrHelpers && typeof followingOrHelpers.getPreviousNodesOnPage === 'function') {
        try { return followingOrHelpers.getPreviousNodesOnPage() || []; } catch { return []; }
      }
      // Older pdfmake: pageBreakBefore(node, following, next, previous)
      if (Array.isArray(previousNodesOnPage)) return previousNodesOnPage;
      return [];
    };
    // Fully isolate the probe doc. pdfmake rewrites image: dataURL → $$pdfmake$$N
    // and must never touch the live content used for the real PDF write.
    const probeDoc = {
      ...doc,
      images: {},
      content: this.clonePdfContentNodes(doc.content),
      pageBreakBefore: (nodeInfo: any, followingOrHelpers?: any, _nodesOnNextPage?: any, previousNodesOnPage?: any) => {
        const id = String(nodeInfo?.id || '');
        if (!id.startsWith('lims-continued-')) return false;
        const previous = previousNodesFromArgs(followingOrHelpers, previousNodesOnPage);
        const hasPriorContent = previous.some(isRealBodyNode);
        // After layout, orphan continued text sits alone near the top of a new page.
        const ratio = Number(nodeInfo?.startPosition?.verticalRatio);
        const nearTop = Number.isFinite(ratio) && ratio < 0.1;
        if (!hasPriorContent || (nearTop && !previous.some((n: any) => !!n?.table))) {
          orphanIds.add(id);
        }
        return false;
      }
    };
    try {
      await new Promise<void>((resolve, reject) => {
        const pdfDoc = this.pdfPrinter.createPdfKitDocument(probeDoc);
        const stream = fs.createWriteStream(probePath);
        stream.on('finish', () => resolve());
        stream.on('error', reject);
        pdfDoc.on('error', reject);
        pdfDoc.pipe(stream);
        pdfDoc.end();
      });
    } catch {
      return doc;
    } finally {
      try { fs.unlinkSync(probePath); } catch { /* ignore */ }
    }
    if (!orphanIds.size) return doc;
    return {
      ...doc,
      images: undefined,
      content: this.stripNodesByIds(doc.content, orphanIds)
    };
  }

  protected stripNodesByIds(nodes: any, orphanIds: Set<string>): any {
    if (!Array.isArray(nodes)) return nodes;
    return nodes
      .filter((node: any) => !orphanIds.has(String(node?.id || '')))
      .map((node: any) => {
        if (!node || typeof node !== 'object') return node;
        const next = { ...node };
        if (Array.isArray(next.stack)) next.stack = this.stripNodesByIds(next.stack, orphanIds);
        if (Array.isArray(next.columns)) next.columns = this.stripNodesByIds(next.columns, orphanIds);
        return next;
      });
  }

  /**
   * Creates the final background-print PDF by rasterising each pdfMake page,
   * drawing the existing letterhead image first, and then painting the report
   * page with the canvas Multiply composite operation.
   *
   * This is intentionally used only by the report "with background" path.
   * The regular pdfMake PDF remains vector/searchable and unchanged.
   */
  protected async writePdfFileWithFlattenedMultiplyBackground(
    doc: any,
    file: string,
    backgroundImagePath: string,
    options: { fit?: string; opacity?: number; offsetXPt?: number; offsetYPt?: number; dpi?: number; onProgress?: (progress:any) => void } = {}
  ): Promise<void> {
    const { PDFDocument } = require('pdf-lib');
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : (_progress:any) => {};
    const { createCanvas, loadImage } = require('@napi-rs/canvas');
    const tempContentFile = `${file}.content-${Date.now()}.pdf`;

    try {
      // pdfMake still owns every part of the report layout. We only remove the
      // letterhead image from this intermediate document before compositing.
      onProgress({ stage:'preparing', stageLabel:'Preparing report', title:'Preparing your report', message:'Building the report layout...', current:0, total:0, progress:8, statusText:'Preparing' });
      await this.writePdfFile({ ...doc, background: undefined }, tempContentFile);

      // Load pdf.js at runtime so the CommonJS Electron TypeScript build does
      // not try to statically resolve the package's ESM-only .mjs entry.
      const importEsm = new Function(
        'specifier',
        'return import(specifier)'
      ) as (specifier: string) => Promise<any>;
      const pdfjs: any = await importEsm('pdfjs-dist/legacy/build/pdf.mjs');
      const sourceBytes = new Uint8Array(fs.readFileSync(tempContentFile));
      const loadingTask = pdfjs.getDocument({
        data: sourceBytes,
        disableWorker: true,
        useSystemFonts: true,
        isEvalSupported: false
      });
      const sourcePdf = await loadingTask.promise;
      onProgress({ stage:'rendering', stageLabel:'Rendering pages', title:'Creating high-quality pages', message:`Preparing ${sourcePdf.numPages} report page${sourcePdf.numPages === 1 ? '' : 's'}...`, current:0, total:sourcePdf.numPages, progress:15, statusText:'Rendering' });
      const outputPdf = await PDFDocument.create();
      const backgroundImage = await loadImage(backgroundImagePath);

      const dpi = Math.max(150, Math.min(600, Number(options.dpi || 300)));
      const renderScale = dpi / 72;
      const fit = String(options.fit || 'cover').toLowerCase();
      const opacity = Math.max(0.01, Math.min(1, Number(options.opacity ?? 1)));
      const offsetXPt = Number(options.offsetXPt || 0);
      const offsetYPt = Number(options.offsetYPt || 0);

      for (let pageNumber = 1; pageNumber <= sourcePdf.numPages; pageNumber++) {
        onProgress({ stage:'rendering', stageLabel:'Rendering pages', title:'Creating high-quality pages', message:`Rendering page ${pageNumber} of ${sourcePdf.numPages}...`, current:pageNumber, total:sourcePdf.numPages, progress:15 + Math.round((pageNumber / sourcePdf.numPages) * 30), statusText:'Rendering' });
        const sourcePage = await sourcePdf.getPage(pageNumber);
        const pointViewport = sourcePage.getViewport({ scale: 1 });
        const renderViewport = sourcePage.getViewport({ scale: renderScale });
        const widthPx = Math.max(1, Math.ceil(renderViewport.width));
        const heightPx = Math.max(1, Math.ceil(renderViewport.height));

        const reportCanvas:any = createCanvas(widthPx, heightPx);
        const reportContext:any = reportCanvas.getContext('2d');
        reportContext.fillStyle = '#ffffff';
        reportContext.fillRect(0, 0, widthPx, heightPx);

        await sourcePage.render({
          canvasContext: reportContext,
          viewport: renderViewport,
          canvas: reportCanvas
        }).promise;

        const mergedCanvas:any = createCanvas(widthPx, heightPx);
        const mergedContext:any = mergedCanvas.getContext('2d');
        mergedContext.fillStyle = '#ffffff';
        mergedContext.fillRect(0, 0, widthPx, heightPx);

        const imageWidth = Number(backgroundImage.width || 1);
        const imageHeight = Number(backgroundImage.height || 1);
        let drawWidth = widthPx;
        let drawHeight = heightPx;
        if (fit !== 'stretch') {
          const scale = fit === 'contain'
            ? Math.min(widthPx / imageWidth, heightPx / imageHeight)
            : Math.max(widthPx / imageWidth, heightPx / imageHeight);
          drawWidth = imageWidth * scale;
          drawHeight = imageHeight * scale;
        }

        const offsetXPx = offsetXPt * renderScale;
        const offsetYPx = offsetYPt * renderScale;
        mergedContext.save();
        mergedContext.globalAlpha = opacity;
        mergedContext.drawImage(
          backgroundImage,
          (widthPx - drawWidth) / 2 + offsetXPx,
          (heightPx - drawHeight) / 2 + offsetYPx,
          drawWidth,
          drawHeight
        );
        mergedContext.restore();

        onProgress({ stage:'blending', stageLabel:'Blending background', title:'Blending report pages', message:`Applying Multiply blend to page ${pageNumber} of ${sourcePdf.numPages}...`, current:pageNumber, total:sourcePdf.numPages, progress:45 + Math.round((pageNumber / sourcePdf.numPages) * 35), statusText:'Merging' });

        // This is the actual blend requested by the user. White report areas
        // disappear into the letterhead while dark text and borders remain.
        mergedContext.save();
        mergedContext.globalCompositeOperation = 'multiply';
        mergedContext.drawImage(reportCanvas, 0, 0, widthPx, heightPx);
        mergedContext.restore();

        // JPEG at 96% keeps print quality high while avoiding extremely large
        // multi-page PNG-based PDFs. The page itself is already flattened.
        const mergedJpeg = await mergedCanvas.encode('jpeg', 96);
        const embeddedImage = await outputPdf.embedJpg(mergedJpeg);
        const outputPage = outputPdf.addPage([pointViewport.width, pointViewport.height]);
        outputPage.drawImage(embeddedImage, {
          x: 0,
          y: 0,
          width: pointViewport.width,
          height: pointViewport.height
        });

        sourcePage.cleanup();
      }

      onProgress({ stage:'building', stageLabel:'Finalizing PDF', title:'Finalizing your report', message:'Building the final print-ready PDF...', current:sourcePdf.numPages, total:sourcePdf.numPages, progress:92, statusText:'Finalizing' });
      await sourcePdf.destroy();
      fs.writeFileSync(file, await outputPdf.save({ useObjectStreams: true }));
    } finally {
      try { if (fs.existsSync(tempContentFile)) fs.unlinkSync(tempContentFile); } catch { /* ignore cleanup failure */ }
    }
  }

  protected org() { const s=this.db.getSettings(); return { name:s['org.name']||'', address:s['org.address']||'', phone:s['org.phone']||'', email:s['org.email']||'', footer:s['report.footer']||'Disclaimer: As with any diagnostic test, results should be clinically correlated. Results may vary between laboratories and methods.', background:s['report.background']==='on' }; }

  protected ensureUploadedReportDefaultSettings() {
    const seedKey = 'report.simple.uploadedServiceDefaults.v12';
    try {
      if (this.db.getSetting(seedKey, '') === 'DONE') {
        this.ensurePatientHrLinesUseSettings();
        return;
      }
      const defaults: Record<string, string> = {
        'report.simple.pageSize': 'A4',
        'report.simple.orientation': 'portrait',
        'report.simple.marginLeftMm': '8.8',
        'report.simple.marginTopMm': '15',
        'report.simple.marginRightMm': '5.3',
        'report.simple.marginBottomMm': '2',
        'report.simple.headerFixedHeightMm': '45',
        'report.simple.footerFixedHeightMm': '18.8',
        'report.simple.headerMarginTopMm': '0',
        'report.simple.backgroundEnabled': 'false',
        'report.simple.backgroundColorEnabled': 'false',
        'report.simple.backgroundImageArea': 'full_page',
        'report.simple.backgroundImageBlendPreset': 'normal',
        'report.simple.backgroundImageFit': 'cover',
        'report.simple.backgroundImageOpacity': '1',
        'report.simple.backgroundImageWatermarkWidthPct': '62',
        'report.simple.backgroundImageOffsetXMm': '0',
        'report.simple.backgroundImageOffsetYMm': '0',
        'report.simple.watermarkTextEnabled': 'false',
        'report.simple.institutionName': '',
        'report.simple.institutionSubText': '',
        'report.simple.addressText': '96 C/1, Subramaniyar Kovil Street, (AJ Nagar)\n Adiramapattinam - 614 701',
        'report.simple.addressPlacement': 'header',
        'report.simple.headerLogoEnabled': 'false',
        'report.simple.headerLogoPath': '',
        'report.simple.headerLogoPlacement': 'center',
        'report.simple.headerLogoWidthMm': '70',
        'report.simple.headerLogoHeightMm': '53',
        'report.simple.headerShowBottomRule': 'true',
        'report.simple.headerRuleColor': '#222222',
        'report.simple.patientBottomRule': 'true',
        'report.simple.patientRuleColor': '#222222',
        'report.simple.hrLinesConfig': 'before-patient|0|0.7|#222222|2.1|0|100\nafter-patient|0|0.7|#222222|0|0|100',
        'report.simple.patientDetailsEnabled': 'true',
        'report.simple.patientDetailsPlacement': 'header',
        'report.simple.patientDetailsFields': 'patient_name,age,gender,consultant,collected,reported,mrn,specimen',
        'report.simple.patientDetailsShowLabels': 'true',
        'report.simple.patientDetailsColumns': '2',
        'report.simple.patientDetailsBorderEnabled': 'false',
        'report.simple.patientDetailsMarginTopMm': '0',
        'report.simple.patientDetailsMarginBottomMm': '4',
        'report.simple.patientDetailsColonText': ':',
        'report.simple.patientDetailsValueCase': 'as_entered',
        'report.simple.patientDetailsLabelsJson': '{"patient_name":"Patient Name","age_gender":"Age / Gender","consultant":"Referred By"}',
        'report.simple.patientDetailsOutsideBorder': 'false',
        'report.simple.patientDetailsTopBorder': 'true',
        'report.simple.patientDetailsBottomBorder': 'true',
        'report.simple.patientDetailsLeftBorder': 'true',
        'report.simple.patientDetailsRightBorder': 'true',
        'report.simple.patientDetailsInnerBorder': 'false',
        'report.simple.patientDetailsInnerHBorder': 'false',
        'report.simple.patientDetailsInnerVBorder': 'false',
        'report.simple.patientDetailsBorderColor': '#cccccc',
        'report.simple.patientDetailsBorderWidth': '0.4',
        'report.simple.patientDetailsBgColor': '#ffffff',
        'report.simple.patientDetailsLabelWidthMm': '26',
        'report.simple.patientDetailsRightLabelWidthMm': '26',
        'report.simple.patientDetailsRightColumnOffsetMm': '0',
        'report.simple.patientDetailsColumnGapMm': '5',
        'report.simple.patientDetailsSecondColumnMode': 'manual',
        'report.simple.patientDetailsSecondColumnWidthMm': '72',
        'report.simple.patientDetailsSecondColumnRightPaddingMm': '0',
        'report.simple.patientFirstLabelWidthPct': '16',
        'report.simple.patientFirstValueWidthPct': '28',
        'report.simple.patientColumnGapWidthPct': '14',
        'report.simple.patientSecondLabelWidthPct': '18',
        'report.simple.patientSecondValueWidthPct': '24',
        'report.simple.patientTableInnerPaddingTopMm': '0',
        'report.simple.patientTableInnerPaddingRightMm': '0',
        'report.simple.patientTableInnerPaddingBottomMm': '0',
        'report.simple.patientTableInnerPaddingLeftMm': '0',
        'report.simple.patientBarcodeEnabled': 'false',
        'report.simple.patientBarcodeSource': 'patient_no',
        'report.simple.patientBarcodeXMm': '150',
        'report.simple.patientBarcodeYMm': '42',
        'report.simple.patientBarcodeWidthMm': '42',
        'report.simple.patientBarcodeHeightMm': '10',
        'report.simple.patientBarcodeTextEnabled': 'true',
        'report.simple.reportTitleEnabled': 'true',
        'report.simple.reportTitleText': 'LABORATORY REPORT',
        'report.simple.reportSubtitleText': 'Analyzed on Horiba Yumizen CA 40 [Semi Automated Biochemistry Analyzer]',
        'report.simple.reportTitleMarginBottomMm': '0.7',
        'report.simple.reportSubtitleMarginBottomMm': '1.4',
        'report.simple.mainBodyMarginTopMm': '0',
        'report.simple.mainBodyMarginBottomMm': '0',
        'report.simple.tableMarginTopMm': '2',
        'report.simple.tableMarginBottomMm': '0',
        'report.simple.tableMarginLeftMm': '0',
        'report.simple.tableMarginRightMm': '0',
        'report.simple.showSpecimenInTestName': 'true',
        'report.simple.specimenVisible': 'true',
        'report.simple.specimenPlacement': 'under-test',
        'report.simple.specimenPrefix': '',
        'report.simple.collectionVisible': 'false',
        'report.simple.showMethodInReference': 'true',
        'report.simple.referenceVisible': 'true',
        'report.simple.methodVisible': 'true',
        'report.simple.referencePlacement': 'right-column',
        'report.simple.methodPlacement': 'under-reference',
        'report.simple.methodPrefix': '',
        'report.simple.showSampleIdInTestName': 'false',
        'report.simple.colTestLabel': 'TEST NAME / SPECIMEN',
        'report.simple.colResultLabel': 'RESULT',
        'report.simple.colUnitLabel': 'UNIT',
        'report.simple.colReferenceLabel': 'REFERENCE RANGE / METHOD',
        'report.simple.tableArrowWidth': '20',
        'report.simple.tableArrowWidthMm': '7.1',
        'report.simple.tableSafetyMm': '0',
        'report.simple.tableParamPct': '34',
        'report.simple.tableAnalysedPct': '13',
        'report.simple.tableUnitPct': '10',
        'report.simple.tableRangePct': '43',
        'report.simple.tableColumnArrangement': 'test_specimen,result_flag,unit,reference_method',
        'report.simple.tableFlagsEnabled': 'true',
        'report.simple.tableShowFlagColumn': 'false',
        'report.simple.tableFlagMode': 'critical_flag_abnormal',
        'report.simple.highFlagText': 'H',
        'report.simple.lowFlagText': 'L',
        'report.simple.criticalHighFlagText': 'CH',
        'report.simple.criticalLowFlagText': 'CL',
        'report.simple.referenceSource': 'saved',
        'report.simple.tableTestSpecimenLabel': 'Test / Specimen',
        'report.simple.tableTestLabel': 'Test',
        'report.simple.tableSpecimenLabel': 'Specimen',
        'report.simple.tableResultFlagLabel': 'Result + Flag',
        'report.simple.tableResultLabel': 'Result',
        'report.simple.tableFlagLabel': 'Flag',
        'report.simple.tableUnitLabel': 'Unit',
        'report.simple.tableReferenceMethodLabel': 'Reference / Method',
        'report.simple.tableReferenceLabel': 'Reference',
        'report.simple.tableMethodLabel': 'Method',
        'report.simple.tableTestSpecimenPct': '34',
        'report.simple.tableTestPct': '28',
        'report.simple.tableSpecimenPct': '10',
        'report.simple.tableResultFlagPct': '13',
        'report.simple.tableResultPct': '13',
        'report.simple.tableFlagPct': '5',
        'report.simple.tableUnitWidthPct': '10',
        'report.simple.tableReferenceMethodPct': '43',
        'report.simple.tableReferencePct': '35',
        'report.simple.tableMethodPct': '8',
        'report.simple.tableTestSpecimenHeaderAlign': 'left',
        'report.simple.tableTestHeaderAlign': 'left',
        'report.simple.tableSpecimenHeaderAlign': 'left',
        'report.simple.tableResultFlagHeaderAlign': 'center',
        'report.simple.tableResultHeaderAlign': 'center',
        'report.simple.tableFlagHeaderAlign': 'center',
        'report.simple.tableUnitHeaderAlign': 'center',
        'report.simple.tableReferenceMethodHeaderAlign': 'right',
        'report.simple.tableReferenceHeaderAlign': 'right',
        'report.simple.tableMethodHeaderAlign': 'right',
        'report.simple.tableTestSpecimenBodyAlign': 'left',
        'report.simple.tableTestBodyAlign': 'left',
        'report.simple.tableSpecimenBodyAlign': 'left',
        'report.simple.tableResultFlagBodyAlign': 'center',
        'report.simple.tableResultBodyAlign': 'center',
        'report.simple.tableFlagBodyAlign': 'center',
        'report.simple.tableUnitBodyAlign': 'center',
        'report.simple.tableReferenceMethodBodyAlign': 'right',
        'report.simple.tableReferenceBodyAlign': 'right',
        'report.simple.tableMethodBodyAlign': 'right',
        'report.simple.tableTestSpecimenBodyVerticalCenter': 'false',
        'report.simple.tableTestBodyVerticalCenter': 'false',
        'report.simple.tableSpecimenBodyVerticalCenter': 'false',
        'report.simple.tableResultFlagBodyVerticalCenter': 'true',
        'report.simple.tableResultBodyVerticalCenter': 'true',
        'report.simple.tableFlagBodyVerticalCenter': 'true',
        'report.simple.tableUnitBodyVerticalCenter': 'true',
        'report.simple.tableReferenceMethodBodyVerticalCenter': 'false',
        'report.simple.tableReferenceBodyVerticalCenter': 'false',
        'report.simple.tableMethodBodyVerticalCenter': 'false',
        'report.simple.tablePaddingLeft': '6',
        'report.simple.tablePaddingRight': '6',
        'report.simple.tablePaddingTop': '4',
        'report.simple.tablePaddingBottom': '4',
        'report.simple.tablePaddingLeftMm': '2.1',
        'report.simple.tablePaddingRightMm': '2.1',
        'report.simple.tablePaddingTopMm': '1.4',
        'report.simple.tablePaddingBottomMm': '1.4',
        'report.simple.tableLineWidth': '0.3',
        'report.simple.tableOutsideBorder': 'true',
        'report.simple.tableTopBorder': 'true',
        'report.simple.tableBottomBorder': 'true',
        'report.simple.tableLeftBorder': 'true',
        'report.simple.tableRightBorder': 'true',
        'report.simple.tableInnerBorder': 'true',
        'report.simple.tableInnerHBorder': 'true',
        'report.simple.tableInnerVBorder': 'true',
        'report.simple.tableBorderWidth': '0.3',
        'report.simple.tableBorderColor': '#cccccc',
        'report.simple.tableHeaderBgColor': '#F7FAFF',
        'report.simple.groupHeaderBgColor': '#E6EEF9',
        'report.simple.sectionHeaderBgColor': '#F3F6FB',
        'report.simple.highColor': '#cc0000',
        'report.simple.lowColor': '#0000cc',
        'report.simple.resultFontSize': '12',
        'report.simple.resultAbnormalFontSize': '13',
        'report.simple.endReportEnabled': 'true',
        'report.simple.endReportText': '-------------------------- END OF REPORT --------------------------',
        'report.simple.endReportMarginTopMm': '7',
        'report.simple.endReportMarginBottomMm': '7',
        'report.simple.footerText': 'Disclaimer: As with any diagnostic test, results should be clinically correlated. Results may vary between laboratories and methods.',
        'report.simple.disclaimerPlacement': 'footer',
        'report.simple.disclaimerText': 'Disclaimer: As with any diagnostic test, results should be clinically correlated. Results may vary between laboratories and methods.',
        'report.simple.disclaimerAlignment': 'center',
        'report.simple.disclaimerWidthPct': '100',
        'report.simple.disclaimerOffsetXMm': '0',
        'report.simple.disclaimerOffsetYMm': '0',
        'report.simple.disclaimerMarginTopMm': '0',
        'report.simple.disclaimerMarginBottomMm': '0',
        'report.simple.disclaimerMarginLeftMm': '0',
        'report.simple.disclaimerMarginRightMm': '0',
        'report.simple.disclaimerBgColor': '#ffffff',
        'report.simple.disclaimerLineHeight': '1.05',
        'report.simple.disclaimerCharacterSpacing': '0',
        'report.simple.footerDisclaimerWidthPct': '82',
        'report.simple.footerPageNumberWidthPct': '18',
        'report.simple.footerColumnGapMm': '4',
        'report.simple.footerPageNumberAlignment': 'right',
        'report.simple.footerMarginBottomMm': '2',
        'report.simple.footerMarginLeftMm': '8.8',
        'report.simple.footerMarginRightMm': '5.3',
        'report.simple.pageNumbersEnabled': 'true',
        'report.simple.labSignEnabled': 'true',
        'report.simple.labSignLabel': 'Lab Technician Signature',
        'report.simple.labSignText': '',
        'report.simple.labSignAlignment': 'right',
        'report.simple.labSignRepeatMode': 'last-page-only',
        'report.simple.signatureAdvancedEnabled': 'false',
        'report.simple.signatureRowsJson': '[]',
        'report.simple.signatureRowTopMarginMm': '0',
        'report.simple.signatureRowBottomMarginMm': '2',
        'report.simple.signatureLine1Height': '1.05',
        'report.simple.signatureLine2Height': '1.05',
        'report.simple.signatureLine3Height': '1.05',
        'report.simple.signatureLine4Height': '1.05',
        'report.simple.signatureEmptyLineMode': 'reserve',
        'report.printDefaults.json': JSON.stringify({ withBackground: true, mergeMode: 'MERGE', singleTestPlacement: 'DEPARTMENT', signatures: {} }),
        'report.simple.otherSignEnabled': 'false',
        'report.simple.otherSignLabel': 'Authorized Signature',
        'report.simple.otherSignText': '',
        'report.simple.otherSignAlignment': 'left',
        'report.simple.otherSignMarginTopMm': '0',
        'report.simple.otherSignMarginBottomMm': '2',
        'report.simple.otherSignOffsetXMm': '0',
        'report.simple.otherSignOffsetYMm': '0',
        'report.simple.otherSignImageEnabled': 'false',
        'report.simple.otherSignImagePath': '',
        'report.simple.otherSignImageWidthMm': '28',
        'report.simple.otherSignImageHeightMm': '12',
        'report.simple.otherSignImageOffsetXMm': '0',
        'report.simple.otherSignImageOffsetYMm': '-4',
        'report.simple.defaultFontSize': '10',
        'report.simple.defaultColor': '#111111',
        'report.simple.patientLabelStyle.fontSize': '11',
        'report.simple.patientLabelStyle.bold': 'true',
        'report.simple.patientLabelStyle.italic': 'false',
        'report.simple.patientLabelStyle.color': '#111111',
        'report.simple.patientValueStyle.fontSize': '11',
        'report.simple.patientValueStyle.bold': 'false',
        'report.simple.patientValueStyle.italic': 'false',
        'report.simple.patientValueStyle.color': '#111111',
        'report.simple.patientDetailsShowTimeBilled': 'false',
        'report.simple.patientDetailsShowTimeCollected': 'false',
        'report.simple.patientDetailsShowTimeReported': 'false',
        'report.simple.patientDetailsFieldStylesJson': '{}',
        'report.simple.bodyTextStyle.fontFamily': 'Roboto',
        'report.simple.tableDataStyle.fontFamily': 'Roboto',
        'report.simple.testNameStyle.fontFamily': 'Roboto',
        'report.simple.specimenStyle.fontFamily': 'Roboto',
        'report.simple.referenceStyle.fontFamily': 'Roboto',
        'report.simple.methodStyle.fontFamily': 'Roboto',
        'report.simple.flagStyle.fontFamily': 'NotoSansSymbols',
        'report.simple.flagStyle.fontSize': '11',
        'report.simple.flagStyle.bold': 'true',
        'report.simple.flagStyle.italic': 'false',
        'report.simple.flagStyle.color': '#111111',
        'report.simple.tableHeaderStyle.fontSize': '10',
        'report.simple.tableHeaderStyle.bold': 'true',
        'report.simple.tableHeaderStyle.italic': 'false',
        'report.simple.tableHeaderStyle.color': '#1756AD',
        'report.simple.groupHeaderStyle.fontSize': '11',
        'report.simple.groupHeaderStyle.bold': 'true',
        'report.simple.groupHeaderStyle.italic': 'false',
        'report.simple.groupHeaderStyle.color': '#0F3E82',
        'report.simple.sectionHeaderStyle.fontSize': '10',
        'report.simple.sectionHeaderStyle.bold': 'true',
        'report.simple.sectionHeaderStyle.italic': 'false',
        'report.simple.sectionHeaderStyle.color': '#244C87',
        'report.simple.testNameStyle.fontSize': '11',
        'report.simple.testNameStyle.bold': 'true',
        'report.simple.testNameStyle.italic': 'false',
        'report.simple.testNameStyle.color': '#111111',
        'report.simple.highlightedParamStyle.fontFamily': 'Roboto',
        'report.simple.highlightedParamStyle.fontSize': '11',
        'report.simple.highlightedParamStyle.bold': 'true',
        'report.simple.highlightedParamStyle.italic': 'false',
        'report.simple.highlightedParamStyle.underline': 'false',
        'report.simple.highlightedParamStyle.color': '#111111',
        'report.simple.otherSignStyle.fontSize': '10',
        'report.simple.otherSignStyle.bold': 'true',
        'report.simple.otherSignStyle.italic': 'false',
        'report.simple.otherSignStyle.underline': 'false',
        'report.simple.otherSignStyle.color': '#111111',
        'report.simple.specimenStyle.fontSize': '9',
        'report.simple.specimenStyle.bold': 'false',
        'report.simple.specimenStyle.italic': 'true',
        'report.simple.specimenStyle.color': '#6e6e6e',
        'report.simple.referenceStyle.fontSize': '11',
        'report.simple.referenceStyle.bold': 'true',
        'report.simple.referenceStyle.italic': 'false',
        'report.simple.referenceStyle.color': '#111111',
        'report.simple.referenceStyle.align': 'right',
        'report.simple.methodStyle.fontSize': '8',
        'report.simple.methodStyle.bold': 'false',
        'report.simple.methodStyle.italic': 'true',
        'report.simple.methodStyle.color': '#777777',
        'report.simple.methodStyle.align': 'right',
        'report.simple.reportTitleStyle.fontSize': '11',
        'report.simple.reportTitleStyle.bold': 'true',
        'report.simple.reportTitleStyle.italic': 'false',
        'report.simple.reportTitleStyle.color': '#1756AD',
        'report.simple.reportTitleStyle.align': 'center',
        'report.simple.subtitleStyle.fontSize': '9',
        'report.simple.subtitleStyle.bold': 'false',
        'report.simple.subtitleStyle.italic': 'true',
        'report.simple.subtitleStyle.color': '#444444',
        'report.simple.subtitleStyle.align': 'center',
        'report.simple.footerStyle.fontSize': '9',
        'report.simple.footerStyle.bold': 'false',
        'report.simple.footerStyle.italic': 'false',
        'report.simple.footerStyle.color': '#111111',
        'report.simple.footerStyle.align': 'left',
        'report.simple.disclaimerStyle.fontSize': '9',
        'report.simple.disclaimerStyle.bold': 'false',
        'report.simple.disclaimerStyle.italic': 'false',
        'report.simple.disclaimerStyle.underline': 'false',
        'report.simple.disclaimerStyle.color': '#111111',
        'report.simple.disclaimerStyle.align': 'center',
        'report.simple.labSignStyle.fontSize': '10',
        'report.simple.labSignStyle.bold': 'true',
        'report.simple.labSignStyle.italic': 'false',
        'report.simple.labSignStyle.color': '#111111',
        'report.simple.labSignStyle.align': 'right',
        'report.simple.endReportStyle.fontSize': '10',
        'report.simple.endReportStyle.bold': 'true',
        'report.simple.endReportStyle.italic': 'false',
        'report.simple.endReportStyle.color': '#cc0000',
        'report.simple.endReportStyle.align': 'center'
      };
      Object.entries(defaults).forEach(([key, value]) => this.db.setSetting(key, value));
      this.db.setSetting(seedKey, 'DONE');
      this.ensurePatientHrLinesUseSettings();
    } catch {}
  }

  protected ensurePatientHrLinesUseSettings() {
    const migrationKey = 'report.simple.patientHrLinesMovedToHrConfig.v1';
    try {
      if (this.db.getSetting(migrationKey, '') === 'DONE') return;

      const current = String(this.db.getSetting('report.simple.hrLinesConfig', '') || '').trim();
      if (!current) {
        const cleanColor = (value: string, fallback: string) => /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim()) ? String(value).trim() : fallback;
        const bool = (key: string, fallback: boolean) => {
          const raw = String(this.db.getSetting(key, fallback ? 'true' : 'false') || '').trim().toLowerCase();
          return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
        };
        const lines: string[] = [];
        if (bool('report.simple.headerShowBottomRule', true)) {
          lines.push(`before-patient|0|0.7|${cleanColor(this.db.getSetting('report.simple.headerRuleColor', '#222222'), '#222222')}|2.1|0|100`);
        }
        if (bool('report.simple.patientBottomRule', true)) {
          lines.push(`after-patient|0|0.7|${cleanColor(this.db.getSetting('report.simple.patientRuleColor', '#222222'), '#222222')}|0|0|100`);
        }
        if (lines.length) this.db.setSetting('report.simple.hrLinesConfig', lines.join('\n'));
      }

      this.db.setSetting(migrationKey, 'DONE');
    } catch {}
  }


  protected layoutProfile: 'withBg' | 'noBg' = 'withBg';

  private isLayoutDualKey(suffix: string): boolean {
    const root = String(suffix || '').split('.')[0];
    const dualRoots = new Set([
      'pageSize', 'orientation',
      'marginTopMm', 'marginRightMm', 'marginBottomMm', 'marginLeftMm',
      'mainBodyMarginTopMm', 'mainBodyMarginBottomMm',
      'tableMarginTopMm', 'tableMarginBottomMm', 'tableMarginLeftMm', 'tableMarginRightMm',
      'tableSafetyMm', 'tablePaddingLeftMm', 'tablePaddingRightMm', 'tablePaddingTopMm', 'tablePaddingBottomMm',
      'headerFixedHeightMm', 'footerFixedHeightMm', 'headerLineGapMm', 'footerLineGapMm',
      'headerMarginTopMm', 'headerMarginBottomMm', 'footerMarginTopMm', 'footerMarginBottomMm', 'footerMarginLeftMm', 'footerMarginRightMm',
      'headerLogoEnabled', 'headerLogoPath', 'headerLogoWidthMm', 'headerLogoHeightMm', 'headerLogoPlacement', 'headerLogoOffsetXMm', 'headerLogoOffsetYMm',
      'institutionName', 'institutionSubText', 'institutionTextPlacement',
      'institutionNameOffsetXMm', 'institutionNameOffsetYMm', 'institutionSubTextOffsetXMm', 'institutionSubTextOffsetYMm',
      'headerTextAlignment', 'institutionNameStyle', 'institutionSubTextStyle',
      'addressText', 'addressPlacement', 'addressAlignment', 'addressStyle', 'addressLineGapMm',
      'addressOffsetXMm', 'addressOffsetYMm', 'addressMarginTopMm', 'addressMarginBottomMm',
      'footerText', 'footerTextAlignment', 'footerStyle', 'footerTextOffsetXMm', 'footerTextOffsetYMm', 'footerTextMarginTopMm', 'footerTextMarginBottomMm',
      'disclaimerPlacement', 'disclaimerText', 'disclaimerAlignment', 'disclaimerStyle', 'disclaimerBgColor', 'disclaimerWidthPct',
      'disclaimerOffsetXMm', 'disclaimerOffsetYMm', 'disclaimerMarginTopMm', 'disclaimerMarginBottomMm', 'disclaimerMarginLeftMm', 'disclaimerMarginRightMm',
      'disclaimerLineHeight', 'disclaimerCharacterSpacing',
      'footerDisclaimerWidthPct', 'footerPageNumberWidthPct', 'footerColumnGapMm', 'footerPageNumberAlignment'
    ]);
    return dualRoots.has(root);
  }

  protected reportSetting(key: string, fallback = ''): string {
    try {
      if (this.layoutProfile === 'noBg' && key.startsWith('report.simple.') && !key.startsWith('report.simple.noBg.')) {
        const suffix = key.slice('report.simple.'.length);
        if (this.isLayoutDualKey(suffix)) {
          const noBg = this.db.getSetting(`report.simple.noBg.${suffix}`, '');
          if (noBg !== '' && noBg != null) return String(noBg);
        }
      }
      return this.db.getSetting(key, fallback);
    } catch { return fallback; }
  }

  protected reportBool(key: string, fallback = false): boolean {
    const raw = String(this.reportSetting(key, fallback ? 'true' : 'false') || '').trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
  }

  protected reportNumber(key: string, fallback: number, min?: number, max?: number): number {
    const n = Number(this.reportSetting(key, String(fallback)));
    let out = Number.isFinite(n) ? n : fallback;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  }

  protected mmToPt(value: any, fallback = 0): number {
    const n = Number(value);
    return Number.isFinite(n) ? n * 2.8346456693 : fallback;
  }

  protected safeImagePath(value: any): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^data:image\//i.test(raw)) return raw;

    let filePath = raw.replace(/^file:\/\//i, '');
    try { filePath = decodeURI(filePath); } catch { /* keep raw path */ }

    const candidates = [
      filePath,
      path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath),
      path.join(__dirname, '..', 'assets', 'images', path.basename(filePath)),
      path.join(__dirname, '..', '..', 'electron-main', 'assets', 'images', path.basename(filePath))
    ];

    const seen = new Set<string>();
    for (const candidate of candidates) {
      if (!candidate || seen.has(candidate)) continue;
      seen.add(candidate);
      try {
        if (!fs.existsSync(candidate)) continue;
        const ext = path.extname(candidate).toLowerCase();
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
          : ext === '.png' ? 'image/png'
          : ext === '.webp' ? 'image/webp'
          : ext === '.gif' ? 'image/gif'
          : '';
        if (!mime) return '';
        return `data:${mime};base64,${fs.readFileSync(candidate).toString('base64')}`;
      } catch { /* ignore unreadable image and continue */ }
    }
    return '';
  }

  protected reportColor(key: string, fallback: string): string {
    const value = String(this.reportSetting(key, fallback) || fallback).trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
  }

  protected reportAlign(key: string, fallback: 'left'|'center'|'right' = 'left'): 'left'|'center'|'right' {
    const value = String(this.reportSetting(key, fallback) || fallback).toLowerCase();
    return value === 'center' || value === 'right' || value === 'left' ? value : fallback;
  }

  protected reportFont(value: any, fallback = 'Roboto'): string {
    const raw = String(value || fallback || 'Roboto').trim();
    const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '');
    const aliases: Record<string, string> = {
      roboto: 'Roboto', helvetica: 'Roboto', arial: 'Roboto', calibri: 'Roboto', segoeui: 'Roboto', tahoma: 'Roboto', verdana: 'Roboto',
      inter: 'Inter', lato: 'Lato', notosans: 'NotoSans', noto: 'NotoSans', notoserif: 'NotoSerif',
      notosanstamil: 'NotoSansTamil', tamil: 'NotoSansTamil',
      notosansdevanagari: 'NotoSansDevanagari', devanagari: 'NotoSansDevanagari', hindi: 'NotoSansDevanagari', marathi: 'NotoSansDevanagari',
      notosansmalayalam: 'NotoSansMalayalam', malayalam: 'NotoSansMalayalam',
      notosanskannada: 'NotoSansKannada', kannada: 'NotoSansKannada',
      notosanstelugu: 'NotoSansTelugu', telugu: 'NotoSansTelugu',
      notosansbengali: 'NotoSansBengali', bengali: 'NotoSansBengali',
      notosanssymbols: 'NotoSansSymbols', symbols: 'NotoSansSymbols', arrow: 'NotoSansSymbols', arrows: 'NotoSansSymbols',
      notosanssymbols2: 'NotoSansSymbols2', symbols2: 'NotoSansSymbols2',
      poppins: 'Poppins', montserrat: 'Montserrat', opensans: 'OpenSans', nunito: 'NunitoSans', nunitosans: 'NunitoSans',
      sourcesans: 'SourceSans3', sourcesans3: 'SourceSans3', merriweather: 'Merriweather', librebaskerville: 'LibreBaskerville', baskerville: 'LibreBaskerville', lora: 'Lora'
    };
    const resolved = aliases[normalized] || this.defaultReportFont;
    return this.availableReportFonts.has(resolved) ? resolved : this.defaultReportFont;
  }

  protected reportDefaultFont(): string {
    const bodyFont = this.reportSetting('report.simple.bodyTextStyle.fontFamily', '');
    const defaultFont = this.reportSetting('report.simple.defaultFontFamily', 'Roboto');
    return this.reportFont(bodyFont || defaultFont || 'Roboto');
  }

  protected reportStyle(prefix: string, fallback: any = {}): any {
    const fontSize = this.reportNumber(`report.simple.${prefix}.fontSize`, Number(fallback.fontSize || 9), 4, 72);
    const bold = this.reportBool(`report.simple.${prefix}.bold`, fallback.bold === true);
    const italics = this.reportBool(`report.simple.${prefix}.italic`, fallback.italics === true);
    const color = this.reportColor(`report.simple.${prefix}.color`, String(fallback.color || '#111111'));
    const alignment = this.reportAlign(`report.simple.${prefix}.align`, fallback.alignment || 'left');
    const underline = this.reportBool(`report.simple.${prefix}.underline`, fallback.underline === true);
    const font = this.reportFont(this.reportSetting(`report.simple.${prefix}.fontFamily`, fallback.font || fallback.fontFamily || 'Roboto'));
    const out:any = { font, fontSize, bold, italics, color, alignment };
    if (underline) out.decoration = 'underline';
    return out;
  }

  protected htmlEntityDecode(value:any): string {
    return String(value || '')
      .replace(/&nbsp;/gi, '\u00A0')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(parseInt(dec, 10)));
  }

  protected htmlToPlainText(value:any): string {
    return this.htmlEntityDecode(String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|tr|table|ul|ol)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/(li|td|th)>/gi, '  ')
      .replace(/<[^>]+>/g, ''))
      .split(/\r?\n/)
      .map(x => x.replace(/[ \t]+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  protected hasPrintableHtml(value:any): boolean {
    return !!this.htmlToPlainText(value).trim();
  }

  protected htmlAttr(attrs:string, name:string): string {
    const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const m = String(attrs || '').match(re);
    return m ? String(m[2] ?? m[3] ?? m[4] ?? '') : '';
  }

  protected htmlCssMap(attrs:string): Record<string,string> {
    const css:Record<string,string> = {};
    const style = this.htmlAttr(attrs, 'style');
    style.split(';').forEach(part => {
      const i = part.indexOf(':');
      if (i > -1) css[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
    });
    return css;
  }

  protected cssNumber(value:any): number | null {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return null;
    const n = parseFloat(raw.replace(/px|pt|em|rem|%|;/gi, '').trim());
    if (!Number.isFinite(n)) return null;
    if (raw.includes('em') || raw.includes('rem')) return n * 12;
    return n;
  }

  protected cssMmToPt(value:any, fallback = 0): number {
    const raw = String(value || '').trim().toLowerCase();
    const n = parseFloat(raw.replace(/px|pt|mm|cm|in|;/gi, '').trim());
    if (!Number.isFinite(n)) return fallback;
    if (raw.includes('mm')) return this.mmToPt(n, fallback);
    if (raw.includes('cm')) return this.mmToPt(n * 10, fallback);
    if (raw.includes('in')) return n * 72;
    if (raw.includes('px')) return n * 0.75;
    return n;
  }

  protected normalizePdfColor(value:any): string | undefined {
    const raw = String(value || '').trim();
    if (!raw || /^(inherit|initial|unset|transparent|none)$/i.test(raw)) return undefined;
    const named:Record<string,string> = {
      black:'#000000', white:'#ffffff', red:'#ff0000', green:'#008000', blue:'#0000ff', yellow:'#ffff00',
      gray:'#808080', grey:'#808080', orange:'#ffa500', purple:'#800080', pink:'#ffc0cb', brown:'#a52a2a',
      navy:'#000080', maroon:'#800000', teal:'#008080', cyan:'#00ffff', magenta:'#ff00ff', lime:'#00ff00'
    };
    const lower = raw.toLowerCase();
    if (named[lower]) return named[lower];
    if (/^#[0-9a-f]{3}$/i.test(raw)) return '#' + raw.slice(1).split('').map(c => c + c).join('').toLowerCase();
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    const rgb = raw.match(/rgba?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (rgb) {
      const alpha = rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, parseFloat(rgb[4])));
      if (alpha <= 0.02) return undefined;
      const toHex = (x:string) => Math.max(0, Math.min(255, Math.round(parseFloat(x)))).toString(16).padStart(2, '0');
      return `#${toHex(rgb[1])}${toHex(rgb[2])}${toHex(rgb[3])}`;
    }
    return /^#[0-9a-f]+$/i.test(raw) ? raw : undefined;
  }

  protected htmlStyleFromAttrs(attrs:string, baseStyle:any = {}): any {
    const out:any = {};
    const css = this.htmlCssMap(attrs);
    const align = this.htmlAttr(attrs, 'align');
    const legacyColor = this.htmlAttr(attrs, 'color');
    const legacyBg = this.htmlAttr(attrs, 'bgcolor');
    const legacySize = this.htmlAttr(attrs, 'size');
    const face = this.htmlAttr(attrs, 'face') || css['font-family'];
    const className = this.htmlAttr(attrs, 'class');
    const color = this.normalizePdfColor(css['color'] || legacyColor);
    const bg = this.normalizePdfColor(css['background-color'] || css['background'] || legacyBg);
    let textAlign = css['text-align'] || align;
    if (!textAlign && /\bql-align-(center|right|justify)\b/i.test(className)) {
      textAlign = className.match(/\bql-align-(center|right|justify)\b/i)?.[1] || '';
    }
    let fontSize = this.cssNumber(css['font-size']);
    if (!fontSize && legacySize) {
      const legacy = parseInt(String(legacySize).replace(/[+\s]/g, ''), 10);
      const legacyMap:Record<number, number> = { 1:8, 2:10, 3:12, 4:14, 5:18, 6:24, 7:32 };
      if (Number.isFinite(legacy)) fontSize = legacyMap[Math.max(1, Math.min(7, legacy))] || null;
    }
    if (!fontSize && /\bql-size-small\b/i.test(className)) fontSize = Math.max(6, Number(baseStyle.fontSize || 9) - 2);
    if (!fontSize && /\bql-size-large\b/i.test(className)) fontSize = Number(baseStyle.fontSize || 9) + 3;
    if (!fontSize && /\bql-size-huge\b/i.test(className)) fontSize = Number(baseStyle.fontSize || 9) + 7;
    const fontWeight = String(css['font-weight'] || '').toLowerCase();
    const fontStyle = String(css['font-style'] || '').toLowerCase();
    const textDecoration = String(css['text-decoration-line'] || css['text-decoration'] || '').toLowerCase();
    if (color) out.color = color;
    if (bg) out.background = bg;
    if (['left','center','right','justify'].includes(String(textAlign || '').toLowerCase())) out.alignment = String(textAlign).toLowerCase();
    if (fontSize && fontSize >= 4 && fontSize <= 72) out.fontSize = fontSize;
    if (fontWeight === 'bold' || parseInt(fontWeight, 10) >= 600) out.bold = true;
    else if (fontWeight === 'normal' || fontWeight === '400') out.bold = false;
    if (fontStyle === 'italic' || fontStyle === 'oblique') out.italics = true;
    else if (fontStyle === 'normal') out.italics = false;
    if (textDecoration.includes('underline')) out.decoration = 'underline';
    if (textDecoration.includes('line-through')) out.decoration = 'lineThrough';
    if (face) out.font = this.reportFont(String(face).split(',')[0].replace(/["']/g, '').trim());
    const indentMatch = className.match(/\bql-indent-(\d+)\b/i);
    const paddingLeft = this.cssMmToPt(css['padding-left'] || css['margin-left'] || css['text-indent'], NaN);
    const indent = indentMatch ? Math.min(60, Math.max(0, parseInt(indentMatch[1], 10) * 18)) : (Number.isFinite(paddingLeft) ? paddingLeft : undefined);
    if (indent !== undefined) out._marginLeft = indent;
    return { ...baseStyle, ...out };
  }

  protected richTextFromHtml(html:any, baseStyle:any): any[] {
    const input = String(html || '').replace(/<br\s*\/?>/gi, '<br>');
    const parts = input.match(/<[^>]+>|[^<]+/g) || [];
    const stack:any[] = [{ ...baseStyle }];
    const out:any[] = [];
    const current = () => stack[stack.length - 1] || baseStyle;
    const pushText = (text:string, style:any) => {
      const decoded = this.htmlEntityDecode(text).replace(/\r/g, '');
      if (!decoded) return;
      const chunks = decoded.split('\n');
      chunks.forEach((chunk, idx) => {
        const normalized = chunk.replace(/\t/g, '    ');
        if (normalized) out.push({ text: normalized, ...style });
        if (idx < chunks.length - 1) out.push({ text:'\n', ...style });
      });
    };
    for (const part of parts) {
      if (!part.startsWith('<')) { pushText(part, current()); continue; }
      const tagMatch = part.match(/^<\s*(\/)?\s*([a-z0-9]+)([^>]*)>/i);
      if (!tagMatch) continue;
      const closing = !!tagMatch[1];
      const tag = String(tagMatch[2] || '').toLowerCase();
      const attrs = String(tagMatch[3] || '');
      const selfClose = /\/\s*>$/.test(part) || ['br','hr','img','input','meta','link'].includes(tag);
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      if (tag === 'br') { out.push({ text:'\n', ...current() }); continue; }
      let next:any = { ...current(), ...this.htmlStyleFromAttrs(attrs, {}) };
      if (tag === 'b' || tag === 'strong') next.bold = true;
      if (tag === 'i' || tag === 'em') next.italics = true;
      if (tag === 'u' || tag === 'ins') next.decoration = 'underline';
      if (tag === 's' || tag === 'strike' || tag === 'del') next.decoration = 'lineThrough';
      if (tag === 'mark' && !next.background) next.background = '#fff59d';
      if (tag === 'sup') { next.sup = true; next.fontSize = Math.max(5, Number(next.fontSize || baseStyle.fontSize || 9) - 2); }
      if (tag === 'sub') { next.sub = true; next.fontSize = Math.max(5, Number(next.fontSize || baseStyle.fontSize || 9) - 2); }
      if (/^h[1-6]$/.test(tag)) { next.bold = true; next.fontSize = Math.max(Number(baseStyle.fontSize || 9) + (tag === 'h1' ? 6 : tag === 'h2' ? 5 : tag === 'h3' ? 4 : 3), Number(next.fontSize || 0)); }
      if (!selfClose) stack.push(next);
    }
    const merged:any[] = [];
    for (const node of out) {
      if (!node.text) continue;
      const clean = { ...node };
      delete clean._marginLeft;
      const prev = merged[merged.length - 1];
      const a = { ...prev }; const b = { ...clean }; delete a.text; delete b.text;
      if (prev && JSON.stringify(a) === JSON.stringify(b)) prev.text += clean.text;
      else merged.push(clean);
    }
    return merged.length ? merged : [{ text:this.htmlToPlainText(html), ...baseStyle }];
  }

  protected blockStyleFromHtml(blockHtml:string, baseStyle:any): any {
    const open = String(blockHtml || '').match(/^\s*<\s*[a-z0-9]+([^>]*)>/i);
    return open ? this.htmlStyleFromAttrs(open[1] || '', baseStyle) : baseStyle;
  }

  protected blockMargin(style:any, fallback:[number,number,number,number] = [0,1,0,1]): [number,number,number,number] {
    const left = Number(style?._marginLeft || 0) || fallback[0];
    return [left, fallback[1], fallback[2], fallback[3]];
  }

  protected stripOuterTag(html:string): string {
    return String(html || '').replace(/^\s*<\s*[a-z0-9]+[^>]*>/i, '').replace(/<\/\s*[a-z0-9]+\s*>\s*$/i, '');
  }

  protected parseInterpretationTables(html:string, baseStyle:any): any[] {
    const tables:any[] = [];
    const tableRegex = /<table([^>]*)>[\s\S]*?<\/table>/gi;
    let match:RegExpExecArray | null;
    while ((match = tableRegex.exec(String(html || '')))) {
      const tableHtml = match[0];
      const tableAttrs = match[1] || '';
      const tableCss = this.htmlCssMap(tableAttrs);
      const borderMode = (this.htmlAttr(tableAttrs, 'data-border-mode') || (/border\s*:\s*(0|none)/i.test(tableCss['border'] || '') ? 'none' : 'full')).toLowerCase();
      const rows:any[] = [];
      const trRegex = /<tr([^>]*)>[\s\S]*?<\/tr>/gi;
      let trMatch:RegExpExecArray | null;
      while ((trMatch = trRegex.exec(tableHtml))) {
        const rowHtml = trMatch[0];
        const rowStyle = this.htmlStyleFromAttrs(trMatch[1] || '', baseStyle);
        const cells:any[] = [];
        const cellRegex = /<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi;
        let cellMatch:RegExpExecArray | null;
        while ((cellMatch = cellRegex.exec(rowHtml))) {
          const isHeader = String(cellMatch[1]).toLowerCase() === 'th';
          const cellStyle = this.htmlStyleFromAttrs(cellMatch[2] || '', { ...baseStyle, ...rowStyle });
          const rich = this.richTextFromHtml(cellMatch[3], { ...cellStyle, bold: isHeader ? true : cellStyle.bold });
          cells.push({ text: rich, margin:[3,2,3,2], alignment: cellStyle.alignment || rowStyle.alignment || baseStyle.alignment || 'left', fillColor: cellStyle.background || rowStyle.background || undefined });
        }
        if (cells.length) rows.push(cells);
      }
      if (rows.length) {
        const maxCols = Math.max(...rows.map(r => r.length));
        rows.forEach(r => { while (r.length < maxCols) r.push({ text:' ', ...baseStyle, margin:[3,2,3,2] }); });
        const layout = borderMode === 'none' ? 'noBorders' : {
          hLineWidth: (i:number, node:any) => borderMode === 'outer' ? (i === 0 || i === node.table.body.length ? 0.7 : 0) : 0.5,
          vLineWidth: (i:number, node:any) => borderMode === 'outer' ? (i === 0 || i === node.table.widths.length ? 0.7 : 0) : 0.5,
          hLineColor: () => '#94a3b8',
          vLineColor: () => '#94a3b8',
          paddingLeft: () => 3,
          paddingRight: () => 3,
          paddingTop: () => 2,
          paddingBottom: () => 2
        };
        const tableNode:any = { table:{ headerRows: rows.length > 1 ? 1 : 0, widths:Array(maxCols).fill('*'), body:rows }, layout, margin:[0,2,0,3] }; // headerRows lets interpretation tables continue cleanly across pages
        const width = String(tableCss['width'] || '').trim();
        const margin = String(tableCss['margin'] || '').toLowerCase();
        const align = margin.includes('auto') && margin.includes('0 8px auto') ? 'right' : (margin.includes('auto') ? 'center' : 'left');
        if (width && width !== 'auto' && width !== '100%') {
          const spacer = width.endsWith('%') ? Math.max(0, Math.min(100, parseFloat(width))) : 100;
          if (spacer > 0 && spacer < 100) {
            const side = (100 - spacer) / 2;
            if (align === 'center') { tables.push({ columns:[{ width:`${side}%`, text:'' }, { width:`${spacer}%`, stack:[tableNode] }, { width:`${side}%`, text:'' }], columnGap:0 }); continue; }
            if (align === 'right') { tables.push({ columns:[{ width:`${100 - spacer}%`, text:'' }, { width:`${spacer}%`, stack:[tableNode] }], columnGap:0 }); continue; }
          }
        }
        tables.push(tableNode);
      }
    }
    return tables;
  }

  protected parseInterpretationList(listHtml:string, baseStyle:any): any[] {
    const ordered = /^\s*<\s*ol/i.test(listHtml);
    const listStyle = this.blockStyleFromHtml(listHtml, baseStyle);
    const nodes:any[] = [];
    const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
    let index = 1;
    let m:RegExpExecArray | null;
    while ((m = liRegex.exec(listHtml))) {
      const liStyle = this.htmlStyleFromAttrs(m[1] || '', listStyle);
      if (!this.hasPrintableHtml(m[2])) { index++; continue; }
      const rich = this.richTextFromHtml(m[2], liStyle);
      nodes.push({ text:[{ text: ordered ? `${index}. ` : '• ', ...liStyle, bold:true }, ...rich], ...liStyle, margin:this.blockMargin(liStyle, [12,1,0,1]) });
      index++;
    }
    return nodes;
  }

  protected buildInterpretationContentNodes(html:any, baseStyle:any): any[] {
    const source = String(html || '');
    const nodes:any[] = [];

    const pushPlain = (raw:string) => {
      if (!this.hasPrintableHtml(raw)) return;
      // Keep block breaks from the editor while still allowing inline styles
      // such as <i>, <u>, <span style="color:..."> to be parsed.
      const prepared = String(raw || '')
        .replace(/<\/(p|div|h[1-6]|blockquote|pre)>/gi, '</$1><br>')
        .replace(/<(p|div|h[1-6]|blockquote|pre)([^>]*)>/gi, '<span$2>');
      const rich = this.richTextFromHtml(prepared, baseStyle);
      if (!rich.length) return;
      // Avoid visual noise from wrapper-only blank lines, but keep meaningful
      // line breaks inside rich text.
      const printable = rich.some(x => String(x?.text || '').replace(/\u00A0/g, ' ').trim());
      if (printable) nodes.push({ text:rich, ...baseStyle, margin:[0,1,0,1] });
    };

    // Important: rich editors often wrap lists/tables inside many <div> tags.
    // Parse semantic structures wherever they appear instead of allowing an
    // outer <div> regex to flatten <ol>, <ul>, and <table> into plain text.
    const structuralRegex = /<table[^>]*>[\s\S]*?<\/table>|<(ul|ol)[^>]*>[\s\S]*?<\/\1>/gi;
    let last = 0;
    let match:RegExpExecArray | null;
    while ((match = structuralRegex.exec(source))) {
      pushPlain(source.slice(last, match.index));
      const block = match[0];
      if (/^\s*<table/i.test(block)) {
        nodes.push(...this.parseInterpretationTables(block, baseStyle));
      } else {
        nodes.push(...this.parseInterpretationList(block, baseStyle));
      }
      last = structuralRegex.lastIndex;
    }
    pushPlain(source.slice(last));
    return nodes;
  }

  protected buildInterpretationPdfNodes(html:any, sourceLabel:string): any[] {
    if (!this.hasPrintableHtml(html)) return [];
    const baseStyle = this.reportStyle('interpretationStyle', { fontSize:9, color:'#111111', alignment:'left' });
    const label = String(this.reportSetting('report.simple.interpretationLabel', 'Interpretation') || '').trim();
    const showLabel = this.reportBool('report.simple.interpretationShowLabel', true) && label;
    const stack:any[] = [];
    if (showLabel) stack.push({ text: sourceLabel ? `${label} - ${sourceLabel}` : label, ...baseStyle, bold:true, margin:[0,0,0,2] });
    const contentNodes = this.buildInterpretationContentNodes(html, baseStyle);
    stack.push(...contentNodes);
    const bg = this.reportColor('report.simple.interpretationBgColor', '#ffffff');
    const showBorder = this.reportBool('report.simple.interpretationShowBorder', false);
    const top = this.mmToPt(this.reportNumber('report.simple.interpretationMarginTopMm', 1.5, 0, 30));
    const bottom = this.mmToPt(this.reportNumber('report.simple.interpretationMarginBottomMm', 2, 0, 30));
    // Keep interpretation page-break friendly. Do not wrap the whole
    // interpretation in an unbreakable object or a single nested table row;
    // long paragraphs/lists/tables must be allowed to continue onto the next page.
    const blockMargin = (node:any, first:boolean, last:boolean) => {
      const existing = Array.isArray(node?.margin) ? node.margin : [0, 0, 0, 0];
      return [existing[0] || 0, (first ? top : existing[1] || 0), existing[2] || 0, (last ? bottom : existing[3] || 0)];
    };
    const nodes = stack.length ? stack : [{ text:this.htmlToPlainText(html), ...baseStyle }];
    return nodes.map((node:any, index:number) => ({
      ...node,
      margin: blockMargin(node, index === 0, index === nodes.length - 1)
    }));
  }

  protected interpretationAllowed(source:'test'|'profile'): boolean {
    if (!this.reportBool('report.simple.interpretationEnabled', false)) return false;
    const mode = String(this.reportSetting('report.simple.interpretationSource', 'both') || 'both').toLowerCase();
    return mode === 'both' || mode === source;
  }

  protected buildRemarksPdfNodes(text:any, kind: 'test' | 'profile' = 'test'): any[] {
    if (!this.hasPrintableHtml(text)) return [];
    const styleKey = kind === 'profile' ? 'profileRemarksStyle' : 'remarksStyle';
    const labelKey = kind === 'profile' ? 'report.simple.profileRemarksLabel' : 'report.simple.remarksLabel';
    const showLabelKey = kind === 'profile' ? 'report.simple.profileRemarksShowLabel' : 'report.simple.remarksShowLabel';
    const bgKey = kind === 'profile' ? 'report.simple.profileRemarksBgColor' : 'report.simple.remarksBgColor';
    const borderKey = kind === 'profile' ? 'report.simple.profileRemarksShowBorder' : 'report.simple.remarksShowBorder';
    const topKey = kind === 'profile' ? 'report.simple.profileRemarksMarginTopMm' : 'report.simple.remarksMarginTopMm';
    const bottomKey = kind === 'profile' ? 'report.simple.profileRemarksMarginBottomMm' : 'report.simple.remarksMarginBottomMm';
    const defaultLabel = kind === 'profile' ? 'Profile Remarks' : 'Remarks';
    const baseStyle = this.reportStyle(styleKey, { fontSize:9, color:'#111111', alignment:'left' });
    const label = String(this.reportSetting(labelKey, defaultLabel) || '').trim();
    const showLabel = this.reportBool(showLabelKey, true) && label;
    const stack:any[] = [];
    if (showLabel) stack.push({ text: label, ...baseStyle, bold:true, margin:[0,0,0,2] });
    stack.push({ text: this.htmlToPlainText(text), ...baseStyle });
    const bg = this.reportColor(bgKey, '#ffffff');
    const showBorder = this.reportBool(borderKey, false);
    const top = this.mmToPt(this.reportNumber(topKey, 1.5, 0, 30));
    const bottom = this.mmToPt(this.reportNumber(bottomKey, 2, 0, 30));
    void bg; void showBorder;
    const blockMargin = (node:any, first:boolean, last:boolean) => {
      const existing = Array.isArray(node?.margin) ? node.margin : [0, 0, 0, 0];
      return [existing[0] || 0, (first ? top : existing[1] || 0), existing[2] || 0, (last ? bottom : existing[3] || 0)];
    };
    return stack.map((node:any, index:number) => ({
      ...node,
      margin: blockMargin(node, index === 0, index === stack.length - 1)
    }));
  }

  protected remarksAllowed(): boolean {
    return this.reportBool('report.simple.remarksEnabled', true);
  }

  protected profileRemarksAllowed(): boolean {
    return this.reportBool('report.simple.profileRemarksEnabled', true);
  }

  protected parseProfileRemarksMap(raw:any): Record<string, string> {
    if (!raw) return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw)) {
        const key = String(k || '').trim();
        const text = String(v ?? '').trim();
        if (key && text) out[key] = text;
      }
      return out;
    }
    try {
      return this.parseProfileRemarksMap(JSON.parse(String(raw || '{}')));
    } catch {
      return {};
    }
  }

  protected reportPageSize(): any {
    const size = String(this.reportSetting('report.simple.pageSize', 'A4') || 'A4').trim();
    if (size === 'Custom') {
      return {
        width: this.mmToPt(this.reportNumber('report.simple.customWidthMm', 210, 50, 1000), 595.28),
        height: this.mmToPt(this.reportNumber('report.simple.customHeightMm', 297, 50, 1000), 841.89)
      };
    }
    return ['A4','A5','LETTER','LEGAL','Letter','Legal'].includes(size) ? size : 'A4';
  }

  protected reportPageMargins(): [number, number, number, number] {
    const pageLeftMm = this.reportNumber('report.simple.marginLeftMm', 8.8, 0, 100);
    const pageTopMm = this.reportNumber('report.simple.marginTopMm', 15, 0, 100);
    const pageRightMm = this.reportNumber('report.simple.marginRightMm', 5.3, 0, 100);
    const pageBottomMm = this.reportNumber('report.simple.marginBottomMm', 2, 0, 100);
    const headerReservedMm = this.reportNumber('report.simple.headerFixedHeightMm', 45, 0, 160);
    const footerReservedMm = this.reportNumber('report.simple.footerFixedHeightMm', 18.8, 0, 120);
    const patientInHeader = String(this.reportSetting('report.simple.patientDetailsPlacement', 'header')) === 'header'
      && this.reportBool('report.simple.patientDetailsEnabled', true);
    const patientGapMm = patientInHeader ? this.reportNumber('report.simple.patientDetailsGapMm', 0, 0, 100) : 0;
    return [
      this.mmToPt(pageLeftMm, 25),
      this.mmToPt(pageTopMm + headerReservedMm + patientGapMm, 170),
      this.mmToPt(pageRightMm, 15),
      this.mmToPt(pageBottomMm + footerReservedMm, 59)
    ];
  }

  protected reportPageWidthMm(): number {
    const size = String(this.reportSetting('report.simple.pageSize', 'A4') || 'A4').trim();
    const portrait: Record<string, { width: number; height: number }> = {
      A4: { width: 210, height: 297 },
      A5: { width: 148, height: 210 },
      LETTER: { width: 216, height: 279 },
      Letter: { width: 216, height: 279 },
      LEGAL: { width: 216, height: 356 },
      Legal: { width: 216, height: 356 }
    };
    let widthMm = size === 'Custom'
      ? this.reportNumber('report.simple.customWidthMm', 210, 50, 1000)
      : (portrait[size]?.width || 210);
    let heightMm = size === 'Custom'
      ? this.reportNumber('report.simple.customHeightMm', 297, 50, 1000)
      : (portrait[size]?.height || 297);
    if (String(this.reportSetting('report.simple.orientation', 'portrait')) === 'landscape') {
      [widthMm, heightMm] = [heightMm, widthMm];
    }
    return widthMm;
  }

  protected reportAvailableWidthPt(): number {
    const widthMm = this.reportPageWidthMm();
    const left = this.reportNumber('report.simple.marginLeftMm', 8.8, 0, 100);
    const right = this.reportNumber('report.simple.marginRightMm', 5.3, 0, 100);
    const tableLeft = this.reportNumber('report.simple.tableMarginLeftMm', 0, 0, 100);
    const tableRight = this.reportNumber('report.simple.tableMarginRightMm', 0, 0, 100);
    const safety = this.reportNumber('report.simple.tableSafetyMm', 0, 0, 20);
    return Math.max(80, this.mmToPt(widthMm - left - right - tableLeft - tableRight - safety, 535));
  }

  protected reportPageContentWidthPt(): number {
    const widthMm = this.reportPageWidthMm();
    const left = this.reportNumber('report.simple.marginLeftMm', 8.8, 0, 100);
    const right = this.reportNumber('report.simple.marginRightMm', 5.3, 0, 100);
    return Math.max(80, this.mmToPt(widthMm - left - right, 555));
  }


}
