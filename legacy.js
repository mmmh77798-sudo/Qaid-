/* Migration of the observed Ledger of Accounts SQLite v4 layout. It is a read-only
 * transformation, not a guess about old-app signs or about unverified transfers. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./ledger.js'));else root.QaydLegacy=factory(root.Ledger);})(globalThis,function(L){
  'use strict';
  const fail=s=>{throw new Error(s);};
  const clean=s=>L.digits(s).replace(/[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  const pad=n=>String(n).padStart(2,'0');
  function amount(value){
    if(value==null||value==='')return 0;
    let s=clean(value).replace(/^−/,'-').replace(/٫/g,'.').replace(/٬/g,',').replace(/[\u00a0\u202f]/g,' ');
    if(!s)return 0;
    if(/^[+-]?[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?$/.test(s))s=s.replace(/,/g,'');
    else if(/^[+-]?[0-9]{1,3}(?: [0-9]{3})+(?:\.[0-9]+)?$/.test(s))s=s.replace(/ /g,'');
    else if(/^[+-]?\d+,\d{1,3}$/.test(s))s=s.replace(',','.');
    const m=s.match(/^([+-]?)(\d{1,18})(?:\.(\d{1,16}))?(?:[eE]([+-]?\d{1,2}))?$/);
    if(!m)fail('يوجد مبلغ بصيغة غير مدعومة. لن نغيّر الإشارة أو نتجاهل المبلغ.');
    const raw=m[2]+(m[3]||'');
    if(!/[1-9]/.test(raw))return 0;
    const point=m[2].length+Number(m[4]||0), digits=point>=0?raw.padEnd(point,'0'):'0'.repeat(-point)+raw;
    const cut=Math.max(0,point), whole=digits.slice(0,cut).replace(/^0+/,'')||'0', fraction=digits.slice(cut).replace(/0+$/,'');
    if(fraction.length>L.PRECISION)fail('في النسخة مبلغ بأكثر من ثلاث منازل عشرية. لم يُقرَّب المبلغ ولم يُسترجع الدفتر.');
    if(whole.length>12)fail('مبلغ من النسخة خارج الحد المسموح.');
    const n=Number(whole)*L.SCALE+Number(fraction.padEnd(L.PRECISION,'0'));
    if(!Number.isSafeInteger(n)||n>L.MAX)fail('مبلغ من النسخة خارج الحد المسموح.');
    return m[1]==='-'?-n:n;
  }
  function clock(text){
    const m=clean(text).match(/(?:^|[T\s،])(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*(am|pm|ص|م)?(?=$|[\sZ+-])/i);
    if(!m)return '';
    let hour=Number(m[1]);
    if(m[3]){if(hour<1||hour>12)return '';hour=hour%12+(/^(pm|م)$/i.test(m[3])?12:0);}
    const t=pad(hour)+':'+m[2];return L.validTime(t)?t:'';
  }
  function date(value){
    const s=clean(value);
    if(/هجري|هـ/.test(s))fail('يوجد تاريخ هجري في النسخة. لا يُسترجع كتاريخ ميلادي بالتخمين.');
    const iso=(y,m,d)=>{
      const result=y+'-'+pad(m)+'-'+pad(d);
      return +y>=1900&&+y<=2199&&L.validDay(result)?result:'';
    };
    let dm='',md='';
    const exact=s.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?=$|[T\s،])/);
    const short=s.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})(?=$|[T\s،])/);
    const flat=s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if(exact)dm=md=iso(exact[1],exact[3],exact[4]);
    else if(short){dm=iso(short[4],short[3],short[1]);md=iso(short[4],short[1],short[3]);}
    else if(flat)dm=md=iso(flat[1],flat[2],flat[3]);
    if(!dm&&!md)fail('يوجد تاريخ حركة لا يمكن قراءته دون تخمين. احتفظ بالنسخة الأصلية.');
    return {dm:dm||md,md:md||dm,time:clock(s),source:s.slice(0,42),hint:short?(dm&&!md?'dm':md&&!dm?'md':''):''};
  }
  const key=(v,optional=false)=>{
    const s=String(v??'').trim();
    if(!s&&optional)return '';
    if(!/^-?(?:0|[1-9]\d{0,18})$/.test(s)||s==='-0')fail('يوجد معرّف غير صالح في قاعدة البيانات.');
    return s;
  };
  const cleanTxt=s=>String(s??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').trim();
  const codeNames=new Map([
    ['ير','YER'],['yer','YER'],['ريال يمني','YER'],['الريال اليمني','YER'],['يمني','YER'],['ر.ي','YER'],
    ['sar','SAR'],['ريال سعودي','SAR'],['الريال السعودي','SAR'],['سعودي','SAR'],['ر.س','SAR'],
    ['usd','USD'],['دولار','USD'],['دولار امريكي','USD'],['الدولار الامريكي','USD'],['دولار أمريكي','USD'],['$','USD']
  ].map(([x,y])=>[L.searchKey(x),y]));
  const pairKey=(a,code)=>a+'|'+code, maxEntries=60000;
  const reviewId='old-unassigned';
  // Some v4 files use `in` as a ±1 flag and `out` as the whole magnitude.
  // A shape match is only a hint; corroborate it with independent cached balances.
  function cachedAmount(value,type){
    try{return amount(value);}catch(e){
      // SQLite may serialize a derived REAL balance with tiny binary tails.
      // This tolerance is ONLY for checking the cache, never for source postings.
      if(type!=='real'||!/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value))throw e;
      const v=Number(value)*L.SCALE,n=Math.round(v);
      if(!Number.isSafeInteger(n)||Math.abs(n)>L.MAX||Math.abs(v-n)>0.00001)throw e;
      return n===0?0:n;
    }
  }
  function probeFlags(source){
    const totals=new Map(), cache=new Map();let sample=null;
    try{
      for(const [rawId,rawA,i,o,,,,,rawCur] of source.transactions){
        const flag=amount(i), magnitude=amount(o);
        if(Math.abs(flag)!==L.SCALE||magnitude<0)return null;
        if(!sample&&magnitude>L.SCALE)sample={flag:flag/L.SCALE,magnitude};
        const a=key(rawA,true),cur=key(rawCur,true),id=key(rawId);
        if(a&&cur){
          const k=pairKey(a,cur), t=totals.get(k)||{sum:0,count:0,last:id};
          t.sum+=flag<0?-magnitude:magnitude;t.count++;
          if(BigInt(id)>BigInt(t.last))t.last=id;
          if(!Number.isSafeInteger(t.sum))return null;
          totals.set(k,t);
        }
      }
    }catch{return null;}
    if(!sample)return null;
    let informative=0, agrees=0;
    const duplicate=new Set();
    if(Array.isArray(source.cachedBalances)&&source.cachedBalances.length<=maxEntries)for(const row of source.cachedBalances)try{
      const [a,c,rawValue,rawLast,rawCount,type]=row;
      const account=key(a),cur=key(c),last=key(rawLast,true),n=Number(key(rawCount));
      if(rawValue==null||!String(rawValue).trim()||n<0||n>maxEntries)continue;
      const k=pairKey(account,cur), sum=cachedAmount(rawValue,type);
      if(cache.has(k))duplicate.add(k);
      cache.set(k,{account,cur,last,count:n,sum});
    }catch{}
    for(const k of duplicate)cache.delete(k);
    for(const [k,c] of cache){
      const t=totals.get(k);
      if(!t||t.last!==c.last||!t.sum&&!c.sum)continue;
      informative++;
      if(t.sum===c.sum&&t.count===c.count)agrees++;
    }
    const confirmed=informative>0&&agrees>=Math.min(2,informative)&&agrees>=informative-1;
    return {totals,cache,sample,confirmed};
  }
  function prepare(source,{layout='auto'}={}){
    const {accounts,categories,currencies,transactions}=source;
    const caps=[[accounts,10000],[categories,200],[currencies,40],[transactions,maxEntries]];
    if(caps.some(([v,n])=>!Array.isArray(v)||v.length>n))fail('عدد السجلات في الملف يتجاوز حدود الاسترجاع.');
    const flag=probeFlags(source);
    if(!['auto','flags','columns'].includes(layout)||layout==='flags'&&!flag)fail('طريقة قراءة الأعمدة لا تطابق الملف.');
    const flagged=!!flag&&(layout==='flags'||layout==='auto'&&flag.confirmed);
    const ledger=L.empty(), stats={rows:transactions.length,zero:0,negative:0,dual:0,precise:0,unassigned:0,dayFirst:0,monthFirst:0,accountsRenamed:0,categoriesRenamed:0,textShort:0,missingTime:0,uncategorized:0,currencyAssumed:0};
    const text=(v,n)=>{if(v!==null&&v!==undefined&&typeof v!=='string')fail('يوجد حقل نصي غير مدعوم في النسخة.');const s=cleanTxt(v);if(s.length>n)stats.textShort++;return s.slice(0,n);};
    const suffixCounters=new WeakMap();
    function named(v,cap,seen,fallback,stat){
      const orig=text(v,cap), base=orig||fallback, norm=L.searchKey(base);let next=base;
      if(seen.has(norm)){
        if(!suffixCounters.has(seen))suffixCounters.set(seen,new Map());
        const counter=suffixCounters.get(seen);let n=counter.get(norm)||2;
        while(seen.has(L.searchKey(next))){const suffix=` (${n++})`;next=base.slice(0,cap-suffix.length)+suffix;}
        counter.set(norm,n);
      }
      if(next!==orig&&stat)stats[stat]++;seen.add(L.searchKey(next));return next;
    }
    function put(map,k,v){if(map.has(k))fail('وجد قيد بمعرّف مكرر في النسخة.');map.set(k,v);return v;}
    const g=new Map(),a=new Map(),curr=new Map(),cNames=new Set(),aNames=new Set(),curLabels=new Set(),codes=new Set();
    ledger.categories=categories.map(([rawId,n],index)=>{
      const id=key(rawId);return put(g,id,{id:'old-g-'+id,name:named(n,50,cNames,'تصنيف '+(index+1),'categoriesRenamed'),color:L.colors[index%L.colors.length]});
    });
    ledger.currencies=currencies.map(([rawId,n],index)=>{
      const id=key(rawId),label=named(n,45,curLabels,'عملة '+(index+1));
      let code=codeNames.get(L.searchKey(label))||'OLD'+(index+1);
      if(codes.has(code))code='OLD'+(index+1);
      codes.add(code);return put(curr,id,{name:label,code,symbol:code==='YER'?'ر.ي':code==='SAR'?'ر.س':code==='USD'?'$':code});
    });
    if(!ledger.currencies.length){
      if(transactions.length)fail('في الملف حركات ولا توجد عملات مرجعية للتحقق منها.');
      ledger.currencies=L.empty().currencies;
    }
    ledger.settings.defaultCode=ledger.currencies[0].code;
    ledger.accounts=accounts.map(([rawId,n,gsm,rawGroup],index)=>{
      const id=key(rawId),group=key(rawGroup,true);
      if(group&&!g.has(group)&&group!=='0'&&group!=='-1')stats.uncategorized++;
      return put(a,id,{id:'old-a-'+id,name:named(n,90,aNames,'حساب '+(index+1),'accountsRenamed'),category:g.get(group)?.id||'',phone:text(gsm,48),note:'',color:L.colors[index%L.colors.length],reminder:'',favorite:false});
    });
    let dateExample=null, sideExample=null, sideRank=-1, negativeExample=null, signExample=null, transferExample=null, reviewAccount=null, reviewExample=null;
    const idSet=new Set(), rs=[], strictMap=new Map(), approx=new Map(), blockedContexts=new Set();
    const sampleR=(r,amount=r.amount,side=r.side)=>({...r,amount,side,account:r.accountObj.name,other:r.otherObj?.name||'',currency:r.cur.name});
    const context=r=>[r.dm,r.md,r.time,r.memo];
    const contextKey=(r,a,b)=>JSON.stringify([a,b,r.cur.code,...context(r)]);
    transactions.forEach(([rawId,rawA,inField,outField,when,remarks,now,rawOther,rawCur],index)=>{
      try{
        const id=key(rawId),inn=amount(inField),out=amount(outField),posting=flagged?(inn<0?-out:out):0;
        if(idSet.has(id))fail('يوجد أكثر من سجل حركة بالمعرّف نفسه.');idSet.add(id);
        if(flagged?!out:!inn&&!out){stats.zero++;return;}
        const dual=!flagged&&inn&&out?{inn,out}:null;
        if(dual)stats.dual++;
        const aa=key(rawA,true),bb=key(rawOther,true),cc=key(rawCur,true),linked=a.get(aa),other=a.get(bb);
        if(aa&&!linked)fail('هذه الحركة مرتبطة بحساب غير موجود في جدول الحسابات.');
        if((bb&&!other&&bb!=='0'&&bb!=='-1')||(other&&other===linked))fail('لم يمكن تحديد طرف التحويل الآخر دون تخمين.');
        if(!aa&&!reviewAccount){
          const name=named('حركات بلا حساب (للمراجعة)',90,aNames,'حركات بلا حساب');
          reviewAccount={id:reviewId,name,category:'',phone:'',note:'لم يحدد الملف القديم حسابًا لهذه الحركات. راجعها قبل نسبها لأي حساب.',color:'amber',reminder:'',favorite:false};
          ledger.accounts.push(reviewAccount);
        }
        const acct=linked||reviewAccount;
        if(!aa)stats.unassigned++;
        let cur=curr.get(cc);
        if(!cur&&curr.size===1&&(!cc||cc==='0'||cc==='-1')){cur=ledger.currencies[0];stats.currencyAssumed++;}
        if(!cur)fail('هذه الحركة مرتبطة بعملة لا يمكن تحديدها من جدول العملات.');
        const d=date(when),t=d.time||clock(now);
        if(!t)stats.missingTime++;
        if(d.hint==='dm')stats.dayFirst++;else if(d.hint==='md')stats.monthFirst++;
        const r={id,accountObj:acct,otherObj:linked&&other||null,cur,amount:flagged?posting:inn||out,side:flagged?Math.sign(inn):inn?1:-1,dual,dm:d.dm,md:d.md,dateSource:d.source,time:t||'00:00',knownTime:!!t,memo:text(remarks,600),created:index+1,pair:null,incomplete:false};
        if(!aa&&!reviewExample)reviewExample=sampleR(r);
        if(d.dm!==d.md)dateExample=sampleR(r);
        stats.precise+=flagged?Number(out%10!==0):Number(inn%10!==0)+Number(out%10!==0);
        if(flagged){
          if(posting<0)stats.negative++;
          if(!signExample||posting<0&&signExample.amount>0)signExample=sampleR(r);
          r.fromKey=pairKey(aa,cc);r.toKey=pairKey(bb,cc);
        }else if(inn<0||out<0){
          stats.negative+=Number(inn<0)+Number(out<0);
          if(!negativeExample)negativeExample=sampleR(r,inn<0?inn:out,inn<0?1:-1);
        }
        // Show a positive single-column example when available. If all positive
        // values are in dual rows, show the chosen component and label its column.
        if(!flagged&&(inn>0||out>0)){
          const rank=!linked?0:dual?1:other?2:3;
          if(rank>=sideRank){sideRank=rank;sideExample=sampleR(r,inn>0?inn:out,inn>0?1:-1);}
        }
        if(r.otherObj){
          const endpoints=[acct.id,other.id].sort();
          // Include both magnitudes as evidence of an ambiguous counterpart, but
          // never turn the split components themselves into transfers.
          const magnitudes=dual?new Set([Math.abs(inn),Math.abs(out)]):[Math.abs(r.amount)];
          for(const n of magnitudes){
            const base=[...endpoints,cur.code,n];
            const str=JSON.stringify([...base,...context(r)]), raw=JSON.stringify(base);
            if(!strictMap.has(str))strictMap.set(str,[]);strictMap.get(str).push(r);
            if(!approx.has(raw))approx.set(raw,[]);approx.get(raw).push(r);
          }
          if(dual||r.amount<0)blockedContexts.add(contextKey(r,acct.id,other.id));
        }
        rs.push(r);
      }catch(e){const label=/^-?\d{1,19}$/.test(String(rawId))?` (حركة ${rawId})`:'';fail(e.message+label);}
    });
    const reciprocal=(x,y)=>!x.dual&&!y.dual&&x.accountObj===y.otherObj&&x.otherObj===y.accountObj&&x.side===-y.side;
    for(const group of strictMap.values()){
      if(group.length===2&&reciprocal(group[0],group[1])){group[0].pair=group[1].id;group[1].pair=group[0].id;}
    }
    const missingByTarget=new Map();
    for(const group of approx.values()){
      const posters=new Set(group.map(r=>r.accountObj.id));
      for(const r of group){
        // Dual and negative rows are posted as recorded. A reciprocal row with
        // the same magnitude or matching ambiguous context also blocks inference.
        if(r.dual||!flagged&&r.amount<0||posters.has(r.otherObj.id)||blockedContexts.has(contextKey(r,r.otherObj.id,r.accountObj.id)))continue;
        if(flagged){
          if(!missingByTarget.has(r.toKey))missingByTarget.set(r.toKey,[]);
          missingByTarget.get(r.toKey).push(r);
        }else{r.incomplete=true;transferExample=sampleR(r);}
      }
    }
    const evidence=new Map();
    if(flagged){
      for(const [k,rs] of missingByTarget){
        if(!flag.confirmed||rs.length!==1)continue;
        const r=rs[0],from=flag.totals.get(r.fromKey),fromCache=flag.cache.get(r.fromKey);
        const to=flag.totals.get(k)||{count:0,sum:0,last:''},toCache=flag.cache.get(k);
        // Complete only a unique link supported by both the balance and row count,
        // with the source account itself matching exactly. Otherwise do not infer.
        if(!from||!fromCache||!toCache||from.sum!==fromCache.sum||from.count!==fromCache.count||from.last!==fromCache.last)continue;
        if(toCache.sum!==to.sum-r.amount||toCache.count!==to.count+1||![to.last,r.id].includes(toCache.last))continue;
        r.incomplete=true;transferExample=sampleR(r);
      }
      for(const c of flag.cache.values())if(a.has(c.account)&&curr.has(c.cur))evidence.set(pairKey(a.get(c.account).id,curr.get(c.cur).code),c.sum);
    }
    return {ledger,rows:rs,stats,dateExample,sideExample,negativeExample,signExample,transferExample,reviewExample,evidence,flagged,
      formatChoice:layout==='auto'&&flag&&!flag.confirmed?flag.sample:null,verifiedFlags:flagged&&flag.confirmed};
  }
  // Column direction maps unsigned magnitudes only; an explicit minus is already
  // the sign of the posting, regardless of which column carried it.
  const signedMinor=(amount,side,inSign)=>amount<0?amount:amount*side*inSign;
  function convert(prepared,{inSign=1, dates='dm', transfers='posted'}={}){
    if(![1,-1].includes(inSign)||!['dm','md'].includes(dates)||!['posted','complete'].includes(transfers))fail('اختيارات الترحيل غير صالحة.');
    const {rows,ledger}=prepared,next={...ledger,entries:[]};
    const minorFor=r=>prepared.flagged?r.amount:signedMinor(r.amount,r.side,inSign);
    const consumed=new Set(), balances=new Map(), delta=new Map(), dualExamples=new Map(), byId=new Map(rows.map(r=>[r.id,r]));
    const tally=(m,acct,code,n)=>{const k=pairKey(acct,code);m.set(k,(m.get(k)||0)+n);};
    const emit=(r,legs,suffix='',created=r.created)=>{
      if(next.entries.length>=maxEntries)fail('تجاوز عدد القيود بعد التحويل الحد المسموح (60,000). لم تتغير البيانات.');
      for(const l of legs)tally(balances,l.account,l.code,l.minor);
      next.entries.push({id:'old-t-'+r.id+suffix,day:r[dates],time:r.time,created,memo:r.memo,photo:'',legs});
    };
    let added=0, paired=0, uncertain=0;
    for(const r of rows){
      if(consumed.has(r.id))continue;
      const {code}=r.cur, account=r.accountObj.id;
      if(r.dual){
        const {inn,out}=r.dual, inMinor=signedMinor(inn,1,inSign), outMinor=signedMinor(out,-1,inSign);
        // Preserve both posted amounts, even if they cancel. A same-account
        // two-leg transfer would be invalid, so emit two standalone entries.
        emit(r,[{account,code,minor:inMinor}],'-in');
        emit(r,[{account,code,minor:outMinor}],'-out');
        const k=pairKey(account,code);
        if(!dualExamples.has(k))dualExamples.set(k,{id:r.id,day:r[dates],inn,out,inMinor,outMinor});
        continue;
      }
      const minor=minorFor(r);
      if(r.incomplete)tally(delta,r.otherObj.id,code,-minor);
      const legs=[{account,code,minor}];
      let created=r.created;
      const other=byId.get(r.pair), otherMinor=other?minorFor(other):0;
      if(other&&minor===-otherMinor){
        consumed.add(other.id);legs.push({account:other.accountObj.id,code,minor:otherMinor});created=Math.max(created,other.created);paired++;
      }else if(transfers==='complete'&&r.incomplete){legs.push({account:r.otherObj.id,code,minor:-minor});added++;}
      else if(r.otherObj&&!r.incomplete)uncertain++;
      legs.sort((x,y)=>x.minor-y.minor);
      emit(r,legs,'',created);
    }
    const checked=L.validate(next), accts=new Map(checked.accounts.map(a=>[a.id,a])), cs=new Map(checked.currencies.map(c=>[c.code,c]));
    const comparisons=[...new Set([...balances.keys(),...delta.keys()])].map(k=>{
      const [account,code]=k.split('|');return {key:k,account:accts.get(account).name,code,currency:cs.get(code).name,minor:balances.get(k)||0,affected:!!delta.get(k),review:account===reviewId,dual:dualExamples.get(k)||null};
    }).sort((a,b)=>Number(b.affected)-Number(a.affected)||Math.abs(b.minor)-Math.abs(a.minor)||a.account.localeCompare(b.account,'ar'));
    let matched=0;
    for(const [k,n] of prepared.evidence)if((balances.get(k)||0)===n)matched++;
    return {checked,comparisons,added,paired,uncertain,evidence:{matched,total:prepared.evidence.size}};
  }
  return {prepare,convert,amount,date};
});
