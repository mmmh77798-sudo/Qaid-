'use strict';
/* All shared-ledger reads and writes pass through category policy on the server. */
const L=require('../app/ledger.js');
const C=require('../app/collections-model.js');
const {randomUUID}=require('node:crypto');
const actions=Object.freeze({
  view:'عرض الحسابات والحركات', addMovement:'إضافة حركات وقبض', editMovement:'تعديل الحركات', deleteMovement:'حذف الحركات',
  addAccount:'إضافة حسابات', editAccount:'تعديل الحسابات', deleteAccount:'حذف الحسابات الفارغة',
  reports:'عرض التقارير', exportCsv:'تنزيل تقارير CSV', followup:'تسجيل متابعة التحصيل',
});
const keys=Object.freeze(Object.keys(actions)), token=()=>randomUUID();
const maxDocument=20*1024*1024;
class Problem extends Error{constructor(status,message,code=''){super(message);this.status=status;this.code=code;}}
const fail=(status,msg,code='')=>{throw new Problem(status,msg,code);};
const forbidden=()=>fail(403,'لا تملك صلاحية لهذا الإجراء.','forbidden');
const missing=()=>fail(404,'السجل غير متاح.','not-found');
const stale=()=>fail(409,'تغيّرت البيانات على جهاز آخر. حدّث الصفحة وراجع التغيير ثم أعد المحاولة.','stale');
function object(x,allowed){
  if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).some(k=>!allowed.includes(k)))fail(400,'الطلب يحتوي على حقول غير صالحة.');
  return x;
}
function text(v,max,{required=false,min=0}={}){
  if(typeof v!=='string'||v.length>max||v.trim().length<min||required&&!v.trim())fail(400,'أكمل الحقول المطلوبة ضمن الطول المسموح.');
  return v.trim();
}
function checkedDay(d){if(!L.validDay(d))fail(400,'اختر تاريخًا صحيحًا.');return d;}
function owner(actor){if(!actor.owner)forbidden();}
const catList=d=>[...d.categories,{id:'',name:'بلا تصنيف',color:'sky'}];
function grants(raw,d){
  if(!Array.isArray(raw)||raw.length>d.categories.length+1)fail(400,'قائمة صلاحيات التصنيفات غير صالحة.');
  const cats=new Set(catList(d).map(c=>c.id)),seen=new Set(),rules=[];
  for(const value of raw){
    const {category,allow}=object(value,['category','allow']);
    if(!cats.has(category)||seen.has(category)||!Array.isArray(allow)||allow.length>keys.length||allow.some(x=>!keys.includes(x))||new Set(allow).size!==allow.length)fail(400,'توجد صلاحية أو تصنيف غير معروف أو مكرر.');
    if(allow.length&&!allow.includes('view'))fail(400,'فعّل عرض التصنيف قبل منح صلاحيات أخرى فيه.');
    if(allow.includes('exportCsv')&&!allow.includes('reports'))fail(400,'التصدير يتطلب صلاحية عرض التقارير للتصنيف نفسه.');
    if(allow.includes('followup')&&!allow.includes('reports'))fail(400,'متابعة التحصيل تتطلب عرض التقارير للتصنيف نفسه.');
    seen.add(category);if(allow.length)rules.push({category,allow:keys.filter(k=>allow.includes(k))});
  }
  return rules;
}
function access(d,actor){
  const rules=new Map(actor.grants?.map(x=>[x.category,new Set(x.allow)]));
  const cats=new Map(catList(d).map(c=>[c.id,c]));
  const accounts=new Map(d.accounts.map(a=>[a.id,a]));
  const can=(cat,act)=>cats.has(cat)&&(actor.owner||rules.get(cat)?.has(act)===true);
  const allow=cat=>keys.filter(k=>can(cat,k));
  const account=(id,act='view')=>{
    const a=accounts.get(id);
    if(!a||!can(a.category,'view'))missing();
    if(!can(a.category,act))forbidden();
    return a;
  };
  const ownsLeg=(l,act)=>{const a=accounts.get(l.account);return a&&can(a.category,act);};
  const entry=(id,act)=>{
    const e=d.entries.find(x=>x.id===id);
    if(!e||!e.legs.some(l=>ownsLeg(l,'view')))missing();
    // Mutating a bridge needs the permission for both sides, even if only one is visible.
    if(!e.legs.every(l=>ownsLeg(l,act)))forbidden();
    return e;
  };
  return {accounts,cats,can,allow,account,entry,ownsLeg};
}
const publicUser=u=>({id:u.id,login:u.login,name:u.name,owner:u.owner,enabled:u.enabled,mustChange:u.mustChange,version:u.version,grants:u.grants,mfa:!!u.mfa});
function team(s,u,q){
  owner(u);
  if(q.has('user')){
    const id=q.get('user'),row=s.users.find(x=>x.id===id&&!x.owner);if(!row)missing();
    return {user:publicUser(row)};
  }
  const compact=x=>{const {grants,...user}=publicUser(x);return {...user,scopeCount:grants.length};};
  return {me:compact(u),actions,categories:catList(s.ledger).map(({id,name})=>({id,name})),users:s.users.filter(x=>!x.owner).map(compact)};
}
const summary=(d,k)=>{if(!d.currencies.some(c=>c.code===k))fail(400,'اختر عملة معروفة.');return k;};
const codeOf=(d,q)=>summary(d,q.get('code')||d.settings.defaultCode);
const locks=d=>{const set=new Set();for(const c of d.closures)for(const id of c.ids)set.add(id);const cut=L.yearCut(d);return e=>set.has(e.id)||e.day<=cut;};
function desk(s,u,q){
  const d=s.ledger,a=access(d,u),code=codeOf(d,q),balances=L.balances(d,code);
  const allMovements=new Set();for(const e of d.entries)for(const l of e.legs)allMovements.add(l.account);
  const categories=catList(d).filter(c=>a.can(c.id,'view')).map(c=>({...c,allow:a.allow(c.id)}));
  const accounts=d.accounts.filter(x=>a.can(x.category,'view')).map(x=>({id:x.id,name:x.name,category:x.category,phone:x.phone,note:x.note,
    ...balances.get(x.id),edit:a.can(x.category,'editAccount'),remove:a.can(x.category,'deleteAccount')&&!allMovements.has(x.id),post:a.can(x.category,'addMovement')}));
  const totals=L.totals(new Map(accounts.map(a=>[a.id,a])));
  return {version:s.bookVersion,me:publicUser(u),code,currencies:d.currencies,categories,accounts,totals,today:L.localDay(),...(u.owner?{importable:s.users.length===1&&!s.imported&&!d.accounts.length&&!d.entries.length&&!d.years.length&&!(d.activity?.length)&&!(d.receiptSerial||0)}:{})};
}
function filters(d,a,q,act='view'){
  const category=q.get('category'),id=q.get('account')||'',code=codeOf(d,q),from=q.get('from')||'',to=q.get('to')||'';
  if(category!==null&&!a.cats.has(category))missing();
  if(category!==null&&!a.can(category,'view'))missing();
  if(category!==null&&!a.can(category,act))forbidden();
  const acc=id?a.account(id,act):null;
  if(from)checkedDay(from);if(to)checkedDay(to);if(from&&to&&from>to)fail(400,'تاريخ البداية يجب أن يسبق تاريخ النهاية.');
  return {category,account:acc,code,from,to,selected:x=>(!acc||acc.id===x.id)&&(category===null||x.category===category)&&a.can(x.category,act)};
}
function movements(s,u,q){
  const d=s.ledger,a=access(d,u),f=filters(d,a,q),locked=locks(d),query=L.searchKey(text(q.get('q')||'',140));
  const offset=Math.max(0,Math.min(60000,Number(q.get('offset'))||0));
  if(!Number.isInteger(offset))fail(400,'صفحة غير صالحة.');
  const rows=[];
  for(const e of d.entries){
    if((f.from&&e.day<f.from)||(f.to&&e.day>f.to)||e.legs[0].code!==f.code)continue;
    const picked=e.legs.filter(l=>f.selected(a.accounts.get(l.account)));if(!picked.length)continue;
    const visible=e.legs.filter(l=>a.ownsLeg(l,'view')),partial=visible.length!==e.legs.length;
    const legs=visible.map(l=>({...l,name:a.accounts.get(l.account).name}));
    const memo=partial?'':e.memo;
    if(query&&!L.searchKey([memo,e.day,...legs.map(l=>`${l.name} ${L.inputDecimal(l.minor)} ${L.inputDecimal(Math.abs(l.minor))}`)].join(' ')).includes(query))continue;
    rows.push({id:e.id,day:e.day,time:e.time,order:e.created,memo,legs,kind:e.receipt?'receipt':partial||e.isolatedTransfer?'isolated':e.legs.length===2?'transfer':e.legs[0].minor>0?'credit':'debit',
      minor:picked.length===2?Math.abs(picked[0].minor):picked[0].minor,due:visible.some(l=>l.minor>0)?e.due||'':'',
      ...(e.receipt?{receipt:e.receipt}:{}),locked:locked(e),edit:!locked(e)&&e.legs.every(l=>a.ownsLeg(l,'editMovement')),
      remove:!locked(e)&&e.legs.every(l=>a.ownsLeg(l,'deleteMovement'))});
  }
  rows.sort((x,y)=>y.day.localeCompare(x.day)||y.time.localeCompare(x.time)||y.order-x.order||x.id.localeCompare(y.id));
  // Creation timestamps are needed for ordering only, not sent for hidden/visible counterparts.
  return {version:s.bookVersion,total:rows.length,offset,limit:40,rows:rows.slice(offset,offset+40).map(({order,...row})=>row)};
}
function report(s,u,q,exporting=false){
  const d=s.ledger,a=access(d,u),act=exporting?'exportCsv':'reports';
  if(![...a.cats].some(([id])=>a.can(id,act)))forbidden();
  const f=filters(d,a,q,act);
  const rows=new Map(d.accounts.filter(f.selected).map(x=>[x.id,{name:x.name,category:a.cats.get(x.category).name,credit:0,debit:0,balance:0,count:0}]));
  for(const e of d.entries){
    if(e.legs[0].code!==f.code||(f.from&&e.day<f.from)||(f.to&&e.day>f.to))continue;
    for(const l of e.legs){const row=rows.get(l.account);if(!row)continue;
      if(l.minor>0)row.credit+=l.minor;else row.debit-=l.minor;row.balance+=l.minor;row.count++;
    }
  }
  const list=[...rows.values()].sort((x,y)=>x.name.localeCompare(y.name,'ar'));
  const totals=list.reduce((t,r)=>({credit:t.credit+r.credit,debit:t.debit+r.debit,balance:t.balance+r.balance,count:t.count+r.count}),{credit:0,debit:0,balance:0,count:0});
  return {code:f.code,rows:list,totals};
}
const agingStatus=Object.freeze({overdue:'متأخر',today:'مستحق اليوم',week:'خلال 7 أيام',later:'بعد 7 أيام',unscheduled:'بلا موعد'});
const agingFilters=Object.freeze({...agingStatus,followup:'متابعة مستحقة'});
const offsetOf=(q,limit=60000)=>{
  const n=Number(q.get('offset')||0);if(!Number.isInteger(n)||n<0||n>limit)fail(400,'صفحة غير صالحة.');return n;
};
function collection(s,u,q,mode='list'){
  const d=s.ledger,a=access(d,u),act=mode==='csv'?'exportCsv':'reports';
  if(![...a.cats].some(([id])=>a.can(id,act)))forbidden();
  const f=filters(d,a,q,act),today=L.localDay(),asOf=q.get('asOf')||today;
  checkedDay(asOf);if(asOf>today)fail(400,'اختر تاريخ رصد لا يتجاوز اليوم.');
  if(mode==='detail'&&!f.account)fail(400,'اختر حسابًا لعرض خطة التحصيل.');
  const relevant=d.accounts.filter(f.selected),snap=C.snapshot({...d,accounts:relevant},f.code,asOf);
  const view=row=>({id:row.account.id,name:row.account.name,category:row.account.category,categoryName:a.cats.get(row.account.category).name,
    firstDue:row.firstDue,oldestDays:row.oldestDays,followup:asOf===today?row.followup:null,post:asOf===today&&a.can(row.account.category,'addMovement'),manage:asOf===today&&a.can(row.account.category,'followup'),
    ...Object.fromEntries(['total',...Object.keys(agingStatus),...C.bands.map(x=>x[0])].map(k=>[k,row[k]]))});
  if(mode==='detail'){
    if(!f.selected(f.account))missing();
    const selected=snap.index.get(f.account.id),offset=offsetOf(q),limit=32;
    const ids=new Map(d.entries.map(e=>[e.id,e]));
    const items=(selected?.items||[]).slice(offset,offset+limit).map(item=>{
      const e=ids.get(item.id),hide=e.legs.length===2&&!e.legs.every(l=>a.ownsLeg(l,'reports'));
      return {...item,memo:hide?'':item.memo};
    });
    const row=selected?view(selected):view({account:f.account,total:0,overdue:0,today:0,week:0,later:0,unscheduled:0,d30:0,d60:0,d90:0,d91:0,firstDue:'',oldestDays:0,followup:f.account.followups?.[f.code]||null});
    return {version:s.bookVersion,code:f.code,asOf,today,row,items,total:selected?.items.length||0,offset,limit};
  }
  const status=q.get('state')||'',key=L.searchKey(text(q.get('q')||'',140));
  if(status&&!Object.hasOwn(agingFilters,status))fail(400,'اختر حالة تحصيل صالحة.');
  if(status==='followup'&&asOf!==today)fail(400,'المتابعات المستحقة تعرض حالة اليوم فقط.');
  const rows=snap.rows.filter(r=>C.matches(r,status,today)&&(!key||L.searchKey(r.account.name).includes(key)));
  if(status==='followup')rows.sort((x,y)=>x.followup.day.localeCompare(y.followup.day)||C.compare(x,y));
  const sums=C.summary(rows),offset=mode==='csv'?0:offsetOf(q),limit=32;
  const slice=mode==='csv'?rows:rows.slice(offset,offset+limit);
  return {version:s.bookVersion,code:f.code,asOf,today,rows:slice.map(view),sums,total:rows.length,offset,limit};
}
function auditPage(s,u,q){
  owner(u);
  const type=text(q.get('type')||'',50),key=L.searchKey(text(q.get('q')||'',140)),from=q.get('from')||'',to=q.get('to')||'';
  if(from)checkedDay(from);if(to)checkedDay(to);if(from&&to&&from>to)fail(400,'تاريخ البداية يجب أن يسبق النهاية.');
  const offset=offsetOf(q,1000),limit=25;
  const rows=s.audit.filter(r=>{
    if(type&&r.kind!==type)return false;
    if(from||to){const d=L.localDay(new Date(r.at));if((from&&d<from)||(to&&d>to))return false;}
    return !key||L.searchKey(`${r.actor} ${r.subject}`).includes(key);
  });
  return {rows:rows.slice(offset,offset+limit),total:rows.length,offset,limit};
}
const trail=(d,e)=>e?{day:e.day,time:e.time,memo:e.memo,due:e.due||'',image:!!e.photo,
  receipt:e.receipt?{number:e.receipt.number,method:e.receipt.method}:null,
  legs:e.legs.map(l=>({name:d.accounts.find(a=>a.id===l.account)?.name||'حساب',code:l.code,minor:l.minor}))}:null;
