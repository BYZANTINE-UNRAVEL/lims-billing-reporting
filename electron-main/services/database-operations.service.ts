import { DatabaseWorkflowService } from './database-workflow.service';

export class DatabaseOperationsService extends DatabaseWorkflowService {  operationsDashboard() {
    this.ensureOperationsSchema();
    const inventoryValue = (this.db.prepare('SELECT COALESCE(SUM(current_stock * average_cost),0) v FROM inventory_items WHERE active=1').get() as any).v || 0;
    const lowStock = this.db.prepare('SELECT * FROM inventory_items WHERE active=1 AND reorder_level > 0 AND current_stock <= reorder_level ORDER BY item_name').all();
    const expenses = (this.db.prepare("SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE strftime('%Y-%m', expense_date)=strftime('%Y-%m', date('now','+330 minutes'))").get() as any).v || 0;
    const purchasesDue = (this.db.prepare('SELECT COALESCE(SUM(due),0) v FROM purchases').get() as any).v || 0;
    const outsourcePending = (this.db.prepare("SELECT COUNT(*) c FROM outsource_cases WHERE status NOT IN ('RECEIVED','CANCELLED')").get() as any).c || 0;
    return { inventoryValue:+Number(inventoryValue).toFixed(2), lowStock, expenses:+Number(expenses).toFixed(2), purchasesDue:+Number(purchasesDue).toFixed(2), outsourcePending };
  }

  listVendors() { this.ensureOperationsSchema(); return this.db.prepare('SELECT * FROM vendors ORDER BY active DESC,name').all(); }
  saveVendor(x:any) { this.ensureOperationsSchema(); const id=+x.id||0; if(id) this.db.prepare('UPDATE vendors SET name=?,gstin=?,phone=?,address=?,active=? WHERE id=?').run(x.name||'',x.gstin||'',x.phone||'',x.address||'',x.active===false?0:1,id); else this.db.prepare('INSERT INTO vendors(name,gstin,phone,address,active) VALUES(?,?,?,?,?)').run(x.name||'',x.gstin||'',x.phone||'',x.address||'',x.active===false?0:1); return this.listVendors(); }

  protected rememberOperationUnit(unit:any): void {
    this.ensureOperationsSchema();
    const name=String(unit||'').trim();
    if(!name) return;
    this.db.prepare('INSERT OR IGNORE INTO operation_units(unit_name) VALUES(?)').run(name);
  }
  listOperationUnits() {
    this.ensureOperationsSchema();
    return this.db.prepare('SELECT * FROM operation_units ORDER BY unit_name COLLATE NOCASE').all();
  }
  protected rememberOperationBrand(brand:any): void {
    this.ensureOperationsSchema();
    const name=String(brand||'').trim();
    if(!name) return;
    this.db.prepare('INSERT OR IGNORE INTO operation_brands(brand_name) VALUES(?)').run(name);
  }
  listOperationBrands() {
    this.ensureOperationsSchema();
    return this.db.prepare('SELECT * FROM operation_brands ORDER BY brand_name COLLATE NOCASE').all();
  }

  protected rememberOperationHsn(hsn:any): void {
    this.ensureOperationsSchema();
    const code=String(hsn||'').trim();
    if(!code) return;
    this.db.prepare('INSERT OR IGNORE INTO operation_hsns(hsn_code) VALUES(?)').run(code);
  }
  listOperationHsns() {
    this.ensureOperationsSchema();
    return this.db.prepare('SELECT * FROM operation_hsns ORDER BY hsn_code COLLATE NOCASE').all();
  }

