'use strict';
/* Append an owner-reviewed category as a new private scope, never a replacement. */
const {createHash}=require('node:crypto');
const P=require('./policy.cjs');
const L=require('../app/ledger.js');
const CB=require('../app/category-backup.js');
const maxCopy=14*1024*1024, maxTransfers=200;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const keyed=xs=>xs.slice().sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
const conflict=(message,code='transfer-conflict')=>P.fail(409,message,code);

function privateCopy(raw){
  let x;try{x=CB.validate(raw);}catch(e){P.fail(422,e.message||'ملف التصنيف غير صالح.','transfer-copy');}
  if(x.demo||x.includePhotos||x.entries.some(e=>e.photo)||!x.accounts.length)P.fail(422,'اختر تصنيفًا حقيقيًا فيه حسابات، دون صور مرفقة.','transfer-copy');
  if(Buffer.byteLength(JSON.stringify(x))>maxCopy)P.fail(413,'ملف التصنيف أكبر من حد النقل (14 ميغابايت قبل التشفير).','transfer-size');
  // Ignore packaging time and display metadata. Copying the same ledger again
  // under a new category name is not a new set of financial postings.
  const fingerprint=hash([keyed(x.accounts).map(a=>a.id),
    keyed(x.entries).map(e=>[e.id,e.day,e.legs,e.receipt?.number||0])]);
  return {x,fingerprint};
}
function totals(x){
  const codes=new Map(x.currencies.map(c=>[c.code,new Map()]));
  for(const e of x.entries)for(const l of e.legs){const a=codes.get(l.code);a.set(l.account,(a.get(l.account)||0)+l.minor);}
  return [...codes].sort(([a],[b])=>a.localeCompare(b)).map(([code,accounts])=>{
    let credit=0,debit=0;for(const n of accounts.values())if(n>0)credit+=n;else debit-=n;
    return {code,credit,debit,net:credit-debit};
  });
}
function scopedClosures(x,mapped,remap){
  const map=new Map(x.closures.map(c=>[`${c.account}:${c.code}`,{...c,ids:c.ids.map(remap)}]));
  // The phone's annual cut must not be applied to the existing shared book.
  // Translate it to closures on only the imported accounts and currencies.
  if(x.annualThrough){
    const annual=new Map();
    for(const e of mapped)if(e.day<=x.annualThrough)for(const {account,code} of e.legs){
      const k=`${account}:${code}`;if(map.get(k)?.day>x.annualThrough)continue;
      if(!annual.has(k))annual.set(k,{account,code,day:x.annualThrough,ids:[]});
      annual.get(k).ids.push(e.id);
    }
    for(const [k,v] of annual)map.set(k,v);
  }
  return [...map.values()];
}
function plan(s,raw,name){
  name=P.text(name,50,{required:true});
  const key=L.searchKey(name);
  if(!key||/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name))P.fail(400,'اكتب اسم تصنيف واضحًا دون أحرف تحكم.');
  const {x,fingerprint}=privateCopy(raw),d=s.ledger,history=s.transfers||[];
  if(history.some(t=>t.digest===fingerprint))conflict('نُقلت هذه السجلات من قبل. راجع التصنيف الموجود بدل تكرار النقل.','transfer-duplicate');
  if(d.categories.some(c=>L.searchKey(c.name)===key)||key===L.searchKey('بلا تصنيف'))conflict('هذا الاسم مستخدم. اختر اسمًا جديدًا للتصنيف؛ النقل لا يستبدل أي تصنيف.');
  if(history.length>=maxTransfers||d.categories.length>=200)conflict('بلغ الدفتر الحد المسموح للتصنيفات.');
  const accountIds=new Set(d.accounts.map(a=>a.id)),accountNames=new Set(d.accounts.map(a=>L.searchKey(a.name))),entries=new Set(d.entries.map(e=>e.id));
  if(x.accounts.some(a=>accountIds.has(a.id)||accountNames.has(L.searchKey(a.name))))conflict('أحد الحسابات بالمعرّف أو الاسم نفسه موجود في الدفتر المشترك. لم يُنقل أو يُدمج أي حساب.','transfer-account');
  const serverCut=L.yearCut(d);
  for(const e of x.entries){
    if(e.day<=serverCut)conflict(`توجد حركة ضمن سنة مغلقة في الدفتر المشترك (حتى ${serverCut}). لا يضيف النقل قيودًا إلى فترة مغلقة.`, 'transfer-closed-year');
    if(entries.has(e.id))conflict('إحدى الحركات موجودة بالفعل في الدفتر المشترك. لن تُستبدل أو تُكرر.','transfer-entry');
    if(e.receipt&&e.receipt.number<=(d.receiptSerial||0))conflict(`رقم سند القبض ${L.receiptNumber(e.receipt.number)} ضمن تسلسل الدفتر المشترك. لن يُعاد الترقيم أو الاستبدال.`, 'transfer-receipt');
  }
  const id=P.token();
  // Give an isolated posting a stable, distinct ID so that a later transfer of
  // the other category can preserve its own posting without recreating a bridge.
  const remapped=new Map(x.entries.filter(e=>e.isolatedTransfer).map(e=>[e.id,'side-'+hash([e.id,e.legs[0].account])]));
  const remap=id=>remapped.get(id)||id;
  const newEntries=x.entries.map(e=>({...e,id:remap(e.id),...(e.isolatedTransfer?{memo:'',photo:''}:{}),
    ...(e.receipt?.target?{receipt:{...e.receipt,target:remap(e.receipt.target)}}:{})}));
  if(newEntries.some(e=>entries.has(e.id)))conflict('إحدى الحركات أو أطراف التحويل موجودة بالفعل في الدفتر المشترك.','transfer-entry');
  const oldCodes=new Map(d.currencies.map(c=>[c.code,c]));
  // Currency options are global in the shared desk. Only expose a new code,
  // not its phone-specific free-text name/symbol, even to staff.
  const added=x.currencies.filter(c=>!oldCodes.has(c.code)).map(({code})=>({code,name:code,symbol:code}));
  const differing=x.currencies.filter(c=>oldCodes.has(c.code)&&(oldCodes.get(c.code).name!==c.name||oldCodes.get(c.code).symbol!==c.symbol)).map(c=>c.code);
  const closures=scopedClosures(x,newEntries,remap);
  let next;
  try{next=L.validate({...d,categories:[...d.categories,{...x.category,id,name}],
    accounts:[...d.accounts,...x.accounts.map(a=>({...a,category:id}))],entries:[...d.entries,...newEntries],
    closures:[...d.closures,...closures],currencies:[...d.currencies,...added],receiptSerial:Math.max(d.receiptSerial||0,x.receiptSerial||0)});}
  catch(e){P.fail(422,e.message||'تعذّر تجهيز التصنيف؛ لم تتغير البيانات.','transfer-copy');}
  if(Buffer.byteLength(JSON.stringify(next))>P.maxDocument)P.fail(422,'تتجاوز النسخة سعة الدفتر المشترك.','transfer-size');
  const locks=new Set();for(const c of closures)for(const entryId of c.ids)locks.add(entryId);
  return {fingerprint,next,summary:{id,name,source:x.category.name,accounts:x.accounts.length,movements:x.entries.length,
    receipts:x.entries.filter(e=>e.receipt).length,standalone:remapped.size,archived:locks.size,sourceCut:x.annualThrough||'',
    totals:totals(x),addedCodes:added.map(c=>c.code),differingCodes:differing,staffAccess:0}};
}
function backupIsRecent(snapshot,now=Date.now()){
  const s=snapshot.s,r=s.recoveryPrepared;
  return r?.revision===snapshot.seq&&r?.version===s.bookVersion&&Number.isSafeInteger(r.at)&&r.at<=now&&now-r.at<=2*60*60*1000;
}
function commit(snapshot,user,reviewed,confirmed,now=Date.now()){
  P.owner(user);
  if(confirmed!==true)P.fail(400,'أكّد حفظ نسخة استعادة خارج الاستضافة قبل النقل.','backup-confirm');
  if(!backupIsRecent(snapshot,now))conflict('نزّل ملف استعادة مشفّرًا للحالة الحالية واحفظه خارج الاستضافة، ثم راجع النقل مجددًا.','backup-first');
  const s={...snapshot.s,ledger:reviewed.next,transfers:[...(snapshot.s.transfers||[]),{category:reviewed.summary.id,digest:reviewed.fingerprint,at:now}],bookVersion:P.token()};
  P.log(s,user,'category-transfer',`${reviewed.summary.name} · ${reviewed.summary.accounts} حساب · ${reviewed.summary.movements} حركة`);
  return {s,result:{version:s.bookVersion,category:reviewed.summary.id,summary:reviewed.summary}};
}
module.exports={maxCopy,maxTransfers,plan,backupIsRecent,commit,uuid};
