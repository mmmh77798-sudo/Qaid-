/* A category snapshot is deliberately not a ledger. Its independent tag prevents a full restore. */
(function(root,factory){
  const common=typeof module==='object'&&module.exports,api=factory(common?require('./ledger.js'):root.Ledger);
  if(common)module.exports=api;else root.QaydCategoryBackup=api;
})(globalThis,L=>{
  'use strict';
  const format='qayd-category-backup', version=1;
  const err=message=>{throw new Error(message);};
  const is=raw=>raw?.format===format;
  const key=(a,code)=>a+':'+code;
  const closureKey=c=>key(c.account,c.code);
  const same=(a,b)=>a===b||JSON.stringify(a)===JSON.stringify(b);
  const mapIds=xs=>new Map(xs.map(x=>[x.id,x]));
  const lockedIds=cs=>{const ids=new Set();for(const c of cs)for(const id of c.ids)ids.add(id);return ids;};
  const usedCodes=(accounts,entries)=>{
    const codes=new Set();
    for(const a of accounts)for(const k of [...Object.keys(a.limits||{}),...Object.keys(a.followups||{})])codes.add(k);
    for(const e of entries)for(const l of e.legs)codes.add(l.code);
    return codes;
  };
  function scope(d,id){
    const category=d.categories.find(c=>c.id===id);
    if(!category)err('اختر تصنيفًا موجودًا.');
    const accounts=d.accounts.filter(a=>a.category===id), ids=new Set(accounts.map(a=>a.id));
    const entries=[];let bridges=0,receipts=0,images=0;
    for(const e of d.entries){
      const n=e.legs.reduce((sum,l)=>sum+Number(ids.has(l.account)),0);
      if(!n)continue;
      entries.push(e);
      if(n!==e.legs.length)bridges++;
      else images+=Number(!!e.photo);
      receipts+=Number(!!e.receipt);
    }
    return {category,accounts,ids,entries,bridges,receipts,images};
  }
  function stats(d,id){
    const x=scope(d,id);
    return {category:x.category,accounts:x.accounts.length,entries:x.entries.length,bridges:x.bridges,receipts:x.receipts,images:x.images};
  }
  function localizeArchive(closures,entries,cut){
    const selected=new Map(closures.map(c=>[closureKey(c),c]));
    // Keep the selected accounts' effective archive, not the source's global year settings.
    const annual=new Map();
    for(const e of entries)if(e.day<=cut)for(const l of e.legs){
      const k=key(l.account,l.code);
      if(selected.get(k)?.day>cut)continue;
      if(!annual.has(k))annual.set(k,{account:l.account,code:l.code,day:cut,ids:[]});
      annual.get(k).ids.push(e.id);
    }
    for(const [k,c] of annual)selected.set(k,c);
    return [...selected.values()];
  }
  function create(d,id,{includePhotos=d.settings.backupPhotos,createdAt=Date.now()}={}){
    const s=scope(d,id),entries=[];
    let serial=0;
    for(const e of s.entries){
      const legs=e.legs.filter(l=>s.ids.has(l.account));
      if(legs.length!==e.legs.length){
        // Keep the actual selected signed posting, without guessing or copying the other side.
        const {id,day,time,created,due}=e;
        entries.push({id,day,time,created,memo:'',photo:'',legs,isolatedTransfer:true,...(due&&legs[0].minor>0?{due}:{})});
      }else entries.push({...e,photo:includePhotos?e.photo:''});
      serial=Math.max(serial,e.receipt?.number||0);
    }
    const codes=usedCodes(s.accounts,entries),annualThrough=L.yearCut(d);
    return validate({format,version,schema:L.schema,createdAt,includePhotos:!!includePhotos,demo:d.demo===true,category:s.category,annualThrough,
      accounts:s.accounts,entries,closures:d.closures.filter(c=>s.ids.has(c.account)),currencies:d.currencies.filter(c=>codes.has(c.code)),receiptSerial:serial});
  }
  function validate(raw){
    if(!is(raw)||raw.version!==version||raw.schema!==L.schema)err('صيغة نسخة التصنيف غير مدعومة. استخدم قيد 2.1 أو أحدث.');
    if(!Number.isSafeInteger(raw.createdAt)||raw.createdAt<0||raw.createdAt>253402300799999||typeof raw.includePhotos!=='boolean'||typeof raw.demo!=='boolean'||!Array.isArray(raw.currencies))err('بيانات نسخة التصنيف غير مكتملة.');
    // A snapshot of an empty category needs no currencies at all. A validation-only
    // placeholder never goes into the file or gets imported into the destination ledger.
    const empty=L.empty(),currencies=raw.currencies.length?raw.currencies:empty.currencies.slice(0,1);
    const x=L.validate({...empty,accounts:raw.accounts,entries:raw.entries,closures:raw.closures,currencies,categories:[raw.category],receiptSerial:raw.receiptSerial});
    const category=x.categories[0],codes=usedCodes(x.accounts,x.entries),through=raw.annualThrough===undefined?'':raw.annualThrough;
    if(typeof through!=='string'||(through&&(!L.validDay(through)||!through.endsWith('-12-31'))))err('تاريخ الأرشيف السنوي للتصنيف غير صالح.');
    if(x.accounts.some(a=>a.category!==category.id)||codes.size!==raw.currencies.length||x.currencies.some(c=>raw.currencies.length&&!codes.has(c.code))||
      (!raw.includePhotos&&x.entries.some(e=>e.photo)))err('تتضمن النسخة بيانات خارج نطاق التصنيف أو لا تطابق خياراتها.');
    let high=0;for(const e of x.entries)high=Math.max(high,e.receipt?.number||0);
    if((x.receiptSerial||0)!==high)err('تسلسل سندات نسخة التصنيف لا يطابق السندات الموجودة فيها.');
    return {format,version,schema:L.schema,createdAt:raw.createdAt,includePhotos:raw.includePhotos,demo:raw.demo,category,
      accounts:x.accounts,entries:x.entries,closures:x.closures,currencies:raw.currencies.length?x.currencies:[],
      ...(through&&x.entries.some(e=>e.day<=through)?{annualThrough:through}:{}),...(high?{receiptSerial:high}:{})};
  }
  function destination(d,category){
    const byId=d.categories.find(c=>c.id===category.id),byName=d.categories.find(c=>L.searchKey(c.name)===L.searchKey(category.name));
    if(byId&&byName&&byId!==byName)err('اسم التصنيف في النسخة مستخدم في تصنيف آخر. صحّح تعارض الأسماء قبل الاسترجاع.');
    return byId||byName;
  }
  function replaceScoped(old,affected,incoming,getKey=x=>x.id){
    const pending=new Map(incoming.map(x=>[getKey(x),x])),result=[];
    for(const x of old){
      const id=getKey(x);
      if(!affected.has(id)){result.push(x);continue;}
      if(pending.has(id)){result.push(pending.get(id));pending.delete(id);}
    }
    return result.concat([...pending.values()]);
  }
  function changes(old,incoming,getKey=x=>x.id){
    const next=new Map(incoming.map(x=>[getKey(x),x]));
    let removed=0,updated=0;
    for(const item of old){
      const k=getKey(item);
      if(!next.has(k)){removed++;continue;}
      if(!same(item,next.get(k)))updated++;
      next.delete(k);
    }
    return {removed,updated,added:next.size};
  }
  const hasChanges=c=>c.removed+c.updated+c.added>0;
  function net(entries,ids){
    const m=new Map();
    for(const e of entries)for(const l of e.legs)if(ids.has(l.account))m.set(l.code,(m.get(l.code)||0)+l.minor);
    return m;
  }
  function bridgeMatches(current,copy,leg){
    const l=copy?.legs[0];
    return copy?.isolatedTransfer&&l.account===leg.account&&l.code===leg.code&&l.minor===leg.minor&&
      copy.day===current.day&&copy.time===current.time&&copy.created===current.created&&
      (leg.minor<0||(copy.due||'')===(current.due||''));
  }
  function plan(d,raw){
    const incoming=validate(raw);
    if(incoming.demo!==d.demo)err(incoming.demo?'هذه نسخة تجريبية. لا يمكن استرجاعها في دفتر حقيقي.':'الدفتر الحالي تجريبي. ابدأ دفترًا حقيقيًا قبل استرجاع هذا التصنيف.');
    const target=destination(d,incoming.category), id=target?.id||incoming.category.id;
    const before=target?scope(d,id):{accounts:[],entries:[],ids:new Set(),receipts:0,images:0};
    const outside=d.accounts.filter(a=>!before.ids.has(a.id)),outsideIds=new Set(outside.map(a=>a.id)),outsideNames=new Set(outside.map(a=>L.searchKey(a.name)));
    for(const a of incoming.accounts)if(outsideIds.has(a.id)||outsideNames.has(L.searchKey(a.name)))err('يوجد حساب من النسخة في تصنيف آخر أو بلا تصنيف. لن يُنقل أو يُستبدل أي حساب خارج النطاق.');
    const sourceEntries=mapIds(incoming.entries),oldScoped=new Set(before.entries.map(e=>e.id));
    const oldClosures=d.closures.filter(c=>before.ids.has(c.account)),outsideClosures=d.closures.filter(c=>!before.ids.has(c.account));
    const year=L.yearCut(d),localArchive=!!incoming.annualThrough&&incoming.annualThrough>year;
    const restoredClosures=localArchive?localizeArchive(incoming.closures,incoming.entries,incoming.annualThrough):incoming.closures;
    const oldLocked=lockedIds(d.closures),newLocked=lockedIds(outsideClosures.concat(restoredClosures));
    const outsideReceiptNumbers=new Set(),kept=new Map(),problems=[];
    let conflictCount=0;
    for(const e of d.entries){
      if(!oldScoped.has(e.id)){
        if(sourceEntries.has(e.id))err('إحدى الحركات في النسخة تحمل معرّف حركة خارج التصنيف. لم يُستبدل أي سجل.');
        if(e.receipt)outsideReceiptNumbers.add(e.receipt.number);
        continue;
      }
      const leg=e.legs.find(l=>before.ids.has(l.account));
      if(e.legs.length!==2||e.legs.every(l=>before.ids.has(l.account)))continue;
      const equal=bridgeMatches(e,sourceEntries.get(e.id),leg);
      const lockDiff=e.day>year&&oldLocked.has(e.id)!==newLocked.has(e.id);
      if(equal&&!lockDiff)kept.set(e.id,e);
      else{
        conflictCount++;
        if(problems.length<5)problems.push({day:e.day,code:leg.code,reason:!equal?'التحويل غير مطابق للنسخة أو غير موجود فيها':'ستتغير حالة أرشفة التحويل'});
      }
    }
    if(conflictCount){
      const error=new Error('تعذّر الاسترجاع لأن هناك تحويلات مرتبطة بتصنيفات أخرى لن تبقى كما هي. لم يتغير شيء.');
      error.bridges={count:conflictCount,examples:problems};throw error;
    }
    for(const e of incoming.entries)if(e.receipt&&outsideReceiptNumbers.has(e.receipt.number))err(`رقم سند القبض ${L.receiptNumber(e.receipt.number)} مستخدم خارج التصنيف. لن يُعاد ترقيمه أو استبداله تلقائيًا.`);
    const oldCodes=new Map(d.currencies.map(c=>[c.code,c]));
    const addedCurrencies=incoming.currencies.filter(c=>!oldCodes.has(c.code));
    const differingCurrencies=incoming.currencies.filter(c=>oldCodes.has(c.code)&&!same(oldCodes.get(c.code),c)).map(c=>c.code);
    const accounts=incoming.accounts.map(a=>({...a,category:id})),entries=incoming.entries.map(e=>kept.get(e.id)||e),newIds=new Set(accounts.map(a=>a.id));
    const category={...incoming.category,id};
    const categoryChange=!target||!same(target,category);
    const accountChanges=changes(before.accounts,accounts),entryChanges=changes(before.entries,entries),closureChanges=changes(oldClosures,restoredClosures,closureKey);
    const next=L.validate({...d,categories:target?d.categories.map(c=>c.id===id?category:c):[...d.categories,category],
      accounts:replaceScoped(d.accounts,before.ids,accounts),entries:replaceScoped(d.entries,oldScoped,entries),
      closures:replaceScoped(d.closures,new Set(oldClosures.map(closureKey)),restoredClosures,closureKey),
      currencies:[...d.currencies,...addedCurrencies],receiptSerial:Math.max(d.receiptSerial||0,incoming.receiptSerial||0)});
    const oldNet=net(before.entries,before.ids),newNet=net(entries,newIds),oldDependencies=usedCodes(before.accounts,[]);
    const currencyTotals=next.currencies.filter(c=>oldNet.has(c.code)||newNet.has(c.code)).map(c=>({code:c.code,name:c.name,before:oldNet.get(c.code)||0,after:newNet.get(c.code)||0}));
    const standalone=incoming.entries.filter(e=>e.isolatedTransfer&&!kept.has(e.id)).length;
    const removedImages=before.entries.reduce((count,e)=>count+Number(!!e.photo&&!(kept.get(e.id)||sourceEntries.get(e.id))?.photo),0);
    return {next,incoming,category,target,before:{accounts:before.accounts,entries:before.entries,currencies:d.currencies.filter(c=>oldDependencies.has(c.code)||oldNet.has(c.code)),receipts:before.receipts,images:before.images},
      accountChanges,entryChanges,closureChanges,currencyTotals,removedImages,kept:kept.size,standalone,localArchive,outsideAccounts:outside.length,addedCurrencies,differingCurrencies,
      changed:categoryChange||hasChanges(accountChanges)||hasChanges(entryChanges)||hasChanges(closureChanges)||!!addedCurrencies.length};
  }
  return {format,is,create,validate,stats,plan};
});
