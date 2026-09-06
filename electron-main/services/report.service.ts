import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
const PdfPrinter = require('pdfmake');
type ReportAlignment = 'left' | 'center' | 'right';
import { BrowserWindow, shell } from 'electron';
import { ReportDocumentService } from './report-document.service';

export class ReportService extends ReportDocumentService {  async createBillPdf(billId:number, includeReceipts = false) {
    const b=this.db.getBill(billId); if(!b) throw new Error('Bill not found');
    const org=this.org();
    const setting = (key:string, fallback:string) => String(this.db.getSetting(`billing.pdf.${key}`, fallback) ?? fallback);
    const settingBool = (key:string, fallback=true) => setting(key, String(fallback)).toLowerCase() === 'true';
    const settingNum = (key:string, fallback:number, min=6, max=40) => { const n=Number(setting(key,String(fallback))); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; };
    const settingColor = (key:string, fallback:string) => { const c=setting(key,fallback); return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback; };
    const billingName = setting('centreName','').trim() || org.name;
    const billingSubtitle = setting('subtitle','DIAGNOSTIC CENTRE').trim();
    const billingAddress = setting('address','').trim() || org.address;
    const billingPhone = setting('phone','').trim() || org.phone;
    const billingEmail = setting('email','').trim() || org.email;
    const logoEnabled = settingBool('logoEnabled', false);
    const logoPath = setting('logoPath','').trim();
    const logoPlacement = ['left','center','right'].includes(setting('logoPlacement','left')) ? setting('logoPlacement','left') : 'left';
    const logoWidth = settingNum('logoWidth',48,10,160);
    const logoHeight = settingNum('logoHeight',48,10,120);
    const billingLogo = logoEnabled && logoPath && fs.existsSync(logoPath) ? logoPath : '';
    const invoiceTitle = setting('invoiceTitle','BILL / INVOICE').trim() || 'BILL / INVOICE';
    const billingFooter = setting('footerText','').trim() || org.footer || 'This bill is electronically generated.';
    const thankYouText = setting('thankYouText','Thank you for choosing us').trim() || 'Thank you';
    const authorisedLabel = setting('authorisedLabel','Authorised Signatory').trim() || 'Authorised Signatory';
    const billingFont = this.reportFont(setting('fontFamily','Roboto'));
    const centreNameSize = settingNum('centreNameSize',24,10,36);
    const subtitleSize = settingNum('subtitleSize',9,6,20);
    const bodySize = settingNum('bodySize',8.8,6,18);
    const patientSize = settingNum('patientSize',9,6,18);
    const tableHeaderSize = settingNum('tableHeaderSize',8.5,6,18);
    const tableBodySize = settingNum('tableBodySize',8.5,6,18);
    const totalsSize = settingNum('totalsSize',9,6,20);
    const footerSize = settingNum('footerSize',8,6,16);
    const showPhone = settingBool('showPhone');
    const showEmail = settingBool('showEmail');
    const showAddress = settingBool('showAddress');
    const showPatientAddress = settingBool('showPatientAddress');
    const showConsultant = settingBool('showConsultant');
    const showItemDiscount = settingBool('showItemDiscount');
    const showAuthorisedSignature = settingBool('showAuthorisedSignature');
    const showThankYou = settingBool('showThankYou');
    const items = b.items || [];
    const receipts = b.receipts || [];
    const itemDiscounts = items.reduce((sum:number,i:any)=>sum+(+i.discount_amount||0),0);
    const paid = +b.paid || 0;
    const total = +b.total || 0;
    const due = +b.due || 0;
    const excess = Math.max(0, paid - total);
    const isCancelled = String(b.status || '').toUpperCase() === 'CANCELLED';
    const paidStatus = this.statusLabel(b);
    const paymentType = receipts.length > 1 ? 'Multiple' : receipts.length === 1 ? receipts[0].payment_mode : 'Pending';
    const patientName = this.billPatientText([b.title, b.name].filter(Boolean).join(' ') || b.name || '-');
    const ageParts = this.formatAgeForDisplay(b);
    const ageGender = [ageParts || '-', this.billPatientText(b.gender || '-')].join(' / ');
    const patientRegistered = b.patient_registered_at || b.created_at;
    const patientAddress = this.billPatientText(b.address || '');
    const consultantName = this.billPatientText(b.consultant_name || 'Walk-in');

    const navy = settingColor('primaryColor','#0b3a70');
    const blue = settingColor('accentColor','#0f68b7');
    const pale = '#eef7ff';
    const border = settingColor('borderColor','#d6e3f2');
    const bodyTextColor = settingColor('textColor','#0f172a');
    const alternateRowColor = settingColor('alternateRowColor','#f8fbff');
    const green = '#16a34a';
    const red = '#dc2626';
    const amber = '#d97706';
    const statusColor = isCancelled ? red : paidStatus === 'PAID' ? green : paidStatus === 'PARTIAL PAID' ? amber : paidStatus === 'PENDING' ? '#64748b' : '#7c3aed';

    const labelValueRows = (rows:any[]) => rows.map(([label,value]:any[]) => ({
      columns:[
        {text: label, width: 92, color:'#334155'},
        {text: ':', width: 10, color:'#64748b'},
        {text: this.safeText(value), bold:true, color:'#0f172a'}
      ],
      margin:[0,1.6,0,1.6]
    }));

    const billInfoRows = (rows:any[]) => rows.map(([label,value,highlight]:any[]) => [
      {text: label, color:'#334155', margin:[6,3,0,3]},
      {text: ':', color:'#64748b', margin:[0,3,0,3]},
      {text: this.safeText(value), bold:!!highlight, color: highlight ? blue : '#0f172a', margin:[0,3,6,3]}
    ]);

    const receiptNos = receipts.map((r:any) => r.receipt_no).filter(Boolean).join(', ');
    const itemHeader:any[] = [
      {text:'#',bold:true,color:'#fff',alignment:'center',fontSize:tableHeaderSize},
      {text:'Test / Item',bold:true,color:'#fff',fontSize:tableHeaderSize},
      {text:'Qty',bold:true,color:'#fff',alignment:'center',fontSize:tableHeaderSize},
      {text:'Rate (₹)',bold:true,color:'#fff',alignment:'right',fontSize:tableHeaderSize}
    ];
    if (showItemDiscount) itemHeader.push(
      {text:'Disc. %',bold:true,color:'#fff',alignment:'right',fontSize:tableHeaderSize},
      {text:'Disc. ₹',bold:true,color:'#fff',alignment:'right',fontSize:tableHeaderSize}
    );
    itemHeader.push({text:'Net (₹)',bold:true,color:'#fff',alignment:'right',fontSize:tableHeaderSize});
    const itemBody:any[] = [itemHeader, ...items.map((i:any,idx:number)=>{
      const discType = String(i.discount_type || 'VALUE').toUpperCase();
      const discValue = +i.discount_value || 0;
      const row:any[] = [
        {text:String(idx+1),alignment:'center',fontSize:tableBodySize},
        {text:i.name,bold:true,fontSize:tableBodySize},
        {text:String(i.quantity || 1),alignment:'center',fontSize:tableBodySize},
        {text:this.money(i.price),alignment:'right',fontSize:tableBodySize}
      ];
      if (showItemDiscount) row.push(
        {text:discType === 'PERCENT' && discValue > 0 ? `${this.money(discValue)}%` : '-',alignment:'right',fontSize:tableBodySize},
        {text:this.money(i.discount_amount),alignment:'right',fontSize:tableBodySize}
      );
      row.push({text:this.money(i.total),alignment:'right',bold:true,fontSize:tableBodySize});
      return row;
    })];
    const itemWidths:any[] = showItemDiscount ? [28,'*',42,58,50,58,65] : [28,'*',42,65,72];

