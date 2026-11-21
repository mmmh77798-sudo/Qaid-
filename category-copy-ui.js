/* Local workflows for saving and replacing one category. No full-ledger confirmation here. */
'use strict';
const CategoryCopyUI=(()=>{
  const label='نسخ واسترجاع تصنيف',copy='حفظ نسخة تصنيف',restore='استرجاع تصنيف فقط';
  function card(){
    return `<section class="panel settings-card category-copy-card"><div class="drive-title">${stamp('tag','mint')}<div><h2>${label}</h2><p>نسخة منفصلة للحسابات والحركات ضمن تصنيف واحد</p></div></div><p class="setting-desc">الاسترجاع يستبدل التصنيف المحدّد فقط. لا يستبدل الدفتر أو إعداداته، ويمكن اختيار تصنيف من نسخة قيد كاملة.</p><div class="button-set">${button(copy,'category-backup','download','btn-primary')}${button(restore,'category-restore','archive','btn-outline')}</div></section>`;
  }
  function transferCard(){
    if(data.demo)return '';
    return `<section class="panel settings-card category-copy-card"><div class="drive-title">${stamp('cloud','mint')}<div><h2>نقل تصنيف من الهاتف</h2><p>تجهيز محلي · تصنيف واحد فقط</p></div></div><p class="setting-desc">احفظ ملفًا مشفّرًا بلا صور. بعد ترقية الخادم إلى قيد 3.4، افتح موقع الدفتر المشترك بحساب المالك واختر «النقل والاستعادة». لا يُرسل شيء عند تجهيز الملف.</p>${button('تجهيز ملف نقل مشفّر','category-transfer-file','download','btn-primary')}</section>`;
  }
  function transferForm(){
    if(bootError||data.demo)throw new Error('افتح دفتر هاتف حقيقيًا وسليمًا لتجهيز ملف النقل.');
    const eligible=new Set(data.accounts.map(a=>a.category)),list=data.categories.filter(c=>eligible.has(c.id));
    if(!list.length)throw new Error('تحتاج إلى تصنيف يضم حسابًا على الأقل. الحسابات بلا تصنيف لا تُنقل من هنا.');
    const phrase=(name,label)=>field(name,label,'','required minlength="16" maxlength="128" autocomplete="new-password" dir="ltr"','password');
    modal('تجهيز ملف نقل مشفّر','من دفتر الهاتف · لا تُرسل أي بيانات الآن',
      fieldSelect('categoryCopyId','التصنيف المراد نقله',options(list,''),'required')+'<div id="category-copy-stats" aria-live="polite"></div>'+
      '<p class="subtle">يشمل حسابات التصنيف وحركاته وسنداته وإغلاقاته، دون الصور أو حسابات التصنيفات الأخرى. راجع بيانات الاتصال والملاحظات قبل اختيار تصنيف للمشاركة.</p>'+
      phrase('phrase','عبارة خاصة بهذا الملف (16 حرفًا على الأقل)')+phrase('again','أعد كتابة عبارة الملف')+
      alertBox('ستفتح الملف بعبارته من إعدادات موقع الدفتر المشترك. لا يغيّر حفظه دفتر الهاتف أو صلاحيات الموظفين.'),{
        focus:'[name="categoryCopyId"]',footer:cancelBtn()+submitBtn('حفظ ملف النقل'),
        onSubmit:async form=>{
          const f=FD(form);
          if(!list.some(c=>c.id===f.categoryCopyId))throw new Error('اختر تصنيفًا من القائمة.');
          if(f.phrase!==f.again||(f.phrase||'').trim().length<16||/[\u0000-\u001f\u007f]/.test(f.phrase))throw new Error('طابق العبارتين واستخدم عبارة خاصة من 16 إلى 128 حرفًا.');
          const now=new Date(),x=QaydCategoryBackup.create(data,f.categoryCopyId,{includePhotos:false,createdAt:+now});
          if(x.demo||!x.accounts.length)throw new Error('اختر تصنيفًا حقيقيًا يحتوي على حسابات.');
          if(new Blob([JSON.stringify(x)]).size>14*1024*1024)throw new Error('حجم التصنيف أكبر من حد النقل (14 ميغابايت قبل التشفير).');
          const value=JSON.stringify(await Vault.lock(x,await Vault.newKey(f.phrase))),time=L.localTime(now).replace(':','')+String(now.getSeconds()).padStart(2,'0');
          await writeBackupDocument(`qayd-transfer-${L.localDay(now)}-${time}.db`,value,'local',{onReady:closeDialog});
        }
      });
    updateStats();
  }
  function options(list,selected){
    return opt('','اختر تصنيفًا…',selected)+[...list].sort((a,b)=>a.name.localeCompare(b.name,'ar')).map(c=>opt(c.id,c.name,selected)).join('');
  }
  function backupForm(id=''){
    if(bootError)throw new Error('تعذّر قراءة الدفتر الحالي. لم تُنشأ أي نسخة.');
    if(!data.categories.length){
      modal(copy,'',alertBox('لا يوجد تصنيف لحفظه. أضف تصنيفًا أولًا.',true),{footer:button('إغلاق','close-dialog','','btn-outline')});return;
    }
    const picked=getCategory(id),encrypted=!!security.credentials;
    const choose=picked?`<div class="category-copy-picked">${stamp('tag',html(picked.color))}<bdi>${html(picked.name)}</bdi><input name="categoryCopyId" type="hidden" value="${html(picked.id)}"></div>`:fieldSelect('categoryCopyId','التصنيف',options(data.categories,''),'required');
    modal(copy,'ملف DB مستقل · لا يتضمن بقية التصنيفات.',`${choose}<div id="category-copy-stats" aria-live="polite"></div>
      <label class="check-field category-copy-check"><input type="checkbox" name="categoryPhotos" ${data.settings.backupPhotos?'checked':''}>تضمين صور حركات التصنيف عند توفرها</label>
      <p class="subtle category-copy-hint">يُحفظ طرف التحويل الخاص بالتصنيف وحده عند ارتباطه بتصنيف آخر، دون اسم الطرف الآخر أو مرفقاته.</p>
      ${alertBox(encrypted?'ستُشفّر النسخة بكلمة سر الدفتر.':'هذه النسخة غير مشفّرة. احفظها في مكان خاص.',!encrypted)}`,{
      onSubmit:async form=>{const f=FD(form);await save(f.categoryCopyId,{includePhotos:!!f.categoryPhotos});},footer:cancelBtn()+submitBtn('حفظ نسخة التصنيف'),focus:picked?'button[type="submit"]':'[name="categoryCopyId"]'
    });
    updateStats();
  }
  function updateStats(){
    const node=qs('#category-copy-stats',dlg),id=qs('[name="categoryCopyId"]',dlg)?.value;
    if(!node)return;
    if(!id){node.textContent='اختر تصنيفًا لعرض محتويات نسخته.';return;}
    const s=QaydCategoryBackup.stats(data,id);
    node.innerHTML=`<div class="category-copy-metrics"><div><strong>${fmt(s.accounts)}</strong><span>حساب</span></div><div><strong>${fmt(s.entries)}</strong><span>حركة</span></div><div><strong>${fmt(s.receipts)}</strong><span>سند قبض</span></div></div>`+
      (s.bridges?`<p class="subtle category-copy-hint">أطراف التحويل الخاصة بهذا التصنيف: ${fmt(s.bridges)}.</p>`:'')+
      (!s.accounts?'<p class="subtle category-copy-hint">التصنيف فارغ. تحفظ النسخة تعريفه فقط.</p>':'');
  }
  async function save(id,{includePhotos=data.settings.backupPhotos,beforeRestore=false}={}){
    if(bootError)throw new Error('تعذّر قراءة الدفتر الحالي، لذلك لم تُنشأ نسخة منه.');
    const when=new Date(),day=L.localDay(when),time=L.localTime(when).replace(':','')+String(when.getSeconds()).padStart(2,'0');
    const source=QaydCategoryBackup.create(data,id,{createdAt:+when,includePhotos});
    const value=JSON.stringify(await pack(source,security.credentials));
    const file=`qayd-category-${beforeRestore?'before-':''}${day}-${time}.db`;
    await writeBackupDocument(file,value,'local',{beforeRestore,onReady:()=>{if(!beforeRestore)closeDialog();}});
  }
  function conflict(error){
    const {bridges}=error;
    const details=bridges?`<div class="category-conflicts"><h3>${fmt(bridges.count)} تحويل متعارض</h3><ul>${bridges.examples.map(r=>`<li><bdi>${html(r.day)} · ${html(r.code)}</bdi><span>${html(r.reason)}</span></li>`).join('')}</ul><p>استخدم نسخة تطابق هذه التحويلات، أو راجعها في الدفتر قبل إعادة المحاولة.</p></div>`:'';
    modal('لم يُسترجع التصنيف','لم تتغير بيانات الدفتر.',alertBox(error.message||'تعذّر التحقق من النسخة.',true)+details,{
      footer:button('إغلاق','close-dialog','','btn-outline')+button('اختيار ملف آخر','category-restore','archive','btn-primary')
    });
  }
  function currencyPreview(rows){
    if(!rows.length)return '';
    return `<section class="category-copy-totals"><h3>صافي الرصيد حسب العملة</h3><div class="category-copy-table"><table><thead><tr><th>العملة</th><th>الآن</th><th>بعد الاسترجاع</th></tr></thead><tbody>${rows.map(r=>`<tr><td><bdi>${html(r.code)}</bdi></td><td><bdi>${html(money(r.before))}</bdi></td><td><bdi>${html(money(r.after))}</bdi></td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function review(raw,name,{encrypted=false,full=false,sourceDay=''}={}){
    const base=data;
    let p;
    try{
      if(bootError)throw new Error('تعذّر قراءة الدفتر الحالي؛ لا يمكن ضمان سلامة التصنيفات الأخرى. أصلح الدفتر أو استعد نسخة كاملة صالحة أولًا.');
      p=QaydCategoryBackup.plan(base,raw);
    }catch(e){conflict(e);return;}
    const {category,target,incoming,before,accountChanges,entryChanges,kept,standalone,localArchive,outsideAccounts,addedCurrencies,differingCurrencies}=p;
    const day=full?sourceDay:L.localDay(new Date(incoming.createdAt));
    const origin=full?'تصنيف مستخرج من نسخة قيد كاملة':'نسخة تصنيف من قيد';
    const subject=target?target.name:category.name;
    const targetText=target?`يُستبدل تصنيف «${target.name}» فقط.${category.name!==target.name?` سيصبح اسمه «${category.name}».`:''}`:`سيُضاف تصنيف «${category.name}» دون استبدال تصنيف آخر.`;
    const stats=`<div class="restore-diff"><section><h3>التصنيف الحالي</h3>${backupCounts(before)}</section><section class="restore-new"><h3>من النسخة</h3>${backupCounts(incoming)}</section></div>`;
    const impact=target&&p.changed?`<p class="category-copy-impact">المحذوف من التصنيف لعدم وجوده في النسخة: <bdi>${fmt(accountChanges.removed)}</bdi> حساب و<bdi>${fmt(entryChanges.removed)}</bdi> حركة. تُستبدل السجلات المختلفة بالنسخة.</p>`:'';
    const notes=[kept?`${fmt(kept)} تحويل مرتبط بتصنيف آخر سيبقى كما هو.`:'',standalone?`${fmt(standalone)} طرف تحويل سيُسترجع في هذا التصنيف دون إنشاء طرف آخر.`:'',
      localArchive?'تُحفظ قيود التصنيف المؤرشفة كإغلاقات لحساباته، دون تغيير الإغلاق السنوي للدفتر.':'',
      target&&target.id!==incoming.category.id?'طُوبق التصنيف الموجود بحسب اسمه.':'',
      addedCurrencies.length?'تعريفات عملات ستُضاف دون تعديل العملات الموجودة: '+addedCurrencies.map(c=>c.code).join('، ')+'.':'',
      differingCurrencies.length?'تُستخدم تعريفات العملات الموجودة لنفس الرموز؛ لا يجري تحويل المبالغ.':'',
      p.removedImages?`صور حركات ستُزال لأنها غير موجودة في النسخة: ${fmt(p.removedImages)}.`:'',
      p.changed&&before.images&&!data.settings.backupPhotos?'إعداد النسخ الحالي يستبعد الصور من نسخة التصنيف التي يمكنك حفظها أولًا.':'',
      encrypted&&!security.credentials?'كلمة سر الملف تفتح النسخة فقط؛ التشفير لا يُفعّل في الدفتر الحالي تلقائيًا.':''].filter(Boolean);
    modal('استرجاع تصنيف فقط',subject,`<div class="restore-file">${stamp(encrypted?'lock':'archive')}<div><strong dir="auto">${html(backupName(name))}</strong><p>${html(origin)}${L.validDay(day)?` · <bdi>${html(day)}</bdi>`:''}${encrypted?' · مشفّرة':''}</p></div></div>
      ${alertBox(`${targetText} تبقى الحسابات خارج التصنيف (${fmt(outsideAccounts)}) دون تغيير.`,!!target)}${stats}${impact}${currencyPreview(p.currencyTotals)}
      ${notes.length?`<ul class="category-copy-notes">${notes.map(s=>`<li>${html(s)}</li>`).join('')}</ul>`:''}
      ${!p.changed?alertBox('التصنيف الحالي مطابق للنسخة. لا حاجة لاستبداله.'):''}
      ${p.changed?`<label class="check-field category-copy-confirm"><input name="confirmCategory" type="checkbox" required><span>أوافق على ${target?'استبدال':'استرجاع'} هذا التصنيف فقط.</span></label>`:''}
      <p id="restore-copy-status" role="status" aria-live="polite"></p>`,{
      onSubmit:p.changed?async form=>{
        if(!FD(form).confirmCategory)throw new Error('أكّد استرجاع هذا التصنيف فقط.');
        if(data!==base)throw new Error('تغيّرت حالة الدفتر بعد المراجعة. افتح النسخة مجددًا قبل الحفظ.');
        // A failed write leaves the reviewed plan immutable and permits a safe retry.
        const next={...p.next,...(p.next.activity?{activity:[...p.next.activity]}:{})};
        ActivityUI.add(next,'category-restore',category.name,`${fmt(incoming.accounts.length)} حساب · ${fmt(incoming.entries.length)} حركة · استرجاع تصنيف واحد فقط.`);
        await persist(next);done(`استُرجع تصنيف «${category.name}» فقط.`);
      }:null,
      footer:p.changed?cancelBtn()+(target?button('نسخ التصنيف الحالي أولًا','category-backup-before','download','btn-outline',`data-id="${html(target.id)}"`):'')+submitBtn(restore,!!target):button('إغلاق','close-dialog','','btn-outline')
    });
  }
  function fromFull(incoming,name,encrypted){
    if(!incoming.categories.length){conflict(new Error('لا تحتوي النسخة الكاملة على تصنيفات يمكن اختيارها.'));return;}
    modal('اختيار تصنيف من النسخة','لن يُسترجع الدفتر الكامل من هذا المسار.',`<div class="restore-file">${stamp(encrypted?'lock':'archive')}<div><strong dir="auto">${html(backupName(name))}</strong><p>نسخة قيد كاملة</p></div></div>
      ${fieldSelect('sourceCategory','تصنيف من محتوى النسخة',options(incoming.categories,''),'required')}`,{
      onSubmit:form=>{
        // Restore every attachment actually in the chosen file; its stored preference
        // controls new exports only, not which attachments can be restored.
        const id=FD(form).sourceCategory;
        review(QaydCategoryBackup.create(incoming,id,{includePhotos:true}),name,{encrypted,full:true,sourceDay:incoming.lastBackup});
      },
      footer:cancelBtn()+submitBtn('مراجعة التصنيف'),focus:'[name="sourceCategory"]'
    });
  }
  return {card,backupForm,updateStats,save,review,fromFull,transferCard,transferForm};
})();
