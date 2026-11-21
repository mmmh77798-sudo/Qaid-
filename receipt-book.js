/* Numbered receipts link to real debit postings; no separate balance or payment transport. */
'use strict';
const ReceiptBookUI=(()=>{
  const methods=Object.freeze({cash:'نقدًا',bank:'تحويل بنكي',wallet:'محفظة إلكترونية',check:'شيك',other:'أخرى'});
  const methodLabel=method=>methods[method]||'—';
  const idOf=e=>L.receiptNumber(e.receipt.number);
  const mode=e=>e.receipt.target?'مخصّص لقيد':'توزيع على الأقدم';
  const dateAttr='dir="ltr" min="1000-01-01" max="9999-12-31"';
  const dateDom=d=>`<bdi>${html(d)}</bdi>`;
  const ltr=value=>'\u2066'+value+'\u2069';
  function inWords(minor,currency){
    const remainder=minor%L.SCALE;
    return `${L.numberWords(minor-remainder)} وحدة${remainder?' و'+L.numberWords(remainder*L.SCALE)+' جزءًا من ألف':''} (${currency})`;
  }
  const byAccount=(d,account,code,day,omitReceipt='')=>QaydCollections.snapshot(d,code,day,{accountId:account,omitReceipt}).index.get(account);
  const formRoom=new WeakMap(),registerCache=new WeakMap();
  const lotMemo=x=>x.memo.replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').replace(/\s+/g,' ').trim();
  const short=s=>s.length<=54?s:s.slice(0,53)+'…';
  function catalog(){
    let book=registerCache.get(data);if(book)return book;
    const names=new Map(data.accounts.map(a=>[a.id,a.name]));
    book={byCode:new Map(),byTarget:new Map()};
    for(const e of data.entries){
      const r=e.receipt;if(!r)continue;
      const l=e.legs[0],name=names.get(l.account)||'—';
      if(!book.byCode.has(l.code))book.byCode.set(l.code,[]);
      book.byCode.get(l.code).push({e,l,name,key:L.searchKey(name+' '+idOf(e))});
      if(r.target)book.byTarget.set(r.target,(book.byTarget.get(r.target)||0)+1);
    }
    for(const rows of book.byCode.values())rows.sort((a,b)=>b.e.day.localeCompare(a.e.day)||b.e.time.localeCompare(a.e.time)||b.e.receipt.number-a.e.receipt.number);
    registerCache.set(data,book);return book;
  }

  function formFields(e,a,code,target){
    const r=e?.receipt;
    const options=L.receiptMethods.map(key=>opt(key,methodLabel(key),r?.method||'cash')).join('');
    return `<fieldset class="voucher-fields full" id="voucher-fields" data-entry="${html(e?.id||'')}" data-account="${html(a.id)}" data-code="${html(code)}" data-preset="${html(r?.target||target||'')}"><legend>${r?'سند رقم '+html(idOf(e)):'بيانات سند القبض'}</legend><div class="form-grid">
      ${fieldSelect('receiptMethod','طريقة القبض',options,'required')}${field('receiptRef','مرجع الدفعة (اختياري)',r?.reference||'','maxlength="90" dir="auto" autocomplete="off" placeholder="مثال: رقم الحوالة" aria-describedby="voucher-ref-note"')}<p id="voucher-ref-note" class="subtle full">المرجع يظهر في ملف السند الفردي، ولا يظهر في تصدير السجل.</p>
      <div class="full">${fieldSelect('receiptTarget','تخصيص الدفعة',opt('','تلقائي — الأقدم أولًا',''),'dir="rtl"')}</div><p id="voucher-room" class="subtle full" role="status"></p></div></fieldset>`;
  }
  function updateChoices(){
    const meta=qs('#voucher-fields',dlg);if(!meta)return;
    const f=qs('#dialog-form',dlg),{receiptTarget:select,day}=f.elements;
    const {account,code,entry,preset}=meta.dataset;
    let v=formRoom.get(f);
    const selected=v?select.value:preset;
    if(!v||v.day!==day.value){
      const valid=L.validDay(day.value)&&day.value<=L.localDay();
      const r=valid?byAccount(data,account,code,day.value,entry):null,items=r?.items||[];
      const picks=items.slice(0,120),picked=selected&&items.find(x=>x.id===selected);
      if(picked&&!picks.some(x=>x.id===selected))picks.push(picked);
      select.innerHTML=opt('','تلقائي — الأقدم أولًا',selected)+picks.map(x=>{
        const memo=short(lotMemo(x)),label=`${x.transfer?'طرف تحويل':'قيد'} ${ltr([x.day,x.time].filter(Boolean).join(' '))} · ${ltr(money(x.open))} متبقٍ`;
        return opt(x.id,label+(memo?' · '+memo:''),selected);
      }).join('')+
        (selected&&!picked?opt(selected,'القيد المختار بلا متبقٍ في هذا التاريخ',selected):'');
      v={day:day.value,r,count:items.length};formRoom.set(f,v);
    }
    const picked=select.value&&v.r?.items.find(x=>x.id===select.value);
    const remaining=select.value?(picked?.open||0):(v.r?.total||0);
    qs('#voucher-room',meta).textContent=!L.validDay(day.value)||day.value>L.localDay()?'اختر تاريخ قبض صحيحًا لعرض المبالغ المتبقية.':`${select.value?'المتبقي من القيد':'الذمة المتبقية'} في تاريخ القبض: ${money(remaining)} ${codeInfo(code).name}.`+
      (v.count>120?' لاختيار قيد أبعد، افتحه من خطة التحصيل.':'');
  }
  function controls(f){
    const dates=key=>`<label class="collect-date">${key==='receiptFrom'?'من':'إلى'} <input class="input" type="date" aria-label="${key==='receiptFrom'?'القبض من تاريخ':'القبض إلى تاريخ'}" data-scope="collections" data-filter="${key}" value="${html(f[key])}" ${dateAttr}></label>`;
    const options=opt('','كل طرق القبض',f.paymentMethod)+L.receiptMethods.map(key=>opt(key,methodLabel(key),f.paymentMethod)).join('');
    const linked=f.receiptTarget?`<div class="voucher-filter-tag"><span>${icon('filter',14)} السندات المخصّصة للقيد المحدّد فقط</span>${button('إزالة الفلتر','voucher-clear-linked','','btn-soft btn-small')}</div>`:'';
    return `<div class="collect-filters panel voucher-filters">${search('collections','ابحث باسم الحساب أو رقم السند…',f.receiptQuery).replace('data-filter="query"','data-filter="receiptQuery"')}${currency()}<select class="control-select voucher-method-filter" aria-label="طريقة القبض" data-scope="collections" data-filter="paymentMethod">${options}</select>${dates('receiptFrom')}${dates('receiptTo')}${button('إعادة ضبط','reset-filter','undo','btn-soft btn-small','data-scope="collections"')}${linked}</div>`;
  }
  function selected(f,code){
    if((f.receiptFrom&&!L.validDay(f.receiptFrom))||(f.receiptTo&&!L.validDay(f.receiptTo))||(f.receiptFrom&&f.receiptTo&&f.receiptFrom>f.receiptTo))throw new Error('صحّح نطاق تواريخ القبض أولًا.');
    const query=L.searchKey(f.receiptQuery).replace(/^#\s*/,''),rows=[];
    let total=0;const buckets=Object.fromEntries(L.receiptMethods.map(k=>[k,0]));
    for(const row of catalog().byCode.get(code)||[]){
      const {e,l,key}=row,r=e.receipt;
      if((f.receiptFrom&&e.day<f.receiptFrom)||(f.receiptTo&&e.day>f.receiptTo)||(f.paymentMethod&&r.method!==f.paymentMethod)||(f.receiptTarget&&r.target!==f.receiptTarget)||(query&&!key.includes(query)))continue;
      rows.push(row);total-=l.minor;buckets[r.method]-=l.minor;
    }
    return {rows,total,buckets};
  }
  function renderRegister(f){
    let v;try{v=selected(f,u.code);}catch(e){return emptyView('تعذّر عرض السندات',e.message,'calendar');}
    const c=codeInfo(),{shown,pages}=getPage(v.rows);
    const head=`<div class="panel-head voucher-ledger-head"><div><h2>سندات القبض</h2><p>إجمالي السندات المطابقة فقط · ${html(currencyLabel(c))}</p></div><div class="voucher-ledger-total"><bdi>${html(money(v.total))}</bdi><small>${fmt(v.rows.length)} سند</small></div></div>`;
    if(!v.rows.length)return head+emptyView('لا سندات قبض مطابقة','افتح التحصيل ← متابعة ← تسجيل قبض لإصدار سند جديد. الحركات السالبة العادية لا تصبح سندات تلقائيًا.','wallet');
    const badges=`<div class="voucher-totals-by-method">${L.receiptMethods.filter(k=>v.buckets[k]).map(k=>`<span>${html(methodLabel(k))} <bdi>${html(money(v.buckets[k]))}</bdi></span>`).join('')}</div>`;
    return head+badges+`<div class="voucher-register">${shown.map(({e,l,name})=>`<article class="voucher-row" data-voucher="${html(idOf(e))}"><div><span class="voucher-no" dir="ltr">#${html(idOf(e))}</span><strong dir="auto">${html(name)}</strong><small>${dateDom(e.day)} · ${html(methodLabel(e.receipt.method))} · ${html(mode(e))}</small></div><bdi class="collect-amount">${html(money(-l.minor))}</bdi>${button('عرض السند','voucher-show','file','btn-outline',`data-id="${html(e.id)}"`)}</article>`).join('')}</div>${pager(v.rows.length,pages,'سند')}`;
  }
  function registerReport(code){
    const f=u.collections,c=codeInfo(code),v=selected(f,code);
    const range=(f.receiptFrom||f.receiptTo)?`الفترة: ${f.receiptFrom||'البداية'} إلى ${f.receiptTo||'بلا حد نهائي'}`:'الفترة: جميع التواريخ';
    const notes=[`العملة: ${currencyLabel(c)}`,`${range} · ${fmt(v.rows.length)} سند`,...(f.paymentMethod?['طريقة القبض: '+methodLabel(f.paymentMethod)]:[]),...(f.receiptQuery?['يقتصر التقرير على نتائج البحث المحدد.']:[]),...(f.receiptTarget?['المخصّص للقيد المختار فقط.']:[]),...(data.demo?['بيانات تجريبية']:[])];
    const fields=L.receiptMethods.filter(k=>v.buckets[k]).map(k=>[k,methodLabel(k),v.buckets[k]]);
    fields.push(['ending','إجمالي السندات المطابقة',v.total]);
    return {type:'receipt-register',title:'سجل سندات القبض',heading:'سجل سندات القبض',currency:c,file:`qayd-report-receipts-${c.code}-${L.localDay()}`,notes,
      cols:['رقم السند','التاريخ','الحساب','طريقة القبض','المقبوض','التخصيص'],rows:v.rows.map(({e,l,name})=>[cellDay('#'+idOf(e)),cellDay(e.day),cellText(name),cellText(methodLabel(e.receipt.method)),cellMoney(-l.minor),cellText(mode(e))]),
      summary:{fields,note:'يشمل فقط القيود الصادرة كسند قبض. لا تظهر مراجع الدفع الخاصة أو أرقام الهواتف في هذا التقرير.'}};
  }
  function voucherDocument(id){
    const e=data.entries.find(x=>x.id===id);
    if(!e?.receipt)throw new Error('لم يعد سند القبض موجودًا.');
    const l=e.legs[0],r=e.receipt,c=codeInfo(l.code),target=r.target&&data.entries.find(x=>x.id===r.target),n=idOf(e);
    const heading='سند قبض',title=`سند قبض ${ltr('#'+n)}`;
    return {type:'receipt',title,heading,currency:c,file:`qayd-report-receipt-${n}-${c.code}-${e.day}`,notes:[`العملة: ${currencyLabel(c)}`,`رقم السند: #${n} · ${data.demo?'بيانات تجريبية':'مستند داخلي'}`],
      cols:['البيان','التفاصيل'],rows:[[cellText('استُلم من'),cellText(accountName(l.account))],[cellText('تاريخ القبض'),cellDay(e.day+' '+e.time)],
        [cellText('طريقة القبض'),cellText(methodLabel(r.method))],...(r.reference?[[cellText('مرجع الدفعة'),cellText(r.reference)]]:[]),
        [cellText('التخصيص'),cellText(target?'مخصّص لقيد '+ltr(target.day+' '+target.time):'توزيع على الأقدم')],
        [cellText('المبلغ كتابة'),cellText(inWords(-l.minor,c.name))]],
      summary:{title:'قيمة السند',fields:[['ending','المبلغ المقبوض',-l.minor]],note:'نسخة من قيد القبض المسجّل في الدفتر. ليست فاتورة أو تأكيدًا مصرفيًا.'}};
  }
  function signatures(){return '<div class="voucher-signatures"><div>اسم وتوقيع المستلم</div><div>توقيع الدافع (اختياري)</div></div>';}
  function show(id){
    const e=data.entries.find(x=>x.id===id);if(!e?.receipt)return;
    const l=e.legs[0],c=codeInfo(l.code),r=e.receipt,closed=L.isLocked(data,id),a=getAccount(l.account),p=voucherDocument(id);
    const ref=`data-id="${html(id)}"`;
    const values=p.rows.slice(1).map(row=>`<div><dt>${html(row[0].v)}</dt><dd dir="auto">${printCellV(row[1])}</dd></div>`).join('');
    const local=(e.memo||e.photo)?`<details class="voucher-local"><summary>تفاصيل ومرفقات (محلية)</summary>${e.memo?`<p dir="auto">${html(e.memo)}</p>`:''}${e.photo?`<figure class="receipt-details"><img src="${html(e.photo)}" alt="صورة مرفقة بالحركة"></figure>`:''}</details>`:'';
    const extra=(r.target?button('فتح القيد المخصّص','entry-info','moves','btn-outline btn-small',`data-id="${html(r.target)}"`):'')+button('طباعة A4','print','print','btn-outline btn-small',`${ref} data-target="voucher"`)+
      (closed?'':button('تعديل السند','edit-entry','edit','btn-outline btn-small',ref)+button('حذف السند','delete-entry','trash','btn-outline btn-text-danger btn-small',ref))+
      (r.target?button('إلغاء التخصيص','voucher-unassign','undo','btn-outline btn-small',ref):'');
    modal('سند قبض',a.name,`<div class="voucher-banner"><div><span>رقم السند</span><bdi class="voucher-no">#${html(idOf(e))}</bdi></div><div><span>المبلغ المقبوض</span><strong><bdi>${html(money(-l.minor))}</bdi> <small>${html(c.name)}</small></strong></div></div><dl class="voucher-facts">${values}</dl>${data.demo?alertBox('سند تجريبي، لا يمثّل قبضًا حقيقيًا.',true):''}${local}${closed?alertBox('السند مؤرشف. يمكنك عرضه وطباعته دون تعديل مبلغ القيد أو تاريخه.'):''}<div class="voucher-tools">${extra}</div>`,{
      footer:button('إغلاق','close-dialog','','btn-outline')+button('مسودة إشعار','draft-recipients','mail','btn-outline',ref)+button('عرض PDF','view-pdf','file','btn-primary',`${ref} data-target="voucher"`)
    });
  }
  function unassign(id){
    const e=data.entries.find(x=>x.id===id);if(!e?.receipt?.target)return;
    confirmBox('إلغاء تخصيص السند',`يعود السند #${idOf(e)} إلى التوزيع على أقدم القيود. لا يتغير مبلغ المقبوض أو صافي الرصيد.`,async()=>{
      await mutate(n=>{if(L.clearReceiptTarget(n,id))ActivityUI.add(n,'entry-edit',accountName(e.legs[0].account),`السند #${idOf(e)} · أُلغي التخصيص وعاد إلى الأقدم.`);});
      render();show(id);toast('أُلغي تخصيص السند.');
    },'إلغاء التخصيص');
  }
  function linkedNotice(e){
    if(!data.receiptSerial)return '';
    const count=catalog().byTarget.get(e.id);
    return count?`<div class="voucher-link-notice">${alertBox(`هذا القيد مرتبط بـ ${fmt(count)} سند قبض مخصّص. ألغِ التخصيص قبل حذف القيد.`,false,
      link('عرض السندات المخصّصة','voucher-linked','arrowLeft',`data-id="${html(e.id)}"`))}</div>`:'';
  }
  function showLinked(id){
    const target=data.entries.find(e=>e.id===id),leg=target?.legs.find(l=>l.minor>0);
    if(!leg||!catalog().byTarget.get(id))return;
    u.code=leg.code;
    Object.assign(u.collections,{tab:'receipts',receiptTarget:id,receiptFrom:'',receiptTo:'',receiptQuery:'',paymentMethod:''});
    go('collections','',true);
  }
  return {methodLabel,formFields,updateChoices,controls,render:renderRegister,registerReport,voucherDocument,signatures,show,unassign,linkedNotice,showLinked};
})();
