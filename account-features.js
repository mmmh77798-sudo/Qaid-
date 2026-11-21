/* Pure account action helpers; no platform or persistence side effects. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QaydAccountFeatures=api;})(globalThis,()=>{
  'use strict';
  const kinds={credit:'حركات لي',debit:'حركات عليّ',transfer:'تحويلات',carried:'رصيد مرحّل'};
  const directions={credit:'الرصيد لي',debit:'الرصيد عليّ',both:'الرصيد في الاتجاهين'};
  const compact=s=>String(s??'').replace(/[\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]+|\s+/g,' ').trim();
  const leftToRight=v=>`\u2066${String(v).replace(/[\u061c\u200e\u200f]/g,'')}\u2069`;
  function shortMessage({day,minor,currency,amount,credit='عليك',debit='لك',confirmation=false}){
    // The sign remains attached to the exact ledger value; the word adds recipient context.
    const direction=minor===0?'متوازن':compact(minor>0?credit:debit);
    const value=`${leftToRight(amount)} ${compact(currency)}${direction?` (${direction})`:''}`;
    return confirmation?`يرجى تأكيد رصيدك حتى ${leftToRight(day)}: ${value}. ردّ بـ «موافق» أو اذكر الفرق.`:`رصيدك حتى ${leftToRight(day)}: ${value}.`;
  }
  function movementMessage({business,nameEn,minor,balance,currency,format,credit,debit,transfer=false,intro,ending,stamp,party}){
    const sender=compact(business)||compact(nameEn)||'قيد';
    const label=m=>m>0?(compact(credit)||'عليك'):m<0?(compact(debit)||'لك'):'متوازن';
    const value=m=>`${label(m)} ${leftToRight(format(Math.abs(m)))} ${compact(currency)}`;
    const entry=(transfer?'تحويل: ':'')+value(minor)+(minor<0&&!transfer?' واصل':'');
    return [compact(intro),`إشعار من ${sender}:`,entry,`الإجمالي - ${value(balance)}`,
      stamp?leftToRight(stamp):'',transfer?compact(party):'',compact(ending)].filter(Boolean).join('\n');
  }
  const blank=()=>({query:'',from:'',to:'',kind:'',min:null,max:null,archive:false});
  const hasFilters=f=>Boolean(f.kind||f.min!==null||f.max!==null);
  function includesRow(row,f){
    const kind=row.closed?'carried':row.legs?.length===2?'transfer':row.minor>0?'credit':'debit';
    if(f.kind&&kind!==f.kind)return false;
    const magnitude=Math.abs(row.minor);
    return (f.min===null||magnitude>=f.min)&&(f.max===null||magnitude<=f.max);
  }
  function base64(bytes){
    const parts=[],chunk=24576; // divisible by three: no internal padding
    for(let i=0;i<bytes.length;i+=chunk)parts.push(btoa(String.fromCharCode(...bytes.subarray(i,i+chunk))));
    return parts.join('');
  }
  return {kinds,directions,shortMessage,movementMessage,blank,hasFilters,includesRow,base64};
});
