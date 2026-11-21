/* The account's short messages, advanced filters and per-currency ceilings. */
'use strict';
const AccountUI=(()=>{
  const F=QaydAccountFeatures;
  const attr=(a,ch,kind='balance')=>`data-id="${html(a.id)}" data-channel="${ch}" data-key="${kind}"`;
  function validChannel(channel){return ['sms','wa','both'].includes(channel)?channel:'wa';}
  function balanceMessage(id,requested,key='balance',edited){
    const a=getAccount(id);if(!a||a.id!==u.account)return;
    const channel=validChannel(requested),confirmation=key==='confirmation';
    const c=codeInfo(),day=L.validDay(u.statement.to)?u.statement.to:L.localDay();
    // Text is a snapshot of the actual balance, not the subtotal of rows visible after search.
    const m=L.statement(data,a.id,c.code,{to:day,archive:true}).ending;
    const n=data.settings.notify;
    const short=edited??F.shortMessage({day,minor:m,currency:c.name,amount:money(m),credit:n.credit,debit:n.debit,confirmation});
    const channelName=channel==='sms'?'رسالة نصية (SMS)':channel==='both'?'رسالة نصية وواتساب':confirmation?'مصادقة على الحساب · واتساب':'رسالة واتساب';
    const phone=MessagePhoneUI.number(a);
    const change=attr(a,channel,confirmation?'confirmation':'balance');
    const actions=button('نسخ','copy-draft','copy','btn-outline')+
      (['sms','both'].includes(channel)?button('فتح SMS','compose-message','mail','btn-outline msg-sms',`data-channel="sms" ${phone?'':'disabled'}`):'')+
      (['wa','both'].includes(channel)?button(n.business?'فتح واتساب للأعمال':'فتح واتساب','compose-message','chat','btn-primary msg-wa',`data-channel="wa" ${phone?'':'disabled'}`):'');
    modal(channelName,confirmation?'طلب تأكيد قصير، وليس إرسال كشف الحركات.':'راجع الرقم والنص قبل الإرسال.',
      `<div class="short-recipient"><div><span>المستلم</span><strong dir="auto">${html(a.name)}</strong>${phone?`<bdi class="short-phone">${html(phone)}</bdi>`:'<small>لم يُضبط رقم صالح</small>'}</div>${button(phone?'تعديل الرقم':'إضافة رقم','message-phone','edit','btn-outline btn-small',change)}</div>
        <div class="short-balance-context"><span>${html(currencyLabel(c))}</span><span>حتى <bdi>${html(day)}</bdi></span></div>
        <label class="field">نص الرسالة<textarea id="draft-message" class="input" rows="3" maxlength="480" dir="auto">${html(short)}</textarea></label>
        <input type="hidden" id="draft-phone" value="${html(phone)}"><p class="short-meta"><span id="draft-chars">${html(fmt([...short].length))} حرفًا</span><span>الرصيد الكامل حتى التاريخ، دون فلاتر البحث.</span></p>
        ${data.demo?alertBox('هذه بيانات تجريبية. النسخ متاح، وفتح تطبيقات الإرسال معطّل.',true):''}
        <p class="subtle short-send-note">${channel==='both'?'افتح SMS وواتساب من المسودة نفسها. تؤكّد الإرسال داخل كل تطبيق.':'تُفتح المسودة فقط؛ اضغط إرسال داخل التطبيق الذي تختاره.'}</p>`,
      {footer:button('إغلاق','close-dialog','','btn-outline')+actions});
  }
  function phoneForm(id,channel,key){
    const a=getAccount(id);if(!a||a.id!==u.account)return;
    const edited=qs('#draft-message',dlg)?.value;
    return MessagePhoneUI.open(id,()=>balanceMessage(id,channel,key,edited));
  }
  function draftInput(input){const n=qs('#draft-chars',dlg);if(n)n.textContent=fmt([...input.value].length)+' حرفًا';}

  function filterNotes(f){
    return [...(f.kind?[`النوع: ${F.kinds[f.kind]}`]:[]),...(f.min!==null||f.max!==null?[`المبلغ دون إشارة: ${f.min!==null?'من '+money(f.min):''}${f.min!==null&&f.max!==null?' ':''}${f.max!==null?'إلى '+money(f.max):''}`]:[])];
  }
  function bound(s){const t=s.trim();return !t?null:/^0+(?:[.٫]0{1,3})?$/.test(L.digits(t))?0:L.parseAmount(t);}
  function searchForm(){
    const a=currentAccount();if(!a)return;
    const f=u.statement;
    const amounts=(name,label,value)=>field(name,label,value===null?'':L.inputDecimal(value),'dir="ltr" inputmode="decimal" maxlength="24" placeholder="اختياري"');
    const dateAttr='dir="ltr" min="1000-01-01" max="9999-12-31"';
    const list=opt('','كل أنواع الحركات',f.kind)+Object.entries(F.kinds).map(([k,v])=>opt(k,v,f.kind)).join('');
    modal('بحث متقدم في الكشف',a.name+' · '+codeInfo().name,`<div class="form-grid"><div class="full">${field('query','كلمة من التفاصيل، تاريخ أو مبلغ',f.query,'maxlength="160" autocomplete="off"')}</div>${field('from','من تاريخ',f.from,dateAttr,'date')}${field('to','إلى تاريخ',f.to,dateAttr,'date')}${fieldSelect('kind','نوع الحركة',list)}${amounts('min','المبلغ من (دون إشارة)',f.min)}${amounts('max','المبلغ إلى (دون إشارة)',f.max)}<label class="check-field full"><input type="checkbox" name="archive" ${f.archive?'checked':''}>إظهار الحركات المؤرشفة</label></div>`,{
      footer:cancelBtn()+button('مسح الفلاتر','reset-filter','undo','btn-outline','data-scope="statement" data-close="1"')+submitBtn('عرض النتائج'),
      onSubmit:form=>{
        const v=FD(form),min=bound(v.min),max=bound(v.max);
        if(wrongRange(v))throw new Error('تاريخ البداية يجب أن يسبق تاريخ النهاية أو يساويه.');
        if(min!==null&&max!==null&&min>max)throw new Error('المبلغ الأدنى أكبر من المبلغ الأعلى.');
        u.statement={query:v.query.trim(),from:v.from,to:v.to,kind:Object.hasOwn(F.kinds,v.kind)?v.kind:'',min,max,archive:!!v.archive};
        u.rowsPage=1;closeDialog();render();
      }
    });
  }
  function filterBadge(f){
    const notes=filterNotes(f);
    return notes.length?`<div class="statement-filter-strip">${icon('filter',14)}${notes.map(note=>`<span>${html(note)}</span>`).join('')}</div>`:'';
  }

  function limitCard(a,c,balance){
    const x=L.limitStatus(a,c.code,balance);if(!x)return '';
    const pct=Math.min(100,Math.round(x.used/x.rule.minor*100));
    const msg=x.exceeded?'تم تجاوز السقف':x.reached?'تم بلوغ السقف':'ضمن السقف';
    const diff=x.exceeded?'زيادة عن السقف':'متاح قبل السقف';
    return `<section class="account-limit-card${x.reached?' at-limit':''}" aria-label="سقف الحساب" data-limit-state="${x.exceeded?'exceeded':x.reached?'reached':'below'}"><div class="account-limit-head"><div>${icon('shield',17)} <strong>سقف الحساب</strong> <span>${html(F.directions[x.rule.direction])} · ${html(c.name)}</span></div>${button('تعديل','account-limit','edit','btn-outline btn-small',`data-id="${html(a.id)}"`)}</div><progress aria-label="نسبة السقف المستخدمة" max="100" value="${pct}"></progress><div class="account-limit-figures"><b>${html(msg)}</b><span>المستخدم: ${amt(x.used,false,false)} / ${amt(x.rule.minor,false,false)}</span><span>${html(diff)}: ${amt(Math.abs(x.difference),false,false)}</span></div></section>`;
  }
  function limitForm(id){
    const a=getAccount(id);if(!a||a.id!==u.account)return;
    const c=codeInfo(),rule=a.limits?.[c.code];
    const codes=data.currencies.map(x=>opt(x.code,currencyLabel(x)+(a.limits?.[x.code]?' · له سقف':''),c.code)).join('');
    const dirs=Object.entries(F.directions).map(([key,label])=>opt(key,label,rule?.direction||'credit')).join('');
    modal('سقف الحساب',a.name,`<div class="form-grid">${fieldSelect('code','العملة',codes,'id="account-limit-code"')}${fieldSelect('direction','يُطبَّق على',dirs)}${field('limit','السقف',rule?L.inputDecimal(rule.minor):'','inputmode="decimal" maxlength="23" dir="ltr" placeholder="بدون سقف"')}</div>
      <div style="margin-top:10px">${alertBox('سقف مستقل لكل عملة. يظهر تنبيه عند بلوغه أو تجاوزه ولا يمنع تسجيل الحركات. اترك المبلغ فارغًا لإلغاء السقف لهذه العملة.')}</div>`,
      {footer:cancelBtn()+submitBtn('حفظ السقف'),onSubmit:async form=>{
        const v=FD(form),amount=v.limit.trim(),f=amount?{minor:L.parseAmount(amount),direction:v.direction}:null;
        await mutate(next=>L.setAccountLimit(next,a.id,v.code,f));u.code=v.code;done(f?'حُفظ سقف الحساب.':'أُلغي سقف هذه العملة.');
      }});
  }
  function changeLimitCode(code){
    const a=currentAccount(),form=qs('#dialog-form',dlg);if(!a||!form?.elements.limit)return;
    const r=a.limits?.[code];form.elements.limit.value=r?L.inputDecimal(r.minor):'';form.elements.direction.value=r?.direction||'credit';
  }
  function warnings(next,previous=[],preview=false){
    const pairs=new Map(), balances=new Map();
    const add=(l,m)=>{
      const a=getAccount(l.account);if(!a?.limits?.[l.code])return;
      const key=l.account+':'+l.code;let x=pairs.get(key);
      if(!x){x={a,code:l.code,delta:0};pairs.set(key,x);}
      x.delta+=m;
    };
    for(const l of previous)add(l,preview?-l.minor:0);
    for(const l of next)add(l,preview?l.minor:0);
    const notes=[];
    for(const {a,code,delta} of pairs.values()){
      if(!balances.has(code))balances.set(code,L.balances(data,code));
      const balance=balances.get(code).get(a.id).minor+delta,x=L.limitStatus(a,code,balance);
      if(x?.reached)notes.push(`${a.name} · ${codeInfo(code).name}: ${preview?(x.exceeded?'سيتجاوز السقف':'سيبلغ السقف'):(x.exceeded?'تجاوز السقف':'بلغ السقف')} (${money(x.used)} / ${money(x.rule.minor)}).`);
    }
    return notes;
  }
  function entryLimitPreview(){
    const box=qs('#entry-limit-preview',dlg),form=qs('#dialog-form',dlg);if(!box||!form)return;
    const els=form.elements;
    const code=els.code?.value;
    const old=box.dataset.entry?data.entries.find(e=>e.id===box.dataset.entry)?.legs||[]:[];
    let amount=0;try{amount=L.parseAmount(els.amount.value);}catch{box.hidden=true;box.replaceChildren();return;}
    const single=els.accountName?matchEntryAccount(els.accountName.value):null;
    const legs=els.from?(els.from.value&&els.to.value&&els.from.value!==els.to.value?[{account:els.from.value,code,minor:-amount},{account:els.to.value,code,minor:amount}]:[]):
      single?[{account:single.id,code,minor:els.kind.value==='debit'?-amount:amount}]:[];
    const notes=legs.length?warnings(legs,old,true):[];
    box.hidden=!notes.length;box.innerHTML=notes.map(n=>alertBox(n,true)).join('');
  }
  function reminderForm(id){
    const a=getAccount(id);if(!a)return;
    modal('تذكير الحساب',a.name,field('reminder','التاريخ · نحو 09:00',a.reminder,'dir="ltr" min="1000-01-01" max="9999-12-31"','date')+
      '<p class="subtle short-send-note">اترك التاريخ فارغًا لإلغاء التذكير. تأكّد من تفعيل التنبيهات وإذن أندرويد.</p>',{
      footer:cancelBtn()+submitBtn('حفظ التذكير'),onSubmit:async form=>{
        const day=FD(form).reminder;if(day&&!L.validDay(day))throw new Error('اختر تاريخًا صحيحًا.');
        await mutate(next=>{next.accounts.find(x=>x.id===id).reminder=day;});done(day?'حُفظ التذكير.':'أُلغي التذكير.');
      }});
  }
  return {balanceMessage,phoneForm,draftInput,searchForm,filterNotes,filterBadge,limitCard,limitForm,changeLimitCode,warnings,entryLimitPreview,reminderForm};
})();
