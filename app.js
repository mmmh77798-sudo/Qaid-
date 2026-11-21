'use strict';
const L = Ledger;
const native = window.QaydAndroid || null;
const KEY = 'qayd.ledger.v1';
const qs = (s, root=document) => root.querySelector(s);
const html = (s) => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;', '"':'&quot;',"'":'&#39;'}[c]));
let data, bootError='', loadedRaw=null, saving=false, formBusy=false;
let pendingNativeBackup='', readingNativeBackup='';
const MAX_BACKUP=20*1024*1024;
const security={locked:false,envelope:null,credentials:null};
try {
  const stored=native?native.readLedger():localStorage.getItem(KEY);
  loadedRaw=stored;
  const raw=stored?JSON.parse(stored):null;
  if(Vault.is(raw)){Vault.inspect(raw);security.envelope=raw;security.locked=true;data=L.empty();}
  else data=stored?L.validate(raw):native?L.empty():L.demoData();
} catch {
  data=L.empty();
  bootError='تعذّر قراءة بيانات الجهاز. لن نستبدلها إلا إذا استرجعت نسخة أو أنشأت دفترًا فارغًا صراحةً من الإعدادات.';
}
const blankFilters=()=>({query:'',from:'',to:'',kind:'',account:''});
const u={view:'home',settings:'',account:'',code:data.settings.defaultCode,acct:{query:'',category:'',status:'',sort:data.settings.home.alpha?'name':'latest',reverse:false},moves:blankFilters(),statement:QaydAccountFeatures.blank(),collections:CollectionsUI.blank(),report:{...blankFilters(),tab:'accounts',period:data.settings.home.period},rowsPage:1};
const navItems=[['home','الرئيسية','home'],['accounts','الحسابات','accounts'],['moves','الحركات','moves'],['settings','المزيد','more']];
const viewNames={home:'دفتر الهاتف',accounts:'الحسابات',moves:'الحركات',account:'كشف الحساب',reports:'التقارير',collections:'التحصيل',categories:'التصنيفات',currencies:'العملات',settings:'المزيد'};
const viewName=()=>u.view==='settings'&&u.settings?extraTitle():viewNames[u.view];
function currentNav(){
  if(u.view==='account')return 'accounts';
  if(u.view==='collections'&&u.collections.tab==='receipts')return 'moves';
  return navItems.some(([id])=>id===u.view)?u.view:'settings';
}
const getAccount=id=>data.accounts.find(a=>a.id===id);
const getCategory=id=>data.categories.find(a=>a.id===id);
const codeInfo=(code=u.code)=>data.currencies.find(c=>c.code===code)||data.currencies[0];
const accountName=id=>getAccount(id)?.name||'—';
const categoryName=id=>getCategory(id)?.name||'بلا تصنيف';
const currentAccount=()=>getAccount(u.account);
const numLocale=()=>data.settings.digits==='arabic'?'ar-u-nu-arab':'en-US';
const nfCache=new Map();
function fmt(n, div=1) {
  const locale=numLocale();
  if(!nfCache.has(locale))nfCache.set(locale,new Intl.NumberFormat(locale,{maximumFractionDigits:L.PRECISION}));
  return nfCache.get(locale).format(n/div);
}
const D=(day,config={day:'numeric',month:'short'})=>day?new Intl.DateTimeFormat('ar-YE-u-ca-gregory-nu-'+(data.settings.digits==='arabic'?'arab':'latn'),config).format(L.dateFromDay(day)):'—';
const money=(m,sign=false)=>`${sign&&m>0?'+':''}${fmt(m,L.SCALE)}`;
const tone=m=>m>0?'text-pos':m<0?'text-neg':'';
const amt=(m, sign=false, col=true)=>`<bdi class="num amount${col?' '+tone(m):''}">${html(money(m,sign))}</bdi>`;
const stamp=(name,cls='')=>`<span class="tint ${cls}">${icon(name,18)}</span>`;
const opt=(value,label,selected)=>`<option value="${html(value)}" ${value===selected?'selected':''}>${html(label)}</option>`;
const acctOptions=(id,first='جميع الحسابات')=>opt('',first,id)+data.accounts.slice().sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(a=>opt(a.id,a.name,id)).join('');
const curOptions=(id)=>data.currencies.map(c=>opt(c.code,c.name+' · '+c.code,id)).join('');
const catOptions=(id,first='جميع التصنيفات')=>opt('',first,id)+data.categories.map(c=>opt(c.id,c.name,id)).join('');
const button=(label,action,ic='',cls='btn-outline',attr='')=>`<button type="button" class="btn ${cls}" data-action="${action}" ${attr}>${ic?icon(ic,16):''}${html(label)}</button>`;
const ib=(label,action,ic,attr='',extra='')=>`<button type="button" class="icon-btn ${extra}" data-action="${action}" title="${html(label)}" aria-label="${html(label)}" ${attr}>${icon(ic,17)}</button>`;
const link=(label,action,ic='',attr='')=>`<button type="button" class="text-btn" data-action="${action}" ${attr}>${html(label)}${ic?icon(ic,15):''}</button>`;
const goBtn=(label,view,ic='arrowLeft',cl='text')=>cl==='text'?link(label,'go',ic,`data-view="${view}"`):button(label,'go',ic,cl,`data-view="${view}"`);
const search=(scope,placeholder,value='',extra='')=>`<label class="search-field ${extra}">${icon('search',16)}<span class="sr-only">${html(placeholder)}</span><input type="search" autocomplete="off" maxlength="160" data-scope="${scope}" data-filter="query" placeholder="${html(placeholder)}" value="${html(value)}"></label>`;
const currency=()=>`<label class="currency-control">${icon('coins',16)}<span class="sr-only">عملة العرض</span><select aria-label="عملة العرض" data-change="currency">${curOptions(u.code)}</select></label>`;
const avatar=(a,big=false)=>{const name=a.name.trim().split(/\s+/);const chars=name.length>1?Array.from(name[0])[0]+Array.from(name[1])[0]:Array.from(name[0]).slice(0,2).join('');return `<span class="avatar ${html(a.color)} ${big?'big':''}" aria-hidden="true">${html(chars)}</span>`;};
const status=m=>`<span class="badge ${m>0?'positive':m<0?'negative':''}">${m>0?'لي':m<0?'عليّ':'متوازن'}</span>`;
const emptyView=(title,desc,ic='folder',act='')=>`<div class="empty-state">${stamp(ic)}<h3>${html(title)}</h3>${desc?`<p>${html(desc)}</p>`:''}${act}</div>`;
const alertBox=(msg,warn=false,actions='')=>`<div class="notice ${warn?'warn':''}">${icon(warn?'info':'shield',17)}<span>${html(msg)}</span>${actions?`<div class="notice-actions">${actions}</div>`:''}</div>`;
const section=(title,desc,right='')=>`<div class="section-head"><div><h2>${html(title)}</h2>${desc?`<p>${html(desc)}</p>`:''}</div>${right}</div>`;
const heading=(name,desc,actions='',pre='')=>`<div class="page-heading"><div>${pre?`<p class="eyebrow">${html(pre)}</p>`:''}<h1>${html(name)}</h1>${desc?`<p>${html(desc)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
function brand() {return `<button class="brand" data-action="go" data-view="home" type="button" aria-label="قيد — الرئيسية"><img src="logo.svg" alt=""><span><strong>قيد</strong><small>دفتر الهاتف</small></span></button>`;}
function renderChrome() {
  const active=currentNav();
  const item=([id,label,ic],mobile=false)=>`<button type="button" class="${mobile?'mobile-link':'nav-link'}${active===id?' active':''}" data-action="go" data-view="${id}" ${active===id?'aria-current="page"':''}>${mobile?`<span class="mobile-icon">${icon(ic)}</span>`:icon(ic)}${html(label)}</button>`;
  qs('#sidebar').innerHTML=`${brand()}<div class="nav-group simple-nav" role="navigation" aria-label="أقسام دفتر الهاتف">${navItems.map(n=>item(n)).join('')}</div><div class="side-bottom"><div class="side-foot"><b>V ${html(QaydRelease.version)}</b></div></div>`;
  qs('#topbar').innerHTML=`<div class="crumb">${icon('shield',16)}<b>دفتر الهاتف</b></div><div class="top-mobile-brand">${brand()}</div><div class="top-actions">${data.demo?`<span class="top-pill demo">${icon('spark',12)}تجربة</span>`:''}</div>`;
  qs('#mobilebar').innerHTML=navItems.map(n=>item(n,true)).join('');
}
let paintedView='';
const render=()=>{
  document.documentElement.dataset.theme=data.settings.home.dark?'dark':'light';
  const theme=qs('meta[name=theme-color]');theme.content=data.settings.home.dark?'#111827':'#f5f7fb';
  native?.setNight?.(data.settings.home.dark);
  if(security.locked){paintedView='';renderLocked();return;}
  qs('#app').hidden=false;
  if(!data.currencies.some(c=>c.code===u.code))u.code=data.settings.defaultCode;
  if(u.view==='account'&&!currentAccount()){u.view='accounts';u.account='';}
  document.title=`قيد — ${viewName()}`;
  renderChrome();
  const views={home:renderHome,accounts:renderAccounts,moves:renderMoves,account:renderAccount,reports:renderReports,collections:CollectionsUI.renderPage,categories:renderCategories,currencies:renderCurrencies,settings:renderSettingsV11};
  const page=qs('#page'),key=u.view+(u.view==='settings'?':'+u.settings:'');
  const expanded=new Set(paintedView===key?[...page.querySelectorAll('[data-disclosure][open]')].map(d=>d.dataset.disclosure):[]);
  paintedView=key;
  page.innerHTML='<div id="incoming-backup" hidden></div>'+(bootError?`<div style="margin-bottom:10px">${alertBox(bootError,true)}</div>`:'')+views[u.view]();
  for(const details of page.querySelectorAll('[data-disclosure]'))if(expanded.has(details.dataset.disclosure))details.open=true;
  renderResults();renderBackupOffer();
};
function go(view, account='',keepPage=false) {
  if(!Object.hasOwn(viewNames,view)||(view==='account'&&!getAccount(account)))return;
  if(view==='collections'&&!keepPage)u.collections.tab='queue';
  if(u.view==='settings'&&u.settings==='shared'&&(view!=='settings'||!keepPage))TeamUI.reset();
  if(view==='account'&&u.account!==account)u.statement=QaydAccountFeatures.blank();
  if(u.view!==view||!keepPage)u.rowsPage=1;
  if(view==='settings'&&!keepPage)u.settings='';
  u.view=view;u.account=account;closeDialog();render();qs('#page').focus({preventScroll:true});window.scrollTo(0,0);
}
function cleanBackup(d) {
  if(d.settings.backupPhotos)return d;
  return {...d,settings:{...d.settings,profile:{...d.settings.profile,logo:''}},entries:d.entries.map(e=>({...e,photo:''}))};
}
const pack=async (d,credentials)=>credentials?Vault.lock(d,credentials):d;
async function persist(next,{replace=false,credentials=security.credentials}={}) {
  if(bootError&&!replace)throw new Error('استرجع نسخة صالحة أو أنشئ دفترًا فارغًا من الإعدادات أولًا.');
  if(saving)throw new Error('انتظر اكتمال الحفظ الجاري.');
  saving=true;
  try {
    const checked=L.validate(next);
    if(!replace&&loadedRaw&&!bootError&&credentials===security.credentials&&JSON.stringify(checked)===JSON.stringify(data))return;
    const packed=await pack(checked,credentials),raw=JSON.stringify(packed);
    if(native){
      const hasImages=!!checked.settings.profile.logo||checked.entries.some(e=>e.photo);
      const subset=!checked.settings.backupPhotos&&hasImages?JSON.stringify(await pack(cleanBackup(checked),credentials)):null;
      if(!native.writeLedger(raw,subset))throw new Error('لم تُحفظ التغييرات. تحقق من مساحة الجهاز أو حجم الصور.');
    }else {
      if(localStorage.getItem(KEY)!==loadedRaw)throw new Error('تغيّر الدفتر في نافذة أخرى. أعد تحميل الصفحة قبل الحفظ.');
      try{localStorage.setItem(KEY,raw);}catch{throw new Error('لم تُحفظ التغييرات؛ تخزين المتصفح غير متاح أو ممتلئ. صدّر نسخة أولًا.');}
    }
    loadedRaw=raw;data=checked;bootError='';security.credentials=credentials;security.envelope=credentials?packed:null;
    syncNativeNotices();
  } finally {saving=false;}
}
async function mutate(fn) {const next=L.stateClone(data);const result=fn(next);await persist(next);return result;}
function done(msg,repaint=true) {closeDialog();if(repaint)render();toast(msg);}
let toastTimeout;
function toast(msg,error=false) {
  qs('#toast').innerHTML=`<div class="toast-card ${error?'error':''}">${icon(error?'info':'check',17)}<span>${html(msg)}</span></div>`;
  clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>{qs('#toast').innerHTML='';},3800);
}
function stat(label,minor,c,ic,color,foot,sign=false) {
  return `<div class="stat"><div class="stat-top"><label>${html(label)}</label>${stamp(ic,color)}</div><div class="stat-value"><b class="num ${color==='mint'?'text-pos':color==='rose'?'text-neg':''}">${html(money(minor,sign))}</b><span>${html(c.symbol)}</span></div><p class="stat-foot">${html(foot)}</p></div>`;
}
function portfolioStats() {
  const v=L.totals(L.balances(data,u.code)),c=codeInfo();
  return `<div class="stats">${stat('إجمالي لي',v.credit,c,'credit','mint',fmt(v.credits)+' حسابات مدينة')}${stat('إجمالي عليّ',v.debit,c,'debit','rose',fmt(v.debits)+' حسابات دائنة')}${stat('صافي الرصيد',v.net,c,'wallet','', 'الفرق بين الأرصدة',false)}</div>`;
}
function renderHome() {
  return `<div class="daily-home">${heading('دفتر الهاتف',data.demo?'بيانات تجريبية. ابدأ دفترًا فارغًا قبل إدخال سجلاتك.':'سجلات الهاتف خاصة بهذا الجهاز.')}
    <div class="record-choices"><section class="panel record-local" aria-label="تسجيل محلي"><div class="record-label">${stamp('lock')}<div><h2>على الهاتف</h2><p>يعمل دون إنترنت</p></div></div>${button('تسجيل على الهاتف','new-entry','plus','btn-primary')}</section>${TeamUI.shortcut()}</div>
    ${section('الأرصدة','',data.settings.home.currencies?currency():`<span class="date-pill currency-fixed">${html(codeInfo().name)}</span>`)}${portfolioStats()}
    ${renderRecent()}</div>`;
}
function entryCaption(e, expand=true) {
  return e.legs.length===2?(expand?`${accountName(e.legs[0].account)} ← ${accountName(e.legs[1].account)}`:'تحويل بين حسابين'):accountName(e.legs[0].account);
}
function renderRecent() {
  const es=L.matching(data,{code:u.code}).slice(0,3);
  return `<section class="panel"><div class="panel-head"><h2>آخر الحركات</h2></div>${es.length?es.map(e=>{const x=e.legs[0],t=e.legs.length===2;return `<button class="mini-move" type="button" data-action="entry-info" data-id="${html(e.id)}">${stamp(t?'moves':x.minor>0?'credit':'debit',t?'':x.minor>0?'mint':'rose')}<span class="mid"><b>${html(entryCaption(e,data.settings.transferDetails))}</b><small>${html(e.memo||D(e.day))}</small></span>${amt(t?Math.abs(x.minor):x.minor,!t,!t)}</button>`;}).join(''):emptyView('لا حركات بعد','', 'moves')}</section>`;
}
function filtersMore(content,active=false,label='تصفية'){
  return `<details class="filter-options" ${active?'open':''}><summary>${icon('filter',16)}${html(label)}</summary><div class="filter-fields">${content}</div></details>`;
}
function renderAccounts() {
  const f=u.acct,extra=`<select class="control-select mobile-account-sort" aria-label="ترتيب الحسابات" data-scope="acct" data-filter="sort">${[['latest','الأحدث حركة'],['name','الاسم'],['balance','الرصيد']].map(([v,l])=>opt(v,l,f.sort)).join('')}</select><select class="control-select" aria-label="التصنيف" data-scope="acct" data-filter="category">${catOptions(f.category)}${opt('~','بلا تصنيف',f.category)}</select><select class="control-select" aria-label="حالة الرصيد" data-scope="acct" data-filter="status">${[['','كل الأرصدة'],['credit','لي'],['debit','عليّ'],['zero','متوازن'],['favorite','المفضلة']].map(([v,l])=>opt(v,l,f.status)).join('')}</select>${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small clear-filters','data-scope="acct"')}`;
  return `${heading('الحسابات','',currency()+button('حساب جديد','new-account','plus','btn-primary'))}<section class="panel account-table"><div class="toolbar simple-toolbar">${search('acct','ابحث بالاسم أو الهاتف…',f.query)}${filtersMore(extra,!!(f.category||f.status),'تصفية وترتيب')}</div><div id="view-results"></div></section>`;
}
const getPage=rows=>{
  const span=24,pages=Math.max(1,Math.ceil(rows.length/span));if(u.rowsPage>pages)u.rowsPage=pages;
  return {shown:rows.slice((u.rowsPage-1)*span,u.rowsPage*span),pages};
};
const pager=(n,pages=1,unit='سجل')=>`<div class="panel-footer"><span>${html(fmt(n))} ${html(unit)}</span>${pages>1?`<div class="row-actions">${button('السابق','prev-page','arrowRight','btn-outline btn-small',u.rowsPage===1?'disabled':'')}<span class="num">${u.rowsPage} / ${pages}</span>${button('التالي','next-page','arrowLeft','btn-outline btn-small',u.rowsPage===pages?'disabled':'')}</div>`:''}</div>`;
function acctRows() {
  const map=L.balances(data,u.code),f=u.acct,key=L.searchKey(f.query);
  const filtered=data.accounts.map(a=>({a,v:map.get(a.id)})).filter(({a,v})=>{
    if(key){
      const text=L.searchKey([a.name,a.phone,a.note,categoryName(a.category),L.decimal(v.minor),v.latest].join(' '));
      const number=L.digits(f.query).replace(/\D/g,'');
      const phone=L.digits(a.phone).replace(/\D/g,'');
      if(!text.includes(key)&&(!number||!phone.includes(number)))return false;
    }
    if(f.category && a.category!==(f.category==='~'?'':f.category))return false;
    return !f.status || (f.status==='favorite'?a.favorite:f.status==='credit'?v.minor>0:f.status==='debit'?v.minor<0:v.minor===0);
  });
  const compare=(p,q)=>f.sort==='name'?p.a.name.localeCompare(q.a.name,'ar'):f.sort==='balance'?q.v.minor-p.v.minor:q.v.latest.localeCompare(p.v.latest);
  filtered.sort((a,b)=>(f.reverse?-1:1)*compare(a,b) || a.a.name.localeCompare(b.a.name,'ar'));
  if(!filtered.length){
    const actions=data.accounts.length?`<div class="empty-actions">${button('مسح البحث والتصفية','reset-filter','undo','btn-primary','data-scope="acct"')}${button('حساب جديد','new-account','plus','btn-outline')}</div>`:`<div class="empty-actions">${button('إضافة أول حساب','new-account','plus','btn-primary')}</div>`;
    return emptyView(data.accounts.length?'لا توجد نتائج':'لا حسابات بعد',data.accounts.length?'جرّب مسح البحث والتصفية، أو أضف حسابًا جديدًا.':'ابدأ باسم الحساب فقط؛ التفاصيل الإضافية اختيارية.','accounts',actions);
  }
  const {shown,pages}=getPage(filtered);
  const header=(label,key,cls='')=>`<th scope="col" class="${cls}">${link(label,'sort-accounts',u.acct.sort===key?'sort':'',`data-key="${key}"`)}</th>`;
  const table=`<div class="scroll-table"><table class="data-table"><thead><tr>${header('اسم الحساب','name')}<th class="col-category">التصنيف</th>${header('الرصيد','balance')}${header('آخر حركة','latest','col-date')}<th><span class="sr-only">إجراءات</span></th></tr></thead><tbody>${shown.map(({a,v})=>`<tr><td><button class="row-button" type="button" data-action="open-account" data-id="${html(a.id)}">${avatar(a)}<span><span class="row-name">${html(a.name)}</span><small>${html(fmt(v.count))} حركة</small></span></button></td><td class="col-category"><span class="badge">${html(categoryName(a.category))}</span></td><td>${amt(v.minor)}<span class="row-sub">${v.minor>0?'لي':v.minor<0?'عليّ':'متوازن'}</span></td><td class="col-date subtle">${html(D(v.latest))}</td><td><div class="row-actions">${ib('إضافة حركة لهذا الحساب','new-entry','plus',`data-account="${html(a.id)}"`)}${ib('خيارات الحساب','account-options','more',`data-id="${html(a.id)}"`)}</div></td></tr>`).join('')}</tbody></table></div>`;
  const cards=`<div class="account-mobile-cards">${shown.map(({a,v})=>`<article class="account-mobile-card"><button class="account-card-main" type="button" data-action="open-account" data-id="${html(a.id)}" aria-label="فتح كشف الحساب لـ ${html(a.name)}"><span class="account-card-identity">${avatar(a)}<span class="account-card-copy"><strong>${html(a.name)}</strong><small>${html(categoryName(a.category))}${a.phone?` · <bdi>${html(a.phone)}</bdi>`:''}</small><small>${html(fmt(v.count))} حركة${v.latest?` · آخرها ${html(D(v.latest))}`:' · لا حركات بعد'}</small><span class="account-card-open-hint">فتح كشف الحساب ${icon('left',13)}</span></span></span><span class="account-card-balance"><small>الرصيد · ${html(u.code)}</small>${amt(v.minor)}<span class="${v.minor>0?'text-pos':v.minor<0?'text-neg':''}">${v.minor>0?'لي':v.minor<0?'عليّ':'متوازن'}</span></span></button><div class="account-card-actions">${button('إضافة حركة','new-entry','plus','btn-primary btn-small',`data-account="${html(a.id)}"`)}${ib('خيارات الحساب','account-options','more',`data-id="${html(a.id)}"`)}</div></article>`).join('')}</div>`;
  return `<div class="account-desktop-table">${table}</div>${cards}${pager(filtered.length,pages,'حساب')}`;
}
function dates(scope,f) {
  return `<label class="field-date">من <input class="input" type="date" aria-label="من تاريخ" data-scope="${scope}" data-filter="from" value="${html(f.from)}"></label><label class="field-date">إلى <input class="input" type="date" aria-label="إلى تاريخ" data-scope="${scope}" data-filter="to" value="${html(f.to)}"></label>`;
}
const wrongRange=f=>f.from&&f.to&&f.from>f.to;
function movesControls(scope,f,withAccount=true) {
  const extra=`${withAccount?`<select class="control-select" aria-label="تصفية الحسابات" data-scope="${scope}" data-filter="account">${acctOptions(f.account)}</select>`:''}<select class="control-select" aria-label="نوع الحركة" data-scope="${scope}" data-filter="kind">${[['','كل أنواع الحركات'],['credit','لي'],['debit','عليّ'],['transfer','تحويل']].map(([v,l])=>opt(v,l,f.kind)).join('')}</select>${dates(scope,f)}${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small clear-filters',`data-scope="${scope}"`)}`;
  return `<div class="toolbar simple-toolbar">${search(scope,'ابحث في الحركات…',f.query)}${filtersMore(extra,!!(f.account||f.kind||f.from||f.to))}</div>`;
}
function renderMoves() {
  return `${heading('الحركات','',currency()+button('إضافة حركة','new-entry','plus','btn-primary'))}
    <div class="view-links">${link('تحويل بين حسابين','new-transfer','moves')}${link('سندات القبض','collection-open','file','data-key="receipts"')}</div>
    <section class="panel">${movesControls('moves',u.moves)}<div id="view-results"></div></section>`;
}
function entryBadge(e,m=e.legs?.[0]?.minor) {
  return e.receipt?`<span class="badge negative">سند قبض <bdi>#${L.receiptNumber(e.receipt.number)}</bdi></span>`:e.isolatedTransfer?'<span class="badge transfer">طرف تحويل</span>':e.legs?.length===2?'<span class="badge transfer">تحويل</span>':e.closed?'<span class="badge amber">رصيد مرحّل</span>':status(m);
}
function moveRows(es,account='') {
  if(!es.length)return emptyView('لا توجد حركات مطابقة','جرّب تغيير العملة أو التصفية.','moves');
  const {shown,pages}=getPage(es);
  return `<div class="scroll-table"><table class="data-table"><thead><tr><th>الحساب</th><th>التاريخ</th><th>التفاصيل</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>${shown.map(e=>{const t=e.legs.length===2;return `<tr><td><button class="row-button" type="button" data-action="entry-info" data-id="${html(e.id)}"><span class="row-name">${html(entryCaption(e,data.settings.transferDetails))}</span></button></td><td>${html(D(e.day,{day:'numeric',month:'short',year:'numeric'}))}</td><td class="memo">${html(e.memo||'—')}</td><td>${entryBadge(e)}</td><td>${amt(QaydTotals.detailAmount(e,account,u.code),!t,!t||!!account)}</td></tr>`;}).join('')}</tbody></table></div>${pager(es.length,pages,'حركة')}`;
}
function statementData(code=u.code) {
  const f=u.statement;
  const cl=L.accountClosure(data,u.account,code);
  const auto=!!(cl&&(f.from||f.to)&&(!f.from || f.from<=cl.day));
  const result=L.statement(data,u.account,code,{from:f.from,to:f.to,archive: f.archive||auto});
  const query=L.searchKey(f.query),advanced=QaydAccountFeatures.hasFilters(f);
  const rows=query||advanced?result.rows.filter(r=>QaydAccountFeatures.includesRow(r,f)&&(!query||L.searchKey([r.day,r.time,r.memo,L.decimal(r.minor),data.settings.transferDetails?transferNote(r,u.account):''].join(' ')).includes(query))):result.rows;
  return {...result,rows,auto,summary:QaydTotals.statement({...result,rows,search:!!query||advanced})};
}
function transferNote(e,account) {
  if(e.legs?.length!==2)return '';
  const from=e.legs[0].account,to=e.legs[1].account;
  if(!account)return `${accountName(from)} ← ${accountName(to)}`;
  return account===from?'إلى '+accountName(to):'من '+accountName(from);
}
function renderAccount() {
  const a=currentAccount(), v=L.balances(data,u.code).get(a.id), c=codeInfo(), closed=L.accountClosure(data,a.id,u.code);
  const different=data.currencies.filter(x=>x.code!==u.code&&data.entries.some(e=>e.legs.some(l=>l.account===a.id&&l.code===x.code)));
  return `<div class="back-button">${goBtn('العودة للحسابات','accounts','arrowRight')}</div><div class="page-heading account-heading"><div class="account-title">${avatar(a,true)}<div><p class="eyebrow">كشف حساب</p><h1>${html(a.name)}</h1><p>${html(categoryName(a.category))}${a.phone?` · <bdi>${html(a.phone)}</bdi>`:''}${a.reminder?`<span class="row-sub">${icon('bell',12)} تذكير: <bdi>${html(a.reminder)}</bdi></span>`:''}</p></div></div><div class="page-actions">${button('إضافة حركة','new-entry','plus','btn-primary',`data-account="${html(a.id)}"`)}${v.minor>0?button('تسجيل قبض','collection-receipt','wallet','btn-outline',`data-account="${html(a.id)}"`):''}${ib('خيارات الحساب','account-options','more',`data-id="${html(a.id)}"`)}</div></div>
  <section class="panel account-balance"><div><span>صافي الرصيد</span><strong>${amt(v.minor)} <small>${html(c.symbol)}</small></strong></div>${currency()}<details><summary>إجمالي الحركات</summary><p>لي: ${amt(v.credit,false,false)} · عليّ: ${amt(v.debit,false,false)}</p>${different.length?`<p>عملات أخرى: ${html(different.map(x=>x.name).join('، '))}</p>`:''}</details></section>
  <div class="view-stack">${AccountUI.limitCard(a,c,v.minor)}${a.note?`<div class="account-note">${html(a.note)}</div>`:''}${closed?alertBox('جُمّعت '+fmt(closed.ids.length)+' حركة حتى '+D(closed.day,{day:'numeric',month:'long',year:'numeric'})+'. الأصل محفوظ في الأرشيف.',false,link(u.statement.archive?'عرض الرصيد المجمّع':'عرض الأرشيف','toggle-archive')+(closed.annual?link('إدارة الإغلاق السنوي','settings-open','', 'data-key="other"'):link('إلغاء الإغلاق','open-balance'))):''}
  <section class="panel"><div class="panel-head"><div><h2>كشف الحساب</h2><p>الحركات والرصيد بعد كل حركة.</p></div><div class="row-actions">${button('خيارات الكشف','export-options','more','btn-outline','data-target="statement"')}</div></div><div class="toolbar">${search('statement','ابحث في الكشف…',u.statement.query)}${dates('statement',u.statement)}${button('بحث متقدم','statement-search','filter','btn-outline btn-small')}${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small clear-filters','data-scope="statement"')}</div>${AccountUI.filterBadge(u.statement)}<div id="view-results"></div></section></div>`;
}
function statementRows() {
  const f=u.statement;
  if(wrongRange(f))return emptyView('الفترة غير صالحة','تاريخ البداية يجب أن يسبق تاريخ النهاية.','calendar');
  const v=statementData(),{shown,pages}=getPage(v.rows);
  const info=`<div class="report-head"><div class="report-summary"><span>رصيد البداية: ${amt(v.opening)}</span><span>الرصيد إلى نهاية الفترة: ${amt(v.ending)}</span>${v.auto?'<span>تظهر الحركات المؤرشفة حسب الفترة.</span>':''}</div></div>`;
  const final=renderFinalSummary(v.summary,codeInfo());
  if(!v.rows.length)return info+emptyView('لا حركات في الكشف','غيّر الفترة أو أضف حركة لهذا الحساب.','file')+final;
  return `${info}${data.settings.home.totals?renderFinalSummary(v.summary,codeInfo(),{preview:true}):''}<div class="scroll-table"><table class="data-table"><thead><tr><th>التاريخ</th><th>التفاصيل</th><th>النوع</th><th>المبلغ</th><th>الرصيد</th><th><span class="sr-only">إجراءات</span></th></tr></thead><tbody>${shown.map(r=>`<tr><td>${html(D(r.day,{day:'numeric',month:'short',year:'numeric'}))}${data.settings.home.time&&r.time?`<span class="row-sub"><bdi>${html(shownTime(r.time))}</bdi></span>`:''}</td><td class="memo">${r.photo?icon('image',13):''}${html(r.memo||'—')}${data.settings.transferDetails&&r.legs?.length===2?`<span class="row-sub">${html(transferNote(r,u.account))}</span>`:''}</td><td>${entryBadge(r,r.minor)}</td><td>${amt(r.minor,true)}</td><td>${amt(r.running)}</td><td>${r.closed?'':ib('خيارات الحركة','entry-info','more',`data-id="${html(r.id)}"`)}</td></tr>`).join('')}</tbody></table></div>${pager(v.rows.length,pages,'حركة')}${final}`;
}
const reportTabs=[['accounts','إجمالي الأرصدة'],['details','تفاصيل الحركات'],['months','إجمالي دوري'],['categories','حسب التصنيف']];
const reportTitle=()=>u.report.tab==='months'?'إجمالي المبالغ · '+periodsText[u.report.period]:reportTabs.find(x=>x[0]===u.report.tab)[1];
function renderReports() {
  const tab=u.report.tab,pick=fieldSelect('reportType','نوع التقرير',reportTabs.map(([key,label])=>opt(key,label,tab)).join(''),'data-change="report-kind"');
  return `${settingsBack()}${heading('التقارير','',button('خيارات التقرير','export-options','more','btn-outline','data-target="report"'))}
    <section class="panel"><div class="toolbar report-select-row">${pick}${currency()}</div>${tab==='details'?movesControls('report',u.report):`<div class="toolbar">${tab==='months'?`<select class="control-select" data-scope="report" data-filter="period" aria-label="فترة التجميع">${periodsOptions(u.report.period)}</select>`:''}${dates('report',u.report)}${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small clear-filters','data-scope="report"')}</div>`}<div id="view-results"></div></section>`;
}
const cellText=(v)=>({v,kind:'text'});
const cellNum=(v)=>({v,kind:'num'});
const cellMoney=(v)=>({v,kind:'money'});
const cellDay=(v)=>({v,kind:'day'});
const cellAccount=(v,id)=>({v,id,kind:'account'});
function reportData(code=u.code) {
  const f=u.report;
  const es=L.matching(data,{code,from:f.from,to:f.to,account:f.tab==='details'?f.account:'',query:f.tab==='details'?f.query:'',kind:f.tab==='details'?f.kind:''});
  if(f.tab==='details') {
    const cols=['التاريخ','الحساب','التفاصيل','النوع','المبلغ'];
    const rows=es.map(e=>[cellDay(e.day),cellText(entryCaption(e,data.settings.transferDetails)),cellText(e.memo||'—'),cellText(e.isolatedTransfer?'طرف تحويل':e.legs.length===2?'تحويل':e.legs[0].minor>0?'لي':'عليّ'),cellMoney(QaydTotals.detailAmount(e,f.account,code))]);
    return {cols,rows,es,summary:QaydTotals.details(es,f.account,code)};
  }
  if(f.tab==='months') {
    const m=L.flows(es,e=>L.periodKey(e.day,f.period));
    const rows=Array.from(m.entries()).sort((a,b)=>b[0].localeCompare(a[0])).map(([k,x])=>[cellText(periodLabel(k,f.period)),cellNum(x.count),cellMoney(x.credit),cellMoney(x.debit),cellMoney(x.credit-x.debit)]);
    return {cols:['الفترة','الحركات','لي','عليّ','الصافي'],rows,summary:{...reportSum(rows,2,3,4),note:'التحويلات الداخلية لا تدخل في الإجماليات.'}};
  }
  const balances=L.balances({...data,entries:es},code);
  const total=L.totals(balances);
  if(f.tab==='categories') {
    const groups=new Map();
    for(const a of data.accounts) {
      const v=balances.get(a.id); if((f.from||f.to)&&!v.count)continue;
      const x=groups.get(a.category)||{count:0,credit:0,debit:0,net:0};
      x.count++;x.net+=v.minor;
      if(v.minor>0)x.credit+=v.minor;else x.debit-=v.minor;
      groups.set(a.category,x);
    }
    const rows=Array.from(groups.keys()).sort((a,b)=>categoryName(a).localeCompare(categoryName(b),'ar')).map(id=>{const x=groups.get(id);return [cellText(categoryName(id)),cellNum(x.count),cellMoney(x.credit),cellMoney(x.debit),cellMoney(x.net)];});
    return {cols:['التصنيف','الحسابات','لي','عليّ','الصافي'],rows,summary:{credit:total.credit,debit:total.debit,net:total.net,note:'الإجماليات بحسب صافي رصيد كل حساب في الفترة المحددة.'}};
  }
  const rows=data.accounts.slice().sort((a,b)=>a.name.localeCompare(b.name,'ar')).filter(a=>!(f.from||f.to)||balances.get(a.id).count).map(a=>{
    const v=balances.get(a.id);return [cellAccount(a.name,a.id),cellText(categoryName(a.category)),cellNum(v.count),cellMoney(Math.max(0,v.minor)),cellMoney(Math.max(0,-v.minor)),cellMoney(v.minor)];
  });
  return {cols:['الحساب','التصنيف','الحركات','لي','عليّ','صافي الرصيد'],rows,summary:{credit:total.credit,debit:total.debit,net:total.net,note:'الإجماليات بحسب صافي رصيد كل حساب في الفترة المحددة.'}};
}
function reportSum(rows,i,j,k) {return rows.reduce((a,r)=>({credit:a.credit+r[i].v,debit:a.debit+r[j].v,net:a.net+r[k].v}),{credit:0,debit:0,net:0});}
function renderReportRows() {
  if(wrongRange(u.report))return emptyView('الفترة غير صالحة','تاريخ البداية يجب أن يسبق تاريخ النهاية.','calendar');
  const p=reportData();
  const final=renderFinalSummary(p.summary,codeInfo());
  if(u.report.tab==='details')return moveRows(p.es,u.report.account)+final;
  if(!p.rows.length)return emptyView('لا بيانات للفترة المحددة','جرّب عملة أخرى أو عدّل نطاق التواريخ.','report')+final;
  const {shown,pages}=getPage(p.rows);
  const tbl=`<div class="scroll-table"><table class="data-table"><thead><tr>${p.cols.map(c=>`<th>${html(c)}</th>`).join('')}</tr></thead><tbody>${shown.map(r=>`<tr>${r.map((c,i)=>`<td>${c.kind==='account'?`<button class="row-button" type="button" data-action="open-account" data-id="${html(c.id)}">${html(c.v)}</button>`:c.kind==='money'?amt(c.v,false,i===r.length-1):c.kind==='num'?`<bdi>${html(fmt(c.v))}</bdi>`:html(c.v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `${tbl}${pager(p.rows.length,pages)}${final}`;
}
function currencyLabel(c){return `${c.name} (${c.code})`;}
function renderFinalSummary(summary,c,{preview=false}={}) {
  if(!summary)return '';
  const title=preview?'إجمالي العمليات':summary.title||'ملخص نهاية التقرير';
  return `<section class="report-final${preview?' report-final-preview':''}" aria-label="${html(title)}">
    <div class="report-final-head"><h3>${html(title)}</h3><span class="report-final-unit">العملة: ${html(c.name)} <bdi>(${html(c.code)})</bdi></span></div>
    <dl>${QaydTotals.fields(summary).map(([key,label,value])=>`<div class="final-${key}"><dt>${html(label)}</dt><dd>${amt(value,false,!['credit','debit'].includes(key))}</dd></div>`).join('')}</dl>${summary.note&&!preview?`<p>${html(summary.note)}</p>`:''}</section>`;
}
function renderCurrencies() {
  return `${settingsBack()}${heading('العملات','',button('عملة جديدة','currency-form','plus','btn-primary'))}<div class="view-stack">${alertBox('العملة الافتراضية: '+codeInfo(data.settings.defaultCode).name+'. غيّرها من الإعدادات.')}
  <div class="manage-grid">${data.currencies.map(c=>{const b=L.balances(data,c.code);const n=Array.from(b.values()).filter(x=>x.count>0).length;return `<article class="panel manage-item"><span class="tint"><bdi>${html(c.symbol)}</bdi></span><div class="info"><h2>${html(c.name)}</h2><p><bdi>${html(c.code)}</bdi> · ${html(fmt(n))} حساب</p></div>${ib('تعديل العملة','currency-form','edit',`data-id="${html(c.code)}"`)}${ib('حذف العملة','delete-currency','trash',`data-id="${html(c.code)}"`)}</article>`;}).join('')}</div></div>`;
}
function renderCategories() {
  return `${settingsBack()}${heading('التصنيفات','',button('تصنيف جديد','category-form','plus','btn-primary'))}${data.categories.length?`<div class="manage-grid">${data.categories.map(c=>`<article class="panel manage-item">${stamp('tag',html(c.color))}<div class="info"><h2>${html(c.name)}</h2><p>${html(fmt(data.accounts.filter(a=>a.category===c.id).length))} حساب</p></div>${ib('تعديل التصنيف','category-form','edit',`data-id="${html(c.id)}"`)}${ib('حذف التصنيف','delete-category','trash',`data-id="${html(c.id)}"`)}</article>`).join('')}</div>`:emptyView('لا تصنيفات بعد','أضف تصنيفًا مثل عملاء أو موردين.','tag')}`;
}
function renderResults() {
  const node=qs('#view-results');if(!node)return;
  if(u.view==='accounts')node.innerHTML=acctRows();
  if(u.view==='moves')node.innerHTML=wrongRange(u.moves)?emptyView('الفترة غير صالحة','تاريخ البداية يجب أن يسبق تاريخ النهاية.','calendar'):moveRows(L.matching(data,{code:u.code,...u.moves}));
  if(u.view==='account')node.innerHTML=statementRows();
  if(u.view==='reports')node.innerHTML=renderReportRows();
  if(u.view==='collections')node.innerHTML=CollectionsUI.renderResults();
}
const dlg=qs('#dialog');
let modalHandler=null,restoreSaveId=null,restoreSaveCounter=0,dbReading=null;
function stopDbReading(){if(dbReading){const task=dbReading;dbReading=null;task.cancel();}}
function closeDialog() {MovementNotice.clear();MessagePhoneUI.reset();stopLan();stopDbReading();restoreSaveId=null;if(readingNativeBackup)dropBackupOffer(readingNativeBackup);if(dlg.open)dlg.close();modalHandler=null;qs('#dialog-content').innerHTML='';}
const cancelBtn=()=>button('إلغاء','close-dialog','','btn-outline');
const submitBtn=(name='حفظ',danger=false)=>`<button class="btn ${danger?'btn-danger':'btn-primary'}" type="submit">${icon(danger?'trash':'check',16)}${html(name)}</button>`;
function modal(title,sub,content,{onSubmit=null,footer='',focus=''}={}) {
  MovementNotice.clear();MessagePhoneUI.reset();
  const head=`<div class="dialog-head"><div><h2 id="dialog-title">${html(title)}</h2>${sub?`<p>${html(sub)}</p>`:''}</div>${ib('إغلاق','close-dialog','close')}</div>`;
  const mid=`<div class="dialog-inner">${content}<div class="form-error" role="alert" hidden></div></div>`;
  const foot=footer?`<div class="dialog-foot">${footer}</div>`:'';
  if(sharingLan)stopLan();
  stopDbReading();
  if(readingNativeBackup)dropBackupOffer(readingNativeBackup);
  restoreSaveId=null;modalHandler=onSubmit;
  qs('#dialog-content').innerHTML=head+(onSubmit?`<form id="dialog-form">${mid}${foot}</form>`:mid+foot);
  if(!dlg.open)dlg.showModal();
  dlg.scrollTop=0;
  const target=focus&&qs(focus,dlg);if(target)target.focus({preventScroll:true});
}
function modalError(msg) {const el=qs('.form-error',dlg);if(el){el.textContent=msg;el.hidden=false;el.scrollIntoView({block:'nearest'});}else toast(msg,true);}
function confirmBox(title,text,act,label='تأكيد',danger=false) {
  modal(title,'',alertBox(text,danger),{onSubmit:act,footer:cancelBtn()+submitBtn(label,danger)});
}
const field=(name,label,value='',attrs='',type='text')=>`<label class="field">${html(label)}<input class="input" type="${type}" name="${name}" value="${html(value)}" ${attrs}></label>`;
const fieldSelect=(name,label,options,attrs='')=>`<label class="field">${html(label)}<select class="input" name="${name}" ${attrs}>${options}</select></label>`;
const fieldMemo=(name,label,value,max=600)=>`<label class="field full">${html(label)}<textarea class="input" name="${name}" maxlength="${max}" rows="3" placeholder="اختياري">${html(value)}</textarea></label>`;
const FD=form=>Object.fromEntries(new FormData(form));
function accountForm(id='',after=null) {
  const a=getAccount(id),category=catOptions(a?a.category:(data.categories.some(c=>c.id==='general')?'general':''),'بلا تصنيف');
  const optional=`<details class="full account-extra" data-disclosure="account-extra"${a?' open':''}><summary>بيانات إضافية <small>التصنيف والهاتف والتذكير والملاحظات</small></summary><div class="form-grid account-extra-fields">${fieldSelect('category','التصنيف',category)}${field('phone','رقم الهاتف',a?.phone||'','maxlength="48" autocomplete="off" dir="ltr"','tel')}${field('reminder','تذكير يوم (09:00)',a?.reminder||'','dir="ltr"','date')}${fieldMemo('note','ملاحظات',a?.note||'',400)}<label class="check-field full"><input type="checkbox" name="favorite" ${a?.favorite?'checked':''}>إضافة إلى المفضلة</label></div></details>`;
  modal(a?'تعديل الحساب':'حساب جديد',a?'عدّل بيانات الحساب من دون تغيير رصيده.':'أدخل الاسم فقط؛ بيانات الاتصال والتصنيف اختيارية.',`<div class="form-grid"><div class="full">${field('name','اسم الحساب',a?.name||'','required maxlength="90" autocomplete="off" placeholder="مثال: أحمد محمد"')}</div>${optional}</div>`,{
    onSubmit:async f=>{const x=FD(f);const ac=await mutate(n=>{
      const x2=L.addAccount(n,{...x,id,favorite:!!x.favorite});
      if(!a||JSON.stringify(a)!==JSON.stringify(x2))ActivityUI.add(n,a?'account-edit':'account-add',x2.name,a&&a.name!==x2.name?'الاسم السابق: '+a.name:a?'حُفظت بيانات الحساب.':'حساب جديد.');
      return x2;
    });done(a?'حُفظت بيانات الحساب.':'أضيف الحساب.');if(after)after(ac.id);else if(!a)go('account',ac.id);},footer:cancelBtn()+submitBtn('حفظ الحساب'),focus:'[name="name"]'});
}
function localDestination(){
  return `<div class="entry-destination" data-destination="phone">${stamp('lock')}<div><strong>وجهة الحفظ: ${data.demo?'دفتر التجربة':'دفتر الهاتف'}</strong><span>على هذا الجهاز فقط؛ لا تُرسل الحركة إلى الفريق.</span></div></div>`;
}
function entryForm({account='',id='',transfer=false,collectionReceipt=false,receiptTarget=''}={}) {
  const e=id&&data.entries.find(x=>x.id===id);
  if(id&&!e)return;
  if(e&&L.isLocked(data,id))throw new Error('ألغِ إغلاق الرصيد لتعديل الحركة المؤرشفة.');
  if(e)transfer=e.legs.length===2;
  if(transfer&&data.accounts.length<2) {
    modal('تحويل بين الحسابات','',alertBox('تحتاج إلى حسابين على الأقل لإجراء تحويل داخلي.'),{footer:cancelBtn()+button('إضافة حساب','new-account','plus','btn-primary')});return;
  }
  const a=getAccount(e?e.legs[0].account:account);
  const oldCode=e?e.legs[0].code:u.code, oldAmount=e?L.inputDecimal(Math.abs(e.legs[0].minor)):'',oldDay=e?e.day:L.localDay();
  if(collectionReceipt&&!a)return;
  const receipt=!!e?.receipt||(collectionReceipt&&!e&&!transfer);
  const role=e&&e.legs[0].minor<0?'debit':'credit';
  const kind=`<div class="field full">نوع الحركة<div class="role-toggle"><label><input type="radio" name="kind" value="credit" ${role==='credit'?'checked':''}><span>${icon('credit',17)}لي</span></label><label><input type="radio" name="kind" value="debit" ${role==='debit'?'checked':''}><span>${icon('debit',17)}عليّ</span></label></div></div>`;
  const accountInputs=transfer?fieldSelect('from','من حساب',acctOptions(a?.id||'','اختر المصدر'),'required')+fieldSelect('to','إلى حساب',acctOptions(e?e.legs[1].account:'','اختر الوجهة'),'required'):receipt?`<div class="full">${field('accountName','قبض من حساب',a.name,'readonly')}</div><input type="hidden" name="kind" value="debit">`:autoAccountInput(a?.name||'')+kind;
  const txt=receipt?(e?'يبقى رقم السند كما هو بعد التعديل.':'يُصدِر سندًا مرقّمًا ويسجّل قيد قبض فقط؛ لا ينفّذ دفعًا.'):transfer?'يسجّل قيدًا سالبًا في المصدر وموجبًا في الوجهة، دون إرسال أموال.':'لي يزيد رصيدك لدى الحساب؛ عليّ يخفضه.';
  const dueControl=receipt?'':`<div class="collect-due-control" id="entry-due">${field('due',transfer?'استحقاق طرف الوجهة':'استحقاق اختياري',e?.due||'',`dir="ltr" min="${oldDay}" max="9999-12-31"`,'date')}<p class="subtle">أضف الموعد المتفق عليه، أو اتركه فارغًا ليظهر المبلغ «بلا موعد» في التحصيل.</p></div>`;
  const time=field('time','الوقت',e?.time||L.localTime(),'required dir="ltr"','time');
  const notes=fieldMemo('memo',receipt?'ملاحظة داخلية':'البيان (اختياري)',e?.memo||'');
  const more=time+dueControl+calcBlock()+photoWidget('receipt',e?.photo||'','إرفاق صورة')+(transfer||receipt?'':'<section id="entry-preview" class="receipt-preview full" hidden></section>');
  const extra=`<details id="${receipt?'voucher-extra':'entry-extra'}" class="full entry-extra"><summary>تفاصيل إضافية</summary><div class="form-grid">${receipt?notes:''}${more}</div></details>`;
  modal(receipt?(e?'تعديل سند القبض':'تسجيل قبض'):e?(transfer?'تعديل التحويل':'تعديل الحركة'):(transfer?'تحويل بين الحسابات':'إضافة حركة'),txt,localDestination()+`<div class="form-grid">${accountInputs}${field('amount','المبلغ',oldAmount,'required inputmode="decimal" autocomplete="off" dir="ltr" maxlength="23" placeholder="0.00"')}${fieldSelect('code','العملة',curOptions(oldCode),receipt?'disabled':'required')}${data.settings.words?'<p class="date-help full" id="amount-words" aria-live="polite"></p>':''}${field('day','التاريخ',oldDay,`required min="1000-01-01" max="${receipt?L.localDay():'9999-12-31'}" dir="ltr"`,'date')}${receipt?ReceiptBookUI.formFields(e,a,oldCode,receiptTarget):notes}${extra}<div id="entry-limit-preview" class="full account-limit-preview" data-entry="${html(id)}" role="status" hidden></div></div>`,{
    onSubmit:async f=>{
      const x=FD(f);
      const photo=photoValue(f,'receipt');
      const saved=await mutate(n=>{
        if(receipt){
          x.account=a.id;x.code=oldCode;x.kind='debit';
          x.receipt={method:x.receiptMethod,reference:x.receiptRef,target:x.receiptTarget};
        }else if(!transfer){
          const name=x.accountName.trim();let found=n.accounts.find(a=>L.searchKey(a.name)===L.searchKey(name));
          if(!found){found=L.addAccount(n,{name});ActivityUI.add(n,'account-add',found.name,'أُنشئ الحساب عند تسجيل الحركة.');}
          x.account=found.id;
        }
        const fields={...x,id,photo,kind:transfer?'transfer':x.kind};
        const result=receipt?QaydCollections.saveReceipt(n,fields):L.saveEntry(n,fields);
        ActivityUI.entry(n,e?'entry-edit':'entry-add',e||null,result);
        return result;
      });
      u.code=saved.legs[0].code;
      const warnings=AccountUI.warnings(saved.legs,e?.legs||[]);
      const scope=data.demo?'دفتر التجربة':'دفتر الهاتف';
      const success=receipt?`حُفظ سند القبض رقم ${L.receiptNumber(saved.receipt.number)} في ${scope}.`:transfer?`حُفظ التحويل بين الحسابين في ${scope}.`:`حُفظت الحركة في ${scope}.`;
      closeDialog();render();
      if(receipt&&e)ReceiptBookUI.show(saved.id);
      const offered=!e&&doAdded(saved,success);
      if(warnings.length)toast(success+' '+warnings.join(' '),true);
      else if(!offered)toast(success);
    },footer:cancelBtn()+submitBtn(data.demo?'حفظ في دفتر التجربة':'حفظ في دفتر الهاتف'),focus:transfer?'[name="from"]':a?'[name="amount"]':'[name="accountName"]'});
  showWords();entryPreview();syncDueField();if(receipt)ReceiptBookUI.updateChoices();
}
function syncDueField(){
  const wrap=qs('#entry-due',dlg);if(!wrap)return;
  const fields=qs('#dialog-form',dlg).elements;
  const shown=!fields.kind||fields.kind.value==='credit';
  wrap.hidden=!shown;fields.due.disabled=!shown;
  fields.due.min=L.validDay(fields.day.value)?fields.day.value:'1000-01-01';
}
function showWords() {
  const p=qs('#amount-words',dlg),a=qs('[name="amount"]',dlg);if(!p||!a)return;
  try {p.textContent='المبلغ كتابة: '+L.numberWords(L.parseAmount(a.value))+' · '+codeInfo(qs('[name="code"]',dlg).value).name;}
  catch {p.textContent='';}
}
function entryInfo(id) {
  const e=data.entries.find(x=>x.id===id);if(!e)return;
  if(e.receipt)return ReceiptBookUI.show(id);
  const t=e.legs.length===2,l=e.legs[0],closed=L.isLocked(data,id),positive=e.legs.some(x=>x.minor>0);
  const due=positive?`<div class="collect-entry-due"><span class="subtle">${t?'استحقاق الوجهة':'تاريخ الاستحقاق'}: ${e.due?`<bdi>${html(e.due)}</bdi>`:'بلا موعد'}</span>${button('موعد الاستحقاق','collection-due','calendar','btn-outline btn-small',`data-id="${html(e.id)}"`)}</div>`:'';
  modal(t?'تفاصيل التحويل':e.isolatedTransfer?'طرف تحويل مسترجع':'تفاصيل الحركة','',`<div class="details-record"><div><span>التاريخ</span><strong>${html(D(e.day,{day:'numeric',month:'long',year:'numeric'}))}${data.settings.home.time?` · <bdi>${html(shownTime(e.time))}</bdi>`:''}</strong></div>${t?`<div><span>من حساب</span><strong>${html(accountName(l.account))}</strong></div><div><span>إلى حساب</span><strong>${html(accountName(e.legs[1].account))}</strong></div>`:`<div><span>الحساب</span><strong>${html(accountName(l.account))}</strong></div>`}<div><span>نوع الحركة</span>${entryBadge(e)}</div><div><span>المبلغ</span><strong>${amt(t?Math.abs(l.minor):l.minor,!t,!t)} ${html(codeInfo(l.code).name)}</strong></div><div><span>التفاصيل</span><strong>${html(e.memo||'—')}</strong></div></div>${due}${positive?ReceiptBookUI.linkedNotice(e):''}${e.isolatedTransfer?alertBox('هذا الطرف محفوظ من نسخة تصنيف. يُحتسب مبلغه كما هو، ولا يوجد قيد مقابل مرتبط به.'):''}${e.photo?`<figure class="receipt-details"><img src="${html(e.photo)}" alt="صورة الإيصال"></figure>`:''}${closed?alertBox('هذه الحركة في أرشيف رصيد مغلق. ألغِ الإغلاق من كشف الحساب لتعديلها أو حذفها.',true):''}`,{footer:button('إغلاق','close-dialog','','btn-outline')+button('مسودة إشعار','draft-recipients','mail','btn-outline',`data-id="${html(id)}"`)+button('مشاركة','share-entry','share','btn-outline',`data-id="${html(id)}"`)+(closed?'':button('حذف','delete-entry','trash','btn-outline btn-text-danger',`data-id="${html(id)}"`)+button('تعديل','edit-entry','edit','btn-primary',`data-id="${html(id)}"`))});
}
function accountOptions(id) {
  const a=getAccount(id);if(!a)return;
  const attr=`data-id="${html(a.id)}"`,detail=`data-account="${html(a.id)}"`;
  const actions=(title,body)=>`<section class="account-menu-section"><h3>${html(title)}</h3><div class="account-menu-grid">${body}</div></section>`;
  const msg=(title,ch,key='balance')=>button(title,'balance-message',ch==='sms'?'mail':'chat','btn-outline',`${attr} data-channel="${ch}" data-key="${key}"`);
  const active=u.view==='account'&&u.account===id;
  const contact=actions('إرسال الرصيد',msg('رسالة نصية (SMS)','sms')+msg('رسالة واتساب','wa')+msg('SMS + واتساب','both')+msg('مصادقة عبر واتساب','wa','confirmation'));
  const admin=actions('إدارة الحساب',
    (!active?button('فتح كشف الحساب','open-account','file','btn-primary',attr):'')+
    button('تعديل بيانات الحساب','edit-account','edit','btn-outline',attr)+button('تذكير الحساب','account-reminder','bell','btn-outline',attr)+button('خطة التحصيل','collection-account','wallet','btn-outline',attr)+
    button('سقف الحساب','account-limit','shield','btn-outline',attr)+button('تحويل من هذا الحساب','new-transfer','moves','btn-outline',detail)+
    button('إغلاق الرصيد · '+codeInfo().code,'close-balance','archive','btn-outline',attr)+
    button(a.favorite?'إزالة من المفضلة':'إضافة إلى المفضلة','toggle-favorite','star','btn-outline',attr)+button('حذف الحساب','delete-account','trash','btn-outline btn-text-danger',attr));
  modal('خيارات الحساب',a.name,admin+contact);
}
function closeBalanceForm(id) {
  const a=getAccount(id);if(!a)return;
  modal('إغلاق وتجميع الرصيد',a.name+' · '+codeInfo().name,`<div class="form-grid">${field('day','التجميع حتى تاريخ',L.localDay(),`required max="${L.localDay()}" dir="ltr"`,'date')}<div class="full">${alertBox('يظهر صافي الحركات حتى هذا التاريخ في سطر واحد. تبقى التفاصيل في الأرشيف، ولا يتغير الرصيد. التسجيل داخل الفترة المغلقة يتطلب إلغاء الإغلاق.')}</div></div>`,{
    onSubmit:async f=>{await mutate(n=>{const day=FD(f).day;L.closeBalance(n,id,u.code,day);ActivityUI.add(n,'account-close',a.name,`${u.code} · حتى ${day}`);});done('جُمّع الرصيد وحُفظت التفاصيل في الأرشيف.',false);go('account',id);},footer:cancelBtn()+submitBtn('إغلاق الرصيد')});
}
const swatches=[['indigo','أزرق'],['mint','أخضر'],['amber','ذهبي'],['rose','وردي'],['sky','سماوي'],['violet','بنفسجي']];
function categoryForm(id='') {
  const c=getCategory(id);
  modal(c?'تعديل التصنيف':'تصنيف جديد','',`<div class="form-grid">${field('name','اسم التصنيف',c?.name||'','required maxlength="50" autocomplete="off"')}${fieldSelect('color','اللون',swatches.map(([v,l])=>opt(v,l,c?.color||'indigo')).join(''))}</div>`,{
    onSubmit:async f=>{const x=FD(f);await mutate(n=>{const i=n.categories.findIndex(y=>y.id===id);const c={...x,id:id||L.id()};if(i<0)n.categories.push(c);else n.categories[i]=c;});done('حُفظ التصنيف.');},footer:cancelBtn()+submitBtn(),focus:'[name="name"]'});
}
function currencyForm(id='') {
  const c=data.currencies.find(x=>x.code===id);
  modal(c?'تعديل العملة':'عملة جديدة','تُحفظ قيم العملات منفصلة، بثلاث منازل عشرية على الأكثر.',`<div class="form-grid"><div class="full">${field('name','اسم العملة',c?.name||'','required maxlength="45" placeholder="مثال: درهم إماراتي"')}</div>${field('code','رمز العملة',c?.code||'','required maxlength="8" dir="ltr" autocomplete="off" placeholder="AED" '+(c?'readonly':''))}${field('symbol','اختصار العرض',c?.symbol||'','required maxlength="12" placeholder="د.إ"')}</div>`,{
    onSubmit:async f=>{const x=FD(f);x.code=x.code.trim().toUpperCase();await mutate(n=>{const i=n.currencies.findIndex(y=>y.code===id);if(i<0)n.currencies.push(x);else n.currencies[i]={...x,code:id};});done('حُفظت العملة.');},footer:cancelBtn()+submitBtn(),focus:'[name="name"]'});
}
function exportData(target, code=u.code, printing=false, id='') {
  if(target==='voucher')return ReceiptBookUI.voucherDocument(id);
  if(target==='receipt-register')return ReceiptBookUI.registerReport(code);
  if(target==='collection'||target==='collection-aging')return CollectionsUI.exportReport(target,code);
  const statement=target==='statement';
  const f=statement?u.statement:u.report;
  if(wrongRange(f))throw new Error('صحّح نطاق التواريخ أولًا.');
  const c=codeInfo(code),unit=currencyLabel(c);
  const range=(f.from||f.to)?`الفترة: ${f.from||'البداية'} — ${f.to||'بلا حدّ نهائي'}`:'الفترة: جميع التواريخ';
  const kindLabels={credit:'لي',debit:'عليّ',transfer:'تحويل'};
  const notes=[`العملة: ${unit}`,range,...((statement||f.tab==='details')&&f.query?['بحث: '+f.query]:[])];
  if(!statement&&f.tab==='details'){
    if(f.account)notes.push('الحساب: '+accountName(f.account));
    if(f.kind)notes.push('النوع: '+kindLabels[f.kind]);
  }
  if(statement) {
    const a=currentAccount();if(!a)throw new Error('افتح حسابًا أولًا.');
    const x=statementData(code),t=data.settings.print;
    const fmtType=r=>r.receipt?'سند #'+L.receiptNumber(r.receipt.number):r.closed?'رصيد مرحّل':r.legs.length===2?'تحويل':r.isolatedTransfer?'طرف تحويل':r.minor>0?(printing?t.credit:'لي'):(printing?t.debit:'عليّ');
    const ordered=printing&&!t.ascending?x.rows.slice().reverse():x.rows;
    const rows=ordered.map(r=>[cellDay(r.day+(printing&&data.settings.home.time&&r.time?' '+r.time:'')),cellText([r.memo,data.settings.transferDetails?transferNote(r,a.id):''].filter(Boolean).join(' · ')||'—'),cellText(fmtType(r)),cellMoney(r.minor),cellMoney(r.running)]);
    return {title:'كشف حساب — '+a.name,heading:a.name,type:'statement',currency:c,file:`qayd-statement-${c.code}-${L.localDay()}`,cols:['التاريخ','التفاصيل','النوع','المبلغ','الرصيد'],rows,
      notes:[...notes,...AccountUI.filterNotes(f),...(x.auto?['تظهر حركات الأرشيف حسب الفترة المحددة.']:[])],summary:x.summary};
  }
  const p=reportData(code);
  if(printing&&['months','details'].includes(f.tab)&&data.settings.print.ascending)p.rows.reverse();
  return {title:'تقرير — '+reportTitle(),heading:reportTitle(),type:f.tab,currency:c,file:`qayd-report-${f.tab}-${c.code}-${L.localDay()}`,cols:p.cols,rows:p.rows,notes,summary:p.summary};
}
function printDoc(target,code=u.code,id='') {
  const p=exportData(target,code,true,id);
  const docs=target==='statement'?statementCodes(code).map(c=>c.code===code?p:exportData(target,c.code,true)):[p];
  return paintPrint(p.title,printHeading(p.title)+docs.map(printTable).join('')+(target==='voucher'?ReceiptBookUI.signatures():'')+printFoot());
}
function download(filename,mime,content) {
  if(native){native.saveFile(filename,mime,content);return;}
  requestDownload(filename,new Blob([content],{type:mime+';charset=utf-8'}));
}
function requestDownload(filename,blob) {
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),20000);
  toast('طُلب تنزيل الملف.');
}
async function shareFile(filename,mime,content) {
  if(native){native.shareFile(filename,mime,content);return;}
  const file=new File([content],filename,{type:mime});
  if(navigator.canShare?.({files:[file]})) {
    try {await navigator.share({files:[file],title:filename});return;}catch(e){if(e.name==='AbortError')return;}
  }
  download(filename,mime,content);
}
function csvExport(target,shared=false) {
  const p=exportData(target);
  const full=(...values)=>p.cols.map((_,i)=>values[i]??'');
  const totals=[...p.notes.slice(1).map(n=>full(n)),full('ملخص نهاية التقرير',currencyLabel(p.currency)),...QaydTotals.fields(p.summary).map(([,label,value])=>full(label,value/L.SCALE)),...(p.summary.note?[full(p.summary.note)]:[])];
  const payload=L.csv([p.cols,...p.rows.map(row=>row.map(c=>c.kind==='money'?c.v/L.SCALE:c.v)),full(),...totals]);
  closeDialog();return (shared?shareFile:download)(p.file+'.csv','text/csv',payload);
}
async function xlsxExport(target,shared=false) {
  const p=exportData(target),filename=p.file+'.xlsx',mime=QaydXlsx.MIME;
  formBusy=true;
  try{
    const bytes=await QaydXlsx.build(p,L.decimal,QaydTotals.fields(p.summary));
    if(native&&!native.exportWorkbook)throw new Error('تحتاج إلى تحديث قيد لحفظ ملف Excel على الجهاز.');
    closeDialog();
    if(native){native.exportWorkbook(filename,QaydAccountFeatures.base64(bytes),shared?'share':'local');return;}
    const file=new File([bytes],filename,{type:mime});
    if(shared&&navigator.canShare?.({files:[file]}))try{await navigator.share({files:[file],title:filename});return;}catch(e){if(e.name==='AbortError')return;}
    requestDownload(filename,file);
  }finally{formBusy=false;}
}
async function shareReportText(target) {
  const p=exportData(target);
  const value=[p.title,...p.notes,`${fmt(p.rows.length)} سجل`,'','ملخص نهاية التقرير',`العملة: ${currencyLabel(p.currency)}`,
    ...QaydTotals.fields(p.summary).map(([,label,value])=>`${label}: ${money(value)}`),p.summary.note].filter(x=>x!=='').join('\n');
  return shareTextValue(value,p.title);
}
async function shareTextValue(value,title) {
  if(native){closeDialog();native.shareText(value);return;}
  if(navigator.share){try{await navigator.share({text:value,title});closeDialog();return;}catch(e){if(e.name==='AbortError')return;}}
  try {await navigator.clipboard.writeText(value);closeDialog();toast('نُسخ ملخص الكشف.');}
  catch {modal('نسخ الملخص','حدّد النص وانسخه لمشاركته.',`<textarea class="input" readonly rows="6">${html(value)}</textarea>`,{footer:button('إغلاق','close-dialog','','btn-outline')});}
}
function exportOptions(target) {
  const p=exportData(target),t=`data-target="${target}"`;
  modal('خيارات التصدير والمشاركة',p.title,`<div class="account-menu-grid export-option-grid">${button('عرض PDF داخل قيد','view-pdf','file','btn-primary',t)}${button('حفظ Excel (‎.xlsx)','xlsx','download','btn-outline',t)}${button('مشاركة Excel','xlsx-share','share','btn-outline',t)}${button('تنزيل CSV','csv','download','btn-outline',t)}${button('مشاركة ملف CSV','csv-share','share','btn-outline',t)}${button('مشاركة ملخّص نصي','share-text','file','btn-outline',t)}${button('طباعة A4','print','print','btn-outline',t)}${['report','statement'].includes(target)?button('طباعة حرارية','thermal-print','print','btn-outline',t):''}${target==='statement'?button('نموذج المصادقة على الحساب','print-confirmation','file','btn-outline')+(data.settings.notify.whatsStatement?button('مسودة واتساب للكشف الكامل','draft-statement','chat','btn-outline'):''):''}</div>`);
}
function setRestoreCopyStatus(state,message){
  const note=qs('#restore-copy-status',dlg);if(!note)return;
  note.dataset.state=state;note.textContent=message;
  const wait=state==='pending';
  const copy=qs('[data-action="backup-before-restore"], [data-action="category-backup-before"]',dlg);
  if(copy)copy.disabled=wait;
  const submit=qs('button[type=submit]',dlg);if(submit)submit.disabled=wait;
}
window.qaydRestoreCopyResult=(id,state,message)=>{
  if(!restoreSaveId||restoreSaveId!==id)return;
  restoreSaveId=null;setRestoreCopyStatus(state,message);
};
async function backup(mode='local',{beforeRestore=false}={}) {
  if(bootError)throw new Error('تعذّر قراءة الدفتر الحالي، لذلك لم تُنشأ نسخة منه.');
  const when=new Date(),day=L.localDay(when),time=L.localTime(when).replace(':','')+String(when.getSeconds()).padStart(2,'0');
  const next=L.stateClone(data);next.lastBackup=day;
  const value=JSON.stringify(await pack(cleanBackup(next),security.credentials));
  const name=`qayd-${beforeRestore?'before-restore':'backup'}-${day}-${time}.db`;
  return writeBackupDocument(name,value,mode,{beforeRestore,onReady:()=>{
    u.lastManualExport=day;
    if(!beforeRestore){closeDialog();render();}
  }});
}
async function writeBackupDocument(name,value,mode,{beforeRestore=false,onReady=()=>{}}={}){
  if(new Blob([value]).size>MAX_BACKUP)throw new Error('النسخة أكبر من 20 ميغابايت. جرّب استبعاد الصور من خيارات الحفظ.');
  const nativeDb=!!native?.backupDb;
  const binary=nativeDb?null:await QaydDb.write(value);
  onReady();
  if(nativeDb){
    if(beforeRestore){
      const id=`restore-save-${++restoreSaveCounter}`;
      restoreSaveId=id;
      setRestoreCopyStatus('pending','اختر مكان حفظ النسخة وانتظر تأكيد الحفظ.');
      try{native.backupDb(name,value,'local',id);}
      catch{window.qaydRestoreCopyResult(id,'error','لم يُفتح منتقي حفظ النسخة الحالية. حاول مجددًا.');}
    }else native.backupDb(name,value,mode,'');
    return;
  }
  if(beforeRestore)setRestoreCopyStatus('requested','طُلب تنزيل النسخة الحالية. تأكّد من وجودها قبل الاسترجاع.');
  const file=new File([binary],name,{type:QaydDb.mime});
  if(mode==='share'&&navigator.canShare?.({files:[file]})){
    try {await navigator.share({files:[file],title:name});return;}catch(e){if(e.name==='AbortError')return;}
  }
  requestDownload(name,file);
}
function chooseBackup(drive=false) {
  if(native?.pickBackup){native.pickBackup(drive);return;}
  const input=qs('#backup-file');input.value='';input.click();
}
function chooseCategoryBackup(){
  closeDialog();
  if(native?.pickCategoryBackup){native.pickCategoryBackup();return;}
  const input=qs('#category-backup-file');input.value='';input.click();
}
function driveExportForm() {
  const protectedFile=!!security.credentials;
  modal('تصدير نسخة إلى Google Drive',native?.backupDb?'تفتح النسخة في تطبيق Drive لتختار الحساب والمجلد وتؤكّد الحفظ.':'نزّل الملف، ثم ارفعه إلى Google Drive من المتصفح أو تطبيق Drive.',`
    <div class="backup-format"><div>${stamp(protectedFile?'lock':'file')}<span><strong>${protectedFile?'نسخة مشفّرة بكلمة السر':'نسخة غير مشفّرة'}</strong><small>ملف DB · ${data.settings.backupPhotos?'مع الصور إن وُجدت':'بدون صور'}</small></span></div></div>
    <div style="margin-top:10px">${alertBox(protectedFile?'ستحتاج إلى كلمة سر النسخة عند استرجاعها.':'الملف يحتوي بيانات حساباتك. احفظه في مجلد خاص، أو فعّل كلمة السر قبل التصدير.',!protectedFile)}</div>`,{
    onSubmit:()=>backup('drive'),footer:cancelBtn()+submitBtn(native?.backupDb?'متابعة إلى Drive':'تنزيل النسخة')});
}
function resetUi() {
  TeamUI.reset();u.settings='';u.code=data.settings.defaultCode;u.rowsPage=1;u.account='';u.report={...blankFilters(),tab:'accounts',period:data.settings.home.period};u.moves=blankFilters();u.acct={query:'',category:'',status:'',sort:data.settings.home.alpha?'name':'latest',reverse:false};u.statement=QaydAccountFeatures.blank();u.collections=CollectionsUI.blank();
}
function backupName(name) {return String(name||'').replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim().slice(0,160)||'ملف نسخة قيد';}
function backupCounts(value) {
  return `<dl><div><dt>الحسابات</dt><dd><bdi>${html(fmt(value.accounts.length))}</bdi></dd></div><div><dt>الحركات</dt><dd><bdi>${html(fmt(value.entries.length))}</bdi></dd></div><div><dt>العملات</dt><dd><bdi>${html(fmt(value.currencies.length))}</bdi></dd></div></dl>`;
}
function confirmRestore(incoming, importedKey=null, name='',{origin='نسخة JSON من قيد',extra=''}={}) {
  const day=name.match(/^qayd-(?:daily|backup|before-restore)-(\d{4}-\d{2}-\d{2})(?:-\d{4,6})?\.(?:json|db)$/i)?.[1]||incoming.lastBackup;
  const images=incoming.entries.reduce((n,e)=>n+Number(!!e.photo),Number(!!incoming.settings.profile.logo));
  const before=bootError?'<p class="subtle">تعذّر فتح الدفتر الحالي للمقارنة.</p>':backupCounts(data);
  const desc=incoming.accounts.length?'استرجاع هذه النسخة يستبدل الدفتر الحالي بالكامل؛ لا يدمج الحركات.':'النسخة تحتوي على دفتر فارغ. استرجاعها يزيل الحسابات والحركات الحالية.';
  modal('استرجاع واستبدال البيانات','راجع الملف والأعداد قبل المتابعة.',`
    <div class="restore-file">${stamp(importedKey?'lock':'file')}<div><strong dir="auto">${html(backupName(name))}</strong><p>${html(importedKey?'تم فتح النسخة المشفّرة · '+origin:origin)}${L.validDay(day)?` · تاريخ النسخة <bdi>${html(day)}</bdi>`:''}</p></div></div>
    <div class="restore-diff"><section><h3>الدفتر الحالي</h3>${before}</section><section class="restore-new"><h3>النسخة المختارة</h3>${backupCounts(incoming)}</section></div>
    <p class="restore-meta">${images?`${html(fmt(images))} صورة في النسخة`:'لا صور في النسخة'}${incoming.demo?' · بيانات تجريبية':''}</p>
    ${extra}${alertBox(desc,true)}<p class="subtle restore-note">${!bootError?'يمكنك حفظ نسخة من الدفتر الحالي الآن، ثم الرجوع لإكمال الاسترجاع. تُحفظ الصور في النسخة إذا كان خيار تضمينها مفعّلًا.':''}</p><p id="restore-copy-status" role="status" aria-live="polite"></p>`,{
    onSubmit:async()=>{await persist(incoming,{replace:true,credentials:security.credentials||importedKey});resetUi();go('home');toast('استُرجعت النسخة بنجاح.');},
    footer:cancelBtn()+(!bootError?button('حفظ الحالية أولًا','backup-before-restore','download'):'')+submitBtn('استرجاع واستبدال',true)});
}
function routeRestore(raw,importedKey,name,origin,categoryOnly){
  if(QaydCategoryBackup.is(raw))return CategoryCopyUI.review(raw,name,{encrypted:!!importedKey});
  if(!L.supportsSchema(raw?.schema))throw new Error(categoryOnly?'اختر نسخة تصنيف أو نسخة قيد كاملة صالحة.':'هذا الملف ليس نسخة قيد متوافقة. اختر ملف JSON من قيد أو نسخة DB كاملة مدعومة.');
  const incoming=L.validate(raw);
  if(categoryOnly)return CategoryCopyUI.fromFull(incoming,name,!!importedKey);
  return confirmRestore(incoming,importedKey,name,{origin});
}
function processBackup(text,name='',origin='نسخة JSON من قيد',categoryOnly=false) {
  let raw;
  try{raw=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('الملف ليس نسخة JSON صالحة من قيد. اختر ملف النسخة الاحتياطية نفسه.');}
  if(Vault.is(raw)){
    Vault.inspect(raw);
    modal('نسخة احتياطية مشفّرة','أدخل كلمة السر التي كانت مستخدمة عند إنشاء النسخة.',field('password','كلمة سر النسخة','','required maxlength="128" autocomplete="off"','password'),{
      onSubmit:async form=>{const v=await Vault.unlock(raw,FD(form).password);routeRestore(v.value,v.credentials,name,origin,categoryOnly);},footer:cancelBtn()+submitBtn('فتح النسخة')});
  }else routeRestore(raw,null,name,origin,categoryOnly);
}
async function processDatabase(bytes,name,categoryOnly=false){
  modal('قراءة قاعدة البيانات','فحص محلي دون تعديل الملف أو رفعه.',`<div class="task-status" aria-live="polite">${stamp('archive')}<p id="db-read-status">جارٍ التحقق من الجداول وبنية النسخة…</p></div>`,{footer:cancelBtn()});
  const status=qs('#db-read-status',dlg);
  const task=QaydDb.read(bytes);dbReading=task;
  try {
    const parsed=await task.promise;if(dbReading!==task||security.locked)return;
    dbReading=null;
    if(parsed.kind==='qayd')processBackup(parsed.text,name,'نسخة DB من قيد',categoryOnly);
    else if(parsed.kind==='legacy'&&!categoryOnly)openLegacyImport(parsed.source,name);
    else if(parsed.kind==='legacy')throw new Error('هذا ملف من «دفتر الحسابات» القديم. استورده من مساره المخصص، أو اختر نسخة من قيد هنا.');
    else throw new Error('لم تُعرف بنية ملف النسخة.');
  }catch(e){
    if(dbReading===task)dbReading=null;
    if(!e.cancelled&&status.isConnected&&dlg.open){
      status.textContent='توقف الاستيراد. لم تتغير البيانات.';
      modalError(e.message||'تعذّرت قراءة DB.');
    }
  }
}
async function readBackup(file,categoryOnly=false) {
  if(!file||security.locked)return;
  try {
    if(!file.size||file.size>QaydDb.max)throw new Error('ملف النسخة فارغ أو أكبر من 48 ميغابايت.');
    const head=new Uint8Array(await file.slice(0,16).arrayBuffer()), name=backupName(file.name);
    const isDb=QaydDb.looksLike(head);
    if(!isDb&&file.size>MAX_BACKUP)throw new Error('حجم ملف JSON يتجاوز 20 ميغابايت، ولا يحتوي على ترويسة SQLite.');
    const bytes=new Uint8Array(await file.arrayBuffer());if(security.locked)return;
    if(isDb)return processDatabase(bytes,name,categoryOnly);
    let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('هذا ليس ملف DB مدعومًا أو نسخة JSON صالحة.');}
    processBackup(text,name,'نسخة JSON من قيد',categoryOnly);
  }catch(e){toast(e.message||'تعذّر فتح الملف.',true);}
}
function renderBackupOffer() {
  const lockedNote=qs('#locked-backup-note');if(lockedNote)lockedNote.hidden=!pendingNativeBackup;
  const slot=qs('#incoming-backup');if(!slot)return;
  if(!pendingNativeBackup||readingNativeBackup||security.locked){slot.hidden=true;slot.innerHTML='';return;}
  slot.hidden=false;
  slot.innerHTML=alertBox('يوجد ملف نسخة جاهز للمراجعة. لم تتغير بيانات الدفتر.',false,link('مراجعة النسخة','review-backup-offer','file')+link('تجاهل','ignore-backup-offer','close'));
}
function dropBackupOffer(id) {
  if(!id)return;
  if(pendingNativeBackup===id)pendingNativeBackup='';if(readingNativeBackup===id)readingNativeBackup='';
  native?.discardBackup?.(id);renderBackupOffer();
}
function reviewBackupOffer() {
  if(!pendingNativeBackup||readingNativeBackup||security.locked||!native?.readPendingBackup)return;
  const id=pendingNativeBackup;
  modal('قراءة ملف النسخة','من Drive أو منتقي الملفات.',`<div class="task-status" id="restore-wait" aria-live="polite">${stamp('archive')}<p>جارٍ قراءة النسخة… قد يستغرق الملف السحابي بعض الوقت.</p></div>`,{footer:cancelBtn()});
  readingNativeBackup=id;renderBackupOffer();native.readPendingBackup(id);
}
window.qaydBackupOffered=(id,autoReview)=>{
  if(typeof id!=='string'||!id||id.length>80)return;
  if(readingNativeBackup&&readingNativeBackup!==id)closeDialog();
  pendingNativeBackup=id;renderBackupOffer();
  if(autoReview&&!security.locked&&!dlg.open&&!formBusy&&!saving)reviewBackupOffer();
};
window.qaydBackupReady=async (id,name,size,kind,categoryOnly=false)=>{
  if(readingNativeBackup!==id||security.locked)return;
  try {
    const db=kind==='db';
    if(!Number.isInteger(size)||size<=0||size>(db?QaydDb.max:MAX_BACKUP))throw new Error('ملف النسخة فارغ أو أكبر من حد الاسترجاع.');
    const parts=[], bytes=db?new Uint8Array(size):null;
    for(let i=0,count=0;i<size;count++){
      const part=native.backupPart(id,i);
      if(typeof part!=='string'||!part.length||part.length>(db?65536:49152))throw new Error('تعذّر إكمال قراءة النسخة.');
      if(db){
        const raw=atob(part);if(!raw.length||i+raw.length>size)throw new Error('جزء DB غير مكتمل.');
        for(let j=0;j<raw.length;j++)bytes[i+j]=raw.charCodeAt(j);
        i+=raw.length;
      }else{if(i+part.length>size)throw new Error('جزء JSON غير مكتمل.');parts.push(part);i+=part.length;}
      if(count%16===15){await new Promise(r=>setTimeout(r,0));if(readingNativeBackup!==id)return;}
    }
    if(readingNativeBackup!==id)return;
    dropBackupOffer(id);
    if(db)return processDatabase(bytes,backupName(name),categoryOnly===true);
    processBackup(parts.join(''),backupName(name),'نسخة JSON من قيد',categoryOnly===true);
  }catch(e){dropBackupOffer(id);modalError(e.message||'تعذّرت قراءة النسخة.');}
};
window.qaydBackupFailed=(id,msg)=>{if(id===readingNativeBackup){dropBackupOffer(id);modalError(String(msg||'تعذّرت قراءة النسخة.'));}};
function quickSearch() {
  modal('بحث سريع','ابحث عن حساب، أو انتقل للبحث في تفاصيل الحركات.',`${search('quick','البحث باسم الحساب أو الهاتف…','','large')}<div id="quick-results" class="pick-list"></div>`,{focus:'[data-scope="quick"]'});
  quickResults('');
}
function quickResults(query) {
  const node=qs('#quick-results',dlg);if(!node)return;
  const v=L.searchKey(query),items=data.accounts.filter(a=>!v||L.searchKey(a.name+' '+a.phone).includes(v)).slice(0,9);
  node.innerHTML=(items.length?items.map(a=>`<button type="button" class="pick-item" data-action="open-account" data-id="${html(a.id)}">${avatar(a)}<span><strong>${html(a.name)}</strong><br><small>${html(categoryName(a.category))}</small></span><span class="end">${icon('left',13)}</span></button>`).join(''):`<p class="subtle">لا حسابات مطابقة.</p>`)+button('البحث في الحركات','quick-moves','moves','btn-soft',`data-query="${html(query)}"`);
}
async function onAction(b) {
  const {action,id,target,view,key,account,scope}=b.dataset;
  if(action==='shared-desk-open')return TeamUI.openDesk();
  if(action==='shared-post-open')return TeamUI.openDesk(true);
  if(action==='device-mode-choose')return TeamUI.chooseMode();
  if(action?.startsWith('team-'))return TeamUI.action(b);
  const a=id&&getAccount(id);
  switch(action) {
    case 'go':return go(view);
    case 'settings-open':return settingsOpen(key);
    case 'verify-backup':return BackupReview.choose();
    case 'support-copy':return copySupport();
    case 'support-dial':{
      if(native?.dialSupport)native.dialSupport();
      else {const a=document.createElement('a');a.href='tel:'+QaydRelease.phone;a.rel='noreferrer';a.click();}
      return;
    }
    case 'password-change':return passwordForm(false);
    case 'password-disable':return passwordForm(true);
    case 'lock-now':{if(!security.envelope)return;TeamUI.reset();QaydPdfViewer.close();closeDialog();CollectionsUI.clearCache();u.collections=CollectionsUI.blank();security.locked=true;security.credentials=null;data=L.empty();qs('#page').innerHTML='';qs('#print-area').innerHTML='';qs('#toast').innerHTML='';render();return;}
    case 'annual-close':return annualCloseForm();
    case 'annual-open':return annualOpenForm();
    case 'backup-folder':return native?.selectBackupFolder?.();
    case 'notice-permission':return native?.requestNoticePermission?.();
    case 'movement-notice-close':return MovementNotice.respond(false);
    case 'movement-notice-send':return MovementNotice.respond(true);
    case 'contact-pick':return MessagePhoneUI.launch(false);
    case 'contact-create':return MessagePhoneUI.launch(true);
    case 'contact-back':return MessagePhoneUI.back();
    case 'edit-draft-phone':return editDraftPhone(id,b.dataset.channel,key);
    case 'draft-recipients':return movementRecipients(id);
    case 'draft-entry':return draftEntry(id,account,b.dataset.channel);
    case 'draft-statement':return draftStatement();
    case 'balance-message':if(a&&u.account!==id)go('account',id);return AccountUI.balanceMessage(id,b.dataset.channel,key);
    case 'message-phone':return AccountUI.phoneForm(id,b.dataset.channel,key);
    case 'statement-search':return AccountUI.searchForm();
    case 'account-limit':if(a&&u.account!==id)go('account',id);return AccountUI.limitForm(id);
    case 'account-reminder':return AccountUI.reminderForm(id);
    case 'collection-tab':return CollectionsUI.tab(key);
    case 'collection-open':u.collections.tab=key==='receipts'||key==='activity'?key:'queue';if(key==='receipts')u.collections.receiptTarget='';return go('collections','',true);
    case 'collection-filter':return CollectionsUI.filter(key);
    case 'collection-account':return CollectionsUI.plan(id,key);
    case 'collection-due':return CollectionsUI.dueForm(id,account,key);
    case 'collection-followup':return CollectionsUI.followupForm(id,key);
    case 'collection-receipt':return entryForm({account,collectionReceipt:true,receiptTarget:id||''});
    case 'voucher-show':return ReceiptBookUI.show(id);
    case 'voucher-unassign':return ReceiptBookUI.unassign(id);
    case 'voucher-linked':return ReceiptBookUI.showLinked(id);
    case 'voucher-clear-linked':u.collections.receiptTarget='';u.rowsPage=1;return render();
    case 'thermal-print':return ReceiptUI.form(target||'statement');
    case 'thermal-system':return ReceiptUI.system();
    case 'compose-message':return composeDraft(b.dataset.channel);
    case 'copy-draft':return copyValue(qs('#draft-message',dlg)?.value);
    case 'copy-lan':return copyValue(qs('#lan-url',dlg)?.value);
    case 'print-confirmation':return printConfirmation();
    case 'remove-photo':return removePhoto(b);
    case 'pick-entry-account':return pickEntryAccount(id);
    case 'clear-entry-account':{const input=qs('#entry-name',dlg);input.value='';input.focus();entrySuggestions();return;}
    case 'calc-key':case 'calc-use':case 'calc-clear':return calculatorAction(action,b.dataset.value);
    case 'open-account':return go('account',id);
    case 'quick-search':return quickSearch();
    case 'quick-moves':u.moves={...blankFilters(),query:b.dataset.query||''};return go('moves');
    case 'close-dialog':return closeDialog();
    case 'new-account':return accountForm();
    case 'edit-account':return accountForm(id);
    case 'account-options':return accountOptions(id);
    case 'new-entry':return entryForm({account});
    case 'new-transfer':return entryForm({account,transfer:true});
    case 'edit-entry':return entryForm({id});
    case 'entry-info':return entryInfo(id);
    case 'share-entry': {
      const e=data.entries.find(x=>x.id===id);if(!e)return;
      const l=e.legs[0], t=e.legs.length===2;
      const title=t?'إشعار تحويل':'إشعار حركة';
      const lines=[title,entryCaption(e,data.settings.transferDetails),e.day,(t?'تحويل':l.minor>0?'لي':'عليّ')+': '+money(Math.abs(l.minor))+' '+codeInfo(l.code).name,e.memo].filter(Boolean);
      return shareTextValue(lines.join('\n'),title);
    }
    case 'delete-entry':{
      const e=data.entries.find(x=>x.id===id);if(!e)return;
      if(e.receipt){
        const n=L.receiptNumber(e.receipt.number);
        return confirmBox('حذف سند القبض',`سيُحذف السند رقم ${n} والقيد المرتبط به ويتغيّر الرصيد. لن يُعاد استخدام الرقم في هذا الدفتر.`,async()=>{await mutate(next=>{L.removeEntry(next,id);ActivityUI.entry(next,'entry-delete',e,null);});done('حُذف سند القبض.');},'حذف السند',true);
      }
      return confirmBox('حذف الحركة',e.legs.length===2?'سيُحذف طرفا التحويل من الحسابين ويتغير الرصيد في كليهما.':'ستُحذف الحركة نهائيًا ويتغير رصيد الحساب.',async()=>{await mutate(n=>{L.removeEntry(n,id);ActivityUI.entry(n,'entry-delete',e,null);});done('حُذفت الحركة.');},'حذف الحركة',true);
    }
    case 'delete-account':{
      if(!a)return;
      const es=data.entries.filter(e=>e.legs.some(l=>l.account===id)), paired=es.filter(e=>e.legs.length===2).length;
      return confirmBox('حذف الحساب',`سيُحذف حساب «${a.name}» و${fmt(es.length)} حركة نهائيًا.${paired?` يشمل ذلك طرفي ${fmt(paired)} تحويل، مما يغيّر أرصدة الحسابات المقابلة.`:''} احتفظ بنسخة قبل الحذف.`,async()=>{await mutate(n=>{L.removeAccount(n,id);ActivityUI.add(n,'account-delete',a.name,`${es.length} حركة محذوفة${paired?' · منها '+paired+' تحويل':''}.`);});if(u.view==='account')go('accounts');done('حُذف الحساب.');},'حذف الحساب',true);
    }
    case 'toggle-favorite':if(a){await mutate(n=>{n.accounts.find(x=>x.id===id).favorite=!a.favorite;});done(a.favorite?'أُزيل من المفضلة.':'أُضيف إلى المفضلة.');}return;
    case 'close-balance':return closeBalanceForm(id);
    case 'open-balance':return confirmBox('إلغاء الإغلاق','ستعود الحركات المجمّعة إلى الكشف. لا يتغير صافي الرصيد.',async()=>{await mutate(n=>{const previous=n.closures.find(x=>x.account===u.account&&x.code===u.code);L.openBalance(n,u.account,u.code);if(previous)ActivityUI.add(n,'account-open',accountName(u.account),`${u.code} · الإغلاق حتى ${previous.day}`);});u.statement.archive=false;done('أُلغي إغلاق الرصيد.');});
    case 'toggle-archive':u.statement.archive=!u.statement.archive;u.rowsPage=1;return render();
    case 'currency-form':return currencyForm(id);
    case 'category-form':return categoryForm(id);
    case 'delete-category':{
      const c=getCategory(id);if(!c)return;
      return confirmBox('حذف التصنيف',`ستبقى حسابات «${c.name}» ولكن بلا تصنيف.`,async()=>{await mutate(n=>{n.categories=n.categories.filter(x=>x.id!==id);n.accounts.filter(x=>x.category===id).forEach(a=>a.category='');});if(u.acct.category===id)u.acct.category='';done('حُذف التصنيف.');},'حذف',true);
    }
    case 'delete-currency':{
      const c=codeInfo(id);
      return confirmBox('حذف العملة',`حذف «${c.name}» ممكن فقط إن لم تكن لها حركات.`,async()=>{
        await mutate(n=>{if(n.currencies.length===1)throw new Error('يجب الإبقاء على عملة واحدة على الأقل.');if(n.entries.some(e=>e.legs.some(l=>l.code===id)))throw new Error('لا يمكن حذف عملة مرتبطة بحركات مسجّلة.');for(const a of n.accounts){if(a.limits?.[id])L.setAccountLimit(n,a.id,id);if(a.followups?.[id])L.setFollowup(n,a.id,id);}n.currencies=n.currencies.filter(x=>x.code!==id);if(n.settings.defaultCode===id)n.settings.defaultCode=n.currencies[0].code;});done('حُذفت العملة.');
      },'حذف',true);
    }
    case 'sort-accounts':if(u.acct.sort===key)u.acct.reverse=!u.acct.reverse;else{u.acct.sort=key;u.acct.reverse=false;}u.rowsPage=1;return renderResults();
    case 'reset-filter':{
      if(scope==='report')u.report={...blankFilters(),tab:u.report.tab,period:u.report.period};
      if(scope==='moves')u.moves=blankFilters();
      if(scope==='statement'){u.statement=QaydAccountFeatures.blank();if(b.dataset.close)closeDialog();}
      if(scope==='collections')u.collections={...CollectionsUI.blank(),tab:u.collections.tab};
      if(scope==='acct')u.acct={query:'',category:'',status:'',sort:data.settings.home.alpha?'name':'latest',reverse:false};
      u.rowsPage=1;return render();
    }
    case 'prev-page':u.rowsPage=Math.max(1,u.rowsPage-1);return renderResults();
    case 'next-page':u.rowsPage++;return renderResults();
    case 'export-options':return exportOptions(target);
    case 'view-pdf':return QaydPdfViewer.open(target,id);
    case 'print':return printDoc(target,u.code,id);
    case 'xlsx':return xlsxExport(target);
    case 'xlsx-share':return xlsxExport(target,true);
    case 'csv':return csvExport(target);
    case 'csv-share':return csvExport(target,true);
    case 'share-text':return shareReportText(target);
    case 'category-backup':return CategoryCopyUI.backupForm(id);
    case 'category-transfer-file':return CategoryCopyUI.transferForm();
    case 'category-restore':return chooseCategoryBackup();
    case 'category-backup-before':{
      formBusy=true;try{return await CategoryCopyUI.save(id,{beforeRestore:true});}finally{formBusy=false;}
    }
    case 'backup':return backup('local');
    case 'backup-share':return backup('share');
    case 'backup-before-restore':{formBusy=true;try{return await backup('local',{beforeRestore:true});}finally{formBusy=false;}}
    case 'restore':return chooseBackup(false);
    case 'drive-import':return chooseBackup(true);
    case 'drive-export':return driveExportForm();
    case 'review-backup-offer':return reviewBackupOffer();
    case 'ignore-backup-offer':return dropBackupOffer(pendingNativeBackup);
    case 'clear-ledger':return confirmBox('بدء دفتر فارغ','سيُمسح الدفتر المحلي، بما فيه جميع الحسابات والحركات والإعدادات. احفظ نسخة قبل المتابعة.',async()=>{await persist(L.empty(),{replace:true});resetUi();go('home');toast('دفترك الفارغ جاهز.');},'بدء دفتر فارغ',true);
    case 'load-demo':return confirmBox('تحميل بيانات تجريبية','سيُستبدل الدفتر الحالي ببيانات وهمية. احفظ نسخة أولًا إذا كان لديك سجلات مهمة.',async()=>{await persist(L.demoData(),{replace:true});resetUi();go('home');toast('حُمّلت البيانات التجريبية.');},'تحميل الأمثلة');
  }
}
function uiError(e){if(e?.code==='team-cancelled')return;const msg=e?.message||'تعذّر إتمام العملية.';if(dlg.open)modalError(msg);else toast(msg,true);}
document.addEventListener('click',event=>{
  const b=event.target.closest('[data-action]');if(!b||b.disabled||security.locked||saving||formBusy)return;
  event.preventDefault();
  try {const r=onAction(b);if(r&&typeof r.catch==='function')r.catch(uiError);}catch(e){uiError(e);}
});
document.addEventListener('submit',async event=>{
  event.preventDefault();const form=event.target;
  if(form.id==='unlock-form'){await unlockForm(form);return;}
  if(security.locked||saving||formBusy||(form.id==='dialog-form'&&restoreSaveId))return;
  const submit=qs('button[type=submit]',form);if(submit)submit.disabled=true;formBusy=true;
  try {
    if(form.id==='dialog-form'&&modalHandler){const error=qs('.form-error',dlg);error.hidden=true;await modalHandler(form);}
    if(form.dataset.config)await configSubmit(form);
    if(form.id==='lan-form')startLan(form);
    if(form.id==='team-origin-form')TeamUI.saveOrigin(form);
    if(form.id==='team-login-form')await TeamUI.signIn(form);
  }catch(e){uiError(e);}
  finally {formBusy=false;if(submit)submit.disabled=false;}
});
dlg.addEventListener('invalid',e=>{const details=e.target.closest('.entry-extra');if(details)details.open=true;},true);
dlg.addEventListener('cancel',e=>{e.preventDefault();if(!saving&&!formBusy)closeDialog();});
function filterEvent(el,live) {
  const {scope,filter}=el.dataset;
  if(scope==='quick'){if(live)quickResults(el.value);return;}
  const searchField=filter==='query'||filter==='auditQuery'||filter==='receiptQuery';
  if(!scope||!filter||!u[scope]||live!==searchField)return;
  u[scope][filter]=el.value;if(scope==='acct'&&filter==='sort')u.acct.reverse=false;u.rowsPage=1;if(filter==='period')render();else renderResults();
}
document.addEventListener('input',e=>{if(security.locked)return;TeamUI.input(e.target);filterEvent(e.target,true);if(e.target.name==='amount'){showWords();AccountUI.entryLimitPreview();}if(e.target.id==='entry-name')entrySuggestions();if(e.target.id==='draft-message')AccountUI.draftInput(e.target);});
document.addEventListener('focusout',e=>{if(e.target.id==='entry-name')setTimeout(()=>{if(!qs('#entry-account',dlg)?.contains(document.activeElement))entrySuggestions(false);},140);});
document.addEventListener('change',e=>{
  if(security.locked)return;
  const el=e.target;filterEvent(el,false);
  if(el.dataset.teamPerm)TeamUI.togglePermissions();
  if(el.dataset.photo)onPhotoInput(el);
  if(el.dataset.change==='currency'){u.code=el.value;u.rowsPage=1;render();}
  if(el.dataset.change==='report-kind'&&reportTabs.some(([key])=>key===el.value)){u.report.tab=el.value;u.rowsPage=1;render();qs('[data-change=report-kind]')?.focus({preventScroll:true});}
  if(el.id==='account-limit-code')AccountUI.changeLimitCode(el.value);
  if(el.name==='code'&&dlg.open){showWords();entryPreview();}
  if(['kind','from','to'].includes(el.name)&&dlg.open)AccountUI.entryLimitPreview();
  if(['kind','day'].includes(el.name)&&dlg.open)syncDueField();
  if(['day','receiptTarget'].includes(el.name)&&dlg.open)ReceiptBookUI.updateChoices();
  if(el.id==='backup-file')readBackup(el.files[0]);
  if(el.id==='category-backup-file')readBackup(el.files[0],true);
  if(el.id==='verify-backup-file'){const file=el.files[0];el.value='';BackupReview.read(file);}
  if(el.name==='categoryCopyId'&&dlg.open)CategoryCopyUI.updateStats();
});
document.addEventListener('keydown',e=>{
  if(security.locked||formBusy||saving||QaydPdfViewer.isOpen())return;
  if(e.key==='Escape'&&MovementNotice.clear()){e.preventDefault();return;}
  if(entrySuggestKeys(e))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();quickSearch();}
  if(e.key==='Enter'&&e.target.dataset?.scope==='quick'){e.preventDefault();u.moves={...blankFilters(),query:e.target.value};go('moves');}
});
window.qaydBack=()=>{
  if(formBusy||saving)return true;
  if(security.locked)return false;
  if(QaydPdfViewer.isOpen()){QaydPdfViewer.close();return true;}
  if(MovementNotice.clear())return true;
  if(u.view==='settings'&&u.settings&&!dlg.open){go('settings');return true;}
  if(dlg.open){closeDialog();return true;}
  if(u.view==='account'){go('accounts');return true;}
  if(u.view==='collections'&&u.collections.tab==='receipts'){go('moves');return true;}
  if(u.view==='collections'&&u.collections.tab==='aging'){CollectionsUI.tab('queue');return true;}
  if(['currencies','categories','collections','reports'].includes(u.view)){go('settings');return true;}
  if(u.view!=='home'){go('home');return true;}
  return false;
};
window.qaydNativeResult=(message,error)=>{if(QaydPdfViewer.isOpen())QaydPdfViewer.feedback(message,error);else if(dlg.open&&error)modalError(message);else toast(message,error);};
render();syncNativeNotices();
if(native?.pendingBackupId){const offer=native.pendingBackupId();if(offer)window.qaydBackupOffered(offer,false);}
