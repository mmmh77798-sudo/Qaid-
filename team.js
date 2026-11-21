/* Owner team controls are bundled with Qayd. The offline WebView never loads the remote site. */
'use strict';
const TeamUI=(()=>{
  let summary=null,me=null,actions=[],originMemory='',editing=false,search='',sequence=0,pending=null,backgroundNote=false;
  const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  const active=()=>!security.locked&&u.view==='settings'&&u.settings==='shared';
  const origin=()=>{if(originMemory)return originMemory;try{return QaydSharedLink.read(localStorage);}catch{return '';}};
  const bridge=()=>typeof native?.teamRequest==='function';
  const deskBridge=()=>typeof native?.openSharedDesk==='function';
  const suggested='https://qayd-production.up.railway.app';
  function chooseMode(){if(!security.locked&&typeof native?.configureDeviceMode==='function'){reset();native.configureDeviceMode(origin());}}
  function openDesk(quick=false){
    if(security.locked||!deskBridge())return;
    const saved=origin();
    if(!saved){settingsOpen('shared');qs('#team-origin-form [name=origin]')?.focus();return;}
    reset({redraw:true});closeDialog();
    if(quick&&typeof native.openSharedPosting==='function')native.openSharedPosting(saved);
    else native.openSharedDesk(saved);
  }
  function shortcut(){
    if(!deskBridge())return '';
    const ready=!!origin(),fast=typeof native.openSharedPosting==='function';
    return `<section class="panel record-shared" aria-label="تسجيل مشترك"><div class="record-label">${stamp('cloud','mint')}<div><h2>الدفتر المشترك</h2><p>${ready?'للفريق · عبر الإنترنت':'يحتاج إلى ربط'}</p></div></div><div class="record-buttons">${ready&&fast?button('تسجيل مشترك','shared-post-open','plus','btn-shared'):''}${ready&&fast?link('فتح المشترك','shared-desk-open','arrowLeft'):button(ready?'فتح المشترك':'ربط المشترك','shared-desk-open','arrowLeft','btn-outline')}</div></section>`;
  }
  const idattr=id=>`data-id="${html(id)}"`;
  const userCount=()=>summary?.users.length||0;
  const fail=(message,code='',status=0)=>Object.assign(new Error(message),{code,status});
  const gone=()=>fail('توقّف عرض فريق الدفتر في هذه الشاشة.','team-cancelled');
  const mustBeHere=()=>{if(!active())throw gone();};
  const badges=(label,tone='')=>`<span class="team-badge ${tone}">${html(label)}</span>`;
  function finish(ticket,status,encoded){
    const p=pending;if(!p||p.ticket!==ticket)return;
    clearTimeout(p.timer);pending=null;
    try{
      if(typeof encoded!=='string'||encoded.length>1048576||!Number.isInteger(status))throw new Error('reply');
      const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))));
      if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('reply');
      if(status>=200&&status<300)p.resolve(data);
      else p.reject(fail(typeof data.error==='string'?data.error:'تعذّر إتمام الطلب.',data.code,status));
    }catch{p.reject(fail('تعذّرت قراءة رد الخادم. حدّث القائمة قبل إعادة أي عملية حفظ.','protocol'));}
  }
  function request(op,body={}){
    mustBeHere();
    if(!bridge())throw fail('إدارة الفريق من هذه الصفحة متاحة في تطبيق أندرويد.');
    if(pending)throw fail('تجري عملية اتصال بالفعل. انتظر قليلًا.','busy');
    const saved=origin();if(!saved)throw fail('احفظ عنوان خادم الدفتر أولًا.');
    const ticket='team-'+(++sequence);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        if(pending?.ticket!==ticket)return;
        pending=null;if(op==='login'){try{native.teamClear?.();}catch{}}reject(fail('لم يُؤكّد الخادم الطلب في الوقت المحدد. حدّث القائمة قبل تكرار الحفظ.','network'));
      },65000);
      pending={ticket,resolve,reject,timer};
      try{native.teamRequest(ticket,saved,op,JSON.stringify(body));}
      catch{pending=null;clearTimeout(timer);reject(fail('تعذّر استخدام الاتصال من التطبيق.'));}
    });
  }
  function reset({redraw=false,paused=false}={}){
    const hadPrivate=!!(me||pending||qs('#team-login-form [name="password"]')?.value||qs('[data-team-content]',dlg));
    if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(gone());}
    summary=null;me=null;actions=[];search='';editing=false;
    try{native?.teamClear?.();}catch{}
    if(redraw&&active()&&hadPrivate){
      backgroundNote=paused;
      if(qs('[data-team-content]',dlg))closeDialog();
      render();
    }
  }
  function authLost(e){
    if(e.code!=='login')return false;
    reset({redraw:true});toast('انتهت جلسة الفريق. سجّل دخول المالك مجددًا.',true);return true;
  }
  function setActions(object){
    if(!object||!Object.hasOwn(object,'view'))throw fail('تعذّر قراءة قائمة الصلاحيات من الخادم.');
    actions=Object.entries(object).filter(([k,v])=>/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(k)&&typeof v==='string').slice(0,32);
  }
  function useTeam(data){
    if(!data?.me?.owner||!Array.isArray(data.categories)||!Array.isArray(data.users))throw fail('لم تصل بيانات فريق صالحة من الخادم.');
    if(data.actions)setActions(data.actions);me=data.me;summary=data;
  }
  async function refresh(){
    const data=await request('team');mustBeHere();useTeam(data);render();
  }
  function connectCard(saved){
    return `<section class="panel settings-card team-connection-form"><form id="team-origin-form">${field('origin','عنوان خادم الدفتر · HTTPS',saved,'required maxlength="253" placeholder="https://ledger.example.com" autocomplete="off" spellcheck="false" dir="ltr"','url')}
    <div class="config-foot">${saved?button('إلغاء','team-cancel-config','close','btn-outline')+button('نسيان العنوان','team-forget','trash','btn-outline btn-text-danger'):''}${submitBtn('حفظ عنوان الدفتر')}</div></form>
    ${deskBridge()?`<div class="team-origin-suggestion"><p class="subtle">إذا كان هذا عنوان دفترك، عبّئه ثم اضغط «حفظ عنوان الدفتر».</p><bdi>${html(suggested)}</bdi>${button('استخدام رابط قيد الحالي','team-use-current-link','cloud','btn-outline btn-small')}</div>`:'<p class="subtle">العنوان في المثال للتوضيح فقط. استخدم رابط HTTPS الذي جهّزه مسؤول استضافتك.</p>'}</section>`;
  }
  function loginCard(saved){
    if(!bridge())return `<section class="panel settings-card">${section('إدارة الفريق من أندرويد','افتح هذه الصفحة في تطبيق قيد. المعاينة المحلية في المتصفح لا تتصل بخادم الدفتر.')}<div class="button-set">${button('نسخ رابط دخول الفريق','team-copy-link','copy','btn-outline')}</div></section>`;
    return `<section class="panel settings-card team-gate">${section('دخول المالك','استخدم اسم وكلمة سر حساب المالك على الخادم، وليس كلمة سر الدفتر المحلي.')}
      ${backgroundNote?`<div class="team-return" role="status">أُغلقت جلسة هذه الشاشة عند مغادرة التطبيق. إذا كنت قد طلبت حفظًا، راجع القائمة بعد الدخول قبل إعادة المحاولة.</div>`:''}
      <form id="team-login-form"><div class="form-grid">${field('login','اسم دخول المالك','','required maxlength="32" autocapitalize="none" spellcheck="false" autocomplete="username" dir="ltr"')}${field('password','كلمة سر الخادم','','required maxlength="128" autocomplete="current-password" dir="ltr"','password')}
      <div id="team-otp" class="full" hidden>${field('otp','رمز المصادقة أو رمز استرداد','','maxlength="30" autocomplete="one-time-code" spellcheck="false" dir="ltr"')}</div></div>
      <div id="team-login-error" class="form-error" role="alert" hidden></div><p id="team-login-busy" class="subtle" role="status" hidden>جارٍ التحقق من الدخول على الخادم…</p><div class="config-foot">${submitBtn('دخول وإدارة المستخدمين')}</div></form></section>`;
  }
  const status=x=>!x.enabled?badges('موقوف','warn'):x.mustChange?badges('كلمة سر مؤقتة','wait'):badges('نشط','ok');
  function people(){
    const list=summary?.users||[],ready=!!summary,enabled=list.filter(x=>x.enabled).length;
    const row=x=>`<li class="team-person" data-team-person="${html(x.id)}"><div class="team-person-main"><span class="team-avatar" aria-hidden="true">${html([...x.name][0]||'ق')}</span><div class="team-person-title"><strong dir="auto">${html(x.name)}</strong><small><bdi>${html(x.login)}</bdi> <span>·</span> ${html(fmt(x.scopeCount||0))} تصنيف</small></div></div><div class="team-person-state">${status(x)}</div><div class="team-person-actions">${button('الصلاحيات','team-edit','shield','btn-outline btn-small',idattr(x.id))}${ib('إجراءات المستخدم','team-actions','settings',idattr(x.id))}</div></li>`;
    return `<section class="panel settings-card team-directory">${section('فريق الدفتر المشترك',ready?'افتح مستخدمًا أو راجع صلاحياته في التصنيفات.':'سُجّلت الجلسة، لكن القائمة لم تصل بعد.',ready?button('فتح مستخدم فرعي','team-create','plus','btn-primary'):button('جلب قائمة الفريق','team-refresh','undo','btn-primary'))}
      ${ready?`<div class="team-stats"><div><strong>${html(fmt(list.length))}</strong><small>المستخدمون الفرعيون</small></div><div><strong>${html(fmt(enabled))}</strong><small>مفعّلون</small></div><div><strong>${html(fmt(list.length-enabled))}</strong><small>موقوفون</small></div></div>
      <div class="team-list-tools">${list.length?field('team-search','بحث في الفريق',search,'maxlength="70" autocomplete="off" placeholder="الاسم أو اسم الدخول"','search'):''}${button('تحديث','team-refresh','undo','btn-outline')}</div>
      ${list.length?`<ul class="team-list">${list.map(row).join('')}</ul><p class="subtle" id="team-empty-search" hidden>لا يوجد مستخدم يطابق البحث.</p>`:emptyView('لا مستخدمون فرعيون بعد','اضغط «فتح مستخدم فرعي» ثم حدّد التصنيفات والوظائف التي يحتاجها الموظف.','people')}`:''}</section>`;
  }
  function page(){
    const saved=origin();
    return settingsHead('ربط الدفتر المشترك','دفتر الهاتف لا يُرفع إلى الخادم.')+`<div class="view-stack team-page">
      ${!saved||editing?connectCard(saved):`<section class="panel settings-card team-server"><div class="team-server-label">${stamp('cloud','mint')}<div><strong>عنوان الدفتر</strong><bdi>${html(saved)}</bdi></div></div><div class="button-set">${button('تعديل العنوان','team-config','edit','btn-outline')}${button('نسخ الرابط','team-copy-link','copy','btn-outline')}${me?button('تسجيل الخروج','team-logout','arrowRight','btn-outline'):''}</div></section>`}
      ${saved&&!editing?(deskBridge()&&bridge()?`<details class="panel more-disclosure" data-disclosure="legacy-team"><summary>إدارة فريق خادم 3.0 القديم</summary><div class="more-disclosure-body">${me?people():loginCard(saved)}</div></details>`:!deskBridge()?(me?people():loginCard(saved)):''):''}
    </div>`;
  }
  async function signIn(form){
    const f=FD(form),alert=qs('#team-login-error',form),loading=qs('#team-login-busy',form);alert.hidden=true;loading.hidden=false;backgroundNote=false;
    try{
      const r=await request('login',{login:String(f.login).trim(),password:f.password,...(f.otp?{otp:f.otp}:{})});mustBeHere();
      if(!r.me?.owner)throw fail('سجّل دخول حساب المالك لهذه الصفحة.');
      setActions(r.actions);me=r.me;form.reset();render();
      try{await refresh();}catch(e){if(e.code==='team-cancelled'||authLost(e))return;toast(e.message,true);}
    }catch(e){
      if(e.code==='team-cancelled'||!form.isConnected)return;
      if(e.code==='mfa-required'||e.code==='mfa-invalid'){
        const pane=qs('#team-otp',form),code=qs('[name=otp]',pane);pane.hidden=false;code.required=true;code.focus();code.select();
      }
      alert.textContent=e.message;alert.hidden=false;
    }finally{loading.hidden=true;}
  }
  function saveOrigin(form){
    const next=QaydSharedLink.origin(FD(form).origin),prior=origin();
    if(prior!==next)reset();
    originMemory=next;try{QaydSharedLink.write(localStorage,next);}catch{}editing=false;backgroundNote=false;render();
    toast(deskBridge()?'حُفظ العنوان. افتح الدفتر المشترك من الرئيسية.':'حُفظ عنوان الدفتر على هذا الجهاز.');
  }
  function teamModal(title,sub,body,options={}){modal(title,sub,`<div data-team-content>${body}</div>`,options);}
  function togglePermissions(){
    let checked=0;
    for(const node of qsa('.team-scope',dlg)){
      const view=qs('[data-team-perm="view"]',node), body=qs('.team-scope-actions',node),report=qs('[data-team-perm="reports"]',node);
      body.hidden=!view.checked;if(view.checked)checked++;
      for(const input of qsa('.team-scope-actions input',node)){
        const dependent=input.dataset.teamPerm==='exportCsv'||input.dataset.teamPerm==='followup';
        input.disabled=!view.checked||(dependent&&!report?.checked);if(input.disabled)input.checked=false;
      }
      node.classList.toggle('selected',view.checked);
    }
    const count=qs('#team-selected',dlg);if(count)count.textContent=checked?`التصنيفات المسموحة: ${fmt(checked)}`:'لم تُمنح صلاحية عرض لأي تصنيف بعد.';
  }
  const check=(key,name,value)=>`<label class="team-check"><input type="checkbox" data-team-perm="${html(key)}" ${value?'checked':''}><span>${html(name)}</span></label>`;
  function rightsForm(user=null){
    const grants=new Map(user?.grants?.map(x=>[x.category,x.allow]));
    const rows=summary.categories.map(c=>{
      const chosen=grants.get(c.id)||[];
      return `<section class="team-scope" data-team-category="${html(c.id)}" data-team-name="${html(c.name)}"><div class="team-scope-head"><strong dir="auto">${html(c.name)}</strong>${check('view','عرض',chosen.includes('view'))}</div>
        <div class="team-scope-actions">${actions.filter(([k])=>k!=='view').map(([k,v])=>check(k,v,chosen.includes(k))).join('')}</div></section>`;
    }).join('');
    teamModal(user?'صلاحيات المستخدم الفرعي':'فتح مستخدم فرعي',user?`${user.name} · ${user.login}`:'سيكون للموظف اسم دخول وكلمة سر مستقلان.',
      `<div class="form-grid">${field('name','اسم المستخدم',user?.name||'','required maxlength="60" dir="auto"')}${field('login','اسم الدخول',user?.login||'',user?'readonly dir="ltr"':'required minlength="3" maxlength="32" pattern="[A-Za-z0-9][A-Za-z0-9._\\-]{2,31}" autocapitalize="none" spellcheck="false" autocomplete="off" dir="ltr" placeholder="sales.1"')}</div>
      ${user?'':alertBox('يعرض قيد كلمة سر مؤقتة مرة واحدة. يختار الموظف كلمة سر جديدة عند أول دخول.')}
      <div class="team-rule-caption"><h3>الصلاحيات حسب التصنيف</h3><p class="subtle">فعّل «عرض» للتصنيف أولًا، ثم حدّد وظائفه. لا تُمنح أي صلاحية تلقائيًا.</p><p id="team-selected" role="status"></p></div>
      ${summary.categories.length>6?field('team-category-search','بحث في التصنيفات','','maxlength="70" autocomplete="off"','search'):''}<div class="team-rule-grid">${rows}</div>`,{
      focus:'[name="name"]',footer:cancelBtn()+submitBtn(user?'حفظ الصلاحيات':'إنشاء المستخدم'),onSubmit:async form=>{
        const f=FD(form);
        const picked=qsa('.team-scope',form).map(c=>({category:c.dataset.teamCategory,allow:qsa('[data-team-perm]:checked',c).map(x=>x.dataset.teamPerm)})).filter(g=>g.allow.length);
        const r=await guarded(user?'update':'create',user?{id:user.id,version:user.version,name:f.name,enabled:user.enabled,grants:picked}:{name:f.name,login:f.login.trim(),grants:picked});
        if(!r)return;
        localUser(r.user);if(r.temporary)invite(r);else{closeDialog();toast('حُفظت صلاحيات المستخدم على الخادم.');}
      }
    });togglePermissions();
  }
  function localUser(person){
    mustBeHere();const i=summary.users.findIndex(x=>x.id===person.id),publicInfo={...person};delete publicInfo.grants;
    if(i<0)summary.users.unshift(publicInfo);else summary.users[i]=publicInfo;
    render();filterPeople(search);
  }
  async function guarded(op,data={}){
    try{return await request(op,data);}catch(e){
      if(authLost(e))return null;
      if(e.code==='stale')throw fail('تغيّرت بيانات المستخدم على الخادم. أغلق هذه النافذة، حدّث قائمة الفريق ثم راجع الصلاحيات قبل الحفظ.');
      if(op!=='member'&&e.status>=500&&!['tls','redirect','inactive'].includes(e.code))throw fail(e.message+' أغلق النافذة وحدّث قائمة الفريق قبل إعادة الطلب.');
      throw e;
    }
  }
  async function details(id){
    const r=await guarded('member',{id});if(!r)return null;
    mustBeHere();return r.user;
  }
  function invite({user,temporary}){
    teamModal('بيانات دخول المستخدم',user.name,alertBox('كلمة السر المؤقتة تظهر الآن فقط. سلّمها للموظف بطريقة آمنة ومنفصلة عن رابط الدخول.',true)+
      `<div class="team-invite">${field('team-link','رابط الدفتر',origin()+'/','readonly dir="ltr"')}${button('نسخ الرابط','team-copy-invite','copy','btn-outline','data-key="team-link"')}
      ${field('team-login','اسم الدخول',user.login,'readonly dir="ltr"')}${button('نسخ اسم الدخول','team-copy-invite','copy','btn-outline','data-key="team-login"')}
      ${field('team-pass','كلمة السر المؤقتة',temporary,'readonly autocomplete="off" dir="ltr"')}${button('نسخ كلمة السر المؤقتة','team-copy-invite','copy','btn-outline','data-key="team-pass"')}</div>`,
      {footer:button('تم، حفظت البيانات','close-dialog','check','btn-primary')});
  }
  function memberActions(person){
    teamModal('إدارة المستخدم الفرعي',person.name,alertBox('لا تغيّر هذه الإجراءات بيانات الحركات أو الأرصدة.')+`<div class="team-action-grid">${button(person.enabled?'إيقاف المستخدم':'تفعيل المستخدم','team-toggle',person.enabled?'lock':'check','btn-outline',idattr(person.id))}${button('تعيين كلمة سر مؤقتة','team-reset','undo','btn-outline',idattr(person.id))}${button('إنهاء جلسات المستخدم','team-revoke','shield','btn-outline',idattr(person.id))}</div>`,{footer:button('إغلاق','close-dialog','close','btn-outline')});
  }
  function confirmTeam(title,text,label,submit,danger=false){teamModal(title,'',alertBox(text,danger),{footer:cancelBtn()+submitBtn(label,danger),onSubmit:submit});}
  function filterPeople(value){
    search=String(value);const key=L.searchKey(search),byId=new Map((summary?.users||[]).map(x=>[x.id,x]));let count=0;
    for(const row of qsa('[data-team-person]')){const user=byId.get(row.dataset.teamPerson);row.hidden=!user||!L.searchKey(user.name+' '+user.login).includes(key);if(!row.hidden)count++;}
    const empty=qs('#team-empty-search');if(empty)empty.hidden=count!==0;
  }
  async function action(b){
    mustBeHere();const {action,id,key}=b.dataset;
    if(action==='team-use-current-link'){const field=qs('#team-origin-form [name=origin]');if(field){field.value=suggested;field.focus();}return;}
    if(action==='team-config'){editing=true;render();return;}
    if(action==='team-cancel-config'){editing=false;render();return;}
    if(action==='team-forget')return confirmTeam('نسيان عنوان الدفتر','سيُزال العنوان من هذا الجهاز فقط. لا يُحذف شيء من الخادم أو دفتر الهاتف.','نسيان العنوان',()=>{reset();editing=false;originMemory='';try{QaydSharedLink.forget(localStorage);}catch{}closeDialog();render();});
    if(action==='team-copy-link')return copyValue(origin()+'/');
    if(action==='team-logout'){
      if(pending)throw fail('انتظر اكتمال الاتصال الجاري.');
      try{await request('logout');}catch(e){if(e.code==='team-cancelled')return;}
      reset();mustBeHere();render();return toast('أُغلقت جلسة الفريق على هذا الجهاز.');
    }
    if(action==='team-refresh'){try{await refresh();filterPeople(search);toast('حُدّث فريق الدفتر.');}catch(e){if(!authLost(e))throw e;}return;}
    if(action==='team-copy-invite'){
      if(!['team-link','team-login','team-pass'].includes(key))return;
      const el=qs(`[name="${key}"]`,dlg),value=el?.value;if(!value)return;
      if(key==='team-pass'&&native?.teamCopyTemporary){native.teamCopyTemporary(value);return toast('نُسخت كلمة السر المؤقتة.');}
      return copyValue(value);
    }
    if(!summary?.me.owner)return;
    if(action==='team-create'){if(userCount()>=100)throw fail('بلغ عدد المستخدمين الفرعيين الحد الأقصى.');return rightsForm();}
    const person=summary.users.find(x=>x.id===id);if(!person)return;
    if(action==='team-actions')return memberActions(person);
    if(action==='team-edit'){
      const user=await details(id);if(!user)return;
      if(user.grants.some(g=>!summary.categories.some(c=>c.id===g.category)||g.allow.some(k=>!actions.some(([a])=>a===k))))await refresh();
      if(user.grants.some(g=>!summary.categories.some(c=>c.id===g.category)||g.allow.some(k=>!actions.some(([a])=>a===k))))throw fail('تغيّرت التصنيفات أو الصلاحيات. حدّث قائمة الفريق أولًا.');
      return rightsForm(user);
    }
    if(action==='team-toggle'){
      const user=await details(id);if(!user)return;const enabled=!user.enabled;
      return confirmTeam(enabled?'تفعيل المستخدم':'إيقاف المستخدم',enabled?`سيعود «${user.name}» للدخول بصلاحياته الحالية.`:`سيُمنع «${user.name}» من الدخول وتُنهى جميع جلساته.`,enabled?'تفعيل':'إيقاف',async()=>{
        const r=await guarded('update',{id:user.id,version:user.version,name:user.name,enabled,grants:user.grants});
        if(r){localUser(r.user);closeDialog();toast(enabled?'أُعيد تفعيل المستخدم.':'أُوقف المستخدم.');}
      },!enabled);
    }
    if(action==='team-reset')return confirmTeam('تعيين كلمة سر مؤقتة',`تنتهي جلسات «${person.name}»، وتظهر كلمة سر جديدة مرة واحدة.`, 'إنشاء كلمة مؤقتة',async()=>{
      const r=await guarded('reset',{id,version:person.version});if(r){localUser(r.user);invite(r);}
    });
    if(action==='team-revoke')return confirmTeam('إنهاء الجلسات',`يُخرج الخادم «${person.name}» من جلساته الحالية. يمكنه الدخول مجددًا إذا كان حسابه مفعّلًا.`, 'إنهاء الجلسات',async()=>{
      const r=await guarded('revoke',{id,version:person.version});if(r){localUser(r.user);closeDialog();toast('أُنهيت جلسات المستخدم.');}
    });
  }
  function input(el){
    if(el.name==='team-search')filterPeople(el.value);
    if(el.name==='team-category-search'){
      const key=L.searchKey(el.value);
      for(const c of qsa('.team-scope',dlg))c.hidden=!!key&&!L.searchKey(c.dataset.teamName).includes(key);
    }
    if((el.name==='login'||el.name==='password')&&el.closest('#team-login-form')){
      const pane=qs('#team-otp'),otp=qs('[name="otp"]',pane);pane.hidden=true;otp.value='';otp.required=false;
    }
  }
  window.qaydTeamReply=finish;
  window.qaydTeamSuspended=()=>reset({redraw:true,paused:true});
  return {page,action,input,saveOrigin,signIn,reset,togglePermissions,openDesk,shortcut,chooseMode};
})();
