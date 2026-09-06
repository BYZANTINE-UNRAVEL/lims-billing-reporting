import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
const PdfPrinter = require('pdfmake');
type ReportAlignment = 'left' | 'center' | 'right';
import { BrowserWindow, shell } from 'electron';
import { ReportContentService } from './report-content.service';

export class ReportDocumentService extends ReportContentService {  async createReportPdf(reportOrBillId:number, withBackground?: boolean, options:any = {}) {
    const previousLayoutProfile = this.layoutProfile;
    this.layoutProfile = withBackground === false ? 'noBg' : 'withBg';
    try {
      return await this.createReportPdfInner(reportOrBillId, withBackground, options);
    } finally {
      this.layoutProfile = previousLayoutProfile;
    }
  }

  private async createReportPdfInner(reportOrBillId:number, withBackground?: boolean, options:any = {}) {
    const ids = this.normalizeReportIdList(reportOrBillId, options);
    const pdfOutputMode = String(options?.pdfOutputMode || options?.outputMode || '').toLowerCase();
    const shouldExportPdf = pdfOutputMode === 'export' || options?.export === true || options?.saveToExportFolder === true;
    const previewMode = String(options?.previewMode || '').toLowerCase();
    const reports = previewMode
      ? [this.buildReportSettingsPreviewReport(previewMode)]
      : ids.map((id:number)=>this.db.getReport(id)).filter(Boolean) as any[];
    if(!reports.length) throw new Error('Report not found');

    const r:any = {...reports[0]};
    if (ids.length > 1 || String(options?.merge_mode || '').toUpperCase() === 'MERGE') {
      r.items = this.finalReportItemsForApprovedOutput(reports, options);
      r.status = reports.some((x:any)=>String(x.status || '').toUpperCase().includes('CANCEL')) ? 'CANCELLED' : 'APPROVED';
      r.report_no = reports.map((x:any)=>x.report_no || `RPT${String(x.id).padStart(4,'0')}`).join(', ');
    }

    const showProfileName = options?.show_profile_name !== false && r.show_profile_name_on_report !== 0;
    const showSubHeader = options?.show_sub_header !== false && r.show_sub_header_on_report !== 0;
    const pdfOptions = {
      ...options,
      show_profile_name: showProfileName,
      show_sub_header: showSubHeader,
      order_mode: String(options?.order_mode || '').toUpperCase() || (String(r.report_scope || '').toUpperCase() === 'QUICK' ? 'TYPED' : '')
    };
    const normalizedReportItems = this.normalizeReportItemsForPdf(r.items || [], pdfOptions);
    const printableItems = normalizedReportItems.filter((i:any)=> {
      if (i.test_id) return true;
      const kind = String(i.heading_kind || '').toUpperCase();
      if (kind === 'DEPARTMENT') return true;
      if (kind === 'INNER') return showSubHeader;
      return showProfileName;
    });
    const isReportCancelled = String(r.status || '').toUpperCase().includes('CANCEL');

    const specimenSummary = this.uniqueJoinedSpecimens(printableItems, r);
    const computed = {
      patientName: this.formatPatientNameForReport(r),
      patientNo: this.safeText(r.patient_no, '-'),
      ageGender: [this.formatAgeForDisplay(r), this.safeText(r.gender, '')].filter(Boolean).join(' / ') || '-',
      consultant: this.safeText(r.consultant_name || r.ref_by || r.referred_by, '-'),
      specimenSummary,
      collectedOn: this.fmtPatientBlockDate(r.collected_at || r.collection_date || r.sample_collected_at || r.bill_date, 'collected'),
      reportedOn: this.fmtPatientBlockDate(r.reported_at || r.approved_at || r.updated_at || new Date(), 'reported')
    };

    const showSpecimen = this.reportBool('report.simple.specimenVisible', this.reportBool('report.simple.showSpecimenInTestName', true));
    const specimenPlacement = this.reportSetting('report.simple.specimenPlacement', 'under-test');
    const specimenPrefix = this.reportSetting('report.simple.specimenPrefix', '').trim();
    const showMethod = this.reportBool('report.simple.methodVisible', this.reportBool('report.simple.showMethodInReference', true));
    const showReference = true;
    const referencePlacement = 'right-column';
    const methodPlacement = this.reportSetting('report.simple.methodPlacement', 'under-reference');
    const methodPrefix = this.reportSetting('report.simple.methodPrefix', '').trim();
    const showSampleId = this.reportBool('report.simple.showSampleIdInTestName', false);
    const showReportTitle = this.reportBool('report.simple.reportTitleEnabled', true);
    const reportTitleText = this.reportSetting('report.simple.reportTitleText', 'LABORATORY REPORT');

    const tableColumns = this.reportTableColumnKeys();
    const tableWidths = this.reportResultTableWidths(tableColumns);
    const buildTableHeader = () => tableColumns.map((key:string) => ({
      text: this.reportTableColumnLabel(key),
      style: 'columnHeader',
      alignment: this.reportTableColumnHeaderAlign(key)
    }));
    // One continuous results table so pdfmake headerRows can reprint
    // Test/Specimen|Flag|Result|Unit|Reference on every page. Flag cells use SVG
    // (not canvas), so colSpan section rows in the same table are safe.
    const tableBodies:any[][] = [[buildTableHeader()]];
    const tableBreakReasons:string[] = [''];
    let tableBody:any[] = tableBodies[0];
    const beginFreshReportTable = (reason = 'continued') => {
      if (tableBody.length <= 1) return;
      tableBody = [buildTableHeader()];
      tableBodies.push(tableBody);
      tableBreakReasons.push(reason);
    };
    // Each filler cell must be its own object (never Array.fill({})).
    const spanRow = (cell:any) => [
      cell,
      ...Array.from({ length: Math.max(0, tableColumns.length - 1) }, () => ({ text: '' }))
    ];
    const flagMode = this.reportFlagMode();
    const flagsEnabled = this.reportBool('report.simple.tableFlagsEnabled', true) && flagMode !== 'none' && flagMode !== 'range_only';
    const flagStylesEnabled = flagsEnabled && (flagMode === 'flag_abnormal' || flagMode === 'critical_flag_abnormal');
    const criticalEnabled = flagsEnabled && flagMode === 'critical_flag_abnormal';

    const pageBreakTestIds = new Set((this.db.listTests ? this.db.listTests(false) : []).filter((x:any)=>Number(x.start_new_page||0)===1).map((x:any)=>+x.id));
    const pageBreakAfterProfileIds = new Set((this.db.listProfiles ? this.db.listProfiles(false) : [])
      .filter((x:any)=>Number(x.break_page_after || x.start_new_page || 0)===1)
      .map((x:any)=>+x.id));
    const departmentRows:any[] = this.db.listDepartments ? this.db.listDepartments() : [];
    const pageBreakAfterDepartmentIds = new Set(departmentRows.filter((x:any)=>Number(x.page_break_after || 0)===1).map((x:any)=>+x.id));
    const pageBreakAfterDepartmentNames = new Set(departmentRows.filter((x:any)=>Number(x.page_break_after || 0)===1).map((x:any)=>String(x.name || '').trim().toLowerCase()).filter(Boolean));
    let lastRenderedProfileId = 0;
    let lastRenderedDepartmentId = 0;
    let lastRenderedDepartmentName = '';
    const departmentBreakEnabled = (id:number, name:string) => (id > 0 && pageBreakAfterDepartmentIds.has(id)) || (!!name && pageBreakAfterDepartmentNames.has(name));
    let hasAnyDepartment = false;
    const activeProfileInterpretations:any[] = [];
    const profileRemarksMap = this.parseProfileRemarksMap(r.profile_remarks ?? r.profile_remarks_json);
    const lookupProfileRemarkText = (entry:any) => {
      const id = +(entry?.profileId || 0) || 0;
      const name = String(entry?.label || entry?.profileName || '').trim();
      const keys = [
        id > 0 ? String(id) : '',
        id > 0 ? `id:${id}` : '',
        name,
        name ? `name:${name}` : ''
      ].filter(Boolean);
      for (const key of keys) {
        const text = String(profileRemarksMap?.[key] || '').trim();
        if (text) return text;
      }
      return '';
    };
    const flushProfileInterpretation = () => {
      const entry = activeProfileInterpretations.pop();
      if (!entry) return;
      if (entry.seenTest && this.profileRemarksAllowed()) {
        const remarksText = lookupProfileRemarkText(entry);
        if (this.hasPrintableHtml(remarksText)) {
          tableBody.push(spanRow({ stack:this.buildRemarksPdfNodes(remarksText, 'profile'), colSpan:tableColumns.length }));
        }
      }
      if (entry.seenTest && this.interpretationAllowed('profile') && Number(entry.enabled || 0) === 1 && this.hasPrintableHtml(entry.html)) {
        tableBody.push(spanRow({ stack:this.buildInterpretationPdfNodes(entry.html, entry.label || 'Profile'), colSpan:tableColumns.length }));
      }
    };
    const flushAllProfileInterpretations = () => { while (activeProfileInterpretations.length) flushProfileInterpretation(); };
    for (const item of printableItems) {
      const headingKind = String(item?.heading_kind || '').toUpperCase();
      const isDepartmentHeading = !item?.test_id && headingKind === 'DEPARTMENT';
      const currentDepartmentId = +(item?.department_id || 0) || 0;
      const currentDepartmentName = String(isDepartmentHeading ? (item?.test_name || '') : (item?.department_name || '')).trim().toLowerCase();
      const departmentChanged = (currentDepartmentId > 0 && lastRenderedDepartmentId > 0 && currentDepartmentId !== lastRenderedDepartmentId)
        || (!!currentDepartmentName && !!lastRenderedDepartmentName && currentDepartmentName !== lastRenderedDepartmentName);
      if (departmentChanged && departmentBreakEnabled(lastRenderedDepartmentId, lastRenderedDepartmentName)) {
        // Mixed multi-dept packages stay open across departments — only flush when the
        // active profile is not a mixed package (otherwise interpretation/page-break
        // mid-package can corrupt the next table and fail pdfmake).
        const openMixed = activeProfileInterpretations.some((x:any) => this.isMixedProfileMaster(+x.profileId || 0));
        if (!openMixed) {
          flushAllProfileInterpretations();
          lastRenderedProfileId = 0;
        }
        beginFreshReportTable('category');
      }

      const currentProfileId = +(item?.source_profile_id || 0) || 0;
      if (lastRenderedProfileId && currentProfileId !== lastRenderedProfileId && pageBreakAfterProfileIds.has(lastRenderedProfileId)) {
        // Keep the profile interpretation with the profile, then force the next
        // profile/group/test onto a genuinely new PDF page.
        flushAllProfileInterpretations();
        beginFreshReportTable('profile');
        lastRenderedProfileId = 0;
      }
      const startNewPage = Number(item?.start_new_page || 0) === 1 || (item?.test_id && pageBreakTestIds.has(+item.test_id));
      if (startNewPage && item?.test_id) {
        flushAllProfileInterpretations();
        beginFreshReportTable('test');
      }
      if (!item.test_id) {
        const kind = String(item.heading_kind || '').toUpperCase();
        const isDepartment = kind === 'DEPARTMENT';
        const isInner = kind === 'INNER';
        const isProfile = kind === 'PROFILE' || (!isDepartment && !isInner);

        // Flush profile interpretation before every next heading so profile
        // interpretation stays attached to its own profile block.
        while (activeProfileInterpretations.length && activeProfileInterpretations[activeProfileInterpretations.length - 1].seenTest) flushProfileInterpretation();

        if (isProfile) {
          activeProfileInterpretations.push({
            label: this.safeText(item.test_name, 'Profile'),
            profileName: this.safeText(item.source_profile_name || item.test_name, ''),
            profileId: +(item.source_profile_id || 0) || 0,
            enabled: item.profile_interpretation_enabled,
            html: item.profile_interpretation_text,
            seenTest: false
          });
        }

        const headingCell:any = { text:this.safeText(item.test_name, ''), style:isDepartment?'categoryHeader':'sectionHeader', colSpan:tableColumns.length }; tableBody.push(spanRow(headingCell));
        hasAnyDepartment = true;
        if (isDepartment) {
          lastRenderedDepartmentId = currentDepartmentId;
          lastRenderedDepartmentName = currentDepartmentName;
        }
        continue;
      }

      activeProfileInterpretations.forEach((x:any) => {
        x.seenTest = true;
        if (!(+x.profileId || 0) && currentProfileId) x.profileId = currentProfileId;
        if (!String(x.profileName || '').trim() && item?.source_profile_name) {
          x.profileName = String(item.source_profile_name || '').trim();
        }
      });
      if (!hasAnyDepartment && item.department_name) {
        tableBody.push(spanRow({ text:String(item.department_name), style:'categoryHeader', colSpan:tableColumns.length }));
        hasAnyDepartment = true;
      }

      const itemFlagsEnabled = Number(item?.flag_enabled ?? 1) !== 0;
      const rawResultValue = String(item?.result_value ?? '').trim();
      const hasRealResult = rawResultValue !== '' && rawResultValue !== '-' && rawResultValue !== '—';
      const rawFlag = itemFlagsEnabled && hasRealResult ? this.resultFlag(item, criticalEnabled) : '';
      const flag = flagsEnabled && itemFlagsEnabled && hasRealResult ? rawFlag : '';
      const specimen = this.reportItemSpecimenText(item);
      const specimenText = specimenPrefix && specimen ? `${specimenPrefix} ${specimen}` : specimen;
      const testNameText = this.safeText(item.test_name || item.name, '-');
      const isHighlightedParam = Number(item?.highlight_parameter || 0) === 1;
      const testNameCellStyle = isHighlightedParam ? 'highlightedParamName' : 'testName';
      const testNameCellFill = isHighlightedParam ? this.reportColor('report.simple.highlightedParamBgColor','#fff3bf') : undefined;
      const testStack:any[] = [];
      if (showSpecimen && specimen && specimenPlacement === 'above-test') testStack.push({ text: specimenText, style:'specimen', margin:[0,0,0,3] });
      testStack.push({ text: showSpecimen && specimen && specimenPlacement === 'same-line' ? `${testNameText}  ${specimenText}` : testNameText, style:testNameCellStyle });
      const method = String(item?.method || item?.method_name || item?.reference_method || '').trim();
      const methodText = methodPrefix && method ? `${methodPrefix} ${method}` : method;
      const methodUnderTest = !!(showMethod && method && methodPlacement === 'under-test');
      const specimenUnderTest = !!(showSpecimen && specimen && specimenPlacement === 'under-test');
      // When both sit under the parameter name, print one line: Specimen / Method
      if (specimenUnderTest && methodUnderTest) {
        testStack.push({ text: `${specimenText} / ${methodText}`, style:'specimen', margin:[0,6,0,0] });
      } else if (specimenUnderTest) {
        testStack.push({ text: specimenText, style:'specimen', margin:[0,6,0,0] });
      }
      const sampleId = String(item?.specimen_id || item?.sample_id || item?.sampleId || '').trim();
      if (showSampleId && sampleId) testStack.push({ text:`Sample: ${sampleId}`, style:'specimen', margin:[0,3,0,0] });
      if (methodUnderTest && !specimenUnderTest) testStack.push({ text: methodText, style:'refMethod', margin:[0,3,0,0] });

      const referenceOnly = this.reportReferenceText(item);
      const refStack:any[] = [];
      if (showMethod && method && methodPlacement === 'above-reference') refStack.push({ text: methodText, style:'refMethod' });
      if (showReference && referencePlacement === 'right-column' && referenceOnly) refStack.push(this.buildReferencePdfNode(referenceOnly, refStack.length ? [0,4,0,0] : [0,0,0,0], this.reportTableColumnBodyAlign('reference_method')));
      if (showMethod && method && methodPlacement === 'under-reference') refStack.push({ text: methodText, style:'refMethod', margin:[0,6,0,0] });

      const resultText = this.safeText(this.formatReportResultForDisplay(item, item.result_value), '-');
      const hasSeparateFlagColumn = tableColumns.includes('flag');
      
      const cellFor = (key:string): any => {
        const resultStyle = flagStylesEnabled ? this.resultStyleForReport(flag) : 'resultNormal';
        let cell:any;
        switch (key) {
          case 'test_specimen': cell = { stack:testStack }; if(testNameCellFill) cell.fillColor = testNameCellFill; break;
          case 'test': cell = { text:testNameText, style:testNameCellStyle }; if(testNameCellFill) cell.fillColor = testNameCellFill; break;
          case 'specimen': cell = { text: showSpecimen ? specimenText : '', style:'specimen' }; break;
          // Separate Flag column: Result is value-only. Combined layout only when
          // arrangement uses result_flag without a Flag column.
          case 'result_flag': cell = hasSeparateFlagColumn
            ? { text:resultText, style:resultStyle }
            : this.buildResultFlagCell(resultText, flag, resultStyle); break;
          case 'result': cell = { text:resultText, style:resultStyle }; break;
          case 'flag': cell = hasSeparateFlagColumn ? this.buildReportFlagCell(flag) : { text:'' }; break;
          case 'unit': cell = { text:this.safeText(item.unit, ''), style:'tableData' }; break;
          case 'reference_method': cell = { stack:refStack.length ? refStack : [{text:''}] }; break;
          case 'reference': cell = this.buildReferencePdfNode(referenceOnly, [0,0,0,0], this.reportTableColumnBodyAlign('reference')); break;
          case 'method': cell = { text: showMethod ? methodText : '', style:'refMethod' }; break;
          default: cell = { text:'', style:'tableData' };
        }
        return cell;
      };
      const rawRow = tableColumns.map(cellFor);
      const rowLineCounts = rawRow.map((cell:any) => this.reportTableBodyCellLineCount(cell));
      const rowMaxLines = Math.max(1, ...rowLineCounts);
      tableBody.push(rawRow.map((cell:any, index:number) => this.applyReportTableBodyAlignment(cell, tableColumns[index], rowMaxLines, rowLineCounts[index])));
      lastRenderedProfileId = currentProfileId;
      if (currentDepartmentId > 0) lastRenderedDepartmentId = currentDepartmentId;
      if (currentDepartmentName) lastRenderedDepartmentName = currentDepartmentName;
      if (this.interpretationAllowed('test') && Number(item.interpretation_enabled || 0) === 1 && this.hasPrintableHtml(item.interpretation_text)) {
        tableBody.push(spanRow({ stack:this.buildInterpretationPdfNodes(item.interpretation_text, testNameText), colSpan:tableColumns.length }));
      }
      if (this.remarksAllowed() && this.hasPrintableHtml(item.recheck_remarks)) {
        tableBody.push(spanRow({ stack:this.buildRemarksPdfNodes(item.recheck_remarks), colSpan:tableColumns.length }));
      }
    }
    flushAllProfileInterpretations();

    if (tableBody.length === 1) {
      tableBody.push(spanRow({ text:'No approved report items found', colSpan:tableColumns.length, alignment:'center', margin:[0,8,0,8], color:'#64748b' }));
    }

    const content:any[] = [];
    const bodyTopMm = this.reportNumber('report.simple.mainBodyMarginTopMm', 0, 0, 100);
    if (bodyTopMm > 0) content.push({ text: '', margin: [0, this.mmToPt(bodyTopMm), 0, 0] });
    const bodyPatientBlocks = this.buildReportPatientBlock(r, computed, 'body');
    if (bodyPatientBlocks.length) {
      content.push(...this.reportHrBlocks('before-patient'));
      content.push(...bodyPatientBlocks);
      content.push(...this.reportHrBlocks('after-patient'));
      const patientGapMm = this.reportNumber('report.simple.patientDetailsGapMm', 0, 0, 100);
      if (patientGapMm > 0) content.push({ text: '', margin: [0, 0, 0, this.mmToPt(patientGapMm)] });
    }
    content.push(...this.reportHrBlocks('before-title'));
    if (showReportTitle && reportTitleText.trim()) {
      content.push({ text: reportTitleText, style:'reportTitle', margin:[0,0,0,this.mmToPt(this.reportNumber('report.simple.reportTitleMarginBottomMm', 2), 6)] });
    }
    const subtitle = this.reportSetting('report.simple.reportSubtitleText', 'Analyzed on Horiba Yumizen CA 40 [Semi Automated Biochemistry Analyzer]').trim();
    if (subtitle) content.push({ text: subtitle, style:'analyzedText', margin:[0,0,0,this.mmToPt(this.reportNumber('report.simple.reportSubtitleMarginBottomMm', 1.4), 4)] });
    content.push(...this.reportHrBlocks('after-title'));
    content.push(...this.reportHrBlocks('before-table'));
    tableBodies.forEach((body:any[], index:number) => {
      // Skip accidental header-only tables (can happen with stacked page-breaks).
      if (!body.length || (index > 0 && body.length <= 1)) return;
      const breakReason = String(tableBreakReasons[index] || '');
      const nextBreakReason = String(tableBreakReasons[index + 1] || '');
      const showContinued = (nextBreakReason === 'profile' || nextBreakReason === 'category') && body.length > 1;
      const tableBottomMm = showContinued
        ? Math.min(2, this.reportNumber('report.simple.tableMarginBottomMm', 6))
        : this.reportNumber('report.simple.tableMarginBottomMm', 6);
      const topMm = this.reportNumber('report.simple.tableMarginTopMm', 2);
      content.push({
        pageBreak: index > 0 && ['profile', 'category', 'test'].includes(breakReason) ? 'before' : undefined,
        margin:[this.mmToPt(this.reportNumber('report.simple.tableMarginLeftMm', 0, 0, 100), 0), this.mmToPt(topMm, 0), this.mmToPt(this.reportNumber('report.simple.tableMarginRightMm', 0, 0, 100), 0), this.mmToPt(tableBottomMm, showContinued ? 6 : 18)],
        // Clone widths per table — shared arrays can be mutated by pdfmake across page-break tables.
        table:{ headerRows: 1, dontBreakRows:true, keepWithHeaderRows: 1, widths: Array.isArray(tableWidths) ? [...tableWidths] : tableWidths, body },
        layout:this.reportTableLayout()
      });
      if (showContinued) {
        content.push({
          id: `lims-continued-${index}`,
          text: 'Continued on next page…',
          style: 'continuedNotice',
          alignment: 'right',
          margin: [0, this.mmToPt(1.5), 0, this.mmToPt(1)]
        });
      }
    });

    content.push(...this.reportHrBlocks('end'));
    const endText = this.reportSetting('report.simple.endReportText', '-------------------------- END OF REPORT --------------------------');
    if (this.reportBool('report.simple.endReportEnabled', true) && endText.trim()) {
      content.push({ text:endText, style:'endReport', margin:[0,this.mmToPt(this.reportNumber('report.simple.endReportMarginTopMm', 7), 22),0,this.mmToPt(this.reportNumber('report.simple.endReportMarginBottomMm', 7), 40)] });
    }
    content.push(...this.buildReportLabSignatureBlock(options));
    content.push(...this.buildReportDisclaimerBlock('body'));


    const doc:any = {
      pageSize: this.reportPageSize(),
      pageOrientation: String(this.reportSetting('report.simple.orientation', 'portrait')) === 'landscape' ? 'landscape' : 'portrait',
      pageMargins: this.reportPageMargins(),
      background: isReportCancelled
        ? (_currentPage:number, pageSize:any) => ({ text:'CANCELLED', color:'#ef4444', opacity:0.10, bold:true, fontSize:90, alignment:'center', absolutePosition:{ x:0, y:pageSize.height/2-70 } })
        : this.reportBackground(withBackground),
      defaultStyle:{ font: this.reportDefaultFont(), fontSize:this.reportNumber('report.simple.defaultFontSize', 10, 5, 32), color:this.reportColor('report.simple.defaultColor', '#0f172a') },
      header:(currentPage:number, pageCount:number)=> options?.show_header === false ? {text:''} : ({ margin:[this.reportPageMargins()[0], this.mmToPt(this.reportNumber('report.simple.marginTopMm', 15, 0, 100) + this.reportNumber('report.simple.headerMarginTopMm', 0, 0, 60),43), this.reportPageMargins()[2], 0], stack:this.buildReportHeaderBlock(r, computed) }),
      footer:this.buildReportFooterBlock(),
      content,
      styles:{
        categoryHeader:{ ...this.reportStyle('groupHeaderStyle',{bold:true,fontSize:11,color:'#0F3E82'}), fillColor:this.reportColor('report.simple.groupHeaderBgColor','#E6EEF9') },
        sectionHeader:{ ...this.reportStyle('sectionHeaderStyle',{bold:true,fontSize:10,color:'#244C87'}), fillColor:this.reportColor('report.simple.sectionHeaderBgColor','#F3F6FB') },
        columnHeader:{ ...this.reportStyle('tableHeaderStyle',{bold:true,fontSize:10,color:'#1756AD'}), fillColor:this.reportColor('report.simple.tableHeaderBgColor','#F7FAFF') },
        testName:this.reportStyle('testNameStyle',{bold:true,fontSize:11,color:'#111111'}),
        highlightedParamName:this.reportStyle('highlightedParamStyle',{bold:true,fontSize:11,color:this.reportColor('report.simple.highlightedParamTextColor','#111111')}),
        specimen:this.reportStyle('specimenStyle',{italics:true,fontSize:9,color:'#6e6e6e'}),
        refMain:this.reportStyle('referenceStyle',{bold:true,fontSize:11,color:'#111111',alignment:'right'}),
        refMethod:this.reportStyle('methodStyle',{italics:true,fontSize:8,color:'#777777',alignment:'right'}),
        reportTitle:this.reportStyle('headerStyle',{bold:true,fontSize:11,alignment:'center',color:'#1756AD'}),
        analyzedText:this.reportStyle('subtitleStyle',{fontSize:9,alignment:'center',color:'#444444',italics:true}),
        endReport:this.reportStyle('endReportStyle',{bold:true,fontSize:10,alignment:'center',color:'#c00'}),
        continuedNotice:{ italics:true, fontSize:8, color:'#64748b' },
        tableData:this.reportStyle('tableDataStyle',{fontSize:10,color:'#111111'}),
        arrowHigh:{...this.reportStyle('flagStyle',{bold:true,fontSize:11,color:'#111111',fontFamily:'NotoSansSymbols'}), color:this.reportColor('report.simple.highColor','#c00')},
        arrowLow:{...this.reportStyle('flagStyle',{bold:true,fontSize:11,color:'#111111',fontFamily:'NotoSansSymbols'}), color:this.reportColor('report.simple.lowColor','#00c')},
        arrowNormal:this.reportStyle('flagStyle',{bold:true,fontSize:11,color:'#111111',fontFamily:'NotoSansSymbols'}),
        interpretation:this.reportStyle('interpretationStyle',{fontSize:9,color:'#111111'}),
        remarks:this.reportStyle('remarksStyle',{fontSize:9,color:'#111111'}),
        resultHigh:{...this.reportStyle('tableDataStyle',{fontSize:12,color:'#111111'}), bold:true, fontSize:this.reportNumber('report.simple.resultAbnormalFontSize',13,6,30),color:this.reportColor('report.simple.highColor','#c00')},
        resultLow:{...this.reportStyle('tableDataStyle',{fontSize:12,color:'#111111'}), bold:true, fontSize:this.reportNumber('report.simple.resultAbnormalFontSize',13,6,30),color:this.reportColor('report.simple.lowColor','#00c')},
        resultNormal:{...this.reportStyle('tableDataStyle',{fontSize:12,color:'#111111'}), fontSize:this.reportNumber('report.simple.resultFontSize',12,6,30)}
      }
    };

    let file: string;
    if (shouldExportPdf) {
      const exportDir = this.reportExportDir();
      this.cleanupLegacyTimestampedReportPdfs(exportDir, r);
      file = path.join(exportDir, this.buildReportPdfFileName(r, computed));
    } else {
      this.cleanupOldTempReportPdfs();
      const safeBill = this.safeReportFilePart(r.bill_no || r.report_no || String(reportOrBillId || 'preview'), 'preview', 80);
      file = path.join(this.reportTempDir(), `report-temp-${safeBill}-${Date.now()}.pdf`);
    }
    const backgroundImagePath = this.safeImagePath(this.reportSetting('report.simple.backgroundImagePath', ''));
    // Keep this normalization identical to reportBackground(). Older databases
    // may contain values such as "full-page" or "fullPage". The normal
    // renderer already treats every non-watermark value as full page, so the
    // Multiply path must do the same instead of requiring the exact text
    // "full_page".
    const rawBackgroundArea = String(this.reportSetting('report.simple.backgroundImageArea', 'full_page'))
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, '_');
    const backgroundArea = rawBackgroundArea === 'body_watermark' ? 'body_watermark' : 'full_page';
    const useFlattenedMultiply = withBackground === true
      && !isReportCancelled
      && !!backgroundImagePath
      && backgroundArea === 'full_page'
      && this.reportBool('report.simple.backgroundEnabled', this.org().background);

