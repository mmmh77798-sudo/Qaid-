/* Minimal, local OOXML report exporter. Strings are never formulas. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QaydXlsx=api;})(globalThis,()=>{
  'use strict';
  const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const MAX_FILE=20*1024*1024;
  const enc=new TextEncoder(),xmlDecl='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main',rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships',pr='http://schemas.openxmlformats.org/package/2006/relationships';
  const xml=value=>String(value??'').replace(/_x[0-9a-f]{4}_/gi,v=>'_x005F_'+v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const crcTable=Uint32Array.from({length:256},(_,i)=>{let x=i;for(let k=0;k<8;k++)x=(x&1)?0xedb88320^(x>>>1):x>>>1;return x;});
  function crc32(bytes){let a=0xffffffff;for(const b of bytes)a=crcTable[(a^b)&255]^(a>>>8);return (a^0xffffffff)>>>0;}
  function buf(n){const b=new Uint8Array(n),v=new DataView(b.buffer);return {b,w:(p,x)=>v.setUint16(p,x,true),d:(p,x)=>v.setUint32(p,x,true)};}
  async function zip(entries){
    const local=[],central=[];let size=0,cdSize=0;
    for(const [file,content] of entries){
      const name=enc.encode(file),raw=enc.encode(content),sum=crc32(raw);
      let bytes=raw,method=0;
      if(raw.length>256&&typeof CompressionStream==='function')try{
        const z=new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const compressed=new Uint8Array(await new Response(z).arrayBuffer());
        if(compressed.length<raw.length){bytes=compressed;method=8;}
      }catch{/* Store the entry uncompressed where raw DEFLATE is unavailable. */}
      const l=buf(30+name.length);l.d(0,0x04034b50);l.w(4,20);l.w(8,method);l.w(12,33);l.d(14,sum);l.d(18,bytes.length);l.d(22,raw.length);l.w(26,name.length);l.b.set(name,30);
      const c=buf(46+name.length);c.d(0,0x02014b50);c.w(4,20);c.w(6,20);c.w(10,method);c.w(14,33);c.d(16,sum);c.d(20,bytes.length);c.d(24,raw.length);c.w(28,name.length);c.d(42,size);c.b.set(name,46);
      size+=l.b.length+bytes.length;cdSize+=c.b.length;
      if(size+cdSize+22>MAX_FILE)throw new Error('ملف Excel كبير جدًا. اختر فترة أقصر.');
      local.push(l.b,bytes);central.push(c.b);
    }
    const end=buf(22);end.d(0,0x06054b50);end.w(8,entries.length);end.w(10,entries.length);end.d(12,cdSize);end.d(16,size);
    const out=new Uint8Array(size+cdSize+22);let pos=0;
    for(const b of [...local,...central,end.b]){out.set(b,pos);pos+=b.length;}
    return out;
  }
  const rels=(a)=>xmlDecl+`<Relationships xmlns="${pr}">${a.map(([id,type,target])=>`<Relationship Id="${id}" Type="${rel}/${type}" Target="${target}"/>`).join('')}</Relationships>`;
  const contentTypes=xmlDecl+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const workbook=xmlDecl+`<workbook xmlns="${main}" xmlns:r="${rel}"><bookViews><workbookView/></bookViews><sheets><sheet name="التقرير" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const styles=xmlDecl+`<styleSheet xmlns="${main}">
    <numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00#;[Red]-#,##0.00#;0.00"/></numFmts>
    <fonts count="3"><font><sz val="11"/><color rgb="FF21304A"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF253C9B"/><name val="Arial"/></font></fonts>
    <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3658C6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FC"/><bgColor indexed="64"/></patternFill></fill></fills>
    <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
    <cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
    <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const letter=k=>String.fromCharCode(65+k); // five or six columns in each Qayd report
  function worksheet(p,decimal,fields){
    const rows=[],merges=[],lastCol=letter(p.cols.length-1);
    function row(cells,{merge=false,height=0}={}){
      const r=rows.length+1;
      const children=cells.map((c,i)=>{
        if(!c)return '';
        const ref=letter(i)+r,s=c.s??0;
        return c.numeric?`<c r="${ref}" s="${s}"><v>${c.v}</v></c>`:`<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.v)}</t></is></c>`;
      }).join('');
      rows.push(`<row r="${r}"${height?` ht="${height}" customHeight="1"`:''}>${children}</row>`);
      if(merge)merges.push(`A${r}:${lastCol}${r}`);
      return r;
    }
    row([{v:p.title,s:2}],{merge:true,height:24});
    for(const note of p.notes)row([{v:note}],{merge:true,height:note.length>108?33:18});
    row([]);
    const header=row(p.cols.map(v=>({v,s:2})),{height:23});
    for(const cells of p.rows)row(cells.map(c=>c.kind==='money'?{numeric:true,v:decimal(c.v),s:1}:c.kind==='num'?{numeric:true,v:c.v,s:5}:{v:c.v}));
    const lastData=rows.length;
    if(!p.rows.length)row([{v:'لا سجلات في هذه الفترة.'}],{merge:true});
    row([]);
    row([{v:'ملخص نهاية التقرير',s:2}],{merge:true,height:24});
    row([{v:`العملة: ${p.currency.name} (${p.currency.code})`,s:3}],{merge:true,height:21});
    for(const [key,label,v] of fields){const strong=key==='net'||key==='ending';row([{v:label,s:strong?3:0},{v:decimal(v),numeric:true,s:strong?4:1}],{height:label.length>23?32:20});}
    if(p.summary.note)row([{v:p.summary.note}],{merge:true,height:28});
    const widths=p.type==='statement'?[31,54,22,20,22]:p.type==='details'?[23,33,55,22,22]:p.type==='accounts'?[31,25,16,20,20,22]:p.type==='collection'?[32,20,19,19,21,19,18]:p.type==='aging'?[32,19,19,19,22,20]:p.type==='receipt-register'?[18,17,32,22,21,20]:[32,16,20,20,22];
    return xmlDecl+`<worksheet xmlns="${main}"><dimension ref="A1:${lastCol}${rows.length}"/><sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="${header}" topLeftCell="A${header+1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${header+1}" sqref="A${header+1}"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows.join('')}</sheetData>${p.rows.length?`<autoFilter ref="A${header}:${lastCol}${lastData}"/>`:''}<mergeCells count="${merges.length}">${merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells></worksheet>`;
  }
  function build(p,decimal,fields){
    return zip([
      ['[Content_Types].xml',contentTypes],['_rels/.rels',rels([['rId1','officeDocument','xl/workbook.xml']])],
      ['xl/workbook.xml',workbook],['xl/_rels/workbook.xml.rels',rels([['rId1','worksheet','worksheets/sheet1.xml'],['rId2','styles','styles.xml']])],
      ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',worksheet(p,decimal,fields)]
    ]);
  }
  return {MIME,build};
});
