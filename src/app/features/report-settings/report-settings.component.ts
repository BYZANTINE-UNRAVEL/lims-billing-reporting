import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

type ReportSettingsStepId = 'page' | 'font' | 'headerFooter' | 'patient' | 'body' | 'table' | 'rules' | 'signatures' | 'background';
type ReportFontFamily = 'Roboto' | 'Inter' | 'Lato' | 'NotoSans' | 'NotoSerif' | 'NotoSansTamil' | 'NotoSansDevanagari' | 'NotoSansMalayalam' | 'NotoSansKannada' | 'NotoSansTelugu' | 'NotoSansBengali' | 'NotoSansSymbols' | 'NotoSansSymbols2' | 'Poppins' | 'Montserrat' | 'OpenSans' | 'NunitoSans' | 'SourceSans3' | 'Merriweather' | 'LibreBaskerville' | 'Lora';
type ReportAlignment = 'left' | 'center' | 'right';
type ReportFlagMode = 'none' | 'range_only' | 'flag_only' | 'flag_abnormal' | 'critical_flag_abnormal';
type ReportFlagDisplayMode = 'text' | 'symbol' | 'drawn_arrow' | 'custom';
type ReportFlagSymbolPreset = 'text' | 'arrows' | 'triangles' | 'plus_minus' | 'custom';
type ReportBackgroundImageArea = 'full_page' | 'body_watermark';
type ReportBackgroundBlendPreset = 'normal' | 'light' | 'very_light' | 'faint' | 'custom';
type ReportBackgroundImageFit = 'cover' | 'contain' | 'stretch';
type ReportInterpretationSource = 'test' | 'profile' | 'both';
type ReportInterpretationPlacement = 'after-test' | 'after-profile' | 'end-of-group';
type ReportReferenceSource = 'saved' | 'generated_only';
type ReportTextStyle = { fontFamily: ReportFontFamily; fontSize: number; bold: boolean; italic: boolean; underline?: boolean; color: string };
type PatientReferencePlacement = 'right-column' | 'under-test';
type PatientMethodPlacement = 'under-reference' | 'above-reference' | 'under-test' | 'separate-column' | 'hidden';
type PatientSpecimenPlacement = 'under-test' | 'above-test' | 'same-line' | 'separate-column' | 'hidden';
type ReportColorKey = 'tableHeaderBgColor' | 'groupHeaderBgColor' | 'sectionHeaderBgColor' | 'highlightedParamTextColor' | 'highlightedParamBgColor' | 'patientDetailsBorderColor' | 'patientDetailsBgColor' | 'tableBorderColor' | 'highColor' | 'lowColor' | 'disclaimerBgColor' | 'interpretationBgColor' | 'remarksBgColor';
type DisclaimerPlacement = 'hidden' | 'footer' | 'above-footer';
type PatientSecondColumnMode = 'manual' | 'right-end';
type ReportTableColumnKey = 'test_specimen' | 'test' | 'specimen' | 'result_flag' | 'result' | 'flag' | 'unit' | 'reference_method' | 'reference' | 'method';

interface SimpleReportSettings {
  pageSize: 'A4' | 'A5' | 'LETTER' | 'LEGAL';
  orientation: 'portrait' | 'landscape';
  marginTopMm: number; marginRightMm: number; marginBottomMm: number; marginLeftMm: number;
  tableParamPct: number; tableAnalysedPct: number; tableUnitPct: number; tableRangePct: number;
  tableColumnArrangement: string; tableFlagsEnabled: boolean; tableShowFlagColumn: boolean; tableFlagMode: ReportFlagMode; tableFlagDisplayMode: ReportFlagDisplayMode; tableFlagSymbolPreset: ReportFlagSymbolPreset; highFlagText: string; lowFlagText: string; criticalHighFlagText: string; criticalLowFlagText: string; tableFlagDrawnArrowSizeMm: number; tableFlagDrawnArrowStrokeWidth: number; referenceSource: ReportReferenceSource;
  interpretationEnabled: boolean; interpretationSource: ReportInterpretationSource; interpretationPlacement: ReportInterpretationPlacement; interpretationLabel: string; interpretationShowLabel: boolean; interpretationShowBorder: boolean; interpretationBgColor: string; interpretationMarginTopMm: number; interpretationMarginBottomMm: number;
  remarksEnabled: boolean; remarksLabel: string; remarksShowLabel: boolean; remarksShowBorder: boolean; remarksBgColor: string; remarksMarginTopMm: number; remarksMarginBottomMm: number;
  profileRemarksEnabled: boolean; profileRemarksLabel: string; profileRemarksShowLabel: boolean; profileRemarksShowBorder: boolean; profileRemarksBgColor: string; profileRemarksMarginTopMm: number; profileRemarksMarginBottomMm: number;
  tableTestSpecimenLabel: string; tableTestLabel: string; tableSpecimenLabel: string; tableResultFlagLabel: string; tableResultLabel: string; tableFlagLabel: string; tableUnitLabel: string; tableReferenceMethodLabel: string; tableReferenceLabel: string; tableMethodLabel: string;
  tableTestSpecimenPct: number; tableTestPct: number; tableSpecimenPct: number; tableResultFlagPct: number; tableResultPct: number; tableFlagPct: number; tableUnitWidthPct: number; tableReferenceMethodPct: number; tableReferencePct: number; tableMethodPct: number;
  tableTestSpecimenHeaderAlign: ReportAlignment; tableTestHeaderAlign: ReportAlignment; tableSpecimenHeaderAlign: ReportAlignment; tableResultFlagHeaderAlign: ReportAlignment; tableResultHeaderAlign: ReportAlignment; tableFlagHeaderAlign: ReportAlignment; tableUnitHeaderAlign: ReportAlignment; tableReferenceMethodHeaderAlign: ReportAlignment; tableReferenceHeaderAlign: ReportAlignment; tableMethodHeaderAlign: ReportAlignment;
  tableTestSpecimenBodyAlign: ReportAlignment; tableTestBodyAlign: ReportAlignment; tableSpecimenBodyAlign: ReportAlignment; tableResultFlagBodyAlign: ReportAlignment; tableResultBodyAlign: ReportAlignment; tableFlagBodyAlign: ReportAlignment; tableUnitBodyAlign: ReportAlignment; tableReferenceMethodBodyAlign: ReportAlignment; tableReferenceBodyAlign: ReportAlignment; tableMethodBodyAlign: ReportAlignment;
  tableTestSpecimenBodyVerticalCenter: boolean; tableTestBodyVerticalCenter: boolean; tableSpecimenBodyVerticalCenter: boolean; tableResultFlagBodyVerticalCenter: boolean; tableResultBodyVerticalCenter: boolean; tableFlagBodyVerticalCenter: boolean; tableUnitBodyVerticalCenter: boolean; tableReferenceMethodBodyVerticalCenter: boolean; tableReferenceBodyVerticalCenter: boolean; tableMethodBodyVerticalCenter: boolean;
  tableArrowWidthMm: number; tableSafetyMm: number; tablePaddingLeftMm: number; tablePaddingRightMm: number; tablePaddingTopMm: number; tablePaddingBottomMm: number;

  headerFixedHeightMm: number; footerFixedHeightMm: number; headerLineGapMm: number; footerLineGapMm: number;
  headerMarginTopMm: number; headerMarginBottomMm: number; footerMarginTopMm: number; footerMarginBottomMm: number; footerMarginLeftMm: number; footerMarginRightMm: number;
  mainBodyMarginTopMm: number; mainBodyMarginBottomMm: number; tableMarginTopMm: number; tableMarginBottomMm: number; tableMarginLeftMm: number; tableMarginRightMm: number;
  headerLogoEnabled: boolean; headerLogoPath: string; headerLogoWidthMm: number; headerLogoHeightMm: number;
  headerLogoPlacement: ReportAlignment; headerLogoOffsetXMm: number; headerLogoOffsetYMm: number;
  institutionName: string; institutionSubText: string; institutionTextPlacement: ReportAlignment;
  institutionNameOffsetXMm: number; institutionNameOffsetYMm: number; institutionSubTextOffsetXMm: number; institutionSubTextOffsetYMm: number;
  institutionNameStyle: ReportTextStyle; institutionSubTextStyle: ReportTextStyle;
  addressText: string; addressPlacement: 'header' | 'footer'; addressAlignment: ReportAlignment; addressStyle: ReportTextStyle; addressLineGapMm: number; addressOffsetXMm: number; addressOffsetYMm: number; addressMarginTopMm: number; addressMarginBottomMm: number;
  headerTextAlignment: ReportAlignment;
  footerText: string; footerTextAlignment: ReportAlignment; footerStyle: ReportTextStyle; footerTextOffsetXMm: number; footerTextOffsetYMm: number; footerTextMarginTopMm: number; footerTextMarginBottomMm: number;
  disclaimerPlacement: DisclaimerPlacement; disclaimerText: string; disclaimerAlignment: ReportAlignment; disclaimerStyle: ReportTextStyle; disclaimerBgColor: string; disclaimerWidthPct: number; disclaimerOffsetXMm: number; disclaimerOffsetYMm: number; disclaimerMarginTopMm: number; disclaimerMarginBottomMm: number; disclaimerMarginLeftMm: number; disclaimerMarginRightMm: number; disclaimerLineHeight: number; disclaimerCharacterSpacing: number; footerDisclaimerWidthPct: number; footerPageNumberWidthPct: number; footerColumnGapMm: number; footerPageNumberAlignment: ReportAlignment;

  patientDetailsPlacement: 'header' | 'body'; patientDetailsGapMm: number; patientDetailsOffsetXMm: number; patientDetailsOffsetYMm: number; patientDetailsMarginTopMm: number; patientDetailsMarginBottomMm: number; patientDetailsMarginLeftMm: number; patientDetailsMarginRightMm: number; patientDetailsPaddingTopMm: number; patientDetailsPaddingRightMm: number; patientDetailsPaddingBottomMm: number; patientDetailsPaddingLeftMm: number; patientTablePaddingTopMm: number; patientTablePaddingRightMm: number; patientTablePaddingBottomMm: number; patientTablePaddingLeftMm: number; patientTableInnerPaddingTopMm: number; patientTableInnerPaddingRightMm: number; patientTableInnerPaddingBottomMm: number; patientTableInnerPaddingLeftMm: number;
  reportTitleText: string; reportSubtitleText: string; reportTitleAlignment: ReportAlignment; reportSubtitleAlignment: ReportAlignment; titleSubtitleGapMm: number; reportTitleOffsetXMm: number; reportTitleOffsetYMm: number; reportSubtitleOffsetXMm: number; reportSubtitleOffsetYMm: number; reportTitleMarginTopMm: number; reportTitleMarginBottomMm: number; reportSubtitleMarginTopMm: number; reportSubtitleMarginBottomMm: number;
  subtitleStyle: ReportTextStyle;
  headerStyle: ReportTextStyle; bodyTextStyle: ReportTextStyle; patientLabelStyle: ReportTextStyle; patientValueStyle: ReportTextStyle;
  bodyCaptionStyle: ReportTextStyle; tableHeaderStyle: ReportTextStyle; tableDataStyle: ReportTextStyle; groupHeaderStyle: ReportTextStyle;
  testNameStyle: ReportTextStyle; specimenStyle: ReportTextStyle; referenceStyle: ReportTextStyle; methodStyle: ReportTextStyle; flagStyle: ReportTextStyle; interpretationStyle: ReportTextStyle; remarksStyle: ReportTextStyle; profileRemarksStyle: ReportTextStyle; highlightedParamStyle: ReportTextStyle;
  tableHeaderBgColor: string; groupHeaderBgColor: string; sectionHeaderBgColor: string; highlightedParamTextColor: string; highlightedParamBgColor: string;

  patientDetailsEnabled: boolean; patientDetailsFields: string; patientDetailsColumns: number; patientDetailsShowLabels: boolean; patientDetailsColonText: string; patientDetailsValueCase: 'as_entered' | 'upper' | 'title' | 'lower'; patientDetailsLabelsJson: string; patientDetailsShowTimeBilled: boolean; patientDetailsShowTimeCollected: boolean; patientDetailsShowTimeReported: boolean; patientDetailsFieldStylesJson: string;
  patientDetailsOutsideBorder: boolean; patientDetailsTopBorder: boolean; patientDetailsBottomBorder: boolean; patientDetailsLeftBorder: boolean; patientDetailsRightBorder: boolean; patientDetailsInnerBorder: boolean; patientDetailsInnerHBorder: boolean; patientDetailsInnerVBorder: boolean; patientDetailsBorderColor: string; patientDetailsBorderWidth: number; patientDetailsBgColor: string; patientDetailsLabelWidthMm: number; patientDetailsRightLabelWidthMm: number; patientDetailsRightColumnOffsetMm: number; patientDetailsColumnGapMm: number; patientDetailsSecondColumnMode: PatientSecondColumnMode; patientDetailsSecondColumnWidthMm: number; patientDetailsSecondColumnRightPaddingMm: number; patientFirstLabelWidthPct: number; patientFirstValueWidthPct: number; patientColumnGapWidthPct: number; patientSecondLabelWidthPct: number; patientSecondValueWidthPct: number;
  patientBarcodeEnabled: boolean; patientBarcodeSource: 'patient_no' | 'mrn' | 'bill_no' | 'sample_type'; patientBarcodeXMm: number; patientBarcodeYMm: number; patientBarcodeWidthMm: number; patientBarcodeHeightMm: number; patientBarcodeTextEnabled: boolean;

  referenceVisible: boolean; methodVisible: boolean; referencePlacement: PatientReferencePlacement; methodPlacement: PatientMethodPlacement; methodPrefix: string; specimenVisible: boolean; specimenPlacement: PatientSpecimenPlacement; specimenPrefix: string; collectionVisible: boolean;
  tableOutsideBorder: boolean; tableTopBorder: boolean; tableBottomBorder: boolean; tableLeftBorder: boolean; tableRightBorder: boolean; tableInnerBorder: boolean; tableInnerHBorder: boolean; tableInnerVBorder: boolean; tableBorderColor: string; tableBorderWidth: number; highColor: string; lowColor: string; resultFontSize: number; resultAbnormalFontSize: number;

  hrLinesConfig: string;
  endReportText: string; endReportAlignment: ReportAlignment; endReportMarginTopMm: number; endReportMarginBottomMm: number; endReportOffsetXMm: number; endReportOffsetYMm: number; endReportStyle: ReportTextStyle;
  labSignEnabled: boolean; labSignLabel: string; labSignText: string; labSignAlignment: ReportAlignment; labSignMarginTopMm: number; labSignMarginBottomMm: number; labSignOffsetXMm: number; labSignOffsetYMm: number; labSignStyle: ReportTextStyle;
  labSignImageEnabled: boolean; labSignImagePath: string; labSignImageWidthMm: number; labSignImageHeightMm: number; labSignImageOffsetXMm: number; labSignImageOffsetYMm: number;
  otherSignEnabled: boolean; otherSignLabel: string; otherSignText: string; otherSignAlignment: ReportAlignment; otherSignMarginTopMm: number; otherSignMarginBottomMm: number; otherSignOffsetXMm: number; otherSignOffsetYMm: number; otherSignStyle: ReportTextStyle;
  otherSignImageEnabled: boolean; otherSignImagePath: string; otherSignImageWidthMm: number; otherSignImageHeightMm: number; otherSignImageOffsetXMm: number; otherSignImageOffsetYMm: number;
  signatureAdvancedEnabled: boolean; signatureRowsJson: string; signatureRowTopMarginMm: number; signatureRowBottomMarginMm: number; signatureColumnGapMm: number; signatureImageZoneHeightMm: number; signatureImageTextGapMm: number; signatureLine1Height: number; signatureLine2Height: number; signatureLine3Height: number; signatureLine4Height: number; signatureEmptyLineMode: 'reserve' | 'compact';

  backgroundEnabled: boolean; backgroundImagePath: string; backgroundImageArea: ReportBackgroundImageArea; backgroundImageBlendPreset: ReportBackgroundBlendPreset; backgroundImageFit: ReportBackgroundImageFit; backgroundImageOpacity: number; backgroundImageWatermarkWidthPct: number; backgroundImageOffsetXMm: number; backgroundImageOffsetYMm: number;
}

const style = (fontSize: number, bold = false, color = '#111111'): ReportTextStyle => ({ fontFamily: 'Roboto', fontSize, bold, italic: false, color });
const DEFAULT_REPORT_SETTINGS: SimpleReportSettings = {
  // Defaults intentionally mirror the uploaded Angular report-pdf.service.ts design.
  pageSize: 'A4', orientation: 'portrait', marginTopMm: 15, marginRightMm: 5.3, marginBottomMm: 2, marginLeftMm: 8.8,
  tableParamPct: 34, tableAnalysedPct: 13, tableUnitPct: 10, tableRangePct: 43,
  tableColumnArrangement: 'test_specimen,result_flag,unit,reference_method', tableFlagsEnabled: true, tableShowFlagColumn: false, tableFlagMode: 'critical_flag_abnormal', tableFlagDisplayMode: 'text', tableFlagSymbolPreset: 'text', highFlagText: 'H', lowFlagText: 'L', criticalHighFlagText: 'CH', criticalLowFlagText: 'CL', tableFlagDrawnArrowSizeMm: 2.8, tableFlagDrawnArrowStrokeWidth: 1.1, referenceSource: 'saved',
  interpretationEnabled: false, interpretationSource: 'both', interpretationPlacement: 'after-test', interpretationLabel: 'Interpretation', interpretationShowLabel: true, interpretationShowBorder: false, interpretationBgColor: '#ffffff', interpretationMarginTopMm: 1.5, interpretationMarginBottomMm: 2,
  remarksEnabled: true, remarksLabel: 'Remarks', remarksShowLabel: true, remarksShowBorder: false, remarksBgColor: '#ffffff', remarksMarginTopMm: 1.5, remarksMarginBottomMm: 2,
  profileRemarksEnabled: true, profileRemarksLabel: 'Profile Remarks', profileRemarksShowLabel: true, profileRemarksShowBorder: false, profileRemarksBgColor: '#ffffff', profileRemarksMarginTopMm: 1.5, profileRemarksMarginBottomMm: 2,
  tableTestSpecimenLabel: 'Test / Specimen', tableTestLabel: 'Test', tableSpecimenLabel: 'Specimen', tableResultFlagLabel: 'Result + Flag', tableResultLabel: 'Result', tableFlagLabel: 'Flag', tableUnitLabel: 'Unit', tableReferenceMethodLabel: 'Reference / Method', tableReferenceLabel: 'Reference', tableMethodLabel: 'Method',
  tableTestSpecimenPct: 34, tableTestPct: 28, tableSpecimenPct: 10, tableResultFlagPct: 13, tableResultPct: 13, tableFlagPct: 5, tableUnitWidthPct: 10, tableReferenceMethodPct: 43, tableReferencePct: 35, tableMethodPct: 8,
  tableTestSpecimenHeaderAlign: 'left', tableTestHeaderAlign: 'left', tableSpecimenHeaderAlign: 'left', tableResultFlagHeaderAlign: 'center', tableResultHeaderAlign: 'center', tableFlagHeaderAlign: 'center', tableUnitHeaderAlign: 'center', tableReferenceMethodHeaderAlign: 'right', tableReferenceHeaderAlign: 'right', tableMethodHeaderAlign: 'right',
  tableTestSpecimenBodyAlign: 'left', tableTestBodyAlign: 'left', tableSpecimenBodyAlign: 'left', tableResultFlagBodyAlign: 'center', tableResultBodyAlign: 'center', tableFlagBodyAlign: 'center', tableUnitBodyAlign: 'center', tableReferenceMethodBodyAlign: 'right', tableReferenceBodyAlign: 'right', tableMethodBodyAlign: 'right',
  tableTestSpecimenBodyVerticalCenter: false, tableTestBodyVerticalCenter: false, tableSpecimenBodyVerticalCenter: false, tableResultFlagBodyVerticalCenter: true, tableResultBodyVerticalCenter: true, tableFlagBodyVerticalCenter: true, tableUnitBodyVerticalCenter: true, tableReferenceMethodBodyVerticalCenter: false, tableReferenceBodyVerticalCenter: false, tableMethodBodyVerticalCenter: false,
  tableArrowWidthMm: 7.1, tableSafetyMm: 0, tablePaddingLeftMm: 2.1, tablePaddingRightMm: 2.1, tablePaddingTopMm: 1.4, tablePaddingBottomMm: 1.4,
  headerFixedHeightMm: 45, footerFixedHeightMm: 18.8, headerLineGapMm: 1.5, footerLineGapMm: 1.5,
  headerMarginTopMm: 0, headerMarginBottomMm: 0, footerMarginTopMm: 0, footerMarginBottomMm: 0, footerMarginLeftMm: 8.8, footerMarginRightMm: 5.3,
  mainBodyMarginTopMm: 0, mainBodyMarginBottomMm: 0, tableMarginTopMm: 2, tableMarginBottomMm: 0, tableMarginLeftMm: 0, tableMarginRightMm: 0,
  headerLogoEnabled: false, headerLogoPath: '', headerLogoWidthMm: 70, headerLogoHeightMm: 53,
  headerLogoPlacement: 'center', headerLogoOffsetXMm: 0, headerLogoOffsetYMm: -9,
  institutionName: '', institutionSubText: '', institutionTextPlacement: 'center',
  institutionNameOffsetXMm: 0, institutionNameOffsetYMm: 0, institutionSubTextOffsetXMm: 0, institutionSubTextOffsetYMm: 0,
  institutionNameStyle: style(15, true, '#1756AD'), institutionSubTextStyle: style(9, false, '#5E7FB3'),
  addressText: '96 C/1, Subramaniyar Kovil Street, (AJ Nagar)\n Adiramapattinam - 614 701', addressPlacement: 'header', addressAlignment: 'center', addressStyle: style(10, true, '#5E7FB3'), addressLineGapMm: 1.1, addressOffsetXMm: 0, addressOffsetYMm: 0, addressMarginTopMm: 0, addressMarginBottomMm: 0,
  headerTextAlignment: 'center', footerText: 'Disclaimer: As with any diagnostic test, results should be clinically correlated. Results may vary between laboratories and methods.', footerTextAlignment: 'left', footerStyle: style(9, false, '#111111'), footerTextOffsetXMm: 0, footerTextOffsetYMm: 0, footerTextMarginTopMm: 0, footerTextMarginBottomMm: 0,
  disclaimerPlacement: 'footer', disclaimerText: 'Disclaimer: As with any diagnostic test, results should be clinically correlated. Results may vary between laboratories and methods.', disclaimerAlignment: 'center', disclaimerStyle: style(9, false, '#111111'), disclaimerBgColor: '#ffffff', disclaimerWidthPct: 100, disclaimerOffsetXMm: 0, disclaimerOffsetYMm: 0, disclaimerMarginTopMm: 0, disclaimerMarginBottomMm: 0, disclaimerMarginLeftMm: 0, disclaimerMarginRightMm: 0, disclaimerLineHeight: 1.05, disclaimerCharacterSpacing: 0, footerDisclaimerWidthPct: 82, footerPageNumberWidthPct: 18, footerColumnGapMm: 4, footerPageNumberAlignment: 'right',
  patientDetailsPlacement: 'header', patientDetailsGapMm: 6, patientDetailsOffsetXMm: 0, patientDetailsOffsetYMm: 0, patientDetailsMarginTopMm: 0, patientDetailsMarginBottomMm: 2, patientDetailsMarginLeftMm: 0, patientDetailsMarginRightMm: 0, patientDetailsPaddingTopMm: 0, patientDetailsPaddingRightMm: 0, patientDetailsPaddingBottomMm: 0, patientDetailsPaddingLeftMm: 0, patientTablePaddingTopMm: 1.2, patientTablePaddingRightMm: 1.2, patientTablePaddingBottomMm: 1.2, patientTablePaddingLeftMm: 1.2, patientTableInnerPaddingTopMm: 0, patientTableInnerPaddingRightMm: 0, patientTableInnerPaddingBottomMm: 0, patientTableInnerPaddingLeftMm: 0,
  reportTitleText: 'LABORATORY REPORT', reportSubtitleText: 'Analyzed on Horiba Yumizen CA 40 [Semi Automated Biochemistry Analyzer]', reportTitleAlignment: 'center', reportSubtitleAlignment: 'center', titleSubtitleGapMm: 1.5, reportTitleOffsetXMm: 0, reportTitleOffsetYMm: 0, reportSubtitleOffsetXMm: 0, reportSubtitleOffsetYMm: 0, reportTitleMarginTopMm: 0, reportTitleMarginBottomMm: 0.7, reportSubtitleMarginTopMm: 0, reportSubtitleMarginBottomMm: 1.4,
  subtitleStyle: style(9, false, '#444444'),
  headerStyle: style(14, true, '#1756AD'), bodyTextStyle: style(10, false, '#111111'), patientLabelStyle: style(11, true, '#111111'), patientValueStyle: style(11, false, '#111111'),
  bodyCaptionStyle: style(12.5, true), tableHeaderStyle: style(10, true, '#1756AD'), tableDataStyle: style(10), groupHeaderStyle: style(11, true, '#0F3E82'),
  testNameStyle: style(11, true, '#111111'), specimenStyle: style(9, false, '#6e6e6e'), referenceStyle: style(11, true, '#111111'), methodStyle: style(8, false, '#777777'), flagStyle: { ...style(11, true, '#111111'), fontFamily: 'NotoSansSymbols' }, interpretationStyle: style(9, false, '#111111'), remarksStyle: style(9, false, '#111111'), profileRemarksStyle: style(9, false, '#111111'), highlightedParamStyle: style(11, true, '#111111'),
  tableHeaderBgColor: '#F7FAFF', groupHeaderBgColor: '#E6EEF9', sectionHeaderBgColor: '#F3F6FB', highlightedParamTextColor: '#111111', highlightedParamBgColor: '#fff3bf',
  patientDetailsEnabled: true, patientDetailsFields: 'patient_name,age,gender,consultant,collected,reported,mrn,specimen', patientDetailsColumns: 2, patientDetailsShowLabels: true, patientDetailsColonText: ':', patientDetailsValueCase: 'as_entered', patientDetailsShowTimeBilled: false, patientDetailsShowTimeCollected: false, patientDetailsShowTimeReported: false, patientDetailsFieldStylesJson: '{}', patientDetailsLabelsJson: '{\n  "patient_name": "Patient Name",\n  "age_gender": "Age / Gender",\n  "consultant": "Referred By"\n}',
  patientDetailsOutsideBorder: false, patientDetailsTopBorder: true, patientDetailsBottomBorder: true, patientDetailsLeftBorder: true, patientDetailsRightBorder: true, patientDetailsInnerBorder: false, patientDetailsInnerHBorder: false, patientDetailsInnerVBorder: false, patientDetailsBorderColor: '#cccccc', patientDetailsBorderWidth: 0.4, patientDetailsBgColor: '#ffffff', patientDetailsLabelWidthMm: 26, patientDetailsRightLabelWidthMm: 26, patientDetailsRightColumnOffsetMm: 0, patientDetailsColumnGapMm: 5, patientDetailsSecondColumnMode: 'manual', patientDetailsSecondColumnWidthMm: 72, patientDetailsSecondColumnRightPaddingMm: 0, patientFirstLabelWidthPct: 16, patientFirstValueWidthPct: 28, patientColumnGapWidthPct: 14, patientSecondLabelWidthPct: 18, patientSecondValueWidthPct: 24,
  patientBarcodeEnabled: false, patientBarcodeSource: 'patient_no', patientBarcodeXMm: 150, patientBarcodeYMm: 42, patientBarcodeWidthMm: 42, patientBarcodeHeightMm: 10, patientBarcodeTextEnabled: true,
  referenceVisible: true, methodVisible: true, referencePlacement: 'right-column', methodPlacement: 'under-reference', methodPrefix: '', specimenVisible: true, specimenPlacement: 'under-test', specimenPrefix: '', collectionVisible: false,
  tableOutsideBorder: true, tableTopBorder: true, tableBottomBorder: true, tableLeftBorder: true, tableRightBorder: true, tableInnerBorder: true, tableInnerHBorder: true, tableInnerVBorder: true, tableBorderColor: '#cccccc', tableBorderWidth: 0.3, highColor: '#cc0000', lowColor: '#0000cc', resultFontSize: 12, resultAbnormalFontSize: 13,
  hrLinesConfig: 'before-patient|0|0.7|#222222|2.1|0|100\nafter-patient|0|0.7|#222222|0|0|100',
  endReportText: '-------------------------- END OF REPORT --------------------------', endReportAlignment: 'center', endReportMarginTopMm: 7, endReportMarginBottomMm: 7, endReportOffsetXMm: 0, endReportOffsetYMm: 0, endReportStyle: style(10, true, '#c00'),
  labSignEnabled: true, labSignLabel: 'Lab Technician Signature', labSignText: '', labSignAlignment: 'right', labSignMarginTopMm: 0, labSignMarginBottomMm: 2, labSignOffsetXMm: 0, labSignOffsetYMm: 0, labSignStyle: style(10, true, '#111111'),
  labSignImageEnabled: false, labSignImagePath: '', labSignImageWidthMm: 28, labSignImageHeightMm: 12, labSignImageOffsetXMm: 0, labSignImageOffsetYMm: -4,
  otherSignEnabled: false, otherSignLabel: 'Authorized Signature', otherSignText: '', otherSignAlignment: 'left', otherSignMarginTopMm: 0, otherSignMarginBottomMm: 2, otherSignOffsetXMm: 0, otherSignOffsetYMm: 0, otherSignStyle: style(10, true, '#111111'),
  otherSignImageEnabled: false, otherSignImagePath: '', otherSignImageWidthMm: 28, otherSignImageHeightMm: 12, otherSignImageOffsetXMm: 0, otherSignImageOffsetYMm: -4,
  signatureAdvancedEnabled: false,
  signatureRowsJson: '[\n  {\n    "enabled": true,\n    "row": 0,\n    "position": "left",\n    "textAlignment": "center",\n    "imagePath": "",\n    "imageWidthMm": 28,\n    "imageHeightMm": 12,\n    "lines": [\n      { "text": "Consultant Pathologist", "fontFamily": "Roboto", "fontSize": 8, "color": "#111111" },\n      { "text": "Dr. Name", "fontFamily": "Roboto", "fontSize": 10, "bold": true, "color": "#111111" },\n      { "text": "M.D. (Path)", "fontFamily": "Roboto", "fontSize": 8, "color": "#111111" }\n    ]\n  }\n]',
  signatureRowTopMarginMm: 0, signatureRowBottomMarginMm: 2, signatureColumnGapMm: 2, signatureImageZoneHeightMm: 0, signatureImageTextGapMm: 1, signatureLine1Height: 1.05, signatureLine2Height: 1.05, signatureLine3Height: 1.05, signatureLine4Height: 1.05, signatureEmptyLineMode: 'reserve',
  backgroundEnabled: false, backgroundImagePath: '', backgroundImageArea: 'full_page', backgroundImageBlendPreset: 'normal', backgroundImageFit: 'cover', backgroundImageOpacity: 1, backgroundImageWatermarkWidthPct: 62, backgroundImageOffsetXMm: 0, backgroundImageOffsetYMm: 0
};

