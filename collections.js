/* Local collections workspace, explicitly separated from signed ledger statements. */
'use strict';
const CollectionsUI=(()=>{
  const C=QaydCollections;
  const statusLabels={...C.fields,followup:'متابعة مستحقة'};
  const followLabels={contacted:'تم التواصل',promise:'وعد بالسداد',review:'تحتاج مراجعة'};
  const titles={queue:'قائمة التحصيل',aging:'أعمار المتأخرات',receipts:'سندات القبض',activity:'سجل التغييرات'};
  const method='تُخصم السندات المخصّصة من قيودها أولًا، ثم تُوزّع بقية الدفعات على الأقدم في الحساب والعملة نفسيهما. لا يُعد أي مبلغ متأخرًا دون موعد استحقاق مسجّل.';
  const blank=()=>({tab:'queue',asOf:'',query:'',category:'',status:'',auditQuery:'',auditType:'',receiptFrom:'',receiptTo:'',paymentMethod:'',receiptQuery:'',receiptTarget:''});
  const dateAttr='dir="ltr" min="1000-01-01" max="9999-12-31"';
  const dayText=d=>d?`<bdi>${html(d)}</bdi>`:'—';
  const amount=(value,cls='')=>`<bdi class="collect-amount ${cls}">${html(money(value))}</bdi>`;
  let cache=new WeakMap();
  const clearCache=()=>{cache=new WeakMap();};
  function snapshot(code,day=L.localDay()){
    let snapshots=cache.get(data);
    if(!snapshots){snapshots=new Map();cache.set(data,snapshots);}
    const key=code+'@'+day;
    if(!snapshots.has(key)){
      if(snapshots.size>=4)snapshots.delete(snapshots.keys().next().value);
      snapshots.set(key,C.snapshot(data,code,day));
    }
    return snapshots.get(key);
  }
  function asOf(){
    const day=u.collections.asOf||L.localDay();
    if(!L.validDay(day)||day>L.localDay())throw new Error('اختر تاريخ تقرير صحيحًا لا يتجاوز اليوم.');
    return day;
  }
  function selection(code,aging){
    const day=asOf(),f=u.collections,key=L.searchKey(f.query);
    const scoped=snapshot(code,day).rows.filter(r=>(!f.category||(r.account.category||'~')===f.category)&&
      (!key||L.searchKey(r.account.name).includes(key)));
    const rows=aging?scoped.filter(r=>r.overdue>0):scoped.filter(r=>C.matches(r,f.status,L.localDay()));
    return {day,rows,scoped};
  }
  function tab(key){if(!Object.hasOwn(titles,key))return;u.collections.tab=key;u.rowsPage=1;render();}
  function filter(key){u.collections.status=Object.hasOwn(statusLabels,key)?key:'';tab('queue');}
  function renderPage(){
    const f=u.collections,activity=f.tab==='activity',aging=f.tab==='aging',receipts=f.tab==='receipts';
    const target=receipts?'receipt-register':aging?'collection-aging':'collection';
    const back=receipts?`<div class="back-button">${goBtn('الحركات','moves','arrowRight')}</div>`:aging?`<div class="back-button">${link('التحصيل','collection-tab','arrowRight','data-key="queue"')}</div>`:settingsBack();
    const exports=activity?'':button(receipts?'خيارات السندات':'خيارات التقرير','export-options','more','btn-outline',`data-target="${target}"`);
    const ages=!receipts&&!activity&&!aging?`<div class="view-links">${link(titles.aging,'collection-tab','report','data-key="aging"')}</div>`:'';
    const controls=receipts?ReceiptBookUI.controls(f):activity?`<div class="collect-filters panel">${search('collections','ابحث في سجل التغييرات…',f.auditQuery).replace('data-filter="query"','data-filter="auditQuery"')}<select class="control-select" data-scope="collections" data-filter="auditType" aria-label="نوع التغيير">${opt('','كل التغييرات',f.auditType)}${Object.entries(ActivityUI.groups).map(([k,label])=>opt(k,label,f.auditType)).join('')}</select></div>`:
      `<div class="collect-filters panel">${search('collections','ابحث باسم الحساب…',f.query)}${currency()}<label class="collect-date">حتى <input class="input" type="date" aria-label="حتى تاريخ" data-scope="collections" data-filter="asOf" dir="ltr" min="1000-01-01" max="${L.localDay()}" value="${html(f.asOf||L.localDay())}"></label><select class="control-select" data-scope="collections" data-filter="category" aria-label="تصنيف الحساب">${catOptions(f.category)}${opt('~','بلا تصنيف',f.category)}</select>${aging?'':`<select class="control-select" data-scope="collections" data-filter="status" aria-label="حالة التحصيل">${opt('','كل الذمم',f.status)}${Object.entries(statusLabels).map(([k,label])=>opt(k,label,f.status)).join('')}</select>`}${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small','data-scope="collections"')}</div>`;
    return `<div class="collect-workspace">${back}${heading(f.tab==='queue'?'التحصيل':titles[f.tab],'',exports)}${ages}${controls}<div id="collection-metrics"></div><section id="view-results" class="panel collection-results"></section></div>`;
  }
  function metricStrip(s){
    const f=u.collections;
    const keys=[['','إجمالي الذمم',s.total,'wallet','total',`${fmt(s.accounts)} حساب`],['overdue','متأخر',s.overdue,'clock','late',`${fmt(s.lateAccounts)} حساب`],['today','مستحق اليوم',s.today,'calendar','today','موعده اليوم'],['week','خلال 7 أيام',s.week,'calendar','week','بعد اليوم'],['later','بعد 7 أيام',s.later,'calendar','later','استحقاق لاحق'],['unscheduled','بلا موعد',s.unscheduled,'tag','unscheduled','غير مصنّف كمتأخر']];
    return `<div class="collect-metrics" aria-label="ملخص الذمم">${keys.map(([key,label,minor,ic,tone,sub])=>`<button type="button" class="collect-metric tone-${tone}" data-action="collection-filter" data-key="${key}" aria-pressed="${f.status===key}"><span class="collect-metric-label">${icon(ic,16)} ${html(label)}</span>${amount(minor)}<small>${html(sub)}</small></button>`).join('')}</div>`;
  }
  function agingStrip(s){
    return `<section class="panel collect-aging" aria-label="توزيع مبالغ المتأخرات"><div class="panel-head"><div><h2>توزيع المتأخرات</h2><p>إجمالي المتأخر: ${amount(s.overdue)} · لا يشمل الذمم بلا موعد</p></div>${stamp('report')}</div><div class="collect-bands">${C.bands.map(([key,label],i)=>{
      const fraction=s.overdue?s[key]/s.overdue:0;
      return `<div class="collect-band band-${i}" data-band="${key}"><div><strong>${html(label)}</strong>${amount(s[key])}</div><progress aria-label="${html(label)} من المتأخرات" max="1" value="${fraction}"></progress></div>`;
    }).join('')}</div></section>`;
  }
  function followText(r){
    if(!r.followup)return '';
    return `<small class="collect-follow-pill${C.followupDue(r,L.localDay())?' follow-due':''}">${icon('chat',12)} ${html(followLabels[r.followup.kind])}${r.followup.day?` · ${dayText(r.followup.day)}`:''}</small>`;
  }
  function queueRows(v){
    const {shown,pages}=getPage(v.rows);
    const head=`<div class="panel-head"><div><h2>أولوية المتابعة</h2><p>المتأخر أولًا، ثم الأقرب موعدًا. ${html(currencyLabel(codeInfo()))} · حتى ${dayText(v.day)}</p></div>${stamp('people')}</div>`;
    if(!v.rows.length)return head+emptyView('لا ذمم مطابقة','جرّب تغيير العملة أو البحث. الأرصدة الصفرية والأرصدة عليك لا تظهر في التحصيل.','wallet');
    return head+`<div class="collect-queue">${shown.map(r=>{
      const a=r.account;
      return `<article class="collect-row" data-collection-account="${html(a.id)}"><div class="collect-customer">${avatar(a)}<div><button class="row-button" type="button" data-action="open-account" data-id="${html(a.id)}" dir="auto">${html(a.name)}</button><span class="collect-category">${html(categoryName(a.category))}</span>${followText(r)}</div></div>
        <div class="collect-cell"><span>المتبقي</span>${amount(r.total)}</div><div class="collect-cell"><span>المتأخر</span>${amount(r.overdue,r.overdue?'is-late':'')}</div><div class="collect-cell collect-next"><span>أقرب موعد</span>${r.firstDue?dayText(r.firstDue):'<b>لم يُحدد</b>'}${r.oldestDays?`<small>${fmt(r.oldestDays)} يوم تأخر</small>`:''}</div>
        ${button('متابعة','collection-account','arrowLeft','btn-outline collect-plan',`data-id="${html(a.id)}" aria-label="${html('متابعة '+a.name)}"`)}</article>`;
    }).join('')}</div>${pager(v.rows.length,pages,'حساب')}`;
  }
  function agingRows(v){
    const {shown,pages}=getPage(v.rows);
    const head=`<div class="panel-head"><div><h2>المتأخر بحسب الحساب</h2><p>الأيام منذ الاستحقاق حتى ${dayText(v.day)}، شاملة اليوم الأخير من كل شريحة.</p></div></div>`;
    if(!v.rows.length)return head+emptyView('لا متأخرات مطابقة','المبالغ بلا موعد لا تظهر هنا. عيّن مواعيدها من قائمة التحصيل عند الاتفاق مع العميل.','report');
    return head+`<div class="scroll-table"><table class="data-table collect-aging-table"><thead><tr><th>الحساب</th>${C.bands.map(([,l])=>`<th>${html(l)}</th>`).join('')}<th>إجمالي المتأخر</th></tr></thead><tbody>${shown.map(r=>`<tr data-aging-account="${html(r.account.id)}"><td>${link(r.account.name,'collection-account','',`data-id="${html(r.account.id)}"`)}</td>${C.bands.map(([k])=>`<td>${amount(r[k])}</td>`).join('')}<td>${amount(r.overdue,'is-late')}</td></tr>`).join('')}</tbody></table></div>${pager(v.rows.length,pages,'حساب')}`;
  }
  function renderResults(){
    const f=u.collections,m=qs('#collection-metrics');
    if(f.tab==='receipts'){m.replaceChildren();return ReceiptBookUI.render(f);}
    if(f.tab==='activity'){
      m.replaceChildren();
      return `<div class="panel-head"><p class="subtle">آخر ${fmt(L.ACTIVITY_MAX)} تغيير محفوظ في هذا الدفتر.</p></div>`+ActivityUI.render(f);
    }
    try{
      const aging=f.tab==='aging',v=selection(u.code,aging);
      m.innerHTML=aging?agingStrip(C.summary(v.rows)):metricStrip(C.summary(v.scoped));
      return (aging?agingRows(v):queueRows(v))+`<div class="collect-method">${icon('info',16)}<p>${html(method)} ${v.day!==L.localDay()?'تُستخدم المواعيد المسجّلة حاليًا لتقييم التاريخ المختار.':''}</p></div>`;
    }catch(e){m.replaceChildren();return emptyView('تعذّر عرض التحصيل',e.message,'calendar');}
  }
  function effectiveDay(){return u.view==='collections'?asOf():L.localDay();}
  function plan(id,requested=1){
    const a=getAccount(id);if(!a)return;
    const day=effectiveDay(),c=codeInfo(),r=snapshot(c.code,day).index.get(id),f=a.followups?.[c.code];
    const items=r?.items||[],pages=Math.max(1,Math.ceil(items.length/8)),page=Math.max(1,Math.min(pages,Math.trunc(Number(requested))||1));
    const ref=`data-id="${html(id)}" data-key="${page}"`;
    const target=day===L.localDay();
    const header=`<div class="collect-plan-metrics"><div><span>المتبقي</span>${amount(r?.total||0)}</div><div><span>المتأخر</span>${amount(r?.overdue||0,r?.overdue?'is-late':'')}</div><div><span>بلا موعد</span>${amount(r?.unscheduled||0)}</div></div><div class="collect-follow-summary"><div><strong>آخر متابعة</strong>${f?`<p>${html(followLabels[f.kind])}${f.day?` · ${dayText(f.day)}`:''}</p>${f.note?`<small dir="auto">${html(f.note)}</small>`:''}`:'<p>لا متابعة مسجّلة لهذه العملة.</p>'}</div>${button(f?'تعديل المتابعة':'تسجيل متابعة','collection-followup','chat','btn-outline btn-small',ref)}</div>`;
    const list=items.length?`<div class="collect-lots"><h3>الحركات التي بقي منها مبلغ</h3>${items.slice((page-1)*8,page*8).map(x=>`<article class="collect-lot"><div><strong>${x.transfer?'طرف تحويل':'قيد'} · ${dayText(x.day)}${x.time?` <bdi>${html(x.time)}</bdi>`:''}</strong>${x.memo?`<small class="collect-lot-memo" dir="auto">${html(x.memo)}</small>`:''}<small>${x.due?`استحقاق ${dayText(x.due)} · ${html(C.fields[x.key])}`:'بلا موعد استحقاق'}</small></div><div class="collect-lot-value">${amount(x.open,x.lateDays?'is-late':'')}${x.original===x.open?'':`<small>من ${amount(x.original)}</small>`}</div><div class="collect-lot-actions">${button(x.due?'تعديل الموعد':'تحديد الموعد','collection-due','calendar','btn-outline btn-small',`data-id="${html(x.id)}" data-account="${html(id)}" data-key="${page}"`)}${target?button('قبض لهذا القيد','collection-receipt','wallet','btn-soft btn-small',`data-id="${html(x.id)}" data-account="${html(id)}"`):''}</div></article>`).join('')}${pages>1?`<div class="collect-lot-pager">${button('السابق','collection-account','arrowRight','btn-outline btn-small',`data-id="${html(id)}" data-key="${page-1}" ${page===1?'disabled':''}`)}<bdi>${fmt(page)} / ${fmt(pages)}</bdi>${button('التالي','collection-account','arrowLeft','btn-outline btn-small',`data-id="${html(id)}" data-key="${page+1}" ${page===pages?'disabled':''}`)}</div>`:''}</div>`:
      '<p class="subtle collect-plan-empty">لا مبالغ لك متبقية لهذا الحساب حتى التاريخ المعروض.</p>';
    modal('خطة التحصيل',`${a.name} · ${currencyLabel(c)} · حتى \u2066${day}\u2069`,header+list+`<p class="subtle collect-plan-empty">${target?'المواعيد والمتابعة لا تغيّر الرصيد.':'لتسجيل قبض، ارجع إلى عرض اليوم.'}</p>`,{
      footer:button('إغلاق','close-dialog','','btn-outline')+button('فتح الحساب','open-account','accounts','btn-outline',`data-id="${html(id)}"`)+(target&&r?.total?button('تسجيل قبض','collection-receipt','wallet','btn-primary',`data-account="${html(id)}"`):'')
    });
  }
  function dueForm(id,account,page){
    const e=data.entries.find(x=>x.id===id),l=e?.legs.find(x=>x.minor>0);if(!l)return;
    const a=getAccount(l.account),c=codeInfo(l.code),reset=()=>account?plan(account,page):entryInfo(id);
    const old=e.due||'';
    modal('تاريخ الاستحقاق',`${a.name} · ${currencyLabel(c)}`,`<p class="subtle">تاريخ القيد ${dayText(e.day)}، ومبلغه ${amount(l.minor)}. اختر الموعد المتفق عليه، أو اتركه فارغًا إن لم يُحدد.</p><div class="collect-modal-field">${field('due','الاستحقاق',old,`dir="ltr" min="${e.day}" max="9999-12-31"`,'date')}</div>${alertBox('هذا الموعد للتخطيط، ولا يغير مبلغ الحركة أو تاريخها أو أرشفتها.')}`,{
      footer:button('رجوع',account?'collection-account':'entry-info','arrowRight','btn-outline',account?`data-id="${html(account)}" data-key="${html(page)}"`:`data-id="${html(id)}"`)+submitBtn('حفظ الموعد'),
      onSubmit:async form=>{
        const due=FD(form).due;
        await mutate(next=>{if(L.setDueDate(next,id,due))ActivityUI.add(next,'due',a.name,`${c.code} · تاريخ القيد ${e.day} · ${old||'بلا موعد'} ← ${due||'بلا موعد'}`);});
        render();reset();toast(due?'حُفظ موعد الاستحقاق.':'أُلغي موعد الاستحقاق.');
      }
    });
  }
  function followupForm(id,page){
    const a=getAccount(id);if(!a)return;
    const c=codeInfo(),f=a.followups?.[c.code];
    const selected=f?.kind||'review';
    const picks=opt('','بدون متابعة',selected)+L.followupKinds.map(k=>opt(k,followLabels[k],selected)).join('');
    const opts=`data-id="${html(id)}" data-key="${html(page)}"`;
    modal('متابعة التحصيل',`${a.name} · ${currencyLabel(c)}`,`<div class="form-grid">${fieldSelect('kind','الحالة',picks)}${field('day','المتابعة في تاريخ',f?.day||'',dateAttr,'date')}${fieldMemo('note','ملاحظة المتابعة (محلية)',f?.note||'',260)}</div><p class="subtle collect-plan-empty">تظهر المواعيد هنا ضمن «متابعة مستحقة» عند حلولها. لا تُرسل رسالة أو إشعارًا ولا تغيّر موعد الاستحقاق.</p>`,{
      footer:button('رجوع','collection-account','arrowRight','btn-outline',opts)+submitBtn('حفظ المتابعة'),
      onSubmit:async form=>{
        const v=FD(form);
        const kind=v.kind;
        const rule=kind?{kind,day:v.day,note:v.note.trim(),at:Date.now()}:null;
        await mutate(next=>{
          if((!rule&&!f)||(rule&&f&&['kind','day','note'].every(k=>rule[k]===f[k])))return;
          L.setFollowup(next,id,c.code,rule);
          ActivityUI.add(next,'followup',a.name,`${c.code} · ${kind?followLabels[kind]+(v.day?' · المتابعة '+v.day:''):'أزيلت المتابعة'}`);
        });
        render();plan(id,page);toast(kind?'حُفظت المتابعة.':'أزيلت المتابعة.');
      }
    });
  }
  function exportReport(target,code){
    const aging=target==='collection-aging',v=selection(code,aging),s=C.summary(v.rows),f=u.collections,c=codeInfo(code);
    const heading=aging?'أعمار المتأخرات':'قائمة التحصيل',type=aging?'aging':'collection';
    const cols=aging?['الحساب',...C.bands.map(([,label])=>label),'المتأخر']:
      ['الحساب','إجمالي الذمم','متأخر','اليوم','لم يحن موعده','بلا موعد','أقرب موعد'];
    const rows=v.rows.map(r=>aging?[cellText(r.account.name),...C.bands.map(([key])=>cellMoney(r[key])),cellMoney(r.overdue)]:
      [cellText(r.account.name),cellMoney(r.total),cellMoney(r.overdue),cellMoney(r.today),cellMoney(r.week+r.later),cellMoney(r.unscheduled),r.firstDue?cellDay(r.firstDue):cellText('—')]);
    const fields=aging?[...C.bands.map(([key,label])=>[key,label,s[key]]),['ending','إجمالي المتأخر',s.overdue]]:
      [['overdue','متأخر',s.overdue],['today','مستحق اليوم',s.today],['week','خلال 7 أيام',s.week],['later','بعد 7 أيام',s.later],['unscheduled','بلا موعد',s.unscheduled],['ending','إجمالي الذمم المطابقة',s.total]];
    const filters=[f.category?`التصنيف: ${categoryName(f.category)}`:'',f.query.trim()?`البحث: ${f.query.trim()}`:'',!aging&&f.status?`الحسابات ذات الحالة: ${statusLabels[f.status]}`:''].filter(Boolean);
    const notes=[`العملة: ${currencyLabel(c)}`,`حتى ${v.day} · ${fmt(v.rows.length)} حساب`,...filters];
    return {title:'تقرير — '+heading,heading,type,currency:c,file:`qayd-report-${type}-${c.code}-${v.day}`,cols,rows,notes,
      summary:{fields,note:aging?'تعتمد الشرائح على الموعد المسجّل للجزء المتبقي. تُستبعد المبالغ بلا موعد والمواعيد غير المتأخرة.':method}};
  }
  return {blank,clearCache,renderPage,renderResults,tab,filter,plan,dueForm,followupForm,exportReport};
})();