    const totalsRows:any[] = [
      ['Subtotal', this.inr(b.subtotal)],
      ['Item Discounts', this.inr(itemDiscounts)],
      ['Final Discount', this.inr(b.discount)],
      ['Round Off', this.inr(b.round_off)],
      [{text:'TOTAL',bold:true,fontSize:Math.max(10,totalsSize+2),color:navy}, {text:this.inr(b.total),bold:true,fontSize:Math.max(10,totalsSize+2),color:navy,alignment:'right'}],
      ['Paid', this.inr(b.paid)],
      ['Due', this.inr(b.due), due > 0 ? red : green],
      ['Excess Receipt', this.inr(excess), excess > 0 ? '#7c3aed' : green],
      [{text:'PAID STATUS',bold:true,color:'#fff'}, {text:paidStatus,bold:true,color: isCancelled ? '#fecaca' : '#86efac',alignment:'right'}]
    ].map((r:any, idx:number) => {
      const isTotal = idx === 4;
      const isStatus = idx === 8;
      if (isStatus) return [{...r[0],fillColor:navy,margin:[7,4,0,4]}, {...r[1],fillColor:navy,margin:[0,4,7,4]}];
      const label = typeof r[0] === 'string' ? {text:r[0],margin:[7,3,0,3]} : {...r[0],margin:[7,4,0,4]};
      const value = typeof r[1] === 'string' ? {text:r[1],alignment:'right',bold:true,color:r[2] || '#0f172a',margin:[0,3,7,3]} : {...r[1],margin:[0,4,7,4]};
      if (isTotal) { label.fillColor = '#dbeafe'; value.fillColor = '#dbeafe'; }
      return [label, value];
    });

    const content:any[] = [
      {
        columns:[
          {
            width:'*',
            stack: logoPlacement === 'center' && billingLogo ? [
              {image:billingLogo,fit:[logoWidth,logoHeight],alignment:'center',margin:[0,0,0,5]},
              {text:billingName,bold:true,fontSize:centreNameSize,color:navy,alignment:'center'},
              ...(billingSubtitle ? [{text:billingSubtitle,bold:true,fontSize:subtitleSize,color:blue,characterSpacing:0.8,alignment:'center',margin:[0,1,0,1]}] : []),
              ...(showAddress ? [{text:this.safeText(billingAddress,'Lab address'),fontSize:bodySize,color:'#334155',alignment:'center'}] : [])
            ] : [{
              columns:[
                ...(logoPlacement === 'left' && billingLogo ? [{width:logoWidth + 8,image:billingLogo,fit:[logoWidth,logoHeight],alignment:'left'}] : []),
                {width:'*',stack:[
                  {text:billingName,bold:true,fontSize:centreNameSize,color:navy},
                  ...(billingSubtitle ? [{text:billingSubtitle,bold:true,fontSize:subtitleSize,color:blue,characterSpacing:0.8,margin:[0,1,0,1]}] : []),
                  ...(showAddress ? [{text:this.safeText(billingAddress,'Lab address'),fontSize:bodySize,color:'#334155'}] : []),
                  {canvas:[{type:'line',x1:0,y1:6,x2:48,y2:6,lineWidth:1.2,lineColor:blue}]}
                ]},
                ...(logoPlacement === 'right' && billingLogo ? [{width:logoWidth + 8,image:billingLogo,fit:[logoWidth,logoHeight],alignment:'right'}] : [])
              ],
              columnGap:8
            }]
          },
          {width:1, canvas:[{type:'line',x1:0,y1:0,x2:0,y2:65,lineWidth:0.8,lineColor:'#cbd5e1'}]},
          {width:220, stack:[
            ...(showPhone ? [{text:billingPhone ? `☎  ${billingPhone}` : '☎  Phone number',fontSize:bodySize,margin:[0,0,0,4]}] : []),
            ...(showEmail ? [{text:billingEmail ? `✉  ${billingEmail}` : '✉  Email address',fontSize:bodySize,margin:[0,0,0,4]}] : []),
            ...(showAddress ? [{text:`⌖  ${this.safeText(billingAddress,'Lab address')}`,fontSize:bodySize,color:'#334155'}] : [])
          ]}
        ],
        margin:[0,0,0,14]
      },
      {
        columns:[
          {
            width:250,
            table:{widths:['*'],body:[[{
              stack:[
                {text:'PATIENT DETAILS',bold:true,color:blue,fontSize:11,margin:[0,0,0,8]},
                ...labelValueRows([
                  ['Name', patientName],
                  ['Patient ID', b.patient_no],
                  ['Registered', this.fmtDate(patientRegistered)],
                  ['Mobile', b.mobile],
                  ['Age / Gender', ageGender],
                  ...(showConsultant ? [['Consultant', consultantName]] : [])
                ])
              ], margin:[10,8,10,8]
            }]]},
            layout:{hLineColor:()=>border,vLineColor:()=>border,fillColor:()=>pale,paddingLeft:()=>0,paddingRight:()=>0,paddingTop:()=>0,paddingBottom:()=>0}
          },
          {width:'*', text:''},
          {
            width:270,
            stack:[
              {table:{widths:['*'],body:[[{text:isCancelled ? `CANCELLED ${invoiceTitle}` : invoiceTitle,alignment:'center',bold:true,fontSize:15,color:'#fff',fillColor:isCancelled ? red : navy,margin:[0,5,0,5]}]]},layout:'noBorders',margin:[0,0,0,12]},
              {table:{widths:[88,10,'*'],body:billInfoRows([
                ['Bill No / Date', `${b.bill_no}  •  ${this.fmtDate(b.bill_date)}`, true],
                ...(showPatientAddress && patientAddress ? [['Patient Address', patientAddress]] : [])
              ])},layout:{hLineColor:()=>border,vLineColor:()=>border,fillColor:()=> '#ffffff'}}
            ]
          }
        ],
        margin:[0,0,0,10]
      }
    ];

    if (isCancelled) {
      content.push({
        table:{widths:['*'],body:[[{text:`Bill Status: CANCELLED${b.cancelled_at ? ' | Cancelled on: ' + this.fmtDate(b.cancelled_at) : ''}\nReason: ${b.cancel_reason || '-'}\nRefund: ${(+b.refund_amount || 0) > 0 ? this.inr(b.refund_amount) + ' via ' + (b.refund_mode || '-') : '-'}`,color:'#7f1d1d',bold:true,margin:[10,8,10,8]}]]},
        layout:{hLineColor:()=> '#fecaca',vLineColor:()=> '#fecaca',fillColor:()=> '#fff1f2'},
        margin:[0,0,0,12]
      });
    }