@Component({
  selector: 'app-report-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatSnackBarModule],
  template: `
    <main class="content settings-content report-settings-content">
      <mat-card class="panel settings-panel stepper-settings-panel report-settings-panel">
        <div class="collection-fixed-head lab-workflow-head report-workflow-head">
          <div class="workflow-title-row report-title-row report-actions-only">
            <div class="action-row compact settings-actions"><button mat-stroked-button type="button" (click)="previewSettings('profile', true)" [disabled]="saving() || previewLoading()">Preview Profile · With BG</button><button mat-stroked-button type="button" (click)="previewSettings('profile', false)" [disabled]="saving() || previewLoading()">Preview Profile · Without BG</button><button mat-stroked-button type="button" (click)="previewSettings('single', true)" [disabled]="saving() || previewLoading()">Preview Single · With BG</button><button mat-stroked-button type="button" (click)="previewSettings('single', false)" [disabled]="saving() || previewLoading()">Preview Single · Without BG</button><button mat-stroked-button type="button" (click)="reload()" [disabled]="saving() || previewLoading()">Reload</button><button mat-stroked-button type="button" class="danger-soft" (click)="askResetDefaults()" [disabled]="saving() || previewLoading()">Reset to Default</button><button mat-flat-button color="primary" type="button" (click)="save()" [disabled]="saving() || previewLoading()">Save Settings</button></div>
          </div>
          <nav #stepperTrack class="workflow-tabs report-workflow-tabs" aria-label="Report settings sections" (wheel)="onStepperWheel($event)" (mousedown)="onStepperMouseDown($event)" (touchstart)="onStepperTouchStart($event)" (touchmove)="onStepperTouchMove($event)" (touchend)="endStepperDrag()">
            <button type="button" *ngFor="let step of steps; let i = index" [class.active]="activeStep() === step.id" (click)="selectStep(step.id, $event)"><span>{{ step.title }}</span><b>{{ i + 1 }}</b></button>
          </nav>
        </div>
        <section class="settings-step-content"><ng-container [ngSwitch]="activeStep()">
          <div *ngSwitchCase="'page'" class="step-card">
            <div class="step-card-header"><div><h3>Page Setup</h3><p>Configure page layout separately for With background and Without background prints.</p></div><span class="step-pill">PDF / Print</span></div>
            <article class="layout-profile-card" *ngFor="let profile of layoutProfiles">
              <div class="layout-profile-head"><div><h4>{{ profile.label }}</h4><p>{{ profile.hint }}</p></div><button mat-stroked-button type="button" (click)="copyLayoutProfile(profile.id === 'withBg' ? 'noBg' : 'withBg', profile.id)" [disabled]="saving()">Copy from {{ profile.id === 'withBg' ? 'Without BG' : 'With BG' }}</button></div>
              <div class="form-grid two"><label><span>Page Size</span><select [ngModel]="layoutField(profile.id, 'pageSize')" (ngModelChange)="updateLayoutField(profile.id, 'pageSize', $event)"><option value="A4">A4</option><option value="A5">A5</option><option value="LETTER">Letter</option><option value="LEGAL">Legal</option></select></label><label><span>Orientation</span><select [ngModel]="layoutField(profile.id, 'orientation')" (ngModelChange)="updateLayoutField(profile.id, 'orientation', $event)"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div>
              <div class="mini-grid"><label><span>Page Top</span><input type="number" min="0" max="80" step="1" [ngModel]="layoutField(profile.id, 'marginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'marginTopMm', $event)"></label><label><span>Right</span><input type="number" min="0" max="80" step="1" [ngModel]="layoutField(profile.id, 'marginRightMm')" (ngModelChange)="updateLayoutField(profile.id, 'marginRightMm', $event)"></label><label><span>Page Bottom</span><input type="number" min="0" max="80" step="1" [ngModel]="layoutField(profile.id, 'marginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'marginBottomMm', $event)"></label><label><span>Left</span><input type="number" min="0" max="80" step="1" [ngModel]="layoutField(profile.id, 'marginLeftMm')" (ngModelChange)="updateLayoutField(profile.id, 'marginLeftMm', $event)"></label></div>
              <section class="mini-editor"><div class="mini-title"><h4>Main Layout Margins</h4><p>Page Top/Bottom are physical page margins. Header/Footer Height reserve report bands separately. Body and table values are extra gaps inside the printable area.</p></div><div class="mini-grid four"><label><span>Body Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'mainBodyMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'mainBodyMarginTopMm', $event)"></label><label><span>Body Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'mainBodyMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'mainBodyMarginBottomMm', $event)"></label><label><span>Table Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'tableMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'tableMarginTopMm', $event)"></label><label><span>Table Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'tableMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'tableMarginBottomMm', $event)"></label><label><span>Table Left Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'tableMarginLeftMm')" (ngModelChange)="updateLayoutField(profile.id, 'tableMarginLeftMm', $event)"></label><label><span>Table Right Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'tableMarginRightMm')" (ngModelChange)="updateLayoutField(profile.id, 'tableMarginRightMm', $event)"></label></div></section>
              <section class="mini-editor"><div class="mini-title"><h4>Table Fitting (mm)</h4><p>Physical table safety and cell padding only. Column widths are configured dynamically in the <b>Report Table</b> step.</p></div><div class="mini-grid four"><label><span>Table Safety</span><input type="number" min="0" max="20" step="0.1" [ngModel]="layoutField(profile.id, 'tableSafetyMm')" (ngModelChange)="updateLayoutField(profile.id, 'tableSafetyMm', $event)"></label><label><span>Cell Left Pad</span><input type="number" min="0" max="20" step="0.1" [ngModel]="layoutField(profile.id, 'tablePaddingLeftMm')" (ngModelChange)="updateLayoutField(profile.id, 'tablePaddingLeftMm', $event)"></label><label><span>Cell Right Pad</span><input type="number" min="0" max="20" step="0.1" [ngModel]="layoutField(profile.id, 'tablePaddingRightMm')" (ngModelChange)="updateLayoutField(profile.id, 'tablePaddingRightMm', $event)"></label><label><span>Cell Top Pad</span><input type="number" min="0" max="20" step="0.1" [ngModel]="layoutField(profile.id, 'tablePaddingTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'tablePaddingTopMm', $event)"></label><label><span>Cell Bottom Pad</span><input type="number" min="0" max="20" step="0.1" [ngModel]="layoutField(profile.id, 'tablePaddingBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'tablePaddingBottomMm', $event)"></label></div></section>
            </article>
          </div>

          <div *ngSwitchCase="'font'" class="step-card">
            <div class="step-card-header"><div><h3>Font</h3><p>Only locally bundled PDF fonts are shown here. These render offline and are safe for generated reports.</p></div><span class="step-pill">Text Blocks</span></div>
            <section class="mini-editor"><div class="font-config-grid">
              <ng-container *ngFor="let item of fontRows"><div class="font-config-row color-row"><b>{{ item.label }}</b><select [ngModel]="styleOf(item.key).fontFamily" (ngModelChange)="updateStyle(item.key, 'fontFamily', $event)"><option *ngFor="let font of supportedReportFonts" [value]="font.value">{{ font.label }}</option></select><input type="number" min="6" max="30" step="0.5" [ngModel]="styleOf(item.key).fontSize" (ngModelChange)="updateStyle(item.key, 'fontSize', $event)"><input type="color" [ngModel]="styleOf(item.key).color" (ngModelChange)="updateStyle(item.key, 'color', $event)"><label class="inline-check"><input type="checkbox" [ngModel]="styleOf(item.key).bold" (ngModelChange)="updateStyle(item.key, 'bold', $event)">Bold</label><label class="inline-check"><input type="checkbox" [ngModel]="styleOf(item.key).italic" (ngModelChange)="updateStyle(item.key, 'italic', $event)">Italic</label><label class="inline-check"><input type="checkbox" [ngModel]="styleOf(item.key).underline" (ngModelChange)="updateStyle(item.key, 'underline', $event)">Underline</label></div></ng-container>
            </div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Table & Highlight Colors</h4><p>Pick or paste HEX colors. Category/Department uses Group Header BG + Group Header font style.</p></div><div class="mini-grid four"><label><span>Table Header BG</span><input type="color" [ngModel]="settings().tableHeaderBgColor" (ngModelChange)="updateColorField('tableHeaderBgColor', $event)"><input placeholder="#F7FAFF" [ngModel]="settings().tableHeaderBgColor" (ngModelChange)="updateColorField('tableHeaderBgColor', $event)"></label><label><span>Category / Dept BG</span><input type="color" [ngModel]="settings().groupHeaderBgColor" (ngModelChange)="updateColorField('groupHeaderBgColor', $event)"><input placeholder="#E6EEF9" [ngModel]="settings().groupHeaderBgColor" (ngModelChange)="updateColorField('groupHeaderBgColor', $event)"></label><label><span>Sub Header BG</span><input type="color" [ngModel]="settings().sectionHeaderBgColor" (ngModelChange)="updateColorField('sectionHeaderBgColor', $event)"><input placeholder="#F3F6FB" [ngModel]="settings().sectionHeaderBgColor" (ngModelChange)="updateColorField('sectionHeaderBgColor', $event)"></label><label><span>Highlighted Font Color</span><input type="color" [ngModel]="settings().highlightedParamTextColor" (ngModelChange)="updateColorField('highlightedParamTextColor', $event)"><input placeholder="#111111" [ngModel]="settings().highlightedParamTextColor" (ngModelChange)="updateColorField('highlightedParamTextColor', $event)"></label><label><span>Highlighted Name Cell BG</span><input type="color" [ngModel]="settings().highlightedParamBgColor" (ngModelChange)="updateColorField('highlightedParamBgColor', $event)"><input placeholder="#fff3bf" [ngModel]="settings().highlightedParamBgColor" (ngModelChange)="updateColorField('highlightedParamBgColor', $event)"></label><label><span>High Result Color</span><input type="color" [ngModel]="settings().highColor" (ngModelChange)="updateColorField('highColor', $event)"><input placeholder="#cc0000" [ngModel]="settings().highColor" (ngModelChange)="updateColorField('highColor', $event)"></label><label><span>Low Result Color</span><input type="color" [ngModel]="settings().lowColor" (ngModelChange)="updateColorField('lowColor', $event)"><input placeholder="#0000cc" [ngModel]="settings().lowColor" (ngModelChange)="updateColorField('lowColor', $event)"></label></div><div class="preset-row"><button type="button" (click)="applyColorPreset('blue')">Blue preset</button><button type="button" (click)="applyColorPreset('gray')">Grey preset</button><button type="button" (click)="applyColorPreset('plain')">Plain white</button><button type="button" (click)="applyColorPreset('bw')">Black &amp; White</button></div><div class="field-help"><b>Black &amp; White:</b> overrides colored fonts only (all text styles, high/low result colors, signature lines). Background colors are left unchanged.</div></section>
          </div>

          <div *ngSwitchCase="'headerFooter'" class="step-card">
            <div class="step-card-header"><div><h3>Header / Footer</h3><p>Configure logo, institution, address and footer separately for With background and Without background.</p></div><span class="step-pill">Layout profiles</span></div>
            <article class="layout-profile-card" *ngFor="let profile of layoutProfiles">
              <div class="layout-profile-head"><div><h4>{{ profile.label }}</h4><p>{{ profile.hint }}</p></div><div class="action-row compact"><button mat-stroked-button type="button" (click)="copyLayoutProfile(profile.id === 'withBg' ? 'noBg' : 'withBg', profile.id)" [disabled]="saving()">Copy from {{ profile.id === 'withBg' ? 'Without BG' : 'With BG' }}</button><button mat-stroked-button type="button" (click)="chooseLogo(profile.id)">Upload / Change Logo</button></div></div>
              <section class="mini-editor"><div class="mini-title"><h4>Header / Footer Reserved Space</h4><p>Header Height and Footer Height reserve fixed report bands. Footer left/right now follows Page Left/Right margins; use offsets for small movement.</p></div><div class="mini-grid five"><label><span>Header Height</span><input type="number" min="0" max="100" step="1" [ngModel]="layoutField(profile.id, 'headerFixedHeightMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerFixedHeightMm', $event)"></label><label><span>Header Top Gap</span><input type="number" min="0" max="40" step="0.5" [ngModel]="layoutField(profile.id, 'headerMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerMarginTopMm', $event)"></label><label><span>Header Bottom Gap</span><input type="number" min="0" max="40" step="0.5" [ngModel]="layoutField(profile.id, 'headerMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerMarginBottomMm', $event)"></label><label><span>Footer Height</span><input type="number" min="0" max="100" step="1" [ngModel]="layoutField(profile.id, 'footerFixedHeightMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerFixedHeightMm', $event)"></label><label><span>Footer Bottom Gap</span><input type="number" min="0" max="40" step="0.5" [ngModel]="layoutField(profile.id, 'footerMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerMarginBottomMm', $event)"></label></div></section>
              <section class="mini-editor"><div class="mini-title"><h4>Logo</h4><p>Enable, place and size the header logo.</p></div><div class="form-grid"><label class="check-card"><input type="checkbox" [ngModel]="layoutField(profile.id, 'headerLogoEnabled')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoEnabled', $event)"><span>Enable logo</span></label><div class="action-row compact"><button mat-stroked-button type="button" (click)="chooseLogo(profile.id)">Upload / Change</button><button mat-stroked-button type="button" (click)="clearLogo(profile.id)" [disabled]="!layoutField(profile.id, 'headerLogoPath')">Clear</button></div></div><div class="mini-grid five"><label><span>Placement</span><select [ngModel]="layoutField(profile.id, 'headerLogoPlacement')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoPlacement', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Width</span><input type="number" min="5" max="100" step="1" [ngModel]="layoutField(profile.id, 'headerLogoWidthMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoWidthMm', $event)"></label><label><span>Height</span><input type="number" min="5" max="80" step="1" [ngModel]="layoutField(profile.id, 'headerLogoHeightMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoHeightMm', $event)"></label><label><span>Signature X Offset</span><input type="number" min="-80" max="80" step="0.5" [ngModel]="layoutField(profile.id, 'headerLogoOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoOffsetXMm', $event)"></label><label><span>Signature Y Offset</span><input type="number" min="-80" max="80" step="0.5" [ngModel]="layoutField(profile.id, 'headerLogoOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerLogoOffsetYMm', $event)"></label></div><label><span>Logo Path</span><input readonly [ngModel]="layoutField(profile.id, 'headerLogoPath') || 'No logo selected'"></label></section>
              <section class="mini-editor"><div class="mini-title"><h4>Header Text</h4><p>Institution name/subtitle with alignment and X/Y offsets.</p></div><div class="form-grid"><label><span>Institution Name</span><input [ngModel]="layoutField(profile.id, 'institutionName')" (ngModelChange)="updateLayoutField(profile.id, 'institutionName', $event)"></label><label><span>Sub Text / Subtitle</span><input [ngModel]="layoutField(profile.id, 'institutionSubText')" (ngModelChange)="updateLayoutField(profile.id, 'institutionSubText', $event)"></label><label><span>Header Text Alignment</span><select [ngModel]="layoutField(profile.id, 'institutionTextPlacement')" (ngModelChange)="updateLayoutField(profile.id, 'institutionTextPlacement', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Line Gap</span><input type="number" min="0" max="20" step="0.5" [ngModel]="layoutField(profile.id, 'headerLineGapMm')" (ngModelChange)="updateLayoutField(profile.id, 'headerLineGapMm', $event)"></label></div><div class="mini-grid four"><label><span>Name X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'institutionNameOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'institutionNameOffsetXMm', $event)"></label><label><span>Name Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'institutionNameOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'institutionNameOffsetYMm', $event)"></label><label><span>Subtitle X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'institutionSubTextOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'institutionSubTextOffsetXMm', $event)"></label><label><span>Subtitle Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'institutionSubTextOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'institutionSubTextOffsetYMm', $event)"></label></div></section>
              <section class="mini-editor"><div class="mini-title"><h4>Address / Footer Text</h4><p>Place address in header/footer with alignment and offset controls.</p></div><div class="form-grid"><label><span>Address Placement</span><select [ngModel]="layoutField(profile.id, 'addressPlacement')" (ngModelChange)="updateLayoutField(profile.id, 'addressPlacement', $event)"><option value="header">Header</option><option value="footer">Footer</option></select></label><label><span>Address Alignment</span><select [ngModel]="layoutField(profile.id, 'addressAlignment')" (ngModelChange)="updateLayoutField(profile.id, 'addressAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Footer Alignment</span><select [ngModel]="layoutField(profile.id, 'footerTextAlignment')" (ngModelChange)="updateLayoutField(profile.id, 'footerTextAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Address Line Gap</span><input type="number" min="0" max="20" step="0.5" [ngModel]="layoutField(profile.id, 'addressLineGapMm')" (ngModelChange)="updateLayoutField(profile.id, 'addressLineGapMm', $event)"></label></div><div class="mini-grid four"><label><span>Address X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'addressOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'addressOffsetXMm', $event)"></label><label><span>Address Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'addressOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'addressOffsetYMm', $event)"></label><label><span>Footer X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'footerTextOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerTextOffsetXMm', $event)"></label><label><span>Footer Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'footerTextOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerTextOffsetYMm', $event)"></label></div><div class="mini-grid four"><label><span>Address Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'addressMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'addressMarginTopMm', $event)"></label><label><span>Address Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'addressMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'addressMarginBottomMm', $event)"></label><label><span>Footer Text Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'footerTextMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerTextMarginTopMm', $event)"></label><label><span>Footer Text Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'footerTextMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerTextMarginBottomMm', $event)"></label></div><label><span>Address Text</span><textarea rows="3" [ngModel]="layoutField(profile.id, 'addressText')" (ngModelChange)="updateLayoutField(profile.id, 'addressText', $event)"></textarea></label><label><span>Footer Text</span><textarea rows="2" [ngModel]="layoutField(profile.id, 'footerText')" (ngModelChange)="updateLayoutField(profile.id, 'footerText', $event)"></textarea></label></section>
              <section class="mini-editor"><div class="mini-title"><h4>Disclaimer Placement & Styling</h4><p>Disclaimer can repeat in the footer or print once above the footer on the last page/end of report.</p></div><div class="form-grid"><label><span>Disclaimer Placement</span><select [ngModel]="layoutField(profile.id, 'disclaimerPlacement')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerPlacement', $event)"><option value="hidden">Hidden</option><option value="footer">Footer - Repeat Every Page</option><option value="above-footer">Above Footer - Last Page Only</option></select></label><label><span>Disclaimer Alignment</span><select [ngModel]="layoutField(profile.id, 'disclaimerAlignment')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Disclaimer Block Width %</span><input type="number" min="10" max="100" step="1" [ngModel]="layoutField(profile.id, 'disclaimerWidthPct')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerWidthPct', $event)"></label></div><label><span>Disclaimer Text</span><textarea rows="3" [ngModel]="layoutField(profile.id, 'disclaimerText')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerText', $event)"></textarea></label><div class="mini-grid five"><label><span>X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerOffsetXMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerOffsetXMm', $event)"></label><label><span>Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerOffsetYMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerOffsetYMm', $event)"></label><label><span>Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerMarginTopMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerMarginTopMm', $event)"></label><label><span>Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerMarginBottomMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerMarginBottomMm', $event)"></label><label><span>Left Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerMarginLeftMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerMarginLeftMm', $event)"></label><label><span>Right Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="layoutField(profile.id, 'disclaimerMarginRightMm')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerMarginRightMm', $event)"></label><label><span>Line Height</span><input type="number" min="0.8" max="2.5" step="0.05" [ngModel]="layoutField(profile.id, 'disclaimerLineHeight')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerLineHeight', $event)"></label><label><span>Character Spacing</span><input type="number" min="-5" max="10" step="0.1" [ngModel]="layoutField(profile.id, 'disclaimerCharacterSpacing')" (ngModelChange)="updateLayoutField(profile.id, 'disclaimerCharacterSpacing', $event)"></label><label><span>Background</span><input type="color" [ngModel]="layoutField(profile.id, 'disclaimerBgColor')" (ngModelChange)="updateLayoutColorField(profile.id, 'disclaimerBgColor', $event)"><input [ngModel]="layoutField(profile.id, 'disclaimerBgColor')" (ngModelChange)="updateLayoutColorField(profile.id, 'disclaimerBgColor', $event)"></label></div><div class="mini-title"><h4>Footer Row Widths</h4><p>Used only when Disclaimer Placement is Footer.</p></div><div class="mini-grid four"><label><span>Footer Disclaimer Width %</span><input type="number" min="10" max="95" step="1" [ngModel]="layoutField(profile.id, 'footerDisclaimerWidthPct')" (ngModelChange)="updateLayoutField(profile.id, 'footerDisclaimerWidthPct', $event)"></label><label><span>Footer Page Number Width %</span><input type="number" min="5" max="60" step="1" [ngModel]="layoutField(profile.id, 'footerPageNumberWidthPct')" (ngModelChange)="updateLayoutField(profile.id, 'footerPageNumberWidthPct', $event)"></label><label><span>Footer Column Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="layoutField(profile.id, 'footerColumnGapMm')" (ngModelChange)="updateLayoutField(profile.id, 'footerColumnGapMm', $event)"></label><label><span>Page Number Alignment</span><select [ngModel]="layoutField(profile.id, 'footerPageNumberAlignment')" (ngModelChange)="updateLayoutField(profile.id, 'footerPageNumberAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div class="mini-title"><h4>Disclaimer Font</h4></div><div class="font-config-row color-row"><b>Disclaimer</b><select [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').fontFamily" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'fontFamily', $event)"><option *ngFor="let font of supportedReportFonts" [value]="font.value">{{ font.label }}</option></select><input type="number" min="6" max="30" step="0.5" [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').fontSize" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'fontSize', $event)"><input type="color" [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').color" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'color', $event)"><label class="inline-check"><input type="checkbox" [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').bold" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'bold', $event)">Bold</label><label class="inline-check"><input type="checkbox" [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').italic" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'italic', $event)">Italic</label><label class="inline-check"><input type="checkbox" [ngModel]="layoutStyle(profile.id, 'disclaimerStyle').underline" (ngModelChange)="updateLayoutStyle(profile.id, 'disclaimerStyle', 'underline', $event)">Underline</label></div></section>
            </article>
          </div>

          <div *ngSwitchCase="'patient'" class="step-card">
            <div class="step-card-header"><div><h3>Patient Details</h3><p>Patient fields, placement, spacing, borders, combined Age / Gender, barcode and second-column movement.</p></div><span class="step-pill">Patient</span></div>
            <section class="mini-editor"><div class="mini-title"><h4>Patient Placement & Spacing</h4><p>These controls affect only the patient details block. Use percentage widths to control the two patient columns. Increase <b>Gap Between Columns %</b> to push the right section further right.</p></div>
              <div class="form-grid"><label><span>Patient Details Placement</span><select [ngModel]="settings().patientDetailsPlacement" (ngModelChange)="updateField('patientDetailsPlacement', $event)"><option value="header">Header</option><option value="body">Body</option></select></label><label><span>Patient Details Gap</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().patientDetailsGapMm" (ngModelChange)="updateField('patientDetailsGapMm', $event)"></label></div>
              <div class="mini-grid four"><label><span>Patient X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().patientDetailsOffsetXMm" (ngModelChange)="updateField('patientDetailsOffsetXMm', $event)"></label><label><span>Patient Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().patientDetailsOffsetYMm" (ngModelChange)="updateField('patientDetailsOffsetYMm', $event)"></label><label><span>First Label Width %</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientFirstLabelWidthPct" (ngModelChange)="updateField('patientFirstLabelWidthPct', $event)"></label><label><span>First Value Width %</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientFirstValueWidthPct" (ngModelChange)="updateField('patientFirstValueWidthPct', $event)"></label><label><span>Gap Between Columns %</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientColumnGapWidthPct" (ngModelChange)="updateField('patientColumnGapWidthPct', $event)"></label><label><span>Second Label Width %</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientSecondLabelWidthPct" (ngModelChange)="updateField('patientSecondLabelWidthPct', $event)"></label><label><span>Second Value Width %</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientSecondValueWidthPct" (ngModelChange)="updateField('patientSecondValueWidthPct', $event)"></label></div>
              <div class="mini-grid four"><label><span>Patient Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientDetailsMarginTopMm" (ngModelChange)="updateField('patientDetailsMarginTopMm', $event)"></label><label><span>Patient Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientDetailsMarginBottomMm" (ngModelChange)="updateField('patientDetailsMarginBottomMm', $event)"></label><label><span>Patient Left Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientDetailsMarginLeftMm" (ngModelChange)="updateField('patientDetailsMarginLeftMm', $event)"></label><label><span>Patient Right Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().patientDetailsMarginRightMm" (ngModelChange)="updateField('patientDetailsMarginRightMm', $event)"></label><label><span>Patient Padding Top</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientDetailsPaddingTopMm" (ngModelChange)="updateField('patientDetailsPaddingTopMm', $event)"></label><label><span>Patient Padding Right</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientDetailsPaddingRightMm" (ngModelChange)="updateField('patientDetailsPaddingRightMm', $event)"></label><label><span>Patient Padding Bottom</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientDetailsPaddingBottomMm" (ngModelChange)="updateField('patientDetailsPaddingBottomMm', $event)"></label><label><span>Patient Padding Left</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientDetailsPaddingLeftMm" (ngModelChange)="updateField('patientDetailsPaddingLeftMm', $event)"></label></div>
              <div class="mini-title subtle-title"><h4>Patient Table Outer Padding</h4><p>Controls total padding inside the patient table border. This increases the space between the outer patient table border and all patient content, without increasing every cell.</p></div>
              <div class="mini-grid four"><label><span>Outer Top Pad</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientTableInnerPaddingTopMm" (ngModelChange)="updateField('patientTableInnerPaddingTopMm', $event)"></label><label><span>Outer Right Pad</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientTableInnerPaddingRightMm" (ngModelChange)="updateField('patientTableInnerPaddingRightMm', $event)"></label><label><span>Outer Bottom Pad</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientTableInnerPaddingBottomMm" (ngModelChange)="updateField('patientTableInnerPaddingBottomMm', $event)"></label><label><span>Outer Left Pad</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().patientTableInnerPaddingLeftMm" (ngModelChange)="updateField('patientTableInnerPaddingLeftMm', $event)"></label></div>
              <div class="mini-title subtle-title"><h4>Patient Table Cell Padding</h4><p>Controls spacing inside each patient-detail table cell. This works even when patient borders are turned off.</p></div>
              <div class="mini-grid four"><label><span>Cell Top Pad</span><input type="number" min="0" max="30" step="0.1" [ngModel]="settings().patientTablePaddingTopMm" (ngModelChange)="updateField('patientTablePaddingTopMm', $event)"></label><label><span>Cell Right Pad</span><input type="number" min="0" max="30" step="0.1" [ngModel]="settings().patientTablePaddingRightMm" (ngModelChange)="updateField('patientTablePaddingRightMm', $event)"></label><label><span>Cell Bottom Pad</span><input type="number" min="0" max="30" step="0.1" [ngModel]="settings().patientTablePaddingBottomMm" (ngModelChange)="updateField('patientTablePaddingBottomMm', $event)"></label><label><span>Cell Left Pad</span><input type="number" min="0" max="30" step="0.1" [ngModel]="settings().patientTablePaddingLeftMm" (ngModelChange)="updateField('patientTablePaddingLeftMm', $event)"></label></div>
            </section>
            <section class="mini-editor"><div class="mini-title"><h4>Patient Fields</h4><p>Fields are comma separated and printed in order. Use <b>age_gender</b> for a single combined label/value.</p></div>
              <label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsEnabled" (ngModelChange)="updateField('patientDetailsEnabled', $event)"><span>Show patient details</span></label>
              <div class="form-grid"><label><span>Patient value case (PDF values only)</span><select [ngModel]="settings().patientDetailsValueCase" (ngModelChange)="updateField('patientDetailsValueCase', normalizePatientValueCase($event))"><option value="as_entered">As entered</option><option value="upper">UPPERCASE</option><option value="title">Title Case</option><option value="lower">lowercase</option></select></label><label><span>Columns</span><input type="number" min="1" max="3" step="1" [ngModel]="settings().patientDetailsColumns" (ngModelChange)="updateField('patientDetailsColumns', $event)"></label><label><span>Colon Text</span><input [ngModel]="settings().patientDetailsColonText" (ngModelChange)="updateField('patientDetailsColonText', $event)"></label></div>
              <div class="field-help">Changes only printed patient <b>values</b> (name, consultant, etc.). Labels stay as typed in Label Override JSON.</div>
              <label class="wide-field"><span>Fields</span><textarea rows="5" placeholder="patient_name,age_gender,consultant,collected" [ngModel]="settings().patientDetailsFields" (ngModelChange)="updateField('patientDetailsFields', $event)"></textarea></label>
              <div class="field-help"><b>Available fields:</b><div class="field-chip-row"><code>patient_name</code><code>age_gender</code><code>age</code><code>gender</code><code>consultant</code><code>billed_date</code><code>collected</code><code>reported</code><code>mrn</code><code>patient_no</code><code>bill_no</code><code>sample_type</code><code>barcode</code></div><span>Use comma-separated values. The order typed here is the order printed in the patient table. If Collected has no sample time it uses bill date, and then follows “Show time in billed date”.</span></div>
              <label><span>Label Override JSON</span><textarea rows="3" [ngModel]="settings().patientDetailsLabelsJson" (ngModelChange)="updateField('patientDetailsLabelsJson', $event)"></textarea></label>
              <div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsShowTimeBilled" (ngModelChange)="updateField('patientDetailsShowTimeBilled', $event)"><span>Show time in billed date</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsShowTimeCollected" (ngModelChange)="updateField('patientDetailsShowTimeCollected', $event)"><span>Show time in collected date</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsShowTimeReported" (ngModelChange)="updateField('patientDetailsShowTimeReported', $event)"><span>Show time in reported date</span></label></div>
              <label class="wide-field"><span>Per-field label/value style JSON</span><textarea rows="5" placeholder='{"patient_name":{"label":{"bold":true,"color":"#111111"},"value":{"bold":true,"fontSize":12}},"specimen":{"value":{"italic":true}}}' [ngModel]="settings().patientDetailsFieldStylesJson" (ngModelChange)="updateField('patientDetailsFieldStylesJson', $event)"></textarea></label>
            </section>
            <section class="mini-editor"><div class="mini-title"><h4>Patient Box Border</h4><p>If outer border is enabled, choose exactly which sides are drawn. Inner horizontal and vertical lines are separate.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsOutsideBorder" (ngModelChange)="updateField('patientDetailsOutsideBorder', $event)"><span>Outer border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().patientDetailsOutsideBorder" [ngModel]="settings().patientDetailsTopBorder" (ngModelChange)="updateField('patientDetailsTopBorder', $event)"><span>Top border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().patientDetailsOutsideBorder" [ngModel]="settings().patientDetailsBottomBorder" (ngModelChange)="updateField('patientDetailsBottomBorder', $event)"><span>Bottom border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().patientDetailsOutsideBorder" [ngModel]="settings().patientDetailsLeftBorder" (ngModelChange)="updateField('patientDetailsLeftBorder', $event)"><span>Left border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().patientDetailsOutsideBorder" [ngModel]="settings().patientDetailsRightBorder" (ngModelChange)="updateField('patientDetailsRightBorder', $event)"><span>Right border</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsInnerHBorder" (ngModelChange)="updateField('patientDetailsInnerHBorder', $event)"><span>Inner horizontal</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().patientDetailsInnerVBorder" (ngModelChange)="updateField('patientDetailsInnerVBorder', $event)"><span>Inner vertical</span></label><label><span>Border Color</span><input type="color" [ngModel]="settings().patientDetailsBorderColor" (ngModelChange)="updateColorField('patientDetailsBorderColor', $event)"><input [ngModel]="settings().patientDetailsBorderColor" (ngModelChange)="updateColorField('patientDetailsBorderColor', $event)"></label><label><span>Border Width</span><input type="number" min="0" max="3" step="0.1" [ngModel]="settings().patientDetailsBorderWidth" (ngModelChange)="updateField('patientDetailsBorderWidth', $event)"></label><label><span>Background</span><input type="color" [ngModel]="settings().patientDetailsBgColor" (ngModelChange)="updateColorField('patientDetailsBgColor', $event)"><input [ngModel]="settings().patientDetailsBgColor" (ngModelChange)="updateColorField('patientDetailsBgColor', $event)"></label></div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Patient Barcode</h4><p>Optional absolute-position patient barcode.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().patientBarcodeEnabled" (ngModelChange)="updateField('patientBarcodeEnabled', $event)"><span>Show barcode</span></label><label><span>Source</span><select [ngModel]="settings().patientBarcodeSource" (ngModelChange)="updateField('patientBarcodeSource', $event)"><option value="patient_no">Patient ID</option><option value="mrn">MRN</option><option value="bill_no">Bill No</option><option value="sample_type">Sample ID</option></select></label><label><span>X mm</span><input type="number" min="0" max="220" step="0.5" [ngModel]="settings().patientBarcodeXMm" (ngModelChange)="updateField('patientBarcodeXMm', $event)"></label><label><span>Y mm</span><input type="number" min="0" max="300" step="0.5" [ngModel]="settings().patientBarcodeYMm" (ngModelChange)="updateField('patientBarcodeYMm', $event)"></label><label><span>Width mm</span><input type="number" min="5" max="100" step="0.5" [ngModel]="settings().patientBarcodeWidthMm" (ngModelChange)="updateField('patientBarcodeWidthMm', $event)"></label><label><span>Height mm</span><input type="number" min="3" max="50" step="0.5" [ngModel]="settings().patientBarcodeHeightMm" (ngModelChange)="updateField('patientBarcodeHeightMm', $event)"></label><label class="check-card"><input type="checkbox" [ngModel]="settings().patientBarcodeTextEnabled" (ngModelChange)="updateField('patientBarcodeTextEnabled', $event)"><span>Show barcode text</span></label></div></section>
          </div>

          <div *ngSwitchCase="'body'" class="step-card">
            <div class="step-card-header"><div><h3>Body / Title</h3><p>Body title and subtitles only. Patient placement controls are now inside the Patient stepper.</p></div><span class="step-pill">Report Body</span></div>
            <section class="mini-editor"><div class="mini-title"><h4>Report Title / Subtitle</h4><p>Controls the report body heading only.</p></div><div class="form-grid"><label><span>Title Alignment</span><select [ngModel]="settings().reportTitleAlignment" (ngModelChange)="updateField('reportTitleAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Subtitle Alignment</span><select [ngModel]="settings().reportSubtitleAlignment" (ngModelChange)="updateField('reportSubtitleAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div class="mini-grid four"><label><span>Title X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().reportTitleOffsetXMm" (ngModelChange)="updateField('reportTitleOffsetXMm', $event)"></label><label><span>Title Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().reportTitleOffsetYMm" (ngModelChange)="updateField('reportTitleOffsetYMm', $event)"></label><label><span>Subtitle X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().reportSubtitleOffsetXMm" (ngModelChange)="updateField('reportSubtitleOffsetXMm', $event)"></label><label><span>Subtitle Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().reportSubtitleOffsetYMm" (ngModelChange)="updateField('reportSubtitleOffsetYMm', $event)"></label></div><div class="mini-grid four"><label><span>Title Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().reportTitleMarginTopMm" (ngModelChange)="updateField('reportTitleMarginTopMm', $event)"></label><label><span>Title Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().reportTitleMarginBottomMm" (ngModelChange)="updateField('reportTitleMarginBottomMm', $event)"></label><label><span>Subtitle Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().reportSubtitleMarginTopMm" (ngModelChange)="updateField('reportSubtitleMarginTopMm', $event)"></label><label><span>Subtitle Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().reportSubtitleMarginBottomMm" (ngModelChange)="updateField('reportSubtitleMarginBottomMm', $event)"></label></div><label><span>Body Title</span><input placeholder="COMPLETE BLOOD COUNT" [ngModel]="settings().reportTitleText" (ngModelChange)="updateField('reportTitleText', $event)"></label><label><span>Subtitles - one per line</span><textarea rows="4" placeholder="Done by Boule Exigo 3 Part Automated analyser, Sweden" [ngModel]="settings().reportSubtitleText" (ngModelChange)="updateField('reportSubtitleText', $event)"></textarea></label><label><span>Title/Subtitles Gap (mm)</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().titleSubtitleGapMm" (ngModelChange)="updateField('titleSubtitleGapMm', $event)"></label></section>
          </div>

          <div *ngSwitchCase="'table'" class="step-card">
            <div class="step-card-header"><div><h3>Report Table</h3><p>Table border sides, colors, specimen placement and method placement. Reference always remains visible.</p></div><span class="step-pill">Table</span></div>
            <section class="mini-editor"><div class="mini-title"><h4>Table Border</h4><p>Same border control model as patient box.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().tableOutsideBorder" (ngModelChange)="updateField('tableOutsideBorder', $event)"><span>Outer border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().tableOutsideBorder" [ngModel]="settings().tableTopBorder" (ngModelChange)="updateField('tableTopBorder', $event)"><span>Top border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().tableOutsideBorder" [ngModel]="settings().tableBottomBorder" (ngModelChange)="updateField('tableBottomBorder', $event)"><span>Bottom border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().tableOutsideBorder" [ngModel]="settings().tableLeftBorder" (ngModelChange)="updateField('tableLeftBorder', $event)"><span>Left border</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().tableOutsideBorder" [ngModel]="settings().tableRightBorder" (ngModelChange)="updateField('tableRightBorder', $event)"><span>Right border</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().tableInnerHBorder" (ngModelChange)="updateField('tableInnerHBorder', $event)"><span>Inner horizontal</span></label><label class="check-card"><input type="checkbox" [ngModel]="settings().tableInnerVBorder" (ngModelChange)="updateField('tableInnerVBorder', $event)"><span>Inner vertical</span></label><label><span>Border Color</span><input type="color" [ngModel]="settings().tableBorderColor" (ngModelChange)="updateColorField('tableBorderColor', $event)"><input [ngModel]="settings().tableBorderColor" (ngModelChange)="updateColorField('tableBorderColor', $event)"></label><label><span>Border Width</span><input type="number" min="0" max="3" step="0.1" [ngModel]="settings().tableBorderWidth" (ngModelChange)="updateField('tableBorderWidth', $event)"></label></div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Table Colors / Result</h4><p>Paste HEX colors directly or use the color picker.</p></div><div class="mini-grid four"><label><span>Column Header BG</span><input type="color" [ngModel]="settings().tableHeaderBgColor" (ngModelChange)="updateColorField('tableHeaderBgColor', $event)"><input [ngModel]="settings().tableHeaderBgColor" (ngModelChange)="updateColorField('tableHeaderBgColor', $event)"></label><label><span>Category BG</span><input type="color" [ngModel]="settings().groupHeaderBgColor" (ngModelChange)="updateColorField('groupHeaderBgColor', $event)"><input [ngModel]="settings().groupHeaderBgColor" (ngModelChange)="updateColorField('groupHeaderBgColor', $event)"></label><label><span>Sub Header BG</span><input type="color" [ngModel]="settings().sectionHeaderBgColor" (ngModelChange)="updateColorField('sectionHeaderBgColor', $event)"><input [ngModel]="settings().sectionHeaderBgColor" (ngModelChange)="updateColorField('sectionHeaderBgColor', $event)"></label><label><span>High Result</span><input type="color" [ngModel]="settings().highColor" (ngModelChange)="updateColorField('highColor', $event)"><input [ngModel]="settings().highColor" (ngModelChange)="updateColorField('highColor', $event)"></label><label><span>Low Result</span><input type="color" [ngModel]="settings().lowColor" (ngModelChange)="updateColorField('lowColor', $event)"><input [ngModel]="settings().lowColor" (ngModelChange)="updateColorField('lowColor', $event)"></label><label><span>Normal Result Size</span><input type="number" min="6" max="30" step="0.5" [ngModel]="settings().resultFontSize" (ngModelChange)="updateField('resultFontSize', $event)"></label><label><span>Abnormal Size</span><input type="number" min="6" max="30" step="0.5" [ngModel]="settings().resultAbnormalFontSize" (ngModelChange)="updateField('resultAbnormalFontSize', $event)"></label></div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Flag Rules, Symbols & Reference Source</h4><p>Default is text flags because H / L / CH / CL are safest for medical PDFs. Use Symbols only when the selected flag font supports arrows/triangles.</p></div><div class="mini-grid four"><label><span>Flag / Abnormal Mode</span><select [ngModel]="settings().tableFlagMode" (ngModelChange)="updateField('tableFlagMode', normalizeFlagMode($event))"><option value="none">None - no flag or abnormal logic</option><option value="range_only">Normal Range Only</option><option value="flag_only">Flag Only</option><option value="flag_abnormal">Flag + Abnormal Styling</option><option value="critical_flag_abnormal">Critical + Flag + Abnormal Styling</option></select></label><label><span>Reference Source</span><select [ngModel]="settings().referenceSource" (ngModelChange)="updateField('referenceSource', normalizeReferenceSource($event))"><option value="saved">Saved / Manual Reference</option><option value="generated_only">Generated Reference Only</option></select></label><label><span>Flag Display Type</span><select [ngModel]="settings().tableFlagDisplayMode" (ngModelChange)="updateField('tableFlagDisplayMode', normalizeFlagDisplayMode($event))"><option value="text">Text - safest default</option><option value="symbol">Symbol text / Unicode</option><option value="drawn_arrow">Drawn arrow - no row height increase</option><option value="custom">Custom typed values</option></select></label><label><span>Flag Symbol Set</span><select [ngModel]="settings().tableFlagSymbolPreset" (ngModelChange)="applyFlagSymbolPreset($event)"><option value="text">Text: H / L / CH / CL</option><option value="arrows">Arrows: ↑ / ↓ / ↑↑ / ↓↓</option><option value="triangles">Triangles: ▲ / ▼ / ▲▲ / ▼▼</option><option value="plus_minus">Plus / Minus: + / - / ++ / --</option><option value="custom">Custom - keep typed values</option></select></label><label><span>High Flag</span><input [ngModel]="settings().highFlagText" (ngModelChange)="updateFlagText('highFlagText', $event)" placeholder="H"></label><label><span>Low Flag</span><input [ngModel]="settings().lowFlagText" (ngModelChange)="updateFlagText('lowFlagText', $event)" placeholder="L"></label><label><span>Critical High Flag</span><input [ngModel]="settings().criticalHighFlagText" (ngModelChange)="updateFlagText('criticalHighFlagText', $event)" placeholder="CH"></label><label><span>Critical Low Flag</span><input [ngModel]="settings().criticalLowFlagText" (ngModelChange)="updateFlagText('criticalLowFlagText', $event)" placeholder="CL"></label><label><span>Drawn Arrow Size mm</span><input type="number" min="1" max="8" step="0.1" [ngModel]="settings().tableFlagDrawnArrowSizeMm" (ngModelChange)="updateField('tableFlagDrawnArrowSizeMm', $event)"></label><label><span>Drawn Arrow Stroke</span><input type="number" min="0.3" max="3" step="0.1" [ngModel]="settings().tableFlagDrawnArrowStrokeWidth" (ngModelChange)="updateField('tableFlagDrawnArrowStrokeWidth', $event)"></label></div><div class="field-help"><b>Recommended default:</b> Text flags with H / L / CH / CL and Flag Text / Arrow font = Noto Sans. For arrows without taller rows, use Flag Display Type = Drawn arrow. Drawn arrows use PDF canvas, so font size does not increase cell padding/row height. Use __blank__ to print nothing.</div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Interpretation Printing</h4><p>Test Master and Profile Master can store rich interpretation HTML. This switch decides whether those interpretations are printed in the report table.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().interpretationEnabled" (ngModelChange)="updateField('interpretationEnabled', $event)"><span>Print interpretations in report</span></label><label><span>Source</span><select [ngModel]="settings().interpretationSource" (ngModelChange)="updateField('interpretationSource', normalizeInterpretationSource($event))"><option value="both">Test + Profile</option><option value="test">Test only</option><option value="profile">Profile only</option></select></label><label><span>Placement Rule</span><input value="Auto structured: test after test, profile after group end" readonly></label><label class="check-card"><input type="checkbox" [ngModel]="settings().interpretationShowLabel" (ngModelChange)="updateField('interpretationShowLabel', $event)"><span>Show label</span></label><label><span>Label Text</span><input [ngModel]="settings().interpretationLabel" (ngModelChange)="updateField('interpretationLabel', $event)" placeholder="Interpretation"></label><label class="check-card"><input type="checkbox" [ngModel]="settings().interpretationShowBorder" (ngModelChange)="updateField('interpretationShowBorder', $event)"><span>Box border</span></label><label><span>Background</span><input type="color" [ngModel]="settings().interpretationBgColor" (ngModelChange)="updateColorField('interpretationBgColor', $event)"><input [ngModel]="settings().interpretationBgColor" (ngModelChange)="updateColorField('interpretationBgColor', $event)"></label><label><span>Top Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().interpretationMarginTopMm" (ngModelChange)="updateField('interpretationMarginTopMm', $event)"></label><label><span>Bottom Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().interpretationMarginBottomMm" (ngModelChange)="updateField('interpretationMarginBottomMm', $event)"></label></div><div class="field-help"><b>Rule:</b> Test interpretation prints immediately after that test. Profile/group interpretation prints after that group ends. When a whole profile contains child profiles, child interpretations print after each child group, then the whole profile interpretation prints at the end. Master + Report Settings must both allow interpretation printing.</div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Test Remarks Printing</h4><p>Per-test remarks typed under each result row during reporting.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().remarksEnabled" (ngModelChange)="updateField('remarksEnabled', $event)"><span>Print test remarks</span></label><label><span>Placement Rule</span><input value="Auto: immediately after that result row" readonly></label><label class="check-card"><input type="checkbox" [ngModel]="settings().remarksShowLabel" (ngModelChange)="updateField('remarksShowLabel', $event)"><span>Show label</span></label><label><span>Label Text</span><input [ngModel]="settings().remarksLabel" (ngModelChange)="updateField('remarksLabel', $event)" placeholder="Remarks"></label><label class="check-card"><input type="checkbox" [ngModel]="settings().remarksShowBorder" (ngModelChange)="updateField('remarksShowBorder', $event)"><span>Box border</span></label><label><span>Background</span><input type="color" [ngModel]="settings().remarksBgColor" (ngModelChange)="updateColorField('remarksBgColor', $event)"><input [ngModel]="settings().remarksBgColor" (ngModelChange)="updateColorField('remarksBgColor', $event)"></label><label><span>Top Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().remarksMarginTopMm" (ngModelChange)="updateField('remarksMarginTopMm', $event)"></label><label><span>Bottom Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().remarksMarginBottomMm" (ngModelChange)="updateField('remarksMarginBottomMm', $event)"></label></div><div class="field-help"><b>Rule:</b> Test remarks print immediately after that test row. Typography is under Fonts → Test Remarks Text.</div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Profile Remarks Printing</h4><p>Whole-profile remarks typed on the profile card during reporting. Printed after all tests in that profile, before profile interpretation.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().profileRemarksEnabled" (ngModelChange)="updateField('profileRemarksEnabled', $event)"><span>Print profile remarks</span></label><label><span>Placement Rule</span><input value="Auto: after profile tests, before interpretation" readonly></label><label class="check-card"><input type="checkbox" [ngModel]="settings().profileRemarksShowLabel" (ngModelChange)="updateField('profileRemarksShowLabel', $event)"><span>Show label</span></label><label><span>Label Text</span><input [ngModel]="settings().profileRemarksLabel" (ngModelChange)="updateField('profileRemarksLabel', $event)" placeholder="Profile Remarks"></label><label class="check-card"><input type="checkbox" [ngModel]="settings().profileRemarksShowBorder" (ngModelChange)="updateField('profileRemarksShowBorder', $event)"><span>Box border</span></label><label><span>Background</span><input type="color" [ngModel]="settings().profileRemarksBgColor" (ngModelChange)="updateColorField('profileRemarksBgColor', $event)"><input [ngModel]="settings().profileRemarksBgColor" (ngModelChange)="updateColorField('profileRemarksBgColor', $event)"></label><label><span>Top Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().profileRemarksMarginTopMm" (ngModelChange)="updateField('profileRemarksMarginTopMm', $event)"></label><label><span>Bottom Gap mm</span><input type="number" min="0" max="30" step="0.5" [ngModel]="settings().profileRemarksMarginBottomMm" (ngModelChange)="updateField('profileRemarksMarginBottomMm', $event)"></label></div><div class="field-help"><b>Rule:</b> Profile remarks print once after the profile’s last test (and its test remarks), then profile interpretation. Typography is under Fonts → Profile Remarks Text.</div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Specimen / Method</h4><p>Reference is always visible. Specimen and method can be placed/styled independently. Collection type (Random / Fasting / …) is off by default.</p></div><div class="mini-grid four"><label class="check-card"><input type="checkbox" [ngModel]="settings().specimenVisible" (ngModelChange)="updateField('specimenVisible', $event)"><span>Show specimen</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().specimenVisible" [ngModel]="settings().collectionVisible" (ngModelChange)="updateField('collectionVisible', $event)"><span>Show collection type</span></label><label><span>Specimen Placement</span><select [ngModel]="settings().specimenPlacement" (ngModelChange)="updateField('specimenPlacement', $event)"><option value="under-test">Under test name</option><option value="above-test">Above test name</option><option value="same-line">Same line after test</option><option value="separate-column">Separate column</option><option value="hidden">Hidden</option></select></label><label><span>Specimen Prefix</span><input [ngModel]="settings().specimenPrefix" (ngModelChange)="updateField('specimenPrefix', $event)" placeholder="Specimen:"></label><label class="check-card"><input type="checkbox" [ngModel]="settings().methodVisible" (ngModelChange)="updateField('methodVisible', $event)"><span>Show method</span></label><label><span>Method Placement</span><select [ngModel]="settings().methodPlacement" (ngModelChange)="updateField('methodPlacement', $event)"><option value="under-reference">Under reference</option><option value="above-reference">Above reference</option><option value="under-test">Under test name</option><option value="separate-column">Separate column</option><option value="hidden">Hidden</option></select></label><label><span>Method Prefix</span><input [ngModel]="settings().methodPrefix" (ngModelChange)="updateField('methodPrefix', $event)" placeholder="Method:"></label><label><span>Reference</span><input readonly value="Always visible"></label></div></section>
            <section class="mini-editor"><div class="mini-title"><h4>Report Table Column Arrangement, Labels & Widths</h4><p>This is the only place for report-table column order, header names and visible column widths. Width rows below rebuild from the arrangement plus specimen, method and flag placement settings.</p></div>
              <div class="form-grid"><label class="check-card"><input type="checkbox" [ngModel]="settings().tableFlagsEnabled" (ngModelChange)="updateField('tableFlagsEnabled', $event)"><span>Enable flags</span></label><label class="check-card"><input type="checkbox" [disabled]="!settings().tableFlagsEnabled || settings().tableFlagMode === 'none' || settings().tableFlagMode === 'range_only'" [ngModel]="settings().tableShowFlagColumn" (ngModelChange)="updateField('tableShowFlagColumn', $event)"><span>Show flags as separate column (then Flag Width appears)</span></label></div>
              <label><span>Column Arrangement</span><textarea rows="2" [ngModel]="settings().tableColumnArrangement" (ngModelChange)="updateField('tableColumnArrangement', $event)" placeholder="test_specimen,result_flag,unit,reference_method"></textarea></label>
              <div class="field-help">Available keys: test_specimen, test, specimen, result_flag, result, flag, unit, reference_method, reference, method. Combined keys stay combined unless Specimen / Method / Flag is set to a separate column. Reference is always available. Hidden columns do not consume width. Label override: leave empty for default label, type __blank__ to print a blank header cell.</div>
              <div class="column-config-list">
                <div class="column-config-row" *ngFor="let col of tableArrangementColumns(); trackBy: trackColumnKey">
                  <div class="column-key">{{ col.key }}</div>
                  <label><span>Column Label</span><input [ngModel]="tableColumnLabelValue(col.key)" (ngModelChange)="updateTableColumnLabel(col.key, $event)"></label>
                  <label><span>Width %</span><input type="number" min="1" max="90" step="0.5" [ngModel]="tableColumnWidthValue(col.key)" (ngModelChange)="updateTableColumnWidth(col.key, $event)"></label>
                  <label><span>Header Align</span><select [ngModel]="tableColumnHeaderAlignValue(col.key)" (ngModelChange)="updateTableColumnHeaderAlign(col.key, $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                  <label><span>Body Horizontal Align</span><select [ngModel]="tableColumnBodyAlignValue(col.key)" (ngModelChange)="updateTableColumnBodyAlign(col.key, $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
                  <label class="check-card compact" *ngIf="tableColumnBodyAlignValue(col.key) === 'center'"><input type="checkbox" [ngModel]="tableColumnBodyVerticalCenterValue(col.key)" (ngModelChange)="updateTableColumnBodyVerticalCenter(col.key, $event)"><span>Body Vertical Center</span></label>
                </div>
              </div>
              <div class="width-total" [class.warn]="tableArrangementWidthTotal() !== 100">Visible Width Total: {{ tableArrangementWidthTotal() }}%</div>
            </section>
          </div>

          <div *ngSwitchCase="'rules'" class="step-card">
            <div class="step-card-header"><div><h3>HR / End</h3><p>Horizontal rules and end-of-report text only. Signatures are managed in the separate Signatures step.</p></div><span class="step-pill">End Report</span></div>
            <section class="mini-editor"><div class="mini-title"><h4>Horizontal Rules</h4><p>Any number of HR lines. One per line: <b>placement|marginTop|thickness|color|marginBottom|xOffset|width%</b>. Place multiple lines one after another. Placements: after-institution, before-patient, after-patient, before-title, after-title, after-subtitle, before-table, end, before-footer, footer.</p></div><textarea rows="5" [ngModel]="settings().hrLinesConfig" (ngModelChange)="updateField('hrLinesConfig', $event)"></textarea></section>
            <section class="mini-editor"><div class="mini-title"><h4>End of Report Text</h4><p>Optional text printed below the result table.</p></div><div class="form-grid"><label><span>Alignment</span><select [ngModel]="settings().endReportAlignment" (ngModelChange)="updateField('endReportAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Top Gap (mm)</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().endReportMarginTopMm" (ngModelChange)="updateField('endReportMarginTopMm', $event)"></label><label><span>X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().endReportOffsetXMm" (ngModelChange)="updateField('endReportOffsetXMm', $event)"></label><label><span>Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().endReportOffsetYMm" (ngModelChange)="updateField('endReportOffsetYMm', $event)"></label></div><textarea rows="3" [ngModel]="settings().endReportText" (ngModelChange)="updateField('endReportText', $event)"></textarea></section>
            
          </div>


          <div *ngSwitchCase="'signatures'" class="step-card">
            <div class="step-card-header"><div><h3>Signature Settings</h3><p>Add, delete, align and style report signatures. This is separate from HR / End settings.</p></div><span class="step-pill">Signatures</span></div>
            <section class="mini-editor signature-editor"><div class="mini-title"><h4>Signatures</h4><p>Create, edit, delete, enable and arrange any number of report signatures. Old single-signature controls are removed from the UI; this visual editor saves the advanced signature layout for PDF.</p></div><div class="form-grid"><label class="check-card"><input type="checkbox" [ngModel]="settings().signatureAdvancedEnabled" (ngModelChange)="updateField('signatureAdvancedEnabled', $event)"><span>Enable signatures in PDF</span></label><label><span>Empty wording line behavior</span><select [ngModel]="settings().signatureEmptyLineMode" (ngModelChange)="updateField('signatureEmptyLineMode', $event)"><option value="reserve">Reserve space to keep all signs aligned</option><option value="compact">Skip empty wording lines</option></select></label></div><div class="mini-grid five"><label><span>Row Top Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().signatureRowTopMarginMm" (ngModelChange)="updateField('signatureRowTopMarginMm', $event)"></label><label><span>Row Bottom Margin</span><input type="number" min="0" max="100" step="0.5" [ngModel]="settings().signatureRowBottomMarginMm" (ngModelChange)="updateField('signatureRowBottomMarginMm', $event)"></label><label><span>Column Gap</span><input type="number" min="0" max="50" step="0.5" [ngModel]="settings().signatureColumnGapMm" (ngModelChange)="updateField('signatureColumnGapMm', $event)"></label><label><span>Image Zone Height</span><input type="number" min="0" max="80" step="0.5" [ngModel]="settings().signatureImageZoneHeightMm" (ngModelChange)="updateField('signatureImageZoneHeightMm', $event)"></label><label><span>Image to Text Gap</span><input type="number" min="0" max="40" step="0.5" [ngModel]="settings().signatureImageTextGapMm" (ngModelChange)="updateField('signatureImageTextGapMm', $event)"></label><label><span>Line 1 Height</span><input type="number" min="0.7" max="3" step="0.05" [ngModel]="settings().signatureLine1Height" (ngModelChange)="updateField('signatureLine1Height', $event)"></label><label><span>Line 2 Height</span><input type="number" min="0.7" max="3" step="0.05" [ngModel]="settings().signatureLine2Height" (ngModelChange)="updateField('signatureLine2Height', $event)"></label><label><span>Line 3 Height</span><input type="number" min="0.7" max="3" step="0.05" [ngModel]="settings().signatureLine3Height" (ngModelChange)="updateField('signatureLine3Height', $event)"></label><label><span>Line 4 Height</span><input type="number" min="0.7" max="3" step="0.05" [ngModel]="settings().signatureLine4Height" (ngModelChange)="updateField('signatureLine4Height', $event)"></label></div><div class="action-row"><button mat-flat-button color="primary" type="button" (click)="addSignatureBlock()">Add Signature</button><button mat-stroked-button type="button" (click)="save()" [disabled]="saving()">Save Signature Settings</button></div><div class="signature-card" *ngFor="let sign of signatureBlocks(); let i = index; trackBy: trackSignatureBlock"><div class="signature-card-head"><div><h4>Signature {{ i + 1 }}</h4><p>{{ sign.lines?.[0]?.text || sign.lines?.[1]?.text || 'New signature' }}</p></div><div class="action-row compact"><button mat-stroked-button type="button" (click)="moveSignatureBlock(i, -1)" [disabled]="i === 0">Up</button><button mat-stroked-button type="button" (click)="moveSignatureBlock(i, 1)" [disabled]="i === signatureBlocks().length - 1">Down</button><button mat-stroked-button class="danger-soft" type="button" (click)="deleteSignatureBlock(i)">Delete</button></div></div><div class="form-grid"><label class="check-card compact"><input type="checkbox" [ngModel]="sign.enabled !== false" (ngModelChange)="updateSignatureBlock(i, 'enabled', $event)"><span>Enable this signature</span></label><label><span>Whole Block Position</span><select [ngModel]="sign.position || 'left'" (ngModelChange)="updateSignatureBlock(i, 'position', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Default Text Alignment</span><select [ngModel]="sign.textAlignment || 'center'" (ngModelChange)="updateSignatureBlock(i, 'textAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label><span>Image Alignment</span><select [ngModel]="sign.imageAlignment || 'center'" (ngModelChange)="updateSignatureBlock(i, 'imageAlignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label></div><div class="mini-grid five"><label><span>Block Left Margin</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.blockLeftMarginMm" (ngModelChange)="updateSignatureBlock(i, 'blockLeftMarginMm', $event)"></label><label><span>Block Right Margin</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.blockRightMarginMm" (ngModelChange)="updateSignatureBlock(i, 'blockRightMarginMm', $event)"></label><label><span>Block Top Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.blockTopOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'blockTopOffsetMm', $event)"></label><label><span>Block Bottom Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.blockBottomOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'blockBottomOffsetMm', $event)"></label><label><span>Row No.</span><input type="number" min="0" max="99" step="1" [ngModel]="sign.row || 0" (ngModelChange)="updateSignatureBlock(i, 'row', $event)"></label></div><div class="mini-grid five"><label><span>Image Width</span><input type="number" min="0" max="120" step="0.5" [ngModel]="sign.imageWidthMm" (ngModelChange)="updateSignatureBlock(i, 'imageWidthMm', $event)"></label><label><span>Image Height</span><input type="number" min="0" max="80" step="0.5" [ngModel]="sign.imageHeightMm" (ngModelChange)="updateSignatureBlock(i, 'imageHeightMm', $event)"></label><label><span>Image Left Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.imageLeftOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'imageLeftOffsetMm', $event)"></label><label><span>Image Right Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.imageRightOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'imageRightOffsetMm', $event)"></label><label><span>Image Top Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.imageTopOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'imageTopOffsetMm', $event)"></label><label><span>Image Bottom Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="sign.imageBottomOffsetMm" (ngModelChange)="updateSignatureBlock(i, 'imageBottomOffsetMm', $event)"></label></div><div class="form-grid"><div class="action-row compact"><button mat-stroked-button type="button" (click)="chooseAdvancedSignImage(i)">Upload / Change Sign Image</button><button mat-stroked-button type="button" (click)="clearAdvancedSignImage(i)" [disabled]="!sign.imagePath">Clear Image</button></div><label><span>Image Path</span><input readonly [ngModel]="sign.imagePath || 'No sign image selected'"></label></div><div class="signature-lines"><div class="signature-line-row" *ngFor="let line of signatureLines(sign); let li = index; trackBy: trackSignatureLine"><b>Line {{ li + 1 }}</b><input [ngModel]="line.text" (ngModelChange)="updateSignatureLine(i, li, 'text', $event)" [placeholder]="signatureLinePlaceholder(li)"><select [ngModel]="line.fontFamily || 'Roboto'" (ngModelChange)="updateSignatureLine(i, li, 'fontFamily', $event)"><option *ngFor="let font of supportedReportFonts" [value]="font.value">{{ font.label }}</option></select><input type="number" min="6" max="30" step="0.5" [ngModel]="line.fontSize || defaultSignatureLineSize(li)" (ngModelChange)="updateSignatureLine(i, li, 'fontSize', $event)"><input type="color" [ngModel]="line.color || '#111111'" (ngModelChange)="updateSignatureLine(i, li, 'color', $event)"><select [ngModel]="line.alignment || sign.textAlignment || 'center'" (ngModelChange)="updateSignatureLine(i, li, 'alignment', $event)"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select><label class="inline-check"><input type="checkbox" [ngModel]="!!line.bold" (ngModelChange)="updateSignatureLine(i, li, 'bold', $event)">Bold</label><label class="inline-check"><input type="checkbox" [ngModel]="!!line.italic" (ngModelChange)="updateSignatureLine(i, li, 'italic', $event)">Italic</label><label class="inline-check"><input type="checkbox" [ngModel]="!!line.underline" (ngModelChange)="updateSignatureLine(i, li, 'underline', $event)">Underline</label></div></div></div><p class="hint">The PDF keeps each full signature row together. Empty wording lines are either reserved for alignment or skipped based on the setting above.</p></section>
          </div>

          <div *ngSwitchCase="'background'" class="step-card"><div class="step-card-header"><div><h3>Background / Watermark Settings</h3><p>Use full-page backgrounds for letterhead. Use body watermark mode with low opacity when the image should blend behind report content.</p></div><button mat-stroked-button type="button" (click)="chooseBackground()">Upload / Change Background</button></div><div class="background-card" [class.disabled]="!settings().backgroundEnabled"><label class="check-card"><input type="checkbox" [ngModel]="settings().backgroundEnabled" (ngModelChange)="updateField('backgroundEnabled', $event)"><span>Enable background prompt</span></label><div class="background-copy"><h4>{{ settings().backgroundImagePath ? 'Background selected' : 'No background image selected' }}</h4><p>{{ settings().backgroundImagePath || 'Upload a JPG/PNG background or body watermark image for printed reports.' }}</p><div class="action-row compact"><button mat-stroked-button type="button" (click)="chooseBackground()">Upload / Change</button><button mat-stroked-button type="button" (click)="clearBackground()" [disabled]="!settings().backgroundImagePath">Clear</button></div></div></div><section class="mini-editor"><div class="mini-title"><h4>Image Blend / Watermark</h4><p>pdfmake does not support real Photoshop-style blend modes, so this uses safe PDF opacity, size and placement. Default is Normal full-page background. For a body watermark, use Body Watermark + Very Light or Faint.</p></div><div class="mini-grid four"><label><span>Image Area</span><select [ngModel]="settings().backgroundImageArea" (ngModelChange)="updateField('backgroundImageArea', normalizeBackgroundImageArea($event))"><option value="full_page">Full page / letterhead</option><option value="body_watermark">Body watermark</option></select></label><label><span>Blend Preset</span><select [ngModel]="settings().backgroundImageBlendPreset" (ngModelChange)="applyBackgroundBlendPreset($event)"><option value="normal">Normal - 100%</option><option value="light">Light - 35%</option><option value="very_light">Very Light - 18%</option><option value="faint">Faint watermark - 8%</option><option value="custom">Custom opacity</option></select></label><label><span>Image Opacity</span><input type="number" min="0.01" max="1" step="0.01" [ngModel]="settings().backgroundImageOpacity" (ngModelChange)="updateBackgroundOpacity($event)"></label><label><span>Full Page Fit</span><select [ngModel]="settings().backgroundImageFit" (ngModelChange)="updateField('backgroundImageFit', normalizeBackgroundImageFit($event))"><option value="cover">Cover page</option><option value="contain">Contain inside page</option><option value="stretch">Stretch exact page</option></select></label><label><span>Watermark Width %</span><input type="number" min="10" max="100" step="1" [ngModel]="settings().backgroundImageWatermarkWidthPct" (ngModelChange)="updateField('backgroundImageWatermarkWidthPct', percentFullValue($event, 62))"></label><label><span>Watermark X Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().backgroundImageOffsetXMm" (ngModelChange)="updateField('backgroundImageOffsetXMm', signedNumberValue($event, 0))"></label><label><span>Watermark Y Offset</span><input type="number" min="-100" max="100" step="0.5" [ngModel]="settings().backgroundImageOffsetYMm" (ngModelChange)="updateField('backgroundImageOffsetYMm', signedNumberValue($event, 0))"></label></div><div class="field-help"><b>Suggested watermark default:</b> Image Area = Body watermark, Blend Preset = Faint or Very Light, Width = 55-70%. This keeps patient/test text readable while showing the watermark in the body.</div></section></div>
        </ng-container></section>
      </mat-card>
      <div class="preview-backdrop" *ngIf="previewOpen()" role="dialog" aria-modal="true">
        <div class="preview-card">
          <div class="preview-head"><div><h3>{{ previewTitle() }}</h3><p>Saved Report Settings are applied to this sample PDF.</p></div><button mat-stroked-button type="button" (click)="closePreview()">Close</button></div>
          <div class="preview-frame-wrap"><iframe *ngIf="previewDataUrl()" [src]="previewDataUrl()" title="Report settings preview"></iframe><div class="preview-loading" *ngIf="previewLoading()">Generating preview...</div></div>
        </div>
      </div>
      <div class="confirm-backdrop" *ngIf="resetConfirmOpen()" role="dialog" aria-modal="true">
        <div class="confirm-card">
          <div class="confirm-icon">!</div>
          <h3>Reset Report Settings?</h3>
          <p>This will replace the current report design settings with the default uploaded design. Your current custom spacing, colors, patient fields, table styles, barcode, method/reference, and footer/header settings will be lost.</p>
          <div class="action-row compact confirm-actions"><button mat-stroked-button type="button" (click)="cancelResetDefaults()">Cancel</button><button mat-flat-button color="warn" type="button" (click)="confirmResetDefaults()" [disabled]="saving()">Reset to Default</button></div>
        </div>
      </div>
    </main>
  `,
  styles: [`
    :host { display:block; height:100%; min-height:0; --rs-surface: var(--panel); --rs-surface-soft: var(--row); --rs-field: var(--input, var(--panel2)); --rs-field-border: var(--border); --rs-muted: var(--muted); --rs-scroll: var(--scroll, rgba(99,102,241,.42)); }
    .report-settings-content { height:100%; min-height:0; overflow:hidden; padding:12px; color:var(--text); }
    .report-settings-panel { height:100%; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding:0!important; background:transparent!important; box-shadow:none!important; border:0!important; color:var(--text)!important; }
    .report-workflow-head { display:flex; flex-direction:column; gap:0!important; padding:0!important; flex:0 0 auto; }
    .report-title-row { display:flex; align-items:center; justify-content:flex-end; gap:12px; border:1px solid var(--border); border-radius:18px 18px 0 0; background:linear-gradient(145deg,var(--rs-surface),color-mix(in srgb,var(--rs-surface) 78%,var(--rs-surface-soft))); padding:10px 12px; box-shadow:0 10px 26px rgba(2,6,23,.10); }
    .report-actions-only { justify-content:flex-end; }
    .report-actions-only .settings-actions { width:100%; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
    .settings-actions { flex:0 0 auto; }
    .danger-soft { border-color:rgba(239,68,68,.45)!important; color:#ef4444!important; }
    .preset-row { display:flex; gap:8px; flex-wrap:wrap; } .preset-row button { border:1px solid var(--border); border-radius:999px; background:var(--rs-field); color:var(--text); padding:7px 10px; font-weight:850; cursor:pointer; }
    .field-help { border:1px dashed var(--border); border-radius:14px; padding:10px 12px; color:var(--muted); font-size:12px; background:color-mix(in srgb,var(--rs-surface) 74%,var(--rs-surface-soft)); display:grid; gap:8px; }
    .field-chip-row { display:flex; gap:7px; flex-wrap:wrap; }
    .field-chip-row code { border:1px solid var(--border); border-radius:999px; padding:4px 8px; background:var(--rs-field); color:var(--text); font-size:11px; font-weight:900; }
    .wide-field textarea { min-height:132px; font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace; line-height:1.45; }
    .column-config-list { display:grid; gap:10px; }
    .column-config-row { display:grid; grid-template-columns:minmax(110px,.65fr) minmax(170px,1.1fr) minmax(85px,.45fr) minmax(115px,.65fr) minmax(150px,.8fr) minmax(150px,.8fr); gap:10px; align-items:end; border:1px solid var(--border); border-radius:14px; padding:10px; background:color-mix(in srgb,var(--rs-surface) 78%,var(--rs-surface-soft)); }
    .column-key { min-height:42px; display:flex; align-items:center; padding:0 10px; border:1px solid var(--border); border-radius:12px; color:var(--text); font-weight:950; background:var(--rs-field); word-break:break-word; }
    .width-total { justify-self:start; border:1px solid rgba(16,185,129,.45); color:#34d399; border-radius:999px; padding:7px 11px; font-weight:950; font-size:12px; }
    .width-total.warn { border-color:rgba(239,68,68,.55); color:#f87171; }
    .confirm-backdrop { position:fixed; inset:0; z-index:1000; display:grid; place-items:center; background:rgba(2,6,23,.58); backdrop-filter:blur(5px); padding:20px; }
    .confirm-card { width:min(520px,100%); border:1px solid var(--border); border-radius:24px; padding:22px; background:var(--rs-surface); color:var(--text); box-shadow:0 28px 80px rgba(0,0,0,.35); display:grid; gap:12px; }
    .confirm-icon { width:44px; height:44px; border-radius:15px; display:grid; place-items:center; background:rgba(239,68,68,.14); color:#ef4444; font-size:24px; font-weight:950; }
    .confirm-card h3 { margin:0; } .confirm-card p { margin:0; color:var(--muted); line-height:1.5; } .confirm-actions { justify-content:flex-end; }
    .preview-backdrop { position:fixed; inset:0; z-index:1001; display:grid; place-items:center; background:rgba(2,6,23,.62); backdrop-filter:blur(5px); padding:18px; }
    .preview-card { width:min(1120px,96vw); height:min(840px,94vh); display:flex; flex-direction:column; border:1px solid var(--border); border-radius:24px; background:var(--rs-surface); color:var(--text); box-shadow:0 28px 80px rgba(0,0,0,.38); overflow:hidden; }
    .preview-head { flex:0 0 auto; display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid var(--border); background:color-mix(in srgb,var(--rs-surface) 86%,var(--rs-surface-soft)); }
    .preview-head h3, .preview-head p { margin:0; } .preview-head p { color:var(--muted); font-size:12px; font-weight:750; margin-top:3px; }
    .preview-frame-wrap { position:relative; flex:1 1 auto; min-height:0; background:color-mix(in srgb,var(--rs-surface) 70%,#000); }
    .preview-frame-wrap iframe { width:100%; height:100%; border:0; background:#fff; }
    .preview-loading { position:absolute; inset:0; display:grid; place-items:center; color:var(--text); font-weight:950; background:rgba(2,6,23,.35); }
    .report-workflow-tabs { display:flex; flex-wrap:nowrap; gap:7px; border:1px solid var(--border); border-top:0; border-radius:0 0 18px 18px; background:var(--rs-surface); padding:7px; box-sizing:border-box; box-shadow:0 8px 22px rgba(2,6,23,.10); overflow-x:auto; overflow-y:hidden; cursor:grab; user-select:none; scrollbar-width:thin; scrollbar-color:var(--rs-scroll) transparent; -webkit-overflow-scrolling:touch; }
    .report-workflow-tabs.dragging { cursor:grabbing; }
    .report-workflow-tabs button { height:38px; border:0; border-radius:13px; background:transparent; color:var(--muted); font-weight:950; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:7px; min-width:145px; flex:0 0 145px; padding:0 10px; white-space:nowrap; transition:background .16s ease,color .16s ease,box-shadow .16s ease; }
    .report-workflow-tabs button span { min-width:0; overflow:hidden; text-overflow:ellipsis; font-size:12px; }
    .report-workflow-tabs button b { min-width:22px; height:21px; border-radius:999px; display:inline-grid; place-items:center; background:var(--row); font-size:10px; color:var(--text); padding:0 6px; border:1px solid var(--border); order:-1; }
    .report-workflow-tabs button.active { background:var(--accent-gradient); color:#fff; box-shadow:var(--glow); }
    .report-workflow-tabs button.active b { background:rgba(255,255,255,.22); border-color:rgba(255,255,255,.28); color:#fff; }
    .settings-step-content { min-height:0; overflow-y:auto; overflow-x:hidden; padding:10px 8px 60px 0; scrollbar-width:thin; scrollbar-color:var(--rs-scroll) transparent; scrollbar-gutter:stable; }
    .step-card { display:grid; gap:16px; }
    .step-card-header { display:flex; justify-content:space-between; gap:16px; align-items:flex-start; border:1px solid var(--border); border-radius:20px; padding:16px; background:color-mix(in srgb,var(--rs-surface) 82%,var(--rs-surface-soft)); }
    .step-card-header h3, .mini-title h4 { margin:0 0 4px; } .step-card-header p, .mini-title p { margin:0; color:var(--muted); }
    .step-pill { border:1px solid rgba(99,102,241,.35); color:#c4b5fd; border-radius:999px; padding:6px 10px; font-size:12px; font-weight:900; }
    .layout-profile-card { display:grid; gap:14px; border:1px solid var(--border); border-radius:20px; padding:14px; background:color-mix(in srgb,var(--rs-surface) 88%,var(--rs-surface-soft)); box-shadow:0 10px 24px rgba(2,6,23,.08); }
    .layout-profile-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding-bottom:10px; border-bottom:1px solid var(--border); }
    .layout-profile-head h4, .layout-profile-head p { margin:0; }
    .layout-profile-head p { color:var(--muted); font-size:12px; font-weight:750; margin-top:3px; }
    .mini-editor { border:1px solid var(--border); border-radius:18px; padding:14px; background:color-mix(in srgb,var(--rs-surface) 82%,var(--rs-surface-soft)); display:grid; gap:12px; }
    .form-grid, .mini-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px; }
    .form-grid.two { grid-template-columns:repeat(2, minmax(0,1fr)); } .mini-grid.five { grid-template-columns:repeat(5, minmax(0,1fr)); } .mini-grid.four { grid-template-columns:repeat(4, minmax(0,1fr)); }
    label { display:grid; gap:6px; color:var(--muted); font-size:12px; font-weight:850; }
    input, select, textarea { width:100%; border:1px solid var(--rs-field-border); border-radius:12px; background:var(--rs-field); color:var(--text); min-height:42px; padding:9px 10px; outline:none; box-shadow:none; }
    input:focus, select:focus, textarea:focus { border-color:color-mix(in srgb,var(--accent) 70%,#ffffff); box-shadow:0 0 0 3px var(--accent-soft); }
    select option { background:var(--rs-surface); color:var(--text); }
    input::placeholder, textarea::placeholder { color:var(--rs-muted); opacity:.72; }
    textarea { resize:vertical; min-height:84px; }
    input[type="color"] { padding:4px; }
    .check-card { display:flex; align-items:center; gap:10px; border:1px solid var(--border); border-radius:14px; padding:10px 12px; background:color-mix(in srgb,var(--rs-surface) 78%,var(--rs-surface-soft)); color:var(--text); }
    .check-card input, .inline-check input { width:auto; min-height:auto; }
    .font-config-grid { display:grid; gap:9px; }
    .font-config-row { display:grid; grid-template-columns:150px minmax(120px,1fr) 80px 58px auto auto; gap:8px; align-items:center; border:1px solid var(--border); border-radius:14px; padding:9px 10px; background:color-mix(in srgb,var(--rs-surface) 78%,var(--rs-surface-soft)); }
    .font-config-row b { color:var(--text); font-size:12px; }
    .inline-check { display:inline-flex; align-items:center; gap:6px; color:var(--muted); font-size:12px; font-weight:850; }
    .background-card { display:grid; grid-template-columns:230px minmax(0,1fr); gap:16px; border:1px dashed var(--border); border-radius:18px; padding:14px; background:color-mix(in srgb,var(--rs-surface) 78%,var(--rs-surface-soft)); }
    .background-card.disabled { opacity:.68; } .background-copy { display:grid; gap:8px; align-content:center; } .background-copy h4, .background-copy p { margin:0; word-break:break-all; } .background-copy p { color:var(--muted); }

    .settings-step-content::-webkit-scrollbar { width:8px; height:8px; }
    .settings-step-content::-webkit-scrollbar-track { background:transparent; border-radius:999px; }
    .settings-step-content::-webkit-scrollbar-thumb { background:var(--rs-scroll); border-radius:999px; border:2px solid transparent; background-clip:padding-box; }
    .settings-step-content::-webkit-scrollbar-thumb:hover { background:var(--accent); border:2px solid transparent; background-clip:padding-box; }
    .signature-card { border:1px solid var(--border); border-radius:18px; padding:12px; display:grid; gap:12px; background:color-mix(in srgb,var(--rs-surface) 76%,var(--rs-surface-soft)); }
    .signature-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; border-bottom:1px solid var(--border); padding-bottom:10px; }
    .signature-card-head h4, .signature-card-head p { margin:0; }
    .signature-card-head p { color:var(--muted); font-size:12px; margin-top:3px; }
    .signature-lines { display:grid; gap:8px; }
    .signature-line-row { display:grid; grid-template-columns:58px minmax(160px,1.2fr) minmax(140px,.9fr) 75px 54px 90px auto auto auto; gap:8px; align-items:center; border:1px solid var(--border); border-radius:14px; padding:8px; background:var(--rs-field); }
    .signature-line-row b { color:var(--text); font-size:12px; }
    .hint { margin:0; color:var(--muted); font-size:12px; line-height:1.45; }
    .report-workflow-tabs::-webkit-scrollbar { height:6px; }
    .report-workflow-tabs::-webkit-scrollbar-track { background:transparent; }
    .report-workflow-tabs::-webkit-scrollbar-thumb { background:var(--rs-scroll); border-radius:999px; }
    :host-context(body.light) .step-pill { color:#4f46e5; background:rgba(79,70,229,.08); }
    :host-context(body.light) .step-card-header,
    :host-context(body.light) .mini-editor,
    :host-context(body.light) .check-card,
    :host-context(body.light) .font-config-row,
    :host-context(body.light) .background-card { box-shadow:0 10px 28px rgba(15,23,42,.05); }
    :host-context(body.light) input,
    :host-context(body.light) select,
    :host-context(body.light) textarea { background:#ffffff; color:#0f172a; border-color:rgba(15,23,42,.13); }
    :host-context(body.light) select option { background:#ffffff; color:#0f172a; }
    @media(max-width:900px){ .report-title-row,.step-card-header,.background-card{display:grid;grid-template-columns:1fr;} .form-grid,.mini-grid,.mini-grid.five,.font-config-row,.column-config-row{grid-template-columns:1fr;} .report-workflow-tabs button{min-width:145px;flex-basis:145px;} }
  `]
})
export class ReportSettingsComponent implements OnInit {
  @ViewChild('stepperTrack') stepperTrack?: ElementRef<HTMLElement>;
  private snack = inject(MatSnackBar);
  private sanitizer = inject(DomSanitizer);
  settings = signal<SimpleReportSettings>({ ...DEFAULT_REPORT_SETTINGS });