  protected normalizeDateOnly(value:any, fallback='1900-01-01'): string {
    const v=String(value||'').slice(0,10);
    return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback;
  }
  protected dateMinusOne(date:string): string {
    const d=new Date(`${date}T00:00:00`);
    d.setDate(d.getDate()-1);
    return d.toISOString().slice(0,10);
  }
  protected datePlusOne(date:string): string {
    const d=new Date(`${date}T00:00:00`);
    d.setDate(d.getDate()+1);
    return d.toISOString().slice(0,10);
  }
  protected seedInventoryItemVersions(): void {
    this.ensureColumn('inventory_items', 'effective_from', 'TEXT');
    this.ensureColumn('inventory_items', 'effective_to', 'TEXT');
    this.db.exec(`INSERT INTO inventory_item_versions(inventory_item_id,effective_from,effective_to,item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,average_cost,active)
      SELECT i.id, COALESCE(NULLIF(i.effective_from,''),'1900-01-01'), NULLIF(i.effective_to,''), i.item_code, i.item_name, i.brand, i.category, i.unit, i.pack_unit, i.purchase_unit, COALESCE(i.pack_size,1), i.hsn_code, COALESCE(i.gst_percent,0), COALESCE(i.batch_expiry_required,0), COALESCE(i.maintain_batch,0), COALESCE(i.maintain_expiry,0), COALESCE(i.reorder_level,0), COALESCE(i.average_cost,0), COALESCE(i.active,1)
      FROM inventory_items i
      WHERE NOT EXISTS (SELECT 1 FROM inventory_item_versions v WHERE v.inventory_item_id=i.id)`);
  }
  protected versionPayloadFromStock(x:any, itemId:number): any {
    const hasNewTrack = Object.prototype.hasOwnProperty.call(x,'maintain_batch') || Object.prototype.hasOwnProperty.call(x,'maintain_expiry');
    const maintainBatch=hasNewTrack ? (x.maintain_batch?1:0) : (x.batch_expiry_required?1:0);
    const maintainExpiry=hasNewTrack ? (x.maintain_expiry?1:0) : (x.batch_expiry_required?1:0);
    return {
      inventory_item_id:itemId,
      effective_from:this.normalizeDateOnly(x.effective_from || x.version_effective_from || new Date().toISOString().slice(0,10)),
      effective_to:String(x.effective_to || x.version_effective_to || '').slice(0,10) || null,
      item_code:x.item_code||'', item_name:x.item_name||'', brand:x.brand||'', category:x.category||'', unit:x.unit||'',
      pack_unit:x.pack_unit||'', purchase_unit:x.purchase_unit||'', pack_size:Math.max(1,+x.pack_size||1), hsn_code:x.hsn_code||'', gst_percent:+x.gst_percent||0,
      batch_expiry_required:maintainBatch&&maintainExpiry?1:0, maintain_batch:maintainBatch, maintain_expiry:maintainExpiry,
      reorder_level:+x.reorder_level||0, average_cost:+x.average_cost||0, active:x.active===false?0:1
    };
  }
  protected rangesOverlap(aFrom:string, aTo:any, bFrom:string, bTo:any): boolean {
    const at=String(aTo||'9999-12-31'); const bt=String(bTo||'9999-12-31');
    return aFrom <= bt && bFrom <= at;
  }
  protected saveInventoryVersion(payload:any, updateExistingVersionId=0): number {
    const from=this.normalizeDateOnly(payload.effective_from);
    const to=payload.effective_to ? this.normalizeDateOnly(payload.effective_to, '') : null;
    if(to && to < from) throw new Error('Effective To date cannot be before Effective From date.');
    const tx=this.db.transaction(()=>{
      if(updateExistingVersionId){
        this.db.prepare(`UPDATE inventory_item_versions SET effective_from=?,effective_to=?,item_code=?,item_name=?,brand=?,category=?,unit=?,pack_unit=?,purchase_unit=?,pack_size=?,hsn_code=?,gst_percent=?,batch_expiry_required=?,maintain_batch=?,maintain_expiry=?,reorder_level=?,average_cost=?,active=?,updated_at=datetime('now','+330 minutes') WHERE id=?`).run(from,to,payload.item_code,payload.item_name,payload.brand,payload.category,payload.unit,payload.pack_unit,payload.purchase_unit,payload.pack_size,payload.hsn_code,payload.gst_percent,payload.batch_expiry_required,payload.maintain_batch,payload.maintain_expiry,payload.reorder_level,payload.average_cost,payload.active,updateExistingVersionId);
        return updateExistingVersionId;
      }
      const overlaps=this.db.prepare('SELECT * FROM inventory_item_versions WHERE inventory_item_id=? ORDER BY effective_from').all(payload.inventory_item_id) as any[];
      for(const old of overlaps){
        if(!this.rangesOverlap(from,to,old.effective_from,old.effective_to)) continue;
        const oldFrom=String(old.effective_from); const oldTo=old.effective_to ? String(old.effective_to) : null;
        this.db.prepare('DELETE FROM inventory_item_versions WHERE id=?').run(old.id);
        if(oldFrom < from){
          const leftTo=this.dateMinusOne(from);
          if(leftTo >= oldFrom) this.db.prepare(`INSERT INTO inventory_item_versions(inventory_item_id,effective_from,effective_to,item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,average_cost,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(old.inventory_item_id,oldFrom,leftTo,old.item_code,old.item_name,old.brand,old.category,old.unit,old.pack_unit,old.purchase_unit,old.pack_size,old.hsn_code,old.gst_percent,old.batch_expiry_required,old.maintain_batch,old.maintain_expiry,old.reorder_level,old.average_cost,old.active);
        }
        const newTo=to || '9999-12-31';
        if(oldTo && oldTo > newTo){
          const rightFrom=this.datePlusOne(newTo);
          if(rightFrom <= oldTo) this.db.prepare(`INSERT INTO inventory_item_versions(inventory_item_id,effective_from,effective_to,item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,average_cost,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(old.inventory_item_id,rightFrom,oldTo,old.item_code,old.item_name,old.brand,old.category,old.unit,old.pack_unit,old.purchase_unit,old.pack_size,old.hsn_code,old.gst_percent,old.batch_expiry_required,old.maintain_batch,old.maintain_expiry,old.reorder_level,old.average_cost,old.active);
        } else if(!oldTo && to){
          const rightFrom=this.datePlusOne(to);
          this.db.prepare(`INSERT INTO inventory_item_versions(inventory_item_id,effective_from,effective_to,item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,average_cost,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(old.inventory_item_id,rightFrom,null,old.item_code,old.item_name,old.brand,old.category,old.unit,old.pack_unit,old.purchase_unit,old.pack_size,old.hsn_code,old.gst_percent,old.batch_expiry_required,old.maintain_batch,old.maintain_expiry,old.reorder_level,old.average_cost,old.active);
        }
      }
      const res=this.db.prepare(`INSERT INTO inventory_item_versions(inventory_item_id,effective_from,effective_to,item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,average_cost,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(payload.inventory_item_id,from,to,payload.item_code,payload.item_name,payload.brand,payload.category,payload.unit,payload.pack_unit,payload.purchase_unit,payload.pack_size,payload.hsn_code,payload.gst_percent,payload.batch_expiry_required,payload.maintain_batch,payload.maintain_expiry,payload.reorder_level,payload.average_cost,payload.active);
      return Number(res.lastInsertRowid);
    });
    return tx();
  }
  protected getInventoryVersionForDate(itemId:number, date:any): any {
    const d=this.normalizeDateOnly(date || new Date().toISOString().slice(0,10));
    const row=this.db.prepare(`SELECT * FROM inventory_item_versions WHERE inventory_item_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to='' OR effective_to>=?) ORDER BY effective_from DESC,id DESC LIMIT 1`).get(itemId,d,d) as any;
    if(row) return row;
    return this.db.prepare('SELECT *, id inventory_item_id FROM inventory_items WHERE id=?').get(itemId) as any;
  }
  protected syncInventoryCurrentFromVersion(itemId:number): void {
    const today=new Date().toISOString().slice(0,10);
    const v=this.getInventoryVersionForDate(itemId,today);
    if(!v) return;
    this.db.prepare(`UPDATE inventory_items SET item_code=?,item_name=?,brand=?,category=?,unit=?,pack_unit=?,purchase_unit=?,pack_size=?,hsn_code=?,gst_percent=?,batch_expiry_required=?,maintain_batch=?,maintain_expiry=?,reorder_level=?,average_cost=?,active=?,effective_from=?,effective_to=? WHERE id=?`).run(v.item_code||'',v.item_name||'',v.brand||'',v.category||'',v.unit||'',v.pack_unit||'',v.purchase_unit||'',+v.pack_size||1,v.hsn_code||'',+v.gst_percent||0,+v.batch_expiry_required||0,+v.maintain_batch||0,+v.maintain_expiry||0,+v.reorder_level||0,+v.average_cost||0,v.active===false?0:+v.active||1,v.effective_from||'',v.effective_to||'',itemId);
  }

  listInventoryItems() {
    this.ensureOperationsSchema();
    return this.db.prepare(`SELECT i.*, COALESCE(b.batch_count,0) batch_count, b.earliest_expiry
      FROM inventory_items i
      LEFT JOIN (SELECT inventory_item_id, COUNT(*) batch_count, MIN(NULLIF(expiry_date,'')) earliest_expiry FROM inventory_batches WHERE quantity>0 GROUP BY inventory_item_id) b ON b.inventory_item_id=i.id
      ORDER BY i.active DESC,i.item_name`).all();
  }
  saveInventoryItem(x:any) {
    this.ensureOperationsSchema();
    const id=+x.id||0;
    this.rememberOperationUnit(x.unit);
    this.rememberOperationUnit(x.pack_unit);
    this.rememberOperationUnit(x.purchase_unit);
    this.rememberOperationBrand(x.brand);
    this.rememberOperationHsn(x.hsn_code);
    let itemId=id;
    if(!itemId) {
      const res=this.db.prepare('INSERT INTO inventory_items(item_code,item_name,brand,category,unit,pack_unit,purchase_unit,pack_size,hsn_code,gst_percent,batch_expiry_required,maintain_batch,maintain_expiry,reorder_level,current_stock,average_cost,active,effective_from,effective_to) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(x.item_code||'',x.item_name||'',x.brand||'',x.category||'',x.unit||'',x.pack_unit||'',x.purchase_unit||'',Math.max(1,+x.pack_size||1),x.hsn_code||'',+x.gst_percent||0,(x.maintain_batch&&x.maintain_expiry)?1:0,x.maintain_batch?1:0,x.maintain_expiry?1:0,+x.reorder_level||0,+x.current_stock||0,+x.average_cost||0,x.active===false?0:1,this.normalizeDateOnly(x.effective_from || new Date().toISOString().slice(0,10)),x.effective_to||null);
      itemId=Number(res.lastInsertRowid);
    }
    const payload=this.versionPayloadFromStock(x,itemId);
    const updateVersionId=+x.update_version_id||0;
    this.saveInventoryVersion(payload, updateVersionId);
    this.syncInventoryCurrentFromVersion(itemId);
    if(x.recalculate_reagent_mappings) this.recalculateReagentMappingsForInventory(itemId);
    if(x.update_purchase_snapshots) this.updatePurchaseSnapshotsForInventory(itemId, x.effective_purchase_date || payload.effective_from);
    return this.listInventoryItems();
  }

  listInventoryItemVersions(itemId:number) {
    this.ensureOperationsSchema();
    return this.db.prepare('SELECT * FROM inventory_item_versions WHERE inventory_item_id=? ORDER BY effective_from DESC,id DESC').all(itemId);
  }

  listInventoryBatches(itemId:number) {
    this.ensureOperationsSchema();
    return this.db.prepare(`SELECT *, CASE WHEN NULLIF(expiry_date,'') IS NOT NULL AND expiry_date < date('now','+330 minutes') THEN 1 ELSE 0 END expired FROM inventory_batches WHERE inventory_item_id=? AND quantity>0 ORDER BY expired ASC, NULLIF(expiry_date,'') IS NULL, expiry_date ASC, batch_no COLLATE NOCASE`).all(itemId);
  }


  protected updatePurchaseSnapshotsForInventory(inventoryItemId:number, effectiveDate:string): void {
    this.ensureOperationsSchema();
    const item=this.db.prepare('SELECT item_code,item_name,brand,unit,hsn_code,gst_percent FROM inventory_items WHERE id=?').get(inventoryItemId) as any;
    if(!item) return;
    this.db.prepare(`UPDATE purchase_items
      SET item_code_snapshot=?, item_name_snapshot=?, brand_snapshot=?, unit_snapshot=?, hsn_code=?, gst_percent=?
      WHERE inventory_item_id=? AND purchase_id IN (
        SELECT id FROM purchases WHERE COALESCE(NULLIF(effective_purchase_date,''), purchase_date, '') >= ?
      )`).run(item.item_code||'', item.item_name||'', item.brand||'', item.unit||'', item.hsn_code||'', +item.gst_percent||0, inventoryItemId, effectiveDate||'');
  }

  protected recalculateReagentMappingsForInventory(inventoryItemId:number): void {
    this.ensureOperationsSchema();
    const rows=this.db.prepare('SELECT * FROM test_reagent_consumption WHERE inventory_item_id=?').all(inventoryItemId) as any[];
    for(const row of rows) this.saveReagentConsumption({...row});
  }

  protected reversePurchaseStock(purchaseId:number): void {
    this.ensureOperationsSchema();
    const rows=this.db.prepare('SELECT * FROM purchase_items WHERE purchase_id=?').all(purchaseId) as any[];
    for(const it of rows){
      const itemId=+it.inventory_item_id;
      const qty=+it.quantity||0;
      const taxable=+(it.taxable_amount || it.amount)||0;
      if(itemId && qty){
        const row=this.db.prepare('SELECT current_stock,average_cost FROM inventory_items WHERE id=?').get(itemId) as any;
        const oldQty=+row?.current_stock||0;
        const newQty=Math.max(0, oldQty-qty);
        this.db.prepare('UPDATE inventory_items SET current_stock=? WHERE id=?').run(newQty,itemId);
      }
      const stockTrack=this.db.prepare('SELECT batch_expiry_required,maintain_batch,maintain_expiry FROM inventory_items WHERE id=?').get(itemId) as any;
      const trackBatch=!!(stockTrack?.maintain_batch || stockTrack?.batch_expiry_required);
      const trackExpiry=!!(stockTrack?.maintain_expiry || stockTrack?.batch_expiry_required);
      const stockLotKey=trackBatch ? (it.batch_no||'') : (trackExpiry && it.expiry_date ? `EXPIRY:${it.expiry_date}` : '');
      if(stockLotKey){
        const batch=this.db.prepare('SELECT quantity,amount FROM inventory_batches WHERE inventory_item_id=? AND batch_no=?').get(itemId,stockLotKey) as any;
        if(batch){
          const bQty=Math.max(0,(+batch.quantity||0)-qty);
          const bAmt=Math.max(0,(+batch.amount||0)-taxable);
          this.db.prepare('UPDATE inventory_batches SET quantity=?, amount=?, updated_at=datetime(\'now\',\'+330 minutes\') WHERE inventory_item_id=? AND batch_no=?').run(bQty,bAmt,itemId,stockLotKey);
        }
      }
    }
    this.db.prepare("DELETE FROM inventory_movements WHERE reference_type='PURCHASE' AND reference_id=?").run(purchaseId);
    this.db.prepare('DELETE FROM purchase_items WHERE purchase_id=?').run(purchaseId);
  }

  protected normalizePurchaseBatchSplits(raw:any, needsBatch:boolean, needsExpiry:boolean, qty:number): any[] {
    if (!(needsBatch || needsExpiry)) return [];
    let rows:any[]=[];
    if (Array.isArray(raw?.batch_rows)) rows=raw.batch_rows;
    else if (typeof raw?.batch_splits_json === 'string' && raw.batch_splits_json.trim()) { try { const parsed=JSON.parse(raw.batch_splits_json); if (Array.isArray(parsed)) rows=parsed; } catch {} }
    if (!rows.length && (raw?.batch_no || raw?.expiry_date)) rows=[{batch_no:raw.batch_no||'', expiry_date:raw.expiry_date||'', quantity:qty}];
    return rows.map((b:any)=>({ batch_no:String(b.batch_no||'').trim(), expiry_date:String(b.expiry_date||'').trim(), quantity:+b.quantity||0 })).filter((b:any)=>b.quantity>0 || b.batch_no || b.expiry_date);
  }

  savePurchase(p:any) {
    this.ensureOperationsSchema();
    const purchaseIdIn=+p.id||0;
    const existing=purchaseIdIn ? this.db.prepare('SELECT * FROM purchases WHERE id=?').get(purchaseIdIn) as any : null;
    const items=(p.items||[]).filter((i:any)=>+i.inventory_item_id>0 && +i.quantity>0);
    const calcLine=(i:any)=>{
      const qty=+i.quantity||0;
      const rate=+i.rate||0;
      const discVal=+i.discount_value||0;
      const discountType=i.discount_type==='AMOUNT'?'AMOUNT':'PERCENT';
      const discountPerUnit=discountType==='AMOUNT' ? Math.min(rate, discVal) : Math.min(rate, rate*discVal/100);
      const finalRate=Math.max(0, rate-discountPerUnit);
      const taxable=+(qty*finalRate).toFixed(2);
      const gstPercent=+i.gst_percent||0;
      const taxAmount=+(taxable*gstPercent/100).toFixed(2);
      return { qty, rate, discountType, discVal, discountAmount:+(discountPerUnit*qty).toFixed(2), finalRate:+finalRate.toFixed(2), taxable, gstPercent, taxAmount, lineTotal:+(taxable+taxAmount).toFixed(2) };
    };
    const lines=items.map((it:any)=>({ raw:it, ...calcLine(it) }));
    for (const l of lines) {
      const stock=this.getInventoryVersionForDate(+l.raw.inventory_item_id, p.effective_purchase_date || p.purchase_date);
      const needsBatch=!!(stock?.maintain_batch || stock?.batch_expiry_required);
      const needsExpiry=!!(stock?.maintain_expiry || stock?.batch_expiry_required);
      const splits=this.normalizePurchaseBatchSplits(l.raw, needsBatch, needsExpiry, l.qty);
      if ((needsBatch || needsExpiry) && !splits.length) throw new Error(`Batch/expiry split is required for ${stock.item_name || 'selected stock item'}`);
      for (const b of splits) {
        if (needsBatch && !b.batch_no) throw new Error(`Batch number is required for ${stock.item_name || 'selected stock item'}`);
        if (needsExpiry && !b.expiry_date) throw new Error(`Expiry date is required for ${stock.item_name || 'selected stock item'}`);
        if ((+b.quantity || 0) <= 0) throw new Error(`Batch quantity is required for ${stock.item_name || 'selected stock item'}`);
      }
      const splitTotal=+splits.reduce((sum:number,b:any)=>sum+(+b.quantity||0),0).toFixed(4);
      if ((needsBatch || needsExpiry) && Math.abs(splitTotal-(+l.qty||0))>0.0001) throw new Error(`Batch split quantity must match purchase quantity for ${stock.item_name || 'selected stock item'}`);
      (l as any).batchSplits=splits;
    }
    const subtotal=+lines.reduce((s:number,l:any)=>s+l.taxable,0).toFixed(2);
    const discount=+p.discount||0;
    const tax=+lines.reduce((s:number,l:any)=>s+l.taxAmount,0).toFixed(2);
    const total=Math.max(0,subtotal-discount+tax);
    const paid=purchaseIdIn ? (+existing?.paid||0) : (+p.paid||0);
    const due=Math.max(0,total-paid);
    const purchaseNo = p.purchase_no || existing?.purchase_no || `PUR${Date.now()}`;
    const purchaseDate=p.purchase_date||existing?.purchase_date||new Date().toISOString().slice(0,10);
    const effectiveDate = p.effective_purchase_date || purchaseDate;
    const tx=this.db.transaction(()=>{
      let purchaseId=purchaseIdIn;
      if(purchaseId){
        this.reversePurchaseStock(purchaseId);
        this.db.prepare('UPDATE purchases SET purchase_no=?,vendor_id=?,purchase_date=?,effective_purchase_date=?,invoice_no=?,subtotal=?,discount=?,tax=?,total=?,paid=?,due=?,notes=? WHERE id=?').run(purchaseNo,+p.vendor_id||null,purchaseDate,effectiveDate,p.invoice_no||'',subtotal,discount,tax,total,paid,due,p.notes||'',purchaseId);
      } else {
        const res=this.db.prepare('INSERT INTO purchases(purchase_no,vendor_id,purchase_date,effective_purchase_date,invoice_no,subtotal,discount,tax,total,paid,due,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(purchaseNo,+p.vendor_id||null,purchaseDate,effectiveDate,p.invoice_no||'',subtotal,discount,tax,total,paid,due,p.notes||'');
        purchaseId=Number(res.lastInsertRowid);
      }
      const ins=this.db.prepare('INSERT INTO purchase_items(purchase_id,inventory_item_id,batch_no,expiry_date,quantity,rate,amount,hsn_code,gst_percent,discount_type,discount_value,discount_amount,final_rate,taxable_amount,tax_amount,line_total,item_code_snapshot,item_name_snapshot,brand_snapshot,unit_snapshot,inventory_version_id,pack_size_snapshot,pack_unit_snapshot,purchase_unit_snapshot,batch_splits_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const mov=this.db.prepare('INSERT INTO inventory_movements(inventory_item_id,movement_type,quantity,rate,amount,reference_type,reference_id,notes,batch_no,expiry_date,effective_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
      const upsertBatch=this.db.prepare(`INSERT INTO inventory_batches(inventory_item_id,batch_no,expiry_date,quantity,rate,amount,updated_at) VALUES(?,?,?,?,?,?,datetime('now','+330 minutes'))
        ON CONFLICT(inventory_item_id,batch_no) DO UPDATE SET expiry_date=excluded.expiry_date, quantity=inventory_batches.quantity+excluded.quantity, rate=excluded.rate, amount=inventory_batches.amount+excluded.amount, updated_at=datetime('now','+330 minutes')`);
      for(const l of lines){
        const it=l.raw;
        const itemMaster=this.getInventoryVersionForDate(+it.inventory_item_id, effectiveDate);
        const batchSplits=(l as any).batchSplits || [];
        const displayBatch=batchSplits.length>1 ? `${batchSplits.length} batches` : (batchSplits[0]?.batch_no || it.batch_no || '');
        const displayExpiry=batchSplits.length===1 ? (batchSplits[0]?.expiry_date || it.expiry_date || '') : '';
        ins.run(purchaseId,+it.inventory_item_id,displayBatch,displayExpiry,l.qty,l.rate,l.taxable,it.hsn_code||itemMaster?.hsn_code||'',l.gstPercent,l.discountType,l.discVal,l.discountAmount,l.finalRate,l.taxable,l.taxAmount,l.lineTotal,itemMaster?.item_code||it.item_code||'',itemMaster?.item_name||it.item_name||'',itemMaster?.brand||it.brand||'',itemMaster?.unit||it.unit||'',itemMaster?.id||null,+itemMaster?.pack_size||1,itemMaster?.pack_unit||'',itemMaster?.purchase_unit||'', JSON.stringify(batchSplits));
        if(batchSplits.length){
          for(const b of batchSplits){
            const partQty=+b.quantity||0;
            const partAmount=+(partQty*l.finalRate).toFixed(2);
            const lotKey=(b.batch_no || (b.expiry_date ? `EXPIRY:${b.expiry_date}` : ''));
            mov.run(+it.inventory_item_id,'PURCHASE',partQty,l.finalRate,partAmount,'PURCHASE',purchaseId,purchaseNo,b.batch_no||'',b.expiry_date||'',effectiveDate);
            if(lotKey) upsertBatch.run(+it.inventory_item_id,lotKey,b.expiry_date||'',partQty,l.finalRate,partAmount);
          }
        } else {
          mov.run(+it.inventory_item_id,'PURCHASE',l.qty,l.finalRate,l.taxable,'PURCHASE',purchaseId,purchaseNo,it.batch_no||'',it.expiry_date||'',effectiveDate);
        }
        const row=this.db.prepare('SELECT current_stock,average_cost FROM inventory_items WHERE id=?').get(+it.inventory_item_id) as any;
        const oldQty=+row?.current_stock||0; const oldAvg=+row?.average_cost||0; const newQty=oldQty+l.qty; const newAvg=newQty>0?((oldQty*oldAvg)+l.taxable)/newQty:l.finalRate;
        this.db.prepare('UPDATE inventory_items SET current_stock=?,average_cost=? WHERE id=?').run(newQty,+newAvg.toFixed(2),+it.inventory_item_id);
      }
      return purchaseId;
    });
    return { id: tx(), purchases:this.listPurchases({}) };
  }
  protected parsePurchaseBatchSplits(json:any, batchNo:any, expiryDate:any, qty:number): any[] {
    if (typeof json === 'string' && json.trim()) { try { const rows=JSON.parse(json); if (Array.isArray(rows)) return rows; } catch {} }
    if (batchNo || expiryDate) return [{ batch_no:batchNo || '', expiry_date:expiryDate || '', quantity:qty || 0 }];
    return [];
  }

  listPurchases(filters:any={}) {
    this.ensureOperationsSchema();
    const rows=this.db.prepare(`SELECT p.*,v.name vendor_name,
      (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id=p.id) item_count
      FROM purchases p LEFT JOIN vendors v ON v.id=p.vendor_id ORDER BY p.id DESC LIMIT 300`).all() as any[];
    const itemStmt=this.db.prepare(`SELECT pi.*,
      COALESCE(NULLIF(pi.item_name_snapshot,''), NULLIF(i.item_name,''), 'Stock item') item_name,
      COALESCE(NULLIF(pi.item_code_snapshot,''), NULLIF(i.item_code,''), '') item_code,
      COALESCE(NULLIF(pi.brand_snapshot,''), NULLIF(i.brand,''), '') brand,
      COALESCE(NULLIF(pi.unit_snapshot,''), NULLIF(i.unit,''), '') unit
      FROM purchase_items pi LEFT JOIN inventory_items i ON i.id=pi.inventory_item_id WHERE pi.purchase_id=? ORDER BY pi.id`);
    return rows.map((r:any)=>({...r, items:(itemStmt.all(r.id) as any[]).map((x:any)=>({ ...x, batch_rows:this.parsePurchaseBatchSplits(x.batch_splits_json, x.batch_no, x.expiry_date, +x.quantity||0) }))}));
  }

  listReagentConsumption(testId?:number) {
    this.ensureOperationsSchema();
    const sql=`SELECT trc.*,t.name test_name,i.item_name reagent_name,i.brand,i.unit,i.pack_size,i.pack_unit,i.purchase_unit,i.average_cost
      FROM test_reagent_consumption trc JOIN tests t ON t.id=trc.test_id JOIN inventory_items i ON i.id=trc.inventory_item_id WHERE COALESCE(i.active,1)=1`;
    if(testId) return this.db.prepare(sql+' AND trc.test_id=? ORDER BY i.item_name').all(testId);
    return this.db.prepare(sql+' ORDER BY t.name,i.item_name').all();
  }
  protected operationFrequencyFactor(freq:any): number {
    const f=String(freq||'DAY').toUpperCase();
    if(f==='DAY') return 30;
    if(f==='WEEK') return 4.345;
    return 1;
  }
  saveReagentConsumption(x:any) {
    this.ensureOperationsSchema();
    const testIds = Array.isArray(x.test_ids) && x.test_ids.length ? x.test_ids.map((n:any)=>+n).filter((n:number)=>n>0) : [+x.test_id||0].filter((n:number)=>n>0);
    const itemIds = Array.isArray(x.inventory_item_ids) && x.inventory_item_ids.length ? x.inventory_item_ids.map((n:any)=>+n).filter((n:number)=>n>0) : [+x.inventory_item_id||0].filter((n:number)=>n>0);
    if (testIds.length > 1 || itemIds.length > 1) {
      let last:any[]=[];
      for (const test_id of testIds) for (const inventory_item_id of itemIds) last=this.saveSingleReagentConsumption({...x, test_id, inventory_item_id});
      return this.listReagentConsumption();
    }
    return this.saveSingleReagentConsumption({...x, test_id:testIds[0], inventory_item_id:itemIds[0]});
  }

  protected saveSingleReagentConsumption(x:any) {
    this.ensureOperationsSchema();
    const method=String(x.consumption_method||'QTY_PER_TEST').toUpperCase()==='TESTS_PER_PACK'?'TESTS_PER_PACK':'QTY_PER_TEST';
    const qty=+x.quantity_per_test||0;
    const testsPerPack=+x.tests_per_pack||0;
    const wastage=+x.wastage_percent||0;
    const includeControl=x.include_control?1:0;
    const controlCount=+x.control_tests_count||0;
    const expectedCount=Math.max(1,+x.expected_tests_count||1);
    const item=this.db.prepare('SELECT average_cost,pack_size,pack_unit,unit FROM inventory_items WHERE id=?').get(+x.inventory_item_id||0) as any;
    const avg=+item?.average_cost||0;
    const pack=Math.max(1,+item?.pack_size||1);
    const base=method==='TESTS_PER_PACK' ? (avg/Math.max(1,testsPerPack||pack)) : (qty*(avg/pack));
    const burden=includeControl ? Math.max(0,(controlCount*this.operationFrequencyFactor(x.control_frequency))/(expectedCount*this.operationFrequencyFactor(x.expected_tests_frequency))) : 0;
    const cost=+(base*(1+(wastage/100)+burden)).toFixed(2);
    this.rememberOperationUnit(x.qty_unit);
    this.db.prepare(`INSERT INTO test_reagent_consumption(test_id,inventory_item_id,quantity_per_test,wastage_percent,cost_per_test,active,consumption_method,qty_unit,tests_per_pack,include_control,control_tests_count,control_frequency,expected_tests_count,expected_tests_frequency)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(test_id,inventory_item_id) DO UPDATE SET quantity_per_test=excluded.quantity_per_test,wastage_percent=excluded.wastage_percent,cost_per_test=excluded.cost_per_test,active=excluded.active,consumption_method=excluded.consumption_method,qty_unit=excluded.qty_unit,tests_per_pack=excluded.tests_per_pack,include_control=excluded.include_control,control_tests_count=excluded.control_tests_count,control_frequency=excluded.control_frequency,expected_tests_count=excluded.expected_tests_count,expected_tests_frequency=excluded.expected_tests_frequency`)
      .run(+x.test_id,+x.inventory_item_id,qty,wastage,cost,x.active===false?0:1,method,x.qty_unit||item?.pack_unit||item?.unit||'',testsPerPack,includeControl,controlCount,x.control_frequency||'DAY',expectedCount,x.expected_tests_frequency||'DAY');
    return this.listReagentConsumption(+x.test_id||undefined);
  }
  deleteReagentConsumption(id:number) { this.ensureOperationsSchema(); const row=this.db.prepare('SELECT test_id FROM test_reagent_consumption WHERE id=?').get(id) as any; this.db.prepare('DELETE FROM test_reagent_consumption WHERE id=?').run(id); return this.listReagentConsumption(row?.test_id); }

  saveExpense(x:any) { this.ensureOperationsSchema(); const id=+x.id||0; const vals=[x.expense_date||new Date().toISOString().slice(0,10),x.category||'',x.description||'',+x.amount||0,x.payment_mode||'Cash',x.paid_to||'',x.notes||'']; if(id) this.db.prepare('UPDATE expenses SET expense_date=?,category=?,description=?,amount=?,payment_mode=?,paid_to=?,notes=? WHERE id=?').run(...vals,id); else this.db.prepare('INSERT INTO expenses(expense_date,category,description,amount,payment_mode,paid_to,notes) VALUES(?,?,?,?,?,?,?)').run(...vals); return this.listExpenses({}); }
  listExpenses(filters:any={}) { this.ensureOperationsSchema(); return this.db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC,id DESC LIMIT 500').all(); }
  savePayment(x:any) {
    this.ensureOperationsSchema();
    const amount=+x.amount||0;
    const vals=[x.payment_date||new Date().toISOString().slice(0,10),x.party_type||'VENDOR',+x.party_id||null,x.party_name||'',amount,x.payment_mode||'Cash',x.reference_no||'',x.notes||''];
    const allocations=(x.allocations||[]).filter((a:any)=>+a.purchase_id>0 && +a.allocated_amount>0);
    const tx=this.db.transaction(()=>{
      const res=this.db.prepare('INSERT INTO payments(payment_date,party_type,party_id,party_name,amount,payment_mode,reference_no,notes) VALUES(?,?,?,?,?,?,?,?)').run(...vals);
      const paymentId=Number(res.lastInsertRowid);
      const ins=this.db.prepare('INSERT INTO payment_allocations(payment_id,purchase_id,allocated_amount,notes) VALUES(?,?,?,?)');
      const upd=this.db.prepare('UPDATE purchases SET paid=MIN(total, paid + ?), due=MAX(0, total - MIN(total, paid + ?)) WHERE id=?');
      for(const a of allocations){
        const purchase=this.db.prepare('SELECT due FROM purchases WHERE id=?').get(+a.purchase_id) as any;
        const alloc=Math.min(+a.allocated_amount||0, +purchase?.due||0);
        if(alloc>0){ ins.run(paymentId,+a.purchase_id,alloc,a.notes||''); upd.run(alloc,alloc,+a.purchase_id); }
      }
      return paymentId;
    });
    tx();
    return this.listPayments({});
  }
  listPayments(filters:any={}) { this.ensureOperationsSchema(); return this.db.prepare(`SELECT p.*, (SELECT COALESCE(SUM(allocated_amount),0) FROM payment_allocations pa WHERE pa.payment_id=p.id) allocated_amount FROM payments p ORDER BY payment_date DESC,id DESC LIMIT 500`).all(); }
  listPurchaseItemHistory(itemId:number) {
    this.ensureOperationsSchema();
    return this.db.prepare(`SELECT pi.*, p.purchase_no, p.invoice_no, p.purchase_date, v.name vendor_name,
      COALESCE(NULLIF(pi.item_name_snapshot,''), NULLIF(i.item_name,''), 'Stock item') item_name,
      COALESCE(NULLIF(pi.item_code_snapshot,''), NULLIF(i.item_code,''), '') item_code,
      COALESCE(NULLIF(pi.brand_snapshot,''), NULLIF(i.brand,''), '') brand,
      COALESCE(NULLIF(pi.unit_snapshot,''), NULLIF(i.unit,''), '') unit
      FROM purchase_items pi
      JOIN purchases p ON p.id=pi.purchase_id
      LEFT JOIN vendors v ON v.id=p.vendor_id
      LEFT JOIN inventory_items i ON i.id=pi.inventory_item_id
      WHERE pi.inventory_item_id=?
      ORDER BY p.purchase_date DESC, pi.id DESC LIMIT 50`).all(+itemId||0);
  }

  listOutsourceVendors() { this.ensureOperationsSchema(); return this.db.prepare('SELECT * FROM outsource_vendors ORDER BY active DESC,name').all(); }
  saveOutsourceVendor(x:any) { this.ensureOperationsSchema(); const id=+x.id||0; if(id) this.db.prepare('UPDATE outsource_vendors SET name=?,phone=?,address=?,active=? WHERE id=?').run(x.name||'',x.phone||'',x.address||'',x.active===false?0:1,id); else this.db.prepare('INSERT INTO outsource_vendors(name,phone,address,active) VALUES(?,?,?,?)').run(x.name||'',x.phone||'',x.address||'',x.active===false?0:1); return this.listOutsourceVendors(); }
  listOutsourceRates() { this.ensureOperationsSchema(); return this.db.prepare('SELECT r.*,t.name test_name,v.name vendor_name FROM outsource_test_rates r JOIN tests t ON t.id=r.test_id JOIN outsource_vendors v ON v.id=r.outsource_vendor_id ORDER BY t.name,v.name').all(); }
  saveOutsourceRate(x:any) { this.ensureOperationsSchema(); this.db.prepare('INSERT INTO outsource_test_rates(test_id,outsource_vendor_id,vendor_rate,billing_rate,commission_allowed,active) VALUES(?,?,?,?,?,?) ON CONFLICT(test_id,outsource_vendor_id) DO UPDATE SET vendor_rate=excluded.vendor_rate,billing_rate=excluded.billing_rate,commission_allowed=excluded.commission_allowed,active=excluded.active').run(+x.test_id,+x.outsource_vendor_id,+x.vendor_rate||0,+x.billing_rate||0,x.commission_allowed?1:0,x.active===false?0:1); return this.listOutsourceRates(); }
  saveOutsourceCase(x:any) { this.ensureOperationsSchema(); const id=+x.id||0; const vals=[+x.bill_id||null,+x.test_id,+x.outsource_vendor_id,x.sent_date||new Date().toISOString().slice(0,10),x.expected_date||'',x.received_date||'',x.status||'SENT',+x.vendor_cost||0,x.notes||'']; if(id) this.db.prepare('UPDATE outsource_cases SET bill_id=?,test_id=?,outsource_vendor_id=?,sent_date=?,expected_date=?,received_date=?,status=?,vendor_cost=?,notes=? WHERE id=?').run(...vals,id); else this.db.prepare('INSERT INTO outsource_cases(bill_id,test_id,outsource_vendor_id,sent_date,expected_date,received_date,status,vendor_cost,notes) VALUES(?,?,?,?,?,?,?,?,?)').run(...vals); return this.listOutsourceCases({}); }
  listOutsourceCases(filters:any={}) { this.ensureOperationsSchema(); return this.db.prepare('SELECT oc.*,t.name test_name,v.name vendor_name,b.bill_no FROM outsource_cases oc JOIN tests t ON t.id=oc.test_id JOIN outsource_vendors v ON v.id=oc.outsource_vendor_id LEFT JOIN bills b ON b.id=oc.bill_id ORDER BY oc.id DESC LIMIT 500').all(); }



}