    content.push(
      {table:{headerRows:1,widths:itemWidths,body:itemBody},layout:{
        fillColor:(row:number)=> row===0 ? navy : row % 2 === 0 ? alternateRowColor : '#ffffff',
        hLineColor:()=> '#dbe4ef', vLineColor:()=> '#dbe4ef',
        paddingTop:(row:number)=> row===0 ? 4 : 3, paddingBottom:(row:number)=> row===0 ? 4 : 3, paddingLeft:()=>4, paddingRight:()=>4
      },margin:[0,0,0,9]},
      {
        columns:[
          {width:250, stack:[
            {table:{widths:['*'],body:[[{stack:[{text:thankYouText,bold:true,color:navy,margin:[0,0,0,5]}, {text:'Your health is our priority. We appreciate your trust in our services.',fontSize:9,color:'#334155'}],margin:[9,6,9,6]}]]},layout:{hLineColor:()=>border,vLineColor:()=>border,fillColor:()=> '#eff8ff'},margin:[0,0,0,12]},
            receipts.length ? {table:{widths:[92,10,'*'],body:billInfoRows([
              ['Paid By', paymentType],
              ['Amount Received', this.inr(paid)],
              ['Receipt Count', String(receipts.length)],
              ['Receipt Nos', receiptNos || '-'],
              ['Last Receipt Date', this.fmtDate(receipts[receipts.length-1]?.received_at)]
            ])},layout:{hLineColor:()=>border,vLineColor:()=>border,fillColor:()=> '#ffffff'}} : {table:{widths:['*'],body:[[{text:'Payment status: Pending. No receipt has been generated for this bill.',italics:true,color:'#64748b',margin:[9,6,9,6]}]]},layout:{hLineColor:()=>border,vLineColor:()=>border,fillColor:()=> '#ffffff'}}
          ]},
          {width:'*', text:''},
          {width:270, table:{widths:['*','auto'],body:totalsRows},layout:{hLineColor:()=> '#dbe4ef',vLineColor:()=> '#dbe4ef',fillColor:()=> '#ffffff'}}
        ],
        margin:[0,0,0,10]
      },
      {canvas:[{type:'line',x1:0,y1:0,x2:525,y2:0,lineWidth:0.8,lineColor:'#cbd5e1'}],margin:[0,4,0,12]},
      {columns:[
        {text:billingFooter,fontSize:footerSize,color:'#334155'},
        ...(showAuthorisedSignature ? [{stack:[{canvas:[{type:'line',x1:0,y1:0,x2:90,y2:0,lineWidth:0.8,lineColor:'#94a3b8'}],alignment:'right',margin:[0,18,0,4]},{text:authorisedLabel,alignment:'right',fontSize:footerSize,color:bodyTextColor}],width:160}] : [])
      ]},
      ...(showThankYou ? [{text:thankYouText,alignment:'center',color:'#fff',bold:true,fontSize:Math.max(10,totalsSize+3),fillColor:navy,margin:[0,22,0,0]}] : [])
    );

    if (includeReceipts && receipts.length) {
      content.push({text:'',pageBreak:'before'});
      content.push(
        {columns:[
          {stack:[{text:billingName,bold:true,fontSize:Math.max(18,centreNameSize-2),color:navy},...(billingSubtitle?[{text:billingSubtitle,bold:true,fontSize:subtitleSize,color:blue}]:[]),...(showAddress?[{text:this.safeText(billingAddress,'Lab address'),fontSize:bodySize,color:'#334155'}]:[])]},
          {text:'PAYMENT RECEIPT(S)',alignment:'right',bold:true,fontSize:18,color:navy}
        ],margin:[0,0,0,18]},
        {columns:[
          {text:`Bill No: ${b.bill_no}`,bold:true},
          {text:`Patient: ${patientName} (${b.patient_no})`,alignment:'right'}
        ],margin:[0,0,0,12]},
        {table:{headerRows:1,widths:['auto','*','auto','auto','auto'],body:[
          [{text:'#',bold:true,color:'#fff',alignment:'center'},{text:'Receipt No',bold:true,color:'#fff'},{text:'Date',bold:true,color:'#fff'},{text:'Mode',bold:true,color:'#fff'},{text:'Amount (₹)',bold:true,color:'#fff',alignment:'right'}],
          ...receipts.map((r:any,idx:number)=>[{text:String(idx+1),alignment:'center'},r.receipt_no,this.fmtDate(r.received_at),r.payment_mode,{text:this.money(r.amount),alignment:'right',bold:true}]),
          [{text:'TOTAL RECEIVED',colSpan:4,bold:true,alignment:'right'},'','','',{text:this.money(paid),alignment:'right',bold:true}]
        ]},layout:{fillColor:(row:number)=>row===0?navy:row%2===0?'#f8fbff':'#ffffff',hLineColor:()=> '#dbe4ef',vLineColor:()=> '#dbe4ef'},margin:[0,0,0,10]},
        {table:{widths:['*','auto'],body:[
          ['Bill Total', {text:this.inr(total),alignment:'right',bold:true}],
          ['Total Received', {text:this.inr(paid),alignment:'right',bold:true}],
          ['Balance Due', {text:this.inr(due),alignment:'right',bold:true,color:due>0?red:green}],
          ['Excess Receipt', {text:this.inr(excess),alignment:'right',bold:true,color:excess>0?'#7c3aed':green}],
          [{text:'PAYMENT STATUS',bold:true,color:'#fff',fillColor:navy}, {text:paidStatus,bold:true,color:isCancelled?'#fecaca':'#86efac',alignment:'right',fillColor:navy}]
        ]},layout:{hLineColor:()=> '#dbe4ef',vLineColor:()=> '#dbe4ef'},margin:[260,0,0,30]},
        {text:'This receipt page is generated as part of the bill PDF.',fontSize:8,color:'#64748b',alignment:'center'}
      );
    }