  layoutProfiles: Array<{ id: 'withBg' | 'noBg'; label: string; hint: string }> = [
    { id: 'withBg', label: 'With background', hint: 'Used when printing/exporting with background enabled.' },
    { id: 'noBg', label: 'Without background', hint: 'Used for plain prints. Empty values fall back to With background.' }
  ];
  private readonly layoutDualKeys: Array<keyof SimpleReportSettings> = [
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
  ];
  private readonly layoutDualStyleKeys: Array<keyof SimpleReportSettings> = [
    'institutionNameStyle', 'institutionSubTextStyle', 'addressStyle', 'footerStyle', 'disclaimerStyle'
  ];
  noBgSettings = signal<Partial<SimpleReportSettings>>({});

  layoutField(profile: 'withBg' | 'noBg', key: keyof SimpleReportSettings): any {
    if (profile === 'withBg') return (this.settings() as any)[key];
    const own = (this.noBgSettings() as any)[key];
    return own !== undefined ? own : (this.settings() as any)[key];
  }
  layoutStyle(profile: 'withBg' | 'noBg', key: keyof SimpleReportSettings): ReportTextStyle {
    const value = this.layoutField(profile, key);
    return (value && typeof value === 'object') ? value as ReportTextStyle : { fontFamily: 'Roboto', fontSize: 9, bold: false, italic: false, color: '#111111' };
  }
  updateLayoutField(profile: 'withBg' | 'noBg', key: keyof SimpleReportSettings, value: any) {
    if (profile === 'withBg') {
      this.settings.update(c => ({ ...c, [key]: value } as SimpleReportSettings));
      return;
    }
    this.noBgSettings.update(c => ({ ...c, [key]: value }));
  }
  updateLayoutColorField(profile: 'withBg' | 'noBg', key: ReportColorKey, value: string) {
    const next = this.normalizeColor(value, String(this.layoutField(profile, key as any) || '#ffffff'));
    this.updateLayoutField(profile, key as any, next);
  }
  updateLayoutStyle(profile: 'withBg' | 'noBg', section: keyof SimpleReportSettings, key: keyof ReportTextStyle, value: any) {
    const cur = this.layoutStyle(profile, section);
    const nextVal = key === 'fontSize' ? this.fontSizeValue(value, cur.fontSize)
      : key === 'fontFamily' ? this.normalizeFontFamily(value)
      : key === 'color' ? this.normalizeColor(value, cur.color || '#111111')
      : !!value;
    this.updateLayoutField(profile, section, { ...cur, [key]: nextVal });
  }
  copyLayoutProfile(from: 'withBg' | 'noBg', to: 'withBg' | 'noBg') {
    if (from === to) return;
    const src = from === 'withBg' ? this.settings() : { ...this.settings(), ...this.noBgSettings() };
    const patch: Partial<SimpleReportSettings> = {};
    for (const key of this.layoutDualKeys) {
      const val = (src as any)[key];
      (patch as any)[key] = (val && typeof val === 'object') ? { ...val } : val;
    }
    if (to === 'withBg') this.settings.update(c => ({ ...c, ...patch }));
    else this.noBgSettings.set({ ...this.noBgSettings(), ...patch });
    this.snack.open(`Copied layout from ${from === 'withBg' ? 'With BG' : 'Without BG'}`, 'OK', { duration: 2200 });
  }
  private pickLayoutSlice(source: SimpleReportSettings | Partial<SimpleReportSettings>): Partial<SimpleReportSettings> {
    const out: Partial<SimpleReportSettings> = {};
    for (const key of this.layoutDualKeys) {
      if ((source as any)[key] !== undefined) (out as any)[key] = (source as any)[key];
    }
    return out;
  }
  private async loadNoBgLayout() {
    const withBg = this.settings();
    const get = async (k: string, f: string) => String(await (window as any).limsApi.getSetting(k, f) ?? f);
    const rawExists = async (k: string) => {
      const v = await (window as any).limsApi.getSetting(k, '');
      return v !== null && v !== undefined && String(v) !== '';
    };
    const out: Partial<SimpleReportSettings> = {};
    const cloneStyle = (s: ReportTextStyle): ReportTextStyle => ({ ...s });
    // Start from With BG so UI always has full editable values; override with saved noBg when present.
    for (const key of this.layoutDualKeys) {
      const val = (withBg as any)[key];
      (out as any)[key] = (val && typeof val === 'object') ? cloneStyle(val) : val;
    }
    const loadNum = async (key: keyof SimpleReportSettings, signed = false) => {
      const settingKey = `report.simple.noBg.${String(key)}`;
      if (!(await rawExists(settingKey))) return;
      const raw = await get(settingKey, String((withBg as any)[key]));
      (out as any)[key] = signed ? this.signedNumberValue(raw, Number((withBg as any)[key]) || 0) : this.numberValue(raw, Number((withBg as any)[key]) || 0);
    };
    const loadStr = async (key: keyof SimpleReportSettings) => {
      const settingKey = `report.simple.noBg.${String(key)}`;
      if (!(await rawExists(settingKey))) return;
      (out as any)[key] = await get(settingKey, String((withBg as any)[key] ?? ''));
    };
    const loadBool = async (key: keyof SimpleReportSettings) => {
      const settingKey = `report.simple.noBg.${String(key)}`;
      if (!(await rawExists(settingKey))) return;
      (out as any)[key] = (await get(settingKey, String(!!(withBg as any)[key]))).toLowerCase() === 'true';
    };
    const loadAlign = async (key: keyof SimpleReportSettings) => {
      const settingKey = `report.simple.noBg.${String(key)}`;
      if (!(await rawExists(settingKey))) return;
      (out as any)[key] = this.normalizeAlignment(await get(settingKey, String((withBg as any)[key])));
    };

    if (await rawExists('report.simple.noBg.pageSize')) out.pageSize = this.normalizePageSize(await get('report.simple.noBg.pageSize', withBg.pageSize));
    if (await rawExists('report.simple.noBg.orientation')) out.orientation = this.normalizeOrientation(await get('report.simple.noBg.orientation', withBg.orientation));
    for (const k of ['marginTopMm','marginRightMm','marginBottomMm','marginLeftMm','mainBodyMarginTopMm','mainBodyMarginBottomMm','tableMarginTopMm','tableMarginBottomMm','tableMarginLeftMm','tableMarginRightMm','tableSafetyMm','tablePaddingLeftMm','tablePaddingRightMm','tablePaddingTopMm','tablePaddingBottomMm','headerFixedHeightMm','footerFixedHeightMm','headerLineGapMm','footerLineGapMm','headerMarginTopMm','headerMarginBottomMm','footerMarginTopMm','footerMarginBottomMm','footerMarginLeftMm','footerMarginRightMm','headerLogoWidthMm','headerLogoHeightMm','addressLineGapMm','addressMarginTopMm','addressMarginBottomMm','footerTextMarginTopMm','footerTextMarginBottomMm','disclaimerWidthPct','disclaimerMarginTopMm','disclaimerMarginBottomMm','disclaimerMarginLeftMm','disclaimerMarginRightMm','disclaimerLineHeight','footerDisclaimerWidthPct','footerPageNumberWidthPct','footerColumnGapMm'] as Array<keyof SimpleReportSettings>) { // footerLineGapMm included
      await loadNum(k);
    }
    for (const k of ['headerLogoOffsetXMm','headerLogoOffsetYMm','institutionNameOffsetXMm','institutionNameOffsetYMm','institutionSubTextOffsetXMm','institutionSubTextOffsetYMm','addressOffsetXMm','addressOffsetYMm','footerTextOffsetXMm','footerTextOffsetYMm','disclaimerOffsetXMm','disclaimerOffsetYMm','disclaimerCharacterSpacing'] as Array<keyof SimpleReportSettings>) {
      await loadNum(k, true);
    }
    await loadBool('headerLogoEnabled');
    await loadStr('headerLogoPath');
    await loadAlign('headerLogoPlacement');
    await loadStr('institutionName');
    await loadStr('institutionSubText');
    await loadAlign('institutionTextPlacement');
    await loadAlign('headerTextAlignment');
    await loadStr('addressText');
    if (await rawExists('report.simple.noBg.addressPlacement')) out.addressPlacement = (await get('report.simple.noBg.addressPlacement', withBg.addressPlacement)) === 'footer' ? 'footer' : 'header';
    await loadAlign('addressAlignment');
    await loadStr('footerText');
    await loadAlign('footerTextAlignment');
    if (await rawExists('report.simple.noBg.disclaimerPlacement')) out.disclaimerPlacement = this.normalizeDisclaimerPlacement(await get('report.simple.noBg.disclaimerPlacement', withBg.disclaimerPlacement));
    await loadStr('disclaimerText');
    await loadAlign('disclaimerAlignment');
    if (await rawExists('report.simple.noBg.disclaimerBgColor')) out.disclaimerBgColor = this.normalizeColor(await get('report.simple.noBg.disclaimerBgColor', withBg.disclaimerBgColor), withBg.disclaimerBgColor);
    await loadAlign('footerPageNumberAlignment');

    for (const styleKey of this.layoutDualStyleKeys) {
      const base = `report.simple.noBg.${String(styleKey)}`;
      const hasAny = await rawExists(`${base}.fontFamily`) || await rawExists(`${base}.fontSize`) || await rawExists(`${base}.bold`) || await rawExists(`${base}.italic`) || await rawExists(`${base}.underline`) || await rawExists(`${base}.color`);
      if (!hasAny) continue;
      const fallback = (withBg as any)[styleKey] as ReportTextStyle;
      (out as any)[styleKey] = await this.loadTextStyleAt(base, fallback);
    }
    this.noBgSettings.set(out);
  }
  private async loadTextStyleAt(base: string, f: ReportTextStyle): Promise<ReportTextStyle> {
    const get = async (s: string, val: string) => String(await (window as any).limsApi.getSetting(`${base}.${s}`, val) ?? val);
    return {
      fontFamily: this.normalizeFontFamily(await get('fontFamily', f.fontFamily)),
      fontSize: this.fontSizeValue(await get('fontSize', String(f.fontSize)), f.fontSize),
      bold: (await get('bold', String(f.bold))).toLowerCase() === 'true',
      italic: (await get('italic', String(f.italic))).toLowerCase() === 'true',
      underline: (await get('underline', String(!!f.underline))).toLowerCase() === 'true',
      color: this.normalizeColor(await get('color', f.color || '#111111'), f.color || '#111111')
    };
  }
  private async saveNoBgLayout() {
    const v = { ...this.settings(), ...this.noBgSettings() };
    const set = (k: string, val: any) => (window as any).limsApi.setSetting(k, String(val ?? ''));
    for (const key of this.layoutDualKeys) {
      if (this.layoutDualStyleKeys.includes(key)) continue;
      await set(`report.simple.noBg.${String(key)}`, (v as any)[key]);
    }
    for (const styleKey of this.layoutDualStyleKeys) {
      await this.saveTextStyleAt(`report.simple.noBg.${String(styleKey)}`, (v as any)[styleKey] as ReportTextStyle);
    }
  }
  private async saveTextStyleAt(base: string, s: ReportTextStyle) {
    await (window as any).limsApi.setSetting(`${base}.fontFamily`, this.normalizeFontFamily(s.fontFamily));
    await (window as any).limsApi.setSetting(`${base}.fontSize`, String(this.fontSizeValue(s.fontSize, 9)));
    await (window as any).limsApi.setSetting(`${base}.bold`, String(!!s.bold));
    await (window as any).limsApi.setSetting(`${base}.italic`, String(!!s.italic));
    await (window as any).limsApi.setSetting(`${base}.underline`, String(!!s.underline));
    await (window as any).limsApi.setSetting(`${base}.color`, this.normalizeColor(s.color, '#111111'));
  }

