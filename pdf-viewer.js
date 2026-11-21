/* Local, modal PDF reader for documents made by قيد. No PDF URL or remote viewer. */
'use strict';
const QaydPdfViewer=(()=>{
  const dlgPdf=document.querySelector('#pdf-dialog');
  const assetLoads=new Map();
  const MAX_ZOOM=4, PADDING=12, GAP=12, MAX_PX=1900000;
  let state=null,scrollFrame=0,feedbackTimer=0;
  const at=id=>dlgPdf.querySelector('#pdf-'+id);
  const ctl=(id,label,ic,{primary=false,text='',extra=''}={})=>`<button type="button" id="pdf-${id}" data-pdf-action="${id}" class="pdf-btn${primary?' pdf-primary':''}" title="${html(label)}" aria-label="${html(label)}" ${extra}>${ic?icon(ic,17):''}${text?`<span>${html(text)}</span>`:''}</button>`;
  function assets(){
    const files=['runtime.js','worker-source.js','writer.js','fonts.js'];
    return Promise.all(files.map(file=>{
      if(!assetLoads.has(file))assetLoads.set(file,new Promise((ok,bad)=>{
        const script=document.createElement('script');script.src=new URL('pdf/'+file,document.baseURI).href;
        script.onload=()=>ok();script.onerror=()=>{script.remove();assetLoads.delete(file);bad(new Error('تعذّر تحميل مكوّن PDF المحلي. حاول مرة أخرى.'));};document.head.append(script);
      }));
      return assetLoads.get(file);
    }));
  }
  function mount(title){
    dlgPdf.innerHTML=`<div class="pdf-shell">
      <header class="pdf-header">${ctl('close','العودة من عارض PDF','close')}<div class="pdf-heading"><p>قيد <span> / </span> عارض المستندات</p><h2 id="pdf-title" dir="auto">${html(title)}</h2></div><span class="pdf-format" dir="ltr">PDF <i></i></span></header>
      <div class="pdf-toolbar" role="toolbar" aria-label="أدوات المستند">
        <div class="pdf-file-actions">${ctl('save','حفظ ملف PDF','download',{primary:true,text:'حفظ PDF',extra:'disabled'})}${ctl('share','مشاركة ملف PDF','share',{extra:'disabled'})}${ctl('print','طباعة التقرير','print')}</div>
        <div class="pdf-zoom-actions" role="group" aria-label="التقريب" dir="ltr">${ctl('minus','تصغير الصفحة','minus',{extra:'disabled'})}${ctl('fit','ملاءمة عرض الصفحة','',{text:'100%',extra:'disabled'})}${ctl('plus','تكبير الصفحة','plus',{extra:'disabled'})}</div>
      </div>
      <div class="pdf-currencies" id="pdf-currencies">
        <div class="pdf-currency-line"><label class="pdf-currency-field" for="pdf-currency">${icon('coins',17)}<span class="sr-only">عملة المستند</span><select id="pdf-currency" aria-label="عملة المستند"></select></label>
          <div class="pdf-currency-nav" id="pdf-currency-nav" role="group" aria-label="التنقل بين العملات" dir="ltr">${ctl('prev','العملة السابقة','arrowLeft')}<bdi id="pdf-currency-count" class="pdf-counter"></bdi>${ctl('next','العملة التالية','arrowRight')}</div></div>
        <p id="pdf-hint" class="pdf-hint"></p>
      </div>
      <div class="pdf-work">
        <div id="pdf-viewport" class="pdf-viewport" dir="ltr" tabindex="0" role="region" aria-label="صفحات المستند">
          <div id="pdf-stack" class="pdf-stack"></div>
        </div>
        <div id="pdf-status" class="pdf-status" role="status"><span class="pdf-status-stamp">${icon('file',26)}</span><strong id="pdf-status-text">جارٍ إعداد المستند…</strong>${ctl('retry','إعادة المحاولة','undo',{text:'إعادة المحاولة',extra:'hidden'})}</div>
      </div>
      <p id="pdf-message" class="pdf-message" role="status" hidden></p>
      <footer class="pdf-footer"><span id="pdf-page-counter" aria-live="off">—</span><div>${ctl('top','الانتقال إلى أول صفحة','up',{extra:'disabled'})}${ctl('summary','الانتقال إلى ملخص نهاية التقرير','report',{text:'ملخص التقرير',extra:'disabled'})}</div></footer>
    </div>`;
  }
  function close(){
    const current=state;
    if(!current)return;
    state=null;
    release(current.doc);
    cancelAnimationFrame(scrollFrame);scrollFrame=0;clearTimeout(feedbackTimer);
    if(dlgPdf.open)dlgPdf.close();
    dlgPdf.replaceChildren();
    document.body.classList.remove('pdf-open');
    if(current.returnFocus?.isConnected)current.returnFocus.focus({preventScroll:true});
    else if(!security.locked)qs(`[data-action="view-pdf"][data-target="${current.target}"]`)?.focus({preventScroll:true});
  }
  function feedback(message,error=false){
    if(!state)return;
    const el=at('message');clearTimeout(feedbackTimer);
    el.textContent=message;el.dataset.error=String(error);el.hidden=false;
    feedbackTimer=setTimeout(()=>{el.hidden=true;},error?6000:2800);
    queuePages();
  }
  function open(target,id=''){
    if(!['report','statement','collection','collection-aging','receipt-register','voucher'].includes(target))return;
    const first=exportData(target,u.code,true,id);
    const codes=target==='statement'?[first.currency,...statementCodes(first.currency.code,true).filter(c=>c.code!==first.currency.code)]:[first.currency];
    const returnFocus=document.activeElement;
    close();if(target!=='voucher')closeDialog();mount(first.title);
    state={target,id,codes,index:0,zoom:1,doc:null,gesture:null,returnFocus};
    if(target==='voucher'){
      at('summary').querySelector('span').textContent='قيمة السند';at('summary').setAttribute('aria-label','الانتقال إلى قيمة السند');at('summary').title='الانتقال إلى قيمة السند';
      at('print').setAttribute('aria-label','طباعة السند');at('print').title='طباعة السند';
    }
    const select=at('currency');select.innerHTML=codes.map(c=>opt(c.code,currencyLabel(c),first.currency.code)).join('');select.disabled=codes.length===1;
    at('currency-nav').hidden=codes.length<2;
    const viewport=at('viewport');
    viewport.addEventListener('scroll',queuePages,{passive:true});
    viewport.addEventListener('touchstart',touchStart,{passive:true});
    viewport.addEventListener('touchmove',touchMove,{passive:false});
    viewport.addEventListener('touchend',touchEnd,{passive:true});
    viewport.addEventListener('touchcancel',clearTouch,{passive:true});
    select.addEventListener('change',()=>{if(state)void selectCurrency(state.codes.findIndex(c=>c.code===select.value));});
    document.body.classList.add('pdf-open');dlgPdf.showModal();at('close').focus({preventScroll:true});
    void selectCurrency(0,first);
  }
  const active=d=>Boolean(state&&state.doc===d&&!d.dead);
  function evict(r,keepVisible=false){
    r.cancelled=true;if(r.task)r.task.cancel();
    if(r.canvas&&(!keepVisible||r.canvas.parentElement!==r.el)){r.canvas.width=r.canvas.height=0;r.canvas.remove();}
    if(!keepVisible&&r.el){r.el.replaceChildren();r.el.removeAttribute('aria-busy');delete r.el.dataset.rendered;}
  }
  function release(d){
    if(!d||d.dead)return;
    d.dead=true;d.sheet=null;d.pdf=null;
    for(const r of d.rendered.values())evict(r);d.rendered.clear();
    clearTimeout(d.timeout);
    d.abort?.();
    const stop=()=>{d.worker?.destroy();d.port?.terminate();if(d.url)URL.revokeObjectURL(d.url);d.url=null;};
    if(d.loading){const timeout=setTimeout(stop,1000);void d.loading.destroy().catch(()=>{}).finally(()=>{clearTimeout(timeout);stop();});}
    else stop();
  }
  function setStatus(message='',retry=false){
    at('status').hidden=!message;at('status-text').textContent=message;at('retry').hidden=!retry;
    at('status').classList.toggle('failed',retry);
  }
  function controls(){
    if(!state)return;
    const {doc,zoom,index,codes}=state;
    at('viewport').classList.toggle('zoomed',zoom>1.003);
    at('fit').firstElementChild.textContent=`${Math.round(zoom*100)}%`;
    for(const k of ['save','share'])at(k).disabled=!doc?.sheet;
    for(const k of ['top','summary','fit'])at(k).disabled=!doc?.pdf;
    at('minus').disabled=!doc?.pdf||zoom<=1.003;at('plus').disabled=!doc?.pdf||zoom>=MAX_ZOOM-.003;
    const before=codes[index-1],after=codes[index+1];
    for(const [key,c,base] of [['prev',before,'العملة السابقة'],['next',after,'العملة التالية']]) {
      const b=at(key);b.disabled=!c;b.title=c?`${base}: ${c.name}`:base;b.setAttribute('aria-label',b.title);
    }
    at('currency-count').textContent=`${fmt(index+1)} / ${fmt(codes.length)}`;
    at('hint').textContent=codes.length<2?'مرّر لقراءة الصفحات، واستخدم + أو إصبعين للتكبير.':zoom>1.003?'استخدم زري العملات أثناء التكبير.':'اسحب يمينًا للعملة التالية، ويسارًا للسابقة.';
  }
  async function selectCurrency(index,given){
    if(!state||!state.codes[index])return;
    const prev=state.doc?state.index:null;
    release(state.doc);
    const d={dead:false,sheet:null,pdf:null,rendered:new Map(),width:0,height:0};
    state.doc=d;state.zoom=1;state.index=index;state.gesture=null;
    const currency=state.codes[index];
    at('currency').value=currency.code;
    at('stack').replaceChildren();at('stack').style.width='';at('viewport').scrollTo(0,0);
    at('page-counter').textContent='—';controls();setStatus('جارٍ إعداد المستند…');
    try {
      await assets();if(!active(d))return;
      const p=given||exportData(state.target,currency.code,true,state.id);
      const s=data.settings;
      d.filename=p.file+'.pdf';
      const sheet=await QaydPdfLayout.build(p,{
        formatMoney:money,formatNumber:fmt,label:currencyLabel,
        profile:s.print.profile?{...s.profile,business:s.business}:null,
        printDate:s.print.date?D(L.localDay(),{day:'numeric',month:'long',year:'numeric'}):'',footer:s.print.footer
      },{cancelled:()=>!active(d),progress:(i,n)=>{if(n>=480&&i)setStatus(`جارٍ تجهيز ${fmt(i)} من ${fmt(n)} سجل…`);}});
      if(!active(d)||!sheet)return;
      d.sheet=sheet;controls();setStatus('جارٍ فتح صفحات PDF…');
      const {getDocument,PDFWorker}=globalThis.QaydPdfRuntime;
      d.url=URL.createObjectURL(new Blob([QaydPdfWorkerSource],{type:'text/javascript'}));
      d.port=new Worker(d.url);
      d.worker=PDFWorker.fromPort({port:d.port});
      d.loading=getDocument({data:sheet.bytes.slice(),worker:d.worker,isEvalSupported:false,useSystemFonts:false,useWorkerFetch:false,stopAtErrors:true});
      const err=new Promise((_,reject)=>{
        d.abort=()=>reject(new Error('cancelled'));
        d.port.addEventListener('error',()=>reject(new Error('تعذّر تشغيل عارض PDF على هذا الجهاز. حدّث Android System WebView ثم حاول مجددًا.')),{once:true});
        d.timeout=setTimeout(()=>reject(new Error('تأخر فتح PDF. حاول مرة أخرى أو احفظ الملف.')),16000);
      });
      const pdf=await Promise.race([d.loading.promise,err]);
      if(!active(d))return;
      clearTimeout(d.timeout);d.abort=null;URL.revokeObjectURL(d.url);d.url=null;
      if(pdf.numPages!==sheet.pageCount)throw new Error('تعذّر التحقق من عدد صفحات المستند.');
      d.pdf=pdf;
      const pages=document.createDocumentFragment();
      d.slots=Array.from({length:pdf.numPages},(_,i)=>{
        const el=document.createElement('div');el.className='pdf-sheet';el.setAttribute('role','img');el.setAttribute('aria-label',`الصفحة ${fmt(i+1)}`);el.dataset.page=String(i+1);pages.append(el);return el;
      });
      const stack=at('stack');stack.replaceChildren(pages);
      stack.classList.remove('pdf-enter-next','pdf-enter-prev');
      if(prev!==null&&prev!==index){void stack.offsetWidth;stack.classList.add(prev<index?'pdf-enter-next':'pdf-enter-prev');}
      setStatus();layout();controls();queuePages();
    }catch(e){
      if(!active(d))return;
      const sheet=d.sheet,filename=d.filename;
      release(d);state.doc={dead:false,sheet,filename,rendered:new Map(),pdf:null};
      controls();setStatus(e?.message||'تعذّر فتح المستند محليًا.',true);
    }
  }
  function layout(anchor=null){
    if(!state?.doc?.pdf)return;
    const d=state.doc,viewport=at('viewport'),stack=at('stack');
    d.base=Math.max(130,Math.min(722,viewport.clientWidth-2*PADDING));
    d.width=Math.ceil(d.base*state.zoom);d.height=Math.ceil(d.width*d.sheet.height/d.sheet.width);
    d.pitch=d.height+GAP;
    stack.style.width=d.width+'px';stack.style.setProperty('--page-height',d.height+'px');
    if(anchor){
      viewport.scrollLeft=Math.max(0,at('stack').offsetLeft+anchor.xRatio*d.width-anchor.x);
      viewport.scrollTop=Math.max(0,PADDING+anchor.page*d.pitch+anchor.yRatio*d.height-anchor.y);
    }
  }
  function zoomTo(wanted,x,y){
    if(!state?.doc?.pdf)return;
    const d=state.doc,value=Math.min(MAX_ZOOM,Math.max(1,wanted));
    if(Math.abs(state.zoom-value)<.004)return;
    const viewport=at('viewport');x=x??viewport.clientWidth/2;y=y??viewport.clientHeight/2;
    const position=Math.max(0,viewport.scrollTop+y-PADDING),page=Math.min(d.pdf.numPages-1,Math.floor(position/d.pitch));
    const anchor={x,y,page,xRatio:Math.min(1,Math.max(0,(viewport.scrollLeft+x-at('stack').offsetLeft)/d.width)),yRatio:Math.min(1,(position-page*d.pitch)/d.height)};
    state.zoom=value;layout(anchor);controls();queuePages();
  }
  function queuePages(){
    if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;syncPages();});
  }
  function syncPages(){
    if(!state?.doc?.pdf)return;
    const d=state.doc, viewport=at('viewport');
    const bounded=v=>Math.min(d.pdf.numPages-1,Math.max(0,Math.floor((v-PADDING)/d.pitch)));
    const current=bounded(viewport.scrollTop+Math.min(viewport.clientHeight/2,d.height*.42));
    const first=bounded(viewport.scrollTop), last=bounded(viewport.scrollTop+viewport.clientHeight);
    const wanted=new Set([current]);
    for(let k=first;k<=last&&wanted.size<5;k++)wanted.add(k);
    if(first>0&&wanted.size<5)wanted.add(first-1);
    if(last<d.pdf.numPages-1&&wanted.size<5)wanted.add(last+1);
    const num=`صفحة ${fmt(current+1)} من ${fmt(d.pdf.numPages)}`;
    if(at('page-counter').textContent!==num)at('page-counter').textContent=num;
    for(const [key,r] of d.rendered)if(!wanted.has(key)){evict(r);d.rendered.delete(key);}
    // Rerender only when the actual pixel density changes; CSS scales during pinch.
    const density=Math.min(Math.max(devicePixelRatio||1,1.45),2.25);
    const pixels=Math.floor(Math.min(d.width*density,Math.sqrt(MAX_PX*d.sheet.width/d.sheet.height)));
    for(const key of wanted){
      const r=d.rendered.get(key);
      if(r&&Math.abs(r.pixels-pixels)<Math.max(8,pixels*.045))continue;
      if(r)evict(r,true);
      void paintPage(d,key,pixels);
    }
  }
  async function paintPage(d,key,pixels){
    const el=d.slots[key],r={el,pixels,task:null,canvas:null,cancelled:false};d.rendered.set(key,r);
    el.setAttribute('aria-busy','true');
    try {
      const page=await d.pdf.getPage(key+1);
      if(!active(d)||r.cancelled)return;
      const unit=page.getViewport({scale:1}),view=page.getViewport({scale:pixels/unit.width});
      const canvas=r.canvas=document.createElement('canvas');
      canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.setAttribute('aria-hidden','true');
      r.task=page.render({canvasContext:canvas.getContext('2d',{alpha:false}),viewport:view,background:'#ffffff'});
      await r.task.promise;
      if(active(d)&&!r.cancelled){
        const old=el.querySelector('canvas');if(old)old.width=old.height=0;
        el.replaceChildren(canvas);el.classList.remove('pdf-page-error');el.removeAttribute('aria-busy');el.dataset.rendered='true';
      }
    }catch{
      if(active(d)&&!r.cancelled){el.removeAttribute('aria-busy');if(!el.querySelector('canvas')){el.classList.add('pdf-page-error');el.textContent='تعذّر عرض هذه الصفحة. يمكنك حفظ ملف PDF.';}}
    }
  }
  function toPage(n,offset=0){
    const d=state?.doc;if(!d?.pdf)return;
    at('viewport').scrollTo({top:Math.max(0,PADDING+(n-1)*d.pitch+offset-PADDING),left:0,behavior:'auto'});queuePages();
  }
  const distance=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
  function touchStart(e){
    if(!state?.doc?.pdf)return;
    const t=e.touches;
    if(t.length===1)state.gesture={x:t[0].clientX,y:t[0].clientY,zoom:state.zoom,multi:false};
    if(t.length>=2){state.gesture={multi:true,distance:distance(t),zoom:state.zoom};}
  }
  function touchMove(e){
    if(!state?.gesture||e.touches.length!==2)return;
    const t=e.touches,g=state.gesture;
    if(!g.multi){state.gesture={multi:true,distance:distance(t),zoom:state.zoom};return;}
    if(e.cancelable)e.preventDefault();
    const box=at('viewport').getBoundingClientRect();
    const x=(t[0].clientX+t[1].clientX)/2-box.left,y=(t[0].clientY+t[1].clientY)/2-box.top;
    if(g.distance>0)zoomTo(g.zoom*distance(t)/g.distance,x,y);
  }
  function clearTouch(){if(state)state.gesture=null;}
  function touchEnd(e){
    const g=state?.gesture;
    if(e.touches.length)return;
    clearTouch();
    if(!g||g.multi||g.zoom>1.003||state.zoom>1.003||!e.changedTouches.length)return;
    const t=e.changedTouches[0],x=t.clientX-g.x,y=t.clientY-g.y;
    if(Math.abs(x)>=56&&Math.abs(x)>1.55*Math.abs(y))void selectCurrency(state.index+(x>0?1:-1));
  }
  function toBase64(bytes){
    const parts=[],chunk=24576; // multiple of 3 (no padding until final chunk)
    for(let i=0;i<bytes.length;i+=chunk)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+chunk))));
    return parts.join('');
  }
  async function output(d,mode){
    if(!d?.sheet)return;
    const mime='application/pdf';
    if(native?.exportPdf){native.exportPdf(d.filename,toBase64(d.sheet.bytes),mode);return;}
    if(native){throw new Error('حدّث قيد لتمكين حفظ ومشاركة PDF على الجهاز.');}
    const file=new File([d.sheet.bytes],d.filename,{type:mime});
    if(mode==='share'&&navigator.canShare?.({files:[file]}))try{
      await navigator.share({files:[file],title:d.filename});return;
    }catch(e){if(e?.name==='AbortError')return;}
    requestDownload(d.filename,file);feedback('طُلب تنزيل ملف PDF.');
  }
  const showError=e=>feedback(e?.message||'تعذّر إتمام الطلب.',true);
  dlgPdf.addEventListener('click',event=>{
    const b=event.target.closest('[data-pdf-action]');if(!b||b.disabled||!state)return;
    const d=state.doc;
    switch(b.dataset.pdfAction){
      case 'close':return close();
      case 'prev':return void selectCurrency(state.index-1);
      case 'next':return void selectCurrency(state.index+1);
      case 'retry':return void selectCurrency(state.index);
      case 'fit':return zoomTo(1);
      case 'minus':return zoomTo(state.zoom/1.25);
      case 'plus':return zoomTo(state.zoom*1.25);
      case 'top':return toPage(1);
      case 'summary':return toPage(d.sheet.summaryPage,(d.sheet.summaryY/d.sheet.height)*d.height);
      case 'save':case 'share':return void output(d,b.dataset.pdfAction==='share'?'share':'local').catch(showError);
      case 'print':{const {target,id,codes,index}=state;return void Promise.resolve().then(()=>printDoc(target,codes[index].code,id)).catch(showError);}
    }
  });
  dlgPdf.addEventListener('keydown',e=>{
    if(!state)return;
    if((e.ctrlKey||e.metaKey)&&['+','=','-','0'].includes(e.key)){e.preventDefault();zoomTo(e.key==='0'?1:e.key==='-'?state.zoom/1.25:state.zoom*1.25);}
    else if(e.target===at('viewport')&&state.zoom<=1.003&&['ArrowLeft','ArrowRight'].includes(e.key)){
      e.preventDefault();void selectCurrency(state.index+(e.key==='ArrowRight'?1:-1));
    }
  });
  dlgPdf.addEventListener('cancel',event=>{event.preventDefault();close();});
  window.addEventListener('resize',()=>{
    if(!state?.doc?.pdf)return;
    const viewport=at('viewport'),d=state.doc,top=viewport.scrollTop/d.pitch,left=viewport.scrollLeft/d.width;
    layout();viewport.scrollTop=top*d.pitch;viewport.scrollLeft=left*d.width;queuePages();
  });
  window.addEventListener('pagehide',close);
  return {open,close,feedback,isOpen:()=>Boolean(state)};
})();