const validateLedger=d=>{try{return L.validate(d);}catch(e){fail(422,e.message||'لم تُقبل بيانات الدفتر.','ledger');}};
function ledgerAction(fn){try{return fn();}catch(e){if(e instanceof Problem)throw e;fail(422,e.message||'تعذّر تنفيذ التغيير.','ledger');}}
function log(s,u,kind,subject='',versions=null){
  s.audit=[{id:token(),at:Date.now(),actor:u.name,actorId:u.id,kind,subject,...(versions?{versions}:{})},...s.audit].slice(0,1000);
}
function changeBook(s,u,action,id,body){
  const d=L.stateClone(s.ledger),a=access(d,u);let record,subject='',versions=null;
  const simple=form=>object(form,['version','name','phone','note','category']);
  switch(action){
    case 'account-add':case 'account-edit':{
      simple(body);
      const previous=action==='account-edit'?a.account(id,'editAccount'):null;
      const category=previous?.category??body.category;
      if(!a.can(category,'view'))missing();
      if(previous&&body.category!==undefined&&body.category!==category)fail(403,'لا يمكن نقل الحساب بين التصنيفات من هذه الشاشة.');
      if(!previous&&!a.can(category,'addAccount'))forbidden();
      const name=text(body.name,90,{required:true});
      if(!u.owner&&d.accounts.some(other=>other.id!==previous?.id&&!a.can(other.category,'view')&&L.searchKey(other.name)===L.searchKey(name)))fail(422,'اسم الحساب غير متاح. اختر اسمًا مختلفًا.');
      record=ledgerAction(()=>L.addAccount(d,{id:previous?.id,name,category,phone:text(body.phone??'',48),note:text(body.note??'',400)}));
      subject=name;break;
    }
    case 'account-delete':{
      object(body,['version']);record=a.account(id,'deleteAccount');subject=record.name;
      if(d.entries.some(e=>e.legs.some(l=>l.account===id)))fail(422,'لا يُحذف حساب له حركات. احفظ سجلاته أولًا.');
      ledgerAction(()=>L.removeAccount(d,id));break;
    }
    case 'movement-add':case 'movement-edit':{
      const editing=action==='movement-edit';
      object(body,editing?['version','day','time','amount','memo','due']:['version','kind','account','from','to','code','day','time','amount','memo','due','method','reference','target']);
      const previous=editing?a.entry(id,'editMovement'):null;
      const kind=previous?(previous.receipt?'receipt':previous.legs.length===2?'transfer':previous.legs[0].minor>0?'credit':'debit'):body.kind;
      if(!['credit','debit','transfer','receipt'].includes(kind))fail(400,'اختر نوع حركة صالحًا.');
      const fields={id:previous?.id,day:checkedDay(body.day),time:text(body.time??'',5),amount:text(body.amount,28,{required:true}),memo:text(body.memo??'',600),code:summary(d,previous?.legs[0].code??body.code),due:body.due??''};
      if(fields.due)checkedDay(fields.due);else if(fields.due!=='')fail(400,'تاريخ الاستحقاق غير صالح.');
      const required=editing?'editMovement':'addMovement';
      if(kind==='transfer'){
        fields.from=previous?.legs[0].account??body.from;fields.to=previous?.legs[1].account??body.to;
        subject=[a.account(fields.from,required).name,a.account(fields.to,required).name].join(' ← ');
      }else{fields.account=previous?.legs[0].account??body.account;subject=a.account(fields.account,required).name;}
      if(kind==='receipt'){
        const receipt=previous?.receipt??{method:body.method,reference:text(body.reference??'',90),target:text(body.target??'',80)};
        if(receipt.target&&!d.entries.some(e=>e.id===receipt.target&&e.legs.some(l=>l.account===fields.account&&l.code===fields.code&&l.minor>0)))fail(422,'قيد التخصيص غير متاح في الحساب والعملة المختارين.');
        record=ledgerAction(()=>C.saveReceipt(d,{...fields,receipt}));
      }else record=ledgerAction(()=>L.saveEntry(d,{...fields,kind}));
      subject+=` · ${fields.code} ${L.inputDecimal(Math.abs(record.legs[0].minor))}`;versions={before:trail(d,previous),after:trail(d,record)};break;
    }
    case 'movement-delete':{
      object(body,['version']);record=a.entry(id,'deleteMovement');subject=record.legs.map(l=>a.accounts.get(l.account).name).join(' · ');
      versions={before:trail(d,record),after:null};ledgerAction(()=>L.removeEntry(d,id));break;
    }
    case 'collection-followup':{
      object(body,['version','code','kind','day','note']);record=a.account(id,'followup');
      if(!a.can(record.category,'reports'))forbidden();
      const code=summary(d,body.code),kind=body.kind,day=body.day??'',note=text(body.note??'',260);
      if(kind!==''&&!L.followupKinds.includes(kind))fail(400,'اختر حالة متابعة صالحة.');
      if(day)checkedDay(day);else if(day!=='')fail(400,'تاريخ المتابعة غير صالح.');
      ledgerAction(()=>L.setFollowup(d,id,code,kind?{kind,day,note,at:Date.now()}:null));
      subject=record.name+' · '+code+(kind?'':' · إزالة المتابعة');break;
    }
    case 'category-add':case 'category-edit':{
      owner(u);object(body,['version','name']);const name=text(body.name,50,{required:true});
      if(action==='category-add'){record={id:token(),name,color:L.colors[d.categories.length%L.colors.length]};d.categories.push(record);}
      else {record=d.categories.find(c=>c.id===id);if(!record)missing();record.name=name;}
      subject=name;break;
    }
    default:missing();
  }
  if(body.version!==s.bookVersion)stale();
  s.ledger=validateLedger(d);s.bookVersion=token();log(s,u,action,subject,versions);
  return {id:record.id,version:s.bookVersion};
}
function importBook(s,u,b){
  owner(u);object(b,['version','confirm','ledger']);
  if(b.confirm!==true)fail(400,'أكّد نسخ محتوى الدفتر إلى الخادم.');
  if(b.version!==s.bookVersion)stale();
  const old=s.ledger;
  if(s.imported||old.accounts.length||old.entries.length||old.years.length||old.activity?.length||old.receiptSerial||s.users.length!==1)fail(409,'استيراد الدفتر الكامل متاح قبل تسجيل الحسابات أو فتح مستخدمين فرعيين فقط.');
  if(b.ledger?.format==='qayd-category-backup'||!L.supportsSchema(b.ledger?.schema)||b.ledger?.demo===true)fail(422,'اختر نسخة قيد كاملة ببيانات حقيقية، لا نسخة تصنيف أو بيانات تجربة.');
  s.ledger=validateLedger(b.ledger);s.imported=true;s.bookVersion=token();log(s,u,'book-import',`${s.ledger.accounts.length} حساب · ${s.ledger.entries.length} حركة`);
  return {version:s.bookVersion};
}
function fresh(ledger=L.empty()){
  return {schema:1,bookVersion:token(),imported:false,ledger:validateLedger(ledger),users:[],audit:[]};
}
module.exports={Problem,fail,forbidden,missing,owner,stale,actions,keys,maxDocument,object,text,grants,token,desk,team,movements,report,collection,agingStatus,agingFilters,auditPage,changeBook,importBook,log,publicUser,fresh};