    const doc:any={
      pageMargins:[28,28,28,28],
      background: isCancelled ? (_currentPage:number, pageSize:any) => ({ text:'CANCELLED', color:'#ef4444', opacity:0.10, bold:true, fontSize:90, alignment:'center', absolutePosition:{ x:0, y:pageSize.height/2-70 } }) : undefined,
      defaultStyle:{font:billingFont,fontSize:bodySize,color:bodyTextColor},
      content
    };
    const suffix = includeReceipts && receipts.length ? 'with-receipts' : 'bill-only';
    const file=path.join(this.db.reportsDir,`bill-${suffix}-${b.bill_no}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    return file;
  }

  async createReceiptPdf(billId:number, receiptId?:number) {
    const b=this.db.getBill(billId); if(!b) throw new Error('Bill not found');
    const receipt = receiptId ? (b.receipts || []).find((r:any)=>Number(r.id)===Number(receiptId)) : (b.receipts || [])[0];
    if(!receipt) throw new Error('Receipt not found');
    const org=this.org();
    const setting = (key:string, fallback:string) => String(this.db.getSetting(`billing.pdf.${key}`, fallback) ?? fallback);
    const settingBool = (key:string, fallback=true) => setting(key, String(fallback)).toLowerCase() === 'true';
    const settingNum = (key:string, fallback:number, min=6, max=40) => { const n=Number(setting(key,String(fallback))); return Number.isFinite(n) ? Math.max(min,Math.min(max,n)) : fallback; };
    const settingColor = (key:string, fallback:string) => { const c=setting(key,fallback); return /^#[0-9a-fA-F]{6}$/.test(c) ? c : fallback; };

    const billingName = setting('centreName','').trim() || org.name;
    const billingSubtitle = setting('subtitle','DIAGNOSTIC CENTRE').trim();
    const billingAddress = setting('address','').trim() || org.address;
    const billingPhone = setting('phone','').trim() || org.phone;
    const billingEmail = setting('email','').trim() || org.email;
    const billingFooter = setting('footerText','').trim() || org.footer || 'This receipt is electronically generated.';
    const thankYouText = setting('thankYouText','Thank you for choosing us').trim() || 'Thank you';
    const authorisedLabel = setting('authorisedLabel','Authorised Signatory').trim() || 'Authorised Signatory';
    const billingFont = this.reportFont(setting('fontFamily','Roboto'));
    const centreNameSize = settingNum('centreNameSize',24,10,36);
    const subtitleSize = settingNum('subtitleSize',9,6,20);
    const bodySize = settingNum('bodySize',8.8,6,18);
    const patientSize = settingNum('patientSize',9,6,18);
    const tableHeaderSize = settingNum('tableHeaderSize',8.5,6,18);
    const tableBodySize = settingNum('tableBodySize',8.5,6,18);
    const totalsSize = settingNum('totalsSize',9,6,20);
    const footerSize = settingNum('footerSize',8,6,16);
    const showPhone = settingBool('showPhone');
    const showEmail = settingBool('showEmail');
    const showAddress = settingBool('showAddress');
    const showConsultant = settingBool('showConsultant');
    const showAuthorisedSignature = settingBool('showAuthorisedSignature');
    const showThankYou = settingBool('showThankYou');
    const logoEnabled = settingBool('logoEnabled', false);
    const logoPath = setting('logoPath','').trim();
    const logoPlacement = ['left','center','right'].includes(setting('logoPlacement','left')) ? setting('logoPlacement','left') : 'left';
    const logoWidth = settingNum('logoWidth',48,10,160);
    const logoHeight = settingNum('logoHeight',48,10,120);
    const billingLogo = logoEnabled && logoPath && fs.existsSync(logoPath) ? logoPath : '';
    const primary = settingColor('primaryColor','#0b3a70');
    const accent = settingColor('accentColor','#0f68b7');
    const textColor = settingColor('textColor','#0f172a');
    const border = settingColor('borderColor','#d6e3f2');

    const sorted=(b.receipts || []).slice().sort((a:any,b:any)=>Number(a.id)-Number(b.id));
    let paidBefore=0;
    for (const r of sorted) { paidBefore += +r.amount || 0; if (Number(r.id)===Number(receipt.id)) break; }
    const dueAfter = Math.max(0,(+b.total||0)-paidBefore);
    const excessAfter = Math.max(0, paidBefore-(+b.total||0));
    const patientName = this.billPatientText([b.title,b.name].filter(Boolean).join(' ') || b.name || '-');
    const consultantName = this.billPatientText(b.consultant_name || 'Walk-in');

    const identityText:any[] = [
      {text:billingName,bold:true,fontSize:centreNameSize,color:primary},
      ...(billingSubtitle ? [{text:billingSubtitle,bold:true,fontSize:subtitleSize,color:accent,characterSpacing:0.8,margin:[0,1,0,1]}] : []),
      ...(showAddress ? [{text:this.safeText(billingAddress,'Lab address'),fontSize:bodySize,color:'#334155'}] : [])
    ];
    const identity:any = logoPlacement === 'center' && billingLogo
      ? {stack:[{image:billingLogo,fit:[logoWidth,logoHeight],alignment:'center',margin:[0,0,0,5]},...identityText.map(x=>({...x,alignment:'center'}))]}
      : {columns:[
          ...(logoPlacement === 'left' && billingLogo ? [{width:logoWidth+8,image:billingLogo,fit:[logoWidth,logoHeight],alignment:'left'}] : []),
          {width:'*',stack:identityText},
          ...(logoPlacement === 'right' && billingLogo ? [{width:logoWidth+8,image:billingLogo,fit:[logoWidth,logoHeight],alignment:'right'}] : [])
        ],columnGap:8};

    const content:any[] = [
      {
        columns:[
          {width:'*',stack:[identity]},
          {width:190,stack:[
            ...(showPhone ? [{text:billingPhone ? `☎  ${billingPhone}` : '☎  Phone number',fontSize:bodySize,alignment:'right',margin:[0,0,0,4]}] : []),
            ...(showEmail ? [{text:billingEmail ? `✉  ${billingEmail}` : '✉  Email address',fontSize:bodySize,alignment:'right'}] : [])
          ]}
        ],
        margin:[0,0,0,12]
      },
      {table:{widths:['*'],body:[[{text:'PAYMENT RECEIPT',bold:true,alignment:'center',fontSize:Math.max(13,tableHeaderSize+4),color:'#fff',fillColor:primary,margin:[0,5,0,5]}]]},layout:'noBorders',margin:[0,0,0,12]},
      {
        table:{widths:['*','*'],body:[
          [{text:`Receipt No: ${receipt.receipt_no}`,bold:true,fontSize:patientSize},{text:`Date: ${this.fmtDate(receipt.received_at)}`,alignment:'right',fontSize:patientSize}],
          [{text:`Bill No: ${b.bill_no}`,fontSize:patientSize},{text:`Mode: ${receipt.payment_mode}`,alignment:'right',fontSize:patientSize}],
          [{text:`Patient: ${patientName} (${b.patient_no || '-'})`,colSpan:2,bold:true,fontSize:patientSize},{}],
          ...(showConsultant ? [[{text:`Consultant: ${consultantName}`,colSpan:2,fontSize:patientSize},{ }]] : [])
        ]},
        layout:{hLineColor:()=>border,vLineColor:()=>border,paddingLeft:()=>8,paddingRight:()=>8,paddingTop:()=>5,paddingBottom:()=>5},
        margin:[0,0,0,12]
      },
      {
        table:{widths:['*',120],body:[
          [{text:'Particulars',bold:true,color:'#fff',fillColor:primary,fontSize:tableHeaderSize},{text:'Amount (₹)',bold:true,color:'#fff',fillColor:primary,alignment:'right',fontSize:tableHeaderSize}],
          [{text:'Bill Total',fontSize:tableBodySize},{text:this.money(b.total),alignment:'right',fontSize:tableBodySize}],
          [{text:'Receipt Amount',bold:true,fontSize:tableBodySize},{text:this.money(receipt.amount),alignment:'right',bold:true,color:accent,fontSize:totalsSize}],
          [{text:'Paid Till This Receipt',fontSize:tableBodySize},{text:this.money(paidBefore),alignment:'right',fontSize:tableBodySize}],
          [{text:'Balance Due After Receipt',fontSize:tableBodySize},{text:this.money(dueAfter),alignment:'right',bold:true,fontSize:tableBodySize}],
          [{text:'Excess After Receipt',fontSize:tableBodySize},{text:this.money(excessAfter),alignment:'right',fontSize:tableBodySize}]
        ]},
        layout:{hLineColor:()=>border,vLineColor:()=>border,paddingLeft:()=>8,paddingRight:()=>8,paddingTop:()=>6,paddingBottom:()=>6}
      },
      {
        columns:[
          {width:'*',text:billingFooter,fontSize:footerSize,color:'#64748b',margin:[0,22,0,0]},
          ...(showAuthorisedSignature ? [{width:160,stack:[{text:'',margin:[0,22,0,18]},{canvas:[{type:'line',x1:0,y1:0,x2:130,y2:0,lineWidth:0.7,lineColor:border}]},{text:authorisedLabel,bold:true,alignment:'center',fontSize:footerSize,margin:[0,4,0,0]}]}] : [])
        ]
      },
      ...(showThankYou ? [{text:thankYouText,bold:true,alignment:'center',color:'#fff',fillColor:accent,fontSize:footerSize+1,margin:[0,14,0,0]}] : [])
    ];

    const doc:any={
      pageMargins:[28,28,28,28],
      defaultStyle:{font:billingFont,fontSize:bodySize,color:textColor},
      content
    };
    const file=path.join(this.db.reportsDir,`receipt-${receipt.receipt_no}-${b.bill_no}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    return file;
  }


