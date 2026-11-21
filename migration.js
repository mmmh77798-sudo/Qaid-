/* Guided restoration of the observed SQLite layout. No storage writes here. */
function legacySample(row,withOther=false){
  return `<div class="legacy-sample"><div><strong dir="auto">${html(row.account)}</strong>${withOther?` <span class="legacy-other">←→</span> <strong dir="auto">${html(row.other)}</strong>`:''}</div><p><bdi>${html(money(row.amount))}</bdi> ${html(row.currency)}${row.dual?` · خانة <bdi>${row.side===1?'in':'out'}</bdi>`:''} · <bdi>${html(row.dateSource)}</bdi></p>${row.memo?`<small dir="auto">${html(row.memo.slice(0,160))}</small>`:''}</div>`;
}
function legacyDualExample(v){
  if(!v.dual)return '';
  const {id,day,inn,out,inMinor,outMinor}=v.dual;
  const cell=(n,sign=false)=>`<bdi class="num">${html(money(n,sign))}</bdi>`;
  const row=(col,stored,effect)=>`<tr><th scope="row"><bdi>${col}</bdi></th><td>${cell(stored)}</td><td>${cell(effect,true)}</td></tr>`;
  return `<details class="legacy-dual-example" open><summary>مثال: حركة <bdi>${html(id)}</bdi> · <bdi>${html(day)}</bdi></summary>
    <table aria-label="مبالغ الحركة وأثرها على الرصيد"><thead><tr><th scope="col">الخانة</th><th scope="col">في الملف</th><th scope="col">أثر القيد</th></tr></thead>
    <tbody>${row('in',inn,inMinor)}${row('out',out,outMinor)}</tbody></table>
    <p>أثر القيدين معًا: <strong>${cell(inMinor+outMinor,true)}</strong> ${html(v.currency)}</p></details>`;
}
function legacyAlert(draft,converted,verified){
  const s=draft.stats;
  const counts=[`${fmt(s.rows)} سجلًا في جدول الحركات النشطة`];
  if(draft.flagged)counts.push('قُرئ حقل الإشارة منفصلًا عن المبلغ، دون تحويل علامة الإشارة إلى قيد');
  if(converted.evidence.total)counts.push(`تطابق ${fmt(converted.evidence.matched)} من ${fmt(converted.evidence.total)} رصيدًا مع جدول المقارنة في الملف`);
  if(s.precise)counts.push(`${fmt(s.precise)} من المبالغ بثلاث منازل عشرية نُقلت دون تقريب`);
  if(s.unassigned)counts.push(`${fmt(s.unassigned)} من الحركات بلا حساب أصلي في حساب مستقل للمراجعة`);
  if(s.dual)counts.push(`${fmt(s.dual)} من الصفوف بمبلغين نُقلت إلى ${fmt(s.dual*2)} قيد للحسابات نفسها، دون إنشاء طرف تحويل لها`);
  if(converted.paired)counts.push(`${fmt(converted.paired)} تحويلًا جُمعت أطرافه المتطابقة`);
  if(converted.added)counts.push(`${fmt(converted.added)} قيدًا مقابلًا أُضيف وفق الخيار المختار`);
  if(s.negative)counts.push(`${fmt(s.negative)} من المبالغ السالبة نُقلت بإشارتها الأصلية`);
  if(s.zero)counts.push(`${fmt(s.zero)} سجلًا بلا مبلغ لم يُنقل`);
  if(s.missingTime)counts.push(`${fmt(s.missingTime)} حركة دون وقت مقروء تظهر عند 00:00`);
  if(s.accountsRenamed+s.categoriesRenamed)counts.push(`${fmt(s.accountsRenamed+s.categoriesRenamed)} اسمًا مكررًا أو فارغًا مُيّز دون دمج`);
  if(s.textShort)counts.push(`${fmt(s.textShort)} نصًا طويلًا اختُصر لحدود قيد`);
  if(s.uncategorized)counts.push(`${fmt(s.uncategorized)} حسابًا بتصنيف مفقود`);
  if(s.currencyAssumed)counts.push(`${fmt(s.currencyAssumed)} حركة نُسبت إلى العملة الوحيدة في النسخة`);
  if(converted.uncertain)counts.push(`${fmt(converted.uncertain)} سجلًا بلا طرف مطابق نُقل دون توليد قيد إضافي`);
  return `<section class="legacy-summary">${verified?`<p class="legacy-verified">طابق الرصيد المُدخل لحساب <strong dir="auto">${html(verified.account)}</strong> · ${html(verified.currency)}.</p>`:''}<ul>${counts.map(msg=>`<li>${html(msg)}</li>`).join('')}</ul><p class="subtle">ينقل الأسماء وأرقام الهواتف والتصنيفات والعملات والحركات النشطة بتواريخها وملاحظاتها. لا يستورد الصور أو السجلات المحذوفة أو الجداول المكررة أو الإعدادات والتذكيرات.</p></section>`;
}
function legacyFinish(draft,converted,name,verified=null){
  confirmRestore(converted.checked,null,name,{origin:'نسخة ‎DB‎ من دفتر الحسابات',extra:legacyAlert(draft,converted,verified)});
}
function openLegacyImport(source,name){
  const draft=QaydLegacy.prepare(source);
  const show=d=>d.rows.length?legacyMapping(d,name):legacyFinish(d,QaydLegacy.convert(d),name);
  if(!draft.formatChoice){show(draft);return;}
  const ex=draft.formatChoice;
  modal('طريقة قراءة المبالغ','لم تكفِ بيانات الملف وحدها لإثبات معنى العمودين.',`
    <p>قيم عمود <bdi>in</bdi> هي <bdi>+1</bdi> أو <bdi>-1</bdi> فقط. قارن هذه العينة بكشف تطبيقك السابق قبل الاختيار.</p>
    <div class="legacy-sample"><p><bdi>in</bdi>: <bdi>${html(fmt(ex.flag))}</bdi> · <bdi>out</bdi>: <bdi>${html(money(ex.magnitude))}</bdi></p></div>
    ${fieldSelect('layout','كيف سُجّل المبلغ؟',opt('','اختر توافقًا مع الكشف','')+opt('flags','حركة واحدة: in للإشارة وout للمبلغ')+opt('columns','مبلغان مستقلان في العمودين'),'required')}`,
    {onSubmit:form=>show(QaydLegacy.prepare(source,{layout:FD(form).layout})),footer:cancelBtn()+submitBtn('متابعة')});
}
function legacyMapping(draft,name,prev={}){
  const s=draft.stats, ex=draft.sideExample, d=draft.dateExample, transfer=draft.transferExample;
  const dayHint=draft.flagged&&(s.dayFirst&&!s.monthFirst?'dm':s.monthFirst&&!s.dayFirst?'md':'');
  const choices={dayOrder:dayHint||'',transferMode:draft.verifiedFlags&&transfer?'complete':'',...prev};
  const sel=(n,label,placeholder,items)=>fieldSelect(n,label,opt('',placeholder,choices[n]||'')+items.map(([v,l])=>opt(v,l,choices[n])).join(''),'required');
  modal('استيراد نسخة دفتر الحسابات','١ من ٢ · راجع خيارات النقل قبل حساب الأرصدة.',`
    <p class="legacy-counts">${html(fmt(draft.ledger.accounts.length))} حساب · ${html(fmt(s.rows))} سجل حركة · ${html(fmt(draft.ledger.currencies.length))} عملة</p>
    <div class="legacy-fields">
      ${draft.flagged?`<section><h3>إشارة المبلغ</h3><p>في هذه القراءة <bdi>in</bdi> هو الإشارة و<bdi>out</bdi> هو المبلغ. لا يُحسب <bdi>±1</bdi> كقيد مستقل.${draft.verifiedFlags?' تدعم أرصدة الملف هذه القراءة.':''}</p>${legacySample(draft.signExample)}</section>`:ex?`<section><h3>اتجاه المبالغ الموجبة</h3><p>ابحث عن هذا المبلغ في كشف الحساب السابق واختر جهته. هذا الاختيار لا يغيّر إشارة أي مبلغ سالب.</p>${legacySample(ex)}
      ${sel('movement','كيف يظهر هذا المبلغ في الكشف القديم؟','اختر «لي» أو «عليّ»',[['credit','لي'],['debit','عليّ']])}</section>`:
      `<section><h3>المبالغ السالبة</h3><p>لا توجد مبالغ موجبة تحتاج إلى تحديد الاتجاه. تُنقل المبالغ السالبة كما هي.</p>${legacySample(draft.negativeExample)}</section>`}
      ${s.dual?`<section><h3>صفوف فيها مبلغان</h3><p>في ${fmt(s.dual)} من الصفوف مبلغ في كلٍّ من <bdi>in</bdi> و<bdi>out</bdi>. سيظهر كل مبلغ في قيد مستقل للحساب نفسه؛ راجع أثر القيدين في الخطوة التالية.</p></section>`:''}
      ${s.unassigned?`<section><h3>حركات بلا حساب</h3><p>بعض الحركات لا تحمل مرجعًا لحساب أصلي. سيُنقل عددها (${html(fmt(s.unassigned))}) إلى حساب «حركات بلا حساب (للمراجعة)» دون نسبها لأي شخص.</p><p>مثال: الحركة <bdi>${html(draft.reviewExample.id)}</bdi>.</p></section>`:''}
      ${d?`<section><h3>ترتيب التاريخ</h3><p>للتاريخ <bdi>${html(d.dateSource)}</bdi> قراءتان. قارن مع التطبيق السابق.${dayHint?' الخيار المقترح مبني على التواريخ غير الملتبسة في الملف.':''}</p>${legacySample(d)}${sel('dayOrder','التاريخ الصحيح لهذا المثال','اختر طريقة قراءة التاريخ',[['dm',d.dm+' — اليوم أولًا'],['md',d.md+' — الشهر أولًا']])}</section>`:''}
      ${transfer?`<section><h3>طرف التحويل الآخر</h3><p>${draft.flagged?'الرصيد وعدد الحركات في الملف يدعمان قيدًا مقابلًا لهذا التحويل. قارن مع كشف الطرف الآخر للتأكيد.':'افتح كشف الطرف الآخر في التطبيق السابق. لا يُضاف قيد مقابل لمبلغ سالب في الملف، أو لسجل بمبلغين، أو لتحويل ملتبس.'}</p>${legacySample(transfer,true)}
      ${sel('transferMode','احتساب الطرف الآخر','اختر ما يظهر في كشفه',[['complete',draft.flagged?'احتسب الطرف المطابق في الأرصدة (مقترح)':'أكمل القيود المقابلة الواضحة فقط'],['posted','انقل الصفوف المسجّلة فقط']])}</section>`:''}
    </div>`,{
    onSubmit:form=>{
      const f=FD(form),expected=f.movement==='credit'?1:f.movement==='debit'?-1:0;
      if((ex&&!expected)||(d&&!f.dayOrder)||(transfer&&!f.transferMode))throw new Error('أكمل خيارات المراجعة قبل المتابعة.');
      const checked=QaydLegacy.convert(draft,{inSign:ex?ex.side*expected:1,dates:f.dayOrder||'dm',transfers:f.transferMode||'posted'});
      legacyCheck(draft,checked,name,f);
    },footer:cancelBtn()+submitBtn('مراجعة الأرصدة')});
}
function legacyCheck(draft,converted,name,choices){
  const comparisons=converted.comparisons.filter(c=>!c.review), dual=comparisons.some(c=>c.dual), affected=comparisons.some(a=>a.affected);
  // A split row must be checked against an affected account and currency, even if
  // its balance is zero or an unrelated account needs optional transfer review.
  const candidates=(dual?comparisons.filter(c=>c.dual):affected?comparisons.filter(c=>c.affected):comparisons.some(c=>c.minor)?comparisons.filter(c=>c.minor):comparisons).slice(0,600);
  const byKey=new Map(candidates.map(c=>[c.key,c]));
  if(!candidates.length){
    if(draft.stats.unassigned)throw new Error('لا يوجد رصيد لحساب أصلي يمكن مطابقته. احتفظ بالملف؛ لم تُستبدل البيانات.');
    legacyFinish(draft,converted,name);return;
  }
  const tip=dual?'اختر حسابًا فيه سجل بمبلغين، وقارن رصيده في العملة نفسها كما كان وقت النسخة.'+(converted.added?' راجع كذلك أرصدة الحسابات المتأثرة بإكمال التحويلات.':''):
    affected?'اختر حسابًا من الحسابات المتأثرة بطريقة نقل التحويل. قارن رصيده في العملة نفسها.':'قارن رصيد الحساب بالعملة نفسها كما كان وقت النسخة. لا تستخدم كشفًا مفلترًا بفترة مختلفة.';
  modal('مطابقة رصيد قبل الاسترجاع','٢ من ٢ · أدخل رصيدًا من التطبيق السابق للتأكد من النقل.',`
    ${alertBox(tip)}
    ${converted.evidence.total?`<p class="legacy-counts">مطابقة الأرصدة المحسوبة مع جدول النسخة: ${html(fmt(converted.evidence.matched))} من ${html(fmt(converted.evidence.total))}.</p>`:''}
    <div class="legacy-fields"><section>${fieldSelect('account','الحساب والعملة',candidates.map(c=>opt(c.key,c.account+' · '+c.currency,candidates[0].key)).join(''),'required')}
    <div id="legacy-proposed" class="legacy-sample" aria-live="polite"></div>
    ${dual?'<div id="legacy-dual-example"></div>':''}
    <div class="form-grid">${field('expected','مبلغ الرصيد في التطبيق السابق','','required inputmode="text" maxlength="27" dir="ltr"')}${fieldSelect('flow','جهة الرصيد',opt('','اختر الجهة','')+opt('credit','لي')+opt('debit','عليّ')+opt('zero','صفر'))}</div>
    <p>يمكنك كتابة الرصيد السالب بعلامة الناقص؛ عندها اترك الجهة فارغة أو اختر «عليّ». قارن بقية الأرصدة بعد النقل واحتفظ بالنسخة الأصلية.</p></section></div>`,{
    onSubmit:form=>{
      const f=FD(form), selected=byKey.get(f.account), amount=QaydLegacy.amount(f.expected);
      let signed;
      if(amount<0&&(!f.flow||f.flow==='debit'))signed=amount;
      else if(amount>0&&f.flow==='credit')signed=amount;
      else if(amount>0&&f.flow==='debit')signed=-amount;
      else if(amount===0&&f.flow==='zero')signed=0;
      if(!selected||selected.minor!==signed)throw new Error('الرصيد غير مطابق. تأكد من المبلغ وجهة الرصيد والحساب والعملة في النسخة نفسها. لم تتغير البيانات.');
      legacyFinish(draft,converted,name,selected);
    },footer:cancelBtn()+`<button type="button" class="btn btn-outline" id="legacy-back">تعديل الاختيارات</button>`+submitBtn('متابعة إلى معاينة الاسترجاع')});
  const input=qs('[name=account]',dlg), proposed=qs('#legacy-proposed',dlg), sample=qs('#legacy-dual-example',dlg), expected=qs('[name=expected]',dlg), flow=qs('[name=flow]',dlg);
  const repaint=()=>{
    const v=byKey.get(input.value);if(!v)return;
    proposed.innerHTML=`<p>الرصيد المحسوب من الملف</p><strong><bdi>${html(money(v.minor))}</bdi> ${html(v.currency)} ${status(v.minor)}</strong>`;
    if(sample)sample.innerHTML=legacyDualExample(v);
    expected.value='';expected.readOnly=false;flow.value='';
  };
  input.addEventListener('change',repaint);repaint();
  flow.addEventListener('change',()=>{expected.readOnly=flow.value==='zero';if(expected.readOnly)expected.value='0';else if(expected.value==='0')expected.value='';});
  qs('#legacy-back',dlg).addEventListener('click',()=>{if(!saving&&!formBusy)legacyMapping(draft,name,choices);});
}
