'use strict';
/* Options, receipt capture, document and sharing workflows. Shared by browser and Android. */
const settingsLinks=[
  ['storage','النسخ والاسترجاع','حفظ نسخة، فحصها أو استرجاعها','archive'],
  ...(window.QaydAndroid?[['shared','ربط الدفتر المشترك','ضبط عنوان الخادم','cloud']]:[]),
  ['categories','التصنيفات','','tag'],['currencies','العملات','','coins'],
  ['security','الأمان','قفل دفتر الهاتف','lock'],
  ['profile','بيانات النشاط','','people'],['printing','الطباعة','','print'],
  ['notifications','الرسائل والتنبيهات','','bell'],['other','العرض وخيارات الدفتر','','settings'],
  ...(typeof window.QaydAndroid?.configureDeviceMode==='function'?[['device-mode','وضع هذا الجهاز','مدير أو موظف','shield']]:[]),
  ...(typeof window.QaydAndroid?.lanStart==='function'||window.QaydAndroid?[['lan','استعراض على الكمبيوتر','','desktop']]:[]),
  ['about','عن قيد والدعم','','info'],
];
const periodsText={day:'يومي',week:'أسبوعي',month:'شهري',year:'سنوي'};
const noticeChannels=[['none','اختيار القناة عند الإرسال'],['sms','رسالة نصية SMS'],['wa','واتساب'],['both','رسالة نصية وواتساب']];
const extraTitle=()=>settingsLinks.find(x=>x[0]===u.settings)?.[1]||'المزيد';
const settingsBack=()=>`<div class="back-button">${goBtn('المزيد','settings','arrowRight')}</div>`;
const settingsHead=(title,desc,actions='')=>settingsBack()+heading(title,desc,actions);
const toggle=(name,label,checked,detail='')=>`<label class="toggle-row"><span><strong>${html(label)}</strong>${detail?`<small>${html(detail)}</small>`:''}</span><input type="checkbox" name="${name}" role="switch" ${checked?'checked':''}><i aria-hidden="true"></i></label>`;
const cfgForm=(key,body)=>`<form data-config="${key}" class="panel settings-card config-form">${body}<div class="config-foot">${submitBtn('حفظ الإعدادات')}</div></form>`;
const configFields=(body)=>`<div class="form-grid">${body}</div>`;
const digitsOptions=selected=>opt('latin','1234',selected)+opt('arabic','١٢٣٤',selected);
const periodsOptions=selected=>L.periods.map(k=>opt(k,periodsText[k],selected)).join('');
const yes=(f,k)=>Object.prototype.hasOwnProperty.call(f,k);
const menuTile=(label,ic,action,attrs,desc='')=>`<button type="button" class="settings-tile" data-action="${action}" ${attrs}>${stamp(ic)}<span><strong>${html(label)}</strong>${desc?`<small>${html(desc)}</small>`:''}</span>${icon('left',16,'tile-arrow')}</button>`;
const moreGroup=(title,tiles)=>`<section class="panel more-group" aria-label="${html(title)}"><h2>${html(title)}</h2><div class="more-list">${tiles}</div></section>`;
function advancedPanel(title,body){return `<details class="panel more-disclosure" data-disclosure="${html(title)}"><summary>${html(title)}</summary><div class="more-disclosure-body">${body}</div></details>`;}
function renderSettingsV11() {
  const map={profile:renderProfile,printing:renderPrinting,security:renderSecurity,storage:renderStorage,lan:renderLan,notifications:renderNotifications,shared:renderSharedDesk,'device-mode':renderDeviceMode,other:renderOther,about:renderAbout};
  if(Object.hasOwn(map,u.settings))return map[u.settings]();
  const top=['storage','shared','categories','currencies','security'];
  const tile=([key,label,desc,ic])=>menuTile(label,ic,['categories','currencies'].includes(key)?'go':'settings-open',`data-view="${key}" data-key="${key}"`,desc);
  const activity=menuTile('سجل التغييرات','clock','collection-open','data-key="activity"');
  return `${heading('المزيد','')}<div class="more-grid">
    ${moreGroup('العمل اليومي',menuTile('التحصيل','wallet','go','data-view="collections"')+menuTile('التقارير','report','go','data-view="reports"')+activity)}
    ${moreGroup('دفتر الهاتف',settingsLinks.filter(([key])=>top.includes(key)).map(tile).join(''))}
    ${advancedPanel('التفضيلات والأدوات',`<div class="more-list">${settingsLinks.filter(([key])=>!top.includes(key)&&key!=='about').map(tile).join('')}</div>`)}
    <section class="panel more-group">${tile(settingsLinks.find(([key])=>key==='about'))}</section>
  </div>`;
}
function renderDeviceMode(){
  return settingsHead('وضع هذا الجهاز','تحديد الشاشة التي يفتحها قيد عند التشغيل.')+`<section class="panel settings-card"><h2>وضع المدير</h2><p class="setting-desc">هذه الصفحة الرئيسية تعرض دفتر الهاتف. وضع الموظف يفتح رابط الدفتر المشترك مباشرةً ولا يفتح دفتر الهاتف.</p><p class="setting-desc">تبديل الوضع لا يحذف سجلات الهاتف أو نسخها الاحتياطية، ولا يمنح صلاحيات على الخادم.</p>${button('تغيير وضع الجهاز','device-mode-choose','people','btn-primary')}</section>`;
}
function renderAbout(){
  const r=QaydRelease;
  return settingsHead('عن قيد والدعم','دفتر عربي لإدارة الحسابات والذمم والتحصيل.')+`<div class="view-stack">
    <section class="panel app-credit-card"><div class="app-credit-brand"><img src="logo.svg" width="58" height="58" alt=""><div><p class="eyebrow">دفتر الذمم</p><h2>قيد <bdi>${html(r.version)}</bdi></h2><p>حسابات واضحة · عمل دون اتصال</p></div></div><p class="app-copyright">${html(r.rights)}</p></section>
    <section class="panel settings-card"><h2>الدعم والتواصل</h2><p class="setting-desc">${html(r.owner)} · <bdi class="num">${html(r.phone)}</bdi></p><div class="button-set">${button('فتح شاشة الاتصال','support-dial','phone','btn-primary')}${button('نسخ رقم التواصل','support-copy','copy','btn-outline')}</div><p class="subtle app-credit-note">فتح شاشة الاتصال لا يُجري مكالمة تلقائيًا. لا تُرفق معلومات دفترِك عند التواصل ما لم تختر ذلك.</p></section>
  </div>`;
}
async function copySupport(){
  const value=QaydRelease.phone;
  if(native?.copyText)return copyValue(value);
  try{await navigator.clipboard.writeText(value);toast('نُسخ رقم التواصل.');}
  catch{modal('رقم التواصل',QaydRelease.owner,field('support','رقم التواصل',value,'readonly dir="ltr"'),{footer:button('إغلاق','close-dialog','','btn-outline'),focus:'[name="support"]'});qs('[name="support"]',dlg)?.select();}
}
function renderSharedDesk(){return TeamUI.page();}
function renderProfile() {
  const s=data.settings,p=s.profile;
  return settingsHead('بيانات النشاط','يظهر اسم النشاط في إشعار الحركة، وتظهر هذه البيانات في كشف الحساب حسب خيارات الطباعة.')+cfgForm('profile',configFields(field('business','الاسم أو اسم النشاط',s.business,'maxlength="75"')+field('phone','رقم الهاتف',p.phone,'maxlength="48" dir="ltr"','tel')+field('address','العنوان',p.address,'maxlength="140"')+field('nameEn','Name · الاسم بالإنجليزية',p.nameEn,'maxlength="90" dir="ltr"')+field('addressEn','Address · العنوان بالإنجليزية',p.addressEn,'maxlength="140" dir="ltr"')+fieldMemo('confirmation','نص نموذج المصادقة على الحساب',p.confirmation,650)+photoWidget('logo',p.logo,'شعار النشاط',false)));
}
function renderPrinting() {
  const t=data.settings.print;
  return settingsHead('الطباعة','تُطبَّق هذه التفضيلات على ملفات PDF والكشوفات المطبوعة.')+cfgForm('printing',`${toggle('profile','إظهار البيانات الشخصية',t.profile,'طباعة الاسم والعنوان والهاتف والشعار إن أُضيفت.')}${toggle('date','إظهار تاريخ الطباعة',t.date,'تاريخ إعداد التقرير أسفل الصفحة.')}${toggle('ascending','طباعة البيانات تصاعديًا',t.ascending,'من الأقدم إلى الأحدث. لا يغيّر الترتيب الرصيد المحسوب.')}${toggle('allCodes','طباعة الكشف بجميع العملات',t.allCodes,'يظهر لكل عملة جدول ورصيد مستقلان.')}${configFields(field('credit','تسمية حركة لي في الكشف',t.credit,'maxlength="32"')+field('debit','تسمية حركة عليّ في الكشف',t.debit,'maxlength="32"')+fieldMemo('footer','ملاحظة أسفل الكشف',t.footer,320))}`);
}
function renderSecurity() {
  return settingsHead('الأمان','إذا فعّلت كلمة السر سيطلبها قيد عند فتح الدفتر.')+`<div class="view-stack"><section class="panel settings-card"><h2>${security.credentials?'التشفير مُفعّل':'التشفير غير مُفعّل'}</h2><p class="setting-desc">${security.credentials?'البيانات والنسخ الجديدة مشفّرة بكلمة السر.':'فعّل كلمة سر لتشفير الدفتر والنسخ الاحتياطية الجديدة.'} النسخ السابقة لا تتغير.</p><div class="button-set">${security.credentials?button('قفل الآن','lock-now','lock','btn-primary')+button('تغيير كلمة السر','password-change','edit')+button('إلغاء كلمة السر','password-disable','trash','btn-outline btn-text-danger'):button('تفعيل كلمة السر','password-change','lock','btn-primary')}</div></section>${alertBox('لا يمكن استرداد كلمة السر إذا نسيتها. احتفظ بها في مكان آمن؛ لن تُحفظ داخل النسخة الاحتياطية.',true)}</div>`;
}
function currentNativeSchedule(){try {return native?.backupStatus?JSON.parse(native.backupStatus()):null;}catch{return null;}}
function renderStorage() {
  const b=currentNativeSchedule(),s=data.settings,last=b?.last,manual=u.lastManualExport||data.lastBackup;
  const drive=`<div class="button-set">${button('مشاركة نسخة','backup-share','share')}${button('تصدير إلى Drive','drive-export','cloud')}${button('استيراد من Drive','drive-import','download')}</div><p class="setting-desc">النسخ إلى Drive يدوي، وليس مزامنة.</p>`;
  const schedule=b?`${last?`<p class="subtle">آخر نسخة تلقائية: ${html(D(last,{day:'numeric',month:'short',year:'numeric'}))}</p>`:''}${b.error?alertBox('تعذّر آخر نسخ تلقائي. تحقق من إذن المجلد والمساحة.',true):''}<div class="settings-row"><div><h3>مجلد الحفظ</h3><p dir="auto">${html(b.folder||'لم يُحدّد بعد')}</p></div>${button('اختيار مجلد','backup-folder','folder')}</div><form data-config="schedule">${toggle('enabled','الحفظ اليومي',b.enabled)}${field('time','وقت النسخ',b.time,'required dir="ltr"','time')}<div class="config-foot">${submitBtn('حفظ الجدولة')}</div></form>`:'';
  return `${settingsHead('النسخ والاسترجاع','')}<div class="storage-stack view-stack">
    <section class="panel settings-card"><h2>دفتر الهاتف</h2><p class="setting-desc">يدعم نسخ قيد وملفات دفتر الحسابات السابقة. تراجع الملف قبل الاستبدال.</p><div class="button-set">${button('حفظ نسخة','backup','download','btn-primary')}${button('استرجاع نسخة','restore','archive')}${button('فحص نسخة','verify-backup','shield')}</div>${manual?`<p class="subtle backup-last">آخر طلب حفظ: ${html(D(manual,{day:'numeric',month:'short',year:'numeric'}))}</p>`:''}</section>
    ${advancedPanel('مشاركة وGoogle Drive',drive)}
    ${advancedPanel('نسخ تصنيف أو نقله',`<div class="view-stack">${CategoryCopyUI.card()}${typeof native?.openSharedDesk==='function'?CategoryCopyUI.transferCard():''}</div>`)}
    ${advancedPanel('خيارات النسخ',`${schedule}${cfgForm('photo-backup',toggle('photos','إرفاق الصور بالنسخ',s.backupPhotos,'تعطيله لا يحذف الصور من الدفتر.'))}`)}
    ${advancedPanel('بيانات التجربة وإفراغ الدفتر',`${alertBox('هذه الإجراءات تستبدل دفتر الهاتف. احفظ نسخة أولًا.',true)}<div class="button-set">${button('تحميل أمثلة','load-demo','spark','btn-soft')}${button('بدء دفتر فارغ','clear-ledger','trash','btn-outline btn-text-danger')}</div>`)}
  </div>`;
}
function renderNotifications() {
  const n=data.settings.notify;
  return settingsHead('الرسائل والتنبيهات','خصّص مسودات الرسائل والتنبيهات. لا تُرسل الرسائل من دون مراجعتك.')+`<div class="view-stack">${cfgForm('notifications',`${configFields(field('intro','مقدمة الرسالة',n.intro,'maxlength="180"')+field('ending','نهاية الرسالة',n.ending,'maxlength="180"')+field('credit','عليك · عندما يكون المبلغ لي',n.credit,'maxlength="30"')+field('debit','لك · عندما يكون المبلغ عليّ',n.debit,'maxlength="30"')+fieldSelect('channel','قناة إشعار الحركة',noticeChannels.map(([v,l])=>opt(v,l,n.channel)).join(''))+field('prefix','رمز الدولة للأرقام المحلية',n.prefix,'required maxlength="5" dir="ltr" placeholder="+967"'))}
  ${toggle('quickAdded','عرض «إغلاق / إرسال» بعد حفظ حركة جديدة',n.quickAdded,'تنبيه داخل قيد لمدة 3 ثوانٍ؛ لا يرسل شيئًا وحده.')}
  ${toggle('greet','إضافة المقدمة والنهاية إلى إشعار الحركة',n.greet)}${toggle('date','إدراج تاريخ العملية في الرسالة',n.date)}${toggle('transferDetails','إدراج أطراف التحويل في رسالة التحويل',n.transferDetails,'يكشف اسم الحساب المقابل للمستلم، إن فعّلته.')}${toggle('whatsStatement','إرسال كشف الحساب عبر واتساب',n.whatsStatement,'يظهر زر مسودة كشف موجه لرقم الحساب.')}${toggle('business','استخدام واتساب للأعمال',n.business)}${toggle('localAdd','إشعار حفظ عام في أندرويد',n.localAdd,'منفصل عن تنبيه الإرسال. لا يعرض مبالغ أو أسماء.')}${toggle('stopReminders','إيقاف التذكير بالتنبيهات',!n.reminders,'اضبط تاريخ التذكير من تعديل بيانات الحساب.')}`)}
  ${native?.requestNoticePermission?`<section class="panel settings-card"><h2>إذن إشعارات أندرويد</h2><p class="setting-desc">اسمح للتطبيق بعرض تذكيرات الحسابات وإشعار الإضافة عندما تختار تفعيلها.</p>${button('طلب إذن الإشعارات','notice-permission','bell','btn-outline')}</section>`:''}</div>`;
}
function renderOther() {
  const s=data.settings,h=s.home;
  return settingsHead('العرض وخيارات الدفتر','خصّص طريقة العرض وسلوك التشغيل دون تغيير أرصدة الحسابات.')+`<div class="view-stack">${cfgForm('other',`${configFields(fieldSelect('defaultCode','العملة الافتراضية',curOptions(s.defaultCode))+fieldSelect('digits','شكل الأرقام',digitsOptions(s.digits))+fieldSelect('period','تقرير إجمالي المبالغ',periodsOptions(h.period)))}${toggle('currencies','إظهار مبدّل العملات في الرئيسية',h.currencies,'تظل كل عملة مستقلة ومتاحة في بقية الشاشات.')}${toggle('totals','إظهار الإجماليات أعلى الكشف أيضًا',h.totals)}${toggle('time','إظهار وقت العملية في شاشة الحساب',h.time)}${toggle('words','إظهار المبلغ كتابة عند الإضافة',s.words)}${toggle('dark','الوضع الليلي',h.dark)}${toggle('alpha','ترتيب الأسماء أبجديًا عند فتح الحسابات',h.alpha)}${toggle('transferDetails','عرض طرفي التحويل في القوائم والكشوفات',s.transferDetails)}`)}
  <section class="panel settings-card"><h2>الإغلاق السنوي للحسابات</h2><p class="setting-desc">تجميع أرصدة جميع الحسابات والعملات حتى نهاية سنة، مع حفظ كل حركة في الأرشيف.</p><div class="button-set">${button('إغلاق سنة','annual-close','calendar','btn-primary')}${data.years.length?button('إلغاء الإغلاق الأخير · '+data.years.at(-1),'annual-open','undo','btn-outline'):''}</div>${data.years.length?`<p class="subtle" style="margin-top:8px">آخر إغلاق: ${html(data.years.at(-1))} · يظل الأرشيف متاحًا في الكشوف والتقارير.</p>`:''}</section></div>`;
}
async function configSubmit(form) {
  const kind=form.dataset.config,f=FD(form);
  if(kind==='schedule') {
    const status=native.backupSchedule(yes(f,'enabled'),f.time);
    if(status!=='ok')throw new Error(status||'تعذّر حفظ الجدولة.');
    render();toast('حُفظ موعد النسخ الاحتياطي.');return;
  }
  let nextCode;
  await mutate(n=>{
    const s=n.settings;
    if(kind==='profile') {s.business=f.business;s.profile={...s.profile,address:f.address,phone:f.phone,nameEn:f.nameEn,addressEn:f.addressEn,logo:photoValue(form,'logo'),confirmation:f.confirmation};}
    if(kind==='printing')s.print={profile:yes(f,'profile'),date:yes(f,'date'),ascending:yes(f,'ascending'),allCodes:yes(f,'allCodes'),credit:f.credit,debit:f.debit,footer:f.footer};
    if(kind==='notifications')s.notify={...f,quickAdded:yes(f,'quickAdded'),greet:yes(f,'greet'),date:yes(f,'date'),transferDetails:yes(f,'transferDetails'),whatsStatement:yes(f,'whatsStatement'),business:yes(f,'business'),localAdd:yes(f,'localAdd'),reminders:!yes(f,'stopReminders')};
    if(kind==='other'){
      if(s.defaultCode!==f.defaultCode)nextCode=f.defaultCode;
      s.defaultCode=f.defaultCode;s.digits=f.digits;s.words=yes(f,'words');s.transferDetails=yes(f,'transferDetails');
      s.home={...s.home,currencies:yes(f,'currencies'),totals:yes(f,'totals'),time:yes(f,'time'),dark:yes(f,'dark'),alpha:yes(f,'alpha'),period:f.period};
    }
    if(kind==='photo-backup')s.backupPhotos=yes(f,'photos');
  });
  if(nextCode)u.code=nextCode;
  if(kind==='other'){u.acct.sort=data.settings.home.alpha?'name':'latest';u.acct.reverse=false;u.report.period=data.settings.home.period;}
  done('حُفظت الإعدادات.');
}
function settingsOpen(key) {if(u.settings==='shared'&&key!=='shared')TeamUI.reset();u.settings=key;go('settings','',true);}
function renderLocked() {
  const wrap=qs('#lock-screen');qs('#app').hidden=true;wrap.hidden=false;
  wrap.innerHTML=`<div class="lock-card"><img src="logo.svg" alt=""><div class="eyebrow">قيد · دفتر الذمم</div><h1>الدفتر مقفل</h1><p>أدخل كلمة السر لفك تشفير بياناتك.</p><p id="locked-backup-note" class="subtle" ${pendingNativeBackup?'':'hidden'}>يوجد ملف نسخة بانتظار المراجعة بعد فتح الدفتر.</p><form id="unlock-form">${field('password','كلمة السر','','required maxlength="128" autocomplete="current-password" dir="auto"','password')}<div id="unlock-error" role="alert" class="form-error" hidden></div><div class="config-foot">${submitBtn('فتح الدفتر')}</div></form></div>`;
  document.title='قيد — الدفتر مقفل';
}
let failedUnlocks=0;
async function unlockForm(form) {
  const b=qs('button[type=submit]',form),error=qs('#unlock-error');if(b.disabled)return;
  b.disabled=true;error.hidden=true;
  const v=FD(form).password;
  try {
    if(failedUnlocks>=3)await new Promise(r=>setTimeout(r,Math.min(4000,500*failedUnlocks)));
    const e=await Vault.unlock(security.envelope,v);
    data=L.validate(e.value);security.credentials=e.credentials;security.locked=false;bootError='';failedUnlocks=0;
    form.reset();qs('#lock-screen').hidden=true;qs('#lock-screen').innerHTML='';qs('#app').hidden=false;resetUi();render();
  }catch(e){failedUnlocks++;error.textContent=e.message;error.hidden=false;form.password.value='';form.password.focus();}
  finally {b.disabled=false;}
}
function passwordForm(disable=false) {
  const current=!!security.credentials;
  const info=disable?'سيُحفظ الدفتر بدون تشفير وتبقى النسخ المشفّرة السابقة كما هي.':'اختر كلمة سر يمكن تذكرها. احتفظ بها لاسترجاع الدفتر والنسخ المشفّرة.';
  const pass=(key,label,mode)=>field(key,label,'',`required maxlength="128" autocomplete="${mode}" dir="auto"`,'password');
  modal(disable?'إلغاء كلمة السر':current?'تغيير كلمة السر':'تفعيل كلمة السر',info,`<div class="form-grid">${current?`<div class="full">${pass('old','كلمة السر الحالية','current-password')}</div>`:''}${disable?'':pass('pass','كلمة السر الجديدة','new-password')+pass('again','أعد كتابة كلمة السر','new-password')}</div>`,{
    onSubmit:async form=>{const f=FD(form);if(current)await Vault.unlock(security.envelope,f.old);
      if(!disable&&f.pass!==f.again)throw new Error('كلمتا السر غير متطابقتين.');
      const credentials=disable?null:await Vault.newKey(f.pass);
      await persist(L.stateClone(data),{credentials});done(disable?'أُلغي قفل الدفتر.':'حُفظت كلمة السر وشُفّر الدفتر.');
    },footer:cancelBtn()+submitBtn(disable?'إلغاء كلمة السر':'حفظ كلمة السر')});
}
function annualCloseForm() {
  const now=Number(L.localDay().slice(0,4)),last=data.years.at(-1)||999;
  modal('الإغلاق السنوي للحسابات','يشمل كل الحسابات والعملات حتى 31 ديسمبر من السنة المختارة.',configFields(field('year','السنة',Math.max(last+1,now-1),`required min="${last+1}" max="${now-1}" step="1" dir="ltr"`,'number'))+`<div style="margin-top:10px">${alertBox('تُرحّل الأرصدة إلى سطر في الكشوفات، وتبقى كل الحركات في التقارير والأرشيف. لا تُعدّل حركة من الفترة المغلقة إلا بعد إلغاء الإغلاق.',true)}</div>`,{
    onSubmit:async f=>{await mutate(n=>{const year=Number(FD(f).year);L.closeYear(n,year);ActivityUI.add(n,'year-close',String(year),'تجميع أرصدة السنة دون حذف الحركات.');});done('حُفظ الإغلاق السنوي دون حذف الحركات.');},footer:cancelBtn()+submitBtn('إغلاق السنة')});
}
function annualOpenForm() {confirmBox('إلغاء آخر إغلاق سنوي','ستعود حركات السنة إلى الكشوفات ما لم يشملها إغلاق آخر. لا يتغير صافي الرصيد.',async()=>{await mutate(n=>{const year=n.years.at(-1);L.openYear(n);ActivityUI.add(n,'year-open',String(year),'عادت الحركات إلى الكشوفات بحسب الإغلاقات المتبقية.');});done('أُلغي آخر إغلاق سنوي.');});}
function photoValue(form,key) {const w=qs(`[data-photo-box="${key}"]`,form);if(w?.dataset.loading==='1')throw new Error('انتظر اكتمال تجهيز الصورة.');return w?.dataset.value||'';}
function photoWidget(key,image,label,allowCamera=true) {
  return `<section class="photo-widget full" data-photo-box="${key}" data-value="${html(image)}"><div class="photo-caption"><strong>${html(label)}</strong><small>تُحفظ الصورة داخل الدفتر.</small></div><div class="photo-row"><img class="photo-thumb" ${image?`src="${html(image)}"`:'hidden'} alt="${html(label)}"><div class="row-actions"><label class="btn btn-outline file-label">${icon('image',16)}اختيار صورة<input class="sr-only" type="file" accept="image/*" data-photo="${key}"></label>${allowCamera?`<label class="btn btn-outline file-label">${icon('camera',16)}التقاط<input class="sr-only" type="file" accept="image/*" capture="environment" data-photo="${key}"></label>`:''}${button('إزالة','remove-photo','trash','btn-outline btn-small',image?'':'hidden')}</div></div><p class="photo-result" role="status"></p></section>`;
}
async function compactPhoto(file,key) {
  if(file.size>24*1024*1024)throw new Error('اختر صورة أصغر من 24 ميغابايت.');
  const url=URL.createObjectURL(file);let im=new Image();
  try {
    await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=()=>reject(new Error('لا يمكن قراءة هذه الصورة. جرّب JPG أو PNG.'));im.src=url;});
    if(!im.naturalWidth||im.naturalWidth*im.naturalHeight>50e6)throw new Error('أبعاد الصورة كبيرة جدًا.');
    const c=document.createElement('canvas'),ctx=c.getContext('2d');
    for(const max of key==='logo'?[384,256,160]:[1400,1100,850,640,480]) {
      const scale=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight));
      c.width=Math.max(1,Math.round(im.naturalWidth*scale));c.height=Math.max(1,Math.round(im.naturalHeight*scale));
      ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(im,0,0,c.width,c.height);
      for(const quality of [.86,.74,.62]) {const j=c.toDataURL('image/jpeg',quality);if(j.startsWith('data:image/jpeg;base64,')&&j.length<=190000)return j;}
    }
    throw new Error('تعذّر ضغط الصورة للحد المسموح.');
  }finally {URL.revokeObjectURL(url);}
}
function setPhoto(w,photo,message='') {
  w.dataset.value=photo;const img=qs('img',w);
  if(photo)img.src=photo;else img.removeAttribute('src');img.hidden=!photo;
  qs('[data-action="remove-photo"]',w).hidden=!photo;qs('.photo-result',w).textContent=message;
}
async function onPhotoInput(input) {
  const w=input.closest('[data-photo-box]'),file=input.files[0];if(!w||!file)return;
  input.value='';const ticket=String(Number(w.dataset.ticket||0)+1);w.dataset.ticket=ticket;w.dataset.loading='1';
  qs('.photo-result',w).textContent='جارٍ تجهيز الصورة…';
  try {const image=await compactPhoto(file,input.dataset.photo);if(w.isConnected&&w.dataset.ticket===ticket)setPhoto(w,image,'الصورة جاهزة للحفظ.');}
  catch(e){if(w.dataset.ticket===ticket)qs('.photo-result',w).textContent=e.message;}
  finally {if(w.dataset.ticket===ticket)w.dataset.loading='0';}
}
function removePhoto(b) {const w=b.closest('[data-photo-box]');w.dataset.ticket=String(Number(w.dataset.ticket||0)+1);w.dataset.loading='0';setPhoto(w,'','أُزيلت الصورة من النموذج.');}
function autoAccountInput(value) {
  return `<div class="field full entry-account" id="entry-account"><label for="entry-name">اسم الحساب</label><div class="input-action"><input id="entry-name" class="input" name="accountName" maxlength="90" required autocomplete="off" placeholder="اكتب أول حروف الاسم" role="combobox" aria-autocomplete="list" aria-controls="entry-suggestions" aria-expanded="false" value="${html(value)}">${ib('مسح اسم الحساب','clear-entry-account','close')}</div><div class="entry-suggestions" id="entry-suggestions" role="listbox" hidden></div><small>إذا لم يكن الاسم مسجّلًا، سيُنشأ له حساب جديد.</small></div>`;
}
function matchEntryAccount(s) {return data.accounts.find(a=>L.searchKey(a.name)===L.searchKey(s));}
let suggestionIndex=-1;
function entrySuggestions(show=true) {
  const input=qs('#entry-name',dlg),list=qs('#entry-suggestions',dlg);if(!input||!list)return;
  const key=L.searchKey(input.value);
  const selection=show&&key&&!matchEntryAccount(input.value)?data.accounts.filter(a=>L.searchKey(a.name).includes(key)).sort((a,b)=>Number(L.searchKey(b.name).startsWith(key))-Number(L.searchKey(a.name).startsWith(key))||a.name.localeCompare(b.name,'ar')).slice(0,9):[];
  suggestionIndex=-1; input.removeAttribute('aria-activedescendant');input.setAttribute('aria-expanded',String(!!selection.length));list.hidden=!selection.length;
  list.innerHTML=selection.map((a,i)=>`<button type="button" id="suggest-${i}" class="pick-item" role="option" aria-selected="false" data-action="pick-entry-account" data-id="${html(a.id)}">${avatar(a)}<span><strong>${html(a.name)}</strong><br><small>${html(categoryName(a.category))}</small></span></button>`).join('');
  entryPreview();
}
function pickEntryAccount(id) {const a=getAccount(id),input=qs('#entry-name',dlg);if(!a||!input)return;input.value=a.name;entrySuggestions(false);qs('[name="amount"]',dlg)?.focus();}
function entrySuggestKeys(e) {
  if(e.target.id!=='entry-name')return false;
  const list=qs('#entry-suggestions',dlg);if(!list||list.hidden)return false;
  const items=[...list.children];
  if(e.key==='Escape') { e.preventDefault();entrySuggestions(false);return true; }
  if(e.key==='Enter'&&suggestionIndex>=0){e.preventDefault();pickEntryAccount(items[suggestionIndex].dataset.id);return true;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();suggestionIndex=(suggestionIndex<0?(e.key==='ArrowDown'?0:items.length-1):(suggestionIndex+(e.key==='ArrowDown'?1:-1)+items.length)%items.length);
    items.forEach((b,i)=>b.setAttribute('aria-selected',String(i===suggestionIndex)));e.target.setAttribute('aria-activedescendant',items[suggestionIndex].id);items[suggestionIndex].scrollIntoView({block:'nearest'});return true;
  }
  return false;
}
function entryPreview() {
  AccountUI.entryLimitPreview();
  const list=qs('#entry-preview',dlg),input=qs('#entry-name',dlg),code=qs('[name="code"]',dlg)?.value;
  if(!list||!input||!code)return;
  const a=matchEntryAccount(input.value);
  if(!a){list.innerHTML='';list.hidden=true;return;}
  list.hidden=false;const x=L.statement(data,a.id,code);
  list.innerHTML=`<div class="receipt-preview-top"><strong>الرصيد الحالي</strong><span>${amt(x.ending)} ${html(codeInfo(code).symbol)}</span></div>${x.rows.slice(-4).reverse().map(r=>`<div class="receipt-preview-row"><span>${html(D(r.day))} · ${html(r.memo||'حركة مسجّلة')}</span>${amt(r.minor,true)}</div>`).join('')}`;
}
function calcBlock() {
  return `<details class="calc-block full" id="calc-block"><summary>${icon('calculator',16)}الحاسبة</summary><div class="calc-inner"><label class="field">العملية الحسابية<input class="input" id="calculator-expr" type="text" dir="ltr" maxlength="96" autocomplete="off" placeholder="(1250 + 750) ÷ 2"></label><div class="calc-keys">${['7','8','9','÷','4','5','6','×','1','2','3','−','0','.','⌫','+'].map(v=>button(v,'calc-key','','btn-outline',`data-value="${html(v)}"`)).join('')}</div><div class="row-actions">${button('استخدام الناتج','calc-use','check','btn-primary')}${button('مسح','calc-clear','close','btn-outline')}</div><p id="calc-error" class="subtle" role="status"></p></div></details>`;
}
function calculatorAction(action,key) {
  const input=qs('#calculator-expr',dlg),error=qs('#calc-error',dlg);if(!input)return;
  error.textContent='';
  if(action==='calc-clear'){input.value='';return;}
  if(action==='calc-key'){input.value=key==='⌫'?input.value.slice(0,-1):(input.value+key).slice(0,96);return;}
  try{const v=L.calculate(input.value);if(v<=0)throw new Error('يجب أن يكون المبلغ أكبر من صفر.');const a=qs('[name="amount"]',dlg);a.value=L.inputDecimal(v);qs('#calc-block',dlg).open=false;showWords();a.focus();}
  catch(e){error.textContent=e.message;}
}
function printCellV(c) {return c.kind==='money'?`<bdi>${html(money(c.v))}</bdi>`:c.kind==='num'?`<bdi>${html(fmt(c.v))}</bdi>`:c.kind==='day'?`<bdi>${html(c.v)}</bdi>`:html(c.v);}
function printHeading(title) {
  const s=data.settings,p=s.profile;
  return `<div class="print-head">${s.print.profile?`<div class="print-profile">${p.logo?`<img src="${html(p.logo)}" alt="شعار النشاط">`:''}<div><span class="brand-print">${html(s.business||'قيد · دفتر الذمم')}</span>${p.address?`<p>${html(p.address)}</p>`:''}${p.phone?`<p><bdi>${html(p.phone)}</bdi></p>`:''}${p.nameEn||p.addressEn?`<p dir="ltr" style="text-align:start">${html([p.nameEn,p.addressEn].filter(Boolean).join(' · '))}</p>`:''}</div></div>`:''}<h1>${html(title)}</h1></div>`;
}
function printTable(p) {
  return `<div class="print-section${p.type==='receipt'?' voucher-print':''}">${p.notes.map(n=>`<p>${html(n)}</p>`).join('')}<table><thead><tr>${p.cols.map(c=>`<th>${html(c)}</th>`).join('')}</tr></thead><tbody>${p.rows.length?p.rows.map(r=>`<tr>${r.map(c=>`<td>${printCellV(c)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${p.cols.length}">لا سجلات في هذه الفترة.</td></tr>`}</tbody></table>${renderFinalSummary(p.summary,p.currency)}</div>`;
}
function printFoot() {
  const t=data.settings.print;
  return `${t.footer?`<p class="print-note">${html(t.footer)}</p>`:''}${t.date?`<p class="signature">تاريخ الطباعة: ${html(D(L.localDay(),{day:'numeric',month:'long',year:'numeric'}))}</p>`:''}`;
}
function statementCodes(code=u.code,all=data.settings.print.allCodes) {
  const codes=new Set([code]);
  if(all)for(const e of data.entries)for(const l of e.legs)if(l.account===u.account)codes.add(l.code);
  return data.currencies.filter(c=>codes.has(c.code));
}
async function paintPrint(title,markup,{receipt=0}={}) {
  closeDialog();const area=qs('#print-area');
  if(receipt===58||receipt===80){
    area.dataset.receipt=String(receipt);
    area.innerHTML=`<style>@media print{@page{size:${receipt}mm 225mm;margin:3mm}}</style>`+markup;
  }else{delete area.dataset.receipt;area.innerHTML=markup;}
  // Preload the print-only logo and the locally bundled Arabic font.
  const logo=qs('.print-profile img',qs('#print-area'));
  if(logo?.decode)try{await logo.decode();}catch{}
  if(document.fonts?.ready)await document.fonts.ready;
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  if(receipt&&native?.printReceipt)native.printReceipt(title,receipt);else if(native)native.printPage(title);else window.print();
}
function printConfirmation() {
  const a=currentAccount();if(!a)throw new Error('افتح الحساب الذي تريد المصادقة على رصيده.');
  const title='نموذج المصادقة على الحساب';
  const until=u.statement.to||L.localDay();
  const p={cols:['العملة','الرصيد','الحالة'],notes:[`الحساب: ${a.name}`,`الأرصدة حتى ${until}`],rows:statementCodes().map(c=>{
    const m=L.statement(data,a.id,c.code,{to:until,archive:true}).ending;return [cellText(c.name+' · '+c.code),cellMoney(m),cellText(m===0?'متوازن':m>0?data.settings.print.credit:data.settings.print.debit)];
  })};
  return paintPrint(title,printHeading(title)+printTable(p)+`<p class="confirmation-text">${html(data.settings.profile.confirmation)}</p><div class="signature-line"><span>اسم المُصادق: ____________________</span><span>التوقيع: ____________________</span></div>`+printFoot());
}
function periodLabel(k,period) {
  return period==='year'?k:period==='month'?D(k+'-01',{month:'long',year:'numeric'}):period==='week'?D(k,{day:'numeric',month:'short'})+' – '+D(L.offset(6,k),{day:'numeric',month:'short',year:'numeric'}):D(k,{day:'numeric',month:'short',year:'numeric'});
}
function shownTime(t) {return data.settings.digits==='arabic'?t?.replace(/\d/g,c=>'٠١٢٣٤٥٦٧٨٩'[c]):t;}
function renderLan() {
  return settingsHead('استعراض على الكمبيوتر','افتح نسخة للقراءة فقط من متصفح جهاز متصل بشبكة Wi‑Fi نفسها.')+`<div class="view-stack">${alertBox('تُعرض أسماء الحسابات والأرصدة للمستلم. الرابط يعمل محليًا وغير مشفّر، فاستعمل شبكة موثوقة ولا تشارك الرابط مع غير المصرّح لهم.',true)}<section class="panel settings-card"><h2>جلسة استعراض مؤقتة</h2><p class="setting-desc">لا يمكن تعديل الدفتر أو تنزيل قاعدة بياناته من صفحة الاستعراض. تُغلق الجلسة عند مغادرة الشاشة أو بعد 10 دقائق. لا تُعرض أرقام الهواتف أو الصور.</p>${native?.startLan?`<form id="lan-form"><div class="form-grid">${fieldSelect('code','العملة',curOptions(u.code)+opt('all','جميع العملات',''))}${fieldSelect('scope','ما تريد عرضه',opt('total','الأرصدة فقط','total')+opt('detail','الأرصدة وتفاصيل الحركات','total'))}</div>${toggle('consent','أوافق على الاستعراض في هذه الشبكة',false)}<div class="config-foot">${submitBtn('بدء الاستعراض')}</div></form>`:'<p class="subtle">ابدأ هذه الجلسة من تطبيق أندرويد المثبّت على الهاتف.</p>'}</section></div>`;
}
let sharingLan=false;
function stopLan() {if(!sharingLan)return;sharingLan=false;native?.stopLan?.();}
function lanSnapshot(code,detail) {
  const cs=code==='all'?data.currencies:[codeInfo(code)];
  const list=data.accounts.slice().sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  if(!list.length)throw new Error('لا توجد حسابات لعرضها.');
  if(detail&&data.entries.length*cs.length>20000)throw new Error('اختر عملة واحدة أو الأرصدة فقط لتقليل حجم الاستعراض.');
  let text=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>قيد — استعراض محلي</title><style>*{box-sizing:border-box}body{font:15px system-ui,Arial;color:#192a49;background:#f1f4fb;margin:0;padding:24px}main{max-width:850px;margin:auto}header,section{border-radius:14px;background:white;border:1px solid #dde5f0;padding:18px;margin-bottom:12px}h1,h2{margin:0 0 8px}p{color:#4b6083;margin:8px 0}details{padding-block:8px;border-bottom:1px solid #e3e8f5}summary{cursor:pointer;display:list-item}bdi{font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:8px 6px;text-align:start;border-bottom:1px solid #e4e7f0;overflow-wrap:anywhere}.pos{color:#096754}.neg{color:#a71d4a}.badge{background:#e8edfc;color:#2a428d;padding:4px 8px;border-radius:7px;font-size:12px}</style></head><body><main><header><span class="badge">للقراءة فقط</span><h1>استعراض دفتر قيد</h1><p>لقطة من ${html(D(L.localDay(),{day:'numeric',month:'long',year:'numeric'}))} · لا يتغير محتواها أثناء الجلسة.</p></header>`;
  for(const c of cs){
    const by=L.balances(data,c.code),tot=L.totals(by);
    let movements;
    if(detail){movements=new Map();for(const e of data.entries)for(const l of e.legs)if(l.code===c.code){const rows=movements.get(l.account)||[];rows.push({day:e.day,time:e.time,minor:l.minor,memo:e.legs.length===2?'تحويل داخلي':e.memo});movements.set(l.account,rows);}}
    const posNeg=m=>m>0?'pos':m<0?'neg':'';
    text+=`<section><h2>${html(c.name)} <bdi>${html(c.code)}</bdi></h2>`;
    if(!detail)text+=`<table><thead><tr><th>الحساب</th><th>التصنيف</th><th>الرصيد</th></tr></thead><tbody>${list.filter(a=>cs.length===1||by.get(a.id).count).map(a=>`<tr><td>${html(a.name)}</td><td>${html(categoryName(a.category))}</td><td><bdi class="${posNeg(by.get(a.id).minor)}">${html(money(by.get(a.id).minor))}</bdi></td></tr>`).join('')}</tbody></table>`;
    else for(const a of list) {
      const v=by.get(a.id);if(cs.length>1&&!v.count)continue;
      const ms=(movements.get(a.id)||[]).sort((a,b)=>b.day.localeCompare(a.day)||b.time.localeCompare(a.time));
      text+=`<details><summary>${html(a.name)} · <bdi class="${posNeg(v.minor)}">${html(money(v.minor))}</bdi></summary>${ms.length?`<table><thead><tr><th>التاريخ</th><th>التفاصيل</th><th>المبلغ</th></tr></thead><tbody>${ms.map(e=>`<tr><td><bdi>${html(e.day)}</bdi></td><td>${html(e.memo||'—')}</td><td><bdi class="${posNeg(e.minor)}">${html(money(e.minor,true))}</bdi></td></tr>`).join('')}</tbody></table>`:'<p>لا حركات.</p>'}</details>`;
    }
    text+=`<h3>ملخص نهاية التقرير</h3><p>العملة: ${html(currencyLabel(c))}</p><p>إجمالي لي: <bdi class="pos">${html(money(tot.credit))}</bdi> · إجمالي عليّ: <bdi class="neg">${html(money(tot.debit))}</bdi> · الصافي: <bdi>${html(money(tot.net))}</bdi></p></section>`;
    if(text.length>2500000)throw new Error('الحسابات المعروضة كثيرة. جرّب الاستعراض بالأرصدة فقط.');
  }
  return text+'</main></body></html>';
}
function startLan(form) {
  const f=FD(form);if(!f.consent)throw new Error('أكد موافقتك على العرض داخل الشبكة المحلية.');
  const snapshot=lanSnapshot(f.code,f.scope==='detail');
  modal('جلسة الاستعراض','اجعل التطبيق مفتوحًا على هذه الشاشة.',`<div class="task-status">${stamp('desktop')}<p id="lan-status">جارٍ بدء الاستعراض…</p></div>`,{footer:button('وقف المشاركة','close-dialog','close','btn-outline')});
  sharingLan=true;native.startLan(snapshot);
}
window.qaydLanReady=(url)=>{
  if(!sharingLan){native?.stopLan?.();return;}
  const el=qs('#lan-status',dlg); if(!el)return;
  el.innerHTML=`انسخ الرابط إلى جهاز على الشبكة نفسها.<span class="lan-url"><input class="input" id="lan-url" aria-label="عنوان الاستعراض" dir="ltr" readonly value="${html(url)}">${ib('نسخ الرابط','copy-lan','copy')}</span>`;
};
window.qaydLanFailed=()=>{if(!sharingLan)return;sharingLan=false;modalError('تعذّر تشغيل الاستعراض. تأكد من اتصال الهاتف بشبكة Wi‑Fi قريبة أو قلّل البيانات المعروضة.');};
window.qaydLanStopped=()=>{if(!sharingLan)return;sharingLan=false;const el=qs('#lan-status',dlg);if(el)el.textContent='انتهت جلسة الاستعراض. لم يعد عنوانها قابلًا للفتح.';};
window.qaydNativeRefresh=()=>{if(!security.locked&&u.view==='settings'&&u.settings==='storage'&&!dlg.open)render();};
function syncNativeNotices() {
  if(!native?.setReminderDates||security.locked)return;
  const due=data.settings.notify.reminders?[...new Set(data.accounts.map(a=>a.reminder).filter(d=>L.validDay(d)&&d>=L.localDay()))]:[];
  try{native.setReminderDates(JSON.stringify(due));}catch{}
}
function doAdded(e,success) {
  const n=data.settings.notify;
  if(n.localAdd)try{native?.amountAdded?.();}catch{}
  return n.quickAdded&&MovementNotice.show(e.id,success);
}
function movementRecipients(id,channel='both') {
  const e=data.entries.find(x=>x.id===id);if(!e)return;
  if(e.legs.length===1)return draftEntry(e.id,e.legs[0].account,channel);
  const legs=e.legs.map(l=>{
    const a=getAccount(l.account);
    return button(`${a.name}${MessagePhoneUI.number(a)?'':' · بدون رقم'}`,'draft-entry','people','btn-outline',`data-id="${html(e.id)}" data-account="${html(a.id)}" data-channel="${html(channel)}"`);
  }).join('');
  modal('مسودة إشعار تحويل','اختر حساب المستلم. لن تُفتح رسالة للطرف الآخر تلقائيًا.',`<div class="dialog-actions">${legs}</div>`,{footer:cancelBtn()});
}
function draftEntry(id,account,channel) {
  const e=data.entries.find(x=>x.id===id),a=getAccount(account);if(!e||!a)return;
  const l=e.legs.find(x=>x.account===account);if(!l)return;
  const {notify:n,business,profile,home}=data.settings,c=codeInfo(l.code),transfer=e.legs.length===2;
  // Full ledger balance after posting; never a subtotal of the current statement filters.
  const balance=L.balances(data,l.code).get(account).minor;
  const text=QaydAccountFeatures.movementMessage({business,nameEn:profile.nameEn,minor:l.minor,balance,currency:c.name,format:money,
    credit:n.credit,debit:n.debit,transfer,intro:n.greet?n.intro:'',ending:n.greet?n.ending:'',
    stamp:n.date?e.day+(home.time?' '+e.time:''):'',party:transfer&&n.transferDetails?transferNote(e,account):''});
  const review=()=>{const current=getAccount(account);if(current)messageDraft(current,text,channel,true);};
  if(!MessagePhoneUI.number(a))return MessagePhoneUI.open(a.id,review);
  review();
}
function draftStatement() {
  const a=currentAccount();if(!a)throw new Error('افتح كشف الحساب أولًا.');
  const p=exportData('statement'),n=data.settings.notify;
  const summary=[p.title,...p.notes];
  const rows=p.rows.map(r=>`${r[0].v} | ${r[2].v==='تحويل'?'تحويل':r[3].v>0?n.credit:n.debit} ${money(Math.abs(r[3].v))}`);
  // Keep a useful, bounded chat draft. Export remains available for the complete ledger.
  for(const row of rows.slice(0,64))summary.push(row);
  if(rows.length>64)summary.push(`المعروض 64 من ${fmt(rows.length)} حركة. شارك ملف الكشف للاطلاع على بقية الحركات.`);
  summary.push('', 'ملخص نهاية الكشف',`العملة: ${currencyLabel(p.currency)}`, ...QaydTotals.fields(p.summary).map(([,label,value])=>`${label}: ${money(value)}`));
  if(p.summary.note)summary.push(p.summary.note);
  messageDraft(a,summary.join('\n'),'wa');
}
function messageDraft(a,text,requested,movement=false) {
  const channel=['sms','wa'].includes(requested)?requested:'both';
  const phone=MessagePhoneUI.number(a);
  const change=button(phone?'تعديل الرقم':'إضافة رقم','edit-draft-phone','edit','btn-outline btn-small',`data-id="${html(a.id)}" data-channel="${channel}" data-key="${movement?'movement':'statement'}"`);
  const maybe=(label,key)=>button(label,'compose-message',key==='sms'?'mail':'chat',key==='sms'?'btn-outline msg-sms':'btn-primary msg-wa',`data-channel="${key}" ${phone?'':'disabled'}`);
  modal(movement?'إشعار الحركة':'مراجعة المسودة',movement?'راجع مبلغ الحركة والرصيد الإجمالي الحالي في عملتها.':'راجع النص قبل فتح تطبيق الإرسال.',`
    <div class="short-recipient"><div><span>المستلم</span><strong dir="auto">${html(a.name)}</strong>${phone?`<bdi class="short-phone">${html(phone)}</bdi>`:'<small>لا يوجد رقم صالح</small>'}</div>${change}</div>
    <label class="field short-send-note">نص الرسالة<textarea class="input" id="draft-message" rows="${movement?4:7}" maxlength="${movement?1000:6000}" dir="auto">${html(text)}</textarea></label>
    <input type="hidden" id="draft-phone" value="${html(phone)}">${data.demo?alertBox('هذه بيانات تجريبية. يمكنك النسخ؛ فتح تطبيقات الإرسال معطّل.',true):''}
    <p class="subtle short-send-note">يُفتح النص كمسودة فقط. أكّد الإرسال في تطبيق الرسائل أو واتساب.</p>`,
    {footer:button('إغلاق','close-dialog','','btn-outline')+button('نسخ النص','copy-draft','copy')+
      (['sms','both'].includes(channel)?maybe('فتح SMS','sms'):'')+(['wa','both'].includes(channel)?maybe(data.settings.notify.business?'فتح واتساب للأعمال':'فتح واتساب','wa'):'')});
}
function editDraftPhone(id,channel,key){
  const text=qs('#draft-message',dlg)?.value;
  if(text===undefined)return;
  return MessagePhoneUI.open(id,()=>{const a=getAccount(id);if(a)messageDraft(a,text,channel,key==='movement');});
}
async function copyValue(value) {
  if(!value)throw new Error('لا يوجد نص للنسخ.');
  if(native?.copyText){native.copyText(value);toast('نُسخ النص.');return;}
  try{await navigator.clipboard.writeText(value);toast('نُسخ النص.');}
  catch {const f=qs('#draft-message',dlg)||qs('#lan-url',dlg);if(f){f.focus();f.select();modalError('حدّد النص وانسخه يدويًا.');}}
}
function composeDraft(medium) {
  const input=qs('#draft-message',dlg),number=qs('#draft-phone',dlg)?.value,text=input?.value.trim();
  if(!text||!number)throw new Error('تحقق من النص ورقم المستلم.');
  if(data.demo)throw new Error('الفتح معطّل في البيانات التجريبية حتى لا تراسل رقمًا بالخطأ. يمكنك نسخ المسودة أو بدء دفتر فارغ.');
  if(native?.compose){native.compose(medium,number,text,data.settings.notify.business);return;}
  if(medium==='sms'){
    modalError('لفتح مسودة SMS استخدم تطبيق أندرويد. يمكنك نسخ النص من المعاينة.');return;
  }
  if(text.length>4000)throw new Error('المسودة طويلة. استخدم التصدير أو قصّر الرسالة.');
  const url='https://wa.me/'+number.slice(1)+'?text='+encodeURIComponent(text);
  window.open(url,'_blank','noopener,noreferrer');
}
