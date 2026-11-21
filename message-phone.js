/* One explicit phone-number editor shared by movement and account drafts. */
'use strict';
const MessagePhoneUI=(()=>{
  let editor=null, pending=null, sequence=0;
  function reset(){editor=null;pending=null;}
  function number(a){try{return a?.phone?L.phoneNumber(a.phone,data.settings.notify.prefix):'';}catch{return '';}}
  function current(){return editor&&dlg.open&&editor.form.isConnected&&editor.form===qs('#dialog-form',dlg)?editor:null;}

  function open(id,resume){
    const a=getAccount(id);if(!a)return;
    const canPick=typeof native?.pickPhoneContact==='function';
    const canCreate=typeof native?.createPhoneContact==='function';
    const initial=number(a);
    const options=(canPick?button('اختيار من جهات الاتصال','contact-pick','people','btn-soft'):'')+
      (canCreate?button('إضافة جهة اتصال جديدة','contact-create','plus','btn-outline'):'');
    const prompt=initial?'يمكنك تغيير رقم المستلم المحفوظ لهذا الحساب.':'لا يوجد رقم صالح لهذا الحساب.';
    modal('رقم هاتف الحساب',a.name,`<div class="phone-editor">
      <p class="subtle">${html(prompt)} ${canPick?'اختر رقمًا من جهات الاتصال أو اكتبه هنا.':'اكتب رقم المستلم هنا.'}</p>
      ${options?`<div class="phone-picker-buttons">${options}</div>`:''}
      ${field('phone','رقم الهاتف',a.phone,'required maxlength="48" dir="ltr" autocomplete="tel" placeholder="+967…"','tel')}
      <p class="subtle">رمز الدولة للأرقام المحلية: <bdi>${html(data.settings.notify.prefix)}</bdi>.</p>
      <p class="phone-picker-status subtle" id="contact-status" role="status"></p></div>`,{
      focus:options?'':'[name="phone"]',
      footer:button('العودة للمسودة','contact-back','','btn-outline')+submitBtn('حفظ الرقم ومراجعة الرسالة'),
      onSubmit:async f=>{
        const normalized=L.phoneNumber(FD(f).phone,data.settings.notify.prefix);
        await mutate(next=>{
          const customer=next.accounts.find(x=>x.id===id);if(!customer)throw new Error('لم يعد الحساب موجودًا.');
          if(customer.phone!==normalized){customer.phone=normalized;ActivityUI.add(next,'account-edit',customer.name,'حُدِّث رقم المستلم دون عرضه في السجل.');}
        });
        render();resume();
      }
    });
    editor={form:qs('#dialog-form',dlg),id,resume};
  }

  function back(){const active=current();if(active){reset();active.resume();}}
  function status(active,msg){qs('#contact-status',active.form).textContent=msg;}
  function busy(active,value){for(const b of active.form.querySelectorAll('[data-action=contact-pick],[data-action=contact-create]'))b.disabled=value;}
  function launch(create){
    const active=current(),a=active&&getAccount(active.id);if(!a||pending)return;
    const ticket='contact'+(++sequence);
    pending={ticket,active};busy(active,true);
    status(active,create?'أضف الرقم في تطبيق جهات الاتصال. عند العودة اختر الرقم من القائمة.':'اختر رقمًا واحدًا في جهات الاتصال.');
    try{
      if(create)native.createPhoneContact(ticket,a.name);
      else native.pickPhoneContact(ticket);
    }catch{result(ticket,'unavailable','');}
  }
  function result(ticket,state,value){
    if(!pending||pending.ticket!==ticket)return;
    const {active}=pending;pending=null;
    if(security.locked||current()!==active)return;
    busy(active,false);
    if(state==='picked'&&typeof value==='string'&&value.length<=48){
      let normalized;
      try{normalized=L.phoneNumber(value,data.settings.notify.prefix);}catch{}
      if(normalized){
        active.form.elements.phone.value=normalized;
        status(active,'اخترت رقمًا. راجعه ثم احفظه للحساب؛ لم تُرسل رسالة.');return;
      }
    }
    const label=state==='returned'?'إذا حفظت جهة اتصال جديدة، اختر رقمها الآن من جهات الاتصال أو اكتبه هنا.':
      state==='cancelled'?'لم يُختر رقم. يمكنك المحاولة من جديد أو كتابة الرقم.':
      state==='busy'?'منتقي جهات الاتصال مفتوح بالفعل. يمكنك أيضًا كتابة الرقم.':
      state==='unavailable'?'لم يُفتح تطبيق جهات الاتصال. يمكنك كتابة الرقم هنا.':
      'تعذّر قراءة رقم صالح. اختر رقمًا آخر أو اكتبه هنا.';
    status(active,label);
  }
  window.qaydPhoneContactResult=result;
  return {open,number,back,launch,reset};
})();
