/* Receivables are a dated, read-only interpretation of signed ledger postings. */
(function(root,factory){
  const common=typeof module==='object'&&module.exports,api=factory(common?require('./ledger.js'):root.Ledger);
  if(common)module.exports=api;else root.QaydCollections=api;
})(globalThis,L=>{
  'use strict';
  const bands=Object.freeze([['d30','1–30 يومًا'],['d60','31–60 يومًا'],['d90','61–90 يومًا'],['d91','أكثر من 90 يومًا']]);
  const fields={overdue:'متأخر',today:'مستحق اليوم',week:'خلال 7 أيام',later:'لاحقًا',unscheduled:'بلا موعد'};
  const duration=(start,end)=>Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
  const overdueBand=days=>days<=30?'d30':days<=60?'d60':days<=90?'d90':'d91';
  const balanceFields=['total',...Object.keys(fields),...bands.map(([key])=>key)];
  const zero=()=>Object.fromEntries(balanceFields.map(key=>[key,0]));
  const first=(a,b)=>a&&b?a<b?a:b:a||b;
  const maturity=(due,asOf)=>{
    if(!due)return {key:'unscheduled',days:0};
    const days=duration(due,asOf);
    return {key:days>0?'overdue':days===0?'today':days>=-7?'week':'later',days};
  };
  const bookOrder=(a,b)=>a.e.day.localeCompare(b.e.day)||(a.e.time||'23:59').localeCompare(b.e.time||'23:59')||a.e.created-b.e.created||a.e.id.localeCompare(b.e.id);
  function compare(a,b){
    return Number(b.overdue>0)-Number(a.overdue>0) ||
      ((a.firstDue||'∞')<(b.firstDue||'∞')?-1:(a.firstDue||'∞')>(b.firstDue||'∞')?1:0) ||
      b.overdue-a.overdue || b.total-a.total || a.account.name.localeCompare(b.account.name,'ar') || a.account.id.localeCompare(b.account.id);
  }
  function snapshot(data,code,asOf,{omitReceipt='',accountId=''}={}){
    if(!L.validDay(asOf))throw new Error('اختر تاريخ تقرير صحيحًا.');
    const relevant=accountId?data.accounts.filter(a=>a.id===accountId):data.accounts;
    const accounts=new Map(relevant.map(account=>[account.id,{account,offset:0,charges:[],allocations:new Map()}]));
    for(const e of data.entries){
      if(e.day>asOf||(e.receipt&&e.id===omitReceipt))continue;
      for(const l of e.legs){
        if(l.code!==code)continue;
        const group=accounts.get(l.account);if(!group)continue;
        if(l.minor>0)group.charges.push({e,minor:l.minor});
        else if(e.receipt?.target)group.allocations.set(e.receipt.target,(group.allocations.get(e.receipt.target)||0)-l.minor);
        else group.offset-=l.minor;
      }
    }
    const rows=[],index=new Map();
    for(const group of accounts.values()){
      const row={account:group.account,...zero(),firstDue:'',oldestDays:0,items:[],followup:group.account.followups?.[code]||null};
      let paid=group.offset;
      // Validated specific receipts reduce their linked charge before distributing the
      // remaining negative postings oldest first. These are two disjoint budgets.
      group.charges.sort(bookOrder);
      for(const {e,minor} of group.charges){
        const afterAllocation=minor-(group.allocations.get(e.id)||0);
        const applied=Math.min(paid,afterAllocation);paid-=applied;
        const open=afterAllocation-applied;if(!open)continue;
        const due=e.due||'', {key,days}=maturity(due,asOf);
        row.items.push({id:e.id,day:e.day,time:e.time||'',memo:e.memo||'',due,original:minor,open,key,lateDays:Math.max(days,0),transfer:e.legs.length===2||!!e.isolatedTransfer});
        row.total+=open;row[key]+=open;
        if(due)row.firstDue=first(row.firstDue,due);
        if(days>0){row.oldestDays=Math.max(row.oldestDays,days);row[overdueBand(days)]+=open;}
      }
      if(row.total){rows.push(row);index.set(group.account.id,row);}
    }
    rows.sort(compare);
    return {code,asOf,rows,index};
  }
  function summary(rows){
    const s={...zero(),accounts:rows.length,lateAccounts:0};
    for(const row of rows){for(const key of balanceFields)s[key]+=row[key];if(row.overdue)s.lateAccounts++;}
    return s;
  }
  function followupDue(row,today){return Boolean(row.followup?.day&&row.followup.day<=today);}
  function matches(row,state,today){return !state||(state==='followup'?followupDue(row,today):Object.hasOwn(fields,state)&&row[state]>0);}
  function saveReceipt(data,fields){
    const {id,day,account,code,amount,receipt}=fields;
    if(!L.validDay(day)||day>L.localDay())throw new Error('اختر تاريخ قبض لا يتجاوز اليوم.');
    if(!receipt||!L.receiptMethods.includes(receipt.method))throw new Error('اختر طريقة قبض صحيحة.');
    const minor=L.parseAmount(amount),target=receipt?.target||'';
    const previous=id&&data.entries.find(e=>e.id===id);
    if(id&&!previous?.receipt)throw new Error('لم يعد سند القبض موجودًا.');
    if(previous&&(previous.legs[0].account!==account||previous.legs[0].code!==code))throw new Error('لا يمكن نقل سند قبض صادر إلى حساب أو عملة أخرى.');
    // Updating the method, time, reference or memo is not a new payment. Other edits
    // must fit the dated allocation calculated without double-counting the old receipt.
    if(!(previous&&previous.day===day&&previous.legs[0].minor===-minor&&(previous.receipt.target||'')===target)){
      const row=snapshot(data,code,day,{accountId:account,omitReceipt:id}).index.get(account);
      if(target){
        const lot=row?.items.find(t=>t.id===target);
        if(!lot)throw new Error('لا يتبقى مبلغ لهذا القيد في تاريخ القبض. اختر قيدًا متاحًا أو التوزيع التلقائي.');
        if(minor>lot.open)throw new Error('مبلغ القبض أكبر من المتبقي في القيد المختار. خفّض المبلغ أو اختر التوزيع التلقائي.');
      }else if(minor>(row?.total||0))throw new Error('مبلغ القبض أكبر من الذمة في تاريخ القبض. سجّل الدفعة الزائدة من إضافة حركة إن لزم.');
    }
    return L.saveEntry(data,{...fields,kind:'debit',receipt});
  }
  return {bands,fields,duration,maturity,snapshot,summary,compare,followupDue,matches,saveReceipt};
});