  /** When patient.fieldsCaps=upper, force uppercase on bill/receipt patient display text. */
  protected patientFieldsCapsEnabled(): boolean {
    const mode = String(this.db.getSetting('patient.fieldsCaps', 'off') || 'off').trim().toLowerCase();
    return mode === 'upper' || mode === 'uppercase' || mode === 'caps' || mode === 'true' || mode === '1' || mode === 'on';
  }
  protected billPatientText(value: any): string {
    const text = String(value ?? '');
    if (!this.patientFieldsCapsEnabled()) return text;
    const trimmed = text.trim();
    return trimmed ? text.toUpperCase() : text;
  }

  protected statementTitle(filters:any) {
    const from = filters?.from || '';
    const to = filters?.to || '';
    const consultant = filters?.consultant_id && filters.consultant_id !== 'ALL' ? ` | Consultant filter: ${filters.consultant_id === 'NONE' ? 'No consultant' : filters.consultant_id}` : '';
    return `Period: ${from || '-'} to ${to || '-'}${consultant}`;
  }

  async createStatementPdf(filters:any={}) {
    const statement = this.db.statement(filters);
    const bills = statement.bills || [];
    const org = this.org();
    const type = filters.type === 'consolidated' ? 'consolidated' : 'detailed';
    const title = type === 'consolidated' ? 'CONSOLIDATED BILLING STATEMENT' : 'DETAILED BILLING STATEMENT';
    const header:any[] = [
      {text:org.name,bold:true,fontSize:18,alignment:'center'},
      {text:org.address,alignment:'center',fontSize:9,margin:[0,0,0,10]},
      {text:title,bold:true,alignment:'center',margin:[0,4,0,8]},
      {text:this.statementTitle(filters),fontSize:9,alignment:'center',margin:[0,0,0,14]}
    ];

    let body:any[];
    if (type === 'consolidated') {
      const grouped = new Map<string, any>();
      for (const b of bills) {
        const date = this.fmtDateOnly(b.bill_date);
        const consultant = b.consultant_name || 'No consultant';
        const key = `${date} | ${consultant}`;
        const row = grouped.get(key) || { date, consultant, bills:0, total:0, paid:0, due:0, cancelled:0 };
        row.bills += 1;
        row.total += +b.total || 0;
        row.paid += +b.paid || 0;
        row.due += +b.due || 0;
        if (b.status === 'CANCELLED') row.cancelled += 1;
        grouped.set(key, row);
      }
      body = [[{text:'Date',bold:true},{text:'Consultant',bold:true},{text:'Bills',bold:true},{text:'Total',bold:true},{text:'Paid',bold:true},{text:'Due',bold:true},{text:'Cancelled',bold:true}],
        ...Array.from(grouped.values()).map((r:any)=>[r.date, r.consultant, String(r.bills), this.money(r.total), this.money(r.paid), this.money(r.due), String(r.cancelled)]),
        [{text:'TOTAL',bold:true,colSpan:3},'', '', {text:this.money(statement.totals.total),bold:true}, {text:this.money(statement.totals.paid),bold:true}, {text:this.money(statement.totals.due),bold:true}, '']
      ];
    } else {
      body = [[{text:'Bill No',bold:true},{text:'Date',bold:true},{text:'Patient',bold:true},{text:'Consultant',bold:true},{text:'Total',bold:true},{text:'Paid',bold:true},{text:'Due/Excess',bold:true},{text:'Status',bold:true}],
        ...bills.map((b:any)=>{
          const excess = Math.max(0,(+b.paid||0)-(+b.total||0));
          const paymentStatus = b.status === 'CANCELLED' ? 'Cancelled' : excess > 0 ? 'Overpaid' : (+b.paid||0)<=0 ? 'Pending' : (+b.paid||0)>=(+b.total||0) ? 'Paid' : 'Partial';
          return [b.bill_no, this.fmtDate(b.bill_date), `${this.billPatientText(b.patient_name || '')}\n${b.mobile || b.patient_no || ''}`, this.billPatientText(b.consultant_name || '-'), this.money(b.total), this.money(b.paid), excess>0 ? `+${this.money(excess)}` : this.money(b.due), paymentStatus];
        }),
        [{text:'TOTAL',bold:true,colSpan:4},'', '', '', {text:this.money(statement.totals.total),bold:true}, {text:this.money(statement.totals.paid),bold:true}, {text:this.money(statement.totals.due),bold:true}, '']
      ];
    }


    const doc:any = {
      pageOrientation: 'landscape',
      pageMargins:[30,30,30,35],
      footer:(current:number,count:number)=>({margin:[30,0,30,12],columns:[{text:org.footer,fontSize:8},{text:`Page ${current} / ${count}`,alignment:'right',fontSize:8}]}),
      content:[...header, {table:{headerRows:1,widths:type==='consolidated'?['auto','*','auto','auto','auto','auto','auto']:['auto','auto','*','*','auto','auto','auto','auto'],body},layout:'lightHorizontalLines'}]
    };
    const file=path.join(this.db.reportsDir,`statement-${type}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    return file;
  }

  async createStatementExcel(filters:any={}) { const s=this.db.statement(filters); const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Statement'); ws.columns=[{header:'Bill No',key:'bill_no',width:14},{header:'Date',key:'bill_date',width:22},{header:'Patient',key:'patient_name',width:28},{header:'Consultant',key:'consultant_name',width:22},{header:'Total',key:'total',width:12},{header:'Paid',key:'paid',width:12},{header:'Due',key:'due',width:12},{header:'Mode',key:'payment_mode',width:14}]; s.bills.forEach((b:any)=>ws.addRow(b)); ws.addRow({patient_name:'TOTAL',total:s.totals.total,paid:s.totals.paid,due:s.totals.due}); const file=path.join(this.db.reportsDir,`statement-${Date.now()}.xlsx`); await wb.xlsx.writeFile(file); return file; }
  async createReportExcel(reportOrBillId:number) { const r=this.db.getReport(reportOrBillId); if(!r) throw new Error('Report not found'); const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Report'); ws.addRow(['Patient',r.patient_name,'Bill',r.bill_no]); ws.addRow(['Test','Result','Unit','Reference','Method']); r.items.forEach((i:any)=>ws.addRow([i.test_name,i.result_value||'',i.unit||'',i.normal_range||'',i.method||''])); const file=path.join(this.db.reportsDir,`report-${r.bill_no}-${Date.now()}.xlsx`); await wb.xlsx.writeFile(file); return file; }

  async createCommissionSettlementPdf(settlementId:number) {
    const s = this.db.getCommissionSettlement(Number(settlementId));
    const org = this.org();
    const items = s.items || [];
    const meta = [
      [{ text: 'Settlement No', bold: true }, s.settlement_no || '-', { text: 'Date', bold: true }, this.fmtDate(s.settlement_date) ],
      [{ text: 'Consultant', bold: true }, s.consultant_name || '-', { text: 'Clinic', bold: true }, s.consultant_clinic || '-' ],
      [{ text: 'Payment mode', bold: true }, s.payment_mode || 'Cash', { text: 'Reference', bold: true }, s.reference_no || '-' ],
      [{ text: 'Phone', bold: true }, s.consultant_phone || '-', { text: 'Items', bold: true }, String(items.length) ]
    ];
    const body = [
      [
        { text: '#', bold: true },
        { text: 'Bill No', bold: true },
        { text: 'Date', bold: true },
        { text: 'Patient', bold: true },
        { text: 'Item', bold: true },
        { text: 'Rule', bold: true },
        { text: 'Net', bold: true, alignment: 'right' },
        { text: 'Commission', bold: true, alignment: 'right' }
      ],
      ...items.map((it: any, idx: number) => [
        String(idx + 1),
        it.bill_no || '-',
        this.fmtDateOnly(it.bill_date),
        it.patient_name || '-',
        `${it.item_name || '-'}${it.item_type ? `\n${it.item_type}` : ''}`,
        `${it.commission_profile_name || '-'}${it.commission_rule_source ? `\n${it.commission_rule_source}` : ''}`,
        { text: this.money(it.net_amount), alignment: 'right' },
        { text: this.money(it.amount), alignment: 'right' }
      ]),
      [
        { text: 'TOTAL', bold: true, colSpan: 7 }, '', '', '', '', '', '',
        { text: this.money(s.amount), bold: true, alignment: 'right' }
      ]
    ];
    const content: any[] = [
      { text: org.name, bold: true, fontSize: 18, alignment: 'center' },
      { text: org.address, alignment: 'center', fontSize: 9, margin: [0, 0, 0, 8] },
      { text: 'COMMISSION SETTLEMENT VOUCHER', bold: true, alignment: 'center', fontSize: 13, margin: [0, 2, 0, 12] },
      { table: { widths: [90, '*', 70, '*'], body: meta }, layout: 'noBorders', margin: [0, 0, 0, 12] },
      { table: { headerRows: 1, widths: [22, 70, 55, '*', '*', 90, 55, 65], body }, layout: 'lightHorizontalLines' }
    ];
    if (String(s.notes || '').trim()) {
      content.push({ text: `Notes: ${s.notes}`, fontSize: 9, margin: [0, 12, 0, 0], color: '#444' });
    }
    content.push({
      columns: [
        { text: '\n\n________________________\nPrepared by', alignment: 'center', fontSize: 9, margin: [0, 28, 0, 0] },
        { text: '\n\n________________________\nConsultant acknowledgement', alignment: 'center', fontSize: 9, margin: [0, 28, 0, 0] }
      ]
    });
    const doc: any = {
      pageOrientation: 'portrait',
      pageMargins: [30, 30, 30, 40],
      footer: (current: number, count: number) => ({
        margin: [30, 0, 30, 14],
        columns: [
          { text: org.footer || 'Commission settlement voucher', fontSize: 8 },
          { text: `Page ${current} / ${count}`, alignment: 'right', fontSize: 8 }
        ]
      }),
      content
    };
    const safeNo = String(s.settlement_no || settlementId).replace(/[^\w.-]+/g, '_');
    const file = path.join(this.db.reportsDir, `commission-settlement-${safeNo}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    return file;
  }

  async createCommissionSettlementExcel(settlementId: number) {
    const s = this.db.getCommissionSettlement(Number(settlementId));
    const wb = new ExcelJS.Workbook();
    const summary = wb.addWorksheet('Voucher');
    summary.columns = [
      { header: 'Field', key: 'field', width: 22 },
      { header: 'Value', key: 'value', width: 40 }
    ];
    [
      ['Settlement No', s.settlement_no],
      ['Settlement Date', s.settlement_date],
      ['Consultant', s.consultant_name],
      ['Clinic', s.consultant_clinic || ''],
      ['Phone', s.consultant_phone || ''],
      ['Payment Mode', s.payment_mode || 'Cash'],
      ['Reference No', s.reference_no || ''],
      ['Total Amount', +s.amount || 0],
      ['Item Count', (s.items || []).length],
      ['Notes', s.notes || '']
    ].forEach(([field, value]) => summary.addRow({ field, value }));

    const lines = wb.addWorksheet('Line Items');
    lines.columns = [
      { header: 'Bill No', key: 'bill_no', width: 14 },
      { header: 'Bill Date', key: 'bill_date', width: 18 },
      { header: 'Patient', key: 'patient_name', width: 26 },
      { header: 'Item', key: 'item_name', width: 28 },
      { header: 'Type', key: 'item_type', width: 10 },
      { header: 'Qty', key: 'quantity', width: 8 },
      { header: 'Net', key: 'net_amount', width: 12 },
      { header: 'Running Cost', key: 'running_cost', width: 12 },
      { header: 'Profit', key: 'profit_amount', width: 12 },
      { header: 'Rule', key: 'commission_rule_source', width: 18 },
      { header: 'Profile', key: 'commission_profile_name', width: 18 },
      { header: 'Commission', key: 'amount', width: 12 }
    ];
    (s.items || []).forEach((it: any) => lines.addRow(it));
    lines.addRow({ patient_name: 'TOTAL', amount: +s.amount || 0 });

    const safeNo = String(s.settlement_no || settlementId).replace(/[^\w.-]+/g, '_');
    const file = path.join(this.db.reportsDir, `commission-settlement-${safeNo}-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(file);
    return file;
  }

  private commissionReportTable(report: any): { widths: any[]; body: any[][] } {
    const type = String(report.report_type || '').toUpperCase();
    const rows = report.rows || [];
    if (type === 'SETTLEMENT_HISTORY') {
      return {
        widths: [90, 70, '*', 40, 70, 70, 65],
        body: [
          [{ text: 'Settlement No', bold: true }, { text: 'Date', bold: true }, { text: 'Consultant', bold: true }, { text: 'Items', bold: true }, { text: 'Mode', bold: true }, { text: 'Reference', bold: true }, { text: 'Amount', bold: true, alignment: 'right' }],
          ...rows.map((r: any) => [r.settlement_no, this.fmtDate(r.settlement_date), r.consultant_name, String(r.item_count || 0), r.payment_mode || '-', r.reference_no || '-', { text: this.money(r.amount), alignment: 'right' }]),
          [{ text: 'TOTAL', bold: true, colSpan: 6 }, '', '', '', '', '', { text: this.money(report.totals?.amount || 0), bold: true, alignment: 'right' }]
        ]
      };
    }
    if (type === 'CONSULTANT_SUMMARY') {
      return {
        widths: ['*', 70, 40, 35, 50, 50, 55, 50, 45, 45, 40, 45],
        body: [
          [{ text: 'Consultant', bold: true }, { text: 'Clinic', bold: true }, { text: 'Entries', bold: true }, { text: 'Bills', bold: true }, { text: 'Net', bold: true, alignment: 'right' }, { text: 'Cost', bold: true, alignment: 'right' }, { text: 'Commission', bold: true, alignment: 'right' }, { text: 'Profit', bold: true, alignment: 'right' }, { text: 'Pending', bold: true, alignment: 'right' }, { text: 'Approved', bold: true, alignment: 'right' }, { text: 'Held', bold: true, alignment: 'right' }, { text: 'Paid', bold: true, alignment: 'right' }],
          ...rows.map((r: any) => [r.consultant_name, r.clinic || '-', String(r.entries), String(r.bill_count), { text: this.money(r.net_amount), alignment: 'right' }, { text: this.money(r.running_cost), alignment: 'right' }, { text: this.money(r.commission_amount), alignment: 'right' }, { text: this.money(r.profit_amount), alignment: 'right' }, { text: this.money(r.generated), alignment: 'right' }, { text: this.money(r.approved), alignment: 'right' }, { text: this.money(r.held), alignment: 'right' }, { text: this.money(r.paid), alignment: 'right' }]),
          [{ text: 'TOTAL', bold: true, colSpan: 4 }, '', '', '', { text: this.money(report.totals?.net_amount || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.running_cost || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.commission || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.profit_amount || 0), bold: true, alignment: 'right' }, '', '', '', '']
        ]
      };
    }
    if (type === 'BILL_DETAILS') {
      return {
        widths: [70, 55, '*', '*', 35, 55, 50, 55, 55],
        body: [
          [{ text: 'Bill No', bold: true }, { text: 'Date', bold: true }, { text: 'Patient', bold: true }, { text: 'Consultant', bold: true }, { text: 'Items', bold: true }, { text: 'Net', bold: true, alignment: 'right' }, { text: 'Cost', bold: true, alignment: 'right' }, { text: 'Commission', bold: true, alignment: 'right' }, { text: 'Profit', bold: true, alignment: 'right' }],
          ...rows.map((r: any) => [r.bill_no, this.fmtDateOnly(r.bill_date), r.patient_name || '-', r.consultant_name || '-', String(r.items || 0), { text: this.money(r.net_amount), alignment: 'right' }, { text: this.money(r.running_cost), alignment: 'right' }, { text: this.money(r.commission_amount), alignment: 'right' }, { text: this.money(r.profit_amount), alignment: 'right' }]),
          [{ text: 'TOTAL', bold: true, colSpan: 5 }, '', '', '', '', { text: this.money(report.totals?.net_amount || 0), bold: true, alignment: 'right' }, '', { text: this.money(report.totals?.commission || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.profit_amount || 0), bold: true, alignment: 'right' }]
        ]
      };
    }
    if (type === 'PROFIT') {
      return {
        widths: [65, 50, '*', '*', '*', 50, 50, 55, 50, 55],
        body: [
          [{ text: 'Bill No', bold: true }, { text: 'Date', bold: true }, { text: 'Patient', bold: true }, { text: 'Consultant', bold: true }, { text: 'Item', bold: true }, { text: 'Net', bold: true, alignment: 'right' }, { text: 'Cost', bold: true, alignment: 'right' }, { text: 'Commission', bold: true, alignment: 'right' }, { text: 'Profit', bold: true, alignment: 'right' }, { text: 'Status', bold: true }],
          ...rows.map((r: any) => [r.bill_no, this.fmtDateOnly(r.bill_date), r.patient_name || '-', r.consultant_name || '-', r.item_name || '-', { text: this.money(r.net_amount), alignment: 'right' }, { text: this.money(r.running_cost), alignment: 'right' }, { text: this.money(r.commission_amount), alignment: 'right' }, { text: this.money(r.profit_amount), alignment: 'right' }, r.commission_status || '-']),
          [{ text: 'TOTAL', bold: true, colSpan: 5 }, '', '', '', '', { text: this.money(report.totals?.net_amount || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.running_cost || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.commission || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.profit_amount || 0), bold: true, alignment: 'right' }, '']
        ]
      };
    }
    return {
      widths: [65, 50, '*', '*', '*', 50, 55, 70, 55],
      body: [
        [{ text: 'Bill No', bold: true }, { text: 'Date', bold: true }, { text: 'Patient', bold: true }, { text: 'Consultant', bold: true }, { text: 'Item', bold: true }, { text: 'Net', bold: true, alignment: 'right' }, { text: 'Commission', bold: true, alignment: 'right' }, { text: 'Rule', bold: true }, { text: 'Status', bold: true }],
        ...rows.map((r: any) => [r.bill_no, this.fmtDateOnly(r.bill_date), r.patient_name || '-', r.consultant_name || '-', r.item_name || '-', { text: this.money(r.net_amount), alignment: 'right' }, { text: this.money(r.commission_amount), alignment: 'right' }, r.commission_rule_source || r.commission_profile_name || '-', r.commission_status || '-']),
        [{ text: 'TOTAL', bold: true, colSpan: 5 }, '', '', '', '', { text: this.money(report.totals?.net_amount || 0), bold: true, alignment: 'right' }, { text: this.money(report.totals?.commission || 0), bold: true, alignment: 'right' }, '', '']
      ]
    };
  }

  async createCommissionReportPdf(filters: any = {}) {
    const report = this.db.getCommissionReport(filters || {});
    const org = this.org();
    const table = this.commissionReportTable(report);
    const doc: any = {
      pageOrientation: 'landscape',
      pageMargins: [24, 28, 24, 36],
      footer: (current: number, count: number) => ({
        margin: [24, 0, 24, 12],
        columns: [
          { text: org.footer || 'Commission report', fontSize: 8 },
          { text: `Page ${current} / ${count}`, alignment: 'right', fontSize: 8 }
        ]
      }),
      content: [
        { text: org.name, bold: true, fontSize: 16, alignment: 'center' },
        { text: org.address, alignment: 'center', fontSize: 8, margin: [0, 0, 0, 6] },
        { text: String(report.title || 'Commission Report').toUpperCase(), bold: true, alignment: 'center', fontSize: 12, margin: [0, 2, 0, 4] },
        { text: `Period: ${report.period || '-'}`, alignment: 'center', fontSize: 9, margin: [0, 0, 0, 10] },
        { table: { headerRows: 1, widths: table.widths, body: table.body }, layout: 'lightHorizontalLines' }
      ]
    };
    const safe = String(report.report_type || 'report').toLowerCase().replace(/[^\w.-]+/g, '_');
    const file = path.join(this.db.reportsDir, `commission-report-${safe}-${Date.now()}.pdf`);
    await this.writePdfFile(doc, file);
    return file;
  }

  async createCommissionReportExcel(filters: any = {}) {
    const report = this.db.getCommissionReport(filters || {});
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Report');
    const type = String(report.report_type || '').toUpperCase();
    const rows = report.rows || [];

    if (type === 'SETTLEMENT_HISTORY') {
      ws.columns = [
        { header: 'Settlement No', key: 'settlement_no', width: 18 },
        { header: 'Date', key: 'settlement_date', width: 20 },
        { header: 'Consultant', key: 'consultant_name', width: 24 },
        { header: 'Items', key: 'item_count', width: 10 },
        { header: 'Mode', key: 'payment_mode', width: 14 },
        { header: 'Reference', key: 'reference_no', width: 16 },
        { header: 'Amount', key: 'amount', width: 12 }
      ];
      rows.forEach((r: any) => ws.addRow(r));
      ws.addRow({ consultant_name: 'TOTAL', amount: report.totals?.amount || 0 });
    } else if (type === 'CONSULTANT_SUMMARY') {
      ws.columns = [
        { header: 'Consultant', key: 'consultant_name', width: 24 },
        { header: 'Clinic', key: 'clinic', width: 20 },
        { header: 'Entries', key: 'entries', width: 10 },
        { header: 'Bills', key: 'bill_count', width: 10 },
        { header: 'Net', key: 'net_amount', width: 12 },
        { header: 'Running Cost', key: 'running_cost', width: 12 },
        { header: 'Commission', key: 'commission_amount', width: 12 },
        { header: 'Profit', key: 'profit_amount', width: 12 },
        { header: 'Pending', key: 'generated', width: 12 },
        { header: 'Approved', key: 'approved', width: 12 },
        { header: 'Held', key: 'held', width: 12 },
        { header: 'Paid', key: 'paid', width: 12 }
      ];
      rows.forEach((r: any) => ws.addRow(r));
      ws.addRow({
        consultant_name: 'TOTAL',
        net_amount: report.totals?.net_amount || 0,
        running_cost: report.totals?.running_cost || 0,
        commission_amount: report.totals?.commission || 0,
        profit_amount: report.totals?.profit_amount || 0
      });
    } else if (type === 'BILL_DETAILS') {
      ws.columns = [
        { header: 'Bill No', key: 'bill_no', width: 14 },
        { header: 'Date', key: 'bill_date', width: 18 },
        { header: 'Patient', key: 'patient_name', width: 24 },
        { header: 'Consultant', key: 'consultant_name', width: 22 },
        { header: 'Items', key: 'items', width: 10 },
        { header: 'Net', key: 'net_amount', width: 12 },
        { header: 'Running Cost', key: 'running_cost', width: 12 },
        { header: 'Commission', key: 'commission_amount', width: 12 },
        { header: 'Profit', key: 'profit_amount', width: 12 }
      ];
      rows.forEach((r: any) => ws.addRow(r));
      ws.addRow({
        patient_name: 'TOTAL',
        net_amount: report.totals?.net_amount || 0,
        commission_amount: report.totals?.commission || 0,
        profit_amount: report.totals?.profit_amount || 0
      });
      if ((report.detail_rows || []).length) {
        const detail = wb.addWorksheet('Line Items');
        detail.columns = [
          { header: 'Bill No', key: 'bill_no', width: 14 },
          { header: 'Date', key: 'bill_date', width: 18 },
          { header: 'Patient', key: 'patient_name', width: 22 },
          { header: 'Consultant', key: 'consultant_name', width: 20 },
          { header: 'Item', key: 'item_name', width: 26 },
          { header: 'Type', key: 'item_type', width: 10 },
          { header: 'Net', key: 'net_amount', width: 12 },
          { header: 'Running Cost', key: 'running_cost', width: 12 },
          { header: 'Commission', key: 'commission_amount', width: 12 },
          { header: 'Profit', key: 'profit_amount', width: 12 },
          { header: 'Rule', key: 'commission_rule_source', width: 18 },
          { header: 'Status', key: 'commission_status', width: 14 }
        ];
        report.detail_rows.forEach((r: any) => detail.addRow(r));
      }
    } else {
      ws.columns = [
        { header: 'Bill No', key: 'bill_no', width: 14 },
        { header: 'Date', key: 'bill_date', width: 18 },
        { header: 'Patient', key: 'patient_name', width: 22 },
        { header: 'Consultant', key: 'consultant_name', width: 20 },
        { header: 'Item', key: 'item_name', width: 26 },
        { header: 'Type', key: 'item_type', width: 10 },
        { header: 'Net', key: 'net_amount', width: 12 },
        { header: 'Running Cost', key: 'running_cost', width: 12 },
        { header: 'Commission', key: 'commission_amount', width: 12 },
        { header: 'Profit', key: 'profit_amount', width: 12 },
        { header: 'Rule', key: 'commission_rule_source', width: 16 },
        { header: 'Profile', key: 'commission_profile_name', width: 16 },
        { header: 'Status', key: 'commission_status', width: 14 },
        { header: 'Hold Reason', key: 'hold_reason', width: 22 }
      ];
      rows.forEach((r: any) => ws.addRow(r));
      ws.addRow({
        patient_name: 'TOTAL',
        net_amount: report.totals?.net_amount || 0,
        running_cost: report.totals?.running_cost || 0,
        commission_amount: report.totals?.commission || 0,
        profit_amount: report.totals?.profit_amount || 0
      });
    }

    const meta = wb.addWorksheet('Meta');
    meta.addRow(['Title', report.title || '']);
    meta.addRow(['Period', report.period || '']);
    meta.addRow(['Type', report.report_type || '']);
    meta.addRow(['Records', report.totals?.records || rows.length]);

    const safe = String(report.report_type || 'report').toLowerCase().replace(/[^\w.-]+/g, '_');
    const file = path.join(this.db.reportsDir, `commission-report-${safe}-${Date.now()}.xlsx`);
    await wb.xlsx.writeFile(file);
    return file;
  }

  async openFile(file:string) { await shell.openPath(file); return file; }
  async printReport(reportOrBillId:number, win:BrowserWindow, options:any = {}) { const file=await this.createReportPdf(reportOrBillId, options?.withBackground !== false, {...options, pdfOutputMode:'print'}); await shell.openPath(file); return file; }
}