  saving = signal(false); activeStep = signal<ReportSettingsStepId>('page'); resetConfirmOpen = signal(false);
  previewOpen = signal(false); previewLoading = signal(false); previewDataUrl = signal<SafeResourceUrl | null>(null); previewTitle = signal('Report Preview');
  steps: Array<{ id: ReportSettingsStepId; title: string; subtitle: string }> = [
    { id:'page', title:'Page Setup', subtitle:'Size and margins' }, { id:'font', title:'Font', subtitle:'All text block styles' },
    { id:'headerFooter', title:'Header / Footer', subtitle:'Logo, address, footer' }, { id:'patient', title:'Patient', subtitle:'Fields, borders, barcode' },
    { id:'body', title:'Body', subtitle:'Title and spacing' }, { id:'table', title:'Report Table', subtitle:'Borders, specimen, method' },
    { id:'rules', title:'HR / End', subtitle:'Lines and final text' }, { id:'signatures', title:'Signatures', subtitle:'Add and align signs' }, { id:'background', title:'Background', subtitle:'Enable, upload, clear' }
  ];
  fontRows: Array<{ key: keyof Pick<SimpleReportSettings, 'headerStyle'|'subtitleStyle'|'bodyTextStyle'|'patientLabelStyle'|'patientValueStyle'|'bodyCaptionStyle'|'tableHeaderStyle'|'tableDataStyle'|'groupHeaderStyle'|'institutionNameStyle'|'institutionSubTextStyle'|'addressStyle'|'footerStyle'|'disclaimerStyle'|'endReportStyle'|'labSignStyle'|'otherSignStyle'|'testNameStyle'|'specimenStyle'|'referenceStyle'|'methodStyle'|'flagStyle'|'interpretationStyle'|'remarksStyle'|'profileRemarksStyle'|'highlightedParamStyle'>; label: string }> = [
    {key:'headerStyle',label:'Body Title'}, {key:'subtitleStyle',label:'Subtitles'}, {key:'bodyTextStyle',label:'Body Text'}, {key:'patientLabelStyle',label:'Patient Labels'}, {key:'patientValueStyle',label:'Patient Values'},
    {key:'tableHeaderStyle',label:'Table Header'}, {key:'tableDataStyle',label:'Table Data / Result / Unit'}, {key:'testNameStyle',label:'Test Name'}, {key:'highlightedParamStyle',label:'Highlighted Parameter Name'}, {key:'specimenStyle',label:'Specimen Text'}, {key:'referenceStyle',label:'Reference Text'}, {key:'methodStyle',label:'Method Text'}, {key:'flagStyle',label:'Flag Text / Arrow'}, {key:'interpretationStyle',label:'Test/Profile Interpretation'}, {key:'remarksStyle',label:'Test Remarks Text'}, {key:'profileRemarksStyle',label:'Profile Remarks Text'}, {key:'groupHeaderStyle',label:'Group Header'}, {key:'institutionNameStyle',label:'Institution Name'}, {key:'institutionSubTextStyle',label:'Institution Sub Text'},
    {key:'addressStyle',label:'Address'}, {key:'footerStyle',label:'Footer Text'}, {key:'disclaimerStyle',label:'Disclaimer'}, {key:'endReportStyle',label:'End Report'}
  ];
  supportedReportFonts: Array<{ value: ReportFontFamily; label: string }> = [
    { value: 'Roboto', label: 'Roboto - built-in safe' },
    { value: 'Inter', label: 'Inter - bundled Google font' },
    { value: 'Lato', label: 'Lato - bundled Google font' },
    { value: 'NotoSans', label: 'Noto Sans - fallback / multilingual' },
    { value: 'NotoSerif', label: 'Noto Serif - serif reports' },
    { value: 'NotoSansTamil', label: 'Noto Sans Tamil - Tamil text' },
    { value: 'NotoSansDevanagari', label: 'Noto Sans Devanagari - Hindi / Marathi' },
    { value: 'NotoSansMalayalam', label: 'Noto Sans Malayalam - Malayalam text' },
    { value: 'NotoSansKannada', label: 'Noto Sans Kannada - Kannada text' },
    { value: 'NotoSansTelugu', label: 'Noto Sans Telugu - Telugu text' },
    { value: 'NotoSansBengali', label: 'Noto Sans Bengali - Bengali text' },
    { value: 'NotoSansSymbols', label: 'Noto Sans Symbols - arrows / flags' },
    { value: 'NotoSansSymbols2', label: 'Noto Sans Symbols 2 - extra symbols' },
    { value: 'Poppins', label: 'Poppins - modern rounded' },
    { value: 'Montserrat', label: 'Montserrat - clean headings' },
    { value: 'OpenSans', label: 'Open Sans - readable reports' },
    { value: 'NunitoSans', label: 'Nunito Sans - soft readable' },
    { value: 'SourceSans3', label: 'Source Sans 3 - compact clinical' },
    { value: 'Merriweather', label: 'Merriweather - serif report' },
    { value: 'LibreBaskerville', label: 'Libre Baskerville - formal serif' },
    { value: 'Lora', label: 'Lora - readable serif' }
  ];
  private stepperDragging=false; private stepperDragStartX=0; private stepperDragStartScrollLeft=0; private suppressNextStepClick=false;
  private signatureRowsCacheRaw = ''; private signatureRowsCache: any[] | null = null;
  async ngOnInit(){ await this.reload(); }
  styleOf(key: any): ReportTextStyle { return (this.settings() as any)[key] as ReportTextStyle; }
  async reload(){ const get=async(k:string,f:string)=>String(await (window as any).limsApi.getSetting(k,f)??f); const getAlign=async(k:string,f:ReportAlignment)=>this.normalizeAlignment(await get(k,f)); const getStyle=(k:any,f:ReportTextStyle)=>this.loadTextStyle(k,f); this.settings.set({ ...DEFAULT_REPORT_SETTINGS,
    pageSize:this.normalizePageSize(await get('report.simple.pageSize',DEFAULT_REPORT_SETTINGS.pageSize)), orientation:this.normalizeOrientation(await get('report.simple.orientation',DEFAULT_REPORT_SETTINGS.orientation)),
    marginTopMm:this.numberValue(await get('report.simple.marginTopMm',String(DEFAULT_REPORT_SETTINGS.marginTopMm)),DEFAULT_REPORT_SETTINGS.marginTopMm), marginRightMm:this.numberValue(await get('report.simple.marginRightMm',String(DEFAULT_REPORT_SETTINGS.marginRightMm)),DEFAULT_REPORT_SETTINGS.marginRightMm), marginBottomMm:this.numberValue(await get('report.simple.marginBottomMm',String(DEFAULT_REPORT_SETTINGS.marginBottomMm)),DEFAULT_REPORT_SETTINGS.marginBottomMm), marginLeftMm:this.numberValue(await get('report.simple.marginLeftMm',String(DEFAULT_REPORT_SETTINGS.marginLeftMm)),DEFAULT_REPORT_SETTINGS.marginLeftMm),
    tableParamPct:this.percentValue(await get('report.simple.tableParamPct',String(DEFAULT_REPORT_SETTINGS.tableParamPct)),DEFAULT_REPORT_SETTINGS.tableParamPct), tableAnalysedPct:this.percentValue(await get('report.simple.tableAnalysedPct',String(DEFAULT_REPORT_SETTINGS.tableAnalysedPct)),DEFAULT_REPORT_SETTINGS.tableAnalysedPct), tableUnitPct:this.percentValue(await get('report.simple.tableUnitPct',String(DEFAULT_REPORT_SETTINGS.tableUnitPct)),DEFAULT_REPORT_SETTINGS.tableUnitPct), tableRangePct:this.percentValue(await get('report.simple.tableRangePct',String(DEFAULT_REPORT_SETTINGS.tableRangePct)),DEFAULT_REPORT_SETTINGS.tableRangePct), tableArrowWidthMm:this.numberValue(await get('report.simple.tableArrowWidthMm',String(DEFAULT_REPORT_SETTINGS.tableArrowWidthMm)),DEFAULT_REPORT_SETTINGS.tableArrowWidthMm), tableSafetyMm:this.numberValue(await get('report.simple.tableSafetyMm',String(DEFAULT_REPORT_SETTINGS.tableSafetyMm)),DEFAULT_REPORT_SETTINGS.tableSafetyMm), tablePaddingLeftMm:this.numberValue(await get('report.simple.tablePaddingLeftMm',String(DEFAULT_REPORT_SETTINGS.tablePaddingLeftMm)),DEFAULT_REPORT_SETTINGS.tablePaddingLeftMm), tablePaddingRightMm:this.numberValue(await get('report.simple.tablePaddingRightMm',String(DEFAULT_REPORT_SETTINGS.tablePaddingRightMm)),DEFAULT_REPORT_SETTINGS.tablePaddingRightMm), tablePaddingTopMm:this.numberValue(await get('report.simple.tablePaddingTopMm',String(DEFAULT_REPORT_SETTINGS.tablePaddingTopMm)),DEFAULT_REPORT_SETTINGS.tablePaddingTopMm), tablePaddingBottomMm:this.numberValue(await get('report.simple.tablePaddingBottomMm',String(DEFAULT_REPORT_SETTINGS.tablePaddingBottomMm)),DEFAULT_REPORT_SETTINGS.tablePaddingBottomMm),
    headerFixedHeightMm:this.numberValue(await get('report.simple.headerFixedHeightMm',String(DEFAULT_REPORT_SETTINGS.headerFixedHeightMm)),DEFAULT_REPORT_SETTINGS.headerFixedHeightMm), footerFixedHeightMm:this.numberValue(await get('report.simple.footerFixedHeightMm',String(DEFAULT_REPORT_SETTINGS.footerFixedHeightMm)),DEFAULT_REPORT_SETTINGS.footerFixedHeightMm), headerLineGapMm:this.numberValue(await get('report.simple.headerLineGapMm',String(DEFAULT_REPORT_SETTINGS.headerLineGapMm)),DEFAULT_REPORT_SETTINGS.headerLineGapMm), footerLineGapMm:this.numberValue(await get('report.simple.footerLineGapMm',String(DEFAULT_REPORT_SETTINGS.footerLineGapMm)),DEFAULT_REPORT_SETTINGS.footerLineGapMm), headerMarginTopMm:this.numberValue(await get('report.simple.headerMarginTopMm',String(DEFAULT_REPORT_SETTINGS.headerMarginTopMm)),DEFAULT_REPORT_SETTINGS.headerMarginTopMm), headerMarginBottomMm:this.numberValue(await get('report.simple.headerMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.headerMarginBottomMm)),DEFAULT_REPORT_SETTINGS.headerMarginBottomMm), footerMarginTopMm:this.numberValue(await get('report.simple.footerMarginTopMm',String(DEFAULT_REPORT_SETTINGS.footerMarginTopMm)),DEFAULT_REPORT_SETTINGS.footerMarginTopMm), footerMarginBottomMm:this.numberValue(await get('report.simple.footerMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.footerMarginBottomMm)),DEFAULT_REPORT_SETTINGS.footerMarginBottomMm), footerMarginLeftMm:this.numberValue(await get('report.simple.footerMarginLeftMm',String(DEFAULT_REPORT_SETTINGS.footerMarginLeftMm)),DEFAULT_REPORT_SETTINGS.footerMarginLeftMm), footerMarginRightMm:this.numberValue(await get('report.simple.footerMarginRightMm',String(DEFAULT_REPORT_SETTINGS.footerMarginRightMm)),DEFAULT_REPORT_SETTINGS.footerMarginRightMm), mainBodyMarginTopMm:this.numberValue(await get('report.simple.mainBodyMarginTopMm',String(DEFAULT_REPORT_SETTINGS.mainBodyMarginTopMm)),DEFAULT_REPORT_SETTINGS.mainBodyMarginTopMm), mainBodyMarginBottomMm:this.numberValue(await get('report.simple.mainBodyMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.mainBodyMarginBottomMm)),DEFAULT_REPORT_SETTINGS.mainBodyMarginBottomMm), tableMarginTopMm:this.numberValue(await get('report.simple.tableMarginTopMm',String(DEFAULT_REPORT_SETTINGS.tableMarginTopMm)),DEFAULT_REPORT_SETTINGS.tableMarginTopMm), tableMarginBottomMm:this.numberValue(await get('report.simple.tableMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.tableMarginBottomMm)),DEFAULT_REPORT_SETTINGS.tableMarginBottomMm), tableMarginLeftMm:this.numberValue(await get('report.simple.tableMarginLeftMm',String(DEFAULT_REPORT_SETTINGS.tableMarginLeftMm)),DEFAULT_REPORT_SETTINGS.tableMarginLeftMm), tableMarginRightMm:this.numberValue(await get('report.simple.tableMarginRightMm',String(DEFAULT_REPORT_SETTINGS.tableMarginRightMm)),DEFAULT_REPORT_SETTINGS.tableMarginRightMm),
    headerLogoEnabled:(await get('report.simple.headerLogoEnabled',String(DEFAULT_REPORT_SETTINGS.headerLogoEnabled))).toLowerCase()==='true', headerLogoPath:await get('report.simple.headerLogoPath',''), headerLogoWidthMm:this.numberValue(await get('report.simple.headerLogoWidthMm',String(DEFAULT_REPORT_SETTINGS.headerLogoWidthMm)),DEFAULT_REPORT_SETTINGS.headerLogoWidthMm), headerLogoHeightMm:this.numberValue(await get('report.simple.headerLogoHeightMm',String(DEFAULT_REPORT_SETTINGS.headerLogoHeightMm)),DEFAULT_REPORT_SETTINGS.headerLogoHeightMm), headerLogoPlacement:await getAlign('report.simple.headerLogoPlacement',DEFAULT_REPORT_SETTINGS.headerLogoPlacement), headerLogoOffsetXMm:this.signedNumberValue(await get('report.simple.headerLogoOffsetXMm',String(DEFAULT_REPORT_SETTINGS.headerLogoOffsetXMm)),DEFAULT_REPORT_SETTINGS.headerLogoOffsetXMm), headerLogoOffsetYMm:this.signedNumberValue(await get('report.simple.headerLogoOffsetYMm',String(DEFAULT_REPORT_SETTINGS.headerLogoOffsetYMm)),DEFAULT_REPORT_SETTINGS.headerLogoOffsetYMm),
    institutionName:await get('report.simple.institutionName',''), institutionSubText:await get('report.simple.institutionSubText',''), institutionTextPlacement:await getAlign('report.simple.institutionTextPlacement',DEFAULT_REPORT_SETTINGS.institutionTextPlacement), institutionNameOffsetXMm:this.signedNumberValue(await get('report.simple.institutionNameOffsetXMm','0'),0), institutionNameOffsetYMm:this.signedNumberValue(await get('report.simple.institutionNameOffsetYMm','0'),0), institutionSubTextOffsetXMm:this.signedNumberValue(await get('report.simple.institutionSubTextOffsetXMm','0'),0), institutionSubTextOffsetYMm:this.signedNumberValue(await get('report.simple.institutionSubTextOffsetYMm','0'),0), headerTextAlignment:await getAlign('report.simple.headerTextAlignment',DEFAULT_REPORT_SETTINGS.headerTextAlignment), institutionNameStyle:await getStyle('institutionNameStyle',DEFAULT_REPORT_SETTINGS.institutionNameStyle), institutionSubTextStyle:await getStyle('institutionSubTextStyle',DEFAULT_REPORT_SETTINGS.institutionSubTextStyle),
    addressText:await get('report.simple.addressText',''), addressPlacement:(await get('report.simple.addressPlacement','header'))==='footer'?'footer':'header', addressAlignment:await getAlign('report.simple.addressAlignment',DEFAULT_REPORT_SETTINGS.addressAlignment), addressStyle:await getStyle('addressStyle',DEFAULT_REPORT_SETTINGS.addressStyle), addressOffsetXMm:this.signedNumberValue(await get('report.simple.addressOffsetXMm','0'),0), addressOffsetYMm:this.signedNumberValue(await get('report.simple.addressOffsetYMm','0'),0), addressLineGapMm:this.numberValue(await get('report.simple.addressLineGapMm',String(DEFAULT_REPORT_SETTINGS.addressLineGapMm)),DEFAULT_REPORT_SETTINGS.addressLineGapMm), addressMarginTopMm:this.numberValue(await get('report.simple.addressMarginTopMm',String(DEFAULT_REPORT_SETTINGS.addressMarginTopMm)),DEFAULT_REPORT_SETTINGS.addressMarginTopMm), addressMarginBottomMm:this.numberValue(await get('report.simple.addressMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.addressMarginBottomMm)),DEFAULT_REPORT_SETTINGS.addressMarginBottomMm), footerText:await get('report.simple.footerText',DEFAULT_REPORT_SETTINGS.footerText), footerTextOffsetXMm:this.signedNumberValue(await get('report.simple.footerTextOffsetXMm','0'),0), footerTextOffsetYMm:this.signedNumberValue(await get('report.simple.footerTextOffsetYMm','0'),0), footerTextAlignment:await getAlign('report.simple.footerTextAlignment',DEFAULT_REPORT_SETTINGS.footerTextAlignment), footerStyle:await getStyle('footerStyle',DEFAULT_REPORT_SETTINGS.footerStyle), footerTextMarginTopMm:this.numberValue(await get('report.simple.footerTextMarginTopMm',String(DEFAULT_REPORT_SETTINGS.footerTextMarginTopMm)),DEFAULT_REPORT_SETTINGS.footerTextMarginTopMm), footerTextMarginBottomMm:this.numberValue(await get('report.simple.footerTextMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.footerTextMarginBottomMm)),DEFAULT_REPORT_SETTINGS.footerTextMarginBottomMm), disclaimerPlacement:this.normalizeDisclaimerPlacement(await get('report.simple.disclaimerPlacement',DEFAULT_REPORT_SETTINGS.disclaimerPlacement)), disclaimerText:await get('report.simple.disclaimerText', await get('report.simple.footerText', DEFAULT_REPORT_SETTINGS.disclaimerText)), disclaimerAlignment:await getAlign('report.simple.disclaimerAlignment',DEFAULT_REPORT_SETTINGS.disclaimerAlignment), disclaimerStyle:await getStyle('disclaimerStyle',DEFAULT_REPORT_SETTINGS.disclaimerStyle), disclaimerBgColor:this.normalizeColor(await get('report.simple.disclaimerBgColor',DEFAULT_REPORT_SETTINGS.disclaimerBgColor),DEFAULT_REPORT_SETTINGS.disclaimerBgColor), disclaimerWidthPct:this.percentWideValue(await get('report.simple.disclaimerWidthPct',String(DEFAULT_REPORT_SETTINGS.disclaimerWidthPct)),DEFAULT_REPORT_SETTINGS.disclaimerWidthPct), disclaimerOffsetXMm:this.signedNumberValue(await get('report.simple.disclaimerOffsetXMm','0'),0), disclaimerOffsetYMm:this.signedNumberValue(await get('report.simple.disclaimerOffsetYMm','0'),0), disclaimerMarginTopMm:this.numberValue(await get('report.simple.disclaimerMarginTopMm',String(DEFAULT_REPORT_SETTINGS.disclaimerMarginTopMm)),DEFAULT_REPORT_SETTINGS.disclaimerMarginTopMm), disclaimerMarginBottomMm:this.numberValue(await get('report.simple.disclaimerMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.disclaimerMarginBottomMm)),DEFAULT_REPORT_SETTINGS.disclaimerMarginBottomMm), disclaimerMarginLeftMm:this.numberValue(await get('report.simple.disclaimerMarginLeftMm',String(DEFAULT_REPORT_SETTINGS.disclaimerMarginLeftMm)),DEFAULT_REPORT_SETTINGS.disclaimerMarginLeftMm), disclaimerMarginRightMm:this.numberValue(await get('report.simple.disclaimerMarginRightMm',String(DEFAULT_REPORT_SETTINGS.disclaimerMarginRightMm)),DEFAULT_REPORT_SETTINGS.disclaimerMarginRightMm), disclaimerLineHeight:this.lineHeightValue(await get('report.simple.disclaimerLineHeight',String(DEFAULT_REPORT_SETTINGS.disclaimerLineHeight)),DEFAULT_REPORT_SETTINGS.disclaimerLineHeight), disclaimerCharacterSpacing:this.signedSmallNumberValue(await get('report.simple.disclaimerCharacterSpacing',String(DEFAULT_REPORT_SETTINGS.disclaimerCharacterSpacing)),DEFAULT_REPORT_SETTINGS.disclaimerCharacterSpacing), footerDisclaimerWidthPct:this.percentWideValue(await get('report.simple.footerDisclaimerWidthPct',String(DEFAULT_REPORT_SETTINGS.footerDisclaimerWidthPct)),DEFAULT_REPORT_SETTINGS.footerDisclaimerWidthPct), footerPageNumberWidthPct:this.percentWideValue(await get('report.simple.footerPageNumberWidthPct',String(DEFAULT_REPORT_SETTINGS.footerPageNumberWidthPct)),DEFAULT_REPORT_SETTINGS.footerPageNumberWidthPct), footerColumnGapMm:this.numberValue(await get('report.simple.footerColumnGapMm',String(DEFAULT_REPORT_SETTINGS.footerColumnGapMm)),DEFAULT_REPORT_SETTINGS.footerColumnGapMm), footerPageNumberAlignment:await getAlign('report.simple.footerPageNumberAlignment',DEFAULT_REPORT_SETTINGS.footerPageNumberAlignment),
    patientDetailsPlacement:(await get('report.simple.patientDetailsPlacement',DEFAULT_REPORT_SETTINGS.patientDetailsPlacement))==='header'?'header':'body', patientDetailsOffsetXMm:this.signedNumberValue(await get('report.simple.patientDetailsOffsetXMm','0'),0), patientDetailsOffsetYMm:this.signedNumberValue(await get('report.simple.patientDetailsOffsetYMm','0'),0), patientDetailsMarginTopMm:this.numberValue(await get('report.simple.patientDetailsMarginTopMm','0'),0), patientDetailsMarginBottomMm:this.numberValue(await get('report.simple.patientDetailsMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.patientDetailsMarginBottomMm)),DEFAULT_REPORT_SETTINGS.patientDetailsMarginBottomMm), patientDetailsMarginLeftMm:this.numberValue(await get('report.simple.patientDetailsMarginLeftMm','0'),0), patientDetailsMarginRightMm:this.numberValue(await get('report.simple.patientDetailsMarginRightMm','0'),0), patientDetailsPaddingTopMm:this.numberValue(await get('report.simple.patientDetailsPaddingTopMm','0'),0), patientDetailsPaddingRightMm:this.numberValue(await get('report.simple.patientDetailsPaddingRightMm','0'),0), patientDetailsPaddingBottomMm:this.numberValue(await get('report.simple.patientDetailsPaddingBottomMm','0'),0), patientDetailsPaddingLeftMm:this.numberValue(await get('report.simple.patientDetailsPaddingLeftMm','0'),0), patientTablePaddingTopMm:this.numberValue(await get('report.simple.patientTablePaddingTopMm', String(DEFAULT_REPORT_SETTINGS.patientTablePaddingTopMm)), DEFAULT_REPORT_SETTINGS.patientTablePaddingTopMm), patientTablePaddingRightMm:this.numberValue(await get('report.simple.patientTablePaddingRightMm', String(DEFAULT_REPORT_SETTINGS.patientTablePaddingRightMm)), DEFAULT_REPORT_SETTINGS.patientTablePaddingRightMm), patientTablePaddingBottomMm:this.numberValue(await get('report.simple.patientTablePaddingBottomMm', String(DEFAULT_REPORT_SETTINGS.patientTablePaddingBottomMm)), DEFAULT_REPORT_SETTINGS.patientTablePaddingBottomMm), patientTablePaddingLeftMm:this.numberValue(await get('report.simple.patientTablePaddingLeftMm', String(DEFAULT_REPORT_SETTINGS.patientTablePaddingLeftMm)), DEFAULT_REPORT_SETTINGS.patientTablePaddingLeftMm), patientTableInnerPaddingTopMm:this.numberValue(await get('report.simple.patientTableInnerPaddingTopMm', String(DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingTopMm)), DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingTopMm), patientTableInnerPaddingRightMm:this.numberValue(await get('report.simple.patientTableInnerPaddingRightMm', String(DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingRightMm)), DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingRightMm), patientTableInnerPaddingBottomMm:this.numberValue(await get('report.simple.patientTableInnerPaddingBottomMm', String(DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingBottomMm)), DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingBottomMm), patientTableInnerPaddingLeftMm:this.numberValue(await get('report.simple.patientTableInnerPaddingLeftMm', String(DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingLeftMm)), DEFAULT_REPORT_SETTINGS.patientTableInnerPaddingLeftMm), patientDetailsGapMm:this.numberValue(await get('report.simple.patientDetailsGapMm',String(DEFAULT_REPORT_SETTINGS.patientDetailsGapMm)),DEFAULT_REPORT_SETTINGS.patientDetailsGapMm), reportTitleText:await get('report.simple.reportTitleText',DEFAULT_REPORT_SETTINGS.reportTitleText), reportSubtitleText:await get('report.simple.reportSubtitleText',DEFAULT_REPORT_SETTINGS.reportSubtitleText), reportTitleAlignment:await getAlign('report.simple.reportTitleAlignment',DEFAULT_REPORT_SETTINGS.reportTitleAlignment), reportSubtitleAlignment:await getAlign('report.simple.reportSubtitleAlignment',DEFAULT_REPORT_SETTINGS.reportSubtitleAlignment), titleSubtitleGapMm:this.numberValue(await get('report.simple.titleSubtitleGapMm',String(DEFAULT_REPORT_SETTINGS.titleSubtitleGapMm)),DEFAULT_REPORT_SETTINGS.titleSubtitleGapMm), reportTitleOffsetXMm:this.signedNumberValue(await get('report.simple.reportTitleOffsetXMm','0'),0), reportTitleOffsetYMm:this.signedNumberValue(await get('report.simple.reportTitleOffsetYMm','0'),0), reportSubtitleOffsetXMm:this.signedNumberValue(await get('report.simple.reportSubtitleOffsetXMm','0'),0), reportSubtitleOffsetYMm:this.signedNumberValue(await get('report.simple.reportSubtitleOffsetYMm','0'),0), reportTitleMarginTopMm:this.numberValue(await get('report.simple.reportTitleMarginTopMm','0'),0), reportTitleMarginBottomMm:this.numberValue(await get('report.simple.reportTitleMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.reportTitleMarginBottomMm)),DEFAULT_REPORT_SETTINGS.reportTitleMarginBottomMm), reportSubtitleMarginTopMm:this.numberValue(await get('report.simple.reportSubtitleMarginTopMm','0'),0), reportSubtitleMarginBottomMm:this.numberValue(await get('report.simple.reportSubtitleMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.reportSubtitleMarginBottomMm)),DEFAULT_REPORT_SETTINGS.reportSubtitleMarginBottomMm), subtitleStyle:await getStyle('subtitleStyle',DEFAULT_REPORT_SETTINGS.subtitleStyle),
    headerStyle:await getStyle('headerStyle',DEFAULT_REPORT_SETTINGS.headerStyle), bodyTextStyle:await getStyle('bodyTextStyle',DEFAULT_REPORT_SETTINGS.bodyTextStyle), patientLabelStyle:await getStyle('patientLabelStyle',DEFAULT_REPORT_SETTINGS.patientLabelStyle), patientValueStyle:await getStyle('patientValueStyle',DEFAULT_REPORT_SETTINGS.patientValueStyle), bodyCaptionStyle:await getStyle('bodyCaptionStyle',DEFAULT_REPORT_SETTINGS.bodyCaptionStyle), tableHeaderStyle:await getStyle('tableHeaderStyle',DEFAULT_REPORT_SETTINGS.tableHeaderStyle), tableDataStyle:await getStyle('tableDataStyle',DEFAULT_REPORT_SETTINGS.tableDataStyle), testNameStyle:await getStyle('testNameStyle',DEFAULT_REPORT_SETTINGS.testNameStyle), specimenStyle:await getStyle('specimenStyle',DEFAULT_REPORT_SETTINGS.specimenStyle), referenceStyle:await getStyle('referenceStyle',DEFAULT_REPORT_SETTINGS.referenceStyle), methodStyle:await getStyle('methodStyle',DEFAULT_REPORT_SETTINGS.methodStyle), flagStyle:await getStyle('flagStyle',DEFAULT_REPORT_SETTINGS.flagStyle), interpretationStyle:await getStyle('interpretationStyle',DEFAULT_REPORT_SETTINGS.interpretationStyle), remarksStyle:await getStyle('remarksStyle',DEFAULT_REPORT_SETTINGS.remarksStyle), profileRemarksStyle:await getStyle('profileRemarksStyle',DEFAULT_REPORT_SETTINGS.profileRemarksStyle), highlightedParamStyle:await getStyle('highlightedParamStyle',DEFAULT_REPORT_SETTINGS.highlightedParamStyle), groupHeaderStyle:await getStyle('groupHeaderStyle',DEFAULT_REPORT_SETTINGS.groupHeaderStyle), tableHeaderBgColor:this.normalizeColor(await get('report.simple.tableHeaderBgColor', DEFAULT_REPORT_SETTINGS.tableHeaderBgColor), DEFAULT_REPORT_SETTINGS.tableHeaderBgColor), groupHeaderBgColor:this.normalizeColor(await get('report.simple.groupHeaderBgColor', DEFAULT_REPORT_SETTINGS.groupHeaderBgColor), DEFAULT_REPORT_SETTINGS.groupHeaderBgColor), highlightedParamTextColor:this.normalizeColor(await get('report.simple.highlightedParamTextColor', DEFAULT_REPORT_SETTINGS.highlightedParamTextColor), DEFAULT_REPORT_SETTINGS.highlightedParamTextColor), highlightedParamBgColor:this.normalizeColor(await get('report.simple.highlightedParamBgColor', DEFAULT_REPORT_SETTINGS.highlightedParamBgColor), DEFAULT_REPORT_SETTINGS.highlightedParamBgColor),
    hrLinesConfig:await get('report.simple.hrLinesConfig',DEFAULT_REPORT_SETTINGS.hrLinesConfig), endReportText:await get('report.simple.endReportText',DEFAULT_REPORT_SETTINGS.endReportText), endReportAlignment:await getAlign('report.simple.endReportAlignment',DEFAULT_REPORT_SETTINGS.endReportAlignment), endReportMarginTopMm:this.numberValue(await get('report.simple.endReportMarginTopMm',String(DEFAULT_REPORT_SETTINGS.endReportMarginTopMm)),DEFAULT_REPORT_SETTINGS.endReportMarginTopMm), endReportMarginBottomMm:this.numberValue(await get('report.simple.endReportMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.endReportMarginBottomMm)),DEFAULT_REPORT_SETTINGS.endReportMarginBottomMm), endReportOffsetXMm:this.signedNumberValue(await get('report.simple.endReportOffsetXMm','0'),0), endReportOffsetYMm:this.signedNumberValue(await get('report.simple.endReportOffsetYMm','0'),0), endReportStyle:await getStyle('endReportStyle',DEFAULT_REPORT_SETTINGS.endReportStyle), labSignEnabled:(await get('report.simple.labSignEnabled',String(DEFAULT_REPORT_SETTINGS.labSignEnabled))).toLowerCase()==='true', labSignLabel:await get('report.simple.labSignLabel',DEFAULT_REPORT_SETTINGS.labSignLabel), labSignText:await get('report.simple.labSignText',DEFAULT_REPORT_SETTINGS.labSignText), labSignAlignment:await getAlign('report.simple.labSignAlignment',DEFAULT_REPORT_SETTINGS.labSignAlignment), labSignMarginTopMm:this.numberValue(await get('report.simple.labSignMarginTopMm',String(DEFAULT_REPORT_SETTINGS.labSignMarginTopMm)),DEFAULT_REPORT_SETTINGS.labSignMarginTopMm), labSignMarginBottomMm:this.numberValue(await get('report.simple.labSignMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.labSignMarginBottomMm)),DEFAULT_REPORT_SETTINGS.labSignMarginBottomMm), labSignOffsetXMm:this.signedNumberValue(await get('report.simple.labSignOffsetXMm','0'),0), labSignOffsetYMm:this.signedNumberValue(await get('report.simple.labSignOffsetYMm','0'),0), labSignStyle:await getStyle('labSignStyle',DEFAULT_REPORT_SETTINGS.labSignStyle), labSignImageEnabled:(await get('report.simple.labSignImageEnabled',String(DEFAULT_REPORT_SETTINGS.labSignImageEnabled))).toLowerCase()==='true', labSignImagePath:await get('report.simple.labSignImagePath',''), labSignImageWidthMm:this.numberValue(await get('report.simple.labSignImageWidthMm',String(DEFAULT_REPORT_SETTINGS.labSignImageWidthMm)),DEFAULT_REPORT_SETTINGS.labSignImageWidthMm), labSignImageHeightMm:this.numberValue(await get('report.simple.labSignImageHeightMm',String(DEFAULT_REPORT_SETTINGS.labSignImageHeightMm)),DEFAULT_REPORT_SETTINGS.labSignImageHeightMm), labSignImageOffsetXMm:this.signedNumberValue(await get('report.simple.labSignImageOffsetXMm','0'),0), labSignImageOffsetYMm:this.signedNumberValue(await get('report.simple.labSignImageOffsetYMm',String(DEFAULT_REPORT_SETTINGS.labSignImageOffsetYMm)),DEFAULT_REPORT_SETTINGS.labSignImageOffsetYMm),
    backgroundEnabled:(await get('report.simple.backgroundEnabled','false')).toLowerCase()==='true', backgroundImagePath:await get('report.simple.backgroundImagePath',''), backgroundImageArea:this.normalizeBackgroundImageArea(await get('report.simple.backgroundImageArea', DEFAULT_REPORT_SETTINGS.backgroundImageArea)), backgroundImageBlendPreset:this.normalizeBackgroundBlendPreset(await get('report.simple.backgroundImageBlendPreset', DEFAULT_REPORT_SETTINGS.backgroundImageBlendPreset)), backgroundImageFit:this.normalizeBackgroundImageFit(await get('report.simple.backgroundImageFit', DEFAULT_REPORT_SETTINGS.backgroundImageFit)), backgroundImageOpacity:this.opacityValue(await get('report.simple.backgroundImageOpacity', String(DEFAULT_REPORT_SETTINGS.backgroundImageOpacity)), DEFAULT_REPORT_SETTINGS.backgroundImageOpacity), backgroundImageWatermarkWidthPct:this.percentFullValue(await get('report.simple.backgroundImageWatermarkWidthPct', String(DEFAULT_REPORT_SETTINGS.backgroundImageWatermarkWidthPct)), DEFAULT_REPORT_SETTINGS.backgroundImageWatermarkWidthPct), backgroundImageOffsetXMm:this.signedNumberValue(await get('report.simple.backgroundImageOffsetXMm', '0'),0), backgroundImageOffsetYMm:this.signedNumberValue(await get('report.simple.backgroundImageOffsetYMm', '0'),0) }); await this.loadOtherSignatureSettings(); await this.loadAdvancedSettings(); await this.loadNoBgLayout(); }
  askResetDefaults(){ this.resetConfirmOpen.set(true); }
  cancelResetDefaults(){ this.resetConfirmOpen.set(false); }
  async confirmResetDefaults(){ this.resetConfirmOpen.set(false); this.settings.set(JSON.parse(JSON.stringify(DEFAULT_REPORT_SETTINGS))); this.noBgSettings.set(this.pickLayoutSlice(DEFAULT_REPORT_SETTINGS)); await this.save(); this.snack.open('Report settings reset to default','OK',{duration:2600}); }
  private async loadOtherSignatureSettings(){
    const get=async(k:string,f:string)=>String(await (window as any).limsApi.getSetting(k,f)??f);
    const otherSignEnabled = (await get('report.simple.otherSignEnabled',String(DEFAULT_REPORT_SETTINGS.otherSignEnabled))).toLowerCase()==='true';
    const otherSignLabel = await get('report.simple.otherSignLabel',DEFAULT_REPORT_SETTINGS.otherSignLabel);
    const otherSignText = await get('report.simple.otherSignText',DEFAULT_REPORT_SETTINGS.otherSignText);
    const otherSignAlignment = this.normalizeAlignment(await get('report.simple.otherSignAlignment',DEFAULT_REPORT_SETTINGS.otherSignAlignment));
    const otherSignMarginTopMm = this.numberValue(await get('report.simple.otherSignMarginTopMm',String(DEFAULT_REPORT_SETTINGS.otherSignMarginTopMm)),DEFAULT_REPORT_SETTINGS.otherSignMarginTopMm);
    const otherSignMarginBottomMm = this.numberValue(await get('report.simple.otherSignMarginBottomMm',String(DEFAULT_REPORT_SETTINGS.otherSignMarginBottomMm)),DEFAULT_REPORT_SETTINGS.otherSignMarginBottomMm);
    const otherSignOffsetXMm = this.signedNumberValue(await get('report.simple.otherSignOffsetXMm',String(DEFAULT_REPORT_SETTINGS.otherSignOffsetXMm)),DEFAULT_REPORT_SETTINGS.otherSignOffsetXMm);
    const otherSignOffsetYMm = this.signedNumberValue(await get('report.simple.otherSignOffsetYMm',String(DEFAULT_REPORT_SETTINGS.otherSignOffsetYMm)),DEFAULT_REPORT_SETTINGS.otherSignOffsetYMm);
    const otherSignStyle = await this.loadTextStyle('otherSignStyle',DEFAULT_REPORT_SETTINGS.otherSignStyle);
    const otherSignImageEnabled = (await get('report.simple.otherSignImageEnabled',String(DEFAULT_REPORT_SETTINGS.otherSignImageEnabled))).toLowerCase()==='true';
    const otherSignImagePath = await get('report.simple.otherSignImagePath',DEFAULT_REPORT_SETTINGS.otherSignImagePath);
    const otherSignImageWidthMm = this.numberValue(await get('report.simple.otherSignImageWidthMm',String(DEFAULT_REPORT_SETTINGS.otherSignImageWidthMm)),DEFAULT_REPORT_SETTINGS.otherSignImageWidthMm);
    const otherSignImageHeightMm = this.numberValue(await get('report.simple.otherSignImageHeightMm',String(DEFAULT_REPORT_SETTINGS.otherSignImageHeightMm)),DEFAULT_REPORT_SETTINGS.otherSignImageHeightMm);
    const otherSignImageOffsetXMm = this.signedNumberValue(await get('report.simple.otherSignImageOffsetXMm',String(DEFAULT_REPORT_SETTINGS.otherSignImageOffsetXMm)),DEFAULT_REPORT_SETTINGS.otherSignImageOffsetXMm);
    const otherSignImageOffsetYMm = this.signedNumberValue(await get('report.simple.otherSignImageOffsetYMm',String(DEFAULT_REPORT_SETTINGS.otherSignImageOffsetYMm)),DEFAULT_REPORT_SETTINGS.otherSignImageOffsetYMm);
    this.settings.update(c=>({ ...c,
      otherSignEnabled,
      otherSignLabel,
      otherSignText,
      otherSignAlignment,
      otherSignMarginTopMm,
      otherSignMarginBottomMm,
      otherSignOffsetXMm,
      otherSignOffsetYMm,
      otherSignStyle,
      otherSignImageEnabled,
      otherSignImagePath,
      otherSignImageWidthMm,
      otherSignImageHeightMm,
      otherSignImageOffsetXMm,
      otherSignImageOffsetYMm
    }));
  }

  async previewSettings(mode:'profile'|'single', withBackground = true){
    const bgLabel = withBackground ? 'With BG' : 'Without BG';
    this.previewTitle.set(mode === 'single' ? `Single Test Preview · ${bgLabel}` : `Profile Preview (2 Pages) · ${bgLabel}`);
    this.previewOpen.set(true);
    this.previewLoading.set(true);
    this.previewDataUrl.set(null);
    try {
      await this.save();
      const result = await (window as any).limsApi.reportSettingsPreviewPdfData(mode, withBackground !== false);
      if (!result?.dataUrl) throw new Error('Preview PDF was not generated');
      this.previewDataUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(result.dataUrl));
    } catch (err:any) {
      this.previewOpen.set(false);
      this.snack.open(err?.message || 'Unable to generate report preview', 'OK', { duration: 3200 });
    } finally {
      this.previewLoading.set(false);
    }
  }
  closePreview(){ this.previewOpen.set(false); this.previewDataUrl.set(null); }
  applyColorPreset(kind:'blue'|'gray'|'plain'|'bw'){
    if (kind === 'bw') {
      this.applyBlackAndWhiteFonts();
      return;
    }
    const p = kind==='plain'
      ? {tableHeaderBgColor:'#ffffff',groupHeaderBgColor:'#ffffff',sectionHeaderBgColor:'#ffffff',highlightedParamBgColor:'#ffffff'}
      : kind==='gray'
        ? {tableHeaderBgColor:'#f3f4f6',groupHeaderBgColor:'#e5e7eb',sectionHeaderBgColor:'#f9fafb',highlightedParamBgColor:'#fef3c7'}
        : {tableHeaderBgColor:'#F7FAFF',groupHeaderBgColor:'#E6EEF9',sectionHeaderBgColor:'#F3F6FB',highlightedParamBgColor:'#fff3bf'};
    this.settings.update(c=>({ ...c, ...p }));
  }
  /** One-click B&W: override colored fonts only — leave all background colors untouched. */
  applyBlackAndWhiteFonts(){
    const black = '#000000';
    this.settings.update(c => {
      const next: any = { ...c, highlightedParamTextColor: black, highColor: black, lowColor: black };
      for (const row of this.fontRows) {
        const cur = (c as any)[row.key] as ReportTextStyle;
        if (cur && typeof cur === 'object') next[row.key] = { ...cur, color: black };
      }
      try {
        const rows = this.normalizeSignatureRows(c.signatureRowsJson || '[]');
        next.signatureRowsJson = JSON.stringify(rows.map(sign => ({
          ...sign,
          lines: (Array.isArray(sign.lines) ? sign.lines : []).map((line: any) => ({ ...line, color: black }))
        })));
      } catch { /* keep existing signature JSON */ }
      try {
        const raw = String(c.patientDetailsFieldStylesJson || '').trim() || '{}';
        const parsed = JSON.parse(raw);
        const walk = (node: any): any => {
          if (!node || typeof node !== 'object') return node;
          if (Array.isArray(node)) return node.map(walk);
          const out: any = {};
          for (const [k, v] of Object.entries(node)) {
            out[k] = k.toLowerCase() === 'color' ? black : walk(v);
          }
          return out;
        };
        next.patientDetailsFieldStylesJson = JSON.stringify(walk(parsed), null, 2);
      } catch { /* keep existing field styles */ }
      return next as SimpleReportSettings;
    });
    // Without-BG profile text styles only (never background keys)
    this.noBgSettings.update(c => {
      const patch: any = { ...c };
      for (const key of this.layoutDualStyleKeys) {
        const cur = patch[key] as ReportTextStyle | undefined;
        if (cur && typeof cur === 'object') patch[key] = { ...cur, color: black };
      }
      return patch;
    });
    this.snack.open('Black & White applied — font colors only. Backgrounds unchanged. Save to keep.', 'OK', { duration: 2800 });
  }
  private async loadAdvancedSettings(){
    const get = async (k:string, v:any) => String(await (window as any).limsApi.getSetting(k, String(v)) ?? String(v));
    const bool = async (k:string, v:boolean) => (await get(k, v)).toLowerCase() === 'true';
    const num = async (k:string, v:number) => this.numberValue(await get(k, v), v);
    const c = this.settings();
    const advanced: Partial<SimpleReportSettings> = {
      patientDetailsEnabled: await bool('report.simple.patientDetailsEnabled', c.patientDetailsEnabled),
      patientDetailsFields: await get('report.simple.patientDetailsFields', c.patientDetailsFields),
      patientDetailsColumns: this.numberValue(await get('report.simple.patientDetailsColumns', c.patientDetailsColumns), c.patientDetailsColumns),
      patientDetailsShowLabels: await bool('report.simple.patientDetailsShowLabels', c.patientDetailsShowLabels),
      patientDetailsColonText: await get('report.simple.patientDetailsColonText', c.patientDetailsColonText),
      patientDetailsValueCase: this.normalizePatientValueCase(await get('report.simple.patientDetailsValueCase', c.patientDetailsValueCase)),
      patientDetailsLabelsJson: await get('report.simple.patientDetailsLabelsJson', c.patientDetailsLabelsJson),
      patientDetailsShowTimeBilled: await bool('report.simple.patientDetailsShowTimeBilled', c.patientDetailsShowTimeBilled),
      patientDetailsShowTimeCollected: await bool('report.simple.patientDetailsShowTimeCollected', c.patientDetailsShowTimeCollected),
      patientDetailsShowTimeReported: await bool('report.simple.patientDetailsShowTimeReported', c.patientDetailsShowTimeReported),
      patientDetailsFieldStylesJson: await get('report.simple.patientDetailsFieldStylesJson', c.patientDetailsFieldStylesJson),
      patientDetailsOutsideBorder: await bool('report.simple.patientDetailsOutsideBorder', c.patientDetailsOutsideBorder),
      patientDetailsTopBorder: await bool('report.simple.patientDetailsTopBorder', c.patientDetailsTopBorder),
      patientDetailsBottomBorder: await bool('report.simple.patientDetailsBottomBorder', c.patientDetailsBottomBorder),
      patientDetailsLeftBorder: await bool('report.simple.patientDetailsLeftBorder', c.patientDetailsLeftBorder),
      patientDetailsRightBorder: await bool('report.simple.patientDetailsRightBorder', c.patientDetailsRightBorder),
      patientDetailsInnerBorder: await bool('report.simple.patientDetailsInnerBorder', c.patientDetailsInnerBorder),
      patientDetailsInnerHBorder: await bool('report.simple.patientDetailsInnerHBorder', c.patientDetailsInnerBorder),
      patientDetailsInnerVBorder: await bool('report.simple.patientDetailsInnerVBorder', c.patientDetailsInnerBorder),
      patientDetailsBorderColor: this.normalizeColor(await get('report.simple.patientDetailsBorderColor', c.patientDetailsBorderColor), c.patientDetailsBorderColor),
      patientDetailsBorderWidth: await num('report.simple.patientDetailsBorderWidth', c.patientDetailsBorderWidth),
      patientDetailsBgColor: this.normalizeColor(await get('report.simple.patientDetailsBgColor', c.patientDetailsBgColor), c.patientDetailsBgColor),
      patientDetailsLabelWidthMm: await num('report.simple.patientDetailsLabelWidthMm', c.patientDetailsLabelWidthMm),
      patientDetailsRightLabelWidthMm: await num('report.simple.patientDetailsRightLabelWidthMm', c.patientDetailsRightLabelWidthMm),
      patientDetailsRightColumnOffsetMm: this.signedNumberValue(await get('report.simple.patientDetailsRightColumnOffsetMm', String(c.patientDetailsRightColumnOffsetMm)), c.patientDetailsRightColumnOffsetMm),
      patientDetailsColumnGapMm: await num('report.simple.patientDetailsColumnGapMm', c.patientDetailsColumnGapMm),
      patientDetailsSecondColumnMode: (await get('report.simple.patientDetailsSecondColumnMode', c.patientDetailsSecondColumnMode)) === 'right-end' ? 'right-end' : 'manual',
      patientDetailsSecondColumnWidthMm: await num('report.simple.patientDetailsSecondColumnWidthMm', c.patientDetailsSecondColumnWidthMm),
      patientDetailsSecondColumnRightPaddingMm: await num('report.simple.patientDetailsSecondColumnRightPaddingMm', c.patientDetailsSecondColumnRightPaddingMm),
      patientFirstLabelWidthPct: await num('report.simple.patientFirstLabelWidthPct', c.patientFirstLabelWidthPct),
      patientFirstValueWidthPct: await num('report.simple.patientFirstValueWidthPct', c.patientFirstValueWidthPct),
      patientColumnGapWidthPct: await num('report.simple.patientColumnGapWidthPct', c.patientColumnGapWidthPct),
      patientSecondLabelWidthPct: await num('report.simple.patientSecondLabelWidthPct', c.patientSecondLabelWidthPct),
      patientSecondValueWidthPct: await num('report.simple.patientSecondValueWidthPct', c.patientSecondValueWidthPct),
      patientBarcodeEnabled: await bool('report.simple.patientBarcodeEnabled', c.patientBarcodeEnabled),
      patientBarcodeSource: (await get('report.simple.patientBarcodeSource', c.patientBarcodeSource)) as SimpleReportSettings['patientBarcodeSource'],
      patientBarcodeXMm: await num('report.simple.patientBarcodeXMm', c.patientBarcodeXMm),
      patientBarcodeYMm: await num('report.simple.patientBarcodeYMm', c.patientBarcodeYMm),
      patientBarcodeWidthMm: await num('report.simple.patientBarcodeWidthMm', c.patientBarcodeWidthMm),
      patientBarcodeHeightMm: await num('report.simple.patientBarcodeHeightMm', c.patientBarcodeHeightMm),
      patientBarcodeTextEnabled: await bool('report.simple.patientBarcodeTextEnabled', c.patientBarcodeTextEnabled),
      tableColumnArrangement: await get('report.simple.tableColumnArrangement', c.tableColumnArrangement),
      tableFlagsEnabled: await bool('report.simple.tableFlagsEnabled', c.tableFlagsEnabled),
      tableShowFlagColumn: await bool('report.simple.tableShowFlagColumn', c.tableShowFlagColumn),
      tableFlagMode: this.normalizeFlagMode(await get('report.simple.tableFlagMode', c.tableFlagMode)),
      tableFlagDisplayMode: this.normalizeFlagDisplayMode(await get('report.simple.tableFlagDisplayMode', c.tableFlagDisplayMode)),
      tableFlagSymbolPreset: this.normalizeFlagSymbolPreset(await get('report.simple.tableFlagSymbolPreset', c.tableFlagSymbolPreset)),
      highFlagText: await get('report.simple.highFlagText', c.highFlagText),
      lowFlagText: await get('report.simple.lowFlagText', c.lowFlagText),
      criticalHighFlagText: await get('report.simple.criticalHighFlagText', c.criticalHighFlagText),
      criticalLowFlagText: await get('report.simple.criticalLowFlagText', c.criticalLowFlagText),
      tableFlagDrawnArrowSizeMm: await num('report.simple.tableFlagDrawnArrowSizeMm', c.tableFlagDrawnArrowSizeMm),
      tableFlagDrawnArrowStrokeWidth: await num('report.simple.tableFlagDrawnArrowStrokeWidth', c.tableFlagDrawnArrowStrokeWidth),
      referenceSource: this.normalizeReferenceSource(await get('report.simple.referenceSource', c.referenceSource)),
      interpretationEnabled: await bool('report.simple.interpretationEnabled', c.interpretationEnabled),
      interpretationSource: this.normalizeInterpretationSource(await get('report.simple.interpretationSource', c.interpretationSource)),
      interpretationPlacement: this.normalizeInterpretationPlacement(await get('report.simple.interpretationPlacement', c.interpretationPlacement)),
      interpretationLabel: await get('report.simple.interpretationLabel', c.interpretationLabel),
      interpretationShowLabel: await bool('report.simple.interpretationShowLabel', c.interpretationShowLabel),
      interpretationShowBorder: await bool('report.simple.interpretationShowBorder', c.interpretationShowBorder),
      interpretationBgColor: this.normalizeColor(await get('report.simple.interpretationBgColor', c.interpretationBgColor), c.interpretationBgColor),
      interpretationMarginTopMm: await num('report.simple.interpretationMarginTopMm', c.interpretationMarginTopMm),
      interpretationMarginBottomMm: await num('report.simple.interpretationMarginBottomMm', c.interpretationMarginBottomMm),
      remarksEnabled: await bool('report.simple.remarksEnabled', c.remarksEnabled),
      remarksLabel: await get('report.simple.remarksLabel', c.remarksLabel),
      remarksShowLabel: await bool('report.simple.remarksShowLabel', c.remarksShowLabel),
      remarksShowBorder: await bool('report.simple.remarksShowBorder', c.remarksShowBorder),
      remarksBgColor: this.normalizeColor(await get('report.simple.remarksBgColor', c.remarksBgColor), c.remarksBgColor),
      remarksMarginTopMm: await num('report.simple.remarksMarginTopMm', c.remarksMarginTopMm),
      remarksMarginBottomMm: await num('report.simple.remarksMarginBottomMm', c.remarksMarginBottomMm),
      profileRemarksEnabled: await bool('report.simple.profileRemarksEnabled', c.profileRemarksEnabled),
      profileRemarksLabel: await get('report.simple.profileRemarksLabel', c.profileRemarksLabel),
      profileRemarksShowLabel: await bool('report.simple.profileRemarksShowLabel', c.profileRemarksShowLabel),
      profileRemarksShowBorder: await bool('report.simple.profileRemarksShowBorder', c.profileRemarksShowBorder),
      profileRemarksBgColor: this.normalizeColor(await get('report.simple.profileRemarksBgColor', c.profileRemarksBgColor), c.profileRemarksBgColor),
      profileRemarksMarginTopMm: await num('report.simple.profileRemarksMarginTopMm', c.profileRemarksMarginTopMm),
      profileRemarksMarginBottomMm: await num('report.simple.profileRemarksMarginBottomMm', c.profileRemarksMarginBottomMm),
      tableTestSpecimenLabel: await get('report.simple.tableTestSpecimenLabel', c.tableTestSpecimenLabel),
      tableTestLabel: await get('report.simple.tableTestLabel', c.tableTestLabel),
      tableSpecimenLabel: await get('report.simple.tableSpecimenLabel', c.tableSpecimenLabel),
      tableResultFlagLabel: await get('report.simple.tableResultFlagLabel', c.tableResultFlagLabel),
      tableResultLabel: await get('report.simple.tableResultLabel', c.tableResultLabel),
      tableFlagLabel: await get('report.simple.tableFlagLabel', c.tableFlagLabel),
      tableUnitLabel: await get('report.simple.tableUnitLabel', c.tableUnitLabel),
      tableReferenceMethodLabel: await get('report.simple.tableReferenceMethodLabel', c.tableReferenceMethodLabel),
      tableReferenceLabel: await get('report.simple.tableReferenceLabel', c.tableReferenceLabel),
      tableMethodLabel: await get('report.simple.tableMethodLabel', c.tableMethodLabel),
      tableTestSpecimenPct: await num('report.simple.tableTestSpecimenPct', c.tableTestSpecimenPct),
      tableTestPct: await num('report.simple.tableTestPct', c.tableTestPct),
      tableSpecimenPct: await num('report.simple.tableSpecimenPct', c.tableSpecimenPct),
      tableResultFlagPct: await num('report.simple.tableResultFlagPct', c.tableResultFlagPct),
      tableResultPct: await num('report.simple.tableResultPct', c.tableResultPct),
      tableFlagPct: await num('report.simple.tableFlagPct', c.tableFlagPct),
      tableUnitWidthPct: await num('report.simple.tableUnitWidthPct', c.tableUnitWidthPct),
      tableReferenceMethodPct: await num('report.simple.tableReferenceMethodPct', c.tableReferenceMethodPct),
      tableReferencePct: await num('report.simple.tableReferencePct', c.tableReferencePct),
      tableMethodPct: await num('report.simple.tableMethodPct', c.tableMethodPct),
      tableTestSpecimenHeaderAlign: this.normalizeAlignment(await get('report.simple.tableTestSpecimenHeaderAlign', c.tableTestSpecimenHeaderAlign)),
      tableTestHeaderAlign: this.normalizeAlignment(await get('report.simple.tableTestHeaderAlign', c.tableTestHeaderAlign)),
      tableSpecimenHeaderAlign: this.normalizeAlignment(await get('report.simple.tableSpecimenHeaderAlign', c.tableSpecimenHeaderAlign)),
      tableResultFlagHeaderAlign: this.normalizeAlignment(await get('report.simple.tableResultFlagHeaderAlign', c.tableResultFlagHeaderAlign)),
      tableResultHeaderAlign: this.normalizeAlignment(await get('report.simple.tableResultHeaderAlign', c.tableResultHeaderAlign)),
      tableFlagHeaderAlign: this.normalizeAlignment(await get('report.simple.tableFlagHeaderAlign', c.tableFlagHeaderAlign)),
      tableUnitHeaderAlign: this.normalizeAlignment(await get('report.simple.tableUnitHeaderAlign', c.tableUnitHeaderAlign)),
      tableReferenceMethodHeaderAlign: this.normalizeAlignment(await get('report.simple.tableReferenceMethodHeaderAlign', c.tableReferenceMethodHeaderAlign)),
      tableReferenceHeaderAlign: this.normalizeAlignment(await get('report.simple.tableReferenceHeaderAlign', c.tableReferenceHeaderAlign)),
      tableMethodHeaderAlign: this.normalizeAlignment(await get('report.simple.tableMethodHeaderAlign', c.tableMethodHeaderAlign)),
      tableTestSpecimenBodyAlign: this.normalizeAlignment(await get('report.simple.tableTestSpecimenBodyAlign', c.tableTestSpecimenBodyAlign)),
      tableTestBodyAlign: this.normalizeAlignment(await get('report.simple.tableTestBodyAlign', c.tableTestBodyAlign)),
      tableSpecimenBodyAlign: this.normalizeAlignment(await get('report.simple.tableSpecimenBodyAlign', c.tableSpecimenBodyAlign)),
      tableResultFlagBodyAlign: this.normalizeAlignment(await get('report.simple.tableResultFlagBodyAlign', c.tableResultFlagBodyAlign)),
      tableResultBodyAlign: this.normalizeAlignment(await get('report.simple.tableResultBodyAlign', c.tableResultBodyAlign)),
      tableFlagBodyAlign: this.normalizeAlignment(await get('report.simple.tableFlagBodyAlign', c.tableFlagBodyAlign)),
      tableUnitBodyAlign: this.normalizeAlignment(await get('report.simple.tableUnitBodyAlign', c.tableUnitBodyAlign)),
      tableReferenceMethodBodyAlign: this.normalizeAlignment(await get('report.simple.tableReferenceMethodBodyAlign', c.tableReferenceMethodBodyAlign)),
      tableReferenceBodyAlign: this.normalizeAlignment(await get('report.simple.tableReferenceBodyAlign', c.tableReferenceBodyAlign)),
      tableMethodBodyAlign: this.normalizeAlignment(await get('report.simple.tableMethodBodyAlign', c.tableMethodBodyAlign)),
      tableTestSpecimenBodyVerticalCenter: await bool('report.simple.tableTestSpecimenBodyVerticalCenter', c.tableTestSpecimenBodyVerticalCenter),
      tableTestBodyVerticalCenter: await bool('report.simple.tableTestBodyVerticalCenter', c.tableTestBodyVerticalCenter),
      tableSpecimenBodyVerticalCenter: await bool('report.simple.tableSpecimenBodyVerticalCenter', c.tableSpecimenBodyVerticalCenter),
      tableResultFlagBodyVerticalCenter: await bool('report.simple.tableResultFlagBodyVerticalCenter', c.tableResultFlagBodyVerticalCenter),
      tableResultBodyVerticalCenter: await bool('report.simple.tableResultBodyVerticalCenter', c.tableResultBodyVerticalCenter),
      tableFlagBodyVerticalCenter: await bool('report.simple.tableFlagBodyVerticalCenter', c.tableFlagBodyVerticalCenter),
      tableUnitBodyVerticalCenter: await bool('report.simple.tableUnitBodyVerticalCenter', c.tableUnitBodyVerticalCenter),
      tableReferenceMethodBodyVerticalCenter: await bool('report.simple.tableReferenceMethodBodyVerticalCenter', c.tableReferenceMethodBodyVerticalCenter),
      tableReferenceBodyVerticalCenter: await bool('report.simple.tableReferenceBodyVerticalCenter', c.tableReferenceBodyVerticalCenter),
      tableMethodBodyVerticalCenter: await bool('report.simple.tableMethodBodyVerticalCenter', c.tableMethodBodyVerticalCenter),
      referenceVisible: true,
      methodVisible: await bool('report.simple.methodVisible', c.methodVisible),
      referencePlacement: 'right-column',
      methodPlacement: (await get('report.simple.methodPlacement', c.methodPlacement)) as SimpleReportSettings['methodPlacement'],
      methodPrefix: await get('report.simple.methodPrefix', c.methodPrefix),
      specimenVisible: await bool('report.simple.specimenVisible', c.specimenVisible),
      specimenPlacement: (await get('report.simple.specimenPlacement', c.specimenPlacement)) as SimpleReportSettings['specimenPlacement'],
      specimenPrefix: await get('report.simple.specimenPrefix', c.specimenPrefix),
      collectionVisible: await bool('report.simple.collectionVisible', c.collectionVisible),
      tableOutsideBorder: await bool('report.simple.tableOutsideBorder', c.tableOutsideBorder),
      tableTopBorder: await bool('report.simple.tableTopBorder', c.tableTopBorder),
      tableBottomBorder: await bool('report.simple.tableBottomBorder', c.tableBottomBorder),
      tableLeftBorder: await bool('report.simple.tableLeftBorder', c.tableLeftBorder),
      tableRightBorder: await bool('report.simple.tableRightBorder', c.tableRightBorder),
      tableInnerBorder: await bool('report.simple.tableInnerBorder', c.tableInnerBorder),
      tableInnerHBorder: await bool('report.simple.tableInnerHBorder', c.tableInnerBorder),
      tableInnerVBorder: await bool('report.simple.tableInnerVBorder', c.tableInnerBorder),
      tableBorderColor: this.normalizeColor(await get('report.simple.tableBorderColor', c.tableBorderColor), c.tableBorderColor),
      tableBorderWidth: await num('report.simple.tableBorderWidth', c.tableBorderWidth),
      highColor: this.normalizeColor(await get('report.simple.highColor', c.highColor), c.highColor),
      lowColor: this.normalizeColor(await get('report.simple.lowColor', c.lowColor), c.lowColor),
      resultFontSize: await num('report.simple.resultFontSize', c.resultFontSize),
      resultAbnormalFontSize: await num('report.simple.resultAbnormalFontSize', c.resultAbnormalFontSize),
      sectionHeaderBgColor: this.normalizeColor(await get('report.simple.sectionHeaderBgColor', c.sectionHeaderBgColor), c.sectionHeaderBgColor),
      signatureAdvancedEnabled: await bool('report.simple.signatureAdvancedEnabled', c.signatureAdvancedEnabled),
      signatureRowsJson: await get('report.simple.signatureRowsJson', c.signatureRowsJson),
      signatureRowTopMarginMm: await num('report.simple.signatureRowTopMarginMm', c.signatureRowTopMarginMm),
      signatureRowBottomMarginMm: await num('report.simple.signatureRowBottomMarginMm', c.signatureRowBottomMarginMm),
      signatureColumnGapMm: await num('report.simple.signatureColumnGapMm', c.signatureColumnGapMm),
      signatureImageZoneHeightMm: await num('report.simple.signatureImageZoneHeightMm', c.signatureImageZoneHeightMm),
      signatureImageTextGapMm: await num('report.simple.signatureImageTextGapMm', c.signatureImageTextGapMm),
      signatureLine1Height: this.lineHeightValue(await get('report.simple.signatureLine1Height', c.signatureLine1Height), c.signatureLine1Height),
      signatureLine2Height: this.lineHeightValue(await get('report.simple.signatureLine2Height', c.signatureLine2Height), c.signatureLine2Height),
      signatureLine3Height: this.lineHeightValue(await get('report.simple.signatureLine3Height', c.signatureLine3Height), c.signatureLine3Height),
      signatureLine4Height: this.lineHeightValue(await get('report.simple.signatureLine4Height', c.signatureLine4Height), c.signatureLine4Height),
      signatureEmptyLineMode: (await get('report.simple.signatureEmptyLineMode', c.signatureEmptyLineMode)) === 'compact' ? 'compact' : 'reserve'
    };
    this.settings.update(current => ({ ...current, ...advanced }));
  }

  private tableColumnMeta: Record<ReportTableColumnKey, { labelKey: keyof SimpleReportSettings; widthKey: keyof SimpleReportSettings; headerAlignKey: keyof SimpleReportSettings; alignKey: keyof SimpleReportSettings; verticalCenterKey: keyof SimpleReportSettings; fallbackLabel: string; fallbackWidth: number }> = {
    test_specimen: { labelKey:'tableTestSpecimenLabel', widthKey:'tableTestSpecimenPct', headerAlignKey:'tableTestSpecimenHeaderAlign', alignKey:'tableTestSpecimenBodyAlign', verticalCenterKey:'tableTestSpecimenBodyVerticalCenter', fallbackLabel:'Test / Specimen', fallbackWidth:34 },
    test: { labelKey:'tableTestLabel', widthKey:'tableTestPct', headerAlignKey:'tableTestHeaderAlign', alignKey:'tableTestBodyAlign', verticalCenterKey:'tableTestBodyVerticalCenter', fallbackLabel:'Test', fallbackWidth:28 },
    specimen: { labelKey:'tableSpecimenLabel', widthKey:'tableSpecimenPct', headerAlignKey:'tableSpecimenHeaderAlign', alignKey:'tableSpecimenBodyAlign', verticalCenterKey:'tableSpecimenBodyVerticalCenter', fallbackLabel:'Specimen', fallbackWidth:10 },
    result_flag: { labelKey:'tableResultFlagLabel', widthKey:'tableResultFlagPct', headerAlignKey:'tableResultFlagHeaderAlign', alignKey:'tableResultFlagBodyAlign', verticalCenterKey:'tableResultFlagBodyVerticalCenter', fallbackLabel:'Result + Flag', fallbackWidth:13 },
    result: { labelKey:'tableResultLabel', widthKey:'tableResultPct', headerAlignKey:'tableResultHeaderAlign', alignKey:'tableResultBodyAlign', verticalCenterKey:'tableResultBodyVerticalCenter', fallbackLabel:'Result', fallbackWidth:13 },
    flag: { labelKey:'tableFlagLabel', widthKey:'tableFlagPct', headerAlignKey:'tableFlagHeaderAlign', alignKey:'tableFlagBodyAlign', verticalCenterKey:'tableFlagBodyVerticalCenter', fallbackLabel:'Flag', fallbackWidth:5 },
    unit: { labelKey:'tableUnitLabel', widthKey:'tableUnitWidthPct', headerAlignKey:'tableUnitHeaderAlign', alignKey:'tableUnitBodyAlign', verticalCenterKey:'tableUnitBodyVerticalCenter', fallbackLabel:'Unit', fallbackWidth:10 },
    reference_method: { labelKey:'tableReferenceMethodLabel', widthKey:'tableReferenceMethodPct', headerAlignKey:'tableReferenceMethodHeaderAlign', alignKey:'tableReferenceMethodBodyAlign', verticalCenterKey:'tableReferenceMethodBodyVerticalCenter', fallbackLabel:'Reference / Method', fallbackWidth:43 },
    reference: { labelKey:'tableReferenceLabel', widthKey:'tableReferencePct', headerAlignKey:'tableReferenceHeaderAlign', alignKey:'tableReferenceBodyAlign', verticalCenterKey:'tableReferenceBodyVerticalCenter', fallbackLabel:'Reference', fallbackWidth:35 },
    method: { labelKey:'tableMethodLabel', widthKey:'tableMethodPct', headerAlignKey:'tableMethodHeaderAlign', alignKey:'tableMethodBodyAlign', verticalCenterKey:'tableMethodBodyVerticalCenter', fallbackLabel:'Method', fallbackWidth:8 }
  };
  tableArrangementColumns(): Array<{ key: ReportTableColumnKey }> {
    const s = this.settings();
    const keys = String(s.tableColumnArrangement || DEFAULT_REPORT_SETTINGS.tableColumnArrangement).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    const flagActive = s.tableFlagsEnabled && s.tableFlagMode !== 'none' && s.tableFlagMode !== 'range_only';
    const out: ReportTableColumnKey[] = [];
    const push = (key: ReportTableColumnKey) => { if (!out.includes(key)) out.push(key); };
    const valid = (key: string): key is ReportTableColumnKey => !!(this.tableColumnMeta as any)[key];
    for (const raw of keys.length ? keys : ['test_specimen','result_flag','unit','reference_method']) {
      if (!valid(raw)) continue;
      if (raw === 'test_specimen') {
        if (s.specimenVisible && s.specimenPlacement === 'separate-column') { push('test'); push('specimen'); }
        else push('test_specimen');
      } else if (raw === 'specimen') {
        if (s.specimenVisible && s.specimenPlacement !== 'hidden') push('specimen');
      } else if (raw === 'result_flag') {
        if (!flagActive) push('result');
        else if (s.tableShowFlagColumn) { push('result'); push('flag'); }
        else push('result_flag');
      } else if (raw === 'flag') {
        if (flagActive && s.tableShowFlagColumn) push('flag');
      } else if (raw === 'reference_method') {
        if (s.methodVisible && s.methodPlacement === 'separate-column') { push('reference'); push('method'); }
        else push('reference_method');
      } else if (raw === 'method') {
        if (s.methodVisible && s.methodPlacement !== 'hidden') push('method');
      } else {
        push(raw);
      }
    }
    if (!out.some(k => k === 'reference' || k === 'reference_method')) push(s.methodVisible && s.methodPlacement === 'separate-column' ? 'reference' : 'reference_method');
    return out.map(key => ({ key }));
  }
  trackColumnKey(_: number, item: { key: ReportTableColumnKey }){ return item.key; }
  tableColumnLabelValue(key: ReportTableColumnKey): string { const meta = this.tableColumnMeta[key]; return String((this.settings() as any)[meta.labelKey] || meta.fallbackLabel); }
  tableColumnWidthValue(key: ReportTableColumnKey): number { const meta = this.tableColumnMeta[key]; return this.percentValue((this.settings() as any)[meta.widthKey], meta.fallbackWidth); }
  updateTableColumnLabel(key: ReportTableColumnKey, value: string){ const meta = this.tableColumnMeta[key]; this.updateField(meta.labelKey as any, String(value || meta.fallbackLabel) as any); }
  updateTableColumnWidth(key: ReportTableColumnKey, value: any){ const meta = this.tableColumnMeta[key]; this.updateField(meta.widthKey as any, this.percentValue(value, meta.fallbackWidth) as any); }
  tableColumnHeaderAlignValue(key: ReportTableColumnKey): ReportAlignment { const meta = this.tableColumnMeta[key]; return this.normalizeAlignment((this.settings() as any)[meta.headerAlignKey]); }
  updateTableColumnHeaderAlign(key: ReportTableColumnKey, value: any){ const meta = this.tableColumnMeta[key]; this.updateField(meta.headerAlignKey as any, this.normalizeAlignment(value) as any); }
  tableColumnBodyAlignValue(key: ReportTableColumnKey): ReportAlignment { const meta = this.tableColumnMeta[key]; return this.normalizeAlignment((this.settings() as any)[meta.alignKey]); }
  tableColumnBodyVerticalCenterValue(key: ReportTableColumnKey): boolean { const meta = this.tableColumnMeta[key]; return !!(this.settings() as any)[meta.verticalCenterKey]; }
  updateTableColumnBodyAlign(key: ReportTableColumnKey, value: any){ const meta = this.tableColumnMeta[key]; this.updateField(meta.alignKey as any, this.normalizeAlignment(value) as any); }
  updateTableColumnBodyVerticalCenter(key: ReportTableColumnKey, value: any){ const meta = this.tableColumnMeta[key]; this.updateField(meta.verticalCenterKey as any, !!value as any); }
  tableArrangementWidthTotal(): number { const total = this.tableArrangementColumns().reduce((sum, col) => sum + Number(this.tableColumnWidthValue(col.key) || 0), 0); return Math.round(total * 10) / 10; }

  updateField<K extends keyof SimpleReportSettings>(key:K,value:SimpleReportSettings[K]){ this.settings.update(c=>({ ...c, [key]: value })); }
  updateColorField(key: ReportColorKey, value: string){ this.settings.update(c=>({ ...c, [key]: this.normalizeColor(value, (c as any)[key] || '#ffffff') })); }
  updateStyle(section:any,key:keyof ReportTextStyle,value:any){ this.settings.update(c=>{ const cur=(c as any)[section] as ReportTextStyle; const next= key==='fontSize'?this.fontSizeValue(value,cur.fontSize):key==='fontFamily'?this.normalizeFontFamily(value):key==='color'?this.normalizeColor(value,cur.color||'#111111'):!!value; return { ...c, [section]: { ...cur, [key]: next } } as SimpleReportSettings; }); }
  async save(){ this.saving.set(true); try{ const v=this.settings(); const set=(k:string,val:any)=>(window as any).limsApi.setSetting(k,String(val??''));
    for(const key of Object.keys(v) as Array<keyof SimpleReportSettings>){ const value:any=v[key]; if(typeof value==='object' && value && 'fontSize' in value) continue; await set(`report.simple.${String(key)}`, value); }
    for(const row of this.fontRows) await this.saveTextStyle(row.key, (v as any)[row.key]);
    await this.saveNoBgLayout();
    this.snack.open('Report settings saved','OK',{duration:2200}); } finally { this.saving.set(false); } }
  async chooseBackground(){ const selected=await (window as any).limsApi.chooseReportBackgroundImage(); if(!selected?.path) return; this.settings.update(c=>({ ...c, backgroundEnabled:true, backgroundImagePath:selected.path })); await this.save(); }
  clearBackground(){ this.settings.update(c=>({ ...c, backgroundImagePath:'' })); }
  async chooseLogo(profile: 'withBg' | 'noBg' = 'withBg'){ const selected=await (window as any).limsApi.chooseReportBackgroundImage(); if(!selected?.path) return; this.updateLayoutField(profile, 'headerLogoEnabled', true); this.updateLayoutField(profile, 'headerLogoPath', selected.path); await this.save(); }
  clearLogo(profile: 'withBg' | 'noBg' = 'withBg'){ this.updateLayoutField(profile, 'headerLogoPath', ''); }
  async chooseSignImage(){ const selected=await (window as any).limsApi.chooseReportBackgroundImage(); if(!selected?.path) return; this.settings.update(c=>({ ...c, labSignImageEnabled:true, labSignImagePath:selected.path })); await this.save(); }
  clearSignImage(){ this.settings.update(c=>({ ...c, labSignImagePath:'', labSignImageEnabled:false })); }
  async chooseOtherSignImage(){ const selected=await (window as any).limsApi.chooseReportBackgroundImage(); if(!selected?.path) return; this.settings.update(c=>({ ...c, otherSignImageEnabled:true, otherSignImagePath:selected.path })); await this.save(); }
  clearOtherSignImage(){ this.settings.update(c=>({ ...c, otherSignImagePath:'', otherSignImageEnabled:false })); }
  signatureBlocks(): any[] {
    const raw = this.settings().signatureRowsJson || '';
    if (this.signatureRowsCacheRaw === raw && this.signatureRowsCache) return this.signatureRowsCache;
    try {
      this.signatureRowsCacheRaw = raw;
      this.signatureRowsCache = this.normalizeSignatureRows(raw);
      return this.signatureRowsCache;
    } catch {
      this.signatureRowsCacheRaw = raw;
      this.signatureRowsCache = [];
      return this.signatureRowsCache;
    }
  }
  signatureLines(sign: any): any[] { return Array.isArray(sign?.lines) ? sign.lines : this.normalizeSignatureLines(sign?.lines); }
  signatureLinePlaceholder(index: number): string { return ['Designation / Title', 'Doctor / Person Name', 'Qualification', 'Extra wording'][index] || 'Wording'; }
  defaultSignatureLineSize(index: number): number { return index === 1 ? 10 : 8; }
  private normalizeSignatureRows(raw: any): any[] {
    let rows: any[] = [];
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.signatures) ? parsed.signatures : [];
    } catch { rows = []; }
    return rows.map((row, index) => this.normalizeSignatureBlock(row, index));
  }
  private normalizeSignatureBlock(row: any, index: number): any {
    const fallbackPos = index % 3 === 0 ? 'left' : index % 3 === 1 ? 'center' : 'right';
    return {
      uid: String(row?.uid || row?.id || `sig-${index}`),
      enabled: row?.enabled !== false,
      row: Number.isFinite(Number(row?.row)) ? Number(row.row) : Math.floor(index / 3),
      order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index,
      position: this.normalizeAlignment(row?.position || fallbackPos),
      textAlignment: this.normalizeAlignment(row?.textAlignment || 'center'),
      imageAlignment: this.normalizeAlignment(row?.imageAlignment || 'center'),
      imagePath: String(row?.imagePath || ''),
      blockLeftMarginMm: this.signedNumberValue(row?.blockLeftMarginMm ?? row?.leftMarginMm, 0),
      blockRightMarginMm: this.signedNumberValue(row?.blockRightMarginMm ?? row?.rightMarginMm, 0),
      blockTopOffsetMm: this.signedNumberValue(row?.blockTopOffsetMm ?? row?.topOffsetMm, 0),
      blockBottomOffsetMm: this.signedNumberValue(row?.blockBottomOffsetMm ?? row?.bottomOffsetMm, 0),
      imageWidthMm: this.numberValue(row?.imageWidthMm, 28),
      imageHeightMm: this.numberValue(row?.imageHeightMm, 12),
      imageLeftOffsetMm: this.signedNumberValue(row?.imageLeftOffsetMm ?? row?.imageOffsetXMm, 0),
      imageRightOffsetMm: this.signedNumberValue(row?.imageRightOffsetMm, 0),
      imageTopOffsetMm: this.signedNumberValue(row?.imageTopOffsetMm ?? row?.imageOffsetYMm, 0),
      imageBottomOffsetMm: this.signedNumberValue(row?.imageBottomOffsetMm, 0),
      imageOffsetXMm: this.signedNumberValue(row?.imageOffsetXMm ?? row?.imageLeftOffsetMm, 0),
      imageOffsetYMm: this.signedNumberValue(row?.imageOffsetYMm ?? row?.imageTopOffsetMm, 0),
      lines: this.normalizeSignatureLines(row?.lines)
    };
  }
  private normalizeSignatureLines(lines: any): any[] {
    const arr = Array.isArray(lines) ? lines : [];
    return [0,1,2,3].map((idx) => {
      const l = arr[idx] || {};
      return {
        text: String(l.text || ''),
        fontFamily: this.normalizeFontFamily(l.fontFamily || 'Roboto'),
        fontSize: this.fontSizeValue(l.fontSize, this.defaultSignatureLineSize(idx)),
        color: this.normalizeColor(l.color || '#111111', '#111111'),
        bold: !!l.bold,
        italic: !!l.italic,
        underline: !!l.underline,
        alignment: this.normalizeAlignment(l.alignment || 'center')
      };
    });
  }
  trackSignatureBlock(index: number, sign: any): any { return sign?.uid || sign?.id || index; }
  trackSignatureLine(index: number): number { return index; }
  private preserveSignatureScroll(action: () => void) {
    const active = typeof document !== 'undefined' ? document.activeElement as HTMLElement | null : null;
    const targets = typeof document !== 'undefined' ? [
      document.scrollingElement as HTMLElement | null,
      document.querySelector('.settings-step-content') as HTMLElement | null,
      document.querySelector('.report-settings-content') as HTMLElement | null,
      document.querySelector('.settings-panel') as HTMLElement | null
    ].filter((el): el is HTMLElement => !!el) : [];
    const positions = targets.map(el => ({ el, top: el.scrollTop, left: el.scrollLeft }));
    action();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        for (const pos of positions) { pos.el.scrollTop = pos.top; pos.el.scrollLeft = pos.left; }
        if (active && typeof active.focus === 'function' && document.contains(active)) {
          try { active.focus({ preventScroll: true }); } catch { active.focus(); }
        }
      });
    }
  }
  private setSignatureRows(rows: any[]) {
    this.preserveSignatureScroll(() => this.settings.update(c => ({ ...c, signatureAdvancedEnabled: true, signatureRowsJson: JSON.stringify(rows, null, 2) })));
  }
  addSignatureBlock() {
    const rows = this.signatureBlocks();
    const index = rows.length;
    rows.push(this.normalizeSignatureBlock({
      uid: `sig-${Date.now()}-${index}`,
      enabled: true,
      row: Math.floor(index / 3),
      order: index,
      position: index % 3 === 0 ? 'left' : index % 3 === 1 ? 'center' : 'right',
      textAlignment: 'center',
      imageAlignment: 'center',
      imageWidthMm: 28,
      imageHeightMm: 12,
      lines: [
        { text: '', fontFamily: 'Roboto', fontSize: 8, color: '#111111' },
        { text: '', fontFamily: 'Roboto', fontSize: 10, color: '#111111', bold: true },
        { text: '', fontFamily: 'Roboto', fontSize: 8, color: '#111111' },
        { text: '', fontFamily: 'Roboto', fontSize: 8, color: '#111111' }
      ]
    }, index));
    this.setSignatureRows(rows);
  }
  deleteSignatureBlock(index: number) { const rows = this.signatureBlocks(); rows.splice(index, 1); this.setSignatureRows(rows.map((r, i) => ({ ...r, order: i }))); }
  moveSignatureBlock(index: number, delta: number) { const rows = this.signatureBlocks(); const next = index + delta; if (next < 0 || next >= rows.length) return; const [row] = rows.splice(index, 1); rows.splice(next, 0, row); this.setSignatureRows(rows.map((r, i) => ({ ...r, order: i, row: Math.floor(i / 3) }))); }
  updateSignatureBlock(index: number, key: string, value: any) { const rows = this.signatureBlocks(); if (!rows[index]) return; rows[index] = { ...rows[index], [key]: value }; this.setSignatureRows(rows); }
  updateSignatureLine(index: number, lineIndex: number, key: string, value: any) { const rows = this.signatureBlocks(); if (!rows[index]) return; const lines = this.normalizeSignatureLines(rows[index].lines); lines[lineIndex] = { ...lines[lineIndex], [key]: value }; rows[index] = { ...rows[index], lines }; this.setSignatureRows(rows); }
  async chooseAdvancedSignImage(index: number){ const selected=await (window as any).limsApi.chooseReportBackgroundImage(); if(!selected?.path) return; this.updateSignatureBlock(index, 'imagePath', selected.path); await this.save(); }
  clearAdvancedSignImage(index: number){ this.updateSignatureBlock(index, 'imagePath', ''); }
  onStepperWheel(e:WheelEvent){ const t=this.stepperTrack?.nativeElement; if(!t) return; const a=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY; if(!a) return; const b=t.scrollLeft; t.scrollLeft+=a; if(t.scrollLeft!==b)e.preventDefault(); }
  onStepperMouseDown(e:MouseEvent){ if(e.button!==0)return; this.beginStepperDrag(e.clientX); }
  @HostListener('window:mousemove',['$event']) onWindowMouseMove(e:MouseEvent){ this.moveStepperDrag(e.clientX,e); }
  @HostListener('window:mouseup') onWindowMouseUp(){ this.endStepperDrag(); }
  @HostListener('window:pointerup') onWindowPointerUp(){ this.endStepperDrag(); }
  @HostListener('window:blur') onWindowBlur(){ this.endStepperDrag(); }
  @HostListener('document:visibilitychange') onVisibilityChange(){ if (document.hidden) this.endStepperDrag(); }
  onStepperTouchStart(e:TouchEvent){ const t=e.touches.item(0); if(t)this.beginStepperDrag(t.clientX); }
  onStepperTouchMove(e:TouchEvent){ const t=e.touches.item(0); if(t)this.moveStepperDrag(t.clientX,e); }
  @HostListener('window:touchend') onWindowTouchEnd(){ this.endStepperDrag(); }
  @HostListener('window:touchcancel') onWindowTouchCancel(){ this.endStepperDrag(); }
  selectStep(id:ReportSettingsStepId,e?:MouseEvent){ if(this.suppressNextStepClick){ e?.preventDefault(); e?.stopPropagation(); this.suppressNextStepClick=false; return;} this.activeStep.set(id); }
  private beginStepperDrag(x:number){ const t=this.stepperTrack?.nativeElement; if(!t)return; this.stepperDragging=true; this.suppressNextStepClick=false; this.stepperDragStartX=x; this.stepperDragStartScrollLeft=t.scrollLeft; t.classList.add('dragging'); }
  private moveStepperDrag(x:number,e:MouseEvent|TouchEvent){ const t=this.stepperTrack?.nativeElement; if(!t||!this.stepperDragging)return; const dx=x-this.stepperDragStartX; if(Math.abs(dx)>4){ this.suppressNextStepClick=true; t.scrollLeft=this.stepperDragStartScrollLeft-dx; e.preventDefault(); } }
  endStepperDrag(){ if (!this.stepperDragging && !this.stepperTrack?.nativeElement.classList.contains('dragging')) return; this.stepperTrack?.nativeElement.classList.remove('dragging'); this.stepperDragging=false; }
  private async loadTextStyle(key:any,f:ReportTextStyle):Promise<ReportTextStyle>{ const base=`report.simple.${key}`; const get=async(s:string,val:string)=>String(await (window as any).limsApi.getSetting(`${base}.${s}`,val)??val); return { fontFamily:this.normalizeFontFamily(await get('fontFamily',f.fontFamily)), fontSize:this.fontSizeValue(await get('fontSize',String(f.fontSize)),f.fontSize), bold:(await get('bold',String(f.bold))).toLowerCase()==='true', italic:(await get('italic',String(f.italic))).toLowerCase()==='true', underline:(await get('underline',String(!!f.underline))).toLowerCase()==='true', color:this.normalizeColor(await get('color',f.color||'#111111'),f.color||'#111111') }; }
  private async saveTextStyle(key:any,s:ReportTextStyle){ const base=`report.simple.${key}`; await (window as any).limsApi.setSetting(`${base}.fontFamily`,this.normalizeFontFamily(s.fontFamily)); await (window as any).limsApi.setSetting(`${base}.fontSize`,String(this.fontSizeValue(s.fontSize,9))); await (window as any).limsApi.setSetting(`${base}.bold`,String(!!s.bold)); await (window as any).limsApi.setSetting(`${base}.italic`,String(!!s.italic)); await (window as any).limsApi.setSetting(`${base}.underline`,String(!!s.underline)); await (window as any).limsApi.setSetting(`${base}.color`,this.normalizeColor(s.color,'#111111')); }
  private normalizeColor(v:any,f='#111111'){ const c=String(v||'').trim(); return /^#[0-9a-fA-F]{6}$/.test(c)?c:f; } private normalizeFontFamily(v:any):ReportFontFamily{ const n=String(v||'').toLowerCase().replace(/[\s_-]+/g,'').trim(); const aliases:Record<string,ReportFontFamily>={ roboto:'Roboto', helvetica:'Roboto', arial:'Roboto', calibri:'Roboto', segoeui:'Roboto', tahoma:'Roboto', verdana:'Roboto', inter:'Inter', lato:'Lato', notosans:'NotoSans', noto:'NotoSans', notoserif:'NotoSerif', notosanstamil:'NotoSansTamil', tamil:'NotoSansTamil', notosansdevanagari:'NotoSansDevanagari', devanagari:'NotoSansDevanagari', hindi:'NotoSansDevanagari', marathi:'NotoSansDevanagari', maratghi:'NotoSansDevanagari', notosansmalayalam:'NotoSansMalayalam', malayalam:'NotoSansMalayalam', notosanskannada:'NotoSansKannada', kannada:'NotoSansKannada', notosanstelugu:'NotoSansTelugu', telugu:'NotoSansTelugu', notosansbengali:'NotoSansBengali', bengali:'NotoSansBengali', notosanssymbols:'NotoSansSymbols', symbols:'NotoSansSymbols', arrow:'NotoSansSymbols', arrows:'NotoSansSymbols', notosanssymbols2:'NotoSansSymbols2', symbols2:'NotoSansSymbols2', poppins:'Poppins', montserrat:'Montserrat', opensans:'OpenSans', nunito:'NunitoSans', nunitosans:'NunitoSans', sourcesans:'SourceSans3', sourcesans3:'SourceSans3', merriweather:'Merriweather', librebaskerville:'LibreBaskerville', baskerville:'LibreBaskerville', lora:'Lora' }; return aliases[n] || 'Roboto'; } private normalizeAlignment(v:any):ReportAlignment{ const n=String(v||'').toLowerCase(); return n==='left'||n==='right'?n:'center'; }
  private fontSizeValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(6,Math.min(30,n)):f; } private percentValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(1,Math.min(80,n)):f; } private numberValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(0,Math.min(100,n)):f; } signedNumberValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(-100,Math.min(100,n)):f; }
  private percentWideValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(5,Math.min(100,n)):f; } percentFullValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(1,Math.min(100,n)):f; } opacityValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(0.01,Math.min(1,n)):f; } private signedSmallNumberValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(-20,Math.min(20,n)):f; } private lineHeightValue(v:any,f:number){ const n=Number(v); return Number.isFinite(n)?Math.max(0.8,Math.min(2.5,n)):f; } private normalizeDisclaimerPlacement(v:any):DisclaimerPlacement{ const n=String(v||'').toLowerCase(); return n==='hidden'||n==='above-footer'?n:'footer'; }


  normalizeBackgroundImageArea(v:any): ReportBackgroundImageArea { return String(v||'').toLowerCase()==='body_watermark'?'body_watermark':'full_page'; }
  normalizeBackgroundBlendPreset(v:any): ReportBackgroundBlendPreset { const n=String(v||'').toLowerCase(); return n==='light'||n==='very_light'||n==='faint'||n==='custom'?n:'normal'; }
  normalizeBackgroundImageFit(v:any): ReportBackgroundImageFit { const n=String(v||'').toLowerCase(); return n==='contain'||n==='stretch'?n:'cover'; }
  applyBackgroundBlendPreset(v:any){ const preset=this.normalizeBackgroundBlendPreset(v); const opacityMap:Record<ReportBackgroundBlendPreset,number>={ normal:1, light:0.35, very_light:0.18, faint:0.08, custom:this.settings().backgroundImageOpacity }; this.settings.update(c=>({ ...c, backgroundImageBlendPreset:preset, backgroundImageOpacity:opacityMap[preset] })); }
  updateBackgroundOpacity(value:any){ this.settings.update(c=>({ ...c, backgroundImageBlendPreset:'custom', backgroundImageOpacity:this.opacityValue(value, c.backgroundImageOpacity) })); }

  normalizeInterpretationSource(v:any): ReportInterpretationSource { const n=String(v||'').toLowerCase(); return n==='test'||n==='profile'?n:'both'; }
  normalizeInterpretationPlacement(v:any): ReportInterpretationPlacement { const n=String(v||'').toLowerCase(); return n==='after-profile'||n==='end-of-group'?n:'after-test'; }

  normalizePatientValueCase(v:any): 'as_entered' | 'upper' | 'title' | 'lower' {
    const n = String(v || '').trim().toLowerCase();
    if (n === 'upper' || n === 'uppercase') return 'upper';
    if (n === 'title' || n === 'titlecase' || n === 'title_case') return 'title';
    if (n === 'lower' || n === 'lowercase') return 'lower';
    return 'as_entered';
  }

  normalizeFlagDisplayMode(v:any): ReportFlagDisplayMode { const n=String(v||'').toLowerCase(); return n==='symbol'||n==='drawn_arrow'||n==='custom'?n:'text'; }
  normalizeFlagSymbolPreset(v:any): ReportFlagSymbolPreset { const n=String(v||'').toLowerCase(); return n==='arrows'||n==='triangles'||n==='plus_minus'||n==='custom'?n:'text'; }
  applyFlagSymbolPreset(v:any){ const preset=this.normalizeFlagSymbolPreset(v); const map:Record<ReportFlagSymbolPreset,{mode:ReportFlagDisplayMode;h:string;l:string;ch:string;cl:string}>={ text:{mode:'text',h:'H',l:'L',ch:'CH',cl:'CL'}, arrows:{mode:'drawn_arrow',h:'↑',l:'↓',ch:'↑↑',cl:'↓↓'}, triangles:{mode:'symbol',h:'▲',l:'▼',ch:'▲▲',cl:'▼▼'}, plus_minus:{mode:'symbol',h:'+',l:'-',ch:'++',cl:'--'}, custom:{mode:'custom',h:this.settings().highFlagText,l:this.settings().lowFlagText,ch:this.settings().criticalHighFlagText,cl:this.settings().criticalLowFlagText} }; const m=map[preset]; this.settings.update(c=>({ ...c, tableFlagSymbolPreset:preset, tableFlagDisplayMode:m.mode, highFlagText:m.h, lowFlagText:m.l, criticalHighFlagText:m.ch, criticalLowFlagText:m.cl })); }
  updateFlagText(key:'highFlagText'|'lowFlagText'|'criticalHighFlagText'|'criticalLowFlagText', value:any){ this.settings.update(c=>({ ...c, [key]:String(value ?? ''), tableFlagDisplayMode:'custom', tableFlagSymbolPreset:'custom' } as SimpleReportSettings)); }

  normalizeFlagMode(v:any): ReportFlagMode{ const n=String(v||'').toLowerCase(); return n==='none'||n==='range_only'||n==='flag_only'||n==='flag_abnormal'||n==='critical_flag_abnormal'?n:'critical_flag_abnormal'; } private normalizeReferenceSource(v:any): ReportReferenceSource{ return String(v||'').toLowerCase()==='generated_only'?'generated_only':'saved'; }
  private normalizePageSize(v:any):SimpleReportSettings['pageSize']{ const n=String(v||'').toUpperCase(); return n==='A5'||n==='LETTER'||n==='LEGAL'?n:'A4'; } private normalizeOrientation(v:any):SimpleReportSettings['orientation']{ return String(v||'').toLowerCase()==='landscape'?'landscape':'portrait'; }
}
