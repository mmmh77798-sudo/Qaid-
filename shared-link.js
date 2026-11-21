/* Only a bare HTTPS origin is retained for the shared team connection. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QaydSharedLink=api;})(globalThis,()=>{
  'use strict';
  const key='qayd.shared.origin.v1';
  function origin(input){
    const v=String(input??'').trim();let url;
    if(v.length>253||!/^https:\/\//i.test(v)||/[\s\\\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069?#@]/u.test(v)||!/^https:\/\/[^/]+\/?$/i.test(v))throw new Error('أدخل عنوان خادم HTTPS فقط، مثل https://ledger.example.com.');
    try{url=new URL(v);}catch{throw new Error('عنوان الخادم غير صالح.');}
    if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.pathname!=='/'||url.search||url.hash||url.port==='0'||
      !(/^[a-z0-9.-]+$/i.test(url.hostname)||/^\[[0-9a-f:.]+\]$/i.test(url.hostname)))throw new Error('استخدم عنوان HTTPS دون مسار أو بيانات دخول.');
    return url.origin;
  }
  function read(storage){try{return origin(storage.getItem(key));}catch{return '';}}
  function write(storage,value){const checked=origin(value);try{storage.setItem(key,checked);}catch{}return checked;}
  function forget(storage){try{storage.removeItem(key);}catch{}}
  return {origin,read,write,forget};
});
