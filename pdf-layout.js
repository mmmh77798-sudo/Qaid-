/* A4 reports: vector text and grid, repeated page headers, and one closing summary. */
'use strict';
const QaydPdfLayout=(()=>{
  const LIMIT=20*1024*1024;
  const color={ink:'#192742',muted:'#506383',blue:'#344ec3',accent:'#eaf0fc',line:'#dbe3f0',stripe:'#f7f9fd',net:'#edf2ff',closing:'#e5f2ef',green:'#0a6752',red:'#a52949',white:'#ffffff'};
  const ratios={statement:[.148,.337,.147,.175,.193],details:[.143,.212,.322,.140,.183],accounts:[.236,.160,.092,.162,.166,.184],categories:[.281,.129,.19,.19,.21],months:[.284,.126,.19,.19,.21],collection:[.225,.145,.126,.114,.133,.117,.140],aging:[.24,.151,.151,.151,.151,.156],receipt:[.28,.72],'receipt-register':[.131,.155,.227,.171,.168,.148]};
  const visualOpts={isInputVisual:true,isOutputVisual:true,isInputRtl:false,isOutputRtl:false};
  const controls=/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
  const arabicMark=/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/u;
  const combining=/\p{M}/u;
  const marker=/[\u2066-\u2069]/;
  const token='[+\\-−]?[A-Za-z0-9\\u0660-\\u0669\\u06F0-\\u06F9]+(?:[.,:٬٫/@_+\\-][A-Za-z0-9\\u0660-\\u0669\\u06F0-\\u06F9]+)*';
  const ltrRuns=new RegExp(`${token}(?:[ \\t]+${token})*`,'g');
  const later=()=>new Promise(resolve=>setTimeout(resolve,0));
  function stableText(value){return String(value??'').replace(controls,'').replace(/\r\n?/g,'\n');}
  const inline=value=>stableText(value).replace(/\s+/g,' ').trim();
  async function build(p,options,{cancelled=()=>false,progress=()=>{}}={}) {
    const {jsPDF}=globalThis.jspdf;
    const {bidi}=globalThis.QaydPdfRuntime;
    const doc=new jsPDF({unit:'pt',format:'a4',putOnlyUsedFonts:true,compress:true,precision:3});
    doc.setProperties({title:p.file,subject:p.currency.code,creator:'Qayd'});
    doc.setLanguage('ar');
    doc.addFileToVFS('IBMPlex-Regular.ttf',QaydPdfFonts.Regular);
    doc.addFont('IBMPlex-Regular.ttf','Plex','normal');
    doc.addFileToVFS('IBMPlex-SemiBold.ttf',QaydPdfFonts.SemiBold);
    doc.addFont('IBMPlex-SemiBold.ttf','Plex','bold');
    doc.setR2L(false);
    // We shape Arabic in logical order, then apply bidi once. The writer's default
    // second pass can turn visually ordered alef-lam into a false lam-alef ligature.
    const topics=doc.internal.events.getTopics().preProcessText||{};
    for(const [token,[callback]] of Object.entries(topics))if(callback===doc.processArabic)doc.internal.events.unsubscribe(token);
    const width=doc.internal.pageSize.getWidth(),height=doc.internal.pageSize.getHeight();
    const left=34,right=width-left,W=width-left*2,bottom=height-53;
    const colWidths=ratios[p.type].map(k=>W*k);
    const {formatMoney,formatNumber,profile,label,printDate,footer}=options;
    let y=0,page=0;
    const shapeCache=new Map();
    function visual(text,dir) {
      const key=dir+':'+text;
      if(shapeCache.has(key))return shapeCache.get(key);
      const source=text.normalize('NFC'),marks=new Map();
      let base=source;
      if(arabicMark.test(source)){
        base='';
        for(const ch of source){
          if(arabicMark.test(ch)&&combining.test(ch)){
            const i=base.length-1;marks.set(i,(marks.get(i)||'')+ch);
          }else base+=ch;
        }
      }
      const glyphs=doc.processArabic(base);
      let shaped=glyphs,paintedMarks=[];
      if(dir==='rtl')shaped=glyphs.replace(ltrRuns,'\u2066$&\u2069');
      const levels=bidi.getEmbeddingLevels(shaped,dir);
      let raw;
      if(!marks.size)raw=bidi.getReorderedString(shaped,levels).replace(/[\u2066-\u2069]/g,'');
      else {
        // Keep non-spacing vowel marks attached to the shaped base glyph, even
        // across bidi reversal and lam-alef ligatures. The source stays copyable.
        const byIndex=new Map();
        let n=0;
        for(let i=0;i<shaped.length;i++){
          if(marker.test(shaped[i]))continue;
          const len=Math.max(1,shaped[i].normalize('NFKC').length);
          for(let j=0;j<len;j++)if(marks.has(n+j))byIndex.set(i,(byIndex.get(i)||'')+marks.get(n+j));
          n+=len;
        }
        raw='';
        const mirrors=bidi.getMirroredCharactersMap(shaped,levels.levels);
        for(const i of bidi.getReorderedIndices(shaped,levels)){
          if(marker.test(shaped[i]))continue;
          if(byIndex.has(i))paintedMarks.push([raw.length,byIndex.get(i)]);
          raw+=mirrors.get(i)||shaped[i];
        }
      }
      const result={raw,paintedMarks};
      if(shapeCache.size>=1800)shapeCache.clear();
      shapeCache.set(key,result);return result;
    }
    function widthOf(raw,size){return doc.internal.getFont().metadata.widthOfString(raw,size,0);}
    const actualHex=s=>{let hex='FEFF';for(let i=0;i<s.length;i++)hex+=s.charCodeAt(i).toString(16).padStart(4,'0');return hex;};
    function font(size,bold=false){doc.setFont('Plex',bold?'bold':'normal');doc.setFontSize(size);}
    function wrap(value,max,size,{bold=false,dir='rtl'}={}) {
      font(size,bold);
      const lines=[];
      const fits=s=>widthOf(visual(s,dir).raw,size)<=max;
      for(const para of stableText(value).split('\n')) {
        let line='';
        for(const word of para.trim().split(/\s+/).filter(Boolean)) {
          const attempt=line?line+' '+word:word;
          if(fits(attempt)){line=attempt;continue;}
          if(line){lines.push(line);line='';}
          if(fits(word)){line=word;continue;}
          for(const ch of word){if(line&&!fits(line+ch)){lines.push(line);line='';}line+=ch;}
        }
        lines.push(line);
      }
      return lines;
    }
    function text(value,x,baseline,size,{bold=false,dir='rtl',align='right',tone=color.ink}={}) {
      if(!value)return;
      font(size,bold);doc.setTextColor(tone);
      const logical=stableText(value),{raw,paintedMarks}=visual(logical,dir);
      const start=align==='right'?x-widthOf(raw,size):x;
      if(raw!==logical)doc.internal.write('/Span <</ActualText <'+actualHex(logical)+'> >> BDC');
      doc.text(raw,start,baseline,visualOpts);
      for(const [i,marks] of paintedMarks){
        const center=start+widthOf(raw.slice(0,i),size)+widthOf(raw[i],size)*.5;
        const stack=marks.includes('ّ');
        for(const mark of marks){
          const below=/[\u064d\u0650\u0656]/.test(mark),rise=below?-.52:(stack&&mark!=='ّ'?.57:.36);
          doc.text(mark,center-size*.12,baseline-rise*size,visualOpts);
        }
      }
      if(raw!==logical)doc.internal.write('EMC');
    }
    function rule(x1,y1,x2,y2,c=color.line){doc.setDrawColor(c);doc.setLineWidth(.55);doc.line(x1,y1,x2,y2);}
    function fill(x,top,w,h,c){doc.setFillColor(c);doc.rect(x,top,w,h,'F');}
    const currency=label(p.currency);
    const currencyNote='العملة: '+currency;
    const section=p.type==='statement'?'كشف حساب':p.type==='receipt'?'دفتر الذمم · المقبوضات':'تقرير مالي';
    function header(first) {
      fill(left,29,W,3,color.blue);
      const brand=profile?.business||'قيد · دفتر الذمم';
      let top=50;
      if(first) {
        let logoInset=0;
        if(profile?.logo)try {
          const image=doc.getImageProperties(profile.logo),scale=Math.min(39/image.width,39/image.height);
          if(Number.isFinite(scale)&&scale>0){doc.addImage(profile.logo,'JPEG',right-39,39,image.width*scale,image.height*scale);logoInset=48;}
        } catch { /* A bad legacy logo must not prevent the report. */ }
        const bits=[{v:brand,size:12,bold:true},...(profile?[{v:profile.address,size:9},{v:profile.phone,size:9,dir:'ltr'},{v:[profile.nameEn,profile.addressEn].filter(Boolean).join(' · '),size:9,dir:'ltr'}]:[])];
        for(const b of bits.filter(c=>c.v))for(const line of wrap(inline(b.v),W-logoInset-6,b.size,b)){
          text(line,right-logoInset,top,b.size,{...b,tone:b.bold?color.blue:color.muted});top+=b.size+3;
        }
        top=Math.max(top+6,logoInset?91:65);
        text(section,right,top,10,{bold:true,tone:color.blue});top+=24;
        for(const line of wrap(inline(p.heading),W,20,{bold:true})) {text(line,right,top,20,{bold:true});top+=24;}
        for(const [i,note] of p.notes.entries()){
          const lines=wrap(inline(note),W-14,i===0?11:9.5,{bold:i===0});
          if(i===0)fill(left,top-12,W,lines.length*14+5,color.accent);
          for(const line of lines) {text(line,right-7,top,i===0?11:9.5,{bold:i===0,tone:i===0?color.blue:color.muted});top+=14;}
          if(i===0)top+=7;
        }
        y=top+5;
      } else {
        const n=p.type==='statement'?section+' — '+p.heading:p.heading;
        for(const line of wrap(inline(n),W,12,{bold:true})){text(line,right,top,12,{bold:true});top+=15;}
        for(const line of wrap(inline(currencyNote),W,9.5)){text(line,right,top,9.5,{tone:color.muted});top+=12;}
        y=top+5;
      }
    }
    function tableHead() {
      const cols=p.cols.map((v,i)=>wrap(v,colWidths[i]-13,9.1,{bold:true}));
      const hh=Math.max(...cols.map(c=>c.length))*13+12;
      fill(left,y,W,hh,color.accent);
      let x=right;
      cols.forEach((lines,i)=>{lines.forEach((line,k)=>text(line,x-7,y+14+k*13,9.1,{bold:true,tone:color.blue}));x-=colWidths[i];});
      rule(left,y+hh,right,y+hh);
      y+=hh;
    }
    function newPage(first=false,table=true) {
      if(!first)doc.addPage();
      page++;
      header(first);
      if(table)tableHead();
    }
    newPage(true);
    const lineH=13.7,pad=10;
    function drawRow(row,index) {
      const cells=row.map((c,i)=>{
        const num=c.kind==='money'||c.kind==='num'||c.kind==='day';
        const value=c.kind==='money'?formatMoney(c.v):c.kind==='num'?formatNumber(c.v):c.v;
        const dir=num?'ltr':'rtl',max=colWidths[i]-14;
        let size=9.5;
        if(c.kind==='money'||c.kind==='num'){
          font(size);const natural=widthOf(visual(stableText(value),dir).raw,size);
          if(natural>max)size=Math.max(5.4,(size*max/natural)*.98);
        }
        return {lines:wrap(value,max,size,{dir}),size,dir,tone:c.kind==='money'&&c.v<0?color.red:color.ink};
      });
      const lines=Math.max(...cells.map(c=>c.lines.length));
      let offset=0;
      if(y+lines*lineH+pad>bottom&&y>124)newPage();
      while(offset<lines){
        let count=Math.floor((bottom-y-pad)/lineH);
        if(count<1){newPage();continue;}
        count=Math.min(count,lines-offset);
        const h=count*lineH+pad;
        if(index%2)fill(left,y,W,h,color.stripe);
        let x=right;
        cells.forEach((cell,i)=>{
          cell.lines.slice(offset,offset+count).forEach((line,k)=>text(line,x-7,y+14+k*lineH,cell.size,{dir:cell.dir,tone:cell.tone}));
          x-=colWidths[i];
          if(i<cells.length-1)rule(x,y,x,y+h);
        });
        rule(left,y+h,right,y+h);y+=h;offset+=count;
        if(offset<lines)newPage();
      }
    }
    for(const [i,row] of p.rows.entries()){
      if(i%160===0){if(cancelled())return null;progress(i,p.rows.length);await later();if(cancelled())return null;}
      drawRow(row,i);
    }
    if(!p.rows.length){text('لا سجلات في هذه الفترة.',right-7,y+18,10,{tone:color.muted});y+=28;rule(left,y,right,y);}
    // Reserve the entire summary before drawing it; never split totals across sheets.
    let summaryPage=page,summaryY=y;
    const fields=QaydTotals.fields(p.summary);
    const units=wrap(inline(currencyNote),W-22,10);
    const note=p.summary.note?wrap(p.summary.note,W-22,9):[];
    const foot=footer?wrap(inline(footer),W-22,9.5):[];
    const boxHeight=43+units.length*13+fields.length*23+note.length*13+(note.length?10:5);
    const signHeight=p.type==='receipt'?61:0;
    const footHeight=foot.length?14+foot.length*13:0;
    y+=16;
    if(y+boxHeight+signHeight+footHeight>bottom)newPage(false,false);
    summaryPage=page;summaryY=y;
    fill(left,y,W,boxHeight,color.stripe);
    fill(left,y,W,2,color.blue);
    text(p.summary.title||'ملخص نهاية التقرير',right-11,y+22,14,{bold:true});
    let sy=y+37;
    for(const line of units){text(line,right-11,sy,10,{tone:color.blue});sy+=13;}
    sy+=4;
    for(const [key,name,value] of fields){
      const strong=key==='net'||key==='ending';
      if(strong)fill(left+4,sy-4,W-8,22,key==='ending'?color.closing:color.net);
      else rule(left+11,sy-4,right-11,sy-4);
      text(name,right-11,sy+11,10,{bold:strong});
      text(formatMoney(value),left+11,sy+11,strong?12:10,{bold:strong,dir:'ltr',align:'left',tone:value<0||key==='debit'?color.red:key==='ending'||key==='credit'?color.green:color.ink});
      sy+=23;
    }
    for(const line of note){text(line,right-11,sy+8,9,{tone:color.muted});sy+=13;}
    y+=boxHeight;
    if(signHeight){
      const gap=23,w=(W-gap)/2;
      for(const [x,caption] of [[right,'اسم وتوقيع المستلم'],[left+w,'توقيع الدافع (اختياري)']]){
        rule(x-w,y+29,x,y+29);text(caption,x,y+43,9.5,{tone:color.muted});
      }
      y+=signHeight;
    }
    for(const line of foot){text(line,right-11,y+17,9.5,{tone:color.muted});y+=13;}
    for(let i=1;i<=page;i++){
      doc.setPage(i);
      rule(left,height-39,right,height-39);
      text(`صفحة ${formatNumber(i)} من ${formatNumber(page)}`,left,height-24,8.6,{align:'left',tone:color.muted});
      text(printDate?'تاريخ الطباعة: '+printDate:'قيد · دفتر الذمم',right,height-24,8.6,{tone:color.muted});
    }
    if(cancelled())return null;
    const bytes=new Uint8Array(doc.output('arraybuffer'));
    if(bytes.length>LIMIT)throw new Error('ملف PDF كبير جدًا. حدّد فترة أقصر ثم أعد فتح التقرير.');
    return {bytes,pageCount:page,width,height,summaryPage,summaryY};
  }
  return {build};
})();
