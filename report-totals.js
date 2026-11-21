/* Report arithmetic operates on exact signed ledger thousandths, never formatted numbers. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QaydTotals=api;})(globalThis,()=>{
  'use strict';
  function activity(rows, amount) {
    let credit=0,debit=0;
    for(const row of rows){const value=amount(row);if(value>0)credit+=value;else if(value<0)debit-=value;}
    return {credit,debit,net:credit-debit};
  }
  function detailAmount(entry,account,code) {
    if(entry.legs.length!==2)return entry.legs[0].minor;
    return account?(entry.legs.find(l=>l.account===account&&l.code===code)?.minor??0):Math.abs(entry.legs[0].minor);
  }
  function details(entries,account,code) {
    return {...activity(entries,e=>!account&&e.legs.length===2?0:detailAmount(e,account,code)),
      note:account?'التحويلات محسوبة بالطرف الخاص بالحساب المختار.':'التحويلات الداخلية معروضة، ولا تدخل في الإجماليات.'};
  }
  function statement({rows,opening,ending,search=false}) {
    let carry=null;
    const totals=activity(rows,r=>{
      if(!r.closed)return r.minor;
      carry=(carry??0)+r.minor;
      return 0;
    });
    return {...totals,opening,carry,ending,note:search?'الإجماليات للحركات المطابقة للبحث والفلاتر؛ الأرصدة تشمل كل الحركات حتى نهاية الفترة.':carry!==null?'الرصيد المرحّل معروض على حدة ولا يدخل في إجمالي الحركات.':''};
  }
  function fields(s) {
    if(Array.isArray(s.fields))return s.fields;
    const account=typeof s.ending==='number';
    const f=[['credit','إجمالي لي',s.credit],['debit','إجمالي عليّ',s.debit],['net',account?'صافي الحركات المعروضة':'الصافي',s.net]];
    if(account){
      f.push(['opening','رصيد البداية',s.opening]);
      if(s.carry!==null)f.push(['carry','الرصيد المرحّل',s.carry]);
      f.push(['ending','الرصيد إلى نهاية الفترة',s.ending]);
    }
    return f;
  }
  return {activity,detailAmount,details,statement,fields};
});
