/* Append business changes to the same local, optionally encrypted ledger transaction. */
'use strict';
const ActivityUI=(()=>{
  const labels={
    'entry-add':'إضافة حركة','entry-edit':'تعديل حركة','entry-delete':'حذف حركة',
    'account-add':'إضافة حساب','account-edit':'تعديل حساب','account-delete':'حذف حساب',
    due:'موعد استحقاق',followup:'متابعة تحصيل','account-close':'إغلاق رصيد','account-open':'إلغاء إغلاق رصيد',
    'year-close':'إغلاق سنوي','year-open':'إلغاء إغلاق سنوي','category-restore':'استرجاع تصنيف'
  };
  const groups={'entry':'الحركات والتحويلات','account':'الحسابات','due':'مواعيد الاستحقاق','followup':'المتابعات','closure':'الإغلاقات','category':'نسخ التصنيفات'};
  const group=type=>type.includes('-close')||type.includes('-open')?'closure':type.split('-')[0];
  const add=(n,type,subject,detail)=>L.recordActivity(n,{type,subject,detail});
  function entry(n,type,before,after){
    if(before&&after&&['day','time','due','memo','photo'].every(k=>(before[k]||'')===(after[k]||''))&&
      JSON.stringify(before.legs)===JSON.stringify(after.legs)&&JSON.stringify(before.receipt)===JSON.stringify(after.receipt))return;
    const names=new Map(n.accounts.map(a=>[a.id,a.name]));
    const name=l=>names.get(l.account)||accountName(l.account);
    const records=[before,after].filter(Boolean);
    const subject=[...new Set(records.flatMap(e=>e.legs.map(name)))].join(' · ');
    const describe=e=>e.legs.map(l=>`${name(l)}: ${l.minor>0?'لي':'عليّ'} ${L.inputDecimal(Math.abs(l.minor))} ${l.code}`).join('؛ ')+
      ` · ${e.day} ${e.time||''}${e.due?' · الاستحقاق '+e.due:''}`+
      (e.receipt?` · سند #${L.receiptNumber(e.receipt.number)} · ${ReceiptBookUI.methodLabel(e.receipt.method)} · ${e.receipt.target?'تخصيص لقيد':'التوزيع على الأقدم'}`:'');
    const detail=before&&after?`قبل: ${describe(before)}\nبعد: ${describe(after)}`:describe(after||before);
    add(n,type,subject,detail);
  }
  function render(f){
    const key=L.searchKey(f.auditQuery);
    const rows=(data.activity||[]).filter(e=>(!f.auditType||group(e.type)===f.auditType)&&
      (!key||L.searchKey([e.subject,e.detail,labels[e.type]].join(' ')).includes(key))).reverse();
    const {shown,pages}=getPage(rows);
    const dateFmt=new Intl.DateTimeFormat(`ar-YE-u-ca-gregory-nu-${data.settings.digits==='arabic'?'arab':'latn'}`,{dateStyle:'short',timeStyle:'short'});
    return rows.length?`<ol class="audit-feed">${shown.map(e=>`<li data-event="${html(e.type)}"><span class="audit-marker">${icon(group(e.type)==='entry'?'moves':group(e.type)==='due'?'calendar':group(e.type)==='followup'?'chat':group(e.type)==='closure'?'archive':'accounts',17)}</span><div><div class="audit-line"><strong>${html(labels[e.type])}</strong><time datetime="${new Date(e.at).toISOString()}">${html(dateFmt.format(e.at))}</time></div><bdi class="audit-subject">${html(e.subject)}</bdi><p dir="auto">${html(e.detail)}</p></div></li>`).join('')}</ol>${pager(rows.length,pages,'تغيير')}`:
      emptyView('لا تغييرات مطابقة','يبدأ تسجيل التغييرات الجديدة عند استخدامها في قيد 1.9. لا يُنشأ تاريخ تخميني للحركات السابقة.','clock');
  }
  return {add,entry,groups,render};
})();
