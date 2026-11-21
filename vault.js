/* A versioned password-protected ledger envelope. Uses only platform Web Crypto. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('node:crypto').webcrypto);else root.Vault=factory(root.crypto);})(globalThis,function(crypto){
  'use strict';
  const tag='qayd-vault', version=1, iterations=310000, max=16*1024*1024;
  const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
  const aad=encoder.encode('Qayd ledger vault/v1');
  function need(){if(!crypto?.subtle)throw new Error('التشفير يحتاج متصفحًا حديثًا أو Android System WebView محدثًا.');}
  const rand=n=>crypto.getRandomValues(new Uint8Array(n));
  const base64=bytes=>{
    const blocks=[];for(let i=0;i<bytes.length;i+=16384)blocks.push(String.fromCharCode(...bytes.subarray(i,i+16384)));
    return btoa(blocks.join(''));
  };
  function bytesOf(s,size,expected=false){
    if(typeof s!=='string'||!s.length||s.length>size*4/3+4||s.length%4||!/^[A-Za-z0-9+/]+={0,2}$/.test(s))throw new Error('بنية ملف التشفير غير صالحة.');
    const a=atob(s);if((expected&&a.length!==size)||a.length>size)throw new Error('طول ملف التشفير غير صالح.');
    return Uint8Array.from(a,c=>c.charCodeAt(0));
  }
  const is=v=>v?.format===tag;
  function inspect(v){
    if(!is(v)||v.version!==version||v.iterations!==iterations)throw new Error('إصدار ملف التشفير غير مدعوم.');
    const salt=bytesOf(v.salt,16,true),iv=bytesOf(v.iv,12,true),ct=bytesOf(v.payload,max);
    if (ct.length<17)throw new Error('ملف التشفير فارغ.');
    return {salt,iv,ct};
  }
  async function derive(password,salt){
    need();if(typeof password!=='string'||password.length<1||password.length>128)throw new Error('أدخل كلمة سر صالحة.');
    const seed=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},seed,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  }
  async function newKey(password){
    need();if(password.length<8||password.length>128||!password.trim())throw new Error('استخدم كلمة سر من 8 إلى 128 حرفًا.');
    const salt=rand(16);return {salt,key:await derive(password,salt)};
  }
  async function lock(input,credentials){
    need();const plain=encoder.encode(JSON.stringify(input));if(plain.length>max-32)throw new Error('حجم الدفتر أكبر من الحد المسموح.');
    const iv=rand(12),ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},credentials.key,plain));
    return {format:tag,version,iterations,salt:base64(credentials.salt),iv:base64(iv),payload:base64(ct)};
  }
  async function unlock(v,password){
    need();const {salt,iv,ct}=inspect(v),key=await derive(password,salt);
    let value;
    try {const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:aad},key,ct); value=JSON.parse(decoder.decode(clear));}
    catch {throw new Error('كلمة السر غير صحيحة أو الملف تالف.');}
    return {value,credentials:{salt,key}};
  }
  return {is,inspect,newKey,lock,unlock};
});