    if (useFlattenedMultiply) {
      try {
        await this.writePdfFileWithFlattenedMultiplyBackground(doc, file, backgroundImagePath, {
          fit: this.reportSetting('report.simple.backgroundImageFit', 'cover'),
          opacity: this.reportNumber('report.simple.backgroundImageOpacity', 1, 0.01, 1),
          offsetXPt: this.mmToPt(this.reportNumber('report.simple.backgroundImageOffsetXMm', 0, -100, 100)),
          offsetYPt: this.mmToPt(this.reportNumber('report.simple.backgroundImageOffsetYMm', 0, -100, 100)),
          dpi: 300,
          onProgress: typeof options?.reportProgress === 'function' ? options.reportProgress : undefined
        });
        console.info('[report] Flattened Multiply background applied:', file);
      } catch (error) {
        // Never block report delivery if the optional raster compositor fails.
        // Fall back to the existing pdfMake background output unchanged.
        console.warn('[report] Multiply background composition failed; using normal background output.', error);
        try { if (fs.existsSync(file)) fs.unlinkSync(file); } catch {}
        await this.writePdfFile(doc, file);
      }
    } else {
      await this.writePdfFile(doc, file);
    }
    return file;
  }

  async createReportSettingsPreviewPdf(mode:string = 'profile', withBackground:boolean = true, options:any = {}) {
    const previewMode = String(mode || 'profile').toLowerCase() === 'single' ? 'single' : 'profile';
    return this.createReportPdf(-1, withBackground, { ...options, previewMode, pdfOutputMode:'preview' });
  }

  protected buildReportSettingsPreviewReport(mode:string) {
    const now = new Date();
    const base:any = {
      id: -1,
      bill_no: mode === 'single' ? 'PREVIEW-SINGLE' : 'PREVIEW-PROFILE',
      report_no: mode === 'single' ? 'RPT-PREVIEW-SINGLE' : 'RPT-PREVIEW-PROFILE',
      status: 'APPROVED',
      patient_name: 'Preview Patient',
      patient_no: 'PAT-0001',
      age: '32 Years',
      gender: 'Male',
      consultant_name: 'Dr. Reference',
      ref_by: 'Dr. Reference',
      referred_by: 'Dr. Reference',
      collected_at: now,
      reported_at: now,
      approved_at: now,
      updated_at: now,
      bill_date: now,
      show_profile_name_on_report: 1,
      show_sub_header_on_report: 1,
      items: [] as any[]
    };

    if (mode === 'single') {
      base.items = [
        { test_id: 1, department_name: 'BIOCHEMISTRY', test_name: 'Glucose - Fasting', result_value: '96', unit: 'mg/dL', normal_range: '70 - 110', method: 'GOD-POD', specimen_name: 'Blood', interpretation_enabled: 1, interpretation_text: '<p><b>Clinical note:</b> Fasting glucose is within expected limits.</p>' },
        { test_id: 2, department_name: 'BIOCHEMISTRY', test_name: 'Creatinine', result_value: '1.10', unit: 'mg/dL', normal_range: '0.7 - 1.3', method: 'Jaffe', specimen_name: 'Serum', recheck_remarks: 'Sample slightly hemolyzed; repeat if clinically indicated.' }
      ];
      return base;
    }

    const profileItems:any[] = [
      { test_id: null, test_name: 'COMPLETE BLOOD COUNT', heading_kind: 'PROFILE', source_profile_name: 'COMPLETE BLOOD COUNT', profile_interpretation_enabled: 1, profile_interpretation_text: '<p><b>CBC Interpretation:</b> Correlate with clinical history and peripheral smear findings.</p>' },
      { test_id: 11, department_name: 'HEMATOLOGY', test_name: 'Hemoglobin', result_value: '13.5', unit: 'g/dL', normal_range: '13.0 - 17.0', method: 'SLS', specimen_name: 'Whole Blood' },
      { test_id: 12, department_name: 'HEMATOLOGY', test_name: 'Total WBC Count', result_value: '8500', unit: '/cumm', normal_range: '4000 - 11000', method: 'Impedance', specimen_name: 'Whole Blood' },
      { test_id: 13, department_name: 'HEMATOLOGY', test_name: 'RBC Count', result_value: '4.82', unit: 'mill/cumm', normal_range: '4.5 - 5.5', method: 'Impedance', specimen_name: 'Whole Blood' },
      { test_id: 14, department_name: 'HEMATOLOGY', test_name: 'Hematocrit / PCV', result_value: '42.0', unit: '%', normal_range: '40 - 50', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: 15, department_name: 'HEMATOLOGY', test_name: 'MCV', result_value: '87.1', unit: 'fL', normal_range: '80 - 100', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: 16, department_name: 'HEMATOLOGY', test_name: 'MCH', result_value: '28.0', unit: 'pg', normal_range: '27 - 32', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: 17, department_name: 'HEMATOLOGY', test_name: 'MCHC', result_value: '32.1', unit: 'g/dL', normal_range: '32 - 36', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: 18, department_name: 'HEMATOLOGY', test_name: 'RDW-CV', result_value: '13.2', unit: '%', normal_range: '11.5 - 14.5', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: 19, department_name: 'HEMATOLOGY', test_name: 'Platelet Count', result_value: '1.45', unit: 'lakhs/cumm', normal_range: '1.5 - 4.5', method: 'Impedance', specimen_name: 'Whole Blood' },
      { test_id: 20, department_name: 'HEMATOLOGY', test_name: 'MPV', result_value: '9.8', unit: 'fL', normal_range: '7.5 - 11.5', method: 'Calculated', specimen_name: 'Whole Blood' },
      { test_id: null, test_name: 'DIFFERENTIAL COUNT', heading_kind: 'INNER' },
      { test_id: 21, department_name: 'HEMATOLOGY', test_name: 'Neutrophils', result_value: '62', unit: '%', normal_range: '40 - 70', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 22, department_name: 'HEMATOLOGY', test_name: 'Lymphocytes', result_value: '32', unit: '%', normal_range: '20 - 40', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 23, department_name: 'HEMATOLOGY', test_name: 'Monocytes', result_value: '04', unit: '%', normal_range: '2 - 8', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 24, department_name: 'HEMATOLOGY', test_name: 'Eosinophils', result_value: '02', unit: '%', normal_range: '1 - 6', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 25, department_name: 'HEMATOLOGY', test_name: 'Basophils', result_value: '00', unit: '%', normal_range: '0 - 1', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: null, test_name: 'PERIPHERAL SMEAR', heading_kind: 'INNER' },
      { test_id: 26, department_name: 'HEMATOLOGY', test_name: 'RBC Morphology', result_value: 'Normocytic Normochromic', unit: '', normal_range: '', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 27, department_name: 'HEMATOLOGY', test_name: 'WBC Morphology', result_value: 'Within normal limits', unit: '', normal_range: '', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: 28, department_name: 'HEMATOLOGY', test_name: 'Platelet Morphology', result_value: 'Adequate', unit: '', normal_range: '', method: 'Microscopy', specimen_name: 'Smear' },
      { test_id: null, test_name: 'LIVER FUNCTION PROFILE', heading_kind: 'PROFILE', source_profile_name: 'LIVER FUNCTION PROFILE' },
      { test_id: 31, department_name: 'BIOCHEMISTRY', test_name: 'Total Bilirubin', result_value: '0.8', unit: 'mg/dL', normal_range: '0.2 - 1.2', method: 'Diazo', specimen_name: 'Serum' },
      { test_id: 32, department_name: 'BIOCHEMISTRY', test_name: 'Direct Bilirubin', result_value: '0.2', unit: 'mg/dL', normal_range: '0.0 - 0.3', method: 'Diazo', specimen_name: 'Serum' },
      { test_id: 33, department_name: 'BIOCHEMISTRY', test_name: 'Indirect Bilirubin', result_value: '0.6', unit: 'mg/dL', normal_range: '0.2 - 0.9', method: 'Calculated', specimen_name: 'Serum' },
      { test_id: 34, department_name: 'BIOCHEMISTRY', test_name: 'SGOT / AST', result_value: '28', unit: 'U/L', normal_range: '0 - 40', method: 'IFCC', specimen_name: 'Serum' },
      { test_id: 35, department_name: 'BIOCHEMISTRY', test_name: 'SGPT / ALT', result_value: '31', unit: 'U/L', normal_range: '0 - 41', method: 'IFCC', specimen_name: 'Serum' },
      { test_id: 36, department_name: 'BIOCHEMISTRY', test_name: 'Alkaline Phosphatase', result_value: '82', unit: 'U/L', normal_range: '40 - 129', method: 'IFCC', specimen_name: 'Serum' },
      { test_id: 37, department_name: 'BIOCHEMISTRY', test_name: 'Total Protein', result_value: '7.2', unit: 'g/dL', normal_range: '6.4 - 8.3', method: 'Biuret', specimen_name: 'Serum' },
      { test_id: 38, department_name: 'BIOCHEMISTRY', test_name: 'Albumin', result_value: '4.4', unit: 'g/dL', normal_range: '3.5 - 5.2', method: 'BCG', specimen_name: 'Serum' },
      { test_id: 39, department_name: 'BIOCHEMISTRY', test_name: 'Globulin', result_value: '2.8', unit: 'g/dL', normal_range: '2.0 - 3.5', method: 'Calculated', specimen_name: 'Serum' },
      { test_id: 40, department_name: 'BIOCHEMISTRY', test_name: 'A/G Ratio', result_value: '1.57', unit: '', normal_range: '1.0 - 2.2', method: 'Calculated', specimen_name: 'Serum' },
      { test_id: null, test_name: 'RENAL FUNCTION PROFILE', heading_kind: 'PROFILE', source_profile_name: 'RENAL FUNCTION PROFILE' },
      { test_id: 41, department_name: 'BIOCHEMISTRY', test_name: 'Urea', result_value: '28', unit: 'mg/dL', normal_range: '15 - 45', method: 'Urease', specimen_name: 'Serum' },
      { test_id: 42, department_name: 'BIOCHEMISTRY', test_name: 'Creatinine', result_value: '1.10', unit: 'mg/dL', normal_range: '0.7 - 1.3', method: 'Jaffe', specimen_name: 'Serum' },
      { test_id: 43, department_name: 'BIOCHEMISTRY', test_name: 'Uric Acid', result_value: '5.4', unit: 'mg/dL', normal_range: '3.5 - 7.2', method: 'Uricase', specimen_name: 'Serum' },
      { test_id: 44, department_name: 'BIOCHEMISTRY', test_name: 'Sodium', result_value: '139', unit: 'mmol/L', normal_range: '135 - 145', method: 'ISE', specimen_name: 'Serum' },
      { test_id: 45, department_name: 'BIOCHEMISTRY', test_name: 'Potassium', result_value: '4.2', unit: 'mmol/L', normal_range: '3.5 - 5.1', method: 'ISE', specimen_name: 'Serum' },
      { test_id: 46, department_name: 'BIOCHEMISTRY', test_name: 'Chloride', result_value: '102', unit: 'mmol/L', normal_range: '98 - 107', method: 'ISE', specimen_name: 'Serum' }
    ];
    base.items = profileItems;
    return base;
  }

  protected resultFlag(i:any, criticalEnabled = false): string {
    if (Number(i?.flag_enabled ?? 1) === 0) return '';
    const explicit = String(i?.flag || i?.result_flag || i?.flag_status || '').trim().toUpperCase();
    const value = Number(String(i?.result_value ?? '').replace(/[^0-9.+-]/g, ''));
    if (criticalEnabled && Number.isFinite(value)) {
      const cLow = i?.critical_low === null || i?.critical_low === undefined || i?.critical_low === '' ? null : Number(i.critical_low);
      const cHigh = i?.critical_high === null || i?.critical_high === undefined || i?.critical_high === '' ? null : Number(i.critical_high);
      if (cHigh !== null && Number.isFinite(cHigh) && value >= cHigh) return 'CH';
      if (cLow !== null && Number.isFinite(cLow) && value <= cLow) return 'CL';
      if (+i?.is_critical && ['H','HIGH'].includes(explicit)) return 'CH';
      if (+i?.is_critical && ['L','LOW'].includes(explicit)) return 'CL';
    }
    if (explicit) return explicit;
    // Do not derive H/L from printed normal_range text here. Multiline reference
    // text is display-only and may contain many ranges. Flags must come from
    // database-selected reference row limits and be stored as flag_status before PDF rendering.
    return '';
  }

  protected arrowForReportFlag(flag:string): string {
    const f = String(flag || '').toUpperCase();
    if (['CH','CRITICAL_HIGH','CRITICAL HIGH','HH'].includes(f)) return this.reportFlagOutputText('CH');
    if (['CL','CRITICAL_LOW','CRITICAL LOW','LL'].includes(f)) return this.reportFlagOutputText('CL');
    if (['H','HIGH','CR','C','CRIT','CRITICAL'].includes(f)) return this.reportFlagOutputText('H');
    if (['L','LOW'].includes(f)) return this.reportFlagOutputText('L');
    return '';
  }

  protected arrowStyleForReport(flag:string): string {
    const f = String(flag || '').toUpperCase();
    if (['CH','CRITICAL_HIGH','CRITICAL HIGH','HH','H','HIGH','CR','C','CRIT','CRITICAL'].includes(f)) return 'arrowHigh';
    if (['CL','CRITICAL_LOW','CRITICAL LOW','LL','L','LOW'].includes(f)) return 'arrowLow';
    return 'arrowNormal';
  }

  protected resultStyleForReport(flag:string): string {
    const f = String(flag || '').toUpperCase();
    if (['CH','CRITICAL_HIGH','CRITICAL HIGH','HH','H','HIGH','CR','C','CRIT','CRITICAL'].includes(f)) return 'resultHigh';
    if (['CL','CRITICAL_LOW','CRITICAL LOW','LL','L','LOW'].includes(f)) return 'resultLow';
    return 'resultNormal';
  }

  protected money(value:any) { return (+value || 0).toFixed(2); }

  protected inr(value:any) { return `₹${this.money(value)}`; }
  protected dateTimeSettings() {
    const s = this.db.getSettings();
    return {
      timeZone: s['display.timeZone'] || 'Asia/Kolkata',
      dateFormat: s['display.dateFormat'] || 'dd-MM-yyyy',
      timeFormat: s['display.timeFormat'] || '24h'
    };
  }
  protected fmtDateOnly(value:any) {
    const p = this.dateParts(value);
    if (!p) return '-';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const format = this.dateTimeSettings().dateFormat;
    if (format === 'dd/MM/yyyy') return `${p.d}/${p.mo}/${p.y}`;
    if (format === 'yyyy-MM-dd') return `${p.y}-${p.mo}-${p.d}`;
    if (format === 'dd MMM yyyy') return `${p.d} ${months[Number(p.mo)-1] || p.mo} ${p.y}`;
    if (format === 'MMM dd, yyyy') return `${months[Number(p.mo)-1] || p.mo} ${p.d}, ${p.y}`;
    return `${p.d}-${p.mo}-${p.y}`;
  }
  protected fmtTimeOnly(value:any) {
    const p = this.dateParts(value);
    if (!p) return '';
    if (this.dateTimeSettings().timeFormat === '12h') {
      const h = Number(p.h);
      return `${String(h % 12 || 12).padStart(2,'0')}:${p.mi} ${h >= 12 ? 'PM' : 'AM'}`;
    }
    return `${p.h}:${p.mi}`;
  }
  protected fmtDate(value:any) {
    if (!value) return '-';
    const d = this.fmtDateOnly(value);
    const t = this.fmtTimeOnly(value);
    return d && t ? `${d} ${t}` : d || '-';
  }
  protected dateParts(value:any): { y:string; mo:string; d:string; h:string; mi:string } | null {
    if (!value) return null;
    if (value instanceof Date) return this.datePartsFromDate(value);
    const text = String(value).trim();
    const wall = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?)?(?!\s*(?:Z|[+-]\d{2}:?\d{2}))/);
    if (wall) return { y: wall[1], mo: wall[2], d: wall[3], h: wall[4] || '00', mi: wall[5] || '00' };
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return this.datePartsFromDate(d);
  }
  protected datePartsFromDate(d:Date): { y:string; mo:string; d:string; h:string; mi:string } {
    const map:any = {};
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: this.dateTimeSettings().timeZone || 'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(d);
    for (const part of parts) if (part.type !== 'literal') map[part.type] = part.value;
    return { y: map.year, mo: map.month, d: map.day, h: map.hour, mi: map.minute };
  }
  protected safeText(value:any, fallback='-') { const v = value === undefined || value === null ? '' : String(value).trim(); return v || fallback; }
  protected statusLabel(b:any) {
    const paid = +b.paid || 0;
    const total = +b.total || 0;
    const due = +b.due || 0;
    const excess = Math.max(0, paid - total);
    if (String(b.status || '').toUpperCase() === 'CANCELLED') return 'CANCELLED';
    if (paid <= 0) return 'PENDING';
    if (excess > 0) return 'EXCESS PAID';
    if (due > 0) return 'PARTIAL PAID';
    return 'PAID';
  }


}
