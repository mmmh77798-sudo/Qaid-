/* Right-to-left receipt layout and local 1-bit rasterisation for ESC/POS printers. */
'use strict';
const ReceiptUI=(()=>{
  const ROWS_BT=100, ROWS_SYSTEM=500, MAX_DOTS=7040;
  const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f\u202a-\u202e]/g,' ').replace(/\s+/g,' ').trim();
  const moneyLtr=value=>money(value).replace(/[\u061c\u200e\u200f]/g,'');
  function sheet(target,full,limit){
    const p=exportData(target,u.code,true);
    if(full&&p.rows.length>limit)throw new Error('الكشف طويل على الورق الحراري. اختر الملخص أو حدّد فترة أقصر.');
    const numeric=c=>['money','num','day'].includes(c.kind);
    const cell=c=>c.kind==='money'?moneyLtr(c.v):c.kind==='num'?fmt(c.v):c.v;
    const rows=full?p.rows.map(r=>({head:cell(r[0]),ltr:numeric(r[0]),pairs:r.slice(1).map((c,i)=>[p.cols[i+1],cell(c),numeric(c)])})):[];
    const s=data.settings.print;
    return {title:p.title,business:s.profile?data.settings.business:'',notes:p.notes,count:p.rows.length,full,rows,currency:currencyLabel(p.currency),summary:QaydTotals.fields(p.summary).map(([key,name,value])=>[key,name,moneyLtr(value)]),summaryNote:p.summary.note,footer:s.footer,date:s.date?L.localDay():''};
  }
  function receiptHTML(p){
    const row=(name,value,ltr)=>`<div class="thermal-kv"><span>${html(name)}</span><bdi ${ltr?'dir="ltr"':'dir="auto"'}>${html(value)}</bdi></div>`;
    return `<article class="thermal-receipt" dir="rtl">${p.business?`<p class="thermal-brand">${html(p.business)}</p>`:''}<h1>${html(p.title)}</h1>
      <div class="thermal-meta">${p.notes.map(note=>`<p>${html(note)}</p>`).join('')}<p>عدد السجلات: <bdi>${html(fmt(p.count))}</bdi></p></div>
      ${p.full&&!p.rows.length?'<p>لا حركات مطابقة.</p>':''}
      ${p.rows.map(r=>`<section class="thermal-record"><strong><bdi dir="${r.ltr?'ltr':'auto'}">${html(r.head)}</bdi></strong>${r.pairs.map(v=>row(...v)).join('')}</section>`).join('')}
      <section class="thermal-end"><h2>ملخص نهاية التقرير</h2><p>العملة: ${html(p.currency)}</p>${p.summary.map(([key,label,value])=>`<div class="thermal-total-${key}">${row(label,value,true)}</div>`).join('')}${p.summaryNote?`<p class="small">${html(p.summaryNote)}</p>`:''}</section>
      ${p.footer?`<p class="small">${html(p.footer)}</p>`:''}${p.date?`<p class="small">تاريخ الطباعة: <bdi>${html(p.date)}</bdi></p>`:''}</article>`;
  }
  async function raster(p,width){
    const margin=14,W=width-margin*2;
    const probe=document.createElement('canvas'),ctx=probe.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('تعذّر تهيئة الطباعة الحرارية.');
    if(document.fonts)try{await Promise.all([400,600].map(w=>document.fonts.load(`${w} 24px "IBM Plex Sans Arabic"`,'العملة وملخص الحساب 123.456')));}catch{}
    const ops=[];let y=18;
    const font=(size,bold)=>`${bold?'600':'400'} ${size}px "IBM Plex Sans Arabic",Tahoma,Arial,sans-serif`;
    function words(input,size,bold,max){
      ctx.font=font(size,bold);
      const out=[];let line='';
      for(const word of clean(input).split(' ').filter(Boolean)){
        const attempt=line?line+' '+word:word;
        if(ctx.measureText(attempt).width<=max){line=attempt;continue;}
        if(line){out.push(line);line='';}
        if(ctx.measureText(word).width<=max){line=word;continue;}
        for(const ch of word){if(line&&ctx.measureText(line+ch).width>max){out.push(line);line='';}line+=ch;}
      }
      if(line)out.push(line);
      return out;
    }
    function draw(text,size,bold,ltr,x,baseline,align){ops.push({text,size,bold,ltr,x,baseline,align});}
    function block(value,{size=22,bold=false,ltr=false,center=false}={}){
      for(const line of words(value,size,bold,W)){
        y+=Math.ceil(size*1.32);draw(line,size,bold,ltr,center?width/2:width-margin,y,center?'center':'right');
      }
    }
    function rule(thick=2){y+=12;ops.push({rule:y,thick});y+=10+thick;}
    function pair(label,value,ltr,strong=false){
      const size=strong?23:21;
      ctx.font=font(size,strong);
      if(ctx.measureText(clean(label)).width+ctx.measureText(clean(value)).width+25<=W){
        y+=Math.ceil(size*1.36);draw(clean(label),size,strong,false,width-margin,y,'right');draw(clean(value),size,strong,ltr,margin,y,'left');
      }else{block(label,{size:20,bold:true});block(value,{size,bold:strong,ltr});}
    }
    if(p.business)block(p.business,{size:23,bold:true,center:true});
    block(p.title,{size:29,bold:true,center:true});
    rule(3);
    for(const note of p.notes)block(note,{size:21});
    block('عدد السجلات: '+fmt(p.count),{size:21});
    if(p.full&&!p.rows.length)block('لا حركات مطابقة.');
    for(const row of p.rows){
      rule();block(row.head,{size:23,bold:true,ltr:row.ltr});
      for(const v of row.pairs)pair(...v);
      if(y+365>MAX_DOTS)throw new Error('الإيصال أطول من حد طباعة بلوتوث. اختر الملخص أو ضيّق الفترة.');
    }
    rule(3);block('ملخص نهاية التقرير',{size:27,bold:true});block('العملة: '+p.currency,{size:22});
    for(const [key,label,value] of p.summary)pair(label,value,true,key==='net'||key==='ending');
    if(p.summaryNote){y+=6;block(p.summaryNote,{size:19});}
    if(p.footer){rule();block(p.footer,{size:20});}
    if(p.date)block('تاريخ الطباعة: '+p.date,{size:19});
    const height=y+30;
    if(height>MAX_DOTS)throw new Error('الإيصال أطول من حد طباعة بلوتوث. استخدم طباعة النظام أو حدّد فترة أقصر.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const c=canvas.getContext('2d',{alpha:false,willReadFrequently:true});if(!c)throw new Error('تعذّر تهيئة صورة الإيصال.');
    c.fillStyle='#fff';c.fillRect(0,0,width,height);c.fillStyle='#000';c.textBaseline='alphabetic';
    for(const op of ops){
      if(op.rule){c.fillRect(margin,op.rule,W,op.thick);continue;}
      c.font=font(op.size,op.bold);c.direction=op.ltr?'ltr':'rtl';c.textAlign=op.align;c.fillText(op.text,op.x,op.baseline);
    }
    const pixels=c.getImageData(0,0,width,height).data,stride=width>>3,packed=new Uint8Array(stride*height);
    // Black is set in ESC/POS raster order: leftmost pixel is the byte's MSB.
    for(let row=0;row<height;row++)for(let x=0;x<width;x++){
      const off=(row*width+x)*4;
      if(pixels[off]+pixels[off+1]+pixels[off+2]<510)packed[row*stride+(x>>3)]|=128>>(x&7);
    }
    canvas.width=canvas.height=0;
    return {width,height,packed};
  }
  function form(target='statement'){
    if(!['statement','report'].includes(target))return;
    const p=exportData(target,u.code,true),bluetooth=!!native?.printThermal;
    const sizes=opt('58','58 مم · عرض 384 نقطة','58')+opt('80','80 مم · عرض 576 نقطة','58')+opt('80-512','80 مم · عرض 512 نقطة','58');
    const formats=opt('summary','إيصال مختصر (الملخص)','summary')+opt('rows','كشف الحركات المطابقة','summary');
    modal('طباعة حرارية',p.title+' · '+currencyLabel(p.currency),
      `<div id="thermal-options" data-target="${target}" class="form-grid">${fieldSelect('paper','عرض الورق',sizes)}${fieldSelect('format','المحتوى',formats)}</div>
       <div style="margin-top:12px">${alertBox(bluetooth?'بلوتوث: اقترن بالطابعة من إعدادات الهاتف أولًا. يدعم قيد طابعات ESC/POS المقترنة التي تستخدم Bluetooth Classic (SPP). للطابعة ذات خدمة أندرويد استخدم طباعة النظام.':'طباعة بلوتوث المباشرة في تطبيق أندرويد. في المعاينة يمكنك اختيار طباعة النظام بالحجم الحراري.')}</div><p id="thermal-status" class="subtle" role="status"></p>`,
      {footer:cancelBtn()+button('طباعة النظام','thermal-system','print')+(bluetooth?submitBtn('طباعة بلوتوث'):''),onSubmit:async f=>{
        if(!bluetooth)return;
        const v=FD(f),dots=v.paper==='80'?576:v.paper==='80-512'?512:384;
        const status=qs('#thermal-status',dlg);status.textContent='جارٍ تجهيز الإيصال…';
        try{
          const document=sheet(target,v.format==='rows',ROWS_BT),image=await raster(document,dots);
          const encoded=QaydAccountFeatures.base64(image.packed);
          closeDialog();native.printThermal(image.width,image.height,encoded);
        }finally{status.textContent='';}
      }});
  }
  function system(){
    const target=qs('#thermal-options',dlg)?.dataset.target,form=qs('#dialog-form',dlg);
    if(!form||!['statement','report'].includes(target))return;
    const v=FD(form),mm=v.paper.startsWith('80')?80:58;
    const p=sheet(target,v.format==='rows',ROWS_SYSTEM);
    return paintPrint(p.title,receiptHTML(p),{receipt:mm});
  }
  return {form,system};
})();
