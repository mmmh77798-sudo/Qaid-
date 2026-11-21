/* Qayd accounting model, shared by the browser and the Android build. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Ledger = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SCALE=1000, PRECISION=3, MAX=999999999999999; // exact thousandths
  const schema=2, supportsSchema=value=>value===1||value===schema;
  const builtin = Object.freeze([
    { code:'YER', name:'ريال يمني', symbol:'ر.ي' }, { code:'SAR', name:'ريال سعودي', symbol:'ر.س' },
    { code:'USD', name:'دولار أمريكي', symbol:'$' }
  ]);
  const colors = ['mint','indigo','amber','rose','sky','violet'];
  const groups = [ { id:'general', name:'عام', color:'sky' }, { id:'clients', name:'عملاء', color:'indigo' }, { id:'suppliers', name:'موردون', color:'mint' }, { id:'personal', name:'شخصي', color:'amber' } ];
  const err = msg => { throw new Error(msg); };
  const digits = s => String(s ?? '').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776));
  const searchKey = s => digits(s).normalize('NFKC').toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[٬,]/g,'').replace(/٫/g,'.').trim();
  const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const dateFromDay = day => new Date(day+'T12:00:00');
  const offset = (n, day=localDay()) => { const d=dateFromDay(day); d.setDate(d.getDate()+n); return localDay(d); };
  const localTime = (d=new Date()) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  const validTime = t=>typeof t==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t);
  const validDay = d => typeof d === 'string' && /^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$/.test(d) && Number.isFinite(dateFromDay(d).getTime()) && localDay(dateFromDay(d)) === d;
  const id = () => (typeof crypto === 'object' && crypto.getRandomValues)
    ? Array.from(crypto.getRandomValues(new Uint32Array(4)), n=>n.toString(36)).join('-')
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  function parseAmount(value) {
    let x = digits(value).trim().replace(/٫/g,'.');
    if (!/^(?:\d+|\d{1,3}(?:[,٬ ]\d{3})+)(?:\.\d{1,3})?$/.test(x)) err('أدخل مبلغًا موجبًا بثلاث منازل عشرية على الأكثر (مثال: 1,200.125).');
    const [whole,fraction=''] = x.replace(/[,٬ ]/g,'').split('.');
    if (whole.length>12) err('المبلغ أكبر من الحد المسموح.');
    const total = Number(whole)*SCALE+Number(fraction.padEnd(PRECISION,'0'));
    if (!Number.isSafeInteger(total) || total<=0 || total>MAX) err('أدخل مبلغًا موجبًا ضمن الحد المسموح.');
    return total;
  }
  const decimal = minor => `${minor<0?'-':''}${Math.floor(Math.abs(minor)/SCALE)}.${String(Math.abs(minor)%SCALE).padStart(PRECISION,'0')}`;
  const inputDecimal = minor => decimal(minor).replace(/\.0+$/,'').replace(/(\.\d{2})0$/,'$1');
  const limitText = (s,n,required=false) => {
    if (typeof s!=='string' || s.length>n || (required && !s.trim())) err('توجد قيمة نصية غير صالحة.');
    return s.trim();
  };
  const cleanId = s => {
    if (typeof s!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(s)) err('معرّف غير صالح.');
    return s;
  };
  const unique = (xs,message) => { const x=new Set(xs); if(x.size!==xs.length) err(message); return x; };
  const JPEG=/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]+={0,2}$/;
  function image(s) {
    if (s==null || s==='')return '';
    if(typeof s!=='string'||s.length>200023||(s.length-23)%4!==0||!JPEG.test(s))err('إحدى الصور غير صالحة أو كبيرة جدًا.');
    return s;
  }
  const periods=['day','week','month','year'];
  const defaultSettings=()=>({defaultCode:'YER',business:'',digits:'latin',words:false,transferDetails:true,
    profile:{address:'',phone:'',nameEn:'',addressEn:'',logo:'',confirmation:'أُقرّ بأنني راجعت الأرصدة أعلاه. تُذكر أي فروق أو ملاحظات قبل التوقيع.'},
    print:{profile:true,date:true,ascending:true,allCodes:false,footer:'',credit:'لي',debit:'عليّ'},
    notify:{intro:'',ending:'',credit:'عليك',debit:'لك',greet:false,channel:'none',quickAdded:true,date:false,transferDetails:false,whatsStatement:false,business:false,localAdd:false,reminders:true,prefix:'+967'},
    home:{transfer:true,currencies:true,totals:false,time:false,dark:false,alpha:false,period:'day'},backupPhotos:true
  });
  function checkSettings(prefs,codes,curr) {
    const d=defaultSettings(), p=prefs.profile||{}, t=prefs.print||{}, n=prefs.notify||{}, h=prefs.home||{};
    const text=(s,len,fallback='')=>limitText(s??fallback,len);
    const prefix=text(n.prefix,5,d.notify.prefix);
    if(!/^\+[1-9]\d{0,3}$/.test(prefix))err('بادئة الدولة يجب أن تكون مثل +967.');
    return {defaultCode:codes.has(prefs.defaultCode)?prefs.defaultCode:curr[0].code,business:text(prefs.business,75),digits:prefs.digits==='arabic'?'arabic':'latin',words:prefs.words===true,transferDetails:prefs.transferDetails!==false,
      profile:{address:text(p.address,140),phone:text(p.phone,48),nameEn:text(p.nameEn,90),addressEn:text(p.addressEn,140),logo:image(p.logo),confirmation:text(p.confirmation,650,d.profile.confirmation)},
      print:{profile:t.profile!==false,date:t.date!==false,ascending:t.ascending!==false,allCodes:t.allCodes===true,footer:text(t.footer,320),credit:text(t.credit,32,d.print.credit)||d.print.credit,debit:text(t.debit,32,d.print.debit)||d.print.debit},
      notify:{intro:text(n.intro,180),ending:text(n.ending,180),credit:text(n.credit,30,d.notify.credit)||d.notify.credit,debit:text(n.debit,30,d.notify.debit)||d.notify.debit,greet:n.greet===true,channel:['none','sms','wa','both'].includes(n.channel)?n.channel:'none',quickAdded:n.quickAdded!==false,date:n.date===true,transferDetails:n.transferDetails===true,whatsStatement:n.whatsStatement===true,business:n.business===true,localAdd:n.localAdd===true,reminders:n.reminders!==false,prefix},
      home:{transfer:h.transfer!==false,currencies:h.currencies!==false,totals:h.totals===true,time:h.time===true,dark:h.dark===true,alpha:h.alpha===true,period:periods.includes(h.period)?h.period:'day'},backupPhotos:prefs.backupPhotos!==false
    };
  }
  function empty(demo=false) {
    return {schema,demo,accounts:[],entries:[],closures:[],years:[],currencies:builtin.map(x=>({...x})),categories:groups.map(x=>({...x})),settings:defaultSettings(),lastBackup:null};
  }
  const limitDirections=['credit','debit','both'];
  function checkedLimit(rule,scale=1) {
    if(!rule||typeof rule!=='object'||Array.isArray(rule)||!limitDirections.includes(rule.direction)||
      !Number.isSafeInteger(rule.minor)||rule.minor<=0||rule.minor>Math.floor(MAX/scale))err('سقف الحساب غير صالح.');
    return {minor:rule.minor*scale,direction:rule.direction};
  }
  function setAccountLimit(data,id,code,rule=null) {
    const a=data.accounts.find(x=>x.id===id);
    if(!a||!data.currencies.some(x=>x.code===code))err('الحساب أو العملة غير موجودة.');
    if(rule){const limit=checkedLimit(rule);(a.limits??={})[code]=limit;}
    else if(a.limits){delete a.limits[code];if(!Object.keys(a.limits).length)delete a.limits;}
  }
  function limitStatus(account,code,balance) {
    const rule=account?.limits?.[code];if(!rule)return null;
    const used=rule.direction==='both'?Math.abs(balance):Math.max(0,rule.direction==='credit'?balance:-balance);
    return {rule,used,difference:rule.minor-used,reached:used>=rule.minor,exceeded:used>rule.minor};
  }
  const followupKinds=['contacted','promise','review'];
  const activityTypes=['entry-add','entry-edit','entry-delete','account-add','account-edit','account-delete','due','followup','account-close','account-open','year-close','year-open','category-restore'];
  const ACTIVITY_MAX=1000;
  const validTimestamp=at=>Number.isSafeInteger(at)&&at>=0&&at<=253402300799999;
  function checkedDue(due,day,positive) {
    if(due===undefined||due==='')return '';
    if(!positive||!validDay(due)||due<day)err('اختر تاريخ استحقاق صحيحًا لا يسبق تاريخ الحركة الموجبة.');
    return due;
  }
  function setDueDate(data,id,day) {
    const e=data.entries.find(x=>x.id===id);
    if(!e||!e.legs.some(l=>l.minor>0))err('الاستحقاق متاح للحركة الموجبة فقط.');
    const next=checkedDue(day,e.day,true);
    const old=e.due||'';
    if(next)e.due=next;else delete e.due;
    return old!==next;
  }
  function checkedFollowup(v) {
    if(!v||typeof v!=='object'||Array.isArray(v)||!followupKinds.includes(v.kind)||!validTimestamp(v.at)||
      typeof v.day!=='string'||(v.day&&!validDay(v.day)))err('بيانات متابعة التحصيل غير صالحة.');
    return {kind:v.kind,day:v.day,at:v.at,note:limitText(v.note??'',260)};
  }
  function setFollowup(data,id,code,rule=null) {
    const a=data.accounts.find(x=>x.id===id);
    if(!a||!data.currencies.some(x=>x.code===code))err('الحساب أو العملة غير موجودة.');
    if(rule){const entry=checkedFollowup(rule);(a.followups??={})[code]=entry;}
    else if(a.followups){delete a.followups[code];if(!Object.keys(a.followups).length)delete a.followups;}
  }
  function checkedActivity(x) {
    if(!x||typeof x!=='object'||!activityTypes.includes(x.type)||!validTimestamp(x.at))err('حدث سجل التغييرات غير صالح.');
    return {at:x.at,type:x.type,subject:limitText(x.subject,400,true),detail:limitText(x.detail,850)};
  }
  function recordActivity(data,{type,subject,detail='',at=Date.now()}) {
    const clean=(v,n)=>String(v).replace(/[\u0000-\u0009\u000b-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,' ').trim().slice(0,n);
    const event=checkedActivity({type,at,subject:clean(subject,400),detail:clean(detail,850)});
    const rows=data.activity??=[];
    rows.push(event);if(rows.length>ACTIVITY_MAX)rows.splice(0,rows.length-ACTIVITY_MAX);
  }
  const receiptMethods=Object.freeze(['cash','bank','wallet','check','other']);
  const RECEIPT_MAX=999999999;
  const receiptNumber=n=>String(n).padStart(6,'0');
  function checkedReceipt(value,legs) {
    if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isInteger(value.number)||value.number<1||value.number>RECEIPT_MAX||
      !receiptMethods.includes(value.method)||legs.length!==1||legs[0].minor>=0)err('سند القبض يتطلب قيد قبض وبيانات سند صالحة.');
    const reference=limitText(value.reference??'',90),target=value.target===undefined||value.target===''?'':cleanId(value.target);
    return {number:value.number,method:value.method,reference,...(target?{target}:{})};
  }
  function checkReceiptLinks(entries,entryMap,serial) {
    const numbers=new Set(),assigned=new Map();
    for(const e of entries){
      const r=e.receipt;if(!r)continue;
      if(r.number>serial||numbers.has(r.number))err('تسلسل سندات القبض غير صالح أو يحتوي رقمًا مكررًا.');
      numbers.add(r.number);
      if(!r.target)continue;
      const l=e.legs[0],target=entryMap.get(r.target),positive=target?.legs.find(x=>x.minor>0&&x.account===l.account&&x.code===l.code);
      if(!positive||target.day>e.day)err('قيد مرتبط بسند قبض مخصّص لا يطابق الحساب أو العملة أو التاريخ. ألغِ التخصيص أولًا.');
      const total=(assigned.get(r.target)||0)-l.minor;
      if(total>positive.minor)err('مجموع سندات القبض المخصّصة أكبر من مبلغ القيد. ألغِ التخصيص أو عدّل السند أولًا.');
      assigned.set(r.target,total);
    }
  }
  function clearReceiptTarget(data,id) {
    const e=data.entries.find(x=>x.id===id);
    if(!e?.receipt?.target)return false;
    delete e.receipt.target;return true;
  }
  function validate(raw) {
    if (!raw || !supportsSchema(raw.schema)) err('هذا الملف ليس نسخة قيد متوافقة.');
    // Previous backups (including encrypted ones) stored hundredths.
    const scale=raw.schema===1?SCALE/100:1;
    const list = (xs,max) => { if (!Array.isArray(xs) || xs.length>max) err('بنية القوائم غير صالحة أو تتجاوز الحد المسموح.'); return xs; };
    const obj = x => { if (!x || typeof x!=='object' || Array.isArray(x)) err('بنية السجل غير صالحة.'); return x; };
    const curr = list(raw.currencies,40).map(input=>{
      const x=obj(input);
      if (typeof x.code!=='string' || !/^[A-Z][A-Z0-9]{1,7}$/.test(x.code)) err('رمز عملة غير صالح.');
      return {code:x.code,name:limitText(x.name,45,true),symbol:limitText(x.symbol,12,true)};
    });
    if (!curr.length) err('أضف عملة واحدة على الأقل.');
    const codes=unique(curr.map(x=>x.code),'توجد عملة مكررة.');
    const cats=list(raw.categories,200).map(input=>{
      const x=obj(input); return {id:cleanId(x.id), name:limitText(x.name,50,true),color:colors.includes(x.color)?x.color:'indigo'};
    });
    const categories=unique(cats.map(x=>x.id),'يوجد تصنيف مكرر.');
    unique(cats.map(x=>searchKey(x.name)),'استخدم اسمًا مختلفًا للتصنيف.');
    const accounts=list(raw.accounts,10000).map(input=>{
      const x=obj(input);
      if (x.category && !categories.has(x.category)) err('التصنيف غير موجود.');
      if (x.reminder && !validDay(x.reminder))err('تاريخ تذكير غير صالح.');
      const limits={};
      if(x.limits!==undefined)for(const [code,rule] of Object.entries(obj(x.limits))){
        if(!codes.has(code))err('سقف مرتبط بعملة غير موجودة.');
        limits[code]=checkedLimit(rule,scale);
      }
      const followups={};
      if(x.followups!==undefined)for(const [code,rule] of Object.entries(obj(x.followups))){
        if(!codes.has(code))err('متابعة تحصيل مرتبطة بعملة غير موجودة.');
        followups[code]=checkedFollowup(rule);
      }
      return {id:cleanId(x.id),name:limitText(x.name,90,true),category:x.category||'',phone:limitText(x.phone??'',48),note:limitText(x.note??'',400),color:colors.includes(x.color)?x.color:'indigo',favorite:x.favorite===true,reminder:x.reminder||'',...(Object.keys(limits).length?{limits}:{}),...(Object.keys(followups).length?{followups}:{})};
    });
    const accountIds=unique(accounts.map(x=>x.id),'يوجد حساب مكرر.');
    unique(accounts.map(x=>searchKey(x.name)),'يوجد اسم حساب مكرر.');
    const receiptSerial=raw.receiptSerial??0;
    if(!Number.isInteger(receiptSerial)||receiptSerial<0||receiptSerial>RECEIPT_MAX)err('رقم آخر سند قبض غير صالح.');
    const sums=new Map();
    const entries=list(raw.entries,60000).map(input=>{
      const x=obj(input);
      if (!validDay(x.day)) err('تاريخ حركة غير صالح.');
      if (!Number.isSafeInteger(x.created) || x.created<0) err('وقت إنشاء حركة غير صالح.');
      const legs=list(x.legs,2).map(input=>{
        const l=obj(input);
        if (!accountIds.has(l.account) || !codes.has(l.code)) err('حساب الحركة أو عملتها غير موجود.');
        if (!Number.isSafeInteger(l.minor) || !l.minor || Math.abs(l.minor)>Math.floor(MAX/scale)) err('مبلغ الحركة غير صالح.');
        const minor=l.minor*scale;
        const volume=(sums.get(l.code)||0)+Math.abs(minor);
        if (volume>MAX) err('إجمالي حركات العملة تجاوز الحد المسموح.');
        sums.set(l.code,volume);
        return {account:l.account,code:l.code,minor};
      });
      if (!legs.length || (legs.length===2 && (legs[0].account===legs[1].account || legs[0].code!==legs[1].code || legs[0].minor>=0 || legs[0].minor!==-legs[1].minor))) err('التحويل يتطلب حسابين مختلفين وقيدين متعاكسين بالعملة نفسها.');
      if (x.time && !validTime(x.time))err('وقت حركة غير صالح.');
      const fallback=new Date(x.created);
      const due=checkedDue(x.due,x.day,legs.some(l=>l.minor>0));
      const receipt=x.receipt===undefined?null:checkedReceipt(x.receipt,legs);
      if(x.isolatedTransfer!==undefined&&(x.isolatedTransfer!==true||legs.length!==1||receipt))err('طرف التحويل المستقل غير صالح.');
      return {id:cleanId(x.id),day:x.day,time:x.time||(Number.isFinite(fallback.getTime())?localTime(fallback):'00:00'),created:x.created,memo:limitText(x.memo??'',600),photo:image(x.photo),legs,...(due?{due}:{}),...(receipt?{receipt}:{}),...(x.isolatedTransfer?{isolatedTransfer:true}:{})};
    });
    unique(entries.map(x=>x.id),'توجد حركة مكررة.');
    const entryMap=new Map(entries.map(x=>[x.id,x]));
    checkReceiptLinks(entries,entryMap,receiptSerial);
    const closures=list(raw.closures,10000).map(input=>{
      const x=obj(input);
      if (!accountIds.has(x.account) || !codes.has(x.code) || !validDay(x.day)) err('بيانات إغلاق الرصيد غير صالحة.');
      const ids=list(x.ids,60000).map(i=>{
        const e=entryMap.get(i);
        if (!e || e.day>x.day || !e.legs.some(l=>l.account===x.account && l.code===x.code)) err('أرشيف الرصيد يحتوي حركة غير مطابقة.');
        return i;
      });
      if (!ids.length) err('أرشيف الإغلاق فارغ.');
      unique(ids,'أرشيف الرصيد يحتوي حركة مكررة.');
      return {account:x.account,code:x.code,day:x.day,ids};
    });
    unique(closures.map(x=>x.account+':'+x.code),'أكثر من إغلاق للعملة والحساب نفسيهما.');
    const closedByKey=new Map(closures.map(c=>[c.account+':'+c.code,{day:c.day,ids:new Set(c.ids)}]));
    for(const e of entries)for(const l of e.legs){
      const c=closedByKey.get(l.account+':'+l.code);
      if(c && e.day<=c.day && !c.ids.has(e.id))err('حركة غير مؤرشفة داخل فترة مغلقة.');
    }
    const years=list(raw.years??[],400);
    if(years.some((y,i)=>!Number.isInteger(y)||y<1000||y>=Number(localDay().slice(0,4))||(i>0&&y<=years[i-1])))err('تسلسل الإغلاقات السنوية غير صالح.');
    const activity=list(raw.activity??[],ACTIVITY_MAX).map(checkedActivity);
    const prefs=obj(raw.settings);
    return {
      schema, demo:raw.demo===true, accounts,entries,closures,years:[...years],currencies:curr,categories:cats,
      settings:checkSettings(prefs,codes,curr),
      lastBackup:validDay(raw.lastBackup)?raw.lastBackup:null,...(activity.length?{activity}:{}),...(receiptSerial?{receiptSerial}:{}),
    };
  }
  const stateClone = data => JSON.parse(JSON.stringify(data));
  const addAccount = (data,fields) => {
    const existing=fields.id && data.accounts.find(a=>a.id===fields.id);
    const acc={id:existing?.id||id(),name:(fields.name||'').trim(),category:fields.category===undefined ? (existing?.category ?? (data.categories.some(c=>c.id==='general')?'general':'')) : fields.category,phone:fields.phone||'',note:fields.note||'',color:existing?.color||colors[data.accounts.length%colors.length],favorite:fields.favorite===undefined?existing?.favorite===true:fields.favorite===true,reminder:fields.reminder??existing?.reminder??'',...(existing?.limits?{limits:{...existing.limits}}:{}),...(existing?.followups?{followups:{...existing.followups}}:{})};
    if (!acc.name) err('أدخل اسم الحساب.');
    if (data.accounts.some(a=>a.id!==acc.id && searchKey(a.name)===searchKey(acc.name))) err('هذا الاسم مسجل بالفعل. اختر اسمًا مختلفًا.');
    if(existing) data.accounts[data.accounts.indexOf(existing)]=acc; else data.accounts.push(acc);
    return acc;
  };
  const yearCut = d=>d.years?.length?`${d.years[d.years.length-1]}-12-31`:'';
  function closeYear(data,year) {
    if(!Number.isInteger(year)||year<1000||year>=Number(localDay().slice(0,4)))err('اختر سنة انتهت بالفعل.');
    if(data.years?.length&&year<=data.years[data.years.length-1])err('اختر سنة بعد آخر إغلاق سنوي.');
    if(!data.entries.some(e=>e.day<=`${year}-12-31`&&e.day>yearCut(data)))err('لا توجد حركات جديدة حتى نهاية هذه السنة.');
    (data.years??=[]).push(year);
  }
  function openYear(data) {if(!data.years?.length)err('لا يوجد إغلاق سنوي.');data.years.pop();}
  const isLocked = (data,id) => data.closures.some(c=>c.ids.includes(id)) || (!!yearCut(data)&&data.entries.some(e=>e.id===id&&e.day<=yearCut(data)));
  function accountClosure(data,account,code) {
    const individual=data.closures.find(c=>c.account===account&&c.code===code), annual=yearCut(data);
    if(!annual||individual?.day>annual)return individual;
    const ids=data.entries.filter(e=>e.day<=annual&&e.legs.some(l=>l.account===account&&l.code===code)).map(e=>e.id);
    return ids.length?{account,code,day:annual,ids,annual:true,individual:!!individual}:individual;
  }
  const saveEntry = (data, fields) => {
    if (!validDay(fields.day)) err('اختر تاريخًا صحيحًا.');
    if (fields.day<=yearCut(data))err('السنة مغلقة. اختر تاريخًا بعد آخر إغلاق سنوي.');
    if(fields.time&&!validTime(fields.time))err('اختر وقتًا صحيحًا.');
    const previous=fields.id && data.entries.find(e=>e.id===fields.id);
    if (previous && isLocked(data, previous.id)) err('ألغِ إغلاق الرصيد أولًا لتعديل هذه الحركة.');
    let legs;
    const amount=parseAmount(fields.amount);
    if (fields.kind==='transfer') {
      if (!fields.from || !fields.to || fields.from===fields.to) err('اختر حسابين مختلفين للتحويل.');
      legs=[{account:fields.from,code:fields.code,minor:-amount},{account:fields.to,code:fields.code,minor:amount}];
    } else {
      if (!fields.account) err('اختر حسابًا للعملية.');
      if (!['credit','debit'].includes(fields.kind)) err('اختر اتجاه الحركة.');
      legs=[{account:fields.account,code:fields.code,minor:fields.kind==='debit'?-amount:amount}];
    }
    if (legs.some(l=>data.closures.some(c=>c.account===l.account && c.code===l.code && fields.day<=c.day))) err('تاريخ الحركة داخل فترة مغلقة. اختر تاريخًا لاحقًا أو ألغِ الإغلاق من كشف الحساب.');
    const positive=legs.some(l=>l.minor>0);
    const due=checkedDue(fields.due??(positive?previous?.due:undefined),fields.day,positive);
    const oldReceipt=previous?.receipt;
    let serial=data.receiptSerial||0;
    let receipt=oldReceipt?checkedReceipt(oldReceipt,legs):null;
    if(oldReceipt&&(previous.legs[0].account!==legs[0].account||previous.legs[0].code!==legs[0].code))err('لا يمكن نقل سند قبض صادر إلى حساب أو عملة أخرى.');
    if(fields.receipt!==undefined){
      if(!fields.receipt||typeof fields.receipt!=='object'||Array.isArray(fields.receipt)||(previous&&!oldReceipt))err('أصدر سندًا من «تسجيل قبض» لقيد جديد فقط.');
      if(serial>=RECEIPT_MAX&&!oldReceipt)err('بلغ الدفتر الحد الأقصى لأرقام سندات القبض.');
      receipt=checkedReceipt({...fields.receipt,number:oldReceipt?.number??++serial},legs);
    }
    if(receipt&&fields.day>localDay())err('اختر تاريخ قبض لا يتجاوز اليوم.');
    const e={id:previous?.id||id(),day:fields.day,time:fields.time||previous?.time||localTime(),memo:String(fields.memo||'').trim(),photo:fields.photo??previous?.photo??'',created:previous?.created??Date.now(),legs,...(due?{due}:{}),...(receipt?{receipt}:{}),...(previous?.isolatedTransfer&&legs.length===1?{isolatedTransfer:true}:{})};
    if(receipt||(previous&&data.entries.some(x=>x.receipt?.target===previous.id))){
      const candidate=previous?data.entries.map(x=>x===previous?e:x):[...data.entries,e];
      checkReceiptLinks(candidate,new Map(candidate.map(x=>[x.id,x])),serial);
    }
    if(previous) data.entries[data.entries.indexOf(previous)]=e; else data.entries.push(e);
    if(receipt)data.receiptSerial=serial;
    return e;
  };
  function removeEntry(data, entryId) {
    if (isLocked(data,entryId)) err('ألغِ إغلاق الرصيد أولًا لحذف هذه الحركة.');
    if(data.entries.some(e=>e.receipt?.target===entryId))err('لهذا القيد سند قبض مخصّص. ألغِ التخصيص من السند قبل حذف القيد.');
    data.entries=data.entries.filter(e=>e.id!==entryId);
  }
  function removeAccount(data, accountId) {
    const ids=new Set(data.entries.filter(e=>e.legs.some(l=>l.account===accountId)).map(e=>e.id));
    if (data.closures.some(c=>c.ids.some(i=>ids.has(i)))||data.entries.some(e=>ids.has(e.id)&&e.day<=yearCut(data))) err('ألغِ إغلاقات الرصيد المرتبطة بهذا الحساب وتحويلاته أولًا.');
    if(data.entries.some(e=>e.receipt?.target&&ids.has(e.receipt.target)&&!ids.has(e.id)))err('هناك سند قبض في حساب آخر مخصّص لأحد التحويلات. ألغِ التخصيص أولًا.');
    data.accounts=data.accounts.filter(a=>a.id!==accountId);
    data.entries=data.entries.filter(e=>!ids.has(e.id));
  }
  function closeBalance(data, account, code, day) {
    if (!validDay(day) || day>localDay()) err('اختر تاريخًا لا يتجاوز اليوم.');
    if(day<=yearCut(data))err('هذا التاريخ مُغلق سنويًا بالفعل.');
    const previous=data.closures.find(c=>c.account===account && c.code===code);
    if(previous && day<previous.day) err('يجب ألا يسبق التاريخ الإغلاق الحالي.');
    const ids=data.entries.filter(e=>e.day<=day && e.legs.some(l=>l.account===account && l.code===code)).map(e=>e.id);
    if (!ids.length || (previous && ids.length===previous.ids.length && day===previous.day)) err('لا توجد حركات جديدة للتجميع.');
    data.closures=data.closures.filter(c=>c!==previous);
    data.closures.push({account,code,day,ids});
  }
  function openBalance(data, account, code) { data.closures=data.closures.filter(c=>c.account!==account || c.code!==code); }
  const ascending = (a,b) => a.day.localeCompare(b.day)||(a.time||'23:59').localeCompare(b.time||'23:59')||(a.created-b.created)||a.id.localeCompare(b.id);
  function balances(data, code) {
    const byAccount = new Map(data.accounts.map(a=>[a.id,{minor:0,count:0,latest:'',credit:0,debit:0}]));
    for (const e of data.entries) for (const l of e.legs) if(l.code===code && byAccount.has(l.account)) {
      const x=byAccount.get(l.account); x.minor+=l.minor; x.count++; if(l.minor>0)x.credit+=l.minor;else x.debit-=l.minor;
      if (e.day>x.latest) x.latest=e.day;
    }
    return byAccount;
  }
  function totals(byAccount) {
    const t={credit:0,debit:0,net:0,credits:0,debits:0};
    for (const v of byAccount.values()) {
      t.net+=v.minor;
      if (v.minor>0) {t.credit+=v.minor;t.credits++;}
      else if(v.minor<0){t.debit-=v.minor;t.debits++;}
    }
    return t;
  }
  function statement(data,account,code,{from='',to='',archive=false}={}) {
    const closure=accountClosure(data,account,code);
    const locked=new Set(closure && !archive ? closure.ids : []);
    const rows=[]; let carried=0;
    for(const e of data.entries) {
      const leg=e.legs.find(l=>l.account===account && l.code===code);
      if(!leg)continue;
      if(locked.has(e.id))carried+=leg.minor;
      else rows.push({...e,minor:leg.minor});
    }
    if(locked.size)rows.push({id:'closure:'+account+':'+code,day:closure.day,created:Number.MAX_SAFE_INTEGER,memo:(closure.annual?'رصيد مرحّل سنويًا · ':'رصيد مرحّل · ')+locked.size+' حركة',minor:carried,closed:true});
    rows.sort(ascending);
    let opening=0,ending=0;
    const visible=[];
    for (const r of rows) {
      if(from && r.day<from)opening+=r.minor;
      if(to && r.day>to)continue;
      ending+=r.minor;
      if(!from || r.day>=from)visible.push({...r,running:ending});
    }
    return {rows:visible,opening,ending,closure};
  }
  function matching(data, {code='',account='',from='',to='',query='',kind=''}={}) {
    const accounts=new Map(data.accounts.map(a=>[a.id,a.name]));
    const key=searchKey(query);
    return data.entries.filter(e=>{
      if ((from && e.day<from)||(to && e.day>to))return false;
      const legs=e.legs.filter(l=>(!code || l.code===code) && (!account || l.account===account));
      if(!legs.length)return false;
      if(kind==='transfer' && e.legs.length!==2)return false;
      if((kind==='credit' || kind==='debit') && (e.legs.length!==1 || (legs[0].minor>0)!==(kind==='credit')))return false;
      return !key || searchKey([e.memo,e.day,e.time,...e.legs.map(l=>`${accounts.get(l.account)} ${l.code} ${decimal(l.minor)} ${decimal(Math.abs(l.minor))}`)].join(' ')).includes(key);
    }).sort((a,b)=>ascending(b,a));
  }
  function flows(entries, bucket) {
    const out=new Map();
    for (const e of entries) {
      if(e.legs.length!==1)continue; // internal transfers do not count as new credit or debit activity
      const k=bucket(e);const row=out.get(k)||{credit:0,debit:0,count:0};const m=e.legs[0].minor;
      if(m>0)row.credit+=m;else row.debit-=m;
      row.count++;out.set(k,row);
    }
    return out;
  }
  const small=['صفر','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const tens=['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const hundreds=['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'];
  function underK(n) {
    let h=hundreds[Math.floor(n/100)], r=n%100;
    if (!r)return h;
    const tail=r<20?small[r]:[r%10?small[r%10]:'',tens[Math.floor(r/10)]].filter(Boolean).join(' و');
    return [h,tail].filter(Boolean).join(' و');
  }
  function numberWords(minor) {
    let n=Math.floor(Math.abs(minor)/SCALE), parts=[], groups=[[],['ألف','ألفان','آلاف'],['مليون','مليونان','ملايين'],['مليار','ملياران','مليارات']];
    for(let k=0;n>0;k++,n=Math.floor(n/1000)) {
      const v=n%1000;if(!v)continue;
      const g=groups[k];
      parts.unshift(k===0?underK(v):v===1?g[0]:v===2?g[1]:underK(v)+' '+(v<11?g[2]:g[0]));
    }
    const tail=Math.abs(minor)%SCALE, wholeCents=tail%10===0;
    return (minor<0?'سالب ':'')+(parts.join(' و')||small[0])+(tail?' و'+underK(wholeCents?tail/10:tail)+(wholeCents?' من مئة':' من ألف'):'');
  }
  function demoData() {
    const d=empty(true);
    d.accounts=[
      ['a1','أحمد العريقي','clients','indigo'],['a2','مؤسسة النور','suppliers','amber'],['a3','متجر الأمانة','clients','mint'],
      ['a4','محمد الحداد','personal','sky'],['a5','شركة الروّاد','clients','violet'],['a6','سارة المقطري','personal','rose'],['a7','علي الحكيمي','suppliers','sky'],
    ].map(([id,name,category,color],i)=>({id,name,category,color,phone:i===0?'771 234 567':'',note:'',favorite:i===0||i===2}));
    const seeds=[
      [0,'a1',42500,'دفعة بضاعة شهرية'],[0,'a2',-18000,'فاتورة توريد'],[0,'a5',31500,'توريد مستلزمات'],[-1,'a3',29000,'فاتورة مبيعات'],[-1,'a4',-9500,'مصاريف مشتركة'],[-2,'a1',38750,'فواتير سابقة'],[-2,'a6',12000,'سلفة شخصية'],[-2,'a7',-24500,'شراء مواد'],[-3,'a2',-32000,'فاتورة مواد أولية'],[-3,'a3',16500,'مبيعات نقدية مؤجلة'],[-4,'a5',41000,'دفعة مؤجلة'],[-4,'a7',-11500,'باقي فاتورة'],[-5,'a1',43000,'توريد بضاعة'],[-5,'a4',-12500,'دفعة متبقية'],[-6,'a6',8500,'قيد افتتاحي'],[-6,'a2',-14000,'شحنة أسبوعية'],[-24,'a5',22500,'فاتورة الشهر السابق'],[-30,'a1',-32000,'سداد جزئي'],[-33,'a3',25000,'مبيعات آجلة'],[-35,'a7',-16000,'فاتورة سابقة'],[-45,'a6',-4800,'سداد من الحساب'],[-64,'a5',21400,'أعمال توريد'],[-65,'a4',-6000,'قيد افتتاحي'],[-1,'a1',340,'طلب نقدي','SAR'],[-3,'a2',-150,'فرق توريد','SAR'],[-1,'a3',95,'رصيد افتتاحي','USD'],[-4,'a7',-40,'دفعة مورد','USD'],
    ];
    d.entries=seeds.map(([days,account,m,memo,code='YER'],i)=>({id:'e'+(i+1),day:offset(days),created:1700000000000+10000*(seeds.length-i),memo,legs:[{account,code,minor:m*SCALE}]}));
    // Synthetic dates solely for the built-in preview; restored ledgers get no guessed due dates.
    for(const [entry,delta] of [['e1',5],['e3',0],['e4',8],['e11',-2],['e17',-12],['e19',-24],['e22',-40]])setDueDate(d,entry,offset(delta));
    setFollowup(d,'a5','YER',{kind:'promise',day:localDay(),note:'متابعة الوعد التجريبي.',at:Date.now()});
    return validate(d);
  }
  function csv(rows) {
    const wrap = value => {
      if (typeof value==='number')return String(value);
      let s=String(value??'');
      if (/^[\s\u200B]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    return '\ufeff'+rows.map(r=>r.map(wrap).join(',')).join('\r\n')+'\r\n';
  }
  function periodKey(day,period) {
    if (period==='year')return day.slice(0,4);
    if (period==='month')return day.slice(0,7);
    if (period==='week'){const weekday=dateFromDay(day).getDay();return offset(-((weekday+1)%7),day);} // Saturday start
    return day;
  }
  function phoneNumber(input,prefix='+967') {
    let s=digits(input).trim().replace(/[\s()\-\u061c\u200e\u200f\u2010-\u2011\u202a-\u202e\u2066-\u2069]/g,'');
    if(/^00/.test(s))s='+'+s.slice(2);
    if (!s.startsWith('+')) {
      const cc=prefix.slice(1);
      s=s.startsWith(cc)&&s.length>9?'+'+s:prefix+s.replace(/^0/,'');
    }
    if (!/^\+[1-9]\d{7,14}$/.test(s))err('أدخل رقمًا صحيحًا مع رمز الدولة.');
    return s;
  }
  function calculate(src) {
    const s=digits(src).trim().replace(/[\s٬]/g,'').replace(/٫/g,'.').replace(/[×x]/gi,'*').replace(/÷/g,'/').replace(/[−–]/g,'-');
    if(s.length>96||!/^[0-9+*.()/\-]+$/.test(s))err('تعبير الحاسبة غير صالح.');
    let i=0,depth=0;const unit=BigInt(SCALE),limit=BigInt(MAX);
    const round=(n,d)=>{if(!d)err('لا يمكن القسمة على صفر.');const sign=(n<0n)!==(d<0n)?-1n:1n;const a=n<0n?-n:n,b=d<0n?-d:d;return sign*((a+b/2n)/b);};
    function bounded(v){if(v>limit||v<-limit)err('القيمة أكبر من الحد المسموح.');return v;}
    function factor(){
      if(++depth>20)err('تعبير الحاسبة معقّد جدًا.');
      let value;
      if(s[i]==='-'||s[i]==='+'){const op=s[i++];value=factor()*(op==='-'?-1n:1n);}
      else if(s[i]==='('){i++;value=expr();if(s[i++]!==')')err('أغلق الأقواس في الحاسبة.');}
      else{const m=s.slice(i).match(/^\d+(?:\.\d{1,3})?/);if(!m)err('أكمل العملية الحسابية.');i+=m[0].length;const [w,f='']=m[0].split('.');value=bounded(BigInt(w)*unit+BigInt(f.padEnd(PRECISION,'0')));}
      depth--;return value;
    }
    function term(){let v=factor();while(s[i]==='*'||s[i]==='/'){const op=s[i++],n=factor();v=bounded(op==='*'?round(v*n,unit):round(v*unit,n));}return v;}
    function expr(){let v=term();while(s[i]==='+'||s[i]==='-'){const op=s[i++],n=term();v=bounded(op==='+'?v+n:v-n);}return v;}
    const n=expr();if(i!==s.length)err('تعبير الحاسبة غير صالح.');return Number(n);
  }
  return {MAX,SCALE,PRECISION,schema,supportsSchema,colors,periods,periodKey,phoneNumber,calculate,validTime,localTime,yearCut,closeYear,openYear,accountClosure,empty,validate,stateClone,addAccount,setAccountLimit,limitStatus,setDueDate,setFollowup,followupKinds,recordActivity,ACTIVITY_MAX,receiptMethods,receiptNumber,clearReceiptTarget,isLocked,saveEntry,removeEntry,removeAccount,closeBalance,openBalance,balances,totals,statement,matching,flows,numberWords,demoData,csv,id,digits,searchKey,parseAmount,decimal,inputDecimal,localDay,dateFromDay,offset,validDay};
});
