/* Read-only inspection. This path has no calls to persist, import, or restore. */
'use strict';
const BackupReview=(()=>{
  const picker=()=>qs('#verify-backup-file');
  function choose(){closeDialog();const input=picker();input.value='';input.click();}
  const close=()=>button('إغلاق','close-dialog','','btn-outline');
  const another=()=>button('فحص ملف آخر','verify-backup','file','btn-primary');
  function invalid(e){modal('تعذّر التحقق من النسخة','لم تتغير بيانات الدفتر.',alertBox(e.message||'تعذّرت قراءة الملف.',true),{footer:close()+another()});}
  function output(value,name,{encrypted=false,db=false}={}){
    const scoped=QaydCategoryBackup.is(value);
    const checked=scoped?QaydCategoryBackup.validate(value):L.validate(value);
    const sums=new Map();let images=0,receipts=0,first='',last='';
    for(const e of checked.entries){
      if(e.photo)images++;if(e.receipt)receipts++;
      if(!first||e.day<first)first=e.day;if(e.day>last)last=e.day;
      for(const row of e.legs){
        const total=sums.get(row.code)||{credit:0,debit:0};
        if(row.minor>0)total.credit+=row.minor;else total.debit-=row.minor;sums.set(row.code,total);
      }
    }
    const rows=checked.currencies.filter(c=>sums.has(c.code));
    const details=[['الحسابات',checked.accounts.length],['الحركات',checked.entries.length],['سندات القبض',receipts],['صور الحركات',images],['تعريفات العملات',checked.currencies.length]];
    const title=scoped?'نسخة تصنيف: '+checked.category.name:'نسخة دفتر قيد كاملة';
    const table=rows.length?`<section class="category-copy-totals"><h3>صافي القيود في الملف</h3><div class="category-copy-table"><table><thead><tr><th>العملة</th><th>القيود الموجبة</th><th>القيود السالبة</th><th>الصافي</th></tr></thead><tbody>${rows.map(c=>{const t=sums.get(c.code);return `<tr><td><bdi>${html(c.code)}</bdi></td><td><bdi>${html(money(t.credit))}</bdi></td><td><bdi>${html(money(t.debit))}</bdi></td><td><bdi>${html(money(t.credit-t.debit))}</bdi></td></tr>`;}).join('')}</tbody></table></div></section>`:'';
    modal('النسخة قابلة للقراءة',title,`<div class="restore-file">${stamp(encrypted?'lock':'file')}<div><strong dir="auto">${html(name)}</strong><p>${db?'حاوية SQLite':'ملف JSON'} · ${encrypted?'تم التحقق من فك التشفير':'غير مشفّرة'}${checked.demo?' · بيانات تجريبية':''}</p></div></div>
      ${alertBox('تم فحص البنية والقيود المحاسبية. لم تُسترجع أي بيانات.')}
      <div class="category-copy-metrics backup-review-counts">${details.map(([label,count])=>`<div><strong>${html(fmt(count))}</strong><span>${html(label)}</span></div>`).join('')}</div>
      ${first?`<p class="subtle backup-review-range">من <bdi>${html(first)}</bdi> إلى <bdi>${html(last)}</bdi></p>`:''}
      ${table}<p class="subtle backup-review-range">تأكد من أن الفترة والأعداد توافق النسخة التي تقصدها؛ نجاح الفحص لا يعني أنها الأحدث.</p>`,{footer:close()+another()});
  }
  function reviewText(text,name,db){
    let parsed;
    try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new Error('لم يُقرأ محتوى JSON بنجاح. اختر ملف نسخة قيد الأصلي.');}
    if(!Vault.is(parsed))return output(parsed,name,{db});
    Vault.inspect(parsed);
    modal('فحص نسخة مشفّرة','أدخل كلمة سر النسخة. لن تُستخدم لتغيير كلمة سر دفترِك.',field('password','كلمة سر النسخة','','required maxlength="128" autocomplete="off"','password'),{onSubmit:async form=>{
      const opened=await Vault.unlock(parsed,FD(form).password);
      if(form.isConnected&&dlg.open&&!security.locked)output(opened.value,name,{db,encrypted:true});
    },footer:cancelBtn()+submitBtn('فك التشفير والفحص')});
  }
  async function read(file){
    if(!file||security.locked)return;
    const name=backupName(file.name),utf8=new TextDecoder('utf-8',{fatal:true});
    modal('فحص النسخة دون استرجاع','تجري القراءة على الجهاز فقط.',`<div id="verify-status" class="task-status" aria-live="polite">${stamp('shield')}<p>جارٍ التحقق من الملف…</p></div>`,{footer:cancelBtn()});
    const status=qs('#verify-status',dlg),active=()=>dlg.open&&status?.isConnected&&!security.locked;
    try{
      if(!file.size||file.size>QaydDb.max)throw new Error('الملف فارغ أو أكبر من 48 ميغابايت.');
      const head=new Uint8Array(await file.slice(0,16).arrayBuffer());if(!active())return;
      const db=QaydDb.looksLike(head);
      if(!db&&file.size>MAX_BACKUP)throw new Error('ملف JSON يتجاوز 20 ميغابايت.');
      const bytes=new Uint8Array(await file.arrayBuffer());if(!active())return;
      if(!db){let text;try{text=utf8.decode(bytes);}catch{throw new Error('ترميز الملف غير صالح.');}return reviewText(text,name,false);}
      const task=QaydDb.read(bytes,{review:true});dbReading=task;
      let result;try{result=await task.promise;}finally{if(dbReading===task)dbReading=null;}
      if(!active())return;
      if(result.kind==='legacy')return modal('تم التعرف على ملف الدفتر القديم','لم يُنقل أي سجل.',alertBox('هذا ليس ملف نسخة قيد. استخدم مسار استيراد «دفتر الحسابات» لمراجعة الترحيل والأرصدة قبل اعتماده.',true),{footer:close()+another()});
      if(result.kind!=='qayd')throw new Error('لم نتعرف على حمولة نسخة قيد داخل قاعدة البيانات.');
      reviewText(result.text,name,true);
    }catch(e){if(!e.cancelled&&active())invalid(e);}
  }
  return {choose,read};
})();
